"""B-12 (proyector): quien presenta en la laptop (x1) y otra pantalla sin cuenta abre /#/proyectar/CÓDIGO."""
import sys, os, json, time, re
from comun import *
DOC = sys.argv[1]
with sync_playwright() as pw:
    e = Equipo(pw, "laptop-x1", "chromium", "pruebaa55x1"); e.entrar(); p = e.p
    e.abrir(DOC)
    p.get_by_role("button", name=re.compile("^Presentar")).first.click(); p.wait_for_timeout(700)
    p.get_by_text("En otra pantalla (proyector)…").first.click(); p.wait_for_timeout(4000)
    cod = p.evaluate("() => (document.body.innerText.match(/\\b[A-Z0-9]{4}-?[A-Z0-9]{4}\\b/) || [''])[0]")
    print("código del proyector:", cod)
    b2 = pw.chromium.launch(); q = b2.new_page(viewport={"width": 1280, "height": 720}); err = []
    q.on("pageerror", lambda x: err.append(str(x)[:150]))
    q.goto(BASE + "/#/proyectar/" + cod.replace("-", "")); q.wait_for_timeout(6000)
    t1 = q.evaluate("() => document.body.innerText.slice(0, 200)")
    q.screenshot(path=os.path.expanduser("~/.cache/nom-pruebas/capturas-reales/proyector-1.png"))
    p.keyboard.press("ArrowRight"); p.wait_for_timeout(2500)
    q.screenshot(path=os.path.expanduser("~/.cache/nom-pruebas/capturas-reales/proyector-2.png"))
    t2 = q.evaluate("() => document.body.innerText.slice(0, 200)")
    print("proyector diapositiva 1:", repr(t1[:120])); print("tras avanzar:", repr(t2[:120])); print("errores:", err[:3], e.err[:3])
    b2.close()
