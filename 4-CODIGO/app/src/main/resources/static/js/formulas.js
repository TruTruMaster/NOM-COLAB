/* NOM-COLAB · motor de fórmulas del modo hoja.
   Acepta nombres en español y en inglés (=SUMA o =SUM) y los separadores , y ;
   Errores: #REF! #DIV/0! #NOMBRE? #VALOR! #CICLO! #N/A
   Fechas como en Excel: un número de serie (días desde el 30/12/1899) que se muestra dd/mm/aaaa.
   Se escriben en una celda como 07/11/2026 o 2026-11-07, o con =FECHA(2026; 11; 7) y =HOY(). */
(function () {
  "use strict";
  const NOM = window.NOM;

  const colNum = (s) => s.toUpperCase().split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const colLetra = (n) => { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ref = (c, f) => colLetra(c) + (f + 1);
  const parseRef = (r) => { const m = /^([A-Z]+)(\d+)$/i.exec(r); return m ? { c: colNum(m[1]) - 1, f: parseInt(m[2], 10) - 1 } : null; };

  class ErrorF { constructor(c) { this.codigo = c; } toString() { return this.codigo; } }
  const E = (c) => new ErrorF(c);

  // ------------------------------------------------------------ fechas
  const DIA = 86400000, BASE = Date.UTC(1899, 11, 30);
  /** Una fecha: su número de serie de Excel. Sumarle días da otra fecha; restar dos fechas, los días. */
  class FechaF { constructor(serie) { this.serie = Math.floor(serie); } valueOf() { return this.serie; } }
  const serieDe = (a, m, d) => Math.round((Date.UTC(a, m - 1, d) - BASE) / DIA);
  const fechaDe = (serie) => new Date(BASE + Math.floor(serie) * DIA);
  function textoFecha(f) { const d = fechaDe(f.serie); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`; }
  /** "07/11/2026", "7/11/26" (día/mes/año, como en México) o "2026-11-07". */
  function leerFecha(t) {
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    if (m) return valida(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
    if (m) return valida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    return null;
  }
  function valida(a, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const f = new Date(Date.UTC(a, m - 1, d));
    return f.getUTCMonth() === m - 1 ? new FechaF(serieDe(a, m, d)) : null;
  }
  function hoy() { const d = new Date(); return new FechaF(serieDe(d.getFullYear(), d.getMonth() + 1, d.getDate())); }

  // ------------------------------------------------------------ criterios de CONTAR.SI y SUMAR.SI
  /** ">=5", "<>listo", "=a", "a*" (comodines * y ?), 7…: devuelve una función que prueba un valor. */
  function criterio(c) {
    if (c instanceof ErrorF) throw c;
    if (typeof c === "number" || c instanceof FechaF) { const n = +c; return (v) => esNum(v) && +v === n; }
    if (typeof c === "boolean") return (v) => v === c;
    const t = String(c == null ? "" : c);
    const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(t);
    const op = m[1] || "=", resto = m[2];
    const f = leerFecha(resto.trim()), n = f ? +f : /^-?\d+([.,]\d+)?$/.test(resto.trim()) ? parseFloat(resto.trim().replace(",", ".")) : null;
    if (n != null) {
      const cmp = { "=": (a) => a === n, "<>": (a) => a !== n, "<": (a) => a < n, ">": (a) => a > n, "<=": (a) => a <= n, ">=": (a) => a >= n }[op];
      return (v) => (esNum(v) ? cmp(+v) : op === "<>");
    }
    const bajo = resto.toLowerCase();
    if (op === "=" || op === "<>") {
      const re = /[*?]/.test(bajo) ? new RegExp("^" + bajo.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$") : null;
      const igual = (v) => { const x = texto(v).toLowerCase(); return re ? re.test(x) : x === bajo; };
      return op === "=" ? igual : (v) => !igual(v);
    }
    return (v) => { const x = texto(v).toLowerCase(); return { "<": x < bajo, ">": x > bajo, "<=": x <= bajo, ">=": x >= bajo }[op]; };
  }
  const esNum = (v) => typeof v === "number" || v instanceof FechaF;

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
  const nums = (args) => { const p = plano(args); const e = p.find((v) => v instanceof ErrorF); if (e) throw e; return p.filter(esNum).map((v) => +v); };
  /** Un rango como tabla (filas × columnas), para BUSCARV. */
  const tabla = (r) => { if (!Array.isArray(r) || !r.cols) return null; const t = []; for (let i = 0; i < r.length; i += r.cols) t.push(r.slice(i, i + r.cols)); return t; };
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
    // 4.2 Las que más piden en la escuela.
    "BUSCARV": (a) => {
      const t = tabla(a[1]);
      if (!t) return E("#REF!");
      const col = Math.floor(num(a[2]));
      if (col < 1 || col > (a[1].cols || 1)) return E("#REF!");
      const aprox = a[3] === undefined ? true : verdad(a[3]) && a[3] !== 0;
      const buscado = a[0];
      if (buscado instanceof ErrorF) throw buscado;
      if (!aprox) {
        const prueba = criterio(esNum(buscado) ? +buscado : "=" + texto(buscado));
        const fila = t.find((f) => prueba(f[0]));
        return fila ? fila[col - 1] : E("#N/A");
      }
      // Coincidencia aproximada (como Excel): la última fila cuyo valor no pasa del buscado (columna ordenada).
      let mejor = null;
      for (const f of t) {
        const v = f[0];
        const menor = esNum(buscado) ? esNum(v) && +v <= +buscado : !esNum(v) && texto(v).toLowerCase() <= texto(buscado).toLowerCase();
        if (menor) mejor = f; else if (mejor) break;
      }
      return mejor ? mejor[col - 1] : E("#N/A");
    },
    "CONTAR.SI": (a) => { const p = criterio(a[1]); return plano([a[0]]).filter((v) => p(v)).length; },
    "SUMAR.SI": (a) => {
      const p = criterio(a[1]), r = plano([a[0]]), sumas = a[2] === undefined ? r : plano([a[2]]);
      let total = 0;
      r.forEach((v, i) => { if (p(v) && esNum(sumas[i])) total += +sumas[i]; });
      return total;
    },
    HOY: () => hoy(),
    FECHA: (a) => { const y = Math.floor(num(a[0])), m = Math.floor(num(a[1])), d = Math.floor(num(a[2])); return new FechaF(Math.round((Date.UTC(y < 100 ? 1900 + y : y, m - 1, d) - BASE) / DIA)); },
    DIAS: (a) => Math.round(num(a[0]) - num(a[1])),
  };
  const ALIAS = { SUM: "SUMA", AVERAGE: "PROMEDIO", COUNT: "CONTAR", COUNTA: "CONTARA", IF: "SI", AND: "Y", OR: "O", NOT: "NO",
    ROUND: "REDONDEAR", ISERROR: "ESERROR", IFERROR: "SIERROR", SQRT: "RAIZ", POWER: "POTENCIA", CONCAT: "CONCATENAR", CONCATENATE: "CONCATENAR", UPPER: "MAYUSC", LOWER: "MINUSC", LEN: "LARGO",
    VLOOKUP: "BUSCARV", COUNTIF: "CONTAR.SI", SUMIF: "SUMAR.SI", TODAY: "HOY", DATE: "FECHA", DAYS: "DIAS", "DÍAS": "DIAS" };
  const NOMBRES = Object.keys(FUNCS);

  function num(v) {
    if (v instanceof ErrorF) throw v;
    if (typeof v === "number") return v;
    if (v instanceof FechaF) return v.serie;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (v === "" || v == null) return 0;
    const fe = leerFecha(String(v).trim());   // "2026-12-01" o "01/12/2026" escritos como texto: su número de serie
    if (fe) return fe.serie;
    const n = parseFloat(String(v).replace(",", "."));
    if (isNaN(n)) throw E("#VALOR!");
    return n;
  }
  const texto = (v) => (v == null ? "" : typeof v === "number" || v instanceof FechaF ? formatear(v) : String(v));
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
        const f = leerFecha(t);
        if (f) return f;
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
          const x = esNum(a) && esNum(b) ? [+a, +b] : [texto(a), texto(b)];
          a = { "=": x[0] === x[1], "<>": x[0] !== x[1], "<": x[0] < x[1], ">": x[0] > x[1], "<=": x[0] <= x[1], ">=": x[0] >= x[1] }[o];
        }
        return a;
      }
      function suma() {
        let a = term();
        while (ver() && ver().k === "op" && ["+", "-", "&"].includes(ver().v)) {
          const o = toma().v, b = term();
          if (o === "&") { a = texto(a) + texto(b); continue; }
          const r = o === "+" ? num(a) + num(b) : num(a) - num(b);
          // Fecha ± días = fecha; fecha - fecha = días.
          const fa = a instanceof FechaF, fb = b instanceof FechaF;
          a = (fa && !fb) || (fb && !fa && o === "+") ? new FechaF(r) : r;
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
        out.cols = Math.abs(a.c - b.c) + 1;   // forma del rango (BUSCARV la usa)
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
    if (v instanceof FechaF) return textoFecha(v);
    if (typeof v === "boolean") return v ? "VERDADERO" : "FALSO";
    if (typeof v === "number") {
      if (!isFinite(v)) return "#DIV/0!";
      const r = Math.round(v * 1e6) / 1e6;
      return Math.abs(r) >= 1e4 ? r.toLocaleString("es-MX", { maximumFractionDigits: 4 }) : String(r);
    }
    return String(v);
  }

  NOM.formulas = { evaluador, formatear, ErrorF, FechaF, esNum, colLetra, colNum, ref, parseRef, NOMBRES, leerFecha, criterio };
})();
