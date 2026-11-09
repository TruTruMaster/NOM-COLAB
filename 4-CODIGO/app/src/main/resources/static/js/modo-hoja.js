/* NOM-COLAB · Modo Hoja. Cada celda es un campo del bloque tabla ("c:A1"), así dos
   personas pueden escribir en celdas distintas a la vez y el CRDT no pierde ninguna.

   Propiedades por celda (todas "<prefijo>:<A1>", registros LWW independientes):
     c contenido · n negrita · i cursiva · u subrayado · k color de letra · f formato de número
     (código de Excel) · r relleno · al alineación (izq, centro, der) · aj ajustar texto ·
     bd bordes (letras a, b, i, d: arriba, abajo, izquierda, derecha) · tl tamaño de letra (pt) ·
     m celdas combinadas ("3x2": columnas × filas, en la celda de arriba a la izquierda).
   De la tabla: aw:<columna> ancho y ah:<fila> alto (px), cf:<id> formato condicional,
   dv:<id> validación (lista desplegable o número entre), nombre (de la hoja), fijasF, fijasC.

   4.1 Filtro y orden personales: se guardan solo en este equipo y para esta cuenta
   (nom.u.<cuenta>.filtro.<documento>), nunca en el documento. Se pinta una vista de las filas,
   ordenada y filtrada; lo que se edita va siempre a la celda real. "Aplicar a todos" (quien puede
   editar) deja ese filtro como el de todos (campo vistaComun de la tabla).
   4.3 Fijar filas y columnas (para todos) y gráficas (bloques "grafica" de la hoja, graficas.js).
   7 Buscar y reemplazar (Ctrl+F / Ctrl+H) y comentarios en celdas.
   8.1 Referencias con $ y a otras hojas; copiar, pegar y arrastrar fórmulas ajusta las relativas;
   insertar y borrar filas y columnas en cualquier lugar; formato de celdas; anchos y altos;
   formato condicional; listas desplegables; hojas con nombre. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso } = NOM;
  const F = () => NOM.formulas;
  const G = () => NOM.graficas;

  /** Prefijos de las propiedades de cada celda. */
  const PROPS = ["c", "n", "i", "u", "k", "f", "r", "al", "aj", "bd", "tl", "m"];
  /** Lo que copia "copiar formato" y el cuadrito de relleno además del contenido. */
  const FORMATO = ["n", "i", "u", "k", "f", "r", "al", "aj", "bd", "tl"];
  const ANCHO = 120, ALTO = 32;
  const COLORES_CELDA = ["#000000", "#C2372B", "#E8590C", "#2FA868", "#1D7A4C", "#3D72F2", "#8B5CF6"];
  const RELLENOS = ["#FFF2CC", "#FCE5CD", "#F4CCCC", "#D9EAD3", "#CFE2F3", "#D9D2E9", "#EFEFEF", "#FFFF00"];
  const ALIN = { izq: "left", centro: "center", der: "right" };
  const campoCelda = (k) => {
    const i = k.indexOf(":");
    if (i <= 0) return null;
    const p = k.slice(0, i);
    return PROPS.includes(p) && /^[A-Z]{1,3}\d+$/.test(k.slice(i + 1)) ? { p, ref: k.slice(i + 1) } : null;
  };
  /** Lo copiado dentro de la hoja (con fórmulas y formato); el sistema solo recibe el texto. */
  let portapapeles = null;

  NOM.modos.HOJA = {
    montar(ed) {
      const doc = () => ed.doc;
      const self = this;
      const raiz = html(`<div class="hoja-calc">
        <div class="barra-formula">
          <span class="celda-ref" data-ref>A1</span><span class="fx">fx</span>
          <input data-fx aria-label="Contenido de la celda" spellcheck="false" autocomplete="off" ${ed.soloLectura ? "readonly" : ""}>
        </div>
        <div class="hoja-filtro" data-filtro hidden></div>
        <div class="rejilla-hoja" data-rejilla tabindex="0" aria-label="Hoja de cálculo"></div>
        <div class="hoja-graficas" data-graficas hidden></div>
        <div class="bandeja-libres" data-bandeja></div>
      </div>`);
      ed.lienzo.append(raiz);
      ed.lienzo.style.overflow = "hidden";
      const rej = $("[data-rejilla]", raiz), fx = $("[data-fx]", raiz), refEl = $("[data-ref]", raiz), bandaFiltro = $("[data-filtro]", raiz), zonaGraficas = $("[data-graficas]", raiz);
      let sel = { c: 0, f: 0 }, ancla = null, editor = null, arrastrando = false;
      let visibles = [];          // filas reales en el orden en que se ven
      let resaltadas = new Set(), comentadas = new Map(), halladas = new Set();
      let cubiertas = new Map();  // celdas tapadas por una combinada -> celda de arriba a la izquierda
      const dedos = new Set();

      const nombreNuevo = () => {
        const usados = new Set(F().hojasDe(doc()).map((h) => F().nombreDeHoja(doc(), h).toLowerCase()));
        let n = F().hojasDe(doc()).length + 1;
        while (usados.has(("Hoja" + n).toLowerCase())) n++;
        return "Hoja" + n;
      };
      function tabla() {
        const t0 = doc().deLaPagina(ed.pagina).find((b) => b.tipo === "tabla");
        if (t0) return t0;
        if (ed.soloLectura) return null;
        const id = "hoja-" + ed.pagina;   // id fijo: si dos personas abren a la vez, crean la misma
        doc().cambiar(id, { tipo: "tabla", pagina: ed.pagina, orden: 0, filas: 30, cols: 10, x: 40, y: 40, w: 880, h: 300, nombre: nombreNuevo() }, { deshacible: false });
        return doc().bloque(id);
      }
      let t = tabla();
      const crudo = (c, f) => (t ? t["c:" + F().ref(c, f)] : "") || "";
      const prop = (p, c, f) => (t ? t[p + ":" + F().ref(c, f)] : undefined);
      const nombreHoja = () => (t ? F().nombreDeHoja(doc(), t) : "Hoja1");
      const evaluar = () => F().evaluadorDeTabla(doc(), t || { filas: 30, cols: 10 });
      const rango = () => {
        if (!ancla) return { c1: sel.c, c2: sel.c, f1: sel.f, f2: sel.f };
        return { c1: Math.min(ancla.c, sel.c), c2: Math.max(ancla.c, sel.c), f1: Math.min(ancla.f, sel.f), f2: Math.max(ancla.f, sel.f) };
      };
      const textoRango = (r) => (r.c1 === r.c2 && r.f1 === r.f2 ? F().ref(r.c1, r.f1) : `${F().ref(r.c1, r.f1)}:${F().ref(r.c2, r.f2)}`);
      const cadaCelda = (r, fn) => { for (let f = r.f1; f <= r.f2; f++) for (let c = r.c1; c <= r.c2; c++) fn(c, f, F().ref(c, f)); };
      const ancho = (c) => +(t && t["aw:" + F().colLetra(c)]) || ANCHO;
      const alto = (f) => +(t && t["ah:" + (f + 1)]) || 0;

      // ------------------------------------------------------------ 4.1 vista personal (filtro y orden)
      const claveVista = () => (ed.local ? "nom.local.filtro." + ed.id : NOM.api.clave("filtro." + ed.id));
      let vistas = NOM.leer(claveVista(), {}) || {};
      const vistaPropia = () => vistas[ed.pagina] || null;
      const vistaComun = () => (t && t.vistaComun && Object.keys(t.vistaComun).length ? t.vistaComun : null);
      const vistaActual = () => vistaPropia() || vistaComun();
      function guardarVista(v) {
        if (v && !v.orden && !Object.keys(v.filtros || {}).length) v = null;
        if (v) vistas[ed.pagina] = v; else delete vistas[ed.pagina];
        NOM.guardar(claveVista(), vistas);
        render();
      }
      /** La primera fila parece encabezado si tiene texto y la segunda no está vacía. */
      function pareceEncabezado() {
        if (!t) return false;
        let texto = 0, n = 0;
        for (let c = 0; c < (t.cols || 10); c++) { const v = crudo(c, 0); if (v !== "") { n++; if (isNaN(parseFloat(v)) && !String(v).startsWith("=")) texto++; } }
        return n > 0 && texto === n;
      }
      const conDatos = (f) => { for (let c = 0; c < (t.cols || 10); c++) if (crudo(c, f) !== "") return true; return false; };
      function pasa(v, filtro) {
        const txt = F().formatear(v);
        if (filtro.valores) return filtro.valores.includes(txt);
        if (filtro.contiene) return txt.toLowerCase().includes(String(filtro.contiene).toLowerCase());
        return true;
      }
      function calcularVisibles(ev) {
        const n = t ? t.filas || 30 : 0;
        const todas = Array.from({ length: n }, (_, i) => i);
        const v = vistaActual();
        if (!v) return todas;
        const enc = v.encabezado ? 1 : 0;
        let cuerpo = todas.slice(enc);
        for (const [c, f] of Object.entries(v.filtros || {})) cuerpo = cuerpo.filter((fila) => pasa(ev.valor(+c, fila), f));
        if (v.orden) {
          const c = v.orden.c, k = v.orden.asc ? 1 : -1;
          const vacia = (x) => x === "" || x == null;
          cuerpo.sort((a, b) => {
            const x = ev.valor(c, a), y = ev.valor(c, b);
            if (vacia(x) || vacia(y)) return vacia(x) && vacia(y) ? a - b : vacia(x) ? 1 : -1;   // lo vacío, al final
            if (F().esNum(x) && F().esNum(y)) return (+x - +y) * k || a - b;
            return String(F().formatear(x)).localeCompare(String(F().formatear(y)), "es", { numeric: true, sensitivity: "base" }) * k || a - b;
          });
        }
        return todas.slice(0, enc).concat(cuerpo);
      }
      function pintarBanda() {
        const v = vistaActual();
        if (!v || !t) { bandaFiltro.hidden = true; return; }
        const enc = v.encabezado ? 1 : 0, n = t.filas || 30;
        const total = Array.from({ length: n - enc }, (_, i) => i + enc).filter(conDatos).length;
        const vistas2 = visibles.slice(enc).filter(conDatos).length;
        const propia = !!vistaPropia();
        const partes = [];
        if (Object.keys(v.filtros || {}).length) partes.push(`Ves <b>${vistas2}</b> de ${total} filas`);
        if (v.orden) partes.push(`ordenadas por ${esc(F().colLetra(v.orden.c))} (${v.orden.asc ? "A→Z" : "Z→A"})`);
        bandaFiltro.hidden = false;
        bandaFiltro.innerHTML = `${ico("filter", "ico-s")}<span class="crece">${partes.join(", ")} · <b>${propia ? "filtro solo tuyo" : "filtro de todos"}</b></span>
          ${propia ? `<button class="btn chico" data-b="quitar">Quitar mi filtro</button>${ed.soloLectura ? "" : `<button class="btn chico" data-b="todos" data-micro="Aplicar a todos|Todos verán este filtro y este orden (cada quien puede usar el suyo).">Aplicar a todos</button>`}`
            : ed.soloLectura ? "" : `<button class="btn chico" data-b="quitar-todos">Quitar para todos</button>`}`;
      }
      bandaFiltro.addEventListener("click", (e) => {
        const b = e.target.closest("[data-b]");
        if (!b) return;
        if (b.dataset.b === "quitar") guardarVista(null);
        else if (b.dataset.b === "todos" && t && !ed.soloLectura) { doc().cambiar(t.id, { vistaComun: Object.assign({}, vistaPropia()) }); delete vistas[ed.pagina]; NOM.guardar(claveVista(), vistas); aviso("Listo: es el filtro de todos", { tipo: "ok" }); }
        else if (b.dataset.b === "quitar-todos" && t && !ed.soloLectura) doc().cambiar(t.id, { vistaComun: null });
      });
      /** Cambia la vista propia (a partir de la que se ve, propia o de todos). */
      function cambiarVista(fn) {
        const base = JSON.parse(JSON.stringify(vistaActual() || { filtros: {}, encabezado: pareceEncabezado() }));
        base.filtros = base.filtros || {};
        fn(base);
        guardarVista(base);
      }
      const ordenar = (c, asc) => cambiarVista((v) => { v.orden = { c, asc }; });
      const quitarFiltro = (c) => cambiarVista((v) => { delete v.filtros[c]; });
      /** Ordena las filas de verdad (para todos): reescribe las celdas en el orden nuevo. */
      function ordenarDeVerdad(c, asc) {
        if (ed.soloLectura || !t) return;
        const ev = evaluar();
        const enc = pareceEncabezado() ? 1 : 0, n = t.filas || 30, cols = t.cols || 10;
        const filas = Array.from({ length: n - enc }, (_, i) => i + enc).filter(conDatos);
        if (filas.some((f) => { for (let k = 0; k < cols; k++) if (String(crudo(k, f)).startsWith("=")) return true; return false; }))
          return aviso("Hay fórmulas en esas filas: usa el orden de la vista (no cambia las celdas) para no romperlas", { tipo: "aviso", ms: 5000 });
        const orden = filas.slice().sort((a, b) => { const x = ev.valor(c, a), y = ev.valor(c, b); return (F().esNum(x) && F().esNum(y) ? +x - +y : String(F().formatear(x)).localeCompare(String(F().formatear(y)), "es", { numeric: true })) * (asc ? 1 : -1); });
        const campos = {};
        orden.forEach((origen, i) => {
          const destino = filas[i];
          for (let k = 0; k < cols; k++) for (const p of PROPS.filter((x) => x !== "m")) {
            const v = t[p + ":" + F().ref(k, origen)], actual = t[p + ":" + F().ref(k, destino)];
            if ((v == null ? null : v) !== (actual == null ? null : actual)) campos[p + ":" + F().ref(k, destino)] = v == null ? null : v;
          }
        });
        if (Object.keys(campos).length) doc().cambiar(t.id, campos, { meta: { o: "r" } });
        aviso("Filas ordenadas para todos. Ctrl+Z para deshacer", { tipo: "ok" });
      }
      function dialogoFiltro(c) {
        const ev = evaluar(), v = vistaActual() || {}, enc = v.encabezado != null ? v.encabezado : pareceEncabezado();
        const valores = new Map();
        for (let f = enc ? 1 : 0; f < (t.filas || 30); f++) { if (!conDatos(f)) continue; const x = F().formatear(ev.valor(c, f)); valores.set(x, (valores.get(x) || 0) + 1); }
        const lista = [...valores.entries()].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true })).slice(0, 300);
        const actual = (v.filtros || {})[c];
        const cuerpo = html(`<div class="col">
          <p class="suave chico" style="font-weight:650">Solo cambia lo que <b>tú</b> ves; los demás siguen viendo todas las filas.</p>
          <label class="lista-item"><span class="crece"><b>La fila 1 es encabezado</b><small>No se filtra ni se ordena</small></span><span class="interruptor"><input type="checkbox" data-enc ${enc ? "checked" : ""}><span></span></span></label>
          <div class="entrada">${ico("search")}<input data-contiene placeholder="Que contenga…" value="${esc(actual && actual.contiene || "")}"></div>
          <div class="fila"><button class="btn chico" data-todos type="button">Todas</button><button class="btn chico" data-ninguna type="button">Ninguna</button></div>
          <div class="lista filtro-valores">${lista.map(([x, n]) => `<label class="lista-item"><input type="checkbox" data-v="${esc(x)}" ${!actual || !actual.valores || actual.valores.includes(x) ? "checked" : ""}><span class="crece">${x === "" ? "<i>(vacías)</i>" : esc(x)}</span><small>${n}</small></label>`).join("")}</div></div>`);
        const pie = html(`<div style="display:contents"><button class="btn" data-quitar>Quitar filtro</button><span class="crece"></span><button class="btn primario" data-si>Filtrar</button></div>`);
        const h = NOM.hoja({ titulo: "Filtrar la columna " + F().colLetra(c), icono: "filter", cuerpo, pie });
        $("[data-todos]", cuerpo).onclick = () => $$("[data-v]", cuerpo).forEach((x) => (x.checked = true));
        $("[data-ninguna]", cuerpo).onclick = () => $$("[data-v]", cuerpo).forEach((x) => (x.checked = false));
        $("[data-quitar]", pie).onclick = () => { h.cerrar(); cambiarVista((x) => { delete x.filtros[c]; x.encabezado = $("[data-enc]", cuerpo).checked; }); };
        $("[data-si]", pie).onclick = () => {
          const contiene = $("[data-contiene]", cuerpo).value.trim();
          const marcados = $$("[data-v]", cuerpo).filter((x) => x.checked).map((x) => x.dataset.v);
          h.cerrar();
          cambiarVista((x) => {
            x.encabezado = $("[data-enc]", cuerpo).checked;
            if (contiene) x.filtros[c] = { contiene };
            else if (marcados.length < lista.length) x.filtros[c] = { valores: marcados };
            else delete x.filtros[c];
          });
        };
      }

      // ------------------------------------------------------------ 4.3 fijar filas y columnas (para todos)
      function fijar(campos) { if (!ed.soloLectura && t) doc().cambiar(t.id, campos); }
      function aplicarFijas() {
        if (!t) return;
        const ff = Math.max(0, t.fijasF || 0), fc = Math.max(0, t.fijasC || 0);
        const cab = rej.querySelector("thead tr");
        if (!cab) return;
        let top = cab.offsetHeight;
        const filas = rej.querySelectorAll("tbody tr");
        filas.forEach((tr, k) => {
          const fija = k < ff;
          tr.classList.toggle("fija", fija);
          tr.querySelectorAll("th, td").forEach((x) => { x.style.top = fija ? top + "px" : ""; if (fija) x.style.position = "sticky"; else if (!x.classList.contains("fija-c") && x.tagName === "TD") x.style.position = ""; });
          if (fija) top += tr.offsetHeight;
        });
        let left = 46;
        const lefts = [];
        for (let c = 0; c < fc; c++) { lefts.push(left); left += ancho(c); }
        rej.querySelectorAll("tr").forEach((tr) => {
          for (const x of tr.children) {
            const c = x.dataset.c != null ? +x.dataset.c : x.dataset.col != null ? +x.dataset.col : null;
            if (c == null) continue;
            const fija = c < fc;
            x.classList.toggle("fija-c", fija);
            if (fija) { x.style.position = "sticky"; x.style.left = lefts[c] + "px"; }
            else { x.style.left = ""; if (!x.closest("tr.fija") && x.tagName === "TD") x.style.position = ""; }
          }
        });
      }
      function menuFijar(anc) {
        const items = [{ titulo: "Fijar (se queda a la vista al desplazarte)" },
          { texto: "La fila 1", icono: "rows-3", marcado: (t.fijasF || 0) === 1, fn: () => fijar({ fijasF: 1 }) },
          { texto: `Hasta la fila ${visibles.indexOf(sel.f) + 1}`, icono: "rows-3", fn: () => fijar({ fijasF: visibles.indexOf(sel.f) + 1 }) },
          { texto: "La columna A", icono: "columns-3", marcado: (t.fijasC || 0) === 1, fn: () => fijar({ fijasC: 1 }) },
          { texto: `Hasta la columna ${F().colLetra(sel.c)}`, icono: "columns-3", fn: () => fijar({ fijasC: sel.c + 1 }) },
          "-", { texto: "No fijar nada", icono: "x", fn: () => fijar({ fijasF: null, fijasC: null }) }];
        if (anc) NOM.menu(anc, items); else return items;
      }

      // ------------------------------------------------------------ celdas combinadas y formato condicional
      /** "3x2" -> [3, 2]. */
      const medida = (v) => { const m = /^(\d+)x(\d+)$/.exec(String(v || "")); return m ? [Math.max(1, +m[1]), Math.max(1, +m[2])] : null; };
      function calcularCombinadas(conFilas) {
        const spans = new Map();
        cubiertas = new Map();
        if (!t) return spans;
        for (const k in t) {
          if (!k.startsWith("m:") || !t[k]) continue;
          const r = F().parseRef(k.slice(2)), m = medida(t[k]);
          if (!r || !m) continue;
          const w = m[0], h = conFilas ? m[1] : 1;
          if (w * h <= 1) continue;
          spans.set(k.slice(2), { cs: w, rs: h });
          for (let f = r.f; f < r.f + h; f++) for (let c = r.c; c < r.c + w; c++) if (c !== r.c || f !== r.f) cubiertas.set(F().ref(c, f), k.slice(2));
        }
        return spans;
      }
      /** La celda que se ve (si (c, f) está tapada por una combinada, la de arriba a la izquierda). */
      const visible = (c, f) => { const tl = cubiertas.get(F().ref(c, f)); return tl ? F().parseRef(tl) : { c, f }; };
      const reglas = (pref) => (t ? Object.keys(t).filter((k) => k.startsWith(pref + ":") && t[k] && t[k].rango).map((k) => Object.assign({ id: k }, t[k], { r: G().rango(t[k].rango) })).filter((x) => x.r) : []);
      const dentro = (r, c, f) => c >= r.c1 && c <= r.c2 && f >= r.f1 && f <= r.f2;
      function cumple(rg, v) {
        const vacio = v === "" || v == null;
        if (rg.op === "vacia") return vacio;
        if (rg.op === "novacia") return !vacio;
        if (rg.op === "contiene") return !vacio && F().formatear(v).toLowerCase().includes(String(rg.v1 || "").toLowerCase());
        if (vacio) return false;
        const a = F().calcularLiteral(String(rg.v1 == null ? "" : rg.v1).trim()), b = F().calcularLiteral(String(rg.v2 == null ? "" : rg.v2).trim());
        const num = F().esNum(v) && F().esNum(a);
        const x = num ? +v : F().formatear(v).toLowerCase(), y = num ? +a : String(rg.v1 == null ? "" : rg.v1).toLowerCase();
        switch (rg.op) {
          case ">": return x > y;
          case "<": return x < y;
          case ">=": return x >= y;
          case "<=": return x <= y;
          case "=": return x === y;
          case "<>": return x !== y;
          case "entre": return num && F().esNum(b) && +v >= Math.min(+a, +b) && +v <= Math.max(+a, +b);
        }
        return false;
      }

      // ------------------------------------------------------------ pintar
      /** Cómo se ve una celda: texto con su formato, estilos y clases. */
      function aspecto(c, f, ev, conds) {
        const ref = F().ref(c, f), v = ev.valor(c, f), fmt = t["f:" + ref];
        const st = [];
        let color = t["k:" + ref] || "", fondo = t["r:" + ref] || "", negrita = !!t["n:" + ref];
        for (const rg of conds) if (dentro(rg.r, c, f) && cumple(rg, v)) { if (rg.color) color = rg.color; if (rg.fondo) fondo = rg.fondo; if (rg.negrita) negrita = true; break; }
        if (color) st.push("color:" + color);
        if (fondo) st.push("background-color:" + fondo);
        const al = t["al:" + ref];
        if (al && ALIN[al]) st.push("text-align:" + ALIN[al]);
        if (t["aj:" + ref]) st.push("white-space:normal;word-break:break-word;line-height:1.25;text-overflow:clip");
        const tl = +t["tl:" + ref];
        if (tl) st.push("font-size:" + tl + "pt");
        const bd = String(t["bd:" + ref] || "");
        if (bd) {
          const sh = [];
          if (bd.includes("a")) sh.push("inset 0 1.5px 0 #1F1E24");
          if (bd.includes("b")) sh.push("inset 0 -1.5px 0 #1F1E24");
          if (bd.includes("i")) sh.push("inset 1.5px 0 0 #1F1E24");
          if (bd.includes("d")) sh.push("inset -1.5px 0 0 #1F1E24");
          if (sh.length) st.push("box-shadow:" + sh.join(","));
        }
        const cr = String(crudo(c, f));
        return { v, txt: F().aplicarFormato(v, fmt), st: st.join(";"), negrita, num: F().esNum(v), err: v instanceof F().ErrorF, formula: cr.startsWith("=") ? cr : "" };
      }
      function render() {
        t = tabla();
        if (!t) {
          rej.innerHTML = `<div class="vacio" style="margin:32px">${ico("sheet")}<h3>Esta página no tiene hoja</h3><p>Tu permiso es solo para ver.</p></div>`;
          pintarBandeja();
          return;
        }
        const ev = evaluar();
        const cols = t.cols || 10;
        const r = rango();
        visibles = calcularVisibles(ev);
        const v = vistaActual() || {};
        const spans = calcularCombinadas(!vistaActual());
        const conds = reglas("cf");
        const listas = reglas("dv").filter((x) => x.tipo === "lista");
        let h = `<table><colgroup><col style="width:46px">${Array.from({ length: cols }, (_, c) => `<col style="width:${ancho(c)}px">`).join("")}</colgroup>
          <thead><tr><th data-todo title="Elegir todo"></th>${Array.from({ length: cols }, (_, c) => `<th data-col="${c}" class="${c >= r.c1 && c <= r.c2 ? "activa" : ""}${v.orden && v.orden.c === c ? " ordenada" : ""}${(v.filtros || {})[c] ? " filtrada" : ""}">${F().colLetra(c)}${ed.soloLectura ? "" : `<span class="redim-c" data-redim-c="${c}" aria-hidden="true"></span>`}</th>`).join("")}</tr></thead><tbody>`;
        for (const f of visibles) {
          const hf = alto(f);
          h += `<tr data-fila="${f}"${hf ? ` style="height:${hf}px"` : ""}><th data-filah="${f}" class="${f >= r.f1 && f <= r.f2 ? "activa" : ""}">${f + 1}${ed.soloLectura ? "" : `<span class="redim-f" data-redim-f="${f}" aria-hidden="true"></span>`}</th>`;
          for (let c = 0; c < cols; c++) {
            const ref = F().ref(c, f);
            if (cubiertas.has(ref)) continue;
            const a = aspecto(c, f, ev, conds), sp = spans.get(ref);
            const clases = [a.num ? "num" : "", a.err ? "err" : "",
              c === sel.c && f === sel.f ? "sel" : (dentro(r, c, f) ? "rango" : ""),
              resaltadas.has(ref) ? "cambiada" : "", comentadas.has(ref) ? "con-comentario" : "", halladas.has(ref) ? "hallada" : "",
              listas.some((x) => dentro(x.r, c, f)) ? "con-lista" : "", sp ? "combinada" : ""].join(" ");
            h += `<td data-c="${c}" data-f="${f}" data-id="${esc(t.id)}!${ref}" class="${clases}"${sp ? ` colspan="${sp.cs}" rowspan="${sp.rs}"` : ""} ${a.negrita ? "data-negrita" : ""} ${t["i:" + ref] ? "data-cursiva" : ""} ${t["u:" + ref] ? "data-subrayado" : ""} ${a.st ? `style="${esc(a.st)}"` : ""} title="${esc(a.formula)}">${esc(a.txt)}</td>`;
          }
          h += "</tr>";
        }
        rej.innerHTML = h + "</tbody></table>";
        rej.append(asa);
        pintarBanda();
        aplicarFijas();
        pintarSeleccion();
        pintarGraficas();
        pintarBandeja();
        marcarCopiado();
        ed.pintarPresencia();
      }

      function pintarSeleccion() {
        if (!ancla) { const vis = visible(sel.c, sel.f); if (vis.c !== sel.c || vis.f !== sel.f) sel = vis; }
        const r = rango();
        refEl.textContent = ancla && (ancla.c !== sel.c || ancla.f !== sel.f) ? textoRango(r) : F().ref(sel.c, sel.f);
        if (document.activeElement !== fx) fx.value = crudo(sel.c, sel.f);
        $$("td.sel, td.rango", rej).forEach((x) => x.classList.remove("sel", "rango"));
        $$("th.activa", rej).forEach((x) => x.classList.remove("activa"));
        for (let f = r.f1; f <= r.f2; f++) for (let c = r.c1; c <= r.c2; c++) {
          const td = celda(c, f); if (td) td.classList.add(c === sel.c && f === sel.f ? "sel" : "rango");
        }
        for (let c = r.c1; c <= r.c2; c++) { const th = rej.querySelector(`thead th[data-col="${c}"]`); if (th) th.classList.add("activa"); }
        for (let f = r.f1; f <= r.f2; f++) { const th = rej.querySelector(`tbody th[data-filah="${f}"]`); if (th) th.classList.add("activa"); }
        const td = celda(sel.c, sel.f);
        if (td) td.scrollIntoView({ block: "nearest", inline: "nearest" });
        if (t) ed.seleccionar(t.id + "!" + F().ref(sel.c, sel.f));
        colocarAsa();
        pintarDesplegable();
      }
      const celda = (c, f) => rej.querySelector(`td[data-c="${c}"][data-f="${f}"]`);

      // ------------------------------------------------------------ 8.1 hojas: pestañas, nombre, mover, duplicar, eliminar
      /** Las hojas sin nombre propio se quedan con el que tienen ahora (así las fórmulas no se rompen al moverlas). */
      function fijarNombres() {
        F().hojasDe(doc()).forEach((h) => { if (!h.nombre) doc().cambiar(h.id, { nombre: F().nombreDeHoja(doc(), h) }, { deshacible: false }); });
      }
      function pintarBandeja() {
        const pags = doc().paginas();
        const libres = doc().deLaPagina(ed.pagina).filter((b) => b.tipo !== "tabla" && b.tipo !== "conector" && b.tipo !== "grafica");
        const b = $("[data-bandeja]", raiz);
        const hojas = F().hojasDe(doc());
        const nombreDe = (p, i) => { const h = hojas.find((x) => x.pagina === p); return h ? F().nombreDeHoja(doc(), h) : "Hoja" + (i + 1); };
        b.innerHTML = `<div class="hojas-pestanas" role="tablist">${pags.map((p, i) => `<button class="pestana-hoja ${p === ed.pagina ? "activa" : ""}" role="tab" aria-selected="${p === ed.pagina}" data-pag="${esc(p)}" data-micro="${esc(nombreDe(p, i))}|Toca para abrirla. Doble clic o mantener: nombre, duplicar, mover o eliminar.">${esc(nombreDe(p, i))}</button>`).join("")}</div>
          ${ed.soloLectura ? "" : `<button class="icono-btn" data-nueva data-micro="Nueva hoja|Agrega otra hoja a este libro.">${ico("plus")}</button>`}
          <span class="crece"></span>
          ${libres.length ? `<span class="chip" data-micro="Bloques libres|Texto, figuras o imágenes de otros modos. Se conservan aunque aquí no se editen.">${ico("layers", "ico-s")} ${libres.length} bloque${libres.length > 1 ? "s" : ""} libre${libres.length > 1 ? "s" : ""}</span>` : ""}`;
        $$("[data-pag]", b).forEach((x) => {
          x.onclick = () => { if (x.dataset.pag === ed.pagina) return; ed.pagina = x.dataset.pag; sel = { c: 0, f: 0 }; ancla = null; cerrarBuscar(); render(); };
          x.ondblclick = () => { if (!ed.soloLectura) renombrarHoja(x.dataset.pag); };
          x.oncontextmenu = (e) => { e.preventDefault(); if (!ed.soloLectura) menuHoja(x, x.dataset.pag); };
        });
        if (!b._rueda) {
          b._rueda = true;
          NOM.rueda.enlazar(b, (e) => {
            const x = e.target.closest && e.target.closest("[data-pag]");
            if (!x || ed.soloLectura) return null;
            const l = accionesHoja(x.dataset.pag); l.titulo = x.textContent.trim(); return l;
          }, { titulo: "Hoja" });
        }
        const n = $("[data-nueva]", b);
        if (n) n.onclick = nuevaHoja;
      }
      function tablaDePagina(p) { return doc().deLaPagina(p).find((x) => x.tipo === "tabla") || null; }
      function nuevaHoja() {
        fijarNombres();
        const nombre = nombreNuevo();
        ed.pagina = ed.nuevaPagina(ed.pagina);
        doc().cambiar("hoja-" + ed.pagina, { tipo: "tabla", pagina: ed.pagina, orden: 0, filas: 30, cols: 10, x: 40, y: 40, w: 880, h: 300, nombre }, { deshacible: false });
        sel = { c: 0, f: 0 }; ancla = null;
        render();
      }
      const nombreValido = (n) => n && n.length <= 31 && !/[\\/?*[\]:]/.test(n);
      async function renombrarHoja(p) {
        const tb = tablaDePagina(p);
        if (!tb) return;
        const viejo = F().nombreDeHoja(doc(), tb);
        const n = await NOM.pedirTexto("Nombre de la hoja", { etiqueta: "Nombre (hasta 31 letras, sin \\ / ? * [ ] :)", valor: viejo, max: 31, si: "Guardar" });
        if (n == null || n === viejo) return;
        if (!nombreValido(n)) return aviso("Ese nombre no sirve: hasta 31 letras y sin \\ / ? * [ ] :", { tipo: "aviso" });
        if (F().hojasDe(doc()).some((h) => h.id !== tb.id && F().nombreDeHoja(doc(), h).toLowerCase() === n.toLowerCase())) return aviso("Ya hay una hoja con ese nombre", { tipo: "aviso" });
        doc().lote(() => {
          fijarNombres();
          doc().cambiar(tb.id, { nombre: n });
          // Las fórmulas que la nombran usan el nombre nuevo (en todas las hojas).
          F().hojasDe(doc()).forEach((h) => {
            const cs = {};
            for (const k in h) if (k.startsWith("c:") && typeof h[k] === "string" && h[k][0] === "=" && h[k].includes("!")) { const nv = F().renombrarHoja(h[k], viejo, n); if (nv !== h[k]) cs[k] = nv; }
            if (Object.keys(cs).length) doc().cambiar(h.id, cs, { meta: { o: "r" } });
          });
        });
      }
      function duplicarHoja(p) {
        const tb = tablaDePagina(p);
        if (!tb) return;
        fijarNombres();
        const base = F().nombreDeHoja(doc(), tb);
        let nombre = base.slice(0, 26) + " (2)", k = 2;
        const usados = new Set(F().hojasDe(doc()).map((h) => F().nombreDeHoja(doc(), h).toLowerCase()));
        while (usados.has(nombre.toLowerCase())) nombre = base.slice(0, 26) + ` (${++k})`;
        const np = ed.nuevaPagina(p), nid = "hoja-" + np;
        const { id, ...campos } = doc().bloque(tb.id);
        doc().lote(() => {
          NOM.DocCRDT.trozos(Object.assign(campos, { pagina: np, nombre, vistaComun: null })).forEach((x) => doc().cambiar(nid, x, { meta: { o: "r" } }));
          doc().vivos().filter((g) => g.tipo === "grafica" && g.hoja === tb.id).forEach((g) => { const { id: _g, ...cg } = g; doc().cambiar(NOM.DocCRDT.nuevoId(), Object.assign(cg, { pagina: np, hoja: nid })); });
        });
        ed.pagina = np; sel = { c: 0, f: 0 }; ancla = null; render();
      }
      function moverHoja(p, d) {
        const pags = doc().paginas().slice(), i = pags.indexOf(p);
        if (i + d < 0 || i + d >= pags.length) return;
        fijarNombres();
        pags.splice(i, 1); pags.splice(i + d, 0, p);
        doc().cambiar("_doc", { paginas: pags });
      }
      async function eliminarHoja(p) {
        const pags = doc().paginas();
        if (pags.length <= 1) return aviso("Un libro necesita al menos una hoja", { tipo: "info" });
        const tb = tablaDePagina(p);
        const nombre = tb ? F().nombreDeHoja(doc(), tb) : "esta hoja";
        if (!(await NOM.confirmar("Eliminar hoja", `Se eliminará “${nombre}” con sus datos y gráficas. Las fórmulas de otras hojas que la usan mostrarán #REF!.`, { si: "Eliminar", peligro: true }))) return;
        fijarNombres();
        doc().lote(() => {
          doc().deLaPagina(p).forEach((b) => doc().cambiar(b.id, { eliminado: true }));
          doc().cambiar("_doc", { paginas: pags.filter((x) => x !== p) });
        });
        const i = pags.indexOf(p);
        ed.pagina = pags[i > 0 ? i - 1 : 1];
        sel = { c: 0, f: 0 }; ancla = null;
        render();
      }
      function accionesHoja(p) {
        const pags = doc().paginas(), i = pags.indexOf(p);
        return [
          { texto: "Cambiar nombre", corto: "Nombre", icono: "pencil", fn: () => renombrarHoja(p) },
          { texto: "Duplicar", icono: "copy", fn: () => duplicarHoja(p) },
          { texto: "Mover a la izquierda", corto: "← Mover", icono: "chevron-left", off: i <= 0, fn: () => moverHoja(p, -1) },
          { texto: "Mover a la derecha", corto: "Mover →", icono: "chevron-right", off: i >= pags.length - 1, fn: () => moverHoja(p, 1) },
          { texto: "Eliminar hoja", corto: "Eliminar", icono: "trash-2", off: pags.length <= 1, fn: () => eliminarHoja(p) },
          { texto: "Nueva hoja", corto: "Nueva", icono: "plus", fn: nuevaHoja },
        ];
      }
      function menuHoja(anc, p) {
        NOM.menu(anc, [{ titulo: anc.textContent.trim() }, ...accionesHoja(p).filter((x) => !x.off)]);
      }

      // ------------------------------------------------------------ 4.3 y 8.1 gráficas
      const graficas = () => doc().deLaPagina(ed.pagina).filter((b) => b.tipo === "grafica");
      /** Si se eligió una sola celda: el bloque de datos que la rodea (como Excel). */
      function regionDe(c, f) {
        const lleno = (cc, ff) => cc >= 0 && ff >= 0 && crudo(cc, ff) !== "";
        if (!lleno(c, f)) return null;
        let r = { c1: c, c2: c, f1: f, f2: f }, crece = true;
        while (crece) {
          crece = false;
          const filaLlena = (ff) => { for (let k = r.c1; k <= r.c2; k++) if (lleno(k, ff)) return true; return false; };
          const colLlena = (cc) => { for (let k = r.f1; k <= r.f2; k++) if (lleno(cc, k)) return true; return false; };
          if (filaLlena(r.f1 - 1)) { r.f1--; crece = true; }
          if (filaLlena(r.f2 + 1)) { r.f2++; crece = true; }
          if (colLlena(r.c1 - 1)) { r.c1--; crece = true; }
          if (colLlena(r.c2 + 1)) { r.c2++; crece = true; }
        }
        return r;
      }
      function nuevaGrafica(clase) {
        if (ed.soloLectura || !t) return;
        let r = rango();
        if (r.c1 === r.c2 && r.f1 === r.f2) r = regionDe(sel.c, sel.f) || r;
        const id = NOM.DocCRDT.nuevoId();
        doc().cambiar(id, { tipo: "grafica", pagina: ed.pagina, orden: Date.now() % 1e9 / 1e6, hoja: t.id, rango: `${F().ref(r.c1, r.f1)}:${F().ref(r.c2, r.f2)}`, clase: clase || "barras", titulo: "" });
        aviso(`Gráfica de ${F().ref(r.c1, r.f1)}:${F().ref(r.c2, r.f2)}. Se actualiza sola cuando cambian los datos.`, { tipo: "ok", ms: 3000 });
      }
      function pintarGraficas() {
        const gs = graficas();
        zonaGraficas.hidden = !gs.length;
        if (!gs.length) { zonaGraficas.innerHTML = ""; return; }
        const ev = evaluar();
        zonaGraficas.innerHTML = gs.map((g) => `<figure class="graf-tarjeta" data-g="${esc(g.id)}">
          <figcaption><span class="crece recorta">${esc(g.titulo || "Gráfica")} <span class="suave">· ${esc(g.rango)}</span></span>${ed.soloLectura ? "" : `<button class="icono-btn chico" data-gmenu aria-label="Opciones de la gráfica">${ico("more-horizontal", "ico-s")}</button>`}</figcaption>
          ${G().svg(G().datos(ev, G().rango(g.rango) || { c1: 0, c2: 0, f1: 0, f2: 0 }), g.clase, { titulo: g.titulo, ejeX: g.ejeX, ejeY: g.ejeY, colores: g.colores })}</figure>`).join("");
      }
      function dialogoGrafica(id) {
        const g = doc().bloque(id);
        if (!g) return;
        const cuerpo = html(`<form class="col">
          <div class="campo"><label>Tipo</label><div class="entrada"><select data-tipo>${G().TIPOS.map(([v, tx]) => `<option value="${v}" ${(g.clase || "barras") === v ? "selected" : ""}>${tx}</option>`).join("")}</select></div></div>
          <div class="campo"><label>Título</label><div class="entrada"><input data-titulo maxlength="80" value="${esc(g.titulo || "")}"></div></div>
          <div class="fila"><div class="campo crece"><label>Eje horizontal</label><div class="entrada"><input data-x maxlength="40" value="${esc(g.ejeX || "")}" placeholder="Por ejemplo: Mes"></div></div>
            <div class="campo crece"><label>Eje vertical</label><div class="entrada"><input data-y maxlength="40" value="${esc(g.ejeY || "")}" placeholder="Por ejemplo: Ventas"></div></div></div>
          <div class="campo"><label>Colores</label><div class="entrada"><select data-col>${Object.entries(G().PALETAS).map(([k, p]) => `<option value="${k}" ${(g.colores || "clasica") === k ? "selected" : ""}>${p.t}</option>`).join("")}</select></div></div>
          <div class="campo"><label>Datos (rango)</label><div class="entrada"><input data-rango value="${esc(g.rango || "")}" placeholder="A1:B10"></div></div></form>`);
        const pie = html(`<div style="display:contents"><button class="btn" type="button" data-sel>Usar lo elegido</button><span class="crece"></span><button class="btn primario" data-si>Guardar</button></div>`);
        const h = NOM.hoja({ titulo: "Gráfica", icono: "bar-chart", cuerpo, pie });
        $("[data-sel]", pie).onclick = () => { $("[data-rango]", cuerpo).value = textoRango(rango()); };
        $("[data-si]", pie).onclick = (e) => {
          e.preventDefault();
          const rg = $("[data-rango]", cuerpo).value.trim().toUpperCase().replace(/\$/g, "");
          if (!G().rango(rg)) return aviso("Escribe un rango como A1:B10", { tipo: "aviso" });
          doc().cambiar(id, { clase: $("[data-tipo]", cuerpo).value, titulo: $("[data-titulo]", cuerpo).value.trim(), ejeX: $("[data-x]", cuerpo).value.trim() || null, ejeY: $("[data-y]", cuerpo).value.trim() || null, colores: $("[data-col]", cuerpo).value, rango: rg.includes(":") ? rg : rg + ":" + rg });
          h.cerrar();
        };
      }
      zonaGraficas.addEventListener("click", (e) => {
        const b = e.target.closest("[data-gmenu]");
        if (!b) return;
        const id = b.closest("[data-g]").dataset.g, g = doc().bloque(id);
        NOM.menu(b, [
          { titulo: "Gráfica" },
          ...G().TIPOS.map(([v, tx, i]) => ({ texto: tx, icono: i, marcado: (g.clase || "barras") === v, fn: () => doc().cambiar(id, { clase: v }) })),
          "-",
          { texto: "Título, ejes y colores…", icono: "type", fn: () => dialogoGrafica(id) },
          { texto: "Usar las celdas elegidas", icono: "table", fn: () => { const r = rango(); doc().cambiar(id, { rango: `${F().ref(r.c1, r.f1)}:${F().ref(r.c2, r.f2)}` }); } },
          { texto: "Eliminar gráfica", icono: "trash-2", peligro: true, fn: () => doc().cambiar(id, { eliminado: true }) },
        ]);
      });

      // ------------------------------------------------------------ escritura
      /** Validación (lista o número entre) de la celda, si tiene. */
      const validacionDe = (c, f) => reglas("dv").find((x) => dentro(x.r, c, f)) || null;
      function valido(c, f, valor) {
        const dv = validacionDe(c, f);
        if (!dv || valor === "" || valor == null || String(valor).startsWith("=")) return true;
        if (dv.tipo === "lista") {
          const ok = (dv.valores || []).some((x) => String(x).trim().toLowerCase() === String(valor).trim().toLowerCase());
          if (!ok) aviso(dv.mensaje || `Elige un valor de la lista: ${(dv.valores || []).slice(0, 6).join(", ")}${(dv.valores || []).length > 6 ? "…" : ""}`, { tipo: "aviso", ms: 4500 });
          return ok;
        }
        if (dv.tipo === "numero") {
          const v = F().calcularLiteral(String(valor).trim());
          const ok = F().esNum(v) && (dv.min == null || dv.min === "" || +v >= +dv.min) && (dv.max == null || dv.max === "" || +v <= +dv.max);
          if (!ok) aviso(dv.mensaje || `Escribe un número${dv.min != null && dv.min !== "" ? " desde " + dv.min : ""}${dv.max != null && dv.max !== "" ? " hasta " + dv.max : ""}`, { tipo: "aviso", ms: 4500 });
          return ok;
        }
        return true;
      }
      function escribir(c, f, valor, opc) {
        if (ed.soloLectura || !t) return false;
        if (!valido(c, f, valor)) return false;
        const k = "c:" + F().ref(c, f);
        const ent = F().leerEntrada(valor);
        const campos = {};
        if ((t[k] || "") !== (ent.crudo == null ? "" : ent.crudo)) campos[k] = ent.crudo;
        // "50%" o "$1,200": el formato se pone solo (como Excel), si la celda no tenía uno.
        if (ent.formato && !t["f:" + F().ref(c, f)]) campos["f:" + F().ref(c, f)] = ent.formato;
        if (!Object.keys(campos).length) return true;
        if (f >= (t.filas || 30) - 1) campos.filas = (t.filas || 30) + 10;
        if (c >= (t.cols || 10) - 1) campos.cols = (t.cols || 10) + 2;
        doc().cambiar(t.id, campos, opc);
        return true;
      }
      /** Moverse por la vista (con filtro u orden, la fila de abajo es la que se ve abajo). Salta las combinadas. */
      function mover(dc, df, extender) {
        if (extender) { if (!ancla) ancla = { ...sel }; } else ancla = null;
        const desde = visible(sel.c, sel.f);
        let c = sel.c, f = sel.f;
        for (let paso = 0; paso < 60; paso++) {
          if (df) { const i = visibles.indexOf(f); const nf = visibles[Math.max(0, Math.min(visibles.length - 1, (i < 0 ? 0 : i) + df))]; if (nf == null || nf === f) break; f = nf; }
          if (dc) { const nc = Math.max(0, Math.min((t.cols || 10) - 1, c + dc)); if (nc === c) break; c = nc; }
          const v = visible(c, f);
          if (extender || v.c !== desde.c || v.f !== desde.f) break;
        }
        sel = extender ? { c, f } : visible(c, f);
        pintarSeleccion();
      }
      function abrirEditor(inicial, conservar) {
        if (ed.soloLectura || !t) return;
        cerrarEditor(false);
        const td = celda(sel.c, sel.f);
        if (!td) return;
        const r = td.getBoundingClientRect(), b = rej.getBoundingClientRect();
        editor = html(`<input class="editor-celda" spellcheck="false" autocomplete="off">`);
        editor.style.left = r.left - b.left + rej.scrollLeft + "px";
        editor.style.top = r.top - b.top + rej.scrollTop + "px";
        editor.style.width = Math.max(r.width, 160) + "px";
        editor.style.height = r.height + "px";
        editor.value = conservar ? crudo(sel.c, sel.f) : inicial || "";
        editor._c = sel.c; editor._f = sel.f;
        rej.append(editor);
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
        editor.addEventListener("input", () => { fx.value = editor.value; resaltarRefs(editor.value); });
        prepararAyuda(editor);
        editor.addEventListener("keydown", teclaEditor);
        editor.addEventListener("blur", () => setTimeout(() => { if (editor && document.activeElement !== editor) cerrarEditor(true); }, 0));
        resaltarRefs(editor.value);
        mostrarAyuda(editor);
      }
      function cerrarEditor(guardar) {
        if (!editor) return;
        const e = editor; editor = null;
        ocultarAyuda();
        resaltarRefs("");
        if (guardar) escribir(e._c, e._f, e.value);
        e.remove();
      }
      function teclaEditor(e) {
        if (["Enter", "Tab", "Escape"].includes(e.key)) e.stopPropagation();   // si no, la rejilla mueve otra vez
        if (e.key === "Enter") { e.preventDefault(); cerrarEditor(true); mover(0, e.shiftKey ? -1 : 1); rej.focus(); }
        else if (e.key === "Tab") { e.preventDefault(); cerrarEditor(true); mover(e.shiftKey ? -1 : 1, 0); rej.focus(); }
        else if (e.key === "Escape") { e.preventDefault(); cerrarEditor(false); pintarSeleccion(); rej.focus(); }
      }
      /** Mientras se escribe una fórmula, las celdas que usa se marcan. */
      function resaltarRefs(texto) {
        $$("td.ref-fx", rej).forEach((x) => x.classList.remove("ref-fx"));
        if (!texto || texto[0] !== "=") return;
        let n = 0;
        F().refsDe(texto).forEach((r) => {
          if (r.hoja != null || n > 400) return;
          const c1 = Math.min(r.a.c ?? 0, r.b.c ?? 0), c2 = r.tipo === "fila" ? (t.cols || 10) - 1 : Math.max(r.a.c ?? 0, r.b.c ?? 0);
          const f1 = r.tipo === "col" ? 0 : Math.min(r.a.f, r.b.f), f2 = r.tipo === "col" ? (t.filas || 30) - 1 : Math.max(r.a.f, r.b.f);
          for (let f = f1; f <= Math.min(f2, f1 + 200); f++) for (let c = c1; c <= Math.min(c2, c1 + 30); c++) { const td = celda(c, f); if (td) { td.classList.add("ref-fx"); n++; } }
        });
      }

      // ------------------------------------------------------------ 8.1 ayuda al escribir fórmulas
      let ayuda = null, ayudaSel = 0, ayudaLista = [];
      function ocultarAyuda() { if (ayuda) { ayuda.remove(); ayuda = null; } ayudaLista = []; }
      function prepararAyuda(input) {
        if (input._ayuda) return;
        input._ayuda = true;
        input.addEventListener("input", () => mostrarAyuda(input));
        input.addEventListener("click", () => mostrarAyuda(input));
        input.addEventListener("keydown", (e) => {
          if (!ayuda || !ayudaLista.length) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopImmediatePropagation(); ayudaSel = (ayudaSel + (e.key === "ArrowDown" ? 1 : -1) + ayudaLista.length) % ayudaLista.length; pintarAyudaLista(input); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); elegirFuncion(input, ayudaLista[ayudaSel]); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); ocultarAyuda(); }
        }, true);
        input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== input) ocultarAyuda(); }, 150));
      }
      /** El nombre de función que se está escribiendo (antes del cursor), o null. */
      function prefijoFuncion(v, pos) {
        const m = /(^|[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ_.$!'])([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ.]*)$/.exec(v.slice(0, pos));
        return m ? m[2] : null;
      }
      /** La función dentro de la que está el cursor y en qué argumento va. */
      function funcionAbierta(v, pos) {
        let prof = 0, arg = 0, q = false;
        for (let i = pos - 1; i >= 1; i--) {
          const c = v[i];
          if (c === '"') q = !q;
          if (q) continue;
          if (c === ")") prof++;
          else if (c === "(") {
            if (prof === 0) { const m = /([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-z0-9ÁÉÍÓÚÑáéíóúñ.]*)\s*$/.exec(v.slice(0, i)); return m ? { nombre: m[1].toUpperCase(), arg } : null; }
            prof--;
          } else if ((c === ";" || c === ",") && prof === 0) arg++;
        }
        return null;
      }
      function colocarAyuda(input) {
        const r = input.getBoundingClientRect();
        ayuda.style.left = Math.max(8, Math.min(innerWidth - ayuda.offsetWidth - 8, r.left)) + "px";
        const abajo = r.bottom + 4, arriba = r.top - ayuda.offsetHeight - 4;
        ayuda.style.top = (abajo + ayuda.offsetHeight > innerHeight - 8 && arriba > 8 ? arriba : abajo) + "px";
      }
      function mostrarAyuda(input) {
        const v = input.value, pos = input.selectionStart == null ? v.length : input.selectionStart;
        if (!v.startsWith("=")) return ocultarAyuda();
        const pre = prefijoFuncion(v, pos);
        const FIRMAS = F().FIRMAS;
        if (pre) {
          const P = pre.toUpperCase();
          const es = F().NOMBRES.filter((n) => n.startsWith(P));
          const en = Object.keys(F().ALIAS).filter((n) => n.startsWith(P) && /^[A-Z.]+$/.test(n)).map((n) => F().ALIAS[n]);
          ayudaLista = [...new Set(es.concat(en))].slice(0, 8);
          if (ayudaLista.length && !(ayudaLista.length === 1 && ayudaLista[0] === P && v[pos] === "(")) {
            ayudaSel = 0;
            if (!ayuda) { ayuda = html(`<div class="ayuda-fx" role="listbox"></div>`); document.body.append(ayuda); }
            pintarAyudaLista(input);
            return;
          }
        }
        ayudaLista = [];
        const ab = funcionAbierta(v, pos);
        const nombre = ab ? F().ALIAS[ab.nombre] || ab.nombre : null;
        if (ab && FIRMAS[nombre]) {
          if (!ayuda) { ayuda = html(`<div class="ayuda-fx"></div>`); document.body.append(ayuda); }
          const args = FIRMAS[nombre][0].split(";").map((x) => x.trim());
          ayuda.innerHTML = `<div class="firma"><b>${esc(nombre)}</b>(${args.map((a, i) => (i === Math.min(ab.arg, args.length - 1) ? `<u>${esc(a)}</u>` : esc(a))).join("; ")})</div><div class="suave">${esc(FIRMAS[nombre][1])}</div>`;
          colocarAyuda(input);
          return;
        }
        ocultarAyuda();
      }
      function pintarAyudaLista(input) {
        const FIRMAS = F().FIRMAS;
        ayuda.innerHTML = ayudaLista.map((n, i) => `<button type="button" class="ayuda-op ${i === ayudaSel ? "on" : ""}" data-fn="${esc(n)}"><b>${esc(n)}</b><small>${esc(FIRMAS[n] ? FIRMAS[n][1] : "")}</small></button>`).join("");
        ayuda.onpointerdown = (e) => { e.preventDefault(); const b = e.target.closest("[data-fn]"); if (b) elegirFuncion(input, b.dataset.fn); };
        colocarAyuda(input);
      }
      function elegirFuncion(input, nombre) {
        const v = input.value, pos = input.selectionStart == null ? v.length : input.selectionStart;
        const pre = prefijoFuncion(v, pos) || "";
        const antes = v.slice(0, pos - pre.length), despues = v.slice(pos);
        const abre = despues.startsWith("(") ? "" : "(";
        input.value = antes + nombre + abre + despues;
        const p = antes.length + nombre.length + 1;
        input.setSelectionRange(p, p);
        input.dispatchEvent(new Event("input"));
        input.focus();
      }

      // ------------------------------------------------------------ teclado
      rej.addEventListener("keydown", (e) => {
        if (editor || !t) return;
        const mod = e.ctrlKey || e.metaKey;
        const flechas = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        if (flechas[e.key]) { e.preventDefault(); mover(...flechas[e.key], e.shiftKey); return; }
        if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? mover(0, -1) : abrirEditor(null, true); return; }
        if (e.key === "Tab") { e.preventDefault(); mover(e.shiftKey ? -1 : 1, 0); return; }
        if (e.key === "F2") { e.preventDefault(); abrirEditor(null, true); return; }
        if (e.key === "Escape") { if (portapapeles) { portapapeles = null; marcarCopiado(); } return; }
        if ((e.key === "Delete" || e.key === "Backspace") && !ed.soloLectura) { e.preventDefault(); vaciarRango(); return; }
        const k = e.key.toLowerCase();
        if (mod && (k === "f" || k === "h")) { e.preventDefault(); buscar(k === "h"); return; }
        if (mod && k === "b") { e.preventDefault(); alternarFormato("n"); return; }
        if (mod && k === "i") { e.preventDefault(); alternarFormato("i"); return; }
        if (mod && k === "u") { e.preventDefault(); alternarFormato("u"); return; }
        if (mod && k === "d") { e.preventDefault(); rellenarCopia("abajo"); return; }
        if (mod && k === "r") { e.preventDefault(); rellenarCopia("derecha"); return; }
        if (mod && k === "1") { e.preventDefault(); dialogoFormato(); return; }
        if (mod && k === "a") { e.preventDefault(); ancla = { c: 0, f: 0 }; sel = { c: (t.cols || 10) - 1, f: (t.filas || 30) - 1 }; pintarSeleccion(); return; }
        if (mod && e.shiftKey && (e.key === "+" || e.key === "=")) { e.preventDefault(); menuInsertar(celda(sel.c, sel.f) || rej); return; }
        if (mod && e.key === "-") { e.preventDefault(); menuInsertar(celda(sel.c, sel.f) || rej, true); return; }
        if (!mod && !e.altKey && e.key.length === 1) { e.preventDefault(); abrirEditor(e.key); }
      });

      // ------------------------------------------------------------ copiar, cortar y pegar (8.1: las fórmulas se ajustan)
      const valorTexto = (v) => (v instanceof F().FechaF ? F().textoFecha(v) : typeof v === "number" ? String(Math.round(v * 1e10) / 1e10) : F().formatear(v));
      /** Lo que ve la gente, con tabuladores (lo que entienden Excel y Sheets al pegar). */
      function comoTexto(r) {
        const ev = evaluar(), filas = [];
        for (let f = r.f1; f <= r.f2; f++) { const fila = []; for (let c = r.c1; c <= r.c2; c++) fila.push(String(crudo(c, f)).startsWith("=") ? F().aplicarFormato(ev.valor(c, f), prop("f", c, f)) : crudo(c, f)); filas.push(fila.join("\t")); }
        return filas.join("\n");
      }
      function vaciarRango() {
        if (ed.soloLectura || !t) return;
        const r = rango(), campos = {};
        cadaCelda(r, (c, f, ref) => { if (crudo(c, f)) campos["c:" + ref] = ""; });
        if (Object.keys(campos).length) doc().cambiar(t.id, campos);
      }
      async function escribirPortapapeles(texto) {
        try { await navigator.clipboard.writeText(texto); }
        catch (e) {
          // Sin permiso del portapapeles (o en la app): un campo oculto y el copiar de siempre.
          const a = html(`<textarea style="position:fixed;opacity:0;pointer-events:none"></textarea>`);
          a.value = texto; document.body.append(a); a.select();
          try { document.execCommand("copy"); } catch (e2) { /* sin portapapeles */ }
          a.remove(); rej.focus({ preventScroll: true });
        }
      }
      function tomarCopia(cortar) {
        const r = rango(), ev = evaluar(), celdas = [];
        for (let f = r.f1; f <= r.f2; f++) {
          const fila = [];
          for (let c = r.c1; c <= r.c2; c++) {
            const x = { c: crudo(c, f), v: valorTexto(ev.valor(c, f)) };
            FORMATO.forEach((p) => { const y = prop(p, c, f); if (y != null && y !== "" && y !== false) x[p] = y; });
            fila.push(x);
          }
          celdas.push(fila);
        }
        portapapeles = { texto: comoTexto(r), r, celdas, cortado: !!cortar, hoja: t.id };
        return portapapeles;
      }
      async function copiarRango(cortar) {
        const p = tomarCopia(cortar);
        await escribirPortapapeles(p.texto);
        marcarCopiado();
        aviso(cortar ? "Celdas cortadas: elige dónde pegarlas" : "Celdas copiadas", { tipo: "ok", ms: 1600 });
      }
      function marcarCopiado() {
        $$("td.copiada", rej).forEach((x) => x.classList.remove("copiada"));
        if (!portapapeles || portapapeles.hoja !== (t && t.id)) return;
        cadaCelda(portapapeles.r, (c, f) => { const td = celda(c, f); if (td) td.classList.add("copiada"); });
      }
      const mismo = (a, b) => String(a || "").replace(/\r/g, "").trim() === String(b || "").replace(/\r/g, "").trim();
      async function pegarRango(modo) {
        let texto = null;
        try { texto = await navigator.clipboard.readText(); } catch (e) { texto = null; }
        if (portapapeles && (texto == null || mismo(texto, portapapeles.texto))) return pegarInterno(modo || "todo");
        if (texto) return pegarTexto(texto);
        aviso("El navegador no dejó leer el portapapeles. Usa Ctrl+V.", { tipo: "info" });
      }
      rej.addEventListener("copy", (e) => {
        if (editor) return;
        const p = tomarCopia(false);
        e.clipboardData.setData("text/plain", p.texto);
        e.preventDefault();
        marcarCopiado();
      });
      rej.addEventListener("cut", (e) => {
        if (editor || ed.soloLectura) return;
        const p = tomarCopia(true);
        e.clipboardData.setData("text/plain", p.texto);
        e.preventDefault();
        marcarCopiado();
      });
      rej.addEventListener("paste", (e) => {
        if (ed.soloLectura || editor || !t) return;
        e.preventDefault();
        const texto = e.clipboardData.getData("text/plain");
        if (portapapeles && mismo(texto, portapapeles.texto)) pegarInterno("todo");
        else pegarTexto(texto);
      });
      /** Pega lo copiado aquí mismo: las fórmulas se mueven (salvo lo que lleva $), con su formato.
          modo: "todo", "valores" o "formato". Si se eligió un rango más grande, se repite. */
      function pegarInterno(modo) {
        if (ed.soloLectura || !t || !portapapeles) return;
        const p = portapapeles, alto0 = p.celdas.length, ancho0 = p.celdas[0].length;
        const dest = rango();
        const rf = Math.max(1, Math.floor((dest.f2 - dest.f1 + 1) / alto0)), rc = Math.max(1, Math.floor((dest.c2 - dest.c1 + 1) / ancho0));
        const veces = (dest.f2 - dest.f1 + 1) % alto0 === 0 && (dest.c2 - dest.c1 + 1) % ancho0 === 0 ? [rf, rc] : [1, 1];
        const campos = {};
        let maxF = t.filas || 30, maxC = t.cols || 10;
        const escritas = new Set();
        for (let vf = 0; vf < veces[0]; vf++) for (let vc = 0; vc < veces[1]; vc++) {
          const f0 = dest.f1 + vf * alto0, c0 = dest.c1 + vc * ancho0;
          p.celdas.forEach((fila, i) => fila.forEach((x, j) => {
            const c = c0 + j, f = f0 + i, ref = F().ref(c, f);
            escritas.add(ref);
            if (modo !== "formato") {
              let v = modo === "valores" ? x.v : x.c;
              if (modo !== "valores" && String(v).startsWith("=") && !p.cortado) v = F().desplazar(v, c - (p.r.c1 + j), f - (p.r.f1 + i));
              campos["c:" + ref] = v;
            }
            if (modo !== "valores") FORMATO.forEach((k) => { const nv = x[k] == null ? null : x[k], av = t[k + ":" + ref] == null ? null : t[k + ":" + ref]; if (nv !== av) campos[k + ":" + ref] = nv; });
            maxF = Math.max(maxF, f + 2); maxC = Math.max(maxC, c + 2);
          }));
        }
        // Cortar y pegar: lo de origen queda vacío (si no se pegó encima).
        if (p.cortado && p.hoja === t.id) {
          cadaCelda(p.r, (c, f, ref) => {
            if (escritas.has(ref)) return;
            if (crudo(c, f)) campos["c:" + ref] = "";
            FORMATO.forEach((k) => { if (t[k + ":" + ref] != null) campos[k + ":" + ref] = null; });
          });
          portapapeles = null;
        }
        if (maxF > (t.filas || 30)) campos.filas = maxF;
        if (maxC > (t.cols || 10)) campos.cols = maxC;
        doc().cambiar(t.id, campos, { meta: { o: "p", g: NOM.idCorto() + Date.now().toString(36), gn: p.texto.length } });
        ancla = { c: dest.c1, f: dest.f1 }; sel = { c: dest.c1 + ancho0 * veces[1] - 1, f: dest.f1 + alto0 * veces[0] - 1 };
        if (ancla.c === sel.c && ancla.f === sel.f) ancla = null;
        marcarCopiado();
        pintarSeleccion();
      }
      function pegarTexto(texto) {
        if (ed.soloLectura || !t) return;
        const filas = texto.replace(/\r/g, "").split("\n").filter((x, i, a) => x !== "" || i < a.length - 1);
        const campos = {};
        let maxF = t.filas || 30, maxC = t.cols || 10;
        filas.forEach((fila, df) => fila.split("\t").forEach((v, dc) => {
          const ref = F().ref(sel.c + dc, sel.f + df), ent = F().leerEntrada(v);
          campos["c:" + ref] = ent.crudo;
          if (ent.formato && !t["f:" + ref]) campos["f:" + ref] = ent.formato;
          maxF = Math.max(maxF, sel.f + df + 2); maxC = Math.max(maxC, sel.c + dc + 2);
        }));
        if (maxF > (t.filas || 30)) campos.filas = maxF;
        if (maxC > (t.cols || 10)) campos.cols = maxC;
        // 3.1 Lo pegado cuenta aparte de lo tecleado en la bitácora (sin guardar el texto).
        doc().cambiar(t.id, campos, { meta: { o: "p", g: NOM.idCorto() + Date.now().toString(36), gn: Array.from(texto).length } });
      }

      // ------------------------------------------------------------ 8.1 cuadrito de relleno y Ctrl+D / Ctrl+R
      const asa = html(`<div class="asa-relleno" data-asa aria-hidden="true"></div>`);
      function colocarAsa() {
        if (ed.soloLectura || !t || editor) { asa.hidden = true; return; }
        const r = rango(), td = celda(r.c2, r.f2) || celda(visible(r.c2, r.f2).c, visible(r.c2, r.f2).f);
        if (!td) { asa.hidden = true; return; }
        const b = rej.getBoundingClientRect(), x = td.getBoundingClientRect();
        asa.hidden = false;
        asa.style.left = x.right - b.left + rej.scrollLeft - 5 + "px";
        asa.style.top = x.bottom - b.top + rej.scrollTop - 5 + "px";
      }
      let relleno = null;
      asa.addEventListener("pointerdown", (e) => {
        if (ed.soloLectura || !t) return;
        e.preventDefault(); e.stopPropagation();
        if (vistaActual()) return aviso("Quita tu filtro u orden para rellenar", { tipo: "info" });
        asa.setPointerCapture(e.pointerId);
        relleno = { r: rango(), dir: null, n: 0 };
      });
      asa.addEventListener("pointermove", (e) => {
        if (!relleno) return;
        const el = document.elementFromPoint(e.clientX, e.clientY), td = el && el.closest && el.closest("td");
        if (!td || !rej.contains(td)) return;
        const c = +td.dataset.c, f = +td.dataset.f, r = relleno.r;
        const abajo = f - r.f2, arriba = r.f1 - f, der = c - r.c2, izq = r.c1 - c;
        const m = Math.max(abajo, arriba, der, izq);
        relleno.dir = m <= 0 ? null : m === abajo ? "abajo" : m === der ? "derecha" : m === arriba ? "arriba" : "izquierda";
        relleno.n = Math.max(0, m);
        $$("td.relleno-destino", rej).forEach((x) => x.classList.remove("relleno-destino"));
        const d = destinoRelleno(r, relleno.dir, relleno.n);
        if (d) cadaCelda(d, (cc, ff) => { const x = celda(cc, ff); if (x) x.classList.add("relleno-destino"); });
      });
      const terminarRelleno = () => {
        if (!relleno) return;
        $$("td.relleno-destino", rej).forEach((x) => x.classList.remove("relleno-destino"));
        const { r, dir, n } = relleno;
        relleno = null;
        if (dir && n > 0) rellenar(r, dir, n);
      };
      asa.addEventListener("pointerup", terminarRelleno);
      asa.addEventListener("pointercancel", () => { relleno = null; $$("td.relleno-destino", rej).forEach((x) => x.classList.remove("relleno-destino")); });
      function destinoRelleno(r, dir, n) {
        if (!dir || n <= 0) return null;
        if (dir === "abajo") return { c1: r.c1, c2: r.c2, f1: r.f2 + 1, f2: r.f2 + n };
        if (dir === "arriba") return { c1: r.c1, c2: r.c2, f1: Math.max(0, r.f1 - n), f2: r.f1 - 1 };
        if (dir === "derecha") return { c1: r.c2 + 1, c2: r.c2 + n, f1: r.f1, f2: r.f2 };
        return { c1: Math.max(0, r.c1 - n), c2: r.c1 - 1, f1: r.f1, f2: r.f2 };
      }
      /** Continúa la serie del rango r hacia dir, n celdas (como el cuadrito de Excel). */
      function rellenar(r, dir, n, soloCopiar) {
        if (ed.soloLectura || !t) return;
        const campos = {};
        const vertical = dir === "abajo" || dir === "arriba";
        const lineas = vertical ? [r.c1, r.c2] : [r.f1, r.f2];
        for (let l = lineas[0]; l <= lineas[1]; l++) {
          const fuente = [];
          if (vertical) for (let f = r.f1; f <= r.f2; f++) fuente.push({ c: l, f });
          else for (let c = r.c1; c <= r.c2; c++) fuente.push({ c, f: l });
          const orden = dir === "abajo" || dir === "derecha" ? fuente : fuente.slice().reverse();
          const crudos = orden.map((x) => crudo(x.c, x.f));
          const conFormula = soloCopiar || crudos.some((x) => String(x).startsWith("="));
          const serie = conFormula ? null : F().serie(crudos, n);
          for (let k = 0; k < n; k++) {
            const s = orden[k % orden.length];
            const d = vertical ? { c: l, f: dir === "abajo" ? r.f2 + 1 + k : r.f1 - 1 - k } : { c: dir === "derecha" ? r.c2 + 1 + k : r.c1 - 1 - k, f: l };
            if (d.c < 0 || d.f < 0) break;
            const refD = F().ref(d.c, d.f), refS = F().ref(s.c, s.f), cs = crudo(s.c, s.f);
            campos["c:" + refD] = conFormula ? (String(cs).startsWith("=") ? F().desplazar(cs, d.c - s.c, d.f - s.f) : cs) : serie[k];
            FORMATO.forEach((p) => { const x = t[p + ":" + refS], y = t[p + ":" + refD]; if ((x == null ? null : x) !== (y == null ? null : y)) campos[p + ":" + refD] = x == null ? null : x; });
          }
        }
        const dz = destinoRelleno(r, dir, n);
        if (dz) { campos.filas = Math.max(t.filas || 30, dz.f2 + 2); campos.cols = Math.max(t.cols || 10, dz.c2 + 2); }
        doc().cambiar(t.id, campos);
        if (dz) { ancla = { c: Math.min(r.c1, dz.c1), f: Math.min(r.f1, dz.f1) }; sel = { c: Math.max(r.c2, dz.c2), f: Math.max(r.f2, dz.f2) }; pintarSeleccion(); }
      }
      /** Ctrl+D (abajo) y Ctrl+R (derecha): copia la primera fila o columna del rango en las demás. */
      function rellenarCopia(dir) {
        if (ed.soloLectura || !t) return;
        const r = rango();
        if (dir === "abajo") {
          if (r.f1 === r.f2) { if (r.f1 === 0) return; rellenar({ c1: r.c1, c2: r.c2, f1: r.f1 - 1, f2: r.f1 - 1 }, "abajo", 1, true); return; }
          rellenar({ c1: r.c1, c2: r.c2, f1: r.f1, f2: r.f1 }, "abajo", r.f2 - r.f1, true);
        } else {
          if (r.c1 === r.c2) { if (r.c1 === 0) return; rellenar({ c1: r.c1 - 1, c2: r.c1 - 1, f1: r.f1, f2: r.f2 }, "derecha", 1, true); return; }
          rellenar({ c1: r.c1, c2: r.c1, f1: r.f1, f2: r.f2 }, "derecha", r.c2 - r.c1, true);
        }
      }

      // ------------------------------------------------------------ 8.1 insertar y eliminar filas y columnas
      /**
       * eje "f" (filas) o "c" (columnas); en: índice (desde 0); n > 0 inserta n antes de 'en';
       * n < 0 borra -n desde 'en'. Corrige fórmulas (de todas las hojas), formatos, combinadas,
       * anchos, reglas, gráficas, filas fijas y comentarios. Es un solo paso de deshacer.
       */
      function reacomodar(eje, en, n) {
        if (ed.soloLectura || !t || !n) return;
        if (vistaActual()) return aviso("Quita tu filtro u orden para insertar o eliminar " + (eje === "f" ? "filas" : "columnas"), { tipo: "info" });
        const total = eje === "f" ? (t.filas || 30) : (t.cols || 10);
        if (n < 0 && total + n < 1) return aviso("La hoja necesita al menos una " + (eje === "f" ? "fila" : "columna"), { tipo: "info" });
        const nombre = nombreHoja();
        const ajuste = { hoja: nombre, propia: true, eje, en, n };
        const nueva = (x) => (x < en ? x : n > 0 ? x + n : x < en - n ? null : x + n);   // null: se borró
        const nuevos = {};
        for (const k in t) {
          const v = t[k];
          if (v == null || v === "" || v === false) continue;
          const cc = campoCelda(k);
          if (cc) {
            const r = F().parseRef(cc.ref);
            if (cc.p === "m") {
              const m = medida(v);
              if (!m) continue;
              const rg = F().ajustarEstructura("=" + F().ref(r.c, r.f) + ":" + F().ref(r.c + m[0] - 1, r.f + m[1] - 1), ajuste);
              const g = rg.includes("#REF!") ? null : G().rango(rg.slice(1));
              if (g && (g.c2 - g.c1 + 1) * (g.f2 - g.f1 + 1) > 1) nuevos["m:" + F().ref(g.c1, g.f1)] = `${g.c2 - g.c1 + 1}x${g.f2 - g.f1 + 1}`;
              continue;
            }
            const nc = eje === "c" ? nueva(r.c) : r.c, nf = eje === "f" ? nueva(r.f) : r.f;
            if (nc == null || nf == null) continue;
            nuevos[cc.p + ":" + F().ref(nc, nf)] = cc.p === "c" && typeof v === "string" && v[0] === "=" ? F().ajustarEstructura(v, ajuste) : v;
            continue;
          }
          if (k.startsWith("aw:")) { const c = F().colNum(k.slice(3)) - 1, nc = eje === "c" ? nueva(c) : c; if (nc != null) nuevos["aw:" + F().colLetra(nc)] = v; continue; }
          if (k.startsWith("ah:")) { const f = +k.slice(3) - 1, nf = eje === "f" ? nueva(f) : f; if (nf != null) nuevos["ah:" + (nf + 1)] = v; continue; }
          if ((k.startsWith("cf:") || k.startsWith("dv:")) && v.rango) {
            const rg = F().ajustarEstructura("=" + v.rango, ajuste);
            if (!rg.includes("#REF!")) nuevos[k] = Object.assign({}, v, { rango: rg.slice(1) });
          }
        }
        const reacomodable = (k) => !!campoCelda(k) || /^(aw|ah|cf|dv):/.test(k);
        const campos = {};
        for (const k in t) if (reacomodable(k) && t[k] != null && t[k] !== "" && t[k] !== false && !(k in nuevos)) campos[k] = null;
        for (const k in nuevos) if (JSON.stringify(nuevos[k]) !== JSON.stringify(t[k] == null ? null : t[k])) campos[k] = nuevos[k];
        campos[eje === "f" ? "filas" : "cols"] = Math.max(1, total + n);
        const fija = eje === "f" ? t.fijasF : t.fijasC;
        if (fija && en < fija) campos[eje === "f" ? "fijasF" : "fijasC"] = n > 0 ? fija + n : Math.max(en, fija + n) || null;
        if (eje === "c" && t.vistaComun) {
          const vc = JSON.parse(JSON.stringify(t.vistaComun)), fl = {};
          for (const [c, x] of Object.entries(vc.filtros || {})) { const nc = nueva(+c); if (nc != null) fl[nc] = x; }
          vc.filtros = fl;
          if (vc.orden) { const nc = nueva(vc.orden.c); if (nc == null) delete vc.orden; else vc.orden.c = nc; }
          campos.vistaComun = vc;
        }
        doc().lote(() => {
          doc().cambiar(t.id, campos, { meta: { o: "r" } });
          // Las fórmulas de las otras hojas que apuntan a esta.
          F().hojasDe(doc()).forEach((h) => {
            if (h.id === t.id) return;
            const cs = {};
            for (const k in h) if (k.startsWith("c:") && typeof h[k] === "string" && h[k][0] === "=" && h[k].includes("!")) { const nv = F().ajustarEstructura(h[k], Object.assign({}, ajuste, { propia: false })); if (nv !== h[k]) cs[k] = nv; }
            if (Object.keys(cs).length) doc().cambiar(h.id, cs, { meta: { o: "r" } });
          });
          doc().vivos().filter((g) => g.tipo === "grafica" && g.hoja === t.id && g.rango).forEach((g) => {
            const rg = F().ajustarEstructura("=" + g.rango, ajuste);
            if (rg.includes("#REF!")) doc().cambiar(g.id, { eliminado: true });
            else if (rg.slice(1) !== g.rango) doc().cambiar(g.id, { rango: rg.slice(1) });
          });
          doc().comentarios().forEach((cm) => {
            const a = cm.ancla;
            if (!a || a.tipo !== "celda" || a.hoja !== t.id || !a.ref) return;
            const rg = F().ajustarEstructura("=" + a.ref, ajuste);
            if (!rg.includes("#REF!") && rg.slice(1) !== a.ref) doc().cambiar(cm.id, { ancla: Object.assign({}, a, { ref: rg.slice(1) }) });
          });
        });
        // El filtro propio también se corre de columna.
        if (eje === "c" && vistaPropia()) {
          const vp = vistaPropia(), fl = {};
          for (const [c, x] of Object.entries(vp.filtros || {})) { const nc = nueva(+c); if (nc != null) fl[nc] = x; }
          vp.filtros = fl;
          if (vp.orden) { const nc = nueva(vp.orden.c); if (nc == null) delete vp.orden; else vp.orden.c = nc; }
          guardarVista(vp);
        }
        if (n < 0) { sel = { c: eje === "c" ? Math.min(en, Math.max(0, total + n - 1)) : sel.c, f: eje === "f" ? Math.min(en, Math.max(0, total + n - 1)) : sel.f }; ancla = null; }
        aviso((n > 0 ? "Se insert" : "Se elimin") + (Math.abs(n) === 1 ? "ó 1 " : `aron ${Math.abs(n)} `) + (eje === "f" ? (Math.abs(n) === 1 ? "fila" : "filas") : (Math.abs(n) === 1 ? "columna" : "columnas")) + ". Ctrl+Z para deshacer", { tipo: "ok", ms: 2200 });
      }
      const insertarFilas = (antes) => { const r = rango(); reacomodar("f", antes ? r.f1 : r.f2 + 1, r.f2 - r.f1 + 1); };
      const insertarColumnas = (antes) => { const r = rango(); reacomodar("c", antes ? r.c1 : r.c2 + 1, r.c2 - r.c1 + 1); };
      const eliminarFilas = () => { const r = rango(); reacomodar("f", r.f1, -(r.f2 - r.f1 + 1)); };
      const eliminarColumnas = () => { const r = rango(); reacomodar("c", r.c1, -(r.c2 - r.c1 + 1)); };
      function menuInsertar(anc, borrar) {
        const r = rango(), nf = r.f2 - r.f1 + 1, nc = r.c2 - r.c1 + 1;
        const s = (n, a, b) => (n === 1 ? a : `${n} ${b}`);
        NOM.menu(anc, borrar ? [{ titulo: "Eliminar" },
          { texto: "Eliminar " + s(nf, "fila", "filas"), icono: "trash-2", fn: eliminarFilas },
          { texto: "Eliminar " + s(nc, "columna", "columnas"), icono: "trash-2", fn: eliminarColumnas }]
          : [{ titulo: "Insertar" },
            { texto: s(nf, "Fila", "filas") + " arriba", icono: "between-horizontal-start", fn: () => insertarFilas(true) },
            { texto: s(nf, "Fila", "filas") + " abajo", icono: "between-horizontal-end", fn: () => insertarFilas(false) },
            { texto: s(nc, "Columna", "columnas") + " a la izquierda", icono: "between-vertical-start", fn: () => insertarColumnas(true) },
            { texto: s(nc, "Columna", "columnas") + " a la derecha", icono: "between-vertical-end", fn: () => insertarColumnas(false) },
            "-",
            { texto: "Eliminar " + s(nf, "fila", "filas"), icono: "trash-2", fn: eliminarFilas },
            { texto: "Eliminar " + s(nc, "columna", "columnas"), icono: "trash-2", fn: eliminarColumnas }]);
      }

      // ------------------------------------------------------------ 8.1 ancho de columna y alto de fila
      let redim = null;
      const lienzoMedida = document.createElement("canvas").getContext("2d");
      function ajustarAncho(c) {
        if (!t) return;
        const ev = evaluar();
        let max = 40;
        for (let f = 0; f < (t.filas || 30); f++) {
          const ref = F().ref(c, f);
          if (!crudo(c, f) || t["m:" + ref]) continue;
          const tl = +t["tl:" + ref] || 10.5;
          lienzoMedida.font = `${t["n:" + ref] ? 850 : 500} ${tl * 1.333}px Nunito, sans-serif`;
          max = Math.max(max, lienzoMedida.measureText(F().aplicarFormato(ev.valor(c, f), t["f:" + ref])).width + 22);
        }
        doc().cambiar(t.id, { ["aw:" + F().colLetra(c)]: Math.min(600, Math.ceil(max)) });
      }
      function ajustarAlto(f) { if (t) doc().cambiar(t.id, { ["ah:" + (f + 1)]: null }); }
      async function pedirMedida(titulo, actual, def, min, max) {
        const v = await NOM.pedirTexto(titulo, { etiqueta: `En pixeles (normal: ${def})`, valor: String(actual), si: "Aplicar", max: 4 });
        if (v == null) return null;
        const n = Math.round(parseFloat(v));
        if (!(n >= min && n <= max)) { aviso(`Escribe un número entre ${min} y ${max}`, { tipo: "aviso" }); return null; }
        return n;
      }
      async function anchoColumnas() {
        const r = rango(), w = await pedirMedida("Ancho de columna", ancho(r.c1), ANCHO, 24, 800);
        if (w == null) return;
        const campos = {};
        for (let c = r.c1; c <= r.c2; c++) campos["aw:" + F().colLetra(c)] = w === ANCHO ? null : w;
        doc().cambiar(t.id, campos);
      }
      async function altoFilas() {
        const r = rango(), h = await pedirMedida("Alto de fila", alto(r.f1) || ALTO, ALTO, 18, 400);
        if (h == null) return;
        const campos = {};
        for (let f = r.f1; f <= r.f2; f++) campos["ah:" + (f + 1)] = h === ALTO ? null : h;
        doc().cambiar(t.id, campos);
      }
      rej.addEventListener("pointerdown", (e) => {
        const rc = e.target.closest && e.target.closest("[data-redim-c]"), rf = e.target.closest && e.target.closest("[data-redim-f]");
        if ((!rc && !rf) || ed.soloLectura) return;
        e.preventDefault(); e.stopPropagation();
        const c = rc ? +rc.dataset.redimC : null, f = rf ? +rf.dataset.redimF : null;
        redim = { c, f, x0: e.clientX, y0: e.clientY, w0: c != null ? ancho(c) : 0, h0: f != null ? (alto(f) || (rf.closest("tr").offsetHeight)) : 0, el: rc || rf };
        redim.el.setPointerCapture(e.pointerId);
        redim.el.onpointermove = (ev) => {
          if (!redim) return;
          if (redim.c != null) { const w = Math.max(24, Math.min(800, Math.round(redim.w0 + ev.clientX - redim.x0))); const col = rej.querySelectorAll("colgroup col")[redim.c + 1]; if (col) col.style.width = w + "px"; redim.w = w; }
          else { const hh = Math.max(18, Math.min(400, Math.round(redim.h0 + ev.clientY - redim.y0))); const tr = rej.querySelector(`tr[data-fila="${redim.f}"]`); if (tr) tr.style.height = hh + "px"; redim.h = hh; }
        };
        redim.el.onpointerup = () => {
          const x = redim; redim = null;
          x.el.onpointermove = x.el.onpointerup = null;
          if (x.c != null && x.w && x.w !== x.w0) doc().cambiar(t.id, { ["aw:" + F().colLetra(x.c)]: x.w });
          if (x.f != null && x.h && x.h !== x.h0) doc().cambiar(t.id, { ["ah:" + (x.f + 1)]: x.h });
        };
      }, true);
      rej.addEventListener("dblclick", (e) => {
        const rc = e.target.closest && e.target.closest("[data-redim-c]"), rf = e.target.closest && e.target.closest("[data-redim-f]");
        if (rc && !ed.soloLectura) { e.preventDefault(); ajustarAncho(+rc.dataset.redimC); return; }
        if (rf && !ed.soloLectura) { e.preventDefault(); ajustarAlto(+rf.dataset.redimF); return; }
        if (e.target.closest("td")) abrirEditor(null, true);
      });

      // ------------------------------------------------------------ ratón y dedo en las celdas
      rej.addEventListener("pointerdown", (e) => {
        if (e.target.closest("[data-asa]") || e.target.closest(".desplegable-celda")) return;
        const td = e.target.closest("td");
        if (e.pointerType === "touch") dedos.add(e.pointerId);
        if (!td) return;
        const c = +td.dataset.c, f = +td.dataset.f;
        // Escribiendo una fórmula: el clic en otra celda inserta su referencia (como en Excel).
        if (editor && editor.value.startsWith("=") && (c !== editor._c || f !== editor._f)) {
          e.preventDefault();
          const p = editor.selectionStart;
          editor.value = editor.value.slice(0, p) + F().ref(c, f) + editor.value.slice(editor.selectionEnd);
          editor.setSelectionRange(p + F().ref(c, f).length, p + F().ref(c, f).length);
          fx.value = editor.value;
          resaltarRefs(editor.value);
          return;
        }
        if (editor) cerrarEditor(true);
        // Mayús + clic, o un dedo sosteniendo una celda mientras otro toca otra: rango.
        const sumar = e.shiftKey || (e.pointerType === "touch" && dedos.size > 1);
        if (sumar) { if (!ancla) ancla = { ...sel }; } else ancla = { c, f };
        sel = { c, f };
        arrastrando = e.pointerType === "mouse";
        pintarSeleccion();
        if (e.pointerType === "mouse") rej.focus({ preventScroll: true });
        // Una celda con comentario: su hilo se abre en Comentarios.
        if (comentadas.has(F().ref(c, f)) && NOM.comentarios) NOM.comentarios.abrir(ed, comentadas.get(F().ref(c, f)));
      });
      // Clic (o toque sin mantener) en la letra de una columna: su menú; en el número de fila: elige la fila.
      rej.addEventListener("click", (e) => {
        if (e.target.closest("[data-redim-c],[data-redim-f]")) return;
        const th = e.target.closest && e.target.closest("thead th[data-col]");
        if (th && !rej._toqueLargo) { menuColumna(th, +th.dataset.col); return; }
        const thf = e.target.closest && e.target.closest("tbody th[data-filah]");
        if (thf && !rej._toqueLargo && t) { const f = +thf.dataset.filah; if (e.shiftKey && ancla) sel = { c: (t.cols || 10) - 1, f }; else { ancla = { c: 0, f }; sel = { c: (t.cols || 10) - 1, f }; } pintarSeleccion(); return; }
        if (e.target.closest("thead th[data-todo]") && t) { ancla = { c: 0, f: 0 }; sel = { c: (t.cols || 10) - 1, f: (t.filas || 30) - 1 }; pintarSeleccion(); }
      });
      rej.addEventListener("pointermove", (e) => {
        if (!arrastrando) return;
        const td = e.target.closest && e.target.closest("td");
        if (!td) return;
        const c = +td.dataset.c, f = +td.dataset.f;
        if (c !== sel.c || f !== sel.f) { sel = { c, f }; pintarSeleccion(); }
      });
      const soltar = (e) => {
        dedos.delete(e.pointerId);
        arrastrando = false;
        if (ancla && ancla.c === sel.c && ancla.f === sel.f) ancla = null;
      };
      document.addEventListener("pointerup", soltar);
      document.addEventListener("pointercancel", soltar);
      rej.addEventListener("scroll", () => { if (ayuda && editor) colocarAyuda(editor); }, { passive: true });
      prepararAyuda(fx);
      fx.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); ocultarAyuda(); if (escribir(sel.c, sel.f, fx.value)) mover(0, 1); rej.focus(); }
        if (e.key === "Escape") { ocultarAyuda(); fx.value = crudo(sel.c, sel.f); rej.focus(); }
      });
      fx.addEventListener("input", () => resaltarRefs(fx.value));
      fx.addEventListener("blur", () => { resaltarRefs(""); if (fx.value !== crudo(sel.c, sel.f)) escribir(sel.c, sel.f, fx.value); });

      // ------------------------------------------------------------ 8.1 lista desplegable en la celda
      function pintarDesplegable() {
        $$(".desplegable-celda", rej).forEach((x) => x.remove());
        if (ed.soloLectura || !t) return;
        const dv = validacionDe(sel.c, sel.f);
        if (!dv || dv.tipo !== "lista") return;
        const td = celda(sel.c, sel.f);
        if (!td) return;
        const b = rej.getBoundingClientRect(), x = td.getBoundingClientRect();
        const bt = html(`<button class="desplegable-celda" aria-label="Elegir de la lista">${ico("chevron-down", "ico-s")}</button>`);
        bt.style.left = x.right - b.left + rej.scrollLeft - 24 + "px";
        bt.style.top = x.top - b.top + rej.scrollTop + (x.height - 22) / 2 + "px";
        bt.onclick = (e) => {
          e.stopPropagation();
          const c = sel.c, f = sel.f;
          NOM.menu(bt, [{ titulo: "Elige un valor" }, ...(dv.valores || []).slice(0, 60).map((v) => ({ texto: String(v), marcado: String(crudo(c, f)) === String(v), fn: () => escribir(c, f, String(v)) })), "-", { texto: "Vaciar", icono: "eraser", fn: () => escribir(c, f, "") }]);
        };
        rej.append(bt);
      }

      // ------------------------------------------------------------ formato de celdas
      /** Negrita (n), cursiva (i) o subrayado (u) de todo el rango, según la celda activa. */
      function alternarFormato(k) {
        if (ed.soloLectura || !t) return;
        const r = rango(), valor = !t[k + ":" + F().ref(sel.c, sel.f)], campos = {};
        cadaCelda(r, (c, f, ref) => (campos[k + ":" + ref] = valor || null));
        doc().cambiar(t.id, campos);
      }
      /** Pone una propiedad (k) en todo el rango; null la quita. */
      function ponerEnRango(k, valor) {
        if (ed.soloLectura || !t) return;
        const campos = {};
        cadaCelda(rango(), (c, f, ref) => (campos[k + ":" + ref] = valor == null || valor === "" ? null : valor));
        doc().cambiar(t.id, campos);
      }
      const colorCeldas = (color) => ponerEnRango("k", color);
      const rellenoCeldas = (color) => ponerEnRango("r", color);
      const formatoNumero = (cod) => ponerEnRango("f", cod === "General" ? null : cod);
      const alinear = (a) => ponerEnRango("al", a);
      function decimales(delta) {
        if (ed.soloLectura || !t) return;
        const ev = evaluar(), campos = {};
        cadaCelda(rango(), (c, f, ref) => { const v = ev.valor(c, f); if (!F().esNum(v) && v !== "") return; campos["f:" + ref] = F().cambiarDecimales(t["f:" + ref], delta, v); });
        if (Object.keys(campos).length) doc().cambiar(t.id, campos);
      }
      function alternarAjuste() {
        if (!t) return;
        ponerEnRango("aj", t["aj:" + F().ref(sel.c, sel.f)] ? null : true);
      }
      function bordes(tipo) {
        if (ed.soloLectura || !t) return;
        const r = rango(), campos = {};
        cadaCelda(r, (c, f, ref) => {
          const viejo = String(t["bd:" + ref] || "");
          let b = viejo;
          if (tipo === "todos") b = "abid";
          else if (tipo === "ninguno") b = "";
          else if (tipo === "contorno") b = viejo + (f === r.f1 ? "a" : "") + (f === r.f2 ? "b" : "") + (c === r.c1 ? "i" : "") + (c === r.c2 ? "d" : "");
          else if (tipo === "abajo" && f === r.f2) b = viejo + "b";
          else if (tipo === "arriba" && f === r.f1) b = viejo + "a";
          b = [...new Set(b.split(""))].sort().join("");
          if (b !== viejo) campos["bd:" + ref] = b || null;
        });
        doc().cambiar(t.id, campos);
      }
      function combinar() {
        if (ed.soloLectura || !t) return;
        const r = rango(), tl = F().ref(r.c1, r.f1);
        if (t["m:" + tl] || (r.c1 === r.c2 && r.f1 === r.f2)) {
          // Separar: la combinada donde está la celda activa.
          const k = t["m:" + tl] ? "m:" + tl : cubiertas.has(F().ref(sel.c, sel.f)) ? "m:" + cubiertas.get(F().ref(sel.c, sel.f)) : null;
          if (k) { doc().cambiar(t.id, { [k]: null }); aviso("Celdas separadas", { tipo: "ok", ms: 1500 }); }
          else aviso("Elige varias celdas para combinarlas", { tipo: "info" });
          return;
        }
        let otras = 0;
        cadaCelda(r, (c, f) => { if ((c !== r.c1 || f !== r.f1) && crudo(c, f) !== "") otras++; });
        const campos = { ["m:" + tl]: `${r.c2 - r.c1 + 1}x${r.f2 - r.f1 + 1}`, ["al:" + tl]: t["al:" + tl] || "centro" };
        // Combinadas que se enciman con esta: se quitan.
        for (const k in t) if (k.startsWith("m:") && t[k] && k !== "m:" + tl) { const p = F().parseRef(k.slice(2)), m = medida(t[k]); if (p && m && !(p.c > r.c2 || p.c + m[0] - 1 < r.c1 || p.f > r.f2 || p.f + m[1] - 1 < r.f1)) campos[k] = null; }
        doc().cambiar(t.id, campos);
        ancla = null; sel = { c: r.c1, f: r.f1 };
        if (otras) aviso("Al combinar solo se ve lo de la primera celda (lo demás se conserva escondido)", { tipo: "info", ms: 4000 });
      }
      function tamanoLetra(pt) { ponerEnRango("tl", pt === 10.5 ? null : pt); }
      function borrarFormato() {
        if (ed.soloLectura || !t) return;
        const campos = {};
        cadaCelda(rango(), (c, f, ref) => FORMATO.forEach((k) => { if (t[k + ":" + ref] != null) campos[k + ":" + ref] = null; }));
        if (Object.keys(campos).length) doc().cambiar(t.id, campos);
      }
      function menuFormatoNumero(anc) {
        const ev = evaluar(), v = ev.valor(sel.c, sel.f), actual = t["f:" + F().ref(sel.c, sel.f)] || "General";
        const ejemplo = (cod) => (F().esNum(v) ? F().aplicarFormato(v, cod) : null);
        NOM.menu(anc, [{ titulo: "Formato de número" },
          ...F().FORMATOS.map((x) => ({ texto: `${x.t} · ${ejemplo(x.id) || x.ej}`, marcado: actual === x.id, fn: () => formatoNumero(x.id) })),
          "-", { texto: "Más decimales", icono: "plus", fn: () => decimales(1) }, { texto: "Menos decimales", icono: "minus", fn: () => decimales(-1) },
          { texto: "Formato de celdas…", icono: "settings", atajo: "Ctrl+1", fn: dialogoFormato }]);
      }
      function menuBordes(anc) {
        NOM.menu(anc, [{ titulo: "Bordes" },
          { texto: "Todos los bordes", icono: "grid-3x3", fn: () => bordes("todos") },
          { texto: "Contorno", icono: "square", fn: () => bordes("contorno") },
          { texto: "Borde de abajo", icono: "arrow-down", fn: () => bordes("abajo") },
          { texto: "Borde de arriba", icono: "arrow-up", fn: () => bordes("arriba") },
          { texto: "Sin bordes", icono: "x", fn: () => bordes("ninguno") }]);
      }
      function menuAlinear(anc) {
        const a = t["al:" + F().ref(sel.c, sel.f)] || null;
        NOM.menu(anc, [{ titulo: "Alinear" },
          { texto: "Automático (números a la derecha)", marcado: !a, fn: () => alinear(null) },
          { texto: "Izquierda", icono: "align-left", marcado: a === "izq", fn: () => alinear("izq") },
          { texto: "Centro", icono: "align-center", marcado: a === "centro", fn: () => alinear("centro") },
          { texto: "Derecha", icono: "align-right", marcado: a === "der", fn: () => alinear("der") },
          "-", { texto: t["aj:" + F().ref(sel.c, sel.f)] ? "No ajustar el texto" : "Ajustar el texto (varias líneas)", icono: "wrap-text", fn: alternarAjuste }]);
      }
      /** Formato de celdas en una sola ventana (también sirve en el celular). */
      function dialogoFormato() {
        if (ed.soloLectura || !t) return;
        const ref = F().ref(sel.c, sel.f), ev = evaluar(), v = ev.valor(sel.c, sel.f);
        const fmt = t["f:" + ref] || "General", al = t["al:" + ref] || "", tl = +t["tl:" + ref] || 10.5;
        const cuerpo = html(`<form class="col">
          <div class="campo"><label>Número</label><div class="entrada"><select data-fmt>${F().FORMATOS.map((x) => `<option value="${esc(x.id)}" ${fmt === x.id ? "selected" : ""}>${esc(x.t)} · ${esc(F().esNum(v) ? F().aplicarFormato(v, x.id) : x.ej)}</option>`).join("")}${F().FORMATOS.some((x) => x.id === fmt) ? "" : `<option value="${esc(fmt)}" selected>Personalizado: ${esc(fmt)}</option>`}</select></div></div>
          <div class="campo"><label>Código (como en Excel)</label><div class="entrada"><input data-cod value="${esc(fmt)}" spellcheck="false"></div><small class="suave">Ejemplos: 0.00 · #,##0 · $#,##0.00 · 0% · dd/mm/aaaa · "Calif. "0.0</small></div>
          <div class="fila"><div class="campo crece"><label>Alinear</label><div class="entrada"><select data-al><option value="">Automático</option><option value="izq" ${al === "izq" ? "selected" : ""}>Izquierda</option><option value="centro" ${al === "centro" ? "selected" : ""}>Centro</option><option value="der" ${al === "der" ? "selected" : ""}>Derecha</option></select></div></div>
            <div class="campo crece"><label>Tamaño de letra</label><div class="entrada"><select data-tl>${[8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36].map((x) => `<option value="${x}" ${x === tl ? "selected" : ""}>${x}${x === 10.5 ? " (normal)" : ""}</option>`).join("")}</select></div></div></div>
          <label class="interruptor"><input type="checkbox" data-aj ${t["aj:" + ref] ? "checked" : ""}> Ajustar el texto (varias líneas)</label>
          <div class="fila" style="flex-wrap:wrap"><button type="button" class="btn chico" data-color>${ico("baseline", "ico-s")} Color de letra</button><button type="button" class="btn chico" data-relleno>${ico("paint-bucket", "ico-s")} Relleno</button><button type="button" class="btn chico" data-bordes>${ico("grid-3x3", "ico-s")} Bordes</button><button type="button" class="btn chico" data-borrar>${ico("remove-formatting", "ico-s")} Borrar formato</button></div></form>`);
        const pie = html(`<div style="display:contents"><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si>Aplicar</button></div>`);
        const h = NOM.hoja({ titulo: "Formato de celdas · " + textoRango(rango()), icono: "settings", cuerpo, pie });
        $("[data-fmt]", cuerpo).onchange = (e) => { $("[data-cod]", cuerpo).value = e.target.value; };
        $("[data-color]", cuerpo).onclick = (e) => NOM.paleta(e.currentTarget, { titulo: "Color de letra", actual: t["k:" + ref], alElegir: colorCeldas });
        $("[data-relleno]", cuerpo).onclick = (e) => NOM.paleta(e.currentTarget, { titulo: "Relleno", actual: t["r:" + ref], sinColor: "Sin relleno", colores: RELLENOS.concat(NOM.COLORES), alElegir: rellenoCeldas });
        $("[data-bordes]", cuerpo).onclick = (e) => menuBordes(e.currentTarget);
        $("[data-borrar]", cuerpo).onclick = () => { borrarFormato(); h.cerrar(); };
        $("[data-no]", pie).onclick = () => h.cerrar();
        $("[data-si]", pie).onclick = (e) => {
          e.preventDefault();
          const campos = {}, cod = $("[data-cod]", cuerpo).value.trim() || "General", a = $("[data-al]", cuerpo).value, tam = +$("[data-tl]", cuerpo).value, aj = $("[data-aj]", cuerpo).checked;
          cadaCelda(rango(), (c, f, rf) => {
            campos["f:" + rf] = cod === "General" ? null : cod;
            campos["al:" + rf] = a || null;
            campos["tl:" + rf] = tam === 10.5 ? null : tam;
            campos["aj:" + rf] = aj || null;
          });
          doc().cambiar(t.id, campos);
          h.cerrar();
        };
      }

      // ------------------------------------------------------------ 8.1 formato condicional y validación
      const OPS = [[">", "Mayor que"], ["<", "Menor que"], [">=", "Mayor o igual que"], ["<=", "Menor o igual que"], ["=", "Igual a"], ["<>", "Distinto de"], ["entre", "Entre"], ["contiene", "El texto contiene"], ["vacia", "Está vacía"], ["novacia", "No está vacía"]];
      function dialogoCondicional() {
        if (ed.soloLectura || !t) return;
        const lista = reglas("cf");
        const r0 = textoRango(rango().c1 === rango().c2 && rango().f1 === rango().f2 ? (regionDe(sel.c, sel.f) || rango()) : rango());
        let color = "#C00000", fondo = "#F4CCCC";
        const cuerpo = html(`<form class="col">
          ${lista.length ? `<div class="lista">${lista.map((x) => `<div class="lista-item"><span class="muestra-cf" style="color:${esc(x.color || "inherit")};background:${esc(x.fondo || "transparent")}">Aa</span><span class="crece"><b>${esc(x.rango)}</b><small>${esc((OPS.find((o) => o[0] === x.op) || ["", x.op])[1])} ${esc(x.v1 == null ? "" : x.v1)}${x.op === "entre" ? " y " + esc(x.v2) : ""}</small></span><button type="button" class="icono-btn chico" data-quitar="${esc(x.id)}" aria-label="Quitar regla">${ico("trash-2", "ico-s")}</button></div>`).join("")}</div><hr>` : ""}
          <b>Nueva regla</b>
          <div class="campo"><label>Celdas</label><div class="entrada"><input data-rango value="${esc(r0)}" spellcheck="false"></div></div>
          <div class="fila"><div class="campo crece"><label>Si el valor…</label><div class="entrada"><select data-op>${OPS.map(([v, tx]) => `<option value="${v}">${tx}</option>`).join("")}</select></div></div>
            <div class="campo crece" data-c1><label>Valor</label><div class="entrada"><input data-v1 placeholder="6"></div></div>
            <div class="campo crece" data-c2 hidden><label>y</label><div class="entrada"><input data-v2 placeholder="10"></div></div></div>
          <div class="fila" style="flex-wrap:wrap;align-items:center">Se ve así: <span class="muestra-cf" data-muestra>Aa 5.5</span>
            <button type="button" class="btn chico" data-color>${ico("baseline", "ico-s")} Letra</button><button type="button" class="btn chico" data-fondo>${ico("paint-bucket", "ico-s")} Relleno</button>
            <label><input type="checkbox" data-neg> Negrita</label></div>
          <div class="fila" style="flex-wrap:wrap"><span class="suave chico">Rápido:</span><button type="button" class="btn chico" data-rapido="reprobado">Reprobado (&lt; 6) en rojo</button><button type="button" class="btn chico" data-rapido="excelente">10 en verde</button></div></form>`);
        const pie = html(`<div style="display:contents"><button class="btn" type="button" data-no>Cerrar</button><button class="btn primario" data-si>Agregar regla</button></div>`);
        const h = NOM.hoja({ titulo: "Formato condicional", icono: "paint-bucket", cuerpo, pie });
        const muestra = () => { const m = $("[data-muestra]", cuerpo); m.style.color = color || ""; m.style.background = fondo || ""; m.style.fontWeight = $("[data-neg]", cuerpo).checked ? 850 : ""; };
        muestra();
        $("[data-op]", cuerpo).onchange = (e) => { const op = e.target.value; $("[data-c2]", cuerpo).hidden = op !== "entre"; $("[data-c1]", cuerpo).hidden = op === "vacia" || op === "novacia"; };
        $("[data-color]", cuerpo).onclick = (e) => NOM.paleta(e.currentTarget, { titulo: "Color de letra", actual: color, alElegir: (c) => { color = c; muestra(); } });
        $("[data-fondo]", cuerpo).onclick = (e) => NOM.paleta(e.currentTarget, { titulo: "Relleno", actual: fondo, sinColor: "Sin relleno", colores: RELLENOS.concat(NOM.COLORES), alElegir: (c) => { fondo = c; muestra(); } });
        $("[data-neg]", cuerpo).onchange = muestra;
        $$("[data-rapido]", cuerpo).forEach((b) => (b.onclick = () => {
          const rep = b.dataset.rapido === "reprobado";
          $("[data-op]", cuerpo).value = rep ? "<" : "="; $("[data-v1]", cuerpo).value = rep ? "6" : "10";
          color = rep ? "#C00000" : "#1D7A4C"; fondo = rep ? "#F4CCCC" : "#D9EAD3"; muestra();
        }));
        cuerpo.addEventListener("click", (e) => { const q = e.target.closest("[data-quitar]"); if (q) { doc().cambiar(t.id, { [q.dataset.quitar]: null }); h.cerrar(); setTimeout(dialogoCondicional, 50); } });
        $("[data-no]", pie).onclick = () => h.cerrar();
        $("[data-si]", pie).onclick = (e) => {
          e.preventDefault();
          const rg = $("[data-rango]", cuerpo).value.trim().toUpperCase().replace(/\$/g, "");
          if (!G().rango(rg)) return aviso("Escribe las celdas como B2:B40", { tipo: "aviso" });
          const op = $("[data-op]", cuerpo).value;
          doc().cambiar(t.id, { ["cf:" + NOM.idCorto()]: { rango: rg.includes(":") ? rg : rg + ":" + rg, op, v1: $("[data-v1]", cuerpo).value.trim(), v2: $("[data-v2]", cuerpo).value.trim(), color, fondo, negrita: $("[data-neg]", cuerpo).checked || null } });
          h.cerrar();
          aviso("Regla agregada: se aplica sola cuando cambian los valores", { tipo: "ok" });
        };
      }
      function dialogoValidacion() {
        if (ed.soloLectura || !t) return;
        const actual = validacionDe(sel.c, sel.f);
        const cuerpo = html(`<form class="col">
          <div class="campo"><label>Celdas</label><div class="entrada"><input data-rango value="${esc(actual ? actual.rango : textoRango(rango()))}" spellcheck="false"></div></div>
          <div class="segmentado lleno" role="group"><button type="button" data-tipo="lista" aria-pressed="${!actual || actual.tipo === "lista"}">Lista desplegable</button><button type="button" data-tipo="numero" aria-pressed="${!!actual && actual.tipo === "numero"}">Número entre</button></div>
          <div class="campo" data-p="lista"><label>Opciones (una por línea o separadas por coma)</label><div class="entrada"><textarea data-valores rows="4" placeholder="Sí&#10;No&#10;Pendiente">${esc(actual && actual.valores ? actual.valores.join("\n") : "")}</textarea></div></div>
          <div class="fila" data-p="numero" hidden><div class="campo crece"><label>Desde</label><div class="entrada"><input data-min inputmode="decimal" value="${esc(actual && actual.min != null ? actual.min : "")}" placeholder="0"></div></div><div class="campo crece"><label>Hasta</label><div class="entrada"><input data-max inputmode="decimal" value="${esc(actual && actual.max != null ? actual.max : "")}" placeholder="10"></div></div></div>
          <div class="campo"><label>Mensaje si escriben otra cosa (opcional)</label><div class="entrada"><input data-msg maxlength="120" value="${esc(actual && actual.mensaje || "")}"></div></div></form>`);
        const pie = html(`<div style="display:contents">${actual ? `<button class="btn" type="button" data-quitar>Quitar</button>` : ""}<span class="crece"></span><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si>Guardar</button></div>`);
        const h = NOM.hoja({ titulo: "Validación de datos", icono: "list-checks", cuerpo, pie });
        let tipo = actual ? actual.tipo : "lista";
        const ver = () => { $$("[data-tipo]", cuerpo).forEach((b) => b.setAttribute("aria-pressed", b.dataset.tipo === tipo)); $$("[data-p]", cuerpo).forEach((x) => (x.hidden = x.dataset.p !== tipo)); };
        ver();
        $$("[data-tipo]", cuerpo).forEach((b) => (b.onclick = () => { tipo = b.dataset.tipo; ver(); }));
        $("[data-no]", pie).onclick = () => h.cerrar();
        const q = $("[data-quitar]", pie); if (q) q.onclick = () => { doc().cambiar(t.id, { [actual.id]: null }); h.cerrar(); };
        $("[data-si]", pie).onclick = (e) => {
          e.preventDefault();
          const rg = $("[data-rango]", cuerpo).value.trim().toUpperCase().replace(/\$/g, "");
          if (!G().rango(rg)) return aviso("Escribe las celdas como C2:C40", { tipo: "aviso" });
          const regla = { rango: rg.includes(":") ? rg : rg + ":" + rg, tipo, mensaje: $("[data-msg]", cuerpo).value.trim() || null };
          if (tipo === "lista") {
            regla.valores = $("[data-valores]", cuerpo).value.split(/[\n,]/).map((x) => x.trim()).filter(Boolean).slice(0, 200);
            if (!regla.valores.length) return aviso("Escribe al menos una opción", { tipo: "aviso" });
          } else { regla.min = $("[data-min]", cuerpo).value.trim(); regla.max = $("[data-max]", cuerpo).value.trim(); }
          doc().cambiar(t.id, { [actual ? actual.id : "dv:" + NOM.idCorto()]: regla });
          h.cerrar();
        };
      }

      // ------------------------------------------------------------ fórmulas rápidas
      function autosuma() {
        if (ed.soloLectura || !t) return;
        const ev = evaluar();
        let f = sel.f - 1;
        while (f >= 0 && F().esNum(ev.valor(sel.c, f))) f--;
        if (f === sel.f - 1) {
          // Sin números arriba: a la izquierda (como Excel).
          let c = sel.c - 1;
          while (c >= 0 && F().esNum(ev.valor(c, sel.f))) c--;
          if (c === sel.c - 1) return aviso("Coloca la celda debajo (o a la derecha) de números", { tipo: "info" });
          escribir(sel.c, sel.f, `=SUMA(${F().ref(c + 1, sel.f)}:${F().ref(sel.c - 1, sel.f)})`);
          return;
        }
        escribir(sel.c, sel.f, `=SUMA(${F().ref(sel.c, f + 1)}:${F().ref(sel.c, sel.f - 1)})`);
      }
      const FUNCIONES = [["Más usadas", ["SUMA", "PROMEDIO", "MIN", "MAX", "CONTAR", "SI", "REDONDEAR", "BUSCARV"]],
        ["Con condiciones", ["CONTAR.SI", "SUMAR.SI", "PROMEDIO.SI", "CONTAR.SI.CONJUNTO", "SUMAR.SI.CONJUNTO", "SI.CONJUNTO", "SIERROR"]],
        ["Estadística", ["MEDIANA", "MODA", "DESVEST", "JERARQUIA", "K.ESIMO.MAYOR"]],
        ["Texto", ["CONCATENAR", "IZQUIERDA", "DERECHA", "EXTRAE", "MAYUSC", "ESPACIOS", "SUSTITUIR", "TEXTO"]],
        ["Fechas", ["HOY", "AHORA", "FECHA", "DIAS", "AÑO", "MES", "DIA", "SIFECHA"]],
        ["Buscar", ["BUSCARX", "INDICE", "COINCIDIR", "BUSCARH"]]];
      function menuFunciones(anc) {
        NOM.menu(anc, FUNCIONES.flatMap(([g, l]) => [{ titulo: g }, ...l.map((fn) => ({ texto: fn + " · " + ((F().FIRMAS[fn] || [])[1] || ""), fn: () => abrirEditor(`=${fn}(`) }))]));
      }

      // ------------------------------------------------------------ 7 buscar y reemplazar
      let panel = null, hallazgos = [], actual = -1;
      function buscar(reemplazar) {
        if (ed.soloLectura) reemplazar = false;
        if (panel) { panel.classList.toggle("con-reemplazo", !!reemplazar || panel.classList.contains("con-reemplazo")); $("[data-q]", panel).select(); return; }
        panel = html(`<div class="wd-buscar ${reemplazar ? "con-reemplazo" : ""}" role="search">
          <div class="fila"><input data-q placeholder="Buscar en la hoja" aria-label="Buscar"><span data-cuenta class="suave">0/0</span>
            <button class="icono-btn chico" data-b="ant" aria-label="Anterior">${ico("chevron-up", "ico-s")}</button><button class="icono-btn chico" data-b="sig" aria-label="Siguiente">${ico("chevron-down", "ico-s")}</button>
            ${ed.soloLectura ? "" : `<button class="icono-btn chico" data-b="mas" aria-label="Reemplazar" data-micro="Reemplazar||Ctrl+H">${ico("replace", "ico-s")}</button>`}<button class="icono-btn chico" data-b="cerrar" aria-label="Cerrar">${ico("x", "ico-s")}</button></div>
          <div class="fila reemplazo"><input data-r placeholder="Reemplazar con" aria-label="Reemplazar con"><button class="btn chico" data-b="uno">Reemplazar</button><button class="btn chico" data-b="todos">Todos</button></div>
          <div class="fila opciones"><label><input type="checkbox" data-mm> Mayúsculas/minúsculas</label><label><input type="checkbox" data-entera> Celda completa</label><label><input type="checkbox" data-formulas> También en fórmulas</label></div></div>`);
        ed.vista.append(panel);
        const q = $("[data-q]", panel);
        q.addEventListener("input", calcular);
        q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ir(e.shiftKey ? -1 : 1); } if (e.key === "Escape") cerrarBuscar(); });
        $("[data-r]", panel).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); reemplazarUno(); } if (e.key === "Escape") cerrarBuscar(); });
        $$("[data-mm],[data-entera],[data-formulas]", panel).forEach((x) => (x.onchange = calcular));
        panel.addEventListener("click", (e) => {
          const b = e.target.closest("[data-b]");
          if (!b) return;
          ({ ant: () => ir(-1), sig: () => ir(1), cerrar: cerrarBuscar, mas: () => panel.classList.toggle("con-reemplazo"), uno: reemplazarUno, todos: reemplazarTodos })[b.dataset.b]();
        });
        q.focus();
      }
      function patron() {
        const q = $("[data-q]", panel).value;
        if (!q) return null;
        const mm = $("[data-mm]", panel).checked, entera = $("[data-entera]", panel).checked;
        return new RegExp((entera ? "^" : "") + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + (entera ? "$" : ""), "g" + (mm ? "" : "i"));
      }
      function calcular() {
        if (!panel || !t) return;
        const re = patron(), formulas = $("[data-formulas]", panel).checked, ev = evaluar();
        hallazgos = [];
        if (re) {
          for (const f of visibles) for (let c = 0; c < (t.cols || 10); c++) {
            const crudoV = String(crudo(c, f));
            if (!crudoV) continue;
            const donde = crudoV.startsWith("=") ? (formulas ? crudoV : String(F().aplicarFormato(ev.valor(c, f), prop("f", c, f)))) : crudoV;
            re.lastIndex = 0;
            if (re.test(donde)) hallazgos.push({ c, f, ref: F().ref(c, f) });
          }
        }
        halladas = new Set(hallazgos.map((h) => h.ref));
        $$("td.hallada", rej).forEach((x) => x.classList.remove("hallada"));
        hallazgos.forEach((h) => { const td = celda(h.c, h.f); if (td) td.classList.add("hallada"); });
        actual = hallazgos.length ? Math.max(0, hallazgos.findIndex((h) => visibles.indexOf(h.f) >= visibles.indexOf(sel.f))) : -1;
        $("[data-cuenta]", panel).textContent = hallazgos.length ? `${actual + 1}/${hallazgos.length}` : "0/0";
      }
      function ir(d) {
        if (!hallazgos.length) return;
        actual = (actual + d + hallazgos.length) % hallazgos.length;
        const h = hallazgos[actual];
        ancla = null; sel = { c: h.c, f: h.f };
        pintarSeleccion();
        $("[data-cuenta]", panel).textContent = `${actual + 1}/${hallazgos.length}`;
      }
      function reemplazo(v) {
        const re = patron(), r = $("[data-r]", panel).value;
        return String(v).replace(re, () => r);
      }
      function reemplazarUno() {
        if (ed.soloLectura || actual < 0 || !hallazgos[actual]) return;
        const h = hallazgos[actual], v = crudo(h.c, h.f);
        if (String(v).startsWith("=") && !$("[data-formulas]", panel).checked) return aviso("Es una fórmula: marca “También en fórmulas” para cambiarla", { tipo: "info" });
        escribir(h.c, h.f, reemplazo(v));
        setTimeout(calcular, 30);
      }
      function reemplazarTodos() {
        if (ed.soloLectura || !hallazgos.length) return;
        const formulas = $("[data-formulas]", panel).checked, campos = {};
        let n = 0;
        hallazgos.forEach((h) => { const v = String(crudo(h.c, h.f)); if (v.startsWith("=") && !formulas) return; const nv = reemplazo(v); if (nv !== v) { campos["c:" + h.ref] = nv; n++; } });
        if (n) doc().cambiar(t.id, campos);
        aviso(`${n} celda(s) reemplazada(s)`, { tipo: "ok" });
        setTimeout(calcular, 30);
      }
      function cerrarBuscar() {
        if (!panel) return;
        panel.remove(); panel = null; hallazgos = []; halladas = new Set();
        $$("td.hallada", rej).forEach((x) => x.classList.remove("hallada"));
        rej.focus({ preventScroll: true });
      }

      // ------------------------------------------------------------ ruedita
      // Sale al mantener presionada una celda (dedo o clic, también en una pausa al elegir un rango
      // arrastrando) o con clic derecho, centrada en el dedo o el cursor. Mismo orden que en los
      // demás editores: negrita, cursiva, subrayado, color, borrar, copiar, fórmulas, más.
      // En el encabezado de una columna: ordenar, filtrar, insertar y ancho; en el número de fila:
      // insertar, eliminar, alto y fijar.
      function accionesCeldas() {
        const ref = F().ref(sel.c, sel.f), lect = ed.soloLectura || !t;
        const funcion = (fn) => ({ texto: fn, corto: fn.length > 8 ? fn.slice(0, 7) + "…" : fn, icono: "sigma", fn: () => abrirEditor(`=${fn}(`) });
        const colores = COLORES_CELDA.map((c) => ({ texto: c === "#000000" ? "Automático" : c, corto: " ", color: c, mantener: true, fn: () => colorCeldas(c === "#000000" ? null : c) }));
        const rellenos = RELLENOS.slice(0, 7).map((c) => ({ texto: c, corto: " ", color: c, mantener: true, fn: () => rellenoCeldas(c) })).concat([{ texto: "Sin relleno", icono: "x", mantener: true, fn: () => rellenoCeldas(null) }]);
        return [
          { texto: "Negrita", icono: "bold", off: lect, marcado: !!(t && t["n:" + ref]), mantener: true, fn: () => alternarFormato("n") },
          { texto: "Cursiva", icono: "italic", off: lect, marcado: !!(t && t["i:" + ref]), mantener: true, fn: () => alternarFormato("i") },
          { texto: "Subrayado", icono: "underline", off: lect, marcado: !!(t && t["u:" + ref]), mantener: true, fn: () => alternarFormato("u") },
          { texto: "Color", icono: "baseline", off: lect, sub: colores.slice(0, 7).concat([{ texto: "Relleno", icono: "paint-bucket", sub: rellenos }]) },
          { texto: "Borrar", icono: "eraser", off: lect, fn: vaciarRango },
          { texto: "Copiar", icono: "copy", fn: () => copiarRango(false) },
          { texto: "Formato", icono: "paintbrush", off: lect, sub: [
            { texto: "Autosuma", icono: "sigma", fn: autosuma },
            { texto: "Funciones", icono: "wand-sparkles", sub: ["SUMA", "PROMEDIO", "SI", "BUSCARV", "CONTAR.SI", "SUMAR.SI", "HOY", "MAX"].map(funcion) },
            { texto: "Número", icono: "hash", sub: [["General", "General"], ["0", "Entero"], ["#,##0.00", "2 decimales"], ["$#,##0.00", "Moneda"], ["0%", "Porcentaje"], ["dd/mm/yyyy", "Fecha"], ["@", "Texto"]].map(([cod, tx]) => ({ texto: tx, icono: "hash", marcado: (t && t["f:" + ref] || "General") === cod, fn: () => formatoNumero(cod) })) },
            { texto: "Alinear", icono: "align-center", sub: [{ texto: "Izquierda", icono: "align-left", fn: () => alinear("izq") }, { texto: "Centro", icono: "align-center", fn: () => alinear("centro") }, { texto: "Derecha", icono: "align-right", fn: () => alinear("der") }, { texto: "Automático", icono: "x", fn: () => alinear(null) }] },
            { texto: "Bordes", icono: "grid-3x3", sub: [{ texto: "Todos", icono: "grid-3x3", fn: () => bordes("todos") }, { texto: "Contorno", icono: "square", fn: () => bordes("contorno") }, { texto: "Abajo", icono: "arrow-down", fn: () => bordes("abajo") }, { texto: "Sin bordes", icono: "x", fn: () => bordes("ninguno") }] },
            { texto: "Combinar", icono: "table-cells-merge", fn: combinar },
            { texto: "Ajustar texto", corto: "Ajustar", icono: "wrap-text", marcado: !!(t && t["aj:" + ref]), fn: alternarAjuste },
            { texto: "Formato de celdas…", corto: "Todo…", icono: "settings", fn: dialogoFormato }] },
          { texto: "Más", icono: "more-horizontal", sub: [
            { texto: "Cortar", icono: "scissors", off: lect, fn: () => copiarRango(true) },
            { texto: "Pegar", icono: "clipboard-paste", off: lect, fn: () => pegarRango("todo") },
            { texto: "Pegar especial", corto: "Pegar…", icono: "clipboard-copy", off: lect || !portapapeles, sub: [{ texto: "Solo valores", corto: "Valores", icono: "hash", fn: () => pegarRango("valores") }, { texto: "Solo formato", corto: "Formato", icono: "paintbrush", fn: () => pegarRango("formato") }] },
            { texto: "Insertar", icono: "between-horizontal-start", off: lect, sub: [
              { texto: "Fila arriba", icono: "between-horizontal-start", fn: () => insertarFilas(true) }, { texto: "Fila abajo", icono: "between-horizontal-end", fn: () => insertarFilas(false) },
              { texto: "Columna izquierda", corto: "Col. izq.", icono: "between-vertical-start", fn: () => insertarColumnas(true) }, { texto: "Columna derecha", corto: "Col. der.", icono: "between-vertical-end", fn: () => insertarColumnas(false) },
              { texto: "Eliminar fila", corto: "− Fila", icono: "trash-2", fn: eliminarFilas }, { texto: "Eliminar columna", corto: "− Col.", icono: "trash-2", fn: eliminarColumnas }] },
            { texto: "Rellenar", icono: "arrow-down-to-line", off: lect, sub: [{ texto: "Hacia abajo", corto: "Abajo", icono: "arrow-down", fn: () => rellenarCopia("abajo") }, { texto: "Hacia la derecha", corto: "Derecha", icono: "arrow-right", fn: () => rellenarCopia("derecha") }] },
            { texto: "Editar celda", corto: "Editar", icono: "type", off: lect, fn: () => abrirEditor(null, true) },
            { texto: "Gráfica", icono: "bar-chart", off: lect, fn: () => nuevaGrafica("barras") },
            { texto: "Otras", icono: "more-vertical", sub: [
              { texto: "Buscar", icono: "search", fn: () => buscar(false) },
              { texto: "Comentar", icono: "message-square", off: !NOM.comentarios || ed.local, fn: () => NOM.comentarios.nuevo(ed) },
              { texto: "Fijar", icono: "snowflake", off: lect, sub: menuFijar(null).filter((x) => x && x.texto).map((x) => Object.assign({}, x, { corto: x.texto.replace(/^Hasta la /, "Hasta ").slice(0, 14) })) },
              { texto: "Lista desplegable…", corto: "Lista…", icono: "list-checks", off: lect, fn: dialogoValidacion },
              { texto: "Formato condicional…", corto: "Condicional", icono: "paint-bucket", off: lect, fn: dialogoCondicional },
              { texto: "Borrar formato", corto: "Sin formato", icono: "remove-formatting", off: lect, fn: borrarFormato },
              { texto: "Ancho de columna…", corto: "Ancho…", icono: "move-horizontal", off: lect, fn: anchoColumnas },
              { texto: "Alto de fila…", corto: "Alto…", icono: "move-vertical", off: lect, fn: altoFilas }] }] },
        ];
      }
      function accionesColumna(c) {
        const v = vistaActual() || {}, filtrada = !!(v.filtros || {})[c], lect = ed.soloLectura;
        return [
          { texto: "Ordenar A → Z", corto: "A → Z", icono: "arrow-up", marcado: !!(v.orden && v.orden.c === c && v.orden.asc), fn: () => ordenar(c, true) },
          { texto: "Ordenar Z → A", corto: "Z → A", icono: "arrow-down", marcado: !!(v.orden && v.orden.c === c && !v.orden.asc), fn: () => ordenar(c, false) },
          { texto: "Filtrar…", icono: "filter", marcado: filtrada, fn: () => dialogoFiltro(c) },
          { texto: "Quitar filtro u orden", corto: "Quitar", icono: "x", off: !filtrada && !v.orden, fn: () => { if (filtrada) quitarFiltro(c); else cambiarVista((x) => { delete x.orden; }); } },
          { texto: "Insertar o eliminar", corto: "Insertar", icono: "between-vertical-start", off: lect, sub: [
            { texto: "Columna a la izquierda", corto: "Izquierda", icono: "between-vertical-start", fn: () => insertarColumnas(true) },
            { texto: "Columna a la derecha", corto: "Derecha", icono: "between-vertical-end", fn: () => insertarColumnas(false) },
            { texto: "Eliminar columna", corto: "Eliminar", icono: "trash-2", fn: eliminarColumnas }] },
          { texto: "Ancho", icono: "move-horizontal", off: lect, sub: [{ texto: "Ancho de columna…", corto: "Ancho…", icono: "move-horizontal", fn: anchoColumnas }, { texto: "Ajustar al contenido", corto: "Ajustar", icono: "maximize-2", fn: () => { const r = rango(); for (let k = r.c1; k <= r.c2; k++) ajustarAncho(k); } }] },
          { texto: "Ordenar para todos", corto: "Para todos", icono: "arrow-up-down", off: lect, sub: [{ texto: "A → Z (cambia las celdas)", corto: "A → Z", icono: "arrow-up", fn: () => ordenarDeVerdad(c, true) }, { texto: "Z → A (cambia las celdas)", corto: "Z → A", icono: "arrow-down", fn: () => ordenarDeVerdad(c, false) }] },
          { texto: "Más", icono: "more-horizontal", sub: [
            { texto: `Fijar hasta ${F().colLetra(c)}`, icono: "snowflake", off: lect, fn: () => fijar({ fijasC: c + 1 }) },
            { texto: "Gráfica de la columna", corto: "Gráfica", icono: "bar-chart", off: lect, fn: () => { ancla = { c, f: 0 }; sel = { c, f: (t.filas || 30) - 1 }; const r = regionDe(c, 0) || regionDe(c, 1); if (r) { ancla = { c: Math.max(0, r.c1), f: r.f1 }; sel = { c: r.c2, f: r.f2 }; } nuevaGrafica("barras"); } },
            { texto: "Lista desplegable…", corto: "Lista…", icono: "list-checks", off: lect, fn: dialogoValidacion },
            { texto: "Formato condicional…", corto: "Condicional", icono: "paint-bucket", off: lect, fn: dialogoCondicional }] },
        ];
      }
      /** Al tocar una columna (o su menú): si ya estaba dentro de lo elegido, se queda el rango. */
      function elegirColumna(c) {
        const r = rango();
        const completa = r.f1 === 0 && r.f2 >= (t.filas || 30) - 1;
        if (!(completa && c >= r.c1 && c <= r.c2)) { ancla = { c, f: visibles[0] || 0 }; sel = { c, f: visibles[visibles.length - 1] || 0 }; }
        pintarSeleccion();
      }
      function menuColumna(anc, c) {
        elegirColumna(c);
        const l = accionesColumna(c);
        NOM.menu(anc, [{ titulo: "Columna " + F().colLetra(c) }, ...l.flatMap((x) => (x.sub ? x.sub.map((y) => Object.assign({}, y, { texto: (x.texto === "Más" ? "" : x.texto + ": ") + y.texto })) : [x])).filter((x) => !x.off)]);
      }
      function accionesFila(f) {
        const n = visibles.indexOf(f) + 1, lect = ed.soloLectura;
        return [
          { texto: "Insertar fila arriba", corto: "Arriba", icono: "between-horizontal-start", off: lect, fn: () => insertarFilas(true) },
          { texto: "Insertar fila abajo", corto: "Abajo", icono: "between-horizontal-end", off: lect, fn: () => insertarFilas(false) },
          { texto: "Eliminar fila", corto: "Eliminar", icono: "trash-2", off: lect, fn: eliminarFilas },
          { texto: "Alto de fila…", corto: "Alto…", icono: "move-vertical", off: lect, fn: altoFilas },
          { texto: `Fijar hasta la fila ${n}`, corto: "Fijar aquí", icono: "snowflake", off: lect, fn: () => fijar({ fijasF: n }) },
          { texto: "Fijar la fila 1", corto: "Fila 1", icono: "rows-3", off: lect, fn: () => fijar({ fijasF: 1 }) },
          { texto: "No fijar", icono: "x", off: lect, fn: () => fijar({ fijasF: null }) },
        ];
      }
      NOM.rueda.enlazar(rej, (e) => {
        if (e.target.closest && e.target.closest("[data-asa],[data-redim-c],[data-redim-f]")) return null;
        const thc = e.target.closest && e.target.closest("thead th[data-col]");
        if (thc) { rej._toqueLargo = true; setTimeout(() => (rej._toqueLargo = false), 600); elegirColumna(+thc.dataset.col); const l = accionesColumna(+thc.dataset.col); l.titulo = "Columna " + F().colLetra(+thc.dataset.col); return l; }
        const thf = e.target.closest && e.target.closest("tbody th[data-filah]");
        if (thf) {
          rej._toqueLargo = true; setTimeout(() => (rej._toqueLargo = false), 600);
          const f = +thf.dataset.filah, r = rango();
          if (!(f >= r.f1 && f <= r.f2 && r.c1 === 0)) { ancla = { c: 0, f }; sel = { c: (t.cols || 10) - 1, f }; pintarSeleccion(); }
          const l = accionesFila(f);
          l.titulo = "Fila " + (f + 1);
          return l;
        }
        const td = e.target.closest && e.target.closest("td");
        if (!td) return null;
        const c = +td.dataset.c, f = +td.dataset.f, r = rango();
        if (!(c >= r.c1 && c <= r.c2 && f >= r.f1 && f <= r.f2)) { ancla = null; sel = { c, f }; pintarSeleccion(); }
        arrastrando = false;
        const l = accionesCeldas();
        l.titulo = textoRango(rango());
        return l;
      }, { titulo: "Celdas", rearmar: (e) => e.pointerType === "mouse", ignorar: () => !!editor });

      // ------------------------------------------------------------ barra de herramientas
      const btnTexto = (id, texto, micro, fn, clase) => ({ html: `<button class="icono-btn texto-btn ${clase || ""}" data-micro="${esc(micro)}" aria-label="${esc(micro.split("|")[0])}">${texto}</button>`, montar: (n) => { n.addEventListener("pointerdown", (e) => e.preventDefault()); n.onclick = () => fn(n); } });
      this._herr = [
        { id: "negrita", icono: "bold", micro: "Negrita|Para encabezados y totales.|Ctrl+B", fn: () => alternarFormato("n") },
        { id: "cursiva", icono: "italic", micro: "Cursiva||Ctrl+I", fn: () => alternarFormato("i") },
        { id: "subrayado", icono: "underline", micro: "Subrayado||Ctrl+U", fn: () => alternarFormato("u"), clase: "solo-escritorio" },
        { id: "color", icono: "baseline", micro: "Color de letra", fn: (e, b) => NOM.paleta(b, { titulo: "Color de letra", actual: t && t["k:" + F().ref(sel.c, sel.f)], alElegir: colorCeldas }) },
        { id: "relleno", icono: "paint-bucket", micro: "Relleno|Color de fondo de las celdas.", fn: (e, b) => NOM.paleta(b, { titulo: "Relleno", actual: t && t["r:" + F().ref(sel.c, sel.f)], sinColor: "Sin relleno", colores: RELLENOS.concat(NOM.COLORES), alElegir: rellenoCeldas }) },
        "|",
        btnTexto("numero", "123", "Formato de número|Moneda, porcentaje, fecha, decimales…|Ctrl+1", (b) => menuFormatoNumero(b)),
        btnTexto("pct", "%", "Porcentaje|0.5 se ve como 50%.", () => formatoNumero("0%"), "solo-escritorio"),
        btnTexto("dec-menos", ".0←", "Menos decimales", () => decimales(-1), "solo-escritorio"),
        btnTexto("dec-mas", ".00→", "Más decimales", () => decimales(1), "solo-escritorio"),
        { id: "alinear", icono: "align-left", micro: "Alinear y ajustar texto", fn: (e, b) => menuAlinear(b) },
        { id: "bordes", icono: "grid-3x3", micro: "Bordes", fn: (e, b) => menuBordes(b) },
        { id: "combinar", icono: "table-cells-merge", micro: "Combinar celdas|Une las celdas elegidas (para títulos). Otra vez para separarlas.", fn: combinar },
        "|",
        { id: "suma", icono: "sigma", micro: "Autosuma|Suma los números que están arriba de la celda.", fn: autosuma },
        { id: "funciones", icono: "wand-sparkles", micro: "Funciones|Más de 80: SUMA, PROMEDIO, SI, BUSCARV, CONTAR.SI…", fn: (e, b) => menuFunciones(b) },
        "|",
        { id: "filtro", icono: "filter", micro: "Ordenar y filtrar|Solo cambia lo que tú ves. Toca la letra de una columna.", fn: (e, b) => menuColumna(b, sel.c), activo: () => !!vistaActual() },
        { id: "fijar", icono: "snowflake", micro: "Fijar filas y columnas|Se quedan a la vista al desplazarte (para todos).", fn: (e, b) => menuFijar(b), off: () => ed.soloLectura, clase: "solo-escritorio" },
        { id: "grafica", icono: "bar-chart", micro: "Gráfica|De las celdas elegidas (o de la tabla donde estás).", fn: (e, b) => NOM.menu(b, [{ titulo: "Nueva gráfica" }, ...G().TIPOS.map(([v, tx, i]) => ({ texto: tx, icono: i, fn: () => nuevaGrafica(v) }))]) },
        { id: "buscar", icono: "search", micro: "Buscar y reemplazar||Ctrl+F", fn: () => buscar(false) },
        "|",
        { id: "insertar", icono: "between-horizontal-start", micro: "Insertar o eliminar filas y columnas|Donde está la celda elegida.|Ctrl+Mayús++", fn: (e, b) => menuInsertar(b) },
        { id: "mas-hoja", icono: "more-vertical", micro: "Más|Formato condicional, lista desplegable, rellenar, pegar valores…", fn: (e, b) => NOM.menu(b, [
          { titulo: "Celdas" },
          { texto: "Formato de celdas…", icono: "settings", atajo: "Ctrl+1", fn: dialogoFormato },
          { texto: "Formato condicional…", icono: "paint-bucket", fn: dialogoCondicional },
          { texto: "Lista desplegable o validación…", icono: "list-checks", fn: dialogoValidacion },
          { texto: "Borrar formato", icono: "remove-formatting", fn: borrarFormato },
          { texto: "Rellenar hacia abajo", icono: "arrow-down", atajo: "Ctrl+D", fn: () => rellenarCopia("abajo") },
          { texto: "Rellenar hacia la derecha", icono: "arrow-right", atajo: "Ctrl+R", fn: () => rellenarCopia("derecha") },
          { texto: "Pegar solo valores", icono: "hash", fn: () => pegarRango("valores") },
          { titulo: "Hoja" },
          { texto: "Ancho de columna…", icono: "move-horizontal", fn: anchoColumnas },
          { texto: "Alto de fila…", icono: "move-vertical", fn: altoFilas },
          { texto: "Agregar 10 filas al final", icono: "rows-3", fn: () => t && doc().cambiar(t.id, { filas: (t.filas || 30) + 10 }) },
          { texto: "Agregar 2 columnas", icono: "columns-3", fn: () => t && doc().cambiar(t.id, { cols: (t.cols || 10) + 2 }) },
          { texto: "Cambiar el nombre de la hoja", icono: "pencil", fn: () => renombrarHoja(ed.pagina) },
        ].filter((x) => !(ed.soloLectura && x.fn))) },
      ];

      /** Actualiza solo los valores visibles; no reconstruye la tabla (no estorba a quien escribe). */
      function actualizarValores() {
        const ev = evaluar(), conds = reglas("cf");
        $$("td", rej).forEach((td) => {
          const c = +td.dataset.c, f = +td.dataset.f, ref = F().ref(c, f);
          const a = aspecto(c, f, ev, conds);
          if (td.textContent !== a.txt) td.textContent = a.txt;
          td.classList.toggle("num", a.num);
          td.classList.toggle("err", a.err);
          td.toggleAttribute("data-negrita", a.negrita);
          td.toggleAttribute("data-cursiva", !!t["i:" + ref]);
          td.toggleAttribute("data-subrayado", !!t["u:" + ref]);
          if ((td.getAttribute("style") || "") !== a.st) { if (a.st) td.setAttribute("style", a.st); else td.removeAttribute("style"); }
          td.title = a.formula;
        });
        pintarGraficas();
        aplicarFijas();
        colocarAsa();
        if (document.activeElement !== fx && !editor) fx.value = crudo(sel.c, sel.f);
      }
      /** ¿El cambio altera la forma de la tabla (columnas, filas, combinadas, anchos…)? Entonces se repinta todo. */
      const deForma = (k) => /^(filas|cols|fijasF|fijasC|vistaComun|nombre|tipo|eliminado)$/.test(k) || /^(m|aw|ah|dv):/.test(k);

      this.cambios = (lista) => {
        const tId = t && t.id;
        const deGraficas = lista.some((c) => doc().valor(c.bloque, "tipo") === "grafica");
        const deTablas = lista.some((c) => c.bloque !== tId && doc().valor(c.bloque, "tipo") === "tabla");
        if (lista.some((c) => c.bloque === tId || c.bloque === "_doc" || c.campos.tipo === "tabla")) {
          const forma = lista.some((c) => c.bloque === "_doc" || (c.bloque === tId && Object.keys(c.campos).some(deForma)) || (c.campos.tipo === "tabla" && c.bloque !== tId));
          t = tabla();
          // Con filtro u orden, un valor nuevo puede cambiar qué filas se ven: se repinta todo.
          if (!forma && !vistaActual() && t) { actualizarValores(); return; }
          const scroll = [rej.scrollLeft, rej.scrollTop];
          const e = editor;
          if (e) e.remove();
          render();
          if (e) { rej.append(e); e.focus(); }
          rej.scrollLeft = scroll[0]; rej.scrollTop = scroll[1];
        } else if (deTablas && t) actualizarValores();   // fórmulas que leen otra hoja
        else if (deGraficas) pintarGraficas();
        else pintarBandeja();
      };
      this.desmontar = () => { cerrarEditor(true); cerrarBuscar(); ocultarAyuda(); document.removeEventListener("pointerup", soltar); document.removeEventListener("pointercancel", soltar); ed.lienzo.style.overflow = ""; };
      // 3.4 Celdas que cambiaron otros desde la última visita.
      this.resaltarCambios = (c) => {
        resaltadas = new Set();
        if (c && c.cambios && t && (c.cambios.bloques || []).includes(t.id)) (c.cambios.celdas || []).forEach((k) => resaltadas.add(k.replace(/^c:/, "")));
        render();
      };
      // 7 Comentarios en celdas.
      this.comentarios = {
        ancla: () => (t ? { tipo: "celda", hoja: t.id, ref: F().ref(sel.c, sel.f), pagina: ed.pagina, cita: "Celda " + F().ref(sel.c, sel.f) + (crudo(sel.c, sel.f) ? ": " + String(crudo(sel.c, sel.f)).slice(0, 80) : "") } : null),
        irA: (a) => {
          if (a.pagina && a.pagina !== ed.pagina && doc().paginas().includes(a.pagina)) { ed.pagina = a.pagina; render(); }
          const p = F().parseRef(a.ref || "");
          if (!p) return false;
          ancla = null; sel = { c: p.c, f: p.f }; pintarSeleccion(); rej.focus({ preventScroll: true });
          return true;
        },
        pintar: (l) => { comentadas = new Map(); (l || []).forEach((c) => { if (!c.resuelto && c.ancla && c.ancla.tipo === "celda" && (!t || c.ancla.hoja === t.id)) comentadas.set(c.ancla.ref, c.id); }); render(); },
      };
      // Lo que usan otros módulos (datos → reporte, combinar correspondencia).
      this.api = { rango, tabla: () => t, evaluar, seleccion: () => ({ ...sel }) };
      void self;

      render();
      if (matchMedia("(hover: hover)").matches) rej.focus({ preventScroll: true });
    },
    herramientas() { return this._herr || []; },
    acciones() {
      return [
        ...(NOM.datos ? [{ texto: "Hacer un reporte con estos datos", icono: "bar-chart", fn: () => NOM.datos.reporteDeDatos(NOM.editorActual), claves: "encuesta google forms resumen graficas frecuencias estadistica" }] : []),
        { texto: "Insertar fila o columna", icono: "between-horizontal-start", fn: () => { const b = document.querySelector('[data-micro^="Insertar o eliminar filas"]'); if (b) b.click(); }, claves: "fila columna insertar eliminar borrar" },
        { texto: "Formato de celdas", icono: "settings", atajo: "Ctrl 1", fn: () => document.querySelector("[data-rejilla]") && document.querySelector("[data-rejilla]").dispatchEvent(new KeyboardEvent("keydown", { key: "1", ctrlKey: true, bubbles: true })), claves: "moneda porcentaje decimales fecha alinear bordes relleno" },
      ];
    },
  };
})();
