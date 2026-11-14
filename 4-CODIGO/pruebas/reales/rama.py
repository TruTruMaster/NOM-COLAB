"""B-5 y B-6 con el Chromium real del escritorio: sin red sin conflicto (se sube tal cual) y sin red con conflicto (rama)."""
import sys, time, re, os, json, urllib.request
from comun import *
DOC = sys.argv[1]; ESP = sys.argv[2]; ESPERA = int(sys.argv[3]) if len(sys.argv) > 3 else 130
TOK = (os.environ.get("NOM_TOKEN") or open(os.path.expanduser("~/.cache/nom-pruebas/token-x1")).read()).strip()   # sesión del dueño del espacio de prueba
norm = lambda s: re.sub(r"\s+", "", s or "")
def docs():
    q = urllib.request.Request(BASE + f"/api/espacios/{ESP}/documentos", headers={"Authorization": "Bearer " + TOK, "User-Agent": "NOM-COLAB-pruebas/1.0"})
    return json.load(urllib.request.urlopen(q, timeout=20))
def fin(e, txt):
    e.p.locator("[contenteditable=true]").first.click(); e.p.keyboard.press("Control+End"); e.p.keyboard.press("Enter"); e.p.keyboard.type(txt, delay=40)
def estado(e):
    return e.ev("() => { const x = document.querySelector('.ed-estado, [class*=estado]'); return x ? x.innerText.slice(0, 80) : ''; }")
with sync_playwright() as pw:
    lc = Equipo(pw, "laptop-chromium-x2", "chromium", "pruebaa55x2")
    fl = Equipo(pw, "escritorio-flast1", cdp="http://localhost:9333")
    lc.entrar(); lc.abrir(DOC); fl.abrir(DOC)
    antes = {d["id"] for d in docs()}
    # ---- B-5: sin red, sin que nadie más cambie
    if 'solo6' not in sys.argv:
        fl.ctx.set_offline(True); time.sleep(1)
        fin(fl, "Sin red sin conflicto 5"); print("B-5 escritorio sin red; estado:", estado(fl), flush=True)
        time.sleep(ESPERA)
        print("B-5 antes de volver la red, la laptop lo ve:", "Sinredsinconflicto5" in norm(lc.texto()), flush=True)
        fl.ctx.set_offline(False); t0 = time.time()
        while time.time() - t0 < 30 and "Sinredsinconflicto5" not in norm(lc.texto()): time.sleep(0.5)
        print(f"B-5 al volver la red: la laptop lo ve: {'Sinredsinconflicto5' in norm(lc.texto())} ({time.time()-t0:.1f} s); ramas nuevas: {[d['nombre'] for d in docs() if d['id'] not in antes]}", flush=True)
        fl.foto(os.path.join(os.path.expanduser("~/.cache/nom-pruebas/capturas-reales"), "b5"))
    # ---- B-6: sin red y otra persona cambia el mismo documento
    antes = {d["id"] for d in docs()}
    fl.ctx.set_offline(True); time.sleep(1)
    fin(fl, "Sin red con conflicto 7")
    time.sleep(20); fin(lc, "Cambio en la nube 7"); print("B-6 la laptop cambió el documento en la nube", flush=True)
    time.sleep(max(0, ESPERA - 20))
    fl.ctx.set_offline(False); t0 = time.time()
    nuevas = []
    while time.time() - t0 < 40:
        nuevas = [d for d in docs() if d["id"] not in antes]
        if nuevas: break
        time.sleep(1)
    time.sleep(5)
    print(f"B-6 ramas nuevas ({time.time()-t0:.1f} s):", [(d["nombre"], d.get("ramaDe"), d.get("ramaEstado")) for d in nuevas], flush=True)
    print("B-6 el original (laptop) tiene el cambio de la nube:", "Cambioenlanube7" in norm(lc.texto()), "| tiene lo escrito sin red:", "Sinredconconflicto7" in norm(lc.texto()), flush=True)
    print("B-6 el escritorio ve ahora:", fl.p.url, "| texto con conflicto:", "Sinredconconflicto7" in norm(fl.texto()), "| con nube:", "Cambioenlanube7" in norm(fl.texto()), flush=True)
    avisos = fl.ev("() => [...document.querySelectorAll('.aviso, .toast, [role=status], [role=alert], .hoja')].map(x => x.innerText.trim().slice(0, 160)).filter(Boolean)")
    print("B-6 avisos en el escritorio:", avisos[:5], flush=True)
    fl.foto(os.path.join(os.path.expanduser("~/.cache/nom-pruebas/capturas-reales"), "b6"))
    print("errores:", lc.err[:3], fl.err[:5])
