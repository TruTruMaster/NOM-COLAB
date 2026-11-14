import sys, time, re, os, statistics
from comun import *
DOC = sys.argv[1]; N = int(sys.argv[2]) if len(sys.argv) > 2 else 8
norm = lambda s: re.sub(r"\s+", "", s or "")
LECTOR_JS = "() => { const e = document.querySelector('.modo-TEXTO') || document.querySelector('.ed-lienzo') || document.body; return e.innerText; }"
with sync_playwright() as pw:
    lc = Equipo(pw, "laptop-chromium-x2", "chromium", "pruebaa55x2")
    lf = Equipo(pw, "laptop-firefox-x3", "firefox", "pruebaa55x3")
    fl = Equipo(pw, "escritorio-flast1", cdp="http://localhost:9333")
    for e in (lc, lf): e.entrar()
    for e in (lc, lf, fl): e.abrir(DOC)
    lf.foto(os.path.join(os.path.expanduser("~/.cache/nom-pruebas/capturas-reales"), "lector"))
    res = {"escritorio→laptop": [], "laptop→escritorio": [], "escritorio→lector(firefox)": []}
    for i in range(N):
        for (src, dst, k) in ((fl, lc, "escritorio→laptop"), (lc, fl, "laptop→escritorio")):
            marca = f"Q{i}{'e' if src is fl else 'l'}Z"
            src.p.locator("[contenteditable=true]").first.click(); src.p.keyboard.press("Control+End"); src.p.keyboard.type(" " + marca)
            t0 = time.time()
            while time.time() - t0 < 15:
                if marca in norm(dst.texto()): res[k].append(time.time() - t0); break
                if src is fl and marca in norm(lf.ev(LECTOR_JS)) and len(res["escritorio→lector(firefox)"]) <= i: res["escritorio→lector(firefox)"].append(time.time() - t0)
                time.sleep(0.03)
            if src is fl and len(res["escritorio→lector(firefox)"]) <= i:
                while time.time() - t0 < 15:
                    if marca in norm(lf.ev(LECTOR_JS)): res["escritorio→lector(firefox)"].append(time.time() - t0); break
                    time.sleep(0.03)
            time.sleep(0.4)
    for k, v in res.items():
        if v: print(f"{k}: n={len(v)} p50={statistics.median(v)*1000:.0f} ms  máx={max(v)*1000:.0f} ms  todos={[round(x*1000) for x in v]}")
        else: print(k, "sin datos")
    print("errores:", lc.err[:3], lf.err[:3], fl.err[:3])
