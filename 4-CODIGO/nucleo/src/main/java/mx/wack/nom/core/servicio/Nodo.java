package mx.wack.nom.core.servicio;

import java.net.InetAddress;
import java.util.List;

/**
 * El equipo donde corre el servidor (una computadora o un teléfono): su id, su nombre, el puerto
 * HTTP y las direcciones por las que otros entran desde la red local (CU-14).
 */
public interface Nodo {
    String id();

    String equipo();

    int puerto();

    /** Direcciones IPv4 privadas de las interfaces activas. */
    List<String> direcciones();

    /** Direcciones de difusión (broadcast) de cada red, para anunciar los espacios. */
    List<InetAddress> difusion();
}
