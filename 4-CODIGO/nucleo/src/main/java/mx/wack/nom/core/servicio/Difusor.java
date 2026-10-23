package mx.wack.nom.core.servicio;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;


import mx.wack.nom.core.modelo.Usuario;

/**
 * Canal en tiempo real (CanalSync del lado web). Cada cliente abre un
 * EventSource por espacio y, si edita, otro por documento. Por aqui salen las
 * operaciones de los demas, la presencia y los avisos de accesos y versiones.
 *
 * Tambien aplica el RNF "maximo 5 usuarios simultaneos" contando usuarios
 * distintos con un canal abierto en el espacio.
 *
 * El canal concreto (Canal) lo pone quien sirve la API: Spring en la computadora, el servidor de
 * la app en el teléfono. latido() se llama cada 20 s.
 */
public class Difusor {

    public static class Suscriptor {
        final Canal canal;
        final String usuarioId, nombre, color, espacioId, docId, cliente;
        volatile String bloque;
        volatile String modo;
        volatile Map<String, Object> cursor;

        Suscriptor(Canal c, Usuario u, String espacioId, String docId, String cliente) {
            this.canal = c;
            this.usuarioId = u.id;
            this.nombre = u.nombre;
            this.color = u.color;
            this.espacioId = espacioId;
            this.docId = docId;
            this.cliente = cliente;
        }
    }

    private final List<Suscriptor> subs = new CopyOnWriteArrayList<>();
    private final int maxUsuarios;

    public Difusor(int maxUsuarios) {
        this.maxUsuarios = maxUsuarios;
    }

    /** Abre el canal de un cliente en un espacio (y, si edita, en un documento). */
    public void suscribir(Usuario u, String espacioId, String docId, String cliente, Canal canal) {
        Set<String> conectados = usuariosEn(espacioId);
        if (!conectados.contains(u.id) && conectados.size() >= maxUsuarios) {
            throw new ErrorNom(ErrorNom.CONFLICTO, "El espacio está lleno: ya hay " + maxUsuarios
                    + " personas conectadas. Intenta en un momento.", null, Map.of("max", maxUsuarios));
        }
        Suscriptor s = new Suscriptor(canal, u, espacioId, docId, cliente == null ? "" : cliente);
        subs.add(s);
        Runnable fuera = () -> {
            if (subs.remove(s)) {
                if (docId != null) presencia(docId);
                avisarEspacio(espacioId, "conectados", Map.of("usuarios", conectadosPublico(espacioId)));
            }
        };
        canal.alCerrar(fuera);
        enviar(s, "hola", Map.of("ok", true));
        if (docId != null) presencia(docId);
        avisarEspacio(espacioId, "conectados", Map.of("usuarios", conectadosPublico(espacioId)));
    }

    public Set<String> usuariosEn(String espacioId) {
        return subs.stream().filter(s -> s.espacioId.equals(espacioId)).map(s -> s.usuarioId).collect(Collectors.toSet());
    }

    public boolean otroEditando(String docId, String usuarioId) {
        return subs.stream().anyMatch(s -> docId.equals(s.docId) && !s.usuarioId.equals(usuarioId));
    }

    public List<Map<String, Object>> conectadosPublico(String espacioId) {
        Map<String, Map<String, Object>> porUsuario = new LinkedHashMap<>();
        for (Suscriptor s : subs) {
            if (!s.espacioId.equals(espacioId)) continue;
            porUsuario.computeIfAbsent(s.usuarioId, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", s.usuarioId);
                m.put("nombre", s.nombre);
                m.put("color", s.color);
                return m;
            });
        }
        return new ArrayList<>(porUsuario.values());
    }

    /** Operaciones nuevas para todos los que tienen abierto el documento (incluido el autor: ignora las suyas por id de nodo). */
    public void ops(String docId, Object datos) {
        for (Suscriptor s : subs) if (docId.equals(s.docId)) enviar(s, "ops", datos);
    }

    public void actualizarPresencia(String docId, String cliente, String bloque, String modo, Map<String, Object> cursor) {
        for (Suscriptor s : subs) {
            if (docId.equals(s.docId) && s.cliente.equals(cliente)) {
                s.bloque = bloque;
                s.modo = modo;
                s.cursor = cursor != null && cursor.size() <= 4 ? cursor : null;
            }
        }
        presencia(docId);
    }

    private void presencia(String docId) {
        List<Map<String, Object>> lista = new ArrayList<>();
        for (Suscriptor s : subs) {
            if (!docId.equals(s.docId)) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("cliente", s.cliente);
            m.put("id", s.usuarioId);
            m.put("nombre", s.nombre);
            m.put("color", s.color);
            m.put("bloque", s.bloque);
            m.put("modo", s.modo);
            m.put("cursor", s.cursor);
            lista.add(m);
        }
        for (Suscriptor s : subs) if (docId.equals(s.docId)) enviar(s, "presencia", Map.of("usuarios", lista));
    }

    public void avisarDocumento(String docId, String evento, Object datos) {
        for (Suscriptor s : subs) if (docId.equals(s.docId)) enviar(s, evento, datos);
    }

    public void avisarEspacio(String espacioId, String evento, Object datos) {
        for (Suscriptor s : subs) if (s.espacioId.equals(espacioId) && s.docId == null) enviar(s, evento, datos);
    }

    /** Para todos los canales del espacio, incluidos los de documentos. */
    public void avisarTodoEspacio(String espacioId, String evento, Object datos) {
        for (Suscriptor s : subs) if (s.espacioId.equals(espacioId)) enviar(s, evento, datos);
    }

    /** CU-17 3b: al revocar un acceso se cierra el canal de ese usuario. */
    public void expulsar(String espacioId, String usuarioId) {
        for (Suscriptor s : subs) {
            if (s.espacioId.equals(espacioId) && s.usuarioId.equals(usuarioId)) {
                enviar(s, "expulsado", Map.of("motivo", "El propietario retiró tu acceso a este espacio"));
                s.canal.cerrar();
            }
        }
    }

    private void enviar(Suscriptor s, String evento, Object datos) {
        try {
            s.canal.enviar(evento, datos);
        } catch (IOException | IllegalStateException ex) {
            subs.remove(s);
        }
    }

    /** Latido: mantiene vivas las conexiones a traves de proxies y detecta clientes muertos. */
    public void latido() {
        for (Suscriptor s : subs) {
            try {
                s.canal.latido();
            } catch (IOException | IllegalStateException ex) {
                subs.remove(s);
            }
        }
    }
}
