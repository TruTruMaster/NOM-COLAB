import os, sys, tempfile; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sys, base64, os, io
from nomprueba import *
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), "nom-pruebas"); os.makedirs(OUT, exist_ok=True)
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor
from PIL import Image
# Presentación "de afuera": marcadores del diseño, viñetas, figuras, grupo, imagen, tabla y gráfica.
pr = Presentation()
pr.slide_width, pr.slide_height = Inches(10), Inches(7.5)  # 4:3
s1 = pr.slides.add_slide(pr.slide_layouts[0])
s1.shapes.title.text = "Informe de ciencias"
s1.placeholders[1].text = "Equipo 3 — Biología"
s1.notes_slide.notes_text_frame.text = "Presentarse"
s2 = pr.slides.add_slide(pr.slide_layouts[1])
s2.shapes.title.text = "Puntos clave"
tf = s2.placeholders[1].text_frame
tf.text = "La célula"
for t in ["El núcleo", "La membrana"]:
    para = tf.add_paragraph(); para.text = t; para.level = 1
r = tf.paragraphs[0].runs[0]; r.font.bold = True; r.font.color.rgb = RGBColor(0xC2, 0x18, 0x5B)
fig = s2.shapes.add_shape(MSO_SHAPE.OVAL, Inches(6.5), Inches(4.5), Inches(2), Inches(1.5))
fig.fill.solid(); fig.fill.fore_color.rgb = RGBColor(0x7F, 0xD8, 0xA6); fig.text = "Ojo"
grupo = s2.shapes.add_group_shape()
a = grupo.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.5), Inches(5.5), Inches(1), Inches(1)); a.fill.solid(); a.fill.fore_color.rgb = RGBColor(0xFF, 0xD8, 0x4D)
b = grupo.shapes.add_shape(MSO_SHAPE.DIAMOND, Inches(2), Inches(5.5), Inches(1), Inches(1)); b.fill.solid(); b.fill.fore_color.rgb = RGBColor(0x3D, 0x72, 0xF2)
s3 = pr.slides.add_slide(pr.slide_layouts[6])
im = Image.new("RGB", (2400, 1600), (240, 140, 42)); buf = io.BytesIO(); im.save(buf, "PNG"); buf.seek(0)
s3.shapes.add_picture(buf, Inches(0.5), Inches(0.5), Inches(4), Inches(2.66))
tb = s3.shapes.add_table(3, 2, Inches(5), Inches(0.5), Inches(4), Inches(1.5)).table
for i, fila in enumerate([["Mes", "Lluvia"], ["Ene", "12"], ["Feb", "30"]]):
    for j, v in enumerate(fila): tb.cell(i, j).text = v
cd = CategoryChartData(); cd.categories = ["Ene", "Feb", "Mar"]; cd.add_series("Lluvia", (12, 30, 22)); cd.add_series("Sol", (20, 10, 15))
s3.shapes.add_chart(XL_CHART_TYPE.LINE, Inches(0.5), Inches(3.5), Inches(6), Inches(3.5), cd)
s3.background.fill.solid(); s3.background.fill.fore_color.rgb = RGBColor(0xFF, 0xF1, 0xB8)
ruta = os.path.join(OUT, "afuera.pptx"); pr.save(ruta)
print("archivo:", os.path.getsize(ruta))
esperar_servidor()
c = cuenta(); e = espacio(c["token"]); d = documento(c["token"], e, "PRESENTACION", "Vacía")
n = Navegador(); n.entrar(c); n.abrir(d); p = n.p
ev = p.evaluate
b64 = base64.b64encode(open(ruta, "rb").read()).decode()
r = ev("""async (b64) => {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const imp = await NOM.formatos.importar(new File([u], 'afuera.pptx'));
  const r = await NOM.ooxml.leerPptx(new File([u], 'afuera.pptx'));
  return { imp, resumen: { tam: r.doc.tamDiapo, notas: r.doc['nota:p1'], fondo3: r.doc['fondo:p3'], aviso: r.aviso,
    bloques: r.bloques.map(b => [b.pagina, b.tipo, b.estilo || b.figura || b.clase || '', (b.html || b.texto || b.titulo || '').slice(0, 90), b.x, b.y, b.w, b.h, (b.src || '').length]) } };
}""", b64)
for k, v in r["resumen"].items():
    if k != "bloques": print(k, ":", v)
for b in r["resumen"]["bloques"]: print("  ", b)
st, nuevo = api("POST", f"/api/espacios/{e}/documentos", {"nombre": "De afuera", "modo": "PRESENTACION", "ops": r["imp"]["ops"]}, c["token"])
print("crear:", st)
n.abrir(nuevo["id"]); p.wait_for_timeout(800)
n.foto(OUT + "/afuera1.png")
ev("() => { const ed = NOM.editorActual; ed.irA ? ed.irA(ed.doc.paginas()[1]) : null; }")
p.click("button.mini >> nth=1") if p.locator("button.mini").count() > 1 else None
p.wait_for_timeout(500); n.foto(OUT + "/afuera2.png")
p.click("button.mini >> nth=2") if p.locator("button.mini").count() > 2 else None
p.wait_for_timeout(500); n.foto(OUT + "/afuera3.png")
print("errores:", n.errores[:6])
n.cerrar()
