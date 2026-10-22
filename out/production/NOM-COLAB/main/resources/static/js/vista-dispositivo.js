/* NOM-COLAB · Archivos en este dispositivo.
   Qué documentos guarda este navegador (o la app), cuánto ocupan y qué cambios faltan por enviar.
   Hay tres tipos de datos locales:
   - nom.u.<cuenta>.doc.<id>   copia de un documento del servidor, para abrirlo sin red (se puede borrar: el servidor tiene el original)
   - nom.u.<cuenta>.cola.<id>  cambios hechos sin red que aún no llegan al servidor (NO se borran desde aquí)
   - nom.local.doc.<id>        documentos sin cuenta: la única copia que existe
   Las copias de otras cuentas que usaron este dispositivo no se muestran: solo se cuenta su tamaño. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, $, $$, api, aviso, confirmar, bytes, haceCuanto, MODOS } = { ...NOM, api: NOM.api };
  /** localStorage (ajustes y documentos sin cuenta) suele permitir unos 5 MB por página. */
  const LIMITE = 5 * 1024 * 1024;
  const pesoPlano = (k) => ((k.length + (localStorage.getItem(k) || "").length) * 2);   // UTF-16
  const leerPlano = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };

  /** Agrupa lo que NOM-COLAB guarda en este equipo: la bóveda cifrada de la cuenta y lo que hay en claro. */
  async function inventario() {
    const copias = new Map(), locales = [];
    let cifrado = 0, otros = 0;
    const pDoc = api.clave("doc."), pCola = api.clave("cola."), pLocal = api.clave("local.doc.");
    const copia = (id) => {
      if (!copias.has(id)) copias.set(id, { id, bytes: 0, pendientes: 0, nombre: null, modo: null, espacio: null, guardado: 0 });
      return copias.get(id);
    };
    // 1. Bóveda de la cuenta (cifrada): solo se puede leer con la sesión abierta.
    for (const k of NOM.boveda.claves(api.clave(""))) {
      const b = NOM.boveda.tam(k);
      cifrado += b;
      if (k.startsWith(pDoc)) {
        const c = copia(k.slice(pDoc.length)), v = NOM.leer(k, {}) || {};
        const d = (v.estado && v.estado.bloques && v.estado.bloques._doc) || {};
        const doc = (v.meta && v.meta.documento) || {};
        c.bytes += b;
        c.nombre = (d.nombre && d.nombre.v) || doc.nombre || "Documento";
        c.modo = (d.modo && d.modo.v) || doc.modo || "TEXTO";
        c.espacio = v.meta && v.meta.espacio && v.meta.espacio.nombre;
        c.guardado = v.guardado || 0;
      } else if (k.startsWith(pCola)) {
        const c = copia(k.slice(pCola.length));
        c.bytes += b;
        c.pendientes = (NOM.leer(k, []) || []).length;
      } else if (k.startsWith(pLocal)) {
        const id = k.slice(pLocal.length), meta = NOM.local.meta(id) || {};
        locales.push({ id, bytes: b, nombre: meta.nombre || "Documento", modo: meta.modo || "TEXTO", modificado: meta.modificado || 0, cifrado: true });
      }
    }
    // 2. En claro: ajustes de la app y documentos creados sin cuenta.
    let claves = [];
    try { for (let i = 0; i < localStorage.length; i++) claves.push(localStorage.key(i)); } catch (e) { claves = []; }
    for (const k of claves) {
      if (!k || !k.startsWith("nom.")) continue;
      const b = pesoPlano(k), m = k.match(/^nom\.local\.doc\.(.+)$/);
      if (m) {
        const meta = (leerPlano("nom.local.docs") || []).find((d) => d.id === m[1]) || {};
        locales.push({ id: m[1], bytes: b, nombre: meta.nombre || "Documento", modo: meta.modo || "TEXTO", modificado: meta.modificado || 0, cifrado: false });
      } else otros += b;
    }
    let ajenos = 0;
    try { ajenos = await NOM.boveda.ajenos(); } catch (e) { /* sin IndexedDB */ }
    const lista = [...copias.values()].sort((a, b) => b.guardado - a.guardado);
    return { total: cifrado + otros, cifrado, otros, ajenos, copias: lista, locales: locales.sort((a, b) => b.modificado - a.modificado) };
  }

  function fila(d, extra, acciones) {
    const m = MODOS[d.modo] || MODOS.TEXTO;
    return `<div class="lista-item modo-${esc(d.modo)}" data-id="${esc(d.id)}" style="flex-wrap:wrap">
      <span class="modo-insignia">${ico(m.icono)}</span>
      <span class="crece" style="min-width:160px"><b>${esc(d.nombre)}</b><small>${extra}</small></span>
      <span class="chip">${esc(bytes(d.bytes))}</span>
      <div class="fila">${acciones}</div>
    </div>`;
  }

  async function pintar(cont) {
    const inv = await inventario();
    const conCuenta = !!api.token();
    // Los documentos cifrados van en IndexedDB, cuyo límite lo decide el navegador (normalmente GB).
    let limite = LIMITE;
    try {
      if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); if (e && e.quota) limite = e.quota; }
    } catch (e) { /* no disponible */ }
    const cifradoCon = NOM.boveda.cifrado();
    const pct = Math.min(100, Math.round((inv.total / limite) * 100));
    const pendientes = inv.copias.reduce((n, c) => n + c.pendientes, 0);
    const liberables = inv.copias.filter((c) => !c.pendientes && c.guardado);

    cont.innerHTML = `
      <div class="encabezado">
        <div><h1>Archivos en este dispositivo</h1>
          <p class="sub">Lo que NOM-COLAB guarda en este ${api.empaquetada ? "teléfono" : "navegador"} y cuánto ocupa</p></div>
      </div>
      <section class="clay" style="padding:20px;display:flex;flex-direction:column;gap:12px">
        <div class="fila-e"><b style="font-size:20px">${esc(bytes(inv.total))} usados</b><span class="suave chico" style="font-weight:700">de ${esc(bytes(limite))} que permite este ${api.empaquetada ? "teléfono" : "navegador"}</span></div>
        <div style="height:12px;border-radius:999px;background:var(--sup-2);border:1px solid var(--borde);overflow:hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Espacio usado">
          <div style="height:100%;width:${Math.max(pct, 1)}%;background:${pct > 80 ? "var(--error)" : "var(--acento)"}"></div></div>
        <div class="fila" style="flex-wrap:wrap;gap:8px">
          <span class="chip">${ico("file-text", "ico-s")} ${inv.copias.length} ${inv.copias.length === 1 ? "copia" : "copias"} de documentos del servidor</span>
          <span class="chip">${ico("hard-drive", "ico-s")} ${inv.locales.length} solo en este equipo</span>
          <span class="chip ${pendientes ? "aviso" : "ok"}">${ico(pendientes ? "cloud-off" : "cloud", "ico-s")} ${pendientes ? pendientes + " cambio(s) sin enviar" : "Todo enviado"}</span>
          <span class="chip">${ico("settings", "ico-s")} ${esc(bytes(inv.otros))} de ajustes y sesión</span>
          ${inv.ajenos ? `<span class="chip" data-micro="Otras cuentas|Copias de otras cuentas que usaron este dispositivo. No se muestran ni se pueden abrir desde tu sesión.">${ico("users", "ico-s")} ${esc(bytes(inv.ajenos))} de otras cuentas</span>` : ""}
        </div>
        ${cifradoCon ? `<div class="alerta ok">${ico("lock")}<span>Tus documentos en este equipo están <b>cifrados</b> (${esc(cifradoCon)}) con una llave que solo se abre con tu contraseña. Otra cuenta, o alguien sin tu contraseña, no puede leerlos.</span></div>`
          : conCuenta ? "" : `<div class="alerta aviso">${ico("triangle-alert")}<span>Sin cuenta no hay cifrado: cualquiera que use este navegador puede abrir estos documentos.</span></div>`}
      </section>

      <section class="seccion">
        <div class="fila-e"><h2>Copias de documentos del servidor</h2>
          ${liberables.length ? `<button class="btn chico" data-a="liberar">${ico("refresh-cw", "ico-s")} Liberar ${esc(bytes(liberables.reduce((n, c) => n + c.bytes, 0)))}</button>` : ""}</div>
        <p class="suave chico" style="font-weight:650;margin-bottom:12px">El original vive en el servidor${conCuenta ? "" : " (inicia sesión para verlos)"}. Esta copia sirve para abrirlo sin red; si la borras, se vuelve a descargar al abrirlo.</p>
        <div class="lista">${inv.copias.map((c) => fila(c,
          `${esc(c.espacio || "Espacio")} · ${c.guardado ? "copia de " + esc(haceCuanto(c.guardado)) : "sin copia completa"}${c.pendientes ? ` · <b style="color:var(--aviso)">${c.pendientes} cambio(s) sin enviar</b>` : ""}`,
          `${conCuenta ? `<a class="btn chico" href="#/doc/${esc(c.id)}">Abrir</a>` : ""}
           ${c.pendientes ? "" : `<button class="btn chico" data-a="quitar">Quitar copia</button>`}`)).join("")
          || `<p class="suave chico" style="padding:4px 12px;font-weight:650">No hay copias guardadas.</p>`}</div>
      </section>

      <section class="seccion">
        <div class="fila-e"><h2>Solo en este equipo</h2></div>
        <p class="suave chico" style="font-weight:650;margin-bottom:12px">No están en ningún servidor. <b>Es la única copia:</b> si borras los datos del navegador se pierden, salvo que los descargues o los guardes en la nube o en un espacio.</p>
        <div class="lista">${inv.locales.map((d) => fila(d, `${d.cifrado ? "cifrado · " : "sin cifrar (sin cuenta) · "}modificado ${esc(haceCuanto(d.modificado))}`,
          `<a class="btn chico" href="#/local/${esc(d.id)}">Abrir</a>`)).join("")
          || `<p class="suave chico" style="padding:4px 12px;font-weight:650">No hay documentos solo en este equipo.</p>`}</div>
      </section>`;

    $$("[data-a=quitar]", cont).forEach((b) => (b.onclick = () => {
      const id = b.closest("[data-id]").dataset.id;
      NOM.quitar(api.clave("doc." + id));
      aviso("Copia quitada. El documento sigue en el servidor.", { tipo: "ok" });
      pintar(cont);
    }));
    const lib = $("[data-a=liberar]", cont);
    if (lib) lib.onclick = async () => {
      if (!(await confirmar("Liberar espacio", `Se quitan ${liberables.length} copia(s) que ya están en el servidor. Los cambios sin enviar no se tocan.`, { si: "Liberar" }))) return;
      liberables.forEach((c) => NOM.quitar(api.clave("doc." + c.id)));
      aviso("Espacio liberado", { tipo: "ok" });
      pintar(cont);
    };
  }

  NOM.vistaDispositivo = { pintar, inventario };
})();
