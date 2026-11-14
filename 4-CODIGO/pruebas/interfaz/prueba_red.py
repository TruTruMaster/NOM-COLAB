"""La red, de punta a punta: página ↔ página, página ↔ app, celular ↔ página, sin conexión y cuentas.

Un solo servidor y cuatro "equipos" al mismo tiempo:
  A     página en una computadora (cuenta U1)
  B     página en otra computadora (cuenta U2, entra al espacio con el enlace de U1)
  C     página en el navegador de un celular (U2)
  app   la interfaz que va dentro del APK, cargada desde archivos (file://) como la carga el
        teléfono, con el servidor escrito a mano y la MISMA cuenta U1 (las cuentas viven en el
        servidor: la app no tiene cuentas propias)

Revisa que lo escrito en cada uno aparezca en los demás sin recargar, que la app y la página vean
la misma cuenta y los mismos espacios, que lo escrito sin conexión se junte al volver la red, que
un documento con cambios sin enviar se pueda volver a abrir estando todavía sin conexión, que una
cuenta creada desde la app entre desde la página, y que la app avise si el servidor es de otra
versión.

  pruebas/interfaz/correr.sh ~/salida prueba_red
  NOM_ESTATICO=/ruta/a/otra/carpeta/static ...   # probar la interfaz de un APK viejo contra este servidor
"""
import os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import nomprueba as N
from playwright.sync_api import sync_playwright

B, CL = N.B, N.CL
SALIDA = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / ".cache" / "nom-pruebas" / "salida"
ESTATICO = os.environ.get("NOM_ESTATICO") or str(Path(__file__).resolve().parents[2] / "app" / "src" / "main" / "resources" / "static")
INDEX = "file://" + ESTATICO + "/index.html"
res, errs = [], {}


def anota(nombre, ok, det=""):
    res.append((nombre, bool(ok)))
    print(("  ok   " if ok else "  MAL  ") + nombre + (f"  -> {str(det)[:260]}" if det != "" and not ok else (f"  ({str(det)[:120]})" if det else "")), flush=True)


def intenta(nombre, fn):
    try:
        r = fn(); anota(nombre, True, r if isinstance(r, str) else "")
    except Exception as e:
        anota(nombre, False, type(e).__name__ + ": " + str(e).split("\n")[0])


def pagina(navegador, nombre, **opc):
    ctx = navegador.new_context(**opc); p = ctx.new_page(); errs[nombre] = []
    p.on("pageerror", lambda e: errs[nombre].append(str(e)[:200]))
    return ctx, p


def entrar_web(p, nombre):
    p.goto(B + "/"); p.wait_for_selector("#u", timeout=20000); p.fill("#u", nombre); p.fill("#c", CL); p.click("button[type=submit]")
    p.wait_for_function("() => !!localStorage.getItem('nom.token')", timeout=20000); p.wait_for_timeout(700)


def abrir_doc(p, doc, base):
    p.goto(base + "#/doc/" + doc); p.wait_for_selector(".wd-cuerpo", timeout=25000); p.wait_for_timeout(900)


def escribe(p, texto):
    p.click(".wd-cuerpo"); p.keyboard.press("Control+End"); p.keyboard.type(" " + texto, delay=15); p.wait_for_timeout(300)


def ve(p, texto, ms=12000):
    p.wait_for_function("(t) => { const c = document.querySelector('.wd-cuerpo'); return !!c && c.innerText.includes(t); }", arg=texto, timeout=ms)


MOVIL = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
pw = sync_playwright().start()
nav = pw.chromium.launch()
# la app carga su interfaz desde archivos y habla con el servidor de otro origen, como el WebView
app_nav = pw.chromium.launch(args=["--allow-file-access-from-files", "--disable-web-security"])

u1, u2 = N.cuenta(), N.cuenta()
esp = N.espacio(u1["token"], "Equipo de red")
doc = N.documento(u1["token"], esp, "TEXTO", "Reporte compartido")
r = N.api("POST", f"/api/espacios/{esp}/enlaces", {"permiso": "EDICION", "horas": 2}, u1["token"])[1]
codigo = r.get("codigo") or (r.get("enlace") or {}).get("codigo") or r.get("enlaces", [{}])[-1].get("codigo")
st, _ = N.api("POST", f"/api/enlaces/{codigo}/entrar", None, u2["token"]); anota("U2 entra al espacio con el enlace de U1", st == 200, st)

print("== página A (computadora, U1)")
cA, A = pagina(nav, "paginaA", viewport={"width": 1300, "height": 850}); entrar_web(A, u1["nombre"]); abrir_doc(A, doc, B + "/"); escribe(A, "HOLA-DESDE-PAGINA-A")

print("== app (la interfaz del APK, desde archivos) con la cuenta U1 del servidor")
cP, P = pagina(app_nav, "app", **MOVIL)
P.add_init_script("window.NomAndroid = window.NomAndroid || { guardarArchivo() {}, compartirTexto() {}, tamanoLetra() {} };")
P.goto(INDEX); P.wait_for_function("() => window.NOM && NOM.api", timeout=20000)
anota("la app se reconoce como app", P.evaluate("() => NOM.api.empaquetada === true && NOM.api.dispositivo") == "App Android")


def elegir_servidor():
    P.wait_for_selector("details summary", timeout=15000); P.click("details summary"); P.fill("#srv", B.replace("http://", "")); P.click("details button[type=submit]")
    P.wait_for_selector("#u", timeout=15000); return P.evaluate("() => NOM.api.servidor()")
intenta("app: elegir el servidor escribiendo su dirección", elegir_servidor)


def entrar_app():
    P.fill("#u", u1["nombre"]); P.fill("#c", CL); P.click("button[type=submit]")
    P.wait_for_function("() => !!NOM.api.token()", timeout=20000); P.wait_for_timeout(1200)
    yo = P.evaluate("() => NOM.api.get('/api/cuentas/yo')"); mia = str((yo.get("usuario") or yo).get("id"))
    assert mia == u1["id"], f"{mia} != {u1['id']}"; return "mismo identificador de cuenta"
intenta("app: entra con la MISMA cuenta que se registró en la página", entrar_app)


def mismos_espacios():
    l = P.evaluate("() => NOM.api.get('/api/espacios')"); ids = [e["id"] for e in (l.get("espacios") if isinstance(l, dict) else l)]
    assert esp in ids, ids; P.wait_for_function("() => document.body.innerText.includes('Equipo de red')", timeout=10000); return ""
intenta("app: ve los mismos espacios que la página", mismos_espacios)


def sin_aviso_de_version():
    t = P.evaluate("() => (document.querySelector('.avisos') || {}).innerText || ''"); assert "versión" not in t, t; return ""
intenta("la app no avisa de versiones si el servidor es de la suya", sin_aviso_de_version)
intenta("página → app: lo escrito en la página se ve en la app", lambda: (abrir_doc(P, doc, INDEX), ve(P, "HOLA-DESDE-PAGINA-A")) and "")
intenta("app → página en vivo", lambda: (escribe(P, "HOLA-DESDE-LA-APP"), ve(A, "HOLA-DESDE-LA-APP")) and "")
intenta("página → app en vivo (sin recargar)", lambda: (escribe(A, "SEGUNDA-DE-PAGINA-A"), ve(P, "SEGUNDA-DE-PAGINA-A")) and "")

print("== página B (otra computadora, U2) y navegador de un celular C (U2)")
cB, Bp = pagina(nav, "paginaB", viewport={"width": 1300, "height": 850}); entrar_web(Bp, u2["nombre"])
intenta("página B abre y ve lo de la página A y lo de la app", lambda: (abrir_doc(Bp, doc, B + "/"), ve(Bp, "HOLA-DESDE-LA-APP"), ve(Bp, "SEGUNDA-DE-PAGINA-A")) and "")
intenta("página → página y página → app en vivo (otra cuenta)", lambda: (escribe(Bp, "HOLA-DESDE-PAGINA-B"), ve(A, "HOLA-DESDE-PAGINA-B"), ve(P, "HOLA-DESDE-PAGINA-B")) and "")


def presencia():
    A.wait_for_timeout(1500)
    t = A.evaluate("() => [...document.querySelectorAll('[title],[aria-label],[data-micro]')].map((x) => (x.title || '') + (x.getAttribute('aria-label') || '') + (x.dataset.micro || '')).join(' ') + document.body.innerText")
    assert u2["nombre"] in t, "no aparece el nombre de la otra persona"; return ""
intenta("presencia: A ve que U2 está en el documento", presencia)
cC, C = pagina(nav, "celular", **MOVIL); entrar_web(C, u2["nombre"])


def celular():
    abrir_doc(C, doc, B + "/"); ve(C, "HOLA-DESDE-PAGINA-B"); C.tap(".wd-cuerpo"); C.keyboard.press("Control+End"); C.keyboard.type(" HOLA-DESDE-CELULAR", delay=15)
    ve(A, "HOLA-DESDE-CELULAR"); ve(P, "HOLA-DESDE-CELULAR"); return ""
intenta("navegador del celular → página y → app en vivo", celular)

print("== sin conexión y de regreso")


def sin_red():
    cP.set_offline(True); P.wait_for_timeout(600); escribe(P, "ESCRITO-SIN-RED-EN-LA-APP"); P.wait_for_timeout(1500)
    assert "ESCRITO-SIN-RED-EN-LA-APP" not in A.evaluate("() => document.querySelector('.wd-cuerpo').innerText"), "llegó estando sin red"
    assert P.evaluate("() => NOM.editorActual.doc.pendientes.length") > 0, "no quedó nada pendiente"; return ""
intenta("la app sin red sigue escribiendo y guarda los cambios en el equipo", sin_red)


def reabrir_sin_red():
    # salir del documento y volver a abrirlo SIN conexión, con cambios todavía sin enviar
    P.evaluate("() => { location.hash = '#/'; }"); P.wait_for_timeout(1200)
    P.evaluate("(d) => { location.hash = '#/doc/' + d; }", doc)
    P.wait_for_selector(".wd-cuerpo", timeout=15000); ve(P, "ESCRITO-SIN-RED-EN-LA-APP", 8000)
    n = P.evaluate("() => NOM.editorActual.doc.pendientes.length"); assert n > 0, "se perdieron los cambios pendientes"
    return f"{n} cambios siguen guardados"
intenta("la app vuelve a abrir, todavía sin red, un documento con cambios sin enviar", reabrir_sin_red)


def vuelve_la_red():
    escribe(A, "MIENTRAS-LA-APP-NO-ESTABA"); cP.set_offline(False)
    ve(A, "ESCRITO-SIN-RED-EN-LA-APP", 40000); ve(P, "MIENTRAS-LA-APP-NO-ESTABA", 40000)
    P.wait_for_function("() => NOM.editorActual.doc.pendientes.length === 0", timeout=20000); return ""
intenta("al volver la red se junta lo de los dos lados y no queda nada pendiente", vuelve_la_red)


def pagina_sin_red():
    cB.set_offline(True); Bp.wait_for_timeout(500); escribe(Bp, "SIN-RED-EN-LA-PAGINA-B"); Bp.wait_for_timeout(1200)
    Bp.evaluate("() => { location.hash = '#/'; }"); Bp.wait_for_timeout(1000); Bp.evaluate("(d) => { location.hash = '#/doc/' + d; }", doc)
    Bp.wait_for_selector(".wd-cuerpo", timeout=15000); ve(Bp, "SIN-RED-EN-LA-PAGINA-B", 8000)
    cB.set_offline(False); ve(A, "SIN-RED-EN-LA-PAGINA-B", 40000); return ""
intenta("lo mismo en la página: reabrir sin red con cambios pendientes y enviarlos al volver", pagina_sin_red)


def cerrar_y_abrir():
    P.goto(INDEX); P.wait_for_function("() => window.NOM && NOM.api && !!NOM.api.token()", timeout=15000); P.wait_for_timeout(1200)
    assert P.evaluate("() => NOM.api.servidor()") == B; abrir_doc(P, doc, INDEX); ve(P, "MIENTRAS-LA-APP-NO-ESTABA"); return ""
intenta("cerrar y abrir la app: sigue con su servidor y su sesión", cerrar_y_abrir)

print("== cuentas: registrarse en la app y entrar en la página")
u3 = "app" + str(int(time.time()))[-7:]


def registrar_en_app():
    P.evaluate("() => { NOM.api.limpiarSesion(); }"); P.goto(INDEX); P.wait_for_selector("#u", timeout=15000)
    P.click("[data-ir2='registro'], [data-ir='registro']"); P.wait_for_selector("#ru", timeout=8000)
    P.fill("#ru", u3); P.fill("#rc", CL); P.click("form button[type=submit]")
    P.wait_for_selector("[data-ok]", timeout=20000); P.click("[data-ok]")   # el código de recuperación: "Ya lo guardé"
    P.wait_for_function("() => !!NOM.api.token()", timeout=20000); return ""
intenta("registrar una cuenta nueva DESDE la app (por su pantalla)", registrar_en_app)
st, _ = N.api("POST", "/api/cuentas/sesion", {"nombre": u3, "contrasena": CL}); anota("esa cuenta entra desde la página (está en la base del servidor)", st == 200, st)
st, _ = N.api("POST", "/api/cuentas/registro", {"nombre": u3, "contrasena": CL, "acepto": "2026-11-13"}); anota("y no se puede registrar dos veces el mismo nombre", st in (400, 409, 422), st)

print("== versiones distintas entre la app y el servidor")


def aviso_version(interfaz, espera):
    P.evaluate("() => { localStorage.removeItem('nom.versionAvisada'); document.querySelectorAll('.avisos .aviso').forEach((x) => x.remove()); }")
    P.evaluate("(i) => NOM.revisarVersion({ nom: 1, servidor: 'prueba', version: i ? '9.9.9' : '0.1.0', interfaz: i })", interfaz); P.wait_for_timeout(300)
    t = P.evaluate("() => (document.querySelector('.avisos') || {}).innerText || ''"); assert espera in t, t; return ""
intenta("la app avisa si el servidor es más viejo (no dice su nivel de interfaz)", lambda: aviso_version(0, "versión anterior"))
intenta("la app avisa si hay una app más nueva, con botón para descargarla", lambda: aviso_version(99, "más nueva de la app"))
info = N.api("GET", "/api/red/info")[1]
anota("el servidor dice su versión y su nivel de interfaz", bool(info.get("interfaz")) and info.get("version") not in (None, "0.1.0"), info)

try: P.screenshot(path=str(SALIDA / "red-app.png")); A.screenshot(path=str(SALIDA / "red-pagina.png"))
except Exception: pass
todos = {k: v for k, v in errs.items() if v}
print(f"\nRed: {sum(1 for _, ok in res if ok)} bien, {sum(1 for _, ok in res if not ok)} mal")
print("errores:", [x for v in todos.values() for x in v][:6])
nav.close(); app_nav.close(); pw.stop()
