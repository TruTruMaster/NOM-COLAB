package mx.wack.nom.servidor.seguridad;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import mx.wack.nom.core.modelo.Usuario;
import mx.wack.nom.servidor.api.ErrorNom;

/**
 * Seguridad por roles: /api/admin/** solo responde si la cuenta de la sesion
 * tiene el rol ADMINISTRADOR en la base de datos. Corre despues de
 * FiltroSesion, que ya dejo al usuario (con su rol) en la peticion.
 */
@Component
public class FiltroRol implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        if ("OPTIONS".equals(req.getMethod())) return true;
        Usuario u = (Usuario) req.getAttribute(FiltroSesion.ATRIBUTO);
        if (u == null || !u.esAdministrador())
            throw ErrorNom.prohibido("Esta sección es solo para administradores");
        return true;
    }
}
