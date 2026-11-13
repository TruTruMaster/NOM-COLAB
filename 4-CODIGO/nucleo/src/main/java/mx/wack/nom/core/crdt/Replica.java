package mx.wack.nom.core.crdt;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Fase 13, parte B (ramas): copiar un documento EXACTO (cada registro con su reloj y su nodo de
 * origen) y saber que cambio desde una "base".
 *
 * La base es el reloj mas alto que un equipo tenia de cada nodo al quedarse sin conexion (un
 * vector nodo -> reloj). Lo posterior a la base, de un nodo que no es de esa persona, lo cambio
 * otra persona "mientras tanto". Como la copia conserva relojes y nodos, una rama se puede volver a
 * juntar con el original sin duplicar nada: el CRDT reconoce lo que ya estaba.
 */
public final class Replica {
    private Replica() { }

    /** El reloj mas alto de cada nodo en un estado (registros y texto letra por letra). */
    public static Map<String, Long> vector(EstadoDocumento est) {
        Map<String, Long> v = new LinkedHashMap<>();
        for (Map<String, Registro> campos : est.bloques.values())
            for (Registro r : campos.values()) if (r != null && r.n != null) v.merge(r.n, r.t, Math::max);
        for (Secuencia s : est.seq.values()) {
            for (Map<String, Object> e : s.ins) {
                long t = num(e.get("t")), fin = t + Math.max(0, largo(e) - 1);
                if (e.get("n") != null) v.merge(String.valueOf(e.get("n")), fin, Math::max);
            }
            for (List<Map<String, Object>> l : List.of(s.vis, s.fmt))
                for (Map<String, Object> e : l) if (e.get("n") != null) v.merge(String.valueOf(e.get("n")), num(e.get("t")), Math::max);
        }
        return v;
    }

    private static long num(Object o) { return o instanceof Number n ? n.longValue() : 0; }

    /** Cuantos caracteres inserta una entrada "ins" (un objeto, como una imagen, cuenta uno). */
    private static int largo(Map<String, Object> e) {
        Object ev = e.get("e");
        if (ev != null && !Boolean.FALSE.equals(ev)) return 1;
        Object x = e.get("x");
        return x instanceof String s ? s.codePointCount(0, s.length()) : 1;
    }

    private static boolean posterior(long t, String n, Map<String, Long> base, Set<String> mios) {
        if (n == null || mios.contains(n)) return false;
        Long b = base.get(n);
        return b == null || t > b;
    }

    /**
     * Lo que otros cambiaron despues de la base: cuantos registros, en que bloques y que nodos.
     * Los nodos "mios" (las pestanas de esa persona) no cuentan.
     */
    public static Map<String, Object> cambiosDeOtros(EstadoDocumento est, Map<String, Long> base, Collection<String> mios) {
        Set<String> yo = new java.util.HashSet<>(mios == null ? List.of() : mios);
        Map<String, Long> b = base == null ? Map.of() : base;
        int n = 0;
        Set<String> bloques = new java.util.LinkedHashSet<>(), nodos = new java.util.LinkedHashSet<>();
        for (var bl : est.bloques.entrySet()) {
            for (var c : bl.getValue().entrySet()) {
                Registro r = c.getValue();
                if (r == null || !posterior(r.t, r.n, b, yo)) continue;
                n++;
                if (bloques.size() < 50) bloques.add(bl.getKey());
                nodos.add(r.n);
            }
        }
        for (var sq : est.seq.entrySet()) {
            Secuencia s = sq.getValue();
            for (List<Map<String, Object>> l : List.of(s.ins, s.vis, s.fmt)) {
                for (Map<String, Object> e : l) {
                    String nn = e.get("n") == null ? null : String.valueOf(e.get("n"));
                    long t = num(e.get("t"));
                    if (l == s.ins) t = t + Math.max(0, largo(e) - 1);
                    if (!posterior(t, nn, b, yo)) continue;
                    n++;
                    if (bloques.size() < 50) bloques.add(sq.getKey());
                    nodos.add(nn);
                }
            }
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("otros", n > 0);
        r.put("cambios", n);
        r.put("bloques", new ArrayList<>(bloques));
        r.put("nodos", new ArrayList<>(nodos));
        return r;
    }

    /**
     * Operaciones que recrean el estado exacto (un registro por campo con su reloj y nodo; cada
     * entrada del texto). excluirDoc: campos de _doc que no se copian (p. ej. el nombre al fusionar).
     * Sus ids son fijos: mandarlas dos veces no cambia nada.
     */
    public static List<Operacion> operaciones(EstadoDocumento est, Set<String> excluirDoc, Map<String, Object> meta) {
        List<Operacion> ops = new ArrayList<>();
        for (var b : est.bloques.entrySet()) {
            Map<String, Map<String, Object>> grupos = new LinkedHashMap<>();
            Map<String, long[]> relojes = new LinkedHashMap<>();
            Map<String, String> nodos = new LinkedHashMap<>();
            for (var c : b.getValue().entrySet()) {
                Registro r = c.getValue();
                if (r == null || r.n == null || r.t <= 0) continue;
                if (Operacion.DOC.equals(b.getKey()) && (excluirDoc.contains(c.getKey()) || "modo".equals(c.getKey()))) continue;
                String k = r.t + "|" + r.n;
                grupos.computeIfAbsent(k, z -> new LinkedHashMap<>()).put(c.getKey(), r.v);
                relojes.put(k, new long[] { r.t });
                nodos.put(k, r.n);
            }
            for (var g : grupos.entrySet()) {
                List<String> ks = new ArrayList<>(g.getValue().keySet());
                for (int i = 0, parte = 0; i < ks.size(); i += 300, parte++) {
                    Map<String, Object> trozo = new LinkedHashMap<>();
                    for (String k : ks.subList(i, Math.min(ks.size(), i + 300))) trozo.put(k, g.getValue().get(k));
                    long t = relojes.get(g.getKey())[0];
                    String n = nodos.get(g.getKey());
                    ops.add(new Operacion("rx:" + n + ":" + t + ":" + b.getKey() + (parte > 0 ? ":" + parte : ""), b.getKey(), trozo, t, n, null, meta));
                }
            }
        }
        for (var b : est.seq.entrySet()) {
            Secuencia s = b.getValue();
            String[][] listas = { { "ins", "i" }, { "vis", "v" }, { "fmt", "f" } };
            for (String[] par : listas) {
                List<Map<String, Object>> l = "ins".equals(par[0]) ? s.ins : "vis".equals(par[0]) ? s.vis : s.fmt;
                for (Map<String, Object> en : l) {
                    if (en.get("n") == null || !(en.get("t") instanceof Number t)) continue;
                    Map<String, Object> x = new LinkedHashMap<>(en);
                    x.remove("t");
                    x.remove("n");
                    x.put("k", par[1]);
                    String n = String.valueOf(en.get("n"));
                    ops.add(new Operacion("rx:" + par[1] + ":" + n + ":" + t.longValue() + ":" + b.getKey(), b.getKey(), Map.of(), t.longValue(), n, x, meta));
                }
            }
        }
        return ops;
    }
}
