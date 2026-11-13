package mx.wack.nom.servidor.seguridad;

import java.io.IOException;
import java.util.Set;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Quien puede usar la API desde una pagina de OTRO origen (CORS). No hay cookies: la sesion viaja
 * en la cabecera Authorization, asi que esto no protege la sesion, sino que una pagina ajena no lea
 * respuestas ni pruebe contrasenas desde el navegador de alguien.
 *
 *  - La app Android (y las pruebas) cargan la interfaz desde sus archivos: origen "null". Todo.
 *  - Fase 13, A.2: la pagina de un telefono que comparte (http://192.168.x.x:8080 y parecidos, red
 *    privada) puede iniciar sesion aqui, pedir un pase y cerrar esa sesion: nada mas.
 *  - Cualquier otro origen: nada (el navegador no le deja leer la respuesta).
 * La propia pagina de este servidor es del mismo origen y no pasa por aqui.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class FiltroCors extends OncePerRequestFilter {

    /** Lo unico que una pagina de la red local puede pedirle a la nube. */
    private static final Set<String> PARA_RED_PRIVADA = Set.of(
            "POST /api/cuentas/sesion", "DELETE /api/cuentas/sesion", "POST /api/cuentas/pase", "GET /api/red/info");

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain cadena) throws ServletException, IOException {
        String origen = req.getHeader("Origin");
        String ruta = req.getRequestURI();
        if (origen == null || !ruta.startsWith("/api/")) { cadena.doFilter(req, res); return; }
        boolean previo = "OPTIONS".equals(req.getMethod()) && req.getHeader("Access-Control-Request-Method") != null;
        String metodo = previo ? req.getHeader("Access-Control-Request-Method") : req.getMethod();
        boolean mismo = origen.equalsIgnoreCase(Origen.publico(req));
        boolean permitido;
        String metodos;
        if ("null".equals(origen)) {
            permitido = true;
            metodos = "GET, POST, PUT, DELETE, OPTIONS";
        } else if (Origen.deRedPrivada(origen) && PARA_RED_PRIVADA.contains(metodo + " " + ruta)) {
            permitido = true;
            metodos = "GET, POST, DELETE, OPTIONS";
        } else {
            permitido = false;
            metodos = null;
        }
        if (mismo) { cadena.doFilter(req, res); return; }
        res.addHeader("Vary", "Origin");
        if (!permitido) {
            if (previo) { res.setStatus(403); return; }
            cadena.doFilter(req, res);   // sin cabeceras CORS: el navegador no deja leer la respuesta
            return;
        }
        res.setHeader("Access-Control-Allow-Origin", origen);
        res.setHeader("Access-Control-Allow-Methods", metodos);
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
        res.setHeader("Access-Control-Max-Age", "3600");
        if (previo) { res.setStatus(204); return; }
        cadena.doFilter(req, res);
    }
}
