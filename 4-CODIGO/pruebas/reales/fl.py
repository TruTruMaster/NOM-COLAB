"""Chromium real del escritorio (flast) por CDP: localhost:9333 (túnel SSH). Cada llamada se reconecta."""
import os, sys, json, time
from playwright.sync_api import sync_playwright
D = os.environ.get("NOM_CAPTURAS", os.path.expanduser("~/.cache/nom-pruebas/capturas-reales")); os.makedirs(D, exist_ok=True)
CDP = os.environ.get("CDP", "http://localhost:9333")
class F:
    def __enter__(self):
        self.pw = sync_playwright().start()
        self.b = self.pw.chromium.connect_over_cdp(CDP)
        self.ctx = self.b.contexts[0]
        ps = [p for p in self.ctx.pages if not p.url.startswith("devtools")]
        self.p = ps[0] if ps else self.ctx.new_page()
        self.err = []
        self.p.on("pageerror", lambda e: self.err.append("pageerror: " + str(e)[:300]))
        self.p.on("console", lambda m: self.err.append("consola: " + m.text[:300]) if m.type in ("error", "warning") else None)
        return self
    def __exit__(self, *a):
        try: self.pw.stop()
        except Exception: pass
    def ev(self, js, *a): return self.p.evaluate(js, *a)
    def shot(self, nombre, ancho=900, completa=False):
        f = os.path.join(D, nombre + "-full.png"); self.p.screenshot(path=f, full_page=completa)
        os.system(f"convert {f} -resize {ancho}x {os.path.join(D, nombre)}.png"); print(os.path.join(D, nombre) + ".png")
    def visibles(self, filtro=None, n=60):
        """Botones, enlaces, campos y títulos visibles (texto o aria-label)."""
        r = self.ev("""(f) => { const out = []; const re = f ? new RegExp(f, 'i') : null;
          for (const e of document.querySelectorAll('button,a,input,textarea,select,[role=button],[role=menuitem],[role=tab],h1,h2,h3,[contenteditable=true],label')) {
            if (!(e.offsetParent || e.getClientRects().length)) continue; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
            let t = (e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
            if (re && !re.test(t)) continue;
            out.push(`${Math.round(r.x + r.width / 2)},${Math.round(r.y + r.height / 2)} ${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} ${JSON.stringify(t)}`); }
          return out; }""", filtro)
        for x in r[:n]: print(x)
        return r
    def clic_texto(self, t, exacto=False, n=0):
        loc = self.p.get_by_text(t, exact=exacto)
        loc.nth(n).click(timeout=8000); self.p.wait_for_timeout(500)
    def clic_rol(self, rol, nombre, exacto=False):
        self.p.get_by_role(rol, name=nombre, exact=exacto).first.click(timeout=8000); self.p.wait_for_timeout(500)
if __name__ == "__main__":
    with F() as f:
        print(f.p.url); f.visibles(sys.argv[1] if len(sys.argv) > 1 else None)
