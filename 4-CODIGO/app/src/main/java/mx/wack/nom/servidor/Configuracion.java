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
                                           @Value("${nom.cuentas.horas-sesion}") int horasSesion) {
        return new ServicioCuentas(repo, cifrado, maxIntentos, minutosBloqueo, horasSesion);
    }

    @Bean
    public ServicioEspacios servicioEspacios(RepositorioEspacios repo, RepositorioDocumentos docs, ServicioCuentas cuentas,
                                             Difusor difusor, NodoLocal nodo, Cifrado cifrado) {
        return new ServicioEspacios(repo, docs, cuentas, difusor, nodo, cifrado);
    }

    @Bean
    public ServicioDocumentos servicioDocumentos(RepositorioDocumentos repo, ServicioEspacios espacios, ServicioCuentas cuentas,
                                                 Difusor difusor, Cifrado cifrado, NodoLocal nodo) {
        return new ServicioDocumentos(repo, espacios, cuentas, difusor, cifrado, nodo);
    }

    @Bean(initMethod = "iniciar", destroyMethod = "detener")
    public Descubrimiento descubrimiento(NodoLocal nodo, RepositorioEspacios espacios, RepositorioUsuarios usuarios,
                                         AlmacenJson almacen,
                                         @Value("${nom.descubrimiento.activo}") boolean activo,
                                         @Value("${nom.descubrimiento.puerto}") int puerto) {
        CodecJson json = new CodecJson() {
            @Override public byte[] escribir(Object valor) { return almacen.json().writeValueAsBytes(valor); }
            @Override public Object leer(String texto) { return almacen.json().readValue(texto, Object.class); }
        };
        return new Descubrimiento(nodo, espacios, usuarios, json, activo, puerto);
    }
}
