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
      Object.keys(cambios).forEach((k) => { if (cambios[k] === null) delete d[k]; else if (cambios[k] !== undefined) d[k] = cambios[k]; });
      NOM.guardar(INDICE(), l);
    },

    /** Crea un documento local con las operaciones iniciales (plantilla o importación).
        opc.destino = { id, nombre }: fase 13, parte C — se creó DENTRO de un espacio sin Internet;
        se queda aquí marcado con ese espacio y se sube solo en cuanto vuelva la red. */
    crear(nombre, modo, ops, opc) {
      opc = opc || {};
      const id = "L" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      nombre = (nombre || "").trim() || "Documento sin título";
      const doc = new NOM.DocCRDT(id, { bloques: {}, reloj: 0 }, { local: true });
      doc._fusionar({ id: "local:c1", bloque: "_doc", campos: { nombre, modo, paginas: ["p1"] }, t: 1, n: "local" });
      (ops || []).forEach((op) => doc._fusionar(op));
      const l = NOM.leer(INDICE(), []) || [];
      const meta = { id, nombre, modo, creado: Date.now(), modificado: Date.now() };
      if (opc.destino && opc.destino.id) { meta.destino = opc.destino.id; meta.destinoNombre = opc.destino.nombre || ""; }
      l.push(meta);
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
      // Con el texto letra por letra incluido (antes un texto subido llegaba vacío).
      return NOM.DocCRDT.opsDeEstado(e, "subir");
    },

    /** Sube el documento a un espacio; si sale bien, se borra la copia local. */
    async subir(id, espacioId) {
      const m = local.meta(id);
      const d = await NOM.api.post(`/api/espacios/${espacioId}/documentos`, { nombre: m.nombre, modo: m.modo, ops: local.opsDe(id) }, { ms: 60000 });
      local.eliminar(id);
      // Si alguien lo tenía abierto (otra pestaña o el editor), sabe a dónde se fue.
      if (conCuenta()) { const sub = NOM.leer(NOM.api.clave("subidos"), {}) || {}; sub[id] = { doc: d.id, t: Date.now() }; NOM.guardar(NOM.api.clave("subidos"), sub); }
      return d;
    },

    /** Parte C: los creados sin Internet dentro de un espacio que aún esperan subirse (de uno o de todos). */
    pendientesDe: (espacioId) => local.lista().filter((d) => d.destino && (!espacioId || d.destino === espacioId)),

    /** El documento de un espacio en que se convirtió uno de este equipo al subirse (o null). */
    subidoComo: (id) => (conCuenta() ? ((NOM.leer(NOM.api.clave("subidos"), {}) || {})[id] || {}).doc || null : null),

    /**
     * Al volver la red: sube a su espacio cada documento creado sin Internet (el que está abierto en
     * el editor espera a que se cierre, para no perder lo que se está escribiendo). Devuelve los subidos.
     */
    async subirPendientes() {
      if (!conCuenta()) return [];
      const ed = NOM.editorActual, abierto = ed && ed.local && ed.vista && ed.vista.isConnected ? ed.id : null;
      const hechos = [];
      for (const m of local.pendientesDe()) {
        if (m.id === abierto) continue;
        try {
          const d = await local.subir(m.id, m.destino);
          hechos.push({ local: m.id, doc: d.id, nombre: m.nombre, espacio: m.destinoNombre });
        } catch (e) {
          if (e.red) break;   // otra vez sin red: al volver
          // El espacio ya no existe o ya no se puede editar en él: se queda aquí, como documento suelto.
          local.actualizarMeta(m.id, { destinoError: e.message || "No se pudo subir" });
          if (e.estado === 403 || e.estado === 404) { local.actualizarMeta(m.id, { destino: null }); NOM.aviso(`«${m.nombre}» no se pudo subir a ${m.destinoNombre || "su espacio"} (${e.message}). Se quedó en este equipo.`, { tipo: "aviso", ms: 9000 }); }
        }
      }
      return hechos;
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
