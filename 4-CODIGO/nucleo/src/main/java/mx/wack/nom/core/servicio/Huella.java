package mx.wack.nom.core.servicio;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collection;
import java.util.Map;
import java.util.TreeMap;

/**
 * Huella de un recibo: SHA-256 de su JSON canonico. Canonico quiere decir que el mismo contenido
 * siempre da exactamente el mismo texto: llaves ordenadas, sin espacios, numeros enteros tal cual
 * y texto con los escapes minimos de JSON. Solo usa el JDK (igual en la computadora y en Android).
 */
public final class Huella {
    private Huella() { }

    public static String canonico(Object v) {
        StringBuilder sb = new StringBuilder();
        escribir(sb, v);
        return sb.toString();
    }

    /** "sha256:" + 64 digitos hexadecimales. */
    public static String sha256(Object v) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(canonico(v).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder("sha256:");
            for (byte b : h) sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }

    private static void escribir(StringBuilder sb, Object v) {
        if (v == null) { sb.append("null"); return; }
        if (v instanceof String s) { cadena(sb, s); return; }
        if (v instanceof Boolean) { sb.append(v); return; }
        if (v instanceof Double || v instanceof Float) {
            double d = ((Number) v).doubleValue();
            // Un recibo solo lleva enteros; si llega un 12.0 se escribe como 12 (asi coincide con lo emitido).
            if (d == Math.rint(d) && Math.abs(d) < 9e15) sb.append((long) d); else sb.append(d);
            return;
        }
        if (v instanceof Number) { sb.append(((Number) v).longValue()); return; }
        if (v instanceof Enum<?> e) { cadena(sb, e.name()); return; }
        if (v instanceof Map<?, ?> m) {
            TreeMap<String, Object> o = new TreeMap<>();
            m.forEach((k, x) -> o.put(String.valueOf(k), x));
            sb.append('{');
            boolean primero = true;
            for (var e : o.entrySet()) {
                if (!primero) sb.append(',');
                primero = false;
                cadena(sb, e.getKey());
                sb.append(':');
                escribir(sb, e.getValue());
            }
            sb.append('}');
            return;
        }
        if (v instanceof Collection<?> c) {
            sb.append('[');
            boolean primero = true;
            for (Object o : c) { if (!primero) sb.append(','); primero = false; escribir(sb, o); }
            sb.append(']');
            return;
        }
        cadena(sb, String.valueOf(v));
    }

    private static void cadena(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                default -> { if (c < 0x20) sb.append(String.format("\\u%04x", (int) c)); else sb.append(c); }
            }
        }
        sb.append('"');
    }
}
