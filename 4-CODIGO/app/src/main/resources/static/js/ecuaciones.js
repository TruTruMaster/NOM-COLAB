/* NOM-COLAB · ecuaciones (8.2). Una notación sencilla tipo LaTeX se convierte en MathML (lo dibuja
   el navegador, también sin internet y en la app) y en OMML (las ecuaciones de Word).
   Acepta: \frac{a}{b}, a/b entre llaves no, \sqrt{x}, \sqrt[3]{x}, x^2, x^{10}, x_i, x_{ij}, letras
   griegas (\alpha … \omega, \Delta …), \pm \times \cdot \div \leq \geq \neq \approx \infty \to
   \rightarrow \sum \int \prod \lim con límites (_ y ^), \sin \cos \tan \log \ln \exp, \text{…},
   \overline{x}, \vec{v}, \left( … \right) y los mismos símbolos escritos directo (√, ², π, ≤…). */
(function () {
  "use strict";
  const NOM = window.NOM;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const GRIEGAS = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ",
    lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
    Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω" };
  const SIMBOLOS = { pm: "±", mp: "∓", times: "×", cdot: "·", div: "÷", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", sim: "∼",
    infty: "∞", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftrightarrow: "⇔", partial: "∂", nabla: "∇", degree: "°", circ: "°", in: "∈", notin: "∉",
    subset: "⊂", cup: "∪", cap: "∩", forall: "∀", exists: "∃", angle: "∠", perp: "⊥", parallel: "∥", cdots: "⋯", ldots: "…", dots: "…", prime: "′", percent: "%" };
  const GRANDES = { sum: "∑", prod: "∏", int: "∫", iint: "∬", oint: "∮", lim: "lim" };
  const FUNCIONES = ["sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "exp", "max", "min", "sen", "arcsin", "arccos", "arctan"];
  const SUPER = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-", "ⁿ": "n" };
  const SUB = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
  const OPERADORES = "+-=<>±∓×·÷≤≥≠≈≡∼→←⇒⇔∈∉⊂∪∩∀∃∠⊥∥,;:!|/";

  /** Texto → árbol: { t: "fila", h: [...] } con nodos num, id, op, texto, frac, raiz, sup, sub, subsup, grande, func, acento, parentesis. */
  function analizar(src) {
    let i = 0;
    const s = String(src || "");
    function grupo() {
      while (s[i] === " ") i++;
      if (s[i] === "{") { i++; const f = fila("}"); i++; return f; }
      return atomo();
    }
    function fila(fin) {
      const h = [];
      while (i < s.length && s[i] !== fin && !(fin === "\\right" && s.startsWith("\\right", i))) {
        const a = postfijo(atomo());
        if (a) h.push(a);
      }
      return { t: "fila", h };
    }
    function postfijo(base) {
      if (!base) return base;
      for (;;) {
        while (s[i] === " ") i++;
        const c = s[i];
        if (c === "^" || c === "_") {
          i++;
          const g = grupo();
          if (c === "^") base = base.t === "sub" ? { t: "subsup", base: base.base, sub: base.sub, sup: g } : base.t === "grande" ? Object.assign(base, { sup: g }) : { t: "sup", base, sup: g };
          else base = base.t === "sup" ? { t: "subsup", base: base.base, sub: g, sup: base.sup } : base.t === "grande" ? Object.assign(base, { sub: g }) : { t: "sub", base, sub: g };
          continue;
        }
        if (SUPER[c]) { let v = ""; while (SUPER[s[i]]) v += SUPER[s[i++]]; base = { t: "sup", base, sup: { t: "fila", h: [/^\d+$/.test(v) ? { t: "num", v } : { t: "id", v }] } }; continue; }
        if (SUB[c]) { let v = ""; while (SUB[s[i]]) v += SUB[s[i++]]; base = { t: "sub", base, sub: { t: "fila", h: [{ t: "num", v }] } }; continue; }
        return base;
      }
    }
    function atomo() {
      while (s[i] === " ") i++;
      if (i >= s.length) return null;
      const c = s[i];
      if (c === "\\") {
        const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
        i += m[0].length;
        const n = m[1];
        if (n === "frac" || n === "dfrac") { const a = grupo(), b = grupo(); return { t: "frac", a, b }; }
        if (n === "sqrt") {
          let ind = null;
          if (s[i] === "[") { i++; const j = s.indexOf("]", i); ind = analizar(s.slice(i, j < 0 ? s.length : j)); i = j < 0 ? s.length : j + 1; }
          return { t: "raiz", a: grupo(), n: ind };
        }
        if (n === "text" || n === "mathrm" || n === "textrm") { const g = /^\{([^}]*)\}/.exec(s.slice(i)); if (g) { i += g[0].length; return { t: "texto", v: g[1] }; } return null; }
        if (n === "overline" || n === "bar" || n === "vec" || n === "hat") return { t: "acento", a: grupo(), ch: { overline: "‾", bar: "‾", vec: "→", hat: "^" }[n] };
        if (n === "left") { const ab = s[i] === "\\" ? (i += 2, s[i - 1]) : s[i++]; const f = fila("\\right"); let ce = ""; if (s.startsWith("\\right", i)) { i += 6; ce = s[i] === "\\" ? (i += 2, s[i - 1]) : s[i++] || ""; } return { t: "parentesis", ab: ab === "." ? "" : ab, ce: ce === "." ? "" : ce, a: f }; }
        if (GRIEGAS[n]) return { t: "id", v: GRIEGAS[n] };
        if (SIMBOLOS[n]) return { t: "op", v: SIMBOLOS[n] };
        if (GRANDES[n]) return { t: "grande", v: GRANDES[n] };
        if (FUNCIONES.includes(n)) return { t: "func", v: n === "sen" ? "sen" : n };
        if (n === "," || n === ";" || n === " " || n === "quad") return { t: "op", v: " " };
        if (n === "{" || n === "}") return { t: "op", v: n };
        return { t: "id", v: n };
      }
      if (c === "{") { i++; const f = fila("}"); i++; return f; }
      if (c === "(" || c === "[") {
        i++;
        const cierre = c === "(" ? ")" : "]";
        const f = fila(cierre);
        if (s[i] === cierre) i++;
        return { t: "parentesis", ab: c, ce: cierre, a: f };
      }
      if (c === "√") { i++; return { t: "raiz", a: grupo(), n: null }; }
      if (/[0-9.]/.test(c)) { let v = ""; while (i < s.length && /[0-9.]/.test(s[i])) v += s[i++]; return { t: "num", v }; }
      if (c === "∑" || c === "∫" || c === "∏") { i++; return { t: "grande", v: c }; }
      if (OPERADORES.includes(c)) { i++; return { t: "op", v: c === "-" ? "−" : c === "*" ? "×" : c }; }
      if (c === "*") { i++; return { t: "op", v: "·" }; }
      if (c === ")" || c === "]" || c === "}") { i++; return { t: "op", v: c }; }
      i++;
      return { t: "id", v: c };
    }
    const f = fila(null);
    return f;
  }

  // ------------------------------------------------------------ MathML
  function aMathml(n) {
    if (!n) return "<mrow></mrow>";
    switch (n.t) {
      case "fila": return n.h.length === 1 ? aMathml(n.h[0]) : `<mrow>${n.h.map(aMathml).join("")}</mrow>`;
      case "num": return `<mn>${esc(n.v)}</mn>`;
      case "id": return `<mi>${esc(n.v)}</mi>`;
      case "op": return `<mo>${esc(n.v)}</mo>`;
      case "texto": return `<mtext>${esc(n.v)}</mtext>`;
      case "func": return `<mi mathvariant="normal">${esc(n.v)}</mi><mo>&#x2061;</mo>`;
      case "frac": return `<mfrac>${aMathml(n.a)}${aMathml(n.b)}</mfrac>`;
      case "raiz": return n.n ? `<mroot>${aMathml(n.a)}${aMathml(n.n)}</mroot>` : `<msqrt>${aMathml(n.a)}</msqrt>`;
      case "sup": return `<msup>${aMathml(n.base)}${aMathml(n.sup)}</msup>`;
      case "sub": return `<msub>${aMathml(n.base)}${aMathml(n.sub)}</msub>`;
      case "subsup": return `<msubsup>${aMathml(n.base)}${aMathml(n.sub)}${aMathml(n.sup)}</msubsup>`;
      case "grande": {
        const op = n.v === "lim" ? `<mi>lim</mi>` : `<mo largeop="true">${esc(n.v)}</mo>`;
        if (n.sub && n.sup) return `<munderover>${op}${aMathml(n.sub)}${aMathml(n.sup)}</munderover>`;
        if (n.sub) return `<munder>${op}${aMathml(n.sub)}</munder>`;
        if (n.sup) return `<mover>${op}${aMathml(n.sup)}</mover>`;
        return op;
      }
      case "acento": return `<mover accent="true">${aMathml(n.a)}<mo>${esc(n.ch)}</mo></mover>`;
      case "parentesis": return `<mrow>${n.ab ? `<mo>${esc(n.ab)}</mo>` : ""}${aMathml(n.a)}${n.ce ? `<mo>${esc(n.ce)}</mo>` : ""}</mrow>`;
    }
    return "";
  }
  /** HTML de una ecuación (MathML). */
  const html = (tex, bloque) => `<math xmlns="http://www.w3.org/1998/Math/MathML"${bloque ? ' display="block"' : ""}>${aMathml(analizar(tex))}</math>`;

  // ------------------------------------------------------------ OMML (ecuaciones de Word)
  function aOmml(n) {
    const r = (t) => `<m:r><m:t xml:space="preserve">${esc(t)}</m:t></m:r>`;
    if (!n) return "";
    switch (n.t) {
      case "fila": return n.h.map(aOmml).join("");
      case "num": case "id": case "op": return r(n.v);
      case "texto": return `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">${esc(n.v)}</m:t></m:r>`;
      case "func": return `<m:func><m:fName><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>${esc(n.v)}</m:t></m:r></m:fName><m:e></m:e></m:func>`;
      case "frac": return `<m:f><m:num>${aOmml(n.a)}</m:num><m:den>${aOmml(n.b)}</m:den></m:f>`;
      case "raiz": return n.n ? `<m:rad><m:deg>${aOmml(n.n)}</m:deg><m:e>${aOmml(n.a)}</m:e></m:rad>` : `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${aOmml(n.a)}</m:e></m:rad>`;
      case "sup": return `<m:sSup><m:e>${aOmml(n.base)}</m:e><m:sup>${aOmml(n.sup)}</m:sup></m:sSup>`;
      case "sub": return `<m:sSub><m:e>${aOmml(n.base)}</m:e><m:sub>${aOmml(n.sub)}</m:sub></m:sSub>`;
      case "subsup": return `<m:sSubSup><m:e>${aOmml(n.base)}</m:e><m:sub>${aOmml(n.sub)}</m:sub><m:sup>${aOmml(n.sup)}</m:sup></m:sSubSup>`;
      case "grande":
        if (n.v === "lim") return `<m:limLow><m:e>${r("lim")}</m:e><m:lim>${aOmml(n.sub)}</m:lim></m:limLow>`;
        return `<m:nary><m:naryPr><m:chr m:val="${esc(n.v)}"/>${n.sub ? "" : '<m:subHide m:val="1"/>'}${n.sup ? "" : '<m:supHide m:val="1"/>'}</m:naryPr><m:sub>${aOmml(n.sub)}</m:sub><m:sup>${aOmml(n.sup)}</m:sup><m:e></m:e></m:nary>`;
      case "acento": return `<m:acc><m:accPr><m:chr m:val="${esc(n.ch === "‾" ? "̅" : n.ch === "→" ? "⃗" : "̂")}"/></m:accPr><m:e>${aOmml(n.a)}</m:e></m:acc>`;
      case "parentesis": return `<m:d><m:dPr><m:begChr m:val="${esc(n.ab)}"/><m:endChr m:val="${esc(n.ce)}"/></m:dPr><m:e>${aOmml(n.a)}</m:e></m:d>`;
    }
    return "";
  }
  const omml = (tex) => `<m:oMath>${aOmml(analizar(tex))}</m:oMath>`;

  /** Texto plano legible (para Markdown, búsquedas y lectores de pantalla). */
  function texto(n) {
    if (!n) return "";
    switch (n.t) {
      case "fila": return n.h.map(texto).join("");
      case "num": case "id": case "op": case "texto": case "func": return n.v;
      case "frac": return `(${texto(n.a)})/(${texto(n.b)})`;
      case "raiz": return (n.n ? `${texto(n.n)}` : "") + `√(${texto(n.a)})`;
      case "sup": return `${texto(n.base)}^${texto(n.sup)}`;
      case "sub": return `${texto(n.base)}_${texto(n.sub)}`;
      case "subsup": return `${texto(n.base)}_${texto(n.sub)}^${texto(n.sup)}`;
      case "grande": return n.v + (n.sub ? `_(${texto(n.sub)})` : "") + (n.sup ? `^(${texto(n.sup)})` : "");
      case "acento": return texto(n.a) + n.ch;
      case "parentesis": return n.ab + texto(n.a) + n.ce;
    }
    return "";
  }

  /** Botones de ayuda para escribir (lo que se inserta; □ marca dónde escribir). */
  const AYUDAS = [["\\frac{□}{□}", "a/b", "Fracción"], ["\\sqrt{□}", "√", "Raíz"], ["\\sqrt[3]{□}", "∛", "Raíz cúbica"], ["^{□}", "x²", "Potencia"], ["_{□}", "x₁", "Subíndice"],
    ["\\sum_{i=1}^{n} ", "∑", "Sumatoria"], ["\\int_{a}^{b} ", "∫", "Integral"], ["\\lim_{x \\to 0} ", "lim", "Límite"], ["\\pi", "π", "Pi"], ["\\pm", "±", "Más menos"],
    ["\\times", "×", "Por"], ["\\div", "÷", "Entre"], ["\\leq", "≤", "Menor o igual"], ["\\geq", "≥", "Mayor o igual"], ["\\neq", "≠", "Distinto"], ["\\approx", "≈", "Aproximado"],
    ["\\infty", "∞", "Infinito"], ["\\alpha", "α", "Alfa"], ["\\beta", "β", "Beta"], ["\\theta", "θ", "Teta"], ["\\Delta", "Δ", "Delta"], ["\\mu", "μ", "Mu"], ["\\vec{□}", "v⃗", "Vector"], ["\\text{□}", "abc", "Texto"]];
  const EJEMPLOS = [["Fórmula general", "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}"], ["Pitágoras", "c^2 = a^2 + b^2"], ["Área del círculo", "A = \\pi r^2"], ["Velocidad", "v = \\frac{d}{t}"], ["Segunda ley de Newton", "F = m \\cdot a"], ["Suma de Gauss", "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}"]];

  NOM.ecuaciones = { analizar, html, omml, texto: (tex) => texto(analizar(tex)), AYUDAS, EJEMPLOS };
})();
