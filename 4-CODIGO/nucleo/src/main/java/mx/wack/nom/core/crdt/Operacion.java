package mx.wack.nom.core.crdt;

import java.util.Map;

/**
 * Unica forma de cambiar un documento: asignar campos de un bloque.
 * Crear un bloque es asignar sus campos; borrarlo es asignar eliminado=true
 * (borrado logico, nunca DELETE: ver regla 3c de CU-21).
 *
 * El texto letra por letra va en 's' (insertar, mostrar/ocultar o dar formato a
 * caracteres, ver Secuencia); en ese caso 'campos' va vacio.
 *
 * @param id     idNodo + ":" + contador. Hace la sincronizacion idempotente.
 * @param bloque id del bloque; "_doc" para los campos del documento (nombre, modo, paginas).
 * @param campos campo -> valor nuevo
 * @param t      reloj de Lamport del nodo que la genero
 * @param n      id del nodo que la genero
 * @param s      operacion de secuencia (opcional)
 * @param m      datos de la bitacora que no cambian el documento (opcional): { o: "p" } si el
 *               texto vino de pegar, con g = id del pegado y gn = cuantas letras tenia;
 *               { o: "c" } si es una cita insertada con su fuente (fase 9) y { o: "r" } si solo
 *               reacomoda lo que ya estaba (insertar o borrar filas, ordenar): no es tecleado.
 */
public record Operacion(String id, String bloque, Map<String, Object> campos, long t, String n, Map<String, Object> s,
                        Map<String, Object> m) {

    public static final String DOC = "_doc";

    public Operacion(String id, String bloque, Map<String, Object> campos, long t, String n) {
        this(id, bloque, campos, t, n, null, null);
    }

    public Operacion(String id, String bloque, Map<String, Object> campos, long t, String n, Map<String, Object> s) {
        this(id, bloque, campos, t, n, s, null);
    }

    public boolean esSecuencia() { return s != null; }

    /** El contenido vino de pegar (Ctrl+V, "Pegar" de la ruedita o el teclado del celular). */
    public boolean pegada() { return m != null && "p".equals(m.get("o")); }

    /** Cita textual insertada desde una fuente (panel Investigar o fichas). */
    public boolean citada() { return m != null && "c".equals(m.get("o")); }

    /** Solo mueve lo que ya estaba (insertar o borrar filas y columnas, ordenar) o lo armó la app
        (portada, preguntas guía y referencias del reporte): no lo escribió nadie. */
    public boolean reacomodo() { return m != null && "r".equals(m.get("o")); }

    public boolean valida() {
        boolean cuerpo = s != null ? s.get("k") instanceof String && !DOC.equals(bloque)
                : campos != null && !campos.isEmpty() && campos.size() <= 400;
        return cuerpo && id != null && !id.isBlank() && bloque != null && !bloque.isBlank()
                && n != null && !n.isBlank() && n.length() <= 64 && t > 0 && bloque.length() <= 64;
    }
}
