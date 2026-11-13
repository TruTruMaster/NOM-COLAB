package mx.wack.nom.core.servicio;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;


import mx.wack.nom.core.almacen.RepositorioDocumentos;
import mx.wack.nom.core.almacen.RepositorioEspacios;
import mx.wack.nom.core.modelo.Documento;
import mx.wack.nom.core.modelo.Espacio;
import mx.wack.nom.core.modelo.Permiso;
import mx.wack.nom.core.modelo.Sesion;
import mx.wack.nom.core.modelo.SolicitudAcceso;
import mx.wack.nom.core.modelo.Usuario;

/** Modulo 3 - Espacios de trabajo: CU-13 a CU-17 y CU-24. Diagramas A3, A4, A5 y A7. */
public class ServicioEspacios {

    private static final String[] COLORES = { "#7AA7FF", "#5CC08A", "#FFB547", "#A88BFF", "#FF8FA3", "#4CC9D8" };

    private final RepositorioEspacios repo;
    private final RepositorioDocumentos docs;
    private final ServicioCuentas cuentas;
    private final Difusor difusor;
    private final Nodo nodo;
    private final Cifrado cifrado;

    public ServicioEspacios(RepositorioEspacios repo, RepositorioDocumentos docs, ServicioCuentas cuentas,
                            Difusor difusor, Nodo nodo, Cifrado cifrado) {
        this.repo = repo;
        this.docs = docs;
        this.cuentas = cuentas;
        this.difusor = difusor;
        this.nodo = nodo;
        this.cifrado = cifrado;
    }

    /** Telefono que comparte (fase 13): no hay cuentas, asi que todo codigo deja entrar con alias. */
    private volatile boolean telefono;

    public void modoTelefono(boolean si) { this.telefono = si; }

    public boolean esTelefono() { return telefono; }

    public Espacio requerir(String id) {
        return repo.porId(id).orElseThrow(() -> ErrorNom.noEncontrado("El espacio"));
    }

    public Permiso exigir(Espacio e, Usuario u, Permiso minimo) {
        Permiso p = e.permisoDe(u.id);
        if (p == null) throw ErrorNom.prohibido("No tienes acceso a este espacio");
        if (!p.alMenos(minimo)) {
            throw ErrorNom.prohibido(switch (minimo) {
                case PROPIETARIO -> "Solo el propietario puede hacer esto";
                case EDICION -> "Tu permiso es solo para ver";
                default -> "No tienes acceso a este espacio";
            });
        }
        return p;
    }

    public List<Map<String, Object>> listar(Usuario u) {
        List<Map<String, Object>> r = new ArrayList<>();
        for (Espacio e : repo.todos()) {
            if (e.permisoDe(u.id) == null) continue;
            r.add(resumen(e, u));
        }
        r.sort((a, b) -> Long.compare((long) b.get("actividad"), (long) a.get("actividad")));
        return r;
    }

    public Map<String, Object> resumen(Espacio e, Usuario u) {
        List<Documento> ds = docs.delEspacio(e.id);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.id);
        m.put("nombre", e.nombre);
        m.put("color", e.color);
        m.put("permiso", e.permisoDe(u.id));
        m.put("propietario", cuentas.porId(e.propietarioId).map(x -> x.nombre).orElse("?"));
        m.put("miembros", e.accesos.size());
        // 8.5 Lo que esta en la papelera y las plantillas no cuentan como documentos del espacio.
        m.put("documentos", ds.stream().filter(x -> x.eliminado <= 0 && !x.plantilla).count());
        if (e.permisoDe(u.id) != null && e.permisoDe(u.id).alMenos(Permiso.EDICION))
            m.put("enPapelera", ds.stream().filter(x -> x.eliminado > 0).count());
        m.put("avisos", e.avisos == null ? 0 : e.avisos.getOrDefault(u.id, List.of()).stream().filter(a -> !Boolean.TRUE.equals(a.get("leido"))).count());
        m.put("conexion", e.conexion.activa);
        m.put("conectados", difusor.conectadosPublico(e.id));
        m.put("solicitudes", e.permisoDe(u.id) == Permiso.PROPIETARIO ? e.solicitudes.size() : 0);
        m.put("actividad", ds.isEmpty() ? e.creado : Math.max(e.creado, ds.get(0).modificado));
        m.put("carpetas", ds.stream().filter(x -> x.eliminado <= 0 && x.carpeta != null).map(x -> x.carpeta).distinct().sorted().toList());
        m.put("formatoBase", e.formatoBase);
        if (e.permisoDe(u.id) == Permiso.PROPIETARIO) {
            long ahora = System.currentTimeMillis();
            m.put("enlacesVigentes", e.enlaces == null ? 0 : e.enlaces.stream().filter(x -> x.vigente(ahora)).count());
            if (e.sincronia != null) {
                Map<String, Object> sc = new LinkedHashMap<>();
                sc.put("servidor", e.sincronia.servidor);
                sc.put("usuario", e.sincronia.usuario);
                sc.put("ultima", e.sincronia.ultima);
                sc.put("estado", e.sincronia.estado);
                sc.put("error", e.sincronia.error);
                sc.put("documentos", e.sincronia.docs.size());
                m.put("sincronia", sc);
            }
        }
        return m;
    }

    public java.util.Collection<Espacio> todos() { return repo.todos(); }

    // ------------------------------------------------------------ 8.5 avisos (menciones)

    /** Guarda un aviso para una persona del espacio (se quedan los ultimos 40). */
    public synchronized void agregarAviso(String espacioId, String usuarioId, Map<String, Object> aviso) {
        Espacio e = requerir(espacioId);
        if (e.permisoDe(usuarioId) == null) return;
        if (e.avisos == null) e.avisos = new LinkedHashMap<>();
        List<Map<String, Object>> l = e.avisos.computeIfAbsent(usuarioId, k -> new ArrayList<>());
        aviso.put("id", cifrado.id());
        aviso.put("t", System.currentTimeMillis());
        aviso.put("espacioId", espacioId);
        aviso.put("espacio", e.nombre);
        aviso.put("leido", false);
        l.add(0, aviso);
        while (l.size() > 40) l.remove(l.size() - 1);
        repo.guardar(e);
    }

    /** Los avisos de quien pregunta; al verlos quedan como leidos. */
    public synchronized List<Map<String, Object>> avisos(Usuario u, String espacioId) {
        Espacio e = requerir(espacioId);
        exigir(e, u, Permiso.LECTURA);
        List<Map<String, Object>> l = e.avisos == null ? List.of() : e.avisos.getOrDefault(u.id, List.of());
        List<Map<String, Object>> r = new ArrayList<>();
        for (Map<String, Object> a : l) r.add(new LinkedHashMap<>(a));
        if (l.stream().anyMatch(a -> !Boolean.TRUE.equals(a.get("leido")))) {
            l.forEach(a -> a.put("leido", true));
            repo.guardar(e);
        }
        return r;
    }

    public void guardar(Espacio e) { repo.guardar(e); }

    /** Borra un espacio (sus documentos ya los borro quien llama) y avisa a quienes lo tenian abierto. */
    public synchronized void borrar(Espacio e) {
        repo.borrar(e.id);
        difusor.avisarTodoEspacio(e.id, "espacio", Map.of("borrado", true));
    }

    /** Quita a una cuenta de un espacio ajeno: su acceso, su solicitud y sus avisos. */
    public synchronized void quitarCuenta(Espacio e, String usuarioId) {
        boolean cambio = e.accesos.remove(usuarioId) != null;
        cambio |= e.solicitudes.removeIf(s -> usuarioId.equals(s.usuarioId));
        if (e.avisos != null) cambio |= e.avisos.remove(usuarioId) != null;
        if (cambio) repo.guardar(e);
    }

    /** CU-13 Crear espacio de trabajo. */
    public synchronized Espacio crear(Usuario u, String nombre) {
        if (u.esInvitado()) throw ErrorNom.prohibido(u.alias ? "Un alias solo trabaja en el espacio al que entró. Para tener espacios propios, entra con tu cuenta cuando tengas Internet."
                : "Las cuentas de invitado no crean espacios. Crea una cuenta para tener los tuyos.");
        if (u.retirada) throw ErrorNom.prohibido("Esta cuenta ya no se usa en este equipo");
        nombre = nombre == null ? "" : nombre.trim();
        if (nombre.isEmpty()) throw ErrorNom.invalido("Ponle un nombre al espacio", "nombre");
        if (nombre.length() > 60) throw ErrorNom.invalido("Máximo 60 caracteres", "nombre");
        String clave = nombre.toLowerCase(Locale.ROOT);
        boolean repetido = repo.todos().stream()
                .anyMatch(e -> u.id.equals(e.propietarioId) && e.nombre.toLowerCase(Locale.ROOT).equals(clave));
        if (repetido) throw new ErrorNom(ErrorNom.CONFLICTO, "Ya tienes un espacio con ese nombre", "nombre");
        Espacio e = new Espacio();
        e.id = cifrado.id();
        e.nombre = nombre;
        e.propietarioId = u.id;
        e.creado = System.currentTimeMillis();
        e.color = COLORES[Math.floorMod(e.id.hashCode(), COLORES.length)];
        e.accesos.put(u.id, Permiso.PROPIETARIO);
        repo.guardar(e);
        return e;
    }

    public synchronized Espacio renombrar(Usuario u, String id, String nombre) {
        Espacio e = requerir(id);
        exigir(e, u, Permiso.PROPIETARIO);
        nombre = nombre == null ? "" : nombre.trim();
        if (nombre.isEmpty() || nombre.length() > 60) throw ErrorNom.invalido("Escribe un nombre de 1 a 60 caracteres", "nombre");
        e.nombre = nombre;
        repo.guardar(e);
        difusor.avisarTodoEspacio(e.id, "espacio", Map.of("nombre", nombre));
        return e;
    }

    /** CU-14 Activar / desactivar la conexion del proyecto. */
    public synchronized Map<String, Object> conexion(Usuario u, String id, boolean activa) {
        Espacio e = requerir(id);
        exigir(e, u, Permiso.PROPIETARIO);
        e.conexion.activa = activa;
        e.conexion.desde = activa ? System.currentTimeMillis() : 0;
        repo.guardar(e);
        difusor.avisarTodoEspacio(e.id, "conexion", Map.of("activa", activa));
        return estadoConexion(e);
    }

    public Map<String, Object> estadoConexion(Espacio e) {
        Map<String, Object> m = new LinkedHashMap<>();
        List<String> dirs = nodo.direcciones();
        m.put("activa", e.conexion.activa);
        m.put("desde", e.conexion.desde);
        m.put("equipo", nodo.equipo());
        m.put("puerto", nodo.puerto());
        m.put("direcciones", dirs);
        m.put("sinRed", dirs.isEmpty());
        return m;
    }

    /** CU-16 Unirse a un espacio: entra si ya tiene acceso, si no deja una solicitud. */
    public synchronized Map<String, Object> unirse(Usuario u, String id) {
        Espacio e = requerir(id);
        if (e.permisoDe(u.id) != null) return Map.of("estado", "miembro", "espacio", resumen(e, u));
        if (u.esInvitado()) throw ErrorNom.prohibido(u.alias ? "Un alias solo sirve en el espacio donde entró" : "Tu cuenta de invitado solo sirve en el espacio donde entraste");
        if (!e.conexion.activa) throw ErrorNom.prohibido("Este espacio ya no está visible en la red");
        boolean yaPidio = e.solicitudes.stream().anyMatch(s -> s.usuarioId.equals(u.id));
        if (!yaPidio) {
            SolicitudAcceso s = new SolicitudAcceso();
            s.usuarioId = u.id;
            s.fecha = System.currentTimeMillis();
            e.solicitudes.add(s);
            repo.guardar(e);
            difusor.avisarTodoEspacio(e.id, "solicitud", Map.of("usuario", u.nombre));
        }
        return Map.of("estado", "solicitado", "propietario", cuentas.porId(e.propietarioId).map(x -> x.nombre).orElse("?"));
    }

    /** CU-17 Lista de miembros y solicitudes. */
    public Map<String, Object> accesos(Usuario u, String id) {
        Espacio e = requerir(id);
        Permiso mio = exigir(e, u, Permiso.LECTURA);
        List<Map<String, Object>> miembros = new ArrayList<>();
        var conectados = difusor.usuariosEn(e.id);
        e.accesos.forEach((uid, p) -> cuentas.porId(uid).ifPresent(x -> {
            Map<String, Object> m = new LinkedHashMap<>(ServicioCuentas.publico(x));
            m.put("permiso", p);
            m.put("conectado", conectados.contains(uid));
            miembros.add(m);
        }));
        List<Map<String, Object>> sol = new ArrayList<>();
        if (mio == Permiso.PROPIETARIO) {
            for (SolicitudAcceso s : e.solicitudes) {
                cuentas.porId(s.usuarioId).ifPresent(x -> {
                    Map<String, Object> m = new LinkedHashMap<>(ServicioCuentas.publico(x));
                    m.put("fecha", s.fecha);
                    sol.add(m);
                });
            }
        }
        return Map.of("miembros", miembros, "solicitudes", sol, "miPermiso", mio);
    }

    /** CU-17 Agregar, cambiar o quitar el permiso de un usuario. permiso == null quita el acceso. */
    public synchronized Map<String, Object> cambiarAcceso(Usuario u, String id, String nombreUsuario, Permiso permiso) {
        Espacio e = requerir(id);
        exigir(e, u, Permiso.PROPIETARIO);
        if (nombreUsuario == null || nombreUsuario.isBlank()) throw ErrorNom.invalido("Escribe el nombre de usuario", "usuario");
        Usuario otro = cuentas.porNombre(nombreUsuario)
                .orElseThrow(() -> new ErrorNom(ErrorNom.NO_EXISTE, "El usuario \"" + nombreUsuario.trim() + "\" no existe", "usuario"));
        if (otro.id.equals(e.propietarioId))
            throw ErrorNom.invalido("El espacio no puede quedar sin dueño", "usuario");
        if (otro.esInvitado() && !e.id.equals(otro.invitadoDe) && permiso != null)
            throw ErrorNom.invalido("Esa es una cuenta de invitado de otro espacio", "usuario");
        if (permiso == Permiso.PROPIETARIO)
            throw ErrorNom.invalido("Cada espacio tiene un solo propietario", "permiso");
        if (permiso == null) {
            e.accesos.remove(otro.id);
        } else {
            e.accesos.put(otro.id, permiso);
        }
        e.solicitudes.removeIf(s -> s.usuarioId.equals(otro.id));
        repo.guardar(e);
        difusor.avisarTodoEspacio(e.id, "permiso", Map.of("usuarioId", otro.id, "permiso", permiso == null ? "NINGUNO" : permiso.name()));
        if (permiso == null) difusor.expulsar(e.id, otro.id);
        return accesos(u, id);
    }

    public synchronized Map<String, Object> rechazarSolicitud(Usuario u, String id, String usuarioId) {
        Espacio e = requerir(id);
        exigir(e, u, Permiso.PROPIETARIO);
        e.solicitudes.removeIf(s -> s.usuarioId.equals(usuarioId));
        repo.guardar(e);
        return accesos(u, id);
    }


    // ------------------------------------------------------------ formato por defecto (texto)

    /** El propietario fija con que fuente, tamano e interlineado nacen los documentos de texto. */
    public synchronized Map<String, Object> fijarFormatoBase(Usuario u, String id, Map<String, Object> f) {
        Espacio e = requerir(id);
        exigir(e, u, Permiso.PROPIETARIO);
        Map<String, Object> r = null;
        if (f != null && !f.isEmpty()) {
            r = new LinkedHashMap<>();
            Object fuente = f.get("fuente");
            if (fuente instanceof String fs && !fs.isBlank()) {
                if (fs.length() > 40 || !fs.matches("[\\p{L}\\p{N} ._-]+")) throw ErrorNom.invalido("Fuente no válida", "fuente");
                r.put("fuente", fs.trim());
            }
            if (f.get("tam") instanceof Number n) {
                double t = n.doubleValue();
                if (t < 6 || t > 72) throw ErrorNom.invalido("El tamaño va de 6 a 72 puntos", "tam");
                r.put("tam", Math.round(t * 2) / 2.0);
            }
            if (f.get("interlineado") instanceof Number n) {
                double li = n.doubleValue();
                if (li < 1 || li > 3) throw ErrorNom.invalido("El interlineado va de 1 a 3", "interlineado");
                r.put("interlineado", Math.round(li * 100) / 100.0);
            }
            // 8.2 Sangría de primera línea en cm (APA: 1.27).
            if (f.get("primera") instanceof Number n) {
                double pr = n.doubleValue();
                if (pr < 0 || pr > 5) throw ErrorNom.invalido("La sangría va de 0 a 5 cm", "primera");
                if (pr > 0) r.put("primera", Math.round(pr * 100) / 100.0);
            }
            if (r.isEmpty()) r = null;
        }
        e.formatoBase = r;
        repo.guardar(e);
        difusor.avisarTodoEspacio(e.id, "espacio", Map.of("formatoBase", r == null ? Map.of() : r));
        return resumen(e, u);
    }

    // ------------------------------------------------------------ enlaces para unirse (QR)

    private Map<String, Object> enlacePublico(Espacio.EnlaceUnion x, long ahora) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("codigo", x.codigo);
        m.put("permiso", x.permiso);
        m.put("creado", x.creado);
        m.put("caduca", x.caduca);
        m.put("invitados", x.invitados);
        m.put("usos", x.usos);
        m.put("estado", x.revocado ? "revocado" : x.caduca <= ahora ? "caducado" : "vigente");
        return m;
    }

    /** Un enlace (y su QR) para que otros entren sin pedir acceso. Caduca en 'horas'. */
    public synchronized Map<String, Object> crearEnlace(Usuario u, String id, Permiso permiso, int horas, boolean invitados) {
        Espacio e = requerir(id);
        exigir(e, u, Permiso.PROPIETARIO);
        if (permiso == null) permiso = Permiso.EDICION;
        if (permiso == Permiso.PROPIETARIO) throw ErrorNom.invalido("Cada espacio tiene un solo propietario", "permiso");
        if (horas < 1 || horas > 24 * 30) throw ErrorNom.invalido("El enlace dura de 1 hora a 30 días", "horas");
        long ahora = System.currentTimeMillis();
        if (e.enlaces == null) e.enlaces = new ArrayList<>();
        // Se olvidan los que ya no sirven desde hace mas de una semana; maximo 30 por espacio.
        e.enlaces.removeIf(x -> !x.vigente(ahora) && ahora - x.caduca > 7L * 86_400_000L);
        if (e.enlaces.stream().filter(x -> x.vigente(ahora)).count() >= 30) throw ErrorNom.invalido("Hay demasiados códigos de invitación vigentes: anula alguno", null);
        Espacio.EnlaceUnion x = new Espacio.EnlaceUnion();
        String c;
        do { c = cuentas.codigo(8); } while (buscarEnlace(c) != null);
        x.codigo = c;
        x.permiso = permiso;
        x.creado = ahora;
        x.caduca = ahora + horas * 3_600_000L;
        // En el telefono no hay cuentas: quien llega sin Internet entra con alias (siempre).
        x.invitados = invitados || telefono;
        e.enlaces.add(x);
        repo.guardar(e);
        Map<String, Object> m = enlacePublico(x, ahora);
        m.put("conexion", estadoConexion(e));
        return m;
    }

    public Map<String, Object> enlaces(Usuario u, String id) {
        Espacio e = requerir(id);
        exigir(e, u, Permiso.PROPIETARIO);
        long ahora = System.currentTimeMillis();
        List<Map<String, Object>> l = new ArrayList<>();
        if (e.enlaces != null) for (int i = e.enlaces.size() - 1; i >= 0; i--) l.add(enlacePublico(e.enlaces.get(i), ahora));
        return Map.of("enlaces", l, "conexion", estadoConexion(e));
    }

    public synchronized Map<String, Object> revocarEnlace(Usuario u, String id, String codigo) {
        Espacio e = requerir(id);
        exigir(e, u, Permiso.PROPIETARIO);
        Espacio.EnlaceUnion x = e.enlaces == null ? null : e.enlaces.stream().filter(y -> y.codigo.equalsIgnoreCase(codigo)).findFirst().orElse(null);
        if (x == null) throw ErrorNom.noEncontrado("El enlace");
        x.revocado = true;
        repo.guardar(e);
        return enlaces(u, id);
    }

    private Object[] buscarEnlace(String codigo) {
        if (codigo == null) return null;
        String c = codigo.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        for (Espacio e : repo.todos()) {
            if (e.enlaces == null) continue;
            for (Espacio.EnlaceUnion x : e.enlaces) if (x.codigo.equals(c)) return new Object[] { e, x };
        }
        return null;
    }

    private Object[] enlaceVigente(String codigo) {
        Object[] r = buscarEnlace(codigo);
        if (r == null) throw new ErrorNom(ErrorNom.NO_EXISTE, "Ese código no existe. Revisa que lo escribiste bien.");
        Espacio.EnlaceUnion x = (Espacio.EnlaceUnion) r[1];
        if (x.revocado) throw new ErrorNom(ErrorNom.PROHIBIDO, "Este código de invitación ya no sirve: lo anuló quien lo creó. Pídele uno nuevo.");
        if (x.caduca <= System.currentTimeMillis()) throw new ErrorNom(ErrorNom.PROHIBIDO, "Este código de invitación ya venció. Pide uno nuevo a quien te invitó.");
        return r;
    }

    /** Publico: lo que dice un enlace antes de entrar (sin revelar el contenido del espacio). */
    public Map<String, Object> infoEnlace(String codigo) {
        Object[] r = enlaceVigente(codigo);
        Espacio e = (Espacio) r[0];
        Espacio.EnlaceUnion x = (Espacio.EnlaceUnion) r[1];
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("codigo", x.codigo);
        m.put("espacioId", e.id);
        m.put("espacio", e.nombre);
        m.put("color", e.color);
        m.put("propietario", cuentas.porId(e.propietarioId).map(y -> y.nombre).orElse("?"));
        m.put("permiso", x.permiso);
        m.put("invitados", x.invitados || telefono);
        m.put("caduca", x.caduca);
        // El telefono que comparte no tiene cuentas: alias, o la cuenta de la nube con un pase.
        if (telefono) m.put("telefono", true);
        return m;
    }

    /** Entrar con un enlace estando ya en una cuenta: queda como miembro con el permiso del enlace. */
    public synchronized Map<String, Object> entrarConEnlace(Usuario u, String codigo) {
        Object[] r = enlaceVigente(codigo);
        Espacio e = (Espacio) r[0];
        Espacio.EnlaceUnion x = (Espacio.EnlaceUnion) r[1];
        Permiso actual = e.permisoDe(u.id);
        if (u.esInvitado() && !e.id.equals(u.invitadoDe)) throw ErrorNom.prohibido("Tu cuenta de invitado solo sirve en el espacio donde entraste");
        if (actual == null || !actual.alMenos(x.permiso)) {
            e.accesos.put(u.id, x.permiso);
            difusor.avisarTodoEspacio(e.id, "permiso", Map.of("usuarioId", u.id, "permiso", x.permiso.name()));
        }
        e.solicitudes.removeIf(sol -> sol.usuarioId.equals(u.id));
        x.usos++;
        repo.guardar(e);
        return resumen(e, u);
    }

    /**
     * Modo salon de las apps anteriores ("entrar con apodo"): ahora el nombre no se escribe, se da un
     * alias al azar ligado al espacio (asi nadie se hace pasar por otro).
     */
    public synchronized Map<String, Object> entrarComoInvitado(String codigo, String apodo) {
        return entrarConAlias(codigo, null, null, null);
    }

    /**
     * Fase 13, A.1: entrar con un alias por el codigo o el QR del espacio, sin escribir nada. Si el
     * equipo ya tenia un alias de este espacio (id y llave), vuelve a ser el mismo; si no (o pidio
     * "Otro alias"), se crea uno nuevo con nombre al azar y el permiso del codigo.
     */
    public synchronized Map<String, Object> entrarConAlias(String codigo, String id, String llave, String origen) {
        Object[] r = enlaceVigente(codigo);
        Espacio e = (Espacio) r[0];
        Espacio.EnlaceUnion x = (Espacio.EnlaceUnion) r[1];
        if (!x.invitados && !telefono) throw ErrorNom.prohibido("Este código pide una cuenta. Inicia sesión o crea una.");
        Sesion s = null;
        if (id != null && !id.isBlank() && llave != null) {
            Usuario viejo = cuentas.porId(id).orElse(null);
            if (viejo != null && viejo.alias && e.id.equals(viejo.invitadoDe)) {
                try { s = cuentas.entrarAlias(id, llave, origen); } catch (ErrorNom ex) { if (ex.estado == ErrorNom.BLOQUEADO) throw ex; }
            }
        }
        boolean nuevo = s == null;
        if (nuevo) s = cuentas.crearAlias(e.id, llave, false);
        Usuario u = cuentas.porId(s.usuarioId).orElseThrow();
        Permiso antes = e.permisoDe(u.id);
        if (antes == null || !antes.alMenos(x.permiso)) {
            e.accesos.put(u.id, x.permiso);
            difusor.avisarTodoEspacio(e.id, "permiso", Map.of("usuarioId", u.id, "permiso", x.permiso.name()));
        }
        x.usos++;
        repo.guardar(e);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("token", s.token);
        m.put("expira", s.expira);
        m.put("usuario", ServicioCuentas.publico(u));
        m.put("preferencias", u.preferencias);
        m.put("espacio", resumen(e, u));
        m.put("nuevo", nuevo);
        return m;
    }

    /**
     * Telefono que comparte: los espacios de las cuentas con contrasena de antes (ya retiradas) pasan
     * al dueno del telefono la primera vez que entra. Lo escrito sigue a nombre de quien lo escribio.
     */
    public synchronized int traspasarDeRetiradas(Usuario dueno) {
        int n = 0;
        for (Espacio e : repo.todos()) {
            if (dueno.id.equals(e.propietarioId)) continue;
            Usuario antes = cuentas.porId(e.propietarioId).orElse(null);
            if (antes != null && !antes.retirada) continue;
            if (antes != null) e.accesos.remove(antes.id);
            e.propietarioId = dueno.id;
            e.accesos.put(dueno.id, Permiso.PROPIETARIO);
            repo.guardar(e);
            n++;
        }
        return n;
    }

    /** CU-24 Consumo del espacio. */
    public Map<String, Object> almacenamiento(Usuario u, String id) {
        Espacio e = requerir(id);
        exigir(e, u, Permiso.LECTURA);
        List<Map<String, Object>> lista = new ArrayList<>();
        long total = 0;
        for (Documento d : docs.delEspacio(e.id)) {
            var h = docs.historial(d.id);
            long bv = h.stream().mapToLong(v -> v.bytes).sum();
            long be = docs.bytesEstado(d.id);
            total += bv + be;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", d.id);
            m.put("nombre", d.nombre);
            m.put("modo", d.modo);
            m.put("bytesDocumento", be);
            m.put("bytesVersiones", bv);
            m.put("versiones", h.size());
            m.put("abiertoPorOtros", difusor.otroEditando(d.id, u.id));
            lista.add(m);
        }
        int conservar = cuentas.porId(e.propietarioId).map(x -> x.preferencias.versionesConservar).orElse(30);
        return Map.of("documentos", lista, "total", total, "conservar", conservar,
                "esPropietario", e.permisoDe(u.id) == Permiso.PROPIETARIO);
    }

    /** CU-24 Depurar versiones antiguas. Los documentos abiertos por otros se posponen (4a). */
    public Map<String, Object> depurar(Usuario u, String id, int conservar) {
        Espacio e = requerir(id);
        exigir(e, u, Permiso.PROPIETARIO);
        if (conservar < 1 || conservar > 200) throw ErrorNom.invalido("Conserva entre 1 y 200 versiones", "conservar");
        long liberado = 0;
        List<String> pospuestos = new ArrayList<>();
        for (Documento d : docs.delEspacio(e.id)) {
            if (difusor.otroEditando(d.id, u.id)) {
                pospuestos.add(d.nombre);
                continue;
            }
            liberado += docs.depurar(d.id, conservar);
        }
        return Map.of("liberado", liberado, "pospuestos", pospuestos);
    }
}
