package mx.wack.nom.red.nodo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Al arrancar dice en la consola por qué direcciones se entra desde la LAN. */
@Component
public class AvisoArranque {

    private static final Logger log = LoggerFactory.getLogger(AvisoArranque.class);
    private final NodoLocal nodo;

    public AvisoArranque(NodoLocal nodo) {
        this.nodo = nodo;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void listo() {
        StringBuilder sb = new StringBuilder("\n\n  NOM-COLAB listo.\n    En este equipo:   http://localhost:" + nodo.puerto() + "\n");
        for (String ip : nodo.direcciones()) sb.append("    Desde la red:     http://").append(ip).append(':').append(nodo.puerto()).append('\n');
        if (nodo.direcciones().isEmpty()) sb.append("    (Sin red local: conecta el equipo a una red para colaborar)\n");
        log.info(sb.toString());
    }
}
