/* NOM-COLAB · Texto colaborativo letra por letra (CRDT de secuencia tipo RGA).
   Cada carácter tiene un id único (t@n: reloj de Lamport y nodo) y recuerda a su "vecino
   izquierdo" al nacer. Con eso todos los equipos ordenan igual, sin importar en qué orden
   lleguen las operaciones, y dos personas pueden escribir en la misma palabra a la vez.

   Tres operaciones, todas idempotentes y conmutativas:
     i  insertar un tramo:      { k:"i", t, n, iz, x, e?, a? }   (x = texto; e = objeto incrustado)
     v  mostrar/ocultar:        { k:"v", t, n, v, r }            (borrar es ocultar; deshacer es mostrar)
     f  dar formato:            { k:"f", t, n, r, a }            (cada atributo es un registro LWW)
   r = lista de rangos [nodo, t1, t2] de ids consecutivos. "fin" es la marca de párrafo final,
   que siempre existe y guarda el formato del último párrafo.
   Gemelo del servidor: core/crdt/Secuencia.java guarda lo mismo y restaura versiones. */
(function () {
  "use strict";
  const NOM = (typeof window !== "undefined" ? window : globalThis).NOM;

  const FIN = "fin";
  const OBJ = "\uFFFC";          // un objeto incrustado (imagen, tabla, salto de página…) ocupa 1 posición
  const clave = (t, n) => t + "@" + n;
  const gana = (t, n, reg) => !reg || t > reg[1] || (t === reg[1] && n > reg[2]);
  const caracteres = (x) => Array.from(x || "");
  const mismo = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

  class Secuencia {
    constructor(registro) {
      this.items = [];              // orden del documento, incluye los ocultos
      this.porId = new Map();
      this.fin = { id: FIN, c: "\n", f: {}, v: true };
      this.esperando = [];          // operaciones que llegaron antes que los caracteres que tocan
      this._enEspera = new Set();   // ids de tramos en espera
      this._vistas = new Set();     // v y f ya aplicadas (k:t@n)
      this._vis = null;             // caché de visibles
      this._idx = null;             // id -> índice visible
      this._pista = 0;
      if (registro) this.cargar(registro);
    }

    // ------------------------------------------------------------ carga completa (árbol RGA)
    /** Arma el orden de una vez: hijos de cada carácter de mayor a menor (t, n) y recorrido en profundidad. */
    cargar(reg) {
      const hijos = new Map();
      const todos = [];
      (reg.ins || []).forEach((r) => this._crearItems(r).forEach((it) => {
        if (this.porId.has(it.id)) return;
        this.porId.set(it.id, it);
        todos.push(it);
        const p = it.iz || "";
        (hijos.get(p) || hijos.set(p, []).get(p)).push(it);
      }));
      hijos.forEach((l) => l.sort((a, b) => (b.t - a.t) || (b.n > a.n ? 1 : b.n < a.n ? -1 : 0)));
      const pila = (hijos.get("") || []).slice().reverse();
      const orden = [];
      while (pila.length) {
        const it = pila.pop();
        orden.push(it);
        const h = hijos.get(it.id);
        if (h) for (let i = h.length - 1; i >= 0; i--) pila.push(h[i]);
      }
      this.items = orden;
      if (orden.length !== todos.length) {
        // Huérfanos: su vecino izquierdo aún no llega. Se integran cuando llegue.
        const puestos = new Set(orden);
        todos.filter((it) => !puestos.has(it)).forEach((it) => { this.porId.delete(it.id); });
        (reg.ins || []).forEach((r) => { if (!this.porId.has(clave(r.t, r.n))) { this.esperando.push(r); this._enEspera.add(clave(r.t, r.n)); } });
      }
      (reg.vis || []).forEach((o) => { this._vistas.add("v:" + clave(o.t, o.n)); this._aplicarRangos(o); });
      (reg.fmt || []).forEach((o) => { this._vistas.add("f:" + clave(o.t, o.n)); this._aplicarRangos(o); });
      this._sucio();
    }

    _crearItems(r) {
      const cs = r.e ? [OBJ] : caracteres(r.x);
      return cs.map((c, i) => {
        const t = r.t + i;
        const it = { id: clave(t, r.n), t, n: r.n, c, iz: i === 0 ? (r.iz || null) : clave(t - 1, r.n), v: true, vt: t, vn: r.n, f: null };
        if (r.e) it.e = r.e;
        if (r.a) { it.f = {}; for (const k in r.a) it.f[k] = [r.a[k], t, r.n]; }
        return it;
      });
    }

    // ------------------------------------------------------------ aplicar (incremental)
    /** Integra una operación. Devuelve true si es nueva (hay que guardarla), false si ya se conocía. */
    aplicar(o) {
      let nueva;
      if (o.k === "i") nueva = this._insertar(o);
      else {
        const k = o.k + ":" + clave(o.t, o.n);
        if (this._vistas.has(k)) return false;
        this._vistas.add(k);
        this._aplicarRangos(o);
        nueva = true;
      }
      if (nueva && this.esperando.length) this._reintentar();
      return nueva;
    }

    _insertar(r) {
      if (this._enEspera.has(clave(r.t, r.n))) return false;
      if (this.porId.has(clave(r.t, r.n))) {
        // Tramo ya conocido, o conocido solo al inicio (el servidor junta tramos): se integra lo que falta.
        if (r.e) return false;
        const cs = caracteres(r.x);
        let k = 1;
        while (k < cs.length && this.porId.has(clave(r.t + k, r.n))) k++;
        if (k >= cs.length) return false;
        return this._insertar(Object.assign({}, r, { t: r.t + k, iz: clave(r.t + k - 1, r.n), x: cs.slice(k).join("") }));
      }
      if (r.iz && !this.porId.has(r.iz)) { this.esperando.push(r); this._enEspera.add(clave(r.t, r.n)); return true; }
      const nuevos = this._crearItems(r);
      const a = nuevos[0];
      let i = r.iz ? this.indice(this.porId.get(r.iz)) + 1 : 0;
      // RGA: tras el vecino izquierdo, se saltan los hermanos más nuevos (y sus descendientes,
      // que siempre son aún más nuevos). Así todos llegan al mismo orden.
      const its = this.items;
      while (i < its.length && (its[i].t > a.t || (its[i].t === a.t && its[i].n > a.n))) i++;
      if (nuevos.length < 5000) its.splice(i, 0, ...nuevos);
      else this.items = its.slice(0, i).concat(nuevos, its.slice(i));
      nuevos.forEach((it) => this.porId.set(it.id, it));
      this._pista = i + nuevos.length - 1;
      this._sucio();
      return true;
    }

    /** v y f: se aplican carácter por carácter como registros LWW. */
    _aplicarRangos(o) {
      let cambio = false, falta = false;
      for (const [n, t1, t2] of o.r || []) {
        if (n === FIN) { if (this._aplicarA(this.fin, o)) cambio = true; continue; }
        for (let t = t1; t <= t2; t++) {
          const it = this.porId.get(clave(t, n));
          if (!it) { falta = true; continue; }
          if (this._aplicarA(it, o)) cambio = true;
        }
      }
      if (falta && !this.esperando.includes(o)) this.esperando.push(o);
      if (cambio) this._sucio();
      return cambio;
    }

    _aplicarA(it, o) {
      if (o.k === "v") {
        if (!gana(o.t, o.n, [null, it.vt, it.vn])) return false;
        const antes = it.v;
        it.v = !!o.v; it.vt = o.t; it.vn = o.n;
        return antes !== it.v;
      }
      let cambio = false;
      for (const k in o.a) {
        const reg = it.f && it.f[k];
        if (!gana(o.t, o.n, reg)) continue;
        if (!it.f) it.f = {};
        if (!reg || !mismo(reg[0], o.a[k])) cambio = true;
        it.f[k] = [o.a[k], o.t, o.n];
      }
      if (cambio) { it._a = undefined; it._k = undefined; }
      return cambio;
    }

    _reintentar() {
      let otra = true;
      while (otra && this.esperando.length) {
        otra = false;
        const lista = this.esperando;
        this.esperando = [];
        for (const o of lista) {
          if (o.k === "i") {
            if (!o.iz || this.porId.has(o.iz)) { this._enEspera.delete(clave(o.t, o.n)); this._insertar(o); otra = true; } else this.esperando.push(o);
          } else {
            const antes = this.esperando.length;
            this._aplicarRangos(o);
            if (this.esperando.length === antes) otra = true;
          }
        }
      }
    }

    // ------------------------------------------------------------ lectura
    _sucio() { this._vis = null; this._idx = null; }
    indice(it) {
      const its = this.items, p = this._pista;
      for (let d = 0; d < 6; d++) { if (its[p + d] === it) return p + d; if (its[p - d] === it) return p - d; }
      return its.indexOf(it);
    }
    /** Caracteres visibles en orden (sin la marca final). */
    visibles() {
      if (!this._vis) this._vis = this.items.filter((it) => it.v);
      return this._vis;
    }
    /** Índice visible de un id (o -1). La marca final está en visibles().length. */
    posicion(id) {
      if (id === FIN) return this.visibles().length;
      if (!this._idx) { this._idx = new Map(); this.visibles().forEach((it, i) => this._idx.set(it.id, i)); }
      const i = this._idx.get(id);
      return i == null ? -1 : i;
    }
    item(id) { return id === FIN ? this.fin : this.porId.get(id) || null; }
    texto() { return this.visibles().map((it) => it.c).join(""); }

    /** Atributos efectivos (sin los que valen null). */
    static attrs(it) {
      if (it._a) return it._a;
      const a = {};
      if (it.f) for (const k in it.f) if (it.f[k][0] != null && it.f[k][0] !== false && it.f[k][0] !== "") a[k] = it.f[k][0];
      it._a = a;
      return a;
    }
    /** Clave estable de formato, para comparar tramos rápido. */
    static claveAttrs(it) {
      if (it._k !== undefined) return it._k;
      const a = Secuencia.attrs(it), ks = Object.keys(a).sort();
      it._k = ks.length ? ks.map((k) => k + "=" + (typeof a[k] === "object" ? JSON.stringify(a[k]) : a[k])).join(";") : "";
      return it._k;
    }

    /** Vecino izquierdo para insertar en la posición visible i: el carácter visible anterior. */
    anclaAntes(i) {
      const vis = this.visibles();
      return i <= 0 || !vis.length ? null : vis[Math.min(i, vis.length) - 1].id;
    }

    /** Estado exportable: todo visible, con atributos, para exportar o restaurar. */
    foto() {
      return { items: this.visibles().map((it) => ({ c: it.c, e: it.e, a: Secuencia.attrs(it) })), fin: Secuencia.attrs(this.fin) };
    }
  }

  // ------------------------------------------------------------ utilidades del registro
  /** Agrupa ids en rangos [nodo, t1, t2] consecutivos (en el orden dado). */
  function rangos(items) {
    const r = [];
    let cur = null;
    for (const it of items) {
      if (it.id === FIN) { r.push([FIN, 0, 0]); cur = null; continue; }
      if (cur && cur[0] === it.n && cur[2] + 1 === it.t) cur[2] = it.t;
      else { cur = [it.n, it.t, it.t]; r.push(cur); }
    }
    return r;
  }

  /** Agrega una entrada al registro que se guarda (y que el servidor guarda igual). Junta tramos seguidos. */
  function registrar(reg, o) {
    if (o.k === "i") {
      const l = reg.ins, u = l[l.length - 1];
      if (u && !u.e && !o.e && u.n === o.n && u.t + caracteres(u.x).length === o.t && o.iz === clave(o.t - 1, o.n) && mismo(u.a, o.a)) {
        u.x += o.x;
        return;
      }
      l.push(limpiar(o));
    } else (o.k === "v" ? reg.vis : reg.fmt).push(limpiar(o));
  }
  function limpiar(o) {
    const c = {};
    for (const k in o) if (o[k] !== undefined && k[0] !== "_") c[k] = o[k];
    return c;
  }
  const registroVacio = () => ({ ins: [], vis: [], fmt: [] });

  /** Operaciones que crean un texto desde cero (plantillas, importar, migrar).
      parrafos = [{ tramos: [{ x, a } | { e, a }], a: attrsParrafo }]. Ids deterministas por nodo. */
  function crearOps(bloque, parrafos, nodo, t0, idBase) {
    const ops = [];
    let t = t0 || 1, iz = null, i = 0;
    const id = () => (idBase || nodo) + ":" + i++;
    parrafos.forEach((p, k) => {
      const ultimo = k === parrafos.length - 1;
      (p.tramos || []).forEach((tr) => {
        const x = tr.e ? OBJ : tr.x;
        if (!x) return;
        const s = { k: "i", iz, x };
        if (tr.e) s.e = tr.e;
        if (tr.a && Object.keys(tr.a).length) s.a = tr.a;
        ops.push({ id: id(), bloque, campos: {}, t, n: nodo, s });
        const len = caracteres(x).length;
        iz = clave(t + len - 1, nodo);
        t += len;
      });
      if (ultimo) {
        if (p.a && Object.keys(p.a).length) ops.push({ id: id(), bloque, campos: {}, t: t++, n: nodo, s: { k: "f", r: [[FIN, 0, 0]], a: p.a } });
      } else {
        const s = { k: "i", iz, x: "\n" };
        if (p.a && Object.keys(p.a).length) s.a = p.a;
        ops.push({ id: id(), bloque, campos: {}, t, n: nodo, s });
        iz = clave(t, nodo);
        t += 1;
      }
    });
    return ops;
  }

  NOM.Secuencia = Secuencia;
  Object.assign(Secuencia, { FIN, OBJ, clave, rangos, registrar, registroVacio, crearOps, caracteres });
})();
