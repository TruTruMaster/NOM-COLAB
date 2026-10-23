package mx.wack.nom.core.servicio;

import java.io.IOException;

/**
 * Por donde le llegan los avisos en tiempo real a un cliente: un EventSource (SSE). En la
 * computadora lo da Spring; en el teléfono, el servidor de la app.
 */
public interface Canal {
    /** Manda un evento con datos JSON. Falla con IOException si el cliente ya se fue. */
    void enviar(String evento, Object datos) throws IOException;

    /** Comentario vacío que mantiene viva la conexión y descubre clientes muertos. */
    void latido() throws IOException;

    void cerrar();

    /** Lo que hay que hacer cuando el cliente se desconecta. */
    void alCerrar(Runnable r);
}
