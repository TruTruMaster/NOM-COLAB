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
        // Ya se subió a su espacio (desde otra pestaña o al volver la red): se abre el del espacio.
        const yaSubido = NOM.local.subidoComo && NOM.local.subidoComo(docId);
        if (yaSubido && !NOM.local.meta(docId)) { location.hash = "#/doc/" + yaSubido; return () => {}; }
        const est = NOM.local.estado(docId), m = NOM.local.meta(docId);
        if (!est || !m) throw Object.assign(new Error("Este documento ya no existe en este equipo (¿se borraron " + (NOM.enApp() ? "los datos de la app" : "los datos del navegador") + "?)"), { estado: 404 });
        datos = { estado: est, documento: m, permiso: "EDICION", espacio: { id: null, nombre: "Solo en este equipo" } };
      } else datos = await api.get(`/api/documentos/${docId}`);
    } catch (e) {
      const c = NOM.DocCRDT.cache(docId);
      if (e.red && c) { datos = { estado: c.estado, documento: c.meta && c.meta.documento, permiso: c.meta && c.meta.permiso, espacio: c.meta && c.meta.espacio }; sinRed = true; }
      else {
        raiz.innerHTML = `<div class="contenido"><div class="vacio"><div class="burbuja">${ico(e.red ? "wifi-off" : "triangle-alert")}</div>
          <h3>${esc(e.red ? "No se pudo abrir el documento" : e.message)}</h3>
          ${e.red ? `<p>No hay conexión y este equipo no tiene una copia guardada. Revisa el Wi-Fi y vuelve a intentarlo.</p>` : ""}
          <div class="fila" style="justify-content:center;flex-wrap:wrap">${e.red ? `<button class="btn primario" data-reintentar>${ico("refresh-cw")} Volver a intentar</button>` : ""}<a class="btn" href="#/">Ir al inicio</a></div></div></div>`;
        // Vuelve a pasar por la ruta (así el intento nuevo es una pantalla limpia).
        const re = raiz.querySelector("[data-reintentar]");
        if (re) re.onclick = () => window.dispatchEvent(new HashChangeEvent("hashchange"));
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
    // Fase 13, parte C: creado sin Internet dentro de un espacio (se sube al volver la red).
    ed.destino = enLocal && datos.documento && datos.documento.destino ? { id: datos.documento.destino, nombre: datos.documento.destinoNombre } : null;
    // El propietario del espacio (aunque haya pasado la fecha de entrega, él sigue editando).
    ed.esPropietario = !enLocal && ((datos.espacio || {}).miPermiso || datos.permiso) === "PROPIETARIO";
    ed.entrega = datos.entrega || null;
    ed.protegido = !!(datos.documento && datos.documento.protegido);
    ed.visita = datos.visita || null;
    // Fase 13, parte B: si este documento es una rama (y de cuál), y cuántas ramas abiertas tiene.
    ed.rama = datos.rama || null;
    ed.ramasAbiertas = (datos.documento && datos.documento.ramasAbiertas) || 0;
    ed.cambiosVisita = datos.cambios || null;
    if (!enLocal) NOM.anotarReciente({ id: docId, nombre: (datos.documento || {}).nombre, modo: (datos.documento || {}).modo }, ed.espacio);

    const doc = new NOM.DocCRDT(docId, datos.estado, {
      meta, soloLectura: ed.soloLectura, local: enLocal,
      alCambiar: (cambios, origen) => alCambiar(cambios, origen),
      alEstado: (e, n) => pintarEstado(e, n),
      alRechazo: (e) => permisoPerdido(e),
      alEliminado: () => documentoEliminado(),
      alRechazadas: (r) => cambiosRechazados(r),
      alLleno: (e) => aviso(e.message, { tipo: "error", ms: 9000 }),
      alRama: (d) => ramaCreada(d),
    });
    ed.doc = doc;
    NOM.editorActual = ed;   // útil para depurar desde la consola

    // ------------------------------------------------------------ estructura
    raiz.innerHTML = "";
    // El tipo sale de los metadatos del servidor (fijados al crear el documento).
    const tipoDato = (datos.documento || {}).modo || doc.valor("_doc", "modo");
    const tipo = MODOS[tipoDato] ? tipoDato : "TEXTO";
    const vista = html(`
      <div class="editor sin-selector modo-${tipo} ${ed.soloLectura ? "lectura" : ""} ${NOM.leer("nom.pref", {}).enfoqueAtenuar === false ? "" : "atenuar"}">
        <header class="ed-barra">
          <a class="icono-btn" href="${ed.local ? (ed.destino ? "#/espacio/" + esc(ed.destino.id) : "#/") : "#/espacio/" + esc(ed.espacio.id || "")}" aria-label="Volver" data-micro="Volver|Regresa a la lista de documentos del espacio.">${ico("chevron-left")}</a>
          <div class="ed-titulos">
            <input class="ed-nombre" data-nombre aria-label="Nombre del documento" ${ed.soloLectura ? "readonly" : ""} maxlength="120">
            <span class="ed-espacio recorta"><span class="ed-tipo">${ico(MODOS[tipo].icono, "ico-s")} ${esc(MODOS[tipo].nombre)}</span> · ${esc(ed.espacio.nombre || "")}</span>
          </div>
          <span class="crece"></span>
          <span class="avatares solo-escritorio" data-presencia></span>
          <span class="estado-sync" data-sync role="status" aria-live="polite"></span>
          <button class="icono-btn solo-escritorio" data-a="paleta" data-micro="Buscar o ir a|Documentos, espacios y acciones.|Ctrl K">${ico("search")}</button>
          <button class="icono-btn" ${enLocal ? "hidden" : ""} data-a="comentarios" aria-label="Comentarios" data-micro="Comentarios|Comentarios y sugerencias del documento. Funcionan aunque no haya Internet.">${ico("message-square")}</button>
          <button class="icono-btn solo-escritorio" ${enLocal ? "hidden" : ""} data-a="historial" data-micro="Historial de versiones|Consulta y restaura versiones anteriores.">${ico("history")}</button>
          <button class="icono-btn" data-a="mas" aria-label="Más opciones" data-micro="Más opciones|Exportar, guardar versión, enfoque y más.">${ico("more-horizontal")}</button>
        </header>
        <div class="ed-herramientas" role="toolbar" aria-label="Herramientas" data-herr></div>
        <div class="ed-lienzo" data-lienzo tabindex="-1"></div>
        <div class="ed-avisos" data-avisos-doc aria-live="polite"></div>
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
      if (ed.resaltando && ed.modoApi.resaltarCambios) ed.modoApi.resaltarCambios({ visita: ed.visita, cambios: ed.cambiosVisita });
      if (ed.alMontarModo) ed.alMontarModo();
    }

    // ------------------------------------------------------------ herramientas
    // Cada modo aporta las suyas; deshacer/rehacer e historial son comunes. Con permiso de solo
    // lectura solo quedan las que no cambian el documento (buscar, enfoque y exportar).
    function pintarHerramientas() {
      const deModo = ed.modoApi.herramientas ? ed.modoApi.herramientas(ed) : [];
      const comunes = [
        { id: "enfoque", icono: "scan-eye", micro: "Modo enfoque|Oculta todo menos tu contenido.|Ctrl+.", fn: () => enfoque(true), clase: "solo-escritorio" },
        { id: "exportar", icono: "download", micro: "Exportar|Guarda una copia en otro formato.", fn: exportar },
        { id: "ayuda", icono: "circle-help", micro: "Ayuda de este editor|Cómo usar el editor de " + MODOS[tipo].nombre.toLowerCase() + ".", fn: () => NOM.ayuda("editores/" + { TEXTO: "texto", HOJA: "hoja", PRESENTACION: "presentacion", DIAGRAMA: "diagrama" }[tipo]), clase: "solo-escritorio" },
      ];
      const items = ed.soloLectura ? [
        { html: `<span class="ed-lectura-aviso">${ico("eye", "ico-s")} Solo puedes ver: también buscar y descargar</span>` },
        "->",
        ...deModo.filter((it) => it && it.id === "buscar"),
        ...comunes,
      ] : [
        { id: "deshacer", icono: "undo-2", micro: "Deshacer|Revierte tu último cambio; los demás lo verán.|Ctrl+Z", fn: () => ed.deshacer(), off: () => !doc.puedeDeshacer() },
        { id: "rehacer", icono: "redo-2", micro: "Rehacer|Vuelve a aplicar lo que deshiciste.|Ctrl+Y", fn: () => ed.rehacer(), off: () => !doc.puedeRehacer() },
        "|",
        ...deModo,
        "->",
        ...comunes,
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
      if (NOM.comentarios) NOM.comentarios.cambios(ed, cambios);
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
        enviando: [`<span class="cargando" style="width:12px;height:12px;border-width:2px"></span>`, "Guardando…", ""],
        "sin-red": [ico("cloud-off", "ico-s"), `Sin conexión${n ? " · " + n + (n === 1 ? " cambio guardado aquí" : " cambios guardados aquí") : ""}`, "sin-red"],
        pendiente: [ico("clock", "ico-s"), `${n} por enviar`, "pendiente"],
        lectura: [ico("eye", "ico-s"), "Solo ver", "lectura"],
        lleno: [ico("hard-drive", "ico-s"), `Sin espacio en la nube${n ? " · " + n + (n === 1 ? " cambio guardado aquí" : " cambios guardados aquí") : ""}`, "sin-red"],
        local: [ico("hard-drive", "ico-s"), "Solo en este equipo", "pendiente"],
        destino: [ico("cloud-off", "ico-s"), "Se sube al volver la red", "sin-red"],
      }[ed.soloLectura ? "lectura" : ed.local ? (ed.destino ? "destino" : "local") : e] || ["", "", ""];
      s.className = "estado-sync " + t[2];
      s.innerHTML = `${t[0]}<span class="solo-escritorio">${t[1]}</span>`;
      s.setAttribute("data-micro", ed.local && ed.destino ? "Se sube al volver la red|Lo creaste sin Internet dentro de " + (ed.destino.nombre || "un espacio") + ". Se guarda aquí, cifrado, y se sube solo cuando haya conexión."
        : ed.local ? "Solo en este equipo|Se guarda automáticamente " + NOM.aqui().en + ", pero si " + NOM.aqui().borrar + " se pierde. Descárgalo (Exportar → .nom) o crea una cuenta y súbelo a un espacio."
        : ed.soloLectura ? "Solo ver|Tu permiso deja ver el documento, no cambiarlo."
        : e === "lleno" ? "Sin espacio en la nube|El propietario del espacio usó toda su cuota. Tus cambios se quedan en este equipo; liberen versiones viejas en Almacenamiento."
        : e === "sin-red" ? "Sin conexión|Sigue trabajando: tus cambios se guardan en este equipo y se envían solos al volver la red."
        : "Guardado|Cada cambio se guarda solo y los demás lo ven en un momento.");
    }
    pintarEstado(sinRed ? "sin-red" : doc.estadoSync, doc.pendientes.length);
    // Lo que quedó sin enviar se retoma hasta aquí, con la pantalla ya armada (pintarEstado usa "vista").
    // Sin conexión no se intenta: el canal en tiempo real lo retoma solo al volver la red.
    if (doc.pendientes.length && !sinRed) doc.reanudar();
    if (sinRed) aviso("Sin conexión: abriste la copia guardada en este equipo. Tus cambios se enviarán al volver la red.", { tipo: "aviso", ms: 6000 });
    // B.2: lo que se edite en un documento abierto ya sin Internet se revisa al volver (rama si otros lo cambiaron).
    if (sinRed && !enLocal && NOM.ramas) NOM.ramas.marcar(docId, datos.estado, { abierto: true, meta });

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
    let caido = sinRed, canal = null, colaE2E = Promise.resolve();
    ed.e2e = !!datos.e2e;
    if (!enLocal) canal = api.eventos(`/api/documentos/${docId}/eventos`, doc.nodo, {
      hola: async () => {
        if (caido) {
          caido = false;
          let resumen = null;
          try {
            const r = await api.get(`/api/documentos/${docId}`);
            const desde = doc.relojDesconexion, mios = (doc.enviadasSinRed || []).concat(doc.pendientes);
            doc.fusionarEstado(r.estado);
            if (desde != null && mios.length) resumen = NOM.reconexion ? NOM.reconexion.calcular(ed, r.estado, desde, mios) : null;
            if (r.permiso !== ed.permiso) cambiarPermiso(r.permiso);
          } catch (e) { /* siguiente intento */ }
          doc.relojDesconexion = null;
          doc.enviadasSinRed = [];
          if (resumen && resumen.length) NOM.reconexion.mostrar(ed, resumen);
          else aviso("Volvió la conexión. Enviando tus cambios…", { tipo: "ok" });
        }
        doc.reanudar();
        enviarPresencia();
      },
      caido: () => { caido = true; doc.marcarSinRed(); pintarEstado("sin-red", doc.pendientes.length); },
      // Fase 15: en un espacio cifrado lo que llega se descifra aquí, en el mismo orden en que llegó.
      ops: (x) => { if (datos.e2e && NOM.e2e) colaE2E = colaE2E.then(() => NOM.e2e.descifrarEnVivo(docId, x.ops)).then((o) => ed.recibir(o)).catch((e) => console.error(e)); else ed.recibir(x.ops); },
      presencia: (x) => { ed.presencia = x.usuarios; ed.pintarPresencia(); },
      version: (x) => aviso(`${x.autor} restauró la versión ${x.desde}. Ya estás viendo el documento restaurado.`, { tipo: "info", ms: 6000 }),
      guardado: (x) => { ultimoGuardado = x.numero; pintarEstado(doc.estadoSync, doc.pendientes.length); },
      permiso: (x) => { if (x.usuarioId === (api.usuario() || {}).id) cambiarPermiso(x.permiso); },
      eliminado: () => documentoEliminado(),
      // 8.5 Lo movieron a otro espacio: se vuelve a abrir (ahora con los miembros de allá).
      movido: (x) => { aviso(`${x.por} movió este documento a ${x.espacio}`, { tipo: "info", ms: 5000 }); setTimeout(() => window.dispatchEvent(new HashChangeEvent("hashchange")), 400); },
      // 8.5 Alguien te mencionó en un comentario (de este u otro documento).
      aviso: (a) => {
        if (!a || a.tipo !== "mencion" || !NOM.avisoNuevo(a)) return;
        const aqui = a.docId === docId;
        aviso(`${a.por} te mencionó${aqui ? " en un comentario" : ` en “${a.documento}”`}`, { ms: 8000, accion: { texto: "Ver", fn: () => (aqui ? NOM.comentarios && NOM.comentarios.abrir(ed, raizDe(a.comentario)) : (location.hash = "#/doc/" + a.docId + "?comentario=" + encodeURIComponent(a.comentario || ""))) } });
      },
      entrega: () => refrescarEntrega(true),
      documento: (x) => { if ("protegido" in x) { ed.protegido = !!x.protegido; pintarAvisos(); } },
      // Fase 13, parte B: se creó, fusionó o apartó una rama de este documento (o este es la rama).
      rama: () => refrescarRamas(),
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
      if (antes !== ed.soloLectura) { aviso(ed.soloLectura ? "Ahora solo puedes ver este documento" : "Ahora puedes editar", { tipo: "info" }); montar(ed.modo, true); }
      if (!ed.soloLectura) doc.reanudar();
      pintarEstado(doc.estadoSync, doc.pendientes.length);
    }

    // CU-26 7a: el permiso bajó a lectura mientras había cambios en cola.
    function permisoPerdido() {
      const n = doc.pendientes.length;
      cambiarPermiso("LECTURA");
      const pie = html(`<div style="display:contents"><button class="btn" data-no>Descartarlos</button><button class="btn primario" data-si>${ico("download")} Exportar mi copia</button></div>`);
      const h = hoja({ titulo: "Tus cambios no se aplicaron", cuerpo: `<p style="font-weight:650">Tu permiso cambió a <b>solo ver</b> mientras trabajabas sin conexión. ${n} cambio(s) quedaron solo en este equipo.</p>`, pie });
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
      const h = hoja({ titulo: "Este documento está en la papelera", cuerpo: `<p style="font-weight:650">Otra persona lo mandó a la papelera del espacio: quien edita lo puede restaurar desde ahí durante 30 días. También puedes guardar lo que tienes en pantalla como un documento nuevo.</p>`, pie });
      $("[data-no]", pie).onclick = () => { h.cerrar(); location.hash = "#/espacio/" + ed.espacio.id; };
      $("[data-si]", pie).onclick = async () => {
        // Todo, también el texto letra por letra (las secuencias).
        const ops = NOM.DocCRDT.opsDeEstado(doc.estado, "copia");
        try {
          const d = await api.post(`/api/espacios/${ed.espacio.id}/documentos`, { nombre: (nombre.value || "Documento") + " (recuperado)", modo: ed.modo, ops });
          doc.descartarCola();
          h.cerrar(true);
          location.hash = "#/doc/" + d.id;
        } catch (e) { aviso(e.message, { tipo: "error" }); }
      };
    }


    // ------------------------------------------------------------ 3.5 cambios que el servidor no aceptó
    let recargando = false;
    async function cambiosRechazados(r) {
      aviso(r.motivo || "Parte de tus cambios no se aplicó", { tipo: "aviso", ms: 6000 });
      if (recargando) return;
      recargando = true;
      try {
        const d = await api.get(`/api/documentos/${docId}`);
        doc.reemplazarEstado(d.estado);
        if (!ed.previa) montar(ed.modo, true);
      } catch (e) { /* se queda como está hasta reabrir */ }
      recargando = false;
    }

    // ------------------------------------------------------------ avisos fijos: entrega, protección, cambios
    const fechaLarga = (ms) => new Date(ms).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    function desdeCuando(ms) {
      const d = new Date(ms), hoy = new Date(), ayer = new Date(Date.now() - 86400000);
      const hora = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      if (d.toDateString() === hoy.toDateString()) return "desde hoy a las " + hora;
      if (d.toDateString() === ayer.toDateString()) return "desde ayer a las " + hora;
      if (Date.now() - ms < 6 * 86400000) return "desde el " + d.toLocaleDateString("es-MX", { weekday: "long" });
      return "desde el " + d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
    }
    const listaNombres = (ps) => { const n = ps.map((p) => p.nombre); return n.length <= 1 ? n.join("") : n.slice(0, -1).join(", ") + " y " + n[n.length - 1]; };
    let tEntrega = null;
    function pintarAvisos() {
      const cont = $("[data-avisos-doc]", vista);
      if (!cont) return;
      const l = [];
      // Fase 13, parte C: creado sin Internet dentro de un espacio.
      if (ed.destino) l.push(`<div class="banda ${api.enLinea ? "info" : "aviso"}">${ico(api.enLinea ? "cloud-upload" : "cloud-off", "ico-s")}<span class="crece">${api.enLinea
        ? `Ya hay conexión: súbelo a <b>${esc(ed.destino.nombre || "su espacio")}</b> para trabajarlo en equipo (también se sube solo al salir).`
        : `Lo creaste sin conexión dentro de <b>${esc(ed.destino.nombre || "un espacio")}</b>: se guarda aquí, cifrado, y se sube solo en cuanto vuelva la red.`}</span>
        ${api.enLinea ? `<button class="btn chico primario" data-a="subir-destino">${ico("upload", "ico-s")} Subir ahora</button>` : ""}</div>`);
      const e = ed.entrega;
      if (e && e.limite) {
        const vencida = e.vencida || Date.now() >= e.limite;
        l.push(`<div class="banda ${vencida ? "aviso" : "info"}">${ico("calendar", "ico-s")}<span class="crece">${vencida
          ? (ed.esPropietario ? `La entrega cerró el ${esc(fechaLarga(e.limite))}: los demás ya solo pueden leer.` : `La fecha límite pasó (${esc(fechaLarga(e.limite))}): ya solo se puede ver.`)
          : `Entrega: fecha límite ${esc(fechaLarga(e.limite))}`}</span>
          ${ed.esPropietario ? `<button class="btn chico" data-a="entrega">Cambiar</button>` : ""}${vencida && ed.esPropietario && (e.recibos || []).length ? `<button class="btn chico" data-a="recibos-entrega">${ico("shield-check", "ico-s")} Recibos (${e.recibos.length})</button>` : ""}</div>`);
      }
      // Fase 13, parte B: ramas.
      const dm = (datos.documento || {});
      if (ed.rama && dm.ramaEstado === "abierta") {
        l.push(`<div class="banda rama">${ico("git-branch", "ico-s")}<span class="crece">${ed.rama.existe
          ? `Esta es una <b>rama</b> de «${esc(ed.rama.original || "el original")}»: lo que ${esc(dm.ramaAutor || "alguien")} editó sin conexión mientras otros lo cambiaban. El original no se tocó.`
          : `Esta rama es de un documento que ya no está (se borró o está en la papelera). Puedes dejarla como documento aparte.`}</span>
          ${ed.rama.existe ? `<button class="btn chico" data-a="rama-comparar">${ico("git-compare", "ico-s")} Comparar</button>${ed.soloLectura ? "" : `<button class="btn chico primario" data-a="rama-fusionar">${ico("git-merge", "ico-s")} Fusionar</button>`}` : ""}
          ${ed.soloLectura ? "" : `<button class="icono-btn chico" data-a="rama-mas" aria-label="Más opciones de la rama">${ico("more-horizontal", "ico-s")}</button>`}${NOM.botonAyuda("espacios/ramas", "Qué es una rama")}</div>`);
      } else if (ed.rama && dm.ramaEstado === "fusionada") {
        l.push(`<div class="banda ok">${ico("git-merge", "ico-s")}<span class="crece">Esta rama ya se fusionó con «${esc(ed.rama.original || "el original")}»${dm.ramaFusionadaPor ? " (lo hizo " + esc(dm.ramaFusionadaPor) + ")" : ""}.</span>${ed.rama.existe ? `<a class="btn chico" href="#/doc/${esc(ed.rama.de)}">Abrir el original</a>` : ""}</div>`);
      }
      if (ed.ramasAbiertas > 0 && !ed.previa) {
        l.push(`<div class="banda rama">${ico("git-branch", "ico-s")}<span class="crece">Este documento tiene <b>${ed.ramasAbiertas === 1 ? "una rama" : ed.ramasAbiertas + " ramas"}</b>: ${ed.ramasAbiertas === 1 ? "una versión" : "versiones"} que alguien editó sin conexión mientras otros lo cambiaban.</span><button class="btn chico" data-a="ver-ramas">Ramas (${ed.ramasAbiertas})</button></div>`);
      }
      const c = ed.cambiosVisita;
      if (c && c.personas && c.personas.length && !ed.previa) {
        l.push(`<div class="banda cambios">${ico("sparkles", "ico-s")}<span class="crece">Cambios de <b>${esc(listaNombres(c.personas))}</b> ${esc(desdeCuando(c.desde))}${ed.resaltando ? " · resaltados" : ""}.</span>
          <button class="btn chico" data-a="ver-cambios">${ed.resaltando ? "Quitar resaltado" : "Resaltar"}</button><button class="icono-btn chico" data-a="cerrar-cambios" aria-label="Cerrar">${ico("x", "ico-s")}</button></div>`);
      }
      cont.innerHTML = l.join("");
      const b = (a) => $(`[data-a="${a}"]`, cont);
      if (b("subir-destino")) b("subir-destino").onclick = subirDestino;
      if (b("ver-ramas")) b("ver-ramas").onclick = () => NOM.ramas.lista(docId);
      if (b("rama-comparar")) b("rama-comparar").onclick = () => NOM.ramas.comparar(docId, (r) => { location.hash = "#/doc/" + r.original; });
      if (b("rama-fusionar")) b("rama-fusionar").onclick = () => NOM.ramas.comparar(docId, (r) => { location.hash = "#/doc/" + r.original; });
      if (b("rama-mas")) b("rama-mas").onclick = (e) => NOM.menu(e.currentTarget, [
        { texto: "Dejar como documento aparte", icono: "file-text", fn: async () => { if (await NOM.ramas.apartar(docId)) window.dispatchEvent(new HashChangeEvent("hashchange")); } },
        { texto: "Descartar la rama (a la papelera)", icono: "trash-2", peligro: true, fn: async () => { if (await NOM.ramas.descartar(docId)) location.hash = ed.rama && ed.rama.existe ? "#/doc/" + ed.rama.de : "#/espacio/" + ed.espacio.id; } },
      ]);
      if (b("entrega")) b("entrega").onclick = dialogoEntrega;
      if (b("recibos-entrega")) b("recibos-entrega").onclick = () => NOM.recibo.lista(ed.entrega.recibos);
      if (b("ver-cambios")) b("ver-cambios").onclick = () => resaltarCambios(!ed.resaltando);
      if (b("cerrar-cambios")) b("cerrar-cambios").onclick = () => { resaltarCambios(false); ed.cambiosVisita = null; pintarAvisos(); };
      clearTimeout(tEntrega);
      // Si la fecha límite llega con el documento abierto, pasa a solo lectura en ese momento.
      if (e && e.limite && !ed.esPropietario && Date.now() < e.limite && e.limite - Date.now() < 2 ** 31 - 1) tEntrega = setTimeout(() => refrescarEntrega(false), e.limite - Date.now() + 1500);
    }
    /** Fase 13, parte B: al volver la red se creó una rama con lo de esta persona; el original se
        vuelve a cargar como está en el servidor (sin lo que quedó en la rama). */
    async function ramaCreada(d) {
      NOM.ramas.avisar(d, nombre.value || (datos.documento || {}).nombre);
      try {
        const r = await api.get(`/api/documentos/${docId}`);
        doc.reemplazarEstado(r.estado);
        if (r.documento && typeof r.documento.ramasAbiertas === "number") ed.ramasAbiertas = r.documento.ramasAbiertas;
        if (!ed.previa) montar(ed.modo, true);
      } catch (e) { if (d.tipo === "rama") ed.ramasAbiertas++; }
      pintarAvisos();
    }
    async function refrescarRamas() {
      try {
        const r = await api.get(`/api/documentos/${docId}`);
        ed.ramasAbiertas = (r.documento && r.documento.ramasAbiertas) || 0;
        if (r.documento) Object.assign(datos.documento || (datos.documento = {}), { ramaEstado: r.documento.ramaEstado, ramaFusionadaPor: r.documento.ramaFusionadaPor, ramaDe: r.documento.ramaDe });
        ed.rama = r.rama || null;
        pintarAvisos();
      } catch (e) { /* sin red */ }
    }

    /** Parte C: sube ya el documento creado sin Internet a su espacio y abre el del espacio. */
    let subiendo = false;
    async function subirDestino() {
      if (subiendo || !ed.destino) return;
      subiendo = true;
      try {
        doc.guardarYa();
        const d = await NOM.local.subir(docId, ed.destino.id);
        // La copia de este equipo ya no existe: que el editor no la vuelva a escribir al cerrarse.
        doc.opc.soloMemoria = true; doc._guardarCache = () => {};
        ed.destino = null;
        aviso("Listo: ya está en el espacio", { tipo: "ok" });
        location.hash = "#/doc/" + d.id;
      } catch (e) { aviso(e.red ? "Todavía no hay conexión con el servidor" : e.message, { tipo: e.red ? "aviso" : "error" }); }
      subiendo = false;
    }
    const quitarRedDestino = ed.destino ? api.alCambiarRed(() => pintarAvisos()) : null;

    function resaltarCambios(si) {
      ed.resaltando = !!si && !!ed.cambiosVisita;
      if (ed.modoApi && ed.modoApi.resaltarCambios) ed.modoApi.resaltarCambios(ed.resaltando ? { visita: ed.visita, cambios: ed.cambiosVisita } : null);
      pintarAvisos();
    }
    ed.resaltarCambios = resaltarCambios;
    async function refrescarEntrega(avisar) {
      try {
        const d = await api.get(`/api/documentos/${docId}`);
        ed.entrega = d.entrega || null;
        if (d.permiso !== ed.permiso) cambiarPermiso(d.permiso);
        pintarAvisos();
        if (avisar && ed.entrega && ed.entrega.cerrada && !ed.esPropietario) aviso("Se cerró la entrega: ya solo puedes ver el documento", { tipo: "info" });
      } catch (e) { /* sin red */ }
    }
    function dialogoEntrega() {
      const actual = ed.entrega && ed.entrega.limite ? new Date(ed.entrega.limite) : new Date(Date.now() + 7 * 86400000);
      const local = new Date(actual.getTime() - actual.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const cuerpo = html(`<form class="col">
        <p class="suave" style="font-weight:650">Al llegar la fecha, quien no es el propietario del espacio ya solo puede <b>verlo</b> y se guarda una versión final con el <b>recibo de proceso de escritura</b> de cada persona que trabajó en el documento.</p>
        <div class="campo"><label for="fl">Fecha y hora límite</label><div class="entrada">${ico("calendar")}<input id="fl" type="datetime-local" value="${local}" required></div></div></form>`);
      const pie = html(`<div style="display:contents">${ed.entrega && ed.entrega.limite ? `<button class="btn plano peligro" data-quitar type="button">Quitar la entrega</button>` : ""}<span class="crece"></span><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>Guardar</button></div>`);
      const h = hoja({ titulo: "Entrega con fecha límite", icono: "calendar", cuerpo, pie });
      const fijar = async (limite) => {
        try { ed.entrega = await api.put(`/api/documentos/${docId}/entrega`, { limite }); if (!limite) ed.entrega = null; pintarAvisos(); h.cerrar(); aviso(limite ? "Fecha límite guardada" : "Ya no es una entrega", { tipo: "ok" }); }
        catch (e) { aviso(e.message, { tipo: "error" }); }
      };
      $("[data-no]", pie).onclick = () => h.cerrar();
      const q = $("[data-quitar]", pie); if (q) q.onclick = () => fijar(0);
      const enviar = (e) => { e && e.preventDefault(); const v = $("#fl", cuerpo).value; if (!v) return; fijar(new Date(v).getTime()); };
      cuerpo.onsubmit = enviar;
      $("[data-si]", pie).onclick = enviar;
    }

    // ------------------------------------------------------------ 1.2 proteger contra el borrado
    async function proteger(si) {
      let confirmacion = null;
      if (!si) {
        confirmacion = await NOM.pedirTexto("Quitar la protección", { etiqueta: "Para quitarla, escribe BORRAR", ph: "BORRAR", si: "Quitar protección", max: 10 });
        if (confirmacion == null) return;
      }
      try {
        await api.put(`/api/documentos/${docId}/proteccion`, { protegido: si, confirmacion });
        ed.protegido = si;
        aviso(si ? "Protegido: nadie puede borrarlo hasta que quites la marca" : "Protección quitada", { tipo: "ok" });
      } catch (e) { aviso(e.message, { tipo: "error" }); }
    }

    // ------------------------------------------------------------ 3.5 asignar partes a una persona
    /** Miembros del espacio (para "Asignar a…" y para poner nombre a los dueños). */
    ed.miembros = [];
    ed.cargarMiembros = async () => {
      if (enLocal) return [];
      try { const a = await api.get(`/api/espacios/${ed.espacio.id}/accesos`); ed.miembros = a.miembros || []; } catch (e) { /* sin red */ }
      return ed.miembros;
    };
    ed.nombreDe = (uid) => { const m = ed.miembros.find((x) => x.id === uid); return m ? m.nombre : (uid === (api.usuario() || {}).id ? (api.usuario() || {}).nombre : "otra persona"); };
    ed.colorDe = (uid) => { const m = ed.miembros.find((x) => x.id === uid); return m ? m.color : "#6B6875"; };
    /** Elige a quién asignar una parte. Devuelve el id, "" para quitar la asignación, o null si se canceló. */
    ed.elegirPersona = (titulo, actual) => new Promise(async (ok) => {
      const ms = (await ed.cargarMiembros()).filter((m) => m.permiso !== "LECTURA");
      const cuerpo = html(`<div class="col"><p class="suave" style="font-weight:650">Solo esa persona (y tú, como propietario) podrá cambiar esta parte. Los demás la ven, pero no la editan.</p>
        <div class="lista">${ms.map((m) => `<button class="lista-item" data-u="${esc(m.id)}" style="text-align:left;width:100%" ${m.id === actual ? 'aria-pressed="true"' : ""}>${avatar(m)}<span class="crece"><b>${esc(m.nombre)}</b><small>${esc(m.permiso === "PROPIETARIO" ? "Propietario" : "Puede editar")}</small></span>${m.id === actual ? ico("check") : ""}</button>`).join("")}
        ${actual ? `<button class="lista-item" data-u="" style="text-align:left;width:100%">${ico("lock-open")}<span class="crece"><b>Nadie</b><small>Quitar la asignación: todos pueden editarla</small></span></button>` : ""}</div></div>`);
      let elegido = null;
      const h = hoja({ titulo: titulo || "Asignar a…", icono: "users", cuerpo, alCerrar: () => ok(elegido) });
      $$("[data-u]", cuerpo).forEach((b) => (b.onclick = () => { elegido = b.dataset.u; h.cerrar(); }));
    });

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
          <button type="button" data-tab="actividad" aria-pressed="false" data-micro="Actividad|Cada cambio guardado: quién, desde qué dispositivo y cuándo.">Actividad</button>
          <button type="button" data-tab="aportes" aria-pressed="false" data-micro="Aportes|Cuánto escribió cada persona y cuánto de su texto sigue en el documento.">Aportes</button></div></div>
        <div class="fila historial-acciones">
          <button class="btn chico" data-recibo data-micro="Recibo de mi trabajo|Tus sesiones, lo que tecleaste y lo que pegaste, con una huella SHA-256 para probar que es auténtico.">${ico("shield-check", "ico-s")} Recibo de mi trabajo</button>
          <button class="icono-btn chico" data-repeticion aria-label="Repetición" data-micro="Repetición|Mira cómo creció el documento, versión por versión.">${ico("play", "ico-s")}</button>
          <button class="icono-btn chico" data-verificar aria-label="Verificar un recibo" data-micro="Verificar un recibo|Comprueba que un recibo (.json) es auténtico y que nadie lo cambió.">${ico("circle-check", "ico-s")}</button></div>
        <div class="cajon-cuerpo" data-versiones><div class="esqueleto" style="height:56px"></div><div class="esqueleto" style="height:56px"></div></div></div>`;
      $$("[data-tab]", lateral).forEach((b) => (b.onclick = () => {
        $$("[data-tab]", lateral).forEach((x) => x.setAttribute("aria-pressed", x === b));
        if (b.dataset.tab === "actividad") cargarActividad(); else if (b.dataset.tab === "aportes") NOM.recibo.aportes($("[data-versiones]", lateral), ed); else cargar();
      }));
      $("[data-recibo]", lateral).onclick = () => NOM.recibo.mostrar(ed);
      $("[data-repeticion]", lateral).onclick = () => NOM.recibo.repeticion(ed);
      $("[data-verificar]", lateral).onclick = () => NOM.recibo.verificar();
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
        if (a.escritas) p.push(`escribió ${a.escritas} ${a.escritas === 1 ? "letra" : "letras"}${a.pegadas ? ` (${a.pegadas} pegadas)` : ""}`);
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
        aviso(doc.guardarYa() ? "Guardado en este equipo. Para no perderlo si se borran los datos, descárgalo (.nom)." : "No se pudo guardar: " + NOM.aqui().sinEspacio.toLowerCase(), { tipo: "ok", accion: { texto: "Descargar", fn: () => NOM.formatos.exportar(doc, "nom", nombre.value || "documento") } });
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
    $("[data-a=comentarios]", vista).onclick = () => NOM.comentarios && NOM.comentarios.abrir(ed);
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
      { texto: "Descargar en otro formato (PDF y más)…", icono: "file-down", fn: exportar },
      ...(api.token() ? [{ texto: "Subir a un espacio", icono: "upload", fn: () => { doc.guardarYa(); NOM.vistaEspacios.subirLocal(docId); } }]
        : [{ texto: "Crear cuenta para compartirlo", icono: "user-plus", fn: () => { doc.guardarYa(); NOM.app.irACuentas("registro"); } }]),
      { texto: "Modo enfoque (solo tu contenido)", icono: "scan-eye", atajo: "Ctrl+.", fn: () => enfoque(true) },
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
      { texto: "Descargar en otro formato (PDF y más)…", icono: "file-down", fn: exportar },
      { texto: "Modo enfoque (solo tu contenido)", icono: "scan-eye", atajo: "Ctrl+.", fn: () => enfoque(true) },
      "-",
      { texto: "Invitar o ver miembros", icono: "user-plus", fn: () => NOM.vistaEspacios.accesos(ed.espacio) },
      { texto: "Recibo de mi trabajo", icono: "shield-check", fn: () => NOM.recibo.mostrar(ed) },
      // Fase 9: lo que se arma con el contenido (sin inventar nada).
      ...(NOM.datos && tipo === "TEXTO" ? [
        { titulo: "Convertir" },
        { texto: "En una presentación", icono: "presentation", fn: () => NOM.datos.aPresentacion(ed) },
        { texto: "En un mapa mental", icono: "brain", fn: () => NOM.datos.aMapaMental(ed) },
        ...(ed.soloLectura ? [] : [{ texto: "Combinar correspondencia…", icono: "mail", fn: () => NOM.datos.combinarCorrespondencia(ed) }]),
      ] : []),
      ...(NOM.datos && tipo === "HOJA" ? [{ texto: "Hacer un reporte con estos datos", icono: "bar-chart", fn: () => NOM.datos.reporteDeDatos(ed) }] : []),
      // 8.5 Copia, mover a otro espacio y plantilla del espacio.
      ...(ed.soloLectura && !(NOM.app.espacios || []).some((x) => x.permiso !== "LECTURA") ? [] : ["-"]),
      ...(ed.soloLectura ? [] : [
        { texto: "Hacer una copia", icono: "copy-plus", fn: () => copiarDocumento(ed.espacio.id) },
        { texto: "Guardar como plantilla del espacio", icono: "copy", fn: () => copiarDocumento(ed.espacio.id, true) },
      ]),
      ...((NOM.app.espacios || []).some((x) => x.id !== ed.espacio.id && x.permiso !== "LECTURA") ? [{ texto: ed.soloLectura ? "Copiar a otro de mis espacios…" : "Mover o copiar a otro espacio…", icono: "folder-input", fn: (ev) => otroEspacio(ev) }] : []),
      ...(ed.esPropietario ? [
        { titulo: "Como propietario del espacio" },
        { texto: "Enlace para ver sin cuenta…", icono: "link-2", fn: () => NOM.vistaEspacios.enlaceVer({ id: docId, nombre: nombre.value || (datos.documento || {}).nombre || "Documento" }) },
        { texto: ed.protegido ? "Quitar la protección contra el borrado" : "Proteger contra el borrado", icono: ed.protegido ? "lock-open" : "lock", fn: () => proteger(!ed.protegido) },
        { texto: ed.entrega && ed.entrega.limite ? "Cambiar la fecha de entrega…" : "Entrega con fecha límite…", icono: "calendar", fn: dialogoEntrega },
      ] : []),
      { texto: "Preferencias", icono: "settings", fn: () => NOM.vistaEspacios.preferencias() },
      ...(ed.soloLectura ? [] : ["-", { texto: "Mandar a la papelera", icono: "trash-2", peligro: true, fn: async () => {
        if (ed.protegido) return aviso("Este documento está protegido contra el borrado. Quita la protección para borrarlo.", { tipo: "aviso", ms: 5000 });
        if (!(await confirmar("Mandar a la papelera", "Sale de la lista para todos los miembros. Quien edita lo puede restaurar desde la papelera del espacio durante 30 días.", { si: "Mandar a la papelera", peligro: true }))) return;
        try {
          await api.delete(`/api/documentos/${docId}`);
          avisadoEliminado = true;
          location.hash = "#/espacio/" + ed.espacio.id;
          aviso("Está en la papelera del espacio (30 días)", { tipo: "ok", ms: 6000, accion: { texto: "Deshacer", fn: async () => { try { await api.post(`/api/documentos/${docId}/restaurar`); location.hash = "#/doc/" + docId; } catch (e2) { aviso(e2.message, { tipo: "error" }); } } } });
        } catch (err) { aviso(err.message, { tipo: "error" }); }
      } }]),
    ]);
    /** 8.5 Copia del documento (o plantilla del espacio), en este espacio o en otro. */
    async function copiarDocumento(espacioId, plantilla) {
      doc.guardarYa && doc.guardarYa();
      try {
        const r = await api.post(`/api/documentos/${docId}/copia`, { espacioId, plantilla: !!plantilla });
        aviso(plantilla ? "Guardado en las plantillas del espacio: sale al crear un documento nuevo" : `Copia creada: “${r.nombre}”`, { tipo: "ok", ms: 6000, accion: plantilla ? null : { texto: "Abrir", fn: () => (location.hash = "#/doc/" + r.id) } });
      } catch (e) { aviso(e.message, { tipo: "error" }); }
    }
    function otroEspacio(ev) {
      const otros = (NOM.app.espacios || []).filter((x) => x.id !== ed.espacio.id && x.permiso !== "LECTURA");
      const ancla = (ev && ev.currentTarget) || $("[data-a=mas]", vista);
      NOM.menu(ancla, [
        ...(ed.soloLectura ? [] : [{ titulo: "Mover a…" }, ...otros.map((x) => ({ texto: x.nombre, icono: "folder-input", fn: async () => {
          if (!(await confirmar("Mover a otro espacio", `El documento pasará a ${x.nombre}: lo verán sus miembros y dejará de estar en ${ed.espacio.nombre}.`, { si: "Mover" }))) return;
          try { await api.put(`/api/documentos/${docId}/espacio`, { espacioId: x.id }); aviso(`Movido a ${x.nombre}`, { tipo: "ok" }); window.dispatchEvent(new HashChangeEvent("hashchange")); } catch (e) { aviso(e.message, { tipo: "error" }); }
        } })), "-"]),
        { titulo: "Copiar a…" }, ...otros.map((x) => ({ texto: x.nombre, icono: "copy-plus", fn: () => copiarDocumento(x.id) })),
      ]);
    }
    /** La raíz del hilo de un comentario (las respuestas se abren en su hilo). */
    function raizDe(id) {
      const c = id && doc.bloque(id);
      return c && c.padre ? c.padre : id || null;
    }

    // Acciones de este documento para la paleta de comandos (Ctrl+K).
    ed.acciones = () => [
      ...(ed.soloLectura || enLocal ? [] : [{ texto: "Guardar versión", icono: "save", atajo: "Ctrl S", fn: guardarVersion, claves: "guardar" }]),
      ...(enLocal ? [] : [{ texto: "Historial y actividad", icono: "history", fn: historial, claves: "versiones restaurar" }]),
      Object.assign({ claves: "exportar office" }, descargarOffice),
      { texto: "Descargar en otro formato (PDF y más)…", icono: "file-down", fn: exportar, claves: "pdf html descargar exportar" },
      { texto: "Modo enfoque", icono: "scan-eye", atajo: "Ctrl .", fn: () => enfoque(true), claves: "concentrar pantalla completa" },
      ...(enLocal ? [] : [{ texto: "Compartir espacio", icono: "share-2", fn: () => NOM.vistaEspacios.accesos(ed.espacio), claves: "invitar accesos" }]),
      ...(enLocal ? [] : [{ texto: "Recibo de mi trabajo", icono: "shield-check", fn: () => NOM.recibo.mostrar(ed), claves: "prueba autoria tecleado pegado hash" }]),
      ...(enLocal ? [] : [{ texto: "Comentarios", icono: "message-square", fn: () => NOM.comentarios && NOM.comentarios.abrir(ed), claves: "notas sugerencias revisar" }]),
      ...(ed.cambiosVisita ? [{ texto: ed.resaltando ? "Quitar el resaltado de cambios" : "Resaltar lo que cambió desde mi última visita", icono: "sparkles", fn: () => resaltarCambios(!ed.resaltando), claves: "cambios nuevo visita" }] : []),
      ...(ed.esPropietario ? [
        { texto: ed.protegido ? "Quitar la protección contra el borrado" : "Proteger contra el borrado", icono: "lock", fn: () => proteger(!ed.protegido), claves: "no borrar proteger" },
        { texto: "Entrega con fecha límite…", icono: "calendar", fn: dialogoEntrega, claves: "tarea fecha limite entrega" },
      ] : []),
      ...((ed.modoApi && ed.modoApi.acciones) ? ed.modoApi.acciones(ed) : []),
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
    pintarAvisos();
    if (ed.cambiosVisita) setTimeout(() => resaltarCambios(true), 300);
    if (!enLocal && NOM.comentarios) NOM.comentarios.montar(ed);
    // 8.5 Desde un aviso de mención: se abre el hilo del comentario.
    const enfocarComentario = (location.hash.match(/[?&]comentario=([^&]+)/) || [])[1];
    if (enfocarComentario && NOM.comentarios && !enLocal) setTimeout(() => { if (doc.bloque(raizDe(decodeURIComponent(enfocarComentario)))) NOM.comentarios.abrir(ed, raizDe(decodeURIComponent(enfocarComentario))); }, 400);
    if (NOM.alAbrirEditor) NOM.alAbrirEditor(ed, tipo);

    // 3.4 Al irse, se avisa al servidor: lo que escriban otros desde aquí sí será "cambios desde tu visita".
    const avisarSalida = (alCerrarPestana) => {
      if (enLocal || !api.token()) return;
      const url = api.servidor() + `/api/documentos/${docId}/presencia`, cuerpo = JSON.stringify({ cliente: doc.nodo, salir: true });
      if (alCerrarPestana) {
        try { fetch(url, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", Authorization: "Bearer " + api.token() }, body: cuerpo }).catch(() => {}); } catch (e) { /* sin red */ }
      } else api.post(`/api/documentos/${docId}/presencia`, { cliente: doc.nodo, salir: true }).catch(() => {});
    };
    const alOcultarPagina = () => avisarSalida(true);
    addEventListener("pagehide", alOcultarPagina);

    return () => {
      clearTimeout(tEntrega);
      if (quitarRedDestino) quitarRedDestino();
      // Parte C: al salir del documento creado sin Internet, si ya hay red, se sube solo.
      if (ed.destino && api.enLinea && NOM.cola) setTimeout(() => NOM.cola.vaciar().catch(() => {}), 400);
      removeEventListener("pagehide", alOcultarPagina);
      document.removeEventListener("keydown", teclas);
      document.removeEventListener("fullscreenchange", alSalirPantalla);
      if (ed.modoApi && ed.modoApi.desmontar) ed.modoApi.desmontar();
      canal && canal.cerrar();
      avisarSalida(false);
      // A6: al terminar de editar se guarda una versión (si hubo cambios enviados en esta sesión).
      if (doc.ultimoEnvio && !ed.soloLectura) {
        doc.enviar().finally(() => api.post(`/api/documentos/${docId}/versiones`, { etiqueta: "Al cerrar" }).catch(() => {}));
      }
      doc.cerrar();
    };
  }

  NOM.editor = { abrir };
})();
