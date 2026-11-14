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
    /** 8.5 Papelera: cuándo se mandó (0 = no está en la papelera) y quién. A los 30 días se borra solo. */
    public long eliminado;
    public String eliminadoPor;
    /** 8.5 Carpeta dentro del espacio (null = sin carpeta). */
    public String carpeta;
    /** 8.5 Quiénes lo marcaron como destacado (en la lista cada quien ve solo su propia marca). */
    public List<String> destacadoPor;
    /** 8.5 Plantilla del espacio: sirve para crear documentos nuevos con el mismo contenido. */
    public boolean plantilla;
    /** 8.5 Enlace para ver el documento sin cuenta, en solo lectura (el propietario lo quita cuando quiere). */
    public String enlaceVer;

    /** Fase 13, parte B: rama de otro documento (lo que alguien edito sin Internet mientras otros
        cambiaban el original). El original no se toca; la rama se compara, se fusiona o se deja aparte. */
    public String ramaDe;
    /** La base: el reloj mas alto de cada nodo que tenia quien edito sin conexion (nodo -> reloj). */
    public Map<String, Long> ramaBase;
    /** Los nodos (pestanas) de quien edito sin conexion: lo suyo desde la base. */
    public List<String> ramaNodos;
    public String ramaAutorId;
    public String ramaAutor;
    public long ramaCreada;
    /** abierta | fusionada */
    public String ramaEstado;
    /** cambios (otros cambiaron el original) | entrega (se edito despues de la fecha limite) |
        protegido (lo protegieron mientras tanto) | telefono (el telefono que comparte, al subir) */
    public String ramaMotivo;
    public long ramaFusionada;
    public String ramaFusionadaPor;
    /** Cuando se quedo sin conexion quien la creo (para el nombre y la ayuda). */
    public long ramaDesde;
    /** Solo en las copias que se mandan (en lo guardado queda en 0): cuantas ramas abiertas tiene. */
    public int ramasAbiertas;
    /** Fase 15: en un espacio cifrado, la llave del documento envuelta con la del espacio. */
    public String llave;

    /** Copia de los metadatos (para mandarle a cada persona solo lo que le toca ver). */
    public Documento copia() {
        Documento c = new Documento();
        c.id = id; c.espacioId = espacioId; c.nombre = nombre; c.modo = modo; c.autorId = autorId;
        c.creado = creado; c.modificado = modificado; c.version = version; c.pendienteVersion = pendienteVersion;
        c.ultimaVersion = ultimaVersion; c.ultimoEditorId = ultimoEditorId; c.protegido = protegido;
        c.entregaLimite = entregaLimite; c.entregaCerrada = entregaCerrada; c.entregaRecibos = entregaRecibos;
        c.eliminado = eliminado; c.eliminadoPor = eliminadoPor; c.carpeta = carpeta; c.destacadoPor = destacadoPor;
        c.plantilla = plantilla; c.enlaceVer = enlaceVer;
        c.ramaDe = ramaDe; c.ramaBase = ramaBase; c.ramaNodos = ramaNodos; c.ramaAutorId = ramaAutorId; c.ramaAutor = ramaAutor;
        c.ramaCreada = ramaCreada; c.ramaEstado = ramaEstado; c.ramaMotivo = ramaMotivo; c.ramaFusionada = ramaFusionada;
        c.ramaFusionadaPor = ramaFusionadaPor; c.ramaDesde = ramaDesde; c.llave = llave;
        return c;
    }
}
