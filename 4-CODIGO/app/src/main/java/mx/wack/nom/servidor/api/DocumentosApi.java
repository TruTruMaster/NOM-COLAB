package mx.wack.nom.servidor.api;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import mx.wack.nom.core.crdt.Operacion;
import mx.wack.nom.core.modelo.Documento;
import mx.wack.nom.core.modelo.Permiso;
import mx.wack.nom.core.modelo.Usuario;
import mx.wack.nom.core.modelo.Version;
import mx.wack.nom.servidor.seguridad.FiltroSesion;
import mx.wack.nom.servidor.servicio.Difusor;
import mx.wack.nom.servidor.servicio.ServicioDocumentos;

@RestController
@RequestMapping("/api/documentos")
public class DocumentosApi {

    public record Lote(String cliente, List<Operacion> ops, String dispositivo) { }
    /** cursor: dónde está el cursor de texto ({ a, f }: ids de caracteres), para pintarlo en los demás equipos. */
    public record Presencia(String cliente, String bloque, String modo, Map<String, Object> cursor) { }
    public record Etiqueta(String etiqueta) { }

    private final ServicioDocumentos documentos;
    private final Difusor difusor;

    public DocumentosApi(ServicioDocumentos documentos, Difusor difusor) {
        this.documentos = documentos;
        this.difusor = difusor;
    }

    @GetMapping("/{id}")
    public Map<String, Object> abrir(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id) {
        return documentos.abrir(u, id);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> eliminar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id) {
        documentos.eliminar(u, id);
        return Map.of("ok", true);
    }

    @PostMapping("/{id}/ops")
    public Map<String, Object> ops(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                   @RequestBody Lote lote) {
        return documentos.aplicar(u, id, lote.ops(), lote.cliente(), lote.dispositivo());
    }

    /** Bitacora de cambios del documento (lo mas nuevo primero). */
    @GetMapping("/{id}/actividad")
    public List<Map<String, Object>> actividad(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id) {
        return documentos.actividad(u, id);
    }

    @GetMapping(value = "/{id}/eventos", produces = "text/event-stream")
    public SseEmitter eventos(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                              @RequestParam(defaultValue = "") String cliente) {
        Documento d = documentos.requerir(id);
        documentos.permiso(u, d, Permiso.LECTURA);
        return difusor.suscribir(u, d.espacioId, id, cliente);
    }

    @PostMapping("/{id}/presencia")
    public Map<String, Object> presencia(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                         @RequestBody Presencia p) {
        difusor.actualizarPresencia(id, p.cliente(), p.bloque(), p.modo(), p.cursor());
        return Map.of("ok", true);
    }

    @GetMapping("/{id}/versiones")
    public List<Version> versiones(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id) {
        return documentos.historial(u, id);
    }

    @PostMapping("/{id}/versiones")
    public Version guardarVersion(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                  @RequestBody(required = false) Etiqueta e) {
        return documentos.guardarVersion(u, id, e == null ? null : e.etiqueta());
    }

    @GetMapping("/{id}/versiones/{numero}")
    public Map<String, Map<String, Object>> foto(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u,
                                                 @PathVariable String id, @PathVariable int numero) {
        return documentos.foto(u, id, numero);
    }

    @PostMapping("/{id}/versiones/{numero}/restaurar")
    public Version restaurar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                             @PathVariable int numero) {
        return documentos.restaurar(u, id, numero);
    }
}
