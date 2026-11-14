import sys   # B-11: python3 chat_laptop.py ENLACE_DEL_TELEFONO captura.png
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b = pw.chromium.launch(args=["--host-resolver-rules=MAP nomcolab.dpdns.org 127.0.0.1:1"])
    p = b.new_page(viewport={"width": 1300, "height": 850})
    p.goto(sys.argv[1]); p.wait_for_timeout(4000)
    p.get_by_role("button", name="Entrar").first.click(); p.wait_for_timeout(4000)
    p.get_by_role("button", name="Chat").first.click(); p.wait_for_timeout(2500)
    p.get_by_role("button", name="foto-prueba.png").first.click(); p.wait_for_timeout(1500)
    print("al tocar la foto:", p.evaluate("() => [...document.querySelectorAll('img')].filter(i => i.offsetParent && i.naturalWidth > 300).map(i => i.naturalWidth + 'x' + i.naturalHeight)"))
    p.screenshot(path=sys.argv[2])
    p.keyboard.press("Escape"); p.wait_for_timeout(800)
    if not p.locator("textarea:visible").count(): p.get_by_role("button", name="Chat").first.click(); p.wait_for_timeout(2000)
    t = p.locator("textarea:visible").last
    t.fill("Respuesta desde la laptop sin Internet"); t.press("Enter"); p.wait_for_timeout(2500)
    print("enviado")
    b.close()
