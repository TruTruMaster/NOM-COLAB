package mx.wack.nom.servidor.api;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import mx.wack.nom.core.modelo.Preferencias;
import mx.wack.nom.core.modelo.Sesion;
import mx.wack.nom.core.modelo.Usuario;
import mx.wack.nom.servidor.seguridad.FiltroSesion;
import mx.wack.nom.core.servicio.ServicioCuentas;

@RestController
@RequestMapping("/api/cuentas")
public class CuentasApi {

    public record Registro(String nombre, String contrasena, String empresa) { }
    public record Credenciales(String nombre, String contrasena) { }

    private final ServicioCuentas cuentas;

    public CuentasApi(ServicioCuentas cuentas) {
        this.cuentas = cuentas;
    }

    @PostMapping("/registro")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> registrar(@RequestBody Registro r) {
        Usuario u = cuentas.registrar(r.nombre(), r.contrasena(), r.empresa());
        return Map.of("usuario", ServicioCuentas.publico(u), "mensaje", "Registro exitoso");
    }

    @PostMapping("/sesion")
    public Map<String, Object> iniciar(@RequestBody Credenciales c) {
        Sesion s = cuentas.iniciarSesion(c.nombre(), c.contrasena());
        Usuario u = cuentas.porId(s.usuarioId).orElseThrow();
        return yo(u, s.token, s.expira);
    }

    @DeleteMapping("/sesion")
    public Map<String, Object> cerrar(@RequestHeader(value = "Authorization", required = false) String auth) {
        if (auth != null && auth.startsWith("Bearer ")) cuentas.cerrarSesion(auth.substring(7).trim());
        return Map.of("ok", true);
    }

    @GetMapping("/yo")
    public Map<String, Object> yo(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u) {
        return yo(u, null, 0);
    }

    @PutMapping("/preferencias")
    public Preferencias preferencias(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @RequestBody Preferencias p) {
        return cuentas.guardarPreferencias(u, p);
    }

    private Map<String, Object> yo(Usuario u, String token, long expira) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (token != null) {
            m.put("token", token);
            m.put("expira", expira);
        }
        m.put("usuario", ServicioCuentas.publico(u));
        m.put("preferencias", u.preferencias);
        return m;
    }
}
