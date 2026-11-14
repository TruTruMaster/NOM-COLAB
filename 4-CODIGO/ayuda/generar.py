#!/usr/bin/env python3
"""Genera el sitio de ayuda y legal de NOM-COLAB (fase 14, parte F) como HTML estático.

    python3 4-CODIGO/ayuda/generar.py

Lee  4-CODIGO/ayuda/contenido/<sección>/<artículo>.md  (Markdown con una cabecera entre ---)
y escribe app/src/main/resources/static/ayuda/ y static/legal/, más robots.txt, sitemap.xml y
.well-known/security.txt. El HTML generado se sube al repositorio: compilar el jar o el APK no
necesita Python. Solo usa la biblioteca estándar.

Cabecera de cada artículo:
    titulo: …          descripcion: …          orden: 10
    aplica: Navegador, App Android, Teléfono que comparte
    actualizado: 2026-11-13          version: 0.13.0

Markdown que entiende: ## y ### (con su ancla), párrafos, listas (- y 1.), **negrita**, *cursiva*,
`código`, tablas con |, > notas, !> avisos y enlaces. Los enlaces internos se escriben
[texto](ayuda:seccion/articulo#ancla), [texto](legal:pagina) o [texto](app:) y el generador los
convierte en rutas relativas que terminan en index.html (así funcionan en el servidor, en el
teléfono que comparte y dentro de la app, desde sus archivos). Un enlace a un artículo que no
existe detiene el generador.
"""
import html, json, os, re, sys, unicodedata, datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
CONTENIDO = os.path.join(AQUI, "contenido")
STATIC = os.path.normpath(os.path.join(AQUI, "..", "app", "src", "main", "resources", "static"))
FORMULAS = os.path.join(STATIC, "js", "formulas.js")
SW = os.path.join(STATIC, "sw.js")
PUBLICO = "https://nomcolab.dpdns.org"
REPO = "https://github.com/TruTruMaster/NOM-COLAB"
VERSION = "0.13.1"

# Datos del responsable y contacto (un solo lugar). G.2: el equipo todavía no crea el correo del
# proyecto; mientras, el contacto es por GitHub (reportes y avisos privados de seguridad).
CONTACTO = {
    "responsable": "Equipo 6 «WACK», grupo 5IM7 del CECyT 9 «Juan de Dios Bátiz» del IPN",
    "correo": None,
    "reportes": REPO + "/issues",
    "seguridad": REPO + "/security/advisories/new",
}

SECCIONES = [
    ("empezar", "Empezar", "Qué es NOM-COLAB, crear tu cuenta e instalarlo"),
    ("sin-internet", "Sin Internet", "Trabajar juntos sin Internet: alias, ramas y el teléfono que comparte"),
    ("espacios", "Espacios y equipo", "Espacios, permisos, invitar, versiones y ramas"),
    ("editores", "Editores", "Texto, hojas, presentaciones, diagramas y la ruedita"),
    ("office", "Word, Excel y PowerPoint", "Abrir y descargar archivos de Office y el formato .nom"),
    ("cuentas", "Cuentas y datos", "Contraseña, cifrado, tus datos y borrar la cuenta"),
    ("problemas", "Problemas", "Cuando algo no sale como esperabas"),
    ("preguntas-frecuentes", "Preguntas frecuentes", "Las 32 dudas más comunes"),
    ("novedades", "Novedades", "Qué cambió en cada versión"),
    ("acerca", "Acerca de", "El proyecto, el código y el contacto"),
]
LEGAL = "legal"
TITULO_LEGAL = "Legal y privacidad"


def slug(t):
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def sin_acentos(t):
    t = unicodedata.normalize("NFD", t.lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


# ---------------------------------------------------------------- lectura
def leer_articulo(ruta):
    texto = open(ruta, encoding="utf-8").read()
    meta, cuerpo = {}, texto
    if texto.startswith("---"):
        fin = texto.index("\n---", 3)
        for linea in texto[3:fin].strip().splitlines():
            if ":" in linea:
                k, v = linea.split(":", 1)
                meta[k.strip()] = v.strip()
        cuerpo = texto[fin + 4:].lstrip("\n")
    return meta, cuerpo


def cargar():
    """[(clave, titulo, desc, [articulos])] y {clave_articulo: articulo}."""
    secciones, todos = [], {}
    for clave, titulo, desc in SECCIONES + [(LEGAL, TITULO_LEGAL, "Aviso de privacidad, términos y licencias")]:
        carpeta = os.path.join(CONTENIDO, clave)
        arts = []
        if os.path.isdir(carpeta):
            for f in sorted(os.listdir(carpeta)):
                if not f.endswith(".md"): continue
                meta, cuerpo = leer_articulo(os.path.join(carpeta, f))
                nombre = f[:-3]
                a = {"seccion": clave, "nombre": nombre, "meta": meta, "cuerpo": cuerpo,
                     "titulo": meta.get("titulo", nombre), "orden": int(meta.get("orden", "50"))}
                arts.append(a)
                todos[(clave, nombre)] = a
        arts.sort(key=lambda a: (a["orden"], a["titulo"]))
        secciones.append((clave, titulo, desc, arts))
    return secciones, todos


# ---------------------------------------------------------------- rutas
def ruta_de(seccion, nombre=None):
    """Ruta (dentro de static/) del index.html de una sección, artículo o página legal."""
    base = LEGAL if seccion == LEGAL else os.path.join("ayuda", seccion) if seccion else "ayuda"
    if seccion == "_inicio": base = "ayuda"
    if seccion == "_legal": base = LEGAL
    if nombre and nombre != "index": base = os.path.join(base, nombre)
    return os.path.join(base, "index.html")


def relativo(desde, hasta):
    return os.path.relpath(hasta, os.path.dirname(desde)).replace(os.sep, "/")


# ---------------------------------------------------------------- Markdown
class Rotos(Exception):
    pass


def enlace(dest, desde, todos):
    if dest.startswith("ayuda:") or dest.startswith("legal:"):
        tipo, resto = dest.split(":", 1)
        ancla = ""
        if "#" in resto: resto, ancla = resto.split("#", 1); ancla = "#" + ancla
        if tipo == "legal":
            if not resto: return relativo(desde, ruta_de("_legal")) + ancla, False
            if (LEGAL, resto) not in todos: raise Rotos(f"{desde}: no existe legal:{resto}")
            return relativo(desde, ruta_de(LEGAL, resto)) + ancla, False
        if not resto: return relativo(desde, ruta_de("_inicio")) + ancla, False
        partes = resto.split("/")
        if len(partes) == 1:
            if partes[0] not in [s[0] for s in SECCIONES]: raise Rotos(f"{desde}: no existe la sección ayuda:{resto}")
            return relativo(desde, ruta_de(partes[0])) + ancla, False
        if (partes[0], partes[1]) not in todos: raise Rotos(f"{desde}: no existe ayuda:{resto}")
        return relativo(desde, ruta_de(partes[0], partes[1])) + ancla, False
    if dest.startswith("app:"):
        return relativo(desde, "index.html") + dest[4:], False
    if dest.startswith("archivo:"):
        return relativo(desde, dest[8:]), False
    if re.match(r"^(https?:|mailto:)", dest): return dest, True
    if dest.startswith("#"): return dest, False
    raise Rotos(f"{desde}: enlace sin tipo: {dest}")


def en_linea(t, desde, todos):
    """Negrita, cursiva, código y enlaces dentro de una línea (lo demás se escapa)."""
    partes = re.split(r"(`[^`]+`)", t)
    out = []
    for p in partes:
        if p.startswith("`") and p.endswith("`") and len(p) > 1:
            out.append("<code>" + html.escape(p[1:-1]) + "</code>")
            continue
        s = html.escape(p, quote=False)
        def link(m):
            texto, dest = m.group(1), html.unescape(m.group(2))
            url, externo = enlace(dest, desde, todos)
            extra = ' target="_blank" rel="noopener"' if externo else ""
            return f'<a href="{html.escape(url)}"{extra}>{texto}</a>'
        s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, s)
        s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])", r"<em>\1</em>", s)
        s = re.sub(r"(?<![\w_])_([^_\s][^_]*?)_(?![\w_])", r"<em>\1</em>", s)
        out.append(s)
    return "".join(out)


def markdown(cuerpo, desde, todos, especiales):
    """Devuelve (html, [(id, título de h2)], texto plano)."""
    lineas = cuerpo.splitlines()
    out, toc, plano = [], [], []
    i = 0
    ids = set()

    def ident(t):
        b = slug(t) or "seccion"
        x, n = b, 2
        while x in ids: x = f"{b}-{n}"; n += 1
        ids.add(x)
        return x

    while i < len(lineas):
        l = lineas[i]
        if not l.strip(): i += 1; continue
        if l.strip() in especiales:
            out.append(especiales[l.strip()]()); i += 1; continue
        m = re.match(r"^(#{2,3})\s+(.*?)(\s*\{#([a-z0-9-]+)\})?\s*$", l)
        if m:
            nivel, t = len(m.group(1)), m.group(2)
            hid = m.group(4) or ident(t)
            if m.group(4): ids.add(hid)
            if nivel == 2: toc.append((hid, t))
            out.append(f'<h{nivel} id="{hid}">{en_linea(t, desde, todos)}<a class="ancla" href="#{hid}" aria-label="Enlace a esta parte">#</a></h{nivel}>')
            plano.append(t)
            i += 1; continue
        if l.startswith("|"):
            filas = []
            while i < len(lineas) and lineas[i].startswith("|"):
                filas.append([c.strip() for c in lineas[i].strip().strip("|").split("|")]); i += 1
            cab = filas[0]; cuerpo_t = [f for f in filas[2:]] if len(filas) > 1 and re.match(r"^[-: |]+$", "|".join(filas[1])) else filas[1:]
            h = '<div class="tabla"><table><thead><tr>' + "".join(f"<th>{en_linea(c, desde, todos)}</th>" for c in cab) + "</tr></thead><tbody>"
            for f in cuerpo_t: h += "<tr>" + "".join(f"<td>{en_linea(c, desde, todos)}</td>" for c in f) + "</tr>"
            out.append(h + "</tbody></table></div>")
            plano.extend(" ".join(f) for f in filas)
            continue
        if l.startswith(">") or l.startswith("!>"):
            clase = "aviso" if l.startswith("!>") else "nota"
            bloque = []
            while i < len(lineas) and (lineas[i].startswith(">") or lineas[i].startswith("!>")):
                bloque.append(re.sub(r"^!?>\s?", "", lineas[i])); i += 1
            out.append(f'<div class="{clase}"><p>' + en_linea(" ".join(bloque), desde, todos) + "</p></div>")
            plano.append(" ".join(bloque))
            continue
        if re.match(r"^(\s*)([-*]|\d+\.)\s+", l):
            ordenada = bool(re.match(r"^\s*\d+\.", l))
            items = []
            while i < len(lineas) and (re.match(r"^(\s*)([-*]|\d+\.)\s+", lineas[i]) or (lineas[i].startswith("  ") and lineas[i].strip() and items)):
                x = lineas[i]
                mm = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", x)
                if mm and len(mm.group(1)) < 2: items.append([mm.group(3), []])
                elif mm: items[-1][1].append(mm.group(3))
                else: items[-1][0] += " " + x.strip()
                i += 1
            tag = "ol" if ordenada else "ul"
            h = f"<{tag}>"
            for t, sub in items:
                h += "<li>" + en_linea(t, desde, todos)
                if sub: h += "<ul>" + "".join("<li>" + en_linea(s, desde, todos) + "</li>" for s in sub) + "</ul>"
                h += "</li>"
                plano.append(t); plano.extend(sub)
            out.append(h + f"</{tag}>")
            continue
        parrafo = [l.strip()]
        i += 1
        while i < len(lineas) and lineas[i].strip() and not re.match(r"^(#{2,3}\s|\||>|!>|\s*([-*]|\d+\.)\s)", lineas[i]) and lineas[i].strip() not in especiales:
            parrafo.append(lineas[i].strip()); i += 1
        out.append("<p>" + en_linea(" ".join(parrafo), desde, todos) + "</p>")
        plano.append(" ".join(parrafo))
    return "\n".join(out), toc, " ".join(plano)


# ---------------------------------------------------------------- piezas especiales
def tabla_formulas():
    js = open(FORMULAS, encoding="utf-8").read()
    i = js.index("const FIRMAS = {"); f = js.index("\n  };", i)
    firmas = re.findall(r'(?:"([A-ZÑ.]+)"|([A-ZÑ][A-ZÑ0-9.]*)):\s*\["((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\]', js[i:f])
    j = js.index("const ALIAS = {"); g = js.index("\n  };", j)
    alias = re.findall(r'(?:"([A-Z.]+)"|([A-Z][A-Z0-9.]*)):\s*"([A-ZÑÁÉÍÓÚ.]+)"', js[j:g])
    ingles = {}
    for a1, a2, es in alias:
        en = a1 or a2
        if es not in ingles and re.match(r"^[A-Z.]+$", en): ingles[es] = en
    filas = []
    for n1, n2, args, desc in firmas:
        n = n1 or n2
        args = args.replace('\\"', '"'); desc = desc.replace('\\"', '"')
        filas.append(f"<tr><td><code>{html.escape(n)}</code></td><td><code>{html.escape(ingles.get(n, n if n in ('MIN', 'MAX', 'ABS', 'PI', 'EXP', 'LN', 'LOG', 'LOG10', 'COS', 'TAN', 'VAR', 'VARP') else '—'))}</code></td><td><code>{html.escape(args)}</code></td><td>{html.escape(desc)}</td></tr>")
    return ('<div class="tabla"><table><thead><tr><th>Función</th><th>En inglés (Excel)</th><th>Qué pide</th><th>Qué hace</th></tr></thead><tbody>'
            + "".join(filas) + f"</tbody></table></div><p class=\"pie-tabla\">{len(filas)} funciones. Se escriben en español o en inglés; los argumentos se separan con <code>;</code> o con <code>,</code>.</p>")


def contacto_html():
    c = CONTACTO
    if c["correo"]:
        return f'<p>Escríbenos a <a href="mailto:{c["correo"]}">{c["correo"]}</a>.</p>'
    return (f'<p>Mientras el equipo crea el correo del proyecto, escríbenos abriendo un reporte en '
            f'<a href="{c["reportes"]}" target="_blank" rel="noopener">GitHub</a>. Para una falla de seguridad usa el '
            f'<a href="{c["seguridad"]}" target="_blank" rel="noopener">aviso privado de seguridad</a> (solo lo ve el equipo).</p>')


# ---------------------------------------------------------------- plantilla
LOGO = open(os.path.join(STATIC, "img", "icono.svg"), encoding="utf-8").read()
LOGO = re.sub(r"<\?xml[^>]*>", "", LOGO).strip().replace("<svg ", '<svg class="logo" aria-hidden="true" focusable="false" ', 1)
LOGO = re.sub(r'\sid="([^"]+)"', lambda m: f' id="ay-{m.group(1)}"', LOGO)
LOGO = re.sub(r'url\(#([^)]+)\)', lambda m: f"url(#ay-{m.group(1)})", LOGO)
LOGO = re.sub(r'href="#([^"]+)"', lambda m: f'href="#ay-{m.group(1)}"', LOGO)
CSP = ("default-src 'self' file:; script-src 'self' file:; style-src 'self' file: 'unsafe-inline'; img-src 'self' file: data:; "
       "font-src 'self' file: data:; connect-src 'self' file:; object-src 'none'; base-uri 'none'; form-action 'self'")


def fecha_larga(iso):
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    try:
        d = datetime.date.fromisoformat(iso)
        return f"{d.day} de {meses[d.month - 1]} de {d.year}"
    except ValueError:
        return iso


def pagina(ruta, titulo, descripcion, contenido, secciones, actual=None, migas=(), toc=(), meta=None, todos=None, cuerpo_clase=""):
    css = relativo(ruta, "ayuda/ayuda.css"); js = relativo(ruta, "ayuda/ayuda.js")
    inicio = relativo(ruta, ruta_de("_inicio")); app = relativo(ruta, "index.html")
    lateral = []
    for clave, tit, _, arts in secciones:
        enlace_s = relativo(ruta, ruta_de("_legal") if clave == LEGAL else ruta_de(clave))
        abierta = actual and actual[0] == clave
        item = f'<li class="{"actual" if abierta else ""}"><a href="{enlace_s}">{html.escape(tit)}</a>'
        if abierta and arts and clave not in ("preguntas-frecuentes", "novedades"):
            item += "<ul>" + "".join(
                f'<li><a href="{relativo(ruta, ruta_de(clave, a["nombre"]))}"{" aria-current=\"page\"" if actual == (clave, a["nombre"]) else ""}>{html.escape(a["titulo"])}</a></li>'
                for a in arts if a["nombre"] != "index") + "</ul>"
        lateral.append(item + "</li>")
    m = "".join(f'<li><a href="{u}">{html.escape(t)}</a></li>' for t, u in migas)
    toc_h = ""
    if len(toc) >= 2:
        toc_h = '<nav class="en-este" aria-label="En este artículo"><b>En este artículo</b><ul>' + "".join(f'<li><a href="#{i}">{html.escape(t)}</a></li>' for i, t in toc) + "</ul></nav>"
    info = ""
    if meta:
        partes = []
        if meta.get("aplica"): partes.append("<span><b>Se aplica a:</b> " + html.escape(meta["aplica"]) + "</span>")
        if meta.get("actualizado"): partes.append(f'<span><b>Actualizado:</b> <time datetime="{html.escape(meta["actualizado"])}">{fecha_larga(meta["actualizado"])}</time>' + (f' · versión {html.escape(meta["version"])}' if meta.get("version") else "") + "</span>")
        if partes: info = '<p class="info">' + " ".join(partes) + "</p>"
    pie = (f'<footer class="pie"><nav aria-label="Legal"><a href="{inicio}">Ayuda</a> · <a href="{relativo(ruta, ruta_de(LEGAL, "privacidad"))}">Privacidad</a> · '
           f'<a href="{relativo(ruta, ruta_de(LEGAL, "terminos"))}">Términos</a> · <a href="{relativo(ruta, ruta_de(LEGAL, "licencias"))}">Licencias</a> · '
           f'<a href="{relativo(ruta, ruta_de(LEGAL, "seguridad"))}">Seguridad</a> · <a href="{relativo(ruta, ruta_de(LEGAL, "accesibilidad"))}">Accesibilidad</a></nav>'
           f'<p>NOM-COLAB es un proyecto escolar del equipo WACK (CECyT 9, IPN). Software libre bajo la GPL-3.0 · <a href="{REPO}" target="_blank" rel="noopener">Código en GitHub</a></p></footer>')
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<title>{html.escape(titulo)} · Ayuda de NOM-COLAB</title>
<meta name="description" content="{html.escape(descripcion or "")}">
<link rel="stylesheet" href="{css}">
<script src="{js}" defer></script>
</head>
<body class="{cuerpo_clase}">
<a class="saltar" href="#contenido">Saltar al contenido</a>
<header class="cabecera">
  <a class="marca" href="{inicio}">{LOGO}<span>NOM-COLAB <small>Ayuda</small></span></a>
  <form class="buscar" role="search" action="{relativo(ruta, "ayuda/buscar/index.html")}" method="get">
    <label for="q" class="oculto">Buscar en la ayuda</label>
    <input id="q" name="q" type="search" placeholder="Buscar en la ayuda…" autocomplete="off" data-buscar>
    <div class="resultados" data-resultados hidden></div>
  </form>
  <a class="volver-app" href="{app}" data-volver-app>Abrir NOM-COLAB</a>
</header>
<div class="cuerpo">
  <details class="lateral" open><summary>Temas</summary><nav aria-label="Temas de la ayuda"><ul>{"".join(lateral)}</ul></nav></details>
  <main id="contenido" tabindex="-1">
    {f'<nav class="migas" aria-label="Estás en"><ol>{m}</ol></nav>' if m else ""}
    <article>
      <h1>{html.escape(titulo)}</h1>
      {info}
      {toc_h}
      {contenido}
    </article>
  </main>
</div>
{pie}
</body>
</html>
"""


# ---------------------------------------------------------------- generar
def escribir(ruta, texto):
    destino = os.path.join(STATIC, ruta)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "w", encoding="utf-8") as f: f.write(texto)


def main():
    secciones, todos = cargar()
    indice, urls = [], []
    especiales_comunes = {"{{formulas}}": tabla_formulas, "{{contacto}}": contacto_html}
    rotos = []

    def generar_articulo(clave, tit_sec, a):
        ruta = ruta_de(clave, a["nombre"])
        try:
            cuerpo, toc, plano = markdown(a["cuerpo"], ruta, todos, especiales_comunes)
        except Rotos as e:
            rotos.append(str(e)); return
        migas = [("Ayuda", relativo(ruta, ruta_de("_inicio")))]
        if clave == LEGAL: migas = [(TITULO_LEGAL, relativo(ruta, ruta_de("_legal")))]
        elif a["nombre"] != "index": migas.append((tit_sec, relativo(ruta, ruta_de(clave))))
        escribir(ruta, pagina(ruta, a["titulo"], a["meta"].get("descripcion", ""), cuerpo, secciones, (clave, a["nombre"]), migas, toc, a["meta"], todos))
        indice.append({"t": a["titulo"], "d": a["meta"].get("descripcion", ""), "u": ruta.replace(os.sep, "/"), "s": tit_sec,
                       "h": [t for _, t in toc], "x": sin_acentos(plano)[:1500]})
        urls.append(ruta)

    for clave, tit_sec, desc, arts in secciones:
        for a in arts:
            generar_articulo(clave, tit_sec, a)
        # Índice de la sección (si no trae su propio index.md)
        if clave == LEGAL:
            ruta = ruta_de("_legal")
        else:
            ruta = ruta_de(clave)
        if not any(a["nombre"] == "index" for a in arts):
            lista = "".join(f'<li><a href="{relativo(ruta, ruta_de(clave, a["nombre"]))}"><b>{html.escape(a["titulo"])}</b><span>{html.escape(a["meta"].get("descripcion", ""))}</span></a></li>' for a in arts)
            migas = [("Ayuda", relativo(ruta, ruta_de("_inicio")))] if clave != LEGAL else []
            escribir(ruta, pagina(ruta, tit_sec if clave != LEGAL else TITULO_LEGAL, desc, f'<p class="entrada">{html.escape(desc)}.</p><ul class="lista-articulos">{lista}</ul>', secciones, (clave, None), migas))
            urls.append(ruta)

    # Inicio de la ayuda
    ruta = ruta_de("_inicio")
    tarjetas = "".join(f'<li><a href="{relativo(ruta, ruta_de(c))}"><b>{html.escape(t)}</b><span>{html.escape(d)}</span></a></li>' for c, t, d, _ in secciones if c != LEGAL)
    tarjetas += f'<li><a href="{relativo(ruta, ruta_de("_legal"))}"><b>{TITULO_LEGAL}</b><span>Aviso de privacidad, términos, licencias y seguridad</span></a></li>'
    mas = [("sin-internet", "como-funciona"), ("sin-internet", "alias"), ("sin-internet", "al-volver"), ("espacios", "ramas"), ("empezar", "instalar-computadora"),
           ("empezar", "instalar-android"), ("cuentas", "conexion-sin-cifrar"), ("cuentas", "cambiar-y-restablecer"), ("problemas", "no-encuentro-el-telefono")]
    consulta = "".join(f'<li><a href="{relativo(ruta, ruta_de(s, n))}">{html.escape(todos[(s, n)]["titulo"])}</a></li>' for s, n in mas if (s, n) in todos)
    cuerpo = (f'<p class="entrada">Cómo usar NOM-COLAB para escribir, calcular, presentar y dibujar en equipo, con Internet o sin él. Estas páginas se leen sin iniciar sesión y también '
              f'funcionan sin Internet (en el teléfono que comparte y dentro de la app).</p>'
              f'<ul class="tarjetas">{tarjetas}</ul><h2 id="lo-mas-consultado">Lo más consultado</h2><ul class="mas-consultado">{consulta}</ul>')
    escribir(ruta, pagina(ruta, "Ayuda de NOM-COLAB", "Ayuda de NOM-COLAB: trabajar en equipo con o sin Internet.", cuerpo, secciones, None, (), (), None, todos, "inicio"))
    urls.append(ruta)

    # Buscar (sin JavaScript: la lista de todo; con JavaScript, los resultados)
    ruta = "ayuda/buscar/index.html"
    todo = "".join(f'<li><a href="{relativo(ruta, x["u"])}"><b>{html.escape(x["t"])}</b><span>{html.escape(x["s"])} · {html.escape(x["d"])}</span></a></li>' for x in sorted(indice, key=lambda y: sin_acentos(y["t"])))
    escribir(ruta, pagina(ruta, "Buscar en la ayuda", "Buscar en la ayuda de NOM-COLAB", f'<div data-pagina-buscar><p class="entrada">Escribe arriba lo que buscas. Estas son todas las páginas:</p><ul class="lista-articulos">{todo}</ul></div>', secciones, None, [("Ayuda", relativo(ruta, ruta_de("_inicio")))]))

    if rotos:
        print("Enlaces rotos:\n  " + "\n  ".join(rotos)); sys.exit(1)

    escribir("ayuda/indice.json", json.dumps(indice, ensure_ascii=False, separators=(",", ":")))
    # robots.txt y sitemap.xml (la Raspberry se deja encontrar; Azure manda noindex en sus cabeceras)
    escribir("robots.txt", f"User-agent: *\nAllow: /ayuda/\nAllow: /legal/\nDisallow: /api/\nSitemap: {PUBLICO}/sitemap.xml\n")
    hoy = datetime.date.today().isoformat()
    escribir("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
             + "".join(f"  <url><loc>{PUBLICO}/{u.replace(os.sep, '/').replace('index.html', '')}</loc><lastmod>{hoy}</lastmod></url>\n" for u in sorted(set(urls)))
             + "</urlset>\n")
    escribir(".well-known/security.txt", f"# NOM-COLAB: cómo reportar una falla de seguridad (RFC 9116)\nContact: {CONTACTO['seguridad']}\n"
             + (f"Contact: mailto:{CONTACTO['correo']}\n" if CONTACTO["correo"] else "")
             + f"Expires: 2027-11-13T00:00:00.000Z\nPreferred-Languages: es, en\nCanonical: {PUBLICO}/.well-known/security.txt\nPolicy: {PUBLICO}/legal/seguridad/\n")
    # El service worker guarda de una vez lo legal, «Sin Internet» y las preguntas frecuentes.
    fijas = ["ayuda/ayuda.css", "ayuda/ayuda.js", "ayuda/indice.json", "ayuda/index.html", "ayuda/buscar/index.html"]
    fijas += sorted(u.replace(os.sep, "/") for u in urls if u.startswith(LEGAL) or u.startswith("ayuda/sin-internet") or u.startswith("ayuda/preguntas-frecuentes"))
    sw = open(SW, encoding="utf-8").read()
    bloque = "/* ayuda:inicio (lo escribe ayuda/generar.py) */ " + ", ".join(json.dumps(f) for f in fijas) + ", /* ayuda:fin */"
    if "/* ayuda:inicio" in sw:
        sw = re.sub(r"/\* ayuda:inicio.*?/\* ayuda:fin \*/", lambda _: bloque, sw, flags=re.S)
    else:
        sw = sw.replace('"js/comentarios.js",', '"js/comentarios.js",\n  ' + bloque, 1)
    open(SW, "w", encoding="utf-8").write(sw)
    print(f"Ayuda generada: {len(indice)} páginas con contenido, {len(set(urls))} en el mapa del sitio, {len(fijas)} guardadas para sin Internet.")


if __name__ == "__main__":
    main()
