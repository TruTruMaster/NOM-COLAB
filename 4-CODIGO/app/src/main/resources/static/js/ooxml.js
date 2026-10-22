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
    Y: "AND", O: "OR", NO: "NOT", REDONDEAR: "ROUND", RAIZ: "SQRT", POTENCIA: "POWER", CONCATENAR: "CONCATENATE", MAYUSC: "UPPER", MINUSC: "LOWER", LARGO: "LEN" };
  function formulaExcel(f) {
    let r = "", enTexto = false;
    const s = f.replace(/^=/, "");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') { enTexto = !enTexto; r += c; continue; }
      if (enTexto) { r += c; continue; }
      if (c === ";") { r += ","; continue; }
      const m = /^[A-Za-zÁÉÍÓÚÑáéíóúñ_][A-Za-z0-9ÁÉÍÓÚÑáéíóúñ_.]*(?=\s*\()/.exec(s.slice(i));
      if (m) { const n = m[0].toUpperCase(); r += EN[n] || n; i += m[0].length - 1; continue; }
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
    const ligera = '<w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:ascii="Calibri Light" w:hAnsi="Calibri Light"/>';
    const estilos = XML + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="es-MX"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
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
  function xlsx(doc) {
    const tablas = doc.vivos().filter((b) => b.tipo === "tabla");
    if (!tablas.length) throw new Error("Este documento no tiene ninguna tabla");
    const pags = doc.paginas();
    tablas.sort((a, b) => pags.indexOf(a.pagina) - pags.indexOf(b.pagina) || (a.orden || 0) - (b.orden || 0));
    const nombres = [];
    const hojas = tablas.map((t, i) => {
      let n = String(t.nombre || doc.valor("_doc", "hojas") && doc.valor("_doc", "hojas")[t.pagina] || `Hoja ${i + 1}`).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Hoja ${i + 1}`;
      while (nombres.includes(n)) n = (n.slice(0, 28) + " " + (i + 1));
      nombres.push(n);
      const ev = F().evaluador((c, f) => t["c:" + F().ref(c, f)]);
      const porFila = {};
      Object.keys(t).forEach((k) => {
        if (!k.startsWith("c:") || t[k] === "" || t[k] == null) return;
        const r = F().parseRef(k.slice(2)); if (!r) return;
        (porFila[r.f] = porFila[r.f] || []).push({ c: r.c, ref: k.slice(2), crudo: String(t[k]) });
      });
      const filas = Object.keys(porFila).map(Number).sort((a, b) => a - b).map((f) => {
        const celdas = porFila[f].sort((a, b) => a.c - b.c).map((c) => {
          const s = t["n:" + c.ref] ? ' s="1"' : "";
          if (c.crudo.startsWith("=")) {
            const v = ev.valor(c.c, f);
            const val = typeof v === "number" ? `<v>${v}</v>` : typeof v === "boolean" ? `<v>${v ? 1 : 0}</v>` : "";
            const tipo = typeof v === "string" ? ' t="str"' : typeof v === "boolean" ? ' t="b"' : "";
            return `<c r="${c.ref}"${s}${tipo}><f>${x(formulaExcel(c.crudo))}</f>${typeof v === "string" ? `<v>${x(v)}</v>` : val}</c>`;
          }
          const n = /^-?\d+([.,]\d+)?$/.test(c.crudo.trim()) ? parseFloat(c.crudo.replace(",", ".")) : null;
          return n != null ? `<c r="${c.ref}"${s}><v>${n}</v></c>` : `<c r="${c.ref}"${s} t="inlineStr"><is><t xml:space="preserve">${x(c.crudo)}</t></is></c>`;
        }).join("");
        return `<row r="${f + 1}">${celdas}</row>`;
      }).join("");
      return XML + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="26" width="14" customWidth="1"/></cols><sheetData>${filas}</sheetData></worksheet>`;
    });
    const libro = XML + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${x(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
    const estilos = XML + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const relsLibro = [...hojas.map((_, i) => ({ id: "rId" + (i + 1), tipo: T.hoja, destino: `worksheets/hoja${i + 1}.xml` })),
      { id: "rIdEst", tipo: T.estilos, destino: "styles.xml" }];
    return zip([
      { nombre: "[Content_Types].xml", datos: CT(`<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hojas.map((_, i) => `<Override PartName="/xl/worksheets/hoja${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}`) },
      { nombre: "_rels/.rels", datos: RELS([{ tipo: T.doc, destino: "xl/workbook.xml" }]) },
      { nombre: "xl/workbook.xml", datos: libro },
      { nombre: "xl/styles.xml", datos: estilos },
      { nombre: "xl/_rels/workbook.xml.rels", datos: RELS(relsLibro) },
      ...hojas.map((h, i) => ({ nombre: `xl/worksheets/hoja${i + 1}.xml`, datos: h })),
    ]);
  }

  // ------------------------------------------------------------ PowerPoint (.pptx)
  const ANCHO = 960, ALTO = 540;
  const color = (c, def) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c.slice(1).toUpperCase() : def);
  const luzHex = (c) => { const n = parseInt(String(c).replace("#", ""), 16) || 0; return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

  function pptx(doc, esDiagrama) {
    const medios = [];
    const paginas = doc.paginas().filter((p) => doc.deLaPagina(p).length || !esDiagrama);
    const diapos = paginas.map((p, n) => {
      let bs = doc.deLaPagina(p).filter((b) => b.x != null || b.tipo === "conector");
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
          `<a:r><a:rPr lang="es-MX" sz="${Math.round(tam * k * 75)}" b="${t.b || negrita ? 1 : 0}" i="${t.i ? 1 : 0}"${t.u ? ' u="sng"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${opcT.color || "1F1E26"}"/></a:solidFill><a:latin typeface="${x(opcT.fuente || "Calibri")}"/></a:rPr><a:t>${x(t.t)}</a:t></a:r>`).join("")}</a:p>`).join("") || "<a:p/>";
      };
      const textoDe = (b, fondo) => ({ color: color(b.tColor, fondo && luzHex(fondo) < 0.5 ? "FFFFFF" : "1F1E26"), fuente: b.tFuente, alin: b.tAlin });
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

  NOM.ooxml = { zip, docx, xlsx, pptx, formulaExcel, crc32, leerDocx, abrirZip };
})();
