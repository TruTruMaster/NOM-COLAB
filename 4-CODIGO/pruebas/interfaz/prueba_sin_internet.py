"""Fase 13 en un navegador de verdad: lo que se hace sin Internet.

  ~/.cache/nom-pruebas/venv/bin/python pruebas/interfaz/prueba_sin_internet.py SALIDA

Contra el servidor local (NOM_BASE, por omisión http://localhost:8099):
  C. Crear un documento DENTRO de un espacio sin red: queda en el equipo marcado con su espacio y se
     sube solo al volver la red.
  B. Dos personas en el mismo documento; una se queda sin red, las dos escriben y, al volver, se abre
     una RAMA (el original no se toca); se compara y se fusiona. Un corte corto se junta solo.
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nomprueba as N

BIEN, MAL = [0], []


def check(nombre, ok, detalle=""):
    if ok: BIEN[0] += 1; print("  ok  ", nombre, flush=True)
    else: MAL.append(f"{nombre}: {str(detalle)[:240]}"); print("  MAL ", nombre, "→", str(detalle)[:240], flush=True)


def texto_editor(nav):
    return nav.p.evaluate("() => { const e = [...document.querySelectorAll('[contenteditable]')].find(x => x.offsetParent && x.closest('.ed-lienzo')); return e ? e.innerText : ''; }") or ""


def al_final(nav):
    nav.p.evaluate("""() => { const ed = [...document.querySelectorAll('[contenteditable=true]')].find(x => x.offsetParent); ed.focus();
        const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")


def texto_servidor(tok, doc):
    st, d = N.api("GET", f"/api/documentos/{doc}", None, tok)
    return "".join(e.get("x", "") for sq in ((d or {}).get("estado", {}).get("seq", {}) or {}).values() for e in sq.get("ins", [])) if st == 200 else ""


def avisos(nav):
    return nav.p.evaluate("() => [...document.querySelectorAll('.avisos .aviso')].map(x => x.innerText).join(' | ')") or ""


def esperar(fn, s=15, paso=0.5):
    fin = time.time() + s
    while time.time() < fin:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(paso)
    return None


def main():
    salida = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(salida, exist_ok=True)
    if not N.esperar_servidor(): print("El servidor no contesta en", N.B); sys.exit(2)
    a, b = N.cuenta(), N.cuenta()
    esp = N.espacio(a["token"], "Salón sin red")
    N.api("PUT", f"/api/espacios/{esp}/accesos", {"usuario": b["nombre"], "permiso": "EDICION"}, a["token"])
    A = N.Navegador()
    try:
        A.entrar(a)
        # Para no esperar 2 minutos: en esta prueba, «sin conexión» empieza al segundo.
        A.p.evaluate("() => localStorage.setItem('nom.prueba.umbralRama', '1000')")
        A.p.reload(); A.p.wait_for_function("() => !!(window.NOM && NOM.ramas && NOM.ramas.UMBRAL === 1000)", timeout=20000)
        print("\n== C. Crear dentro de un espacio sin Internet", flush=True)
        A.p.goto(N.B + "/#/espacio/" + esp); A.p.wait_for_selector(".encabezado h1", timeout=20000); A.p.wait_for_timeout(800)
        A.ctx.set_offline(True); A.p.wait_for_timeout(400)
        A.p.click(".encabezado [data-a=nuevo]"); A.p.wait_for_selector("#nd", timeout=8000)
        A.p.fill("#nd", "Acta sin red"); A.p.click("[data-crear]")
        A.p.wait_for_function("() => location.hash.startsWith('#/local/')", timeout=10000)
        check("sin red, «Nuevo documento» en un espacio se crea en este equipo", A.p.evaluate("() => location.hash").startswith("#/local/"), A.p.evaluate("() => location.hash"))
        A.p.wait_for_selector(".ed-herramientas", timeout=10000); A.p.wait_for_timeout(600)
        banda = A.p.evaluate("() => (document.querySelector('[data-avisos-doc]') || {}).innerText || ''")
        check("…y dice que se sube solo a su espacio al volver la red", "se sube solo" in banda and "Salón sin red" in banda, banda)
        al_final(A); A.p.keyboard.type("Escrito sin conexión."); A.p.wait_for_timeout(900)
        A.p.goto(N.B + "/#/espacio/" + esp); A.p.wait_for_timeout(1500)
        pend = A.p.evaluate("() => (document.querySelector('[data-pendientes-subir]') || {}).innerText || ''")
        check("en el espacio sale «espera a que vuelva la red para subirse»", "espera" in pend and "Acta sin red" in pend, pend)
        A.foto(os.path.join(salida, "c-pendiente.png"))
        A.ctx.set_offline(False)
        subido = esperar(lambda: next((x for x in (N.api("GET", f"/api/espacios/{esp}/documentos", None, a["token"])[1] or []) if x.get("nombre") == "Acta sin red"), None), 20)
        check("al volver la red se sube solo al espacio", bool(subido), avisos(A))
        check("…con lo que se escribió sin conexión", subido and "Escrito sin conexión." in texto_servidor(a["token"], subido["id"]), texto_servidor(a["token"], subido["id"]) if subido else "")
        A.p.wait_for_timeout(1200)
        check("…y ya no queda la copia «por subir» en el equipo", A.p.evaluate(f"() => NOM.local.pendientesDe('{esp}').length") == 0, A.p.evaluate(f"() => NOM.local.pendientesDe('{esp}').length"))

        print("\n== B. Rama: los dos cambiaron mientras uno no tenía red", flush=True)
        d = N.documento(a["token"], esp, "TEXTO", "Informe")
        # Otra persona en otra ventana (otro contexto del mismo navegador: no comparten nada).
        Bn = N.Navegador.__new__(N.Navegador)
        Bn.pw, Bn.b = A.pw, A.b
        Bn.ctx = A.b.new_context(viewport={"width": 1400, "height": 900})
        Bn.p = Bn.ctx.new_page(); Bn.errores = []
        Bn.p.on("pageerror", lambda e: Bn.errores.append(str(e)))
        Bn.p.on("console", lambda m: Bn.errores.append("console: " + m.text) if m.type == "error" else None)
        Bn.cerrar = lambda: Bn.ctx.close()
        try:
            Bn.entrar(b)
            A.abrir(d); al_final(A); A.p.keyboard.type("Hola equipo."); A.p.wait_for_timeout(1500)
            Bn.abrir(d); Bn.p.wait_for_function("() => document.body.innerText.includes('Hola equipo.')", timeout=10000)
            A.ctx.set_offline(True); A.p.wait_for_timeout(800)
            al_final(A); A.p.keyboard.type(" SIN RED"); A.p.wait_for_timeout(1600)
            al_final(Bn); Bn.p.keyboard.type(" EN LINEA"); Bn.p.wait_for_timeout(1500)
            check("(mientras) el servidor tiene lo de quien sí tiene red", "EN LINEA" in texto_servidor(a["token"], d), texto_servidor(a["token"], d))
            A.ctx.set_offline(False)
            aviso = esperar(lambda: "Se creó una rama" in avisos(A) and avisos(A), 25)
            check("al volver: «Se creó una rama porque … cambió el documento»", bool(aviso), avisos(A))
            A.foto(os.path.join(salida, "b-rama-creada.png"))
            t_orig = texto_servidor(a["token"], d)
            check("el original no se tocó (no tiene lo escrito sin red)", "SIN RED" not in t_orig and "EN LINEA" in t_orig, t_orig)
            lista = N.api("GET", f"/api/espacios/{esp}/documentos", None, a["token"])[1] or []
            rama = next((x for x in lista if x.get("ramaDe") == d), None)
            check("la rama está en el espacio, con su nombre «— rama de …»", rama and "rama de " + a["nombre"] in rama.get("nombre", ""), [x.get("nombre") for x in lista])
            check("…y tiene lo escrito sin red", rama and "SIN RED" in texto_servidor(a["token"], rama["id"]), texto_servidor(a["token"], rama["id"]) if rama else "")
            A.p.wait_for_timeout(1500)
            check("el editor del original quedó como en el servidor", "SIN RED" not in texto_editor(A) and "EN LINEA" in texto_editor(A), texto_editor(A))
            banda = A.p.evaluate("() => (document.querySelector('[data-avisos-doc]') || {}).innerText || ''")
            check("el original dice «Este documento tiene una rama»", "una rama" in banda, banda)
            Bn.p.wait_for_timeout(1500)
            check("quien estaba en línea también ve que hay una rama", "una rama" in (Bn.p.evaluate("() => (document.querySelector('[data-avisos-doc]') || {}).innerText || ''")), Bn.p.evaluate("() => (document.querySelector('[data-avisos-doc]') || {}).innerText || ''"))
            # Comparar y fusionar desde la rama
            A.abrir(rama["id"]); A.p.wait_for_timeout(800)
            banda = A.p.evaluate("() => (document.querySelector('[data-avisos-doc]') || {}).innerText || ''")
            check("la rama dice de qué documento es", "rama" in banda and "Informe" in banda, banda)
            A.p.click("[data-a=rama-comparar]"); A.p.wait_for_selector(".comparar", timeout=10000); A.p.wait_for_timeout(500)
            comp = A.p.evaluate("() => document.querySelector('.comparar').innerText")
            check("«Comparar con el original» muestra lo distinto en cada lado", "SIN RED" in comp and "EN LINEA" in comp, comp[:300])
            A.foto(os.path.join(salida, "b-comparar.png"))
            A.p.click("[data-fusionar]")
            fusion = esperar(lambda: "SIN RED" in texto_servidor(a["token"], d) and texto_servidor(a["token"], d), 15)
            check("«Fusionar en el original»: el original queda con lo de los dos", fusion and "EN LINEA" in fusion, texto_servidor(a["token"], d))
            vs = N.api("GET", f"/api/documentos/{d}/versiones", None, a["token"])[1] or []
            check("…con una versión «Antes de fusionar» para regresar", any("Antes de fusionar" in (v.get("etiqueta") or "") for v in vs), [v.get("etiqueta") for v in vs][:5])
            A.p.wait_for_timeout(800)

            print("\n== B.2 Un corte corto se junta solo (sin rama)", flush=True)
            d2 = N.documento(a["token"], esp, "TEXTO", "Notas")
            A.abrir(d2); al_final(A); A.p.keyboard.type("Uno."); A.p.wait_for_timeout(1200)
            Bn.abrir(d2); Bn.p.wait_for_timeout(800)
            A.p.evaluate("() => localStorage.removeItem('nom.prueba.umbralRama')"); A.p.reload(); A.p.wait_for_selector(".ed-herramientas", timeout=20000); A.p.wait_for_timeout(800)
            A.ctx.set_offline(True); A.p.wait_for_timeout(300)
            al_final(A); A.p.keyboard.type(" corte"); al_final(Bn); Bn.p.keyboard.type(" otro"); Bn.p.wait_for_timeout(700)
            A.ctx.set_offline(False)
            juntos = esperar(lambda: "corte" in texto_servidor(a["token"], d2) and texto_servidor(a["token"], d2), 15)
            check("al volver en segundos, lo de los dos queda en el mismo documento", juntos and "otro" in juntos, texto_servidor(a["token"], d2))
            ramas2 = N.api("GET", f"/api/documentos/{d2}/ramas", None, a["token"])[1] or []
            check("…y no se abrió ninguna rama", len(ramas2) == 0, ramas2)
            check("sin errores de JavaScript (quien sí tenía red)", not Bn.errores, Bn.errores[:3])
        finally:
            Bn.cerrar()
        errores = [e for e in A.errores if "Failed to load resource" not in e and "ERR_INTERNET_DISCONNECTED" not in e]
        check("sin errores de JavaScript (quien se quedó sin red)", not errores, errores[:3])
    finally:
        A.cerrar()
    print(f"\nSin Internet: {BIEN[0]} bien, {len(MAL)} mal")
    for x in MAL: print("  MAL", x)
    sys.exit(1 if MAL else 0)


if __name__ == "__main__":
    main()
