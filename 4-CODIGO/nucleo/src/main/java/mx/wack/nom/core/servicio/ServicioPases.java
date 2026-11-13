package mx.wack.nom.core.servicio;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import mx.wack.nom.core.modelo.Usuario;

/**
 * Fase 13, parte A.2: quien SI tiene Internet conserva su cuenta aunque entre al telefono que
 * comparte sin Internet.
 *
 * 1. Su equipo inicia sesion directo con la nube (https; la contrasena nunca pasa por el telefono).
 * 2. La nube le da un PASE firmado (ECDSA P-256 con SHA-256) que dura 10 minutos:
 *    { v, uid, nombre, color, emitido, caduca, nube, nonce }.
 * 3. El equipo se lo presenta al telefono, que revisa la firma con la llave publica de la nube que
 *    trae el APK (asi funciona aunque el telefono no tenga Internet) y crea una copia de la cuenta
 *    con el MISMO id. Cada pase sirve una sola vez.
 *
 * El pase viaja como texto: base64url(JSON) "." base64url(firma DER). La firma es sobre los bytes
 * exactos del JSON, asi que no importa como lo escriba cada lado.
 *
 * Las llaves: la nube guarda la suya FUERA de la carpeta de datos (no viaja en los respaldos); las
 * publicas de confianza son una lista por nube, para poder cambiar de llave sin romper los APK que
 * ya estan instalados (se publican las dos un tiempo).
 */
public class ServicioPases {

    private static final Bitacora log = Bitacora.de(ServicioPases.class);
    public static final long DURACION = 10 * 60_000L;
    /** El reloj del telefono puede ir adelantado o atrasado (sin Internet no se ajusta solo). */
    public static final long TOLERANCIA = 5 * 60_000L;
    private static final String FIRMA = "SHA256withECDSA";

    private final CodecJson json;
    private final SecureRandom azar = new SecureRandom();
    /** La llave de este servidor para emitir pases (null: este servidor no emite). */
    private volatile KeyPair propia;
    /** Nube (origen, p. ej. https://nomcolab.dpdns.org) -> sus llaves publicas de confianza. */
    private final Map<String, List<PublicKey>> confiables = new ConcurrentHashMap<>();
    /** Pases ya usados (nonce -> caduca): un pase sirve una vez. */
    private final Map<String, Long> usados = new ConcurrentHashMap<>();

    public ServicioPases(CodecJson json) {
        this.json = json;
    }

    // ------------------------------------------------------------ llaves

    /** Lee la llave para emitir pases de la carpeta indicada, o la crea (solo legible por el servicio). */
    public synchronized void cargarOCrear(File carpeta) {
        File priv = new File(carpeta, "pases-privada.p8"), pub = new File(carpeta, "pases-publica.der");
        try {
            KeyFactory kf = KeyFactory.getInstance("EC");
            if (priv.isFile() && pub.isFile()) {
                PrivateKey k = kf.generatePrivate(new PKCS8EncodedKeySpec(Files.readAllBytes(priv.toPath())));
                PublicKey p = kf.generatePublic(new X509EncodedKeySpec(Files.readAllBytes(pub.toPath())));
                propia = new KeyPair(p, k);
                return;
            }
            if (!carpeta.isDirectory() && !carpeta.mkdirs()) throw new IOException("No se pudo crear " + carpeta);
            soloDuenio(carpeta, true);
            KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
            g.initialize(new ECGenParameterSpec("secp256r1"), azar);
            KeyPair kp = g.generateKeyPair();
            Files.write(priv.toPath(), kp.getPrivate().getEncoded());
            soloDuenio(priv, false);
            Files.write(pub.toPath(), kp.getPublic().getEncoded());
            propia = kp;
            log.info("Llave nueva para firmar pases en {}", carpeta);
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo preparar la llave de los pases en " + carpeta + ": " + e.getMessage(), e);
        }
    }

    private static void soloDuenio(File f, boolean carpeta) {
        f.setReadable(false, false);
        f.setWritable(false, false);
        f.setExecutable(false, false);
        f.setReadable(true, true);
        f.setWritable(true, true);
        if (carpeta) f.setExecutable(true, true);
    }

    /** La llave publica de este servidor en base64 (X.509 SubjectPublicKeyInfo), o null si no emite. */
    public String llavePublica() {
        KeyPair kp = propia;
        return kp == null ? null : Base64.getEncoder().encodeToString(kp.getPublic().getEncoded());
    }

    public boolean emite() { return propia != null; }

    /** Agrega una llave publica de confianza para una nube (base64 de X.509). */
    public void confiar(String nube, String llaveBase64) {
        try {
            PublicKey p = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(llaveBase64.trim())));
            confiables.computeIfAbsent(normalizarNube(nube), k -> new java.util.concurrent.CopyOnWriteArrayList<>()).add(p);
        } catch (Exception e) {
            throw new IllegalArgumentException("Llave de pases no válida para " + nube + ": " + e.getMessage(), e);
        }
    }

    /**
     * Carga la lista de nubes de confianza: [{ "nube": "https://...", "llave": "base64" }, ...]
     * (el archivo pases/nubes.json que trae la interfaz y el APK). Devuelve cuantas llaves cargo.
     */
    @SuppressWarnings("unchecked")
    public int confiarLista(String textoJson) {
        if (textoJson == null || textoJson.isBlank()) return 0;
        int n = 0;
        Object o = json.leer(textoJson);
        List<Object> l = o instanceof List<?> x ? (List<Object>) x : o instanceof Map<?, ?> m && m.get("nubes") instanceof List<?> y ? (List<Object>) y : List.of();
        for (Object e : l) {
            if (!(e instanceof Map<?, ?> m) || m.get("nube") == null || m.get("llave") == null) continue;
            try { confiar(String.valueOf(m.get("nube")), String.valueOf(m.get("llave"))); n++; }
            catch (IllegalArgumentException ex) { log.aviso("{}", ex.getMessage()); }
        }
        return n;
    }

    public boolean aceptaPases() { return !confiables.isEmpty(); }

    public List<String> nubes() { return new ArrayList<>(confiables.keySet()); }

    static String normalizarNube(String nube) {
        String n = nube == null ? "" : nube.trim().toLowerCase(Locale.ROOT).replaceAll("/+$", "");
        if (!n.matches("https?://[a-z0-9.\\-\\[\\]:]+")) throw new IllegalArgumentException("Nube no válida: " + nube);
        return n;
    }

    // ------------------------------------------------------------ emitir (la nube)

    /** Un pase recien hecho para la cuenta abierta. nube: el origen publico de este servidor. */
    public Map<String, Object> emitir(Usuario u, String nube) {
        KeyPair kp = propia;
        if (kp == null) throw ErrorNom.prohibido("Este servidor no da pases para entrar a otro NOM-COLAB");
        if (u.sinContrasena()) throw ErrorNom.prohibido("Solo una cuenta con contraseña puede llevarse a otro NOM-COLAB");
        long ahora = System.currentTimeMillis();
        byte[] n = new byte[16];
        azar.nextBytes(n);
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("v", 1);
        c.put("uid", u.id);
        c.put("nombre", u.nombre);
        c.put("color", u.color);
        c.put("emitido", ahora);
        c.put("caduca", ahora + DURACION);
        c.put("nube", normalizarNube(nube));
        c.put("nonce", Base64.getUrlEncoder().withoutPadding().encodeToString(n));
        byte[] cuerpo = json.escribir(c);
        try {
            Signature s = Signature.getInstance(FIRMA);
            s.initSign(kp.getPrivate(), azar);
            s.update(cuerpo);
            String pase = b64(cuerpo) + "." + b64(s.sign());
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("pase", pase);
            r.put("caduca", c.get("caduca"));
            r.put("nube", c.get("nube"));
            return r;
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo firmar el pase", e);
        }
    }

    private static String b64(byte[] b) { return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }

    // ------------------------------------------------------------ revisar (el telefono)

    /**
     * Revisa un pase: firma de una nube de confianza, vigente (con tolerancia de reloj) y sin usar.
     * Devuelve su contenido; lo marca como usado.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> verificar(String pase) {
        if (pase == null || pase.length() > 4000 || !pase.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+"))
            throw ErrorNom.invalido("Ese pase no es válido", "pase");
        String[] p = pase.split("\\.");
        byte[] cuerpo, firma;
        try {
            cuerpo = Base64.getUrlDecoder().decode(p[0]);
            firma = Base64.getUrlDecoder().decode(p[1]);
        } catch (IllegalArgumentException e) {
            throw ErrorNom.invalido("Ese pase no es válido", "pase");
        }
        Map<String, Object> c;
        try {
            Object o = json.leer(new String(cuerpo, StandardCharsets.UTF_8));
            if (!(o instanceof Map<?, ?>)) throw new IllegalArgumentException();
            c = (Map<String, Object>) o;
        } catch (RuntimeException e) {
            throw ErrorNom.invalido("Ese pase no es válido", "pase");
        }
        String nube;
        try { nube = normalizarNube(String.valueOf(c.get("nube"))); }
        catch (IllegalArgumentException e) { throw new ErrorNom(ErrorNom.SIN_SESION, "Ese pase no es de una nube de NOM-COLAB que este equipo conozca"); }
        List<PublicKey> llaves = confiables.get(nube);
        if (llaves == null || llaves.isEmpty())
            throw new ErrorNom(ErrorNom.SIN_SESION, "Ese pase es de " + nube.replaceFirst("^https?://", "") + ", que este equipo no conoce");
        boolean ok = false;
        for (PublicKey k : llaves) {
            try {
                Signature s = Signature.getInstance(FIRMA);
                s.initVerify(k);
                s.update(cuerpo);
                if (s.verify(firma)) { ok = true; break; }
            } catch (Exception ignorado) { /* la siguiente llave */ }
        }
        if (!ok) throw new ErrorNom(ErrorNom.SIN_SESION, "La firma del pase no es válida");
        if (!(c.get("v") instanceof Number v) || v.intValue() != 1) throw new ErrorNom(ErrorNom.SIN_SESION, "Ese pase es de otra versión de NOM-COLAB");
        long ahora = System.currentTimeMillis();
        long emitido = c.get("emitido") instanceof Number e ? e.longValue() : 0, caduca = c.get("caduca") instanceof Number x ? x.longValue() : 0;
        if (caduca - emitido > DURACION + 1000 || caduca <= 0) throw new ErrorNom(ErrorNom.SIN_SESION, "Ese pase no es válido");
        if (ahora > caduca + TOLERANCIA) throw new ErrorNom(ErrorNom.SIN_SESION, "El pase ya venció (dura 10 minutos). Pide uno nuevo.");
        if (ahora < emitido - TOLERANCIA) throw new ErrorNom(ErrorNom.SIN_SESION, "La hora de este teléfono no coincide con la de la nube. Revisa la fecha y la hora.");
        String uid = String.valueOf(c.get("uid")), nombre = String.valueOf(c.get("nombre"));
        if (c.get("uid") == null || !uid.matches("[A-Za-z0-9_-]{6,24}") || c.get("nombre") == null || nombre.isBlank() || nombre.length() > 24)
            throw ErrorNom.invalido("Ese pase no es válido", "pase");
        String nonce = String.valueOf(c.get("nonce"));
        usados.values().removeIf(t -> t + TOLERANCIA < ahora);
        if (usados.putIfAbsent(nube + "|" + nonce, caduca) != null) throw new ErrorNom(ErrorNom.SIN_SESION, "Ese pase ya se usó. Pide uno nuevo.");
        Map<String, Object> r = new LinkedHashMap<>(c);
        r.put("nube", nube);
        return r;
    }
}
