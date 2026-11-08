package mx.wack.nom.android.anfitrion;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import mx.wack.nom.core.servicio.Bitacora;

/**
 * 6.4 Respaldo automático del servidor del teléfono: una vez al día se guarda todo
 * (filesDir/servidor: cuentas, espacios, documentos, versiones y bitácoras) en un .zip dentro de la
 * app, y se conservan los últimos 7. Así el salón no pierde nada aunque nunca haya nube. Desde
 * "Este dispositivo" se puede exportar a Descargas.
 */
public final class Respaldo {
    private static final Bitacora log = Bitacora.de(Respaldo.class);
    private static final int CONSERVAR = 7;

    private Respaldo() { }

    static File carpeta(File filesDir) { return new File(filesDir, "respaldos"); }

    /** Si hoy aún no hay respaldo, lo hace. Devuelve el archivo de hoy (o null si no había datos). */
    static synchronized File diario(File filesDir) {
        File datos = new File(filesDir, "servidor");
        if (!datos.isDirectory()) return null;
        String hoy = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
        File dir = carpeta(filesDir);
        File f = new File(dir, "nom-colab-" + hoy + ".zip");
        if (f.isFile()) return f;
        try {
            hacer(datos, f);
            limpiar(dir);
            log.info("Respaldo del día: {} ({} KB)", f.getName(), f.length() / 1024);
            return f;
        } catch (IOException e) {
            log.error("No se pudo hacer el respaldo del día", e);
            f.delete();
            return null;
        }
    }

    /** Un respaldo de este momento (para exportarlo). */
    public static synchronized File ahora(File filesDir) throws IOException {
        File datos = new File(filesDir, "servidor");
        if (!datos.isDirectory()) throw new IOException("Este teléfono todavía no tiene datos de servidor");
        String t = new SimpleDateFormat("yyyy-MM-dd-HHmm", Locale.ROOT).format(new Date());
        File f = new File(carpeta(filesDir), "nom-colab-" + t + ".zip");
        hacer(datos, f);
        limpiar(carpeta(filesDir));
        return f;
    }

    private static void hacer(File datos, File destino) throws IOException {
        File dir = destino.getParentFile();
        if (dir != null && !dir.isDirectory()) dir.mkdirs();
        File tmp = new File(dir, destino.getName() + ".tmp");
        try (ZipOutputStream z = new ZipOutputStream(new FileOutputStream(tmp))) {
            agregar(z, datos, "");
        }
        if (!tmp.renameTo(destino)) { tmp.delete(); throw new IOException("No se pudo guardar " + destino.getName()); }
    }

    private static void agregar(ZipOutputStream z, File f, String ruta) throws IOException {
        File[] hijos = f.listFiles();
        if (hijos == null) return;
        Arrays.sort(hijos);
        byte[] buf = new byte[64 * 1024];
        for (File h : hijos) {
            String nombre = ruta.isEmpty() ? h.getName() : ruta + "/" + h.getName();
            if (h.isDirectory()) { agregar(z, h, nombre); continue; }
            // Los temporales y los respaldos rotativos no hacen falta en el .zip.
            if (h.getName().endsWith(".tmp") || h.getName().matches(".*\\.resp\\d$")) continue;
            z.putNextEntry(new ZipEntry("servidor/" + nombre));
            try (InputStream in = new FileInputStream(h)) {
                int n;
                while ((n = in.read(buf)) > 0) z.write(buf, 0, n);
            }
            z.closeEntry();
        }
    }

    /** Se quedan los 7 más nuevos. */
    private static void limpiar(File dir) {
        File[] l = dir.listFiles((d, n) -> n.startsWith("nom-colab-") && n.endsWith(".zip"));
        if (l == null || l.length <= CONSERVAR) return;
        Arrays.sort(l, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        for (int i = CONSERVAR; i < l.length; i++) l[i].delete();
    }

    /** [{nombre, bytes, fecha}] de los respaldos guardados, del más nuevo al más viejo. */
    public static String lista(File filesDir) {
        JSONArray a = new JSONArray();
        File[] l = carpeta(filesDir).listFiles((d, n) -> n.startsWith("nom-colab-") && n.endsWith(".zip"));
        if (l != null) {
            Arrays.sort(l, (x, y) -> Long.compare(y.lastModified(), x.lastModified()));
            for (File f : l) {
                try { a.put(new JSONObject().put("nombre", f.getName()).put("bytes", f.length()).put("fecha", f.lastModified())); }
                catch (Exception ignorado) { }
            }
        }
        return a.toString();
    }
}
