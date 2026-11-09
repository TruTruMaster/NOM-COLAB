package mx.wack.nom.servidor.api;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import mx.wack.nom.core.modelo.Usuario;
import mx.wack.nom.core.servicio.ServicioFuentes;
import mx.wack.nom.servidor.seguridad.FiltroSesion;

/** Fase 9: buscar y leer fuentes para investigar y citar, y la biblioteca del espacio. */
@RestController
public class FuentesApi {

    private final ServicioFuentes fuentes;

    public FuentesApi(ServicioFuentes fuentes) { this.fuentes = fuentes; }

    /** Los datos de una página web para citarla (no lee la red local ni direcciones internas). */
    @GetMapping("/api/fuentes/web")
    public Map<String, Object> web(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @RequestParam(defaultValue = "") String url) {
        return fuentes.web(u, url);
    }

    @GetMapping("/api/fuentes/doi")
    public Map<String, Object> doi(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @RequestParam(defaultValue = "") String doi) {
        return fuentes.porDoi(u, doi);
    }

    @GetMapping("/api/fuentes/isbn")
    public Map<String, Object> isbn(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @RequestParam(defaultValue = "") String isbn) {
        return fuentes.porIsbn(u, isbn);
    }

    /** donde: wikipedia, libros o articulos. */
    @GetMapping("/api/fuentes/buscar")
    public List<Map<String, Object>> buscar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @RequestParam(defaultValue = "") String q,
                                            @RequestParam(defaultValue = "wikipedia") String donde) {
        return fuentes.buscar(u, q, donde);
    }

    @GetMapping("/api/fuentes/wikipedia")
    public Map<String, Object> wikipedia(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @RequestParam(defaultValue = "") String titulo) {
        return fuentes.wikipedia(u, titulo);
    }

    @GetMapping("/api/fuentes/datos")
    public List<Map<String, Object>> conjuntos(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u) {
        return fuentes.conjuntos();
    }

    @GetMapping("/api/fuentes/datos/{conjunto}")
    public Map<String, Object> wikidata(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String conjunto) {
        return fuentes.wikidata(u, conjunto);
    }

    // ---- biblioteca del espacio (para investigar sin Internet)

    @GetMapping("/api/espacios/{id}/biblioteca")
    public List<Map<String, Object>> biblioteca(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id,
                                                @RequestParam(defaultValue = "") String q) {
        return q.isBlank() ? fuentes.biblioteca(u, id) : fuentes.buscarEnBiblioteca(u, id, q);
    }

    @PostMapping("/api/espacios/{id}/biblioteca")
    public Map<String, Object> guardar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id, @RequestBody Map<String, Object> cuerpo) {
        return fuentes.guardarEnBiblioteca(u, id, cuerpo);
    }

    @GetMapping("/api/espacios/{id}/biblioteca/{fuente}")
    public Map<String, Object> fuente(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id, @PathVariable String fuente) {
        return fuentes.deBiblioteca(u, id, fuente);
    }

    @DeleteMapping("/api/espacios/{id}/biblioteca/{fuente}")
    public Map<String, Object> quitar(@RequestAttribute(FiltroSesion.ATRIBUTO) Usuario u, @PathVariable String id, @PathVariable String fuente) {
        return fuentes.quitarDeBiblioteca(u, id, fuente);
    }
}
