package mx.wack.nom.core.servicio;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;


import mx.wack.nom.core.almacen.RepositorioUsuarios;
import mx.wack.nom.core.modelo.Preferencias;
import mx.wack.nom.core.modelo.Sesion;
import mx.wack.nom.core.modelo.Usuario;

/**
 * Modulo 1 - Gestion de cuentas (CU-01 a CU-05, CU-27). Diagramas A1 y A2.
 * Las cuentas viven en la base de datos (RepositorioUsuariosJdbc) en la computadora, y en
 * archivos JSON en el teléfono. La misma lógica para los dos.
 *
 * No hay administrador general: cada cuenta controla solo sus espacios y documentos, y quién
 * entra a cada espacio (Lectura / Edición / Propietario) lo decide su propietario.
 */
public class ServicioCuentas {

    private static final Bitacora log = Bitacora.de(ServicioCuentas.class);
    /** Colores de avatar: saturados, distinguibles entre si y legibles con texto blanco. */
    private static final String[] COLORES = {
        "#E8590C", "#2F9E44", "#1C7ED6", "#AE3EC9", "#D6336C", "#0C8599", "#F08C00", "#6741D9"
    };

    private final RepositorioUsuarios repo;
    private final Cifrado cifrado;
    private final int maxIntentos;
    private final int minutosBloqueo;
    private final int horasSesion;

    public ServicioCuentas(RepositorioUsuarios repo, Cifrado cifrado,
                           int maxIntentos, int minutosBloqueo, int horasSesion) {
        this.repo = repo;
        this.cifrado = cifrado;
        this.maxIntentos = maxIntentos;
        this.minutosBloqueo = minutosBloqueo;
        this.horasSesion = horasSesion;
    }

    // ------------------------------------------------------------ limites contra el abuso
    /** Fallos de contrasena de una cuenta desde un mismo lugar (direccion de red), y su bloqueo. */
    private static final class Fallos { int n; long desde; long bloqueadoHasta; }
    private final Map<String, Fallos> fallos = new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<String, java.util.ArrayDeque<Long>> registros = new java.util.HashMap<>();
    private int registrosHoraLugar = 30, registrosHoraTotal = 300;
    private static final long HORA = 3_600_000L;

    /** Cuantas cuentas nuevas se aceptan por hora desde una misma red y en total (0 = sin limite). */
    public void limitarRegistros(int porLugar, int total) { registrosHoraLugar = porLugar; registrosHoraTotal = total; }

    private static String lugar(String origen) { return origen == null || origen.isBlank() ? "?" : origen; }

    /**
     * El bloqueo por intentos fallidos es de la cuenta DESDE un lugar: quien falla cinco veces queda
     * fuera 15 minutos desde su red, pero no puede dejar fuera al dueno, que entra desde la suya.
     * Si llueven fallos desde muchos lugares (mas de diez veces el limite en una hora) si se bloquea
     * la cuenta entera. Sin lugar conocido (el telefono como servidor) cuenta todo junto, como antes.
     */
    private void exigirSinBloqueo(Usuario u, String origen, long ahora) {
        long hasta = u.estaBloqueado(ahora) ? u.bloqueadoHasta : 0;
        Fallos f = fallos.get(u.id + "|" + lugar(origen));
        if (f != null && f.bloqueadoHasta > ahora) hasta = Math.max(hasta, f.bloqueadoHasta);
        if (hasta > ahora) {
            long min = Math.max(1, (hasta - ahora + 59_999) / 60_000);
            throw new ErrorNom(ErrorNom.BLOQUEADO, "Cuenta bloqueada por seguridad. Intenta de nuevo en " + min + " min.", null, Map.of("bloqueadoHasta", hasta));
        }
    }

    /** Anota un fallo. Devuelve cuantos intentos le quedan a ese lugar; si se acabaron, bloquea y lanza BLOQUEADO. */
    private int fallo(Usuario u, String origen, long ahora) {
        if (fallos.size() > 20_000) fallos.values().removeIf(x -> x.bloqueadoHasta < ahora && ahora - x.desde > HORA);
        Fallos f = fallos.computeIfAbsent(u.id + "|" + lugar(origen), k -> new Fallos());
        Fallos todos = fallos.computeIfAbsent(u.id, k -> new Fallos());
        long ventana = minutosBloqueo * 60_000L;
        if (ahora - f.desde > ventana) { f.n = 0; f.desde = ahora; }
        if (ahora - todos.desde > HORA) { todos.n = 0; todos.desde = ahora; }
        f.n++; todos.n++;
        boolean cuentaEntera = todos.n > maxIntentos * 10;
        if (f.n > maxIntentos || cuentaEntera) {
            long hasta = ahora + ventana;
            f.bloqueadoHasta = hasta; f.n = 0;
            if (cuentaEntera) {
                todos.n = 0;
                u.bloqueadoHasta = hasta;
                try { repo.guardar(u); } catch (RuntimeException e) { log.error("No se pudo persistir el bloqueo; se rechaza igual (falla cerrada)", e); }
            }
            log.aviso("Cuenta bloqueada por intentos fallidos: {}{}", u.nombre, cuentaEntera ? " (desde todos lados)" : "");
            throw new ErrorNom(ErrorNom.BLOQUEADO, "Acceso bloqueado por " + minutosBloqueo + " minutos tras demasiados intentos.", null, Map.of("bloqueadoHasta", hasta));
        }
        return maxIntentos + 1 - f.n;
    }

    private void acierto(Usuario u, String origen) {
        fallos.remove(u.id + "|" + lugar(origen));
        fallos.remove(u.id);
        u.intentosFallidos = 0;
        u.bloqueadoHasta = 0;
    }

    /** Tope de cuentas nuevas por hora (un programa no debe poder llenar el disco registrando cuentas). */
    private void anotarRegistro(String origen, long ahora) {
        if (origen == null || origen.isBlank()) return;   // el propio equipo (pruebas, administracion)
        for (String k : new String[] { origen, "*" }) {
            int tope = "*".equals(k) ? registrosHoraTotal : registrosHoraLugar;
            java.util.ArrayDeque<Long> l = registros.computeIfAbsent(k, x -> new java.util.ArrayDeque<>());
            while (!l.isEmpty() && ahora - l.peekFirst() > HORA) l.pollFirst();
            if (tope > 0 && l.size() >= tope)
                throw new ErrorNom(ErrorNom.DEMASIADOS, "Se crearon demasiadas cuentas " + ("*".equals(k) ? "" : "desde esta red ") + "en la última hora. Intenta más tarde.");
        }
        registros.get(origen).addLast(ahora);
        registros.get("*").addLast(ahora);
        if (registros.size() > 5_000) registros.values().removeIf(java.util.ArrayDeque::isEmpty);
    }

    /** CU-01 Crear usuario. */
    public Usuario registrar(String nombre, String contrasena, String empresa) { return registrar(nombre, contrasena, empresa, null); }

    /** origen: la direccion de red de quien lo pide (null = este mismo equipo). */
    public synchronized Usuario registrar(String nombre, String contrasena, String empresa, String origen) {
        nombre = nombre == null ? "" : nombre.trim();
        if (nombre.isEmpty()) throw ErrorNom.invalido("Escribe un nombre de usuario", "nombre");
        if (contrasena == null || contrasena.isEmpty()) throw ErrorNom.invalido("Escribe una contraseña", "contrasena");
        if (!nombre.matches("[\\p{L}\\p{N}._-]{3,24}"))
            throw ErrorNom.invalido("Usa de 3 a 24 letras, números, punto, guion o guion bajo, sin espacios", "nombre");
        if (contrasena.length() < 8)
            throw ErrorNom.invalido("La contraseña necesita al menos 8 caracteres", "contrasena");
        if (repo.porNombre(nombre).isPresent())
            throw new ErrorNom(ErrorNom.CONFLICTO, "El nombre ya está en uso", "nombre");
        anotarRegistro(origen, System.currentTimeMillis());

        Usuario u = new Usuario();
        u.id = cifrado.id();
        u.nombre = nombre;
        u.nombreClave = nombre.toLowerCase(Locale.ROOT);
        u.empresa = empresa == null || empresa.isBlank() ? null : empresa.trim();
        u.sal = cifrado.nuevaSal();
        u.hashContrasena = cifrado.hash(contrasena.toCharArray(), u.sal);
        u.creado = System.currentTimeMillis();
        u.color = COLORES[Math.floorMod(u.nombreClave.hashCode(), COLORES.length)];
        repo.guardar(u);
        log.info("Usuario registrado: {}", u.nombre);
        return u;
    }

    // ------------------------------------------------------------ invitados (modo salon)
    private static final String ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

    /** Texto al azar con letras y numeros que no se confunden (sin 0/O ni 1/I/L). */
    public String codigo(int largo) {
        String t = cifrado.token();
        StringBuilder sb = new StringBuilder();
        int i = 0;
        while (sb.length() < largo) {
            if (i >= t.length()) { t = cifrado.token(); i = 0; }
            char c = Character.toUpperCase(t.charAt(i++));
            if (ALFABETO.indexOf(c) >= 0) sb.append(c);
        }
        return sb.toString();
    }

    /**
     * Cuenta de invitado: alguien entra con un apodo (sin registrarse) desde un enlace o QR del
     * espacio. Queda ligada a ese espacio; no tiene contrasena que se pueda usar, asi que solo
     * entra desde el dispositivo donde abrio la sesion.
     */
    public synchronized Sesion crearInvitado(String apodo, String espacioId) {
        apodo = apodo == null ? "" : apodo.trim().replaceAll("\\s+", " ");
        if (apodo.isEmpty()) throw ErrorNom.invalido("Escribe tu apodo", "apodo");
        if (!apodo.matches("[\\p{L}\\p{N} ._-]{2,16}"))
            throw ErrorNom.invalido("Usa de 2 a 16 letras o números (puede llevar espacios)", "apodo");
        Usuario u = new Usuario();
        u.id = cifrado.id();
        for (int i = 0; i < 20; i++) {
            u.nombre = apodo + "·" + codigo(3);
            u.nombreClave = u.nombre.toLowerCase(Locale.ROOT);
            if (repo.porNombre(u.nombre).isEmpty()) break;
        }
        u.sal = cifrado.nuevaSal();
        // Contrasena al azar que nadie conoce: la cuenta solo se usa con su sesion.
        u.hashContrasena = cifrado.hash(cifrado.token().toCharArray(), u.sal);
        u.creado = System.currentTimeMillis();
        u.color = COLORES[Math.floorMod(u.nombreClave.hashCode(), COLORES.length)];
        u.invitadoDe = espacioId;
        repo.guardar(u);
        log.info("Invitado {} en el espacio {}", u.nombre, espacioId);
        return nuevaSesion(u, u.creado);
    }

    // ------------------------------------------------------------ recuperar la contrasena
    private static String normalizarCodigo(String c) { return c == null ? "" : c.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", ""); }

    /** Nuevo codigo de recuperacion (el anterior deja de servir). Se muestra una sola vez. */
    public String nuevoCodigoRecuperacion(Usuario u) {
        if (u.esInvitado()) throw ErrorNom.prohibido("Las cuentas de invitado no tienen contraseña");
        String c = codigo(16);
        u.salRecuperacion = cifrado.nuevaSal();
        u.hashRecuperacion = cifrado.hash(c.toCharArray(), u.salRecuperacion);
        repo.guardar(u);
        return c.substring(0, 4) + "-" + c.substring(4, 8) + "-" + c.substring(8, 12) + "-" + c.substring(12);
    }

    /**
     * Cambia la contrasena con el codigo de recuperacion. Los intentos fallidos cuentan igual que
     * al iniciar sesion (y bloquean igual). Cierra todas las sesiones y devuelve un codigo nuevo.
     */
    public String recuperar(String nombre, String codigo, String nueva) { return recuperar(nombre, codigo, nueva, null); }

    public synchronized String recuperar(String nombre, String codigo, String nueva, String origen) {
        if (nombre == null || nombre.isBlank()) throw ErrorNom.invalido("Escribe tu usuario", "nombre");
        if (normalizarCodigo(codigo).length() != 16) throw ErrorNom.invalido("El código tiene 16 letras y números (por ejemplo ABCD-EFGH-JKMN-PQRS)", "codigo");
        if (nueva == null || nueva.length() < 8) throw ErrorNom.invalido("La contraseña nueva necesita al menos 8 caracteres", "nueva");
        long ahora = System.currentTimeMillis();
        Usuario u = repo.porNombre(nombre).orElse(null);
        if (u == null || u.esInvitado() || u.hashRecuperacion == null) throw new ErrorNom(ErrorNom.SIN_SESION, "Usuario o código incorrectos");
        exigirSinBloqueo(u, origen, ahora);
        if (!cifrado.coincide(normalizarCodigo(codigo).toCharArray(), u.salRecuperacion, u.hashRecuperacion)) {
            fallo(u, origen, ahora);
            throw new ErrorNom(ErrorNom.SIN_SESION, "Usuario o código incorrectos");
        }
        u.sal = cifrado.nuevaSal();
        u.hashContrasena = cifrado.hash(nueva.toCharArray(), u.sal);
        acierto(u, origen);
        repo.borrarSesionesDe(u.id);
        log.info("Contraseña recuperada con código: {}", u.nombre);
        return nuevoCodigoRecuperacion(u);
    }

    private Sesion nuevaSesion(Usuario u, long ahora) {
        Sesion s = new Sesion();
        s.token = cifrado.token();
        s.usuarioId = u.id;
        s.creada = ahora;
        s.expira = ahora + horasSesion * 3_600_000L;
        repo.guardarSesion(s);
        return s;
    }

    /** CU-02 Iniciar sesion, con CU-04 (bloqueo) como extension. */
    public Sesion iniciarSesion(String nombre, String contrasena) { return iniciarSesion(nombre, contrasena, null); }

    /** origen: la direccion de red de quien entra (null = no se sabe: los fallos cuentan todos juntos). */
    public synchronized Sesion iniciarSesion(String nombre, String contrasena, String origen) {
        if (nombre == null || nombre.isBlank() || contrasena == null || contrasena.isEmpty())
            throw ErrorNom.invalido("Escribe tu usuario y tu contraseña", nombre == null || nombre.isBlank() ? "nombre" : "contrasena");
        long ahora = System.currentTimeMillis();
        Optional<Usuario> encontrado = repo.porNombre(nombre);
        if (encontrado.isEmpty()) {
            // Mensaje generico: no revela si el nombre existe (CU-02, 2a).
            throw new ErrorNom(ErrorNom.SIN_SESION, "Usuario o contraseña incorrectos");
        }
        Usuario u = encontrado.get();
        exigirSinBloqueo(u, origen, ahora);
        if (!cifrado.coincide(contrasena.toCharArray(), u.sal, u.hashContrasena)) {
            int quedan = fallo(u, origen, ahora);
            throw new ErrorNom(ErrorNom.SIN_SESION, "Usuario o contraseña incorrectos. "
                    + (quedan == 1 ? "Te queda 1 intento." : "Te quedan " + quedan + " intentos."),
                    null, Map.of("intentosRestantes", quedan));
        }
        acierto(u, origen);
        repo.guardar(u);
        return nuevaSesion(u, ahora);
    }

    /** Comprueba la contrasena de la cuenta abierta (para lo delicado: cambiarla, borrar la cuenta). */
    private void exigirContrasena(Usuario u, String contrasena, String origen, String campo) {
        if (u.esInvitado()) throw ErrorNom.prohibido("Las cuentas de invitado no tienen contraseña");
        if (contrasena == null || contrasena.isEmpty()) throw ErrorNom.invalido("Escribe tu contraseña actual", campo);
        long ahora = System.currentTimeMillis();
        exigirSinBloqueo(u, origen, ahora);
        if (!cifrado.coincide(contrasena.toCharArray(), u.sal, u.hashContrasena)) {
            fallo(u, origen, ahora);
            throw new ErrorNom(ErrorNom.INVALIDO, "Esa no es tu contraseña actual", campo);
        }
        acierto(u, origen);
    }

    /**
     * Cambiar la contrasena sabiendo la actual. Cierra las demas sesiones (otros equipos tienen que
     * volver a entrar) y devuelve una sesion nueva para este.
     */
    public synchronized Sesion cambiarContrasena(Usuario u, String actual, String nueva, String origen) {
        if (nueva == null || nueva.length() < 8) throw ErrorNom.invalido("La contraseña nueva necesita al menos 8 caracteres", "nueva");
        exigirContrasena(u, actual, origen, "actual");
        u.sal = cifrado.nuevaSal();
        u.hashContrasena = cifrado.hash(nueva.toCharArray(), u.sal);
        repo.guardar(u);
        repo.borrarSesionesDe(u.id);
        log.info("Contraseña cambiada: {}", u.nombre);
        return nuevaSesion(u, System.currentTimeMillis());
    }

    /** Antes de borrar una cuenta: que quien lo pide sepa su contrasena. */
    public synchronized void confirmarParaBorrar(Usuario u, String contrasena, String origen) {
        exigirContrasena(u, contrasena, origen, "contrasena");
    }

    /** Borra la cuenta y sus sesiones. Lo que tenia en los espacios lo quita antes ServicioDocumentos. */
    public synchronized void borrar(Usuario u) {
        repo.borrarSesionesDe(u.id);
        repo.borrar(u.id);
        fallos.keySet().removeIf(k -> k.equals(u.id) || k.startsWith(u.id + "|"));
        log.info("Cuenta borrada: {}", u.nombre);
    }

    // ------------------------------------------------------------ boletos para el canal en vivo
    /**
     * El canal en vivo (EventSource) no puede mandar cabeceras, asi que su identificacion va en la
     * direccion. Para que ahi no viaje el token de la sesion (las direcciones acaban en bitacoras),
     * se pide antes un boleto: sirve una sola vez y dura medio minuto.
     */
    private final Map<String, Object[]> boletos = new java.util.concurrent.ConcurrentHashMap<>();

    public String boleto(String token) {
        long ahora = System.currentTimeMillis();
        if (boletos.size() > 2_000) boletos.values().removeIf(b -> (long) b[1] < ahora);
        String b = cifrado.token();
        boletos.put(b, new Object[] { token, ahora + 30_000L });
        return b;
    }

    /** El token de la sesion a la que pertenece el boleto, si sigue vigente (y el boleto se gasta). */
    public Optional<String> canjearBoleto(String boleto) {
        Object[] b = boleto == null ? null : boletos.remove(boleto);
        return b == null || (long) b[1] < System.currentTimeMillis() ? Optional.empty() : Optional.of((String) b[0]);
    }

    /** CU-03 Cerrar sesion. Si ya habia expirado no es error. */
    public void cerrarSesion(String token) {
        if (token != null) repo.borrarSesion(token);
    }

    public Optional<Usuario> usuarioDeToken(String token) {
        long ahora = System.currentTimeMillis();
        return repo.sesion(token).filter(s -> s.vigente(ahora)).flatMap(s -> repo.porId(s.usuarioId));
    }

    public Optional<Usuario> porId(String id) { return repo.porId(id); }

    public Optional<Usuario> porNombre(String nombre) { return repo.porNombre(nombre); }

    /** CU-27 Configurar preferencias. */
    public Preferencias guardarPreferencias(Usuario u, Preferencias p) {
        if (p == null) throw ErrorNom.invalido("Faltan las preferencias", null);
        p.validar();
        u.preferencias = p;
        repo.guardar(u);
        return p;
    }

    /** ¿Tiene codigo de recuperacion? (para recordarle que lo genere). */
    public static boolean tieneRecuperacion(Usuario u) { return u.hashRecuperacion != null; }

    public static Map<String, Object> publico(Usuario u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.id);
        m.put("nombre", u.nombre);
        m.put("empresa", u.empresa);
        m.put("color", u.color);
        m.put("creado", u.creado);
        if (u.esInvitado()) m.put("invitado", true);
        return m;
    }
}
