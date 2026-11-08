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
        return leerCon(ruta(relativa), f -> json.readValue(f, tipo), siFalta);
    }

    public <T> T leer(String relativa, Class<T> tipo, T siFalta) {
        return leerCon(ruta(relativa), f -> json.readValue(f, tipo), siFalta);
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
            json.writeValue(tmp.toFile(), valor);
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
