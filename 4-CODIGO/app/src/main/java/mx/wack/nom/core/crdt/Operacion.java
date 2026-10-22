package mx.wack.nom.core.crdt;

import java.util.Map;

/**
 * Unica forma de cambiar un documento: asignar campos de un bloque.
 * Crear un bloque es asignar sus campos; borrarlo es asignar eliminado=true
 * (borrado logico, nunca DELETE: ver regla 3c de CU-21).
 *
 * @param id     idNodo + ":" + contador. Hace la sincronizacion idempotente.
 * @param bloque id del bloque; "_doc" para los campos del documento (nombre, modo, paginas).
 * @param campos campo -> valor nuevo
 * @param t      reloj de Lamport del nodo que la genero
 * @param n      id del nodo que la genero
 */
public record Operacion(String id, String bloque, Map<String, Object> campos, long t, String n) {

    public static final String DOC = "_doc";

    public boolean valida() {
        return id != null && !id.isBlank() && bloque != null && !bloque.isBlank()
                && campos != null && !campos.isEmpty() && n != null && !n.isBlank() && t > 0
                && bloque.length() <= 64 && campos.size() <= 400;
    }
}
