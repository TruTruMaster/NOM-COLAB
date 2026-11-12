"""Ayudas para probar NOM-COLAB en local (puerto 8099) con Playwright."""
import json, os, time, urllib.request, random, string
from playwright.sync_api import sync_playwright
B = os.environ.get("NOM_BASE", "http://localhost:8099")
CL = "Clave-Segura-123"
def api(m, u, b=None, t=None):
    h = {"Content-Type": "application/json"}
    if t: h["Authorization"] = "Bearer " + t
    q = urllib.request.Request(B + u, method=m, data=json.dumps(b).encode() if b is not None else None, headers=h)
    try:
        with urllib.request.urlopen(q, timeout=30) as x:
            c = x.read(); return x.status, (json.loads(c) if c[:1] in b"{[" else None)
    except urllib.error.HTTPError as e:
        c = e.read(); return e.code, (json.loads(c) if c[:1] in b"{[" else None)
def esperar_servidor():
    for _ in range(120):
        try: urllib.request.urlopen(B + "/api/red/info", timeout=2); return True
        except Exception: time.sleep(1)
    return False
def cuenta(nombre=None):
    nombre = nombre or "p" + "".join(random.choice(string.ascii_lowercase) for _ in range(7))
    api("POST", "/api/cuentas/registro", {"nombre": nombre, "contrasena": CL})
    s = api("POST", "/api/cuentas/sesion", {"nombre": nombre, "contrasena": CL})[1]
    return {"nombre": nombre, "token": s["token"], "id": s["usuario"]["id"]}
def espacio(tok, nombre="Pruebas"):
    return api("POST", "/api/espacios", {"nombre": nombre}, tok)[1]["id"]
def documento(tok, esp, modo="HOJA", nombre="Doc", ops=None):
    return api("POST", f"/api/espacios/{esp}/documentos", {"nombre": nombre, "modo": modo, "ops": ops or []}, tok)[1]["id"]
class Navegador:
    def __init__(self, movil=False):
        self.pw = sync_playwright().start()
        # NOM_NAVEGADOR=firefox prueba con el motor de Firefox (sin "is_mobile": Firefox no lo tiene).
        motor = os.environ.get("NOM_NAVEGADOR", "chromium")
        self.b = getattr(self.pw, motor).launch()
        opc = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2) if movil else dict(viewport={"width": 1400, "height": 900})
        if motor == "firefox": opc.pop("is_mobile", None)
        self.ctx = self.b.new_context(**opc)
        self.p = self.ctx.new_page()
        self.errores = []
        self.p.on("pageerror", lambda e: self.errores.append(str(e)))
        self.p.on("console", lambda m: self.errores.append("console: " + m.text) if m.type == "error" else None)
    def entrar(self, c):
        p = self.p
        p.goto(B + "/")
        p.wait_for_selector("#u", timeout=20000)
        p.fill("#u", c["nombre"]); p.fill("#c", CL)
        p.click("button[type=submit]")
        p.wait_for_function("() => !!localStorage.getItem('nom.token')", timeout=20000)
        p.wait_for_timeout(800)
    def abrir(self, doc):
        self.p.goto(B + "/#/doc/" + doc)
        self.p.wait_for_selector(".ed-herramientas", timeout=20000)
        self.p.wait_for_timeout(600)
    def foto(self, ruta):
        self.p.screenshot(path=ruta)
    def cerrar(self):
        try: self.b.close(); self.pw.stop()
        except Exception: pass
