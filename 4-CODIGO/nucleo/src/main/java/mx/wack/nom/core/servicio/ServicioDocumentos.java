package mx.wack.nom.core.servicio;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;


import mx.wack.nom.core.almacen.RepositorioDocumentos;
import mx.wack.nom.core.crdt.EstadoDocumento;
import mx.wack.nom.core.crdt.MotorCRDT;
import mx.wack.nom.core.crdt.Operacion;
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

    public ServicioDocumentos(RepositorioDocumentos repo, ServicioEspacios espacios, ServicioCuentas cuentas,
                              Difusor difusor, Cifrado cifrado, Nodo nodo) {
        this.repo = repo;
        this.espacios = espacios;
        this.cuentas = cuentas;
        this.difusor = difusor;
        this.cifrado = cifrado;
        this.nodo = nodo;
    }

    private Object candado(String docId) { return candados.computeIfAbsent(docId, k -> new Object()); }

    private MotorCRDT motor(String docId) { return motores.computeIfAbsent(docId, k -> new MotorCRDT()); }

    private String nodoServidor() { return "srv-" + nodo.id(); }

    public Documento requerir(String id) {
        return repo.porId(id).orElseThrow(() -> ErrorNom.noEncontrado("El documento"));
    }

    public Permiso permiso(Usuario u, Documento d, Permiso minimo) {
        Espacio e = espacios.requerir(d.espacioId);
        return espacios.exigir(e, u, minimo);
    }

    public List<Documento> listar(Usuario u, String espacioId) {
        espacios.exigir(espacios.requerir(espacioId), u, Permiso.LECTURA);
        return repo.delEspacio(espacioId);
    }

    /** CU-18 Crear documento (opcionalmente desde una plantilla, que llega como operaciones iniciales). */
    public Documento crear(Usuario u, String espacioId, String nombre, String modo, List<Operacion> iniciales) {
        Espacio e = espacios.requerir(espacioId);
        espacios.exigir(e, u, Permiso.EDICION);
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
        mot.fusionar(est, new Operacion(n + ":c1", Operacion.DOC,
                Map.of("nombre", nombre, "modo", m.name(), "paginas", List.of("p1")), 1, n));
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
        r.put("documento", d);
        r.put("permiso", p);
        r.put("espacio", Map.of("id", e.id, "nombre", e.nombre, "color", e.color));
        synchronized (candado(docId)) {
            r.put("estado", repo.estado(docId).copia());
        }
        return r;
    }

    /** CU-19 / CU-21: integra un lote de operaciones y las difunde a los demas. */
    public Map<String, Object> aplicar(Usuario u, String docId, List<Operacion> ops, String cliente) {
        return aplicar(u, docId, ops, cliente, null);
    }

    public Map<String, Object> aplicar(Usuario u, String docId, List<Operacion> ops, String cliente, String dispositivo) {
        Documento d = requerir(docId);
        Permiso p = permiso(u, d, Permiso.LECTURA);
        if (!p.alMenos(Permiso.EDICION)) {
            // CU-26 7a: el permiso cambio a lectura mientras estaba sin conexion.
            throw new ErrorNom(ErrorNom.PROHIBIDO,
                    "Tu permiso cambió a solo lectura; tus cambios no se aplicaron", null, Map.of("permiso", p));
        }
        if (ops == null || ops.isEmpty()) return Map.of("aplicadas", 0);
        List<Operacion> aplicadas = new ArrayList<>();
        EstadoDocumento est;
        synchronized (candado(docId)) {
            est = repo.estado(docId);
            MotorCRDT mot = motor(docId);
            for (Operacion op : ops) {
                op = sinCambioDeTipo(op);
                if (op == null || !op.valida()) continue;
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
                if (cambioMeta) {
                    difusor.avisarEspacio(d.espacioId, "documentos", Map.of("accion", "actualizado", "id", d.id));
                }
            }
        }
        if (!aplicadas.isEmpty()) difusor.ops(docId, Map.of("ops", aplicadas, "cliente", cliente == null ? "" : cliente));
        return Map.of("aplicadas", aplicadas.size(), "reloj", est.reloj);
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
            rachas.put(clave, m);
        }
        java.util.Set<String> bloques = (java.util.Set<String>) m.get("bloques"), campos = (java.util.Set<String>) m.get("campos");
        int escritas = ((Number) m.get("escritas")).intValue(), borradas = ((Number) m.get("borradas")).intValue();
        for (Operacion op : ops) {
            if (bloques.size() < 12) bloques.add(op.bloque());
            if (op.esSecuencia()) {
                campos.add("texto");
                Object k = op.s().get("k");
                if ("i".equals(k) && op.s().get("x") instanceof String x) escritas += x.codePointCount(0, x.length());
                else if ("v".equals(k) && Boolean.FALSE.equals(op.s().get("v")) && op.s().get("r") instanceof List<?> r) {
                    for (Object o : r) if (o instanceof List<?> rango && rango.size() == 3 && rango.get(1) instanceof Number a && rango.get(2) instanceof Number b) borradas += (int) (b.longValue() - a.longValue() + 1);
                } else if ("f".equals(k)) campos.add("formato");
                continue;
            }
            for (String c : op.campos().keySet()) if (campos.size() < 12) campos.add(c);
        }
        m.put("t", ahora);
        m.put("operaciones", ((Number) m.get("operaciones")).intValue() + ops.size());
        m.put("escritas", escritas);
        m.put("borradas", borradas);
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
        repo.borrar(docId);
        motores.remove(docId);
        difusor.avisarDocumento(docId, "eliminado", Map.of("por", u.nombre));
        difusor.avisarEspacio(d.espacioId, "documentos", Map.of("accion", "eliminado", "id", d.id));
    }

    // ------------------------------------------------------------------ versiones (CU-23)

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

    /** Restaura como version NUEVA; las intermedias se conservan. */
    public Version restaurar(Usuario u, String docId, int numero) {
        Documento d = requerir(docId);
        if (!permiso(u, d, Permiso.LECTURA).alMenos(Permiso.EDICION))
            throw ErrorNom.prohibido("Solo puedes consultar versiones");
        Map<String, Map<String, Object>> f = repo.fotoVersion(docId, numero);
        if (f == null) throw ErrorNom.noEncontrado("La versión " + numero);
        List<Operacion> ops;
        Version v;
        synchronized (candado(docId)) {
            EstadoDocumento est = repo.estado(docId);
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
                if (!d.pendienteVersion) return;
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
    }
}
