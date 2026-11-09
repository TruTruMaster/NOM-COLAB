/* NOM-COLAB · gráficas (8.1, 8.3 y 9.6). Las usan la hoja de cálculo, las diapositivas y los
   reportes automáticos: a partir de un rango de una hoja se arma un SVG que se actualiza solo.
   Tipos: barras, barras horizontales, líneas, área, dispersión (x, y) y pastel. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const esc = (s) => NOM.esc(s);
  const F = () => NOM.formulas;

  const PALETAS = {
    clasica: { t: "Clásica", c: ["#3D72F2", "#F08C2A", "#2FA868", "#8B5CF6", "#F2385A", "#00B0F0", "#B54708", "#6B6875"] },
    pastel: { t: "Pastel", c: ["#8EB4FF", "#FFC48A", "#8FDCB0", "#C4B2FF", "#FF9FB1", "#8FE0F5", "#E9B98A", "#B9B6C4"] },
    calida: { t: "Cálida", c: ["#C2372B", "#E8590C", "#F2C200", "#B54708", "#F2385A", "#FF8FA3", "#7A2E0E", "#FFB066"] },
    fria: { t: "Fría", c: ["#1E3A8A", "#3D72F2", "#00B0F0", "#2FA868", "#5B5BD6", "#7FD8A6", "#0E7490", "#8B5CF6"] },
    grises: { t: "Escala de grises", c: ["#2B2A33", "#6B6875", "#9A97A6", "#B7B4C2", "#4A4854", "#D2D0DA", "#808080", "#E7E5EE"] },
  };
  const TIPOS = [["barras", "Barras", "bar-chart"], ["barras-h", "Barras horizontales", "bar-chart-horizontal"], ["lineas", "Líneas", "spline"],
    ["area", "Área", "area-chart"], ["dispersion", "Dispersión (x, y)", "scatter-chart"], ["pastel", "Pastel", "circle"]];

  /** Datos de un rango: etiquetas (primera columna de texto), series (columnas de números) y,
      para la dispersión, la primera columna numérica como x. ev.valor(c, f) da cada valor. */
  function datos(ev, r) {
    const m = [];
    for (let f = r.f1; f <= r.f2; f++) { const fila = []; for (let c = r.c1; c <= r.c2; c++) fila.push(ev.valor(c, f)); m.push(fila); }
    if (!m.length) return null;
    const num = (v) => F().esNum(v);
    const conEtiquetas = m.some((fila) => fila.length > 1 && !num(fila[0]) && fila[0] !== "");
    const c0 = conEtiquetas ? 1 : 0;
    const conNombres = m.length > 1 && m[0].slice(c0).some((v) => v !== "" && !num(v));
    const filas = conNombres ? m.slice(1) : m;
    const series = [];
    for (let c = c0; c < m[0].length; c++) {
      const valores = filas.map((fila) => (num(fila[c]) ? +fila[c] : null));
      if (valores.every((v) => v == null)) continue;
      series.push({ nombre: conNombres ? String(F().formatear(m[0][c])) : "Serie " + (series.length + 1), valores });
    }
    const etiquetas = filas.map((fila, i) => (conEtiquetas ? String(F().formatear(fila[0])) : String(i + 1)));
    return series.length ? { etiquetas, series } : null;
  }

  const n1 = (v) => v.toFixed(1);
  const corto = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (Math.round(v / 1e5) / 10) + " M";
    if (a >= 1e4) return Math.round(v).toLocaleString("es-MX");
    return String(Math.round(v * 100) / 100);
  };
  /** Marcas "bonitas" para un eje entre min y max. */
  function marcas(min, max, n) {
    if (max === min) max = min + 1;
    const paso0 = (max - min) / (n || 4), p = Math.pow(10, Math.floor(Math.log10(paso0))), k = paso0 / p;
    const paso = (k < 1.5 ? 1 : k < 3 ? 2 : k < 7 ? 5 : 10) * p;
    const a = Math.floor(min / paso) * paso, b = Math.ceil(max / paso) * paso;
    const l = [];
    for (let v = a; v <= b + paso / 2; v += paso) l.push(Math.round(v / paso) * paso);
    return { min: a, max: b, l };
  }

  /**
   * SVG de la gráfica. opc: { titulo, ejeX, ejeY, colores (lista o nombre de paleta), autonomo
   * (con estilos propios, para convertir en imagen), ancho, alto }.
   */
  function svg(d, clase, opc) {
    opc = typeof opc === "string" ? { titulo: opc } : opc || {};
    const W = opc.ancho || 420, H = opc.alto || 240;
    // Los colores pueden venir del documento: solo se aceptan colores #RRGGBB (nada de texto suelto en el SVG).
    const col = (Array.isArray(opc.colores) && opc.colores.length ? opc.colores : (PALETAS[opc.colores] || PALETAS.clasica).c).map((c) => (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : "#5B5BD6"));
    const C = (i) => col[i % col.length];
    const estilo = opc.autonomo ? `<style>.graf-titulo{font:800 13px Nunito,Arial,sans-serif;fill:#2B2A33}.graf-eje{font:650 10px Nunito,Arial,sans-serif;fill:#6B6875}.graf-ley{font:700 11px Nunito,Arial,sans-serif;fill:#4A4854}.graf-reja{stroke:#E7E5EE}.graf-cero{stroke:#B7B4C2}</style><rect width="${W}" height="${H}" fill="#fff"/>` : "";
    const abre = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${opc.autonomo ? ` width="${W}" height="${H}"` : ""} class="graf" role="img" aria-label="${esc(opc.titulo || "Gráfica")}">${estilo}`;
    if (!d) return opc.autonomo ? abre + `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="graf-eje">Sin números</text></svg>` : `<div class="graf-vacia">${NOM.ico("bar-chart", "ico-l")}<span>Elige un rango con números</span></div>`;
    const ms = opc.titulo ? 30 : 14;
    const t = opc.titulo ? `<text x="${W / 2}" y="20" text-anchor="middle" class="graf-titulo">${esc(opc.titulo)}</text>` : "";
    if (clase === "pastel") {
      const s = d.series[0], total = s.valores.reduce((a, v) => a + Math.max(0, v || 0), 0) || 1;
      let a0 = -Math.PI / 2, h = "";
      const cx = W * 0.31, cy = ms + (H - ms) / 2 - 4, r = Math.min(W * 0.21, (H - ms) / 2 - 10);
      s.valores.forEach((v, i) => {
        const a = (Math.max(0, v || 0) / total) * Math.PI * 2, a1 = a0 + a;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        if (a > 0) h += a >= Math.PI * 2 - 1e-6 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C(i)}"/>` : `<path d="M${cx},${cy} L${n1(x0)},${n1(y0)} A${r},${r} 0 ${a > Math.PI ? 1 : 0} 1 ${n1(x1)},${n1(y1)} Z" fill="${C(i)}" stroke="#fff" stroke-width="1.5"/>`;
        a0 = a1;
      });
      const ley = d.etiquetas.slice(0, 9).map((e, i) => `<g transform="translate(${W * 0.6} ${ms + 12 + i * 21})"><rect width="12" height="12" rx="3" fill="${C(i)}"/><text x="18" y="10" class="graf-ley">${esc(e.slice(0, 18))} · ${Math.round(((s.valores[i] || 0) / total) * 100)}%</text></g>`).join("");
      return `${abre}${t}${h}${ley}</svg>`;
    }
    const multi = d.series.length > 1;
    const mb = (opc.ejeX ? 52 : 40) + (multi ? 0 : -10), mi = opc.ejeY ? 56 : 44, md = 14;
    const ah = H - ms - mb, aw = W - mi - md;
    let h = "";
    const ejes = (opc.ejeX ? `<text x="${mi + aw / 2}" y="${H - (multi ? 22 : 6)}" text-anchor="middle" class="graf-eje" style="font-weight:800">${esc(opc.ejeX)}</text>` : "")
      + (opc.ejeY ? `<text transform="translate(12 ${ms + ah / 2}) rotate(-90)" text-anchor="middle" class="graf-eje" style="font-weight:800">${esc(opc.ejeY)}</text>` : "");
    const ley = multi ? d.series.slice(0, 6).map((s, i) => `<g transform="translate(${mi + i * Math.min(110, aw / Math.min(6, d.series.length))} ${H - 12})"><rect width="10" height="10" rx="2" fill="${C(i)}"/><text x="14" y="9" class="graf-ley">${esc(s.nombre.slice(0, 14))}</text></g>`).join("") : "";
    const todos = d.series.flatMap((s) => s.valores).filter((v) => v != null);

    if (clase === "dispersion") {
      // x = la primera serie (o las etiquetas si son números); y = las demás.
      let xs, ys;
      const etiqNum = d.etiquetas.every((e) => e !== "" && !isNaN(parseFloat(e)));
      if (d.series.length > 1) { xs = d.series[0].valores; ys = d.series.slice(1); }
      else if (etiqNum) { xs = d.etiquetas.map(parseFloat); ys = d.series; }
      else { xs = d.etiquetas.map((_, i) => i + 1); ys = d.series; }
      const vx = xs.filter((v) => v != null), vy = ys.flatMap((s) => s.valores).filter((v) => v != null);
      if (!vx.length || !vy.length) return `${abre}${t}</svg>`;
      const mx = marcas(Math.min(...vx), Math.max(...vx)), my = marcas(Math.min(...vy), Math.max(...vy));
      const X = (v) => mi + ((v - mx.min) / (mx.max - mx.min || 1)) * aw, Y = (v) => ms + ah - ((v - my.min) / (my.max - my.min || 1)) * ah;
      my.l.forEach((v) => (h += `<line x1="${mi}" x2="${W - md}" y1="${n1(Y(v))}" y2="${n1(Y(v))}" class="graf-reja"/><text x="${mi - 6}" y="${n1(Y(v) + 4)}" text-anchor="end" class="graf-eje">${esc(corto(v))}</text>`));
      mx.l.forEach((v) => (h += `<text x="${n1(X(v))}" y="${ms + ah + 16}" text-anchor="middle" class="graf-eje">${esc(corto(v))}</text>`));
      ys.forEach((s, si) => s.valores.forEach((v, i) => { if (v != null && xs[i] != null) h += `<circle cx="${n1(X(xs[i]))}" cy="${n1(Y(v))}" r="4" fill="${C(si)}" fill-opacity=".85"/>`; }));
      const leyD = ys.length > 1 ? ys.slice(0, 6).map((s, i) => `<g transform="translate(${mi + i * 110} ${H - 12})"><rect width="10" height="10" rx="2" fill="${C(i)}"/><text x="14" y="9" class="graf-ley">${esc(s.nombre.slice(0, 14))}</text></g>`).join("") : "";
      return `${abre}${t}${h}<line x1="${mi}" x2="${mi}" y1="${ms}" y2="${ms + ah}" class="graf-cero"/><line x1="${mi}" x2="${W - md}" y1="${ms + ah}" y2="${ms + ah}" class="graf-cero"/>${ejes}${leyD}</svg>`;
    }

    const mm = marcas(Math.min(0, ...todos), Math.max(0, ...todos));
    const n = d.etiquetas.length;
    if (clase === "barras-h") {
      const X = (v) => mi + 40 + ((v - mm.min) / (mm.max - mm.min || 1)) * (aw - 40);
      const paso = ah / Math.max(1, n), bh = (paso * 0.72) / d.series.length;
      mm.l.forEach((v) => (h += `<line y1="${ms}" y2="${ms + ah}" x1="${n1(X(v))}" x2="${n1(X(v))}" class="graf-reja"/><text y="${ms + ah + 14}" x="${n1(X(v))}" text-anchor="middle" class="graf-eje">${esc(corto(v))}</text>`));
      d.series.forEach((s, si) => s.valores.forEach((v, i) => {
        if (v == null) return;
        const y = ms + paso * i + paso * 0.14 + bh * si, x0 = X(Math.min(0, v)), x1 = X(Math.max(0, v));
        h += `<rect y="${n1(y)}" x="${n1(x0)}" height="${n1(Math.max(1, bh - 2))}" width="${n1(Math.max(1, x1 - x0))}" rx="3" fill="${C(si)}"/>`;
      }));
      const cada = Math.ceil(n / 12);
      h += d.etiquetas.map((e, i) => (i % cada ? "" : `<text x="${mi + 36}" y="${n1(ms + paso * (i + 0.5) + 4)}" text-anchor="end" class="graf-eje">${esc(e.slice(0, 12))}</text>`)).join("");
      return `${abre}${t}${h}<line y1="${ms}" y2="${ms + ah}" x1="${n1(X(0))}" x2="${n1(X(0))}" class="graf-cero"/>${ejes}${ley}</svg>`;
    }
    const Y = (v) => ms + ah - ((v - mm.min) / (mm.max - mm.min || 1)) * ah;
    const paso = aw / Math.max(1, n);
    mm.l.forEach((v) => (h += `<line x1="${mi}" x2="${W - md}" y1="${n1(Y(v))}" y2="${n1(Y(v))}" class="graf-reja"/><text x="${mi - 6}" y="${n1(Y(v) + 4)}" text-anchor="end" class="graf-eje">${esc(corto(v))}</text>`));
    if (clase === "lineas" || clase === "area") {
      d.series.forEach((s, si) => {
        const pts = s.valores.map((v, i) => (v == null ? null : [mi + paso * (i + 0.5), Y(v)])).filter(Boolean);
        if (!pts.length) return;
        if (clase === "area") h += `<path d="M${n1(pts[0][0])},${n1(Y(0))} ${pts.map((p) => "L" + n1(p[0]) + "," + n1(p[1])).join(" ")} L${n1(pts[pts.length - 1][0])},${n1(Y(0))} Z" fill="${C(si)}" fill-opacity=".28"/>`;
        h += `<polyline points="${pts.map((p) => p.map(n1).join(",")).join(" ")}" fill="none" stroke="${C(si)}" stroke-width="2.5" stroke-linejoin="round"/>`;
        if (clase === "lineas") h += pts.map((p) => `<circle cx="${n1(p[0])}" cy="${n1(p[1])}" r="3.5" fill="${C(si)}"/>`).join("");
      });
    } else {
      const bw = (paso * 0.72) / d.series.length;
      d.series.forEach((s, si) => s.valores.forEach((v, i) => {
        if (v == null) return;
        const x = mi + paso * i + paso * 0.14 + bw * si, y0 = Y(Math.max(0, v)), y1 = Y(Math.min(0, v));
        h += `<rect x="${n1(x)}" y="${n1(y0)}" width="${n1(Math.max(1, bw - 2))}" height="${n1(Math.max(1, y1 - y0))}" rx="3" fill="${C(si)}"/>`;
      }));
    }
    const cada = Math.ceil(n / 10);
    h += d.etiquetas.map((e, i) => (i % cada ? "" : `<text x="${n1(mi + paso * (i + 0.5))}" y="${ms + ah + 16}" text-anchor="middle" class="graf-eje">${esc(e.slice(0, 10))}</text>`)).join("");
    return `${abre}${t}${h}<line x1="${mi}" x2="${W - md}" y1="${n1(Y(0))}" y2="${n1(Y(0))}" class="graf-cero"/>${ejes}${ley}</svg>`;
  }

  /** Un SVG (texto) como imagen PNG (data URL), para el texto, Word y PowerPoint. */
  function aPng(svgTexto, ancho, alto, escala) {
    return new Promise((ok, mal) => {
      const k = escala || 2;
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = Math.round(ancho * k); cv.height = Math.round(alto * k);
        const g = cv.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(img, 0, 0, cv.width, cv.height);
        try { ok(cv.toDataURL("image/png")); } catch (e) { mal(e); }
      };
      img.onerror = () => mal(new Error("No se pudo dibujar la gráfica"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgTexto);
    });
  }
  /** "A1:B5" → { c1, c2, f1, f2 } (o null). */
  function rango(s) {
    const [a, b] = String(s || "").split(":").map((x) => F().parseRef(x));
    return a && b ? { c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c), f1: Math.min(a.f, b.f), f2: Math.max(a.f, b.f) } : a ? { c1: a.c, c2: a.c, f1: a.f, f2: a.f } : null;
  }

  NOM.graficas = { datos, svg, aPng, rango, PALETAS, TIPOS };
})();
