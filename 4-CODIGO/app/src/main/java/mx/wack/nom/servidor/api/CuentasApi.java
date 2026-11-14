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
import mx.wack.nom.core.servicio.ServicioPases;
import mx.wack.nom.core.servicio.ErrorNom;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/cuentas")
public class CuentasApi {

    public record Registro(String nombre, String contrasena, String empresa, String acepto) { }
    public record Aceptacion(String version) { }
    public record Llaves(String publica, String privadaContrasena, String privadaRecuperacion) { }
    public record Credenciales(String nombre, String contrasena) { }
    public record Recuperacion(String nombre, String codigo, String nueva) { }
    public record CambioContrasena(String actual, String nueva) { }
    public record Confirmacion(String contrasena) { }
    public record Pase(String pase) { }
    public record Alias(String id, String llave) { }

    private final ServicioCuentas cuentas;
    private final ServicioDocumentos documentos;
    private final ServicioPases pases;

    public CuentasApi(ServicioCuentas cuentas, ServicioDocumentos documentos, ServicioPases pases) {
        this.cuentas = cuentas;
        this.documentos = documentos;
        this.pases = pases;
    }

    @PostMapping("/registro")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> registrar(@RequestBody Registro r, HttpServletRequest req) {
        Usuario u = cuentas.registrar(r.nombre(), r.contrasena(), r.empresa(), Origen.de(req), r.acepto());
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

    /** Fase 15: el par de llaves de la cuenta (la privada viene envuelta desde el equipo). */
    @GetMapping("/llaves")
    public Map<String, Object> llaves(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u) { return cuentas.llaves(u); }

    @PutMapping("/llaves")
    public Map<String, Object> guardarLlaves(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @RequestBody Llaves l) {
        return cuentas.guardarLlaves(u, l.publica(), l.privadaContrasena(), l.privadaRecuperacion());
    }

    /** Fase 15: la llave publica de otra cuenta (para darle la llave de un espacio cifrado). */
    @GetMapping("/publica")
    public Map<String, Object> publica(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @org.springframework.web.bind.annotation.RequestParam String usuario) {
        return cuentas.publica(usuario);
    }

    /** F.5 Aceptar la version vigente de los Terminos y del Aviso de privacidad. */
    @PostMapping("/aceptar")
    public Map<String, Object> aceptar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @RequestBody Aceptacion a) {
        return cuentas.aceptar(u, a == null ? null : a.version());
    }

    /** F.5 «Descargar los datos de mi cuenta» (JSON, sin hashes). */
    @GetMapping("/datos")
    public Map<String, Object> datos(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u) {
        return documentos.datosDeCuenta(u);
    }

    /** Cuanto ocupa en este servidor lo de la cuenta abierta y cuanto tiene permitido. */
    @GetMapping("/almacenamiento")
    public Map<String, Object> almacenamiento(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u) {
        return documentos.almacenamientoDe(u);
    }

    @PutMapping("/preferencias")
    public Preferencias preferencias(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @RequestBody Preferencias p) {
        return cuentas.guardarPreferencias(u, p);
    }

    // ------------------------------------------------------------ fase 13: pases y alias

    /** A.2 Un pase firmado de 10 minutos para entrar con esta cuenta a un telefono que comparte sin Internet. */
    @PostMapping("/pase")
    public Map<String, Object> pase(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, HttpServletRequest req) {
        cuentas.limitarPases(Origen.de(req));
        return pases.emitir(u, Origen.publico(req));
    }

    /** Publico: la llave con la que este servidor firma los pases (para ponerla en el APK). */
    @GetMapping("/pase/llave")
    public Map<String, Object> llave(HttpServletRequest req) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("nube", Origen.publico(req));
        m.put("llave", pases.llavePublica());
        m.put("algoritmo", "ECDSA P-256 / SHA-256 (X.509, base64)");
        return m;
    }

    /** Publico: presentar un pase de una nube de confianza (si este servidor acepta pases). */
    @PostMapping("/pase/entrar")
    public Map<String, Object> entrarConPase(@RequestBody Pase p, HttpServletRequest req) {
        if (!pases.aceptaPases()) throw ErrorNom.prohibido("Este NOM-COLAB no acepta pases de otra nube");
        cuentas.limitarPases(Origen.de(req));
        Sesion s = cuentas.desdePase(pases.verificar(p == null ? null : p.pase()));
        return yo(cuentas.porId(s.usuarioId).orElseThrow(), s.token, s.expira);
    }

    /** Volver a entrar con un alias que este equipo ya tenia (su llave), aunque el codigo ya haya vencido. */
    @PostMapping("/alias/entrar")
    public Map<String, Object> volverConAlias(@RequestBody Alias a, HttpServletRequest req) {
        Sesion s = cuentas.entrarAlias(a == null ? null : a.id(), a == null ? null : a.llave(), Origen.de(req));
        return yo(cuentas.porId(s.usuarioId).orElseThrow(), s.token, s.expira);
    }

    /** En la computadora o la nube se entra con una cuenta; los alias del dueno son del telefono que comparte. */
    @PostMapping("/alias")
    public Map<String, Object> alias() {
        throw ErrorNom.prohibido("Aquí se entra con una cuenta. Los alias son para el teléfono que comparte sin Internet.");
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
        // F.5 Que versión de los terminos acepto y cual es la vigente (si no coinciden, la app pide aceptar).
        m.put("aceptoVersion", u.aceptoVersion);
        if (!u.sinContrasena()) m.put("legal", mx.wack.nom.core.Version.LEGAL);
        return m;
    }
}
