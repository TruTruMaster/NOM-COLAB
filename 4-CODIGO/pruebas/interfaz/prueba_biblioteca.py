import os, sys, tempfile; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sys, json, time
from nomprueba import *
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), "nom-pruebas"); os.makedirs(OUT, exist_ok=True)
esperar_servidor()
c = cuenta(); e = espacio(c["token"]); d = documento(c["token"], e, "TEXTO", "Volcanes")
n = Navegador(movil=True); n.entrar(c); n.abrir(d); p = n.p; ev = p.evaluate
ev("() => document.querySelectorAll('.bienvenida-momento, .pista').forEach(x => x.remove())")
ev("() => NOM.citas.abrir(NOM.editorActual)"); p.wait_for_timeout(500)
print("ancho:", ev("() => [document.documentElement.scrollWidth, innerWidth, Math.round(document.querySelector('.investigar-cajon').getBoundingClientRect().width)]"))
p.fill('[data-buscar] input[name=q]', "Popocatépetl"); p.keyboard.press("Enter"); p.wait_for_timeout(4000)
p.click('.inv-res [data-leer="0"]'); p.wait_for_timeout(4000)
n.foto(OUT + "/m_investigar.png")
p.click(".inv-lectura [data-guardar]"); p.wait_for_timeout(1500)
bib = api("GET", f"/api/espacios/{e}/biblioteca", None, c["token"])[1]
print("biblioteca:", [(x["fuente"].get("titulo"), x.get("largo")) for x in bib])
# Buscar en la biblioteca (lo que funciona sin Internet)
p.click(".inv-lectura [data-volver]"); p.wait_for_timeout(300)
p.click('[data-donde="biblioteca"]'); p.fill('[data-buscar] input[name=q]', "volcán"); p.keyboard.press("Enter"); p.wait_for_timeout(1500)
print("en la biblioteca:", ev("() => [...document.querySelectorAll('.inv-res b')].map(b => b.textContent)"), ev("() => !!document.querySelector('.inv-res p')"))
p.click('.inv-res [data-leer="0"]'); p.wait_for_timeout(1500)
print("leído de la biblioteca:", ev("() => [document.querySelector('.inv-lectura h4').textContent, document.querySelectorAll('.inv-texto p').length, !document.querySelector('.inv-lectura [data-guardar]')]"))
# Reporte desde un CSV
r = ev("""async (esp) => {
  const csv = 'Nombre,Grupo,Calificación\\nAna,A,9\\nBeto,B,7\\nCarla,A,10\\nDavid,B,8\\nEva,A,6\\n';
  await NOM.datos.reporteDeDatos({ espacio: { id: esp }, local: false }, { archivo: new File([csv], 'calificaciones.csv', { type: 'text/csv' }) });
  return location.hash; }""", e)
p.wait_for_timeout(2500)
print("reporte CSV:", r[:6], ev("() => NOM.textoRico.parrafosDe(NOM.editorActual.doc).slice(0, 8).map(p => p.tramos.map(t => t.x != null ? t.x : '[' + t.e.tipo + ']').join('').slice(0, 70))"))
print("errores:", n.errores[:6])
n.cerrar()
