"""Imprime plan.html a PDF tamaño carta con Chromium (Playwright), con el número de página en el
pie y el índice con la página de cada título.

    ~/.cache/nom-pruebas/venv/bin/python imprimir.py            # deja ../../ENTREGA/5IM7_WACK_PP.pdf
    ~/.cache/nom-pruebas/venv/bin/python imprimir.py salida.pdf

Pasos: 1) imprime una vez, 2) busca en qué página quedó cada título (pdftotext), 3) escribe esas
páginas en el índice y vuelve a imprimir, 4) deja la portada y la subportada sin pie de página (mutool).
"""
import base64, os, re, subprocess, sys, tempfile, unicodedata
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
ENTRADA = os.path.join(AQUI, "plan.html")
SALIDA = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "..", "..", "ENTREGA", "5IM7_WACK_PP.pdf"))
IMG = os.path.join(AQUI, "..", "imagenes")

def datos(nombre, tipo):
    return f"data:{tipo};base64," + base64.b64encode(open(os.path.join(IMG, nombre), "rb").read()).decode()

PIE = f"""
<div style="width:100%;margin:0 2.3cm;display:flex;align-items:center;justify-content:space-between;font-family:Carlito,Arial,sans-serif;-webkit-print-color-adjust:exact;">
  <div style="display:flex;align-items:center;gap:6px;">
    <img src="{datos('logo-cecyt9.png','image/png')}" style="height:22px">
    <img src="{datos('logo-ipn.jpg','image/jpeg')}" style="height:22px">
    <div style="line-height:1.15;margin-left:3px;"><div style="font-size:8px;font-weight:700;color:#1F1B24;">PRUEBAS DE SOFTWARE</div>
    <div style="font-size:7.5px;color:#5E5A66;">CECyT 9 Juan de Dios Bátiz</div></div>
  </div>
  <div style="font-size:8px;color:#5E5A66;">Plan de pruebas · NOM-COLAB · 5IM7 · Equipo 6 “WACK”</div>
  <div style="width:22px;height:22px;border-radius:50%;background:#F2B705;color:#1F1B24;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;"><span class="pageNumber"></span></div>
</div>"""

def imprimir(pagina, ruta, pie=True):
    pagina.pdf(path=ruta, format="Letter", print_background=True, prefer_css_page_size=True,
               display_header_footer=pie, header_template="<span></span>", footer_template=PIE if pie else "<span></span>")

def normal(t):
    t = unicodedata.normalize("NFKD", t)
    return re.sub(r"\s+", " ", "".join(c for c in t if not unicodedata.combining(c))).strip().lower()

def paginas_de(ruta, titulos, desde):
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", ruta], capture_output=True, text=True).stdout).group(1))
    textos = [normal(subprocess.run(["pdftotext", "-f", str(i), "-l", str(i), "-layout", ruta, "-"], capture_output=True, text=True).stdout) for i in range(1, n + 1)]
    res = {}; i0 = desde
    for hid, t in titulos.items():          # en orden: cada título va en la misma página o después del anterior
        clave = normal(t)[:38]
        for i in range(i0, n + 1):
            if clave in textos[i - 1]:
                res[hid] = i; i0 = i; break
    return res, n

with sync_playwright() as p, tempfile.TemporaryDirectory() as tmp:
    nav = p.chromium.launch()
    pag = nav.new_page()
    pag.goto("file://" + ENTRADA)
    pag.evaluate("document.fonts.ready")
    pag.wait_for_timeout(600)
    titulos = pag.evaluate("Object.fromEntries([...document.querySelectorAll('[data-para]')].map(e => [e.dataset.para, document.getElementById(e.dataset.para).textContent]))")
    pag_indice = 3; sin_pie = 2
    borrador = os.path.join(tmp, "1.pdf")
    imprimir(pag, borrador)
    nums, _ = paginas_de(borrador, titulos, pag_indice + 1)
    faltan = [titulos[k] for k in titulos if k not in nums]
    if faltan: print("aviso: no se encontró la página de", faltan)
    pag.evaluate("n => document.querySelectorAll('[data-para]').forEach(e => e.textContent = n[e.dataset.para] || '')", nums)
    completo = os.path.join(tmp, "2.pdf"); portada = os.path.join(tmp, "p.pdf")
    imprimir(pag, completo)
    imprimir(pag, portada, pie=False)
    nums2, total = paginas_de(completo, titulos, pag_indice + 1)
    if nums2 != nums: print("aviso: las páginas cambiaron al llenar el índice", nums, nums2)
    nav.close()
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    # mutool conserva compartidas las imágenes que se repiten (logos del pie y de las fichas);
    # pdfunite las copiaría una vez por hoja y el PDF pesaría varias veces más.
    unido = os.path.join(tmp, "unido.pdf")
    subprocess.run(["mutool", "merge", "-o", unido, portada, f"1-{sin_pie}", completo, f"{sin_pie + 1}-{total}"], check=True)
    subprocess.run(["mutool", "clean", "-gggg", "-z", unido, SALIDA], check=True)
    print("listo:", SALIDA, f"({total} páginas)")
