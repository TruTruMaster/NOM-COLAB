package mx.wack.nom.android.anfitrion;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import mx.wack.nom.android.anfitrion.ServidorHttp.Peticion;
import mx.wack.nom.android.anfitrion.ServidorHttp.Respuesta;
import mx.wack.nom.core.modelo.Documento;
import mx.wack.nom.core.modelo.Espacio;
import mx.wack.nom.core.modelo.Permiso;
import mx.wack.nom.core.modelo.Preferencias;
import mx.wack.nom.core.modelo.Sesion;
import mx.wack.nom.core.modelo.Usuario;
import mx.wack.nom.core.red.Descubrimiento;
import mx.wack.nom.core.servicio.Bitacora;
import mx.wack.nom.core.servicio.Difusor;
import mx.wack.nom.core.servicio.ErrorNom;
import mx.wack.nom.core.servicio.Nodo;
import mx.wack.nom.core.servicio.ServicioCuentas;
import mx.wack.nom.core.servicio.ServicioDocumentos;
import mx.wack.nom.core.servicio.ServicioEspacios;

/**
 * La API del servidor del teléfono: las mismas rutas, respuestas y códigos que la de la
 * computadora (CuentasApi, EspaciosApi, DocumentosApi, RedApi y el filtro de sesión), sobre los
 * mismos servicios compartidos.
 */
final class ApiTelefono {
    private static final Bitacora log = Bitacora.de(ApiTelefono.class);
    private static final String ID = "([^/]+)";

    private final ServicioCuentas cuentas;
    private final ServicioEspacios espacios;
    private final ServicioDocumentos documentos;
    private final Difusor difusor;
    private final Descubrimiento descubrimiento;
    private final Nodo nodo;

    ApiTelefono(ServicioCuentas cuentas, ServicioEspacios espacios, ServicioDocumentos documentos, Difusor difusor,
                Descubrimiento descubrimiento, Nodo nodo) {
        this.cuentas = cuentas;
        this.espacios = espacios;
        this.documentos = documentos;
        this.difusor = difusor;
        this.descubrimiento = descubrimiento;
        this.nodo = nodo;
    }

    // ------------------------------------------------------------------ utilidades

    private static Respuesta ok(Object cuerpo) { return Respuesta.json(200, cuerpo); }

    private static Respuesta creado(Object cuerpo) { return Respuesta.json(201, cuerpo); }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> cuerpo(Peticion p) {
        Object o = p.json();
        return o instanceof Map ? (Map<String, Object>) o : new LinkedHashMap<>();
    }

    private static String texto(Map<String, Object> m, String k) {
        Object v = m.get(k);
        return v == null ? null : String.valueOf(v);
    }

    private Matcher coincide(String patron, String ruta) {
        Matcher m = Pattern.compile("^" + patron + "$").matcher(ruta);
        return m.matches() ? m : null;
    }

    /** Errores igual que ManejoErrores: los de negocio con su código y el resto como 400 o 500. */
    Respuesta error(Throwable e) {
        if (e instanceof ErrorNom) {
            ErrorNom x = (ErrorNom) e;
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("error", x.getMessage());
            if (x.campo != null) c.put("campo", x.campo);
            if (x.extra != null) c.put("detalle", x.extra);
            return Respuesta.json(x.estado, c);
        }
        if (e instanceof IllegalArgumentException) return Respuesta.json(400, Map.of("error", String.valueOf(e.getMessage())));
        log.error("Error no controlado", e);
        return Respuesta.json(500, Map.of("error", "Ocurrio un error inesperado. Intenta de nuevo."));
    }

    /** FiltroSesion: token en "Authorization: Bearer …" o en ?token= (EventSource). */
    private Usuario usuario(Peticion p) {
        String token = null;
        String cab = p.cabecera("authorization");
        if (cab != null && cab.startsWith("Bearer ")) token = cab.substring(7).trim();
        if (token == null) token = p.consulta.get("token");
        if (token == null || token.isBlank()) throw new ErrorNom(ErrorNom.SIN_SESION, "Inicia sesion para continuar");
        return cuentas.usuarioDeToken(token)
                .orElseThrow(() -> new ErrorNom(ErrorNom.SIN_SESION, "Tu sesion expiro. Inicia sesion de nuevo."));
    }

    private Map<String, Object> yo(Usuario u, String token, long expira) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (token != null) {
            m.put("token", token);
            m.put("expira", expira);
        }
        m.put("usuario", ServicioCuentas.publico(u));
        m.put("preferencias", u.preferencias);
        return m;
    }

    Map<String, Object> info() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("nom", 1);
        m.put("servidor", nodo.id());
        m.put("equipo", nodo.equipo());
        m.put("puerto", nodo.puerto());
        m.put("direcciones", nodo.direcciones());
        m.put("version", "0.1.0");
        m.put("hora", System.currentTimeMillis());
        m.put("lan", descubrimiento.lanActiva());
        m.put("telefono", true);
        return m;
    }

    // ------------------------------------------------------------------ rutas

    Respuesta atender(Peticion p) {
        try {
            return rutas(p);
        } catch (Throwable e) {
            return error(e);
        }
    }

    private Respuesta rutas(Peticion p) {
        final String r = p.ruta, m = p.metodo;
        Matcher x;
        // Públicas (las mismas que excluye ConfigWeb del filtro de sesión).
        if (r.equals("/api/red/info") && m.equals("GET")) return ok(info());
        if (r.equals("/api/cuentas/registro") && m.equals("POST")) {
            Map<String, Object> c = cuerpo(p);
            Usuario u = cuentas.registrar(texto(c, "nombre"), texto(c, "contrasena"), texto(c, "empresa"));
            return creado(Map.of("usuario", ServicioCuentas.publico(u), "mensaje", "Registro exitoso"));
        }
        if (r.equals("/api/cuentas/sesion")) {
            if (m.equals("POST")) {
                Map<String, Object> c = cuerpo(p);
                Sesion s = cuentas.iniciarSesion(texto(c, "nombre"), texto(c, "contrasena"));
                return ok(yo(cuentas.porId(s.usuarioId).orElseThrow(), s.token, s.expira));
            }
            if (m.equals("DELETE")) {
                String auth = p.cabecera("authorization");
                if (auth != null && auth.startsWith("Bearer ")) cuentas.cerrarSesion(auth.substring(7).trim());
                return ok(Map.of("ok", true));
            }
        }

        Usuario u = usuario(p);

        // ---- cuentas
        if (r.equals("/api/cuentas/yo") && m.equals("GET")) return ok(yo(u, null, 0));
        if (r.equals("/api/cuentas/preferencias") && m.equals("PUT")) {
            Object c = p.json();
            return ok(cuentas.guardarPreferencias(u, c == null ? null : Json.aObjeto(c, Preferencias.class)));
        }

        // ---- espacios
        if (r.equals("/api/espacios")) {
            if (m.equals("GET")) return ok(espacios.listar(u));
            if (m.equals("POST")) return creado(espacios.resumen(espacios.crear(u, texto(cuerpo(p), "nombre")), u));
        }
        if ((x = coincide("/api/espacios/" + ID, r)) != null) {
            String id = x.group(1);
            if (m.equals("GET")) {
                Espacio e = espacios.requerir(id);
                espacios.exigir(e, u, Permiso.LECTURA);
                Map<String, Object> d = new LinkedHashMap<>(espacios.resumen(e, u));
                d.put("conexionDetalle", espacios.estadoConexion(e));
                d.put("lista", documentos.listar(u, id));
                return ok(d);
            }
            if (m.equals("PUT")) return ok(espacios.resumen(espacios.renombrar(u, id, texto(cuerpo(p), "nombre")), u));
        }
        if ((x = coincide("/api/espacios/" + ID + "/eventos", r)) != null && m.equals("GET")) {
            String id = x.group(1), cliente = p.consulta.getOrDefault("cliente", "");
            espacios.exigir(espacios.requerir(id), u, Permiso.LECTURA);
            return Respuesta.sse(canal -> difusor.suscribir(u, id, null, cliente, canal));
        }
        if ((x = coincide("/api/espacios/" + ID + "/conexion", r)) != null && m.equals("PUT"))
            return ok(espacios.conexion(u, x.group(1), Boolean.TRUE.equals(cuerpo(p).get("activa"))));
        if ((x = coincide("/api/espacios/" + ID + "/unirse", r)) != null && m.equals("POST"))
            return ok(espacios.unirse(u, x.group(1)));
        if ((x = coincide("/api/espacios/" + ID + "/accesos", r)) != null) {
            if (m.equals("GET")) return ok(espacios.accesos(u, x.group(1)));
            if (m.equals("PUT")) {
                Map<String, Object> c = cuerpo(p);
                String permiso = texto(c, "permiso");
                Permiso pm = permiso == null || permiso.isBlank() || "NINGUNO".equals(permiso) ? null : Permiso.valueOf(permiso);
                return ok(espacios.cambiarAcceso(u, x.group(1), texto(c, "usuario"), pm));
            }
        }
        if ((x = coincide("/api/espacios/" + ID + "/solicitudes/" + ID, r)) != null && m.equals("DELETE"))
            return ok(espacios.rechazarSolicitud(u, x.group(1), x.group(2)));
        if ((x = coincide("/api/espacios/" + ID + "/almacenamiento", r)) != null && m.equals("GET"))
            return ok(espacios.almacenamiento(u, x.group(1)));
        if ((x = coincide("/api/espacios/" + ID + "/almacenamiento/depurar", r)) != null && m.equals("POST")) {
            Object c = cuerpo(p).get("conservar");
            return ok(espacios.depurar(u, x.group(1), c instanceof Number ? ((Number) c).intValue() : 0));
        }
        if ((x = coincide("/api/espacios/" + ID + "/documentos", r)) != null) {
            if (m.equals("GET")) return ok(documentos.listar(u, x.group(1)));
            if (m.equals("POST")) {
                Map<String, Object> c = cuerpo(p);
                Documento d = documentos.crear(u, x.group(1), texto(c, "nombre"), texto(c, "modo"), Json.operaciones(c.get("ops")));
                return creado(d);
            }
        }

        // ---- documentos
        if ((x = coincide("/api/documentos/" + ID, r)) != null) {
            if (m.equals("GET")) return ok(documentos.abrir(u, x.group(1)));
            if (m.equals("DELETE")) {
                documentos.eliminar(u, x.group(1));
                return ok(Map.of("ok", true));
            }
        }
        if ((x = coincide("/api/documentos/" + ID + "/ops", r)) != null && m.equals("POST")) {
            Map<String, Object> c = cuerpo(p);
            return ok(documentos.aplicar(u, x.group(1), Json.operaciones(c.get("ops")), texto(c, "cliente"), texto(c, "dispositivo")));
        }
        if ((x = coincide("/api/documentos/" + ID + "/actividad", r)) != null && m.equals("GET"))
            return ok(documentos.actividad(u, x.group(1)));
        if ((x = coincide("/api/documentos/" + ID + "/eventos", r)) != null && m.equals("GET")) {
            String id = x.group(1), cliente = p.consulta.getOrDefault("cliente", "");
            Documento d = documentos.requerir(id);
            documentos.permiso(u, d, Permiso.LECTURA);
            return Respuesta.sse(canal -> difusor.suscribir(u, d.espacioId, id, cliente, canal));
        }
        if ((x = coincide("/api/documentos/" + ID + "/presencia", r)) != null && m.equals("POST")) {
            Map<String, Object> c = cuerpo(p);
            @SuppressWarnings("unchecked")
            Map<String, Object> cursor = c.get("cursor") instanceof Map ? (Map<String, Object>) c.get("cursor") : null;
            difusor.actualizarPresencia(x.group(1), texto(c, "cliente"), texto(c, "bloque"), texto(c, "modo"), cursor);
            return ok(Map.of("ok", true));
        }
        if ((x = coincide("/api/documentos/" + ID + "/versiones", r)) != null) {
            if (m.equals("GET")) return ok(documentos.historial(u, x.group(1)));
            if (m.equals("POST")) return ok(documentos.guardarVersion(u, x.group(1), texto(cuerpo(p), "etiqueta")));
        }
        if ((x = coincide("/api/documentos/" + ID + "/versiones/(\\d+)", r)) != null && m.equals("GET"))
            return ok(documentos.foto(u, x.group(1), Integer.parseInt(x.group(2))));
        if ((x = coincide("/api/documentos/" + ID + "/versiones/(\\d+)/restaurar", r)) != null && m.equals("POST"))
            return ok(documentos.restaurar(u, x.group(1), Integer.parseInt(x.group(2))));

        // ---- red
        if (r.equals("/api/red/descubrir") && m.equals("GET")) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("espacios", descubrimiento.buscarEnLan());
            d.put("udp", descubrimiento.udpActivo());
            d.put("sinRed", nodo.direcciones().isEmpty());
            return ok(d);
        }
        return Respuesta.json(404, Map.of("error", "No existe"));
    }
}
