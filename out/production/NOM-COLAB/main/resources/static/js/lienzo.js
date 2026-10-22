/* NOM-COLAB · Lienzo libre: modos Presentación y Diagrama.
   Los dos usan la misma posición x, y, ancho, alto y z de cada Bloque; por eso un
   bloque que creaste en el diagrama aparece en el mismo lugar de la diapositiva. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso } = NOM;
  const ANCHO = 960, ALTO = 540;
  const PALETA = ["#CFE0FF", "#CDEFD9", "#FFE0BF", "#E4D9FF", "#FFD6DE", "#FFF1B8", "#E7E5EE", "#FFFFFF", "#5B5BD6", "#2B2A33"];
  const oscuro = (c) => ["#5B5BD6", "#2B2A33"].includes(c);

  // ------------------------------------------------------------ geometría
  function borde(b, hacia) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const dx = hacia.x - cx, dy = hacia.y - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    let k;
    if (b.figura === "elipse") k = 1 / Math.sqrt((dx * dx) / ((b.w / 2) ** 2) + (dy * dy) / ((b.h / 2) ** 2));
    else if (b.figura === "rombo") k = 1 / (Math.abs(dx) / (b.w / 2) + Math.abs(dy) / (b.h / 2));
    else k = Math.min(Math.abs((b.w / 2) / (dx || 1e-9)), Math.abs((b.h / 2) / (dy || 1e-9)));
    return { x: cx + dx * k, y: cy + dy * k };
  }
  function conector(a, b) {
    const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const p1 = borde(a, cb), p2 = borde(b, ca);
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const sep = 6;   // la flecha no toca la figura
    return { x1: p1.x + ((p2.x - p1.x) / d) * 2, y1: p1.y + ((p2.y - p1.y) / d) * 2, x2: p2.x - ((p2.x - p1.x) / d) * sep, y2: p2.y - ((p2.y - p1.y) / d) * sep };
  }
  NOM.geometria = { conector };

  function contenido(b) {
    if (b.tipo === "texto") return `<div class="libre-texto" data-estilo="${esc(b.estilo || "p")}" data-ph="${esc(b.ph || "Escribe aquí")}">${b.html || ""}</div>`;
    if (b.tipo === "forma") return `<div class="forma" data-figura="${esc(b.figura || "rect")}" style="--cf:${esc(b.color || "#E7E5EE")};${oscuro(b.color) ? "--tinta-forma:#fff" : ""}"><div class="txt" data-ph="Texto">${esc(b.texto || "")}</div></div>`;
    if (b.tipo === "imagen") return `<img class="libre-imagen" src="${esc(b.src)}" alt="${esc(b.alt || "")}" draggable="false">`;
    if (b.tipo === "tabla") {
      const ev = NOM.formulas.evaluador((c, f) => b["c:" + NOM.formulas.ref(c, f)]);
      let filas = "";
      for (let f = 0; f < 8; f++) {
        let fila = "", algo = false;
        for (let c = 0; c < 6; c++) { const v = NOM.formulas.formatear(ev.valor(c, f)); if (v) algo = true; fila += `<td>${esc(v)}</td>`; }
        if (algo) filas += `<tr>${fila}</tr>`;
      }
      return `<div class="libre-tabla"><table>${filas || "<tr><td>Tabla vacía</td></tr>"}</table></div>`;
    }
    return `<div class="libre-ajeno">${esc(b.tipo)}</div>`;
  }

  /** Posición efectiva: los bloques que nacieron en modo Texto aún no tienen x, y. */
  function posiciones(bs, acotado) {
    let y = 40;
    return bs.map((b) => {
      if (b.x != null && b.y != null && b.w && b.h) return b;
      const h = b.tipo === "texto" ? (b.estilo === "h1" ? 80 : 56) : b.tipo === "tabla" ? 220 : 160;
      const p = Object.assign({}, b, { x: 60, y, w: acotado ? ANCHO - 120 : 520, h, sinPos: true });
      y += h + 16;
      return p;
    });
  }

  // ================================================================== lienzo libre
  function crearLienzo(ed, cont, opc) {
    const doc = () => ed.doc;
    const acotado = !!opc.acotado;
    let vista = { x: 40, y: 40, z: 1 }, escala = 1;
    let sel = null, selConector = null, herramienta = null, editando = null, origenEnlace = null;
    const capa = html(acotado
      ? `<div class="escenario" data-escenario><div class="diapo" data-mundo><svg class="capa-conectores" data-svg width="${ANCHO}" height="${ALTO}"></svg></div></div>`
      : `<div class="pizarra" data-plano><div class="mundo" data-mundo><svg class="capa-conectores" data-svg width="1" height="1"></svg></div></div>`);
    cont.append(capa);
    const superficie = capa;   // en presentación, capa ya es el escenario
    const mundo = $("[data-mundo]", capa);
    const svg = $("[data-svg]", capa);
    let zoomCtl = null, pista = null;
    if (!acotado) {
      zoomCtl = html(`<div class="zoom-ctl"><button class="icono-btn" data-z="-" aria-label="Alejar" data-micro="Alejar||Ctrl+rueda">${ico("zoom-out")}</button><span data-zv>100%</span><button class="icono-btn" data-z="+" aria-label="Acercar" data-micro="Acercar||Ctrl+rueda">${ico("zoom-in")}</button><button class="icono-btn" data-z="ajustar" aria-label="Ajustar" data-micro="Ver todo|Encuadra todas las figuras.">${ico("maximize-2")}</button></div>`);
      capa.append(zoomCtl);
      $$("[data-z]", zoomCtl).forEach((b) => (b.onclick = () => (b.dataset.z === "ajustar" ? ajustar() : zoomEn(b.dataset.z === "+" ? 1.2 : 1 / 1.2))));
    }

    // ------------------------------------------------------------ transformaciones
    function aplicarVista() {
      if (acotado) {
        const r = superficie.getBoundingClientRect();
        escala = Math.max(0.1, Math.min((r.width - 48) / ANCHO, (r.height - 48) / ALTO));
        mundo.style.transform = `scale(${escala})`;
        mundo.style.left = (r.width - ANCHO * escala) / 2 + "px";
        mundo.style.top = (r.height - ALTO * escala) / 2 + "px";
      } else {
        mundo.style.transform = `translate(${vista.x}px,${vista.y}px) scale(${vista.z})`;
        capa.style.backgroundSize = `${24 * vista.z}px ${24 * vista.z}px`;
        capa.style.backgroundPosition = `${vista.x}px ${vista.y}px`;
        if (zoomCtl) $("[data-zv]", zoomCtl).textContent = Math.round(vista.z * 100) + "%";
      }
    }
    function aMundo(ev) {
      const r = (acotado ? mundo : capa).getBoundingClientRect();
      if (acotado) return { x: (ev.clientX - r.left) / escala, y: (ev.clientY - r.top) / escala };
      return { x: (ev.clientX - r.left - vista.x) / vista.z, y: (ev.clientY - r.top - vista.y) / vista.z };
    }
    function zoomEn(k, centro) {
      const r = capa.getBoundingClientRect();
      const c = centro || { x: r.width / 2, y: r.height / 2 };
      const z = Math.max(0.2, Math.min(3, vista.z * k));
      vista.x = c.x - ((c.x - vista.x) * z) / vista.z;
      vista.y = c.y - ((c.y - vista.y) * z) / vista.z;
      vista.z = z;
      aplicarVista();
    }
    function ajustar() {
      const bs = bloques().filter((b) => b.tipo !== "conector");
      const r = capa.getBoundingClientRect();
      if (!bs.length) { vista = { x: 60, y: 60, z: 1 }; aplicarVista(); return; }
      const x1 = Math.min(...bs.map((b) => b.x)), y1 = Math.min(...bs.map((b) => b.y));
      const x2 = Math.max(...bs.map((b) => b.x + b.w)), y2 = Math.max(...bs.map((b) => b.y + b.h));
      const z = Math.max(0.25, Math.min(1.2, Math.min((r.width - 120) / (x2 - x1), (r.height - 140) / (y2 - y1))));
      vista = { z, x: (r.width - (x2 - x1) * z) / 2 - x1 * z, y: (r.height - (y2 - y1) * z) / 2 - y1 * z };
      aplicarVista();
    }

    // ------------------------------------------------------------ pintar
    function bloques() {
      return posiciones(doc().deLaPagina(ed.pagina).filter((b) => b.tipo !== "conector"), acotado)
        .concat(doc().deLaPagina(ed.pagina).filter((b) => b.tipo === "conector"));
    }
    function render() {
      const bs = bloques();
      $$(".bl", mundo).forEach((e) => e.remove());
      const porId = {};
      bs.filter((b) => b.tipo !== "conector").sort((a, b) => (a.z || 0) - (b.z || 0)).forEach((b, i) => {
        porId[b.id] = b;
        const el = html(`<div class="bl ${b.sinPos ? "sin-pos" : ""} ${b.id === sel ? "sel" : ""}" data-id="${esc(b.id)}" data-tipo="${esc(b.tipo)}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;z-index:${(b.z || 0) + i + 1}">${contenido(b)}</div>`);
        if (b.id === sel && !ed.soloLectura) adornos(el, b);
        mundo.append(el);
      });
      pintarConectores(bs, porId);
      if (editando) { const el = mundo.querySelector(`[data-id="${editando}"] .txt, [data-id="${editando}"] .libre-texto`); if (el) activarEdicion(el, false); }
      ed.pintarPresencia();
      opc.alPintar && opc.alPintar();
    }
    function adornos(el, b) {
      ["nw", "ne", "sw", "se"].forEach((t) => el.append(html(`<span class="tirador" data-t="${t}"></span>`)));
      if (!acotado && b.tipo === "forma") el.append(html(`<button class="enlazar" data-enlazar aria-label="Unir con flecha" data-micro="Conector|Arrastra hasta otra figura para unirlas con una flecha.">${ico("arrow-right")}</button>`));
    }
    function pintarConectores(bs, porId) {
      const cs = bs.filter((b) => b.tipo === "conector" && porId[b.desde] && porId[b.hasta]);
      const defs = `<defs><marker id="flecha" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--tinta-2);stroke:none"/></marker></defs>`;
      svg.innerHTML = defs + cs.map((c) => {
        const p = conector(porId[c.desde], porId[c.hasta]);
        const d = `M${p.x1},${p.y1} L${p.x2},${p.y2}`;
        return `<g data-conector="${esc(c.id)}" style="color:var(${c.id === selConector ? "--m-diag" : "--tinta-2"})"><path class="toque" d="${d}"/><path class="${c.id === selConector ? "sel" : ""}" d="${d}" marker-end="url(#flecha)"/></g>`;
      }).join("");
    }
    function moverVisual(id, b) {
      const el = mundo.querySelector(`.bl[data-id="${id}"]`);
      if (!el) return;
      Object.assign(el.style, { left: b.x + "px", top: b.y + "px", width: b.w + "px", height: b.h + "px" });
      const bs = bloques().map((x) => (x.id === id ? Object.assign({}, x, b) : x));
      const porId = {};
      bs.forEach((x) => (porId[x.id] = x));
      pintarConectores(bs, porId);
    }

    // ------------------------------------------------------------ selección y edición de texto
    function seleccionar(id) {
      if (sel === id && !selConector) return;
      terminarEdicion();
      sel = id; selConector = null;
      ed.seleccionar(id);
      render();
      opc.alSeleccionar && opc.alSeleccionar(id);
      ed.refrescarHerramientas();
    }
    function activarEdicion(el, todo) {
      el.contentEditable = "true";
      el.focus();
      if (todo !== false) {
        const r = document.createRange(); r.selectNodeContents(el);
        if (!el.textContent) r.collapse(true);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }
      el.onblur = () => terminarEdicion();
      el.onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); el.blur(); } e.stopPropagation(); };
    }
    function editar(id) {
      if (ed.soloLectura) return;
      const b = doc().bloque(id);
      if (!b || !["texto", "forma"].includes(b.tipo)) return;
      editando = id;
      const el = mundo.querySelector(`[data-id="${id}"] .txt, [data-id="${id}"] .libre-texto`);
      if (el) activarEdicion(el);
    }
    function terminarEdicion() {
      if (!editando) return;
      const id = editando; editando = null;
      const el = mundo.querySelector(`[data-id="${id}"] .txt, [data-id="${id}"] .libre-texto`);
      if (!el) return;
      el.contentEditable = "false";
      const b = doc().bloque(id);
      if (!b) return;
      if (b.tipo === "forma") { const t = el.innerText.trim(); if (t !== (b.texto || "")) doc().cambiar(id, { texto: t }); }
      else { const h = esc(el.innerText.replace(/\n$/, "")).replace(/\n/g, "<br>"); if (h !== (b.html || "")) doc().cambiar(id, { html: h }); }
    }

    // ------------------------------------------------------------ crear
    function crear(tipo, extra, en) {
      const p = en || (acotado ? { x: ANCHO / 2, y: ALTO / 2 } : centroVista());
      const tam = { texto: [420, 64], rect: [200, 110], elipse: [190, 110], rombo: [190, 130], nota: [180, 150] }[extra && extra.figura || tipo] || [200, 110];
      const id = NOM.DocCRDT.nuevoId();
      const zMax = Math.max(0, ...bloques().map((b) => b.z || 0));
      const campos = Object.assign({ tipo, pagina: ed.pagina, orden: Date.now() % 1e9 / 1e6, x: Math.round(p.x - tam[0] / 2), y: Math.round(p.y - tam[1] / 2), w: tam[0], h: tam[1], z: zMax + 1 }, extra || {});
      if (tipo === "texto") Object.assign(campos, { html: "", estilo: acotado ? "h2" : "p" });
      if (tipo === "forma" && !campos.color) campos.color = campos.figura === "nota" ? "#FFF1B8" : "#CFE0FF";
      doc().cambiar(id, campos);
      sel = id; ed.seleccionar(id);
      render();
      if (tipo === "texto" || tipo === "forma") editar(id);
      return id;
    }
    function centroVista() {
      const r = capa.getBoundingClientRect();
      return { x: (r.width / 2 - vista.x) / vista.z, y: (r.height / 2 - vista.y) / vista.z };
    }
    async function imagen() {
      const img = await ed.pedirImagen();
      if (!img) return;
      const k = Math.min(1, 520 / img.w, 360 / img.h);
      const c = acotado ? { x: ANCHO / 2, y: ALTO / 2 } : centroVista();
      const id = NOM.DocCRDT.nuevoId();
      doc().cambiar(id, { tipo: "imagen", pagina: ed.pagina, orden: 0, src: img.src, x: Math.round(c.x - (img.w * k) / 2), y: Math.round(c.y - (img.h * k) / 2), w: Math.round(img.w * k), h: Math.round(img.h * k), z: Math.max(0, ...bloques().map((b) => b.z || 0)) + 1 });
      seleccionar(id);
    }

    function eliminar() {
      if (ed.soloLectura) return;
      if (selConector) { doc().cambiar(selConector, { eliminado: true }); selConector = null; render(); return; }
      if (!sel) return;
      const id = sel;
      doc().lote(() => {
        doc().cambiar(id, { eliminado: true });
        doc().deLaPagina(ed.pagina).filter((c) => c.tipo === "conector" && (c.desde === id || c.hasta === id)).forEach((c) => doc().cambiar(c.id, { eliminado: true }));
      });
      sel = null; ed.seleccionar(null);
      render(); ed.refrescarHerramientas();
    }
    function duplicar() {
      const b = sel && bloques().find((x) => x.id === sel);
      if (!b || ed.soloLectura) return;
      const { id, sinPos, ...campos } = b;
      const nid = NOM.DocCRDT.nuevoId();
      doc().cambiar(nid, Object.assign(campos, { x: b.x + 24, y: b.y + 24, z: (b.z || 0) + 1 }));
      seleccionar(nid);
    }
    function capaZ(arriba) {
      const b = sel && bloques().find((x) => x.id === sel);
      if (!b) return;
      const zs = bloques().map((x) => x.z || 0);
      doc().cambiar(sel, { z: arriba ? Math.max(...zs) + 1 : Math.min(...zs) - 1 });
    }
    function colorear(c) {
      const b = sel && doc().bloque(sel);
      if (!b || b.tipo !== "forma") return aviso("Selecciona una figura para cambiar su color", { tipo: "info" });
      doc().cambiar(sel, { color: c });
    }

    // ------------------------------------------------------------ puntero
    const punteros = new Map();
    let gesto = null;
    superficie.addEventListener("pointerdown", (e) => {
      NOM.cerrarMenu();
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (punteros.size === 2 && !acotado) {   // pellizco para hacer zoom
        const [a, b] = [...punteros.values()];
        gesto = { tipo: "pellizco", d: Math.hypot(a.x - b.x, a.y - b.y), z: vista.z };
        return;
      }
      const p = aMundo(e);
      const conectorEl = e.target.closest("[data-conector]");
      const bl = e.target.closest(".bl");
      if (editando && bl && bl.dataset.id === editando) return;   // dejar seleccionar texto
      if (e.target.closest("[data-enlazar]") && bl) {
        e.preventDefault();
        origenEnlace = bl.dataset.id;
        gesto = { tipo: "enlace", desde: bl.dataset.id };
        superficie.setPointerCapture(e.pointerId);
        return;
      }
      const tirador = e.target.closest(".tirador");
      if (tirador && bl && !ed.soloLectura) {
        e.preventDefault();
        const b = bloques().find((x) => x.id === bl.dataset.id);
        gesto = { tipo: "tamano", id: b.id, t: tirador.dataset.t, p0: p, b0: { x: b.x, y: b.y, w: b.w, h: b.h }, b: { x: b.x, y: b.y, w: b.w, h: b.h } };
        superficie.setPointerCapture(e.pointerId);
        return;
      }
      if (conectorEl) { terminarEdicion(); sel = null; selConector = conectorEl.dataset.conector; render(); return; }
      if (bl) {
        const id = bl.dataset.id;
        if (herramienta === "conector" && !ed.soloLectura) {
          if (!origenEnlace) { origenEnlace = id; aviso("Ahora toca la figura de destino", { ms: 1800 }); return; }
          if (origenEnlace !== id) unir(origenEnlace, id);
          origenEnlace = null; return;
        }
        if (sel !== id) seleccionar(id);
        if (ed.soloLectura) return;
        const b = bloques().find((x) => x.id === id);
        gesto = { tipo: "mover", id, p0: p, b0: { x: b.x, y: b.y, w: b.w, h: b.h }, b: { x: b.x, y: b.y, w: b.w, h: b.h }, movido: false };
        superficie.setPointerCapture(e.pointerId);
        return;
      }
      // Espacio vacío
      terminarEdicion();
      if (herramienta && herramienta !== "conector" && !ed.soloLectura) {
        const h = herramienta;
        if (h === "texto") crear("texto", null, p); else crear("forma", { figura: h }, p);
        opc.alUsarHerramienta && opc.alUsarHerramienta();
        return;
      }
      if (sel || selConector) { sel = null; selConector = null; ed.seleccionar(null); render(); ed.refrescarHerramientas(); }
      if (!acotado) {
        gesto = { tipo: "paneo", x0: e.clientX, y0: e.clientY, v0: { ...vista } };
        capa.classList.add("arrastrando");
        superficie.setPointerCapture(e.pointerId);
      }
    });
    superficie.addEventListener("pointermove", (e) => {
      if (punteros.has(e.pointerId)) punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!gesto) return;
      if (gesto.tipo === "pellizco" && punteros.size === 2) {
        const [a, b] = [...punteros.values()];
        const r = capa.getBoundingClientRect();
        zoomEn(gesto.z * (Math.hypot(a.x - b.x, a.y - b.y) / gesto.d) / vista.z, { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top });
        return;
      }
      if (gesto.tipo === "paneo") {
        vista.x = gesto.v0.x + e.clientX - gesto.x0; vista.y = gesto.v0.y + e.clientY - gesto.y0;
        aplicarVista(); return;
      }
      const p = aMundo(e);
      const dx = p.x - (gesto.p0 ? gesto.p0.x : 0), dy = p.y - (gesto.p0 ? gesto.p0.y : 0);
      if (gesto.tipo === "mover") {
        if (Math.abs(dx) + Math.abs(dy) > 2) gesto.movido = true;
        gesto.b = Object.assign({}, gesto.b0, { x: Math.round(gesto.b0.x + dx), y: Math.round(gesto.b0.y + dy) });
        moverVisual(gesto.id, gesto.b);
      } else if (gesto.tipo === "tamano") {
        const b = Object.assign({}, gesto.b0), t = gesto.t;
        if (t.includes("e")) b.w = Math.max(30, gesto.b0.w + dx);
        if (t.includes("s")) b.h = Math.max(24, gesto.b0.h + dy);
        if (t.includes("w")) { b.w = Math.max(30, gesto.b0.w - dx); b.x = gesto.b0.x + gesto.b0.w - b.w; }
        if (t.includes("n")) { b.h = Math.max(24, gesto.b0.h - dy); b.y = gesto.b0.y + gesto.b0.h - b.h; }
        if (e.shiftKey && doc().valor(gesto.id, "tipo") === "imagen") b.h = Math.round(b.w * (gesto.b0.h / gesto.b0.w));
        gesto.b = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
        moverVisual(gesto.id, gesto.b);
      } else if (gesto.tipo === "enlace") {
        const o = bloques().find((x) => x.id === gesto.desde);
        const c = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
        let tmp = $("[data-tmp]", svg);
        if (!tmp) { tmp = document.createElementNS("http://www.w3.org/2000/svg", "path"); tmp.setAttribute("data-tmp", ""); tmp.setAttribute("stroke-dasharray", "6 5"); tmp.style.stroke = "var(--m-diag)"; tmp.style.strokeWidth = 2.5; svg.append(tmp); }
        tmp.setAttribute("d", `M${c.x},${c.y} L${p.x},${p.y}`);
      }
    });
    function finGesto(e) {
      punteros.delete(e.pointerId);
      if (!gesto) return;
      const g = gesto; gesto = null;
      capa.classList.remove("arrastrando");
      if (g.tipo === "mover" && g.movido) doc().cambiar(g.id, g.b);
      else if (g.tipo === "mover" && !g.movido && e.type === "pointerup" && doc().valor(g.id, "tipo") !== "imagen" && Date.now() - (finGesto.ultimo || 0) < 350 && finGesto.id === g.id) editar(g.id);
      else if (g.tipo === "tamano") doc().cambiar(g.id, g.b);
      else if (g.tipo === "enlace") {
        const t = $("[data-tmp]", svg); if (t) t.remove();
        const destino = document.elementFromPoint(e.clientX, e.clientY);
        const bl = destino && destino.closest(".bl");
        if (bl && bl.dataset.id !== g.desde) unir(g.desde, bl.dataset.id);
        origenEnlace = null;
      }
      if (g.tipo === "mover") { finGesto.ultimo = Date.now(); finGesto.id = g.id; }
    }
    superficie.addEventListener("pointerup", finGesto);
    superficie.addEventListener("pointercancel", finGesto);
    superficie.addEventListener("dblclick", (e) => { const bl = e.target.closest(".bl"); if (bl) editar(bl.dataset.id); });
    if (!acotado) {
      superficie.addEventListener("wheel", (e) => {
        e.preventDefault();
        const r = capa.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey) zoomEn(Math.exp(-e.deltaY * 0.0022), { x: e.clientX - r.left, y: e.clientY - r.top });
        else { vista.x -= e.deltaX; vista.y -= e.deltaY; aplicarVista(); }
      }, { passive: false });
    }

    function unir(a, b) {
      const ya = doc().deLaPagina(ed.pagina).some((c) => c.tipo === "conector" && ((c.desde === a && c.hasta === b) || (c.desde === b && c.hasta === a)));
      if (ya) return aviso("Esas figuras ya están unidas", { tipo: "info" });
      doc().cambiar(NOM.DocCRDT.nuevoId(), { tipo: "conector", desde: a, hasta: b, pagina: ed.pagina, orden: 0 });
    }

    function teclas(e) {
      if (editando || ed.soloLectura) return;
      const t = e.target;
      if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
      if (e.key === "Delete" || e.key === "Backspace") { if (sel || selConector) { e.preventDefault(); eliminar(); } return; }
      if (e.key === "Escape") { herramienta = null; origenEnlace = null; opc.alUsarHerramienta && opc.alUsarHerramienta(); if (sel) { sel = null; ed.seleccionar(null); render(); } return; }
      if (e.key === "Enter" && sel) { e.preventDefault(); editar(sel); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicar(); return; }
      const fl = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
      if (fl && sel) {
        e.preventDefault();
        const b = bloques().find((x) => x.id === sel);
        const k = e.shiftKey ? 10 : 1;
        doc().cambiar(sel, { x: b.x + fl[0] * k, y: b.y + fl[1] * k, w: b.w, h: b.h }, { grupo: "flechas-" + sel });
      }
    }
    document.addEventListener("keydown", teclas);
    const ro = new ResizeObserver(() => aplicarVista());
    ro.observe(superficie);

    aplicarVista();
    render();
    if (!acotado) requestAnimationFrame(ajustar);

    return {
      render, crear, imagen, eliminar, duplicar, capaZ, colorear, ajustar,
      seleccion: () => sel,
      fijarHerramienta(h) { herramienta = h; origenEnlace = null; capa.classList.toggle("herramienta", !!h); },
      herramienta: () => herramienta,
      cambios(lista) {
        if (gesto && lista.some((c) => c.bloque === gesto.id)) return;
        if (editando && lista.length === 1 && lista[0].bloque === editando && lista[0].local) return;
        render();
      },
      destruir() { document.removeEventListener("keydown", teclas); ro.disconnect(); terminarEdicion(); },
    };
  }

  function menuColor(lienzo, b) {
    NOM.menu(b, [{ titulo: "Color de la figura" }, ...PALETA.map((c) => ({ texto: c === "#FFFFFF" ? "Blanco" : c === "#2B2A33" ? "Tinta" : c === "#5B5BD6" ? "Índigo" : Object.entries(NOM.plantillas.COLORES).find(([, v]) => v === c)?.[0].replace(/^./, (x) => x.toUpperCase()) || c, icono: "palette", fn: () => lienzo.colorear(c) }))]);
    // Pinta la muestra de color en cada opción del menú
    setTimeout(() => $$(".menu button").forEach((x, i) => { const s = x.querySelector(".ico"); if (s && PALETA[i]) { s.style.fill = PALETA[i]; s.style.color = "var(--tinta-2)"; } }), 0);
  }
  function menuFiguras(lienzo, b) {
    NOM.menu(b, [{ titulo: "Insertar figura" },
      { texto: "Rectángulo", icono: "square", fn: () => lienzo.crear("forma", { figura: "rect" }) },
      { texto: "Elipse", icono: "circle", fn: () => lienzo.crear("forma", { figura: "elipse" }) },
      { texto: "Rombo", icono: "diamond", fn: () => lienzo.crear("forma", { figura: "rombo" }) },
      { texto: "Nota adhesiva", icono: "sticky-note", fn: () => lienzo.crear("forma", { figura: "nota" }) }]);
  }

  // ================================================================== Presentación
  NOM.modos.PRESENTACION = {
    montar(ed) {
      const doc = () => ed.doc;
      const raiz = html(`<div class="pres"><nav class="miniaturas" data-minis aria-label="Diapositivas"></nav><div data-escena style="position:relative;min-height:0;display:grid"></div></div>`);
      ed.lienzo.append(raiz);
      ed.lienzo.style.overflow = "hidden";
      const lienzo = crearLienzo(ed, $("[data-escena]", raiz), { acotado: true, alPintar: () => pintarMinis() });
      this._lienzo = lienzo;

      function pintarMinis() {
        const minis = $("[data-minis]", raiz);
        const pags = doc().paginas();
        minis.innerHTML = pags.map((p, i) => {
          const bs = posiciones(doc().deLaPagina(p).filter((b) => b.tipo !== "conector"), true);
          return `<button class="mini" data-p="${esc(p)}" aria-current="${p === ed.pagina}" aria-label="Diapositiva ${i + 1}"><span class="num">${i + 1}</span>
            <div class="mini-cont">${bs.map((b) => `<div style="position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;overflow:hidden">${contenido(b)}</div>`).join("")}</div></button>`;
        }).join("") + (ed.soloLectura ? "" : `<button class="btn plano" data-nueva data-micro="Nueva diapositiva|Agrega una diapositiva después de la actual.">${ico("plus")}</button>`);
        $$(".mini", minis).forEach((m) => {
          const c = $(".mini-cont", m);
          const k = m.clientWidth / ANCHO || 0.17;
          c.style.transform = `scale(${k})`;
          m.onclick = () => { ed.pagina = m.dataset.p; lienzo.render(); };
          m.oncontextmenu = (e) => { e.preventDefault(); if (!ed.soloLectura) menuDiapo(m, m.dataset.p); };
        });
        const n = $("[data-nueva]", minis);
        if (n) n.onclick = () => { ed.pagina = ed.nuevaPagina(ed.pagina); lienzo.render(); };
      }
      function menuDiapo(anc, p) {
        const pags = doc().paginas(), i = pags.indexOf(p);
        NOM.menu(anc, [
          { texto: "Duplicar", icono: "copy", fn: () => {
            const np = ed.nuevaPagina(p);
            doc().lote(() => doc().deLaPagina(p).forEach((b) => { const { id, ...c } = b; doc().cambiar(NOM.DocCRDT.nuevoId(), Object.assign(c, { pagina: np })); }));
            ed.pagina = np; lienzo.render();
          } },
          ...(i > 0 ? [{ texto: "Mover antes", icono: "chevron-left", fn: () => { const q = pags.slice(); q.splice(i, 1); q.splice(i - 1, 0, p); doc().cambiar("_doc", { paginas: q }); } }] : []),
          ...(i < pags.length - 1 ? [{ texto: "Mover después", icono: "chevron-right", fn: () => { const q = pags.slice(); q.splice(i, 1); q.splice(i + 1, 0, p); doc().cambiar("_doc", { paginas: q }); } }] : []),
          ...(pags.length > 1 ? ["-", { texto: "Eliminar diapositiva", icono: "trash-2", peligro: true, fn: () => {
            doc().lote(() => {
              doc().deLaPagina(p).forEach((b) => doc().cambiar(b.id, { eliminado: true }));
              doc().cambiar("_doc", { paginas: pags.filter((x) => x !== p) });
            });
            ed.pagina = pags[Math.max(0, i - 1)] === p ? pags[1] : pags[Math.max(0, i - 1)];
            lienzo.render();
          } }] : []),
        ]);
      }

      this._herr = [
        { id: "texto", icono: "type", micro: "Cuadro de texto|Agrega un título o un párrafo a la diapositiva.", fn: () => lienzo.crear("texto") },
        { id: "figura", icono: "square", micro: "Figura|Rectángulo, elipse, rombo o nota.", fn: (e, b) => menuFiguras(lienzo, b) },
        { id: "imagen", icono: "image", micro: "Imagen|Desde tu equipo.", fn: () => lienzo.imagen(), mantenerFoco: false },
        "|",
        { id: "color", icono: "palette", micro: "Color|Cambia el color de la figura seleccionada.", fn: (e, b) => menuColor(lienzo, b), off: () => !lienzo.seleccion() },
        { id: "animacion", icono: "sparkles", micro: "Animación|Cómo aparece el bloque al presentar.", off: () => !lienzo.seleccion(), fn: (e, b) => {
          const id = lienzo.seleccion(); const actual = doc().valor(id, "animacion") || "";
          NOM.menu(b, [{ titulo: "Al presentar, aparece…" },
            ...[["", "Sin animación"], ["aparecer", "Desvanecido"], ["deslizar", "Deslizando hacia arriba"], ["zoom", "Con zoom"]].map(([v, t]) => ({ texto: t, marcado: v === actual, fn: () => doc().cambiar(id, { animacion: v }) }))]);
        } },
        { id: "frente", icono: "bring-to-front", micro: "Traer al frente", fn: () => lienzo.capaZ(true), off: () => !lienzo.seleccion() },
        { id: "atras", icono: "send-to-back", micro: "Enviar atrás", fn: () => lienzo.capaZ(false), off: () => !lienzo.seleccion() },
        { id: "borrar", icono: "trash-2", micro: "Eliminar|Quita el bloque seleccionado.|Supr", fn: () => lienzo.eliminar(), off: () => !lienzo.seleccion() },
        "|",
        { id: "nueva", icono: "plus-square", micro: "Nueva diapositiva", fn: () => { ed.pagina = ed.nuevaPagina(ed.pagina); lienzo.render(); } },
        { id: "presentar", icono: "play", micro: "Presentar|Pantalla completa con animaciones. Avanza con clic o →.|F5", fn: () => presentar(ed) },
      ];
      this._teclaF5 = (e) => { if (e.key === "F5") { e.preventDefault(); presentar(ed); } };
      document.addEventListener("keydown", this._teclaF5);
      this.cambios = (l) => lienzo.cambios(l);
      this.desmontar = () => { lienzo.destruir(); document.removeEventListener("keydown", this._teclaF5); ed.lienzo.style.overflow = ""; };
    },
    herramientas() { return this._herr || []; },
  };

  // ------------------------------------------------------------ reproductor
  function presentar(ed) {
    const doc = ed.doc;
    const pags = doc.paginas();
    let i = Math.max(0, pags.indexOf(ed.pagina)), paso = 0, pasos = [];
    const rep = html(`<div class="reproductor" tabindex="0"><div class="diapo" data-d></div><button class="icono-btn salir" aria-label="Salir">${ico("x")}</button><span class="contador" data-c></span></div>`);
    document.body.append(rep);
    const d = $("[data-d]", rep);
    function escala() {
      const k = Math.min(innerWidth / ANCHO, innerHeight / ALTO);
      d.style.transform = `scale(${k})`;
      d.style.left = (innerWidth - ANCHO * k) / 2 + "px";
      d.style.top = (innerHeight - ALTO * k) / 2 + "px";
    }
    function pintar(revelarTodo) {
      const bs = posiciones(doc.deLaPagina(pags[i]).filter((b) => b.tipo !== "conector"), true).sort((a, b) => (a.z || 0) - (b.z || 0));
      d.innerHTML = bs.map((b) => `<div class="bl ${b.animacion && !revelarTodo ? "anim-oculto" : ""}" data-id="${esc(b.id)}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">${contenido(b)}</div>`).join("");
      pasos = revelarTodo ? [] : bs.filter((b) => b.animacion).sort((a, b) => a.y - b.y || a.x - b.x);
      paso = 0;
      $("[data-c]", rep).textContent = `${i + 1} / ${pags.length}`;
    }
    function avanzar() {
      if (paso < pasos.length) {
        const b = pasos[paso++];
        const el = d.querySelector(`[data-id="${b.id}"]`);
        el.classList.remove("anim-oculto"); el.classList.add("anim-" + b.animacion);
        return;
      }
      if (i < pags.length - 1) { i++; pintar(); } else salir();
    }
    function retroceder() { if (i > 0) { i--; pintar(true); } }
    function salir() { document.removeEventListener("keydown", tecla, true); removeEventListener("resize", escala); rep.remove(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
    function tecla(e) {
      e.stopPropagation();
      if (["ArrowRight", "ArrowDown", " ", "PageDown", "Enter"].includes(e.key)) { e.preventDefault(); avanzar(); }
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); retroceder(); }
      else if (e.key === "Escape") salir();
    }
    rep.addEventListener("click", (e) => { if (e.target.closest(".salir")) return salir(); (e.clientX < innerWidth / 3 ? retroceder : avanzar)(); });
    document.addEventListener("keydown", tecla, true);
    addEventListener("resize", escala);
    if (rep.requestFullscreen) rep.requestFullscreen().catch(() => {});
    escala(); pintar(); rep.focus();
  }

  // ================================================================== Diagrama
  NOM.modos.DIAGRAMA = {
    montar(ed) {
      ed.lienzo.style.overflow = "hidden";
      const pags = ed.doc.paginas();
      const self = this;
      const lienzo = crearLienzo(ed, ed.lienzo, { acotado: false, alUsarHerramienta: () => { lienzo.fijarHerramienta(null); ed.refrescarHerramientas(); } });
      this._lienzo = lienzo;
      if (pags.length > 1) {
        const sel = html(`<div class="zoom-ctl" style="left:16px;right:auto">${ico("layers")}<select class="mini-select" aria-label="Página" style="border:0;background:transparent;font-weight:800">${pags.map((p, i) => `<option value="${esc(p)}" ${p === ed.pagina ? "selected" : ""}>Página ${i + 1}</option>`).join("")}</select></div>`);
        $("select", sel).onchange = (e) => { ed.pagina = e.target.value; lienzo.render(); lienzo.ajustar(); };
        ed.lienzo.append(sel);
      }
      const h = (id) => () => { lienzo.fijarHerramienta(lienzo.herramienta() === id ? null : id); ed.refrescarHerramientas(); };
      const activo = (id) => () => lienzo.herramienta() === id;
      this._herr = [
        { id: "puntero", icono: "mouse-pointer-2", micro: "Seleccionar y mover|Arrastra figuras; arrastra el fondo para moverte.|Esc", fn: () => { lienzo.fijarHerramienta(null); ed.refrescarHerramientas(); }, activo: () => !lienzo.herramienta() },
        { id: "rect", icono: "square", micro: "Rectángulo|Haz clic en el lienzo para colocarlo. Para procesos.", fn: h("rect"), activo: activo("rect") },
        { id: "elipse", icono: "circle", micro: "Elipse|Para inicio y fin de un flujo.", fn: h("elipse"), activo: activo("elipse") },
        { id: "rombo", icono: "diamond", micro: "Rombo|Para decisiones (sí / no).", fn: h("rombo"), activo: activo("rombo") },
        { id: "nota", icono: "sticky-note", micro: "Nota adhesiva|Ideas sueltas, como en un pizarrón.", fn: h("nota"), activo: activo("nota") },
        { id: "texto", icono: "type", micro: "Texto libre", fn: h("texto"), activo: activo("texto") },
        { id: "conector", icono: "spline", micro: "Conector|Toca una figura y luego otra para unirlas con una flecha.", fn: h("conector"), activo: activo("conector") },
        { id: "imagen", icono: "image", micro: "Imagen", fn: () => lienzo.imagen(), mantenerFoco: false },
        "|",
        { id: "color", icono: "palette", micro: "Color|Cambia el color de la figura seleccionada.", fn: (e, b) => menuColor(lienzo, b), off: () => !lienzo.seleccion() },
        { id: "frente", icono: "bring-to-front", micro: "Traer al frente", fn: () => lienzo.capaZ(true), off: () => !lienzo.seleccion() },
        { id: "duplicar", icono: "copy", micro: "Duplicar||Ctrl+D", fn: () => lienzo.duplicar(), off: () => !lienzo.seleccion() },
        { id: "borrar", icono: "trash-2", micro: "Eliminar|Borra la figura y sus flechas.|Supr", fn: () => lienzo.eliminar(), off: () => !lienzo.seleccion() },
      ];
      if (!ed.doc.deLaPagina(ed.pagina).length && !ed.soloLectura) {
        const p = html(`<div class="pista">${ico("info", "ico-s")} Elige una figura arriba y haz clic en el lienzo</div>`);
        ed.lienzo.append(p);
        setTimeout(() => p.remove(), 6000);
      }
      this.cambios = (l) => lienzo.cambios(l);
      this.desmontar = () => { lienzo.destruir(); ed.lienzo.style.overflow = ""; };
      void self;
    },
    herramientas() { return this._herr || []; },
  };
})();
