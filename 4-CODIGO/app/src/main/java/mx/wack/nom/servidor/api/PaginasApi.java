package mx.wack.nom.servidor.api;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Direcciones que se abren desde un codigo QR con la camara del telefono: /unirse?c=CODIGO y
 * /proyectar?c=CODIGO. Las dos muestran la misma pagina; ella lee el codigo.
 */
@Controller
public class PaginasApi {

    @GetMapping({ "/unirse", "/proyectar" })
    public String pagina() {
        return "forward:/index.html";
    }
}
