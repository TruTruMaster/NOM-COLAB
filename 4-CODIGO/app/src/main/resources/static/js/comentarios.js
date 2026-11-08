/* NOM-COLAB · Comentarios y sugerencias (7).
   Un comentario es un bloque más del documento (tipo "comentario"): viaja por el mismo CRDT, así
   que se ve al momento en todos los equipos y funciona igual en la red del salón sin Internet
   (Google Docs y Notion no dejan comentar sin conexión). Se ancla a un tramo del texto (ids de sus
   letras, que no cambian aunque otros escriban antes), a una celda o a una figura.
     { tipo: "comentario", ancla, padre (en las respuestas), texto, autorId, autor, color, t, resuelto }
   En el texto, el modo sugerencia propone cambios que el equipo acepta o rechaza desde aquí. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso, avatar, haceCuanto } = NOM;
  const api = () => NOM.api;

  const hilos = (ed) => {
    const todos = ed.doc.comentarios();
    const raiz = todos.filter((c) => !c.padre);
    return raiz.map((c) => Object.assign({}, c, { respuestas: todos.filter((r) => r.padre === c.id) }));
  };
  const yo = () => api().usuario() || {};
  const puedeBorrar = (ed, c) => c.autorId === yo().id || ed.esPropietario;

  function pintarMarcas(ed) {
    const m = ed.modoApi && ed.modoApi.comentarios;
    const hs = hilos(ed);
    if (m && m.pintar) m.pintar(hs);
    const b = $("[data-a=comentarios]", ed.vista);
    if (b) { const n = hs.filter((h) => !h.resuelto).length; b.dataset.cuenta = n || ""; b.classList.toggle("con-cuenta", n > 0); }
  }

  let panel = null;   // { ed, cont, enfoque }
  function abierto(ed) { return panel && panel.ed === ed && panel.cont.isConnected; }

  function abrir(ed, enfoque) {
    if (ed.local) return aviso("Los comentarios necesitan un espacio (con cuenta)", { tipo: "info" });
    const lateral = $("[data-lateral]", ed.vista);
    if (abierto(ed) && !enfoque) { cerrar(); return; }
    lateral.innerHTML = `<div class="cajon comentarios-cajon"><div class="cajon-cab"><h3>${ico("message-square", "ico-s")} Comentarios</h3>
      ${ed.soloLectura ? "" : `<button class="btn chico" data-nuevo>${ico("plus", "ico-s")} Comentar</button>`}<button class="icono-btn" data-cerrar aria-label="Cerrar comentarios">${ico("x")}</button></div>
      <div class="cajon-cuerpo" data-lista></div></div>`;
    panel = { ed, cont: lateral.firstElementChild, enfoque: enfoque || null };
    $("[data-cerrar]", panel.cont).onclick = cerrar;
    const nb = $("[data-nuevo]", panel.cont); if (nb) nb.onclick = () => nuevo(ed);
    panel.cont.addEventListener("click", alClic);
    panel.cont.addEventListener("submit", alEnviar);
    pintar();
  }
  function cerrar() {
    if (!panel) return;
    const l = panel.cont.parentElement;
    if (l && panel.cont.isConnected) l.innerHTML = "";
    panel = null;
  }

  function pintar() {
    if (!panel || !panel.cont.isConnected) return;
    const ed = panel.ed, lista = $("[data-lista]", panel.cont);
    const hs = hilos(ed), abiertos = hs.filter((h) => !h.resuelto), resueltos = hs.filter((h) => h.resuelto);
    const sug = ed.modoApi && ed.modoApi.sugerencias ? ed.modoApi.sugerencias.lista() : [];
    const tarjeta = (h) => `<article class="hilo${h.resuelto ? " resuelto" : ""}${panel.enfoque === h.id ? " enfocado" : ""}" data-h="${esc(h.id)}">
      ${h.ancla && h.ancla.cita ? `<button class="hilo-cita" data-ir title="Ir a lo comentado">${ico("quote", "ico-s")}<span class="recorta">${esc(h.ancla.cita)}</span></button>` : ""}
      ${[h].concat(h.respuestas).map((c) => `<div class="hilo-msj" data-c="${esc(c.id)}">${avatar({ nombre: c.autor, color: c.color })}<div class="crece"><b>${esc(c.autor)}</b> <small class="suave">${esc(haceCuanto(c.t || 0))}</small>
        <p>${esc(c.texto).replace(/\n/g, "<br>")}</p></div>${puedeBorrar(ed, c) && !ed.soloLectura ? `<button class="icono-btn chico" data-borrar aria-label="Eliminar">${ico("trash-2", "ico-s")}</button>` : ""}</div>`).join("")}
      ${ed.soloLectura ? "" : `<div class="fila hilo-acc">${h.resuelto ? `<button class="btn chico" data-reabrir>Reabrir</button>` : `<button class="btn chico" data-responder>${ico("reply", "ico-s")} Responder</button><button class="btn chico" data-resolver>${ico("check", "ico-s")} Resuelto</button>`}</div>
        <form class="hilo-resp" data-resp hidden><textarea name="texto" rows="2" placeholder="Tu respuesta…" maxlength="2000"></textarea><button class="btn chico primario">Enviar</button></form>`}
    </article>`;
    const tSug = (g, i) => `<article class="hilo sugerencia" data-s="${i}"><div class="hilo-msj">${avatar({ nombre: g.autor.n, color: g.autor.c })}<div class="crece"><b>${esc(g.autor.n)}</b> <small class="suave">${g.tipo === "insertar" ? "propone agregar" : "propone borrar"}</small>
      <p class="${g.tipo === "insertar" ? "sug-ins" : "sug-del"}">${esc(g.texto.slice(0, 200))}</p></div></div>
      ${ed.soloLectura ? "" : `<div class="fila hilo-acc"><button class="btn chico primario" data-aceptar>${ico("check", "ico-s")} Aceptar</button><button class="btn chico" data-rechazar>${ico("x", "ico-s")} Rechazar</button><button class="btn chico plano" data-ver-sug>Ver</button></div>`}</article>`;
    lista.innerHTML = (sug.length ? `<div class="fila-e"><span class="etiqueta">Sugerencias (${sug.length})</span>${ed.soloLectura ? "" : `<span class="fila"><button class="btn chico" data-todas="1">Aceptar todas</button><button class="btn chico" data-todas="0">Rechazar todas</button></span>`}</div>${sug.map(tSug).join("")}` : "")
      + (abiertos.length ? abiertos.map(tarjeta).join("") : sug.length ? "" : `<div class="vacio" style="padding:24px 8px"><div class="burbuja">${ico("message-square")}</div><h3>Sin comentarios</h3><p>${ed.soloLectura ? "Aún nadie ha comentado." : "Elige un texto, una celda o una figura y toca <b>Comentar</b> (también en la ruedita, en Más)."}</p></div>`)
      + (resueltos.length ? `<details class="hilos-resueltos"><summary class="etiqueta">Resueltos (${resueltos.length})</summary>${resueltos.map(tarjeta).join("")}</details>` : "");
    panel.sug = sug;
    if (panel.enfoque) { const el = $(`[data-h="${CSS.escape(panel.enfoque)}"]`, lista); if (el) el.scrollIntoView({ block: "nearest" }); }
  }

  function alClic(e) {
    if (!panel) return;   // el botón de cerrar ya cerró el panel
    const ed = panel.ed, h = e.target.closest("[data-h]"), id = h && h.dataset.h;
    const sg = e.target.closest("[data-s]");
    if (sg && panel.sug) {
      const g = panel.sug[+sg.dataset.s], S = ed.modoApi.sugerencias;
      if (e.target.closest("[data-aceptar]")) { S.resolver(g, true); setTimeout(pintar, 30); }
      else if (e.target.closest("[data-rechazar]")) { S.resolver(g, false); setTimeout(pintar, 30); }
      else if (e.target.closest("[data-ver-sug]")) ed.modoApi.comentarios.irA({ a: g.its[0].id, f: g.its[g.its.length - 1].id });
      return;
    }
    const todas = e.target.closest("[data-todas]");
    if (todas && panel.sug) { const ok = todas.dataset.todas === "1"; panel.sug.slice().reverse().forEach((g) => ed.modoApi.sugerencias.resolver(g, ok)); setTimeout(pintar, 30); aviso(ok ? "Sugerencias aceptadas" : "Sugerencias rechazadas", { tipo: "ok" }); return; }
    if (!id) return;
    const c = ed.doc.bloque(id) || {};
    if (e.target.closest("[data-ir]")) { const m = ed.modoApi.comentarios; if (!m || !m.irA(c.ancla || {})) aviso("Lo comentado ya no está (se borró)", { tipo: "info" }); return; }
    if (e.target.closest("[data-responder]")) { const f = $("[data-resp]", h); f.hidden = false; $("textarea", f).focus(); return; }
    if (e.target.closest("[data-resolver]")) { ed.doc.cambiar(id, { resuelto: true }); return; }
    if (e.target.closest("[data-reabrir]")) { ed.doc.cambiar(id, { resuelto: null }); return; }
    const b = e.target.closest("[data-borrar]");
    if (b) {
      const cid = b.closest("[data-c]").dataset.c;
      NOM.confirmar("Eliminar comentario", cid === id ? "Se borra el comentario con sus respuestas." : "Se borra esta respuesta.", { si: "Eliminar", peligro: true }).then((si) => {
        if (!si) return;
        ed.doc.lote(() => { ed.doc.cambiar(cid, { eliminado: true }); if (cid === id) hilos(ed).filter((x) => x.id === id).flatMap((x) => x.respuestas).forEach((r) => ed.doc.cambiar(r.id, { eliminado: true })); });
      });
    }
  }

  function alEnviar(e) {
    const f = e.target.closest("[data-resp]");
    if (!f || !panel) return;
    e.preventDefault();
    const texto = f.texto.value.trim();
    if (!texto) return;
    const ed = panel.ed, padre = f.closest("[data-h]").dataset.h;
    crear(ed, { padre, texto });
    f.texto.value = "";
    f.hidden = true;
  }

  function crear(ed, campos) {
    const u = yo();
    const id = "cm" + NOM.DocCRDT.nuevoId();
    ed.doc.cambiar(id, Object.assign({ tipo: "comentario", autorId: u.id, autor: u.nombre, color: u.color, t: Date.now() }, campos));
    if (NOM.hito) NOM.hito("comentario");
    return id;
  }

  /** Comentar lo elegido (texto, celda, figura o diapositiva). */
  function nuevo(ed) {
    if (ed.local) return aviso("Los comentarios necesitan un espacio (con cuenta)", { tipo: "info" });
    if (ed.soloLectura) return aviso("Con permiso de solo lectura no se puede comentar", { tipo: "info" });
    const m = ed.modoApi && ed.modoApi.comentarios;
    const ancla = m && m.ancla ? m.ancla() : null;
    if (!ancla) return aviso("Elige primero el texto, la celda o la figura que quieres comentar", { tipo: "info", ms: 3200 });
    const cuerpo = html(`<form class="col"><div class="hilo-cita estatica">${ico("quote", "ico-s")}<span class="recorta">${esc(ancla.cita || "")}</span></div>
      <textarea name="texto" rows="4" maxlength="2000" placeholder="Escribe tu comentario…" style="width:100%;border-radius:12px;border:1px solid var(--borde);background:var(--sup-2);padding:10px;font:600 15px/1.4 var(--fuente);color:var(--tinta)"></textarea></form>`);
    const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>${ico("message-square", "ico-s")} Comentar</button></div>`);
    const h = NOM.hoja({ titulo: "Nuevo comentario", icono: "message-square", cuerpo, pie });
    setTimeout(() => cuerpo.texto.focus(), 60);
    const enviar = (e) => {
      e && e.preventDefault();
      const texto = cuerpo.texto.value.trim();
      if (!texto) return cuerpo.texto.focus();
      const id = crear(ed, { ancla, texto });
      h.cerrar();
      abrir(ed, id);
    };
    $("[data-no]", pie).onclick = () => h.cerrar();
    $("[data-si]", pie).onclick = enviar;
    cuerpo.onsubmit = enviar;
    cuerpo.texto.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(e); });
  }

  const repintar = NOM.debounce((ed) => { pintarMarcas(ed); if (panel && panel.ed === ed) pintar(); }, 120);
  /** El editor avisa de cada cambio: si tocó comentarios (o el texto, por las sugerencias), se repinta. */
  function cambios(ed, lista) {
    if (!ed || ed.local) return;
    const comentario = lista.some((c) => c.campos && (c.campos.tipo === "comentario" || ed.doc.valor(c.bloque, "tipo") === "comentario"));
    const texto = lista.some((c) => c.seq);
    if (comentario || (texto && panel && panel.ed === ed)) repintar(ed);
  }

  function montar(ed) {
    ed.alMontarModo = () => pintarMarcas(ed);
    setTimeout(() => pintarMarcas(ed), 200);
  }

  NOM.comentarios = { montar, abrir, cerrar, nuevo, cambios, pintarMarcas };
})();
