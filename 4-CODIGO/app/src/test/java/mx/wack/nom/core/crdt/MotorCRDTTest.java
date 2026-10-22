package mx.wack.nom.core.crdt;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Random;

import org.junit.jupiter.api.Test;

/** CU-21: el estado final no depende del orden de llegada ni de duplicados. */
class MotorCRDTTest {

    private static List<Operacion> historia(long semilla) {
        Random r = new Random(semilla);
        List<Operacion> ops = new ArrayList<>();
        String[] nodos = { "ana", "beto", "carla", "diego", "eva" };   // 5 usuarios simultáneos (RNF)
        long[] reloj = new long[nodos.length];
        for (int i = 0; i < 400; i++) {
            int n = r.nextInt(nodos.length);
            reloj[n] = Math.max(reloj[n], r.nextInt(30)) + 1;
            String bloque = "b" + r.nextInt(6);
            Map<String, Object> campos = r.nextInt(10) == 0
                    ? Map.of("eliminado", r.nextBoolean())
                    : Map.of("html", nodos[n] + "-" + i, "x", r.nextInt(900));
            ops.add(new Operacion(nodos[n] + ":" + i, bloque, campos, reloj[n], nodos[n]));
        }
        return ops;
    }

    private static Map<String, Map<String, Object>> aplicar(List<Operacion> ops) {
        EstadoDocumento e = new EstadoDocumento();
        MotorCRDT m = new MotorCRDT();
        ops.forEach(op -> m.fusionar(e, op));
        Map<String, Map<String, Object>> plano = new java.util.TreeMap<>();
        e.bloques.forEach((b, campos) -> {
            Map<String, Object> c = new java.util.TreeMap<>();
            campos.forEach((k, reg) -> c.put(k, reg.v));
            plano.put(b, c);
        });
        return plano;
    }

    @Test
    void convergeConCualquierOrden() {
        for (long semilla = 1; semilla <= 20; semilla++) {
            List<Operacion> ops = historia(semilla);
            Map<String, Map<String, Object>> referencia = aplicar(ops);
            for (int k = 0; k < 10; k++) {
                List<Operacion> barajadas = new ArrayList<>(ops);
                Collections.shuffle(barajadas, new Random(semilla * 100 + k));
                assertEquals(referencia, aplicar(barajadas), "divergencia con semilla " + semilla);
            }
        }
    }

    @Test
    void duplicadosNoCambianNada() {
        List<Operacion> ops = historia(7);
        List<Operacion> dobles = new ArrayList<>(ops);
        dobles.addAll(ops);
        Collections.shuffle(dobles, new Random(3));
        assertEquals(aplicar(ops), aplicar(dobles));
    }

    @Test
    void empateSeResuelveIgualEnTodosLados() {
        EstadoDocumento e = new EstadoDocumento();
        MotorCRDT m = new MotorCRDT();
        m.fusionar(e, new Operacion("diego:1", "b", Map.of("html", "de diego"), 5, "diego"));
        assertTrue(m.fusionar(e, new Operacion("eva:1", "b", Map.of("html", "de eva"), 5, "eva")).containsKey("html"));
        assertFalse(m.fusionar(e, new Operacion("ana:1", "b", Map.of("html", "de ana"), 5, "ana")).containsKey("html"));
        assertEquals("de eva", e.valor("b", "html"));
    }

    @Test
    void restaurarDevuelveElEstadoDeLaVersion() {
        EstadoDocumento e = new EstadoDocumento();
        MotorCRDT m = new MotorCRDT();
        m.fusionar(e, new Operacion("a:1", "b1", Map.of("html", "uno"), 1, "a"));
        Map<String, Map<String, Object>> foto = e.foto();
        m.fusionar(e, new Operacion("a:2", "b1", Map.of("eliminado", true), 2, "a"));
        m.fusionar(e, new Operacion("a:3", "b2", Map.of("html", "nuevo"), 3, "a"));
        m.restaurar(e, foto, "srv").forEach(op -> m.fusionar(e, op));
        assertTrue(e.vivo("b1"));
        assertEquals("uno", e.valor("b1", "html"));
        assertFalse(e.vivo("b2"));
    }
}
