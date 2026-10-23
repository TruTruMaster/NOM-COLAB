package mx.wack.nom.core.modelo;

/**
 * Rol de la cuenta. Vive en la tabla rol de la base de datos y cada usuario
 * apunta a uno (usuario.id_rol). Es la seguridad del modulo Gestion de cuentas:
 * la API de administracion solo responde a ADMINISTRADOR.
 *
 * Los permisos dentro de un espacio (Lectura / Edicion / Propietario) son otra
 * cosa: Permiso, por espacio.
 */
public enum Rol {
    ADMINISTRADOR(1),
    USUARIO(2);

    public final int id;

    Rol(int id) { this.id = id; }

    public static Rol deId(int id) {
        for (Rol r : values()) if (r.id == id) return r;
        throw new IllegalArgumentException("Rol desconocido: " + id);
    }
}
