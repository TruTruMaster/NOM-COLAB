package mx.wack.nom.servidor;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import mx.wack.nom.core.almacen.RepositorioDocumentos;
import mx.wack.nom.core.almacen.RepositorioEspacios;
import mx.wack.nom.core.almacen.RepositorioUsuarios;
import mx.wack.nom.core.red.Descubrimiento;
import mx.wack.nom.core.servicio.Cifrado;
import mx.wack.nom.core.servicio.CodecJson;
import mx.wack.nom.core.servicio.Difusor;
import mx.wack.nom.core.servicio.ServicioCuentas;
import mx.wack.nom.core.servicio.ServicioDocumentos;
import mx.wack.nom.core.servicio.ServicioEspacios;
import mx.wack.nom.core.servicio.ServicioSincronia;
import mx.wack.nom.red.nodo.NodoLocal;
import mx.wack.nom.servidor.repositorio.AlmacenJson;

/**
 * Arma los servicios compartidos (mx.wack.nom.core.servicio) con la configuración de
 * application.properties. Son las mismas clases que usa el servidor de la app en un teléfono.
 */
@Configuration
public class Configuracion {

    @Bean
    public Cifrado cifrado() { return new Cifrado(); }

    @Bean
    public Difusor difusor(@Value("${nom.espacio.max-usuarios}") int maxUsuarios) { return new Difusor(maxUsuarios); }

    @Bean
    public ServicioCuentas servicioCuentas(RepositorioUsuarios repo, Cifrado cifrado,
                                           @Value("${nom.cuentas.max-intentos}") int maxIntentos,
                                           @Value("${nom.cuentas.minutos-bloqueo}") int minutosBloqueo,
                                           @Value("${nom.cuentas.horas-sesion}") int horasSesion,
                                           @Value("${nom.cuentas.registros-hora-red:30}") int registrosRed,
                                           @Value("${nom.cuentas.registros-hora:300}") int registrosTotal,
                                           @Value("${nom.cuentas.registros-hora-equipo:5}") int registrosEquipo,
                                           @Value("${nom.cuentas.registros-hora-red-equipo:200}") int registrosRedEquipo) {
        ServicioCuentas s = new ServicioCuentas(repo, cifrado, maxIntentos, minutosBloqueo, horasSesion);
        s.limitarRegistros(registrosRed, registrosTotal);
        s.limitarRegistrosPorEquipo(registrosEquipo, registrosRedEquipo);
        return s;
    }

    @Bean
    public ServicioEspacios servicioEspacios(RepositorioEspacios repo, RepositorioDocumentos docs, ServicioCuentas cuentas,
                                             Difusor difusor, NodoLocal nodo, Cifrado cifrado) {
        return new ServicioEspacios(repo, docs, cuentas, difusor, nodo, cifrado);
    }

    @Bean
    public ServicioDocumentos servicioDocumentos(RepositorioDocumentos repo, ServicioEspacios espacios, ServicioCuentas cuentas,
                                                 Difusor difusor, Cifrado cifrado, NodoLocal nodo,
                                                 @Value("${nom.cuota.mb:0}") long cuotaMb) {
        ServicioDocumentos s = new ServicioDocumentos(repo, espacios, cuentas, difusor, cifrado, nodo);
        // En la nube cada cuenta tiene un limite (NOM_CUOTA_MB); en la red local, 0 = sin limite.
        s.fijarCuota(cuotaMb * 1024 * 1024);
        return s;
    }

    @Bean
    public CodecJson codecJson(AlmacenJson almacen) {
        return new CodecJson() {
            @Override public byte[] escribir(Object valor) { return almacen.json().writeValueAsBytes(valor); }
            @Override public Object leer(String texto) { return almacen.json().readValue(texto, Object.class); }
        };
    }

    /** Fase 9: buscar y leer fuentes (Wikipedia, libros, artículos, páginas web) y la biblioteca del espacio. */
    @Bean
    public mx.wack.nom.core.servicio.ServicioFuentes servicioFuentes(ServicioEspacios espacios, RepositorioEspacios repo, CodecJson json, Cifrado cifrado) {
        return new mx.wack.nom.core.servicio.ServicioFuentes(espacios, repo, json, cifrado);
    }

    /**
     * A.2 Pases firmados: este servidor firma pases para que sus cuentas entren a un telefono que
     * comparte sin Internet, y acepta los de las nubes de confianza (pases/nubes.json, que trae la
     * interfaz, mas NOM_NUBES_CONFIABLES). La llave para firmar vive FUERA de la carpeta de datos
     * (NOM_LLAVES, o la carpeta "<datos>-llaves" junto a ella): no viaja en los respaldos.
     */
    @Bean
    public mx.wack.nom.core.servicio.ServicioPases servicioPases(CodecJson json, @Value("${nom.datos}") String datos,
                                                                 @Value("${nom.llaves:}") String llaves,
                                                                 @Value("${nom.nubes-confiables:}") String extra) {
        mx.wack.nom.core.servicio.ServicioPases s = new mx.wack.nom.core.servicio.ServicioPases(json);
        s.cargarOCrear(carpetaLlaves(datos, llaves).toFile());
        try (java.io.InputStream in = Configuracion.class.getResourceAsStream("/static/pases/nubes.json")) {
            if (in != null) s.confiarLista(new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
        } catch (java.io.IOException e) { /* sin lista */ }
        if (extra != null && !extra.isBlank()) {
            String t = extra.trim();
            try {
                if (!t.startsWith("[") && !t.startsWith("{")) t = java.nio.file.Files.readString(java.nio.file.Path.of(t));
                s.confiarLista(t);
            } catch (java.io.IOException e) { throw new IllegalStateException("No se pudo leer NOM_NUBES_CONFIABLES: " + e.getMessage(), e); }
        }
        return s;
    }

    /** Las llaves del servidor: NOM_LLAVES, o "<carpeta de datos>-llaves" (al lado, nunca adentro). */
    public static java.nio.file.Path carpetaLlaves(String datos, String llaves) {
        if (llaves != null && !llaves.isBlank()) return java.nio.file.Path.of(llaves).toAbsolutePath();
        java.nio.file.Path d = java.nio.file.Path.of(datos).toAbsolutePath().normalize();
        return d.resolveSibling(d.getFileName() + "-llaves");
    }

    /** Fase 15: el chat de cada espacio. */
    @Bean
    public mx.wack.nom.core.servicio.ServicioChat servicioChat(RepositorioEspacios repo, ServicioEspacios espacios, Difusor difusor, Cifrado cifrado,
                                                               ServicioDocumentos documentos) {
        mx.wack.nom.core.servicio.ServicioChat c = new mx.wack.nom.core.servicio.ServicioChat(repo, espacios, difusor, cifrado);
        c.usarCuota(documentos);   // DEF-42: el chat cuenta en el espacio del propietario
        return c;
    }

    @Bean
    public ServicioSincronia servicioSincronia(ServicioEspacios espacios, ServicioDocumentos documentos, CodecJson json, NodoLocal nodo) {
        return new ServicioSincronia(espacios, documentos, json, nodo);
    }

    @Bean(initMethod = "iniciar", destroyMethod = "detener")
    public Descubrimiento descubrimiento(NodoLocal nodo, RepositorioEspacios espacios, RepositorioUsuarios usuarios,
                                         CodecJson json,
                                         @Value("${nom.descubrimiento.activo}") boolean activo,
                                         @Value("${nom.descubrimiento.puerto}") int puerto) {
        return new Descubrimiento(nodo, espacios, usuarios, json, activo, puerto);
    }
}
