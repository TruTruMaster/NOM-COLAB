package mx.wack.nom.core.almacen;

import java.util.Collection;
import java.util.Optional;

import mx.wack.nom.core.modelo.Espacio;

public interface RepositorioEspacios {
    Optional<Espacio> porId(String id);
    Collection<Espacio> todos();
    void guardar(Espacio e);
}
