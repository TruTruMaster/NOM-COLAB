package mx.wack.nom.core.servicio;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;


import mx.wack.nom.core.almacen.RepositorioDocumentos;
import mx.wack.nom.core.crdt.EstadoDocumento;
import mx.wack.nom.core.crdt.MotorCRDT;
import mx.wack.nom.core.crdt.Operacion;
import mx.wack.nom.core.crdt.Registro;
import mx.wack.nom.core.crdt.Secuencia;
import mx.wack.nom.core.modelo.Documento;
import mx.wack.nom.core.modelo.Espacio;
import mx.wack.nom.core.modelo.ModoEditor;
import mx.wack.nom.core.modelo.Permiso;
import mx.wack.nom.core.modelo.Usuario;
import mx.wack.nom.core.modelo.Version;

/** Editor y versiones: CU-18 a CU-23. Diagramas A6 y A7. */
public class ServicioDocumentos {

    private static final Bitacora log = Bitacora.de(ServicioDocumentos.class);
    private static final int MAX_BYTES_ESTADO = 25 * 1024 * 1024;

    private final RepositorioDocumentos repo;
    private final ServicioEspacios espacios;
    private final ServicioCuentas cuentas;
    private final Difusor difusor;
    private final Cifrado cifrado;
    private final Nodo nodo;
    private final Map<String, MotorCRDT> motores = new ConcurrentHashMap<>();
    private final Map<String, Object> candados = new ConcurrentHashMap<>();
    /** Documentos con cambios aun no escritos a disco (se escriben cada ~0.8 s, no en cada tecla). */
    private final java.util.Set<String> sucios = ConcurrentHashMap.newKeySet();
    /** Bitacora: los cambios seguidos de una misma persona se juntan en una sola linea. */
    private final Map<String, Map<String, Object>> rachas = new ConcurrentHashMap<>();
    private static final long RACHA_MS = 60_000;
    /** Pegados ya contados (un pegado puede llegar repartido en varios lotes). */
    private final Map<String, Set<String>> pegadosVistos = new ConcurrentHashMap<>();
    /** Cuota por cuenta en bytes (0 = sin limite, como en la red local). */
    private volatile long cuotaBytes;
    private final Map<String, long[]> usoCache = new ConcurrentHashMap<>();

    public ServicioDocumentos(RepositorioDocumentos repo, ServicioEspacios espacios, ServicioCuentas cuentas,
                              Difusor difusor, Cifrado cifrado, Nodo nodo) {
        this.repo = repo;
        this.espacios = espacios;
        this.cuentas = cuentas;
        this.difusor = difusor;
        this.cifrado = cifrado;
        this.nodo = nodo;
        difusor.alSalirDeDocumento(this::finDeVisita);
    }

    /** 3.4 La visita dura mientras la persona tiene el documento abierto: al salir se anota la hora,
        asi lo que otros escribieron mientras lo veia en vivo no sale como "cambios desde tu visita". */
    void finDeVisita(String docId, String usuarioId) { finDeVisita(docId, usuarioId, null); }

    /** La persona cierra el documento (lo avisa su cliente; el canal puede tardar en caerse). */
    public void salir(Usuario u, String docId, String cliente) {
        Documento d = requerir(docId);
        permiso(u, d, Permiso.LECTURA);
        finDeVisita(docId, u.id, cliente == null || cliente.isBlank() ? null : cliente);
    }

    private void finDeVisita(String docId, String usuarioId, String exceptoCliente) {
        if (repo.porId(docId).isEmpty()) return;
        if (difusor.usuariosEnDocumento(docId, exceptoCliente).contains(usuarioId)) return;   // lo sigue viendo en otra pestaña
        long reloj;
        synchronized (candado(docId)) { reloj = repo.estado(docId).reloj; }
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("t", System.currentTimeMillis());
        v.put("reloj", reloj);
        repo.guardarVisita(docId, usuarioId, v);
    }

    private Object candado(String docId) { return candados.computeIfAbsent(docId, k -> new Object()); }

    private MotorCRDT motor(String docId) { return motores.computeIfAbsent(docId, k -> new MotorCRDT()); }

    private String nodoServidor() { return "srv-" + nodo.id(); }

    private static long num(Object o) { return o instanceof Number n ? n.longValue() : 0; }

    public Documento requerir(String id) {
        Documento d = repo.porId(id).orElseThrow(() -> ErrorNom.noEncontrado("El documento"));
        // 8.5 Lo que esta en la papelera no se abre ni se edita (se restaura desde el espacio).
        if (d.eliminado > 0) throw new ErrorNom(ErrorNom.NO_EXISTE, "Este documento está en la papelera del espacio", null, Map.of("papelera", true));
        return d;
    }

    // ------------------------------------------------------------ permisos (con la fecha de entrega)

    /** Al pasar la fecha limite de una entrega, quien no es el propietario del espacio solo puede leer. */
    private static Permiso efectivo(Permiso p, Documento d) {
        if (p != Permiso.PROPIETARIO && entregaVencida(d)) return Permiso.LECTURA;
        return p;
    }

    private static boolean entregaVencida(Documento d) {
        return d.entregaLimite > 0 && System.currentTimeMillis() >= d.entregaLimite;
    }

    public Permiso permiso(Usuario u, Documento d, Permiso minimo) {
        Espacio e = espacios.requerir(d.espacioId);
        Permiso p = espacios.exigir(e, u, Permiso.LECTURA);
        Permiso ef = efectivo(p, d);
        if (!ef.alMenos(minimo)) {
            if (ef != p) throw new ErrorNom(ErrorNom.PROHIBIDO, "La fecha límite de entrega ya pasó: el documento quedó en solo lectura",
                    null, Map.of("permiso", ef, "entregaLimite", d.entregaLimite));
            espacios.exigir(e, u, minimo);
        }
        return ef;
    }

    public List<Documento> listar(Usuario u, String espacioId) {
        Permiso p = espacios.exigir(espacios.requerir(espacioId), u, Permiso.LECTURA);
        List<Documento> r = new ArrayList<>();
        for (Documento d : repo.delEspacio(espacioId)) if (d.eliminado <= 0) r.add(vistaPara(d, u, p));
        return r;
    }

    /** Sin revisar permisos (para la sincronizacion entre servidores). Sin lo de la papelera. */
    List<Documento> listarInterno(String espacioId) {
        return repo.delEspacio(espacioId).stream().filter(d -> d.eliminado <= 0).toList();
    }

    /**
     * 8.5 Lo que cada persona ve de un documento: solo su propia marca de destacado y, si no es el
     * propietario del espacio, sin el enlace publico ni los recibos de la entrega.
     */
    private static Documento vistaPara(Documento d, Usuario u, Permiso p) {
        Documento c = d.copia();
        c.destacadoPor = d.destacadoPor != null && d.destacadoPor.contains(u.id) ? List.of(u.id) : null;
        if (p != Permiso.PROPIETARIO) { c.enlaceVer = null; c.entregaRecibos = null; }
        return c;
    }

    // ------------------------------------------------------------ cuota por cuenta (en la nube)

    public void fijarCuota(long bytes) { this.cuotaBytes = Math.max(0, bytes); }

    public long cuota() { return cuotaBytes; }

    /** Bytes que ocupan los espacios de una cuenta (documentos y versiones). Se recalcula cada minuto. */
    public long usoDe(String propietarioId) {
        long ahora = System.currentTimeMillis();
        long[] c = usoCache.get(propietarioId);
        if (c != null && ahora - c[1] < 60_000) return c[0];
        long total = 0;
        for (Espacio e : espacios.todos()) {
            if (!propietarioId.equals(e.propietarioId)) continue;
            for (Documento d : repo.delEspacio(e.id)) {
                total += repo.bytesEstado(d.id);
                for (Version v : repo.historial(d.id)) total += v.bytes;
            }
        }
        usoCache.put(propietarioId, new long[] { total, ahora });
        return total;
    }

    private void revisarCuota(Espacio e) {
        if (cuotaBytes <= 0) return;
        if (usoDe(e.propietarioId) >= cuotaBytes)
            throw new ErrorNom(ErrorNom.LLENO, "El propietario del espacio ya usó todo su espacio en la nube ("
                    + (cuotaBytes / (1024 * 1024)) + " MB). Liberen versiones viejas o borren documentos.", null,
                    Map.of("cuota", cuotaBytes));
    }

    // ------------------------------------------------------------ crear y abrir

    /** CU-18 Crear documento (opcionalmente desde una plantilla, que llega como operaciones iniciales). */
    public Documento crear(Usuario u, String espacioId, String nombre, String modo, List<Operacion> iniciales) {
        Espacio e = espacios.requerir(espacioId);
        espacios.exigir(e, u, Permiso.EDICION);
        revisarCuota(e);
        nombre = nombre == null || nombre.isBlank() ? "Documento sin título" : nombre.trim();
        if (nombre.length() > 120) throw ErrorNom.invalido("Máximo 120 caracteres", "nombre");
        ModoEditor m;
        try {
            m = ModoEditor.valueOf((modo == null ? "TEXTO" : modo).toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw ErrorNom.invalido("Modo no válido", "modo");
        }
        long ahora = System.currentTimeMillis();
        Documento d = new Documento();
        d.id = cifrado.id();
        d.espacioId = espacioId;
        d.nombre = nombre;
        d.modo = m;
        d.autorId = u.id;
        d.creado = ahora;
        d.modificado = ahora;
        d.ultimoEditorId = u.id;

        EstadoDocumento est = new EstadoDocumento();
        MotorCRDT mot = motor(d.id);
        String n = nodoServidor();
        Map<String, Object> inicial = new LinkedHashMap<>();
        inicial.put("nombre", nombre);
        inicial.put("modo", m.name());
        inicial.put("paginas", List.of("p1"));
        // 1.4: los documentos de texto nacen con el formato que fijo el propietario del espacio.
        if (m == ModoEditor.TEXTO && e.formatoBase != null && !e.formatoBase.isEmpty()) inicial.put("formato", new LinkedHashMap<>(e.formatoBase));
        mot.fusionar(est, new Operacion(n + ":c1", Operacion.DOC, inicial, 1, n));
        if (iniciales != null) {
            for (Operacion op : iniciales) if (op.valida()) mot.fusionar(est, op);
        }
        sincronizarMeta(d, est);
        repo.guardarEstado(d.id, est);
        repo.guardar(d);
        nuevaVersion(d, est, u, "Creación");
        difusor.avisarEspacio(espacioId, "documentos", Map.of("accion", "creado", "id", d.id));
        return d;
    }

    /** Abre el documento: metadatos, estado completo y permiso con el que se abre (CU-19 paso 1). */
    public Map<String, Object> abrir(Usuario u, String docId) {
        Documento d = requerir(docId);
        Permiso p = permiso(u, d, Permiso.LECTURA);
        Espacio e = espacios.requerir(d.espacioId);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("documento", vistaPara(d, u, p));
        r.put("permiso", p);
        Map<String, Object> esp = new LinkedHashMap<>();
        esp.put("id", e.id);
        esp.put("nombre", e.nombre);
        esp.put("color", e.color);
        esp.put("formatoBase", e.formatoBase);
        esp.put("propietarioId", e.propietarioId);
        esp.put("miPermiso", e.permisoDe(u.id));
        r.put("espacio", esp);
        long reloj;
        synchronized (candado(docId)) {
            EstadoDocumento est = repo.estado(docId);
            r.put("estado", est.copia());
            reloj = est.reloj;
        }
        if (d.entregaLimite > 0) r.put("entrega", entregaInfo(d, p));
        // 3.4: lo que cambiaron otros desde la ultima vez que esta persona lo abrio.
        try {
            Map<String, Map<String, Object>> vs = repo.visitas(docId);
            Map<String, Object> antes = vs.get(u.id);
            if (antes != null) {
                r.put("visita", antes);
                Map<String, Object> c = cambiosDesde(docId, u.id, num(antes.get("t")));
                if (c != null) r.put("cambios", c);
            }
            Map<String, Object> ahora = new LinkedHashMap<>();
            ahora.put("t", System.currentTimeMillis());
            ahora.put("reloj", reloj);
            repo.guardarVisita(docId, u.id, ahora);
        } catch (RuntimeException ex) {
            log.aviso("No se pudo anotar la visita de {}: {}", docId, ex.getMessage());
        }
        return r;
    }

    /** Quien, que bloques y que celdas cambiaron otras personas despues de 'desde'. null si nadie. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> cambiosDesde(String docId, String usuarioId, long desde) {
        cerrarRachas(docId, true);
        Map<String, Map<String, Object>> porPersona = new LinkedHashMap<>();
        Set<String> bloques = new LinkedHashSet<>(), campos = new LinkedHashSet<>(), clientes = new LinkedHashSet<>();
        for (Map<String, Object> a : repo.actividad(docId, 3000)) {
            if (num(a.get("t")) <= desde) break;
            String uid = String.valueOf(a.get("usuarioId"));
            if (uid.equals(usuarioId)) continue;
            Map<String, Object> pm = porPersona.computeIfAbsent(uid, k -> {
                Map<String, Object> x = new LinkedHashMap<>();
                x.put("usuarioId", uid);
                x.put("nombre", a.get("usuario"));
                x.put("color", a.get("color"));
                x.put("escritas", 0L);
                x.put("borradas", 0L);
                x.put("ultima", num(a.get("t")));
                return x;
            });
            pm.put("escritas", num(pm.get("escritas")) + num(a.get("escritas")));
            pm.put("borradas", num(pm.get("borradas")) + num(a.get("borradas")));
            if (a.get("bloques") instanceof List<?> l) for (Object b : l) bloques.add(String.valueOf(b));
            if (a.get("campos") instanceof List<?> l) for (Object c : l) if (String.valueOf(c).startsWith("c:")) campos.add(String.valueOf(c));
            if (a.get("cliente") != null) clientes.add(String.valueOf(a.get("cliente")));
        }
        if (porPersona.isEmpty()) return null;
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("desde", desde);
        r.put("personas", new ArrayList<>(porPersona.values()));
        r.put("bloques", new ArrayList<>(bloques));
        r.put("celdas", new ArrayList<>(campos));
        r.put("clientes", new ArrayList<>(clientes));
        return r;
    }

    // ------------------------------------------------------------ editar

    /** CU-19 / CU-21: integra un lote de operaciones y las difunde a los demas. */
    public Map<String, Object> aplicar(Usuario u, String docId, List<Operacion> ops, String cliente) {
        return aplicar(u, docId, ops, cliente, null);
    }

    public Map<String, Object> aplicar(Usuario u, String docId, List<Operacion> ops, String cliente, String dispositivo) {
        Documento d = requerir(docId);
        Espacio e = espacios.requerir(d.espacioId);
        Permiso base = espacios.exigir(e, u, Permiso.LECTURA);
        Permiso p = efectivo(base, d);
        if (!p.alMenos(Permiso.EDICION)) {
            // CU-26 7a: el permiso cambio a lectura mientras estaba sin conexion (o paso la fecha de entrega).
            boolean entrega = base != p;
            throw new ErrorNom(ErrorNom.PROHIBIDO, entrega ? "La fecha límite de entrega ya pasó; tus cambios no se aplicaron"
                    : "Tu permiso cambió a solo lectura; tus cambios no se aplicaron", null,
                    entrega ? Map.of("permiso", p, "entregaLimite", d.entregaLimite) : Map.of("permiso", p));
        }
        if (ops == null || ops.isEmpty()) return Map.of("aplicadas", 0);
        boolean propietario = p == Permiso.PROPIETARIO;
        List<Operacion> aplicadas = new ArrayList<>();
        List<String[]> conMencion = new ArrayList<>();
        List<String> rechazadas = new ArrayList<>();
        String motivo = null;
        EstadoDocumento est;
        synchronized (candado(docId)) {
            est = repo.estado(docId);
            if (repo.bytesEstado(docId) > 64 * 1024) revisarCuota(e);
            MotorCRDT mot = motor(docId);
            Set<String> descartados = new HashSet<>();
            for (Operacion op : ops) {
                op = sinCambioDeTipo(op);
                if (op == null || !op.valida()) continue;
                // 3.5 y 5.4: partes con dueno y plantilla del maestro. El propietario del espacio siempre puede.
                String no = propietario ? null : candadoDe(u, est, op, descartados);
                if (no != null) {
                    rechazadas.add(op.id());
                    if (motivo == null) motivo = no;
                    if (op.esSecuencia() && "i".equals(op.s().get("k"))) descartados.addAll(Secuencia.idsDe(op.s(), op.t(), op.n()));
                    continue;
                }
                if (!mot.fusionar(est, op).isEmpty()) aplicadas.add(op);
            }
            if (!aplicadas.isEmpty()) {
                if (repo.bytesEstado(docId) > MAX_BYTES_ESTADO)
                    throw ErrorNom.invalido("El documento superó el tamaño máximo (25 MB)", null);
                d.modificado = System.currentTimeMillis();
                d.pendienteVersion = true;
                d.ultimoEditorId = u.id;
                boolean cambioMeta = sincronizarMeta(d, est);
                sucios.add(docId);
                if (cambioMeta) repo.guardar(d);
                anotar(docId, u, cliente, dispositivo, aplicadas);
                conMencion.addAll(comentariosConMencion(est, aplicadas));
                if (cambioMeta) {
                    difusor.avisarEspacio(d.espacioId, "documentos", Map.of("accion", "actualizado", "id", d.id));
                }
            }
        }
        if (!aplicadas.isEmpty()) difusor.ops(docId, Map.of("ops", aplicadas, "cliente", cliente == null ? "" : cliente));
        if (!conMencion.isEmpty()) {
            try { avisarMenciones(u, d, e, conMencion); } catch (RuntimeException ex) { log.aviso("No se pudo avisar una mención en {}: {}", docId, ex.getMessage()); }
        }
        if (rechazadas.isEmpty()) return Map.of("aplicadas", aplicadas.size(), "reloj", est.reloj);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("aplicadas", aplicadas.size());
        r.put("reloj", est.reloj);
        r.put("rechazadas", rechazadas);
        r.put("motivo", motivo);
        return r;
    }

    private String nombreDe(String usuarioId) {
        return cuentas.porId(usuarioId).map(x -> x.nombre).orElse("otra persona");
    }

    /**
     * Por que una persona (que no es el propietario del espacio) no puede aplicar esta operacion,
     * o null si puede. Partes con dueno: bloques y figuras (campo "dueno"), diapositivas
     * ("dueno:" + pagina en _doc) y parrafos del texto (atributo "dueno" de su marca de parrafo).
     * Plantilla del maestro: bloques con "maestro" = true.
     */
    private String candadoDe(Usuario u, EstadoDocumento est, Operacion op, Set<String> descartados) {
        if (op.esSecuencia()) {
            Map<String, Object> s = op.s();
            if ("f".equals(s.get("k")) && s.get("a") instanceof Map<?, ?> a && a.containsKey("dueno"))
                return "Solo el propietario del espacio asigna partes del documento";
            if ("i".equals(s.get("k")) && s.get("iz") != null && descartados.contains(String.valueOf(s.get("iz"))))
                return "Esa parte del documento tiene dueño";
            Secuencia sec = est.seq.get(op.bloque());
            if (sec == null || !sec.tieneDuenos()) return null;
            for (String du : sec.duenos(s)) {
                if (Secuencia.DESCONOCIDO.equals(du)) return "El texto quedó junto a una parte que no existe en el servidor";
                if (!du.equals(u.id)) return "Ese párrafo es de " + nombreDe(du) + ": solo esa persona (o el propietario del espacio) lo cambia";
            }
            return null;
        }
        Map<String, Object> c = op.campos();
        if (Operacion.DOC.equals(op.bloque())) {
            for (String k : c.keySet()) if (k.startsWith("dueno:")) return "Solo el propietario del espacio asigna diapositivas";
            if (c.get("paginas") instanceof List<?> nuevas && est.valor(Operacion.DOC, "paginas") instanceof List<?> viejas) {
                for (Object pg : viejas) {
                    if (nuevas.contains(pg)) continue;
                    Object du = est.valor(Operacion.DOC, "dueno:" + pg);
                    if (du instanceof String ds && !ds.isEmpty() && !ds.equals(u.id)) return "Esa diapositiva es de " + nombreDe(ds) + ": no se puede quitar";
                }
            }
            return null;
        }
        if (c.containsKey("dueno") || c.containsKey("maestro")) return "Solo el propietario del espacio asigna partes o fija la plantilla";
        Object tipo = c.containsKey("tipo") ? c.get("tipo") : est.valor(op.bloque(), "tipo");
        boolean comentario = "comentario".equals(tipo);
        Object du = est.valor(op.bloque(), "dueno");
        if (du instanceof String ds && !ds.isEmpty() && !ds.equals(u.id)) return "Esa parte es de " + nombreDe(ds) + ": solo esa persona (o el propietario del espacio) la cambia";
        if (Boolean.TRUE.equals(est.valor(op.bloque(), "maestro"))) return "Es parte de la plantilla del maestro: solo el propietario del espacio la cambia";
        if (comentario) return null;
        for (Object pg : new Object[] { est.valor(op.bloque(), "pagina"), c.get("pagina") }) {
            if (!(pg instanceof String)) continue;
            Object dp = est.valor(Operacion.DOC, "dueno:" + pg);
            if (dp instanceof String ds && !ds.isEmpty() && !ds.equals(u.id)) return "Esa diapositiva es de " + nombreDe(ds) + ": solo esa persona (o el propietario del espacio) la cambia";
        }
        return null;
    }

    /**
     * El tipo de un documento (texto, hoja, presentacion, diagrama) se fija al crearlo:
     * cambiarlo romperia su formato. Se descarta cualquier intento de cambiar _doc.modo.
     */
    private static Operacion sinCambioDeTipo(Operacion op) {
        if (op == null || !Operacion.DOC.equals(op.bloque()) || op.campos() == null || !op.campos().containsKey("modo")) return op;
        Map<String, Object> campos = new LinkedHashMap<>(op.campos());
        campos.remove("modo");
        return campos.isEmpty() ? null : new Operacion(op.id(), op.bloque(), campos, op.t(), op.n());
    }

    /**
     * Una linea de la bitacora: quien, desde que dispositivo, cuando y que bloques/campos toco.
     * Como el texto viaja letra por letra, los lotes seguidos de la misma persona (menos de
     * 60 s entre uno y otro) se suman en la misma linea: "escribio 240 letras, borro 12".
     * 3.1: tambien separa lo tecleado de lo pegado, y anota cada pegado grande (hora y tamano,
     * nunca el texto).
     */
    @SuppressWarnings("unchecked")
    private void anotar(String docId, Usuario u, String cliente, String dispositivo, List<Operacion> ops) {
        String clave = docId + "|" + u.id + "|" + (cliente == null ? "" : cliente);
        long ahora = System.currentTimeMillis();
        Map<String, Object> m = rachas.get(clave);
        if (m != null && ahora - ((Number) m.get("t")).longValue() > RACHA_MS) {
            rachas.remove(clave);
            repo.anotarActividad(docId, m);
            m = null;
        }
        if (m == null) {
            m = new LinkedHashMap<>();
            m.put("t", ahora);
            m.put("inicio", ahora);
            m.put("usuarioId", u.id);
            m.put("usuario", u.nombre);
            m.put("color", u.color);
            m.put("cliente", cliente == null ? "" : cliente);
            m.put("dispositivo", dispositivo == null || dispositivo.isBlank() ? "Navegador" : dispositivo.length() > 40 ? dispositivo.substring(0, 40) : dispositivo);
            m.put("operaciones", 0);
            m.put("bloques", new java.util.LinkedHashSet<String>());
            m.put("campos", new java.util.LinkedHashSet<String>());
            m.put("escritas", 0);
            m.put("borradas", 0);
            m.put("tecleadas", 0);
            m.put("pegadas", 0);
            m.put("citadas", 0);
            m.put("pegados", new ArrayList<Map<String, Object>>());
            rachas.put(clave, m);
        }
        java.util.Set<String> bloques = (java.util.Set<String>) m.get("bloques"), campos = (java.util.Set<String>) m.get("campos");
        List<Map<String, Object>> pegados = (List<Map<String, Object>>) m.get("pegados");
        Set<String> vistos = pegadosVistos.computeIfAbsent(docId + "|" + u.id, k -> Collections.newSetFromMap(new java.util.LinkedHashMap<String, Boolean>() {
            @Override protected boolean removeEldestEntry(Map.Entry<String, Boolean> x) { return size() > 300; }
        }));
        int escritas = ((Number) m.get("escritas")).intValue(), borradas = ((Number) m.get("borradas")).intValue();
        int tecleadas = ((Number) m.get("tecleadas")).intValue(), pegadas = ((Number) m.get("pegadas")).intValue();
        int citadas = m.get("citadas") instanceof Number cn ? cn.intValue() : 0;
        for (Operacion op : ops) {
            if (bloques.size() < 12) bloques.add(op.bloque());
            boolean pego = op.pegada(), cito = op.citada(), reacomodo = op.reacomodo();
            if (pego && op.m().get("g") != null) {
                String g = String.valueOf(op.m().get("g"));
                synchronized (vistos) {
                    if (vistos.add(g) && num(op.m().get("gn")) > 40 && pegados.size() < 500) {
                        Map<String, Object> pg = new LinkedHashMap<>();
                        pg.put("t", ahora);
                        pg.put("letras", num(op.m().get("gn")));
                        pegados.add(pg);
                    }
                }
            }
            if (op.esSecuencia()) {
                campos.add("texto");
                Object k = op.s().get("k");
                if ("i".equals(k) && op.s().get("x") instanceof String x) {
                    int n = x.codePointCount(0, x.length());
                    escritas += n;
                    if (cito) citadas += n; else if (pego) pegadas += n; else tecleadas += n;
                } else if ("v".equals(k) && Boolean.FALSE.equals(op.s().get("v")) && op.s().get("r") instanceof List<?> r) {
                    for (Object o : r) if (o instanceof List<?> rango && rango.size() == 3 && rango.get(1) instanceof Number a && rango.get(2) instanceof Number b) borradas += (int) (b.longValue() - a.longValue() + 1);
                } else if ("f".equals(k)) campos.add("formato");
                continue;
            }
            for (var c : op.campos().entrySet()) {
                if (campos.size() < 12) campos.add(c.getKey());
                // Celdas: lo escrito tambien se separa en tecleado y pegado (no cuenta como "letras").
                // Lo que solo se reacomoda (insertar filas, ordenar) no se escribió de nuevo: no cuenta.
                if (!reacomodo && c.getKey().startsWith("c:") && c.getValue() instanceof String v && !v.isEmpty()) {
                    int n = v.codePointCount(0, v.length());
                    if (cito) citadas += n; else if (pego) pegadas += n; else tecleadas += n;
                }
            }
        }
        m.put("t", ahora);
        m.put("operaciones", ((Number) m.get("operaciones")).intValue() + ops.size());
        m.put("escritas", escritas);
        m.put("borradas", borradas);
        m.put("tecleadas", tecleadas);
        m.put("pegadas", pegadas);
        m.put("citadas", citadas);
    }

    /** Escribe a disco las rachas de la bitacora que ya terminaron (o todas). */
    private void cerrarRachas(String soloDoc, boolean todas) {
        long ahora = System.currentTimeMillis();
        for (var e : new ArrayList<>(rachas.entrySet())) {
            if (soloDoc != null && !e.getKey().startsWith(soloDoc + "|")) continue;
            if (!todas && ahora - ((Number) e.getValue().get("t")).longValue() < 20_000) continue;
            if (rachas.remove(e.getKey(), e.getValue())) repo.anotarActividad(e.getKey().substring(0, e.getKey().indexOf('|')), e.getValue());
        }
    }

    /** Persistencia diferida: el estado vive en memoria y se escribe a disco como mucho cada 0.8 s. */
    /** Cada ~0.8 s. */
    public void persistir() {
        for (String id : new ArrayList<>(sucios)) {
            sucios.remove(id);
            if (repo.porId(id).isEmpty()) continue;
            synchronized (candado(id)) {
                repo.guardarEstado(id, repo.estado(id));
                repo.porId(id).ifPresent(repo::guardar);
            }
        }
    }

    /** Cada 10 s. */
    public void escribirBitacora() { cerrarRachas(null, false); }

    /** Al apagar el servidor: escribe lo pendiente. */
    public void alApagar() {
        persistir();
        cerrarRachas(null, true);
    }

    public List<Map<String, Object>> actividad(Usuario u, String docId) {
        Documento d = requerir(docId);
        permiso(u, d, Permiso.LECTURA);
        cerrarRachas(docId, true);
        return repo.actividad(docId, 300);
    }

    /** Copia el nombre del bloque _doc a los metadatos (el tipo es fijo desde que se crea). */
    private boolean sincronizarMeta(Documento d, EstadoDocumento est) {
        boolean cambio = false;
        Object nombre = est.valor(Operacion.DOC, "nombre");
        if (nombre instanceof String s && !s.isBlank() && !s.equals(d.nombre)) {
            d.nombre = s.length() > 120 ? s.substring(0, 120) : s;
            cambio = true;
        }
        Object modo = d.modo == null ? est.valor(Operacion.DOC, "modo") : null;
        if (modo instanceof String s) {
            try {
                ModoEditor m = ModoEditor.valueOf(s);
                if (m != d.modo) {
                    d.modo = m;
                    cambio = true;
                }
            } catch (IllegalArgumentException ignorado) { }
        }
        return cambio;
    }

    public void eliminar(Usuario u, String docId) {
        Documento d = requerir(docId);
        permiso(u, d, Permiso.EDICION);
        if (d.protegido)
            throw new ErrorNom(ErrorNom.CONFLICTO, "Este documento está protegido contra el borrado. Quita la protección para borrarlo.", null, Map.of("protegido", true));
        // 8.5 Va a la papelera del espacio: se puede restaurar durante 30 dias.
        d.eliminado = System.currentTimeMillis();
        d.eliminadoPor = u.nombre;
        repo.guardar(d);
        difusor.avisarDocumento(docId, "eliminado", Map.of("por", u.nombre, "papelera", true));
        difusor.avisarEspacio(d.espacioId, "documentos", Map.of("accion", "eliminado", "id", d.id));
    }

    // ------------------------------------------------------------ 1.2 proteger contra el borrado

    /** Solo el propietario del espacio pone o quita la marca; para quitarla hay que escribir BORRAR. */
    public Documento proteger(Usuario u, String docId, boolean protegido, String confirmacion) {
        Documento d = requerir(docId);
        permiso(u, d, Permiso.PROPIETARIO);
        if (!protegido && d.protegido && !"BORRAR".equals(confirmacion == null ? "" : confirmacion.trim().toUpperCase(Locale.ROOT)))
            throw ErrorNom.invalido("Escribe BORRAR para quitar la protección", "confirmacion");
        d.protegido = protegido;
        repo.guardar(d);
        difusor.avisarEspacio(d.espacioId, "documentos", Map.of("accion", "actualizado", "id", d.id));
        difusor.avisarDocumento(docId, "documento", Map.of("protegido", protegido));
        return d;
    }

    // ------------------------------------------------------------ 3.6 entrega con fecha limite

    private Map<String, Object> entregaInfo(Documento d, Permiso p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("limite", d.entregaLimite);
        m.put("vencida", entregaVencida(d));
        m.put("cerrada", d.entregaCerrada);
        if (p == Permiso.PROPIETARIO) m.put("recibos", d.entregaRecibos == null ? List.of() : d.entregaRecibos);
        return m;
    }

    /** El propietario del espacio fija (o quita, con limite 0) la fecha limite de entrega. */
    public Map<String, Object> fijarEntrega(Usuario u, String docId, long limite) {
        Documento d = requerir(docId);
        Permiso p = permiso(u, d, Permiso.PROPIETARIO);
        long ahora = System.currentTimeMillis();
        if (limite != 0 && limite < ahora + 60_000) throw ErrorNom.invalido("La fecha límite tiene que ser en el futuro", "limite");
        if (limite != 0 && limite > ahora + 366L * 86_400_000L) throw ErrorNom.invalido("La fecha límite es de máximo un año", "limite");
        d.entregaLimite = limite;
        d.entregaCerrada = false;
        repo.guardar(d);
        difusor.avisarDocumento(docId, "entrega", Map.of("limite", limite));
        difusor.avisarEspacio(d.espacioId, "documentos", Map.of("accion", "actualizado", "id", d.id));
        return entregaInfo(d, p);
    }

    /** Al pasar la fecha: version final y un recibo de cada persona que trabajo en el documento. */
    private void cerrarEntrega(Documento d) {
        synchronized (candado(d.id)) {
            if (d.entregaCerrada || !entregaVencida(d)) return;
            Usuario duenio = cuentas.porId(espacios.requerir(d.espacioId).propietarioId).orElse(null);
            nuevaVersion(d, repo.estado(d.id), duenio, "Entrega (fecha límite)");
        }
        cerrarRachas(d.id, true);
        Set<String> personas = new LinkedHashSet<>();
        for (Map<String, Object> a : repo.actividad(d.id, 100_000)) if (a.get("usuarioId") != null) personas.add(String.valueOf(a.get("usuarioId")));
        String duenio = espacios.requerir(d.espacioId).propietarioId;
        List<Map<String, Object>> recibos = new ArrayList<>();
        for (String uid : personas) {
            if (uid.equals(duenio)) continue;
            Map<String, Object> r = construirRecibo(d, uid);
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("usuarioId", uid);
            x.put("usuario", ((Map<?, ?>) r.get("persona")).get("nombre"));
            x.put("hash", r.get("hash"));
            x.put("generado", r.get("generado"));
            x.put("recibo", r);
            recibos.add(x);
        }
        d.entregaRecibos = recibos;
        d.entregaCerrada = true;
        repo.guardar(d);
        difusor.avisarDocumento(d.id, "entrega", Map.of("limite", d.entregaLimite, "cerrada", true));
        difusor.avisarEspacio(d.espacioId, "documentos", Map.of("accion", "actualizado", "id", d.id));
        log.info("Entrega cerrada: {} ({} recibos)", d.nombre, recibos.size());
    }

    /** Cada minuto (con el autoguardado): cierra las entregas cuya fecha ya paso. */
    public void revisarEntregas() {
        for (Espacio e : espacios.todos()) {
            for (Documento d : repo.delEspacio(e.id)) {
                if (d.eliminado <= 0 && d.entregaLimite > 0 && !d.entregaCerrada && entregaVencida(d)) {
                    try { cerrarEntrega(d); } catch (RuntimeException ex) { log.error("No se pudo cerrar la entrega " + d.id, ex); }
                }
            }
        }
    }

    // ------------------------------------------------------------ versiones (CU-23)

    public List<Version> historial(Usuario u, String docId) {
        Documento d = requerir(docId);
        permiso(u, d, Permiso.LECTURA);
        List<Version> h = new ArrayList<>(repo.historial(docId));
        java.util.Collections.reverse(h);
        return h;
    }

    public Map<String, Map<String, Object>> foto(Usuario u, String docId, int numero) {
        Documento d = requerir(docId);
        permiso(u, d, Permiso.LECTURA);
        Map<String, Map<String, Object>> f = repo.fotoVersion(docId, numero);
        if (f == null) throw ErrorNom.noEncontrado("La versión " + numero);
        return f;
    }

    public Version guardarVersion(Usuario u, String docId, String etiqueta) {
        Documento d = requerir(docId);
        permiso(u, d, Permiso.EDICION);
        synchronized (candado(docId)) {
            return nuevaVersion(d, repo.estado(docId), u, etiqueta == null || etiqueta.isBlank() ? "Guardado manual" : etiqueta.trim());
        }
    }

    /** ¿Alguna parte tiene dueno o es plantilla del maestro? */
    private static boolean tieneCandados(EstadoDocumento est) {
        for (var b : est.bloques.entrySet()) {
            for (var c : b.getValue().entrySet()) {
                Object v = c.getValue().v;
                if (("dueno".equals(c.getKey()) || c.getKey().startsWith("dueno:")) && v instanceof String s && !s.isEmpty()) return true;
                if ("maestro".equals(c.getKey()) && Boolean.TRUE.equals(v)) return true;
            }
        }
        for (Secuencia s : est.seq.values()) if (s.tieneDuenos()) return true;
        return false;
    }

    /** Restaura como version NUEVA; las intermedias se conservan. */
    public Version restaurar(Usuario u, String docId, int numero) {
        Documento d = requerir(docId);
        Permiso p = permiso(u, d, Permiso.LECTURA);
        if (!p.alMenos(Permiso.EDICION))
            throw ErrorNom.prohibido("Solo puedes consultar versiones");
        Map<String, Map<String, Object>> f = repo.fotoVersion(docId, numero);
        if (f == null) throw ErrorNom.noEncontrado("La versión " + numero);
        List<Operacion> ops;
        Version v;
        synchronized (candado(docId)) {
            EstadoDocumento est = repo.estado(docId);
            // Restaurar cambiaria tambien las partes de los demas: con partes asignadas, solo el propietario.
            if (p != Permiso.PROPIETARIO && tieneCandados(est))
                throw ErrorNom.prohibido("Este documento tiene partes asignadas: solo el propietario del espacio restaura versiones");
            MotorCRDT mot = motor(docId);
            ops = mot.restaurar(est, f, nodoServidor());
            for (Operacion op : ops) mot.fusionar(est, op);
            d.modificado = System.currentTimeMillis();
            d.ultimoEditorId = u.id;
            sincronizarMeta(d, est);
            repo.guardarEstado(docId, est);
            repo.guardar(d);
            v = nuevaVersion(d, est, u, "Restaurada desde la versión " + numero);
        }
        difusor.ops(docId, Map.of("ops", ops, "cliente", "servidor"));
        difusor.avisarDocumento(docId, "version", Map.of("numero", v.numero, "desde", numero, "autor", u.nombre));
        return v;
    }

    private Version nuevaVersion(Documento d, EstadoDocumento est, Usuario autor, String etiqueta) {
        Version v = new Version();
        v.numero = d.version + 1;
        v.fecha = System.currentTimeMillis();
        v.autorId = autor == null ? null : autor.id;
        v.autorNombre = autor == null ? "Autoguardado" : autor.nombre;
        v.etiqueta = etiqueta;
        Map<String, Map<String, Object>> foto = est.foto();
        v.bloques = (int) Math.max(0, foto.keySet().stream().filter(k -> !k.startsWith(EstadoDocumento.SEQ)).count() - 1);
        v.letras = est.seq.values().stream().mapToInt(Secuencia::visibles).sum();
        repo.guardarVersion(d.id, v, foto);
        d.version = v.numero;
        d.pendienteVersion = false;
        d.ultimaVersion = v.fecha;
        repo.guardar(d);
        String duenio = espacios.requerir(d.espacioId).propietarioId;
        int conservar = cuentas.porId(duenio).map(x -> x.preferencias.versionesConservar).orElse(30);
        repo.depurar(d.id, conservar);
        return v;
    }

    /** Autoguardado: crea version de los documentos con cambios cada N minutos (preferencia del autor del ultimo cambio). */
    /** Cada minuto. */
    public void autoguardar() {
        long ahora = System.currentTimeMillis();
        for (String id : new ArrayList<>(motores.keySet())) {
            repo.porId(id).ifPresent(d -> {
                if (!d.pendienteVersion || d.eliminado > 0) return;
                int min = cuentas.porId(d.ultimoEditorId == null ? d.autorId : d.ultimoEditorId)
                        .map(x -> x.preferencias.autoguardadoMin).orElse(5);
                if (ahora - d.ultimaVersion < min * 60_000L) return;
                synchronized (candado(id)) {
                    Usuario autor = cuentas.porId(d.ultimoEditorId).orElse(null);
                    nuevaVersion(d, repo.estado(id), autor, "Autoguardado");
                }
                difusor.avisarDocumento(id, "guardado", Map.of("numero", d.version, "auto", true));
                log.detalle("Autoguardado {} v{}", d.nombre, d.version);
            });
        }
        revisarEntregas();
        try { depurarPapelera(); } catch (RuntimeException ex) { log.error("No se pudo vaciar la papelera vencida", ex); }
        proyecciones.values().removeIf(p -> ahora - p.visto > 8 * 3_600_000L);
    }

    // ------------------------------------------------------------ 3.2 recibo de proceso de escritura

    /** Lineas de la bitacora de una persona, de la mas vieja a la mas nueva. */
    private List<Map<String, Object>> actividadDe(String docId, String usuarioId) {
        cerrarRachas(docId, true);
        List<Map<String, Object>> l = new ArrayList<>();
        for (Map<String, Object> a : repo.actividad(docId, 200_000)) if (usuarioId.equals(String.valueOf(a.get("usuarioId")))) l.add(a);
        Collections.reverse(l);
        return l;
    }

    /**
     * El recibo: sesiones (inicio, fin, minutos activos, dispositivo), letras tecleadas contra
     * pegadas, pegados grandes (hora y tamano, nunca el texto), versiones y la huella SHA-256 de
     * todo eso. Se guarda la huella para poder comprobar despues que el recibo es autentico.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> construirRecibo(Documento d, String usuarioId) {
        Usuario persona = cuentas.porId(usuarioId).orElse(null);
        List<Map<String, Object>> act = actividadDe(d.id, usuarioId);
        List<Map<String, Object>> sesiones = new ArrayList<>();
        List<Map<String, Object>> grandes = new ArrayList<>();
        Map<String, Object> s = null;
        long tTotalMs = 0, tec = 0, peg = 0, cit = 0, bor = 0, opsN = 0, primera = 0, ultima = 0;
        String nombre = persona != null ? persona.nombre : null;
        for (Map<String, Object> a : act) {
            long fin = num(a.get("t")), ini = a.get("inicio") != null ? num(a.get("inicio")) : fin;
            if (nombre == null && a.get("usuario") != null) nombre = String.valueOf(a.get("usuario"));
            long dur = Math.max(5_000, fin - ini);
            String disp = String.valueOf(a.getOrDefault("dispositivo", "Navegador"));
            long t1 = num(a.get("tecleadas")), p1 = num(a.get("pegadas")), c1 = num(a.get("citadas")), b1 = num(a.get("borradas"));
            // Lineas viejas (antes de separar tecleado y pegado): todo lo escrito cuenta como tecleado.
            if (a.get("tecleadas") == null && a.get("pegadas") == null) t1 = num(a.get("escritas"));
            if (s != null && ini - num(s.get("fin")) <= 15 * 60_000L && disp.equals(s.get("dispositivo"))) {
                s.put("fin", Math.max(num(s.get("fin")), fin));
                s.put("ms", num(s.get("ms")) + dur);
            } else {
                s = new LinkedHashMap<>();
                s.put("inicio", ini);
                s.put("fin", fin);
                s.put("ms", dur);
                s.put("dispositivo", disp);
                s.put("letrasTecleadas", 0L);
                s.put("letrasPegadas", 0L);
                s.put("letrasCitadas", 0L);
                s.put("letrasBorradas", 0L);
                sesiones.add(s);
            }
            s.put("letrasTecleadas", num(s.get("letrasTecleadas")) + t1);
            s.put("letrasPegadas", num(s.get("letrasPegadas")) + p1);
            s.put("letrasCitadas", num(s.get("letrasCitadas")) + c1);
            s.put("letrasBorradas", num(s.get("letrasBorradas")) + b1);
            if (a.get("pegados") instanceof List<?> pl) for (Object o : pl) if (o instanceof Map<?, ?> pm) {
                Map<String, Object> g = new LinkedHashMap<>();
                g.put("t", num(pm.get("t")));
                g.put("letras", num(pm.get("letras")));
                grandes.add(g);
            }
            tTotalMs += dur; tec += t1; peg += p1; cit += c1; bor += b1; opsN += num(a.get("operaciones"));
            if (primera == 0) primera = ini;
            ultima = Math.max(ultima, fin);
        }
        for (Map<String, Object> x : sesiones) x.put("minutosActivos", Math.max(1, Math.round(num(x.remove("ms")) / 60_000.0)));
        List<Version> vs = repo.historial(d.id);
        long suyas = vs.stream().filter(v -> usuarioId.equals(v.autorId)).count();
        Espacio e = espacios.requerir(d.espacioId);

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("recibo", "NOM-COLAB · Recibo de proceso de escritura");
        r.put("formato", 2);
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("id", d.id);
        doc.put("nombre", d.nombre);
        doc.put("tipo", d.modo == null ? "TEXTO" : d.modo.name());
        doc.put("espacio", e.nombre);
        r.put("documento", doc);
        Map<String, Object> per = new LinkedHashMap<>();
        per.put("id", usuarioId);
        per.put("nombre", nombre == null ? "?" : nombre);
        r.put("persona", per);
        r.put("servidor", nodo.equipo());
        r.put("generado", System.currentTimeMillis());
        r.put("primeraActividad", primera);
        r.put("ultimaActividad", ultima);
        r.put("sesiones", sesiones);
        Map<String, Object> tot = new LinkedHashMap<>();
        tot.put("sesiones", (long) sesiones.size());
        tot.put("minutosActivos", sesiones.stream().mapToLong(x -> num(x.get("minutosActivos"))).sum());
        tot.put("letrasTecleadas", tec);
        tot.put("letrasPegadas", peg);
        // Fase 9: citas textuales insertadas con su fuente (no son ni tecleado ni pegado sin fuente).
        tot.put("letrasCitadas", cit);
        tot.put("letrasBorradas", bor);
        tot.put("operaciones", opsN);
        tot.put("pegadosGrandes", (long) grandes.size());
        tot.put("porcentajeTecleado", tec + peg + cit == 0 ? 100L : Math.round(tec * 100.0 / (tec + peg + cit)));
        tot.put("porcentajeCitado", tec + peg + cit == 0 ? 0L : Math.round(cit * 100.0 / (tec + peg + cit)));
        r.put("totales", tot);
        r.put("pegadosGrandes", grandes);
        Map<String, Object> ver = new LinkedHashMap<>();
        ver.put("total", (long) vs.size());
        ver.put("guardadasPorLaPersona", suyas);
        ver.put("ultima", (long) d.version);
        r.put("versiones", ver);
        String h = Huella.sha256(r);
        r.put("hash", h);
        Map<String, Object> reg = new LinkedHashMap<>();
        reg.put("documentoId", d.id);
        reg.put("usuarioId", usuarioId);
        reg.put("generado", r.get("generado"));
        reg.put("documento", d.nombre);
        reg.put("persona", per.get("nombre"));
        repo.guardarRecibo(h, reg);
        return r;
    }

    /** La persona ve su propio recibo; el propietario del espacio, el de cualquiera. */
    public Map<String, Object> recibo(Usuario u, String docId, String usuarioId) {
        Documento d = requerir(docId);
        Espacio e = espacios.requerir(d.espacioId);
        Permiso p = espacios.exigir(e, u, Permiso.LECTURA);
        String quien = usuarioId == null || usuarioId.isBlank() ? u.id : usuarioId;
        if (!quien.equals(u.id) && p != Permiso.PROPIETARIO)
            throw ErrorNom.prohibido("Solo el propietario del espacio ve el recibo de otras personas");
        return construirRecibo(d, quien);
    }

    /** Publico: ¿este recibo lo emitio este servidor y nadie lo cambio? */
    public Map<String, Object> verificarRecibo(Map<String, Object> recibo) {
        if (recibo == null || !(recibo.get("hash") instanceof String h)) throw ErrorNom.invalido("Ese archivo no es un recibo de NOM-COLAB", null);
        Map<String, Object> sin = new LinkedHashMap<>(recibo);
        sin.remove("hash");
        String calculado = Huella.sha256(sin);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("hash", h);
        if (!calculado.equals(h)) {
            r.put("valido", false);
            r.put("motivo", "El contenido no coincide con su huella: el recibo fue modificado después de emitirse.");
            return r;
        }
        Map<String, Object> reg = repo.recibo(h);
        if (reg == null) {
            r.put("valido", false);
            r.put("motivo", "Este servidor no emitió ese recibo (o se emitió en otro servidor).");
            return r;
        }
        r.put("valido", true);
        r.put("emitido", reg.get("generado"));
        r.put("documento", reg.get("documento"));
        r.put("persona", reg.get("persona"));
        r.put("servidor", nodo.equipo());
        return r;
    }

    // ------------------------------------------------------------ 3.3 mapa de aportes

    /** Cuanto aporto cada persona (de la bitacora) y cuanto de su texto sigue en el documento. */
    public Map<String, Object> aportes(Usuario u, String docId) {
        Documento d = requerir(docId);
        permiso(u, d, Permiso.LECTURA);
        cerrarRachas(docId, true);
        Map<String, Map<String, Object>> per = new LinkedHashMap<>();
        Map<String, String> nodoUsuario = new HashMap<>();
        List<Map<String, Object>> act = repo.actividad(docId, 200_000);
        Collections.reverse(act);
        for (Map<String, Object> a : act) {
            String uid = String.valueOf(a.get("usuarioId"));
            Map<String, Object> m = per.computeIfAbsent(uid, k -> {
                Map<String, Object> x = new LinkedHashMap<>();
                x.put("usuarioId", uid);
                for (String c : new String[] { "escritas", "borradas", "tecleadas", "pegadas", "operaciones", "minutos", "enDocumento" }) x.put(c, 0L);
                return x;
            });
            m.put("usuario", a.get("usuario"));
            m.put("color", a.get("color"));
            for (String c : new String[] { "escritas", "borradas", "tecleadas", "pegadas", "operaciones" }) m.put(c, num(m.get(c)) + num(a.get(c)));
            if (a.get("tecleadas") == null && a.get("pegadas") == null) m.put("tecleadas", num(m.get("tecleadas")) + num(a.get("escritas")));
            long fin = num(a.get("t")), ini = a.get("inicio") != null ? num(a.get("inicio")) : fin;
            m.put("ms", num(m.get("ms")) + Math.max(5_000, fin - ini));
            m.put("ultima", fin);
            if (a.get("cliente") != null && !"".equals(a.get("cliente"))) nodoUsuario.put(String.valueOf(a.get("cliente")), uid);
        }
        long total = 0, sinAutor = 0;
        EstadoDocumento est;
        synchronized (candado(docId)) { est = repo.estado(docId); }
        for (Secuencia s : est.seq.values()) {
            for (var c : s.caracteres().entrySet()) {
                if (Secuencia.FIN.equals(c.getKey()) || !c.getValue().visible()) continue;
                total++;
                String n = c.getKey().substring(c.getKey().indexOf('@') + 1);
                String uid = nodoUsuario.get(n);
                Map<String, Object> m = uid == null ? null : per.get(uid);
                if (m == null) sinAutor++; else m.put("enDocumento", num(m.get("enDocumento")) + 1);
            }
        }
        List<Map<String, Object>> l = new ArrayList<>(per.values());
        for (Map<String, Object> m : l) m.put("minutos", Math.max(1, Math.round(num(m.remove("ms")) / 60_000.0)));
        l.sort((a, b) -> Long.compare(num(b.get("enDocumento")) * 4 + num(b.get("escritas")), num(a.get("enDocumento")) * 4 + num(a.get("escritas"))));
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("personas", l);
        r.put("letrasEnDocumento", total);
        r.put("sinAutor", sinAutor);
        return r;
    }

    // ------------------------------------------------------------ 5.5 presentar en otra pantalla

    private static final class Proyeccion {
        final String codigo, docId, espacioId, usuarioId;
        volatile String pagina;
        volatile int paso;
        volatile Map<String, Object> marcas;
        volatile long visto = System.currentTimeMillis();

        Proyeccion(String codigo, String docId, String espacioId, String usuarioId) {
            this.codigo = codigo; this.docId = docId; this.espacioId = espacioId; this.usuarioId = usuarioId;
        }
    }

    private final Map<String, Proyeccion> proyecciones = new ConcurrentHashMap<>();

    private Proyeccion proyeccionDe(String docId, String usuarioId) {
        for (Proyeccion p : proyecciones.values()) if (p.docId.equals(docId) && p.usuarioId.equals(usuarioId)) return p;
        return null;
    }

    private static Map<String, Object> estadoProyeccion(Proyeccion p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("codigo", p.codigo);
        m.put("pagina", p.pagina);
        m.put("paso", p.paso);
        if (p.marcas != null) m.put("marcas", p.marcas);
        return m;
    }

    /** Quien presenta pide un codigo: el proyector (otro navegador) lo abre sin iniciar sesion. */
    public synchronized Map<String, Object> iniciarProyeccion(Usuario u, String docId) {
        Documento d = requerir(docId);
        permiso(u, d, Permiso.LECTURA);
        Proyeccion p = proyeccionDe(docId, u.id);
        if (p == null) {
            String c;
            do { c = cuentas.codigo(6); } while (proyecciones.containsKey(c));
            p = new Proyeccion(c, docId, d.espacioId, u.id);
            proyecciones.put(c, p);
        }
        p.visto = System.currentTimeMillis();
        return estadoProyeccion(p);
    }

    public Map<String, Object> moverProyeccion(Usuario u, String docId, String pagina, int paso) {
        Proyeccion p = proyeccionDe(docId, u.id);
        if (p == null) { iniciarProyeccion(u, docId); p = proyeccionDe(docId, u.id); }
        boolean otra = pagina != null && !pagina.equals(p.pagina);
        p.pagina = pagina;
        p.paso = Math.max(0, paso);
        p.visto = System.currentTimeMillis();
        if (otra) p.marcas = null;   // los trazos de la pluma son de cada diapositiva
        difusor.avisarProyectores(p.codigo, "diapositiva", estadoProyeccion(p));
        return estadoProyeccion(p);
    }

    /**
     * 8.3 Puntero láser y pluma: se reenvían a los proyectores (no se guardan en el documento).
     * marcas = { puntero: { x, y } | null, trazos: [[x, y, x, y, …], …], color }. Con tope de tamaño.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> marcarProyeccion(Usuario u, String docId, Map<String, Object> marcas) {
        Proyeccion p = proyeccionDe(docId, u.id);
        if (p == null) throw new ErrorNom(ErrorNom.NO_EXISTE, "No estás presentando este documento en otra pantalla");
        Map<String, Object> m = new LinkedHashMap<>();
        Object pu = marcas == null ? null : marcas.get("puntero");
        if (pu instanceof Map<?, ?> pm && pm.get("x") instanceof Number x && pm.get("y") instanceof Number y)
            m.put("puntero", Map.of("x", x.doubleValue(), "y", y.doubleValue()));
        List<List<Double>> trazos = new ArrayList<>();
        if (marcas != null && marcas.get("trazos") instanceof List<?> l) {
            for (Object t : l) {
                if (trazos.size() >= 60) break;
                if (!(t instanceof List<?> pts)) continue;
                List<Double> tr = new ArrayList<>();
                for (Object v : pts) { if (tr.size() >= 800) break; if (v instanceof Number n) tr.add(Math.round(n.doubleValue() * 10) / 10.0); }
                if (tr.size() >= 2) trazos.add(tr);
            }
        }
        m.put("trazos", trazos);
        Object color = marcas == null ? null : marcas.get("color");
        m.put("color", color instanceof String c && c.matches("#[0-9a-fA-F]{6}") ? c : "#F2385A");
        p.marcas = m;
        p.visto = System.currentTimeMillis();
        difusor.avisarProyectores(p.codigo, "marcas", m);
        return Map.of("ok", true);
    }

    public void terminarProyeccion(Usuario u, String docId) {
        Proyeccion p = proyeccionDe(docId, u.id);
        if (p == null) return;
        proyecciones.remove(p.codigo);
        difusor.avisarProyectores(p.codigo, "fin", Map.of("ok", true));
    }

    private Proyeccion proyeccionVigente(String codigo) {
        Proyeccion p = codigo == null ? null : proyecciones.get(codigo.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", ""));
        if (p == null || repo.porId(p.docId).isEmpty()) throw new ErrorNom(ErrorNom.NO_EXISTE, "Ese código no corresponde a ninguna presentación activa");
        return p;
    }

    /** Publico (con el codigo): la presentacion y en que diapositiva va. */
    public Map<String, Object> verProyeccion(String codigo) {
        Proyeccion p = proyeccionVigente(codigo);
        Documento d = requerir(p.docId);
        Map<String, Object> r = new LinkedHashMap<>(estadoProyeccion(p));
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("id", d.id);
        doc.put("nombre", d.nombre);
        doc.put("modo", d.modo);
        r.put("documento", doc);
        synchronized (candado(d.id)) { r.put("estado", repo.estado(d.id).copia()); }
        return r;
    }

    public void suscribirProyeccion(String codigo, Canal canal) {
        Proyeccion p = proyeccionVigente(codigo);
        difusor.suscribirProyector(p.espacioId, p.docId, p.codigo, canal);
        try { canal.enviar("diapositiva", estadoProyeccion(p)); } catch (java.io.IOException ignorado) { }
    }

    // ------------------------------------------------------------ 8.5 papelera

    /** Dias que un documento pasa en la papelera antes de borrarse solo. */
    public static final int DIAS_PAPELERA = 30;
    private static final long DIA = 86_400_000L;
    private volatile long ultimaDepuracion;

    private Documento requerirEnPapelera(String id) {
        Documento d = repo.porId(id).orElseThrow(() -> ErrorNom.noEncontrado("El documento"));
        if (d.eliminado <= 0) throw new ErrorNom(ErrorNom.CONFLICTO, "Ese documento no está en la papelera");
        return d;
    }

    /** Lo que hay en la papelera del espacio (lo ve quien puede editar). */
    public List<Map<String, Object>> papelera(Usuario u, String espacioId) {
        espacios.exigir(espacios.requerir(espacioId), u, Permiso.EDICION);
        long ahora = System.currentTimeMillis();
        List<Map<String, Object>> r = new ArrayList<>();
        for (Documento d : repo.delEspacio(espacioId)) {
            if (d.eliminado <= 0) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", d.id);
            m.put("nombre", d.nombre);
            m.put("modo", d.modo);
            m.put("eliminado", d.eliminado);
            m.put("eliminadoPor", d.eliminadoPor);
            m.put("dias", Math.max(0, DIAS_PAPELERA - (ahora - d.eliminado) / DIA));
            r.add(m);
        }
        r.sort((a, b) -> Long.compare(num(b.get("eliminado")), num(a.get("eliminado"))));
        return r;
    }

    /** Saca un documento de la papelera (vuelve a su espacio tal como estaba). */
    public Documento sacarDePapelera(Usuario u, String docId) {
        Documento d = requerirEnPapelera(docId);
        Espacio e = espacios.requerir(d.espacioId);
        Permiso p = espacios.exigir(e, u, Permiso.EDICION);
        d.eliminado = 0;
        d.eliminadoPor = null;
        repo.guardar(d);
        difusor.avisarEspacio(d.espacioId, "documentos", Map.of("accion", "creado", "id", d.id));
        return vistaPara(d, u, p);
    }

    /** Borrar para siempre: solo el propietario del espacio. */
    public void borrarParaSiempre(Usuario u, String docId) {
        Documento d = requerirEnPapelera(docId);
        espacios.exigir(espacios.requerir(d.espacioId), u, Permiso.PROPIETARIO);
        borrarDeVerdad(d);
    }

    public Map<String, Object> vaciarPapelera(Usuario u, String espacioId) {
        espacios.exigir(espacios.requerir(espacioId), u, Permiso.PROPIETARIO);
        int n = 0;
        for (Documento d : repo.delEspacio(espacioId)) if (d.eliminado > 0) { borrarDeVerdad(d); n++; }
        return Map.of("borrados", n);
    }

    private void borrarDeVerdad(Documento d) {
        synchronized (candado(d.id)) {
            sucios.remove(d.id);
            repo.borrar(d.id);
        }
        motores.remove(d.id);
        usoCache.clear();
        difusor.avisarEspacio(d.espacioId, "documentos", Map.of("accion", "borrado", "id", d.id));
    }

    /** Lo que lleva mas de 30 dias en la papelera se borra solo (se revisa cada hora, con el autoguardado). */
    public int depurarPapelera() {
        long ahora = System.currentTimeMillis();
        if (ahora - ultimaDepuracion < 3_600_000L) return 0;
        ultimaDepuracion = ahora;
        int n = 0;
        for (Espacio e : espacios.todos())
            for (Documento d : repo.delEspacio(e.id))
                if (d.eliminado > 0 && ahora - d.eliminado > DIAS_PAPELERA * DIA) { borrarDeVerdad(d); n++; }
        if (n > 0) log.info("Papelera: {} documentos de hace más de {} días se borraron", n, DIAS_PAPELERA);
        return n;
    }

    // ------------------------------------------------------------ 8.5 nombre, copia, mover, carpetas, destacados

    private static String nombreValido(String nombre) {
        nombre = nombre == null ? "" : nombre.trim();
        if (nombre.isEmpty()) throw ErrorNom.invalido("Escribe un nombre", "nombre");
        if (nombre.length() > 120) throw ErrorNom.invalido("Máximo 120 caracteres", "nombre");
        return nombre;
    }

    /** Cambiar el nombre desde la lista (el nombre vive en el documento: se manda como cambio a quien lo tenga abierto). */
    public Documento renombrar(Usuario u, String docId, String nombre) {
        Documento d = requerir(docId);
        Permiso p = permiso(u, d, Permiso.EDICION);
        String nuevo = nombreValido(nombre);
        Operacion op;
        synchronized (candado(docId)) {
            EstadoDocumento est = repo.estado(docId);
            String n = nodoServidor();
            long t = est.reloj + 1;
            op = new Operacion(n + ":nom" + t, Operacion.DOC, Map.of("nombre", nuevo), t, n);
            motor(docId).fusionar(est, op);
            d.modificado = System.currentTimeMillis();
            d.pendienteVersion = true;
            sincronizarMeta(d, est);
            sucios.add(docId);
            repo.guardar(d);
        }
        difusor.ops(docId, Map.of("ops", List.of(op), "cliente", "servidor"));
        difusor.avisarEspacio(d.espacioId, "documentos", Map.of("accion", "actualizado", "id", d.id));
        return vistaPara(d, u, p);
    }

    /**
     * Hacer una copia (en el mismo espacio o en otro donde la persona pueda editar). Tambien sirve
     * para guardar un documento como plantilla del espacio y para crear uno nuevo desde una plantilla.
     */
    public Documento copiar(Usuario u, String docId, String espacioDestino, String nombre, boolean comoPlantilla) {
        Documento origen = requerir(docId);
        permiso(u, origen, Permiso.LECTURA);
        String destinoId = espacioDestino == null || espacioDestino.isBlank() ? origen.espacioId : espacioDestino;
        Espacio e = espacios.requerir(destinoId);
        Permiso p = espacios.exigir(e, u, Permiso.EDICION);
        revisarCuota(e);
        String nuevo = nombre == null || nombre.isBlank()
                ? (comoPlantilla || origen.plantilla ? origen.nombre : "Copia de " + origen.nombre) : nombre.trim();
        if (nuevo.length() > 120) nuevo = nuevo.substring(0, 120);
        EstadoDocumento est;
        synchronized (candado(docId)) { est = repo.estado(docId).copia(); }
        long ahora = System.currentTimeMillis();
        Documento d = new Documento();
        d.id = cifrado.id();
        d.espacioId = destinoId;
        d.nombre = nuevo;
        d.modo = origen.modo;
        d.autorId = u.id;
        d.creado = ahora;
        d.modificado = ahora;
        d.ultimoEditorId = u.id;
        d.plantilla = comoPlantilla;
        d.carpeta = destinoId.equals(origen.espacioId) && !comoPlantilla && !origen.plantilla ? origen.carpeta : null;
        String n = nodoServidor();
        long t = est.reloj + 1;
        motor(d.id).fusionar(est, new Operacion(n + ":copia" + t, Operacion.DOC, Map.of("nombre", nuevo), t, n));
        sincronizarMeta(d, est);
        repo.guardarEstado(d.id, est);
        repo.guardar(d);
        nuevaVersion(d, est, u, comoPlantilla ? "Plantilla hecha de «" + origen.nombre + "»"
                : origen.plantilla ? "Desde la plantilla «" + origen.nombre + "»" : "Copia de «" + origen.nombre + "»");
        usoCache.clear();
        difusor.avisarEspacio(destinoId, "documentos", Map.of("accion", "creado", "id", d.id));
        return vistaPara(d, u, p);
    }

    /** Mover a otro espacio (hay que poder editar en los dos). */
    public Documento mover(Usuario u, String docId, String espacioDestino) {
        Documento d = requerir(docId);
        Permiso p = permiso(u, d, Permiso.EDICION);
        Espacio destino = espacios.requerir(espacioDestino == null ? "" : espacioDestino);
        Permiso enDestino = espacios.exigir(destino, u, Permiso.EDICION);
        if (destino.id.equals(d.espacioId)) return vistaPara(d, u, p);
        if ((d.protegido || d.entregaLimite > 0) && p != Permiso.PROPIETARIO)
            throw ErrorNom.prohibido("Solo el propietario del espacio mueve un documento protegido o con fecha de entrega");
        revisarCuota(destino);
        String antes = d.espacioId;
        d.espacioId = destino.id;
        d.carpeta = null;
        repo.guardar(d);
        usoCache.clear();
        difusor.avisarDocumento(docId, "movido", Map.of("espacioId", destino.id, "espacio", destino.nombre, "por", u.nombre));
        difusor.avisarEspacio(antes, "documentos", Map.of("accion", "eliminado", "id", d.id));
        difusor.avisarEspacio(destino.id, "documentos", Map.of("accion", "creado", "id", d.id));
        return vistaPara(d, u, enDestino);
    }

    private static String carpetaValida(String c) {
        if (c == null) return null;
        c = c.trim().replaceAll("\\s+", " ");
        if (c.isEmpty()) return null;
        if (c.length() > 60) throw ErrorNom.invalido("El nombre de la carpeta es muy largo (máximo 60)", "carpeta");
        return c;
    }

    /** Poner un documento en una carpeta del espacio (null o vacio: sin carpeta). */
    public Documento fijarCarpeta(Usuario u, String docId, String carpeta) {
        Documento d = requerir(docId);
        Permiso p = permiso(u, d, Permiso.EDICION);
        d.carpeta = carpetaValida(carpeta);
        repo.guardar(d);
        difusor.avisarEspacio(d.espacioId, "documentos", Map.of("accion", "actualizado", "id", d.id));
        return vistaPara(d, u, p);
    }

    /** Renombrar una carpeta (o quitarla, con a = null): cambia en todos sus documentos. */
    public Map<String, Object> renombrarCarpeta(Usuario u, String espacioId, String de, String a) {
        espacios.exigir(espacios.requerir(espacioId), u, Permiso.EDICION);
        String origen = carpetaValida(de), nueva = carpetaValida(a);
        if (origen == null) throw ErrorNom.invalido("¿Qué carpeta?", "de");
        int n = 0;
        for (Documento d : repo.delEspacio(espacioId)) {
            if (!origen.equals(d.carpeta)) continue;
            d.carpeta = nueva;
            repo.guardar(d);
            n++;
        }
        difusor.avisarEspacio(espacioId, "documentos", Map.of("accion", "carpetas"));
        return Map.of("documentos", n);
    }

    /** Destacado: una marca personal (cada quien ve solo la suya). */
    public Documento destacar(Usuario u, String docId, boolean si) {
        Documento d = requerir(docId);
        Permiso p = permiso(u, d, Permiso.LECTURA);
        List<String> l = d.destacadoPor == null ? new ArrayList<>() : new ArrayList<>(d.destacadoPor);
        l.remove(u.id);
        if (si) l.add(u.id);
        d.destacadoPor = l.isEmpty() ? null : l;
        repo.guardar(d);
        return vistaPara(d, u, p);
    }

    // ------------------------------------------------------------ 8.5 buscar dentro de los documentos

    /** Minusculas y sin acentos, letra por letra (asi las posiciones coinciden con el texto original). */
    private static String normal(String s) {
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c < 128) { b.append(Character.toLowerCase(c)); continue; }
            String n = java.text.Normalizer.normalize(String.valueOf(c), java.text.Normalizer.Form.NFD);
            b.append(Character.toLowerCase(n.isEmpty() ? c : n.charAt(0)));
        }
        return b.toString();
    }

    /** Todo el texto de un documento: letras del texto, celdas, figuras, notas y ecuaciones (sin comentarios). */
    private static String textoBuscable(EstadoDocumento est) {
        StringBuilder sb = new StringBuilder();
        est.seq.forEach((b, sec) -> { if (est.vivo(b) && sb.length() < 400_000) sb.append(sec.textoVisible(200_000)).append('\n'); });
        for (var en : est.bloques.entrySet()) {
            if (sb.length() > 400_000) break;
            String id = en.getKey();
            if (!est.vivo(id) && !Operacion.DOC.equals(id)) continue;
            if ("comentario".equals(est.valor(id, "tipo"))) continue;
            en.getValue().forEach((k, r) -> {
                Object v = r == null ? null : r.v;
                String t = v instanceof String x ? x : v instanceof Number ? String.valueOf(v) : null;
                if (t == null || t.isBlank()) return;
                if (k.equals("texto") || k.equals("titulo") || k.equals("etiqueta") || k.equals("alt") || k.equals("tex") || k.startsWith("c:") || k.startsWith("nota:"))
                    sb.append(t).append('\n');
                else if (k.equals("html"))
                    sb.append(t.replaceAll("<[^>]*>", " ").replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&amp;", "&")).append('\n');
            });
        }
        return sb.toString();
    }

    /** Busca en el nombre y en el contenido de los documentos del espacio (sin acentos ni mayusculas). */
    public List<Map<String, Object>> buscar(Usuario u, String espacioId, String q) {
        espacios.exigir(espacios.requerir(espacioId), u, Permiso.LECTURA);
        String aguja = normal(q == null ? "" : q.trim().replaceAll("\\s+", " "));
        if (aguja.length() < 2) return List.of();
        if (aguja.length() > 80) aguja = aguja.substring(0, 80);
        List<Map<String, Object>> r = new ArrayList<>();
        for (Documento d : repo.delEspacio(espacioId)) {
            if (d.eliminado > 0) continue;
            String texto;
            synchronized (candado(d.id)) { texto = textoBuscable(repo.estado(d.id)); }
            String plano = normal(texto);
            int i = plano.indexOf(aguja);
            boolean enNombre = normal(d.nombre).contains(aguja);
            if (i < 0 && !enNombre) continue;
            int veces = 0;
            for (int k = i; k >= 0 && veces < 99; k = plano.indexOf(aguja, k + aguja.length())) veces++;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", d.id);
            m.put("nombre", d.nombre);
            m.put("modo", d.modo);
            m.put("modificado", d.modificado);
            m.put("carpeta", d.carpeta);
            m.put("plantilla", d.plantilla);
            m.put("enNombre", enNombre);
            m.put("veces", veces);
            if (i >= 0) {
                int a = Math.max(0, i - 60), b = Math.min(texto.length(), i + aguja.length() + 80);
                m.put("antes", (a > 0 ? "…" : "") + texto.substring(a, i).replaceAll("\\s+", " "));
                m.put("encontrado", texto.substring(i, i + aguja.length()));
                m.put("despues", texto.substring(i + aguja.length(), b).replaceAll("\\s+", " ") + (b < texto.length() ? "…" : ""));
            }
            r.add(m);
            if (r.size() >= 40) break;
        }
        // Primero donde aparece mas veces; luego lo mas reciente.
        r.sort((x, y) -> num(y.get("veces")) != num(x.get("veces")) ? Long.compare(num(y.get("veces")), num(x.get("veces"))) : Long.compare(num(y.get("modificado")), num(x.get("modificado"))));
        return r;
    }

    // ------------------------------------------------------------ 8.5 @menciones en comentarios

    /** Comentarios (nuevos o editados) de este lote que tienen una @. */
    private static List<String[]> comentariosConMencion(EstadoDocumento est, List<Operacion> ops) {
        List<String[]> r = new ArrayList<>();
        for (Operacion op : ops) {
            if (op.campos() == null || !(op.campos().get("texto") instanceof String t) || t.indexOf('@') < 0) continue;
            if (!"comentario".equals(est.valor(op.bloque(), "tipo"))) continue;
            r.add(new String[] { op.bloque(), t });
        }
        return r;
    }

    /** Avisa a cada persona del espacio mencionada con @nombre (una vez por lote). */
    private void avisarMenciones(Usuario autor, Documento d, Espacio e, List<String[]> textos) {
        Map<String, String> nombres = new LinkedHashMap<>();
        for (String uid : e.accesos.keySet()) cuentas.porId(uid).ifPresent(x -> nombres.put(uid, x.nombre));
        Set<String> avisados = new HashSet<>();
        for (String[] c : textos) {
            String tl = c[1].toLowerCase(Locale.ROOT);
            for (var en : nombres.entrySet()) {
                String uid = en.getKey(), nom = en.getValue();
                if (uid.equals(autor.id) || nom == null || nom.isBlank() || avisados.contains(uid)) continue;
                String marca = "@" + nom.toLowerCase(Locale.ROOT);
                for (int i = tl.indexOf(marca); i >= 0; i = tl.indexOf(marca, i + 1)) {
                    int fin = i + marca.length();
                    if (fin < tl.length() && (Character.isLetterOrDigit(tl.charAt(fin)) || tl.charAt(fin) == '_')) continue;
                    avisados.add(uid);
                    Map<String, Object> aviso = new LinkedHashMap<>();
                    aviso.put("tipo", "mencion");
                    aviso.put("docId", d.id);
                    aviso.put("documento", d.nombre);
                    aviso.put("modo", d.modo);
                    aviso.put("comentario", c[0]);
                    aviso.put("por", autor.nombre);
                    aviso.put("color", autor.color);
                    aviso.put("texto", c[1].length() > 160 ? c[1].substring(0, 159) + "…" : c[1]);
                    espacios.agregarAviso(e.id, uid, aviso);
                    difusor.avisarUsuario(uid, "aviso", aviso);
                    break;
                }
            }
        }
    }

    // ------------------------------------------------------------ 8.5 enlace para ver un solo documento

    /** El propietario del espacio crea (o vuelve a mostrar) el enlace para ver sin cuenta. */
    public Map<String, Object> crearEnlaceVer(Usuario u, String docId) {
        Documento d = requerir(docId);
        permiso(u, d, Permiso.PROPIETARIO);
        if (d.enlaceVer == null) {
            d.enlaceVer = cifrado.token();
            repo.guardar(d);
        }
        return Map.of("enlace", d.enlaceVer);
    }

    /** Quitar el enlace: quien lo tenga ya no puede abrirlo. */
    public Map<String, Object> quitarEnlaceVer(Usuario u, String docId) {
        Documento d = requerir(docId);
        permiso(u, d, Permiso.PROPIETARIO);
        d.enlaceVer = null;
        repo.guardar(d);
        return Map.of("ok", true);
    }

    /** Lo que ve quien abre el enlace: el documento en solo lectura, sin comentarios, partes ni notas del orador. */
    public Map<String, Object> verPublico(String token) {
        Documento d = null;
        if (token != null && token.length() >= 20) {
            for (Espacio e : espacios.todos()) {
                for (Documento x : repo.delEspacio(e.id)) {
                    if (x.enlaceVer != null && x.eliminado <= 0 && java.security.MessageDigest.isEqual(x.enlaceVer.getBytes(java.nio.charset.StandardCharsets.UTF_8), token.getBytes(java.nio.charset.StandardCharsets.UTF_8))) { d = x; break; }
                }
                if (d != null) break;
            }
        }
        if (d == null) throw new ErrorNom(ErrorNom.NO_EXISTE, "Este enlace ya no sirve: el propietario lo quitó o el documento ya no existe");
        EstadoDocumento copia;
        synchronized (candado(d.id)) { copia = repo.estado(d.id).copia(); }
        copia.bloques.entrySet().removeIf(en -> en.getValue().get("tipo") != null && "comentario".equals(en.getValue().get("tipo").v));
        Map<String, Registro> meta = copia.bloques.get(Operacion.DOC);
        if (meta != null) meta.keySet().removeIf(k -> k.startsWith("nota:") || k.startsWith("dueno:") || k.startsWith("anim:"));
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("nombre", d.nombre);
        doc.put("modo", d.modo);
        doc.put("modificado", d.modificado);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("documento", doc);
        r.put("espacio", espacios.requerir(d.espacioId).nombre);
        r.put("estado", copia);
        return r;
    }

    // ------------------------------------------------------------ 6.5 sincronizar con otro servidor

    /** Copia del estado, para mandarlo a otro servidor. */
    public EstadoDocumento estadoParaCopiar(String docId) {
        synchronized (candado(docId)) { return repo.estado(docId).copia(); }
    }

    /** Operaciones que llegan de otro servidor: se integran sin revisar permisos (ya los reviso aquel). */
    public int fusionarExterno(String docId, List<Operacion> ops, String quien) {
        Documento d = requerir(docId);
        List<Operacion> aplicadas = new ArrayList<>();
        synchronized (candado(docId)) {
            EstadoDocumento est = repo.estado(docId);
            MotorCRDT mot = motor(docId);
            for (Operacion op : ops) {
                op = sinCambioDeTipo(op);
                if (op != null && op.valida() && !mot.fusionar(est, op).isEmpty()) aplicadas.add(op);
            }
            if (!aplicadas.isEmpty()) {
                d.modificado = System.currentTimeMillis();
                d.pendienteVersion = true;
                if (sincronizarMeta(d, est)) difusor.avisarEspacio(d.espacioId, "documentos", Map.of("accion", "actualizado", "id", d.id));
                repo.guardar(d);
                sucios.add(docId);
                Usuario sync = new Usuario();
                sync.id = "sincronia";
                sync.nombre = quien == null ? "Sincronización" : quien;
                sync.color = "#6B6875";
                anotar(docId, sync, "sincronia", "Sincronización", aplicadas);
            }
        }
        if (!aplicadas.isEmpty()) difusor.ops(docId, Map.of("ops", aplicadas, "cliente", "sincronia"));
        return aplicadas.size();
    }

    /** Documento nuevo que llego de otro servidor (lo crea el propietario del espacio). */
    public Documento crearExterno(String espacioId, String nombre, String modo) {
        Espacio e = espacios.requerir(espacioId);
        Usuario duenio = cuentas.porId(e.propietarioId).orElseThrow(() -> ErrorNom.noEncontrado("El propietario"));
        return crear(duenio, espacioId, nombre, modo, List.of());
    }

    /** Lo que guarda el servidor de un registro LWW, para armar operaciones de sincronizacion. */
    public static Map<String, Map<String, Registro>> registros(EstadoDocumento est) { return est.bloques; }
}
