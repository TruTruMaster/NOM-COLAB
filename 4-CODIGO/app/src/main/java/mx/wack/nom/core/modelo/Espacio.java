package mx.wack.nom.core.modelo;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Espacio colaborativo. Guarda sus accesos y si esta visible en la red local. */
public class Espacio {
    public String id;
    public String nombre;
    public String propietarioId;
    public long creado;
    /** Color de la tarjeta del espacio (solo estetico). */
    public String color;
    public Conexion conexion = new Conexion();
    /** usuarioId -> permiso */
    public Map<String, Permiso> accesos = new LinkedHashMap<>();
    public List<SolicitudAcceso> solicitudes = new ArrayList<>();

    public static class Conexion {
        public boolean activa;
        public long desde;
    }

    public Permiso permisoDe(String usuarioId) {
        return accesos.get(usuarioId);
    }
}
