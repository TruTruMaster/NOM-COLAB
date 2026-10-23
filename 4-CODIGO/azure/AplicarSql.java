import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

/**
 * Aplica scripts SQL a Azure SQL y comprueba la seguridad con roles (roles-bd.sql).
 * Lo usa desplegar.sh ("roles"); corre con el controlador de SQL Server y el partidor de
 * sentencias de Spring que ya trae nom-colab.jar, el mismo que usa la página al arrancar.
 *
 *   java -cp "lib/*" AplicarSql.java aplicar   archivo.sql
 *   java -cp "lib/*" AplicarSql.java verificar
 *
 * Variables: NOM_SQL_URL, NOM_SQL_ADMIN / NOM_SQL_ADMIN_PASS (el administrador del servidor),
 * NOM_SQL_APP_PASS y NOM_SQL_LECTOR_PASS (los usuarios de roles-bd.sql). En el archivo, cada
 * {{CLAVE}} se reemplaza por la variable NOM_SQL_CLAVE: las contraseñas nunca van en la línea
 * de comandos (se verían en la lista de procesos) ni en el repositorio.
 * "verificar" no deja rastro: lo que prueba a escribir se deshace o se borra.
 */
public class AplicarSql {
    static final String URL = System.getenv("NOM_SQL_URL");
    static int fallas = 0;

    static Connection conectar(String usuario, String clave) throws SQLException {
        return DriverManager.getConnection(URL, usuario, clave);
    }

    static void aplicar(Connection c, String archivo) throws Exception {
        String sql = Files.readString(Path.of(archivo));
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\{\\{([A-Z_]+)}}").matcher(sql);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String v = System.getenv("NOM_SQL_" + m.group(1));
            if (v == null || v.isEmpty()) throw new IllegalArgumentException("falta la variable NOM_SQL_" + m.group(1));
            if (v.contains("'")) throw new IllegalArgumentException("NOM_SQL_" + m.group(1) + " no puede llevar comillas simples");
            m.appendReplacement(sb, java.util.regex.Matcher.quoteReplacement(v));
        }
        m.appendTail(sb);
        sql = sb.toString();
        ScriptUtils.executeSqlScript(c, new EncodedResource(new ByteArrayResource(sql.getBytes("UTF-8")), "UTF-8"));
    }

    /** Corre una sentencia y dice si el resultado fue el esperado (permitida o negada). */
    static void probar(Connection c, String quien, String sql, boolean debePasar) {
        String res;
        boolean paso;
        try (Statement s = c.createStatement()) {
            if (s.execute(sql)) { try (ResultSet r = s.getResultSet()) { r.next(); } }
            paso = true;
            res = "permitido";
        } catch (SQLException e) {
            paso = false;
            res = "negado (error " + e.getErrorCode() + ": " + e.getMessage().split("\\.")[0] + ")";
        }
        boolean ok = paso == debePasar;
        if (!ok) fallas++;
        System.out.printf("  %s %-16s %-62s -> %s%n", ok ? "OK " : "MAL", quien, sql.length() > 62 ? sql.substring(0, 59) + "..." : sql, res);
    }

    static void verificar() throws Exception {
        String admin = System.getenv("NOM_SQL_ADMIN"), adminPass = System.getenv("NOM_SQL_ADMIN_PASS");
        String temporal = "nomcolab_sin_rol", tempPass = "Tmp-" + Long.toHexString(System.nanoTime()) + "-x9!";
        try (Connection a = conectar(admin, adminPass)) {
            try (Statement s = a.createStatement()) {
                s.execute("IF DATABASE_PRINCIPAL_ID(N'" + temporal + "') IS NULL CREATE USER " + temporal + " WITH PASSWORD = N'" + tempPass + "'");
            }
            try {
                System.out.println("1) Usuario recién creado, sin rol (como MIGUEL antes de los GRANT):");
                try (Connection t = conectar(temporal, tempPass)) {
                    probar(t, temporal, "SELECT COUNT(*) FROM dbo.usuario", false);
                    probar(t, temporal, "SELECT COUNT(*) FROM dbo.sesion", false);
                }
            } finally {
                try (Statement s = a.createStatement()) { s.execute("DROP USER IF EXISTS " + temporal); }
            }
        }
        System.out.println("2) nomcolab_app, con rol_nomcolab_app (la página):");
        try (Connection c = conectar("nomcolab_app", System.getenv("NOM_SQL_APP_PASS"))) {
            probar(c, "nomcolab_app", "SELECT COUNT(*) FROM dbo.usuario", true);
            probar(c, "nomcolab_app", "SELECT TOP 1 hash_contrasena, sal FROM dbo.usuario", true);
            c.setAutoCommit(false);
            probar(c, "nomcolab_app", "UPDATE dbo.usuario SET color = color WHERE 1 = 0", true);
            probar(c, "nomcolab_app", "DELETE FROM dbo.sesion WHERE 1 = 0", true);
            c.rollback();
            c.setAutoCommit(true);
            probar(c, "nomcolab_app", "CREATE TABLE dbo.prueba_roles (id INT)", false);
            probar(c, "nomcolab_app", "ALTER TABLE dbo.usuario ADD prueba_roles INT", false);
            probar(c, "nomcolab_app", "DROP TABLE dbo.sesion", false);
            System.out.println("   Arranque de la página con este usuario (schema-sqlserver.sql):");
            try {
                aplicar(c, System.getenv().getOrDefault("NOM_SQL_ESQUEMA", "../app/src/main/resources/schema-sqlserver.sql"));
                System.out.println("  OK  el esquema ya existe: no intenta crear nada y la página arranca");
            } catch (Exception e) {
                fallas++;
                System.out.println("  MAL la página no podría arrancar: " + e.getMessage());
            }
        }
        System.out.println("3) nomcolab_lector, con rol_nomcolab_consulta:");
        try (Connection c = conectar("nomcolab_lector", System.getenv("NOM_SQL_LECTOR_PASS"))) {
            probar(c, "nomcolab_lector", "SELECT COUNT(id) FROM dbo.usuario", true);
            probar(c, "nomcolab_lector", "SELECT * FROM dbo.usuario", false);
            probar(c, "nomcolab_lector", "SELECT TOP 1 nombre, empresa, creado FROM dbo.usuario", true);
            probar(c, "nomcolab_lector", "SELECT TOP 1 hash_contrasena FROM dbo.usuario", false);
            probar(c, "nomcolab_lector", "SELECT COUNT(*) FROM dbo.sesion", false);
            probar(c, "nomcolab_lector", "UPDATE dbo.usuario SET color = color WHERE 1 = 0", false);
        }
        System.out.println(fallas == 0 ? "Seguridad con roles: todo como se esperaba." : "Seguridad con roles: " + fallas + " prueba(s) no dieron lo esperado.");
        if (fallas > 0) System.exit(1);
    }

    public static void main(String[] a) throws Exception {
        if (a.length > 0 && a[0].equals("verificar")) { verificar(); return; }
        if (a.length < 2 || !a[0].equals("aplicar")) {
            System.err.println("uso: AplicarSql aplicar archivo.sql | AplicarSql verificar");
            System.exit(2);
        }
        try (Connection c = conectar(System.getenv("NOM_SQL_ADMIN"), System.getenv("NOM_SQL_ADMIN_PASS"))) {
            aplicar(c, a[1]);
        }
        System.out.println("aplicado: " + a[1]);
    }
}
