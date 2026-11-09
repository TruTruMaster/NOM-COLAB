package mx.wack.nom.core.almacen;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import mx.wack.nom.core.modelo.Espacio;

public interface RepositorioEspacios {
    Optional<Espacio> porId(String id);
    Collection<Espacio> todos();
    void guardar(Espacio e);

    /** Fase 9: biblioteca del espacio (fuentes guardadas para investigar sin Internet), en un archivo aparte. */
    List<Map<String, Object>> biblioteca(String espacioId);
    void guardarBiblioteca(String espacioId, List<Map<String, Object>> fuentes);
}
