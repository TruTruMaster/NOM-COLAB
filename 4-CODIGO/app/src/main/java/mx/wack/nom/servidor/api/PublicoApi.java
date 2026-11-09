package mx.wack.nom.servidor.api;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import mx.wack.nom.core.modelo.Usuario;
import mx.wack.nom.core.servicio.ServicioDocumentos;
import mx.wack.nom.core.servicio.ServicioEspacios;
import mx.wack.nom.servidor.seguridad.FiltroSesion;

/**
 * Rutas que se usan sin sesion (ver ConfigWeb): lo que dice un enlace para unirse, entrar con
 * apodo, comprobar un recibo y ver una presentacion con su codigo. "Entrar" con un enlace si
 * pide sesion.
 */
@RestController
public class PublicoApi {

    public record Apodo(String apodo) { }

    private final ServicioEspacios espacios;
    private final ServicioDocumentos documentos;

    public PublicoApi(ServicioEspacios espacios, ServicioDocumentos documentos) {
        this.espacios = espacios;
        this.documentos = documentos;
    }

    @GetMapping("/api/enlaces/{codigo}")
    public Map<String, Object> enlace(@PathVariable String codigo) {
        return espacios.infoEnlace(codigo);
    }

    @PostMapping("/api/enlaces/{codigo}/invitado")
    public Map<String, Object> invitado(@PathVariable String codigo, @RequestBody Apodo a) {
        return espacios.entrarComoInvitado(codigo, a.apodo());
    }

    /** Con sesion: la cuenta abierta entra al espacio con el permiso del enlace. */
    @PostMapping("/api/enlaces/{codigo}/entrar")
    public Map<String, Object> entrar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String codigo) {
        return espacios.entrarConEnlace(u, codigo);
    }

    @PostMapping("/api/recibos/verificar")
    public Map<String, Object> verificar(@RequestBody Map<String, Object> recibo) {
        return documentos.verificarRecibo(recibo);
    }

    /** 8.5 Ver un solo documento con el enlace que creo el propietario (sin cuenta, solo lectura). */
    @GetMapping("/api/ver/{token}")
    public Map<String, Object> ver(@PathVariable String token) {
        return documentos.verPublico(token);
    }

    @GetMapping("/api/proyeccion/{codigo}")
    public Map<String, Object> proyeccion(@PathVariable String codigo) {
        return documentos.verProyeccion(codigo);
    }

    @GetMapping(value = "/api/proyeccion/{codigo}/eventos", produces = "text/event-stream")
    public SseEmitter proyeccionEventos(@PathVariable String codigo) {
        CanalSse canal = new CanalSse();
        documentos.suscribirProyeccion(codigo, canal);
        return canal.emisor;
    }
}
