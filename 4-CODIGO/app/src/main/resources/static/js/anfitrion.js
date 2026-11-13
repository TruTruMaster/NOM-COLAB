/* NOM-COLAB · El teléfono como servidor (solo en la app Android).
   La app trae el mismo servidor que la computadora: cuentas, espacios, documentos en tiempo real,
   versiones y la página web para los demás. Al encenderlo, este teléfono se conecta a sí mismo
   (127.0.0.1) y los demás equipos entran por su dirección en el Wi-Fi —o en el punto de acceso
   del teléfono, sin router ni Internet— desde la app ("Buscar en la red") o desde el navegador. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso } = NOM;
  const api = () => NOM.api;

  const disponible = () => !!(window.NomAndroid && window.NomAndroid.iniciarServidor);
  const leer = (t) => { try { return JSON.parse(t || "{}"); } catch (e) { return {}; } };
  const estado = () => (disponible() ? leer(window.NomAndroid.estadoServidor()) : { activo: false });
  /** La app está usando el servidor de este mismo teléfono. */
  const esLocal = () => /^http:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(api().servidor() || "");
  const direccion = (e) => (e.direcciones && e.direcciones[0]) || "";

  /** Enciende el servidor; si conectar, la app pasa a usarlo. Devuelve el estado. */
  function encender(conectar) {
    if (!disponible()) throw new Error("Esta opción solo está en la app Android");
    const e = leer(window.NomAndroid.iniciarServidor());
    if (!e.activo) throw new Error(e.error || "No se pudo empezar a compartir desde este teléfono");
    if (conectar) api().fijarServidor(e.local);
    return e;
  }

  function detener() {
    if (!disponible()) return;
    window.NomAndroid.detenerServidor();
  }

  function compartir(dir) {
    const t = `Entra a NOM-COLAB en mi teléfono: ${dir}\n(Con la app: "¿Dónde trabaja tu equipo?" → "Buscar en este Wi-Fi". En la computadora: abre la dirección en el navegador; hay que estar en el mismo Wi-Fi.)`;
    if (window.NomAndroid && window.NomAndroid.compartirTexto) window.NomAndroid.compartirTexto(t);
    else NOM.copiarConAviso(dir, "Dirección copiada");
  }

  /** Al abrir la app: si el teléfono era el servidor y Android lo cerró (o se reinició), se enciende. */
  function reanudar() {
    if (!disponible() || !esLocal()) return;
    try { if (!estado().activo) encender(false); } catch (e) { console.error(e); }
  }

  /** Opción grande en "¿Dónde trabaja tu equipo?". */
  function opcion(alListo) {
    if (!disponible()) return null;
    const el = html(`<div class="anfitrion-opcion">
      <span class="anfitrion-icono">${ico("smartphone")}</span>
      <div class="crece"><b>Compartir desde este teléfono</b>
        <small>Para trabajar sin Internet: los demás se conectan a este teléfono por el mismo Wi-Fi (o por su punto de acceso) y los documentos se guardan aquí.</small></div>
      <button type="button" class="btn primario chico">${ico("power", "ico-s")} Encender</button></div>`);
    $("button", el).onclick = () => {
      const b = $("button", el);
      b.disabled = true; b.innerHTML = `<span class="cargando"></span>`;
      setTimeout(() => {
        try {
          const e = encender(true);
          aviso(direccion(e) ? `Listo: los demás entran en ${direccion(e)}` : "Listo. Conecta el Wi-Fi (o activa el punto de acceso) para que los demás entren.", { tipo: "ok", ms: 6000 });
          alListo();
        } catch (err) {
          aviso(err.message, { tipo: "error", ms: 6000 });
          b.disabled = false; b.innerHTML = `${ico("power", "ico-s")} Encender`;
        }
      }, 30);
    };
    return el;
  }

  /** Línea al pie de "Entrar" cuando el servidor es este teléfono. */
  function pie() {
    if (!disponible() || !esLocal()) return null;
    const e = estado(), dir = direccion(e);
    const el = html(`<div class="anfitrion-pie">${ico("smartphone", "ico-s")}<span><b>Este teléfono comparte</b>${dir ? ` · los demás entran en <b>${esc(dir.replace(/^http:\/\//, ""))}</b>` : " · conecta el Wi-Fi para que entren"}</span>
      ${dir ? `<button type="button" data-compartir>Compartir</button>` : ""}</div>`);
    const c = $("[data-compartir]", el);
    if (c) c.onclick = () => compartir(dir);
    return el;
  }

  /** Panel en "Este dispositivo": encender, apagar, direcciones para compartir. */
  function panel(cont) {
    if (!disponible()) return;
    const sec = html(`<section class="seccion anfitrion-panel"></section>`);
    cont.append(sec);
    function pintar() {
      const e = estado();
      const dirs = e.direcciones || [];
      sec.innerHTML = `<div class="fila-e"><h2>Trabajar sin Internet con este teléfono</h2><span class="chip ${e.activo ? "ok" : ""}">${e.activo ? `<span class="punto vivo"></span>Encendido` : "Apagado"}</span></div>
        <div class="clay anfitrion-caja">
          <p class="suave" style="font-weight:650">${e.activo
            ? `Listo: los demás pueden entrar si están en el mismo Wi-Fi que este teléfono (o conectados a su punto de acceso)${e.equipo ? `; lo verán como <b>${esc(e.equipo)}</b>` : ""}. Lo más fácil: invítalos con un código QR.`
            : "Este teléfono puede guardar las cuentas y los documentos de tu equipo para que trabajen juntos sin Internet y sin computadora. Mientras esté encendido verás un aviso arriba y gasta un poco más de batería."}</p>
          ${e.activo ? (dirs.length
            ? `<div class="lista">${dirs.map((d) => `<div class="lista-item"><span class="anfitrion-icono chico">${ico("wifi", "ico-s")}</span><span class="crece"><b style="font-family:var(--mono)">${esc(d.replace(/^http:\/\//, ""))}</b><small>${esc(d)}</small></span>
                <button class="icono-btn" data-qr-dir="${esc(d)}" aria-label="Mostrar QR" data-micro="Código QR|Quien lo escanea abre NOM-COLAB de este teléfono en su navegador.">${ico("qr-code")}</button>
                <button class="icono-btn" data-copiar="${esc(d)}" aria-label="Copiar" data-micro="Copiar dirección">${ico("copy")}</button>
                <button class="icono-btn" data-compartir="${esc(d)}" aria-label="Compartir" data-micro="Compartir dirección|WhatsApp, correo, Bluetooth…">${ico("share-2")}</button></div>`).join("")}</div>
               ${esLocal() && NOM.api.token() ? `<button class="btn primario" data-invitar>${ico("qr-code")} Invitar con código QR</button>` : ""}`
            : `<div class="alerta aviso">${ico("wifi-off")}<span>Falta el Wi-Fi: conéctate a uno, o activa el punto de acceso de este teléfono, para que los demás puedan entrar.</span></div>`) : ""}
          <div class="fila" style="flex-wrap:wrap">
            ${e.activo
              ? `${esLocal() ? "" : `<button class="btn" data-usar>${ico("log-in")} Entrar a sus espacios</button>`}<button class="btn peligro" data-apagar>${ico("power")} Apagar</button>`
              : `<button class="btn primario" data-encender>${ico("power")} Encender</button>`}
          </div>
          ${e.error ? `<div class="alerta error">${ico("triangle-alert")}<span>${esc(e.error)}</span></div>` : ""}
        </div>
        ${respaldosHtml()}`;
      $$("[data-qr-dir]", sec).forEach((b) => (b.onclick = () => qrDireccion(b.dataset.qrDir)));
      const inv = $("[data-invitar]", sec);
      if (inv) inv.onclick = invitarEspacio;
      const exp = $("[data-exportar]", sec);
      if (exp) exp.onclick = () => {
        exp.disabled = true; exp.innerHTML = `<span class="cargando"></span> Preparando…`;
        setTimeout(() => { const n = window.NomAndroid.exportarRespaldo(); exp.disabled = false; exp.innerHTML = `${ico("archive")} Descargar todo`; if (n) pintar(); }, 30);
      };
      $$("[data-copiar]", sec).forEach((b) => (b.onclick = () => NOM.copiarConAviso(b.dataset.copiar, "Dirección copiada")));
      $$("[data-compartir]", sec).forEach((b) => (b.onclick = () => compartir(b.dataset.compartir)));
      const enc = $("[data-encender]", sec);
      if (enc) enc.onclick = () => { try { encender(false); aviso("Listo: este teléfono ya comparte", { tipo: "ok" }); } catch (err) { aviso(err.message, { tipo: "error" }); } pintar(); };
      const usar = $("[data-usar]", sec);
      if (usar) usar.onclick = async () => {
        if (!(await NOM.confirmar("Entrar a los espacios de este teléfono", "La app se conectará a este teléfono. Tus espacios del otro lugar siguen ahí; para volver, elígelo al entrar.", { si: "Entrar" }))) return;
        // La sesión era del otro servidor: aquí se entra (o se crea la cuenta) de nuevo.
        api().limpiarSesion();
        api().fijarServidor(e.local);
        NOM.app.irACuentas("registro");
      };
      const apg = $("[data-apagar]", sec);
      if (apg) apg.onclick = async () => {
        if (!(await NOM.confirmar("Dejar de compartir", "Los demás dejarán de ver los espacios de este teléfono hasta que lo enciendas otra vez. Los documentos se quedan guardados aquí.", { si: "Apagar", peligro: true }))) return;
        const local = esLocal();
        detener();
        if (local) { api().limpiarSesion(); api().fijarServidor(""); NOM.app.irACuentas(); return; }
        setTimeout(pintar, 400);
      };
    }
    pintar();
  }

  /** QR con la dirección del teléfono: quien lo escanea abre NOM-COLAB en su navegador. */
  function qrDireccion(dir) {
    NOM.hoja({ titulo: "Entrar a este teléfono", icono: "qr-code", cuerpo: `<div class="col" style="align-items:center;text-align:center">
      <div class="qr-caja" style="width:min(280px,70vw)">${NOM.qr ? NOM.qr.svg(dir, { titulo: "QR para entrar a este teléfono" }) : ""}</div>
      <b style="font-family:var(--mono);font-size:18px">${esc(dir.replace(/^http:\/\//, ""))}</b>
      <p class="suave" style="font-weight:650">Hay que estar en el mismo Wi-Fi, o conectado al punto de acceso de este teléfono. Para entrar directo a un espacio, usa “Invitar a un espacio con QR”.</p></div>` });
  }
  /** El QR para unirse se crea por espacio: se elige cuál (de los que este teléfono comparte y son tuyos). */
  async function invitarEspacio() {
    let ls = [];
    try { ls = (await NOM.api.get("/api/espacios")).filter((x) => x.permiso === "PROPIETARIO"); } catch (e) { return aviso(e.message, { tipo: "error" }); }
    if (!ls.length) return aviso("Primero crea un espacio en este teléfono", { tipo: "info" });
    if (ls.length === 1) return NOM.union.invitar(ls[0]);
    const cuerpo = html(`<div class="lista">${ls.map((x, i) => `<button class="lista-item" data-i="${i}" style="text-align:left;width:100%"><span class="punto-color" style="background:${esc(x.color)}"></span><span class="crece"><b>${esc(x.nombre)}</b><small>${x.documentos} documento(s)</small></span>${ico("chevron-right")}</button>`).join("")}</div>`);
    const h = NOM.hoja({ titulo: "¿A qué espacio?", icono: "qr-code", cuerpo });
    $$("[data-i]", cuerpo).forEach((b) => (b.onclick = () => { h.cerrar(true); NOM.union.invitar(ls[+b.dataset.i]); }));
  }
  /** 6.4 Respaldos diarios del servidor de este teléfono (los últimos 7) y "Exportar todo". */
  function respaldosHtml() {
    if (!window.NomAndroid || !window.NomAndroid.respaldos) return "";
    let l = [];
    try { l = JSON.parse(window.NomAndroid.respaldos() || "[]"); } catch (e) { l = []; }
    return `<div class="clay anfitrion-caja" style="margin-top:12px">
      <div class="fila-e"><b>${ico("archive", "ico-s")} Copias de seguridad</b><button class="btn chico" data-exportar>${ico("archive")} Descargar todo</button></div>
      <p class="suave chico" style="font-weight:650">Una copia por día de todo (cuentas, espacios, documentos y versiones), se guardan las últimas 7 dentro de la app. “Exportar todo” guarda una copia de este momento en Descargas.</p>
      ${l.length ? `<div class="lista">${l.map((r) => `<div class="lista-item">${ico("archive", "ico-s")}<span class="crece"><b>${esc(r.nombre)}</b><small>${esc(new Date(r.fecha).toLocaleString("es-MX"))} · ${esc(NOM.bytes(r.bytes))}</small></span></div>`).join("")}</div>` : `<p class="suave chico">Todavía no hay respaldos (el primero se hace en unos segundos con el servidor encendido).</p>`}</div>`;
  }

  NOM.anfitrion = { disponible, estado, esLocal, encender, detener, compartir, reanudar, opcion, pie, panel, qrDireccion };
})();
