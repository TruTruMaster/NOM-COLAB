#!/usr/bin/env python3
"""Importar y exportar Office pasando por la aplicación de verdad: cuenta, espacio en el
servidor, el editor abierto, recargar la página y descargar.

Revisa lo que `fidelidad.py` no ve: que abrir el documento en el editor, mandarlo al servidor y
volverlo a traer no le cambie nada (si cambiara, al exportar ya no saldría igual que el original).

  ~/.cache/nom-pruebas/venv/bin/python pruebas/office/prueba_ui.py                # Chromium de escritorio
  ... prueba_ui.py --movil                                                       # mismo, con pantalla de celular
  ... prueba_ui.py --cdp http://localhost:9222 --base http://192.168.0.56:8099   # el Chrome o la app del teléfono
        (antes: adb forward tcp:9222 localabstract:chrome_devtools_remote
              o adb forward tcp:9222 localabstract:webview_devtools_remote_<pid> para la app)
"""
import argparse, base64, os, random, string, sys, time, json, urllib.request, zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fidelidad as F

ARCHIVOS = ["docx/ms-complex2010.docx", "docx/ms-hoja-informativa.docx", "docx/poi-notas-al-pie.docx",
            "xlsx/ms-financial-sample.xlsx", "xlsx/ms-complex01.xlsx", "xlsx/poi-formato-condicional.xlsx",
            "pptx/ms-tipico.pptx", "pptx/ms-animacion.pptx", "pptx/poi-temas.pptx"]
CL = "Clave-Segura-123"

JS_IMPORTAR = r"""
async ([b64, nombre, espacio]) => {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const t0 = performance.now();
  const r = await NOM.formatos.importar(new File([bytes], nombre));
  const ms = Math.round(performance.now() - t0);
  const d = await NOM.api.post(`/api/espacios/${espacio}/documentos`, { nombre: r.nombre, modo: r.modo, ops: NOM.DocCRDT.partir(r.ops) });
  location.hash = "#/doc/" + d.id;
  return { id: d.id, ms, aviso: r.aviso || null };
}
"""
JS_LISTO = "() => !!(window.NOM && NOM.editorActual && NOM.editorActual.doc && NOM.editorActual.vista && NOM.editorActual.vista.isConnected && !NOM.editorActual.doc.pendientes.length)"
JS_EXPORTAR = r"""
async (ext) => {
  const doc = NOM.editorActual.doc;
  const aB64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const t0 = performance.now();
  const sale = ext === "docx" ? NOM.ooxml.docx(doc) : ext === "xlsx" ? NOM.ooxml.xlsx(doc) : NOM.ooxml.pptx(doc, false);
  const ms = Math.round(performance.now() - t0);
  const nom = NOM.formatos.aNomBytes(doc);
  return { salida: aB64(sale), ms, nom: nom.length, origen: !!NOM.origen.leer(doc), bloques: Object.keys(doc.estado.bloques).length };
}
"""


def api(base, m, u, b=None, t=None):
    h = {"Content-Type": "application/json"}
    if t: h["Authorization"] = "Bearer " + t
    q = urllib.request.Request(base + u, method=m, data=json.dumps(b).encode() if b is not None else None, headers=h)
    with urllib.request.urlopen(q, timeout=30) as x:
        c = x.read(); return json.loads(c) if c[:1] in b"{[" else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=F.BASE, help="dirección del servidor vista desde el navegador que se prueba")
    ap.add_argument("--api", default=None, help="dirección del servidor vista desde esta computadora (por omisión, la misma)")
    ap.add_argument("--cdp", help="conectarse a un navegador ya abierto (el del teléfono) en vez de abrir Chromium")
    ap.add_argument("--movil", action="store_true")
    ap.add_argument("--etiqueta", default="escritorio")
    ap.add_argument("archivos", nargs="*")
    a = ap.parse_args()
    base_api = a.api or a.base
    salida = F.CACHE / ("office-ui-" + a.etiqueta); salida.mkdir(parents=True, exist_ok=True)
    nombre = "u" + "".join(random.choice(string.ascii_lowercase) for _ in range(7))
    api(base_api, "POST", "/api/cuentas/registro", {"nombre": nombre, "contrasena": CL, "acepto": "2026-11-13"})
    tok = api(base_api, "POST", "/api/cuentas/sesion", {"nombre": nombre, "contrasena": CL})["token"]
    esp = api(base_api, "POST", "/api/espacios", {"nombre": "Pruebas de Office"}, tok)["id"]
    from playwright.sync_api import sync_playwright
    bien = mal = 0
    with sync_playwright() as pw:
        if a.cdp:
            nav = pw.chromium.connect_over_cdp(a.cdp)
            ctx = nav.contexts[0]
            pag = ctx.new_page() if not os.environ.get("NOM_USAR_PESTANA") else ctx.pages[0]
        else:
            nav = pw.chromium.launch()
            ctx = nav.new_context(**(dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2) if a.movil else dict(viewport={"width": 1400, "height": 900})))
            pag = ctx.new_page()
        errores = []
        pag.on("pageerror", lambda e: errores.append(str(e)[:200]))
        pag.goto(a.base + "/")
        pag.wait_for_function("() => window.NOM && NOM.api && NOM.formatos", timeout=40000)
        # sesión: por la pantalla de entrada, con usuario y contraseña
        pag.evaluate("() => { try { NOM.api.limpiarSesion(); } catch (e) {} }")
        pag.goto(a.base + "/"); pag.wait_for_selector("#u", timeout=40000)
        pag.fill("#u", nombre); pag.fill("#c", CL); pag.click("button[type=submit]")
        pag.wait_for_function("() => !!localStorage.getItem('nom.token')", timeout=40000)
        pag.wait_for_timeout(900)
        info = pag.evaluate("() => ({ ua: navigator.userAgent, app: !!window.NomAndroid, ancho: innerWidth })")
        print(f"Navegador: {info['ua'][:110]} | app={info['app']} | ancho={info['ancho']}px")
        for rel in (a.archivos or ARCHIVOS):
            f = F.CORPUS / rel
            ext = f.suffix[1:]
            try:
                t0 = time.time()
                r = pag.evaluate(JS_IMPORTAR, [base64.b64encode(f.read_bytes()).decode(), f.name, esp])
                pag.wait_for_function(JS_LISTO, timeout=60000)
                pag.wait_for_timeout(700)
                e1 = pag.evaluate(JS_EXPORTAR, ext)
                # recargar: ahora el documento viene completo del servidor
                pag.reload(); pag.wait_for_function(JS_LISTO, timeout=60000); pag.wait_for_timeout(700)
                e2 = pag.evaluate(JS_EXPORTAR, ext)
                s1 = salida / ("abierto-" + f.name); s1.write_bytes(base64.b64decode(e1["salida"]))
                s2 = salida / ("recargado-" + f.name); s2.write_bytes(base64.b64decode(e2["salida"]))
                assert e1["origen"] and e2["origen"], "el documento perdió su archivo de origen"
                cmp = {"docx": F.comparar_docx, "xlsx": F.comparar_xlsx, "pptx": F.comparar_pptx}[ext]
                za, zb = F.partes_zip(f), F.partes_zip(s2)
                iguales = sum(1 for k, v in za.items() if zb.get(k) == v)
                try:
                    n1, n2 = cmp(f, s1), cmp(f, s2)
                except Exception as ex:
                    # Algunas bibliotecas de Python no leen archivos reales raros (openpyxl con ciertos filtros):
                    # entonces cuenta que cada parte salga idéntica byte por byte.
                    print(f"      (la biblioteca de Python no lee el original: {type(ex).__name__}; se comparan las partes)")
                    n1 = n2 = F.Nota(); n1.pon("partes", iguales / max(1, len(za)))
                ok = n1.total() > 0.9995 and n2.total() > 0.9995 and iguales == len(za)
                bien += ok; mal += not ok
                print(f"{'ok ' if ok else 'MAL'} {f.name:34} abierto {n1.total()*100:5.1f}%  recargado {n2.total()*100:5.1f}%  partes idénticas {iguales}/{len(za)}  "
                      f"importar {r['ms']} ms, exportar {e2['ms']} ms, .nom {e2['nom']//1024} KB (original {f.stat().st_size//1024} KB)  [{time.time()-t0:.0f} s]", flush=True)
                if not ok:
                    for nn in (n1, n2):
                        print("      ", {k: v for k, (v, _) in nn.m.items() if v < 0.9995})
            except Exception as e:
                mal += 1; print(f"MAL {f.name}: {type(e).__name__}: {str(e)[:300]}", flush=True)
        print(f"\nInterfaz ({a.etiqueta}): {bien} bien, {mal} mal. Errores de JavaScript: {errores[:4]}")
        if not a.cdp: nav.close()
        else: pag.close()
    sys.exit(1 if mal else 0)


if __name__ == "__main__":
    main()
