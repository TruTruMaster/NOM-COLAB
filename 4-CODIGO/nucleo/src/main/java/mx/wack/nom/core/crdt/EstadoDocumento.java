package mx.wack.nom.core.crdt;

import java.util.LinkedHashMap;
import java.util.Map;

/** bloque -> campo -> registro LWW. Es lo que se guarda en disco y lo que se manda al abrir. */
public class EstadoDocumento {
    public Map<String, Map<String, Registro>> bloques = new LinkedHashMap<>();
    /** Mayor reloj visto. El servidor firma sus propias operaciones con reloj + 1. */
    public long reloj;
    /** bloque -> texto letra por letra (documentos de texto). */
    public Map<String, Secuencia> seq = new LinkedHashMap<>();

    /** Prefijo de las secuencias dentro de la foto de una version. */
    public static final String SEQ = "_seq:";

    public Object valor(String bloque, String campo) {
        Map<String, Registro> b = bloques.get(bloque);
        if (b == null) return null;
        Registro r = b.get(campo);
        return r == null ? null : r.v;
    }

    public boolean vivo(String bloque) {
        return bloques.containsKey(bloque) && !Boolean.TRUE.equals(valor(bloque, "eliminado"));
    }

    /** Copia para mandar al cliente sin bloquear el documento mientras se serializa. */
    public EstadoDocumento copia() {
        EstadoDocumento c = new EstadoDocumento();
        c.reloj = reloj;
        bloques.forEach((id, campos) -> c.bloques.put(id, new LinkedHashMap<>(campos)));
        seq.forEach((b, s) -> c.seq.put(b, Secuencia.desde(s.copia())));
        return c;
    }

    /** Copia profunda de los valores vivos (para versiones). */
    public Map<String, Map<String, Object>> foto() {
        Map<String, Map<String, Object>> f = new LinkedHashMap<>();
        bloques.forEach((id, campos) -> {
            if (!vivo(id) && !Operacion.DOC.equals(id)) return;
            Map<String, Object> c = new LinkedHashMap<>();
            campos.forEach((k, r) -> c.put(k, r.v));
            f.put(id, c);
        });
        seq.forEach((b, s) -> f.put(SEQ + b, s.copia()));
        return f;
    }
}
