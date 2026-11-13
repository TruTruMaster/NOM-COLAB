/* NOM-COLAB · Exportar a formatos de Office (Office Open XML), sin librerías:
   texto → .docx (Word), hoja → .xlsx (Excel), presentación y diagrama → .pptx (PowerPoint).
   Un archivo OOXML es un .zip de XML; aquí se arma comprimido, sin librerías (compresion.js). */
(function () {
  "use strict";
  const NOM = window.NOM;
  const F = () => NOM.formulas;
  const enc = new TextEncoder();
  const x = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  // ------------------------------------------------------------ zip (comprimido)
  const crc32 = (b) => NOM.compresion.crc32(b);
  const YA_COMPRIMIDO = /\.(png|jpe?g|gif|webp|mp4|m4a|mp3|wmv|avi|zip|docx|xlsx|pptx|odttf)$/i;
  /**
   * Arma un .zip. Cada archivo: { nombre, datos (texto o bytes) }. Los XML van comprimidos
   * (DEFLATE propio, compresion.js); las imágenes, que ya vienen comprimidas, se guardan tal cual.
   */
  function zip(archivos, opc) {
    const partes = [], centrales = [];
    let off = 0;
    for (const a of archivos) {
      const nombre = enc.encode(a.nombre);
      // Parte que llegó dañada del archivo original: va tal cual venía (comprimida, con su CRC y su tamaño).
      const cr = a.crudo;
      const datos = cr ? { length: cr.tam } : typeof a.datos === "string" ? enc.encode(a.datos) : a.datos, crc = cr ? cr.crc : crc32(datos);
      let cuerpo = cr ? cr.datos : datos, metodo = cr ? 8 : 0;
      if (!cr && datos.length > 40 && !a.sinComprimir) {
        // Lo que ya viene comprimido (fotos) se prueba rápido: algunos PNG mal comprimidos todavía bajan bastante.
        const ya = YA_COMPRIMIDO.test(a.nombre);
        const c = NOM.compresion.comprimir(datos, { nivel: ya ? 2 : (opc && opc.nivel) || (datos.length > 3000000 ? 6 : 9) });
        if (c.length < datos.length * (ya ? 0.97 : 1)) { cuerpo = c; metodo = 8; }
      }
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, metodo, true);
      loc.setUint16(12, 0x21, true);   // fecha fija (1980-01-01): el mismo documento da siempre el mismo archivo
      loc.setUint32(14, crc, true); loc.setUint32(18, cuerpo.length, true); loc.setUint32(22, datos.length, true);
      loc.setUint16(26, nombre.length, true);
      partes.push(new Uint8Array(loc.buffer), nombre, cuerpo);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, metodo, true);
      cen.setUint16(14, 0x21, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, cuerpo.length, true); cen.setUint32(24, datos.length, true);
      cen.setUint16(28, nombre.length, true); cen.setUint32(42, off, true);
      centrales.push(new Uint8Array(cen.buffer), nombre);
      off += 30 + nombre.length + cuerpo.length;
    }
    const tamCentral = centrales.reduce((n, p) => n + p.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true); fin.setUint32(16, off, true);
    const todo = [...partes, ...centrales, new Uint8Array(fin.buffer)];
    const r = new Uint8Array(todo.reduce((n, p) => n + p.length, 0));
    let i = 0; for (const p of todo) { r.set(p, i); i += p.length; }
    return r;
  }

  // ------------------------------------------------------------ utilidades
  function ordenados(doc, pagina) {
    const pags = doc.paginas();
    return (pagina ? [pagina] : pags).flatMap((p) => doc.deLaPagina(p));
  }

  /** data:image/png;base64,... → { bytes, ext, w, h } (solo PNG y JPEG; otros se omiten). */
  function imagen(src) {
    const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(src || "");
    if (!m) return null;
    const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = m[1].toLowerCase() === "png" ? "png" : "jpeg";
    let w = 800, h = 600;
    if (ext === "png") { const v = new DataView(bytes.buffer); w = v.getUint32(16); h = v.getUint32(20); }
    else {
      for (let i = 2; i < bytes.length - 9;) {
        if (bytes[i] !== 0xFF) { i++; continue; }
        const mk = bytes[i + 1], len = (bytes[i + 2] << 8) | bytes[i + 3];
        if (mk >= 0xC0 && mk <= 0xC3) { h = (bytes[i + 5] << 8) | bytes[i + 6]; w = (bytes[i + 7] << 8) | bytes[i + 8]; break; }
        i += 2 + len;
      }
    }
    return { bytes, ext, w, h };
  }

  /** HTML de un párrafo (b, i, u, br) → tramos { t, b, i, u, br }. */
  function tramos(html) {
    const d = document.createElement("div");
    d.innerHTML = html || "";
    const r = [];
    (function rec(n, st) {
      n.childNodes.forEach((c) => {
        if (c.nodeType === 3) { if (c.nodeValue) r.push({ t: c.nodeValue, ...st }); return; }
        if (c.nodeType !== 1) return;
        const tag = c.tagName.toLowerCase();
        if (tag === "br") { r.push({ br: true }); return; }
        rec(c, { b: st.b || tag === "b" || tag === "strong", i: st.i || tag === "i" || tag === "em", u: st.u || tag === "u" });
      });
    })(d, {});
    return r;
  }

  /** Fórmula de NOM (=SUMA(A1;A2)) → fórmula de Excel (SUM(A1,A2)), sin el "=". */
  const EN = { SUMA: "SUM", PROMEDIO: "AVERAGE", CONTAR: "COUNT", CONTARA: "COUNTA", SI: "IF", ESERROR: "ISERROR", SIERROR: "IFERROR",
    Y: "AND", O: "OR", NO: "NOT", REDONDEAR: "ROUND", RAIZ: "SQRT", POTENCIA: "POWER", CONCATENAR: "CONCATENATE", MAYUSC: "UPPER", MINUSC: "LOWER", LARGO: "LEN",
    BUSCARV: "VLOOKUP", "CONTAR.SI": "COUNTIF", "SUMAR.SI": "SUMIF", HOY: "TODAY", FECHA: "DATE", DIAS: "DAYS", "DÍAS": "DAYS" };
  function formulaExcel(f) {
    let r = "", enTexto = false;
    const s = f.replace(/^=/, "");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') { enTexto = !enTexto; r += c; continue; }
      if (enTexto) { r += c; continue; }
      if (c === ";") { r += ","; continue; }
      const m = /^[A-Za-zÁÉÍÓÚÑáéíóúñ_][A-Za-z0-9ÁÉÍÓÚÑáéíóúñ_.]*(?=\s*\()/.exec(s.slice(i));
      if (m) { const n = m[0].toUpperCase(), es = (F().ALIAS || {})[n] || n; r += (F().INGLES || {})[es] || EN[n] || n; i += m[0].length - 1; continue; }
      const b = /^(VERDADERO|FALSO)(?![A-Za-z0-9_.(])/i.exec(s.slice(i));
      if (b && !/[A-Za-z0-9_.]/.test(s[i - 1] || "")) { r += b[1].toUpperCase() === "VERDADERO" ? "TRUE" : "FALSE"; i += b[0].length - 1; continue; }
      r += c;
    }
    return r;
  }

  const CT = (extra) => XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>${extra}</Types>`;
  const RELS = (rels) => XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map((r, i) =>
    `<Relationship Id="${r.id || "rId" + (i + 1)}" Type="${r.tipo}" Target="${x(r.destino)}"${r.externo ? ' TargetMode="External"' : ""}/>`).join("")}</Relationships>`;
  const T = { doc: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
    img: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    estilos: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
    num: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",
    hoja: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
    diapo: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
    maestro: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster",
    diseno: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout",
    tema: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme",
    conf: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings",
    enlace: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
    encabezado: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
    pie: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
    nucleo: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" };
  const EMU = 9525;   // 1 px a 96 ppp

  // ------------------------------------------------------------ Word (.docx)
  const TWIP = 15;   // 1 px (96 ppp) = 15 twips
  const ESTILO_WORD = { titulo: "Title", subtitulo: "Subtitle", h1: "Heading1", h2: "Heading2", h3: "Heading3", cita: "Quote", codigo: "Codigo" };
  const ALIN_WORD = { centro: "center", der: "right", just: "both" };
  const hexW = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c.slice(1).toUpperCase() : null);

  /** Documento de texto (secuencia letra por letra) → .docx con estilos de Word reales. */
  function docx(doc) {
    const og = NOM.ooxml.usarOrigen !== false && NOM.origen ? NOM.origen.leer(doc) : null;
    if (og && og.fmt === "docx" && og.h && og.h.u) {
      try { return docxArmar(doc, og); }
      catch (e) { if (typeof console !== "undefined") console.warn("Word: no se pudo partir del archivo original; se arma desde cero.", e); }
    }
    return docxArmar(doc, null);
  }
  /** Huellas de cada unidad del cuerpo (párrafo o tabla de Word) tal como quedó importada: { k: [todo, soloFormatoDePárrafo] }. */
  const sinOx = (pa) => { const r = Object.assign({}, pa); delete r.ox; return r; };
  const huellaGrupo = (g) => NOM.origen.huella(g.map((p) => [sinOx(p.pa), p.tramos.map((t) => (t.e ? { e: t.e, a: t.a } : [t.x, t.a]))]));
  function huellasDocx(doc) {
    const ps = NOM.textoRico.parrafosDe(doc), u = {};
    for (let i = 0; i < ps.length;) {
      const k = ps[i].pa.ox;
      let j = i;
      if (k != null) { while (j + 1 < ps.length && ps[j + 1].pa.ox === k) j++; if (u[k] == null) u[k] = [huellaGrupo(ps.slice(i, j + 1)), NOM.origen.huella(sinOx(ps[i].pa))]; }
      i = j + 1;
    }
    return u;
  }
  function docxArmar(doc, og) {
    // Con archivo de origen, lo nuevo se numera después de lo que ya trae (ver "a partir del original").
    let PRE = "", baseAbs = 10, baseNum = 20, baseNota = 0, baseDib = 0;
    const medios = [], rels = [{ id: "rIdEst", tipo: T.estilos, destino: "styles.xml" }, { id: "rIdNum", tipo: T.num, destino: "numbering.xml" }, { id: "rIdConf", tipo: T.conf, destino: "settings.xml" }];
    const ps = NOM.textoRico.parrafosDe(doc);
    let nImg = 0, nLink = 0;
    // 8.2 Listas: una definición (abstractNum) por formato de número o viñeta, y una instancia (num)
    // por cada lista que empieza (o que empieza en otro número). "continuar" reusa la anterior.
    const abstractos = new Map(), instancias = [];
    let numActual = null, numAnterior = null;
    const FMT_NUM = { "1.": ["decimal", "%1."], "1)": ["decimal", "%1)"], "a.": ["lowerLetter", "%1."], "a)": ["lowerLetter", "%1)"], "A.": ["upperLetter", "%1."], "I.": ["upperRoman", "%1."], "i.": ["lowerRoman", "%1."] };
    const abstracto = (clave) => { if (!abstractos.has(clave)) abstractos.set(clave, abstractos.size + baseAbs); return abstractos.get(clave); };
    const nuevaInstancia = (clave, inicio) => { const id = baseNum + instancias.length; instancias.push({ id, abs: abstracto(clave), inicio }); return id; };
    // 8.2 Notas al pie y figuras.
    const notas = [];
    let nFigura = 0;
    const pagDoc = doc.valor("_doc", "pagina") || {};
    // "otro": tamaño que no es de los comunes (vino así de un archivo de Word), con sus medidas en px
    const TAM0 = (pagDoc.tam === "otro" && +pagDoc.w > 100 && +pagDoc.h > 100 ? [+pagDoc.w, +pagDoc.h] : null) || { carta: [816, 1056], a4: [794, 1123], oficio: [816, 1344], a5: [559, 794], media: [529, 816] }[pagDoc.tam] || [816, 1056];
    const mg0 = pagDoc.margen || {}, v0 = (v) => (typeof v === "number" ? v : 96);
    const anchoTexto = Math.round(((pagDoc.orient === "h" ? TAM0[1] : TAM0[0]) - v0(mg0.iz) - v0(mg0.d)) * TWIP);
    const CMT = 567;   // twips por centímetro
    const rPr = (a) => {
      // en el orden que pide el esquema de Word
      let r = "";
      if (a.fuente) r += `<w:rFonts w:ascii="${x(a.fuente)}" w:hAnsi="${x(a.fuente)}" w:cs="${x(a.fuente)}"/>`;
      if (a.b) r += "<w:b/><w:bCs/>";
      if (a.i) r += "<w:i/><w:iCs/>";
      if (a.mayus) r += "<w:caps/>";
      if (a.vers) r += "<w:smallCaps/>";
      if (a.s) r += "<w:strike/>";
      if (hexW(a.color)) r += `<w:color w:val="${hexW(a.color)}"/>`;
      if (+a.esp) r += `<w:spacing w:val="${Math.round(+a.esp * 20)}"/>`;
      if (a.tam) r += `<w:sz w:val="${Math.round(a.tam * 2)}"/><w:szCs w:val="${Math.round(a.tam * 2)}"/>`;
      if (a.u) r += '<w:u w:val="single"/>';
      if (hexW(a.fondo)) r += `<w:shd w:val="clear" w:color="auto" w:fill="${hexW(a.fondo)}"/>`;
      if (a.va) r += `<w:vertAlign w:val="${a.va === "sup" ? "superscript" : "subscript"}"/>`;
      return r ? `<w:rPr>${r}</w:rPr>` : "";
    };
    const texto = (t, a) => {
      // Tabuladores y saltos de línea son elementos propios en Word.
      return t.split(/(\t|\u2028)/).filter((z) => z !== "").map((z) => `<w:r>${rPr(a)}${z === "\t" ? "<w:tab/>" : z === "\u2028" ? "<w:br/>" : `<w:t xml:space="preserve">${x(z)}</w:t>`}</w:r>`).join("");
    };
    const dibujo = (src, wpx, alt, rec, rot) => {
      const im = imagen(src);
      if (!im) return "";
      const n = ++nImg, id = "rId" + PRE + "Img" + n, arch = (PRE ? PRE.toLowerCase() + "-" : "") + "imagen" + n + "." + im.ext;
      medios.push({ nombre: "word/media/" + arch, datos: im.bytes });
      rels.push({ id, tipo: T.img, destino: "media/" + arch });
      const r = rec || {}, fw = Math.max(0.05, 1 - (+r.iz || 0) - (+r.d || 0)), fh = Math.max(0.05, 1 - (+r.s || 0) - (+r.i || 0));
      const w = Math.min(wpx || im.w, anchoTexto / TWIP), cx = Math.round(w * EMU), cy = Math.round(w * (im.h / im.w) * (fh / fw) * EMU);
      const recorte = rec ? `<a:srcRect l="${Math.round((+r.iz || 0) * 100000)}" t="${Math.round((+r.s || 0) * 100000)}" r="${Math.round((+r.d || 0) * 100000)}" b="${Math.round((+r.i || 0) * 100000)}"/>` : "";
      const giro = +rot ? ` rot="${Math.round(+rot * 60000)}"` : "";
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${baseDib + n}" name="Imagen ${n}" descr="${x(alt || "")}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="imagen${n}"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="${id}"/>${recorte}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm${giro}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    };
    const BORDES_TABLA = {
      todos: ["top", "left", "bottom", "right", "insideH", "insideV"],
      horizontales: ["top", "bottom", "insideH"],
      externos: ["top", "left", "bottom", "right"],
      ninguno: [],
    };
    const tabla = (b) => {
      const filas = Math.max(1, b.filasTexto || 3), cols = Math.max(1, b.colsTexto || 3);
      const fijos = Array.from({ length: cols }, (_, c) => +b["aw:" + F().colLetra(c)] || 0), suma = fijos.reduce((s2, v) => s2 + v, 0), libres = fijos.filter((v) => !v).length;
      const anchos = fijos.map((v) => Math.round(((v || (libres ? Math.max(0, 100 - suma) / libres : 0)) / 100) * anchoTexto));
      const spans = {}, tapadas = {};
      for (const k in b) {
        if (!k.startsWith("m:") || !/^\d+x\d+$/.test(String(b[k] || ""))) continue;
        const p = F().parseRef(k.slice(2)), [w, h] = String(b[k]).split("x").map(Number);
        if (!p || w * h <= 1) continue;
        spans[k.slice(2)] = [w, h];
        for (let f = p.f; f < p.f + h; f++) for (let c = p.c; c < p.c + w; c++) if (c !== p.c || f !== p.f) tapadas[F().ref(c, f)] = { tl: k.slice(2), primeraCol: c === p.c };
      }
      const lados = BORDES_TABLA[b.bordes || "todos"] || BORDES_TABLA.todos;
      const bordes = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((l) => (lados.includes(l) ? `<w:${l} w:val="single" w:sz="4" w:space="0" w:color="8E8E8E"/>` : `<w:${l} w:val="nil"/>`)).join("")}</w:tblBorders>`;
      let t = `<w:tbl><w:tblPr><w:tblStyle w:val="TablaNom"/><w:tblW w:w="${anchoTexto}" w:type="dxa"/>${bordes}<w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="${b.encabezado ? 1 : 0}" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${anchos.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
      for (let f = 0; f < filas; f++) {
        t += `<w:tr>${b.encabezado && f === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}`;
        for (let c = 0; c < cols; c++) {
          const r = F().ref(c, f), tp = tapadas[r];
          if (tp && !tp.primeraCol) continue;   // tapada a la derecha: va dentro del gridSpan
          const sp = tp ? spans[tp.tl] : spans[r];
          const base = tp ? F().parseRef(tp.tl) : { c, f };
          const refBase = tp ? tp.tl : r;
          const ancho = anchos.slice(c, c + (sp ? sp[0] : 1)).reduce((s2, v) => s2 + v, 0);
          const fondo = hexW(b["r:" + refBase]) || (b.encabezado && f === 0 ? "F2F2F2" : null);
          const tcPr = `<w:tcW w:w="${ancho}" w:type="dxa"/>${sp && sp[0] > 1 ? `<w:gridSpan w:val="${sp[0]}"/>` : ""}${sp && sp[1] > 1 ? (tp ? '<w:vMerge/>' : '<w:vMerge w:val="restart"/>') : ""}${fondo ? `<w:shd w:val="clear" w:color="auto" w:fill="${fondo}"/>` : ""}`;
          const a2 = { b: !!b["n:" + refBase] || (b.encabezado && f === 0), i: !!b["i:" + refBase], color: b["k:" + refBase] || null };
          const jc = ALIN_WORD[b["al:" + refBase]];
          const v = tp ? "" : String(b["c:" + r] || "");
          void base;
          t += `<w:tc><w:tcPr>${tcPr}</w:tcPr>${v.split("\n").map((l) => `<w:p><w:pPr><w:spacing w:after="0"/><w:ind w:firstLine="0"/>${jc ? `<w:jc w:val="${jc}"/>` : ""}</w:pPr>${l ? texto(l, a2) : ""}</w:p>`).join("")}</w:tc>`;
        }
        t += "</w:tr>";
      }
      return t + "</w:tbl>";
    };

    // ---------------------------------------------------------- a partir del archivo original
    /**
     * Arma el cuerpo con las unidades del documento.xml de origen: la que no cambió (misma huella que
     * al importar) sale textual; la que cambió se escribe de nuevo, con el formato de párrafo original
     * si ese no se tocó. Lo que NOM-COLAB no muestra (marcadores, controles) se queda en su lugar.
     */
    function cuerpoConOrigen() {
      const O = NOM.origen, H = O.huella, pq = paqueteDe(og);
      const relDoc = pq.rels("").find((r) => /\/officeDocument$/.test(r.tipo || ""));
      const DOC = relDoc ? pq.resolver("", relDoc.destino) : "word/document.xml";
      const xd = pq.texto(DOC);
      if (!xd) throw new Error("falta el documento principal");
      const raiz = O.hijosXml(xd).find((h) => O.local(h.n) === "document");
      if (!raiz || raiz.n !== "w:document") throw new Error("el documento usa otro prefijo");
      const body = O.hijoXml(xd, "body", raiz.ci, raiz.cf);
      if (!body) throw new Error("documento sin cuerpo");
      const us = O.hijosXml(xd, body.ci, body.cf), hu = og.h.u || {};
      const relsD = pq.rels(DOC), carpeta = DOC.slice(0, DOC.lastIndexOf("/") + 1);
      const parte = (re) => { const r = relsD.find((q) => re.test(q.tipo || "")); return r ? pq.resolver(DOC, r.destino) : null; };
      // ---- numeración propia que no choque con la del original
      let g = 1;
      while (relsD.some((r) => (r.id || "").startsWith("rIdNom" + g)) || pq.tiene(`${carpeta}media/nom${g}-imagen1.png`) || pq.tiene(`${carpeta}media/nom${g}-imagen1.jpeg`)) g++;
      PRE = "Nom" + g; baseDib = 7000 + g * 500;
      const numRuta = parte(/\/numbering$/), numTxt = numRuta ? pq.texto(numRuta) : null;
      if (numTxt) {
        (numTxt.match(/w:abstractNumId="(\d+)"/g) || []).forEach((m) => { baseAbs = Math.max(baseAbs, +m.replace(/\D/g, "") + 1); });
        (numTxt.match(/<w:num [^>]*w:numId="(\d+)"/g) || []).forEach((m) => { baseNum = Math.max(baseNum, +/w:numId="(\d+)"/.exec(m)[1] + 1); });
      }
      const notaRuta = parte(/\/footnotes$/), notaTxt = notaRuta ? pq.texto(notaRuta) : null;
      if (notaTxt) (notaTxt.match(/<w:footnote [^>]*w:id="(-?\d+)"/g) || []).forEach((m) => { baseNota = Math.max(baseNota, +/w:id="(-?\d+)"/.exec(m)[1]); });
      // ---- estilos: los de NOM-COLAB se cambian por los del original que se llamen igual
      const estRuta = parte(/\/styles$/), estTxt = estRuta ? pq.texto(estRuta) : null;
      const porNombre = {}, idsEst = new Set();
      let normal = "Normal";
      if (estTxt) {
        const re = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g;
        let m;
        while ((m = re.exec(estTxt))) {
          const id = (/w:styleId="([^"]*)"/.exec(m[1]) || [])[1], nm = (/<w:name w:val="([^"]*)"/.exec(m[2]) || [])[1];
          if (id == null) continue;
          idsEst.add(id);
          if (nm && porNombre[nm.toLowerCase()] == null) porNombre[nm.toLowerCase()] = id;
          if (/w:type="paragraph"/.test(m[1]) && /w:default="(1|true)"/.test(m[1])) normal = id;
        }
      }
      const NOMBRES = { Title: "title", Subtitle: "subtitle", Heading1: "heading 1", Heading2: "heading 2", Heading3: "heading 3", Quote: "quote", Codigo: "código", ListParagraph: "list paragraph", Caption: "caption",
        TextoNota: "footnote text", RefNota: "footnote reference", TOCHeading: "toc heading", TDC1: "toc 1", TDC2: "toc 2", TDC3: "toc 3", Hyperlink: "hyperlink", TablaNom: "table grid", Header: "header", Footer: "footer" };
      const faltan = new Map();   // id nuestro → id con el que se agrega al original
      const idEstilo = (id) => {
        const nm = NOMBRES[id];
        if (!nm) return id;
        if (porNombre[nm] != null) return porNombre[nm];
        if (!faltan.has(id)) faltan.set(id, idsEst.has(id) ? "Nom" + id : id);
        return faltan.get(id);
      };
      const conEstilos = (t) => t.replace(/<w:(pStyle|rStyle|tblStyle) w:val="([^"]+)"\/>/g, (m, tag, id) => `<w:${tag} w:val="${idEstilo(id)}"/>`);
      // ---- objetos que salen tal cual (imagen, ecuación, llamada de nota) si su bloque no cambió
      const igualQueAlImportar = (ref) => { const hb = og.h.b && og.h.b[ref]; return !!hb && (Array.isArray(hb) ? hb[0] : hb) === NOM.formatos.huellaBloque(doc, ref); };
      const objetoDe = (u) => (e) => {
        if (!e.oe || (e.tipo !== "objeto" && (!e.ref || !igualQueAlImportar(e.ref)))) return null;
        const k = String(e.oe).lastIndexOf(":"), nombre = String(e.oe).slice(0, k), ord = +String(e.oe).slice(k + 1);
        const re = new RegExp("<(?:\\w+:)?" + nombre + "(?=[\\s/>])", "g");
        re.lastIndex = u.i;
        let m, n = -1;
        while ((m = re.exec(xd)) && m.index < u.f) { if (++n === ord) break; }
        if (!m || m.index >= u.f || n !== ord) return null;
        const el = O.hijosXml(xd, m.index, u.f)[0];
        if (!el) return null;
        if (nombre === "oMath" || nombre === "oMathPara") return xd.slice(el.i, el.f);
        let p = m.index;
        for (;;) { p = xd.lastIndexOf("<w:r", p - 1); if (p < u.i) return null; const c = xd.charCodeAt(p + 4); if (c === 62 || c === 32) break; }
        const run = O.hijosXml(xd, p, u.f)[0];
        if (!run || run.f < el.f) return null;
        // si la corrida trae además texto, ese texto ya va por su lado: no se repite
        if (/<w:t[ >]/.test(xd.slice(run.ci, el.i) + xd.slice(el.f, run.cf))) return null;
        return xd.slice(run.i, run.f);
      };
      const numDe = (k) => { const u = elDe(k); if (!u || O.local(u.n) !== "p") return null; const pp = O.hijoXml(xd, "pPr", u.ci, u.cf); const m = pp && /<w:numId w:val="(\d+)"\/>/.exec(xd.slice(pp.i, pp.f)); return m && m[1] !== "0" ? m[1] : null; };
      /** Para un renglón de lista nuevo: la numeración de su vecino (el anterior de la misma lista, o el siguiente). */
      const numVecino = (q) => {
        const tipo = ps[q].pa.lista;
        if (tipo !== "vinetas" && tipo !== "numeros") return null;
        for (let t = q - 1; t >= 0 && ps[t].pa.lista === tipo; t--) if (ps[t].pa.ox != null && hu[ps[t].pa.ox]) { const n = numDe(ps[t].pa.ox); if (n) return n; }
        for (let t = q + 1; t < ps.length && ps[t].pa.lista === tipo; t++) if (ps[t].pa.ox != null && hu[ps[t].pa.ox]) { const n = numDe(ps[t].pa.ox); if (n) return n; }
        return null;
      };
      const gen = (q, u, mismoPa, ultimo) => {
        const U = { ppr: null, sect: "", objeto: u ? objetoDe(u) : null, numId: null };
        if (u && O.local(u.n) === "p") {
          const pp = O.hijoXml(xd, "pPr", u.ci, u.cf);
          if (mismoPa) { U.ppr = pp ? xd.slice(pp.i, pp.f) : ""; if (!ultimo) U.ppr = U.ppr.replace(/<w:sectPr\b[^>]*\/>|<w:sectPr\b[\s\S]*<\/w:sectPr>/, ""); }
          else {
            const sect = pp && ultimo ? O.hijoXml(xd, "sectPr", pp.ci, pp.cf) : null;
            if (sect) U.sect = xd.slice(sect.i, sect.f);
            U.numId = numVecino(q);
          }
        } else U.numId = numVecino(q);
        return conEstilos(xmlParrafo(ps[q], q, U));
      };
      // ---- recorrer el documento actual y decidir unidad por unidad
      const piezas = [], usados = new Set(), cacheEl = new Map();
      let suelta = 0, textuales = 0, regeneradas = 0;
      const topDe = (ox) => +String(ox).split(".")[0];
      /** La unidad del original a la que apunta un ox ("7" = hijo 7 del cuerpo; "7.2" = dentro de su control de contenido). */
      const elDe = (ox) => {
        const c = String(ox);
        if (cacheEl.has(c)) return cacheEl.get(c);
        const partes = c.split(".");
        let u = us[+partes[0]] || null;
        for (let d = 1; d < partes.length && u; d++) { const cont = O.hijoXml(xd, "sdtContent", u.ci, u.cf); u = cont ? O.hijosXml(xd, cont.ci, cont.cf)[+partes[d]] || null : null; }
        cacheEl.set(c, u);
        return u;
      };
      const modeladas = new Set(), hojas = {};
      Object.keys(hu).forEach((c) => { modeladas.add(topDe(c)); if (c.includes(".")) (hojas[topDe(c)] = hojas[topDe(c)] || []).push(c); });
      const porRuta = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let d = 0; d < Math.max(x.length, y.length); d++) { if ((x[d] || 0) !== (y[d] || 0)) return (x[d] || 0) - (y[d] || 0); } return 0; };
      Object.values(hojas).forEach((l) => l.sort(porRuta));
      // El espacio en blanco que el original tenía antes de una unidad que sale tal cual (sangría del XML):
      // así un documento que no cambió sale idéntico byte por byte aunque se arme pieza por pieza.
      const antesDe = (el) => { const idx = us.indexOf(el); if (idx < 0) return ""; const g = xd.slice(idx === 0 ? body.ci : us[idx - 1].f, el.i); return /^\s*$/.test(g) ? g : ""; };
      const sueltas = (hasta) => { for (; suelta < hasta; suelta++) { const u = us[suelta]; if (!modeladas.has(suelta) && O.local(u.n) !== "sectPr") piezas.push(antesDe(u) + xd.slice(u.i, u.f)); } };
      for (let i = 0; i < ps.length;) {
        const k = ps[i].pa.ox, u = k != null && hu[k] != null && !usados.has(String(k)) ? elDe(k) : null;
        if (!u) { piezas.push(gen(i, null, false, true)); regeneradas++; i++; continue; }
        const top = topDe(k);
        sueltas(top);
        // Un control de contenido (portada, índice…) con todo su contenido intacto sale entero, con su envoltura.
        if (String(k).includes(".") && hojas[top] && hojas[top][0] === String(k)) {
          let q = i, entero = true;
          for (const hk of hojas[top]) {
            if (q >= ps.length || String(ps[q].pa.ox) !== hk) { entero = false; break; }
            let j2 = q;
            while (j2 + 1 < ps.length && String(ps[j2 + 1].pa.ox) === hk) j2++;
            if (huellaGrupo(ps.slice(q, j2 + 1)) !== hu[hk][0]) { entero = false; break; }
            q = j2 + 1;
          }
          if (entero) { piezas.push(antesDe(us[top]) + xd.slice(us[top].i, us[top].f)); hojas[top].forEach((hk) => usados.add(hk)); textuales++; i = q; continue; }
        }
        let j = i;
        while (j + 1 < ps.length && ps[j + 1].pa.ox === k) j++;
        usados.add(String(k));
        const grupo = ps.slice(i, j + 1);
        if (huellaGrupo(grupo) === hu[k][0]) { piezas.push(antesDe(u) + xd.slice(u.i, u.f)); textuales++; }
        else {
          // La unidad cambió (se editó, o se partió con Enter). Párrafo por párrafo: el que sigue igual
          // que el original sale textual; los demás se escriben de nuevo con el formato de párrafo original.
          let textual = false;
          for (let q = i; q <= j; q++) {
            const p = ps[q], unico = p.tramos.length === 1 && p.tramos[0].e;
            if (!textual && grupo.length > 1 && huellaGrupo([p]) === hu[k][0]) { piezas.push(xd.slice(u.i, u.f)); textual = true; textuales++; continue; }
            const ant = piezas[piezas.length - 1];
            if (unico && unico.tipo === "salto" && q > i && ant && ant.endsWith("</w:p>") && !textual) { piezas[piezas.length - 1] = ant.slice(0, -6) + '<w:r><w:br w:type="page"/></w:r></w:p>'; continue; }
            piezas.push(gen(q, u, H(sinOx(p.pa)) === hu[k][1], q === j)); regeneradas++;
          }
        }
        i = j + 1;
      }
      sueltas(us.length);
      const cuerpo = piezas.join("");

      function ensamblar(E) {
        const cambio = (k) => { const v = doc.valor("_doc", k), h0 = og.h.d ? og.h.d[k] : undefined; return v == null ? h0 != null : h0 !== H(v); };
        // ---- sección final: tamaño, márgenes y encabezados solo si la persona los cambió
        const su = us.find((h) => O.local(h.n) === "sectPr");
        let sect = su ? xd.slice(su.i, su.f) : "<w:sectPr/>";
        if (cambio("pagina")) {
          const mar = `<w:pgMar w:top="${E.mv(E.m.s)}" w:right="${E.mv(E.m.d)}" w:bottom="${E.mv(E.m.i)}" w:left="${E.mv(E.m.iz)}" w:header="720" w:footer="720" w:gutter="0"/>`;
          sect = sect.replace(/<w:pgSz\b[^>]*\/>/, "").replace(/<w:pgMar\b[^>]*\/>/, "");
          sect = /<w:sectPr\b[^>]*\/>$/.test(sect) ? sect.replace(/\/>$/, ">") + E.pgSz + mar + "</w:sectPr>" : sect.replace(/(<w:sectPr\b[^>]*>(?:\s*<w:(?:headerReference|footerReference|footnotePr|endnotePr|type)\b[^>]*\/>)*)/, "$1" + E.pgSz + mar);
        }
        const CAMPOS_EP = ["encabezado", "pie", "numeros", "numPos", "numFmt", "numInicio", "primeraDistinta", "encAlin", "pieAlin", "encabezadoImg", "marcaAgua"];
        const epCambio = CAMPOS_EP.some(cambio);
        const sufijo = PRE;
        if (epCambio) {
          const refs = E.refs.replace(/r:id="(rId\w+)"/g, `r:id="$1${sufijo}"`);
          sect = sect.replace(/<w:(headerReference|footerReference)\b[^>]*\/>/g, "").replace(/<w:titlePg\b[^>]*\/>/, "");
          sect = /<w:sectPr\b[^>]*\/>$/.test(sect) ? sect.replace(/\/>$/, ">") + refs + (E.primera ? "<w:titlePg/>" : "") + "</w:sectPr>" : sect.replace(/(<w:sectPr\b[^>]*>)/, "$1" + refs).replace(/<\/w:sectPr>$/, (E.primera ? "<w:titlePg/>" : "") + "</w:sectPr>");
          E.extras.forEach((e) => {
            const nombre = e.nombre.replace(/^word\//, carpeta).replace(/(header|footer)(\d)\.xml/, "nom" + g + "$1$2.xml");
            pq.pon(nombre, e.datos);
            if (!/_rels\//.test(nombre)) pq.tipo(nombre, "application/vnd.openxmlformats-officedocument.wordprocessingml." + (/header/.test(nombre) ? "header" : "footer") + "+xml");
          });
          rels.filter((r) => r.tipo === T.encabezado || r.tipo === T.pie).forEach((r) => pq.agregaRel(DOC, r.id + sufijo, r.tipo, r.destino.replace(/(header|footer)(\d)\.xml/, "nom" + g + "$1$2.xml")));
        }
        // ---- raíz: que estén declarados los prefijos que usa lo nuevo
        let abre = xd.slice(0, body.ci);
        const NS = { r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships", wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", m: "http://schemas.openxmlformats.org/officeDocument/2006/math" };
        const etiqueta = xd.slice(raiz.i, raiz.ci);
        let extra = "";
        Object.keys(NS).forEach((p) => { if (!new RegExp("\\sxmlns:" + p + "\\s*=").test(etiqueta)) extra += ` xmlns:${p}="${NS[p]}"`; });
        if (extra) abre = xd.slice(0, raiz.ci - 1) + extra + ">" + xd.slice(raiz.ci, body.ci);
        // Lo de alrededor de la sección final (saltos de línea del original) también se conserva.
        const antesSect = su ? antesDe(su) : "", trasSect = su && /^\s*$/.test(xd.slice(su.f, body.cf)) ? xd.slice(su.f, body.cf) : "";
        pq.pon(DOC, abre + cuerpo + antesSect + sect + trasSect + xd.slice(body.cf));
        // ---- relaciones e imágenes nuevas
        const usadosEnCuerpo = (id) => cuerpo.includes('"' + id + '"');
        rels.filter((r) => (r.tipo === T.img || r.tipo === T.enlace) && usadosEnCuerpo(r.id)).forEach((r) => pq.agregaRel(DOC, r.id, r.tipo, r.destino, r.externo));
        medios.filter((mm) => epCambio || !/media\/(logo|marca)\./.test(mm.nombre)).forEach((mm) => {
          pq.pon(mm.nombre.replace(/^word\//, carpeta), mm.datos);
          pq.extension(mm.nombre.split(".").pop(), /png$/.test(mm.nombre) ? "image/png" : "image/jpeg");
        });
        // ---- numeración nueva (listas hechas en NOM-COLAB)
        if (instancias.length) {
          const abs = (E.numeracion.match(/<w:abstractNum w:abstractNumId="\d+">[\s\S]*?<\/w:abstractNum>/g) || []).filter((t) => +/abstractNumId="(\d+)"/.exec(t)[1] >= baseAbs).join("");
          const nums = (E.numeracion.match(/<w:num w:numId="\d+">[\s\S]*?<\/w:num>/g) || []).filter((t) => +/numId="(\d+)"/.exec(t)[1] >= baseNum).join("");
          if (numTxt) {
            const r0 = O.hijosXml(numTxt).find((h) => O.local(h.n) === "numbering"), hs = O.hijosXml(numTxt, r0.ci, r0.cf);
            const primerNum = hs.find((h) => O.local(h.n) === "num" || O.local(h.n) === "numIdMacAtCleanup"), limpia = hs.find((h) => O.local(h.n) === "numIdMacAtCleanup");
            const p1 = primerNum ? primerNum.i : r0.cf, p2 = limpia ? limpia.i : r0.cf;
            // una raíz vacía (<w:numbering/>) se abre para poder meterle contenido
            if (r0.ci === r0.f) pq.pon(numRuta, numTxt.slice(0, r0.af) + ">" + abs + nums + "</" + r0.n + ">" + numTxt.slice(r0.f));
            else pq.pon(numRuta, aplicarPiezas(numTxt, [[p1, p1, abs], [p2, p2, nums]]));
          } else {
            pq.pon(carpeta + "numbering.xml", XML + `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${abs}${nums}</w:numbering>`);
            pq.tipo(carpeta + "numbering.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml");
            pq.agregaRel(DOC, "rId" + PRE + "Num", T.num, "numbering.xml");
          }
        }
        // ---- notas al pie nuevas
        if (notas.length) {
          const nuevas = (E.notasXml.match(/<w:footnote w:id="\d+">[\s\S]*?<\/w:footnote>/g) || []).filter((t) => +/w:id="(\d+)"/.exec(t)[1] > baseNota).join("");
          if (notaTxt) { const k = notaTxt.lastIndexOf("</w:footnotes>"); pq.pon(notaRuta, notaTxt.slice(0, k) + conEstilos(nuevas) + notaTxt.slice(k)); }
          else {
            pq.pon(carpeta + "footnotes.xml", conEstilos(E.notasXml));
            pq.tipo(carpeta + "footnotes.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml");
            pq.agregaRel(DOC, "rId" + PRE + "Notas", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes", "footnotes.xml");
          }
        }
        // ---- estilos de NOM-COLAB que el original no tenía
        if (faltan.size) {
          let defs = "";
          faltan.forEach((idNuevo, id) => {
            const m = new RegExp('<w:style [^>]*w:styleId="' + id + '">[\\s\\S]*?</w:style>').exec(E.estilos);
            if (m) defs += m[0].replace('w:styleId="' + id + '"', 'w:styleId="' + idNuevo + '"').replace(/<w:(basedOn|next) w:val="Normal"\/>/g, `<w:$1 w:val="${normal}"/>`);
          });
          if (estTxt) { const k = estTxt.lastIndexOf("</w:styles>"); if (k > 0) pq.pon(estRuta, estTxt.slice(0, k) + defs + estTxt.slice(k)); }
          else {
            pq.pon(carpeta + "styles.xml", XML + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${defs}</w:styles>`);
            pq.tipo(carpeta + "styles.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml");
            pq.agregaRel(DOC, "rId" + PRE + "Est", T.estilos, "styles.xml");
          }
        }
        return pq.zip();
      }
      return { cuerpo, ensamblar, textuales, regeneradas };
    }
    const titulos = ps.filter((p) => /^h[1-3]$/.test(p.pa.estilo || ""));
    const xmlParrafo = (p, i, U) => {
      const pa = p.pa, unico = p.tramos.length === 1 && p.tramos[0].e;
      if (unico && unico.tipo === "tabla") return tabla(unico) + (i === ps.length - 1 ? "<w:p/>" : "");
      if (unico && unico.tipo === "salto") return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      if (unico && unico.tipo === "linea") return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="8E8E8E"/></w:pBdr></w:pPr></w:p>';
      if (unico && unico.tipo === "indice") {
        // Campo TOC de Word con las entradas ya escritas (Word lo puede actualizar con F9).
        const ent = titulos.map((t) => `<w:p><w:pPr><w:pStyle w:val="TDC${t.pa.estilo.slice(1)}"/></w:pPr>${texto(t.tramos.map((z) => z.x || "").join(""), {})}</w:p>`).join("");
        return `<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t>Contenido</w:t></w:r></w:p><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r></w:p>${ent}<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
      }
      let ppr = "";
      if (ESTILO_WORD[pa.estilo]) ppr += `<w:pStyle w:val="${ESTILO_WORD[pa.estilo]}"/>`;
      else if (pa.lista) ppr += '<w:pStyle w:val="ListParagraph"/>';
      if (U && U.numId && (pa.lista === "vinetas" || pa.lista === "numeros")) {
        // sigue la lista del archivo original (misma numeración que sus vecinos)
        ppr += `<w:numPr><w:ilvl w:val="${pa.nivel || 0}"/><w:numId w:val="${U.numId}"/></w:numPr>`;
      } else if (pa.lista === "vinetas") {
        if (!numActual || numActual.tipo !== "v" + (pa.vineta || "")) numActual = { tipo: "v" + (pa.vineta || ""), id: nuevaInstancia("v" + (pa.vineta || "•")) };
        ppr += `<w:numPr><w:ilvl w:val="${pa.nivel || 0}"/><w:numId w:val="${numActual.id}"/></w:numPr>`;
      } else if (pa.lista === "numeros") {
        const clave = "n" + (pa.numfmt || "1.");
        const inicio = pa.inicio != null && pa.inicio !== "" ? +pa.inicio : null;
        if (pa.continuar && numAnterior && !numActual) numActual = numAnterior;
        if (!numActual || numActual.tipo !== clave || inicio != null) numActual = { tipo: clave, id: nuevaInstancia(clave, inicio != null ? inicio : 1) };
        ppr += `<w:numPr><w:ilvl w:val="${pa.nivel || 0}"/><w:numId w:val="${numActual.id}"/></w:numPr>`;
      } else if (pa.lista !== "tareas") { if (numActual) numAnterior = numActual; numActual = null; }
      const cm = (v) => Math.round((+v || 0) * CMT);
      if (pa.lista === "tareas") ppr += `<w:ind w:left="${360 * ((pa.nivel || 0) + 1)}" w:hanging="360"/>`;
      else if (!pa.lista && (pa.sangria || pa.sangiz || pa.sangder || pa.primera != null || pa.francesa)) {
        const izq = (pa.sangria || 0) * 720 + cm(pa.sangiz) + cm(pa.francesa);
        ppr += `<w:ind w:left="${izq}"${pa.sangder ? ` w:right="${cm(pa.sangder)}"` : ""}${+pa.francesa ? ` w:hanging="${cm(pa.francesa)}"` : pa.primera != null ? ` w:firstLine="${cm(pa.primera)}"` : ""}/>`;
      } else if (pa.estilo && pa.estilo !== "cita") ppr += '<w:ind w:firstLine="0"/>';
      const linea = +pa.lineaPt ? ` w:line="${Math.round(+pa.lineaPt * 20)}" w:lineRule="exact"` : pa.interlineado ? ` w:line="${Math.round(pa.interlineado * 240)}" w:lineRule="auto"` : "";
      // (orden del esquema: bordes, fondo, sentido, espacio, sangría, alineación)
      const ind = /<w:ind [^>]*\/>$/.exec(ppr);
      if (ind) ppr = ppr.slice(0, ind.index);
      const bm = /^(\d+(?:\.\d+)?) (solid|double|dotted|dashed) (#[0-9A-Fa-f]{6}) ([sizd]{1,4})$/.exec(pa.borde || "");
      if (bm) {
        const valW = { solid: "single", double: "double", dotted: "dotted", dashed: "dashed" }[bm[2]], sz = Math.max(2, Math.round((bm[2] === "double" ? +bm[1] / 3 : +bm[1]) * 8));
        ppr += `<w:pBdr>${[["s", "top"], ["z", "left"], ["i", "bottom"], ["d", "right"]].filter(([k]) => bm[4].includes(k)).map(([, l]) => `<w:${l} w:val="${valW}" w:sz="${sz}" w:space="4" w:color="${bm[3].slice(1).toUpperCase()}"/>`).join("")}</w:pBdr>`;
      }
      if (hexW(pa.sombra)) ppr += `<w:shd w:val="clear" w:color="auto" w:fill="${hexW(pa.sombra)}"/>`;
      if (pa.dir === "rtl") ppr += "<w:bidi/>";
      if (pa.antes != null || pa.despues != null || linea) ppr += `<w:spacing${pa.antes != null ? ` w:before="${Math.round(pa.antes * 20)}"` : ""}${pa.despues != null ? ` w:after="${Math.round(pa.despues * 20)}"` : ""}${linea}/>`;
      if (ind) ppr += ind[0];
      if (ALIN_WORD[pa.alin]) ppr += `<w:jc w:val="${ALIN_WORD[pa.alin]}"/>`;
      let runs = pa.lista === "tareas" ? texto(pa.hecho ? "☑\t" : "☐\t", {}) : "";
      let despues = "";
      p.tramos.forEach((t) => {
        if (t.e) {
          // un objeto que no cambió desde que se importó sale tal cual estaba en el archivo original
          const tal = U && U.objeto && t.e.oe ? U.objeto(t.e) : null;
          if (tal) { runs += tal; return; }
          if (t.e.tipo === "imagen") {
            runs += dibujo(t.e.src, t.e.w, t.e.alt, t.e.recorte, t.e.rot);
            if (t.e.pie) despues += `<w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr>${texto("Figura " + ++nFigura + ". ", { b: true })}${texto(t.e.pie, {})}</w:p>`;
          } else if (t.e.tipo === "nota") {
            notas.push(t.e.texto || "");
            runs += `<w:r><w:rPr><w:rStyle w:val="RefNota"/></w:rPr><w:footnoteReference w:id="${baseNota + notas.length}"/></w:r>`;
          } else if (t.e.tipo === "ecuacion" && NOM.ecuaciones) {
            runs += t.e.bloque ? `<m:oMathPara>${NOM.ecuaciones.omml(t.e.tex || "")}</m:oMathPara>` : NOM.ecuaciones.omml(t.e.tex || "");
          } else if (t.e.texto != null && t.e.tipo !== "tabla") runs += texto(String(t.e.texto), t.a || {});
          return;
        }
        const a = Object.assign({}, t.a, pa.hecho ? { s: true } : {});
        if (a.enlace && /^(https?:|mailto:)/i.test(a.enlace)) {
          const id = "rId" + PRE + "Link" + ++nLink;
          rels.push({ id, tipo: T.enlace, destino: a.enlace, externo: true });
          runs += `<w:hyperlink r:id="${id}" w:history="1">${texto(t.x, Object.assign({}, a)).replace(/<w:rPr>/g, '<w:rPr><w:rStyle w:val="Hyperlink"/>').replace(/<w:r>(?!<w:rPr>)/g, '<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>')}</w:hyperlink>`;
        } else runs += texto(t.x, a);
      });
      const pprXml = U && U.ppr != null ? U.ppr : ppr || (U && U.sect) ? `<w:pPr>${ppr}${(U && U.sect) || ""}</w:pPr>` : "";
      return `<w:p>${pprXml}${runs}</w:p>${despues}`;
    };
    const OGR = og ? cuerpoConOrigen() : null;
    const cuerpo = OGR ? OGR.cuerpo : ps.map((p, i) => xmlParrafo(p, i, null)).join("\n");

    // Página, encabezado y pie (8.2: número donde se elija, "Página 1 de 5", primera página distinta,
    // logo y marca de agua).
    const pag = pagDoc;
    const TAM = TAM0;
    const hor = pag.orient === "h", m = pag.margen || {};
    const mv = (v) => Math.round((typeof v === "number" ? v : 96) * TWIP);
    const ep2 = {
      enc: doc.valor("_doc", "encabezado") || "", pie: doc.valor("_doc", "pie") || "", nums: doc.valor("_doc", "numeros") !== false,
      pos: doc.valor("_doc", "numPos") || "pie-der", fmt: doc.valor("_doc", "numFmt") || "n", inicio: +doc.valor("_doc", "numInicio") || 1,
      primera: !!doc.valor("_doc", "primeraDistinta"), encAl: doc.valor("_doc", "encAlin") || "izq", pieAl: doc.valor("_doc", "pieAlin") || "izq",
      logo: doc.valor("_doc", "encabezadoImg") || null, marca: doc.valor("_doc", "marcaAgua") || "",
    };
    const extras = [];
    let refs = "";
    const NSW = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const campo = (instr, ej) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${ej}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    const numero = () => ({ pagina: texto("Página ", {}) + campo("PAGE", "1"), total: campo("PAGE", "1") + texto(" de ", {}) + campo("NUMPAGES", "1"), "pagina-total": texto("Página ", {}) + campo("PAGE", "1") + texto(" de ", {}) + campo("NUMPAGES", "1") }[ep2.fmt] || campo("PAGE", "1"));
    /** Un renglón con tres lugares (izquierda, centro y derecha) separados por tabuladores. */
    const renglon = (zona, txt, al, prefijo) => {
      const slots = { izq: "", centro: "", der: "" };
      if (txt) slots[al] += texto(txt, {});
      const [zn, an] = ep2.pos.split("-");
      if (ep2.nums && zn === zona) slots[an] += (slots[an] ? '<w:r><w:t xml:space="preserve">  </w:t></w:r>' : "") + numero();
      const media = Math.round(anchoTexto / 2);
      return `<w:p><w:pPr><w:pStyle w:val="${zona === "enc" ? "Header" : "Footer"}"/><w:tabs><w:tab w:val="clear" w:pos="4680"/><w:tab w:val="clear" w:pos="9360"/><w:tab w:val="center" w:pos="${media}"/><w:tab w:val="right" w:pos="${anchoTexto}"/></w:tabs></w:pPr>${prefijo || ""}${slots.izq}<w:r><w:tab/></w:r>${slots.centro}<w:r><w:tab/></w:r>${slots.der}</w:p>`;
    };
    const relsEnc = [];
    let logoXml = "", marcaXml = "";
    if (ep2.logo && ep2.logo.src) {
      const im = imagen(ep2.logo.src);
      if (im) {
        medios.push({ nombre: `word/media/logo.${im.ext}`, datos: im.bytes });
        relsEnc.push({ id: "rIdLogo", tipo: T.img, destino: `media/logo.${im.ext}` });
        const alto = Math.min(80, +ep2.logo.alto || 36), cy = Math.round(alto * EMU), cx = Math.round(alto * (im.w / im.h) * EMU);
        logoXml = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="114300"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="900" name="Logo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="900" name="logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
      }
    }
    if (ep2.marca) {
      // La marca de agua es una imagen (texto gris girado) detrás del texto, centrada en la hoja.
      const png = marcaPng(ep2.marca);
      if (png) {
        medios.push({ nombre: "word/media/marca.png", datos: png.bytes });
        relsEnc.push({ id: "rIdMarca", tipo: T.img, destino: "media/marca.png" });
        const cx = Math.round(png.w * EMU * 0.75), cy = Math.round(png.h * EMU * 0.75);
        marcaXml = `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH><wp:positionV relativeFrom="page"><wp:align>center</wp:align></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="901" name="Marca de agua"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="901" name="marca"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdMarca"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
      }
    }
    const [zonaNum] = ep2.pos.split("-");
    const hayEnc = ep2.enc || logoXml || marcaXml || (ep2.nums && zonaNum === "enc");
    const hayPie = ep2.pie || (ep2.nums && zonaNum === "pie");
    if (hayEnc) {
      rels.push({ id: "rIdEnc", tipo: T.encabezado, destino: "header1.xml" });
      extras.push({ nombre: "word/header1.xml", datos: XML + `<w:hdr ${NSW}>${renglon("enc", ep2.enc, ep2.encAl, logoXml + marcaXml)}</w:hdr>` });
      if (relsEnc.length) extras.push({ nombre: "word/_rels/header1.xml.rels", datos: RELS(relsEnc) });
      refs += '<w:headerReference w:type="default" r:id="rIdEnc"/>';
    }
    if (hayPie) {
      rels.push({ id: "rIdPie", tipo: T.pie, destino: "footer1.xml" });
      extras.push({ nombre: "word/footer1.xml", datos: XML + `<w:ftr ${NSW}>${renglon("pie", ep2.pie, ep2.pieAl)}</w:ftr>` });
      refs += '<w:footerReference w:type="default" r:id="rIdPie"/>';
    }
    if (ep2.primera && (hayEnc || hayPie)) {
      // Primera página distinta: encabezado y pie vacíos.
      rels.push({ id: "rIdEnc1", tipo: T.encabezado, destino: "header2.xml" }, { id: "rIdPie1", tipo: T.pie, destino: "footer2.xml" });
      extras.push({ nombre: "word/header2.xml", datos: XML + `<w:hdr ${NSW}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr></w:p></w:hdr>` }, { nombre: "word/footer2.xml", datos: XML + `<w:ftr ${NSW}><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr></w:p></w:ftr>` });
      refs += '<w:headerReference w:type="first" r:id="rIdEnc1"/><w:footerReference w:type="first" r:id="rIdPie1"/>';
    }
    if (notas.length) rels.push({ id: "rIdNotas", tipo: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes", destino: "footnotes.xml" });
    const notasXml = XML + `<w:footnotes ${NSW}><w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${notas.map((t, i) => `<w:footnote w:id="${baseNota + i + 1}"><w:p><w:pPr><w:pStyle w:val="TextoNota"/></w:pPr><w:r><w:rPr><w:rStyle w:val="RefNota"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> ${x(t)}</w:t></w:r></w:p></w:footnote>`).join("")}</w:footnotes>`;
    const documento = XML + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
<w:body>${cuerpo || "<w:p/>"}<w:sectPr>${refs}<w:pgSz w:w="${(hor ? TAM[1] : TAM[0]) * TWIP}" w:h="${(hor ? TAM[0] : TAM[1]) * TWIP}"${hor ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="${mv(m.s)}" w:right="${mv(m.d)}" w:bottom="${mv(m.i)}" w:left="${mv(m.iz)}" w:header="720" w:footer="720" w:gutter="0"/>${ep2.inicio > 1 ? `<w:pgNumType w:start="${ep2.inicio}"/>` : ""}${ep2.primera && (hayEnc || hayPie) ? "<w:titlePg/>" : ""}</w:sectPr></w:body></w:document>`;
    const ep = (id, nombre, rpr, ppr, extra) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${nombre}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>${extra || ""}${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}</w:style>`;
    // 1.4 El formato base del documento (el del espacio) es el estilo Normal de Word.
    const fb = doc.valor("_doc", "formato") || {};
    const ligera = fb.fuente ? `<w:rFonts w:ascii="${x(fb.fuente)}" w:hAnsi="${x(fb.fuente)}"/>` : '<w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:ascii="Calibri Light" w:hAnsi="Calibri Light"/>';
    const estilos = XML + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${x(fb.fuente || "Calibri")}" w:hAnsi="${x(fb.fuente || "Calibri")}" w:eastAsia="${x(fb.fuente || "Calibri")}" w:cs="${x(fb.fuente || "Calibri")}"/><w:sz w:val="${Math.round((+fb.tam || 11) * 2)}"/><w:szCs w:val="${Math.round((+fb.tam || 11) * 2)}"/><w:lang w:val="es-MX"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="${Math.round((+fb.interlineado || 1.15) * 240)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>${+fb.primera ? `<w:pPr><w:ind w:firstLine="${Math.round(+fb.primera * 567)}"/></w:pPr>` : ""}</w:style>
${ep("Caption", "caption", '<w:i/><w:iCs/><w:sz w:val="18"/><w:szCs w:val="18"/>', '<w:spacing w:after="200" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>')}
${ep("TextoNota", "footnote text", '<w:sz w:val="18"/><w:szCs w:val="18"/>', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/>')}
<w:style w:type="character" w:styleId="RefNota"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
${ep("Title", "Title", ligera + '<w:spacing w:val="-10"/><w:kern w:val="28"/><w:sz w:val="56"/><w:szCs w:val="56"/>', '<w:spacing w:after="80" w:line="240" w:lineRule="auto"/><w:contextualSpacing/>')}
${ep("Subtitle", "Subtitle", '<w:color w:val="5A5A5A"/><w:spacing w:val="15"/>', "")}
${ep("Heading1", "heading 1", ligera + '<w:color w:val="2F5496"/><w:sz w:val="32"/><w:szCs w:val="32"/>', '<w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="0"/><w:outlineLvl w:val="0"/>')}
${ep("Heading2", "heading 2", ligera + '<w:color w:val="2F5496"/><w:sz w:val="26"/><w:szCs w:val="26"/>', '<w:keepNext/><w:keepLines/><w:spacing w:before="40" w:after="0"/><w:outlineLvl w:val="1"/>')}
${ep("Heading3", "heading 3", ligera + '<w:color w:val="1F3763"/><w:sz w:val="24"/><w:szCs w:val="24"/>', '<w:keepNext/><w:keepLines/><w:spacing w:before="40" w:after="0"/><w:outlineLvl w:val="2"/>')}
${ep("Quote", "Quote", '<w:i/><w:iCs/><w:color w:val="404040"/>', '<w:spacing w:before="200" w:after="160"/><w:ind w:left="864" w:right="864"/><w:jc w:val="center"/>')}
${ep("Codigo", "Código", '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/>', '<w:shd w:val="clear" w:color="auto" w:fill="F3F3F3"/><w:spacing w:after="0"/>')}
${ep("ListParagraph", "List Paragraph", "", '<w:ind w:left="720"/><w:contextualSpacing/>')}
${ep("TOCHeading", "TOC Heading", ligera + '<w:color w:val="2F5496"/><w:sz w:val="32"/>', '<w:spacing w:before="240" w:after="0"/>')}
${ep("TDC1", "toc 1", "", '<w:spacing w:after="100"/>')}${ep("TDC2", "toc 2", "", '<w:spacing w:after="100"/><w:ind w:left="220"/>')}${ep("TDC3", "toc 3", "", '<w:spacing w:after="100"/><w:ind w:left="440"/>')}
${ep("Header", "header", "", '<w:tabs><w:tab w:val="center" w:pos="4680"/><w:tab w:val="right" w:pos="9360"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>')}
${ep("Footer", "footer", "", '<w:tabs><w:tab w:val="center" w:pos="4680"/><w:tab w:val="right" w:pos="9360"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>')}
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TablaNom"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((l) => `<w:${l} w:val="single" w:sz="4" w:space="0" w:color="8E8E8E"/>`).join("")}</w:tblBorders><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
    const nivel = (i, fmt, txt, fuente) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${txt}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 * (i + 1)}" w:hanging="360"/></w:pPr>${fuente ? `<w:rPr><w:rFonts w:ascii="${fuente}" w:hAnsi="${fuente}"/></w:rPr>` : ""}</w:lvl>`;
    const vin = ["•", "◦", "▪"], fm = ["decimal", "lowerLetter", "lowerRoman"];
    const definicion = (clave, id) => {
      if (clave[0] === "v") {
        const v0 = clave.slice(1) || "•";
        return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, i) => nivel(i, "bullet", i === 0 ? v0 : vin[i % 3], "Calibri")).join("")}</w:abstractNum>`;
      }
      const [f0, t0] = FMT_NUM[clave.slice(1)] || FMT_NUM["1."];
      return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, i) => (i === 0 ? nivel(0, f0, t0) : nivel(i, fm[i % 3], `%${i + 1}.`))).join("")}</w:abstractNum>`;
    };
    const numeracion = XML + `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, i) => nivel(i, "bullet", vin[i % 3], "Calibri")).join("")}</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, i) => nivel(i, fm[i % 3], `%${i + 1}.`)).join("")}</w:abstractNum>
${[...abstractos.entries()].map(([k, id]) => definicion(k, id)).join("")}
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
${instancias.map((n) => `<w:num w:numId="${n.id}"><w:abstractNumId w:val="${n.abs}"/>${n.inicio != null ? `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${n.inicio}"/></w:lvlOverride>` : ""}</w:num>`).join("")}</w:numbering>`;
    const ajustes = XML + `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>${notas.length ? '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' : ""}<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
    if (OGR) return OGR.ensamblar({ estilos, numeracion, notasXml, extras, refs, relsEnc, primera: ep2.primera && (hayEnc || hayPie), pgSz: `<w:pgSz w:w="${(hor ? TAM[1] : TAM[0]) * TWIP}" w:h="${(hor ? TAM[0] : TAM[1]) * TWIP}"${hor ? ' w:orient="landscape"' : ""}/>`, mv, m });
    const titulo = doc.valor("_doc", "nombre") || "Documento";
    // Sin fecha: el mismo documento da siempre exactamente el mismo archivo.
    const nucleo = XML + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${x(titulo)}</dc:title><dc:creator>NOM-COLAB</dc:creator></cp:coreProperties>`;
    return zip([
      { nombre: "[Content_Types].xml", datos: CT(`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${extras.filter((e) => /header\d\.xml$/.test(e.nombre)).map((e) => `<Override PartName="/${e.nombre}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`).join("")}
${extras.filter((e) => /footer\d\.xml$/.test(e.nombre)).map((e) => `<Override PartName="/${e.nombre}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`).join("")}
${notas.length ? '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>' : ""}`) },
      { nombre: "_rels/.rels", datos: RELS([{ tipo: T.doc, destino: "word/document.xml" }, { tipo: T.nucleo, destino: "docProps/core.xml" }]) },
      { nombre: "docProps/core.xml", datos: nucleo },
      { nombre: "word/document.xml", datos: documento },
      { nombre: "word/styles.xml", datos: estilos },
      { nombre: "word/numbering.xml", datos: numeracion },
      { nombre: "word/settings.xml", datos: ajustes },
      { nombre: "word/_rels/document.xml.rels", datos: RELS(rels) },
      ...extras,
      ...(notas.length ? [{ nombre: "word/footnotes.xml", datos: notasXml }] : []),
      ...medios,
    ]);
  }
  /** Marca de agua como imagen PNG (texto gris claro, girado) para Word. */
  function marcaPng(txt) {
    try {
      const cv = document.createElement("canvas"), g = cv.getContext("2d");
      const tam = 110;
      g.font = `900 ${tam}px Calibri, Carlito, Arial, sans-serif`;
      const w = Math.ceil(g.measureText(txt).width) + 40, h = tam + 40;
      const diag = Math.ceil(Math.sqrt(w * w + h * h));
      cv.width = diag; cv.height = Math.ceil(diag * 0.75);
      g.translate(cv.width / 2, cv.height / 2);
      g.rotate(-Math.PI / 5);
      g.font = `900 ${tam}px Calibri, Carlito, Arial, sans-serif`;
      g.fillStyle = "rgba(0, 0, 0, 0.10)";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(txt, 0, 0);
      const datos = cv.toDataURL("image/png"), bin = atob(datos.split(",")[1]), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, w: cv.width, h: cv.height };
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------ leer .docx (importar de Word)
  /** Lector de .zip (origen.js). Se deja "async" porque los lectores de Office lo llaman con await. */
  async function abrirZip(buf) { return NOM.origen.abrirZip(buf); }
  const RESALTE_WORD = { yellow: "#FFFF00", green: "#00FF00", cyan: "#00FFFF", magenta: "#FF00FF", blue: "#0000FF", red: "#FF0000", darkBlue: "#000080", darkCyan: "#008080",
    darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000", darkYellow: "#808000", darkGray: "#808080", lightGray: "#C0C0C0", black: "#000000" };

  /** Ecuación de Word (OMML) → la notación de NOM-COLAB (\\frac, ^, _, \\sqrt…). */
  function ommlATex(n) {
    const hs = (x) => [...(x ? x.childNodes : [])].filter((c) => c.nodeType === 1);
    const h1 = (x, nombre) => hs(x).find((c) => c.localName === nombre) || null;
    const todo = (x) => hs(x).map(ommlATex).join("");
    const g = (x) => { const t = x ? todo(x) : ""; return t.length === 1 ? t : "{" + t + "}"; };
    if (!n) return "";
    switch (n.localName) {
      case "r": return [...n.getElementsByTagNameNS("*", "t")].map((t) => t.textContent).join("");
      case "f": return `\\frac{${todo(h1(n, "num"))}}{${todo(h1(n, "den"))}}`;
      case "sSup": return g(h1(n, "e")) + "^" + g(h1(n, "sup"));
      case "sSub": return g(h1(n, "e")) + "_" + g(h1(n, "sub"));
      case "sSubSup": return g(h1(n, "e")) + "_" + g(h1(n, "sub")) + "^" + g(h1(n, "sup"));
      case "rad": { const d = todo(h1(n, "deg")); return d ? `\\sqrt[${d}]{${todo(h1(n, "e"))}}` : `\\sqrt{${todo(h1(n, "e"))}}`; }
      case "nary": {
        const pr = h1(n, "naryPr"), chr = pr && h1(pr, "chr"), c = chr ? chr.getAttribute("m:val") || chr.getAttributeNS("*", "val") || "∫" : "∫";
        const sub = todo(h1(n, "sub")), sup = todo(h1(n, "sup"));
        return c + (sub ? "_{" + sub + "}" : "") + (sup ? "^{" + sup + "}" : "") + " " + todo(h1(n, "e"));
      }
      case "d": {
        const pr = h1(n, "dPr"), ab = pr && h1(pr, "begChr"), ce = pr && h1(pr, "endChr");
        const a = ab ? ab.getAttribute("m:val") : "(", b = ce ? ce.getAttribute("m:val") : ")";
        return (a == null ? "(" : a) + hs(n).filter((c) => c.localName === "e").map(todo).join(",") + (b == null ? ")" : b);
      }
      case "func": return "\\" + todo(h1(n, "fName")).trim() + " " + todo(h1(n, "e"));
      case "acc": return `\\vec{${todo(h1(n, "e"))}}`;
      case "limLow": return todo(h1(n, "e")) + "_{" + todo(h1(n, "lim")) + "}";
      case "naryPr": case "dPr": case "fPr": case "radPr": case "sSupPr": case "sSubPr": case "accPr": case "ctrlPr": case "rPr": return "";
      default: return todo(n);
    }
  }

  /** .docx → { parrafos: [{ pa, tramos }], pagina, aviso }. */
  async function leerDocx(archivo) {
    if (archivo.size > 30 * 1024 * 1024) throw new Error("El archivo pesa más de 30 MB");
    const u8 = new Uint8Array(await archivo.arrayBuffer());
    const z = NOM.origen.abrirZip(u8);
    let uEl = null;   // la unidad del cuerpo (párrafo o tabla de primer nivel) que se está leyendo
    const ordinal = (c) => (uEl ? c.localName + ":" + Array.prototype.indexOf.call(uEl.getElementsByTagNameNS("*", c.localName), c) : null);
    const xmlDoc = await z.texto("word/document.xml");
    if (!xmlDoc) throw new Error("El archivo no parece un documento de Word (.docx)");
    const P = (t) => new DOMParser().parseFromString(t, "application/xml");
    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const hijos = (n, nombre) => [...(n ? n.childNodes : [])].filter((c) => c.nodeType === 1 && (!nombre || c.localName === nombre));
    const hijo = (n, nombre) => hijos(n, nombre)[0] || null;
    const val = (n) => (n ? n.getAttributeNS(W, "val") || n.getAttribute("w:val") : null);
    const activo = (n) => !!n && !["0", "false", "none"].includes(val(n) || "1");
    // relaciones
    const relsTxt = await z.texto("word/_rels/document.xml.rels");
    const rels = {};
    if (relsTxt) [...P(relsTxt).getElementsByTagName("Relationship")].forEach((r) => (rels[r.getAttribute("Id")] = r.getAttribute("Target")));
    const at = (n, k) => (n ? n.getAttributeNS(W, k) || n.getAttribute("w:" + k) : null);
    const rutaDe = (destino) => (destino.startsWith("/") ? destino.slice(1) : "word/" + destino.replace(/^\.\//, ""));
    // estilos: id → nombre en inglés ("heading 1", "Title"…), y de cada uno su estilo base y sus
    // propiedades, para saber con qué letra y qué espaciado se ve de verdad cada párrafo (en un
    // documento real casi nada trae formato propio: la fuente y el interlineado vienen del estilo)
    const estilos = {}, defEstilo = {};
    let rprDef = null, pprDef = null, idNormal = null;
    const stTxt = await z.texto("word/styles.xml");
    if (stTxt) {
      const ds = P(stTxt), dd = ds.getElementsByTagNameNS(W, "docDefaults")[0];
      if (dd) { rprDef = hijo(hijo(dd, "rPrDefault"), "rPr"); pprDef = hijo(hijo(dd, "pPrDefault"), "pPr"); }
      [...ds.getElementsByTagNameNS(W, "style")].forEach((s) => {
        const nm = (val(hijo(s, "name")) || "").toLowerCase(), id = at(s, "styleId"), tipo = at(s, "type");
        estilos[id] = nm;
        defEstilo[id] = { nombre: nm, tipo, base: val(hijo(s, "basedOn")), ppr: hijo(s, "pPr"), rpr: hijo(s, "rPr") };
        if (tipo === "paragraph" && ["1", "true"].includes(at(s, "default") || "") && idNormal == null) idNormal = id;
      });
    }
    // fuentes del tema: los estilos suelen decir "la fuente del cuerpo" en vez de su nombre
    const tema = {};
    {
      const destino = Object.values(rels).find((t) => /theme\/[^/]*\.xml$/.test(t || ""));
      const tt = await z.texto(destino ? rutaDe(destino) : "word/theme/theme1.xml");
      if (tt) {
        const dt = P(tt);
        ["major", "minor"].forEach((k) => {
          const f = dt.getElementsByTagNameNS("*", k + "Font")[0], l = f && [...f.childNodes].find((c) => c.localName === "latin");
          if (l && l.getAttribute("typeface")) tema[k] = l.getAttribute("typeface");
        });
      }
    }
    // numeración: numId → abstract → formato por nivel
    const formatoNum = {};
    // 8.2 Notas al pie: id → texto.
    const notasPie = {};
    const notasTxt = await z.texto("word/footnotes.xml");
    if (notasTxt) {
      const dn = P(notasTxt);
      [...dn.getElementsByTagNameNS(W, "footnote")].forEach((fn) => {
        const id = fn.getAttributeNS(W, "id") || fn.getAttribute("w:id");
        if (+id > 0) notasPie[id] = [...fn.getElementsByTagNameNS(W, "t")].map((t) => t.textContent).join("").trim();
      });
    }
    const numTxt = await z.texto("word/numbering.xml");
    if (numTxt) {
      const d = P(numTxt), abs = {};
      [...d.getElementsByTagNameNS(W, "abstractNum")].forEach((a) => {
        const id = a.getAttributeNS(W, "abstractNumId") || a.getAttribute("w:abstractNumId");
        abs[id] = {};
        hijos(a, "lvl").forEach((l) => (abs[id][l.getAttributeNS(W, "ilvl") || l.getAttribute("w:ilvl")] = val(hijo(l, "numFmt"))));
      });
      [...d.getElementsByTagNameNS(W, "num")].forEach((nn) => (formatoNum[nn.getAttributeNS(W, "numId") || nn.getAttribute("w:numId")] = abs[val(hijo(nn, "abstractNumId"))] || {}));
    }
    const medios = {};
    async function imagenDe(rid) {
      const destino = rels[rid];
      if (!destino) return null;
      const ruta = destino.startsWith("/") ? destino.slice(1) : "word/" + destino.replace(/^\.\//, "");
      if (medios[ruta]) return medios[ruta];
      const b = await z.leer(ruta);
      if (!b) return null;
      const ext = (ruta.split(".").pop() || "").toLowerCase();
      const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" }[ext];
      if (!mime) return null;
      let bin = "";
      for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return (medios[ruta] = "data:" + mime + ";base64," + btoa(bin));
    }
    const doc = P(xmlDoc), cuerpo = doc.getElementsByTagNameNS(W, "body")[0];
    const parrafos = [];
    let aproximado = false;

    function attrsRun(rpr, base) {
      const a = Object.assign({}, base);
      if (!rpr) return a;
      const b = hijo(rpr, "b"), i = hijo(rpr, "i"), u = hijo(rpr, "u"), s = hijo(rpr, "strike") || hijo(rpr, "dstrike");
      if (b) a.b = activo(b);
      if (i) a.i = activo(i);
      if (u) a.u = activo(u);
      if (s) a.s = activo(s);
      const va = val(hijo(rpr, "vertAlign"));
      if (va) a.va = va === "superscript" ? "sup" : va === "subscript" ? "sub" : null;
      const c = val(hijo(rpr, "color"));
      if (c && /^[0-9a-f]{6}$/i.test(c)) a.color = "#" + c.toUpperCase(); else if (c === "auto") delete a.color;
      const h = val(hijo(rpr, "highlight"));
      if (h && RESALTE_WORD[h]) a.fondo = RESALTE_WORD[h]; else if (h === "none") delete a.fondo;
      const shd = hijo(rpr, "shd");
      const fill = shd && (shd.getAttributeNS(W, "fill") || shd.getAttribute("w:fill"));
      if (fill && /^[0-9a-f]{6}$/i.test(fill)) a.fondo = "#" + fill.toUpperCase();
      const sz = val(hijo(rpr, "sz"));
      if (sz) a.tam = +sz / 2;
      const f = hijo(rpr, "rFonts");
      if (f) {
        // la fuente del tema (cuerpo o títulos) manda sobre el nombre escrito, igual que en Word
        const t = at(f, "asciiTheme") || at(f, "hAnsiTheme");
        const fuente = (t && tema[/^major/.test(t) ? "major" : "minor"]) || at(f, "ascii") || at(f, "hAnsi");
        if (fuente) a.fuente = fuente;
      }
      const vs = hijo(rpr, "smallCaps"), my = hijo(rpr, "caps"), es = hijo(rpr, "spacing");
      if (vs) a.vers = activo(vs);
      if (my) a.mayus = activo(my);
      if (es && val(es) != null) a.esp = Math.round((+val(es) / 20) * 100) / 100 || null;
      Object.keys(a).forEach((k) => { if (a[k] == null || a[k] === false) delete a[k]; });
      return a;
    }
    // ---- lo que se hereda: valores del documento → estilo base → estilo → lo propio
    const rBase = attrsRun(rprDef, {});
    const cacheR = {}, cacheP = {};
    /** La letra con la que se ve un estilo. De un estilo de carácter sale solo lo que él cambia. */
    function letraDe(id, prof) {
      const d = id != null ? defEstilo[id] : null;
      if (!d) return rBase;
      if (cacheR[id]) return cacheR[id];
      if ((prof || 0) > 20) return rBase;
      const base = d.base != null && defEstilo[d.base] ? letraDe(d.base, (prof || 0) + 1) : d.tipo === "character" ? {} : rBase;
      return (cacheR[id] = attrsRun(d.rpr, base));
    }
    /** Propiedades de párrafo en crudo (twips), cada una sobre lo que ya traía la base. */
    function parCrudo(ppr, base) {
      const r = Object.assign({}, base);
      if (!ppr) return r;
      const jc = val(hijo(ppr, "jc"));
      if (jc) r.jc = jc;
      const ind = hijo(ppr, "ind");
      if (ind) {
        const g = (k) => { const v = at(ind, k); return v == null || v === "" || isNaN(+v) ? null : +v; };
        const izq = g("left") != null ? g("left") : g("start"), der = g("right") != null ? g("right") : g("end");
        if (izq != null) r.izq = izq;
        if (der != null) r.der = der;
        if (g("hanging") != null) { r.fr = g("hanging"); r.pri = 0; } else if (g("firstLine") != null) { r.pri = g("firstLine"); r.fr = 0; }
      }
      const sp = hijo(ppr, "spacing");
      if (sp) {
        const g = (k) => { const v = at(sp, k); return v == null || v === "" || isNaN(+v) ? null : +v; };
        if (g("before") != null) r.antes = g("before");
        if (g("after") != null) r.desp = g("after");
        if (g("line") != null) { r.linea = g("line"); r.regla = at(sp, "lineRule") || "auto"; }
      }
      const bd = hijo(ppr, "pBdr");
      if (bd) r.bdr = bd;
      const shd = hijo(ppr, "shd");
      if (shd) { const fill = at(shd, "fill"); r.shd = fill && /^[0-9a-f]{6}$/i.test(fill) && fill.toUpperCase() !== "FFFFFF" ? "#" + fill.toUpperCase() : null; }
      const np = hijo(ppr, "numPr");
      if (np) { const id = val(hijo(np, "numId")), lvl = val(hijo(np, "ilvl")); r.num = { id: id != null ? id : (r.num || {}).id, lvl: lvl != null ? lvl : (r.num || {}).lvl }; }
      const bi = hijo(ppr, "bidi");
      if (bi) r.rtl = activo(bi);
      const cs = hijo(ppr, "contextualSpacing");
      if (cs) r.junto = activo(cs);
      return r;
    }
    const pBase = parCrudo(pprDef, {});
    function parDe(id, prof) {
      const d = id != null ? defEstilo[id] : null;
      if (!d) return pBase;
      if (cacheP[id]) return cacheP[id];
      if ((prof || 0) > 20) return pBase;
      return (cacheP[id] = parCrudo(d.ppr, d.base != null && defEstilo[d.base] ? parDe(d.base, (prof || 0) + 1) : pBase));
    }
    // El estilo Normal del archivo es el "formato base" del documento: lo que no trae formato propio
    // se ve con esa fuente, ese tamaño y ese interlineado.
    const rN = letraDe(idNormal), pN = parDe(idNormal);
    const cmDe = (tw) => Math.round((tw / 567) * 100) / 100;
    const liDe = (c) => (c.linea && (!c.regla || c.regla === "auto") ? Math.round((c.linea / 240) * 100) / 100 : null);
    const liDeWord = (v) => Math.abs(v - 1.15) <= 0.04 || Math.abs(v - 1.08) <= 0.03;   // lo que aquí ya es el interlineado normal
    const formato = {};
    if (rN.fuente) formato.fuente = rN.fuente;
    if (rN.tam) formato.tam = rN.tam; else if (stTxt) formato.tam = 10;   // sin tamaño escrito, Word usa 10 pt
    // (un archivo con estilos que no dice el interlineado va a renglón sencillo: es lo que hace Word)
    const liDeO = (c) => (c.linea ? liDe(c) : stTxt ? 1 : null);
    if (liDeO(pN) && !liDeWord(liDeO(pN))) formato.interlineado = liDeO(pN);
    if (pN.pri > 0) formato.primera = cmDe(pN.pri);
    const liBase = formato.interlineado || 1.15;
    /** Lo que es igual al formato base no se repite en cada letra. */
    const relativa = (a) => { if (a.fuente && a.fuente === formato.fuente) delete a.fuente; if (a.tam && a.tam === formato.tam) delete a.tam; return a; };
    // ---- bordes (de párrafo y de página)
    const ESTILO_BORDE = { single: "solid", thick: "solid", double: "double", triple: "double", dotted: "dotted", dashed: "dashed", dashSmallGap: "dashed", dotDash: "dashed", dotDotDash: "dashed", wave: "solid" };
    /** Un lado de un borde de Word → [grosor en puntos, estilo, color, separación en puntos]. */
    function ladoBorde(n) {
      const v = n ? val(n) : null;
      if (!v || v === "nil" || v === "none") return null;
      const e = ESTILO_BORDE[v] || "solid", sz = +(at(n, "sz") || 4) / 8, col = at(n, "color");
      return [Math.max(0.5, Math.round((e === "double" ? sz * 3 : sz) * 100) / 100), e, col && /^[0-9a-f]{6}$/i.test(col) ? "#" + col.toUpperCase() : "#000000", +(at(n, "space") || 0)];
    }
    /** Borde de párrafo → "grosor estilo color lados" (lados: s, i, z, d). */
    function bordeDe(bd) {
      const L = { s: ladoBorde(hijo(bd, "top")), i: ladoBorde(hijo(bd, "bottom")), z: ladoBorde(hijo(bd, "left") || hijo(bd, "start")), d: ladoBorde(hijo(bd, "right") || hijo(bd, "end")) };
      const lados = Object.keys(L).filter((k) => L[k]);
      if (!lados.length) return null;
      const p = L[lados[0]];
      return `${p[0]} ${p[1]} ${p[2]} ${lados.join("")}`;
    }
    // ---- texto de lo que no se dibuja aquí (cuadro de texto, SmartArt, gráfico): al menos que se lea
    async function textoObjeto(c) {
      const dentroDe = (n, nombre) => { for (let q = n.parentNode; q && q !== c; q = q.parentNode) if (q.localName === nombre) return true; return false; };
      const cajas = [...c.getElementsByTagNameNS("*", "txbxContent")].filter((t) => !dentroDe(t, "Fallback"));
      const lineas = (raiz) => [...raiz.getElementsByTagNameNS(W, "p")].map((q) => [...q.getElementsByTagNameNS(W, "t")].map((t) => t.textContent).join("")).filter((t) => t.trim());
      let t = (cajas.length ? cajas : [...c.getElementsByTagNameNS("*", "txbxContent")].slice(0, 1)).map((k) => lineas(k).join("\n")).filter(Boolean).join("\n\n");
      const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
      const parte = async (rid) => { const d = rid && rels[rid]; return d ? z.texto(rutaDe(d)) : null; };
      if (!t) {
        const dg = c.getElementsByTagNameNS("*", "relIds")[0];
        const xd = dg ? await parte(dg.getAttributeNS(R, "dm") || dg.getAttribute("r:dm")) : null;
        if (xd) {
          t = [...P(xd).getElementsByTagNameNS("*", "pt")].filter((q) => !/^(pres|parTrans|sibTrans)$/.test(q.getAttribute("type") || ""))
            .map((q) => [...q.getElementsByTagNameNS("*", "t")].map((k) => k.textContent).join(" ").trim()).filter(Boolean).join("\n");
        }
      }
      if (!t) {
        const ch = [...c.getElementsByTagNameNS("*", "chart")].find((q) => q.getAttributeNS(R, "id") || q.getAttribute("r:id"));
        const xc = ch ? await parte(ch.getAttributeNS(R, "id") || ch.getAttribute("r:id")) : null;
        if (xc) {
          const dc = P(xc), ti = dc.getElementsByTagNameNS("*", "title")[0];
          const titulo = ti ? [...ti.getElementsByTagNameNS("*", "t")].map((k) => k.textContent).join("").trim() : "";
          const series = [...dc.getElementsByTagNameNS("*", "ser")].map((q) => { const tx = [...q.childNodes].find((k) => k.localName === "tx"), v = tx && tx.getElementsByTagNameNS("*", "v")[0]; return v ? v.textContent.trim() : ""; }).filter(Boolean);
          t = [titulo, series.length ? "Series: " + series.join(", ") : ""].filter(Boolean).join("\n");
        }
      }
      return t ? t.slice(0, 4000) : null;
    }
    async function runs(n, base, tramos, parrafo) {
      for (const r of hijos(n)) {
        const ln = r.localName;
        if (ln === "r") {
          const rpr = hijo(r, "rPr"), rs = rpr ? val(hijo(rpr, "rStyle")) : null;
          const a = relativa(attrsRun(rpr, rs != null && defEstilo[rs] ? Object.assign({}, base, letraDe(rs)) : base));
          for (const c of hijos(r)) {
            const cn = c.localName;
            if (cn === "t") tramos.push({ x: c.textContent, a });
            else if (cn === "tab") tramos.push({ x: "\t", a });
            else if (cn === "br" || cn === "cr") {
              const tipo = c.getAttributeNS(W, "type") || c.getAttribute("w:type");
              if (tipo === "page") parrafo.salto = true; else tramos.push({ x: "\u2028", a });
            } else if (cn === "drawing" || cn === "pict") {
              const blip = c.getElementsByTagNameNS("*", "blip")[0], img = c.getElementsByTagNameNS("*", "imagedata")[0];
              const rid = blip ? (blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") || blip.getAttribute("r:embed")) : img && (img.getAttribute("r:id") || img.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
              const src = rid ? await imagenDe(rid) : null;
              const ext = c.getElementsByTagNameNS("*", "extent")[0];
              const w = ext ? Math.round(+ext.getAttribute("cx") / EMU) : 320, h = ext ? Math.round(+ext.getAttribute("cy") / EMU) : 0;
              if (src) tramos.push({ e: { tipo: "imagen", src, w, h, oe: ordinal(c) }, a: {} });
              else {
                // Forma, cuadro de texto, gráfico o SmartArt: aquí se ve como una marca y al exportar sale el original.
                const g = c.getElementsByTagNameNS("*", "graphicData")[0], uri = (g && g.getAttribute("uri")) || "";
                const que = /chart/.test(uri) ? "Gráfico" : /diagram/.test(uri) ? "SmartArt" : c.getElementsByTagNameNS("*", "txbxContent")[0] ? "Cuadro de texto" : /picture/.test(uri) || img ? "Imagen" : "Forma";
                tramos.push({ e: { tipo: "objeto", que, oe: ordinal(c), txt: (await textoObjeto(c)) || undefined }, a: {} }); aproximado = true;
              }
            } else if (cn === "AlternateContent" || cn === "object") {
              const que = cn === "object" ? "Objeto incrustado" : c.getElementsByTagNameNS("*", "txbxContent")[0] ? "Cuadro de texto" : /drawingml\/2006\/chart/.test(c.innerHTML || "") ? "Gráfico" : c.getElementsByTagNameNS("*", "relIds")[0] ? "SmartArt" : "Forma";
              tramos.push({ e: { tipo: "objeto", que, oe: ordinal(c), txt: (await textoObjeto(c)) || undefined }, a: {} }); aproximado = true;
            } else if (cn === "footnoteReference") {
              const id = c.getAttributeNS(W, "id") || c.getAttribute("w:id");
              tramos.push({ e: { tipo: "nota", texto: notasPie[id] || "", oe: ordinal(c) }, a: {} });
            } else if (cn === "sym") tramos.push({ x: String.fromCharCode(parseInt(c.getAttributeNS(W, "char") || c.getAttribute("w:char") || "20", 16) & 0xFFF), a });
          }
        } else if (ln === "hyperlink") {
          const rid = r.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || r.getAttribute("r:id");
          const destino = rid && rels[rid];
          await runs(r, Object.assign({}, base, destino && /^(https?:|mailto:)/i.test(destino) ? { enlace: destino } : {}), tramos, parrafo);
        } else if (ln === "oMath" || ln === "oMathPara") {
          const t = ommlATex(r).trim();
          if (t) tramos.push({ e: { tipo: "ecuacion", tex: t, bloque: ln === "oMathPara" || null, oe: ordinal(r) }, a: {} });
        } else if (["ins", "smartTag", "fldSimple", "customXml", "sdt", "sdtContent", "bdo", "dir"].includes(ln)) await runs(r, base, tramos, parrafo);
      }
    }
    const ESTILO_POR_NOMBRE = (nm) => (/^heading 1$|^título 1$/.test(nm) ? "h1" : /^heading 2$|^título 2$/.test(nm) ? "h2" : /^heading [3-9]$|^título [3-9]$/.test(nm) ? "h3"
      : nm === "title" || nm === "título" ? "titulo" : nm === "subtitle" || nm === "subtítulo" ? "subtitulo" : /quote|cita/.test(nm) ? "cita" : null);
    /** Formato del párrafo y la letra que heredan sus corridas: { pa, letra }. */
    function attrsParrafo(ppr) {
      const pa = {}, idSt = val(hijo(ppr, "pStyle")) != null && defEstilo[val(hijo(ppr, "pStyle"))] ? val(hijo(ppr, "pStyle")) : idNormal;
      const c = parCrudo(ppr, parDe(idSt)), letra = letraDe(idSt);
      // estilo: por el nombre del suyo, o del primero de sus estilos base que se reconozca
      let st = "";
      for (let id = idSt, n = 0; id != null && defEstilo[id] && n < 20; id = defEstilo[id].base, n++) {
        if (!n) st = defEstilo[id].nombre;
        const e = ESTILO_POR_NOMBRE(defEstilo[id].nombre);
        if (e) { pa.estilo = e; break; }
      }
      if (c.num && c.num.id != null && c.num.id !== "0") {
        const lvl = +(c.num.lvl || 0), f = (formatoNum[c.num.id] || {})[lvl] || "bullet";
        pa.lista = f === "bullet" || f === "none" ? "vinetas" : "numeros";
        if (lvl) pa.nivel = Math.min(8, lvl);
      } else if (/^list bullet|^lista con viñetas/.test(st)) pa.lista = "vinetas";
      else if (/^list number|^lista con números/.test(st)) pa.lista = "numeros";
      if (pa.lista) delete pa.estilo;
      const v = { center: "centro", right: "der", end: "der", both: "just", distribute: "just" }[c.jc];
      if (v) pa.alin = v;
      if (!pa.lista) {
        const izq = c.izq || 0, der = c.der || 0, pri = c.pri || 0, fr = c.fr || 0, priBase = pa.estilo ? 0 : Math.max(0, pN.pri || 0);
        if (fr > 0) { pa.francesa = cmDe(fr); if (izq - fr > 20) pa.sangiz = cmDe(izq - fr); if (priBase) pa.primera = 0; }
        else { if (izq > 20) pa.sangiz = cmDe(izq); if (pri !== priBase && pri >= 0) pa.primera = cmDe(pri); }
        if (der > 20) pa.sangder = cmDe(der);
      }
      const li = liDeO(c);
      if (li != null) { if (Math.abs(li - liBase) > 0.04 && !(formato.interlineado == null && liDeWord(li))) pa.interlineado = li; }
      else if (c.linea && c.regla === "exact") pa.lineaPt = Math.round(c.linea / 2) / 10;
      else if (c.linea && c.regla === "atLeast" && c.linea / 20 > (letra.tam || formato.tam || 11) * 1.3) pa.lineaPt = Math.round(c.linea / 2) / 10;
      // espacio antes y después: solo se anota si no es el que aquí ya tiene ese tipo de párrafo
      const junto = c.junto && pa.lista, antes = junto ? 0 : Math.round((c.antes || 0) / 2) / 10, desp = junto ? 0 : Math.round((c.desp || 0) / 2) / 10;
      const om = pa.lista ? [0, 2] : pa.estilo ? { h1: [12, 0], h2: [2, 0], h3: [2, 0], titulo: [0, 4], cita: [10, 8] }[pa.estilo] : [0, 8];
      if (!om || antes !== om[0]) pa.antes = antes;
      if (!om || desp !== om[1]) pa.despues = desp;
      if (c.bdr) pa.borde = bordeDe(c.bdr);
      if (c.shd) pa.sombra = c.shd;
      if (c.rtl) pa.dir = "rtl";
      Object.keys(pa).forEach((k) => pa[k] == null && delete pa[k]);
      return { pa, letra };
    }
    // ---- secciones: cada una puede traer otra hoja y otro número de columnas
    const TAMS = { carta: [816, 1056], a4: [794, 1123], oficio: [816, 1344], a5: [559, 794], media: [529, 816] };
    function datosSeccion(sect) {
      const sz = hijo(sect, "pgSz"), co = hijo(sect, "cols"), g = (n, k) => +(at(n, k) || 0) || 0;
      const w = sz ? g(sz, "w") / TWIP : 816, h = sz ? g(sz, "h") / TWIP : 1056;
      const n = co ? Math.max(1, +(at(co, "num") || 0) || hijos(co, "col").length || 1) : 1;
      return { sect, w, h, hor: w > h, cols: n, tipo: val(hijo(sect, "type")) || "nextPage" };
    }
    const secciones = [];
    hijos(cuerpo).forEach((c) => {
      const sp = c.localName === "p" ? hijo(hijo(c, "pPr"), "sectPr") : c.localName === "sectPr" ? c : null;
      if (sp) secciones.push(datosSeccion(sp));
    });
    let nSec = 0, secPendiente = secciones.length && secciones[0].cols > 1 ? "c|" + secciones[0].cols + " columnas" : null;
    /** Marca con la que empieza una sección: "p|…" si arranca en hoja nueva, "c|…" si sigue en la misma. */
    function marcaSeccion(nueva, ant) {
      const partes = [];
      if (nueva.cols !== ant.cols) partes.push(nueva.cols === 1 ? "1 columna" : nueva.cols + " columnas");
      if (Math.abs(nueva.w - ant.w) > 8 || Math.abs(nueva.h - ant.h) > 8) partes.push(`hoja ${nueva.hor ? "horizontal" : "vertical"} de ${Math.round((nueva.w / 37.7953) * 10) / 10} × ${Math.round((nueva.h / 37.7953) * 10) / 10} cm`);
      const nuevaHoja = nueva.tipo !== "continuous";
      return partes.length || nuevaHoja ? (nuevaHoja ? "p|" : "c|") + partes.join(" · ") : null;
    }
    async function bloque(n, unidad) {
      const lista = hijos(n);
      for (let idx = 0; idx < lista.length; idx++) {
        const c = lista[idx];
        // ox = qué hijo del cuerpo es (para sacar esa unidad tal cual del original al exportar)
        // (dentro de un control de contenido: "3.0", "3.1"… = hijos del contenido del hijo 3)
        const ox = unidad != null ? unidad + "." + idx : idx;
        uEl = c;
        if (c.localName === "p") {
          const ppr = hijo(c, "pPr"), ap = attrsParrafo(ppr), pa = ap.pa, tramos = [], info = {};
          pa.ox = ox;
          if (unidad == null) {
            if (secPendiente != null) { pa.sec = secPendiente; secPendiente = null; }
            if (hijo(ppr, "sectPr") && secciones[nSec + 1]) { secPendiente = marcaSeccion(secciones[nSec + 1], secciones[nSec]); nSec++; }
          }
          await runs(c, ap.letra, tramos, info);
          if (info.salto && tramos.length) { parrafos.push({ pa, tramos }); parrafos.push({ pa: { ox }, tramos: [{ e: { tipo: "salto" } }] }); }
          else if (info.salto) parrafos.push({ pa: { ox }, tramos: [{ e: { tipo: "salto" } }] });
          else parrafos.push({ pa, tramos });
        } else if (c.localName === "tbl") {
          const filas = hijos(c, "tr"), celdas = {};
          let cols = 0;
          // texto de una celda: sus párrafos, y si trae otra tabla adentro, sus renglones con " | "
          const textoCelda = (tc) => {
            const out = [];
            const rec = (n) => hijos(n).forEach((h) => {
              if (h.localName === "p") out.push([...h.getElementsByTagNameNS(W, "t")].filter((t) => { for (let q = t.parentNode; q && q !== h; q = q.parentNode) if (q.localName === "txbxContent" || q.localName === "Fallback") return false; return true; }).map((t) => t.textContent).join(""));
              else if (h.localName === "tbl") hijos(h, "tr").forEach((tr) => out.push(hijos(tr, "tc").map((x2) => textoCelda(x2).replace(/\n/g, " ")).join(" | ")));
              else if (h.localName === "sdt") rec(hijo(h, "sdtContent"));
            });
            rec(tc);
            return out.join("\n").trim();
          };
          const abiertas = {};   // columna → celda donde empezó una combinación vertical
          filas.forEach((tr, f) => {
            let k = 0;
            hijos(tr, "tc").forEach((tc) => {
              const tcPr = hijo(tc, "tcPr");
              const span = Math.max(1, +(val(hijo(tcPr, "gridSpan")) || 1));
              const vm = hijo(tcPr, "vMerge"), vmv = vm ? val(vm) || "continue" : null;
              const ref = F().ref(k, f);
              if (vmv === "continue" && abiertas[k]) {
                const tl = abiertas[k], m = String(celdas["m:" + tl] || "1x1").split("x").map(Number);
                celdas["m:" + tl] = `${m[0]}x${m[1] + 1}`;
              } else {
                // todos los párrafos de la celda, también los que van dentro de un control de contenido
                const t = textoCelda(tc);
                if (t) celdas["c:" + ref] = t;
                if (span > 1 || vmv === "restart") celdas["m:" + ref] = `${span}x1`;
                abiertas[k] = vmv === "restart" ? ref : null;
                const shd = hijo(tcPr, "shd"), fill = shd && (shd.getAttributeNS(W, "fill") || shd.getAttribute("w:fill"));
                if (fill && /^[0-9a-f]{6}$/i.test(fill) && fill.toUpperCase() !== "FFFFFF") celdas["r:" + ref] = "#" + fill.toUpperCase();
                const negritas = [...tc.getElementsByTagNameNS(W, "r")].filter((rr) => rr.textContent.trim());
                if (negritas.length && negritas.every((rr) => { const rp = hijo(rr, "rPr"); return rp && hijo(rp, "b") && val(hijo(rp, "b")) !== "0"; })) celdas["n:" + ref] = true;
                // cursiva y color si toda la celda los lleva; alineación, la de su primer párrafo
                if (negritas.length && negritas.every((rr) => { const rp = hijo(rr, "rPr"); return rp && activo(hijo(rp, "i")); })) celdas["i:" + ref] = true;
                const colores = new Set(negritas.map((rr) => { const k = val(hijo(hijo(rr, "rPr"), "color")); return k && /^[0-9a-f]{6}$/i.test(k) ? "#" + k.toUpperCase() : ""; }));
                if (colores.size === 1 && [...colores][0] && [...colores][0] !== "#000000") celdas["k:" + ref] = [...colores][0];
                const p0 = hijo(tc, "p"), jc = p0 ? parCrudo(hijo(p0, "pPr"), {}).jc : null, al = { center: "centro", right: "der", end: "der" }[jc];
                if (al) celdas["al:" + ref] = al;
              }
              k += span;
            });
            cols = Math.max(cols, k);
          });
          Object.keys(celdas).forEach((x) => { if (x.startsWith("m:") && celdas[x] === "1x1") delete celdas[x]; });
          // anchos de columna (en % del ancho de la tabla) y si la tabla no lleva líneas
          const rejilla = hijos(hijo(c, "tblGrid"), "gridCol").map((gc) => +(at(gc, "w") || 0) || 0), totalRej = rejilla.reduce((a2, b2) => a2 + b2, 0);
          if (totalRej > 0 && rejilla.length === cols && cols <= 20 && new Set(rejilla).size > 1) rejilla.forEach((w2, k2) => { celdas["aw:" + F().colLetra(k2)] = Math.round((w2 / totalRej) * 10000) / 100; });
          const tb = hijo(hijo(c, "tblPr"), "tblBorders");
          const sinLineas = (b2) => !!b2 && ["top", "left", "bottom", "right", "insideH", "insideV"].every((l) => { const q = hijo(b2, l); return !q || ["nil", "none"].includes(val(q)); });
          if (tb ? sinLineas(tb) : !val(hijo(hijo(c, "tblPr"), "tblStyle")) && !c.getElementsByTagNameNS(W, "tcBorders").length) celdas.bordes = "ninguno";
          if (filas.length) parrafos.push({ pa: { ox }, tramos: [{ e: { tipo: "tabla", filas: filas.length, cols: Math.min(20, cols), celdas } }] });
        } else if (c.localName === "sdt") await bloque(hijo(c, "sdtContent"), ox);
      }
    }
    await bloque(cuerpo);
    // Página: la de la PRIMERA sección, que es la hoja con la que empieza el documento (la sección
    // del final del cuerpo es la última, y puede ser otra hoja).
    const sec0 = secciones[0] || null, sect = sec0 ? sec0.sect : null;
    let pagina = null;
    const avisos = [];
    if (sect) {
      const mg = hijo(sect, "pgMar"), g = (n, k) => +(at(n, k) || 0) || 0;
      const lado = Math.min(sec0.w, sec0.h), largo = Math.max(sec0.w, sec0.h);
      const tam = Object.keys(TAMS).find((k) => Math.abs(lado - TAMS[k][0]) < 8 && Math.abs(largo - TAMS[k][1]) < 10);
      pagina = { tam: tam || "otro", orient: sec0.hor ? "h" : "v", // (en Word un margen de arriba o de abajo negativo quiere decir "fijo": la medida es la misma)
        margen: mg ? { s: Math.round(Math.abs(g(mg, "top")) / TWIP), i: Math.round(Math.abs(g(mg, "bottom")) / TWIP), iz: Math.round(g(mg, "left") / TWIP), d: Math.round(g(mg, "right") / TWIP) } : undefined };
      if (!tam) { pagina.w = Math.round(lado); pagina.h = Math.round(largo); }   // tamaño que no es de los comunes: sus medidas (px, hoja vertical)
      const pb = hijo(sect, "pgBorders");
      const lb = pb ? ladoBorde(hijo(pb, "top")) || ladoBorde(hijo(pb, "left")) || ladoBorde(hijo(pb, "bottom")) || ladoBorde(hijo(pb, "right")) : null;
      // borde de página: grosor (pt), estilo, color y a cuántos px del canto de la hoja (o del texto) va
      if (lb) pagina.borde = { a: lb[0], e: lb[1], c: lb[2], d: Math.round((lb[3] * 96) / 72), hoja: at(pb, "offsetFrom") === "page" || undefined };
      if (secciones.some((x) => Math.abs(x.w - sec0.w) > 8 || Math.abs(x.h - sec0.h) > 8)) avisos.push("Este documento cambia de tamaño u orientación de hoja a media obra: aquí se ve todo con la hoja del principio (al descargar en Word sale cada sección con la suya)");
      if (secciones.some((x) => x.cols > 1)) avisos.push("Las partes en columnas se ven aquí a una sola columna, con una marca donde empiezan (al descargar en Word salen en columnas)");
    }
    // Encabezado y pie de la primera sección: su texto (izquierda, centro y derecha van separados por
    // tabuladores) y dónde va el número de página.
    const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    async function zona(etiqueta) {
      const refs = sect ? hijos(sect, etiqueta) : [];
      const ref = refs.find((x) => (at(x, "type") || "default") === "default");
      const rid = ref && (ref.getAttributeNS(R_NS, "id") || ref.getAttribute("r:id")), destino = rid && rels[rid];
      const xml = destino ? await z.texto(rutaDe(destino)) : null;
      if (!xml) return null;
      const huecos = ["", "", ""];
      [...P(xml).getElementsByTagNameNS(W, "p")].forEach((pp) => {
        for (let q = pp.parentNode; q; q = q.parentNode) if (q.localName === "txbxContent") return;
        let out = "", campo = null, instr = "", res = "";
        const cierra = (i2, r2) => { out += /NUMPAGES|SECTIONPAGES/i.test(i2) ? "\u0002" : /(^|\s)PAGE(\s|$)/i.test(i2) ? "\u0001" : r2; };
        [...pp.getElementsByTagNameNS(W, "*")].forEach((n) => {
          const ln = n.localName;
          if (ln === "fldChar") {
            const t = at(n, "fldCharType");
            if (t === "begin") { campo = "instr"; instr = ""; res = ""; } else if (t === "separate") campo = "res"; else if (t === "end") { cierra(instr, res); campo = null; }
          } else if (ln === "instrText") instr += n.textContent;
          else if (ln === "fldSimple") cierra(at(n, "instr") || "", "");
          else if (ln === "t") {
            let simple = false;
            for (let q = n.parentNode; q && q !== pp; q = q.parentNode) if (q.localName === "fldSimple" && /PAGE/i.test(at(q, "instr") || "")) simple = true;
            if (simple) return;
            if (campo === "res") res += n.textContent; else if (!campo) out += n.textContent;
          } else if (ln === "tab" && n.parentNode && n.parentNode.localName === "r" && !campo) out += "\t";
          else if (ln === "ptab" && !campo) out += "\t";
          else if ((ln === "br" || ln === "cr") && !campo) out += " ";
        });
        if (!out.trim()) return;
        const jc = parCrudo(hijo(pp, "pPr"), parDe(val(hijo(hijo(pp, "pPr"), "pStyle")) || idNormal)).jc;
        const partes = out.split("\t").map((t) => t.trim());
        if (partes.length === 1) { const k = jc === "center" ? 1 : jc === "right" || jc === "end" ? 2 : 0; huecos[k] += (huecos[k] ? " · " : "") + partes[0]; }
        else partes.slice(0, 3).forEach((t, k) => { if (t) huecos[k] += (huecos[k] ? " · " : "") + t; });
      });
      // número de página: en qué hueco está y con qué forma ("Página 1", "1 de 5"…)
      let num = null;
      huecos.forEach((t, k) => {
        if (!t.includes("\u0001")) return;
        const fmt = /p[áa]gina\s*\u0001\s*(de|\/)\s*\u0002/i.test(t) ? "pagina-total" : /\u0001\s*(de|of|\/)\s*\u0002/i.test(t) ? "total" : /(p[áa]gina|page|p[áa]g\.?)\s*\u0001/i.test(t) ? "pagina" : "n";
        if (!num) num = { lado: ["izq", "centro", "der"][k], fmt };
        huecos[k] = t.replace(/(p[áa]gina|page|p[áa]g\.?)?\s*\u0001(\s*(de|of|\/)\s*\u0002)?/i, "").replace(/^[\s·|–-]+|[\s·|–-]+$/g, "");
      });
      const limpios = huecos.map((t) => t.replace(/[\u0001\u0002]/g, "").trim());
      const usados = limpios.filter(Boolean).length;
      // un solo texto: va con su alineación; varios: izquierda, centro y derecha separados por tabuladores
      const texto = usados <= 1 ? limpios.find(Boolean) || "" : limpios.join("\t").replace(/\t+$/, "");
      return { texto: texto.slice(0, 300), alin: usados === 1 ? ["izq", "centro", "der"][limpios.findIndex(Boolean)] : "izq", num };
    }
    const docCampos = {};
    if (Object.keys(formato).length) docCampos.formato = formato;
    {
      const enc = await zona("headerReference"), pie = await zona("footerReference");
      if (enc && enc.texto) { docCampos.encabezado = enc.texto; if (enc.alin !== "izq") docCampos.encAlin = enc.alin; }
      if (pie && pie.texto) { docCampos.pie = pie.texto; if (pie.alin !== "izq") docCampos.pieAlin = pie.alin; }
      const num = (pie && pie.num) || (enc && enc.num);
      // sin número de página en el archivo, aquí tampoco se muestra
      if (!num) docCampos.numeros = false;
      else {
        const pos = (pie && pie.num ? "pie-" : "enc-") + num.lado;
        if (pos !== "pie-der") docCampos.numPos = pos;
        if (num.fmt !== "n") docCampos.numFmt = num.fmt;
        const ini = sect ? +(at(hijo(sect, "pgNumType"), "start") || 0) : 0;
        if (ini > 1) docCampos.numInicio = ini;
      }
      if (sect && hijo(sect, "titlePg") && activo(hijo(sect, "titlePg")) && (docCampos.encabezado || docCampos.pie || num)) docCampos.primeraDistinta = true;
    }
    if (aproximado) avisos.unshift("Las formas, los gráficos y los cuadros de texto de Word no se editan aquí: se ve su texto en un recuadro y al descargar en Word salen completos");
    while (parrafos.length > 1 && !parrafos[parrafos.length - 1].tramos.length && !Object.keys(parrafos[parrafos.length - 1].pa).length) parrafos.pop();
    return { archivo: u8, parrafos: parrafos.length ? parrafos : [{ pa: {}, tramos: [] }], pagina, doc: docCampos, formato, aviso: avisos.length ? avisos.join(". ") + "." : null };
  }

  /** Valores calculados de una tabla, recortados a lo que tiene datos (para Word y PowerPoint). */
  function tablaVisible(b) {
    const ev = F().evaluador((c, f) => b["c:" + F().ref(c, f)]);
    let mf = 0, mc = 0;
    Object.keys(b).forEach((k) => { if (!k.startsWith("c:") || b[k] === "" || b[k] == null) return; const r = F().parseRef(k.slice(2)); if (r) { mf = Math.max(mf, r.f + 1); mc = Math.max(mc, r.c + 1); } });
    const filas = [];
    for (let f = 0; f < mf; f++) { const fila = []; for (let c = 0; c < mc; c++) fila.push(F().formatear(ev.valor(c, f))); filas.push(fila); }
    return filas;
  }

  // ------------------------------------------------------------ Excel (.xlsx)
  const LIM_F = 5000, LIM_C = 60;   // lo que se muestra de una hoja importada (lo demás se conserva en el archivo de origen)
  const px2ancho = (px) => Math.max(1, Math.round(((px - 5) / 7) * 100) / 100);
  const argb = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? "FF" + c.slice(1).toUpperCase() : null);
  const NUMFMT_BASE = { General: 0, "0": 1, "0.00": 2, "#,##0": 3, "#,##0.00": 4, "0%": 9, "0.00%": 10, "@": 49 };
  /** Rango de celdas de una gráfica, en partes para Excel: etiquetas, nombres y series (como graficas.datos). */
  function partesGrafica(t, ev, r) {
    const num = (v) => F().esNum(v);
    const val = (c, f) => ev.valor(c, f);
    const conEtiquetas = (() => { for (let f = r.f1; f <= r.f2; f++) if (r.c2 > r.c1 && !num(val(r.c1, f)) && val(r.c1, f) !== "") return true; return false; })();
    const c0 = conEtiquetas ? r.c1 + 1 : r.c1;
    let conNombres = false;
    if (r.f2 > r.f1) for (let c = c0; c <= r.c2; c++) { const v = val(c, r.f1); if (v !== "" && !num(v)) conNombres = true; }
    const f0 = conNombres ? r.f1 + 1 : r.f1;
    const series = [];
    for (let c = c0; c <= r.c2; c++) {
      let alguno = false;
      for (let f = f0; f <= r.f2; f++) if (num(val(c, f))) alguno = true;
      if (alguno) series.push({ c, nombre: conNombres ? F().formatear(val(c, r.f1)) : "Serie " + (series.length + 1), valores: Array.from({ length: r.f2 - f0 + 1 }, (_, k) => (num(val(c, f0 + k)) ? +val(c, f0 + k) : null)) });
    }
    const etiquetas = Array.from({ length: r.f2 - f0 + 1 }, (_, k) => (conEtiquetas ? F().formatear(val(r.c1, f0 + k)) : String(k + 1)));
    return { conEtiquetas, conNombres, f0, series, etiquetas };
  }
  /** XML de una gráfica nativa de Excel (barras, líneas, área, dispersión o pastel). */
  function graficaXlsx(g, hoja, t, ev) {
    const r = NOM.graficas.rango(g.rango);
    if (!r) return null;
    const pg = partesGrafica(t, ev, r);
    if (!pg.series.length) return null;
    const H = F().prefijoHoja(hoja).replace(/!$/, "");
    const abs = (c1, f1, c2, f2) => `${H}!$${F().colLetra(c1)}$${f1 + 1}:$${F().colLetra(c2)}$${f2 + 1}`;
    const col = (NOM.graficas.PALETAS[g.colores] || NOM.graficas.PALETAS.clasica).c;
    const n = pg.etiquetas.length;
    const cache = (vals) => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => (v == null ? "" : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join("")}</c:numCache>`;
    const cat = pg.conEtiquetas
      ? `<c:cat><c:strRef><c:f>${x(abs(r.c1, pg.f0, r.c1, r.f2))}</c:f><c:strCache><c:ptCount val="${n}"/>${pg.etiquetas.map((e, i) => `<c:pt idx="${i}"><c:v>${x(e)}</c:v></c:pt>`).join("")}</c:strCache></c:strRef></c:cat>` : "";
    const tx = (s) => (pg.conNombres ? `<c:tx><c:strRef><c:f>${x(abs(s.c, r.f1, s.c, r.f1))}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${x(s.nombre)}</c:v></c:pt></c:strCache></c:strRef></c:tx>` : `<c:tx><c:v>${x(s.nombre)}</c:v></c:tx>`);
    const relleno = (i) => `<c:spPr><a:solidFill><a:srgbClr val="${col[i % col.length].slice(1)}"/></a:solidFill></c:spPr>`;
    const linea = (i) => `<c:spPr><a:ln w="28575"><a:solidFill><a:srgbClr val="${col[i % col.length].slice(1)}"/></a:solidFill></a:ln></c:spPr>`;
    const vals = (s) => `<c:val><c:numRef><c:f>${x(abs(s.c, pg.f0, s.c, r.f2))}</c:f>${cache(s.valores)}</c:numRef></c:val>`;
    const ejes = `<c:axId val="1001"/><c:axId val="1002"/>`;
    const ejeX = (titulo, pos) => `<c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos || "b"}"/>${titulo ? tituloXml(titulo) : ""}<c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="1002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>`;
    const ejeY = (titulo, pos) => `<c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos || "l"}"/><c:majorGridlines/>${titulo ? tituloXml(titulo) : ""}<c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="1001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
    function tituloXml(t0) { return `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${x(t0)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`; }
    let plot;
    const clase = g.clase || "barras";
    if (clase === "pastel") {
      const s = pg.series[0];
      plot = `<c:pieChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${tx(s)}${pg.etiquetas.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/>${relleno(i)}</c:dPt>`).join("")}${cat}${vals(s)}</c:ser><c:firstSliceAng val="0"/></c:pieChart>`;
    } else if (clase === "dispersion") {
      const xs = pg.series.length > 1 ? pg.series[0] : null, ys = xs ? pg.series.slice(1) : pg.series;
      plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${ys.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx(s)}<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/>${relleno(i)}</c:marker>${xs ? `<c:xVal><c:numRef><c:f>${x(abs(xs.c, pg.f0, xs.c, r.f2))}</c:f>${cache(xs.valores)}</c:numRef></c:xVal>` : ""}<c:yVal><c:numRef><c:f>${x(abs(s.c, pg.f0, s.c, r.f2))}</c:f>${cache(s.valores)}</c:numRef></c:yVal><c:smooth val="0"/></c:ser>`).join("")}${ejes}</c:scatterChart>`
        + `<c:valAx><c:axId val="1001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${g.ejeX ? tituloXml(g.ejeX) : ""}<c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="1002"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>${ejeY(g.ejeY)}`;
    } else {
      const sers = pg.series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx(s)}${clase === "lineas" ? linea(i) + `<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>` : relleno(i)}${cat}${vals(s)}${clase === "lineas" ? `<c:smooth val="0"/>` : ""}</c:ser>`).join("");
      if (clase === "lineas") plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/>${ejes}</c:lineChart>`;
      else if (clase === "area") plot = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}${ejes}</c:areaChart>`;
      else plot = `<c:barChart><c:barDir val="${clase === "barras-h" ? "bar" : "col"}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}<c:gapWidth val="80"/>${ejes}</c:barChart>`;
      plot += ejeX(g.ejeX, clase === "barras-h" ? "l" : "b") + ejeY(g.ejeY, clase === "barras-h" ? "b" : "l");
    }
    return XML + `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${g.titulo ? tituloXml(g.titulo) + `<c:autoTitleDeleted val="0"/>` : `<c:autoTitleDeleted val="1"/>`}<c:plotArea><c:layout/>${plot}</c:plotArea>${pg.series.length > 1 || clase === "pastel" ? `<c:legend><c:legendPos val="${clase === "pastel" ? "r" : "b"}"/><c:overlay val="0"/></c:legend>` : ""}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  }
  const OPS_CF = { ">": "greaterThan", "<": "lessThan", ">=": "greaterThanOrEqual", "<=": "lessThanOrEqual", "=": "equal", "<>": "notEqual", entre: "between" };
  const valorCf = (v) => { const n = F().calcularLiteral(String(v == null ? "" : v).trim()); return F().esNum(n) ? String(+n) : `"${String(v == null ? "" : v).replace(/"/g, '""')}"`; };

  // ---- piezas que comparten "desde cero" y "a partir del original"
  const CELDA_FMT = ["n", "i", "u", "k", "tl", "r", "bd", "f", "al", "aj"];
  const quitaAttr = (attrs, nombre) => attrs.replace(new RegExp("\\s+" + nombre.replace(/[.:]/g, "\\$&") + "\\s*=\\s*(\"[^\"]*\"|'[^']*')", "g"), "");
  const mismoValor = (a, b) => { const n = (v) => (v == null || v === "" || v === false ? null : v); a = n(a); b = n(b); return a === b || (typeof a === "object" && typeof b === "object" && a && b && NOM.origen.estable(a) === NOM.origen.estable(b)); };

  /**
   * Fábrica de estilos y celdas de Excel. Sin `ini` arma un styles.xml completo; con `ini`
   * (los conteos del styles.xml de origen) solo junta lo NUEVO, numerado después de lo que ya hay.
   */
  function fabricaXlsx(doc, ini) {
    const O = ini && ini.origen;
    const fuentes = O ? [] : ['<font><sz val="11"/><name val="Calibri"/></font>'];
    const rellenos = O ? [] : ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const bordes = O ? [] : ["<border><left/><right/><top/><bottom/><diagonal/></border>"];
    const xfs = O ? [] : ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    const numFmts = [], dxfs = [];
    const base = O ? { fuente: O.fuentes.length, relleno: O.nRellenos, borde: O.nBordes, xf: O.xfs.length } : { fuente: 0, relleno: 0, borde: 0, xf: 0 };
    const idx = { fuente: O ? {} : { "": 0 }, relleno: O ? {} : { "": 0 }, borde: O ? {} : { "": 0 }, num: {}, xf: O ? {} : { "": 0 } };
    const registrar = (tipo, clave, lista, xml) => { if (idx[tipo][clave] == null) { lista.push(xml); idx[tipo][clave] = base[tipo] + lista.length - 1; } return idx[tipo][clave]; };
    let sigNum = O ? O.maxNum + 1 : 164;
    function numId(cod) {
      if (!cod || cod === "General") return 0;
      const cx = cod.replace(/aaaa/g, "yyyy").replace(/aa/g, "yy");
      if (NUMFMT_BASE[cx] != null) return NUMFMT_BASE[cx];
      if (O && O.codigos[cx] != null) return O.codigos[cx];
      if (idx.num[cx] == null) { const id = sigNum++; numFmts.push(`<numFmt numFmtId="${id}" formatCode="${x(cx)}"/>`); idx.num[cx] = id; }
      return idx.num[cx];
    }
    const xmlRelleno = (r) => `<fill><patternFill patternType="solid"><fgColor rgb="${r}"/><bgColor indexed="64"/></patternFill></fill>`;
    const xmlBorde = (bd) => { const lado = (l, si) => (si ? `<${l} style="thin"><color auto="1"/></${l}>` : `<${l}/>`); return `<border>${lado("left", bd.includes("i"))}${lado("right", bd.includes("d"))}${lado("top", bd.includes("a"))}${lado("bottom", bd.includes("b"))}<diagonal/></border>`; };
    const tamExcel = (tl) => (tl ? Math.round(tl * 1.0476 * 2) / 2 : 11);
    const ALIN = { izq: "left", centro: "center", der: "right" };
    /** Estilo de una celda armado solo con lo que dice el modelo (documento hecho en NOM-COLAB). */
    function estilo(t, ref, esFecha) {
      const b = !!t["n:" + ref], i = !!t["i:" + ref], u = !!t["u:" + ref], k = argb(t["k:" + ref]), tl = +t["tl:" + ref] || 0, tf = String(t["tf:" + ref] || "").replace(/[<>"&]/g, "");
      const kf = [b, i, u, k, tl].join("|") + (tf ? "|" + tf : "");
      const fid = kf === "false|false|false|null|0" ? 0 : registrar("fuente", kf, fuentes, `<font>${b ? "<b/>" : ""}${i ? "<i/>" : ""}${u ? "<u/>" : ""}<sz val="${tamExcel(tl)}"/>${k ? `<color rgb="${k}"/>` : ""}<name val="${tf || "Calibri"}"/></font>`);
      const r = argb(t["r:" + ref]);
      const rid = r ? registrar("relleno", r, rellenos, xmlRelleno(r)) : 0;
      const bd = String(t["bd:" + ref] || "").split("").sort().join("");
      const bid = bd ? registrar("borde", bd, bordes, xmlBorde(bd)) : 0;
      const nid = numId(t["f:" + ref] || (esFecha ? "dd/mm/yyyy" : null));
      const al = t["al:" + ref], aj = !!t["aj:" + ref], m = !!t["m:" + ref];
      const alin = al || aj || m ? `<alignment${al ? ` horizontal="${ALIN[al] || "general"}"` : ""}${m ? ' vertical="center"' : ""}${aj ? ' wrapText="1"' : ""}/>` : "";
      const kx = [fid, rid, bid, nid, alin].join("|");
      if (kx === "0|0|0|0|") return 0;
      return registrar("xf", kx, xfs, `<xf numFmtId="${nid}" fontId="${fid}" fillId="${rid}" borderId="${bid}" xfId="0"${fid ? ' applyFont="1"' : ""}${rid ? ' applyFill="1"' : ""}${bid ? ' applyBorder="1"' : ""}${nid ? ' applyNumberFormat="1"' : ""}${alin ? ' applyAlignment="1">' + alin + "</xf>" : "/>"}`);
    }
    /**
     * Estilo a partir del que tenía la celda en el archivo original (sOrig): solo se toca lo que la
     * persona cambió (`camb` = llaves de formato distintas); lo demás (fuente, tema, protección…) se queda.
     */
    function estiloDesde(t, ref, sOrig, camb, fmtFecha) {
      const xf = O.xfs[sOrig] || O.xfs[0] || { attrs: "", numFmtId: 0, fontId: 0, fillId: 0, borderId: 0, alin: "", otros: "" };
      let { fontId, fillId, borderId, numFmtId, alin } = xf;
      const aplica = {};
      if (["n", "i", "u", "k", "tl"].some((k) => camb.has(k))) {
        let dentro = O.fuentes[fontId] != null ? O.fuentes[fontId] : O.fuentes[0] || "";
        const quita = (tag) => { dentro = dentro.replace(new RegExp("<" + tag + "(?=[\\s/>])[^>]*/>|<" + tag + "(?=[\\s>])[^>]*>[\\s\\S]*?</" + tag + ">", "g"), ""); };
        if (camb.has("n")) { quita("b"); if (t["n:" + ref]) dentro = "<b/>" + dentro; }
        if (camb.has("i")) { quita("i"); if (t["i:" + ref]) dentro = "<i/>" + dentro; }
        if (camb.has("u")) { quita("u"); if (t["u:" + ref]) dentro = "<u/>" + dentro; }
        if (camb.has("tl")) { quita("sz"); dentro += `<sz val="${tamExcel(+t["tl:" + ref] || 0)}"/>`; }
        if (camb.has("k")) { quita("color"); const k = argb(t["k:" + ref]); if (k) dentro += `<color rgb="${k}"/>`; }
        fontId = registrar("fuente", dentro, fuentes, `<font>${dentro}</font>`); aplica.applyFont = 1;
      }
      if (camb.has("r")) { const r = argb(t["r:" + ref]); fillId = r ? registrar("relleno", r, rellenos, xmlRelleno(r)) : 0; aplica.applyFill = 1; }
      if (camb.has("bd")) { const bd = String(t["bd:" + ref] || "").split("").sort().join(""); borderId = bd ? registrar("borde", bd, bordes, xmlBorde(bd)) : 0; aplica.applyBorder = 1; }
      if (camb.has("f") || fmtFecha) { numFmtId = numId(t["f:" + ref] || fmtFecha); aplica.applyNumberFormat = 1; }
      if (camb.has("al") || camb.has("aj")) {
        let a = alin || "";
        if (camb.has("al")) { a = quitaAttr(a, "horizontal"); const al = t["al:" + ref]; if (al) a += ` horizontal="${ALIN[al] || "general"}"`; }
        if (camb.has("aj")) { a = quitaAttr(a, "wrapText"); if (t["aj:" + ref]) a += ' wrapText="1"'; }
        alin = a; aplica.applyAlignment = 1;
      }
      if (fontId === xf.fontId && fillId === xf.fillId && borderId === xf.borderId && numFmtId === xf.numFmtId && alin === xf.alin) return sOrig;
      let attrs = xf.attrs;
      ["numFmtId", "fontId", "fillId", "borderId", ...Object.keys(aplica)].forEach((k) => { attrs = quitaAttr(attrs, k); });
      attrs = ` numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}"` + attrs + Object.keys(aplica).map((k) => ` ${k}="1"`).join("");
      const dentro = (alin && alin.trim() ? `<alignment${alin}/>` : "") + (xf.otros || "");
      return registrar("xf", attrs + "|" + dentro, xfs, dentro ? `<xf${attrs}>${dentro}</xf>` : `<xf${attrs}/>`);
    }
    function dxf(rg) {
      const k = argb(rg.color), f = argb(rg.fondo);
      dxfs.push(`<dxf>${k || rg.negrita ? `<font>${rg.negrita ? "<b/>" : ""}${k ? `<color rgb="${k}"/>` : ""}</font>` : ""}${f ? `<fill><patternFill><bgColor rgb="${f}"/></patternFill></fill>` : ""}</dxf>`);
      return (O ? O.nDxfs : 0) + dxfs.length - 1;
    }
    /** ¿El valor escrito es una fecha? (para darle formato de fecha si la celda no tiene uno). */
    const esFechaLit = (crudo) => crudo !== "" && !crudo.startsWith("=") && F().calcularLiteral(crudo.trim()) instanceof F().FechaF;
    /** XML de una celda con el valor del modelo y el estilo `sx` (ya calculado). */
    function celda(t, ev, ref, c, f, sx) {
      const crudo = t["c:" + ref] == null ? "" : String(t["c:" + ref]), s = sx ? ` s="${sx}"` : "";
      if (crudo.startsWith("=")) {
        const v = ev.valor(c, f);
        const val = F().esNum(v) ? `<v>${+v}</v>` : typeof v === "boolean" ? `<v>${v ? 1 : 0}</v>` : v instanceof F().ErrorF ? `<v>${x(v.codigo)}</v>` : `<v>${x(v)}</v>`;
        const tipo = typeof v === "boolean" ? ' t="b"' : v instanceof F().ErrorF ? ' t="e"' : F().esNum(v) ? "" : ' t="str"';
        return `<c r="${ref}"${s}${tipo}><f>${x(formulaExcel(crudo))}</f>${val}</c>`;
      }
      if (crudo === "") return `<c r="${ref}"${s}/>`;
      if (t["f:" + ref] === "@") return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${x(crudo)}</t></is></c>`;
      const lit = F().calcularLiteral(crudo.trim());
      if (typeof lit === "boolean") return `<c r="${ref}"${s} t="b"><v>${lit ? 1 : 0}</v></c>`;
      return F().esNum(lit) ? `<c r="${ref}"${s}><v>${+lit}</v></c>` : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${x(crudo)}</t></is></c>`;
    }
    const combinadas = (t) => Object.keys(t).filter((k) => k.startsWith("m:") && /^\d+x\d+$/.test(String(t[k] || ""))).map((k) => {
      const r = F().parseRef(k.slice(2)), [w, h] = String(t[k]).split("x").map(Number);
      return r && w * h > 1 ? `<mergeCell ref="${F().ref(r.c, r.f)}:${F().ref(r.c + w - 1, r.f + h - 1)}"/>` : "";
    }).filter(Boolean);
    let prioridad = (O ? 1000 : 0) + 1;
    function regla(rg) {
      if (!rg || !rg.rango) return "";
      const primero = rg.rango.split(":")[0], d = dxf(rg);
      let r0;
      if (OPS_CF[rg.op]) r0 = `<cfRule type="cellIs" dxfId="${d}" priority="${prioridad++}" operator="${OPS_CF[rg.op]}"><formula>${x(valorCf(rg.v1))}</formula>${rg.op === "entre" ? `<formula>${x(valorCf(rg.v2))}</formula>` : ""}</cfRule>`;
      else if (rg.op === "contiene") r0 = `<cfRule type="containsText" dxfId="${d}" priority="${prioridad++}" operator="containsText" text="${x(rg.v1 || "")}"><formula>${x(`NOT(ISERROR(SEARCH("${String(rg.v1 || "").replace(/"/g, '""')}",${primero})))`)}</formula></cfRule>`;
      else if (rg.op === "vacia") r0 = `<cfRule type="containsBlanks" dxfId="${d}" priority="${prioridad++}"><formula>${x(`LEN(TRIM(${primero}))=0`)}</formula></cfRule>`;
      else if (rg.op === "novacia") r0 = `<cfRule type="notContainsBlanks" dxfId="${d}" priority="${prioridad++}"><formula>${x(`LEN(TRIM(${primero}))>0`)}</formula></cfRule>`;
      return r0 ? `<conditionalFormatting sqref="${x(rg.rango)}">${r0}</conditionalFormatting>` : "";
    }
    function validacion(v) {
      if (!v || !v.rango) return "";
      const msg = v.mensaje ? ` showErrorMessage="1" error="${x(v.mensaje)}"` : ' showErrorMessage="1"';
      if (v.tipo === "lista") return `<dataValidation type="list" allowBlank="1"${msg} sqref="${x(v.rango)}"><formula1>${x('"' + (v.valores || []).join(",").slice(0, 250) + '"')}</formula1></dataValidation>`;
      if (v.tipo === "numero") {
        const a = v.min !== "" && v.min != null, b = v.max !== "" && v.max != null;
        if (!a && !b) return "";
        const op = a && b ? "between" : a ? "greaterThanOrEqual" : "lessThanOrEqual";
        return `<dataValidation type="decimal" operator="${op}" allowBlank="1"${msg} sqref="${x(v.rango)}"><formula1>${x(String(a ? v.min : v.max))}</formula1>${a && b ? `<formula2>${x(String(v.max))}</formula2>` : ""}</dataValidation>`;
      }
      return "";
    }
    const panel = (t) => { const ff = +t.fijasF || 0, fc = +t.fijasC || 0; return ff || fc ? `<pane${fc ? ` xSplit="${fc}"` : ""}${ff ? ` ySplit="${ff}"` : ""} topLeftCell="${F().ref(fc, ff)}" activePane="${ff && fc ? "bottomRight" : ff ? "bottomLeft" : "topRight"}" state="frozen"/>` : ""; };
    /** Ancla de una gráfica en el dibujo de la hoja (con sus espacios de nombres: sirve suelta). */
    const anclaGrafica = (rid, ng, colIni, fila0) => `<xdr:twoCellAnchor xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" editAs="oneCell"><xdr:from><xdr:col>${colIni}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fila0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${colIni + 8}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fila0 + 16}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${ng + 1000}" name="Gráfica ${ng}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    return { fuentes, rellenos, bordes, xfs, numFmts, dxfs, estilo, estiloDesde, dxf, celda, esFechaLit, combinadas, regla, validacion, panel, anclaGrafica };
  }

  /** Hoja de cálculo → .xlsx. Si el documento vino de un Excel, se parte de ese archivo (xlsxConOrigen). */
  function xlsx(doc) {
    const og = NOM.ooxml.usarOrigen !== false && NOM.origen ? NOM.origen.leer(doc) : null;
    if (og && og.fmt === "xlsx") {
      try { return xlsxConOrigen(doc, og); }
      catch (e) { if (typeof console !== "undefined") console.warn("Excel: no se pudo partir del archivo original; se arma desde cero.", e); }
    }
    return xlsxNuevo(doc);
  }

  function xlsxNuevo(doc) {
    const tablas = F().hojasDe(doc);
    if (!tablas.length) throw new Error("Este documento no tiene ninguna tabla");
    const nombres = [];
    const fab = fabricaXlsx(doc, null);
    const graficasArch = [], dibujos = [], relsHojas = [];
    const hojas = tablas.map((t, i) => {
      let n = F().nombreDeHoja(doc, t).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Hoja${i + 1}`;
      while (nombres.includes(n)) n = n.slice(0, 28) + " " + (i + 1);
      nombres.push(n);
      const ev = F().evaluadorDeTabla(doc, t);
      const ncols = Math.max(t.cols || 10, 1);
      // Gráficas de esta hoja: un dibujo con una gráfica nativa por cada una.
      const gs = doc.vivos().filter((g) => g.tipo === "grafica" && g.hoja === t.id);
      let dibujo = "";
      if (gs.length) {
        const nd = dibujos.length + 1, anclas = [], relsDibujo = [];
        let fila0 = 1;
        const colIni = Math.min(ncols + 1, 20);
        gs.forEach((g) => {
          const xmlG = graficaXlsx(g, n, t, ev);
          if (!xmlG) return;
          graficasArch.push(xmlG);
          const ng = graficasArch.length, rid = "rIdG" + ng;
          relsDibujo.push({ id: rid, tipo: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart", destino: `../charts/chart${ng}.xml` });
          anclas.push(fab.anclaGrafica(rid, ng, colIni, fila0));
          fila0 += 18;
        });
        if (anclas.length) {
          dibujos.push({ n: nd, xml: XML + `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anclas.join("")}</xdr:wsDr>`, rels: relsDibujo });
          relsHojas[i] = [{ id: "rIdD1", tipo: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing", destino: `../drawings/drawing${nd}.xml` }];
          dibujo = `<drawing r:id="rIdD1"/>`;
        }
      }
      return hojaDesdeCero(t, ev, fab, (ref, esFecha) => fab.estilo(t, ref, esFecha), i === 0, dibujo);
    });
    const { fuentes, rellenos, bordes, xfs, numFmts, dxfs } = fab;
    const libro = XML + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${x(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
    const estilos = XML + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.join("")}</numFmts>` : ""}<fonts count="${fuentes.length}">${fuentes.join("")}</fonts>
<fills count="${rellenos.length}">${rellenos.join("")}</fills><borders count="${bordes.length}">${bordes.join("")}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>${dxfs.length ? `<dxfs count="${dxfs.length}">${dxfs.join("")}</dxfs>` : ""}</styleSheet>`;
    const relsLibro = [...hojas.map((_, i) => ({ id: "rId" + (i + 1), tipo: T.hoja, destino: `worksheets/hoja${i + 1}.xml` })),
      { id: "rIdEst", tipo: T.estilos, destino: "styles.xml" }];
    return zip([
      { nombre: "[Content_Types].xml", datos: CT(`<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hojas.map((_, i) => `<Override PartName="/xl/worksheets/hoja${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
${dibujos.map((d) => `<Override PartName="/xl/drawings/drawing${d.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join("")}
${graficasArch.map((_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("")}`) },
      { nombre: "_rels/.rels", datos: RELS([{ tipo: T.doc, destino: "xl/workbook.xml" }]) },
      { nombre: "xl/workbook.xml", datos: libro },
      { nombre: "xl/styles.xml", datos: estilos },
      { nombre: "xl/_rels/workbook.xml.rels", datos: RELS(relsLibro) },
      ...hojas.map((h, i) => ({ nombre: `xl/worksheets/hoja${i + 1}.xml`, datos: h })),
      ...relsHojas.map((r, i) => (r ? { nombre: `xl/worksheets/_rels/hoja${i + 1}.xml.rels`, datos: RELS(r) } : null)).filter(Boolean),
      ...dibujos.flatMap((d) => [{ nombre: `xl/drawings/drawing${d.n}.xml`, datos: d.xml }, { nombre: `xl/drawings/_rels/drawing${d.n}.xml.rels`, datos: RELS(d.rels) }]),
      ...graficasArch.map((g, i) => ({ nombre: `xl/charts/chart${i + 1}.xml`, datos: g })),
    ]);
  }

  // ------------------------------------------------------------ partir del archivo original
  /** Aplica reemplazos [ini, fin, texto] (que no se enciman) sobre un texto. */
  function aplicarPiezas(xml, piezas) {
    if (!piezas.length) return xml;
    const ps = piezas.map((p, k) => [p[0], p[1], p[2], k]).sort((a, b) => a[0] - b[0] || a[3] - b[3]);
    let r = "", i = 0;
    for (const [a, b, t] of ps) { if (a < i) continue; r += xml.slice(i, a) + t; i = b; }
    return r + xml.slice(i);
  }
  const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
  /** El .zip de origen abierto para cambiarle partes: texto o bytes, relaciones y tipos de contenido. */
  function paqueteDe(og) {
    const Z = og.zip, nuevos = new Map(), quitados = new Set(), orden = Z.nombres();
    const dec = new TextDecoder();
    const CTN = "[Content_Types].xml";
    const P = {
      tiene: (n) => nuevos.has(n) || (Z.tiene(n) && !quitados.has(n)),
      texto(n) { if (nuevos.has(n)) { const v = nuevos.get(n); return typeof v === "string" ? v : dec.decode(v); } return quitados.has(n) ? null : Z.texto(n); },
      bytes(n) { if (nuevos.has(n)) { const v = nuevos.get(n); return typeof v === "string" ? enc.encode(v) : v; } return quitados.has(n) ? null : Z.bytes(n); },
      pon(n, datos) { if (!P.tiene(n) && !orden.includes(n)) orden.push(n); quitados.delete(n); nuevos.set(n, datos); },
      quita(n) { nuevos.delete(n); quitados.add(n); },
      nombres: () => orden.filter((n) => P.tiene(n)),
      relsDe: (ruta) => { const k = ruta.lastIndexOf("/"); return ruta.slice(0, k + 1) + "_rels/" + ruta.slice(k + 1) + ".rels"; },
      resolver(ruta, destino) {
        if (destino.startsWith("/")) return destino.slice(1);
        const b = ruta.split("/").slice(0, -1);
        destino.split("/").forEach((s) => { if (s === "..") b.pop(); else if (s !== "." && s !== "") b.push(s); });
        return b.join("/");
      },
      rels(ruta) {
        const t = P.texto(P.relsDe(ruta)), r = [];
        if (!t) return r;
        const re = /<(?:\w+:)?Relationship\b([^>]*?)\/?>/g;
        let m;
        while ((m = re.exec(t))) {
          const a = (n) => { const q = new RegExp("\\s" + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')').exec(m[1]); return q ? NOM.origen.desescapar(q[1] != null ? q[1] : q[2]) : null; };
          r.push({ id: a("Id"), tipo: a("Type"), destino: a("Target"), externo: a("TargetMode") === "External" });
        }
        return r;
      },
      agregaRel(ruta, id, tipo, destino, externo) {
        const n = P.relsDe(ruta), nuevo = `<Relationship Id="${id}" Type="${tipo}" Target="${x(destino)}"${externo ? ' TargetMode="External"' : ""}/>`;
        let t = P.texto(n);
        if (!t) t = XML + `<Relationships xmlns="${REL_NS}"></Relationships>`;
        const k = t.lastIndexOf("</");
        t = k < 0 ? t.replace(/<Relationships([^>]*)\/>\s*$/, `<Relationships$1>${nuevo}</Relationships>`) : t.slice(0, k) + nuevo + t.slice(k);
        P.pon(n, t);
      },
      quitaRel(ruta, id) {
        const n = P.relsDe(ruta), t = P.texto(n);
        if (t) P.pon(n, t.replace(new RegExp('<(?:\\w+:)?Relationship\\b[^>]*\\sId\\s*=\\s*["\']' + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '["\'][^>]*?/>'), ""));
      },
      /** Declara el tipo de contenido de una parte nueva. */
      tipo(parte, ct) {
        let t = P.texto(CTN) || "";
        if (t.includes(`PartName="/${parte}"`)) return;
        const k = t.lastIndexOf("</");
        P.pon(CTN, t.slice(0, k) + `<Override PartName="/${x(parte)}" ContentType="${ct}"/>` + t.slice(k));
      },
      extension(ext, ct) {
        let t = P.texto(CTN) || "";
        if (new RegExp('<Default\\b[^>]*Extension\\s*=\\s*["\']' + ext + '["\']', "i").test(t)) return;
        const k = t.indexOf(">", t.indexOf("<Types")) + 1;
        P.pon(CTN, t.slice(0, k) + `<Default Extension="${ext}" ContentType="${ct}"/>` + t.slice(k));
      },
      quitaTipo(parte) {
        const t = P.texto(CTN);
        if (t) P.pon(CTN, t.replace(new RegExp('<Override\\b[^>]*PartName\\s*=\\s*["\']/' + parte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '["\'][^>]*?/>'), ""));
      },
      zip() {
        const lista = orden.filter((n) => P.tiene(n)).map((n) => {
          if (nuevos.has(n)) {
            // Si la parte original empezaba con la marca UTF-8 (BOM), se conserva: al leerla como texto se
            // pierde, y la parte reescrita salía 3 bytes distinta aunque su contenido fuera el mismo.
            let v = nuevos.get(n);
            if (typeof v === "string" && v.charCodeAt(0) !== 0xFEFF && Z.tiene(n)) { const o = Z.bytes(n); if (o && o[0] === 0xEF && o[1] === 0xBB && o[2] === 0xBF) v = "\uFEFF" + v; }
            return { nombre: n, datos: v };
          }
          const d = Z.bytes(n), cr = d == null && Z.crudo ? Z.crudo(n) : null;
          return cr ? { nombre: n, crudo: cr } : { nombre: n, datos: d };
        }).filter((x) => x.crudo || x.datos != null);
        // [Content_Types].xml primero, como lo escribe Office
        lista.sort((a, b) => (a.nombre === CTN ? -1 : 0) - (b.nombre === CTN ? -1 : 0));
        return zip(lista);
      },
    };
    return P;
  }

  /** Lo que hace falta del styles.xml de origen para agregarle estilos sin tocar los que ya tiene. */
  function estilosOrigen(xml) {
    const O = NOM.origen, raiz = O.hijosXml(xml).find((h) => O.local(h.n) === "styleSheet");
    if (!raiz) throw new Error("styles.xml sin raíz");
    const pref = raiz.n.includes(":") ? raiz.n.split(":")[0] + ":" : "";
    const sinPref = (s) => (pref ? s.replace(new RegExp("<(/?)" + pref, "g"), "<$1") : s);
    const hs = O.hijosXml(xml, raiz.ci, raiz.cf), sec = (n) => hs.find((h) => O.local(h.n) === n) || null;
    const dentro = (s) => (s ? O.hijosXml(xml, s.ci, s.cf) : []);
    const fuentes = dentro(sec("fonts")).map((h) => sinPref(xml.slice(h.ci, h.cf)));
    const codigos = {};
    let maxNum = 163;
    dentro(sec("numFmts")).forEach((h) => { const id = +O.attr(xml, h, "numFmtId"), cod = O.attr(xml, h, "formatCode"); if (id > maxNum) maxNum = id; if (cod != null && codigos[cod] == null) codigos[cod] = id; });
    const xfs = dentro(sec("cellXfs")).map((h) => {
      const ks = O.hijosXml(xml, h.ci, h.cf), al = ks.find((k) => O.local(k.n) === "alignment");
      return { attrs: xml.slice(h.a, h.af), numFmtId: +O.attr(xml, h, "numFmtId") || 0, fontId: +O.attr(xml, h, "fontId") || 0, fillId: +O.attr(xml, h, "fillId") || 0, borderId: +O.attr(xml, h, "borderId") || 0,
        alin: al ? xml.slice(al.a, al.af).replace(/\s+$/, "") : "", otros: sinPref(ks.filter((k) => k !== al).map((k) => xml.slice(k.i, k.f)).join("")) };
    });
    return { raiz, pref, hs, sec, fuentes, nRellenos: dentro(sec("fills")).length, nBordes: dentro(sec("borders")).length, nDxfs: dentro(sec("dxfs")).length, xfs, codigos, maxNum };
  }
  function estilosConNuevos(xml, EO, fab) {
    const O = NOM.origen, pf = (s) => (EO.pref ? s.replace(/<(\/?)(?=[A-Za-z])/g, "<$1" + EO.pref) : s), piezas = [];
    const ORD = ["numFmts", "fonts", "fills", "borders", "cellStyleXfs", "cellXfs", "cellStyles", "dxfs", "tableStyles", "colors", "extLst"];
    const agrega = (nombre, items) => {
      if (!items.length) return;
      const s = EO.sec(nombre), nuevo = pf(items.join(""));
      if (s) {
        const n = O.hijosXml(xml, s.ci, s.cf).length + items.length;
        piezas.push([s.i, s.f, `<${s.n}${quitaAttr(xml.slice(s.a, s.af), "count")} count="${n}">${xml.slice(s.ci, s.cf)}${nuevo}</${s.n}>`]);
      } else {
        const k = ORD.indexOf(nombre), sig = EO.hs.find((h) => ORD.indexOf(O.local(h.n)) > k), pos = sig ? sig.i : EO.raiz.cf;
        piezas.push([pos, pos, `<${EO.pref}${nombre} count="${items.length}">${nuevo}</${EO.pref}${nombre}>`]);
      }
    };
    agrega("numFmts", fab.numFmts); agrega("fonts", fab.fuentes); agrega("fills", fab.rellenos); agrega("borders", fab.bordes); agrega("cellXfs", fab.xfs); agrega("dxfs", fab.dxfs);
    return aplicarPiezas(xml, piezas);
  }

  const ORDEN_HOJA = ["sheetPr", "dimension", "sheetViews", "sheetFormatPr", "cols", "sheetData", "sheetCalcPr", "sheetProtection", "protectedRanges", "scenarios", "autoFilter", "sortState", "dataConsolidate", "customSheetViews", "mergeCells", "phoneticPr", "conditionalFormatting", "dataValidations", "hyperlinks", "printOptions", "pageMargins", "pageSetup", "headerFooter", "rowBreaks", "colBreaks", "customProperties", "cellWatches", "ignoredErrors", "smartTags", "drawing", "legacyDrawing", "legacyDrawingHF", "drawingHF", "picture", "oleObjects", "controls", "webPublishItems", "tableParts", "extLst"];
  /** Las secciones de una hoja (hijos de <worksheet>) y cómo reemplazar o insertar una en su lugar. */
  function seccionesHoja(xml) {
    const O = NOM.origen, raiz = O.hijosXml(xml).find((h) => O.local(h.n) === "worksheet");
    if (!raiz) throw new Error("hoja sin raíz");
    const pref = raiz.n.includes(":") ? raiz.n.split(":")[0] + ":" : "";
    const hs = O.hijosXml(xml, raiz.ci, raiz.cf), piezas = [];
    return {
      raiz, pref, hs, piezas,
      pf: (s) => (pref ? s.replace(/<(\/?)(?=[A-Za-z])/g, "<$1" + pref) : s),
      una: (n) => hs.find((h) => O.local(h.n) === n) || null,
      todas: (n) => hs.filter((h) => O.local(h.n) === n),
      /** Reemplaza la sección (todas las de ese nombre) o la inserta donde toca. */
      pon(nombre, nuevo) {
        const v = hs.filter((h) => O.local(h.n) === nombre);
        if (v.length) { piezas.push([v[0].i, v[v.length - 1].f, nuevo]); return; }
        if (!nuevo) return;
        const k = ORDEN_HOJA.indexOf(nombre), sig = hs.find((h) => ORDEN_HOJA.indexOf(O.local(h.n)) > k), pos = sig ? sig.i : raiz.cf;
        piezas.push([pos, pos, nuevo]);
      },
      aplicar: () => aplicarPiezas(xml, piezas),
    };
  }

  /**
   * Devuelve el XML de la hoja de origen con SOLO lo que cambió respecto a lo importado (`base`),
   * o null si no cambió nada. Lo demás (estilos, textos enriquecidos, gráficas, filtros, vínculos,
   * formato condicional, celdas fuera de lo que NOM-COLAB muestra) queda intacto.
   */
  function parcharHoja(xml, base, t, fab, ev) {
    const O = NOM.origen;
    const celdas = new Map(), filasAlto = new Set(), colsCamb = new Set();
    let cM = false, cPane = false, cCf = false, cDv = false;
    const llaves = new Set(Object.keys(base));
    Object.keys(t).forEach((k) => llaves.add(k));
    llaves.forEach((k) => {
      if (mismoValor(base[k], t[k])) return;
      const i2 = k.indexOf(":");
      if (i2 > 0) {
        const p = k.slice(0, i2), r = k.slice(i2 + 1);
        if ((p === "c" || CELDA_FMT.includes(p)) && /^[A-Z]{1,3}\d+$/.test(r)) { (celdas.get(r) || celdas.set(r, new Set()).get(r)).add(p); }
        else if (p === "m") cM = true;
        else if (p === "ah") filasAlto.add(+r);
        else if (p === "aw") colsCamb.add(r);
        else if (p === "cf") cCf = true;
        else if (p === "dv") cDv = true;
      } else if (k === "fijasF" || k === "fijasC") cPane = true;
    });
    if (!celdas.size && !filasAlto.size && !colsCamb.size && !cM && !cPane && !cCf && !cDv) return null;
    const S = seccionesHoja(xml), pf = S.pf;
    const tiene = (v) => v != null && v !== "" && v !== false;

    if (celdas.size || filasAlto.size) {
      const sd = S.una("sheetData");
      const rows = sd ? O.hijosXml(xml, sd.ci, sd.cf).filter((h) => O.local(h.n) === "row") : [];
      // Fórmulas compartidas: si cambia la celda "maestra", las que dependen de ella se escriben completas.
      if (sd && xml.indexOf('t="shared"', sd.ci) > 0) {
        const re = /<(?:\w+:)?c\b([^>]*)>\s*<(?:\w+:)?f\b([^>]*?)\/?>/g, maestras = {}, siguen = {};
        re.lastIndex = sd.ci;
        let m;
        while ((m = re.exec(xml)) && m.index < sd.cf) {
          if (!/t="shared"/.test(m[2])) continue;
          const r = (/\sr="([A-Z]+\d+)"/.exec(m[1]) || [])[1], si = (/\ssi="(\d+)"/.exec(m[2]) || [])[1];
          if (!r || si == null) continue;
          if (/\sref="/.test(m[2])) maestras[r] = si; else (siguen[si] = siguen[si] || []).push(r);
        }
        [...celdas.keys()].forEach((r) => { if (maestras[r] != null && celdas.get(r).has("c")) (siguen[maestras[r]] || []).forEach((q) => (celdas.get(q) || celdas.set(q, new Set()).get(q)).add("c")); });
      }
      const porFila = new Map();
      celdas.forEach((ks, ref) => { const p = F().parseRef(ref); if (!p) return; (porFila.get(p.f + 1) || porFila.set(p.f + 1, new Map()).get(p.f + 1)).set(p.c, { ref, ks }); });
      filasAlto.forEach((n) => { if (n > 0 && !porFila.has(n)) porFila.set(n, new Map()); });
      const altoAttr = (n) => { const h = +t["ah:" + n] || 0; return h ? ` ht="${Math.round(h * 0.75 * 100) / 100}" customHeight="1"` : ""; };
      const celdaParchada = (ref, c, f, ks, oc) => {
        const sOrig = oc ? +(O.attr(xml, oc, "s") || 0) : 0;
        const camb = new Set([...ks].filter((k) => k !== "c"));
        if (!oc) CELDA_FMT.forEach((k) => { if (tiene(t[k + ":" + ref])) camb.add(k); });
        const crudo = t["c:" + ref] == null ? "" : String(t["c:" + ref]);
        // una fecha recién escrita en una celda sin formato de número se muestra como fecha
        const xfO = fab.xfOrigen(sOrig);
        const fecha = ks.has("c") && !tiene(t["f:" + ref]) && (!xfO || !xfO.numFmtId) && (crudo.startsWith("=") ? ev.valor(c, f) instanceof F().FechaF : fab.esFechaLit(crudo)) ? "dd/mm/yyyy" : null;
        const s = camb.size || fecha ? fab.estiloDesde(t, ref, sOrig, camb, fecha) : sOrig;
        if (!ks.has("c") && oc) {
          // mismo valor (con su texto enriquecido o su fórmula original): solo cambia el estilo
          const attrs = quitaAttr(xml.slice(oc.a, oc.af), "s") + (s ? ` s="${s}"` : "");
          return oc.ci === oc.f ? `<${oc.n}${attrs}/>` : `<${oc.n}${attrs}>${xml.slice(oc.ci, oc.cf)}</${oc.n}>`;
        }
        if (crudo === "") return s ? pf(`<c r="${ref}" s="${s}"/>`) : "";
        return pf(fab.celda(t, ev, ref, c, f, s));
      };
      const filaNueva = (n) => {
        const cs = [...porFila.get(n).entries()].sort((a, b) => a[0] - b[0]).map(([c, v]) => celdaParchada(v.ref, c, n - 1, v.ks, null)).join("");
        const alto = altoAttr(n);
        return cs || alto ? pf(`<row r="${n}"${alto}>`) + cs + pf("</row>") : "";
      };
      const filaParchada = (row, n, cambios) => {
        const orig = new Map(), otros = [];
        let col = 0;
        O.hijosXml(xml, row.ci, row.cf).forEach((c) => {
          if (O.local(c.n) !== "c") { otros.push(xml.slice(c.i, c.f)); return; }
          const r = O.attr(xml, c, "r"), p = r ? F().parseRef(r) : null, k = p ? p.c : col;
          col = k + 1; orig.set(k, c);
        });
        const columnas = [...new Set([...orig.keys(), ...cambios.keys()])].sort((a, b) => a - b);
        let dentro = "";
        columnas.forEach((c) => { const cb = cambios.get(c), oc = orig.get(c); dentro += cb ? celdaParchada(cb.ref, c, n - 1, cb.ks, oc || null) : xml.slice(oc.i, oc.f); });
        let attrs = quitaAttr(xml.slice(row.a, row.af), "spans");
        if (filasAlto.has(n)) attrs = quitaAttr(quitaAttr(attrs, "ht"), "customHeight") + altoAttr(n);
        if (!/\sr\s*=/.test(attrs)) attrs = ` r="${n}"` + attrs;
        return `<${row.n}${attrs}>${dentro}${otros.join("")}</${row.n}>`;
      };
      const pend = [...porFila.keys()].sort((a, b) => a - b);
      let pi = 0, nFila = 0, sale = "";
      rows.forEach((row) => {
        const rn = +O.attr(xml, row, "r") || nFila + 1;
        nFila = rn;
        while (pi < pend.length && pend[pi] < rn) sale += filaNueva(pend[pi++]);
        if (pi < pend.length && pend[pi] === rn) { sale += filaParchada(row, rn, porFila.get(rn)); pi++; }
        else sale += xml.slice(row.i, row.f);
      });
      while (pi < pend.length) sale += filaNueva(pend[pi++]);
      if (sd) S.piezas.push([sd.i, sd.f, `<${sd.n}${xml.slice(sd.a, sd.af)}>${sale}</${sd.n}>`]);
      else S.pon("sheetData", pf("<sheetData>") + sale + pf("</sheetData>"));
      if (celdas.size) S.pon("dimension", "");
    }
    if (colsCamb.size) {
      const sec = S.una("cols");
      let rangos = (sec ? O.hijosXml(xml, sec.ci, sec.cf) : []).map((h) => ({ min: +O.attr(xml, h, "min"), max: +O.attr(xml, h, "max"), attrs: quitaAttr(quitaAttr(xml.slice(h.a, h.af), "min"), "max") }));
      colsCamb.forEach((letra) => {
        const p = F().parseRef(letra + "1");
        if (!p) return;
        const n = p.c + 1, w = +t["aw:" + letra] || 0, nuevos = [];
        let puesto = false;
        rangos.forEach((r) => {
          if (n < r.min || n > r.max) { nuevos.push(r); return; }
          if (r.min < n) nuevos.push({ min: r.min, max: n - 1, attrs: r.attrs });
          let a = quitaAttr(quitaAttr(r.attrs, "width"), "customWidth");
          if (w) a += ` width="${px2ancho(w)}" customWidth="1"`;
          if (a.trim()) nuevos.push({ min: n, max: n, attrs: w ? a : a + ' width="9.14"' });
          if (r.max > n) nuevos.push({ min: n + 1, max: r.max, attrs: r.attrs });
          puesto = true;
        });
        if (!puesto && w) nuevos.push({ min: n, max: n, attrs: ` width="${px2ancho(w)}" customWidth="1"` });
        rangos = nuevos.sort((a, b) => a.min - b.min);
      });
      S.pon("cols", rangos.length ? pf(`<cols>${rangos.map((r) => `<col min="${r.min}" max="${r.max}"${r.attrs}/>`).join("")}</cols>`) : "");
    }
    if (cM) {
      const sec = S.una("mergeCells");
      // las combinadas que quedaron fuera de lo importado (más allá del límite) se conservan
      const fuera = (sec ? O.hijosXml(xml, sec.ci, sec.cf) : []).filter((h) => { const a = F().parseRef(String(O.attr(xml, h, "ref") || "").split(":")[0]); return a && (a.f >= LIM_F || a.c >= LIM_C); }).map((h) => xml.slice(h.i, h.f));
      const todas = fab.combinadas(t).map(pf).concat(fuera);
      S.pon("mergeCells", todas.length ? pf(`<mergeCells count="${todas.length}">`) + todas.join("") + pf("</mergeCells>") : "");
    }
    if (cPane) {
      const sv = S.una("sheetViews"), pane = fab.panel(t);
      const v1 = sv ? O.hijosXml(xml, sv.ci, sv.cf).find((h) => O.local(h.n) === "sheetView") : null;
      if (v1) {
        const resto = O.hijosXml(xml, v1.ci, v1.cf).filter((h) => !["pane", "selection"].includes(O.local(h.n))).map((h) => xml.slice(h.i, h.f)).join("");
        S.piezas.push([v1.i, v1.f, `<${v1.n}${xml.slice(v1.a, v1.af)}>${pf(pane)}${resto}</${v1.n}>`]);
      } else if (pane) S.pon("sheetViews", pf(`<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>`));
    }
    if (cCf) {
      const viejas = S.todas("conditionalFormatting").map((h) => xml.slice(h.i, h.f)).join("");
      const nuevas = Object.keys(t).filter((k) => k.startsWith("cf:") && !mismoValor(base[k], t[k])).map((k) => fab.regla(t[k])).join("");
      S.pon("conditionalFormatting", viejas + pf(nuevas));
    }
    if (cDv) {
      const sec = S.una("dataValidations"), lista = [];
      (sec ? O.hijosXml(xml, sec.ci, sec.cf) : []).forEach((h, k) => {
        const kb = "dv:x" + k;
        if (base[kb] == null || mismoValor(base[kb], t[kb])) lista.push(xml.slice(h.i, h.f));   // no importada, o importada y sin cambios
      });
      Object.keys(t).filter((k) => k.startsWith("dv:") && tiene(t[k]) && !mismoValor(base[k], t[k])).forEach((k) => { const v = fab.validacion(t[k]); if (v) lista.push(pf(v)); });
      S.pon("dataValidations", lista.length ? pf(`<dataValidations count="${lista.length}">`) + lista.join("") + pf("</dataValidations>") : "");
    }
    return S.aplicar();
  }

  /** Hoja completa armada desde el modelo (documento nuevo, u hoja agregada a un libro importado). */
  function hojaDesdeCero(t, ev, fab, estiloDe, primera, dibujo) {
    const porFila = {}, celdasCon = new Set();
    Object.keys(t).forEach((k) => {
      const i2 = k.indexOf(":");
      if (i2 < 1) return;
      const p = k.slice(0, i2), ref = k.slice(i2 + 1);
      if (!["c", "n", "i", "u", "k", "f", "r", "al", "aj", "bd", "tl", "m"].includes(p) || !/^[A-Z]{1,3}\d+$/.test(ref)) return;
      if (t[k] === "" || t[k] == null || t[k] === false) return;
      celdasCon.add(ref);
    });
    celdasCon.forEach((ref) => { const r = F().parseRef(ref); (porFila[r.f] = porFila[r.f] || []).push({ c: r.c, ref }); });
    Object.keys(t).forEach((k) => { if (k.startsWith("ah:") && t[k]) { const f = +k.slice(3) - 1; porFila[f] = porFila[f] || []; } });
    const filas = Object.keys(porFila).map(Number).sort((a, b) => a - b).map((f) => {
      const celdas = porFila[f].sort((a, b) => a.c - b.c).map((c) => {
        const crudo = t["c:" + c.ref] == null ? "" : String(t["c:" + c.ref]);
        const esFecha = crudo.startsWith("=") ? ev.valor(c.c, f) instanceof F().FechaF : fab.esFechaLit(crudo);
        return fab.celda(t, ev, c.ref, c.c, f, estiloDe(c.ref, esFecha));
      }).join("");
      const h = +t["ah:" + (f + 1)] || 0;
      return `<row r="${f + 1}"${h ? ` ht="${Math.round(h * 0.75 * 100) / 100}" customHeight="1"` : ""}>${celdas}</row>`;
    }).join("");
    const ncols = Math.max(t.cols || 10, 1);
    // Solo las columnas con ancho propio (las demás usan el ancho por omisión): archivo más chico.
    let cols = "";
    for (let c = 0; c < ncols; c++) { const w = +t["aw:" + F().colLetra(c)] || 0; if (w) cols += `<col min="${c + 1}" max="${c + 1}" width="${px2ancho(w)}" customWidth="1"/>`; }
    const pane = fab.panel(t);
    const vista = pane ? `<sheetView workbookViewId="0"${primera ? ' tabSelected="1"' : ""}>${pane}</sheetView>` : `<sheetView workbookViewId="0"${primera ? ' tabSelected="1"' : ""}/>`;
    const combinadas = fab.combinadas(t);
    const reglas = Object.keys(t).filter((k) => k.startsWith("cf:")).map((k) => fab.regla(t[k])).join("");
    const validaciones = Object.keys(t).filter((k) => k.startsWith("dv:")).map((k) => fab.validacion(t[k])).filter(Boolean);
    return XML + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews>${vista}</sheetViews><sheetFormatPr defaultColWidth="16.43" defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${filas}</sheetData>${combinadas.length ? `<mergeCells count="${combinadas.length}">${combinadas.join("")}</mergeCells>` : ""}${reglas}${validaciones.length ? `<dataValidations count="${validaciones.length}">${validaciones.join("")}</dataValidations>` : ""}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${dibujo || ""}</worksheet>`;
  }
  const CT_HOJA = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
  const CT_DIBUJO = "application/vnd.openxmlformats-officedocument.drawing+xml", CT_GRAFICA = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
  const T_DIBUJO = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing", T_GRAFICA = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
  const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  /** .xlsx a partir del archivo del que vino el documento: se cambia solo lo editado. */
  function xlsxConOrigen(doc, og) {
    const O = NOM.origen, pq = paqueteDe(og), hojasBase = {};
    // Lo que se importó de cada hoja se vuelve a sacar del original: la diferencia es lo que editó la persona.
    modeloXlsx(og.zip).hojas.forEach((h) => { hojasBase[h.campos.ox] = h.campos; });
    const tablas = F().hojasDe(doc);
    if (!tablas.length) throw new Error("Este documento no tiene ninguna tabla");
    const LIBRO = "xl/workbook.xml";
    const relsL = pq.rels(LIBRO), relEst = relsL.find((r) => /\/styles$/.test(r.tipo || ""));
    const estRuta = relEst ? pq.resolver(LIBRO, relEst.destino) : "xl/styles.xml";
    const estTxt = pq.texto(estRuta), libroTxt = pq.texto(LIBRO);
    if (!estTxt || !libroTxt) throw new Error("al archivo original le faltan partes");
    const EO = estilosOrigen(estTxt), fab = fabricaXlsx(doc, { origen: EO });
    fab.xfOrigen = (s) => EO.xfs[s] || null;
    const usados = new Set(), nombres = [];
    let cambio = false, nNueva = 0, nGraf = 0, nDib = 0;
    const tiene = (v) => v != null && v !== "" && v !== false;
    const planes = tablas.map((t, i) => {
      let n = F().nombreDeHoja(doc, t).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Hoja${i + 1}`;
      while (nombres.includes(n)) n = n.slice(0, 28) + " " + (i + 1);
      nombres.push(n);
      const ox = t.ox && hojasBase[t.ox] && pq.tiene(t.ox) && !usados.has(t.ox) ? t.ox : null;
      if (ox) usados.add(ox);
      return { t, ox, nombre: n, ruta: ox };
    });
    planes.forEach((p, i) => {
      const t = p.t, ev = F().evaluadorDeTabla(doc, t);
      if (p.ox) {
        const r = parcharHoja(pq.texto(p.ox), hojasBase[p.ox], t, fab, ev);
        if (r != null) { pq.pon(p.ox, r); cambio = true; }
      } else {
        // hoja creada en NOM-COLAB dentro de un libro importado
        p.ruta = `xl/worksheets/nomhoja${++nNueva}.xml`;
        const estiloDe = (ref, esFecha) => { const camb = new Set(CELDA_FMT.filter((k) => tiene(t[k + ":" + ref]))); const fecha = esFecha && !tiene(t["f:" + ref]) ? "dd/mm/yyyy" : null; return camb.size || fecha ? fab.estiloDesde(t, ref, 0, camb, fecha) : 0; };
        pq.pon(p.ruta, hojaDesdeCero(t, ev, fab, estiloDe, i === 0, ""));
        cambio = true;
      }
      // gráficas hechas en NOM-COLAB: se agregan al dibujo de la hoja (o se le crea uno)
      const gs = doc.vivos().filter((g) => g.tipo === "grafica" && g.hoja === t.id);
      if (!gs.length) return;
      const anclas = [], relsG = [];
      let fila0 = 1;
      const colIni = Math.min(Math.max(t.cols || 10, 1) + 1, 20);
      gs.forEach((g) => {
        const xmlG = graficaXlsx(g, p.nombre, t, ev);
        if (!xmlG) return;
        const ng = ++nGraf, ruta = `xl/charts/nomgrafica${ng}.xml`, rid = "rIdNomG" + ng;
        pq.pon(ruta, xmlG); pq.tipo(ruta, CT_GRAFICA);
        relsG.push([rid, ruta]);
        anclas.push(fab.anclaGrafica(rid, ng, colIni, fila0));
        fila0 += 18;
      });
      if (!anclas.length) return;
      cambio = true;
      let hx = pq.texto(p.ruta), dRuta = null;
      const dEl = /<(?:\w+:)?drawing\b[^>]*?\b(?:\w+:)?id\s*=\s*"([^"]+)"/.exec(hx);
      if (dEl) { const rel = pq.rels(p.ruta).find((r) => r.id === dEl[1]); if (rel) dRuta = pq.resolver(p.ruta, rel.destino); }
      if (dRuta && pq.tiene(dRuta)) {
        const d = pq.texto(dRuta), k = d.lastIndexOf("</");
        if (k > 0) pq.pon(dRuta, d.slice(0, k) + anclas.join("") + d.slice(k));
        else dRuta = null;
      } else dRuta = null;
      if (!dRuta) {
        dRuta = `xl/drawings/nomdibujo${++nDib}.xml`;
        pq.pon(dRuta, XML + `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${NS_R}">${anclas.join("")}</xdr:wsDr>`);
        pq.tipo(dRuta, CT_DIBUJO);
        pq.agregaRel(p.ruta, "rIdNomD", T_DIBUJO, "/" + dRuta);
        const S = seccionesHoja(hx);
        S.pon("drawing", `<${S.pref}drawing xmlns:r="${NS_R}" r:id="rIdNomD"/>`);
        pq.pon(p.ruta, S.aplicar());
      }
      relsG.forEach(([rid, ruta]) => pq.agregaRel(dRuta, rid, T_GRAFICA, "/" + ruta));
    });

    // ---- el libro: nombres, hojas nuevas o borradas y su orden
    const raizL = O.hijosXml(libroTxt).find((h) => O.local(h.n) === "workbook");
    const hsL = O.hijosXml(libroTxt, raizL.ci, raizL.cf), prefL = raizL.n.includes(":") ? raizL.n.split(":")[0] + ":" : "";
    const secHojas = hsL.find((h) => O.local(h.n) === "sheets"), piezasL = [];
    const info = O.hijosXml(libroTxt, secHojas.ci, secHojas.cf).map((h) => {
      const txt = libroTxt.slice(h.i, h.f), rid = (/\s(?:\w+:)id\s*=\s*"([^"]*)"/.exec(txt) || [])[1], rel = relsL.find((r) => r.id === rid);
      return { txt, rid, ruta: rel ? pq.resolver(LIBRO, rel.destino) : null, nombre: O.attr(libroTxt, h, "name"), id: +O.attr(libroTxt, h, "sheetId") || 0 };
    });
    const renombra = (s, n) => (n === s.nombre ? s.txt : s.txt.replace(/\sname\s*=\s*("[^"]*"|'[^']*')/, ` name="${x(n)}"`));
    const importadas = info.filter((s) => s.ruta && hojasBase[s.ruta]);
    const ahora = planes.filter((p) => p.ox).map((p) => p.ox);
    const mismaLista = importadas.length === ahora.length && importadas.every((s, i) => s.ruta === ahora[i]) && !planes.some((p) => !p.ox);
    let lista;
    if (mismaLista) {
      lista = info.map((s) => { const p = planes.find((q) => q.ox === s.ruta); if (p && p.nombre !== s.nombre) cambio = true; return p ? renombra(s, p.nombre) : s.txt; });
    } else {
      cambio = true;
      let maxId = info.reduce((m, s) => Math.max(m, s.id), 0), k = 0;
      const prefR = (/\s(\w+):id\s*=/.exec(info[0] ? info[0].txt : "") || [0, "r"])[1];
      lista = planes.map((p) => {
        if (p.ox) return renombra(info.find((s) => s.ruta === p.ox), p.nombre);
        const rid = "rIdNomH" + ++k;
        pq.agregaRel(LIBRO, rid, T.hoja, "/" + p.ruta); pq.tipo(p.ruta, CT_HOJA);
        return `<${prefL}sheet name="${x(p.nombre)}" sheetId="${++maxId}" ${prefR}:id="${rid}"/>`;
      });
      info.filter((s) => !(s.ruta && hojasBase[s.ruta])).forEach((s) => lista.push(s.txt));   // hojas de gráfico y otras que no se importan
      importadas.filter((s) => !usados.has(s.ruta)).forEach((s) => { pq.quita(s.ruta); pq.quita(pq.relsDe(s.ruta)); pq.quitaTipo(s.ruta); pq.quitaRel(LIBRO, s.rid); });
      // Los nombres definidos "de una hoja" y la pestaña activa van por posición: ya no corresponden.
      const dn = hsL.find((h) => O.local(h.n) === "definedNames");
      if (dn) {
        const quedan = O.hijosXml(libroTxt, dn.ci, dn.cf).filter((h) => O.attr(libroTxt, h, "localSheetId") == null).map((h) => libroTxt.slice(h.i, h.f)).join("");
        piezasL.push([dn.i, dn.f, quedan ? `<${dn.n}>${quedan}</${dn.n}>` : ""]);
      }
      const bv = hsL.find((h) => O.local(h.n) === "bookViews");
      if (bv) piezasL.push([bv.i, bv.f, libroTxt.slice(bv.i, bv.f).replace(/\s(activeTab|firstSheet)\s*=\s*"[^"]*"/g, "")]);
    }
    piezasL.push([secHojas.ci, secHojas.cf, lista.join("")]);
    if (cambio) {
      // Los valores guardados de las fórmulas pueden ya no servir: Excel recalcula al abrir.
      const cc = relsL.find((r) => /\/calcChain$/.test(r.tipo || ""));
      if (cc) { const ruta = pq.resolver(LIBRO, cc.destino); pq.quita(ruta); pq.quitaTipo(ruta); pq.quitaRel(LIBRO, cc.id); }
      const cp = hsL.find((h) => O.local(h.n) === "calcPr");
      if (cp) piezasL.push([cp.i, cp.f, `<${cp.n}${quitaAttr(libroTxt.slice(cp.a, cp.af), "fullCalcOnLoad")} fullCalcOnLoad="1"/>`]);
      else {
        const ORD = ["fileVersion", "fileSharing", "workbookPr", "workbookProtection", "bookViews", "sheets", "functionGroups", "externalReferences", "definedNames", "calcPr"];
        const sig = hsL.find((h) => ORD.indexOf(O.local(h.n)) < 0 || ORD.indexOf(O.local(h.n)) > 9), pos = sig ? sig.i : raizL.cf;
        piezasL.push([pos, pos, `<${prefL}calcPr fullCalcOnLoad="1"/>`]);
      }
    }
    pq.pon(LIBRO, aplicarPiezas(libroTxt, piezasL));
    if (fab.fuentes.length || fab.rellenos.length || fab.bordes.length || fab.xfs.length || fab.numFmts.length || fab.dxfs.length) pq.pon(estRuta, estilosConNuevos(estTxt, EO, fab));
    return pq.zip();
  }

  // ------------------------------------------------------------ importar Excel (.xlsx)
  const FMT_EXCEL = { 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 5: "$#,##0", 6: "$#,##0", 7: "$#,##0.00", 8: "$#,##0.00", 9: "0%", 10: "0.00%",
    14: "dd/mm/yyyy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "hh:mm", 21: "hh:mm:ss", 22: "dd/mm/yyyy hh:mm", 37: "#,##0", 38: "#,##0", 39: "#,##0.00", 40: "#,##0.00", 49: "@" };
  /** .xlsx → { hojas: [{ nombre, campos }], aviso }: cada hoja con sus celdas, formato, combinadas, anchos y filas fijas. */
  async function leerXlsx(archivo) {
    if (archivo.size > 30 * 1024 * 1024) throw new Error("El archivo pesa más de 30 MB");
    const u8 = new Uint8Array(await archivo.arrayBuffer());
    return Object.assign(modeloXlsx(NOM.origen.abrirZip(u8)), { archivo: u8 });
  }
  /**
   * Lo que NOM-COLAB entiende de un libro de Excel ya abierto (z = el .zip). Síncrono: también lo usa
   * el exportador para saber qué cambió.
   * OJO: el exportador compara el documento contra lo que ESTA función lee hoy del archivo original.
   * Si aquí se empieza a leer algo nuevo de las celdas (otro color, otra propiedad), en un documento
   * importado con la versión anterior eso se verá como "la persona lo quitó". Al cambiar lo que se
   * lee hay que cuidar esos documentos (Word y PowerPoint no tienen el problema: guardan huellas).
   */
  function modeloXlsx(z) {
    const P = (t) => new DOMParser().parseFromString(t, "application/xml");
    const libro = z.texto("xl/workbook.xml");
    if (!libro) throw new Error("El archivo no parece un libro de Excel (.xlsx)");
    const hijos = (n, nombre) => [...(n ? n.childNodes : [])].filter((c) => c.nodeType === 1 && (!nombre || c.localName === nombre));
    const hijo = (n, nombre) => hijos(n, nombre)[0] || null;
    const todos = (n, nombre) => (n ? [...n.getElementsByTagNameNS("*", nombre)] : []);
    const at = (n, a) => (n ? n.getAttribute(a) : null);
    const rels = P(z.texto("xl/_rels/workbook.xml.rels") || "<Relationships/>");
    const destino = {};
    todos(rels, "Relationship").forEach((r) => (destino[at(r, "Id")] = at(r, "Target")));
    // Textos compartidos.
    const sst = z.texto("xl/sharedStrings.xml");
    const textos = sst ? todos(P(sst), "si").map((si) => todos(si, "t").map((t) => t.textContent).join("")) : [];
    // Estilos.
    const est = P(z.texto("xl/styles.xml") || "<styleSheet/>");
    const fmts = Object.assign({}, FMT_EXCEL);
    todos(est, "numFmt").forEach((n) => (fmts[+at(n, "numFmtId")] = at(n, "formatCode")));
    // Colores del tema (en Excel van por número: 0 fondo 1, 1 texto 1, 2 fondo 2, 3 texto 2, 4 a 9 los
    // acentos) con su "tinte": positivo aclara, negativo oscurece.
    const temaXl = [];
    {
      const tt = z.texto("xl/theme/theme1.xml"), cs = tt ? todos(P(tt), "clrScheme")[0] : null, porNombre = {};
      hijos(cs).forEach((c) => { const v = hijo(c, "srgbClr") ? at(hijo(c, "srgbClr"), "val") : hijo(c, "sysClr") ? at(hijo(c, "sysClr"), "lastClr") : null; if (v && /^[0-9a-f]{6}$/i.test(v)) porNombre[c.localName] = v.toUpperCase(); });
      ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"].forEach((k, i) => (temaXl[i] = porNombre[k] || null));
    }
    const conTinte = (hex, tinte) => {
      if (!tinte) return hex;
      return [0, 2, 4].map((i) => { const v = parseInt(hex.slice(i, i + 2), 16); return Math.max(0, Math.min(255, Math.round(tinte > 0 ? v + (255 - v) * tinte : v * (1 + tinte)))).toString(16).padStart(2, "0"); }).join("").toUpperCase();
    };
    const color = (n) => {
      const rgb = at(n, "rgb");
      if (rgb && /^[0-9A-F]{8}$/i.test(rgb)) return "#" + rgb.slice(2).toUpperCase();
      const th = at(n, "theme");
      return th != null && temaXl[+th] ? "#" + conTinte(temaXl[+th], +(at(n, "tint") || 0)) : null;
    };
    const fuentes = todos(hijo(est.documentElement, "fonts"), "font").map((f) => ({ nombre: at(hijo(f, "name"), "val") || null, b: !!hijo(f, "b") && at(hijo(f, "b"), "val") !== "0", i: !!hijo(f, "i") && at(hijo(f, "i"), "val") !== "0", u: !!hijo(f, "u") && at(hijo(f, "u"), "val") !== "none", k: hijo(f, "color") ? color(hijo(f, "color")) : null, sz: hijo(f, "sz") ? +at(hijo(f, "sz"), "val") : 11 }));
    const rellenos = todos(hijo(est.documentElement, "fills"), "fill").map((f) => { const p = hijo(f, "patternFill"); return p && at(p, "patternType") === "solid" && hijo(p, "fgColor") ? color(hijo(p, "fgColor")) : null; });
    const bordes = todos(hijo(est.documentElement, "borders"), "border").map((b) => ["top", "bottom", "left", "right"].map((l, k) => (hijo(b, l) && at(hijo(b, l), "style") ? "abid"[k] : "")).join(""));
    const xfs = todos(hijo(est.documentElement, "cellXfs"), "xf").map((xf) => {
      const al = hijo(xf, "alignment");
      return { num: +at(xf, "numFmtId") || 0, fuente: fuentes[+at(xf, "fontId") || 0] || {}, relleno: rellenos[+at(xf, "fillId") || 0] || null, borde: bordes[+at(xf, "borderId") || 0] || "", al: al ? { left: "izq", center: "centro", centerContinuous: "centro", right: "der" }[at(al, "horizontal")] || null : null, aj: al ? at(al, "wrapText") === "1" : false };
    });
    const hojasXml = todos(P(libro), "sheet");
    let aviso = null;
    const MAX_F = LIM_F, MAX_C = LIM_C;
    const res = [];
    for (const h of hojasXml.slice(0, 30)) {
      const nombre = at(h, "name") || "Hoja" + (res.length + 1);
      let ruta = destino[h.getAttribute("r:id") || h.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")] || "";
      ruta = ruta.startsWith("/") ? ruta.slice(1) : "xl/" + ruta.replace(/^\.\//, "");
      const xmlH = z.texto(ruta);
      if (!xmlH) continue;
      const doc = P(xmlH);
      const campos = { nombre: nombre.slice(0, 31), ox: ruta };
      let maxF = 0, maxC = 0;
      const compartidas = {};
      todos(doc, "row").forEach((row) => {
        const ht = +at(row, "ht");
        const rnum = +at(row, "r");
        if (at(row, "customHeight") === "1" && ht && rnum && rnum <= MAX_F) campos["ah:" + rnum] = Math.round(ht / 0.75);
        hijos(row, "c").forEach((c) => {
          const ref = at(c, "r"), p = F().parseRef(ref || "");
          if (!p) return;
          if (p.f >= MAX_F || p.c >= MAX_C) { aviso = `Solo se importaron las primeras ${MAX_F} filas y ${MAX_C} columnas`; return; }
          const tipo = at(c, "t"), v = hijo(c, "v"), f = hijo(c, "f"), s = xfs[+at(c, "s") || 0];
          let crudo = "";
          if (f && (f.textContent || at(f, "t") === "shared")) {
            let fx = f.textContent;
            if (at(f, "t") === "shared") {
              const si = at(f, "si");
              if (fx) compartidas[si] = { f: "=" + fx, c: p.c, r: p.f };
              else if (compartidas[si]) fx = F().desplazar(compartidas[si].f, p.c - compartidas[si].c, p.f - compartidas[si].r).slice(1);
            }
            crudo = fx ? F().aEspanol("=" + fx.replace(/_xlfn\.|_xlws\./g, "")) : "";
          } else if (tipo === "s") crudo = textos[+(v ? v.textContent : 0)] || "";
          else if (tipo === "inlineStr") crudo = todos(c, "t").map((t) => t.textContent).join("");
          else if (tipo === "b") crudo = v && v.textContent === "1" ? "VERDADERO" : "FALSO";
          else if (tipo === "str" || tipo === "e") crudo = v ? v.textContent : "";
          else if (v) crudo = v.textContent;
          const R = F().ref(p.c, p.f);
          // Un texto que parece número o fecha se queda como texto (formato @).
          const esTexto = (tipo === "s" || tipo === "inlineStr") && crudo !== "" && F().esNum(F().calcularLiteral(crudo.trim()));
          if (crudo !== "") campos["c:" + R] = crudo;
          if (s) {
            const cod = esTexto ? "@" : fmts[s.num];
            if (cod && cod !== "General") campos["f:" + R] = cod.replace(/\[\$-[^\]]*\]/g, "").replace(/;@$/, "");
            if (s.fuente.b) campos["n:" + R] = true;
            if (s.fuente.i) campos["i:" + R] = true;
            if (s.fuente.u) campos["u:" + R] = true;
            if (s.fuente.k && s.fuente.k !== "#000000") campos["k:" + R] = s.fuente.k;
            if (s.fuente.sz && Math.abs(s.fuente.sz - 11) > 0.1) campos["tl:" + R] = Math.round((s.fuente.sz / 1.0476) * 2) / 2;
            // tipo de letra de la celda, si no es el del libro (el de su primera fuente)
            if (s.fuente.nombre && s.fuente.nombre !== ((fuentes[0] || {}).nombre || "Calibri")) campos["tf:" + R] = s.fuente.nombre;
            if (s.relleno) campos["r:" + R] = s.relleno;
            if (s.borde) campos["bd:" + R] = s.borde.split("").sort().join("");
            if (s.al) campos["al:" + R] = s.al;
            if (s.aj) campos["aj:" + R] = true;
          }
          if (crudo !== "" || s) { maxF = Math.max(maxF, p.f + 1); maxC = Math.max(maxC, p.c + 1); }
        });
      });
      todos(doc, "mergeCell").forEach((m) => {
        const [a, b] = String(at(m, "ref") || "").split(":").map((r) => F().parseRef(r));
        if (a && b && a.f < MAX_F && a.c < MAX_C) campos["m:" + F().ref(a.c, a.f)] = `${b.c - a.c + 1}x${b.f - a.f + 1}`;
      });
      todos(doc, "col").forEach((c) => {
        const w = +at(c, "width"), min = +at(c, "min"), max = Math.min(+at(c, "max"), MAX_C);
        if (!w || at(c, "customWidth") !== "1") return;
        for (let k = min; k <= max && k - min < MAX_C; k++) campos["aw:" + F().colLetra(k - 1)] = Math.round(w * 7 + 5);
      });
      const pane = todos(doc, "pane")[0];
      if (pane && at(pane, "state") === "frozen") { if (+at(pane, "ySplit")) campos.fijasF = +at(pane, "ySplit"); if (+at(pane, "xSplit")) campos.fijasC = +at(pane, "xSplit"); }
      todos(doc, "dataValidation").forEach((dv, k) => {
        const sq = String(at(dv, "sqref") || "").split(" ")[0], f1 = hijo(dv, "formula1");
        if (!sq) return;
        const rango = sq.includes(":") ? sq : sq + ":" + sq;
        if (at(dv, "type") === "list" && f1 && /^".*"$/.test(f1.textContent)) campos["dv:x" + k] = { rango, tipo: "lista", valores: f1.textContent.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean) };
        else if (["decimal", "whole"].includes(at(dv, "type")) && f1) {
          const f2 = hijo(dv, "formula2"), op = at(dv, "operator") || "between";
          campos["dv:x" + k] = { rango, tipo: "numero", min: op === "lessThanOrEqual" ? "" : f1.textContent, max: op === "between" && f2 ? f2.textContent : op === "lessThanOrEqual" ? f1.textContent : "" };
        }
      });
      if (todos(doc, "drawing").length) aviso = aviso || "Las gráficas e imágenes del archivo no se ven aquí, pero se conservan: al descargarlo en Excel salen igual";
      campos.filas = Math.max(30, maxF + 5);
      campos.cols = Math.max(10, Math.min(MAX_C, maxC + 2));
      res.push({ nombre, campos });
    }
    if (!res.length) throw new Error("El libro no tiene hojas que se puedan leer");
    return { hojas: res, aviso };
  }

  // ------------------------------------------------------------ PowerPoint (.pptx)
  const ANCHO = 960, ALTO = 540;
  const color = (c, def) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c.slice(1).toUpperCase() : def);
  const luzHex = (c) => { const n = parseInt(String(c).replace("#", ""), 16) || 0; return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

  // ------------------------------------------------------------ 8.4 trazos SVG como formas libres de PowerPoint
  /** Arco SVG (de x1,y1 a x2,y2) → curvas de Bézier cúbicas (cada una de 90° como máximo). */
  function arcoABezier(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
    if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
    rx = Math.abs(rx); ry = Math.abs(ry);
    const f = (phi * Math.PI) / 180, cf = Math.cos(f), sf = Math.sin(f);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cf * dx + sf * dy, y1p = -sf * dx + cf * dy;
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { const m = Math.sqrt(lam); rx *= m; ry *= m; }
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = Math.sqrt(Math.max(0, num / (den || 1)));
    if (+fa === +fs) co = -co;
    const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
    const cx = cf * cxp - sf * cyp + (x1 + x2) / 2, cy = sf * cxp + cf * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!+fs && dt > 0) dt -= 2 * Math.PI; else if (+fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)), paso = dt / n, kk = (4 / 3) * Math.tan(paso / 4), out = [];
    const pt = (ux, uy) => [cx + rx * ux * cf - ry * uy * sf, cy + rx * ux * sf + ry * uy * cf];
    for (let j = 0; j < n; j++) {
      const a1 = t1 + j * paso, a2 = a1 + paso, c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
      const q1 = pt(c1 - kk * s1, s1 + kk * c1), q2 = pt(c2 + kk * s2, s2 - kk * c2), e = pt(c2, s2);
      out.push([q1[0], q1[1], q2[0], q2[1], e[0], e[1]]);
    }
    return out;
  }
  /** Trazo SVG (M, L, H, V, C, Q, A, Z absolutos, como los que hace el lienzo) → camino de DrawingML. */
  function caminoDrawingML(d, k) {
    const toks = String(d).match(/[MLHVCQAZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
    let i = 0, cmd = null, x0 = 0, y0 = 0, px = 0, py = 0, r = "";
    const num = () => +toks[i++];
    const P = (a, b) => `<a:pt x="${Math.round(a * k)}" y="${Math.round(b * k)}"/>`;
    while (i < toks.length) {
      if (/^[MLHVCQAZ]$/i.test(toks[i])) cmd = toks[i++].toUpperCase();
      if (cmd === "M") { px = num(); py = num(); x0 = px; y0 = py; r += `<a:moveTo>${P(px, py)}</a:moveTo>`; cmd = "L"; }
      else if (cmd === "L") { px = num(); py = num(); r += `<a:lnTo>${P(px, py)}</a:lnTo>`; }
      else if (cmd === "H") { px = num(); r += `<a:lnTo>${P(px, py)}</a:lnTo>`; }
      else if (cmd === "V") { py = num(); r += `<a:lnTo>${P(px, py)}</a:lnTo>`; }
      else if (cmd === "C") { const a = [num(), num(), num(), num(), num(), num()]; r += `<a:cubicBezTo>${P(a[0], a[1])}${P(a[2], a[3])}${P(a[4], a[5])}</a:cubicBezTo>`; px = a[4]; py = a[5]; }
      else if (cmd === "Q") { const a = [num(), num(), num(), num()]; r += `<a:quadBezTo>${P(a[0], a[1])}${P(a[2], a[3])}</a:quadBezTo>`; px = a[2]; py = a[3]; }
      else if (cmd === "A") { const a = [num(), num(), num(), num(), num(), num(), num()]; arcoABezier(px, py, a[0], a[1], a[2], a[3], a[4], a[5], a[6]).forEach((c) => (r += `<a:cubicBezTo>${P(c[0], c[1])}${P(c[2], c[3])}${P(c[4], c[5])}</a:cubicBezTo>`)); px = a[5]; py = a[6]; }
      else if (cmd === "Z") { r += "<a:close/>"; px = x0; py = y0; cmd = null; }
      else i++;
    }
    return r;
  }
  /** Forma libre de PowerPoint con las piezas de una figura (relleno y contorno por pieza). */
  function custGeom(partes, w, h) {
    const W = Math.max(1, Math.round(w * EMU)), H = Math.max(1, Math.round(h * EMU));
    return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>${partes.map((pz) => `<a:path w="${W}" h="${H}"${pz.relleno ? "" : ' fill="none"'}${pz.trazo ? "" : ' stroke="0"'}>${caminoDrawingML(pz.d, EMU)}</a:path>`).join("")}</a:pathLst></a:custGeom>`;
  }
  const LIBRES = new Set(["clase", "entidad", "entidad-debil", "relacion-debil", "atributo-multi", "actor", "paquete", "componente", "nodo", "final"]);

  function pptx(doc, esDiagrama) {
    const og = !esDiagrama && NOM.ooxml.usarOrigen !== false && NOM.origen ? NOM.origen.leer(doc) : null;
    if (og && og.fmt === "pptx" && og.h && og.h.pp) {
      try { return pptxArmar(doc, false, og); }
      catch (e) { if (typeof console !== "undefined") console.warn("PowerPoint: no se pudo partir del archivo original; se arma desde cero.", e); }
    }
    return pptxArmar(doc, esDiagrama, null);
  }
  /** De cada diapositiva importada: sus bloques en orden y de qué elemento del original salió cada uno. */
  function huellasPptx(doc) {
    const pp = {};
    doc.paginas().forEach((pg) => {
      const orden = doc.deLaPagina(pg).slice().sort((a, b) => (a.z || 0) - (b.z || 0)), e = {};
      orden.forEach((b) => { if (b.ox != null) (e[b.ox] = e[b.ox] || []).push(b.id); });
      pp[pg] = { ids: orden.map((b) => b.id), e };
    });
    return pp;
  }
  const P_GEO = ["x", "y", "w", "h", "rot", "volteoH", "volteoV", "z", "orden"], P_TXT = ["html", "texto"];
  /** Tres huellas de un bloque de diapositiva: sin su posición, sin posición ni texto, y solo la posición. */
  function parcialesPptx(b) {
    const a = {}, c = {}, g = {};
    for (const k in b) {
      if (k === "id" || b[k] == null) continue;
      if (P_GEO.includes(k)) { if (k !== "z" && k !== "orden") g[k] = b[k]; continue; }
      a[k] = b[k];
      if (!P_TXT.includes(k)) c[k] = b[k];
    }
    return [NOM.origen.huella(a), NOM.origen.huella(c), NOM.origen.huella(g)];
  }
  function pptxArmar(doc, esDiagrama, og) {
    let PRE = "", heredar = false;
    const medios = [], graficas = [], notas = [];
    const TD = esDiagrama || !NOM.diapo ? { w: ANCHO, h: ALTO } : NOM.diapo.tam(doc);
    const te = !esDiagrama && NOM.diapo ? NOM.diapo.tema(doc) : null;
    const paginas = doc.paginas().filter((p) => doc.deLaPagina(p).length || !esDiagrama);
    /** Un color CSS (#hex o rgb()) en hex para Office. */
    const hexCss = (c, def) => {
      if (!c) return def;
      const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
      if (m) return m[1].toUpperCase();
      const r = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(c.trim());
      return r ? [r[1], r[2], r[3]].map((v) => (+v).toString(16).padStart(2, "0")).join("").toUpperCase() : def;
    };
    const armar = (p, n, O) => {
      // Lo oculto (capas) no se exporta, ni lo que quedó fuera de la diapositiva, en la mesa de trabajo.
      let bs = doc.deLaPagina(p).filter((b) => (b.x != null || b.tipo === "conector") && !b.oculto
        && (esDiagrama || b.tipo === "conector" || !(b.x + b.w <= 0 || b.y + b.h <= 0 || b.x >= TD.w || b.y >= TD.h)));
      let k = O ? O.k : 1, dx = 0, dy = 0;
      const FX = O ? O.fx : 1, FY = O ? O.fy : 1;
      const conPos = bs.filter((b) => b.x != null);
      if (esDiagrama && conPos.length) {
        // El pizarrón no tiene bordes: se encuadra todo dentro de la diapositiva con 30 px de margen.
        const minX = Math.min(...conPos.map((b) => b.x)), minY = Math.min(...conPos.map((b) => b.y));
        const maxX = Math.max(...conPos.map((b) => b.x + b.w)), maxY = Math.max(...conPos.map((b) => b.y + b.h));
        k = Math.min(1, (TD.w - 60) / (maxX - minX || 1), (TD.h - 60) / (maxY - minY || 1));
        dx = (TD.w - (maxX - minX) * k) / 2 - minX * k; dy = (TD.h - (maxY - minY) * k) / 2 - minY * k;
      }
      bs = bs.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
      const E = (v) => Math.round(v * EMU);
      const pos = (b) => `<a:xfrm${b.rot ? ` rot="${Math.round(b.rot * 60000)}"` : ""}${b.volteoH ? ' flipH="1"' : ""}${b.volteoV ? ' flipV="1"' : ""}><a:off x="${E((b.x * k + dx) * FX)}" y="${E((b.y * k + dy) * FY)}"/><a:ext cx="${E(Math.max(1, b.w) * k * FX)}" cy="${E(Math.max(1, b.h) * k * FY)}"/></a:xfrm>`;
      const alfa = (b) => (b.opacidad != null && b.opacidad < 1 ? `<a:alpha val="${Math.round(b.opacidad * 100000)}"/>` : "");
      const linea = (b, e) => !e.trazo ? "<a:ln><a:noFill/></a:ln>"
        : `<a:ln w="${Math.round(e.ancho * EMU * k)}"><a:solidFill><a:srgbClr val="${color(e.trazo, "2B2A33")}">${alfa(b)}</a:srgbClr></a:solidFill>${e.estilo === "guiones" ? '<a:prstDash val="dash"/>' : e.estilo === "puntos" ? '<a:prstDash val="sysDot"/>' : ""}${b.figura === "linea-flecha" ? '<a:tailEnd type="triangle"/>' : ""}</a:ln>`;
      const sombra = (b) => (b.sombra === true || (b.sombra == null && b.tipo === "forma" && !NOM.figuras.esLinea(b.figura))
        ? '<a:effectLst><a:outerShdw blurRad="63500" dist="38100" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="22000"/></a:srgbClr></a:outerShdw></a:effectLst>' : "");
      const GEO = { rect: "roundRect", elipse: "ellipse", rombo: "diamond", triangulo: "triangle", "triangulo-r": "rtTriangle", pentagono: "pentagon", hexagono: "hexagon", octagono: "octagon",
        estrella: "star5", corazon: "heart", nube: "cloud", burbuja: "wedgeRoundRectCallout", flecha: "rightArrow", "flecha-doble": "leftRightArrow", chevron: "chevron", cruz: "plus",
        paralelogramo: "flowChartInputOutput", trapecio: "trapezoid", cilindro: "can", documento: "flowChartDocument", nota: "foldedCorner", linea: "line", "linea-flecha": "line" };
      const rels = [{ id: "rId1", tipo: T.diseno, destino: "../slideLayouts/slideLayout1.xml" }];
      let id = O ? O.idBase : 2;
      const pre = PRE ? PRE.toLowerCase() + "-" : "";
      const imagenRel = (src) => {
        const im = imagen(src);
        if (!im) return null;
        const m = medios.length + 1, rid = "rId" + PRE + "Img" + m;
        medios.push({ nombre: `ppt/media/${pre}imagen${m}.${im.ext}`, datos: im.bytes });
        rels.push({ id: rid, tipo: T.img, destino: `../media/${pre}imagen${m}.${im.ext}` });
        return rid;
      };
      /** Texto simple (un solo formato para todo el cuadro). */
      const parrafos = (html, tam, negrita, centro, opcT) => {
        opcT = opcT || {};
        const ps = String(html || "").split(/<br\s*\/?>|<\/p>|<\/div>/i);
        const algn = opcT.alin ? { izq: "l", centro: "ctr", der: "r" }[opcT.alin] : centro ? "ctr" : null;
        return ps.map((h) => `<a:p>${algn ? `<a:pPr algn="${algn}"/>` : ""}${tramos(h).filter((t) => !t.br).map((t) =>
          `<a:r><a:rPr lang="es-MX" sz="${Math.round(tam * k * 75)}" b="${t.b || negrita ? 1 : 0}" i="${t.i || opcT.i ? 1 : 0}"${t.u || opcT.u ? ' u="sng"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${opcT.color || "1F1E26"}"/></a:solidFill><a:latin typeface="${x(opcT.fuente || "Calibri")}"/></a:rPr><a:t>${x(t.t)}</a:t></a:r>`).join("")}</a:p>`).join("");
      };
      /** 8.3 Texto con formato por partes, viñetas y numeración. */
      const parrafosRicos = (html, tam, negrita, opcT) => {
        if (!NOM.diapo) return parrafos(html, tam, negrita, false, opcT);
        const ps = NOM.diapo.parrafos(html);
        if (!ps.length) return "<a:p/>";
        const algnBase = opcT.alin ? { izq: "l", centro: "ctr", der: "r" }[opcT.alin] : null;
        return ps.map((pp) => {
          const algn = pp.al ? { izq: "l", centro: "ctr", der: "r", just: "just" }[pp.al] : algnBase;
          const sangria = pp.lista ? ` marL="${342900 + pp.nivel * 342900}" indent="-342900"` : "";
          const vineta = pp.lista === "v" ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : pp.lista === "n" ? '<a:buAutoNum type="arabicPeriod"/>' : "<a:buNone/>";
          // "heredar": el texto va dentro de una figura del archivo original; solo se escribe el formato
          // que la persona puso a mano y lo demás (tamaño, color, fuente, viñeta) lo sigue dando el diseño.
          const ppr = heredar && pp.lista === "v" ? `<a:pPr${pp.nivel ? ` lvl="${Math.min(8, pp.nivel)}"` : ""}${algn ? ` algn="${algn}"` : ""}/>` : `<a:pPr${algn ? ` algn="${algn}"` : ""}${sangria}>${vineta}</a:pPr>`;
          const runs = pp.runs.filter((r) => r.t).map((r) => {
            const t2 = r.tam ? (/px$/.test(r.tam) ? parseFloat(r.tam) / 1.333 : /pt$/.test(r.tam) ? parseFloat(r.tam) : tam) : tam;
            if (heredar) return `<a:r><a:rPr lang="es-MX"${r.tam ? ` sz="${Math.round(t2 * k * 100)}"` : ""}${r.b ? ' b="1"' : ""}${r.i ? ' i="1"' : ""}${r.u ? ' u="sng"' : ""}${r.s ? ' strike="sngStrike"' : ""} dirty="0">${r.color ? `<a:solidFill><a:srgbClr val="${hexCss(r.color, "000000")}"/></a:solidFill>` : ""}</a:rPr><a:t>${x(r.t)}</a:t></a:r>`;
            return `<a:r><a:rPr lang="es-MX" sz="${Math.round(t2 * k * 100)}" b="${r.b || negrita ? 1 : 0}" i="${r.i || opcT.i ? 1 : 0}"${r.u || opcT.u ? ' u="sng"' : ""}${r.s ? ' strike="sngStrike"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${hexCss(r.color, opcT.color || "1F1E26")}"/></a:solidFill><a:latin typeface="${x(opcT.fuente || "Calibri")}"/></a:rPr><a:t>${x(r.t)}</a:t></a:r>`;
          }).join("");
          return `<a:p>${ppr}${runs}</a:p>`;
        }).join("");
      };
      const colorTema = (b) => (te ? (b.estilo === "h1" || b.estilo === "h2" ? te.titulo : te.texto).slice(1) : null);
      const textoDe = (b, fondo) => ({ color: color(b.tColor, colorTema(b) || (fondo && luzHex(fondo) < 0.5 ? "FFFFFF" : "1F1E26")), fuente: b.tFuente || (te && (b.estilo === "h1" || b.estilo === "h2") ? te.fuenteT : te && te.fuente) || null, alin: b.tAlin, i: b.tCursiva, u: b.tSubrayado });
      const porId = Object.fromEntries(conPos.map((b) => [b.id, b]));
      const caja = (nid, nombre, b, cuerpo, descr) => `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="${nombre} ${nid}"${descr ? ` descr="${x(descr)}"` : ""}/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${pos(b)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${cuerpo}</p:txBody></p:sp>`;
      /** 8.4 Clase y entidad: nombre arriba y renglones fijos que caen entre las líneas divisorias. */
      const compartimentosPptx = (b, e, opcT) => {
        const ls = String(b.texto || "").split("\n").map((l) => l.replace(/\s+$/, ""));
        const nombre = ls.shift() || "", resto = ls.filter((l) => l.trim() && !/^-{2,}$/.test(l.trim()));
        const secs = e.f === "clase" ? [resto.filter((l) => !/\(.*\)/.test(l)), resto.filter((l) => /\(.*\)/.test(l))] : [resto];
        const fs = +b.tTam || 14, L = fs * 1.35, pts = (px) => Math.max(0, Math.round(px * 0.75 * k * 100));
        const run = (t, neg, sub) => `<a:r><a:rPr lang="es-MX" sz="${Math.round(fs * 0.75 * k * 100)}" b="${neg ? 1 : 0}"${sub ? ' u="sng"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${(opcT && opcT.color) || "1F1E26"}"/></a:solidFill><a:latin typeface="${x((opcT && opcT.fuente) || "Calibri")}"/></a:rPr><a:t>${x(t)}</a:t></a:r>`;
        const par = (contenido, antes, alin) => `<a:p><a:pPr algn="${alin}" marL="0" indent="0"><a:lnSpc><a:spcPts val="${pts(L)}"/></a:lnSpc><a:spcBef><a:spcPts val="${pts(antes)}"/></a:spcBef><a:buNone/></a:pPr>${contenido}</a:p>`;
        let ps = par(run(nombre, true), 0, "ctr"), cursor = 6 + L, y = 12 + L;
        const lineas = [];
        secs.forEach((sec) => {
          lineas.push(y);
          sec.forEach((l, i) => {
            const arriba = y + 5 + i * L, clave = e.f === "entidad" && /^(PK\b|#)/i.test(l.trim());
            if (arriba + L > b.h) return;
            ps += par(run(clave ? l.trim().replace(/^(PK\s*:?\s*|#\s*)/i, "") : l, false, clave), arriba - cursor, "l");
            cursor = arriba + L;
          });
          y += 5 + sec.length * L + (sec.length ? 5 : 14);
        });
        return { parrafos: ps, lineas: lineas.filter((v) => v < b.h - 2) };
      };
      const figurasL = bs.map((b) => {
        if (O && O.genera && !O.genera(b)) return "";
        heredar = !!(O && O.hereda && O.hereda(b));
        try { return figura1(b); } finally { heredar = false; }
      });
      function figura1(b) {
        const nid = id++;
        if (b.tipo === "texto") {
          const tam = b.tTam ? b.tTam / 1.333 : b.estilo === "h1" ? 40 : b.estilo === "h2" ? 28 : 20;
          const neg = b.tNegrita != null ? b.tNegrita : b.estilo === "h1" || b.estilo === "h2";
          // El nombre del cuadro guarda si era título (al volver a abrirlo en NOM-COLAB se recupera).
          return caja(nid, b.estilo === "h1" ? "Título" : b.estilo === "h2" ? "Encabezado" : "Texto", b, parrafosRicos(b.html, tam, neg, textoDe(b)));
        }
        if (b.tipo === "ecuacion") return caja(nid, "Ecuación", b, `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="es-MX" sz="${Math.round(((b.tTam || 32) / 1.333) * k * 100)}" dirty="0"/><a:t>${x(NOM.ecuaciones ? NOM.ecuaciones.texto(b.tex || "") : b.tex || "")}</a:t></a:r></a:p>`, "LaTeX: " + (b.tex || ""));
        if (b.tipo === "forma") {
          const e = NOM.figuras.estiloFigura(b);
          const geo = GEO[e.f] || "roundRect";
          const av = geo === "roundRect" ? `<a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (e.radio / Math.max(1, Math.min(b.w, b.h))) * 100000))}"/>` : "";
          if (geo === "line") {
            return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${nid}" name="Línea ${nid}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${pos(Object.assign({}, b, { y: b.y + b.h / 2, h: 0 }))}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${linea(b, e)}</p:spPr></p:cxnSp>`;
          }
          // 8.4 Figuras de UML y entidad-relación: forma libre con el mismo trazo que en el lienzo.
          const cm = NOM.figuras.COMPARTIMENTOS && NOM.figuras.COMPARTIMENTOS.has(e.f);
          let geometria = `<a:prstGeom prst="${geo}"><a:avLst>${av}</a:avLst></a:prstGeom>`, rellenoCol = e.relleno;
          const opcT = textoDe(b, e.relleno), tam = b.tTam ? b.tTam / 1.333 : 16;
          let cuerpo = b.html && NOM.diapo ? parrafosRicos(b.html, tam, b.tNegrita !== false, Object.assign({ alin: e.f === "nota" ? null : b.tAlin || "centro" }, opcT)) : parrafos(x(b.texto || ""), tam, b.tNegrita !== false, e.f !== "nota", opcT);
          let cuerpoPr = `<a:bodyPr anchor="${e.f === "nota" ? "t" : "ctr"}" wrap="square"><a:normAutofit/></a:bodyPr>`;
          if (LIBRES.has(e.f) && NOM.figuras.partesFigura) {
            let partes = NOM.figuras.partesFigura(e, b.w, b.h);
            if (e.f === "final") { rellenoCol = e.trazo || "#2B2A33"; partes = [Object.assign({}, partes[0], { relleno: null }), partes[1]]; }
            if (cm) {
              const cp = compartimentosPptx(b, e, opcT);
              partes = partes.concat(cp.lineas.map((y) => ({ d: `M0,${y} H${b.w}`, relleno: null, trazo: e.trazo })));
              cuerpo = cp.parrafos;
              cuerpoPr = `<a:bodyPr anchor="t" wrap="square" lIns="${E(10 * k)}" tIns="${E(6 * k)}" rIns="${E(10 * k)}" bIns="0"><a:noAutofit/></a:bodyPr>`;
            } else if (e.f === "actor") cuerpoPr = '<a:bodyPr anchor="b" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0"><a:noAutofit/></a:bodyPr>';
            else if (e.f === "paquete") cuerpoPr = `<a:bodyPr anchor="ctr" wrap="square" tIns="${E(Math.min(24, b.h * 0.22) * k)}"><a:normAutofit/></a:bodyPr>`;
            geometria = custGeom(partes, b.w, b.h);
          }
          const relleno = rellenoCol ? `<a:solidFill><a:srgbClr val="${color(rellenoCol, "CFE0FF")}">${alfa(b)}</a:srgbClr></a:solidFill>` : "<a:noFill/>";
          return `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="Figura ${nid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${pos(b)}${geometria}${relleno}${linea(b, e)}${sombra(b)}</p:spPr>
<p:txBody>${cuerpoPr}<a:lstStyle/>${cuerpo}</p:txBody></p:sp>`;
        }
        if (b.tipo === "imagen" || (b.tipo === "icono" && b.png)) {
          const rid = imagenRel(b.tipo === "icono" ? b.png : b.src);
          if (!rid) return "";
          const e = { trazo: b.bordeAncho ? b.borde || "#2B2A33" : null, ancho: +b.bordeAncho || 0, estilo: b.bordeEstilo };
          const r = b.recorte, f = b.filtros || {};
          const recorte = r ? `<a:srcRect l="${Math.round((+r.iz || 0) * 100000)}" t="${Math.round((+r.s || 0) * 100000)}" r="${Math.round((+r.d || 0) * 100000)}" b="${Math.round((+r.i || 0) * 100000)}"/>` : "";
          const efectos = (b.opacidad != null && b.opacidad < 1 ? `<a:alphaModFix amt="${Math.round(b.opacidad * 100000)}"/>` : "") + (+f.gris >= 50 ? "<a:grayscl/>" : "")
            + ((f.brillo != null && +f.brillo !== 100) || (f.contraste != null && +f.contraste !== 100) ? `<a:lum bright="${Math.round(((+f.brillo || 100) - 100) * 1000)}" contrast="${Math.round(((+f.contraste || 100) - 100) * 1000)}"/>` : "");
          const geo = b.mascara ? GEO[b.mascara] || "rect" : b.radio ? "roundRect" : "rect";
          return `<p:pic><p:nvPicPr><p:cNvPr id="${nid}" name="${b.tipo === "icono" ? "Ícono" : "Imagen"} ${nid}" descr="${x(b.alt || b.nombre || "")}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}">${efectos}</a:blip>${recorte}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${pos(b)}<a:prstGeom prst="${geo}"><a:avLst/></a:prstGeom>${linea(b, e)}</p:spPr></p:pic>`;
        }
        if (b.tipo === "grafica" && !b.hoja) {
          const xmlG = graficaPptx(b);
          if (!xmlG) return "";
          graficas.push(xmlG);
          const ng = graficas.length, rid = "rId" + PRE + "Graf" + ng;
          rels.push({ id: rid, tipo: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart", destino: `../charts/${pre}chart${ng}.xml` });
          return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${nid}" name="Gráfica ${nid}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${E(b.x * k + dx)}" y="${E(b.y * k + dy)}"/><a:ext cx="${E(b.w * k)}" cy="${E(b.h * k)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></p:graphicFrame>`;
        }
        if (b.tipo === "tabla") {
          const filas = tablaVisible(b);
          if (!filas.length) return "";
          const ancho = E(b.w * k), alto = E(Math.max(1, b.h) * k), cols = Math.max(...filas.map((f) => f.length));
          const cab = b.enDiapo && b.encabezado, cCab = color(b.colorCab, "3D72F2");
          const tam = b.tTam ? b.tTam / 1.333 : b.enDiapo ? 14 : 14;
          return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${nid}" name="Tabla ${nid}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>
<p:xfrm><a:off x="${E(b.x * k + dx)}" y="${E(b.y * k + dy)}"/><a:ext cx="${ancho}" cy="${alto}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="${cab ? 1 : 0}" bandRow="1"/>
<a:tblGrid>${`<a:gridCol w="${Math.floor(ancho / cols)}"/>`.repeat(cols)}</a:tblGrid>${filas.map((f, fi) => `<a:tr h="${Math.floor(alto / filas.length)}">${Array.from({ length: cols }, (_, ci) => f[ci] || "").map((v) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="es-MX" sz="${Math.round(tam * k * 100)}" b="${cab && fi === 0 ? 1 : 0}" dirty="0">${cab && fi === 0 ? '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>' : ""}</a:rPr><a:t>${x(v)}</a:t></a:r></a:p></a:txBody><a:tcPr>${["lnL", "lnR", "lnT", "lnB"].map((l) => `<a:${l} w="9525"><a:solidFill><a:srgbClr val="B7B4C2"/></a:solidFill></a:${l}>`).join("")}${cab && fi === 0 ? `<a:solidFill><a:srgbClr val="${cCab}"/></a:solidFill>` : fi % 2 ? '<a:solidFill><a:srgbClr val="F6F5FA"/></a:solidFill>' : '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>'}</a:tcPr></a:tc>`).join("")}</a:tr>`).join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
        }
        if (b.tipo === "conector" && porId[b.desde] && porId[b.hasta]) {
          // 8.4 La flecha con su recorrido (recta, codo o curva), sus puntas y sus textos.
          const r = NOM.geometria.rutaConector(porId[b.desde], porId[b.hasta], b);
          const T2 = (q) => ({ x: q.x * k + dx, y: q.y * k + dy }), pts = r.pts.map(T2);
          const col = color(b.color, "4A4854"), estilo = b.estilo === "guiones" ? '<a:prstDash val="dash"/>' : b.estilo === "puntos" ? '<a:prstDash val="sysDot"/>' : "";
          const tipo = { abierta: "arrow", hueco: "triangle", rombo: "diamond", "rombo-hueco": "diamond", circulo: "oval" }[b.tipoPunta] || "triangle";
          const pIni = b.puntas === "ambas" || b.puntas === "inicio", pFin = !b.puntas || b.puntas === "fin" || b.puntas === "ambas";
          const ln = `<a:ln w="${Math.round((+b.grosor || 2) * k * 9525)}"><a:solidFill><a:srgbClr val="${col}"/></a:solidFill>${estilo}${pIni ? `<a:headEnd type="${tipo}"/>` : ""}${pFin ? `<a:tailEnd type="${tipo}"/>` : ""}</a:ln>`;
          let s2;
          if ((b.ruta || "recta") === "recta") {
            const p1 = pts[0], p2 = pts[pts.length - 1];
            s2 = `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${nid}" name="Conector ${nid}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${p2.x < p1.x ? ' flipH="1"' : ""}${p2.y < p1.y ? ' flipV="1"' : ""}><a:off x="${E(Math.min(p1.x, p2.x))}" y="${E(Math.min(p1.y, p2.y))}"/><a:ext cx="${E(Math.abs(p2.x - p1.x))}" cy="${E(Math.abs(p2.y - p1.y))}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom>${ln}</p:spPr></p:cxnSp>`;
          } else {
            // En codo o curva: una forma libre abierta con el mismo recorrido que en el lienzo.
            const x0 = Math.min(...pts.map((q) => q.x)), y0 = Math.min(...pts.map((q) => q.y));
            const w = Math.max(1, Math.max(...pts.map((q) => q.x)) - x0), h = Math.max(1, Math.max(...pts.map((q) => q.y)) - y0);
            const L = (q) => `<a:pt x="${E(q.x - x0)}" y="${E(q.y - y0)}"/>`;
            const camino = b.ruta === "curva" ? `<a:moveTo>${L(pts[0])}</a:moveTo><a:cubicBezTo>${L(pts[1])}${L(pts[2])}${L(pts[3])}</a:cubicBezTo>` : `<a:moveTo>${L(pts[0])}</a:moveTo>${pts.slice(1).map((q) => `<a:lnTo>${L(q)}</a:lnTo>`).join("")}`;
            s2 = `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="Conector ${nid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${E(x0)}" y="${E(y0)}"/><a:ext cx="${E(w)}" cy="${E(h)}"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${E(w)}" h="${E(h)}" fill="none">${camino}</a:path></a:pathLst></a:custGeom><a:noFill/>${ln}</p:spPr></p:sp>`;
          }
          const etq = (t, q, ancho, tamL, neg) => caja(id++, "Etiqueta", { x: (q.x - dx) / k - ancho / 2, y: (q.y - dy) / k - 14, w: ancho, h: 28 }, `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="es-MX" sz="${Math.round(tamL * k * 100)}" b="${neg ? 1 : 0}" dirty="0"/><a:t>${x(t)}</a:t></a:r></a:p>`).replace("<a:noFill/>", '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>');
          if (b.etiqueta) s2 += etq(b.etiqueta, T2(r.medio), Math.max(60, String(b.etiqueta).length * 8 + 24), 12, true);
          const cerca = (pt, u) => T2({ x: pt.x - u.x * 24 - u.y * 14, y: pt.y - u.y * 24 + u.x * 14 });
          if (b.etqIni) s2 += etq(b.etqIni, cerca(r.ini, r.dirIni), 50, 11, false);
          if (b.etqFin) s2 += etq(b.etqFin, cerca(r.fin, r.dirFin), 50, 11, false);
          return s2;
        }
        return "";
      }
      const figuras = figurasL.join("\n");
      // 8.3 Fondo de la diapositiva (color, degradado o imagen), del tema o propio.
      let fondo = "";
      if (!esDiagrama && NOM.diapo) {
        const f = NOM.diapo.fondoDe(doc, p);
        let relleno = "";
        if (f && f.tipo === "color") relleno = `<a:solidFill><a:srgbClr val="${color(f.color, "FFFFFF")}"/></a:solidFill>`;
        else if (f && f.tipo === "rayas") relleno = `<a:solidFill><a:srgbClr val="${color(f.color, "FFFFFF")}"/></a:solidFill>`;
        else if (f && f.tipo === "degradado") relleno = `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${color(f.c1, "FFFFFF")}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${color(f.c2, "CFE0FF")}"/></a:gs></a:gsLst><a:lin ang="${Math.round((((+f.angulo || 135) - 90 + 360) % 360) * 60000)}" scaled="0"/></a:gradFill>`;
        else if (f && f.tipo === "imagen") { const rid = imagenRel(f.src); if (rid) relleno = `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rid}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`; }
        if (relleno) fondo = `<p:bg><p:bgPr>${relleno}<a:effectLst/></p:bgPr></p:bg>`;
      }
      // Transición y notas del orador.
      const tr = doc.valor("_doc", "trans:" + p);
      const transicion = tr ? `<p:transition spd="med">${{ desvanecer: "<p:fade/>", deslizar: '<p:push dir="l"/>', empujar: '<p:push dir="u"/>', zoom: "<p:zoom/>" }[tr] || "<p:fade/>"}</p:transition>` : "";
      const nota = !esDiagrama ? doc.valor("_doc", "nota:" + p) || "" : "";
      if (nota && !O) { notas.push({ diapo: n + 1, texto: nota }); rels.push({ id: "rIdNota", tipo: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide", destino: `../notesSlides/notesSlide${notas.length}.xml` }); }
      return { rels, bs, figurasL, fondo, transicion, nota: nota && !O ? notas.length : 0, xml: XML + `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld>${fondo}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${figuras}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transicion}</p:sld>` };
    };
    const diapos = og ? [{}] : paginas.map((p, n) => armar(p, n, null));
    if (!diapos.length) throw new Error("No hay nada que exportar");
    const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const arbolVacio = '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>';
    const conNotas = notas.length > 0;
    const presentacion = XML + `<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdM"/></p:sldMasterIdLst>${conNotas ? '<p:notesMasterIdLst><p:notesMasterId r:id="rIdNM"/></p:notesMasterIdLst>' : ""}
<p:sldIdLst>${diapos.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${TD.w * EMU}" cy="${TD.h * EMU}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
    const maestro = XML + `<p:sldMaster ${NS}>${arbolVacio}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
    const diseno = XML + `<p:sldLayout ${NS} type="blank" preserve="1">${arbolVacio}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
    // Notas del orador: un patrón de notas y una página de notas por diapositiva que las tenga.
    const phNota = (idx, tipo, nombre, x0, y0, w0, h0, cuerpo) => `<p:sp><p:nvSpPr><p:cNvPr id="${idx}" name="${nombre}"/><p:cNvSpPr><a:spLocks noGrp="1"${tipo === "sldImg" ? ' noRot="1" noChangeAspect="1"' : ""}/></p:cNvSpPr><p:nvPr><p:ph type="${tipo}"${tipo === "body" ? ' idx="1"' : ""}/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x0}" y="${y0}"/><a:ext cx="${w0}" cy="${h0}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>${cuerpo || ""}</p:sp>`;
    const maestroNotas = XML + `<p:notesMaster ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${phNota(2, "sldImg", "Imagen de diapositiva", 685800, 685800, 5486400, 3086100)}${phNota(3, "body", "Notas", 685800, 4114800, 5486400, 4114800, '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="es-MX"/></a:p></p:txBody>')}</p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr marL="0" algn="l"><a:defRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`;
    const paginaNotas = (t) => XML + `<p:notes ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${phNota(2, "sldImg", "Imagen de diapositiva", 685800, 685800, 5486400, 3086100)}${phNota(3, "body", "Notas", 685800, 4114800, 5486400, 4114800, `<p:txBody><a:bodyPr/><a:lstStyle/>${String(t).split("\n").map((l) => `<a:p><a:r><a:rPr lang="es-MX" dirty="0"/><a:t>${x(l)}</a:t></a:r></a:p>`).join("")}</p:txBody>`)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;

    // ---------------------------------------------------------- a partir del archivo original
    /**
     * Cada diapositiva que no cambió sale tal cual. En la que cambió, cada figura sin tocar sale
     * textual del original y solo las editadas (o nuevas) se escriben de nuevo; lo que NOM-COLAB no
     * muestra (SmartArt, video, marcadores vacíos) se queda en su lugar. Diseños, patrones y tema: intactos.
     */
    function conOrigen(N) {
      const O = NOM.origen, H = O.huella, pq = paqueteDe(og);
      const relP = pq.rels("").find((r) => /\/officeDocument$/.test(r.tipo || ""));
      const PRES = relP ? pq.resolver("", relP.destino) : "ppt/presentation.xml";
      const xp = pq.texto(PRES);
      if (!xp) throw new Error("falta la presentación");
      const raizP = O.hijosXml(xp).find((h) => O.local(h.n) === "presentation");
      if (!raizP || raizP.n !== "p:presentation") throw new Error("la presentación usa otro prefijo");
      const hsP = O.hijosXml(xp, raizP.ci, raizP.cf), una = (nm) => hsP.find((h) => O.local(h.n) === nm) || null;
      const szEl = una("sldSz"), lst = una("sldIdLst");
      if (!lst) throw new Error("presentación sin lista de diapositivas");
      const cx = szEl ? +O.attr(xp, szEl, "cx") : 12192000, cy = szEl ? +O.attr(xp, szEl, "cy") : 6858000;
      const kx = TD.w / (cx / EMU), ky = TD.h / (cy / EMU), km = Math.min(kx, ky);
      const esc = { k: 1 / km, fx: km / kx, fy: km / ky };
      const relsP = pq.rels(PRES), nombres = pq.nombres();
      let g = 1;
      while (nombres.some((nm) => nm.includes("/nom" + g + "-")) || relsP.some((r) => (r.id || "").startsWith("rIdNom" + g))) g++;
      PRE = "Nom" + g;
      const pre = PRE.toLowerCase() + "-", hpp = og.h.pp || {};
      const cambio = (k) => { const v = doc.valor("_doc", k), h0 = og.h.d ? og.h.d[k] : undefined; return v == null || v === "" ? h0 != null && h0 !== H("") : h0 !== H(v); };
      const igualB = (id) => { const hb = og.h.b && og.h.b[id]; return !!hb && (Array.isArray(hb) ? hb[0] : hb) === NOM.formatos.huellaBloque(doc, id); };
      const T_NOTA = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide", T_NM = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster";
      const CT_NOTA = "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml";
      let nNota = 0, maestroNotas = (() => { const r = relsP.find((q) => q.tipo === T_NM); return r ? pq.resolver(PRES, r.destino) : null; })();
      const piezasP = [];
      /** Notas del orador de una diapositiva: cambia el texto de su página de notas, o le crea una. */
      const ponNota = (ruta, texto) => {
        const rel = pq.rels(ruta).find((q) => q.tipo === T_NOTA);
        const parrafos = String(texto).split("\n").map((l) => `<a:p><a:r><a:rPr lang="es-MX" dirty="0"/><a:t>${x(l)}</a:t></a:r></a:p>`).join("");
        if (rel) {
          const np = pq.resolver(ruta, rel.destino), xn = pq.texto(np);
          if (!xn) return;
          // el cuadro de texto de las notas (marcador "body")
          const re = /<p:sp>[\s\S]*?<\/p:sp>/g;
          let m;
          while ((m = re.exec(xn))) {
            if (!/<p:ph\b[^>]*type="body"/.test(m[0])) continue;
            const nuevo = /<p:txBody>/.test(m[0]) ? m[0].replace(/<p:txBody>[\s\S]*<\/p:txBody>/, `<p:txBody><a:bodyPr/><a:lstStyle/>${parrafos || "<a:p/>"}</p:txBody>`) : m[0].replace("</p:sp>", `<p:txBody><a:bodyPr/><a:lstStyle/>${parrafos || "<a:p/>"}</p:txBody></p:sp>`);
            pq.pon(np, xn.slice(0, m.index) + nuevo + xn.slice(m.index + m[0].length));
            return;
          }
          return;
        }
        if (!texto) return;
        if (!maestroNotas) {
          // el original no tenía patrón de notas: se agrega uno sencillo con su tema
          maestroNotas = `ppt/notesMasters/${pre}notesMaster1.xml`;
          const tm = `ppt/theme/${pre}theme1.xml`;
          pq.pon(maestroNotas, N.maestroNotas); pq.tipo(maestroNotas, "application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml");
          pq.pon(tm, tema()); pq.tipo(tm, "application/vnd.openxmlformats-officedocument.theme+xml");
          pq.agregaRel(maestroNotas, "rId1", T.tema, "/" + tm);
          pq.agregaRel(PRES, "rId" + PRE + "NM", T_NM, "/" + maestroNotas);
          const mm = una("sldMasterIdLst");
          if (mm) piezasP.push([mm.f, mm.f, `<p:notesMasterIdLst><p:notesMasterId r:id="rId${PRE}NM"/></p:notesMasterIdLst>`]);
        }
        const np = `ppt/notesSlides/${pre}notesSlide${++nNota}.xml`;
        pq.pon(np, N.paginaNotas(texto)); pq.tipo(np, CT_NOTA);
        pq.pon(pq.relsDe(np), RELS([{ id: "rId1", tipo: T_NM, destino: "/" + maestroNotas }, { id: "rId2", tipo: T.diapo, destino: "/" + ruta }]));
        pq.agregaRel(ruta, "rId" + PRE + "Nota", T_NOTA, "/" + np);
      };
      /** El diseño para las diapositivas nuevas: uno en blanco si lo hay. */
      const disenoNuevo = (() => {
        const ls = nombres.filter((nm) => /^ppt\/slideLayouts\/[^/]+\.xml$/.test(nm));
        return ls.find((nm) => /<p:sldLayout\b[^>]*\btype="blank"/.test(pq.texto(nm) || "")) || ls[ls.length - 1] || null;
      })();
      const usadas = new Set(), planes = [];
      let nNueva = 0;
      paginas.forEach((p, n) => {
        const ruta0 = doc.valor("_doc", "os:" + p), hp = hpp[p];
        if (!ruta0 || !hp || !pq.tiene(ruta0) || usadas.has(ruta0)) {
          // diapositiva hecha en NOM-COLAB (o copia de otra): se arma completa sobre un diseño del original
          if (!disenoNuevo) throw new Error("el original no tiene diseños");
          const ruta = `ppt/slides/${pre}slide${++nNueva}.xml`;
          const r = armar(p, n, Object.assign({ idBase: 2 }, esc));
          pq.pon(ruta, r.xml); pq.tipo(ruta, "application/vnd.openxmlformats-officedocument.presentationml.slide+xml");
          pq.pon(pq.relsDe(ruta), RELS(r.rels.map((q) => (q.tipo === T.diseno ? { id: q.id, tipo: q.tipo, destino: "/" + disenoNuevo } : q))));
          const nota = doc.valor("_doc", "nota:" + p);
          if (nota) ponNota(ruta, nota);
          planes.push({ ruta, nueva: true });
          return;
        }
        usadas.add(ruta0);
        planes.push({ ruta: ruta0 });
        const orden = doc.deLaPagina(p).slice().sort((a, b) => (a.z || 0) - (b.z || 0)), ids = orden.map((b) => b.id);
        const cF = cambio("fondo:" + p), cT = cambio("trans:" + p), cN = cambio("nota:" + p);
        const mismas = ids.length === hp.ids.length && ids.every((id, i) => id === hp.ids[i]) && ids.every(igualB);
        if (mismas && !cF && !cT && !cN) return;   // intacta: ni se toca
        const xs = pq.texto(ruta0), raiz = O.hijosXml(xs).find((h) => O.local(h.n) === "sld");
        if (!raiz || raiz.n !== "p:sld") throw new Error("diapositiva con otro prefijo");
        const cSld = O.hijoXml(xs, "cSld", raiz.ci, raiz.cf), arbol = cSld && O.hijoXml(xs, "spTree", cSld.ci, cSld.cf);
        if (!arbol) throw new Error("diapositiva sin figuras");
        const us = O.hijosXml(xs, arbol.ci, arbol.cf), ps2 = [];
        const vivos = {};
        orden.forEach((b) => { if (b.ox != null) (vivos[b.ox] = vivos[b.ox] || []).push(b.id); });
        const intacto = (k) => { const a = hp.e[k] || [], v = vivos[k] || []; return a.length > 0 && a.length === v.length && a.every((id) => v.includes(id)) && a.every(igualB); };
        let maxId = 1;
        (xs.match(/<p:cNvPr\b[^>]*?\bid="\d+"/g) || []).forEach((m) => { maxId = Math.max(maxId, +/\bid="(\d+)"/.exec(m)[1]); });
        // Qué le pasó a cada elemento importado: "igual", "geo" (solo se movió o cambió de tamaño),
        // "texto" (cambió lo escrito) o "nuevo" (hay que escribirlo otra vez desde el modelo).
        const modos = {};
        const modo = (k) => {
          if (modos[k]) return modos[k];
          let m = "nuevo";
          const a = hp.e[k] || [], v = vivos[k] || [], el = us[k], q = a.length === 1 && og.h.q ? og.h.q[a[0]] : null;
          if (intacto(k)) m = "igual";
          else if (q && v.length === 1 && v[0] === a[0] && el && ["sp", "pic", "cxnSp", "graphicFrame"].includes(O.local(el.n))) {
            const pc = parcialesPptx(doc.bloque(a[0]));
            if (pc[0] === q[0]) m = "geo";
            else if (pc[1] === q[1] && O.local(el.n) === "sp" && O.hijoXml(xs, "txBody", el.ci, el.cf)) m = pc[2] === q[2] ? "texto" : "texto+geo";
          }
          return (modos[k] = m);
        };
        const X = (v) => Math.round(v * esc.k * esc.fx * EMU), Y = (v) => Math.round(v * esc.k * esc.fy * EMU);
        /** El elemento original con la posición y el tamaño que tiene ahora el bloque. */
        const conGeo = (t, b) => {
          const at2 = `${b.rot ? ` rot="${Math.round(b.rot * 60000)}"` : ""}${b.volteoH ? ' flipH="1"' : ""}${b.volteoV ? ' flipV="1"' : ""}`;
          const dentro = `<a:off x="${X(b.x)}" y="${Y(b.y)}"/><a:ext cx="${X(Math.max(1, b.w))}" cy="${Y(Math.max(1, b.h))}"/>`;
          if (/^<p:graphicFrame\b/.test(t)) return t.replace(/<p:xfrm\b[^>]*>[\s\S]*?<\/p:xfrm>|<p:xfrm\b[^>]*\/>/, `<p:xfrm${at2}>${dentro}</p:xfrm>`);
          const i0 = t.indexOf("<p:spPr");
          if (i0 < 0) return t;
          const g0 = O.finEtiqueta(t, i0), vacio = t.charCodeAt(g0 - 1) === 47;
          const xf = `<a:xfrm${at2}>${dentro}</a:xfrm>`;
          if (vacio) return t.slice(0, g0 - 1) + ">" + xf + "</p:spPr>" + t.slice(g0 + 1);
          const fin = t.indexOf("</p:spPr>", g0), cuerpo = t.slice(g0 + 1, fin);
          const nuevo = /^\s*<a:xfrm\b/.test(cuerpo) ? cuerpo.replace(/<a:xfrm\b[^>]*\/>|<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/, xf) : xf + cuerpo;
          return t.slice(0, g0 + 1) + nuevo + t.slice(fin);
        };
        /** El elemento original con los párrafos nuevos (conserva su caja de texto, su forma y su marcador). */
        const conTexto = (el, fig) => {
          const m = /<p:txBody>([\s\S]*)<\/p:txBody>/.exec(fig || ""), tx = O.hijoXml(xs, "txBody", el.ci, el.cf);
          if (!m || !tx) return null;
          const ps3 = m[1].replace(/^\s*(<a:bodyPr\b[^>]*\/>|<a:bodyPr\b[\s\S]*?<\/a:bodyPr>)/, "").replace(/^\s*(<a:lstStyle\b[^>]*\/>|<a:lstStyle\b[\s\S]*?<\/a:lstStyle>)/, "");
          const cabeza = O.hijosXml(xs, tx.ci, tx.cf).filter((h) => ["bodyPr", "lstStyle"].includes(O.local(h.n))).map((h) => xs.slice(h.i, h.f)).join("");
          return xs.slice(el.i, tx.i) + "<p:txBody>" + (cabeza || "<a:bodyPr/>") + ps3 + "</p:txBody>" + xs.slice(tx.f, el.f);
        };
        const r = armar(p, n, Object.assign({ idBase: maxId + 1,
          genera: (b) => !mismas && (b.ox == null || !hp.e[b.ox] || !us[b.ox] || /^(nuevo|texto)/.test(modo(b.ox))),
          hereda: (b) => b.ox != null && hp.e[b.ox] && us[b.ox] && /^texto/.test(modo(b.ox)) }, esc));
        if (!mismas) {
          const figDe = new Map(r.bs.map((b, i) => [b.id, r.figurasL[i]])), enBs = new Set(r.bs.map((b) => b.ox).filter((k) => k != null));
          const sale = [], puestos = new Set();
          let suelta = 0;
          while (suelta < us.length && ["nvGrpSpPr", "grpSpPr"].includes(O.local(us[suelta].n))) sale.push(xs.slice(us[suelta].i, us[suelta++].f));
          // lo que no se muestra en NOM-COLAB, y lo importado que quedó fuera de la vista pero sigue igual
          const sueltas = (hasta) => { for (; suelta < hasta; suelta++) if (!hp.e[suelta] || (!enBs.has(suelta) && intacto(suelta))) sale.push(xs.slice(us[suelta].i, us[suelta].f)); };
          r.bs.forEach((b) => {
            const k = b.ox;
            if (k == null || !hp.e[k] || !us[k]) { sale.push(figDe.get(b.id) || ""); return; }
            const md = modo(k);
            if (puestos.has(k)) { if (md === "nuevo") sale.push(figDe.get(b.id) || ""); return; }
            puestos.add(k); sueltas(k);
            let t = null;
            if (md === "igual") t = xs.slice(us[k].i, us[k].f);
            else if (md === "geo") t = conGeo(xs.slice(us[k].i, us[k].f), b);
            else if (md === "texto" || md === "texto+geo") { t = conTexto(us[k], figDe.get(b.id)); if (t && md === "texto+geo") t = conGeo(t, b); if (!t) modos[k] = "nuevo"; }
            sale.push(t != null ? t : figDe.get(b.id) || "");
          });
          sueltas(us.length);
          ps2.push([arbol.ci, arbol.cf, sale.join("")]);
          // las animaciones apuntan a figuras por número: si alguna se rehízo o se quitó, ya no corresponden
          if (Object.keys(hp.e).some((k) => modo(k) === "nuevo")) { const tm = O.hijoXml(xs, "timing", raiz.ci, raiz.cf); if (tm) ps2.push([tm.i, tm.f, ""]); }
        }
        r.rels.filter((q) => q.tipo !== T.diseno).forEach((q) => { if (!mismas || cF) pq.agregaRel(ruta0, q.id, q.tipo, q.destino); });
        if (cF) { const bg = O.hijoXml(xs, "bg", cSld.ci, cSld.cf); ps2.push(bg ? [bg.i, bg.f, r.fondo] : [cSld.ci, cSld.ci, r.fondo]); }
        if (cT) {
          const hsS = O.hijosXml(xs, raiz.ci, raiz.cf);
          const tr = hsS.find((h) => O.local(h.n) === "transition") || hsS.find((h) => O.local(h.n) === "AlternateContent" && /<p:transition\b/.test(xs.slice(h.i, h.f)));
          if (tr) ps2.push([tr.i, tr.f, r.transicion]);
          else { const cm = hsS.find((h) => O.local(h.n) === "clrMapOvr"), pos = cm ? cm.f : cSld.f; ps2.push([pos, pos, r.transicion]); }
        }
        pq.pon(ruta0, aplicarPiezas(xs, ps2));
        if (cN) ponNota(ruta0, doc.valor("_doc", "nota:" + p) || "");
      });
      // ---- la lista de diapositivas: orden, nuevas y borradas
      const ents = O.hijosXml(xp, lst.ci, lst.cf).map((h) => {
        const txt = xp.slice(h.i, h.f), rid = (/\sr:id="([^"]*)"/.exec(txt) || [])[1], rel = relsP.find((q) => q.id === rid);
        return { txt, rid, id: +O.attr(xp, h, "id") || 0, ruta: rel ? pq.resolver(PRES, rel.destino) : null };
      });
      const mismaLista = ents.length === planes.length && ents.every((e, i) => e.ruta === planes[i].ruta);
      if (!mismaLista) {
        let maxId = ents.reduce((m, e) => Math.max(m, e.id), 255), k = 0;
        const lista = planes.map((pl) => {
          const e = ents.find((q) => q.ruta === pl.ruta);
          if (e) return e.txt;
          const rid = "rId" + PRE + "S" + ++k;
          pq.agregaRel(PRES, rid, T.diapo, "/" + pl.ruta);
          return `<p:sldId id="${++maxId}" r:id="${rid}"/>`;
        });
        piezasP.push([lst.ci, lst.cf, lista.join("")]);
        const borradas = ents.filter((e) => e.ruta && !usadas.has(e.ruta));
        borradas.forEach((e) => {
          const nt = pq.rels(e.ruta).find((q) => q.tipo === T_NOTA);
          if (nt) { const np = pq.resolver(e.ruta, nt.destino); pq.quita(np); pq.quita(pq.relsDe(np)); pq.quitaTipo(np); }
          pq.quita(e.ruta); pq.quita(pq.relsDe(e.ruta)); pq.quitaTipo(e.ruta); pq.quitaRel(PRES, e.rid);
        });
        if (borradas.length) {
          // secciones y presentaciones personalizadas nombran diapositivas por número: se quitan para que no apunten a nada
          const cs = una("custShowLst");
          if (cs) piezasP.push([cs.i, cs.f, ""]);
          const ext = una("extLst");
          if (ext) piezasP.push([ext.i, ext.f, xp.slice(ext.i, ext.f).replace(/<p:ext\b[^>]*uri="\{521415D9-36F7-43E2-AB2F-B90AF26B5E84\}"[^>]*>[\s\S]*?<\/p:ext>/, "")]);
        }
      }
      if (piezasP.length) pq.pon(PRES, aplicarPiezas(xp, piezasP));
      medios.forEach((mm) => { pq.pon(mm.nombre, mm.datos); pq.extension(mm.nombre.split(".").pop(), /png$/.test(mm.nombre) ? "image/png" : "image/jpeg"); });
      graficas.forEach((gx, i) => { const nm = `ppt/charts/${pre}chart${i + 1}.xml`; pq.pon(nm, gx); pq.tipo(nm, "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"); });
      return pq.zip();
    }
    if (og) return conOrigen({ maestroNotas, paginaNotas });
    return zip([
      { nombre: "[Content_Types].xml", datos: CT(`<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${conNotas ? `<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` : ""}
${notas.map((_, i) => `<Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`).join("")}
${graficas.map((_, i) => `<Override PartName="/ppt/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("")}
${diapos.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}`) },
      { nombre: "_rels/.rels", datos: RELS([{ tipo: T.doc, destino: "ppt/presentation.xml" }]) },
      { nombre: "ppt/presentation.xml", datos: presentacion },
      { nombre: "ppt/_rels/presentation.xml.rels", datos: RELS([...diapos.map((_, i) => ({ id: "rId" + (i + 1), tipo: T.diapo, destino: `slides/slide${i + 1}.xml` })),
        { id: "rIdM", tipo: T.maestro, destino: "slideMasters/slideMaster1.xml" }, { id: "rIdT", tipo: T.tema, destino: "theme/theme1.xml" },
        ...(conNotas ? [{ id: "rIdNM", tipo: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster", destino: "notesMasters/notesMaster1.xml" }] : [])]) },
      { nombre: "ppt/slideMasters/slideMaster1.xml", datos: maestro },
      { nombre: "ppt/slideMasters/_rels/slideMaster1.xml.rels", datos: RELS([{ tipo: T.diseno, destino: "../slideLayouts/slideLayout1.xml" }, { tipo: T.tema, destino: "../theme/theme1.xml" }]) },
      { nombre: "ppt/slideLayouts/slideLayout1.xml", datos: diseno },
      { nombre: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", datos: RELS([{ tipo: T.maestro, destino: "../slideMasters/slideMaster1.xml" }]) },
      { nombre: "ppt/theme/theme1.xml", datos: tema() },
      ...(conNotas ? [
        { nombre: "ppt/notesMasters/notesMaster1.xml", datos: maestroNotas },
        { nombre: "ppt/notesMasters/_rels/notesMaster1.xml.rels", datos: RELS([{ tipo: T.tema, destino: "../theme/theme2.xml" }]) },
        { nombre: "ppt/theme/theme2.xml", datos: tema() },
        ...notas.flatMap((nn, i) => [
          { nombre: `ppt/notesSlides/notesSlide${i + 1}.xml`, datos: paginaNotas(nn.texto) },
          { nombre: `ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, datos: RELS([{ tipo: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster", destino: "../notesMasters/notesMaster1.xml" }, { tipo: T.diapo, destino: `../slides/slide${nn.diapo}.xml` }]) },
        ])] : []),
      ...diapos.flatMap((d, i) => [{ nombre: `ppt/slides/slide${i + 1}.xml`, datos: d.xml }, { nombre: `ppt/slides/_rels/slide${i + 1}.xml.rels`, datos: RELS(d.rels) }]),
      ...graficas.map((g, i) => ({ nombre: `ppt/charts/chart${i + 1}.xml`, datos: g })),
      ...medios,
    ]);
  }
  /** 8.3 Gráfica de una diapositiva como gráfica nativa de PowerPoint (con sus datos escritos). */
  function graficaPptx(b) {
    if (!NOM.diapo || !NOM.graficas) return null;
    const r = NOM.diapo.rangoUsado(b);
    if (!r) return null;
    const ev = F().evaluador((c, f) => b["c:" + F().ref(c, f)] || "");
    const d = NOM.graficas.datos(ev, r);
    if (!d) return null;
    const col = (NOM.graficas.PALETAS[b.colores] || NOM.graficas.PALETAS.clasica).c;
    const lit = (vals) => `<c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => (v == null ? "" : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join("")}</c:numLit>`;
    const cat = `<c:cat><c:strLit><c:ptCount val="${d.etiquetas.length}"/>${d.etiquetas.map((e, i) => `<c:pt idx="${i}"><c:v>${x(e)}</c:v></c:pt>`).join("")}</c:strLit></c:cat>`;
    const relleno = (i) => `<c:spPr><a:solidFill><a:srgbClr val="${col[i % col.length].slice(1)}"/></a:solidFill></c:spPr>`;
    const tx = (s) => `<c:tx><c:v>${x(s.nombre)}</c:v></c:tx>`;
    const titulo = (t0) => `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${x(t0)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
    const ejes = `<c:axId val="1001"/><c:axId val="1002"/>`;
    const ejeX = (pos0) => `<c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos0}"/>${b.ejeX ? titulo(b.ejeX) : ""}<c:numFmt formatCode="General" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="1002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>`;
    const ejeY = (pos0) => `<c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos0}"/><c:majorGridlines/>${b.ejeY ? titulo(b.ejeY) : ""}<c:numFmt formatCode="General" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="1001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
    const clase = b.clase || "barras";
    let plot;
    if (clase === "pastel") {
      const s = d.series[0];
      plot = `<c:pieChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${tx(s)}${d.etiquetas.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/>${relleno(i)}</c:dPt>`).join("")}${cat}<c:val>${lit(s.valores)}</c:val></c:ser><c:firstSliceAng val="0"/></c:pieChart>`;
    } else if (clase === "dispersion") {
      const xs = d.series.length > 1 ? d.series[0] : null, ys = xs ? d.series.slice(1) : d.series;
      plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${ys.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx(s)}<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/>${relleno(i)}</c:marker>${xs ? `<c:xVal>${lit(xs.valores)}</c:xVal>` : ""}<c:yVal>${lit(s.valores)}</c:yVal><c:smooth val="0"/></c:ser>`).join("")}${ejes}</c:scatterChart>`
        + `<c:valAx><c:axId val="1001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${b.ejeX ? titulo(b.ejeX) : ""}<c:numFmt formatCode="General" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="1002"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>${ejeY("l")}`;
    } else {
      const sers = d.series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx(s)}${relleno(i)}${cat}<c:val>${lit(s.valores)}</c:val>${clase === "lineas" ? '<c:smooth val="0"/>' : ""}</c:ser>`).join("");
      if (clase === "lineas") plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/>${ejes}</c:lineChart>`;
      else if (clase === "area") plot = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}${ejes}</c:areaChart>`;
      else plot = `<c:barChart><c:barDir val="${clase === "barras-h" ? "bar" : "col"}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}<c:gapWidth val="80"/>${ejes}</c:barChart>`;
      plot += ejeX(clase === "barras-h" ? "l" : "b") + ejeY(clase === "barras-h" ? "b" : "l");
    }
    return XML + `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${b.titulo ? titulo(b.titulo) + `<c:autoTitleDeleted val="0"/>` : `<c:autoTitleDeleted val="1"/>`}<c:plotArea><c:layout/>${plot}</c:plotArea>${d.series.length > 1 || clase === "pastel" ? `<c:legend><c:legendPos val="${clase === "pastel" ? "r" : "b"}"/><c:overlay val="0"/></c:legend>` : ""}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  }

  function tema() {
    const c = (n, v) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`;
    const f = '<a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/>';
    const relleno = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    return XML + `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="NOM-COLAB"><a:themeElements>
<a:clrScheme name="NOM">${c("dk1", "1F1E26")}${c("lt1", "FFFFFF")}${c("dk2", "3A3752")}${c("lt2", "F5F3EF")}${c("accent1", "5B5BD6")}${c("accent2", "3D72F2")}${c("accent3", "2FA868")}${c("accent4", "F08C2A")}${c("accent5", "8B5CF6")}${c("accent6", "D6336C")}${c("hlink", "3D72F2")}${c("folHlink", "8B5CF6")}</a:clrScheme>
<a:fontScheme name="NOM"><a:majorFont>${f}</a:majorFont><a:minorFont>${f}</a:minorFont></a:fontScheme>
<a:fmtScheme name="NOM"><a:fillStyleLst>${relleno.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${'<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'.repeat(3)}</a:lnStyleLst>
<a:effectStyleLst>${"<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${relleno.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  }

  // ------------------------------------------------------------ importar PowerPoint (.pptx)
  /**
   * .pptx → { paginas, bloques, doc, aviso }: cada diapositiva con sus cuadros de texto (con formato y
   * viñetas), figuras, imágenes (con recorte), tablas, gráficas, fondo, notas y transición.
   */
  async function leerPptx(archivo) {
    if (archivo.size > 60 * 1024 * 1024) throw new Error("El archivo pesa más de 60 MB");
    const u8 = new Uint8Array(await archivo.arrayBuffer());
    const z = NOM.origen.abrirZip(u8);
    let oxActual = null;   // qué hijo del árbol de figuras de la diapositiva se está leyendo
    const P = (t) => new DOMParser().parseFromString(t, "application/xml");
    const pres = await z.texto("ppt/presentation.xml");
    if (!pres) throw new Error("El archivo no parece una presentación de PowerPoint (.pptx)");
    const hs = (n, nombre) => [...(n ? n.childNodes : [])].filter((c) => c.nodeType === 1 && (!nombre || c.localName === nombre));
    const h1 = (n, nombre) => hs(n, nombre)[0] || null;
    const todos = (n, nombre) => (n ? [...n.getElementsByTagNameNS("*", nombre)] : []);
    const at = (n, a) => (n ? n.getAttribute(a) : null);
    const RNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const rid = (n, a) => (n ? n.getAttributeNS(RNS, a) || n.getAttribute("r:" + a) : null);
    const carpeta = (ruta) => ruta.slice(0, ruta.lastIndexOf("/") + 1);
    const resolver = (base, destino) => {
      if (destino.startsWith("/")) return destino.slice(1);
      const partes = (carpeta(base) + destino).split("/"), r = [];
      partes.forEach((p) => { if (p === "..") r.pop(); else if (p && p !== ".") r.push(p); });
      return r.join("/");
    };
    async function relsDe(ruta) {
      const t = await z.texto(carpeta(ruta) + "_rels/" + ruta.slice(ruta.lastIndexOf("/") + 1) + ".rels");
      const m = {};
      if (t) todos(P(t), "Relationship").forEach((r) => (m[at(r, "Id")] = { destino: resolver(ruta, at(r, "Target")), tipo: at(r, "Type") || "", externo: at(r, "TargetMode") === "External" }));
      return m;
    }
    const docP = P(pres);
    const sz = todos(docP, "sldSz")[0];
    const cx = sz ? +at(sz, "cx") : 12192000, cy = sz ? +at(sz, "cy") : 6858000;
    // El tamaño de NOM-COLAB con la proporción más parecida (16:9, 4:3, carta, cuadrado…).
    const proporcion = cx / cy, TAMS = NOM.diapo ? NOM.diapo.TAMANOS : { "16:9": { w: 960, h: 540 } };
    const tamDiapo = Object.keys(TAMS).reduce((m, k) => (Math.abs(TAMS[k].w / TAMS[k].h - proporcion) < Math.abs(TAMS[m].w / TAMS[m].h - proporcion) ? k : m), "16:9");
    const T = TAMS[tamDiapo];
    const kx = T.w / (cx / EMU), ky = T.h / (cy / EMU);
    const relsPres = await relsDe("ppt/presentation.xml");
    const ids = todos(docP, "sldId").map((s) => relsPres[rid(s, "id")]).filter(Boolean);
    const GEO_INV = { rect: "rect", roundRect: "rect", ellipse: "elipse", diamond: "rombo", triangle: "triangulo", rtTriangle: "triangulo-r", pentagon: "pentagono", hexagon: "hexagono", octagon: "octagono",
      star5: "estrella", heart: "corazon", cloud: "nube", wedgeRoundRectCallout: "burbuja", wedgeRectCallout: "burbuja", rightArrow: "flecha", leftRightArrow: "flecha-doble", chevron: "chevron", plus: "cruz",
      flowChartInputOutput: "paralelogramo", parallelogram: "paralelogramo", trapezoid: "trapecio", can: "cilindro", flowChartDocument: "documento", foldedCorner: "nota", flowChartProcess: "rect",
      flowChartDecision: "rombo", flowChartTerminator: "elipse", flowChartMagneticDisk: "cilindro" };
    // Colores del tema: casi todas las figuras de una presentación real dicen "acento 1" o "texto 1"
    // en vez de un color escrito.
    const esquema = {};
    {
      const tt = await z.texto((Object.values(relsPres).find((q) => /\/theme$/.test(q.tipo)) || {}).destino || "ppt/theme/theme1.xml");
      const cs = tt ? todos(P(tt), "clrScheme")[0] : null;
      hs(cs).forEach((c) => { const v = h1(c, "srgbClr") ? at(h1(c, "srgbClr"), "val") : h1(c, "sysClr") ? at(h1(c, "sysClr"), "lastClr") : null; if (v && /^[0-9a-f]{6}$/i.test(v)) esquema[c.localName] = v.toUpperCase(); });
      Object.assign(esquema, { tx1: esquema.dk1, bg1: esquema.lt1, tx2: esquema.dk2, bg2: esquema.lt2 });
    }
    /** Más claro o más oscuro, como lo pide el archivo (lumMod, lumOff, tint, shade: en milésimas de %). */
    function matiz(hex, c) {
      let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const v = (k) => { const e = h1(c, k); return e ? +at(e, "val") / 100000 : null; };
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let h = 0, sa = 0, l = (mx + mn) / 2;
      if (mx !== mn) { const d = mx - mn; sa = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
      if (v("lumMod") != null) l *= v("lumMod");
      if (v("lumOff") != null) l += v("lumOff");
      if (v("shade") != null) l *= v("shade");
      if (v("tint") != null) l = l * v("tint") + (1 - v("tint"));
      l = Math.max(0, Math.min(1, l));
      const q = l < 0.5 ? l * (1 + sa) : l + sa - l * sa, p2 = 2 * l - q;
      const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p2 + (q - p2) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p2 + (q - p2) * (2 / 3 - t) * 6 : p2; };
      [r, g, b] = sa === 0 ? [l, l, l] : [f(h + 1 / 3), f(h), f(h - 1 / 3)];
      return [r, g, b].map((x2) => Math.round(x2 * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
    }
    const hexDe = (fill) => {
      const c = fill && todos(fill, "srgbClr")[0];
      if (c && /^[0-9a-f]{6}$/i.test(at(c, "val") || "")) return "#" + (hs(c).length ? matiz(at(c, "val"), c) : at(c, "val").toUpperCase());
      const e = fill && todos(fill, "schemeClr")[0], base = e && esquema[at(e, "val")];
      if (base) return "#" + (hs(e).length ? matiz(base, e) : base);
      const y = fill && todos(fill, "sysClr")[0];
      if (y && /^[0-9a-f]{6}$/i.test(at(y, "lastClr") || "")) return "#" + at(y, "lastClr").toUpperCase();
      const pr = fill && todos(fill, "prstClr")[0], nom = pr && { black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", yellow: "FFFF00", gray: "808080" }[at(pr, "val")];
      return nom ? "#" + nom : null;
    };
    const medios = new Map();
    async function dataUrl(ruta) {
      if (medios.has(ruta)) return medios.get(ruta);
      const b = await z.leer(ruta);
      const ext = (ruta.split(".").pop() || "").toLowerCase();
      const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" }[ext];
      let u = null;
      if (b && mime) { let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); u = `data:${mime};base64,${btoa(bin)}`; }
      // Las fotos grandes se achican (máx. 1600 px) para que la presentación no pese de más.
      if (u && b.length > 350000 && /png|jpeg|webp/.test(mime)) u = await achicar(u, mime);
      medios.set(ruta, u);
      return u;
    }
    function achicar(u, mime) {
      return new Promise((ok) => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, 1600 / Math.max(img.width, img.height));
          if (k >= 1 && mime !== "image/png") { ok(u); return; }
          const cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          const r = cv.toDataURL(mime === "image/png" ? "image/png" : "image/jpeg", 0.85);
          ok(r.length < u.length ? r : u);
        };
        img.onerror = () => ok(u);
        img.src = u;
      });
    }
    /** Posición de un elemento (xfrm propio o el de su marcador en el diseño o el patrón). */
    function xfrmDe(spPr, ph, heredados) {
      const xf = spPr && h1(spPr, "xfrm");
      const leer = (x) => { const o = h1(x, "off"), e = h1(x, "ext"); return o && e ? { x: +at(o, "x"), y: +at(o, "y"), w: +at(e, "cx"), h: +at(e, "cy"), rot: +(at(x, "rot") || 0), fh: at(x, "flipH") === "1", fv: at(x, "flipV") === "1" } : null; };
      let r = xf ? leer(xf) : null;
      if (!r && ph) r = heredados[ph.clave] || heredados[ph.tipo] || null;
      return r;
    }
    async function marcadores(ruta) {
      const m = {};
      const t = await z.texto(ruta);
      if (!t) return m;
      todos(P(t), "sp").forEach((sp) => {
        const ph = todos(sp, "ph")[0], xf = todos(sp, "xfrm")[0];
        if (!ph || !xf) return;
        const o = h1(xf, "off"), e = h1(xf, "ext");
        if (!o || !e) return;
        const v = { x: +at(o, "x"), y: +at(o, "y"), w: +at(e, "cx"), h: +at(e, "cy"), rot: 0 };
        const tipo = at(ph, "type") || "body", idx = at(ph, "idx") || "";
        m[tipo + ":" + idx] = v;
        if (!m[tipo]) m[tipo] = v;
      });
      return m;
    }
    /** Párrafos de PowerPoint → HTML con formato (negrita, color, tamaño, viñetas). */
    function htmlTexto(txBody, base) {
      let h = "", lista = null;
      const cerrar = () => { if (lista) { h += `</${lista}>`; lista = null; } };
      hs(txBody, "p").forEach((p) => {
        const pPr = h1(p, "pPr");
        const algn = at(pPr, "algn");
        const vin = pPr && (h1(pPr, "buChar") ? "ul" : h1(pPr, "buAutoNum") ? "ol" : null);
        const lst = vin || (base.lista && !(pPr && h1(pPr, "buNone")) ? "ul" : null);
        let runs = "";
        hs(p).forEach((r) => {
          if (r.localName === "br") { runs += "<br>"; return; }
          if (r.localName !== "r" && r.localName !== "fld") return;
          const t = (h1(r, "t") || {}).textContent || "";
          if (!t) return;
          const rp = h1(r, "rPr"), st = [];
          if (at(rp, "sz")) st.push(`font-size:${Math.round((+at(rp, "sz") / 100) * 1.333 * Math.min(kx, ky))}px`);
          const c = rp && hexDe(h1(rp, "solidFill"));
          if (c) st.push(`color:${c}`);
          let x2 = NOM.esc(t);
          if (st.length) x2 = `<span style="${st.join(";")}">${x2}</span>`;
          if (at(rp, "b") === "1") x2 = `<b>${x2}</b>`;
          if (at(rp, "i") === "1") x2 = `<i>${x2}</i>`;
          if (at(rp, "u") && at(rp, "u") !== "none") x2 = `<u>${x2}</u>`;
          if (at(rp, "strike") && at(rp, "strike") !== "noStrike") x2 = `<s>${x2}</s>`;
          runs += x2;
        });
        const al = algn ? ` style="text-align:${{ ctr: "center", r: "right", just: "justify" }[algn] || "left"}"` : "";
        if (lst) { if (lista !== lst) { cerrar(); h += `<${lst}>`; lista = lst; } h += `<li${al}>${runs || "<br>"}</li>`; }
        else { cerrar(); h += `<div${al}>${runs || "<br>"}</div>`; }
      });
      cerrar();
      return h;
    }
    const bloques = [], paginas = [], docCampos = { tamDiapo };
    let aproximado = false, n = 0;
    for (const s of ids) {
      const ruta = s.destino, xml = await z.texto(ruta);
      if (!xml) continue;
      const pg = "p" + ++n;
      paginas.push(pg);
      const rels = await relsDe(ruta);
      const sld = P(xml);
      // Marcadores del diseño y del patrón (para lo que no trae posición propia).
      const relDiseno = Object.values(rels).find((r) => /slideLayout$/.test(r.tipo));
      let heredados = {};
      if (relDiseno) {
        const relsDis = await relsDe(relDiseno.destino);
        const relMaestro = Object.values(relsDis).find((r) => /slideMaster$/.test(r.tipo));
        heredados = Object.assign({}, relMaestro ? await marcadores(relMaestro.destino) : {}, await marcadores(relDiseno.destino));
      }
      let orden = 0;
      docCampos["os:" + pg] = ruta;   // de qué diapositiva del archivo viene esta página
      const agregar = (b) => { const id = "imp" + n + "_" + orden; bloques.push(Object.assign({ id, pagina: pg, orden: ++orden, z: orden, ox: oxActual }, b)); return id; };
      /**
       * SmartArt. Si el archivo trae al lado el dibujo ya acomodado (PowerPoint 2010 en adelante lo
       * guarda), se usan esas figuras con su lugar, su color y su texto. Si no, se arma con su lista
       * de cuadros: en árbol (organigrama) si unos cuelgan de otros, o en fila si es una lista.
       * Todas llevan el mismo "ox": mientras no se toquen, al exportar sale el SmartArt original.
       */
      async function smartArt(dg, r, anchoOrig, altoOrig) {
        const relDatos = rels[rid(dg, "dm")], datos = relDatos ? await z.texto(relDatos.destino) : null;
        if (!datos) return false;
        const m = /dataModelExt[^>]*relId="([^"]+)"/.exec(datos), relDib = m ? rels[m[1]] : null;
        const dib = relDib ? await z.texto(relDib.destino) : null;
        let hechas = 0;
        if (dib) {
          const fx = anchoOrig ? r.w / anchoOrig : 1, fy = altoOrig ? r.h / altoOrig : 1;
          todos(P(dib), "sp").forEach((sp) => {
            const spPr = h1(sp, "spPr"), xf = spPr && h1(spPr, "xfrm"), o = xf && h1(xf, "off"), e = xf && h1(xf, "ext");
            if (!o || !e || !+at(e, "cx") || !+at(e, "cy")) return;
            const txBody = h1(sp, "txBody"), texto = txBody ? txBody.textContent.trim() : "";
            const est = h1(sp, "style"), sinRelleno = !!h1(spPr, "noFill");
            const relleno = h1(spPr, "solidFill") ? hexDe(h1(spPr, "solidFill")) : h1(spPr, "gradFill") ? hexDe(h1(spPr, "gradFill")) : sinRelleno ? null : est && +at(h1(est, "fillRef"), "idx") ? hexDe(h1(est, "fillRef")) : null;
            const ln = h1(spPr, "ln"), borde = ln && !h1(ln, "noFill") ? hexDe(h1(ln, "solidFill")) : null;
            const prst = at(h1(spPr, "prstGeom"), "prst");
            if (!prst && !texto) return;   // trazo libre (las líneas que unen los cuadros): no se dibuja
            if (!relleno && !borde && !texto) return;
            const g = geo({ x: r.x + +at(o, "x") * fx, y: r.y + +at(o, "y") * fy, w: +at(e, "cx") * fx, h: +at(e, "cy") * fy, rot: +(at(xf, "rot") || 0) });
            const tinta = est ? hexDe(h1(est, "fontRef")) : null;
            agregar(Object.assign({ tipo: "forma", figura: GEO_INV[prst] || "rect", radio: prst === "roundRect" ? undefined : 0, color: relleno || "#FFFFFF", relleno: relleno ? undefined : false,
              borde: borde || undefined, bordeAncho: borde ? Math.max(1, Math.round(+(at(ln, "w") || 12700) / 12700)) : 0, sombra: false, tColor: tinta && tinta !== "#000000" ? tinta : undefined,
              texto, html: texto ? htmlTexto(txBody, {}) : undefined }, g));
            hechas++;
          });
          if (hechas) return true;
        }
        // ---- sin dibujo guardado: los cuadros de su lista
        const dm = P(datos), pts = {}, hijosDe = {};
        todos(dm, "pt").forEach((q) => { const tipo = at(q, "type") || "node"; if (tipo === "doc" || tipo === "node" || tipo === "asst") pts[at(q, "modelId")] = { tipo, texto: todos(h1(q, "t"), "p").map((x2) => x2.textContent.trim()).filter(Boolean).join("\n") }; });
        todos(dm, "cxn").filter((c) => (at(c, "type") || "parOf") === "parOf" && pts[at(c, "srcId")] && pts[at(c, "destId")]).sort((a, b) => +at(a, "srcOrd") - +at(b, "srcOrd"))
          .forEach((c) => (hijosDe[at(c, "srcId")] = hijosDe[at(c, "srcId")] || []).push(at(c, "destId")));
        const raizId = Object.keys(pts).find((k) => pts[k].tipo === "doc"), arriba = (raizId && hijosDe[raizId]) || [];
        if (!arriba.length) return false;
        const color = "#" + (esquema.accent1 || "4472C4"), W0 = r.w / EMU * kx, H0 = r.h / EMU * ky, X0 = r.x / EMU * kx, Y0 = r.y / EMU * ky;
        const caja = (id, x, y, w, h) => agregar({ tipo: "forma", figura: "rect", color, borde: "#FFFFFF", bordeAncho: 1, sombra: false, tColor: "#FFFFFF", texto: pts[id].texto, html: `<div style="text-align:center">${NOM.esc(pts[id].texto).replace(/\n/g, "<br>")}</div>`,
          x: Math.round(X0 + x), y: Math.round(Y0 + y), w: Math.max(8, Math.round(w)), h: Math.max(8, Math.round(h)) });
        const enArbol = arriba.some((k) => (hijosDe[k] || []).length);
        if (!enArbol) {
          // lista: en fila si caben, en varias filas si son muchos
          const nC = arriba.length, porFila = nC <= 6 ? nC : Math.ceil(Math.sqrt(nC * (W0 / Math.max(1, H0)))), filas = Math.ceil(nC / porFila);
          const cw = W0 / porFila, ch = H0 / filas;
          arriba.forEach((id, i) => caja(id, (i % porFila) * cw + cw * 0.06, Math.floor(i / porFila) * ch + ch * 0.15, cw * 0.88, Math.min(ch * 0.7, cw * 0.7)));
          return true;
        }
        // árbol: las hojas se reparten a lo ancho y cada cuadro queda centrado sobre los suyos
        let hojas = 0, niveles = 0;
        const pos = {};
        const medir = (id, nivel, visto) => {
          if (visto.has(id) || nivel > 12) return null;
          visto.add(id); niveles = Math.max(niveles, nivel + 1);
          const hj = (hijosDe[id] || []).map((k) => medir(k, nivel + 1, visto)).filter((v) => v != null);
          const x = hj.length ? (hj[0] + hj[hj.length - 1]) / 2 : hojas++ + 0.5;
          pos[id] = { x, nivel };
          return x;
        };
        const visto = new Set();
        arriba.forEach((id) => medir(id, 0, visto));
        const cw = W0 / Math.max(1, hojas), ch = H0 / Math.max(1, niveles), bw = Math.min(cw * 0.86, 220), bh = Math.min(ch * 0.55, 80);
        const idDe = {};
        Object.keys(pos).forEach((id) => { idDe[id] = caja(id, pos[id].x * cw - bw / 2, pos[id].nivel * ch + (ch - bh) / 2, bw, bh); });
        Object.keys(pos).forEach((id) => (hijosDe[id] || []).forEach((k) => { if (idDe[k]) agregar({ tipo: "conector", desde: idDe[id], hasta: idDe[k], orden: 0 }); }));
        return true;
      }
      const geo = (r) => ({ x: Math.round((r.x / EMU) * kx), y: Math.round((r.y / EMU) * ky), w: Math.max(4, Math.round((r.w / EMU) * kx)), h: Math.max(4, Math.round((r.h / EMU) * ky)), rot: r.rot ? Math.round(r.rot / 60000) : undefined, volteoH: r.fh || undefined, volteoV: r.fv || undefined });
      async function elemento(el, grupo) {
        const nm = el.localName;
        if (nm === "grpSp") {
          // Grupo: sus hijos se ubican con la transformación del grupo.
          const gx = todos(h1(el, "grpSpPr"), "xfrm")[0];
          let g = grupo;
          if (gx) {
            const o = h1(gx, "off"), e = h1(gx, "ext"), co = h1(gx, "chOff"), ce = h1(gx, "chExt");
            if (o && e && co && ce) {
              const sx = (+at(ce, "cx") ? +at(e, "cx") / +at(ce, "cx") : 1), sy = (+at(ce, "cy") ? +at(e, "cy") / +at(ce, "cy") : 1);
              const prev = grupo || { tx: (v) => v, ty: (v) => v, s: (v) => v, sy: (v) => v };
              g = { tx: (v) => prev.tx(+at(o, "x") + (v - +at(co, "x")) * sx), ty: (v) => prev.ty(+at(o, "y") + (v - +at(co, "y")) * sy), s: (v) => prev.s(v * sx), sy: (v) => prev.sy(v * sy) };
            }
          }
          for (const c of hs(el)) await elemento(c, g);
          return;
        }
        const ajustar = (r) => (grupo && r ? Object.assign({}, r, { x: grupo.tx(r.x), y: grupo.ty(r.y), w: grupo.s(r.w), h: grupo.sy(r.h) }) : r);
        if (nm === "sp") {
          const nv = todos(el, "nvPr")[0], ph = todos(nv, "ph")[0];
          const phInfo = ph ? { tipo: at(ph, "type") || "body", clave: (at(ph, "type") || "body") + ":" + (at(ph, "idx") || "") } : null;
          const spPr = h1(el, "spPr"), r = ajustar(xfrmDe(spPr, phInfo, heredados));
          if (!r) return;
          const txBody = h1(el, "txBody");
          const texto = txBody ? txBody.textContent.trim() : "";
          const prst = at(todos(spPr, "prstGeom")[0], "prst");
          const estSp = h1(el, "style"), conRellenoPropio = spPr && (h1(spPr, "solidFill") || h1(spPr, "noFill") || h1(spPr, "gradFill") || h1(spPr, "blipFill") || h1(spPr, "pattFill"));
          const relleno = spPr && h1(spPr, "solidFill") ? hexDe(h1(spPr, "solidFill")) : spPr && h1(spPr, "gradFill") ? hexDe(h1(spPr, "gradFill")) : !conRellenoPropio && estSp && +at(h1(estSp, "fillRef"), "idx") ? hexDe(h1(estSp, "fillRef")) : null;
          const esTexto = !!(phInfo || todos(el, "cNvSpPr").some((c) => at(c, "txBox") === "1") || (!relleno && (!prst || prst === "rect")));
          const cNv = todos(el, "cNvPr")[0], nombreSp = at(cNv, "name") || "", descr = at(cNv, "descr") || "";
          // Ecuación exportada por NOM-COLAB: la fórmula original viaja en la descripción del cuadro.
          if (/^LaTeX: /.test(descr)) { agregar(Object.assign({ tipo: "ecuacion", tex: descr.slice(7) }, geo(r))); return; }
          const titulo = phInfo && /title|ctrTitle/.test(phInfo.tipo);
          if (esTexto) {
            if (!texto) return;
            const estilo = titulo ? (phInfo.tipo === "ctrTitle" ? "h1" : "h2") : /^Título \d/.test(nombreSp) ? "h1" : /^Encabezado \d/.test(nombreSp) ? "h2" : "p";
            agregar(Object.assign({ tipo: "texto", estilo, html: htmlTexto(txBody, { lista: phInfo && phInfo.tipo === "body" }) }, geo(r)));
          } else {
            const ln = spPr && h1(spPr, "ln"), tinta = estSp ? hexDe(h1(estSp, "fontRef")) : null;
            agregar(Object.assign({ tipo: "forma", figura: GEO_INV[prst] || "rect", radio: prst === "rect" || prst === "flowChartProcess" ? 0 : undefined, color: relleno || "#CFE0FF", relleno: spPr && h1(spPr, "noFill") ? false : undefined,
              borde: ln && h1(ln, "solidFill") ? hexDe(h1(ln, "solidFill")) : estSp && +at(h1(estSp, "lnRef"), "idx") && !(ln && h1(ln, "noFill")) ? hexDe(h1(estSp, "lnRef")) || undefined : undefined,
              bordeAncho: ln && at(ln, "w") ? Math.max(1, Math.round(+at(ln, "w") / 12700)) : undefined, sombra: false, tColor: tinta && tinta !== "#000000" && texto ? tinta : undefined,
              texto: texto || "", html: texto ? htmlTexto(txBody, {}) : undefined }, geo(r)));
          }
          return;
        }
        if (nm === "pic") {
          const r = ajustar(xfrmDe(h1(el, "spPr"), null, heredados)), blip = todos(el, "blip")[0];
          const rel = blip && rels[rid(blip, "embed")];
          const src = rel ? await dataUrl(rel.destino) : null;
          if (!r || !src) { aproximado = true; return; }
          const sr = todos(h1(el, "blipFill"), "srcRect")[0];
          const fr = (k) => Math.max(0, Math.min(0.9, (+(at(sr, k) || 0)) / 100000));
          const recorte = sr && (at(sr, "l") || at(sr, "r") || at(sr, "t") || at(sr, "b")) ? { iz: fr("l"), d: fr("r"), s: fr("t"), i: fr("b") } : undefined;
          const prst = at(todos(h1(el, "spPr"), "prstGeom")[0], "prst");
          // Efectos de la imagen: blanco y negro, brillo, contraste y transparencia.
          const filtros = {}, lum = h1(blip, "lum"), alfaI = h1(blip, "alphaModFix");
          if (h1(blip, "grayscl")) filtros.gris = 100;
          if (lum && at(lum, "bright")) filtros.brillo = Math.round(100 + +at(lum, "bright") / 1000);
          if (lum && at(lum, "contrast")) filtros.contraste = Math.round(100 + +at(lum, "contrast") / 1000);
          agregar(Object.assign({ tipo: "imagen", src, recorte, mascara: prst && prst !== "rect" && prst !== "roundRect" ? GEO_INV[prst] : undefined, alt: at(todos(el, "cNvPr")[0], "descr") || undefined,
            filtros: Object.keys(filtros).length ? filtros : undefined, opacidad: alfaI && at(alfaI, "amt") ? Math.max(0.05, +at(alfaI, "amt") / 100000) : undefined }, geo(r)));
          return;
        }
        if (nm === "graphicFrame") {
          const xf = h1(el, "xfrm"), o = xf && h1(xf, "off"), e = xf && h1(xf, "ext");
          if (!o || !e) return;
          const r = ajustar({ x: +at(o, "x"), y: +at(o, "y"), w: +at(e, "cx"), h: +at(e, "cy") });
          const tbl = todos(el, "tbl")[0];
          if (tbl) {
            const filas = hs(tbl, "tr"), celdas = {};
            let cols = 0;
            filas.forEach((tr, f) => { const tcs = hs(tr, "tc"); cols = Math.max(cols, tcs.length); tcs.forEach((tc, c) => { const t = tc.textContent.trim(); if (t) celdas["c:" + F().ref(c, f)] = t; }); });
            agregar(Object.assign({ tipo: "tabla", enDiapo: true, filas: filas.length, cols, encabezado: at(todos(tbl, "tblPr")[0], "firstRow") === "1" || undefined }, celdas, geo(r)));
            return;
          }
          const ch = todos(el, "chart")[0], rel = ch && rels[rid(ch, "id")];
          if (rel) {
            const t = await z.texto(rel.destino);
            if (t) {
              const cd = P(t), celdas = {};
              const tipoG = todos(cd, "barChart")[0] ? (at(todos(cd, "barDir")[0], "val") === "bar" ? "barras-h" : "barras") : todos(cd, "lineChart")[0] ? "lineas" : todos(cd, "pieChart")[0] ? "pastel" : todos(cd, "areaChart")[0] ? "area" : todos(cd, "scatterChart")[0] ? "dispersion" : "barras";
              const sers = todos(cd, "ser");
              const cats = sers[0] ? todos(h1(sers[0], "cat") || h1(sers[0], "xVal"), "pt").map((p) => (todos(p, "v")[0] || {}).textContent || "") : [];
              cats.forEach((c, i) => (celdas["c:" + F().ref(0, i + 1)] = c));
              sers.forEach((sr, j) => {
                const nombre = (todos(h1(sr, "tx"), "v")[0] || {}).textContent || "Serie " + (j + 1);
                celdas["c:" + F().ref(j + 1, 0)] = nombre;
                todos(h1(sr, "val") || h1(sr, "yVal"), "pt").forEach((p) => { celdas["c:" + F().ref(j + 1, +at(p, "idx") + 1)] = (todos(p, "v")[0] || {}).textContent || ""; });
              });
              const titulo = todos(todos(cd, "title")[0], "t").map((x2) => x2.textContent).join("");
              agregar(Object.assign({ tipo: "grafica", clase: tipoG, titulo: titulo || "", filas: Math.max(2, cats.length + 1), cols: sers.length + 1 }, celdas, geo(r)));
              return;
            }
          }
          const dg = todos(el, "relIds")[0];
          if (dg && (await smartArt(dg, r, +at(e, "cx"), +at(e, "cy")))) return;
          aproximado = true;
          return;
        }
        if (nm === "cxnSp") {
          const r = ajustar(xfrmDe(h1(el, "spPr"), null, heredados));
          if (!r) return;
          const ln = todos(el, "ln")[0];
          const flecha = ln && (h1(ln, "tailEnd") || h1(ln, "headEnd"));
          const g = geo(r);
          agregar(Object.assign({ tipo: "forma", figura: flecha ? "linea-flecha" : "linea", borde: ln ? hexDe(h1(ln, "solidFill")) || "#4A4854" : "#4A4854", bordeAncho: ln && at(ln, "w") ? Math.max(1, Math.round(+at(ln, "w") / 12700)) : 2 }, g, { h: Math.max(16, g.h) }));
          return;
        }
        if (nm === "AlternateContent") { const f = h1(el, "Fallback") || h1(el, "Choice"); if (f) for (const c of hs(f)) await elemento(c, grupo); }
      }
      const arbol = todos(sld, "spTree")[0];
      const hijosArbol = hs(arbol);
      for (let i2 = 0; i2 < hijosArbol.length; i2++) { oxActual = i2; await elemento(hijosArbol[i2], null); }
      oxActual = null;
      // Fondo
      const bgPr = todos(todos(sld, "bg")[0], "bgPr")[0];
      if (bgPr) {
        const sf = h1(bgPr, "solidFill"), gf = h1(bgPr, "gradFill"), bf = h1(bgPr, "blipFill");
        if (sf && hexDe(sf)) docCampos["fondo:" + pg] = { tipo: "color", color: hexDe(sf) };
        else if (gf) { const gs = todos(gf, "gs").map((g) => hexDe(g)).filter(Boolean); if (gs.length >= 2) docCampos["fondo:" + pg] = { tipo: "degradado", c1: gs[0], c2: gs[gs.length - 1], angulo: 135 }; }
        else if (bf) { const b2 = todos(bf, "blip")[0], rel = b2 && rels[rid(b2, "embed")]; const src = rel ? await dataUrl(rel.destino) : null; if (src) docCampos["fondo:" + pg] = { tipo: "imagen", src, ajuste: "cubrir" }; }
      }
      // Transición y notas del orador
      const tr = todos(sld, "transition")[0];
      if (tr) { const c = hs(tr)[0]; if (c) docCampos["trans:" + pg] = { fade: "desvanecer", push: "deslizar", zoom: "zoom", wipe: "deslizar", cover: "deslizar", dissolve: "desvanecer" }[c.localName] || "desvanecer"; }
      const relNotas = Object.values(rels).find((r) => /notesSlide$/.test(r.tipo));
      if (relNotas) {
        const t = await z.texto(relNotas.destino);
        if (t) {
          const cuerpo = todos(P(t), "sp").find((sp) => { const ph = todos(sp, "ph")[0]; return ph && at(ph, "type") === "body"; });
          const txt = cuerpo ? hs(h1(cuerpo, "txBody"), "p").map((p) => p.textContent).join("\n").trim() : "";
          if (txt) docCampos["nota:" + pg] = txt;
        }
      }
    }
    if (!paginas.length) throw new Error("La presentación no tiene diapositivas que se puedan leer");
    return { archivo: u8, paginas, bloques, doc: docCampos, aviso: aproximado ? "Algunos objetos de PowerPoint (videos o imágenes de otro formato) no se ven aquí, pero se conservan: al descargar en PowerPoint salen completos" : null };
  }

  NOM.ooxml = { zip, docx, xlsx, pptx, formulaExcel, crc32, leerDocx, leerXlsx, leerPptx, modeloXlsx, huellasDocx, huellasPptx, parcialesPptx, abrirZip, usarOrigen: true };
})();
