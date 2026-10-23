package mx.wack.nom.core.modelo;

/** Cuenta registrada. Nunca guarda la contrasena en claro: solo el hash con su sal (CU-05). */
public class Usuario {
    public String id;
    public String nombre;
    /** Nombre en minusculas, para que "Ana" y "ana" no puedan coexistir. */
    public String nombreClave;
    public String empresa;
    public String hashContrasena;
    public String sal;
    public int intentosFallidos;
    /** Epoch ms hasta el que la cuenta esta bloqueada; 0 si no lo esta. */
    public long bloqueadoHasta;
    public long creado;
    /** Color con el que aparece su cursor y su avatar. */
    public String color;
    /** Se lee de la tabla rol (usuario.id_rol). Los nuevos registros son USUARIO. */
    public Rol rol = Rol.USUARIO;
    public Preferencias preferencias = new Preferencias();

    public boolean esAdministrador() {
        return rol == Rol.ADMINISTRADOR;
    }

    public boolean estaBloqueado(long ahora) {
        return bloqueadoHasta > ahora;
    }
}
