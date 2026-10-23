package mx.wack.nom.core.red;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import mx.wack.nom.core.almacen.RepositorioEspacios;
import mx.wack.nom.core.almacen.RepositorioUsuarios;
import mx.wack.nom.core.modelo.Espacio;
import mx.wack.nom.core.servicio.Bitacora;
import mx.wack.nom.core.servicio.CodecJson;
import mx.wack.nom.core.servicio.Nodo;

/**
 * Anuncia por UDP broadcast los espacios con la conexion activa y escucha los
 * anuncios de otros equipos. No necesita Internet ni un servidor central: es
 * lo que hace visible un proyecto "a otros usuarios de la misma red". Lo usan
 * igual el servidor de la computadora y el del teléfono.
 *
 * Paquete: {"nom":1,"servidor":"..","equipo":"..","puerto":8080,"espacios":[{id,nombre,propietario,color}]}
 */
public class Descubrimiento {

    private static final Bitacora log = Bitacora.de(Descubrimiento.class);
    private static final long CADUCA_MS = 10_000;

    private static final class Anuncio {
        final String equipo, host;
        final int puerto;
        final List<Map<String, Object>> espacios;
        final long visto;

        Anuncio(String equipo, String host, int puerto, List<Map<String, Object>> espacios, long visto) {
            this.equipo = equipo;
            this.host = host;
            this.puerto = puerto;
            this.espacios = espacios;
            this.visto = visto;
        }
    }

    private final Nodo nodo;
    private final RepositorioEspacios espacios;
    private final RepositorioUsuarios usuarios;
    private final CodecJson json;
    private final boolean activo;
    private final int puertoUdp;
    private final Map<String, Anuncio> remotos = new ConcurrentHashMap<>();
    private volatile boolean corriendo = true;
    private DatagramSocket socket;

    public Descubrimiento(Nodo nodo, RepositorioEspacios espacios, RepositorioUsuarios usuarios,
                          CodecJson json, boolean activo, int puertoUdp) {
        this.nodo = nodo;
        this.espacios = espacios;
        this.usuarios = usuarios;
        this.json = json;
        this.activo = activo;
        this.puertoUdp = puertoUdp;
    }

    public void iniciar() {
        if (!activo) return;
        try {
            socket = new DatagramSocket(null);
            socket.setReuseAddress(true);
            socket.setBroadcast(true);
            socket.bind(new InetSocketAddress(puertoUdp));
        } catch (Exception e) {
            log.aviso("Descubrimiento LAN desactivado: no se pudo abrir UDP {} ({})", puertoUdp, e.getMessage());
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

    public void detener() {
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
                    Map<String, Object> paquete = new LinkedHashMap<>();
                    paquete.put("nom", 1);
                    paquete.put("servidor", nodo.id());
                    paquete.put("equipo", nodo.equipo());
                    paquete.put("puerto", nodo.puerto());
                    paquete.put("espacios", vis);
                    byte[] datos = json.escribir(paquete);
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
                log.detalle("Anuncio fallido: {}", e.getMessage());
            }
        }
    }

    private static String texto(Object o) { return o == null ? "" : String.valueOf(o); }

    @SuppressWarnings("unchecked")
    private void escuchar() {
        byte[] buf = new byte[16 * 1024];
        while (corriendo && socket != null) {
            try {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                socket.receive(p);
                Object leido = json.leer(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8));
                if (!(leido instanceof Map)) continue;
                Map<String, Object> n = (Map<String, Object>) leido;
                if (!(n.get("nom") instanceof Number) || ((Number) n.get("nom")).intValue() != 1) continue;
                String servidor = texto(n.get("servidor"));
                if (nodo.id().equals(servidor)) continue;
                List<Map<String, Object>> lista = new ArrayList<>();
                if (n.get("espacios") instanceof List) {
                    for (Object o : (List<Object>) n.get("espacios")) {
                        if (!(o instanceof Map)) continue;
                        Map<String, Object> e = (Map<String, Object>) o;
                        lista.add(Map.of("id", texto(e.get("id")), "nombre", texto(e.get("nombre")),
                                "propietario", texto(e.get("propietario")), "color", texto(e.get("color"))));
                    }
                }
                int puerto = n.get("puerto") instanceof Number ? ((Number) n.get("puerto")).intValue() : 8080;
                remotos.put(servidor, new Anuncio(texto(n.get("equipo")), p.getAddress().getHostAddress(), puerto, lista,
                        System.currentTimeMillis()));
            } catch (Exception e) {
                if (!corriendo) return;
            }
        }
    }

    /** CU-15: espacios visibles de este equipo y de los demas equipos que se anunciaron hace poco. */
    public List<EspacioRemoto> buscarEnLan() {
        long ahora = System.currentTimeMillis();
        remotos.values().removeIf(a -> ahora - a.visto > CADUCA_MS);
        List<EspacioRemoto> r = new ArrayList<>();
        List<String> dirs = nodo.direcciones();
        String host = dirs.isEmpty() ? "localhost" : dirs.get(0);
        for (Map<String, Object> e : visibles()) {
            r.add(new EspacioRemoto((String) e.get("id"), (String) e.get("nombre"), (String) e.get("propietario"),
                    (String) e.get("color"), nodo.equipo(), host, nodo.puerto(), true));
        }
        remotos.forEach((srv, a) -> {
            for (Map<String, Object> e : a.espacios) {
                r.add(new EspacioRemoto((String) e.get("id"), (String) e.get("nombre"), (String) e.get("propietario"),
                        (String) e.get("color"), a.equipo, a.host, a.puerto, false));
            }
        });
        return r;
    }

    public boolean udpActivo() { return socket != null; }

    /** false en la nube (Azure): ahi no hay red local que anunciar ni descubrir. */
    public boolean lanActiva() { return activo; }
}
