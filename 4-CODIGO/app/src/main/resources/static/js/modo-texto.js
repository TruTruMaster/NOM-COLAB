/* NOM-COLAB · Modo Texto: procesador de textos tipo Word, letra por letra en tiempo real.

   Todo el documento es UNA hoja editable (no un cuadro por párrafo). Su contenido es la
   secuencia CRDT del bloque "cuerpo" (secuencia.js): cada letra, salto de párrafo u objeto
   (imagen, tabla, salto de página…) es un elemento con id propio.

   Ciclo de edición (sin esperar a la red):
     1. El navegador escribe en la hoja (así funcionan acentos, dictado, autocorrector y teclados
        de celular).
     2. En el evento "input" se lee solo el párrafo tocado, se compara con el modelo y salen las
        operaciones mínimas: insertar, ocultar o dar formato a letras concretas.
     3. Si el navegador dejó etiquetas raras, el párrafo se vuelve a pintar en forma canónica y
        el cursor vuelve a su lugar.
   Lo que llega de otros equipos se integra al modelo y solo se repintan los párrafos que
   cambiaron; el cursor propio se ancla al id de la letra de su izquierda, así no salta. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso } = NOM;
  const S = () => NOM.Secuencia;
  const B = "cuerpo";
  const OBJ = "\uFFFC", SALTO = "\u2028", FIN = "fin";

  // ------------------------------------------------------------ catálogo
  const ESTILOS = [
    { v: null, t: "Normal" }, { v: "titulo", t: "Título" }, { v: "subtitulo", t: "Subtítulo" },
    { v: "h1", t: "Título 1" }, { v: "h2", t: "Título 2" }, { v: "h3", t: "Título 3" },
    { v: "cita", t: "Cita" }, { v: "codigo", t: "Código" },
  ];
  const FUENTES = {
    Calibri: "'Calibri','Carlito',sans-serif", Arial: "'Arial','Liberation Sans','Arimo',sans-serif",
    "Times New Roman": "'Times New Roman','Liberation Serif','Tinos',serif", Cambria: "'Cambria','Caladea',serif",
    Georgia: "'Georgia',serif", Garamond: "'Garamond','EB Garamond',serif", Verdana: "'Verdana','DejaVu Sans',sans-serif",
    Tahoma: "'Tahoma','DejaVu Sans',sans-serif", "Trebuchet MS": "'Trebuchet MS',sans-serif",
    "Courier New": "'Courier New','Liberation Mono','Cousine',monospace", "Comic Sans MS": "'Comic Sans MS','Comic Neue',cursive",
    Nunito: "'Nunito',sans-serif",
  };
  const TAMANOS = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
  const COLORES = [
    "#000000", "#434343", "#666666", "#999999", "#B7B7B7", "#D9D9D9", "#EFEFEF", "#FFFFFF",
    "#C00000", "#FF0000", "#FFC000", "#FFFF00", "#92D050", "#00B050", "#00B0F0", "#0070C0",
    "#002060", "#7030A0", "#E06666", "#F6B26B", "#FFD966", "#93C47D", "#6FA8DC", "#8E7CC3",
  ];
  const RESALTES = ["#FFFF00", "#00FF00", "#00FFFF", "#FF00FF", "#FFC000", "#C9DAF8", "#F4CCCC", "#D9EAD3"];
  // sug / sugBorrar: modo sugerencia (7): texto propuesto o propuesto para borrar, con su autor.
  const CAR = ["b", "i", "u", "s", "va", "color", "fondo", "fuente", "tam", "enlace", "sug", "sugBorrar"];
  // dueno: el párrafo es de esa persona (3.5); solo ella y el propietario del espacio lo cambian.
  // 8.2: sangrías exactas (cm), primera línea o francesa, y opciones de lista (empezar en, continuar,
  // estilo de viñeta o de número).
  const PAR = ["estilo", "alin", "lista", "nivel", "hecho", "sangria", "interlineado", "antes", "despues", "dueno",
    "sangiz", "sangder", "primera", "francesa", "inicio", "continuar", "vineta", "numfmt"];
  const VINETAS = ["•", "◦", "▪", "–", "➢", "✓", "★", "♦"];
  const NUMFMTS = [["1.", "1. 2. 3."], ["1)", "1) 2) 3)"], ["a.", "a. b. c."], ["a)", "a) b) c)"], ["A.", "A. B. C."], ["I.", "I. II. III."], ["i.", "i. ii. iii."]];
  /** Quién mira el documento (para los párrafos con dueño): lo llena montar(). */
  const ctx = { yo: null, propietario: false, nombres: new Map(), colores: new Map() };
  const URL_SOLA = /^https?:\/\/[^\s<>"]+$/i;
  const PAGINAS = { carta: { n: "Carta (21.6 × 27.9 cm)", w: 816, h: 1056 }, a4: { n: "A4 (21 × 29.7 cm)", w: 794, h: 1123 }, oficio: { n: "Oficio (21.6 × 35.6 cm)", w: 816, h: 1344 },
    a5: { n: "A5 (14.8 × 21 cm)", w: 559, h: 794 }, media: { n: "Media carta (14 × 21.6 cm)", w: 529, h: 816 } };
  const CM = 37.7953;   // px por centímetro
  const enCm = (px) => Math.round((px / CM) * 100) / 100;
  const MARGENES = { normal: { n: "Normal (2.5 cm)", v: 96 }, estrecho: { n: "Estrecho (1.27 cm)", v: 48 }, moderado: { n: "Moderado (1.9 cm)", v: 72 }, ancho: { n: "Ancho (5 cm)", v: 192 } };
  const SIMBOLOS = "© ® ™ € £ ¥ ¢ ° ± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ π Ω µ α β γ δ θ λ → ← ↑ ↓ ↔ ⇒ • · … — – « » ¿ ¡ § ¶ † ✓ ✗ ★ ☆ ♥ ☐ ☑ ½ ¼ ¾ ² ³".split(" ");
  const GAP = 28;   // separación entre páginas (px)

  const limpio = (a) => {
    if (!a) return undefined;
    const r = {};
    for (const k in a) if (a[k] != null && a[k] !== false && a[k] !== "") r[k] = a[k];
    return Object.keys(r).length ? r : undefined;
  };
  const claveA = (a) => { const l = limpio(a); return l ? Object.keys(l).sort().map((k) => k + "=" + l[k]).join(";") : ""; };
  const solo = (a, ks) => { const r = {}; ks.forEach((k) => { if (a && a[k] != null && a[k] !== false && a[k] !== "") r[k] = a[k]; }); return r; };
  const cssFuente = (f) => FUENTES[f] || `'${String(f).replace(/['";{}<>]/g, "")}',sans-serif`;
  const cps = (s) => Array.from(s || "");

  // ------------------------------------------------------------ colores (rgb() → #rrggbb)
  const lienzoColor = document.createElement("canvas").getContext("2d");
  const cacheColor = new Map();
  function hex(c) {
    if (!c) return null;
    c = String(c).trim();
    if (/^(transparent|inherit|initial|currentcolor|windowtext)$/i.test(c) || /rgba\([^)]*,\s*0\)/.test(c)) return null;
    if (cacheColor.has(c)) return cacheColor.get(c);
    lienzoColor.fillStyle = "#010203";
    lienzoColor.fillStyle = c;
    let r = lienzoColor.fillStyle;
    if (r === "#010203" && !/^#?010203$/i.test(c)) r = null;
    if (r && r[0] !== "#") r = null;
    cacheColor.set(c, r ? r.toUpperCase() : null);
    return cacheColor.get(c);
  }
  function aPt(v) {
    if (!v) return null;
    const m = /^([\d.]+)(pt|px|em|rem)?$/.exec(String(v).trim());
    if (!m) return { "x-small": 7.5, small: 10, medium: 12, large: 13.5, "x-large": 18, "xx-large": 24 }[v] || null;
    const n = parseFloat(m[1]);
    const pt = m[2] === "px" ? n * 0.75 : m[2] === "em" || m[2] === "rem" ? n * 11 : n;
    return Math.round(pt * 2) / 2 || null;
  }

  // ------------------------------------------------------------ DOM → tokens
  const BLOQUES = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE", "UL", "OL", "TABLE", "TBODY", "THEAD", "TR", "SECTION", "ARTICLE", "HEADER", "FOOTER", "FIGURE", "DL", "DT", "DD", "ASIDE", "NAV", "MAIN", "CENTER", "HR"]);
  const OMITIR = new Set(["STYLE", "SCRIPT", "META", "TITLE", "LINK", "HEAD", "TEMPLATE", "NOSCRIPT", "SVG", "OBJECT", "IFRAME", "INPUT", "BUTTON", "SELECT", "TEXTAREA"]);

  function attrsInline(n, a) {
    const tag = n.tagName;
    let r = null;
    const pon = (k, v) => { if (!r) r = Object.assign({}, a); if (v == null || v === false) delete r[k]; else r[k] = v; };
    if (tag === "B" || tag === "STRONG") pon("b", true);
    else if (tag === "I" || tag === "EM" || tag === "CITE" || tag === "VAR") pon("i", true);
    else if (tag === "U" || tag === "INS") pon("u", true);
    else if (tag === "S" || tag === "STRIKE" || tag === "DEL") pon("s", true);
    else if (tag === "SUB") pon("va", "sub");
    else if (tag === "SUP") pon("va", "sup");
    else if (tag === "CODE" || tag === "KBD" || tag === "SAMP" || tag === "TT") pon("fuente", "Courier New");
    else if (tag === "MARK") pon("fondo", "#FFFF00");
    else if (tag === "A") { const h = n.getAttribute("href"); if (h && /^(https?:|mailto:|#)/i.test(h)) pon("enlace", h); }
    if (n.dataset && (n.dataset.sug || n.dataset.sugb)) {
      try { if (n.dataset.sug) pon("sug", JSON.parse(n.dataset.sug)); if (n.dataset.sugb) pon("sugBorrar", JSON.parse(n.dataset.sugb)); } catch (e) { /* atributo dañado */ }
    }
    else if (tag === "FONT") {
      if (n.getAttribute("color")) pon("color", hex(n.getAttribute("color")));
      if (n.getAttribute("face")) pon("fuente", n.getAttribute("face").split(",")[0].replace(/['"]/g, "").trim());
    }
    const st = n.style;
    if (st && st.length) {
      const fw = st.fontWeight;
      if (fw) pon("b", fw === "bold" || fw === "bolder" || +fw >= 600);
      if (st.fontStyle) pon("i", st.fontStyle === "italic" || st.fontStyle === "oblique");
      const td = st.textDecorationLine || st.textDecoration || "";
      if (td) { if (/underline/.test(td)) pon("u", true); if (/line-through/.test(td)) pon("s", true); if (td === "none") { pon("u", false); pon("s", false); } }
      if (st.verticalAlign === "sub" || st.verticalAlign === "super") pon("va", st.verticalAlign === "sub" ? "sub" : "sup");
      if (st.color) { const c = hex(st.color); pon("color", c === "#000000" && !n.closest(".wd-cuerpo") ? null : c); }
      if (st.backgroundColor) pon("fondo", hex(st.backgroundColor));
      if (st.fontFamily) {
        const f = st.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
        if (f && !/^(serif|sans-serif|monospace|cursive|system-ui|inherit|-apple-system)$/i.test(f)) pon("fuente", f);
      }
      if (st.fontSize) pon("tam", aPt(st.fontSize));
    }
    return r || a;
  }

  function attrsParrafo(n, heredado) {
    const pa = Object.assign({}, heredado || {});
    const d = n.dataset || {}, tag = n.tagName;
    const enEditor = d.k !== undefined || (n.closest && n.closest(".wd-cuerpo"));
    if (enEditor) {
      const r = {};
      if (/^H[1-3]$/.test(tag)) r.estilo = tag.toLowerCase();
      if (d.estilo) r.estilo = d.estilo;
      if (d.lista) { r.lista = d.lista; if (+d.nivel) r.nivel = +d.nivel; if (d.hecho === "true") r.hecho = true; }
      if (d.alin) r.alin = d.alin;
      if (+d.sangria) r.sangria = +d.sangria;
      if (d.li) r.interlineado = +d.li;
      if (d.antes != null && d.antes !== "") r.antes = +d.antes;
      if (d.desp != null && d.desp !== "") r.despues = +d.desp;
      if (d.dueno) r.dueno = d.dueno;
      ["sangiz", "sangder", "primera", "francesa", "inicio"].forEach((k) => { if (d[k] != null && d[k] !== "" && !isNaN(+d[k])) r[k] = +d[k]; });
      if (d.continuar === "true") r.continuar = true;
      if (d.vineta) r.vineta = d.vineta;
      if (d.numfmt) r.numfmt = d.numfmt;
      return r;
    }
    // HTML ajeno (pegado de Word, Google Docs, la web…)
    const cls = (n.className && String(n.className)) || "";
    if (/^H[1-6]$/.test(tag)) pa.estilo = tag === "H1" ? "h1" : tag === "H2" ? "h2" : "h3";
    else if (/MsoTitle/.test(cls) || n.getAttribute("role") === "heading" && n.getAttribute("aria-level") === "1") pa.estilo = "titulo";
    else if (/MsoSubtitle/.test(cls)) pa.estilo = "subtitulo";
    else if (tag === "BLOCKQUOTE" || /MsoQuote|MsoIntenseQuote/.test(cls)) pa.estilo = "cita";
    else if (tag === "PRE") pa.estilo = "codigo";
    if (tag === "LI") {
      const lista = n.parentElement;
      pa.lista = lista && lista.tagName === "OL" ? "numeros" : "vinetas";
      let nivel = 0, p = lista && lista.parentElement;
      while (p) { if (p.tagName === "UL" || p.tagName === "OL") nivel++; p = p.parentElement; }
      if (nivel) pa.nivel = Math.min(nivel, 8);
      const cb = n.querySelector('input[type="checkbox"]');
      if (cb || /checked|task/.test(cls)) { pa.lista = "tareas"; if (cb && cb.checked) pa.hecho = true; }
    } else if (/MsoListParagraph/.test(cls)) pa.lista = "vinetas";
    const st = n.style;
    const al = (st && st.textAlign) || n.getAttribute("align");
    if (al) { const v = { center: "centro", right: "der", justify: "just" }[al.toLowerCase()]; if (v) pa.alin = v; else delete pa.alin; }
    if (st && st.lineHeight && /^[\d.]+$/.test(st.lineHeight)) pa.interlineado = Math.min(3, +st.lineHeight);
    const ml = st && (st.marginLeft || st.paddingLeft);
    if (ml && !pa.lista) { const pt = aPt(ml); if (pt && pt >= 18) pa.sangria = Math.min(10, Math.round(pt / 36)); }
    return pa;
  }

  /**
   * Tokens de un elemento: { c, a } letra, { c: OBJ, id | img } objeto, { c: "\n", pa } fin de párrafo.
   * pre: el texto se toma tal cual (el editor usa white-space: pre-wrap); si no, se colapsan espacios.
   */
  function tokens(raiz, opc) {
    opc = Object.assign({}, opc);
    if (opc.parrafo) opc.pre = true;
    const out = [];
    let enParrafo = 0;   // cuántas cosas hay desde el último fin de párrafo
    function cerrar(pa) {
      const u = out[out.length - 1];
      if (u && u.br) { out.pop(); enParrafo--; }   // el último <br> de un párrafo solo le da altura
      if (!opc.pre) while (out.length && out[out.length - 1].c === " " && enParrafo > 0) { out.pop(); enParrafo--; }
      out.push({ c: "\n", pa: limpio(pa) || {} });
      enParrafo = 0;
    }
    function texto(t, a, pre) {
      if (!pre) {
        t = t.replace(/[\t\n\r ]+/g, " ");
        if (t === " " && (!enParrafo || (out.length && out[out.length - 1].c === " "))) return;
      }
      for (const c of t) {
        if (!pre && c === " " && (!enParrafo || out[out.length - 1].c === " ")) continue;
        out.push({ c, a }); enParrafo++;
      }
    }
    function rec(el, a, pa, pre) {
      for (let n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) { texto(n.nodeValue, a, pre); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName;
        if (n.hasAttribute("data-obj")) { out.push({ c: OBJ, id: n.getAttribute("data-id"), a }); enParrafo++; continue; }
        if (OMITIR.has(tag) || n.hidden || (n.style && n.style.display === "none")) continue;
        if (tag === "BR") { out.push({ c: SALTO, a, br: true }); enParrafo++; continue; }
        if (tag === "IMG") {
          const src = n.getAttribute("src") || "";
          if (/^data:image\/(png|jpe?g|gif|webp)/i.test(src)) { out.push({ c: OBJ, img: src, w: n.width || +n.getAttribute("width") || 0, h: n.height || +n.getAttribute("height") || 0, a }); enParrafo++; }
          continue;
        }
        if (tag === "TD" || tag === "TH") { rec(n, a, pa, pre); out.push({ c: "\t", a }); enParrafo++; continue; }
        if (BLOQUES.has(tag)) {
          if (tag === "HR") { if (enParrafo) cerrar(pa); out.push({ c: OBJ, obj: { tipo: "linea" } }); enParrafo++; cerrar({}); continue; }
          if (enParrafo) cerrar(pa);
          const pb = attrsParrafo(n, ["UL", "OL", "TABLE", "TBODY", "THEAD", "DIV", "SECTION", "ARTICLE", "MAIN", "CENTER"].includes(tag) ? pa : {});
          const esPre = pre || tag === "PRE";
          rec(n, attrsInline(n, a), pb, esPre);
          if (tag === "TR" && out.length && out[out.length - 1].c === "\t") { out.pop(); enParrafo--; }
          if (enParrafo || ["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE"].includes(tag)) cerrar(pb);
          continue;
        }
        rec(n, attrsInline(n, a), pa, pre);
      }
    }
    if (opc.parrafo) {
      // Un párrafo del editor: su propio fin de párrafo va al final.
      const pa = attrsParrafo(raiz);
      rec(raiz, {}, pa, true);
      cerrar(pa);
    } else {
      rec(raiz, {}, {}, !!opc.pre);
      if (enParrafo) cerrar({});
    }
    return out;
  }

  // ------------------------------------------------------------ modelo → párrafos
  /** [{ k, ini, fin, mark, num }] a partir de los visibles. */
  function calcularParrafos(sec) {
    const vis = sec.visibles(), ps = [];
    let ini = 0;
    for (let i = 0; i < vis.length; i++) if (vis[i].c === "\n" && !vis[i].e) { ps.push({ k: vis[i].id, ini, fin: i, mark: vis[i] }); ini = i + 1; }
    ps.push({ k: FIN, ini, fin: vis.length, mark: sec.fin });
    // Numeración de listas: contador por nivel; se reinicia cuando la lista se interrumpe, salvo
    // que el párrafo diga "continuar". "inicio" fija el número de ese renglón (8.2).
    let cont = [], previo = [];
    ps.forEach((p) => {
      const pa = S().attrs(p.mark);
      if (pa.lista === "numeros") {
        if (!cont.length && pa.continuar && previo.length) cont = previo.slice();
        const nv = pa.nivel || 0;
        cont.length = nv + 1;
        cont[nv] = pa.inicio != null && pa.inicio !== "" && !isNaN(+pa.inicio) ? Math.max(0, +pa.inicio) : (cont[nv] || 0) + 1;
        p.num = numeral(cont[nv], nv, pa.numfmt);
      } else if (pa.lista !== "vinetas" && pa.lista !== "tareas") { if (cont.length) previo = cont.slice(); cont = []; }
    });
    return ps;
  }
  const letras = (n, mayus) => { let s = ""; while (n > 0) { n--; s = String.fromCharCode((mayus ? 65 : 97) + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
  function romano(n) {
    const r = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
    let s = "", k = Math.max(1, Math.min(3999, n));
    for (const [v, l] of r) while (k >= v) { s += l; k -= v; }
    return s;
  }
  function numeral(n, nivel, fmt) {
    if (fmt) {
      const sep = fmt.slice(-1), base = fmt.slice(0, -1);
      const v = base === "a" ? letras(n) : base === "A" ? letras(n, true) : base === "I" ? romano(n).toUpperCase() : base === "i" ? romano(n) : String(n);
      return v + sep;
    }
    const t = nivel % 3;
    if (t === 1) return letras(n) + ".";
    if (t === 2) return romano(n) + ".";
    return n + ".";
  }

  function envolver(txt, a) {
    let h = esc(txt).replace(/\u2028/g, "<br>");
    let st = "";
    if (a.color) st += `color:${a.color};`;
    if (a.fondo) st += `background-color:${a.fondo};`;
    if (a.fuente) st += `font-family:${cssFuente(a.fuente)};`;
    if (a.tam) st += `font-size:${+a.tam}pt;`;
    if (st) h = `<span style="${esc(st)}">${h}</span>`;
    if (a.va === "sub") h = `<sub>${h}</sub>`; else if (a.va === "sup") h = `<sup>${h}</sup>`;
    if (a.s) h = `<s>${h}</s>`;
    if (a.u) h = `<u>${h}</u>`;
    if (a.i) h = `<i>${h}</i>`;
    if (a.b) h = `<b>${h}</b>`;
    if (a.enlace) h = `<a href="${esc(a.enlace)}">${h}</a>`;
    if (a.sug) h = `<span class="wd-sug" data-sug="${esc(JSON.stringify(a.sug))}" style="--c:${esc(a.sug.c || "#1D7A4C")}" title="${esc("Sugerencia de " + (a.sug.n || ""))}">${h}</span>`;
    if (a.sugBorrar) h = `<span class="wd-sugb" data-sugb="${esc(JSON.stringify(a.sugBorrar))}" style="--c:${esc(a.sugBorrar.c || "#C2372B")}" title="${esc((a.sugBorrar.n || "") + " propone borrarlo")}">${h}</span>`;
    return h;
  }
  const BLOQUE_OBJ = new Set(["tabla", "salto", "linea", "indice"]);
  function htmlObjeto(it) {
    const t = (it.e && it.e.tipo) || "x";
    return `<span class="wd-obj wd-${esc(t)}${BLOQUE_OBJ.has(t) ? " bloque" : ""}" data-obj data-id="${esc(it.id)}" contenteditable="false"></span>`;
  }
  function htmlParrafo(vis, p) {
    const pa = S().attrs(p.mark);
    const tag = pa.estilo === "h1" || pa.estilo === "h2" || pa.estilo === "h3" ? pa.estilo : "p";
    let at = ` data-k="${esc(p.k)}"`, st = "";
    if (pa.estilo && tag === "p") at += ` data-estilo="${esc(pa.estilo)}"`;
    if (pa.lista) {
      at += ` data-lista="${esc(pa.lista)}" data-nivel="${+pa.nivel || 0}"`;
      if (p.num) at += ` data-num="${p.num}"`;
      if (pa.lista === "tareas" && pa.hecho) at += ` data-hecho="true"`;
    }
    if (pa.alin) at += ` data-alin="${esc(pa.alin)}"`;
    if (pa.dueno) {
      at += ` data-dueno="${esc(pa.dueno)}" data-dueno-nombre="${esc(ctx.nombres.get(pa.dueno) || "Asignado")}"`;
      st += `--dueno:${esc(ctx.colores.get(pa.dueno) || "#6B6875")};`;
      // El párrafo de otra persona no se puede editar desde aquí (tampoco con el teclado del celular).
      if (pa.dueno !== ctx.yo && !ctx.propietario) at += ` contenteditable="false"`;
    }
    if (+pa.sangria) { at += ` data-sangria="${+pa.sangria}"`; st += `--sang:${+pa.sangria};`; }
    // 8.2 Sangrías en cm: izquierda, derecha, de primera línea o francesa (APA).
    if (+pa.sangiz) { at += ` data-sangiz="${+pa.sangiz}"`; st += `--sangiz:${+pa.sangiz}cm;`; }
    if (+pa.sangder) { at += ` data-sangder="${+pa.sangder}"`; st += `--sangder:${+pa.sangder}cm;`; }
    if (pa.primera != null && pa.primera !== "") { at += ` data-primera="${+pa.primera}"`; st += `--primera:${+pa.primera}cm;`; }
    if (+pa.francesa) { at += ` data-francesa="${+pa.francesa}"`; st += `--francesa:${+pa.francesa}cm;`; }
    if (pa.lista && pa.inicio != null && pa.inicio !== "") at += ` data-inicio="${+pa.inicio}"`;
    if (pa.lista && pa.continuar) at += ` data-continuar="true"`;
    if (pa.lista && pa.vineta) at += ` data-vineta="${esc(pa.vineta)}"`;
    if (pa.lista && pa.numfmt) at += ` data-numfmt="${esc(pa.numfmt)}"`;
    if (pa.interlineado) { at += ` data-li="${+pa.interlineado}"`; st += `--li:${+pa.interlineado};`; }
    if (pa.antes != null) { at += ` data-antes="${+pa.antes}"`; st += `--antes:${+pa.antes}pt;`; }
    if (pa.despues != null) { at += ` data-desp="${+pa.despues}"`; st += `--desp:${+pa.despues}pt;`; }
    if (st) at += ` style="${st}"`;
    let h = "";
    let i = p.ini;
    while (i < p.fin) {
      const it = vis[i];
      if (it.e) { h += htmlObjeto(it); i++; continue; }
      const k = S().claveAttrs(it);
      let j = i, txt = "";
      while (j < p.fin && !vis[j].e && S().claveAttrs(vis[j]) === k) { txt += vis[j].c; j++; }
      h += envolver(txt, S().attrs(it));
      i = j;
    }
    // El <br> final solo da altura (no es contenido). También va tras una imagen al final del
    // renglón: sin él, el navegador no tiene dónde poner el cursor después de la imagen.
    const ult = p.fin > p.ini ? vis[p.fin - 1] : null;
    if (!h) h = "<br>";
    else if (ult && (ult.c === SALTO || (ult.e && !BLOQUE_OBJ.has(ult.e.tipo)))) h += "<br>";
    return `<${tag}${at}>${h}</${tag}>`;
  }

  /** Igualdad de contenido (sin mirar dentro de los objetos, que se llenan aparte). */
  function iguales(a, b) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType === 3) return a.nodeValue === b.nodeValue;
    if (a.nodeType !== 1 || a.tagName !== b.tagName) return false;
    if (a.hasAttribute("data-obj")) return a.getAttribute("data-id") === b.getAttribute("data-id");
    const aa = a.attributes, ba = b.attributes;
    if (aa.length !== ba.length) return false;
    for (let i = 0; i < aa.length; i++) if (b.getAttribute(aa[i].name) !== aa[i].value) return false;
    return mismosHijos(a, b);
  }
  function mismosHijos(a, b) {
    let x = a.firstChild, y = b.firstChild;
    while (x && y) { if (!iguales(x, y)) return false; x = x.nextSibling; y = y.nextSibling; }
    return !x && !y;
  }
  const plantilla = document.createElement("template");
  function crearEl(h) { plantilla.innerHTML = h; return plantilla.content.firstChild; }

  // ------------------------------------------------------------ texto enriquecido para exportar
  /** Párrafos del documento: [{ pa, tramos: [{ x, a } | { e, a }] }]. Lo usan Word, HTML, Markdown y PDF. */
  function parrafosDe(doc) {
    asegurarSecuencia(doc, true);
    const sec = doc.secuencia(B), vis = sec.visibles(), r = [];
    calcularParrafos(sec).forEach((p) => {
      const tramos = [];
      for (let i = p.ini; i < p.fin; i++) {
        const it = vis[i];
        let a = S().attrs(it);
        // Sugerencias sin resolver: se exportan como en "control de cambios" (subrayado o tachado).
        if (a.sug || a.sugBorrar) { a = Object.assign({}, a); if (a.sug) { a.u = true; a.color = "#1D7A4C"; } if (a.sugBorrar) { a.s = true; a.color = "#C2372B"; } delete a.sug; delete a.sugBorrar; }
        if (it.e) { tramos.push({ e: Object.assign({}, it.e, it.e.ref ? doc.bloque(it.e.ref) || {} : {}, { tipo: it.e.tipo }), a }); continue; }
        const u = tramos[tramos.length - 1];
        if (u && u.x != null && claveA(u.a) === claveA(a)) u.x += it.c; else tramos.push({ x: it.c, a });
      }
      r.push({ pa: S().attrs(p.mark), tramos, num: p.num });
    });
    return r;
  }

  // ------------------------------------------------------------ migración de documentos viejos
  /** Documentos de antes (un bloque por párrafo): se pasan a la secuencia con ids deterministas,
      así dos equipos que migran a la vez producen exactamente las mismas operaciones. */
  function asegurarSecuencia(doc, soloMemoria) {
    if (doc.tieneSecuencia(B)) return;
    const viejos = doc.paginas().flatMap((p) => doc.deLaPagina(p)).filter((b) => ["texto", "tabla", "imagen", "forma"].includes(b.tipo) && !b.enTexto);
    if (!viejos.length) return;
    const ps = [];
    viejos.forEach((b) => {
      if (b.tipo === "texto") {
        const d = document.createElement("div");
        d.innerHTML = b.html || "";
        const tk = tokens(d, {});
        const pa = { titulo: { estilo: "titulo" }, subtitulo: { estilo: "subtitulo" }, h1: { estilo: "h1" }, h2: { estilo: "h2" }, cita: { estilo: "cita" }, lista: { lista: "vinetas" }, tarea: { lista: "tareas", hecho: !!b.hecho } }[b.estilo] || {};
        let tramos = [];
        tk.forEach((t) => {
          if (t.c === "\n") { ps.push({ tramos, a: limpio(Object.assign({}, t.pa, pa)) }); tramos = []; return; }
          if (t.c === OBJ) return;
          const u = tramos[tramos.length - 1];
          if (u && claveA(u.a) === claveA(t.a)) u.x += t.c; else tramos.push({ x: t.c, a: limpio(t.a) });
        });
        if (!tk.length || tramos.length) ps.push({ tramos, a: limpio(pa) });
      } else if (b.tipo === "tabla" || b.tipo === "imagen") ps.push({ tramos: [{ e: { tipo: b.tipo, ref: b.id } }] });
      else if (b.tipo === "forma") ps.push({ tramos: [{ x: b.texto || "" }] });
    });
    const ops = S().crearOps(B, ps, "mig", 1, "mig");
    if (!ops.length) return;
    ops.forEach((op) => {
      doc._fusionar(op);
      if (!soloMemoria && !doc.opc.soloLectura && !doc.opc.local) doc.pendientes.push(op);
    });
    if (!soloMemoria && doc.pendientes.length && !doc.opc.local) doc.reanudar();
    if (doc.opc.local && !doc.opc.soloMemoria && !soloMemoria) doc.guardarYa();
  }

  // ================================================================== el modo
  NOM.modos.TEXTO = {
    montar(ed) {
      const doc = () => ed.doc;
      const sec = () => doc().secuencia(B);
      const self = this;
      asegurarSecuencia(doc(), !!ed.previa || ed.soloLectura);

      const pref = NOM.leer("nom.texto", {});
      const movil = !matchMedia("(hover: hover)").matches || innerWidth < 760;
      ctx.yo = (NOM.api.usuario() || {}).id || null;
      ctx.propietario = !!ed.esPropietario;
      /** 7: con el modo sugerencia, lo que se escribe o se borra queda propuesto, no aplicado. */
      let modoSug = false;
      const yoSug = () => { const u = NOM.api.usuario() || {}; return { u: u.id || "", n: u.nombre || "", c: u.color || "#1D7A4C" }; };
      let vista = pref.vista || (movil ? "continua" : "paginas");
      let zoom = pref.zoom || 1;

      const raiz = html(`<div class="wd" data-vista="${vista}">
        <nav class="wd-esquema" data-esquema hidden aria-label="Esquema del documento"><div class="wd-esquema-cab"><b>Esquema</b><button class="icono-btn" data-cerrar-esquema aria-label="Cerrar esquema">${ico("x")}</button></div><div data-esquema-lista></div></nav>
        <div class="wd-zona" data-zona>
          <div class="wd-hoja" data-hoja>
            <div class="wd-paginas" data-paginas aria-hidden="true"></div>
            <div class="wd-cuerpo" data-cuerpo ${ed.soloLectura ? "" : 'contenteditable="true"'} role="textbox" aria-multiline="true" aria-label="Documento" spellcheck="true" lang="es" translate="no"></div>
          </div>
          <div class="wd-cursores" data-cursores aria-hidden="true"></div>
        </div>
        <footer class="wd-estado" data-estado></footer>
      </div>`);
      ed.lienzo.append(raiz);
      ed.lienzo.classList.add("con-wd");
      const zona = $("[data-zona]", raiz), hoja = $("[data-hoja]", raiz), cuerpo = $("[data-cuerpo]", raiz);
      const capaPaginas = $("[data-paginas]", raiz), capaCursores = $("[data-cursores]", raiz), barraEstado = $("[data-estado]", raiz);

      // ------------------------------------------------------------ pintado
      const elems = new Map();       // clave de párrafo → elemento
      const cache = new Map();       // clave → html pintado
      let visPintado = [], psPintado = [];   // lo que la hoja muestra AHORA (para traducir posiciones)
      let componiendo = false, pintando = false, necesitaPintar = false, ultimaSel = { a: 0, f: 0, ini: 0, fin: 0, col: true };
      let pendiente = null;          // formato para lo próximo que se escriba ({ a, pos })
      // Los cambios del DOM se guardan en cuanto el navegador los entrega. Si otro oyente de "input"
      // corre antes (el de las celdas de tabla va en captura), al terminar ese oyente el navegador ya
      // le pasó los registros al observador y takeRecords() llegaría vacío: lo escrito no entraba al modelo.
      let registros = [];
      const mo = new MutationObserver((l) => { registros.push(...l); });
      function tomarRegistros() { const r = registros.length ? registros.concat(mo.takeRecords()) : mo.takeRecords(); registros = []; return r; }

      function actualizarPintado() { visPintado = sec().visibles(); psPintado = calcularParrafos(sec()); }

      function reconciliar() {
        pintando = true;
        // Texto suelto fuera de los párrafos (lo deja el navegador al reemplazar todo con Ctrl+A):
        // ya se leyó al modelo, así que se quita y se vuelve a pintar dentro de su párrafo.
        for (const n of [...cuerpo.childNodes]) if (n.nodeType !== 1) n.remove();
        actualizarPintado();
        const vis = visPintado, ps = psPintado, vivos = new Set();
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          vivos.add(p.k);
          const h = htmlParrafo(vis, p);
          let el = elems.get(p.k);
          if (!el || cache.get(p.k) !== h || !el.isConnected) {
            const nuevo = crearEl(h);
            if (el && el.dataset.empuje) { nuevo.style.marginTop = el.style.marginTop; nuevo.dataset.empuje = el.dataset.empuje; }
            if (el && el.isConnected) el.replaceWith(nuevo);
            el = nuevo;
            elems.set(p.k, el);
            cache.set(p.k, h);
            llenarObjetos(el);
          }
          const actual = cuerpo.children[i];
          if (actual !== el) cuerpo.insertBefore(el, actual || null);
        }
        while (cuerpo.children.length > ps.length) cuerpo.lastElementChild.remove();
        for (const k of [...elems.keys()]) if (!vivos.has(k)) { elems.delete(k); cache.delete(k); }
        $$(".wd-indice[data-obj]", cuerpo).forEach(pintarIndice);
        tomarRegistros();
        pintando = false;
        actualizarIndices();
        programarPaginar();
        pintarEsquema();
        revisarNombres();
        if (resaltado || marcasComentario.length) programarMarcas();
      }
      let tMarcas = null;
      function programarMarcas() { clearTimeout(tMarcas); tMarcas = setTimeout(() => { if (resaltado) aplicarResaltado(); pintarComentarios(); }, 80); }

      /** Lo que se dibuja dentro de los objetos (no forma parte del html del párrafo). */
      function llenarObjetos(raizEl) {
        $$("[data-obj]", raizEl).forEach((o) => {
          const it = sec().item(o.dataset.id);
          if (!it || !it.e) return;
          const e = it.e, bl = e.ref ? doc().bloque(e.ref) : null;
          if (e.tipo === "imagen") {
            const src = (bl && bl.src) || e.src || "";
            const w = (bl && bl.w) || e.w || 320;
            // 8.2 Recorte, giro, pie de imagen numerado y texto alrededor (cuadrado a la izquierda o derecha).
            const pie = bl && bl.pie ? `<span class="wd-img-pie"><b>Figura ${numeroFigura(o.dataset.id)}.</b> ${esc(bl.pie)}</span>` : "";
            o.innerHTML = `<span class="wd-img-caja"><img src="${esc(src)}" alt="${esc((bl && bl.alt) || "")}" draggable="false" style="width:${+w}px"></span>${pie}${ed.soloLectura ? "" : '<span class="wd-tirador" data-tirador title="Arrastra para cambiar el tamaño"></span>'}`;
            if (bl && (bl.recorte || +bl.rot)) acomodarImagen($(".wd-img-caja", o), +w, bl.recorte, +bl.rot || 0);
            o.classList.toggle("flota-izq", !!(bl && bl.ajuste === "izq" && !bl.libre));
            o.classList.toggle("flota-der", !!(bl && bl.ajuste === "der" && !bl.libre));
            // Imagen libre ("delante del texto"): se dibuja encima, desplazada (x, y) desde su párrafo.
            const libre = !!(bl && bl.libre);
            o.classList.toggle("libre", libre);
            o.classList.toggle("sel", o.dataset.id === imgSel);
            o.style.left = libre ? (+bl.x || 0) + "px" : "";
            o.style.top = libre ? (+bl.y || 0) + "px" : "";
            o.title = ed.soloLectura ? "" : libre ? "Arrastra para moverla a cualquier lugar" : "Arrastra para moverla a otro lugar del texto";
          } else if (e.tipo === "tabla") pintarTabla(o, bl, e.ref);
          else if (e.tipo === "nota") { o.innerHTML = `<sup>${numerosNotas().get(o.dataset.id) || "*"}</sup>`; o.title = bl && bl.texto ? "Nota: " + bl.texto : "Nota al pie (toca para escribirla)"; }
          else if (e.tipo === "ecuacion") { o.innerHTML = NOM.ecuaciones ? NOM.ecuaciones.html((bl && bl.tex) || "", !!(bl && bl.bloque)) : esc((bl && bl.tex) || ""); o.classList.toggle("en-bloque", !!(bl && bl.bloque)); o.title = ed.soloLectura ? "" : "Toca para editar la ecuación"; }
          else if (e.tipo === "salto") o.innerHTML = `<span>Salto de página</span>`;
          else if (e.tipo === "linea") o.innerHTML = `<hr>`;
          else if (e.tipo === "indice") pintarIndice(o);
        });
      }

      /** 8.2 Notas al pie: su número (en el orden del documento) y su texto. */
      let cacheNotas = null;
      function numerosNotas() {
        if (cacheNotas && cacheNotas.vis === visPintado) return cacheNotas.m;
        const m = new Map();
        let n = 0;
        for (const it of visPintado) if (it.e && it.e.tipo === "nota") m.set(it.id, ++n);
        cacheNotas = { vis: visPintado, m };
        return m;
      }
      const textoNota = (id) => { const it = sec().item(id), b = it && it.e && it.e.ref ? doc().bloque(it.e.ref) : null; return (b && b.texto) || ""; };
      /** Inserta un objeto en línea (nota, ecuación, cita, campo) donde está el cursor. */
      function insertarEnLinea(campos, meta) {
        if (ed.soloLectura) return null;
        const ref = NOM.DocCRDT.nuevoId();
        doc().cambiar(ref, Object.assign({ enTexto: true }, campos), { origen: "comando" });
        sincronizar();
        const s = leerSel();
        let id = null;
        comando(() => {
          if (!s.col) borrarRango(s.ini, s.fin);
          const fin = insertarEn(s.ini, [{ c: OBJ, obj: { tipo: campos.tipo, ref } }], null, meta);
          id = visPintado[s.ini] ? visPintado[s.ini].id : null;
          return { sel: [fin, fin] };
        });
        return { ref, id };
      }
      async function dialogoNota(id) {
        const selAntes = leerSel();
        const it = id ? sec().item(id) : null;
        const ref = it && it.e && it.e.ref;
        const actual = ref ? doc().valor(ref, "texto") || "" : "";
        const cuerpoH = html(`<form class="col"><div class="campo"><label>Texto de la nota${it ? ` ${numerosNotas().get(id) || ""}` : ""}</label><div class="entrada"><textarea data-t rows="4" maxlength="2000" placeholder="Por ejemplo: la fuente o una aclaración">${esc(actual)}</textarea></div></div></form>`);
        const pie = html(`<div style="display:contents">${it && !ed.soloLectura ? `<button class="btn" type="button" data-quitar>Quitar la nota</button>` : ""}<span class="crece"></span><button class="btn" type="button" data-no>Cancelar</button>${ed.soloLectura ? "" : `<button class="btn primario" data-si>Guardar</button>`}</div>`);
        const h = NOM.hoja({ titulo: "Nota al pie", icono: "superscript", cuerpo: cuerpoH, pie });
        $("[data-no]", pie).onclick = () => h.cerrar();
        const q = $("[data-quitar]", pie); if (q) q.onclick = () => { h.cerrar(); quitarObjeto(id); };
        const si = $("[data-si]", pie);
        if (si) si.onclick = (e) => {
          e.preventDefault();
          const t = $("[data-t]", cuerpoH).value.trim();
          h.cerrar();
          if (ref) doc().cambiar(ref, { texto: t });
          else if (t) { cuerpo.focus({ preventScroll: true }); ponerSel(selAntes.a, selAntes.f); insertarEnLinea({ tipo: "nota", texto: t }); }
          programarPaginar();
        };
      }
      function dialogoEcuacion(id) {
        if (!NOM.ecuaciones) return;
        const selAntes = leerSel();
        const it = id ? sec().item(id) : null, ref = it && it.e && it.e.ref, E = NOM.ecuaciones;
        const actual = ref ? doc().valor(ref, "tex") || "" : "", bloque = ref ? !!doc().valor(ref, "bloque") : false;
        const cuerpoH = html(`<form class="col">
          <div class="ecu-vista" data-vista></div>
          <div class="campo"><label>Ecuación</label><div class="entrada"><textarea data-tex rows="2" spellcheck="false" placeholder="x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}">${esc(actual)}</textarea></div></div>
          <div class="ecu-ayudas">${E.AYUDAS.map(([t, s, n]) => `<button type="button" data-ins="${esc(t)}" data-micro="${esc(n)}" aria-label="${esc(n)}">${esc(s)}</button>`).join("")}</div>
          <div class="fila" style="flex-wrap:wrap"><span class="suave chico">Ejemplos:</span>${E.EJEMPLOS.map(([n, t]) => `<button type="button" class="btn chico" data-ej="${esc(t)}">${esc(n)}</button>`).join("")}</div>
          <label class="interruptor"><input type="checkbox" data-bloque ${bloque ? "checked" : ""}> En su propio renglón, centrada</label></form>`);
        const pie = html(`<div style="display:contents">${it && !ed.soloLectura ? `<button class="btn" type="button" data-quitar>Quitar</button>` : ""}<span class="crece"></span><button class="btn" type="button" data-no>Cancelar</button>${ed.soloLectura ? "" : `<button class="btn primario" data-si>${it ? "Guardar" : "Insertar"}</button>`}</div>`);
        const h = NOM.hoja({ titulo: "Ecuación", icono: "sigma", cuerpo: cuerpoH, pie, ancha: true });
        const ta = $("[data-tex]", cuerpoH), vista = $("[data-vista]", cuerpoH);
        const ver = () => { vista.innerHTML = ta.value.trim() ? E.html(ta.value, true) : `<span class="suave">Escribe la ecuación o usa los botones</span>`; };
        ver();
        ta.addEventListener("input", ver);
        $$("[data-ins]", cuerpoH).forEach((b) => (b.onclick = () => {
          const t = b.dataset.ins, p = ta.selectionStart, q2 = ta.selectionEnd, elegido = ta.value.slice(p, q2);
          const ins = t.includes("□") ? t.replace("□", elegido || "□") : t;
          ta.value = ta.value.slice(0, p) + ins + ta.value.slice(q2);
          const hueco = ta.value.indexOf("□", p);
          if (hueco >= 0) { ta.setSelectionRange(hueco, hueco + 1); } else ta.setSelectionRange(p + ins.length, p + ins.length);
          ta.focus(); ver();
        }));
        $$("[data-ej]", cuerpoH).forEach((b) => (b.onclick = () => { ta.value = b.dataset.ej; ver(); }));
        $("[data-no]", pie).onclick = () => h.cerrar();
        const q = $("[data-quitar]", pie); if (q) q.onclick = () => { h.cerrar(); quitarObjeto(id); };
        const si = $("[data-si]", pie);
        if (si) si.onclick = (e) => {
          e.preventDefault();
          const tex = ta.value.replace(/□/g, "").trim(), bl = $("[data-bloque]", cuerpoH).checked || null;
          h.cerrar();
          if (!tex) return;
          if (ref) doc().cambiar(ref, { tex, bloque: bl });
          else { cuerpo.focus({ preventScroll: true }); ponerSel(selAntes.a, selAntes.f); insertarEnLinea({ tipo: "ecuacion", tex, bloque: bl }); }
        };
      }

      /** Número de figura de una imagen con pie (en el orden del documento). */
      function numeroFigura(id) {
        let n = 0;
        for (const it of sec().visibles()) {
          if (!it.e || it.e.tipo !== "imagen") continue;
          const b = it.e.ref ? doc().bloque(it.e.ref) : null;
          if (b && b.pie) n++;
          if (it.id === id) return Math.max(1, n);
        }
        return n || 1;
      }
      /** Recorte (fracciones iz, d, s, i) y giro (0, 90, 180, 270) de una imagen de ancho visible W. */
      function acomodarImagen(caja, W, rec, rot) {
        const img = $("img", caja);
        if (!img) return;
        const hacer = () => {
          const r = rec || {}, iz = +r.iz || 0, d = +r.d || 0, s = +r.s || 0, i = +r.i || 0;
          const fw = Math.max(0.05, 1 - iz - d), fh = Math.max(0.05, 1 - s - i);
          const ratio = (img.naturalHeight || 1) / (img.naturalWidth || 1);
          const wFull = W / fw, hFull = wFull * ratio, hVis = hFull * fh;
          const lado = rot === 90 || rot === 270;
          Object.assign(caja.style, { width: (lado ? hVis : W) + "px", height: (lado ? W : hVis) + "px" });
          let marco = $(".wd-img-marco", caja);
          if (!marco) { marco = document.createElement("span"); marco.className = "wd-img-marco"; caja.append(marco); marco.append(img); }
          Object.assign(marco.style, { width: W + "px", height: hVis + "px", transform: `translate(-50%, -50%) rotate(${rot}deg)` });
          Object.assign(img.style, { width: wFull + "px", maxWidth: "none", left: -iz * wFull + "px", top: -s * hFull + "px" });
          if (cuerpo.contains(caja)) programarPaginar();
        };
        if (img.complete && img.naturalWidth) hacer(); else img.addEventListener("load", hacer, { once: true });
      }
      function dialogoRecorte(id) {
        const it = sec().item(id), ref = it && it.e && it.e.ref, b = ref ? doc().bloque(ref) : null;
        if (!b) return;
        const r = Object.assign({ iz: 0, d: 0, s: 0, i: 0 }, b.recorte || {});
        const cuerpoH = html(`<form class="col"><div class="wd-recorte-vista"><span class="wd-img-caja"><img src="${esc(b.src)}" alt=""></span></div>
          ${[["s", "Arriba"], ["i", "Abajo"], ["iz", "Izquierda"], ["d", "Derecha"]].map(([k, t]) => `<div class="lz-desl"><span>${t}</span><input type="range" min="0" max="45" step="1" value="${Math.round(r[k] * 100)}" data-k="${k}"><output>${Math.round(r[k] * 100)}%</output></div>`).join("")}</form>`);
        const pie = html(`<div style="display:contents"><button class="btn" type="button" data-quitar>Sin recorte</button><span class="crece"></span><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si>Recortar</button></div>`);
        const h = NOM.hoja({ titulo: "Recortar imagen", icono: "image", cuerpo: cuerpoH, pie });
        const caja = $(".wd-img-caja", cuerpoH);
        const ver = () => { const img = $("img", cuerpoH); if (img) acomodarImagen(caja, 300, r, 0); };
        ver();
        $$("[data-k]", cuerpoH).forEach((x) => x.addEventListener("input", () => { r[x.dataset.k] = +x.value / 100; x.nextElementSibling.textContent = x.value + "%"; ver(); }));
        $("[data-no]", pie).onclick = () => h.cerrar();
        $("[data-quitar]", pie).onclick = () => { doc().cambiar(ref, { recorte: null }); h.cerrar(); };
        $("[data-si]", pie).onclick = (e) => { e.preventDefault(); doc().cambiar(ref, { recorte: r.iz || r.d || r.s || r.i ? r : null }); h.cerrar(); };
      }
      async function pieDeImagen(id) {
        const it = sec().item(id), ref = it && it.e && it.e.ref, b = ref ? doc().bloque(ref) : null;
        if (!b) return;
        const t = await NOM.pedirTexto("Pie de imagen", { etiqueta: `Se numera solo: “Figura ${numeroFigura(id)}. …”. Vacío para quitarlo.`, valor: b.pie || "", si: "Guardar", max: 300 });
        if (t == null) return;
        doc().cambiar(ref, { pie: t || null });
        $$(".wd-imagen[data-obj]", cuerpo).forEach((x) => llenarObjetos(x.parentNode));
      }
      async function textoAlternativo(id) {
        const it = sec().item(id), ref = it && it.e && it.e.ref, b = ref ? doc().bloque(ref) : null;
        if (!b) return;
        const t = await NOM.pedirTexto("Texto alternativo", { etiqueta: "Qué muestra la imagen (lo leen los lectores de pantalla)", valor: b.alt || "", si: "Guardar", max: 300 });
        if (t != null) doc().cambiar(ref, { alt: t || null });
      }
      function girarImagen(id) {
        const it = sec().item(id), ref = it && it.e && it.e.ref, b = ref ? doc().bloque(ref) : null;
        if (b) doc().cambiar(ref, { rot: ((+b.rot || 0) + 90) % 360 || null });
      }
      function ajusteTexto(id, modo) {
        const it = sec().item(id), ref = it && it.e && it.e.ref;
        if (!ref) return;
        if (modo === "libre") { ajusteImagen(id, true); return; }
        doc().cambiar(ref, { ajuste: modo === "linea" ? null : modo, libre: null, x: null, y: null }, { origen: "comando" });
        programarPaginar();
      }

      // ------------------------------------------------------------ posiciones (DOM ↔ índice visible)
      const idxEl = new WeakMap();
      function actualizarIndices() { for (let i = 0; i < cuerpo.children.length; i++) idxEl.set(cuerpo.children[i], i); }
      function indiceHijo(el) {
        const i = idxEl.get(el);
        if (i != null && cuerpo.children[i] === el) return i;
        return Array.prototype.indexOf.call(cuerpo.children, el);
      }
      /** Hojas de un párrafo en orden: texto, <br> y objetos. El último <br> no cuenta (solo da altura). */
      function hojas(el) {
        const r = [];
        (function rec(n) {
          for (let c = n.firstChild; c; c = c.nextSibling) {
            if (c.nodeType === 3) r.push(c);
            else if (c.nodeType === 1) {
              if (c.hasAttribute("data-obj") || c.tagName === "BR" || c.tagName === "IMG") r.push(c);
              else rec(c);
            }
          }
        })(el);
        if (r.length && r[r.length - 1].nodeType === 1 && r[r.length - 1].tagName === "BR") r.pop();
        return r;
      }
      const largoHoja = (h) => (h.nodeType === 3 ? cps(h.nodeValue).length : 1);
      function superior(n) {
        while (n && n.parentNode !== cuerpo) { if (n === cuerpo) return null; n = n.parentNode; }
        return n;
      }
      function posDe(node, off) {
        if (node === cuerpo) {
          const p = psPintado[Math.min(off, psPintado.length - 1)];
          return off >= psPintado.length ? visPintado.length : p ? p.ini : 0;
        }
        const objeto = node.nodeType === 1 ? node.closest && node.closest("[data-obj]") : node.parentElement && node.parentElement.closest("[data-obj]");
        const top = superior(node);
        if (!top) return null;
        const pi = indiceHijo(top), p = psPintado[pi];
        if (!p) return null;
        const hs = hojas(top);
        let n = 0;
        if (objeto && objeto !== node) { for (const h of hs) { if (h === objeto) return p.ini + n; n += largoHoja(h); } return p.ini + n; }
        // Punto límite → cuenta lo que hay antes.
        if (node.nodeType === 3) {
          for (const h of hs) { if (h === node) return p.ini + n + cps(node.nodeValue.slice(0, off)).length; n += largoHoja(h); }
          return p.ini + n;
        }
        const ref = node.childNodes[off] || null;
        const SIGUE = Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY;
        for (const h of hs) {
          if (ref && (h === ref || (ref.compareDocumentPosition(h) & SIGUE))) return p.ini + n;
          if (!ref && !node.contains(h) && (node.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING)) return p.ini + n;
          n += largoHoja(h);
        }
        return p.ini + Math.min(n, p.fin - p.ini);
      }
      function parrafoEn(i) {
        let lo = 0, hi = psPintado.length - 1;
        while (lo < hi) { const m = (lo + hi + 1) >> 1; if (psPintado[m].ini <= i) lo = m; else hi = m - 1; }
        return lo;
      }
      function puntoDom(i) {
        i = Math.max(0, Math.min(i, visPintado.length));
        const pi = parrafoEn(i), p = psPintado[pi], el = cuerpo.children[pi];
        if (!el) return { node: cuerpo, off: cuerpo.childNodes.length };
        let resto = i - p.ini;
        const hs = hojas(el);
        for (const h of hs) {
          const L = largoHoja(h);
          if (h.nodeType === 3 && resto <= L) return { node: h, off: cps(h.nodeValue).slice(0, resto).join("").length };
          if (h.nodeType === 1 && resto === 0) return { node: h.parentNode, off: Array.prototype.indexOf.call(h.parentNode.childNodes, h) };
          resto -= L;
        }
        const u = el.lastChild;
        if (u && u.nodeType === 1 && u.tagName === "BR") return { node: el, off: el.childNodes.length - 1 };
        return { node: el, off: el.childNodes.length };
      }
      function leerSel() {
        const s = getSelection();
        if (!s.rangeCount || !cuerpo.contains(s.anchorNode)) return ultimaSel;
        const a = posDe(s.anchorNode, s.anchorOffset), f = posDe(s.focusNode, s.focusOffset);
        if (a == null || f == null) return ultimaSel;
        ultimaSel = { a, f, ini: Math.min(a, f), fin: Math.max(a, f), col: a === f };
        return ultimaSel;
      }
      function ponerSel(a, f) {
        if (f == null) f = a;
        const pa = puntoDom(a), pf = puntoDom(f);
        const s = getSelection();
        try { s.setBaseAndExtent(pa.node, pa.off, pf.node, pf.off); } catch (e) { /* posición fuera de rango */ }
        ultimaSel = { a, f, ini: Math.min(a, f), fin: Math.max(a, f), col: a === f };
      }
      function rangoDom(a, f) {
        const pa = puntoDom(Math.min(a, f)), pf = puntoDom(Math.max(a, f));
        const r = document.createRange();
        try { r.setStart(pa.node, pa.off); r.setEnd(pf.node, pf.off); } catch (e) { return null; }
        return r;
      }
      /** El cursor como ids (para que no salte cuando otros escriben antes). */
      function anclarSel() {
        const s = getSelection();
        if (!s.rangeCount || !cuerpo.contains(s.anchorNode)) return null;
        const a = posDe(s.anchorNode, s.anchorOffset), f = posDe(s.focusNode, s.focusOffset);
        if (a == null || f == null) return null;
        const id = (i) => (i > 0 && visPintado[i - 1] ? visPintado[i - 1].id : null);
        return { a: id(a), f: id(f), ao: a, fo: f };
      }
      function posAncla(id) {
        if (id == null) return 0;
        const sq = sec(), p = sq.posicion(id);
        if (p >= 0) return p + 1;
        const it = sq.item(id);
        if (!it) return 0;
        let k = sq.indice(it);
        while (k >= 0 && !sq.items[k].v) k--;
        return k < 0 ? 0 : sq.posicion(sq.items[k].id) + 1;
      }

      // ------------------------------------------------------------ edición local → operaciones
      // Pasos de deshacer al escribir: uno por palabra (o hasta una pausa de 1.2 s); Enter,
      // pegar o mover el cursor a otro lugar empiezan un paso nuevo, como en Word.
      let pasoN = 0, finEdicion = -1;
      const grupoEscritura = () => "escribir-" + pasoN;
      function cortarPaso() { pasoN++; }
      /** Lo que se escribe solo lleva marca de sugerencia en el modo sugerencia (y siempre de quien escribe). */
      function normalizarSug(toks) {
        const yo = modoSug ? yoSug() : null;
        toks.forEach((t) => {
          if (t.c === "\n") return;
          if (!t.a || (!t.a.sug && !t.a.sugBorrar && !yo)) return;
          t.a = Object.assign({}, t.a);
          delete t.a.sugBorrar;
          if (yo) t.a.sug = yo; else delete t.a.sug;
        });
      }
      function insertarTokens(iz, toks, origen, grupo, meta) {
        normalizarSug(toks);
        let i = 0;
        while (i < toks.length) {
          const t = toks[i];
          if (t.c === OBJ) {
            const e = objetoDe(t);
            if (e) { const r = doc().seq(B, { k: "i", iz, x: OBJ, e, a: limpio(solo(t.a, CAR)) }, { origen, grupo, meta }); if (r) iz = S().clave(r.t, r.n); }
            i++; continue;
          }
          if (t.c === "\n") {
            const r = doc().seq(B, { k: "i", iz, x: "\n", a: limpio(solo(t.pa, PAR)) }, { origen, grupo, meta });
            if (r) iz = S().clave(r.t, r.n);
            i++; continue;
          }
          const k = claveA(solo(t.a, CAR));
          let j = i, x = "";
          while (j < toks.length && toks[j].c !== OBJ && toks[j].c !== "\n" && claveA(solo(toks[j].a, CAR)) === k) { x += toks[j].c; j++; }
          const r = doc().seq(B, { k: "i", iz, x, a: limpio(solo(t.a, CAR)) }, { origen, grupo, meta });
          if (r) iz = S().clave(r.t + cps(x).length - 1, r.n);
          i = j;
        }
        return iz;
      }
      /** Objeto de un token: uno existente que se movió (se copia), una imagen pegada o uno nuevo. */
      function objetoDe(t) {
        if (t.obj) return t.obj;
        if (t.id) { const it = sec().item(t.id); return it && it.e ? Object.assign({}, it.e) : null; }
        if (t.img) {
          const ref = NOM.DocCRDT.nuevoId();
          doc().cambiar(ref, { tipo: "imagen", enTexto: true, src: t.img, w: Math.min(t.w || 320, 624), h: t.h || 0 }, { origen: "comando" });
          return { tipo: "imagen", ref };
        }
        return null;
      }
      function difAttrs(it, nuevos, ks) {
        const viejos = S().attrs(it);
        let r = null;
        ks.forEach((k) => {
          const a = viejos[k] == null || viejos[k] === false ? null : viejos[k];
          const b = !nuevos || nuevos[k] == null || nuevos[k] === false || nuevos[k] === "" ? null : nuevos[k];
          if (a !== b && JSON.stringify(a) !== JSON.stringify(b)) (r || (r = {}))[k] = b;
        });
        return r;
      }
      /** Compara lo que había (items) con lo que hay (tokens) y manda solo la diferencia. */
      function aplicarDiferencia(viejos, nuevos, base, origen) {
        const idV = (it) => (it.e ? OBJ + it.id : it.id === FIN ? "\n" : it.c);
        const idN = (t) => (t.c === OBJ ? OBJ + (t.id || "?") : t.c);
        const lv = viejos.length, ln = nuevos.length;
        let p = 0, s = 0;
        // Lo escrito suelto tras el último párrafo va antes de la marca final, nunca después.
        const tope = lv && viejos[lv - 1].id === FIN ? lv - 1 : lv;
        while (p < tope && p < ln && idV(viejos[p]) === idN(nuevos[p])) p++;
        while (s < lv - p && s < ln - p && idV(viejos[lv - 1 - s]) === idN(nuevos[ln - 1 - s])) s++;
        const formatos = [];
        const comparar = (it, tk) => {
          const esMarca = it.id === FIN || (it.c === "\n" && !it.e);
          const d = esMarca ? difAttrs(it, tk.pa, PAR) : difAttrs(it, tk.a, CAR);
          if (d) formatos.push({ it, d });
        };
        for (let i = 0; i < p; i++) comparar(viejos[i], nuevos[i]);
        for (let i = 0; i < s; i++) comparar(viejos[lv - 1 - i], nuevos[ln - 1 - i]);
        const borrar = viejos.slice(p, lv - s), meter = nuevos.slice(p, ln - s);
        if (!borrar.length && !meter.length && !formatos.length) return false;
        const iz = base + p > 0 ? visPintado[base + p - 1].id : null;
        if (!meter.length && borrar.length && base + p + borrar.length !== finEdicion && base + p !== finEdicion) cortarPaso();
        const grupo = grupoEscritura();
        if (borrar.length) {
          if (modoSug) borrarSugerido(borrar, grupo, origen);
          else doc().seq(B, { k: "v", v: false, r: S().rangos(borrar) }, { origen, grupo });
        }
        if (meter.length && base + p !== finEdicion) cortarPaso();
        if (meter.length && /\s/.test(meter[meter.length - 1].c || "") && !/\s/.test((visPintado[base + p - 1] || {}).c || " ")) cortarPaso();
        finEdicion = base + p + meter.length;
        if (meter.length) {
          if (pendiente && !borrar.length && base + p === pendiente.pos) {
            meter.forEach((t) => { if (t.c !== "\n") t.a = Object.assign({}, t.a, pendiente.a); });
            pendiente.pos += meter.length;
            pendiente.usado = true;
          }
          // 3.1: el teclado del celular pegó (insertFromPaste sin evento "paste"): cuenta como pegado.
          let meta = null;
          if (pegadoNativo && Date.now() < pegadoNativo.hasta) { meta = { o: "p", g: pegadoNativo.g, gn: pegadoNativo.gn || meter.length }; pegadoNativo = null; }
          insertarTokens(iz, meter, origen, grupo, meta);
        }
        // Formato: los caracteres seguidos con el mismo cambio van en una sola operación.
        let g = null;
        const grupos = [];
        formatos.forEach((f) => { const k = JSON.stringify(f.d); if (g && g.k === k) g.its.push(f.it); else { g = { k, d: f.d, its: [f.it] }; grupos.push(g); } });
        grupos.forEach((x) => doc().seq(B, { k: "f", a: x.d, r: S().rangos(x.its) }, { origen, grupo }));
        return true;
      }

      function sincronizar(e) {
        if (pintando || ed.soloLectura) { tomarRegistros(); return; }
        const recs = tomarRegistros().filter((r) => !(r.target.nodeType === 1 ? r.target : r.target.parentElement || cuerpo).closest("[data-obj]") || r.target === cuerpo);
        if (!recs.length) return;
        const compo = componiendo || (e && e.isComposing);
        let estructura = false;
        const tocados = new Set();
        for (const r of recs) {
          if (r.target === cuerpo) { estructura = true; break; }
          const t = superior(r.target);
          if (!t) { estructura = true; break; }
          tocados.add(t);
        }
        let hecho = false;
        if (!estructura && tocados.size === 1) hecho = sincronizarParrafo([...tocados][0], compo);
        if (!hecho) sincronizarTodo(compo);
        programarPaginar();
        programarReflejo();
        if (e) seguirAlCursor();
      }
      function sincronizarParrafo(el, compo) {
        const pi = indiceHijo(el), p = psPintado[pi];
        if (!p || elems.get(p.k) !== el) return false;
        const tk = tokens(el, { parrafo: true });
        if (tk.filter((t) => t.c === "\n").length !== 1) return false;
        const marca = tk.pop();
        const cambio = aplicarDiferencia(visPintado.slice(p.ini, p.fin), tk, p.ini, "teclado");
        const d = difAttrs(p.mark, marca.pa, PAR);
        if (d) doc().seq(B, { k: "f", a: d, r: S().rangos([p.mark]) }, { origen: "teclado" });
        if (!cambio && !d) return true;
        actualizarPintado();
        if (d) { reconciliar(); return true; }
        if (!compo) canonizar(el, psPintado[pi]);
        else { cache.delete(p.k); necesitaPintar = true; }
        atajosMarkdown(psPintado[pi]);
        return true;
      }
      /** Cambios que tocaron varios párrafos (pegar del navegador, borrar una selección grande,
          arrastrar…): se lee la hoja completa. El cursor se ubica con marcas temporales. */
      function sincronizarTodo(compo) {
        const marcas = compo ? [] : ponerMarcas();
        let tk = tokens(cuerpo, { pre: true });
        const pos = [];
        tk = tk.filter((t, i) => { if (t.c === MARCA) { pos.push(i - pos.length); return false; } return true; });
        marcas.forEach((m) => m.remove());
        if (!tk.length || tk[tk.length - 1].c !== "\n") tk.push({ c: "\n", pa: {} });
        aplicarDiferencia(visPintado.concat([sec().fin]), tk, 0, "teclado");
        if (compo) { actualizarPintado(); necesitaPintar = true; return; }
        elems.clear(); cache.clear();
        reconciliar();
        if (pos.length) ponerSel(pos[0], pos[pos.length - 1]); else if (document.activeElement === cuerpo) ponerSel(0);
      }
      const MARCA = "\uE000";
      function ponerMarcas() {
        const s = getSelection();
        if (!s.rangeCount || !cuerpo.contains(s.anchorNode)) return [];
        const r = s.getRangeAt(0), m = [];
        const poner = (nodo, off) => {
          const t = document.createTextNode(MARCA);
          if (nodo.nodeType === 3) {
            const resto = nodo.splitText(off);
            resto.parentNode.insertBefore(t, resto);
          } else nodo.insertBefore(t, nodo.childNodes[off] || null);
          m.push(t);
        };
        // Primero el final (para que insertar no mueva el inicio).
        if (!r.collapsed) poner(r.endContainer, r.endOffset);
        poner(r.startContainer, r.startOffset);
        return m;
      }
      /** 8.2 Corte de página dentro de un párrafo: cuántas letras hay antes y cómo se vuelve a poner. */
      function offsetEnParrafo(el, nodo) {
        let n = 0;
        for (const h of hojas(el)) if (nodo.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_PRECEDING) n += largoHoja(h);
        return n;
      }
      function crearCorte(alto) {
        const c = document.createElement("span");
        c.className = "wd-corte";
        c.contentEditable = "false";
        c.setAttribute("aria-hidden", "true");
        c.style.height = alto;
        return c;
      }
      function ponerCorte(t, off, alto) {
        let resto = off;
        for (const h of hojas(t)) {
          const L = largoHoja(h);
          if (h.nodeType === 3 && resto < L) {
            const i16 = cps(h.nodeValue).slice(0, resto).join("").length;
            const dos = i16 > 0 ? h.splitText(i16) : h;
            dos.parentNode.insertBefore(crearCorte(alto), dos);
            return;
          }
          if (h.nodeType === 1 && resto === 0) { h.parentNode.insertBefore(crearCorte(alto), h); return; }
          resto -= L;
        }
      }
      function canonizar(el, p) {
        const h = htmlParrafo(visPintado, p);
        cache.set(p.k, h);
        const cortes = $$(".wd-corte", el).map((c) => ({ off: offsetEnParrafo(el, c), alto: c.style.height }));
        el.normalize();
        const t = crearEl(h);
        cortes.forEach((c) => ponerCorte(t, c.off, c.alto));
        if (iguales(el, t) || (el.tagName === t.tagName && mismosHijos(el, t) && el.getAttribute("data-k") === p.k)) { tomarRegistros(); return; }
        const sel = leerSel();
        pintando = true;
        if (el.dataset.empuje) { t.style.marginTop = el.style.marginTop; t.dataset.empuje = el.dataset.empuje; }
        el.replaceWith(t);
        elems.set(p.k, t);
        llenarObjetos(t);
        idxEl.set(t, indiceHijo(t));
        tomarRegistros();
        pintando = false;
        if (document.activeElement === cuerpo || cuerpo.contains(document.activeElement)) ponerSel(sel.a, sel.f);
      }

      /** Hace cambios desde un comando y repinta una sola vez. */
      function comando(fn) {
        if (ed.soloLectura) return;
        sincronizar();
        const r = fn();
        reconciliar();
        if (r && r.sel) { cuerpo.focus({ preventScroll: true }); ponerSel(r.sel[0], r.sel[1]); }
        programarReflejo();
        enviarCursor();
        return r;
      }
      function borrarRango(ini, fin, grupo) {
        if (fin <= ini) return;
        doc().seq(B, { k: "v", v: false, r: S().rangos(visPintado.slice(ini, fin)) }, { origen: "comando", grupo });
        actualizarPintado();
      }
      function insertarEn(i, toks, grupo, meta) {
        const iz = i > 0 ? visPintado[i - 1].id : null;
        insertarTokens(iz, toks, "comando", grupo, meta);
        actualizarPintado();
        return i + toks.length;
      }
      /** Texto plano a tokens. pa: formato de los párrafos nuevos (el del párrafo donde se pega,
          como "Mantener solo texto" de Word; sin él, la primera parte perdía su título o su lista). */
      const textoTokens = (t, a, pa) => cps(t).map((c) => (c === "\n" ? { c: "\n", pa: Object.assign({}, pa, { hecho: null }) } : { c, a: a || {} }));

      // ------------------------------------------------------------ atributos en la selección
      function parrafosDeSel(s) {
        s = s || leerSel();
        const a = parrafoEn(s.ini), b = parrafoEn(Math.max(s.ini, s.fin - (s.fin > s.ini && visPintado[s.fin - 1] && visPintado[s.fin - 1].c === "\n" ? 1 : 0)));
        return psPintado.slice(a, b + 1);
      }
      function attrsEnCursor() {
        const s = leerSel();
        const p = psPintado[parrafoEn(s.ini)];
        let it = null;
        if (s.col) it = s.ini > p.ini ? visPintado[s.ini - 1] : visPintado[s.ini] && s.ini < p.fin ? visPintado[s.ini] : null;
        let a = it ? Object.assign({}, solo(S().attrs(it), CAR)) : {};
        if (!s.col) {
          const its = visPintado.slice(s.ini, s.fin).filter((x) => x.c !== "\n");
          if (its.length) {
            a = Object.assign({}, solo(S().attrs(its[0]), CAR));
            for (const x of its) { const b = S().attrs(x); for (const k in a) if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) delete a[k]; }
          }
        }
        if (pendiente && s.col && pendiente.pos === s.ini) { for (const k in pendiente.a) { if (pendiente.a[k] == null) delete a[k]; else a[k] = pendiente.a[k]; } }
        return { a, pa: p ? S().attrs(p.mark) : {}, sel: s };
      }

      /** Formato de letra sobre la selección (o para lo próximo que se escriba). */
      function formato(cambios) {
        if (ed.soloLectura) return;
        sincronizar();
        const s = leerSel();
        const w = s.col ? palabraEn(s.ini) : null;
        if (w) {
          // Cursor dentro de una palabra: el formato va a toda la palabra (como en Word).
          comando(() => {
            doc().seq(B, { k: "f", a: cambios, r: S().rangos(visPintado.slice(w[0], w[1])) }, { origen: "comando" });
            return { sel: [s.a, s.f] };
          });
          return;
        }
        if (s.col) {
          pendiente = { pos: s.ini, a: Object.assign({}, pendiente && pendiente.pos === s.ini ? pendiente.a : {}, cambios) };
          cuerpo.focus({ preventScroll: true });
          ponerSel(s.a, s.f);
          reflejar();
          return;
        }
        comando(() => {
          const its = visPintado.slice(s.ini, s.fin).filter((x) => x.c !== "\n" || x.e);
          if (its.length) doc().seq(B, { k: "f", a: cambios, r: S().rangos(its) }, { origen: "comando" });
          return { sel: [s.a, s.f] };
        });
      }
      /** [ini, fin] de la palabra que rodea a la posición i, si el cursor está DENTRO de ella. */
      const LETRA = /[\p{L}\p{N}_'’-]/u;
      function palabraEn(i) {
        const p = psPintado[parrafoEn(i)];
        const es = (k) => k >= p.ini && k < p.fin && !visPintado[k].e && LETRA.test(visPintado[k].c);
        if (!p || !es(i - 1) || !es(i)) return null;
        let a = i, b = i;
        while (es(a - 1)) a--;
        while (es(b)) b++;
        return [a, b];
      }
      function alternar(k) {
        const { a } = attrsEnCursor();
        formato({ [k]: a[k] ? null : true });
      }
      function formatoParrafo(cambios, ps) {
        if (ed.soloLectura) return;
        const s = leerSel();
        comando(() => {
          ps = ps || parrafosDeSel(s);
          const fn = typeof cambios === "function";
          const grupos = new Map();
          ps.forEach((p) => {
            const c = fn ? cambios(S().attrs(p.mark), p) : cambios;
            if (!c) return;
            const k = JSON.stringify(c);
            (grupos.get(k) || grupos.set(k, { c, its: [] }).get(k)).its.push(p.mark);
          });
          grupos.forEach((g) => doc().seq(B, { k: "f", a: g.c, r: S().rangos(g.its) }, { origen: "comando" }));
          return { sel: [s.a, s.f] };
        });
      }
      function alternarLista(tipo) {
        const ps = parrafosDeSel();
        const todos = ps.every((p) => S().attrs(p.mark).lista === tipo);
        formatoParrafo(todos ? { lista: null, nivel: null, hecho: null } : { lista: tipo, hecho: null }, ps);
      }
      function sangria(delta) {
        formatoParrafo((pa) => (pa.lista
          ? { nivel: Math.max(0, Math.min(8, (pa.nivel || 0) + delta)) || null }
          : { sangria: Math.max(0, Math.min(10, (pa.sangria || 0) + delta)) || null }));
      }
      function borrarFormato() {
        formato({ b: null, i: null, u: null, s: null, va: null, color: null, fondo: null, fuente: null, tam: null });
        formatoParrafo({ estilo: null, alin: null, interlineado: null, antes: null, despues: null, sangria: null });
      }
      function cambiarTam(delta) {
        const t = attrsEnCursor().a.tam || baseTam();
        let n;
        if (delta > 0) n = TAMANOS.find((x) => x > t) || Math.min(400, t + 10);
        else n = [...TAMANOS].reverse().find((x) => x < t) || Math.max(1, t - 1);
        formato({ tam: n });
      }


      // ------------------------------------------------------------ 3.1 lo que se pega
      let pegadoNativo = null;
      const letrasDe = (toks) => toks.filter((t) => t.c !== "\n").length;
      const metaPegado = (toks) => {
        toks.forEach((t) => { if (t.pa && t.pa.dueno) { t.pa = Object.assign({}, t.pa); delete t.pa.dueno; } });
        return { o: "p", g: NOM.idCorto() + Date.now().toString(36), gn: letrasDe(toks) };
      };
      /** 1.1 Pegar un enlace sobre texto seleccionado lo convierte en vínculo (un solo paso de deshacer). */
      function enlazarSeleccion(s, texto) {
        const url = String(texto || "").trim();
        if (s.col || !URL_SOLA.test(url)) return false;
        const its = visPintado.slice(s.ini, s.fin);
        if (!its.length || its.some((x) => x.c === "\n" || x.e)) return false;
        cortarPaso();
        comando(() => { doc().seq(B, { k: "f", a: { enlace: url }, r: S().rangos(its) }, { origen: "comando", grupo: "enlace-" + pasoN }); return { sel: [s.a, s.f] }; });
        cortarPaso();
        aviso("Enlace aplicado al texto elegido", { tipo: "ok", ms: 1600 });
        return true;
      }

      // ------------------------------------------------------------ 7 modo sugerencia
      const sugDe = (it) => S().attrs(it).sug;
      const tachado = (it) => !!S().attrs(it).sugBorrar;
      /** En modo sugerencia, "borrar" marca para borrar (lo mío propuesto sí se quita de verdad). */
      function borrarSugerido(items, grupo, origen) {
        const yo = yoSug();
        const propios = items.filter((it) => !it.e && it.c !== "\n" && sugDe(it) && sugDe(it).u === yo.u);
        const marcar = items.filter((it) => it.c !== "\n" && !tachado(it) && !propios.includes(it));
        if (propios.length) doc().seq(B, { k: "v", v: false, r: S().rangos(propios) }, { origen, grupo });
        if (marcar.length) doc().seq(B, { k: "f", a: { sugBorrar: yo }, r: S().rangos(marcar) }, { origen, grupo });
        if (items.some((it) => it.c === "\n")) aviso("En modo sugerencia no se unen párrafos", { tipo: "info", ms: 2200 });
        necesitaPintar = true;
      }
      /** Borrar con la tecla en modo sugerencia: se salta lo ya tachado y el cursor queda donde corresponde. */
      function borrarConTecla(tipo) {
        sincronizar();
        const s = leerSel();
        let a = s.ini, f = s.fin;
        if (s.col) {
          const atras = /Backward/.test(tipo);
          if (/Word|Line/.test(tipo)) {
            const sel = getSelection();
            try { sel.modify("extend", atras ? "backward" : "forward", /Line/.test(tipo) ? "lineboundary" : "word"); } catch (e) { /* sin modify */ }
            const r = leerSel(); a = r.ini; f = r.fin;
          } else if (atras) { let k = s.ini - 1; while (k >= 0 && tachado(visPintado[k])) k--; if (k < 0) return; a = k; f = k + 1; }
          else { let k = s.ini; while (k < visPintado.length && tachado(visPintado[k])) k++; if (k >= visPintado.length) return; a = k; f = k + 1; }
          if (a === f) return;
          const r = comando(() => { borrarSugerido(visPintado.slice(a, f), "sug-" + pasoN, "comando"); const p = atras ? a : f; return { sel: [p, p] }; });
          void r;
          return;
        }
        comando(() => { borrarSugerido(visPintado.slice(a, f), "sug-" + pasoN, "comando"); return { sel: [f, f] }; });
      }
      function alternarSugerencias(si) {
        modoSug = si == null ? !modoSug : !!si;
        raiz.classList.toggle("sugiriendo", modoSug);
        aviso(modoSug ? "Modo sugerencia: lo que escribas o borres queda propuesto; el equipo lo acepta o lo rechaza en Comentarios." : "Modo sugerencia apagado", { tipo: "info", ms: 3200 });
        reflejar();
      }
      /** Sugerencias pendientes, en orden: tramos seguidos del mismo autor y tipo. */
      function sugerencias() {
        const r = [];
        let g = null;
        visPintado.forEach((it, i) => {
          const a = S().attrs(it), k = a.sug ? "insertar" : a.sugBorrar ? "borrar" : null;
          const autor = a.sug || a.sugBorrar;
          if (!k) { g = null; return; }
          if (g && g.tipo === k && g.autor.u === autor.u && g.fin === i) { g.its.push(it); g.fin = i + 1; g.texto += it.e ? "▪" : it.c; return; }
          g = { tipo: k, autor, its: [it], ini: i, fin: i + 1, texto: it.e ? "▪" : it.c };
          r.push(g);
        });
        return r;
      }
      function resolverSugerencia(g, aceptar) {
        if (ed.soloLectura) return;
        comando(() => {
          const ids = g.its.filter((it) => sec().item(it.id) && sec().item(it.id).v);
          if (!ids.length) return null;
          const quitar = (g.tipo === "insertar") !== aceptar;   // aceptar un borrado o rechazar una inserción
          if (quitar) doc().seq(B, { k: "v", v: false, r: S().rangos(ids) }, { origen: "comando" });
          else doc().seq(B, { k: "f", a: g.tipo === "insertar" ? { sug: null } : { sugBorrar: null }, r: S().rangos(ids) }, { origen: "comando" });
          return null;
        });
      }

      // ------------------------------------------------------------ 3.5 párrafos con dueño
      let nombresPedidos = false;
      function revisarNombres() {
        if (nombresPedidos || !ed.cargarMiembros) return;
        if (!psPintado.some((p) => S().attrs(p.mark).dueno)) return;
        nombresPedidos = true;
        ed.cargarMiembros().then((ms) => {
          ms.forEach((m) => { ctx.nombres.set(m.id, m.nombre); ctx.colores.set(m.id, m.color); });
          const s = leerSel(); cache.clear(); reconciliar(); if (document.activeElement === cuerpo) ponerSel(s.a, s.f);
        });
      }
      async function asignarParrafos(ps) {
        ps = ps || parrafosDeSel();
        const actual = S().attrs(ps[0].mark).dueno || null;
        const uid = await ed.elegirPersona(ps.length > 1 ? `Asignar ${ps.length} párrafos a…` : "Asignar el párrafo a…", actual);
        if (uid == null) return;
        if (uid) { const m = ed.miembros.find((x) => x.id === uid); if (m) { ctx.nombres.set(uid, m.nombre); ctx.colores.set(uid, m.color); } }
        formatoParrafo({ dueno: uid || null }, ps);
        cache.clear(); reconciliar();
        aviso(uid ? `Asignado a ${ed.nombreDe(uid)}: solo esa persona (y tú) lo cambian` : "Ya nadie es dueño de ese párrafo", { tipo: "ok" });
      }
      /** ¿Algo de la selección cae en el párrafo de otra persona? Devuelve su nombre. */
      function ajenoEnSeleccion(s) {
        if (ctx.propietario) return null;
        for (const p of parrafosDeSel(s)) { const d = S().attrs(p.mark).dueno; if (d && d !== ctx.yo) return ctx.nombres.get(d) || "otra persona"; }
        return null;
      }

      // ------------------------------------------------------------ 3.4 lo que cambió desde la última visita
      let resaltado = null;
      function aplicarResaltado() {
        $$(".wd-cambiado", cuerpo).forEach((el) => el.classList.remove("wd-cambiado"));
        if (resaltar) resaltar.delete("wd-cambio");
        if (!resaltado) return;
        const R = +((resaltado.visita || {}).reloj || 0), nodos = new Set((resaltado.cambios || {}).clientes || []);
        const nuevos = [];
        visPintado.forEach((it, i) => { if (it.t > R && nodos.has(it.n)) nuevos.push(i); });
        const tocados = new Set(nuevos.map((i) => parrafoEn(i)));
        // Formato o borrados de otros: se marca el párrafo (la barra de la izquierda).
        const reg = doc().estado.seq[B];
        if (reg) [...reg.vis, ...reg.fmt].forEach((o) => {
          if (o.t <= R || !nodos.has(o.n)) return;
          (o.r || []).slice(0, 50).forEach(([n, t1]) => { const it = sec().item(n === FIN ? FIN : S().clave(t1, n)); if (!it) return; let k = sec().indice(it); while (k < sec().items.length && !(sec().items[k].v)) k++; const p = k < sec().items.length ? sec().posicion(sec().items[k].id) : visPintado.length; if (p >= 0) tocados.add(parrafoEn(p)); });
        });
        tocados.forEach((pi) => { const el = cuerpo.children[pi]; if (el) el.classList.add("wd-cambiado"); });
        if (resaltar && nuevos.length) {
          const rs = [];
          let a = nuevos[0], b = a;
          const cierra = () => { const r = rangoDom(a, b + 1); if (r) rs.push(r); };
          for (let k = 1; k < nuevos.length && rs.length < 400; k++) { if (nuevos[k] === b + 1) b = nuevos[k]; else { cierra(); a = b = nuevos[k]; } }
          cierra();
          resaltar.set("wd-cambio", new Highlight(...rs));
        }
      }
      this.resaltarCambios = (c) => { resaltado = c; aplicarResaltado(); };

      // ------------------------------------------------------------ 7 comentarios: ancla en el texto
      let marcasComentario = [];
      function pintarComentarios() {
        if (!resaltar) return;
        const rs = [];
        marcasComentario.forEach((c) => {
          const a = c.ancla && c.ancla.a ? sec().posicion(c.ancla.a) : -1, f = c.ancla && c.ancla.f ? sec().posicion(c.ancla.f) : -1;
          if (a < 0 || f < 0) return;
          const r = rangoDom(Math.min(a, f), Math.max(a, f) + 1);
          if (r) rs.push(r);
        });
        if (rs.length) resaltar.set("wd-comentario", new Highlight(...rs)); else resaltar.delete("wd-comentario");
      }
      this.comentarios = {
        /** Ancla para un comentario nuevo: la selección (o la palabra donde está el cursor). */
        ancla() {
          let s = leerSel();
          if (s.col) { const w = palabraEn(s.ini); if (w) s = { ini: w[0], fin: w[1], col: false }; }
          if (s.col || s.fin <= s.ini) return null;
          const its = visPintado.slice(s.ini, s.fin);
          return { tipo: "texto", a: its[0].id, f: its[its.length - 1].id, cita: its.map((x) => (x.e ? "" : x.c)).join("").slice(0, 120) };
        },
        irA(ancla) {
          const a = ancla && ancla.a ? sec().posicion(ancla.a) : -1, f = ancla && ancla.f ? sec().posicion(ancla.f) : -1;
          if (a < 0) return false;
          cuerpo.focus({ preventScroll: true });
          ponerSel(a, Math.max(a, f) + 1);
          seguirAlCursor();
          return true;
        },
        pintar(lista) { marcasComentario = (lista || []).filter((c) => !c.resuelto && c.ancla && c.ancla.tipo === "texto"); pintarComentarios(); },
        /** Comentario bajo un punto del texto (para abrirlo al tocarlo). */
        bajo(i) { return marcasComentario.find((c) => { const a = sec().posicion(c.ancla.a), f = sec().posicion(c.ancla.f); return a >= 0 && i >= Math.min(a, f) && i <= Math.max(a, f); }) || null; },
      };
      this.sugerencias = { lista: sugerencias, resolver: resolverSugerencia, activo: () => modoSug, alternar: alternarSugerencias };

      // ------------------------------------------------------------ Fase 9: lo que usan las citas, las fichas y "Armar reporte"
      /** Tokens de un párrafo: { tramos: [{ x, a } | { e }], a: atributos del párrafo }. */
      const tokensDe = (tramos, base) => {
        const t = [];
        (tramos || []).forEach((tr) => {
          if (tr.e) { t.push({ c: OBJ, obj: tr.e }); return; }
          cps(tr.x || "").forEach((c) => t.push(c === "\n" ? { c: "\n", pa: {} } : { c, a: Object.assign({}, base || {}, tr.a || {}) }));
        });
        return t;
      };
      /** Inserta párrafos completos en la posición i (al inicio de un párrafo o partiéndolo). Cada
          párrafo lleva su propia marca de la bitácora (meta): { o: "c" } citado, { o: "r" } armado por la app. */
      function insertarParrafosEn(i, ps, grupo) {
        let pos = i;
        const pi = parrafoEn(pos), p = psPintado[pi], paActual = S().attrs(p.mark);
        // A media línea: el párrafo se parte y la primera parte se queda con su formato.
        if (pos > p.ini) pos = insertarEn(pos, [{ c: "\n", pa: Object.assign({}, paActual) }], grupo);
        ps.forEach((x) => { pos = insertarEn(pos, tokensDe(x.tramos).concat([{ c: "\n", pa: Object.assign({}, x.a || {}) }]), grupo, x.meta); });
        return pos;
      }
      this.textoApi = {
        /** Inserta texto con formato donde quedó el cursor (reemplaza lo elegido). */
        insertarTramos(tramos, meta) {
          if (ed.soloLectura) return false;
          sincronizar();
          const s = leerSel() || { ini: visPintado.length, fin: visPintado.length, col: true }, cur = attrsEnCursor();
          comando(() => {
            if (!s.col) borrarRango(s.ini, s.fin, grupoEscritura());
            const toks = [];
            (tramos || []).forEach((tr) => cps(tr.x || "").forEach((c) => toks.push(c === "\n" ? { c: "\n", pa: Object.assign({}, cur.pa, { hecho: null }) } : { c, a: Object.assign({}, cur.a, tr.a || {}) })));
            const fin = insertarEn(s.ini, toks, grupoEscritura(), meta);
            finEdicion = fin;
            return { sel: [fin, fin] };
          });
          seguirAlCursor();
          return true;
        },
        /** Párrafos donde está el cursor, o al final del documento (opc.alFinal). */
        insertarParrafos(ps, opc) {
          if (ed.soloLectura || !ps || !ps.length) return false;
          opc = opc || {};
          sincronizar();
          const s = leerSel();
          comando(() => {
            const grupo = "parrafos-" + Date.now();
            let i;
            if (opc.alFinal || !s) {
              // Al final: si el último párrafo tiene algo, primero se cierra con su propio formato.
              const u = psPintado[psPintado.length - 1];
              i = visPintado.length;
              if (u.fin > u.ini) i = insertarEn(i, [{ c: "\n", pa: Object.assign({}, S().attrs(u.mark)) }], grupo);
            } else { if (!s.col) borrarRango(s.ini, s.fin, grupo); i = s.ini; }
            const fin = insertarParrafosEn(i, ps, grupo);
            return { sel: [fin, fin] };
          });
          seguirAlCursor();
          return true;
        },
        /** Cambia lo que hay debajo de un título (hasta el siguiente título del mismo nivel o mayor);
            si no existe, lo agrega al final con ese título. Sirve para "Referencias". */
        reemplazarSeccion(titulo, ps, opc) {
          if (ed.soloLectura) return false;
          opc = opc || {};
          sincronizar();
          const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
          const nombres = (Array.isArray(titulo) ? titulo : [titulo]).map(norm);
          const nivel = (pa) => ({ titulo: 0, h1: 1, h2: 2, h3: 3 }[pa.estilo] ?? 9);
          const texto = (p) => visPintado.slice(p.ini, p.fin).map((x) => (x.e ? "" : x.c)).join("");
          let h = -1;
          for (let k = psPintado.length - 1; k >= 0; k--) { const pa = S().attrs(psPintado[k].mark); if (nivel(pa) < 9 && nombres.includes(norm(texto(psPintado[k])))) { h = k; break; } }
          if (h < 0) return this.insertarParrafos([{ tramos: [{ x: Array.isArray(titulo) ? titulo[0] : titulo }], a: opc.encabezado || { estilo: "h1" }, meta: { o: "r" } }].concat(ps), { alFinal: true });
          const nv = nivel(S().attrs(psPintado[h].mark));
          let fin = psPintado.length;
          for (let k = h + 1; k < psPintado.length; k++) if (nivel(S().attrs(psPintado[k].mark)) <= nv) { fin = k; break; }
          comando(() => {
            const grupo = "seccion-" + Date.now();
            const ini = psPintado[h].fin + 1;
            if (fin < psPintado.length) {
              borrarRango(ini, psPintado[fin].ini, grupo);
              const pos = insertarParrafosEn(ini, ps, grupo);
              return { sel: [pos, pos] };
            }
            // La sección llega hasta el final: se borra y se escribe de nuevo después del título.
            if (ini <= visPintado.length) borrarRango(Math.min(ini, visPintado.length), visPintado.length, grupo);
            let pos = psPintado[h].fin;
            const u = psPintado[psPintado.length - 1];
            if (h === psPintado.length - 1) pos = insertarEn(u.fin, [{ c: "\n", pa: Object.assign({}, S().attrs(u.mark)) }], grupo);
            else pos = Math.min(ini, visPintado.length);
            pos = insertarParrafosEn(pos, ps, grupo);
            return { sel: [pos, pos] };
          });
          return true;
        },
        /** El texto del párrafo donde está el cursor (para proponer el tema de una ficha). */
        enCursor: () => { const s = leerSel(); return s ? { ini: s.ini, fin: s.fin } : null; },
      };

      // ------------------------------------------------------------ Enter, saltos y objetos
      function enter() {
        sincronizar();
        const s = leerSel();
        comando(() => {
          if (!s.col) borrarRango(s.ini, s.fin, "enter-" + pasoN);
          const pi = parrafoEn(s.ini), p = psPintado[pi], pa = S().attrs(p.mark);
          // Enter en un elemento vacío de lista termina la lista (como en Word).
          if (pa.lista && p.fin === p.ini) {
            if (pa.nivel) doc().seq(B, { k: "f", a: { nivel: pa.nivel - 1 || null }, r: S().rangos([p.mark]) }, { origen: "comando" });
            else doc().seq(B, { k: "f", a: { lista: null, nivel: null, hecho: null }, r: S().rangos([p.mark]) }, { origen: "comando" });
            return { sel: [s.ini, s.ini] };
          }
          const alFinal = s.ini === p.fin;
          cortarPaso();
          insertarEn(s.ini, [{ c: "\n", pa: Object.assign({}, pa) }], "enter-" + pasoN);
          cortarPaso();
          // Tras un título sigue texto normal; una tarea nueva empieza sin marcar.
          const ajuste = {};
          if (alFinal && ["titulo", "subtitulo", "h1", "h2", "h3"].includes(pa.estilo)) ajuste.estilo = null;
          if (pa.hecho) ajuste.hecho = null;
          if (Object.keys(ajuste).length) doc().seq(B, { k: "f", a: ajuste, r: S().rangos([p.mark]) }, { origen: "comando" });
          if (pendiente && pendiente.pos === s.ini) pendiente.pos = s.ini + 1;
          return { sel: [s.ini + 1, s.ini + 1] };
        });
        seguirAlCursor();
      }
      function insertarTexto(t, a) {
        sincronizar();
        const s = leerSel(), cur = attrsEnCursor();
        comando(() => {
          if (!s.col) borrarRango(s.ini, s.fin, grupoEscritura());
          const fin = insertarEn(s.ini, textoTokens(t, a || cur.a, cur.pa), grupoEscritura());
          finEdicion = fin;
          return { sel: [fin, fin] };
        });
        seguirAlCursor();
      }
      /** Objeto de bloque (tabla, salto, línea, índice) en su propio párrafo. */
      function insertarBloque(e) {
        sincronizar();
        const s = leerSel();
        return comando(() => {
          if (!s.col) borrarRango(s.ini, s.fin);
          const pi = parrafoEn(s.ini), p = psPintado[pi], pa = S().attrs(p.mark);
          const toks = [];
          if (s.ini > p.ini) toks.push({ c: "\n", pa: Object.assign({}, pa) });
          toks.push({ c: OBJ, obj: e }, { c: "\n", pa: {} });
          const fin = insertarEn(s.ini, toks);
          return { sel: [fin, fin] };
        });
      }
      function insertarImagenSrc(img) {
        const ref = NOM.DocCRDT.nuevoId();
        const w = Math.min(img.w || 320, anchoUtil());
        doc().cambiar(ref, { tipo: "imagen", enTexto: true, src: img.src, w, h: img.h ? Math.round(img.h * (w / img.w)) : 0 }, { origen: "comando" });
        sincronizar();
        const s = leerSel();
        comando(() => {
          if (!s.col) borrarRango(s.ini, s.fin);
          const fin = insertarEn(s.ini, [{ c: OBJ, obj: { tipo: "imagen", ref } }]);
          return { sel: [fin, fin] };
        });
      }
      async function insertarImagen() {
        const img = await ed.pedirImagen();
        if (img) insertarImagenSrc(img);
      }
      /** Columnas lado a lado: una tabla de una fila sin bordes (cada columna se escribe aparte). */
      function insertarColumnas(n) {
        const ref = NOM.DocCRDT.nuevoId();
        doc().cambiar(ref, { tipo: "tabla", enTexto: true, filasTexto: 1, colsTexto: n, bordes: "ninguno" }, { origen: "comando" });
        insertarBloque({ tipo: "tabla", ref });
        setTimeout(() => { const c = cuerpo.querySelector(`[data-ref="${ref}"] [data-celda="A1"]`); if (c) c.focus(); }, 30);
      }
      function insertarTabla(filas, cols) {
        const ref = NOM.DocCRDT.nuevoId();
        doc().cambiar(ref, { tipo: "tabla", enTexto: true, filasTexto: filas, colsTexto: cols }, { origen: "comando" });
        insertarBloque({ tipo: "tabla", ref });
        setTimeout(() => { const c = cuerpo.querySelector(`[data-ref="${ref}"] [data-celda="A1"]`); if (c) c.focus(); }, 30);
      }
      function anchoUtil() { const pg = pagina(); return pg.w - pg.m.iz - pg.m.d; }

      async function enlace() {
        const s = leerSel();
        const actual = attrsEnCursor().a.enlace || "";
        let url = await NOM.pedirTexto(actual ? "Editar enlace" : "Insertar enlace", { etiqueta: "Dirección (https://…)", ph: "https://", valor: actual, si: "Aplicar" });
        cuerpo.focus({ preventScroll: true });
        ponerSel(s.a, s.f);
        if (url == null) return;
        url = url.trim();
        if (url && !/^(https?:|mailto:|#)/i.test(url)) url = (/@/.test(url) && !/\//.test(url) ? "mailto:" : "https://") + url;
        if (s.col && url) {
          // Sin selección: se inserta el texto del enlace.
          insertarTexto(url.replace(/^mailto:/, ""), Object.assign({}, attrsEnCursor().a, { enlace: url }));
          return;
        }
        let ini = s.ini, fin = s.fin;
        if (s.col && !url) {
          // Quitar enlace: todo el tramo con el mismo enlace.
          while (ini > 0 && S().attrs(visPintado[ini - 1]).enlace === actual) ini--;
          while (fin < visPintado.length && S().attrs(visPintado[fin]).enlace === actual) fin++;
        }
        comando(() => { doc().seq(B, { k: "f", a: { enlace: url || null }, r: S().rangos(visPintado.slice(ini, fin)) }, { origen: "comando" }); return { sel: [s.a, s.f] }; });
      }

      // ------------------------------------------------------------ tablas en el texto (8.2)
      // Celdas "c:A1" (texto) con formato por celda: n negrita, i cursiva, k color, r relleno,
      // al alineación, m combinada ("2x1"). De la tabla: filasTexto, colsTexto, encabezado, bordes
      // (todos, horizontales, externos, ninguno) y aw:<columna> (ancho en %).
      const PROPS_TAB = ["c", "n", "i", "k", "r", "al", "m"];
      const FT = () => NOM.formulas;
      let celdaActiva = null;     // { ref, celda }
      let alcanceTab = "celda";   // a qué se aplica el formato: celda, fila, columna o tabla
      const dimTabla = (b) => ({ filas: Math.min(Math.max(1, b.filasTexto || 3), 200), cols: Math.min(Math.max(1, b.colsTexto || 3), 20) });
      function combinadasTabla(b) {
        const spans = {}, cubiertas = new Set();
        for (const k in b) {
          if (!k.startsWith("m:") || !/^\d+x\d+$/.test(String(b[k] || ""))) continue;
          const p = FT().parseRef(k.slice(2)), [w, h] = String(b[k]).split("x").map(Number);
          if (!p || w * h <= 1) continue;
          spans[k.slice(2)] = [w, h];
          for (let f = p.f; f < p.f + h; f++) for (let c = p.c; c < p.c + w; c++) if (c !== p.c || f !== p.f) cubiertas.add(FT().ref(c, f));
        }
        return { spans, cubiertas };
      }
      function anchosTabla(b, cols) {
        const a = Array.from({ length: cols }, (_, c) => +b["aw:" + FT().colLetra(c)] || 0);
        const fijos = a.reduce((s, x) => s + x, 0), libres = a.filter((x) => !x).length;
        const resto = Math.max(0, 100 - fijos);
        return a.map((x) => (x || (libres ? resto / libres : 0)));
      }
      function pintarTabla(o, b, ref) {
        o.dataset.ref = ref;
        if (!b) { o.innerHTML = `<span class="wd-falta">Tabla no disponible</span>`; return; }
        const { filas, cols } = dimTabla(b);
        const { spans, cubiertas } = combinadasTabla(b);
        const anchos = anchosTabla(b, cols);
        let h = `<table class="wd-tab ${b.encabezado ? "con-cab" : ""} bordes-${esc(b.bordes || "todos")}"><colgroup>${anchos.map((w) => `<col style="width:${w.toFixed(2)}%">`).join("")}</colgroup><tbody>`;
        for (let f = 0; f < filas; f++) {
          h += "<tr>";
          for (let c = 0; c < cols; c++) {
            const r = FT().ref(c, f);
            if (cubiertas.has(r)) continue;
            const sp = spans[r], st = [];
            if (b["r:" + r]) st.push("background-color:" + b["r:" + r]);
            const ce = [];
            if (b["n:" + r]) ce.push("font-weight:bold");
            if (b["i:" + r]) ce.push("font-style:italic");
            if (b["k:" + r]) ce.push("color:" + b["k:" + r]);
            if (b["al:" + r]) ce.push("text-align:" + ({ izq: "left", centro: "center", der: "right" }[b["al:" + r]] || "left"));
            h += `<td${sp ? ` colspan="${sp[0]}" rowspan="${sp[1]}"` : ""}${st.length ? ` style="${esc(st.join(";"))}"` : ""}><div class="wd-celda" data-celda="${r}" ${ed.soloLectura ? "" : 'contenteditable="true"'} spellcheck="true"${ce.length ? ` style="${esc(ce.join(";"))}"` : ""}>${esc(b["c:" + r] || "")}</div></td>`;
          }
          h += "</tr>";
        }
        h += "</tbody></table>";
        if (!ed.soloLectura) {
          const bt = (t, i, tx, micro) => `<button type="button" data-t="${t}" data-micro="${esc(micro || tx)}" aria-label="${esc(tx)}">${ico(i, "ico-s")}${tx && !micro ? " " + esc(tx) : ""}</button>`;
          h += `<span class="wd-tab-ctl" contenteditable="false">${bt("fila", "between-horizontal-start", "Fila", "Insertar fila")}${bt("col", "between-vertical-start", "Columna", "Insertar columna")}${bt("combinar", "table-cells-merge", "", "Combinar o separar celdas")}<span class="sep"></span>${bt("n", "bold", "", "Negrita")}${bt("i", "italic", "", "Cursiva")}${bt("k", "baseline", "", "Color de letra")}${bt("r", "paint-bucket", "", "Relleno")}${bt("al", "align-center", "", "Alinear")}${bt("bordes", "grid-3x3", "", "Bordes")}${bt("cab", "heading-1", "", "Fila de encabezado")}<span class="sep"></span><select data-t="alcance" aria-label="Aplicar a">${[["celda", "A la celda"], ["fila", "A la fila"], ["columna", "A la columna"], ["tabla", "A toda la tabla"]].map(([v, tx]) => `<option value="${v}" ${alcanceTab === v ? "selected" : ""}>${tx}</option>`).join("")}</select>${bt("borrar", "trash-2", "", "Eliminar fila, columna o tabla")}</span>`;
        }
        o.innerHTML = h;
        if (!ed.soloLectura) colocarRedimTabla(o, b, ref, anchos);
      }
      /** Tiradores entre columnas para cambiar su ancho (arrastrar con el ratón o el dedo). */
      function colocarRedimTabla(o, b, ref, anchos) {
        const tb = $("table", o);
        if (!tb) return;
        let acum = 0;
        anchos.slice(0, -1).forEach((w, c) => {
          acum += w;
          const t = html(`<span class="wd-tab-redim" data-redim="${c}" contenteditable="false" style="left:${acum.toFixed(2)}%" aria-hidden="true"></span>`);
          o.append(t);
          t.addEventListener("pointerdown", (e) => {
            e.preventDefault(); e.stopPropagation();
            t.setPointerCapture(e.pointerId);
            const ancho = tb.getBoundingClientRect().width / (zoom || 1), x0 = e.clientX, a0 = anchos.slice();
            let nuevos = a0;
            t.onpointermove = (ev) => {
              const d = ((ev.clientX - x0) / (zoom || 1) / ancho) * 100;
              const izq = Math.max(5, Math.min(a0[c] + a0[c + 1] - 5, a0[c] + d));
              nuevos = a0.slice(); nuevos[c] = izq; nuevos[c + 1] = a0[c] + a0[c + 1] - izq;
              $$("col", tb).forEach((col, k) => (col.style.width = nuevos[k].toFixed(2) + "%"));
            };
            t.onpointerup = () => {
              t.onpointermove = t.onpointerup = null;
              const campos = {};
              nuevos.forEach((w, k) => (campos["aw:" + FT().colLetra(k)] = Math.round(w * 100) / 100));
              doc().cambiar(ref, campos);
            };
          });
        });
      }
      const pendCeldas = new Map();
      cuerpo.addEventListener("input", (e) => {
        const cel = e.target.closest && e.target.closest("[data-celda]");
        if (!cel || ed.soloLectura) return;
        e.stopPropagation();
        const ref = cel.closest("[data-ref]").dataset.ref, r = cel.dataset.celda, k = ref + "!" + r;
        if (!pendCeldas.has(k)) pendCeldas.set(k, NOM.debounce(() => {
          const el = cuerpo.querySelector(`[data-ref="${ref}"] [data-celda="${r}"]`);
          if (el && el.innerText.replace(/\n$/, "") !== (doc().valor(ref, "c:" + r) || "")) doc().cambiar(ref, { ["c:" + r]: el.innerText.replace(/\n$/, "") }, { grupo: "celda-" + k, origen: "celda" });
        }, 200));
        pendCeldas.get(k)();
      }, true);
      cuerpo.addEventListener("focusin", (e) => {
        const cel = e.target.closest && e.target.closest("[data-celda]");
        if (!cel) return;
        celdaActiva = { ref: cel.closest("[data-ref]").dataset.ref, celda: cel.dataset.celda };
        $$(".wd-tabla.activa", cuerpo).forEach((x) => x.classList.remove("activa"));
        const o = cel.closest("[data-obj]"); if (o) o.classList.add("activa");
      });
      cuerpo.addEventListener("keydown", (e) => {
        const cel = e.target.closest && e.target.closest("[data-celda]");
        if (!cel) return;
        e.stopPropagation();
        const mod = e.ctrlKey || e.metaKey;
        if (mod && ["b", "i"].includes(e.key.toLowerCase())) { e.preventDefault(); formatoCelda(e.key.toLowerCase() === "b" ? "n" : "i"); return; }
        if (e.key !== "Tab" && !(e.key === "Enter" && !e.shiftKey)) return;
        e.preventDefault();
        const td = cel.closest("td"), tr = td.parentElement, i = [...tr.children].indexOf(td);
        let sig = e.key === "Enter" ? tr.nextElementSibling && tr.nextElementSibling.children[Math.min(i, tr.nextElementSibling.children.length - 1)]
          : e.shiftKey ? (td.previousElementSibling || (tr.previousElementSibling && tr.previousElementSibling.lastElementChild)) : (td.nextElementSibling || (tr.nextElementSibling && tr.nextElementSibling.children[0]));
        if (!sig && e.key === "Tab" && !e.shiftKey) {
          // Tab en la última celda agrega una fila (como en Word).
          const ref = cel.closest("[data-ref]").dataset.ref;
          doc().cambiar(ref, { filasTexto: (doc().valor(ref, "filasTexto") || 3) + 1 });
          setTimeout(() => { const t = cuerpo.querySelector(`[data-ref="${ref}"] tr:last-child td .wd-celda`); if (t) t.focus(); }, 20);
          return;
        }
        if (sig) { const c = sig.querySelector("[data-celda]"); c.focus(); const r = document.createRange(); r.selectNodeContents(c); getSelection().removeAllRanges(); getSelection().addRange(r); }
      }, true);
      /** Celdas a las que se aplica el formato según el alcance elegido. */
      function celdasAlcance(b, celda) {
        const { filas, cols } = dimTabla(b), p = FT().parseRef(celda), l = [];
        if (alcanceTab === "fila") for (let c = 0; c < cols; c++) l.push(FT().ref(c, p.f));
        else if (alcanceTab === "columna") for (let f = 0; f < filas; f++) l.push(FT().ref(p.c, f));
        else if (alcanceTab === "tabla") for (let f = 0; f < filas; f++) for (let c = 0; c < cols; c++) l.push(FT().ref(c, f));
        else l.push(celda);
        return l;
      }
      function formatoCelda(k, valor) {
        if (!celdaActiva || ed.soloLectura) return;
        const b = doc().bloque(celdaActiva.ref);
        if (!b) return;
        const l = celdasAlcance(b, celdaActiva.celda), campos = {};
        const v = valor !== undefined ? valor : !b[k + ":" + celdaActiva.celda];
        l.forEach((r) => (campos[k + ":" + r] = v == null || v === "" || v === false ? null : v));
        doc().cambiar(celdaActiva.ref, campos);
        volverACelda();
      }
      function volverACelda() {
        if (!celdaActiva) return;
        const a = celdaActiva;
        setTimeout(() => { const el = cuerpo.querySelector(`[data-ref="${a.ref}"] [data-celda="${a.celda}"]`); if (el) el.focus({ preventScroll: true }); }, 30);
      }
      /** Insertar (n > 0) o borrar (n < 0) filas o columnas de una tabla del texto. */
      function reacomodarTabla(ref, eje, en, n) {
        const b = doc().bloque(ref);
        if (!b) return;
        const { filas, cols } = dimTabla(b);
        const total = eje === "f" ? filas : cols;
        if (n < 0 && total + n < 1) { quitarObjeto(cuerpo.querySelector(`[data-ref="${ref}"]`).dataset.id); return; }
        const nueva = (x) => (x < en ? x : n > 0 ? x + n : x < en - n ? null : x + n);
        const nuevos = {};
        for (const k in b) {
          const i = k.indexOf(":");
          if (i < 1) continue;
          const p = k.slice(0, i), r = k.slice(i + 1), v = b[k];
          if (v == null || v === "" || v === false) continue;
          if (p === "aw") { const c = FT().colNum(r) - 1, nc = eje === "c" ? nueva(c) : c; if (nc != null) nuevos["aw:" + FT().colLetra(nc)] = v; continue; }
          if (!PROPS_TAB.includes(p)) continue;
          const pos = FT().parseRef(r);
          if (!pos) continue;
          if (p === "m") {
            const [w, h] = String(v).split("x").map(Number);
            const rg = FT().ajustarEstructura("=" + FT().ref(pos.c, pos.f) + ":" + FT().ref(pos.c + w - 1, pos.f + h - 1), { hoja: "", propia: true, eje, en, n });
            const g = rg.includes("#REF!") ? null : NOM.graficas.rango(rg.slice(1));
            if (g && (g.c2 - g.c1 + 1) * (g.f2 - g.f1 + 1) > 1) nuevos["m:" + FT().ref(g.c1, g.f1)] = `${g.c2 - g.c1 + 1}x${g.f2 - g.f1 + 1}`;
            continue;
          }
          const nc = eje === "c" ? nueva(pos.c) : pos.c, nf = eje === "f" ? nueva(pos.f) : pos.f;
          if (nc == null || nf == null) continue;
          nuevos[p + ":" + FT().ref(nc, nf)] = v;
        }
        const campos = {};
        for (const k in b) { const i = k.indexOf(":"); if (i > 0 && (PROPS_TAB.includes(k.slice(0, i)) || k.startsWith("aw:")) && b[k] != null && b[k] !== "" && !(k in nuevos)) campos[k] = null; }
        for (const k in nuevos) if (JSON.stringify(nuevos[k]) !== JSON.stringify(b[k] == null ? null : b[k])) campos[k] = nuevos[k];
        campos[eje === "f" ? "filasTexto" : "colsTexto"] = Math.max(1, Math.min(eje === "f" ? 200 : 20, total + n));
        // Los anchos en % de las columnas que quedan se reparten de nuevo.
        if (eje === "c") Object.keys(campos).concat(Object.keys(b)).filter((k) => k.startsWith("aw:")).forEach((k) => (campos[k] = null));
        doc().cambiar(ref, campos, { meta: { o: "r" } });
      }
      function menuTabla(b, t) {
        if (!celdaActiva) return;
        const ref = celdaActiva.ref, bl = doc().bloque(ref) || {}, p = FT().parseRef(celdaActiva.celda);
        const { spans, cubiertas } = combinadasTabla(bl);
        const { filas, cols } = dimTabla(bl);
        const colores = (k, titulo, sin) => NOM.paleta(b, { titulo, actual: bl[k + ":" + celdaActiva.celda], sinColor: sin, colores: k === "r" ? ["#F2F2F2", "#D9D9D9", "#DEEAF6", "#E2EFD9", "#FFF2CC", "#FBE4D5", "#EDE2F6", "#4472C4"].concat(NOM.COLORES) : NOM.COLORES, alElegir: (c) => formatoCelda(k, c) });
        if (t === "fila") NOM.menu(b, [{ titulo: "Insertar fila" }, { texto: "Arriba", icono: "between-horizontal-start", fn: () => reacomodarTabla(ref, "f", p.f, 1) }, { texto: "Abajo", icono: "between-horizontal-end", fn: () => reacomodarTabla(ref, "f", p.f + 1, 1) }]);
        else if (t === "col") NOM.menu(b, [{ titulo: "Insertar columna" }, { texto: "A la izquierda", icono: "between-vertical-start", fn: () => reacomodarTabla(ref, "c", p.c, 1) }, { texto: "A la derecha", icono: "between-vertical-end", fn: () => reacomodarTabla(ref, "c", p.c + 1, 1) }]);
        else if (t === "combinar") {
          const sp = spans[celdaActiva.celda];
          NOM.menu(b, [{ titulo: "Celdas" },
            { texto: "Combinar con la de la derecha", icono: "table-cells-merge", off: p.c + (sp ? sp[0] : 1) >= cols, fn: () => { const w = (sp ? sp[0] : 1) + 1, h = sp ? sp[1] : 1; doc().cambiar(ref, { ["m:" + celdaActiva.celda]: `${w}x${h}` }); } },
            { texto: "Combinar con la de abajo", icono: "table-cells-merge", off: p.f + (sp ? sp[1] : 1) >= filas, fn: () => { const w = sp ? sp[0] : 1, h = (sp ? sp[1] : 1) + 1; doc().cambiar(ref, { ["m:" + celdaActiva.celda]: `${w}x${h}` }); } },
            { texto: "Separar", icono: "table-cells-split", off: !sp, fn: () => doc().cambiar(ref, { ["m:" + celdaActiva.celda]: null }) },
            { texto: "Igualar el ancho de las columnas", icono: "columns-3", fn: () => { const c = {}; Object.keys(bl).filter((k) => k.startsWith("aw:")).forEach((k) => (c[k] = null)); if (Object.keys(c).length) doc().cambiar(ref, c); } }].filter((x) => !x.off));
          void cubiertas;
        } else if (t === "n" || t === "i") formatoCelda(t);
        else if (t === "k") colores("k", "Color de letra", "Automático");
        else if (t === "r") colores("r", "Relleno", "Sin relleno");
        else if (t === "al") NOM.menu(b, [{ titulo: "Alinear" }, ...[["izq", "Izquierda", "align-left"], ["centro", "Centro", "align-center"], ["der", "Derecha", "align-right"]].map(([v, tx, i]) => ({ texto: tx, icono: i, marcado: (bl["al:" + celdaActiva.celda] || "izq") === v, fn: () => formatoCelda("al", v === "izq" ? null : v) }))]);
        else if (t === "bordes") NOM.menu(b, [{ titulo: "Bordes de la tabla" }, ...[["todos", "Todos"], ["horizontales", "Solo horizontales"], ["externos", "Solo el contorno"], ["ninguno", "Sin bordes"]].map(([v, tx]) => ({ texto: tx, marcado: (bl.bordes || "todos") === v, fn: () => doc().cambiar(ref, { bordes: v === "todos" ? null : v }) }))]);
        else if (t === "cab") doc().cambiar(ref, { encabezado: !bl.encabezado || null });
        else if (t === "borrar") NOM.menu(b, [{ titulo: "Eliminar" },
          { texto: "Esta fila", icono: "trash-2", fn: () => reacomodarTabla(ref, "f", p.f, -1) },
          { texto: "Esta columna", icono: "trash-2", fn: () => reacomodarTabla(ref, "c", p.c, -1) },
          "-", { texto: "Toda la tabla", icono: "trash-2", peligro: true, fn: () => { const o = cuerpo.querySelector(`[data-ref="${ref}"]`); if (o) quitarObjeto(o.dataset.id); celdaActiva = null; } }]);
      }
      raiz.addEventListener("pointerdown", (e) => { if (e.target.closest(".wd-tab-ctl button")) e.preventDefault(); }, true);
      raiz.addEventListener("change", (e) => {
        const s = e.target.closest && e.target.closest('.wd-tab-ctl [data-t="alcance"]');
        if (s) { alcanceTab = s.value; volverACelda(); }
      });
      raiz.addEventListener("click", (e) => {
        const b = e.target.closest(".wd-tab-ctl button");
        if (!b || ed.soloLectura) return;
        const o = b.closest("[data-obj]");
        if (!celdaActiva || celdaActiva.ref !== o.dataset.ref) celdaActiva = { ref: o.dataset.ref, celda: "A1" };
        menuTabla(b, b.dataset.t);
      });
      function quitarObjeto(id) {
        const it = sec().item(id);
        if (!it) return;
        comando(() => { const i = sec().posicion(id); doc().seq(B, { k: "v", v: false, r: S().rangos([it]) }, { origen: "comando" }); return { sel: [i, i] }; });
      }
      function pintarIndice(o) {
        const tit = calcularParrafos(sec()).filter((p) => /^h[1-3]$/.test(S().attrs(p.mark).estilo || ""));
        const vis = sec().visibles();
        o.innerHTML = `<div class="wd-indice-t">Contenido</div>` + (tit.map((p) => `<a href="#" data-ir="${esc(p.k)}" class="n${S().attrs(p.mark).estilo.slice(1)}">${esc(vis.slice(p.ini, p.fin).map((x) => (x.e ? "" : x.c)).join("") || "(sin texto)")}</a>`).join("") || `<span class="suave">Usa estilos “Título 1/2/3” para que aparezcan aquí.</span>`);
      }

      // ------------------------------------------------------------ imágenes: seleccionar, mover y cambiar tamaño
      let imgSel = null;   // id del objeto imagen seleccionado (el elemento cambia al repintar)
      const elImagen = (id) => (id ? cuerpo.querySelector(`.wd-imagen[data-id="${CSS.escape(id)}"]`) : null);
      function seleccionarImagen(o) {
        const antes = elImagen(imgSel);
        if (antes) antes.classList.remove("sel");
        imgSel = o ? o.dataset.id : null;
        if (o) {
          o.classList.add("sel");
          const r = document.createRange();
          r.selectNode(o);
          const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        }
      }
      /** La imagen seleccionada, solo si la selección sigue siendo esa imagen (el cursor pudo irse). */
      function imgActiva() {
        const o = elImagen(imgSel), s = getSelection();
        if (o && s.rangeCount && !s.isCollapsed && s.getRangeAt(0).intersectsNode(o) && !s.toString()) return imgSel;
        if (imgSel) seleccionarImagen(null);
        return null;
      }
      /** Con una imagen seleccionada, Enter o escribir siguen DESPUÉS de ella (no la reemplazan). */
      function salirDeImagen() {
        const id = imgSel;
        seleccionarImagen(null);
        const i = sec().posicion(id);
        if (i >= 0) ponerSel(i + 1);
      }
      /** Posición del texto bajo un punto de la pantalla. */
      function posEnPunto(x, y) {
        let n, off;
        if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(x, y); if (!c) return null; n = c.offsetNode; off = c.offset; }
        else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (!r) return null; n = r.startContainer; off = r.startOffset; }
        else return null;
        return n && cuerpo.contains(n) ? posDe(n, off) : null;
      }
      function rectEn(i) {
        const pt = puntoDom(i), r = document.createRange();
        try { r.setStart(pt.node, pt.off); r.collapse(true); } catch (e) { return null; }
        const c = r.getClientRects()[0];
        if (c && (c.height || c.top)) return c;
        const top = superior(pt.node);
        return top ? top.getBoundingClientRect() : null;
      }
      /** Arrastrar una imagen: en línea se lleva a otro lugar del texto; libre se mueve a cualquier punto de la hoja. */
      function arrastrarImagen(e, o) {
        const id = o.dataset.id, it = sec().item(id), ref = it && it.e && it.e.ref;
        if (!ref) return;
        const bl = doc().bloque(ref) || {}, libre = !!bl.libre;
        const x0 = e.clientX, y0 = e.clientY, bx = +bl.x || 0, by = +bl.y || 0, r0 = o.getBoundingClientRect();
        let activo = false, fantasma = null, marca = null, destino = null;
        const mover = (ev) => {
          if (ev.pointerId !== e.pointerId) return;
          const dx = ev.clientX - x0, dy = ev.clientY - y0;
          if (!activo) {
            if (Math.hypot(dx, dy) < 5) return;
            activo = true;
            o.classList.add("moviendo");
            if (!libre) {
              fantasma = html(`<img class="wd-fantasma" alt="" src="${esc($("img", o).src)}" style="left:${r0.left}px;top:${r0.top}px;width:${r0.width}px">`);
              marca = html(`<div class="wd-marca-soltar" hidden></div>`);
              document.body.append(fantasma); zona.append(marca);
            }
          }
          ev.preventDefault();
          if (libre) {
            const p = o.parentElement;
            const x = Math.max(-p.offsetLeft, Math.min(cuerpo.clientWidth - p.offsetLeft - o.offsetWidth, bx + dx / zoom));
            const y = Math.max(-p.offsetTop, Math.min(cuerpo.offsetHeight - p.offsetTop - o.offsetHeight, by + dy / zoom));
            o.style.left = Math.round(x) + "px"; o.style.top = Math.round(y) + "px";
            return;
          }
          fantasma.style.transform = `translate(${dx}px, ${dy}px)`;
          destino = posEnPunto(ev.clientX, ev.clientY);
          const c = destino == null ? null : rectEn(destino), z = zona.getBoundingClientRect();
          marca.hidden = !c;
          if (c) Object.assign(marca.style, { left: c.left - z.left - 1 + "px", top: c.top - z.top + "px", height: Math.max(16, c.height) + "px" });
        };
        const soltar = (ev) => {
          if (ev.pointerId !== e.pointerId) return;
          removeEventListener("pointermove", mover); removeEventListener("pointerup", soltar); removeEventListener("pointercancel", soltar);
          o.classList.remove("moviendo");
          if (fantasma) fantasma.remove();
          if (marca) marca.remove();
          if (!activo) return;
          if (ev.type === "pointercancel") { if (libre) { o.style.left = bx + "px"; o.style.top = by + "px"; } return; }
          if (libre) { doc().cambiar(ref, { x: parseInt(o.style.left, 10), y: parseInt(o.style.top, 10) }, { origen: "comando" }); programarPaginar(); return; }
          if (destino != null) moverImagen(id, destino);
        };
        addEventListener("pointermove", mover); addEventListener("pointerup", soltar); addEventListener("pointercancel", soltar);
      }
      /** Lleva una imagen en línea a la posición i del texto (un solo paso de deshacer). */
      function moverImagen(id, i) {
        const it = sec().item(id);
        if (!it || !it.v) return;
        const pos = sec().posicion(id);
        if (i === pos || i === pos + 1) return;
        const grupo = "mover-" + id;
        const r = comando(() => {
          doc().seq(B, { k: "v", v: false, r: S().rangos([it]) }, { origen: "comando", grupo });
          actualizarPintado();
          const j = i > pos ? i - 1 : i;
          insertarEn(j, [{ c: OBJ, id, a: S().attrs(it) }], grupo);
          return { sel: [j, j + 1], j };
        });
        const nuevo = r && visPintado[r.j];
        if (nuevo) seleccionarImagen(elImagen(nuevo.id));
      }
      /** En línea con el texto ↔ libre (delante del texto, en cualquier lugar de la hoja). */
      function ajusteImagen(id, libre) {
        const it = sec().item(id), ref = it && it.e && it.e.ref, o = elImagen(id);
        if (!ref) return;
        if (libre) doc().cambiar(ref, { libre: true, x: o ? o.offsetLeft : 0, y: o ? o.offsetTop : 0 }, { origen: "comando" });
        else doc().cambiar(ref, { libre: null, x: null, y: null }, { origen: "comando" });
        programarPaginar();
      }
      cuerpo.addEventListener("pointerdown", (e) => {
        const tir = e.target.closest("[data-tirador]");
        const o = e.target.closest(".wd-imagen");
        if (tir && o && !ed.soloLectura) {
          e.preventDefault();
          const img = $("img", o), w0 = img.offsetWidth, x0 = e.clientX, it = sec().item(o.dataset.id);
          const mover = (ev) => { img.style.width = Math.max(24, Math.min(anchoUtil(), Math.round(w0 + (ev.clientX - x0) / zoom))) + "px"; };
          const soltar = () => {
            removeEventListener("pointermove", mover); removeEventListener("pointerup", soltar); removeEventListener("pointercancel", soltar);
            if (it && it.e && it.e.ref) doc().cambiar(it.e.ref, { w: parseInt(img.style.width, 10) });
            programarPaginar();
          };
          addEventListener("pointermove", mover); addEventListener("pointerup", soltar); addEventListener("pointercancel", soltar);
          return;
        }
        if (o) {
          e.preventDefault();
          if (!ed.soloLectura) cuerpo.focus({ preventScroll: true });
          seleccionarImagen(o);
          if (e.button === 0 && !ed.soloLectura) arrastrarImagen(e, o);
          return;
        }
        if (imgSel) seleccionarImagen(null);
        // Casilla de tarea: clic a la izquierda del texto.
        const p = e.target.closest("[data-lista='tareas']");
        if (p && !ed.soloLectura && e.target === p) {
          const r = p.getBoundingClientRect(), padIzq = parseFloat(getComputedStyle(p).paddingLeft) * zoom;
          if (e.clientX - r.left < padIzq) {
            e.preventDefault();
            const ps = psPintado[indiceHijo(p)];
            if (ps) comando(() => { doc().seq(B, { k: "f", a: { hecho: S().attrs(ps.mark).hecho ? null : true }, r: S().rangos([ps.mark]) }, { origen: "comando" }); return null; });
          }
        }
      });
      cuerpo.addEventListener("click", (e) => {
        const ob = e.target.closest && e.target.closest(".wd-nota[data-obj], .wd-ecuacion[data-obj]");
        if (ob && cuerpo.contains(ob)) { e.preventDefault(); if (ob.classList.contains("wd-nota")) dialogoNota(ob.dataset.id); else dialogoEcuacion(ob.dataset.id); return; }
        const a = e.target.closest("a[href]");
        if (a && cuerpo.contains(a) && (e.ctrlKey || e.metaKey || ed.soloLectura)) { e.preventDefault(); window.open(a.href, "_blank", "noopener"); return; }
        const ir = e.target.closest("[data-ir]");
        if (ir) { e.preventDefault(); const el = elems.get(ir.dataset.ir); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
        if (marcasComentario.length && NOM.comentarios) { const s0 = leerSel(); const c = s0.col ? this.comentarios.bajo(s0.ini) : null; if (c) NOM.comentarios.abrir(ed, c.id); }
        // Clic a la derecha de una imagen: algunos navegadores dejan el cursor ANTES de ella.
        const s = getSelection();
        if (ed.soloLectura || !s.isCollapsed || !cuerpo.contains(s.anchorNode) || e.target.closest("[data-obj]")) return;
        const i = leerSel().ini;
        let k = i;
        while (k < visPintado.length && visPintado[k].e && visPintado[k].e.tipo === "imagen") {
          const o = elImagen(visPintado[k].id);
          if (!o || o.classList.contains("libre")) break;
          const r = o.getBoundingClientRect();
          if (e.clientX >= r.right - 2 && e.clientY >= r.top && e.clientY <= r.bottom + 4) k++; else break;
        }
        if (k > i) ponerSel(k);
      });

      // ------------------------------------------------------------ teclado
      let avisadoAjeno = 0;
      cuerpo.addEventListener("beforeinput", (e) => {
        if (ed.soloLectura) return;
        if (e.target.closest && e.target.closest("[data-celda]")) return;
        // 3.5 El párrafo de otra persona no se cambia (el servidor también lo rechaza).
        const ajeno = ajenoEnSeleccion(leerSel());
        if (ajeno && e.cancelable) {
          e.preventDefault();
          if (Date.now() - avisadoAjeno > 2500) { avisadoAjeno = Date.now(); aviso(`Ese párrafo es de ${ajeno}: solo esa persona (o el propietario del espacio) lo cambia`, { tipo: "info", ms: 3000 }); }
          return;
        }
        if (e.inputType === "insertFromPaste" && !pegadoManejado) {
          const t = e.data || (e.dataTransfer && e.dataTransfer.getData("text/plain")) || "";
          pegadoNativo = { g: NOM.idCorto() + Date.now().toString(36), gn: cps(t).length, hasta: Date.now() + 1500 };
        }
        // 7 Modo sugerencia: borrar marca para borrar; escribir sobre una selección la marca y escribe después.
        if (modoSug && e.cancelable && !e.isComposing) {
          if (/^delete/.test(e.inputType)) { e.preventDefault(); borrarConTecla(e.inputType); return; }
          if (e.inputType === "insertText" && e.data && !leerSel().col) {
            e.preventDefault();
            const s = leerSel();
            comando(() => { borrarSugerido(visPintado.slice(s.ini, s.fin), "sug-" + pasoN, "comando"); return { sel: [s.fin, s.fin] }; });
            insertarTexto(e.data);
            return;
          }
        }
        switch (e.inputType) {
          case "insertParagraph": e.preventDefault(); if (imgActiva()) salirDeImagen(); enter(); break;
          case "insertLineBreak": e.preventDefault(); insertarTexto(SALTO); break;
          case "historyUndo": e.preventDefault(); ed.deshacer(); break;
          case "historyRedo": e.preventDefault(); ed.rehacer(); break;
          case "formatBold": e.preventDefault(); alternar("b"); break;
          case "formatItalic": e.preventDefault(); alternar("i"); break;
          case "formatUnderline": e.preventDefault(); alternar("u"); break;
          case "formatStrikeThrough": e.preventDefault(); alternar("s"); break;
          case "insertFromPaste": case "insertFromPasteAsQuotation": if (pegadoManejado) e.preventDefault(); break;
          default:
            if (/^delete/.test(e.inputType) && imgActiva()) { e.preventDefault(); const id = imgSel; seleccionarImagen(null); quitarObjeto(id); }
            else if (e.inputType === "insertText" && e.data && imgActiva()) { e.preventDefault(); salirDeImagen(); insertarTexto(e.data); }
        }
      });
      cuerpo.addEventListener("input", (e) => sincronizar(e));
      cuerpo.addEventListener("compositionstart", () => { componiendo = true; ed.retener = true; });
      cuerpo.addEventListener("compositionend", () => {
        setTimeout(() => {
          componiendo = false;
          sincronizar();
          // Al terminar la palabra se repinta en forma canónica lo que quedó pendiente.
          if (necesitaPintar) { necesitaPintar = false; const s = leerSel(); reconciliar(); ponerSel(s.a, s.f); }
          ed.retener = false;
          ed.soltar && ed.soltar();
        }, 0);
      });
      cuerpo.addEventListener("keydown", (e) => {
        if (ed.soloLectura || (e.target.closest && e.target.closest("[data-celda]"))) return;
        const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
        if (mod && !e.altKey && !e.shiftKey && ["b", "i", "u"].includes(k)) { e.preventDefault(); alternar(k); return; }
        if (mod && e.shiftKey && k === "x") { e.preventDefault(); alternar("s"); return; }
        if (mod && (e.key === "=" || e.key === "+") && !e.shiftKey) { e.preventDefault(); formato({ va: attrsEnCursor().a.va === "sub" ? null : "sub" }); return; }
        if (mod && e.shiftKey && (e.key === "+" || e.key === "=" || e.code === "Equal")) { e.preventDefault(); formato({ va: attrsEnCursor().a.va === "sup" ? null : "sup" }); return; }
        if (mod && e.shiftKey && ["l", "e", "r", "j"].includes(k)) { e.preventDefault(); formatoParrafo({ alin: { l: null, e: "centro", r: "der", j: "just" }[k] }); return; }
        if (mod && e.altKey && /^[0-3]$/.test(e.key)) { e.preventDefault(); formatoParrafo({ estilo: e.key === "0" ? null : "h" + e.key }); return; }
        if (mod && e.shiftKey && ["7", "8", "9"].includes(e.key)) { e.preventDefault(); alternarLista({ 7: "numeros", 8: "vinetas", 9: "tareas" }[e.key]); return; }
        if (mod && e.shiftKey && (e.code === "Digit7" || e.code === "Digit8" || e.code === "Digit9")) { e.preventDefault(); alternarLista({ Digit7: "numeros", Digit8: "vinetas", Digit9: "tareas" }[e.code]); return; }
        if (mod && k === "k") { e.preventDefault(); enlace(); return; }
        if (mod && e.key === "Enter") { e.preventDefault(); insertarBloque({ tipo: "salto" }); return; }
        if (mod && (e.key === "]" || (e.shiftKey && e.key === ">"))) { e.preventDefault(); cambiarTam(1); return; }
        if (mod && (e.key === "[" || (e.shiftKey && e.key === "<"))) { e.preventDefault(); cambiarTam(-1); return; }
        if (mod && e.key === "\\") { e.preventDefault(); borrarFormato(); return; }
        if (mod && e.altKey && k === "c") { e.preventDefault(); copiarFormato(false); return; }
        if (mod && e.altKey && k === "v") { e.preventDefault(); if (brocha) aplicarBrocha(); return; }
        if (mod && (k === "f" || k === "h")) { e.preventDefault(); buscar(k === "h"); return; }
        if (e.shiftKey && e.key === "F3") { e.preventDefault(); cambiarMayusculas(); return; }
        if (e.key === "Tab" && !mod && !e.altKey) {
          e.preventDefault();
          const s = leerSel(), pa = S().attrs(psPintado[parrafoEn(s.ini)].mark);
          if (pa.lista || !s.col) sangria(e.shiftKey ? -1 : 1);
          else if (!e.shiftKey) insertarTexto("\t");
          return;
        }
        if (e.key === "Backspace" && !mod) {
          const s = leerSel();
          if (s.col) {
            const p = psPintado[parrafoEn(s.ini)], pa = S().attrs(p.mark);
            // Retroceso al inicio: primero se quita la viñeta o la sangría (como en Word).
            if (s.ini === p.ini && (pa.lista || pa.sangria)) {
              e.preventDefault();
              formatoParrafo(pa.lista ? { lista: null, nivel: null, hecho: null } : { sangria: (pa.sangria || 1) - 1 || null }, [p]);
              return;
            }
            // Borrar un objeto de bloque que está justo antes.
            const prev = visPintado[s.ini - 2];
            if (s.ini === p.ini && prev && prev.e && BLOQUE_OBJ.has(prev.e.tipo) && p.ini > 0) {
              e.preventDefault();
              comando(() => { doc().seq(B, { k: "v", v: false, r: S().rangos([prev, visPintado[s.ini - 1]]) }, { origen: "comando" }); return { sel: [s.ini - 2, s.ini - 2] }; });
              return;
            }
          }
        }
        if (e.key === "Escape" && brocha) { brocha = null; raiz.classList.remove("brocha"); return; }
      });

      // Formato pendiente: se olvida si el cursor se va a otro lugar.
      let parrafoActual = null;
      function alCambiarSeleccion() {
        if (!cuerpo.contains(getSelection().anchorNode)) return;
        // Párrafo donde está el cursor (el modo enfoque atenúa los demás).
        let top = superior(getSelection().focusNode);
        if (top && top.nodeType !== 1) top = null;   // texto suelto en la hoja, todavía sin párrafo
        if (top !== parrafoActual) { if (parrafoActual) parrafoActual.classList.remove("wd-actual"); parrafoActual = top; if (top) top.classList.add("wd-actual"); }
        const s = leerSel();
        if (pendiente && (s.ini !== pendiente.pos || !s.col)) pendiente = null;
        programarReflejo();
        enviarCursor();
        if (brocha && !s.col && !brochaArrastrando) aplicarBrocha();
      }
      const selDeb = NOM.debounce(alCambiarSeleccion, 60);
      document.addEventListener("selectionchange", selDeb);
      let brochaArrastrando = false;
      cuerpo.addEventListener("pointerdown", () => { brochaArrastrando = true; });
      addEventListener("pointerup", () => { if (brochaArrastrando) { brochaArrastrando = false; if (brocha) setTimeout(alCambiarSeleccion, 0); } });

      // ------------------------------------------------------------ atajos de Markdown al inicio del párrafo
      function atajosMarkdown(p) {
        if (!p || !sec()) return;
        const vis = visPintado;
        const n = Math.min(p.fin - p.ini, 5);
        let ini = "";
        for (let i = 0; i < n; i++) ini += vis[p.ini + i].c;
        const pa = S().attrs(p.mark);
        if (pa.lista || pa.estilo) return;
        const reglas = [[/^#{1} $/, { estilo: "h1" }], [/^#{2} $/, { estilo: "h2" }], [/^#{3} $/, { estilo: "h3" }], [/^[-*] $/, { lista: "vinetas" }],
          [/^1[.)] $/, { lista: "numeros" }], [/^\[\] $/, { lista: "tareas" }], [/^\[ \] $/, { lista: "tareas" }], [/^> $/, { estilo: "cita" }]];
        for (const [re, a] of reglas) {
          const m = re.exec(ini);
          if (!m) continue;
          const s = leerSel();
          if (s.ini !== p.ini + m[0].length) return;
          comando(() => {
            doc().seq(B, { k: "v", v: false, r: S().rangos(vis.slice(p.ini, p.ini + m[0].length)) }, { origen: "comando" });
            doc().seq(B, { k: "f", a, r: S().rangos([p.mark]) }, { origen: "comando" });
            return { sel: [p.ini, p.ini] };
          });
          return;
        }
      }

      // ------------------------------------------------------------ pegar y soltar
      let pegadoManejado = false;
      cuerpo.addEventListener("paste", async (e) => {
        if (ed.soloLectura || (e.target.closest && e.target.closest("[data-celda]"))) return;
        e.preventDefault();
        pegadoManejado = true;
        setTimeout(() => (pegadoManejado = false), 0);
        const dt = e.clipboardData;
        const archivo = [...(dt.files || [])].find((f) => /^image\//.test(f.type));
        if (archivo) { try { insertarImagenSrc(await NOM.formatos.imagenADataUrl(archivo)); } catch (err) { aviso(err.message, { tipo: "error" }); } return; }
        const h = dt.getData("text/html"), t = dt.getData("text/plain");
        // 1.1 Un enlace pegado sobre texto elegido lo convierte en vínculo.
        if (enlazarSeleccion(leerSel(), t)) return;
        let toks;
        if (h && !e.shiftKey) {
          const d = new DOMParser().parseFromString(h, "text/html");
          toks = tokens(d.body, {});
        } else { const cur = attrsEnCursor(); toks = textoTokens((t || "").replace(/\r\n?/g, "\n"), cur.a, cur.pa); }
        if (!toks.length) return;
        // El último fin de párrafo pegado se une al párrafo donde está el cursor.
        if (toks[toks.length - 1].c === "\n" && !(toks.length === 1)) toks.pop();
        const s = leerSel();
        const meta = metaPegado(toks);
        comando(() => {
          let en = s.ini;
          if (!s.col) { if (modoSug) { borrarSugerido(visPintado.slice(s.ini, s.fin), "pegar", "comando"); actualizarPintado(); en = s.fin; } else borrarRango(s.ini, s.fin, "pegar"); }
          const fin = insertarEn(en, toks, "pegar", meta);
          return { sel: [fin, fin] };
        });
        seguirAlCursor();
      });
      cuerpo.addEventListener("drop", async (e) => {
        const f = [...((e.dataTransfer && e.dataTransfer.files) || [])].find((x) => /^image\//.test(x.type));
        if (!f || ed.soloLectura) return;
        e.preventDefault();
        const pos = document.caretPositionFromPoint ? document.caretPositionFromPoint(e.clientX, e.clientY) : document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
        if (pos) { const n = pos.offsetNode || pos.startContainer, o = pos.offset != null ? pos.offset : pos.startOffset; const i = posDe(n, o); if (i != null) ponerSel(i); }
        try { insertarImagenSrc(await NOM.formatos.imagenADataUrl(f)); } catch (err) { aviso(err.message, { tipo: "error" }); }
      });

      // ------------------------------------------------------------ copiar formato (brocha)
      let brocha = null;
      function copiarFormato(fija) {
        const { a, pa } = attrsEnCursor();
        const car = CAR.filter((k) => !["enlace", "sug", "sugBorrar"].includes(k)), par = PAR.filter((k) => k !== "hecho" && k !== "dueno");
        brocha = { a: Object.assign(Object.fromEntries(car.map((k) => [k, null])), solo(a, car)), pa: Object.assign(Object.fromEntries(par.map((k) => [k, null])), solo(pa, par)), fija };
        raiz.classList.add("brocha");
        aviso(fija ? "Copiar formato fijo: selecciona textos para aplicarlo. Esc para terminar." : "Selecciona el texto al que quieres darle este formato", { ms: 3000 });
      }
      function aplicarBrocha() {
        if (!brocha) return;
        const b = brocha, s = leerSel();
        if (s.col) return;
        formato(b.a);
        const ps = parrafosDeSel(s);
        if (ps.length > 1 || (s.ini <= ps[0].ini && s.fin >= ps[0].fin)) formatoParrafo(b.pa, ps);
        if (!b.fija) { brocha = null; raiz.classList.remove("brocha"); }
      }

      function cambiarMayusculas() {
        const s = leerSel();
        if (s.col) return;
        const its = visPintado.slice(s.ini, s.fin);
        const t = its.map((x) => x.c).join("");
        const nuevo = t === t.toUpperCase() ? t.toLowerCase() : t === t.toLowerCase() ? t.replace(/(^|[\s(¿¡"«])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : t.toUpperCase();
        comando(() => {
          const toks = its.map((x, i) => (x.e || x.c === "\n" ? { c: x.c, pa: S().attrs(x), id: x.e ? x.id : undefined, a: S().attrs(x) } : { c: cps(nuevo)[i], a: S().attrs(x) }));
          borrarRango(s.ini, s.fin);
          insertarEn(s.ini, toks);
          return { sel: [s.ini, s.fin] };
        });
      }

      // ------------------------------------------------------------ página: tamaño, márgenes, zoom y paginación
      function pagina() {
        const c = doc().valor("_doc", "pagina") || {};
        const base = PAGINAS[c.tam] || PAGINAS.carta;
        const hor = c.orient === "h";
        const m = c.margen || {};
        const v = (x) => (typeof x === "number" ? x : 96);
        return { tam: c.tam || "carta", orient: hor ? "h" : "v", w: hor ? base.h : base.w, h: hor ? base.w : base.h, m: { s: v(m.s), i: v(m.i), iz: v(m.iz), d: v(m.d) } };
      }
      /** Formato con el que nació el documento (lo fija el propietario del espacio): fuente, tamaño e interlineado. */
      const formatoBase = () => doc().valor("_doc", "formato") || {};
      const baseTam = () => +formatoBase().tam || 11;
      function aplicarFormato() {
        const fb = formatoBase();
        cuerpo.style.fontFamily = fb.fuente ? cssFuente(fb.fuente) : "";
        cuerpo.style.fontSize = fb.tam ? +fb.tam + "pt" : "";
        if (fb.interlineado) cuerpo.style.setProperty("--wd-li", +fb.interlineado); else cuerpo.style.removeProperty("--wd-li");
        if (+fb.primera) cuerpo.style.setProperty("--wd-primera", +fb.primera + "cm"); else cuerpo.style.removeProperty("--wd-primera");
        cuerpo.classList.toggle("con-fuente", !!fb.fuente);
      }
      function aplicarPagina() {
        aplicarFormato();
        const pg = pagina();
        hoja.style.setProperty("--pw", pg.w + "px");
        hoja.style.setProperty("--ph", pg.h + "px");
        hoja.style.setProperty("--ms", pg.m.s + "px");
        hoja.style.setProperty("--mi", pg.m.i + "px");
        hoja.style.setProperty("--miz", pg.m.iz + "px");
        hoja.style.setProperty("--md", pg.m.d + "px");
        hoja.style.zoom = zoom;
        raiz.dataset.vista = vista;
        estiloImpresion(pg);
        programarPaginar();
      }
      /** 8.2 Encabezado y pie: lo que se ve en pantalla y lo que se imprime (PDF). */
      const encPie = () => {
        const d = doc().valor("_doc", "encabezado") || "", pie = doc().valor("_doc", "pie") || "";
        return {
          enc: d, pie, nums: doc().valor("_doc", "numeros") !== false,
          pos: doc().valor("_doc", "numPos") || "pie-der", fmt: doc().valor("_doc", "numFmt") || "n",
          inicio: +doc().valor("_doc", "numInicio") || 1, primera: !!doc().valor("_doc", "primeraDistinta"),
          encAl: doc().valor("_doc", "encAlin") || "izq", pieAl: doc().valor("_doc", "pieAlin") || "izq",
          logo: doc().valor("_doc", "encabezadoImg") || null, marca: doc().valor("_doc", "marcaAgua") || "",
        };
      };
      const textoNumero = (n, total, fmt) => ({ pagina: `Página ${n}`, total: `${n} de ${total}`, "pagina-total": `Página ${n} de ${total}` }[fmt] || String(n));
      function estiloImpresion(pg) {
        let st = document.getElementById("wd-imprimir");
        if (!st) { st = document.createElement("style"); st.id = "wd-imprimir"; st.setAttribute("data-nom", ""); document.head.append(st); }
        const e = encPie(), q = (s) => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ") + '"';
        const fb = formatoBase();
        const lado = { izq: "left", centro: "center", der: "right" };
        const cajas = {};
        if (e.enc) cajas["top-" + lado[e.encAl]] = q(e.enc);
        if (e.pie) cajas["bottom-" + lado[e.pieAl]] = q(e.pie);
        if (e.nums) {
          const [zona, al] = e.pos.split("-"), k = (zona === "enc" ? "top-" : "bottom-") + lado[al];
          const off = e.inicio - 1, n = off ? `counter(page, decimal)` : "counter(page)";
          const num = { pagina: `"Página " ${n}`, total: `${n} " de " counter(pages)`, "pagina-total": `"Página " ${n} " de " counter(pages)` }[e.fmt] || n;
          cajas[k] = cajas[k] ? cajas[k] + ' "   " ' + num : num;
        }
        const fuente = fb.fuente ? cssFuente(fb.fuente) : "Calibri, Carlito, sans-serif";
        const caja = (k, v) => `@${k} { content: ${v}; font-family: ${fuente}; font-size: ${Math.min(12, +fb.tam || 11)}pt; color: #222; vertical-align: middle; }`;
        st.textContent = `@media print {
          @page { size: ${pg.w}px ${pg.h}px; margin: ${pg.m.s}px ${pg.m.d}px ${pg.m.i}px ${pg.m.iz}px; ${Object.entries(cajas).map(([k, v]) => caja(k, v)).join(" ")} }
          ${e.primera ? `@page :first { ${Object.keys(cajas).map((k) => `@${k} { content: none; }`).join(" ")} }` : ""}
          ${e.inicio > 1 ? `body { counter-reset: page ${e.inicio - 1}; }` : ""}
          .wd-marca-impresa { display: ${e.marca ? "grid" : "none"} !important; }
        }`;
        let m = document.querySelector(".wd-marca-impresa");
        if (e.marca) {
          if (!m) { m = document.createElement("div"); m.className = "wd-marca-impresa"; document.body.append(m); }
          m.textContent = e.marca;
        } else if (m) m.remove();
      }
      let tPag = null;
      function programarPaginar() { clearTimeout(tPag); tPag = setTimeout(paginar, 120); }
      let numPaginas = 1;
      function paginar() {
        const kids = cuerpo.children;
        for (const el of kids) if (el.dataset.empuje) { el.style.marginTop = ""; delete el.dataset.empuje; }
        // 8.2 Los cortes de la paginación anterior se quitan (se calculan de nuevo).
        $$(".wd-corte", cuerpo).forEach((x) => { const p = x.parentNode; x.remove(); if (p) p.normalize(); });
        cuerpo.style.minHeight = "";
        const pg = pagina();
        if (vista !== "paginas") {
          pintarNotasFinales();
          capaPaginas.innerHTML = "";
          numPaginas = Math.max(1, Math.ceil(cuerpo.offsetHeight / pg.h));
          pintarEstado(); pintarCursores();
          if (seguirCursor) { seguirCursor = false; desplazarAlCursor(); }
          return;
        }
        const H = pg.h, paso = H + GAP, util = H - pg.m.s - pg.m.i;
        const tops = [], altos = [];
        for (const el of kids) { tops.push(el.offsetTop); altos.push(el.offsetHeight); }
        // 8.2 Notas al pie: cuánto mide cada una (para dejarle lugar al final de su página).
        const anchoTexto = pg.w - pg.m.iz - pg.m.d;
        const medidor = medirNotas(anchoTexto);
        const notasPag = {};   // página → [{ id, n, texto, alto }]
        const reservado = (p) => (notasPag[p] || []).reduce((s, x) => s + x.alto, 0) + ((notasPag[p] || []).length ? 14 : 0);
        let corr = 0, forzar = null;
        for (let i = 0; i < kids.length; i++) {
          const el = kids[i], top = tops[i] + corr, h = altos[i];
          const pi = Math.floor(top / paso), arriba = pi * paso + pg.m.s;
          const notasEl = $$(".wd-nota[data-obj]", el);
          const altoNotasEl = notasEl.reduce((s, o) => s + medidor(o.dataset.id), 0);
          const abajo = pi * paso + H - pg.m.i - reservado(pi) - (altoNotasEl ? altoNotasEl + (reservado(pi) ? 0 : 14) : 0);
          let destino = null;
          if (forzar != null && top < forzar) destino = forzar;
          else if (top < arriba - 1) destino = arriba;
          else if (top + h > abajo + 1) {
            // Un párrafo que no cabe se parte (si deja al menos 2 líneas en cada página); si no, pasa completo.
            const extra = partirParrafo(el, top, paso, H, pg, reservado, notasEl, medidor);
            if (extra != null) corr += extra;
            else if (h <= util) destino = (pi + 1) * paso + pg.m.s;
          }
          forzar = null;
          let topFinal = top;
          if (destino != null && destino > top) {
            const d = destino - top;
            const base = parseFloat(getComputedStyle(el).marginTop) || 0;
            el.style.marginTop = base + d + "px";
            el.dataset.empuje = d;
            corr += d;
            topFinal = destino;
          }
          // Cada nota va en la página donde quedó su número.
          if (notasEl.length) {
            const er = el.getBoundingClientRect(), k = er.height / (el.offsetHeight || 1) || 1;
            notasEl.forEach((o) => {
              const y = topFinal + (o.getBoundingClientRect().top - er.top) / k;
              const p = Math.floor(y / paso);
              (notasPag[p] = notasPag[p] || []).push({ id: o.dataset.id, n: numerosNotas().get(o.dataset.id), texto: textoNota(o.dataset.id), alto: medidor(o.dataset.id) });
            });
          }
          if (el.querySelector(".wd-salto")) { const t2 = topFinal; forzar = (Math.floor(t2 / paso) + 1) * paso + pg.m.s; }
        }
        tomarRegistros();
        const fin = cuerpo.offsetHeight;
        numPaginas = Math.max(1, Math.ceil((fin + 1) / paso));
        if (forzar != null) numPaginas = Math.max(numPaginas, Math.round((forzar - pg.m.s) / paso) + 1);
        cuerpo.style.minHeight = numPaginas * paso - GAP + "px";
        const e = encPie(), fb = formatoBase();
        const [zonaNum, alNum] = e.pos.split("-");
        const fila = (zona, texto, al, n, extra) => {
          const slots = { izq: "", centro: "", der: "" };
          if (texto) slots[al] += esc(texto);
          if (e.nums && zonaNum === zona) slots[alNum] += (slots[alNum] ? "&emsp;" : "") + esc(textoNumero(n + e.inicio - 1, numPaginas + e.inicio - 1, e.fmt));
          return `<div class="wd-${zona === "enc" ? "enc" : "pie"}">${extra || ""}<span class="izq">${slots.izq}</span><span class="centro">${slots.centro}</span><span class="der">${slots.der}</span></div>`;
        };
        const logo = e.logo && e.logo.src ? `<img class="wd-logo" src="${esc(e.logo.src)}" alt="" style="height:${Math.min(80, +e.logo.alto || 36)}px">` : "";
        const estiloEP = `font-family:${esc(fb.fuente ? cssFuente(fb.fuente) : "Calibri, Carlito, sans-serif")};font-size:${Math.min(12, +fb.tam || 11)}pt`;
        let h = "";
        for (let i = 0; i < numPaginas; i++) {
          const vacia = e.primera && i === 0;
          const notas = notasPag[i] || [];
          const bloqueNotas = notas.length ? `<div class="wd-notas" style="left:${pg.m.iz}px;right:${pg.m.d}px;bottom:${pg.m.i}px">${notas.map((x) => `<div class="wd-nota-pie"><sup>${x.n}</sup> ${esc(x.texto)}</div>`).join("")}</div>` : "";
          h += `<div class="wd-pagina" style="top:${i * paso}px;${estiloEP}">${vacia ? "" : fila("enc", e.enc, e.encAl, i + 1, logo) + fila("pie", e.pie, e.pieAl, i + 1)}${bloqueNotas}${e.marca ? `<div class="wd-marca-agua">${esc(e.marca)}</div>` : ""}</div>`;
        }
        pintarNotasFinales();
        if (capaPaginas.innerHTML !== h) capaPaginas.innerHTML = h;
        pintarEstado();
        pintarCursores();
        if (seguirCursor) { seguirCursor = false; desplazarAlCursor(); }
      }
      /** Mide el alto de cada nota al pie con el ancho del texto (con caché por texto). */
      const cacheAltos = new Map();
      function medirNotas(ancho) {
        let caja = null;
        return (id) => {
          const t = textoNota(id), k = ancho + "|" + t;
          if (cacheAltos.has(k)) return cacheAltos.get(k);
          if (!caja) { caja = document.createElement("div"); caja.className = "wd-notas"; caja.style.cssText = `position:absolute;visibility:hidden;left:0;top:0;width:${ancho}px`; capaPaginas.append(caja); }
          caja.innerHTML = `<div class="wd-nota-pie"><sup>9</sup> ${esc(t || " ")}</div>`;
          const a = caja.offsetHeight + 2;
          cacheAltos.set(k, a);
          if (cacheAltos.size > 500) cacheAltos.clear();
          return a;
        };
      }
      /** Al imprimir, las notas van al final del documento (Chromium no las pone al pie de cada hoja). */
      function pintarNotasFinales() {
        let f = $(".wd-notas-finales", hoja);
        const l = [...numerosNotas().entries()];
        if (!l.length) { if (f) f.remove(); return; }
        if (!f) { f = document.createElement("div"); f.className = "wd-notas-finales"; hoja.append(f); }
        f.innerHTML = `<div class="wd-notas-titulo">Notas</div>` + l.map(([id, n]) => `<p><sup>${n}</sup> ${esc(textoNota(id))}</p>`).join("");
      }
      /**
       * Parte un párrafo que se pasa del final de la página: mete un separador invisible al inicio de
       * la primera línea que no cabe (ocupa todo el renglón), para que el resto empiece en la página
       * siguiente. Deja al menos 2 líneas en cada lado. Devuelve cuánto creció el párrafo, o null si
       * conviene pasarlo completo. El separador no es contenido: no entra al modelo ni se imprime.
       */
      function partirParrafo(el, top, paso, H, pg, reservado, notasEl, medidor) {
        if (vista !== "paginas" || el.querySelector(".wd-obj.bloque, .wd-imagen.libre, .wd-imagen.flota-izq, .wd-imagen.flota-der") || !el.firstChild) return null;
        let creci = 0;
        for (let vuelta = 0; vuelta < 40; vuelta++) {
          const lineas = lineasDe(el);
          if (lineas.length < 4) return creci || null;
          { const er0 = el.getBoundingClientRect(), z0 = er0.height / (el.offsetHeight || 1) || 1;
            notasEl.forEach((o) => { const t = (o.getBoundingClientRect().top - er0.top) / z0; o._linea = lineas.findIndex((l) => t >= l.t - 2 && t < l.b); }); }
          let k = -1, pag = -1;
          for (let j = 0; j < lineas.length; j++) {
            const yT = top + lineas[j].t, yB = top + lineas[j].b, p = Math.floor(yT / paso);
            const notasAntes = notasEl.filter((o) => o._linea != null && o._linea <= j).reduce((s, o) => s + medidor(o.dataset.id), 0);
            const limite = p * paso + H - pg.m.i - reservado(p) - (notasAntes ? notasAntes + 14 : 0);
            if (yB > limite + 1) { k = j; pag = p; break; }
          }
          if (k < 0) return creci;
          const antes = lineas.filter((l, j) => j < k && Math.floor((top + l.t) / paso) === pag).length;
          if (k > 0 && lineas.length - k < 2 && antes >= 3) k = lineas.length - 2;   // sin línea viuda
          const enPagina = lineas.filter((l, j) => j < k && Math.floor((top + l.t) / paso) === pag).length;
          if (enPagina < 2 || lineas.length - k < 2) return creci || null;            // sin línea huérfana
          const destino = (pag + 1) * paso + pg.m.s, alto = destino - (top + lineas[k].t);
          if (alto <= 0) return creci || null;
          const er = el.getBoundingClientRect(), z = er.height / (el.offsetHeight || 1) || 1;
          const punto = inicioDeLinea(el, er.top + lineas[k].t * z);
          if (!punto) return creci || null;
          const corte = document.createElement("span");
          corte.className = "wd-corte";
          corte.contentEditable = "false";
          corte.setAttribute("aria-hidden", "true");
          corte.style.height = alto + "px";
          const antesAlto = el.offsetHeight;
          const rg = document.createRange();
          rg.setStart(punto.node, punto.off);
          rg.insertNode(corte);
          creci += Math.max(0, el.offsetHeight - antesAlto);
        }
        return creci;
      }
      /** El primer carácter de texto que está en la línea que empieza en y (coordenadas de pantalla).
          Funciona aunque el párrafo no esté a la vista (no usa caretRangeFromPoint). */
      function inicioDeLinea(el, y) {
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const r = document.createRange();
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          if (!n.length || (n.parentElement && n.parentElement.closest("[data-obj], .wd-corte"))) continue;
          r.setStart(n, n.length - 1); r.setEnd(n, n.length);
          const ult = r.getBoundingClientRect();
          if (ult.height && ult.top < y - 1) continue;
          let lo = 0, hi = n.length - 1;
          while (lo < hi) {
            const m = (lo + hi) >> 1;
            r.setStart(n, m); r.setEnd(n, m + 1);
            const rc = r.getBoundingClientRect();
            if (rc.height && rc.top >= y - 1) hi = m; else lo = m + 1;
          }
          // No partir un par de sustitución (emojis).
          if (lo > 0 && /[\uDC00-\uDFFF]/.test(n.data[lo])) lo--;
          return { node: n, off: lo };
        }
        return null;
      }
      /** Líneas de un párrafo (arriba, abajo e inicio en x), relativas a su borde de arriba y sin zoom. */
      function lineasDe(el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const er = el.getBoundingClientRect(), z = er.height / (el.offsetHeight || 1) || 1;
        const cortes = $$(".wd-corte", el).map((c) => c.getBoundingClientRect());
        const rects = [...r.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5 && !cortes.some((c) => Math.abs(c.top - x.top) < 1 && Math.abs(c.height - x.height) < 1));
        rects.sort((a, b) => a.top - b.top || a.left - b.left);
        const l = [];
        for (const x of rects) {
          const u = l[l.length - 1];
          if (u && x.top < u.b - Math.min(u.b - u.t, x.bottom - x.top) / 2) { u.b = Math.max(u.b, x.bottom); u.t = Math.min(u.t, x.top); u.x = Math.min(u.x, x.left); }
          else l.push({ t: x.top, b: x.bottom, x: x.left });
        }
        return l.map((y) => ({ t: (y.t - er.top) / z, b: (y.b - er.top) / z, x: y.x }));
      }
      function fijarZoom(z) {
        zoom = Math.max(0.5, Math.min(2, z));
        NOM.guardar("nom.texto", Object.assign(NOM.leer("nom.texto", {}), { zoom }));
        aplicarPagina();
      }
      function fijarVista(v) {
        vista = v;
        NOM.guardar("nom.texto", Object.assign(NOM.leer("nom.texto", {}), { vista: v }));
        aplicarPagina();
      }

      // ------------------------------------------------------------ barra de estado
      function contar() {
        const t = visPintado.map((x) => (x.e ? " " : x.c === SALTO ? "\n" : x.c)).join("");
        const palabras = (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length;
        return { palabras, caracteres: t.replace(/\n/g, "").length, sinEspacios: t.replace(/\s/g, "").length, parrafos: psPintado.filter((p) => p.fin > p.ini).length };
      }
      const pintarEstado = NOM.throttle(() => {
        const c = contar(), s = ultimaSel;
        let sel = "";
        if (!s.col) { const t = visPintado.slice(s.ini, s.fin).map((x) => x.c).join(""); sel = `${(t.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length} de `; }
        const pg = Math.min(numPaginas, Math.max(1, Math.floor((zona.scrollTop || ed.lienzo.scrollTop) / ((pagina().h + GAP) * zoom)) + 1));
        barraEstado.innerHTML = `<button class="wd-e" data-contar>${vista === "paginas" ? `Página ${pg} de ${numPaginas} · ` : ""}${sel}${c.palabras.toLocaleString("es-MX")} ${c.palabras === 1 ? "palabra" : "palabras"}</button>
          <span class="crece"></span>
          <div class="segmentado wd-vistas" role="group" aria-label="Vista"><button data-vista="paginas" aria-pressed="${vista === "paginas"}" data-micro="Diseño de impresión|Páginas como se imprimen.">${ico("file-text", "ico-s")}</button><button data-vista="continua" aria-pressed="${vista === "continua"}" data-micro="Sin páginas|Texto continuo, cómodo en celular.">${ico("scroll-text", "ico-s")}</button></div>
          <button class="icono-btn chico" data-zoom="-" aria-label="Alejar">${ico("minus", "ico-s")}</button><button class="wd-e" data-zoom="1">${Math.round(zoom * 100)}%</button><button class="icono-btn chico" data-zoom="+" aria-label="Acercar">${ico("plus", "ico-s")}</button>`;
      }, 250);
      barraEstado.addEventListener("click", (e) => {
        const z = e.target.closest("[data-zoom]"), v = e.target.closest("[data-vista]");
        if (z) fijarZoom(z.dataset.zoom === "1" ? 1 : zoom + (z.dataset.zoom === "+" ? 0.1 : -0.1));
        else if (v) fijarVista(v.dataset.vista);
        else if (e.target.closest("[data-contar]")) dialogoConteo();
      });
      function dialogoConteo() {
        const c = contar();
        NOM.hoja({ titulo: "Contar palabras", icono: "file-text", cuerpo: `<table class="wd-conteo">
          <tr><td>Páginas</td><td>${numPaginas}</td></tr><tr><td>Palabras</td><td>${c.palabras.toLocaleString("es-MX")}</td></tr>
          <tr><td>Caracteres (con espacios)</td><td>${c.caracteres.toLocaleString("es-MX")}</td></tr><tr><td>Caracteres (sin espacios)</td><td>${c.sinEspacios.toLocaleString("es-MX")}</td></tr>
          <tr><td>Párrafos</td><td>${c.parrafos}</td></tr><tr><td>Tiempo de lectura</td><td>${Math.max(1, Math.round(c.palabras / 200))} min</td></tr></table>` });
      }

      // ------------------------------------------------------------ esquema (títulos)
      const esquema = $("[data-esquema]", raiz);
      const pintarEsquema = NOM.debounce(() => {
        if (esquema.hidden) return;
        const vis = visPintado;
        const l = psPintado.filter((p) => /^(titulo|h[1-3])$/.test(S().attrs(p.mark).estilo || ""));
        $("[data-esquema-lista]", esquema).innerHTML = l.map((p) => { const e = S().attrs(p.mark).estilo; return `<a href="#" data-ir="${esc(p.k)}" class="n${e === "titulo" ? 0 : e.slice(1)}">${esc(vis.slice(p.ini, p.fin).map((x) => (x.e ? "" : x.c)).join("") || "(sin texto)")}</a>`; }).join("")
          || `<p class="suave">Los títulos del documento aparecerán aquí.</p>`;
      }, 200);
      esquema.addEventListener("click", (e) => {
        if (e.target.closest("[data-cerrar-esquema]")) { esquema.hidden = true; NOM.guardar("nom.texto", Object.assign(NOM.leer("nom.texto", {}), { esquema: false })); return; }
        const a = e.target.closest("[data-ir]");
        if (a) { e.preventDefault(); const el = elems.get(a.dataset.ir); if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); const p = psPintado.find((x) => x.k === a.dataset.ir); if (p) { cuerpo.focus({ preventScroll: true }); ponerSel(p.fin); } } }
      });
      function alternarEsquema() {
        esquema.hidden = !esquema.hidden;
        NOM.guardar("nom.texto", Object.assign(NOM.leer("nom.texto", {}), { esquema: !esquema.hidden }));
        pintarEsquema();
      }
      if (pref.esquema && !movil) esquema.hidden = false;

      // ------------------------------------------------------------ buscar y reemplazar
      let panelBuscar = null, hallazgos = [], actual = -1;
      const resaltar = (typeof CSS !== "undefined" && CSS.highlights) ? CSS.highlights : null;
      function buscar(reemplazar) {
        if (ed.soloLectura) reemplazar = false;   // con solo lectura se busca, pero no se reemplaza
        if (panelBuscar) { panelBuscar.classList.toggle("con-reemplazo", !!reemplazar || panelBuscar.classList.contains("con-reemplazo")); $("[data-q]", panelBuscar).select(); return; }
        const s = leerSel();
        const inicial = s.col ? "" : visPintado.slice(s.ini, s.fin).map((x) => x.c).join("").slice(0, 100);
        panelBuscar = html(`<div class="wd-buscar ${reemplazar ? "con-reemplazo" : ""}" role="search">
          <div class="fila"><input data-q placeholder="Buscar en el documento" aria-label="Buscar" value="${esc(inicial)}"><span data-cuenta class="suave">0/0</span>
            <button class="icono-btn chico" data-b="ant" aria-label="Anterior">${ico("chevron-up", "ico-s")}</button><button class="icono-btn chico" data-b="sig" aria-label="Siguiente">${ico("chevron-down", "ico-s")}</button>
            ${ed.soloLectura ? "" : `<button class="icono-btn chico" data-b="mas" aria-label="Reemplazar" data-micro="Reemplazar||Ctrl+H">${ico("replace", "ico-s")}</button>`}<button class="icono-btn chico" data-b="cerrar" aria-label="Cerrar">${ico("x", "ico-s")}</button></div>
          <div class="fila reemplazo"><input data-r placeholder="Reemplazar con" aria-label="Reemplazar con"><button class="btn chico" data-b="uno">Reemplazar</button><button class="btn chico" data-b="todos">Todos</button></div>
          <div class="fila opciones"><label><input type="checkbox" data-mm> Mayúsculas/minúsculas</label><label><input type="checkbox" data-pc> Palabra completa</label></div></div>`);
        ed.vista.append(panelBuscar);
        const q = $("[data-q]", panelBuscar);
        q.addEventListener("input", () => calcularHallazgos(true));
        q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); mover(e.shiftKey ? -1 : 1); } if (e.key === "Escape") cerrarBuscar(); });
        $("[data-r]", panelBuscar).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); reemplazarUno(); } if (e.key === "Escape") cerrarBuscar(); });
        $$("[data-mm],[data-pc]", panelBuscar).forEach((x) => (x.onchange = () => calcularHallazgos(true)));
        panelBuscar.addEventListener("click", (e) => {
          const b = e.target.closest("[data-b]");
          if (!b) return;
          ({ ant: () => mover(-1), sig: () => mover(1), cerrar: cerrarBuscar, mas: () => panelBuscar.classList.toggle("con-reemplazo"), uno: reemplazarUno, todos: reemplazarTodos })[b.dataset.b]();
        });
        q.focus(); q.select();
        calcularHallazgos(true);
      }
      function calcularHallazgos(irAlMasCercano) {
        if (!panelBuscar) return;
        const q = $("[data-q]", panelBuscar).value;
        const mm = $("[data-mm]", panelBuscar).checked, pc = $("[data-pc]", panelBuscar).checked;
        hallazgos = [];
        if (q) {
          const t = visPintado.map((x) => (x.e ? OBJ : x.c)).join("");
          const cp = cps(t);
          // Índices en puntos de código (las posiciones del modelo), no en UTF-16.
          const mapa = []; let u = 0; cp.forEach((c, i) => { mapa[u] = i; u += c.length; }); mapa[u] = cp.length;
          const re = new RegExp((pc ? "(?<![\\p{L}\\p{N}])" : "") + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + (pc ? "(?![\\p{L}\\p{N}])" : ""), "gu" + (mm ? "" : "i"));
          let m;
          while ((m = re.exec(t)) && hallazgos.length < 5000) { hallazgos.push([mapa[m.index], mapa[m.index + m[0].length]]); if (!m[0].length) re.lastIndex++; }
        }
        if (irAlMasCercano) { const p = leerSel().ini; actual = hallazgos.findIndex((h) => h[0] >= p); if (actual < 0) actual = hallazgos.length ? 0 : -1; }
        pintarHallazgos();
      }
      function pintarHallazgos() {
        if (!panelBuscar) return;
        $("[data-cuenta]", panelBuscar).textContent = hallazgos.length ? `${actual + 1}/${hallazgos.length}` : "0/0";
        if (!resaltar) return;
        const todos = [], uno = [];
        hallazgos.slice(0, 1500).forEach((h, i) => { const r = rangoDom(h[0], h[1]); if (r) (i === actual ? uno : todos).push(r); });
        resaltar.set("wd-hallazgo", new Highlight(...todos));
        resaltar.set("wd-hallazgo-actual", new Highlight(...uno));
      }
      function mover(d) {
        if (!hallazgos.length) return;
        actual = (actual + d + hallazgos.length) % hallazgos.length;
        pintarHallazgos();
        const r = rangoDom(...hallazgos[actual]);
        if (r) { const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement; el.scrollIntoView({ block: "center", behavior: "smooth" }); }
      }
      function reemplazarUno() {
        if (actual < 0 || !hallazgos[actual]) return;
        const [a, b] = hallazgos[actual], r = $("[data-r]", panelBuscar).value;
        comando(() => { const at = S().attrs(visPintado[a]); borrarRango(a, b, null); insertarEn(a, textoTokens(r, solo(at, CAR))); return null; });
        calcularHallazgos(false);
        if (actual >= hallazgos.length) actual = 0;
        pintarHallazgos();
      }
      function reemplazarTodos() {
        const r = $("[data-r]", panelBuscar).value, n = hallazgos.length;
        if (!n) return;
        comando(() => {
          for (let i = hallazgos.length - 1; i >= 0; i--) { const [a, b] = hallazgos[i]; const at = S().attrs(visPintado[a]); borrarRango(a, b, "reemplazo"); insertarEn(a, textoTokens(r, solo(at, CAR)), "reemplazo"); }
          return null;
        });
        aviso(`${n} reemplazo(s)`, { tipo: "ok" });
        calcularHallazgos(true);
      }
      function cerrarBuscar() {
        if (!panelBuscar) return;
        panelBuscar.remove(); panelBuscar = null; hallazgos = [];
        if (resaltar) { resaltar.delete("wd-hallazgo"); resaltar.delete("wd-hallazgo-actual"); }
        cuerpo.focus({ preventScroll: true });
      }

      // ------------------------------------------------------------ cursores de los demás
      const enviarCursor = NOM.throttle(() => {
        if (!ed.moverCursor || ed.previa) return;
        const s = getSelection();
        if (!s.rangeCount || !cuerpo.contains(s.anchorNode)) return;
        const id = (i) => (i > 0 && visPintado[i - 1] ? visPintado[i - 1].id : "");
        ed.moverCursor({ a: id(ultimaSel.a), f: id(ultimaSel.f) });
      }, 120);
      function pintarCursores() {
        const otros = (ed.presencia || []).filter((p) => p.cliente !== doc().nodo && p.cursor && p.modo === "TEXTO");
        if (!otros.length) { if (capaCursores.firstChild) capaCursores.innerHTML = ""; return; }
        const base = zona.getBoundingClientRect();
        let h = "";
        otros.forEach((p) => {
          const a = posAncla(p.cursor.a || null), f = posAncla(p.cursor.f || null);
          const color = esc(p.color || "#5B5BD6");
          if (a !== f) {
            const r = rangoDom(a, f);
            if (r) [...r.getClientRects()].slice(0, 200).forEach((c) => { h += `<div class="wd-otro-sel" style="left:${c.left - base.left}px;top:${c.top - base.top}px;width:${c.width}px;height:${c.height}px;background:${color}"></div>`; });
          }
          const rf = rangoDom(f, f);
          if (!rf) return;
          let c = rf.getClientRects()[0] || rf.getBoundingClientRect();
          if (!c || (!c.height && !c.top)) { const pt = puntoDom(f); const el = pt.node.nodeType === 1 ? pt.node : pt.node.parentElement; c = el.getBoundingClientRect(); }
          h += `<div class="wd-otro" style="left:${c.left - base.left}px;top:${c.top - base.top}px;height:${Math.max(16, c.height)}px;--c:${color}"><span>${esc(p.nombre || "")}</span></div>`;
        });
        capaCursores.innerHTML = h;
      }

      // ------------------------------------------------------------ cambios que llegan (de otros, deshacer, tablas…)
      let remotoPend = false, anclaRemota = null;
      function programarRemoto(lista, origen) {
        if (!remotoPend) { anclaRemota = anclarSel(); remotoPend = { deshacer: origen === "deshacer" ? [] : null }; }
        if (remotoPend.deshacer) remotoPend.deshacer.push(...lista.filter((c) => c.seq));
        if (remotoPend.prog) return;
        remotoPend.prog = true;
        queueMicrotask(() => {
          const info = remotoPend; remotoPend = false;
          if (componiendo) { necesitaPintar = true; return; }
          const enfocado = document.activeElement === cuerpo;
          reconciliar();
          if (info.deshacer && info.deshacer.length) {
            // Tras deshacer, el cursor va a donde ocurrió el cambio: donde estaba lo que se quitó,
            // o después de lo que volvió a aparecer.
            const u = info.deshacer[info.deshacer.length - 1].seq;
            if (u.r && u.r.length) {
              const r = u.v === false ? u.r[0] : u.r[u.r.length - 1];
              const id = r[0] === FIN ? FIN : S().clave(u.v === false ? r[1] : r[2], r[0]);
              const pos = id === FIN ? visPintado.length : posAncla(id);
              cuerpo.focus({ preventScroll: true }); ponerSel(pos); desplazarAlCursor();
            }
          } else if (anclaRemota && enfocado) {
            ponerSel(posAncla(anclaRemota.a), posAncla(anclaRemota.f));
          }
          pintarCursores();
          programarReflejo();
        });
      }
      this.cambios = (lista, origen) => {
        if (ed.previa && doc() !== ed.previa.doc) return;
        let seq = false;
        lista.forEach((c) => {
          if (c.seq) { if (origen !== "teclado" && origen !== "comando") seq = true; return; }
          if (c.bloque === "_doc") { if (["pagina", "encabezado", "pie", "numeros", "formato", "numPos", "numFmt", "numInicio", "primeraDistinta", "encAlin", "pieAlin", "encabezadoImg", "marcaAgua"].some((k) => k in c.campos)) aplicarPagina(); return; }
          if (origen === "celda" && c.local) return;
          // Tablas e imágenes del texto: se actualizan en su lugar (sin quitar el foco de una celda).
          $$(`[data-ref="${CSS.escape(c.bloque)}"]`, cuerpo).forEach((o) => {
            // Forma o formato de la tabla: se repinta y el foco vuelve a la celda donde estaba.
            if (Object.keys(c.campos).some((k) => /^(filasTexto|colsTexto|encabezado|bordes)$/.test(k) || /^(n|i|k|r|al|m|aw):/.test(k))) {
              const act = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-celda]");
              const enEsta = act && o.contains(act) ? act.dataset.celda : null;
              pintarTabla(o, doc().bloque(c.bloque), c.bloque);
              if (enEsta) { const el = $(`[data-celda="${enEsta}"]`, o); if (el) el.focus({ preventScroll: true }); }
              return;
            }
            Object.keys(c.campos).filter((k) => k.startsWith("c:")).forEach((k) => {
              const el = $(`[data-celda="${k.slice(2)}"]`, o);
              if (el && document.activeElement !== el) el.textContent = c.campos[k] || "";
            });
          });
          $$(".wd-imagen[data-obj]", cuerpo).forEach((o) => { const it = sec().item(o.dataset.id); if (it && it.e && it.e.ref === c.bloque) llenarObjetos(o.parentNode); });
        });
        if (seq) programarRemoto(lista, origen);
      };
      this.retener = () => componiendo;
      this.pintarCursores = () => pintarCursores();

      // ------------------------------------------------------------ desplazamiento
      /** Rectángulo del cursor. Un renglón vacío (<p><br></p>) no tiene rectángulo de texto:
          se usa el del párrafo. */
      function rectCursor() {
        const s = getSelection();
        if (!s.rangeCount || !cuerpo.contains(s.focusNode)) return null;
        const r = document.createRange();
        try { r.setStart(s.focusNode, s.focusOffset); r.collapse(true); } catch (e) { return null; }
        const c = r.getClientRects()[0];
        if (c && (c.height || c.top)) return c;
        const top = superior(s.focusNode);
        return top ? top.getBoundingClientRect() : null;
      }
      /** Mantiene el cursor a la vista (también sobre la barra de estado, que tapa el borde de abajo). */
      function desplazarAlCursor() {
        const c = rectCursor();
        if (!c) return;
        const v = ed.lienzo.getBoundingClientRect();
        const abajo = Math.min(v.bottom, innerHeight) - (barraEstado.offsetHeight || 0) - 24;
        if (c.bottom > abajo) ed.lienzo.scrollTop += c.bottom - abajo + 40;
        else if (c.top < v.top + 16) ed.lienzo.scrollTop -= v.top + 56 - c.top;
      }
      // Tras escribir o dar Enter, la paginación puede empujar el párrafo a la página siguiente
      // unos milisegundos después: entonces se vuelve a seguir al cursor.
      let seguirCursor = false;
      function seguirAlCursor() { seguirCursor = true; desplazarAlCursor(); }
      ed.lienzo.addEventListener("scroll", NOM.throttle(pintarEstado, 200), { passive: true });
      const ro = new ResizeObserver(() => programarPaginar());
      ro.observe(cuerpo);
      // Si cambia el ancho del área (se abre un panel, gira el teléfono), la hoja se recentra: los cursores de los demás se recolocan.
      const roArea = new ResizeObserver(NOM.throttle(() => pintarCursores(), 120));
      roArea.observe(ed.lienzo);

      // ------------------------------------------------------------ barra de herramientas
      const ctl = {};
      let tRefl = null;
      function programarReflejo() { if (!tRefl) tRefl = requestAnimationFrame(() => { tRefl = null; reflejar(); }); }
      function reflejar() {
        if (!ctl.estilo) return;
        const { a, pa } = attrsEnCursor();
        if (document.activeElement !== ctl.estilo) ctl.estilo.value = pa.estilo || "";
        // Sin fuente propia, el texto usa la del formato del espacio: la lista la nombra así.
        const fbF = formatoBase().fuente || "";
        if (ctl.fuente.dataset.base !== fbF) {
          ctl.fuente.dataset.base = fbF;
          const o0 = ctl.fuente.querySelector('option[value=""]');
          if (o0) o0.textContent = fbF || "Calibri";
          ctl.fuente.querySelectorAll("option").forEach((o) => { if (o.value && o.value !== "_otra") o.hidden = !!fbF && o.value === fbF; });
        }
        if (document.activeElement !== ctl.fuente) ctl.fuente.value = a.fuente && FUENTES[a.fuente] ? a.fuente : a.fuente ? "_otra" : "";
        if (ctl.fuente.value === "_otra" && ctl.fuenteOtra) ctl.fuenteOtra.textContent = a.fuente;
        if (document.activeElement !== ctl.tam) ctl.tam.value = a.tam || { titulo: 28, h1: 16, h2: 13, h3: 12, codigo: 10 }[pa.estilo] || baseTam();
        if (ed.botones && ed.botones.sugerir) ed.botones.sugerir.setAttribute("aria-pressed", modoSug);
        const on = (id, v) => { const b = ed.botones && ed.botones[id]; if (b) b.setAttribute("aria-pressed", !!v); };
        on("negrita", a.b); on("cursiva", a.i); on("subrayado", a.u); on("tachado", a.s);
        on("vinetas", pa.lista === "vinetas"); on("numeros", pa.lista === "numeros"); on("tareas", pa.lista === "tareas");
        on("brocha", !!brocha);
        const al = ed.botones && ed.botones.alinear;
        if (al) al.innerHTML = ico({ centro: "align-center", der: "align-right", just: "align-justify" }[pa.alin] || "align-left");
        if (ed.botones && ed.botones.color) ed.botones.color.style.setProperty("--barra", a.color || "#000000");
        if (ed.botones && ed.botones.resaltar) ed.botones.resaltar.style.setProperty("--barra", a.fondo || "transparent");
        pintarEstado();
      }
      function paleta(ancla, colores, actualC, alElegir, opc) {
        opc = opc || {};
        const s = leerSel();
        const p = html(`<div class="menu wd-paleta" role="dialog" aria-label="${esc(opc.titulo || "Color")}">
          <button class="wd-sin-color" data-c="">${opc.sinColor || "Automático"}</button>
          <div class="wd-muestras">${colores.map((c) => `<button data-c="${c}" style="background:${c}" aria-label="${c}" ${c === actualC ? 'aria-pressed="true"' : ""}></button>`).join("")}</div>
          <label class="wd-otro-color">${ico("palette", "ico-s")} Otro color <input type="color" value="${esc(actualC || "#000000")}"></label></div>`);
        document.body.append(p);
        const r = ancla.getBoundingClientRect();
        p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left)) + "px";
        p.style.top = Math.min(innerHeight - p.offsetHeight - 8, r.bottom + 6) + "px";
        const cerrar = () => { p.remove(); document.removeEventListener("pointerdown", fuera, true); };
        const fuera = (e) => { if (!p.contains(e.target)) cerrar(); };
        setTimeout(() => document.addEventListener("pointerdown", fuera, true), 0);
        const elegir = (c) => { cerrar(); cuerpo.focus({ preventScroll: true }); ponerSel(s.a, s.f); alElegir(c || null); };
        p.addEventListener("pointerdown", (e) => { if (e.target.tagName !== "INPUT") e.preventDefault(); });
        p.addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (b) elegir(b.dataset.c); });
        $("input", p).addEventListener("change", (e) => elegir(e.target.value.toUpperCase()));
      }
      function selectorTabla(ancla) {
        const s = leerSel();
        const p = html(`<div class="menu wd-tabla-sel" role="dialog" aria-label="Insertar tabla"><div class="wd-rejilla">${Array.from({ length: 80 }, (_, i) => `<span data-f="${Math.floor(i / 10) + 1}" data-c="${(i % 10) + 1}"></span>`).join("")}</div><div class="wd-rejilla-t">Elige el tamaño</div></div>`);
        document.body.append(p);
        const r = ancla.getBoundingClientRect();
        p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left)) + "px";
        p.style.top = r.bottom + 6 + "px";
        const cerrar = () => { p.remove(); document.removeEventListener("pointerdown", fuera, true); };
        const fuera = (e) => { if (!p.contains(e.target)) cerrar(); };
        setTimeout(() => document.addEventListener("pointerdown", fuera, true), 0);
        p.addEventListener("pointerover", (e) => {
          const c = e.target.closest("[data-f]");
          if (!c) return;
          $$("[data-f]", p).forEach((x) => x.classList.toggle("on", +x.dataset.f <= +c.dataset.f && +x.dataset.c <= +c.dataset.c));
          $(".wd-rejilla-t", p).textContent = `${c.dataset.c} × ${c.dataset.f}`;
        });
        p.addEventListener("pointerdown", (e) => e.preventDefault());
        p.addEventListener("click", (e) => { const c = e.target.closest("[data-f]"); if (!c) return; cerrar(); cuerpo.focus({ preventScroll: true }); ponerSel(s.a, s.f); insertarTabla(+c.dataset.f, +c.dataset.c); });
      }
      function menuSimbolos(ancla) {
        const s = leerSel();
        const p = html(`<div class="menu wd-simbolos" role="dialog" aria-label="Símbolos">${SIMBOLOS.map((c) => `<button data-s="${esc(c)}">${esc(c)}</button>`).join("")}</div>`);
        document.body.append(p);
        const r = ancla.getBoundingClientRect ? ancla.getBoundingClientRect() : { left: ancla.x, bottom: ancla.y };
        p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left)) + "px";
        p.style.top = Math.min(innerHeight - p.offsetHeight - 8, r.bottom + 6) + "px";
        const cerrar = () => { p.remove(); document.removeEventListener("pointerdown", fuera, true); };
        const fuera = (e) => { if (!p.contains(e.target)) cerrar(); };
        setTimeout(() => document.addEventListener("pointerdown", fuera, true), 0);
        p.addEventListener("pointerdown", (e) => e.preventDefault());
        p.addEventListener("click", (e) => { const b = e.target.closest("[data-s]"); if (!b) return; cerrar(); cuerpo.focus({ preventScroll: true }); ponerSel(s.a, s.f); insertarTexto(b.dataset.s); });
      }
      function menuInsertar(b) {
        NOM.menu(b, [
          { titulo: "Insertar" },
          { texto: "Imagen…", icono: "image", fn: insertarImagen },
          { texto: "Tabla…", icono: "table", fn: () => selectorTabla(b) },
          { texto: "Enlace", icono: "link", atajo: "Ctrl+K", fn: enlace },
          { texto: "Salto de página", icono: "file-plus", atajo: "Ctrl+Enter", fn: () => insertarBloque({ tipo: "salto" }) },
          { texto: "Línea horizontal", icono: "minus", fn: () => insertarBloque({ tipo: "linea" }) },
          { texto: "Índice (tabla de contenido)", icono: "list-tree", fn: () => insertarBloque({ tipo: "indice" }) },
          { texto: "Ecuación…", icono: "sigma", fn: () => dialogoEcuacion(null) },
          { texto: "Nota al pie…", icono: "superscript", fn: () => dialogoNota(null) },
          { texto: "Columnas (dos lado a lado)", icono: "columns-3", fn: () => insertarColumnas(2) },
          { texto: "Fecha de hoy", icono: "calendar", fn: () => insertarTexto(new Date().toLocaleDateString("es-MX", { dateStyle: "long" })) },
          { texto: "Símbolo…", icono: "omega", fn: () => menuSimbolos(b) },
          "-",
          // Fase 9: citas y referencias en APA, y un reporte armado con las fichas.
          { texto: "Cita de una fuente…", icono: "quote", fn: () => NOM.citas && NOM.citas.abrir(ed, "fuentes") },
          { texto: "Referencias en APA", icono: "list-ordered", fn: () => NOM.citas && NOM.citas.insertarReferencias(ed) },
          { texto: "Armar reporte con mis fichas…", icono: "list-tree", fn: () => NOM.citas && NOM.citas.armarReporte(ed) },
          "-",
          { texto: "Contenido de un archivo de Word…", icono: "file-up", fn: insertarWord },
        ]);
      }
      function menuAlinear(b) {
        const pa = attrsEnCursor().pa;
        NOM.menu(b, [{ titulo: "Alinear párrafo" },
          ...[[null, "Izquierda", "align-left", "Ctrl+Mayús+L"], ["centro", "Centrar", "align-center", "Ctrl+Mayús+E"], ["der", "Derecha", "align-right", "Ctrl+Mayús+R"], ["just", "Justificar", "align-justify", "Ctrl+Mayús+J"]]
            .map(([v, t, i, k]) => ({ texto: t, icono: i, atajo: k, marcado: (pa.alin || null) === v, fn: () => formatoParrafo({ alin: v }) }))]);
      }
      function menuInterlineado(b) {
        const pa = attrsEnCursor().pa;
        NOM.menu(b, [{ titulo: "Interlineado" },
          ...[[1, "Sencillo"], [1.15, "1.15 (Word)"], [1.5, "1.5"], [2, "Doble"], [2.5, "2.5"], [3, "Triple"]].map(([v, t]) => ({ texto: t, marcado: (pa.interlineado || 1.15) === v, fn: () => formatoParrafo({ interlineado: v === 1.15 ? null : v }) })),
          "-",
          { texto: pa.antes ? "Quitar espacio antes del párrafo" : "Agregar espacio antes del párrafo", icono: "arrow-up", fn: () => formatoParrafo({ antes: pa.antes ? null : 12 }) },
          { texto: pa.despues === 0 ? "Agregar espacio después del párrafo" : "Quitar espacio después del párrafo", icono: "arrow-down", fn: () => formatoParrafo({ despues: pa.despues === 0 ? null : 0 }) }]);
      }
      function menuMas(b) {
        NOM.menu(b, [
          { titulo: "Formato" },
          { texto: "Tachado", icono: "strikethrough", atajo: "Ctrl+Mayús+X", fn: () => alternar("s") },
          { texto: "Superíndice", icono: "superscript", atajo: "Ctrl+Mayús++", fn: () => formato({ va: attrsEnCursor().a.va === "sup" ? null : "sup" }) },
          { texto: "Subíndice", icono: "subscript", atajo: "Ctrl+=", fn: () => formato({ va: attrsEnCursor().a.va === "sub" ? null : "sub" }) },
          { texto: "MAYÚSCULAS / minúsculas", icono: "case-sensitive", atajo: "Mayús+F3", fn: cambiarMayusculas },
          { texto: "Borrar formato", icono: "remove-formatting", atajo: "Ctrl+\\", fn: borrarFormato },
          { texto: "Párrafo (sangrías, espacio)…", icono: "pilcrow", fn: dialogoParrafo },
          { texto: "Opciones de la lista…", icono: "list-ordered", fn: dialogoLista },
          { titulo: "Documento" },
          { texto: "Buscar y reemplazar", icono: "search", atajo: "Ctrl+H", fn: () => buscar(true) },
          { texto: "Contar palabras", icono: "file-text", fn: dialogoConteo },
          { texto: esquema.hidden ? "Mostrar esquema" : "Ocultar esquema", icono: "list-tree", fn: alternarEsquema },
          { texto: "Configurar página…", icono: "file-cog", fn: dialogoPagina },
          { texto: "Formato del documento…", icono: "type", fn: dialogoFormato },
          { texto: modoSug ? "Apagar el modo sugerencia" : "Modo sugerencia", icono: "pen-line", fn: () => alternarSugerencias() },
          ...(ctx.propietario ? [{ texto: "Asignar párrafos a una persona…", icono: "user-check", fn: () => asignarParrafos() }] : []),
          { texto: "Encabezado y pie de página…", icono: "panel-top", fn: dialogoEncabezado },
          { texto: vista === "paginas" ? "Ver sin páginas" : "Ver como páginas", icono: vista === "paginas" ? "scroll-text" : "file-text", fn: () => fijarVista(vista === "paginas" ? "continua" : "paginas") },
          { texto: "Atajos de teclado", icono: "keyboard", fn: dialogoAtajos },
        ]);
      }
      function dialogoPagina() {
        const pg = pagina(), c = doc().valor("_doc", "pagina") || {};
        const mActual = Object.keys(MARGENES).find((k) => MARGENES[k].v === pg.m.s && pg.m.s === pg.m.i && pg.m.iz === pg.m.d && pg.m.s === pg.m.iz) || "personal";
        const cm = (k) => enCm(pg.m[k]);
        const cuerpoH = html(`<form class="col">
          <div class="campo"><label>Tamaño del papel</label><div class="entrada"><select data-tam>${Object.entries(PAGINAS).map(([k, v]) => `<option value="${k}" ${k === pg.tam ? "selected" : ""}>${v.n}</option>`).join("")}</select></div></div>
          <div class="campo"><label>Orientación</label><div class="segmentado lleno" role="group"><button type="button" data-o="v" aria-pressed="${pg.orient === "v"}">Vertical</button><button type="button" data-o="h" aria-pressed="${pg.orient === "h"}">Horizontal</button></div></div>
          <div class="campo"><label>Márgenes</label><div class="entrada"><select data-m>${Object.entries(MARGENES).map(([k, v]) => `<option value="${k}" ${k === mActual ? "selected" : ""}>${v.n}</option>`).join("")}<option value="personal" ${mActual === "personal" ? "selected" : ""}>Personalizados…</option></select></div></div>
          <div class="fila" data-pers ${mActual === "personal" ? "" : "hidden"} style="flex-wrap:wrap">${[["s", "Arriba"], ["i", "Abajo"], ["iz", "Izquierda"], ["d", "Derecha"]].map(([k, t]) => `<div class="campo" style="flex:1;min-width:110px"><label>${t} (cm)</label><div class="entrada"><input data-mc="${k}" inputmode="decimal" value="${cm(k)}"></div></div>`).join("")}</div></form>`);
        let orient = pg.orient;
        $$("[data-o]", cuerpoH).forEach((b) => (b.onclick = () => { orient = b.dataset.o; $$("[data-o]", cuerpoH).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
        $("[data-m]", cuerpoH).onchange = (e) => { $("[data-pers]", cuerpoH).hidden = e.target.value !== "personal"; };
        const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>Aplicar</button></div>`);
        const h = NOM.hoja({ titulo: "Configurar página", icono: "file-cog", cuerpo: cuerpoH, pie });
        $("[data-no]", pie).onclick = () => h.cerrar();
        $("[data-si]", pie).onclick = (ev) => {
          ev.preventDefault();
          const mk = $("[data-m]", cuerpoH).value;
          let margen = MARGENES[mk] ? { s: MARGENES[mk].v, i: MARGENES[mk].v, iz: MARGENES[mk].v, d: MARGENES[mk].v } : null;
          if (!margen) {
            margen = {};
            for (const k of ["s", "i", "iz", "d"]) {
              const v = parseFloat(String($(`[data-mc="${k}"]`, cuerpoH).value).replace(",", "."));
              if (!(v >= 0 && v <= 8)) return aviso("Los márgenes van de 0 a 8 cm", { tipo: "aviso" });
              margen[k] = Math.round(v * CM);
            }
          }
          doc().cambiar("_doc", { pagina: Object.assign({}, c, { tam: $("[data-tam]", cuerpoH).value, orient, margen }) });
          aplicarPagina();
          h.cerrar();
        };
      }
      /** 8.2 Párrafo: alineación, sangrías (cm), primera línea o francesa, espacio e interlineado. */
      function dialogoParrafo() {
        if (ed.soloLectura) return;
        const ps = parrafosDeSel(), pa = S().attrs(ps[0].mark);
        const especial = +pa.francesa ? "francesa" : pa.primera != null && pa.primera !== "" ? "primera" : "ninguna";
        const cuerpoH = html(`<form class="col">
          <div class="campo"><label>Alineación</label><div class="entrada"><select data-al>${[["", "Izquierda"], ["centro", "Centro"], ["der", "Derecha"], ["just", "Justificado"]].map(([v, t]) => `<option value="${v}" ${(pa.alin || "") === v ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>
          <div class="fila"><div class="campo crece"><label>Sangría izquierda (cm)</label><div class="entrada"><input data-iz inputmode="decimal" value="${esc(pa.sangiz || 0)}"></div></div>
            <div class="campo crece"><label>Derecha (cm)</label><div class="entrada"><input data-der inputmode="decimal" value="${esc(pa.sangder || 0)}"></div></div></div>
          <div class="fila"><div class="campo crece"><label>Especial</label><div class="entrada"><select data-esp><option value="ninguna">Ninguna</option><option value="primera" ${especial === "primera" ? "selected" : ""}>Primera línea</option><option value="francesa" ${especial === "francesa" ? "selected" : ""}>Francesa (referencias APA)</option></select></div></div>
            <div class="campo crece"><label>En (cm)</label><div class="entrada"><input data-esp-cm inputmode="decimal" value="${esc(+pa.francesa || +pa.primera || 1.27)}"></div></div></div>
          <div class="fila"><div class="campo crece"><label>Espacio antes (pt)</label><div class="entrada"><input data-antes inputmode="decimal" value="${esc(pa.antes != null ? pa.antes : 0)}"></div></div>
            <div class="campo crece"><label>Después (pt)</label><div class="entrada"><input data-desp inputmode="decimal" value="${esc(pa.despues != null ? pa.despues : 8)}"></div></div></div>
          <div class="campo"><label>Interlineado</label><div class="entrada"><select data-li>${[["", "1.15 (Word)"], [1, "Sencillo"], [1.5, "1.5 líneas"], [2, "Doble"], [2.5, "2.5"], [3, "Triple"]].map(([v, t]) => `<option value="${v}" ${String(pa.interlineado || "") === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>
          <div class="fila" style="flex-wrap:wrap"><span class="suave chico">Rápido:</span><button type="button" class="btn chico" data-apa>Párrafo APA (1.27 cm, doble)</button><button type="button" class="btn chico" data-ref>Referencia APA (francesa)</button></div></form>`);
        const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>Aplicar</button></div>`);
        const h = NOM.hoja({ titulo: "Párrafo", icono: "pilcrow", cuerpo: cuerpoH, pie });
        const num = (sel, def) => { const v = parseFloat(String($(sel, cuerpoH).value).replace(",", ".")); return isNaN(v) ? def : v; };
        $("[data-apa]", cuerpoH).onclick = () => { $("[data-esp]", cuerpoH).value = "primera"; $("[data-esp-cm]", cuerpoH).value = "1.27"; $("[data-li]", cuerpoH).value = "2"; $("[data-antes]", cuerpoH).value = "0"; $("[data-desp]", cuerpoH).value = "0"; };
        $("[data-ref]", cuerpoH).onclick = () => { $("[data-esp]", cuerpoH).value = "francesa"; $("[data-esp-cm]", cuerpoH).value = "1.27"; $("[data-li]", cuerpoH).value = "2"; $("[data-antes]", cuerpoH).value = "0"; $("[data-desp]", cuerpoH).value = "0"; };
        $("[data-no]", pie).onclick = () => h.cerrar();
        $("[data-si]", pie).onclick = (ev) => {
          ev.preventDefault();
          const esp = $("[data-esp]", cuerpoH).value, ecm = Math.max(0, Math.min(10, num("[data-esp-cm]", 1.27)));
          const iz = Math.max(0, Math.min(15, num("[data-iz]", 0))), der = Math.max(0, Math.min(15, num("[data-der]", 0)));
          const antes = Math.max(0, Math.min(200, num("[data-antes]", 0))), desp = Math.max(0, Math.min(200, num("[data-desp]", 8)));
          formatoParrafo({ alin: $("[data-al]", cuerpoH).value || null, sangiz: iz || null, sangder: der || null, primera: esp === "primera" ? ecm : null, francesa: esp === "francesa" ? ecm : null,
            antes: antes || null, despues: desp === 8 ? null : desp, interlineado: +$("[data-li]", cuerpoH).value || null }, ps);
          h.cerrar();
        };
      }
      /** 8.2 Lista: viñeta o formato de número, empezar en y continuar la numeración. */
      /** Los renglones de la misma lista (seguidos y del mismo tipo) que los elegidos. */
      function parrafosDeLista(ps) {
        const tipo = S().attrs(ps[0].mark).lista, todos = psPintado;
        let i0 = todos.findIndex((p) => p.k === ps[0].k), i1 = todos.findIndex((p) => p.k === ps[ps.length - 1].k);
        if (i0 < 0 || i1 < 0) return ps;
        while (i0 > 0 && S().attrs(todos[i0 - 1].mark).lista === tipo) i0--;
        while (i1 < todos.length - 1 && S().attrs(todos[i1 + 1].mark).lista === tipo) i1++;
        return todos.slice(i0, i1 + 1);
      }
      function dialogoLista() {
        if (ed.soloLectura) return;
        const sel = parrafosDeSel(), pa = S().attrs(sel[0].mark);
        const ps = pa.lista ? parrafosDeLista(sel) : sel;
        if (pa.lista !== "vinetas" && pa.lista !== "numeros") return aviso("Pon el cursor en una lista con viñetas o numerada", { tipo: "info" });
        const num = pa.lista === "numeros";
        const cuerpoH = html(`<form class="col">
          ${num ? `<div class="campo"><label>Formato</label><div class="segmentado" role="group" style="flex-wrap:wrap">${NUMFMTS.map(([v, t]) => `<button type="button" data-fmt="${esc(v)}" aria-pressed="${(pa.numfmt || "") === v || (!pa.numfmt && v === "1.")}">${esc(t)}</button>`).join("")}</div></div>
            <div class="fila"><div class="campo crece"><label>Empezar en</label><div class="entrada"><input data-ini inputmode="numeric" value="${esc(pa.inicio != null ? pa.inicio : "")}" placeholder="Automático"></div></div></div>
            <label class="interruptor"><input type="checkbox" data-cont ${pa.continuar ? "checked" : ""}> Continuar la numeración de la lista anterior</label>`
          : `<div class="campo"><label>Viñeta</label><div class="segmentado" role="group" style="flex-wrap:wrap">${VINETAS.map((v) => `<button type="button" data-vin="${esc(v)}" aria-pressed="${(pa.vineta || "•") === v}" style="min-width:44px;font-size:18px">${esc(v)}</button>`).join("")}</div></div>`}</form>`);
        let fmt = pa.numfmt || "1.", vin = pa.vineta || "•";
        $$("[data-fmt]", cuerpoH).forEach((b) => (b.onclick = () => { fmt = b.dataset.fmt; $$("[data-fmt]", cuerpoH).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
        $$("[data-vin]", cuerpoH).forEach((b) => (b.onclick = () => { vin = b.dataset.vin; $$("[data-vin]", cuerpoH).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
        const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>Aplicar</button></div>`);
        const h = NOM.hoja({ titulo: num ? "Lista numerada" : "Lista con viñetas", icono: num ? "list-ordered" : "list", cuerpo: cuerpoH, pie });
        $("[data-no]", pie).onclick = () => h.cerrar();
        $("[data-si]", pie).onclick = (ev) => {
          ev.preventDefault();
          if (!num) { formatoParrafo((p) => (p.lista === "vinetas" ? { vineta: vin === "•" ? null : vin } : null), ps); h.cerrar(); return; }
          const ini = String($("[data-ini]", cuerpoH).value).trim(), cont = $("[data-cont]", cuerpoH).checked;
          // El formato va en toda la lista; "empezar en" y "continuar", en el primer renglón elegido.
          formatoParrafo((p, x) => (p.lista !== "numeros" ? null : Object.assign({ numfmt: fmt === "1." ? null : fmt }, x.k === sel[0].k ? { inicio: ini !== "" && !isNaN(+ini) ? Math.max(0, +ini) : null, continuar: cont || null } : {})), ps);
          h.cerrar();
        };
      }
      function dialogoFormato() {
        const fb = formatoBase(), esp = (ed.espacio && ed.espacio.formatoBase) || null;
        const cuerpoH = html(`<form class="col">
          <p class="suave" style="font-weight:650">El texto sin formato propio usa esta fuente, este tamaño, este interlineado y esta sangría de primera línea (como el estilo Normal de Word). Para APA: Times New Roman 12, doble y 1.27 cm.</p>
          <div class="campo"><label>Fuente</label><div class="entrada"><select data-f><option value="">Calibri (la de siempre)</option>${Object.keys(FUENTES).filter((f) => f !== "Calibri").map((f) => `<option ${fb.fuente === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></div></div>
          <div class="fila"><div class="campo crece"><label>Tamaño (pt)</label><div class="entrada"><input data-t inputmode="decimal" value="${esc(fb.tam || "")}" placeholder="11"></div></div>
            <div class="campo crece"><label>Primera línea (cm)</label><div class="entrada"><input data-pr inputmode="decimal" value="${esc(fb.primera || "")}" placeholder="0"></div></div>
            <div class="campo crece"><label>Interlineado</label><div class="entrada"><select data-l>${[["", "1.15 (Word)"], [1, "Sencillo"], [1.5, "1.5"], [2, "Doble"]].map(([v, t]) => `<option value="${v}" ${String(fb.interlineado || "") === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select></div></div></div>
          ${esp ? `<button type="button" class="btn chico" data-espacio>${ico("layout-grid", "ico-s")} Usar el formato del espacio (${esc([esp.fuente, esp.tam && esp.tam + " pt", esp.interlineado && "interlineado " + esp.interlineado].filter(Boolean).join(", "))})</button>` : ""}</form>`);
        const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>Aplicar</button></div>`);
        const h = NOM.hoja({ titulo: "Formato del documento", icono: "type", cuerpo: cuerpoH, pie });
        const fijar = (f) => { doc().cambiar("_doc", { formato: f }); aplicarPagina(); reflejar(); h.cerrar(); };
        $("[data-no]", pie).onclick = () => h.cerrar();
        const be = $("[data-espacio]", cuerpoH); if (be) be.onclick = () => fijar(Object.assign({}, esp));
        $("[data-si]", pie).onclick = () => {
          const t = parseFloat(String($("[data-t]", cuerpoH).value).replace(",", "."));
          const pr = parseFloat(String($("[data-pr]", cuerpoH).value).replace(",", "."));
          const f = { fuente: $("[data-f]", cuerpoH).value || null, tam: t >= 6 && t <= 72 ? t : null, interlineado: +$("[data-l]", cuerpoH).value || null, primera: pr > 0 && pr <= 5 ? pr : null };
          fijar(f.fuente || f.tam || f.interlineado || f.primera ? f : null);
        };
      }
      function dialogoEncabezado() {
        const e = encPie();
        const al = (n, v) => `<select data-${n}>${[["izq", "Izquierda"], ["centro", "Centro"], ["der", "Derecha"]].map(([k, t]) => `<option value="${k}" ${v === k ? "selected" : ""}>${t}</option>`).join("")}</select>`;
        let logo = e.logo;
        const cuerpoH = html(`<form class="col">
          <div class="fila"><div class="campo crece"><label for="wd-enc">Encabezado (arriba de cada página)</label><div class="entrada"><input id="wd-enc" maxlength="200" value="${esc(e.enc)}" placeholder="Por ejemplo: el título corto (APA)"></div></div>
            <div class="campo"><label>Lugar</label><div class="entrada">${al("encal", e.encAl)}</div></div></div>
          <div class="fila" style="align-items:center;flex-wrap:wrap"><button type="button" class="btn chico" data-logo>${ico("image", "ico-s")} ${logo ? "Cambiar el logo" : "Poner un logo"}</button>${logo ? `<button type="button" class="btn chico" data-sinlogo>${ico("x", "ico-s")} Quitar el logo</button>` : ""}<span class="suave chico">Imagen pequeña a la izquierda del encabezado (escuela, empresa).</span></div>
          <div class="fila"><div class="campo crece"><label for="wd-pie">Pie de página</label><div class="entrada"><input id="wd-pie" maxlength="200" value="${esc(e.pie)}"></div></div>
            <div class="campo"><label>Lugar</label><div class="entrada">${al("pieal", e.pieAl)}</div></div></div>
          <label class="interruptor"><input type="checkbox" data-num ${e.nums ? "checked" : ""}> Números de página</label>
          <div class="fila" data-opnum style="flex-wrap:wrap"><div class="campo crece"><label>Dónde</label><div class="entrada"><select data-pos>${[["enc-der", "Arriba a la derecha (APA)"], ["enc-centro", "Arriba al centro"], ["enc-izq", "Arriba a la izquierda"], ["pie-der", "Abajo a la derecha"], ["pie-centro", "Abajo al centro"], ["pie-izq", "Abajo a la izquierda"]].map(([k, t]) => `<option value="${k}" ${e.pos === k ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>
            <div class="campo crece"><label>Cómo</label><div class="entrada"><select data-fmt>${[["n", "1"], ["pagina", "Página 1"], ["total", "1 de 5"], ["pagina-total", "Página 1 de 5"]].map(([k, t]) => `<option value="${k}" ${e.fmt === k ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>
            <div class="campo" style="width:110px"><label>Empezar en</label><div class="entrada"><input data-ini inputmode="numeric" value="${e.inicio}"></div></div></div>
          <label class="interruptor"><input type="checkbox" data-primera ${e.primera ? "checked" : ""}> Primera página distinta (la portada va sin encabezado, pie ni número)</label>
          <div class="campo"><label for="wd-marca">Marca de agua (opcional)</label><div class="entrada"><input id="wd-marca" maxlength="40" value="${esc(e.marca)}" placeholder="Por ejemplo: BORRADOR o CONFIDENCIAL"></div></div></form>`);
        const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>Guardar</button></div>`);
        const h = NOM.hoja({ titulo: "Encabezado y pie de página", icono: "panel-top", cuerpo: cuerpoH, pie });
        const verNum = () => { $("[data-opnum]", cuerpoH).hidden = !$("[data-num]", cuerpoH).checked; };
        verNum(); $("[data-num]", cuerpoH).onchange = verNum;
        $("[data-logo]", cuerpoH).onclick = async () => { const img = await ed.pedirImagen(); if (img) { logo = { src: img.src, alto: 36 }; aviso("Logo listo: se guarda al tocar Guardar", { tipo: "ok", ms: 2000 }); } };
        const sl = $("[data-sinlogo]", cuerpoH); if (sl) sl.onclick = () => { logo = null; sl.remove(); };
        $("[data-no]", pie).onclick = () => h.cerrar();
        $("[data-si]", pie).onclick = (ev) => {
          ev.preventDefault();
          const ini = Math.max(1, Math.min(9999, parseInt($("[data-ini]", cuerpoH).value, 10) || 1));
          doc().cambiar("_doc", { encabezado: $("#wd-enc", cuerpoH).value.trim(), pie: $("#wd-pie", cuerpoH).value.trim(), numeros: $("[data-num]", cuerpoH).checked,
            numPos: $("[data-pos]", cuerpoH).value, numFmt: $("[data-fmt]", cuerpoH).value, numInicio: ini === 1 ? null : ini, primeraDistinta: $("[data-primera]", cuerpoH).checked || null,
            encAlin: $("[data-encal]", cuerpoH).value, pieAlin: $("[data-pieal]", cuerpoH).value, encabezadoImg: logo, marcaAgua: $("#wd-marca", cuerpoH).value.trim() || null });
          aplicarPagina();
          h.cerrar();
        };
      }
      function dialogoAtajos() {
        const l = [["Negrita / cursiva / subrayado", "Ctrl+B / I / U"], ["Tachado", "Ctrl+Mayús+X"], ["Título 1, 2, 3 / Normal", "Ctrl+Alt+1, 2, 3 / 0"], ["Alinear izq., centro, der., justificar", "Ctrl+Mayús+L, E, R, J"],
          ["Numeración / viñetas / tareas", "Ctrl+Mayús+7 / 8 / 9"], ["Más o menos sangría", "Tab / Mayús+Tab"], ["Enlace", "Ctrl+K"], ["Salto de página", "Ctrl+Enter"], ["Salto de línea", "Mayús+Enter"],
          ["Agrandar / achicar letra", "Ctrl+] / Ctrl+["], ["Borrar formato", "Ctrl+\\"], ["Copiar / pegar formato", "Ctrl+Alt+C / V"], ["Buscar / reemplazar", "Ctrl+F / Ctrl+H"], ["MAYÚSCULAS ↔ minúsculas", "Mayús+F3"],
          ["Pegar sin formato", "Ctrl+Mayús+V"], ["Ruedita de acciones", "Clic derecho (o mantenerlo)"], ["Menú normal del navegador", "Mayús+clic derecho"], ["Atajos al escribir", "# , ## , - , 1. , [] , > al inicio"]];
        NOM.hoja({ titulo: "Atajos de teclado", icono: "keyboard", cuerpo: `<table class="wd-conteo">${l.map(([a, b]) => `<tr><td>${esc(a)}</td><td><kbd>${esc(b)}</kbd></td></tr>`).join("")}</table>` });
      }
      async function insertarWord() {
        const f = await NOM.formatos.elegirArchivo(".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        if (!f) return;
        try {
          const r = await NOM.ooxml.leerDocx(f);
          const toks = [];
          r.parrafos.forEach((p, i) => {
            p.tramos.forEach((t) => {
              if (t.e) {
                if (t.e.tipo === "imagen") toks.push({ c: OBJ, img: t.e.src, w: t.e.w, h: t.e.h, a: t.a });
                else if (t.e.tipo === "tabla") { const ref = NOM.DocCRDT.nuevoId(); doc().cambiar(ref, Object.assign({ tipo: "tabla", enTexto: true }, t.e.celdas, { filasTexto: t.e.filas, colsTexto: t.e.cols }), { origen: "comando" }); toks.push({ c: OBJ, obj: { tipo: "tabla", ref } }); }
                else if (t.e.tipo === "nota" || t.e.tipo === "ecuacion") { const ref = NOM.DocCRDT.nuevoId(); doc().cambiar(ref, Object.assign({ enTexto: true }, t.e), { origen: "comando" }); toks.push({ c: OBJ, obj: { tipo: t.e.tipo, ref } }); }
                else toks.push({ c: OBJ, obj: { tipo: t.e.tipo } });
              } else cps(t.x).forEach((c) => toks.push({ c, a: t.a || {} }));
            });
            if (i < r.parrafos.length - 1) toks.push({ c: "\n", pa: p.pa || {} });
          });
          const s = leerSel(), meta = metaPegado(toks);
          comando(() => { const fin = insertarEn(s.ini, toks, "pegar", meta); return { sel: [fin, fin] }; });
          if (r.aviso) aviso(r.aviso, { tipo: "aviso", ms: 5000 });
        } catch (e) { aviso(e.message, { tipo: "error" }); }
      }

      const selectEstilo = `<select class="mini-select wd-sel-estilo" aria-label="Estilo de párrafo" data-micro="Estilo|Normal, títulos, cita o código. Atajos: Ctrl+Alt+1, 2, 3.">${ESTILOS.map((s) => `<option value="${s.v || ""}">${s.t}</option>`).join("")}</select>`;
      const selectFuente = `<select class="mini-select wd-sel-fuente" aria-label="Fuente" data-micro="Fuente|Tipo de letra del texto seleccionado."><option value="">Calibri</option>${Object.keys(FUENTES).filter((f) => f !== "Calibri").map((f) => `<option value="${esc(f)}" style="font-family:${esc(cssFuente(f))}">${esc(f)}</option>`).join("")}<option value="_otra" hidden></option></select>`;
      const tamHtml = `<span class="wd-tam" data-micro="Tamaño de letra|En puntos, como en Word.|Ctrl+] / Ctrl+["><button class="icono-btn chico" data-tam="-" aria-label="Reducir tamaño">${ico("minus", "ico-s")}</button><input class="mini-select" inputmode="decimal" aria-label="Tamaño de letra" list="wd-tamanos" size="3"><datalist id="wd-tamanos">${TAMANOS.map((t) => `<option value="${t}">`).join("")}</datalist><button class="icono-btn chico" data-tam="+" aria-label="Aumentar tamaño">${ico("plus", "ico-s")}</button></span>`;
      this._herr = [
        { html: selectEstilo, montar: (n) => { ctl.estilo = n; n.onchange = () => { formatoParrafo({ estilo: n.value || null }); cuerpo.focus({ preventScroll: true }); }; } },
        { html: selectFuente, montar: (n) => { ctl.fuente = n; ctl.fuenteOtra = n.querySelector("[value=_otra]"); n.onchange = () => { if (n.value !== "_otra") formato({ fuente: n.value || null }); cuerpo.focus({ preventScroll: true }); }; } },
        { html: tamHtml, montar: (n) => {
          ctl.tam = $("input", n);
          $$("[data-tam]", n).forEach((b) => { b.addEventListener("pointerdown", (e) => e.preventDefault()); b.onclick = () => cambiarTam(b.dataset.tam === "+" ? 1 : -1); });
          ctl.tam.addEventListener("change", () => { const v = parseFloat(String(ctl.tam.value).replace(",", ".")); if (v > 0 && v <= 400) formato({ tam: Math.round(v * 2) / 2 }); cuerpo.focus({ preventScroll: true }); });
          ctl.tam.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ctl.tam.dispatchEvent(new Event("change")); } });
          // Antes de tocar el texto ya se ve el tamaño del primer párrafo, como en Word.
          ctl.tam.value = baseTam(); programarReflejo();
        } },
        "|",
        { id: "negrita", icono: "bold", micro: "Negrita||Ctrl+B", fn: () => alternar("b") },
        { id: "cursiva", icono: "italic", micro: "Cursiva||Ctrl+I", fn: () => alternar("i") },
        { id: "subrayado", icono: "underline", micro: "Subrayado||Ctrl+U", fn: () => alternar("u") },
        { id: "tachado", icono: "strikethrough", micro: "Tachado||Ctrl+Mayús+X", fn: () => alternar("s"), clase: "solo-escritorio" },
        { id: "color", icono: "baseline", micro: "Color del texto", clase: "wd-con-barra", fn: (e, b) => paleta(b, COLORES, attrsEnCursor().a.color, (c) => formato({ color: c }), { titulo: "Color del texto" }) },
        { id: "resaltar", icono: "highlighter", micro: "Resaltar|Color de fondo del texto, como un marcatextos.", clase: "wd-con-barra", fn: (e, b) => paleta(b, RESALTES.concat(COLORES.slice(18)), attrsEnCursor().a.fondo, (c) => formato({ fondo: c }), { titulo: "Resaltado", sinColor: "Sin resaltado" }) },
        { id: "enlace", icono: "link", micro: "Enlace|Ctrl+clic para abrirlo.|Ctrl+K", fn: enlace },
        "|",
        { id: "alinear", icono: "align-left", micro: "Alinear|Izquierda, centro, derecha o justificado.", fn: (e, b) => menuAlinear(b) },
        { id: "interlineado", icono: "line-spacing", micro: "Interlineado y espacio entre párrafos", fn: (e, b) => menuInterlineado(b) },
        { id: "vinetas", icono: "list", micro: "Viñetas|Atajo: escribe - y espacio al inicio.|Ctrl+Mayús+8", fn: () => alternarLista("vinetas") },
        { id: "numeros", icono: "list-ordered", micro: "Numeración|Atajo: escribe 1. y espacio al inicio.|Ctrl+Mayús+7", fn: () => alternarLista("numeros") },
        { id: "tareas", icono: "list-checks", micro: "Lista de tareas|Casillas para marcar.|Ctrl+Mayús+9", fn: () => alternarLista("tareas") },
        { id: "menos-sangria", icono: "indent-decrease", micro: "Disminuir sangría||Mayús+Tab", fn: () => sangria(-1), clase: "solo-escritorio" },
        { id: "mas-sangria", icono: "indent-increase", micro: "Aumentar sangría||Tab", fn: () => sangria(1), clase: "solo-escritorio" },
        "|",
        { id: "insertar", icono: "plus-square", micro: "Insertar|Imagen, tabla, salto de página, índice, símbolo…", fn: (e, b) => menuInsertar(b) },
        { id: "brocha", icono: "paintbrush", micro: "Copiar formato|Clic: una vez. Doble clic: varias veces.|Ctrl+Alt+C", fn: () => { if (brocha) { brocha = null; raiz.classList.remove("brocha"); reflejar(); } else copiarFormato(false); } },
        { id: "borrar-formato", icono: "remove-formatting", micro: "Borrar formato||Ctrl+\\", fn: borrarFormato, clase: "solo-escritorio" },
        { id: "buscar", icono: "search", micro: "Buscar y reemplazar||Ctrl+F", fn: () => buscar(false) },
        { id: "sugerir", icono: "pen-line", micro: "Modo sugerencia|Lo que escribas o borres queda propuesto; el equipo lo acepta o lo rechaza.", fn: () => alternarSugerencias(), clase: "solo-escritorio" },
        { id: "comentar", icono: "message-square", micro: "Comentar|Comenta el texto elegido. Funciona aunque no haya Internet.", fn: () => NOM.comentarios && NOM.comentarios.nuevo(ed) },
        { id: "investigar", icono: "book-open", micro: "Investigar|Busca en Wikipedia, libros y artículos; haz fichas y cita en APA. Tú escribes; la app pone las citas.", fn: () => NOM.citas && NOM.citas.abrir(ed) },
        { id: "mas-texto", icono: "more-vertical", micro: "Más|Tachado, superíndice, configurar página, encabezado y pie, esquema…", fn: (e, b) => menuMas(b) },
      ];
      // Doble clic en la brocha: modo fijo.
      setTimeout(() => { const b = ed.botones && ed.botones.brocha; if (b) b.addEventListener("dblclick", () => copiarFormato(true)); }, 0);

      // ------------------------------------------------------------ ruedita
      // Sale al mantener presionado (dedo o clic, también en una pausa al seleccionar) o con clic
      // derecho, centrada en el dedo o el cursor. Mismo orden que en los demás editores: negrita,
      // cursiva, subrayado, color, cortar, copiar, estilo, más.
      let selRueda = null;
      function accionesTexto(s) {
        const restaurar = () => { if (document.activeElement !== cuerpo) cuerpo.focus({ preventScroll: true }); ponerSel(s.a, s.f); };
        const con = (fn) => () => { restaurar(); fn(); };
        const a = attrsEnCursor().a;
        const colores = COLORES.filter((_, i) => [0, 9, 10, 13, 15, 17, 2].includes(i)).map((c) => ({ texto: c === "#000000" ? "Automático" : c, corto: " ", color: c, mantener: true, fn: con(() => formato({ color: c === "#000000" ? null : c })) }));
        const resaltes = RESALTES.slice(0, 7).map((c) => ({ texto: c, corto: " ", color: c, mantener: true, fn: con(() => formato({ fondo: c })) })).concat([{ texto: "Sin resaltado", icono: "x", mantener: true, fn: con(() => formato({ fondo: null })) }]);
        return [
          { texto: "Negrita", icono: "bold", marcado: !!a.b, mantener: true, fn: con(() => alternar("b")) },
          { texto: "Cursiva", icono: "italic", marcado: !!a.i, mantener: true, fn: con(() => alternar("i")) },
          { texto: "Subrayado", icono: "underline", marcado: !!a.u, mantener: true, fn: con(() => alternar("u")) },
          { texto: "Color", icono: "baseline", sub: colores.concat([{ texto: "Resaltar", icono: "highlighter", sub: resaltes }]) },
          { texto: "Cortar", icono: "scissors", off: s.col, fn: con(() => document.execCommand("cut")) },
          { texto: "Copiar", icono: "copy", off: s.col, fn: con(() => document.execCommand("copy")) },
          { texto: "Estilo", icono: "heading-1", sub: [
            { texto: "Normal", icono: "pilcrow", mantener: true, fn: con(() => formatoParrafo({ estilo: null })) }, { texto: "Título 1", icono: "heading-1", mantener: true, fn: con(() => formatoParrafo({ estilo: "h1" })) },
            { texto: "Título 2", icono: "heading-2", mantener: true, fn: con(() => formatoParrafo({ estilo: "h2" })) }, { texto: "Título 3", icono: "heading-3", mantener: true, fn: con(() => formatoParrafo({ estilo: "h3" })) },
            { texto: "Viñetas", icono: "list", mantener: true, fn: con(() => alternarLista("vinetas")) }, { texto: "Numeración", icono: "list-ordered", mantener: true, fn: con(() => alternarLista("numeros")) },
            { texto: "Tareas", icono: "list-checks", mantener: true, fn: con(() => alternarLista("tareas")) }, { texto: "Cita", icono: "quote", mantener: true, fn: con(() => formatoParrafo({ estilo: "cita" })) }] },
          { texto: "Más", icono: "more-horizontal", sub: [
            { texto: "Enlace", icono: "link", fn: con(enlace) },
            { texto: "Elegir todo", icono: "text-select", fn: () => { cuerpo.focus({ preventScroll: true }); ponerSel(0, visPintado.length); } },
            { texto: "Pegar", icono: "clipboard-paste", fn: con(pegarPortapapeles) },
            { texto: "Copiar formato", icono: "paintbrush", fn: con(() => copiarFormato(false)) },
            { texto: "Borrar formato", icono: "remove-formatting", mantener: true, fn: con(borrarFormato) },
            { texto: "Tachado", icono: "strikethrough", marcado: !!a.s, mantener: true, fn: con(() => alternar("s")) },
            { texto: "Comentar", icono: "message-square", fn: con(() => NOM.comentarios && NOM.comentarios.nuevo(ed)) },
            ctx.propietario ? { texto: "Asignar párrafo a…", corto: "Asignar", icono: "user-check", fn: con(() => asignarParrafos(parrafosDeSel(s))) }
              : { texto: modoSug ? "Apagar sugerencias" : "Sugerir cambios", corto: modoSug ? "Sin sugerir" : "Sugerir", icono: "pen-line", marcado: modoSug, fn: con(() => alternarSugerencias()) }] },
        ];
      }
      function accionesImagen(o) {
        const id = o.dataset.id, it = sec().item(id), ref = it && it.e && it.e.ref;
        const ancho = (k) => () => { if (ref) doc().cambiar(ref, { w: Math.round(anchoUtil() * k) }); programarPaginar(); };
        const w = ref ? +doc().valor(ref, "w") || 0 : 0, util = anchoUtil();
        const alin = (v) => () => formatoParrafo({ alin: v }, [psPintado[parrafoEn(sec().posicion(id))]]);
        const libre = !!(ref && doc().valor(ref, "libre"));
        const img = $("img", o);
        return [
          { texto: "Ancho completo", corto: "Completa", icono: "maximize-2", marcado: Math.abs(w - util) < 2, mantener: true, fn: ancho(1) },
          { texto: "Mitad", icono: "minimize-2", marcado: Math.abs(w - util / 2) < 2, mantener: true, fn: ancho(0.5) },
          { texto: "Un cuarto", icono: "image", marcado: Math.abs(w - util / 4) < 2, mantener: true, fn: ancho(0.25) },
          libre ? { texto: "En línea con el texto", corto: "En línea", icono: "text-cursor-input", fn: () => ajusteImagen(id, false) }
            : { texto: "Mover libremente", corto: "Libre", icono: "move", fn: () => ajusteImagen(id, true) },
          { texto: "Eliminar", icono: "trash-2", fn: () => { seleccionarImagen(null); quitarObjeto(id); } },
          { texto: "Copiar", icono: "copy", fn: () => { seleccionarImagen(o); document.execCommand("copy"); } },
          { texto: "Alinear", icono: "align-center", off: libre, sub: [
            { texto: "Izquierda", icono: "align-left", fn: alin(null) }, { texto: "Centro", icono: "align-center", fn: alin("centro") }, { texto: "Derecha", icono: "align-right", fn: alin("der") }] },
          { texto: "Más", icono: "more-horizontal", sub: [
            { texto: "Recortar…", icono: "scissors", fn: () => dialogoRecorte(id) },
            { texto: "Girar 90°", icono: "rotate-cw", mantener: true, fn: () => girarImagen(id) },
            { texto: "Pie de imagen…", corto: "Pie…", icono: "type", fn: () => pieDeImagen(id) },
            { texto: "Texto alternativo…", corto: "Alt…", icono: "eye", fn: () => textoAlternativo(id) },
            { texto: "Texto alrededor", corto: "Ajuste", icono: "wrap-text", sub: [
              { texto: "En línea", icono: "text-cursor-input", fn: () => ajusteTexto(id, "linea") }, { texto: "Cuadrado a la izquierda", corto: "Izquierda", icono: "align-left", fn: () => ajusteTexto(id, "izq") },
              { texto: "Cuadrado a la derecha", corto: "Derecha", icono: "align-right", fn: () => ajusteTexto(id, "der") }, { texto: "Libre (delante del texto)", corto: "Libre", icono: "move", fn: () => ajusteTexto(id, "libre") }] },
            { texto: "Cortar", icono: "scissors", fn: () => { seleccionarImagen(o); document.execCommand("cut"); } },
            { texto: "Descargar", icono: "download", off: !img, fn: () => { const l = document.createElement("a"); l.href = img.src; l.download = "imagen"; l.click(); } }] },
        ];
      }
      NOM.rueda.enlazar(cuerpo, (e) => {
        if (ed.soloLectura) return null;
        const o = e.target.closest && e.target.closest("[data-obj]");
        if (o && o.classList.contains("wd-imagen")) { seleccionarImagen(o); const l = accionesImagen(o); l.titulo = "Imagen"; return l; }
        return accionesTexto(selRueda || leerSel());
      }, {
        titulo: "Texto",
        // Con el clic, una pausa mientras se arrastra para seleccionar también la saca (menos sobre
        // una imagen: ahí moverse es arrastrarla).
        rearmar: (e) => !(e.target.closest && e.target.closest(".wd-imagen")),
        // Con el dedo, la pulsación larga del sistema elige la palabra y la rueda sale con ella. Si
        // ya había una selección (o es una imagen) y se mantiene sobre ella, se conserva.
        tactilPorSistema: true,
        alPulsacionLarga: (e) => {
          const o = e.target.closest && e.target.closest(".wd-imagen");
          if (o) { seleccionarImagen(o); return "propia"; }
          const s = getSelection();
          if (s.rangeCount && !s.isCollapsed && cuerpo.contains(s.anchorNode)) {
            const rs = Array.from(s.getRangeAt(0).getClientRects());
            if (rs.some((r) => e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6)) return "propia";
          }
          return "sistema";
        },
        alPreparar: () => { selRueda = leerSel(); setTimeout(() => (selRueda = null), 0); },
        ignorar: (e) => !!(e.target.closest && (e.target.closest("[data-celda]") || e.target.closest("[data-tirador]"))),
        puntoTeclado: () => { const s = getSelection(); return s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : cuerpo.getBoundingClientRect(); },
      });
      // Un dedo sostiene la selección y otro toca más allá: la selección llega hasta ese punto
      // (como Mayús + clic con el mouse).
      const dedos = new Set();
      cuerpo.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "touch") return;
        if (dedos.size === 1 && !ed.soloLectura) {
          const i = posEnPunto(e.clientX, e.clientY), s = leerSel();
          if (i != null) {
            e.preventDefault(); e.stopPropagation();
            if (i < s.ini) ponerSel(s.fin, i); else ponerSel(s.ini, i);
            if (navigator.vibrate) navigator.vibrate(8);
          }
        }
        dedos.add(e.pointerId);
      }, true);
      ["pointerup", "pointercancel"].forEach((t) => cuerpo.addEventListener(t, (e) => dedos.delete(e.pointerId), true));
      async function pegarPortapapeles() {
        try {
          const s0 = leerSel();
          // 1.1 También con "Pegar" de la ruedita (celular y app): un enlace sobre texto elegido es vínculo.
          if (!s0.col && navigator.clipboard && navigator.clipboard.readText) {
            let t0 = "";
            try { t0 = await navigator.clipboard.readText(); } catch (e) { t0 = ""; }
            if (enlazarSeleccion(s0, t0)) return;
          }
          if (navigator.clipboard && navigator.clipboard.read) {
            const items = await navigator.clipboard.read();
            for (const it of items) {
              if (it.types.includes("text/html")) {
                const h = await (await it.getType("text/html")).text(); const d = new DOMParser().parseFromString(h, "text/html"); const toks = tokens(d.body, {});
                if (toks.length && toks[toks.length - 1].c === "\n") toks.pop();
                const s = leerSel(), meta = metaPegado(toks);
                comando(() => { if (!s.col) borrarRango(s.ini, s.fin); const fin = insertarEn(s.ini, toks, "pegar", meta); return { sel: [fin, fin] }; });
                return;
              }
            }
          }
          const t = await navigator.clipboard.readText();
          if (t) {
            const s = leerSel(), cur = attrsEnCursor(), toks = textoTokens(t.replace(/\r\n?/g, "\n"), cur.a, cur.pa), meta = metaPegado(toks);
            comando(() => { if (!s.col) borrarRango(s.ini, s.fin, "pegar"); const fin = insertarEn(s.ini, toks, "pegar", meta); return { sel: [fin, fin] }; });
            seguirAlCursor();
          }
        } catch (e) { aviso("El navegador no dejó leer el portapapeles. Usa Ctrl+V.", { tipo: "info" }); }
      }

      // ------------------------------------------------------------ arranque
      ed.seleccionar(B);
      aplicarPagina();
      reconciliar();
      if (!ed.soloLectura && !ed.previa && matchMedia("(hover: hover)").matches) {
        setTimeout(() => {
          cuerpo.focus({ preventScroll: true });
          const vacio = visPintado.length === 0;
          ponerSel(vacio ? 0 : 0);
        }, 60);
      }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(programarPaginar);
      mo.observe(cuerpo, { childList: true, subtree: true, characterData: true });

      this.desmontar = () => {
        mo.disconnect();
        ro.disconnect(); roArea.disconnect();
        clearTimeout(tPag);
        document.removeEventListener("selectionchange", selDeb);
        cerrarBuscar();
        ed.lienzo.classList.remove("con-wd");
        pendCeldas.forEach((f) => f.ya());
      };
      void self;
    },
    herramientas() { return this._herr || []; },
    acciones() {
      const a = [];
      if (NOM.citas && this.textoApi) {
        const ed = NOM.editorActual;
        a.push({ texto: "Investigar (Wikipedia, libros y artículos)", icono: "book-open", fn: () => NOM.citas.abrir(ed), claves: "buscar fuentes fichas citar wikipedia libros articulos investigacion" });
        a.push({ texto: "Fichas de trabajo", icono: "notebook-pen", fn: () => NOM.citas.abrir(ed, "fichas"), claves: "ficha textual parafrasis resumen" });
        a.push({ texto: "Agregar una fuente o citar", icono: "quote", fn: () => NOM.citas.abrir(ed, "fuentes"), claves: "cita apa doi isbn bibliografia referencia" });
        a.push({ texto: "Poner las referencias en APA", icono: "list-ordered", fn: () => NOM.citas.insertarReferencias(ed), claves: "bibliografia apa referencias lista" });
        a.push({ texto: "Armar reporte con mis fichas", icono: "list-tree", fn: () => NOM.citas.armarReporte(ed), claves: "reporte investigacion portada indice secciones" });
        if (NOM.datos) {
          a.push({ texto: "Convertir en presentación", icono: "presentation", fn: () => NOM.datos.aPresentacion(ed), claves: "diapositivas exposicion generar" });
          a.push({ texto: "Convertir en mapa mental", icono: "brain", fn: () => NOM.datos.aMapaMental(ed), claves: "diagrama esquema ideas generar" });
          a.push({ texto: "Combinar correspondencia", icono: "mail", fn: () => NOM.datos.combinarCorrespondencia(ed), claves: "cartas constancias diplomas campos hoja combinar" });
        }
      }
      if (this.sugerencias) a.push({ texto: this.sugerencias.activo() ? "Apagar el modo sugerencia" : "Modo sugerencia (proponer cambios)", icono: "pen-line", fn: () => this.sugerencias.alternar(), claves: "sugerir control de cambios revisar" });
      return a;
    },
  };

  NOM.textoRico = { parrafosDe, asegurarSecuencia, tokens, envolver, BLOQUE: B, cssFuente, FUENTES };
})();
