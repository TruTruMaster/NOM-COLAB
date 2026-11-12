package mx.wack.nom.servidor.repositorio;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Persistencia en archivos JSON dentro de nom.datos. Encaja con "suite
 * liviana": no hay motor de base de datos que instalar en el equipo que
 * comparte el espacio. Las escrituras son atomicas (archivo temporal + move)
 * para que un corte de luz no deje un JSON a medias.
 *
 * Respaldos rotativos: antes de reemplazar un archivo se guarda la version anterior como
 * .resp1 (y la de antes pasa a .resp2 y .resp3), como mucho una vez cada 10 minutos por archivo.
 * Si un archivo no se puede leer (danado), se usa el respaldo mas reciente que si se lea.
 *
 * Lo pesado (el estado de cada documento y las fotos de sus versiones) se guarda comprimido
 * (gzip, con el mismo nombre de archivo): ocupa varias veces menos y eso es lo que cuenta para la
 * cuota de cada cuenta. Al leer se reconoce solo si un archivo viene comprimido o no, asi que los
 * datos de versiones anteriores se abren igual y se comprimen la siguiente vez que se guardan.
 */
@Component
public class AlmacenJson {

    private final Path raiz;
    private static final long CADA_RESPALDO = 10 * 60_000L;
    private static final int RESPALDOS = 3;
    private final java.util.Map<Path, Long> ultimoRespaldo = new java.util.concurrent.ConcurrentHashMap<>();
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AlmacenJson.class);
    private final JsonMapper json = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    public AlmacenJson(@Value("${nom.datos}") String carpeta) throws IOException {
        this.raiz = Path.of(carpeta).toAbsolutePath();
        Files.createDirectories(raiz);
    }

    public Path raiz() { return raiz; }

    public Path ruta(String relativa) { return raiz.resolve(relativa); }

    private static Path respaldo(Path p, int i) { return p.resolveSibling(p.getFileName() + ".resp" + i); }

    private <T> T leerCon(Path p, java.util.function.Function<java.io.File, T> lector, T siFalta) {
        if (!Files.exists(p)) return siFalta;
        try {
            return lector.apply(p.toFile());
        } catch (RuntimeException e) {
            for (int i = 1; i <= RESPALDOS; i++) {
                Path r = respaldo(p, i);
                if (!Files.exists(r)) continue;
                try {
                    T v = lector.apply(r.toFile());
                    log.warn("{} estaba dañado; se usó su respaldo {}", raiz.relativize(p), r.getFileName());
                    return v;
                } catch (RuntimeException ignorado) { /* el siguiente respaldo */ }
            }
            throw e;
        }
    }

    public <T> T leer(String relativa, TypeReference<T> tipo, T siFalta) {
        return leerCon(ruta(relativa), f -> { try (java.io.InputStream in = abrir(f)) { return json.readValue(in, tipo); } catch (IOException e) { throw new UncheckedIOException(e); } }, siFalta);
    }

    public <T> T leer(String relativa, Class<T> tipo, T siFalta) {
        return leerCon(ruta(relativa), f -> { try (java.io.InputStream in = abrir(f)) { return json.readValue(in, tipo); } catch (IOException e) { throw new UncheckedIOException(e); } }, siFalta);
    }

    /** ¿Va comprimido? El estado de los documentos y las fotos de sus versiones. */
    static boolean comprimido(String relativa) {
        return relativa.startsWith("docs/") && (relativa.endsWith("/estado.json") || relativa.contains("/v/"));
    }

    /** Abre un archivo, venga comprimido (empieza con 1F 8B) o como JSON tal cual. */
    private static java.io.InputStream abrir(java.io.File f) throws IOException {
        java.io.BufferedInputStream in = new java.io.BufferedInputStream(new java.io.FileInputStream(f), 64 * 1024);
        try {
            in.mark(2);
            int a = in.read(), b = in.read();
            in.reset();
            return a == 0x1F && b == 0x8B ? new java.util.zip.GZIPInputStream(in, 64 * 1024) : in;
        } catch (IOException e) {
            in.close();
            throw e;
        }
    }

    /**
     * gzip con el nivel que se pida. Las fotos de versiones se escriben una sola vez: van al
     * maximo. El estado se reescribe mientras alguien edita: un nivel medio, varias veces mas
     * rapido y casi igual de chico (importa en una Raspberry).
     */
    private static final class Gzip extends java.util.zip.GZIPOutputStream {
        Gzip(java.io.OutputStream out, int nivel) throws IOException { super(out, 64 * 1024); def.setLevel(nivel); }
    }

    /** Guarda la version actual como .resp1 (corriendo las anteriores) si ya toca. */
    private void rotar(Path p) throws IOException {
        if (!Files.exists(p)) return;
        long ahora = System.currentTimeMillis();
        Long antes = ultimoRespaldo.get(p);
        if (antes != null && ahora - antes < CADA_RESPALDO) return;
        ultimoRespaldo.put(p, ahora);
        for (int i = RESPALDOS; i > 1; i--) if (Files.exists(respaldo(p, i - 1))) Files.move(respaldo(p, i - 1), respaldo(p, i), StandardCopyOption.REPLACE_EXISTING);
        Files.copy(p, respaldo(p, 1), StandardCopyOption.REPLACE_EXISTING);
    }

    public synchronized void escribir(String relativa, Object valor) {
        Path p = ruta(relativa);
        try {
            Files.createDirectories(p.getParent());
            Path tmp = p.resolveSibling(p.getFileName() + ".tmp");
            if (comprimido(relativa)) {
                try (java.io.OutputStream out = new Gzip(new java.io.FileOutputStream(tmp.toFile()), relativa.contains("/v/") ? 9 : 5)) { json.writeValue(out, valor); }
            } else json.writeValue(tmp.toFile(), valor);
            // Las fotos de versiones y los recibos no se reescriben: no necesitan respaldo.
            if (!relativa.contains("/v/") && !relativa.startsWith("recibos/")) rotar(p);
            try {
                Files.move(tmp, p, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, p, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo guardar " + relativa, e);
        }
    }

    public long tamano(String relativa) {
        try {
            Path p = ruta(relativa);
            return Files.exists(p) ? Files.size(p) : 0;
        } catch (IOException e) {
            return 0;
        }
    }

    /** Lo que mide el contenido sin comprimir (gzip lo anota en sus ultimos cuatro bytes). */
    public long tamanoReal(String relativa) {
        Path p = ruta(relativa);
        try {
            if (!Files.exists(p)) return 0;
            try (java.io.RandomAccessFile f = new java.io.RandomAccessFile(p.toFile(), "r")) {
                long n = f.length();
                if (n < 18 || f.read() != 0x1F || f.read() != 0x8B) return n;
                f.seek(n - 4);
                long a = f.read(), b = f.read(), c = f.read(), d = f.read();
                // El largo va modulo 4 GB; un estado nunca es mas chico que su archivo comprimido.
                return Math.max(n, a | b << 8 | c << 16 | d << 24);
            }
        } catch (IOException e) {
            return 0;
        }
    }

    public void borrar(String relativa) {
        try {
            Path p = ruta(relativa);
            if (Files.isDirectory(p)) {
                try (var s = Files.walk(p)) {
                    s.sorted(java.util.Comparator.reverseOrder()).forEach(x -> x.toFile().delete());
                }
            } else {
                Files.deleteIfExists(p);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public JsonMapper json() { return json; }
}
