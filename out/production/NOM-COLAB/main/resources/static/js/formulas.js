/* NOM-COLAB · motor de fórmulas del modo hoja.
   Acepta nombres en español y en inglés (=SUMA o =SUM) y los separadores , y ;
   Errores: #REF! #DIV/0! #NOMBRE? #VALOR! #CICLO! */
(function () {
  "use strict";
  const NOM = window.NOM;

  const colNum = (s) => s.toUpperCase().split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const colLetra = (n) => { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ref = (c, f) => colLetra(c) + (f + 1);
  const parseRef = (r) => { const m = /^([A-Z]+)(\d+)$/i.exec(r); return m ? { c: colNum(m[1]) - 1, f: parseInt(m[2], 10) - 1 } : null; };

  class ErrorF { constructor(c) { this.codigo = c; } toString() { return this.codigo; } }
  const E = (c) => new ErrorF(c);

  function tokens(s) {
    const t = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"') { let j = i + 1, v = ""; while (j < s.length && s[j] !== '"') v += s[j++]; t.push({ k: "str", v }); i = j + 1; continue; }
      const num = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i));
      if (num) { t.push({ k: "num", v: parseFloat(num[0]) }); i += num[0].length; continue; }
      const id = /^[A-Za-zÁÉÍÓÚÑáéíóúñ_][A-Za-z0-9ÁÉÍÓÚÑáéíóúñ_.]*(:[A-Za-z]+\d+)?/.exec(s.slice(i));
      if (id) { t.push({ k: "id", v: id[0].toUpperCase() }); i += id[0].length; continue; }
      const op = /^(<=|>=|<>|[-+*/^&(),;=<>%])/.exec(s.slice(i));
      if (op) { t.push({ k: "op", v: op[0] }); i += op[0].length; continue; }
      throw E("#VALOR!");
    }
    return t;
  }

  const plano = (args) => args.flat(Infinity);
  const nums = (args) => { const p = plano(args); const e = p.find((v) => v instanceof ErrorF); if (e) throw e; return p.filter((v) => typeof v === "number"); };
  const FUNCS = {
    SUMA: (a) => nums(a).reduce((x, y) => x + y, 0),
    PROMEDIO: (a) => { const n = nums(a); return n.length ? n.reduce((x, y) => x + y, 0) / n.length : E("#DIV/0!"); },
    MIN: (a) => { const n = nums(a); return n.length ? Math.min(...n) : 0; },
    MAX: (a) => { const n = nums(a); return n.length ? Math.max(...n) : 0; },
    CONTAR: (a) => nums(a).length,
    CONTARA: (a) => plano(a).filter((v) => v !== "" && v != null).length,
    SI: (a) => { if (a[0] instanceof ErrorF) throw a[0]; return verdad(a[0]) ? (a[1] === undefined ? true : a[1]) : (a[2] === undefined ? false : a[2]); },
    ESERROR: (a) => a[0] instanceof ErrorF,
    SIERROR: (a) => (a[0] instanceof ErrorF ? (a[1] === undefined ? "" : a[1]) : a[0]),
    Y: (a) => plano(a).every(verdad),
    O: (a) => plano(a).some(verdad),
    NO: (a) => !verdad(a[0]),
    REDONDEAR: (a) => { const p = Math.pow(10, a[1] || 0); return Math.round(num(a[0]) * p) / p; },
    ABS: (a) => Math.abs(num(a[0])),
    RAIZ: (a) => { const n = num(a[0]); return n < 0 ? E("#VALOR!") : Math.sqrt(n); },
    POTENCIA: (a) => Math.pow(num(a[0]), num(a[1])),
    CONCATENAR: (a) => plano(a).map(texto).join(""),
    MAYUSC: (a) => texto(a[0]).toUpperCase(),
    MINUSC: (a) => texto(a[0]).toLowerCase(),
    LARGO: (a) => texto(a[0]).length,
    PI: () => Math.PI,
  };
  const ALIAS = { SUM: "SUMA", AVERAGE: "PROMEDIO", COUNT: "CONTAR", COUNTA: "CONTARA", IF: "SI", AND: "Y", OR: "O", NOT: "NO",
    ROUND: "REDONDEAR", ISERROR: "ESERROR", IFERROR: "SIERROR", SQRT: "RAIZ", POWER: "POTENCIA", CONCAT: "CONCATENAR", CONCATENATE: "CONCATENAR", UPPER: "MAYUSC", LOWER: "MINUSC", LEN: "LARGO" };
  const NOMBRES = Object.keys(FUNCS);

  function num(v) {
    if (v instanceof ErrorF) throw v;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (v === "" || v == null) return 0;
    const n = parseFloat(String(v).replace(",", "."));
    if (isNaN(n)) throw E("#VALOR!");
    return n;
  }
  const texto = (v) => (v == null ? "" : typeof v === "number" ? formatear(v) : String(v));
  const verdad = (v) => (typeof v === "string" ? v !== "" && v.toUpperCase() !== "FALSO" : !!v);

  /** Hoja: obtener(c, f) -> texto crudo de la celda. Devuelve un evaluador con caché. */
  function evaluador(obtener) {
    const cache = new Map();
    const pila = new Set();

    function valorCelda(c, f) {
      const k = c + "," + f;
      if (cache.has(k)) return cache.get(k);
      if (pila.has(k)) throw E("#CICLO!");
      pila.add(k);
      let v;
      try { v = calcular(obtener(c, f)); } catch (e) { v = e instanceof ErrorF ? e : E("#VALOR!"); }
      pila.delete(k);
      cache.set(k, v);
      return v;
    }

    function calcular(crudo) {
      if (crudo == null || crudo === "") return "";
      const s = String(crudo);
      if (s[0] !== "=") {
        const t = s.trim();
        if (/^-?\d+([.,]\d+)?%?$/.test(t)) { const n = parseFloat(t.replace(",", ".")); return t.endsWith("%") ? n / 100 : n; }
        return s;
      }
      const tk = tokens(s.slice(1));
      let i = 0;
      const ver = () => tk[i];
      const es = (v) => tk[i] && tk[i].k === "op" && tk[i].v === v;
      const toma = (v) => { const x = tk[i]; if (!x || (v && (x.k !== "op" || x.v !== v))) throw E("#VALOR!"); i++; return x; };

      function expr() {
        let a = suma();
        while (ver() && ver().k === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(ver().v)) {
          const o = toma().v, b = suma();
          const x = typeof a === "number" && typeof b === "number" ? [a, b] : [texto(a), texto(b)];
          a = { "=": x[0] === x[1], "<>": x[0] !== x[1], "<": x[0] < x[1], ">": x[0] > x[1], "<=": x[0] <= x[1], ">=": x[0] >= x[1] }[o];
        }
        return a;
      }
      function suma() {
        let a = term();
        while (ver() && ver().k === "op" && ["+", "-", "&"].includes(ver().v)) {
          const o = toma().v, b = term();
          a = o === "&" ? texto(a) + texto(b) : o === "+" ? num(a) + num(b) : num(a) - num(b);
        }
        return a;
      }
      function term() {
        let a = pot();
        while (ver() && ver().k === "op" && ["*", "/"].includes(ver().v)) {
          const o = toma().v, b = pot();
          if (o === "/") { if (num(b) === 0) throw E("#DIV/0!"); a = num(a) / num(b); } else a = num(a) * num(b);
        }
        return a;
      }
      function pot() {
        let a = unario();
        while (es("^")) { toma(); a = Math.pow(num(a), num(unario())); }
        return a;
      }
      function unario() {
        if (es("-")) { toma(); return -num(unario()); }
        if (es("+")) { toma(); return num(unario()); }
        let v = primario();
        if (es("%")) { toma(); v = num(v) / 100; }
        return v;
      }
      function primario() {
        const x = ver();
        if (!x) throw E("#VALOR!");
        if (x.k === "num") { i++; return x.v; }
        if (x.k === "str") { i++; return x.v; }
        if (x.k === "op" && x.v === "(") { toma(); const v = expr(); toma(")"); return v; }
        if (x.k === "id") {
          i++;
          if (x.v === "VERDADERO" || x.v === "TRUE") return true;
          if (x.v === "FALSO" || x.v === "FALSE") return false;
          if (es("(")) {
            toma("(");
            const nombre = ALIAS[x.v] || x.v;
            const fn = FUNCS[nombre];
            if (!fn) throw E("#NOMBRE?");
            const args = [];
            if (ver() && !es(")")) {
              args.push(argumento());
              while (es(",") || es(";")) { toma(); args.push(argumento()); }
            }
            toma(")");
            const r = fn(args);
            if (r instanceof ErrorF) throw r;
            return r;
          }
          if (x.v.includes(":")) return rango(x.v);
          const r = parseRef(x.v);
          if (!r) throw E("#NOMBRE?");
          const v = valorCelda(r.c, r.f);
          if (v instanceof ErrorF) throw v;
          return v;
        }
        throw E("#VALOR!");
      }
      // Un error dentro de un argumento se guarda como valor (así SI y SIERROR pueden ignorarlo)
      // y se saltan los tokens que quedaron de ese argumento.
      function argumento() {
        const inicio = i;
        try { return expr(); } catch (e) {
          if (!(e instanceof ErrorF)) throw e;
          let prof = 0;
          if (i < inicio) i = inicio;
          while (i < tk.length) {
            const x = tk[i];
            if (x.k === "op" && x.v === "(") prof++;
            else if (x.k === "op" && x.v === ")") { if (prof === 0) break; prof--; }
            else if (x.k === "op" && (x.v === "," || x.v === ";") && prof === 0) break;
            i++;
          }
          return e;
        }
      }
      function rango(s) {
        const [a, b] = s.split(":").map(parseRef);
        if (!a || !b) throw E("#REF!");
        const out = [];
        for (let f = Math.min(a.f, b.f); f <= Math.max(a.f, b.f); f++)
          for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) {
            const v = valorCelda(c, f);
            if (v instanceof ErrorF) throw v;
            out.push(v);
          }
        return out;
      }
      const v = expr();
      if (i < tk.length) throw E("#VALOR!");
      if (Array.isArray(v)) throw E("#VALOR!");
      return v;
    }

    return { valor: valorCelda, limpiar: () => cache.clear() };
  }

  function formatear(v) {
    if (v instanceof ErrorF) return v.codigo;
    if (typeof v === "boolean") return v ? "VERDADERO" : "FALSO";
    if (typeof v === "number") {
      if (!isFinite(v)) return "#DIV/0!";
      const r = Math.round(v * 1e6) / 1e6;
      return Math.abs(r) >= 1e4 ? r.toLocaleString("es-MX", { maximumFractionDigits: 4 }) : String(r);
    }
    return String(v);
  }

  NOM.formulas = { evaluador, formatear, ErrorF, colLetra, colNum, ref, parseRef, NOMBRES };
})();
