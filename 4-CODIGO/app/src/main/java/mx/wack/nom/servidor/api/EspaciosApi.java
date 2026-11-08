package mx.wack.nom.servidor.api;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import mx.wack.nom.core.crdt.Operacion;
import mx.wack.nom.core.modelo.Documento;
import mx.wack.nom.core.modelo.Espacio;
import mx.wack.nom.core.modelo.Permiso;
import mx.wack.nom.core.modelo.Usuario;
import mx.wack.nom.servidor.seguridad.FiltroSesion;
import mx.wack.nom.core.servicio.Difusor;
import mx.wack.nom.core.servicio.ServicioDocumentos;
import mx.wack.nom.core.servicio.ServicioEspacios;
import mx.wack.nom.core.servicio.ServicioSincronia;

@RestController
@RequestMapping("/api/espacios")
public class EspaciosApi {

    public record Nombre(String nombre) { }
    public record Conexion(boolean activa) { }
    public record CambioAcceso(String usuario, String permiso) { }
    public record Depuracion(int conservar) { }
    public record NuevoDocumento(String nombre, String modo, List<Operacion> ops) { }
    public record NuevoEnlace(String permiso, Integer horas, Boolean invitados) { }
    public record Sincronizar(String servidor, String usuario, String contrasena) { }

    private final ServicioEspacios espacios;
    private final ServicioDocumentos documentos;
    private final Difusor difusor;
    private final ServicioSincronia sincronia;

    public EspaciosApi(ServicioEspacios espacios, ServicioDocumentos documentos, Difusor difusor, ServicioSincronia sincronia) {
        this.espacios = espacios;
        this.documentos = documentos;
        this.difusor = difusor;
        this.sincronia = sincronia;
    }

    @GetMapping
    public List<Map<String, Object>> listar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u) {
        return espacios.listar(u);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> crear(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @RequestBody Nombre n) {
        Espacio e = espacios.crear(u, n.nombre());
        return espacios.resumen(e, u);
    }

    @GetMapping("/{id}")
    public Map<String, Object> detalle(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id) {
        Espacio e = espacios.requerir(id);
        espacios.exigir(e, u, Permiso.LECTURA);
        Map<String, Object> m = new java.util.LinkedHashMap<>(espacios.resumen(e, u));
        m.put("conexionDetalle", espacios.estadoConexion(e));
        m.put("lista", documentos.listar(u, id));
        return m;
    }

    @PutMapping("/{id}")
    public Map<String, Object> renombrar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                         @RequestBody Nombre n) {
        return espacios.resumen(espacios.renombrar(u, id, n.nombre()), u);
    }

    @GetMapping(value = "/{id}/eventos", produces = "text/event-stream")
    public SseEmitter eventos(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                              @RequestParam(defaultValue = "") String cliente) {
        espacios.exigir(espacios.requerir(id), u, Permiso.LECTURA);
        CanalSse canal = new CanalSse();
        difusor.suscribir(u, id, null, cliente, canal);
        return canal.emisor;
    }

    @PutMapping("/{id}/conexion")
    public Map<String, Object> conexion(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                        @RequestBody Conexion c) {
        return espacios.conexion(u, id, c.activa());
    }

    @PostMapping("/{id}/unirse")
    public Map<String, Object> unirse(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id) {
        return espacios.unirse(u, id);
    }

    @GetMapping("/{id}/accesos")
    public Map<String, Object> accesos(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id) {
        return espacios.accesos(u, id);
    }

    @PutMapping("/{id}/accesos")
    public Map<String, Object> cambiarAcceso(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                             @RequestBody CambioAcceso c) {
        Permiso p = c.permiso() == null || c.permiso().isBlank() || "NINGUNO".equals(c.permiso()) ? null
                : Permiso.valueOf(c.permiso());
        return espacios.cambiarAcceso(u, id, c.usuario(), p);
    }

    @DeleteMapping("/{id}/solicitudes/{usuarioId}")
    public Map<String, Object> rechazar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                        @PathVariable String usuarioId) {
        return espacios.rechazarSolicitud(u, id, usuarioId);
    }

    /** 1.4 Formato con el que nacen los documentos de texto del espacio (solo el propietario). */
    @PutMapping("/{id}/formato")
    public Map<String, Object> formato(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                       @RequestBody(required = false) Map<String, Object> f) {
        return espacios.fijarFormatoBase(u, id, f);
    }

    /** 2.1 y 2.3 Enlaces (y codigos QR) para unirse: caducan y se pueden revocar. */
    @GetMapping("/{id}/enlaces")
    public Map<String, Object> enlaces(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id) {
        return espacios.enlaces(u, id);
    }

    @PostMapping("/{id}/enlaces")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> crearEnlace(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                           @RequestBody NuevoEnlace n) {
        Permiso p = n.permiso() == null || n.permiso().isBlank() ? Permiso.EDICION : Permiso.valueOf(n.permiso());
        return espacios.crearEnlace(u, id, p, n.horas() == null ? 24 : n.horas(), Boolean.TRUE.equals(n.invitados()));
    }

    @DeleteMapping("/{id}/enlaces/{codigo}")
    public Map<String, Object> revocarEnlace(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                             @PathVariable String codigo) {
        return espacios.revocarEnlace(u, id, codigo);
    }

    /** 6.5 Copia del espacio en otro servidor. */
    @PutMapping("/{id}/sincronia")
    public Map<String, Object> configurarSincronia(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                                   @RequestBody Sincronizar s) {
        return sincronia.configurar(u, id, s.servidor(), s.usuario(), s.contrasena());
    }

    @PostMapping("/{id}/sincronia")
    public Map<String, Object> sincronizar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id) {
        return sincronia.sincronizar(u, id);
    }

    @DeleteMapping("/{id}/sincronia")
    public Map<String, Object> quitarSincronia(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id) {
        return sincronia.quitar(u, id);
    }

    @GetMapping("/{id}/almacenamiento")
    public Map<String, Object> almacenamiento(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id) {
        Map<String, Object> m = new java.util.LinkedHashMap<>(espacios.almacenamiento(u, id));
        // Cuota de la cuenta propietaria (en la nube; 0 = sin limite).
        m.put("cuota", documentos.cuota());
        m.put("usoPropietario", documentos.usoDe(espacios.requerir(id).propietarioId));
        return m;
    }

    @PostMapping("/{id}/almacenamiento/depurar")
    public Map<String, Object> depurar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                       @RequestBody Depuracion d) {
        return espacios.depurar(u, id, d.conservar());
    }

    @GetMapping("/{id}/documentos")
    public List<Documento> documentos(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id) {
        return documentos.listar(u, id);
    }

    @PostMapping("/{id}/documentos")
    @ResponseStatus(HttpStatus.CREATED)
    public Documento crearDocumento(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                    @RequestBody NuevoDocumento n) {
        return documentos.crear(u, id, n.nombre(), n.modo(), n.ops());
    }
}
