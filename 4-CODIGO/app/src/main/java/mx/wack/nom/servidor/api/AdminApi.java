package mx.wack.nom.servidor.api;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import mx.wack.nom.core.modelo.Usuario;
import mx.wack.nom.servidor.seguridad.FiltroSesion;
import mx.wack.nom.core.servicio.ServicioCuentas;

/** Administracion de cuentas. FiltroRol deja pasar solo a ADMINISTRADOR. */
@RestController
@RequestMapping("/api/admin")
public class AdminApi {

    public record CambioRol(String rol) { }

    private final ServicioCuentas cuentas;

    public AdminApi(ServicioCuentas cuentas) {
        this.cuentas = cuentas;
    }

    @GetMapping("/usuarios")
    public List<Map<String, Object>> usuarios() {
        long ahora = System.currentTimeMillis();
        return cuentas.todos().stream().map(u -> fila(u, ahora)).toList();
    }

    @PutMapping("/usuarios/{id}/rol")
    public Map<String, Object> rol(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario admin,
                                   @PathVariable String id, @RequestBody CambioRol c) {
        return fila(cuentas.cambiarRol(admin, id, c.rol()), System.currentTimeMillis());
    }

    @PostMapping("/usuarios/{id}/desbloquear")
    public Map<String, Object> desbloquear(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario admin,
                                           @PathVariable String id) {
        return fila(cuentas.desbloquear(admin, id), System.currentTimeMillis());
    }

    private static Map<String, Object> fila(Usuario u, long ahora) {
        Map<String, Object> m = ServicioCuentas.publico(u);
        m.put("bloqueado", u.estaBloqueado(ahora));
        m.put("bloqueadoHasta", u.bloqueadoHasta);
        m.put("intentosFallidos", u.intentosFallidos);
        return m;
    }
}
