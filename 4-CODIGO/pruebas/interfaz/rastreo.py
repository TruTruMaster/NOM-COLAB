#!/usr/bin/env python3
"""Rastreo de la interfaz: en cada editor (texto, hoja, presentación y diagrama) prepara una
selección, toca CADA botón de la barra, CADA opción de cada menú o panel que abra, y CADA acción de
la ruedita (con sus submenús). Si sale una ventana, llena los campos vacíos y la acepta.

Por cada acción anota: errores de JavaScript, avisos de error en pantalla y si el documento quedó
abierto. No juzga si el resultado es el correcto (eso lo hace prueba_funciones.py): busca que
nada truene ni se quede trabado.

  ~/.cache/nom-pruebas/venv/bin/python pruebas/interfaz/rastreo.py SALIDA            # computadora
  ... rastreo.py SALIDA --movil                                                     # ancho de celular
  ... rastreo.py SALIDA --cdp http://localhost:9222 --base http://IP:8099           # navegador ya abierto
"""
import argparse, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nomprueba as N

APP = os.environ.get("NOM_APP") == "1"
def url(base, h):
    """Dirección de una vista. En la app (WebView) la página es el archivo empaquetado y el servidor se fija aparte."""
    if APP: return "file:///android_asset/index.html" + ("#" + h.split("#", 1)[1] if "#" in h else "")
    return base + h

# Lo que el rastreo no toca (se prueba aparte, porque saca del documento o borra algo).
SALTAR = ["Mandar a la papelera", "Cerrar sesión", "Borrar mi cuenta", "Presentar", "Modo enfoque",
          "Comentarios", "Entendido", "Más opciones del espacio"]

VISIBLES = r"""() => {
  const fuera = (b) => !b.closest('.ed-herramientas, .barra-sup, header.app-barra, .avisos');
  return [...document.querySelectorAll('button, [role=menuitem], [role=option], select, a.btn, input[type=checkbox], input[type=color]')]
    .filter(b => b.offsetParent && fuera(b) && !b.disabled && !b.closest('[hidden]'))
    .map(b => (b.getAttribute('aria-label') || b.title || b.textContent || b.name || b.tagName).trim().replace(/\s+/g, ' ').slice(0, 50))
    .filter(Boolean);
}"""

ESTADO = r"""() => ({
  hash: location.hash,
  hoja: (document.querySelector('.velo .hoja h2') || {}).textContent || null,
  menu: !!document.querySelector('.menu:not(.saliendo)'),
  rueda: !!document.querySelector('.rueda-velo'),
  errores: [...document.querySelectorAll('.avisos .aviso.error span')].map(x => x.textContent),
  editor: !!(window.NOM && NOM.editorActual && NOM.editorActual.vista && NOM.editorActual.vista.isConnected),
})"""


class Rastreo:
    def __init__(self, p, base, salida, etiqueta):
        self.p, self.base, self.salida, self.etq = p, base, salida, etiqueta
        self.errores_js = []
        self.res = []          # (editor, ruta, estado, detalle)
        self.descargas = []
        p.on("pageerror", lambda e: self.errores_js.append(str(e)[:300]))
        p.on("console", lambda m: self.errores_js.append("consola: " + m.text[:300]) if m.type == "error" and "Content Security Policy" not in m.text else None)
        p.on("download", self._descarga)
        p.on("dialog", lambda d: d.accept())
        p.on("popup", lambda pg: (time.sleep(0.5), pg.close()))

    def _descarga(self, d):
        try:
            ruta = os.path.join(self.salida, "descargas", d.suggested_filename)
            os.makedirs(os.path.dirname(ruta), exist_ok=True)
            d.save_as(ruta)
            self.descargas.append((d.suggested_filename, os.path.getsize(ruta)))
        except Exception as e:
            self.descargas.append((d.suggested_filename, "ERROR " + str(e)[:80]))

    # ------------------------------------------------------------ ayudas
    def ev(self, js, *a):
        return self.p.evaluate(js, *a)

    def limpiar(self):
        p = self.p
        for _ in range(3):
            st = self.ev(ESTADO)
            if not (st["hoja"] or st["menu"] or st["rueda"]): break
            p.keyboard.press("Escape"); p.wait_for_timeout(250)
        st = self.ev(ESTADO)
        if st["hoja"]:
            self.ev("() => document.querySelectorAll('.velo').forEach(v => v.remove())")
        # salir de la presentación o del modo enfoque
        self.ev("() => { const r = document.querySelector('.reproductor'); if (r) document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'})); }")

    def volver(self, doc):
        """Si una acción sacó del documento (copia, plantilla…), regresa a él."""
        st = self.ev(ESTADO)
        if st["hash"] != "#/doc/" + doc or not st["editor"]:
            self.p.goto(url(self.base, "/#/doc/" + doc))
            self.p.wait_for_function("() => window.NOM && NOM.editorActual && NOM.editorActual.vista && NOM.editorActual.vista.isConnected", timeout=30000)
            self.p.wait_for_timeout(600)

    def clic_texto(self, texto, dentro=None):
        """Toca el elemento visible (fuera de la barra) cuyo texto o etiqueta empieza igual."""
        return self.ev(r"""([t, d]) => {
          const raiz = d ? document.querySelector(d) : document;
          const fuera = (b) => !b.closest('.ed-herramientas, .barra-sup, header.app-barra, .avisos');
          const els = [...raiz.querySelectorAll('button, [role=menuitem], [role=option], select, a.btn, input[type=checkbox], input[type=color]')]
            .filter(b => b.offsetParent && fuera(b) && !b.disabled && !b.closest('[hidden]'));
          const n = (b) => (b.getAttribute('aria-label') || b.title || b.textContent || b.name || b.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
          const b = els.find(x => n(x) === t);
          if (!b) return false;
          if (b.tagName === 'SELECT') { const o = [...b.options].find(o => !o.selected) || b.options[0]; b.value = o.value; b.dispatchEvent(new Event('change', {bubbles: true})); b.dispatchEvent(new Event('input', {bubbles: true})); return 'select'; }
          if (b.type === 'color') { b.value = '#c0392b'; b.dispatchEvent(new Event('input', {bubbles: true})); b.dispatchEvent(new Event('change', {bubbles: true})); return 'color'; }
          b.scrollIntoView({block: 'nearest'});
          const r = b.getBoundingClientRect();
          return [r.x + r.width / 2, r.y + r.height / 2];
        }""", [texto, dentro])

    def tocar(self, texto, dentro=None):
        r = self.clic_texto(texto, dentro)
        if isinstance(r, list):
            self.p.mouse.click(r[0], r[1])
        return bool(r)

    def aceptar_hoja(self):
        """Si hay una ventana: llena los campos vacíos con algo razonable y la acepta."""
        p = self.p
        st = self.ev(ESTADO)
        if not st["hoja"]: return None
        titulo = st["hoja"]
        nombre = "hoja-" + "".join(ch if ch.isalnum() else "_" for ch in titulo)[:40]
        try: p.screenshot(path=os.path.join(self.salida, f"{self.etq}-{nombre}.png"))
        except Exception: pass
        self.ev(r"""() => {
          const h = document.querySelector('.velo .hoja'); if (!h) return;
          h.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=color]):not([type=range]), textarea').forEach(i => {
            if (i.value || i.readOnly || i.disabled || !i.offsetParent) return;
            const t = (i.type || '').toLowerCase();
            i.value = t === 'number' ? '2' : t === 'date' ? '2026-12-01' : t === 'datetime-local' ? '2026-12-01T10:00' : t === 'url' ? 'https://es.wikipedia.org/wiki/México'
              : t === 'email' ? 'prueba@example.com' : (i.placeholder && /http/.test(i.placeholder)) ? 'https://es.wikipedia.org/wiki/México' : 'Prueba 1';
            i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new Event('change', {bubbles: true}));
          });
        }""")
        p.wait_for_timeout(200)
        b = self.ev(r"""() => { const h = document.querySelector('.velo .hoja'); if (!h) return null;
          const b = h.querySelector('.hoja-pie [data-si], .hoja-pie .btn.primario, .hoja-pie button.primario') || [...h.querySelectorAll('.hoja-pie button')].pop();
          if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, b.textContent.trim()]; }""")
        if b:
            p.mouse.click(b[0], b[1]); p.wait_for_timeout(900)
            # Una confirmación encadenada (por ejemplo, "¿Seguro?").
            st2 = self.ev(ESTADO)
            if st2["hoja"] and st2["hoja"] != titulo:
                self.aceptar_hoja()
        return titulo

    def anotar(self, editor, ruta, antes_js, doc):
        p = self.p
        p.wait_for_timeout(500)
        hoja = self.aceptar_hoja()
        p.wait_for_timeout(300)
        st = self.ev(ESTADO)
        nuevos = self.errores_js[antes_js:]
        detalle = []
        if hoja: detalle.append("ventana «" + hoja + "»")
        if st["errores"]: detalle.append("aviso de error: " + " | ".join(st["errores"]))
        if nuevos: detalle.append("JS: " + " | ".join(nuevos[:3]))
        estado = "MAL" if (nuevos or st["errores"]) else "ok"
        self.res.append((editor, ruta, estado, "; ".join(detalle)))
        print(f"  {estado:3} {editor:12} {ruta[:90]:90} {'; '.join(detalle)[:160]}", flush=True)
        if estado == "MAL":
            try: p.screenshot(path=os.path.join(self.salida, f"{self.etq}-MAL-{len(self.res)}.png"))
            except Exception: pass
        self.limpiar()
        self.volver(doc)

    # ------------------------------------------------------------ preparar cada editor
    def preparar(self, modo):
        """Deja algo seleccionado para que las acciones tengan sobre qué trabajar."""
        p = self.p
        if modo == "TEXTO":
            self.ev(r"""() => { const ed = document.querySelector('.modo-TEXTO [contenteditable=true], .pagina [contenteditable=true], [contenteditable=true]');
              if (!ed) return; ed.focus(); const t = [...ed.querySelectorAll('p, h1, h2, li')].find(x => x.textContent.length > 8) || ed;
              const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT); const n = w.nextNode(); if (!n) return;
              const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, Math.min(5, n.length)); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
              document.dispatchEvent(new Event('selectionchange')); }""")
        elif modo == "HOJA":
            c1 = self.ev("() => { const c = document.querySelector('td[data-c=\"0\"][data-f=\"0\"]'); if (!c) return null; c.scrollIntoView({block:'nearest', inline:'nearest'}); const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
            c3 = self.ev("() => { const c = document.querySelector('td[data-c=\"1\"][data-f=\"2\"]'); if (!c) return null; const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
            if c1 and c3:
                p.mouse.click(*c1); p.keyboard.down("Shift"); p.mouse.click(*c3); p.keyboard.up("Shift")
        else:
            c = self.ev("() => { const ed = NOM.editorActual; const b = ed.doc.deLaPagina ? ed.doc.deLaPagina(ed.pagina).find(x => x.tipo !== 'conector' && x.tipo !== 'flecha') : null; if (!b) return null; const el = [...document.querySelectorAll(`.bl[data-id=\"${b.id}\"]`)].find(x => !x.closest('.mini')); if (!el) return null; el.scrollIntoView({block: 'nearest'}); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + Math.min(r.height / 2, 20)]; }")
            if c:
                p.keyboard.press("Escape"); p.mouse.click(*c)
        p.wait_for_timeout(250)

    def sembrar(self, modo):
        """Contenido inicial, escrito como lo haría una persona."""
        p = self.p
        if modo == "TEXTO":
            ed = self.ev("() => { const e = document.querySelector('[contenteditable=true]'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + 40, r.y + 20]; }")
            p.mouse.click(*ed); p.wait_for_timeout(200)
            p.keyboard.type("Título del trabajo"); p.keyboard.press("Enter")
            p.keyboard.type("Primer párrafo con texto suficiente para probar el formato y las listas."); p.keyboard.press("Enter")
            p.keyboard.type("Segundo párrafo: la ruedita, los comentarios y la búsqueda."); p.keyboard.press("Enter")
            p.keyboard.type("Tercer párrafo.")
        elif modo == "HOJA":
            datos = [["Nombre", "Calificación", "Faltas"], ["Ana", "9", "1"], ["Luis", "7.5", "3"], ["Eva", "10", "0"], ["Juan", "6", "5"]]
            for i, fila in enumerate(datos):
                for j, v in enumerate(fila):
                    ref = "ABC"[j] + str(i + 1)
                    c = self.ev(f"() => {{ const c = document.querySelector('[data-r=\"{ref}\"]'); if (!c) return null; c.scrollIntoView({{block:'nearest', inline:'nearest'}}); const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }}")
                    if not c: continue
                    p.mouse.click(*c); p.keyboard.type(v); p.keyboard.press("Enter"); p.wait_for_timeout(60)
        else:
            for t in (["Rectángulo", "Elipse"] if modo == "DIAGRAMA" else ["Cuadro de texto"]):
                b = self.ev(f"() => {{ const b = document.querySelector('.ed-herramientas [aria-label=\"{t}\"]'); if (!b || !b.offsetParent) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }}")
                if not b: continue
                p.mouse.click(*b); p.wait_for_timeout(300)
                area = self.ev("() => { const a = document.querySelector('.diapo[data-mundo], .lz-mundo, .lienzo-area, .diagrama'); if (!a) return null; const r = a.getBoundingClientRect(); return [r.x + r.width * 0.4, r.y + r.height * 0.4]; }")
                if area and self.ev("() => !NOM.editorActual.doc.deLaPagina(NOM.editorActual.pagina).length || true"):
                    p.mouse.click(area[0] + (60 if t == "Elipse" else 0), area[1]); p.wait_for_timeout(300)
                    if t == "Cuadro de texto": p.keyboard.type("Texto de prueba"); p.keyboard.press("Escape")
                p.keyboard.press("Escape"); p.wait_for_timeout(200)
            # Una figura más por código, por si en esta pantalla la barra no la muestra.
            if not self.ev("() => NOM.editorActual.doc.deLaPagina(NOM.editorActual.pagina).length"):
                self.ev("() => { const ed = NOM.editorActual; ed.doc.cambiar('fig1', { tipo: 'figura', forma: 'rect', pagina: ed.pagina, orden: 1, x: 200, y: 150, w: 220, h: 120, z: 1, texto: 'Figura' }); NOM.modos[ed.modo || 'PRESENTACION']._lienzo && NOM.modos[ed.modo]._lienzo.render(); }")
        p.wait_for_timeout(600)

    # ------------------------------------------------------------ recorrer
    def botones_barra(self):
        return self.ev(r"""() => [...document.querySelectorAll('.ed-herramientas button, .ed-herramientas select, .barra-sup button')]
          .filter(b => b.offsetParent && !b.disabled).map(b => (b.getAttribute('aria-label') || b.title || b.textContent).trim().replace(/\s+/g, ' ').slice(0, 50)).filter(Boolean)""")

    def tocar_barra(self, t):
        r = self.ev(r"""(t) => { const b = [...document.querySelectorAll('.ed-herramientas button, .ed-herramientas select, .barra-sup button')]
          .find(b => b.offsetParent && !b.disabled && (b.getAttribute('aria-label') || b.title || b.textContent).trim().replace(/\s+/g, ' ').slice(0, 50) === t);
          if (!b) return null; if (b.tagName === 'SELECT') { b.selectedIndex = (b.selectedIndex + 1) % b.options.length; b.dispatchEvent(new Event('change', {bubbles: true})); return 'select'; }
          b.scrollIntoView({block: 'nearest', inline: 'nearest'}); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }""", t)
        if isinstance(r, list): self.p.mouse.click(*r)
        return r

    def recorrer_editor(self, modo, doc):
        p = self.p
        self.volver(doc)
        self.sembrar(modo)
        barra = [b for b in self.botones_barra() if b not in SALTAR and not b.startswith("Página ") and not b.startswith("Diapositiva ")]
        print(f"\n== {modo}: {len(barra)} botones en la barra", flush=True)
        for t in barra:
            self.preparar(modo)
            antes_vis = set(self.ev(VISIBLES))
            antes_js = len(self.errores_js)
            if not self.tocar_barra(t):
                continue
            p.wait_for_timeout(450)
            st = self.ev(ESTADO)
            nuevos = [x for x in self.ev(VISIBLES) if x not in antes_vis and x not in SALTAR]
            if st["hoja"] or not nuevos:
                self.anotar(modo, t, antes_js, doc)
                continue
            # Abrió un menú o un panel: cada opción, una por una.
            self.limpiar(); self.volver(doc)
            vistos = set()
            for item in nuevos[:70]:
                if item in vistos or item in SALTAR or item in ("Cerrar", "Cancelar", "Cerrar capas"): continue
                vistos.add(item)
                self.preparar(modo)
                antes_js = len(self.errores_js)
                self.tocar_barra(t); p.wait_for_timeout(400)
                if not self.tocar(item):
                    self.res.append((modo, f"{t} > {item}", "NO", "no apareció al volver a abrir"))
                    print(f"  ?   {modo:12} {t} > {item}: no apareció al volver a abrir", flush=True)
                    self.limpiar(); continue
                self.anotar(modo, f"{t} > {item}", antes_js, doc)

    def recorrer_rueda(self, modo, doc, raiz=None, ruta="ruedita", nivel=0):
        """Abre la ruedita con clic derecho sobre la selección y elige cada acción (y sus submenús)."""
        p = self.p
        def abrir_rueda():
            self.limpiar(); self.volver(doc); self.preparar(modo)
            c = self.ev(r"""() => { const s = getSelection(); const el0 = document.querySelector('td.sel') || [...document.querySelectorAll('.bl.sel')].find(x => !x.closest('.mini'));
              if (!el0 && s.rangeCount && !s.isCollapsed && document.querySelector('[contenteditable=true]')) { const r = s.getRangeAt(0).getBoundingClientRect(); if (r.width) return [r.x + r.width / 2, r.y + r.height / 2]; }
              const el = el0;
              if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + Math.min(r.height / 2, 20)]; }""")
            if not c:
                # Una acción anterior (Eliminar, Cortar) dejó la página vacía: se vuelve a poner contenido.
                self.sembrar(modo); self.preparar(modo)
                c = self.ev(r"""() => { const el = document.querySelector('td.sel') || [...document.querySelectorAll('.bl.sel')].find(x => !x.closest('.mini'));
                  if (!el) { const s = getSelection(); if (s.rangeCount && !s.isCollapsed) { const r = s.getRangeAt(0).getBoundingClientRect(); if (r.width) return [r.x + r.width / 2, r.y + r.height / 2]; } return null; }
                  const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + Math.min(r.height / 2, 20)]; }""")
            if not c:
                if os.environ.get("NOM_DEPURAR"): print("      (no hay qué elegir para abrir la ruedita)", flush=True)
                return False
            p.mouse.click(c[0], c[1], button="right"); p.wait_for_timeout(450)
            if os.environ.get("NOM_DEPURAR"): print("      clic derecho en", [round(v) for v in c], "→", self.ev("() => [...document.querySelectorAll('.rueda-item')].map(b => b.getAttribute('aria-label')).join('|')"), "| encima:", self.ev(f"() => (document.elementFromPoint({c[0]}, {c[1]}) || {{}}).className"), flush=True)
            for paso in (raiz or []):
                if not self.ev("() => !!document.querySelector('.rueda-velo')"): return False
                c2 = self.ev(f"() => {{ const b = [...document.querySelectorAll('.rueda-item')].find(x => x.getAttribute('aria-label') === {json.dumps(paso)}); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }}")
                if not c2: return False
                p.mouse.click(*c2)
                p.wait_for_timeout(350)
            return self.ev("() => !!document.querySelector('.rueda-velo')")
        if not abrir_rueda():
            self.res.append((modo, ruta, "MAL", "la ruedita no abrió"))
            print(f"  MAL {modo:12} {ruta}: la ruedita no abrió", flush=True)
            self.limpiar(); return
        items = self.ev("() => [...document.querySelectorAll('.rueda-item')].map(b => [b.getAttribute('aria-label'), b.classList.contains('off'), !!b.querySelector('.rueda-mas')])")
        if nivel == 0:
            print(f"\n== {modo}: ruedita con {len(items)} acciones: {[i[0] for i in items]}", flush=True)
        self.limpiar()
        for etiqueta, off, sub in items:
            r = f"{ruta} > {etiqueta}"
            if off:
                self.res.append((modo, r, "off", "apagada para esta selección")); continue
            if etiqueta in SALTAR: continue
            if sub and nivel < 2:
                self.recorrer_rueda(modo, doc, (raiz or []) + [etiqueta], r, nivel + 1); continue
            antes_js = len(self.errores_js)
            if not abrir_rueda():
                self.res.append((modo, r, "MAL", "la ruedita no volvió a abrir")); continue
            self.ev(f"() => {{ const b = [...document.querySelectorAll('.rueda-item')].find(x => x.getAttribute('aria-label') === {json.dumps(etiqueta)}); const r = b.getBoundingClientRect(); window.__c = [r.x + r.width / 2, r.y + r.height / 2]; }}")
            c = self.ev("() => window.__c")
            p.mouse.click(*c); p.wait_for_timeout(400)
            # Un panel o menú que haya salido de la acción: se elige la primera opción.
            st = self.ev(ESTADO)
            if st["menu"]:
                self.ev("() => { const b = document.querySelector('.menu:not(.saliendo) [role=menuitem]'); b && b.click(); }")
            if st["rueda"]:
                self.res.append((modo, r, "MAL", "la ruedita se quedó abierta después de elegir"))
            self.anotar(modo, r, antes_js, doc)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("salida")
    ap.add_argument("--movil", action="store_true")
    ap.add_argument("--cdp")
    ap.add_argument("--base", default=N.B)
    ap.add_argument("--etiqueta", default=None)
    ap.add_argument("--solo", nargs="*")
    a = ap.parse_args()
    etq = a.etiqueta or ("movil" if a.movil else "escritorio")
    os.makedirs(a.salida, exist_ok=True)
    N.B = a.base if not a.cdp else N.B
    c = N.cuenta(); e = N.espacio(c["token"], "Rastreo")
    modos = a.solo or ["TEXTO", "HOJA", "PRESENTACION", "DIAGRAMA"]
    docs = {m: N.documento(c["token"], e, m, "Rastreo " + m.lower()) for m in modos}
    # La ruedita se recorre en un documento nuevo: después de tocar toda la barra (filtros, filas
    # borradas, figuras bloqueadas…) el primero ya no se parece al de una persona que empieza.
    docs_rueda = {m: N.documento(c["token"], e, m, "Ruedita " + m.lower()) for m in modos}
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        if a.cdp:
            nav = pw.chromium.connect_over_cdp(a.cdp); ctx = nav.contexts[0]; p = ctx.pages[0] if APP else ctx.new_page()
        else:
            motor = os.environ.get("NOM_NAVEGADOR", "chromium")
            nav = getattr(pw, motor).launch()
            opc = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2) if a.movil else dict(viewport={"width": 1400, "height": 900})
            if motor == "firefox": opc.pop("is_mobile", None)
            ctx = nav.new_context(accept_downloads=True, **opc); p = ctx.new_page()
        R = Rastreo(p, a.base, a.salida, etq)
        p.add_init_script("window.print = () => { window.__impreso = (window.__impreso || 0) + 1; };")
        p.goto(url(a.base, "/")); p.wait_for_function("() => window.NOM && NOM.api", timeout=40000)
        if APP: p.evaluate("(b) => NOM.api.fijarServidor(b)", a.base)
        p.evaluate("() => { try { NOM.api.limpiarSesion(); } catch (e) {} }")
        p.goto(url(a.base, "/")); p.wait_for_selector("#u", timeout=40000)
        p.fill("#u", c["nombre"]); p.fill("#c", N.CL); p.click("button[type=submit]")
        p.wait_for_function("() => !!localStorage.getItem('nom.token')", timeout=40000); p.wait_for_timeout(1200)
        R.limpiar()
        for m in modos:
            R.volver(docs[m])
            try:
                if os.environ.get("NOM_SOLO_RUEDA") != "1": R.recorrer_editor(m, docs[m])
                R.volver(docs_rueda[m]); R.sembrar(m)
                R.recorrer_rueda(m, docs_rueda[m])
            except Exception as ex:
                R.res.append((m, "(el rastreo se detuvo)", "MAL", f"{type(ex).__name__}: {str(ex)[:200]}"))
                print(f"  MAL {m}: el rastreo se detuvo: {type(ex).__name__}: {str(ex)[:300]}", flush=True)
            try: p.screenshot(path=os.path.join(a.salida, f"{etq}-final-{m}.png"))
            except Exception: pass
        mal = [r for r in R.res if r[2] in ("MAL",)]
        no = [r for r in R.res if r[2] == "NO"]
        print(f"\nRastreo ({etq}): {sum(1 for r in R.res if r[2] == 'ok')} acciones bien, {len(mal)} mal, {len(no)} sin volver a aparecer, "
              f"{sum(1 for r in R.res if r[2] == 'off')} apagadas por la selección")
        print("Descargas:", R.descargas)
        for r in mal: print("  MAL", r)
        json.dump({"res": R.res, "descargas": R.descargas, "errores_js": R.errores_js}, open(os.path.join(a.salida, f"rastreo-{etq}.json"), "w"), ensure_ascii=False, indent=1)
        if a.cdp and not APP: p.close()
        else: nav.close()
    sys.exit(1 if mal else 0)


if __name__ == "__main__":
    main()
