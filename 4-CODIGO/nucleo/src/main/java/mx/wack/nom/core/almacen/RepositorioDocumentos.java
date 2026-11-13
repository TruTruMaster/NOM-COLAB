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
    /** Lo que el estado ocupa guardado (en la computadora va comprimido): es lo que cuenta para la cuota. */
    long bytesEstado(String docId);
    /** Lo que el estado mide sin comprimir: para el tope de tamano de un documento. */
    default long bytesEstadoReal(String docId) { return bytesEstado(docId); }

    List<Version> historial(String docId);
    Map<String, Map<String, Object>> fotoVersion(String docId, int numero);
    void guardarVersion(String docId, Version v, Map<String, Map<String, Object>> foto);
    /** Borra las versiones mas viejas dejando solo las ultimas 'conservar'. Devuelve bytes liberados. */
    long depurar(String docId, int conservar);

    /** Bitacora de cambios: se agrega una linea por cada lote aplicado (nunca se reescribe). */
    void anotarActividad(String docId, Map<String, Object> entrada);
    /** Las ultimas 'max' entradas de la bitacora, de la mas nueva a la mas vieja. */
    List<Map<String, Object>> actividad(String docId, int max);

    /** Ultima vez que cada persona abrio el documento: usuarioId -> { t, reloj }. */
    Map<String, Map<String, Object>> visitas(String docId);
    void guardarVisita(String docId, String usuarioId, Map<String, Object> visita);

    /** Registro de los recibos emitidos (por su huella): asi se comprueba que uno es autentico,
        aunque el documento ya no exista. */
    void guardarRecibo(String huella, Map<String, Object> registro);
    Map<String, Object> recibo(String huella);

    /** Datos aparte de un documento, en su carpeta (docs/{id}/{nombre}.json): p. ej. lo que cambio
        quien abrio una rama (fase 13). Se borran con el documento. */
    void guardarAnexo(String docId, String nombre, Object valor);
    Object anexo(String docId, String nombre);
}
