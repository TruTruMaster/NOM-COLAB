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
    `<Relationship Id="${r.id || "rId" + (i + 1)}" Type="${r.tipo}" Target="${x(r.destino)}"/>`).join("")}</Relationships>`;
  const T = { doc: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
    img: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    estilos: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
    num: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",
    hoja: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
    diapo: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
    maestro: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster",
    diseno: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout",
    tema: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" };
  const EMU = 9525;   // 1 px a 96 ppp

  // ------------------------------------------------------------ Word (.docx)
  function docx(doc) {
    const medios = [], rels = [{ id: "rIdEst", tipo: T.estilos, destino: "styles.xml" }, { id: "rIdNum", tipo: T.num, destino: "numbering.xml" }];
    const run = (t) => t.br ? "<w:r><w:br/></w:r>"
      : `<w:r><w:rPr>${t.b ? "<w:b/>" : ""}${t.i ? "<w:i/>" : ""}${t.u ? '<w:u w:val="single"/>' : ""}</w:rPr><w:t xml:space="preserve">${x(t.t)}</w:t></w:r>`;
    const parrafo = (estilo, contenido, extra) => `<w:p><w:pPr>${estilo ? `<w:pStyle w:val="${estilo}"/>` : ""}${extra || ""}</w:pPr>${contenido}</w:p>`;
    const cuerpo = ordenados(doc).map((b) => {
      if (b.tipo === "texto") {
        const runs = tramos(b.html).map(run).join("");
        if (b.estilo === "h1") return parrafo("Titulo1", runs);
        if (b.estilo === "h2") return parrafo("Titulo2", runs);
        if (b.estilo === "cita") return parrafo("Cita", runs);
        if (b.estilo === "lista") return parrafo("Lista", runs, '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
        if (b.estilo === "tarea") return parrafo(null, run({ t: (b.hecho ? "☑ " : "☐ ") }) + runs);
        return parrafo(null, runs);
      }
      if (b.tipo === "tabla") {
        const filas = tablaVisible(b);
        if (!filas.length) return "";
        const cols = filas[0].length;
        return `<w:tbl><w:tblPr><w:tblStyle w:val="Tabla"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((l) => `<w:${l} w:val="single" w:sz="4" w:color="BFBFBF"/>`).join("")}</w:tblBorders></w:tblPr>
<w:tblGrid>${'<w:gridCol w:w="2000"/>'.repeat(cols)}</w:tblGrid>${filas.map((f) => `<w:tr>${f.map((v) => `<w:tc><w:p><w:r><w:t xml:space="preserve">${x(v)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>${parrafo(null, "")}`;
      }
      if (b.tipo === "imagen") {
        const im = imagen(b.src);
        if (!im) return "";
        const n = medios.length + 1, id = "rIdImg" + n;
        medios.push({ nombre: `word/media/imagen${n}.${im.ext}`, datos: im.bytes });
        rels.push({ id, tipo: T.img, destino: `media/imagen${n}.${im.ext}` });
        const k = Math.min(1, 600 / im.w), cx = Math.round(im.w * k * EMU), cy = Math.round(im.h * k * EMU);
        return parrafo(null, `<w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Imagen ${n}" descr="${x(b.alt || "")}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="imagen${n}"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`);
      }
      if (b.tipo === "forma") return parrafo(null, run({ t: b.texto || "" }));
      return "";
    }).join("\n");
    const documento = XML + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>${cuerpo || parrafo(null, "")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const estilo = (id, nombre, rpr, ppr) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${nombre}"/><w:basedOn w:val="Normal"/><w:qFormat/>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}<w:rPr>${rpr}</w:rPr></w:style>`;
    const estilos = XML + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:lang w:val="es-MX"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${estilo("Titulo1", "heading 1", '<w:b/><w:sz w:val="40"/><w:color w:val="1F1E26"/>', '<w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/>')}
${estilo("Titulo2", "heading 2", '<w:b/><w:sz w:val="30"/><w:color w:val="1F1E26"/>', '<w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/>')}
${estilo("Cita", "Quote", '<w:i/><w:color w:val="555555"/>', '<w:ind w:left="567"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="3D72F2"/></w:pBdr>')}
${estilo("Lista", "List Paragraph", "", '<w:ind w:left="720"/><w:spacing w:after="60"/>')}
<w:style w:type="table" w:styleId="Tabla"><w:name w:val="Table Grid"/><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
    const numeracion = XML + `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
    return zip([
      { nombre: "[Content_Types].xml", datos: CT(`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>`) },
      { nombre: "_rels/.rels", datos: RELS([{ tipo: T.doc, destino: "word/document.xml" }]) },
      { nombre: "word/document.xml", datos: documento },
      { nombre: "word/styles.xml", datos: estilos },
      { nombre: "word/numbering.xml", datos: numeracion },
      { nombre: "word/_rels/document.xml.rels", datos: RELS(rels) },
      ...medios,
    ]);
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
      const pos = (b) => `<a:xfrm><a:off x="${E(b.x * k + dx)}" y="${E(b.y * k + dy)}"/><a:ext cx="${E(Math.max(1, b.w) * k)}" cy="${E(Math.max(1, b.h) * k)}"/></a:xfrm>`;
      const rels = [{ id: "rId1", tipo: T.diseno, destino: "../slideLayouts/slideLayout1.xml" }];
      let id = 2;
      const parrafos = (html, tam, negrita, centro) => {
        const ps = String(html || "").split(/<br\s*\/?>|<\/p>|<\/div>/i);
        return ps.map((h) => `<a:p>${centro ? '<a:pPr algn="ctr"/>' : ""}${tramos(h).filter((t) => !t.br).map((t) =>
          `<a:r><a:rPr lang="es-MX" sz="${Math.round(tam * k * 75)}" b="${t.b || negrita ? 1 : 0}" i="${t.i ? 1 : 0}"${t.u ? ' u="sng"' : ""} dirty="0"><a:solidFill><a:srgbClr val="1F1E26"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${x(t.t)}</a:t></a:r>`).join("")}</a:p>`).join("") || "<a:p/>";
      };
      const porId = Object.fromEntries(conPos.map((b) => [b.id, b]));
      const figuras = bs.map((b) => {
        const nid = id++;
        if (b.tipo === "texto") {
          const tam = b.estilo === "h1" ? 40 : b.estilo === "h2" ? 28 : 20;
          return `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="Texto ${nid}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${pos(b)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
<p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${parrafos(b.html, tam, b.estilo === "h1" || b.estilo === "h2")}</p:txBody></p:sp>`;
        }
        if (b.tipo === "forma") {
          const geo = { elipse: "ellipse", rombo: "diamond", nota: "rect" }[b.figura] || "roundRect";
          return `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="Figura ${nid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${pos(b)}<a:prstGeom prst="${geo}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color(b.color, "CFE0FF")}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>
<p:txBody><a:bodyPr anchor="ctr" wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${parrafos(x(b.texto || ""), 16, true, true)}</p:txBody></p:sp>`;
        }
        if (b.tipo === "imagen") {
          const im = imagen(b.src);
          if (!im) return "";
          const m = medios.length + 1, rid = "rIdImg" + m;
          medios.push({ nombre: `ppt/media/imagen${m}.${im.ext}`, datos: im.bytes });
          rels.push({ id: rid, tipo: T.img, destino: `../media/imagen${m}.${im.ext}` });
          return `<p:pic><p:nvPicPr><p:cNvPr id="${nid}" name="Imagen ${nid}" descr="${x(b.alt || "")}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${pos(b)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
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

  NOM.ooxml = { zip, docx, xlsx, pptx, formulaExcel, crc32 };
})();
