/* NOM-COLAB · Modo Texto. Cada párrafo es un Bloque; así dos personas pueden escribir
   en párrafos distintos al mismo tiempo sin pisarse. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso } = NOM;

  const ESTILOS = [
    { v: "p", t: "Texto", i: "type", md: "" },
    { v: "h1", t: "Título", i: "heading-1", md: "# " },
    { v: "h2", t: "Subtítulo", i: "heading-2", md: "## " },
    { v: "lista", t: "Lista", i: "list", md: "- " },
    { v: "tarea", t: "Tareas", i: "list-checks", md: "[] " },
    { v: "cita", t: "Cita", i: "quote", md: "> " },
  ];
  const PERMITIDAS = new Set(["B", "STRONG", "I", "EM", "U", "BR", "A", "S", "CODE"]);

  /** Solo se guardan negritas, cursivas, subrayado, enlaces y saltos de línea. */
  function limpiar(nodo) {
    const fuera = document.createElement("div");
    (function copiar(desde, hacia) {
      desde.childNodes.forEach((n) => {
        if (n.nodeType === 3) hacia.append(n.textContent);
        else if (n.nodeType === 1) {
          if (PERMITIDAS.has(n.tagName)) {
            const c = document.createElement(n.tagName === "STRONG" ? "b" : n.tagName === "EM" ? "i" : n.tagName.toLowerCase());
            if (n.tagName === "A" && /^https?:/i.test(n.getAttribute("href") || "")) { c.setAttribute("href", n.getAttribute("href")); c.setAttribute("target", "_blank"); }
            hacia.append(c);
            copiar(n, c);
          } else if (n.tagName === "DIV" || n.tagName === "P") { if (hacia.childNodes.length) hacia.append(document.createElement("br")); copiar(n, hacia); }
          else copiar(n, hacia);
        }
      });
    })(nodo, fuera);
    let h = fuera.innerHTML;
    if (h === "<br>") h = "";
    return h;
  }

  // ------------------------------------------------------------ cursor
  function offsetCursor(el) {
    const s = getSelection();
    if (!s.rangeCount || !el.contains(s.anchorNode)) return null;
    const r = s.getRangeAt(0).cloneRange();
    r.selectNodeContents(el);
    r.setEnd(s.anchorNode, s.anchorOffset);
    return r.toString().length;
  }
  function ponerCursor(el, n) {
    const r = document.createRange();
    let resta = n, nodo = null, off = 0;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const t = w.currentNode;
      if (resta <= t.length) { nodo = t; off = resta; break; }
      resta -= t.length;
    }
    if (nodo) r.setStart(nodo, off); else { r.selectNodeContents(el); r.collapse(n === 0); }
    r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  const alInicio = (el) => offsetCursor(el) === 0 && getSelection().isCollapsed;
  const alFinal = (el) => offsetCursor(el) === el.textContent.length && getSelection().isCollapsed;

  // ------------------------------------------------------------ modo
  NOM.modos.TEXTO = {
    montar(ed) {
      const doc = () => ed.doc;
      const papel = html(`<article class="papel" aria-label="Documento"></article>`);
      ed.lienzo.append(papel);
      const pendientes = new Map(); // id -> debounce de guardado
      let flotante = null;

      // Documento recién creado sin bloques: un párrafo con id fijo (si dos lo crean a la vez, es el mismo).
      if (!ed.soloLectura && !doc().vivos().some((b) => b.tipo === "texto")) {
        doc().cambiar("inicio-" + doc().paginas()[0], { tipo: "texto", pagina: doc().paginas()[0], orden: 1, estilo: "p", html: "" }, { deshacible: false });
      }

      function guardarAhora(id) { const f = pendientes.get(id); if (f) f.ya(); }
      function guardarTodo() { pendientes.forEach((f) => f.ya()); }
      function programarGuardado(el) {
        const id = el.closest("[data-id]").dataset.id;
        if (!pendientes.has(id)) {
          pendientes.set(id, NOM.debounce(() => {
            const e = papel.querySelector(`[data-id="${id}"] .b-texto`);
            if (!e) return;
            const h = limpiar(e);
            if (h !== (doc().valor(id, "html") || "")) doc().cambiar(id, { html: h }, { grupo: "txt-" + id, origen: "teclado" });
          }, 250));
        }
        pendientes.get(id)();
      }

      function bloquesOrdenados() {
        const pags = doc().paginas();
        return pags.map((p) => ({ p, bs: doc().deLaPagina(p).filter((b) => b.tipo !== "conector") }));
      }

      function pintarBloque(b, soloTexto) {
        const editable = !ed.soloLectura;
        if (b.tipo === "texto") {
          return `<div class="b-envoltura" data-id="${esc(b.id)}" style="position:relative">
            ${b.estilo === "tarea" ? `<button class="casilla ${b.hecho ? "marcada" : ""}" data-casilla aria-label="Marcar tarea" ${editable ? "" : "disabled"}>${b.hecho ? ico("check") : ""}</button>` : ""}
            <div class="b-texto ${soloTexto ? "solo" : ""}" data-estilo="${esc(b.estilo || "p")}" data-hecho="${!!b.hecho}" ${editable ? 'contenteditable="true"' : ""} spellcheck="true"
              data-ph="${b.estilo === "h1" ? "Título" : b.estilo === "h2" ? "Subtítulo" : "Escribe algo, o pulsa / para insertar"}">${b.html || ""}</div></div>`;
        }
        if (b.tipo === "tabla") {
          // Tabla editable en el mismo documento: cada celda se guarda sola al escribir.
          const { filas, cols } = tamanoTabla(b);
          const filasHtml = [];
          for (let f = 0; f < filas; f++) {
            const celdas = [];
            for (let c = 0; c < cols; c++) {
              const ref = NOM.formulas.ref(c, f);
              celdas.push(`<td><div class="b-celda" data-celda="${ref}" ${editable ? 'contenteditable="plaintext-only"' : ""} aria-label="Celda ${ref}">${esc(b["c:" + ref] || "")}</div></td>`);
            }
            filasHtml.push("<tr>" + celdas.join("") + "</tr>");
          }
          return `<div class="b-incrustado b-tabla" data-id="${esc(b.id)}">
            <table>${filasHtml.join("")}</table>
            ${editable ? `<div class="fila"><button class="btn plano chico" data-mas="fila">${ico("plus", "ico-s")} Fila</button><button class="btn plano chico" data-mas="col">${ico("plus", "ico-s")} Columna</button></div>` : ""}</div>`;
        }
        if (b.tipo === "imagen") return `<div class="b-incrustado imagen" data-id="${esc(b.id)}"><img src="${esc(b.src)}" alt="${esc(b.alt || "")}" loading="lazy"></div>`;
        if (b.tipo === "forma") return `<div class="b-incrustado" data-id="${esc(b.id)}" data-micro="Bloque libre|Esta figura viene del modo Diagrama o Presentación; se conserva aquí.">${ico(b.figura === "elipse" ? "circle" : b.figura === "rombo" ? "diamond" : b.figura === "nota" ? "sticky-note" : "square")}<span>${esc(b.texto || "Figura")}</span><span class="etq" style="margin-left:auto">bloque libre</span></div>`;
        return "";
      }

      /** Filas y columnas que se muestran: las que tienen datos (mínimo 3x3), o las que se agregaron. */
      function tamanoTabla(b) {
        let ff = 0, cc = 0;
        Object.keys(b).forEach((k) => {
          if (!k.startsWith("c:") || !b[k]) return;
          const r = NOM.formulas.parseRef(k.slice(2));
          if (r) { ff = Math.max(ff, r.f + 1); cc = Math.max(cc, r.c + 1); }
        });
        return { filas: Math.min(Math.max(3, ff, b.filasTexto || 0), 100), cols: Math.min(Math.max(3, cc, b.colsTexto || 0), 12) };
      }

      function render() {
        // Se conserva dónde estaba el cursor para que un cambio remoto no lo mueva.
        const celdaActiva = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-celda]");
        const refActiva = celdaActiva && papel.contains(celdaActiva) ? { id: celdaActiva.closest("[data-id]").dataset.id, ref: celdaActiva.dataset.celda } : null;
        const activo = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-id]");
        const idActivo = activo && papel.contains(activo) ? activo.dataset.id : null;
        const off = idActivo ? offsetCursor(document.activeElement) : null;
        const grupos = bloquesOrdenados();
        const unico = grupos.length === 1 && grupos[0].bs.length === 1 && grupos[0].bs[0].tipo === "texto";
        papel.innerHTML = grupos.map((g, i) => (i > 0 ? `<div class="pagina-sep">Página ${i + 1}</div>` : "") + g.bs.map((b) => pintarBloque(b, unico)).join("")).join("");
        if (refActiva) {
          const el = papel.querySelector(`[data-id="${refActiva.id}"] [data-celda="${refActiva.ref}"]`);
          if (el) { el.focus({ preventScroll: true }); ponerCursor(el, el.textContent.length); }
        } else if (idActivo) {
          const el = papel.querySelector(`[data-id="${idActivo}"] .b-texto`);
          if (el) { el.focus({ preventScroll: true }); if (off != null) ponerCursor(el, Math.min(off, el.textContent.length)); }
        }
        ed.pintarPresencia();
      }

      function enfocar(id, donde) {
        const el = papel.querySelector(`[data-id="${id}"] .b-texto`);
        if (!el) return;
        el.focus();
        ponerCursor(el, donde === "fin" ? el.textContent.length : typeof donde === "number" ? donde : 0);
      }

      const textos = () => $$(".b-envoltura", papel).map((x) => x.dataset.id);
      function vecino(id, dir) {
        const ids = textos();
        return ids[ids.indexOf(id) + dir];
      }

      function crearDespues(id, campos) {
        const b = doc().bloque(id);
        const todos = doc().deLaPagina(b.pagina || doc().paginas()[0]);
        const i = todos.findIndex((x) => x.id === id);
        const sig = todos[i + 1];
        const nuevo = NOM.DocCRDT.nuevoId();
        doc().cambiar(nuevo, Object.assign({ tipo: "texto", pagina: b.pagina || doc().paginas()[0], orden: NOM.DocCRDT.entre(b.orden, sig && sig.orden), estilo: "p", html: "" }, campos));
        return nuevo;
      }

      // ------------------------------------------------------------ teclado
      papel.addEventListener("keydown", (e) => {
        const el = e.target.closest(".b-texto");
        if (!el || ed.soloLectura) return;
        const id = el.closest("[data-id]").dataset.id;
        const b = doc().bloque(id);

        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          guardarAhora(id);
          if (!el.textContent && (b.estilo === "lista" || b.estilo === "tarea" || b.estilo === "cita")) {
            doc().cambiar(id, { estilo: "p" });   // Enter en un elemento vacío de lista termina la lista
            render(); enfocar(id);
            return;
          }
          // Divide el párrafo en el cursor.
          const s = getSelection();
          const r = s.getRangeAt(0);
          r.deleteContents();
          const resto = document.createRange();
          resto.setStart(r.startContainer, r.startOffset);
          resto.setEnd(el, el.childNodes.length);
          const frag = resto.extractContents();
          const tmp = document.createElement("div"); tmp.append(frag);
          const sigEstilo = ["lista", "tarea"].includes(b.estilo) ? b.estilo : "p";
          doc().lote(() => {
            doc().cambiar(id, { html: limpiar(el) });
            const n = crearDespues(id, { estilo: sigEstilo, html: limpiar(tmp) });
            render(); enfocar(n, 0);
          });
          return;
        }
        if (e.key === "Backspace" && alInicio(el)) {
          if (b.estilo && b.estilo !== "p") {
            e.preventDefault(); guardarAhora(id);
            doc().cambiar(id, { estilo: "p", hecho: false }); render(); enfocar(id);
            return;
          }
          const prev = vecino(id, -1);
          if (!prev) return;
          const pb = doc().bloque(prev);
          if (pb.tipo !== "texto") return;
          e.preventDefault(); guardarAhora(id);
          const prevEl = papel.querySelector(`[data-id="${prev}"] .b-texto`);
          const union = prevEl.textContent.length;
          doc().lote(() => {
            doc().cambiar(prev, { html: (pb.html || "") + limpiar(el) });
            doc().cambiar(id, { eliminado: true });
          });
          render(); enfocar(prev, union);
          return;
        }
        if (e.key === "ArrowUp" && alInicio(el)) { const p = vecino(id, -1); if (p) { e.preventDefault(); enfocar(p, "fin"); } }
        if (e.key === "ArrowDown" && alFinal(el)) { const n = vecino(id, 1); if (n) { e.preventDefault(); enfocar(n, 0); } }
        if (e.key === "/" && !el.textContent) { e.preventDefault(); menuInsertar(el, id); }
        if ((e.ctrlKey || e.metaKey) && ["b", "i", "u"].includes(e.key.toLowerCase())) {
          e.preventDefault();
          formato({ b: "bold", i: "italic", u: "underline" }[e.key.toLowerCase()]);
        }
      });

      // Celdas de tabla: se guardan 250 ms después de dejar de escribir, como los párrafos.
      const pendCeldas = new Map();
      papel.addEventListener("input", (e) => {
        const cel = e.target.closest("[data-celda]");
        if (!cel || ed.soloLectura) return;
        const id = cel.closest("[data-id]").dataset.id, ref = cel.dataset.celda, k = id + "!" + ref;
        if (!pendCeldas.has(k)) pendCeldas.set(k, NOM.debounce(() => {
          const el = papel.querySelector(`[data-id="${id}"] [data-celda="${ref}"]`);
          if (el && el.textContent !== (doc().valor(id, "c:" + ref) || "")) doc().cambiar(id, { ["c:" + ref]: el.textContent }, { grupo: "celda-" + k, origen: "teclado" });
        }, 250));
        pendCeldas.get(k)();
      });
      papel.addEventListener("keydown", (e) => {
        const cel = e.target.closest("[data-celda]");
        if (!cel || e.key !== "Enter" && e.key !== "Tab") return;
        // Enter baja una fila; Tab avanza una celda (como en una hoja de cálculo).
        e.preventDefault();
        const td = cel.closest("td"), tr = td.parentElement, i = [...tr.children].indexOf(td);
        const sig = e.key === "Enter" ? tr.nextElementSibling && tr.nextElementSibling.children[i] : (td.nextElementSibling || tr.nextElementSibling && tr.nextElementSibling.children[0]);
        if (sig) { const c = sig.querySelector("[data-celda]"); c.focus(); ponerCursor(c, c.textContent.length); }
      });
      papel.addEventListener("input", (e) => {
        const el = e.target.closest(".b-texto");
        if (!el) return;
        const id = el.closest("[data-id]").dataset.id;
        // Atajos estilo Markdown al inicio del párrafo.
        const b = doc().bloque(id);
        if (b && (b.estilo || "p") === "p") {
          const t = el.textContent;
          const atajo = ESTILOS.find((x) => x.md && t.startsWith(x.md.replace(/ $/, " ")) || (x.md && t.startsWith(x.md)));
          if (atajo) {
            el.innerHTML = el.innerHTML.replace(/^(\[\]|#{1,2}|-|>)(\s|&nbsp;)/, "");
            doc().cambiar(id, { estilo: atajo.v, html: limpiar(el) });
            render(); enfocar(id);
            return;
          }
        }
        el.classList.remove("solo");
        programarGuardado(el);
      });

      papel.addEventListener("paste", (e) => {
        const el = e.target.closest(".b-texto");
        if (!el || ed.soloLectura) return;
        e.preventDefault();
        const t = (e.clipboardData || window.clipboardData).getData("text/plain").replace(/\r\n?/g, "\n");
        const lineas = t.split("\n");
        document.execCommand("insertText", false, lineas[0]);
        if (lineas.length > 1) {
          const id = el.closest("[data-id]").dataset.id;
          guardarAhora(id);
          doc().lote(() => {
            let ultimo = id;
            lineas.slice(1).forEach((l) => (ultimo = crearDespues(ultimo, { html: esc(l) })));
            render(); enfocar(ultimo, "fin");
          });
        }
      });

      papel.addEventListener("click", (e) => {
        const c = e.target.closest("[data-casilla]");
        if (c && !ed.soloLectura) {
          const id = c.closest("[data-id]").dataset.id;
          doc().cambiar(id, { hecho: !doc().valor(id, "hecho") });
          render();
          return;
        }
        const mas = e.target.closest("[data-mas]");
        if (mas && !ed.soloLectura) {
          const id = mas.closest("[data-id]").dataset.id, b = doc().bloque(id), t = tamanoTabla(b);
          doc().cambiar(id, mas.dataset.mas === "fila" ? { filasTexto: t.filas + 1 } : { colsTexto: Math.min(12, t.cols + 1) });
          render();
          return;
        }
        // Clic en el espacio en blanco al final: enfoca (o crea) el último párrafo.
        if (e.target === papel && !ed.soloLectura) {
          const ids = textos();
          const ultimo = ids[ids.length - 1];
          if (ultimo && !doc().valor(ultimo, "html")) enfocar(ultimo);
          else if (ultimo) { const n = crearDespues(ultimo, {}); render(); enfocar(n); }
        }
      });
      papel.addEventListener("focusin", (e) => { const b = e.target.closest("[data-id]"); if (b) { ed.seleccionar(b.dataset.id); pintarHerr(); } });
      papel.addEventListener("focusout", (e) => {
        const b = e.target.closest && e.target.closest("[data-id]");
        if (b) guardarAhora(b.dataset.id);
        setTimeout(() => { if (!papel.contains(document.activeElement)) ed.seleccionar(null); }, 50);
      });

      // ------------------------------------------------------------ barra flotante de formato
      function alSeleccionar() {
        const s = getSelection();
        if (flotante) { flotante.remove(); flotante = null; }
        if (ed.soloLectura || !s.rangeCount || s.isCollapsed) return;
        const el = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest(".b-texto");
        if (!el || !papel.contains(el)) return;
        const r = s.getRangeAt(0).getBoundingClientRect();
        const base = ed.lienzo.getBoundingClientRect();
        flotante = html(`<div class="flotante" role="toolbar" aria-label="Formato">
          <button class="icono-btn" data-f="bold" data-micro="Negrita||Ctrl+B">${ico("bold")}</button>
          <button class="icono-btn" data-f="italic" data-micro="Cursiva||Ctrl+I">${ico("italic")}</button>
          <button class="icono-btn" data-f="underline" data-micro="Subrayado||Ctrl+U">${ico("underline")}</button>
          <button class="icono-btn" data-f="link" data-micro="Enlace|Convierte el texto en un enlace.">${ico("link")}</button></div>`);
        flotante.style.left = Math.max(8, r.left - base.left + ed.lienzo.scrollLeft + r.width / 2 - 80) + "px";
        flotante.style.top = r.top - base.top + ed.lienzo.scrollTop - 52 + "px";
        flotante.addEventListener("pointerdown", (e) => e.preventDefault());
        $$("[data-f]", flotante).forEach((b) => (b.onclick = () => formato(b.dataset.f)));
        ed.lienzo.append(flotante);
      }
      const selDebounce = NOM.debounce(alSeleccionar, 180);
      document.addEventListener("selectionchange", selDebounce);

      function formato(cmd) {
        const el = document.activeElement && document.activeElement.closest && document.activeElement.closest(".b-texto");
        if (!el) return;
        if (cmd === "link") {
          NOM.pedirTexto("Agregar enlace", { etiqueta: "Dirección (https://…)", ph: "https://", si: "Agregar" }).then((url) => {
            if (!url) return;
            el.focus();
            document.execCommand("createLink", false, /^https?:\/\//.test(url) ? url : "https://" + url);
            programarGuardado(el);
          });
          return;
        }
        document.execCommand(cmd);
        programarGuardado(el);
      }

      // ------------------------------------------------------------ insertar
      function insertar(tipo, id) {
        const ancla = id || ed.seleccion || textos().slice(-1)[0];
        if (!ancla) return;
        guardarTodo();
        if (ESTILOS.some((s) => s.v === tipo)) {
          doc().cambiar(ancla, { estilo: tipo });
          render(); enfocar(ancla, "fin");
          return;
        }
        const b = doc().bloque(ancla);
        const pagina = b.pagina || doc().paginas()[0];
        const todos = doc().deLaPagina(pagina);
        const sig = todos[todos.findIndex((x) => x.id === ancla) + 1];
        const orden = NOM.DocCRDT.entre(b.orden, sig && sig.orden);
        if (tipo === "tabla") {
          const nid = NOM.DocCRDT.nuevoId();
          doc().cambiar(nid, { tipo: "tabla", pagina, orden, filas: 30, cols: 10, x: 40, y: 40, w: 880, h: 300 });
          render();
          const c = papel.querySelector(`[data-id="${nid}"] [data-celda="A1"]`);
          if (c) c.focus();
        } else if (tipo === "imagen") {
          ed.pedirImagen().then((img) => {
            if (!img) return;
            const k = Math.min(1, 640 / img.w);
            doc().cambiar(NOM.DocCRDT.nuevoId(), { tipo: "imagen", pagina, orden, src: img.src, x: 80, y: 80, w: Math.round(img.w * k), h: Math.round(img.h * k), z: 1 });
            render();
          });
        } else if (tipo === "pagina") {
          const p = ed.nuevaPagina(pagina);
          const nid = NOM.DocCRDT.nuevoId();
          doc().cambiar(nid, { tipo: "texto", pagina: p, orden: 1, estilo: "p", html: "" });
          render(); enfocar(nid);
        }
      }

      function menuInsertar(el, id) {
        const r = el.getBoundingClientRect();
        NOM.menu({ getBoundingClientRect: () => r }, [
          { titulo: "Convertir en" },
          ...ESTILOS.map((s) => ({ texto: s.t, icono: s.i, atajo: s.md.trim() || null, fn: () => insertar(s.v, id) })),
          { titulo: "Insertar" },
          { texto: "Tabla", icono: "table", fn: () => insertar("tabla", id) },
          { texto: "Imagen", icono: "image", fn: () => insertar("imagen", id) },
          { texto: "Página nueva", icono: "file-text", fn: () => insertar("pagina", id) },
        ]);
      }

      // ------------------------------------------------------------ barra de herramientas
      let selEstilo;
      function pintarHerr() {
        if (!selEstilo) return;
        const id = ed.seleccion;
        selEstilo.value = (id && doc().valor(id, "estilo")) || "p";
      }
      this._herr = [
        {
          html: `<select class="mini-select" aria-label="Estilo de párrafo" data-micro="Estilo de párrafo|Título, subtítulo, lista, tareas o cita. Atajo: escribe # o - al inicio.">${ESTILOS.map((s) => `<option value="${s.v}">${s.t}</option>`).join("")}</select>`,
          montar: (n) => { selEstilo = n; n.onchange = () => { const id = ed.seleccion || textos()[0]; insertar(n.value, id); }; n.addEventListener("pointerdown", () => {}); },
        },
        { id: "negrita", icono: "bold", micro: "Negrita|Resalta el texto seleccionado.|Ctrl+B", fn: () => formato("bold") },
        { id: "cursiva", icono: "italic", micro: "Cursiva||Ctrl+I", fn: () => formato("italic") },
        { id: "subrayado", icono: "underline", micro: "Subrayado||Ctrl+U", fn: () => formato("underline") },
        "|",
        { id: "lista", icono: "list", micro: "Lista|Convierte el párrafo en viñeta. Atajo: - al inicio.", fn: () => insertar(doc().valor(ed.seleccion, "estilo") === "lista" ? "p" : "lista") },
        { id: "tareas", icono: "list-checks", micro: "Lista de tareas|Casillas para marcar pendientes. Atajo: [] al inicio.", fn: () => insertar(doc().valor(ed.seleccion, "estilo") === "tarea" ? "p" : "tarea") },
        { id: "tabla", icono: "table", micro: "Insertar tabla|Se edita con fórmulas en el modo Hoja.", fn: () => insertar("tabla") },
        { id: "imagen", icono: "image", micro: "Insertar imagen|Desde tu equipo; se comprime para no pesar.", fn: () => insertar("imagen"), mantenerFoco: true },
      ];

      // ------------------------------------------------------------ cambios
      this.cambios = (lista, origen) => {
        if (origen === "teclado") return;
        const estructura = lista.some((c) => ["eliminado", "orden", "pagina", "estilo", "tipo", "hecho", "paginas", "filasTexto", "colsTexto"].some((k) => k in c.campos) || c.bloque === "_doc" && "paginas" in c.campos);
        if (estructura || lista.some((c) => !papel.querySelector(`[data-id="${c.bloque}"]`) && c.bloque !== "_doc")) { render(); return; }
        lista.forEach((c) => {
          Object.keys(c.campos).filter((k) => k.startsWith("c:")).forEach((k) => {
            const el = papel.querySelector(`[data-id="${c.bloque}"] [data-celda="${k.slice(2)}"]`);
            if (!el) { render(); return; }
            if (document.activeElement !== el) el.textContent = c.campos[k] || "";
          });
          if (!("html" in c.campos) && !("texto" in c.campos)) return;
          const cont = papel.querySelector(`[data-id="${c.bloque}"]`);
          const el = cont && cont.querySelector(".b-texto");
          if (!el) { render(); return; }
          if (document.activeElement === el) {
            const off = offsetCursor(el);
            el.innerHTML = c.campos.html || "";
            ponerCursor(el, Math.min(off || 0, el.textContent.length));
          } else el.innerHTML = c.campos.html || "";
        });
      };
      this.desmontar = () => {
        guardarTodo();
        document.removeEventListener("selectionchange", selDebounce);
        if (flotante) flotante.remove();
      };

      render();
      // En escritorio se empieza a escribir sin hacer clic (el lienzo es la tarea principal).
      if (!ed.soloLectura && matchMedia("(hover: hover)").matches && !ed.previa) {
        const ids = textos();
        const vacio = ids.find((i) => !doc().valor(i, "html"));
        if (vacio && ids.length <= 2) setTimeout(() => enfocar(vacio), 60);
      }
    },
    herramientas() { return this._herr || []; },
  };
})();
