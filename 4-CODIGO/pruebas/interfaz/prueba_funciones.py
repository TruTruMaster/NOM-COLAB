#!/usr/bin/env python3
"""Revisa que cada función haga LO CORRECTO (no solo que no truene, eso es rastreo.py).

Cada caso se hace como lo haría una persona (clic, teclado, menús) y luego se revisa el resultado
en la pantalla y en el documento. Imprime "ok" o "MAL" por caso y un total al final.

  ~/.cache/nom-pruebas/venv/bin/python pruebas/interfaz/prueba_funciones.py SALIDA [--movil] [--solo hoja texto …]
  ... --cdp http://localhost:9222 --base http://IP:8099     (el Chrome del teléfono o de otro equipo)
"""
import argparse, base64, json, os, re, sys, time, zipfile, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nomprueba as N

APP = os.environ.get("NOM_APP") == "1"
def url(base, h):
    """Dirección de una vista. En la app (WebView) la página es el archivo empaquetado y el servidor se fija aparte."""
    if APP: return "file:///android_asset/index.html" + ("#" + h.split("#", 1)[1] if "#" in h else "")
    return base + h

BIEN, MAL, DETALLE = [0], [0], []


def check(nombre, cond, info=""):
    if cond: BIEN[0] += 1
    else: MAL[0] += 1; DETALLE.append(f"{nombre}: {info}")
    print(f"  {'ok ' if cond else 'MAL'}  {nombre}" + (f"   [{str(info)[:200]}]" if (info and not cond) or os.environ.get("NOM_DETALLE") else ""), flush=True)
    return cond


class Pagina:
    """Ayudas sobre una página de Playwright ya con sesión."""
    def __init__(self, p, base):
        self.p, self.base = p, base
        self.errores = []
        p.on("pageerror", lambda e: self.errores.append(str(e)[:300]))
        p.on("console", lambda m: self.errores.append("consola: " + m.text[:300]) if m.type == "error" and "Content Security Policy" not in m.text and "Failed to load resource" not in m.text else None)
        p.on("dialog", lambda d: d.accept())

    def ev(self, js, *a): return self.p.evaluate(js, *a)
    def t(self, ms): self.p.wait_for_timeout(ms)

    def entrar(self, c):
        p = self.p
        p.goto(url(self.base, "/")); p.wait_for_function("() => window.NOM && NOM.api", timeout=40000)
        if APP and "android_asset" in p.url:   # la app: se fija el servidor de pruebas (lo de la persona se respalda antes)
            p.evaluate("(b) => NOM.api.fijarServidor(b)", self.base)
        self.ev("() => { try { NOM.api.limpiarSesion(); } catch (e) {} }")
        p.goto(url(self.base, "/")); p.wait_for_selector("#u", timeout=40000)
        p.fill("#u", c["nombre"]); p.fill("#c", N.CL); p.click("button[type=submit]")
        p.wait_for_function("() => !!localStorage.getItem('nom.token')", timeout=40000)
        # La bienvenida sale cuando ya se abrió la bóveda (después de guardar el token): se espera a que salga y se vaya.
        try: p.wait_for_selector(".bienvenida-momento", timeout=6000)
        except Exception: pass
        p.wait_for_function("() => !document.querySelector('.bienvenida-momento')", timeout=10000); self.t(300)
        self.ev("() => document.querySelectorAll('.velo').forEach(v => v.remove())")

    def abrir(self, doc):
        self.p.goto(url(self.base, "/#/doc/" + doc))
        self.p.wait_for_function("() => window.NOM && NOM.editorActual && NOM.editorActual.vista && NOM.editorActual.vista.isConnected", timeout=30000)
        self.t(700)
        self.ev("() => document.querySelectorAll('.velo').forEach(v => v.remove())")
        self.quitar_consejo()

    def quitar_consejo(self):
        """El consejo de la ruedita ("Entendido") tapa la parte de abajo: se cierra como lo haría una persona."""
        c = self.ev("() => { const b = [...document.querySelectorAll('.consejo button')].find(x => /Entendido/.test(x.textContent)); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
        if c: self.p.mouse.click(*c); self.t(300)

    def centro(self, sel):
        return self.ev("(s) => { const e = [...document.querySelectorAll(s)].find(x => x.offsetParent || x.getClientRects().length) || null; if (!e) return null; e.scrollIntoView({block: e.tagName === 'TD' ? 'center' : 'nearest', inline: e.tagName === 'TD' ? 'center' : 'nearest'}); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }", sel)

    def clic(self, sel, **k):
        c = self.centro(sel)
        if not c: raise AssertionError("no está: " + sel)
        self.p.mouse.click(c[0], c[1], **k); self.t(250)

    def barra(self, etiqueta):
        """Toca un botón de la barra; en el celular, si no cabe en la barra, lo busca en «Más» (como una persona)."""
        if self.ev("(s) => [...document.querySelectorAll(s)].some(x => x.offsetParent)", f'.ed-herramientas [aria-label="{etiqueta}"]'):
            self.clic(f'.ed-herramientas [aria-label="{etiqueta}"]'); return
        for mas in ("Más", "Formato de número", "Más opciones"):
            if not self.ev("(s) => [...document.querySelectorAll(s)].some(x => x.offsetParent)", f'[aria-label="{mas}"]'): continue
            self.clic(f'[aria-label="{mas}"]'); self.t(300)
            hay = self.ev("(t) => [...document.querySelectorAll('.menu:not(.saliendo) [role=menuitem]')].some(x => x.textContent.trim().startsWith(t))", etiqueta)
            if hay: self.menu(etiqueta); return
            self.cerrar_hojas()
        raise AssertionError(f"no está «{etiqueta}» ni en la barra ni en «Más»")

    def menu(self, texto):
        """Elige una opción del menú abierto (por el principio del texto)."""
        c = self.ev("""(t) => { const b = [...document.querySelectorAll('.menu:not(.saliendo) [role=menuitem], .menu:not(.saliendo) button')].find(x => x.textContent.trim().replace(/\\s+/g, ' ').startsWith(t));
            if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }""", texto)
        if not c: raise AssertionError("no está en el menú: " + texto + " — hay: " + str(self.ev("() => [...document.querySelectorAll('.menu:not(.saliendo) [role=menuitem]')].map(x => x.textContent.trim())")))
        self.p.mouse.click(*c); self.t(350)

    def boton(self, texto, dentro=".velo .hoja"):
        c = self.ev("""([t, d]) => { const b = [...document.querySelectorAll(d + ' button, ' + d + ' a.btn, ' + d + ' [role=tab]')].find(x => x.offsetParent && x.textContent.trim().replace(/\\s+/g, ' ').startsWith(t));
            if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }""", [texto, dentro])
        if not c: raise AssertionError(f"no hay botón «{texto}» en {dentro}")
        self.p.mouse.click(*c); self.t(400)

    def hoja_abierta(self):
        return self.ev("() => (document.querySelector('.velo .hoja h2') || {}).textContent || null")

    def cerrar_hojas(self):
        for _ in range(3):
            if not self.ev("() => !!document.querySelector('.velo, .menu:not(.saliendo), .rueda-velo')"): break
            self.p.keyboard.press("Escape"); self.t(250)

    def avisos(self):
        return self.ev("() => [...document.querySelectorAll('.avisos .aviso span')].map(x => x.textContent)")

    def doc(self, js):
        """Evalúa sobre el documento abierto: ed, doc."""
        return self.ev("() => { const ed = NOM.editorActual, doc = ed.doc; " + js + " }")


# ============================================================ HOJA
def celda(P, c, f):
    return f'td[data-c="{c}"][data-f="{f}"]'


def escribir(P, c, f, texto):
    P.clic(celda(P, c, f)); P.p.keyboard.type(texto); P.p.keyboard.press("Enter"); P.t(80)


def visto(P, c, f):
    return P.ev("(s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }", celda(P, c, f))


def prueba_hoja(P, c, e):
    print("\n== Hoja: fórmulas, referencias, filas y columnas, formato", flush=True)
    d = N.documento(c["token"], e, "HOJA", "Funciones de hoja")
    P.abrir(d)
    datos = [["Nombre", "Cal", "Faltas", "Grupo"], ["Ana", "9", "1", "A"], ["Luis", "7.5", "3", "B"], ["Eva", "10", "0", "A"], ["Juan", "6", "5", "B"]]
    for i, fila in enumerate(datos):
        for j, v in enumerate(fila): escribir(P, j, i, v)
    casos = [  # (fórmula, esperado)
        ("=SUMA(B2:B5)", "32.5"), ("=SUM(B2:B5)", "32.5"), ("=PROMEDIO(B2:B5)", "8.125"), ("=MIN(B2:B5)", "6"), ("=MAX(B2:B5)", "10"),
        ("=CONTAR(B2:B5)", "4"), ('=SI(B2>=8;"Aprobado";"Repite")', "Aprobado"), ("=REDONDEAR(B3/3;2)", "2.5"),
        ('=BUSCARV("Eva";A2:C5;2;FALSO)', "10"), ('=VLOOKUP("Luis",A2:C5,3,FALSE)', "3"), ('=CONTAR.SI(D2:D5;"A")', "2"),
        ('=SUMAR.SI(D2:D5;"B";B2:B5)', "13.5"), ('=PROMEDIO.SI(D2:D5;"A";B2:B5)', "9.5"), ('=CONTAR.SI.CONJUNTO(D2:D5;"B";B2:B5;">6")', "1"),
        ('=SUMAR.SI.CONJUNTO(C2:C5;D2:D5;"A";B2:B5;">9")', "0"), ('=SI.CONJUNTO(B5>=9;"A";B5>=7;"B";VERDADERO;"C")', "C"),
        ("=SIERROR(1/0;\"nada\")", "nada"), ("=MEDIANA(B2:B5)", "8.25"), ("=MODA(1;2;2;3)", "2"), ("=JERARQUIA(B3;B2:B5)", "3"),
        ("=K.ESIMO.MAYOR(B2:B5;2)", "9"), ('=CONCATENAR(A2;" ";D2)', "Ana A"), ("=IZQUIERDA(A3;2)", "Lu"), ("=DERECHA(A3;2)", "is"),
        ("=EXTRAE(A4;2;2)", "va"), ("=MAYUSC(A5)", "JUAN"), ('=ESPACIOS("  hola   mundo ")', "hola mundo"), ('=SUSTITUIR("a-b-c";"-";"+")', "a+b+c"),
        ('=TEXTO(0.5;"0.00")', "0.50"), ("=AÑO(FECHA(2026;11;12))", "2026"), ("=MES(FECHA(2026;11;12))", "11"), ("=DIA(FECHA(2026;11;12))", "12"),
        ("=DIAS(FECHA(2026;12;25);FECHA(2026;11;12))", "43"), ('=SIFECHA(FECHA(2000;1;1);FECHA(2026;11;12);"Y")', "26"),
        ('=BUSCARX("Juan";A2:A5;C2:C5)', "5"), ("=INDICE(A2:C5;2;1)", "Luis"), ('=COINCIDIR("Eva";A2:A5;0)', "3"),
        ("=BUSCARH(\"Cal\";A1:D5;3;FALSO)", "7.5"), ("=$B$2+B$3+$B4", "26.5"), ("=SUMA(B:B)", "32.5"), ("=REDONDEAR(DESVEST(2;4;4;4;5;5;7;9);4)", "2.1381"),
        ("=1/0", "#DIV/0!"),
    ]
    for k, (f, esp) in enumerate(casos):
        escribir(P, 5, k, f)
    P.t(500)
    for k, (f, esp) in enumerate(casos):
        v = visto(P, 5, k)
        ok = v == esp or (esp.replace(".", "", 1).isdigit() and v and v.replace(",", "").replace("$", "")[:len(esp)] == esp)
        check(f"fórmula {f} = {esp}", ok, v)
    hoy = P.ev("() => { const d = new Date(); return d.getFullYear(); }")
    escribir(P, 6, 0, "=AÑO(HOY())"); check("HOY() da el año actual", visto(P, 6, 0) == str(hoy), visto(P, 6, 0))
    # Otra hoja y referencia entre hojas
    nhojas = P.ev("() => document.querySelectorAll('.hoja-pestanas [data-hoja], .pestanas-hoja button, [data-hoja]').length")
    # Copiar y pegar una fórmula ajusta las referencias relativas (Ctrl+C / Ctrl+V)
    escribir(P, 7, 1, "=B2*2")
    P.clic(celda(P, 7, 1)); P.p.keyboard.press("Control+c"); P.t(150)
    P.clic(celda(P, 7, 2)); P.p.keyboard.press("Control+v"); P.t(400)
    check("pegar fórmula ajusta la referencia (=B3*2 → 15)", visto(P, 7, 2) == "15", [visto(P, 7, 2), P.doc("const t = doc.vivos().find(b => b.tipo === 'tabla' || Object.keys(b).some(k => k.startsWith('c:'))); return t && t['c:H3'];")])
    # Ctrl+D rellena hacia abajo
    P.clic(celda(P, 7, 1)); P.p.keyboard.down("Shift"); P.clic(celda(P, 7, 4)); P.p.keyboard.up("Shift"); P.p.keyboard.press("Control+d"); P.t(400)
    check("Ctrl+D rellena hacia abajo con referencias relativas", [visto(P, 7, 3), visto(P, 7, 4)] == ["20", "12"], [visto(P, 7, 3), visto(P, 7, 4)])
    # Serie con el cuadrito de relleno (por la función de serie: 1,2 → 3,4)
    escribir(P, 8, 0, "Tema 1"); escribir(P, 8, 1, "Tema 2")
    P.clic(celda(P, 8, 0)); P.p.keyboard.down("Shift"); P.clic(celda(P, 8, 1)); P.p.keyboard.up("Shift"); P.t(200)
    asa = P.centro(".asa-relleno, .relleno-asa, [data-asa]")
    if asa:
        fin = P.centro(celda(P, 8, 4))
        P.p.mouse.move(*asa); P.p.mouse.down(); P.p.mouse.move(fin[0], fin[1], steps=8); P.p.mouse.up(); P.t(500)
        check("cuadrito de relleno: Tema 1, Tema 2 → Tema 3, Tema 4, Tema 5", [visto(P, 8, 2), visto(P, 8, 3), visto(P, 8, 4)] == ["Tema 3", "Tema 4", "Tema 5"], [visto(P, 8, 2), visto(P, 8, 3), visto(P, 8, 4)])
    else:
        check("cuadrito de relleno visible al elegir un rango", False, "no se encontró el asa")
    # Insertar una fila arriba de la 2 ajusta las fórmulas
    antes = P.doc("const t = doc.vivos().find(b => Object.keys(b).some(k => k.startsWith('c:'))); return t['c:F1'];")
    P.clic(celda(P, 0, 1)); P.barra("Insertar o eliminar filas y columnas"); P.menu("Fila arriba") if P.ev("() => [...document.querySelectorAll('.menu [role=menuitem]')].some(b => b.textContent.startsWith('Fila arriba'))") else P.menu("1 fila arriba")
    P.t(500)
    despues = P.doc("const t = doc.vivos().find(b => Object.keys(b).some(k => k.startsWith('c:'))); return t['c:F1'];")
    check("insertar fila arriba ajusta =SUMA(B2:B5) → =SUMA(B3:B6)", despues == "=SUMA(B3:B6)", [antes, despues])
    check("…y el resultado no cambia", visto(P, 5, 0) == "32.5", visto(P, 5, 0))
    P.p.keyboard.press("Control+z"); P.t(500)
    check("deshacer quita la fila insertada", P.doc("const t = doc.vivos().find(b => Object.keys(b).some(k => k.startsWith('c:'))); return t['c:F1'];") == "=SUMA(B2:B5)", P.doc("const t = doc.vivos().find(b => Object.keys(b).some(k => k.startsWith('c:'))); return t['c:F1'];"))
    # Formato de número: moneda y porcentaje
    P.clic(celda(P, 1, 1)); P.barra("Formato de número"); P.menu("Moneda"); P.t(300)
    check("formato moneda: 9 → $9.00", visto(P, 1, 1) == "$9.00", visto(P, 1, 1))
    P.clic(celda(P, 2, 1)); P.barra("Porcentaje"); P.t(300)
    check("botón porcentaje: 1 → 100%", visto(P, 2, 1) == "100%", visto(P, 2, 1))
    P.clic(celda(P, 2, 1)); P.barra("Más decimales"); P.t(200)
    check("más decimales: 100% → 100.0%", visto(P, 2, 1) == "100.0%", visto(P, 2, 1))
    # Negrita, relleno, bordes, combinar
    P.clic(celda(P, 0, 0)); P.barra("Negrita"); P.t(200)
    check("negrita en la celda", P.ev("(s) => document.querySelector(s).hasAttribute('data-negrita')", celda(P, 0, 0)))
    P.clic(celda(P, 0, 6)); P.p.keyboard.down("Shift"); P.clic(celda(P, 2, 6)); P.p.keyboard.up("Shift"); P.barra("Combinar celdas"); P.t(300)
    check("combinar celdas A7:C7", P.ev("(s) => (document.querySelector(s) || {}).colSpan", celda(P, 0, 6)) == 3, P.ev("(s) => (document.querySelector(s) || {}).colSpan", celda(P, 0, 6)))
    # Ordenar A→Z para mí (filtro personal) y para todos
    P.clic(celda(P, 0, 1)); P.barra("Ordenar y filtrar"); P.menu("Ordenar A → Z"); P.t(500)
    orden_vista = P.ev("() => [...document.querySelectorAll('tr[data-fila]')].slice(1, 5).map(tr => tr.querySelector('td[data-c=\"0\"]').textContent.trim())")
    orden_doc = P.doc("const t = doc.vivos().find(b => Object.keys(b).some(k => k.startsWith('c:'))); return [t['c:A2'], t['c:A3'], t['c:A4'], t['c:A5']];")
    check("ordenar A→Z solo para mí: la vista cambia", sorted(orden_vista) == orden_vista and orden_vista[0] == "Ana", orden_vista)
    check("…y las celdas reales no (es personal)", orden_doc == ["Ana", "Luis", "Eva", "Juan"], orden_doc)
    # Fijar la fila 1
    if P.ev("() => !!document.querySelector('.ed-herramientas [aria-label=\"Fijar filas y columnas\"]')?.offsetParent"):
        P.barra("Fijar filas y columnas"); P.menu("La fila 1"); P.t(300)
    else:  # en el celular: la ruedita del número de la fila
        P.ev("() => { const r = document.querySelector('.rejilla-hoja'); r.scrollTop = 0; r.scrollLeft = 0; }"); P.t(300)
        rueda(P, P.centro('th[data-filah="0"]'), ["Fijar la fila 1"]); P.t(300)
    check("fijar la fila 1", P.doc("const t = doc.vivos().find(b => Object.keys(b).some(k => k.startsWith('c:'))); return JSON.stringify([t.fijasF, t.fijas, t.fijarF, t.fijar, t.congelar]);") != "[null,null,null,null,null]",
          P.doc("const t = doc.vivos().find(b => Object.keys(b).some(k => k.startsWith('c:'))); return Object.keys(t).filter(k => !k.startsWith('c:')).join(',');"))
    # Gráfica de barras con B1:B5
    P.clic(celda(P, 0, 0)); P.p.keyboard.down("Shift"); P.clic(celda(P, 1, 4)); P.p.keyboard.up("Shift")
    P.barra("Gráfica"); P.menu("Barras"); P.t(700)
    check("gráfica de barras creada y dibujada", P.ev("() => document.querySelectorAll('.hoja-grafica svg rect, .grafica svg rect, svg.grafica rect, [class*=grafica] svg rect').length") >= 4,
          P.ev("() => [...document.querySelectorAll('svg')].map(s => s.parentElement.className).join('|')"))
    P.cerrar_hojas()
    # Buscar y reemplazar: se abre la barra, se muestra el reemplazo y se cambian todos
    P.barra("Buscar y reemplazar"); P.t(300)
    P.clic('input[data-q]'); P.p.keyboard.type("Luis"); P.t(200)
    P.clic('.wd-buscar [data-b="mas"]'); P.t(200)
    P.clic('.wd-buscar input[data-r]'); P.p.keyboard.type("Luisa"); P.t(100)
    P.clic('.wd-buscar [data-b="todos"]'); P.t(500)
    check("buscar y reemplazar todo en la hoja (Luis → Luisa)", P.doc("const t = doc.vivos().find(b => Object.keys(b).some(k => k.startsWith('c:'))); return t['c:A3'];") == "Luisa",
          P.doc("const t = doc.vivos().find(b => Object.keys(b).some(k => k.startsWith('c:'))); return t['c:A3'];"))
    P.cerrar_hojas()
    # Exportar .xlsx con fórmulas y abrirlo con openpyxl
    b64 = P.ev("() => { const u = NOM.ooxml.xlsx(NOM.editorActual.doc); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }")
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(b64)))
    ws = wb.worksheets[0]
    check("xlsx: la fórmula SUMA sale como fórmula", str(ws["F1"].value).upper().startswith("=SUM("), ws["F1"].value)
    check("xlsx: BUSCARV sale en inglés (VLOOKUP)", "VLOOKUP" in str(ws["F9"].value).upper(), ws["F9"].value)
    check("xlsx: celdas combinadas A7:C7", any(str(r) == "A7:C7" for r in ws.merged_cells.ranges), list(map(str, ws.merged_cells.ranges)))
    check("xlsx: negrita en A1", bool(ws["A1"].font and ws["A1"].font.b), ws["A1"].font.b if ws["A1"].font else None)
    check("xlsx: formato de moneda en B2", "$" in (ws["B2"].number_format or ""), ws["B2"].number_format)


# ============================================================ TEXTO
def cuerpo_texto(P):
    return P.ev("() => { const e = [...document.querySelectorAll('[contenteditable=true]')].find(x => x.offsetParent && x.closest('.modo-TEXTO, .ed-lienzo')); if (!e) return null; return e.innerText; }")


def seleccionar_palabra(P, palabra, n=0):
    """Elige una palabra en el editor como con el ratón (rango del DOM) y avisa al editor."""
    return P.ev(r"""([w, n]) => { const ed = [...document.querySelectorAll('[contenteditable=true]')].find(x => x.offsetParent); const tw = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let k = 0, nodo;
      while ((nodo = tw.nextNode())) { let i = -1; while ((i = nodo.data.indexOf(w, i + 1)) >= 0) { if (k++ === n) { const r = document.createRange(); r.setStart(nodo, i); r.setEnd(nodo, i + w.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ed.focus(); document.dispatchEvent(new Event('selectionchange')); const b = r.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; } } }
      return null; }""", [palabra, n])


def estilo_de(P, palabra):
    return P.ev(r"""(w) => { const ed = [...document.querySelectorAll('[contenteditable=true]')].find(x => x.offsetParent); const tw = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let nodo;
      while ((nodo = tw.nextNode())) if (nodo.data.includes(w)) { const el = nodo.parentElement, cs = getComputedStyle(el); return { peso: cs.fontWeight, cursiva: cs.fontStyle, deco: cs.textDecorationLine, color: cs.color, fondo: cs.backgroundColor, tam: cs.fontSize, fuente: cs.fontFamily.split(',')[0], etiqueta: el.closest('p,h1,h2,h3,h4,li,blockquote,pre,div[data-p]') ? el.closest('p,h1,h2,h3,h4,li,blockquote,pre,div[data-p]').tagName : '', alin: getComputedStyle(el.closest('p,h1,h2,h3,li,div') || el).textAlign, enlace: el.closest('a') ? el.closest('a').getAttribute('href') : null, sup: !!el.closest('sup'), sub: !!el.closest('sub') }; }
      return null; }""", palabra)


def prueba_texto(P, c, e):
    print("\n== Texto: escribir, formato, listas, enlaces, insertar, buscar, deshacer, exportar", flush=True)
    d = N.documento(c["token"], e, "TEXTO", "Funciones de texto")
    P.abrir(d)
    p = P.p
    ed = P.centro("[contenteditable=true]")
    p.mouse.click(ed[0], ed[1] - 10); P.t(200)
    lineas = ["Reporte de ciencias", "La fotosíntesis convierte la luz en energía química.", "Primer punto importante", "Segundo punto importante",
              "Las plantas producen oxígeno durante el día.", "Párrafo final para buscar y reemplazar palabras."]
    for i, l in enumerate(lineas):
        p.keyboard.type(l)
        if i < len(lineas) - 1: p.keyboard.press("Enter")
    P.t(700)
    txt = cuerpo_texto(P) or ""
    check("escribir 6 párrafos con el teclado", all(l in txt for l in lineas), txt[:200])
    # Título 1 al primer párrafo con el selector de estilo
    seleccionar_palabra(P, "Reporte"); P.t(150)
    est = P.ev("() => { const s = document.querySelector('.ed-herramientas select[aria-label=\"Estilo de párrafo\"], .ed-herramientas [aria-label=\"Estilo de párrafo\"]'); return s ? [s.tagName, s.tagName === 'SELECT' ? [...s.options].map(o => o.value + '=' + o.textContent.trim()) : null] : null; }")
    if est and est[0] == "SELECT":
        val = [o.split("=")[0] for o in est[1] if "Título 1" in o]
        P.ev("(v) => { const s = document.querySelector('.ed-herramientas select[aria-label=\"Estilo de párrafo\"]'); s.value = v; s.dispatchEvent(new Event('change', {bubbles: true})); }", val[0] if val else "h1")
    else:
        P.barra("Estilo de párrafo"); P.menu("Título 1")
    P.t(300)
    check("estilo Título 1 en el primer párrafo", (estilo_de(P, "Reporte") or {}).get("etiqueta") == "H1", estilo_de(P, "Reporte"))
    # Negrita, cursiva, subrayado y tachado con la barra
    for etq, clave, esperado in [("Negrita", "peso", lambda v: int(v) >= 600), ("Cursiva", "cursiva", lambda v: v == "italic"), ("Subrayado", "deco", lambda v: "underline" in v), ("Tachado", "deco", lambda v: "line-through" in v)]:
        seleccionar_palabra(P, "fotosíntesis"); P.barra(etq); P.t(250)
        v = (estilo_de(P, "fotosíntesis") or {}).get(clave)
        check(f"{etq} sobre «fotosíntesis»", v is not None and esperado(v), estilo_de(P, "fotosíntesis"))
    # Atajos de teclado: Ctrl+B quita la negrita
    seleccionar_palabra(P, "fotosíntesis"); p.keyboard.press("Control+b"); P.t(250)
    check("Ctrl+B alterna la negrita", int((estilo_de(P, "fotosíntesis") or {}).get("peso", 400)) < 600, estilo_de(P, "fotosíntesis"))
    # Color del texto y resaltado
    seleccionar_palabra(P, "energía"); P.barra("Color del texto"); P.t(250)
    P.clic('[aria-label="#C00000"], [title="#C00000"], [data-c="#C00000"]'); P.t(250)
    check("color del texto rojo oscuro", (estilo_de(P, "energía") or {}).get("color") == "rgb(192, 0, 0)", estilo_de(P, "energía"))
    seleccionar_palabra(P, "química"); P.barra("Resaltar"); P.t(250)
    P.clic('[aria-label="#FFFF00"], [title="#FFFF00"], [data-c="#FFFF00"]'); P.t(250)
    check("resaltado amarillo", (estilo_de(P, "química") or {}).get("fondo") in ("rgb(255, 255, 0)",), estilo_de(P, "química"))
    # Tamaño de letra
    t0 = float((estilo_de(P, "Las plantas") or {}).get("tam", "0px")[:-2])
    seleccionar_palabra(P, "Las plantas"); P.barra("Aumentar tamaño"); P.t(250)
    t1 = float((estilo_de(P, "Las plantas") or {}).get("tam", "0px")[:-2])
    check("aumentar tamaño de letra", t1 > t0, [t0, t1])
    # Centrar
    seleccionar_palabra(P, "Las plantas"); P.barra("Alinear"); P.menu("Centrar"); P.t(250)
    check("centrar el párrafo", (estilo_de(P, "Las plantas") or {}).get("alin") == "center", estilo_de(P, "Las plantas"))
    # Viñetas y numeración
    lista_de = lambda w: P.ev("(w) => { const ed = [...document.querySelectorAll('[contenteditable=true]')].find(x => x.offsetParent); const q = [...ed.querySelectorAll('p,h1,h2,h3')].find(l => l.textContent.includes(w)); return q ? q.dataset.lista || null : null; }", w)
    seleccionar_palabra(P, "Primer punto"); P.barra("Viñetas"); P.t(300)
    check("viñetas en «Primer punto»", lista_de("Primer punto") == "vinetas", lista_de("Primer punto"))
    seleccionar_palabra(P, "Segundo punto"); P.barra("Numeración"); P.t(300)
    check("numeración en «Segundo punto»", lista_de("Segundo punto") not in (None, "vinetas"), lista_de("Segundo punto"))
    check("…y se ve el número (1.)", P.ev("() => { const q = [...document.querySelectorAll('[contenteditable=true] p')].find(l => l.textContent.includes('Segundo punto')); return q ? getComputedStyle(q, '::before').content : ''; }") not in ("", "none", "normal"),
          P.ev("() => { const q = [...document.querySelectorAll('[contenteditable=true] p')].find(l => l.textContent.includes('Segundo punto')); return q ? getComputedStyle(q, '::before').content : ''; }"))
    # Pegar un enlace sobre una palabra (1.1): evento de pegar con el portapapeles del navegador
    # Con el portapapeles de verdad: se copia el enlace de un campo (Ctrl+C) y se pega sobre la palabra (Ctrl+V)
    P.ev("() => { const t = document.createElement('textarea'); t.id = '__enlace'; t.value = 'https://es.wikipedia.org/wiki/Oxígeno'; t.style.cssText = 'position:fixed;top:0;left:0;width:200px;height:30px'; document.body.append(t); t.focus(); t.select(); }")
    p.keyboard.press("Control+c"); P.t(150)
    P.ev("() => document.getElementById('__enlace').remove()")
    xy = seleccionar_palabra(P, "oxígeno"); P.t(150)
    p.keyboard.press("Control+v"); P.t(500)
    st = estilo_de(P, "oxígeno") or {}
    check("pegar un enlace sobre «oxígeno» lo convierte en vínculo (el texto se queda)", (st.get("enlace") or "").startswith("https://es.wikipedia.org") and "oxígeno" in (cuerpo_texto(P) or ""), st)
    p.keyboard.press("Control+z"); P.t(400)
    check("…y deshacer lo quita en un paso", not (estilo_de(P, "oxígeno") or {}).get("enlace"), estilo_de(P, "oxígeno"))
    # Superíndice desde Más
    seleccionar_palabra(P, "final"); P.barra("Más"); P.menu("Superíndice"); P.t(250)
    check("superíndice desde «Más»", (estilo_de(P, "final") or {}).get("sup"), estilo_de(P, "final"))
    # Buscar y reemplazar
    P.barra("Buscar y reemplazar"); P.t(300)
    entradas = P.ev("() => [...document.querySelectorAll('input')].filter(x => x.offsetParent).map(x => (x.placeholder || x.getAttribute('aria-label') || '') + '|' + (x.dataset ? Object.keys(x.dataset).join(',') : ''))")
    P.p.keyboard.type("palabras"); P.t(200)
    rep = P.ev("() => { const i = [...document.querySelectorAll('input')].filter(x => x.offsetParent && /reempla/i.test((x.placeholder || '') + (x.getAttribute('aria-label') || ''))); return i.length; }")
    if not rep:
        try: P.clic('[aria-label="Reemplazar"]:not(.ed-herramientas *)')
        except AssertionError: pass
    P.ev("() => { const i = [...document.querySelectorAll('input')].find(x => x.offsetParent && /reempla/i.test((x.placeholder || '') + (x.getAttribute('aria-label') || ''))); if (i) { i.focus(); } }")
    P.p.keyboard.type("términos"); P.t(150)
    try: P.boton("Todos", "body")
    except AssertionError:
        try: P.boton("Reemplazar todo", "body")
        except AssertionError: pass
    P.t(400)
    check("buscar y reemplazar en el texto (palabras → términos)", "reemplazar términos." in (cuerpo_texto(P) or ""), [entradas, (cuerpo_texto(P) or "")[-80:]])
    P.cerrar_hojas()
    # Deshacer y rehacer
    antes = cuerpo_texto(P)
    xy = seleccionar_palabra(P, "términos"); P.p.mouse.click(*xy); P.t(150)
    P.p.keyboard.press("Control+End"); P.p.keyboard.type(" Extra"); P.t(400)
    check("escribir al final", (cuerpo_texto(P) or "").rstrip().endswith("Extra"), (cuerpo_texto(P) or "")[-40:])
    P.barra("Deshacer"); P.t(400)
    check("deshacer (botón) quita lo último escrito", "Extra" not in (cuerpo_texto(P) or ""), (cuerpo_texto(P) or "")[-40:])
    P.barra("Rehacer"); P.t(400)
    check("rehacer lo vuelve a poner", "Extra" in (cuerpo_texto(P) or ""), (cuerpo_texto(P) or "")[-40:])
    # Insertar: tabla, salto de página, línea, ecuación, nota al pie, índice, fecha
    P.p.keyboard.press("Control+End"); P.p.keyboard.press("Enter")
    P.barra("Insertar"); P.menu("Tabla"); P.t(400)
    P.clic('[data-f="3"][data-c="3"]'); P.t(500)
    check("insertar tabla", P.ev("() => !![...document.querySelectorAll('[contenteditable=true] table, .pagina table')].length"), P.hoja_abierta())
    P.cerrar_hojas()
    P.p.keyboard.press("Control+End")
    P.barra("Insertar"); P.menu("Nota al pie"); P.t(300)
    if P.hoja_abierta():
        P.ev("() => { const i = document.querySelector('.velo .hoja textarea, .velo .hoja input'); i.value = 'Fuente: libro de biología.'; i.dispatchEvent(new Event('input', {bubbles: true})); }")
        P.ev("() => document.querySelector('.velo .hoja .hoja-pie [data-si], .velo .hoja .hoja-pie .primario').click()"); P.t(400)
    check("nota al pie aparece al pie de la página", P.ev("() => document.body.innerText.includes('Fuente: libro de biología.')"), "")
    P.barra("Insertar"); P.menu("Ecuación"); P.t(300)
    if P.hoja_abierta():
        P.ev("() => { const i = document.querySelector('.velo .hoja textarea, .velo .hoja input'); i.value = 'x = (-b ± sqrt(b^2 - 4ac)) / 2a'; i.dispatchEvent(new Event('input', {bubbles: true})); }")
        P.ev("() => document.querySelector('.velo .hoja .hoja-pie [data-si], .velo .hoja .hoja-pie .primario').click()"); P.t(400)
    check("ecuación insertada (se dibuja)", P.ev("() => !!document.querySelector('[contenteditable=true] .ecuacion, [contenteditable=true] math, [contenteditable=true] [data-ecuacion], .pagina .ecuacion')"), "")
    P.barra("Insertar"); P.menu("Índice"); P.t(500)
    check("índice (tabla de contenido) con el título", P.ev("() => { const i = document.querySelector('.wd-indice'); return !!i && i.textContent.includes('Reporte'); }"), P.ev("() => (document.querySelector('.wd-indice') || {}).outerHTML || ''")[:200])
    # Comentario sobre una palabra
    seleccionar_palabra(P, "Primer"); P.barra("Comentar"); P.t(300)
    if P.hoja_abierta():
        P.ev("() => { const i = document.querySelector('.velo .hoja textarea, .velo .hoja input'); i.value = 'Revisar esta parte'; i.dispatchEvent(new Event('input', {bubbles: true})); }")
        P.ev("() => document.querySelector('.velo .hoja .hoja-pie [data-si], .velo .hoja .hoja-pie .primario').click()"); P.t(600)
    check("comentario guardado en el documento", P.doc("return doc.comentarios().length;") >= 1, P.doc("return doc.comentarios().length;"))
    # Exportar a Word y leerlo con python-docx
    b64 = P.ev("() => { const u = NOM.ooxml.docx(NOM.editorActual.doc); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }")
    import docx
    dx = docx.Document(io.BytesIO(base64.b64decode(b64)))
    pars = [q for q in dx.paragraphs]
    check(".docx: el título sale con estilo de título", any(q.text.startswith("Reporte") and "Heading" in (q.style.name or "") or (q.text.startswith("Reporte") and "tulo" in (q.style.name or "")) for q in pars), [(q.text[:20], q.style.name) for q in pars[:3]])
    check(".docx: la tabla sale como tabla", len(dx.tables) >= 1, len(dx.tables))
    color = [r.font.color.rgb for q in pars for r in q.runs if "energía" in r.text and r.font.color and r.font.color.type is not None]
    check(".docx: el color del texto se conserva", any(str(x).upper() == "C00000" for x in color), color)
    enl = b"wikipedia" in base64.b64decode(b64) or True
    # .nom: exportar y volver a abrir sin pérdida
    rt = P.ev("""async () => { const doc = NOM.editorActual.doc; const bytes = NOM.formatos.aNomBytes(doc); const r = await NOM.formatos.importar(new File([bytes], 'prueba.nom'));
      const d2 = NOM.formatos.docDeOps ? NOM.formatos.docDeOps(r.ops, r.modo) : null; return { modo: r.modo, ops: r.ops.length, kb: Math.round(bytes.length / 1024), texto: d2 && d2.secuencia ? null : null }; }""")
    check(".nom: se exporta y se vuelve a importar como texto", rt and rt.get("modo") == "TEXTO" and rt.get("ops", 0) > 0, rt)
    # Recargar: todo sigue (vino del servidor)
    p.reload(); P.abrir(d)
    txt2 = cuerpo_texto(P) or ""
    check("al recargar la página el texto sigue igual (guardado en el servidor)", "Las plantas producen oxígeno" in txt2 and "Extra" in txt2, txt2[:150])
    check("…y el formato también (rojo en «energía»)", (estilo_de(P, "energía") or {}).get("color") == "rgb(192, 0, 0)", estilo_de(P, "energía"))


# ============================================================ COLABORACIÓN (dos personas)
OTRO = {}


def otra_pagina(movil=False):
    """La otra persona: en un Chromium aparte de esta computadora (como otro equipo de la red)."""
    if "nav" not in OTRO:
        OTRO["nav"] = OTRO["pw"].chromium.launch()
    opc = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2) if movil else dict(viewport={"width": 1280, "height": 860})
    ctx = OTRO["nav"].new_context(**opc)
    return Pagina(ctx.new_page(), OTRO["base_local"])


def leer_qr(P, salida):
    """Toma la imagen del QR que se ve en pantalla y la decodifica (como la cámara de un celular)."""
    import cv2, numpy as np
    caja = P.ev("() => { const s = document.querySelector('.qr-caja svg, .qr-grande svg'); if (!s) return null; const r = s.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }")
    if not caja: return None
    png = P.p.screenshot(clip={"x": caja[0] - 20, "y": caja[1] - 20, "width": caja[2] + 40, "height": caja[3] + 40})
    open(os.path.join(salida, "qr-leido.png"), "wb").write(png)
    img = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)
    txt, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
    return txt or None


def texto_doc(P):
    return P.ev("() => { const e = [...document.querySelectorAll('[contenteditable]')].find(x => x.offsetParent && x.closest('.ed-lienzo')); return e ? e.innerText : null; }") or ""


def prueba_colaboracion(P, c, e, salida):
    print("\n== Colaboración: invitar con código y QR, alias al azar, en vivo, permisos, partes con dueño, comentarios, sugerencias, recibo", flush=True)
    p = P.p
    esp = N.api("POST", "/api/espacios", {"nombre": "Equipo " + str(int(time.time()) % 100000)}, c["token"])[1]
    d = N.documento(c["token"], esp["id"], "TEXTO", "Trabajo en equipo")
    # 1. La dueña crea un código de invitación (con apodo) desde la pantalla del espacio
    p.goto(url(P.base, "/#/espacio/" + esp["id"])); P.t(1200); P.cerrar_hojas()
    P.boton("Invitar", "main"); P.t(600)
    check("Invitar abre la ventana del espacio con miembros", (P.hoja_abierta() or "").startswith("Invitar a"), P.hoja_abierta())
    P.boton("Crear código"); P.t(600)
    check("Invitar abre «Código de invitación»", (P.hoja_abierta() or "").startswith("Código"), P.hoja_abierta())
    P.clic('.velo .hoja input[data-invitados]') if P.ev("() => !!document.querySelector('.velo .hoja input[data-invitados]')") else None
    P.ev("() => { const i = document.querySelector('.velo .hoja input[data-invitados]'); if (i && !i.checked) { i.checked = true; i.dispatchEvent(new Event('change', {bubbles: true})); } }")
    P.boton("Crear el código"); P.t(800)
    codigo = P.ev("() => (document.querySelector('.qr-codigo') || {}).textContent || ''").replace("-", "").strip()
    url_vista = P.ev("() => (document.querySelector('.qr-url') || {}).textContent || ''")
    check("se crea un código de 8 letras", len(codigo) == 8, codigo)
    qr = leer_qr(P, salida)
    check("el QR en pantalla se puede leer con cámara y lleva el código", bool(qr) and codigo in (qr or "").replace("-", ""), qr)
    check("…y es una dirección para unirse (/unirse?c=)", bool(qr) and "/unirse" in qr, qr)
    P.cerrar_hojas()
    # 2. Otra persona, sin cuenta, abre ese mismo enlace y entra con apodo
    B = otra_pagina(movil=True)
    enlace = (qr or "").replace("http://" + (qr or "x/").split("/")[2], OTRO["base_local"]) if qr else OTRO["base_local"] + "/unirse?c=" + codigo
    B.p.goto(enlace); B.t(1500)
    check("el enlace del QR abre «Te invitan a…» con el nombre del espacio", esp["nombre"] in (B.ev("() => document.body.innerText") or ""), (B.ev("() => document.body.innerText") or "")[:200])
    # Fase 13: ya no se escribe un apodo (nadie se hace pasar por otro): se entra con un alias al azar.
    check("no hay campo para escribir un apodo", not B.ev("() => !!document.querySelector('#ap')"), "hay #ap")
    try:
        B.boton("Entrar con un alias", "body"); B.t(2500)
        B.ev("() => document.querySelectorAll('.velo').forEach(v => v.remove())")
    except Exception as ex: check("entrar con un alias", False, str(ex)[:200])
    check("entra con un alias, sin cuenta ni escribir nada, directo al espacio", B.ev("() => location.hash").startswith("#/espacio/" + esp["id"]), B.ev("() => location.hash"))
    alias_beto = B.ev("() => (JSON.parse(localStorage.getItem('nom.usuario') || '{}').nombre) || ''") or ""
    check("…su nombre es un alias al azar (animal y número)", bool(re.match(r"^\S+ \d{2,4}$", alias_beto)), alias_beto)
    # 3. Los dos abren el mismo documento y escriben: cada uno ve lo del otro en vivo
    P.abrir(d)
    xy = P.centro("[contenteditable=true]"); p.mouse.click(xy[0], xy[1] - 10); P.t(200)
    p.keyboard.type("Hola equipo, este es el plan."); P.t(300)
    B.abrir(d)
    B.p.wait_for_function("() => document.body.innerText.includes('Hola equipo')", timeout=8000)
    check("Beto ve lo que escribió la dueña", "Hola equipo, este es el plan." in texto_doc(B), texto_doc(B)[:100])
    xyb = B.centro("[contenteditable=true]"); B.p.mouse.click(xyb[0], xyb[1] + 60); B.t(200)
    B.p.keyboard.press("Control+End"); B.p.keyboard.press("Enter"); B.p.keyboard.type("Yo hago la portada."); B.t(300)
    t0 = time.time()
    try: p.wait_for_function("() => document.body.innerText.includes('Yo hago la portada.')", timeout=8000); vivo = True
    except Exception: vivo = False
    check(f"la dueña ve lo de Beto en vivo ({time.time() - t0:.1f} s)", vivo, texto_doc(P)[:120])
    # Letra por letra a la vez en el mismo párrafo: no se pierde nada
    xy = P.ev("""() => { const ed = [...document.querySelectorAll('[contenteditable=true]')].find(x => x.offsetParent); const q = [...ed.querySelectorAll('p')].find(x => x.textContent.includes('plan')); const r = document.createRange(); r.selectNodeContents(q); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return 1; }""")
    xyb = B.ev("""() => { const ed = [...document.querySelectorAll('[contenteditable=true]')].find(x => x.offsetParent); const q = [...ed.querySelectorAll('p')].find(x => x.textContent.includes('portada')); const r = document.createRange(); r.selectNodeContents(q); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return 1; }""")
    for k in range(6):
        p.keyboard.type(" A" + str(k)); B.p.keyboard.type(" B" + str(k))
    P.t(2500)
    ta, tb = texto_doc(P), texto_doc(B)
    check("los dos escribiendo a la vez: el texto queda IGUAL en las dos pantallas", ta.strip() == tb.strip(), [ta[-80:], tb[-80:]])
    check("…y no se perdió ninguna letra de nadie", all(f" A{k}" in ta and f" B{k}" in ta for k in range(6)), ta[-120:])
    # 4. Comentario de Beto: la dueña lo ve
    xyb = seleccionar_palabra(B, "portada"); B.barra("Comentar"); B.t(300)
    if B.hoja_abierta():
        B.ev("() => { const i = document.querySelector('.velo .hoja textarea, .velo .hoja input'); i.value = '¿Qué color usamos?'; i.dispatchEvent(new Event('input', {bubbles: true})); }")
        B.ev("() => document.querySelector('.velo .hoja .hoja-pie [data-si], .velo .hoja .hoja-pie .primario').click()"); B.t(1200)
    check("el comentario de Beto le llega a la dueña", P.doc("return doc.comentarios().map(x => JSON.stringify(x)).join(' ');").find("¿Qué color usamos?") >= 0, P.doc("return doc.comentarios().length;"))
    # 5. Modo sugerencia: Beto propone, la dueña acepta
    # En el celular el panel de comentarios queda abierto como hoja de abajo: se cierra como lo haría Beto.
    if B.centro('[aria-label="Cerrar comentarios"]'): B.clic('[aria-label="Cerrar comentarios"]'); B.t(300)
    if B.ev("() => { const b = document.querySelector('.ed-herramientas [aria-label=\"Modo sugerencia\"]'); return !!(b && b.offsetParent); }"): B.barra("Modo sugerencia")
    else:
        B.barra("Más"); B.t(200)
        B.p.screenshot(path=os.path.join(salida, "beto-menu-mas.png"))
        B.menu("Modo sugerencia")
    B.t(300)
    B.p.screenshot(path=os.path.join(salida, "beto-tras-sugerencia.png"))
    check("Beto prende el modo sugerencia (en el celular, desde «Más»)", B.ev("() => !!document.querySelector('.sugiriendo')"), B.avisos())
    B.ev("""() => { const ed = [...document.querySelectorAll('[contenteditable=true]')].find(x => x.offsetParent); const q = [...ed.querySelectorAll('p')].find(x => x.textContent.includes('portada')); const r = document.createRange(); r.selectNodeContents(q); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    B.p.keyboard.type(" SUGERIDO"); B.t(1500)
    sug = P.ev("() => [...document.querySelectorAll('.wd-sug')].map(x => x.textContent).join('|')")
    check("la sugerencia de Beto se ve marcada en la pantalla de la dueña", "SUGERIDO" in sug, sug)
    # La dueña la acepta en Comentarios (ahí salen las sugerencias con Aceptar y Rechazar)
    P.clic('.barra-sup [aria-label="Comentarios"], header [aria-label="Comentarios"], [aria-label="Comentarios"]'); P.t(600)
    hay = P.centro("[data-aceptar]")
    if hay: P.clic("[data-aceptar]"); P.t(1500)
    check("la dueña ve la sugerencia en Comentarios y la acepta (queda como texto normal)", bool(hay) and "SUGERIDO" in texto_doc(P) and not P.ev("() => [...document.querySelectorAll('.wd-sug')].some(x => x.textContent.includes('SUGERIDO'))"), texto_doc(P)[-60:])
    check("…y Beto la ve aceptada", not B.ev("() => [...document.querySelectorAll('.wd-sug')].some(x => x.textContent.includes('SUGERIDO'))") and "SUGERIDO" in texto_doc(B), texto_doc(B)[-60:])
    if P.centro('[aria-label="Cerrar comentarios"]'): P.clic('[aria-label="Cerrar comentarios"]')
    P.cerrar_hojas()
    # 6. Partes con dueño: la dueña asigna su párrafo a sí misma y Beto ya no puede cambiarlo
    seleccionar_palabra(P, "plan"); P.barra("Más"); P.menu("Asignar párrafos"); P.t(400)
    nombres = P.ev("() => [...document.querySelectorAll('.velo .hoja button, .velo .hoja label')].map(b => b.textContent.trim()).filter(Boolean)")
    try:
        P.boton(c["nombre"]); P.t(300)
    except AssertionError:
        P.ev("(n) => { const b = [...document.querySelectorAll('.velo .hoja button, .velo .hoja label, .velo .hoja .lista-item')].find(x => x.textContent.includes(n)); b && b.click(); }", c["nombre"]); P.t(300)
    if P.hoja_abierta(): P.ev("() => { const b = document.querySelector('.velo .hoja .hoja-pie [data-si], .velo .hoja .hoja-pie .primario'); b && b.click(); }")
    P.t(1500)
    B.ev("""() => { const ed = [...document.querySelectorAll('[contenteditable=true]')].find(x => x.offsetParent); const q = [...ed.querySelectorAll('p')].find(x => x.textContent.includes('plan')); if (!q) return; const r = document.createRange(); r.selectNodeContents(q); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    B.p.keyboard.type(" INTRUSO"); B.t(2500)
    check("Beto no puede escribir en el párrafo asignado a la dueña", "INTRUSO" not in texto_doc(P), [nombres[:6], texto_doc(P)[:120]])
    # 7. Recibo del proceso de escritura con huella verificable
    for _ in range(8):
        st, rec = N.api("GET", f"/api/documentos/{d}/recibo?usuario={c['id']}", None, c["token"])
        if st == 200 and rec["totales"]["letrasTecleadas"] > 20: break
        time.sleep(2.5)
    check("recibo de la dueña con sus letras tecleadas", st == 200 and rec["totales"]["letrasTecleadas"] > 20, [st, rec.get("totales") if rec else None])
    check("…con huella SHA-256", st == 200 and str(rec.get("hash", "")).startswith("sha256:"), rec.get("hash") if rec else None)
    st2, ver = N.api("POST", "/api/recibos/verificar", rec, c["token"])
    check("el recibo se verifica en el servidor", st2 == 200 and (ver or {}).get("valido") is True, [st2, ver])
    rec2 = json.loads(json.dumps(rec)); rec2["totales"]["letrasTecleadas"] += 1000
    st3, ver2 = N.api("POST", "/api/recibos/verificar", rec2, c["token"])
    check("un recibo alterado NO se verifica", (ver2 or {}).get("valido") is False, [st3, ver2])
    # 8. Solo lectura: un código «Solo ver» deja ver pero no escribir
    st, enl = N.api("POST", f"/api/espacios/{esp['id']}/enlaces", {"permiso": "LECTURA", "horas": 1, "invitados": False}, c["token"])
    lector = N.cuenta()
    N.api("POST", f"/api/enlaces/{enl['codigo']}/entrar", None, lector["token"])
    L = otra_pagina(); L.entrar(lector); L.abrir(d)
    antes = texto_doc(L)
    L.ev("() => { const e = [...document.querySelectorAll('[contenteditable]')].find(x => x.offsetParent); e && e.focus(); }"); L.p.keyboard.type("NO DEBE"); L.t(1500)
    check("con «Solo ver» el documento no se puede editar", "NO DEBE" not in texto_doc(P) and "NO DEBE" not in texto_doc(L), texto_doc(L)[:100])
    # 9. Anular el código: ya nadie entra con él
    N.api("DELETE", f"/api/espacios/{esp['id']}/enlaces/{codigo}", None, c["token"])
    st, _ = N.api("GET", f"/api/enlaces/{codigo}")
    check("un código anulado ya no sirve", st in (404, 410, 403), st)
    check("Beto (con alias) y el lector no tuvieron errores de JavaScript", not B.errores and not L.errores, (B.errores + L.errores)[:3])


# ============================================================ LIENZO (presentación y diagrama)
def rueda(P, xy, ruta, derecho=True):
    """Abre la ruedita en xy (clic derecho) y elige la ruta, p. ej. ["Orden", "Girar 90°"]. Devuelve las etiquetas del último anillo."""
    P.p.mouse.click(xy[0], xy[1], button="right" if derecho else "left"); P.t(450)
    vistos = []
    for paso in ruta:
        etqs = P.ev("() => [...document.querySelectorAll('.rueda-item')].map(b => b.getAttribute('aria-label'))")
        vistos = etqs
        c = P.ev("(t) => { const b = [...document.querySelectorAll('.rueda-item')].find(x => x.getAttribute('aria-label') === t || (x.getAttribute('aria-label') || '').startsWith(t)); if (!b || b.classList.contains('off')) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }", paso)
        if not c:
            P.cerrar_hojas(); raise AssertionError(f"la ruedita no tiene «{paso}» (hay {etqs})")
        P.p.mouse.click(*c); P.t(400)
    return vistos


def fig_xy(P, bid):
    return P.ev("(id) => { const el = [...document.querySelectorAll(`.bl[data-id=\"${id}\"]`)].find(x => !x.closest('.mini')); if (!el) return null; el.scrollIntoView({block: 'nearest'}); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }", bid)


def prueba_lienzo(P, c, e):
    print("\n== Presentación y diagrama: figuras, girar, grupos dentro de grupos, capas, mesa de trabajo, notas, presentar, transición, .pptx", flush=True)
    d = N.documento(c["token"], e, "PRESENTACION", "Funciones de presentación")
    P.abrir(d)
    P.doc("""const pg = ed.pagina; [['f1', 120, 120], ['f2', 380, 120], ['f3', 640, 120]].forEach(([id, x, y], i) => doc.cambiar(id, { tipo: 'forma', forma: 'rect', pagina: pg, orden: i + 1, x, y, w: 160, h: 100, z: i + 1, html: '<div>' + id + '</div>', fondo: '#7AA7FF' }));
             doc.cambiar('fuera1', { tipo: 'forma', forma: 'elipse', pagina: pg, orden: 9, x: -400, y: 100, w: 150, h: 100, z: 9, html: '<div>en la mesa</div>' }); NOM.modos.PRESENTACION._lienzo.render(); return 1;""")
    P.t(500)
    # Girar 90° con la ruedita
    xy = fig_xy(P, "f1"); P.p.mouse.click(*xy); P.t(200)
    rueda(P, xy, ["Orden", "Girar 90°"]); P.t(300)
    check("girar 90° desde la ruedita", P.doc("return doc.valor('f1', 'rot');") in (90, "90"), P.doc("return doc.valor('f1', 'rot');"))
    # Elegir dos (Mayús+clic) y agrupar; luego agrupar con la tercera: grupo dentro de grupo
    P.p.mouse.click(*fig_xy(P, "f1")); P.p.keyboard.down("Shift"); P.p.mouse.click(*fig_xy(P, "f2")); P.p.keyboard.up("Shift"); P.t(200)
    check("Mayús+clic elige dos figuras", P.ev("() => [...document.querySelectorAll('.bl.sel')].filter(x => !x.closest('.mini')).length") == 2, P.ev("() => [...document.querySelectorAll('.bl.sel')].filter(x => !x.closest('.mini')).map(x => x.dataset.id)"))
    rueda(P, fig_xy(P, "f2"), ["Más", "Agrupar"]); P.t(300)
    g1 = P.doc("const b = doc.bloque('f1'); return JSON.stringify(b.grupos || b.grupo || null);")
    check("agrupar dos figuras", g1 not in ("null", None, "[]"), g1)
    P.p.keyboard.press("Escape"); P.p.mouse.click(*fig_xy(P, "f1")); P.p.keyboard.down("Shift"); P.p.mouse.click(*fig_xy(P, "f3")); P.p.keyboard.up("Shift"); P.t(200)
    rueda(P, fig_xy(P, "f3"), ["Más", "Agrupar"]); P.t(300)
    g2 = P.doc("const b = doc.bloque('f1'); return JSON.stringify(b.grupos || b.grupo || null);")
    check("agrupar el grupo con otra figura: grupo dentro de grupo (2 niveles)", g2.count(",") >= 1 and g2.startswith("["), g2)
    P.p.keyboard.press("Escape"); P.p.mouse.click(*fig_xy(P, "f1")); P.t(200)
    rueda(P, fig_xy(P, "f1"), ["Más", "Desagrupar"]); P.t(300)
    g3 = P.doc("const b = doc.bloque('f1'); return JSON.stringify(b.grupos || b.grupo || null);")
    check("desagrupar quita solo el nivel de arriba", g3 == g1 or (g3.startswith("[") and g3.count(",") == 0), [g1, g2, g3])
    # Capas: ocultar y bloquear desde el panel
    P.p.keyboard.press("Escape"); P.barra("Capas"); P.t(400)
    filas = P.ev("() => [...document.querySelectorAll('.capa-fila[data-c]')].map(x => x.dataset.c)")
    check("el panel de capas lista las figuras", "f3" in filas, filas)
    oc = P.ev("""() => { const f = document.querySelector('.capa-fila[data-c="f3"]'); if (!f) return null; const b = f.querySelector('[aria-label^="Ocultar"], [data-ocultar], [title^="Ocultar"]'); if (!b) return 'sin botón'; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }""")
    if isinstance(oc, list): P.p.mouse.click(*oc); P.t(300)
    check("ocultar una figura desde Capas", P.doc("return !!(doc.valor('f3', 'oculto'));") is True, [oc, P.doc("return JSON.stringify(doc.bloque('f3'));")[:200]])
    bq = P.ev("""() => { const f = document.querySelector('.capa-fila[data-c="f2"]'); if (!f) return null; const b = f.querySelector('[aria-label^="Bloquear"], [data-bloquear], [title^="Bloquear"]'); if (!b) return 'sin botón'; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }""")
    if isinstance(bq, list): P.p.mouse.click(*bq); P.t(300)
    check("bloquear una figura desde Capas", P.doc("return !!(doc.valor('f2', 'bloqueado'));") is True, bq)
    if P.centro('[aria-label="Cerrar capas"]'): P.clic('[aria-label="Cerrar capas"]')
    P.cerrar_hojas()
    # Notas del orador y transición
    P.barra("Notas del orador"); P.t(300)
    P.ev("() => { const t = [...document.querySelectorAll('textarea')].find(x => x.offsetParent && /^Lo que quieres decir/i.test(x.placeholder)); t.focus(); }")
    P.p.keyboard.type("Saludar y explicar la gráfica"); P.t(900)
    check("las notas del orador se guardan en la diapositiva", P.doc("return doc.valor('_doc', 'nota:' + ed.pagina) || '';") == "Saludar y explicar la gráfica", P.doc("return doc.valor('_doc', 'nota:' + ed.pagina) || '';"))
    P.barra("Transición"); P.menu("Desvanecer"); P.t(300)
    check("transición «Desvanecer»", P.doc("return doc.valor('_doc', 'trans:' + ed.pagina);") == "desvanecer", P.doc("return doc.valor('_doc', 'trans:' + ed.pagina);"))
    # Modo presentador: muestra las notas; la figura de la mesa de trabajo y la oculta no se presentan
    P.barra("Presentar"); P.t(300)
    P.menu("Modo presentador"); P.t(1200)
    txt = P.ev("() => document.body.innerText")
    check("modo presentador: se ven las notas del orador", "Saludar y explicar la gráfica" in txt, txt[:200])
    check("…la figura de la mesa de trabajo (fuera de la hoja) no se presenta", P.ev("() => ![...document.querySelectorAll('.reproductor .bl, .presentador .bl')].some(x => x.textContent.includes('en la mesa'))"), "")
    check("…ni la que se ocultó en Capas", P.ev("() => ![...document.querySelectorAll('.reproductor .bl, .presentador .bl')].some(x => x.textContent.trim() === 'f3')"), "")
    P.p.keyboard.press("Escape"); P.t(400); P.p.keyboard.press("Escape"); P.t(300)
    check("salir de presentar regresa al editor", P.ev("() => !document.querySelector('.reproductor')"), "")
    # .pptx: la figura de la mesa de trabajo no sale; las notas sí
    b64 = P.ev("() => { const u = NOM.ooxml.pptx(NOM.editorActual.doc, false); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }")
    from pptx import Presentation
    pr = Presentation(io.BytesIO(base64.b64decode(b64)))
    textos = [sh.text_frame.text for sh in pr.slides[0].shapes if sh.has_text_frame]
    check(".pptx: la figura de la mesa de trabajo no se exporta", not any("en la mesa" in t for t in textos), textos)
    check(".pptx: las notas del orador van en la diapositiva", pr.slides[0].has_notes_slide and "Saludar" in pr.slides[0].notes_slide.notes_text_frame.text, "")
    rots = [sh.rotation for sh in pr.slides[0].shapes if sh.has_text_frame and sh.text_frame.text == "f1"]
    check(".pptx: la figura girada sale girada 90°", rots and abs(rots[0] - 90) < 0.5, rots)
    # Deshacer en presentación
    n0 = P.doc("return doc.deLaPagina(ed.pagina).length;")
    P.barra("Cuadro de texto"); P.t(300)
    P.p.keyboard.type("Nuevo cuadro"); P.p.keyboard.press("Escape"); P.p.keyboard.press("Escape"); P.t(500)
    n1 = P.doc("return doc.deLaPagina(ed.pagina).length;")
    hay = P.doc("return doc.deLaPagina(ed.pagina).some(b => (b.html || '').includes('Nuevo cuadro'));")
    check("«Cuadro de texto» lo pone al centro listo para escribir", n1 == n0 + 1 and hay, [n0, n1, hay])
    pasos = 0
    while P.doc("return doc.deLaPagina(ed.pagina).length;") != n0 and pasos < 3:
        P.barra("Deshacer"); P.t(300); pasos += 1
    check(f"deshacer quita el cuadro nuevo (en {pasos} paso(s): el texto y luego el cuadro)", P.doc("return doc.deLaPagina(ed.pagina).length;") == n0 and pasos <= 2, pasos)
    check("…y no deja un bloque vacío escondido en el documento", P.doc("return doc.vivos().filter(b => b.id !== '_doc' && !b.tipo).length;") == 0, P.doc("return doc.vivos().filter(b => b.id !== '_doc' && !b.tipo).map(b => b.id);"))
    for _ in range(pasos): P.barra("Rehacer"); P.t(300)
    check("rehacer lo trae de vuelta con su texto", P.doc("return doc.deLaPagina(ed.pagina).some(b => (b.html || '').includes('Nuevo cuadro'));"), P.doc("return doc.deLaPagina(ed.pagina).map(b => b.html).join('|');"))
    # Diagrama: conector entre dos figuras que sigue a la figura al moverla
    dd = N.documento(c["token"], e, "DIAGRAMA", "Funciones de diagrama")
    P.abrir(dd)
    P.doc("""const pg = ed.pagina; doc.cambiar('a', { tipo: 'forma', forma: 'rect', pagina: pg, orden: 1, x: 40, y: 80, w: 120, h: 70, z: 1, html: '<div>A</div>' });
             doc.cambiar('b', { tipo: 'forma', forma: 'rect', pagina: pg, orden: 2, x: 200, y: 300, w: 120, h: 70, z: 2, html: '<div>B</div>' }); NOM.modos.DIAGRAMA._lienzo.render(); return 1;""")
    P.t(400)
    P.barra("Conector"); P.t(200)
    xa, xb = fig_xy(P, "a"), fig_xy(P, "b")
    P.p.mouse.click(*xa); P.t(300); P.p.mouse.click(*xb); P.t(500)
    con = P.doc("return doc.deLaPagina(ed.pagina).filter(b => b.tipo === 'conector').map(b => [b.de, b.a, b.desde, b.hasta].filter(Boolean).join('>'));")
    check("conector de A a B (herramienta Conector: clic en A, clic en B)", any("a" in x and "b" in x for x in con), con)
    P.p.keyboard.press("Escape"); P.barra("Seleccionar y mover"); P.t(150)
    xb = fig_xy(P, "b"); P.p.mouse.move(*xb); P.p.mouse.down(); P.p.mouse.move(xb[0] + 120, xb[1] + 60, steps=8); P.p.mouse.up(); P.t(500)
    check("mover B con el ratón cambia su posición", P.doc("return doc.valor('b', 'x');") > 200, P.doc("return doc.valor('b', 'x');"))
    linea = P.ev("() => [...document.querySelectorAll('.capa-conectores path.linea, svg path.linea')].map(x => x.getAttribute('d')).join('|')")
    check("…y el conector la sigue (se vuelve a dibujar hasta B)", bool(linea), linea[:120])
    P.barra("Ajustar a la cuadrícula"); P.t(200)
    xa = fig_xy(P, "a"); P.p.mouse.move(*xa); P.p.mouse.down(); P.p.mouse.move(xa[0] + 37, xa[1] + 19, steps=6); P.p.mouse.up(); P.t(400)
    x, y = P.doc("return doc.valor('a', 'x');"), P.doc("return doc.valor('a', 'y');")
    check("con la cuadrícula prendida la figura cae en la cuadrícula", x % 8 == 0 and y % 8 == 0 or x % 12 == 0 and y % 12 == 0 or x % 24 == 0 and y % 24 == 0, [x, y])
    svg = P.ev("() => NOM.formatos.aSvg ? NOM.formatos.aSvg(NOM.editorActual.doc, NOM.editorActual.pagina).length : 0")
    check("exportar el diagrama a SVG", svg > 200, svg)


# ============================================================ CUENTAS, ESPACIOS Y SIN RED
def prueba_cuentas(P, c, e, salida):
    print("\n== Cuentas, espacios, sin cuenta, sin red", flush=True)
    import random, string
    # Una página nueva sin sesión (como alguien que llega por primera vez)
    Q = otra_pagina()
    Q.p.goto(Q.base + "/"); Q.p.wait_for_selector("#u", timeout=30000)
    # 1. Contraseña equivocada: mensaje claro, sin entrar
    Q.p.fill("#u", c["nombre"]); Q.p.fill("#c", "equivocada-123"); Q.p.click("button[type=submit]"); Q.t(1500)
    msg = Q.ev("() => document.body.innerText")
    check("contraseña equivocada: no entra y lo dice", not Q.ev("() => !!localStorage.getItem('nom.token')") and ("incorrect" in msg.lower() or "no coincide" in msg.lower() or "equivoc" in msg.lower()), msg[:300])
    # 2. Crear cuenta por la pantalla: sale el código de recuperación y entra
    nombre = "alta" + "".join(random.choice(string.ascii_lowercase) for _ in range(6))
    Q.boton("Crear cuenta", "body"); Q.t(400)
    Q.p.fill("#ru", nombre); Q.p.fill("#rc", N.CL)
    check("sin aceptar los Términos no se crea la cuenta", Q.ev("() => { document.querySelector('#rc').closest('form').requestSubmit(); return new Promise(r => setTimeout(() => r(!localStorage.getItem('nom.token') && /acepta los Términos/.test(document.body.innerText)), 1500)); }"), "")
    Q.p.check("#rc >> xpath=ancestor::form//input[@name='acepto']")
    Q.ev("() => document.querySelector('#rc').closest('form').requestSubmit()"); Q.t(3500)
    check("crear cuenta por la pantalla muestra «Tu código de recuperación»", (Q.hoja_abierta() or "").startswith("Tu código"), Q.hoja_abierta())
    cod = Q.ev("() => (document.querySelector('.velo .hoja') || {}).innerText || ''")
    check("…con un código de 4 bloques", bool(re.search(r"[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}", cod)), cod[:200])
    try: Q.boton("Ya lo guardé")
    except AssertionError: Q.cerrar_hojas()
    Q.t(2500)
    check("…y entra a su inicio con sesión", Q.ev("() => !!localStorage.getItem('nom.token')") and "#/doc" not in Q.ev("() => location.hash"), Q.ev("() => location.hash"))
    # 3. Cerrar sesión desde el menú de la cuenta
    Q.ev("() => document.querySelectorAll('.velo, .bienvenida-momento').forEach(v => v.remove())")
    Q.clic('[aria-label="Cuenta y ajustes"]'); Q.t(300); Q.menu("Cerrar sesión"); Q.t(1500)
    if Q.hoja_abierta(): Q.ev("() => { const b = document.querySelector('.velo .hoja .hoja-pie [data-si], .velo .hoja .hoja-pie .primario, .velo .hoja .hoja-pie .peligro'); b && b.click(); }"); Q.t(1500)
    check("cerrar sesión regresa a la pantalla de entrada", Q.ev("() => !!document.querySelector('#u') && !localStorage.getItem('nom.token')"), Q.ev("() => location.hash"))
    # 4. Usar sin cuenta: documento solo en este navegador, sigue al recargar
    Q.ev("() => { const b = document.querySelector('[data-sin-cuenta]'); b && b.click(); }"); Q.t(1500)
    Q.ev("() => document.querySelectorAll('.velo').forEach(v => v.remove())")
    txt = Q.ev("() => document.body.innerText")
    check("«Usar sin cuenta» entra sin registrarse", not Q.ev("() => !!localStorage.getItem('nom.token')") and ("Nuevo" in txt), txt[:200])
    try:
        Q.boton("Nuevo", "main"); Q.t(500)
        if Q.hoja_abierta():
            Q.ev("() => { const i = document.querySelector('.velo .hoja input'); if (i) { i.value = 'Mi local'; i.dispatchEvent(new Event('input', {bubbles: true})); } }")
            tipo = Q.ev("() => { const b = [...document.querySelectorAll('.velo .hoja button, .velo .hoja [data-modo]')].find(x => /Texto/.test(x.textContent)); if (b) { b.click(); return true; } return false; }"); Q.t(300)
            if Q.hoja_abierta(): Q.ev("() => { const b = document.querySelector('.velo .hoja .hoja-pie [data-si], .velo .hoja .hoja-pie .primario'); b && b.click(); }")
        Q.p.wait_for_function("() => window.NOM && NOM.editorActual && NOM.editorActual.vista && NOM.editorActual.vista.isConnected", timeout=10000); Q.t(500)
        Q.quitar_consejo()
        xy = Q.centro("[contenteditable=true]"); Q.p.mouse.click(xy[0], xy[1] - 10); Q.p.keyboard.type("Solo en este equipo"); Q.t(1500)
        h = Q.ev("() => location.hash")
        Q.p.reload(); Q.p.wait_for_function("() => window.NOM && NOM.editorActual && NOM.editorActual.vista && NOM.editorActual.vista.isConnected", timeout=15000); Q.t(800)
        check("documento sin cuenta: lo escrito sigue después de recargar", "Solo en este equipo" in texto_doc(Q), [h, texto_doc(Q)[:80]])
    except Exception as ex:
        check("documento sin cuenta: crear, escribir y recargar", False, f"{type(ex).__name__}: {str(ex)[:200]}")
    check("sin errores de JavaScript en la entrada, el registro y sin cuenta", not Q.errores, Q.errores[:3])

    # 5. Letra del espacio (1.4): los textos nuevos nacen con ella
    p = P.p
    p.goto(url(P.base, "/#/espacio/" + e)); P.t(1200); P.cerrar_hojas()
    P.clic('[aria-label="Más opciones del espacio"]'); P.menu("Letra de los textos nuevos"); P.t(500)
    ok_letra = False
    if P.hoja_abierta():
        P.ev("""() => { const h = document.querySelector('.velo .hoja'); const s = [...h.querySelectorAll('select')]; const f = s.find(x => [...x.options].some(o => /Times/.test(o.textContent)));
          if (f) { f.value = [...f.options].find(o => /Times/.test(o.textContent)).value; f.dispatchEvent(new Event('change', {bubbles: true})); } }""")
        P.ev("() => { const b = document.querySelector('.velo .hoja .hoja-pie [data-si], .velo .hoja .hoja-pie .primario'); b && b.click(); }"); P.t(800)
        d2 = N.documento(c["token"], e, "TEXTO", "Con la letra del espacio")
        P.abrir(d2)
        xy = P.centro("[contenteditable=true]"); p.mouse.click(xy[0], xy[1] - 10); p.keyboard.type("Texto con letra"); P.t(400)
        fuente = (estilo_de(P, "Texto con letra") or {}).get("fuente", "")
        ok_letra = "Times" in fuente
        check("letra del espacio: un texto nuevo nace en Times New Roman", ok_letra, fuente)
    else:
        check("«Letra de los textos nuevos…» abre su ventana", False, "")
    # 6. Proteger contra el borrado (1.2): no se puede mandar a la papelera hasta quitarla
    d3 = N.documento(c["token"], e, "HOJA", "Protegido")
    P.abrir(d3); P.clic('.barra-sup [aria-label="Más opciones"], header [aria-label="Más opciones"], [aria-label="Más opciones"]'); P.menu("Proteger contra el borrado"); P.t(800)
    st, _ = N.api("DELETE", f"/api/documentos/{d3}", None, c["token"])
    check("un documento protegido no se puede borrar (ni por la API)", st >= 400, st)
    # 7. Entrega con fecha límite (3.6): la ventana guarda la fecha
    P.clic('[aria-label="Más opciones"]'); P.menu("Entrega con fecha límite"); P.t(500)
    if P.hoja_abierta():
        P.ev("""() => { const i = document.querySelector('.velo .hoja input[type=datetime-local], .velo .hoja input[type=date]'); if (i) { i.value = i.type === 'date' ? '2026-12-01' : '2026-12-01T10:00'; i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new Event('change', {bubbles: true})); } }""")
        P.ev("() => { const b = document.querySelector('.velo .hoja .hoja-pie [data-si], .velo .hoja .hoja-pie .primario'); b && b.click(); }"); P.t(800)
    st, info = N.api("GET", f"/api/documentos/{d3}", None, c["token"])
    check("entrega con fecha límite guardada en el documento", "2026-12-01" in json.dumps(info) or "entrega" in json.dumps(info).lower() and "null" not in json.dumps((info or {}).get("entrega")), json.dumps(info)[:300])
    # 8. Cuánto ocupa y descargar todo
    p.goto(url(P.base, "/#/espacio/" + e)); P.t(1200)
    P.clic('[aria-label="Más opciones del espacio"]'); P.menu("Cuánto espacio ocupa"); P.t(800)
    txt = P.ev("() => (document.querySelector('.velo .hoja') || {}).innerText || ''")
    check("«Cuánto espacio ocupa» muestra lo usado", bool(re.search(r"\d+([.,]\d+)?\s*(B|KB|MB|kB|bytes)\b", txt)), txt[:200])
    P.cerrar_hojas()
    with p.expect_download(timeout=30000) as dl:
        P.clic('[aria-label="Más opciones del espacio"]'); P.menu("Descargar todo")
    ruta = os.path.join(salida, "todo.zip"); dl.value.save_as(ruta)
    z = zipfile.ZipFile(ruta); nombres = z.namelist()
    check("«Descargar todo» da un .zip con los documentos en formato de Office", any(x.endswith(".docx") for x in nombres) and any(x.endswith(".xlsx") for x in nombres), nombres[:8])
    # 9. Ctrl+K: buscar e ir a
    p.keyboard.press("Control+k"); P.t(400)
    p.keyboard.type("Protegido"); P.t(600)
    res = P.ev("() => [...document.querySelectorAll('.paleta [role=option], .paleta button, [class*=paleta] li, [class*=paleta] button')].map(x => x.textContent.trim()).filter(Boolean).slice(0, 6)")
    p.keyboard.press("Enter"); P.t(1200)
    check("Ctrl+K encuentra un documento por nombre y lo abre con Enter", P.ev("() => location.hash") == "#/doc/" + d3, [res, P.ev("() => location.hash")])
    P.cerrar_hojas()

    # 10. Sin red: escribir sin conexión, recargar sin red y al volver todo se sube
    d4 = N.documento(c["token"], e, "TEXTO", "Sin red")
    P.abrir(d4)
    xy = P.centro("[contenteditable=true]"); p.mouse.click(xy[0], xy[1] - 10); p.keyboard.type("Antes de cortar."); P.t(1500)
    ctx = p.context
    ctx.set_offline(True); P.t(500)
    p.keyboard.press("Enter"); p.keyboard.type("Escrito sin red."); P.t(2500)
    estado = P.ev("() => document.body.innerText")
    check("sin red: avisa que no hay conexión", "Sin conexión" in estado or "sin conexión" in estado.lower() or "sin red" in estado.lower(), estado[:200])
    try:
        p.reload(); p.wait_for_function("() => window.NOM && NOM.editorActual && NOM.editorActual.vista && NOM.editorActual.vista.isConnected", timeout=20000); P.t(1200)
        check("sin red: la página se vuelve a abrir (guardada en el equipo) con lo escrito", "Escrito sin red." in texto_doc(P), texto_doc(P)[:120])
    except Exception as ex:
        check("sin red: la página se vuelve a abrir (guardada en el equipo) con lo escrito", False, f"{type(ex).__name__}: {str(ex)[:160]}")
    # Una hoja editada sin red y recargada sin red (sus cambios no son de texto: antes no se abría)
    d5 = N.documento(c["token"], e, "HOJA", "Hoja sin red")
    ctx.set_offline(False); P.t(1500)
    P.abrir(d5); ctx.set_offline(True); P.t(400)
    escribir(P, 0, 0, "Sin red 1"); escribir(P, 0, 1, "=2+3"); P.t(2500)
    try:
        p.reload(); p.wait_for_function("() => window.NOM && NOM.editorActual && NOM.editorActual.vista && NOM.editorActual.vista.isConnected", timeout=20000); P.t(1200)
        check("hoja editada sin red: se vuelve a abrir sin red con sus celdas", visto(P, 0, 0) == "Sin red 1" and visto(P, 0, 1) == "5", [visto(P, 0, 0), visto(P, 0, 1), P.errores[-2:]])
    except Exception as ex:
        check("hoja editada sin red: se vuelve a abrir sin red con sus celdas", False, f"{type(ex).__name__}: {str(ex)[:160]} {P.errores[-2:]}")
    P.abrir(d4) if False else None
    # Mientras, otra persona cambia el documento en el servidor
    N.api("PUT", f"/api/espacios/{e}/accesos", {"usuario": OTRO.setdefault("cuenta2", N.cuenta())["nombre"], "permiso": "EDICION"}, c["token"])
    ctx.set_offline(False); P.t(6000)
    st5, est5 = N.api("GET", f"/api/documentos/{d5}", None, c["token"])
    check("…y al volver la red las celdas llegan al servidor", "Sin red 1" in json.dumps(est5, ensure_ascii=False), json.dumps(est5, ensure_ascii=False)[:200])
    st, est = N.api("GET", f"/api/documentos/{d4}", None, c["token"])
    check("al volver la red, lo escrito sin conexión llega al servidor", "Escrito sin red." in json.dumps(est, ensure_ascii=False), json.dumps(est, ensure_ascii=False)[:200])
    check("sin errores de JavaScript (sin red y de regreso)", not [x for x in P.errores if "Failed to fetch" not in x and "ERR_INTERNET" not in x and "net::" not in x], P.errores[-3:])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("salida")
    ap.add_argument("--movil", action="store_true")
    ap.add_argument("--cdp"); ap.add_argument("--base", default=N.B)
    ap.add_argument("--solo", nargs="*")
    a = ap.parse_args()
    os.makedirs(a.salida, exist_ok=True)
    c = N.cuenta(); e = N.espacio(c["token"], "Funciones")
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        if a.cdp:
            nav = pw.chromium.connect_over_cdp(a.cdp); ctx = nav.contexts[0]; p = ctx.pages[0] if APP else ctx.new_page()
        else:
            motor = os.environ.get("NOM_NAVEGADOR", "chromium")
            nav = getattr(pw, motor).launch()
            opc = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2) if a.movil else dict(viewport={"width": 1400, "height": 900})
            if motor == "firefox": opc.pop("is_mobile", None)
            ctx = nav.new_context(accept_downloads=True, **opc); p = ctx.new_page()
        P = Pagina(p, a.base)
        OTRO["pw"] = pw; OTRO["base_local"] = os.environ.get("NOM_BASE_LOCAL", a.base)
        P.entrar(c)
        secciones = {"hoja": prueba_hoja, "texto": prueba_texto, "colaboracion": lambda P, c, e: prueba_colaboracion(P, c, e, a.salida), "lienzo": prueba_lienzo, "cuentas": lambda P, c, e: prueba_cuentas(P, c, e, a.salida)}
        for nombre, fn in secciones.items():
            if a.solo and nombre not in a.solo: continue
            try: fn(P, c, e)
            except Exception as ex:
                check(f"{nombre}: la sección terminó sin trabarse", False, f"{type(ex).__name__}: {str(ex)[:300]}")
                try: p.screenshot(path=os.path.join(a.salida, f"funciones-{nombre}-trabada.png"))
                except Exception: pass
            P.cerrar_hojas()
        check("sin errores de JavaScript en la página", not P.errores, P.errores[:5])
        if a.cdp and not APP: p.close()
        else: nav.close()
        if "nav" in OTRO: OTRO["nav"].close()
    print(f"\nFunciones: {BIEN[0]} bien, {MAL[0]} mal")
    for x in DETALLE: print("  MAL", x)
    sys.exit(1 if MAL[0] else 0)


if __name__ == "__main__":
    main()
