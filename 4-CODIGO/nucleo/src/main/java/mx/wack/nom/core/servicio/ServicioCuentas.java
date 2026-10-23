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

    /** CU-01 Crear usuario. */
    public synchronized Usuario registrar(String nombre, String contrasena, String empresa) {
        nombre = nombre == null ? "" : nombre.trim();
        if (nombre.isEmpty()) throw ErrorNom.invalido("Escribe un nombre de usuario", "nombre");
        if (contrasena == null || contrasena.isEmpty()) throw ErrorNom.invalido("Escribe una contraseña", "contrasena");
        if (!nombre.matches("[\\p{L}\\p{N}._-]{3,24}"))
            throw ErrorNom.invalido("Usa de 3 a 24 letras, números, punto, guion o guion bajo, sin espacios", "nombre");
        if (contrasena.length() < 8)
            throw ErrorNom.invalido("La contraseña necesita al menos 8 caracteres", "contrasena");
        if (repo.porNombre(nombre).isPresent())
            throw new ErrorNom(ErrorNom.CONFLICTO, "El nombre ya está en uso", "nombre");

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

    /** CU-02 Iniciar sesion, con CU-04 (bloqueo) como extension. */
    public synchronized Sesion iniciarSesion(String nombre, String contrasena) {
        if (nombre == null || nombre.isBlank() || contrasena == null || contrasena.isEmpty())
            throw ErrorNom.invalido("Escribe tu usuario y tu contraseña", nombre == null || nombre.isBlank() ? "nombre" : "contrasena");
        long ahora = System.currentTimeMillis();
        Optional<Usuario> encontrado = repo.porNombre(nombre);
        if (encontrado.isEmpty()) {
            // Mensaje generico: no revela si el nombre existe (CU-02, 2a).
            throw new ErrorNom(ErrorNom.SIN_SESION, "Usuario o contraseña incorrectos");
        }
        Usuario u = encontrado.get();
        if (u.estaBloqueado(ahora)) {
            long min = Math.max(1, (u.bloqueadoHasta - ahora + 59_999) / 60_000);
            throw new ErrorNom(ErrorNom.BLOQUEADO, "Cuenta bloqueada por seguridad. Intenta de nuevo en " + min + " min.",
                    null, Map.of("bloqueadoHasta", u.bloqueadoHasta));
        }
        if (!cifrado.coincide(contrasena.toCharArray(), u.sal, u.hashContrasena)) {
            u.intentosFallidos++;
            if (u.intentosFallidos > maxIntentos) {
                u.bloqueadoHasta = ahora + minutosBloqueo * 60_000L;
                u.intentosFallidos = 0;
                log.aviso("Cuenta bloqueada por intentos fallidos: {}", u.nombre);
                try {
                    repo.guardar(u);
                } catch (RuntimeException e) {
                    log.error("No se pudo persistir el bloqueo; se rechaza igual (falla cerrada)", e);
                }
                throw new ErrorNom(ErrorNom.BLOQUEADO, "Acceso bloqueado por " + minutosBloqueo
                        + " minutos tras demasiados intentos.", null, Map.of("bloqueadoHasta", u.bloqueadoHasta));
            }
            repo.guardar(u);
            int quedan = maxIntentos + 1 - u.intentosFallidos;
            throw new ErrorNom(ErrorNom.SIN_SESION, "Usuario o contraseña incorrectos. "
                    + (quedan == 1 ? "Te queda 1 intento." : "Te quedan " + quedan + " intentos."),
                    null, Map.of("intentosRestantes", quedan));
        }
        u.intentosFallidos = 0;
        u.bloqueadoHasta = 0;
        repo.guardar(u);

        Sesion s = new Sesion();
        s.token = cifrado.token();
        s.usuarioId = u.id;
        s.creada = ahora;
        s.expira = ahora + horasSesion * 3_600_000L;
        repo.guardarSesion(s);
        return s;
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

    public static Map<String, Object> publico(Usuario u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.id);
        m.put("nombre", u.nombre);
        m.put("empresa", u.empresa);
        m.put("color", u.color);
        m.put("creado", u.creado);
        return m;
    }
}
