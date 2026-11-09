package mx.wack.nom.core.servicio;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.IDN;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.net.UnknownHostException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import mx.wack.nom.core.almacen.RepositorioEspacios;
import mx.wack.nom.core.modelo.Permiso;
import mx.wack.nom.core.modelo.Usuario;

/**
 * Fase 9 (generar sin IA): el servidor busca y lee fuentes para que la persona investigue y cite.
 * Wikipedia en español, libros de Open Library, artículos de Crossref, datos públicos de Wikidata y
 * los datos de una página web (título, autor, fecha, sitio). Devuelve la referencia ya ordenada; la
 * persona escribe el trabajo y la app pone las citas.
 *
 * Leer una dirección cualquiera es peligroso si el servidor obedece a ciegas: alguien podría pedirle
 * que lea la red del salón, el propio servidor (localhost) o los datos internos de la nube
 * (169.254.169.254). Por eso: solo http y https en los puertos 80 y 443, sin usuario ni contraseña,
 * todas las IP del nombre deben ser públicas (también en cada redirección, máximo 3), con tiempo
 * límite y tope de tamaño. Java guarda la respuesta del DNS unos segundos, así que la conexión usa
 * la misma IP que se revisó.
 */
public class ServicioFuentes {

    private static final Bitacora log = Bitacora.de(ServicioFuentes.class);
    private static final int MAX_BYTES = 1_500_000, MAX_TEXTO = 25_000, MAX_BIBLIOTECA = 150, POR_MINUTO = 40;
    private static final String AGENTE = "NOM-COLAB/1.0 (proyecto escolar sin fines de lucro)";
    private static final Set<String> CAMPOS = Set.of("tipo", "titulo", "anio", "fecha", "editorial", "revista", "volumen", "numero",
            "paginas", "doi", "isbn", "url", "sitio", "edicion", "consultado", "descripcion", "medio", "capitulo", "editores");

    private final ServicioEspacios espacios;
    private final RepositorioEspacios repo;
    private final CodecJson json;
    private final Cifrado cifrado;
    private final Map<String, long[]> usos = new ConcurrentHashMap<>();

    public ServicioFuentes(ServicioEspacios espacios, RepositorioEspacios repo, CodecJson json, Cifrado cifrado) {
        this.espacios = espacios;
        this.repo = repo;
        this.json = json;
        this.cifrado = cifrado;
    }

    // ------------------------------------------------------------ lectura segura

    /** Lo que se leyo: el texto, su tipo de contenido y la direccion final (despues de redirecciones). */
    static final class Leido {
        final String texto, tipo, url;
        Leido(String texto, String tipo, String url) { this.texto = texto; this.tipo = tipo; this.url = url; }
    }

    private void limitar(Usuario u) {
        long ahora = System.currentTimeMillis();
        long[] c = usos.computeIfAbsent(u.id, k -> new long[] { ahora, 0 });
        synchronized (c) {
            if (ahora - c[0] > 60_000) { c[0] = ahora; c[1] = 0; }
            if (++c[1] > POR_MINUTO) throw new ErrorNom(429, "Muchas búsquedas seguidas: espera un minuto e intenta de nuevo");
        }
    }

    /** ¿Es una IP de Internet? (no la red local, ni el propio equipo, ni las direcciones internas de la nube) */
    static boolean esPublica(InetAddress a) {
        if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress() || a.isMulticastAddress()) return false;
        byte[] b = a.getAddress();
        if (a instanceof Inet4Address) {
            int x = b[0] & 255, y = b[1] & 255;
            if (x == 0 || x == 10 || x == 127 || x >= 224) return false;
            if (x == 100 && y >= 64 && y <= 127) return false;          // red compartida de proveedores (CGNAT)
            if (x == 169 && y == 254) return false;                      // enlace local y datos internos de la nube
            if (x == 172 && y >= 16 && y <= 31) return false;
            if (x == 192 && y == 168) return false;
            if (x == 192 && y == 0 && ((b[2] & 255) == 0 || (b[2] & 255) == 2)) return false;
            if (x == 198 && (y == 18 || y == 19)) return false;
            if (x == 198 && y == 51 && (b[2] & 255) == 100) return false;
            if (x == 203 && y == 0 && (b[2] & 255) == 113) return false;
            return true;
        }
        if (a instanceof Inet6Address) {
            if ((b[0] & 0xfe) == 0xfc) return false;                                 // fc00::/7 (privadas)
            if ((b[0] & 255) == 0xfe && (b[1] & 0xc0) == 0x80) return false;          // fe80::/10
            if ((b[0] & 255) == 0x20 && (b[1] & 255) == 0x01 && (b[2] & 255) == 0x0d && (b[3] & 255) == 0xb8) return false;
            boolean ceros = true;
            for (int i = 0; i < 10; i++) if (b[i] != 0) { ceros = false; break; }
            // ::ffff:a.b.c.d y ::a.b.c.d: se revisa la IPv4 de adentro.
            if (ceros && ((b[10] == 0 && b[11] == 0) || ((b[10] & 255) == 0xff && (b[11] & 255) == 0xff))) {
                try { return esPublica(InetAddress.getByAddress(Arrays.copyOfRange(b, 12, 16))); } catch (UnknownHostException e) { return false; }
            }
            if ((b[0] & 255) == 0x00 && (b[1] & 255) == 0x64 && (b[2] & 255) == 0xff && (b[3] & 255) == 0x9b) return false;   // 64:ff9b:: (NAT64)
            return true;
        }
        return false;
    }

    private static ErrorNom interna() {
        return new ErrorNom(ErrorNom.PROHIBIDO, "Esa dirección es de una red interna: por seguridad no se lee");
    }

    /** Revisa una direccion antes de conectarse (esquema, puerto, usuario y que todas sus IP sean publicas). */
    static URL revisar(String direccion) {
        if (direccion == null || direccion.isBlank()) throw ErrorNom.invalido("Escribe la dirección de la página", "url");
        String d = direccion.trim().replace(" ", "%20");
        if (!d.matches("(?i)^[a-z][a-z0-9+.-]*:.*")) d = "https://" + d;
        URI uri;
        try { uri = new URI(d); } catch (Exception e) { throw ErrorNom.invalido("Esa dirección no es válida", "url"); }
        String esquema = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!esquema.equals("http") && !esquema.equals("https")) throw ErrorNom.invalido("Solo se leen direcciones http o https", "url");
        if (uri.getRawUserInfo() != null) throw ErrorNom.invalido("La dirección no puede llevar usuario ni contraseña", "url");
        String host = uri.getHost();
        if (host == null || host.isBlank()) throw ErrorNom.invalido("Falta el nombre del sitio", "url");
        int puerto = uri.getPort();
        if (puerto != -1 && puerto != 80 && puerto != 443) throw ErrorNom.invalido("Solo se leen sitios en los puertos normales (80 y 443)", "url");
        String h = host.toLowerCase(Locale.ROOT);
        if (h.startsWith("[") && h.endsWith("]")) h = h.substring(1, h.length() - 1);
        if (h.equals("localhost") || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa"))
            throw interna();
        InetAddress[] ips;
        try { ips = InetAddress.getAllByName(IDN.toASCII(h)); }
        catch (UnknownHostException | IllegalArgumentException e) { throw new ErrorNom(ErrorNom.NO_EXISTE, "No se encontró ese sitio: revisa la dirección (o la conexión del servidor)"); }
        if (ips.length == 0) throw interna();
        for (InetAddress a : ips) if (!esPublica(a)) throw interna();
        try { return uri.toURL(); } catch (Exception e) { throw ErrorNom.invalido("Esa dirección no es válida", "url"); }
    }

    private Leido leer(String direccion) {
        String actual = direccion;
        for (int saltos = 0; saltos <= 3; saltos++) {
            URL u = revisar(actual);
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) u.openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(6_000);
                c.setReadTimeout(10_000);
                c.setRequestProperty("User-Agent", AGENTE);
                c.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5");
                c.setRequestProperty("Accept-Language", "es-MX,es;q=0.9,en;q=0.5");
                int cod = c.getResponseCode();
                if (cod >= 300 && cod < 400) {
                    String loc = c.getHeaderField("Location");
                    if (loc == null || loc.isBlank()) throw new ErrorNom(ErrorNom.INVALIDO, "La página manda a otra sin decir a cuál");
                    actual = u.toURI().resolve(loc.trim().replace(" ", "%20")).toString();
                    continue;
                }
                if (cod >= 400) throw new ErrorNom(ErrorNom.NO_EXISTE, "La página respondió con un error (" + cod + ")", null, Map.of("estado", cod));
                if (c.getContentLengthLong() > MAX_BYTES) throw new ErrorNom(ErrorNom.LLENO, "La página es demasiado grande para leerla");
                String tipo = c.getContentType() == null ? "" : c.getContentType();
                byte[] b = leerHasta(c.getInputStream(), MAX_BYTES);
                return new Leido(new String(b, juego(tipo, b)), tipo, u.toString());
            } catch (ErrorNom e) {
                throw e;
            } catch (IOException | java.net.URISyntaxException | IllegalArgumentException e) {
                throw new ErrorNom(503, "No se pudo leer: el servidor no tiene Internet o el sitio no respondió", null, Map.of("red", true));
            } finally {
                if (c != null) c.disconnect();
            }
        }
        throw new ErrorNom(ErrorNom.INVALIDO, "La página manda a otra demasiadas veces");
    }

    private static byte[] leerHasta(InputStream in, int max) throws IOException {
        try (InputStream i = in; ByteArrayOutputStream o = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16 * 1024];
            int n, total = 0;
            while ((n = i.read(buf)) > 0) {
                total += n;
                if (total > max) throw new ErrorNom(ErrorNom.LLENO, "La página es demasiado grande para leerla");
                o.write(buf, 0, n);
            }
            return o.toByteArray();
        }
    }

    private static Charset juego(String tipo, byte[] b) {
        Matcher m = Pattern.compile("charset=\\s*[\"']?([\\w.:-]+)", Pattern.CASE_INSENSITIVE).matcher(tipo);
        String cs = m.find() ? m.group(1) : null;
        if (cs == null) {
            String ini = new String(b, 0, Math.min(b.length, 3000), StandardCharsets.ISO_8859_1);
            Matcher m2 = Pattern.compile("<meta[^>]+charset=\\s*[\"']?([\\w.:-]+)", Pattern.CASE_INSENSITIVE).matcher(ini);
            if (m2.find()) cs = m2.group(1);
        }
        try { return cs == null ? StandardCharsets.UTF_8 : Charset.forName(cs); } catch (RuntimeException e) { return StandardCharsets.UTF_8; }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> leerJson(String url) {
        Object o = json.leer(leer(url).texto);
        if (o instanceof Map) return (Map<String, Object>) o;
        throw new ErrorNom(502, "El servicio respondió algo que no se entiende");
    }

    private static String c(String s) { return URLEncoder.encode(s, StandardCharsets.UTF_8); }

    // ------------------------------------------------------------ utilerias para armar la referencia

    private static String hoy() { return LocalDate.now().toString(); }

    private static String texto(Object o) {
        if (o == null) return null;
        if (o instanceof List<?> l) return l.isEmpty() ? null : texto(l.get(0));
        String s = String.valueOf(o).trim();
        return s.isEmpty() ? null : s;
    }

    private static void poner(Map<String, Object> m, String k, Object v) {
        String s = v instanceof String x ? x.trim() : v == null ? null : String.valueOf(v);
        if (s != null && !s.isEmpty() && !"null".equals(s)) m.put(k, s.length() > 600 ? s.substring(0, 600) : s);
    }

    private static final Pattern CORPORATIVO = Pattern.compile("(?i)\\b(universidad|instituto|secretar[ií]a|organizaci[oó]n|gobierno|comisi[oó]n|consejo|asociaci[oó]n|fundaci[oó]n|museo|biblioteca|centro|departamento|ministerio|unam|inegi|ipn|sep|oms|unesco|onu|wikipedia|redacci[oó]n|equipo|editorial)\\b");

    /** "Gabriel García Márquez" o "García Márquez, Gabriel" → { familia, nombres } (o { literal } si es una institución). */
    static Map<String, Object> autor(String nombre) {
        Map<String, Object> a = new LinkedHashMap<>();
        String n = nombre == null ? "" : nombre.replaceAll("\\s+", " ").trim();
        if (n.isEmpty()) return null;
        if (n.length() > 120) n = n.substring(0, 120);
        if (n.contains(",")) {
            String[] p = n.split(",", 2);
            a.put("familia", p[0].trim());
            if (!p[1].isBlank()) a.put("nombres", p[1].trim());
            return a;
        }
        String[] ps = n.split(" ");
        if (CORPORATIVO.matcher(n).find() || ps.length > 5 || ps.length == 1) { a.put("literal", n); return a; }
        int f = ps.length >= 4 ? 2 : ps.length == 3 ? 2 : 1;
        // "María de la Luz Pérez": las partículas (de, del, la, y) se quedan con el apellido.
        int ini = ps.length - f;
        while (ini > 1 && ps[ini - 1].matches("(?i)de|del|la|las|los|y|van|von|da|di")) ini--;
        a.put("familia", String.join(" ", Arrays.copyOfRange(ps, ini, ps.length)));
        a.put("nombres", String.join(" ", Arrays.copyOfRange(ps, 0, ini)));
        return a;
    }

    private static String anioDe(String fecha) {
        if (fecha == null) return null;
        Matcher m = Pattern.compile("(1[5-9]\\d\\d|20\\d\\d)").matcher(fecha);
        return m.find() ? m.group(1) : null;
    }

    /** Fecha a yyyy-mm-dd, yyyy-mm o yyyy (lo que se pueda). */
    private static String fechaDe(String f) {
        if (f == null) return null;
        Matcher m = Pattern.compile("(\\d{4})(?:[-/.](\\d{1,2})(?:[-/.](\\d{1,2}))?)?").matcher(f);
        if (!m.find()) return anioDe(f);
        String r = m.group(1);
        if (m.group(2) != null) r += "-" + (m.group(2).length() == 1 ? "0" : "") + m.group(2);
        if (m.group(3) != null) r += "-" + (m.group(3).length() == 1 ? "0" : "") + m.group(3);
        return r;
    }

    // ------------------------------------------------------------ página web

    private static final Pattern META = Pattern.compile("<meta\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ATRIB = Pattern.compile("([a-zA-Z:_.-]+)\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))");
    private static final Pattern TITULO = Pattern.compile("<title[^>]*>(.*?)</title>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern LDJSON = Pattern.compile("<script[^>]*type\\s*=\\s*[\"']application/ld\\+json[\"'][^>]*>(.*?)</script>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    static String sinEntidades(String s) {
        if (s == null) return null;
        String r = s.replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ");
        Matcher m = Pattern.compile("&#(x?)([0-9a-fA-F]+);").matcher(r);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            int cp;
            try { cp = Integer.parseInt(m.group(2), m.group(1).isEmpty() ? 10 : 16); } catch (NumberFormatException e) { cp = '?'; }
            m.appendReplacement(sb, Matcher.quoteReplacement(Character.isValidCodePoint(cp) ? new String(Character.toChars(cp)) : "?"));
        }
        m.appendTail(sb);
        return sb.toString().replaceAll("\\s+", " ").trim();
    }

    /** Los datos para citar una página web: titulo, autores, fecha, sitio, tipo… */
    @SuppressWarnings("unchecked")
    Map<String, Object> datosDePagina(String html, String url) {
        String cab = html.length() > 400_000 ? html.substring(0, 400_000) : html;
        Map<String, List<String>> metas = new LinkedHashMap<>();
        Matcher m = META.matcher(cab);
        while (m.find()) {
            Map<String, String> at = new LinkedHashMap<>();
            Matcher a = ATRIB.matcher(m.group());
            while (a.find()) at.put(a.group(1).toLowerCase(Locale.ROOT), a.group(2) != null ? a.group(2) : a.group(3) != null ? a.group(3) : a.group(4));
            String k = at.getOrDefault("name", at.getOrDefault("property", at.get("itemprop")));
            String v = at.get("content");
            if (k != null && v != null && !v.isBlank()) metas.computeIfAbsent(k.toLowerCase(Locale.ROOT), x -> new ArrayList<>()).add(sinEntidades(v));
        }
        java.util.function.Function<String[], String> primero = (ks) -> { for (String k : ks) { List<String> l = metas.get(k); if (l != null && !l.isEmpty()) return l.get(0); } return null; };
        // Datos estructurados (schema.org)
        String ldTitulo = null, ldFecha = null, ldEditor = null, ldTipo = null;
        List<String> ldAutores = new ArrayList<>();
        Matcher ld = LDJSON.matcher(cab);
        while (ld.find()) {
            try {
                Object o = json.leer(ld.group(1).trim());
                List<Object> nodos = new ArrayList<>();
                if (o instanceof List<?> l) nodos.addAll(l); else nodos.add(o);
                for (int i = 0; i < nodos.size() && i < 40; i++) {
                    if (!(nodos.get(i) instanceof Map<?, ?> n)) continue;
                    if (n.get("@graph") instanceof List<?> g) nodos.addAll(g);
                    String tipo = texto(n.get("@type"));
                    if (tipo == null || !tipo.matches("(?i).*(article|posting|webpage|book|video|report|thesis|creativework).*")) continue;
                    if (ldTipo == null) ldTipo = tipo;
                    if (ldTitulo == null) ldTitulo = texto(n.get("headline") != null ? n.get("headline") : n.get("name"));
                    if (ldFecha == null) ldFecha = texto(n.get("datePublished") != null ? n.get("datePublished") : n.get("dateCreated"));
                    Object au = n.get("author");
                    List<Object> as = au instanceof List<?> l2 ? new ArrayList<>(l2) : au == null ? List.of() : List.of(au);
                    for (Object x : as) {
                        String nom = x instanceof Map<?, ?> xm ? texto(xm.get("name")) : texto(x);
                        if (nom != null && !nom.startsWith("http") && ldAutores.size() < 20) ldAutores.add(sinEntidades(nom));
                    }
                    if (ldEditor == null && n.get("publisher") instanceof Map<?, ?> p) ldEditor = texto(p.get("name"));
                }
            } catch (RuntimeException ignorado) { /* JSON-LD mal hecho: se ignora */ }
        }
        Map<String, Object> f = new LinkedHashMap<>();
        String host = "";
        try { host = new URI(url).getHost().replaceFirst("^www\\.", ""); } catch (Exception ignorado) { }
        String titulo = primero.apply(new String[] { "citation_title", "og:title", "twitter:title", "dc.title" });
        if (titulo == null) titulo = ldTitulo;
        if (titulo == null) { Matcher t = TITULO.matcher(cab); if (t.find()) titulo = sinEntidades(t.group(1)); }
        poner(f, "titulo", titulo);
        List<String> autores = new ArrayList<>(metas.getOrDefault("citation_author", List.of()));
        if (autores.isEmpty()) autores.addAll(ldAutores);
        if (autores.isEmpty()) {
            String a = primero.apply(new String[] { "author", "article:author", "dc.creator", "parsely-author", "sailthru.author" });
            if (a != null && !a.startsWith("http")) autores.addAll(Arrays.asList(a.split("\\s*(?:;|\\by\\b|\\band\\b|&)\\s*")));
        }
        if (autores.isEmpty() && host.matches("(?i)(m\\.)?youtube\\.com|youtu\\.be")) {
            Matcher yt = Pattern.compile("itemprop=\"author\"[\\s\\S]{0,400}?itemprop=\"name\" content=\"([^\"]+)\"").matcher(cab);
            if (yt.find()) autores.add(sinEntidades(yt.group(1)));
        }
        List<Map<String, Object>> as = new ArrayList<>();
        for (String a : autores) { Map<String, Object> x = autor(a); if (x != null && as.size() < 20) as.add(x); }
        if (!as.isEmpty()) f.put("autores", as);
        String fecha = primero.apply(new String[] { "citation_publication_date", "citation_date", "article:published_time", "dc.date", "date", "pubdate", "publish-date", "og:updated_time" });
        if (fecha == null) fecha = ldFecha;
        poner(f, "fecha", fechaDe(fecha));
        poner(f, "anio", anioDe(fecha));
        String revista = primero.apply(new String[] { "citation_journal_title" });
        String isbn = primero.apply(new String[] { "citation_isbn" });
        String sitio = primero.apply(new String[] { "og:site_name", "application-name" });
        if (sitio == null) sitio = ldEditor;
        poner(f, "sitio", sitio != null ? sitio : host);
        poner(f, "editorial", primero.apply(new String[] { "citation_publisher", "dc.publisher" }));
        poner(f, "descripcion", primero.apply(new String[] { "description", "og:description", "twitter:description" }));
        String doi = primero.apply(new String[] { "citation_doi" });
        if (doi != null) poner(f, "doi", doi.replaceFirst("(?i)^(https?://(dx\\.)?doi\\.org/|doi:)", ""));
        if (revista != null) {
            f.put("tipo", "articulo");
            poner(f, "revista", revista);
            poner(f, "volumen", primero.apply(new String[] { "citation_volume" }));
            poner(f, "numero", primero.apply(new String[] { "citation_issue" }));
            String p1 = primero.apply(new String[] { "citation_firstpage" }), p2 = primero.apply(new String[] { "citation_lastpage" });
            if (p1 != null) poner(f, "paginas", p2 != null ? p1 + "–" + p2 : p1);
        } else if (isbn != null) {
            f.put("tipo", "libro");
            poner(f, "isbn", isbn);
        } else if (host.matches("(?i)(m\\.)?youtube\\.com|youtu\\.be|vimeo\\.com") || String.valueOf(primero.apply(new String[] { "og:type" })).startsWith("video")) {
            f.put("tipo", "video");
            poner(f, "medio", host.contains("vimeo") ? "Vimeo" : "YouTube");
        } else if (host.endsWith("wikipedia.org")) {
            f.put("tipo", "enciclopedia");
            poner(f, "sitio", "Wikipedia, la enciclopedia libre");
        } else f.put("tipo", "web");
        poner(f, "url", url);
        f.put("consultado", hoy());
        return f;
    }

    /** Los datos de una pagina web para citarla (protegido contra direcciones internas). */
    public Map<String, Object> web(Usuario u, String url) {
        limitar(u);
        Leido l = leer(url);
        if (!l.tipo.toLowerCase(Locale.ROOT).contains("html") && !l.texto.trim().startsWith("<")) {
            Map<String, Object> f = new LinkedHashMap<>();
            f.put("tipo", "web");
            poner(f, "url", l.url);
            try { poner(f, "sitio", new URI(l.url).getHost().replaceFirst("^www\\.", "")); } catch (Exception ignorado) { }
            f.put("consultado", hoy());
            return Map.of("fuente", f);
        }
        return Map.of("fuente", datosDePagina(l.texto, l.url));
    }

    // ------------------------------------------------------------ DOI (Crossref) e ISBN (Open Library)

    @SuppressWarnings("unchecked")
    private static Map<String, Object> deCrossref(Map<String, Object> it) {
        Map<String, Object> f = new LinkedHashMap<>();
        String tipo = String.valueOf(it.get("type"));
        f.put("tipo", tipo.contains("book") ? (tipo.equals("book-chapter") ? "capitulo" : "libro") : "articulo");
        poner(f, "titulo", texto(it.get("title")));
        List<Map<String, Object>> as = new ArrayList<>();
        if (it.get("author") instanceof List<?> l) for (Object o : l) {
            if (!(o instanceof Map<?, ?> a) || as.size() >= 25) continue;
            Map<String, Object> x = new LinkedHashMap<>();
            if (a.get("family") != null) { x.put("familia", String.valueOf(a.get("family"))); if (a.get("given") != null) x.put("nombres", String.valueOf(a.get("given"))); }
            else if (a.get("name") != null) x.put("literal", String.valueOf(a.get("name")));
            if (!x.isEmpty()) as.add(x);
        }
        if (!as.isEmpty()) f.put("autores", as);
        Object issued = it.get("issued") instanceof Map<?, ?> m ? m.get("date-parts") : null;
        if (issued instanceof List<?> dp && !dp.isEmpty() && dp.get(0) instanceof List<?> p && !p.isEmpty() && p.get(0) != null) {
            poner(f, "anio", String.valueOf(((Number) p.get(0)).intValue()));
            if (p.size() >= 3) f.put("fecha", String.format("%04d-%02d-%02d", ((Number) p.get(0)).intValue(), ((Number) p.get(1)).intValue(), ((Number) p.get(2)).intValue()));
        }
        String cont = texto(it.get("container-title"));
        if ("capitulo".equals(f.get("tipo"))) poner(f, "capitulo", cont); else poner(f, "revista", cont);
        poner(f, "volumen", it.get("volume"));
        poner(f, "numero", it.get("issue"));
        poner(f, "paginas", it.get("page") == null ? null : String.valueOf(it.get("page")).replace("-", "–"));
        poner(f, "editorial", it.get("publisher"));
        poner(f, "doi", it.get("DOI"));
        if (it.get("DOI") != null) f.put("url", "https://doi.org/" + it.get("DOI"));
        if (it.get("ISBN") instanceof List<?> is && !is.isEmpty()) poner(f, "isbn", is.get(0));
        f.put("consultado", hoy());
        return f;
    }

    public Map<String, Object> porDoi(Usuario u, String doi) {
        limitar(u);
        String d = doi == null ? "" : doi.trim().replaceFirst("(?i)^(https?://(dx\\.)?doi\\.org/|doi:\\s*)", "");
        if (!d.matches("10\\.\\d{4,9}/\\S+")) throw ErrorNom.invalido("Ese DOI no parece válido (empieza con 10.)", "doi");
        Map<String, Object> r = leerJson("https://api.crossref.org/works/" + c(d));
        if (!(r.get("message") instanceof Map<?, ?> msg)) throw new ErrorNom(ErrorNom.NO_EXISTE, "No se encontró ese DOI");
        @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) msg;
        return Map.of("fuente", deCrossref(m));
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> porIsbn(Usuario u, String isbn) {
        limitar(u);
        String i = isbn == null ? "" : isbn.replaceAll("[^0-9Xx]", "").toUpperCase(Locale.ROOT);
        if (i.length() != 10 && i.length() != 13) throw ErrorNom.invalido("El ISBN tiene 10 o 13 dígitos", "isbn");
        Map<String, Object> r = leerJson("https://openlibrary.org/api/books?bibkeys=ISBN:" + i + "&format=json&jscmd=data");
        if (!(r.get("ISBN:" + i) instanceof Map<?, ?> libro)) throw new ErrorNom(ErrorNom.NO_EXISTE, "No se encontró ese ISBN en Open Library: escribe los datos a mano");
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("tipo", "libro");
        String titulo = texto(libro.get("title"));
        String sub = texto(libro.get("subtitle"));
        poner(f, "titulo", sub != null ? titulo + ": " + sub : titulo);
        List<Map<String, Object>> as = new ArrayList<>();
        if (libro.get("authors") instanceof List<?> l) for (Object o : l) if (o instanceof Map<?, ?> a && as.size() < 20) { Map<String, Object> x = autor(texto(a.get("name"))); if (x != null) as.add(x); }
        if (!as.isEmpty()) f.put("autores", as);
        poner(f, "anio", anioDe(texto(libro.get("publish_date"))));
        if (libro.get("publishers") instanceof List<?> ps && !ps.isEmpty() && ps.get(0) instanceof Map<?, ?> p) poner(f, "editorial", texto(p.get("name")));
        poner(f, "isbn", i);
        poner(f, "url", libro.get("url"));
        f.put("consultado", hoy());
        return Map.of("fuente", f);
    }

    // ------------------------------------------------------------ buscar y leer Wikipedia

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> buscar(Usuario u, String q, String donde) {
        limitar(u);
        String consulta = q == null ? "" : q.trim();
        if (consulta.length() < 2) throw ErrorNom.invalido("Escribe qué quieres buscar", "q");
        if (consulta.length() > 200) consulta = consulta.substring(0, 200);
        List<Map<String, Object>> r = new ArrayList<>();
        switch (donde == null ? "wikipedia" : donde) {
            case "libros" -> {
                Map<String, Object> res = leerJson("https://openlibrary.org/search.json?limit=10&fields=title,author_name,first_publish_year,publisher,isbn,key&q=" + c(consulta));
                if (res.get("docs") instanceof List<?> l) for (Object o : l) {
                    if (!(o instanceof Map<?, ?> d)) continue;
                    Map<String, Object> f = new LinkedHashMap<>();
                    f.put("tipo", "libro");
                    poner(f, "titulo", texto(d.get("title")));
                    List<Map<String, Object>> as = new ArrayList<>();
                    if (d.get("author_name") instanceof List<?> an) for (Object a : an) { Map<String, Object> x = autor(String.valueOf(a)); if (x != null && as.size() < 8) as.add(x); }
                    if (!as.isEmpty()) f.put("autores", as);
                    if (d.get("first_publish_year") != null) poner(f, "anio", String.valueOf(((Number) d.get("first_publish_year")).intValue()));
                    poner(f, "editorial", texto(d.get("publisher")));
                    poner(f, "isbn", texto(d.get("isbn")));
                    if (d.get("key") != null) poner(f, "url", "https://openlibrary.org" + d.get("key"));
                    f.put("consultado", hoy());
                    r.add(Map.of("fuente", f));
                }
            }
            case "articulos" -> {
                Map<String, Object> res = leerJson("https://api.crossref.org/works?rows=10&select=DOI,title,author,issued,container-title,type,publisher,volume,issue,page&query=" + c(consulta));
                if (res.get("message") instanceof Map<?, ?> msg && msg.get("items") instanceof List<?> l) for (Object o : l)
                    if (o instanceof Map<?, ?> it) r.add(Map.of("fuente", deCrossref((Map<String, Object>) it)));
            }
            default -> {
                Map<String, Object> res = leerJson("https://es.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&srlimit=10&srsearch=" + c(consulta));
                if (res.get("query") instanceof Map<?, ?> qq && qq.get("search") instanceof List<?> l) for (Object o : l) {
                    if (!(o instanceof Map<?, ?> s)) continue;
                    Map<String, Object> x = new LinkedHashMap<>();
                    String titulo = String.valueOf(s.get("title"));
                    x.put("titulo", titulo);
                    x.put("resumen", sinEntidades(String.valueOf(s.get("snippet")).replaceAll("<[^>]*>", "")));
                    x.put("url", "https://es.wikipedia.org/wiki/" + c(titulo.replace(' ', '_')).replace("+", "%20"));
                    r.add(x);
                }
            }
        }
        return r;
    }

    /** Un articulo de Wikipedia en español: su texto (para leer y hacer fichas) y la referencia. */
    public Map<String, Object> wikipedia(Usuario u, String titulo) {
        limitar(u);
        if (titulo == null || titulo.isBlank()) throw ErrorNom.invalido("¿Qué artículo?", "titulo");
        Map<String, Object> res = leerJson("https://es.wikipedia.org/w/api.php?action=query&prop=extracts%7Cinfo&explaintext=1&exsectionformat=wiki&inprop=url&redirects=1&format=json&utf8=1&titles=" + c(titulo.trim()));
        if (!(res.get("query") instanceof Map<?, ?> q) || !(q.get("pages") instanceof Map<?, ?> pages) || pages.isEmpty())
            throw new ErrorNom(ErrorNom.NO_EXISTE, "No se encontró ese artículo");
        Object p0 = pages.values().iterator().next();
        if (!(p0 instanceof Map<?, ?> p) || p.containsKey("missing")) throw new ErrorNom(ErrorNom.NO_EXISTE, "No se encontró ese artículo");
        String texto = String.valueOf(p.get("extract") == null ? "" : p.get("extract"));
        if (texto.length() > MAX_TEXTO) texto = texto.substring(0, MAX_TEXTO) + "…";
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("tipo", "enciclopedia");
        poner(f, "titulo", texto(p.get("title")));
        poner(f, "sitio", "Wikipedia, la enciclopedia libre");
        poner(f, "fecha", fechaDe(texto(p.get("touched"))));
        poner(f, "anio", anioDe(texto(p.get("touched"))));
        poner(f, "url", texto(p.get("fullurl")));
        f.put("consultado", hoy());
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("fuente", f);
        r.put("texto", texto);
        return r;
    }

    // ------------------------------------------------------------ datos publicos de Wikidata (experimento)

    /** Solo consultas fijas (nadie puede mandarle al servidor una consulta propia). */
    private static final Map<String, String[]> CONJUNTOS = new LinkedHashMap<>();
    static {
        CONJUNTOS.put("estados-mexico", new String[] { "Estados de México: capital y población",
                "SELECT ?estadoLabel ?capitalLabel (MAX(?p) AS ?poblacion) WHERE { ?estado wdt:P31 wd:Q15149663. FILTER NOT EXISTS { ?estado wdt:P576 ?fin. } OPTIONAL { ?estado wdt:P36 ?capital. } OPTIONAL { ?estado wdt:P1082 ?p. } SERVICE wikibase:label { bd:serviceParam wikibase:language \"es\". } } GROUP BY ?estadoLabel ?capitalLabel ORDER BY ?estadoLabel",
                "Estado|Capital|Población" });
        CONJUNTOS.put("paises-america", new String[] { "Países de América: capital y población",
                "SELECT ?paisLabel ?capitalLabel (MAX(?p) AS ?poblacion) WHERE { ?pais wdt:P31 wd:Q3624078; wdt:P30 ?c. VALUES ?c { wd:Q49 wd:Q18 } FILTER NOT EXISTS { ?pais wdt:P576 ?fin. } OPTIONAL { ?pais wdt:P36 ?capital. } OPTIONAL { ?pais wdt:P1082 ?p. } SERVICE wikibase:label { bd:serviceParam wikibase:language \"es\". } } GROUP BY ?paisLabel ?capitalLabel ORDER BY DESC(?poblacion)",
                "País|Capital|Población" });
        CONJUNTOS.put("elementos", new String[] { "Elementos químicos: número, símbolo y masa",
                "SELECT ?numero (SAMPLE(?s) AS ?simbolo) (SAMPLE(?nombre) AS ?elemento) (MAX(?m) AS ?masa) WHERE { ?e wdt:P31 wd:Q11344; wdt:P1086 ?numero; wdt:P246 ?s. FILTER(?numero >= 1 && ?numero <= 118) OPTIONAL { ?e wdt:P2067 ?m. } OPTIONAL { ?e rdfs:label ?nombre. FILTER(LANG(?nombre) = \"es\") } } GROUP BY ?numero ORDER BY ?numero",
                "Número|Símbolo|Elemento|Masa atómica" });
        // Los 8 planetas; las medidas vienen normalizadas (metros, kilogramos, segundos) y se pasan a unidades de escuela.
        CONJUNTOS.put("planetas", new String[] { "Planetas del sistema solar",
                "SELECT ?planetaLabel (ROUND(MAX(?r) / 1000) AS ?radio) (ROUND(MAX(?m) / 1e21) / 1000 AS ?masa) (ROUND(MAX(?t) / 86400) AS ?periodo) WHERE { VALUES ?planeta { wd:Q308 wd:Q313 wd:Q2 wd:Q111 wd:Q319 wd:Q193 wd:Q324 wd:Q332 } OPTIONAL { ?planeta p:P2120/psn:P2120/wikibase:quantityAmount ?r. } OPTIONAL { ?planeta p:P2067/psn:P2067/wikibase:quantityAmount ?m. } OPTIONAL { ?planeta p:P2146/psn:P2146/wikibase:quantityAmount ?t. } SERVICE wikibase:label { bd:serviceParam wikibase:language \"es\". } } GROUP BY ?planetaLabel ORDER BY ?periodo",
                "Planeta|Radio (km)|Masa (× 10²⁴ kg)|Vuelta al Sol (días)" });
        CONJUNTOS.put("paises-poblacion", new String[] { "Los 30 países con más población",
                "SELECT ?paisLabel (MAX(?p) AS ?poblacion) WHERE { ?pais wdt:P31 wd:Q3624078; wdt:P1082 ?p. FILTER NOT EXISTS { ?pais wdt:P576 ?fin. } SERVICE wikibase:label { bd:serviceParam wikibase:language \"es\". } } GROUP BY ?paisLabel ORDER BY DESC(?poblacion) LIMIT 30",
                "País|Población" });
    }

    public List<Map<String, Object>> conjuntos() {
        List<Map<String, Object>> r = new ArrayList<>();
        CONJUNTOS.forEach((k, v) -> r.add(Map.of("id", k, "titulo", v[0])));
        return r;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> wikidata(Usuario u, String conjunto) {
        limitar(u);
        String[] c = CONJUNTOS.get(conjunto == null ? "" : conjunto);
        if (c == null) throw ErrorNom.invalido("Ese conjunto de datos no existe", "conjunto");
        Map<String, Object> res = leerJson("https://query.wikidata.org/sparql?format=json&query=" + c(c[1]));
        List<String> vars = new ArrayList<>();
        if (res.get("head") instanceof Map<?, ?> h && h.get("vars") instanceof List<?> vs) for (Object v : vs) vars.add(String.valueOf(v));
        List<List<String>> filas = new ArrayList<>();
        if (res.get("results") instanceof Map<?, ?> rs && rs.get("bindings") instanceof List<?> bs) for (Object o : bs) {
            if (!(o instanceof Map<?, ?> b) || filas.size() >= 300) continue;
            List<String> fila = new ArrayList<>();
            for (String v : vars) {
                Object cel = b.get(v);
                String val = cel instanceof Map<?, ?> cm ? String.valueOf(cm.get("value")) : "";
                // Números enteros sin ".0" y decimales cortos.
                if (val.matches("-?\\d+\\.0+")) val = val.replaceAll("\\.0+$", "");
                else if (val.matches("-?\\d+\\.\\d{4,}")) val = String.valueOf(Math.round(Double.parseDouble(val) * 1000) / 1000.0);
                fila.add(val.startsWith("http://www.wikidata.org/entity/") ? "" : val);
            }
            filas.add(fila);
        }
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("tipo", "web");
        f.put("titulo", c[0]);
        f.put("sitio", "Wikidata");
        f.put("url", "https://www.wikidata.org");
        f.put("consultado", hoy());
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("titulo", c[0]);
        r.put("columnas", Arrays.asList(c[2].split("\\|")));
        r.put("filas", filas);
        r.put("fuente", f);
        return r;
    }

    // ------------------------------------------------------------ biblioteca del espacio

    /** Una fuente que llega del cliente: solo los campos conocidos, textos cortos. */
    @SuppressWarnings("unchecked")
    static Map<String, Object> limpiarFuente(Object o) {
        if (!(o instanceof Map<?, ?> m)) throw ErrorNom.invalido("Faltan los datos de la fuente", "fuente");
        Map<String, Object> f = new LinkedHashMap<>();
        for (var e : m.entrySet()) {
            String k = String.valueOf(e.getKey());
            if (CAMPOS.contains(k) && e.getValue() != null && !(e.getValue() instanceof Map) && !(e.getValue() instanceof List)) poner(f, k, String.valueOf(e.getValue()));
        }
        if (m.get("autores") instanceof List<?> l) {
            List<Map<String, Object>> as = new ArrayList<>();
            for (Object a : l) {
                if (!(a instanceof Map<?, ?> am) || as.size() >= 30) continue;
                Map<String, Object> x = new LinkedHashMap<>();
                for (String k : List.of("familia", "nombres", "literal")) if (am.get(k) != null) { String v = String.valueOf(am.get(k)).trim(); if (!v.isEmpty()) x.put(k, v.length() > 200 ? v.substring(0, 200) : v); }
                if (!x.isEmpty()) as.add(x);
            }
            if (!as.isEmpty()) f.put("autores", as);
        }
        if (f.get("titulo") == null && f.get("url") == null) throw ErrorNom.invalido("La fuente necesita al menos un título o una dirección", "titulo");
        return f;
    }

    private static Map<String, Object> sinTexto(Map<String, Object> it) {
        Map<String, Object> r = new LinkedHashMap<>(it);
        Object t = r.remove("texto");
        r.put("largo", t == null ? 0 : String.valueOf(t).length());
        return r;
    }

    public List<Map<String, Object>> biblioteca(Usuario u, String espacioId) {
        espacios.exigir(espacios.requerir(espacioId), u, Permiso.LECTURA);
        List<Map<String, Object>> r = new ArrayList<>();
        for (Map<String, Object> it : repo.biblioteca(espacioId)) r.add(sinTexto(it));
        return r;
    }

    public Map<String, Object> deBiblioteca(Usuario u, String espacioId, String id) {
        espacios.exigir(espacios.requerir(espacioId), u, Permiso.LECTURA);
        for (Map<String, Object> it : repo.biblioteca(espacioId)) if (String.valueOf(it.get("id")).equals(id)) return it;
        throw ErrorNom.noEncontrado("Esa fuente");
    }

    private static String clave(Map<String, Object> f) {
        Object k = f.get("doi") != null ? f.get("doi") : f.get("isbn") != null ? f.get("isbn") : f.get("url") != null ? f.get("url") : f.get("titulo");
        return String.valueOf(k).toLowerCase(Locale.ROOT);
    }

    /** Guarda una fuente (y, si se quiere, su texto) para que el equipo la consulte aunque no haya Internet. */
    public synchronized Map<String, Object> guardarEnBiblioteca(Usuario u, String espacioId, Map<String, Object> cuerpo) {
        espacios.exigir(espacios.requerir(espacioId), u, Permiso.EDICION);
        Map<String, Object> f = limpiarFuente(cuerpo == null ? null : cuerpo.get("fuente"));
        String texto = cuerpo.get("texto") == null ? null : String.valueOf(cuerpo.get("texto"));
        if (texto != null && texto.length() > MAX_TEXTO) texto = texto.substring(0, MAX_TEXTO);
        List<Map<String, Object>> l = new ArrayList<>(repo.biblioteca(espacioId));
        String k = clave(f);
        for (Map<String, Object> it : l) {
            if (it.get("fuente") instanceof Map<?, ?> fm && clave((Map<String, Object>) fm).equals(k)) {
                // Ya estaba: se actualiza (por ejemplo, ahora con su texto).
                it.put("fuente", f);
                if (texto != null && !texto.isBlank()) it.put("texto", texto);
                repo.guardarBiblioteca(espacioId, l);
                return sinTexto(it);
            }
        }
        if (l.size() >= MAX_BIBLIOTECA) throw new ErrorNom(ErrorNom.LLENO, "La biblioteca del espacio ya tiene " + MAX_BIBLIOTECA + " fuentes: quita alguna que ya no usen");
        Map<String, Object> it = new LinkedHashMap<>();
        it.put("id", cifrado.id());
        it.put("fuente", f);
        if (texto != null && !texto.isBlank()) it.put("texto", texto);
        it.put("agregadoPor", u.nombre);
        it.put("t", System.currentTimeMillis());
        l.add(0, it);
        repo.guardarBiblioteca(espacioId, l);
        log.detalle("Biblioteca de {}: {} fuentes", espacioId, l.size());
        return sinTexto(it);
    }

    public synchronized Map<String, Object> quitarDeBiblioteca(Usuario u, String espacioId, String id) {
        espacios.exigir(espacios.requerir(espacioId), u, Permiso.EDICION);
        List<Map<String, Object>> l = new ArrayList<>(repo.biblioteca(espacioId));
        if (!l.removeIf(it -> String.valueOf(it.get("id")).equals(id))) throw ErrorNom.noEncontrado("Esa fuente");
        repo.guardarBiblioteca(espacioId, l);
        return Map.of("ok", true);
    }

    private static String normal(String s) {
        return Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
    }

    /** Buscar en la biblioteca del espacio (titulos y textos guardados): funciona sin Internet. */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> buscarEnBiblioteca(Usuario u, String espacioId, String q) {
        espacios.exigir(espacios.requerir(espacioId), u, Permiso.LECTURA);
        String a = normal(q).trim();
        List<Map<String, Object>> r = new ArrayList<>();
        for (Map<String, Object> it : repo.biblioteca(espacioId)) {
            Map<String, Object> f = it.get("fuente") instanceof Map<?, ?> fm ? (Map<String, Object>) fm : Map.of();
            String titulo = String.valueOf(f.getOrDefault("titulo", "")), texto = String.valueOf(it.getOrDefault("texto", ""));
            if (!a.isEmpty() && !normal(titulo).contains(a) && !normal(texto).contains(a)) continue;
            Map<String, Object> x = sinTexto(it);
            if (!a.isEmpty()) {
                // Normalizar quita los acentos sin cambiar el largo en casi todo el español: se busca en el texto normalizado.
                String n = normal(texto);
                int i = n.indexOf(a);
                if (i >= 0 && n.length() == texto.length()) x.put("fragmento", "…" + texto.substring(Math.max(0, i - 80), Math.min(texto.length(), i + a.length() + 120)).replaceAll("\\s+", " ") + "…");
            }
            r.add(x);
        }
        return r;
    }
}
