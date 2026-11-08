/* NOM-COLAB · Unirse sin Internet (2.1, 2.2 y 2.3).
   El propietario crea un enlace para su espacio: caduca solo (1 hora a 30 días), se puede revocar y
   puede dejar entrar con apodo, sin registrarse (modo salón). Se comparte como código QR con la
   dirección del equipo que comparte: http://<ip-local>:<puerto>/unirse?c=<código>.
   - Con la cámara del sistema basta: abre la dirección en el navegador y se entra.
   - En la app hay un botón "Escanear QR" (cámara dentro de la app); el espacio se abre en la app.
   - Sin cámara: se escribe el código de 8 letras. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso, hoja, confirmar } = NOM;
  const api = () => NOM.api;
  const PERMISO = { EDICION: "Puede editar", LECTURA: "Solo puede ver" };
  const PENDIENTE = "nom.unirse.pendiente";

  const limpiarCodigo = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  /** Lo que trae un QR o lo que se escribió: { tipo: "unirse"|"proyectar", codigo, origen? } */
  function leer(texto) {
    const t = String(texto || "").trim();
    try {
      const u = new URL(t);
      if (/^https?:$/.test(u.protocol)) {
        const m = /\/(unirse|proyectar)\/?$/.exec(u.pathname);
        const c = u.searchParams.get("c") || (/#\/(unirse|proyectar)\/([^/?]+)/.exec(u.hash) || [])[2];
        const tipo = m ? m[1] : (/#\/(unirse|proyectar)\//.exec(u.hash) || [])[1];
        if (tipo && c) return { tipo, codigo: limpiarCodigo(c), origen: u.origin, url: u.href };
        return { tipo: null, origen: u.origin, url: u.href };
      }
    } catch (e) { /* no es una dirección: es el código */ }
    const c = limpiarCodigo(t);
    return { tipo: c.length === 6 ? "proyectar" : "unirse", codigo: c };
  }
  const validar = (texto) => {
    const r = leer(texto);
    if (r.tipo && r.codigo && r.codigo.length >= 6) return null;
    return r.origen ? "Ese código QR no es de un espacio de NOM-COLAB" : "El código tiene 8 letras y números (6 si es para proyectar)";
  };

  /** Lleva a unirse (o a proyectar) con lo que trae un QR o un código, cambiando de servidor si hace falta. */
  async function usar(texto) {
    const r = leer(texto);
    if (!r.tipo || !r.codigo) return aviso("Ese código QR no es de un espacio de NOM-COLAB", { tipo: "error" });
    if (api().empaquetada) {
      if (r.origen && r.origen !== api().servidor()) {
        if (api().token() && !(await confirmar("Otro lugar", `Ese código es de ${r.origen.replace(/^https?:\/\//, "")}. La app se conectará ahí (aquí se cierra tu sesión en este teléfono; tus documentos no se tocan).`, { si: "Conectar" }))) return;
        if (api().token()) { try { await NOM.boveda.cerrar(); } catch (e) { /* sin bóveda */ } api().limpiarSesion(); }
        api().fijarServidor(r.origen);
      }
    } else if (r.origen && r.origen !== location.origin) {
      location.href = r.url;
      return;
    }
    location.hash = `#/${r.tipo}/${encodeURIComponent(r.codigo)}`;
  }

  /** Botón "Escanear QR": cámara (o código a mano) y a unirse. */
  async function escanear() {
    const t = await NOM.qr.escanear({ titulo: "Escanear el QR del espacio", validar });
    if (t) usar(t);
  }

  /** Al abrir la página desde un QR (/unirse?c=… o /proyectar?c=…): se pasa a la ruta de la app. */
  function desdeDireccion() {
    const m = /\/(unirse|proyectar)\/?$/.exec(location.pathname);
    const c = new URLSearchParams(location.search).get("c");
    if (!m || (!c && m[1] !== "proyectar")) return false;
    const base = location.pathname.replace(/(unirse|proyectar)\/?$/, "");
    // Sin código, /proyectar abre la pantalla para escribirlo.
    history.replaceState(null, "", base + (c ? `#/${m[1]}/${encodeURIComponent(limpiarCodigo(c))}` : "#/proyectar"));
    return true;
  }

  /** Tras iniciar sesión: si venía de un enlace, se regresa a él. */
  function pendiente() {
    const c = NOM.leer(PENDIENTE, null);
    if (!c) return false;
    NOM.quitar(PENDIENTE);
    location.hash = "#/unirse/" + encodeURIComponent(c);
    return true;
  }

  /** Secreto de este dispositivo para la bóveda de un invitado (no tiene contraseña). */
  function secretoInvitado(uid) {
    const k = "nom.inv." + uid;
    let s = NOM.leer(k, null);
    if (!s) { s = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join(""); NOM.guardar(k, s); }
    return s;
  }

  // ================================================================== pantalla /#/unirse/<código>
  async function pantalla(raiz, codigo) {
    codigo = limpiarCodigo(codigo);
    raiz.innerHTML = `<main class="union"><section class="union-tarjeta clay" data-t><div class="esqueleto" style="height:180px"></div></section></main>`;
    const t = $("[data-t]", raiz);
    let info;
    try {
      if (api().empaquetada && !api().servidor()) throw Object.assign(new Error("Primero elige dónde trabaja tu equipo (o escanea su QR)."), { estado: 0 });
      info = await api().get(`/api/enlaces/${encodeURIComponent(codigo)}`, undefined, { sin401: true });
    } catch (e) {
      t.innerHTML = `<div class="col" style="align-items:center;text-align:center">
        <div class="burbuja">${ico(e.red ? "wifi-off" : "triangle-alert")}</div>
        <h2>${e.red ? "No hay conexión" : "No se puede entrar"}</h2>
        <p class="suave" style="font-weight:650">${esc(e.red ? "Revisa que estés en la misma red Wi-Fi que el equipo que comparte (o conectado a su punto de acceso)." : e.message)}</p>
        <div class="fila" style="flex-wrap:wrap;justify-content:center"><a class="btn" href="#/">Ir al inicio</a>${NOM.qr.hayCamara() ? `<button class="btn primario" data-esc>${ico("qr-code")} Escanear otro</button>` : ""}</div></div>`;
      const b = $("[data-esc]", t); if (b) b.onclick = escanear;
      return () => {};
    }
    const conSesion = !!api().token();
    const u = api().usuario() || {};
    t.innerHTML = `<div class="col">
      <div class="fila" style="gap:14px;align-items:center">
        <span class="icono-espacio grande" style="background:${esc(info.color || "#7AA7FF")}">${esc((info.espacio || "?").trim()[0].toUpperCase())}</span>
        <div class="crece"><span class="etiqueta">Te invitan a</span><h2 style="margin-top:2px">${esc(info.espacio)}</h2>
          <span class="suave chico" style="font-weight:700">de ${esc(info.propietario)} · ${esc(PERMISO[info.permiso] || info.permiso)} · el código sirve hasta el ${esc(new Date(info.caduca).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</span></div>
      </div>
      <div class="alerta error" data-err hidden></div>
      ${conSesion ? `<button class="btn primario ancho" data-entrar>${ico("log-in")} Entrar como ${esc(u.nombre || "")}</button>
        <p class="suave chico" style="text-align:center">¿No eres tú? <a href="#" data-otra>Usar otra cuenta</a></p>`
      : `${info.invitados ? `<form class="col" data-apodo>
          <div class="campo"><label for="ap">Tu apodo</label><div class="entrada">${ico("users")}<input id="ap" name="apodo" maxlength="16" autocomplete="nickname" placeholder="Así te verán los demás" required></div>
          <div class="ayuda">Sin registrarte: entras solo a este espacio y desde este celular o computadora.</div></div>
          <button class="btn primario ancho">${ico("arrow-right")} Entrar con apodo</button></form>
        <div class="fila" style="gap:10px;color:var(--tinta-suave);font-size:13px;font-weight:700"><span style="flex:1;height:1px;background:var(--borde-fuerte)"></span>o con tu cuenta<span style="flex:1;height:1px;background:var(--borde-fuerte)"></span></div>` : ""}
        <div class="fila"><button class="btn crece" data-cuenta="entrar">${ico("log-in")} Iniciar sesión</button><button class="btn crece ${info.invitados ? "" : "primario"}" data-cuenta="registro">${ico("user-plus")} Crear cuenta</button></div>`}
    </div>`;
    const err = $("[data-err]", t);
    const mostrarError = (e) => { err.hidden = false; err.innerHTML = `${ico("triangle-alert")}<span>${esc(e.message)}</span>`; };
    const entrar = $("[data-entrar]", t);
    if (entrar) entrar.onclick = async () => {
      entrar.disabled = true;
      try {
        const esp = await api().post(`/api/enlaces/${encodeURIComponent(codigo)}/entrar`);
        aviso(`Ya estás en ${esp.nombre}`, { tipo: "ok" });
        location.hash = "#/espacio/" + esp.id;
      } catch (e) { entrar.disabled = false; mostrarError(e); }
    };
    const otra = $("[data-otra]", t);
    if (otra) otra.onclick = async (e) => { e.preventDefault(); NOM.guardar(PENDIENTE, codigo); await NOM.app.cerrarSesion(true); };
    $$("[data-cuenta]", t).forEach((b) => (b.onclick = () => { NOM.guardar(PENDIENTE, codigo); NOM.app.irACuentas(b.dataset.cuenta); }));
    const f = $("[data-apodo]", t);
    if (f) {
      f.onsubmit = async (e) => {
        e.preventDefault();
        const apodo = f.apodo.value.trim();
        if (!apodo) return f.apodo.focus();
        const b = $("button", f);
        b.disabled = true;
        try {
          const r = await api().post(`/api/enlaces/${encodeURIComponent(codigo)}/invitado`, { apodo }, { sin401: true });
          api().fijarSesion(r.token, r.usuario);
          try { await NOM.boveda.abrir(r.usuario.id, secretoInvitado(r.usuario.id)); } catch (x) { console.warn(x); }
          NOM.aplicarPreferencias(r.preferencias);
          if (NOM.bienvenida) NOM.bienvenida(r.usuario, true);
          NOM.app.alIniciarSesion(r);
          setTimeout(() => (location.hash = "#/espacio/" + r.espacio.id), 0);
        } catch (x) { b.disabled = false; mostrarError(x); }
      };
      setTimeout(() => f.apodo.focus(), 40);
    }
    return () => {};
  }

  // ================================================================== el propietario invita con QR
  /** Direcciones por las que los demás llegan a este servidor (la primera es la recomendada). */
  function bases(conexion) {
    const l = [];
    if (api().empaquetada) {
      const s = api().servidor();
      if (s && !/\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(s)) l.push(s);
    } else if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) l.push(location.origin);
    if (api().lan !== false) {
      (conexion && conexion.direcciones || []).forEach((ip) => l.push(`http://${ip}:${conexion.puerto}`));
      // El teléfono como servidor: sus direcciones en el Wi-Fi o en su punto de acceso.
      if (NOM.anfitrion && NOM.anfitrion.esLocal && NOM.anfitrion.esLocal()) (NOM.anfitrion.estado().direcciones || []).forEach((d) => l.push(d));
    }
    return [...new Set(l)];
  }
  const urlDe = (base, codigo) => `${base}/unirse?c=${codigo}`;

  function tarjetaQr(cont, enlace, conexion, esp) {
    const bs = bases(conexion);
    let base = bs[0] || "";
    const pintar = () => {
      const url = base ? urlDe(base, enlace.codigo) : "";
      cont.innerHTML = `<div class="qr-tarjeta">
        <div class="qr-caja">${url ? NOM.qr.svg(url, { titulo: "Código QR para unirse a " + (esp.nombre || "") }) : `<div class="qr-sin">${ico("wifi-off")}</div>`}</div>
        <div class="col" style="gap:8px;min-width:0">
          <span class="etiqueta">Código</span><b class="qr-codigo">${esc(enlace.codigo.slice(0, 4))}-${esc(enlace.codigo.slice(4))}</b>
          <span class="suave chico" style="font-weight:700">${esc(PERMISO[enlace.permiso] || "")}${enlace.invitados ? " · con apodo, sin cuenta" : ""} · hasta ${esc(new Date(enlace.caduca).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</span>
          ${bs.length > 1 ? `<select class="mini-select" data-base aria-label="Dirección">${bs.map((b) => `<option ${b === base ? "selected" : ""}>${esc(b.replace(/^https?:\/\//, ""))}</option>`).join("")}</select>` : url ? `<span class="chico qr-url">${esc(url)}</span>` : ""}
          ${url ? "" : `<div class="alerta aviso chico">${ico("wifi-off")}<span>${api().lan === false
            ? "Para que el QR funcione, abre NOM-COLAB con la dirección que usan los demás (la de Internet). Mientras, el código sí sirve escrito a mano."
            : "Este equipo no está en ninguna red. Conecta el Wi-Fi (o el punto de acceso del teléfono) y vuelve a abrir esto. El código sí sirve escrito a mano."}</span></div>`}
          <div class="fila" style="flex-wrap:wrap">
            ${url ? `<button class="btn chico" data-copiar>${ico("copy", "ico-s")} Copiar</button><button class="btn chico" data-compartir>${ico("share-2", "ico-s")} Compartir</button>` : ""}
            <button class="btn chico primario" data-grande>${ico("maximize-2", "ico-s")} En grande</button>
          </div>
        </div></div>`;
      const s = $("[data-base]", cont);
      if (s) s.onchange = () => { base = bs[s.selectedIndex]; pintar(); };
      const c = $("[data-copiar]", cont);
      if (c) c.onclick = () => { try { navigator.clipboard.writeText(url).then(() => aviso("Dirección copiada", { tipo: "ok" })); } catch (e) { aviso(url); } };
      const sh = $("[data-compartir]", cont);
      if (sh) sh.onclick = () => {
        const t = `Únete a "${esp.nombre}" en NOM-COLAB: ${url}\n(Código: ${enlace.codigo}. Hay que estar en la misma red Wi-Fi.)`;
        if (window.NomAndroid && window.NomAndroid.compartirTexto) window.NomAndroid.compartirTexto(t);
        else if (navigator.share) navigator.share({ title: "NOM-COLAB", text: t }).catch(() => {});
        else { try { navigator.clipboard.writeText(t); aviso("Invitación copiada", { tipo: "ok" }); } catch (e) { aviso(t); } }
      };
      $("[data-grande]", cont).onclick = () => grande(url, enlace.codigo, esp.nombre);
    };
    pintar();
  }

  /** El QR en pantalla completa, para proyectarlo en el salón. */
  function grande(url, codigo, titulo) {
    const capa = html(`<div class="qr-grande" role="dialog" aria-label="Código QR">
      <button class="icono-btn qr-grande-x" aria-label="Cerrar">${ico("x")}</button>
      <h2>${esc(titulo || "Únete")}</h2>
      ${url ? NOM.qr.svg(url, { titulo: "Código QR" }) : ""}
      <b class="qr-codigo">${esc(codigo.slice(0, 4))}-${esc(codigo.slice(4))}</b>
      <p>${url ? `Escanéalo con la cámara, o abre <b>${esc(url.replace(/^https?:\/\//, "").replace(/\/unirse.*$/, ""))}</b> y escribe el código.` : "Escribe el código en NOM-COLAB → Unirse."}</p></div>`);
    document.body.append(capa);
    const cerrar = () => { capa.remove(); document.removeEventListener("keydown", tecla, true); };
    const tecla = (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    document.addEventListener("keydown", tecla, true);
    $(".qr-grande-x", capa).onclick = cerrar;
    if (capa.requestFullscreen && matchMedia("(hover: hover)").matches) capa.requestFullscreen().catch(() => {});
  }

  async function invitar(esp) {
    const cuerpo = html(`<div class="col">
      <p class="suave" style="font-weight:650">Quien escanee este código (o escriba sus 8 letras) entra a <b>${esc(esp.nombre)}</b> directo, sin pedirte permiso. Funciona aunque no haya Internet, si están en el mismo Wi-Fi.</p>
      <div class="segmentado lleno" role="group" aria-label="Permiso" data-permiso>
        <button type="button" data-p="EDICION" aria-pressed="true">${ico("pencil", "ico-s")} Puede editar</button>
        <button type="button" data-p="LECTURA" aria-pressed="false">${ico("eye", "ico-s")} Solo ver</button></div>
      <div class="campo"><label for="qh">El código sirve durante</label><div class="entrada"><select id="qh" data-horas>
        <option value="1">1 hora (una clase)</option><option value="24" selected>1 día</option><option value="168">1 semana</option><option value="720">30 días</option></select></div></div>
      <label class="lista-item">${ico("users")}<span class="crece"><b>Dejar entrar sin cuenta</b><small>Cada quien escribe un apodo y entra solo a este espacio, desde ese celular o esa computadora. Ideal para una clase.</small></span>
        <span class="interruptor"><input type="checkbox" data-invitados><span></span></span></label>
      <button class="btn primario" data-crear>${ico("qr-code")} Crear el código</button>
      <div data-qr></div>
      <div class="col" data-vigentes></div>
    </div>`);
    hoja({ titulo: "Código de invitación", icono: "qr-code", cuerpo, ancha: true });
    let permiso = "EDICION";
    $$("[data-p]", cuerpo).forEach((b) => (b.onclick = () => { permiso = b.dataset.p; $$("[data-p]", cuerpo).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
    const lista = $("[data-vigentes]", cuerpo);
    function pintarLista(d) {
      const ls = (d.enlaces || []).slice(0, 12);
      lista.innerHTML = ls.length ? `<span class="etiqueta">Códigos que ya creaste</span><div class="lista">${ls.map((x) => `
        <div class="lista-item"><span class="crece"><b style="font-family:var(--mono)">${esc(x.codigo.slice(0, 4))}-${esc(x.codigo.slice(4))}</b>
          <small>${esc(PERMISO[x.permiso] || "")}${x.invitados ? " · con apodo" : ""} · ${x.estado === "vigente" ? "hasta " + esc(new Date(x.caduca).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) : x.estado === "revocado" ? "anulado" : "venció"} · ${x.usos} ${x.usos === 1 ? "uso" : "usos"}</small></span>
          ${x.estado === "vigente" ? `<button class="btn chico" data-ver="${esc(x.codigo)}">${ico("qr-code", "ico-s")} Ver</button><button class="btn chico peligro" data-revocar="${esc(x.codigo)}">Anular</button>` : `<span class="chip">${x.estado === "revocado" ? "Anulado" : "Venció"}</span>`}
        </div>`).join("")}</div>` : "";
      $$("[data-ver]", lista).forEach((b) => (b.onclick = () => tarjetaQr($("[data-qr]", cuerpo), ls.find((x) => x.codigo === b.dataset.ver), d.conexion, esp)));
      $$("[data-revocar]", lista).forEach((b) => (b.onclick = async () => {
        if (!(await confirmar("Anular el código", "Nadie más podrá entrar con ese código. Quienes ya entraron siguen dentro (si quieres, quítalos en Invitar → Miembros).", { si: "Anular", peligro: true }))) return;
        try { pintarLista(await api().delete(`/api/espacios/${esp.id}/enlaces/${b.dataset.revocar}`)); $("[data-qr]", cuerpo).innerHTML = ""; aviso("Código anulado", { tipo: "ok" }); } catch (e) { aviso(e.message, { tipo: "error" }); }
      }));
    }
    $("[data-crear]", cuerpo).onclick = async (ev) => {
      const b = ev.currentTarget;
      b.disabled = true;
      try {
        const x = await api().post(`/api/espacios/${esp.id}/enlaces`, { permiso, horas: +$("[data-horas]", cuerpo).value, invitados: $("[data-invitados]", cuerpo).checked });
        tarjetaQr($("[data-qr]", cuerpo), x, x.conexion, esp);
        pintarLista(await api().get(`/api/espacios/${esp.id}/enlaces`));
        if (NOM.hito) NOM.hito("qr");
      } catch (e) { aviso(e.message, { tipo: "error" }); }
      b.disabled = false;
    };
    try { const d = await api().get(`/api/espacios/${esp.id}/enlaces`); if (!lista.childElementCount) pintarLista(d); } catch (e) { /* sin lista */ }
  }

  NOM.union = { leer, usar, escanear, desdeDireccion, pendiente, pantalla, invitar, grande, bases, limpiarCodigo };
})();
