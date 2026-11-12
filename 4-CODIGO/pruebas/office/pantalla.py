#!/usr/bin/env python3
"""Revisa lo que SE VE en el editor al abrir archivos de Office, no solo lo que se descarga.

`fidelidad.py` dice que un archivo sin tocar sale igual (se devuelve el original guardado). Eso no
dice nada de la pantalla: un documento puede descargarse perfecto y verse con otra hoja, otra
fuente y sin encabezado. Esta prueba abre los archivos en el editor de verdad (Chromium) y mide
el resultado en la página: tamaño de la hoja, márgenes, fuente y tamaño con que se pinta cada
párrafo, sangrías, bordes, fondo, encabezado, cuadros de texto, tablas, SmartArt.

También teclea con el teclado de verdad dentro de un párrafo importado (lo que las otras pruebas no
hacen: editan con operaciones) y revisa que el cursor no salte y que al descargar en Word ese
párrafo conserve su formato original.

  ~/.cache/nom-pruebas/venv/bin/python pruebas/office/pantalla.py            # computadora
  ... pantalla.py --movil                                                    # ancho de celular
  ... pantalla.py --capturas ~/capturas                                      # además deja imágenes

Necesita el servidor local (puerto 8099) y el corpus (`corpus.sh`; el archivo raro lo arma
`raros.py`, y si falta se arma aquí).
"""
import argparse, base64, io, json, sys, zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); sys.path.insert(0, str(Path(__file__).parent.parent / "interfaz"))
import fidelidad as F, nomprueba as N, prueba_ui as U, raros

CM = 37.7953
res = []


def anota(nombre, ok, det=""):
    res.append((nombre, bool(ok)))
    print(("  ok   " if ok else "  MAL  ") + nombre + (f"  -> {det}" if det != "" and not ok else ""), flush=True)


def cerca(a, b, tol):
    try: return abs(float(a) - float(b)) <= tol
    except (TypeError, ValueError): return False


# Lo que se ve de un párrafo (el que contiene la marca): estilos ya calculados por el navegador.
JS_PARRAFO = r"""
(marca) => {
  const el = [...document.querySelectorAll('.wd-cuerpo > *')].find((x) => x.textContent.includes(marca));
  if (!el) return null;
  const cs = getComputedStyle(el), px = (v) => parseFloat(v) || 0;
  const tn = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode(), letra = tn ? getComputedStyle(tn.parentElement) : cs;
  const r = el.getBoundingClientRect(), hoja = document.querySelector('[data-hoja]').getBoundingClientRect();
  return { fuente: letra.fontFamily, tam: px(letra.fontSize) * 0.75, linea: px(cs.lineHeight), alin: cs.textAlign, dir: cs.direction,
    sangIzq: px(cs.paddingLeft) + px(cs.marginLeft), sangDer: px(cs.paddingRight) + px(cs.marginRight), primera: px(cs.textIndent),
    bordeIzq: px(cs.borderLeftWidth), bordeColor: cs.borderLeftColor, fondo: cs.backgroundColor, ancho: r.width, anchoHoja: hoja.width,
    arriba: r.top - hoja.top, sec: el.dataset.sec || null, ox: el.dataset.ox || null,
    versalitas: [...el.querySelectorAll('span')].some((s) => getComputedStyle(s).fontVariantCaps === 'small-caps'),
    fuentes: [...new Set([...el.querySelectorAll('span')].map((s) => s.style.fontFamily).filter(Boolean))] };
}
"""
JS_HOJA = r"""
() => {
  const h = document.querySelector('[data-hoja]'), p = document.querySelector('.wd-pagina'), cs = getComputedStyle(h), v = (k) => parseFloat(cs.getPropertyValue(k)) || 0;
  const bp = document.querySelector('.wd-borde-pagina'), enc = document.querySelector('.wd-enc'), pie = document.querySelector('.wd-pie');
  return { w: v('--pw'), h: v('--ph'), ms: v('--ms'), mi: v('--mi'), miz: v('--miz'), md: v('--md'), paginas: document.querySelectorAll('.wd-pagina').length,
    borde: bp ? getComputedStyle(bp).borderTopStyle + ' ' + getComputedStyle(bp).borderTopColor : null,
    enc: enc ? enc.innerText.trim() : '', pie: pie ? pie.innerText.trim() : '', encCortado: enc ? [...enc.children].some((s) => s.scrollWidth > s.clientWidth + 1) : false,
    paginaVisible: !!p };
}
"""


def importar(p, esp, archivo):
    d = Path(archivo).read_bytes()
    r = p.evaluate(U.JS_IMPORTAR, [base64.b64encode(d).decode(), Path(archivo).name, esp])
    p.wait_for_function(U.JS_LISTO, timeout=90000); p.wait_for_timeout(1800)
    return r


def raro(p, esp, movil, capturas):
    f = F.CORPUS / "docx" / "raro-combinaciones.docx"
    if not f.exists(): f.parent.mkdir(parents=True, exist_ok=True); raros.hacer_docx(f)
    print("== Word con combinaciones raras (" + ("celular" if movil else "computadora") + ")")
    r = importar(p, esp, f)
    anota("avisa lo que no se dibuja igual (columnas, cambio de hoja)", r["aviso"] and "columnas" in r["aviso"] and "hoja" in r["aviso"], r["aviso"])
    p.evaluate("() => document.fonts.ready"); p.wait_for_timeout(600)
    if capturas:
        if not movil:
            alto = p.evaluate("() => Math.ceil(document.querySelector('[data-hoja]').getBoundingClientRect().height) + 260")
            p.set_viewport_size({"width": 1100, "height": min(alto, 9000)}); p.wait_for_timeout(1200)
        p.screenshot(path=str(Path(capturas) / ("raro-movil.png" if movil else "raro.png")))
    P = lambda marca: p.evaluate(JS_PARRAFO, marca) or {}
    if not movil:
        h = p.evaluate(JS_HOJA)
        anota("hoja: la de la primera sección, B5 de 17.6 × 25 cm en vertical", cerca(h["w"], 17.6 * CM, 3) and cerca(h["h"], 25 * CM, 3), h)
        anota("márgenes: arriba 1.27, abajo 2.2, izquierda 3.5 y derecha 1.0 cm", cerca(h["ms"], 1.27 * CM, 2) and cerca(h["mi"], 2.2 * CM, 2) and cerca(h["miz"], 3.5 * CM, 2) and cerca(h["md"], 1.0 * CM, 2), h)
        anota("borde de página doble y rojo", h["borde"] == "double rgb(192, 0, 0)", h["borde"])
        anota("encabezado y pie del archivo, completos", "ENCABEZADO-RARO Instituto" in h["enc"] and "PIE-RARO" in h["pie"] and not h["encCortado"], h)
        anota("sin número de página inventado (el archivo no trae)", not any(c.isdigit() for c in h["pie"] + h["enc"]), h["pie"])
    n = P("NORMAL-HEREDADO")
    anota("fuente del estilo Normal (Garamond 13, con sustituta de remates)", "Garamond" in n.get("fuente", "") and "serif" in n.get("fuente", "") and "sans-serif" not in n.get("fuente", "") and cerca(n.get("tam"), 13, 0.3), n)
    anota("interlineado 1.5 del estilo Normal", cerca(n.get("linea"), 13 / 0.75 * 1.5, 1.2), n.get("linea"))
    t = P("TITULO-UNO")
    anota("título con la letra de su estilo (Calibri 14)", "Calibri" in t.get("fuente", "") and cerca(t.get("tam"), 14, 0.3), t)
    s = P("SANGRIA-COMBO")
    k = 0.35 if movil else 1
    anota("sangrías: izquierda 2.5, derecha 1.5 y primera línea 1.25 cm", cerca(s.get("sangIzq"), 2.5 * CM * k, 2) and cerca(s.get("sangDer"), 1.5 * CM * k, 2) and cerca(s.get("primera"), 1.25 * CM * k, 2), s)
    anota("justificado e interlineado exacto de 18 pt", s.get("alin") == "justify" and cerca(s.get("linea"), 24, 0.6), (s.get("alin"), s.get("linea")))
    if movil: anota("en el celular las sangrías no dejan el texto en una tirita (ocupa más de 70 % del ancho)", s.get("ancho", 0) - s.get("sangIzq", 0) - s.get("sangDer", 0) > 0.7 * s.get("anchoHoja", 1) - 60, s)
    fr = P("FRANCESA-COMBO")
    anota("sangría francesa de 1.5 cm sobre 3 cm", cerca(fr.get("primera"), -1.5 * CM * k, 2) and cerca(fr.get("sangIzq"), 3 * CM * k, 2), fr)
    b = P("BORDE-Y-SOMBRA")
    anota("párrafo con recuadro azul y fondo amarillo", b.get("bordeIzq", 0) >= 2 and b.get("bordeColor") == "rgb(0, 112, 192)" and b.get("fondo") == "rgb(255, 242, 204)", b)
    anota("versalitas, y fuentes que nadie tiene con sustituta de su tipo", b.get("versalitas") and any("Bookman" in x and "serif" in x and "sans-serif" not in x for x in b.get("fuentes", [])) and any("Segoe Script" in x and "cursive" in x for x in b.get("fuentes", [])), b.get("fuentes"))
    anota("las fuentes equivalentes van con la aplicación (se cargan sin tenerlas instaladas)", p.evaluate("""async () => { await Promise.all(['Carlito', 'Caladea', 'Liberation Sans', 'Liberation Serif', 'Liberation Mono', 'Comic Neue'].map((f) => document.fonts.load('12px "' + f + '"', 'Añ'))); return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')); }"""), "")
    cargadas = set(p.evaluate("() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/\"/g, ''))"))
    anota("   …las seis familias", {"Carlito", "Caladea", "Liberation Sans", "Liberation Serif", "Liberation Mono", "Comic Neue"} <= cargadas, cargadas)
    txt = p.evaluate("() => document.querySelector('.wd-cuerpo').innerText")
    anota("el texto del cuadro de texto se lee", "TEXTO-DEL-CUADRO que debe poder leerse" in txt)
    tabla = p.evaluate("""() => { const o = {}; document.querySelectorAll('.wd-tab .wd-celda').forEach((c) => { const cs = getComputedStyle(c), t = c.innerText.trim().replace(/\\s+/g, ' '); if (t) o[t.split(' ')[0].slice(0, 22)] = { color: cs.color, cursiva: cs.fontStyle, alin: cs.textAlign, texto: t, ancho: Math.round(c.closest('td').getBoundingClientRect().width) }; }); return o; }""")
    roja = next((v for q, v in tabla.items() if "ROJA" in v["texto"].replace("-", "").replace(" ", "")), {})
    anota("tabla: celda roja en cursiva", roja.get("color") == "rgb(192, 0, 0)" and roja.get("cursiva") == "italic", roja)
    cen = tabla.get("CELDA-CENTRADA", {})
    anota("tabla: celda centrada y columnas de ancho distinto (2, 7 y 3.5 cm)", cen.get("alin") == "center" and cen.get("ancho", 0) > 2.2 * roja.get("ancho", 999), (cen, roja.get("ancho")))
    anota("tabla dentro de una celda: se lee renglón por renglón", any("ANIDADA-1 | ANIDADA-2" in v["texto"] for v in tabla.values()), list(tabla))
    d2, d3, rtl = P("DOS-COLUMNAS"), P("TRES-COLUMNAS-HORIZONTAL"), P("DERECHA-A-IZQUIERDA")
    anota("marca donde empieza la sección a 2 columnas", d2.get("sec") == "c|2 columnas", d2.get("sec"))
    anota("marca de la sección a 3 columnas en hoja horizontal", (d3.get("sec") or "").startswith("p|3 columnas · hoja horizontal"), d3.get("sec"))
    if not movil:
        paso = p.evaluate("() => { const a = document.querySelectorAll('.wd-pagina'); return a.length > 1 ? a[1].offsetTop - a[0].offsetTop : 0; }")
        h = p.evaluate(JS_HOJA)
        # (puede quedar arriba el renglón vacío con el que el archivo cierra la sección anterior)
        anota("esa sección empieza en hoja nueva, sin dejar una hoja en blanco", paso and h["ms"] - 2 <= d3["arriba"] % paso <= h["ms"] + 60 and h["paginas"] <= 3, (d3.get("arriba"), paso, h["paginas"]))
    anota("párrafo de derecha a izquierda", rtl.get("dir") == "rtl", rtl.get("dir"))

    # ---- teclear de verdad dentro de un párrafo importado
    if not movil:
        caja = p.evaluate("""(marca) => { const el = [...document.querySelectorAll('.wd-cuerpo > *')].find((x) => x.textContent.includes(marca)); el.scrollIntoView({ block: 'center' });
          const tn = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode(), r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, 3); const q = r.getBoundingClientRect(); return [q.right, q.top + q.height / 2]; }""", "BORDE-Y-SOMBRA")
        p.mouse.click(caja[0], caja[1]); p.wait_for_timeout(300)
        p.keyboard.type("XYZ", delay=40); p.wait_for_timeout(1200)
        escrito = p.evaluate("() => [...document.querySelectorAll('.wd-cuerpo > *')].map((x) => x.textContent.slice(0, 20)).find((t) => /DE-Y-SOMBRA/.test(t))")
        anota("al teclear, el cursor se queda donde estaba (BOR|XYZ|DE…)", (escrito or "").startswith("BORXYZDE-Y-SOMBRA"), escrito)
        pa = p.evaluate("""() => { const q = NOM.textoRico.parrafosDe(NOM.editorActual.doc).find((x) => x.tramos.some((t) => (t.x || '').includes('BORXYZ'))); return q ? q.pa : null; }""")
        anota("el párrafo tecleado sigue ligado a su párrafo del archivo original", pa and pa.get("ox") == 4 and pa.get("borde"), pa)
        p.wait_for_function(U.JS_LISTO, timeout=30000)
        x = p.evaluate(U.JS_EXPORTAR, "docx")
        xml = zipfile.ZipFile(io.BytesIO(base64.b64decode(x["salida"]))).read("word/document.xml").decode()
        i = xml.find("BORXYZ"); ini = max(xml.rfind("<w:p>", 0, i), xml.rfind("<w:p ", 0, i)); par = xml[ini:xml.find("</w:p>", i)]
        anota("al descargar en Word, ese párrafo conserva recuadro, fondo, versalitas y espaciado", i > 0 and "<w:pBdr>" in par and 'w:fill="FFF2CC"' in par and "<w:smallCaps/>" in par and 'w:spacing w:val="60"' in par, par[:400])
        anota("y lo demás del archivo no se movió (3 secciones, columnas y borde de página)", xml.count("<w:sectPr") == 3 and 'w:num="2"' in xml and "<w:pgBorders" in xml and "w:txbxContent" in xml)


def otros(p, esp, capturas):
    print("== SmartArt y cuadros de otros archivos del corpus")
    f = F.CORPUS / "docx" / "ms-smartart.docx"
    if f.exists():
        importar(p, esp, f)
        cajas = p.evaluate("() => [...document.querySelectorAll('.wd-obj-caja')].map((c) => c.innerText.trim().slice(0, 80))")
        anota("Word: el SmartArt muestra su texto, no solo una etiqueta", len(cajas) > 0 and all(len(c) > 12 for c in cajas), cajas)
    f = F.CORPUS / "pptx" / "ms-organigrama.pptx"
    if f.exists():
        importar(p, esp, f)
        bl = p.evaluate("() => { const d = NOM.editorActual.doc; return d.deLaPagina(d.paginas()[0]).map((b) => [b.tipo, (b.texto || '').slice(0, 20)]); }")
        formas = [t for tipo, t in bl if tipo == "forma"]
        anota("PowerPoint: el organigrama (SmartArt) se ve con sus cuadros y sus uniones", {"Top", "Assistant", "Mid-Left"} <= set(formas) and sum(1 for tipo, _ in bl if tipo == "conector") >= 6, bl)
        if capturas: p.screenshot(path=str(Path(capturas) / "organigrama.png"))
        x = p.evaluate(U.JS_EXPORTAR, "pptx")
        sale = F.CACHE / "office-salida" / "pantalla-organigrama.pptx"; sale.parent.mkdir(parents=True, exist_ok=True); sale.write_bytes(base64.b64decode(x["salida"]))
        zb = F.partes_zip(sale); za = F.partes_zip(f)
        anota("   …y sin tocarlo se descarga idéntico (sigue siendo SmartArt)", all(zb.get(k) == v for k, v in za.items()), [k for k, v in za.items() if zb.get(k) != v][:4])
    f = F.CORPUS / "pptx" / "ms-presentation.pptx"
    if f.exists():
        importar(p, esp, f)
        bl = p.evaluate("() => { const d = NOM.editorActual.doc; return d.deLaPagina(d.paginas()[1]).filter((b) => b.tipo === 'forma').map((b) => [b.texto || '', b.color]); }")
        anota("PowerPoint: SmartArt con dibujo guardado, en su lugar y con el color del tema", {"1", "2", "3", "4", "5"} <= {t for t, _ in bl} and all(c and c != "#CFE0FF" for t, c in bl if t), bl)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--movil", action="store_true")
    ap.add_argument("--capturas", help="carpeta donde dejar imágenes de lo que se ve")
    a = ap.parse_args()
    if a.capturas: Path(a.capturas).mkdir(parents=True, exist_ok=True)
    u = N.cuenta(); esp = N.espacio(u["token"], "Lo que se ve")
    w = N.Navegador(movil=a.movil); w.entrar(u)
    try:
        raro(w.p, esp, a.movil, a.capturas)
        if not a.movil: otros(w.p, esp, a.capturas)
    finally:
        errores = [e for e in w.errores if "Failed to load resource" not in e]
        w.cerrar()
    mal = sum(1 for _, ok in res if not ok)
    print(f"\nEn pantalla ({'celular' if a.movil else 'computadora'}): {len(res) - mal} bien, {mal} mal. Errores de JavaScript: {errores[:4]}")
    sys.exit(1 if mal or errores else 0)


if __name__ == "__main__":
    main()
