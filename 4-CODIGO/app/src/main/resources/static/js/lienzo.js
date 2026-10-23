/* NOM-COLAB · Lienzo libre: modos Presentación y Diagrama, con herramientas tipo Canva.
   Los dos usan la misma posición x, y, ancho, alto y z de cada Bloque; por eso un
   bloque que creaste en el diagrama aparece en el mismo lugar de la diapositiva.

   Cada figura es un trazo SVG calculado a partir de su tamaño, así se puede rellenar,
   bordear, girar, voltear y redondear sin deformarse. Propiedades (todas registros LWW):
     figura, color (relleno), relleno=false (sin relleno), borde, bordeAncho, bordeEstilo,
     opacidad, radio, sombra, rot, volteoH, volteoV, bloqueado, grupo,
     tColor, tTam, tNegrita, tCursiva, tSubrayado, tAlin, tFuente (texto, para todo el cuadro).
   Interacción: selección múltiple (Mayús+clic o recuadro), guías inteligentes al mover,
   tiradores para cambiar tamaño y girar, barra contextual y ruedita (clic derecho o mantener). */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso } = NOM;
  const ANCHO = 960, ALTO = 540;
  const PALETA = ["#CFE0FF", "#CDEFD9", "#FFE0BF", "#E4D9FF", "#FFD6DE", "#FFF1B8", "#E7E5EE", "#FFFFFF", "#5B5BD6", "#2B2A33"];
  const COLORES = [
    "#FFFFFF", "#E7E5EE", "#B7B4C2", "#6B6875", "#2B2A33", "#000000",
    "#FFD6DE", "#FF8FA3", "#F2385A", "#C2185B", "#FFE0BF", "#FFB066", "#F08C2A", "#B54708",
    "#FFF1B8", "#FFD84D", "#F2C200", "#CDEFD9", "#7FD8A6", "#2FA868", "#1D7A4C",
    "#CFE0FF", "#7FA8FF", "#3D72F2", "#1E3A8A", "#E4D9FF", "#B39DFF", "#8B5CF6", "#5B5BD6", "#00B0F0",
  ];
  const luz = (c) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(c || "");
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  };
  const oscuro = (c) => luz(c) < 0.5;

  // ------------------------------------------------------------ figuras
  const FIGURAS = [
    ["rect", "Rectángulo"], ["elipse", "Elipse"], ["rombo", "Rombo"], ["triangulo", "Triángulo"], ["triangulo-r", "Triángulo rectángulo"],
    ["pentagono", "Pentágono"], ["hexagono", "Hexágono"], ["octagono", "Octágono"], ["estrella", "Estrella"], ["corazon", "Corazón"],
    ["nube", "Nube"], ["burbuja", "Globo de diálogo"], ["flecha", "Flecha"], ["flecha-doble", "Flecha doble"], ["chevron", "Chevrón"],
    ["cruz", "Cruz"], ["paralelogramo", "Paralelogramo (entrada/salida)"], ["trapecio", "Trapecio"], ["cilindro", "Cilindro (base de datos)"],
    ["documento", "Documento"], ["nota", "Nota adhesiva"], ["linea", "Línea"], ["linea-flecha", "Línea con flecha"],
  ];
  const n2 = (v) => +v.toFixed(2);
  /** Trazo SVG de una figura en una caja de w × h (radio: esquinas del rectángulo). */
  function ruta(f, w, h, r) {
    const p = (pts) => "M" + pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join(" L") + " Z";
    switch (f) {
      case "elipse": return `M0,${n2(h / 2)} A${n2(w / 2)},${n2(h / 2)} 0 1 0 ${n2(w)},${n2(h / 2)} A${n2(w / 2)},${n2(h / 2)} 0 1 0 0,${n2(h / 2)} Z`;
      case "rombo": return p([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
      case "triangulo": return p([[w / 2, 0], [w, h], [0, h]]);
      case "triangulo-r": return p([[0, 0], [w, h], [0, h]]);
      case "pentagono": return p([[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]]);
      case "hexagono": return p([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]);
      case "octagono": { const a = w * 0.29, b = h * 0.29; return p([[a, 0], [w - a, 0], [w, b], [w, h - b], [w - a, h], [a, h], [0, h - b], [0, b]]); }
      case "estrella": {
        const pts = [];
        for (let i = 0; i < 10; i++) { const a = (-90 + i * 36) * Math.PI / 180, k = i % 2 ? 0.4 : 1; pts.push([w / 2 + (w / 2) * k * Math.cos(a), h * 0.53 + (h * 0.53) * k * Math.sin(a)]); }
        return p(pts);
      }
      case "corazon": return `M${n2(w / 2)},${n2(h)} C${n2(w * 0.12)},${n2(h * 0.72)} 0,${n2(h * 0.46)} 0,${n2(h * 0.28)} C0,${n2(h * 0.1)} ${n2(w * 0.14)},0 ${n2(w * 0.28)},0 C${n2(w * 0.39)},0 ${n2(w * 0.46)},${n2(h * 0.07)} ${n2(w / 2)},${n2(h * 0.17)} C${n2(w * 0.54)},${n2(h * 0.07)} ${n2(w * 0.61)},0 ${n2(w * 0.72)},0 C${n2(w * 0.86)},0 ${n2(w)},${n2(h * 0.1)} ${n2(w)},${n2(h * 0.28)} C${n2(w)},${n2(h * 0.46)} ${n2(w * 0.88)},${n2(h * 0.72)} ${n2(w / 2)},${n2(h)} Z`;
      case "nube": return `M${n2(w * 0.25)},${n2(h * 0.9)} C${n2(w * 0.08)},${n2(h * 0.9)} 0,${n2(h * 0.76)} 0,${n2(h * 0.6)} C0,${n2(h * 0.45)} ${n2(w * 0.1)},${n2(h * 0.35)} ${n2(w * 0.22)},${n2(h * 0.37)} C${n2(w * 0.22)},${n2(h * 0.17)} ${n2(w * 0.38)},${n2(h * 0.04)} ${n2(w * 0.55)},${n2(h * 0.09)} C${n2(w * 0.65)},0 ${n2(w * 0.85)},${n2(h * 0.05)} ${n2(w * 0.87)},${n2(h * 0.27)} C${n2(w * 0.97)},${n2(h * 0.31)} ${n2(w)},${n2(h * 0.45)} ${n2(w)},${n2(h * 0.58)} C${n2(w)},${n2(h * 0.78)} ${n2(w * 0.88)},${n2(h * 0.9)} ${n2(w * 0.74)},${n2(h * 0.9)} Z`;
      case "burbuja": {
        const hb = h * 0.8, k = Math.max(0, Math.min(r == null ? 14 : r, w / 4, hb / 3));
        return `M${n2(k)},0 H${n2(w - k)} Q${n2(w)},0 ${n2(w)},${n2(k)} V${n2(hb - k)} Q${n2(w)},${n2(hb)} ${n2(w - k)},${n2(hb)} H${n2(w * 0.38)} L${n2(w * 0.16)},${n2(h)} L${n2(w * 0.22)},${n2(hb)} H${n2(k)} Q0,${n2(hb)} 0,${n2(hb - k)} V${n2(k)} Q0,0 ${n2(k)},0 Z`;
      }
      case "flecha": { const t = h * 0.28, c = Math.min(w * 0.45, h * 0.9); return p([[0, t], [w - c, t], [w - c, 0], [w, h / 2], [w - c, h], [w - c, h - t], [0, h - t]]); }
      case "flecha-doble": { const t = h * 0.28, c = Math.min(w * 0.3, h * 0.9); return p([[0, h / 2], [c, 0], [c, t], [w - c, t], [w - c, 0], [w, h / 2], [w - c, h], [w - c, h - t], [c, h - t], [c, h]]); }
      case "chevron": { const k = Math.min(w * 0.4, h * 0.5); return p([[0, 0], [w - k, 0], [w, h / 2], [w - k, h], [0, h], [k, h / 2]]); }
      case "cruz": { const a = w * 0.33, b = h * 0.33; return p([[a, 0], [w - a, 0], [w - a, b], [w, b], [w, h - b], [w - a, h - b], [w - a, h], [a, h], [a, h - b], [0, h - b], [0, b], [a, b]]); }
      case "paralelogramo": { const k = w * 0.2; return p([[k, 0], [w, 0], [w - k, h], [0, h]]); }
      case "trapecio": { const k = w * 0.2; return p([[k, 0], [w - k, 0], [w, h], [0, h]]); }
      case "cilindro": { const e = Math.min(h * 0.16, 36); return `M0,${n2(e)} A${n2(w / 2)},${n2(e)} 0 0 1 ${n2(w)},${n2(e)} V${n2(h - e)} A${n2(w / 2)},${n2(e)} 0 0 1 0,${n2(h - e)} Z M0,${n2(e)} A${n2(w / 2)},${n2(e)} 0 0 0 ${n2(w)},${n2(e)}`; }
      case "documento": return `M0,0 H${n2(w)} V${n2(h * 0.86)} C${n2(w * 0.75)},${n2(h * 0.7)} ${n2(w * 0.5)},${n2(h * 1.04)} ${n2(w * 0.25)},${n2(h * 0.92)} C${n2(w * 0.14)},${n2(h * 0.87)} ${n2(w * 0.06)},${n2(h * 0.86)} 0,${n2(h * 0.9)} Z`;
      case "nota": { const k = Math.min(w, h) * 0.16; return p([[0, 0], [w, 0], [w, h - k], [w - k, h], [0, h]]); }
      case "linea": case "linea-flecha": return `M0,${n2(h / 2)} L${n2(w)},${n2(h / 2)}`;
      default: {
        const k = Math.max(0, Math.min(r == null ? 14 : r, w / 2, h / 2));
        if (!k) return p([[0, 0], [w, 0], [w, h], [0, h]]);
        return `M${n2(k)},0 H${n2(w - k)} A${n2(k)},${n2(k)} 0 0 1 ${n2(w)},${n2(k)} V${n2(h - k)} A${n2(k)},${n2(k)} 0 0 1 ${n2(w - k)},${n2(h)} H${n2(k)} A${n2(k)},${n2(k)} 0 0 1 0,${n2(h - k)} V${n2(k)} A${n2(k)},${n2(k)} 0 0 1 ${n2(k)},0 Z`;
      }
    }
  }
  const esLinea = (f) => f === "linea" || f === "linea-flecha";
  /** Relleno, borde y adornos de una figura ya resueltos (los usa también exportar). */
  function estiloFigura(b) {
    const f = b.figura || "rect", lineal = esLinea(f);
    const relleno = lineal || b.relleno === false ? null : b.color || "#E7E5EE";
    const ancho = lineal ? (b.bordeAncho || 3) : +b.bordeAncho || 0;
    const trazo = ancho ? b.borde || (lineal ? "#4A4854" : "#2B2A33") : null;
    return { f, lineal, relleno, ancho, trazo, radio: b.radio != null ? +b.radio : f === "rect" ? 14 : f === "burbuja" ? 14 : 0, estilo: b.bordeEstilo || "solido" };
  }
  function svgFigura(b) {
    const w = Math.max(1, b.w || 1), h = Math.max(1, b.h || 1), e = estiloFigura(b);
    const dash = e.estilo === "guiones" ? ` stroke-dasharray="${e.ancho * 3} ${e.ancho * 2}"` : e.estilo === "puntos" ? ` stroke-dasharray="0 ${e.ancho * 2}" stroke-linecap="round"` : "";
    const voltear = b.volteoH || b.volteoV ? ` transform="translate(${b.volteoH ? w : 0} ${b.volteoV ? h : 0}) scale(${b.volteoH ? -1 : 1} ${b.volteoV ? -1 : 1})"` : "";
    let extra = "";
    if (e.f === "nota") { const k = Math.min(w, h) * 0.16; extra = `<path d="M${n2(w - k)},${n2(h)} L${n2(w - k)},${n2(h - k)} L${n2(w)},${n2(h - k)} Z" fill="rgba(0,0,0,.12)"/>`; }
    if (e.f === "linea-flecha") { const k = 6 + e.ancho * 2.2; extra = `<path d="M${n2(w - k)},${n2(h / 2 - k * 0.6)} L${n2(w)},${n2(h / 2)} L${n2(w - k)},${n2(h / 2 + k * 0.6)} Z" fill="${esc(e.trazo)}"/>`; }
    return `<svg class="forma-svg" viewBox="0 0 ${n2(w)} ${n2(h)}" preserveAspectRatio="none" aria-hidden="true"><g${voltear}><path d="${ruta(e.f, w, h, e.radio)}" fill="${e.relleno ? esc(e.relleno) : "none"}" stroke="${e.trazo ? esc(e.trazo) : "none"}" stroke-width="${e.ancho}"${dash} stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${extra}</g></svg>`;
  }
  const ALIN = { izq: "left", centro: "center", der: "right" };
  /** ¿El texto se ve en negrita? Si no se eligió: las figuras y los títulos sí; un cuadro de texto normal, no. */
  const enNegrita = (b) => (b.tNegrita != null ? !!b.tNegrita : b.tipo === "forma" || b.estilo === "h1" || b.estilo === "h2");
  function estiloTexto(b, fondo) {
    const s = [];
    if (b.tColor) s.push(`color:${b.tColor}`); else if (fondo && oscuro(fondo)) s.push("color:#fff");
    if (b.tTam) s.push(`font-size:${+b.tTam}px`);
    if (b.tNegrita === false) s.push("font-weight:500"); else if (b.tNegrita) s.push("font-weight:850");
    if (b.tCursiva) s.push("font-style:italic");
    if (b.tSubrayado) s.push("text-decoration:underline");
    if (b.tAlin) s.push(`text-align:${ALIN[b.tAlin] || "center"}`);
    if (b.tFuente && NOM.textoRico) s.push(`font-family:${NOM.textoRico.cssFuente(b.tFuente)}`);
    return s.join(";");
  }

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
  const girar = (x, y, grados) => { const a = (grados * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return { x: x * c - y * s, y: x * s + y * c }; };
  NOM.geometria = { conector };
  NOM.figuras = { ruta, svgFigura, estiloFigura, FIGURAS, esLinea, enNegrita };

  function contenido(b) {
    if (b.tipo === "texto") return `<div class="libre-texto" data-estilo="${esc(b.estilo || "p")}" data-ph="${esc(b.ph || "Escribe aquí")}" style="${estiloTexto(b)}">${b.html || ""}</div>`;
    if (b.tipo === "forma") {
      const e = estiloFigura(b);
      return `<div class="forma" data-figura="${esc(e.f)}">${svgFigura(b)}${e.lineal ? "" : `<div class="txt" data-ph="Texto" style="${estiloTexto(b, e.relleno)}">${esc(b.texto || "")}</div>`}</div>`;
    }
    if (b.tipo === "imagen") {
      const s = [];
      if (b.radio) s.push(`border-radius:${+b.radio}px`);
      if (b.bordeAncho) s.push(`border:${+b.bordeAncho}px ${b.bordeEstilo === "guiones" ? "dashed" : b.bordeEstilo === "puntos" ? "dotted" : "solid"} ${b.borde || "#2B2A33"}`);
      if (b.volteoH || b.volteoV) s.push(`transform:scale(${b.volteoH ? -1 : 1},${b.volteoV ? -1 : 1})`);
      return `<img class="libre-imagen" src="${esc(b.src)}" alt="${esc(b.alt || "")}" draggable="false" style="${s.join(";")}">`;
    }
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
  /** Estilo del contenedor del bloque: posición, capa, giro, opacidad. */
  function estiloBloque(b, i) {
    let s = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;z-index:${(b.z || 0) + (i || 0) + 1};`;
    if (b.rot) s += `transform:rotate(${+b.rot}deg);`;
    if (b.opacidad != null && b.opacidad < 1) s += `opacity:${+b.opacidad};`;
    return s;
  }
  const clasesBloque = (b) => (b.sombra === true || (b.sombra == null && b.tipo === "forma" && !esLinea(b.figura)) ? " sombra" : "") + (b.bloqueado ? " bloqueado" : "");

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

  // ------------------------------------------------------------ paneles flotantes (color, deslizadores)
  function panel(ancla, cuerpo, opc) {
    opc = opc || {};
    $$(".lz-panel").forEach((x) => x.remove());
    const p = html(`<div class="menu lz-panel" role="dialog" aria-label="${esc(opc.titulo || "Opciones")}">${opc.titulo ? `<div class="menu-titulo">${esc(opc.titulo)}</div>` : ""}</div>`);
    if (typeof cuerpo === "string") p.insertAdjacentHTML("beforeend", cuerpo); else p.append(cuerpo);
    document.body.append(p);
    const r = ancla.getBoundingClientRect();
    p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left)) + "px";
    p.style.top = (r.bottom + p.offsetHeight + 8 > innerHeight ? Math.max(8, r.top - p.offsetHeight - 6) : r.bottom + 6) + "px";
    const cerrar = () => { p.remove(); document.removeEventListener("pointerdown", fuera, true); document.removeEventListener("keydown", esc2, true); opc.alCerrar && opc.alCerrar(); };
    const fuera = (e) => { if (!p.contains(e.target) && !ancla.contains(e.target)) cerrar(); };
    const esc2 = (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    setTimeout(() => { document.addEventListener("pointerdown", fuera, true); document.addEventListener("keydown", esc2, true); }, 0);
    p.cerrar = cerrar;
    return p;
  }
  function paletaColores(ancla, actual, alElegir, opc) {
    opc = opc || {};
    const p = panel(ancla, `${opc.sinColor ? `<button class="lz-sin" data-c="">${ico("x", "ico-s")} ${esc(opc.sinColor)}</button>` : ""}
      <div class="lz-muestras">${COLORES.map((c) => `<button data-c="${c}" style="background:${c}" aria-label="${c}" ${String(actual).toUpperCase() === c ? 'aria-pressed="true"' : ""}></button>`).join("")}</div>
      <label class="lz-otro">${ico("palette", "ico-s")} Color personalizado <input type="color" value="${/^#[0-9a-f]{6}$/i.test(actual || "") ? actual : "#5B5BD6"}"></label>`, { titulo: opc.titulo || "Color" });
    p.addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (b) { alElegir(b.dataset.c || null); p.cerrar(); } });
    $("input", p).addEventListener("input", (e) => alElegir(e.target.value.toUpperCase()));
  }
  function deslizador(ancla, titulo, valor, min, max, paso, unidad, alCambiar) {
    const p = panel(ancla, `<div class="lz-desl"><input type="range" min="${min}" max="${max}" step="${paso}" value="${valor}" aria-label="${esc(titulo)}"><output>${valor}${unidad}</output></div>`, { titulo });
    const r = $("input", p), o = $("output", p);
    r.addEventListener("input", () => { o.textContent = r.value + unidad; alCambiar(+r.value); });
    r.focus();
    return p;
  }

  // ================================================================== lienzo libre
  function crearLienzo(ed, cont, opc) {
    const doc = () => ed.doc;
    const acotado = !!opc.acotado;
    let vista = { x: 40, y: 40, z: 1 }, escala = 1;
    let sel = new Set(), selConector = null, herramienta = null, editando = null, origenEnlace = null;
    let espacio = false, multiple = false;
    const capa = html(acotado
      ? `<div class="escenario" data-escenario><div class="diapo" data-mundo><svg class="capa-conectores" data-svg width="${ANCHO}" height="${ALTO}"></svg><svg class="capa-guias" data-guias width="${ANCHO}" height="${ALTO}"></svg></div><div class="lz-marco" data-marco hidden></div></div>`
      : `<div class="pizarra" data-plano><div class="mundo" data-mundo><svg class="capa-conectores" data-svg width="1" height="1"></svg><svg class="capa-guias" data-guias width="1" height="1"></svg></div><div class="lz-marco" data-marco hidden></div></div>`);
    cont.append(capa);
    const superficie = capa;
    const mundo = $("[data-mundo]", capa);
    const svg = $("[data-svg]", capa), guias = $("[data-guias]", capa), marco = $("[data-marco]", capa);
    let zoomCtl = null;
    if (!acotado) {
      zoomCtl = html(`<div class="zoom-ctl"><button class="icono-btn" data-z="-" aria-label="Alejar" data-micro="Alejar||Ctrl+rueda">${ico("zoom-out")}</button><span data-zv>100%</span><button class="icono-btn" data-z="+" aria-label="Acercar" data-micro="Acercar||Ctrl+rueda">${ico("zoom-in")}</button><button class="icono-btn" data-z="ajustar" aria-label="Ajustar" data-micro="Ver todo|Encuadra todas las figuras.">${ico("maximize-2")}</button></div>`);
      capa.append(zoomCtl);
      $$("[data-z]", zoomCtl).forEach((b) => (b.onclick = () => (b.dataset.z === "ajustar" ? ajustar() : zoomEn(b.dataset.z === "+" ? 1.2 : 1 / 1.2))));
    }
    const barra = html(`<div class="lz-barra" role="toolbar" aria-label="Opciones de la selección" hidden></div>`);
    capa.append(barra);

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
      pintarBarra();
    }
    const zoomActual = () => (acotado ? escala : vista.z);
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
    const porId = (id) => bloques().find((b) => b.id === id);
    const unico = () => (sel.size === 1 ? [...sel][0] : null);
    function render() {
      const bs = bloques();
      $$(".bl", mundo).forEach((e) => e.remove());
      const mapa = {};
      for (const id of [...sel]) if (!bs.some((b) => b.id === id)) sel.delete(id);
      bs.filter((b) => b.tipo !== "conector").sort((a, b) => (a.z || 0) - (b.z || 0)).forEach((b, i) => {
        mapa[b.id] = b;
        const el = html(`<div class="bl${b.sinPos ? " sin-pos" : ""}${sel.has(b.id) ? " sel" : ""}${clasesBloque(b)}" data-id="${esc(b.id)}" data-tipo="${esc(b.tipo)}" style="${estiloBloque(b, i)}">${contenido(b)}</div>`);
        if (sel.size === 1 && sel.has(b.id) && !ed.soloLectura) adornos(el, b);
        mundo.append(el);
      });
      pintarConectores(bs, mapa);
      pintarCajaGrupo();
      if (editando) { const el = mundo.querySelector(`[data-id="${editando}"] .txt, [data-id="${editando}"] .libre-texto`); if (el) activarEdicion(el, false); }
      ed.pintarPresencia();
      pintarBarra();
      pintarMultiple();
      opc.alPintar && opc.alPintar();
    }
    function adornos(el, b) {
      if (b.bloqueado) { el.append(html(`<span class="lz-candado" title="Bloqueado">${ico("lock", "ico-s")}</span>`)); return; }
      const lineal = b.tipo === "forma" && esLinea(b.figura);
      (lineal ? ["w", "e"] : ["nw", "n", "ne", "e", "se", "s", "sw", "w"]).forEach((t) => el.append(html(`<span class="tirador" data-t="${t}"></span>`)));
      el.append(html(`<span class="girador" data-girar title="Girar (Mayús: de 15° en 15°)">${ico("rotate-cw", "ico-s")}</span>`));
      if (!acotado && b.tipo === "forma" && !lineal) el.append(html(`<button class="enlazar" data-enlazar aria-label="Unir con flecha" data-micro="Conector|Arrastra hasta otra figura para unirlas con una flecha.">${ico("arrow-right")}</button>`));
    }
    /** Recuadro punteado alrededor de una selección múltiple. */
    function pintarCajaGrupo() {
      $$(".lz-caja", mundo).forEach((x) => x.remove());
      if (sel.size < 2) return;
      const c = cajaDe([...sel].map(porId).filter(Boolean));
      if (!c) return;
      mundo.append(html(`<div class="lz-caja" style="left:${c.x - 6}px;top:${c.y - 6}px;width:${c.w + 12}px;height:${c.h + 12}px"></div>`));
    }
    function pintarConectores(bs, mapa) {
      const cs = bs.filter((b) => b.tipo === "conector" && mapa[b.desde] && mapa[b.hasta]);
      const defs = `<defs><marker id="flecha" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--tinta-2);stroke:none"/></marker></defs>`;
      svg.innerHTML = defs + cs.map((c) => {
        const p = conector(mapa[c.desde], mapa[c.hasta]);
        const d = `M${p.x1},${p.y1} L${p.x2},${p.y2}`;
        return `<g data-conector="${esc(c.id)}" style="color:var(${c.id === selConector ? "--m-diag" : "--tinta-2"})"><path class="toque" d="${d}"/><path class="${c.id === selConector ? "sel" : ""}" d="${d}" marker-end="url(#flecha)"/></g>`;
      }).join("");
    }
    function moverVisual(id, b) {
      const el = mundo.querySelector(`.bl[data-id="${id}"]`);
      if (!el) return;
      Object.assign(el.style, { left: b.x + "px", top: b.y + "px", width: b.w + "px", height: b.h + "px" });
      if (b.rot != null) el.style.transform = b.rot ? `rotate(${b.rot}deg)` : "";
    }
    function conectoresVisuales(cambios) {
      const bs = bloques().map((x) => (cambios[x.id] ? Object.assign({}, x, cambios[x.id]) : x));
      const mapa = {};
      bs.forEach((x) => (mapa[x.id] = x));
      pintarConectores(bs, mapa);
    }
    const cajaDe = (bs) => {
      if (!bs.length) return null;
      const x1 = Math.min(...bs.map((b) => b.x)), y1 = Math.min(...bs.map((b) => b.y));
      const x2 = Math.max(...bs.map((b) => b.x + b.w)), y2 = Math.max(...bs.map((b) => b.y + b.h));
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    };

    // ------------------------------------------------------------ selección y edición de texto
    /** Al elegir una figura agrupada se elige todo su grupo (como en Canva). */
    function conGrupo(ids) {
      const r = new Set(ids);
      const grupos = new Set([...r].map((id) => doc().valor(id, "grupo")).filter(Boolean));
      if (grupos.size) bloques().forEach((b) => { if (b.grupo && grupos.has(b.grupo)) r.add(b.id); });
      return r;
    }
    function seleccionar(ids, sumar) {
      ids = Array.isArray(ids) ? ids : ids ? [ids] : [];
      terminarEdicion();
      const nuevo = sumar ? new Set(sel) : new Set();
      conGrupo(ids).forEach((id) => (sumar && sel.has(id) && ids.includes(id) ? nuevo.delete(id) : nuevo.add(id)));
      sel = nuevo; selConector = null;
      ed.seleccionar([...sel][0] || null);
      render();
      opc.alSeleccionar && opc.alSeleccionar(unico());
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
      el.onkeydown = (e) => {
        if (e.key === "Escape") { e.preventDefault(); el.blur(); }
        // Ctrl+B / I / U: el formato es de todo el texto del cuadro. El que pone el navegador por su
        // cuenta se veía mientras se escribía y se perdía al terminar (solo se guarda el texto).
        const k = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && { b: "tNegrita", i: "tCursiva", u: "tSubrayado" }[e.key.toLowerCase()];
        if (k) {
          e.preventDefault();
          const b = editando && doc().bloque(editando);
          if (b && !ed.soloLectura) {
            const on = !(k === "tNegrita" ? enNegrita(b) : b[k]);
            doc().cambiar(b.id, { [k]: on || (k === "tNegrita" ? false : null) });
            el.setAttribute("style", estiloTexto(doc().bloque(b.id), b.tipo === "forma" ? estiloFigura(b).relleno : null));
          }
        }
        e.stopPropagation();
      };
    }
    function editar(id) {
      if (ed.soloLectura) return;
      const b = doc().bloque(id);
      if (!b || !["texto", "forma"].includes(b.tipo) || b.bloqueado || (b.tipo === "forma" && esLinea(b.figura))) return;
      editando = id;
      barra.hidden = true;
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
      pintarBarra();
    }

    // ------------------------------------------------------------ crear
    const TAM = { texto: [420, 64], rect: [200, 110], elipse: [190, 120], rombo: [190, 130], nota: [180, 160], linea: [220, 24], "linea-flecha": [220, 24], flecha: [200, 100], "flecha-doble": [220, 100], estrella: [150, 145], corazon: [150, 135], burbuja: [220, 130] };
    function crear(tipo, extra, en) {
      const p = en || (acotado ? { x: ANCHO / 2, y: ALTO / 2 } : centroVista());
      const fig = extra && extra.figura;
      const tam = TAM[fig || tipo] || [170, 150];
      const id = NOM.DocCRDT.nuevoId();
      const zMax = Math.max(0, ...bloques().map((b) => b.z || 0));
      const campos = Object.assign({ tipo, pagina: ed.pagina, orden: Date.now() % 1e9 / 1e6, x: Math.round(p.x - tam[0] / 2), y: Math.round(p.y - tam[1] / 2), w: tam[0], h: tam[1], z: zMax + 1 }, extra || {});
      if (tipo === "texto") Object.assign(campos, { html: "", estilo: acotado ? "h2" : "p" });
      if (tipo === "forma" && !campos.color && !esLinea(fig)) campos.color = fig === "nota" ? "#FFF1B8" : "#CFE0FF";
      doc().cambiar(id, campos);
      sel = new Set([id]); ed.seleccionar(id);
      render();
      if (tipo === "texto" || (tipo === "forma" && !esLinea(fig))) editar(id);
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

    // ------------------------------------------------------------ acciones sobre la selección
    const seleccionados = () => [...sel].map(porId).filter(Boolean);
    const editables = () => seleccionados().filter((b) => !b.bloqueado);
    function cambiarSel(campos, opcC) {
      const bs = typeof campos === "function" ? editables() : editables();
      if (!bs.length || ed.soloLectura) return;
      doc().lote(() => bs.forEach((b) => { const c = typeof campos === "function" ? campos(b) : campos; if (c) doc().cambiar(b.id, c, opcC); }));
      render();
    }
    function eliminar() {
      if (ed.soloLectura) return;
      if (selConector) { doc().cambiar(selConector, { eliminado: true }); selConector = null; render(); return; }
      const bs = editables();
      if (!bs.length) { if (sel.size) aviso("Desbloquea la figura para eliminarla", { tipo: "info" }); return; }
      const ids = new Set(bs.map((b) => b.id));
      doc().lote(() => {
        ids.forEach((id) => doc().cambiar(id, { eliminado: true }));
        doc().deLaPagina(ed.pagina).filter((c) => c.tipo === "conector" && (ids.has(c.desde) || ids.has(c.hasta))).forEach((c) => doc().cambiar(c.id, { eliminado: true }));
      });
      sel = new Set(); ed.seleccionar(null);
      render(); ed.refrescarHerramientas();
    }
    function copiarBloques(bs) {
      const ids = new Set(bs.map((b) => b.id));
      const cs = doc().deLaPagina(ed.pagina).filter((c) => c.tipo === "conector" && ids.has(c.desde) && ids.has(c.hasta));
      return bs.concat(cs).map((b) => { const { sinPos, _pag, ...r } = b; return r; });
    }
    function pegarBloques(lista, desplazar) {
      if (!lista || !lista.length || ed.soloLectura) return;
      const nuevos = {}, grupos = {};
      lista.forEach((b) => (nuevos[b.id] = NOM.DocCRDT.nuevoId()));
      const zMax = Math.max(0, ...bloques().map((b) => b.z || 0));
      doc().lote(() => lista.forEach((b, i) => {
        const { id, ...c } = b;
        c.pagina = ed.pagina;
        if (c.tipo === "conector") { if (!nuevos[c.desde] || !nuevos[c.hasta]) return; c.desde = nuevos[c.desde]; c.hasta = nuevos[c.hasta]; }
        else { c.x = (c.x || 0) + desplazar; c.y = (c.y || 0) + desplazar; c.z = zMax + 1 + i; }
        if (c.grupo) c.grupo = grupos[c.grupo] || (grupos[c.grupo] = "g" + NOM.DocCRDT.nuevoId());
        delete c.bloqueado;
        doc().cambiar(nuevos[id], c);
      }));
      seleccionar(lista.filter((b) => b.tipo !== "conector").map((b) => nuevos[b.id]));
    }
    function duplicar() { const bs = seleccionados(); if (bs.length) pegarBloques(copiarBloques(bs), 24); }
    function copiar(cortar) {
      const bs = seleccionados();
      if (!bs.length) return;
      NOM._portaFiguras = copiarBloques(bs);
      try { navigator.clipboard && navigator.clipboard.writeText("nom-figuras:" + JSON.stringify(NOM._portaFiguras)); } catch (e) { /* sin permiso */ }
      if (cortar) eliminar();
    }
    async function pegar() {
      let l = NOM._portaFiguras;
      try {
        const t = navigator.clipboard && navigator.clipboard.readText ? await navigator.clipboard.readText() : "";
        if (t && t.startsWith("nom-figuras:")) l = JSON.parse(t.slice(12));
      } catch (e) { /* sin permiso: se usa lo copiado en esta pestaña */ }
      if (l) pegarBloques(l, 24);
    }
    function capaZ(modo) {
      const bs = editables();
      if (!bs.length) return;
      const zs = bloques().filter((b) => b.tipo !== "conector").map((x) => x.z || 0);
      const max = Math.max(...zs), min = Math.min(...zs);
      doc().lote(() => bs.forEach((b, i) => doc().cambiar(b.id, { z: modo === "frente" ? max + 1 + i : modo === "fondo" ? min - bs.length + i : (b.z || 0) + (modo === "adelante" ? 1.5 : -1.5) })));
      render();
    }
    function colorear(c) {
      const bs = editables().filter((b) => b.tipo === "forma");
      if (!bs.length) return aviso("Selecciona una figura para cambiar su color", { tipo: "info" });
      doc().lote(() => bs.forEach((b) => doc().cambiar(b.id, esLinea(b.figura) ? { borde: c } : { color: c, relleno: true })));
      render();
    }
    function agrupar() {
      const bs = editables();
      if (bs.length < 2) return;
      const g = "g" + NOM.DocCRDT.nuevoId();
      doc().lote(() => bs.forEach((b) => doc().cambiar(b.id, { grupo: g })));
      render();
      aviso("Agrupado: se mueven juntos. Ctrl+Mayús+G para desagrupar.", { ms: 2600 });
    }
    function desagrupar() {
      const bs = editables().filter((b) => b.grupo);
      if (!bs.length) return;
      doc().lote(() => bs.forEach((b) => doc().cambiar(b.id, { grupo: null })));
      render();
    }
    function alinear(modo) {
      const bs = editables();
      if (!bs.length) return;
      const ref = bs.length > 1 ? cajaDe(bs) : acotado ? { x: 0, y: 0, w: ANCHO, h: ALTO } : null;
      if (!ref) return aviso("Selecciona dos o más figuras para alinearlas entre sí", { tipo: "info" });
      doc().lote(() => bs.forEach((b) => {
        const c = {
          izq: { x: ref.x }, "centro-h": { x: Math.round(ref.x + ref.w / 2 - b.w / 2) }, der: { x: ref.x + ref.w - b.w },
          arriba: { y: ref.y }, "centro-v": { y: Math.round(ref.y + ref.h / 2 - b.h / 2) }, abajo: { y: ref.y + ref.h - b.h },
        }[modo];
        doc().cambiar(b.id, Object.assign({ x: b.x, y: b.y, w: b.w, h: b.h }, c));
      }));
      render();
    }
    function distribuir(eje) {
      const bs = editables();
      if (bs.length < 3) return aviso("Selecciona tres o más figuras para distribuirlas", { tipo: "info" });
      const X = eje === "h", ord = bs.slice().sort((a, b) => (X ? a.x - b.x : a.y - b.y));
      const total = ord.reduce((n, b) => n + (X ? b.w : b.h), 0);
      const ini = X ? ord[0].x : ord[0].y, fin = X ? ord[ord.length - 1].x + ord[ord.length - 1].w : ord[ord.length - 1].y + ord[ord.length - 1].h;
      const hueco = (fin - ini - total) / (ord.length - 1);
      let pos = ini;
      doc().lote(() => ord.forEach((b) => { doc().cambiar(b.id, X ? { x: Math.round(pos), y: b.y, w: b.w, h: b.h } : { y: Math.round(pos), x: b.x, w: b.w, h: b.h }); pos += (X ? b.w : b.h) + hueco; }));
      render();
    }
    function rotar(grados) { cambiarSel((b) => ({ rot: (((b.rot || 0) + grados) % 360 + 360) % 360 || null })); }
    function voltear(eje) { cambiarSel((b) => (eje === "h" ? { volteoH: !b.volteoH || null } : { volteoV: !b.volteoV || null })); }
    function bloquear() {
      const bs = seleccionados();
      if (!bs.length) return;
      const todos = bs.every((b) => b.bloqueado);
      doc().lote(() => bs.forEach((b) => doc().cambiar(b.id, { bloqueado: todos ? null : true })));
      render();
    }
    function seleccionarTodo() { seleccionar(bloques().filter((b) => b.tipo !== "conector").map((b) => b.id)); }

    // ------------------------------------------------------------ barra contextual (como la de Canva)
    function pintarBarra() {
      if (ed.soloLectura || !sel.size || gesto || editando) { barra.hidden = true; return; }
      const bs = seleccionados();
      if (!bs.length) { barra.hidden = true; return; }
      const formas = bs.filter((b) => b.tipo === "forma"), imgs = bs.filter((b) => b.tipo === "imagen"), textos = bs.filter((b) => b.tipo === "texto");
      const b0 = bs[0], bloq = bs.every((b) => b.bloqueado);
      const relleno = formas.length && !esLinea(formas[0].figura) ? (formas[0].relleno === false ? "" : formas[0].color || "#E7E5EE") : null;
      const conTexto = formas.some((b) => !esLinea(b.figura)) || textos.length;
      const btn = (a, i, t, extra) => `<button class="icono-btn" data-a="${a}" aria-label="${esc(t)}" data-micro="${esc(t)}" ${extra || ""}>${i}</button>`;
      barra.innerHTML = bloq
        ? btn("bloquear", ico("lock-open"), "Desbloquear") + btn("duplicar", ico("copy"), "Duplicar|Ctrl+D")
        : [
          relleno != null ? `<button class="lz-color" data-a="relleno" aria-label="Color de relleno" data-micro="Relleno|Color de la figura." style="--c:${relleno || "transparent"}"><span></span></button>` : "",
          formas.length && esLinea(formas[0].figura) ? `<button class="lz-color" data-a="borde-color" aria-label="Color de la línea" data-micro="Color de la línea" style="--c:${formas[0].borde || "#4A4854"}"><span></span></button>` : "",
          formas.length || imgs.length ? btn("borde", ico("square-dashed"), "Borde|Color, grosor y estilo del contorno.") : "",
          conTexto ? btn("texto", `<b class="lz-a" style="--c:${(formas[0] || textos[0] || {}).tColor || "#2B2A33"}">A</b>`, "Texto|Tamaño, color, negrita y alineación.") : "",
          btn("opacidad", ico("blend"), "Transparencia"),
          (formas.some((b) => ["rect", "burbuja"].includes(b.figura || "rect")) || imgs.length) ? btn("esquinas", ico("esquina"), "Redondear esquinas") : "",
          btn("sombra", ico("sombra"), "Sombra", `aria-pressed="${b0.sombra === true || (b0.sombra == null && b0.tipo === "forma" && !esLinea(b0.figura))}"`),
          '<span class="sep"></span>',
          btn("posicion", ico("al-centro-h"), "Posición|Alinear, distribuir y orden de capas."),
          btn("girar", ico("rotate-cw"), "Girar 90°"),
          btn("voltear", ico("flip-horizontal"), "Voltear"),
          bs.length > 1 && !bs.every((b) => b.grupo && b.grupo === b0.grupo) ? btn("agrupar", ico("group"), "Agrupar|Ctrl+G") : "",
          bs.some((b) => b.grupo) ? btn("desagrupar", ico("ungroup"), "Desagrupar|Ctrl+Mayús+G") : "",
          btn("bloquear", ico("lock"), "Bloquear|Evita moverlo por accidente."),
          btn("duplicar", ico("copy"), "Duplicar|Ctrl+D"),
          btn("eliminar", ico("trash-2"), "Eliminar|Supr"),
        ].join("");
      barra.hidden = false;
    }
    barra.addEventListener("pointerdown", (e) => e.stopPropagation());
    barra.addEventListener("click", (e) => {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      const bs = editables(), b0 = bs[0] || {};
      const grupo = { grupo: "barra-" + [...sel].join(",") };
      switch (b.dataset.a) {
        case "relleno": paletaColores(b, b0.color, (c) => cambiarSel(c ? { color: c, relleno: true } : { relleno: false }, grupo), { titulo: "Relleno", sinColor: "Sin relleno" }); break;
        case "borde-color": paletaColores(b, b0.borde, (c) => cambiarSel({ borde: c || "#4A4854" }, grupo), { titulo: "Color de la línea" }); break;
        case "borde": menuBorde(b, b0, grupo); break;
        case "texto": menuTexto(b, b0, grupo); break;
        case "opacidad": deslizador(b, "Transparencia", Math.round((b0.opacidad != null ? b0.opacidad : 1) * 100), 10, 100, 1, "%", (v) => cambiarSel({ opacidad: v >= 100 ? null : v / 100 }, grupo)); break;
        case "esquinas": deslizador(b, "Esquinas redondeadas", b0.radio != null ? b0.radio : (b0.tipo === "forma" ? 14 : 0), 0, 120, 1, " px", (v) => cambiarSel((x) => (x.tipo === "imagen" || ["rect", "burbuja"].includes(x.figura || "rect") ? { radio: v } : null), grupo)); break;
        case "sombra": { const on = b.getAttribute("aria-pressed") === "true"; cambiarSel({ sombra: !on }); break; }
        case "posicion": menuPosicion(b); break;
        case "girar": rotar(90); break;
        case "voltear": NOM.menu(b, [{ texto: "Voltear horizontal", icono: "flip-horizontal", fn: () => voltear("h") }, { texto: "Voltear vertical", icono: "flip-vertical", fn: () => voltear("v") }]); break;
        case "agrupar": agrupar(); break;
        case "desagrupar": desagrupar(); break;
        case "bloquear": bloquear(); break;
        case "duplicar": duplicar(); break;
        case "eliminar": eliminar(); break;
      }
    });
    function menuBorde(ancla, b0, grupo) {
      const p = panel(ancla, `<div class="lz-desl"><span>Grosor</span><input type="range" min="0" max="20" step="1" value="${+b0.bordeAncho || (b0.figura && esLinea(b0.figura) ? 3 : 0)}" data-g><output data-o></output></div>
        <div class="segmentado lleno lz-estilos" role="group" aria-label="Estilo">${[["solido", "Sólido"], ["guiones", "Guiones"], ["puntos", "Puntos"]].map(([v, t]) => `<button type="button" data-e="${v}" aria-pressed="${(b0.bordeEstilo || "solido") === v}">${t}</button>`).join("")}</div>
        <div class="lz-muestras">${COLORES.map((c) => `<button data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}</div>`, { titulo: "Borde" });
      const g = $("[data-g]", p), o = $("[data-o]", p);
      o.textContent = g.value + " px";
      g.addEventListener("input", () => { o.textContent = g.value + " px"; cambiarSel({ bordeAncho: +g.value || null }, grupo); });
      p.addEventListener("click", (e) => {
        const es = e.target.closest("[data-e]"), c = e.target.closest("[data-c]");
        if (es) { $$("[data-e]", p).forEach((x) => x.setAttribute("aria-pressed", x === es)); cambiarSel({ bordeEstilo: es.dataset.e === "solido" ? null : es.dataset.e, bordeAncho: +g.value || 2 }, grupo); if (!+g.value) { g.value = 2; o.textContent = "2 px"; } }
        if (c) { cambiarSel({ borde: c.dataset.c, bordeAncho: +g.value || 2 }, grupo); if (!+g.value) { g.value = 2; o.textContent = "2 px"; } }
      });
    }
    function menuTexto(ancla, b0, grupo) {
      const tam = b0.tTam || (b0.tipo === "texto" ? (b0.estilo === "h1" ? 44 : b0.estilo === "h2" ? 30 : 22) : 16);
      const p = panel(ancla, `<div class="lz-desl"><span>Tamaño</span><input type="range" min="8" max="120" step="1" value="${tam}" data-t><output data-o>${tam} px</output></div>
        <div class="fila lz-fila"><button class="icono-btn" data-n="tNegrita" aria-pressed="${enNegrita(b0)}" aria-label="Negrita">${ico("bold")}</button>
          <button class="icono-btn" data-n="tCursiva" aria-pressed="${!!b0.tCursiva}" aria-label="Cursiva">${ico("italic")}</button>
          <button class="icono-btn" data-n="tSubrayado" aria-pressed="${!!b0.tSubrayado}" aria-label="Subrayado">${ico("underline")}</button>
          ${["izq", "centro", "der"].map((a) => `<button class="icono-btn" data-al="${a}" aria-pressed="${(b0.tAlin || (b0.tipo === "texto" ? "izq" : "centro")) === a}" aria-label="Alinear">${ico({ izq: "align-left", centro: "align-center", der: "align-right" }[a])}</button>`).join("")}
          <select class="mini-select" data-f aria-label="Fuente"><option value="">Nunito</option>${Object.keys((NOM.textoRico && NOM.textoRico.FUENTES) || {}).filter((f) => f !== "Nunito").map((f) => `<option ${b0.tFuente === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></div>
        <div class="lz-muestras">${COLORES.map((c) => `<button data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}</div>`, { titulo: "Texto" });
      const t = $("[data-t]", p), o = $("[data-o]", p);
      t.addEventListener("input", () => { o.textContent = t.value + " px"; cambiarSel({ tTam: +t.value }, grupo); });
      $("[data-f]", p).addEventListener("change", (e) => cambiarSel({ tFuente: e.target.value || null }, grupo));
      p.addEventListener("click", (e) => {
        const n = e.target.closest("[data-n]"), al = e.target.closest("[data-al]"), c = e.target.closest("[data-c]");
        // Negrita apagada se guarda como false: las figuras van en negrita si no se elige nada.
        if (n) { const on = n.getAttribute("aria-pressed") !== "true", k = n.dataset.n; n.setAttribute("aria-pressed", on); cambiarSel({ [k]: on || (k === "tNegrita" ? false : null) }, grupo); }
        if (al) { $$("[data-al]", p).forEach((x) => x.setAttribute("aria-pressed", x === al)); cambiarSel({ tAlin: al.dataset.al }, grupo); }
        if (c) cambiarSel({ tColor: c.dataset.c }, grupo);
      });
    }
    function menuPosicion(b) {
      const varios = sel.size > 1;
      NOM.menu(b, [
        { titulo: varios ? "Alinear entre sí" : acotado ? "Alinear en la diapositiva" : "Orden" },
        ...(varios || acotado ? [
          { texto: "Izquierda", icono: "al-izq", fn: () => alinear("izq") }, { texto: "Centro horizontal", icono: "al-centro-h", fn: () => alinear("centro-h") }, { texto: "Derecha", icono: "al-der", fn: () => alinear("der") },
          { texto: "Arriba", icono: "al-arriba", fn: () => alinear("arriba") }, { texto: "Centro vertical", icono: "al-centro-v", fn: () => alinear("centro-v") }, { texto: "Abajo", icono: "al-abajo", fn: () => alinear("abajo") },
        ] : []),
        ...(sel.size > 2 ? [{ texto: "Distribuir horizontalmente", icono: "distribuir-h", fn: () => distribuir("h") }, { texto: "Distribuir verticalmente", icono: "distribuir-v", fn: () => distribuir("v") }] : []),
        "-",
        { texto: "Traer al frente", icono: "bring-to-front", atajo: "Ctrl+Mayús+]", fn: () => capaZ("frente") },
        { texto: "Traer adelante", icono: "arrow-up", atajo: "Ctrl+]", fn: () => capaZ("adelante") },
        { texto: "Enviar atrás", icono: "arrow-down", atajo: "Ctrl+[", fn: () => capaZ("atras") },
        { texto: "Enviar al fondo", icono: "send-to-back", atajo: "Ctrl+Mayús+[", fn: () => capaZ("fondo") },
      ]);
    }

    // ------------------------------------------------------------ guías inteligentes
    function imantar(caja, excluir) {
      const um = 7 / zoomActual();
      const xs = [], ys = [];
      bloques().forEach((b) => { if (b.tipo === "conector" || excluir.has(b.id)) return; xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h); });
      if (acotado) { xs.push(0, ANCHO / 2, ANCHO); ys.push(0, ALTO / 2, ALTO); }
      const buscar = (mios, objetivos) => {
        let mejor = null;
        mios.forEach((m) => objetivos.forEach((t) => { const d = t - m; if (Math.abs(d) <= um && (!mejor || Math.abs(d) < Math.abs(mejor.d))) mejor = { d, t }; }));
        return mejor;
      };
      const bx = buscar([caja.x, caja.x + caja.w / 2, caja.x + caja.w], xs), by = buscar([caja.y, caja.y + caja.h / 2, caja.y + caja.h], ys);
      return { dx: bx ? bx.d : 0, dy: by ? by.d : 0, gx: bx && bx.t, gy: by && by.t };
    }
    function pintarGuias(g) {
      if (!g || (g.gx == null && g.gy == null)) { guias.innerHTML = ""; return; }
      const L = acotado ? 0 : -20000, R = acotado ? ANCHO : 20000, T = acotado ? 0 : -20000, D = acotado ? ALTO : 20000;
      guias.innerHTML = (g.gx != null ? `<line x1="${g.gx}" y1="${T}" x2="${g.gx}" y2="${D}"/>` : "") + (g.gy != null ? `<line x1="${L}" y1="${g.gy}" x2="${R}" y2="${g.gy}"/>` : "");
    }

    // ------------------------------------------------------------ puntero
    const punteros = new Map();
    let gesto = null;
    superficie.addEventListener("pointerdown", (e) => {
      NOM.cerrarMenu();
      if (e.button === 2 || NOM.rueda.abierta()) return;
      if (barra.contains(e.target) || e.target.closest(".lz-multiple")) return;
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const blToque = e.target.closest(".bl");
      // Un dedo sostiene una figura y otro toca otra: se suman a la selección (selección múltiple).
      if (punteros.size === 2 && gesto && gesto.tipo === "mover" && !gesto.movido && blToque && !ed.soloLectura) {
        gesto = null;
        multiple = true;
        seleccionar([blToque.dataset.id], true);
        if (navigator.vibrate) navigator.vibrate(10);
        return;
      }
      if (punteros.size === 2 && !acotado) {   // pellizco para hacer zoom
        const [a, b] = [...punteros.values()];
        gesto = { tipo: "pellizco", d: Math.hypot(a.x - b.x, a.y - b.y), z: vista.z };
        return;
      }
      const p = aMundo(e);
      if (!acotado && (e.button === 1 || espacio)) {
        e.preventDefault();
        gesto = { tipo: "paneo", x0: e.clientX, y0: e.clientY, v0: { ...vista } };
        capa.classList.add("arrastrando");
        superficie.setPointerCapture(e.pointerId);
        return;
      }
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
        const b = porId(bl.dataset.id);
        gesto = { tipo: "tamano", id: b.id, t: tirador.dataset.t, p0: p, b0: { x: b.x, y: b.y, w: b.w, h: b.h, rot: b.rot || 0 }, b: { x: b.x, y: b.y, w: b.w, h: b.h }, prop: b.tipo === "imagen" };
        superficie.setPointerCapture(e.pointerId);
        return;
      }
      if (e.target.closest("[data-girar]") && bl && !ed.soloLectura) {
        e.preventDefault();
        const b = porId(bl.dataset.id);
        gesto = { tipo: "girar", id: b.id, c: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, rot: b.rot || 0 };
        superficie.setPointerCapture(e.pointerId);
        return;
      }
      if (conectorEl) { terminarEdicion(); sel = new Set(); selConector = conectorEl.dataset.conector; render(); return; }
      if (bl) {
        const id = bl.dataset.id;
        if (herramienta === "conector" && !ed.soloLectura) {
          if (!origenEnlace) { origenEnlace = id; aviso("Ahora toca la figura de destino", { ms: 1800 }); return; }
          if (origenEnlace !== id) unir(origenEnlace, id);
          origenEnlace = null; return;
        }
        if (e.shiftKey || e.ctrlKey || e.metaKey) { seleccionar([id], true); return; }
        // Selección múltiple con el dedo: tocar otra figura la suma; tocar una ya elegida la quita
        // (si no se arrastra: arrastrar mueve todas juntas).
        let quitar = null;
        if (multiple && e.pointerType !== "mouse") { if (sel.has(id)) quitar = id; else seleccionar([id], true); }
        else if (!sel.has(id)) seleccionar(id);
        if (ed.soloLectura) return;
        const bs = editables();
        if (!bs.length) return;
        gesto = { tipo: "mover", ids: bs.map((b) => b.id), p0: p, b0: Object.fromEntries(bs.map((b) => [b.id, { x: b.x, y: b.y, w: b.w, h: b.h }])), caja0: cajaDe(bs), movido: false, idClic: id, quitar };
        superficie.setPointerCapture(e.pointerId);
        return;
      }
      // Espacio vacío
      terminarEdicion();
      if (herramienta && herramienta !== "conector" && !ed.soloLectura) {
        // Sin esto, el mismo clic le pasaba el foco al lienzo: el cuadro recién creado dejaba de
        // editarse y lo que se escribía no llegaba a ningún lado.
        e.preventDefault();
        const h = herramienta;
        const id = h === "texto" ? crear("texto", null, p) : crear("forma", { figura: h }, p);
        if (editando === id) setTimeout(() => { if (editando !== id && doc().vivo(id)) editar(id); }, 0);
        opc.alUsarHerramienta && opc.alUsarHerramienta();
        return;
      }
      if (!acotado && e.pointerType !== "mouse") {
        gesto = { tipo: "paneo", x0: e.clientX, y0: e.clientY, v0: { ...vista }, limpiar: true };
        capa.classList.add("arrastrando");
        superficie.setPointerCapture(e.pointerId);
        return;
      }
      // Recuadro de selección (como en Canva y Figma).
      const r = capa.getBoundingClientRect();
      gesto = { tipo: "marco", p0: p, s0: { x: e.clientX - r.left, y: e.clientY - r.top }, sumar: e.shiftKey, previa: new Set(sel) };
      if (!e.shiftKey && (sel.size || selConector)) { sel = new Set(); selConector = null; ed.seleccionar(null); render(); ed.refrescarHerramientas(); }
      superficie.setPointerCapture(e.pointerId);
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
        if (Math.abs(e.clientX - gesto.x0) + Math.abs(e.clientY - gesto.y0) > 4) gesto.movido = true;
        aplicarVista(); return;
      }
      const p = aMundo(e);
      const dx = p.x - (gesto.p0 ? gesto.p0.x : 0), dy = p.y - (gesto.p0 ? gesto.p0.y : 0);
      if (gesto.tipo === "mover") {
        if (!gesto.movido && Math.abs(dx) + Math.abs(dy) < 3 / zoomActual()) return;
        if (!gesto.movido) { gesto.movido = true; barra.hidden = true; }
        let mx = dx, my = dy;
        const g = e.altKey ? null : imantar({ x: gesto.caja0.x + dx, y: gesto.caja0.y + dy, w: gesto.caja0.w, h: gesto.caja0.h }, new Set(gesto.ids));
        if (g) { mx += g.dx; my += g.dy; }
        pintarGuias(g);
        gesto.b = {};
        gesto.ids.forEach((id) => { const b0 = gesto.b0[id]; gesto.b[id] = { x: Math.round(b0.x + mx), y: Math.round(b0.y + my), w: b0.w, h: b0.h }; moverVisual(id, gesto.b[id]); });
        conectoresVisuales(gesto.b);
        $$(".lz-caja", mundo).forEach((x) => x.remove());
      } else if (gesto.tipo === "tamano") {
        // En el marco girado de la figura: la esquina opuesta queda fija en su lugar.
        const b0 = gesto.b0, t = gesto.t, c0 = { x: b0.x + b0.w / 2, y: b0.y + b0.h / 2 };
        const loc = girar(p.x - c0.x, p.y - c0.y, -b0.rot);
        const ax = t.includes("e") ? -b0.w / 2 : t.includes("w") ? b0.w / 2 : null;
        const ay = t.includes("s") ? -b0.h / 2 : t.includes("n") ? b0.h / 2 : null;
        let w = ax != null ? Math.max(16, Math.abs(loc.x - ax)) : b0.w;
        let h = ay != null ? Math.max(12, Math.abs(loc.y - ay)) : b0.h;
        if ((gesto.prop || e.shiftKey) && ax != null && ay != null) { const k = Math.max(w / b0.w, h / b0.h); w = b0.w * k; h = b0.h * k; }
        const cxL = ax != null ? ax + Math.sign(loc.x - ax || 1) * w / 2 : 0, cyL = ay != null ? ay + Math.sign(loc.y - ay || 1) * h / 2 : 0;
        const cw = girar(cxL, cyL, b0.rot);
        const nb = { x: Math.round(c0.x + cw.x - w / 2), y: Math.round(c0.y + cw.y - h / 2), w: Math.round(w), h: Math.round(h) };
        gesto.b = nb;
        moverVisual(gesto.id, nb);
        conectoresVisuales({ [gesto.id]: nb });
        barra.hidden = true;
      } else if (gesto.tipo === "girar") {
        let a = (Math.atan2(p.y - gesto.c.y, p.x - gesto.c.x) * 180) / Math.PI + 90;
        a = ((a % 360) + 360) % 360;
        if (e.shiftKey) a = Math.round(a / 15) * 15;
        else for (const k of [0, 90, 180, 270, 360]) if (Math.abs(a - k) < 4) a = k % 360;
        gesto.rot = Math.round(a) % 360;
        moverVisual(gesto.id, Object.assign({}, porId(gesto.id), { rot: gesto.rot }));
        const el = mundo.querySelector(`.bl[data-id="${gesto.id}"] [data-girar]`);
        if (el) el.dataset.grados = gesto.rot + "°";
        barra.hidden = true;
      } else if (gesto.tipo === "marco") {
        const r = capa.getBoundingClientRect(), s = { x: e.clientX - r.left, y: e.clientY - r.top };
        Object.assign(marco.style, { left: Math.min(s.x, gesto.s0.x) + "px", top: Math.min(s.y, gesto.s0.y) + "px", width: Math.abs(s.x - gesto.s0.x) + "px", height: Math.abs(s.y - gesto.s0.y) + "px" });
        marco.hidden = false;
        const x1 = Math.min(p.x, gesto.p0.x), x2 = Math.max(p.x, gesto.p0.x), y1 = Math.min(p.y, gesto.p0.y), y2 = Math.max(p.y, gesto.p0.y);
        const dentro = bloques().filter((b) => b.tipo !== "conector" && b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1).map((b) => b.id);
        gesto.dentro = dentro;
        $$(".bl", mundo).forEach((el) => el.classList.toggle("previa", dentro.includes(el.dataset.id)));
      } else if (gesto.tipo === "enlace") {
        const o = porId(gesto.desde);
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
      pintarGuias(null);
      if (g.tipo === "mover" && !g.movido && g.quitar && e.type === "pointerup") { seleccionar([g.quitar], true); return; }
      if (g.tipo === "mover" && g.movido) doc().lote(() => g.ids.forEach((id) => doc().cambiar(id, g.b[id])));
      else if (g.tipo === "mover" && !g.movido && e.type === "pointerup" && doc().valor(g.idClic, "tipo") !== "imagen" && Date.now() - (finGesto.ultimo || 0) < 350 && finGesto.id === g.idClic) editar(g.idClic);
      else if (g.tipo === "tamano" && g.b) doc().cambiar(g.id, g.b);
      else if (g.tipo === "girar") doc().cambiar(g.id, { rot: g.rot || null });
      else if (g.tipo === "paneo" && g.limpiar && !g.movido && (sel.size || selConector)) { sel = new Set(); selConector = null; ed.seleccionar(null); render(); }
      else if (g.tipo === "marco") {
        marco.hidden = true;
        $$(".bl.previa", mundo).forEach((el) => el.classList.remove("previa"));
        if (g.dentro && g.dentro.length) seleccionar(g.dentro, g.sumar);
      } else if (g.tipo === "enlace") {
        const t = $("[data-tmp]", svg); if (t) t.remove();
        const destino = document.elementFromPoint(e.clientX, e.clientY);
        const bl = destino && destino.closest(".bl");
        if (bl && bl.dataset.id !== g.desde) unir(g.desde, bl.dataset.id);
        origenEnlace = null;
      }
      if (g.tipo === "mover") { finGesto.ultimo = Date.now(); finGesto.id = g.idClic; }
      render();
    }
    superficie.addEventListener("pointerup", finGesto);
    superficie.addEventListener("pointercancel", finGesto);
    superficie.addEventListener("dblclick", (e) => { const bl = e.target.closest(".bl"); if (bl) editar(bl.dataset.id); });
    if (!acotado) {
      superficie.addEventListener("wheel", (e) => {
        e.preventDefault();
        const r = capa.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey) zoomEn(Math.exp(-e.deltaY * 0.0022), { x: e.clientX - r.left, y: e.clientY - r.top });
        else { vista.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX; vista.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY; aplicarVista(); }
      }, { passive: false });
    }

    function unir(a, b) {
      const ya = doc().deLaPagina(ed.pagina).some((c) => c.tipo === "conector" && ((c.desde === a && c.hasta === b) || (c.desde === b && c.hasta === a)));
      if (ya) return aviso("Esas figuras ya están unidas", { tipo: "info" });
      doc().cambiar(NOM.DocCRDT.nuevoId(), { tipo: "conector", desde: a, hasta: b, pagina: ed.pagina, orden: 0 });
    }

    // ------------------------------------------------------------ ruedita
    // Sale al mantener presionada una figura o el fondo (dedo o clic) o con clic derecho, centrada
    // en el dedo o el cursor. Mismo orden que en los demás editores: negrita, cursiva, subrayado,
    // color, eliminar, duplicar, orden, más.
    const NOMBRE = { forma: "Figura", texto: "Texto", imagen: "Imagen", tabla: "Tabla" };
    function accionesSeleccion() {
      const bs = seleccionados(), b0 = bs[0] || {};
      const bloq = bs.length > 0 && bs.every((b) => b.bloqueado);
      const conTexto = editables().filter((b) => b.tipo === "texto" || (b.tipo === "forma" && !esLinea(b.figura)));
      const formas = editables().filter((b) => b.tipo === "forma");
      const t0 = conTexto[0] || {};
      const grupo = { grupo: "rueda-" + [...sel].join(",") };
      const alternarTexto = (k) => () => {
        const on = !(k === "tNegrita" ? enNegrita(t0) : t0[k]);
        doc().lote(() => conTexto.forEach((b) => doc().cambiar(b.id, { [k]: on || (k === "tNegrita" ? false : null) }, grupo)));
        render();
      };
      const tonos = COLORES.filter((_, i) => [0, 8, 12, 15, 19, 23, 27].includes(i));
      const colorTexto = tonos.map((c) => ({ texto: c, corto: " ", color: c, mantener: true, fn: () => cambiarSel((b) => (conTexto.includes(b) ? { tColor: c } : null), grupo) }));
      const colorSub = formas.length
        ? tonos.map((c) => ({ texto: c, corto: " ", color: c, mantener: true, fn: () => colorear(c) })).concat(conTexto.length ? [{ texto: "Color del texto", corto: "Texto", icono: "baseline", sub: colorTexto }] : [])
        : colorTexto;
      const varios = sel.size > 1;
      const alinearSub = [
        { texto: "Izquierda", icono: "al-izq", fn: () => alinear("izq") }, { texto: "Centro horizontal", corto: "Centro H", icono: "al-centro-h", fn: () => alinear("centro-h") },
        { texto: "Derecha", icono: "al-der", fn: () => alinear("der") }, { texto: "Arriba", icono: "al-arriba", fn: () => alinear("arriba") },
        { texto: "Centro vertical", corto: "Centro V", icono: "al-centro-v", fn: () => alinear("centro-v") }, { texto: "Abajo", icono: "al-abajo", fn: () => alinear("abajo") },
        ...(sel.size > 2 ? [{ texto: "Distribuir horizontal", corto: "Distribuir H", icono: "distribuir-h", fn: () => distribuir("h") }, { texto: "Distribuir vertical", corto: "Distribuir V", icono: "distribuir-v", fn: () => distribuir("v") }] : []),
      ];
      return [
        { texto: "Negrita", icono: "bold", off: !conTexto.length, marcado: enNegrita(t0), mantener: true, fn: alternarTexto("tNegrita") },
        { texto: "Cursiva", icono: "italic", off: !conTexto.length, marcado: !!t0.tCursiva, mantener: true, fn: alternarTexto("tCursiva") },
        { texto: "Subrayado", icono: "underline", off: !conTexto.length, marcado: !!t0.tSubrayado, mantener: true, fn: alternarTexto("tSubrayado") },
        { texto: "Color", icono: "palette", off: bloq || (!formas.length && !conTexto.length), sub: colorSub },
        { texto: "Eliminar", icono: "trash-2", off: bloq, fn: eliminar },
        { texto: "Duplicar", icono: "copy", fn: duplicar },
        { texto: "Orden", icono: "layers", off: bloq, sub: [
          { texto: "Traer al frente", corto: "Al frente", icono: "bring-to-front", mantener: true, fn: () => capaZ("frente") },
          { texto: "Traer adelante", corto: "Adelante", icono: "arrow-up", mantener: true, fn: () => capaZ("adelante") },
          { texto: "Enviar atrás", corto: "Atrás", icono: "arrow-down", mantener: true, fn: () => capaZ("atras") },
          { texto: "Enviar al fondo", corto: "Al fondo", icono: "send-to-back", mantener: true, fn: () => capaZ("fondo") },
          { texto: "Girar 90°", icono: "rotate-cw", mantener: true, fn: () => rotar(90) },
          { texto: "Voltear horizontal", corto: "Voltear H", icono: "flip-horizontal", mantener: true, fn: () => voltear("h") },
          { texto: "Voltear vertical", corto: "Voltear V", icono: "flip-vertical", mantener: true, fn: () => voltear("v") },
          (varios || acotado) ? { texto: "Alinear", icono: "al-centro-h", sub: alinearSub } : { texto: "Alinear", icono: "al-centro-h", off: true }] },
        { texto: "Más", icono: "more-horizontal", sub: [
          { texto: multiple ? "Terminar de elegir" : "Elegir varias", corto: multiple ? "Listo" : "Varias", icono: "group", fn: () => { multiple = !multiple; pintarMultiple(); } },
          varios && !bs.every((b) => b.grupo && b.grupo === b0.grupo) ? { texto: "Agrupar", icono: "group", fn: agrupar }
            : { texto: "Desagrupar", icono: "ungroup", off: !bs.some((b) => b.grupo), fn: desagrupar },
          { texto: bloq ? "Desbloquear" : "Bloquear", icono: bloq ? "lock-open" : "lock", fn: bloquear },
          { texto: "Copiar", icono: "clipboard-copy", fn: () => copiar(false) },
          { texto: "Cortar", icono: "scissors", off: bloq, fn: () => copiar(true) },
          { texto: "Pegar", icono: "clipboard-paste", off: !NOM._portaFiguras, fn: pegar },
          { texto: "Editar texto", icono: "type", off: !(unico() && conTexto.length === 1), fn: () => editar(unico()) },
          { texto: "Elegir todo", icono: "layout-grid", fn: seleccionarTodo }] },
      ];
    }
    // Selección múltiple con el dedo: un aviso fijo dice cómo seguir y cómo terminar.
    let avisoMultiple = null;
    function pintarMultiple() {
      if (multiple && !sel.size) multiple = false;
      if (!multiple) { if (avisoMultiple) { avisoMultiple.remove(); avisoMultiple = null; } return; }
      if (!avisoMultiple) {
        avisoMultiple = html(`<div class="pista lz-multiple" role="status"><span data-n></span><button class="btn chico primario" type="button">Listo</button></div>`);
        $("button", avisoMultiple).onclick = () => { multiple = false; pintarMultiple(); };
        capa.append(avisoMultiple);
      }
      $("[data-n]", avisoMultiple).textContent = `${sel.size} elegido${sel.size > 1 ? "s" : ""} · toca más para sumarlas`;
    }

    NOM.rueda.enlazar(superficie, (e) => {
      if (ed.soloLectura) return null;
      // La ruedita toma el gesto: lo que había empezado (mover, recuadro) se cancela.
      if (gesto) { const g = gesto; gesto = null; capa.classList.remove("arrastrando"); marco.hidden = true; pintarGuias(null); if (g.tipo === "mover") render(); }
      punteros.clear();
      const bl = e.target.closest && e.target.closest(".bl");
      const p = aMundo(e);
      if (bl) {
        if (!sel.has(bl.dataset.id)) seleccionar(bl.dataset.id, multiple);
        const bs = seleccionados(), l = accionesSeleccion();
        l.titulo = bs.length > 1 ? `${bs.length} elegidos` : NOMBRE[(bs[0] || {}).tipo] || "Elegido";
        return l;
      }
      const en = (fn) => () => fn(p);
      return [
        { texto: "Texto", icono: "type", fn: en((q) => crear("texto", null, q)) },
        { texto: "Rectángulo", icono: "square", fn: en((q) => crear("forma", { figura: "rect" }, q)) },
        { texto: "Elipse", icono: "circle", fn: en((q) => crear("forma", { figura: "elipse" }, q)) },
        { texto: "Nota", icono: "sticky-note", fn: en((q) => crear("forma", { figura: "nota" }, q)) },
        { texto: "Pegar", icono: "clipboard-paste", off: !NOM._portaFiguras, fn: pegar },
        { texto: "Imagen", icono: "image", fn: imagen },
        { texto: "Más figuras", corto: "Figuras", icono: "shapes", sub: [["rombo", "Rombo", "diamond"], ["estrella", "Estrella", "star"], ["flecha", "Flecha", "arrow-right"], ["burbuja", "Burbuja", "message-square"], ["linea-flecha", "Línea", "minus"], ["corazon", "Corazón", "heart"]].map(([f, t, i]) => ({ texto: t, icono: i, fn: en((q) => crear("forma", { figura: f }, q)) })) },
        acotado ? { texto: "Elegir todo", icono: "layout-grid", fn: seleccionarTodo } : { texto: "Ver todo", icono: "maximize-2", fn: ajustar },
      ];
    }, { izquierdo: true, tactil: true, titulo: "Lienzo", ignorar: (e) => !!(editando || (e.target.closest && (e.target.closest(".tirador, [data-girar], [data-enlazar], .lz-barra, .lz-multiple"))) || herramienta) });

    // ------------------------------------------------------------ teclado
    function teclas(e) {
      if (e.key === " " && !editando && !(e.target && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)))) { espacio = e.type === "keydown"; if (!acotado) capa.classList.toggle("mano", espacio); }
      if (e.type !== "keydown" || editando || ed.soloLectura) return;
      const t = e.target;
      if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
      if (!ed.vista.contains(t) && t !== document.body) return;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (e.key === "Delete" || e.key === "Backspace") { if (sel.size || selConector) { e.preventDefault(); eliminar(); } return; }
      if (e.key === "Escape") { herramienta = null; origenEnlace = null; multiple = false; opc.alUsarHerramienta && opc.alUsarHerramienta(); if (sel.size) { sel = new Set(); ed.seleccionar(null); render(); } return; }
      if (e.key === "Enter" && unico()) { e.preventDefault(); editar(unico()); return; }
      if (mod && k === "d") { e.preventDefault(); duplicar(); return; }
      if (mod && k === "a") { e.preventDefault(); seleccionarTodo(); return; }
      if (mod && k === "c") { if (sel.size) { e.preventDefault(); copiar(false); } return; }
      if (mod && k === "x") { if (sel.size) { e.preventDefault(); copiar(true); } return; }
      if (mod && k === "v") { e.preventDefault(); pegar(); return; }
      if (mod && k === "g") { e.preventDefault(); if (e.shiftKey) desagrupar(); else agrupar(); return; }
      if (mod && k === "l" && e.shiftKey) { e.preventDefault(); bloquear(); return; }
      if (mod && (e.key === "]" || e.key === "}")) { e.preventDefault(); capaZ(e.shiftKey ? "frente" : "adelante"); return; }
      if (mod && (e.key === "[" || e.key === "{")) { e.preventDefault(); capaZ(e.shiftKey ? "fondo" : "atras"); return; }
      if (e.altKey && e.shiftKey && k === "h") { e.preventDefault(); voltear("h"); return; }
      if (e.altKey && e.shiftKey && k === "v") { e.preventDefault(); voltear("v"); return; }
      const fl = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
      if (fl && sel.size) {
        e.preventDefault();
        const kk = e.shiftKey ? 10 : 1;
        doc().lote(() => editables().forEach((b) => doc().cambiar(b.id, { x: b.x + fl[0] * kk, y: b.y + fl[1] * kk, w: b.w, h: b.h }, { grupo: "flechas-" + [...sel].join() })));
        render();
      }
    }
    document.addEventListener("keydown", teclas);
    document.addEventListener("keyup", teclas);
    const ro = new ResizeObserver(() => aplicarVista());
    ro.observe(superficie);

    aplicarVista();
    render();
    if (!acotado) requestAnimationFrame(ajustar);

    return {
      render, crear, imagen, eliminar, duplicar, capaZ: (arriba) => capaZ(arriba === true ? "frente" : arriba === false ? "fondo" : arriba), colorear, ajustar, alinear, distribuir, agrupar, desagrupar, bloquear, rotar, voltear,
      seleccion: () => unico() || [...sel][0] || null,
      cuantos: () => sel.size,
      fijarHerramienta(h) { herramienta = h; origenEnlace = null; capa.classList.toggle("herramienta", !!h); },
      herramienta: () => herramienta,
      cambios(lista) {
        if (gesto && lista.some((c) => (gesto.ids || [gesto.id]).includes(c.bloque))) return;
        if (editando && lista.length === 1 && lista[0].bloque === editando && lista[0].local) return;
        render();
      },
      destruir() { document.removeEventListener("keydown", teclas); document.removeEventListener("keyup", teclas); ro.disconnect(); terminarEdicion(); $$(".lz-panel").forEach((x) => x.remove()); },
    };
  }

  function menuColor(lienzo, b) {
    paletaColores(b, null, (c) => c && lienzo.colorear(c), { titulo: "Color de la figura" });
  }
  /** Galería de figuras (como "Elementos" en Canva): vista previa real de cada una. */
  function menuFiguras(lienzo, b, alElegir) {
    const p = panel(b, `<div class="lz-figuras">${FIGURAS.map(([id, t]) => `<button data-f="${id}" aria-label="${esc(t)}" title="${esc(t)}"><svg viewBox="-3 -3 46 36" aria-hidden="true"><path d="${ruta(id, 40, 30, 7)}" style="fill:${esLinea(id) ? "none" : "var(--m-diag-tenue)"};stroke:var(--m-diag)" stroke-width="2" stroke-linejoin="round"/>${id === "linea-flecha" ? '<path d="M32,9 L40,15 L32,21" style="fill:none;stroke:var(--m-diag)" stroke-width="2"/>' : ""}</svg></button>`).join("")}</div>`, { titulo: "Figuras" });
    p.addEventListener("click", (e) => { const x = e.target.closest("[data-f]"); if (!x) return; p.cerrar(); (alElegir || ((f) => lienzo.crear("forma", { figura: f })))(x.dataset.f); });
  }
  function menuAlinear(lienzo, b) {
    const varios = lienzo.cuantos() > 1;
    NOM.menu(b, [{ titulo: "Alinear" },
      { texto: "Izquierda", icono: "al-izq", fn: () => lienzo.alinear("izq") }, { texto: "Centro horizontal", icono: "al-centro-h", fn: () => lienzo.alinear("centro-h") }, { texto: "Derecha", icono: "al-der", fn: () => lienzo.alinear("der") },
      { texto: "Arriba", icono: "al-arriba", fn: () => lienzo.alinear("arriba") }, { texto: "Centro vertical", icono: "al-centro-v", fn: () => lienzo.alinear("centro-v") }, { texto: "Abajo", icono: "al-abajo", fn: () => lienzo.alinear("abajo") },
      ...(varios ? ["-", { texto: "Distribuir horizontalmente", icono: "distribuir-h", fn: () => lienzo.distribuir("h") }, { texto: "Distribuir verticalmente", icono: "distribuir-v", fn: () => lienzo.distribuir("v") }] : [])]);
  }

  // ================================================================== Presentación
  NOM.modos.PRESENTACION = {
    montar(ed) {
      const doc = () => ed.doc;
      const raiz = html(`<div class="pres"><nav class="miniaturas" data-minis aria-label="Diapositivas"></nav><div data-escena style="position:relative;min-height:0;display:grid"></div></div>`);
      ed.lienzo.append(raiz);
      ed.lienzo.style.overflow = "hidden";
      // Las miniaturas se repintan como mucho cada 150 ms (al arrastrar no se repintan en cada cuadro).
      let pintarMinis = () => {};
      const lienzo = crearLienzo(ed, $("[data-escena]", raiz), { acotado: true, alPintar: () => pintarMinis() });
      this._lienzo = lienzo;

      pintarMinis = NOM.throttle(() => {
        const minis = $("[data-minis]", raiz);
        const pags = doc().paginas();
        minis.innerHTML = pags.map((p, i) => {
          const bs = posiciones(doc().deLaPagina(p).filter((b) => b.tipo !== "conector"), true).sort((a, b) => (a.z || 0) - (b.z || 0));
          return `<button class="mini" data-p="${esc(p)}" aria-current="${p === ed.pagina}" aria-label="Diapositiva ${i + 1}"><span class="num">${i + 1}</span>
            <div class="mini-cont">${bs.map((b) => `<div class="bl${clasesBloque(b)}" style="${estiloBloque(b)}overflow:hidden">${contenido(b)}</div>`).join("")}</div></button>`;
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
      }, 150);
      // El lienzo ya se pintó antes de que existiera esta función: sin esto la tira de miniaturas
      // quedaba vacía hasta el primer cambio.
      pintarMinis();
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
        { id: "figura", icono: "shapes", micro: "Figuras|Más de 20: flechas, estrellas, globos de diálogo…", fn: (e, b) => menuFiguras(lienzo, b) },
        { id: "imagen", icono: "image", micro: "Imagen|Desde tu equipo.", fn: () => lienzo.imagen(), mantenerFoco: false },
        "|",
        { id: "color", icono: "palette", micro: "Color|Cambia el color de las figuras seleccionadas.", fn: (e, b) => menuColor(lienzo, b), off: () => !lienzo.seleccion() },
        { id: "alinear", icono: "al-centro-h", micro: "Alinear|En la diapositiva o entre las figuras elegidas.", fn: (e, b) => menuAlinear(lienzo, b), off: () => !lienzo.seleccion() },
        { id: "animacion", icono: "sparkles", micro: "Animación|Cómo aparece el bloque al presentar.", off: () => !lienzo.seleccion(), fn: (e, b) => {
          const id = lienzo.seleccion(); const actual = doc().valor(id, "animacion") || "";
          NOM.menu(b, [{ titulo: "Al presentar, aparece…" },
            ...[["", "Sin animación"], ["aparecer", "Desvanecido"], ["deslizar", "Deslizando hacia arriba"], ["zoom", "Con zoom"]].map(([v, t]) => ({ texto: t, marcado: v === actual, fn: () => doc().cambiar(id, { animacion: v }) }))]);
        } },
        { id: "frente", icono: "bring-to-front", micro: "Traer al frente||Ctrl+Mayús+]", fn: () => lienzo.capaZ("frente"), off: () => !lienzo.seleccion() },
        { id: "atras", icono: "send-to-back", micro: "Enviar al fondo||Ctrl+Mayús+[", fn: () => lienzo.capaZ("fondo"), off: () => !lienzo.seleccion() },
        { id: "borrar", icono: "trash-2", micro: "Eliminar|Quita los bloques seleccionados.|Supr", fn: () => lienzo.eliminar(), off: () => !lienzo.seleccion() },
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
      d.innerHTML = bs.map((b) => `<div class="bl${clasesBloque(b)} ${b.animacion && !revelarTodo ? "anim-oculto" : ""}" data-id="${esc(b.id)}" style="${estiloBloque(b)}">${contenido(b)}</div>`).join("");
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
        { id: "puntero", icono: "mouse-pointer-2", micro: "Seleccionar y mover|Arrastra figuras; arrastra el fondo para elegir varias. Espacio + arrastrar para moverte.|Esc", fn: () => { lienzo.fijarHerramienta(null); ed.refrescarHerramientas(); }, activo: () => !lienzo.herramienta() },
        { id: "rect", icono: "square", micro: "Rectángulo|Haz clic en el lienzo para colocarlo. Para procesos.", fn: h("rect"), activo: activo("rect") },
        { id: "elipse", icono: "circle", micro: "Elipse|Para inicio y fin de un flujo.", fn: h("elipse"), activo: activo("elipse") },
        { id: "rombo", icono: "diamond", micro: "Rombo|Para decisiones (sí / no).", fn: h("rombo"), activo: activo("rombo") },
        { id: "nota", icono: "sticky-note", micro: "Nota adhesiva|Ideas sueltas, como en un pizarrón.", fn: h("nota"), activo: activo("nota") },
        { id: "mas-figuras", icono: "shapes", micro: "Más figuras|Estrella, flecha, nube, cilindro, documento, línea…", fn: (e, b) => menuFiguras(lienzo, b, (f) => { lienzo.fijarHerramienta(f); ed.refrescarHerramientas(); aviso("Haz clic en el lienzo para colocarla", { ms: 1800 }); }), activo: () => !!lienzo.herramienta() && !["rect", "elipse", "rombo", "nota", "texto", "conector"].includes(lienzo.herramienta()) },
        { id: "texto", icono: "type", micro: "Texto libre", fn: h("texto"), activo: activo("texto") },
        { id: "conector", icono: "spline", micro: "Conector|Toca una figura y luego otra para unirlas con una flecha.", fn: h("conector"), activo: activo("conector") },
        { id: "imagen", icono: "image", micro: "Imagen", fn: () => lienzo.imagen(), mantenerFoco: false },
        "|",
        { id: "color", icono: "palette", micro: "Color|Cambia el color de las figuras seleccionadas.", fn: (e, b) => menuColor(lienzo, b), off: () => !lienzo.seleccion() },
        { id: "alinear", icono: "al-centro-h", micro: "Alinear y distribuir|Elige dos o más figuras.", fn: (e, b) => menuAlinear(lienzo, b), off: () => lienzo.cuantos() < 2 },
        { id: "frente", icono: "bring-to-front", micro: "Traer al frente||Ctrl+Mayús+]", fn: () => lienzo.capaZ("frente"), off: () => !lienzo.seleccion() },
        { id: "duplicar", icono: "copy", micro: "Duplicar||Ctrl+D", fn: () => lienzo.duplicar(), off: () => !lienzo.seleccion() },
        { id: "borrar", icono: "trash-2", micro: "Eliminar|Borra las figuras y sus flechas.|Supr", fn: () => lienzo.eliminar(), off: () => !lienzo.seleccion() },
      ];
      if (!ed.doc.deLaPagina(ed.pagina).length && !ed.soloLectura) {
        const p = html(`<div class="pista">${ico("info", "ico-s")} Elige una figura arriba y haz clic en el lienzo. Clic derecho (o mantener el dedo) en el lienzo vacío para más</div>`);
        ed.lienzo.append(p);
        setTimeout(() => p.remove(), 6500);
      }
      this.cambios = (l) => lienzo.cambios(l);
      this.desmontar = () => { lienzo.destruir(); ed.lienzo.style.overflow = ""; };
    },
    herramientas() { return this._herr || []; },
  };
})();
