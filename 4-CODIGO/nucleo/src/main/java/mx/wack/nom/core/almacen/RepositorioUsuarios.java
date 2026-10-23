package mx.wack.nom.core.almacen;

import java.util.Collection;
import java.util.Optional;

import mx.wack.nom.core.modelo.Rol;
import mx.wack.nom.core.modelo.Sesion;
import mx.wack.nom.core.modelo.Usuario;

public interface RepositorioUsuarios {
    Optional<Usuario> porId(String id);
    Optional<Usuario> porNombre(String nombre);
    Collection<Usuario> todos();
    void guardar(Usuario u);

    Optional<Sesion> sesion(String token);
    void guardarSesion(Sesion s);
    void borrarSesion(String token);
    long cuantosConRol(Rol rol);
}
