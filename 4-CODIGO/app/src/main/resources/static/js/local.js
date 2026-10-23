/* NOM-COLAB · Documentos de este equipo (local primero).
   Viven solo en este navegador o en la app, no en un servidor, salvo que la persona los guarde
   en un espacio. Con cuenta van cifrados en su bóveda (nom.u.<cuenta>.local.*): solo esa cuenta,
   con su contraseña, puede abrirlos. Sin cuenta se guardan en claro en este navegador.
   Se pierden si se borran los datos del navegador, salvo que se descarguen o se suban. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const conCuenta = () => !!(NOM.api && NOM.api.token() && NOM.boveda && NOM.boveda.activa());
  const INDICE = () => (conCuenta() ? NOM.api.clave("local.docs") : "nom.local.docs");
  const clave = (id) => (conCuenta() ? NOM.api.clave("local.doc." + id) : "nom.local.doc." + id);
  let avisadoLleno = false;

  const local = {
    /** ¿Se está usando sin cuenta? (solo cuenta si no hay sesión) */
    activo: () => !NOM.api.token() && NOM.leer("nom.invitado", false) === true,
    entrar() { NOM.guardar("nom.invitado", true); },
    salir() { NOM.quitar("nom.invitado"); },
    usuario: () => ({ id: "local", nombre: "Sin cuenta", color: "#6B6875" }),

    lista: () => (NOM.leer(INDICE(), []) || []).sort((a, b) => b.modificado - a.modificado),
    meta: (id) => local.lista().find((d) => d.id === id) || null,
    estado: (id) => NOM.leer(clave(id), null),

    guardarEstado(id, estado) {
      let ok = false;
      ok = NOM.guardar(clave(id), estado);
      if (!ok && !avisadoLleno) {
        avisadoLleno = true;
        NOM.aviso(NOM.aqui().sinEspacio + " para este documento. Descárgalo (Exportar → .nom) para no perder cambios.", { tipo: "error", ms: 8000 });
      }
      // Nombre y modo se copian al índice para listar sin abrir el documento.
      const d = estado.bloques._doc || {};
      local.actualizarMeta(id, {
        nombre: (d.nombre && d.nombre.v) || undefined,
        modo: (d.modo && d.modo.v) || undefined,
        modificado: Date.now(),
      });
      return ok;
    },

    actualizarMeta(id, cambios) {
      const l = NOM.leer(INDICE(), []) || [];
      const d = l.find((x) => x.id === id);
      if (!d) return;
      Object.keys(cambios).forEach((k) => { if (cambios[k] !== undefined) d[k] = cambios[k]; });
      NOM.guardar(INDICE(), l);
    },

    /** Crea un documento local con las operaciones iniciales (plantilla o importación). */
    crear(nombre, modo, ops) {
      const id = "L" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      nombre = (nombre || "").trim() || "Documento sin título";
      const doc = new NOM.DocCRDT(id, { bloques: {}, reloj: 0 }, { local: true });
      doc._fusionar({ id: "local:c1", bloque: "_doc", campos: { nombre, modo, paginas: ["p1"] }, t: 1, n: "local" });
      (ops || []).forEach((op) => doc._fusionar(op));
      const l = NOM.leer(INDICE(), []) || [];
      l.push({ id, nombre, modo, creado: Date.now(), modificado: Date.now() });
      NOM.guardar(INDICE(), l);
      if (!local.guardarEstado(id, doc.estado)) throw new Error(NOM.aqui().sinEspacio + " para crear el documento");
      return { id, nombre, modo };
    },

    eliminar(id) {
      NOM.guardar(INDICE(), (NOM.leer(INDICE(), []) || []).filter((d) => d.id !== id));
      NOM.quitar(clave(id));
    },

    /** Documento local como DocCRDT de solo memoria (para exportar o subir). */
    abrirEnMemoria(id) {
      const e = local.estado(id);
      return e ? new NOM.DocCRDT(id, e, { local: true, soloMemoria: true }) : null;
    },

    /** Operaciones que recrean el documento en un espacio del servidor. */
    opsDe(id) {
      const e = local.estado(id);
      if (!e) return [];
      const doc = new NOM.DocCRDT(id, e, { local: true, soloMemoria: true });
      const ops = [];
      let i = 0;
      for (const b in e.bloques) {
        if (b !== "_doc" && !doc.vivo(b)) continue;
        const { id: _x, ...campos } = doc.bloque(b);
        if (b === "_doc") { delete campos.nombre; delete campos.modo; if (!Object.keys(campos).length) continue; }
        ops.push({ id: "subir:" + i++, bloque: b, campos, t: 2, n: "subir" });
      }
      return ops;
    },

    /** Sube el documento a un espacio; si sale bien, se borra la copia local. */
    async subir(id, espacioId) {
      const m = local.meta(id);
      const d = await NOM.api.post(`/api/espacios/${espacioId}/documentos`, { nombre: m.nombre, modo: m.modo, ops: local.opsDe(id) });
      local.eliminar(id);
      return d;
    },
  };

  /** Documentos creados sin cuenta en este navegador (en claro), para pasarlos a la cuenta. */
  local.sinCuenta = () => { try { return JSON.parse(localStorage.getItem("nom.local.docs")) || []; } catch (e) { return []; } };
  /** Los pasa a la bóveda cifrada de la cuenta y borra la versión en claro. */
  local.moverACuenta = () => {
    if (!conCuenta()) return 0;
    const docs = local.sinCuenta(), l = NOM.leer(INDICE(), []) || [];
    let n = 0;
    docs.forEach((d) => {
      let est = null;
      try { est = JSON.parse(localStorage.getItem("nom.local.doc." + d.id)); } catch (e) { est = null; }
      if (!est) return;
      NOM.guardar(clave(d.id), est);
      if (!l.some((x) => x.id === d.id)) l.push(d);
      localStorage.removeItem("nom.local.doc." + d.id);
      n++;
    });
    NOM.guardar(INDICE(), l);
    localStorage.removeItem("nom.local.docs");
    return n;
  };
  local.cifrado = conCuenta;

  NOM.local = local;
})();
