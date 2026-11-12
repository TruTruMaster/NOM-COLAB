#!/usr/bin/env python3
"""Mide qué tan fiel es NOM-COLAB al abrir y volver a guardar archivos reales de Office.

Para cada archivo del corpus (pruebas/office/corpus.sh):
  1. lo importa en la página real (Chromium, la misma `NOM.formatos.importar` que usa la gente),
  2. lo exporta otra vez a su formato (.docx, .xlsx, .pptx) y también a .nom,
  3. compara el original contra el resultado:
       - estructura: lo que hay dentro (texto, formato, celdas, fórmulas, figuras, imágenes...),
       - a la vista (opcional, --visual): LibreOffice dibuja los dos y se comparan las páginas.

Uso (con el servidor local encendido en el puerto 8099):
  ~/.cache/nom-pruebas/venv/bin/python pruebas/office/fidelidad.py            # todo el corpus
  ... fidelidad.py --solo docx --visual                                       # solo Word, con dibujo
  ... fidelidad.py ruta/a/archivo.xlsx                                        # un archivo
  ... fidelidad.py --modelo                                                   # la medida honesta (ver abajo)
Deja los archivos exportados y `informe.json` en ~/.cache/nom-pruebas/office-salida.

OJO con qué mide cada modo. Sin --modelo, un archivo que no se tocó sale del archivo original que
el documento lleva guardado: el 100 % solo dice que NO SE PIERDE NADA al descargar. No dice cuánto
entiende NOM-COLAB del archivo ni qué se ve en el editor. Para eso es --modelo, que exporta solo con
lo que NOM-COLAB leyó (sin apoyarse en el original), y `pantalla.py`, que revisa lo que se ve.
"""
import argparse, base64, difflib, hashlib, json, os, re, subprocess, sys, time, zipfile
from pathlib import Path

BASE = os.environ.get("NOM_BASE", "http://localhost:8099")
CACHE = Path(os.environ.get("NOM_PRUEBAS_CACHE", Path.home() / ".cache/nom-pruebas"))
CORPUS = CACHE / "corpus"
SALIDA = CACHE / "office-salida"
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(CACHE / "navegadores"))

JS_VUELTA = r"""
async ([b64, nombre]) => {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const aB64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const r = { avisos: [] };
  const avisoOriginal = NOM.aviso; NOM.aviso = (t) => { r.avisos.push(String(t)); };
  try {
    let t0 = performance.now();
    const imp = await NOM.formatos.importar(new File([bytes], nombre));
    r.msImportar = Math.round(performance.now() - t0);
    r.aviso = imp.aviso || null; r.modo = imp.modo; r.ops = imp.ops.length;
    const doc = new NOM.DocCRDT("prueba", { bloques: {}, reloj: 0 }, { local: true, soloMemoria: true });
    doc._fusionar({ id: "local:c1", bloque: "_doc", campos: { nombre: imp.nombre, modo: imp.modo, paginas: ["p1"] }, t: 1, n: "local" });
    imp.ops.forEach((op) => doc._fusionar(op));
    const ext = nombre.split(".").pop().toLowerCase();
    t0 = performance.now();
    const sale = await (ext === "docx" ? NOM.ooxml.docx(doc) : ext === "xlsx" ? NOM.ooxml.xlsx(doc) : NOM.ooxml.pptx(doc, imp.modo === "DIAGRAMA"));
    r.msExportar = Math.round(performance.now() - t0);
    r.salida = aB64(sale);
    // El formato propio: a .nom y de regreso tiene que dar exactamente el mismo documento.
    if (NOM.formatos.aNomBytes) {
      t0 = performance.now();
      const nom = await NOM.formatos.aNomBytes(doc);
      r.msNom = Math.round(performance.now() - t0);
      r.nom = aB64(nom);
      const imp2 = await NOM.formatos.importar(new File([nom], "vuelta.nom"));
      const doc2 = new NOM.DocCRDT("prueba2", { bloques: {}, reloj: 0 }, { local: true, soloMemoria: true });
      doc2._fusionar({ id: "local:c1", bloque: "_doc", campos: { nombre: imp2.nombre, modo: imp2.modo, paginas: ["p1"] }, t: 1, n: "local" });
      imp2.ops.forEach((op) => doc2._fusionar(op));
      const sale2 = await (ext === "docx" ? NOM.ooxml.docx(doc2) : ext === "xlsx" ? NOM.ooxml.xlsx(doc2) : NOM.ooxml.pptx(doc2, imp2.modo === "DIAGRAMA"));
      r.nomIgual = sale2.length === sale.length && sale2.every((v, i) => v === sale[i]);
      if (!r.nomIgual) r.salidaNom = aB64(sale2);
    } else {
      r.nomViejo = NOM.formatos.aNom ? NOM.formatos.aNom(doc).length : null;
    }
  } catch (e) { r.error = String(e && e.stack || e).slice(0, 600); }
  NOM.aviso = avisoOriginal;
  return r;
}
"""


# ------------------------------------------------------------------ utilidades
def partes_zip(ruta):
    try:
        with zipfile.ZipFile(ruta) as z:
            return {i.filename: z.read(i.filename) for i in z.infolist() if not i.is_dir()}
    except Exception:
        return None


def cuenta(xml, *etiquetas):
    return sum(len(re.findall(rb"<" + e.encode() + rb"[ />]", xml)) for e in etiquetas)


def parecido(a, b):
    """0..1: qué tanto se parecen dos textos (por palabras)."""
    a, b = a.split(), b.split()
    if not a and not b: return 1.0
    if not a or not b: return 0.0
    if len(a) + len(b) > 60000:  # muy largo: por conjuntos (rápido)
        from collections import Counter
        ca, cb = Counter(a), Counter(b)
        return 2 * sum((ca & cb).values()) / (len(a) + len(b))
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def razon(a, b):
    """0..1: qué tanto coincide un conteo (1 si son iguales)."""
    if a == b: return 1.0
    if not a or not b: return 0.0
    return min(a, b) / max(a, b)


class Nota:
    """Junta las medidas de un archivo: nombre -> (valor 0..1, detalle)."""
    def __init__(self): self.m = {}
    def pon(self, nombre, valor, detalle=""): self.m[nombre] = (round(float(valor), 4), detalle)
    def conteo(self, nombre, a, b): self.pon(nombre, razon(a, b), f"{a} -> {b}")
    def total(self):
        return round(sum(v for v, _ in self.m.values()) / len(self.m), 4) if self.m else 0.0


# ------------------------------------------------------------------ Word
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _docx_modelo(ruta):
    """Párrafos del cuerpo con el formato EFECTIVO de cada letra (estilos resueltos)."""
    from lxml import etree
    z = partes_zip(ruta)
    doc = etree.fromstring(z["word/document.xml"])
    estilos = {}
    predet = {"p": None, "r": None}
    docdef = {}
    if "word/styles.xml" in z:
        st = etree.fromstring(z["word/styles.xml"])
        dd = st.find(f"{W}docDefaults")
        if dd is not None:
            rp = dd.find(f"{W}rPrDefault/{W}rPr"); pp = dd.find(f"{W}pPrDefault/{W}pPr")
            docdef = {"r": rp, "p": pp}
        for s in st.findall(f"{W}style"):
            sid = s.get(f"{W}styleId")
            estilos[sid] = s
            if s.get(f"{W}default") in ("1", "true"):
                t = s.get(f"{W}type")
                if t == "paragraph": predet["p"] = sid
                if t == "character": predet["r"] = sid

    # Fuentes del tema: muchos archivos no escriben "Calibri" sino "la fuente del cuerpo".
    tema = {}
    for k, v in z.items():
        if re.match(r"word/theme/[^/]+\.xml$", k):
            for cual in ("major", "minor"):
                m = re.search(rb"<a:" + cual.encode() + rb"Font>.*?<a:latin typeface=\"([^\"]*)\"", v, re.S)
                if m: tema[cual] = m.group(1).decode("utf8", "ignore")
            break

    def cadena(sid):
        r, visto = [], set()
        while sid and sid in estilos and sid not in visto:
            visto.add(sid); r.append(estilos[sid])
            b = estilos[sid].find(f"{W}basedOn")
            sid = b.get(f"{W}val") if b is not None else None
        return r[::-1]

    def val_bool(e):
        return e is not None and e.get(f"{W}val") not in ("0", "false", "none")

    def lee_rpr(rpr, a):
        if rpr is None: return
        for k, tag in (("b", "b"), ("i", "i"), ("tachado", "strike")):
            e = rpr.find(f"{W}{tag}")
            if e is not None: a[k] = val_bool(e)
        e = rpr.find(f"{W}u")
        if e is not None: a["u"] = e.get(f"{W}val") not in (None, "none")
        e = rpr.find(f"{W}sz")
        if e is not None: a["tam"] = e.get(f"{W}val")
        e = rpr.find(f"{W}color")
        if e is not None and e.get(f"{W}val") not in (None, "auto"): a["color"] = e.get(f"{W}val").upper()
        e = rpr.find(f"{W}rFonts")
        if e is not None:
            t = e.get(f"{W}asciiTheme") or e.get(f"{W}hAnsiTheme")
            f = (tema.get("major" if t.startswith("major") else "minor") if t else None) or e.get(f"{W}ascii") or e.get(f"{W}hAnsi")
            if f: a["fuente"] = f
        e = rpr.find(f"{W}highlight")
        if e is not None: a["resalte"] = e.get(f"{W}val")
        e = rpr.find(f"{W}vertAlign")
        if e is not None: a["vert"] = e.get(f"{W}val")

    def lee_ppr(ppr, a):
        if ppr is None: return
        e = ppr.find(f"{W}jc")
        if e is not None: a["alin"] = {"start": "left", "end": "right"}.get(e.get(f"{W}val"), e.get(f"{W}val"))
        e = ppr.find(f"{W}ind")
        if e is not None:
            for k in ("left", "start", "firstLine", "hanging"):
                if e.get(f"{W}{k}") is not None: a["ind_" + {"start": "left"}.get(k, k)] = e.get(f"{W}{k}")
        e = ppr.find(f"{W}spacing")
        if e is not None:
            for k in ("before", "after", "line"):
                if e.get(f"{W}{k}") is not None: a["esp_" + k] = e.get(f"{W}{k}")
        e = ppr.find(f"{W}numPr")
        if e is not None:
            n = e.find(f"{W}numId")
            a["lista"] = n is not None and n.get(f"{W}val") != "0"

    parrafos = []
    cuerpo = doc.find(f"{W}body")
    for p in cuerpo.iter(f"{W}p"):
        ppr = p.find(f"{W}pPr")
        sid = None
        if ppr is not None and ppr.find(f"{W}pStyle") is not None: sid = ppr.find(f"{W}pStyle").get(f"{W}val")
        sid = sid or predet["p"]
        pa, base = {}, {}
        lee_ppr(docdef.get("p"), pa); lee_rpr(docdef.get("r"), base)
        for s in cadena(sid):
            lee_ppr(s.find(f"{W}pPr"), pa); lee_rpr(s.find(f"{W}rPr"), base)
        lee_ppr(ppr, pa)
        nombre = ""
        if sid in estilos and estilos[sid].find(f"{W}name") is not None:
            nombre = estilos[sid].find(f"{W}name").get(f"{W}val", "").lower()
        nivel = re.match(r"heading (\d)", nombre)
        pa["titulo"] = nivel.group(1) if nivel else ("t" if nombre == "title" else "")
        texto, letras = "", []
        for r in p.iter(f"{W}r"):
            a = dict(base)
            rpr = r.find(f"{W}rPr")
            if rpr is not None and rpr.find(f"{W}rStyle") is not None:
                for s in cadena(rpr.find(f"{W}rStyle").get(f"{W}val")): lee_rpr(s.find(f"{W}rPr"), a)
            lee_rpr(rpr, a)
            t = ""
            for h in r:
                if h.tag == f"{W}t": t += h.text or ""
                elif h.tag == f"{W}tab": t += "\t"
                elif h.tag in (f"{W}br", f"{W}cr"): t += "\n"
            texto += t
            letras += [a] * len(t)
        parrafos.append({"texto": texto, "pa": pa, "letras": letras, "enTabla": any(x.tag == f"{W}tc" for x in p.iterancestors())})
    sect = cuerpo.find(f"{W}sectPr")
    pagina = {}
    if sect is not None:
        sz, mar = sect.find(f"{W}pgSz"), sect.find(f"{W}pgMar")
        if sz is not None: pagina.update(w=sz.get(f"{W}w"), h=sz.get(f"{W}h"), o=sz.get(f"{W}orient") or "portrait")
        if mar is not None: pagina.update({k: mar.get(f"{W}{k}") for k in ("top", "bottom", "left", "right")})
    return {"parrafos": parrafos, "pagina": pagina, "zip": z, "xml": z["word/document.xml"]}


def comparar_docx(orig, nuevo):
    n = Nota()
    a, b = _docx_modelo(orig), _docx_modelo(nuevo)
    ta = "\n".join(p["texto"] for p in a["parrafos"]); tb = "\n".join(p["texto"] for p in b["parrafos"])
    n.pon("texto", parecido(ta, tb), f"{len(ta)} -> {len(tb)} letras")
    # Emparejar párrafos por su texto para comparar formato de párrafo y de letra.
    ka = [p["texto"].strip() for p in a["parrafos"]]; kb = [p["texto"].strip() for p in b["parrafos"]]
    sm = difflib.SequenceMatcher(None, ka, kb, autojunk=False)
    pares = [(a["parrafos"][i + k], b["parrafos"][j + k]) for i, j, l in sm.get_matching_blocks() for k in range(l) if ka[i + k]]
    n.pon("parrafos", len(pares) / max(1, sum(1 for k in ka if k)), f"{len(pares)} de {sum(1 for k in ka if k)} con el mismo texto")
    PR = ("alin", "titulo", "lista", "ind_left", "ind_firstLine", "ind_hanging", "esp_before", "esp_after", "esp_line")
    LR = ("b", "i", "u", "tachado", "tam", "color", "fuente", "resalte", "vert")
    okp = {k: [0, 0] for k in PR}; okl = {k: [0, 0] for k in LR}
    NEUTRO = {"alin": ("left", None, "both_"), "lista": (False, None), "titulo": ("", None), "color": (None, "000000")}
    def igual(k, x, y):
        if x == y: return True
        if k in NEUTRO and x in NEUTRO[k] and y in NEUTRO[k]: return True
        if k in ("ind_left", "ind_firstLine", "ind_hanging", "esp_before", "esp_after"):
            try: return abs(int(x or 0) - int(y or 0)) <= 20
            except ValueError: return False
        if k == "esp_line":
            try: return abs(int(x or 240) - int(y or 240)) <= 6
            except ValueError: return False
        if k in ("b", "i", "u", "tachado"): return bool(x) == bool(y)
        return False
    for pa, pb in pares:
        for k in PR:
            okp[k][1] += 1; okp[k][0] += igual(k, pa["pa"].get(k), pb["pa"].get(k))
        la, lb = pa["letras"], pb["letras"]
        # mismas letras (el texto sin espacios de las orillas es igual): alinear por el recorte
        da = len(pa["texto"]) - len(pa["texto"].lstrip()); db = len(pb["texto"]) - len(pb["texto"].lstrip())
        for i in range(len(pa["texto"].strip())):
            if da + i >= len(la) or db + i >= len(lb): break
            for k in LR:
                okl[k][1] += 1; okl[k][0] += igual(k, la[da + i].get(k), lb[db + i].get(k))
    for k in PR:
        if okp[k][1]: n.pon("párrafo:" + k, okp[k][0] / okp[k][1], f"{okp[k][0]}/{okp[k][1]}")
    for k in LR:
        if okl[k][1]: n.pon("letra:" + k, okl[k][0] / okl[k][1], f"{okl[k][0]}/{okl[k][1]}")
    xa, xb = a["xml"], b["xml"]
    n.conteo("tablas", cuenta(xa, "w:tbl"), cuenta(xb, "w:tbl"))
    n.conteo("celdas de tabla", cuenta(xa, "w:tc"), cuenta(xb, "w:tc"))
    n.conteo("imágenes", cuenta(xa, "pic:pic", "v:imagedata"), cuenta(xb, "pic:pic", "v:imagedata"))
    n.conteo("vínculos", cuenta(xa, "w:hyperlink"), cuenta(xb, "w:hyperlink"))
    n.conteo("saltos de página", len(re.findall(rb'<w:br w:type="page"', xa)), len(re.findall(rb'<w:br w:type="page"', xb)))
    n.conteo("ecuaciones", cuenta(xa, "m:oMath"), cuenta(xb, "m:oMath"))
    n.conteo("secciones", cuenta(xa, "w:sectPr"), cuenta(xb, "w:sectPr"))
    za, zb = a["zip"], b["zip"]
    def varios(z, pref, etiqueta):
        return sum(cuenta(v, etiqueta) for k, v in z.items() if k.startswith(pref))
    def notas(z, parte, etiqueta):
        x = z.get(parte, b"")
        return max(0, len(re.findall(rb"<w:" + etiqueta + rb" (?![^>]*w:type=)", x)))
    n.conteo("notas al pie", notas(za, "word/footnotes.xml", b"footnote"), notas(zb, "word/footnotes.xml", b"footnote"))
    n.conteo("notas al final", notas(za, "word/endnotes.xml", b"endnote"), notas(zb, "word/endnotes.xml", b"endnote"))
    n.conteo("comentarios", cuenta(za.get("word/comments.xml", b""), "w:comment"), cuenta(zb.get("word/comments.xml", b""), "w:comment"))
    def txt_partes(z, pref):
        return " ".join(re.sub(rb"<[^>]+>", b" ", re.sub(rb"</w:p>", b"\n", v)).decode("utf8", "ignore") for k, v in sorted(z.items()) if k.startswith(pref))
    for nombre, pref in (("encabezados", "word/header"), ("pies de página", "word/footer")):
        ha, hb = txt_partes(za, pref), txt_partes(zb, pref)
        if ha.strip() or hb.strip(): n.pon(nombre, parecido(ha, hb), f"{len(ha.split())} -> {len(hb.split())} palabras")
    pg = [k for k in a["pagina"] if a["pagina"].get(k)]
    if pg:
        ok = sum(1 for k in pg if str(a["pagina"].get(k)) == str(b["pagina"].get(k)) or (str(a["pagina"][k]).lstrip("-").isdigit() and str(b["pagina"].get(k, "x")).lstrip("-").isdigit() and abs(int(a["pagina"][k]) - int(b["pagina"][k])) <= 20))
        n.pon("página (tamaño y márgenes)", ok / len(pg), f"{ok}/{len(pg)}")
    return n


# ------------------------------------------------------------------ Excel
def comparar_xlsx(orig, nuevo):
    import openpyxl, warnings
    warnings.simplefilter("ignore")
    n = Nota()
    a = openpyxl.load_workbook(orig); b = openpyxl.load_workbook(nuevo)
    n.pon("nombres de las hojas", parecido(" ".join(s.replace(" ", "_") for s in a.sheetnames), " ".join(s.replace(" ", "_") for s in b.sheetnames)), f"{len(a.sheetnames)} -> {len(b.sheetnames)}")
    tot = {k: [0, 0] for k in ("valores y fórmulas", "formato de número", "negrita y cursiva", "color de letra", "relleno", "bordes", "alineación", "tamaño y fuente")}
    otros = {k: [0, 0] for k in ("celdas combinadas", "anchos de columna", "altos de fila", "filas y columnas fijas", "formato condicional", "validación de datos", "gráficas", "imágenes", "comentarios", "vínculos", "filtro", "hojas ocultas")}
    def col(c):
        try:
            if c is None: return None
            if c.type == "rgb" and isinstance(c.rgb, str): return c.rgb[-6:].upper()
            if c.type == "theme": return f"tema{c.theme}:{round(c.tint or 0, 2)}"
            if c.type == "indexed": return f"idx{c.indexed}"
        except Exception: pass
        return None
    def relleno(c):
        f = c.fill
        if f is None or f.fill_type in (None, "none"): return None
        return (f.fill_type, col(f.fgColor))
    def bordes(c):
        bo = c.border
        return tuple((getattr(bo, l).style or None) for l in ("left", "right", "top", "bottom")) if bo else (None,) * 4
    def norm(v):
        if isinstance(v, float) and v == int(v) and abs(v) < 1e15: return int(v)
        if isinstance(v, float): return round(v, 9)
        if isinstance(v, str): return v.replace("\r\n", "\n").replace("_xlfn.", "").replace("_xlws.", "")
        if hasattr(v, "text"): return "=" + str(v.text)   # fórmula matricial
        if hasattr(v, "isoformat"): return v.isoformat()
        return v
    for nombre in a.sheetnames:
        ha = a[nombre]
        if nombre not in b.sheetnames:
            if hasattr(ha, "iter_rows"):
                for fila in ha.iter_rows():
                    for c in fila:
                        if c.value is not None: tot["valores y fórmulas"][1] += 1
            continue
        hb = b[nombre]
        if not hasattr(ha, "iter_rows") or not hasattr(hb, "iter_rows"): continue
        for fila in ha.iter_rows():
            for c in fila:
                tiene_formato = c.has_style
                if c.value is None and not tiene_formato: continue
                d = hb.cell(row=c.row, column=c.column)
                if c.value is not None:
                    tot["valores y fórmulas"][1] += 1; tot["valores y fórmulas"][0] += norm(c.value) == norm(d.value)
                if not tiene_formato: continue
                if c.value is not None:
                    tot["formato de número"][1] += 1; tot["formato de número"][0] += (c.number_format or "General") == (d.number_format or "General")
                    tot["negrita y cursiva"][1] += 1; tot["negrita y cursiva"][0] += (bool(c.font.b), bool(c.font.i), bool(c.font.u), bool(c.font.strike)) == (bool(d.font.b), bool(d.font.i), bool(d.font.u), bool(d.font.strike))
                    tot["color de letra"][1] += 1; tot["color de letra"][0] += col(c.font.color) == col(d.font.color) or (col(c.font.color) in (None, "000000", "tema1:0.0") and col(d.font.color) in (None, "000000", "tema1:0.0"))
                    tot["tamaño y fuente"][1] += 1; tot["tamaño y fuente"][0] += (c.font.sz, c.font.name) == (d.font.sz, d.font.name)
                    al = lambda x: (x.alignment.horizontal or "general", x.alignment.vertical or "bottom", bool(x.alignment.wrap_text), int(x.alignment.text_rotation or 0), int(x.alignment.indent or 0))
                    tot["alineación"][1] += 1; tot["alineación"][0] += al(c) == al(d)
                if relleno(c) or relleno(d): tot["relleno"][1] += 1; tot["relleno"][0] += relleno(c) == relleno(d)
                if any(bordes(c)) or any(bordes(d)): tot["bordes"][1] += 1; tot["bordes"][0] += bordes(c) == bordes(d)
        ma = {str(r) for r in ha.merged_cells.ranges}; mb = {str(r) for r in hb.merged_cells.ranges}
        otros["celdas combinadas"][1] += len(ma); otros["celdas combinadas"][0] += len(ma & mb)
        for k, da in ha.column_dimensions.items():
            if da.width is None or not da.customWidth: continue
            otros["anchos de columna"][1] += 1
            wb_ = hb.column_dimensions[k].width if k in hb.column_dimensions else None
            otros["anchos de columna"][0] += wb_ is not None and abs(wb_ - da.width) <= 0.6
        for k, da in ha.row_dimensions.items():
            if da.height is None or not da.customHeight: continue
            otros["altos de fila"][1] += 1
            hh = hb.row_dimensions[k].height if k in hb.row_dimensions else None
            otros["altos de fila"][0] += hh is not None and abs(hh - da.height) <= 0.8
        if ha.freeze_panes or hb.freeze_panes:
            otros["filas y columnas fijas"][1] += 1; otros["filas y columnas fijas"][0] += ha.freeze_panes == hb.freeze_panes
        cfa = sum(len(r.rules) for r in ha.conditional_formatting); cfb = sum(len(r.rules) for r in hb.conditional_formatting)
        otros["formato condicional"][1] += cfa; otros["formato condicional"][0] += min(cfa, cfb)
        dva = len(ha.data_validations.dataValidation) if ha.data_validations else 0; dvb = len(hb.data_validations.dataValidation) if hb.data_validations else 0
        otros["validación de datos"][1] += dva; otros["validación de datos"][0] += min(dva, dvb)
        otros["gráficas"][1] += len(ha._charts); otros["gráficas"][0] += min(len(ha._charts), len(hb._charts))
        otros["imágenes"][1] += len(ha._images); otros["imágenes"][0] += min(len(ha._images), len(hb._images))
        ca = sum(1 for f in ha.iter_rows() for c in f if c.comment); cb = sum(1 for f in hb.iter_rows() for c in f if c.comment)
        otros["comentarios"][1] += ca; otros["comentarios"][0] += min(ca, cb)
        la = sum(1 for f in ha.iter_rows() for c in f if c.hyperlink); lb = sum(1 for f in hb.iter_rows() for c in f if c.hyperlink)
        otros["vínculos"][1] += la; otros["vínculos"][0] += min(la, lb)
        if ha.auto_filter.ref: otros["filtro"][1] += 1; otros["filtro"][0] += ha.auto_filter.ref == hb.auto_filter.ref
        if ha.sheet_state != "visible": otros["hojas ocultas"][1] += 1; otros["hojas ocultas"][0] += ha.sheet_state == hb.sheet_state
    for k, (ok, de) in {**tot, **otros}.items():
        if de: n.pon(k, ok / de, f"{ok}/{de}")
    na = {k for k in a.defined_names}; nb = {k for k in b.defined_names}
    if na: n.pon("nombres definidos", len(na & nb) / len(na), f"{len(na & nb)}/{len(na)}")
    return n


# ------------------------------------------------------------------ PowerPoint
def comparar_pptx(orig, nuevo):
    from pptx import Presentation
    from pptx.util import Emu
    n = Nota()
    a, b = Presentation(orig), Presentation(nuevo)
    n.conteo("diapositivas", len(a.slides), len(b.slides))
    n.pon("tamaño de la diapositiva", 1.0 if (abs(a.slide_width - b.slide_width) < 20000 and abs(a.slide_height - b.slide_height) < 20000) else 0.0, f"{a.slide_width}x{a.slide_height} -> {b.slide_width}x{b.slide_height}")
    def figuras(sl, dentro=None, acc=None):
        acc = [] if acc is None else acc
        for s in (dentro if dentro is not None else sl.shapes):
            if s.shape_type == 6 and hasattr(s, "shapes"): figuras(sl, s.shapes, acc); continue
            acc.append(s)
        return acc
    def texto_de(s):
        if getattr(s, "has_text_frame", False) and s.has_text_frame: return s.text_frame.text
        if getattr(s, "has_table", False) and s.has_table: return "\n".join(c.text for r in s.table.rows for c in r.cells)
        return ""
    T = {k: [0, 0] for k in ("figuras", "posición y tamaño", "imágenes", "tablas", "gráficas", "notas del orador", "negrita y cursiva", "tamaño de letra", "color de letra", "alineación del texto")}
    textos_a, textos_b = [], []
    for i, sa in enumerate(a.slides):
        fa = figuras(sa)
        sb = b.slides[i] if i < len(b.slides) else None
        fb = figuras(sb) if sb is not None else []
        # los marcadores vacíos (sin texto) no se ven al presentar: no cuentan
        visibles = lambda fs: [s for s in fs if not (s.is_placeholder and not texto_de(s).strip() and s.shape_type != 13 and not getattr(s, "has_chart", False) and not getattr(s, "has_table", False))]
        fa, fb = visibles(fa), visibles(fb)
        T["figuras"][1] += len(fa); T["figuras"][0] += min(len(fa), len(fb))
        ia = sum(1 for s in fa if s.shape_type == 13); ib = sum(1 for s in fb if s.shape_type == 13)
        T["imágenes"][1] += ia; T["imágenes"][0] += min(ia, ib)
        qa = sum(1 for s in fa if getattr(s, "has_table", False) and s.has_table); qb = sum(1 for s in fb if getattr(s, "has_table", False) and s.has_table)
        T["tablas"][1] += qa; T["tablas"][0] += min(qa, qb)
        ga = sum(1 for s in fa if getattr(s, "has_chart", False) and s.has_chart); gb = sum(1 for s in fb if getattr(s, "has_chart", False) and s.has_chart)
        T["gráficas"][1] += ga; T["gráficas"][0] += min(ga, gb)
        textos_a.append(" ".join(texto_de(s) for s in fa)); textos_b.append(" ".join(texto_de(s) for s in fb))
        # emparejar por texto para comparar el formato de la letra
        porTexto = {}
        for s in fb:
            t = texto_de(s).strip()
            if t: porTexto.setdefault(t, []).append(s)
        for s in fa:
            t = texto_de(s).strip()
            if not t or t not in porTexto or not porTexto[t]: continue
            d = porTexto[t].pop(0)
            if s.width and d.width and s.left is not None and d.left is not None:
                T["posición y tamaño"][1] += 1
                tol = max(a.slide_width, a.slide_height) * 0.02
                T["posición y tamaño"][0] += all(abs((getattr(s, k) or 0) - (getattr(d, k) or 0)) <= tol for k in ("left", "top", "width", "height"))
            if not (getattr(s, "has_text_frame", False) and s.has_text_frame and getattr(d, "has_text_frame", False) and d.has_text_frame): continue
            for pa, pb in zip(s.text_frame.paragraphs, d.text_frame.paragraphs):
                if pa.text.strip():
                    T["alineación del texto"][1] += 1; T["alineación del texto"][0] += (pa.alignment or 1) == (pb.alignment or 1) or {pa.alignment, pb.alignment} <= {None, 1}
                ra = [(r, c) for r in pa.runs for c in r.text]; rb = [(r, c) for r in pb.runs for c in r.text]
                for (r1, _), (r2, _) in zip(ra, rb):
                    T["negrita y cursiva"][1] += 1; T["negrita y cursiva"][0] += (bool(r1.font.bold), bool(r1.font.italic)) == (bool(r2.font.bold), bool(r2.font.italic))
                    if r1.font.size is not None:
                        T["tamaño de letra"][1] += 1; T["tamaño de letra"][0] += r2.font.size is not None and abs(r1.font.size - r2.font.size) <= 12700
                    def c(f):
                        try: return str(f.color.rgb) if f.color and f.color.type == 1 else None
                        except Exception: return None
                    if c(r1.font):
                        T["color de letra"][1] += 1; T["color de letra"][0] += c(r1.font) == c(r2.font)
        na = sa.notes_slide.notes_text_frame.text.strip() if sa.has_notes_slide and sa.notes_slide.notes_text_frame is not None else ""
        if na:
            nb = sb.notes_slide.notes_text_frame.text.strip() if sb is not None and sb.has_notes_slide and sb.notes_slide.notes_text_frame is not None else ""
            T["notas del orador"][1] += 1; T["notas del orador"][0] += parecido(na, nb)
    n.pon("texto", parecido("\n".join(textos_a), "\n".join(textos_b)), f"{sum(len(t) for t in textos_a)} -> {sum(len(t) for t in textos_b)} letras")
    for k, (ok, de) in T.items():
        if de: n.pon(k, ok / de, f"{round(ok, 1)}/{de}")
    return n


def comparar_partes(orig, nuevo):
    """Cuando la librería no sabe abrir el original (por ejemplo, formato ISO "Strict"): parte por parte del .zip."""
    n = Nota()
    a, b = partes_zip(orig), partes_zip(nuevo)
    iguales = sum(1 for k, v in a.items() if b.get(k) == v)
    n.pon("partes del archivo idénticas", iguales / max(1, len(a)), f"{iguales}/{len(a)}")
    n.conteo("número de partes", len(a), len(b))
    return n


# ------------------------------------------------------------------ a la vista (LibreOffice)
def dibujar(ruta, carpeta):
    """Convierte a PDF con LibreOffice y saca las páginas como PNG chicos. Devuelve (páginas, texto)."""
    carpeta.mkdir(parents=True, exist_ok=True)
    pdf = carpeta / (Path(ruta).stem + ".pdf")
    if not pdf.exists():
        perfil = CACHE / "lo-perfil"
        subprocess.run(["soffice", f"-env:UserInstallation=file://{perfil}", "--headless", "--convert-to", "pdf", "--outdir", str(carpeta), str(ruta)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=240)
    if not pdf.exists(): return [], ""
    if not list(carpeta.glob("pag-*.png")):
        subprocess.run(["pdftoppm", "-r", "40", "-l", "40", "-png", str(pdf), str(carpeta / "pag")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=240)
    texto = subprocess.run(["pdftotext", "-l", "60", str(pdf), "-"], capture_output=True, timeout=120).stdout.decode("utf8", "ignore")
    return sorted(carpeta.glob("pag-*.png")), texto


def comparar_vista(orig, nuevo, carpeta, n):
    from PIL import Image, ImageChops, ImageStat
    pa, ta = dibujar(orig, carpeta / "orig")
    pb, tb = dibujar(nuevo, carpeta / "nuevo")
    if not pa or not pb:
        n.pon("vista: se pudo dibujar", 0.0 if pa else 1.0, f"{len(pa)} -> {len(pb)} páginas"); return
    n.conteo("vista: páginas", len(pa), len(pb))
    n.pon("vista: texto dibujado", parecido(ta, tb), f"{len(ta.split())} -> {len(tb.split())} palabras")
    s = []
    for x, y in zip(pa, pb):
        ia = Image.open(x).convert("L"); ib = Image.open(y).convert("L").resize(ia.size)
        s.append(1 - ImageStat.Stat(ImageChops.difference(ia, ib)).mean[0] / 255)
    s += [0.0] * (max(len(pa), len(pb)) - len(s))
    n.pon("vista: parecido de las páginas", sum(s) / len(s), f"{len(s)} páginas")


# ------------------------------------------------------------------ principal
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("archivos", nargs="*")
    ap.add_argument("--solo", choices=["docx", "xlsx", "pptx"])
    ap.add_argument("--visual", action="store_true", help="también comparar cómo se ven (LibreOffice; tarda)")
    ap.add_argument("--detalle", action="store_true", help="imprimir cada medida")
    ap.add_argument("--modelo", action="store_true", help="exportar solo con lo que NOM-COLAB leyó, sin el archivo original guardado (lo que de verdad entiende)")
    ap.add_argument("--minimo", type=float, default=0.0, help="salir con error si el promedio queda debajo")
    a = ap.parse_args()
    archivos = [Path(x) for x in a.archivos] or sorted(p for p in CORPUS.rglob("*") if p.suffix in (".docx", ".xlsx", ".pptx"))
    if a.solo: archivos = [p for p in archivos if p.suffix == "." + a.solo]
    if not archivos: sys.exit("No hay archivos: corre primero pruebas/office/corpus.sh")
    SALIDA.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright
    informe, errores_js = [], []
    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        pag = nav.new_page()
        pag.on("pageerror", lambda e: errores_js.append(str(e)))
        pag.goto(BASE + "/"); pag.wait_for_function("() => window.NOM && NOM.ooxml && NOM.formatos && NOM.DocCRDT", timeout=30000)
        JS_MODO = "(m) => { NOM.ooxml.usarOrigen = !m; }"
        pag.evaluate(JS_MODO, a.modelo)
        for f in archivos:
            ext = f.suffix[1:]
            datos = f.read_bytes()
            fila = {"archivo": f.name, "tipo": ext, "original": len(datos)}
            t0 = time.time()
            try:
                r = pag.evaluate(JS_VUELTA, [base64.b64encode(datos).decode(), f.name])
            except Exception as e:
                r = {"error": "navegador: " + str(e)[:300]}
                pag = nav.new_page(); pag.goto(BASE + "/"); pag.wait_for_function("() => window.NOM && NOM.ooxml && NOM.formatos", timeout=30000)
                pag.evaluate(JS_MODO, a.modelo)
            fila.update({k: r.get(k) for k in ("aviso", "avisos", "error", "msImportar", "msExportar", "msNom", "nomIgual", "nomViejo", "ops")})
            if r.get("salida"):
                sale = SALIDA / f.name
                sale.write_bytes(base64.b64decode(r["salida"]))
                fila["exportado"] = sale.stat().st_size
                if r.get("nom"):
                    (SALIDA / (f.stem + "." + ext + ".nom")).write_bytes(base64.b64decode(r["nom"])); fila["nom"] = len(base64.b64decode(r["nom"]))
                if r.get("salidaNom"): (SALIDA / (f.stem + ".desde-nom." + ext)).write_bytes(base64.b64decode(r["salidaNom"]))
                try:
                    try: n = {"docx": comparar_docx, "xlsx": comparar_xlsx, "pptx": comparar_pptx}[ext](f, sale)
                    except Exception as e1:
                        n = comparar_partes(f, sale); fila["aviso_comparar"] = "por partes: " + repr(e1)[:120]
                    if a.visual: comparar_vista(f, sale, SALIDA / "vista" / (ext + "-" + f.stem), n)
                    fila["medidas"] = n.m; fila["nota"] = n.total()
                except Exception as e:
                    fila["error"] = "comparar: " + repr(e)[:300]; fila["nota"] = 0.0
            else:
                fila["nota"] = 0.0
            fila["s"] = round(time.time() - t0, 1)
            informe.append(fila)
            marca = "ERROR " + (fila.get("error") or "")[:110] if fila.get("error") else ""
            print(f"{fila['nota']*100:6.1f}%  {f.name:36} {fila['original']//1024:5} KB -> {fila.get('exportado', 0)//1024:5} KB  .nom {str((fila.get('nom') or 0)//1024)+' KB':>8}"
                  f"  imp {fila.get('msImportar') or 0:5} ms  exp {fila.get('msExportar') or 0:5} ms  {'nom=igual' if fila.get('nomIgual') else ('NOM≠' if fila.get('nomIgual') is False else '')} {marca}", flush=True)
            if a.detalle and fila.get("medidas"):
                for k, (v, d) in fila["medidas"].items():
                    if v < 0.999: print(f"          {v*100:5.1f}%  {k}: {d}")
                if fila.get("aviso"): print("          aviso:", fila["aviso"])
        nav.close()
    (SALIDA / ("informe-modelo.json" if a.modelo else "informe.json")).write_text(json.dumps(informe, ensure_ascii=False, indent=1))
    if a.modelo: print("\n(Medida con --modelo: solo lo que NOM-COLAB leyó del archivo, sin el original guardado.)")
    print()
    for ext in ("docx", "xlsx", "pptx"):
        fs = [x for x in informe if x["tipo"] == ext]
        if not fs: continue
        prom = sum(x["nota"] for x in fs) / len(fs)
        print(f"{ext}: {prom*100:.1f}% de fidelidad en {len(fs)} archivos ({sum(1 for x in fs if x.get('error'))} con error); "
              f"original {sum(x['original'] for x in fs)//1024} KB, exportado {sum(x.get('exportado', 0) for x in fs)//1024} KB, .nom {sum((x.get('nom') or 0) for x in fs)//1024} KB")
        # las medidas más flojas del formato, para saber qué arreglar
        flojas = {}
        for x in fs:
            for k, (v, _) in (x.get("medidas") or {}).items(): flojas.setdefault(k, []).append(v)
        peor = sorted(((sum(v) / len(v), k, len(v)) for k, v in flojas.items()))[:8]
        print("   lo más flojo: " + "; ".join(f"{k} {p*100:.0f}% ({c})" for p, k, c in peor if p < 0.999))
    total = sum(x["nota"] for x in informe) / len(informe)
    print(f"\nTOTAL: {total*100:.1f}% en {len(informe)} archivos. Errores de JavaScript en la página: {errores_js[:5]}")
    if total < a.minimo: sys.exit(1)


if __name__ == "__main__":
    main()
