package mx.wack.nom.servidor.seguridad;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
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
                .excludePathPatterns("/api/cuentas/registro", "/api/cuentas/sesion", "/api/red/info");
    }

    /**
     * La app Android carga la interfaz desde sus propios archivos (file://) y
     * habla con este servidor por la LAN, asi que la API acepta cualquier
     * origen. No hay cookies: la sesion viaja en la cabecera Authorization.
     */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**").allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*").maxAge(3600);
    }
}
