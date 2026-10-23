package mx.wack.nom.core.servicio;

import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Mensajes del servidor con java.util.logging, que existe igual en la computadora (Spring lo
 * manda a su consola) y en Android (va a logcat). Los {} se reemplazan en orden por los datos.
 */
public final class Bitacora {
    private final Logger log;

    private Bitacora(Class<?> c) { this.log = Logger.getLogger(c.getName()); }

    public static Bitacora de(Class<?> c) { return new Bitacora(c); }

    public void info(String m, Object... datos) { anotar(Level.INFO, m, null, datos); }

    public void aviso(String m, Object... datos) { anotar(Level.WARNING, m, null, datos); }

    public void detalle(String m, Object... datos) { anotar(Level.FINE, m, null, datos); }

    public void error(String m, Throwable e) { anotar(Level.SEVERE, m, e); }

    private void anotar(Level nivel, String m, Throwable e, Object... datos) {
        if (!log.isLoggable(nivel)) return;
        StringBuilder sb = new StringBuilder();
        int i = 0, k = 0;
        while (i < m.length()) {
            int j = m.indexOf("{}", i);
            if (j < 0 || k >= datos.length) { sb.append(m, i, m.length()); break; }
            sb.append(m, i, j).append(datos[k++]);
            i = j + 2;
        }
        log.log(nivel, sb.toString(), e);
    }
}
