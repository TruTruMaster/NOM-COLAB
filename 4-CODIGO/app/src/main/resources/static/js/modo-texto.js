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
  const CAR = ["b", "i", "u", "s", "va", "color", "fondo", "fuente", "tam", "enlace"];
  const PAR = ["estilo", "alin", "lista", "nivel", "hecho", "sangria", "interlineado", "antes", "despues"];
  const PAGINAS = { carta: { n: "Carta (21.6 × 27.9 cm)", w: 816, h: 1056 }, a4: { n: "A4 (21 × 29.7 cm)", w: 794, h: 1123 }, oficio: { n: "Oficio (21.6 × 35.6 cm)", w: 816, h: 1344 } };
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
    // Numeración de listas: contador por nivel; se reinicia cuando la lista se interrumpe.
    const cont = [];
    ps.forEach((p) => {
      const pa = S().attrs(p.mark);
      if (pa.lista === "numeros") {
        const nv = pa.nivel || 0;
        cont.length = nv + 1;
        cont[nv] = (cont[nv] || 0) + 1;
        p.num = numeral(cont[nv], nv);
      } else if (pa.lista !== "vinetas" && pa.lista !== "tareas") cont.length = 0;
    });
    return ps;
  }
  function numeral(n, nivel) {
    const t = nivel % 3;
    if (t === 1) { let s = ""; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s + "."; }
    if (t === 2) { const r = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]]; let s = ""; let k = n; for (const [v, l] of r) while (k >= v) { s += l; k -= v; } return s + "."; }
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
    if (+pa.sangria) { at += ` data-sangria="${+pa.sangria}"`; st += `--sang:${+pa.sangria};`; }
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
    if (!h) h = "<br>";
    else if (p.fin > p.ini && vis[p.fin - 1].c === SALTO) h += "<br>";
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
        const it = vis[i], a = S().attrs(it);
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
        const pa = { h1: { estilo: "h1" }, h2: { estilo: "h2" }, cita: { estilo: "cita" }, lista: { lista: "vinetas" }, tarea: { lista: "tareas", hecho: !!b.hecho } }[b.estilo] || {};
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
      const mo = new MutationObserver(() => {});

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
        mo.takeRecords();
        pintando = false;
        actualizarIndices();
        programarPaginar();
        pintarEsquema();
      }

      /** Lo que se dibuja dentro de los objetos (no forma parte del html del párrafo). */
      function llenarObjetos(raizEl) {
        $$("[data-obj]", raizEl).forEach((o) => {
          const it = sec().item(o.dataset.id);
          if (!it || !it.e) return;
          const e = it.e, bl = e.ref ? doc().bloque(e.ref) : null;
          if (e.tipo === "imagen") {
            const src = (bl && bl.src) || e.src || "";
            const w = (bl && bl.w) || e.w || 320;
            o.innerHTML = `<img src="${esc(src)}" alt="${esc((bl && bl.alt) || "")}" draggable="false" style="width:${+w}px">${ed.soloLectura ? "" : '<span class="wd-tirador" data-tirador title="Arrastra para cambiar el tamaño"></span>'}`;
          } else if (e.tipo === "tabla") pintarTabla(o, bl, e.ref);
          else if (e.tipo === "salto") o.innerHTML = `<span>Salto de página</span>`;
          else if (e.tipo === "linea") o.innerHTML = `<hr>`;
          else if (e.tipo === "indice") pintarIndice(o);
        });
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
      function insertarTokens(iz, toks, origen, grupo) {
        let i = 0;
        while (i < toks.length) {
          const t = toks[i];
          if (t.c === OBJ) {
            const e = objetoDe(t);
            if (e) { const r = doc().seq(B, { k: "i", iz, x: OBJ, e, a: limpio(solo(t.a, CAR)) }, { origen, grupo }); if (r) iz = S().clave(r.t, r.n); }
            i++; continue;
          }
          if (t.c === "\n") {
            const r = doc().seq(B, { k: "i", iz, x: "\n", a: limpio(solo(t.pa, PAR)) }, { origen, grupo });
            if (r) iz = S().clave(r.t, r.n);
            i++; continue;
          }
          const k = claveA(solo(t.a, CAR));
          let j = i, x = "";
          while (j < toks.length && toks[j].c !== OBJ && toks[j].c !== "\n" && claveA(solo(toks[j].a, CAR)) === k) { x += toks[j].c; j++; }
          const r = doc().seq(B, { k: "i", iz, x, a: limpio(solo(t.a, CAR)) }, { origen, grupo });
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
        while (p < lv && p < ln && idV(viejos[p]) === idN(nuevos[p])) p++;
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
        if (borrar.length) doc().seq(B, { k: "v", v: false, r: S().rangos(borrar) }, { origen, grupo });
        if (meter.length && base + p !== finEdicion) cortarPaso();
        if (meter.length && /\s/.test(meter[meter.length - 1].c || "") && !/\s/.test((visPintado[base + p - 1] || {}).c || " ")) cortarPaso();
        finEdicion = base + p + meter.length;
        if (meter.length) {
          if (pendiente && !borrar.length && base + p === pendiente.pos) {
            meter.forEach((t) => { if (t.c !== "\n") t.a = Object.assign({}, t.a, pendiente.a); });
            pendiente.pos += meter.length;
            pendiente.usado = true;
          }
          insertarTokens(iz, meter, origen, grupo);
        }
        // Formato: los caracteres seguidos con el mismo cambio van en una sola operación.
        let g = null;
        const grupos = [];
        formatos.forEach((f) => { const k = JSON.stringify(f.d); if (g && g.k === k) g.its.push(f.it); else { g = { k, d: f.d, its: [f.it] }; grupos.push(g); } });
        grupos.forEach((x) => doc().seq(B, { k: "f", a: x.d, r: S().rangos(x.its) }, { origen, grupo }));
        return true;
      }

      function sincronizar(e) {
        if (pintando || ed.soloLectura) { mo.takeRecords(); return; }
        const recs = mo.takeRecords().filter((r) => !(r.target.nodeType === 1 ? r.target : r.target.parentElement || cuerpo).closest("[data-obj]") || r.target === cuerpo);
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
      function canonizar(el, p) {
        const h = htmlParrafo(visPintado, p);
        cache.set(p.k, h);
        el.normalize();
        const t = crearEl(h);
        if (iguales(el, t) || (el.tagName === t.tagName && mismosHijos(el, t) && el.getAttribute("data-k") === p.k)) { mo.takeRecords(); return; }
        const sel = leerSel();
        pintando = true;
        if (el.dataset.empuje) { t.style.marginTop = el.style.marginTop; t.dataset.empuje = el.dataset.empuje; }
        el.replaceWith(t);
        elems.set(p.k, t);
        llenarObjetos(t);
        idxEl.set(t, indiceHijo(t));
        mo.takeRecords();
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
      function insertarEn(i, toks, grupo) {
        const iz = i > 0 ? visPintado[i - 1].id : null;
        insertarTokens(iz, toks, "comando", grupo);
        actualizarPintado();
        return i + toks.length;
      }
      const textoTokens = (t, a) => cps(t).map((c) => (c === "\n" ? { c: "\n", pa: {} } : { c, a: a || {} }));

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
        const t = attrsEnCursor().a.tam || 11;
        let n;
        if (delta > 0) n = TAMANOS.find((x) => x > t) || Math.min(400, t + 10);
        else n = [...TAMANOS].reverse().find((x) => x < t) || Math.max(1, t - 1);
        formato({ tam: n });
      }

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
        desplazarAlCursor();
      }
      function insertarTexto(t, a) {
        sincronizar();
        const s = leerSel();
        comando(() => {
          if (!s.col) borrarRango(s.ini, s.fin, grupoEscritura());
          const fin = insertarEn(s.ini, textoTokens(t, a || attrsEnCursor().a), grupoEscritura());
          finEdicion = fin;
          return { sel: [fin, fin] };
        });
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

      // ------------------------------------------------------------ tablas en el texto
      function pintarTabla(o, b, ref) {
        o.dataset.ref = ref;
        if (!b) { o.innerHTML = `<span class="wd-falta">Tabla no disponible</span>`; return; }
        const filas = Math.min(Math.max(1, b.filasTexto || 3), 200), cols = Math.min(Math.max(1, b.colsTexto || 3), 20);
        let h = `<table class="wd-tab ${b.encabezado ? "con-cab" : ""}"><tbody>`;
        for (let f = 0; f < filas; f++) {
          h += "<tr>";
          for (let c = 0; c < cols; c++) {
            const r = NOM.formulas.ref(c, f);
            h += `<td><div class="wd-celda" data-celda="${r}" ${ed.soloLectura ? "" : 'contenteditable="true"'} spellcheck="true">${esc(b["c:" + r] || "")}</div></td>`;
          }
          h += "</tr>";
        }
        h += "</tbody></table>";
        if (!ed.soloLectura) h += `<span class="wd-tab-ctl"><button data-t="fila" title="Agregar fila">${ico("plus", "ico-s")} Fila</button><button data-t="col" title="Agregar columna">${ico("plus", "ico-s")} Columna</button><button data-t="menos-fila" title="Quitar la última fila">${ico("minus", "ico-s")} Fila</button><button data-t="menos-col" title="Quitar la última columna">${ico("minus", "ico-s")} Col.</button><button data-t="borrar" title="Eliminar tabla">${ico("trash-2", "ico-s")}</button></span>`;
        o.innerHTML = h;
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
      cuerpo.addEventListener("keydown", (e) => {
        const cel = e.target.closest && e.target.closest("[data-celda]");
        if (!cel) return;
        e.stopPropagation();
        if (e.key !== "Tab" && !(e.key === "Enter" && !e.shiftKey)) return;
        e.preventDefault();
        const td = cel.closest("td"), tr = td.parentElement, i = [...tr.children].indexOf(td);
        let sig = e.key === "Enter" ? tr.nextElementSibling && tr.nextElementSibling.children[i]
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
      raiz.addEventListener("click", (e) => {
        const b = e.target.closest(".wd-tab-ctl button");
        if (!b || ed.soloLectura) return;
        const o = b.closest("[data-obj]"), ref = o.dataset.ref, bl = doc().bloque(ref) || {};
        const f = bl.filasTexto || 3, c = bl.colsTexto || 3;
        if (b.dataset.t === "fila") doc().cambiar(ref, { filasTexto: f + 1 });
        else if (b.dataset.t === "col") doc().cambiar(ref, { colsTexto: Math.min(20, c + 1) });
        else if (b.dataset.t === "menos-fila" && f > 1) doc().cambiar(ref, { filasTexto: f - 1 });
        else if (b.dataset.t === "menos-col" && c > 1) doc().cambiar(ref, { colsTexto: c - 1 });
        else if (b.dataset.t === "borrar") quitarObjeto(o.dataset.id);
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

      // ------------------------------------------------------------ imágenes: seleccionar y cambiar tamaño
      let imgSel = null;
      function seleccionarImagen(o) {
        if (imgSel) imgSel.classList.remove("sel");
        imgSel = o;
        if (o) {
          o.classList.add("sel");
          const r = document.createRange();
          r.selectNode(o);
          const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        }
      }
      cuerpo.addEventListener("pointerdown", (e) => {
        const tir = e.target.closest("[data-tirador]");
        const o = e.target.closest(".wd-imagen");
        if (tir && o && !ed.soloLectura) {
          e.preventDefault();
          const img = $("img", o), w0 = img.offsetWidth, x0 = e.clientX, it = sec().item(o.dataset.id);
          const mover = (ev) => { img.style.width = Math.max(24, Math.min(anchoUtil(), Math.round(w0 + (ev.clientX - x0) / zoom))) + "px"; };
          const soltar = () => {
            removeEventListener("pointermove", mover); removeEventListener("pointerup", soltar);
            if (it && it.e && it.e.ref) doc().cambiar(it.e.ref, { w: parseInt(img.style.width, 10) });
            programarPaginar();
          };
          addEventListener("pointermove", mover); addEventListener("pointerup", soltar);
          return;
        }
        if (o) { e.preventDefault(); seleccionarImagen(o); return; }
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
        const a = e.target.closest("a[href]");
        if (a && cuerpo.contains(a) && (e.ctrlKey || e.metaKey || ed.soloLectura)) { e.preventDefault(); window.open(a.href, "_blank", "noopener"); return; }
        const ir = e.target.closest("[data-ir]");
        if (ir) { e.preventDefault(); const el = elems.get(ir.dataset.ir); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
      });

      // ------------------------------------------------------------ teclado
      cuerpo.addEventListener("beforeinput", (e) => {
        if (ed.soloLectura) return;
        if (e.target.closest && e.target.closest("[data-celda]")) return;
        switch (e.inputType) {
          case "insertParagraph": e.preventDefault(); enter(); break;
          case "insertLineBreak": e.preventDefault(); insertarTexto(SALTO); break;
          case "historyUndo": e.preventDefault(); ed.deshacer(); break;
          case "historyRedo": e.preventDefault(); ed.rehacer(); break;
          case "formatBold": e.preventDefault(); alternar("b"); break;
          case "formatItalic": e.preventDefault(); alternar("i"); break;
          case "formatUnderline": e.preventDefault(); alternar("u"); break;
          case "formatStrikeThrough": e.preventDefault(); alternar("s"); break;
          case "insertFromPaste": case "insertFromPasteAsQuotation": if (pegadoManejado) e.preventDefault(); break;
          default: if (imgSel && /^delete/.test(e.inputType)) { e.preventDefault(); const id = imgSel.dataset.id; seleccionarImagen(null); quitarObjeto(id); }
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
        const top = superior(getSelection().focusNode);
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
        let toks;
        if (h && !e.shiftKey) {
          const d = new DOMParser().parseFromString(h, "text/html");
          toks = tokens(d.body, {});
        } else toks = textoTokens((t || "").replace(/\r\n?/g, "\n"), attrsEnCursor().a);
        if (!toks.length) return;
        // El último fin de párrafo pegado se une al párrafo donde está el cursor.
        if (toks[toks.length - 1].c === "\n" && !(toks.length === 1)) toks.pop();
        const s = leerSel();
        comando(() => {
          if (!s.col) borrarRango(s.ini, s.fin, "pegar");
          const fin = insertarEn(s.ini, toks, "pegar");
          return { sel: [fin, fin] };
        });
        desplazarAlCursor();
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
        brocha = { a: Object.assign(Object.fromEntries(CAR.filter((k) => k !== "enlace").map((k) => [k, null])), solo(a, CAR.filter((k) => k !== "enlace"))), pa: Object.assign(Object.fromEntries(PAR.filter((k) => k !== "hecho").map((k) => [k, null])), solo(pa, PAR.filter((k) => k !== "hecho"))), fija };
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
      function aplicarPagina() {
        const pg = pagina();
        hoja.style.setProperty("--pw", pg.w + "px");
        hoja.style.setProperty("--ph", pg.h + "px");
        hoja.style.setProperty("--ms", pg.m.s + "px");
        hoja.style.setProperty("--mi", pg.m.i + "px");
        hoja.style.setProperty("--miz", pg.m.iz + "px");
        hoja.style.setProperty("--md", pg.m.d + "px");
        hoja.style.zoom = zoom;
        raiz.dataset.vista = vista;
        programarPaginar();
      }
      let tPag = null;
      function programarPaginar() { clearTimeout(tPag); tPag = setTimeout(paginar, 120); }
      let numPaginas = 1;
      function paginar() {
        const kids = cuerpo.children;
        for (const el of kids) if (el.dataset.empuje) { el.style.marginTop = ""; delete el.dataset.empuje; }
        cuerpo.style.minHeight = "";
        const pg = pagina();
        if (vista !== "paginas") {
          capaPaginas.innerHTML = "";
          numPaginas = Math.max(1, Math.ceil(cuerpo.offsetHeight / pg.h));
          pintarEstado(); pintarCursores();
          return;
        }
        const H = pg.h, paso = H + GAP, util = H - pg.m.s - pg.m.i;
        const tops = [], altos = [];
        for (const el of kids) { tops.push(el.offsetTop); altos.push(el.offsetHeight); }
        let corr = 0, forzar = null;
        for (let i = 0; i < kids.length; i++) {
          const el = kids[i], top = tops[i] + corr, h = altos[i];
          const pi = Math.floor(top / paso), arriba = pi * paso + pg.m.s, abajo = pi * paso + H - pg.m.i;
          let destino = null;
          if (forzar != null && top < forzar) destino = forzar;
          else if (top < arriba - 1) destino = arriba;
          else if (top + h > abajo + 1 && h <= util) destino = (pi + 1) * paso + pg.m.s;
          forzar = null;
          if (destino != null && destino > top) {
            const d = destino - top;
            const base = parseFloat(getComputedStyle(el).marginTop) || 0;
            el.style.marginTop = base + d + "px";
            el.dataset.empuje = d;
            corr += d;
          }
          if (el.querySelector(".wd-salto")) { const t2 = top + (destino != null && destino > top ? destino - top : 0); forzar = (Math.floor(t2 / paso) + 1) * paso + pg.m.s; }
        }
        mo.takeRecords();
        const fin = cuerpo.offsetHeight;
        numPaginas = Math.max(1, Math.ceil((fin + 1) / paso));
        if (forzar != null) numPaginas = Math.max(numPaginas, Math.round((forzar - pg.m.s) / paso) + 1);
        cuerpo.style.minHeight = numPaginas * paso - GAP + "px";
        const d = doc().valor("_doc", "encabezado") || "", pie = doc().valor("_doc", "pie") || "", nums = doc().valor("_doc", "numeros") !== false;
        let h = "";
        for (let i = 0; i < numPaginas; i++) {
          h += `<div class="wd-pagina" style="top:${i * paso}px"><div class="wd-enc">${esc(d)}</div><div class="wd-pie"><span>${esc(pie)}</span>${nums ? `<span>${i + 1}</span>` : ""}</div></div>`;
        }
        if (capaPaginas.innerHTML !== h) capaPaginas.innerHTML = h;
        pintarEstado();
        pintarCursores();
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
        barraEstado.innerHTML = `<button class="wd-e" data-contar>${vista === "paginas" ? `Página ${pg} de ${numPaginas} · ` : ""}${sel}${c.palabras.toLocaleString("es-MX")} palabras</button>
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
        if (panelBuscar) { panelBuscar.classList.toggle("con-reemplazo", !!reemplazar || panelBuscar.classList.contains("con-reemplazo")); $("[data-q]", panelBuscar).select(); return; }
        const s = leerSel();
        const inicial = s.col ? "" : visPintado.slice(s.ini, s.fin).map((x) => x.c).join("").slice(0, 100);
        panelBuscar = html(`<div class="wd-buscar ${reemplazar ? "con-reemplazo" : ""}" role="search">
          <div class="fila"><input data-q placeholder="Buscar en el documento" aria-label="Buscar" value="${esc(inicial)}"><span data-cuenta class="suave">0/0</span>
            <button class="icono-btn chico" data-b="ant" aria-label="Anterior">${ico("chevron-up", "ico-s")}</button><button class="icono-btn chico" data-b="sig" aria-label="Siguiente">${ico("chevron-down", "ico-s")}</button>
            <button class="icono-btn chico" data-b="mas" aria-label="Reemplazar" data-micro="Reemplazar||Ctrl+H">${ico("replace", "ico-s")}</button><button class="icono-btn chico" data-b="cerrar" aria-label="Cerrar">${ico("x", "ico-s")}</button></div>
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
          if (c.bloque === "_doc") { if (["pagina", "encabezado", "pie", "numeros"].some((k) => k in c.campos)) aplicarPagina(); return; }
          if (origen === "celda" && c.local) return;
          // Tablas e imágenes del texto: se actualizan en su lugar (sin quitar el foco de una celda).
          $$(`[data-ref="${CSS.escape(c.bloque)}"]`, cuerpo).forEach((o) => {
            if ("filasTexto" in c.campos || "colsTexto" in c.campos || "encabezado" in c.campos) { pintarTabla(o, doc().bloque(c.bloque), c.bloque); return; }
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
      function desplazarAlCursor() {
        const s = getSelection();
        if (!s.rangeCount) return;
        const r = s.getRangeAt(0).getBoundingClientRect(), v = ed.lienzo.getBoundingClientRect();
        if (!r.height && !r.top) return;
        if (r.bottom > v.bottom - 60) ed.lienzo.scrollTop += r.bottom - v.bottom + 120;
        else if (r.top < v.top + 20) ed.lienzo.scrollTop -= v.top + 80 - r.top;
      }
      ed.lienzo.addEventListener("scroll", NOM.throttle(pintarEstado, 200), { passive: true });
      const ro = new ResizeObserver(() => programarPaginar());
      ro.observe(cuerpo);

      // ------------------------------------------------------------ barra de herramientas
      const ctl = {};
      let tRefl = null;
      function programarReflejo() { if (!tRefl) tRefl = requestAnimationFrame(() => { tRefl = null; reflejar(); }); }
      function reflejar() {
        if (!ctl.estilo) return;
        const { a, pa } = attrsEnCursor();
        if (document.activeElement !== ctl.estilo) ctl.estilo.value = pa.estilo || "";
        if (document.activeElement !== ctl.fuente) ctl.fuente.value = a.fuente && FUENTES[a.fuente] ? a.fuente : a.fuente ? "_otra" : "";
        if (ctl.fuente.value === "_otra" && ctl.fuenteOtra) ctl.fuenteOtra.textContent = a.fuente;
        if (document.activeElement !== ctl.tam) ctl.tam.value = a.tam || { titulo: 28, h1: 16, h2: 13, h3: 12, codigo: 10 }[pa.estilo] || 11;
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
          { texto: "Fecha de hoy", icono: "calendar", fn: () => insertarTexto(new Date().toLocaleDateString("es-MX", { dateStyle: "long" })) },
          { texto: "Símbolo…", icono: "omega", fn: () => menuSimbolos(b) },
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
          { titulo: "Documento" },
          { texto: "Buscar y reemplazar", icono: "search", atajo: "Ctrl+H", fn: () => buscar(true) },
          { texto: "Contar palabras", icono: "file-text", fn: dialogoConteo },
          { texto: esquema.hidden ? "Mostrar esquema" : "Ocultar esquema", icono: "list-tree", fn: alternarEsquema },
          { texto: "Configurar página…", icono: "file-cog", fn: dialogoPagina },
          { texto: "Encabezado y pie de página…", icono: "panel-top", fn: dialogoEncabezado },
          { texto: vista === "paginas" ? "Ver sin páginas" : "Ver como páginas", icono: vista === "paginas" ? "scroll-text" : "file-text", fn: () => fijarVista(vista === "paginas" ? "continua" : "paginas") },
          { texto: "Atajos de teclado", icono: "keyboard", fn: dialogoAtajos },
        ]);
      }
      function dialogoPagina() {
        const pg = pagina(), c = doc().valor("_doc", "pagina") || {};
        const mActual = Object.keys(MARGENES).find((k) => MARGENES[k].v === pg.m.s && pg.m.s === pg.m.i && pg.m.iz === pg.m.d && pg.m.s === pg.m.iz) || "personal";
        const cuerpoH = html(`<form class="col">
          <div class="campo"><label>Tamaño del papel</label><div class="entrada"><select data-tam>${Object.entries(PAGINAS).map(([k, v]) => `<option value="${k}" ${k === pg.tam ? "selected" : ""}>${v.n}</option>`).join("")}</select></div></div>
          <div class="campo"><label>Orientación</label><div class="segmentado lleno" role="group"><button type="button" data-o="v" aria-pressed="${pg.orient === "v"}">Vertical</button><button type="button" data-o="h" aria-pressed="${pg.orient === "h"}">Horizontal</button></div></div>
          <div class="campo"><label>Márgenes</label><div class="entrada"><select data-m>${Object.entries(MARGENES).map(([k, v]) => `<option value="${k}" ${k === mActual ? "selected" : ""}>${v.n}</option>`).join("")}${mActual === "personal" ? `<option value="personal" selected>Personalizados</option>` : ""}</select></div></div></form>`);
        let orient = pg.orient;
        $$("[data-o]", cuerpoH).forEach((b) => (b.onclick = () => { orient = b.dataset.o; $$("[data-o]", cuerpoH).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
        const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>Aplicar</button></div>`);
        const h = NOM.hoja({ titulo: "Configurar página", icono: "file-cog", cuerpo: cuerpoH, pie });
        $("[data-no]", pie).onclick = () => h.cerrar();
        $("[data-si]", pie).onclick = () => {
          const mk = $("[data-m]", cuerpoH).value, v = MARGENES[mk] ? MARGENES[mk].v : null;
          doc().cambiar("_doc", { pagina: Object.assign({}, c, { tam: $("[data-tam]", cuerpoH).value, orient, margen: v ? { s: v, i: v, iz: v, d: v } : c.margen }) });
          aplicarPagina();
          h.cerrar();
        };
      }
      function dialogoEncabezado() {
        const cuerpoH = html(`<form class="col">
          <div class="campo"><label for="wd-enc">Encabezado (arriba de cada página)</label><div class="entrada"><input id="wd-enc" maxlength="200" value="${esc(doc().valor("_doc", "encabezado") || "")}"></div></div>
          <div class="campo"><label for="wd-pie">Pie de página</label><div class="entrada"><input id="wd-pie" maxlength="200" value="${esc(doc().valor("_doc", "pie") || "")}"></div></div>
          <label class="interruptor"><input type="checkbox" data-num ${doc().valor("_doc", "numeros") !== false ? "checked" : ""}> Números de página</label></form>`);
        const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>Guardar</button></div>`);
        const h = NOM.hoja({ titulo: "Encabezado y pie de página", icono: "panel-top", cuerpo: cuerpoH, pie });
        $("[data-no]", pie).onclick = () => h.cerrar();
        $("[data-si]", pie).onclick = () => {
          doc().cambiar("_doc", { encabezado: $("#wd-enc", cuerpoH).value.trim(), pie: $("#wd-pie", cuerpoH).value.trim(), numeros: $("[data-num]", cuerpoH).checked });
          aplicarPagina();
          h.cerrar();
        };
      }
      function dialogoAtajos() {
        const l = [["Negrita / cursiva / subrayado", "Ctrl+B / I / U"], ["Tachado", "Ctrl+Mayús+X"], ["Título 1, 2, 3 / Normal", "Ctrl+Alt+1, 2, 3 / 0"], ["Alinear izq., centro, der., justificar", "Ctrl+Mayús+L, E, R, J"],
          ["Numeración / viñetas / tareas", "Ctrl+Mayús+7 / 8 / 9"], ["Más o menos sangría", "Tab / Mayús+Tab"], ["Enlace", "Ctrl+K"], ["Salto de página", "Ctrl+Enter"], ["Salto de línea", "Mayús+Enter"],
          ["Agrandar / achicar letra", "Ctrl+] / Ctrl+["], ["Borrar formato", "Ctrl+\\"], ["Copiar / pegar formato", "Ctrl+Alt+C / V"], ["Buscar / reemplazar", "Ctrl+F / Ctrl+H"], ["MAYÚSCULAS ↔ minúsculas", "Mayús+F3"],
          ["Pegar sin formato", "Ctrl+Mayús+V"], ["Ruedita de acciones", "Mantener clic derecho (o izquierdo quieto)"], ["Menú normal del navegador", "Mayús+clic derecho"], ["Atajos al escribir", "# , ## , - , 1. , [] , > al inicio"]];
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
                else toks.push({ c: OBJ, obj: { tipo: t.e.tipo } });
              } else cps(t.x).forEach((c) => toks.push({ c, a: t.a || {} }));
            });
            if (i < r.parrafos.length - 1) toks.push({ c: "\n", pa: p.pa || {} });
          });
          const s = leerSel();
          comando(() => { const fin = insertarEn(s.ini, toks, "pegar"); return { sel: [fin, fin] }; });
          if (r.aviso) aviso(r.aviso, { tipo: "aviso", ms: 5000 });
        } catch (e) { aviso(e.message, { tipo: "error" }); }
      }

      const selectEstilo = `<select class="mini-select wd-sel-estilo" aria-label="Estilo de párrafo" data-micro="Estilo|Normal, títulos, cita o código. Atajos: Ctrl+Alt+1, 2, 3.">${ESTILOS.map((s) => `<option value="${s.v || ""}">${s.t}</option>`).join("")}</select>`;
      const selectFuente = `<select class="mini-select wd-sel-fuente" aria-label="Fuente" data-micro="Fuente|Tipo de letra del texto seleccionado."><option value="">Calibri (predeterminada)</option>${Object.keys(FUENTES).filter((f) => f !== "Calibri").map((f) => `<option value="${esc(f)}" style="font-family:${esc(cssFuente(f))}">${esc(f)}</option>`).join("")}<option value="_otra" hidden></option></select>`;
      const tamHtml = `<span class="wd-tam" data-micro="Tamaño de letra|En puntos, como en Word.|Ctrl+] / Ctrl+["><button class="icono-btn chico" data-tam="-" aria-label="Reducir tamaño">${ico("minus", "ico-s")}</button><input class="mini-select" inputmode="decimal" aria-label="Tamaño de letra" list="wd-tamanos" size="3"><datalist id="wd-tamanos">${TAMANOS.map((t) => `<option value="${t}">`).join("")}</datalist><button class="icono-btn chico" data-tam="+" aria-label="Aumentar tamaño">${ico("plus", "ico-s")}</button></span>`;
      this._herr = [
        { html: selectEstilo, montar: (n) => { ctl.estilo = n; n.onchange = () => { formatoParrafo({ estilo: n.value || null }); cuerpo.focus({ preventScroll: true }); }; } },
        { html: selectFuente, montar: (n) => { ctl.fuente = n; ctl.fuenteOtra = n.querySelector("[value=_otra]"); n.onchange = () => { if (n.value !== "_otra") formato({ fuente: n.value || null }); cuerpo.focus({ preventScroll: true }); }; } },
        { html: tamHtml, montar: (n) => {
          ctl.tam = $("input", n);
          $$("[data-tam]", n).forEach((b) => { b.addEventListener("pointerdown", (e) => e.preventDefault()); b.onclick = () => cambiarTam(b.dataset.tam === "+" ? 1 : -1); });
          ctl.tam.addEventListener("change", () => { const v = parseFloat(String(ctl.tam.value).replace(",", ".")); if (v > 0 && v <= 400) formato({ tam: Math.round(v * 2) / 2 }); cuerpo.focus({ preventScroll: true }); });
          ctl.tam.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ctl.tam.dispatchEvent(new Event("change")); } });
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
        { id: "mas-texto", icono: "more-vertical", micro: "Más|Tachado, superíndice, configurar página, encabezado y pie, esquema…", fn: (e, b) => menuMas(b) },
      ];
      // Doble clic en la brocha: modo fijo.
      setTimeout(() => { const b = ed.botones && ed.botones.brocha; if (b) b.addEventListener("dblclick", () => copiarFormato(true)); }, 0);

      // ------------------------------------------------------------ ruedita (clic derecho o mantener)
      let selRueda = null;
      NOM.rueda.enlazar(cuerpo, (e) => {
        if (ed.soloLectura) return null;
        const o = e.target.closest && e.target.closest("[data-obj]");
        const s = selRueda || leerSel();
        const restaurar = () => { cuerpo.focus({ preventScroll: true }); ponerSel(s.a, s.f); };
        const con = (fn) => () => { restaurar(); fn(); };
        if (o && o.classList.contains("wd-imagen")) {
          const it = sec().item(o.dataset.id), ref = it && it.e && it.e.ref;
          const ancho = (k) => () => { if (ref) doc().cambiar(ref, { w: Math.round(anchoUtil() * k) }); };
          return [
            { texto: "Ancho completo", icono: "maximize-2", fn: ancho(1) }, { texto: "Mitad", icono: "minimize-2", fn: ancho(0.5) },
            { texto: "Centrar", icono: "align-center", fn: () => formatoParrafo({ alin: "centro" }, [psPintado[parrafoEn(sec().posicion(o.dataset.id))]]) },
            { texto: "Eliminar", icono: "trash-2", fn: () => quitarObjeto(o.dataset.id) },
            { texto: "Un cuarto", icono: "image", fn: ancho(0.25) },
            { texto: "Izquierda", icono: "align-left", fn: () => formatoParrafo({ alin: null }, [psPintado[parrafoEn(sec().posicion(o.dataset.id))]]) },
          ];
        }
        return [
          { texto: "Negrita", icono: "bold", fn: con(() => alternar("b")) },
          { texto: "Cursiva", icono: "italic", fn: con(() => alternar("i")) },
          { texto: "Subrayado", icono: "underline", fn: con(() => alternar("u")) },
          { texto: "Color", icono: "baseline", sub: COLORES.filter((_, i) => [0, 9, 10, 13, 15, 17, 2, 8].includes(i)).map((c) => ({ texto: c, corto: " ", color: c, fn: con(() => formato({ color: c === "#000000" ? null : c })) })) },
          { texto: "Resaltar", icono: "highlighter", sub: RESALTES.slice(0, 7).map((c) => ({ texto: c, corto: " ", color: c, fn: con(() => formato({ fondo: c })) })).concat([{ texto: "Sin resaltado", icono: "x", fn: con(() => formato({ fondo: null })) }]) },
          { texto: "Estilo", icono: "heading-1", sub: [
            { texto: "Normal", icono: "pilcrow", fn: con(() => formatoParrafo({ estilo: null })) }, { texto: "Título 1", icono: "heading-1", fn: con(() => formatoParrafo({ estilo: "h1" })) },
            { texto: "Título 2", icono: "heading-2", fn: con(() => formatoParrafo({ estilo: "h2" })) }, { texto: "Título 3", icono: "heading-3", fn: con(() => formatoParrafo({ estilo: "h3" })) },
            { texto: "Viñetas", icono: "list", fn: con(() => alternarLista("vinetas")) }, { texto: "Numeración", icono: "list-ordered", fn: con(() => alternarLista("numeros")) },
            { texto: "Tareas", icono: "list-checks", fn: con(() => alternarLista("tareas")) }, { texto: "Cita", icono: "quote", fn: con(() => formatoParrafo({ estilo: "cita" })) }] },
          { texto: "Enlace", icono: "link", fn: con(enlace) },
          { texto: "Más", icono: "more-horizontal", sub: [
            { texto: "Copiar", icono: "copy", off: s.col, fn: con(() => document.execCommand("copy")) },
            { texto: "Cortar", icono: "scissors", off: s.col, fn: con(() => document.execCommand("cut")) },
            { texto: "Pegar", icono: "clipboard-paste", fn: con(pegarPortapapeles) },
            { texto: "Copiar formato", icono: "paintbrush", fn: con(() => copiarFormato(false)) },
            { texto: "Borrar formato", icono: "remove-formatting", fn: con(borrarFormato) },
            { texto: "Buscar", icono: "search", fn: con(() => buscar(false)) },
            { texto: "Insertar imagen", icono: "image", fn: con(insertarImagen) },
            { texto: "Salto de página", icono: "file-plus", fn: con(() => insertarBloque({ tipo: "salto" })) }] },
        ];
      }, {
        izquierdo: true, tactil: false, titulo: "Texto",
        alPreparar: () => { selRueda = leerSel(); setTimeout(() => (selRueda = null), 0); },
        ignorar: (e) => !!(e.target.closest && (e.target.closest("[data-celda]") || e.target.closest("[data-tirador]"))),
        puntoTeclado: () => { const s = getSelection(); return s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : cuerpo.getBoundingClientRect(); },
      });
      async function pegarPortapapeles() {
        try {
          if (navigator.clipboard && navigator.clipboard.read) {
            const items = await navigator.clipboard.read();
            for (const it of items) {
              if (it.types.includes("text/html")) { const h = await (await it.getType("text/html")).text(); const d = new DOMParser().parseFromString(h, "text/html"); const toks = tokens(d.body, {}); if (toks.length && toks[toks.length - 1].c === "\n") toks.pop(); const s = leerSel(); comando(() => { if (!s.col) borrarRango(s.ini, s.fin); const fin = insertarEn(s.ini, toks, "pegar"); return { sel: [fin, fin] }; }); return; }
            }
          }
          const t = await navigator.clipboard.readText();
          if (t) insertarTexto(t.replace(/\r\n?/g, "\n"));
        } catch (e) { aviso("El navegador no dejó leer el portapapeles. Usa Ctrl+V.", { tipo: "info" }); }
      }

      // ------------------------------------------------------------ barra mini (al seleccionar, como la de Word)
      let mini = null;
      function quitarMini() { if (mini) { mini.remove(); mini = null; } }
      const alSeleccionarMini = NOM.debounce(() => {
        quitarMini();
        if (ed.soloLectura) return;
        const s = getSelection();
        if (!s.rangeCount || s.isCollapsed || !cuerpo.contains(s.anchorNode) || brocha) return;
        const r = s.getRangeAt(0).getBoundingClientRect(), base = zona.getBoundingClientRect();
        if (!r.width) return;
        mini = html(`<div class="flotante wd-mini" role="toolbar" aria-label="Formato rápido">
          <button class="icono-btn" data-f="b" aria-label="Negrita">${ico("bold")}</button><button class="icono-btn" data-f="i" aria-label="Cursiva">${ico("italic")}</button>
          <button class="icono-btn" data-f="u" aria-label="Subrayado">${ico("underline")}</button><button class="icono-btn" data-f="color" aria-label="Color">${ico("baseline")}</button>
          <button class="icono-btn" data-f="fondo" aria-label="Resaltar">${ico("highlighter")}</button><button class="icono-btn" data-f="link" aria-label="Enlace">${ico("link")}</button></div>`);
        mini.style.left = Math.max(4, r.left - base.left + r.width / 2 - 120) + "px";
        mini.style.top = Math.max(4, r.top - base.top - 50) + "px";
        mini.addEventListener("pointerdown", (e) => e.preventDefault());
        mini.addEventListener("click", (e) => {
          const b = e.target.closest("[data-f]");
          if (!b) return;
          const f = b.dataset.f;
          if (f === "color") paleta(b, COLORES, attrsEnCursor().a.color, (c) => formato({ color: c }));
          else if (f === "fondo") paleta(b, RESALTES, attrsEnCursor().a.fondo, (c) => formato({ fondo: c }), { sinColor: "Sin resaltado" });
          else if (f === "link") enlace();
          else alternar(f);
        });
        zona.append(mini);
      }, 350);
      document.addEventListener("selectionchange", alSeleccionarMini);

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
        ro.disconnect();
        clearTimeout(tPag);
        document.removeEventListener("selectionchange", selDeb);
        document.removeEventListener("selectionchange", alSeleccionarMini);
        quitarMini();
        cerrarBuscar();
        ed.lienzo.classList.remove("con-wd");
        pendCeldas.forEach((f) => f.ya());
      };
      void self;
    },
    herramientas() { return this._herr || []; },
  };

  NOM.textoRico = { parrafosDe, asegurarSecuencia, tokens, envolver, BLOQUE: B, cssFuente, FUENTES };
})();
