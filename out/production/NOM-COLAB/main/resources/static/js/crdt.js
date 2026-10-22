/* NOM-COLAB · motor CRDT del cliente (gemelo de core/crdt/MotorCRDT.java).
   Documento = mapa LWW de bloques; cada campo gana por (reloj de Lamport, id de nodo).
   Se aplica en local primero y se difunde después: el usuario nunca espera a la red.
   Sin conexión, las operaciones se encolan en el dispositivo y se reenvían al volver (CU-26). */
(function () {
  "use strict";
  const NOM = window.NOM;

  const idDispositivo = (() => {
    let d = NOM.leer("nom.dispositivo", null);
    if (!d) { d = "d" + Math.random().toString(36).slice(2, 8); NOM.guardar("nom.dispositivo", d); }
    return d;
  })();

  const gana = (t, n, reg) => !reg || t > reg.t || (t === reg.t && n > (reg.n || ""));

  class DocCRDT {
    constructor(docId, estado, opc) {
      this.id = docId;
      this.estado = estado && estado.bloques ? estado : { bloques: {}, reloj: 0 };
      // Un nodo por pestaña: dos pestañas del mismo equipo nunca repiten id de operación.
      this.nodo = idDispositivo + "-" + Math.random().toString(36).slice(2, 6);
      this.contador = 0;
      this.opc = opc || {};
      // Sin cuenta (opc.local) no hay servidor: nada se encola, todo se guarda en el dispositivo.
      this.pendientes = this.opc.local ? [] : NOM.leer(NOM.api.clave("cola." + docId), []);
      this.deshacerPila = [];
      this.rehacerPila = [];
      this.enviando = false;
      this.espera = 0;
      this.detenido = false;
      this.estadoSync = this.opc.local ? "local" : this.pendientes.length ? "pendiente" : "ok";
      // Lo que quedó en cola de una sesión anterior también cuenta para el reloj.
      this.pendientes.forEach((op) => this._fusionar(op));
      this._guardarCache = this.opc.soloMemoria ? () => {}
        : this.opc.local ? NOM.throttle(() => NOM.local.guardarEstado(this.id, this.estado), 500)
        : NOM.throttle(() => NOM.guardar(NOM.api.clave("doc." + this.id), { estado: this.estado, meta: this.opc.meta || null, guardado: Date.now() }), 2000);
    }

    // ---------------------------------------------------------- lectura
    valor(b, c) { const x = this.estado.bloques[b]; return x && x[c] ? x[c].v : undefined; }
    bloque(b) {
      const x = this.estado.bloques[b];
      if (!x) return null;
      const o = { id: b };
      for (const c in x) o[c] = x[c].v;
      return o;
    }
    vivo(b) { const x = this.estado.bloques[b]; return !!x && !(x.eliminado && x.eliminado.v === true); }
    vivos() {
      const r = [];
      for (const id in this.estado.bloques) if (id !== "_doc" && this.vivo(id)) r.push(this.bloque(id));
      return r;
    }
    doc() { return this.bloque("_doc") || {}; }
    paginas() {
      const p = this.valor("_doc", "paginas");
      return Array.isArray(p) && p.length ? p : ["p1"];
    }
    deLaPagina(p) {
      const pags = this.paginas();
      return this.vivos().filter((b) => (b.pagina || pags[0]) === p || (!pags.includes(b.pagina) && p === pags[0]))
        .sort((a, b) => (a.orden || 0) - (b.orden || 0));
    }

    // ---------------------------------------------------------- escritura local
    /** Cambia campos de un bloque. opc.grupo agrupa varias teclas en un solo "deshacer". */
    cambiar(b, campos, opc) {
      opc = opc || {};
      if (this.opc.soloLectura) return null;
      const previos = {};
      for (const c in campos) { const v = this.valor(b, c); previos[c] = v === undefined ? null : v; }
      const op = { id: this.nodo + ":" + ++this.contador, bloque: b, campos, t: ++this.estado.reloj, n: this.nodo };
      const cambios = this._fusionar(op);
      if (!this.opc.local) {
        this.pendientes.push(op);
        NOM.guardar(NOM.api.clave("cola." + this.id), this.pendientes);
      }
      if (opc.deshacible !== false) {
        const cima = this.deshacerPila[this.deshacerPila.length - 1];
        if (opc.grupo && cima && cima.grupo === opc.grupo && Date.now() - cima.cuando < 1200) {
          for (const c in previos) if (!(c in cima.items[0].previos)) cima.items[0].previos[c] = previos[c];
          cima.cuando = Date.now();
        } else {
          this.deshacerPila.push({ grupo: opc.grupo || null, cuando: Date.now(), items: [{ bloque: b, previos }] });
          if (this.deshacerPila.length > 200) this.deshacerPila.shift();
        }
        this.rehacerPila = [];
      }
      this._avisar([{ bloque: b, campos: cambios, local: true }], opc.origen);
      if (!this.opc.local) this._programar();
      return op;
    }

    /** Varios cambios como un solo paso de deshacer (ej. borrar varios bloques). */
    lote(fn) {
      const antes = this.deshacerPila.length;
      fn();
      const nuevos = this.deshacerPila.splice(antes);
      if (nuevos.length) this.deshacerPila.push({ grupo: null, cuando: Date.now(), items: nuevos.flatMap((x) => x.items) });
    }

    deshacer() { return this._mover(this.deshacerPila, this.rehacerPila); }
    rehacer() { return this._mover(this.rehacerPila, this.deshacerPila); }
    _mover(de, a) {
      const paso = de.pop();
      if (!paso) return false;
      const inverso = { grupo: null, cuando: 0, items: [] };
      paso.items.slice().reverse().forEach((it) => {
        const actuales = {};
        for (const c in it.previos) { const v = this.valor(it.bloque, c); actuales[c] = v === undefined ? null : v; }
        inverso.items.push({ bloque: it.bloque, previos: actuales });
        this.cambiar(it.bloque, it.previos, { deshacible: false });
      });
      a.push(inverso);
      return true;
    }
    puedeDeshacer() { return this.deshacerPila.length > 0; }
    puedeRehacer() { return this.rehacerPila.length > 0; }

    // ---------------------------------------------------------- fusión
    _fusionar(op) {
      const cambios = {};
      if (op.t > this.estado.reloj) this.estado.reloj = op.t;
      const b = this.estado.bloques[op.bloque] || (this.estado.bloques[op.bloque] = {});
      for (const c in op.campos) {
        if (gana(op.t, op.n, b[c])) { b[c] = { v: op.campos[c], t: op.t, n: op.n }; cambios[c] = op.campos[c]; }
      }
      this._guardarCache();
      return cambios;
    }
    /** Operaciones que llegaron por el canal (CU-21 pasos 2-4). */
    fusionarRemotas(ops) {
      const lista = [];
      ops.forEach((op) => {
        if (op.n === this.nodo) return;
        const c = this._fusionar(op);
        if (Object.keys(c).length) lista.push({ bloque: op.bloque, campos: c, local: false, autor: op.n });
      });
      if (lista.length) this._avisar(lista);
      return lista;
    }
    /** Estado completo del servidor (al reconectar): se fusiona registro por registro. */
    fusionarEstado(remoto) {
      const lista = [];
      for (const b in remoto.bloques) {
        const campos = remoto.bloques[b];
        const loc = this.estado.bloques[b] || (this.estado.bloques[b] = {});
        const cambios = {};
        for (const c in campos) {
          const r = campos[c];
          if (gana(r.t, r.n, loc[c])) { loc[c] = { v: r.v, t: r.t, n: r.n }; cambios[c] = r.v; }
        }
        if (Object.keys(cambios).length) lista.push({ bloque: b, campos: cambios, local: false });
      }
      if (remoto.reloj > this.estado.reloj) this.estado.reloj = remoto.reloj;
      this._guardarCache();
      if (lista.length) this._avisar(lista);
      return lista;
    }
    _avisar(cambios, origen) { this.opc.alCambiar && this.opc.alCambiar(cambios, origen); }

    // ---------------------------------------------------------- envío y cola
    _programar() {
      if (this.detenido || this.opc.local) return;
      clearTimeout(this._t);
      this._t = setTimeout(() => this.enviar(), this.espera || 120);
      this._fijarEstado(this.pendientes.length ? (this.sinRed ? "sin-red" : "enviando") : "ok");
    }
    async enviar() {
      if (this.enviando || this.detenido || !this.pendientes.length) return;
      this.enviando = true;
      // Si la red tarda más de 2.5 s en responder se avisa ya, sin esperar al error.
      const lento = setTimeout(() => { if (this.enviando) this._fijarEstado("sin-red"); }, 2500);
      const lote = this.pendientes.slice(0, 300);
      try {
        await NOM.api.post(`/api/documentos/${this.id}/ops`, { cliente: this.nodo, ops: lote, dispositivo: NOM.api.dispositivo }, { ms: 12000 });
        const enviados = new Set(lote.map((o) => o.id));
        this.pendientes = this.pendientes.filter((o) => !enviados.has(o.id));
        NOM.guardar(NOM.api.clave("cola." + this.id), this.pendientes);
        this.espera = 0;
        this.sinRed = false;
        this.ultimoEnvio = Date.now();
        this._fijarEstado(this.pendientes.length ? "enviando" : "ok");
      } catch (e) {
        if (e.red) {
          this.sinRed = true;
          this.espera = Math.min((this.espera || 500) * 2, 4000);
          this._fijarEstado("sin-red");
        } else if (e.estado === 403) {
          this.detenido = true;
          this._fijarEstado("lectura");
          this.opc.alRechazo && this.opc.alRechazo(e);
        } else if (e.estado === 404) {
          this.detenido = true;
          this.opc.alEliminado && this.opc.alEliminado(e);
        } else if (e.estado === 401) {
          this.detenido = true;
        } else {
          // Lote inválido: se descarta para no bloquear la cola para siempre.
          console.warn("Lote rechazado", e);
          const malos = new Set(lote.map((o) => o.id));
          this.pendientes = this.pendientes.filter((o) => !malos.has(o.id));
          NOM.guardar(NOM.api.clave("cola." + this.id), this.pendientes);
          NOM.aviso(e.message, { tipo: "error" });
        }
      } finally {
        clearTimeout(lento);
        this.enviando = false;
        if (this.pendientes.length && !this.detenido) this._programar();
      }
    }
    reanudar() { this.detenido = false; this.espera = 0; this._programar(); }
    marcarSinRed() { this.sinRed = true; if (this.pendientes.length) this._fijarEstado("sin-red"); }
    _fijarEstado(e) {
      this.estadoSync = e;
      this.opc.alEstado && this.opc.alEstado(e, this.pendientes.length);
    }
    descartarCola() { this.pendientes = []; NOM.quitar(NOM.api.clave("cola." + this.id)); }
    cerrar() {
      clearTimeout(this._t);
      if (this.opc.local && !this.opc.soloMemoria) NOM.local.guardarEstado(this.id, this.estado);
      else if (this._guardarCache.ya) this._guardarCache.ya();
    }
    /** Guarda ya (sin esperar al temporizador). */
    guardarYa() { if (this.opc.local && !this.opc.soloMemoria) return NOM.local.guardarEstado(this.id, this.estado); return true; }
  }

  /** Copia local del último estado conocido: permite abrir el documento sin red (CU-26 paso 2). */
  DocCRDT.cache = (docId) => NOM.leer(NOM.api.clave("doc." + docId), null);

  /** Índice fraccionario: un orden entre a y b sin renumerar a nadie. */
  DocCRDT.entre = (a, b) => {
    if (a == null && b == null) return 1;
    if (a == null) return b - 1;
    if (b == null) return a + 1;
    return (a + b) / 2;
  };
  DocCRDT.nuevoId = () => "b" + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);

  NOM.DocCRDT = DocCRDT;
})();
