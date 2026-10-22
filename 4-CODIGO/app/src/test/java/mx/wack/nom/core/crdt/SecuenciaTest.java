package mx.wack.nom.core.crdt;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;

import org.junit.jupiter.api.Test;

/** Texto letra por letra: guardar sin repetir, en cualquier orden, y restaurar versiones. */
class SecuenciaTest {

    private static Map<String, Object> ins(String iz, String x) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("k", "i");
        s.put("iz", iz);
        s.put("x", x);
        return s;
    }

    private static Map<String, Object> rango(String k, Object valor, String n, long t1, long t2) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("k", k);
        if (k.equals("v")) s.put("v", valor); else s.put("a", valor);
        s.put("r", List.of(List.of(n, t1, t2)));
        return s;
    }

    /** Historia: tres personas escriben, borran y dan formato. */
    private static List<Operacion> historia(long semilla) {
        Random r = new Random(semilla);
        List<Operacion> ops = new ArrayList<>();
        long t = 1;
        String[] nodos = { "ana", "beto", "carla" };
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 300; i++) {
            String n = nodos[r.nextInt(3)];
            int k = r.nextInt(10);
            if (k < 6 || ids.isEmpty()) {
                String x = r.nextBoolean() ? "hola" : "ñ😀";
                String iz = ids.isEmpty() || r.nextInt(5) == 0 ? null : ids.get(r.nextInt(ids.size()));
                ops.add(new Operacion(n + ":" + i, "cuerpo", Map.of(), t, n, ins(iz, x)));
                for (int c = 0; c < x.codePointCount(0, x.length()); c++) ids.add((t + c) + "@" + n);
                t += x.codePointCount(0, x.length());
            } else {
                String id = ids.get(r.nextInt(ids.size()));
                int at = id.indexOf('@');
                long ti = Long.parseLong(id.substring(0, at));
                String ni = id.substring(at + 1);
                ops.add(new Operacion(n + ":" + i, "cuerpo", Map.of(), t, n, k < 8
                        ? rango("v", r.nextBoolean(), ni, ti, ti)
                        : rango("f", Map.of("b", r.nextBoolean()), ni, ti, ti)));
                t++;
            }
        }
        return ops;
    }

    private static Map<String, String> plano(EstadoDocumento e) {
        Map<String, String> m = new TreeMap<>();
        e.seq.get("cuerpo").caracteres().forEach((id, c) -> m.put(id, c.visible() + " " + c.attrs()));
        return m;
    }

    private static EstadoDocumento aplicar(List<Operacion> ops) {
        EstadoDocumento e = new EstadoDocumento();
        MotorCRDT m = new MotorCRDT();
        ops.forEach(op -> m.fusionar(e, op));
        return e;
    }

    @Test
    void convergeEnCualquierOrdenYSinRepetir() {
        for (long semilla = 1; semilla <= 10; semilla++) {
            List<Operacion> ops = historia(semilla);
            EstadoDocumento ref = aplicar(ops);
            for (int k = 0; k < 5; k++) {
                List<Operacion> barajadas = new ArrayList<>(ops);
                barajadas.addAll(ops.subList(0, 50));   // duplicados
                Collections.shuffle(barajadas, new Random(semilla * 31 + k));
                EstadoDocumento otro = aplicar(barajadas);
                assertEquals(plano(ref), plano(otro), "divergencia con semilla " + semilla);
                // Ningún carácter se guarda dos veces (cuántos tramos se juntan depende del orden).
                Secuencia sq = otro.seq.get("cuerpo");
                int guardados = sq.ins.stream().mapToInt(x -> ((String) x.get("x")).codePointCount(0, ((String) x.get("x")).length())).sum();
                assertEquals(sq.caracteres().size() - 1, guardados, "caracteres repetidos");
            }
        }
    }

    @Test
    void juntaLaEscrituraSeguidaEnUnSoloTramo() {
        Secuencia s = new Secuencia();
        assertTrue(s.aplicar(ins(null, "Ho"), 1, "ana"));
        assertTrue(s.aplicar(ins("2@ana", "la"), 3, "ana"));
        assertFalse(s.aplicar(ins("2@ana", "la"), 3, "ana"));
        assertEquals(1, s.ins.size());
        assertEquals("Hola", s.ins.get(0).get("x"));
        assertEquals(4, s.visibles());
    }

    @Test
    void restaurarDejaVisibilidadYFormatoComoEnLaVersion() {
        MotorCRDT m = new MotorCRDT();
        EstadoDocumento e = new EstadoDocumento();
        m.fusionar(e, new Operacion("a:1", "cuerpo", Map.of(), 1, "ana", ins(null, "Hola mundo")));
        m.fusionar(e, new Operacion("a:2", "cuerpo", Map.of(), 20, "ana", rango("f", Map.of("b", true), "ana", 1, 4)));
        Map<String, Map<String, Object>> foto = e.foto();
        // Después de la versión: se borra "Hola", se quita la negrita y se agrega texto.
        m.fusionar(e, new Operacion("b:1", "cuerpo", Map.of(), 30, "beto", rango("v", false, "ana", 1, 5)));
        m.fusionar(e, new Operacion("b:2", "cuerpo", Map.of(), 31, "beto", rango("f", Map.of("b", false), "ana", 1, 4)));
        m.fusionar(e, new Operacion("b:3", "cuerpo", Map.of(), 32, "beto", ins("10@ana", "!!!")));
        assertEquals(8, e.seq.get("cuerpo").visibles());
        for (Operacion op : m.restaurar(e, foto, "srv")) m.fusionar(e, op);
        EstadoDocumento version = new EstadoDocumento();
        version.seq.put("cuerpo", Secuencia.desde(foto.get(EstadoDocumento.SEQ + "cuerpo")));
        Map<String, String> esperado = plano(version), actual = plano(e);
        esperado.forEach((id, v) -> assertEquals(v, actual.get(id), "carácter " + id));
        assertEquals(10, e.seq.get("cuerpo").visibles());
    }
}
