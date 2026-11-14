"""Fase 14: el sitio de ayuda y legal en un navegador de verdad.

  ~/.cache/nom-pruebas/venv/bin/python pruebas/interfaz/prueba_ayuda.py SALIDA

- Cada página de /ayuda/ y /legal/ abre sin sesión, sin errores de JavaScript y, a 360 px de ancho,
  sin desplazarse de lado; cada enlace interno lleva a una página que existe.
- El buscador encuentra artículos.
- Los «?» y los enlaces de la app (registro, menú) llevan a artículos que existen.
- Con la página guardada por el service worker, lo legal y «Sin Internet» abren sin red.
- Las mismas páginas abren desde los archivos (como dentro de la app Android).
"""
import os, re, sys, json, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nomprueba as N
from playwright.sync_api import sync_playwright

STATIC = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "app", "src", "main", "resources", "static"))
BIEN, MAL = [0], []


def check(nombre, ok, detalle=""):
    if ok: BIEN[0] += 1; print("  ok  ", nombre, flush=True)
    else: MAL.append(f"{nombre}: {str(detalle)[:300]}"); print("  MAL ", nombre, "→", str(detalle)[:300], flush=True)


def paginas():
    r = []
    for raiz in ("ayuda", "legal"):
        for d, _, fs in os.walk(os.path.join(STATIC, raiz)):
            for f in fs:
                if f == "index.html": r.append(os.path.relpath(os.path.join(d, f), STATIC).replace(os.sep, "/"))
    return sorted(r)


def main():
    salida = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(salida, exist_ok=True)
    if not N.esperar_servidor(): print("El servidor no contesta"); sys.exit(2)
    ps = paginas()
    print(f"\n== {len(ps)} páginas", flush=True)
    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        ctx = nav.new_context(viewport={"width": 360, "height": 740}, is_mobile=True, has_touch=True)
        p = ctx.new_page()
        errores = []
        p.on("pageerror", lambda e: errores.append(str(e)))
        p.on("console", lambda m: errores.append(m.text) if m.type == "error" else None)
        rotos, anchas, sin_titulo = [], [], []
        for u in ps:
            p.goto(N.B + "/" + u)
            ancho = p.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            if ancho > 1: anchas.append(f"{u} (+{ancho}px)")
            if not p.evaluate("() => (document.querySelector('h1') || {}).textContent"): sin_titulo.append(u)
            for h in p.evaluate("() => [...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => h.startsWith(location.origin))"):
                h = h.split("#")[0]
                if h.endswith("/"): h += "index.html"
                ruta = h[len(N.B) + 1:].split("?")[0]
                if ruta and ruta != "index.html" and not os.path.exists(os.path.join(STATIC, ruta)): rotos.append(f"{u} → {ruta}")
        check("todas las páginas tienen título", not sin_titulo, sin_titulo[:5])
        check("ningún enlace interno está roto", not rotos, sorted(set(rotos))[:8])
        check("a 360 px ninguna página se desplaza de lado", not anchas, anchas[:8])
        check("sin errores de JavaScript en ninguna página", not errores, errores[:5])
        # direcciones bonitas
        for u, esperado in (("/ayuda", "/ayuda/"), ("/legal/privacidad", "/legal/privacidad/")):
            p.goto(N.B + u)
            check(f"{u} lleva a {esperado}", p.url.endswith(esperado) and p.evaluate("() => !!document.querySelector('h1')"), p.url)
        # buscador
        p.goto(N.B + "/ayuda/")
        p.fill("[data-buscar]", "alias"); p.wait_for_timeout(600)
        res = p.evaluate("() => [...document.querySelectorAll('[data-resultados] a')].map(a => a.textContent)")
        check("el buscador encuentra «alias»", any("Alias" in r for r in res), res[:4])
        p.fill("[data-buscar]", "rama fusionar"); p.wait_for_timeout(400)
        res = p.evaluate("() => [...document.querySelectorAll('[data-resultados] a')].map(a => a.textContent)")
        check("…y «rama fusionar» trae el artículo de ramas", any("Ramas" in r for r in res), res[:4])
        p.goto(N.B + "/ayuda/buscar/index.html?q=contraseña"); p.wait_for_timeout(700)
        check("la página Buscar da resultados con ?q=", "contraseña" in p.evaluate("() => document.querySelector('[data-pagina-buscar]').innerText").lower(), "")
        p.goto(N.B + "/ayuda/editores/formulas/")
        n = p.evaluate("() => document.querySelectorAll('table tbody tr').length")
        total = len(re.findall(r'^\s+(?:"[A-ZÑ.]+"|[A-ZÑ][A-ZÑ0-9.]*):\s*\[', open(os.path.join(STATIC, "js", "formulas.js"), encoding="utf-8").read().split("const FIRMAS = {")[1].split("\n  };")[0], re.M)) or 1
        total = max(total, len(re.findall(r'(?:"[A-ZÑ.]+"|\b[A-ZÑ][A-ZÑ0-9.]*):\s*\["', open(os.path.join(STATIC, "js", "formulas.js"), encoding="utf-8").read().split("const FIRMAS = {")[1].split("\n  };")[0])))
        check(f"la referencia de fórmulas trae todas las funciones ({total})", n == total, [n, total])
        # lo legal y security.txt sin sesión
        st = urllib.request.urlopen(N.B + "/.well-known/security.txt").read().decode()
        check("security.txt con contacto y vencimiento", "Contact:" in st and "Expires:" in st, st[:120])
        p.goto(N.B + "/legal/privacidad/")
        t = p.evaluate("() => document.body.innerText")
        check("el aviso integral tiene responsable, datos, finalidades, derechos y cambios", all(x in t for x in ("responsable", "Qué datos", "finalidades", "ARCO", "Cambios a este aviso")), "")
        # los «?» de la app y los enlaces del registro
        js = "".join(open(os.path.join(STATIC, "js", f), encoding="utf-8").read() for f in os.listdir(os.path.join(STATIC, "js")) if f.endswith(".js"))
        rutas = set(re.findall(r'(?:botonAyuda|urlAyuda|NOM\.ayuda)\("([a-z0-9/#-]*)"', js)) | set(re.findall(r'data-ayuda="([a-z0-9/#-]*)"', js))
        rutas |= {"editores/texto", "editores/hoja", "editores/presentacion", "editores/diagrama"}
        faltan = []
        for r in sorted(rutas):
            camino = r.split("#")[0].strip("/")
            f = (camino if camino.startswith("legal") else "ayuda" + ("/" + camino if camino else "")) + "/index.html"
            if not os.path.exists(os.path.join(STATIC, f)): faltan.append(r)
        check(f"los {len(rutas)} enlaces a la ayuda que hay en la app existen", not faltan, faltan)
        # El registro pide aceptar los términos (con enlaces)
        p2 = ctx.new_page()
        p2.goto(N.B + "/"); p2.wait_for_selector("[data-ir=registro]", timeout=20000); p2.click("[data-ir=registro]")
        p2.wait_for_selector("input[name=acepto]")
        check("el registro tiene la casilla de Términos y Aviso de privacidad", p2.evaluate("() => !!document.querySelector('.acepto a[data-ayuda=\"legal/privacidad\"]')"), "")
        check("la pantalla de entrar lleva Ayuda · Privacidad · Términos", "Privacidad" in p2.evaluate("() => (document.querySelector('.pie-legal') || {}).innerText || ''"), "")
        p2.fill("#ru", "sinacepto" + str(os.getpid() % 10000)); p2.fill("#rc", N.CL); p2.click("button[type=submit]"); p2.wait_for_timeout(600)
        check("sin marcar la casilla no se crea la cuenta", "acepta" in p2.evaluate("() => document.body.innerText").lower(), "")
        # Sin Internet, con el service worker (localhost cuenta como seguro)
        p3 = ctx.new_page()
        p3.goto(N.B + "/ayuda/"); p3.wait_for_timeout(500)
        p3.evaluate("() => navigator.serviceWorker.register('/sw.js')")
        listo = p3.wait_for_function("() => navigator.serviceWorker.ready.then(() => caches.keys()).then(k => k.length > 0)", timeout=60000) and True
        p3.wait_for_timeout(4000)
        ctx.set_offline(True)
        abiertas = []
        for u in ("/legal/privacidad/index.html", "/ayuda/sin-internet/alias/index.html", "/ayuda/preguntas-frecuentes/index.html"):
            try: p3.goto(N.B + u); abiertas.append(bool(p3.evaluate("() => (document.querySelector('h1') || {}).textContent")))
            except Exception: abiertas.append(False)
        ctx.set_offline(False)
        check("sin Internet abren lo legal, «Sin Internet» y las preguntas frecuentes", listo and all(abiertas), abiertas)
        # Desde los archivos, como dentro de la app
        p4 = nav.new_page()
        e4 = []
        p4.on("pageerror", lambda e: e4.append(str(e)))
        p4.goto("file://" + os.path.join(STATIC, "ayuda", "index.html"))
        p4.click(".tarjetas a"); p4.wait_for_timeout(300)
        p4.click(".lista-articulos a"); p4.wait_for_timeout(300)
        check("desde los archivos (como en la app) se navega entre páginas", p4.url.endswith("index.html") and bool(p4.evaluate("() => (document.querySelector('h1') || {}).textContent")) and not e4, [p4.url, e4[:2]])
        p.screenshot(path=os.path.join(salida, "ayuda-formulas-360.png"))
        nav.close()
    print(f"\nAyuda: {BIEN[0]} bien, {len(MAL)} mal")
    for x in MAL: print("  MAL", x)
    sys.exit(1 if MAL else 0)


if __name__ == "__main__":
    main()
