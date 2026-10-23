package mx.wack.nom.core.servicio;

/** JSON para los anuncios de la red local: Jackson en la computadora, uno propio en el teléfono. */
public interface CodecJson {
    byte[] escribir(Object valor);

    /** Lee un JSON: mapas, listas, textos, números, booleanos o null. */
    Object leer(String texto);
}
