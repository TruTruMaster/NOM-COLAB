package mx.wack.nom.servidor.api;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import mx.wack.nom.red.descubrimiento.EspacioRemoto;
import mx.wack.nom.red.descubrimiento.ServicioDescubrimiento;
import mx.wack.nom.red.nodo.NodoLocal;

@RestController
@RequestMapping("/api/red")
public class RedApi {

    private final NodoLocal nodo;
    private final ServicioDescubrimiento descubrimiento;

    public RedApi(NodoLocal nodo, ServicioDescubrimiento descubrimiento) {
        this.nodo = nodo;
        this.descubrimiento = descubrimiento;
    }

    /** Publico: la app Android lo usa para comprobar que una direccion es un servidor NOM. */
    @GetMapping("/info")
    public Map<String, Object> info() {
        return Map.of("nom", 1, "servidor", nodo.id(), "equipo", nodo.equipo(), "puerto", nodo.puerto(),
                "direcciones", nodo.direcciones(), "version", "0.1.0", "hora", System.currentTimeMillis(),
                "lan", descubrimiento.lanActiva());
    }

    /** CU-15 Descubrir espacios en la LAN. */
    @GetMapping("/descubrir")
    public Map<String, Object> descubrir() {
        List<EspacioRemoto> lista = descubrimiento.buscarEnLan();
        return Map.of("espacios", lista, "udp", descubrimiento.udpActivo(), "sinRed", nodo.direcciones().isEmpty());
    }
}
