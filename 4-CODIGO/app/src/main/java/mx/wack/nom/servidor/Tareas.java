package mx.wack.nom.servidor;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import mx.wack.nom.core.servicio.Difusor;
import mx.wack.nom.core.servicio.ServicioDocumentos;

/** Lo que corre solo: al arrancar, cada cierto tiempo y al apagar (en el teléfono lo hace la app). */
@Component
public class Tareas {
    private final ServicioDocumentos documentos;
    private final Difusor difusor;

    public Tareas(ServicioDocumentos documentos, Difusor difusor) {
        this.documentos = documentos;
        this.difusor = difusor;
    }

    @Scheduled(fixedDelay = 800)
    public void persistir() { documentos.persistir(); }

    @Scheduled(fixedDelay = 10_000)
    public void bitacora() { documentos.escribirBitacora(); }

    @Scheduled(fixedRate = 60_000, initialDelay = 60_000)
    public void autoguardar() { documentos.autoguardar(); }

    @Scheduled(fixedRate = 20_000)
    public void latido() { difusor.latido(); }

    @PreDestroy
    public void alApagar() { documentos.alApagar(); }
}
