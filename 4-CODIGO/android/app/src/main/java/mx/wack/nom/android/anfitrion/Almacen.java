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
 * teléfono a la mitad, no queda un JSON roto.
 */
final class Almacen {
    private final File raiz;

    Almacen(File raiz) {
        this.raiz = raiz;
        if (!raiz.isDirectory() && !raiz.mkdirs()) throw new IllegalStateException("No se pudo crear " + raiz);
    }

    File ruta(String relativa) { return new File(raiz, relativa); }

    /** El contenido JSON ya leído (mapas, listas…), o siFalta si el archivo no existe. */
    Object leer(String relativa, Object siFalta) {
        File f = ruta(relativa);
        if (!f.isFile()) return siFalta;
        return Json.YO.leer(leerTexto(f));
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
