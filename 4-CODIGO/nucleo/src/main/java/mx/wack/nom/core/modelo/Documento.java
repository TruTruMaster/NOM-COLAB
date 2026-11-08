package mx.wack.nom.core.modelo;

import java.util.List;
import java.util.Map;

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
    /** Marca "no borrar": solo el propietario del espacio la pone o la quita. */
    public boolean protegido;
    /** Entrega de tarea: fecha limite (epoch ms; 0 = no es una entrega). Al pasar, quien no es
        el propietario del espacio queda en solo lectura. */
    public long entregaLimite;
    /** La entrega ya se cerro: hay version final y recibos adjuntos. */
    public boolean entregaCerrada;
    /** Recibos que se adjuntaron solos al cerrar la entrega: [{usuarioId, usuario, hash, generado}]. */
    public List<Map<String, Object>> entregaRecibos;
}
