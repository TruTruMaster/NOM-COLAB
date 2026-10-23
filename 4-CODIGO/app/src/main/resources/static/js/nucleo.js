/* NOM-COLAB · núcleo de interfaz: utilidades, íconos, avisos, hojas, menús y micro-textos.
   Scripts clásicos (sin módulos ES) para que la misma interfaz corra desde el servidor
   y empaquetada dentro de la app Android (file://). */
(function () {
  "use strict";
  const NOM = (window.NOM = window.NOM || {});

  // ------------------------------------------------------------ utilidades
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
  const ico = (n, cls) => `<svg class="ico ${cls || ""}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

  function html(cadena) {
    const t = document.createElement("template");
    t.innerHTML = cadena.trim();
    return t.content.firstElementChild;
  }
  function debounce(fn, ms) {
    let t;
    const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    f.ya = (...a) => { clearTimeout(t); fn(...a); };
    f.cancelar = () => clearTimeout(t);
    return f;
  }
  function throttle(fn, ms) {
    let ultimo = 0, t;
    return (...a) => {
      const ahora = Date.now();
      clearTimeout(t);
      if (ahora - ultimo >= ms) { ultimo = ahora; fn(...a); }
      else t = setTimeout(() => { ultimo = Date.now(); fn(...a); }, ms - (ahora - ultimo));
    };
  }
  function haceCuanto(ms) {
    const d = (Date.now() - ms) / 1000;
    if (d < 45) return "hace un momento";
    if (d < 90) return "hace 1 min";
    if (d < 3600) return `hace ${Math.round(d / 60)} min`;
    if (d < 5400) return "hace 1 h";
    if (d < 86400) return `hace ${Math.round(d / 3600)} h`;
    if (d < 172800) return "ayer";
    return new Date(ms).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  }
  function bytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
    return (n / 1073741824).toFixed(1) + " GB";
  }
  function iniciales(nombre) {
    const p = String(nombre || "?").replace(/[._-]+/g, " ").trim().split(/\s+/);
    return (p[0][0] + (p[1] ? p[1][0] : (p[0][1] || ""))).toUpperCase();
  }
  const avatar = (u, cls) => `<span class="avatar ${cls || ""}" style="--c:${esc(u.color || "#5B5BD6")}" title="${esc(u.nombre)}">${esc(iniciales(u.nombre))}</span>`;
  const idCorto = () => Math.random().toString(36).slice(2, 10);
  const leer = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const quitar = (k) => { try { localStorage.removeItem(k); } catch (e) { /* almacenamiento no disponible */ } };

  const MODOS = {
    TEXTO: { nombre: "Texto", icono: "file-text", micro: "Documento de texto: párrafos, títulos y listas." },
    HOJA: { nombre: "Hoja", icono: "sheet", micro: "Hoja de cálculo con fórmulas como =SUMA(A1:A5)." },
    PRESENTACION: { nombre: "Presentación", icono: "presentation", micro: "Diapositivas con animaciones para exponer." },
    DIAGRAMA: { nombre: "Diagrama", icono: "workflow", micro: "Organizador gráfico: figuras unidas con flechas." },
  };

  // ------------------------------------------------------------ avisos (toasts)
  let contAvisos;
  function aviso(texto, opc) {
    opc = opc || {};
    if (!contAvisos) { contAvisos = html(`<div class="avisos" role="status" aria-live="polite"></div>`); document.body.append(contAvisos); }
    const tipo = opc.tipo || "info";
    const icono = { ok: "circle-check", error: "triangle-alert", info: "info", aviso: "triangle-alert" }[tipo];
    const el = html(`<div class="aviso ${tipo}">${ico(icono)}<span>${esc(texto)}</span></div>`);
    if (opc.accion) {
      const b = html(`<button type="button">${esc(opc.accion.texto)}</button>`);
      b.onclick = () => { opc.accion.fn(); cerrar(); };
      el.append(b);
    }
    const ms = opc.ms || (opc.accion ? 6000 : 3500);
    el.style.setProperty("--ms", ms + "ms");
    contAvisos.append(el);
    while (contAvisos.children.length > 3) contAvisos.firstElementChild.remove();
    const cerrar = () => { clearTimeout(t); el.classList.add("saliendo"); setTimeout(() => el.remove(), 220); };
    // Con el cursor encima el aviso espera (para alcanzar a leerlo); al salir, sigue su cuenta.
    let resta = ms, desde = Date.now(), t = setTimeout(cerrar, ms);
    el.addEventListener("pointerenter", () => { clearTimeout(t); resta -= Date.now() - desde; el.classList.add("pausa"); });
    el.addEventListener("pointerleave", () => { desde = Date.now(); el.classList.remove("pausa"); t = setTimeout(cerrar, Math.max(800, resta)); });
    return cerrar;
  }

  // ------------------------------------------------------------ hojas (modales)
  // Una sola capa a la vez. ESC y clic fuera cierran; el foco queda atrapado dentro.
  let hojaActual = null;
  function hoja(opc) {
    if (hojaActual) hojaActual.cerrar(true);
    const velo = html(`
      <div class="velo" role="presentation">
        <section class="hoja ${opc.ancha ? "ancha" : ""}" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo">
          <div class="agarradera"></div>
          <header class="hoja-cab">
            ${opc.icono ? `<span class="modo-insignia" style="background:var(--acento-tenue);color:var(--acento-tinta)">${ico(opc.icono)}</span>` : ""}
            <h2 id="hoja-titulo">${esc(opc.titulo)}</h2>
            <button class="icono-btn" data-cerrar aria-label="Cerrar">${ico("x")}</button>
          </header>
          <div class="hoja-cuerpo"></div>
          ${opc.pie ? `<footer class="hoja-pie"></footer>` : ""}
        </section>
      </div>`);
    const cuerpo = $(".hoja-cuerpo", velo);
    if (typeof opc.cuerpo === "string") cuerpo.innerHTML = opc.cuerpo; else if (opc.cuerpo) cuerpo.append(opc.cuerpo);
    if (opc.pie) { const pie = $(".hoja-pie", velo); if (typeof opc.pie === "string") pie.innerHTML = opc.pie; else pie.append(opc.pie); }
    const anterior = document.activeElement;
    const api = {
      el: velo, cuerpo,
      cerrar(inmediato) {
        if (!velo.isConnected) return;
        document.removeEventListener("keydown", tecla, true);
        if (hojaActual === api) hojaActual = null;
        if (inmediato) velo.remove(); else { velo.classList.add("saliendo"); setTimeout(() => velo.remove(), 190); }
        if (anterior && anterior.focus) anterior.focus({ preventScroll: true });
        opc.alCerrar && opc.alCerrar();
      },
    };
    function tecla(e) {
      if (e.key === "Escape") { e.stopPropagation(); api.cerrar(); }
      if (e.key === "Tab") {
        const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', velo).filter((x) => !x.disabled && x.offsetParent);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }
    velo.addEventListener("mousedown", (e) => { if (e.target === velo) api.cerrar(); });
    $("[data-cerrar]", velo).onclick = () => api.cerrar();
    document.addEventListener("keydown", tecla, true);
    document.body.append(velo);
    hojaActual = api;
    requestAnimationFrame(() => {
      const f = $("[autofocus]", velo) || $("input, select, textarea", velo);
      if (f && window.matchMedia("(hover: hover)").matches) f.focus();
    });
    return api;
  }

  function confirmar(titulo, texto, opc) {
    opc = opc || {};
    return new Promise((ok) => {
      const pie = html(`<div style="display:contents"><button class="btn" data-no>Cancelar</button><button class="btn ${opc.peligro ? "peligro lleno" : "primario"}" data-si>${esc(opc.si || "Aceptar")}</button></div>`);
      let resuelto = false;
      const h = hoja({ titulo, cuerpo: `<p class="suave" style="font-weight:650">${esc(texto)}</p>`, pie, alCerrar: () => { if (!resuelto) ok(false); } });
      $("[data-no]", pie).onclick = () => h.cerrar();
      $("[data-si]", pie).onclick = () => { resuelto = true; ok(true); h.cerrar(); };
      setTimeout(() => $("[data-si]", pie).focus(), 50);
    });
  }

  function pedirTexto(titulo, opc) {
    opc = opc || {};
    return new Promise((ok) => {
      const cuerpo = html(`<form class="col"><div class="campo"><label for="pt">${esc(opc.etiqueta || "Nombre")}</label>
        <div class="entrada"><input id="pt" autocomplete="off" maxlength="${opc.max || 120}" value="${esc(opc.valor || "")}" placeholder="${esc(opc.ph || "")}" autofocus></div></div></form>`);
      const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>${esc(opc.si || "Guardar")}</button></div>`);
      let resuelto = false;
      const h = hoja({ titulo, cuerpo, pie, alCerrar: () => { if (!resuelto) ok(null); } });
      const enviar = (e) => { e && e.preventDefault(); resuelto = true; ok($("input", cuerpo).value.trim()); h.cerrar(); };
      cuerpo.onsubmit = enviar;
      $("[data-si]", pie).onclick = enviar;
      $("[data-no]", pie).onclick = () => h.cerrar();
    });
  }

  // ------------------------------------------------------------ menú contextual
  let menuActual = null;
  function menu(ancla, items) {
    cerrarMenu();
    const m = html(`<div class="menu" role="menu"></div>`);
    items.forEach((it) => {
      if (it === "-") { m.append(html("<hr>")); return; }
      if (it.titulo) { m.append(html(`<div class="menu-titulo">${esc(it.titulo)}</div>`)); return; }
      const b = html(`<button role="menuitem" class="${it.peligro ? "peligro" : ""}">${it.icono ? ico(it.icono) : ""}<span class="crece">${esc(it.texto)}</span>${it.atajo ? `<kbd>${esc(it.atajo)}</kbd>` : ""}${it.marcado ? ico("check", "ico-s") : ""}</button>`);
      b.onclick = () => { cerrarMenu(); it.fn && it.fn(); };
      m.append(b);
    });
    document.body.append(m);
    const r = ancla.getBoundingClientRect ? ancla.getBoundingClientRect() : { left: ancla.x, right: ancla.x, top: ancla.y, bottom: ancla.y };
    const w = m.offsetWidth, h = m.offsetHeight;
    let x = Math.min(r.left, innerWidth - w - 8), y = r.bottom + 6;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
    m.style.left = Math.max(8, x) + "px";
    m.style.top = y + "px";
    m.style.transformOrigin = `${Math.max(0, Math.min(w, (r.left + r.right) / 2 - Math.max(8, x))).toFixed(0)}px ${y >= r.bottom ? 0 : h}px`;
    menuActual = m;
    setTimeout(() => document.addEventListener("pointerdown", fueraMenu, true), 0);
    document.addEventListener("keydown", escMenu, true);
    const primero = $("button", m); if (primero) primero.focus({ preventScroll: true });
    return m;
  }
  function fueraMenu(e) { if (menuActual && !menuActual.contains(e.target)) cerrarMenu(); }
  function escMenu(e) {
    if (!menuActual) return;
    if (e.key === "Escape") { e.stopPropagation(); cerrarMenu(); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const bs = $$("button", menuActual); const i = bs.indexOf(document.activeElement);
      bs[(i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length].focus();
    }
  }
  function cerrarMenu() {
    if (!menuActual) return;
    const m = menuActual; menuActual = null;
    m.classList.add("saliendo");
    setTimeout(() => m.remove(), 130);
    document.removeEventListener("pointerdown", fueraMenu, true);
    document.removeEventListener("keydown", escMenu, true);
  }

  // ------------------------------------------------------------ micro-textos (CU-22)
  // Cursor encima 350 ms, o pulsación prolongada de 450 ms en pantalla táctil.
  // Cualquier elemento con data-micro="Título|explicación|atajo" lo obtiene.
  let microEl = null, microT = null, microDe = null;
  function mostrarMicro(el) {
    const [titulo, texto, atajo] = el.getAttribute("data-micro").split("|");
    ocultarMicro();
    microDe = el;
    microEl = html(`<div class="microtexto" role="tooltip"><b>${esc(titulo)}${atajo ? `<kbd>${esc(atajo)}</kbd>` : ""}</b>${texto ? esc(texto) : ""}</div>`);
    document.body.append(microEl);
    const r = el.getBoundingClientRect();
    const w = microEl.offsetWidth, h = microEl.offsetHeight;
    let y = r.bottom + 8;
    if (y + h > innerHeight - 8) y = r.top - h - 8;
    microEl.style.left = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + "px";
    microEl.style.top = y + "px";
  }
  function ocultarMicro() { clearTimeout(microT); if (microEl) microEl.remove(); microEl = null; microDe = null; }
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const el = e.target.closest && e.target.closest("[data-micro]");
    if (!el) { if (microDe) ocultarMicro(); return; }
    if (el === microDe) return;
    clearTimeout(microT);
    microT = setTimeout(() => mostrarMicro(el), microEl ? 60 : 350);
  });
  document.addEventListener("pointerdown", (e) => {
    ocultarMicro();
    if (e.pointerType === "mouse") return;
    const el = e.target.closest && e.target.closest("[data-micro]");
    if (!el) return;
    microT = setTimeout(() => { mostrarMicro(el); el.dataset.largo = "1"; if (navigator.vibrate) navigator.vibrate(8); }, 450);
  }, true);
  ["pointerup", "pointercancel", "scroll"].forEach((ev) => document.addEventListener(ev, (e) => {
    clearTimeout(microT);
    if (e.type !== "scroll" && microEl) setTimeout(ocultarMicro, 1400);
    if (e.type === "scroll") ocultarMicro();
  }, true));
  // Tras una pulsación prolongada no se dispara la acción del botón.
  document.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest("[data-largo]");
    if (el) { e.preventDefault(); e.stopPropagation(); delete el.dataset.largo; }
  }, true);
  document.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest("[data-micro]") && e.pointerType !== "mouse") e.preventDefault(); });

  // ------------------------------------------------------------ preferencias visuales
  let tTema = null, ultimoToque = { x: innerWidth / 2, y: 0, t: 0 };
  document.addEventListener("pointerdown", (e) => { ultimoToque = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
  function aplicarPreferencias(p) {
    p = p || {};
    const raiz = document.documentElement;
    const oscuro = p.tema === "oscuro" || (p.tema !== "claro" && matchMedia("(prefers-color-scheme: dark)").matches);
    const antes = raiz.dataset.tema, nuevo = oscuro ? "oscuro" : "claro";
    const quieto = !!p.movimientoReducido;
    if (antes && antes !== nuevo && document.startViewTransition && !quieto) {
      // El tema nuevo se abre en círculo desde el punto donde se hizo clic (o desde arriba).
      const o = Date.now() - ultimoToque.t < 3000 ? ultimoToque : { x: innerWidth / 2, y: 0 };
      const radio = Math.hypot(Math.max(o.x, innerWidth - o.x), Math.max(o.y, innerHeight - o.y));
      const tr = document.startViewTransition(() => { raiz.dataset.tema = nuevo; });
      tr.ready.then(() => raiz.animate({ clipPath: [`circle(0px at ${o.x}px ${o.y}px)`, `circle(${radio}px at ${o.x}px ${o.y}px)`] },
        { duration: 620, easing: "cubic-bezier(.16, 1, .3, 1)", pseudoElement: "::view-transition-new(root)" })).catch(() => {});
    } else {
      raiz.dataset.tema = nuevo;
      // Sin View Transitions: los colores se funden en vez de saltar.
      if (antes && antes !== nuevo) {
        raiz.classList.add("cambiando-tema");
        clearTimeout(tTema);
        tTema = setTimeout(() => raiz.classList.remove("cambiando-tema"), 480);
      }
    }
    raiz.dataset.calidad = p.calidad === "baja" ? "baja" : "alta";
    raiz.dataset.movimiento = p.movimientoReducido ? "reducido" : "normal";
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = oscuro ? "#1A1B22" : "#EFECE6";
    guardar("nom.pref", p);
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => aplicarPreferencias(leer("nom.pref", {})));
  aplicarPreferencias(leer("nom.pref", {}));

  // ------------------------------------------------------------ estilo protegido
  // Extensiones de modo oscuro o de temas, y traductores, meten hojas de estilo propias que cambian
  // la página. Las que no son de NOM-COLAB (las nuestras llevan data-nom) se quitan en cuanto
  // aparecen. El modo oscuro automático de Chrome y Dark Reader se apagan desde index.html, y el
  // alto contraste forzado y el tamaño de letra del sistema, desde nom.css.
  function protegerEstilo() {
    const ajena = (n) => n.nodeType === 1 && !n.hasAttribute("data-nom") && (n.tagName === "STYLE" || (n.tagName === "LINK" && /(^|\s)stylesheet(\s|$)/i.test(n.rel || "")));
    const limpiar = (padre) => {
      Array.from(padre.children).forEach((n) => { if (ajena(n)) n.remove(); });
      if (document.adoptedStyleSheets && document.adoptedStyleSheets.length) document.adoptedStyleSheets = [];
    };
    // Solo los hijos directos de <html>, <head> y <body>: ahí las meten; vigilar todo el árbol
    // costaría en cada tecla del editor.
    const obs = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (ajena(n)) n.remove(); })));
    [document.documentElement, document.head, document.body].filter(Boolean).forEach((padre) => { limpiar(padre); obs.observe(padre, { childList: true }); });
  }
  if (document.body) protegerEstilo(); else document.addEventListener("DOMContentLoaded", protegerEstilo);

  // ------------------------------------------------------------ dónde viven los documentos sin servidor
  // La app Android guarda en su propio almacenamiento (no en un navegador): los textos lo dicen así.
  const enApp = () => location.protocol === "file:" || !!window.NomAndroid;
  const aqui = () => (enApp()
    ? { en: "en esta app (en este teléfono)", aqui: "esta app", borrar: "desinstalas la app o borras sus datos", sinEspacio: "Ya no queda espacio en el teléfono para la app" }
    : { en: "en este navegador", aqui: "este navegador", borrar: "borras la caché o los datos del navegador", sinEspacio: "El navegador ya no tiene espacio" });

  Object.assign(NOM, {
    enApp, aqui,
    esc, $, $$, ico, html, debounce, throttle, haceCuanto, bytes, iniciales, avatar, idCorto,
    leer, guardar, quitar, MODOS, aviso, hoja, confirmar, cerrarHoja: () => hojaActual && hojaActual.cerrar(true), hayHoja: () => !!hojaActual, pedirTexto, menu, cerrarMenu, ocultarMicro, aplicarPreferencias,
  });
})();
