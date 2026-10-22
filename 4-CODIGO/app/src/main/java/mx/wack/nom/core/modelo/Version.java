package mx.wack.nom.core.modelo;

/** Foto del documento. Restaurar crea una version nueva; nunca borra las intermedias (CU-23). */
public class Version {
    public int numero;
    public long fecha;
    public String autorId;
    public String autorNombre;
    public String etiqueta;
    public long bytes;
    public int bloques;
}
