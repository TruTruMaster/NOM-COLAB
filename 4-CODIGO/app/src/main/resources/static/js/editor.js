/* NOM-COLAB · Editor (diagrama A6). El tipo del documento (texto, hoja, presentación o
   diagrama) se elige al crearlo y no cambia: cambiarlo rompería su formato.
   ni de documento, solo de herramientas y de forma de pintar los mismos bloques (CU-20). */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, api, aviso, hoja, confirmar, haceCuanto, avatar, MODOS } = { ...NOM, api: NOM.api };
  NOM.modos = NOM.modos || {};

  async function abrir(raiz, docId, opcAbrir) {
    const enLocal = !!(opcAbrir && opcAbrir.local);   // documento sin cuenta, guardado en este equipo
    raiz.innerHTML = `<div class="editor"><div class="ed-barra"><div class="esqueleto" style="height:28px;width:220px"></div></div><div></div><div class="ed-lienzo"><div class="papel"><div class="esqueleto" style="height:38px;width:60%;margin-bottom:24px"></div><div class="esqueleto" style="height:16px;margin-bottom:12px"></div><div class="esqueleto" style="height:16px;width:85%"></div></div></div></div>`;

    let datos, sinRed = false;
    try {
      if (enLocal) {
        const est = NOM.local.estado(docId), m = NOM.local.meta(docId);
        if (!est || !m) throw Object.assign(new Error("Este documento ya no existe en este equipo (¿se borraron los datos del navegador?)"), { estado: 404 });
        datos = { estado: est, documento: m, permiso: "EDICION", espacio: { id: null, nombre: "Solo en este equipo" } };
      } else datos = await api.get(`/api/documentos/${docId}`);
    } catch (e) {
      const c = NOM.DocCRDT.cache(docId);
      if (e.red && c) { datos = { estado: c.estado, documento: c.meta && c.meta.documento, permiso: c.meta && c.meta.permiso, espacio: c.meta && c.meta.espacio }; sinRed = true; }
      else {
        raiz.innerHTML = `<div class="contenido"><div class="vacio"><div class="burbuja">${ico(e.red ? "wifi-off" : "triangle-alert")}</div><h3>${esc(e.red ? "Sin conexión y sin copia local de este documento" : e.message)}</h3><a class="btn" href="#/">Volver al inicio</a></div></div>`;
        return () => {};
      }
    }

    // Mientras cargaba, la persona ya se fue a otra pantalla: no se pinta ni se conecta nada.
    if (opcAbrir && opcAbrir.vigente && !opcAbrir.vigente()) return () => {};
    const meta = { documento: datos.documento, permiso: datos.permiso, espacio: datos.espacio };
    const ed = {
      id: docId, meta, espacio: datos.espacio || {}, permiso: datos.permiso || "LECTURA",
      pagina: null, presencia: [], modo: null, previa: null,
    };
    ed.soloLectura = ed.permiso === "LECTURA";
    ed.local = enLocal;
    if (!enLocal) NOM.anotarReciente({ id: docId, nombre: (datos.documento || {}).nombre, modo: (datos.documento || {}).modo }, ed.espacio);

    const doc = new NOM.DocCRDT(docId, datos.estado, {
      meta, soloLectura: ed.soloLectura, local: enLocal,
      alCambiar: (cambios, origen) => alCambiar(cambios, origen),
      alEstado: (e, n) => pintarEstado(e, n),
      alRechazo: (e) => permisoPerdido(e),
      alEliminado: () => documentoEliminado(),
    });
    ed.doc = doc;
    NOM.editorActual = ed;   // útil para depurar desde la consola
    if (doc.pendientes.length) doc.reanudar();

    // ------------------------------------------------------------ estructura
    raiz.innerHTML = "";
    // El tipo sale de los metadatos del servidor (fijados al crear el documento).
    const tipoDato = (datos.documento || {}).modo || doc.valor("_doc", "modo");
    const tipo = MODOS[tipoDato] ? tipoDato : "TEXTO";
    const vista = html(`
      <div class="editor sin-selector modo-${tipo} ${ed.soloLectura ? "lectura" : ""} ${NOM.leer("nom.pref", {}).enfoqueAtenuar === false ? "" : "atenuar"}">
        <header class="ed-barra">
          <a class="icono-btn" href="${ed.local ? "#/" : "#/espacio/" + esc(ed.espacio.id || "")}" aria-label="Volver" data-micro="Volver|Regresa a la lista de documentos del espacio.">${ico("chevron-left")}</a>
          <div class="ed-titulos">
            <input class="ed-nombre" data-nombre aria-label="Nombre del documento" ${ed.soloLectura ? "readonly" : ""} maxlength="120">
            <span class="ed-espacio recorta"><span class="ed-tipo">${ico(MODOS[tipo].icono, "ico-s")} ${esc(MODOS[tipo].nombre)}</span> · ${esc(ed.espacio.nombre || "")}</span>
          </div>
          <span class="crece"></span>
          <span class="avatares solo-escritorio" data-presencia></span>
          <span class="estado-sync" data-sync role="status" aria-live="polite"></span>
          <button class="icono-btn solo-escritorio" data-a="paleta" data-micro="Buscar o ir a|Documentos, espacios y acciones.|Ctrl K">${ico("search")}</button>
          <button class="icono-btn solo-escritorio" ${enLocal ? "hidden" : ""} data-a="historial" data-micro="Historial de versiones|Consulta y restaura versiones anteriores.">${ico("history")}</button>
          <button class="icono-btn" data-a="mas" aria-label="Más opciones" data-micro="Más opciones|Exportar, guardar versión, enfoque y más.">${ico("more-horizontal")}</button>
        </header>
        <div class="ed-herramientas" role="toolbar" aria-label="Herramientas" data-herr></div>
        <div class="ed-lienzo" data-lienzo tabindex="-1"></div>
        <aside class="ed-lateral" data-lateral></aside>
        <button class="icono-btn salir-enfoque" data-a="salir-enfoque" aria-label="Salir del modo enfoque" data-micro="Salir del modo enfoque||Esc">${ico("minimize-2")}</button>
      </div>`);
    raiz.append(vista);
    ed.vista = vista;
    ed.lienzo = $("[data-lienzo]", vista);
    ed.herr = $("[data-herr]", vista);

    const nombre = $("[data-nombre]", vista);
    const pintarNombre = () => { if (document.activeElement !== nombre) nombre.value = doc.valor("_doc", "nombre") || (datos.documento || {}).nombre || "Sin título"; };
    pintarNombre();
    nombre.addEventListener("change", () => {
      const v = nombre.value.trim();
      if (!v) return pintarNombre();
      doc.cambiar("_doc", { nombre: v }, { deshacible: false });
    });
    nombre.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nombre.blur(); } });

    // ------------------------------------------------------------ modos
    ed.paginas = () => doc.paginas();
    function montar(modo, conservarPagina) {
      if (ed.modoApi && ed.modoApi.desmontar) ed.modoApi.desmontar();
      NOM.ocultarMicro();
      ed.modo = modo;
      vista.className = vista.className.replace(/modo-\w+/, "modo-" + modo);
      if (!conservarPagina || !doc.paginas().includes(ed.pagina)) ed.pagina = doc.paginas()[0];
      ed.lienzo.innerHTML = "";
      ed.lienzo.scrollTop = 0;
      ed.modoApi = NOM.modos[modo];
      ed.modoApi.montar(ed);
      pintarHerramientas();
      ed.pintarPresencia();
    }

    // ------------------------------------------------------------ herramientas
    // Cada modo aporta las suyas; deshacer/rehacer e historial son comunes.
    function pintarHerramientas() {
      const items = [
        { id: "deshacer", icono: "undo-2", micro: "Deshacer|Revierte tu último cambio; los demás lo verán.|Ctrl+Z", fn: () => ed.deshacer(), off: () => !doc.puedeDeshacer() },
        { id: "rehacer", icono: "redo-2", micro: "Rehacer|Vuelve a aplicar lo que deshiciste.|Ctrl+Y", fn: () => ed.rehacer(), off: () => !doc.puedeRehacer() },
        "|",
        ...(ed.modoApi.herramientas ? ed.modoApi.herramientas(ed) : []),
        "->",
        { id: "enfoque", icono: "scan-eye", micro: "Modo enfoque|Oculta todo menos tu contenido.|Ctrl+.", fn: () => enfoque(true), clase: "solo-escritorio" },
        { id: "exportar", icono: "download", micro: "Exportar|Guarda una copia en otro formato.", fn: exportar },
      ];
      ed.herr.innerHTML = "";
      ed.botones = {};
      items.forEach((it) => {
        if (it === "|") return ed.herr.append(html(`<span class="sep"></span>`));
        if (it === "->") return ed.herr.append(html(`<span class="relleno"></span>`));
        if (it.html) { const n = html(it.html); ed.herr.append(n); it.montar && it.montar(n); return; }
        const b = html(`<button class="icono-btn ${it.clase || ""}" data-micro="${esc(it.micro)}" aria-label="${esc(it.micro.split("|")[0])}">${ico(it.icono)}</button>`);
        b.addEventListener("pointerdown", (e) => { if (it.mantenerFoco !== false) e.preventDefault(); });
        b.onclick = (e) => it.fn(e, b);
        b._it = it;
        ed.herr.append(b);
        ed.botones[it.id || it.icono] = b;
      });
      ed.refrescarHerramientas();
    }
    ed.pintarHerramientas = pintarHerramientas;
    ed.refrescarHerramientas = () => {
      Object.values(ed.botones || {}).forEach((b) => {
        const it = b._it;
        if (it.off) b.disabled = !!it.off();
        if (it.activo) b.setAttribute("aria-pressed", !!it.activo());
      });
    };

    ed.deshacer = () => { if (doc.deshacer()) ed.refrescarHerramientas(); };
    ed.rehacer = () => { if (doc.rehacer()) ed.refrescarHerramientas(); };

    // ------------------------------------------------------------ cambios (locales y remotos)
    function alCambiar(cambios, origen) {
      if (ed.previa) return;
      const docCambio = cambios.find((c) => c.bloque === "_doc");
      if (docCambio) {
        if ("nombre" in docCambio.campos) pintarNombre();
      }
      if (ed.modoApi && ed.modoApi.cambios) ed.modoApi.cambios(cambios, origen);
      ed.refrescarHerramientas();
      if (cambios.some((c) => !c.local)) ed.pintarPresencia();
    }

    // ------------------------------------------------------------ estado de sincronización
    let ultimoGuardado = null;
    function pintarEstado(e, n) {
      const s = $("[data-sync]", vista);
      if (!s) return;
      const t = {
        ok: [ico("circle-check", "ico-s"), ultimoGuardado ? "Guardado · v" + ultimoGuardado : "Guardado", "ok"],
        enviando: [`<span class="cargando" style="width:12px;height:12px;border-width:2px"></span>`, "Sincronizando", ""],
        "sin-red": [ico("cloud-off", "ico-s"), `Sin conexión${n ? " · " + n + " en este equipo" : ""}`, "sin-red"],
        pendiente: [ico("clock", "ico-s"), `${n} por enviar`, "pendiente"],
        lectura: [ico("eye", "ico-s"), "Solo lectura", "lectura"],
        local: [ico("hard-drive", "ico-s"), "Solo en este equipo", "pendiente"],
      }[ed.soloLectura ? "lectura" : ed.local ? "local" : e] || ["", "", ""];
      s.className = "estado-sync " + t[2];
      s.innerHTML = `${t[0]}<span class="solo-escritorio">${t[1]}</span>`;
      s.setAttribute("data-micro", ed.local ? "Solo en este equipo|Se guarda automáticamente en este navegador, pero si borras sus datos o la caché se pierde. Descárgalo (Exportar → .nom) o crea una cuenta y súbelo a un espacio."
        : ed.soloLectura ? "Solo lectura|Tu permiso permite ver, no editar."
        : e === "sin-red" ? "Sin conexión|Sigue trabajando: tus cambios se guardan en este equipo y se envían solos al volver la red."
        : "Sincronización|Cada cambio se ve al instante aquí y en menos de 1.5 s en los demás equipos.");
    }
    pintarEstado(sinRed ? "sin-red" : doc.estadoSync, doc.pendientes.length);
    if (sinRed) aviso("Sin conexión: abriste la copia guardada en este equipo. Tus cambios se enviarán al volver la red.", { tipo: "aviso", ms: 6000 });

    // ------------------------------------------------------------ presencia (quién edita qué)
    ed.seleccion = null;
    const enviarPresencia = NOM.throttle(() => {
      if (!canal) return;
      api.post(`/api/documentos/${docId}/presencia`, { cliente: doc.nodo, bloque: ed.seleccion, modo: ed.modo, cursor: ed.cursor || null }).catch(() => {});
    }, 150);
    ed.seleccionar = (id) => { if (ed.seleccion === id) return; ed.seleccion = id; enviarPresencia(); };
    /** Cursor de texto ({ a, f }: ids de letras) para que los demás lo vean donde estás escribiendo. */
    ed.moverCursor = (c) => {
      if (ed.cursor && c && ed.cursor.a === c.a && ed.cursor.f === c.f) return;
      ed.cursor = c;
      enviarPresencia();
    };
    ed.pintarPresencia = () => {
      const otros = ed.presencia.filter((p) => p.cliente !== doc.nodo && p.bloque);
      const porBloque = {};
      otros.forEach((p) => (porBloque[p.bloque] = p));
      $$("[data-id]", ed.lienzo).forEach((el) => {
        const p = porBloque[el.dataset.id];
        if (p) { el.setAttribute("data-otro", p.nombre); el.style.setProperty("--pc", p.color); }
        else if (el.hasAttribute("data-otro")) { el.removeAttribute("data-otro"); el.style.removeProperty("--pc"); }
      });
      const unicos = {};
      ed.presencia.forEach((p) => (unicos[p.id] = p));
      if (ed.modoApi && ed.modoApi.pintarCursores) ed.modoApi.pintarCursores();
      $("[data-presencia]", vista).innerHTML = Object.values(unicos).map((p) => `<span data-micro="${esc(p.nombre)}|${p.cliente === doc.nodo ? "Tú" : p.modo ? "Viendo en modo " + esc(MODOS[p.modo] ? MODOS[p.modo].nombre : p.modo) : "Conectado"}">${avatar(p)}</span>`).join("");
    };

    // ------------------------------------------------------------ canal en tiempo real
    let caido = sinRed, canal = null;
    if (!enLocal) canal = api.eventos(`/api/documentos/${docId}/eventos`, doc.nodo, {
      hola: async () => {
        if (caido) {
          caido = false;
          try { const r = await api.get(`/api/documentos/${docId}`); doc.fusionarEstado(r.estado); if (r.permiso !== ed.permiso) cambiarPermiso(r.permiso); } catch (e) { /* siguiente intento */ }
          aviso("Conexión recuperada. Sincronizando tus cambios…", { tipo: "ok" });
        }
        doc.reanudar();
        enviarPresencia();
      },
      caido: () => { caido = true; doc.marcarSinRed(); pintarEstado("sin-red", doc.pendientes.length); },
      ops: (x) => ed.recibir(x.ops),
      presencia: (x) => { ed.presencia = x.usuarios; ed.pintarPresencia(); },
      version: (x) => aviso(`${x.autor} restauró la versión ${x.desde}. Ya estás viendo el documento restaurado.`, { tipo: "info", ms: 6000 }),
      guardado: (x) => { ultimoGuardado = x.numero; pintarEstado(doc.estadoSync, doc.pendientes.length); },
      permiso: (x) => { if (x.usuarioId === (api.usuario() || {}).id) cambiarPermiso(x.permiso); },
      eliminado: () => documentoEliminado(),
      expulsado: (x) => { aviso(x.motivo, { tipo: "aviso" }); location.hash = "#/"; },
      rechazo: (e) => {
        if (e.estado === 409) {
          hoja({ titulo: "Espacio lleno", cuerpo: `<div class="col"><div class="alerta aviso">${ico("users")}<span>${esc(e.message)}</span></div><p class="suave" style="font-weight:650">Puedes seguir viendo y editando tu copia; los cambios se enviarán cuando haya lugar.</p></div>` });
        }
      },
    });

    // Mientras el teclado del celular compone una palabra no se toca la hoja: lo que llega espera
    // un instante y se aplica al terminar la palabra (si no, el teclado pierde lo que escribía).
    const retenidas = [];
    ed.recibir = (ops) => { if (ed.retener) retenidas.push(...ops); else doc.fusionarRemotas(ops); };
    ed.soltar = () => { if (retenidas.length) doc.fusionarRemotas(retenidas.splice(0)); };

    function cambiarPermiso(p) {
      if (p === "NINGUNO") { location.hash = "#/"; return; }
      ed.permiso = p;
      const antes = ed.soloLectura;
      ed.soloLectura = p === "LECTURA";
      doc.opc.soloLectura = ed.soloLectura;
      vista.classList.toggle("lectura", ed.soloLectura);
      nombre.readOnly = ed.soloLectura;
      if (antes !== ed.soloLectura) { aviso(ed.soloLectura ? "Ahora tienes permiso de solo lectura" : "Ahora puedes editar", { tipo: "info" }); montar(ed.modo, true); }
      if (!ed.soloLectura) doc.reanudar();
      pintarEstado(doc.estadoSync, doc.pendientes.length);
    }

    // CU-26 7a: el permiso bajó a lectura mientras había cambios en cola.
    function permisoPerdido() {
      const n = doc.pendientes.length;
      cambiarPermiso("LECTURA");
      const pie = html(`<div style="display:contents"><button class="btn" data-no>Descartarlos</button><button class="btn primario" data-si>${ico("download")} Exportar mi copia</button></div>`);
      const h = hoja({ titulo: "Tus cambios no se aplicaron", cuerpo: `<p style="font-weight:650">Tu permiso cambió a <b>solo lectura</b> mientras trabajabas sin conexión. ${n} cambio(s) quedaron solo en este equipo.</p>`, pie });
      $("[data-si]", pie).onclick = () => { NOM.formatos.exportar(doc, "nom", (nombre.value || "copia") + " (mi copia)"); doc.descartarCola(); h.cerrar(); };
      $("[data-no]", pie).onclick = () => { doc.descartarCola(); h.cerrar(); };
    }

    // CU-26 6a: el documento se eliminó mientras estaba sin conexión.
    let avisadoEliminado = false;
    function documentoEliminado() {
      if (avisadoEliminado) return;
      avisadoEliminado = true;
      doc.detenido = true;
      const pie = html(`<div style="display:contents"><button class="btn" data-no>Salir</button><button class="btn primario" data-si>Guardar como nuevo</button></div>`);
      const h = hoja({ titulo: "Este documento se eliminó", cuerpo: `<p style="font-weight:650">Otra persona eliminó el documento. Puedes guardar lo que tienes en pantalla como un documento nuevo del espacio.</p>`, pie });
      $("[data-no]", pie).onclick = () => { h.cerrar(); location.hash = "#/espacio/" + ed.espacio.id; };
      $("[data-si]", pie).onclick = async () => {
        const ops = [];
        let i = 0;
        for (const id in doc.estado.bloques) {
          if (id !== "_doc" && !doc.vivo(id)) continue;
          const { id: _x, ...campos } = doc.bloque(id);
          ops.push({ id: "copia:" + i++, bloque: id, campos, t: 2, n: "copia" });
        }
        try {
          const d = await api.post(`/api/espacios/${ed.espacio.id}/documentos`, { nombre: (nombre.value || "Documento") + " (recuperado)", modo: ed.modo, ops });
          doc.descartarCola();
          h.cerrar(true);
          location.hash = "#/doc/" + d.id;
        } catch (e) { aviso(e.message, { tipo: "error" }); }
      };
    }

    // ------------------------------------------------------------ versiones (CU-23)
    async function historial() {
      if (enLocal) return aviso("El historial de versiones necesita una cuenta. Sin cuenta, descarga copias con Exportar → .nom", { tipo: "info", ms: 5000 });
      const lateral = $("[data-lateral]", vista);
      if (lateral.firstChild) { cerrarHistorial(); return; }
      lateral.innerHTML = `<div class="cajon"><div class="cajon-cab"><h3>Historial</h3>
          ${ed.soloLectura ? "" : `<button class="btn chico" data-guardar data-micro="Guardar versión|Crea un punto al que puedas volver.|Ctrl+S">${ico("save", "ico-s")} Guardar versión</button>`}
          <button class="icono-btn" data-cerrar aria-label="Cerrar historial">${ico("x")}</button></div>
        <div style="padding:0 16px 8px"><div class="segmentado lleno" role="group" aria-label="Ver">
          <button type="button" data-tab="versiones" aria-pressed="true">Versiones</button>
          <button type="button" data-tab="actividad" aria-pressed="false" data-micro="Actividad|Cada cambio guardado: quién, desde qué dispositivo y cuándo.">Actividad</button></div></div>
        <div class="cajon-cuerpo" data-versiones><div class="esqueleto" style="height:56px"></div><div class="esqueleto" style="height:56px"></div></div></div>`;
      $$("[data-tab]", lateral).forEach((b) => (b.onclick = () => {
        $$("[data-tab]", lateral).forEach((x) => x.setAttribute("aria-pressed", x === b));
        if (b.dataset.tab === "actividad") cargarActividad(); else cargar();
      }));
      $("[data-cerrar]", lateral).onclick = cerrarHistorial;
      const g = $("[data-guardar]", lateral);
      if (g) g.onclick = async () => { await guardarVersion(); cargar(); };
      async function cargar() {
        const cont = $("[data-versiones]", lateral);
        try {
          const vs = await api.get(`/api/documentos/${docId}/versiones`);
          cont.innerHTML = vs.map((v) => `<button class="version" data-v="${v.numero}"><span class="numero">v${v.numero}</span><span class="crece"><b>${esc(v.etiqueta || "Versión")}</b><small>${esc(v.autorNombre || "")} · ${esc(haceCuanto(v.fecha))} · ${tipo === "TEXTO" && v.letras != null ? v.letras.toLocaleString("es-MX") + " letras" : v.bloques + " bloques"}</small></span></button>`).join("")
            || `<p class="suave">Aún no hay versiones.</p>`;
          $$("[data-v]", cont).forEach((b) => (b.onclick = () => { $$("[data-v]", cont).forEach((x) => x.setAttribute("aria-pressed", x === b)); previsualizar(+b.dataset.v); }));
        } catch (e) { cont.innerHTML = `<div class="alerta error">${ico("triangle-alert")}<span>${esc(e.message)}</span></div>`; }
      }
      async function cargarActividad() {
        const cont = $("[data-versiones]", lateral);
        try {
          const l = await api.get(`/api/documentos/${docId}/actividad`);
          cont.innerHTML = l.map((a) => `<div class="version" style="cursor:default">${avatar({ nombre: a.usuario, color: a.color })}
            <span class="crece"><b>${esc(a.usuario)}</b><small>${esc(a.dispositivo)} · ${esc(haceCuanto(a.t))}<br>${esc(describirCambio(a))}</small></span></div>`).join("")
            || `<p class="suave">Aún no hay cambios registrados.</p>`;
        } catch (e) { cont.innerHTML = `<div class="alerta error">${ico("triangle-alert")}<span>${esc(e.message)}</span></div>`; }
      }
      cargar();
    }
    /** "Editó 2 celdas", "Editó el texto de 1 bloque"... a partir de una línea de la bitácora. */
    function describirCambio(a) {
      const campos = a.campos || [], n = (a.bloques || []).filter((b) => b !== "_doc").length;
      if (a.escritas || a.borradas) {
        const p = [];
        if (a.escritas) p.push(`escribió ${a.escritas} ${a.escritas === 1 ? "letra" : "letras"}`);
        if (a.borradas) p.push(`borró ${a.borradas}`);
        if (campos.includes("formato")) p.push("cambió formato");
        return p.join(", ").replace(/^./, (c) => c.toUpperCase());
      }
      if (campos.includes("formato") && !campos.some((c) => c !== "texto" && c !== "formato")) return "Cambió el formato del texto";
      if (campos.some((c) => c.startsWith("c:"))) return `Editó ${campos.filter((c) => c.startsWith("c:")).length} celda(s)`;
      if (campos.includes("nombre") && n === 0) return "Cambió el nombre";
      if (campos.includes("eliminado")) return `Borró ${n} bloque(s)`;
      if (campos.includes("texto")) return `Editó el texto de ${n} bloque(s)`;
      if (campos.some((c) => ["x", "y", "w", "h"].includes(c))) return `Movió o cambió el tamaño de ${n} elemento(s)`;
      return `${a.operaciones} cambio(s) en ${Math.max(n, 1)} bloque(s)`;
    }
    function cerrarHistorial() { salirPrevia(); $("[data-lateral]", vista).innerHTML = ""; }

    async function previsualizar(n) {
      let foto;
      try { foto = await api.get(`/api/documentos/${docId}/versiones/${n}`); } catch (e) { return aviso(e.message, { tipo: "error" }); }
      const estado = { bloques: {}, reloj: 0, seq: {} };
      for (const b in foto) {
        if (b.startsWith("_seq:")) { estado.seq[b.slice(5)] = foto[b]; continue; }
        estado.bloques[b] = {}; for (const c in foto[b]) estado.bloques[b][c] = { v: foto[b][c], t: 0, n: "" };
      }
      const docPrevio = new NOM.DocCRDT("previa-" + docId + "-" + n, estado, { soloLectura: true });
      docPrevio._guardarCache = () => {};
      if (ed.modoApi.desmontar) ed.modoApi.desmontar();
      ed.previa = { n, doc: docPrevio, original: doc };
      ed.doc = docPrevio;
      const lectura = ed.soloLectura;
      ed.soloLectura = true;
      ed.lienzo.innerHTML = "";
      const banda = html(`<div class="vista-previa-aviso">${ico("history")}<span class="crece">Vista previa de la versión ${n}</span>
        ${lectura ? "" : `<button class="btn chico primario" data-restaurar>Restaurar esta versión</button>`}<button class="btn chico" data-salir>Salir</button></div>`);
      ed.modoApi.montar(ed);
      ed.lienzo.prepend(banda);
      ed.soloLectura = lectura;
      $("[data-salir]", banda).onclick = salirPrevia;
      const r = $("[data-restaurar]", banda);
      if (r) r.onclick = async () => {
        if (!(await confirmar("Restaurar versión", `El documento volverá a como estaba en la versión ${n}. Se guardará como una versión nueva; no se pierde ninguna.`, { si: "Restaurar" }))) return;
        try {
          const v = await api.post(`/api/documentos/${docId}/versiones/${n}/restaurar`);
          salirPrevia();
          cerrarHistorial();
          aviso(`Listo: ahora estás en la versión ${v.numero}`, { tipo: "ok" });
        } catch (e) { aviso(e.message, { tipo: "error" }); }
      };
    }
    function salirPrevia() {
      if (!ed.previa) return;
      if (ed.modoApi.desmontar) ed.modoApi.desmontar();
      ed.doc = ed.previa.original;
      ed.previa = null;
      montar(ed.modo, true);
    }

    async function guardarVersion() {
      if (ed.soloLectura) return;
      if (enLocal) {
        aviso(doc.guardarYa() ? "Guardado en este equipo. Para no perderlo si se borra la caché, descárgalo (.nom)." : "No se pudo guardar: el navegador no tiene espacio", { tipo: "ok", accion: { texto: "Descargar", fn: () => NOM.formatos.exportar(doc, "nom", nombre.value || "documento") } });
        return;
      }
      try {
        await doc.enviar();
        const v = await api.post(`/api/documentos/${docId}/versiones`, { etiqueta: "Guardado manual" });
        ultimoGuardado = v.numero;
        pintarEstado(doc.estadoSync, doc.pendientes.length);
        aviso(`Versión ${v.numero} guardada`, { tipo: "ok" });
      } catch (e) {
        aviso(e.red ? "Sin conexión: tus cambios están a salvo en este equipo" : e.message, { tipo: e.red ? "aviso" : "error" });
      }
    }

    // ------------------------------------------------------------ exportar (CU-29)
    function exportar() {
      const cuerpo = html(`<div class="lista">${NOM.formatos.paraTipo(tipo).map((f) => `<button class="lista-item" data-f="${f.id}" style="text-align:left;width:100%">${ico(f.icono)}<span class="crece"><b>${esc(f.nombre)}</b><small>${esc(f.desc)}</small></span>${ico("chevron-right")}</button>`).join("")}</div>`);
      const h = hoja({ titulo: "Exportar", icono: "download", cuerpo });
      $$("[data-f]", cuerpo).forEach((b) => (b.onclick = () => {
        try {
          const av = NOM.formatos.exportar(doc, b.dataset.f, nombre.value || "documento", ed.pagina, tipo);
          h.cerrar(true);
          aviso(av || "Archivo exportado", { tipo: av ? "aviso" : "ok", ms: av ? 5000 : 3000 });
        } catch (e) { aviso(e.message, { tipo: "error" }); }
      }));
    }

    // ------------------------------------------------------------ enfoque
    function enfoque(si) {
      vista.classList.toggle("enfoque", si);
      if (si) {
        aviso("Modo enfoque. Pulsa Esc para salir.", { ms: 2200 });
        if (vista.requestFullscreen && matchMedia("(hover: hover)").matches) vista.requestFullscreen().catch(() => {});
      } else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
    $("[data-a=salir-enfoque]", vista).onclick = () => enfoque(false);

    // ------------------------------------------------------------ menú y atajos
    $("[data-a=historial]", vista).onclick = historial;
    // Descarga directa en el formato de Office que corresponde al tipo del documento.
    const office = NOM.formatos.paraTipo(tipo)[0];
    const descargarOffice = { texto: "Descargar " + office.nombre, icono: "download", fn: () => {
      try { const av = NOM.formatos.exportar(doc, office.id, nombre.value || "documento", ed.pagina, tipo); aviso(av || "Archivo descargado", { tipo: av ? "aviso" : "ok" }); }
      catch (err) { aviso(err.message, { tipo: "error" }); }
    } };
    $("[data-a=mas]", vista).onclick = (e) => NOM.menu(e.currentTarget, enLocal ? [
      { titulo: "Guardado solo en este equipo" },
      descargarOffice,
      { texto: "Descargar copia (.nom)", icono: "download", fn: () => NOM.formatos.exportar(doc, "nom", nombre.value || "documento") },
      { texto: "Exportar en otro formato…", icono: "file-down", fn: exportar },
      ...(api.token() ? [{ texto: "Subir a un espacio", icono: "upload", fn: () => { doc.guardarYa(); NOM.vistaEspacios.subirLocal(docId); } }]
        : [{ texto: "Crear cuenta para guardarlo en la red", icono: "user-plus", fn: () => { doc.guardarYa(); NOM.app.irACuentas("registro"); } }]),
      { texto: "Modo enfoque", icono: "scan-eye", atajo: "Ctrl+.", fn: () => enfoque(true) },
      { texto: "Preferencias", icono: "settings", fn: () => NOM.vistaEspacios.preferencias() },
      "-",
      { texto: "Eliminar documento", icono: "trash-2", peligro: true, fn: async () => {
        if (!(await confirmar("Eliminar documento", "Se borrará de este equipo y no se puede recuperar.", { si: "Eliminar", peligro: true }))) return;
        doc.opc.soloMemoria = true; doc._guardarCache = () => {}; NOM.local.eliminar(docId); location.hash = "#/";
      } },
    ] : [
      ...(ed.soloLectura ? [] : [{ texto: "Guardar versión", icono: "save", atajo: "Ctrl+S", fn: guardarVersion }]),
      { texto: "Historial y actividad", icono: "history", fn: historial },
      descargarOffice,
      { texto: "Exportar en otro formato…", icono: "file-down", fn: exportar },
      { texto: "Modo enfoque", icono: "scan-eye", atajo: "Ctrl+.", fn: () => enfoque(true) },
      "-",
      { texto: "Compartir espacio", icono: "share-2", fn: () => NOM.vistaEspacios.accesos(ed.espacio) },
      { texto: "Preferencias", icono: "settings", fn: () => NOM.vistaEspacios.preferencias() },
      ...(ed.soloLectura ? [] : ["-", { texto: "Eliminar documento", icono: "trash-2", peligro: true, fn: async () => {
        if (!(await confirmar("Eliminar documento", "Se eliminará para todos los miembros del espacio, con su historial.", { si: "Eliminar", peligro: true }))) return;
        try { await api.delete(`/api/documentos/${docId}`); avisadoEliminado = true; location.hash = "#/espacio/" + ed.espacio.id; } catch (err) { aviso(err.message, { tipo: "error" }); }
      } }]),
    ]);

    // Acciones de este documento para la paleta de comandos (Ctrl+K).
    ed.acciones = () => [
      ...(ed.soloLectura || enLocal ? [] : [{ texto: "Guardar versión", icono: "save", atajo: "Ctrl S", fn: guardarVersion, claves: "guardar" }]),
      ...(enLocal ? [] : [{ texto: "Historial y actividad", icono: "history", fn: historial, claves: "versiones restaurar" }]),
      Object.assign({ claves: "exportar office" }, descargarOffice),
      { texto: "Exportar en otro formato…", icono: "file-down", fn: exportar, claves: "pdf html descargar" },
      { texto: "Modo enfoque", icono: "scan-eye", atajo: "Ctrl .", fn: () => enfoque(true), claves: "concentrar pantalla completa" },
      ...(enLocal ? [] : [{ texto: "Compartir espacio", icono: "share-2", fn: () => NOM.vistaEspacios.accesos(ed.espacio), claves: "invitar accesos" }]),
    ];

    function teclas(e) {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape" && vista.classList.contains("enfoque")) { enfoque(false); return; }
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); ed.deshacer(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); ed.rehacer(); }
      else if (k === "s") { e.preventDefault(); guardarVersion(); }
      else if (k === ".") { e.preventDefault(); enfoque(!vista.classList.contains("enfoque")); }
    }
    document.addEventListener("keydown", teclas);
    const alSalirPantalla = () => { if (!document.fullscreenElement) vista.classList.remove("enfoque"); };
    document.addEventListener("fullscreenchange", alSalirPantalla);

    // ------------------------------------------------------------ utilidades para los modos
    ed.pedirImagen = async () => {
      const f = await NOM.formatos.elegirArchivo("image/*");
      if (!f) return null;
      try { return await NOM.formatos.imagenADataUrl(f); } catch (e) { aviso(e.message, { tipo: "error" }); return null; }
    };
    ed.nuevaPagina = (despuesDe) => {
      const pags = doc.paginas().slice();
      const id = "p" + Date.now().toString(36);
      pags.splice(despuesDe == null ? pags.length : pags.indexOf(despuesDe) + 1, 0, id);
      doc.cambiar("_doc", { paginas: pags });
      return id;
    };

    // ------------------------------------------------------------ arranque
    montar(tipo);
    if (NOM.alAbrirEditor) NOM.alAbrirEditor(ed, tipo);

    return () => {
      document.removeEventListener("keydown", teclas);
      document.removeEventListener("fullscreenchange", alSalirPantalla);
      if (ed.modoApi && ed.modoApi.desmontar) ed.modoApi.desmontar();
      canal && canal.cerrar();
      // A6: al terminar de editar se guarda una versión (si hubo cambios enviados en esta sesión).
      if (doc.ultimoEnvio && !ed.soloLectura) {
        doc.enviar().finally(() => api.post(`/api/documentos/${docId}/versiones`, { etiqueta: "Al cerrar" }).catch(() => {}));
      }
      doc.cerrar();
    };
  }

  NOM.editor = { abrir };
})();
