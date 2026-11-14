package mx.wack.nom.servidor.api;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Direcciones que se abren desde un codigo QR con la camara del telefono: /unirse?c=CODIGO y
 * /proyectar?c=CODIGO. Las dos muestran la misma pagina; ella lee el codigo.
 *
 * Fase 14: el sitio de ayuda y legal (/ayuda/… y /legal/…, HTML estatico). Una direccion sin
 * extension lleva a su index.html; sin la diagonal final se redirige con ella, para que los
 * enlaces relativos de la pagina funcionen.
 */
@Controller
public class PaginasApi {

    @GetMapping({ "/unirse", "/proyectar" })
    public String pagina() {
        return "forward:/index.html";
    }

    @GetMapping({ "/ayuda", "/legal", "/ayuda/{a:[a-z0-9-]+}", "/legal/{a:[a-z0-9-]+}", "/ayuda/{a:[a-z0-9-]+}/{b:[a-z0-9-]+}" })
    public String sinDiagonal(HttpServletRequest req) {
        return "redirect:" + req.getRequestURI() + "/";
    }

    @GetMapping({ "/ayuda/", "/legal/", "/ayuda/{a:[a-z0-9-]+}/", "/legal/{a:[a-z0-9-]+}/", "/ayuda/{a:[a-z0-9-]+}/{b:[a-z0-9-]+}/" })
    public String indice(HttpServletRequest req) {
        return "forward:" + req.getRequestURI() + "index.html";
    }
}
