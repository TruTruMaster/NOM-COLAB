"""B-3 (alias sin Internet) y B-4 (pase con Internet) contra el A55 como servidor."""
import sys, time, os, json
from playwright.sync_api import sync_playwright
ENL = sys.argv[1]; TEL = ENL.split("/unirse")[0]
D = os.path.expanduser("~/.cache/nom-pruebas/capturas-reales"); os.makedirs(D, exist_ok=True)
def vis(p, n=25):
    return p.evaluate("""() => [...document.querySelectorAll('button,a,h1,h2,h3,input,label,.alerta,[role=status]')].filter(e => e.offsetParent).map(e => (e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || '').trim().replace(/\\s+/g,' ').slice(0,70)).filter(Boolean)""")[:n]
with sync_playwright() as pw:
    # B-3: sin Internet (la nube no se alcanza)
    b = pw.chromium.launch(args=["--host-resolver-rules=MAP nomcolab.dpdns.org 127.0.0.1:1"])
    p = b.new_page(viewport={"width": 1300, "height": 850}); err = []
    p.on("pageerror", lambda e: err.append(str(e)[:200]))
    p.goto(ENL); p.wait_for_timeout(5000)
    print("B-3 al abrir el enlace:", vis(p))
    for t in ("Entrar", "Entrar al espacio", "Unirme", "Continuar", "Entrar con un apodo", "Entrar sin cuenta"):
        try: p.get_by_role("button", name=t).first.click(timeout=2000); p.wait_for_timeout(3000); print("B-3 toqué:", t); break
        except Exception: pass
    p.wait_for_timeout(3000)
    print("B-3 después:", p.url, vis(p, 20))
    usuario = p.evaluate("() => { try { return NOM.api.usuario(); } catch (e) { return String(e); } }")
    print("B-3 quién soy:", json.dumps(usuario, ensure_ascii=False)[:200])
    p.screenshot(path=os.path.join(D, "b3.png"))
    print("B-3 errores:", err[:3])
    b.close()
    # B-4: con Internet; primero la cuenta de la nube
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1300, "height": 850}); err = []
    p.on("pageerror", lambda e: err.append(str(e)[:200]))
    p.goto("https://nomcolab.dpdns.org/"); p.wait_for_selector("#u", timeout=30000)
    p.fill("#u", "pruebaa55x2"); p.fill("#c", json.load(open(os.path.expanduser("~/.cache/nom-pruebas/cuentas-prueba.json")))["pruebaa55x2"]); p.click("button[type=submit]")
    p.wait_for_function("() => !!localStorage.getItem('nom.token')", timeout=30000); p.wait_for_timeout(2000)
    p.goto(ENL); p.wait_for_timeout(6000)
    print("B-4 al abrir el enlace:", vis(p))
    for t in ("Entrar con mi cuenta", "Entrar como pruebaa55x2", "Entrar", "Continuar"):
        try: p.get_by_role("button", name=t).first.click(timeout=2000); p.wait_for_timeout(4000); print("B-4 toqué:", t); break
        except Exception: pass
    p.wait_for_timeout(3000)
    print("B-4 después:", p.url, vis(p, 20))
    print("B-4 quién soy:", json.dumps(p.evaluate("() => { try { return NOM.api.usuario(); } catch (e) { return String(e); } }"), ensure_ascii=False)[:200])
    p.screenshot(path=os.path.join(D, "b4.png"))
    print("B-4 errores:", err[:3])
    b.close()
