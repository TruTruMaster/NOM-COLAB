package mx.wack.nom.servidor.repositorio;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
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
 */
@Repository
public class RepositorioUsuariosJdbc implements RepositorioUsuarios {

    private static final Logger log = LoggerFactory.getLogger(RepositorioUsuariosJdbc.class);

    private static final String SELECT_USUARIO = """
            SELECT u.id, u.nombre, u.nombre_clave, u.empresa, u.hash_contrasena, u.sal,
                   u.intentos_fallidos, u.bloqueado_hasta, u.creado, u.color,
                   p.tema, p.autoguardado_min, p.versiones_conservar, p.calidad,
                   p.movimiento_reducido, p.enfoque_atenuar, p.idioma
              FROM usuario u
              LEFT JOIN preferencias p ON p.id_usuario = u.id
            """;

    private final JdbcClient db;
    private final AlmacenJson almacen;

    public RepositorioUsuariosJdbc(JdbcClient db, AlmacenJson almacen) {
        this.db = db;
        this.almacen = almacen;
    }

    @Override public Optional<Usuario> porId(String id) {
        return db.sql(SELECT_USUARIO + " WHERE u.id = ?").param(id).query(this::usuario).optional();
    }

    @Override public Optional<Usuario> porNombre(String nombre) {
        String clave = nombre.trim().toLowerCase(Locale.ROOT);
        return db.sql(SELECT_USUARIO + " WHERE u.nombre_clave = ?").param(clave).query(this::usuario).optional();
    }

    @Override @Transactional
    public void guardar(Usuario u) {
        int n = db.sql("""
                UPDATE usuario SET nombre = ?, nombre_clave = ?, empresa = ?, hash_contrasena = ?, sal = ?,
                       intentos_fallidos = ?, bloqueado_hasta = ?, color = ?
                 WHERE id = ?""")
                .params(u.nombre, u.nombreClave, u.empresa, u.hashContrasena, u.sal,
                        u.intentosFallidos, u.bloqueadoHasta, u.color, u.id)
                .update();
        if (n == 0) {
            db.sql("""
                    INSERT INTO usuario (id, nombre, nombre_clave, empresa, hash_contrasena, sal,
                                         intentos_fallidos, bloqueado_hasta, creado, color)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""")
                    .params(u.id, u.nombre, u.nombreClave, u.empresa, u.hashContrasena, u.sal,
                            u.intentosFallidos, u.bloqueadoHasta, u.creado, u.color)
                    .update();
        }
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

    /**
     * Al arrancar: se borran las sesiones vencidas y, si la base esta vacia y
     * existe el usuarios.json de versiones anteriores, se importan esas cuentas
     * para que nadie pierda su usuario al actualizar.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Order(0)
    @Transactional
    public void alArrancar() {
        db.sql("DELETE FROM sesion WHERE expira <= ?").param(System.currentTimeMillis()).update();
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
