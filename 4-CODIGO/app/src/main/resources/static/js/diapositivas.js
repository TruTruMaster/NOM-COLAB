/* NOM-COLAB · diapositivas (8.3): tamaño, temas, fondos, diseños de diapositiva, texto con formato
   dentro de los cuadros, editor de datos para tablas y gráficas, e imagen (PNG) de una diapositiva.
   Lo usan el lienzo (lienzo.js), el proyector (proyector.js) y la exportación (ooxml.js).

   En _doc: tamDiapo ("16:9", "4:3", "carta-v"…), tema (id) y "fondo:<página>" con
   { tipo: "color", color } | { tipo: "degradado", c1, c2, angulo } | { tipo: "imagen", src, ajuste }. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const esc = (s) => NOM.esc(s);

  // ------------------------------------------------------------ tamaño
  const TAMANOS = {
    "16:9": { t: "Panorámica 16:9 (pantalla y proyector)", w: 960, h: 540 },
    "4:3": { t: "Estándar 4:3 (proyectores viejos)", w: 960, h: 720 },
    "carta-v": { t: "Carta vertical (para imprimir)", w: 816, h: 1056 },
    "carta-h": { t: "Carta horizontal", w: 1056, h: 816 },
    "a4-v": { t: "A4 vertical", w: 794, h: 1123 },
    cartel: { t: "Cartel (60 × 90 cm)", w: 720, h: 1080 },
    cuadrado: { t: "Cuadrado (redes sociales)", w: 1080, h: 1080 },
    historia: { t: "Historia 9:16 (celular)", w: 608, h: 1080 },
  };
  const tam = (doc) => { const k = doc && doc.valor ? doc.valor("_doc", "tamDiapo") : null; return TAMANOS[k] || TAMANOS["16:9"]; };

  // ------------------------------------------------------------ temas
  const TEMAS = {
    claro: { t: "Claro", fondo: { tipo: "color", color: "#FFFFFF" }, titulo: "#1F2937", texto: "#374151", acentos: ["#3D72F2", "#F08C2A", "#2FA868", "#8B5CF6"] },
    noche: { t: "Noche", fondo: { tipo: "color", color: "#1C1B29" }, titulo: "#FFFFFF", texto: "#D6D4E0", acentos: ["#7FA8FF", "#FFB066", "#7FD8A6", "#B39DFF"] },
    pizarron: { t: "Pizarrón", fondo: { tipo: "color", color: "#22412F" }, titulo: "#FFF7D6", texto: "#E8F2EA", acentos: ["#FFF1B8", "#FFD6DE", "#CFE0FF", "#CDEFD9"], fuenteT: "Comic Sans MS", fuente: "Comic Sans MS" },
    cuaderno: { t: "Cuaderno", fondo: { tipo: "rayas", color: "#FFFDF5", linea: "#D7E3F4" }, titulo: "#1E3A8A", texto: "#1F2937", acentos: ["#3D72F2", "#C2185B", "#2FA868", "#F08C2A"], fuenteT: "Georgia" },
    guinda: { t: "Guinda", fondo: { tipo: "color", color: "#FFFFFF" }, franja: "#6C1D45", titulo: "#6C1D45", texto: "#3A2730", acentos: ["#6C1D45", "#B38E5D", "#4A4854", "#9E5A7C"], fuenteT: "Georgia" },
    oceano: { t: "Océano", fondo: { tipo: "degradado", c1: "#0F4C81", c2: "#3D72F2", angulo: 135 }, titulo: "#FFFFFF", texto: "#E6F0FF", acentos: ["#FFFFFF", "#7FD8F6", "#FFD84D", "#7FD8A6"] },
    atardecer: { t: "Atardecer", fondo: { tipo: "degradado", c1: "#F08C2A", c2: "#F2385A", angulo: 135 }, titulo: "#FFFFFF", texto: "#FFF3EA", acentos: ["#FFFFFF", "#FFF1B8", "#2B2A33", "#FFD6DE"] },
    menta: { t: "Menta", fondo: { tipo: "color", color: "#E8F7EF" }, titulo: "#1D7A4C", texto: "#24443A", acentos: ["#2FA868", "#1D7A4C", "#F08C2A", "#3D72F2"] },
    minimal: { t: "Minimalista", fondo: { tipo: "color", color: "#F7F5F0" }, titulo: "#2B2A33", texto: "#4A4854", acentos: ["#2B2A33", "#E8590C", "#6B6875", "#3D72F2"], fuenteT: "Georgia" },
  };
  const tema = (doc) => TEMAS[doc && doc.valor ? doc.valor("_doc", "tema") : ""] || null;
  const fuenteCss = (f) => (NOM.textoRico && f ? NOM.textoRico.cssFuente(f) : f ? `'${f}',sans-serif` : "");
  /** CSS de un fondo. */
  function cssFondo(f) {
    if (!f) return "";
    if (f.tipo === "degradado") return `linear-gradient(${+f.angulo || 135}deg, ${f.c1 || "#FFFFFF"}, ${f.c2 || "#CFE0FF"})`;
    if (f.tipo === "rayas") return `repeating-linear-gradient(${f.color || "#FFFDF5"} 0 31px, ${f.linea || "#D7E3F4"} 31px 32px)`;
    if (f.tipo === "imagen" && f.src) return `${f.ajuste === "ajustar" ? "#000" : "#fff"} url("${String(f.src).replace(/"/g, "%22")}") center / ${f.ajuste === "ajustar" ? "contain" : "cover"} no-repeat`;
    if (f.tipo === "color") return f.color || "#FFFFFF";
    return "";
  }
  /** El fondo de una diapositiva: el suyo, o el del tema. */
  const fondoDe = (doc, p) => (doc && doc.valor && doc.valor("_doc", "fondo:" + p)) || (tema(doc) ? tema(doc).fondo : null);
  /** Estilo de la diapositiva: tamaño, fondo y variables del tema (colores y fuentes del texto). */
  function estiloDiapo(doc, p) {
    const T = tam(doc), te = tema(doc), f = fondoDe(doc, p);
    let s = `width:${T.w}px;height:${T.h}px;`;
    const bg = cssFondo(f);
    if (bg) s += `background:${bg};`;
    if (te) {
      s += `--t-titulo:${te.titulo};--t-texto:${te.texto};`;
      if (te.fuenteT) s += `--t-fuente-t:${fuenteCss(te.fuenteT)};`;
      if (te.fuente) s += `--t-fuente:${fuenteCss(te.fuente)};`;
      if (te.franja) s += `--t-franja:${te.franja};`;
    }
    return s;
  }

  // ------------------------------------------------------------ texto con formato dentro de los cuadros
  const ETIQUETAS = { B: "b", STRONG: "b", I: "i", EM: "i", U: "u", S: "s", STRIKE: "s", DEL: "s", SUB: "sub", SUP: "sup", SPAN: "span", FONT: "span", A: "a", UL: "ul", OL: "ol", LI: "li", DIV: "div", P: "div", BR: "br" };
  const ESTILOS_OK = ["color", "background-color", "font-size", "font-weight", "font-style", "text-decoration", "text-decoration-line", "text-align", "font-family"];
  const colorOk = (v) => /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i.test(v.trim());
  /** Solo se guarda formato de texto: negrita, cursiva, subrayado, tachado, color, tamaño, listas,
      alineación y enlaces http(s). Lo demás (scripts, estilos raros) se descarta. */
  function htmlRico(h) {
    const t = document.createElement("template");
    t.innerHTML = String(h || "");
    let r = "";
    (function rec(n) {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { r += esc(c.nodeValue); continue; }
        if (c.nodeType !== 1) continue;
        const tag = ETIQUETAS[c.tagName];
        if (!tag) { rec(c); continue; }
        if (tag === "br") { r += "<br>"; continue; }
        let st = "";
        const sty = c.getAttribute("style") || "";
        sty.split(";").forEach((d) => {
          const i = d.indexOf(":");
          if (i < 0) return;
          const k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim();
          if (!ESTILOS_OK.includes(k) || /url\(|expression|javascript/i.test(v)) return;
          if ((k === "color" || k === "background-color") && !colorOk(v)) return;
          if (k === "font-size" && !/^\d+(\.\d+)?(px|pt|em|rem|%)$/.test(v)) return;
          st += `${k}:${v};`;
        });
        if (c.tagName === "FONT") {
          if (c.getAttribute("color") && colorOk(c.getAttribute("color"))) st += `color:${c.getAttribute("color")};`;
          const sz = +c.getAttribute("size");
          if (sz) st += `font-size:${[0, 10, 13, 16, 18, 24, 32, 48][Math.max(1, Math.min(7, sz))]}px;`;
        }
        if (c.getAttribute("align") && /^(left|center|right|justify)$/i.test(c.getAttribute("align"))) st += `text-align:${c.getAttribute("align").toLowerCase()};`;
        if (tag === "a") {
          const href = c.getAttribute("href") || "";
          if (/^https?:\/\//i.test(href)) { r += `<a href="${esc(href)}" target="_blank" rel="noopener">`; rec(c); r += "</a>"; } else rec(c);
          continue;
        }
        if (tag === "span" && !st) { rec(c); continue; }
        r += `<${tag}${st ? ` style="${esc(st)}"` : ""}>`;
        rec(c);
        r += `</${tag}>`;
      }
    })(t.content);
    return r.replace(/(<br>)+$/, "");
  }
  /** Texto plano de un cuadro con formato (para buscar, exportar a texto y comentarios). */
  function textoPlano(h) {
    const d = document.createElement("div");
    d.innerHTML = htmlRico(h).replace(/<br>/g, "\n").replace(/<\/(div|li)>/g, "$&\n");
    return d.textContent.replace(/\n{3,}/g, "\n\n").trim();
  }
  /**
   * Párrafos de un cuadro con formato, para PowerPoint: [{ al, lista: "v"|"n"|null, nivel, runs: [{ t, b, i, u, s, color, tam }] }].
   */
  function parrafos(h) {
    const t = document.createElement("template");
    t.innerHTML = htmlRico(h);
    const ps = [];
    let actual = null;
    const nuevo = (al, lista, nivel) => { actual = { al: al || null, lista: lista || null, nivel: nivel || 0, runs: [] }; ps.push(actual); return actual; };
    (function rec(n, st, al, lista, nivel) {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { if (!actual) nuevo(al, lista, nivel); if (c.nodeValue) actual.runs.push(Object.assign({ t: c.nodeValue }, st)); continue; }
        if (c.nodeType !== 1) continue;
        const tag = c.tagName.toLowerCase(), cs = c.style;
        const al2 = { left: "izq", center: "centro", right: "der", justify: "just" }[cs.textAlign] || al;
        if (tag === "br") { nuevo(al, lista, nivel); continue; }
        if (tag === "ul" || tag === "ol") { rec(c, st, al2, tag === "ul" ? "v" : "n", lista ? nivel + 1 : 0); actual = null; continue; }
        if (tag === "li" || tag === "div") { nuevo(al2, tag === "li" ? lista : null, nivel); rec(c, st, al2, lista, nivel); actual = null; continue; }
        const s2 = Object.assign({}, st);
        if (tag === "b" || cs.fontWeight === "bold" || +cs.fontWeight >= 600) s2.b = true;
        if (tag === "i" || cs.fontStyle === "italic") s2.i = true;
        if (tag === "u" || /underline/.test(cs.textDecoration)) s2.u = true;
        if (tag === "s" || /line-through/.test(cs.textDecoration)) s2.s = true;
        if (cs.color) s2.color = cs.color;
        if (cs.fontSize) s2.tam = cs.fontSize;
        rec(c, s2, al2, lista, nivel);
      }
    })(t.content, {}, null, null, 0);
    return ps.filter((p, i) => p.runs.length || i < ps.length - 1);
  }

  // ------------------------------------------------------------ diseños de diapositiva
  /** Cada diseño arma sus cuadros (con texto de ayuda que desaparece al escribir). W y H: tamaño. */
  const DISENOS = [
    { id: "blanco", t: "En blanco", arma: () => [] },
    { id: "portada", t: "Portada", arma: (W, H) => [
      { tipo: "texto", estilo: "h1", ph: "Título de la presentación", x: W * 0.08, y: H * 0.30, w: W * 0.84, h: H * 0.2, tAlin: "centro" },
      { tipo: "texto", estilo: "p", ph: "Subtítulo · tu nombre · fecha", x: W * 0.15, y: H * 0.55, w: W * 0.7, h: H * 0.12, tAlin: "centro" }] },
    { id: "contenido", t: "Título y contenido", arma: (W, H) => [
      { tipo: "texto", estilo: "h2", ph: "Título", x: W * 0.06, y: H * 0.06, w: W * 0.88, h: H * 0.14 },
      { tipo: "texto", estilo: "p", ph: "• Escribe los puntos principales", html: "", lista: true, x: W * 0.06, y: H * 0.24, w: W * 0.88, h: H * 0.66 }] },
    { id: "dos", t: "Dos columnas", arma: (W, H) => [
      { tipo: "texto", estilo: "h2", ph: "Título", x: W * 0.06, y: H * 0.06, w: W * 0.88, h: H * 0.14 },
      { tipo: "texto", estilo: "p", ph: "• Primera columna", lista: true, x: W * 0.06, y: H * 0.24, w: W * 0.42, h: H * 0.66 },
      { tipo: "texto", estilo: "p", ph: "• Segunda columna", lista: true, x: W * 0.52, y: H * 0.24, w: W * 0.42, h: H * 0.66 }] },
    { id: "imagen-texto", t: "Imagen y texto", arma: (W, H) => [
      { tipo: "imagen", ph: "Toca para poner una imagen", x: W * 0.05, y: H * 0.1, w: W * 0.43, h: H * 0.8 },
      { tipo: "texto", estilo: "h2", ph: "Título", x: W * 0.52, y: H * 0.1, w: W * 0.43, h: H * 0.16 },
      { tipo: "texto", estilo: "p", ph: "Explica la imagen", x: W * 0.52, y: H * 0.3, w: W * 0.43, h: H * 0.6 }] },
    { id: "imagen", t: "Imagen grande", arma: (W, H) => [
      { tipo: "texto", estilo: "h2", ph: "Título", x: W * 0.06, y: H * 0.04, w: W * 0.88, h: H * 0.13 },
      { tipo: "imagen", ph: "Toca para poner una imagen", x: W * 0.06, y: H * 0.2, w: W * 0.88, h: H * 0.74 }] },
    { id: "seccion", t: "Separador de sección", arma: (W, H) => [
      { tipo: "texto", estilo: "h1", ph: "Nombre de la sección", x: W * 0.08, y: H * 0.38, w: W * 0.84, h: H * 0.18 },
      { tipo: "forma", figura: "rect", x: W * 0.08, y: H * 0.58, w: W * 0.2, h: 8, relleno: true, sombra: false, acento: 0 }] },
    { id: "solo-titulo", t: "Solo título", arma: (W, H) => [{ tipo: "texto", estilo: "h2", ph: "Título", x: W * 0.06, y: H * 0.06, w: W * 0.88, h: H * 0.14 }] },
    { id: "cita", t: "Cita", arma: (W, H) => [
      { tipo: "texto", estilo: "h2", ph: "“Una frase importante”", x: W * 0.1, y: H * 0.3, w: W * 0.8, h: H * 0.26, tAlin: "centro", tCursiva: true },
      { tipo: "texto", estilo: "p", ph: "— Autor", x: W * 0.1, y: H * 0.6, w: W * 0.8, h: H * 0.1, tAlin: "der" }] },
    { id: "comparar", t: "Comparar (tabla)", arma: (W, H) => [
      { tipo: "texto", estilo: "h2", ph: "Título", x: W * 0.06, y: H * 0.06, w: W * 0.88, h: H * 0.14 },
      { tipo: "tabla", filas: 4, cols: 3, encabezado: true, "c:A1": "", "c:B1": "Opción A", "c:C1": "Opción B", x: W * 0.06, y: H * 0.25, w: W * 0.88, h: H * 0.6 }] },
  ];

  // ------------------------------------------------------------ editor de datos (tablas y gráficas)
  const ref = (c, f) => NOM.formulas.ref(c, f);
  /**
   * Ventana con una cuadrícula para escribir los datos de una tabla o una gráfica de la diapositiva.
   * opc: { titulo, bloque (campos actuales), grafica (bool), alGuardar(campos) }.
   */
  function editarDatos(opc) {
    const b = Object.assign({}, opc.bloque || {});
    let filas = Math.max(1, Math.min(40, +b.filas || 4)), cols = Math.max(1, Math.min(12, +b.cols || 3));
    const celdas = {};
    Object.keys(b).forEach((k) => { if (k.startsWith("c:")) celdas[k] = b[k]; });
    const cuerpo = NOM.html(`<div class="col">
      ${opc.grafica ? `<div class="fila" style="flex-wrap:wrap"><div class="campo crece"><label>Tipo</label><div class="entrada"><select data-tipo>${NOM.graficas.TIPOS.map(([v, t]) => `<option value="${v}" ${(b.clase || "barras") === v ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>
        <div class="campo crece"><label>Título</label><div class="entrada"><input data-titulo maxlength="80" value="${esc(b.titulo || "")}"></div></div>
        <div class="campo crece"><label>Colores</label><div class="entrada"><select data-col>${Object.entries(NOM.graficas.PALETAS).map(([k, p]) => `<option value="${k}" ${(b.colores || "clasica") === k ? "selected" : ""}>${p.t}</option>`).join("")}</select></div></div></div>
        <p class="suave chico" style="font-weight:650">Primera columna: nombres (por ejemplo, meses). Primera fila: nombre de cada serie. Lo demás: números.</p>`
      : `<label class="interruptor"><input type="checkbox" data-enc ${b.encabezado ? "checked" : ""}> La primera fila es encabezado (con color)</label>`}
      <div class="editor-datos" data-rejilla></div>
      <div class="fila" style="flex-wrap:wrap"><button type="button" class="btn chico" data-mas="f">${NOM.ico("plus", "ico-s")} Fila</button><button type="button" class="btn chico" data-menos="f">${NOM.ico("minus", "ico-s")} Fila</button>
        <button type="button" class="btn chico" data-mas="c">${NOM.ico("plus", "ico-s")} Columna</button><button type="button" class="btn chico" data-menos="c">${NOM.ico("minus", "ico-s")} Columna</button>
        <button type="button" class="btn chico" data-pegar>${NOM.ico("clipboard-paste", "ico-s")} Pegar desde una hoja</button></div></div>`);
    const rej = NOM.$("[data-rejilla]", cuerpo);
    const leer = () => NOM.$$("input[data-r]", rej).forEach((i) => { if (i.value !== "") celdas["c:" + i.dataset.r] = i.value; else delete celdas["c:" + i.dataset.r]; });
    const pintar = () => {
      let h = "<table><tbody>";
      for (let f = 0; f < filas; f++) { h += "<tr>"; for (let c = 0; c < cols; c++) h += `<td><input data-r="${ref(c, f)}" value="${esc(celdas["c:" + ref(c, f)] || "")}" aria-label="${ref(c, f)}"></td>`; h += "</tr>"; }
      rej.innerHTML = h + "</tbody></table>";
    };
    pintar();
    rej.addEventListener("paste", (e) => {
      const t = e.clipboardData.getData("text/plain");
      if (!/\t|\n/.test(t)) return;
      e.preventDefault(); leer();
      const p = NOM.formulas.parseRef(e.target.dataset.r || "A1");
      t.replace(/\r/g, "").split("\n").filter((x, i, a) => x !== "" || i < a.length - 1).forEach((fila, df) => fila.split("\t").forEach((v, dc) => { celdas["c:" + ref(p.c + dc, p.f + df)] = v; filas = Math.max(filas, p.f + df + 1); cols = Math.max(cols, p.c + dc + 1); }));
      filas = Math.min(40, filas); cols = Math.min(12, cols);
      pintar();
    });
    cuerpo.addEventListener("click", async (e) => {
      const mas = e.target.closest("[data-mas]"), menos = e.target.closest("[data-menos]"), pegar = e.target.closest("[data-pegar]");
      if (!mas && !menos && !pegar) return;
      leer();
      if (mas) { if (mas.dataset.mas === "f") filas = Math.min(40, filas + 1); else cols = Math.min(12, cols + 1); }
      if (menos) { if (menos.dataset.menos === "f") filas = Math.max(1, filas - 1); else cols = Math.max(1, cols - 1); }
      if (pegar) {
        let t = null;
        try { t = await navigator.clipboard.readText(); } catch (x) { t = null; }
        if (!t) { NOM.aviso("Copia las celdas en la hoja y pégalas aquí con Ctrl+V (o mantén presionada una casilla y elige Pegar)", { tipo: "info", ms: 5000 }); return; }
        t.replace(/\r/g, "").split("\n").filter((x, i, a) => x !== "" || i < a.length - 1).forEach((fila, df) => fila.split("\t").forEach((v, dc) => { celdas["c:" + ref(dc, df)] = v; filas = Math.max(filas, df + 1); cols = Math.max(cols, dc + 1); }));
        filas = Math.min(40, filas); cols = Math.min(12, cols);
      }
      pintar();
    });
    const pie = NOM.html(`<div style="display:contents"><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si>Guardar</button></div>`);
    const h = NOM.hoja({ titulo: opc.titulo || (opc.grafica ? "Datos de la gráfica" : "Tabla"), icono: opc.grafica ? "bar-chart" : "table", cuerpo, pie, ancha: true });
    NOM.$("[data-no]", pie).onclick = () => h.cerrar();
    NOM.$("[data-si]", pie).onclick = (e) => {
      e.preventDefault();
      leer();
      const campos = { filas, cols };
      Object.keys(b).forEach((k) => { if (k.startsWith("c:")) campos[k] = null; });
      Object.keys(celdas).forEach((k) => { const p = NOM.formulas.parseRef(k.slice(2)); if (p && p.f < filas && p.c < cols) campos[k] = celdas[k]; });
      if (opc.grafica) Object.assign(campos, { clase: NOM.$("[data-tipo]", cuerpo).value, titulo: NOM.$("[data-titulo]", cuerpo).value.trim(), colores: NOM.$("[data-col]", cuerpo).value });
      else campos.encabezado = NOM.$("[data-enc]", cuerpo).checked || null;
      h.cerrar();
      opc.alGuardar && opc.alGuardar(campos);
    };
  }
  /** Rango con datos de un bloque con celdas (A1:…). */
  function rangoUsado(b) {
    let mf = -1, mc = -1;
    Object.keys(b).forEach((k) => { if (!k.startsWith("c:") || b[k] === "" || b[k] == null) return; const p = NOM.formulas.parseRef(k.slice(2)); if (p) { mf = Math.max(mf, p.f); mc = Math.max(mc, p.c); } });
    return mf < 0 ? null : { c1: 0, f1: 0, c2: mc, f2: mf };
  }
  /** HTML de la gráfica de un bloque de la diapositiva (datos propios). */
  function graficaHtml(b, autonomo) {
    const r = rangoUsado(b);
    const ev = NOM.formulas.evaluador((c, f) => b["c:" + ref(c, f)] || "");
    return NOM.graficas.svg(r ? NOM.graficas.datos(ev, r) : null, b.clase || "barras", { titulo: b.titulo, ejeX: b.ejeX, ejeY: b.ejeY, colores: b.colores, ancho: Math.max(200, Math.round(b.w || 420)), alto: Math.max(140, Math.round(b.h || 240)), autonomo });
  }
  /** HTML de una tabla de la diapositiva (todas sus filas y columnas). */
  function tablaHtml(b) {
    const filas = +b.filas || 0, cols = +b.cols || 0;
    let mf = filas - 1, mc = cols - 1;
    if (!filas || !cols) { const r = rangoUsado(b); if (!r) return `<div class="libre-tabla"><table><tr><td>Tabla vacía (doble clic para escribir)</td></tr></table></div>`; mf = r.f2; mc = r.c2; }
    const ev = NOM.formulas.evaluador((c, f) => b["c:" + ref(c, f)] || "");
    let h = `<div class="libre-tabla diapo-tabla${b.encabezado ? " con-cab" : ""}" style="${b.tTam ? `font-size:${+b.tTam}px;` : ""}${b.colorCab ? `--cab:${esc(b.colorCab)};` : ""}"><table>`;
    for (let f = 0; f <= mf; f++) { h += "<tr>"; for (let c = 0; c <= mc; c++) h += `<td>${esc(NOM.formulas.formatear(ev.valor(c, f)))}</td>`; h += "</tr>"; }
    return h + "</table></div>";
  }

  // ------------------------------------------------------------ imagen (PNG) de una diapositiva
  let cssCache = null;
  /** Las reglas de estilo de la página (para dibujar la diapositiva fuera de ella). */
  function cssDePagina() {
    if (cssCache) return cssCache;
    let t = "";
    for (const hoja of document.styleSheets) {
      try { for (const r of hoja.cssRules) { if (r.type === CSSRule.FONT_FACE_RULE) continue; t += r.cssText + "\n"; } } catch (e) { /* hoja ajena */ }
    }
    cssCache = t;
    return t;
  }
  /** Dibuja el HTML de una diapositiva en un PNG (data URL). escala: 1 = tamaño real. */
  function diapoPng(doc, p, escala) {
    const T = tam(doc), k = escala || 1;
    const cont = NOM.lienzoVista.htmlDiapositiva(doc, p);
    const xhtml = new XMLSerializer().serializeToString(NOM.html(`<div class="diapo diapo-foto" style="${estiloDiapo(doc, p)}position:relative;left:0;top:0;transform:none;border-radius:0;box-shadow:none">${cont}</div>`));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${T.w * k}" height="${T.h * k}" viewBox="0 0 ${T.w} ${T.h}"><foreignObject x="0" y="0" width="${T.w}" height="${T.h}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${cssDePagina().replace(/<\/style/gi, "")}</style>${xhtml}</div></foreignObject></svg>`;
    return new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = Math.round(T.w * k); cv.height = Math.round(T.h * k);
        const g = cv.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(img, 0, 0, cv.width, cv.height);
        try { ok(cv.toDataURL("image/png")); } catch (e) { mal(new Error("Este navegador no deja convertir la diapositiva en imagen")); }
      };
      img.onerror = () => mal(new Error("No se pudo dibujar la diapositiva"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }

  /** Un ícono (trazos SVG) como PNG de 256 px, para PowerPoint. */
  function iconoPng(svg, color, grosor) {
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 24 24" fill="none" stroke="${color || "#2B2A33"}" stroke-width="${+grosor || 2}" stroke-linecap="round" stroke-linejoin="round">${svg || ""}</svg>`;
    return new Promise((ok) => {
      const img = new Image();
      img.onload = () => { const cv = document.createElement("canvas"); cv.width = cv.height = 256; cv.getContext("2d").drawImage(img, 0, 0, 256, 256); try { ok(cv.toDataURL("image/png")); } catch (e) { ok(null); } };
      img.onerror = () => ok(null);
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
    });
  }
  /** Pone tamaño, fondo y tema en un elemento .diapo sin tocar su escala ni su posición. */
  function aplicar(el, doc, p) {
    const T = tam(doc), te = tema(doc), f = fondoDe(doc, p);
    el.style.width = T.w + "px"; el.style.height = T.h + "px";
    el.style.background = cssFondo(f) || "";
    ["--t-titulo", "--t-texto", "--t-fuente-t", "--t-fuente", "--t-franja"].forEach((v) => el.style.removeProperty(v));
    if (te) {
      el.style.setProperty("--t-titulo", te.titulo); el.style.setProperty("--t-texto", te.texto);
      if (te.fuenteT) el.style.setProperty("--t-fuente-t", fuenteCss(te.fuenteT));
      if (te.fuente) el.style.setProperty("--t-fuente", fuenteCss(te.fuente));
      if (te.franja) el.style.setProperty("--t-franja", te.franja);
    }
    el.classList.toggle("con-franja", !!(te && te.franja));
  }
  NOM.diapo = { aplicar, iconoPng, TAMANOS, tam, TEMAS, tema, cssFondo, fondoDe, estiloDiapo, htmlRico, textoPlano, parrafos, DISENOS, editarDatos, graficaHtml, tablaHtml, rangoUsado, diapoPng };
})();
