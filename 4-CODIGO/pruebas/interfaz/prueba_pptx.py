import os, sys, tempfile; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sys, base64, subprocess, os
from nomprueba import *
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), "nom-pruebas"); os.makedirs(OUT, exist_ok=True)
esperar_servidor()
c = cuenta(); e = espacio(c["token"]); d = documento(c["token"], e, "PRESENTACION", "Expo")
n = Navegador(); n.entrar(c); n.abrir(d); p = n.p
ev = p.evaluate
# Contenido de dos diapositivas, armado por código (lo mismo que hace la interfaz).
ev("""() => {
  const ed = NOM.editorActual, doc = ed.doc, p1 = ed.pagina;
  const cv = document.createElement('canvas'); cv.width = 300; cv.height = 200; const g = cv.getContext('2d'); g.fillStyle = '#F08C2A'; g.fillRect(0,0,300,200); g.fillStyle = '#3D72F2'; g.fillRect(0,0,150,200);
  doc.cambiar('_doc', { tema: 'oceano', ['fondo:' + p1]: { tipo: 'degradado', c1: '#FFFFFF', c2: '#3D72F2', angulo: 135 }, ['nota:' + p1]: 'Saludar y presentar el tema', ['trans:' + p1]: 'desvanecer' });
  doc.cambiar('t1', { tipo: 'texto', pagina: p1, orden: 1, estilo: 'h1', html: 'Hola <b>mundo</b> cruel', x: 60, y: 40, w: 840, h: 90, z: 1 });
  doc.cambiar('t2', { tipo: 'texto', pagina: p1, orden: 2, estilo: 'p', html: '<ul><li>Primero</li><li>Segundo <i>punto</i></li></ul>', x: 60, y: 150, w: 400, h: 140, z: 2 });
  doc.cambiar('f1', { tipo: 'forma', pagina: p1, orden: 3, figura: 'elipse', color: '#7FD8A6', texto: 'Idea', x: 520, y: 150, w: 180, h: 110, z: 3 });
  doc.cambiar('f2', { tipo: 'forma', pagina: p1, orden: 4, figura: 'rombo', color: '#FFD84D', texto: '¿Sí?', x: 740, y: 150, w: 160, h: 110, z: 4 });
  doc.cambiar('c1', { tipo: 'conector', pagina: p1, orden: 5, desde: 'f1', hasta: 'f2', puntas: 'fin', etiqueta: 'luego', color: '#1E3A8A' });
  doc.cambiar('im', { tipo: 'imagen', pagina: p1, orden: 6, src: cv.toDataURL('image/png'), x: 60, y: 320, w: 220, h: 150, z: 6, recorte: { iz: .1, d: 0, s: 0, i: .1 }, mascara: 'elipse', filtros: { gris: 100 }, alt: 'Cuadros de color' });
  doc.cambiar('tb', { tipo: 'tabla', pagina: p1, orden: 7, enDiapo: true, encabezado: true, filas: 3, cols: 2, 'c:A1': 'Fruta', 'c:B1': 'Precio', 'c:A2': 'Mango', 'c:B2': '25', 'c:A3': 'Piña', 'c:B3': '30', x: 320, y: 320, w: 280, h: 150, z: 7 });
  doc.cambiar('eq', { tipo: 'ecuacion', pagina: p1, orden: 8, tex: 'x = \\\\frac{-b \\\\pm \\\\sqrt{b^2-4ac}}{2a}', x: 620, y: 320, w: 300, h: 90, z: 8 });
  const p2 = 'p2';
  doc.cambiar('_doc', { paginas: [p1, p2], ['nota:' + p2]: 'Mostrar la gráfica', ['fondo:' + p2]: { tipo: 'color', color: '#FFF1B8' } });
  doc.cambiar('g1', { tipo: 'grafica', pagina: p2, orden: 1, clase: 'barras', titulo: 'Ventas', filas: 4, cols: 3, 'c:A1': 'Mes', 'c:B1': 'Uno', 'c:C1': 'Dos', 'c:A2': 'Ene', 'c:B2': '10', 'c:C2': '7', 'c:A3': 'Feb', 'c:B3': '14', 'c:C3': '9', 'c:A4': 'Mar', 'c:B4': '8', 'c:C4': '12', x: 80, y: 60, w: 520, h: 320, z: 1 });
  doc.cambiar('t3', { tipo: 'texto', pagina: p2, orden: 2, estilo: 'h2', html: '<div style="text-align:center"><span style="color:#C2185B">Resultados</span></div>', x: 620, y: 60, w: 300, h: 80, z: 2 });
  NOM.modos.PRESENTACION._lienzo.render();
}""")
p.wait_for_timeout(500)
# Ícono (con su imagen) desde Insertar
p.click('.modo-PRESENTACION [aria-label="Insertar"]'); p.wait_for_timeout(200); p.click(".menu >> text=Íconos y elementos…"); p.wait_for_timeout(300)
p.fill("[data-q]", "cohete"); p.wait_for_timeout(200); p.click(".lz-iconos button"); p.wait_for_timeout(500)
b64 = ev("""() => { const u = NOM.ooxml.pptx(NOM.editorActual.doc); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }""")
ruta = os.path.join(OUT, "expo.pptx")
open(ruta, "wb").write(base64.b64decode(b64))
print("pptx bytes:", os.path.getsize(ruta))
# XML bien formado
import zipfile, xml.dom.minidom
z = zipfile.ZipFile(ruta)
malos = []
for nm in z.namelist():
    if nm.endswith(".xml") or nm.endswith(".rels"):
        try: xml.dom.minidom.parseString(z.read(nm))
        except Exception as ex: malos.append((nm, str(ex)))
print("partes:", len(z.namelist()), "xml malos:", malos)
from pptx import Presentation
pr = Presentation(ruta)
print("python-pptx diapositivas:", len(pr.slides), "tamaño:", pr.slide_width, pr.slide_height)
for i, s in enumerate(pr.slides):
    tipos = [sh.shape_type for sh in s.shapes]
    print(" diapo", i + 1, [str(t).split(".")[-1].split(" ")[0] for t in tipos], "nota:", s.has_notes_slide and s.notes_slide.notes_text_frame.text)
    for sh in s.shapes:
        if sh.has_text_frame and sh.text_frame.text.strip(): print("   texto:", repr(sh.text_frame.text[:60]))
        if getattr(sh, "has_chart", False) and sh.has_chart: print("   gráfica:", sh.chart.chart_type, [list(se.values) for se in sh.chart.plots[0].series])
        if getattr(sh, "has_table", False) and sh.has_table: print("   tabla:", [[c.text for c in r.cells] for r in sh.table.rows])
r = subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", OUT, ruta], capture_output=True, text=True, timeout=120)
print("libreoffice:", r.returncode, os.path.exists(os.path.join(OUT, "expo.pdf")))
subprocess.run(["pdftoppm", "-png", "-r", "50", os.path.join(OUT, "expo.pdf"), os.path.join(OUT, "expo")], timeout=60)
# Importar el mismo archivo de vuelta
r2 = ev("""async (b64) => {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const f = new File([u], 'expo.pptx');
  const r = await NOM.ooxml.leerPptx(f);
  const imp = await NOM.formatos.importar(f);
  return { paginas: r.paginas, doc: Object.keys(r.doc), tamDiapo: r.doc.tamDiapo, notas: [r.doc['nota:p1'], r.doc['nota:p2']], fondos: [r.doc['fondo:p1'], r.doc['fondo:p2']], trans: r.doc['trans:p1'], aviso: r.aviso,
    bloques: r.bloques.map(b => [b.pagina, b.tipo, b.figura || b.estilo || b.clase || '', (b.html || b.texto || b.titulo || '').slice(0, 50), b.x, b.y, b.w, b.h, b.recorte ? 'recorte' : '', b.mascara || '', b['c:A2'] || '', b['c:B2'] || '']),
    ops: imp.ops.length, modo: imp.modo };
}""", b64)
print("importado:", json.dumps(r2, ensure_ascii=False, indent=0)[:3000])
# Abrir la presentación importada (como documento nuevo del espacio)
r3 = ev("""async (b64) => {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const imp = await NOM.formatos.importar(new File([u], 'expo.pptx'));
  const tok = localStorage.getItem('nom.token');
  const esp = location.hash.match(/doc\\/([^/]+)/) ? null : null;
  return imp;
}""", b64)
st, nuevo = api("POST", f"/api/espacios/{e}/documentos", {"nombre": "Importada", "modo": "PRESENTACION", "ops": r3["ops"]}, c["token"])
print("crear importada:", st)
n.abrir(nuevo["id"]); p.wait_for_timeout(800)
n.foto(OUT + "/importada.png")
print("diapos importadas:", ev("() => [NOM.editorActual.doc.paginas().length, NOM.editorActual.doc.valor('_doc','tamDiapo'), document.querySelectorAll('.diapo[data-mundo] .bl').length]"))
print("errores:", n.errores[:6])
n.cerrar()
