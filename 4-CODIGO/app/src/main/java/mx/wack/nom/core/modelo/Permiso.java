package mx.wack.nom.core.modelo;

/** Nivel de acceso de un usuario sobre un espacio. El orden importa: cada nivel incluye a los anteriores. */
public enum Permiso {
    LECTURA, EDICION, PROPIETARIO;

    public boolean alMenos(Permiso otro) {
        return this.ordinal() >= otro.ordinal();
    }
}
