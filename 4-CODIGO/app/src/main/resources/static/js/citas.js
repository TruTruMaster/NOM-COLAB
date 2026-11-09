/* NOM-COLAB · Fase 9: investigar, fichas de trabajo, fuentes y citas en APA. Sin IA: la persona
   escribe; la app busca, organiza y cita. Lo que se inserta desde una ficha o una fuente queda en
   el recibo como "citado con su fuente".
     Fuentes del documento: _doc "fuente:<id>" = { tipo, titulo, autores: [{ familia, nombres } | { literal }],
       anio, fecha, editorial, revista, volumen, numero, paginas, doi, isbn, url, sitio, medio, … }
     Fichas de trabajo:     _doc "ficha:<id>" = { tipo: textual|parafrasis|resumen, texto, original,
       fuente (id), pagina, tema, t } */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso } = NOM;
  const api = () => NOM.api;

  // ================================================================== APA 7 (en español)
  const TIPOS = [["libro", "Libro"], ["articulo", "Artículo de revista"], ["web", "Página web"], ["enciclopedia", "Enciclopedia o Wikipedia"], ["video", "Video"], ["capitulo", "Capítulo de libro"], ["otro", "Otro"]];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const conPunto = (x) => (/[.?!…]$/.test(x) ? x : x + ".");
  const iniciales = (nombres) => String(nombres || "").trim().split(/\s+/).filter(Boolean)
    .map((n) => n.split("-").map((p) => (p ? p[0].toUpperCase() + "." : "")).join("-")).join(" ");
  const autorApa = (a) => (a.literal ? a.literal : (a.familia || "") + (iniciales(a.nombres) ? ", " + iniciales(a.nombres) : ""));
  function autoresApa(as) {
    const l = (as || []).filter((a) => a && (a.literal || a.familia)).map(autorApa);
    if (!l.length) return "";
    if (l.length === 1) return l[0];
    if (l.length <= 20) return l.slice(0, -1).join(", ") + " y " + l[l.length - 1];
    return l.slice(0, 19).join(", ") + ", … " + l[l.length - 1];
  }
  const anioDe = (f) => f.anio || ((String(f.fecha || "").match(/\d{4}/) || [])[0]) || "";
  /** (2020), (2020, 3 de mayo) en lo que tiene fecha exacta, o (s. f.). */
  function fechaApa(f, exacta) {
    const a = anioDe(f);
    if (!a) return "(s. f.)";
    const m = String(f.fecha || "").match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (exacta && m && m[2]) return `(${m[1]}, ${m[3] ? +m[3] + " de " : ""}${MESES[+m[2] - 1] || ""})`;
    return `(${a})`;
  }
  const fechaLarga = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}` : ""; };
  const enlace = (f) => (f.doi ? "https://doi.org/" + String(f.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") : f.url || "");

  /** La referencia en APA como tramos ({ x, i }: i = cursiva), para escribirla con su formato. */
  function apa(f) {
    f = f || {};
    const s = [], t = (x, i) => { if (x) s.push({ x, i: !!i }); };
    const autores = autoresApa(f.autores);
    const titulo = String(f.titulo || "Sin título").trim().replace(/\.$/, "");
    const url = enlace(f);
    const exacta = ["web", "video", "enciclopedia", "otro"].includes(f.tipo);
    const fecha = fechaApa(f, exacta);
    switch (f.tipo) {
      case "articulo":
        if (autores) t(conPunto(autores) + " ");
        t(fecha + ". ");
        t(autores ? conPunto(titulo) + " " : "");
        if (!autores) { s.unshift({ x: conPunto(titulo) + " " }); }
        if (f.revista) {
          t(f.revista, true);
          if (f.volumen) { t(", "); t(String(f.volumen), true); }
          if (f.numero) t(`(${f.numero})`);
          if (f.paginas) t(", " + f.paginas);
          t(". ");
        }
        t(url);
        break;
      case "capitulo":
        if (autores) t(conPunto(autores) + " ");
        else t(conPunto(titulo) + " ");
        t(fecha + ". ");
        if (autores) t(conPunto(titulo) + " ");
        t("En ");
        if (f.editores) t(f.editores + " (Ed.), ");
        t(f.capitulo || "Título del libro", true);
        t(f.paginas ? ` (pp. ${f.paginas}). ` : ". ");
        if (f.editorial) t(conPunto(f.editorial) + " ");
        t(url);
        break;
      case "enciclopedia":
        // Título. (fecha). En *Wikipedia, la enciclopedia libre*. URL
        t(conPunto(titulo) + " ");
        t(fecha + ". ");
        t("En ");
        t(f.sitio || "Wikipedia, la enciclopedia libre", true);
        t(". ");
        t(url);
        break;
      case "video":
        if (autores) t(conPunto(autores) + " ");
        t(fecha + ". ");
        t(titulo, true);
        t(" [Video]. ");
        t(conPunto(f.medio || f.sitio || "YouTube") + " ");
        t(url);
        break;
      case "web":
      case "otro":
        if (autores) { t(conPunto(autores) + " "); t(fecha + ". "); t(titulo, true); t(". "); }
        else { t(titulo, true); t(". "); t(fecha + ". "); }
        if (f.sitio && f.sitio !== autores && f.sitio !== (f.autores && f.autores[0] && f.autores[0].literal)) t(conPunto(f.sitio) + " ");
        if (fecha === "(s. f.)" && f.consultado && url) t(`Recuperado el ${fechaLarga(f.consultado)}, de ${url}`);
        else t(url);
        break;
      default: // libro: Autor. (Año). *Título* (2.ª ed.). Editorial.  ·  sin autor: *Título*. (Año). Editorial.
        if (autores) { t(conPunto(autores) + " "); t(fecha + ". "); t(titulo, true); t(f.edicion ? ` (${f.edicion} ed.). ` : ". "); }
        else { t(titulo, true); t(f.edicion ? ` (${f.edicion} ed.). ` : ". "); t(fecha + ". "); }
        if (f.editorial && f.editorial !== autores) t(conPunto(f.editorial) + " ");
        t(url);
    }
    // Sin espacio sobrante al final.
    const u = s[s.length - 1];
    if (u) u.x = u.x.replace(/\s+$/, "");
    return s.filter((x) => x.x);
  }
  const apaTexto = (f) => apa(f).map((x) => x.x).join("");
  const apaHtml = (f) => apa(f).map((x) => (x.i ? `<i>${esc(x.x)}</i>` : esc(x.x))).join("");

  const corto = (t) => { const p = String(t || "Sin título").split(/\s+/); return p.length > 5 ? p.slice(0, 5).join(" ") + "…" : p.join(" "); };
  function quienes(f) {
    const as = (f.autores || []).filter((a) => a && (a.literal || a.familia));
    const ap = (a) => a.literal || a.familia;
    if (!as.length) return null;
    if (as.length === 1) return ap(as[0]);
    if (as.length === 2) return ap(as[0]) + " y " + ap(as[1]);
    return ap(as[0]) + " et al.";
  }
  /** La cita en el texto: (Autor, año), (Autor, año, p. 23), (“Título”, s. f.)… */
  function enTexto(f, pagina) {
    f = f || {};
    const quien = quienes(f) || (f.tipo === "libro" ? corto(f.titulo) : `“${corto(f.titulo)}”`);
    const pg = String(pagina || "").trim();
    return `(${quien}, ${anioDe(f) || "s. f."}${pg ? ", " + (/[-–,]/.test(pg) ? "pp. " : "p. ") + pg : ""})`;
  }
  /** Orden de la lista de referencias: por el primer apellido (o el título si no hay autor). */
  const claveOrden = (f) => (quienes(f) || f.titulo || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() + " " + anioDe(f);
  const ordenar = (l) => l.slice().sort((a, b) => claveOrden(a).localeCompare(claveOrden(b), "es"));

  // ================================================================== fuentes y fichas del documento
  const fuentesDe = (doc) => Object.entries(doc.doc() || {}).filter(([k, v]) => k.startsWith("fuente:") && v && typeof v === "object").map(([k, v]) => Object.assign({}, v, { id: k.slice(7) }));
  const fichasDe = (doc) => Object.entries(doc.doc() || {}).filter(([k, v]) => k.startsWith("ficha:") && v && typeof v === "object")
    .map(([k, v]) => Object.assign({}, v, { id: k.slice(6) })).sort((a, b) => (a.t || 0) - (b.t || 0));
  const clave = (f) => String(f.doi || f.isbn || f.url || f.titulo || "").toLowerCase();
  const CAMPOS = ["tipo", "titulo", "autores", "anio", "fecha", "editorial", "revista", "volumen", "numero", "paginas", "doi", "isbn", "url", "sitio", "edicion", "consultado", "medio", "capitulo", "editores"];
  const limpia = (f) => Object.fromEntries(CAMPOS.filter((k) => f[k] != null && f[k] !== "" && !(Array.isArray(f[k]) && !f[k].length)).map((k) => [k, f[k]]));
  /** Guarda una fuente en el documento (si ya estaba, la actualiza) y devuelve su id. */
  function guardarFuente(ed, f) {
    const ya = fuentesDe(ed.doc).find((x) => (f.id && x.id === f.id) || (clave(x) && clave(x) === clave(f)));
    const id = (ya && ya.id) || NOM.DocCRDT.nuevoId();
    ed.doc.cambiar("_doc", { ["fuente:" + id]: limpia(f) });
    return id;
  }
  const fuenteDe = (ed, id) => fuentesDe(ed.doc).find((x) => x.id === id) || null;

  // ================================================================== formulario de una fuente
  const CAMPOS_TIPO = {
    libro: [["titulo", "Título del libro"], ["fecha", "Año"], ["edicion", "Edición (si no es la 1.ª)", "2.ª"], ["editorial", "Editorial"], ["isbn", "ISBN"], ["doi", "DOI"], ["url", "Dirección web (si lo leíste en línea)"]],
    articulo: [["titulo", "Título del artículo"], ["fecha", "Año"], ["revista", "Revista"], ["volumen", "Volumen"], ["numero", "Número"], ["paginas", "Páginas", "54–58"], ["doi", "DOI"], ["url", "Dirección web"]],
    web: [["titulo", "Título de la página"], ["fecha", "Fecha (año o año-mes-día)", "2026-03-15"], ["sitio", "Sitio web"], ["url", "Dirección web"], ["consultado", "Consultado el", "2026-11-08"]],
    enciclopedia: [["titulo", "Título del artículo"], ["fecha", "Fecha de la última edición", "2026-11-03"], ["sitio", "Enciclopedia", "Wikipedia, la enciclopedia libre"], ["url", "Dirección web"]],
    video: [["titulo", "Título del video"], ["fecha", "Fecha (año o año-mes-día)"], ["medio", "Plataforma", "YouTube"], ["url", "Dirección web"]],
    capitulo: [["titulo", "Título del capítulo"], ["capitulo", "Título del libro"], ["editores", "Editores del libro", "E. Pérez y M. Ruiz"], ["fecha", "Año"], ["paginas", "Páginas", "23–45"], ["editorial", "Editorial"], ["doi", "DOI"]],
    otro: [["titulo", "Título"], ["fecha", "Año o fecha"], ["sitio", "Quién lo publica"], ["url", "Dirección web"]],
  };
  /** Formulario para agregar o cambiar una fuente, con "Llenar con un DOI, ISBN o dirección web". */
  function editarFuente(ed, inicial) {
    return new Promise((ok) => {
      let f = Object.assign({ tipo: "libro", autores: [] }, JSON.parse(JSON.stringify(inicial || {})));
      if (!f.fecha && f.anio) f.fecha = f.anio;
      const cuerpo = html(`<form class="col fuente-form" novalidate>
        <div class="campo"><label for="ff-auto">Llenar solo (DOI, ISBN o dirección web)</label>
          <div class="fila" style="gap:8px"><div class="entrada crece">${ico("wand-sparkles")}<input id="ff-auto" data-auto placeholder="10.1038/nature12373 · 978-607-… · https://…" autocomplete="off"></div><button type="button" class="btn" data-llenar>Buscar datos</button></div></div>
        <div class="campo"><label for="ff-tipo">Tipo de fuente</label><select id="ff-tipo" data-tipo class="select">${TIPOS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select></div>
        <div class="campo"><span class="etiqueta">Autores <span class="suave" style="font-weight:600">(si es una institución, escribe su nombre completo y marca la casilla)</span></span><div class="col" data-autores style="gap:6px"></div>
          <button type="button" class="btn chico" data-mas-autor style="align-self:flex-start">${ico("plus", "ico-s")} Otro autor</button></div>
        <div class="col" data-campos style="gap:10px"></div>
        <div class="fuente-previa"><span class="suave chico">Así queda en APA</span><p data-previa></p><span class="suave chico">En el texto: <b data-en-texto></b></span></div></form>`);
      const pie = html(`<div style="display:contents"><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si>Guardar fuente</button></div>`);
      const h = NOM.hoja({ titulo: inicial && inicial.id ? "Cambiar la fuente" : "Agregar una fuente", icono: "book-marked", cuerpo, pie, ancha: true, alCerrar: () => ok(null) });
      const leer = () => {
        f.tipo = $("[data-tipo]", cuerpo).value;
        $$("[data-campo]", cuerpo).forEach((x) => (f[x.dataset.campo] = x.value.trim()));
        f.anio = (String(f.fecha || "").match(/\d{4}/) || [])[0] || "";
        f.autores = $$(".autor-fila", cuerpo).map((r) => {
          const fam = $("[data-fam]", r).value.trim(), nom = $("[data-nom]", r).value.trim(), inst = $("[data-inst]", r).checked;
          return inst ? (fam ? { literal: fam } : null) : fam ? (nom ? { familia: fam, nombres: nom } : { familia: fam }) : null;
        }).filter(Boolean);
      };
      const previa = () => { leer(); $("[data-previa]", cuerpo).innerHTML = apaHtml(f); $("[data-en-texto]", cuerpo).textContent = enTexto(f); };
      const filaAutor = (a) => html(`<div class="autor-fila fila" style="gap:6px;align-items:center"><div class="entrada crece"><input data-fam placeholder="Apellidos (o institución)" value="${esc(a.literal || a.familia || "")}" autocomplete="off"></div>
        <div class="entrada crece"><input data-nom placeholder="Nombres" value="${esc(a.nombres || "")}" autocomplete="off"${a.literal ? " disabled" : ""}></div>
        <label class="chico suave" style="display:flex;gap:4px;align-items:center;font-weight:700"><input type="checkbox" data-inst${a.literal ? " checked" : ""}> Institución</label>
        <button type="button" class="icono-btn" data-quitar aria-label="Quitar autor">${ico("x")}</button></div>`);
      function pintar() {
        $("[data-tipo]", cuerpo).value = f.tipo;
        const ca = $("[data-autores]", cuerpo);
        ca.innerHTML = "";
        (f.autores && f.autores.length ? f.autores : [{}]).forEach((a) => ca.append(filaAutor(a)));
        $("[data-campos]", cuerpo).innerHTML = (CAMPOS_TIPO[f.tipo] || CAMPOS_TIPO.otro).map(([k, t, ph]) => `<div class="campo"><label for="ff-${k}">${esc(t)}</label><div class="entrada"><input id="ff-${k}" data-campo="${k}" value="${esc(f[k] || (k === "consultado" && f.tipo === "web" ? new Date().toISOString().slice(0, 10) : ""))}" placeholder="${esc(ph || "")}" autocomplete="off"></div></div>`).join("");
        previa();
      }
      pintar();
      cuerpo.addEventListener("input", (e) => { if (e.target.matches("[data-inst]")) { const r = e.target.closest(".autor-fila"); $("[data-nom]", r).disabled = e.target.checked; } previa(); });
      $("[data-tipo]", cuerpo).onchange = () => { leer(); pintar(); };
      $("[data-mas-autor]", cuerpo).onclick = () => { $("[data-autores]", cuerpo).append(filaAutor({})); };
      cuerpo.addEventListener("click", (e) => { const q = e.target.closest("[data-quitar]"); if (q) { q.closest(".autor-fila").remove(); previa(); } });
      $("[data-llenar]", cuerpo).onclick = async () => {
        const v = $("[data-auto]", cuerpo).value.trim();
        if (!v) return aviso("Pega un DOI, un ISBN o una dirección web", { tipo: "info" });
        const b = $("[data-llenar]", cuerpo);
        b.disabled = true; b.textContent = "Buscando…";
        try {
          const limpioIsbn = v.replace(/[^0-9Xx]/g, "");
          const ruta = /^(doi:|https?:\/\/(dx\.)?doi\.org\/)?10\.\d{4,9}\//i.test(v) ? "/api/fuentes/doi?doi=" + encodeURIComponent(v)
            : !/[a-z]{2,}\.[a-z]{2,}/i.test(v) && (limpioIsbn.length === 10 || limpioIsbn.length === 13) ? "/api/fuentes/isbn?isbn=" + encodeURIComponent(v)
            : "/api/fuentes/web?url=" + encodeURIComponent(v);
          const r = await api().get(ruta, undefined, { ms: 25000 });
          f = Object.assign({ autores: [] }, r.fuente);
          if (!f.fecha && f.anio) f.fecha = f.anio;
          pintar();
          aviso("Datos encontrados: revísalos antes de guardar", { tipo: "ok" });
        } catch (e) { aviso(e.red ? "Sin conexión: escribe los datos a mano" : e.message, { tipo: "aviso", ms: 5000 }); }
        finally { b.disabled = false; b.textContent = "Buscar datos"; }
      };
      const guardar = (e) => {
        e && e.preventDefault();
        leer();
        if (!f.titulo && !f.url) { aviso("Escribe al menos el título", { tipo: "aviso" }); return; }
        const r = Object.assign({}, f);
        delete r.id;
        // Primero se entrega el resultado: al cerrar, la hoja avisa "sin cambios" (y eso se ignora).
        ok(Object.assign(limpia(r), inicial && inicial.id ? { id: inicial.id } : {}));
        h.cerrar(true);
      };
      cuerpo.onsubmit = guardar;
      $("[data-si]", pie).onclick = guardar;
      $("[data-no]", pie).onclick = () => h.cerrar();
    });
  }

  // ================================================================== insertar en el texto
  const textoApi = (ed) => ed && ed.modoApi && ed.modoApi.textoApi;
  function citar(ed, fuente, pagina) {
    const t = textoApi(ed);
    if (!t) return aviso("Las citas se insertan en los documentos de texto", { tipo: "info" });
    t.insertarTramos([{ x: " " + enTexto(fuente, pagina) }], { o: "c" });
  }
  /** Lo que se inserta de una ficha: la cita textual entre comillas o el texto propio, con su cita. */
  function tramosDeFicha(ed, fi) {
    const f = fuenteDe(ed, fi.fuente) || {};
    const cita = enTexto(f, fi.pagina);
    if (fi.tipo === "textual") {
      const t = String(fi.texto || "").trim();
      // APA: menos de 40 palabras va entre comillas en el párrafo; más, en su propio bloque.
      return t.split(/\s+/).length >= 40 ? { bloque: true, tramos: [{ x: t + " " + cita }] } : { tramos: [{ x: "“" + t + "” " + cita }] };
    }
    return { tramos: [{ x: String(fi.texto || "").trim() + " " + cita }] };
  }
  function insertarFicha(ed, fi) {
    const t = textoApi(ed);
    if (!t) return;
    const r = tramosDeFicha(ed, fi);
    if (r.bloque) t.insertarParrafos([{ tramos: r.tramos, a: { estilo: "cita" }, meta: { o: "c" } }]);
    else t.insertarTramos(r.tramos, { o: "c" });
    aviso("Insertado con su cita", { tipo: "ok", ms: 1600 });
  }
  /** Lista de referencias en APA (con sangría francesa), en la sección "Referencias" (o al final). */
  function insertarReferencias(ed) {
    const t = textoApi(ed), fs = ordenar(fuentesDe(ed.doc));
    if (!t) return;
    if (!fs.length) return aviso("Primero agrega fuentes en Investigar → Fuentes", { tipo: "info" });
    const ps = fs.map((f) => ({ tramos: apa(f).map((x) => ({ x: x.x, a: x.i ? { i: true } : {} })), a: { francesa: 1.27, primera: 0 }, meta: { o: "r" } }));
    t.reemplazarSeccion(["Referencias", "Bibliografía", "Referencias bibliográficas"], ps, { encabezado: { estilo: "h1", alin: "centro" } });
    aviso(`Referencias listas (${fs.length}) en orden alfabético`, { tipo: "ok" });
  }

  // ================================================================== ficha de trabajo
  const TIPOS_FICHA = [["textual", "Textual", "Copias las palabras exactas del autor, entre comillas."], ["parafrasis", "Paráfrasis", "Lo explicas con tus palabras."], ["resumen", "Resumen", "Lo más importante, en pocas líneas."]];
  function editarFicha(ed, ficha) {
    return new Promise((ok) => {
      const fi = Object.assign({ tipo: "textual", texto: "", original: "", tema: "", pagina: "" }, ficha || {});
      const fs = fuentesDe(ed.doc);
      const temas = [...new Set(fichasDe(ed.doc).map((x) => x.tema).filter(Boolean))];
      const cuerpo = html(`<form class="col" novalidate>
        <div class="segmentado lleno" role="group" aria-label="Tipo de ficha" data-tipos>${TIPOS_FICHA.map(([v, t]) => `<button type="button" data-t="${v}" aria-pressed="${fi.tipo === v}">${t}</button>`).join("")}</div>
        <p class="suave chico" data-ayuda style="margin:0"></p>
        ${fi.original ? `<div class="ficha-original"><span class="suave chico">Lo que dice la fuente</span><blockquote>${esc(fi.original)}</blockquote></div>` : ""}
        <div class="campo"><label for="fi-t" data-et>Texto</label><textarea id="fi-t" rows="5" data-texto style="width:100%;border-radius:12px;border:1px solid var(--borde);background:var(--sup-2);padding:10px;font:600 15px/1.45 var(--fuente);color:var(--tinta)">${esc(fi.texto)}</textarea></div>
        <div class="fila" style="gap:10px;flex-wrap:wrap">
          <div class="campo crece"><label for="fi-f">Fuente</label><select id="fi-f" class="select" data-fuente>${fs.map((f) => `<option value="${esc(f.id)}"${f.id === fi.fuente ? " selected" : ""}>${esc(enTexto(f))} ${esc(corto(f.titulo))}</option>`).join("")}<option value="">Sin fuente todavía</option></select></div>
          <div class="campo" style="width:110px"><label for="fi-p">Página</label><div class="entrada"><input id="fi-p" data-pagina value="${esc(fi.pagina || "")}" placeholder="23" autocomplete="off"></div></div></div>
        <div class="campo"><label for="fi-tema">Tema o sección del trabajo</label><div class="entrada"><input id="fi-tema" data-tema list="fi-temas" value="${esc(fi.tema || "")}" placeholder="Por ejemplo: Introducción, Causas, Consecuencias…" autocomplete="off"></div><datalist id="fi-temas">${temas.map((t) => `<option value="${esc(t)}">`).join("")}</datalist></div></form>`);
      const pie = html(`<div style="display:contents"><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si>Guardar ficha</button></div>`);
      const h = NOM.hoja({ titulo: ficha && ficha.id ? "Cambiar la ficha" : "Nueva ficha de trabajo", icono: "notebook-pen", cuerpo, pie, ancha: true, alCerrar: () => ok(null) });
      const ta = $("[data-texto]", cuerpo);
      const pintarTipo = () => {
        const d = TIPOS_FICHA.find((x) => x[0] === fi.tipo);
        $("[data-ayuda]", cuerpo).textContent = d[2];
        $("[data-et]", cuerpo).textContent = fi.tipo === "textual" ? "Cita textual (las palabras exactas)" : fi.tipo === "parafrasis" ? "Tu paráfrasis (con tus palabras)" : "Tu resumen";
        // En la paráfrasis y el resumen se escribe desde cero: el original solo se muestra arriba.
        if (fi.tipo === "textual" && !ta.value.trim() && fi.original) ta.value = fi.original;
        if (fi.tipo !== "textual" && ta.value.trim() === String(fi.original || "").trim()) ta.value = "";
      };
      pintarTipo();
      $("[data-tipos]", cuerpo).onclick = (e) => { const b = e.target.closest("[data-t]"); if (!b) return; fi.tipo = b.dataset.t; $$("[data-t]", cuerpo).forEach((x) => x.setAttribute("aria-pressed", x === b)); pintarTipo(); };
      setTimeout(() => ta.focus(), 60);
      const guardar = (e) => {
        e && e.preventDefault();
        const texto = ta.value.trim();
        if (!texto) return aviso("Escribe el texto de la ficha", { tipo: "aviso" });
        if (fi.tipo !== "textual" && fi.original && texto === String(fi.original).trim()) return aviso("Una paráfrasis o un resumen se escriben con tus palabras, no copiando el original", { tipo: "aviso", ms: 5000 });
        const r = { tipo: fi.tipo, texto, original: fi.original || null, fuente: $("[data-fuente]", cuerpo).value || null, pagina: $("[data-pagina]", cuerpo).value.trim() || null, tema: $("[data-tema]", cuerpo).value.trim() || null, t: fi.t || Date.now() };
        const id = (ficha && ficha.id) || NOM.DocCRDT.nuevoId();
        ed.doc.cambiar("_doc", { ["ficha:" + id]: r });
        ok(Object.assign(r, { id }));
        h.cerrar(true);
      };
      cuerpo.onsubmit = guardar;
      $("[data-si]", pie).onclick = guardar;
      $("[data-no]", pie).onclick = () => h.cerrar();
    });
  }

  // ================================================================== panel Investigar
  let panel = null;   // { ed, cont, pestana, donde, lectura }
  const abierto = (ed) => panel && panel.ed === ed && panel.cont.isConnected;
  function cerrar() { if (panel && panel.cont.isConnected) panel.cont.parentElement.innerHTML = ""; panel = null; }
  function abrir(ed, pestana) {
    if (!textoApi(ed)) return aviso("Investigar funciona en los documentos de texto", { tipo: "info" });
    if (abierto(ed) && !pestana) { cerrar(); return; }
    if (NOM.comentarios && NOM.comentarios.cerrar) NOM.comentarios.cerrar();
    const lateral = $("[data-lateral]", ed.vista);
    lateral.innerHTML = `<div class="cajon investigar-cajon"><div class="cajon-cab"><h3>${ico("book-open", "ico-s")} Investigar</h3><button class="icono-btn" data-cerrar aria-label="Cerrar Investigar">${ico("x")}</button></div>
      <div class="segmentado lleno inv-pestanas" role="tablist" data-pestanas></div><div class="cajon-cuerpo" data-inv></div></div>`;
    panel = { ed, cont: lateral.firstElementChild, pestana: pestana || "buscar", donde: (panel && panel.donde) || "wikipedia", lectura: null, resultados: null, q: "" };
    $("[data-cerrar]", panel.cont).onclick = cerrar;
    $("[data-pestanas]", panel.cont).onclick = (e) => { const b = e.target.closest("[data-p]"); if (b) { panel.pestana = b.dataset.p; panel.lectura = null; pintar(); } };
    pintar();
  }
  function pintar() {
    if (!panel || !panel.cont.isConnected) return;
    const ed = panel.ed, n = fuentesDe(ed.doc).length, nf = fichasDe(ed.doc).length;
    $("[data-pestanas]", panel.cont).innerHTML = [["buscar", "Buscar"], ["fichas", `Fichas${nf ? ` (${nf})` : ""}`], ["fuentes", `Fuentes${n ? ` (${n})` : ""}`]]
      .map(([k, t]) => `<button type="button" role="tab" data-p="${k}" aria-selected="${panel.pestana === k}" aria-pressed="${panel.pestana === k}">${t}</button>`).join("");
    const c = $("[data-inv]", panel.cont);
    if (panel.pestana === "fichas") return pintarFichas(c);
    if (panel.pestana === "fuentes") return pintarFuentes(c);
    if (panel.lectura) return pintarLectura(c);
    pintarBuscar(c);
  }
  const DONDE = [["wikipedia", "Wikipedia"], ["libros", "Libros"], ["articulos", "Artículos"], ["biblioteca", "Biblioteca del espacio"]];
  function pintarBuscar(c) {
    const ed = panel.ed;
    c.innerHTML = `<form class="col" data-buscar style="gap:8px"><div class="entrada">${ico("search")}<input name="q" value="${esc(panel.q)}" placeholder="¿Qué investigas? Por ejemplo: fotosíntesis" autocomplete="off"></div>
      <div class="chips-donde">${DONDE.filter(([k]) => k !== "biblioteca" || !ed.local).map(([k, t]) => `<button type="button" class="chip-carpeta" data-donde="${k}" aria-pressed="${panel.donde === k}">${esc(t)}</button>`).join("")}</div></form>
      <div class="col" data-res style="gap:6px"></div>`;
    const f = $("[data-buscar]", c);
    f.onsubmit = (e) => { e.preventDefault(); panel.q = f.q.value.trim(); buscar(); };
    $$("[data-donde]", c).forEach((b) => (b.onclick = () => { panel.donde = b.dataset.donde; $$("[data-donde]", c).forEach((x) => x.setAttribute("aria-pressed", x === b)); if (panel.q || panel.donde === "biblioteca") { panel.q = f.q.value.trim(); buscar(); } }));
    pintarResultados();
    if (!panel.q) setTimeout(() => f.q.focus(), 50);
  }
  async function buscar() {
    const ed = panel.ed, donde = panel.donde, q = panel.q;
    const res = $("[data-res]", panel.cont);
    if (!q && donde !== "biblioteca") return;
    res.innerHTML = '<div class="esqueleto" style="height:64px"></div>'.repeat(3);
    try {
      panel.resultados = donde === "biblioteca"
        ? { donde, l: await api().get(`/api/espacios/${ed.espacio.id}/biblioteca${q ? "?q=" + encodeURIComponent(q) : ""}`) }
        : { donde, l: await api().get(`/api/fuentes/buscar?donde=${donde}&q=${encodeURIComponent(q)}`, undefined, { ms: 25000 }) };
    } catch (e) {
      panel.resultados = { donde, error: e.red || e.estado === 503 ? "Sin Internet. Busca en la biblioteca del espacio: ahí están las fuentes que el equipo guardó." : e.message };
    }
    pintarResultados();
  }
  function pintarResultados() {
    const res = panel && $("[data-res]", panel.cont);
    if (!res) return;
    const r = panel.resultados;
    if (!r) { res.innerHTML = `<div class="inv-ayuda"><p><b>Busca</b> en Wikipedia, libros y artículos. Abre un resultado, elige un pedazo y haz una <b>ficha</b>: textual, paráfrasis o resumen.</p><p>Las fichas se insertan en tu texto <b>con su cita</b> y la lista de referencias se arma sola en APA.</p></div>`; return; }
    if (r.error) { res.innerHTML = `<div class="alerta aviso">${ico("wifi-off")}<span>${esc(r.error)}</span></div>`; return; }
    if (!r.l.length) { res.innerHTML = `<p class="suave" style="font-weight:650">${r.donde === "biblioteca" ? "La biblioteca del espacio está vacía (o nada coincide). Guarda ahí lo que encuentres para leerlo sin Internet." : "No se encontró nada. Prueba con otras palabras."}</p>`; return; }
    res.innerHTML = r.l.map((x, i) => {
      if (r.donde === "wikipedia") return `<article class="inv-res"><b>${esc(x.titulo)}</b><p>${esc(x.resumen || "")}…</p><div class="fila"><button class="btn chico" data-leer="${i}">${ico("book-open", "ico-s")} Leer</button></div></article>`;
      const fu = x.fuente || {};
      return `<article class="inv-res"><b>${esc(fu.titulo || "Sin título")}</b><small class="suave">${esc([quienes(fu), anioDe(fu), fu.revista || fu.editorial].filter(Boolean).join(" · "))}${x.agregadoPor ? " · guardó " + esc(x.agregadoPor) : ""}</small>
        ${x.fragmento ? `<p>${esc(x.fragmento)}</p>` : ""}
        <div class="fila" style="flex-wrap:wrap">${r.donde === "biblioteca" && x.largo ? `<button class="btn chico" data-leer="${i}">${ico("book-open", "ico-s")} Leer</button>` : ""}<button class="btn chico" data-agregar="${i}">${ico("book-marked", "ico-s")} A mis fuentes</button>
        ${r.donde !== "biblioteca" && !panel.ed.local ? `<button class="btn chico" data-guardar="${i}" data-micro="Guardar en la biblioteca|Así el equipo la encuentra aunque no haya Internet.">${ico("library", "ico-s")} Biblioteca</button>` : ""}</div></article>`;
    }).join("");
    res.onclick = async (e) => {
      const ed = panel.ed, b = e.target.closest("button");
      if (!b) return;
      const i = +(b.dataset.leer ?? b.dataset.agregar ?? b.dataset.guardar), x = r.l[i];
      if (b.dataset.leer != null) {
        try {
          const d = r.donde === "wikipedia" ? await api().get(`/api/fuentes/wikipedia?titulo=${encodeURIComponent(x.titulo)}`, undefined, { ms: 25000 })
            : await api().get(`/api/espacios/${ed.espacio.id}/biblioteca/${x.id}`);
          panel.lectura = { fuente: d.fuente, texto: d.texto || "", deBiblioteca: r.donde === "biblioteca" };
          pintar();
        } catch (err) { aviso(err.message, { tipo: "error" }); }
      } else if (b.dataset.agregar != null) {
        guardarFuente(ed, x.fuente);
        aviso("Agregada a tus fuentes", { tipo: "ok", ms: 1500 });
        pintarPestanas();
      } else if (b.dataset.guardar != null) {
        guardarEnBiblioteca(ed, x.fuente, null);
      }
    };
  }
  const pintarPestanas = () => { if (panel) { const p = panel.pestana; pintar(); panel.pestana = p; } };
  async function guardarEnBiblioteca(ed, fuente, texto) {
    try { await api().post(`/api/espacios/${ed.espacio.id}/biblioteca`, { fuente, texto }); aviso("Guardada en la biblioteca del espacio", { tipo: "ok" }); }
    catch (e) { aviso(e.message, { tipo: "error" }); }
  }
  /** Lector: el texto en párrafos; se elige un pedazo y se hace una ficha. */
  function pintarLectura(c) {
    const ed = panel.ed, L = panel.lectura, f = L.fuente || {};
    const parrafos = String(L.texto || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
    c.innerHTML = `<div class="inv-lectura"><button class="btn chico" data-volver>${ico("chevron-left", "ico-s")} Resultados</button>
      <h4>${esc(f.titulo || "")}</h4><p class="suave chico">${apaHtml(f)}</p>
      <div class="fila" style="flex-wrap:wrap;gap:6px"><button class="btn chico" data-agregar>${ico("book-marked", "ico-s")} A mis fuentes</button>${!L.deBiblioteca && !ed.local ? `<button class="btn chico" data-guardar>${ico("library", "ico-s")} Guardar con su texto</button>` : ""}</div>
      <p class="inv-pista">${ico("text-select", "ico-s")} Elige un pedazo del texto y toca <b>Hacer ficha</b>.</p>
      <div class="inv-texto" data-texto>${parrafos.map((p) => /^=+\s*.+\s*=+$/.test(p) ? `<h5>${esc(p.replace(/=/g, "").trim())}</h5>` : `<p>${esc(p)}</p>`).join("") || '<p class="suave">Sin texto.</p>'}</div>
      <button class="btn primario inv-ficha" data-ficha hidden>${ico("notebook-pen", "ico-s")} Hacer ficha</button></div>`;
    $("[data-volver]", c).onclick = () => { panel.lectura = null; pintar(); };
    $("[data-agregar]", c).onclick = () => { guardarFuente(ed, f); aviso("Agregada a tus fuentes", { tipo: "ok", ms: 1500 }); pintarPestanas(); };
    const g = $("[data-guardar]", c); if (g) g.onclick = () => guardarEnBiblioteca(ed, f, L.texto);
    const bt = $("[data-ficha]", c), tx = $("[data-texto]", c);
    const elegido = () => { const s = getSelection(); return s.rangeCount && tx.contains(s.anchorNode) ? s.toString().trim() : ""; };
    // En el celular, tocar el botón puede quitar la selección: se recuerda la última.
    let ultimo = "";
    const revisar = () => { const e = elegido(); if (e) ultimo = e; bt.hidden = !e && !ultimo; };
    document.addEventListener("selectionchange", revisar);
    const quitarEscucha = () => document.removeEventListener("selectionchange", revisar);
    new MutationObserver((m, o) => { if (!c.contains(bt)) { quitarEscucha(); o.disconnect(); } }).observe(c, { childList: true });
    bt.onmousedown = (e) => e.preventDefault();
    bt.onclick = async () => {
      const original = elegido() || ultimo;
      if (!original) return;
      ultimo = "";
      const id = guardarFuente(ed, f);
      const fi = await editarFicha(ed, { tipo: "textual", original, fuente: id });
      if (fi) { aviso("Ficha guardada: está en la pestaña Fichas", { tipo: "ok" }); pintarPestanas(); }
    };
  }
  function pintarFichas(c) {
    const ed = panel.ed, fis = fichasDe(ed.doc);
    const grupos = new Map();
    fis.forEach((fi) => { const k = fi.tema || "Sin tema"; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(fi); });
    c.innerHTML = `<div class="fila" style="gap:6px;flex-wrap:wrap"><button class="btn chico" data-nueva>${ico("plus", "ico-s")} Nueva ficha</button><button class="btn chico primario" data-armar>${ico("list-tree", "ico-s")} Armar reporte…</button></div>
      ${fis.length ? [...grupos.entries()].map(([tema, l]) => `<h4 class="inv-tema">${esc(tema)} <small>${l.length}</small></h4>${l.map((fi) => {
        const fu = fuenteDe(ed, fi.fuente);
        return `<article class="inv-ficha" data-id="${esc(fi.id)}"><span class="chip chico ficha-${esc(fi.tipo)}">${esc((TIPOS_FICHA.find((x) => x[0] === fi.tipo) || [0, "Ficha"])[1])}</span>
          <p>${fi.tipo === "textual" ? "“" + esc(fi.texto) + "”" : esc(fi.texto)}</p><small class="suave">${fu ? esc(enTexto(fu, fi.pagina)) : "Sin fuente"}</small>
          <div class="fila" style="gap:4px"><button class="btn chico" data-ins>${ico("arrow-down-to-line", "ico-s")} Insertar</button><button class="icono-btn" data-editar aria-label="Cambiar">${ico("pencil", "ico-s")}</button><button class="icono-btn" data-borrar aria-label="Borrar">${ico("trash-2", "ico-s")}</button></div></article>`;
      }).join("")}`).join("") : `<div class="inv-ayuda"><p>Aún no tienes fichas. Busca un tema, ábrelo, elige un pedazo y toca <b>Hacer ficha</b>, o escribe una nueva.</p></div>`}`;
    $("[data-nueva]", c).onclick = async () => { if (await editarFicha(ed, {})) pintarPestanas(); };
    $("[data-armar]", c).onclick = () => armarReporte(ed);
    c.onclick = async (e) => {
      const art = e.target.closest("[data-id]");
      if (!art) return;
      const fi = fichasDe(ed.doc).find((x) => x.id === art.dataset.id);
      if (e.target.closest("[data-ins]")) insertarFicha(ed, fi);
      else if (e.target.closest("[data-editar]")) { if (await editarFicha(ed, fi)) pintarPestanas(); }
      else if (e.target.closest("[data-borrar]")) { ed.doc.cambiar("_doc", { ["ficha:" + fi.id]: null }); pintarPestanas(); }
    };
  }
  function pintarFuentes(c) {
    const ed = panel.ed, fs = ordenar(fuentesDe(ed.doc));
    c.innerHTML = `<div class="fila" style="gap:6px;flex-wrap:wrap"><button class="btn chico" data-agregar>${ico("plus", "ico-s")} Agregar fuente</button><button class="btn chico primario" data-refs ${fs.length ? "" : "disabled"}>${ico("list-ordered", "ico-s")} Poner las referencias</button></div>
      ${fs.length ? fs.map((f) => `<article class="inv-fuente" data-id="${esc(f.id)}"><p>${apaHtml(f)}</p><div class="fila" style="gap:4px;flex-wrap:wrap">
        <button class="btn chico" data-citar data-micro="Citar aquí|Pone ${esc(enTexto(f))} donde está tu cursor.">${ico("quote", "ico-s")} Citar ${esc(enTexto(f))}</button>
        <button class="icono-btn" data-editar aria-label="Cambiar la fuente">${ico("pencil", "ico-s")}</button><button class="icono-btn" data-quitar aria-label="Quitar la fuente">${ico("trash-2", "ico-s")}</button></div></article>`).join("")
        : `<div class="inv-ayuda"><p>Agrega los libros, artículos y páginas que usaste. Con un DOI, un ISBN o la dirección web se llenan solos.</p></div>`}`;
    $("[data-agregar]", c).onclick = async () => { const f = await editarFuente(ed); if (f) { guardarFuente(ed, f); pintarPestanas(); } };
    $("[data-refs]", c).onclick = () => insertarReferencias(ed);
    c.onclick = async (e) => {
      const art = e.target.closest("[data-id]");
      if (!art) return;
      const f = fuenteDe(ed, art.dataset.id);
      if (e.target.closest("[data-citar]")) {
        const pg = f.tipo === "libro" || f.tipo === "articulo" || f.tipo === "capitulo" ? await NOM.pedirTexto("Citar", { etiqueta: "Página (si citas palabras exactas; si no, déjalo vacío)", max: 12, si: "Citar" }) : "";
        if (pg === null) return;
        citar(ed, f, pg);
      } else if (e.target.closest("[data-editar]")) { const n = await editarFuente(ed, f); if (n) { ed.doc.cambiar("_doc", { ["fuente:" + f.id]: limpia(n) }); pintarPestanas(); } }
      else if (e.target.closest("[data-quitar]")) {
        const usada = fichasDe(ed.doc).some((x) => x.fuente === f.id);
        if (usada && !(await NOM.confirmar("Quitar la fuente", "Algunas fichas usan esta fuente: se quedarán sin referencia.", { si: "Quitar", peligro: true }))) return;
        ed.doc.cambiar("_doc", { ["fuente:" + f.id]: null });
        pintarPestanas();
      }
    };
  }

  // ================================================================== Armar reporte
  const MODELOS = {
    investigacion: { t: "Investigación", secciones: [
      ["Introducción", "¿De qué trata el tema? ¿Por qué lo elegiste? ¿Qué quieres averiguar?"],
      ["Antecedentes", "¿Qué se sabía antes? ¿Quién lo ha estudiado?"],
      ["Desarrollo", "¿Qué encontraste? Explícalo por partes, con ejemplos y datos."],
      ["Conclusiones", "¿Qué aprendiste? ¿Respondiste tu pregunta? ¿Qué falta por investigar?"]] },
    laboratorio: { t: "Práctica de laboratorio", secciones: [
      ["Objetivo", "¿Qué querías comprobar o medir?"], ["Hipótesis", "¿Qué creías que iba a pasar y por qué?"],
      ["Materiales y procedimiento", "¿Qué usaste? ¿Qué pasos seguiste?"], ["Resultados", "¿Qué observaste y mediste? (tablas y gráficas)"],
      ["Conclusiones", "¿Se cumplió tu hipótesis? ¿Por qué?"]] },
    ensayo: { t: "Ensayo", secciones: [
      ["Introducción", "Presenta el tema y tu postura (tesis)."], ["Desarrollo", "Da tus argumentos, cada uno con evidencia de tus fuentes."],
      ["Conclusión", "Retoma tu tesis y cierra con una reflexión."]] },
  };
  function armarReporte(ed) {
    const t = textoApi(ed);
    if (!t) return aviso("Armar reporte funciona en los documentos de texto", { tipo: "info" });
    let modelo = "investigacion";
    const fis = fichasDe(ed.doc);
    const u = api().usuario() || {};
    const cuerpo = html(`<form class="col" novalidate>
      <div class="segmentado lleno" role="group" aria-label="Tipo de trabajo" data-modelos>${Object.entries(MODELOS).map(([k, m]) => `<button type="button" data-m="${k}" aria-pressed="${k === modelo}">${esc(m.t)}</button>`).join("")}</div>
      <div class="fila" style="gap:10px;flex-wrap:wrap"><div class="campo crece"><label for="ar-t">Título</label><div class="entrada"><input id="ar-t" data-c="titulo" value="${esc(ed.doc.valor("_doc", "nombre") || "")}" autocomplete="off"></div></div>
        <div class="campo crece"><label for="ar-m">Materia</label><div class="entrada"><input id="ar-m" data-c="materia" autocomplete="off"></div></div></div>
      <div class="fila" style="gap:10px;flex-wrap:wrap"><div class="campo crece"><label for="ar-d">Docente</label><div class="entrada"><input id="ar-d" data-c="docente" autocomplete="off"></div></div>
        <div class="campo crece"><label for="ar-i">Integrantes</label><div class="entrada"><input id="ar-i" data-c="integrantes" value="${esc(u.nombre || "")}" autocomplete="off"></div></div></div>
      <div class="campo"><span class="etiqueta">Secciones (con sus preguntas guía)</span><div class="col" data-secciones style="gap:6px"></div>
        <button type="button" class="btn chico" data-mas style="align-self:flex-start">${ico("plus", "ico-s")} Otra sección</button></div>
      ${fis.length ? `<div class="campo"><span class="etiqueta">¿En qué sección va cada ficha?</span><div class="col" data-fichas style="gap:6px"></div></div>` : `<p class="suave chico" style="margin:0">Aún no hay fichas: el reporte saldrá con las preguntas guía y tus referencias.</p>`}
      <label class="fila chico" style="gap:6px;font-weight:700"><input type="checkbox" data-portada checked> Portada e índice</label></form>`);
    const pie = html(`<div style="display:contents"><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si>${ico("list-tree", "ico-s")} Armar al final del documento</button></div>`);
    const h = NOM.hoja({ titulo: "Armar reporte", icono: "list-tree", cuerpo, pie, ancha: true });
    const secs = () => $$(".ar-sec", cuerpo).map((r) => [$("[data-n]", r).value.trim(), $("[data-q]", r).value.trim()]).filter((x) => x[0]);
    function pintarSecciones(l) {
      $("[data-secciones]", cuerpo).innerHTML = l.map(([n, q]) => `<div class="ar-sec fila" style="gap:6px;align-items:center"><div class="entrada" style="width:34%"><input data-n value="${esc(n)}" aria-label="Sección"></div><div class="entrada crece"><input data-q value="${esc(q)}" aria-label="Preguntas guía"></div><button type="button" class="icono-btn" data-quitar aria-label="Quitar sección">${ico("x")}</button></div>`).join("");
      pintarFichasAr();
    }
    function pintarFichasAr() {
      const c = $("[data-fichas]", cuerpo);
      if (!c) return;
      const nombres = secs().map((x) => x[0]);
      const norm = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
      c.innerHTML = fis.map((fi) => {
        const sug = nombres.find((n) => norm(n) === norm(fi.tema)) || (nombres.length > 2 ? nombres[nombres.length - 2] : nombres[0]);
        return `<div class="fila" style="gap:8px;align-items:center"><span class="crece recorta chico"><b>${esc((TIPOS_FICHA.find((x) => x[0] === fi.tipo) || [0, ""])[1])}:</b> ${esc(String(fi.texto).slice(0, 80))}</span>
          <select class="select" data-ficha="${esc(fi.id)}">${nombres.map((n) => `<option${n === sug ? " selected" : ""}>${esc(n)}</option>`).join("")}<option value="">No usar</option></select></div>`;
      }).join("");
    }
    pintarSecciones(MODELOS[modelo].secciones);
    $("[data-modelos]", cuerpo).onclick = (e) => { const b = e.target.closest("[data-m]"); if (!b) return; modelo = b.dataset.m; $$("[data-m]", cuerpo).forEach((x) => x.setAttribute("aria-pressed", x === b)); pintarSecciones(MODELOS[modelo].secciones); };
    $("[data-mas]", cuerpo).onclick = () => { pintarSecciones(secs().concat([["Nueva sección", ""]])); };
    cuerpo.addEventListener("click", (e) => { const q = e.target.closest("[data-quitar]"); if (q) { q.closest(".ar-sec").remove(); pintarFichasAr(); } });
    cuerpo.addEventListener("change", (e) => { if (e.target.matches("[data-n]")) pintarFichasAr(); });
    $("[data-no]", pie).onclick = () => h.cerrar();
    $("[data-si]", pie).onclick = (e) => {
      e.preventDefault();
      const dato = (k) => ($(`[data-c="${k}"]`, cuerpo) || {}).value || "";
      const ss = secs();
      if (!ss.length) return aviso("Deja al menos una sección", { tipo: "aviso" });
      const asignadas = new Map();
      $$("[data-ficha]", cuerpo).forEach((s) => { if (s.value) { if (!asignadas.has(s.value)) asignadas.set(s.value, []); asignadas.get(s.value).push(fis.find((x) => x.id === s.dataset.ficha)); } });
      const R = { o: "r" }, ps = [];
      const p = (x, a, meta, attrsTexto) => ps.push({ tramos: [{ x, a: attrsTexto || {} }], a: a || {}, meta: meta || R });
      if ($("[data-portada]", cuerpo).checked) {
        p(dato("titulo") || "Título del trabajo", { estilo: "titulo", alin: "centro" });
        [dato("materia") && "Materia: " + dato("materia"), dato("docente") && "Docente: " + dato("docente"), dato("integrantes") && "Integrantes: " + dato("integrantes"),
          new Date().toLocaleDateString("es-MX", { dateStyle: "long" })].filter(Boolean).forEach((x) => p(x, { alin: "centro" }));
        ps.push({ tramos: [{ e: { tipo: "salto" } }], a: {}, meta: R });
        ps.push({ tramos: [{ e: { tipo: "indice" } }], a: {}, meta: R });
        ps.push({ tramos: [{ e: { tipo: "salto" } }], a: {}, meta: R });
      }
      ss.forEach(([n, q]) => {
        p(n, { estilo: "h1" });
        if (q) p("Preguntas guía: " + q, {}, R, { i: true, color: "#6B6875" });
        (asignadas.get(n) || []).forEach((fi) => {
          const r = tramosDeFicha(ed, fi);
          ps.push({ tramos: r.tramos, a: r.bloque ? { estilo: "cita" } : {}, meta: { o: "c" } });
        });
      });
      // Las referencias van al final del reporte, en orden alfabético y con sangría francesa.
      const fs = ordenar(fuentesDe(ed.doc));
      if (fs.length) {
        p("Referencias", { estilo: "h1", alin: "centro" });
        fs.forEach((f) => ps.push({ tramos: apa(f).map((x) => ({ x: x.x, a: x.i ? { i: true } : {} })), a: { francesa: 1.27, primera: 0 }, meta: R }));
      }
      t.insertarParrafos(ps, { alFinal: true });
      h.cerrar(true);
      aviso("Reporte armado: reemplaza las preguntas guía con tu texto", { tipo: "ok", ms: 5000 });
    };
  }

  NOM.citas = { apa, apaTexto, apaHtml, enTexto, ordenar, fuentesDe, fichasDe, guardarFuente, editarFuente, editarFicha, citar, insertarFicha, insertarReferencias, armarReporte, abrir, cerrar, TIPOS };
})();
