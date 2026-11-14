import sys, time, re, os
from comun import *
import a55
DOC = sys.argv[1]
norm = lambda s: re.sub(r"\s+", "", s or "")
def a55_texto():
    ns = [n for n in a55.nodos() if n["c"] == "EditText" and len(n["t"]) > 30]
    return ns[0]["t"] if ns else ""
def espera(equipos, marca, celular=True, limite=20):
    t0 = time.time(); llego = {}
    while time.time() - t0 < limite and len(llego) < len(equipos) + (1 if celular else 0):
        for e in equipos:
            if e.nombre not in llego and marca in norm(e.texto()): llego[e.nombre] = round(time.time() - t0, 2)
        if celular and "A55" not in llego and marca in norm(a55_texto()): llego["A55"] = round(time.time() - t0, 2)
        time.sleep(0.1)
    return llego
def escribir_fin(e, txt):
    p = e.p
    ed = p.locator("[contenteditable=true]").first
    ed.click(); p.keyboard.press("Control+End"); p.keyboard.press("Enter"); p.keyboard.type(txt, delay=35)
with sync_playwright() as pw:
    lc = Equipo(pw, "laptop-chromium-x2", "chromium", "pruebaa55x2")
    lf = Equipo(pw, "laptop-firefox-x3", "firefox", "pruebaa55x3")
    fl = Equipo(pw, "escritorio-flast1", cdp="http://localhost:9333")
    for e in (lc, lf): e.entrar()
    for e in (lc, lf, fl): e.abrir(DOC)
    print("abierto en los tres navegadores; A55 ya estaba en el documento", flush=True)
    otros = lambda *ex: [e for e in (lc, lf, fl) if e not in ex]
    # A. escritorio escribe
    escribir_fin(fl, "Escritorio uno"); print("A escritorio→", espera(otros(fl), "Escritoriouno"), flush=True)
    # B. laptop escribe
    escribir_fin(lc, "Laptop dos"); print("B laptop→", espera(otros(lc), "Laptopdos"), flush=True)
    # C. celular escribe con el teclado del teléfono
    c = a55.buscar("Entendido")
    if c: a55.tocar(c["cx"], c["cy"])
    ns = [n for n in a55.nodos() if n["c"] == "EditText" and len(n["t"]) > 30]
    x1, y1, x2, y2 = ns[0]["b"]; a55.tocar(x2 - 60, y2 - 40); time.sleep(0.8)
    a55.teclear_ime("\ncelular tres"); t0 = time.time()
    print("C celular→", espera((lc, lf, fl), "celulartres", celular=False), flush=True)
    a55.ocultar_teclado()
    # D. el lector intenta escribir
    antes = norm(lf.texto())
    try:
        lf.p.locator("[contenteditable]").first.click(timeout=3000); lf.p.keyboard.press("Control+End"); lf.p.keyboard.type(" lector intenta", delay=30)
    except Exception as ex: print("D lector: no pudo hacer clic:", str(ex)[:80])
    time.sleep(3)
    print("D lector: su pantalla cambió:", "lectorintenta" in norm(lf.texto()), "| llegó a otros:", any("lectorintenta" in norm(e.texto()) for e in (lc, fl)),
          "| editable:", lf.ev("() => [...document.querySelectorAll('[contenteditable=true]')].filter(x => x.offsetParent).length"), flush=True)
    # E. dos personas en el mismo renglón a la vez (intercalado letra por letra)
    for e in (fl, lc):
        e.p.locator("[contenteditable=true]").first.click(); e.p.keyboard.press("Control+End")
    fl.p.keyboard.press("Enter")
    s1, s2 = "AAAAAAAAAAAAAAAAAAAA", "bbbbbbbbbbbbbbbbbbbb"
    for i in range(20):
        fl.p.keyboard.type(s1[i]); lc.p.keyboard.type(s2[i]); time.sleep(0.05)
    time.sleep(4)
    t = {e.nombre: norm(e.texto()) for e in (lc, lf, fl)}; t["A55"] = norm(a55_texto())
    base = t["escritorio-flast1"]
    print("E iguales:", {k: v == base for k, v in t.items()}, "| A:", base.count("A"), "b:", base.count("b"), flush=True)
    if len(set(t.values())) > 1:
        for k, v in t.items(): print("   ", k, v[-90:])
    for e in (lc, lf, fl): print("errores", e.nombre, e.err[:5])
    lc.foto(os.path.join(os.path.expanduser("~/.cache/nom-pruebas/capturas-reales"), "lc")); fl.foto(os.path.join(os.path.expanduser("~/.cache/nom-pruebas/capturas-reales"), "fl"))
    a55.cap("sync-a55", 300)
