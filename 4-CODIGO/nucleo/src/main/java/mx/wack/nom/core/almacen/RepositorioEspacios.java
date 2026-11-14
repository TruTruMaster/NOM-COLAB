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
    /** Borra el espacio y su biblioteca (sus documentos los borra antes quien llama). */
    void borrar(String id);

    /** Fase 9: biblioteca del espacio (fuentes guardadas para investigar sin Internet), en un archivo aparte. */
    List<Map<String, Object>> biblioteca(String espacioId);
    void guardarBiblioteca(String espacioId, List<Map<String, Object>> fuentes);

    /** Fase 15: el chat del espacio (los ultimos mensajes) y sus adjuntos, en archivos aparte. */
    List<Map<String, Object>> chat(String espacioId);
    void guardarChat(String espacioId, List<Map<String, Object>> mensajes);
    /** valor null borra el anexo. */
    void guardarAnexoEspacio(String espacioId, String nombre, Object valor);
    Object anexoEspacio(String espacioId, String nombre);
}
