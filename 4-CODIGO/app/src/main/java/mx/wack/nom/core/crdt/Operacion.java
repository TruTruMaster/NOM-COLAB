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
 */
public record Operacion(String id, String bloque, Map<String, Object> campos, long t, String n, Map<String, Object> s) {

    public static final String DOC = "_doc";

    public Operacion(String id, String bloque, Map<String, Object> campos, long t, String n) {
        this(id, bloque, campos, t, n, null);
    }

    public boolean esSecuencia() { return s != null; }

    public boolean valida() {
        boolean cuerpo = s != null ? s.get("k") instanceof String && !DOC.equals(bloque)
                : campos != null && !campos.isEmpty() && campos.size() <= 400;
        return cuerpo && id != null && !id.isBlank() && bloque != null && !bloque.isBlank()
                && n != null && !n.isBlank() && n.length() <= 64 && t > 0 && bloque.length() <= 64;
    }
}
