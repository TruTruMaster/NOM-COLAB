package mx.wack.nom.servidor.repositorio;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Repository;

import mx.wack.nom.core.almacen.RepositorioEspacios;
import mx.wack.nom.core.modelo.Espacio;
import tools.jackson.core.type.TypeReference;

@Repository
public class RepositorioEspaciosJson implements RepositorioEspacios {

    private static final String ARCHIVO = "espacios.json";
    private final AlmacenJson almacen;
    private final Map<String, Espacio> espacios;

    public RepositorioEspaciosJson(AlmacenJson almacen) {
        this.almacen = almacen;
        this.espacios = almacen.leer(ARCHIVO, new TypeReference<LinkedHashMap<String, Espacio>>() { }, new LinkedHashMap<>());
    }

    @Override public synchronized Optional<Espacio> porId(String id) {
        return Optional.ofNullable(espacios.get(id));
    }

    @Override public synchronized Collection<Espacio> todos() {
        return List.copyOf(espacios.values());
    }

    @Override public synchronized void guardar(Espacio e) {
        espacios.put(e.id, e);
        almacen.escribir(ARCHIVO, espacios);
    }

    @Override public synchronized void borrar(String id) {
        if (espacios.remove(id) != null) almacen.escribir(ARCHIVO, espacios);
        almacen.escribir("biblioteca/" + id + ".json", new java.util.ArrayList<>());
    }

    @Override public synchronized List<Map<String, Object>> biblioteca(String espacioId) {
        return almacen.leer("biblioteca/" + espacioId + ".json", new TypeReference<java.util.ArrayList<Map<String, Object>>>() { }, new java.util.ArrayList<>());
    }

    @Override public synchronized void guardarBiblioteca(String espacioId, List<Map<String, Object>> fuentes) {
        almacen.escribir("biblioteca/" + espacioId + ".json", fuentes);
    }
}
