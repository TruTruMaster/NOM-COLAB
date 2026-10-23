package mx.wack.nom.android.anfitrion;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import mx.wack.nom.core.almacen.RepositorioDocumentos;
import mx.wack.nom.core.almacen.RepositorioEspacios;
import mx.wack.nom.core.almacen.RepositorioUsuarios;
import mx.wack.nom.core.crdt.EstadoDocumento;
import mx.wack.nom.core.modelo.Documento;
import mx.wack.nom.core.modelo.Espacio;
import mx.wack.nom.core.modelo.Rol;
import mx.wack.nom.core.modelo.Sesion;
import mx.wack.nom.core.modelo.Usuario;
import mx.wack.nom.core.modelo.Version;

/**
 * Los repositorios del servidor del teléfono, en archivos JSON con la misma forma que los de la
 * computadora (documentos.json, docs/{id}/estado.json, versiones.json, v/{n}.json,
 * actividad.jsonl). En la computadora las cuentas van en una base de datos; aquí, en
 * usuarios.json y sesiones.json.
 */
final class Repositorios {
    private Repositorios() { }

    @SuppressWarnings("unchecked")
    private static <T> Map<String, T> mapa(Almacen a, String archivo, Class<T> tipo) {
        Map<String, T> r = new LinkedHashMap<>();
        Object leido = a.leer(archivo, null);
        if (leido instanceof Map) {
            for (Map.Entry<String, Object> e : ((Map<String, Object>) leido).entrySet()) {
                T v = Json.aObjeto(e.getValue(), tipo);
                if (v != null) r.put(e.getKey(), v);
            }
        }
        return r;
    }

    // ================================================================== usuarios y sesiones
    static final class Usuarios implements RepositorioUsuarios {
        private final Almacen almacen;
        private final Map<String, Usuario> usuarios;
        private final Map<String, Sesion> sesiones;

        Usuarios(Almacen almacen) {
            this.almacen = almacen;
            this.usuarios = mapa(almacen, "usuarios.json", Usuario.class);
            this.sesiones = mapa(almacen, "sesiones.json", Sesion.class);
            long ahora = System.currentTimeMillis();
            if (sesiones.values().removeIf(s -> !s.vigente(ahora))) almacen.escribir("sesiones.json", sesiones);
        }

        @Override public synchronized Optional<Usuario> porId(String id) { return Optional.ofNullable(id == null ? null : usuarios.get(id)); }

        @Override public synchronized Optional<Usuario> porNombre(String nombre) {
            if (nombre == null) return Optional.empty();
            String clave = nombre.trim().toLowerCase(Locale.ROOT);
            for (Usuario u : usuarios.values()) if (clave.equals(u.nombreClave)) return Optional.of(u);
            return Optional.empty();
        }

        /** La más antigua primero (así "la cuenta más antigua administra" es igual que en la computadora). */
        @Override public synchronized Collection<Usuario> todos() {
            List<Usuario> l = new ArrayList<>(usuarios.values());
            l.sort(Comparator.comparingLong(u -> u.creado));
            return l;
        }

        @Override public synchronized void guardar(Usuario u) {
            usuarios.put(u.id, u);
            almacen.escribir("usuarios.json", usuarios);
        }

        @Override public synchronized Optional<Sesion> sesion(String token) { return Optional.ofNullable(token == null ? null : sesiones.get(token)); }

        @Override public synchronized void guardarSesion(Sesion s) {
            sesiones.put(s.token, s);
            almacen.escribir("sesiones.json", sesiones);
        }

        @Override public synchronized void borrarSesion(String token) {
            if (sesiones.remove(token) != null) almacen.escribir("sesiones.json", sesiones);
        }

        @Override public synchronized long cuantosConRol(Rol rol) {
            return usuarios.values().stream().filter(u -> u.rol == rol).count();
        }
    }

    // ================================================================== espacios
    static final class Espacios implements RepositorioEspacios {
        private final Almacen almacen;
        private final Map<String, Espacio> espacios;

        Espacios(Almacen almacen) {
            this.almacen = almacen;
            this.espacios = mapa(almacen, "espacios.json", Espacio.class);
        }

        @Override public synchronized Optional<Espacio> porId(String id) { return Optional.ofNullable(id == null ? null : espacios.get(id)); }

        @Override public synchronized Collection<Espacio> todos() { return new ArrayList<>(espacios.values()); }

        @Override public synchronized void guardar(Espacio e) {
            espacios.put(e.id, e);
            almacen.escribir("espacios.json", espacios);
        }
    }

    // ================================================================== documentos, estados y versiones
    static final class Documentos implements RepositorioDocumentos {
        private final Almacen almacen;
        private final Map<String, Documento> docs;
        private final Map<String, EstadoDocumento> estados = new ConcurrentHashMap<>();

        Documentos(Almacen almacen) {
            this.almacen = almacen;
            this.docs = mapa(almacen, "documentos.json", Documento.class);
        }

        @Override public synchronized Optional<Documento> porId(String id) { return Optional.ofNullable(id == null ? null : docs.get(id)); }

        @Override public synchronized List<Documento> delEspacio(String espacioId) {
            List<Documento> l = new ArrayList<>();
            for (Documento d : docs.values()) if (espacioId.equals(d.espacioId)) l.add(d);
            l.sort((a, b) -> Long.compare(b.modificado, a.modificado));
            return l;
        }

        @Override public synchronized void guardar(Documento d) {
            docs.put(d.id, d);
            almacen.escribir("documentos.json", docs);
        }

        @Override public synchronized void borrar(String id) {
            docs.remove(id);
            estados.remove(id);
            almacen.escribir("documentos.json", docs);
            almacen.borrar("docs/" + id);
        }

        @Override public EstadoDocumento estado(String docId) {
            return estados.computeIfAbsent(docId, id -> {
                EstadoDocumento e = Json.aObjeto(almacen.leer("docs/" + id + "/estado.json", null), EstadoDocumento.class);
                return e == null ? new EstadoDocumento() : e;
            });
        }

        @Override public void guardarEstado(String docId, EstadoDocumento estado) {
            estados.put(docId, estado);
            almacen.escribir("docs/" + docId + "/estado.json", estado);
        }

        @Override public long bytesEstado(String docId) { return almacen.tamano("docs/" + docId + "/estado.json"); }

        @SuppressWarnings("unchecked")
        @Override public synchronized List<Version> historial(String docId) {
            List<Version> r = new ArrayList<>();
            Object l = almacen.leer("docs/" + docId + "/versiones.json", null);
            if (l instanceof List) for (Object o : (List<Object>) l) r.add(Json.aObjeto(o, Version.class));
            return r;
        }

        @SuppressWarnings("unchecked")
        @Override public Map<String, Map<String, Object>> fotoVersion(String docId, int numero) {
            Object f = almacen.leer("docs/" + docId + "/v/" + numero + ".json", null);
            return f instanceof Map ? (Map<String, Map<String, Object>>) f : null;
        }

        @Override public synchronized void guardarVersion(String docId, Version v, Map<String, Map<String, Object>> foto) {
            String ruta = "docs/" + docId + "/v/" + v.numero + ".json";
            almacen.escribir(ruta, foto);
            v.bytes = almacen.tamano(ruta);
            List<Version> h = historial(docId);
            h.add(v);
            almacen.escribir("docs/" + docId + "/versiones.json", h);
        }

        @Override public void anotarActividad(String docId, Map<String, Object> entrada) {
            almacen.agregarLinea("docs/" + docId + "/actividad.jsonl", entrada);
        }

        @SuppressWarnings("unchecked")
        @Override public List<Map<String, Object>> actividad(String docId, int max) {
            java.io.File f = almacen.ruta("docs/" + docId + "/actividad.jsonl");
            if (!f.isFile()) return List.of();
            String[] lineas = Almacen.leerTexto(f).split("\n");
            List<Map<String, Object>> r = new ArrayList<>();
            for (int i = lineas.length - 1; i >= 0 && r.size() < max; i--) {
                if (lineas[i].isBlank()) continue;
                Object o = Json.YO.leer(lineas[i]);
                if (o instanceof Map) r.add((Map<String, Object>) o);
            }
            return r;
        }

        @Override public synchronized long depurar(String docId, int conservar) {
            List<Version> h = historial(docId);
            if (h.size() <= conservar) return 0;
            long liberado = 0;
            for (Version v : h.subList(0, h.size() - conservar)) {
                liberado += v.bytes;
                almacen.borrar("docs/" + docId + "/v/" + v.numero + ".json");
            }
            almacen.escribir("docs/" + docId + "/versiones.json", new ArrayList<>(h.subList(h.size() - conservar, h.size())));
            return liberado;
        }
    }
}
