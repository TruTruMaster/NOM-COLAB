/* NOM-COLAB · Ramas para lo editado sin Internet (fase 13, parte B).
   Al volver la red, por cada documento que la persona cambió sin conexión:
   - si nadie más lo cambió mientras tanto, lo suyo se sube tal cual (como antes);
   - si alguien más lo cambió, se abre una RAMA: un documento nuevo, ligado al original, con todo
     lo que la persona tenía. El original de la nube no se toca.
   «Mientras tanto» es desde que el equipo se quedó sin conexión: al quedarse sin red se apunta la
   BASE (el reloj más alto que se tenía de cada nodo). Un corte corto (2 minutos o menos, con el
   documento ya abierto) se junta solo, como siempre: el CRDT no pierde nada.
   La rama se compara con el original, se fusiona (con una versión para regresar), se deja aparte o
   se descarta (va a la papelera). */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso, hoja, confirmar } = NOM;
  const api = () => NOM.api;
  /** B.2: menos que esto sin conexión (y con el documento ya abierto) no abre rama. */
  const UMBRAL = +(NOM.leer("nom.prueba.umbralRama", 0) || 0) || 2 * 60 * 1000;   // las pruebas lo acortan
  const clave = (docId) => api().clave("sinred." + docId);

  // ------------------------------------------------------------ la base
  /** El reloj más alto de cada nodo en un estado (registros y texto letra por letra). */
  function vector(estado) {
    const v = {};
    const poner = (n, t) => { if (n && t > (v[n] || 0)) v[n] = t; };
    for (const b in (estado && estado.bloques) || {}) for (const c in estado.bloques[b]) { const r = estado.bloques[b][c]; if (r) poner(r.n, r.t); }
    for (const b in (estado && estado.seq) || {}) {
      const s = estado.seq[b] || {};
      (s.ins || []).forEach((e) => poner(e.n, e.t + (e.e ? 0 : Math.max(0, NOM.Secuencia.caracteres(e.x || "").length - 1))));
      (s.vis || []).forEach((e) => poner(e.n, e.t));
      (s.fmt || []).forEach((e) => poner(e.n, e.t));
    }
    return v;
  }

  const marca = (docId) => (api().token() && NOM.boveda && NOM.boveda.activa() ? NOM.leer(clave(docId), null) : null);

  /** Al quedarse sin conexión (o al abrir el documento ya sin Internet): se apunta la base una vez. */
  function marcar(docId, estado, opc) {
    if (!api().token() || !NOM.boveda || !NOM.boveda.activa()) return;
    opc = opc || {};
    const m = marca(docId);
    if (m) { if (opc.abierto && !m.abierto) { m.abierto = true; NOM.guardar(clave(docId), m); } return; }
    const meta = opc.meta || {};
    NOM.guardar(clave(docId), { desde: Date.now(), base: vector(estado), abierto: !!opc.abierto,
      protegido: !!(meta.documento && meta.documento.protegido), entregaLimite: (meta.documento && meta.documento.entregaLimite) || 0 });
  }
  const soltar = (docId) => NOM.quitar(clave(docId));

  // ------------------------------------------------------------ copia exacta
  /** Operaciones que recrean el estado EXACTO (cada registro con su reloj y su nodo), como
      core/crdt/Replica.java: así la rama se puede volver a juntar con el original sin duplicar. */
  function replica(estado) {
    const ops = [];
    for (const b in estado.bloques || {}) {
      const grupos = new Map();
      for (const c in estado.bloques[b]) {
        const r = estado.bloques[b][c];
        if (!r || !r.n || !(r.t > 0) || (b === "_doc" && c === "modo")) continue;
        const k = r.t + "|" + r.n;
        if (!grupos.has(k)) grupos.set(k, { t: r.t, n: r.n, campos: {} });
        grupos.get(k).campos[c] = r.v;
      }
      for (const g of grupos.values()) {
        const ks = Object.keys(g.campos);
        for (let i = 0, parte = 0; i < ks.length; i += 300, parte++) {
          const campos = {};
          ks.slice(i, i + 300).forEach((k) => (campos[k] = g.campos[k]));
          ops.push({ id: `rx:${g.n}:${g.t}:${b}${parte ? ":" + parte : ""}`, bloque: b, campos, t: g.t, n: g.n });
        }
      }
    }
    for (const b in estado.seq || {}) {
      const s = estado.seq[b] || {};
      [["ins", "i"], ["vis", "v"], ["fmt", "f"]].forEach(([lista, k]) => (s[lista] || []).forEach((e) => {
        if (!e.n || !(e.t > 0)) return;
        const { t, n, ...resto } = e;
        ops.push({ id: `rx:${k}:${n}:${t}:${b}`, bloque: b, campos: {}, t, n, s: Object.assign(resto, { k }) });
      }));
    }
    return ops;
  }

  const fechaCorta = (ms) => new Date(ms || Date.now()).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\.$/, "").replace(/\./g, "");
  function nombreRama(original, autor, desde, motivo) {
    const base = original || "Documento";
    const fin = motivo === "entrega" ? ` — ${autor} (editado después de la fecha límite)`
      : motivo === "protegido" ? ` — rama de ${autor} (sin conexión; lo protegieron mientras tanto)`
      : ` — rama de ${autor} (sin conexión, ${fechaCorta(desde)})`;
    const n = base + fin;
    return n.length > 120 ? base.slice(0, Math.max(1, 120 - fin.length)) + fin : n;
  }

  // ------------------------------------------------------------ decidir al volver la red
  /**
   * ¿Se sube tal cual o se abre una rama? ctx: { docId, estado, pendientes, nodo, nombre, espacioId }.
   * Devuelve "enviar" (la cola sigue como siempre) o { tipo: "rama"|"recuperado", doc, personas }.
   * Si no hay red lanza el error (se vuelve a intentar al volver). Si algo raro falla, "enviar":
   * así lo escrito nunca se queda atorado (es lo que pasaba antes de las ramas).
   */
  async function decidir(ctx) {
    const m = marca(ctx.docId);
    if (!m || !ctx.pendientes || !ctx.pendientes.length) { if (m && (!ctx.pendientes || !ctx.pendientes.length)) soltar(ctx.docId); return "enviar"; }
    if (!m.abierto && Date.now() - m.desde <= UMBRAL) { soltar(ctx.docId); return "enviar"; }
    const nodos = [...new Set(ctx.pendientes.map((o) => o.n).concat(ctx.nodo ? [ctx.nodo] : []))];
    let r;
    try { r = await api().post(`/api/documentos/${ctx.docId}/cambios-desde`, { base: m.base, nodos, desde: m.desde }, { ms: 15000 }); }
    catch (e) {
      if (e.red) throw e;
      // Un 404 puede ser que el documento ya no está… o que el servidor es de una versión anterior
      // (no conoce esta ruta): se confirma abriendo el documento.
      let borrado = false;
      if (e.estado === 404) {
        try { await api().get(`/api/documentos/${ctx.docId}`, undefined, { ms: 10000, sin401: true }); }
        catch (x) { if (x.red) throw x; borrado = x.estado === 404; }
      }
      if (borrado && ctx.espacioId) {
        // B.6 El original se borró (o está en la papelera) mientras tanto: lo de la persona queda como documento aparte.
        const doc = await api().post(`/api/espacios/${ctx.espacioId}/documentos`, { nombre: (ctx.nombre || "Documento") + " (recuperado)", modo: ctx.modo || "TEXTO", ops: NOM.DocCRDT.opsDeEstado(ctx.estado, "recuperado") }, { ms: 60000 });
        soltar(ctx.docId);
        return { tipo: "recuperado", doc };
      }
      soltar(ctx.docId);
      return "enviar";
    }
    const protegidoAhora = r.protegido && !m.protegido;
    const motivo = r.entregaVencida ? "entrega" : r.otros ? "cambios" : protegidoAhora ? "protegido" : null;
    if (!motivo) { soltar(ctx.docId); return "enviar"; }
    const yo = (api().usuario() || {}).nombre || "mí";
    const doc = await api().post(`/api/documentos/${ctx.docId}/ramas`, {
      nombre: nombreRama(ctx.nombre || r.nombre, yo, m.desde, motivo), ops: replica(ctx.estado), base: m.base, nodos,
      propios: ctx.pendientes.slice(0, 5000), motivo, desde: m.desde,
    }, { ms: 90000 });
    soltar(ctx.docId);
    return { tipo: "rama", doc, personas: r.personas || [], motivo };
  }

  /** El aviso de que se creó una rama (en el editor o al vaciar la cola de un documento cerrado). */
  function avisar(d, nombreOriginal) {
    const quien = d.personas && d.personas.length ? (d.personas.length > 1 ? d.personas.slice(0, -1).join(", ") + " y " + d.personas[d.personas.length - 1] : d.personas[0]) : "otra persona";
    const porque = d.motivo === "entrega" ? "la fecha límite de entrega pasó mientras no tenías conexión"
      : d.motivo === "protegido" ? "lo protegieron mientras no tenías conexión"
      : `${quien} cambió «${nombreOriginal || "el documento"}» mientras no tenías conexión`;
    if (d.tipo === "recuperado") {
      aviso(`«${nombreOriginal || "El documento"}» ya no estaba en el espacio: lo tuyo quedó como «${d.doc.nombre}».`, { tipo: "aviso", ms: 10000, accion: { texto: "Abrir", fn: () => (location.hash = "#/doc/" + d.doc.id) } });
      return;
    }
    aviso(`Se creó una rama porque ${porque}. El original no se tocó; tu versión está en «${d.doc.nombre}».`, { tipo: "aviso", ms: 12000, accion: { texto: "Abrir la rama", fn: () => (location.hash = "#/doc/" + d.doc.id) } });
  }

  // ------------------------------------------------------------ comparar
  const S = () => NOM.Secuencia;
  /** Párrafos de un estado de texto: [{ clave (id de su marca), texto }] por bloque de texto. */
  function parrafos(estado) {
    const r = new Map();
    for (const b in estado.seq || {}) {
      const sec = new (S())(estado.seq[b]);
      let actual = [];
      sec.visibles().forEach((it) => {
        if (it.c === "\n" && !it.e) { r.set(b + "|" + it.id, actual.join("")); actual = []; }
        else actual.push(it.e ? "▢" : it.c);
      });
      r.set(b + "|fin", actual.join(""));
    }
    return r;
  }
  const nuevo = (reg, base) => !!reg && reg.n && reg.t > ((base || {})[reg.n] || 0);

  /** Lo que difiere entre el original y la rama, y los campos que cambiaron en los dos lados. */
  function diferencias(orig, rama, base, nodos, modo) {
    const mios = new Set(nodos || []);
    const filas = [], conflictos = [];
    if (modo === "TEXTO") {
      const po = parrafos(orig), pr = parrafos(rama);
      const claves = [...new Set([...po.keys(), ...pr.keys()])];
      let num = 0;
      claves.forEach((k) => {
        num++;
        const a = po.has(k) ? po.get(k) : null, b = pr.has(k) ? pr.get(k) : null;
        if (a === b) return;
        filas.push({ tipo: "parrafo", clave: k, numero: num, original: a, rama: b });
      });
    }
    for (const b of new Set([...Object.keys(orig.bloques || {}), ...Object.keys(rama.bloques || {})])) {
      if (b === "_origen") continue;
      const bo = (orig.bloques || {})[b] || {}, br = (rama.bloques || {})[b] || {};
      for (const c of new Set([...Object.keys(bo), ...Object.keys(br)])) {
        if (b === "_doc" && (c === "nombre" || c === "modo")) continue;
        const ro = bo[c], rr = br[c];
        const vo = ro ? ro.v : undefined, vr = rr ? rr.v : undefined;
        if (JSON.stringify(vo) === JSON.stringify(vr)) continue;
        const enOriginal = nuevo(ro, base) && !mios.has(ro.n), enRama = nuevo(rr, base) && mios.has(rr.n);
        const f = { tipo: "campo", bloque: b, campo: c, original: vo, rama: vr, enOriginal, enRama };
        filas.push(f);
        if (enOriginal && enRama) conflictos.push(f);
      }
    }
    return { filas, conflictos };
  }

  const corto = (v) => (v === undefined || v === null ? "—" : typeof v === "object" ? (v.texto || v.html ? NOM.formatos.textoPlano(v.html || v.texto) : "(cambió)") : String(v)).slice(0, 140);
  function etiqueta(f, est) {
    if (f.tipo === "parrafo") return `Párrafo ${f.numero}`;
    if (/^c:/.test(f.campo)) return `Celda ${f.campo.slice(2)}`;
    if (f.bloque === "_doc") return f.campo === "paginas" ? "El orden de las páginas" : "El documento";
    const bl = ((est.bloques || {})[f.bloque]) || {};
    const tipo = bl.tipo ? bl.tipo.v : "";
    const nombre = { forma: "Figura", texto: "Cuadro de texto", imagen: "Imagen", tabla: "Tabla", comentario: "Comentario", flecha: "Flecha" }[tipo] || "Elemento";
    const campo = { x: "posición", y: "posición", w: "tamaño", h: "tamaño", eliminado: "borrado", html: "texto", texto: "texto", relleno: "color", color: "color" }[f.campo] || f.campo;
    return `${nombre} (${campo})`;
  }

  /** La ventana «Comparar con el original»: lado a lado, y desde ahí fusionar. */
  async function comparar(ramaId, alTerminar) {
    let dr, dorig;
    try {
      dr = await api().get(`/api/documentos/${ramaId}`);
      if (!dr.documento.ramaDe) return aviso("Este documento ya no es una rama", { tipo: "info" });
      dorig = await api().get(`/api/documentos/${dr.documento.ramaDe}`);
    } catch (e) { return aviso(e.red ? "Para comparar hace falta conexión" : e.message, { tipo: "error" }); }
    const modo = dr.documento.modo;
    const { filas, conflictos } = diferencias(dorig.estado, dr.estado, dr.documento.ramaBase, dr.documento.ramaNodos, modo);
    const eleccion = {};
    conflictos.forEach((f) => {
      const ro = dorig.estado.bloques[f.bloque][f.campo], rr = dr.estado.bloques[f.bloque][f.campo];
      eleccion[f.bloque + "|" + f.campo] = (rr.t > ro.t || (rr.t === ro.t && rr.n > ro.n)) ? "rama" : "original";
    });
    const fila = (f, i) => {
      const k = f.bloque + "|" + f.campo, conf = conflictos.includes(f);
      const lado = f.tipo === "parrafo" ? "" : f.enOriginal && f.enRama ? "Cambió en los dos" : f.enRama ? "Cambió en la rama" : f.enOriginal ? "Cambió en el original" : "Distinto";
      return `<div class="comp-fila${conf ? " conflicto" : ""}">
        <div class="comp-cab"><b>${esc(etiqueta(f, dr.estado))}</b>${lado ? `<span class="chip chico ${conf ? "aviso" : ""}">${esc(lado)}</span>` : ""}</div>
        <div class="comp-lados">
          <div class="comp-lado"><span class="etiqueta">Original</span><p>${esc(f.tipo === "parrafo" ? (f.original == null ? "(no está)" : f.original || "(vacío)") : corto(f.original))}</p></div>
          <div class="comp-lado rama"><span class="etiqueta">Rama</span><p>${esc(f.tipo === "parrafo" ? (f.rama == null ? "(no está)" : f.rama || "(vacío)") : corto(f.rama))}</p></div>
        </div>
        ${conf ? `<div class="segmentado chico" role="group" aria-label="Qué se queda" data-k="${esc(k)}">
          <button type="button" data-v="original" aria-pressed="${eleccion[k] === "original"}">Quedarse con el original</button>
          <button type="button" data-v="rama" aria-pressed="${eleccion[k] === "rama"}">Quedarse con la rama</button></div>` : ""}
      </div>`;
    };
    const estado = dr.documento.ramaEstado;
    const cuerpo = html(`<div class="col comparar">
      <p class="suave" style="font-weight:650">«${esc(dr.documento.nombre)}» es lo que ${esc(dr.documento.ramaAutor || "alguien")} tenía al volver la conexión. Aquí ves en qué difiere del original <b>«${esc(dorig.documento.nombre)}»</b>.
        ${conflictos.length ? `En ${conflictos.length === 1 ? "un lugar" : conflictos.length + " lugares"} cambiaron <b>los dos</b>: elige qué se queda.` : ""}</p>
      ${filas.length ? `<div class="comp-lista">${filas.slice(0, 200).map(fila).join("")}</div>${filas.length > 200 ? `<p class="suave chico">…y ${filas.length - 200} diferencias más.</p>` : ""}`
        : `<div class="alerta ok">${ico("circle-check")}<span>La rama y el original ya dicen lo mismo.</span></div>`}
      <p class="suave chico">${ico("history", "ico-s")} Al fusionar se guarda antes una versión del original («Antes de fusionar la rama de ${esc(dr.documento.ramaAutor || "…")}»): desde el historial se puede regresar. Las partes que tienen dueño solo las cambia su dueño (o el propietario del espacio).</p>
    </div>`);
    $$("[data-k]", cuerpo).forEach((g) => $$("[data-v]", g).forEach((b) => (b.onclick = () => { eleccion[g.dataset.k] = b.dataset.v; $$("[data-v]", g).forEach((x) => x.setAttribute("aria-pressed", x === b)); })));
    const pie = html(`<div style="display:contents"><button class="btn" data-cerrar>Cerrar</button><span class="crece"></span>
      ${estado === "abierta" && dorig.permiso !== "LECTURA" ? `<button class="btn primario" data-fusionar>${ico("git-merge")} Fusionar en el original</button>` : ""}</div>`);
    const h = hoja({ titulo: "Comparar con el original", icono: "git-compare", cuerpo, pie, ancha: true });
    $("[data-cerrar]", pie).onclick = () => h.cerrar();
    const f = $("[data-fusionar]", pie);
    if (f) f.onclick = async () => {
      f.disabled = true;
      const ok = await fusionar(ramaId, eleccion, dorig.documento);
      if (ok) { h.cerrar(true); if (alTerminar) alTerminar(ok); }
      else f.disabled = false;
    };
  }

  async function fusionar(ramaId, elecciones, original) {
    try {
      const r = await api().post(`/api/documentos/${ramaId}/fusionar`, { elecciones: elecciones || {} }, { ms: 90000 });
      aviso(`Listo: la rama se fusionó${original ? " con «" + original.nombre + "»" : ""}.${r.rechazadas ? ` ${r.rechazadas} cambio(s) no se aplicaron: ${r.motivo || "partes con dueño"}.` : ""} Si algo no quedó bien, regresa a la versión «Antes de fusionar…» en el historial.`, { tipo: r.rechazadas ? "aviso" : "ok", ms: 10000, accion: { texto: "Abrir el original", fn: () => (location.hash = "#/doc/" + r.original) } });
      return r;
    } catch (e) { aviso(e.message, { tipo: "error", ms: 8000 }); return null; }
  }

  async function apartar(ramaId) {
    if (!(await confirmar("Dejar como documento aparte", "Se quita el lazo con el original: queda como un documento más del espacio (no se borra nada y ya no se puede fusionar).", { si: "Dejar aparte" }))) return false;
    try { await api().put(`/api/documentos/${ramaId}/rama`, { accion: "aparte" }); aviso("Listo: ahora es un documento aparte", { tipo: "ok" }); return true; }
    catch (e) { aviso(e.message, { tipo: "error" }); return false; }
  }

  async function descartar(ramaId) {
    if (!(await confirmar("Descartar la rama", "Va a la papelera del espacio (se puede restaurar durante 30 días). El original no cambia.", { si: "Descartar", peligro: true }))) return false;
    try { await api().delete(`/api/documentos/${ramaId}`); aviso("La rama está en la papelera del espacio", { tipo: "ok" }); return true; }
    catch (e) { aviso(e.message, { tipo: "error" }); return false; }
  }

  /** «Ramas (n)» de un documento: la lista, con abrir, comparar y fusionar. */
  async function lista(docId) {
    let l;
    try { l = await api().get(`/api/documentos/${docId}/ramas`); } catch (e) { return aviso(e.message, { tipo: "error" }); }
    const motivo = { entrega: "editada después de la fecha límite", protegido: "lo protegieron mientras tanto", telefono: "desde el teléfono que comparte" };
    const cuerpo = html(`<div class="col"><p class="suave" style="font-weight:650">Versiones de este documento que alguien editó sin conexión mientras otros lo cambiaban. El original no se tocó: compáralas y fusiónalas, o déjalas aparte.</p>
      <div class="lista">${l.length ? l.map((x) => `<div class="lista-item">${ico("git-branch")}<span class="crece"><b>${esc(x.nombre)}</b><small>${esc(x.autor || "")}${x.motivo && motivo[x.motivo] ? " · " + esc(motivo[x.motivo]) : ""} · ${esc(NOM.haceCuanto(x.creada))}${x.estado === "fusionada" ? ` · fusionada por ${esc(x.fusionadaPor || "")}` : ""}</small></span>
        <a class="btn chico" href="#/doc/${esc(x.id)}">Abrir</a>${x.estado === "abierta" ? `<button class="btn chico primario" data-comparar="${esc(x.id)}">${ico("git-compare", "ico-s")} Comparar</button>` : `<span class="chip chico ok">Fusionada</span>`}</div>`).join("")
        : `<p class="suave">Este documento ya no tiene ramas.</p>`}</div></div>`);
    const h = hoja({ titulo: `Ramas (${l.filter((x) => x.estado === "abierta").length})`, icono: "git-branch", cuerpo, ancha: true });
    cuerpo.onclick = (e) => { if (e.target.closest("a")) h.cerrar(true); };
    $$("[data-comparar]", cuerpo).forEach((b) => (b.onclick = () => { h.cerrar(true); comparar(b.dataset.comparar, () => window.dispatchEvent(new HashChangeEvent("hashchange"))); }));
  }

  NOM.ramas = { UMBRAL, vector, marca, marcar, soltar, replica, decidir, avisar, comparar, fusionar, apartar, descartar, lista, diferencias, nombreRama };
})();
