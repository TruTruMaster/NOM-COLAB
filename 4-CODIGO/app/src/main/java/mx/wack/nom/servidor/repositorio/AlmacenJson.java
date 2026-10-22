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
 */
@Component
public class AlmacenJson {

    private final Path raiz;
    private final JsonMapper json = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    public AlmacenJson(@Value("${nom.datos}") String carpeta) throws IOException {
        this.raiz = Path.of(carpeta).toAbsolutePath();
        Files.createDirectories(raiz);
    }

    public Path raiz() { return raiz; }

    public Path ruta(String relativa) { return raiz.resolve(relativa); }

    public <T> T leer(String relativa, TypeReference<T> tipo, T siFalta) {
        Path p = ruta(relativa);
        if (!Files.exists(p)) return siFalta;
        return json.readValue(p.toFile(), tipo);
    }

    public <T> T leer(String relativa, Class<T> tipo, T siFalta) {
        Path p = ruta(relativa);
        if (!Files.exists(p)) return siFalta;
        return json.readValue(p.toFile(), tipo);
    }

    public synchronized void escribir(String relativa, Object valor) {
        Path p = ruta(relativa);
        try {
            Files.createDirectories(p.getParent());
            Path tmp = p.resolveSibling(p.getFileName() + ".tmp");
            json.writeValue(tmp.toFile(), valor);
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
