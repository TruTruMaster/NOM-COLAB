package mx.wack.nom.core.almacen;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import mx.wack.nom.core.crdt.EstadoDocumento;
import mx.wack.nom.core.modelo.Documento;
import mx.wack.nom.core.modelo.Version;

public interface RepositorioDocumentos {
    Optional<Documento> porId(String id);
    List<Documento> delEspacio(String espacioId);
    void guardar(Documento d);
    void borrar(String id);

    EstadoDocumento estado(String docId);
    void guardarEstado(String docId, EstadoDocumento estado);
    long bytesEstado(String docId);

    List<Version> historial(String docId);
    Map<String, Map<String, Object>> fotoVersion(String docId, int numero);
    void guardarVersion(String docId, Version v, Map<String, Map<String, Object>> foto);
    /** Borra las versiones mas viejas dejando solo las ultimas 'conservar'. Devuelve bytes liberados. */
    long depurar(String docId, int conservar);

    /** Bitacora de cambios: se agrega una linea por cada lote aplicado (nunca se reescribe). */
    void anotarActividad(String docId, Map<String, Object> entrada);
    /** Las ultimas 'max' entradas de la bitacora, de la mas nueva a la mas vieja. */
    List<Map<String, Object>> actividad(String docId, int max);
}
