import os, sys, tempfile; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sys, base64, os, subprocess, json
from nomprueba import *
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), "nom-pruebas"); os.makedirs(OUT, exist_ok=True)
esperar_servidor()
c = cuenta(); e = espacio(c["token"]); d = documento(c["token"], e, "DIAGRAMA", "Diagramas")
n = Navegador(); n.entrar(c); n.abrir(d); p = n.p
ev = p.evaluate
L = "NOM.modos.DIAGRAMA._lienzo"
# 1. Galería de diagramas listos
p.click('[aria-label="Diagramas listos"]'); p.wait_for_timeout(600)
print("tarjetas:", ev("() => document.querySelectorAll('.dg-tarjeta').length"), "previas con figuras:", ev("() => [...document.querySelectorAll('.dg-tarjeta .dg-previa')].filter(x => x.querySelector('.bl')).length"))
n.foto(OUT + "/galeria.png")
p.click('.dg-tarjeta[data-d="flujo"]'); p.wait_for_timeout(500)
cuenta_ = lambda: ev("() => { const bs = NOM.editorActual.doc.deLaPagina(NOM.editorActual.pagina); return [bs.filter(b => b.tipo !== 'conector').length, bs.filter(b => b.tipo === 'conector').length]; }")
print("flujo (figuras, flechas):", cuenta_(), "elegidas:", ev(f"() => {L}.cuantos()"))
# los demás, por código, cada uno en otro lugar del pizarrón
for i, t in enumerate(["clases", "er", "mental", "espina", "venn", "tiempo", "organigrama", "conceptual", "foda", "casos", "ciclo", "pasos"]):
    ev("""([t, i]) => { const c = NOM.diagramas.CATALOGO.find(x => x.id === t); const g = c.hacer(c.texto ? undefined : undefined); }""", [t, i])
    r = ev("""([t, i]) => { const c = NOM.diagramas.CATALOGO.find(x => x.id === t);
      const EJ = { pasos: 'Uno\\nDos\\nTres', ciclo: 'A\\nB\\nC\\nD', tiempo: '1810: Inicio\\n1821: Fin', organigrama: 'Jefe\\n  A\\n  B\\n    C', mental: 'Idea\\n  Rama 1\\n    Hoja\\n  Rama 2', conceptual: 'Célula\\n  (tiene) Núcleo', venn: 'A\\nB\\nC', espina: 'Problema\\n  Causa\\n    detalle\\n  Otra', foda: 'Fortalezas\\n  x' };
      const g = c.hacer(c.texto ? EJ[t] : undefined);
      const ids = NOM.modos.DIAGRAMA._lienzo.insertarBloques(g.bloques, g.uniones, { x: 1800 + (i % 4) * 1500, y: 300 + Math.floor(i / 4) * 1100 });
      return [g.bloques.length, g.uniones.length, ids.length]; }""", [t, i])
    print(" ", t, r)
p.wait_for_timeout(500)
print("total (figuras, flechas):", cuenta_())
print("compartimentos de clase:", ev("() => document.querySelectorAll('.forma[data-figura=\"clase\"] .cm-nombre').length"), "secciones:", ev("() => document.querySelectorAll('.forma[data-figura=\"clase\"] .cm-sec').length"))
print("flechas pintadas:", ev("() => document.querySelectorAll('.capa-conectores [data-conector] path.linea').length"), "puntas:", ev("() => document.querySelectorAll('.capa-conectores path.punta').length"), "etiquetas:", ev("() => document.querySelectorAll('.capa-conectores .etq').length"))
ev(f"() => {L}.ajustar()"); p.wait_for_timeout(400)
n.foto(OUT + "/diag_todo.png")
# 2. Una flecha: elegirla, cambiar a codo, puntas de herencia y texto
pptx_todo = ev("""() => { const u = NOM.ooxml.pptx(NOM.editorActual.doc, true); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }""")
open(os.path.join(OUT, 'todos.pptx'), 'wb').write(base64.b64decode(pptx_todo))
svg_todo = ev("() => NOM.formatos.aSvg(NOM.editorActual.doc, NOM.editorActual.pagina)")
open(os.path.join(OUT, 'todos.svg'), 'w').write(svg_todo)
d2 = documento(c['token'], e, 'DIAGRAMA', 'Flechas'); n.abrir(d2); p.wait_for_timeout(1500)
ev("() => { NOM.editorActual.doc.cambiar('_doc', {}); }")
ev(f"() => {{ const l = {L}; l.render(); }}")
nuevo = ev("""() => { const ed = NOM.editorActual; const L = NOM.modos.DIAGRAMA._lienzo;
  const ids = L.insertarBloques([{ tipo: 'forma', figura: 'rect', x: 0, y: 0, w: 160, h: 80, texto: 'Uno', color: '#CFE0FF' }, { tipo: 'forma', figura: 'rect', x: 360, y: 220, w: 160, h: 80, texto: 'Dos', color: '#CDEFD9' }], [[0, 1, {}]], { x: 400, y: 300 });
  const c = ed.doc.deLaPagina(ed.pagina).find(b => b.tipo === 'conector' && b.desde === ids[0]); return c.id; }""")
p.wait_for_timeout(300)
ev("""(id) => { const r = document.querySelector('[data-conector="' + id + '"] path.toque'); r.scrollIntoView && 0; }""", nuevo)
# centrar la vista en esa flecha
ev(f"""(id) => {{ const ed = NOM.editorActual, c = ed.doc.bloque(id), a = ed.doc.bloque(c.desde); }}""", nuevo)
ev("() => document.querySelectorAll('.bienvenida-momento, .pista').forEach(x => x.remove())")
box = p.locator(f'[data-conector="{nuevo}"] path.toque').bounding_box()
print("caja de la flecha:", box is not None)
if box:
    p.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); p.wait_for_timeout(300)
print("barra de flecha:", ev("() => !document.querySelector('.lz-barra').hidden && !!document.querySelector('.lz-barra [data-a=\"c-ruta\"]')"))
p.click('.lz-barra [data-a="c-ruta"]'); p.wait_for_timeout(200); p.click(".menu >> text=En codo"); p.wait_for_timeout(300)
p.click('.lz-barra [data-a="c-puntas"]'); p.wait_for_timeout(200); p.click(".menu >> text=Triángulo hueco (herencia)"); p.wait_for_timeout(300)
p.click('.lz-barra [data-a="c-texto"]'); p.wait_for_timeout(300)
p.fill("#fl-m", "hereda de"); p.fill("#fl-i", "1"); p.fill("#fl-f", "N"); p.click(".hoja-pie [data-si]"); p.wait_for_timeout(300)
print("flecha:", ev("(id) => { const c = NOM.editorActual.doc.bloque(id); return [c.ruta, c.tipoPunta, c.etiqueta, c.etqIni, c.etqFin]; }", nuevo))
print("dibujo:", ev("(id) => { const g = document.querySelector('[data-conector=\"' + id + '\"]'); return [g.querySelector('path.linea').getAttribute('d').split('L').length, g.querySelectorAll('.etq').length, g.querySelector('path.punta').style.fill]; }", nuevo))
# ruedita de la flecha
pt = ev("""(id) => { const pa = document.querySelector('[data-conector="' + id + '"] path.linea'); const q = pa.getPointAtLength(pa.getTotalLength() * 0.3); const m = pa.getScreenCTM(); return [q.x * m.a + q.y * m.c + m.e, q.x * m.b + q.y * m.d + m.f]; }""", nuevo)
p.mouse.click(pt[0], pt[1], button="right"); p.wait_for_timeout(400)
print("ruedita flecha:", ev("() => [...document.querySelectorAll('.rueda [data-i], .rueda button')].map(b => b.getAttribute('aria-label') || b.textContent.trim()).filter(Boolean).slice(0, 10)"))
p.keyboard.press("Escape"); p.wait_for_timeout(200)
# 3. Cuadrícula
p.click('[aria-label="Ajustar a la cuadrícula"]'); p.wait_for_timeout(200)
print("cuadrícula:", ev(f"() => {L}.cuadricula()"), ev("() => document.querySelector('.pizarra').classList.contains('con-cuadricula')"))
uno = ev("""() => { const ed = NOM.editorActual; return ed.doc.deLaPagina(ed.pagina).find(b => b.texto === 'Uno').id; }""")
bl = p.locator(f'.bl[data-id="{uno}"]').bounding_box()
p.mouse.move(bl["x"] + 40, bl["y"] + 40); p.mouse.down(); p.mouse.move(bl["x"] + 77, bl["y"] + 91, steps=6); p.mouse.up(); p.wait_for_timeout(300)
print("posición con cuadrícula:", ev("(id) => { const b = NOM.editorActual.doc.bloque(id); return [b.x, b.y, b.x % 24, b.y % 24]; }", uno))
# 4. Figuras UML desde la galería de figuras
p.click('[aria-label="Más figuras"]'); p.wait_for_timeout(300)
print("secciones de figuras:", ev("() => [...document.querySelectorAll('.lz-panel-figuras .menu-titulo')].map(x => x.textContent)"), ev("() => document.querySelectorAll('.lz-panel-figuras [data-p]').length"), ev("() => document.querySelectorAll('.lz-panel-figuras [data-r]').length"))
n.foto(OUT + "/figuras.png")
p.click('.lz-panel-figuras [data-p="clase"]'); p.wait_for_timeout(400)
clase = ev("() => NOM.modos.DIAGRAMA._lienzo.seleccion()")
print("clase creada:", ev("(id) => { const b = NOM.editorActual.doc.bloque(id); return [b.figura, b.bordeAncho, b.texto.split('\\n').length]; }", clase))
# editar la clase: doble clic → texto simple
bl = p.locator(f'.bl[data-id="{clase}"]').bounding_box()
p.mouse.dblclick(bl["x"] + bl["width"] / 2, bl["y"] + bl["height"] / 2); p.wait_for_timeout(300)
print("editando como texto:", ev("(id) => { const el = document.querySelector('.bl[data-id=\"' + id + '\"] .txt'); return [el.isContentEditable, el.classList.contains('cm-editando'), el.textContent.slice(0, 20)]; }", clase))
p.keyboard.press("Control+a"); p.keyboard.type("Libro\n- titulo: texto\n- autor: texto\n+ prestar()\n+ devolver()")
p.mouse.click(5, 400); p.wait_for_timeout(400)
print("clase editada:", ev("(id) => { const b = NOM.editorActual.doc.bloque(id); return [b.texto, b.html || null, document.querySelectorAll('.bl[data-id=\"' + id + '\"] .cm-sec')[1].textContent]; }", clase))
# 5. Texto a diagrama
ev("() => NOM.diagramas.desdeTexto(NOM.modos.DIAGRAMA._lienzo, 'mental')"); p.wait_for_timeout(500)
p.fill("[data-txt]", "Sistema solar\n  Planetas\n    Tierra\n    Marte\n  Estrellas\n    Sol\n  Lunas"); p.wait_for_timeout(500)
print("previa de texto:", ev("() => document.querySelectorAll('[data-previa] .bl').length"))
n.foto(OUT + "/texto_diag.png")
p.click(".hoja-pie [data-si]"); p.wait_for_timeout(500)
print("insertado del texto:", ev(f"() => {L}.cuantos()"))
# 6. Exportar: SVG, pptx
svg = ev("() => { const ed = NOM.editorActual; return NOM.formatos.aSvg ? NOM.formatos.aSvg(ed.doc, ed.pagina) : null; }")
print("aSvg expuesto:", svg is not None)
b64 = ev("""() => { const u = NOM.ooxml.pptx(NOM.editorActual.doc, true); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }""")
ruta = os.path.join(OUT, "diagrama.pptx"); open(ruta, "wb").write(base64.b64decode(b64))
import zipfile, xml.dom.minidom
z = zipfile.ZipFile(ruta); malos = []
for nm in z.namelist():
    if nm.endswith(".xml") or nm.endswith(".rels"):
        try: xml.dom.minidom.parseString(z.read(nm))
        except Exception as ex: malos.append((nm, str(ex)))
print("pptx:", os.path.getsize(ruta), "xml malos:", malos)
from pptx import Presentation
pr = Presentation(ruta)
print("formas en la diapositiva:", len(pr.slides[0].shapes))
r = subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", OUT, ruta], capture_output=True, text=True, timeout=180)
print("libreoffice:", r.returncode)
subprocess.run(["pdftoppm", "-png", "-r", "70", os.path.join(OUT, "diagrama.pdf"), os.path.join(OUT, "diagrama")], timeout=60)
# 7. Presentación con un diagrama listo: las flechas se ven al presentar
d3 = documento(c["token"], e, "PRESENTACION", "Con diagrama"); n.abrir(d3); p.wait_for_timeout(1200)
ev("() => { const c = NOM.diagramas.CATALOGO.find(x => x.id === 'flujo'); const g = c.hacer(); NOM.modos.PRESENTACION._lienzo.insertarBloques(g.bloques, g.uniones); }"); p.wait_for_timeout(500)
print("en la diapositiva:", ev("() => { const ed = NOM.editorActual, bs = ed.doc.deLaPagina(ed.pagina); return [bs.filter(b => b.tipo === 'forma').length, bs.filter(b => b.tipo === 'conector').length, Math.max(...bs.filter(b => b.x != null).map(b => b.y + b.h))]; }"))
p.keyboard.press("Escape"); p.mouse.click(5, 500); p.keyboard.press("F5"); p.wait_for_timeout(800)
print("al presentar, flechas:", ev("() => document.querySelectorAll('.reproductor .capa-conectores path.linea').length"))
n.foto(OUT + "/pres_diag.png")
p.keyboard.press("Escape"); p.wait_for_timeout(300)
print("errores:", n.errores[:8])
n.cerrar()
