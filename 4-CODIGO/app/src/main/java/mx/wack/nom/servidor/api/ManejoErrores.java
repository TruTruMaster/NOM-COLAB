package mx.wack.nom.servidor.api;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import mx.wack.nom.core.servicio.ErrorNom;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ManejoErrores {

    private static final Logger log = LoggerFactory.getLogger(ManejoErrores.class);
    /**
     * Los errores salen siempre como JSON, aunque quien pide solo acepte otra cosa: el canal en vivo
     * pide "text/event-stream" y, sin esto, un 401 o un 403 se le convertía en un 500.
     */
    private static final MediaType JSON = MediaType.APPLICATION_JSON;

    @ExceptionHandler(ErrorNom.class)
    public ResponseEntity<Map<String, Object>> nom(ErrorNom e) {
        Map<String, Object> cuerpo = new LinkedHashMap<>();
        cuerpo.put("error", e.getMessage());
        if (e.campo != null) cuerpo.put("campo", e.campo);
        if (e.extra != null) cuerpo.put("detalle", e.extra);
        return ResponseEntity.status(e.estado).contentType(JSON).body(cuerpo);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> argumento(IllegalArgumentException e) {
        return ResponseEntity.badRequest().contentType(JSON).body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(org.springframework.web.context.request.async.AsyncRequestNotUsableException.class)
    public void sseCerrado() {
        // El cliente cerro la pestana a media transmision: no es un error.
    }

    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> noExiste() {
        // Archivo inexistente (p. ej. el robots*.txt con el que Azure sondea el sitio): 404, no 500.
        return ResponseEntity.status(HttpStatus.NOT_FOUND).contentType(JSON).body(Map.of("error", "No existe"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> otro(Exception e) {
        log.error("Error no controlado", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).contentType(JSON)
                .body(Map.of("error", "Ocurrio un error inesperado. Intenta de nuevo."));
    }
}
