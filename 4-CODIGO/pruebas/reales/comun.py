"""Varios equipos reales a la vez contra la Raspberry: laptop (Chromium y Firefox), escritorio (CDP) y A55 (adb)."""
import os, sys, time, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
BASE = os.environ.get("NOM_BASE", "https://nomcolab.dpdns.org")
PERF = os.path.expanduser("~/.cache/nom-pruebas/perfiles-14nov")
CL = json.load(open(os.path.expanduser("~/.cache/nom-pruebas/cuentas-prueba.json")))   # cuentas de prueba y sus contraseñas: archivo local, fuera de git
TXT_JS = "() => { const e = [...document.querySelectorAll('[contenteditable=true]')].find(x => x.offsetParent && x.closest('.modo-TEXTO, .ed-lienzo')) || [...document.querySelectorAll('[contenteditable]')].find(x => x.offsetParent && x.closest('.modo-TEXTO')); return e ? e.innerText : null; }"
class Equipo:
    def __init__(self, pw, nombre, motor="chromium", usuario=None, cdp=None):
        self.nombre, self.usuario, self.err = nombre, usuario, []
        if cdp:
            self.b = pw.chromium.connect_over_cdp(cdp); self.ctx = self.b.contexts[0]
            ps = [p for p in self.ctx.pages if not p.url.startswith("devtools")]
            self.p = ps[0] if ps else self.ctx.new_page()
        else:
            os.makedirs(PERF, exist_ok=True)
            self.ctx = getattr(pw, motor).launch_persistent_context(os.path.join(PERF, nombre), headless=True, viewport={"width": 1400, "height": 900}, user_agent=None)
            self.p = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()
        self.p.on("pageerror", lambda e: self.err.append("pageerror: " + str(e)[:200]))
        self.p.on("console", lambda m: self.err.append("consola: " + m.text[:200]) if m.type == "error" and "cloudflareinsights" not in m.text else None)
        self.p.on("dialog", lambda d: d.accept())
    def ev(self, js, *a): return self.p.evaluate(js, *a)
    def entrar(self):
        p = self.p; p.goto(BASE + "/"); p.wait_for_timeout(2500)
        if self.ev("() => !!localStorage.getItem('nom.token')"): return
        p.wait_for_selector("#u", timeout=30000)
        p.fill("#u", self.usuario); p.fill("#c", CL[self.usuario]); p.click("button[type=submit]")
        p.wait_for_function("() => !!localStorage.getItem('nom.token')", timeout=30000); p.wait_for_timeout(1500)
        for t in ("Ya lo guardé", "Entendido"):
            try: p.get_by_role("button", name=t).first.click(timeout=1500)
            except Exception: pass
    def abrir(self, doc):
        self.p.goto(BASE + "/#/doc/" + doc)
        self.p.wait_for_function("() => window.NOM && NOM.editorActual && NOM.editorActual.vista && NOM.editorActual.vista.isConnected", timeout=40000)
        self.p.wait_for_timeout(1200)
        try: self.p.get_by_role("button", name="Entendido").first.click(timeout=1500)
        except Exception: pass
    def texto(self):
        try: return self.ev(TXT_JS) or ""
        except Exception as e: return "ERR " + str(e)[:80]
    def foto(self, ruta, ancho=800):
        self.p.screenshot(path=ruta + "-full.png"); os.system(f"convert {ruta}-full.png -resize {ancho}x {ruta}.png")
