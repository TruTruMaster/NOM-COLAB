"""B-12: enlace para ver sin cuenta (dueño x1 en la Pi) abierto en un navegador sin sesión."""
import sys, os, json, time, re
from comun import *
DOC = sys.argv[1]
with sync_playwright() as pw:
    e = Equipo(pw, "laptop-x1", "chromium", "pruebaa55x1"); e.entrar(); p = e.p
    e.ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    e.abrir(DOC)
    p.get_by_role("button", name="Más opciones").first.click(); p.wait_for_timeout(600)
    p.get_by_role("menuitem", name=re.compile("Enlace para ver")).first.click(); p.wait_for_timeout(1500)
    print("hoja:", [t for t in p.evaluate("() => [...document.querySelectorAll('.velo button, .velo h2, .velo p')].filter(b => b.offsetParent).map(b => b.innerText.trim().slice(0, 60))") if t][:10])
    for t in ("Crear enlace", "Crear el enlace", "Activar", "Crear"):
        try: p.get_by_role("button", name=t, exact=True).first.click(timeout=1500); p.wait_for_timeout(2000); print("toqué", t); break
        except Exception: pass
    enl = p.evaluate("() => { const t = document.body.innerText.match(/https?:\\/\\/\\S*\\/(ver|v)\\/\\S+/); const i = [...document.querySelectorAll('input')].map(x => x.value).find(v => /\\/(ver|v)\\//.test(v)); return (i || (t && t[0]) || ''); }")
    if not enl:
        try: p.get_by_role("button", name="Copiar").first.click(timeout=2000); p.wait_for_timeout(500); enl = p.evaluate("() => navigator.clipboard.readText()")
        except Exception: pass
    print("enlace:", enl)
    if enl:
        b2 = pw.chromium.launch(); q = b2.new_page(); err = []
        q.on("pageerror", lambda x: err.append(str(x)[:150]))
        q.goto(enl); q.wait_for_timeout(6000)
        txt = q.evaluate("() => document.body.innerText")
        print("sin cuenta ve el acta:", "Acta de reunión" in txt, "| editable:", q.evaluate("() => [...document.querySelectorAll('[contenteditable=true]')].filter(x => x.offsetParent).length"), "| errores:", err[:2])
        q.screenshot(path=os.path.expanduser("~/.cache/nom-pruebas/capturas-reales/b12.png")); b2.close()
