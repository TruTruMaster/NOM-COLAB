package mx.wack.nom.core.servicio;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import mx.wack.nom.core.crdt.Operacion;
import mx.wack.nom.core.modelo.Documento;
import mx.wack.nom.core.modelo.Espacio;
import mx.wack.nom.core.modelo.Permiso;
import mx.wack.nom.core.modelo.Usuario;

/**
 * 6.5 Copia de un espacio en otro servidor: el telefono del salon (que trabajo sin Internet) con
 * Azure o el servidor propio, y al reves. Como los dos usan el mismo CRDT, sincronizar es mandar
 * todo lo que uno tiene al otro (cada registro con su reloj y su nodo originales) y traer lo que
 * tiene el otro: los dos quedan con la union, sin importar el orden. No se borra nada en ningun
 * lado y los accesos de cada servidor no se tocan.
 *
 * Usa la misma API que los navegadores (con la cuenta del propietario en el otro servidor) y
 * solo el JDK para HTTP, asi corre igual en la computadora y en el telefono.
 */
public class ServicioSincronia {

    private static final Bitacora log = Bitacora.de(ServicioSincronia.class);
    private static final int LOTE = 300;

    private final ServicioEspacios espacios;
    private final ServicioDocumentos documentos;
    private final CodecJson json;
    private final Nodo nodo;

    public ServicioSincronia(ServicioEspacios espacios, ServicioDocumentos documentos, CodecJson json, Nodo nodo) {
        this.espacios = espacios;
        this.documentos = documentos;
        this.json = json;
        this.nodo = nodo;
    }

    /** Error del otro servidor (con su codigo HTTP). */
    static final class ErrorRemoto extends IOException {
        final int codigo;
        ErrorRemoto(int codigo, String m) { super(m); this.codigo = codigo; }
    }

    // ------------------------------------------------------------ configurar

    static String normalizar(String url) {
        String u = url == null ? "" : url.trim().replaceAll("/+$", "");
        if (u.isEmpty()) throw ErrorNom.invalido("Escribe la dirección del otro NOM-COLAB", "servidor");
        if (!u.matches("(?i)^https?://.*")) {
            String host = u.split("[/:]")[0].toLowerCase(Locale.ROOT);
            boolean red = host.matches("\\d+(\\.\\d+){3}") || host.equals("localhost") || !host.contains(".") || host.endsWith(".local");
            u = (red ? "http://" : "https://") + u;
            if (red && !u.replaceFirst("^https?://", "").matches(".*:\\d+$")) u += ":8080";
        }
        return u;
    }

    /** El propietario conecta el espacio con su cuenta en otro servidor y se hace la primera copia. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> configurar(Usuario u, String espacioId, String servidor, String usuario, String contrasena) {
        Espacio e = espacios.requerir(espacioId);
        espacios.exigir(e, u, Permiso.PROPIETARIO);
        String base = normalizar(servidor);
        if (usuario == null || usuario.isBlank() || contrasena == null || contrasena.isEmpty())
            throw ErrorNom.invalido("Escribe tu usuario y tu contraseña de allá", "usuario");
        try {
            Object info = pedir("GET", base + "/api/red/info", null, null);
            if (!(info instanceof Map<?, ?> mi) || !(mi.get("nom") instanceof Number nom) || nom.intValue() != 1)
                throw ErrorNom.invalido("En esa dirección no hay un NOM-COLAB", "servidor");
            if (String.valueOf(mi.get("servidor")).equals(nodo.id())) throw ErrorNom.invalido("Esa dirección es este mismo NOM-COLAB", "servidor");
            Map<String, Object> ses = (Map<String, Object>) pedir("POST", base + "/api/cuentas/sesion", null, Map.of("nombre", usuario.trim(), "contrasena", contrasena));
            String token = String.valueOf(ses.get("token"));
            // Un espacio con el mismo nombre (si ya existe y lo puedo editar) o uno nuevo.
            String remoto = null;
            for (Object o : (List<Object>) pedir("GET", base + "/api/espacios", token, null)) {
                Map<String, Object> x = (Map<String, Object>) o;
                if (e.nombre.equalsIgnoreCase(String.valueOf(x.get("nombre"))) && !"LECTURA".equals(String.valueOf(x.get("permiso")))) { remoto = String.valueOf(x.get("id")); break; }
            }
            if (remoto == null) remoto = String.valueOf(((Map<String, Object>) pedir("POST", base + "/api/espacios", token, Map.of("nombre", e.nombre))).get("id"));
            Espacio.Sincronia s = new Espacio.Sincronia();
            s.servidor = base;
            s.usuario = usuario.trim();
            s.token = token;
            s.espacioRemoto = remoto;
            e.sincronia = s;
            espacios.guardar(e);
        } catch (ErrorRemoto ex) {
            throw ErrorNom.invalido(ex.codigo == 401 || ex.codigo == 423 ? "El otro NOM-COLAB no aceptó tu usuario o contraseña: " + ex.getMessage() : "El otro NOM-COLAB respondió: " + ex.getMessage(), ex.codigo == 401 ? "contrasena" : null);
        } catch (IOException ex) {
            throw ErrorNom.invalido("No se pudo conectar con " + base + " (¿hay Internet o estás en el mismo Wi-Fi?)", "servidor");
        }
        return sincronizarEspacio(e);
    }

    public Map<String, Object> sincronizar(Usuario u, String espacioId) {
        Espacio e = espacios.requerir(espacioId);
        espacios.exigir(e, u, Permiso.PROPIETARIO);
        if (e.sincronia == null) throw ErrorNom.invalido("Este espacio no tiene copia en otro NOM-COLAB", null);
        return sincronizarEspacio(e);
    }

    public Map<String, Object> quitar(Usuario u, String espacioId) {
        Espacio e = espacios.requerir(espacioId);
        espacios.exigir(e, u, Permiso.PROPIETARIO);
        e.sincronia = null;
        espacios.guardar(e);
        return espacios.resumen(e, u);
    }

    /** Cada 5 minutos: los espacios conectados se copian si hay red (si no, se intenta luego). */
    public void cadaRato() {
        for (Espacio e : espacios.todos()) {
            if (e.sincronia == null || e.sincronia.token == null) continue;
            try { sincronizarEspacio(e); } catch (RuntimeException ex) { log.aviso("Sincronización de {}: {}", e.nombre, ex.getMessage()); }
        }
    }

    // ------------------------------------------------------------ copiar

    @SuppressWarnings("unchecked")
    private synchronized Map<String, Object> sincronizarEspacio(Espacio e) {
        Espacio.Sincronia s = e.sincronia;
        Map<String, Object> r = new LinkedHashMap<>();
        int subidas = 0, bajadas = 0, nuevosAqui = 0, nuevosAlla = 0;
        try {
            String base = s.servidor, tok = s.token, rem = s.espacioRemoto;
            List<Object> remotos = (List<Object>) pedir("GET", base + "/api/espacios/" + rem + "/documentos", tok, null);
            Map<String, Map<String, Object>> porId = new LinkedHashMap<>();
            for (Object o : remotos) { Map<String, Object> x = (Map<String, Object>) o; porId.put(String.valueOf(x.get("id")), x); }
            Set<String> emparejados = new HashSet<>(s.docs.values());
            // Documentos nuevos de alla: se crean aqui.
            for (var x : porId.values()) {
                String rid = String.valueOf(x.get("id"));
                if (emparejados.contains(rid)) continue;
                Documento d = documentos.crearExterno(e.id, String.valueOf(x.get("nombre")), String.valueOf(x.get("modo")));
                s.docs.put(d.id, rid);
                emparejados.add(rid);
                nuevosAqui++;
            }
            for (Documento d : documentos.listarInterno(e.id)) {
                String rid = s.docs.get(d.id);
                if (rid == null) {
                    // Documento nuevo de aqui: se crea alla.
                    Map<String, Object> cuerpo = new LinkedHashMap<>();
                    cuerpo.put("nombre", d.nombre);
                    cuerpo.put("modo", d.modo == null ? "TEXTO" : d.modo.name());
                    cuerpo.put("ops", List.of());
                    rid = String.valueOf(((Map<String, Object>) pedir("POST", base + "/api/espacios/" + rem + "/documentos", tok, cuerpo)).get("id"));
                    s.docs.put(d.id, rid);
                    nuevosAlla++;
                } else if (!porId.containsKey(rid)) {
                    // Lo borraron alla: aqui se conserva, ya sin pareja.
                    s.docs.remove(d.id);
                    s.copiados.remove(d.id);
                    continue;
                }
                long remMod = porId.containsKey(rid) ? ((Number) porId.get(rid).getOrDefault("modificado", 0L)).longValue() : -1;
                boolean subir = !Long.valueOf(d.modificado).equals(s.copiados.get(d.id));
                boolean bajar = !Long.valueOf(remMod).equals(s.remotos.get(rid));
                if (!subir && !bajar) continue;
                if (subir) {
                    List<Operacion> ops = operaciones((Map<String, Object>) json.leer(new String(json.escribir(documentos.estadoParaCopiar(d.id)), StandardCharsets.UTF_8)));
                    for (int i = 0; i < ops.size(); i += LOTE) {
                        Map<String, Object> lote = new LinkedHashMap<>();
                        lote.put("cliente", "sincronia-" + nodo.id());
                        lote.put("ops", ops.subList(i, Math.min(ops.size(), i + LOTE)));
                        lote.put("dispositivo", "Sincronización");
                        Map<String, Object> res = (Map<String, Object>) pedir("POST", base + "/api/documentos/" + rid + "/ops", tok, lote);
                        subidas += ((Number) res.getOrDefault("aplicadas", 0)).intValue();
                    }
                }
                Map<String, Object> abierto = (Map<String, Object>) pedir("GET", base + "/api/documentos/" + rid, tok, null);
                bajadas += documentos.fusionarExterno(d.id, operaciones((Map<String, Object>) abierto.get("estado")), "Sincronización con " + s.servidor.replaceFirst("^https?://", ""));
                s.copiados.put(d.id, documentos.requerir(d.id).modificado);
                Object doc = abierto.get("documento");
                s.remotos.put(rid, doc instanceof Map<?, ?> dm && dm.get("modificado") instanceof Number n ? n.longValue() : remMod);
            }
            s.ultima = System.currentTimeMillis();
            s.estado = "ok";
            s.error = null;
        } catch (ErrorRemoto ex) {
            s.estado = ex.codigo == 401 ? "sesion" : "error";
            s.error = ex.codigo == 401 ? "La sesión en el otro NOM-COLAB venció: vuelve a conectar el espacio." : ex.getMessage();
        } catch (IOException ex) {
            s.estado = "sin-red";
            s.error = "Sin conexión con el otro NOM-COLAB; se vuelve a intentar solo.";
        }
        espacios.guardar(e);
        r.put("estado", s.estado);
        r.put("error", s.error);
        r.put("ultima", s.ultima);
        r.put("subidas", subidas);
        r.put("bajadas", bajadas);
        r.put("nuevosAqui", nuevosAqui);
        r.put("nuevosAlla", nuevosAlla);
        r.put("documentos", s.docs.size());
        return r;
    }

    /**
     * Operaciones que recrean un estado (como lo da GET /api/documentos/{id}): un registro por
     * campo con su reloj y nodo originales, y cada tramo de texto, visibilidad y formato. Sus ids
     * son fijos, asi mandarlos dos veces no cambia nada.
     */
    @SuppressWarnings("unchecked")
    static List<Operacion> operaciones(Map<String, Object> estado) {
        List<Operacion> ops = new ArrayList<>();
        if (estado == null) return ops;
        Object bl = estado.get("bloques");
        if (bl instanceof Map<?, ?> bloques) {
            for (var b : ((Map<String, Object>) bloques).entrySet()) {
                if (!(b.getValue() instanceof Map<?, ?> campos)) continue;
                Map<String, Map<String, Object>> grupos = new LinkedHashMap<>();
                Map<String, long[]> relojes = new LinkedHashMap<>();
                Map<String, String> nodos = new LinkedHashMap<>();
                for (var c : ((Map<String, Object>) campos).entrySet()) {
                    if (!(c.getValue() instanceof Map<?, ?> reg) || !(reg.get("t") instanceof Number t) || reg.get("n") == null) continue;
                    String k = t.longValue() + "|" + reg.get("n");
                    grupos.computeIfAbsent(k, z -> new LinkedHashMap<>()).put(c.getKey(), reg.get("v"));
                    relojes.put(k, new long[] { t.longValue() });
                    nodos.put(k, String.valueOf(reg.get("n")));
                }
                for (var g : grupos.entrySet()) {
                    List<String> ks = new ArrayList<>(g.getValue().keySet());
                    for (int i = 0, parte = 0; i < ks.size(); i += 300, parte++) {
                        Map<String, Object> trozo = new LinkedHashMap<>();
                        for (String k : ks.subList(i, Math.min(ks.size(), i + 300))) trozo.put(k, g.getValue().get(k));
                        long t = relojes.get(g.getKey())[0];
                        String n = nodos.get(g.getKey());
                        ops.add(new Operacion("sx:" + n + ":" + t + ":" + b.getKey() + (parte > 0 ? ":" + parte : ""), b.getKey(), trozo, t, n));
                    }
                }
            }
        }
        Object sq = estado.get("seq");
        if (sq instanceof Map<?, ?> seqs) {
            for (var b : ((Map<String, Object>) seqs).entrySet()) {
                if (!(b.getValue() instanceof Map<?, ?> reg)) continue;
                for (String lista : new String[] { "ins", "vis", "fmt" }) {
                    if (!(reg.get(lista) instanceof List<?> l)) continue;
                    String k = lista.equals("ins") ? "i" : lista.equals("vis") ? "v" : "f";
                    for (Object o : l) {
                        if (!(o instanceof Map<?, ?> en) || !(en.get("t") instanceof Number t) || en.get("n") == null) continue;
                        Map<String, Object> s = new LinkedHashMap<>((Map<String, Object>) en);
                        s.remove("t");
                        s.remove("n");
                        s.put("k", k);
                        String n = String.valueOf(en.get("n"));
                        ops.add(new Operacion("sx:" + k + ":" + n + ":" + t.longValue() + ":" + b.getKey(), b.getKey(), Map.of(), t.longValue(), n, s));
                    }
                }
            }
        }
        return ops;
    }

    // ------------------------------------------------------------ HTTP (solo el JDK)

    private Object pedir(String metodo, String url, String token, Object cuerpo) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setRequestMethod(metodo);
            c.setConnectTimeout(8_000);
            c.setReadTimeout(60_000);
            c.setRequestProperty("Accept", "application/json");
            if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
            if (cuerpo != null) {
                byte[] b = json.escribir(cuerpo);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json;charset=UTF-8");
                c.setFixedLengthStreamingMode(b.length);
                try (OutputStream o = c.getOutputStream()) { o.write(b); }
            }
            int codigo = c.getResponseCode();
            String t = leer(codigo >= 400 ? c.getErrorStream() : c.getInputStream());
            if (codigo >= 400) {
                String m = "Error " + codigo;
                try { Object e = json.leer(t); if (e instanceof Map<?, ?> em && em.get("error") != null) m = String.valueOf(em.get("error")); } catch (RuntimeException ignorado) { }
                throw new ErrorRemoto(codigo, m);
            }
            return t.isBlank() ? null : json.leer(t);
        } finally {
            c.disconnect();
        }
    }

    private static String leer(InputStream in) throws IOException {
        if (in == null) return "";
        try (InputStream i = in) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[32 * 1024];
            int n;
            while ((n = i.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        }
    }
}
