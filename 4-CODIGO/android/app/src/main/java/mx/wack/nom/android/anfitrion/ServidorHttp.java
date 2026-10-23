package mx.wack.nom.android.anfitrion;

import android.content.res.AssetManager;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.BindException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

import mx.wack.nom.core.servicio.Bitacora;
import mx.wack.nom.core.servicio.Canal;

/**
 * Servidor HTTP/1.1 mínimo del teléfono: la API (ApiTelefono), los canales en tiempo real (SSE)
 * y la misma interfaz web que trae la app, para que otros equipos entren desde el navegador con
 * http://IP-del-teléfono:puerto. Sin bibliotecas: sockets de Java.
 */
final class ServidorHttp {
    private static final Bitacora log = Bitacora.de(ServidorHttp.class);
    private static final int MAX_CUERPO = 40 * 1024 * 1024;

    private final AssetManager assets;
    private final ApiTelefono api;
    private final ExecutorService hilos = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "nom-http");
        t.setDaemon(true);
        return t;
    });
    private ServerSocket socket;

    ServidorHttp(AssetManager assets, ApiTelefono api) {
        this.assets = assets;
        this.api = api;
    }

    /** Abre el puerto (o el siguiente libre) y devuelve cuál quedó. */
    int iniciar(int preferido) throws IOException {
        IOException ultimo = null;
        for (int p = preferido; p < preferido + 10; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p), 128);
                socket = s;
                Thread t = new Thread(this::aceptar, "nom-http-aceptar");
                t.setDaemon(true);
                t.start();
                return p;
            } catch (BindException e) {
                ultimo = e;
            }
        }
        throw ultimo == null ? new IOException("Sin puerto libre") : ultimo;
    }

    void detener() {
        try { if (socket != null) socket.close(); } catch (IOException ignorado) { }
        hilos.shutdownNow();
    }

    private void aceptar() {
        while (socket != null && !socket.isClosed()) {
            try {
                Socket s = socket.accept();
                hilos.execute(() -> conexion(s));
            } catch (IOException e) {
                if (socket.isClosed()) return;
            } catch (java.util.concurrent.RejectedExecutionException e) {
                return;
            }
        }
    }

    // ------------------------------------------------------------------ peticiones

    static final class Peticion {
        String metodo, ruta, version;
        final Map<String, String> cabeceras = new LinkedHashMap<>();
        final Map<String, String> consulta = new LinkedHashMap<>();
        byte[] cuerpo = new byte[0];

        String cabecera(String nombre) { return cabeceras.get(nombre.toLowerCase(Locale.ROOT)); }

        /** El cuerpo como JSON (mapa, lista…), o null si vino vacío. */
        Object json() {
            if (cuerpo.length == 0) return null;
            String t = new String(cuerpo, StandardCharsets.UTF_8).trim();
            return t.isEmpty() ? null : Json.YO.leer(t);
        }

        boolean mantener() {
            String c = cabecera("connection");
            if ("HTTP/1.0".equals(version)) return c != null && c.equalsIgnoreCase("keep-alive");
            return c == null || !c.equalsIgnoreCase("close");
        }
    }

    /** Lo que responde la API: un JSON con su código, o la apertura de un canal en tiempo real. */
    static final class Respuesta {
        final int codigo;
        final Object cuerpo;
        final Consumer<Canal> canal;

        private Respuesta(int codigo, Object cuerpo, Consumer<Canal> canal) {
            this.codigo = codigo;
            this.cuerpo = cuerpo;
            this.canal = canal;
        }

        static Respuesta json(int codigo, Object cuerpo) { return new Respuesta(codigo, cuerpo, null); }

        static Respuesta sse(Consumer<Canal> abrir) { return new Respuesta(200, null, abrir); }
    }

    private static String linea(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream(128);
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') b.write(c);
            if (b.size() > 16 * 1024) throw new IOException("Línea demasiado larga");
        }
        if (c == -1 && b.size() == 0) return null;
        return b.toString("UTF-8");
    }

    private static String decodificar(String s) {
        try { return URLDecoder.decode(s, "UTF-8"); } catch (Exception e) { return s; }
    }

    private static Peticion leer(InputStream in) throws IOException {
        String inicio = linea(in);
        while (inicio != null && inicio.isEmpty()) inicio = linea(in);
        if (inicio == null) return null;
        String[] partes = inicio.split(" ");
        if (partes.length < 3) throw new IOException("Petición no válida");
        Peticion p = new Peticion();
        p.metodo = partes[0].toUpperCase(Locale.ROOT);
        p.version = partes[2];
        String destino = partes[1];
        int q = destino.indexOf('?');
        p.ruta = decodificar(q < 0 ? destino : destino.substring(0, q));
        if (q >= 0) {
            for (String par : destino.substring(q + 1).split("&")) {
                if (par.isEmpty()) continue;
                int i = par.indexOf('=');
                p.consulta.put(decodificar(i < 0 ? par : par.substring(0, i)), i < 0 ? "" : decodificar(par.substring(i + 1)));
            }
        }
        String l;
        while ((l = linea(in)) != null && !l.isEmpty()) {
            int i = l.indexOf(':');
            if (i > 0) p.cabeceras.put(l.substring(0, i).trim().toLowerCase(Locale.ROOT), l.substring(i + 1).trim());
            if (p.cabeceras.size() > 100) throw new IOException("Demasiadas cabeceras");
        }
        String largo = p.cabecera("content-length");
        if (largo != null) {
            int n = Integer.parseInt(largo.trim());
            if (n < 0 || n > MAX_CUERPO) throw new IOException("Cuerpo demasiado grande");
            byte[] b = new byte[n];
            int leido = 0;
            while (leido < n) {
                int k = in.read(b, leido, n - leido);
                if (k < 0) throw new IOException("Cuerpo incompleto");
                leido += k;
            }
            p.cuerpo = b;
        }
        return p;
    }

    // ------------------------------------------------------------------ atender

    private void conexion(Socket s) {
        try (Socket sock = s) {
            sock.setSoTimeout(30_000);
            sock.setTcpNoDelay(true);
            InputStream in = new BufferedInputStream(sock.getInputStream());
            OutputStream out = sock.getOutputStream();
            while (true) {
                Peticion p;
                try { p = leer(in); } catch (java.net.SocketTimeoutException e) { return; }
                if (p == null) return;
                if (!atender(p, in, out, sock)) return;
            }
        } catch (IOException ignorado) {
            // el cliente se fue
        }
    }

    /** true si la conexión puede seguir para otra petición. */
    private boolean atender(Peticion p, InputStream in, OutputStream out, Socket sock) throws IOException {
        boolean mantener = p.mantener();
        if ("OPTIONS".equals(p.metodo)) {
            responder(out, 204, null, null, mantener, true);
            return mantener;
        }
        if (p.ruta.startsWith("/api/")) {
            Respuesta r = api.atender(p);
            if (r.canal == null) {
                byte[] b = r.cuerpo == null ? new byte[0] : Json.YO.escribir(r.cuerpo);
                responder(out, r.codigo, "application/json;charset=UTF-8", b, mantener, true);
                return mantener;
            }
            canalEnVivo(r, in, out, sock);
            return false;
        }
        estatico(p, out, mantener);
        return mantener;
    }

    /** Canal SSE: queda abierto hasta que el cliente se va (o se le cierra desde el servidor). */
    private void canalEnVivo(Respuesta r, InputStream in, OutputStream out, Socket sock) throws IOException {
        CanalSocket canal = new CanalSocket(out, sock);
        try {
            r.canal.accept(canal);
        } catch (RuntimeException e) {
            if (!canal.empezo()) {
                Respuesta err = api.error(e);
                responder(out, err.codigo, "application/json;charset=UTF-8", Json.YO.escribir(err.cuerpo), false, true);
            }
            return;
        }
        sock.setSoTimeout(0);
        try {
            while (in.read() != -1) { /* el navegador no manda nada: esto solo espera a que se vaya */ }
        } catch (IOException ignorado) { }
        canal.cerrar();
    }

    private static final Map<String, String> TIPOS = new LinkedHashMap<>();
    static {
        TIPOS.put("html", "text/html;charset=UTF-8");
        TIPOS.put("js", "text/javascript;charset=UTF-8");
        TIPOS.put("css", "text/css;charset=UTF-8");
        TIPOS.put("svg", "image/svg+xml");
        TIPOS.put("png", "image/png");
        TIPOS.put("jpg", "image/jpeg");
        TIPOS.put("ico", "image/x-icon");
        TIPOS.put("woff2", "font/woff2");
        TIPOS.put("json", "application/json");
        TIPOS.put("webmanifest", "application/manifest+json");
        TIPOS.put("txt", "text/plain;charset=UTF-8");
    }

    /** La interfaz web, desde los mismos archivos que usa la app. */
    private void estatico(Peticion p, OutputStream out, boolean mantener) throws IOException {
        String ruta = p.ruta.equals("/") ? "index.html" : p.ruta.substring(1);
        if (ruta.contains("..") || ruta.startsWith("/") || !("GET".equals(p.metodo) || "HEAD".equals(p.metodo))) {
            responder(out, 404, "application/json;charset=UTF-8", Json.YO.escribir(Map.of("error", "No existe")), mantener, false);
            return;
        }
        byte[] datos;
        try (InputStream a = assets.open(ruta)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[32 * 1024];
            int n;
            while ((n = a.read(buf)) > 0) b.write(buf, 0, n);
            datos = b.toByteArray();
        } catch (IOException e) {
            responder(out, 404, "application/json;charset=UTF-8", Json.YO.escribir(Map.of("error", "No existe")), mantener, false);
            return;
        }
        int punto = ruta.lastIndexOf('.');
        String tipo = TIPOS.getOrDefault(punto < 0 ? "" : ruta.substring(punto + 1).toLowerCase(Locale.ROOT), "application/octet-stream");
        responder(out, 200, tipo, "HEAD".equals(p.metodo) ? new byte[0] : datos, mantener, false);
    }

    private static String razon(int c) {
        switch (c) {
            case 200: return "OK";
            case 201: return "Created";
            case 204: return "No Content";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 409: return "Conflict";
            case 423: return "Locked";
            default: return c >= 500 ? "Internal Server Error" : "OK";
        }
    }

    static final String CORS = "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n"
            + "Access-Control-Allow-Headers: *\r\nAccess-Control-Max-Age: 3600\r\n";

    private static void responder(OutputStream out, int codigo, String tipo, byte[] cuerpo, boolean mantener, boolean cors) throws IOException {
        StringBuilder h = new StringBuilder("HTTP/1.1 ").append(codigo).append(' ').append(razon(codigo)).append("\r\n");
        if (tipo != null) h.append("Content-Type: ").append(tipo).append("\r\n");
        h.append("Content-Length: ").append(cuerpo == null ? 0 : cuerpo.length).append("\r\n");
        h.append("Cache-Control: no-cache\r\n");
        if (cors) h.append(CORS);
        h.append(mantener ? "Connection: keep-alive\r\n" : "Connection: close\r\n");
        h.append("\r\n");
        out.write(h.toString().getBytes(StandardCharsets.UTF_8));
        if (cuerpo != null && cuerpo.length > 0) out.write(cuerpo);
        out.flush();
    }

    // ------------------------------------------------------------------ canal SSE

    /** Canal en tiempo real sobre el socket: las cabeceras salen con el primer evento. */
    static final class CanalSocket implements Canal {
        private final OutputStream out;
        private final Socket sock;
        private final List<Runnable> alCerrar = new ArrayList<>();
        private boolean empezo, cerrado;

        CanalSocket(OutputStream out, Socket sock) {
            this.out = out;
            this.sock = sock;
        }

        synchronized boolean empezo() { return empezo; }

        private synchronized void escribir(String t) throws IOException {
            if (cerrado) throw new IOException("Canal cerrado");
            try {
                if (!empezo) {
                    out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream;charset=UTF-8\r\nCache-Control: no-cache\r\n"
                            + CORS + "Connection: keep-alive\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                    empezo = true;
                }
                out.write(t.getBytes(StandardCharsets.UTF_8));
                out.flush();
            } catch (IOException e) {
                cerrar();
                throw e;
            }
        }

        @Override public void enviar(String evento, Object datos) throws IOException {
            escribir("event:" + evento + "\ndata:" + Json.texto(datos) + "\n\n");
        }

        @Override public void latido() throws IOException { escribir(":latido\n\n"); }

        @Override public void cerrar() {
            List<Runnable> avisar;
            synchronized (this) {
                if (cerrado) return;
                cerrado = true;
                avisar = new ArrayList<>(alCerrar);
            }
            try { sock.close(); } catch (IOException ignorado) { }
            for (Runnable r : avisar) {
                try { r.run(); } catch (RuntimeException e) { log.aviso("Al cerrar un canal: {}", e.getMessage()); }
            }
        }

        @Override public synchronized void alCerrar(Runnable r) { alCerrar.add(r); }
    }
}
