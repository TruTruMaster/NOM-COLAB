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
  /** 8.3 Tamaño de la diapositiva del documento (16:9, 4:3, carta, cartel…). */
  const tamDoc = (d) => (NOM.diapo && d ? NOM.diapo.tam(d) : { w: ANCHO, h: ALTO });
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
  /** Un color que viene del documento solo se usa si de verdad es un color (nada de texto suelto en el estilo). */
  const colorCss = (c) => /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(String(c || ""));

  // ------------------------------------------------------------ figuras
  const FIGURAS = [
    ["rect", "Rectángulo"], ["elipse", "Elipse"], ["rombo", "Rombo"], ["triangulo", "Triángulo"], ["triangulo-r", "Triángulo rectángulo"],
    ["pentagono", "Pentágono"], ["hexagono", "Hexágono"], ["octagono", "Octágono"], ["estrella", "Estrella"], ["corazon", "Corazón"],
    ["nube", "Nube"], ["burbuja", "Globo de diálogo"], ["flecha", "Flecha"], ["flecha-doble", "Flecha doble"], ["chevron", "Chevrón"],
    ["cruz", "Cruz"], ["paralelogramo", "Paralelogramo (entrada/salida)"], ["trapecio", "Trapecio"], ["cilindro", "Cilindro (base de datos)"],
    ["documento", "Documento"], ["nota", "Nota adhesiva"], ["linea", "Línea"], ["linea-flecha", "Línea con flecha"],
  ];
  // 8.4 Figuras de UML y de entidad-relación: cada una nace con sus colores, su tamaño y un texto de
  // ejemplo. La clase y la entidad acomodan su texto en compartimentos (nombre, atributos, métodos).
  const FIGURAS_UML = [["clase", "Clase"], ["actor", "Actor"], ["caso-uso", "Caso de uso"], ["paquete", "Paquete"], ["componente", "Componente"], ["nodo", "Nodo"], ["inicio", "Inicio"], ["final", "Fin"], ["barra", "Bifurcación"]];
  const FIGURAS_ER = [["entidad", "Entidad"], ["entidad-debil", "Entidad débil"], ["relacion", "Relación"], ["relacion-debil", "Relación débil"], ["atributo", "Atributo"], ["atributo-clave", "Atributo clave"], ["atributo-multi", "Multivaluado"], ["atributo-derivado", "Derivado"]];
  const FIGURAS_RED = [["server", "Servidor"], ["monitor", "Computadora"], ["laptop", "Laptop"], ["smartphone", "Celular"], ["router", "Router"], ["wifi", "Wifi"], ["database", "Base de datos"], ["cloud", "Nube"], ["printer", "Impresora"], ["globe", "Internet"], ["lock", "Firewall"], ["hard-drive", "Disco"]];
  const UML = { color: "#FFFFFF", borde: "#2B2A33", bordeAncho: 2, sombra: false };
  const PRESETS = {
    clase: Object.assign({ figura: "clase", texto: "Alumno\n- nombre: texto\n- grupo: texto\n+ inscribirse()", w: 210, h: 140 }, UML),
    actor: Object.assign({ figura: "actor", texto: "Usuario", w: 80, h: 130 }, UML),
    "caso-uso": Object.assign({ figura: "elipse", texto: "Iniciar sesión", w: 190, h: 80 }, UML),
    paquete: Object.assign({ figura: "paquete", texto: "paquete", w: 200, h: 130 }, UML, { color: "#FFF8E1" }),
    componente: Object.assign({ figura: "componente", texto: "Componente", w: 190, h: 90 }, UML),
    nodo: Object.assign({ figura: "nodo", texto: "Servidor", w: 190, h: 120 }, UML, { color: "#E7E5EE" }),
    inicio: { figura: "elipse", color: "#2B2A33", sombra: false, texto: "", w: 34, h: 34 },
    final: Object.assign({ figura: "final", texto: "", w: 40, h: 40 }, UML),
    barra: { figura: "rect", radio: 2, color: "#2B2A33", sombra: false, texto: "", w: 180, h: 10 },
    entidad: Object.assign({ figura: "entidad", texto: "Alumno\nPK matrícula\nnombre\ngrupo", w: 180, h: 130 }, UML),
    "entidad-debil": Object.assign({ figura: "entidad-debil", texto: "Calificación", w: 180, h: 80 }, UML),
    relacion: Object.assign({ figura: "rombo", texto: "tiene", w: 160, h: 90 }, UML),
    "relacion-debil": Object.assign({ figura: "relacion-debil", texto: "obtiene", w: 170, h: 96 }, UML),
    atributo: Object.assign({ figura: "elipse", texto: "nombre", w: 140, h: 64 }, UML),
    "atributo-clave": Object.assign({ figura: "elipse", texto: "matrícula", tSubrayado: true, w: 140, h: 64 }, UML),
    "atributo-multi": Object.assign({ figura: "atributo-multi", texto: "teléfonos", w: 150, h: 68 }, UML),
    "atributo-derivado": Object.assign({ figura: "elipse", texto: "edad", bordeEstilo: "guiones", w: 140, h: 64 }, UML),
  };
  /** Figuras que siempre llevan contorno (sin él no se entienden). */
  const CON_CONTORNO = new Set(["clase", "entidad", "entidad-debil", "relacion-debil", "atributo-multi", "actor", "paquete", "componente", "nodo", "final"]);
  /** Clase y entidad: el texto va en compartimentos. En la clase, las líneas con paréntesis son métodos. */
  const COMPARTIMENTOS = new Set(["clase", "entidad"]);
  function compartimentos(f, texto) {
    const ls = String(texto || "").split("\n").map((l) => l.replace(/\s+$/, ""));
    const nombre = ls.shift() || "";
    const resto = ls.filter((l) => l.trim() && !/^-{2,}$/.test(l.trim()));
    // En la entidad, "PK" o "#" al inicio marcan la clave: se subraya.
    const fila = (l) => (f === "entidad" && /^(PK\b|#)/i.test(l.trim()) ? `<u>${esc(l.trim().replace(/^(PK\s*:?\s*|#\s*)/i, ""))}</u>` : esc(l));
    if (f === "clase") {
      const met = resto.filter((l) => /\(.*\)/.test(l)), atr = resto.filter((l) => !/\(.*\)/.test(l));
      return `<div class="cm-nombre">${esc(nombre)}</div><div class="cm-sec">${atr.map(fila).join("<br>")}</div><div class="cm-sec">${met.map(fila).join("<br>")}</div>`;
    }
    return `<div class="cm-nombre">${esc(nombre)}</div><div class="cm-sec">${resto.map(fila).join("<br>")}</div>`;
  }
  const n2 = (v) => +v.toFixed(2);
  /** Trazo SVG de una figura en una caja de w × h (radio: esquinas del rectángulo). */
  function ruta(f, w, h, r) {
    const p = (pts) => "M" + pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join(" L") + " Z";
    switch (f) {
      case "elipse": case "atributo-multi": case "final": return `M0,${n2(h / 2)} A${n2(w / 2)},${n2(h / 2)} 0 1 0 ${n2(w)},${n2(h / 2)} A${n2(w / 2)},${n2(h / 2)} 0 1 0 0,${n2(h / 2)} Z`;
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
      case "clase": case "entidad": case "entidad-debil": return p([[0, 0], [w, 0], [w, h], [0, h]]);
      case "relacion-debil": return p([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
      case "actor": {
        // Monito de palitos: cabeza, cuerpo, brazos y piernas (el nombre va abajo).
        const cx = w / 2, r = Math.max(2, Math.min(w * 0.2, h * 0.1)), cy = r + 1, cad = h * 0.5, br = h * 0.3, pie = h * 0.72;
        return `M${n2(cx + r)},${n2(cy)} A${n2(r)},${n2(r)} 0 1 0 ${n2(cx - r)},${n2(cy)} A${n2(r)},${n2(r)} 0 1 0 ${n2(cx + r)},${n2(cy)} Z M${n2(cx)},${n2(cy + r)} L${n2(cx)},${n2(cad)} M${n2(w * 0.16)},${n2(br)} L${n2(w * 0.84)},${n2(br)} M${n2(cx)},${n2(cad)} L${n2(w * 0.2)},${n2(pie)} M${n2(cx)},${n2(cad)} L${n2(w * 0.8)},${n2(pie)}`;
      }
      case "paquete": { const t = Math.min(24, h * 0.22), a = Math.min(w * 0.45, 120); return `M0,0 H${n2(a)} V${n2(t)} H${n2(w)} V${n2(h)} H0 Z`; }
      case "componente": {
        const k = Math.min(12, w * 0.08), bh = Math.min(14, h * 0.18), r1 = h * 0.22, r2 = h * 0.58;
        return p([[k, 0], [w, 0], [w, h], [k, h]]) + " " + p([[0, r1], [k * 2, r1], [k * 2, r1 + bh], [0, r1 + bh]]) + " " + p([[0, r2], [k * 2, r2], [k * 2, r2 + bh], [0, r2 + bh]]);
      }
      case "nodo": { const d = Math.min(18, w * 0.12, h * 0.15); return p([[0, d], [w - d, d], [w - d, h], [0, h]]) + " " + p([[0, d], [d, 0], [w, 0], [w - d, d]]) + " " + p([[w - d, d], [w, 0], [w, h - d], [w - d, h]]); }
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
    const ancho = lineal ? (b.bordeAncho || 3) : +b.bordeAncho || (CON_CONTORNO.has(f) ? 2 : 0);
    const trazo = ancho ? b.borde || (lineal ? "#4A4854" : "#2B2A33") : null;
    return { f, lineal, relleno, ancho, trazo, radio: b.radio != null ? +b.radio : f === "rect" ? 14 : f === "burbuja" ? 14 : 0, estilo: b.bordeEstilo || "solido" };
  }
  /** 8.4 Piezas de una figura: la principal (relleno y contorno) y sus adornos (doble borde, pestaña, centro). */
  function partesFigura(e, w, h) {
    const r = [{ d: ruta(e.f, w, h, e.radio), relleno: e.relleno, trazo: e.trazo }];
    const contorno = (d) => r.push({ d, relleno: null, trazo: e.trazo });
    const elipse = (x, y, ew, eh) => `M${n2(x)},${n2(y + eh / 2)} A${n2(ew / 2)},${n2(eh / 2)} 0 1 0 ${n2(x + ew)},${n2(y + eh / 2)} A${n2(ew / 2)},${n2(eh / 2)} 0 1 0 ${n2(x)},${n2(y + eh / 2)} Z`;
    if (e.f === "entidad-debil") contorno(`M6,6 H${n2(w - 6)} V${n2(h - 6)} H6 Z`);
    if (e.f === "relacion-debil") contorno(`M${n2(w / 2)},8 L${n2(w - 14)},${n2(h / 2)} L${n2(w / 2)},${n2(h - 8)} L14,${n2(h / 2)} Z`);
    if (e.f === "atributo-multi") contorno(elipse(6, 6, w - 12, h - 12));
    if (e.f === "final") r.push({ d: elipse(w * 0.22, h * 0.22, w * 0.56, h * 0.56), relleno: e.trazo || "#2B2A33", trazo: null });
    if (e.f === "paquete") contorno(`M0,${n2(Math.min(24, h * 0.22))} H${n2(Math.min(w * 0.45, 120))}`);
    return r;
  }
  function svgFigura(b) {
    const w = Math.max(1, b.w || 1), h = Math.max(1, b.h || 1), e = estiloFigura(b);
    const dash = e.estilo === "guiones" ? ` stroke-dasharray="${e.ancho * 3} ${e.ancho * 2}"` : e.estilo === "puntos" ? ` stroke-dasharray="0 ${e.ancho * 2}"` : "";
    const tapa = e.estilo === "puntos" || e.f === "actor" ? "round" : "butt";
    const voltear = b.volteoH || b.volteoV ? ` transform="translate(${b.volteoH ? w : 0} ${b.volteoV ? h : 0}) scale(${b.volteoH ? -1 : 1} ${b.volteoV ? -1 : 1})"` : "";
    let extra = "";
    if (e.f === "nota") { const k = Math.min(w, h) * 0.16; extra = `<path d="M${n2(w - k)},${n2(h)} L${n2(w - k)},${n2(h - k)} L${n2(w)},${n2(h - k)} Z" fill="rgba(0,0,0,.12)"/>`; }
    if (e.f === "linea-flecha") { const k = 6 + e.ancho * 2.2; extra = `<path d="M${n2(w - k)},${n2(h / 2 - k * 0.6)} L${n2(w)},${n2(h / 2)} L${n2(w - k)},${n2(h / 2 + k * 0.6)} Z" fill="${esc(e.trazo)}"/>`; }
    const piezas = partesFigura(e, w, h).map((pz) => `<path d="${pz.d}" fill="${pz.relleno ? esc(pz.relleno) : "none"}" stroke="${pz.trazo ? esc(pz.trazo) : "none"}" stroke-width="${e.ancho}"${pz.trazo ? dash : ""} stroke-linejoin="round" stroke-linecap="${tapa}" vector-effect="non-scaling-stroke"/>`).join("");
    return `<svg class="forma-svg" viewBox="0 0 ${n2(w)} ${n2(h)}" preserveAspectRatio="none" aria-hidden="true"><g${voltear}>${piezas}${extra}</g></svg>`;
  }
  const ALIN = { izq: "left", centro: "center", der: "right" };
  /** ¿El texto se ve en negrita? Si no se eligió: las figuras y los títulos sí; un cuadro de texto normal, no. */
  const enNegrita = (b) => (b.tNegrita != null ? !!b.tNegrita : b.tipo === "forma" || b.estilo === "h1" || b.estilo === "h2");
  function estiloTexto(b, fondo) {
    const s = [];
    if (b.tColor && colorCss(b.tColor)) s.push(`color:${b.tColor}`); else if (fondo && oscuro(fondo)) s.push("color:#fff");
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
    if (b.figura === "elipse" || b.figura === "atributo-multi" || b.figura === "final") k = 1 / Math.sqrt((dx * dx) / ((b.w / 2) ** 2) + (dy * dy) / ((b.h / 2) ** 2));
    else if (b.figura === "rombo" || b.figura === "relacion-debil") k = 1 / (Math.abs(dx) / (b.w / 2) + Math.abs(dy) / (b.h / 2));
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
  // 8.4 Flechas: recta, en codo o curva; con puntas (de varios tipos), grosor, estilo y texto.
  const LADOS = {
    der: (b) => ({ x: b.x + b.w, y: b.y + b.h / 2, nx: 1, ny: 0 }), izq: (b) => ({ x: b.x, y: b.y + b.h / 2, nx: -1, ny: 0 }),
    abajo: (b) => ({ x: b.x + b.w / 2, y: b.y + b.h, nx: 0, ny: 1 }), arriba: (b) => ({ x: b.x + b.w / 2, y: b.y, nx: 0, ny: -1 }),
  };
  /** Los lados que se miran: de lado a lado si están más separadas a lo ancho que a lo alto. */
  function ladosEntre(a, b) {
    const dx = b.x + b.w / 2 - (a.x + a.w / 2), dy = b.y + b.h / 2 - (a.y + a.h / 2);
    const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    const horiz = gx > 0 && gy > 0 ? gx >= gy : gx > 0 ? true : gy > 0 ? false : Math.abs(dx) >= Math.abs(dy);
    return horiz ? (dx >= 0 ? ["der", "izq"] : ["izq", "der"]) : dy >= 0 ? ["abajo", "arriba"] : ["arriba", "abajo"];
  }
  const P2 = (q) => `${n2(q.x)},${n2(q.y)}`;
  /** Recorrido de una flecha entre dos figuras: el trazo, sus puntas y el punto medio (para el texto). */
  function rutaConector(a, b, c) {
    c = c || {};
    const forma = c.ruta || "recta", g = Math.max(1, +c.grosor || 2);
    const pIni = c.puntas === "inicio" || c.puntas === "ambas", pFin = !c.puntas || c.puntas === "fin" || c.puntas === "ambas";
    const L = 7 + g * 2.4, sepI = pIni ? 5 : 2, sepF = pFin ? 5 : 2;
    let pts;
    if (forma === "recta") {
      const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const p1 = borde(a, cb), p2 = borde(b, ca), d = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1, ux = (p2.x - p1.x) / d, uy = (p2.y - p1.y) / d;
      pts = [{ x: p1.x + ux * sepI, y: p1.y + uy * sepI }, { x: p2.x - ux * sepF, y: p2.y - uy * sepF }];
    } else {
      const [la, lb] = ladosEntre(a, b), s0 = LADOS[la](a), t0 = LADOS[lb](b);
      const p1 = { x: s0.x + s0.nx * sepI, y: s0.y + s0.ny * sepI }, p2 = { x: t0.x + t0.nx * sepF, y: t0.y + t0.ny * sepF };
      if (forma === "codo") {
        if (s0.nx) { const mx = (p1.x + p2.x) / 2; pts = [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2]; }
        else { const my = (p1.y + p2.y) / 2; pts = [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2]; }
      } else {
        const k = Math.max(30, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.42);
        pts = [p1, { x: p1.x + s0.nx * k, y: p1.y + s0.ny * k }, { x: p2.x + t0.nx * k, y: p2.y + t0.ny * k }, p2];
      }
    }
    const n = pts.length, q = pts.map((x) => ({ x: x.x, y: x.y })), puntas = [];
    const vecino = (i, paso) => { let j = i + paso; while (j > 0 && j < n - 1 && Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y) < 0.5) j += paso; return pts[Math.max(0, Math.min(n - 1, j))]; };
    const dir = (de, a2) => { const d = Math.hypot(a2.x - de.x, a2.y - de.y) || 1; return { x: (a2.x - de.x) / d, y: (a2.y - de.y) / d }; };
    const tipo = c.tipoPunta || "triangulo";
    // La línea se acorta para no salirse de la punta (las puntas abiertas no la tapan).
    const corte = tipo === "abierta" ? 0 : tipo === "rombo" || tipo === "rombo-hueco" ? 1.6 : tipo === "circulo" ? 0.9 : 0.75;
    const ponerPunta = (i, u) => {
      puntas.push(punta(pts[i], u, L, tipo));
      q[i] = { x: pts[i].x - u.x * L * corte, y: pts[i].y - u.y * L * corte };
      if (forma === "curva") { const j = i === 0 ? 1 : n - 2; q[j] = { x: pts[j].x - u.x * L * corte, y: pts[j].y - u.y * L * corte }; }
    };
    if (pFin) ponerPunta(n - 1, dir(vecino(n - 1, -1), pts[n - 1]));
    if (pIni) ponerPunta(0, dir(vecino(0, 1), pts[0]));
    const d = forma === "curva" ? `M${P2(q[0])} C${P2(q[1])} ${P2(q[2])} ${P2(q[3])}` : "M" + q.map(P2).join(" L");
    const medio = forma === "curva" ? { x: (pts[0].x + 3 * pts[1].x + 3 * pts[2].x + pts[3].x) / 8, y: (pts[0].y + 3 * pts[1].y + 3 * pts[2].y + pts[3].y) / 8 }
      : forma === "codo" ? { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 } : { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    return { d, puntas, medio, pts, ini: pts[0], fin: pts[n - 1], dirIni: dir(vecino(0, 1), pts[0]), dirFin: dir(vecino(n - 1, -1), pts[n - 1]) };
  }
  /** Punta en tip (u: hacia dónde apunta): triángulo, triángulo hueco (herencia), abierta, rombo o círculo. */
  function punta(tip, u, L, tipo) {
    const v = { x: -u.y, y: u.x }, an = L * 0.42;
    const en = (k, m) => `${n2(tip.x - u.x * L * k + v.x * an * m)},${n2(tip.y - u.y * L * k + v.y * an * m)}`;
    if (tipo === "abierta") return { d: `M${en(1, 1)} L${n2(tip.x)},${n2(tip.y)} L${en(1, -1)}`, hueca: true, abierta: true };
    if (tipo === "rombo" || tipo === "rombo-hueco") return { d: `M${n2(tip.x)},${n2(tip.y)} L${en(0.8, 0.85)} L${en(1.6, 0)} L${en(0.8, -0.85)} Z`, hueca: tipo === "rombo-hueco" };
    if (tipo === "circulo") { const r = L * 0.42, cx = tip.x - u.x * r, cy = tip.y - u.y * r; return { d: `M${n2(cx + r)},${n2(cy)} A${n2(r)},${n2(r)} 0 1 0 ${n2(cx - r)},${n2(cy)} A${n2(r)},${n2(r)} 0 1 0 ${n2(cx + r)},${n2(cy)} Z`, hueca: false }; }
    return { d: `M${n2(tip.x)},${n2(tip.y)} L${en(1, 1)} L${en(1, -1)} Z`, hueca: tipo === "hueco" };
  }
  /** SVG de una flecha (lo usan el lienzo, la diapositiva al presentar y lo que se exporta). */
  function svgConector(c, a, b, opc) {
    opc = opc || {};
    const r = rutaConector(a, b, c), g = Math.max(1, +c.grosor || 2);
    const col = c.color && colorCss(c.color) ? c.color : opc.color || "#4A4854", fondo = opc.fondo || "#FFFFFF", tinta = opc.tinta || "#1F1E26";
    const dash = c.estilo === "guiones" ? `stroke-dasharray:${g * 4} ${g * 3};` : c.estilo === "puntos" ? `stroke-dasharray:0.1 ${g * 2.6};stroke-linecap:round;` : "";
    let s = opc.toque ? `<path class="toque" d="${r.d}"/>` : "";
    if (opc.sel) s += `<path class="halo" d="${r.d}" style="stroke:var(--m-diag);stroke-width:${g + 8}px;opacity:.28;fill:none"/>`;
    s += `<path class="linea" d="${r.d}" style="stroke:${col};stroke-width:${g}px;fill:none;${dash}"/>`;
    r.puntas.forEach((pt) => (s += `<path class="punta" d="${pt.d}" style="fill:${pt.abierta ? "none" : pt.hueca ? fondo : col};stroke:${col};stroke-width:${pt.hueca ? Math.max(1.5, g * 0.8) : 1}px;stroke-linejoin:round;stroke-linecap:round"/>`));
    const etiqueta = (t, x, y, chico) => {
      const tx = String(t).slice(0, 80), fs = chico ? 12 : 13, w = Math.min(340, tx.length * (chico ? 6.8 : 7.3) + (chico ? 10 : 18)), h = chico ? 20 : 24;
      return `<g class="etq"><rect x="${n2(x - w / 2)}" y="${n2(y - h / 2)}" width="${n2(w)}" height="${h}" rx="${h / 2}" style="fill:${fondo};stroke:${chico ? "none" : col};stroke-width:1px"/><text x="${n2(x)}" y="${n2(y + fs * 0.35)}" text-anchor="middle" style="fill:${tinta};font:700 ${fs}px Nunito, system-ui, sans-serif">${esc(tx)}</text></g>`;
    };
    if (c.etiqueta) s += etiqueta(c.etiqueta, r.medio.x, r.medio.y);
    // Textos cerca de cada punta (por ejemplo, la cardinalidad 1 y N).
    const cerca = (pt, u, t) => etiqueta(t, pt.x - u.x * 24 - u.y * 14, pt.y - u.y * 24 + u.x * 14, true);
    if (c.etqIni) s += cerca(r.ini, r.dirIni, c.etqIni);
    if (c.etqFin) s += cerca(r.fin, r.dirFin, c.etqFin);
    return s;
  }
  const ESTILOS_FLECHA = [["solido", "Sólida", "minus"], ["guiones", "Con guiones", "square-dashed"], ["puntos", "Con puntos", "more-horizontal"]];
  const PUNTAS = [["fin", "Al final", "arrow-right"], ["inicio", "Al inicio", "arrow-left"], ["ambas", "En los dos lados", "arrow-left-right"], ["ninguna", "Sin punta", "minus"]];
  const TIPOS_PUNTA = [["triangulo", "Triángulo"], ["abierta", "Abierta"], ["hueco", "Triángulo hueco (herencia)"], ["rombo", "Rombo (composición)"], ["rombo-hueco", "Rombo hueco (agregación)"], ["circulo", "Círculo"]];
  const RUTAS = [["recta", "Recta", "move-right"], ["codo", "En codo", "corner-down-right"], ["curva", "Curva", "spline"]];
  NOM.geometria = { conector, rutaConector, svgConector };
  NOM.figuras = { iconoSeguro: (b) => iconoSeguro(b), ruta, svgFigura, estiloFigura, partesFigura, FIGURAS, FIGURAS_UML, FIGURAS_ER, FIGURAS_RED, PRESETS, COMPARTIMENTOS, compartimentos, esLinea, enNegrita };
  // Lo que usa la pantalla del proyector (proyector.js) para pintar diapositivas.
  NOM.lienzoVista = { htmlDiapositiva: (...a) => htmlDiapositiva(...a), pasosDe: (...a) => pasosDe(...a), bloquesPresentables: (...a) => bloquesPresentables(...a), ANCHO, ALTO, tam: tamDoc,
    estadoAnimaciones: (...a) => estadoAnimaciones(...a), contenido: (b) => contenido(b) };

  /** Lo único que se guarda del texto de un cuadro: texto, saltos de línea y enlaces http(s). */
  function htmlSeguro(h) {
    const t = document.createElement("template");
    t.innerHTML = String(h || "");
    let r = "";
    (function rec(n) {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { r += esc(c.nodeValue); continue; }
        if (c.nodeType !== 1) continue;
        if (c.tagName === "BR") { r += "<br>"; continue; }
        if (c.tagName === "A" && /^https?:\/\//i.test(c.getAttribute("href") || "")) { r += `<a href="${esc(c.getAttribute("href"))}" target="_blank" rel="noopener">`; rec(c); r += "</a>"; continue; }
        if (c.tagName === "DIV" || c.tagName === "P") { if (r && !r.endsWith("<br>")) r += "<br>"; rec(c); continue; }
        rec(c);
      }
    })(t.content);
    return r;
  }
  /** 8.3 Recorte, máscara (la foto dentro de una figura) y filtros de una imagen de la diapositiva. */
  function imagenLibre(b) {
    const s = [], marco = [];
    if (b.radio && !b.mascara) marco.push(`border-radius:${+b.radio}px`);
    if (b.bordeAncho && !b.mascara) marco.push(`border:${+b.bordeAncho}px ${b.bordeEstilo === "guiones" ? "dashed" : b.bordeEstilo === "puntos" ? "dotted" : "solid"} ${b.borde || "#2B2A33"}`);
    if (b.mascara && b.w && b.h) marco.push(`clip-path:path('${ruta(b.mascara, b.w, b.h, 18)}')`);
    const f = b.filtros || {};
    const fl = [f.brillo != null && +f.brillo !== 100 ? `brightness(${+f.brillo}%)` : "", f.contraste != null && +f.contraste !== 100 ? `contrast(${+f.contraste}%)` : "",
      f.saturacion != null && +f.saturacion !== 100 ? `saturate(${+f.saturacion}%)` : "", +f.gris ? `grayscale(${+f.gris}%)` : "", +f.sepia ? `sepia(${+f.sepia}%)` : "", +f.desenfoque ? `blur(${+f.desenfoque}px)` : ""].filter(Boolean).join(" ");
    if (fl) s.push(`filter:${fl}`);
    if (b.volteoH || b.volteoV) s.push(`transform:scale(${b.volteoH ? -1 : 1},${b.volteoV ? -1 : 1})`);
    const r = b.recorte;
    if (r && (r.iz || r.d || r.s || r.i)) {
      // El recorte se dibuja con la imagen completa más grande, desplazada dentro del marco.
      const fw = Math.max(0.05, 1 - (+r.iz || 0) - (+r.d || 0)), fh = Math.max(0.05, 1 - (+r.s || 0) - (+r.i || 0));
      s.push(`position:absolute;max-width:none;width:${(100 / fw).toFixed(3)}%;height:${(100 / fh).toFixed(3)}%;left:${(-(+r.iz || 0) / fw * 100).toFixed(3)}%;top:${(-(+r.s || 0) / fh * 100).toFixed(3)}%;object-fit:fill`);
      return `<div class="libre-imagen-marco" style="${marco.join(";")}"><img class="libre-imagen" src="${esc(b.src)}" alt="${esc(b.alt || "")}" draggable="false" style="${s.join(";")}"></div>`;
    }
    if (b.mascara) return `<div class="libre-imagen-marco" style="${marco.join(";")}"><img class="libre-imagen" src="${esc(b.src)}" alt="${esc(b.alt || "")}" draggable="false" style="object-fit:cover;border-radius:0;${s.join(";")}"></div>`;
    return `<img class="libre-imagen" src="${esc(b.src)}" alt="${esc(b.alt || "")}" draggable="false" style="${marco.concat(s).join(";")}">`;
  }
  /**
   * El dibujo de un ícono: el de la biblioteca local si se conoce, o el guardado pero limpio (solo
   * figuras con números: nada de scripts, enlaces ni objetos ajenos aunque alguien altere el documento).
   */
  const SVG_OK = { path: ["d"], circle: ["cx", "cy", "r"], ellipse: ["cx", "cy", "rx", "ry"], rect: ["x", "y", "width", "height", "rx", "ry"], line: ["x1", "y1", "x2", "y2"], polyline: ["points"], polygon: ["points"] };
  const iconosLimpios = new Map();
  function iconoSeguro(b) {
    const lib = NOM.iconos && b && b.nombre ? NOM.iconos.LISTA.find((x) => x.id === b.nombre) : null;
    const crudo = String((lib && lib.svg) || (b && b.svg) || "");
    if (iconosLimpios.has(crudo)) return iconosLimpios.get(crudo);
    let r = "";
    try {
      const d = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${crudo}</svg>`, "image/svg+xml");
      (function rec(n) {
        for (const c of [...n.children]) {
          const ok = SVG_OK[c.localName];
          if (ok) r += `<${c.localName}` + ok.filter((a) => c.hasAttribute(a) && /^[-0-9.,\sMmLlHhVvCcSsQqTtAaZzEe]{0,4000}$/.test(c.getAttribute(a))).map((a) => ` ${a}="${c.getAttribute(a)}"`).join("") + "/>";
          else if (c.localName === "g") rec(c);
        }
      })(d.documentElement);
    } catch (e) { r = ""; }
    if (iconosLimpios.size > 500) iconosLimpios.clear();
    iconosLimpios.set(crudo, r);
    return r;
  }
  function contenido(b) {
    const D = NOM.diapo;
    if (b.tipo === "texto") return `<div class="libre-texto" data-estilo="${esc(b.estilo || "p")}" data-ph="${esc(b.ph || "Escribe aquí")}" style="${estiloTexto(b)}">${D ? D.htmlRico(b.html) : htmlSeguro(b.html)}</div>`;
    if (b.tipo === "forma") {
      const e = estiloFigura(b);
      const cm = COMPARTIMENTOS.has(e.f);
      const txt = cm ? compartimentos(e.f, b.texto) : b.html && D ? D.htmlRico(b.html) : esc(b.texto || "");
      return `<div class="forma" data-figura="${esc(e.f)}"${cm ? ` style="--cm-borde:${esc(e.trazo || "#2B2A33")}"` : ""}>${svgFigura(b)}${e.lineal ? "" : `<div class="txt" data-ph="Texto" style="${estiloTexto(b, e.relleno)}">${txt}</div>`}</div>`;
    }
    if (b.tipo === "imagen") {
      if (!b.src) return `<div class="libre-hueco">${NOM.ico("image", "ico-l")}<span>${esc(b.ph || "Toca dos veces para poner una imagen")}</span></div>`;
      return imagenLibre(b);
    }
    if (b.tipo === "tabla") {
      // Una tabla propia de la diapositiva (filas y columnas) o una hoja que vino de otro modo.
      if (D && b.enDiapo) return D.tablaHtml(b);
      const ev = NOM.formulas.evaluador((c, f) => b["c:" + NOM.formulas.ref(c, f)]);
      let filas = "";
      for (let f = 0; f < 8; f++) {
        let fila = "", algo = false;
        for (let c = 0; c < 6; c++) { const v = NOM.formulas.formatear(ev.valor(c, f)); if (v) algo = true; fila += `<td>${esc(v)}</td>`; }
        if (algo) filas += `<tr>${fila}</tr>`;
      }
      return `<div class="libre-tabla"><table>${filas || "<tr><td>Tabla vacía</td></tr>"}</table></div>`;
    }
    if (b.tipo === "grafica" && !b.hoja && D) return `<div class="libre-grafica">${D.graficaHtml(b)}</div>`;
    if (b.tipo === "icono") return `<svg class="libre-icono" viewBox="0 0 24 24" fill="none" stroke="${esc(b.color || "#2B2A33")}" stroke-width="${+b.grosor || 2}" stroke-linecap="round" stroke-linejoin="round" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${iconoSeguro(b)}</svg>`;
    if (b.tipo === "ecuacion") return `<div class="libre-ecuacion" style="${estiloTexto(b)}">${NOM.ecuaciones ? NOM.ecuaciones.html(b.tex || "", true) : esc(b.tex || "")}</div>`;
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
    // El ancla puede ser un botón o un punto de la pantalla ({ x, y }, desde la ruedita).
    const r = ancla.getBoundingClientRect ? ancla.getBoundingClientRect() : { left: ancla.x - p.offsetWidth / 2, right: ancla.x, top: ancla.y - p.offsetHeight / 2, bottom: ancla.y - p.offsetHeight / 2 };
    p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left)) + "px";
    p.style.top = Math.max(8, r.bottom + p.offsetHeight + 8 > innerHeight ? Math.max(8, r.top - p.offsetHeight - 6) : r.bottom + 6) + "px";
    const cerrar = () => { p.remove(); document.removeEventListener("pointerdown", fuera, true); document.removeEventListener("keydown", esc2, true); opc.alCerrar && opc.alCerrar(); };
    const fuera = (e) => { if (!p.contains(e.target) && !(ancla.contains && ancla.contains(e.target))) cerrar(); };
    const esc2 = (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    setTimeout(() => { document.addEventListener("pointerdown", fuera, true); document.addEventListener("keydown", esc2, true); }, 0);
    p.cerrar = cerrar;
    return p;
  }
  function paletaColores(ancla, actual, alElegir, opc) {
    opc = opc || {};
    const gotas = opc.gotero ? `<div class="fila lz-gotas">${window.EyeDropper && matchMedia("(pointer: fine)").matches ? `<button class="btn chico" data-gotas="pantalla">${ico("pipette", "ico-s")} Cuentagotas</button>` : ""}<button class="btn chico" data-gotas="figura">${ico("pipette", "ico-s")} Copiar de otra figura</button></div>` : "";
    const p = panel(ancla, `${opc.sinColor ? `<button class="lz-sin" data-c="">${ico("x", "ico-s")} ${esc(opc.sinColor)}</button>` : ""}
      <div class="lz-muestras">${COLORES.map((c) => `<button data-c="${c}" style="background:${c}" aria-label="${c}" ${String(actual).toUpperCase() === c ? 'aria-pressed="true"' : ""}></button>`).join("")}</div>
      <label class="lz-otro">${ico("palette", "ico-s")} Color personalizado <input type="color" value="${/^#[0-9a-f]{6}$/i.test(actual || "") ? actual : "#5B5BD6"}"></label>${gotas}`, { titulo: opc.titulo || "Color" });
    p.addEventListener("click", (e) => {
      const g = e.target.closest("[data-gotas]");
      if (g) { p.cerrar(); opc.gotero(alElegir, g.dataset.gotas); return; }
      const b = e.target.closest("[data-c]"); if (b) { alElegir(b.dataset.c || null); p.cerrar(); }
    });
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
    const W = () => tamDoc(doc()).w, H = () => tamDoc(doc()).h;
    let vista = { x: 40, y: 40, z: 1 }, escala = 1;
    // 5.1 Mesa de trabajo: en la presentación se puede alejar y mover la vista alrededor de la diapositiva.
    let zoomD = 1, panD = { x: 0, y: 0 };
    // 3.4 Bloques que cambiaron otros desde la última visita; 7 bloques con comentarios.
    let resaltados = new Set(), comentados = new Map();
    // 1.3 Cuentagotas: el próximo toque en una figura copia su color.
    let gotero = null;
    const yo = () => (NOM.api.usuario() || {}).id;
    /** 5.2 Grupos dentro de grupos: lista de grupos, del de afuera al de adentro ("grupo" de antes = un nivel). */
    const gruposDe = (b) => (b && Array.isArray(b.grupos) ? b.grupos : b && b.grupo ? [b.grupo] : []);
    const duenoPagina = (p) => doc().valor("_doc", "dueno:" + p) || null;
    /** 3.5 y 5.4: ¿puedo cambiar este bloque? El propietario del espacio siempre puede. */
    function motivoAjeno(b) {
      if (ed.soloLectura) return "Solo puedes ver";
      if (ed.esPropietario || !b) return null;
      if (b.maestro) return "Es parte de la plantilla del maestro";
      if (b.dueno && b.dueno !== yo()) return "Es de " + ed.nombreDe(b.dueno);
      const dp = duenoPagina(b.pagina || ed.pagina);
      if (dp && dp !== yo()) return "Esta diapositiva es de " + ed.nombreDe(dp);
      return null;
    }
    const puedoEditar = (b) => !motivoAjeno(b);
    const paginaAjena = () => { const d = duenoPagina(ed.pagina); return d && d !== yo() && !ed.esPropietario ? d : null; };
    const fuera = (b) => acotado && b.x != null && (b.x + b.w <= 0 || b.y + b.h <= 0 || b.x >= W() || b.y >= H());
    let sel = new Set(), selConector = null, herramienta = null, editando = null, origenEnlace = null;
    let espacio = false, multiple = false;
    const capa = html(acotado
      ? `<div class="escenario" data-escenario><div class="diapo" data-mundo><svg class="capa-conectores" data-svg width="${W()}" height="${H()}"></svg><svg class="capa-guias" data-guias width="${W()}" height="${H()}"></svg></div><div class="lz-marco" data-marco hidden></div></div>`
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
    } else {
      // 5.1 Alejar para ver la mesa de trabajo alrededor de la diapositiva (lo que quede fuera no se presenta ni se exporta).
      zoomCtl = html(`<div class="zoom-ctl"><button class="icono-btn" data-z="-" aria-label="Alejar" data-micro="Alejar|Para ver la mesa de trabajo: lo que dejes fuera de la diapositiva no se presenta ni se exporta.|Ctrl+rueda">${ico("zoom-out")}</button><span data-zv>100%</span><button class="icono-btn" data-z="+" aria-label="Acercar" data-micro="Acercar||Ctrl+rueda">${ico("zoom-in")}</button><button class="icono-btn" data-z="ajustar" aria-label="Ajustar" data-micro="Ajustar|La diapositiva completa en pantalla.">${ico("maximize-2")}</button></div>`);
      capa.append(zoomCtl);
      $$("[data-z]", zoomCtl).forEach((b) => (b.onclick = () => (b.dataset.z === "ajustar" ? ((zoomD = 1), (panD = { x: 0, y: 0 }), aplicarVista()) : zoomDiapo(b.dataset.z === "+" ? 1.2 : 1 / 1.2))));
    }
    function zoomDiapo(k, centro) {
      const r = capa.getBoundingClientRect();
      const c = centro || { x: r.width / 2, y: r.height / 2 };
      const antes = escala, z = Math.max(0.3, Math.min(3, zoomD * k));
      // El punto bajo el dedo (o el cursor) se queda en su lugar.
      const ml = parseFloat(mundo.style.left) || 0, mt = parseFloat(mundo.style.top) || 0;
      const wx = (c.x - ml) / antes, wy = (c.y - mt) / antes;
      zoomD = z;
      aplicarVista();
      const ml2 = parseFloat(mundo.style.left) || 0, mt2 = parseFloat(mundo.style.top) || 0;
      panD.x += c.x - (ml2 + wx * escala); panD.y += c.y - (mt2 + wy * escala);
      aplicarVista();
    }
    const barra = html(`<div class="lz-barra" role="toolbar" aria-label="Opciones de la selección" hidden></div>`);
    capa.append(barra);
    // 8.4 Cuadrícula con ajuste: preferencia de cada persona en este equipo (pizarrón: 24 px; diapositiva: 20 px).
    const PASO = acotado ? 20 : 24;
    let cuadricula = !!NOM.leer("nom.cuadricula", false);
    const aRejilla = (v) => Math.round(v / PASO) * PASO;
    capa.classList.toggle("con-cuadricula", cuadricula);
    function fijarCuadricula(on) {
      cuadricula = !!on;
      NOM.guardar("nom.cuadricula", cuadricula);
      capa.classList.toggle("con-cuadricula", cuadricula);
      aviso(cuadricula ? "Las figuras se ajustan a la cuadrícula (con Alt, libres)" : "Ajuste a la cuadrícula apagado", { ms: 1800 });
    }

    // ------------------------------------------------------------ transformaciones
    function aplicarVista() {
      if (acotado) {
        const r = superficie.getBoundingClientRect();
        escala = Math.max(0.05, Math.min((r.width - 48) / W(), (r.height - 48) / H())) * zoomD;
        mundo.style.transform = `scale(${escala})`;
        mundo.style.left = (r.width - W() * escala) / 2 + panD.x + "px";
        mundo.style.top = (r.height - H() * escala) / 2 + panD.y + "px";
        if (zoomCtl) $("[data-zv]", zoomCtl).textContent = Math.round(zoomD * 100) + "%";
        capa.classList.toggle("alejado", zoomD < 0.999);
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
      return posiciones(doc().deLaPagina(ed.pagina).filter((b) => b.tipo !== "conector" && !b.oculto), acotado)
        .concat(doc().deLaPagina(ed.pagina).filter((b) => b.tipo === "conector"));
    }
    const porId = (id) => bloques().find((b) => b.id === id);
    const unico = () => (sel.size === 1 ? [...sel][0] : null);
    /** 8.3 La diapositiva toma el tamaño, el fondo y los colores del tema de su documento. */
    function aplicarDiapo() {
      if (!acotado || !NOM.diapo) return;
      const T = tamDoc(doc()), te = NOM.diapo.tema(doc()), f = NOM.diapo.fondoDe(doc(), ed.pagina);
      mundo.style.width = T.w + "px"; mundo.style.height = T.h + "px";
      mundo.style.background = NOM.diapo.cssFondo(f) || "";
      ["--t-titulo", "--t-texto", "--t-fuente-t", "--t-fuente", "--t-franja"].forEach((v) => mundo.style.removeProperty(v));
      if (te) {
        mundo.style.setProperty("--t-titulo", te.titulo); mundo.style.setProperty("--t-texto", te.texto);
        if (te.fuenteT) mundo.style.setProperty("--t-fuente-t", NOM.textoRico ? NOM.textoRico.cssFuente(te.fuenteT) : te.fuenteT);
        if (te.fuente) mundo.style.setProperty("--t-fuente", NOM.textoRico ? NOM.textoRico.cssFuente(te.fuente) : te.fuente);
        if (te.franja) mundo.style.setProperty("--t-franja", te.franja);
      }
      mundo.classList.toggle("con-tema", !!te);
      mundo.classList.toggle("con-franja", !!(te && te.franja));
      [svg, guias].forEach((x) => { x.setAttribute("width", T.w); x.setAttribute("height", T.h); });
    }
    let ultimoTam = null;
    function render() {
      const bs = bloques();
      if (acotado) { aplicarDiapo(); const t = W() + "x" + H(); if (t !== ultimoTam) { ultimoTam = t; aplicarVista(); } }
      $$(".bl", mundo).forEach((e) => e.remove());
      const mapa = {};
      for (const id of [...sel]) if (!bs.some((b) => b.id === id)) sel.delete(id);
      bs.filter((b) => b.tipo !== "conector").sort((a, b) => (a.z || 0) - (b.z || 0)).forEach((b, i) => {
        mapa[b.id] = b;
        const ajeno = motivoAjeno(b);
        const el = html(`<div class="bl${b.sinPos ? " sin-pos" : ""}${sel.has(b.id) ? " sel" : ""}${clasesBloque(b)}${fuera(b) ? " fuera" : ""}${resaltados.has(b.id) ? " cambiado" : ""}${ajeno && !ed.soloLectura ? " ajeno" : ""}" data-id="${esc(b.id)}" data-tipo="${esc(b.tipo)}" style="${estiloBloque(b, i)}${b.dueno ? `--dueno:${esc(ed.colorDe(b.dueno))};` : ""}"${b.dueno ? ` data-dueno="${esc(ed.nombreDe(b.dueno))}"` : ""}>${contenido(b)}${comentados.has(b.id) ? `<span class="lz-coment" title="Comentarios">${ico("message-square", "ico-s")}${comentados.get(b.id) > 1 ? comentados.get(b.id) : ""}</span>` : ""}</div>`);
        if (sel.size === 1 && sel.has(b.id) && !ed.soloLectura) adornos(el, b);
        mundo.append(el);
      });
      pintarConectores(bs, mapa);
      pintarCajaGrupo();
      if (editando) {
        const el = mundo.querySelector(`[data-id="${editando}"] .txt, [data-id="${editando}"] .libre-texto`), be = doc().bloque(editando);
        if (el && be && be.tipo === "forma" && COMPARTIMENTOS.has(be.figura)) { el.textContent = be.texto || ""; el.classList.add("cm-editando"); }
        if (el) activarEdicion(el, false);
      }
      ed.pintarPresencia();
      pintarBarra();
      pintarMultiple();
      capas.pintar();
      opc.alPintar && opc.alPintar();
    }
    function adornos(el, b) {
      const ajeno = motivoAjeno(b);
      if (b.bloqueado || ajeno) { el.append(html(`<span class="lz-candado" title="${esc(ajeno || (b.maestro ? "Plantilla del maestro" : "Bloqueado"))}">${ico(b.maestro ? "crown" : "lock", "ico-s")}</span>`)); return; }
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
      // En el pizarrón la flecha toma la tinta del tema (claro u oscuro); en la diapositiva, gris oscuro.
      const base = acotado ? { color: "#4A4854" } : { color: "var(--tinta-2)", fondo: "var(--sup-2)", tinta: "var(--tinta)" };
      svg.innerHTML = cs.map((c) => `<g data-conector="${esc(c.id)}">${svgConector(c, mapa[c.desde], mapa[c.hasta], Object.assign({ sel: c.id === selConector, toque: true }, base))}</g>`).join("");
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
    /** Al elegir una figura agrupada se elige todo su grupo de más afuera (como en Canva). Un segundo
        toque sobre ella entra al grupo de adentro (o a la figura sola). */
    function conGrupo(ids) {
      const r = new Set(ids);
      const tops = new Set([...r].map((id) => gruposDe(doc().bloque(id))[0]).filter(Boolean));
      if (tops.size) bloques().forEach((b) => { const g = gruposDe(b)[0]; if (g && tops.has(g)) r.add(b.id); });
      return r;
    }
    /** Ids con el mismo prefijo de grupos (los primeros 'nivel' + 1 grupos de b). */
    function miembrosHasta(b, nivel) {
      const pre = gruposDe(b).slice(0, nivel + 1);
      return bloques().filter((x) => { const g = gruposDe(x); return pre.every((p, i) => g[i] === p); }).map((x) => x.id);
    }
    /** Toque sobre una figura ya elegida como parte de su grupo: se entra un nivel. */
    function entrarAlGrupo(id) {
      const b = porId(id), g = gruposDe(b);
      if (!g.length) return false;
      let nivel = -1;
      for (let k = 0; k < g.length; k++) { const m = miembrosHasta(b, k); if (m.length === sel.size && m.every((x) => sel.has(x))) { nivel = k; break; } }
      if (nivel < 0) return false;
      const siguiente = nivel + 1 < g.length ? miembrosHasta(b, nivel + 1) : [id];
      terminarEdicion();
      sel = new Set(siguiente); selConector = null;
      ed.seleccionar(id);
      render();
      opc.alSeleccionar && opc.alSeleccionar(unico());
      ed.refrescarHerramientas();
      return true;
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
    /** 8.3 Barra de formato mientras se escribe en un cuadro: negrita, color o tamaño de una parte,
        viñetas, numeración y alineación (como en PowerPoint). */
    const barraTexto = html(`<div class="lz-barra lz-barra-texto" role="toolbar" aria-label="Formato del texto" hidden></div>`);
    capa.append(barraTexto);
    function comando(c, v) {
      try { document.execCommand("styleWithCSS", false, true); } catch (e) { /* no importa */ }
      document.execCommand(c, false, v);
    }
    function tamanoParte(delta) {
      const s0 = getSelection();
      if (!s0.rangeCount) return;
      const n = s0.anchorNode && (s0.anchorNode.nodeType === 1 ? s0.anchorNode : s0.anchorNode.parentElement);
      const actual = n ? parseFloat(getComputedStyle(n).fontSize) || 22 : 22;
      const nuevo = Math.max(8, Math.min(160, Math.round(actual + delta * Math.max(2, actual * 0.12))));
      try { document.execCommand("styleWithCSS", false, false); } catch (e) { /* no importa */ }
      document.execCommand("fontSize", false, "7");
      const el = editando && mundo.querySelector(`[data-id="${editando}"] .txt, [data-id="${editando}"] .libre-texto`);
      if (el) $$('font[size="7"]', el).forEach((f) => { const sp = document.createElement("span"); sp.style.fontSize = nuevo + "px"; while (f.firstChild) sp.append(f.firstChild); f.replaceWith(sp); });
    }
    function pintarBarraTexto(el) {
      if (!el || ed.soloLectura) { barraTexto.hidden = true; return; }
      const btn = (a, i, t) => `<button class="icono-btn" data-a="${a}" aria-label="${esc(t)}" data-micro="${esc(t)}">${i}</button>`;
      barraTexto.innerHTML = [btn("bold", ico("bold"), "Negrita|Ctrl+B"), btn("italic", ico("italic"), "Cursiva|Ctrl+I"), btn("underline", ico("underline"), "Subrayado|Ctrl+U"), btn("strikeThrough", ico("strikethrough"), "Tachado"),
        btn("color", ico("baseline"), "Color de esta parte"), btn("menos", `<b class="lz-a">A-</b>`, "Letra más chica"), btn("mas", `<b class="lz-a">A+</b>`, "Letra más grande"), '<span class="sep"></span>',
        btn("insertUnorderedList", ico("list"), "Viñetas"), btn("insertOrderedList", ico("list-ordered"), "Numeración"), btn("justifyLeft", ico("align-left"), "Izquierda"), btn("justifyCenter", ico("align-center"), "Centro"),
        btn("justifyRight", ico("align-right"), "Derecha"), btn("removeFormat", ico("remove-formatting"), "Quitar formato")].join("");
      barraTexto.hidden = false;
      const r = el.closest(".bl").getBoundingClientRect(), c = capa.getBoundingClientRect();
      barraTexto.style.left = Math.max(8, Math.min(c.width - barraTexto.offsetWidth - 8, r.left - c.left + r.width / 2 - barraTexto.offsetWidth / 2)) + "px";
      barraTexto.style.top = Math.max(8, r.top - c.top - barraTexto.offsetHeight - 12) + "px";
    }
    barraTexto.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) e.preventDefault(); e.stopPropagation(); });
    barraTexto.addEventListener("click", (e) => {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      const a = b.dataset.a;
      if (a === "color") { const s0 = getSelection(), r0 = s0.rangeCount ? s0.getRangeAt(0).cloneRange() : null; paletaColores(b, null, (c) => { if (r0) { s0.removeAllRanges(); s0.addRange(r0); } if (c) comando("foreColor", c); }, { titulo: "Color del texto elegido" }); return; }
      if (a === "mas" || a === "menos") { tamanoParte(a === "mas" ? 1 : -1); return; }
      comando(a);
    });
    function activarEdicion(el, todo) {
      el.contentEditable = "true";
      el.focus();
      // Un cuadro de "puntos" (de un diseño de diapositiva) empieza como lista con viñetas.
      const b0 = editando && doc().bloque(editando);
      if (b0 && b0.lista && !el.textContent.trim() && !el.querySelector("li")) { el.innerHTML = "<ul><li><br></li></ul>"; const rr = document.createRange(); rr.setStart(el.querySelector("li"), 0); rr.collapse(true); const ss = getSelection(); ss.removeAllRanges(); ss.addRange(rr); todo = false; }
      requestAnimationFrame(() => pintarBarraTexto(el));
      if (todo !== false) {
        const r = document.createRange(); r.selectNodeContents(el);
        if (!el.textContent) r.collapse(true);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }
      el.onblur = () => setTimeout(() => { if (document.activeElement !== el && !barraTexto.contains(document.activeElement) && !document.querySelector(".lz-panel")) terminarEdicion(); }, 0);
      el.onpaste = (e) => {
        const t = (e.clipboardData && e.clipboardData.getData("text/plain") || "").trim();
        const s0 = getSelection();
        if (/^https?:\/\/[^\s<>"]+$/i.test(t) && s0.rangeCount && !s0.isCollapsed && el.contains(s0.anchorNode)) {
          e.preventDefault();
          const r = s0.getRangeAt(0), a = document.createElement("a");
          a.href = t; a.target = "_blank"; a.rel = "noopener";
          try { a.append(r.extractContents()); r.insertNode(a); } catch (x) { /* selección rara */ }
          aviso("Enlace aplicado al texto elegido", { tipo: "ok", ms: 1600 });
          return;
        }
        // Lo demás se pega como texto (sin formato ajeno).
        if (t) { e.preventDefault(); document.execCommand("insertText", false, t); }
      };
      el.onkeydown = (e) => {
        if (e.key === "Escape") { e.preventDefault(); el.blur(); }
        // Ctrl+B / I / U: con texto elegido, solo esa parte (8.3); sin elegir nada, todo el cuadro.
        const k = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && { b: "tNegrita", i: "tCursiva", u: "tSubrayado" }[e.key.toLowerCase()];
        const sl = getSelection();
        if (k && sl.rangeCount && !sl.isCollapsed && el.contains(sl.anchorNode)) { e.preventDefault(); comando({ tNegrita: "bold", tCursiva: "italic", tSubrayado: "underline" }[k]); e.stopPropagation(); return; }
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
      if (!puedoEditar(b)) { aviso(motivoAjeno(b), { tipo: "info" }); return; }
      editando = id;
      barra.hidden = true;
      const el = mundo.querySelector(`[data-id="${id}"] .txt, [data-id="${id}"] .libre-texto`);
      // 8.4 Clase y entidad: se editan como texto simple (una línea por atributo o método).
      if (el && b.tipo === "forma" && COMPARTIMENTOS.has(b.figura)) { el.textContent = b.texto || ""; el.classList.add("cm-editando"); }
      if (el) activarEdicion(el);
    }
    function terminarEdicion() {
      if (!editando) return;
      const id = editando; editando = null;
      barraTexto.hidden = true;
      const el = mundo.querySelector(`[data-id="${id}"] .txt, [data-id="${id}"] .libre-texto`);
      if (!el) return;
      el.contentEditable = "false";
      const b = doc().bloque(id);
      if (!b) return;
      const D = NOM.diapo;
      let h = D ? D.htmlRico(el.innerHTML) : htmlSeguro(el.innerHTML).replace(/(<br>)+$/, "");
      if (D && !D.textoPlano(h)) h = "";
      if (b.tipo === "forma") {
        const t = D ? D.textoPlano(h) : el.innerText.trim();
        const conFormato = D && !COMPARTIMENTOS.has(b.figura) && /<(b|i|u|s|span|ul|ol|div|a|sub|sup)\b/.test(h);
        if (t !== (b.texto || "") || (conFormato ? h : null) !== (b.html || null)) doc().cambiar(id, { texto: t, html: conFormato ? h : null });
      } else if (h !== (b.html || "")) doc().cambiar(id, { html: h });
      pintarBarra();
    }

    // ------------------------------------------------------------ crear
    const TAM = { ecuacion: [460, 120], icono: [120, 120], tabla: [560, 240], grafica: [520, 300], texto: [420, 64], rect: [200, 110], elipse: [190, 120], rombo: [190, 130], nota: [180, 160], linea: [220, 24], "linea-flecha": [220, 24], flecha: [200, 100], "flecha-doble": [220, 100], estrella: [150, 145], corazon: [150, 135], burbuja: [220, 130] };
    function crear(tipo, extra, en) {
      const dp = paginaAjena();
      if (dp) { aviso(`Esta diapositiva es de ${ed.nombreDe(dp)}: solo esa persona (o el propietario del espacio) agrega cosas aquí`, { tipo: "info", ms: 3500 }); return null; }
      const p = en || (acotado ? { x: W() / 2, y: H() / 2 } : centroVista());
      const fig = extra && extra.figura;
      const tam = TAM[fig || tipo] || [170, 150];
      const id = NOM.DocCRDT.nuevoId();
      const zMax = Math.max(0, ...bloques().map((b) => b.z || 0));
      const campos = Object.assign({ tipo, pagina: ed.pagina, orden: Date.now() % 1e9 / 1e6, x: Math.round(p.x - tam[0] / 2), y: Math.round(p.y - tam[1] / 2), w: tam[0], h: tam[1], z: zMax + 1 }, extra || {});
      if (tipo === "texto") Object.assign(campos, { html: "", estilo: acotado ? "h2" : "p" });
      if (tipo === "forma" && !campos.color && !esLinea(fig)) campos.color = fig === "nota" ? "#FFF1B8" : "#CFE0FF";
      if (cuadricula) { campos.x = aRejilla(campos.x); campos.y = aRejilla(campos.y); }
      const sinEditar = campos.sinEditar; delete campos.sinEditar;
      doc().cambiar(id, campos);
      sel = new Set([id]); ed.seleccionar(id);
      render();
      if (!sinEditar && (tipo === "texto" || (tipo === "forma" && !esLinea(fig)))) editar(id);
      return id;
    }
    /** 8.4 Figura lista de UML, entidad-relación o de redes (un ícono), en el punto dado o al centro. */
    function crearPreset(clave, en) {
      const p = en || (acotado ? { x: W() / 2, y: H() / 2 } : centroVista());
      if (clave.startsWith("red:")) {
        const ic = NOM.iconos && NOM.iconos.LISTA.find((x) => x.id === clave.slice(4));
        if (!ic) return null;
        const nuevoId = crear("icono", { svg: ic.svg, nombre: ic.id, color: "#2B2A33", grosor: 2, w: 90, h: 90, x: Math.round(p.x - 45), y: Math.round(p.y - 45), sinEditar: true }, p);
        if (nuevoId && NOM.diapo) NOM.diapo.iconoPng(ic.svg, "#2B2A33", 2).then((png) => { if (png && doc().vivo(nuevoId)) doc().cambiar(nuevoId, { png }, { deshacible: false }); });
        return nuevoId;
      }
      const pr = PRESETS[clave];
      if (!pr) return null;
      return crear("forma", Object.assign({}, pr, { x: Math.round(p.x - pr.w / 2), y: Math.round(p.y - pr.h / 2), sinEditar: !pr.texto }), p);
    }
    /**
     * 8.4 Varios bloques de una vez (diagramas listos, texto a diagrama): centrados donde se pide y
     * elegidos para moverlos juntos. uniones: [[índice desde, índice hasta, { ruta, puntas, etiqueta… }]].
     */
    function insertarBloques(lista, uniones, en) {
      const dp = paginaAjena();
      if (dp) { aviso(`Esta diapositiva es de ${ed.nombreDe(dp)}: solo esa persona (o el propietario del espacio) agrega cosas aquí`, { tipo: "info", ms: 3500 }); return []; }
      if (!lista || !lista.length || ed.soloLectura) return [];
      const x1 = Math.min(...lista.map((b) => b.x)), y1 = Math.min(...lista.map((b) => b.y));
      const x2 = Math.max(...lista.map((b) => b.x + b.w)), y2 = Math.max(...lista.map((b) => b.y + b.h));
      const c = en || (acotado ? { x: W() / 2, y: H() / 2 } : centroVista());
      // En la diapositiva, lo que no cabe se achica para que quepa.
      const k = acotado ? Math.min(1, (W() - 40) / (x2 - x1 || 1), (H() - 40) / (y2 - y1 || 1)) : 1;
      let dx = c.x - ((x1 + x2) / 2) * k, dy = c.y - ((y1 + y2) / 2) * k;
      if (cuadricula) { dx = aRejilla(dx); dy = aRejilla(dy); }
      const zMax = Math.max(0, ...bloques().map((b) => b.z || 0)), base = Date.now() % 1e9 / 1e6;
      const ids = lista.map(() => NOM.DocCRDT.nuevoId());
      doc().lote(() => {
        lista.forEach((b, i) => {
          const campos = Object.assign({}, b, { pagina: ed.pagina, orden: base + i / 1000, z: zMax + 1 + i, x: Math.round(b.x * k + dx), y: Math.round(b.y * k + dy), w: Math.max(4, Math.round(b.w * k)), h: Math.max(4, Math.round(b.h * k)) });
          if (k < 1) campos.tTam = Math.max(9, Math.round((b.tTam || (b.tipo === "texto" ? 22 : 16)) * k));
          doc().cambiar(ids[i], campos);
        });
        (uniones || []).forEach(([a, b2, o]) => { if (ids[a] && ids[b2]) doc().cambiar(NOM.DocCRDT.nuevoId(), Object.assign({ tipo: "conector", desde: ids[a], hasta: ids[b2], pagina: ed.pagina, orden: 0 }, o || {})); });
      });
      seleccionar(ids);
      return ids;
    }
    function centroVista() {
      const r = capa.getBoundingClientRect();
      return { x: (r.width / 2 - vista.x) / vista.z, y: (r.height / 2 - vista.y) / vista.z };
    }
    async function imagen() {
      const img = await ed.pedirImagen();
      if (!img) return;
      const k = Math.min(1, 520 / img.w, 360 / img.h);
      const c = acotado ? { x: W() / 2, y: H() / 2 } : centroVista();
      const id = NOM.DocCRDT.nuevoId();
      doc().cambiar(id, { tipo: "imagen", pagina: ed.pagina, orden: 0, src: img.src, x: Math.round(c.x - (img.w * k) / 2), y: Math.round(c.y - (img.h * k) / 2), w: Math.round(img.w * k), h: Math.round(img.h * k), z: Math.max(0, ...bloques().map((b) => b.z || 0)) + 1 });
      seleccionar(id);
    }

    // ------------------------------------------------------------ acciones sobre la selección
    const seleccionados = () => [...sel].map(porId).filter(Boolean);
    const editables = () => seleccionados().filter((b) => !b.bloqueado && puedoEditar(b));
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
      if (!bs.length) { if (sel.size) aviso(motivoAjeno(seleccionados()[0]) || "Desbloquea la figura para eliminarla", { tipo: "info" }); return; }
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
        if (Array.isArray(c.grupos)) c.grupos = c.grupos.map((x) => grupos[x] || (grupos[x] = "g" + NOM.DocCRDT.nuevoId()));
        delete c.bloqueado; delete c.maestro; delete c.dueno; delete c.oculto;
        doc().cambiar(nuevos[id], c);
      }));
      seleccionar(lista.filter((b) => b.tipo !== "conector").map((b) => nuevos[b.id]));
    }
    function duplicar() { const bs = seleccionados(); if (bs.length) pegarBloques(copiarBloques(bs), 24); }
    function copiar(cortar) {
      const bs = seleccionados();
      if (!bs.length) return;
      NOM._portaFiguras = copiarBloques(bs);
      // También al portapapeles del sistema (para pegar en otra pestaña); si no hay permiso, basta el de la app.
      try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText("nom-figuras:" + JSON.stringify(NOM._portaFiguras)).catch(() => {}); } catch (e) { /* sin permiso */ }
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
    /** Lo que comparten todas las rutas de grupos de la selección (el grupo donde está). */
    function prefijoComun(bs) {
      const rutas = bs.map(gruposDe);
      const r = [];
      for (let i = 0; rutas.length && i < rutas[0].length; i++) { const g = rutas[0][i]; if (rutas.every((x) => x[i] === g)) r.push(g); else break; }
      return r;
    }
    /** ¿La selección es justo un grupo completo (y nada más)? */
    function grupoEntero(bs) {
      const pre = prefijoComun(bs);
      return bs.length > 1 && pre.length > 0 && miembrosHasta(bs[0], pre.length - 1).length === bs.length;
    }
    function agrupar() {
      const bs = editables();
      if (bs.length < 2) return;
      const g = "g" + NOM.DocCRDT.nuevoId(), pre = prefijoComun(bs);
      // El grupo nuevo queda dentro del grupo donde ya estaban todas (si había uno).
      doc().lote(() => bs.forEach((b) => { const r = gruposDe(b); doc().cambiar(b.id, { grupos: pre.concat([g], r.slice(pre.length)), grupo: null }); }));
      sel = new Set(miembrosHasta(Object.assign({}, bs[0], { grupos: pre.concat([g]) }), pre.length));
      render();
      aviso(pre.length ? "Agrupado dentro de su grupo. Ctrl+Mayús+G para desagrupar." : "Agrupado: se mueven juntos. Ctrl+Mayús+G para desagrupar.", { ms: 2600 });
    }
    /** Desagrupar quita solo el nivel de arriba: los grupos de adentro se conservan. */
    function desagrupar() {
      const bs = editables().filter((b) => gruposDe(b).length);
      if (!bs.length) return;
      const pre = prefijoComun(bs);
      doc().lote(() => bs.forEach((b) => {
        const r = gruposDe(b).slice();
        if (pre.length) r.splice(pre.length - 1, 1); else r.shift();
        doc().cambiar(b.id, { grupos: r.length ? r : null, grupo: null });
      }));
      render();
    }
    function alinear(modo) {
      const bs = editables();
      if (!bs.length) return;
      const ref = bs.length > 1 ? cajaDe(bs) : acotado ? { x: 0, y: 0, w: W(), h: H() } : null;
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
      const bs = seleccionados().filter((b) => puedoEditar(b));
      if (!bs.length) { const m = motivoAjeno(seleccionados()[0]); if (m) aviso(m, { tipo: "info" }); return; }
      const todos = bs.every((b) => b.bloqueado);
      doc().lote(() => bs.forEach((b) => doc().cambiar(b.id, { bloqueado: todos ? null : true })));
      render();
    }
    function seleccionarTodo() { seleccionar(bloques().filter((b) => b.tipo !== "conector").map((b) => b.id)); }

    // ------------------------------------------------------------ 1.3 cuentagotas
    const colorDe = (b) => (!b ? null : b.tipo === "forma" ? (esLinea(b.figura) ? b.borde || "#4A4854" : b.relleno === false ? null : b.color || "#E7E5EE") : b.tipo === "texto" ? b.tColor || null : null);
    /** Toma un color: con EyeDropper (Chrome de computadora) de cualquier punto; si no, tocando otra figura. */
    function iniciarGotero(alElegir, como) {
      if (como === "pantalla" && window.EyeDropper) { new window.EyeDropper().open().then((r) => alElegir(String(r.sRGBHex).toUpperCase())).catch(() => {}); return; }
      gotero = (c) => alElegir(c);
      capa.classList.add("gotero");
      aviso("Toca la figura de la que quieres copiar el color", { ms: 3200 });
    }

    // ------------------------------------------------------------ barra contextual (como la de Canva)
    /** 8.4 Opciones de la flecha elegida: color, texto, grosor, estilo, puntas y forma. */
    function pintarBarraConector() {
      const c = doc().bloque(selConector) || {};
      const btn = (a, i, t) => `<button class="icono-btn" data-a="${a}" aria-label="${esc(t.split("|")[0])}" data-micro="${esc(t)}">${i}</button>`;
      if (!puedoEditar(c)) { barra.innerHTML = `<span class="lz-ajeno">${ico("lock", "ico-s")} ${esc(motivoAjeno(c) || "")}</span>`; barra.hidden = false; return; }
      barra.innerHTML = [
        `<button class="lz-color" data-a="c-color" aria-label="Color de la flecha" data-micro="Color de la flecha" style="--c:${esc(c.color || (acotado ? "#4A4854" : "var(--tinta-2)"))}"><span></span></button>`,
        btn("c-texto", ico("type"), "Texto de la flecha|En medio o cerca de cada punta (1, N…). También con doble clic."),
        btn("c-grosor", ico("minus"), "Grosor"),
        btn("c-estilo", ico("square-dashed"), "Estilo|Sólida, con guiones o con puntos."),
        btn("c-puntas", ico("arrow-left-right"), "Puntas|Dónde va la punta y de qué tipo (herencia, composición…)."),
        btn("c-ruta", ico(c.ruta === "codo" ? "corner-down-right" : c.ruta === "curva" ? "spline" : "move-right"), "Forma|Recta, en codo o curva."),
        btn("c-invertir", ico("repeat"), "Cambiar la dirección"),
        '<span class="sep"></span>',
        btn("c-eliminar", ico("trash-2"), "Eliminar|Supr"),
      ].join("");
      barra.hidden = false;
    }
    function cambiarConector(campos, id) {
      id = id || selConector;
      if (!id || !doc().vivo(id) || ed.soloLectura) return;
      doc().cambiar(id, campos, { grupo: "flecha-" + id });
      render();
    }
    function menuPuntas(ancla, c, id) {
      NOM.menu(ancla, [{ titulo: "Dónde" }, ...PUNTAS.map(([v, t, i]) => ({ texto: t, icono: i, marcado: (c.puntas || "fin") === v, fn: () => cambiarConector({ puntas: v === "fin" ? null : v }, id) })),
        "-", { titulo: "Tipo de punta" }, ...TIPOS_PUNTA.map(([v, t]) => ({ texto: t, marcado: (c.tipoPunta || "triangulo") === v, fn: () => cambiarConector({ tipoPunta: v === "triangulo" ? null : v, puntas: (c.puntas || "fin") === "ninguna" ? null : c.puntas || null }, id) }))]);
    }
    function accionConector(a, ancla) {
      const id = selConector, c = doc().bloque(id);
      if (!c) return;
      switch (a) {
        case "color": paletaColores(ancla, c.color, (col) => cambiarConector({ color: col || null }, id), { titulo: "Color de la flecha", sinColor: "Automático" }); break;
        case "texto": editarEtiqueta(id); break;
        case "grosor": deslizador(ancla, "Grosor", +c.grosor || 2, 1, 12, 1, " px", (v) => cambiarConector({ grosor: v === 2 ? null : v }, id)); break;
        case "estilo": NOM.menu(ancla, ESTILOS_FLECHA.map(([v, t, i]) => ({ texto: t, icono: i, marcado: (c.estilo || "solido") === v, fn: () => cambiarConector({ estilo: v === "solido" ? null : v }, id) }))); break;
        case "puntas": menuPuntas(ancla, c, id); break;
        case "ruta": NOM.menu(ancla, RUTAS.map(([v, t, i]) => ({ texto: t, icono: i, marcado: (c.ruta || "recta") === v, fn: () => cambiarConector({ ruta: v === "recta" ? null : v }, id) }))); break;
        case "invertir": cambiarConector({ desde: c.hasta, hasta: c.desde, etqIni: c.etqFin || null, etqFin: c.etqIni || null }, id); break;
        case "eliminar": eliminar(); break;
      }
    }
    /** Texto de la flecha: en medio y, si se quiere, cerca de cada punta (cardinalidad 1, N, *…). */
    function editarEtiqueta(id) {
      const c = doc().bloque(id);
      if (!c || ed.soloLectura) return;
      if (!puedoEditar(c)) { aviso(motivoAjeno(c), { tipo: "info" }); return; }
      const cuerpo = html(`<form class="col">
        <div class="campo"><label for="fl-m">En medio</label><div class="entrada"><input id="fl-m" data-k="etiqueta" maxlength="80" placeholder="Por ejemplo: sí, no, tiene, después de…" value="${esc(c.etiqueta || "")}" autocomplete="off"></div></div>
        <div class="fila" style="gap:10px"><div class="campo crece"><label for="fl-i">Cerca del inicio</label><div class="entrada"><input id="fl-i" data-k="etqIni" maxlength="12" placeholder="1" value="${esc(c.etqIni || "")}" autocomplete="off"></div></div>
        <div class="campo crece"><label for="fl-f">Cerca del final</label><div class="entrada"><input id="fl-f" data-k="etqFin" maxlength="12" placeholder="N" value="${esc(c.etqFin || "")}" autocomplete="off"></div></div></div>
        <p class="suave chico" style="margin:0">Los textos de las puntas sirven para la cardinalidad (1, N, 0..*) en diagramas de clases y de entidad-relación.</p></form>`);
      const pie = html(`<div style="display:contents"><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si>Listo</button></div>`);
      const h = NOM.hoja({ titulo: "Texto de la flecha", icono: "type", cuerpo, pie });
      setTimeout(() => { const x = $("#fl-m", cuerpo); if (x) { x.focus(); x.select(); } }, 60);
      const guardar = (e) => {
        e && e.preventDefault();
        const campos = {};
        $$("[data-k]", cuerpo).forEach((x) => (campos[x.dataset.k] = x.value.trim() || null));
        h.cerrar();
        if (doc().vivo(id)) { doc().cambiar(id, campos); render(); }
      };
      cuerpo.onsubmit = guardar;
      $("[data-si]", pie).onclick = guardar;
      $("[data-no]", pie).onclick = () => h.cerrar();
    }
    function accionesConector() {
      const id = selConector, c = doc().bloque(id) || {};
      const cc = (campos) => () => cambiarConector(campos, id);
      const tonos = COLORES.filter((_, i) => [4, 8, 12, 19, 23, 27].includes(i));
      return [
        { texto: "Texto", icono: "type", fn: () => editarEtiqueta(id) },
        { texto: "Color", icono: "palette", sub: tonos.map((col) => ({ texto: col, corto: " ", color: col, mantener: true, fn: cc({ color: col }) })) },
        { texto: "Eliminar", icono: "trash-2", fn: eliminar },
        { texto: "Grosor", icono: "minus", sub: [1, 2, 3, 5, 8].map((g) => ({ texto: g + " px", marcado: (+c.grosor || 2) === g, fn: cc({ grosor: g === 2 ? null : g }) })) },
        { texto: "Estilo", icono: "square-dashed", sub: ESTILOS_FLECHA.map(([v, t, i]) => ({ texto: t, icono: i, marcado: (c.estilo || "solido") === v, fn: cc({ estilo: v === "solido" ? null : v }) })) },
        { texto: "Puntas", icono: "arrow-left-right", sub: PUNTAS.map(([v, t, i]) => ({ texto: t, icono: i, marcado: (c.puntas || "fin") === v, fn: cc({ puntas: v === "fin" ? null : v }) }))
          .concat([{ texto: "Tipo de punta", corto: "Tipo", icono: "shapes", sub: TIPOS_PUNTA.map(([v, t]) => ({ texto: t, marcado: (c.tipoPunta || "triangulo") === v, fn: cc({ tipoPunta: v === "triangulo" ? null : v }) })) }]) },
        { texto: "Forma", icono: "spline", sub: RUTAS.map(([v, t, i]) => ({ texto: t, icono: i, marcado: (c.ruta || "recta") === v, fn: cc({ ruta: v === "recta" ? null : v }) })) },
        { texto: "Invertir", icono: "repeat", fn: cc({ desde: c.hasta, hasta: c.desde, etqIni: c.etqFin || null, etqFin: c.etqIni || null }) },
      ];
    }
    function pintarBarra() {
      if (ed.soloLectura || gesto || editando) { barra.hidden = true; return; }
      if (!sel.size) { if (selConector && doc().vivo(selConector)) pintarBarraConector(); else barra.hidden = true; return; }
      const bs = seleccionados();
      if (!bs.length) { barra.hidden = true; return; }
      const formas = bs.filter((b) => b.tipo === "forma"), imgs = bs.filter((b) => b.tipo === "imagen"), textos = bs.filter((b) => b.tipo === "texto");
      const b0 = bs[0], bloq = bs.every((b) => b.bloqueado || !puedoEditar(b));
      if (bs.every((b) => !puedoEditar(b))) {
        barra.innerHTML = `<span class="lz-ajeno">${ico(b0.maestro ? "crown" : "lock", "ico-s")} ${esc(motivoAjeno(b0))}</span>` + (NOM.comentarios ? btn("comentar", ico("message-square"), "Comentar") : "");
        barra.hidden = false;
        return;
      }
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
          imgs.length === 1 && imgs[0].src ? btn("recortar", ico("scissors"), "Recortar") + btn("mascara", ico("shapes"), "Forma|La foto dentro de un círculo, estrella, corazón…") + btn("filtros", ico("wand-sparkles"), "Filtros|Brillo, contraste, blanco y negro…") : "",
          bs.length === 1 && ((b0.tipo === "tabla" && b0.enDiapo) || (b0.tipo === "grafica" && !b0.hoja)) ? btn("datos", ico("table"), "Editar datos") : "",
          bs.length === 1 && b0.tipo === "icono" ? btn("icono-color", `<span class="lz-color" style="--c:${esc(b0.color || "#2B2A33")}"><span></span></span>`, "Color del ícono") : "",
          '<span class="sep"></span>',
          btn("posicion", ico("al-centro-h"), "Posición|Alinear, distribuir y orden de capas."),
          btn("girar", ico("rotate-cw"), "Girar 90°"),
          btn("voltear", ico("flip-horizontal"), "Voltear"),
          bs.length > 1 ? btn("agrupar", ico("group"), "Agrupar|También dentro de otro grupo.|Ctrl+G") : "",
          bs.some((b) => gruposDe(b).length) ? btn("desagrupar", ico("ungroup"), "Desagrupar|Quita solo el nivel de arriba.|Ctrl+Mayús+G") : "",
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
      if (b.dataset.a.startsWith("c-")) { accionConector(b.dataset.a.slice(2), b); return; }
      const bs = editables(), b0 = bs[0] || {};
      const grupo = { grupo: "barra-" + [...sel].join(",") };
      switch (b.dataset.a) {
        case "relleno": paletaColores(b, b0.color, (c) => cambiarSel(c ? { color: c, relleno: true } : { relleno: false }, grupo), { titulo: "Relleno", sinColor: "Sin relleno", gotero: iniciarGotero }); break;
        case "borde-color": paletaColores(b, b0.borde, (c) => cambiarSel({ borde: c || "#4A4854" }, grupo), { titulo: "Color de la línea", gotero: iniciarGotero }); break;
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
        case "comentar": NOM.comentarios && NOM.comentarios.nuevo(ed); break;
        case "recortar": recortarImagen(b0.id); break;
        case "mascara": mascaraImagen(b, b0.id); break;
        case "filtros": filtrosImagen(b, b0.id); break;
        case "datos": abrirBloque(b0.id); break;
        case "icono-color": paletaColores(b, b0.color, (c) => {
          if (!c) return;
          const ics = editables().filter((x) => x.tipo === "icono");
          cambiarSel({ color: c }, grupo);
          ics.forEach((x) => NOM.diapo.iconoPng(iconoSeguro(x), c, x.grosor).then((png) => { if (png && doc().vivo(x.id)) doc().cambiar(x.id, { png }, { deshacible: false }); }));
        }, { titulo: "Color del ícono" }); break;
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
    /** 8.3 Recortar una imagen de la diapositiva (lo de fuera se esconde, el archivo no cambia). */
    function recortarImagen(id) {
      const b = doc().bloque(id);
      if (!b || !b.src) return;
      const r = Object.assign({ iz: 0, d: 0, s: 0, i: 0 }, b.recorte || {});
      const cuerpo = html(`<form class="col"><div class="wd-recorte-vista"><div class="lz-recorte-prev" style="width:280px;height:${Math.round(280 * ((b.h || 1) / (b.w || 1)))}px"></div></div>
        ${[["s", "Arriba"], ["i", "Abajo"], ["iz", "Izquierda"], ["d", "Derecha"]].map(([k, t]) => `<div class="lz-desl"><span>${t}</span><input type="range" min="0" max="45" step="1" value="${Math.round(r[k] * 100)}" data-k="${k}"><output>${Math.round(r[k] * 100)}%</output></div>`).join("")}</form>`);
      const pie = html(`<div style="display:contents"><button class="btn" type="button" data-quitar>Sin recorte</button><span class="crece"></span><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si>Recortar</button></div>`);
      const hj = NOM.hoja({ titulo: "Recortar imagen", icono: "scissors", cuerpo, pie });
      const prev = $(".lz-recorte-prev", cuerpo);
      const ver = () => { prev.innerHTML = imagenLibre(Object.assign({}, b, { recorte: r, mascara: null, w: 280, h: prev.offsetHeight })); };
      ver();
      $$("[data-k]", cuerpo).forEach((x) => x.addEventListener("input", () => { r[x.dataset.k] = +x.value / 100; x.nextElementSibling.textContent = x.value + "%"; ver(); }));
      $("[data-no]", pie).onclick = () => hj.cerrar();
      $("[data-quitar]", pie).onclick = () => { doc().cambiar(id, { recorte: null }); hj.cerrar(); render(); };
      $("[data-si]", pie).onclick = (e) => {
        e.preventDefault();
        // El marco toma la forma de lo que queda (no se estira la foto).
        const antes = b.recorte || { iz: 0, d: 0, s: 0, i: 0 };
        const fw0 = 1 - (antes.iz || 0) - (antes.d || 0), fh0 = 1 - (antes.s || 0) - (antes.i || 0), fw = 1 - r.iz - r.d, fh = 1 - r.s - r.i;
        const w = Math.round((b.w / fw0) * fw), h = Math.round((b.h / fh0) * fh);
        doc().cambiar(id, { recorte: r.iz || r.d || r.s || r.i ? r : null, w, h });
        hj.cerrar(); render();
      };
    }
    function filtrosImagen(ancla, id) {
      const b = doc().bloque(id);
      if (!b) return;
      const f = Object.assign({ brillo: 100, contraste: 100, saturacion: 100, gris: 0, sepia: 0, desenfoque: 0 }, b.filtros || {});
      const PRE = { normal: { brillo: 100, contraste: 100, saturacion: 100, gris: 0, sepia: 0, desenfoque: 0 }, bn: { gris: 100 }, sepia: { sepia: 80 }, vivido: { saturacion: 160, contraste: 110 }, suave: { brillo: 108, contraste: 90, saturacion: 80 }, oscuro: { brillo: 80, contraste: 115 } };
      const p = panel(ancla, `<div class="fila lz-fila" style="flex-wrap:wrap">${[["normal", "Normal"], ["bn", "B/N"], ["sepia", "Sepia"], ["vivido", "Vívido"], ["suave", "Suave"], ["oscuro", "Oscuro"]].map(([k, t]) => `<button class="btn chico" data-pre="${k}">${t}</button>`).join("")}</div>
        ${[["brillo", "Brillo", 30, 170, "%"], ["contraste", "Contraste", 30, 170, "%"], ["saturacion", "Color", 0, 200, "%"], ["gris", "Gris", 0, 100, "%"], ["sepia", "Sepia", 0, 100, "%"], ["desenfoque", "Desenfoque", 0, 10, " px"]].map(([k, t, mi, ma, u]) => `<div class="lz-desl"><span>${t}</span><input type="range" min="${mi}" max="${ma}" step="1" value="${f[k]}" data-f="${k}"><output>${f[k]}${u}</output></div>`).join("")}`, { titulo: "Filtros" });
      const guardar = () => { const neutro = f.brillo === 100 && f.contraste === 100 && f.saturacion === 100 && !f.gris && !f.sepia && !f.desenfoque; doc().cambiar(id, { filtros: neutro ? null : Object.assign({}, f) }, { grupo: "filtros-" + id }); render(); };
      $$("[data-f]", p).forEach((x) => x.addEventListener("input", () => { f[x.dataset.f] = +x.value; x.nextElementSibling.textContent = x.value + (x.dataset.f === "desenfoque" ? " px" : "%"); guardar(); }));
      $$("[data-pre]", p).forEach((x) => (x.onclick = () => { Object.assign(f, PRE.normal, PRE[x.dataset.pre]); $$("[data-f]", p).forEach((y) => { y.value = f[y.dataset.f]; y.nextElementSibling.textContent = f[y.dataset.f] + (y.dataset.f === "desenfoque" ? " px" : "%"); }); guardar(); }));
    }
    const MASCARAS = [["", "Sin forma (rectángulo)"], ["elipse", "Círculo u óvalo"], ["rect", "Esquinas redondeadas"], ["rombo", "Rombo"], ["triangulo", "Triángulo"], ["hexagono", "Hexágono"], ["estrella", "Estrella"], ["corazon", "Corazón"], ["nube", "Nube"]];
    function mascaraImagen(ancla, id) {
      const b = doc().bloque(id);
      if (!b) return;
      const p = panel(ancla, `<div class="lz-figuras">${MASCARAS.map(([f, t]) => `<button data-m="${f}" aria-label="${esc(t)}" title="${esc(t)}" aria-pressed="${(b.mascara || "") === f}"><svg viewBox="-3 -3 46 36" aria-hidden="true">${f ? `<path d="${ruta(f, 40, 30, 7)}" fill="#CFE0FF" stroke="#3D72F2" stroke-width="2"/>` : `<rect width="40" height="30" fill="#CFE0FF" stroke="#3D72F2" stroke-width="2"/>`}</svg></button>`).join("")}</div>`, { titulo: "La foto dentro de una forma" });
      p.addEventListener("click", (e) => { const x = e.target.closest("[data-m]"); if (!x) return; p.cerrar(); doc().cambiar(id, { mascara: x.dataset.m || null }); render(); });
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
      if (acotado) { xs.push(0, W() / 2, W()); ys.push(0, H() / 2, H()); }
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
      const L = acotado ? 0 : -20000, R = acotado ? W() : 20000, T = acotado ? 0 : -20000, D = acotado ? H() : 20000;
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
      if (punteros.size === 2) {   // pellizco para hacer zoom (en la presentación: para ver la mesa de trabajo)
        const [a, b] = [...punteros.values()];
        if (gesto && gesto.tipo === "mover" && gesto.movido) render();
        gesto = { tipo: "pellizco", d: Math.hypot(a.x - b.x, a.y - b.y), z: acotado ? zoomD : vista.z };
        return;
      }
      const p = aMundo(e);
      if (e.button === 1 || espacio) {
        e.preventDefault();
        gesto = { tipo: "paneo", x0: e.clientX, y0: e.clientY, v0: acotado ? { ...panD } : { ...vista } };
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
      if (bl && gotero) {
        e.preventDefault();
        const c = colorDe(porId(bl.dataset.id)), f = gotero;
        gotero = null; capa.classList.remove("gotero");
        if (c) { f(c); aviso("Color copiado", { tipo: "ok", ms: 1400 }); } else aviso("Esa figura no tiene un color que copiar", { tipo: "info" });
        return;
      }
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
        let quitar = null, entrar = null;
        if (multiple && e.pointerType !== "mouse") { if (sel.has(id)) quitar = id; else seleccionar([id], true); }
        else if (!sel.has(id)) seleccionar(id);
        else if (sel.size > 1 && gruposDe(porId(id)).length) entrar = id;
        if (ed.soloLectura) return;
        const bs = editables();
        if (!bs.length) {
          const m = motivoAjeno(porId(id));
          if (m && Date.now() - (finGesto.avisoAjeno || 0) > 2500) { finGesto.avisoAjeno = Date.now(); aviso(m + ": no se puede mover ni cambiar", { tipo: "info", ms: 2400 }); }
          if (entrar) gesto = { tipo: "mover", ids: [], p0: p, b0: {}, caja0: null, movido: false, idClic: id, entrar };
          return;
        }
        gesto = { tipo: "mover", ids: bs.map((b) => b.id), p0: p, b0: Object.fromEntries(bs.map((b) => [b.id, { x: b.x, y: b.y, w: b.w, h: b.h }])), caja0: cajaDe(bs), movido: false, idClic: id, quitar, entrar };
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
      if ((!acotado || zoomD !== 1) && e.pointerType !== "mouse") {
        gesto = { tipo: "paneo", x0: e.clientX, y0: e.clientY, v0: acotado ? { ...panD } : { ...vista }, limpiar: true };
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
        const centro = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top }, k = gesto.z * (Math.hypot(a.x - b.x, a.y - b.y) / gesto.d);
        if (acotado) zoomDiapo(k / zoomD, centro); else zoomEn(k / vista.z, centro);
        return;
      }
      if (gesto.tipo === "paneo" && acotado) {
        panD = { x: gesto.v0.x + e.clientX - gesto.x0, y: gesto.v0.y + e.clientY - gesto.y0 };
        if (Math.abs(e.clientX - gesto.x0) + Math.abs(e.clientY - gesto.y0) > 4) gesto.movido = true;
        aplicarVista(); return;
      }
      if (gesto.tipo === "paneo") {
        vista.x = gesto.v0.x + e.clientX - gesto.x0; vista.y = gesto.v0.y + e.clientY - gesto.y0;
        if (Math.abs(e.clientX - gesto.x0) + Math.abs(e.clientY - gesto.y0) > 4) gesto.movido = true;
        aplicarVista(); return;
      }
      const p = aMundo(e);
      const dx = p.x - (gesto.p0 ? gesto.p0.x : 0), dy = p.y - (gesto.p0 ? gesto.p0.y : 0);
      if (gesto.tipo === "mover") {
        if (!gesto.ids.length) return;
        if (!gesto.movido && Math.abs(dx) + Math.abs(dy) < 3 / zoomActual()) return;
        if (!gesto.movido) { gesto.movido = true; barra.hidden = true; }
        let mx = dx, my = dy;
        // 8.4 Con la cuadrícula prendida, la esquina de lo que se mueve cae en ella (con Alt, libre).
        const g = e.altKey || cuadricula ? null : imantar({ x: gesto.caja0.x + dx, y: gesto.caja0.y + dy, w: gesto.caja0.w, h: gesto.caja0.h }, new Set(gesto.ids));
        if (g) { mx += g.dx; my += g.dy; }
        if (cuadricula && !e.altKey) { mx = aRejilla(gesto.caja0.x + dx) - gesto.caja0.x; my = aRejilla(gesto.caja0.y + dy) - gesto.caja0.y; }
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
        if (cuadricula && !e.altKey && !b0.rot) {
          if (t.includes("e")) nb.w = Math.max(PASO, aRejilla(nb.x + nb.w) - nb.x);
          if (t.includes("s")) nb.h = Math.max(PASO / 2, aRejilla(nb.y + nb.h) - nb.y);
          if (t.includes("w")) { const der = nb.x + nb.w; nb.x = aRejilla(nb.x); nb.w = Math.max(PASO, der - nb.x); }
          if (t.includes("n")) { const ab = nb.y + nb.h; nb.y = aRejilla(nb.y); nb.h = Math.max(PASO / 2, ab - nb.y); }
        }
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
      // 5.2 Segundo toque sobre un grupo ya elegido: entra al grupo de adentro.
      if (g.tipo === "mover" && !g.movido && g.entrar && e.type === "pointerup" && entrarAlGrupo(g.entrar)) { finGesto.ultimo = Date.now(); finGesto.id = g.idClic; return; }
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
    superficie.addEventListener("dblclick", (e) => {
      const cn = e.target.closest("[data-conector]");
      if (cn) { editarEtiqueta(cn.dataset.conector); return; }
      const bl = e.target.closest(".bl"); if (bl) abrirBloque(bl.dataset.id);
    });
    /** Doble clic (o "Editar"): texto, datos de la tabla o gráfica, la imagen de un hueco o la ecuación. */
    async function abrirBloque(id) {
      const b = doc().bloque(id);
      if (!b || ed.soloLectura) return;
      if (!puedoEditar(b)) { aviso(motivoAjeno(b), { tipo: "info" }); return; }
      if (b.tipo === "imagen" && !b.src) { const img = await ed.pedirImagen(); if (img) doc().cambiar(id, { src: img.src }); return; }
      if ((b.tipo === "tabla" && b.enDiapo) || (b.tipo === "grafica" && !b.hoja)) { NOM.diapo.editarDatos({ bloque: b, grafica: b.tipo === "grafica", alGuardar: (c) => { doc().cambiar(id, c); render(); } }); return; }
      if (b.tipo === "ecuacion") { editarEcuacion(id); return; }
      editar(id);
    }
    /** 8.3 Ecuación en la diapositiva (mismo editor que en el texto). */
    function editarEcuacion(id) {
      const b = id ? doc().bloque(id) : null, E = NOM.ecuaciones;
      if (!E) return;
      const cuerpoH = html(`<form class="col"><div class="ecu-vista" data-vista></div>
        <div class="campo"><label>Ecuación</label><div class="entrada"><textarea data-tex rows="2" spellcheck="false">${esc((b && b.tex) || "")}</textarea></div></div>
        <div class="ecu-ayudas">${E.AYUDAS.map(([t, s2, n]) => `<button type="button" data-ins="${esc(t)}" aria-label="${esc(n)}" data-micro="${esc(n)}">${esc(s2)}</button>`).join("")}</div>
        <div class="fila" style="flex-wrap:wrap"><span class="suave chico">Ejemplos:</span>${E.EJEMPLOS.map(([n, t]) => `<button type="button" class="btn chico" data-ej="${esc(t)}">${esc(n)}</button>`).join("")}</div></form>`);
      const pie = html(`<div style="display:contents"><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si>${b ? "Guardar" : "Insertar"}</button></div>`);
      const hj = NOM.hoja({ titulo: "Ecuación", icono: "sigma", cuerpo: cuerpoH, pie, ancha: true });
      const ta = $("[data-tex]", cuerpoH), vista = $("[data-vista]", cuerpoH);
      const ver = () => { vista.innerHTML = ta.value.trim() ? E.html(ta.value, true) : `<span class="suave">Escribe la ecuación o usa los botones</span>`; };
      ver(); ta.addEventListener("input", ver);
      $$("[data-ins]", cuerpoH).forEach((x) => (x.onclick = () => { const t = x.dataset.ins, p = ta.selectionStart; ta.value = ta.value.slice(0, p) + t + ta.value.slice(ta.selectionEnd); const hu = ta.value.indexOf("□", p); if (hu >= 0) ta.setSelectionRange(hu, hu + 1); ta.focus(); ver(); }));
      $$("[data-ej]", cuerpoH).forEach((x) => (x.onclick = () => { ta.value = x.dataset.ej; ver(); }));
      $("[data-no]", pie).onclick = () => hj.cerrar();
      $("[data-si]", pie).onclick = (ev) => {
        ev.preventDefault();
        const tex = ta.value.replace(/□/g, "").trim();
        hj.cerrar();
        if (!tex) return;
        if (b) doc().cambiar(id, { tex }); else crear("ecuacion", { tex, tTam: 32 });
      };
    }
    if (!acotado) {
      superficie.addEventListener("wheel", (e) => {
        e.preventDefault();
        const r = capa.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey) zoomEn(Math.exp(-e.deltaY * 0.0022), { x: e.clientX - r.left, y: e.clientY - r.top });
        else { vista.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX; vista.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY; aplicarVista(); }
      }, { passive: false });
    } else {
      // 5.1 Ctrl + rueda aleja o acerca la diapositiva; ya alejada (o acercada), la rueda mueve la vista.
      superficie.addEventListener("wheel", (e) => {
        const r = capa.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomDiapo(Math.exp(-e.deltaY * 0.0022), { x: e.clientX - r.left, y: e.clientY - r.top }); return; }
        if (zoomD === 1) return;
        e.preventDefault();
        panD.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX; panD.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY; aplicarVista();
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
      const tonos = COLORES.filter((_, i) => [0, 8, 12, 19, 23, 27].includes(i));
      const colorTexto = tonos.map((c) => ({ texto: c, corto: " ", color: c, mantener: true, fn: () => cambiarSel((b) => (conTexto.includes(b) ? { tColor: c } : null), grupo) }))
        .concat([{ texto: "Copiar color de otra figura", corto: "Copiar", icono: "pipette", fn: () => iniciarGotero((c) => cambiarSel((b) => (conTexto.includes(b) ? { tColor: c } : null), grupo), "figura") }]);
      // 1.3 Cuentagotas con el dedo: tocar otra figura copia su color (sirve igual con el mouse).
      const gotas = { texto: "Copiar color de otra figura", corto: "Copiar", icono: "pipette", fn: () => iniciarGotero((c) => colorear(c), "figura") };
      const colorSub = formas.length
        ? tonos.map((c) => ({ texto: c, corto: " ", color: c, mantener: true, fn: () => colorear(c) })).concat([gotas], conTexto.length ? [{ texto: "Color del texto", corto: "Texto", icono: "baseline", sub: colorTexto }] : [])
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
          // Un grupo entero elegido (lo normal al tocarlo) ofrece desagrupar; varias cosas sueltas, agrupar.
          (varios && !grupoEntero(bs)) ? { texto: "Agrupar", icono: "group", fn: agrupar }
            : { texto: "Desagrupar", icono: "ungroup", off: !bs.some((b) => gruposDe(b).length), fn: desagrupar },
          { texto: bloq ? "Desbloquear" : "Bloquear", icono: bloq ? "lock-open" : "lock", fn: bloquear },
          { texto: "Copiar", icono: "clipboard-copy", fn: () => copiar(false) },
          { texto: "Cortar", icono: "scissors", off: bloq, fn: () => copiar(true) },
          { texto: "Pegar", icono: "clipboard-paste", off: !NOM._portaFiguras, fn: pegar },
          (bs.length === 1 && b0.tipo === "imagen" && b0.src) ? { texto: "Imagen", icono: "image", sub: [
            { texto: "Recortar", icono: "scissors", fn: () => recortarImagen(b0.id) },
            { texto: "Forma", icono: "shapes", fn: () => mascaraImagen({ x: innerWidth / 2, y: innerHeight / 2 }, b0.id) },
            { texto: "Filtros", icono: "wand-sparkles", fn: () => filtrosImagen({ x: innerWidth / 2, y: innerHeight / 2 }, b0.id) },
            { texto: "Cambiar imagen", corto: "Cambiar", icono: "image", fn: async () => { const img = await ed.pedirImagen(); if (img) { doc().cambiar(b0.id, { src: img.src }); render(); } } }] }
            : { texto: "Comentar", icono: "message-square", off: !NOM.comentarios, fn: () => NOM.comentarios.nuevo(ed) },
          { texto: "Otras", icono: "more-vertical", sub: [
            { texto: (b0.tipo === "tabla" && b0.enDiapo) || (b0.tipo === "grafica" && !b0.hoja) ? "Editar datos" : "Editar texto", icono: "type", off: !(unico() && (conTexto.length === 1 || (b0.tipo === "tabla" && b0.enDiapo) || (b0.tipo === "grafica" && !b0.hoja) || b0.tipo === "ecuacion")), fn: () => abrirBloque(unico()) },
            { texto: "Comentar", icono: "message-square", off: !NOM.comentarios || (bs.length !== 1 || b0.tipo !== "imagen"), fn: () => NOM.comentarios.nuevo(ed) },
            { texto: "Elegir todo", icono: "layout-grid", fn: seleccionarTodo },
            { texto: "Capas", icono: "layers", fn: () => capas.abrir() },
            ...(ed.esPropietario ? [
              { texto: "Asignar a…", icono: "user-check", fn: asignarSeleccion },
              { texto: bs.every((b) => b.maestro) ? "Quitar de la plantilla" : "Fijar como plantilla del maestro", corto: bs.every((b) => b.maestro) ? "Liberar" : "Plantilla", icono: "crown", fn: plantillaMaestro },
            ] : [])] }] },
      ];
    }
    // ------------------------------------------------------------ 3.5 asignar y 5.4 plantilla del maestro (solo el propietario)
    async function asignarSeleccion() {
      const bs = seleccionados();
      if (!bs.length) return;
      const uid = await ed.elegirPersona(bs.length > 1 ? `Asignar ${bs.length} elementos a…` : "Asignar a…", bs[0].dueno || null);
      if (uid == null) return;
      doc().lote(() => bs.forEach((b) => doc().cambiar(b.id, { dueno: uid || null })));
      render();
      aviso(uid ? `Asignado a ${ed.nombreDe(uid)}` : "Ya nadie es dueño", { tipo: "ok" });
    }
    async function asignarPagina(p) {
      const uid = await ed.elegirPersona("Asignar la diapositiva a…", duenoPagina(p));
      if (uid == null) return;
      doc().cambiar("_doc", { ["dueno:" + p]: uid || null });
      render();
      aviso(uid ? `La diapositiva es de ${ed.nombreDe(uid)}: solo esa persona (y tú) la cambian` : "Diapositiva libre", { tipo: "ok" });
    }
    function plantillaMaestro() {
      const bs = seleccionados();
      if (!bs.length || !ed.esPropietario) return;
      const quitar = bs.every((b) => b.maestro);
      doc().lote(() => bs.forEach((b) => doc().cambiar(b.id, quitar ? { maestro: null, bloqueado: null } : { maestro: true, bloqueado: true })));
      render();
      aviso(quitar ? "Ya no es parte de la plantilla" : "Plantilla del maestro: los demás no la pueden mover, cambiar ni desbloquear", { tipo: "ok", ms: 3200 });
    }

    // ------------------------------------------------------------ 5.3 panel de capas
    const capas = (() => {
      let abierto = false, cont = null;
      const nombre = (b) => {
        const t = (b.tipo === "forma" ? b.texto : b.tipo === "texto" ? NOM.formatos.textoPlano(b.html) : "") || "";
        const base = { forma: (FIGURAS.find((f) => f[0] === (b.figura || "rect")) || [0, "Figura"])[1], texto: "Texto", imagen: "Imagen", tabla: "Tabla" }[b.tipo] || b.tipo;
        return t.trim() ? `${base}: ${t.trim().slice(0, 40)}` : base;
      };
      const icono = (b) => ({ forma: "shapes", texto: "type", imagen: "image", tabla: "table" }[b.tipo] || "square");
      function lista() {
        return posiciones(doc().deLaPagina(ed.pagina).filter((b) => b.tipo !== "conector"), acotado).sort((a, b) => (b.z || 0) - (a.z || 0));
      }
      function pintar() {
        if (!abierto || !cont) return;
        const l = lista();
        $("[data-capas]", cont).innerHTML = l.length ? l.map((b) => {
          const aj = motivoAjeno(b);
          return `<div class="capa-fila${sel.has(b.id) ? " sel" : ""}${b.oculto ? " oculta" : ""}" data-c="${esc(b.id)}">
            <button class="icono-btn chico capa-asa" data-asa aria-label="Mover de capa" ${aj ? "disabled" : ""}>${ico("grip-vertical", "ico-s")}</button>
            <button class="capa-nombre crece" data-elegir>${ico(icono(b), "ico-s")}<span class="recorta">${esc(nombre(b))}</span>${b.dueno ? `<span class="chip chico" style="--c:${esc(ed.colorDe(b.dueno))}">${esc(ed.nombreDe(b.dueno))}</span>` : ""}${b.maestro ? ico("crown", "ico-s") : ""}${fuera(b) ? `<span class="chip chico">fuera</span>` : ""}</button>
            <button class="icono-btn chico" data-ojo aria-label="${b.oculto ? "Mostrar" : "Ocultar"}" aria-pressed="${!!b.oculto}" ${aj ? "disabled" : ""} data-micro="${b.oculto ? "Mostrar" : "Ocultar"}|Lo oculto no se ve, no se presenta ni se exporta.">${ico(b.oculto ? "eye-off" : "eye", "ico-s")}</button>
            <button class="icono-btn chico" data-candado aria-label="${b.bloqueado ? "Desbloquear" : "Bloquear"}" aria-pressed="${!!b.bloqueado}" ${aj ? "disabled" : ""}>${ico(b.bloqueado ? "lock" : "lock-open", "ico-s")}</button></div>`;
        }).join("") : `<p class="suave">Esta ${acotado ? "diapositiva" : "página"} está vacía.</p>`;
      }
      function reordenar(id, destino) {
        const l = lista();
        const i = l.findIndex((b) => b.id === id);
        if (i < 0 || destino === i) return;
        const [b] = l.splice(i, 1);
        l.splice(destino, 0, b);
        const n = l.length;
        doc().lote(() => l.forEach((x, k) => { if (puedoEditar(x) && (x.z || 0) !== n - k) doc().cambiar(x.id, { z: n - k }); }));
        render();
      }
      function abrir() {
        const lateral = $("[data-lateral]", ed.vista);
        if (abierto) { cerrar(); return; }
        abierto = true;
        lateral.innerHTML = `<div class="cajon capas-cajon"><div class="cajon-cab"><h3>${ico("layers", "ico-s")} Capas</h3><button class="icono-btn" data-cerrar aria-label="Cerrar capas">${ico("x")}</button></div>
          <p class="suave chico" style="padding:0 16px;font-weight:650">Arriba lo que está al frente. Arrastra de la manija para cambiar el orden.</p>
          <div class="cajon-cuerpo" data-capas></div></div>`;
        cont = lateral.firstElementChild;
        $("[data-cerrar]", cont).onclick = cerrar;
        cont.addEventListener("click", (e) => {
          const f = e.target.closest("[data-c]");
          if (!f) return;
          const id = f.dataset.c, b = doc().bloque(id);
          if (e.target.closest("[data-ojo]")) { doc().cambiar(id, { oculto: b.oculto ? null : true }); if (!b.oculto) { sel.delete(id); } render(); return; }
          if (e.target.closest("[data-candado]")) { doc().cambiar(id, { bloqueado: b.bloqueado ? null : true }); render(); return; }
          if (e.target.closest("[data-elegir]") && !b.oculto) seleccionar(id);
        });
        // Arrastrar de la manija (dedo o mouse) para cambiar el orden de las capas.
        cont.addEventListener("pointerdown", (e) => {
          const asa = e.target.closest("[data-asa]");
          if (!asa || asa.disabled) return;
          e.preventDefault();
          const fila = asa.closest("[data-c]"), filas = $$("[data-c]", cont), y0 = e.clientY, i0 = filas.indexOf(fila);
          const alto = fila.getBoundingClientRect().height + 4;
          let destino = i0;
          fila.classList.add("arrastrando");
          asa.setPointerCapture(e.pointerId);
          const mover = (ev) => {
            const d = ev.clientY - y0;
            fila.style.transform = `translateY(${d}px)`;
            destino = Math.max(0, Math.min(filas.length - 1, i0 + Math.round(d / alto)));
            filas.forEach((x, k) => { if (x !== fila) x.style.transform = k > i0 && k <= destino ? `translateY(${-alto}px)` : k < i0 && k >= destino ? `translateY(${alto}px)` : ""; });
          };
          const soltar = () => {
            asa.removeEventListener("pointermove", mover); asa.removeEventListener("pointerup", soltar); asa.removeEventListener("pointercancel", soltar);
            filas.forEach((x) => (x.style.transform = ""));
            fila.classList.remove("arrastrando");
            reordenar(fila.dataset.c, destino);
          };
          asa.addEventListener("pointermove", mover); asa.addEventListener("pointerup", soltar); asa.addEventListener("pointercancel", soltar);
        });
        pintar();
      }
      function cerrar() { abierto = false; cont = null; const l = $("[data-lateral]", ed.vista); if (l && l.querySelector(".capas-cajon")) l.innerHTML = ""; }
      return { abrir, pintar, cerrar, abierto: () => abierto };
    })();

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
      // 8.4 Ruedita de una flecha.
      const cn = e.target.closest && e.target.closest("[data-conector]");
      if (cn && doc().vivo(cn.dataset.conector)) {
        terminarEdicion(); sel = new Set(); selConector = cn.dataset.conector; ed.seleccionar(null); render();
        const l = accionesConector(); l.titulo = "Flecha";
        return l;
      }
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
        { texto: "Más figuras", corto: "Figuras", icono: "shapes", sub: [["rombo", "Rombo", "diamond"], ["estrella", "Estrella", "star"], ["flecha", "Flecha", "arrow-right"], ["burbuja", "Burbuja", "message-square"], ["linea-flecha", "Línea", "minus"], ["corazon", "Corazón", "heart"]].map(([f, t, i]) => ({ texto: t, icono: i, fn: en((q) => crear("forma", { figura: f }, q)) })).concat([
          { texto: "Todas las figuras (UML, entidad-relación, redes)", corto: "Todas", icono: "shapes", fn: () => menuFiguras(lienzoApi, { x: e.clientX, y: e.clientY }, null, p) },
          { texto: "Diagramas listos", corto: "Listos", icono: "workflow", fn: () => NOM.diagramas && NOM.diagramas.elegir(lienzoApi, p) }]) },
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
      if (e.key === "Escape") { if (gotero) { gotero = null; capa.classList.remove("gotero"); } herramienta = null; origenEnlace = null; multiple = false; opc.alUsarHerramienta && opc.alUsarHerramienta(); if (sel.size) { sel = new Set(); ed.seleccionar(null); render(); } return; }
      if (e.key === "Enter" && unico()) { e.preventDefault(); abrirBloque(unico()); return; }
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

    // Los nombres de los dueños llegan con los miembros del espacio.
    const hayDuenos = () => doc().vivos().some((b) => b.dueno) || Object.keys(doc().doc()).some((k) => k.startsWith("dueno:") && doc().valor("_doc", k));
    if (hayDuenos() && ed.cargarMiembros) ed.cargarMiembros().then(() => render());

    const lienzoApi = {
      capas, asignarPagina, duenoPagina, paginaAjena, crearPreset, insertarBloques, fijarCuadricula, cuadricula: () => cuadricula,
      punto: () => (acotado ? { x: W() / 2, y: H() / 2 } : centroVista()), acotado,
      /** 3.4 Resalta los bloques que cambiaron otros (null lo quita). */
      resaltar(c) { resaltados = new Set(c && c.cambios ? c.cambios.bloques || [] : []); render(); },
      /** 7 Marca los bloques con comentarios abiertos. */
      marcarComentarios(lista) { comentados = new Map(); (lista || []).forEach((c) => { if (!c.resuelto && c.ancla && c.ancla.tipo === "bloque") comentados.set(c.ancla.id, (comentados.get(c.ancla.id) || 0) + 1); }); render(); },
      anclaComentario() { const b = porId(unico() || [...sel][0]); if (!b) return null; const t = b.tipo === "forma" ? b.texto : b.tipo === "texto" ? NOM.formatos.textoPlano(b.html) : ""; return { tipo: "bloque", id: b.id, pagina: ed.pagina, cita: (t || ({ forma: "Figura", imagen: "Imagen", tabla: "Tabla", texto: "Texto" }[b.tipo] || "")).slice(0, 120) }; },
      irABloque(id) { if (!porId(id)) return false; seleccionar(id); return true; },
      render, crear, imagen, eliminar, duplicar, abrirBloque, editarEcuacion, capaZ: (arriba) => capaZ(arriba === true ? "frente" : arriba === false ? "fondo" : arriba), colorear, ajustar, alinear, distribuir, agrupar, desagrupar, bloquear, rotar, voltear,
      seleccion: () => unico() || [...sel][0] || null,
      cuantos: () => sel.size,
      fijarHerramienta(h) { herramienta = h; origenEnlace = null; capa.classList.toggle("herramienta", !!h); },
      herramienta: () => herramienta,
      cambios(lista) {
        if (gesto && lista.some((c) => (gesto.ids || [gesto.id]).includes(c.bloque))) return;
        if (editando && lista.length === 1 && lista[0].bloque === editando && lista[0].local) return;
        render();
      },
      destruir() { document.removeEventListener("keydown", teclas); document.removeEventListener("keyup", teclas); ro.disconnect(); terminarEdicion(); capas.cerrar(); $$(".lz-panel").forEach((x) => x.remove()); },
    };
    return lienzoApi;
  }

  function menuColor(lienzo, b) {
    paletaColores(b, null, (c) => c && lienzo.colorear(c), { titulo: "Color de la figura" });
  }
  /** Galería de figuras (como "Elementos" en Canva): vista previa real de cada una. */
  function menuFiguras(lienzo, b, alElegir, punto) {
    const basicas = FIGURAS.map(([id, t]) => `<button data-f="${id}" aria-label="${esc(t)}" title="${esc(t)}"><svg viewBox="-3 -3 46 36" aria-hidden="true"><path d="${ruta(id, 40, 30, 7)}" style="fill:${esLinea(id) ? "none" : "var(--m-diag-tenue)"};stroke:var(--m-diag)" stroke-width="2" stroke-linejoin="round"/>${id === "linea-flecha" ? '<path d="M32,9 L40,15 L32,21" style="fill:none;stroke:var(--m-diag)" stroke-width="2"/>' : ""}</svg></button>`).join("");
    // 8.4 UML, entidad-relación y redes: la vista previa es la figura real con sus proporciones.
    const mini = (clave) => {
      const pr = PRESETS[clave], k = Math.min(40 / pr.w, 30 / pr.h), w = pr.w * k, h = pr.h * k;
      const lleno = pr.color === "#2B2A33";
      const e = { f: pr.figura, relleno: "x", trazo: "x", radio: pr.radio != null ? pr.radio * k : pr.figura === "rect" ? 4 : 0 };
      return `<g transform="translate(${n2((40 - w) / 2)} ${n2((30 - h) / 2)})">${partesFigura(e, w, h).map((pz) => `<path d="${pz.d}" style="fill:${pz.relleno ? (lleno || pz.trazo == null ? "var(--m-diag)" : "var(--m-diag-tenue)") : "none"};stroke:${pz.trazo ? "var(--m-diag)" : "none"}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"${pr.bordeEstilo === "guiones" ? ' stroke-dasharray="4 3"' : ""}/>`).join("")}</g>`;
    };
    const seccion = (lista) => lista.map(([id, t]) => `<button data-p="${id}" aria-label="${esc(t)}" title="${esc(t)}"><svg viewBox="-3 -3 46 36" aria-hidden="true">${mini(id)}</svg><small>${esc(t)}</small></button>`).join("");
    const red = NOM.iconos ? FIGURAS_RED.map(([id, t]) => { const ic = NOM.iconos.LISTA.find((x) => x.id === id); return ic ? `<button data-r="${id}" aria-label="${esc(t)}" title="${esc(t)}"><svg viewBox="0 0 24 24" fill="none" stroke="var(--m-diag)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic.svg}</svg><small>${esc(t)}</small></button>` : ""; }).join("") : "";
    const p = panel(b, `<div class="lz-figuras">${basicas}</div><div class="menu-titulo">UML</div><div class="lz-figuras con-nombre">${seccion(FIGURAS_UML)}</div>
      <div class="menu-titulo">Entidad-relación</div><div class="lz-figuras con-nombre">${seccion(FIGURAS_ER)}</div>${red ? `<div class="menu-titulo">Redes</div><div class="lz-figuras con-nombre">${red}</div>` : ""}`, { titulo: "Figuras" });
    p.classList.add("lz-panel-figuras");
    p.addEventListener("click", (e) => {
      const x = e.target.closest("[data-f]"), pr = e.target.closest("[data-p]"), r = e.target.closest("[data-r]");
      if (!x && !pr && !r) return;
      p.cerrar();
      if (x) (alElegir || ((f) => lienzo.crear("forma", { figura: f }, punto)))(x.dataset.f);
      else if (pr) lienzo.crearPreset(pr.dataset.p, punto);
      else lienzo.crearPreset("red:" + r.dataset.r, punto);
    });
  }
  function menuAlinear(lienzo, b) {
    const varios = lienzo.cuantos() > 1;
    NOM.menu(b, [{ titulo: "Alinear" },
      { texto: "Izquierda", icono: "al-izq", fn: () => lienzo.alinear("izq") }, { texto: "Centro horizontal", icono: "al-centro-h", fn: () => lienzo.alinear("centro-h") }, { texto: "Derecha", icono: "al-der", fn: () => lienzo.alinear("der") },
      { texto: "Arriba", icono: "al-arriba", fn: () => lienzo.alinear("arriba") }, { texto: "Centro vertical", icono: "al-centro-v", fn: () => lienzo.alinear("centro-v") }, { texto: "Abajo", icono: "al-abajo", fn: () => lienzo.alinear("abajo") },
      ...(varios ? ["-", { texto: "Distribuir horizontalmente", icono: "distribuir-h", fn: () => lienzo.distribuir("h") }, { texto: "Distribuir verticalmente", icono: "distribuir-v", fn: () => lienzo.distribuir("v") }] : [])]);
  }

  /** 8.3 y 8.4 Biblioteca de íconos (funciona sin internet): buscar y tocar para insertar. */
  function bibliotecaIconos(ed, lienzo) {
    const I = NOM.iconos;
    if (!I) return aviso("La biblioteca de íconos no se cargó", { tipo: "aviso" });
    const cuerpo = NOM.html(`<div class="col"><div class="entrada">${ico("search")}<input data-q placeholder="Buscar: libro, ciencia, flecha, persona…" autocomplete="off"></div>
      <div class="segmentado" role="group" style="flex-wrap:wrap" data-cats>${["Todos", ...I.CATEGORIAS].map((c, i) => `<button type="button" data-cat="${esc(c)}" aria-pressed="${i === 0}">${esc(c)}</button>`).join("")}</div>
      <div class="lz-iconos" data-lista></div></div>`);
    const h = NOM.hoja({ titulo: "Íconos y elementos", icono: "shapes", cuerpo, ancha: true });
    let cat = "Todos";
    const pintar = () => {
      const q = $("[data-q]", cuerpo).value.trim().toLowerCase();
      const l = I.LISTA.filter((x) => (cat === "Todos" || x.c === cat) && (!q || x.n.includes(q) || x.k.includes(q))).slice(0, 240);
      $("[data-lista]", cuerpo).innerHTML = l.map((x) => `<button type="button" data-i="${esc(x.id)}" aria-label="${esc(x.n)}" title="${esc(x.n)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${x.svg}</svg></button>`).join("") || `<p class="suave">No hay íconos con “${esc(q)}”.</p>`;
    };
    pintar();
    $("[data-q]", cuerpo).addEventListener("input", pintar);
    $("[data-cats]", cuerpo).addEventListener("click", (e) => { const x = e.target.closest("[data-cat]"); if (!x) return; cat = x.dataset.cat; $$("[data-cat]", cuerpo).forEach((y) => y.setAttribute("aria-pressed", y === x)); pintar(); });
    $("[data-lista]", cuerpo).addEventListener("click", (e) => {
      const x = e.target.closest("[data-i]");
      if (!x) return;
      const ic = I.LISTA.find((y) => y.id === x.dataset.i);
      h.cerrar();
      const te = NOM.diapo && NOM.diapo.tema(ed.doc);
      const colorIc = lienzo.acotado ? (te ? te.acentos[0] : "#3D72F2") : "#2B2A33";
      const nuevoId = lienzo.crear("icono", { svg: ic.svg, nombre: ic.id, color: colorIc, grosor: 2 });
      if (nuevoId && NOM.diapo) NOM.diapo.iconoPng(ic.svg, colorIc, 2).then((png) => { if (png && ed.doc.vivo(nuevoId)) ed.doc.cambiar(nuevoId, { png }, { deshacible: false }); });
    });
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
          const du = lienzo.duenoPagina(p), cambios = ed.resaltando && ed.cambiosVisita && (ed.cambiosVisita.bloques || []).some((id) => doc().valor(id, "pagina") === p);
          const T = tamDoc(doc());
          return `<button class="mini" data-p="${esc(p)}" aria-current="${p === ed.pagina}" aria-label="Diapositiva ${i + 1}" style="aspect-ratio:${T.w} / ${T.h}"><span class="num">${i + 1}</span>
            <div class="mini-cont diapo-mini" style="${NOM.diapo ? NOM.diapo.estiloDiapo(doc(), p) : ""}">${htmlDiapositiva(doc(), p)}</div>${du ? `<span class="mini-dueno" style="--c:${esc(ed.colorDe(du))}">${esc(ed.nombreDe(du))}</span>` : ""}${cambios ? `<span class="mini-cambio" title="Cambió desde tu última visita"></span>` : ""}${doc().valor("_doc", "trans:" + p) ? `<span class="mini-trans" title="Con transición">${ico("sparkles", "ico-s")}</span>` : ""}</button>`;
        }).join("") + (ed.soloLectura ? "" : `<button class="btn plano" data-nueva data-micro="Nueva diapositiva|Agrega una diapositiva después de la actual.">${ico("plus")}</button>`);
        $$(".mini", minis).forEach((m) => {
          const c = $(".mini-cont", m);
          const k = m.clientWidth / tamDoc(doc()).w || 0.17;
          c.style.transform = `scale(${k})`;
          m.onclick = () => { ed.pagina = m.dataset.p; lienzo.render(); pintarNotas(); };
          m.oncontextmenu = (e) => { e.preventDefault(); if (!ed.soloLectura) menuDiapo(m, m.dataset.p); };
        });
        // Con el dedo: mantener presionada una miniatura abre sus opciones (no hay clic derecho).
        if (!minis._rueda) {
          minis._rueda = true;
          NOM.rueda.enlazar(minis, (e) => {
            const m = e.target.closest && e.target.closest(".mini");
            if (!m || ed.soloLectura) return null;
            const l = accionesDiapo(m.dataset.p);
            l.titulo = "Diapositiva " + (doc().paginas().indexOf(m.dataset.p) + 1);
            return l;
          }, { titulo: "Diapositiva" });
        }
        const n = $("[data-nueva]", minis);
        if (n) n.onclick = () => menuNueva(n);
      }, 150);
      // El lienzo ya se pintó antes de que existiera esta función: sin esto la tira de miniaturas
      // quedaba vacía hasta el primer cambio.
      pintarMinis();
      function duplicarDiapo(p) {
        const np = ed.nuevaPagina(p);
        doc().lote(() => doc().deLaPagina(p).forEach((b) => { const { id, ...c } = b; delete c.dueno; delete c.maestro; doc().cambiar(NOM.DocCRDT.nuevoId(), Object.assign(c, { pagina: np })); }));
        ed.pagina = np; lienzo.render();
      }
      function moverDiapo(p, d) {
        const pags = doc().paginas(), i = pags.indexOf(p), q = pags.slice();
        if (i + d < 0 || i + d >= q.length) return;
        q.splice(i, 1); q.splice(i + d, 0, p);
        doc().cambiar("_doc", { paginas: q });
      }
      /** Ruedita de una miniatura (mismo orden de siempre: abajo eliminar, a su lado duplicar). */
      function accionesDiapo(p) {
        const pags = doc().paginas(), i = pags.indexOf(p);
        return [
          { texto: "Transición", icono: "sparkles", fn: () => menuTransicion(null, p) },
          { texto: "Notas", icono: "sticky-note", fn: () => { ed.pagina = p; lienzo.render(); alternarNotas(true); } },
          { texto: "Antes", icono: "chevron-left", off: i <= 0, fn: () => moverDiapo(p, -1) },
          { texto: "Después", icono: "chevron-right", off: i >= pags.length - 1, fn: () => moverDiapo(p, 1) },
          { texto: "Eliminar", icono: "trash-2", off: pags.length <= 1 || !!lienzo.paginaAjena(), fn: () => eliminarDiapo(p) },
          { texto: "Duplicar", icono: "copy", fn: () => duplicarDiapo(p) },
          ed.esPropietario ? { texto: "Asignar a…", icono: "user-check", fn: () => lienzo.asignarPagina(p) } : { texto: "Presentar", icono: "play", fn: () => { ed.pagina = p; presentar(ed); } },
          { texto: "Revolver", icono: "shuffle", off: pags.length < 3, fn: revolver },
        ];
      }
      /** "Revolver o reordenar páginas": las diapositivas en otro orden al azar (se puede deshacer). */
      function revolver() {
        const q = doc().paginas().slice();
        for (let k = q.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [q[k], q[j]] = [q[j], q[k]]; }
        doc().cambiar("_doc", { paginas: q });
        aviso("Diapositivas revueltas. Ctrl+Z para volver", { ms: 2400 });
      }
      function eliminarDiapo(p) {
        const pags = doc().paginas(), i = pags.indexOf(p);
        if (pags.length <= 1) return;
        doc().lote(() => {
          doc().deLaPagina(p).forEach((b) => doc().cambiar(b.id, { eliminado: true }));
          doc().cambiar("_doc", { paginas: pags.filter((x) => x !== p) });
        });
        ed.pagina = pags[Math.max(0, i - 1)] === p ? pags[1] : pags[Math.max(0, i - 1)];
        lienzo.render();
      }
      function menuDiapo(anc, p) {
        const pags = doc().paginas(), i = pags.indexOf(p);
        NOM.menu(anc, [
          { texto: "Duplicar", icono: "copy", fn: () => duplicarDiapo(p) },
          { texto: "Transición…", icono: "sparkles", fn: () => menuTransicion(anc, p) },
          ...(ed.esPropietario ? [{ texto: lienzo.duenoPagina(p) ? "Cambiar a quién se asignó…" : "Asignar a una persona…", icono: "user-check", fn: () => lienzo.asignarPagina(p) }] : []),
          { texto: "Revolver el orden", icono: "shuffle", fn: revolver },
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

      // 5.5 Notas del orador (por diapositiva, en _doc "nota:<página>"): solo se ven en el modo presentador.
      const notas = html(`<div class="pres-notas" hidden><div class="fila-e"><b>${ico("sticky-note", "ico-s")} Notas del orador</b><button class="icono-btn chico" data-x aria-label="Cerrar notas">${ico("x", "ico-s")}</button></div>
        <textarea placeholder="Lo que quieres decir en esta diapositiva. Solo tú lo ves al presentar (modo presentador)." ${ed.soloLectura ? "readonly" : ""}></textarea></div>`);
      $("[data-escena]", raiz).append(notas);
      const area = $("textarea", notas);
      const guardarNota = NOM.debounce(() => { if (!ed.soloLectura) doc().cambiar("_doc", { ["nota:" + ed.pagina]: area.value || null }, { grupo: "nota-" + ed.pagina }); }, 400);
      area.addEventListener("input", guardarNota);
      $("[data-x]", notas).onclick = () => alternarNotas(false);
      function pintarNotas() { if (!notas.hidden && document.activeElement !== area) area.value = doc().valor("_doc", "nota:" + ed.pagina) || ""; }
      function alternarNotas(si) { notas.hidden = si == null ? !notas.hidden : !si; pintarNotas(); if (!notas.hidden && matchMedia("(hover: hover)").matches) area.focus(); ed.refrescarHerramientas(); }
      const TRANS = [["", "Sin transición"], ["desvanecer", "Desvanecer"], ["deslizar", "Deslizar"], ["empujar", "Empujar hacia arriba"], ["zoom", "Acercar"]];
      function menuTransicion(anc, p) {
        p = p || ed.pagina;
        const actual = doc().valor("_doc", "trans:" + p) || "";
        const elegir = (v, todas) => doc().cambiar("_doc", Object.fromEntries((todas ? doc().paginas() : [p]).map((x) => ["trans:" + x, v || null])));
        const items = [{ titulo: "Al llegar a la diapositiva…" }, ...TRANS.map(([v, t]) => ({ texto: t, marcado: v === actual, fn: () => elegir(v) })), "-", { texto: "Usar la misma en todas", icono: "copy", fn: () => elegir(actual, true) }];
        if (anc) NOM.menu(anc, items);
        else NOM.rueda.abrir(innerWidth / 2, innerHeight / 2, TRANS.map(([v, t]) => ({ texto: t, icono: v ? "sparkles" : "x", marcado: v === actual, fn: () => elegir(v) })).concat([{ texto: "En todas", icono: "copy", fn: () => elegir(actual, true) }]), { titulo: "Transición", modo: "clic" });
      }
      // ---- 8.3 animaciones: la lista ordenada de la diapositiva ("anim:<página>" en _doc)
      const listaAnim = () => listaAnimaciones(doc(), ed.pagina, bloquesPresentables(doc(), ed.pagina)).map((x) => Object.assign({}, x));
      const guardarAnim = (l) => { doc().cambiar("_doc", { ["anim:" + ed.pagina]: l.map((x) => ({ id: x.id, tipo: x.tipo, efecto: x.efecto, inicio: x.inicio || "clic", retraso: +x.retraso || 0, dur: +x.dur || 500 })) }); pintarMinis(); };
      const nombreBloque = (id) => {
        const b = doc().bloque(id) || {};
        const t = b.tipo === "texto" ? NOM.diapo.textoPlano(b.html) || b.ph || "Texto" : b.tipo === "forma" ? b.texto || "Figura" : { imagen: "Imagen", tabla: "Tabla", grafica: "Gráfica", icono: "Ícono", ecuacion: "Ecuación" }[b.tipo] || "Bloque";
        return t.length > 28 ? t.slice(0, 27) + "…" : t;
      };
      function ponerAnim(id, tipo, efecto) {
        const l = listaAnim().filter((x) => !(x.id === id && x.tipo === tipo));
        if (efecto) l.push({ id, tipo, efecto, inicio: "clic", retraso: 0, dur: 500 });
        guardarAnim(l);
        aviso(efecto ? `${TIPO_ANIM[tipo]}: ${(EFECTOS[tipo].find((x) => x[0] === efecto) || ["", efecto])[1]} (paso ${l.filter((x) => (x.inicio || "clic") === "clic").length})` : "Animación quitada", { tipo: "ok", ms: 1800 });
      }
      function menuAnimacion(b) {
        const id = lienzo.seleccion(), l = listaAnim();
        const actual = (t) => (l.find((x) => x.id === id && x.tipo === t) || {}).efecto || "";
        const items = [];
        if (id && !ed.soloLectura) {
          ["e", "n", "x"].forEach((t) => {
            items.push({ titulo: TIPO_ANIM[t] });
            EFECTOS[t].forEach(([v, tx]) => items.push({ texto: tx, marcado: actual(t) === v, fn: () => ponerAnim(id, t, actual(t) === v ? null : v) }));
          });
          items.push("-", { texto: "Quitar las animaciones de esto", icono: "x", fn: () => { guardarAnim(l.filter((x) => x.id !== id)); } });
        } else items.push({ titulo: "Elige un bloque para animarlo" });
        items.push({ texto: "Todas las animaciones de la diapositiva…", icono: "list-ordered", fn: dialogoAnimaciones });
        NOM.menu(b, items);
      }
      /** El panel de animaciones: orden, cuándo empieza cada una, retraso y duración. */
      function dialogoAnimaciones() {
        let l = listaAnim();
        const cuerpo = NOM.html(`<div class="col"><p class="suave chico" style="font-weight:650">Se reproducen de arriba abajo. "Al hacer clic" empieza un paso nuevo; "Con la anterior" y "Después de la anterior" van en el mismo paso.</p><div class="lista anim-lista" data-l></div></div>`);
        const pintarL = () => {
          $("[data-l]", cuerpo).innerHTML = l.length ? l.map((x, k) => `<div class="anim-fila" data-k="${k}">
            <div class="fila" style="align-items:center"><b class="crece recorta">${k + 1}. ${esc(nombreBloque(x.id))}</b><span class="chip chico">${TIPO_ANIM[x.tipo]}</span>
              <button class="icono-btn chico" data-mover="-1" aria-label="Subir" ${k === 0 ? "disabled" : ""}>${ico("arrow-up", "ico-s")}</button><button class="icono-btn chico" data-mover="1" aria-label="Bajar" ${k === l.length - 1 ? "disabled" : ""}>${ico("arrow-down", "ico-s")}</button><button class="icono-btn chico" data-quitar aria-label="Quitar">${ico("trash-2", "ico-s")}</button></div>
            <div class="fila" style="flex-wrap:wrap"><select data-campo="efecto">${EFECTOS[x.tipo].map(([v, tx]) => `<option value="${v}" ${x.efecto === v ? "selected" : ""}>${tx}</option>`).join("")}</select>
              <select data-campo="inicio">${[["clic", "Al hacer clic"], ["con", "Con la anterior"], ["despues", "Después de la anterior"]].map(([v, tx]) => `<option value="${v}" ${(x.inicio || "clic") === v ? "selected" : ""}>${tx}</option>`).join("")}</select>
              <label class="chico">Retraso <input data-campo="retraso" type="number" min="0" max="20" step="0.1" value="${(+x.retraso || 0) / 1000}" style="width:64px"> s</label>
              <label class="chico">Duración <input data-campo="dur" type="number" min="0.1" max="10" step="0.1" value="${(+x.dur || 500) / 1000}" style="width:64px"> s</label></div></div>`).join("")
            : `<p class="suave">Esta diapositiva no tiene animaciones. Elige un bloque y toca Animación.</p>`;
        };
        pintarL();
        cuerpo.addEventListener("click", (e) => {
          const f = e.target.closest("[data-k]");
          if (!f) return;
          const k = +f.dataset.k, m = e.target.closest("[data-mover]");
          if (m) { const j = k + +m.dataset.mover; [l[k], l[j]] = [l[j], l[k]]; pintarL(); }
          if (e.target.closest("[data-quitar]")) { l.splice(k, 1); pintarL(); }
        });
        cuerpo.addEventListener("change", (e) => {
          const f = e.target.closest("[data-k]"), c = e.target.dataset.campo;
          if (!f || !c) return;
          const x = l[+f.dataset.k];
          x[c] = c === "retraso" || c === "dur" ? Math.round(parseFloat(e.target.value || "0") * 1000) : e.target.value;
        });
        const pie = NOM.html(`<div style="display:contents"><button class="btn" type="button" data-probar>${ico("play", "ico-s")} Ver cómo queda</button><span class="crece"></span><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si>Guardar</button></div>`);
        const h = NOM.hoja({ titulo: "Animaciones de la diapositiva", icono: "sparkles", cuerpo, pie, ancha: true });
        $("[data-no]", pie).onclick = () => h.cerrar();
        $("[data-si]", pie).onclick = (e) => { e.preventDefault(); if (!ed.soloLectura) guardarAnim(l); h.cerrar(); };
        $("[data-probar]", pie).onclick = () => { if (!ed.soloLectura) guardarAnim(l); h.cerrar(); presentar(ed); };
      }
      /** 8.3 Nueva diapositiva con un diseño (portada, título y contenido, dos columnas…). */
      function nuevaConDiseno(id) {
        const D = NOM.diapo, dis = D.DISENOS.find((x) => x.id === id) || D.DISENOS[0];
        const np = ed.nuevaPagina(ed.pagina), T = tamDoc(doc()), te = D.tema(doc());
        doc().lote(() => dis.arma(T.w, T.h).forEach((b, i) => {
          const c = Object.assign({}, b, { pagina: np, orden: i + 1, z: i + 1, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
          if (c.tipo === "texto") { c.html = c.html || ""; }
          if (c.tipo === "tabla") c.enDiapo = true;
          if (c.tipo === "forma") { c.color = te ? te.acentos[c.acento || 0] : "#3D72F2"; delete c.acento; }
          doc().cambiar(NOM.DocCRDT.nuevoId(), c);
        }));
        ed.pagina = np; lienzo.render();
      }
      function menuNueva(b) {
        const D = NOM.diapo;
        if (!D) { ed.pagina = ed.nuevaPagina(ed.pagina); lienzo.render(); return; }
        const p = NOM.html(`<div class="menu lz-disenos" role="dialog" aria-label="Nueva diapositiva"><div class="menu-titulo">Nueva diapositiva</div><div class="lz-disenos-lista">${D.DISENOS.map((d) => `<button data-d="${d.id}"><span class="lz-diseno-prev">${previaDiseno(d)}</span><small>${esc(d.t)}</small></button>`).join("")}</div></div>`);
        document.body.append(p);
        const r = b.getBoundingClientRect();
        p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left)) + "px";
        p.style.top = Math.max(8, Math.min(innerHeight - p.offsetHeight - 8, r.bottom + 6)) + "px";
        const cerrar = () => { p.remove(); document.removeEventListener("pointerdown", fuera, true); };
        const fuera = (e) => { if (!p.contains(e.target)) cerrar(); };
        setTimeout(() => document.addEventListener("pointerdown", fuera, true), 0);
        p.addEventListener("click", (e) => { const x = e.target.closest("[data-d]"); if (x) { cerrar(); nuevaConDiseno(x.dataset.d); } });
      }
      /** Dibujo chiquito de cómo queda cada diseño. */
      function previaDiseno(d) {
        const T = tamDoc(doc()), k = 96 / T.w;
        return `<svg viewBox="0 0 ${T.w} ${T.h}" width="96" height="${Math.round(T.h * k)}">${d.arma(T.w, T.h).map((b) => b.tipo === "imagen" ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="12" fill="#CFE0FF"/>`
          : b.tipo === "tabla" ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#9A97A6" stroke-width="8"/>`
          : b.tipo === "forma" ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#3D72F2"/>`
          : `<rect x="${b.x}" y="${b.y + b.h * 0.3}" width="${b.w * (b.estilo === "h1" ? 0.8 : 0.9)}" height="${b.estilo === "p" ? b.h * 0.12 : b.h * 0.4}" rx="10" fill="${b.estilo === "p" ? "#B7B4C2" : "#4A4854"}"${b.tAlin === "centro" ? ` transform="translate(${b.w * 0.05} 0)"` : ""}/>`).join("")}</svg>`;
      }
      function menuInsertar(b) {
        NOM.menu(b, [{ titulo: "Insertar" },
          { texto: "Cuadro de texto", icono: "type", fn: () => lienzo.crear("texto") },
          { texto: "Imagen…", icono: "image", fn: () => lienzo.imagen() },
          { texto: "Tabla…", icono: "table", fn: () => NOM.diapo.editarDatos({ titulo: "Nueva tabla", bloque: { filas: 3, cols: 3, encabezado: true }, alGuardar: (c) => lienzo.crear("tabla", Object.assign({ enDiapo: true }, c)) }) },
          { texto: "Gráfica…", icono: "bar-chart", fn: () => NOM.diapo.editarDatos({ titulo: "Nueva gráfica", grafica: true, bloque: { filas: 4, cols: 2, "c:A1": "", "c:B1": "Ventas", "c:A2": "Enero", "c:B2": "10", "c:A3": "Febrero", "c:B3": "14", "c:A4": "Marzo", "c:B4": "9" }, alGuardar: (c) => lienzo.crear("grafica", c) }) },
          { texto: "Íconos y elementos…", icono: "shapes", fn: () => elegirIcono(b) },
          { texto: "Figuras de UML y entidad-relación…", icono: "workflow", fn: () => menuFiguras(lienzo, b) },
          { texto: "Diagrama listo (ciclo, línea del tiempo…)…", icono: "network", fn: () => NOM.diagramas && NOM.diagramas.elegir(lienzo) },
          { texto: "Ecuación…", icono: "sigma", fn: () => lienzo.editarEcuacion(null) },
        ]);
      }
      /** 8.3 Biblioteca de íconos (funciona sin internet): buscar y tocar para insertar. */
      function elegirIcono(b) { bibliotecaIconos(ed, lienzo); void b; }
      /** 8.3 Diseño: tema, fondo de la diapositiva y tamaño. */
      function menuDiseno(b) {
        const D = NOM.diapo, te = doc().valor("_doc", "tema") || "", tm = doc().valor("_doc", "tamDiapo") || "16:9";
        const cuerpo = NOM.html(`<div class="col">
          <b>Tema</b><div class="lz-temas">${[["", { t: "Sin tema", fondo: { tipo: "color", color: "#FFFFFF" }, titulo: "#2B2A33", texto: "#4A4854" }], ...Object.entries(D.TEMAS)].map(([k, t]) => `<button type="button" data-tema="${k}" aria-pressed="${te === k}" style="background:${esc(D.cssFondo(t.fondo))}"><span style="color:${esc(t.titulo)};font-family:${esc(t.fuenteT ? NOM.textoRico.cssFuente(t.fuenteT) : "inherit")}">Aa</span><small style="color:${esc(t.texto)}">${esc(t.t)}</small></button>`).join("")}</div>
          <b>Fondo de esta diapositiva</b>
          <div class="fila" style="flex-wrap:wrap"><button type="button" class="btn chico" data-f="color">${ico("palette", "ico-s")} Color</button><button type="button" class="btn chico" data-f="degradado">${ico("blend", "ico-s")} Degradado</button>
            <button type="button" class="btn chico" data-f="imagen">${ico("image", "ico-s")} Imagen</button><button type="button" class="btn chico" data-f="quitar">${ico("x", "ico-s")} Del tema</button>
            <button type="button" class="btn chico" data-f="todas">${ico("copy", "ico-s")} Usar en todas</button></div>
          <b>Tamaño</b><div class="entrada"><select data-tam>${Object.entries(D.TAMANOS).map(([k, t]) => `<option value="${k}" ${tm === k ? "selected" : ""}>${esc(t.t)} · ${t.w}×${t.h}</option>`).join("")}</select></div>
          <p class="suave chico" style="font-weight:650">Al cambiar el tamaño, lo que ya está se acomoda en proporción.</p></div>`);
        const h = NOM.hoja({ titulo: "Diseño", icono: "palette", cuerpo });
        const p = ed.pagina;
        cuerpo.addEventListener("click", async (e) => {
          const t = e.target.closest("[data-tema]"), f = e.target.closest("[data-f]");
          if (t) { doc().cambiar("_doc", { tema: t.dataset.tema || null }); $$("[data-tema]", cuerpo).forEach((x) => x.setAttribute("aria-pressed", x === t)); lienzo.render(); }
          if (!f) return;
          const k = "fondo:" + p, actual = doc().valor("_doc", k) || {};
          if (f.dataset.f === "color") paletaColores(f, actual.color, (c) => { if (c) { doc().cambiar("_doc", { [k]: { tipo: "color", color: c } }); lienzo.render(); } }, { titulo: "Color de fondo" });
          else if (f.dataset.f === "degradado") paletaColores(f, actual.c1, (c1) => { if (!c1) return; setTimeout(() => paletaColores(f, actual.c2, (c2) => { if (c2) { doc().cambiar("_doc", { [k]: { tipo: "degradado", c1, c2, angulo: 135 } }); lienzo.render(); } }, { titulo: "Segundo color del degradado" }), 50); }, { titulo: "Primer color del degradado" });
          else if (f.dataset.f === "imagen") { const img = await ed.pedirImagen(); if (img) { doc().cambiar("_doc", { [k]: { tipo: "imagen", src: img.src, ajuste: "cubrir" } }); lienzo.render(); } }
          else if (f.dataset.f === "quitar") { doc().cambiar("_doc", { [k]: null }); lienzo.render(); }
          else if (f.dataset.f === "todas") { const fo = doc().valor("_doc", k) || null; doc().cambiar("_doc", Object.fromEntries(doc().paginas().map((x) => ["fondo:" + x, fo]))); aviso("Ese fondo quedó en todas las diapositivas", { tipo: "ok" }); lienzo.render(); }
        });
        $("[data-tam]", cuerpo).onchange = (e) => { cambiarTamano(e.target.value); h.cerrar(); };
        void b;
      }
      /** Cambia el tamaño de las diapositivas y acomoda todo en proporción. */
      function cambiarTamano(k) {
        const D = NOM.diapo, A = tamDoc(doc()), N = D.TAMANOS[k];
        if (!N || (A.w === N.w && A.h === N.h)) return;
        const kx = N.w / A.w, ky = N.h / A.h, km = Math.min(kx, ky);
        doc().lote(() => {
          doc().cambiar("_doc", { tamDiapo: k });
          doc().vivos().filter((b) => b.x != null && b.tipo !== "conector" && b.tipo !== "comentario").forEach((b) => {
            const w = b.w * km, h = b.h * km, cx = (b.x + b.w / 2) * kx, cy = (b.y + b.h / 2) * ky;
            const c = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) };
            if (b.tTam) c.tTam = Math.max(8, Math.round(b.tTam * km));
            doc().cambiar(b.id, c);
          });
        });
        lienzo.render();
        aviso("Tamaño cambiado: " + N.t, { tipo: "ok" });
      }
      /** 8.3 Guardar la diapositiva (o todas) como imagen PNG. */
      async function exportarImagen(todas) {
        const nombre = (doc().valor("_doc", "nombre") || "presentacion").replace(/[\\/:*?"<>|]+/g, " ").trim();
        try {
          if (!todas) {
            const png = await NOM.diapo.diapoPng(doc(), ed.pagina, 2), bin = atob(png.split(",")[1]), bytes = new Uint8Array(bin.length);
            for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
            const i = doc().paginas().indexOf(ed.pagina) + 1;
            NOM.formatos.descargarBytes(`${nombre} - diapositiva ${i}.png`, "image/png", bytes);
            return;
          }
          aviso("Preparando las imágenes…", { ms: 1500 });
          const archivos = [];
          const pags = doc().paginas();
          for (let i = 0; i < pags.length; i++) {
            const png = await NOM.diapo.diapoPng(doc(), pags[i], 2), bin = atob(png.split(",")[1]), bytes = new Uint8Array(bin.length);
            for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
            archivos.push({ nombre: `diapositiva-${String(i + 1).padStart(2, "0")}.png`, datos: bytes });
          }
          NOM.formatos.descargarBytes(nombre + " (imágenes).zip", "application/zip", NOM.ooxml.zip(archivos));
        } catch (e) { aviso(e.message, { tipo: "error" }); }
      }
      function menuPresentar(b) {
        NOM.menu(b, [
          { titulo: "Presentar" },
          { texto: "Aquí, en pantalla completa", icono: "play", atajo: "F5", fn: () => presentar(ed) },
          { texto: "Modo presentador (notas, siguiente y tiempo)", icono: "sticky-note", fn: () => presentar(ed, { presentador: true }) },
          ...(ed.local ? [] : [{ texto: "En otra pantalla (proyector)…", icono: "cast", fn: () => presentar(ed, { presentador: true, proyectar: true }) }]),
        ]);
      }
      this._notas = { pintar: pintarNotas };

      this._herr = [
        { id: "texto", icono: "type", micro: "Cuadro de texto|Agrega un título o un párrafo a la diapositiva.", fn: () => lienzo.crear("texto") },
        { id: "figura", icono: "shapes", micro: "Figuras|Más de 20: flechas, estrellas, globos de diálogo…", fn: (e, b) => menuFiguras(lienzo, b) },
        { id: "imagen", icono: "image", micro: "Imagen|Desde tu equipo.", fn: () => lienzo.imagen(), mantenerFoco: false },
        { id: "insertar", icono: "plus-square", micro: "Insertar|Tabla, gráfica, íconos y ecuación.", fn: (e, b) => menuInsertar(b) },
        { id: "diseno", icono: "palette", micro: "Diseño|Tema, fondo y tamaño de las diapositivas.", fn: (e, b) => menuDiseno(b), off: () => ed.soloLectura },
        "|",
        { id: "color", icono: "palette", micro: "Color|Cambia el color de las figuras seleccionadas.", fn: (e, b) => menuColor(lienzo, b), off: () => !lienzo.seleccion() },
        { id: "alinear", icono: "al-centro-h", micro: "Alinear|En la diapositiva o entre las figuras elegidas.", fn: (e, b) => menuAlinear(lienzo, b), off: () => !lienzo.seleccion() },
        { id: "animacion", icono: "sparkles", micro: "Animación|Entrada, énfasis y salida al presentar, en el orden que elijas.", fn: (e, b) => menuAnimacion(b) },
        { id: "frente", icono: "bring-to-front", micro: "Traer al frente||Ctrl+Mayús+]", fn: () => lienzo.capaZ("frente"), off: () => !lienzo.seleccion() },
        { id: "atras", icono: "send-to-back", micro: "Enviar al fondo||Ctrl+Mayús+[", fn: () => lienzo.capaZ("fondo"), off: () => !lienzo.seleccion() },
        { id: "borrar", icono: "trash-2", micro: "Eliminar|Quita los bloques seleccionados.|Supr", fn: () => lienzo.eliminar(), off: () => !lienzo.seleccion() },
        "|",
        { id: "capas", icono: "layers", micro: "Capas|Ocultar, bloquear y ordenar lo de la diapositiva.", fn: () => lienzo.capas.abrir() },
        { id: "comentar", icono: "message-square", micro: "Comentar|Comenta lo elegido (o la diapositiva). Funciona sin Internet.", fn: () => NOM.comentarios && NOM.comentarios.nuevo(ed), clase: "solo-escritorio" },
        "|",
        { id: "nueva", icono: "file-plus", micro: "Nueva diapositiva|Elige un diseño: portada, título y contenido, dos columnas…", fn: (e, b) => menuNueva(b) },
        { id: "notas", icono: "sticky-note", micro: "Notas del orador|Solo tú las ves, en el modo presentador.", fn: () => alternarNotas(), activo: () => !notas.hidden },
        { id: "transicion", icono: "sparkles", micro: "Transición|Cómo entra esta diapositiva al presentar.", fn: (e, b) => menuTransicion(b) },
        { id: "presentar", icono: "play", micro: "Presentar|Aquí, en modo presentador o en otra pantalla (proyector).|F5", fn: (e, b) => menuPresentar(b) },
        { id: "imagen-png", icono: "download", micro: "Guardar como imagen|Esta diapositiva o todas (PNG), para mandarlas por mensaje.", clase: "solo-escritorio", fn: (e, b) => NOM.menu(b, [{ titulo: "Guardar como imagen (PNG)" }, { texto: "Esta diapositiva", icono: "image", fn: () => exportarImagen(false) }, { texto: "Todas (en un .zip)", icono: "archive", fn: () => exportarImagen(true) }]) },
      ];
      this._teclaF5 = (e) => { if (e.key === "F5") { e.preventDefault(); presentar(ed); } };
      document.addEventListener("keydown", this._teclaF5);
      this.cambios = (l) => { lienzo.cambios(l); if (l.some((c) => c.bloque === "_doc")) pintarNotas(); };
      this.desmontar = () => { lienzo.destruir(); document.removeEventListener("keydown", this._teclaF5); ed.lienzo.style.overflow = ""; };
      this.resaltarCambios = (c) => { lienzo.resaltar(c); pintarMinis(); };
      this.comentarios = {
        ancla: () => lienzo.anclaComentario() || { tipo: "pagina", pagina: ed.pagina, cita: "Diapositiva " + (doc().paginas().indexOf(ed.pagina) + 1) },
        irA: (a) => { if (a.pagina && doc().paginas().includes(a.pagina)) { ed.pagina = a.pagina; lienzo.render(); } return a.id ? lienzo.irABloque(a.id) : true; },
        pintar: (l) => lienzo.marcarComentarios(l),
      };
    },
    herramientas() { return this._herr || []; },
    acciones() {
      return [
        { texto: "Modo presentador", icono: "sticky-note", fn: () => presentar(NOM.editorActual, { presentador: true }), claves: "presentar notas orador" },
        { texto: "Presentar en otra pantalla (proyector)", icono: "cast", fn: () => presentar(NOM.editorActual, { presentador: true, proyectar: true }), claves: "proyector pantalla telefono" },
        { texto: "Capas", icono: "layers", fn: () => this._lienzo.capas.abrir(), claves: "ocultar bloquear orden" },
        { texto: "Animaciones de la diapositiva", icono: "sparkles", fn: () => { const b = document.querySelector('[aria-label="Animación"]'); if (b) b.click(); }, claves: "animar entrada salida enfasis orden" },
        { texto: "Diseño (tema, fondo y tamaño)", icono: "palette", fn: () => { const b = document.querySelector('[aria-label="Diseño"]'); if (b) b.click(); }, claves: "tema fondo tamaño 4:3 cartel" },
        { texto: "Insertar un diagrama listo…", icono: "network", fn: () => NOM.diagramas && NOM.diagramas.elegir(this._lienzo), claves: "ciclo linea tiempo organigrama mapa mental venn foda espina pescado flujo" },
        { texto: this._lienzo && this._lienzo.cuadricula() ? "Quitar el ajuste a la cuadrícula" : "Ajustar a la cuadrícula", icono: "magnet", fn: () => this._lienzo.fijarCuadricula(!this._lienzo.cuadricula()), claves: "cuadricula rejilla iman alinear" },
        { texto: "Insertar tabla, gráfica o ícono", icono: "plus-square", fn: () => { const b = document.querySelector('.modo-PRESENTACION [aria-label="Insertar"]'); if (b) b.click(); }, claves: "tabla grafica icono ecuacion" },
      ];
    },
  };

  // ------------------------------------------------------------ una diapositiva como HTML (miniaturas, presentar, proyector)
  /** Lo que se presenta de una página: sin lo oculto ni lo que quedó en la mesa de trabajo (5.1). */
  function bloquesPresentables(doc, p) {
    const T = tamDoc(doc);
    const fueraDe = (b) => b.x + b.w <= 0 || b.y + b.h <= 0 || b.x >= T.w || b.y >= T.h;
    return posiciones(doc.deLaPagina(p).filter((b) => b.tipo !== "conector" && !b.oculto), true).filter((b) => !fueraDe(b)).sort((a, b) => (a.z || 0) - (b.z || 0));
  }
  // ------------------------------------------------------------ 8.3 animaciones
  /** Efectos de animación: entrada, énfasis y salida. */
  const EFECTOS = {
    e: [["aparecer", "Desvanecer"], ["deslizar", "Desde abajo"], ["deslizar-arriba", "Desde arriba"], ["deslizar-izq", "Desde la izquierda"], ["deslizar-der", "Desde la derecha"], ["zoom", "Acercar"], ["rebotar", "Rebotar"], ["girar", "Girar"]],
    n: [["pulso", "Pulso"], ["sacudir", "Sacudir"], ["vuelta", "Dar una vuelta"], ["crecer", "Crecer"], ["parpadear", "Parpadear"]],
    x: [["desvanecer", "Desvanecer"], ["deslizar", "Hacia abajo"], ["alejar", "Alejar"], ["girar", "Girar"]],
  };
  const TIPO_ANIM = { e: "Entrada", n: "Énfasis", x: "Salida" };
  /**
   * La lista ordenada de animaciones de una página (como el panel de animaciones de PowerPoint):
   * [{ id (bloque), tipo: "e"|"n"|"x", efecto, inicio: "clic"|"con"|"despues", retraso, dur }].
   * Documentos de antes: los bloques con "animacion", de arriba abajo, al hacer clic.
   */
  function listaAnimaciones(doc, p, bs) {
    const vivos = new Set(bs.map((b) => b.id));
    const l = doc.valor("_doc", "anim:" + p);
    if (Array.isArray(l)) return l.filter((x) => x && vivos.has(x.id) && x.efecto);
    return bs.filter((b) => b.animacion).sort((a, b) => a.y - b.y || a.x - b.x).map((b) => ({ id: b.id, tipo: "e", efecto: b.animacion, inicio: "clic" }));
  }
  /** Pasos de la presentación: [0] lo que arranca solo al llegar, y uno por cada clic. Cada evento con su momento (t) y duración. */
  function pasosAnim(lista) {
    const pasos = [[]];
    let ini = 0, fin = 0;
    lista.forEach((x) => {
      const dur = Math.max(100, Math.min(10000, +x.dur || 500)), ret = Math.max(0, Math.min(20000, +x.retraso || 0));
      let t;
      if ((x.inicio || "clic") === "clic") { pasos.push([]); t = ret; fin = 0; }
      else if (x.inicio === "con") t = ini + ret;
      else t = fin + ret;
      pasos[pasos.length - 1].push(Object.assign({}, x, { t, dur }));
      ini = t; fin = Math.max(fin, t + dur);
    });
    return pasos;
  }
  /** Cuántos clics tiene una diapositiva. */
  const pasosDe = (doc, p) => pasosAnim(listaAnimaciones(doc, p, bloquesPresentables(doc, p))).length - 1;
  /** Cómo está cada bloque en el paso k: oculto o no, y la animación que corre ahora. final: sin animar. */
  function estadoAnimaciones(doc, p, k, final) {
    const bs = bloquesPresentables(doc, p), pasos = pasosAnim(listaAnimaciones(doc, p, bs)), e = {};
    const de = (id) => (e[id] = e[id] || { oculto: false, anim: [] });
    pasos.forEach((ps, j) => ps.forEach((x) => {
      const s = de(x.id);
      if (x.tipo === "e") { if (j > k) s.oculto = true; else if (j === k && !final) s.anim.push(x); }
      else if (x.tipo === "x") { if (j < k || (final && j === k)) s.oculto = true; else if (j === k) s.anim.push(x); }
      else if (x.tipo === "n" && j === k && !final) s.anim.push(x);
    }));
    // Si hay una entrada más adelante y una salida antes, manda lo último que ya pasó.
    return { estado: e, pasos: pasos.length - 1 };
  }
  /** HTML de los bloques de una diapositiva. paso: el paso de la presentación (null = todo visible, sin animar). */
  function htmlDiapositiva(doc, p, paso, opc) {
    const bs = bloquesPresentables(doc, p);
    const est = paso == null ? null : estadoAnimaciones(doc, p, paso, opc && opc.final).estado;
    // 8.4 Las flechas entre figuras (un diagrama dentro de la diapositiva) van debajo de todo.
    const porId = Object.fromEntries(bs.map((b) => [b.id, b])), T = tamDoc(doc);
    const oculto = (id) => est && est[id] && est[id].oculto && !est[id].anim.length;
    const cs = doc.deLaPagina(p).filter((c) => c.tipo === "conector" && porId[c.desde] && porId[c.hasta] && !oculto(c.desde) && !oculto(c.hasta));
    const flechas = cs.length ? `<svg class="capa-conectores" width="${T.w}" height="${T.h}" style="z-index:0" aria-hidden="true">${cs.map((c) => svgConector(c, porId[c.desde], porId[c.hasta])).join("")}</svg>` : "";
    return flechas + bs.map((b) => {
      const s = est && est[b.id];
      if (s && s.oculto && !s.anim.length) return "";
      // Varias animaciones del mismo bloque en el mismo paso (entrada y énfasis…) van juntas.
      const st = s && s.anim.length ? `animation-name:${s.anim.map((x) => `a-${x.tipo}-${x.efecto}`).join(",")};animation-duration:${s.anim.map((x) => x.dur + "ms").join(",")};animation-delay:${s.anim.map((x) => x.t + "ms").join(",")};animation-fill-mode:both;animation-timing-function:cubic-bezier(.2,.8,.2,1);` : "";
      return `<div class="bl${clasesBloque(b)}${s && s.anim.length ? " animando" : ""}" data-id="${esc(b.id)}" style="${estiloBloque(b)}overflow:${b.tipo === "forma" ? "visible" : "hidden"};${st}">${contenido(b)}</div>`;
    }).join("");
  }

  // ------------------------------------------------------------ reproductor
  /**
   * Presenta en pantalla completa. opc.presentador: vista con notas, la siguiente diapositiva y el
   * tiempo (5.5). opc.proyectar: además la presentación se ve en otra pantalla (el navegador de la
   * computadora del proyector abre /proyectar?c=CÓDIGO, sin iniciar sesión) y la mueve este equipo.
   * 8.3: animaciones por pasos, puntero láser (L), pluma (P) y borrar (E), que también se ven en el proyector.
   */
  function presentar(ed, opc) {
    opc = opc || {};
    const doc = ed.doc;
    const pags = () => doc.paginas();
    let i = Math.max(0, pags().indexOf(ed.pagina)), paso = 0, total = 0, codigo = null;
    const presentador = !!opc.presentador;
    const rep = html(`<div class="reproductor${presentador ? " presentador" : ""}" tabindex="0">
      ${presentador ? `<div class="pv-actual"><div class="diapo" data-d></div></div>
        <aside class="pv-lado"><div class="pv-sig"><span>Siguiente</span><div class="pv-sig-caja"><div class="diapo" data-sig></div></div></div>
          <div class="pv-notas" data-notas></div>
          <div class="pv-proy" data-proy hidden></div></aside>
        <div class="pv-ctl"><button class="btn" data-ant>${ico("chevron-left")} Anterior</button><span class="pv-tiempo" data-tiempo>0:00</span><span class="contador" data-c></span><button class="btn primario" data-sig-btn>Siguiente ${ico("chevron-right")}</button></div>`
        : `<div class="diapo" data-d></div><span class="contador" data-c></span>`}
      <div class="pres-herr" data-herr><button class="icono-btn" data-h="laser" aria-label="Puntero láser" data-micro="Puntero láser||L">${ico("circle-dot")}</button><button class="icono-btn" data-h="pluma" aria-label="Pluma" data-micro="Pluma (dibujar sobre la diapositiva)||P">${ico("pencil")}</button><button class="icono-btn" data-h="borrar" aria-label="Borrar lo dibujado" data-micro="Borrar lo dibujado||E">${ico("eraser")}</button></div>
      <button class="icono-btn salir" aria-label="Salir">${ico("x")}</button></div>`);
    document.body.append(rep);
    const d = $("[data-d]", rep), sig = $("[data-sig]", rep);
    const inicio = Date.now();
    const reloj = presentador ? setInterval(() => { const s2 = Math.floor((Date.now() - inicio) / 1000); $("[data-tiempo]", rep).textContent = `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, "0")}`; }, 1000) : null;
    function escalar(el, caja, p) {
      if (NOM.diapo) NOM.diapo.aplicar(el, doc, p);
      const T = tamDoc(doc);
      const r = caja ? caja.getBoundingClientRect() : { width: innerWidth, height: innerHeight, left: 0, top: 0 };
      const k = Math.min(r.width / T.w, r.height / T.h);
      el.style.transform = `scale(${k})`;
      el.style.left = (r.width - T.w * k) / 2 + "px";
      el.style.top = (r.height - T.h * k) / 2 + "px";
    }
    function escala() {
      escalar(d, presentador ? $(".pv-actual", rep) : null, pags()[i]);
      if (sig) { const n = pags()[i + 1]; const caja = $(".pv-sig-caja", rep); if (caja) caja.style.aspectRatio = `${tamDoc(doc).w} / ${tamDoc(doc).h}`; escalar(sig, caja, n || pags()[i]); }
    }
    const avisarProyector = NOM.throttle(() => {
      if (!codigo) return;
      NOM.api.put(`/api/documentos/${ed.id}/proyeccion`, { pagina: pags()[i], paso }).catch(() => {});
    }, 120);
    function transicion() {
      const t = doc.valor("_doc", "trans:" + pags()[i]);
      d.classList.remove("trans-desvanecer", "trans-deslizar", "trans-empujar", "trans-zoom");
      if (t) { void d.offsetWidth; d.classList.add("trans-" + t); }
    }
    function pintar(revelarTodo, conTransicion) {
      const p = pags()[i];
      total = estadoAnimaciones(doc, p, 0).pasos;
      paso = revelarTodo ? total : 0;
      d.innerHTML = htmlDiapositiva(doc, p, paso, { final: !!revelarTodo });
      borrarMarcas(false);
      escala();
      if (conTransicion !== false) transicion();
      $("[data-c]", rep).textContent = `${i + 1} / ${pags().length}`;
      if (presentador) {
        const n = pags()[i + 1];
        sig.innerHTML = n ? htmlDiapositiva(doc, n) : "";
        $(".pv-sig", rep).classList.toggle("fin", !n);
        const nota = doc.valor("_doc", "nota:" + p) || "";
        $("[data-notas]", rep).innerHTML = nota ? esc(nota).replace(/\n/g, "<br>") : `<span class="suave">Sin notas para esta diapositiva.</span>`;
      }
      avisarProyector();
    }
    function avanzar() {
      if (paso < total) {
        paso++;
        d.innerHTML = htmlDiapositiva(doc, pags()[i], paso);
        pintarMarcas();
        avisarProyector();
        return;
      }
      if (i < pags().length - 1) { i++; pintar(); } else salir();
    }
    function retroceder() { if (i > 0) { i--; pintar(true, false); } }

    // ---- 8.3 puntero láser y pluma
    let herramienta = null, trazos = [], trazo = null, puntero = null, colorPluma = "#F2385A";
    const capaMarcas = () => {
      let s = $(".pres-marcas", d);
      if (!s) { const T = tamDoc(doc); s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("class", "pres-marcas"); s.setAttribute("viewBox", `0 0 ${T.w} ${T.h}`); d.append(s); }
      return s;
    };
    function pintarMarcas() {
      const s = capaMarcas();
      s.innerHTML = trazos.map((t) => `<polyline points="${t.join(" ")}" fill="none" stroke="${colorPluma}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join("")
        + (puntero ? `<circle cx="${puntero.x}" cy="${puntero.y}" r="10" fill="#F2385A" fill-opacity=".85"/><circle cx="${puntero.x}" cy="${puntero.y}" r="22" fill="#F2385A" fill-opacity=".25"/>` : "");
    }
    const enviarMarcas = NOM.throttle(() => {
      if (!codigo) return;
      NOM.api.put(`/api/documentos/${ed.id}/proyeccion/marcas`, { puntero, trazos: trazos.slice(-60), color: colorPluma }).catch(() => {});
    }, 90);
    function borrarMarcas(avisar) { trazos = []; trazo = null; puntero = null; pintarMarcas(); if (avisar !== false) enviarMarcas(); }
    function usar(h) {
      herramienta = herramienta === h ? null : h;
      if (h === "borrar") { herramienta = null; borrarMarcas(); }
      if (herramienta !== "laser") { puntero = null; pintarMarcas(); enviarMarcas(); }
      $$("[data-h]", rep).forEach((b) => b.setAttribute("aria-pressed", b.dataset.h === herramienta));
      rep.classList.toggle("con-laser", herramienta === "laser");
      rep.classList.toggle("con-pluma", herramienta === "pluma");
    }
    const enDiapo = (e) => {
      const r = d.getBoundingClientRect(), T = tamDoc(doc);
      return { x: Math.round(((e.clientX - r.left) / r.width) * T.w * 10) / 10, y: Math.round(((e.clientY - r.top) / r.height) * T.h * 10) / 10 };
    };
    d.addEventListener("pointerdown", (e) => {
      if (!herramienta) return;
      e.preventDefault(); e.stopPropagation();
      if (herramienta === "pluma") { const q = enDiapo(e); trazo = [q.x, q.y]; trazos.push(trazo); d.setPointerCapture(e.pointerId); pintarMarcas(); enviarMarcas(); }
      if (herramienta === "laser") { puntero = enDiapo(e); pintarMarcas(); enviarMarcas(); }
    });
    d.addEventListener("pointermove", (e) => {
      if (herramienta === "laser") { puntero = enDiapo(e); pintarMarcas(); enviarMarcas(); }
      else if (herramienta === "pluma" && trazo) { const q = enDiapo(e); trazo.push(q.x, q.y); if (trazo.length > 1600) trazo = null; pintarMarcas(); enviarMarcas(); }
    });
    const soltarPluma = () => { trazo = null; };
    d.addEventListener("pointerup", soltarPluma);
    d.addEventListener("pointercancel", soltarPluma);
    $("[data-herr]", rep).addEventListener("click", (e) => { const b = e.target.closest("[data-h]"); if (b) { e.stopPropagation(); usar(b.dataset.h); } });

    function salir() {
      clearInterval(reloj);
      document.removeEventListener("keydown", tecla, true);
      removeEventListener("resize", escala);
      rep.remove();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (codigo) NOM.api.delete(`/api/documentos/${ed.id}/proyeccion`).catch(() => {});
      if (wake) wake.release().catch(() => {});
    }
    function tecla(e) {
      e.stopPropagation();
      const k = e.key.toLowerCase();
      if (["ArrowRight", "ArrowDown", " ", "PageDown", "Enter"].includes(e.key)) { e.preventDefault(); avanzar(); }
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); retroceder(); }
      else if (e.key === "Escape") { if (herramienta) usar(herramienta); else salir(); }
      else if (k === "l") usar("laser");
      else if (k === "p") usar("pluma");
      else if (k === "e") usar("borrar");
    }
    rep.addEventListener("click", (e) => {
      if (e.target.closest(".salir")) return salir();
      if (e.target.closest("[data-herr]")) return;
      if (e.target.closest("[data-ant]")) return retroceder();
      if (e.target.closest("[data-sig-btn]")) return avanzar();
      if (herramienta) return;
      if (presentador && !e.target.closest(".pv-actual")) return;
      (e.clientX < innerWidth / 3 ? retroceder : avanzar)();
    });
    // Deslizar con el dedo: a la izquierda avanza, a la derecha regresa (si no se está dibujando).
    let x0 = null;
    rep.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" && !herramienta) x0 = e.clientX; });
    rep.addEventListener("pointerup", (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 60) { e.preventDefault(); (dx < 0 ? avanzar : retroceder)(); } });
    document.addEventListener("keydown", tecla, true);
    addEventListener("resize", escala);
    let wake = null;
    if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request("screen").then((w) => (wake = w)).catch(() => {});
    if (rep.requestFullscreen && !presentador) rep.requestFullscreen().catch(() => {});
    pintar(); rep.focus();
    if (opc.proyectar) {
      const caja = $("[data-proy]", rep);
      caja.hidden = false;
      caja.innerHTML = `<span class="cargando"></span> Preparando la pantalla del público…`;
      NOM.api.post(`/api/documentos/${ed.id}/proyeccion`).then(async (r) => {
        codigo = r.codigo;
        let bases = [];
        try { const esp = await NOM.api.get(`/api/espacios/${ed.espacio.id}`); bases = NOM.union.bases(esp.conexionDetalle); } catch (e) { bases = NOM.union.bases(null); }
        const url = bases[0] ? `${bases[0]}/proyectar?c=${codigo}` : "";
        caja.innerHTML = `<div class="pv-qr">${url ? NOM.qr.svg(url, { titulo: "QR para proyectar" }) : ""}</div>
          <div><b>Pantalla del público</b><small>En la computadora del proyector abre <b>${esc(url ? url.replace(/^https?:\/\//, "").replace(/\/proyectar.*$/, "") : "NOM-COLAB")}/proyectar</b> y escribe <b class="qr-codigo chico">${esc(codigo)}</b>, o escanea el QR. Aquí la mueves.</small>
          ${url && !NOM.api.empaquetada ? `<button class="btn chico" data-abrir>${ico("monitor", "ico-s")} Abrir en otra ventana</button>` : ""}</div>`;
        const ab = $("[data-abrir]", caja); if (ab) ab.onclick = () => window.open(url, "nom-proyector", "noopener");
        avisarProyector();
      }).catch((e) => { caja.innerHTML = `<div class="alerta error">${ico("triangle-alert")}<span>${esc(e.red ? "Para proyectar en otra pantalla hace falta conexión" : e.message)}</span></div>`; });
    }
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
        { id: "iconos", icono: "star", micro: "Íconos|Más de 250 dibujos: personas, ciencia, redes… (sin internet).", fn: () => bibliotecaIconos(ed, lienzo), mantenerFoco: false },
        { id: "listos", icono: "network", micro: "Diagramas listos|Ciclo, línea del tiempo, organigrama, mapa mental, Venn, FODA, espina de pescado, UML, entidad-relación…", fn: () => NOM.diagramas && NOM.diagramas.elegir(lienzo), mantenerFoco: false },
        "|",
        { id: "color", icono: "palette", micro: "Color|Cambia el color de las figuras seleccionadas.", fn: (e, b) => menuColor(lienzo, b), off: () => !lienzo.seleccion() },
        { id: "alinear", icono: "al-centro-h", micro: "Alinear y distribuir|Elige dos o más figuras.", fn: (e, b) => menuAlinear(lienzo, b), off: () => lienzo.cuantos() < 2 },
        { id: "frente", icono: "bring-to-front", micro: "Traer al frente||Ctrl+Mayús+]", fn: () => lienzo.capaZ("frente"), off: () => !lienzo.seleccion() },
        { id: "duplicar", icono: "copy", micro: "Duplicar||Ctrl+D", fn: () => lienzo.duplicar(), off: () => !lienzo.seleccion() },
        { id: "borrar", icono: "trash-2", micro: "Eliminar|Borra las figuras y sus flechas.|Supr", fn: () => lienzo.eliminar(), off: () => !lienzo.seleccion() },
        { id: "capas", icono: "layers", micro: "Capas|Ocultar, bloquear y ordenar las figuras.", fn: () => lienzo.capas.abrir() },
        { id: "cuadricula", icono: "magnet", micro: "Ajustar a la cuadrícula|Al mover o cambiar el tamaño, las figuras caen en los puntos (con Alt, libres).", fn: () => { lienzo.fijarCuadricula(!lienzo.cuadricula()); ed.refrescarHerramientas(); }, activo: () => lienzo.cuadricula() },
        { id: "comentar", icono: "message-square", micro: "Comentar|Comenta la figura elegida. Funciona sin Internet.", fn: () => NOM.comentarios && NOM.comentarios.nuevo(ed), clase: "solo-escritorio" },
      ];
      this.resaltarCambios = (c) => lienzo.resaltar(c);
      this.comentarios = {
        ancla: () => lienzo.anclaComentario(),
        irA: (a) => { if (a.pagina && ed.doc.paginas().includes(a.pagina) && a.pagina !== ed.pagina) { ed.pagina = a.pagina; lienzo.render(); } return a.id ? lienzo.irABloque(a.id) : true; },
        pintar: (l) => lienzo.marcarComentarios(l),
      };
      if (!ed.doc.deLaPagina(ed.pagina).length && !ed.soloLectura) {
        const p = html(`<div class="pista">${ico("info", "ico-s")} Elige una figura arriba y haz clic en el lienzo. Clic derecho (o mantener el dedo) en el lienzo vacío para más</div>`);
        ed.lienzo.append(p);
        setTimeout(() => p.remove(), 6500);
      }
      this.cambios = (l) => lienzo.cambios(l);
      this.desmontar = () => { lienzo.destruir(); ed.lienzo.style.overflow = ""; };
    },
    herramientas() { return this._herr || []; },
    acciones(ed) {
      const l = this._lienzo;
      if (!l || ed.soloLectura) return [];
      return [
        { texto: "Insertar un diagrama listo…", icono: "network", fn: () => NOM.diagramas && NOM.diagramas.elegir(l), claves: "plantilla ciclo linea tiempo organigrama mapa mental venn espina pescado ishikawa foda mapa conceptual clases casos uso entidad relacion flujo" },
        { texto: "Convertir un texto en diagrama…", icono: "list-tree", fn: () => NOM.diagramas && NOM.diagramas.desdeTexto(l), claves: "lista esquema pasos generar automatico" },
        { texto: "Figuras de UML, entidad-relación y redes…", icono: "shapes", fn: () => menuFiguras(l, { x: innerWidth / 2, y: innerHeight / 3 }), claves: "uml clase actor caso uso entidad relacion atributo red servidor router" },
        { texto: "Íconos…", icono: "star", fn: () => bibliotecaIconos(ed, l), claves: "iconos dibujos elementos" },
        { texto: l.cuadricula() ? "Quitar el ajuste a la cuadrícula" : "Ajustar a la cuadrícula", icono: "magnet", fn: () => { l.fijarCuadricula(!l.cuadricula()); ed.refrescarHerramientas(); }, claves: "cuadricula rejilla iman alinear" },
      ];
    },
  };

  /** 8.4 Vista previa de varios bloques (galería de diagramas listos y texto a diagrama). */
  function vistaPrevia(lista, uniones, ancho, alto) {
    if (!lista.length) return `<div class="dg-previa" style="width:${ancho}px;height:${alto}px"></div>`;
    const x1 = Math.min(...lista.map((b) => b.x)) - 12, y1 = Math.min(...lista.map((b) => b.y)) - 12;
    const x2 = Math.max(...lista.map((b) => b.x + b.w)) + 12, y2 = Math.max(...lista.map((b) => b.y + b.h)) + 12;
    const k = Math.min(ancho / (x2 - x1), alto / (y2 - y1), 1.2);
    const bs = lista.map((b, i) => Object.assign({ id: "v" + i }, b));
    const porId = Object.fromEntries(bs.map((b) => [b.id, b]));
    const cs = (uniones || []).filter(([a, b2]) => porId["v" + a] && porId["v" + b2]).map(([a, b2, o]) => Object.assign({ desde: "v" + a, hasta: "v" + b2 }, o || {}));
    return `<div class="dg-previa" style="width:${ancho}px;height:${alto}px"><div class="dg-previa-mundo" style="transform:translate(${n2((ancho - (x2 - x1) * k) / 2 - x1 * k)}px,${n2((alto - (y2 - y1) * k) / 2 - y1 * k)}px) scale(${n2(k)})">
      <svg class="capa-conectores" width="1" height="1" aria-hidden="true">${cs.map((c) => svgConector(c, porId[c.desde], porId[c.hasta])).join("")}</svg>
      ${bs.map((b, i) => `<div class="bl${clasesBloque(b)}" style="${estiloBloque(b, i)}">${contenido(b)}</div>`).join("")}</div></div>`;
  }
  NOM.lienzoVista.vistaPrevia = vistaPrevia;
})();
