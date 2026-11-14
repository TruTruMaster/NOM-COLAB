"""Fase 15 en un navegador de verdad: espacios cifrados de extremo a extremo y el chat.

  ~/.cache/nom-pruebas/venv/bin/python pruebas/interfaz/prueba_e2e.py SALIDA

- Ana crea un espacio cifrado y un documento: el servidor solo guarda lo cifrado (nombre del espacio,
  nombre del documento, texto letra por letra), y la estructura sigue en claro (cuántas letras).
- Beto entra por su nombre: la app de Ana le da la llave (envuelta con su llave pública) y él lee y
  escribe en vivo.
- Alguien sin cuenta entra con el QR (la llave va en el #) y con un alias, y lee el documento.
- El enlace para ver lleva la llave del documento; sin ella no se lee.
- Chat cifrado: el servidor no lo puede leer; los miembros sí.
"""
import os, sys, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nomprueba as N

BIEN, MAL = [0], []


def check(nombre, ok, detalle=""):
    if ok: BIEN[0] += 1; print("  ok  ", nombre, flush=True)
    else: MAL.append(f"{nombre}: {str(detalle)[:240]}"); print("  MAL ", nombre, "→", str(detalle)[:240], flush=True)


def otro(A, nombre=None):
    X = N.Navegador.__new__(N.Navegador)
    X.pw, X.b = A.pw, A.b
    X.ctx = A.b.new_context(viewport={"width": 1300, "height": 900})
    X.p = X.ctx.new_page(); X.errores = []
    X.p.on("pageerror", lambda e: X.errores.append(str(e)))
    X.cerrar = lambda: X.ctx.close()
    return X


def texto(nav):
    return nav.p.evaluate("() => { const e = [...document.querySelectorAll('[contenteditable]')].find(x => x.offsetParent && x.closest('.ed-lienzo')); return e ? e.innerText : ''; }") or ""


def esperar(fn, s=15):
    fin = time.time() + s
    while time.time() < fin:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.4)
    return None


def main():
    salida = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(salida, exist_ok=True)
    if not N.esperar_servidor(): sys.exit(2)
    a, b = N.cuenta(), N.cuenta()
    A = N.Navegador()
    try:
        print("\n== Espacio cifrado de extremo a extremo", flush=True)
        A.entrar(a)
        A.p.wait_for_timeout(1500)
        check("al entrar, la cuenta tiene su par de llaves", bool((N.api("GET", "/api/cuentas/llaves", None, a["token"])[1] or {}).get("publica")), "")
        A.p.evaluate("() => NOM.vistaEspacios.nuevoEspacio()")
        A.p.wait_for_selector("#ne"); A.p.fill("#ne", "Proyecto secreto")
        A.p.check("input[name=e2e]"); A.p.click(".velo .hoja [data-si]")
        A.p.wait_for_timeout(1500)
        esps = N.api("GET", "/api/espacios", None, a["token"])[1] or []
        e = next((x for x in esps if x.get("e2e")), None)
        check("se crea el espacio cifrado", bool(e), esps)
        check("…el servidor no sabe su nombre", e and e["nombre"].startswith("e2e:") and "secreto" not in e["nombre"].lower(), e and e["nombre"][:30])
        check("…pero la app sí lo muestra", "Proyecto secreto" in A.p.evaluate("() => document.body.innerText"), "")
        A.p.evaluate(f"() => NOM.api.post('/api/espacios/{e['id']}/documentos', {{ nombre: 'Plan cifrado', modo: 'TEXTO', ops: [] }}).then(d => location.hash = '#/doc/' + d.id)")
        A.p.wait_for_selector(".ed-herramientas", timeout=15000); A.p.wait_for_timeout(800)
        d = A.p.evaluate("() => NOM.editorActual.id")
        A.p.evaluate("() => { const ed = [...document.querySelectorAll('[contenteditable=true]')].find(x => x.offsetParent); ed.focus(); }")
        A.p.keyboard.type("SECRETO E2E 123"); A.p.wait_for_timeout(1800)
        st = (N.api("GET", f"/api/documentos/{d}", None, a["token"])[1] or {})
        crudo = json.dumps(st.get("estado", {}), ensure_ascii=False)
        letras = sum(len(x.get("x", "")) for sq in st.get("estado", {}).get("seq", {}).values() for x in sq.get("ins", []))
        check("el servidor guarda el texto cifrado", "SECRETO" not in crudo and letras >= 15, crudo[:120])
        check("…y el nombre del documento también", st.get("documento", {}).get("nombre", "").startswith("e2e:"), st.get("documento", {}).get("nombre", "")[:30])
        check("en la app de Ana se lee", "SECRETO E2E 123" in texto(A), texto(A))
        A.p.reload(); A.p.wait_for_selector(".ed-herramientas", timeout=15000); A.p.wait_for_timeout(800)
        check("…también al volver a abrirlo", "SECRETO E2E 123" in texto(A), texto(A))

        print("\n== Beto entra por su nombre y recibe la llave", flush=True)
        B = otro(A)
        try:
            B.entrar(b); B.p.wait_for_timeout(1200)
            N.api("PUT", f"/api/espacios/{e['id']}/accesos", {"usuario": b["nombre"], "permiso": "EDICION"}, a["token"])
            A.p.goto(N.B + "/#/espacio/" + e["id"]); A.p.wait_for_timeout(2500)
            ll = N.api("GET", f"/api/espacios/{e['id']}/llaves", None, b["token"])[1] or {}
            check("la app de Ana le da la llave a Beto (envuelta para él)", bool(ll.get("mia")), ll)
            B.p.goto(N.B + "/#/doc/" + d); B.p.wait_for_selector(".ed-herramientas", timeout=15000); B.p.wait_for_timeout(1000)
            check("Beto lee el documento cifrado", "SECRETO E2E 123" in texto(B), texto(B))
            A.p.goto(N.B + "/#/doc/" + d); A.p.wait_for_selector(".ed-herramientas", timeout=15000); A.p.wait_for_timeout(800)
            B.p.evaluate("() => { const ed = [...document.querySelectorAll('[contenteditable=true]')].find(x => x.offsetParent); ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); }")
            B.p.keyboard.type(" Y BETO");
            vivo = esperar(lambda: "Y BETO" in texto(A), 10)
            check("lo que escribe Beto le llega a Ana en vivo (cifrado en el camino)", bool(vivo), texto(A))
            print("\n== Chat cifrado", flush=True)
            A.p.evaluate(f"() => NOM.api.post('/api/espacios/{e['id']}/chat', {{ texto: 'hola, esto es privado' }})"); time.sleep(1)
            chat_crudo = json.dumps(N.api("GET", f"/api/espacios/{e['id']}/chat", None, a["token"])[1] or {}, ensure_ascii=False)
            check("el servidor guarda el chat cifrado", "privado" not in chat_crudo and "e2e:" in chat_crudo, chat_crudo[:160])
            leido = B.p.evaluate(f"() => NOM.api.get('/api/espacios/{e['id']}/chat').then(r => r.mensajes.map(m => m.texto).join('|'))")
            check("Beto lee el mensaje", "hola, esto es privado" in leido, leido)
            B.p.goto(N.B + "/#/espacio/" + e["id"]); B.p.wait_for_timeout(1500)
            B.p.click("[data-a=chat]"); B.p.wait_for_selector(".chat-lista .chat-msg", timeout=10000)
            check("…y lo ve en la ventana del chat", "hola, esto es privado" in B.p.evaluate("() => document.querySelector('.chat-lista').innerText"), "")
            B.p.fill(".chat-escribir textarea", "respuesta de Beto"); B.p.keyboard.press("Enter"); B.p.wait_for_timeout(1500)
            check("Beto contesta desde el chat", "respuesta de Beto" in A.p.evaluate(f"() => NOM.api.get('/api/espacios/{e['id']}/chat').then(r => r.mensajes.map(m => m.texto).join('|'))"), "")
            check("sin errores de JavaScript (Beto)", not B.errores, B.errores[:3])
        finally:
            B.cerrar()

        print("\n== Con el QR: la llave va en el # (y alias)", flush=True)
        enl = N.api("POST", f"/api/espacios/{e['id']}/enlaces", {"permiso": "EDICION", "horas": 1, "invitados": True}, a["token"])[1]
        frag = A.p.evaluate(f"() => NOM.e2e.fragmento('{e['id']}')")
        check("el QR de un espacio cifrado lleva la llave después del #", frag.startswith("#k="), frag[:10])
        Cn = otro(A)
        try:
            Cn.p.goto(N.B + "/unirse?c=" + enl["codigo"] + frag); Cn.p.wait_for_timeout(1500)
            check("quien llega con el QR ve el nombre del espacio", "Proyecto secreto" in Cn.p.evaluate("() => document.body.innerText"), Cn.p.evaluate("() => document.body.innerText")[:200])
            Cn.p.click("[data-alias]"); Cn.p.wait_for_timeout(2500)
            Cn.p.goto(N.B + "/#/doc/" + d); Cn.p.wait_for_selector(".ed-herramientas", timeout=15000); Cn.p.wait_for_timeout(1000)
            check("…entra con un alias y lee el documento", "SECRETO E2E 123" in texto(Cn), texto(Cn))
        finally:
            Cn.cerrar()

        print("\n== Enlace para ver: con la llave del documento", flush=True)
        tok = (N.api("POST", f"/api/documentos/{d}/enlace-ver", None, a["token"])[1] or {}).get("enlace")
        kd = A.p.evaluate(f"() => NOM.e2e.llaveDocTexto('{d}')")
        V = otro(A)
        try:
            visto = lambda: V.p.evaluate("() => document.body.innerText + ' ' + [...document.querySelectorAll('iframe')].map(f => { try { return f.contentDocument.body.innerText; } catch (e) { return ''; } }).join(' ')")
            V.p.goto(N.B + "/#/ver/" + tok + "~" + kd); V.p.wait_for_timeout(2500)
            check("con la llave en el enlace se lee", "SECRETO E2E 123" in visto() and "Plan cifrado" in visto(), visto()[:200])
            check("…y no aparece el nombre cifrado del espacio", "e2e:" not in visto(), visto()[:200])
            V.p.goto(N.B + "/#/ver/" + tok); V.p.reload(); V.p.wait_for_timeout(2500)
            check("sin la llave no", "SECRETO E2E 123" not in visto(), "")
        finally:
            V.cerrar()
        print("\n== Proyector: la llave del documento va en el # del QR", flush=True)
        A.p.evaluate(f"() => NOM.api.post('/api/espacios/{e['id']}/documentos', {{ nombre: 'Clase cifrada', modo: 'PRESENTACION', ops: [] }}).then(d => location.hash = '#/doc/' + d.id)")
        A.p.wait_for_selector(".ed-herramientas", timeout=15000); A.p.wait_for_timeout(1200)
        pd = A.p.evaluate("() => NOM.editorActual.id")
        A.p.evaluate("() => { const ed = NOM.editorActual, doc = ed.doc; doc.cambiar('f1', { tipo: 'forma', forma: 'rect', pagina: ed.pagina, orden: 1, x: 120, y: 120, w: 400, h: 120, z: 1, html: '<div>DIAPO SECRETA</div>' }); NOM.modos.PRESENTACION._lienzo.render(); }")
        A.p.wait_for_timeout(2500)
        crudo_p = json.dumps(N.api("GET", f"/api/documentos/{pd}", None, a["token"])[1] or {}, ensure_ascii=False)
        check("el servidor guarda la diapositiva cifrada", "DIAPO" not in crudo_p and "f1" in crudo_p, crudo_p[:160])
        codigo = (N.api("POST", f"/api/documentos/{pd}/proyeccion", None, a["token"])[1] or {}).get("codigo")
        kp = A.p.evaluate(f"() => NOM.e2e.llaveDocTexto('{pd}')")
        Pz = otro(A)
        try:
            Pz.p.goto(N.B + "/proyectar?c=" + codigo + "#k=" + kp)
            ok = esperar(lambda: "DIAPO SECRETA" in Pz.p.evaluate("() => document.body.innerText"), 12)
            check("la pantalla del proyector la muestra con la llave del QR", bool(ok), Pz.p.evaluate("() => document.body.innerText")[:200])
        finally:
            Pz.cerrar()
        Pz = otro(A)   # otra pestaña: sin la llave que guardó la anterior
        try:
            Pz.p.goto(N.B + "/proyectar?c=" + codigo); Pz.p.wait_for_timeout(3000)
            check("…sin la llave no", "DIAPO SECRETA" not in Pz.p.evaluate("() => document.body.innerText"), "")
        finally:
            Pz.cerrar()
        check("un documento cifrado no se copia a otro espacio", 400 == N.api("POST", f"/api/documentos/{d}/copia", {"espacioId": N.espacio(a["token"], "Otro")}, a["token"])[0], "")
        errores = [x for x in A.errores if "Failed to load resource" not in x]
        check("sin errores de JavaScript (Ana)", not errores, errores[:3])
    finally:
        A.cerrar()
    print(f"\nExtremo a extremo: {BIEN[0]} bien, {len(MAL)} mal")
    for x in MAL: print("  MAL", x)
    sys.exit(1 if MAL else 0)


if __name__ == "__main__":
    main()
