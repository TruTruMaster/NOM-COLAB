package mx.wack.nom.servidor;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Base64;

import mx.wack.nom.core.servicio.CifradoReposo;

/**
 * Fase 14, parte D.1: lo que se hace ANTES de arrancar Spring para el cifrado en reposo.
 *
 *  - La llave: NOM_LLAVE_REPOSO (base64, p. ej. en la configuracion de Azure) o el archivo
 *    reposo.key en la carpeta de llaves (NOM_LLAVES, o "<datos>-llaves" al lado de los datos: nunca
 *    adentro, asi no viaja en los respaldos). Un servidor nuevo la crea solo.
 *  - Si los datos ya estan cifrados y falta la llave, o la llave no es la de estos datos, el servidor
 *    NO arranca (mejor eso que empezar de cero y "perder" todo).
 *  - La base H2 (cuentas y sesiones) tambien se cifra (CIPHER=AES de H2, con una contrasena derivada
 *    de la llave); la de antes se convierte sola la primera vez.
 *  - NOM_CIFRAR=false: un servidor nuevo guarda en claro (solo para pruebas). Si ya hay datos
 *    cifrados, se sigue usando la llave.
 */
public final class ArranqueCifrado {
    private ArranqueCifrado() { }

    private static volatile CifradoReposo cifrado = CifradoReposo.apagado();
    private static volatile Path carpetaLlaves;

    public static CifradoReposo cifrado() { return cifrado; }

    public static Path carpetaLlaves() { return carpetaLlaves; }

    private static String env(String k, String siFalta) {
        String v = System.getenv(k);
        if (v == null || v.isBlank()) v = System.getProperty(k);
        return v == null || v.isBlank() ? siFalta : v.trim();
    }

    /** El archivo "canario": se descifra al arrancar para saber que la llave es la de estos datos. */
    public static final String CANARIO = "cifrado.json";

    public static void preparar() throws IOException {
        String datos = env("NOM_DATOS", "./datos-nom");
        Path d = Path.of(datos).toAbsolutePath().normalize();
        Path llaves = Configuracion.carpetaLlaves(datos, env("NOM_LLAVES", null));
        carpetaLlaves = llaves;
        Files.createDirectories(d);
        boolean cifrar = !"false".equalsIgnoreCase(env("NOM_CIFRAR", "true"));
        byte[] k = leerLlave(llaves);
        boolean hay = hayDatosCifrados(d);
        if (k == null) {
            if (hay) throw new IllegalStateException("Los datos de " + d + " están cifrados y falta su llave (" + llaves.resolve("reposo.key")
                    + " o NOM_LLAVE_REPOSO). El servidor no arranca para no empezar de cero: pon la llave del respaldo y vuelve a intentar.");
            if (!cifrar) { cifrado = CifradoReposo.apagado(); return; }
            k = CifradoReposo.nuevaLlave();
            guardarLlave(llaves, k);
            System.out.println("NOM-COLAB: llave nueva del cifrado en reposo en " + llaves.resolve("reposo.key") + " (guárdala aparte: sin ella no se abren los datos ni los respaldos)");
        }
        CifradoReposo c = CifradoReposo.conLlave(k);
        Path canario = d.resolve(CANARIO);
        if (Files.exists(canario)) {
            try { c.descifrar(Files.readAllBytes(canario), CANARIO); }
            catch (RuntimeException e) {
                throw new IllegalStateException("La llave de " + llaves + " no es la de los datos de " + d + ". El servidor no arranca.", e);
            }
        }
        cifrado = c;
        // La base H2 (si es la de la computadora o la Raspberry; Azure usa su propia base).
        if (env("SPRING_DATASOURCE_URL", null) == null) {
            String clave = hex(c.derivar("h2"));
            Path db = d.resolve("nom-db.mv.db");
            if (Files.exists(db) && !h2Cifrada(db)) {
                // H2 va en el classpath solo al correr (scope runtime): su herramienta se llama por reflexión.
                try {
                    Class.forName("org.h2.tools.ChangeFileEncryption")
                            .getMethod("execute", String.class, String.class, String.class, char[].class, char[].class, boolean.class)
                            .invoke(null, d.toString(), "nom-db", "AES", null, clave.toCharArray(), true);
                } catch (ReflectiveOperationException e) {
                    throw new IllegalStateException("No se pudo cifrar la base de cuentas: " + (e.getCause() == null ? e : e.getCause()).getMessage(), e);
                }
                System.out.println("NOM-COLAB: la base de cuentas ahora va cifrada");
            }
            System.setProperty("spring.datasource.url", "jdbc:h2:file:" + d.toString().replace('\\', '/') + "/nom-db;MODE=MSSQLServer;DATABASE_TO_LOWER=TRUE;CIPHER=AES");
            System.setProperty("spring.datasource.password", clave + " ");
        }
        if (!Files.exists(canario)) {
            Path tmp = d.resolve(CANARIO + ".tmp");
            byte[] cuerpo = "{\"v\":1,\"nom\":\"NOM-COLAB\"}".getBytes(StandardCharsets.UTF_8);
            Files.write(tmp, c.cifrar(cuerpo, false, cuerpo.length, CANARIO));
            Files.move(tmp, canario, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    private static byte[] leerLlave(Path llaves) throws IOException {
        String b = env("NOM_LLAVE_REPOSO", null);
        if (b == null) {
            Path f = llaves.resolve("reposo.key");
            if (!Files.exists(f)) return null;
            b = Files.readString(f, StandardCharsets.UTF_8).trim();
        }
        byte[] k = Base64.getDecoder().decode(b.trim());
        if (k.length != 32) throw new IllegalStateException("La llave del cifrado en reposo no mide 32 bytes");
        return k;
    }

    private static void guardarLlave(Path llaves, byte[] k) throws IOException {
        Files.createDirectories(llaves);
        try { Files.setPosixFilePermissions(llaves, PosixFilePermissions.fromString("rwx------")); } catch (UnsupportedOperationException | IOException e) { /* Windows */ }
        Path f = llaves.resolve("reposo.key");
        Path tmp = llaves.resolve("reposo.key.tmp");
        Files.writeString(tmp, Base64.getEncoder().encodeToString(k) + "\n", StandardCharsets.UTF_8);
        try { Files.setPosixFilePermissions(tmp, PosixFilePermissions.fromString("rw-------")); } catch (UnsupportedOperationException | IOException e) { /* Windows */ }
        Files.move(tmp, f);
    }

    /** ¿Ya hay algo cifrado en la carpeta de datos? (el canario, la base o los archivos principales) */
    static boolean hayDatosCifrados(Path d) throws IOException {
        if (Files.exists(d.resolve(CANARIO))) return true;
        Path db = d.resolve("nom-db.mv.db");
        if (Files.exists(db) && h2Cifrada(db)) return true;
        for (String n : new String[] { "documentos.json", "espacios.json" }) {
            Path f = d.resolve(n);
            if (Files.exists(f)) try (InputStream in = Files.newInputStream(f)) { if (CifradoReposo.cifrado(in.readNBytes(4))) return true; }
        }
        return false;
    }

    /** Los archivos de H2 cifrados empiezan con "H2encrypt". */
    static boolean h2Cifrada(Path db) throws IOException {
        try (InputStream in = Files.newInputStream(db)) {
            return new String(in.readNBytes(9), StandardCharsets.US_ASCII).equals("H2encrypt");
        }
    }
}
