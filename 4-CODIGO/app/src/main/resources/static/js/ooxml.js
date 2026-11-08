/* NOM-COLAB · Exportar a formatos de Office (Office Open XML), sin librerías:
   texto → .docx (Word), hoja → .xlsx (Excel), presentación y diagrama → .pptx (PowerPoint).
   Un archivo OOXML es un .zip de XML; aquí se arma el zip "sin compresión" (método 0). */
(function () {
  "use strict";
  const NOM = window.NOM;
  const F = () => NOM.formulas;
  const enc = new TextEncoder();
  const x = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  // ------------------------------------------------------------ zip (store)
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function zip(archivos) {
    const partes = [], centrales = [];
    let off = 0;
    for (const a of archivos) {
      const nombre = enc.encode(a.nombre), datos = typeof a.datos === "string" ? enc.encode(a.datos) : a.datos, crc = crc32(datos);
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
      loc.setUint32(14, crc, true); loc.setUint32(18, datos.length, true); loc.setUint32(22, datos.length, true);
      loc.setUint16(26, nombre.length, true);
      partes.push(new Uint8Array(loc.buffer), nombre, datos);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true);
      cen.setUint16(28, nombre.length, true); cen.setUint32(42, off, true);
      centrales.push(new Uint8Array(cen.buffer), nombre);
      off += 30 + nombre.length + datos.length;
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
    const medios = [], rels = [{ id: "rIdEst", tipo: T.estilos, destino: "styles.xml" }, { id: "rIdNum", tipo: T.num, destino: "numbering.xml" }, { id: "rIdConf", tipo: T.conf, destino: "settings.xml" }];
    const ps = NOM.textoRico.parrafosDe(doc);
    let nImg = 0, nLink = 0;
    const nums = [];   // cada lista numerada nueva reinicia en 1
    let numActual = null;
    const rPr = (a) => {
      let r = "";
      if (a.fuente) r += `<w:rFonts w:ascii="${x(a.fuente)}" w:hAnsi="${x(a.fuente)}" w:cs="${x(a.fuente)}"/>`;
      if (a.b) r += "<w:b/><w:bCs/>";
      if (a.i) r += "<w:i/><w:iCs/>";
      if (a.s) r += "<w:strike/>";
      if (hexW(a.color)) r += `<w:color w:val="${hexW(a.color)}"/>`;
      if (a.tam) r += `<w:sz w:val="${Math.round(a.tam * 2)}"/><w:szCs w:val="${Math.round(a.tam * 2)}"/>`;
      if (hexW(a.fondo)) r += `<w:shd w:val="clear" w:color="auto" w:fill="${hexW(a.fondo)}"/>`;
      if (a.u) r += '<w:u w:val="single"/>';
      if (a.va) r += `<w:vertAlign w:val="${a.va === "sup" ? "superscript" : "subscript"}"/>`;
      return r ? `<w:rPr>${r}</w:rPr>` : "";
    };
    const texto = (t, a) => {
      // Tabuladores y saltos de línea son elementos propios en Word.
      return t.split(/(\t|\u2028)/).filter((z) => z !== "").map((z) => `<w:r>${rPr(a)}${z === "\t" ? "<w:tab/>" : z === "\u2028" ? "<w:br/>" : `<w:t xml:space="preserve">${x(z)}</w:t>`}</w:r>`).join("");
    };
    const dibujo = (src, wpx, alt) => {
      const im = imagen(src);
      if (!im) return "";
      const n = ++nImg, id = "rIdImg" + n;
      medios.push({ nombre: `word/media/imagen${n}.${im.ext}`, datos: im.bytes });
      rels.push({ id, tipo: T.img, destino: `media/imagen${n}.${im.ext}` });
      const w = Math.min(wpx || im.w, 624), cx = Math.round(w * EMU), cy = Math.round(w * (im.h / im.w) * EMU);
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Imagen ${n}" descr="${x(alt || "")}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="imagen${n}"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    };
    const tabla = (b) => {
      const filas = Math.max(1, b.filasTexto || 3), cols = Math.max(1, b.colsTexto || 3), ancho = Math.floor(9360 / cols);
      let t = `<w:tbl><w:tblPr><w:tblStyle w:val="TablaNom"/><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0" w:firstRow="${b.encabezado ? 1 : 0}" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${`<w:gridCol w:w="${ancho}"/>`.repeat(cols)}</w:tblGrid>`;
      for (let f = 0; f < filas; f++) {
        t += "<w:tr>";
        for (let c = 0; c < cols; c++) {
          const v = String(b["c:" + F().ref(c, f)] || "");
          t += `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/></w:tcPr>${v.split("\n").map((l) => `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${l ? texto(l, b.encabezado && f === 0 ? { b: true } : {}) : ""}</w:p>`).join("")}</w:tc>`;
        }
        t += "</w:tr>";
      }
      return t + "</w:tbl>";
    };
    const titulos = ps.filter((p) => /^h[1-3]$/.test(p.pa.estilo || ""));
    const cuerpo = ps.map((p, i) => {
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
      if (pa.lista === "vinetas") ppr += `<w:numPr><w:ilvl w:val="${pa.nivel || 0}"/><w:numId w:val="1"/></w:numPr>`;
      if (pa.lista === "numeros") {
        if (!numActual) { numActual = 3 + nums.length; nums.push(numActual); }
        ppr += `<w:numPr><w:ilvl w:val="${pa.nivel || 0}"/><w:numId w:val="${numActual}"/></w:numPr>`;
      } else if (!pa.lista || pa.lista !== "numeros") { if (pa.lista !== "vinetas" && pa.lista !== "tareas") numActual = null; }
      if (pa.lista === "tareas") ppr += `<w:ind w:left="${360 * ((pa.nivel || 0) + 1)}" w:hanging="360"/>`;
      else if (pa.sangria && !pa.lista) ppr += `<w:ind w:left="${pa.sangria * 720}"/>`;
      if (pa.antes != null || pa.despues != null || pa.interlineado) ppr += `<w:spacing${pa.antes != null ? ` w:before="${Math.round(pa.antes * 20)}"` : ""}${pa.despues != null ? ` w:after="${Math.round(pa.despues * 20)}"` : ""}${pa.interlineado ? ` w:line="${Math.round(pa.interlineado * 240)}" w:lineRule="auto"` : ""}/>`;
      if (ALIN_WORD[pa.alin]) ppr += `<w:jc w:val="${ALIN_WORD[pa.alin]}"/>`;
      let runs = pa.lista === "tareas" ? texto(pa.hecho ? "☑\t" : "☐\t", {}) : "";
      p.tramos.forEach((t) => {
        if (t.e) {
          if (t.e.tipo === "imagen") runs += dibujo(t.e.src, t.e.w, t.e.alt);
          return;
        }
        const a = Object.assign({}, t.a, pa.hecho ? { s: true } : {});
        if (a.enlace && /^(https?:|mailto:)/i.test(a.enlace)) {
          const id = "rIdLink" + ++nLink;
          rels.push({ id, tipo: T.enlace, destino: a.enlace, externo: true });
          runs += `<w:hyperlink r:id="${id}" w:history="1">${texto(t.x, Object.assign({}, a)).replace(/<w:rPr>/g, '<w:rPr><w:rStyle w:val="Hyperlink"/>').replace(/<w:r>(?!<w:rPr>)/g, '<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>')}</w:hyperlink>`;
        } else runs += texto(t.x, a);
      });
      return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${runs}</w:p>`;
    }).join("\n");

    // Página, encabezado y pie
    const pag = doc.valor("_doc", "pagina") || {};
    const TAM = { carta: [816, 1056], a4: [794, 1123], oficio: [816, 1344] }[pag.tam] || [816, 1056];
    const hor = pag.orient === "h", m = pag.margen || {};
    const mv = (v) => Math.round((typeof v === "number" ? v : 96) * TWIP);
    const enc = doc.valor("_doc", "encabezado") || "", pie = doc.valor("_doc", "pie") || "", nums2 = doc.valor("_doc", "numeros") !== false;
    const extras = [];
    let refs = "";
    const NSW = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    if (enc) {
      rels.push({ id: "rIdEnc", tipo: T.encabezado, destino: "header1.xml" });
      extras.push({ nombre: "word/header1.xml", datos: XML + `<w:hdr ${NSW}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:t xml:space="preserve">${x(enc)}</w:t></w:r></w:p></w:hdr>` });
      refs += '<w:headerReference w:type="default" r:id="rIdEnc"/>';
    }
    if (pie || nums2) {
      rels.push({ id: "rIdPie", tipo: T.pie, destino: "footer1.xml" });
      extras.push({ nombre: "word/footer1.xml", datos: XML + `<w:ftr ${NSW}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs></w:pPr>${pie ? `<w:r><w:t xml:space="preserve">${x(pie)}</w:t></w:r>` : ""}${nums2 ? '<w:r><w:tab/></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>' : ""}</w:p></w:ftr>` });
      refs += '<w:footerReference w:type="default" r:id="rIdPie"/>';
    }
    const documento = XML + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>${cuerpo || "<w:p/>"}<w:sectPr>${refs}<w:pgSz w:w="${(hor ? TAM[1] : TAM[0]) * TWIP}" w:h="${(hor ? TAM[0] : TAM[1]) * TWIP}"${hor ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="${mv(m.s)}" w:right="${mv(m.d)}" w:bottom="${mv(m.i)}" w:left="${mv(m.iz)}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const ep = (id, nombre, rpr, ppr, extra) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${nombre}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>${extra || ""}${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}</w:style>`;
    // 1.4 El formato base del documento (el del espacio) es el estilo Normal de Word.
    const fb = doc.valor("_doc", "formato") || {};
    const ligera = fb.fuente ? `<w:rFonts w:ascii="${x(fb.fuente)}" w:hAnsi="${x(fb.fuente)}"/>` : '<w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:ascii="Calibri Light" w:hAnsi="Calibri Light"/>';
    const estilos = XML + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${x(fb.fuente || "Calibri")}" w:hAnsi="${x(fb.fuente || "Calibri")}" w:eastAsia="${x(fb.fuente || "Calibri")}" w:cs="${x(fb.fuente || "Calibri")}"/><w:sz w:val="${Math.round((+fb.tam || 11) * 2)}"/><w:szCs w:val="${Math.round((+fb.tam || 11) * 2)}"/><w:lang w:val="es-MX"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="${Math.round((+fb.interlineado || 1.15) * 240)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
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
    const numeracion = XML + `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, i) => nivel(i, "bullet", vin[i % 3], "Calibri")).join("")}</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, i) => nivel(i, fm[i % 3], `%${i + 1}.`)).join("")}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
${nums.map((n) => `<w:num w:numId="${n}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join("")}</w:numbering>`;
    const ajustes = XML + `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
    const titulo = doc.valor("_doc", "nombre") || "Documento";
    const nucleo = XML + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(titulo)}</dc:title><dc:creator>NOM-COLAB</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`;
    return zip([
      { nombre: "[Content_Types].xml", datos: CT(`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${enc ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ""}
${pie || nums2 ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ""}`) },
      { nombre: "_rels/.rels", datos: RELS([{ tipo: T.doc, destino: "word/document.xml" }, { tipo: T.nucleo, destino: "docProps/core.xml" }]) },
      { nombre: "docProps/core.xml", datos: nucleo },
      { nombre: "word/document.xml", datos: documento },
      { nombre: "word/styles.xml", datos: estilos },
      { nombre: "word/numbering.xml", datos: numeracion },
      { nombre: "word/settings.xml", datos: ajustes },
      { nombre: "word/_rels/document.xml.rels", datos: RELS(rels) },
      ...extras,
      ...medios,
    ]);
  }

  // ------------------------------------------------------------ leer .docx (importar de Word)
  /** Lector de .zip: índice central y descompresión con DecompressionStream (deflate-raw). */
  async function abrirZip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let fin = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    if (fin < 0) throw new Error("El archivo no es un .docx válido (no es un zip)");
    const n = dv.getUint16(fin + 10, true);
    let off = dv.getUint32(fin + 16, true);
    const dec = new TextDecoder();
    const entradas = new Map();
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(off + 10, true), comp = dv.getUint32(off + 20, true);
      const ln = dv.getUint16(off + 28, true), le = dv.getUint16(off + 30, true), lc = dv.getUint16(off + 32, true), loc = dv.getUint32(off + 42, true);
      const nombre = dec.decode(u8.subarray(off + 46, off + 46 + ln));
      const ini = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
      entradas.set(nombre, { metodo, datos: u8.subarray(ini, ini + comp) });
      off += 46 + ln + le + lc;
    }
    async function leer(nombre) {
      const e = entradas.get(nombre);
      if (!e) return null;
      if (e.metodo === 0) return e.datos;
      if (e.metodo !== 8) throw new Error("Compresión no soportada en " + nombre);
      if (typeof DecompressionStream === "undefined") throw new Error("Este navegador no puede abrir archivos .docx; actualízalo");
      const s = new Blob([e.datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(s).arrayBuffer());
    }
    return { entradas, leer, texto: async (nm) => { const b = await leer(nm); return b ? dec.decode(b) : null; } };
  }
  const RESALTE_WORD = { yellow: "#FFFF00", green: "#00FF00", cyan: "#00FFFF", magenta: "#FF00FF", blue: "#0000FF", red: "#FF0000", darkBlue: "#000080", darkCyan: "#008080",
    darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000", darkYellow: "#808000", darkGray: "#808080", lightGray: "#C0C0C0", black: "#000000" };

  /** .docx → { parrafos: [{ pa, tramos }], pagina, aviso }. */
  async function leerDocx(archivo) {
    if (archivo.size > 30 * 1024 * 1024) throw new Error("El archivo pesa más de 30 MB");
    const z = await abrirZip(await archivo.arrayBuffer());
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
    // estilos: id → nombre en inglés ("heading 1", "Title"…) y si es lista
    const estilos = {};
    const stTxt = await z.texto("word/styles.xml");
    if (stTxt) [...P(stTxt).getElementsByTagNameNS(W, "style")].forEach((s) => {
      const nm = (val(hijo(s, "name")) || "").toLowerCase();
      estilos[s.getAttributeNS(W, "styleId") || s.getAttribute("w:styleId")] = nm;
    });
    // numeración: numId → abstract → formato por nivel
    const formatoNum = {};
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
      if (c && /^[0-9a-f]{6}$/i.test(c)) a.color = "#" + c.toUpperCase();
      const h = val(hijo(rpr, "highlight"));
      if (h && RESALTE_WORD[h]) a.fondo = RESALTE_WORD[h];
      const shd = hijo(rpr, "shd");
      const fill = shd && (shd.getAttributeNS(W, "fill") || shd.getAttribute("w:fill"));
      if (fill && /^[0-9a-f]{6}$/i.test(fill)) a.fondo = "#" + fill.toUpperCase();
      const sz = val(hijo(rpr, "sz"));
      if (sz) a.tam = +sz / 2;
      const f = hijo(rpr, "rFonts");
      const fuente = f && (f.getAttributeNS(W, "ascii") || f.getAttribute("w:ascii") || f.getAttributeNS(W, "hAnsi"));
      if (fuente) a.fuente = fuente;
      Object.keys(a).forEach((k) => { if (a[k] == null || a[k] === false) delete a[k]; });
      return a;
    }
    async function runs(n, base, tramos, parrafo) {
      for (const r of hijos(n)) {
        const ln = r.localName;
        if (ln === "r") {
          const a = attrsRun(hijo(r, "rPr"), base);
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
              if (src) tramos.push({ e: { tipo: "imagen", src, w, h }, a: {} }); else aproximado = true;
            } else if (cn === "sym") tramos.push({ x: String.fromCharCode(parseInt(c.getAttributeNS(W, "char") || c.getAttribute("w:char") || "20", 16) & 0xFFF), a });
          }
        } else if (ln === "hyperlink") {
          const rid = r.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || r.getAttribute("r:id");
          const destino = rid && rels[rid];
          await runs(r, Object.assign({}, base, destino && /^(https?:|mailto:)/i.test(destino) ? { enlace: destino } : {}), tramos, parrafo);
        } else if (["ins", "smartTag", "fldSimple", "customXml", "sdt", "sdtContent", "bdo", "dir"].includes(ln)) await runs(r, base, tramos, parrafo);
      }
    }
    function attrsParrafo(ppr) {
      const pa = {};
      if (!ppr) return pa;
      const st = estilos[val(hijo(ppr, "pStyle"))] || "";
      if (/^heading 1$|^título 1$/.test(st)) pa.estilo = "h1";
      else if (/^heading 2$|^título 2$/.test(st)) pa.estilo = "h2";
      else if (/^heading [3-9]$|^título [3-9]$/.test(st)) pa.estilo = "h3";
      else if (st === "title" || st === "título") pa.estilo = "titulo";
      else if (st === "subtitle" || st === "subtítulo") pa.estilo = "subtitulo";
      else if (/quote|cita/.test(st)) pa.estilo = "cita";
      const np = hijo(ppr, "numPr");
      if (np) {
        const id = val(hijo(np, "numId")), lvl = +(val(hijo(np, "ilvl")) || 0);
        if (id && id !== "0") {
          const f = (formatoNum[id] || {})[lvl] || "bullet";
          pa.lista = f === "bullet" || f === "none" ? "vinetas" : "numeros";
          if (lvl) pa.nivel = Math.min(8, lvl);
        }
      } else if (/list/.test(st)) pa.lista = "vinetas";
      const jc = val(hijo(ppr, "jc"));
      if (jc) { const v = { center: "centro", right: "der", end: "der", both: "just", distribute: "just" }[jc]; if (v) pa.alin = v; }
      const ind = hijo(ppr, "ind");
      const izq = ind && +(ind.getAttributeNS(W, "left") || ind.getAttribute("w:left") || ind.getAttributeNS(W, "start") || 0);
      if (izq && !pa.lista && izq >= 360) pa.sangria = Math.min(10, Math.round(izq / 720)) || null;
      const sp = hijo(ppr, "spacing");
      if (sp) {
        const g = (k) => sp.getAttributeNS(W, k) || sp.getAttribute("w:" + k);
        const linea = +g("line"), regla = g("lineRule");
        if (linea && (!regla || regla === "auto")) { const v = Math.round((linea / 240) * 100) / 100; if (Math.abs(v - 1.15) > 0.04 && Math.abs(v - 1.08) > 0.03) pa.interlineado = v; }
        if (g("before") != null && g("before") !== "" && +g("before") > 0) pa.antes = Math.round(+g("before") / 20);
        if (g("after") != null && g("after") !== "" && +g("after") !== 160) pa.despues = Math.round(+g("after") / 20);
      }
      Object.keys(pa).forEach((k) => pa[k] == null && delete pa[k]);
      return pa;
    }
    async function bloque(n) {
      for (const c of hijos(n)) {
        if (c.localName === "p") {
          const ppr = hijo(c, "pPr"), pa = attrsParrafo(ppr), tramos = [], info = {};
          await runs(c, {}, tramos, info);
          if (info.salto && tramos.length) { parrafos.push({ pa, tramos }); parrafos.push({ pa: {}, tramos: [{ e: { tipo: "salto" } }] }); }
          else if (info.salto) parrafos.push({ pa: {}, tramos: [{ e: { tipo: "salto" } }] });
          else parrafos.push({ pa, tramos });
        } else if (c.localName === "tbl") {
          const filas = hijos(c, "tr"), celdas = {};
          let cols = 0;
          filas.forEach((tr, f) => {
            const tcs = hijos(tr, "tc");
            cols = Math.max(cols, tcs.length);
            tcs.forEach((tc, k) => { const t = hijos(tc, "p").map((p) => p.textContent).join("\n").trim(); if (t) celdas["c:" + F().ref(k, f)] = t; });
          });
          if (filas.length) parrafos.push({ pa: {}, tramos: [{ e: { tipo: "tabla", filas: filas.length, cols: Math.min(20, cols), celdas } }] });
        } else if (c.localName === "sdt") await bloque(hijo(c, "sdtContent"));
      }
    }
    await bloque(cuerpo);
    // Página
    const sect = cuerpo && hijo(cuerpo, "sectPr");
    let pagina = null;
    if (sect) {
      const sz = hijo(sect, "pgSz"), mg = hijo(sect, "pgMar"), g = (n, k) => +(n && (n.getAttributeNS(W, k) || n.getAttribute("w:" + k))) || 0;
      if (sz) {
        const w = g(sz, "w") / TWIP, h = g(sz, "h") / TWIP, hor = w > h;
        const lado = Math.min(w, h), largo = Math.max(w, h);
        const tam = Math.abs(lado - 794) < 8 && Math.abs(largo - 1123) < 8 ? "a4" : Math.abs(largo - 1344) < 10 ? "oficio" : "carta";
        pagina = { tam, orient: hor ? "h" : "v", margen: mg ? { s: Math.round(g(mg, "top") / TWIP), i: Math.round(g(mg, "bottom") / TWIP), iz: Math.round(g(mg, "left") / TWIP), d: Math.round(g(mg, "right") / TWIP) } : undefined };
      }
    }
    while (parrafos.length > 1 && !parrafos[parrafos.length - 1].tramos.length && !Object.keys(parrafos[parrafos.length - 1].pa).length) parrafos.pop();
    return { parrafos: parrafos.length ? parrafos : [{ pa: {}, tramos: [] }], pagina, aviso: aproximado ? "Algunos objetos de Word (formas, gráficos o imágenes vinculadas) no se pudieron importar" : null };
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

  function xlsx(doc) {
    const tablas = F().hojasDe(doc);
    if (!tablas.length) throw new Error("Este documento no tiene ninguna tabla");
    const nombres = [];
    // Estilos: cada combinación de letra, relleno, borde, número y alineación es un "xf".
    const fuentes = ['<font><sz val="11"/><name val="Calibri"/></font>'], rellenos = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const bordes = ["<border><left/><right/><top/><bottom/><diagonal/></border>"], numFmts = [], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    const idx = { fuente: { "": 0 }, relleno: { "": 0 }, borde: { "": 0 }, num: {}, xf: { "": 0 } };
    const dxfs = [];
    const registrar = (tipo, clave, lista, xml) => { if (idx[tipo][clave] == null) { lista.push(xml); idx[tipo][clave] = lista.length - 1; } return idx[tipo][clave]; };
    function numId(cod) {
      if (!cod || cod === "General") return 0;
      const cx = cod.replace(/aaaa/g, "yyyy").replace(/aa/g, "yy");
      if (NUMFMT_BASE[cx] != null) return NUMFMT_BASE[cx];
      if (idx.num[cx] == null) { const id = 164 + numFmts.length; numFmts.push(`<numFmt numFmtId="${id}" formatCode="${x(cx)}"/>`); idx.num[cx] = id; }
      return idx.num[cx];
    }
    function estilo(t, ref, esFecha) {
      const b = !!t["n:" + ref], i = !!t["i:" + ref], u = !!t["u:" + ref], k = argb(t["k:" + ref]), tl = +t["tl:" + ref] || 0;
      const kf = [b, i, u, k, tl].join("|");
      const fid = kf === "false|false|false|null|0" ? 0 : registrar("fuente", kf, fuentes, `<font>${b ? "<b/>" : ""}${i ? "<i/>" : ""}${u ? "<u/>" : ""}<sz val="${tl ? Math.round(tl * 1.0476 * 2) / 2 : 11}"/>${k ? `<color rgb="${k}"/>` : ""}<name val="Calibri"/></font>`);
      const r = argb(t["r:" + ref]);
      const rid = r ? registrar("relleno", r, rellenos, `<fill><patternFill patternType="solid"><fgColor rgb="${r}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const bd = String(t["bd:" + ref] || "").split("").sort().join("");
      const lado = (l, si) => (si ? `<${l} style="thin"><color auto="1"/></${l}>` : `<${l}/>`);
      const bid = bd ? registrar("borde", bd, bordes, `<border>${lado("left", bd.includes("i"))}${lado("right", bd.includes("d"))}${lado("top", bd.includes("a"))}${lado("bottom", bd.includes("b"))}<diagonal/></border>`) : 0;
      const nid = numId(t["f:" + ref] || (esFecha ? "dd/mm/yyyy" : null));
      const al = t["al:" + ref], aj = !!t["aj:" + ref], m = !!t["m:" + ref];
      const alin = al || aj || m ? `<alignment${al ? ` horizontal="${{ izq: "left", centro: "center", der: "right" }[al] || "general"}"` : ""}${m ? ' vertical="center"' : ""}${aj ? ' wrapText="1"' : ""}/>` : "";
      const kx = [fid, rid, bid, nid, alin].join("|");
      if (kx === "0|0|0|0|") return 0;
      return registrar("xf", kx, xfs, `<xf numFmtId="${nid}" fontId="${fid}" fillId="${rid}" borderId="${bid}" xfId="0"${fid ? ' applyFont="1"' : ""}${rid ? ' applyFill="1"' : ""}${bid ? ' applyBorder="1"' : ""}${nid ? ' applyNumberFormat="1"' : ""}${alin ? ' applyAlignment="1">' + alin + "</xf>" : "/>"}`);
    }
    function dxf(rg) {
      const k = argb(rg.color), f = argb(rg.fondo);
      dxfs.push(`<dxf>${k || rg.negrita ? `<font>${rg.negrita ? "<b/>" : ""}${k ? `<color rgb="${k}"/>` : ""}</font>` : ""}${f ? `<fill><patternFill><bgColor rgb="${f}"/></patternFill></fill>` : ""}</dxf>`);
      return dxfs.length - 1;
    }
    const graficasArch = [], dibujos = [], relsHojas = [];
    let prioridad = 1;
    const hojas = tablas.map((t, i) => {
      let n = F().nombreDeHoja(doc, t).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Hoja${i + 1}`;
      while (nombres.includes(n)) n = n.slice(0, 28) + " " + (i + 1);
      nombres.push(n);
      const ev = F().evaluadorDeTabla(doc, t);
      const porFila = {};
      const celdasCon = new Set();
      Object.keys(t).forEach((k) => {
        const i2 = k.indexOf(":");
        if (i2 < 1) return;
        const p = k.slice(0, i2), ref = k.slice(i2 + 1);
        if (!["c", "n", "i", "u", "k", "f", "r", "al", "aj", "bd", "tl", "m"].includes(p) || !/^[A-Z]{1,3}\d+$/.test(ref)) return;
        if (t[k] === "" || t[k] == null || t[k] === false) return;
        celdasCon.add(ref);
      });
      celdasCon.forEach((ref) => { const r = F().parseRef(ref); (porFila[r.f] = porFila[r.f] || []).push({ c: r.c, ref }); });
      const altoDe = (f) => +t["ah:" + (f + 1)] || 0;
      Object.keys(t).forEach((k) => { if (k.startsWith("ah:") && t[k]) { const f = +k.slice(3) - 1; porFila[f] = porFila[f] || []; } });
      const filas = Object.keys(porFila).map(Number).sort((a, b) => a - b).map((f) => {
        const celdas = porFila[f].sort((a, b) => a.c - b.c).map((c) => {
          const crudo = t["c:" + c.ref] == null ? "" : String(t["c:" + c.ref]);
          if (crudo.startsWith("=")) {
            const v = ev.valor(c.c, f), sx = estilo(t, c.ref, v instanceof F().FechaF), s = sx ? ` s="${sx}"` : "";
            const val = F().esNum(v) ? `<v>${+v}</v>` : typeof v === "boolean" ? `<v>${v ? 1 : 0}</v>` : v instanceof F().ErrorF ? `<v>${x(v.codigo)}</v>` : `<v>${x(v)}</v>`;
            const tipo = typeof v === "boolean" ? ' t="b"' : v instanceof F().ErrorF ? ' t="e"' : F().esNum(v) ? "" : ' t="str"';
            return `<c r="${c.ref}"${s}${tipo}><f>${x(formulaExcel(crudo))}</f>${val}</c>`;
          }
          const lit = crudo === "" ? "" : F().calcularLiteral(crudo.trim());
          const sx = estilo(t, c.ref, lit instanceof F().FechaF), s = sx ? ` s="${sx}"` : "";
          if (crudo === "") return `<c r="${c.ref}"${s}/>`;
          if (t["f:" + c.ref] === "@") return `<c r="${c.ref}"${s} t="inlineStr"><is><t xml:space="preserve">${x(crudo)}</t></is></c>`;
          return F().esNum(lit) ? `<c r="${c.ref}"${s}><v>${+lit}</v></c>` : `<c r="${c.ref}"${s} t="inlineStr"><is><t xml:space="preserve">${x(crudo)}</t></is></c>`;
        }).join("");
        const h = altoDe(f);
        return `<row r="${f + 1}"${h ? ` ht="${Math.round(h * 0.75 * 100) / 100}" customHeight="1"` : ""}>${celdas}</row>`;
      }).join("");
      const ncols = Math.max(t.cols || 10, 1);
      const cols = Array.from({ length: ncols }, (_, c) => `<col min="${c + 1}" max="${c + 1}" width="${px2ancho(+t["aw:" + F().colLetra(c)] || 120)}" customWidth="1"/>`).join("");
      const ff = +t.fijasF || 0, fc = +t.fijasC || 0;
      const vista = ff || fc ? `<sheetView workbookViewId="0"${i === 0 ? ' tabSelected="1"' : ""}><pane${fc ? ` xSplit="${fc}"` : ""}${ff ? ` ySplit="${ff}"` : ""} topLeftCell="${F().ref(fc, ff)}" activePane="${ff && fc ? "bottomRight" : ff ? "bottomLeft" : "topRight"}" state="frozen"/></sheetView>` : `<sheetView workbookViewId="0"${i === 0 ? ' tabSelected="1"' : ""}/>`;
      const combinadas = Object.keys(t).filter((k) => k.startsWith("m:") && /^\d+x\d+$/.test(String(t[k] || ""))).map((k) => {
        const r = F().parseRef(k.slice(2)), [w, h] = String(t[k]).split("x").map(Number);
        return w * h > 1 ? `<mergeCell ref="${F().ref(r.c, r.f)}:${F().ref(r.c + w - 1, r.f + h - 1)}"/>` : "";
      }).filter(Boolean);
      const reglas = Object.keys(t).filter((k) => k.startsWith("cf:") && t[k] && t[k].rango).map((k) => {
        const rg = t[k], primero = rg.rango.split(":")[0], d = dxf(rg);
        let regla;
        if (OPS_CF[rg.op]) regla = `<cfRule type="cellIs" dxfId="${d}" priority="${prioridad++}" operator="${OPS_CF[rg.op]}"><formula>${x(valorCf(rg.v1))}</formula>${rg.op === "entre" ? `<formula>${x(valorCf(rg.v2))}</formula>` : ""}</cfRule>`;
        else if (rg.op === "contiene") regla = `<cfRule type="containsText" dxfId="${d}" priority="${prioridad++}" operator="containsText" text="${x(rg.v1 || "")}"><formula>${x(`NOT(ISERROR(SEARCH("${String(rg.v1 || "").replace(/"/g, '""')}",${primero})))`)}</formula></cfRule>`;
        else if (rg.op === "vacia") regla = `<cfRule type="containsBlanks" dxfId="${d}" priority="${prioridad++}"><formula>${x(`LEN(TRIM(${primero}))=0`)}</formula></cfRule>`;
        else if (rg.op === "novacia") regla = `<cfRule type="notContainsBlanks" dxfId="${d}" priority="${prioridad++}"><formula>${x(`LEN(TRIM(${primero}))>0`)}</formula></cfRule>`;
        return regla ? `<conditionalFormatting sqref="${x(rg.rango)}">${regla}</conditionalFormatting>` : "";
      }).join("");
      const validaciones = Object.keys(t).filter((k) => k.startsWith("dv:") && t[k] && t[k].rango).map((k) => {
        const v = t[k], msg = v.mensaje ? ` showErrorMessage="1" error="${x(v.mensaje)}"` : ' showErrorMessage="1"';
        if (v.tipo === "lista") return `<dataValidation type="list" allowBlank="1"${msg} sqref="${x(v.rango)}"><formula1>${x('"' + (v.valores || []).join(",").slice(0, 250) + '"')}</formula1></dataValidation>`;
        if (v.tipo === "numero") {
          const a = v.min !== "" && v.min != null, b = v.max !== "" && v.max != null;
          if (!a && !b) return "";
          const op = a && b ? "between" : a ? "greaterThanOrEqual" : "lessThanOrEqual";
          return `<dataValidation type="decimal" operator="${op}" allowBlank="1"${msg} sqref="${x(v.rango)}"><formula1>${x(String(a ? v.min : v.max))}</formula1>${a && b ? `<formula2>${x(String(v.max))}</formula2>` : ""}</dataValidation>`;
        }
        return "";
      }).filter(Boolean);
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
          anclas.push(`<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${colIni}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fila0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${colIni + 8}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fila0 + 16}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${ng + 1}" name="Gráfica ${ng}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`);
          fila0 += 18;
        });
        if (anclas.length) {
          dibujos.push({ n: nd, xml: XML + `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anclas.join("")}</xdr:wsDr>`, rels: relsDibujo });
          relsHojas[i] = [{ id: "rIdD1", tipo: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing", destino: `../drawings/drawing${nd}.xml` }];
          dibujo = `<drawing r:id="rIdD1"/>`;
        }
      }
      return XML + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews>${vista}</sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${filas}</sheetData>${combinadas.length ? `<mergeCells count="${combinadas.length}">${combinadas.join("")}</mergeCells>` : ""}${reglas}${validaciones.length ? `<dataValidations count="${validaciones.length}">${validaciones.join("")}</dataValidations>` : ""}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${dibujo}</worksheet>`;
    });
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

  // ------------------------------------------------------------ importar Excel (.xlsx)
  const FMT_EXCEL = { 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 5: "$#,##0", 6: "$#,##0", 7: "$#,##0.00", 8: "$#,##0.00", 9: "0%", 10: "0.00%",
    14: "dd/mm/yyyy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "hh:mm", 21: "hh:mm:ss", 22: "dd/mm/yyyy hh:mm", 37: "#,##0", 38: "#,##0", 39: "#,##0.00", 40: "#,##0.00", 49: "@" };
  /** .xlsx → { hojas: [{ nombre, campos }], aviso }: cada hoja con sus celdas, formato, combinadas, anchos y filas fijas. */
  async function leerXlsx(archivo) {
    if (archivo.size > 30 * 1024 * 1024) throw new Error("El archivo pesa más de 30 MB");
    const z = await abrirZip(await archivo.arrayBuffer());
    const P = (t) => new DOMParser().parseFromString(t, "application/xml");
    const libro = await z.texto("xl/workbook.xml");
    if (!libro) throw new Error("El archivo no parece un libro de Excel (.xlsx)");
    const hijos = (n, nombre) => [...(n ? n.childNodes : [])].filter((c) => c.nodeType === 1 && (!nombre || c.localName === nombre));
    const hijo = (n, nombre) => hijos(n, nombre)[0] || null;
    const todos = (n, nombre) => (n ? [...n.getElementsByTagNameNS("*", nombre)] : []);
    const at = (n, a) => (n ? n.getAttribute(a) : null);
    const rels = P(await z.texto("xl/_rels/workbook.xml.rels") || "<Relationships/>");
    const destino = {};
    todos(rels, "Relationship").forEach((r) => (destino[at(r, "Id")] = at(r, "Target")));
    // Textos compartidos.
    const sst = await z.texto("xl/sharedStrings.xml");
    const textos = sst ? todos(P(sst), "si").map((si) => todos(si, "t").map((t) => t.textContent).join("")) : [];
    // Estilos.
    const est = P(await z.texto("xl/styles.xml") || "<styleSheet/>");
    const fmts = Object.assign({}, FMT_EXCEL);
    todos(est, "numFmt").forEach((n) => (fmts[+at(n, "numFmtId")] = at(n, "formatCode")));
    const color = (n) => { const rgb = at(n, "rgb"); return rgb && /^[0-9A-F]{8}$/i.test(rgb) ? "#" + rgb.slice(2).toUpperCase() : null; };
    const fuentes = todos(hijo(est.documentElement, "fonts"), "font").map((f) => ({ b: !!hijo(f, "b") && at(hijo(f, "b"), "val") !== "0", i: !!hijo(f, "i") && at(hijo(f, "i"), "val") !== "0", u: !!hijo(f, "u") && at(hijo(f, "u"), "val") !== "none", k: hijo(f, "color") ? color(hijo(f, "color")) : null, sz: hijo(f, "sz") ? +at(hijo(f, "sz"), "val") : 11 }));
    const rellenos = todos(hijo(est.documentElement, "fills"), "fill").map((f) => { const p = hijo(f, "patternFill"); return p && at(p, "patternType") === "solid" && hijo(p, "fgColor") ? color(hijo(p, "fgColor")) : null; });
    const bordes = todos(hijo(est.documentElement, "borders"), "border").map((b) => ["top", "bottom", "left", "right"].map((l, k) => (hijo(b, l) && at(hijo(b, l), "style") ? "abid"[k] : "")).join(""));
    const xfs = todos(hijo(est.documentElement, "cellXfs"), "xf").map((xf) => {
      const al = hijo(xf, "alignment");
      return { num: +at(xf, "numFmtId") || 0, fuente: fuentes[+at(xf, "fontId") || 0] || {}, relleno: rellenos[+at(xf, "fillId") || 0] || null, borde: bordes[+at(xf, "borderId") || 0] || "", al: al ? { left: "izq", center: "centro", centerContinuous: "centro", right: "der" }[at(al, "horizontal")] || null : null, aj: al ? at(al, "wrapText") === "1" : false };
    });
    const hojasXml = todos(P(libro), "sheet");
    let aviso = null;
    const MAX_F = 5000, MAX_C = 60;
    const res = [];
    for (const h of hojasXml.slice(0, 30)) {
      const nombre = at(h, "name") || "Hoja" + (res.length + 1);
      let ruta = destino[h.getAttribute("r:id") || h.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")] || "";
      ruta = ruta.startsWith("/") ? ruta.slice(1) : "xl/" + ruta.replace(/^\.\//, "");
      const xmlH = await z.texto(ruta);
      if (!xmlH) continue;
      const doc = P(xmlH);
      const campos = { nombre: nombre.slice(0, 31) };
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
      if (todos(doc, "drawing").length) aviso = aviso || "Las gráficas e imágenes del archivo no se importaron (puedes volver a crearlas desde los datos)";
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

  function pptx(doc, esDiagrama) {
    const medios = [];
    const paginas = doc.paginas().filter((p) => doc.deLaPagina(p).length || !esDiagrama);
    const diapos = paginas.map((p, n) => {
      // Lo oculto (capas) no se exporta, ni lo que quedó fuera de la diapositiva, en la mesa de trabajo.
      let bs = doc.deLaPagina(p).filter((b) => (b.x != null || b.tipo === "conector") && !b.oculto
        && (esDiagrama || b.tipo === "conector" || !(b.x + b.w <= 0 || b.y + b.h <= 0 || b.x >= ANCHO || b.y >= ALTO)));
      let k = 1, dx = 0, dy = 0;
      const conPos = bs.filter((b) => b.x != null);
      if (esDiagrama && conPos.length) {
        // El pizarrón no tiene bordes: se encuadra todo dentro de la diapositiva con 30 px de margen.
        const minX = Math.min(...conPos.map((b) => b.x)), minY = Math.min(...conPos.map((b) => b.y));
        const maxX = Math.max(...conPos.map((b) => b.x + b.w)), maxY = Math.max(...conPos.map((b) => b.y + b.h));
        k = Math.min(1, (ANCHO - 60) / (maxX - minX || 1), (ALTO - 60) / (maxY - minY || 1));
        dx = (ANCHO - (maxX - minX) * k) / 2 - minX * k; dy = (ALTO - (maxY - minY) * k) / 2 - minY * k;
      }
      const E = (v) => Math.round(v * EMU);
      const pos = (b) => `<a:xfrm${b.rot ? ` rot="${Math.round(b.rot * 60000)}"` : ""}${b.volteoH ? ' flipH="1"' : ""}${b.volteoV ? ' flipV="1"' : ""}><a:off x="${E(b.x * k + dx)}" y="${E(b.y * k + dy)}"/><a:ext cx="${E(Math.max(1, b.w) * k)}" cy="${E(Math.max(1, b.h) * k)}"/></a:xfrm>`;
      const alfa = (b) => (b.opacidad != null && b.opacidad < 1 ? `<a:alpha val="${Math.round(b.opacidad * 100000)}"/>` : "");
      const linea = (b, e) => !e.trazo ? "<a:ln><a:noFill/></a:ln>"
        : `<a:ln w="${Math.round(e.ancho * EMU * k)}"><a:solidFill><a:srgbClr val="${color(e.trazo, "2B2A33")}">${alfa(b)}</a:srgbClr></a:solidFill>${e.estilo === "guiones" ? '<a:prstDash val="dash"/>' : e.estilo === "puntos" ? '<a:prstDash val="sysDot"/>' : ""}${b.figura === "linea-flecha" ? '<a:tailEnd type="triangle"/>' : ""}</a:ln>`;
      const sombra = (b) => (b.sombra === true || (b.sombra == null && b.tipo === "forma" && !NOM.figuras.esLinea(b.figura))
        ? '<a:effectLst><a:outerShdw blurRad="63500" dist="38100" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="22000"/></a:srgbClr></a:outerShdw></a:effectLst>' : "");
      const GEO = { rect: "roundRect", elipse: "ellipse", rombo: "diamond", triangulo: "triangle", "triangulo-r": "rtTriangle", pentagono: "pentagon", hexagono: "hexagon", octagono: "octagon",
        estrella: "star5", corazon: "heart", nube: "cloud", burbuja: "wedgeRoundRectCallout", flecha: "rightArrow", "flecha-doble": "leftRightArrow", chevron: "chevron", cruz: "plus",
        paralelogramo: "flowChartInputOutput", trapecio: "trapezoid", cilindro: "can", documento: "flowChartDocument", nota: "foldedCorner", linea: "line", "linea-flecha": "line" };
      const rels = [{ id: "rId1", tipo: T.diseno, destino: "../slideLayouts/slideLayout1.xml" }];
      let id = 2;
      const parrafos = (html, tam, negrita, centro, opcT) => {
        opcT = opcT || {};
        const ps = String(html || "").split(/<br\s*\/?>|<\/p>|<\/div>/i);
        const algn = opcT.alin ? { izq: "l", centro: "ctr", der: "r" }[opcT.alin] : centro ? "ctr" : null;
        return ps.map((h) => `<a:p>${algn ? `<a:pPr algn="${algn}"/>` : ""}${tramos(h).filter((t) => !t.br).map((t) =>
          `<a:r><a:rPr lang="es-MX" sz="${Math.round(tam * k * 75)}" b="${t.b || negrita ? 1 : 0}" i="${t.i || opcT.i ? 1 : 0}"${t.u || opcT.u ? ' u="sng"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${opcT.color || "1F1E26"}"/></a:solidFill><a:latin typeface="${x(opcT.fuente || "Calibri")}"/></a:rPr><a:t>${x(t.t)}</a:t></a:r>`).join("")}</a:p>`).join("") || "<a:p/>";
      };
      const textoDe = (b, fondo) => ({ color: color(b.tColor, fondo && luzHex(fondo) < 0.5 ? "FFFFFF" : "1F1E26"), fuente: b.tFuente, alin: b.tAlin, i: b.tCursiva, u: b.tSubrayado });
      const porId = Object.fromEntries(conPos.map((b) => [b.id, b]));
      const figuras = bs.map((b) => {
        const nid = id++;
        if (b.tipo === "texto") {
          const tam = b.tTam ? b.tTam / 1.333 : b.estilo === "h1" ? 40 : b.estilo === "h2" ? 28 : 20;
          return `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="Texto ${nid}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${pos(b)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
<p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${parrafos(b.html, tam, b.tNegrita != null ? b.tNegrita : b.estilo === "h1" || b.estilo === "h2", false, textoDe(b))}</p:txBody></p:sp>`;
        }
        if (b.tipo === "forma") {
          const e = NOM.figuras.estiloFigura(b);
          const geo = GEO[e.f] || "roundRect";
          const av = geo === "roundRect" ? `<a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (e.radio / Math.max(1, Math.min(b.w, b.h))) * 100000))}"/>` : "";
          if (geo === "line") {
            return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${nid}" name="Línea ${nid}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${pos(Object.assign({}, b, { y: b.y + b.h / 2, h: 0 }))}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${linea(b, e)}</p:spPr></p:cxnSp>`;
          }
          const relleno = e.relleno ? `<a:solidFill><a:srgbClr val="${color(e.relleno, "CFE0FF")}">${alfa(b)}</a:srgbClr></a:solidFill>` : "<a:noFill/>";
          return `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="Figura ${nid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${pos(b)}<a:prstGeom prst="${geo}"><a:avLst>${av}</a:avLst></a:prstGeom>${relleno}${linea(b, e)}${sombra(b)}</p:spPr>
<p:txBody><a:bodyPr anchor="${e.f === "nota" ? "t" : "ctr"}" wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${parrafos(x(b.texto || ""), b.tTam ? b.tTam / 1.333 : 16, b.tNegrita !== false, e.f !== "nota", textoDe(b, e.relleno))}</p:txBody></p:sp>`;
        }
        if (b.tipo === "imagen") {
          const im = imagen(b.src);
          if (!im) return "";
          const m = medios.length + 1, rid = "rIdImg" + m;
          medios.push({ nombre: `ppt/media/imagen${m}.${im.ext}`, datos: im.bytes });
          rels.push({ id: rid, tipo: T.img, destino: `../media/imagen${m}.${im.ext}` });
          const e = { trazo: b.bordeAncho ? b.borde || "#2B2A33" : null, ancho: +b.bordeAncho || 0, estilo: b.bordeEstilo };
          return `<p:pic><p:nvPicPr><p:cNvPr id="${nid}" name="Imagen ${nid}" descr="${x(b.alt || "")}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}">${b.opacidad != null && b.opacidad < 1 ? `<a:alphaModFix amt="${Math.round(b.opacidad * 100000)}"/>` : ""}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${pos(b)}<a:prstGeom prst="${b.radio ? "roundRect" : "rect"}"><a:avLst>${b.radio ? `<a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (b.radio / Math.max(1, Math.min(b.w, b.h))) * 100000))}"/>` : ""}</a:avLst></a:prstGeom>${linea(b, e)}${b.sombra ? sombra(b) : ""}</p:spPr></p:pic>`;
        }
        if (b.tipo === "tabla") {
          const filas = tablaVisible(b);
          if (!filas.length) return "";
          const ancho = E(b.w * k), alto = E(Math.max(1, b.h) * k), cols = filas[0].length;
          return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${nid}" name="Tabla ${nid}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>
<p:xfrm><a:off x="${E(b.x * k + dx)}" y="${E(b.y * k + dy)}"/><a:ext cx="${ancho}" cy="${alto}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/>
<a:tblGrid>${`<a:gridCol w="${Math.floor(ancho / cols)}"/>`.repeat(cols)}</a:tblGrid>${filas.map((f) => `<a:tr h="${Math.floor(alto / filas.length)}">${f.map((v) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="es-MX" sz="${Math.round(14 * k * 100)}" dirty="0"/><a:t>${x(v)}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`).join("")}</a:tr>`).join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
        }
        if (b.tipo === "conector" && porId[b.desde] && porId[b.hasta]) {
          const c = NOM.geometria.conector(porId[b.desde], porId[b.hasta]);
          const x1 = c.x1 * k + dx, y1 = c.y1 * k + dy, x2 = c.x2 * k + dx, y2 = c.y2 * k + dy;
          return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${nid}" name="Conector ${nid}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${x2 < x1 ? ' flipH="1"' : ""}${y2 < y1 ? ' flipV="1"' : ""}><a:off x="${E(Math.min(x1, x2))}" y="${E(Math.min(y1, y2))}"/><a:ext cx="${E(Math.abs(x2 - x1))}" cy="${E(Math.abs(y2 - y1))}"/></a:xfrm>
<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="4A4854"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>`;
        }
        return "";
      }).join("\n");
      return { rels, xml: XML + `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${figuras}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>` };
    });
    if (!diapos.length) throw new Error("No hay nada que exportar");
    const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const arbolVacio = '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>';
    const presentacion = XML + `<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdM"/></p:sldMasterIdLst>
<p:sldIdLst>${diapos.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${ANCHO * EMU}" cy="${ALTO * EMU}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
    const maestro = XML + `<p:sldMaster ${NS}>${arbolVacio}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
    const diseno = XML + `<p:sldLayout ${NS} type="blank" preserve="1">${arbolVacio}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
    return zip([
      { nombre: "[Content_Types].xml", datos: CT(`<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${diapos.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}`) },
      { nombre: "_rels/.rels", datos: RELS([{ tipo: T.doc, destino: "ppt/presentation.xml" }]) },
      { nombre: "ppt/presentation.xml", datos: presentacion },
      { nombre: "ppt/_rels/presentation.xml.rels", datos: RELS([...diapos.map((_, i) => ({ id: "rId" + (i + 1), tipo: T.diapo, destino: `slides/slide${i + 1}.xml` })),
        { id: "rIdM", tipo: T.maestro, destino: "slideMasters/slideMaster1.xml" }, { id: "rIdT", tipo: T.tema, destino: "theme/theme1.xml" }]) },
      { nombre: "ppt/slideMasters/slideMaster1.xml", datos: maestro },
      { nombre: "ppt/slideMasters/_rels/slideMaster1.xml.rels", datos: RELS([{ tipo: T.diseno, destino: "../slideLayouts/slideLayout1.xml" }, { tipo: T.tema, destino: "../theme/theme1.xml" }]) },
      { nombre: "ppt/slideLayouts/slideLayout1.xml", datos: diseno },
      { nombre: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", datos: RELS([{ tipo: T.maestro, destino: "../slideMasters/slideMaster1.xml" }]) },
      { nombre: "ppt/theme/theme1.xml", datos: tema() },
      ...diapos.flatMap((d, i) => [{ nombre: `ppt/slides/slide${i + 1}.xml`, datos: d.xml }, { nombre: `ppt/slides/_rels/slide${i + 1}.xml.rels`, datos: RELS(d.rels) }]),
      ...medios,
    ]);
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

  NOM.ooxml = { zip, docx, xlsx, pptx, formulaExcel, crc32, leerDocx, leerXlsx, abrirZip };
})();
