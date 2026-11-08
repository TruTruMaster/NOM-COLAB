/* NOM-COLAB · Modo Hoja. Cada celda es un campo del bloque tabla ("c:A1"), así dos
   personas pueden escribir en celdas distintas a la vez y el CRDT no pierde ninguna.

   4.1 Filtro y orden personales: se guardan solo en este equipo y para esta cuenta
   (nom.u.<cuenta>.filtro.<documento>), nunca en el documento. Se pinta una vista de las filas,
   ordenada y filtrada; lo que se edita va siempre a la celda real. "Aplicar a todos" (quien puede
   editar) deja ese filtro como el de todos (campo vistaComun de la tabla); cada quien puede
   seguir usando el suyo.
   4.3 Fijar filas y columnas (como en Excel, para todos) y gráficas (bloques "grafica" de la hoja).
   7 Buscar y reemplazar (Ctrl+F / Ctrl+H) y comentarios en celdas. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso } = NOM;
  const F = () => NOM.formulas;
  const COLORES_GRAFICA = ["#3D72F2", "#F08C2A", "#2FA868", "#8B5CF6", "#F2385A", "#00B0F0", "#B54708", "#6B6875"];

  // ------------------------------------------------------------ gráficas (4.3)
  /** Datos de un rango para graficar: etiquetas (primera columna de texto) y series (columnas de números). */
  function datosGrafica(ev, r) {
    const m = [];
    for (let f = r.f1; f <= r.f2; f++) { const fila = []; for (let c = r.c1; c <= r.c2; c++) fila.push(ev.valor(c, f)); m.push(fila); }
    if (!m.length) return null;
    const num = (v) => F().esNum(v);
    const conEtiquetas = m.some((fila) => fila.length > 1 && !num(fila[0]) && fila[0] !== "");
    const c0 = conEtiquetas ? 1 : 0;
    const conNombres = m.length > 1 && m[0].slice(c0).some((v) => v !== "" && !num(v));
    const filas = conNombres ? m.slice(1) : m;
    const series = [];
    for (let c = c0; c < m[0].length; c++) {
      const valores = filas.map((fila) => (num(fila[c]) ? +fila[c] : null));
      if (valores.every((v) => v == null)) continue;
      series.push({ nombre: conNombres ? String(F().formatear(m[0][c])) : "Serie " + (series.length + 1), valores });
    }
    const etiquetas = filas.map((fila, i) => (conEtiquetas ? String(F().formatear(fila[0])) : String(i + 1)));
    return series.length ? { etiquetas, series } : null;
  }
  function svgGrafica(d, clase, titulo) {
    const W = 420, H = 240, mi = 44, md = 14, ms = titulo ? 30 : 14, mb = 40;
    if (!d) return `<div class="graf-vacia">${ico("bar-chart", "ico-l")}<span>Elige un rango con números</span></div>`;
    const t = titulo ? `<text x="${W / 2}" y="20" text-anchor="middle" class="graf-titulo">${esc(titulo)}</text>` : "";
    if (clase === "pastel") {
      const s = d.series[0], total = s.valores.reduce((a, v) => a + Math.max(0, v || 0), 0) || 1;
      let a0 = -Math.PI / 2, h = "";
      const cx = 130, cy = ms + (H - ms) / 2 - 4, r = Math.min(90, (H - ms) / 2 - 10);
      s.valores.forEach((v, i) => {
        const a = (Math.max(0, v || 0) / total) * Math.PI * 2, a1 = a0 + a;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        if (a > 0) h += a >= Math.PI * 2 - 1e-6 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLORES_GRAFICA[i % 8]}"/>` : `<path d="M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${COLORES_GRAFICA[i % 8]}"/>`;
        a0 = a1;
      });
      const ley = d.etiquetas.slice(0, 8).map((e, i) => `<g transform="translate(250 ${ms + 14 + i * 22})"><rect width="12" height="12" rx="3" fill="${COLORES_GRAFICA[i % 8]}"/><text x="18" y="10" class="graf-ley">${esc(e.slice(0, 18))} · ${Math.round(((s.valores[i] || 0) / total) * 100)}%</text></g>`).join("");
      return `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img" aria-label="${esc(titulo || "Gráfica de pastel")}">${t}${h}${ley}</svg>`;
    }
    const todos = d.series.flatMap((s) => s.valores).filter((v) => v != null);
    let max = Math.max(0, ...todos), min = Math.min(0, ...todos);
    if (max === min) max = min + 1;
    const ah = H - ms - mb, aw = W - mi - md, y = (v) => ms + ah - ((v - min) / (max - min)) * ah;
    const n = d.etiquetas.length, paso = aw / Math.max(1, n);
    let h = "";
    for (let k = 0; k <= 4; k++) { const v = min + ((max - min) * k) / 4; h += `<line x1="${mi}" x2="${W - md}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="graf-reja"/><text x="${mi - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="graf-eje">${esc(F().formatear(Math.round(v * 100) / 100))}</text>`; }
    if (clase === "lineas") {
      d.series.forEach((s, si) => {
        const pts = s.valores.map((v, i) => (v == null ? null : [mi + paso * (i + 0.5), y(v)])).filter(Boolean);
        h += `<polyline points="${pts.map((p) => p.map((x) => x.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${COLORES_GRAFICA[si % 8]}" stroke-width="2.5" stroke-linejoin="round"/>`;
        h += pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${COLORES_GRAFICA[si % 8]}"/>`).join("");
      });
    } else {
      const bw = (paso * 0.72) / d.series.length;
      d.series.forEach((s, si) => s.valores.forEach((v, i) => {
        if (v == null) return;
        const x = mi + paso * i + paso * 0.14 + bw * si, y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
        h += `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}" rx="3" fill="${COLORES_GRAFICA[si % 8]}"/>`;
      }));
    }
    const cada = Math.ceil(n / 10);
    h += d.etiquetas.map((e, i) => (i % cada ? "" : `<text x="${(mi + paso * (i + 0.5)).toFixed(1)}" y="${H - mb + 16}" text-anchor="middle" class="graf-eje">${esc(e.slice(0, 10))}</text>`)).join("");
    const ley = d.series.length > 1 ? d.series.slice(0, 6).map((s, i) => `<g transform="translate(${mi + i * 110} ${H - 12})"><rect width="10" height="10" rx="2" fill="${COLORES_GRAFICA[i % 8]}"/><text x="14" y="9" class="graf-ley">${esc(s.nombre.slice(0, 14))}</text></g>`).join("") : "";
    return `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img" aria-label="${esc(titulo || "Gráfica")}">${t}${h}<line x1="${mi}" x2="${W - md}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="graf-cero"/>${ley}</svg>`;
  }

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
      const dedos = new Set();

      function tabla() {
        const t = doc().deLaPagina(ed.pagina).find((b) => b.tipo === "tabla");
        if (t) return t;
        if (ed.soloLectura) return null;
        const id = "hoja-" + ed.pagina;   // id fijo: si dos personas abren a la vez, crean la misma
        doc().cambiar(id, { tipo: "tabla", pagina: ed.pagina, orden: 0, filas: 30, cols: 10, x: 40, y: 40, w: 880, h: 300 }, { deshacible: false });
        return doc().bloque(id);
      }
      let t = tabla();
      const crudo = (c, f) => (t ? t["c:" + F().ref(c, f)] : "") || "";
      const rango = () => {
        if (!ancla) return { c1: sel.c, c2: sel.c, f1: sel.f, f2: sel.f };
        return { c1: Math.min(ancla.c, sel.c), c2: Math.max(ancla.c, sel.c), f1: Math.min(ancla.f, sel.f), f2: Math.max(ancla.f, sel.f) };
      };

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
      function pintarBanda(ev) {
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
        void ev;
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
        const ev = F().evaluador(crudo);
        const enc = pareceEncabezado() ? 1 : 0, n = t.filas || 30, cols = t.cols || 10;
        const filas = Array.from({ length: n - enc }, (_, i) => i + enc).filter(conDatos);
        if (filas.some((f) => { for (let k = 0; k < cols; k++) if (String(crudo(k, f)).startsWith("=")) return true; return false; }))
          return aviso("Hay fórmulas en esas filas: usa el orden de la vista (no cambia las celdas) para no romperlas", { tipo: "aviso", ms: 5000 });
        const orden = filas.slice().sort((a, b) => { const x = ev.valor(c, a), y = ev.valor(c, b); return (F().esNum(x) && F().esNum(y) ? +x - +y : String(F().formatear(x)).localeCompare(String(F().formatear(y)), "es", { numeric: true })) * (asc ? 1 : -1); });
        const campos = {};
        orden.forEach((origen, i) => {
          const destino = filas[i];
          for (let k = 0; k < cols; k++) for (const p of ["c:", "n:", "i:", "u:", "k:"]) { const v = t[p + F().ref(k, origen)]; const actual = t[p + F().ref(k, destino)]; if ((v || null) !== (actual || null)) campos[p + F().ref(k, destino)] = v == null ? null : v; }
        });
        if (Object.keys(campos).length) doc().cambiar(t.id, campos);
        aviso("Filas ordenadas para todos. Ctrl+Z para deshacer", { tipo: "ok" });
      }
      function dialogoFiltro(c) {
        const ev = F().evaluador(crudo), v = vistaActual() || {}, enc = v.encabezado != null ? v.encabezado : pareceEncabezado();
        const valores = new Map();
        for (let f = enc ? 1 : 0; f < (t.filas || 30); f++) { if (!conDatos(f)) continue; const x = F().formatear(ev.valor(c, f)); valores.set(x, (valores.get(x) || 0) + 1); }
        const lista = [...valores.entries()].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true })).slice(0, 300);
        const actual = (v.filtros || {})[c];
        const cuerpo = html(`<div class="col">
          <p class="suave chico" style="font-weight:650">Solo cambia lo que <b>tú</b> ves; los demás siguen viendo todas las filas.</p>
          <label class="lista-item"><span class="crece"><b>La fila 1 es encabezado</b><small>No se filtra ni se ordena</small></span><span class="interruptor"><input type="checkbox" data-enc ${enc ? "checked" : ""}><span></span></span></label>
          <div class="entrada">${ico("search")}<input data-contiene placeholder="Que contenga…" value="${esc(actual && actual.contiene || "")}"></div>
          <div class="fila"><button class="btn chico" data-todos type="button">Todas</button><button class="btn chico" data-ninguna type="button">Ninguna</button></div>
          <div class="lista filtro-valores">${lista.map(([x, n]) => `<label class="lista-item"><input type="checkbox" data-v="${esc(x)}" ${!actual || !actual.valores || actual.valores.includes(x) ? "checked" : ""}><span class="crece">${x === "" ? '<i class="suave">(vacías)</i>' : esc(x)}</span><span class="chip">${n}</span></label>`).join("")}</div></div>`);
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
        const ths = cab.children;
        let left = ths[0] ? ths[0].offsetWidth : 46;
        const lefts = [];
        for (let c = 0; c < fc && c + 1 < ths.length; c++) { lefts.push(left); left += ths[c + 1].offsetWidth; }
        rej.querySelectorAll("tr").forEach((tr) => {
          for (let c = 0; c < tr.children.length - 1; c++) {
            const x = tr.children[c + 1], fija = c < fc;
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

      // ------------------------------------------------------------ pintar
      function render() {
        t = tabla();
        if (!t) {
          rej.innerHTML = `<div class="vacio" style="margin:32px">${ico("sheet")}<h3>Esta página no tiene hoja</h3><p>Tu permiso es solo para ver.</p></div>`;
          return;
        }
        const ev = F().evaluador(crudo);
        const cols = t.cols || 10;
        const r = rango();
        visibles = calcularVisibles(ev);
        const v = vistaActual() || {};
        let h = `<table><thead><tr><th></th>${Array.from({ length: cols }, (_, c) => `<th data-col="${c}" class="${c >= r.c1 && c <= r.c2 ? "activa" : ""}${v.orden && v.orden.c === c ? " ordenada" : ""}${(v.filtros || {})[c] ? " filtrada" : ""}" title="Columna ${F().colLetra(c)}: toca para ordenar o filtrar">${F().colLetra(c)}${v.orden && v.orden.c === c ? (v.orden.asc ? " ↑" : " ↓") : ""}${(v.filtros || {})[c] ? " ⊻" : ""}</th>`).join("")}</tr></thead><tbody>`;
        for (const f of visibles) {
          h += `<tr data-fila="${f}"><th data-filah="${f}" class="${f >= r.f1 && f <= r.f2 ? "activa" : ""}">${f + 1}</th>`;
          for (let c = 0; c < cols; c++) {
            const ref = F().ref(c, f);
            const val = ev.valor(c, f);
            const txt = F().formatear(val);
            const clases = [F().esNum(val) ? "num" : "", val instanceof F().ErrorF ? "err" : "",
              c === sel.c && f === sel.f ? "sel" : (c >= r.c1 && c <= r.c2 && f >= r.f1 && f <= r.f2 ? "rango" : ""),
              resaltadas.has(ref) ? "cambiada" : "", comentadas.has(ref) ? "con-comentario" : "", halladas.has(ref) ? "hallada" : ""].join(" ");
            h += `<td data-c="${c}" data-f="${f}" data-id="${esc(t.id)}!${ref}" class="${clases}" ${t["n:" + ref] ? "data-negrita" : ""} ${t["i:" + ref] ? "data-cursiva" : ""} ${t["u:" + ref] ? "data-subrayado" : ""} ${t["k:" + ref] ? `style="color:${esc(t["k:" + ref])}"` : ""} title="${esc(String(crudo(c, f)).startsWith("=") ? crudo(c, f) : "")}">${esc(txt)}</td>`;
          }
          h += "</tr>";
        }
        rej.innerHTML = h + "</tbody></table>";
        pintarBanda(ev);
        aplicarFijas();
        pintarSeleccion();
        pintarGraficas(ev);
        pintarBandeja();
        ed.pintarPresencia();
      }

      function pintarSeleccion() {
        refEl.textContent = ancla && (ancla.c !== sel.c || ancla.f !== sel.f) ? `${F().ref(rango().c1, rango().f1)}:${F().ref(rango().c2, rango().f2)}` : F().ref(sel.c, sel.f);
        if (document.activeElement !== fx) fx.value = crudo(sel.c, sel.f);
        const r = rango();
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
      }
      const celda = (c, f) => rej.querySelector(`td[data-c="${c}"][data-f="${f}"]`);

      function pintarBandeja() {
        const libres = doc().deLaPagina(ed.pagina).filter((b) => b.tipo !== "tabla" && b.tipo !== "conector" && b.tipo !== "grafica");
        const pags = doc().paginas();
        const b = $("[data-bandeja]", raiz);
        b.innerHTML = `${pags.length > 1 ? pags.map((p, i) => `<button class="btn chico ${p === ed.pagina ? "primario" : "plano"}" data-pag="${esc(p)}">Hoja ${i + 1}</button>`).join("") : ""}
          ${ed.soloLectura ? "" : `<button class="icono-btn" data-nueva data-micro="Nueva hoja|Agrega otra página con su propia tabla.">${ico("plus")}</button>`}
          <span class="crece"></span>
          ${libres.length ? `<span class="chip" data-micro="Bloques libres|Texto, figuras o imágenes de otros modos. Se conservan aunque aquí no se editen.">${ico("layers", "ico-s")} ${libres.length} bloque${libres.length > 1 ? "s" : ""} libre${libres.length > 1 ? "s" : ""}</span>` : ""}`;
        $$("[data-pag]", b).forEach((x) => (x.onclick = () => { ed.pagina = x.dataset.pag; sel = { c: 0, f: 0 }; ancla = null; render(); }));
        const n = $("[data-nueva]", b);
        if (n) n.onclick = () => { ed.pagina = ed.nuevaPagina(ed.pagina); sel = { c: 0, f: 0 }; render(); };
      }

      // ------------------------------------------------------------ 4.3 gráficas
      const graficas = () => doc().deLaPagina(ed.pagina).filter((b) => b.tipo === "grafica");
      function rangoDeTexto(s) { const [a, b] = String(s || "").split(":").map((x) => F().parseRef(x)); return a && b ? { c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c), f1: Math.min(a.f, b.f), f2: Math.max(a.f, b.f) } : null; }
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
      function pintarGraficas(ev) {
        const gs = graficas();
        zonaGraficas.hidden = !gs.length;
        if (!gs.length) { zonaGraficas.innerHTML = ""; return; }
        zonaGraficas.innerHTML = gs.map((g) => `<figure class="graf-tarjeta" data-g="${esc(g.id)}">
          <figcaption><span class="crece recorta">${esc(g.titulo || "Gráfica")} <span class="suave">· ${esc(g.rango)}</span></span>${ed.soloLectura ? "" : `<button class="icono-btn chico" data-gmenu aria-label="Opciones de la gráfica">${ico("more-horizontal", "ico-s")}</button>`}</figcaption>
          ${svgGrafica(datosGrafica(ev, rangoDeTexto(g.rango) || { c1: 0, c2: 0, f1: 0, f2: 0 }), g.clase, g.titulo)}</figure>`).join("");
      }
      zonaGraficas.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-gmenu]");
        if (!b) return;
        const id = b.closest("[data-g]").dataset.g, g = doc().bloque(id);
        NOM.menu(b, [
          { titulo: "Gráfica" },
          ...[["barras", "Barras", "bar-chart"], ["lineas", "Líneas", "spline"], ["pastel", "Pastel", "circle"]].map(([v, tx, i]) => ({ texto: tx, icono: i, marcado: (g.clase || "barras") === v, fn: () => doc().cambiar(id, { clase: v }) })),
          "-",
          { texto: "Usar las celdas elegidas", icono: "table", fn: () => { const r = rango(); doc().cambiar(id, { rango: `${F().ref(r.c1, r.f1)}:${F().ref(r.c2, r.f2)}` }); } },
          { texto: "Título…", icono: "type", fn: async () => { const tt = await NOM.pedirTexto("Título de la gráfica", { valor: g.titulo || "", si: "Guardar" }); if (tt != null) doc().cambiar(id, { titulo: tt }); } },
          { texto: "Eliminar gráfica", icono: "trash-2", peligro: true, fn: () => doc().cambiar(id, { eliminado: true }) },
        ]);
      });

      // ------------------------------------------------------------ escritura
      function escribir(c, f, valor) {
        if (ed.soloLectura || !t) return;
        const k = "c:" + F().ref(c, f);
        if ((t[k] || "") === valor) return;
        const campos = { [k]: valor };
        if (f >= (t.filas || 30) - 1) campos.filas = (t.filas || 30) + 10;
        if (c >= (t.cols || 10) - 1) campos.cols = (t.cols || 10) + 2;
        doc().cambiar(t.id, campos);
      }
      /** Moverse por la vista (con filtro u orden, la fila de abajo es la que se ve abajo). */
      function mover(dc, df, extender) {
        if (extender) { if (!ancla) ancla = { ...sel }; } else ancla = null;
        let f = sel.f;
        if (df) { const i = visibles.indexOf(sel.f); f = visibles[Math.max(0, Math.min(visibles.length - 1, (i < 0 ? 0 : i) + df))]; if (f == null) f = sel.f; }
        sel = { c: Math.max(0, Math.min((t.cols || 10) - 1, sel.c + dc)), f };
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
        editor.addEventListener("input", () => (fx.value = editor.value));
        editor.addEventListener("keydown", teclaEditor);
        editor.addEventListener("blur", () => setTimeout(() => { if (editor && document.activeElement !== editor) cerrarEditor(true); }, 0));
      }
      function cerrarEditor(guardar) {
        if (!editor) return;
        const e = editor; editor = null;
        if (guardar) escribir(e._c, e._f, e.value);
        e.remove();
      }
      function teclaEditor(e) {
        if (["Enter", "Tab", "Escape"].includes(e.key)) e.stopPropagation();   // si no, la rejilla mueve otra vez
        if (e.key === "Enter") { e.preventDefault(); cerrarEditor(true); mover(0, e.shiftKey ? -1 : 1); rej.focus(); }
        else if (e.key === "Tab") { e.preventDefault(); cerrarEditor(true); mover(e.shiftKey ? -1 : 1, 0); rej.focus(); }
        else if (e.key === "Escape") { e.preventDefault(); cerrarEditor(false); pintarSeleccion(); rej.focus(); }
      }

      rej.addEventListener("keydown", (e) => {
        if (editor || !t) return;
        const mod = e.ctrlKey || e.metaKey;
        const flechas = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        if (flechas[e.key]) { e.preventDefault(); mover(...flechas[e.key], e.shiftKey); return; }
        if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? mover(0, -1) : abrirEditor(null, true); return; }
        if (e.key === "Tab") { e.preventDefault(); mover(e.shiftKey ? -1 : 1, 0); return; }
        if (e.key === "F2") { e.preventDefault(); abrirEditor(null, true); return; }
        if ((e.key === "Delete" || e.key === "Backspace") && !ed.soloLectura) {
          e.preventDefault();
          vaciarRango();
          return;
        }
        if (mod && (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "h")) { e.preventDefault(); buscar(e.key.toLowerCase() === "h"); return; }
        if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); alternarFormato("n"); return; }
        if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); alternarFormato("i"); return; }
        if (mod && e.key.toLowerCase() === "u") { e.preventDefault(); alternarFormato("u"); return; }
        if (!mod && !e.altKey && e.key.length === 1) { e.preventDefault(); abrirEditor(e.key); }
      });
      /** El rango elegido como texto con tabuladores (lo que entienden Excel y Sheets al pegar). */
      function comoTexto() {
        const r = rango(), filas = [];
        for (let f = r.f1; f <= r.f2; f++) { const fila = []; for (let c = r.c1; c <= r.c2; c++) fila.push(crudo(c, f)); filas.push(fila.join("\t")); }
        return filas.join("\n");
      }
      function vaciarRango() {
        if (ed.soloLectura || !t) return;
        const r = rango(), campos = {};
        for (let f = r.f1; f <= r.f2; f++) for (let c = r.c1; c <= r.c2; c++) if (crudo(c, f)) campos["c:" + F().ref(c, f)] = "";
        if (Object.keys(campos).length) doc().cambiar(t.id, campos);
      }
      async function copiarRango(cortar) {
        const texto = comoTexto();
        try { await navigator.clipboard.writeText(texto); }
        catch (e) {
          // Sin permiso del portapapeles (o en la app): un campo oculto y el copiar de siempre.
          const a = html(`<textarea style="position:fixed;opacity:0;pointer-events:none"></textarea>`);
          a.value = texto; document.body.append(a); a.select();
          try { document.execCommand("copy"); } catch (e2) { /* sin portapapeles */ }
          a.remove(); rej.focus({ preventScroll: true });
        }
        if (cortar) vaciarRango();
        aviso(cortar ? "Celdas cortadas" : "Celdas copiadas", { tipo: "ok", ms: 1600 });
      }
      async function pegarRango() {
        try {
          const texto = await navigator.clipboard.readText();
          if (texto) pegarTexto(texto);
        } catch (e) { aviso("El navegador no dejó leer el portapapeles. Usa Ctrl+V.", { tipo: "info" }); }
      }
      rej.addEventListener("copy", (e) => {
        e.clipboardData.setData("text/plain", comoTexto());
        e.preventDefault();
      });
      rej.addEventListener("paste", (e) => {
        if (ed.soloLectura || editor || !t) return;
        e.preventDefault();
        pegarTexto(e.clipboardData.getData("text/plain"));
      });
      function pegarTexto(texto) {
        if (ed.soloLectura || !t) return;
        const filas = texto.replace(/\r/g, "").split("\n").filter((x, i, a) => x !== "" || i < a.length - 1);
        const campos = {};
        let maxF = t.filas || 30, maxC = t.cols || 10;
        filas.forEach((fila, df) => fila.split("\t").forEach((v, dc) => {
          campos["c:" + F().ref(sel.c + dc, sel.f + df)] = v;
          maxF = Math.max(maxF, sel.f + df + 2); maxC = Math.max(maxC, sel.c + dc + 2);
        }));
        campos.filas = maxF; campos.cols = maxC;
        // 3.1 Lo pegado cuenta aparte de lo tecleado en la bitácora (sin guardar el texto).
        doc().cambiar(t.id, campos, { meta: { o: "p", g: NOM.idCorto() + Date.now().toString(36), gn: Array.from(texto).length } });
      }

      rej.addEventListener("pointerdown", (e) => {
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
      // Clic (o toque sin mantener) en la letra de una columna: su menú de ordenar y filtrar.
      rej.addEventListener("click", (e) => {
        const th = e.target.closest && e.target.closest("thead th[data-col]");
        if (th && !rej._toqueLargo) menuColumna(th, +th.dataset.col);
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
      rej.addEventListener("dblclick", (e) => { if (e.target.closest("td")) abrirEditor(null, true); });

      fx.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); escribir(sel.c, sel.f, fx.value); mover(0, 1); rej.focus(); }
        if (e.key === "Escape") { fx.value = crudo(sel.c, sel.f); rej.focus(); }
      });
      fx.addEventListener("blur", () => { if (fx.value !== crudo(sel.c, sel.f)) escribir(sel.c, sel.f, fx.value); });

      // ------------------------------------------------------------ herramientas
      /** Negrita (n), cursiva (i) o subrayado (u) de todo el rango, según la celda activa. */
      function alternarFormato(k) {
        if (ed.soloLectura || !t) return;
        const r = rango(), valor = !t[k + ":" + F().ref(sel.c, sel.f)], campos = {};
        for (let f = r.f1; f <= r.f2; f++) for (let c = r.c1; c <= r.c2; c++) campos[k + ":" + F().ref(c, f)] = valor || null;
        doc().cambiar(t.id, campos);
      }
      function colorCeldas(color) {
        if (ed.soloLectura || !t) return;
        const r = rango(), campos = {};
        for (let f = r.f1; f <= r.f2; f++) for (let c = r.c1; c <= r.c2; c++) campos["k:" + F().ref(c, f)] = color;
        doc().cambiar(t.id, campos);
      }
      const negrita = () => alternarFormato("n");
      function autosuma() {
        if (ed.soloLectura || !t) return;
        let f = sel.f - 1;
        while (f >= 0 && F().esNum(F().evaluador(crudo).valor(sel.c, f))) f--;
        if (f === sel.f - 1) return aviso("Coloca la celda debajo de una columna de números", { tipo: "info" });
        escribir(sel.c, sel.f, `=SUMA(${F().ref(sel.c, f + 1)}:${F().ref(sel.c, sel.f - 1)})`);
      }
      const FUNCIONES = ["SUMA", "PROMEDIO", "MIN", "MAX", "CONTAR", "SI", "REDONDEAR", "BUSCARV", "CONTAR.SI", "SUMAR.SI", "HOY", "FECHA", "DIAS"];

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
        const re = patron(), formulas = $("[data-formulas]", panel).checked, ev = F().evaluador(crudo);
        hallazgos = [];
        if (re) {
          for (const f of visibles) for (let c = 0; c < (t.cols || 10); c++) {
            const crudoV = String(crudo(c, f));
            if (!crudoV) continue;
            const donde = crudoV.startsWith("=") ? (formulas ? crudoV : String(F().formatear(ev.valor(c, f)))) : crudoV;
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
      // En el encabezado de una columna: ordenar y filtrar (4.1); en el número de fila: fijar (4.3).
      const COLORES_CELDA = ["#000000", "#C2372B", "#E8590C", "#2FA868", "#1D7A4C", "#3D72F2", "#8B5CF6"];
      function accionesCeldas() {
        const ref = F().ref(sel.c, sel.f), lect = ed.soloLectura || !t;
        const funcion = (fn) => ({ texto: fn, corto: fn.length > 8 ? fn.slice(0, 7) + "…" : fn, icono: "sigma", fn: () => abrirEditor(`=${fn}(`) });
        return [
          { texto: "Negrita", icono: "bold", off: lect, marcado: !!(t && t["n:" + ref]), mantener: true, fn: () => alternarFormato("n") },
          { texto: "Cursiva", icono: "italic", off: lect, marcado: !!(t && t["i:" + ref]), mantener: true, fn: () => alternarFormato("i") },
          { texto: "Subrayado", icono: "underline", off: lect, marcado: !!(t && t["u:" + ref]), mantener: true, fn: () => alternarFormato("u") },
          { texto: "Color", icono: "baseline", off: lect, sub: COLORES_CELDA.map((c) => ({ texto: c === "#000000" ? "Automático" : c, corto: " ", color: c, mantener: true, fn: () => colorCeldas(c === "#000000" ? null : c) })) },
          { texto: "Borrar", icono: "eraser", off: lect, fn: vaciarRango },
          { texto: "Copiar", icono: "copy", fn: () => copiarRango(false) },
          { texto: "Fórmulas", icono: "sigma", off: lect, sub: [{ texto: "Autosuma", icono: "sigma", fn: autosuma }, ...["SUMA", "PROMEDIO", "SI", "BUSCARV", "CONTAR.SI", "SUMAR.SI", "HOY"].map(funcion)] },
          { texto: "Más", icono: "more-horizontal", sub: [
            { texto: "Cortar", icono: "scissors", off: lect, fn: () => copiarRango(true) },
            { texto: "Pegar", icono: "clipboard-paste", off: lect, fn: pegarRango },
            { texto: "Editar celda", corto: "Editar", icono: "type", off: lect, fn: () => abrirEditor(null, true) },
            { texto: "Gráfica", icono: "bar-chart", off: lect, fn: () => nuevaGrafica("barras") },
            { texto: "Buscar", icono: "search", fn: () => buscar(false) },
            { texto: "Comentar", icono: "message-square", off: !NOM.comentarios || ed.local, fn: () => NOM.comentarios.nuevo(ed) },
            { texto: "Fijar", icono: "snowflake", off: lect, sub: menuFijar(null).filter((x) => x && x.texto).map((x) => Object.assign({}, x, { corto: x.texto.replace(/^Hasta la /, "Hasta ").slice(0, 14) })) },
            { texto: "Agregar filas o columnas", corto: "+ Filas", icono: "rows-3", off: lect, sub: [
              { texto: "Agregar 10 filas", corto: "+10 filas", icono: "rows-3", fn: () => t && doc().cambiar(t.id, { filas: (t.filas || 30) + 10 }) },
              { texto: "Agregar 2 columnas", corto: "+2 col.", icono: "columns-3", fn: () => t && doc().cambiar(t.id, { cols: (t.cols || 10) + 2 }) }] }] },
        ];
      }
      function accionesColumna(c) {
        const v = vistaActual() || {}, filtrada = !!(v.filtros || {})[c];
        return [
          { texto: "Ordenar A → Z", corto: "A → Z", icono: "arrow-up", marcado: !!(v.orden && v.orden.c === c && v.orden.asc), fn: () => ordenar(c, true) },
          { texto: "Ordenar Z → A", corto: "Z → A", icono: "arrow-down", marcado: !!(v.orden && v.orden.c === c && !v.orden.asc), fn: () => ordenar(c, false) },
          { texto: "Filtrar…", icono: "filter", marcado: filtrada, fn: () => dialogoFiltro(c) },
          { texto: "Quitar filtro", icono: "x", off: !filtrada, fn: () => quitarFiltro(c) },
          { texto: "Quitar orden", icono: "arrow-up-down", off: !v.orden, fn: () => cambiarVista((x) => { delete x.orden; }) },
          { texto: "Ordenar para todos", corto: "Para todos", icono: "arrow-up-down", off: ed.soloLectura, sub: [{ texto: "A → Z (cambia las celdas)", corto: "A → Z", icono: "arrow-up", fn: () => ordenarDeVerdad(c, true) }, { texto: "Z → A (cambia las celdas)", corto: "Z → A", icono: "arrow-down", fn: () => ordenarDeVerdad(c, false) }] },
          { texto: `Fijar hasta ${F().colLetra(c)}`, icono: "snowflake", off: ed.soloLectura, fn: () => fijar({ fijasC: c + 1 }) },
          { texto: "Gráfica de la columna", corto: "Gráfica", icono: "bar-chart", off: ed.soloLectura, fn: () => { ancla = { c, f: 0 }; sel = { c, f: (t.filas || 30) - 1 }; const r = regionDe(c, 0) || regionDe(c, 1); if (r) { ancla = { c: Math.max(0, r.c1), f: r.f1 }; sel = { c: r.c2, f: r.f2 }; } nuevaGrafica("barras"); } },
        ];
      }
      function menuColumna(anc, c) {
        ancla = { c, f: visibles[0] || 0 }; sel = { c, f: visibles[visibles.length - 1] || 0 };
        pintarSeleccion();
        const l = accionesColumna(c);
        NOM.menu(anc, [{ titulo: "Columna " + F().colLetra(c) + " · solo cambia tu vista" }, ...l.flatMap((x) => (x.sub ? x.sub.map((y) => Object.assign({}, y, { texto: x.texto + ": " + y.texto })) : [x])).filter((x) => !x.off)]);
      }
      NOM.rueda.enlazar(rej, (e) => {
        const thc = e.target.closest && e.target.closest("thead th[data-col]");
        if (thc) { rej._toqueLargo = true; setTimeout(() => (rej._toqueLargo = false), 600); const l = accionesColumna(+thc.dataset.col); l.titulo = "Columna " + F().colLetra(+thc.dataset.col); return l; }
        const thf = e.target.closest && e.target.closest("tbody th[data-filah]");
        if (thf && !ed.soloLectura) {
          const f = +thf.dataset.filah, n = visibles.indexOf(f) + 1;
          const l = [{ texto: `Fijar hasta la fila ${n}`, corto: "Fijar aquí", icono: "snowflake", fn: () => fijar({ fijasF: n }) }, { texto: "Fijar la fila 1", corto: "Fila 1", icono: "rows-3", fn: () => fijar({ fijasF: 1 }) }, { texto: "No fijar", icono: "x", fn: () => fijar({ fijasF: null }) }];
          l.titulo = "Fila " + (f + 1);
          return l;
        }
        const td = e.target.closest && e.target.closest("td");
        if (!td) return null;
        const c = +td.dataset.c, f = +td.dataset.f, r = rango();
        if (!(c >= r.c1 && c <= r.c2 && f >= r.f1 && f <= r.f2)) { ancla = null; sel = { c, f }; pintarSeleccion(); }
        arrastrando = false;
        const l = accionesCeldas(), q = rango();
        l.titulo = q.c1 !== q.c2 || q.f1 !== q.f2 ? `${F().ref(q.c1, q.f1)}:${F().ref(q.c2, q.f2)}` : F().ref(sel.c, sel.f);
        return l;
      }, { titulo: "Celdas", rearmar: (e) => e.pointerType === "mouse", ignorar: () => !!editor });

      this._herr = [
        { id: "negrita", icono: "bold", micro: "Negrita|Para encabezados y totales.|Ctrl+B", fn: negrita },
        { id: "cursiva", icono: "italic", micro: "Cursiva||Ctrl+I", fn: () => alternarFormato("i") },
        { id: "subrayado", icono: "underline", micro: "Subrayado||Ctrl+U", fn: () => alternarFormato("u") },
        { id: "suma", icono: "sigma", micro: "Autosuma|Suma los números que están arriba de la celda.", fn: autosuma },
        { id: "funciones", icono: "wand-sparkles", micro: "Funciones|SUMA, PROMEDIO, SI, BUSCARV, CONTAR.SI, SUMAR.SI, HOY, FECHA, DIAS…", fn: (e, b) => NOM.menu(b, [
          { titulo: "Insertar función" },
          ...FUNCIONES.map((fn) => ({ texto: fn, fn: () => abrirEditor(`=${fn}(`) })),
        ]) },
        "|",
        { id: "filtro", icono: "filter", micro: "Ordenar y filtrar|Solo cambia lo que tú ves. Toca la letra de una columna.", fn: (e, b) => menuColumna(b, sel.c), activo: () => !!vistaActual() },
        { id: "fijar", icono: "snowflake", micro: "Fijar filas y columnas|Se quedan a la vista al desplazarte (para todos).", fn: (e, b) => menuFijar(b), off: () => ed.soloLectura },
        { id: "grafica", icono: "bar-chart", micro: "Gráfica|De las celdas elegidas (o de la tabla donde estás).", fn: (e, b) => NOM.menu(b, [{ titulo: "Nueva gráfica" }, ...[["barras", "Barras", "bar-chart"], ["lineas", "Líneas", "spline"], ["pastel", "Pastel", "circle"]].map(([v, tx, i]) => ({ texto: tx, icono: i, fn: () => nuevaGrafica(v) }))]), off: () => ed.soloLectura },
        { id: "buscar", icono: "search", micro: "Buscar y reemplazar||Ctrl+F", fn: () => buscar(false) },
        "|",
        { id: "fila", icono: "rows-3", micro: "Agregar filas|Suma 10 filas al final.", fn: () => t && doc().cambiar(t.id, { filas: (t.filas || 30) + 10 }) },
        { id: "columna", icono: "columns-3", micro: "Agregar columnas|Suma 2 columnas a la derecha.", fn: () => t && doc().cambiar(t.id, { cols: (t.cols || 10) + 2 }) },
      ];

      /** Actualiza solo los valores visibles; no reconstruye la tabla (no estorba a quien escribe). */
      function actualizarValores() {
        const ev = F().evaluador(crudo);
        $$("td", rej).forEach((td) => {
          const c = +td.dataset.c, f = +td.dataset.f, ref = F().ref(c, f);
          const v = ev.valor(c, f), txt = F().formatear(v);
          if (td.textContent !== txt) td.textContent = txt;
          td.classList.toggle("num", F().esNum(v));
          td.classList.toggle("err", v instanceof F().ErrorF);
          td.toggleAttribute("data-negrita", !!t["n:" + ref]);
          td.toggleAttribute("data-cursiva", !!t["i:" + ref]);
          td.toggleAttribute("data-subrayado", !!t["u:" + ref]);
          td.style.color = t["k:" + ref] || "";
          const cr = String(crudo(c, f));
          td.title = cr.startsWith("=") ? cr : "";
        });
        pintarGraficas(ev);
        if (document.activeElement !== fx && !editor) fx.value = crudo(sel.c, sel.f);
      }

      this.cambios = (lista) => {
        const tId = t && t.id;
        const deGraficas = lista.some((c) => doc().valor(c.bloque, "tipo") === "grafica");
        if (lista.some((c) => c.bloque === tId || c.bloque === "_doc" || c.campos.tipo === "tabla")) {
          const antes = t ? [t.filas, t.cols, t.id, t.fijasF, t.fijasC, JSON.stringify(t.vistaComun || null)] : null;
          t = tabla();
          const igual = antes && t && antes[0] === t.filas && antes[1] === t.cols && antes[2] === t.id && antes[3] === t.fijasF && antes[4] === t.fijasC && antes[5] === JSON.stringify(t.vistaComun || null);
          // Con filtro u orden, un valor nuevo puede cambiar qué filas se ven: se repinta todo.
          if (igual && !vistaActual()) { actualizarValores(); return; }
          const scroll = [rej.scrollLeft, rej.scrollTop];
          const e = editor;
          if (e) e.remove();
          render();
          if (e) { rej.append(e); e.focus(); }
          rej.scrollLeft = scroll[0]; rej.scrollTop = scroll[1];
        } else if (deGraficas) pintarGraficas(F().evaluador(crudo));
        else pintarBandeja();
      };
      this.desmontar = () => { cerrarEditor(true); cerrarBuscar(); document.removeEventListener("pointerup", soltar); document.removeEventListener("pointercancel", soltar); ed.lienzo.style.overflow = ""; };
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
      void self;

      render();
      if (matchMedia("(hover: hover)").matches) rej.focus({ preventScroll: true });
    },
    herramientas() { return this._herr || []; },
  };
})();
