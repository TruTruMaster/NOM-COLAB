package mx.wack.nom.servidor.seguridad;

import java.net.InetAddress;

import jakarta.servlet.http.HttpServletRequest;

/**
 * De donde viene una peticion (su direccion de red), para los limites contra el abuso: intentos de
 * contrasena y cuentas nuevas por hora.
 *
 * Detras de un tunel o de un balanceador todas las peticiones llegan desde el mismo lugar y la
 * direccion real viene en una cabecera. Esa cabecera solo se cree cuando quien la entrega es de
 * confianza (si no, cualquiera podria escribirla):
 *  - este mismo equipo (el tunel de Cloudflare o Funnel corren aqui), o
 *  - una direccion "de enlace" (169.254.x.x, fe80::), que es desde donde entrega las peticiones
 *    la plataforma de Azure; un equipo de la red del salon (192.168.x, 10.x) nunca llega asi.
 * Una peticion de este mismo equipo sin cabecera es del propio equipo: null (sin limites).
 */
public final class Origen {
    private Origen() { }

    public static String de(HttpServletRequest req) {
        String remota = req.getRemoteAddr();
        boolean local, enlace = false;
        try {
            InetAddress a = remota == null ? null : InetAddress.getByName(remota);
            local = a == null || a.isLoopbackAddress();
            enlace = a != null && a.isLinkLocalAddress();
        } catch (Exception e) { local = false; }
        if (!local && !enlace) return remota;
        String r = req.getHeader("CF-Connecting-IP");
        if (r == null || r.isBlank()) {
            r = req.getHeader("X-Forwarded-For");
            if (r != null && r.contains(",")) r = r.substring(0, r.indexOf(','));
            // Azure la manda con el puerto ("203.0.113.5:51234"): se queda solo la direccion.
            if (r != null && r.trim().matches("\\d+(\\.\\d+){3}:\\d+")) r = r.substring(0, r.lastIndexOf(':'));
        }
        if (r == null || r.isBlank()) return local ? null : remota;
        return r.trim();
    }
}
