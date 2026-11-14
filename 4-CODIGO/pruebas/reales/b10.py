"""B-10: espacio cifrado de extremo a extremo creado en la laptop (x2); imprime el código para unir el A55."""
import sys, os, json, time, re
from comun import *
with sync_playwright() as pw:
    e = Equipo(pw, "laptop-chromium-x2", "chromium", "pruebaa55x2"); e.entrar(); p = e.p
    p.goto(BASE + "/#/"); p.wait_for_timeout(2500)
    p.get_by_role("button", name="Nuevo espacio").first.click(); p.wait_for_timeout(1000)
    p.get_by_label("Nombre del espacio").fill("Cifrado A55")
    hoja = p.locator(".velo").last
    sw = hoja.locator("input[type=checkbox]").first; sw.check(force=True); p.wait_for_timeout(400)
    print("E2E marcado:", sw.is_checked())
    hoja.get_by_role("button", name="Crear espacio").click(); p.wait_for_timeout(4000)
    for t in ("Después",):
        try: p.get_by_role("button", name=t).first.click(timeout=2500)
        except Exception: pass
    print("url espacio:", p.url)
    esp = p.url.split("/espacio/")[-1]
    p.get_by_role("button", name="Nuevo documento").first.click(); p.wait_for_timeout(1000)
    p.get_by_label("Nombre").first.fill("Secreto E2E"); p.get_by_role("button", name="Crear documento").last.click(); p.wait_for_timeout(4000)
    p.locator("[contenteditable=true]").first.click(); p.keyboard.type("Texto secreto 4242", delay=30); p.wait_for_timeout(3000)
    doc = p.url.split("/doc/")[-1]; print("doc:", doc)
    p.goto(BASE + "/#/espacio/" + esp); p.wait_for_timeout(2500)
    p.get_by_role("button", name="Miembros").first.click(); p.wait_for_timeout(1200)
    p.get_by_role("button", name="Crear código").first.click(); p.wait_for_timeout(1200)
    p.get_by_role("button", name="Crear el código").first.click(); p.wait_for_timeout(2500)
    cod = p.evaluate("() => (document.body.innerText.match(/\\b[A-Z0-9]{4}-[A-Z0-9]{4}\\b/) || [''])[0]")
    print("código:", cod)
    json.dump({"esp": esp, "doc": doc, "codigo": cod}, open(os.path.expanduser("~/.cache/nom-pruebas/b10.json"), "w"))
    print("errores:", e.err[:3])
