package mx.wack.nom.servidor.seguridad;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class ConfigWeb implements WebMvcConfigurer {

    private final FiltroSesion filtro;

    public ConfigWeb(FiltroSesion filtro) {
        this.filtro = filtro;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(filtro)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/cuentas/registro", "/api/cuentas/sesion", "/api/cuentas/recuperar", "/api/red/info",
                        "/api/enlaces/*", "/api/enlaces/*/invitado", "/api/enlaces/*/alias", "/api/recibos/verificar", "/api/proyeccion/**", "/api/ver/*",
                        "/api/cuentas/alias", "/api/cuentas/alias/entrar", "/api/cuentas/pase/llave", "/api/cuentas/pase/entrar");
    }

    // CORS: lo decide FiltroCors (la app desde sus archivos; la pagina de un telefono de la red
    // local solo para iniciar sesion y pedir un pase; nadie mas).
}
