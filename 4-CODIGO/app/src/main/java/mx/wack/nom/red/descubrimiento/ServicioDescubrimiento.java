package mx.wack.nom.red.descubrimiento;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import mx.wack.nom.core.almacen.RepositorioEspacios;
import mx.wack.nom.core.almacen.RepositorioUsuarios;
import mx.wack.nom.core.modelo.Espacio;
import mx.wack.nom.red.nodo.NodoLocal;
import mx.wack.nom.servidor.repositorio.AlmacenJson;
import tools.jackson.databind.JsonNode;

/**
 * Anuncia por UDP broadcast los espacios con la conexion activa y escucha los
 * anuncios de otros equipos. No necesita Internet ni un servidor central: es
 * lo que hace visible un proyecto "a otros usuarios de la misma red".
 *
 * Paquete: {"nom":1,"servidor":"..","equipo":"..","puerto":8080,"espacios":[{id,nombre,propietario,color}]}
 */
@Service
public class ServicioDescubrimiento {

    private static final Logger log = LoggerFactory.getLogger(ServicioDescubrimiento.class);
    private static final long CADUCA_MS = 10_000;

    private record Anuncio(String equipo, String host, int puerto, List<Map<String, Object>> espacios, long visto) { }

    private final NodoLocal nodo;
    private final RepositorioEspacios espacios;
    private final RepositorioUsuarios usuarios;
    private final AlmacenJson almacen;
    private final boolean activo;
    private final int puertoUdp;
    private final Map<String, Anuncio> remotos = new ConcurrentHashMap<>();
    private volatile boolean corriendo = true;
    private DatagramSocket socket;

    public ServicioDescubrimiento(NodoLocal nodo, RepositorioEspacios espacios, RepositorioUsuarios usuarios,
                                  AlmacenJson almacen,
                                  @Value("${nom.descubrimiento.activo}") boolean activo,
                                  @Value("${nom.descubrimiento.puerto}") int puertoUdp) {
        this.nodo = nodo;
        this.espacios = espacios;
        this.usuarios = usuarios;
        this.almacen = almacen;
        this.activo = activo;
        this.puertoUdp = puertoUdp;
    }

    @PostConstruct
    void iniciar() {
        if (!activo) return;
        try {
            socket = new DatagramSocket(null);
            socket.setReuseAddress(true);
            socket.setBroadcast(true);
            socket.bind(new InetSocketAddress(puertoUdp));
        } catch (Exception e) {
            log.warn("Descubrimiento LAN desactivado: no se pudo abrir UDP {} ({})", puertoUdp, e.getMessage());
            socket = null;
            return;
        }
        Thread escucha = new Thread(this::escuchar, "nom-descubrimiento-escucha");
        escucha.setDaemon(true);
        escucha.start();
        Thread anuncio = new Thread(this::anunciarCiclo, "nom-descubrimiento-anuncio");
        anuncio.setDaemon(true);
        anuncio.start();
        log.info("Descubrimiento LAN en UDP {}", puertoUdp);
    }

    @PreDestroy
    void detener() {
        corriendo = false;
        if (socket != null) socket.close();
    }

    private List<Map<String, Object>> visibles() {
        List<Map<String, Object>> r = new ArrayList<>();
        for (Espacio e : espacios.todos()) {
            if (e.conexion == null || !e.conexion.activa) continue;
            String duenio = usuarios.porId(e.propietarioId).map(u -> u.nombre).orElse("?");
            r.add(Map.of("id", e.id, "nombre", e.nombre, "propietario", duenio, "color", e.color == null ? "" : e.color));
        }
        return r;
    }

    private void anunciarCiclo() {
        while (corriendo) {
            try {
                // El servidor se anuncia siempre (así la app Android lo encuentra al abrirse);
                // la lista solo incluye los espacios con la "Conexión del proyecto" activa.
                List<Map<String, Object>> vis = visibles();
                if (socket != null) {
                    byte[] datos = almacen.json().writeValueAsBytes(Map.of("nom", 1, "servidor", nodo.id(),
                            "equipo", nodo.equipo(), "puerto", nodo.puerto(), "espacios", vis));
                    List<InetAddress> destinos = new ArrayList<>(nodo.difusion());
                    destinos.add(InetAddress.getByName("255.255.255.255"));
                    for (InetAddress d : destinos) {
                        try {
                            socket.send(new DatagramPacket(datos, datos.length, d, puertoUdp));
                        } catch (Exception ignorado) { }
                    }
                }
                Thread.sleep(3_000);
            } catch (InterruptedException e) {
                return;
            } catch (Exception e) {
                log.debug("Anuncio fallido: {}", e.getMessage());
            }
        }
    }

    private void escuchar() {
        byte[] buf = new byte[16 * 1024];
        while (corriendo && socket != null) {
            try {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                socket.receive(p);
                JsonNode n = almacen.json().readTree(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8));
                if (n.path("nom").asInt() != 1) continue;
                String servidor = n.path("servidor").asString();
                if (nodo.id().equals(servidor)) continue;
                List<Map<String, Object>> lista = new ArrayList<>();
                for (JsonNode e : n.path("espacios")) {
                    lista.add(Map.of("id", e.path("id").asString(), "nombre", e.path("nombre").asString(),
                            "propietario", e.path("propietario").asString(), "color", e.path("color").asString()));
                }
                remotos.put(servidor, new Anuncio(n.path("equipo").asString(), p.getAddress().getHostAddress(),
                        n.path("puerto").asInt(8080), lista, System.currentTimeMillis()));
            } catch (Exception e) {
                if (!corriendo) return;
            }
        }
    }

    /** CU-15: espacios visibles de este equipo y de los demas equipos que se anunciaron hace poco. */
    public List<EspacioRemoto> buscarEnLan() {
        long ahora = System.currentTimeMillis();
        remotos.values().removeIf(a -> ahora - a.visto() > CADUCA_MS);
        List<EspacioRemoto> r = new ArrayList<>();
        List<String> dirs = nodo.direcciones();
        String host = dirs.isEmpty() ? "localhost" : dirs.get(0);
        for (Map<String, Object> e : visibles()) {
            r.add(new EspacioRemoto((String) e.get("id"), (String) e.get("nombre"), (String) e.get("propietario"),
                    (String) e.get("color"), nodo.equipo(), host, nodo.puerto(), true));
        }
        remotos.forEach((srv, a) -> {
            for (Map<String, Object> e : a.espacios()) {
                r.add(new EspacioRemoto((String) e.get("id"), (String) e.get("nombre"), (String) e.get("propietario"),
                        (String) e.get("color"), a.equipo(), a.host(), a.puerto(), false));
            }
        });
        return r;
    }

    public boolean udpActivo() { return socket != null; }

    /** false en la nube (Azure): ahi no hay red local que anunciar ni descubrir. */
    public boolean lanActiva() { return activo; }
}
