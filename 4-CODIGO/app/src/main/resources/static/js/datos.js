/* NOM-COLAB · Fase 9 (generar sin IA), lo que se arma con lo que ya existe:
   - Datos → reporte: de una hoja o de un CSV/XLSX (por ejemplo, una encuesta de Google Forms), un
     documento con el resumen, tablas de frecuencias, medidas y gráficas. Son cuentas, no opiniones.
   - Combinar correspondencia: un texto con {{campos}} + una hoja = un documento por fila.
   - Datos públicos de Wikidata en una hoja (experimento).
   - Documento → presentación y documento → mapa mental, a partir de sus títulos y párrafos. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso } = NOM;
  const api = () => NOM.api;
  const F = () => NOM.formulas;
  let n = 0;
  const nuevoId = () => "g" + Date.now().toString(36) + (++n).toString(36) + Math.random().toString(36).slice(2, 6);
  const op = (bloque, campos, i) => ({ id: "gen:" + bloque + ":" + i, bloque, campos, t: 2, n: "gen" });
  const hoy = () => new Date().toLocaleDateString("es-MX", { dateStyle: "long" });

  /** Crea el documento (en el espacio o, sin cuenta, en este equipo) y lo abre. */
  async function crearDocumento(ed, nombre, modo, ops) {
    const partes = NOM.DocCRDT.partir(ops);
    if (!ed || ed.local || !ed.espacio) { const d = NOM.local.crear(nombre, modo, partes); location.hash = "#/local/" + d.id; return d; }
    const d = await api().post(`/api/espacios/${ed.espacio.id}/documentos`, { nombre: nombre.slice(0, 120), modo, ops: partes });
    location.hash = "#/doc/" + d.id;
    return d;
  }
  /** Un documento a partir de operaciones (para leer lo importado de un archivo). */
  function docDeOps(ops) {
    const d = new NOM.DocCRDT("tmp-" + nuevoId(), { bloques: {}, reloj: 0 }, { local: true, soloMemoria: true });
    ops.forEach((o) => d._fusionar(o));
    return d;
  }

  // ================================================================== leer y analizar una tabla
  /** Valores de la primera tabla (o la de esa página) de un documento: matriz [fila][columna]. */
  function tablaDe(doc, pagina) {
    const bs = (pagina ? doc.deLaPagina(pagina) : []).concat(doc.vivos());
    const b = bs.find((x) => x.tipo === "tabla");
    if (!b) return null;
    const r = NOM.diapo.rangoUsado(b);
    if (!r) return [];
    const ev = F().evaluadorDeTabla(doc, b);
    const m = [];
    for (let f = 0; f <= Math.min(r.f2, 5000); f++) { const fila = []; for (let c = 0; c <= Math.min(r.c2, 60); c++) fila.push(ev.valor(c, f)); m.push(fila); }
    return m;
  }
  const texto = (v) => (v == null ? "" : F().esNum(v) ? String(v) : String(F().formatear(v))).trim();
  function aNum(v) {
    if (typeof v === "number") return v;
    const s = String(v == null ? "" : v).trim().replace(/\s/g, "");
    if (!s) return null;
    const x = Number(s.replace(/,(?=\d{3}(\D|$))/g, "").replace(/%$/, ""));
    return isFinite(x) ? x : null;
  }
  const redondo = (x, d) => { const k = Math.pow(10, d == null ? 2 : d); return Math.round(x * k) / k; };
  const fmt = (x) => (x == null || isNaN(x) ? "—" : redondo(x).toLocaleString("es-MX"));
  /** Qué es cada columna (número, opciones o texto libre) y sus cuentas. */
  function analizar(m) {
    const enc = (m[0] || []).map((h, i) => texto(h) || "Columna " + (i + 1));
    const datos = m.slice(1).filter((f) => f.some((v) => texto(v) !== ""));
    const cols = enc.map((nombre, c) => {
      const vals = datos.map((f) => texto(f[c])).filter((v) => v !== "");
      const r = { nombre, respuestas: vals.length, vacias: datos.length - vals.length };
      if (!vals.length) return Object.assign(r, { tipo: "vacia" });
      if (/^(marca temporal|timestamp|fecha y hora)$/i.test(nombre)) return Object.assign(r, { tipo: "omitir" });
      const nums = vals.map(aNum).filter((x) => x != null);
      const cuenta = (l) => { const mp = new Map(); l.forEach((v) => mp.set(v, (mp.get(v) || 0) + 1)); return [...mp.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "es", { numeric: true })); };
      if (nums.length >= vals.length * 0.85) {
        const o = nums.slice().sort((a, b) => a - b), N = o.length, media = o.reduce((s, x) => s + x, 0) / N;
        const mediana = N % 2 ? o[(N - 1) / 2] : (o[N / 2 - 1] + o[N / 2]) / 2;
        const de = N > 1 ? Math.sqrt(o.reduce((s, x) => s + (x - media) * (x - media), 0) / (N - 1)) : 0;
        Object.assign(r, { tipo: "numero", n: N, media, mediana, min: o[0], max: o[N - 1], de });
        // Escalas cortas (1 a 5, calificaciones enteras): también su frecuencia.
        const distintos = new Set(o);
        if (distintos.size <= 11 && o.every((x) => Number.isInteger(x))) r.frecuencias = cuenta(o.map(String)).sort((a, b) => +a[0] - +b[0]);
        return r;
      }
      // Casillas de Google Forms: "Opción A, Opción B" en una sola celda.
      const conComas = vals.filter((v) => v.includes(", ")).length;
      const partes = conComas >= 2 && conComas >= vals.length * 0.15 ? vals.flatMap((v) => v.split(/,\s+/)) : vals;
      const fr = cuenta(partes);
      // Todos distintos (nombres, matrículas, comentarios): no son opciones que se cuenten.
      if (fr.length === partes.length && partes.length >= 3) return Object.assign(r, { tipo: "texto", ejemplos: vals.slice(0, 8) });
      if (fr.length <= Math.max(12, Math.min(30, vals.length * 0.6))) return Object.assign(r, { tipo: "opciones", multiple: partes !== vals, frecuencias: fr });
      return Object.assign(r, { tipo: "texto", ejemplos: vals.slice(0, 8) });
    });
    return { enc, n: datos.length, cols };
  }

  // ================================================================== datos → reporte
  async function graficaPng(etiquetas, valores, nombre, clase) {
    if (!NOM.graficas) return null;
    const w = 640, h = 340;
    const svg = NOM.graficas.svg({ etiquetas: etiquetas.map((x) => String(x).slice(0, 28)), series: [{ nombre, valores }] }, clase || "barras", { titulo: nombre.slice(0, 70), autonomo: true, ancho: w, alto: h });
    try { return { src: await NOM.graficas.aPng(svg, w, h, 1.5), w, h }; } catch (e) { return null; }
  }
  /** Arma el documento del reporte: párrafos (para la secuencia) y los bloques de tablas e imágenes. */
  async function armarReporteDeDatos(m, titulo, origen) {
    const a = analizar(m);
    const B = NOM.textoRico.BLOQUE, ps = [], bloques = [];
    const par = (x, pa, attrs) => ps.push({ tramos: [{ x, a: attrs || {} }], a: pa || {} });
    const tabla = (filas) => {
      const id = nuevoId(), b = { tipo: "tabla", enTexto: true, filasTexto: filas.length, colsTexto: filas[0].length, encabezado: true };
      filas.forEach((f, i) => f.forEach((v, c) => { if (v !== "" && v != null) b["c:" + F().ref(c, i)] = String(v); }));
      bloques.push([id, b]);
      ps.push({ tramos: [{ e: { tipo: "tabla", ref: id } }], a: {} });
    };
    const imagen = (img, pie) => {
      if (!img) return;
      const id = nuevoId();
      bloques.push([id, { tipo: "imagen", enTexto: true, src: img.src, w: 560, h: Math.round((560 * img.h) / img.w), pie }]);
      ps.push({ tramos: [{ e: { tipo: "imagen", ref: id } }], a: { alin: "centro" } });
    };
    par(titulo, { estilo: "titulo" });
    par(`${a.n} respuesta${a.n === 1 ? "" : "s"} · ${a.cols.filter((c) => c.tipo !== "omitir" && c.tipo !== "vacia").length} preguntas o columnas · ${hoy()}`, { estilo: "subtitulo" });
    if (origen) par("Datos: " + origen, {}, { i: true, color: "#6B6875" });
    // Resumen: un renglón por pregunta, con lo que dicen las cuentas.
    par("Resumen", { estilo: "h1" });
    const pct = (x, tot) => (tot ? Math.round((x * 100) / tot) : 0);
    a.cols.forEach((c) => {
      let t = null;
      if (c.tipo === "opciones") { const [v, k] = c.frecuencias[0]; t = `${c.nombre}: lo más ${c.multiple ? "elegido" : "frecuente"} fue «${v}» (${k} de ${c.respuestas}, ${pct(k, c.respuestas)} %).`; }
      else if (c.tipo === "numero") t = `${c.nombre}: promedio ${fmt(c.media)} (mínimo ${fmt(c.min)}, máximo ${fmt(c.max)}, mediana ${fmt(c.mediana)}).`;
      else if (c.tipo === "texto") t = `${c.nombre}: ${c.respuestas} respuestas distintas.`;
      if (t) par(t, { lista: "vinetas" });
    });
    let fig = 0, tab = 0;
    for (const c of a.cols) {
      if (c.tipo === "omitir" || c.tipo === "vacia") continue;
      par(c.nombre, { estilo: "h2" });
      if (c.tipo === "opciones") {
        par(`Tabla ${++tab}. ${c.multiple ? "Opciones elegidas (se podía elegir más de una)" : "Frecuencia de respuestas"}`, {}, { i: true });
        tabla([["Respuesta", "Personas", "%"]].concat(c.frecuencias.map(([v, k]) => [v, k, pct(k, c.respuestas) + " %"])));
        const top = c.frecuencias.slice(0, 10);
        imagen(await graficaPng(top.map((x) => x[0]), top.map((x) => x[1]), c.nombre, top.length <= 5 && !c.multiple ? "pastel" : "barras"), `Figura ${++fig}. ${c.nombre}`);
      } else if (c.tipo === "numero") {
        par(`Tabla ${++tab}. Medidas`, {}, { i: true });
        tabla([["Medida", "Valor"], ["Respuestas", c.n], ["Promedio", fmt(c.media)], ["Mediana", fmt(c.mediana)], ["Mínimo", fmt(c.min)], ["Máximo", fmt(c.max)], ["Desviación estándar", fmt(c.de)]]);
        if (c.frecuencias) imagen(await graficaPng(c.frecuencias.map((x) => x[0]), c.frecuencias.map((x) => x[1]), c.nombre, "barras"), `Figura ${++fig}. ${c.nombre}`);
      } else if (c.tipo === "texto") {
        par(`Algunas respuestas (${Math.min(8, c.respuestas)} de ${c.respuestas}):`);
        c.ejemplos.forEach((x) => par(x, { lista: "vinetas" }));
      }
      if (c.vacias) par(`Sin respuesta: ${c.vacias}.`, {}, { color: "#6B6875" });
    }
    par("Conclusiones", { estilo: "h1" });
    par("Escribe aquí qué significan estos resultados.", {}, { i: true, color: "#6B6875" });
    const ops = bloques.map(([id, b], i) => op(id, b, i)).concat(NOM.Secuencia.crearOps(B, ps, "gen", 1, "gen"));
    return { ops, analisis: a };
  }
  /** Desde la hoja abierta (o desde un archivo CSV o XLSX elegido). */
  async function reporteDeDatos(ed, opc) {
    opc = opc || {};
    let m, nombre = "Reporte", origen = null;
    try {
      if (opc.archivo) {
        const r = await NOM.formatos.importar(opc.archivo);
        if (r.modo !== "HOJA") throw new Error("Elige una hoja de cálculo (.xlsx) o un archivo .csv");
        m = tablaDe(docDeOps(r.ops));
        nombre = "Reporte de " + r.nombre;
        origen = "archivo " + opc.archivo.name;
      } else {
        m = tablaDe(ed.doc, ed.pagina);
        nombre = "Reporte de " + (ed.doc.valor("_doc", "nombre") || "datos");
        origen = "hoja «" + (ed.doc.valor("_doc", "nombre") || "") + "»";
      }
    } catch (e) { return aviso(e.message, { tipo: "error" }); }
    if (!m || m.length < 2) return aviso("Se necesita una tabla con encabezados en la fila 1 y datos abajo", { tipo: "aviso", ms: 5000 });
    aviso("Contando respuestas y haciendo las gráficas…", { ms: 2500 });
    try {
      const r = await armarReporteDeDatos(m, nombre, origen);
      await crearDocumento(ed, nombre, "TEXTO", r.ops);
      aviso(`Reporte listo: ${r.analisis.n} respuestas`, { tipo: "ok", ms: 4000 });
    } catch (e) { aviso(e.message, { tipo: "error" }); }
  }

  // ================================================================== combinar correspondencia
  const MARCA = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const normal = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  function camposDelTexto(doc) {
    const s = new Set();
    NOM.textoRico.parrafosDe(doc).forEach((p) => { const t = p.tramos.map((x) => x.x || "").join(""); for (const m of t.matchAll(MARCA)) s.add(m[1]); });
    return [...s];
  }
  /** Los párrafos del documento con los {{campos}} de una fila (y los bloques nuevos de sus tablas e imágenes). */
  function combinar(doc, enc, fila, bloques) {
    const valor = (k) => { const i = enc.findIndex((h) => normal(h) === normal(k)); return i < 0 ? null : texto(fila[i]); };
    const sust = (t) => String(t).replace(MARCA, (m, k) => { const v = valor(k); return v == null ? m : v; });
    return NOM.textoRico.parrafosDe(doc).map((p) => {
      const trs = [];
      p.tramos.forEach((t) => {
        const u = trs[trs.length - 1];
        // Una marca {{…}} partida en dos formatos distintos: se juntan (se queda el primer formato).
        if (u && u.x != null && t.x != null && /\{\{[^}]*$/.test(u.x)) u.x += t.x; else trs.push(Object.assign({}, t));
      });
      const pa = Object.assign({}, p.pa);
      delete pa.dueno;
      return {
        a: pa,
        tramos: trs.map((t) => {
          if (t.x != null) { const a = Object.assign({}, t.a); delete a.sug; delete a.sugBorrar; return { x: sust(t.x), a }; }
          const e = Object.assign({}, t.e), id = nuevoId();
          const b = {};
          Object.keys(e).forEach((k) => { if (k !== "ref" && k !== "id") b[k] = typeof e[k] === "string" && k.startsWith("c:") ? sust(e[k]) : e[k]; });
          if (e.ref) { bloques.push([id, Object.assign(b, { enTexto: true })]); return { e: { tipo: e.tipo, ref: id } }; }
          return { e: { tipo: e.tipo } };
        }),
      };
    });
  }
  const CLAVES_DOC = ["formato", "pagina", "encabezado", "pie", "numeros", "margenes"];
  async function combinarCorrespondencia(ed) {
    if (!ed || ed.local) return aviso("Combinar correspondencia necesita un espacio (con cuenta)", { tipo: "info" });
    const campos = camposDelTexto(ed.doc);
    let lista = [];
    try { lista = ((await api().get(`/api/espacios/${ed.espacio.id}`)).lista || []).filter((x) => x.modo === "HOJA" && !x.plantilla); } catch (e) { return aviso(e.message, { tipo: "error" }); }
    const cuerpo = html(`<div class="col">
      <p style="margin:0">Escribe en tu texto los datos que cambian entre llaves dobles, como <b>{{Nombre}}</b> o <b>{{Calificación}}</b>, con el mismo nombre que tienen las columnas de la hoja (fila 1). Se hace un documento por cada fila.</p>
      <div class="campo"><span class="etiqueta">En este texto</span><div class="fila" style="flex-wrap:wrap;gap:6px">${campos.length ? campos.map((c) => `<span class="chip" data-campo="${esc(c)}">{{${esc(c)}}}</span>`).join("") : '<span class="suave">Aún no hay campos {{…}} en el texto.</span>'}</div></div>
      <div class="campo"><label for="cc-h">Hoja con los datos</label><select id="cc-h" class="select" data-hoja>${lista.map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join("") || '<option value="">No hay hojas en este espacio</option>'}</select></div>
      <div data-info class="suave chico"></div>
      <div class="segmentado lleno" role="group" aria-label="Cómo crear" data-modo><button type="button" data-m="varios" aria-pressed="true">Un documento por fila</button><button type="button" data-m="uno" aria-pressed="false">Todo en uno (una página por fila)</button></div>
      <div class="cc-previa" data-previa></div></div>`);
    const pie = html(`<div style="display:contents"><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si disabled>Crear</button></div>`);
    const h = NOM.hoja({ titulo: "Combinar correspondencia", icono: "mail", cuerpo, pie, ancha: true });
    let datos = null, modo = "varios";
    async function cargar() {
      const id = $("[data-hoja]", cuerpo).value;
      datos = null;
      $("[data-si]", pie).disabled = true;
      if (!id) return;
      try {
        const r = await api().get(`/api/documentos/${id}`);
        const m = tablaDe(new NOM.DocCRDT("cc-" + id, r.estado, { soloLectura: true, soloMemoria: true }));
        if (!m || m.length < 2) { $("[data-info]", cuerpo).textContent = "Esa hoja no tiene datos (fila 1: nombres de las columnas)."; return; }
        const enc = m[0].map(texto), filas = m.slice(1).filter((f) => f.some((v) => texto(v) !== ""));
        datos = { enc, filas };
        const faltan = campos.filter((c) => !enc.some((e2) => normal(e2) === normal(c)));
        $$("[data-campo]", cuerpo).forEach((x) => x.classList.toggle("aviso", faltan.includes(x.dataset.campo)));
        $("[data-info]", cuerpo).innerHTML = `${filas.length} fila${filas.length === 1 ? "" : "s"} · columnas: ${enc.map(esc).join(", ")}${faltan.length ? `<br><b style="color:#B54708">No hay columna para: ${faltan.map(esc).join(", ")}</b>` : ""}`;
        const ej = combinar(ed.doc, enc, filas[0], []).slice(0, 6).map((p) => p.tramos.map((t) => (t.x != null ? esc(t.x) : "▢")).join("")).filter(Boolean);
        $("[data-previa]", cuerpo).innerHTML = `<span class="suave chico">Así queda la primera:</span><div class="cc-hoja">${ej.map((x) => `<p>${x}</p>`).join("")}</div>`;
        $("[data-si]", pie).disabled = !campos.length;
        $("[data-si]", pie).textContent = modo === "uno" ? "Crear 1 documento" : `Crear ${filas.length} documento${filas.length === 1 ? "" : "s"}`;
      } catch (e) { $("[data-info]", cuerpo).textContent = e.message; }
    }
    $("[data-hoja]", cuerpo).onchange = cargar;
    $("[data-modo]", cuerpo).onclick = (e) => { const b = e.target.closest("[data-m]"); if (!b) return; modo = b.dataset.m; $$("[data-m]", cuerpo).forEach((x) => x.setAttribute("aria-pressed", x === b)); if (datos) $("[data-si]", pie).textContent = modo === "uno" ? "Crear 1 documento" : `Crear ${datos.filas.length} documentos`; };
    $("[data-no]", pie).onclick = () => h.cerrar();
    cargar();
    $("[data-si]", pie).onclick = async () => {
      if (!datos) return;
      if (datos.filas.length > 200) return aviso("Son más de 200 filas: divide la hoja en partes", { tipo: "aviso" });
      const b = $("[data-si]", pie);
      b.disabled = true;
      const base = ed.doc.valor("_doc", "nombre") || "Documento", B = NOM.textoRico.BLOQUE;
      const meta = {};
      CLAVES_DOC.forEach((k) => { const v = ed.doc.valor("_doc", k); if (v != null) meta[k] = v; });
      const opsDe = (ps, bloques) => (Object.keys(meta).length ? [op("_doc", meta, "m")] : []).concat(bloques.map(([id, bb], i) => op(id, bb, i)), NOM.Secuencia.crearOps(B, ps, "gen", 1, "gen"));
      try {
        if (modo === "uno") {
          const bloques = [], ps = [];
          datos.filas.forEach((f, i) => { if (i) ps.push({ tramos: [{ e: { tipo: "salto" } }], a: {} }); ps.push(...combinar(ed.doc, datos.enc, f, bloques)); });
          h.cerrar(true);
          await crearDocumento(ed, base + " (combinado)", "TEXTO", opsDe(ps, bloques));
        } else {
          let hechos = 0;
          for (const f of datos.filas) {
            const bloques = [], ps = combinar(ed.doc, datos.enc, f, bloques);
            const nom = `${base} – ${texto(f[0]) || hechos + 1}`;
            await api().post(`/api/espacios/${ed.espacio.id}/documentos`, { nombre: nom.slice(0, 120), modo: "TEXTO", ops: NOM.DocCRDT.partir(opsDe(ps, bloques)) });
            hechos++;
            b.textContent = `Creando ${hechos} de ${datos.filas.length}…`;
          }
          h.cerrar(true);
          aviso(`Listo: ${hechos} documentos en el espacio`, { tipo: "ok", ms: 5000, accion: { texto: "Ver", fn: () => (location.hash = "#/espacio/" + ed.espacio.id) } });
        }
      } catch (e) { aviso(e.message, { tipo: "error" }); b.disabled = false; }
    };
  }

  // ================================================================== datos públicos (Wikidata)
  async function datosPublicos(esp) {
    let l;
    try { l = await api().get("/api/fuentes/datos"); } catch (e) { return aviso(e.message, { tipo: "error" }); }
    const cuerpo = html(`<div class="col"><p style="margin:0">Tablas con datos abiertos de <b>Wikidata</b> para tus trabajos (experimento: revisa los números con otra fuente). Se crea una hoja nueva con su fuente.</p>
      <div class="lista">${l.map((x) => `<button type="button" class="lista-item" data-c="${esc(x.id)}" style="width:100%;text-align:left">${ico("table-2")}<span class="crece"><b>${esc(x.titulo)}</b></span>${ico("chevron-right")}</button>`).join("")}</div></div>`);
    const h = NOM.hoja({ titulo: "Datos públicos", icono: "globe", cuerpo });
    cuerpo.onclick = async (e) => {
      const b = e.target.closest("[data-c]");
      if (!b) return;
      b.disabled = true;
      try {
        const r = await api().get("/api/fuentes/datos/" + b.dataset.c, undefined, { ms: 40000 });
        const t = { tipo: "tabla", pagina: "p1", orden: 1, filas: Math.max(30, r.filas.length + 6), cols: Math.max(8, r.columnas.length + 1), x: 40, y: 40, w: 880, h: 300 };
        r.columnas.forEach((c, i) => { t["c:" + F().ref(i, 0)] = c; t["n:" + F().ref(i, 0)] = true; });
        r.filas.forEach((f, i) => f.forEach((v, c) => { if (v !== "") t["c:" + F().ref(c, i + 1)] = v; }));
        t["c:" + F().ref(0, r.filas.length + 2)] = `Fuente: Wikidata (consultado el ${hoy()}). Datos abiertos (CC0).`;
        h.cerrar(true);
        const d = await api().post(`/api/espacios/${esp.id}/documentos`, { nombre: r.titulo, modo: "HOJA", ops: NOM.DocCRDT.partir([op("hoja-p1", t, 0)]) });
        location.hash = "#/doc/" + d.id;
      } catch (err) { aviso(err.red || err.estado === 503 ? "Sin Internet: los datos públicos necesitan conexión" : err.message, { tipo: "aviso", ms: 5000 }); b.disabled = false; }
    };
  }

  // ================================================================== documento → presentación y mapa mental
  /** Las partes del texto: títulos con sus párrafos y viñetas. */
  function partes(doc) {
    const ps = NOM.textoRico.parrafosDe(doc).map((p) => ({ estilo: p.pa.estilo || "", lista: !!p.pa.lista, t: p.tramos.map((x) => x.x || "").join("").replace(/\s+/g, " ").trim(), img: p.tramos.find((x) => x.e && x.e.tipo === "imagen" && x.e.src) }));
    const nivelTitulo = ps.some((p) => p.estilo === "h1") ? "h1" : ps.some((p) => p.estilo === "h2") ? "h2" : null;
    const titulo = (ps.find((p) => p.estilo === "titulo") || {}).t || doc.valor("_doc", "nombre") || "Presentación";
    const secs = [];
    if (nivelTitulo) {
      let s = null;
      ps.forEach((p) => {
        if (p.estilo === nivelTitulo) { s = { t: p.t, ps: [], subs: [] }; secs.push(s); return; }
        if (!s || p.estilo === "titulo" || p.estilo === "subtitulo") return;
        if (/^h[2-6]$/.test(p.estilo)) s.subs.push(p.t); else if (p.t || p.img) s.ps.push(p);
      });
    } else {
      // Sin títulos: cada párrafo es una parte, con sus primeras palabras como título.
      ps.filter((p) => p.t && p.estilo !== "titulo").forEach((p) => secs.push({ t: p.t.split(/\s+/).slice(0, 6).join(" ") + (p.t.split(/\s+/).length > 6 ? "…" : ""), ps: [p], subs: [] }));
    }
    return { titulo, secs: secs.filter((s) => s.t) };
  }
  const oraciones = (t) => (String(t).match(/[^.!?…]+[.!?…]*/g) || []).map((x) => x.trim()).filter((x) => x.length > 2);
  const recorta = (t, n) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t);
  async function aPresentacion(ed) {
    const P = partes(ed.doc);
    if (!P.secs.length) return aviso("El documento está vacío: escribe algo (mejor con títulos) y vuelve a intentarlo", { tipo: "aviso", ms: 5000 });
    const D = NOM.diapo, T = D.TAMANOS["16:9"], bloques = [], paginas = [], doc = { tema: "claro" };
    const arma = (diseno, textos, pg) => {
      const ds = D.DISENOS.find((x) => x.id === diseno);
      ds.arma(T.w, T.h).forEach((b, k) => {
        const t = textos[k];
        const h = t == null ? "" : Array.isArray(t) ? `<ul>${t.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : esc(t);
        bloques.push(Object.assign({}, b, { id: nuevoId(), pagina: pg, orden: k + 1, z: k + 1, html: h, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }));
      });
    };
    paginas.push("p1");
    arma("portada", [P.titulo, (api().usuario() || {}).nombre ? (api().usuario() || {}).nombre + " · " + hoy() : hoy()], "p1");
    P.secs.slice(0, 40).forEach((s, i) => {
      const pg = "p" + (i + 2);
      paginas.push(pg);
      // Viñetas: las listas del texto tal cual; si no hay, la primera oración de cada párrafo.
      const listas = s.ps.filter((p) => p.lista).map((p) => p.t);
      const puntos = (listas.length ? listas : s.subs.length ? s.subs : s.ps.map((p) => oraciones(p.t)[0] || "").filter(Boolean)).slice(0, 6).map((x) => recorta(x, 120));
      arma("contenido", [recorta(s.t, 70), puntos.length ? puntos : [""]], pg);
      // El texto completo de la parte queda en las notas del orador (para no leer de la diapositiva).
      const nota = s.ps.map((p) => p.t).filter(Boolean).join("\n\n");
      if (nota) doc["nota:" + pg] = nota.slice(0, 4000);
    });
    const ops = [op("_doc", Object.assign({ paginas }, doc), "d")].concat(bloques.map(({ id, ...b }, i) => op(id, b, i)));
    try { await crearDocumento(ed, P.titulo + " (presentación)", "PRESENTACION", ops); aviso(`Presentación lista: ${paginas.length} diapositivas (el texto completo va en las notas)`, { tipo: "ok", ms: 5000 }); }
    catch (e) { aviso(e.message, { tipo: "error" }); }
  }
  async function aMapaMental(ed) {
    const P = partes(ed.doc);
    if (!P.secs.length) return aviso("El documento está vacío: escribe algo (mejor con títulos) y vuelve a intentarlo", { tipo: "aviso", ms: 5000 });
    const arbol = { t: P.titulo, hijos: P.secs.slice(0, 12).map((s) => ({ t: recorta(s.t, 50), hijos: (s.subs.length ? s.subs : s.ps.filter((p) => p.lista).map((p) => p.t).concat(s.ps.filter((p) => !p.lista).map((p) => (oraciones(p.t)[0] || "")))).filter(Boolean).slice(0, 5).map((x) => ({ t: recorta(x, 46) })) })) };
    const g = NOM.diagramas.mapaMental(arbol);
    const x0 = Math.min(...g.bloques.map((b) => b.x)), y0 = Math.min(...g.bloques.map((b) => b.y));
    const ids = g.bloques.map(() => nuevoId());
    const ops = g.bloques.map((b, i) => op(ids[i], Object.assign({}, b, { pagina: "p1", orden: i + 1, z: i + 1, x: b.x - x0 + 80, y: b.y - y0 + 80 }), i))
      .concat(g.uniones.map(([a, b, o], i) => op(nuevoId(), Object.assign({ tipo: "conector", desde: ids[a], hasta: ids[b], pagina: "p1", orden: 0 }, o || {}), "c" + i)));
    try { await crearDocumento(ed, P.titulo + " (mapa mental)", "DIAGRAMA", ops); aviso("Mapa mental listo", { tipo: "ok" }); }
    catch (e) { aviso(e.message, { tipo: "error" }); }
  }

  NOM.datos = { analizar, tablaDe, reporteDeDatos, armarReporteDeDatos, combinarCorrespondencia, camposDelTexto, datosPublicos, aPresentacion, aMapaMental, partes };
})();
