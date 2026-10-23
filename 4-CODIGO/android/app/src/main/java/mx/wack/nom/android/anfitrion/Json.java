package mx.wack.nom.android.anfitrion;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import mx.wack.nom.core.crdt.Operacion;
import mx.wack.nom.core.red.EspacioRemoto;
import mx.wack.nom.core.servicio.CodecJson;

/**
 * JSON del servidor del teléfono, sin bibliotecas. Escribe y lee igual que el servidor de la
 * computadora (Jackson): los objetos del modelo salen con sus campos públicos, los enum por
 * nombre, los record por sus componentes, y los números enteros llegan como Integer o Long.
 */
public final class Json implements CodecJson {

    public static final Json YO = new Json();

    private Json() { }

    @Override
    public byte[] escribir(Object valor) { return texto(valor).getBytes(java.nio.charset.StandardCharsets.UTF_8); }

    @Override
    public Object leer(String texto) { return new Lector(texto).valor(); }

    // ------------------------------------------------------------------ escribir

    public static String texto(Object v) {
        StringBuilder sb = new StringBuilder();
        escribir(sb, v);
        return sb.toString();
    }

    private static void escribir(StringBuilder sb, Object v) {
        if (v == null) { sb.append("null"); return; }
        if (v instanceof String) { cadena(sb, (String) v); return; }
        if (v instanceof Boolean) { sb.append(v); return; }
        if (v instanceof Double || v instanceof Float) {
            double d = ((Number) v).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) sb.append("null");
            else if (d == Math.rint(d) && Math.abs(d) < 1e15) sb.append((long) d).append(".0");
            else sb.append(d);
            return;
        }
        if (v instanceof Number) { sb.append(v); return; }
        if (v instanceof Enum) { cadena(sb, ((Enum<?>) v).name()); return; }
        if (v instanceof Map) {
            sb.append('{');
            boolean primero = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) {
                if (!primero) sb.append(',');
                primero = false;
                cadena(sb, String.valueOf(e.getKey()));
                sb.append(':');
                escribir(sb, e.getValue());
            }
            sb.append('}');
            return;
        }
        if (v instanceof Collection) {
            sb.append('[');
            boolean primero = true;
            for (Object o : (Collection<?>) v) {
                if (!primero) sb.append(',');
                primero = false;
                escribir(sb, o);
            }
            sb.append(']');
            return;
        }
        if (v instanceof Object[]) {
            List<Object> l = new ArrayList<>();
            for (Object o : (Object[]) v) l.add(o);
            escribir(sb, l);
            return;
        }
        escribir(sb, aMapa(v));
    }

    private static void cadena(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        sb.append('"');
    }

    /** Un objeto como mapa: componentes del record o campos públicos (lo mismo que hace Jackson). */
    public static Map<String, Object> aMapa(Object o) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (o instanceof Operacion) {
            Operacion op = (Operacion) o;
            m.put("id", op.id());
            m.put("bloque", op.bloque());
            m.put("campos", op.campos());
            m.put("t", op.t());
            m.put("n", op.n());
            m.put("s", op.s());
            return m;
        }
        if (o instanceof EspacioRemoto) {
            EspacioRemoto e = (EspacioRemoto) o;
            m.put("id", e.id());
            m.put("nombre", e.nombre());
            m.put("propietario", e.propietario());
            m.put("color", e.color());
            m.put("equipo", e.equipo());
            m.put("host", e.host());
            m.put("puerto", e.puerto());
            m.put("local", e.local());
            return m;
        }
        for (Field f : o.getClass().getFields()) {
            if (Modifier.isStatic(f.getModifiers())) continue;
            try { m.put(f.getName(), f.get(o)); } catch (IllegalAccessException ignorado) { }
        }
        return m;
    }

    // ------------------------------------------------------------------ objetos desde mapas

    /** Arma un objeto del modelo desde un mapa leído de JSON (campos públicos, con sus tipos). */
    @SuppressWarnings("unchecked")
    public static <T> T aObjeto(Object valor, Class<T> tipo) { return (T) convertir(valor, tipo); }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static Object convertir(Object v, Type tipo) {
        if (tipo instanceof ParameterizedType) {
            ParameterizedType pt = (ParameterizedType) tipo;
            Class<?> crudo = (Class<?>) pt.getRawType();
            if (Map.class.isAssignableFrom(crudo)) {
                if (!(v instanceof Map)) return null;
                Type tv = pt.getActualTypeArguments()[1];
                Map<String, Object> r = new LinkedHashMap<>();
                for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) r.put(String.valueOf(e.getKey()), convertir(e.getValue(), tv));
                return r;
            }
            if (Collection.class.isAssignableFrom(crudo)) {
                if (!(v instanceof Collection)) return null;
                Type te = pt.getActualTypeArguments()[0];
                List<Object> r = new ArrayList<>();
                for (Object o : (Collection<?>) v) r.add(convertir(o, te));
                return r;
            }
            return convertir(v, crudo);
        }
        Class<?> c = (Class<?>) tipo;
        if (v == null) {
            if (c == int.class || c == long.class || c == double.class) return 0;
            if (c == boolean.class) return false;
            return null;
        }
        if (c == Object.class) return v;
        if (c == String.class) return String.valueOf(v);
        if (c == int.class || c == Integer.class) return ((Number) v).intValue();
        if (c == long.class || c == Long.class) return ((Number) v).longValue();
        if (c == double.class || c == Double.class) return ((Number) v).doubleValue();
        if (c == boolean.class || c == Boolean.class) return Boolean.TRUE.equals(v);
        if (c.isEnum()) return Enum.valueOf((Class<Enum>) c, String.valueOf(v));
        if (Map.class.isAssignableFrom(c) || Collection.class.isAssignableFrom(c)) return v;
        if (!(v instanceof Map)) return null;
        try {
            Object o = c.getDeclaredConstructor().newInstance();
            Map<?, ?> m = (Map<?, ?>) v;
            for (Field f : c.getFields()) {
                if (Modifier.isStatic(f.getModifiers()) || Modifier.isFinal(f.getModifiers()) || !m.containsKey(f.getName())) continue;
                f.set(o, convertir(m.get(f.getName()), f.getGenericType()));
            }
            return o;
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("No se pudo leer " + c.getSimpleName(), e);
        }
    }

    /** Una operación que llegó por la API (Jackson la arma igual desde sus componentes). */
    @SuppressWarnings("unchecked")
    public static Operacion operacion(Object o) {
        if (!(o instanceof Map)) return null;
        Map<String, Object> m = (Map<String, Object>) o;
        Object t = m.get("t");
        return new Operacion(m.get("id") == null ? null : String.valueOf(m.get("id")),
                m.get("bloque") == null ? null : String.valueOf(m.get("bloque")),
                m.get("campos") instanceof Map ? (Map<String, Object>) m.get("campos") : null,
                t instanceof Number ? ((Number) t).longValue() : 0,
                m.get("n") == null ? null : String.valueOf(m.get("n")),
                m.get("s") instanceof Map ? (Map<String, Object>) m.get("s") : null);
    }

    public static List<Operacion> operaciones(Object o) {
        if (!(o instanceof List)) return null;
        List<Operacion> r = new ArrayList<>();
        for (Object x : (List<?>) o) r.add(operacion(x));
        return r;
    }

    // ------------------------------------------------------------------ leer

    private static final class Lector {
        private final String s;
        private int i;

        Lector(String s) { this.s = s; }

        Object valor() {
            espacios();
            if (i >= s.length()) throw new IllegalArgumentException("JSON vacío");
            char c = s.charAt(i);
            if (c == '{') return objeto();
            if (c == '[') return lista();
            if (c == '"') return cadena();
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i)) { i += 4; return null; }
            return numero();
        }

        private void espacios() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }

        private void esperar(char c) {
            espacios();
            if (i >= s.length() || s.charAt(i) != c) throw new IllegalArgumentException("Se esperaba '" + c + "' en " + i);
            i++;
        }

        private Map<String, Object> objeto() {
            Map<String, Object> m = new LinkedHashMap<>();
            esperar('{');
            espacios();
            if (i < s.length() && s.charAt(i) == '}') { i++; return m; }
            while (true) {
                espacios();
                String k = cadena();
                esperar(':');
                m.put(k, valor());
                espacios();
                if (i < s.length() && s.charAt(i) == ',') { i++; continue; }
                esperar('}');
                return m;
            }
        }

        private List<Object> lista() {
            List<Object> l = new ArrayList<>();
            esperar('[');
            espacios();
            if (i < s.length() && s.charAt(i) == ']') { i++; return l; }
            while (true) {
                l.add(valor());
                espacios();
                if (i < s.length() && s.charAt(i) == ',') { i++; continue; }
                esperar(']');
                return l;
            }
        }

        private String cadena() {
            esperar('"');
            StringBuilder sb = new StringBuilder();
            while (i < s.length()) {
                char c = s.charAt(i++);
                if (c == '"') return sb.toString();
                if (c != '\\') { sb.append(c); continue; }
                char e = s.charAt(i++);
                switch (e) {
                    case 'n': sb.append('\n'); break;
                    case 'r': sb.append('\r'); break;
                    case 't': sb.append('\t'); break;
                    case 'b': sb.append('\b'); break;
                    case 'f': sb.append('\f'); break;
                    case 'u': sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                    default: sb.append(e);
                }
            }
            throw new IllegalArgumentException("Texto sin cerrar");
        }

        private Number numero() {
            int ini = i;
            boolean decimal = false;
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == '.' || c == 'e' || c == 'E') decimal = true;
                else if (!(c == '-' || c == '+' || (c >= '0' && c <= '9'))) break;
                i++;
            }
            String n = s.substring(ini, i);
            if (n.isEmpty()) throw new IllegalArgumentException("Valor no válido en " + ini);
            if (decimal) return Double.parseDouble(n);
            long l = Long.parseLong(n);
            if (l >= Integer.MIN_VALUE && l <= Integer.MAX_VALUE) return (int) l;
            return l;
        }
    }
}
