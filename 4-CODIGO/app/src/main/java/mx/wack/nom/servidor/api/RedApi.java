package mx.wack.nom.servidor.api;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import mx.wack.nom.core.Version;
import mx.wack.nom.core.red.EspacioRemoto;
import mx.wack.nom.core.red.Descubrimiento;
import mx.wack.nom.red.nodo.NodoLocal;

@RestController
@RequestMapping("/api/red")
public class RedApi {

    private final NodoLocal nodo;
    private final Descubrimiento descubrimiento;
    private final mx.wack.nom.core.servicio.ServicioPases pases;

    public RedApi(NodoLocal nodo, Descubrimiento descubrimiento, mx.wack.nom.core.servicio.ServicioPases pases) {
        this.nodo = nodo;
        this.descubrimiento = descubrimiento;
        this.pases = pases;
    }

    /** Publico: la app Android lo usa para comprobar que una direccion es un servidor NOM. */
    @GetMapping("/info")
    public Map<String, Object> info() {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("nom", 1);
        m.put("servidor", nodo.id());
        m.put("equipo", nodo.equipo());
        m.put("puerto", nodo.puerto());
        m.put("direcciones", nodo.direcciones());
        m.put("version", Version.APP);
        m.put("interfaz", Version.INTERFAZ);
        m.put("hora", System.currentTimeMillis());
        m.put("lan", descubrimiento.lanActiva());
        // Fase 13: aqui hay cuentas con contrasena; si firma pases y si acepta los de otra nube.
        m.put("cuentas", true);
        m.put("legal", Version.LEGAL);
        m.put("firmaPases", pases.emite());
        m.put("pases", pases.aceptaPases());
        return m;
    }

    /** CU-15 Descubrir espacios en la LAN. */
    @GetMapping("/descubrir")
    public Map<String, Object> descubrir() {
        List<EspacioRemoto> lista = descubrimiento.buscarEnLan();
        return Map.of("espacios", lista, "udp", descubrimiento.udpActivo(), "sinRed", nodo.direcciones().isEmpty());
    }
}
