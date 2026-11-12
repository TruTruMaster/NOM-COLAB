package mx.wack.nom.servidor.seguridad;

import java.net.InetAddress;

import jakarta.servlet.http.HttpServletRequest;

/**
 * De donde viene una peticion (su direccion de red), para los limites contra el abuso: intentos de
 * contrasena y cuentas nuevas por hora.
 *
 * Detras del tunel (Cloudflare, Funnel) todas las peticiones llegan desde este mismo equipo y la
 * direccion real viene en una cabecera; esa cabecera solo se cree cuando la conexion es local (si
 * no, cualquiera podria escribirla). Una peticion local sin cabecera es de este equipo: null.
 */
public final class Origen {
    private Origen() { }

    public static String de(HttpServletRequest req) {
        String remota = req.getRemoteAddr();
        boolean local;
        try { local = remota == null || InetAddress.getByName(remota).isLoopbackAddress(); }
        catch (Exception e) { local = false; }
        if (!local) return remota;
        String r = req.getHeader("CF-Connecting-IP");
        if (r == null || r.isBlank()) {
            r = req.getHeader("X-Forwarded-For");
            if (r != null && r.contains(",")) r = r.substring(0, r.indexOf(','));
        }
        return r == null || r.isBlank() ? null : r.trim();
    }
}
