package mx.wack.nom.core.crdt;

/**
 * Registro LWW (last-writer-wins): un valor y la marca de quien lo escribio.
 * El orden total es (t, n): primero el reloj de Lamport y, si empatan, el id
 * de nodo. Asi todos los nodos eligen el mismo ganador sin hablar entre si.
 */
public class Registro {
    public Object v;
    public long t;
    public String n;

    public Registro() { }

    public Registro(Object v, long t, String n) {
        this.v = v;
        this.t = t;
        this.n = n;
    }

    /** true si una escritura (t, n) le gana a este registro. */
    public boolean pierdeContra(long otroT, String otroN) {
        if (otroT != t) return otroT > t;
        return otroN.compareTo(n == null ? "" : n) > 0;
    }
}
