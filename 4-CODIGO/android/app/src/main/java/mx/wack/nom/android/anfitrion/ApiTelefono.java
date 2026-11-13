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
import mx.wack.nom.core.servicio.ServicioFuentes;
import mx.wack.nom.core.servicio.ServicioSincronia;
import mx.wack.nom.core.servicio.ServicioPases;

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
    private final ServicioSincronia sincronia;
    private final ServicioFuentes fuentes;
    private final ServicioPases pases;

    ApiTelefono(ServicioCuentas cuentas, ServicioEspacios espacios, ServicioDocumentos documentos, Difusor difusor,
                Descubrimiento descubrimiento, Nodo nodo, ServicioSincronia sincronia, ServicioFuentes fuentes, ServicioPases pases) {
        this.fuentes = fuentes;
        this.pases = pases;
        this.cuentas = cuentas;
        this.espacios = espacios;
        this.documentos = documentos;
        this.difusor = difusor;
        this.descubrimiento = descubrimiento;
        this.nodo = nodo;
        this.sincronia = sincronia;
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

    /**
     * FiltroSesion: el token va en "Authorization: Bearer …"; el canal en vivo (EventSource) trae un
     * boleto de un solo uso en ?boleto= (o, las apps anteriores, el token en ?token=).
     */
    private String token(Peticion p) {
        String token = null;
        String cab = p.cabecera("authorization");
        if (cab != null && cab.startsWith("Bearer ")) token = cab.substring(7).trim();
        if (token == null && p.consulta.get("boleto") != null) token = cuentas.canjearBoleto(p.consulta.get("boleto")).orElse(null);
        if (token == null) token = p.consulta.get("token");
        if (token == null || token.isBlank()) throw new ErrorNom(ErrorNom.SIN_SESION, "Inicia sesion para continuar");
        return token;
    }

    private Usuario usuario(String token) {
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
        m.put("recuperacion", ServicioCuentas.tieneRecuperacion(u));
        return m;
    }

    private static Permiso permisoDe(String p, Permiso siFalta) {
        return p == null || p.isBlank() ? siFalta : Permiso.valueOf(p);
    }

    private static long largo(Object o) { return o instanceof Number ? ((Number) o).longValue() : 0; }

    /** La base de una rama: nodo -> reloj. */
    private static Map<String, Long> base(Object o) {
        Map<String, Long> r = new LinkedHashMap<>();
        if (o instanceof Map) for (Map.Entry<?, ?> e : ((Map<?, ?>) o).entrySet()) if (e.getValue() instanceof Number) r.put(String.valueOf(e.getKey()), ((Number) e.getValue()).longValue());
        return r;
    }

    private static java.util.List<String> lista(Object o) {
        java.util.List<String> r = new java.util.ArrayList<>();
        if (o instanceof java.util.List) for (Object x : (java.util.List<?>) o) if (x != null) r.add(String.valueOf(x));
        return r;
    }

    Map<String, Object> info() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("nom", 1);
        m.put("servidor", nodo.id());
        m.put("equipo", nodo.equipo());
        m.put("puerto", nodo.puerto());
        m.put("direcciones", nodo.direcciones());
        m.put("version", mx.wack.nom.core.Version.APP);
        m.put("interfaz", mx.wack.nom.core.Version.INTERFAZ);
        m.put("hora", System.currentTimeMillis());
        m.put("lan", descubrimiento.lanActiva());
        m.put("telefono", true);
        // Fase 13: aquí no hay cuentas con contraseña (alias, o la cuenta de la nube con un pase).
        m.put("cuentas", false);
        m.put("firmaPases", false);
        m.put("pases", pases.aceptaPases());
        m.put("nubes", pases.nubes());
        return m;
    }

    /** Fase 13: el teléfono no tiene cuentas con contraseña. */
    private static Respuesta sinCuentas() {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("error", "En este teléfono se entra con alias, o con tu cuenta si tienes Internet");
        c.put("sinCuentas", true);
        return Respuesta.json(403, c);
    }

    /**
     * El dueño del teléfono entra a su propio servidor con su alias. Solo desde este mismo teléfono
     * (127.0.0.1) y con la llave que guarda la app: la primera vez se crea el alias, y los espacios
     * de las cuentas de antes (ya retiradas) pasan a él.
     */
    private Respuesta aliasDelDueno(Peticion p) {
        if (p.origen != null) throw ErrorNom.prohibido("Desde otro equipo se entra con el código o el QR de un espacio");
        String llave = texto(cuerpo(p), "llave");
        Usuario dueno = cuentas.duenoDelTelefono().orElse(null);
        Sesion s = dueno == null ? cuentas.crearAlias(null, llave, true) : cuentas.entrarAlias(dueno.id, llave, null);
        Usuario u = cuentas.porId(s.usuarioId).orElseThrow();
        int n = espacios.traspasarDeRetiradas(u);
        Map<String, Object> r = new LinkedHashMap<>(yo(u, s.token, s.expira));
        if (n > 0) r.put("espaciosRecibidos", n);
        return ok(r);
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
        // Fase 13, A.1: en el teléfono que comparte nadie crea cuenta ni entra con contraseña.
        if ((r.equals("/api/cuentas/registro") || r.equals("/api/cuentas/recuperar")) && m.equals("POST")) return sinCuentas();
        // A.1 El dueño del teléfono (desde este mismo teléfono): su alias, con la llave de la app.
        if (r.equals("/api/cuentas/alias") && m.equals("POST")) return aliasDelDueno(p);
        // Volver a entrar con el alias que este equipo ya tenía (su llave), aunque el código haya vencido.
        if (r.equals("/api/cuentas/alias/entrar") && m.equals("POST")) {
            Map<String, Object> c = cuerpo(p);
            // El alias del dueño solo entra desde este mismo teléfono.
            if (p.origen != null && cuentas.porId(texto(c, "id")).map(cu -> cu.dueno).orElse(false))
                throw ErrorNom.prohibido("Ese alias solo entra desde el teléfono que comparte");
            Sesion s = cuentas.entrarAlias(texto(c, "id"), texto(c, "llave"), p.origen);
            return ok(yo(cuentas.porId(s.usuarioId).orElseThrow(), s.token, s.expira));
        }
        // A.2 Quien sí tiene Internet presenta el pase que le dio la nube.
        if (r.equals("/api/cuentas/pase/entrar") && m.equals("POST")) {
            if (!pases.aceptaPases()) throw ErrorNom.prohibido("Este teléfono no tiene la llave de ninguna nube");
            cuentas.limitarPases(p.origen);
            Sesion s = cuentas.desdePase(pases.verificar(texto(cuerpo(p), "pase")));
            return ok(yo(cuentas.porId(s.usuarioId).orElseThrow(), s.token, s.expira));
        }
        if (r.equals("/api/cuentas/pase/llave") && m.equals("GET")) return Respuesta.json(404, Map.of("error", "El teléfono no firma pases"));
        if ((x = coincide("/api/enlaces/" + ID + "/alias", r)) != null && m.equals("POST")) {
            Map<String, Object> c = cuerpo(p);
            return ok(espacios.entrarConAlias(x.group(1), texto(c, "id"), texto(c, "llave"), p.origen));
        }
        // Enlaces para unirse (QR), recibos y proyeccion: sin sesion (como en ConfigWeb).
        if ((x = coincide("/api/enlaces/" + ID, r)) != null && m.equals("GET")) return ok(espacios.infoEnlace(x.group(1)));
        if ((x = coincide("/api/enlaces/" + ID + "/invitado", r)) != null && m.equals("POST"))
            return ok(espacios.entrarComoInvitado(x.group(1), texto(cuerpo(p), "apodo")));
        if (r.equals("/api/recibos/verificar") && m.equals("POST")) return ok(documentos.verificarRecibo(cuerpo(p)));
        if ((x = coincide("/api/proyeccion/" + ID, r)) != null && m.equals("GET")) return ok(documentos.verProyeccion(x.group(1)));
        // 8.5 Ver un solo documento con su enlace (sin cuenta).
        if ((x = coincide("/api/ver/" + ID, r)) != null && m.equals("GET")) return ok(documentos.verPublico(x.group(1)));
        if ((x = coincide("/api/proyeccion/" + ID + "/eventos", r)) != null && m.equals("GET")) {
            String codigo = x.group(1);
            return Respuesta.sse(canal -> documentos.suscribirProyeccion(codigo, canal));
        }
        if (r.equals("/api/cuentas/sesion")) {
            if (m.equals("POST")) return sinCuentas();
            if (m.equals("DELETE")) {
                String auth = p.cabecera("authorization");
                if (auth != null && auth.startsWith("Bearer ")) cuentas.cerrarSesion(auth.substring(7).trim());
                return ok(Map.of("ok", true));
            }
        }

        final String token = token(p);
        Usuario u = usuario(token);

        // ---- cuentas
        if (r.equals("/api/cuentas/yo") && m.equals("GET")) return ok(yo(u, null, 0));
        if (r.equals("/api/cuentas/contrasena") && m.equals("PUT")) {
            Map<String, Object> c = cuerpo(p);
            Sesion s = cuentas.cambiarContrasena(u, texto(c, "actual"), texto(c, "nueva"), p.origen);
            return ok(yo(u, s.token, s.expira));
        }
        if (r.equals("/api/cuentas/eliminar") && m.equals("POST")) {
            cuentas.confirmarParaBorrar(u, texto(cuerpo(p), "contrasena"), p.origen);
            return ok(documentos.eliminarCuenta(u));
        }
        if (r.equals("/api/cuentas/boleto") && m.equals("POST")) return ok(Map.of("boleto", cuentas.boleto(token)));
        if (r.equals("/api/cuentas/pase") && m.equals("POST")) throw ErrorNom.prohibido("El teléfono no da pases: se piden a la nube");
        if (r.equals("/api/cuentas/almacenamiento") && m.equals("GET")) return ok(documentos.almacenamientoDe(u));
        if (r.equals("/api/cuentas/preferencias") && m.equals("PUT")) {
            Object c = p.json();
            return ok(cuentas.guardarPreferencias(u, c == null ? null : Json.aObjeto(c, Preferencias.class)));
        }
        if (r.equals("/api/cuentas/recuperacion") && m.equals("POST")) return ok(Map.of("recuperacion", cuentas.nuevoCodigoRecuperacion(u)));
        if ((x = coincide("/api/enlaces/" + ID + "/entrar", r)) != null && m.equals("POST")) return ok(espacios.entrarConEnlace(u, x.group(1)));

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
        if ((x = coincide("/api/espacios/" + ID + "/formato", r)) != null && m.equals("PUT"))
            return ok(espacios.fijarFormatoBase(u, x.group(1), cuerpo(p)));
        if ((x = coincide("/api/espacios/" + ID + "/enlaces", r)) != null) {
            if (m.equals("GET")) return ok(espacios.enlaces(u, x.group(1)));
            if (m.equals("POST")) {
                Map<String, Object> c = cuerpo(p);
                Object h = c.get("horas");
                return creado(espacios.crearEnlace(u, x.group(1), permisoDe(texto(c, "permiso"), Permiso.EDICION),
                        h instanceof Number ? ((Number) h).intValue() : 24, Boolean.TRUE.equals(c.get("invitados"))));
            }
        }
        if ((x = coincide("/api/espacios/" + ID + "/enlaces/" + ID, r)) != null && m.equals("DELETE"))
            return ok(espacios.revocarEnlace(u, x.group(1), x.group(2)));
        if ((x = coincide("/api/espacios/" + ID + "/sincronia", r)) != null) {
            if (m.equals("PUT")) {
                Map<String, Object> c = cuerpo(p);
                return ok(sincronia.configurar(u, x.group(1), texto(c, "servidor"), texto(c, "usuario"), texto(c, "contrasena")));
            }
            if (m.equals("POST")) return ok(sincronia.sincronizar(u, x.group(1)));
            if (m.equals("DELETE")) return ok(sincronia.quitar(u, x.group(1)));
        }
        if ((x = coincide("/api/espacios/" + ID + "/almacenamiento", r)) != null && m.equals("GET")) {
            Map<String, Object> a = new LinkedHashMap<>(espacios.almacenamiento(u, x.group(1)));
            a.put("cuota", documentos.cuota());
            a.put("usoPropietario", documentos.usoDe(espacios.requerir(x.group(1)).propietarioId));
            return ok(a);
        }
        if ((x = coincide("/api/espacios/" + ID + "/almacenamiento/depurar", r)) != null && m.equals("POST")) {
            Object c = cuerpo(p).get("conservar");
            return ok(espacios.depurar(u, x.group(1), c instanceof Number ? ((Number) c).intValue() : 0));
        }
        // ---- Fase 9: fuentes para investigar y citar, y la biblioteca del espacio
        if (r.equals("/api/fuentes/web") && m.equals("GET")) return ok(fuentes.web(u, p.consulta.getOrDefault("url", "")));
        if (r.equals("/api/fuentes/doi") && m.equals("GET")) return ok(fuentes.porDoi(u, p.consulta.getOrDefault("doi", "")));
        if (r.equals("/api/fuentes/isbn") && m.equals("GET")) return ok(fuentes.porIsbn(u, p.consulta.getOrDefault("isbn", "")));
        if (r.equals("/api/fuentes/buscar") && m.equals("GET")) return ok(fuentes.buscar(u, p.consulta.getOrDefault("q", ""), p.consulta.getOrDefault("donde", "wikipedia")));
        if (r.equals("/api/fuentes/wikipedia") && m.equals("GET")) return ok(fuentes.wikipedia(u, p.consulta.getOrDefault("titulo", "")));
        if (r.equals("/api/fuentes/datos") && m.equals("GET")) return ok(fuentes.conjuntos());
        if ((x = coincide("/api/fuentes/datos/" + ID, r)) != null && m.equals("GET")) return ok(fuentes.wikidata(u, x.group(1)));
        if ((x = coincide("/api/espacios/" + ID + "/biblioteca", r)) != null) {
            if (m.equals("GET")) { String q = p.consulta.getOrDefault("q", ""); return ok(q.isBlank() ? fuentes.biblioteca(u, x.group(1)) : fuentes.buscarEnBiblioteca(u, x.group(1), q)); }
            if (m.equals("POST")) return ok(fuentes.guardarEnBiblioteca(u, x.group(1), cuerpo(p)));
        }
        if ((x = coincide("/api/espacios/" + ID + "/biblioteca/" + ID, r)) != null) {
            if (m.equals("GET")) return ok(fuentes.deBiblioteca(u, x.group(1), x.group(2)));
            if (m.equals("DELETE")) return ok(fuentes.quitarDeBiblioteca(u, x.group(1), x.group(2)));
        }
        // ---- 8.5 papelera, buscar, carpetas y avisos
        if ((x = coincide("/api/espacios/" + ID + "/papelera", r)) != null) {
            if (m.equals("GET")) return ok(documentos.papelera(u, x.group(1)));
            if (m.equals("DELETE")) return ok(documentos.vaciarPapelera(u, x.group(1)));
        }
        if ((x = coincide("/api/espacios/" + ID + "/buscar", r)) != null && m.equals("GET"))
            return ok(documentos.buscar(u, x.group(1), p.consulta.getOrDefault("q", "")));
        if ((x = coincide("/api/espacios/" + ID + "/carpetas", r)) != null && m.equals("PUT")) {
            Map<String, Object> c = cuerpo(p);
            return ok(documentos.renombrarCarpeta(u, x.group(1), texto(c, "de"), texto(c, "a")));
        }
        if ((x = coincide("/api/espacios/" + ID + "/avisos", r)) != null && m.equals("GET")) return ok(espacios.avisos(u, x.group(1)));
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
        // ---- fase 13, parte B: ramas de lo editado sin Internet
        if ((x = coincide("/api/documentos/" + ID + "/cambios-desde", r)) != null && m.equals("POST")) {
            Map<String, Object> c = cuerpo(p);
            return ok(documentos.cambiosDesdeBase(u, x.group(1), base(c.get("base")), lista(c.get("nodos")), largo(c.get("desde"))));
        }
        if ((x = coincide("/api/documentos/" + ID + "/ramas", r)) != null) {
            if (m.equals("GET")) return ok(documentos.ramas(u, x.group(1)));
            if (m.equals("POST")) {
                Map<String, Object> c = cuerpo(p);
                return creado(documentos.crearRama(u, x.group(1), texto(c, "nombre"), Json.operaciones(c.get("ops")), base(c.get("base")),
                        lista(c.get("nodos")), Json.operaciones(c.get("propios")), texto(c, "motivo"), largo(c.get("desde"))));
            }
        }
        if ((x = coincide("/api/documentos/" + ID + "/actividad-externa", r)) != null && m.equals("POST")) {
            Map<String, Object> c = cuerpo(p);
            Object f = c.get("filas");
            return ok(documentos.actividadExterna(u, x.group(1), f instanceof java.util.List ? new java.util.ArrayList<Object>((java.util.List<?>) f) : null, texto(c, "via")));
        }
        if ((x = coincide("/api/documentos/" + ID + "/fusionar", r)) != null && m.equals("POST")) {
            Object e = cuerpo(p).get("elecciones");
            Map<String, String> el = new LinkedHashMap<>();
            if (e instanceof Map) for (Map.Entry<?, ?> en : ((Map<?, ?>) e).entrySet()) el.put(String.valueOf(en.getKey()), String.valueOf(en.getValue()));
            return ok(documentos.fusionarRama(u, x.group(1), el));
        }
        if ((x = coincide("/api/documentos/" + ID + "/rama", r)) != null && m.equals("PUT")) {
            if (!"aparte".equals(texto(cuerpo(p), "accion"))) throw ErrorNom.invalido("¿Qué hacer con la rama? (aparte)", "accion");
            return ok(documentos.apartarRama(u, x.group(1)));
        }
        // ---- 8.5 papelera, nombre, copia, mover, carpeta, destacado y enlace para ver
        if ((x = coincide("/api/documentos/" + ID + "/restaurar", r)) != null && m.equals("POST")) return ok(documentos.sacarDePapelera(u, x.group(1)));
        if ((x = coincide("/api/documentos/" + ID + "/definitivo", r)) != null && m.equals("DELETE")) {
            documentos.borrarParaSiempre(u, x.group(1));
            return ok(Map.of("ok", true));
        }
        if ((x = coincide("/api/documentos/" + ID + "/nombre", r)) != null && m.equals("PUT")) return ok(documentos.renombrar(u, x.group(1), texto(cuerpo(p), "nombre")));
        if ((x = coincide("/api/documentos/" + ID + "/copia", r)) != null && m.equals("POST")) {
            Map<String, Object> c = cuerpo(p);
            return ok(documentos.copiar(u, x.group(1), texto(c, "espacioId"), texto(c, "nombre"), Boolean.TRUE.equals(c.get("plantilla"))));
        }
        if ((x = coincide("/api/documentos/" + ID + "/espacio", r)) != null && m.equals("PUT")) return ok(documentos.mover(u, x.group(1), texto(cuerpo(p), "espacioId")));
        if ((x = coincide("/api/documentos/" + ID + "/carpeta", r)) != null && m.equals("PUT")) return ok(documentos.fijarCarpeta(u, x.group(1), texto(cuerpo(p), "carpeta")));
        if ((x = coincide("/api/documentos/" + ID + "/destacado", r)) != null && m.equals("PUT")) return ok(documentos.destacar(u, x.group(1), Boolean.TRUE.equals(cuerpo(p).get("destacado"))));
        if ((x = coincide("/api/documentos/" + ID + "/enlace-ver", r)) != null) {
            if (m.equals("POST")) return ok(documentos.crearEnlaceVer(u, x.group(1)));
            if (m.equals("DELETE")) return ok(documentos.quitarEnlaceVer(u, x.group(1)));
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
            // 3.4 Al cerrar el documento, el cliente lo avisa: ahí termina su visita.
            if (Boolean.TRUE.equals(c.get("salir"))) { documentos.salir(u, x.group(1), texto(c, "cliente")); return ok(Map.of("ok", true)); }
            difusor.actualizarPresencia(x.group(1), texto(c, "cliente"), texto(c, "bloque"), texto(c, "modo"), cursor);
            return ok(Map.of("ok", true));
        }
        if ((x = coincide("/api/documentos/" + ID + "/proteccion", r)) != null && m.equals("PUT")) {
            Map<String, Object> c = cuerpo(p);
            return ok(documentos.proteger(u, x.group(1), Boolean.TRUE.equals(c.get("protegido")), texto(c, "confirmacion")));
        }
        if ((x = coincide("/api/documentos/" + ID + "/recibo", r)) != null && m.equals("GET"))
            return ok(documentos.recibo(u, x.group(1), p.consulta.get("usuario")));
        if ((x = coincide("/api/documentos/" + ID + "/aportes", r)) != null && m.equals("GET"))
            return ok(documentos.aportes(u, x.group(1)));
        if ((x = coincide("/api/documentos/" + ID + "/entrega", r)) != null && m.equals("PUT"))
            return ok(documentos.fijarEntrega(u, x.group(1), largo(cuerpo(p).get("limite"))));
        if ((x = coincide("/api/documentos/" + ID + "/proyeccion", r)) != null) {
            if (m.equals("POST")) return ok(documentos.iniciarProyeccion(u, x.group(1)));
            if (m.equals("PUT")) {
                Map<String, Object> c = cuerpo(p);
                return ok(documentos.moverProyeccion(u, x.group(1), texto(c, "pagina"), (int) largo(c.get("paso"))));
            }
            if (m.equals("DELETE")) { documentos.terminarProyeccion(u, x.group(1)); return ok(Map.of("ok", true)); }
        }
        if ((x = coincide("/api/documentos/" + ID + "/proyeccion/marcas", r)) != null && m.equals("PUT"))
            return ok(documentos.marcarProyeccion(u, x.group(1), cuerpo(p)));
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
