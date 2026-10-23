package mx.wack.nom.core.servicio;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.spec.KeySpec;
import java.util.Arrays;
import java.util.Base64;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;


/**
 * CU-05 Cifrar credenciales. PBKDF2-HMAC-SHA256 con sal aleatoria de 16 bytes.
 * Viene en el JDK, asi que no agrega dependencias. 120 000 iteraciones tardan
 * ~0.1 s: lento para un ataque de diccionario, rapido para el RNF de 2 s.
 */
public class Cifrado {

    private static final int ITERACIONES = 120_000;
    private static final int BITS = 256;
    private final SecureRandom azar = new SecureRandom();

    public String nuevaSal() {
        byte[] s = new byte[16];
        azar.nextBytes(s);
        return Base64.getEncoder().encodeToString(s);
    }

    public String hash(char[] contrasena, String sal) {
        try {
            KeySpec spec = new PBEKeySpec(contrasena, Base64.getDecoder().decode(sal), ITERACIONES, BITS);
            byte[] h = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            return Base64.getEncoder().encodeToString(h);
        } catch (Exception e) {
            throw new IllegalStateException("PBKDF2 no disponible", e);
        } finally {
            Arrays.fill(contrasena, '\0');   // paso 4: se descarta el texto claro
        }
    }

    /** Comparacion en tiempo constante. */
    public boolean coincide(char[] contrasena, String sal, String hashGuardado) {
        byte[] a = hash(contrasena, sal).getBytes();
        byte[] b = hashGuardado.getBytes();
        return MessageDigest.isEqual(a, b);
    }

    public String token() {
        byte[] t = new byte[32];
        azar.nextBytes(t);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(t);
    }

    public String id() {
        byte[] t = new byte[9];
        azar.nextBytes(t);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(t);
    }
}
