import os, sys, tempfile; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sys, json, time, random
from nomprueba import *
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), "nom-pruebas"); os.makedirs(OUT, exist_ok=True)
esperar_servidor()
c = cuenta(); e = espacio(c["token"])
# Encuesta tipo Google Forms
random.seed(4)
filas = [["Marca temporal", "¿Cuántas horas duermes?", "¿Cómo llegas a la escuela?", "¿Qué deportes practicas?", "Comentarios"]]
trans = ["Camión", "Caminando", "Auto", "Metro"]
dep = ["Fútbol", "Natación", "Básquetbol", "Ninguno"]
for i in range(14):
    filas.append([f"2026/11/0{1 + i % 8} 10:0{i % 10}", str(random.choice([5, 6, 6, 7, 7, 7, 8, 9])), random.choice(trans), ", ".join(random.sample(dep[:3], random.choice([1, 2]))), random.choice(["Me gusta la escuela", "Más deportes", "", "Que haya talleres"])])
ref = lambda c_, f: (chr(65 + c_) + str(f + 1))
t = {"tipo": "tabla", "pagina": "p1", "orden": 1, "filas": 30, "cols": 8, "x": 40, "y": 40, "w": 880, "h": 300}
for f, fila in enumerate(filas):
    for c_, v in enumerate(fila):
        if v != "": t["c:" + ref(c_, f)] = v
hoja = documento(c["token"], e, "HOJA", "Encuesta del grupo", [{"id": "e1", "bloque": "hoja-p1", "campos": t, "t": 2, "n": "prueba"}])
alumnos = {"tipo": "tabla", "pagina": "p1", "orden": 1, "filas": 30, "cols": 8, "x": 40, "y": 40, "w": 880, "h": 300, "c:A1": "Nombre", "c:B1": "Calificación", "c:A2": "Ana López", "c:B2": "9.5", "c:A3": "Beto Ruiz", "c:B3": "8", "c:A4": "Carla Díaz", "c:B4": "10"}
hoja2 = documento(c["token"], e, "HOJA", "Alumnos", [{"id": "a1", "bloque": "hoja-p1", "campos": alumnos, "t": 2, "n": "prueba"}])
n = Navegador(); n.entrar(c); p = n.p; ev = p.evaluate
# 1. Reporte de datos desde la hoja
n.abrir(hoja); p.wait_for_timeout(800)
print("análisis:", ev("() => NOM.datos.analizar(NOM.datos.tablaDe(NOM.editorActual.doc, NOM.editorActual.pagina)).cols.map(c => [c.nombre.slice(0, 20), c.tipo, c.multiple || false, (c.frecuencias || []).slice(0, 2)])"))
ev("() => NOM.datos.reporteDeDatos(NOM.editorActual)")
p.wait_for_function("() => location.hash.startsWith('#/doc/') && NOM.editorActual && NOM.editorActual.doc.valor('_doc','modo') === 'TEXTO'", timeout=30000); p.wait_for_timeout(1500)
ps = ev("() => NOM.textoRico.parrafosDe(NOM.editorActual.doc).map(p => [p.pa.estilo || p.pa.lista || '', p.tramos.map(t => t.x != null ? t.x : '[' + t.e.tipo + ']').join('').slice(0, 70)])")
print("reporte:", len(ps), "párrafos"); [print("  ", x) for x in ps[:16]]
print("tablas e imágenes:", ev("() => [document.querySelectorAll('.wd-cuerpo table').length, document.querySelectorAll('.wd-cuerpo img').length]"))
n.foto(OUT + "/reporte_datos.png")
# 2. Combinar correspondencia
cc = documento(c["token"], e, "TEXTO", "Constancia", [])
n.abrir(cc); p.wait_for_timeout(600)
p.click(".wd-cuerpo"); p.keyboard.type("Constancia\nSe otorga a {{Nombre}} por obtener {{Calificación}} de promedio."); p.wait_for_timeout(1200)
print("campos:", ev("() => NOM.datos.camposDelTexto(NOM.editorActual.doc)"))
ev("() => NOM.datos.combinarCorrespondencia(NOM.editorActual)"); p.wait_for_timeout(1500)
p.select_option("#cc-h", hoja2); p.wait_for_timeout(1500)
print("info:", ev("() => document.querySelector('[data-info]').textContent"), "| previa:", ev("() => document.querySelector('[data-previa] .cc-hoja').textContent"))
print("botón:", ev("() => document.querySelector('.hoja-pie [data-si]').textContent"))
p.click(".hoja-pie [data-si]"); p.wait_for_timeout(5000)
lista = api("GET", f"/api/espacios/{e}", None, c["token"])[1]["lista"]
print("documentos combinados:", sorted(x["nombre"] for x in lista if x["nombre"].startswith("Constancia –")))
uno = next(x["id"] for x in lista if x["nombre"] == "Constancia – Beto Ruiz")
n.abrir(uno); p.wait_for_timeout(900)
print("texto combinado:", ev("() => NOM.textoRico.parrafosDe(NOM.editorActual.doc).map(p => p.tramos.map(t => t.x || '').join(''))"))
# 3. Documento → presentación y mapa mental
dt = documento(c["token"], e, "TEXTO", "El agua", [])
n.abrir(dt); p.wait_for_timeout(600)
p.click(".wd-cuerpo")
ev("""() => { const t = NOM.editorActual.modoApi.textoApi; t.insertarParrafos([
  { tramos: [{ x: 'El agua' }], a: { estilo: 'titulo' } },
  { tramos: [{ x: 'Propiedades' }], a: { estilo: 'h1' } },
  { tramos: [{ x: 'El agua es incolora. Hierve a 100 grados al nivel del mar.' }], a: {} },
  { tramos: [{ x: 'Es un buen disolvente' }], a: { lista: 'vinetas' } },
  { tramos: [{ x: 'Ciclo del agua' }], a: { estilo: 'h1' } },
  { tramos: [{ x: 'El agua se evapora, se condensa en nubes y cae como lluvia.' }], a: {} },
  { tramos: [{ x: 'Cuidado del agua' }], a: { estilo: 'h1' } },
  { tramos: [{ x: 'Cerrar la llave al lavarse los dientes ahorra mucha agua.' }], a: {} }], { alFinal: true }); }""")
p.wait_for_timeout(1200)
ev("() => NOM.datos.aPresentacion(NOM.editorActual)")
p.wait_for_function("() => NOM.editorActual && NOM.editorActual.doc.valor('_doc','modo') === 'PRESENTACION'", timeout=30000); p.wait_for_timeout(1200)
print("presentación:", ev("() => { const d = NOM.editorActual.doc; return [d.paginas().length, d.paginas().map(p => d.deLaPagina(p).map(b => NOM.diapo.textoPlano(b.html)).join(' | ').slice(0, 90)), Object.keys(d.doc()).filter(k => k.startsWith('nota:')).length]; }"))
n.foto(OUT + "/doc_pres.png")
n.abrir(dt); p.wait_for_timeout(800)
ev("() => NOM.datos.aMapaMental(NOM.editorActual)")
p.wait_for_function("() => NOM.editorActual && NOM.editorActual.doc.valor('_doc','modo') === 'DIAGRAMA'", timeout=30000); p.wait_for_timeout(1200)
print("mapa mental:", ev("() => { const bs = NOM.editorActual.doc.vivos(); return [bs.filter(b => b.tipo === 'forma').map(b => b.texto).slice(0, 8), bs.filter(b => b.tipo === 'conector').length]; }"))
n.foto(OUT + "/doc_mapa.png")
# 4. Flujo desde texto
ev("() => { const g = NOM.diagramas.generar(NOM.diagramas.CATALOGO.find(x => x.id === 'flujo')); NOM.modos.DIAGRAMA._lienzo.insertarBloques(g.bloques, g.uniones, { x: 1400, y: 300 }); }"); p.wait_for_timeout(500)
print("flujo:", ev("() => { const g = NOM.diagramas.flujo('Inicio\\nLeer la edad\\n¿La edad es 18 o más?\\n  Sí: Puede votar\\n  No: Todavía no puede votar\\nFin'); return [g.bloques.map(b => b.figura + ':' + b.texto), g.uniones.map(u => u[0] + '>' + u[1] + (u[2].etiqueta ? ' ' + u[2].etiqueta : ''))]; }"))
# 5. Datos públicos (Wikidata) desde el diálogo de nuevo documento
p.goto(B + "/#/espacio/" + e); p.wait_for_selector(".doc-tarjeta", timeout=20000); p.wait_for_timeout(600)
ev("() => NOM.datos.datosPublicos({ id: '%s' })" % e); p.wait_for_timeout(1500)
p.click('[data-c="estados-mexico"]'); p.wait_for_function("() => NOM.editorActual && NOM.editorActual.doc.valor('_doc','modo') === 'HOJA'", timeout=60000); p.wait_for_timeout(1500)
print("wikidata:", ev("() => { const b = NOM.editorActual.doc.vivos().find(x => x.tipo === 'tabla'); return [b['c:A1'], b['c:B1'], b['c:C1'], b['c:A2'], b['c:C2'], Object.keys(b).filter(k => k.startsWith('c:A')).length]; }"))
print("errores:", n.errores[:6])
n.cerrar()
