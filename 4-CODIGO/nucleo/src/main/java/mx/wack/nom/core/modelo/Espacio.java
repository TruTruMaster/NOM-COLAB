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
    /** Formato con el que nacen los documentos de texto del espacio: { fuente, tam, interlineado }. */
    public Map<String, Object> formatoBase;
    /** Enlaces (y codigos QR) para unirse sin pedir acceso: caducan y se pueden revocar. */
    public List<EnlaceUnion> enlaces = new ArrayList<>();
    /** Copia del espacio en otro servidor (el telefono del salon con Azure o el servidor propio). */
    public Sincronia sincronia;
    /** 8.5 Avisos de cada persona (menciones en comentarios): usuarioId -> los ultimos 40. */
    public Map<String, List<Map<String, Object>>> avisos;
    /** Fase 15: espacio cifrado de extremo a extremo (se decide al crearlo). Su nombre y el contenido de
        sus documentos y su chat llegan cifrados; el servidor guarda la estructura en claro. */
    public boolean e2e;
    /** usuarioId -> la llave del espacio envuelta para esa cuenta (solo su equipo la abre). */
    public Map<String, String> llaves;

    public static class Conexion {
        public boolean activa;
        public long desde;
    }

    /** Un enlace para unirse: quien lo abre entra con este permiso mientras siga vigente. */
    public static class EnlaceUnion {
        public String codigo;
        public Permiso permiso = Permiso.EDICION;
        public long creado;
        /** Epoch ms en que deja de servir. */
        public long caduca;
        public boolean revocado;
        /** Permite entrar con apodo, sin registrarse (modo salon). */
        public boolean invitados;
        public int usos;

        public boolean vigente(long ahora) { return !revocado && caduca > ahora; }
    }

    /** A que servidor se copia este espacio y como se emparejan los documentos. */
    public static class Sincronia {
        public String servidor;
        public String usuario;
        /** Sesion en el otro servidor (nunca sale en la API). */
        public String token;
        public String espacioRemoto;
        /** documento de aqui -> documento del otro servidor */
        public Map<String, String> docs = new LinkedHashMap<>();
        /** documento de aqui -> "modificado" al terminar la ultima copia */
        public Map<String, Long> copiados = new LinkedHashMap<>();
        /** documento del otro servidor -> su "modificado" al terminar la ultima copia */
        public Map<String, Long> remotos = new LinkedHashMap<>();
        public long ultima;
        public String estado;
        public String error;
        /** Fase 13, parte B: desde cuando no hay conexion con el otro servidor (0 = la ultima salio bien). */
        public long sinRedDesde;
        /** documento de aqui -> la base: el reloj mas alto de cada nodo del de alla al terminar la ultima copia. */
        public Map<String, Map<String, Long>> bases = new LinkedHashMap<>();
        /** documento de aqui -> hasta cuando ya se mando su bitacora (quien escribio que) al otro servidor. */
        public Map<String, Long> actividadHasta = new LinkedHashMap<>();
    }

    public Permiso permisoDe(String usuarioId) {
        return accesos.get(usuarioId);
    }
}
