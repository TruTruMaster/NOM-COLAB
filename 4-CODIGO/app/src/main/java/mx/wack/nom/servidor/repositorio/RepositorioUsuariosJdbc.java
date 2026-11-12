package mx.wack.nom.servidor.repositorio;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import mx.wack.nom.core.almacen.RepositorioUsuarios;
import mx.wack.nom.core.modelo.Preferencias;
import mx.wack.nom.core.modelo.Sesion;
import mx.wack.nom.core.modelo.Usuario;
import tools.jackson.core.type.TypeReference;

/**
 * Usuarios, sesiones y preferencias en la base de datos (diagrama 12).
 * H2 embebido en la red local; Azure SQL Database en la nube. El SQL es el
 * comun a los dos motores; las tablas se crean con schema-h2.sql o
 * schema-sqlserver.sql segun spring.sql.init.platform.
 *
 * Las columnas de noviembre de 2026 (invitado_de, hash_recuperacion, sal_recuperacion) se usan
 * si ya existen. En Azure la pagina no puede crearlas (entra sin ALTER): mientras no se corra
 * "./desplegar.sh roles", esos tres datos se guardan en usuarios-extra.json y se pasan a la base
 * en cuanto las columnas aparecen.
 */
@Repository
public class RepositorioUsuariosJdbc implements RepositorioUsuarios {

    private static final Logger log = LoggerFactory.getLogger(RepositorioUsuariosJdbc.class);
    private static final String EXTRA = "usuarios-extra.json";

    private static final String COLUMNAS = """
            SELECT u.id, u.nombre, u.nombre_clave, u.empresa, u.hash_contrasena, u.sal,
                   u.intentos_fallidos, u.bloqueado_hasta, u.creado, u.color,%s
                   p.tema, p.autoguardado_min, p.versiones_conservar, p.calidad,
                   p.movimiento_reducido, p.enfoque_atenuar, p.idioma
              FROM usuario u
              LEFT JOIN preferencias p ON p.id_usuario = u.id
            """;

    private final JdbcClient db;
    private final AlmacenJson almacen;
    /** null = aun no se sabe; se revisa la primera vez que hace falta. */
    private volatile Boolean nuevas;

    public RepositorioUsuariosJdbc(JdbcClient db, AlmacenJson almacen) {
        this.db = db;
        this.almacen = almacen;
    }

    private boolean columnasNuevas() {
        if (nuevas == null) {
            try {
                db.sql("SELECT invitado_de, hash_recuperacion, sal_recuperacion FROM usuario WHERE 1 = 0").query().listOfRows();
                nuevas = true;
            } catch (RuntimeException e) {
                nuevas = false;
                log.warn("La tabla usuario aún no tiene las columnas de invitados y recuperación: se guardan en {} hasta que se migre (./desplegar.sh roles)", EXTRA);
            }
        }
        return nuevas;
    }

    private String select() {
        return String.format(COLUMNAS, columnasNuevas() ? " u.invitado_de, u.hash_recuperacion, u.sal_recuperacion," : "");
    }

    // ------------------------------------------------------------ datos aparte (sin las columnas)
    private synchronized Map<String, Map<String, String>> extras() {
        return almacen.leer(EXTRA, new TypeReference<LinkedHashMap<String, Map<String, String>>>() { }, new LinkedHashMap<>());
    }

    private synchronized void guardarExtra(Usuario u) {
        Map<String, Map<String, String>> x = extras();
        if (u.invitadoDe == null && u.hashRecuperacion == null) { if (x.remove(u.id) != null) almacen.escribir(EXTRA, x); return; }
        Map<String, String> m = new LinkedHashMap<>();
        m.put("invitadoDe", u.invitadoDe);
        m.put("hashRecuperacion", u.hashRecuperacion);
        m.put("salRecuperacion", u.salRecuperacion);
        x.put(u.id, m);
        almacen.escribir(EXTRA, x);
    }

    private Usuario conExtra(Usuario u) {
        if (u == null || columnasNuevas()) return u;
        Map<String, String> m = extras().get(u.id);
        if (m != null) {
            u.invitadoDe = m.get("invitadoDe");
            u.hashRecuperacion = m.get("hashRecuperacion");
            u.salRecuperacion = m.get("salRecuperacion");
        }
        return u;
    }

    @Override public Optional<Usuario> porId(String id) {
        return db.sql(select() + " WHERE u.id = ?").param(id).query(this::usuario).optional().map(this::conExtra);
    }

    @Override public Optional<Usuario> porNombre(String nombre) {
        String clave = nombre.trim().toLowerCase(Locale.ROOT);
        return db.sql(select() + " WHERE u.nombre_clave = ?").param(clave).query(this::usuario).optional().map(this::conExtra);
    }

    @Override @Transactional
    public void guardar(Usuario u) {
        boolean c = columnasNuevas();
        int n = c
                ? db.sql("""
                    UPDATE usuario SET nombre = ?, nombre_clave = ?, empresa = ?, hash_contrasena = ?, sal = ?,
                           intentos_fallidos = ?, bloqueado_hasta = ?, color = ?,
                           invitado_de = ?, hash_recuperacion = ?, sal_recuperacion = ?
                     WHERE id = ?""")
                    .params(u.nombre, u.nombreClave, u.empresa, u.hashContrasena, u.sal,
                            u.intentosFallidos, u.bloqueadoHasta, u.color,
                            u.invitadoDe, u.hashRecuperacion, u.salRecuperacion, u.id)
                    .update()
                : db.sql("""
                    UPDATE usuario SET nombre = ?, nombre_clave = ?, empresa = ?, hash_contrasena = ?, sal = ?,
                           intentos_fallidos = ?, bloqueado_hasta = ?, color = ?
                     WHERE id = ?""")
                    .params(u.nombre, u.nombreClave, u.empresa, u.hashContrasena, u.sal,
                            u.intentosFallidos, u.bloqueadoHasta, u.color, u.id)
                    .update();
        if (n == 0) {
            if (c) db.sql("""
                    INSERT INTO usuario (id, nombre, nombre_clave, empresa, hash_contrasena, sal,
                                         intentos_fallidos, bloqueado_hasta, creado, color,
                                         invitado_de, hash_recuperacion, sal_recuperacion)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""")
                    .params(u.id, u.nombre, u.nombreClave, u.empresa, u.hashContrasena, u.sal,
                            u.intentosFallidos, u.bloqueadoHasta, u.creado, u.color,
                            u.invitadoDe, u.hashRecuperacion, u.salRecuperacion)
                    .update();
            else db.sql("""
                    INSERT INTO usuario (id, nombre, nombre_clave, empresa, hash_contrasena, sal,
                                         intentos_fallidos, bloqueado_hasta, creado, color)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""")
                    .params(u.id, u.nombre, u.nombreClave, u.empresa, u.hashContrasena, u.sal,
                            u.intentosFallidos, u.bloqueadoHasta, u.creado, u.color)
                    .update();
        }
        if (!c) guardarExtra(u);
        Preferencias p = u.preferencias == null ? new Preferencias() : u.preferencias;
        n = db.sql("""
                UPDATE preferencias SET tema = ?, autoguardado_min = ?, versiones_conservar = ?, calidad = ?,
                       movimiento_reducido = ?, enfoque_atenuar = ?, idioma = ?
                 WHERE id_usuario = ?""")
                .params(p.tema, p.autoguardadoMin, p.versionesConservar, p.calidad,
                        p.movimientoReducido, p.enfoqueAtenuar, p.idioma, u.id)
                .update();
        if (n == 0) {
            db.sql("""
                    INSERT INTO preferencias (id_usuario, tema, autoguardado_min, versiones_conservar, calidad,
                                              movimiento_reducido, enfoque_atenuar, idioma)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)""")
                    .params(u.id, p.tema, p.autoguardadoMin, p.versionesConservar, p.calidad,
                            p.movimientoReducido, p.enfoqueAtenuar, p.idioma)
                    .update();
        }
    }

    @Override public Optional<Sesion> sesion(String token) {
        return db.sql("SELECT token, id_usuario, creada, expira FROM sesion WHERE token = ?").param(token)
                .query((rs, i) -> {
                    Sesion s = new Sesion();
                    s.token = rs.getString("token");
                    s.usuarioId = rs.getString("id_usuario");
                    s.creada = rs.getLong("creada");
                    s.expira = rs.getLong("expira");
                    return s;
                }).optional();
    }

    @Override public void guardarSesion(Sesion s) {
        db.sql("INSERT INTO sesion (token, id_usuario, creada, expira) VALUES (?, ?, ?, ?)")
                .params(s.token, s.usuarioId, s.creada, s.expira).update();
    }

    @Override public void borrarSesion(String token) {
        db.sql("DELETE FROM sesion WHERE token = ?").param(token).update();
    }

    @Override public void borrar(String usuarioId) {
        // (preferencias y sesiones se van solas: sus tablas borran en cascada)
        db.sql("DELETE FROM sesion WHERE id_usuario = ?").param(usuarioId).update();
        db.sql("DELETE FROM preferencias WHERE id_usuario = ?").param(usuarioId).update();
        db.sql("DELETE FROM usuario WHERE id = ?").param(usuarioId).update();
    }

    @Override public void borrarSesionesDe(String usuarioId) {
        db.sql("DELETE FROM sesion WHERE id_usuario = ?").param(usuarioId).update();
    }

    /**
     * Al arrancar: se borran las sesiones vencidas y, si la base esta vacia y
     * existe el usuarios.json de versiones anteriores, se importan esas cuentas
     * para que nadie pierda su usuario al actualizar. Si ya existen las columnas nuevas y quedaron
     * datos en usuarios-extra.json, se pasan a la base.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Order(0)
    @Transactional
    public void alArrancar() {
        db.sql("DELETE FROM sesion WHERE expira <= ?").param(System.currentTimeMillis()).update();
        if (columnasNuevas()) {
            Map<String, Map<String, String>> x = extras();
            if (!x.isEmpty()) {
                x.forEach((id, m) -> db.sql("UPDATE usuario SET invitado_de = ?, hash_recuperacion = ?, sal_recuperacion = ? WHERE id = ?")
                        .params(m.get("invitadoDe"), m.get("hashRecuperacion"), m.get("salRecuperacion"), id).update());
                log.info("Se pasaron a la base los datos de {} cuenta(s) de {}", x.size(), EXTRA);
                almacen.escribir(EXTRA, new LinkedHashMap<>());
            }
        }
        if (db.sql("SELECT COUNT(*) FROM usuario").query(Long.class).single() > 0) return;
        LinkedHashMap<String, Usuario> viejos = almacen.leer("usuarios.json",
                new TypeReference<LinkedHashMap<String, Usuario>>() { }, null);
        if (viejos == null || viejos.isEmpty()) return;
        List<Usuario> lista = List.copyOf(viejos.values());
        lista.forEach(this::guardar);
        log.info("Se importaron {} cuentas de usuarios.json a la base de datos", lista.size());
    }

    private Usuario usuario(ResultSet rs, int fila) throws SQLException {
        Usuario u = new Usuario();
        u.id = rs.getString("id");
        u.nombre = rs.getString("nombre");
        u.nombreClave = rs.getString("nombre_clave");
        u.empresa = rs.getString("empresa");
        u.hashContrasena = rs.getString("hash_contrasena");
        u.sal = rs.getString("sal");
        u.intentosFallidos = rs.getInt("intentos_fallidos");
        u.bloqueadoHasta = rs.getLong("bloqueado_hasta");
        u.creado = rs.getLong("creado");
        u.color = rs.getString("color");
        if (Boolean.TRUE.equals(nuevas)) {
            u.invitadoDe = rs.getString("invitado_de");
            u.hashRecuperacion = rs.getString("hash_recuperacion");
            u.salRecuperacion = rs.getString("sal_recuperacion");
        }
        Preferencias p = new Preferencias();
        if (rs.getString("tema") != null) {
            p.tema = rs.getString("tema");
            p.autoguardadoMin = rs.getInt("autoguardado_min");
            p.versionesConservar = rs.getInt("versiones_conservar");
            p.calidad = rs.getString("calidad");
            p.movimientoReducido = rs.getBoolean("movimiento_reducido");
            p.enfoqueAtenuar = rs.getBoolean("enfoque_atenuar");
            p.idioma = rs.getString("idioma");
        }
        u.preferencias = p;
        return u;
    }
}
