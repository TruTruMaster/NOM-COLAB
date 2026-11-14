package mx.wack.nom.core.servicio;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Fase 14, parte D.1: cifrado en reposo. Lo que el servidor escribe en disco (documentos, versiones,
 * comentarios, bitacoras, espacios, recibos) va cifrado con AES-256-GCM, y por lo tanto tambien los
 * respaldos. La llave vive FUERA de la carpeta de datos.
 *
 * Protege contra: que se roben el disco o la tarjeta de la Raspberry, o que un respaldo se copie a
 * otro lado. NO protege contra quien administra el servidor (tiene la llave); para eso esta el
 * cifrado de extremo a extremo (fase 15).
 *
 * Formato de un archivo:
 *   "NOMC" | version (1) | marcas (1: bit 0 = adentro va gzip) | largo real (8) | nonce (12) | cifrado + etiqueta (16)
 * La cabecera y la ruta del archivo (sin .resp1, .tmp…) van como datos autenticados: un archivo no se
 * puede cambiar por otro ni alterar su cabecera sin que se note.
 *
 * Una linea de una bitacora (.jsonl): "E1:" + base64(nonce + cifrado), con la ruta autenticada.
 */
public final class CifradoReposo {

    public static final byte[] MAGIA = { 'N', 'O', 'M', 'C' };
    public static final int CABECERA = 4 + 1 + 1 + 8;
    private static final int NONCE = 12, ETIQUETA = 128;
    private static final String LINEA = "E1:";

    private final SecretKeySpec llave;
    private final SecureRandom azar = new SecureRandom();

    private CifradoReposo(byte[] k) {
        this.llave = k == null ? null : new SecretKeySpec(Arrays.copyOf(k, 32), "AES");
    }

    /** Sin cifrar (NOM_CIFRAR=false): se escribe en claro; lo cifrado de antes no se puede leer. */
    public static CifradoReposo apagado() { return new CifradoReposo(null); }

    public static CifradoReposo conLlave(byte[] k) {
        if (k == null || k.length != 32) throw new IllegalArgumentException("La llave del cifrado en reposo mide 32 bytes");
        return new CifradoReposo(k);
    }

    public boolean activo() { return llave != null; }

    /** Una llave nueva al azar (32 bytes). */
    public static byte[] nuevaLlave() {
        byte[] k = new byte[32];
        new SecureRandom().nextBytes(k);
        return k;
    }

    /** Una sub-llave para otro uso (p. ej. la contrasena del archivo de la base H2), derivada con HMAC-SHA256. */
    public byte[] derivar(String para) {
        if (llave == null) throw new IllegalStateException("Sin llave");
        try {
            Mac m = Mac.getInstance("HmacSHA256");
            m.init(new SecretKeySpec(llave.getEncoded(), "HmacSHA256"));
            return m.doFinal(("nom-colab/reposo/" + para).getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) { throw new IllegalStateException(e); }
    }

    /** La ruta sin lo que cambia al rotar respaldos o al escribir (.resp1, .tmp). */
    public static String normalizar(String ruta) {
        String r = ruta == null ? "" : ruta.replace('\\', '/');
        return r.replaceAll("(\\.resp\\d+|\\.tmp|\\.n)$", "");
    }

    public static boolean cifrado(byte[] inicio) {
        if (inicio == null || inicio.length < 4) return false;
        for (int i = 0; i < 4; i++) if (inicio[i] != MAGIA[i]) return false;
        return true;
    }

    /** El largo sin comprimir ni cifrar que anota la cabecera (para el tope de 25 MB). */
    public static long largoReal(byte[] cabecera) {
        return ByteBuffer.wrap(cabecera, 6, 8).getLong();
    }

    /** ¿La cabecera dice que adentro va gzip? */
    public static boolean conGzip(byte[] cabecera) { return (cabecera[5] & 1) != 0; }

    private static byte[] aad(byte[] cabecera, String ruta) {
        byte[] r = normalizar(ruta).getBytes(StandardCharsets.UTF_8);
        byte[] a = Arrays.copyOf(cabecera, cabecera.length + r.length);
        System.arraycopy(r, 0, a, cabecera.length, r.length);
        return a;
    }

    /** Cifra el contenido de un archivo. gzip: si lo que va adentro ya esta comprimido. */
    public byte[] cifrar(byte[] datos, boolean gzip, long largoReal, String ruta) {
        if (llave == null) throw new IllegalStateException("Sin llave");
        try {
            ByteBuffer c = ByteBuffer.allocate(CABECERA);
            c.put(MAGIA).put((byte) 1).put((byte) (gzip ? 1 : 0)).putLong(largoReal);
            byte[] cab = c.array();
            byte[] nonce = new byte[NONCE];
            azar.nextBytes(nonce);
            Cipher x = Cipher.getInstance("AES/GCM/NoPadding");
            x.init(Cipher.ENCRYPT_MODE, llave, new GCMParameterSpec(ETIQUETA, nonce));
            x.updateAAD(aad(cab, ruta));
            byte[] ct = x.doFinal(datos);
            ByteBuffer r = ByteBuffer.allocate(cab.length + NONCE + ct.length);
            r.put(cab).put(nonce).put(ct);
            return r.array();
        } catch (GeneralSecurityException e) { throw new IllegalStateException("No se pudo cifrar " + ruta, e); }
    }

    /** Descifra un archivo completo (con su cabecera). Lanza si la llave no es o si alguien lo altero. */
    public byte[] descifrar(byte[] archivo, String ruta) {
        if (!cifrado(archivo)) throw new IllegalArgumentException("No es un archivo cifrado");
        if (llave == null) throw new IllegalStateException("El archivo " + ruta + " está cifrado y este servidor no tiene la llave");
        if (archivo.length < CABECERA + NONCE + 16) throw new IllegalStateException("Archivo cifrado incompleto: " + ruta);
        try {
            byte[] cab = Arrays.copyOf(archivo, CABECERA);
            Cipher x = Cipher.getInstance("AES/GCM/NoPadding");
            x.init(Cipher.DECRYPT_MODE, llave, new GCMParameterSpec(ETIQUETA, archivo, CABECERA, NONCE));
            x.updateAAD(aad(cab, ruta));
            return x.doFinal(archivo, CABECERA + NONCE, archivo.length - CABECERA - NONCE);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("No se pudo descifrar " + ruta + " (¿otra llave, o el archivo se alteró?)", e);
        }
    }

    public boolean lineaCifrada(String linea) { return linea != null && linea.startsWith(LINEA); }

    public String cifrarLinea(String linea, String ruta) {
        if (llave == null) return linea;
        try {
            byte[] nonce = new byte[NONCE];
            azar.nextBytes(nonce);
            Cipher x = Cipher.getInstance("AES/GCM/NoPadding");
            x.init(Cipher.ENCRYPT_MODE, llave, new GCMParameterSpec(ETIQUETA, nonce));
            x.updateAAD(normalizar(ruta).getBytes(StandardCharsets.UTF_8));
            byte[] ct = x.doFinal(linea.getBytes(StandardCharsets.UTF_8));
            byte[] t = Arrays.copyOf(nonce, NONCE + ct.length);
            System.arraycopy(ct, 0, t, NONCE, ct.length);
            return LINEA + Base64.getEncoder().encodeToString(t);
        } catch (GeneralSecurityException e) { throw new IllegalStateException("No se pudo cifrar una línea de " + ruta, e); }
    }

    public String descifrarLinea(String linea, String ruta) {
        if (!lineaCifrada(linea)) return linea;
        if (llave == null) throw new IllegalStateException("La bitácora " + ruta + " está cifrada y este servidor no tiene la llave");
        try {
            byte[] t = Base64.getDecoder().decode(linea.substring(LINEA.length()).trim());
            Cipher x = Cipher.getInstance("AES/GCM/NoPadding");
            x.init(Cipher.DECRYPT_MODE, llave, new GCMParameterSpec(ETIQUETA, t, 0, NONCE));
            x.updateAAD(normalizar(ruta).getBytes(StandardCharsets.UTF_8));
            return new String(x.doFinal(t, NONCE, t.length - NONCE), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("No se pudo descifrar una línea de " + ruta, e);
        }
    }
}
