package mx.wack.nom.core.crdt;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Mapa LWW de mapas LWW. Converge sin importar el orden de llegada porque
 * cada campo se resuelve con un orden total (t, n), y es idempotente porque
 * reaplicar la misma operacion no cambia el ganador.
 *
 * El mismo algoritmo esta en el cliente (static/js/crdt.js); ambos deben
 * resolver igual o el documento diverge.
 */
public class MotorCRDT {

    /** Ultimas operaciones vistas, para descartar duplicados (regla 3b de CU-21). */
    private final Set<String> vistas = new LinkedHashSet<>();
    private static final int MAX_VISTAS = 20_000;

    /**
     * Fusiona una operacion. Devuelve los campos que realmente cambiaron
     * (vacio si la operacion era un duplicado o perdio en todos sus campos).
     */
    public Map<String, Object> fusionar(EstadoDocumento estado, Operacion op) {
        Map<String, Object> cambios = new LinkedHashMap<>();
        if (!vistas.add(op.id())) return cambios;
        if (vistas.size() > MAX_VISTAS) {
            var it = vistas.iterator();
            for (int i = 0; i < MAX_VISTAS / 4 && it.hasNext(); i++) { it.next(); it.remove(); }
        }
        if (op.esSecuencia()) {
            long fin = op.t();
            if ("i".equals(op.s().get("k")) && op.s().get("e") == null && op.s().get("x") instanceof String x) fin += x.codePointCount(0, x.length()) - 1;
            estado.reloj = Math.max(estado.reloj, fin);
            if (estado.seq.computeIfAbsent(op.bloque(), k -> new Secuencia()).aplicar(op.s(), op.t(), op.n())) cambios.put("_seq", op.s().get("k"));
            return cambios;
        }
        estado.reloj = Math.max(estado.reloj, op.t());
        Map<String, Registro> bloque = estado.bloques.computeIfAbsent(op.bloque(), k -> new LinkedHashMap<>());
        op.campos().forEach((campo, valor) -> {
            Registro actual = bloque.get(campo);
            if (actual == null || actual.pierdeContra(op.t(), op.n())) {
                bloque.put(campo, new Registro(valor, op.t(), op.n()));
                cambios.put(campo, valor);
            }
        });
        return cambios;
    }

    /**
     * Operaciones que llevan el documento al estado de una version (CU-23).
     * Los bloques que no existian en la version se marcan eliminados; los que
     * si, recuperan sus valores. Todo con un reloj mayor, para que gane.
     */
    public List<Operacion> restaurar(EstadoDocumento actual, Map<String, Map<String, Object>> foto, String nodo) {
        List<Operacion> ops = new ArrayList<>();
        long t = actual.reloj + 1;
        int i = 0;
        for (String id : actual.bloques.keySet()) {
            if (!foto.containsKey(id) && actual.vivo(id) && !Operacion.DOC.equals(id)) {
                ops.add(new Operacion(nodo + ":r" + t + "-" + (i++), id, Map.of("eliminado", true), t, nodo));
            }
        }
        for (var e : foto.entrySet()) {
            if (e.getKey().startsWith(EstadoDocumento.SEQ)) continue;
            Map<String, Object> campos = new LinkedHashMap<>(e.getValue());
            if (!Operacion.DOC.equals(e.getKey())) campos.put("eliminado", false);
            campos.values().removeIf(v -> v == null);
            if (campos.isEmpty()) continue;
            ops.add(new Operacion(nodo + ":r" + t + "-" + (i++), e.getKey(), campos, t, nodo));
        }
        // Texto letra por letra: se ocultan, revelan y reformatean caracteres; el orden no cambia.
        java.util.Set<String> conTexto = new java.util.LinkedHashSet<>(actual.seq.keySet());
        foto.keySet().stream().filter(k -> k.startsWith(EstadoDocumento.SEQ)).forEach(k -> conTexto.add(k.substring(EstadoDocumento.SEQ.length())));
        for (String b : conTexto) {
            Secuencia ahora = actual.seq.getOrDefault(b, new Secuencia());
            Secuencia antes = Secuencia.desde(foto.get(EstadoDocumento.SEQ + b));
            for (Map<String, Object> s : ahora.restaurar(antes)) {
                t++;
                ops.add(new Operacion(nodo + ":r" + t + "-" + (i++), b, Map.of(), t, nodo, s));
            }
        }
        return ops;
    }
}
