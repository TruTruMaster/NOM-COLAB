/* NOM-COLAB · Ruedita de acciones (menú radial o "pie menu").
   Como la rueda de "ping" de los juegos: un anillo de acciones alrededor de un punto. Se elige
   por DIRECCIÓN, no por posición exacta; con práctica se hace de memoria sin mirar (marking menu,
   Kurtenbach y Buxton).

   Formas de abrirla:
   - Sola (modo "auto"): al seleccionar algo (texto, una imagen, figuras, celdas) y dejar la
     selección quieta medio segundo, aparece junto a lo seleccionado. Si se sigue seleccionando se
     esconde y vuelve en la siguiente pausa. No atrapa el puntero ni el teclado: lo de abajo se
     sigue usando; escribir, tocar fuera o Esc la cierran. Se elige con un toque o un clic.
   - Clic derecho (o la tecla Menú): se elige al soltar en la dirección de la acción. Un clic
     derecho rápido deja la rueda abierta para elegir con clic. Mayús + clic derecho abre el menú
     normal del navegador (corrector ortográfico, etc.).
   - Mantener el dedo o el clic izquierdo quieto ~0.45 s, donde cada editor lo permite.
   Teclado (rueda abierta con clic derecho o tecla Menú): flechas, Enter, 1-8 directo, Esc.

   Las 8 posiciones tienen el mismo orden en todos los editores (en el sentido del reloj, desde
   arriba), para que la mano las aprenda:
     0 Negrita · 1 Cursiva · 2 Subrayado · 3 Color · 4 Eliminar o cortar (abajo) ·
     5 Copiar o duplicar · 6 Estilo, orden o formato · 7 Más
   Lo que no aplica a la selección se muestra apagado en su lugar; las demás no se recorren. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html } = NOM;

  const R = 112, RI = 38, MUERTA = 26;   // radio externo, interno y zona muerta del centro
  const ESPERA_AUTO = 500;                // pausa de la selección antes de que aparezca sola
  let actual = null;

  function sector(i, n) {
    const paso = (Math.PI * 2) / n, a0 = -Math.PI / 2 - paso / 2 + i * paso, a1 = a0 + paso;
    const p = (r, a) => `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
    const largo = paso > Math.PI ? 1 : 0;
    return `M${p(RI, a0)} L${p(R, a0)} A${R},${R} 0 ${largo} 1 ${p(R, a1)} L${p(RI, a1)} A${RI},${RI} 0 ${largo} 0 ${p(RI, a0)} Z`;
  }

  /** Zona visible de la pantalla (con el teclado del celular abierto es más chica). */
  function visible() {
    const vv = window.visualViewport;
    return vv ? { x: vv.offsetLeft, y: vv.offsetTop, w: vv.width, h: vv.height } : { x: 0, y: 0, w: innerWidth, h: innerHeight };
  }
  /** Centro para una rueda junto a lo seleccionado (rect en coordenadas de pantalla): debajo; si no
      cabe, arriba; si no, a un lado. Así no tapa lo que se eligió ni las manijas de selección. */
  function puntoJunto(r) {
    const v = visible(), m = 10, d = R + 16;
    const cx = Math.min(v.x + v.w - R - m, Math.max(v.x + R + m, (r.left + r.right) / 2));
    if (r.bottom + d + R + m <= v.y + v.h) return { x: cx, y: r.bottom + d };
    if (r.top - d - R - m >= v.y) return { x: cx, y: r.top - d };
    const cy = Math.min(v.y + v.h - R - m, Math.max(v.y + R + m, (r.top + r.bottom) / 2));
    if (r.right + d + R + m <= v.x + v.w) return { x: r.right + d, y: cy };
    if (r.left - d - R - m >= v.x) return { x: r.left - d, y: cy };
    return { x: cx, y: v.y + v.h - R - m };   // no hay hueco: abajo de la pantalla (el vidrio deja ver lo de atrás)
  }

  /**
   * Abre la rueda en (x, y). items: [{ texto, icono | color, fn, off, marcado, mantener, sub: [...] }]
   * (hasta 8). opc.modo: "mantener" (se elige al soltar), "clic" o "auto" (no atrapa nada).
   * opc.alCerrar, opc.alElegir(item), opc.alDescartar (Esc en modo auto), opc.padre (submenú).
   */
  function abrir(x, y, items, opc, interno) {
    cerrar(!!interno);
    opc = opc || {};
    items = items.filter(Boolean).slice(0, 8);
    if (!items.length) return null;
    const n = items.length, auto = opc.modo === "auto";
    const v = visible();
    x = Math.min(v.x + v.w - R - 8, Math.max(v.x + R + 8, x));
    y = Math.min(v.y + v.h - R - 8, Math.max(v.y + R + 8, y));
    const velo = html(`<div class="rueda-velo${auto ? " pasivo" : ""}" role="presentation">
      <div class="rueda${opc.padre ? " sub" : ""}" role="menu" aria-label="${esc(opc.titulo || "Acciones rápidas")}" style="left:${x}px;top:${y}px">
        <div class="rueda-fondo"></div>
        <svg class="rueda-svg" viewBox="${-R} ${-R} ${R * 2} ${R * 2}" width="${R * 2}" height="${R * 2}" aria-hidden="true">
          ${items.map((it, i) => `<path class="rueda-sector ${it.off ? "off" : ""}" data-i="${i}" d="${sector(i, n)}"/>`).join("")}
        </svg>
        ${items.map((it, i) => {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / n, rm = (R + RI) / 2;
          return `<button class="rueda-item ${it.off ? "off" : ""} ${it.marcado ? "marcado" : ""}" role="menuitem" data-i="${i}" tabindex="-1" ${it.off ? 'aria-disabled="true"' : ""}
            style="--i:${i};left:${(rm * Math.cos(a)).toFixed(1)}px;top:${(rm * Math.sin(a)).toFixed(1)}px" aria-label="${esc(it.texto)}">
            ${it.color ? `<span class="rueda-muestra" style="background:${esc(it.color)}"></span>` : ico(it.icono || "circle")}
            <small>${esc(it.corto || it.texto)}</small>${it.sub ? `<i class="rueda-mas"></i>` : ""}</button>`;
        }).join("")}
        <div class="rueda-centro">${opc.padre ? ico("chevron-left", "ico-s") : ""}<span data-etq>${esc(opc.titulo || "Elige")}</span></div>
      </div></div>`);
    document.body.append(velo);
    const rueda = velo.firstElementChild;
    const fondo = rueda.querySelector(".rueda-fondo");
    const etq = rueda.querySelector("[data-etq]");
    let elegido = -1, modo = opc.modo || "clic", abajo = false;
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
      // El submenú se abre en el mismo lugar; su centro regresa a la rueda anterior.
      if (it.sub) { abrir(x, y, it.sub, Object.assign({}, opc, { modo: modo === "mantener" ? "clic" : modo, titulo: it.texto, padre: { items, opc } }), true); return; }
      cerrar();
      it.fn && it.fn();
      opc.alElegir && opc.alElegir(it);
    }
    function atras() { if (opc.padre) abrir(x, y, opc.padre.items, opc.padre.opc, true); else cerrar(); }
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
      const d = Math.hypot(e.clientX - x, e.clientY - y);
      if (d < RI && opc.padre) { atras(); return; }
      const i = porPunto(e.clientX, e.clientY);
      if (i < 0 || d > R + 40) { cerrar(); return; }
      elegir(i);
    }
    function tecla(e) {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); cerrar(); return; }
      if (e.key === "Backspace" && opc.padre) { e.preventDefault(); atras(); return; }
      if (/^[1-8]$/.test(e.key) && +e.key <= n) { e.preventDefault(); elegir(+e.key - 1); return; }
      if (["ArrowRight", "ArrowDown", "Tab"].includes(e.key)) { e.preventDefault(); marcar((elegido + 1 + n) % n); }
      else if (["ArrowLeft", "ArrowUp"].includes(e.key)) { e.preventDefault(); marcar((elegido - 1 + n) % n); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (elegido >= 0) elegir(elegido); }
      const b = velo.querySelector(`.rueda-item[data-i="${elegido}"]`);
      if (b) b.focus({ preventScroll: true });
    }

    let oyentes;
    const tragar = (e) => { e.preventDefault(); e.stopPropagation(); };
    if (auto) {
      // Solo el anillo recibe el puntero (el velo deja pasar todo). Presionar sobre él no le quita
      // el foco ni la selección al documento: así el teclado del celular no se cierra.
      fondo.addEventListener("pointermove", mover);
      fondo.addEventListener("pointerleave", () => { if (!abajo) marcar(-1); });
      fondo.addEventListener("pointerdown", (e) => { tragar(e); abajo = true; mover(e); });
      fondo.addEventListener("pointerup", (e) => {
        tragar(e);
        if (!abajo) return;
        abajo = false;
        if (Math.hypot(e.clientX - x, e.clientY - y) < RI) { atras(); return; }
        const i = porPunto(e.clientX, e.clientY);
        if (i >= 0) elegir(i);
      });
      fondo.addEventListener("pointercancel", () => { abajo = false; marcar(-1); });
      ["touchstart", "touchend", "mousedown", "click", "contextmenu"].forEach((t) => fondo.addEventListener(t, (e) => e.cancelable && tragar(e), { passive: false }));
      const fuera = (e) => { if (!fondo.contains(e.target)) cerrar(); };
      const teclaAuto = (e) => {
        if (e.key === "Escape") { tragar(e); cerrar(); opc.alDescartar && opc.alDescartar(); return; }
        if (!["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) cerrar();   // la tecla sigue su camino
      };
      oyentes = [["pointerdown", fuera], ["keydown", teclaAuto]];
    } else {
      // En el documento (fase de captura): con el dedo, el puntero queda capturado por el elemento
      // donde empezó el toque, así que los eventos no llegarían al velo.
      oyentes = [["pointermove", mover], ["pointerup", (e) => { tragar(e); soltar(e); }], ["click", (e) => { tragar(e); clic(e); }],
        ["contextmenu", tragar], ["keydown", tecla], ["touchmove", (e) => e.cancelable && e.preventDefault()]];
    }
    oyentes.forEach(([t, f]) => document.addEventListener(t, f, { capture: true, passive: false }));
    const quitarSel = document.body.style.userSelect;
    if (!auto) document.body.style.userSelect = "none";
    actual = {
      velo, opc, auto,
      mover(nx, ny) {
        const w = visible();
        x = Math.min(w.x + w.w - R - 8, Math.max(w.x + R + 8, nx));
        y = Math.min(w.y + w.h - R - 8, Math.max(w.y + R + 8, ny));
        rueda.style.left = x + "px"; rueda.style.top = y + "px";
      },
      cerrar(sinAviso) {
        // El clic que sigue a soltar el botón todavía debe tragarse; se quitan un instante después.
        setTimeout(() => oyentes.forEach(([t, f]) => document.removeEventListener(t, f, { capture: true })), 0);
        if (!auto) document.body.style.userSelect = quitarSel;
        velo.classList.add(sinAviso ? "cambiando" : "saliendo");
        setTimeout(() => velo.remove(), sinAviso ? 90 : 170);
        if (!sinAviso) opc.alCerrar && opc.alCerrar();
      },
    };
    requestAnimationFrame(() => rueda.classList.add("abierta"));
    return actual;
  }

  function cerrar(sinAviso) { if (actual) { const a = actual; actual = null; a.cerrar(sinAviso); } }

  /**
   * Ruedita que aparece sola. leer() describe lo seleccionado ahora:
   *   { firma, rect, items, titulo } o null si no hay nada.
   * firma identifica la selección (no cambia si solo se repinta o se desplaza la página).
   * El editor llama avisar() cada vez que la selección cambia o termina un gesto, y ocultar()
   * al empezar a escribir, arrastrar o editar.
   */
  function automatica(leer, opcA) {
    opcA = opcA || {};
    let t = null, firma = null, descartada = null;
    const control = {};
    const mia = () => !!(actual && actual.opc.dueno === control);
    const ocupado = () => document.hidden || NOM.hayHoja() || !!document.querySelector(".menu:not(.saliendo)") || (actual && !mia()) || (opcA.activa && !opcA.activa());
    function abrirYa() {
      t = null;
      if (ocupado()) return;
      const d = leer();
      if (!d || !d.items) { firma = null; return; }
      if (d.firma != null && d.firma === descartada) return;
      firma = d.firma;
      const p = puntoJunto(d.rect);
      abrir(p.x, p.y, d.items, {
        modo: "auto", titulo: d.titulo, dueno: control, tactil: matchMedia("(pointer: coarse)").matches,
        alDescartar: () => (descartada = firma),
        // Formato (negrita, color…): vuelve a salir para seguir dando formato. Lo demás termina.
        alElegir: (it) => { if (it.mantener) { descartada = null; control.avisar(); } else descartada = firma; },
      });
    }
    function acomodar(d) { const p = puntoJunto(d.rect); actual.mover(p.x, p.y); }
    control.avisar = () => {
      clearTimeout(t);
      if (mia()) {
        const d = leer();
        if (d && d.firma === firma) { acomodar(d); return; }   // misma selección: solo se acomoda
        cerrar();
      }
      t = setTimeout(abrirYa, opcA.ms || ESPERA_AUTO);
    };
    control.ocultar = () => { clearTimeout(t); if (mia()) cerrar(); };
    control.abierta = mia;
    // Al desplazar la página o abrir el teclado del celular, la rueda acompaña a la selección.
    const alDesplazar = () => {
      if (!mia()) return;
      const d = leer();
      if (d && d.firma === firma) acomodar(d); else cerrar();
    };
    document.addEventListener("scroll", alDesplazar, true);
    if (window.visualViewport) visualViewport.addEventListener("resize", alDesplazar);
    control.destruir = () => {
      control.ocultar();
      document.removeEventListener("scroll", alDesplazar, true);
      if (window.visualViewport) visualViewport.removeEventListener("resize", alDesplazar);
    };
    return control;
  }

  /**
   * Conecta la rueda a un elemento. items(e) devuelve las acciones para ese punto (o null).
   * opc.izquierdo: también al mantener el clic izquierdo quieto; opc.tactil: también con el dedo.
   * opc.alPreparar(e): se llama al presionar, antes de abrir (para guardar la selección).
   */
  function enlazar(el, items, opc) {
    opc = Object.assign({ izquierdo: true, tactil: true, ms: 450 }, opc);
    let espera = null;
    const cancelar = () => { if (espera) { clearTimeout(espera.t); espera = null; } };
    const manual = () => actual && !actual.auto;
    el.addEventListener("contextmenu", (e) => {
      if (e.shiftKey) return;   // menú nativo: corrector ortográfico, copiar enlace, etc.
      if (e.pointerType === "touch" || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) { if (opc.tactil) e.preventDefault(); return; }
      e.preventDefault();
      // Teclado (tecla Menú o Mayús+F10): se abre donde está el cursor.
      if (e.button === 0 && e.clientX === 0 && e.clientY === 0) {
        const r = opc.puntoTeclado ? opc.puntoTeclado() : el.getBoundingClientRect();
        const l = items(e);
        if (l) abrir(r.left + (r.width || 0) / 2, r.top + (r.height || 0) / 2, l, { modo: "clic", titulo: opc.titulo });
      }
    });
    el.addEventListener("pointerdown", (e) => {
      if (manual()) return;
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

  /** Rectángulo de pantalla que encierra varios elementos (o null). */
  function rectDe(els) {
    const rs = els.filter(Boolean).map((e) => e.getBoundingClientRect()).filter((r) => r.width || r.height);
    if (!rs.length) return null;
    return { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
  }

  NOM.rueda = { abrir, cerrar: () => cerrar(), enlazar, automatica, rectDe, abierta: () => !!actual, manual: () => !!(actual && !actual.auto) };
})();
