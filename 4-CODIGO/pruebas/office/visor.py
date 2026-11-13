#!/usr/bin/env python3
"""Compara a ojo cómo se VE un archivo de Office en NOM-COLAB contra cómo lo pinta LibreOffice.

Por cada archivo: lo importa en la página (como "Importar"), abre el editor, toma una captura de la
primera página / diapositiva / hoja, lo convierte a PDF con LibreOffice y arma una imagen con las dos
lado a lado (izquierda LibreOffice, derecha NOM-COLAB) en la carpeta de salida. También anota si la
página tuvo errores de JavaScript y cuánto del texto del original quedó en el documento.

  ~/.cache/nom-pruebas/venv/bin/python pruebas/office/visor.py SALIDA archivo1.docx archivo2.pptx …
  ... visor.py SALIDA --movil archivos…        (pantalla de celular)
"""
import argparse, base64, os, re, subprocess, sys, tempfile, zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "interfaz"))
import nomprueba as N

JS_IMPORTAR = r"""
async ([b64, nombre, espacio]) => {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const r = await NOM.formatos.importar(new File([bytes], nombre));
  const d = await NOM.api.post(`/api/espacios/${espacio}/documentos`, { nombre: r.nombre, modo: r.modo, ops: NOM.DocCRDT.partir(r.ops) });
  location.hash = "#/doc/" + d.id;
  return { id: d.id, modo: r.modo, aviso: r.aviso || null };
}
"""
JS_TEXTO_MODELO = r"""() => {
  const doc = NOM.editorActual.doc, partes = [];
  for (const b of doc.vivos()) {
    if (b.id === '_origen' || String(b.id).startsWith('_origen')) continue;
    for (const [k, v] of Object.entries(b)) if (typeof v === 'string' && (k === 'html' || k === 'texto' || k.startsWith('c:') || k === 'titulo')) partes.push(v.replace(/<[^>]+>/g, ' '));
    // el texto de los objetos (cuadros de texto, formas, SmartArt) va dentro del objeto: también cuenta
    if (doc.tieneSecuencia && doc.tieneSecuencia(b.id)) partes.push(doc.secuencia(b.id).visibles().map(x => x.e ? ' ' + (x.e.txt || x.e.texto || '') + ' ' : x.c).join(''));
  }
  // y lo que se ve en el editor (el texto de un documento de Word vive en su secuencia, que no siempre es un bloque vivo)
  const vista = [...document.querySelectorAll('[contenteditable], .wd-pagina, .diapo, .rejilla-hoja')].map(e => e.innerText || '').join(' ');
  return partes.join(' ') + ' ' + vista;
}"""


def texto_original(f):
    """Palabras del archivo de Office (de su XML), sin importar el programa."""
    z = zipfile.ZipFile(f)
    nombres = [n for n in z.namelist() if re.match(r"(word/(document|footnotes|header\d*|footer\d*)\.xml|xl/sharedStrings\.xml|xl/worksheets/sheet\d+\.xml|ppt/slides/slide\d+\.xml)$", n)]
    txt = []
    for n in nombres:
        x = z.read(n).decode("utf8", "ignore")
        txt += re.findall(r"<(?:w:t|a:t|t)(?:\s[^>]*)?>([^<]*)</(?:w:t|a:t|t)>", x)
    return " ".join(txt)


def palabras(s):
    return [w.lower() for w in re.findall(r"[A-Za-zÁÉÍÓÚÑáéíóúñü0-9]{3,}", s)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("salida"); ap.add_argument("archivos", nargs="+"); ap.add_argument("--movil", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.salida, exist_ok=True)
    from PIL import Image
    from playwright.sync_api import sync_playwright
    c = N.cuenta(); e = N.espacio(c["token"], "Visor")
    filas = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        opc = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2) if a.movil else dict(viewport={"width": 1400, "height": 1000})
        p = b.new_context(**opc).new_page()
        errores = []
        p.on("pageerror", lambda x: errores.append(str(x)[:200]))
        p.goto(N.B + "/"); p.wait_for_selector("#u")
        p.fill("#u", c["nombre"]); p.fill("#c", N.CL); p.click("button[type=submit]")
        p.wait_for_function("() => !!localStorage.getItem('nom.token')"); p.wait_for_timeout(2500)
        for f in map(Path, a.archivos):
            n0 = len(errores)
            try:
                r = p.evaluate(JS_IMPORTAR, [base64.b64encode(f.read_bytes()).decode(), f.name, e])
                p.wait_for_function("() => window.NOM && NOM.editorActual && NOM.editorActual.vista && NOM.editorActual.vista.isConnected && !NOM.editorActual.doc.pendientes.length", timeout=90000)
                p.wait_for_timeout(1800)
                p.evaluate("() => document.querySelectorAll('.velo, .consejo').forEach(v => v.remove())")
                nom_png = os.path.join(a.salida, f.stem + "-nom.png"); p.screenshot(path=nom_png)
                mod = p.evaluate(JS_TEXTO_MODELO)
                po, pm = palabras(texto_original(f)), set(palabras(mod))
                cobertura = (sum(1 for w in po if w in pm) / len(po)) if po else 1.0
                # LibreOffice: primera página
                tmp = tempfile.mkdtemp()
                pr = subprocess.Popen(["soffice", "--headless", "-env:UserInstallation=file://" + os.path.expanduser("~/.cache/nom-pruebas/lo-perfil-visor"), "--convert-to", "pdf", "--outdir", tmp, str(f)],
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
                try: pr.wait(timeout=120)
                except subprocess.TimeoutExpired:
                    import signal; os.killpg(pr.pid, signal.SIGKILL); pr.wait()
                pdf = os.path.join(tmp, f.stem + ".pdf")
                lo_png = os.path.join(a.salida, f.stem + "-lo")
                subprocess.run(["pdftoppm", "-png", "-r", "80", "-f", "1", "-l", "1", "-singlefile", pdf, lo_png], capture_output=True, timeout=60)
                lo_png += ".png"
                if os.path.exists(lo_png):
                    i1, i2 = Image.open(lo_png).convert("RGB"), Image.open(nom_png).convert("RGB")
                    h = max(i1.height, i2.height)
                    i1 = i1.resize((int(i1.width * min(1, 1000 / i1.height)), int(i1.height * min(1, 1000 / i1.height))))
                    lienzo = Image.new("RGB", (i1.width + i2.width + 20, max(i1.height, i2.height)), "white")
                    lienzo.paste(i1, (0, 0)); lienzo.paste(i2, (i1.width + 20, 0))
                    lienzo.save(os.path.join(a.salida, f.stem + "-lado-a-lado.png"))
                nuevos = errores[n0:]
                ok = not nuevos and cobertura >= 0.9
                filas.append((f.name, r["modo"], cobertura, nuevos, r["aviso"]))
                print(f"{'ok ' if ok else 'MAL'} {f.name:46} {r['modo']:13} texto del original en el documento: {cobertura * 100:5.1f}%  "
                      f"{'aviso: ' + r['aviso'][:80] if r['aviso'] else ''} {'JS: ' + nuevos[0] if nuevos else ''}", flush=True)
            except Exception as ex:
                filas.append((f.name, "?", 0, [str(ex)[:200]], None))
                print(f"MAL {f.name}: {type(ex).__name__}: {str(ex)[:250]}", flush=True)
            p.goto(N.B + "/#/"); p.wait_for_timeout(500)
        b.close()
    mal = [x for x in filas if x[3] or x[2] < 0.9]
    print(f"\nVisor: {len(filas) - len(mal)} bien, {len(mal)} con algo que revisar. Capturas lado a lado en {a.salida}")
    sys.exit(1 if mal else 0)


if __name__ == "__main__":
    main()
