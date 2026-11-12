#!/usr/bin/env python3
"""Prueba lo más delicado de la conversión: importar un archivo real de Office, EDITAR algo en
NOM-COLAB y volver a exportar. Tiene que salir el cambio y nada más tiene que moverse.

Cada caso importa en la página real (Chromium), cambia el documento con las mismas operaciones
que usan los editores (doc.cambiar / doc.seq), exporta y revisa el resultado con openpyxl,
python-docx o python-pptx. Con --office además lo abre LibreOffice (tiene que poder).

  ~/.cache/nom-pruebas/venv/bin/python pruebas/office/ediciones.py [--office] [--solo xlsx]
"""
import argparse, base64, os, subprocess, sys, warnings, zipfile, re
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fidelidad as F

warnings.simplefilter("ignore")
SALIDA = F.CACHE / "office-ediciones"

JS = r"""
async ([b64, nombre, edicion]) => {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const aB64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const r = {};
  try {
    const imp = await NOM.formatos.importar(new File([bytes], nombre));
    let doc = NOM.formatos.docDeOps(imp.nombre, imp.modo, imp.ops);
    const ext = nombre.split(".").pop().toLowerCase();
    const exportar = (d) => (ext === "docx" ? NOM.ooxml.docx(d) : ext === "xlsx" ? NOM.ooxml.xlsx(d) : NOM.ooxml.pptx(d, false));
    r.info = await (new Function("doc", "NOM", "return (async () => {" + edicion + "})()"))(doc, NOM);
    r.salida = aB64(await exportar(doc));
    // y lo mismo pasando por el formato propio: editar, guardar .nom, abrirlo y exportar
    const nom = NOM.formatos.aNomBytes(doc);
    r.nom = nom.length;
    const imp2 = await NOM.formatos.importar(new File([nom], "x.nom"));
    const doc2 = NOM.formatos.docDeOps(imp2.nombre, imp2.modo, imp2.ops);
    r.salidaNom = aB64(await exportar(doc2));
  } catch (e) { r.error = String(e && e.stack || e).slice(0, 700); }
  return r;
}
"""

# ------------------------------------------------------------------ casos
def x_valor(r, orig, sale):
    import openpyxl
    a, b = openpyxl.load_workbook(orig), openpyxl.load_workbook(sale)
    h = b[b.sheetnames[0]]
    assert h["B2"].value == "Editado en NOM-COLAB", f"B2 = {h['B2'].value!r}"
    assert h["B2"].font.b, "B2 debería ir en negrita"
    assert h["AZ300"].value == 1234.5, f"AZ300 = {h['AZ300'].value!r}"
    assert str(h["AZ301"].value).upper().replace(" ", "") == "=SUM(AZ300:AZ300)*2", f"AZ301 = {h['AZ301'].value!r}"
    n = F.comparar_xlsx(orig, sale)
    # B2 se cambió a propósito (valor y negrita): es la única diferencia que se acepta
    def de_mas(k, det):
        ok, de = (int(float(x)) for x in det.split("/")) if "/" in det else (1, 1)
        return de - ok > (1 if k in ("valores y fórmulas", "negrita y cursiva", "formato de número") else 0)
    flojas = {k: d for k, (v, d) in n.m.items() if v < 1 and de_mas(k, d)}
    assert not flojas, f"se movió algo más: {flojas}"
    return f"{len(b.sheetnames)} hojas, resto {n.total()*100:.1f}%"

def x_hojas(r, orig, sale):
    import openpyxl
    a, b = openpyxl.load_workbook(orig), openpyxl.load_workbook(sale)
    assert b.sheetnames[0] == "Renombrada por mí", b.sheetnames
    assert "Hoja nueva" in b.sheetnames, b.sheetnames
    hn = b["Hoja nueva"]
    assert hn["A1"].value == "Total" and hn["B1"].value == 42 and hn["A1"].font.b, (hn["A1"].value, hn["B1"].value)
    assert len(b.sheetnames) == len(a.sheetnames) + 1, (a.sheetnames, b.sheetnames)
    # las demás hojas siguen con sus datos
    for nombre in a.sheetnames[1:]:
        if not hasattr(a[nombre], "iter_rows"): continue
        va = [c.value for f in a[nombre].iter_rows(max_row=40) for c in f]; vb = [c.value for f in b[nombre].iter_rows(max_row=40) for c in f]
        assert [F_norm(x) for x in va] == [F_norm(x) for x in vb], f"cambió la hoja {nombre}"
    return ", ".join(b.sheetnames[:4])

def F_norm(v):
    if hasattr(v, "text"): return "=" + str(v.text)
    return v

def x_borrar_hoja(r, orig, sale):
    import openpyxl
    a, b = openpyxl.load_workbook(orig), openpyxl.load_workbook(sale)
    assert len(b.sheetnames) == len(a.sheetnames) - 1 and a.sheetnames[1] not in b.sheetnames, (a.sheetnames, b.sheetnames)
    return f"{len(a.sheetnames)} -> {len(b.sheetnames)} hojas"

def x_formato(r, orig, sale):
    import openpyxl
    a, b = openpyxl.load_workbook(orig), openpyxl.load_workbook(sale)
    ha, hb = a[a.sheetnames[0]], b[b.sheetnames[0]]
    ref = r["info"]["ref"]
    ca, cb = ha[ref], hb[ref]
    assert F_norm(ca.value) == F_norm(cb.value), f"el valor de {ref} no debía cambiar: {ca.value!r} -> {cb.value!r}"
    assert cb.fill.fill_type == "solid" and cb.fill.fgColor.rgb[-6:].upper() == "FFE599", f"relleno de {ref}: {cb.fill.fgColor.rgb}"
    assert cb.font.name == ca.font.name and cb.font.sz == ca.font.sz, f"la fuente de {ref} cambió: {ca.font.name} {ca.font.sz} -> {cb.font.name} {cb.font.sz}"
    assert cb.number_format == ca.number_format, f"el formato de número cambió: {ca.number_format} -> {cb.number_format}"
    ancho = hb.column_dimensions["C"].width
    assert ancho and abs(ancho - (200 - 5) / 7) < 0.6, f"ancho de C = {ancho}"
    assert hb.freeze_panes == "A3", f"filas fijas: {hb.freeze_panes}"
    return f"{ref} con relleno, misma fuente ({cb.font.name} {cb.font.sz}) y formato {cb.number_format!r}"

DOCX_VARIOS = ["ms-complex2010.docx", "ms-informe-gobernanza.docx", "ms-hoja-informativa.docx", "ms-tabla.docx", "poi-listas.docx", "poi-notas-al-pie.docx", "ms-ecuaciones.docx", "ms-imagenes.docx", "ms-comentarios.docx", "ms-complex2005.docx"]
JS_TEXTO = """
            const sec = doc.secuencia("cuerpo");"""

def _d_resto(orig, sale, minimo=0.985, salvo=()):
    """Todo lo demás del documento sigue igual (las medidas de fidelidad no bajan)."""
    n = F.comparar_docx(orig, sale)
    flojas = {k: f"{v*100:.1f}% ({d})" for k, (v, d) in n.m.items() if v < minimo and k not in salvo}
    assert not flojas, f"se movió algo más: {flojas}"
    return n

def d_texto(r, orig, sale):
    a, b = F._docx_modelo(orig), F._docx_modelo(sale)
    ta = [p["texto"] for p in a["parrafos"]]; tb = [p["texto"] for p in b["parrafos"]]
    if r["info"].get("sinTexto"): return "(sin texto que editar)"
    con = [t for t in tb if "EDITADO-EN-NOM" in t]
    assert len(con) == 1, f"el texto editado aparece {len(con)} veces"
    assert con[0].replace(" EDITADO-EN-NOM ", "") in ta, "el párrafo editado no conserva el resto de su texto"
    assert len(ta) == len(tb), f"cambió el número de párrafos: {len(ta)} -> {len(tb)}"
    distintos = sum(1 for x, y in zip(ta, tb) if x != y)
    assert distintos == 1, f"cambiaron {distintos} párrafos (debía ser 1)"
    # el párrafo editado conserva su formato de párrafo
    i = tb.index(con[0])
    assert a["parrafos"][i]["pa"] == b["parrafos"][i]["pa"], f"cambió el formato del párrafo editado: {a['parrafos'][i]['pa']} -> {b['parrafos'][i]['pa']}"
    n = _d_resto(orig, sale, 0.97, salvo=("texto", "parrafos", "vínculos"))
    return f"1 de {len(tb)} párrafos cambió; resto {n.total()*100:.1f}%"

def d_agregar(r, orig, sale):
    a, b = F._docx_modelo(orig), F._docx_modelo(sale)
    ta = [p["texto"] for p in a["parrafos"]]; tb = [p["texto"] for p in b["parrafos"]]
    assert "Título agregado en NOM" in tb and "Párrafo nuevo con negrita y color." in tb and "Primer punto" in tb and "Segundo punto" in tb and tb[-1].endswith("Cierre"), tb[-6:]
    pt = b["parrafos"][tb.index("Título agregado en NOM")]
    assert pt["pa"].get("titulo") == "1", f"el título no quedó como Título 1: {pt['pa']}"
    pn = b["parrafos"][tb.index("Párrafo nuevo con negrita y color.")]
    k = pn["texto"].index("negrita")
    assert pn["letras"][k].get("b") and not pn["letras"][0].get("b") and pn["letras"][-1].get("color") == "C2372B", "formato de letra del párrafo nuevo"
    assert b["parrafos"][tb.index("Primer punto")]["pa"].get("lista"), "la lista nueva no quedó como lista"
    # todo lo que ya estaba sigue estando, en el mismo orden
    it = iter(tb)
    faltan = [t for t in ta if t.strip() and not any(t == u for u in it)]
    assert not faltan, f"se perdieron párrafos: {faltan[:3]}"
    n = _d_resto(orig, sale, 0.97, salvo=("texto", "parrafos"))
    return f"{len(ta)} -> {len(tb)} párrafos; resto {n.total()*100:.1f}%"

def d_borrar(r, orig, sale):
    a, b = F._docx_modelo(orig), F._docx_modelo(sale)
    ta = [p["texto"] for p in a["parrafos"]]; tb = [p["texto"] for p in b["parrafos"]]
    borrado = r["info"]["borrado"].replace("\ufffc", "").replace("\u2028", "\n")
    if not borrado.strip(): return "(sin texto que borrar)"
    assert ta.count(borrado) - tb.count(borrado) == 1, f"el párrafo borrado sigue: {borrado[:40]!r} ({ta.count(borrado)} -> {tb.count(borrado)})"
    assert len(tb) in (len(ta) - 1, len(ta)), f"párrafos: {len(ta)} -> {len(tb)}"
    _d_resto(orig, sale, 0.97, salvo=("texto", "parrafos", "notas al pie", "vínculos", "imágenes", "ecuaciones"))
    return f"{len(ta)} -> {len(tb)} párrafos"

PPTX_VARIOS = ["ms-tipico.pptx", "ms-brownbag.pptx", "ms-of16.pptx", "ms-animacion.pptx", "ms-organigrama.pptx", "ms-tabla-grande.pptx", "poi-temas.pptx", "poi-formas.pptx", "ms-presentation.pptx"]

def _textos(pres):
    from pptx import Presentation
    r = []
    for sl in pres.slides:
        ts = []
        def rec(shapes):
            for s in shapes:
                if s.shape_type == 6 and hasattr(s, "shapes"): rec(s.shapes); continue
                ts.append((s.text_frame.text if getattr(s, "has_text_frame", False) and s.has_text_frame else "", s.shape_type, s.left, s.top, s.width, s.height))
        rec(sl.shapes); r.append(ts)
    return r

def _p_resto(orig, sale, salvo=(), minimo=0.9):
    n = F.comparar_pptx(orig, sale)
    flojas = {k: f"{v*100:.1f}% ({d})" for k, (v, d) in n.m.items() if v < minimo and k not in salvo}
    assert not flojas, f"se movió algo más: {flojas}"
    return n

def p_texto(r, orig, sale):
    from pptx import Presentation
    if r["info"].get("sinTexto"): return "(sin cuadros de texto)"
    a, b = Presentation(orig), Presentation(sale)
    ta, tb = _textos(a), _textos(b)
    pg = r["info"]["pagina"]
    assert len(ta) == len(tb), f"diapositivas {len(ta)} -> {len(tb)}"
    assert any("Texto cambiado en NOM" in t[0] for t in tb[pg]), "no aparece el texto nuevo"
    for i, (x, y) in enumerate(zip(ta, tb)):
        if i == pg:
            assert len(x) == len(y), f"en la diapositiva editada cambió el número de figuras: {len(x)} -> {len(y)}"
            dif = sum(1 for p, q in zip(sorted(t[0] for t in x), sorted(t[0] for t in y)) if p != q)
            assert dif <= 2, f"cambiaron {dif} textos en la diapositiva editada"
        else:
            assert x == y, f"cambió la diapositiva {i + 1}, que no se tocó"
    n = _p_resto(orig, sale, salvo=("texto", "negrita y cursiva", "tamaño de letra", "color de letra", "alineación del texto"))
    return f"diapositiva {pg + 1} de {len(tb)}; resto {n.total()*100:.1f}%"

def p_mover(r, orig, sale):
    from pptx import Presentation
    if r["info"].get("sinFigura"): return "(sin figuras)"
    a, b = Presentation(orig), Presentation(sale)
    ta, tb = _textos(a), _textos(b)
    pg, tam = r["info"]["pagina"], r["info"]["tam"]
    ex, ey = round(37 / tam["w"] * a.slide_width), round(41 / tam["h"] * a.slide_height)
    tol = a.slide_width * 0.004
    assert any(t[2] is not None and abs(t[2] - ex) < tol and abs(t[3] - ey) < tol for t in tb[pg]), f"ninguna figura quedó en ({ex}, {ey}): {[(t[2], t[3]) for t in tb[pg]][:6]}"
    for i, (x, y) in enumerate(zip(ta, tb)):
        if i != pg: assert x == y, f"cambió la diapositiva {i + 1}, que no se tocó"
        else: assert len(y) >= len(x), f"figuras en la diapositiva editada: {len(x)} -> {len(y)}"
    s0 = b.slides[0]
    assert s0.has_notes_slide and "Nota escrita en NOM-COLAB" in s0.notes_slide.notes_text_frame.text, "las notas no quedaron"
    n = _p_resto(orig, sale, salvo=("posición y tamaño", "notas del orador"))
    return f"figura movida en la {pg + 1}; notas puestas; resto {n.total()*100:.1f}%"

def p_agregar(r, orig, sale):
    from pptx import Presentation
    a, b = Presentation(orig), Presentation(sale)
    ta, tb = _textos(a), _textos(b)
    antes, quito = r["info"]["antes"], r["info"]["quito"]
    assert len(tb) == antes + (0 if quito else 1), f"diapositivas {len(ta)} -> {len(tb)}"
    ult = tb[-1]
    assert any("Diapositiva nueva de NOM" in t[0] for t in ult) and any("Círculo" in t[0] for t in ult), f"la diapositiva nueva no trae su contenido: {[t[0] for t in ult]}"
    for i in range(len(tb) - 1):
        assert ta[i] == tb[i], f"cambió la diapositiva {i + 1}, que no se tocó"
    return f"{len(ta)} -> {len(tb)} diapositivas"

CASOS = {
    "xlsx": [
        ("cambiar celdas y agregar una fórmula", ["ms-financial-sample.xlsx", "ms-complex01.xlsx", "ms-excel14.xlsx", "poi-formato-condicional.xlsx", "ms-dinamica-b1.xlsx", "poi-graficas.xlsx"], """
            const h = "hoja-p1";
            doc.cambiar(h, { "c:B2": "Editado en NOM-COLAB", "n:B2": true, "c:AZ300": "1234.5", "c:AZ301": "=SUMA(AZ300:AZ300)*2" });
            return {};""", x_valor),
        ("renombrar una hoja y agregar otra", ["ms-financial-sample.xlsx", "ms-hojas.xlsx", "ms-complex01.xlsx", "poi-estilos.xlsx"], """
            doc.cambiar("hoja-p1", { nombre: "Renombrada por mí" });
            const pags = doc.paginas().concat(["pz"]);
            doc.cambiar("_doc", { paginas: pags });
            doc.cambiar("hoja-pz", { tipo: "tabla", pagina: "pz", orden: 0, x: 40, y: 40, w: 880, h: 300, filas: 30, cols: 10, nombre: "Hoja nueva", "c:A1": "Total", "n:A1": true, "c:B1": "42" });
            return {};""", x_hojas),
        ("borrar una hoja", ["ms-hojas.xlsx", "ms-complex01.xlsx"], """
            doc.cambiar("hoja-p2", { eliminado: true });
            doc.cambiar("_doc", { paginas: doc.paginas().filter((p) => p !== "p2") });
            return {};""", x_borrar_hoja),
        ("solo formato: relleno, ancho de columna y filas fijas", ["ms-financial-sample.xlsx", "ms-rendimiento.xlsx", "poi-estilos.xlsx"], """
            const b = doc.bloque("hoja-p1");
            const ref = Object.keys(b).filter((k) => k.startsWith("c:") && /^c:[A-F]\\d$/.test(k)).sort()[0].slice(2);
            doc.cambiar("hoja-p1", { ["r:" + ref]: "#FFE599", "aw:C": 200, fijasF: 2 });
            return { ref };""", x_formato),
    ],
    "docx": [
        ("cambiar el texto de un párrafo", DOCX_VARIOS, JS_TEXTO + """
            const vis = sec.visibles();
            // el primer párrafo con al menos 12 letras seguidas
            let i = 0, n = 0;
            for (; i < vis.length; i++) { if (vis[i].e || vis[i].c === "\\n") n = 0; else if (++n >= 12) break; }
            if (i >= vis.length) { i = 0; n = 0; for (; i < vis.length; i++) { if (vis[i].e || vis[i].c === "\\n") n = 0; else if (++n >= 2) break; } }
            if (i >= vis.length) return { sinTexto: true };
            doc.seq("cuerpo", { k: "i", iz: vis[i].id, x: " EDITADO-EN-NOM " });
            return { antes: vis.length };""", d_texto),
        ("agregar al final un título, un párrafo y una lista", DOCX_VARIOS, JS_TEXTO + """
            const vis = sec.visibles();
            let iz = vis.length ? vis[vis.length - 1].id : null;
            const pon = (x, a) => { const r = doc.seq("cuerpo", Object.assign({ k: "i", iz, x }, a ? { a } : {})); const u = doc.secuencia("cuerpo").visibles(); iz = u[u.length - 1].id; };
            // Enter al final, como en el editor: la marca nueva copia el formato del párrafo
            pon("\\n", Object.assign({}, NOM.Secuencia.attrs(sec.fin))); pon("Título agregado en NOM"); pon("\\n", { estilo: "h1" });
            pon("Párrafo nuevo con "); pon("negrita", { b: true }); pon(" y color.", { color: "#C2372B" }); pon("\\n");
            pon("Primer punto"); pon("\\n", { lista: "numeros" }); pon("Segundo punto"); pon("\\n", { lista: "numeros" });
            pon("Cierre");
            return {};""", d_agregar),
        ("borrar el primer párrafo con texto", DOCX_VARIOS, JS_TEXTO + """
            const vis = sec.visibles();
            let a = 0; while (a < vis.length && (vis[a].c === "\\n" || vis[a].e)) a++;
            let b = a; while (b < vis.length && vis[b].c !== "\\n") b++;
            const borrado = vis.slice(a, b).map((x) => x.c).join("");
            doc.seq("cuerpo", { k: "v", v: false, r: NOM.Secuencia.rangos(vis.slice(a, Math.min(b + 1, vis.length))) });
            return { borrado };""", d_borrar),
    ],
    "pptx": [
        ("cambiar el texto de un cuadro", PPTX_VARIOS, """
            const b = doc.vivos().filter((x) => x.tipo === "texto" && x.html && x.pagina).sort((x, y) => (doc.paginas().indexOf(x.pagina) - doc.paginas().indexOf(y.pagina)) || (x.z || 0) - (y.z || 0))[0];
            if (!b) return { sinTexto: true };
            doc.cambiar(b.id, { html: "<div><b>Texto cambiado en NOM</b> y más</div>" });
            return { pagina: doc.paginas().indexOf(b.pagina) };""", p_texto),
        ("mover una figura y poner notas", PPTX_VARIOS, """
            const b = doc.vivos().filter((x) => x.pagina && x.x != null && (x.tipo === "forma" || x.tipo === "imagen" || x.tipo === "texto"))[0];
            if (!b) return { sinFigura: true };
            doc.cambiar(b.id, { x: 37, y: 41 });
            doc.cambiar("_doc", { ["nota:" + doc.paginas()[0]]: "Nota escrita en NOM-COLAB" });
            return { pagina: doc.paginas().indexOf(b.pagina), tam: NOM.diapo.tam(doc) };""", p_mover),
        ("agregar una diapositiva y borrar otra", PPTX_VARIOS, """
            const pags = doc.paginas(), quitada = pags.length > 1 ? pags[pags.length - 1] : null;
            if (quitada) doc.deLaPagina(quitada).forEach((b) => doc.cambiar(b.id, { eliminado: true }));
            const nuevas = pags.filter((p) => p !== quitada).concat(["pz"]);
            doc.cambiar("_doc", { paginas: nuevas });
            doc.cambiar("nz1", { tipo: "texto", pagina: "pz", orden: 1, z: 1, x: 80, y: 60, w: 600, h: 80, estilo: "h1", html: "Diapositiva nueva de NOM" });
            doc.cambiar("nz2", { tipo: "forma", figura: "elipse", pagina: "pz", orden: 2, z: 2, x: 200, y: 220, w: 220, h: 140, color: "#F06A3D", texto: "Círculo" });
            return { antes: pags.length, quito: !!quitada };""", p_agregar),
    ],
}


def abre_office(ruta):
    """LibreOffice tiene que poder abrir el archivo y volverlo a guardar."""
    carpeta = SALIDA / "lo"; carpeta.mkdir(parents=True, exist_ok=True)
    ext = Path(ruta).suffix[1:]
    destino = carpeta / (Path(ruta).stem + ".pdf")
    if destino.exists(): destino.unlink()
    subprocess.run(["soffice", f"-env:UserInstallation=file://{F.CACHE / 'lo-perfil'}", "--headless", "--convert-to", "pdf", "--outdir", str(carpeta), str(ruta)],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=240)
    return destino.exists() and destino.stat().st_size > 800


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", choices=["docx", "xlsx", "pptx"])
    ap.add_argument("--office", action="store_true", help="abrir también cada resultado con LibreOffice")
    a = ap.parse_args()
    SALIDA.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright
    bien = mal = 0
    with sync_playwright() as pw:
        nav = pw.chromium.launch(); pag = nav.new_page()
        errores = []
        pag.on("pageerror", lambda e: errores.append(str(e)))
        pag.goto(F.BASE + "/"); pag.wait_for_function("() => window.NOM && NOM.ooxml && NOM.formatos && NOM.formatos.docDeOps", timeout=30000)
        for ext, casos in CASOS.items():
            if a.solo and a.solo != ext: continue
            for titulo, archivos, edicion, revisar in casos:
                print(f"== {ext}: {titulo}")
                for nombre in archivos:
                    orig = F.CORPUS / ext / nombre
                    if not orig.exists(): print(f"   (falta {nombre})"); continue
                    r = pag.evaluate(JS, [base64.b64encode(orig.read_bytes()).decode(), nombre, edicion])
                    if r.get("error"): mal += 1; print(f"   MAL  {nombre}: {r['error'][:300]}"); continue
                    for sufijo, clave in (("", "salida"), (".desde-nom", "salidaNom")):
                        sale = SALIDA / (Path(nombre).stem + "." + re.sub(r"\W+", "-", titulo)[:24] + sufijo + "." + ext)
                        sale.write_bytes(base64.b64decode(r[clave]))
                        try:
                            assert zipfile.ZipFile(sale).testzip() is None, "zip dañado"
                            det = revisar(r, orig, sale)
                            if a.office and not sufijo: assert abre_office(sale), "LibreOffice no pudo abrirlo"
                            bien += 1
                            print(f"   ok   {nombre}{' (vía .nom)' if sufijo else ''}: {det}; {orig.stat().st_size//1024} KB -> {sale.stat().st_size//1024} KB{'' if sufijo else f', .nom {r['nom']//1024} KB'}")
                        except AssertionError as e:
                            mal += 1; print(f"   MAL  {nombre}{' (vía .nom)' if sufijo else ''}: {e}")
                        except Exception as e:
                            mal += 1; print(f"   MAL  {nombre}{' (vía .nom)' if sufijo else ''}: {type(e).__name__}: {str(e)[:260]}")
        nav.close()
    print(f"\nEdiciones: {bien} bien, {mal} mal. Errores de JavaScript: {errores[:3]}")
    sys.exit(1 if mal else 0)


if __name__ == "__main__":
    main()
