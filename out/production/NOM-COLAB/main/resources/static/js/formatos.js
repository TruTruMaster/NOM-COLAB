/* NOM-COLAB · ConversorFormato del lado del cliente (CU-28 importar, CU-29 exportar).
   El editor nunca conoce un formato de archivo: todo entra y sale como bloques. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const F = () => NOM.formulas;

  const IMPORTABLES = [".nom", ".json", ".md", ".txt", ".csv", ".tsv", ".html", ".htm"];
  const MAX_BYTES = 10 * 1024 * 1024;

  // ------------------------------------------------------------ utilidades
  const textoPlano = (h) => { const d = document.createElement("div"); d.innerHTML = h || ""; return d.textContent || ""; };
  function descargar(nombre, mime, contenido) {
    if (window.NomAndroid && window.NomAndroid.guardarArchivo) {
      const b64 = btoa(unescape(encodeURIComponent(contenido)));
      window.NomAndroid.guardarArchivo(nombre, mime, b64);
      return;
    }
    const url = URL.createObjectURL(new Blob([contenido], { type: mime + ";charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  /** Para archivos binarios (.docx, .xlsx, .pptx, .png). */
  function descargarBytes(nombre, mime, bytes) {
    if (window.NomAndroid && window.NomAndroid.guardarArchivo) {
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      window.NomAndroid.guardarArchivo(nombre, mime, btoa(bin));
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const MIME = {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  const limpioNombre = (s) => String(s || "documento").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);

  function ordenados(doc) {
    const pags = doc.paginas();
    return pags.flatMap((p) => doc.deLaPagina(p).map((b) => Object.assign(b, { _pag: pags.indexOf(p) })));
  }

  function celdasDe(b) {
    const ev = F().evaluador((c, f) => b["c:" + F().ref(c, f)]);
    let maxF = 0, maxC = 0;
    Object.keys(b).forEach((k) => {
      if (!k.startsWith("c:") || b[k] === "" || b[k] == null) return;
      const r = F().parseRef(k.slice(2)); if (!r) return;
      maxF = Math.max(maxF, r.f + 1); maxC = Math.max(maxC, r.c + 1);
    });
    const filas = [];
    for (let f = 0; f < maxF; f++) {
      const fila = [];
      for (let c = 0; c < maxC; c++) fila.push(F().formatear(ev.valor(c, f)));
      filas.push(fila);
    }
    return filas;
  }

  // ------------------------------------------------------------ exportar
  function aHtml(doc, nombre) {
    const partes = ordenados(doc).map((b) => {
      if (b.tipo === "texto") {
        const tag = { h1: "h1", h2: "h2", cita: "blockquote" }[b.estilo] || "p";
        if (b.estilo === "lista") return `<ul><li>${b.html || ""}</li></ul>`;
        if (b.estilo === "tarea") return `<p>${b.hecho ? "☑" : "☐"} ${b.html || ""}</p>`;
        return `<${tag}>${b.html || ""}</${tag}>`;
      }
      if (b.tipo === "tabla") return "<table>" + celdasDe(b).map((r) => "<tr>" + r.map((v) => `<td>${NOM.esc(v)}</td>`).join("") + "</tr>").join("") + "</table>";
      if (b.tipo === "imagen") return `<p><img src="${NOM.esc(b.src)}" alt="${NOM.esc(b.alt || "")}"></p>`;
      if (b.tipo === "forma") return `<p><em>[${NOM.esc(b.figura)}]</em> ${NOM.esc(b.texto || "")}</p>`;
      return "";
    }).join("\n").replace(/<\/ul>\n<ul>/g, "\n");
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${NOM.esc(nombre)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1rem;line-height:1.7;color:#222}table{border-collapse:collapse}td{border:1px solid #ccc;padding:.3rem .6rem}blockquote{border-left:4px solid #3D72F2;margin:0;padding-left:1rem;color:#555}img{max-width:100%}</style>
</head><body>
${partes}
</body></html>`;
  }

  function aMarkdown(doc) {
    return ordenados(doc).map((b) => {
      const t = textoPlano((b.html || "").replace(/<b>|<\/b>|<strong>|<\/strong>/g, "**").replace(/<i>|<\/i>|<em>|<\/em>/g, "_"));
      if (b.tipo === "texto") {
        return { h1: "# " + t, h2: "## " + t, cita: "> " + t, lista: "- " + t, tarea: (b.hecho ? "- [x] " : "- [ ] ") + t }[b.estilo] || t;
      }
      if (b.tipo === "tabla") {
        const filas = celdasDe(b);
        if (!filas.length) return "";
        const sep = "|" + filas[0].map(() => " --- ").join("|") + "|";
        return [filas[0], ...filas.slice(1)].map((r, i) => "| " + r.join(" | ") + " |" + (i === 0 ? "\n" + sep : "")).join("\n");
      }
      if (b.tipo === "forma") return `- ${b.texto || ""}`;
      if (b.tipo === "imagen") return `![${b.alt || "imagen"}](imagen-incrustada)`;
      return "";
    }).filter((x, i, a) => x !== "" || (a[i - 1] !== "")).join("\n\n").replace(/\n\n(- )/g, "\n$1") + "\n";
  }

  function aCsv(doc, pagina) {
    const t = doc.deLaPagina(pagina).find((b) => b.tipo === "tabla") || doc.vivos().find((b) => b.tipo === "tabla");
    if (!t) return null;
    return celdasDe(t).map((r) => r.map((v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)).join(",")).join("\r\n") + "\r\n";
  }

  function aSvg(doc, pagina) {
    const bs = doc.deLaPagina(pagina).filter((b) => b.x != null);
    if (!bs.length) return null;
    const minX = Math.min(...bs.map((b) => b.x)) - 40, minY = Math.min(...bs.map((b) => b.y)) - 40;
    const maxX = Math.max(...bs.map((b) => b.x + b.w)) + 40, maxY = Math.max(...bs.map((b) => b.y + b.h)) + 40;
    const porId = Object.fromEntries(bs.map((b) => [b.id, b]));
    const lineas = doc.deLaPagina(pagina).filter((b) => b.tipo === "conector" && porId[b.desde] && porId[b.hasta]).map((c) => {
      const p = NOM.geometria.conector(porId[c.desde], porId[c.hasta]);
      return `<path d="M${p.x1},${p.y1} L${p.x2},${p.y2}" stroke="#4A4854" stroke-width="2" fill="none" marker-end="url(#f)"/>`;
    });
    const formas = bs.map((b) => {
      const col = b.color || "#E7E5EE";
      let fig;
      if (b.tipo === "forma" && b.figura === "elipse") fig = `<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" fill="${col}"/>`;
      else if (b.tipo === "forma" && b.figura === "rombo") fig = `<polygon points="${b.x + b.w / 2},${b.y} ${b.x + b.w},${b.y + b.h / 2} ${b.x + b.w / 2},${b.y + b.h} ${b.x},${b.y + b.h / 2}" fill="${col}"/>`;
      else if (b.tipo === "forma") fig = `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.figura === "nota" ? 4 : 14}" fill="${col}"/>`;
      else if (b.tipo === "imagen") fig = `<image href="${NOM.esc(b.src)}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`;
      else fig = "";
      const txt = b.tipo === "forma" ? b.texto : b.tipo === "texto" ? textoPlano(b.html) : "";
      return fig + (txt ? `<text x="${b.x + b.w / 2}" y="${b.y + b.h / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Nunito, sans-serif" font-size="${b.tipo === "texto" ? 22 : 16}" font-weight="700" fill="#1f1e26">${NOM.esc(txt)}</text>` : "");
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}">
<defs><marker id="f" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4A4854"/></marker></defs>
<rect x="${minX}" y="${minY}" width="100%" height="100%" fill="#fff"/>
${lineas.join("\n")}
${formas.join("\n")}
</svg>`;
  }

  function aNom(doc) {
    const bloques = {};
    for (const id in doc.estado.bloques) if (id === "_doc" || doc.vivo(id)) bloques[id] = doc.bloque(id);
    return JSON.stringify({ formato: "nom-colab", version: 1, exportado: new Date().toISOString(), bloques }, null, 1);
  }

  const EXPORTABLES = [
    { id: "docx", nombre: "Word (.docx)", desc: "Se abre en Word, Google Docs o LibreOffice Writer", icono: "file-text" },
    { id: "xlsx", nombre: "Excel (.xlsx)", desc: "Con fórmulas: Excel, Google Sheets o LibreOffice Calc", icono: "sheet" },
    { id: "pptx", nombre: "PowerPoint (.pptx)", desc: "Se abre en PowerPoint, Google Slides o LibreOffice Impress", icono: "presentation" },
    { id: "png", nombre: "Imagen (.png)", desc: "El diagrama de esta página como imagen", icono: "image" },
    { id: "nom", nombre: "NOM-COLAB (.nom)", desc: "Sin pérdida: se vuelve a importar tal cual", icono: "layers" },
    { id: "html", nombre: "Página web (.html)", desc: "Para abrir en cualquier navegador", icono: "file-text" },
    { id: "md", nombre: "Markdown (.md)", desc: "Texto plano con formato ligero", icono: "type" },
    { id: "csv", nombre: "CSV (.csv)", desc: "La tabla, para Excel o LibreOffice Calc", icono: "sheet" },
    { id: "svg", nombre: "Imagen vectorial (.svg)", desc: "El diagrama de esta página", icono: "workflow" },
    { id: "pdf", nombre: "PDF (imprimir)", desc: "Usa el diálogo de impresión del sistema", icono: "download" },
  ];

  /** Formatos que tienen sentido para cada tipo de documento, el de Office primero. */
  const POR_TIPO = {
    TEXTO: ["docx", "pdf", "html", "md", "nom"],
    HOJA: ["xlsx", "csv", "pdf", "html", "nom"],
    PRESENTACION: ["pptx", "pdf", "nom"],
    DIAGRAMA: ["pptx", "png", "svg", "pdf", "nom"],
  };
  const paraTipo = (tipo) => (POR_TIPO[tipo] || POR_TIPO.TEXTO).map((id) => EXPORTABLES.find((f) => f.id === id));

  function aPng(svg) {
    return new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(2, 4000 / Math.max(img.width, img.height));
        const cv = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob((b) => b ? b.arrayBuffer().then((a) => ok(new Uint8Array(a))) : mal(new Error("No se pudo crear la imagen")), "image/png");
      };
      img.onerror = () => mal(new Error("No se pudo crear la imagen"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }

  /** Devuelve un aviso si algo se aproximó (CU-29 3a), o lanza si no hay qué exportar. */
  function exportar(doc, formato, nombre, pagina, opcTipo) {
    const base = limpioNombre(nombre);
    switch (formato) {
      case "nom": descargar(base + ".nom", "application/json", aNom(doc)); return null;
      case "docx": descargarBytes(base + ".docx", MIME.docx, NOM.ooxml.docx(doc)); return hayLibres(doc, ["conector"]) ? "Las flechas no se incluyen en Word" : null;
      case "xlsx": descargarBytes(base + ".xlsx", MIME.xlsx, NOM.ooxml.xlsx(doc)); return null;
      case "pptx": descargarBytes(base + ".pptx", MIME.pptx, NOM.ooxml.pptx(doc, (doc.valor("_doc", "modo") || "") === "DIAGRAMA" || opcTipo === "DIAGRAMA")); return null;
      case "png": {
        const s = aSvg(doc, pagina);
        if (!s) throw new Error("Esta página no tiene figuras para exportar");
        aPng(s).then((b) => descargarBytes(base + ".png", "image/png", b)).catch((e) => NOM.aviso(e.message, { tipo: "error" }));
        return null;
      }
      case "html": descargar(base + ".html", "text/html", aHtml(doc, nombre)); return hayLibres(doc, ["forma", "conector"]) ? "Las figuras se exportaron como texto" : null;
      case "md": descargar(base + ".md", "text/markdown", aMarkdown(doc)); return hayLibres(doc, ["imagen", "forma"]) ? "Las imágenes y figuras se aproximaron en Markdown" : null;
      case "csv": {
        const c = aCsv(doc, pagina);
        if (!c) throw new Error("Este documento no tiene ninguna tabla");
        descargar(base + ".csv", "text/csv", c);
        return "Se exportaron los valores calculados (sin fórmulas)";
      }
      case "svg": {
        const s = aSvg(doc, pagina);
        if (!s) throw new Error("Esta página no tiene figuras para exportar");
        descargar(base + ".svg", "image/svg+xml", s);
        return null;
      }
      case "pdf": setTimeout(() => window.print(), 80); return null;
      default: throw new Error("Formato no soportado");
    }
  }
  const hayLibres = (doc, tipos) => doc.vivos().some((b) => tipos.includes(b.tipo));

  // ------------------------------------------------------------ importar
  function parseCsv(texto, sep) {
    const filas = []; let fila = [], campo = "", comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (comillas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') comillas = false;
        else campo += c;
      } else if (c === '"') comillas = true;
      else if (c === sep) { fila.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && texto[i + 1] === "\n") i++;
        fila.push(campo); filas.push(fila); fila = []; campo = "";
      } else campo += c;
    }
    if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }
  const inline = (s) => NOM.esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^\w])_(.+?)_(?=$|[^\w])/g, "$1<i>$2</i>");

  function bloquesTexto(lineas) {
    const bs = []; let orden = 1, aproximado = false;
    lineas.forEach((l) => {
      let m;
      const b = { id: NOM.DocCRDT.nuevoId(), tipo: "texto", pagina: "p1", orden: orden++, estilo: "p", html: "" };
      if ((m = /^#\s+(.*)/.exec(l))) { b.estilo = "h1"; b.html = inline(m[1]); }
      else if ((m = /^#{2,6}\s+(.*)/.exec(l))) { b.estilo = "h2"; b.html = inline(m[1]); }
      else if ((m = /^>\s?(.*)/.exec(l))) { b.estilo = "cita"; b.html = inline(m[1]); }
      else if ((m = /^\s*[-*]\s+\[([ xX])\]\s+(.*)/.exec(l))) { b.estilo = "tarea"; b.hecho = m[1] !== " "; b.html = inline(m[2]); }
      else if ((m = /^\s*([-*+]|\d+[.)])\s+(.*)/.exec(l))) { b.estilo = "lista"; b.html = inline(m[2]); }
      else if (/^\s*\|/.test(l) || /^!\[/.test(l)) { aproximado = true; b.html = NOM.esc(l); }
      else b.html = inline(l);
      bs.push(b);
    });
    return { bs, aproximado };
  }

  function comoOps(bloques, paginas) {
    const r = [];
    if (paginas) r.push({ id: "imp:p", bloque: "_doc", campos: { paginas }, t: 2, n: "importar" });
    bloques.forEach((b, i) => { const { id, ...c } = b; r.push({ id: "imp:" + i, bloque: id, campos: c, t: 2, n: "importar" }); });
    return r;
  }

  async function importar(archivo) {
    const nombre = archivo.name.replace(/\.[^.]+$/, "");
    const ext = (archivo.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
    if (!IMPORTABLES.includes(ext)) throw new Error(`Formato no soportado. Puedes importar: ${IMPORTABLES.join(", ")}`);
    if (archivo.size > MAX_BYTES) throw new Error("El archivo pesa más de 10 MB");
    const texto = await archivo.text();
    if (/�/.test(texto.slice(0, 2000)) && ext !== ".txt") throw new Error("El archivo parece dañado o no es texto");
    let aviso = null;

    if (ext === ".nom" || ext === ".json") {
      let datos;
      try { datos = JSON.parse(texto); } catch (e) { throw new Error("El archivo .nom está dañado"); }
      if (datos.formato !== "nom-colab" || !datos.bloques) throw new Error("Ese JSON no es un documento de NOM-COLAB");
      const d = datos.bloques._doc || {};
      const ops = Object.keys(datos.bloques).filter((k) => k !== "_doc").map((k, i) => {
        const { id, ...c } = datos.bloques[k];
        return { id: "imp:" + i, bloque: k, campos: c, t: 2, n: "importar" };
      });
      if (d.paginas) ops.unshift({ id: "imp:p", bloque: "_doc", campos: { paginas: d.paginas }, t: 2, n: "importar" });
      return { nombre: d.nombre || nombre, modo: d.modo || "TEXTO", ops, aviso };
    }
    if (ext === ".csv" || ext === ".tsv") {
      const sep = ext === ".tsv" ? "\t" : (texto.split("\n")[0].split(";").length > texto.split("\n")[0].split(",").length ? ";" : ",");
      const filas = parseCsv(texto, sep).filter((r) => r.some((c) => c !== ""));
      const b = { id: NOM.DocCRDT.nuevoId(), tipo: "tabla", pagina: "p1", orden: 1, filas: Math.max(30, filas.length + 5), cols: Math.max(10, ...filas.map((r) => r.length)), x: 40, y: 40, w: 880, h: 300 };
      filas.forEach((r, f) => r.forEach((v, c) => { if (v !== "") b["c:" + F().ref(c, f)] = v; }));
      return { nombre, modo: "HOJA", ops: comoOps([b]), aviso };
    }
    if (ext === ".html" || ext === ".htm") {
      const d = new DOMParser().parseFromString(texto, "text/html");
      const lineas = [];
      d.body.querySelectorAll("h1,h2,h3,h4,p,li,blockquote").forEach((n) => {
        const t = n.textContent.trim(); if (!t) return;
        const pref = { H1: "# ", H2: "## ", H3: "## ", H4: "## ", LI: "- ", BLOCKQUOTE: "> " }[n.tagName] || "";
        lineas.push(pref + t);
      });
      if (d.body.querySelector("img,table,svg")) aviso = "Las tablas e imágenes del HTML no se importaron";
      const r = bloquesTexto(lineas.length ? lineas : [d.body.textContent.trim()]);
      return { nombre: d.title || nombre, modo: "TEXTO", ops: comoOps(r.bs), aviso };
    }
    // .md / .txt
    const lineas = texto.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
    const r = bloquesTexto(lineas.length ? lineas : [""]);
    if (r.aproximado) aviso = "Algunas tablas o imágenes de Markdown quedaron como texto";
    return { nombre, modo: "TEXTO", ops: comoOps(r.bs), aviso };
  }

  /** Imagen local -> data URL comprimida (máx. 1600 px, JPEG 0.85) para no inflar el documento. */
  function imagenADataUrl(archivo) {
    return new Promise((ok, mal) => {
      if (!/^image\//.test(archivo.type)) return mal(new Error("Elige una imagen (PNG, JPG, GIF, WebP)"));
      const lector = new FileReader();
      lector.onerror = () => mal(new Error("No se pudo leer la imagen"));
      lector.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, 1600 / Math.max(img.width, img.height));
          const cv = document.createElement("canvas");
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          const png = archivo.type === "image/png" && cv.width * cv.height < 400000;
          ok({ src: cv.toDataURL(png ? "image/png" : "image/jpeg", 0.85), w: cv.width, h: cv.height });
        };
        img.onerror = () => mal(new Error("La imagen está dañada"));
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  function elegirArchivo(aceptar) {
    return new Promise((ok) => {
      const i = Object.assign(document.createElement("input"), { type: "file", accept: aceptar });
      i.onchange = () => ok(i.files[0] || null);
      i.click();
    });
  }

  NOM.formatos = { IMPORTABLES, EXPORTABLES, paraTipo, exportar, importar, imagenADataUrl, elegirArchivo, aHtml, aMarkdown, textoPlano };
})();
