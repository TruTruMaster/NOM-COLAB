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
    if (!e.activo) throw new Error(e.error || "No se pudo encender el servidor del teléfono");
    if (conectar) api().fijarServidor(e.local);
    return e;
  }

  function detener() {
    if (!disponible()) return;
    window.NomAndroid.detenerServidor();
  }

  function compartir(dir) {
    const t = `Entra a NOM-COLAB en mi teléfono: ${dir}\n(Con la app: "Conecta con tu red" → "Buscar en la red". En la computadora: abre la dirección en el navegador; hay que estar en el mismo Wi-Fi.)`;
    if (window.NomAndroid && window.NomAndroid.compartirTexto) window.NomAndroid.compartirTexto(t);
    else if (navigator.clipboard) navigator.clipboard.writeText(dir).then(() => aviso("Dirección copiada", { tipo: "ok" }));
  }

  /** Al abrir la app: si el teléfono era el servidor y Android lo cerró (o se reinició), se enciende. */
  function reanudar() {
    if (!disponible() || !esLocal()) return;
    try { if (!estado().activo) encender(false); } catch (e) { console.error(e); }
  }

  /** Opción grande en "Conecta con tu red". */
  function opcion(alListo) {
    if (!disponible()) return null;
    const el = html(`<div class="anfitrion-opcion">
      <span class="anfitrion-icono">${ico("smartphone")}</span>
      <div class="crece"><b>Usar este teléfono como servidor</b>
        <small>Tu equipo se conecta a este teléfono por el Wi-Fi —o por su punto de acceso—, sin computadora ni Internet. Los documentos se guardan aquí.</small></div>
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
    const el = html(`<div class="anfitrion-pie">${ico("smartphone", "ico-s")}<span><b>Este teléfono es el servidor</b>${dir ? ` · los demás entran en <b>${esc(dir.replace(/^http:\/\//, ""))}</b>` : " · conecta el Wi-Fi para compartir"}</span>
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
      sec.innerHTML = `<div class="fila-e"><h2>Servidor en este teléfono</h2><span class="chip ${e.activo ? "ok" : ""}">${e.activo ? `<span class="punto vivo"></span>Encendido` : "Apagado"}</span></div>
        <div class="clay anfitrion-caja">
          <p class="suave" style="font-weight:650">${e.activo
            ? `Este teléfono comparte sus espacios en la red${e.equipo ? ` como <b>${esc(e.equipo)}</b>` : ""}. Desde otra app: "Conecta con tu red" → "Buscar en la red". Desde una computadora: abre la dirección en el navegador. Deben estar en el mismo Wi-Fi o conectados al punto de acceso de este teléfono.`
            : "Convierte este teléfono en el servidor de tu equipo: cuentas, espacios y documentos en tiempo real, guardados aquí, sin computadora ni Internet. Mientras esté encendido verás una notificación; gasta algo más de batería."}</p>
          ${e.activo ? (dirs.length
            ? `<div class="lista">${dirs.map((d) => `<div class="lista-item"><span class="anfitrion-icono chico">${ico("wifi", "ico-s")}</span><span class="crece"><b style="font-family:var(--mono)">${esc(d.replace(/^http:\/\//, ""))}</b><small>${esc(d)}</small></span>
                <button class="icono-btn" data-copiar="${esc(d)}" aria-label="Copiar" data-micro="Copiar dirección">${ico("copy")}</button>
                <button class="icono-btn" data-compartir="${esc(d)}" aria-label="Compartir" data-micro="Compartir dirección|WhatsApp, correo, Bluetooth…">${ico("share-2")}</button></div>`).join("")}</div>`
            : `<div class="alerta aviso">${ico("wifi-off")}<span>Sin red local: conecta el Wi-Fi o activa el punto de acceso del teléfono para que los demás entren.</span></div>`) : ""}
          <div class="fila" style="flex-wrap:wrap">
            ${e.activo
              ? `${esLocal() ? "" : `<button class="btn" data-usar>${ico("log-in")} Usarlo en esta app</button>`}<button class="btn peligro" data-apagar>${ico("power")} Apagar</button>`
              : `<button class="btn primario" data-encender>${ico("power")} Encender</button>`}
          </div>
          ${e.error ? `<div class="alerta error">${ico("triangle-alert")}<span>${esc(e.error)}</span></div>` : ""}
        </div>`;
      $$("[data-copiar]", sec).forEach((b) => (b.onclick = () => { try { navigator.clipboard.writeText(b.dataset.copiar); aviso("Dirección copiada", { tipo: "ok" }); } catch (x) { compartir(b.dataset.copiar); } }));
      $$("[data-compartir]", sec).forEach((b) => (b.onclick = () => compartir(b.dataset.compartir)));
      const enc = $("[data-encender]", sec);
      if (enc) enc.onclick = () => { try { encender(false); aviso("Servidor encendido", { tipo: "ok" }); } catch (err) { aviso(err.message, { tipo: "error" }); } pintar(); };
      const usar = $("[data-usar]", sec);
      if (usar) usar.onclick = async () => {
        if (!(await NOM.confirmar("Usar el servidor de este teléfono", "La app se conectará a este teléfono. Tus espacios en el otro servidor siguen ahí; para volver, elige ese servidor al entrar.", { si: "Cambiar" }))) return;
        // La sesión era del otro servidor: aquí se entra (o se crea la cuenta) de nuevo.
        api().limpiarSesion();
        api().fijarServidor(e.local);
        NOM.app.irACuentas("registro");
      };
      const apg = $("[data-apagar]", sec);
      if (apg) apg.onclick = async () => {
        if (!(await NOM.confirmar("Apagar el servidor", "Los demás dejarán de ver los espacios de este teléfono hasta que lo enciendas otra vez. Los documentos se quedan guardados aquí.", { si: "Apagar", peligro: true }))) return;
        const local = esLocal();
        detener();
        if (local) { api().limpiarSesion(); api().fijarServidor(""); NOM.app.irACuentas(); return; }
        setTimeout(pintar, 400);
      };
    }
    pintar();
  }

  NOM.anfitrion = { disponible, estado, esLocal, encender, detener, compartir, reanudar, opcion, pie, panel };
})();
