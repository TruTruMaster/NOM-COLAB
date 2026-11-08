package mx.wack.nom.core.almacen;

import java.util.Optional;

import mx.wack.nom.core.modelo.Sesion;
import mx.wack.nom.core.modelo.Usuario;

public interface RepositorioUsuarios {
    Optional<Usuario> porId(String id);
    Optional<Usuario> porNombre(String nombre);
    void guardar(Usuario u);

    Optional<Sesion> sesion(String token);
    void guardarSesion(Sesion s);
    void borrarSesion(String token);
    /** Cierra todas las sesiones de una cuenta (al cambiar la contrasena). */
    void borrarSesionesDe(String usuarioId);
}
