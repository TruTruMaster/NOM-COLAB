/* NOM-COLAB · Diagramas listos y texto a diagrama (8.4 y fase 9).
   Cada diagrama es una función que acomoda figuras y flechas a partir de datos sencillos (una lista
   de pasos, un esquema con sangría…). La galería los muestra con un ejemplo; "texto a diagrama" usa
   lo que la persona escribe. Nada se inventa: el contenido siempre es el de la persona. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso } = NOM;
  const CLAROS = ["#CFE0FF", "#CDEFD9", "#FFE0BF", "#FFD6DE", "#E4D9FF", "#FFF1B8", "#C9F0F5", "#FDE2F3"];
  const FUERTES = ["#3D72F2", "#2FA868", "#F08C2A", "#F2385A", "#8B5CF6", "#C9A100", "#0091C7", "#C2185B"];
  const TINTA = "#2B2A33", GRIS = "#6B6875";
  const forma = (figura, x, y, w, h, texto, extra) => Object.assign({ tipo: "forma", figura, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), texto: texto || "" }, extra || {});
  const texto = (x, y, w, h, contenido, extra) => Object.assign({ tipo: "texto", estilo: "p", x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), html: contenido }, extra || {});
  const corto = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1) + "…" : String(t));

  // ------------------------------------------------------------ leer lo que escribe la persona
  /** Esquema con sangría → árbol { t, enlace, hijos }. "(tiene) Núcleo" pone la palabra de enlace. */
  function leerEsquema(txt) {
    const raiz = { t: "", hijos: [], nivel: -1 }, pila = [raiz];
    String(txt || "").split(/\r?\n/).filter((l) => l.trim()).forEach((l) => {
      const m = /^(\s*)(?:[-*•·+]|\d+[.)])?\s*(.*)$/.exec(l.replace(/\t/g, "    "));
      const nivel = m[1].length;
      let t = m[2].trim(), enlace = null;
      const e = /^\(([^)]{1,40})\)\s*(.+)$/.exec(t);
      if (e) { enlace = e[1].trim(); t = e[2].trim(); }
      while (pila.length > 1 && pila[pila.length - 1].nivel >= nivel) pila.pop();
      const nodo = { t, enlace, hijos: [], nivel };
      pila[pila.length - 1].hijos.push(nodo);
      pila.push(nodo);
    });
    return raiz.hijos.length === 1 ? raiz.hijos[0] : { t: "Tema", hijos: raiz.hijos };
  }
  /** Lista simple: cada línea con algo es un elemento (sin viñetas ni números al inicio). */
  const leerLista = (txt) => String(txt || "").split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•·+]|\d+[.)])?\s*/, "").trim()).filter(Boolean);
  /** "1810: Inicia la Independencia" → { fecha, texto }. */
  const leerFechas = (txt) => leerLista(txt).map((l) => { const m = /^(.{1,24}?)\s*(?::|–|—|\s-\s)\s*(.+)$/.exec(l); return m ? { fecha: m[1].trim(), texto: m[2].trim() } : { fecha: "", texto: l }; });

  // ------------------------------------------------------------ diagramas
  /** Pasos de un proceso, de izquierda a derecha (en zigzag si son muchos). */
  function proceso(items) {
    const bloques = [], uniones = [], W = 170, H = 80, GX = 70, GY = 90, POR = 4;
    items.slice(0, 24).forEach((t, i) => {
      const fila = Math.floor(i / POR), col = fila % 2 ? POR - 1 - (i % POR) : i % POR;
      const ext = i === 0 || i === items.length - 1;
      bloques.push(forma(ext ? "elipse" : "rect", col * (W + GX), fila * (H + GY), W, H, corto(t, 80), { color: ext ? CLAROS[1] : CLAROS[0] }));
      if (i) uniones.push([i - 1, i, Math.floor((i - 1) / POR) !== fila ? { ruta: "codo" } : {}]);
    });
    return { bloques, uniones };
  }
  /** Ciclo: los pasos en círculo y el último vuelve al primero. */
  function ciclo(items, titulo) {
    const n = Math.max(2, Math.min(12, items.length)), W = 170, H = 76, R = Math.max(170, n * 46);
    const bloques = items.slice(0, n).map((t, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return forma("rect", R * Math.cos(a) - W / 2, R * Math.sin(a) - H / 2, W, H, corto(t, 70), { color: CLAROS[i % CLAROS.length] });
    });
    const uniones = bloques.map((_, i) => [i, (i + 1) % n, { grosor: 3, color: GRIS }]);
    if (titulo) bloques.push(texto(-110, -28, 220, 56, `<div style="text-align:center"><b>${esc(titulo)}</b></div>`, { tTam: 24 }));
    return { bloques, uniones };
  }
  /** Línea del tiempo: fechas sobre una línea y lo que pasó arriba y abajo, alternando. */
  function lineaTiempo(eventos) {
    const n = Math.max(1, Math.min(16, eventos.length)), PASO = 230, bloques = [], uniones = [];
    bloques.push(forma("linea-flecha", -60, -12, (n - 1) * PASO + 160, 24, "", { borde: TINTA, bordeAncho: 4 }));
    eventos.slice(0, n).forEach((ev, i) => {
      const x = i * PASO, arriba = i % 2 === 0;
      const m = bloques.push(forma("elipse", x - 13, -13, 26, 26, "", { color: FUERTES[i % FUERTES.length], sombra: false })) - 1;
      const contenido = (ev.fecha ? `<b>${esc(ev.fecha)}</b>` + (ev.texto ? "<br>" : "") : "") + esc(corto(ev.texto, 90));
      const t = bloques.push(forma("rect", x - 100, arriba ? -190 : 70, 200, 120, ev.texto || ev.fecha, { html: `<div>${contenido}</div>`, color: "#FFFFFF", borde: FUERTES[i % FUERTES.length], bordeAncho: 2, tNegrita: false, tTam: 15 })) - 1;
      uniones.push([m, t, { puntas: "ninguna", color: FUERTES[i % FUERTES.length], grosor: 2 }]);
    });
    return { bloques, uniones };
  }
  /** Árbol de arriba hacia abajo (organigrama y mapa conceptual). */
  function arbolVertical(raiz, opc) {
    const W = opc.w, H = opc.h, GX = opc.gx, GY = opc.gy, bloques = [], uniones = [];
    const ancho = (n) => (n.ancho = Math.max(W, (n.hijos || []).reduce((s, h, i) => s + ancho(h) + (i ? GX : 0), 0)));
    ancho(raiz);
    const poner = (n, x, y, nivel, padre, rama) => {
      const i = bloques.push(opc.nodo(n, x + n.ancho / 2 - W / 2, y, nivel, rama)) - 1;
      if (padre != null) uniones.push([padre, i, opc.union(n, nivel, rama)]);
      let cx = x;
      (n.hijos || []).forEach((h, j) => { poner(h, cx, y + H + GY, nivel + 1, i, nivel === 0 ? j : rama); cx += h.ancho + GX; });
    };
    poner(raiz, 0, 0, 0, null, 0);
    return { bloques, uniones };
  }
  function organigrama(raiz) {
    return arbolVertical(raiz, {
      w: 170, h: 64, gx: 26, gy: 70,
      nodo: (n, x, y, nivel, rama) => forma("rect", x, y, 170, 64, corto(n.t, 60), nivel === 0 ? { color: FUERTES[0] } : { color: nivel === 1 ? CLAROS[rama % CLAROS.length] : "#FFFFFF", borde: nivel > 1 ? FUERTES[rama % FUERTES.length] : undefined, bordeAncho: nivel > 1 ? 2 : undefined }),
      union: () => ({ ruta: "codo", puntas: "ninguna", color: GRIS }),
    });
  }
  function mapaConceptual(raiz) {
    return arbolVertical(raiz, {
      w: 170, h: 64, gx: 40, gy: 120,
      nodo: (n, x, y, nivel, rama) => forma(nivel === 0 ? "elipse" : "rect", x, y, 170, 64, corto(n.t, 60), { color: nivel === 0 ? FUERTES[4] : CLAROS[(nivel === 1 ? rama : rama + 3) % CLAROS.length], radio: nivel ? 32 : undefined }),
      union: (n) => ({ etiqueta: n.enlace || null, color: GRIS }),
    });
  }
  /** Mapa mental: la idea al centro y las ramas alrededor, cada una con su color. */
  function mapaMental(raiz) {
    const bloques = [forma("elipse", -110, -50, 220, 100, corto(raiz.t, 50), { color: FUERTES[4], tTam: 20 })], uniones = [];
    const hs = (raiz.hijos || []).slice(0, 12), n = Math.max(1, hs.length), R1 = Math.max(270, n * 42);
    hs.forEach((h, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n, cx = R1 * Math.cos(a), cy = R1 * Math.sin(a) * 0.8;
      const k = bloques.push(forma("rect", cx - 85, cy - 32, 170, 64, corto(h.t, 60), { color: CLAROS[i % CLAROS.length], radio: 32 })) - 1;
      uniones.push([0, k, { ruta: "curva", puntas: "ninguna", grosor: 4, color: FUERTES[i % FUERTES.length] }]);
      const ns = (h.hijos || []).slice(0, 8), m = ns.length, abre = Math.min(0.55, (2 * Math.PI) / n / Math.max(1, m) * 0.9);
      ns.forEach((g, j) => {
        const b = a + (j - (m - 1) / 2) * abre, R2 = R1 + 230;
        const x = R2 * Math.cos(b), y = R2 * Math.sin(b) * 0.85;
        const q = bloques.push(forma("rect", x - 75, y - 24, 150, 48, corto(g.t, 50), { color: "#FFFFFF", borde: FUERTES[i % FUERTES.length], bordeAncho: 2, radio: 24, tNegrita: false, tTam: 14 })) - 1;
        uniones.push([k, q, { ruta: "curva", puntas: "ninguna", grosor: 2, color: FUERTES[i % FUERTES.length] }]);
      });
    });
    return { bloques, uniones };
  }
  /** Diagrama de Venn de 2 o 3 conjuntos, con lo que es solo de cada uno y lo que comparten. */
  function venn(nombres) {
    const n = nombres.length >= 3 ? 3 : 2, D = 300, bloques = [];
    const centros = n === 2 ? [[0, 0], [190, 0]] : [[0, 0], [190, 0], [95, 165]];
    centros.forEach(([x, y], i) => bloques.push(forma("elipse", x, y, D, D, "", { color: [CLAROS[0], CLAROS[3], CLAROS[5]][i], opacidad: 0.7, borde: FUERTES[[0, 3, 5][i]], bordeAncho: 2, sombra: false })));
    const etq = (x, y, w, t, neg) => bloques.push(texto(x, y, w, 40, `<div style="text-align:center">${neg ? `<b>${esc(t)}</b>` : esc(t)}</div>`, { tTam: neg ? 20 : 15 }));
    if (n === 2) {
      etq(-10, -48, 300, nombres[0], true); etq(200, -48, 300, nombres[1], true);
      etq(40, 130, 130, "Solo " + nombres[0]); etq(330, 130, 130, "Solo " + nombres[1]); etq(215, 130, 80, "Los dos");
    } else {
      etq(-10, -48, 300, nombres[0], true); etq(200, -48, 300, nombres[1], true); etq(95, 472, 300, nombres[2], true);
      etq(40, 100, 120, "Solo " + nombres[0]); etq(340, 100, 120, "Solo " + nombres[1]); etq(185, 350, 120, "Solo " + nombres[2]);
      etq(205, 205, 80, "Los tres");
    }
    return { bloques, uniones: [] };
  }
  /** Espina de pescado (Ishikawa): el problema en la cabeza y las causas por categoría en las espinas. */
  function espina(problema, categorias) {
    const cats = categorias.slice(0, 6), arriba = Math.ceil(cats.length / 2), bloques = [], uniones = [];
    const largo = Math.max(2, arriba) * 300 + 160;
    bloques.push(forma("linea-flecha", 0, -12, largo, 24, "", { borde: TINTA, bordeAncho: 5 }));
    bloques.push(forma("rect", largo + 10, -55, 210, 110, corto(problema, 80), { color: FUERTES[3], radio: 10 }));
    cats.forEach((c, i) => {
      const deArriba = i < arriba, k = deArriba ? i : i - arriba, sx = 250 + k * 300, s = deArriba ? -1 : 1;
      const ex = sx - 130, ey = s * 190, L = Math.hypot(130, 190), ang = (Math.atan2(190 * s * -1, 130) * 180) / Math.PI;
      bloques.push(forma("linea", (sx + ex) / 2 - L / 2, ey / 2 - 10, L, 20, "", { borde: GRIS, bordeAncho: 3, rot: Math.round((ang + 360) % 360) }));
      bloques.push(forma("rect", ex - 90, ey + (deArriba ? -60 : 4), 180, 56, corto(c.t, 40), { color: CLAROS[i % CLAROS.length], radio: 10 }));
      (c.hijos || []).slice(0, 4).forEach((h, j) => {
        const f = 0.3 + j * 0.2, px = sx + (ex - sx) * f, py = ey * f;
        bloques.push(texto(px - 175, py - 14, 165, 30, `<div style="text-align:right">${esc(corto(h.t, 40))}</div>`, { tTam: 14 }));
      });
    });
    return { bloques, uniones };
  }
  /** FODA: fortalezas, oportunidades, debilidades y amenazas en cuatro cuadros. */
  function foda(datos) {
    const C = [["Fortalezas", 0, 0, CLAROS[1]], ["Oportunidades", 1, 0, CLAROS[0]], ["Debilidades", 0, 1, CLAROS[2]], ["Amenazas", 1, 1, CLAROS[3]]];
    const bloques = C.map(([t, c, f, col], i) => {
      const puntos = (datos && datos[i] && datos[i].length ? datos[i] : ["…", "…"]).slice(0, 8);
      return forma("rect", c * 340, f * 230, 320, 210, t, { color: col, radio: 14, tAlin: "izq", html: `<div><b>${esc(t)}</b></div>` + puntos.map((p) => `<div>• ${esc(p)}</div>`).join(""), tNegrita: false });
    });
    bloques.push(texto(0, -48, 320, 36, '<div style="text-align:center"><b>Internas</b> (de nosotros)</div>', { tTam: 15 }));
    bloques.push(texto(340, -48, 320, 36, '<div style="text-align:center"><b>Externas</b> (del entorno)</div>', { tTam: 15 }));
    return { bloques, uniones: [] };
  }
  const P = () => NOM.figuras.PRESETS;
  const fig = (clave, x, y, extra) => { const pr = P()[clave]; return Object.assign({ tipo: "forma" }, pr, { x, y }, extra || {}); };
  /**
   * Diagrama de flujo desde un texto: un paso por línea; una pregunta («¿…?») es una decisión y
   * debajo, con sangría, van sus caminos «Sí: …» y «No: …» (cada uno puede tener más pasos con más
   * sangría). Los dos caminos se juntan en el siguiente paso.
   */
  function flujo(txt) {
    const lineas = String(txt || "").split(/\r?\n/).map((l) => ({ n: (l.replace(/\t/g, "    ").match(/^\s*/) || [""])[0].length, t: l.replace(/^\s*(?:[-*•·+]|\d+[.)])?\s*/, "").trim() })).filter((l) => l.t);
    if (!lineas.length) return { bloques: [], uniones: [] };
    const base = Math.min(...lineas.map((l) => l.n));
    // Pasos de arriba y, en cada decisión, sus caminos.
    const pasos = [];
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      if (l.n > base) continue;
      const paso = { t: l.t, caminos: [] };
      let k = i + 1;
      while (k < lineas.length && lineas[k].n > base) {
        const m = /^(s[ií]|no|verdadero|falso|v|f)\s*[:\-–]\s*(.*)$/i.exec(lineas[k].t);
        if (m) paso.caminos.push({ etiqueta: /^(s[ií]|verdadero|v)$/i.test(m[1]) ? "Sí" : "No", pasos: m[2] ? [m[2]] : [], n: lineas[k].n });
        else if (paso.caminos.length) paso.caminos[paso.caminos.length - 1].pasos.push(lineas[k].t);
        k++;
      }
      pasos.push(paso);
    }
    const W = 200, H = 76, GY = 64, bloques = [], uniones = [];
    const figura = (t, i, total) => (/[?¿]/.test(t) ? "rombo" : /^(inicio|comienz|empez|fin\b|final|termina)/i.test(t) || ((i === 0 || i === total - 1) && t.split(" ").length <= 2) ? "elipse"
      : /^(leer|lee|escrib|mostrar|muestra|imprim|pedir|pide|captur|ingres|entrada|salida)/i.test(t) ? "paralelogramo" : "rect");
    const color = { elipse: CLAROS[1], rombo: CLAROS[2], paralelogramo: CLAROS[5], rect: CLAROS[0] };
    const poner = (t, x, y, fig) => bloques.push(forma(fig, x - (fig === "rombo" ? 120 : W / 2), y, fig === "rombo" ? 240 : W, fig === "rombo" ? 120 : H, corto(t, 70), { color: color[fig] })) - 1;
    let y = 0, pendientes = [];   // [índice, etiqueta]: lo que debe unirse con el siguiente paso
    pasos.forEach((p, i) => {
      const fig = p.caminos.length ? "rombo" : figura(p.t, i, pasos.length);
      const k = poner(p.t, 0, y, fig);
      pendientes.forEach(([a, et]) => uniones.push([a, k, Object.assign({ ruta: "codo" }, et ? { etiqueta: et } : {})]));
      pendientes = [];
      y += (fig === "rombo" ? 120 : H) + GY;
      if (!p.caminos.length) { pendientes.push([k, null]); return; }
      // Sí a la izquierda, No a la derecha; cada camino baja con sus pasos.
      const lados = p.caminos.slice(0, 2);
      let fondo = y;
      lados.forEach((c, j) => {
        const x = lados.length === 1 ? -260 : j === 0 ? -260 : 260;
        let yy = y, ant = k, et = c.etiqueta;
        c.pasos.forEach((t) => {
          const q = poner(t, x, yy, figura(t, 1, 3));
          uniones.push([ant, q, Object.assign({ ruta: "codo" }, et ? { etiqueta: et } : {})]);
          et = null; ant = q; yy += H + GY;
        });
        if (c.pasos.length) pendientes.push([ant, null]); else pendientes.push([k, c.etiqueta]);
        fondo = Math.max(fondo, yy);
      });
      if (lados.length === 1) pendientes.push([k, lados[0].etiqueta === "Sí" ? "No" : "Sí"]);
      y = fondo;
    });
    return { bloques, uniones };
  }
  /** Diagrama de clases de ejemplo: herencia (triángulo hueco) y una asociación con cardinalidad. */
  function clases() {
    const b = [
      fig("clase", 230, 0, { texto: "Persona\n- nombre: texto\n- edad: número\n+ saludar()", w: 220, h: 150 }),
      fig("clase", 0, 260, { texto: "Alumno\n- matrícula: texto\n+ inscribirse()\n+ entregarTarea()", w: 220, h: 150 }),
      fig("clase", 460, 260, { texto: "Maestro\n- materia: texto\n+ calificar()", w: 220, h: 140 }),
      fig("clase", 460, 500, { texto: "Grupo\n- clave: texto\n- turno: texto", w: 220, h: 120 }),
    ];
    return { bloques: b, uniones: [[1, 0, { ruta: "codo", tipoPunta: "hueco" }], [2, 0, { ruta: "codo", tipoPunta: "hueco" }], [2, 3, { puntas: "ninguna", etiqueta: "imparte", etqIni: "1", etqFin: "1..*" }]] };
  }
  /** Casos de uso de ejemplo: actores afuera y los casos dentro del sistema. */
  function casosUso() {
    const b = [
      forma("rect", 160, -40, 340, 420, "", { color: "#FFFFFF", borde: TINTA, bordeAncho: 2, radio: 6, sombra: false }),
      texto(170, -34, 320, 34, "<div style=\"text-align:center\"><b>Sistema de tareas</b></div>", { tTam: 16 }),
      fig("actor", 0, 110, { texto: "Alumno" }),
      fig("actor", 590, 110, { texto: "Maestro" }),
      fig("caso-uso", 235, 20, { texto: "Iniciar sesión" }),
      fig("caso-uso", 235, 140, { texto: "Entregar tarea" }),
      fig("caso-uso", 235, 260, { texto: "Calificar tarea" }),
    ];
    return { bloques: b, uniones: [[2, 5, { puntas: "ninguna" }], [3, 6, { puntas: "ninguna" }], [3, 4, { puntas: "ninguna" }], [2, 4, { puntas: "ninguna" }], [5, 4, { estilo: "guiones", tipoPunta: "abierta", etiqueta: "«incluye»" }]] };
  }
  /** Entidad-relación (notación de Chen) de ejemplo, con atributos y cardinalidad. */
  function entidadRelacion() {
    const b = [
      fig("entidad", 0, 160, { texto: "Alumno", h: 70, w: 170 }),
      fig("relacion", 260, 150, { texto: "cursa" }),
      fig("entidad", 510, 160, { texto: "Materia", h: 70, w: 170 }),
      fig("atributo-clave", -60, 20, { texto: "matrícula" }),
      fig("atributo", 110, 20, { texto: "nombre" }),
      fig("atributo", 270, 300, { texto: "calificación" }),
      fig("atributo-clave", 450, 20, { texto: "clave" }),
      fig("atributo", 620, 20, { texto: "nombre" }),
    ];
    const sin = { puntas: "ninguna" };
    return { bloques: b, uniones: [[0, 1, Object.assign({ etqIni: "N" }, sin)], [1, 2, Object.assign({ etqFin: "M" }, sin)], [3, 0, sin], [4, 0, sin], [5, 1, sin], [6, 2, sin], [7, 2, sin]] };
  }

  // ------------------------------------------------------------ catálogo (con un ejemplo cada uno)
  const EJ = {
    flujo: "Inicio\nLeer la edad\n¿La edad es 18 o más?\n  Sí: Puede votar\n  No: Todavía no puede votar\nFin",
    pasos: "Investigar el tema\nHacer un esquema\nEscribir el borrador\nRevisar con el equipo\nEntregar",
    ciclo: "Evaporación\nCondensación\nPrecipitación\nEscurrimiento",
    tiempo: "1810: Inicia la Independencia\n1821: Consumación de la Independencia\n1857: Constitución de 1857\n1910: Inicia la Revolución\n1917: Constitución de 1917",
    organigrama: "Dirección\n  Subdirección académica\n    Maestros de primero\n    Maestros de segundo\n  Subdirección administrativa\n    Control escolar\n    Biblioteca",
    mental: "Energías renovables\n  Solar\n    Paneles\n    Calentadores\n  Eólica\n    Aerogeneradores\n  Hidráulica\n    Presas\n  Biomasa",
    conceptual: "Célula\n  (tiene) Núcleo\n    (contiene) ADN\n  (tiene) Membrana\n  (puede ser) Animal\n  (puede ser) Vegetal\n    (tiene) Pared celular",
    venn: "Animales\nPlantas",
    espina: "Bajas calificaciones\n  Alumno\n    Poco tiempo de estudio\n    Desvelo\n  Escuela\n    Grupos grandes\n  Casa\n    Ruido\n  Materiales\n    Sin libros",
    foda: "Fortalezas\n  Equipo unido\nOportunidades\n  Concurso de ciencias\nDebilidades\n  Poco presupuesto\nAmenazas\n  Poco tiempo",
  };
  const CATALOGO = [
    { id: "flujo", t: "Diagrama de flujo", d: "Un paso por línea; una «¿pregunta?» con «Sí:» y «No:» debajo.", texto: true, hacer: (t) => flujo(t) },
    { id: "pasos", t: "Proceso por pasos", d: "Una cosa después de otra.", texto: true, hacer: (t) => proceso(leerLista(t)) },
    { id: "ciclo", t: "Ciclo", d: "Pasos que se repiten (como el ciclo del agua).", texto: true, hacer: (t) => ciclo(leerLista(t)) },
    { id: "tiempo", t: "Línea del tiempo", d: "Fechas y lo que pasó. Escribe «fecha: suceso».", texto: true, hacer: (t) => lineaTiempo(leerFechas(t)) },
    { id: "organigrama", t: "Organigrama", d: "Quién depende de quién. Usa sangría.", texto: true, hacer: (t) => organigrama(leerEsquema(t)) },
    { id: "mental", t: "Mapa mental", d: "La idea al centro y sus ramas. Usa sangría.", texto: true, hacer: (t) => mapaMental(leerEsquema(t)) },
    { id: "conceptual", t: "Mapa conceptual", d: "Conceptos unidos con palabras: «(tiene) Núcleo».", texto: true, hacer: (t) => mapaConceptual(leerEsquema(t)) },
    { id: "venn", t: "Diagrama de Venn", d: "Lo que es solo de cada uno y lo que comparten (2 o 3).", texto: true, hacer: (t) => venn(leerLista(t).slice(0, 3).concat(["A", "B"]).slice(0, Math.max(2, Math.min(3, leerLista(t).length)))) },
    { id: "espina", t: "Espina de pescado", d: "Causas de un problema por categoría (Ishikawa).", texto: true, hacer: (t) => { const a = leerEsquema(t); return espina(a.t, a.hijos.length ? a.hijos : [{ t: "Personas" }, { t: "Métodos" }, { t: "Materiales" }, { t: "Entorno" }]); } },
    { id: "foda", t: "FODA", d: "Fortalezas, oportunidades, debilidades y amenazas.", texto: true, hacer: (t) => { const a = leerEsquema(t), l = a.t === "Tema" ? a.hijos : [a]; return foda([0, 1, 2, 3].map((i) => (l[i] ? l[i].hijos.map((h) => h.t) : []))); } },
    { id: "clases", t: "Diagrama de clases (UML)", d: "Clases con atributos y métodos, herencia y asociación.", hacer: clases },
    { id: "casos", t: "Casos de uso (UML)", d: "Actores y lo que hacen en el sistema.", hacer: casosUso },
    { id: "er", t: "Entidad-relación", d: "Entidades, relaciones, atributos y cardinalidad.", hacer: entidadRelacion },
  ];
  const generar = (c, t) => { try { return c.hacer(t != null ? t : EJ[c.id] || ""); } catch (e) { return { bloques: [], uniones: [] }; } };

  /** Galería de diagramas listos: tocar uno lo pone en el lienzo (todo elegido, para moverlo junto). */
  function elegir(lienzo, punto) {
    if (!NOM.lienzoVista || !NOM.lienzoVista.vistaPrevia) return;
    const cuerpo = html(`<div class="col"><p class="suave" style="margin:0">Toca uno para ponerlo en el lienzo con un ejemplo; luego cambia los textos con doble clic. ¿Ya tienes tu lista o tu esquema? Usa <b>Desde mi texto</b>.</p>
      <div class="dg-galeria">${CATALOGO.map((c) => { const g = generar(c); return `<button type="button" class="dg-tarjeta" data-d="${c.id}">${NOM.lienzoVista.vistaPrevia(g.bloques, g.uniones, 200, 120)}<b>${esc(c.t)}</b><small>${esc(c.d)}</small></button>`; }).join("")}</div></div>`);
    const pie = html(`<div style="display:contents"><button class="btn" type="button" data-texto>${ico("list-tree", "ico-s")} Desde mi texto…</button><span class="crece"></span><button class="btn" type="button" data-no>Cerrar</button></div>`);
    const h = NOM.hoja({ titulo: "Diagramas listos", icono: "network", cuerpo, pie, ancha: true });
    $("[data-no]", pie).onclick = () => h.cerrar();
    $("[data-texto]", pie).onclick = () => { h.cerrar(); desdeTexto(lienzo, null, punto); };
    cuerpo.addEventListener("click", (e) => {
      const x = e.target.closest("[data-d]");
      if (!x) return;
      const c = CATALOGO.find((y) => y.id === x.dataset.d), g = generar(c);
      h.cerrar();
      const ids = lienzo.insertarBloques(g.bloques, g.uniones, punto);
      if (ids.length) aviso(`${c.t} listo: cambia los textos con doble clic`, { tipo: "ok", ms: 2600 });
    });
  }

  /** 9 Texto a diagrama: la persona escribe su lista o esquema y elige cómo verlo; se acomoda solo. */
  function desdeTexto(lienzo, tipo, punto, textoInicial) {
    const conTexto = CATALOGO.filter((c) => c.texto);
    let actual = conTexto.find((c) => c.id === tipo) || conTexto[0];
    const cuerpo = html(`<div class="col">
      <div class="segmentado" role="group" aria-label="Tipo de diagrama" style="flex-wrap:wrap" data-tipos>${conTexto.map((c) => `<button type="button" data-t="${c.id}" aria-pressed="${c === actual}">${esc(c.t)}</button>`).join("")}</div>
      <div class="dg-texto"><div class="col" style="gap:6px"><label class="suave chico" for="dg-txt" data-ayuda></label><textarea id="dg-txt" spellcheck="true" data-txt></textarea>
        <small class="suave">Una idea por línea. Con espacios al inicio (sangría) dices de quién depende.</small></div>
        <div class="col" style="gap:6px"><span class="suave chico">Así queda</span><div data-previa></div></div></div></div>`);
    const pie = html(`<div style="display:contents"><button class="btn" type="button" data-no>Cancelar</button><button class="btn primario" data-si>Poner en el lienzo</button></div>`);
    const h = NOM.hoja({ titulo: "Texto a diagrama", icono: "list-tree", cuerpo, pie, ancha: true });
    const ta = $("[data-txt]", cuerpo), previa = $("[data-previa]", cuerpo);
    let editado = !!textoInicial;
    ta.value = textoInicial || EJ[actual.id] || "";
    const pintar = () => {
      $("[data-ayuda]", cuerpo).textContent = actual.d;
      const g = generar(actual, ta.value);
      previa.innerHTML = NOM.lienzoVista.vistaPrevia(g.bloques, g.uniones, Math.max(240, previa.clientWidth || 360), 300);
    };
    const pintarLuego = NOM.debounce ? NOM.debounce(pintar, 200) : pintar;
    ta.addEventListener("input", () => { editado = true; pintarLuego(); });
    $("[data-tipos]", cuerpo).addEventListener("click", (e) => {
      const x = e.target.closest("[data-t]");
      if (!x) return;
      actual = conTexto.find((c) => c.id === x.dataset.t);
      $$("[data-t]", cuerpo).forEach((y) => y.setAttribute("aria-pressed", y === x));
      // Si la persona no ha escrito nada propio, se cambia el ejemplo por el del tipo elegido.
      if (!editado) ta.value = EJ[actual.id] || "";
      pintar();
    });
    requestAnimationFrame(pintar);
    $("[data-no]", pie).onclick = () => h.cerrar();
    $("[data-si]", pie).onclick = () => {
      const g = generar(actual, ta.value);
      if (!g.bloques.length) { aviso("Escribe al menos una idea", { tipo: "aviso" }); return; }
      h.cerrar();
      lienzo.insertarBloques(g.bloques, g.uniones, punto);
    };
  }

  NOM.diagramas = { generar, EJEMPLOS: EJ, CATALOGO, elegir, desdeTexto, leerEsquema, leerLista, leerFechas, proceso, ciclo, lineaTiempo, organigrama, mapaMental, mapaConceptual, venn, espina, foda, flujo, clases, casosUso, entidadRelacion };
})();
