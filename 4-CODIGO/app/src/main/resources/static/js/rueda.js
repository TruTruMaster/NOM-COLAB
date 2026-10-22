/* NOM-COLAB · Ruedita de acciones (menú radial o "pie menu").
   Como la rueda de "ping" de los juegos: se mantiene presionado (clic derecho, o clic
   izquierdo / dedo quieto ~0.45 s) y aparece un anillo de acciones alrededor del puntero.
   Se elige por DIRECCIÓN, no por posición exacta: basta mover el puntero hacia la acción
   y soltar. Con práctica se hace de memoria sin mirar (marking menu, Kurtenbach y Buxton).
   - Soltar en el centro cancela. Un clic derecho rápido deja la rueda abierta para elegir con clic.
   - Teclado: flechas para recorrer, Enter para elegir, 1-8 directo, Esc para cerrar.
   - Mayús + clic derecho abre el menú normal del navegador (corrector ortográfico, etc.). */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html } = NOM;

  const R = 112, RI = 38, MUERTA = 26;   // radio externo, interno y zona muerta del centro
  let actual = null;

  function sector(i, n) {
    const paso = (Math.PI * 2) / n, a0 = -Math.PI / 2 - paso / 2 + i * paso, a1 = a0 + paso;
    const p = (r, a) => `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
    const largo = paso > Math.PI ? 1 : 0;
    return `M${p(RI, a0)} L${p(R, a0)} A${R},${R} 0 ${largo} 1 ${p(R, a1)} L${p(RI, a1)} A${RI},${RI} 0 ${largo} 0 ${p(RI, a0)} Z`;
  }

  /**
   * Abre la rueda en (x, y). items: [{ texto, icono | color, fn, off, sub: [...] }] (hasta 8).
   * opc.modo: "mantener" (se elige al soltar) o "clic". opc.alCerrar.
   */
  function abrir(x, y, items, opc) {
    cerrar();
    opc = opc || {};
    items = items.filter(Boolean).slice(0, 8);
    if (!items.length) return null;
    const n = items.length;
    x = Math.min(innerWidth - R - 8, Math.max(R + 8, x));
    y = Math.min(innerHeight - R - 8, Math.max(R + 8, y));
    const velo = html(`<div class="rueda-velo" role="presentation">
      <div class="rueda" role="menu" aria-label="${esc(opc.titulo || "Acciones rápidas")}" style="left:${x}px;top:${y}px">
        <svg class="rueda-svg" viewBox="${-R} ${-R} ${R * 2} ${R * 2}" width="${R * 2}" height="${R * 2}" aria-hidden="true">
          ${items.map((it, i) => `<path class="rueda-sector ${it.off ? "off" : ""}" data-i="${i}" d="${sector(i, n)}"/>`).join("")}
        </svg>
        ${items.map((it, i) => {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / n, rm = (R + RI) / 2;
          return `<button class="rueda-item ${it.off ? "off" : ""}" role="menuitem" data-i="${i}" tabindex="-1" ${it.off ? 'aria-disabled="true"' : ""}
            style="left:${(rm * Math.cos(a)).toFixed(1)}px;top:${(rm * Math.sin(a)).toFixed(1)}px" aria-label="${esc(it.texto)}">
            ${it.color ? `<span class="rueda-muestra" style="background:${esc(it.color)}"></span>` : ico(it.icono || "circle")}
            <small>${esc(it.corto || it.texto)}</small>${it.sub ? `<i class="rueda-mas"></i>` : ""}</button>`;
        }).join("")}
        <div class="rueda-centro"><span data-etq>${esc(opc.titulo || "Elige")}</span></div>
      </div></div>`);
    document.body.append(velo);
    const rueda = velo.firstElementChild;
    const etq = rueda.querySelector("[data-etq]");
    let elegido = -1, modo = opc.modo || "clic";
    const t0 = Date.now();

    function marcar(i) {
      if (i === elegido) return;
      elegido = i;
      velo.querySelectorAll("[data-i]").forEach((el) => el.classList.toggle("activo", +el.dataset.i === i));
      etq.textContent = i < 0 ? (opc.titulo || "Elige") : items[i].texto;
      if (i >= 0 && navigator.vibrate && opc.tactil) navigator.vibrate(5);
    }
    function porPunto(cx, cy) {
      const dx = cx - x, dy = cy - y;
      if (Math.hypot(dx, dy) < MUERTA) return -1;
      let a = Math.atan2(dy, dx) + Math.PI / 2 + Math.PI / n;
      a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return Math.floor(a / ((Math.PI * 2) / n)) % n;
    }
    function elegir(i) {
      const it = items[i];
      if (!it || it.off) return;
      if (it.sub) { const sub = it.sub; abrir(x, y, sub, { modo: "clic", titulo: it.texto, alCerrar: opc.alCerrar, tactil: opc.tactil }); return; }
      cerrar();
      it.fn && it.fn();
    }
    function mover(e) { marcar(porPunto(e.clientX, e.clientY)); }
    function soltar(e) {
      if (modo !== "mantener") return;
      const i = porPunto(e.clientX, e.clientY);
      // Clic derecho rápido sin moverse: la rueda se queda abierta para elegir con clic.
      if (i < 0 && Date.now() - t0 < 350) { modo = "clic"; return; }
      if (i < 0) { cerrar(); return; }
      elegir(i);
    }
    function clic(e) {
      if (modo !== "clic") return;
      const i = porPunto(e.clientX, e.clientY);
      if (i < 0 || Math.hypot(e.clientX - x, e.clientY - y) > R + 40) { cerrar(); return; }
      elegir(i);
    }
    function tecla(e) {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); cerrar(); return; }
      if (/^[1-8]$/.test(e.key) && +e.key <= n) { e.preventDefault(); elegir(+e.key - 1); return; }
      if (["ArrowRight", "ArrowDown", "Tab"].includes(e.key)) { e.preventDefault(); marcar((elegido + 1 + n) % n); }
      else if (["ArrowLeft", "ArrowUp"].includes(e.key)) { e.preventDefault(); marcar((elegido - 1 + n) % n); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (elegido >= 0) elegir(elegido); }
      const b = velo.querySelector(`.rueda-item[data-i="${elegido}"]`);
      if (b) b.focus({ preventScroll: true });
    }
    // En el documento (fase de captura): con el dedo, el puntero queda capturado por el elemento
    // donde empezó el toque, así que los eventos no llegarían al velo.
    const tragar = (e) => { e.preventDefault(); e.stopPropagation(); };
    const oyentes = [["pointermove", mover], ["pointerup", (e) => { tragar(e); soltar(e); }], ["click", (e) => { tragar(e); clic(e); }],
      ["contextmenu", tragar], ["keydown", tecla], ["touchmove", (e) => e.cancelable && e.preventDefault()]];
    oyentes.forEach(([t, f]) => document.addEventListener(t, f, { capture: true, passive: false }));
    const quitarSel = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    actual = {
      velo, cerrar() {
        // El clic que sigue a soltar el botón todavía debe tragarse; se quitan un instante después.
        setTimeout(() => oyentes.forEach(([t, f]) => document.removeEventListener(t, f, { capture: true })), 0);
        document.body.style.userSelect = quitarSel;
        velo.classList.add("saliendo");
        setTimeout(() => velo.remove(), 140);
        opc.alCerrar && opc.alCerrar();
      },
    };
    requestAnimationFrame(() => rueda.classList.add("abierta"));
    return actual;
  }

  function cerrar() { if (actual) { const a = actual; actual = null; a.cerrar(); } }

  /**
   * Conecta la rueda a un elemento. items(e) devuelve las acciones para ese punto (o null).
   * opc.izquierdo: también al mantener el clic izquierdo quieto; opc.tactil: también con el dedo.
   * opc.alPreparar(e): se llama al presionar, antes de abrir (para guardar la selección).
   */
  function enlazar(el, items, opc) {
    opc = Object.assign({ izquierdo: true, tactil: true, ms: 450 }, opc);
    let espera = null;
    const cancelar = () => { if (espera) { clearTimeout(espera.t); espera = null; } };
    el.addEventListener("contextmenu", (e) => {
      if (e.shiftKey) return;   // menú nativo: corrector ortográfico, copiar enlace, etc.
      if (e.pointerType === "touch" || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) { if (opc.tactil) e.preventDefault(); return; }
      e.preventDefault();
      // Teclado (tecla Menú o Mayús+F10): se abre donde está el cursor.
      if (e.button === 0 && e.clientX === 0 && e.clientY === 0) {
        const r = opc.puntoTeclado ? opc.puntoTeclado() : el.getBoundingClientRect();
        const l = items(e);
        if (l) abrir(r.left + (r.width || 0) / 2, r.top + (r.height || 0) / 2, l, { modo: "clic" });
      }
    });
    el.addEventListener("pointerdown", (e) => {
      if (actual) return;
      if (e.pointerType === "mouse" && e.button === 2 && !e.shiftKey) {
        opc.alPreparar && opc.alPreparar(e);
        const l = items(e);
        if (l) { e.preventDefault(); abrir(e.clientX, e.clientY, l, { modo: "mantener", titulo: opc.titulo }); }
        return;
      }
      const tactil = e.pointerType !== "mouse";
      if ((e.button !== 0) || (tactil && !opc.tactil) || (!tactil && !opc.izquierdo)) return;
      if (opc.ignorar && opc.ignorar(e)) return;
      cancelar();
      espera = { x: e.clientX, y: e.clientY, id: e.pointerId, t: setTimeout(() => {
        const ev = e;
        espera = null;
        opc.alPreparar && opc.alPreparar(ev);
        const l = items(ev);
        if (!l) return;
        abrir(ev.clientX, ev.clientY, l, { modo: "mantener", titulo: opc.titulo, tactil });
        if (navigator.vibrate && tactil) navigator.vibrate(12);
        // El clic que termina este gesto no debe llegar al elemento de abajo.
        const tragar = (c) => { c.stopPropagation(); c.preventDefault(); };
        document.addEventListener("click", tragar, { capture: true, once: true });
        setTimeout(() => document.removeEventListener("click", tragar, { capture: true }), 600);
      }, opc.ms) };
    });
    const mover = (e) => { if (espera && e.pointerId === espera.id && Math.hypot(e.clientX - espera.x, e.clientY - espera.y) > 7) cancelar(); };
    el.addEventListener("pointermove", mover);
    ["pointerup", "pointercancel", "dragstart", "wheel"].forEach((t) => el.addEventListener(t, cancelar));
    el.addEventListener("scroll", cancelar, true);
  }

  NOM.rueda = { abrir, cerrar, enlazar, abierta: () => !!actual };
})();
