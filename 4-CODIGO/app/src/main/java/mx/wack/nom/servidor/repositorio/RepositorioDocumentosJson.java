package mx.wack.nom.servidor.repositorio;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Repository;

import mx.wack.nom.core.almacen.RepositorioDocumentos;
import mx.wack.nom.core.crdt.EstadoDocumento;
import mx.wack.nom.core.modelo.Documento;
import mx.wack.nom.core.modelo.Version;
import tools.jackson.core.type.TypeReference;

/**
 * datos-nom/
 *   documentos.json                 metadatos de todos los documentos
 *   docs/{id}/estado.json           estado CRDT
 *   docs/{id}/versiones.json        indice del historial
 *   docs/{id}/v/{n}.json            foto de cada version
 */
@Repository
public class RepositorioDocumentosJson implements RepositorioDocumentos {

    private static final String META = "documentos.json";
    private final AlmacenJson almacen;
    private final Map<String, Documento> docs;
    private final Map<String, EstadoDocumento> estados = new ConcurrentHashMap<>();

    public RepositorioDocumentosJson(AlmacenJson almacen) {
        this.almacen = almacen;
        this.docs = almacen.leer(META, new TypeReference<LinkedHashMap<String, Documento>>() { }, new LinkedHashMap<>());
    }

    @Override public synchronized Optional<Documento> porId(String id) {
        return Optional.ofNullable(docs.get(id));
    }

    @Override public synchronized List<Documento> delEspacio(String espacioId) {
        return docs.values().stream().filter(d -> espacioId.equals(d.espacioId))
                .sorted(Comparator.comparingLong((Documento d) -> d.modificado).reversed()).toList();
    }

    @Override public synchronized void guardar(Documento d) {
        docs.put(d.id, d);
        almacen.escribir(META, docs);
    }

    @Override public synchronized void borrar(String id) {
        docs.remove(id);
        estados.remove(id);
        almacen.escribir(META, docs);
        almacen.borrar("docs/" + id);
    }

    @Override public EstadoDocumento estado(String docId) {
        return estados.computeIfAbsent(docId,
                id -> almacen.leer("docs/" + id + "/estado.json", EstadoDocumento.class, new EstadoDocumento()));
    }

    @Override public void guardarEstado(String docId, EstadoDocumento estado) {
        estados.put(docId, estado);
        almacen.escribir("docs/" + docId + "/estado.json", estado);
    }

    @Override public long bytesEstado(String docId) {
        return almacen.tamano("docs/" + docId + "/estado.json");
    }

    @Override public synchronized List<Version> historial(String docId) {
        return almacen.leer("docs/" + docId + "/versiones.json", new TypeReference<ArrayList<Version>>() { }, new ArrayList<>());
    }

    @Override public Map<String, Map<String, Object>> fotoVersion(String docId, int numero) {
        return almacen.leer("docs/" + docId + "/v/" + numero + ".json",
                new TypeReference<LinkedHashMap<String, Map<String, Object>>>() { }, null);
    }

    @Override public synchronized void guardarVersion(String docId, Version v, Map<String, Map<String, Object>> foto) {
        String ruta = "docs/" + docId + "/v/" + v.numero + ".json";
        almacen.escribir(ruta, foto);
        v.bytes = almacen.tamano(ruta);
        List<Version> h = historial(docId);
        h.add(v);
        almacen.escribir("docs/" + docId + "/versiones.json", h);
    }

    @Override public void anotarActividad(String docId, Map<String, Object> entrada) {
        Path p = almacen.ruta("docs/" + docId + "/actividad.jsonl");
        try {
            Files.createDirectories(p.getParent());
            synchronized (this) {
                Files.writeString(p, almacen.json().writeValueAsString(entrada) + "\n", StandardCharsets.UTF_8,
                        StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo anotar la actividad de " + docId, e);
        }
    }

    @Override public List<Map<String, Object>> actividad(String docId, int max) {
        Path p = almacen.ruta("docs/" + docId + "/actividad.jsonl");
        if (!Files.exists(p)) return List.of();
        try {
            List<String> lineas = Files.readAllLines(p, StandardCharsets.UTF_8);
            List<Map<String, Object>> r = new ArrayList<>();
            for (int i = lineas.size() - 1; i >= 0 && r.size() < max; i--) {
                if (lineas.get(i).isBlank()) continue;
                r.add(almacen.json().readValue(lineas.get(i), new TypeReference<LinkedHashMap<String, Object>>() { }));
            }
            return r;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override public synchronized long depurar(String docId, int conservar) {
        List<Version> h = historial(docId);
        if (h.size() <= conservar) return 0;
        long liberado = 0;
        List<Version> quitar = h.subList(0, h.size() - conservar);
        for (Version v : quitar) {
            liberado += v.bytes;
            almacen.borrar("docs/" + docId + "/v/" + v.numero + ".json");
        }
        List<Version> resto = new ArrayList<>(h.subList(h.size() - conservar, h.size()));
        almacen.escribir("docs/" + docId + "/versiones.json", resto);
        return liberado;
    }
}
