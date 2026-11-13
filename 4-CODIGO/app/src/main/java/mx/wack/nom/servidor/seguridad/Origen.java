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

    /**
     * La direccion publica de este servidor tal como la ve quien llama (p. ej. https://nomcolab.dpdns.org):
     * NOM_NUBE si esta puesta; si no, el esquema (el que dice el tunel si la peticion viene de este
     * equipo) y el nombre del Host. Va dentro de los pases que firma este servidor.
     */
    public static String publico(HttpServletRequest req) {
        String fija = System.getenv("NOM_NUBE");
        if (fija != null && !fija.isBlank()) return fija.trim().replaceAll("/+$", "");
        String remota = req.getRemoteAddr();
        boolean confiable;
        try {
            InetAddress a = remota == null ? null : InetAddress.getByName(remota);
            confiable = a == null || a.isLoopbackAddress() || a.isLinkLocalAddress();
        } catch (Exception e) { confiable = false; }
        String esquema = req.getScheme();
        String fp = req.getHeader("X-Forwarded-Proto");
        if (confiable && fp != null && fp.matches("(?i)https?")) esquema = fp.toLowerCase(java.util.Locale.ROOT);
        String host = req.getHeader("Host");
        if (host == null || host.isBlank()) host = req.getServerName() + ":" + req.getServerPort();
        return esquema + "://" + host.trim().toLowerCase(java.util.Locale.ROOT);
    }

    /** ¿Es un origen de la red local (10.x, 192.168.x, 172.16-31.x), con cualquier puerto? */
    public static boolean deRedPrivada(String origen) {
        if (origen == null) return false;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^https?://(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})(:\\d{1,5})?$").matcher(origen.trim());
        if (!m.matches()) return false;
        int a = Integer.parseInt(m.group(1)), b = Integer.parseInt(m.group(2));
        if (a > 255 || b > 255 || Integer.parseInt(m.group(3)) > 255 || Integer.parseInt(m.group(4)) > 255) return false;
        return a == 10 || (a == 192 && b == 168) || (a == 172 && b >= 16 && b <= 31);
    }

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
