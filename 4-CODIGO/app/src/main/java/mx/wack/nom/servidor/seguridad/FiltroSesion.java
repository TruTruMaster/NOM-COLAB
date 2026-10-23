package mx.wack.nom.servidor.seguridad;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import mx.wack.nom.core.modelo.Usuario;
import mx.wack.nom.core.servicio.ErrorNom;
import mx.wack.nom.core.servicio.ServicioCuentas;

/**
 * Toda la API, salvo registro, inicio de sesion e info de red, exige un token.
 * Va en "Authorization: Bearer ..." o, para EventSource (que no puede mandar
 * cabeceras), en ?token=.
 */
@Component
public class FiltroSesion implements HandlerInterceptor {

    public static final String ATRIBUTO = "nom.usuario";
    private final ServicioCuentas cuentas;

    public FiltroSesion(ServicioCuentas cuentas) {
        this.cuentas = cuentas;
    }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        if ("OPTIONS".equals(req.getMethod())) return true;
        String token = null;
        String cab = req.getHeader("Authorization");
        if (cab != null && cab.startsWith("Bearer ")) token = cab.substring(7).trim();
        if (token == null) token = req.getParameter("token");
        if (token == null || token.isBlank())
            throw new ErrorNom(ErrorNom.SIN_SESION, "Inicia sesion para continuar");
        Usuario u = cuentas.usuarioDeToken(token)
                .orElseThrow(() -> new ErrorNom(ErrorNom.SIN_SESION, "Tu sesion expiro. Inicia sesion de nuevo."));
        req.setAttribute(ATRIBUTO, u);
        req.setAttribute("nom.token", token);
        return true;
    }
}
