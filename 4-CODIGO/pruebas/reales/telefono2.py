import sys, time, os, json
from playwright.sync_api import sync_playwright
ENL = sys.argv[1]; D = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1300, "height": 850}); err = []
    p.on("pageerror", lambda e: err.append(str(e)[:200])); p.on("console", lambda m: err.append("c: " + m.text[:200]) if m.type == "error" else None)
    p.goto(ENL); p.wait_for_timeout(5000)
    p.get_by_role("button", name="Entrar con mi cuenta").first.click(); p.wait_for_timeout(1500)
    dlg = p.locator(".velo, [role=dialog]").last
    dlg.get_by_label("Usuario").fill("pruebaa55x2"); dlg.get_by_label("Contraseña").fill(json.load(open(os.path.expanduser("~/.cache/nom-pruebas/cuentas-prueba.json")))["pruebaa55x2"])
    t0 = time.time()
    dlg.get_by_role("button", name="Entrar con mi cuenta").click(); p.wait_for_timeout(8000)
    print("B-4 después:", p.url)
    print("B-4 quién soy:", json.dumps(p.evaluate("() => { try { return NOM.api.usuario(); } catch (e) { return String(e); } }"), ensure_ascii=False)[:250])
    print("B-4 textos:", p.evaluate("() => [...document.querySelectorAll('h1,h2,.alerta,[role=status],.aviso')].filter(e => e.offsetParent).map(e => e.innerText.trim().slice(0,100))")[:6])
    p.screenshot(path=os.path.join(D, "b4b.png"))
    print("B-4 errores:", err[:4])
    b.close()
