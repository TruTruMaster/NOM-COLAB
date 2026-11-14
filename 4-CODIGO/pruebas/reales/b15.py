import sys, os, json, time, urllib.request
from comun import *
with sync_playwright() as pw:
    e = Equipo(pw, "laptop-b15-x5", "chromium", "pruebaa55x5"); e.entrar(); p = e.p
    # crear un espacio para ver que desaparece al borrar la cuenta
    p.get_by_role("button", name="Crear mi primer espacio").first.click(); p.wait_for_timeout(800)
    p.get_by_label("Nombre del espacio").fill("Espacio de x5"); p.get_by_role("button", name="Crear espacio").last.click(); p.wait_for_timeout(2500)
    for t in ("Después", "Cerrar"):
        try: p.get_by_role("button", name=t).first.click(timeout=1500)
        except Exception: pass
    p.get_by_role("button", name="Cuenta y ajustes").first.click(); p.wait_for_timeout(800)
    p.get_by_role("menuitem", name="Ajustes y preferencias").first.click(); p.wait_for_timeout(1200)
    with p.expect_download(timeout=20000) as dl:
        p.get_by_role("button", name="Descargar").first.click()
    f = os.path.expanduser("~/.cache/nom-pruebas/capturas-reales/datos-x5.json"); dl.value.save_as(f)
    d = json.load(open(f)); print("B-15 datos descargados:", os.path.getsize(f), "bytes; claves:", list(d.keys())[:8], "| contraseña en el archivo:", "Prueba-A55" in open(f).read())
    p.keyboard.press("Escape"); p.wait_for_timeout(600)
    p.get_by_role("button", name="Cuenta y ajustes").first.click(); p.wait_for_timeout(800)
    p.get_by_role("menuitem", name="Borrar mi cuenta…").first.click(); p.wait_for_timeout(1200)
    print("B-15 diálogo:", p.evaluate("() => [...document.querySelectorAll('.velo h2, .velo p, .velo label, .velo button')].filter(e => e.offsetParent).map(e => e.innerText.trim().slice(0, 90)).filter(Boolean)")[:10])
    p.screenshot(path=os.path.expanduser("~/.cache/nom-pruebas/capturas-reales/b15.png"))
    e.ctx.close()
