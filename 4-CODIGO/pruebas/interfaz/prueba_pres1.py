import os, sys, tempfile; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sys
from nomprueba import *
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), "nom-pruebas"); os.makedirs(OUT, exist_ok=True)
esperar_servidor()
c = cuenta(); e = espacio(c["token"]); d = documento(c["token"], e, "PRESENTACION", "Expo")
n = Navegador(); n.entrar(c); n.abrir(d); p = n.p
ev = p.evaluate
# Tema
p.click('[aria-label="Diseño"]'); p.wait_for_timeout(250)
p.click('[data-tema="oceano"]'); p.wait_for_timeout(250); p.keyboard.press("Escape"); p.wait_for_timeout(200)
print("tema:", ev("() => [NOM.editorActual.doc.valor('_doc','tema'), getComputedStyle(document.querySelector('.diapo[data-mundo]')).backgroundImage.slice(0, 40)]"))
# Nueva diapositiva con diseño "Título y contenido"
p.click('[aria-label="Nueva diapositiva"]'); p.wait_for_timeout(250)
p.click('.lz-disenos [data-d="contenido"]'); p.wait_for_timeout(400)
print("bloques del diseño:", ev("() => NOM.editorActual.doc.deLaPagina(NOM.editorActual.pagina).map(b => b.tipo + ':' + (b.ph || ''))"))
# Escribir en el título con una palabra en negrita
ev("""() => { const b = NOM.editorActual.doc.deLaPagina(NOM.editorActual.pagina).find(x => x.estilo === 'h2'); NOM.modos.PRESENTACION._lienzo.abrirBloque(b.id); }""")
p.wait_for_timeout(300)
p.keyboard.type("Hola mundo cruel")
ev("""() => { const el = document.querySelector('.libre-texto[contenteditable="true"]'); const t = el.firstChild; const r = document.createRange(); r.setStart(t, 5); r.setEnd(t, 10); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
p.wait_for_timeout(150)
print("barra de texto visible:", ev("() => !document.querySelector('.lz-barra-texto').hidden"))
p.click('.lz-barra-texto [data-a="bold"]'); p.wait_for_timeout(150)
p.mouse.click(5, 300); p.wait_for_timeout(400)
print("html del título:", ev("() => NOM.editorActual.doc.deLaPagina(NOM.editorActual.pagina).find(x => x.estilo === 'h2').html"))
# Tabla, gráfica, ícono y ecuación desde Insertar
p.click('.modo-PRESENTACION [aria-label="Insertar"]'); p.wait_for_timeout(200); p.click(".menu >> text=Tabla…"); p.wait_for_timeout(300)
p.fill('.editor-datos input[data-r="A1"]', "Fruta"); p.fill('.editor-datos input[data-r="B1"]', "Precio"); p.fill('.editor-datos input[data-r="A2"]', "Mango"); p.fill('.editor-datos input[data-r="B2"]', "25")
p.click(".hoja-pie [data-si]"); p.wait_for_timeout(400)
print("tabla:", ev("() => { const t = NOM.editorActual.doc.deLaPagina(NOM.editorActual.pagina).find(x => x.tipo === 'tabla'); return t ? [t.enDiapo, t['c:A2'], document.querySelectorAll('.diapo-tabla td').length] : null; }"))
p.click('.modo-PRESENTACION [aria-label="Insertar"]'); p.wait_for_timeout(200); p.click(".menu >> text=Gráfica…"); p.wait_for_timeout(300); p.click(".hoja-pie [data-si]"); p.wait_for_timeout(400)
print("gráfica:", ev("() => [!!document.querySelector('.libre-grafica svg rect[rx]'), document.querySelectorAll('.libre-grafica svg rect').length]"))
p.click('.modo-PRESENTACION [aria-label="Insertar"]'); p.wait_for_timeout(200); p.click(".menu >> text=Íconos y elementos…"); p.wait_for_timeout(300)
p.fill("[data-q]", "cohete"); p.wait_for_timeout(200); p.click(".lz-iconos button"); p.wait_for_timeout(400)
print("ícono:", ev("() => !!document.querySelector('.libre-icono path, .libre-icono circle')"))
# Imagen con recorte, máscara y filtro (por código, con una imagen generada)
ev("""() => {
  const cv = document.createElement('canvas'); cv.width = 300; cv.height = 200; const g = cv.getContext('2d'); g.fillStyle = '#F08C2A'; g.fillRect(0,0,300,200); g.fillStyle = '#3D72F2'; g.fillRect(0,0,150,200);
  const ed = NOM.editorActual; ed.doc.cambiar('imgp', { tipo: 'imagen', pagina: ed.pagina, orden: 9, src: cv.toDataURL('image/png'), x: 600, y: 300, w: 200, h: 140, z: 20, recorte: { iz: .1, d: 0, s: 0, i: .1 }, mascara: 'elipse', filtros: { gris: 100 } });
  NOM.modos.PRESENTACION._lienzo.render(); }""")
p.wait_for_timeout(300)
print("imagen:", ev("() => { const el = document.querySelector('[data-id=\"imgp\"] .libre-imagen-marco'); const img = el && el.querySelector('img'); return el ? [getComputedStyle(el).clipPath.slice(0, 12), img.style.filter, img.style.width] : null; }"))
n.foto(OUT + "/pres1.png")
# Animaciones: entrada del título y salida de la tabla
ev("""() => { const ed = NOM.editorActual, bs = ed.doc.deLaPagina(ed.pagina); const t = bs.find(x => x.estilo === 'h2'), tb = bs.find(x => x.tipo === 'tabla');
  ed.doc.cambiar('_doc', { ['anim:' + ed.pagina]: [{ id: t.id, tipo: 'e', efecto: 'deslizar-izq', inicio: 'clic' }, { id: tb.id, tipo: 'n', efecto: 'pulso', inicio: 'despues' }, { id: tb.id, tipo: 'x', efecto: 'desvanecer', inicio: 'clic' }] }); }""")
p.wait_for_timeout(200)
print("pasos:", ev("() => { const ed = NOM.editorActual; return NOM.lienzoVista.estadoAnimaciones(ed.doc, ed.pagina, 0).pasos; }"))
# Presentar: paso 0 (título oculto), clic → aparece, clic → tabla se va
p.keyboard.press("F5"); p.wait_for_timeout(600)
st0 = ev("() => [...document.querySelectorAll('.reproductor .diapo .bl')].length")
p.keyboard.press("ArrowRight"); p.wait_for_timeout(300)
st1 = ev("() => [...document.querySelectorAll('.reproductor .diapo .bl')].map(x => x.style.animationName).filter(Boolean)")
p.keyboard.press("ArrowRight"); p.wait_for_timeout(300)
st2 = ev("() => [...document.querySelectorAll('.reproductor .diapo .bl')].map(x => x.style.animationName).filter(Boolean)")
print("presentar:", st0, st1, st2)
p.keyboard.press("l"); p.wait_for_timeout(100)
box = p.locator(".reproductor .diapo").bounding_box()
p.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); p.wait_for_timeout(200)
print("láser:", ev("() => document.querySelectorAll('.reproductor .pres-marcas circle').length"))
p.keyboard.press("Escape"); p.keyboard.press("Escape"); p.wait_for_timeout(300)
# Tamaño 4:3 y PNG de la diapositiva
ev("""() => { document.querySelector('[aria-label="Diseño"]').click(); }"""); p.wait_for_timeout(250)
p.select_option("[data-tam]", "4:3"); p.wait_for_timeout(400)
print("tamaño:", ev("() => [NOM.editorActual.doc.valor('_doc','tamDiapo'), document.querySelector('.diapo[data-mundo]').style.height]"))
png = ev("async () => { const ed = NOM.editorActual; const u = await NOM.diapo.diapoPng(ed.doc, ed.pagina, 1); return u.length; }")
print("png bytes (base64):", png)
print("errores:", n.errores[:6])
n.cerrar()
