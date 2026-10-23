package mx.wack.nom.servidor.api;

import java.io.IOException;

import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import mx.wack.nom.core.servicio.Canal;

/** El canal en tiempo real de un cliente, con el SseEmitter de Spring. */
public class CanalSse implements Canal {
    public final SseEmitter emisor = new SseEmitter(0L);

    @Override
    public void enviar(String evento, Object datos) throws IOException {
        emisor.send(SseEmitter.event().name(evento).data(datos, MediaType.APPLICATION_JSON));
    }

    @Override
    public void latido() throws IOException {
        emisor.send(SseEmitter.event().comment("latido"));
    }

    @Override
    public void cerrar() {
        emisor.complete();
    }

    @Override
    public void alCerrar(Runnable r) {
        emisor.onCompletion(r);
        emisor.onTimeout(r);
        emisor.onError(x -> r.run());
    }
}
