package mx.wack.nom.core.modelo;

/**
 * Metadatos de un documento. El contenido (bloques) vive en el estado CRDT;
 * nombre y modo se copian aqui para listar sin abrir el estado.
 */
public class Documento {
    public String id;
    public String espacioId;
    public String nombre;
    public ModoEditor modo = ModoEditor.TEXTO;
    public String autorId;
    public long creado;
    public long modificado;
    /** Numero de la ultima version guardada. */
    public int version;
    /** Hubo cambios desde la ultima version. */
    public boolean pendienteVersion;
    public long ultimaVersion;
    /** Ultimo usuario que edito: firma las versiones automaticas. */
    public String ultimoEditorId;
}
