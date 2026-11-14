"""K: documentos hechos en la app, descargados como Office desde el navegador (laptop, cuenta x2)."""
import sys, os, json, urllib.request
from comun import *
TOK = (os.environ.get("NOM_TOKEN") or open(os.path.expanduser("~/.cache/nom-pruebas/token-x1")).read()).strip()   # sesión del dueño del espacio de prueba
ESP = sys.argv[1]; OUT = os.path.expanduser("~/.cache/nom-pruebas/exportados-k"); os.makedirs(OUT, exist_ok=True)
q = urllib.request.Request(BASE + f"/api/espacios/{ESP}/documentos", headers={"Authorization": "Bearer " + TOK, "User-Agent": "NOM-COLAB-pruebas/1.0"})
docs = json.load(urllib.request.urlopen(q, timeout=20))
with sync_playwright() as pw:
    e = Equipo(pw, "laptop-chromium-x2", "chromium", "pruebaa55x2"); e.entrar()
    for d in docs:
        e.abrir(d["id"]); p = e.p
        p.get_by_role("button", name="Más opciones").first.click(); p.wait_for_timeout(600)
        item = p.locator("[role=menuitem]").filter(has_text="Descargar").first
        with p.expect_download(timeout=30000) as dl:
            item.click()
        f = os.path.join(OUT, d["nombre"].replace(" ", "_") + os.path.splitext(dl.value.suggested_filename)[1])
        dl.value.save_as(f); print(d["modo"], "→", os.path.basename(f), os.path.getsize(f))
    print("errores:", e.err[:4])
