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
import mx.wack.nom.servidor.seguridad.Origen;
import mx.wack.nom.core.servicio.ServicioCuentas;
import mx.wack.nom.core.servicio.ServicioDocumentos;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/cuentas")
public class CuentasApi {

    public record Registro(String nombre, String contrasena, String empresa) { }
    public record Credenciales(String nombre, String contrasena) { }
    public record Recuperacion(String nombre, String codigo, String nueva) { }
    public record CambioContrasena(String actual, String nueva) { }
    public record Confirmacion(String contrasena) { }

    private final ServicioCuentas cuentas;
    private final ServicioDocumentos documentos;

    public CuentasApi(ServicioCuentas cuentas, ServicioDocumentos documentos) {
        this.cuentas = cuentas;
        this.documentos = documentos;
    }

    @PostMapping("/registro")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> registrar(@RequestBody Registro r, HttpServletRequest req) {
        Usuario u = cuentas.registrar(r.nombre(), r.contrasena(), r.empresa(), Origen.de(req));
        // El codigo para recuperar la contrasena se muestra solo esta vez.
        return Map.of("usuario", ServicioCuentas.publico(u), "mensaje", "Registro exitoso", "recuperacion", cuentas.nuevoCodigoRecuperacion(u));
    }

    /** Publico: nueva contrasena con el codigo de recuperacion (devuelve un codigo nuevo). */
    @PostMapping("/recuperar")
    public Map<String, Object> recuperar(@RequestBody Recuperacion r, HttpServletRequest req) {
        return Map.of("recuperacion", cuentas.recuperar(r.nombre(), r.codigo(), r.nueva(), Origen.de(req)), "mensaje", "Listo: ya puedes entrar con tu contraseña nueva");
    }

    /** Un codigo de recuperacion nuevo para la cuenta abierta (el anterior deja de servir). */
    @PostMapping("/recuperacion")
    public Map<String, Object> nuevaRecuperacion(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u) {
        return Map.of("recuperacion", cuentas.nuevoCodigoRecuperacion(u));
    }

    @PostMapping("/sesion")
    public Map<String, Object> iniciar(@RequestBody Credenciales c, HttpServletRequest req) {
        Sesion s = cuentas.iniciarSesion(c.nombre(), c.contrasena(), Origen.de(req));
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

    /** Cambiar la contrasena sabiendo la actual: cierra las demas sesiones y da una nueva para este equipo. */
    @PutMapping("/contrasena")
    public Map<String, Object> cambiarContrasena(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @RequestBody CambioContrasena c, HttpServletRequest req) {
        Sesion s = cuentas.cambiarContrasena(u, c.actual(), c.nueva(), Origen.de(req));
        return yo(u, s.token, s.expira);
    }

    /** Borrar la cuenta (con su contrasena): sus espacios y documentos se borran; no se puede deshacer. */
    @PostMapping("/eliminar")
    public Map<String, Object> eliminar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @RequestBody Confirmacion c, HttpServletRequest req) {
        cuentas.confirmarParaBorrar(u, c == null ? null : c.contrasena(), Origen.de(req));
        return documentos.eliminarCuenta(u);
    }

    /** Boleto de un solo uso para abrir el canal en vivo sin poner el token de la sesion en la direccion. */
    @PostMapping("/boleto")
    public Map<String, Object> boleto(@RequestAttribute("nom.token") String token) {
        return Map.of("boleto", cuentas.boleto(token));
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
        m.put("recuperacion", ServicioCuentas.tieneRecuperacion(u));
        return m;
    }
}
