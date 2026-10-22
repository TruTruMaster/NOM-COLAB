package mx.wack.nom.servidor.servicio;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import mx.wack.nom.core.almacen.RepositorioDocumentos;
import mx.wack.nom.core.almacen.RepositorioEspacios;
import mx.wack.nom.core.modelo.Documento;
import mx.wack.nom.core.modelo.Espacio;
import mx.wack.nom.core.modelo.Permiso;
import mx.wack.nom.core.modelo.SolicitudAcceso;
import mx.wack.nom.core.modelo.Usuario;
import mx.wack.nom.red.nodo.NodoLocal;
import mx.wack.nom.servidor.api.ErrorNom;
import mx.wack.nom.servidor.seguridad.Cifrado;

/** Modulo 3 - Espacios de trabajo: CU-13 a CU-17 y CU-24. Diagramas A3, A4, A5 y A7. */
@Service
public class ServicioEspacios {

    private static final String[] COLORES = { "#7AA7FF", "#5CC08A", "#FFB547", "#A88BFF", "#FF8FA3", "#4CC9D8" };

    private final RepositorioEspacios repo;
    private final RepositorioDocumentos docs;
    private final ServicioCuentas cuentas;
    private final Difusor difusor;
    private final NodoLocal nodo;
    private final Cifrado cifrado;

    public ServicioEspacios(RepositorioEspacios repo, RepositorioDocumentos docs, ServicioCuentas cuentas,
                            Difusor difusor, NodoLocal nodo, Cifrado cifrado) {
        this.repo = repo;
        this.docs = docs;
        this.cuentas = cuentas;
        this.difusor = difusor;
        this.nodo = nodo;
        this.cifrado = cifrado;
    }

    public Espacio requerir(String id) {
        return repo.porId(id).orElseThrow(() -> ErrorNom.noEncontrado("El espacio"));
    }

    public Permiso exigir(Espacio e, Usuario u, Permiso minimo) {
        Permiso p = e.permisoDe(u.id);
        if (p == null) throw ErrorNom.prohibido("No tienes acceso a este espacio");
        if (!p.alMenos(minimo)) {
            throw ErrorNom.prohibido(switch (minimo) {
                case PROPIETARIO -> "Solo el propietario puede hacer esto";
                case EDICION -> "Tu permiso es de solo lectura";
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
        m.put("documentos", ds.size());
        m.put("conexion", e.conexion.activa);
        m.put("conectados", difusor.conectadosPublico(e.id));
        m.put("solicitudes", e.permisoDe(u.id) == Permiso.PROPIETARIO ? e.solicitudes.size() : 0);
        m.put("actividad", ds.isEmpty() ? e.creado : Math.max(e.creado, ds.get(0).modificado));
        return m;
    }

    /** CU-13 Crear espacio de trabajo. */
    public synchronized Espacio crear(Usuario u, String nombre) {
        nombre = nombre == null ? "" : nombre.trim();
        if (nombre.isEmpty()) throw ErrorNom.invalido("Ponle un nombre al espacio", "nombre");
        if (nombre.length() > 60) throw ErrorNom.invalido("Máximo 60 caracteres", "nombre");
        String clave = nombre.toLowerCase(Locale.ROOT);
        boolean repetido = repo.todos().stream()
                .anyMatch(e -> u.id.equals(e.propietarioId) && e.nombre.toLowerCase(Locale.ROOT).equals(clave));
        if (repetido) throw new ErrorNom(HttpStatus.CONFLICT, "Ya tienes un espacio con ese nombre", "nombre");
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
                .orElseThrow(() -> new ErrorNom(HttpStatus.NOT_FOUND, "El usuario \"" + nombreUsuario.trim() + "\" no existe", "usuario"));
        if (otro.id.equals(e.propietarioId))
            throw ErrorNom.invalido("El espacio no puede quedar sin dueño", "usuario");
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
