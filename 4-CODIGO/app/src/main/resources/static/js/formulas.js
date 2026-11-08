/* NOM-COLAB · motor de fórmulas del modo hoja.
   Acepta nombres en español y en inglés (=SUMA o =SUM) y los separadores , y ;
   Errores: #REF! #DIV/0! #NOMBRE? #VALOR! #CICLO! #N/A #NUM!
   Fechas como en Excel: un número de serie (días desde el 30/12/1899) que se muestra dd/mm/aaaa.
   Se escriben en una celda como 07/11/2026 o 2026-11-07, o con =FECHA(2026; 11; 7) y =HOY().

   Referencias (8.1): A1, $A$1, $A1, A$1, rangos A1:B5, columnas y filas enteras (A:A, 1:3) y de
   otra hoja (Hoja2!A1, 'Mi hoja'!A1:B3). Al copiar una fórmula se mueven solo las partes sin $
   (desplazar), y al insertar o borrar filas y columnas se corrigen todas (ajustarEstructura).
   Formatos de número como los de Excel ("#,##0.00", "$#,##0.00", "0%", "dd/mm/aaaa"…). */
(function () {
  "use strict";
  const NOM = window.NOM;

  const colNum = (s) => s.toUpperCase().split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const colLetra = (n) => { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ref = (c, f) => colLetra(c) + (f + 1);
  const parseRef = (r) => { const m = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(String(r || "").trim()); return m ? { c: colNum(m[1]) - 1, f: parseInt(m[2], 10) - 1 } : null; };

  class ErrorF { constructor(c) { this.codigo = c; } toString() { return this.codigo; } }
  const E = (c) => new ErrorF(c);

  // ------------------------------------------------------------ fechas
  const DIA = 86400000, BASE = Date.UTC(1899, 11, 30);
  /** Una fecha: su número de serie de Excel (la parte decimal es la hora). Sumarle días da otra
      fecha; restar dos fechas, los días. */
  class FechaF { constructor(serie) { this.serie = +serie; } valueOf() { return this.serie; } }
  const serieDe = (a, m, d) => Math.round((Date.UTC(a, m - 1, d) - BASE) / DIA);
  const fechaDe = (serie) => new Date(BASE + Math.floor(serie + 1e-9) * DIA);
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const DIAS_S = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const DIAS_C = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  function textoFecha(f) {
    const d = fechaDe(f.serie);
    const t = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
    const fr = f.serie - Math.floor(f.serie + 1e-9);
    if (fr > 1e-7) { const min = Math.round(fr * 1440); return t + ` ${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; }
    return t;
  }
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
  function ahora() { const d = new Date(); return new FechaF(serieDe(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 60 + d.getMinutes()) / 1440); }

  // ------------------------------------------------------------ criterios de CONTAR.SI, SUMAR.SI…
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

  // ------------------------------------------------------------ referencias
  const LETRA_HOJA = "A-Za-zÁÉÍÓÚÑáéíóúñÜü_";
  const RE_REF = new RegExp(
    "^(?:'((?:[^']|'')+)'!|([" + LETRA_HOJA + "][" + LETRA_HOJA + "0-9.]*)!)?" +
    "(?:(\\$?)([A-Za-z]{1,3})(\\$?)(\\d+)(?::(\\$?)([A-Za-z]{1,3})(\\$?)(\\d+))?" +
    "|(\\$?)([A-Za-z]{1,3}):(\\$?)([A-Za-z]{1,3})" +
    "|(\\$?)(\\d+):(\\$?)(\\d+))");
  /** Lee una referencia en s desde i. Devuelve { ref, fin } o null (si es un nombre de función, no). */
  function leerRef(s, i) {
    const m = RE_REF.exec(s.slice(i));
    if (!m) return null;
    const fin = i + m[0].length, sig = s[fin] || "";
    if (/[A-Za-z0-9_(ÁÉÍÓÚÑáéíóúñ.]/.test(sig)) return null;
    let j = fin; while (s[j] === " ") j++;
    if (s[j] === "(") return null;
    const hoja = m[1] != null ? m[1].replace(/''/g, "'") : m[2] != null ? m[2] : null;
    let r;
    if (m[4]) {
      const a = { c: colNum(m[4]) - 1, f: +m[6] - 1, ac: !!m[3], af: !!m[5] };
      if (a.f < 0) return null;
      if (m[8]) { const b = { c: colNum(m[8]) - 1, f: +m[10] - 1, ac: !!m[7], af: !!m[9] }; if (b.f < 0) return null; r = { tipo: "rango", a, b }; }
      else r = { tipo: "celda", a, b: a };
    } else if (m[12]) r = { tipo: "col", a: { c: colNum(m[12]) - 1, ac: !!m[11] }, b: { c: colNum(m[14]) - 1, ac: !!m[13] } };
    else {
      const a = { f: +m[16] - 1, af: !!m[15] }, b = { f: +m[18] - 1, af: !!m[17] };
      if (a.f < 0 || b.f < 0) return null;
      r = { tipo: "fila", a, b };
    }
    r.hoja = hoja;
    return { ref: r, fin };
  }
  const necesitaComillas = (n) => !new RegExp("^[" + LETRA_HOJA + "][" + LETRA_HOJA + "0-9.]*$").test(n) || /^[A-Za-z]{1,3}\d+$/.test(n);
  const prefijoHoja = (n) => (n == null ? "" : (necesitaComillas(n) ? "'" + n.replace(/'/g, "''") + "'" : n) + "!");
  function textoRef(r) {
    const p = prefijoHoja(r.hoja);
    const cel = (x) => (x.ac ? "$" : "") + colLetra(x.c) + (x.af ? "$" : "") + (x.f + 1);
    if (r.tipo === "celda") return p + cel(r.a);
    if (r.tipo === "rango") return p + cel(r.a) + ":" + cel(r.b);
    if (r.tipo === "col") return p + (r.a.ac ? "$" : "") + colLetra(r.a.c) + ":" + (r.b.ac ? "$" : "") + colLetra(r.b.c);
    return p + (r.a.af ? "$" : "") + (r.a.f + 1) + ":" + (r.b.af ? "$" : "") + (r.b.f + 1);
  }
  /** Recorre las referencias de una fórmula (sin tocar los textos entre comillas); fn(ref) devuelve
      el texto nuevo, "#REF!" o null para dejarla igual. */
  function transformarRefs(formula, fn) {
    const s = String(formula);
    if (s[0] !== "=") return s;
    let out = "=", i = 1;
    while (i < s.length) {
      const c = s[i];
      if (c === '"') { let j = i + 1; while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') { j += 2; continue; } break; } j++; } out += s.slice(i, j + 1); i = j + 1; continue; }
      const prev = out[out.length - 1] || "";
      if (!/[A-Za-z0-9_.$ÁÉÍÓÚÑáéíóúñ]/.test(prev)) {
        const r = leerRef(s, i);
        if (r) { const n = fn(r.ref); out += n == null ? s.slice(i, r.fin) : n; i = r.fin; continue; }
      }
      // Un nombre (función o booleano) se copia entero para no leer "LOG10" como celda.
      const id = new RegExp("^[" + LETRA_HOJA + "][" + LETRA_HOJA + "0-9.]*").exec(s.slice(i));
      if (id && !/[A-Za-z0-9_.$ÁÉÍÓÚÑáéíóúñ]/.test(prev)) {
        const r = leerRef(s, i);
        if (!r) { out += id[0]; i += id[0].length; continue; }
      }
      out += c; i++;
    }
    return out;
  }
  /** Copiar una fórmula dc columnas y df filas más allá: solo se mueve lo que no lleva $. */
  function desplazar(formula, dc, df) {
    if (!dc && !df) return formula;
    return transformarRefs(formula, (r) => {
      const n = JSON.parse(JSON.stringify(r));
      const mueve = (x) => {
        if (x.c != null && !x.ac) x.c += dc;
        if (x.f != null && !x.af) x.f += df;
        return (x.c == null || x.c >= 0) && (x.f == null || x.f >= 0);
      };
      if (!mueve(n.a) || (n.b !== n.a && r.b !== r.a && !mueve(n.b))) return "#REF!";
      if (r.b === r.a) n.b = n.a;
      return textoRef(n);
    });
  }
  const normal = (n) => String(n || "").trim().toLowerCase();
  /**
   * Insertar (n > 0) o borrar (n < 0) filas o columnas de una hoja: corrige las referencias que
   * apuntan a ella. opc = { hoja: nombre de la hoja que cambia, propia: la fórmula vive en esa hoja,
   * eje: "f" (filas) o "c" (columnas), en: índice (desde 0), n }.
   */
  function ajustarEstructura(formula, opc) {
    const k = opc.eje === "c" ? "c" : "f", p = opc.en, n = opc.n;
    return transformarRefs(formula, (r) => {
      const apunta = r.hoja != null ? normal(r.hoja) === normal(opc.hoja) : !!opc.propia;
      if (!apunta) return null;
      if ((k === "f" && r.tipo === "col") || (k === "c" && r.tipo === "fila")) return null;
      const x = JSON.parse(JSON.stringify(r));
      if (x.b === undefined || r.b === r.a) x.b = x.a;
      const unico = r.tipo === "celda";
      if (n > 0) {
        if (x.a[k] >= p) x.a[k] += n;
        if (!unico && x.b[k] >= p) x.b[k] += n;
      } else {
        const q = -n, fin = p + q;
        const dentro = (v) => v >= p && v < fin;
        if (unico) {
          if (dentro(x.a[k])) return "#REF!";
          if (x.a[k] >= fin) x.a[k] -= q;
        } else {
          const ia = x.a[k], ib = x.b[k];
          if (dentro(ia) && dentro(ib)) return "#REF!";
          x.a[k] = ia >= fin ? ia - q : dentro(ia) ? p : ia;
          x.b[k] = ib >= fin ? ib - q : dentro(ib) ? p - 1 : ib;
          if (x.b[k] < x.a[k]) return "#REF!";
        }
      }
      if (unico) x.b = x.a;
      return textoRef(x);
    });
  }
  /** Al cambiar el nombre de una hoja, las fórmulas que la nombran usan el nombre nuevo. */
  function renombrarHoja(formula, viejo, nuevo) {
    return transformarRefs(formula, (r) => (r.hoja != null && normal(r.hoja) === normal(viejo) ? textoRef(Object.assign({}, r, { hoja: nuevo })) : null));
  }
  /** Las referencias de una fórmula (para resaltar celdas mientras se escribe). */
  function refsDe(formula) { const l = []; transformarRefs(formula, (r) => { l.push(r); return null; }); return l; }

  // ------------------------------------------------------------ análisis
  function tokens(s) {
    const t = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"') {
        let j = i + 1, v = "";
        while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') { v += '"'; j += 2; continue; } break; } v += s[j++]; }
        t.push({ k: "str", v }); i = j + 1; continue;
      }
      const r = leerRef(s, i);
      if (r) { t.push({ k: "ref", v: r.ref }); i = r.fin; continue; }
      const num = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
      if (num) { t.push({ k: "num", v: parseFloat(num[0]) }); i += num[0].length; continue; }
      const id = /^[A-Za-zÁÉÍÓÚÑáéíóúñ_][A-Za-z0-9ÁÉÍÓÚÑáéíóúñ_.]*/.exec(s.slice(i));
      if (id) { t.push({ k: "id", v: id[0].toUpperCase().replace(/^_XLFN\.|^_XLWS\./, "") }); i += id[0].length; continue; }
      const op = /^(<=|>=|<>|[-+*/^&(),;=<>%])/.exec(s.slice(i));
      if (op) { t.push({ k: "op", v: op[0] }); i += op[0].length; continue; }
      if (c === "#") { const e = /^#(REF!|DIV\/0!|NOMBRE\?|NAME\?|VALOR!|VALUE!|N\/A|NUM!|CICLO!)/.exec(s.slice(i)); if (e) { t.push({ k: "err", v: e[0] }); i += e[0].length; continue; } }
      throw E("#VALOR!");
    }
    return t;
  }

  // ------------------------------------------------------------ funciones
  const plano = (args) => args.flat(Infinity);
  const nums = (args) => { const p = plano(args); const e = p.find((v) => v instanceof ErrorF); if (e) throw e; return p.filter(esNum).map((v) => +v); };
  /** Un rango como tabla (filas × columnas), para BUSCARV, INDICE… */
  const tabla = (r) => { if (!Array.isArray(r)) return [[r]]; const cols = r.cols || 1; const t = []; for (let i = 0; i < r.length; i += cols) t.push(r.slice(i, i + cols)); return t; };
  const lista = (r) => (Array.isArray(r) ? r : [r]);
  const media = (n) => n.reduce((x, y) => x + y, 0) / n.length;
  function varianza(a, muestra) {
    const n = nums(a);
    if (n.length < (muestra ? 2 : 1)) throw E("#DIV/0!");
    const m = media(n);
    return n.reduce((s, x) => s + (x - m) * (x - m), 0) / (n.length - (muestra ? 1 : 0));
  }
  const redondeo = (n, d, modo) => {
    const p = Math.pow(10, d || 0), x = Math.abs(n) * p;
    const r = modo === "mas" ? Math.ceil(x - 1e-9) : modo === "menos" ? Math.floor(x + 1e-9) : Math.round(x + 1e-9);
    return (Math.sign(n) * r) / p;
  };
  /** Pares rango–criterio de los *.SI.CONJUNTO (desde la posición 'desde'). Devuelve el filtro por índice. */
  function filtroConjunto(a, desde) {
    const pares = [];
    for (let i = desde; i + 1 < a.length; i += 2) pares.push([lista(a[i]), criterio(a[i + 1])]);
    if (!pares.length) throw E("#VALOR!");
    const largo = pares[0][0].length;
    if (pares.some(([r]) => r.length !== largo)) throw E("#VALOR!");
    return { largo, pasa: (k) => pares.every(([r, p]) => p(r[k])) };
  }
  const deFecha = (v) => { const n = num(v); return fechaDe(n); };
  const ultimoDia = (a, m) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  function sumarMeses(v, meses, fin) {
    const d = deFecha(v), a = d.getUTCFullYear(), m = d.getUTCMonth() + Math.trunc(meses);
    const aa = a + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
    const dia = fin ? ultimoDia(aa, mm) : Math.min(d.getUTCDate(), ultimoDia(aa, mm));
    return new FechaF(serieDe(aa, mm + 1, dia));
  }
  function buscarEn(buscado, valores, tipo) {
    if (buscado instanceof ErrorF) throw buscado;
    if (tipo === 0) {
      const p = criterio(esNum(buscado) ? +buscado : "=" + texto(buscado));
      return valores.findIndex((v) => p(v));
    }
    let mejor = -1;
    for (let i = 0; i < valores.length; i++) {
      const v = valores[i];
      const cmp = esNum(buscado) ? (esNum(v) ? +v - +buscado : null) : (!esNum(v) ? texto(v).toLowerCase().localeCompare(texto(buscado).toLowerCase()) : null);
      if (cmp == null) continue;
      if (tipo === 1 ? cmp <= 0 : cmp >= 0) mejor = i; else break;
    }
    return mejor;
  }
  const FUNCS = {
    // matemáticas
    SUMA: (a) => nums(a).reduce((x, y) => x + y, 0),
    PROMEDIO: (a) => { const n = nums(a); return n.length ? media(n) : E("#DIV/0!"); },
    MIN: (a) => { const n = nums(a); return n.length ? Math.min(...n) : 0; },
    MAX: (a) => { const n = nums(a); return n.length ? Math.max(...n) : 0; },
    CONTAR: (a) => nums(a).length,
    CONTARA: (a) => plano(a).filter((v) => v !== "" && v != null).length,
    "CONTAR.BLANCO": (a) => plano(a).filter((v) => v === "" || v == null).length,
    PRODUCTO: (a) => nums(a).reduce((x, y) => x * y, 1),
    SUMAPRODUCTO: (a) => {
      const ls = a.map(lista), n = ls[0].length;
      if (ls.some((l) => l.length !== n)) throw E("#VALOR!");
      let s = 0;
      for (let i = 0; i < n; i++) s += ls.reduce((p, l) => p * (esNum(l[i]) ? +l[i] : 0), 1);
      return s;
    },
    REDONDEAR: (a) => redondeo(num(a[0]), num(a[1] === undefined ? 0 : a[1])),
    "REDONDEAR.MAS": (a) => redondeo(num(a[0]), num(a[1] === undefined ? 0 : a[1]), "mas"),
    "REDONDEAR.MENOS": (a) => redondeo(num(a[0]), num(a[1] === undefined ? 0 : a[1]), "menos"),
    TRUNCAR: (a) => redondeo(num(a[0]), num(a[1] === undefined ? 0 : a[1]), "menos"),
    ENTERO: (a) => Math.floor(num(a[0])),
    RESIDUO: (a) => { const n = num(a[0]), d = num(a[1]); if (d === 0) throw E("#DIV/0!"); return n - d * Math.floor(n / d); },
    ABS: (a) => Math.abs(num(a[0])),
    RAIZ: (a) => { const n = num(a[0]); return n < 0 ? E("#NUM!") : Math.sqrt(n); },
    POTENCIA: (a) => Math.pow(num(a[0]), num(a[1])),
    PI: () => Math.PI,
    SIGNO: (a) => Math.sign(num(a[0])),
    EXP: (a) => Math.exp(num(a[0])),
    LN: (a) => { const n = num(a[0]); return n <= 0 ? E("#NUM!") : Math.log(n); },
    LOG: (a) => { const n = num(a[0]), b = a[1] === undefined ? 10 : num(a[1]); return n <= 0 || b <= 0 || b === 1 ? E("#NUM!") : Math.log(n) / Math.log(b); },
    LOG10: (a) => { const n = num(a[0]); return n <= 0 ? E("#NUM!") : Math.log10(n); },
    SENO: (a) => Math.sin(num(a[0])),
    COS: (a) => Math.cos(num(a[0])),
    TAN: (a) => Math.tan(num(a[0])),
    GRADOS: (a) => (num(a[0]) * 180) / Math.PI,
    RADIANES: (a) => (num(a[0]) * Math.PI) / 180,
    ALEATORIO: () => Math.random(),
    "ALEATORIO.ENTRE": (a) => { const lo = Math.ceil(num(a[0])), hi = Math.floor(num(a[1])); if (hi < lo) throw E("#NUM!"); return lo + Math.floor(Math.random() * (hi - lo + 1)); },
    // estadística
    MEDIANA: (a) => { const n = nums(a).sort((x, y) => x - y); if (!n.length) throw E("#NUM!"); const m = n.length >> 1; return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; },
    MODA: (a) => {
      const n = nums(a), cuenta = new Map();
      let mejor = null, max = 1;
      n.forEach((x) => { const c = (cuenta.get(x) || 0) + 1; cuenta.set(x, c); if (c > max) { max = c; mejor = x; } });
      return mejor == null ? E("#N/A") : mejor;
    },
    DESVEST: (a) => Math.sqrt(varianza(a, true)),
    DESVESTP: (a) => Math.sqrt(varianza(a, false)),
    VAR: (a) => varianza(a, true),
    VARP: (a) => varianza(a, false),
    JERARQUIA: (a) => {
      const n = num(a[0]), l = nums([a[1]]), asc = a[2] !== undefined && verdad(a[2]) && a[2] !== 0;
      if (!l.includes(n)) return E("#N/A");
      return 1 + l.filter((x) => (asc ? x < n : x > n)).length;
    },
    "K.ESIMO.MAYOR": (a) => { const l = nums([a[0]]).sort((x, y) => y - x), k = Math.floor(num(a[1])); return k >= 1 && k <= l.length ? l[k - 1] : E("#NUM!"); },
    "K.ESIMO.MENOR": (a) => { const l = nums([a[0]]).sort((x, y) => x - y), k = Math.floor(num(a[1])); return k >= 1 && k <= l.length ? l[k - 1] : E("#NUM!"); },
    "CONTAR.SI": (a) => { const p = criterio(a[1]); return plano([a[0]]).filter((v) => p(v)).length; },
    "SUMAR.SI": (a) => {
      const p = criterio(a[1]), r = plano([a[0]]), sumas = a[2] === undefined ? r : plano([a[2]]);
      let total = 0;
      r.forEach((v, i) => { if (p(v) && esNum(sumas[i])) total += +sumas[i]; });
      return total;
    },
    "PROMEDIO.SI": (a) => {
      const p = criterio(a[1]), r = plano([a[0]]), vals = a[2] === undefined ? r : plano([a[2]]);
      const l = []; r.forEach((v, i) => { if (p(v) && esNum(vals[i])) l.push(+vals[i]); });
      return l.length ? media(l) : E("#DIV/0!");
    },
    "CONTAR.SI.CONJUNTO": (a) => { const f = filtroConjunto(a, 0); let n = 0; for (let k = 0; k < f.largo; k++) if (f.pasa(k)) n++; return n; },
    "SUMAR.SI.CONJUNTO": (a) => { const v = lista(a[0]), f = filtroConjunto(a, 1); let s = 0; for (let k = 0; k < f.largo; k++) if (f.pasa(k) && esNum(v[k])) s += +v[k]; return s; },
    "PROMEDIO.SI.CONJUNTO": (a) => { const v = lista(a[0]), f = filtroConjunto(a, 1), l = []; for (let k = 0; k < f.largo; k++) if (f.pasa(k) && esNum(v[k])) l.push(+v[k]); return l.length ? media(l) : E("#DIV/0!"); },
    "MAX.SI.CONJUNTO": (a) => { const v = lista(a[0]), f = filtroConjunto(a, 1), l = []; for (let k = 0; k < f.largo; k++) if (f.pasa(k) && esNum(v[k])) l.push(+v[k]); return l.length ? Math.max(...l) : 0; },
    "MIN.SI.CONJUNTO": (a) => { const v = lista(a[0]), f = filtroConjunto(a, 1), l = []; for (let k = 0; k < f.largo; k++) if (f.pasa(k) && esNum(v[k])) l.push(+v[k]); return l.length ? Math.min(...l) : 0; },
    // lógicas
    SI: (a) => { if (a[0] instanceof ErrorF) throw a[0]; return verdad(a[0]) ? (a[1] === undefined ? true : a[1]) : (a[2] === undefined ? false : a[2]); },
    "SI.CONJUNTO": (a) => { for (let i = 0; i + 1 < a.length; i += 2) { if (a[i] instanceof ErrorF) throw a[i]; if (verdad(a[i])) return a[i + 1]; } return E("#N/A"); },
    ESERROR: (a) => a[0] instanceof ErrorF,
    SIERROR: (a) => (a[0] instanceof ErrorF ? (a[1] === undefined ? "" : a[1]) : a[0]),
    ESBLANCO: (a) => a[0] === "" || a[0] == null,
    ESNUMERO: (a) => esNum(a[0]),
    ESTEXTO: (a) => typeof a[0] === "string" && a[0] !== "",
    Y: (a) => plano(a).every(verdad),
    O: (a) => plano(a).some(verdad),
    NO: (a) => !verdad(a[0]),
    // texto
    CONCATENAR: (a) => plano(a).map(texto).join(""),
    UNIRCADENAS: (a) => { const d = texto(a[0]), ign = verdad(a[1]); return plano(a.slice(2)).map(texto).filter((x) => !ign || x !== "").join(d); },
    MAYUSC: (a) => texto(a[0]).toUpperCase(),
    MINUSC: (a) => texto(a[0]).toLowerCase(),
    NOMPROPIO: (a) => texto(a[0]).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, p, l) => p + l.toUpperCase()),
    LARGO: (a) => Array.from(texto(a[0])).length,
    IZQUIERDA: (a) => Array.from(texto(a[0])).slice(0, a[1] === undefined ? 1 : Math.max(0, num(a[1]))).join(""),
    DERECHA: (a) => { const c = Array.from(texto(a[0])), n = a[1] === undefined ? 1 : Math.max(0, num(a[1])); return n ? c.slice(-n).join("") : ""; },
    EXTRAE: (a) => { const i = Math.floor(num(a[1])); if (i < 1) throw E("#VALOR!"); return Array.from(texto(a[0])).slice(i - 1, i - 1 + Math.max(0, num(a[2]))).join(""); },
    ESPACIOS: (a) => texto(a[0]).trim().replace(/ {2,}/g, " "),
    SUSTITUIR: (a) => {
      const t = texto(a[0]), viejo = texto(a[1]), nuevo = texto(a[2]);
      if (!viejo) return t;
      if (a[3] === undefined) return t.split(viejo).join(nuevo);
      let k = Math.floor(num(a[3])), i = -1;
      while (k-- > 0) { i = t.indexOf(viejo, i + 1); if (i < 0) return t; }
      return t.slice(0, i) + nuevo + t.slice(i + viejo.length);
    },
    REEMPLAZAR: (a) => { const c = Array.from(texto(a[0])), i = Math.floor(num(a[1])) - 1, n = Math.max(0, num(a[2])); return c.slice(0, i).join("") + texto(a[3]) + c.slice(i + n).join(""); },
    ENCONTRAR: (a) => { const i = texto(a[1]).indexOf(texto(a[0]), (a[2] === undefined ? 1 : num(a[2])) - 1); return i < 0 ? E("#VALOR!") : i + 1; },
    HALLAR: (a) => { const i = texto(a[1]).toLowerCase().indexOf(texto(a[0]).toLowerCase(), (a[2] === undefined ? 1 : num(a[2])) - 1); return i < 0 ? E("#VALOR!") : i + 1; },
    TEXTO: (a) => aplicarFormato(a[0], texto(a[1])),
    VALOR: (a) => { const v = calcularLiteral(texto(a[0]).trim()); if (!esNum(v)) throw E("#VALOR!"); return +v; },
    REPETIR: (a) => texto(a[0]).repeat(Math.max(0, Math.min(10000, Math.floor(num(a[1]))))),
    IGUAL: (a) => texto(a[0]) === texto(a[1]),
    CARACTER: (a) => String.fromCharCode(Math.floor(num(a[0]))),
    // fechas
    HOY: () => hoy(),
    AHORA: () => ahora(),
    FECHA: (a) => { const y = Math.floor(num(a[0])), m = Math.floor(num(a[1])), d = Math.floor(num(a[2])); return new FechaF(Math.round((Date.UTC(y < 100 ? 1900 + y : y, m - 1, d) - BASE) / DIA)); },
    DIAS: (a) => Math.round(num(a[0]) - num(a[1])),
    "AÑO": (a) => deFecha(a[0]).getUTCFullYear(),
    MES: (a) => deFecha(a[0]).getUTCMonth() + 1,
    DIA: (a) => deFecha(a[0]).getUTCDate(),
    DIASEM: (a) => { const d = deFecha(a[0]).getUTCDay(), t = a[1] === undefined ? 1 : num(a[1]); return t === 2 ? ((d + 6) % 7) + 1 : t === 3 ? (d + 6) % 7 : d + 1; },
    "FIN.MES": (a) => sumarMeses(a[0], num(a[1] === undefined ? 0 : a[1]), true),
    "FECHA.MES": (a) => sumarMeses(a[0], num(a[1] === undefined ? 0 : a[1]), false),
    "DIAS.LAB": (a) => {
      let i = Math.floor(num(a[0])), f = Math.floor(num(a[1])), sg = 1;
      if (f < i) { [i, f] = [f, i]; sg = -1; }
      let n = 0;
      for (let s = i; s <= f && n < 100000; s++) { const d = fechaDe(s).getUTCDay(); if (d !== 0 && d !== 6) n++; }
      return n * sg;
    },
    SIFECHA: (a) => {
      const d1 = deFecha(a[0]), d2 = deFecha(a[1]), u = texto(a[2]).toUpperCase();
      if (d2 < d1) throw E("#NUM!");
      let meses = (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + d2.getUTCMonth() - d1.getUTCMonth();
      if (d2.getUTCDate() < d1.getUTCDate()) meses--;
      if (u === "Y" || u === "A") return Math.floor(meses / 12);
      if (u === "M") return meses;
      if (u === "D") return Math.round((d2 - d1) / DIA);
      throw E("#NUM!");
    },
    // búsqueda
    BUSCARV: (a) => {
      const t = tabla(a[1]);
      const col = Math.floor(num(a[2]));
      if (col < 1 || col > (t[0] || []).length) return E("#REF!");
      const exacta = a[3] !== undefined && !(verdad(a[3]) && a[3] !== 0);
      const i = buscarEn(a[0], t.map((f) => f[0]), exacta ? 0 : 1);
      return i < 0 ? E("#N/A") : t[i][col - 1];
    },
    BUSCARH: (a) => {
      const t = tabla(a[1]), fila = Math.floor(num(a[2]));
      if (fila < 1 || fila > t.length) return E("#REF!");
      const exacta = a[3] !== undefined && !(verdad(a[3]) && a[3] !== 0);
      const i = buscarEn(a[0], t[0], exacta ? 0 : 1);
      return i < 0 ? E("#N/A") : t[fila - 1][i];
    },
    BUSCARX: (a) => {
      const donde = lista(a[1]), que = lista(a[2]);
      const i = buscarEn(a[0], donde, 0);
      if (i < 0) return a[3] === undefined ? E("#N/A") : a[3];
      return que[i] === undefined ? E("#VALOR!") : que[i];
    },
    INDICE: (a) => {
      const t = tabla(a[0]);
      let f = a[1] === undefined ? 1 : Math.floor(num(a[1])), c = a[2] === undefined ? 1 : Math.floor(num(a[2]));
      if (t.length === 1 && a[2] === undefined) { c = f; f = 1; }
      if (f < 1 || c < 1 || f > t.length || c > (t[0] || []).length) return E("#REF!");
      return t[f - 1][c - 1];
    },
    COINCIDIR: (a) => {
      const tipo = a[2] === undefined ? 1 : Math.sign(num(a[2]));
      const i = buscarEn(a[0], lista(a[1]), tipo === 0 ? 0 : tipo);
      return i < 0 ? E("#N/A") : i + 1;
    },
    ELEGIR: (a) => { const i = Math.floor(num(a[0])); if (i < 1 || i >= a.length) return E("#VALOR!"); return a[i]; },
  };
  FUNCS.CONCAT = FUNCS.CONCATENAR;
  const ALIAS = {
    SUM: "SUMA", AVERAGE: "PROMEDIO", COUNT: "CONTAR", COUNTA: "CONTARA", COUNTBLANK: "CONTAR.BLANCO", PRODUCT: "PRODUCTO", SUMPRODUCT: "SUMAPRODUCTO",
    IF: "SI", IFS: "SI.CONJUNTO", AND: "Y", OR: "O", NOT: "NO", ISERROR: "ESERROR", IFERROR: "SIERROR", ISBLANK: "ESBLANCO", ISNUMBER: "ESNUMERO", ISTEXT: "ESTEXTO",
    ROUND: "REDONDEAR", ROUNDUP: "REDONDEAR.MAS", ROUNDDOWN: "REDONDEAR.MENOS", TRUNC: "TRUNCAR", INT: "ENTERO", MOD: "RESIDUO", SQRT: "RAIZ", POWER: "POTENCIA",
    SIGN: "SIGNO", SIN: "SENO", DEGREES: "GRADOS", RADIANS: "RADIANES", RAND: "ALEATORIO", RANDBETWEEN: "ALEATORIO.ENTRE",
    MEDIAN: "MEDIANA", MODE: "MODA", "MODE.SNGL": "MODA", "MODA.UNO": "MODA", STDEV: "DESVEST", "STDEV.S": "DESVEST", "DESVEST.M": "DESVEST", STDEVP: "DESVESTP",
    "STDEV.P": "DESVESTP", "DESVEST.P": "DESVESTP", "VAR.S": "VAR", "VAR.M": "VAR", "VAR.P": "VARP", RANK: "JERARQUIA", "RANK.EQ": "JERARQUIA", "JERARQUIA.EQV": "JERARQUIA",
    "JERARQUÍA": "JERARQUIA", LARGE: "K.ESIMO.MAYOR", SMALL: "K.ESIMO.MENOR",
    COUNTIF: "CONTAR.SI", SUMIF: "SUMAR.SI", AVERAGEIF: "PROMEDIO.SI", COUNTIFS: "CONTAR.SI.CONJUNTO", SUMIFS: "SUMAR.SI.CONJUNTO", AVERAGEIFS: "PROMEDIO.SI.CONJUNTO",
    MAXIFS: "MAX.SI.CONJUNTO", MINIFS: "MIN.SI.CONJUNTO",
    CONCATENATE: "CONCATENAR", TEXTJOIN: "UNIRCADENAS", UPPER: "MAYUSC", LOWER: "MINUSC", PROPER: "NOMPROPIO", LEN: "LARGO", LEFT: "IZQUIERDA", RIGHT: "DERECHA",
    MID: "EXTRAE", TRIM: "ESPACIOS", SUBSTITUTE: "SUSTITUIR", REPLACE: "REEMPLAZAR", FIND: "ENCONTRAR", SEARCH: "HALLAR", TEXT: "TEXTO", VALUE: "VALOR", REPT: "REPETIR",
    EXACT: "IGUAL", CHAR: "CARACTER", "CARÁCTER": "CARACTER",
    TODAY: "HOY", NOW: "AHORA", DATE: "FECHA", DAYS: "DIAS", "DÍAS": "DIAS", YEAR: "AÑO", MONTH: "MES", DAY: "DIA", "DÍA": "DIA", WEEKDAY: "DIASEM", EOMONTH: "FIN.MES",
    EDATE: "FECHA.MES", NETWORKDAYS: "DIAS.LAB", "DÍAS.LAB": "DIAS.LAB", DATEDIF: "SIFECHA",
    VLOOKUP: "BUSCARV", HLOOKUP: "BUSCARH", XLOOKUP: "BUSCARX", INDEX: "INDICE", "ÍNDICE": "INDICE", MATCH: "COINCIDIR", CHOOSE: "ELEGIR",
  };
  const NOMBRES = Object.keys(FUNCS);
  /** Nombre en inglés para Excel (.xlsx); las funciones nuevas de Excel llevan el prefijo _xlfn. */
  const INGLES = {};
  for (const [en, es] of Object.entries(ALIAS)) if (!INGLES[es] && /^[A-Z.]+$/.test(en) && !/^(MODE\.SNGL|STDEV\.S|STDEV\.P|VAR\.S|VAR\.P|RANK\.EQ)$/.test(en)) INGLES[es] = en;
  Object.assign(INGLES, { MIN: "MIN", MAX: "MAX", ABS: "ABS", PI: "PI", EXP: "EXP", LN: "LN", LOG: "LOG", LOG10: "LOG10", COS: "COS", TAN: "TAN",
    "SI.CONJUNTO": "_xlfn.IFS", BUSCARX: "_xlfn.XLOOKUP", CONCAT: "_xlfn.CONCAT", UNIRCADENAS: "_xlfn.TEXTJOIN", "MAX.SI.CONJUNTO": "_xlfn.MAXIFS",
    "MIN.SI.CONJUNTO": "_xlfn.MINIFS", DIAS: "_xlfn.DAYS", CONCATENAR: "CONCATENATE", DESVEST: "STDEV", DESVESTP: "STDEVP", VAR: "VAR", VARP: "VARP", JERARQUIA: "RANK", MODA: "MODE" });

  /** Ayuda al escribir: qué pide cada función y qué hace. */
  const FIRMAS = {
    SUMA: ["número1; [número2]; …", "Suma los números."], PROMEDIO: ["número1; [número2]; …", "El promedio (media) de los números."],
    MIN: ["número1; [número2]; …", "El número más chico."], MAX: ["número1; [número2]; …", "El número más grande."],
    CONTAR: ["valor1; [valor2]; …", "Cuántas celdas tienen números."], CONTARA: ["valor1; [valor2]; …", "Cuántas celdas no están vacías."],
    "CONTAR.BLANCO": ["rango", "Cuántas celdas están vacías."], PRODUCTO: ["número1; [número2]; …", "Multiplica los números."],
    SUMAPRODUCTO: ["matriz1; [matriz2]; …", "Multiplica las listas elemento por elemento y suma."],
    REDONDEAR: ["número; decimales", "Redondea a los decimales que digas."], "REDONDEAR.MAS": ["número; decimales", "Redondea hacia arriba."],
    "REDONDEAR.MENOS": ["número; decimales", "Redondea hacia abajo."], TRUNCAR: ["número; [decimales]", "Corta los decimales sin redondear."],
    ENTERO: ["número", "La parte entera (hacia abajo)."], RESIDUO: ["número; divisor", "Lo que sobra de una división."], ABS: ["número", "El valor absoluto."],
    RAIZ: ["número", "La raíz cuadrada."], POTENCIA: ["número; potencia", "Eleva un número a una potencia."], PI: ["", "El número pi (3.14159…)."],
    SIGNO: ["número", "1 si es positivo, -1 si es negativo, 0 si es cero."], EXP: ["número", "e elevado al número."], LN: ["número", "Logaritmo natural."],
    LOG: ["número; [base]", "Logaritmo (base 10 si no dices otra)."], LOG10: ["número", "Logaritmo base 10."], SENO: ["ángulo en radianes", "El seno."],
    COS: ["ángulo en radianes", "El coseno."], TAN: ["ángulo en radianes", "La tangente."], GRADOS: ["radianes", "Pasa radianes a grados."],
    RADIANES: ["grados", "Pasa grados a radianes."], ALEATORIO: ["", "Un número al azar entre 0 y 1."], "ALEATORIO.ENTRE": ["inferior; superior", "Un entero al azar entre los dos."],
    MEDIANA: ["número1; [número2]; …", "El valor de en medio."], MODA: ["número1; [número2]; …", "El valor que más se repite."],
    DESVEST: ["número1; [número2]; …", "Desviación estándar (muestra)."], DESVESTP: ["número1; [número2]; …", "Desviación estándar (población)."],
    VAR: ["número1; [número2]; …", "Varianza (muestra)."], VARP: ["número1; [número2]; …", "Varianza (población)."],
    JERARQUIA: ["número; referencia; [orden]", "El lugar de un número en la lista (1 = el más grande)."],
    "K.ESIMO.MAYOR": ["matriz; k", "El k-ésimo más grande."], "K.ESIMO.MENOR": ["matriz; k", "El k-ésimo más chico."],
    "CONTAR.SI": ["rango; criterio", "Cuántas celdas cumplen el criterio (\">5\", \"Sí\"…)."], "SUMAR.SI": ["rango; criterio; [rango_suma]", "Suma lo que cumple el criterio."],
    "PROMEDIO.SI": ["rango; criterio; [rango_promedio]", "Promedio de lo que cumple el criterio."],
    "CONTAR.SI.CONJUNTO": ["rango1; criterio1; [rango2; criterio2]; …", "Cuenta lo que cumple todos los criterios."],
    "SUMAR.SI.CONJUNTO": ["rango_suma; rango1; criterio1; …", "Suma lo que cumple todos los criterios."],
    "PROMEDIO.SI.CONJUNTO": ["rango_promedio; rango1; criterio1; …", "Promedio de lo que cumple todos los criterios."],
    "MAX.SI.CONJUNTO": ["rango_max; rango1; criterio1; …", "El más grande de lo que cumple los criterios."],
    "MIN.SI.CONJUNTO": ["rango_min; rango1; criterio1; …", "El más chico de lo que cumple los criterios."],
    SI: ["prueba; si_es_verdadero; [si_es_falso]", "Elige un valor según una condición."], "SI.CONJUNTO": ["prueba1; valor1; [prueba2; valor2]; …", "El valor de la primera prueba que se cumple."],
    ESERROR: ["valor", "VERDADERO si es un error."], SIERROR: ["valor; si_hay_error", "Otro valor si hay error."], ESBLANCO: ["valor", "VERDADERO si está vacía."],
    ESNUMERO: ["valor", "VERDADERO si es un número."], ESTEXTO: ["valor", "VERDADERO si es texto."], Y: ["lógico1; [lógico2]; …", "VERDADERO si todo se cumple."],
    O: ["lógico1; [lógico2]; …", "VERDADERO si algo se cumple."], NO: ["lógico", "Lo contrario."],
    CONCATENAR: ["texto1; [texto2]; …", "Une textos."], CONCAT: ["texto1; [texto2]; …", "Une textos."], UNIRCADENAS: ["separador; ignorar_vacías; texto1; …", "Une textos con un separador."],
    MAYUSC: ["texto", "En MAYÚSCULAS."], MINUSC: ["texto", "En minúsculas."], NOMPROPIO: ["texto", "Cada Palabra Con Mayúscula."], LARGO: ["texto", "Cuántos caracteres tiene."],
    IZQUIERDA: ["texto; [n]", "Los primeros caracteres."], DERECHA: ["texto; [n]", "Los últimos caracteres."], EXTRAE: ["texto; inicio; n", "Caracteres desde una posición."],
    ESPACIOS: ["texto", "Quita los espacios de más."], SUSTITUIR: ["texto; texto_viejo; texto_nuevo; [instancia]", "Cambia un texto por otro."],
    REEMPLAZAR: ["texto; inicio; n; texto_nuevo", "Reemplaza caracteres por posición."], ENCONTRAR: ["buscado; dentro_de; [inicio]", "Dónde está un texto (distingue mayúsculas)."],
    HALLAR: ["buscado; dentro_de; [inicio]", "Dónde está un texto."], TEXTO: ["valor; formato", "Un número con formato (\"0.00\", \"dd/mm/aaaa\")."],
    VALOR: ["texto", "Convierte texto en número."], REPETIR: ["texto; veces", "Repite un texto."], IGUAL: ["texto1; texto2", "VERDADERO si son idénticos."],
    CARACTER: ["número", "El carácter de ese código."],
    HOY: ["", "La fecha de hoy."], AHORA: ["", "La fecha y la hora de ahora."], FECHA: ["año; mes; día", "Arma una fecha."], DIAS: ["fecha_final; fecha_inicial", "Días entre dos fechas."],
    "AÑO": ["fecha", "El año."], MES: ["fecha", "El mes (1 a 12)."], DIA: ["fecha", "El día del mes."], DIASEM: ["fecha; [tipo]", "Día de la semana (1 = domingo; tipo 2: 1 = lunes)."],
    "FIN.MES": ["fecha; meses", "El último día del mes."], "FECHA.MES": ["fecha; meses", "La misma fecha unos meses después."],
    "DIAS.LAB": ["inicio; fin", "Días hábiles (lunes a viernes)."], SIFECHA: ["inicio; fin; \"Y\" | \"M\" | \"D\"", "Años, meses o días entre dos fechas (sirve para la edad)."],
    BUSCARV: ["buscado; tabla; columna; [aproximada]", "Busca en la primera columna y devuelve otra (FALSO = exacta)."],
    BUSCARH: ["buscado; tabla; fila; [aproximada]", "Busca en la primera fila y devuelve otra."],
    BUSCARX: ["buscado; donde_buscar; que_devolver; [si_no_está]", "Busca y devuelve lo que está a la par."],
    INDICE: ["matriz; fila; [columna]", "El valor en esa fila y columna."], COINCIDIR: ["buscado; matriz; [tipo]", "En qué posición está (0 = exacta)."],
    ELEGIR: ["n; valor1; [valor2]; …", "El valor número n de la lista."],
  };

  function num(v) {
    if (v instanceof ErrorF) throw v;
    if (typeof v === "number") return v;
    if (v instanceof FechaF) return v.serie;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (v === "" || v == null) return 0;
    if (Array.isArray(v)) { if (v.length === 1) return num(v[0]); throw E("#VALOR!"); }
    const x = calcularLiteral(String(v).trim());
    if (esNum(x)) return +x;
    throw E("#VALOR!");
  }
  const texto = (v) => (v == null ? "" : typeof v === "number" || v instanceof FechaF ? formatear(v) : typeof v === "boolean" ? (v ? "VERDADERO" : "FALSO") : Array.isArray(v) ? texto(v[0]) : String(v));
  const verdad = (v) => (typeof v === "string" ? v !== "" && v.toUpperCase() !== "FALSO" && v.toUpperCase() !== "FALSE" : !!v);

  /** Lo que se escribió en una celda (sin =): número, porcentaje, moneda, fecha o texto. */
  function calcularLiteral(t) {
    if (/^-?\d+([.,]\d+)?%?$/.test(t) && !/^-?\d{1,3},\d{3}$/.test(t)) { const n = parseFloat(t.replace(",", ".")); return t.endsWith("%") ? n / 100 : n; }
    let m = /^(-?)\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/.exec(t);
    if (m && (t.includes("$") || t.includes(","))) return parseFloat(m[1] + m[2].replace(/,/g, "") + (m[3] || ""));
    m = /^(-?)(\d{1,3}(?:,\d{3})+)(\.\d+)?%$/.exec(t);
    if (m) return parseFloat(m[1] + m[2].replace(/,/g, "") + (m[3] || "")) / 100;
    const f = leerFecha(t);
    if (f) return f;
    return t;
  }

  /**
   * Hoja: obtener(c, f) -> texto crudo de la celda. Devuelve un evaluador con caché.
   * opc: { nombre, filas, cols, hojas(nombre) -> { obtener, filas, cols, nombre } | null } para
   * las referencias a otras hojas y a columnas enteras.
   */
  function evaluador(obtener, opc) {
    opc = opc || {};
    const actual = { obtener, filas: opc.filas || 0, cols: opc.cols || 0, cache: new Map(), nombre: opc.nombre || "" };
    const otras = new Map();
    const pila = new Set();
    function hojaDe(nombre, desde) {
      if (nombre == null) return desde;
      const k = normal(nombre);
      if (opc.nombre && normal(opc.nombre) === k) return actual;
      if (otras.has(k)) return otras.get(k);
      const h = opc.hojas ? opc.hojas(nombre) : null;
      const x = h ? { obtener: h.obtener, filas: h.filas || 0, cols: h.cols || 0, cache: new Map(), nombre: h.nombre || nombre } : null;
      otras.set(k, x);
      return x;
    }
    function valorEn(h, c, f) {
      const k = c + "," + f;
      if (h.cache.has(k)) return h.cache.get(k);
      const kp = h.nombre + "|" + k;
      if (pila.has(kp)) throw E("#CICLO!");
      pila.add(kp);
      let v;
      try { v = calcular(h.obtener(c, f), h); } catch (e) { v = e instanceof ErrorF ? e : E("#VALOR!"); }
      pila.delete(kp);
      h.cache.set(k, v);
      return v;
    }
    function rango(r, h) {
      const hh = hojaDe(r.hoja, h);
      if (!hh) throw E("#REF!");
      let c1, c2, f1, f2;
      if (r.tipo === "col") { c1 = Math.min(r.a.c, r.b.c); c2 = Math.max(r.a.c, r.b.c); f1 = 0; f2 = Math.max(1, hh.filas) - 1; }
      else if (r.tipo === "fila") { f1 = Math.min(r.a.f, r.b.f); f2 = Math.max(r.a.f, r.b.f); c1 = 0; c2 = Math.max(1, hh.cols) - 1; }
      else { c1 = Math.min(r.a.c, r.b.c); c2 = Math.max(r.a.c, r.b.c); f1 = Math.min(r.a.f, r.b.f); f2 = Math.max(r.a.f, r.b.f); }
      if ((f2 - f1 + 1) * (c2 - c1 + 1) > 200000) throw E("#NUM!");
      const out = [];
      out.cols = c2 - c1 + 1;   // forma del rango (BUSCARV, INDICE… la usan)
      for (let f = f1; f <= f2; f++) for (let c = c1; c <= c2; c++) {
        const v = valorEn(hh, c, f);
        if (v instanceof ErrorF) throw v;
        out.push(v);
      }
      return out;
    }

    function calcular(crudo, h) {
      if (crudo == null || crudo === "") return "";
      const s = String(crudo);
      if (s[0] !== "=") return calcularLiteral(s.trim()) === s.trim() ? s : calcularLiteral(s.trim());
      const tk = tokens(s.slice(1));
      let i = 0;
      const ver = () => tk[i];
      const es = (v) => tk[i] && tk[i].k === "op" && tk[i].v === v;
      const toma = (v) => { const x = tk[i]; if (!x || (v && (x.k !== "op" || x.v !== v))) throw E("#VALOR!"); i++; return x; };

      function expr() {
        let a = suma();
        while (ver() && ver().k === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(ver().v)) {
          const o = toma().v, b = suma();
          const x = esNum(a) && esNum(b) ? [+a, +b] : [texto(a).toLowerCase(), texto(b).toLowerCase()];
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
        while (es("%")) { toma(); v = num(v) / 100; }
        return v;
      }
      function primario() {
        const x = ver();
        if (!x) throw E("#VALOR!");
        if (x.k === "num") { i++; return x.v; }
        if (x.k === "str") { i++; return x.v; }
        if (x.k === "err") { i++; throw E(x.v.replace("#NAME?", "#NOMBRE?").replace("#VALUE!", "#VALOR!")); }
        if (x.k === "op" && x.v === "(") { toma(); const v = expr(); toma(")"); return v; }
        if (x.k === "ref") {
          i++;
          const r = x.v;
          if (r.tipo === "celda") {
            const hh = hojaDe(r.hoja, h);
            if (!hh) throw E("#REF!");
            const v = valorEn(hh, r.a.c, r.a.f);
            if (v instanceof ErrorF) throw v;
            return v;
          }
          return rango(r, h);
        }
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
              while (es(",") || es(";")) { toma(); args.push(es(")") || es(",") || es(";") ? undefined : argumento()); }
            }
            toma(")");
            const r = fn(args);
            if (r instanceof ErrorF) throw r;
            return r;
          }
          throw E("#NOMBRE?");
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
      const v = expr();
      if (i < tk.length) throw E("#VALOR!");
      if (Array.isArray(v)) { if (v.length === 1) return v[0]; throw E("#VALOR!"); }
      return v;
    }

    return { valor: (c, f) => valorEn(actual, c, f), limpiar: () => { actual.cache.clear(); otras.clear(); } };
  }

  // ------------------------------------------------------------ mostrar valores
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
  /** Separa un código de formato en secciones (positivo; negativo; cero) sin romper lo entre comillas. */
  function secciones(cod) {
    const r = []; let a = "", q = false;
    for (let i = 0; i < cod.length; i++) {
      const c = cod[i];
      if (c === '"') q = !q;
      if (c === "\\" && !q) { a += c + (cod[i + 1] || ""); i++; continue; }
      if (c === ";" && !q) { r.push(a); a = ""; continue; }
      a += c;
    }
    r.push(a);
    return r;
  }
  /** El código sin textos literales (para saber si es de fecha). */
  const sinLiterales = (s) => s.replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[[^\]]*\]/g, "");
  function esFormatoFecha(cod) {
    if (!cod || /^general$/i.test(cod) || cod === "@") return false;
    const s = sinLiterales(secciones(cod)[0]).toLowerCase();
    return /[dyh]|a{2,4}|s{1,2}|m{1,4}/.test(s) && !/[0#?]/.test(s);
  }
  function formatoFecha(serie, cod) {
    const d = fechaDe(serie), fr = serie - Math.floor(serie + 1e-9), seg = Math.round(fr * 86400);
    const hh = Math.floor(seg / 3600) % 24, mi = Math.floor(seg / 60) % 60, ss = seg % 60;
    const ampm = /am\/pm|a\/p/i.test(cod);
    const p2 = (n) => String(n).padStart(2, "0");
    const toks = [];
    const s = secciones(cod)[0];
    for (let i = 0; i < s.length;) {
      if (s[i] === '"') { const j = s.indexOf('"', i + 1); toks.push({ lit: s.slice(i + 1, j < 0 ? s.length : j) }); i = j < 0 ? s.length : j + 1; continue; }
      if (s[i] === "\\") { toks.push({ lit: s[i + 1] || "" }); i += 2; continue; }
      const m = /^(yyyy|yy|aaaa|aa|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm|a\/p)/i.exec(s.slice(i));
      if (m) { toks.push({ t: m[0].toLowerCase() }); i += m[0].length; continue; }
      toks.push({ lit: s[i] }); i++;
    }
    return toks.map((x, k) => {
      if (x.lit != null) return x.lit;
      const prev = toks.slice(0, k).reverse().find((y) => y.t), sig = toks.slice(k + 1).find((y) => y.t);
      const minutos = (x.t === "m" || x.t === "mm") && ((prev && /^h/.test(prev.t)) || (sig && /^s/.test(sig.t)));
      switch (x.t) {
        case "yyyy": case "aaaa": return String(d.getUTCFullYear());
        case "yy": case "aa": return p2(d.getUTCFullYear() % 100);
        case "mmmm": return MESES[d.getUTCMonth()];
        case "mmm": return MESES_C[d.getUTCMonth()];
        case "mm": return minutos ? p2(mi) : p2(d.getUTCMonth() + 1);
        case "m": return minutos ? String(mi) : String(d.getUTCMonth() + 1);
        case "dddd": return DIAS_S[d.getUTCDay()];
        case "ddd": return DIAS_C[d.getUTCDay()];
        case "dd": return p2(d.getUTCDate());
        case "d": return String(d.getUTCDate());
        case "hh": return p2(ampm ? (hh % 12 || 12) : hh);
        case "h": return String(ampm ? (hh % 12 || 12) : hh);
        case "ss": return p2(ss);
        case "s": return String(ss);
        case "am/pm": return hh < 12 ? "a. m." : "p. m.";
        case "a/p": return hh < 12 ? "a" : "p";
      }
      return "";
    }).join("");
  }
  function formatoNumero(n, cod) {
    const secs = secciones(cod);
    let s = secs[0], neg = n < 0;
    if (n < 0 && secs[1] != null && secs[1] !== "") { s = secs[1]; neg = false; n = -n; }
    else if (n === 0 && secs[2] != null && secs[2] !== "") s = secs[2];
    else if (n < 0) n = -n;
    // Literales y marcadores.
    const partes = [];
    for (let i = 0; i < s.length;) {
      const c = s[i];
      if (c === '"') { const j = s.indexOf('"', i + 1); partes.push({ lit: s.slice(i + 1, j < 0 ? s.length : j) }); i = j < 0 ? s.length : j + 1; continue; }
      if (c === "\\") { partes.push({ lit: s[i + 1] || "" }); i += 2; continue; }
      if (c === "[") { const j = s.indexOf("]", i); i = j < 0 ? s.length : j + 1; continue; }   // [Rojo], [$-es-MX]…
      if (c === "_") { partes.push({ lit: " " }); i += 2; continue; }
      if (c === "*") { i += 2; continue; }
      partes.push(/[0#?.,%]/.test(c) ? { m: c } : { lit: c });
      i++;
    }
    const ini = partes.findIndex((p) => p.m && /[0#?]/.test(p.m));
    let fin = -1;
    for (let k = partes.length - 1; k >= 0; k--) if (partes[k].m && /[0#?]/.test(partes[k].m)) { fin = k; break; }
    const pct = partes.filter((p) => p.m === "%").length;
    if (ini < 0) {
      // Solo texto (por ejemplo "-"): se muestra tal cual.
      return (neg ? "-" : "") + partes.map((p) => (p.lit != null ? p.lit : p.m === "%" ? "%" : "")).join("");
    }
    const cuerpo = partes.slice(ini, fin + 1).map((p) => p.m || "").join("");
    const [ent, dec = ""] = cuerpo.split(".");
    const miles = ent.includes(",");
    const minEnt = (ent.match(/0/g) || []).length, decObl = (dec.match(/0/g) || []).length, decTot = (dec.match(/[0#?]/g) || []).length;
    let x = n * Math.pow(100, pct);
    let txt = x.toFixed(decTot);
    if (decTot > decObl) txt = txt.replace(new RegExp("0{1," + (decTot - decObl) + "}$"), "").replace(/\.$/, "");
    let [e, d] = txt.split(".");
    if (e.length < minEnt) e = e.padStart(minEnt, "0");
    if (minEnt === 0 && e === "0" && (d || decTot)) e = "";
    if (miles) e = e.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const numero = e + (d ? "." + d : "");
    const pre = partes.slice(0, ini).map((p) => (p.lit != null ? p.lit : p.m === "%" ? "%" : "")).join("");
    const pos = partes.slice(fin + 1).map((p) => (p.lit != null ? p.lit : p.m === "%" ? "%" : "")).join("");
    const cero = /^[0.,]*$/.test(numero.replace(/,/g, ""));
    return (neg && !cero ? "-" : "") + pre + numero + pos;
  }
  /** Un valor con su formato de número (código como los de Excel). Sin formato: formatear(). */
  function aplicarFormato(v, cod) {
    if (!cod || /^general$/i.test(cod)) return formatear(v);
    if (v instanceof ErrorF) return v.codigo;
    if (cod === "@") return texto(v);
    if (typeof v === "boolean" || v === "" || v == null) return formatear(v);
    if (!esNum(v)) return String(v);
    if (!isFinite(+v)) return "#DIV/0!";
    try { return esFormatoFecha(cod) ? formatoFecha(+v, cod) : formatoNumero(+v, cod); } catch (e) { return formatear(v); }
  }
  /** Formatos para elegir (el código es el de Excel, así se exporta igual). */
  const FORMATOS = [
    { id: "General", t: "General", ej: "1234.5" },
    { id: "0", t: "Número entero", ej: "1235" },
    { id: "#,##0.00", t: "Número con 2 decimales", ej: "1,234.50" },
    { id: "$#,##0.00", t: "Moneda", ej: "$1,234.50" },
    { id: "0%", t: "Porcentaje", ej: "50%" },
    { id: "0.00%", t: "Porcentaje con decimales", ej: "50.25%" },
    { id: "dd/mm/yyyy", t: "Fecha corta", ej: "07/11/2026" },
    { id: "d \"de\" mmmm \"de\" yyyy", t: "Fecha larga", ej: "7 de noviembre de 2026" },
    { id: "dddd d \"de\" mmmm", t: "Día y fecha", ej: "sábado 7 de noviembre" },
    { id: "hh:mm", t: "Hora", ej: "14:30" },
    { id: "@", t: "Texto", ej: "001234" },
  ];
  /** Un decimal más (+1) o menos (-1) en el formato de la celda. */
  function cambiarDecimales(cod, delta, valor) {
    if (!cod || /^general$/i.test(cod)) {
      const t = esNum(valor) ? String(Math.round(+valor * 1e6) / 1e6) : "";
      const actuales = t.includes(".") ? t.split(".")[1].length : 0;
      const n = Math.max(0, actuales + delta);
      return n ? "0." + "0".repeat(n) : "0";
    }
    if (esFormatoFecha(cod) || cod === "@") return cod;
    return secciones(cod).map((s) => {
      const m = /([0#?])(\.([0#?]*))?(?![0#?.,])/.exec(s);
      if (!m) return s;
      const idx = m.index;
      const decs = (m[3] || "").length + delta;
      const nuevo = m[1] + (decs > 0 ? "." + "0".repeat(decs) : "");
      return s.slice(0, idx) + nuevo + s.slice(idx + m[0].length);
    }).join(";");
  }
  /** Lo que alguien escribe en una celda: el valor a guardar y el formato que conviene ponerle. */
  function leerEntrada(t) {
    const s = String(t == null ? "" : t).trim();
    if (!s || s[0] === "=") return { crudo: t, formato: null };
    let m = /^-?\d+(?:([.,])(\d+))?%$/.exec(s);
    if (m) return { crudo: s, formato: m[2] ? "0." + "0".repeat(Math.min(4, m[2].length)) + "%" : "0%" };
    m = /^(-?)\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/.exec(s);
    if (m) return { crudo: m[1] + m[2].replace(/,/g, "") + (m[3] ? "." + m[3] : ""), formato: "$#,##0.00" };
    m = /^(-?)(\d{1,3}(?:,\d{3})+)(?:\.(\d+))?$/.exec(s);
    if (m) return { crudo: m[1] + m[2].replace(/,/g, "") + (m[3] ? "." + m[3] : ""), formato: m[3] ? "#,##0." + "0".repeat(Math.min(4, m[3].length)) : "#,##0" };
    return { crudo: t, formato: null };
  }

  // ------------------------------------------------------------ series (cuadrito de relleno)
  const LISTAS = [DIAS_S.slice(1).concat(DIAS_S[0]), DIAS_C.slice(1).concat(DIAS_C[0]), MESES, MESES_C,
    ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]];
  const quitarAcentos = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  function enLista(t) {
    const b = quitarAcentos(t.toLowerCase());
    for (const l of LISTAS) { const i = l.findIndex((x) => quitarAcentos(x) === b); if (i >= 0) return { l, i }; }
    return null;
  }
  const comoLaOriginal = (modelo, t) => (modelo === modelo.toUpperCase() && modelo !== modelo.toLowerCase() ? t.toUpperCase() : modelo[0] === modelo[0].toUpperCase() ? t[0].toUpperCase() + t.slice(1) : t);
  /**
   * Continúa una serie como el cuadrito de relleno de Excel. crudos: los valores elegidos (texto
   * crudo, en orden); n: cuántos más. Las fórmulas las mueve quien llama (desplazar).
   * Un número solo se copia; dos o más números siguen el paso; fechas, días, meses y "Tema 1"
   * avanzan solos.
   */
  function serie(crudos, n) {
    const vals = crudos.map((c) => (c == null ? "" : String(c)));
    const out = [];
    const nums = vals.map((v) => { const x = v.trim() === "" ? null : calcularLiteral(v.trim()); return esNum(x) ? x : null; });
    if (vals.length && nums.every((x) => x != null)) {
      const fecha = nums.every((x) => x instanceof FechaF);
      if (nums.length === 1 && !fecha) { for (let k = 0; k < n; k++) out.push(vals[0]); return out; }
      const paso = nums.length === 1 ? 1 : (+nums[nums.length - 1] - +nums[0]) / (nums.length - 1);
      let ultimo = +nums[nums.length - 1];
      const pct = vals.every((v) => /%$/.test(v.trim()));
      for (let k = 0; k < n; k++) {
        ultimo += paso;
        if (fecha) { const d = fechaDe(ultimo); out.push(`${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`); }
        else if (pct) out.push(String(Math.round(ultimo * 100 * 1e6) / 1e6) + "%");
        else out.push(String(Math.round(ultimo * 1e9) / 1e9));
      }
      return out;
    }
    const listas = vals.map((v) => enLista(v.trim()));
    if (vals.length && listas.every((x) => x && x.l === listas[0].l)) {
      const l = listas[0].l, paso = listas.length > 1 ? (listas[listas.length - 1].i - listas[0].i) / (listas.length - 1) : 1;
      let i = listas[listas.length - 1].i;
      for (let k = 0; k < n; k++) { i = (((i + paso) % l.length) + l.length) % l.length; out.push(comoLaOriginal(vals[0].trim(), l[Math.round(i)])); }
      return out;
    }
    const conNumero = vals.map((v) => /^(.*?)(\d+)(\D*)$/.exec(v));
    if (vals.length && conNumero.every((m) => m && m[1] === conNumero[0][1] && m[3] === conNumero[0][3]) && conNumero[0][1].trim() !== "") {
      const ns = conNumero.map((m) => +m[2]);
      const paso = ns.length > 1 ? (ns[ns.length - 1] - ns[0]) / (ns.length - 1) : 1;
      let u = ns[ns.length - 1];
      for (let k = 0; k < n; k++) { u += paso; out.push(conNumero[0][1] + String(Math.round(u)).padStart(conNumero[0][2].length, "0") + conNumero[0][3]); }
      return out;
    }
    for (let k = 0; k < n; k++) out.push(vals[k % vals.length]);
    return out;
  }

  /** Una fórmula de Excel en inglés (=AVERAGE(A1,B1)) en español (=PROMEDIO(A1;B1)). */
  function aEspanol(formula) {
    const s = String(formula || "");
    if (s[0] !== "=") return s;
    let r = "=";
    for (let i = 1; i < s.length; i++) {
      const c = s[i];
      if (c === '"') { let j = i + 1; while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') { j += 2; continue; } break; } j++; } r += s.slice(i, j + 1); i = j; continue; }
      if (c === ",") { r += ";"; continue; }
      const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(s.slice(i));
      if (m && !/[A-Za-z0-9_.$!:]/.test(s[i - 1] || "")) {
        const n = m[0].toUpperCase(), sig = s.slice(i + m[0].length).trimStart()[0];
        if (sig === "(" && ALIAS[n] && /^[A-Z0-9.]+$/.test(n)) r += ALIAS[n];
        else if (sig !== "(" && sig !== "!" && (n === "TRUE" || n === "FALSE")) r += n === "TRUE" ? "VERDADERO" : "FALSO";
        else r += m[0];
        i += m[0].length - 1;
        continue;
      }
      r += c;
    }
    return r;
  }

  // ------------------------------------------------------------ hojas de un documento
  /** Las hojas (tablas de un documento de hoja de cálculo) en el orden de sus páginas. */
  function hojasDe(doc) {
    const pags = doc.paginas();
    return doc.vivos().filter((b) => b.tipo === "tabla" && !b.enTexto).sort((a, b) => pags.indexOf(a.pagina) - pags.indexOf(b.pagina) || (a.orden || 0) - (b.orden || 0));
  }
  /** Nombre de una hoja: el que le pusieron o "HojaN" según su lugar. */
  function nombreDeHoja(doc, b) {
    if (b && b.nombre) return String(b.nombre);
    const i = b ? hojasDe(doc).findIndex((x) => x.id === b.id) : -1;
    return "Hoja" + (i >= 0 ? i + 1 : 1);
  }
  const lectorDe = (b) => (c, f) => { const v = b["c:" + ref(c, f)]; return v == null ? "" : v; };
  /** Evaluador de una tabla que entiende las referencias a las demás hojas del documento. */
  function evaluadorDeTabla(doc, b) {
    const todas = doc ? hojasDe(doc) : [];
    return evaluador(lectorDe(b), {
      nombre: doc ? nombreDeHoja(doc, b) : "", filas: b.filas || b.filasTexto || 30, cols: b.cols || b.colsTexto || 10,
      hojas: (n) => {
        const x = todas.find((h) => normal(nombreDeHoja(doc, h)) === normal(n));
        return x ? { obtener: lectorDe(x), filas: x.filas || 30, cols: x.cols || 10, nombre: nombreDeHoja(doc, x) } : null;
      },
    });
  }

  NOM.formulas = {
    hojasDe, nombreDeHoja, evaluadorDeTabla,
    evaluador, formatear, aplicarFormato, ErrorF, FechaF, esNum, colLetra, colNum, ref, parseRef, NOMBRES, FIRMAS, ALIAS, INGLES,
    leerFecha, criterio, desplazar, ajustarEstructura, renombrarHoja, refsDe, textoRef, leerRef, transformarRefs, FORMATOS, esFormatoFecha,
    cambiarDecimales, leerEntrada, serie, calcularLiteral, prefijoHoja, textoFecha, aEspanol,
  };
})();
