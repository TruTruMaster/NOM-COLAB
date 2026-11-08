package mx.wack.nom.android.anfitrion;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

/**
 * Archivos JSON del servidor del teléfono, en la carpeta privada de la app. Igual que en la
 * computadora, cada escritura va a un archivo temporal y luego lo reemplaza: si se apaga el
 * teléfono a la mitad, no queda un JSON roto. Y como en la computadora, antes de reemplazar uno
 * se guarda la versión anterior (.resp1 a .resp3, como mucho cada 10 minutos); si un archivo no se
 * puede leer, se usa su respaldo más reciente.
 */
final class Almacen {
    private final File raiz;
    private final java.util.Map<String, Long> ultimoRespaldo = new java.util.concurrent.ConcurrentHashMap<>();

    Almacen(File raiz) {
        this.raiz = raiz;
        if (!raiz.isDirectory() && !raiz.mkdirs()) throw new IllegalStateException("No se pudo crear " + raiz);
    }

    File ruta(String relativa) { return new File(raiz, relativa); }

    File raiz() { return raiz; }

    private static File respaldo(File f, int i) { return new File(f.getParentFile(), f.getName() + ".resp" + i); }

    /** El contenido JSON ya leído (mapas, listas…), o siFalta si el archivo no existe. */
    Object leer(String relativa, Object siFalta) {
        File f = ruta(relativa);
        if (!f.isFile()) return siFalta;
        try {
            return Json.YO.leer(leerTexto(f));
        } catch (RuntimeException e) {
            for (int i = 1; i <= 3; i++) {
                File r = respaldo(f, i);
                if (!r.isFile()) continue;
                try { return Json.YO.leer(leerTexto(r)); } catch (RuntimeException ignorado) { /* el siguiente */ }
            }
            throw e;
        }
    }

    private void rotar(String relativa, File f) {
        if (!f.isFile() || relativa.contains("/v/") || relativa.startsWith("recibos/")) return;
        long ahora = System.currentTimeMillis();
        Long antes = ultimoRespaldo.get(relativa);
        if (antes != null && ahora - antes < 10 * 60_000L) return;
        ultimoRespaldo.put(relativa, ahora);
        for (int i = 3; i > 1; i--) { File de = respaldo(f, i - 1); if (de.isFile()) { File a = respaldo(f, i); a.delete(); de.renameTo(a); } }
        try (InputStream in = new FileInputStream(f); FileOutputStream o = new FileOutputStream(respaldo(f, 1))) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
        } catch (IOException e) { /* sin respaldo esta vez */ }
    }

    static String leerTexto(File f) {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream((int) Math.max(256, f.length()));
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return new String(b.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo leer " + f.getName(), e);
        }
    }

    synchronized void escribir(String relativa, Object valor) {
        File f = ruta(relativa);
        File dir = f.getParentFile();
        if (dir != null && !dir.isDirectory()) dir.mkdirs();
        File tmp = new File(dir, f.getName() + ".tmp");
        try (FileOutputStream o = new FileOutputStream(tmp)) {
            o.write(Json.YO.escribir(valor));
            o.getFD().sync();
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo guardar " + relativa, e);
        }
        rotar(relativa, f);
        if (!tmp.renameTo(f)) {
            f.delete();
            if (!tmp.renameTo(f)) throw new UncheckedIOException(new IOException("No se pudo reemplazar " + relativa));
        }
    }

    synchronized void agregarLinea(String relativa, Object valor) {
        File f = ruta(relativa);
        File dir = f.getParentFile();
        if (dir != null && !dir.isDirectory()) dir.mkdirs();
        try (FileOutputStream o = new FileOutputStream(f, true)) {
            o.write((Json.texto(valor) + "\n").getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo anotar en " + relativa, e);
        }
    }

    long tamano(String relativa) {
        File f = ruta(relativa);
        return f.isFile() ? f.length() : 0;
    }

    void borrar(String relativa) { borrarTodo(ruta(relativa)); }

    private static void borrarTodo(File f) {
        File[] hijos = f.listFiles();
        if (hijos != null) for (File h : hijos) borrarTodo(h);
        f.delete();
    }
}
