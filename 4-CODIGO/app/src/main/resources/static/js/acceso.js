/* NOM-COLAB · Entrar sin Internet (fase 13, parte A).
   - Con Internet hay cuenta (la de la nube, la misma en la app y en la página).
   - Quien NO tiene Internet no entra a ninguna cuenta: en el teléfono que comparte entra con un
     ALIAS al azar («Colibrí 37»), sin escribir nada. El alias se guarda en este equipo para ese
     espacio (al volver es el mismo); «Otro alias» da uno nuevo.
   - Quien SÍ tiene Internet conserva su cuenta aunque el teléfono no tenga: inicia sesión directo
     con la nube (https; la contraseña nunca pasa por el teléfono), la nube le da un PASE firmado de
     10 minutos y se lo presenta al teléfono, que revisa la firma con la llave que trae el APK.
   - El dueño del teléfono entra a su propio servidor con su alias de dueño (lo hace la app sola). */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, aviso, hoja } = NOM;
  const api = () => NOM.api;
  /** La nube de NOM-COLAB (la Raspberry): donde viven las cuentas. */
  const NUBE = "https://nomcolab.dpdns.org";
  NOM.NUBE = NUBE;
  /** Alias, invitados y cuentas que llegaron con un pase: no tienen contraseña aquí. */
  NOM.sinContrasena = (u) => !!(u && (u.invitado || u.alias || u.nube || u.retirada));
  /** Cómo se llama el tipo de cuenta, para el pie del menú. */
  NOM.tipoCuenta = (u) => !u ? "" : u.dueno ? "Dueño de este teléfono (alias)" : u.alias ? "Alias, sin cuenta" : u.invitado ? "Invitado (sin cuenta)" : u.nube ? "Tu cuenta de Internet (con pase)" : "";

  const azar = (n) => {
    const b = crypto.getRandomValues(new Uint8Array(n || 32));
    return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  // ------------------------------------------------------------ el servidor actual
  /** /api/red/info del servidor con el que se trabaja (se recuerda un rato). */
  let info = null, infoDe = null, infoCuando = 0;
  async function infoServidor(forzar) {
    const s = api().servidor() || location.origin;
    if (!forzar && info && infoDe === s && Date.now() - infoCuando < 60000) return info;
    info = await api().get("/api/red/info", undefined, { ms: 5000, sin401: true });
    infoDe = s; infoCuando = Date.now();
    try { NOM.guardar("nom.infoServidor", { servidor: s, telefono: !!info.telefono, cuentas: info.cuentas !== false, id: info.servidor }); } catch (e) { /* sin almacenamiento */ }
    return info;
  }
  /** Lo último que se supo del servidor actual, sin preguntar (puede ser null). */
  function infoGuardada() {
    const g = NOM.leer("nom.infoServidor", null), s = api().servidor() || location.origin;
    return g && g.servidor === s ? g : null;
  }
  /** ¿El servidor actual es un teléfono que comparte (sin cuentas con contraseña)? */
  const esTelefono = (i) => !!(i && (i.telefono || i.cuentas === false));

  // ------------------------------------------------------------ alias
  const claveAlias = (servidorId, espacioId) => "nom.alias." + servidorId + "." + (espacioId || "dueno");
  /** El alias que este equipo ya tiene en ese espacio de ese servidor: { id, llave, nombre } o null. */
  const aliasGuardado = (servidorId, espacioId) => NOM.leer(claveAlias(servidorId, espacioId), null);

  /** Secreto de este equipo para la bóveda de un alias (no tiene contraseña). */
  function secretoAlias(uid) {
    const k = "nom.inv." + uid;
    let s = NOM.leer(k, null);
    if (!s) { s = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join(""); NOM.guardar(k, s); }
    return s;
  }

  /** Abre la sesión que dio el servidor (alias, pase o dueño) en este equipo. */
  async function abrirSesion(r, secretoBoveda) {
    api().fijarSesion(r.token, r.usuario);
    try { await NOM.boveda.abrir(r.usuario.id, secretoBoveda || secretoAlias(r.usuario.id)); } catch (x) { console.warn(x); }
    NOM.aplicarPreferencias(r.preferencias);
  }

  /** Entra al espacio del código con un alias: el mismo de antes, o uno nuevo si pidió otro. */
  async function entrarConAlias(codigo, opc) {
    opc = opc || {};
    const i = await infoServidor();
    const viejo = opc.otro ? null : aliasGuardado(i.servidor, opc.espacioId);
    const llave = viejo && viejo.llave ? viejo.llave : azar(32);
    const r = await api().post(`/api/enlaces/${encodeURIComponent(codigo)}/alias`, viejo ? { id: viejo.id, llave } : { llave }, { sin401: true });
    NOM.guardar(claveAlias(i.servidor, r.espacio.id), { id: r.usuario.id, llave, nombre: r.usuario.nombre, espacio: r.espacio.nombre, t: Date.now() });
    await abrirSesion(r);
    return r;
  }

  /** Los alias que este equipo tiene en el servidor actual (para volver a entrar sin el código). */
  function aliasDeEsteServidor(servidorId) {
    const p = "nom.alias." + servidorId + ".";
    const r = [];
    try { Object.keys(localStorage).forEach((k) => { if (k.startsWith(p) && !k.endsWith(".dueno")) { const v = NOM.leer(k, null); if (v && v.id && v.llave) r.push(v); } }); } catch (e) { /* sin almacenamiento */ }
    return r.sort((a, b) => (b.t || 0) - (a.t || 0));
  }

  /** Volver a entrar con un alias guardado (aunque el código del espacio ya haya vencido). */
  async function volverConAlias(reg) {
    const r = await api().post("/api/cuentas/alias/entrar", { id: reg.id, llave: reg.llave }, { sin401: true });
    await abrirSesion(r);
    return r;
  }

  /** El dueño del teléfono entra a su propio servidor (solo en la app, desde el mismo teléfono). */
  async function entrarComoDueno() {
    const llave = window.NomAndroid && window.NomAndroid.llaveDueno ? window.NomAndroid.llaveDueno() : "";
    if (!llave) throw new Error("Solo la app de este teléfono puede entrar como su dueño");
    const r = await api().post("/api/cuentas/alias", { llave }, { sin401: true });
    await abrirSesion(r);
    if (r.espaciosRecibidos) aviso(`Tus ${r.espaciosRecibidos} espacio(s) de antes ahora son de tu alias de dueño (${r.usuario.nombre}). Lo escrito sigue a nombre de quien lo escribió.`, { tipo: "info", ms: 9000 });
    return r;
  }

  // ------------------------------------------------------------ la nube (cuenta y pase)
  /** La sesión de la nube que la app guardó al cambiarse a un teléfono (para pedir pases y volver). */
  const sesionNube = () => { const s = NOM.leer("nom.sesionNube", null); return s && s.token && s.usuario ? s : null; };
  /** Antes de que la app se conecte a otro servidor: si la sesión actual es de la nube, se guarda. */
  function guardarSesionNube() {
    const s = api().servidor(), t = api().token(), u = api().usuario();
    if (!api().empaquetada || !t || !u || !/^https:\/\//i.test(s || "")) return false;
    NOM.guardar("nom.sesionNube", { servidor: s, token: t, usuario: u, t: Date.now() });
    return true;
  }
  const olvidarSesionNube = () => NOM.quitar("nom.sesionNube");

  /** Pide algo a la nube directamente (no al servidor actual). */
  async function aNube(metodo, ruta, cuerpo, token) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
    const cab = { Accept: "application/json" };
    if (cuerpo !== undefined) cab["Content-Type"] = "application/json";
    if (token) cab.Authorization = "Bearer " + token;
    let r;
    try { r = await fetch(NUBE + ruta, { method: metodo, headers: cab, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: ctl.signal, cache: "no-store" }); }
    catch (e) { throw new (api().ErrorApi)(0, { error: "No se pudo llegar a NOM-COLAB en Internet desde este equipo" }); }
    finally { clearTimeout(t); }
    let d = null;
    try { d = await r.json(); } catch (e) { d = null; }
    if (!r.ok) throw new (api().ErrorApi)(r.status, d);
    return d;
  }

  /** ¿Este equipo llega a la nube ahora? (una petición corta; se recuerda 30 s) */
  let alcance = null;
  async function nubeAlcanzable() {
    if (alcance && Date.now() - alcance.t < 30000) return alcance.ok;
    let ok = false;
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3500);
      const r = await fetch(NUBE + "/api/red/info", { cache: "no-store", signal: ctl.signal });
      clearTimeout(t);
      ok = r.ok && (await r.json()).nom === 1;
    } catch (e) { ok = false; }
    alcance = { ok, t: Date.now() };
    return ok;
  }

  /** Presenta un pase al servidor actual (el teléfono) y abre la sesión con la misma cuenta. */
  async function entrarConPase(pase, contrasena) {
    const r = await api().post("/api/cuentas/pase/entrar", { pase }, { sin401: true });
    api().fijarSesion(r.token, r.usuario);
    // La bóveda de esta cuenta: con la contraseña (si se escribió) o la que ya estaba abierta.
    let abierta = false;
    if (contrasena) { try { abierta = await NOM.boveda.abrir(r.usuario.id, contrasena); } catch (e) { console.warn(e); } }
    if (!abierta) { try { abierta = await NOM.boveda.reanudar(r.usuario.id); } catch (e) { abierta = false; } }
    if (!abierta) { try { await NOM.boveda.abrir(r.usuario.id, secretoAlias(r.usuario.id)); } catch (e) { console.warn(e); } }
    NOM.aplicarPreferencias(r.preferencias);
    return r;
  }

  /** Con la sesión de la nube que guardó la app: un pase y a entrar, sin escribir nada. */
  async function entrarConSesionGuardada() {
    const s = sesionNube();
    if (!s) return null;
    let p;
    try { p = await aNube("POST", "/api/cuentas/pase", {}, s.token); }
    catch (e) { if (e.estado === 401) olvidarSesionNube(); throw e; }
    return entrarConPase(p.pase);
  }

  /**
   * «Entrar con mi cuenta» (quien sí tiene Internet): usuario y contraseña van directo a la nube por
   * https; la nube da un pase; se cierra esa sesión de la nube (salvo en la app, que la guarda) y el
   * teléfono abre una con la misma cuenta. Devuelve la respuesta del teléfono, o null si se canceló.
   */
  function dialogoCuenta() {
    return new Promise((listo) => {
      const guardada = sesionNube();
      const cuerpo = html(`<form class="col" novalidate>
        <p class="suave" style="font-weight:650">Tienes Internet en este equipo: entra con tu cuenta de <b>NOM-COLAB en Internet</b>. Tu contraseña va directo a la nube por una conexión cifrada; el teléfono que comparte nunca la ve.</p>
        <div class="alerta" data-alerta hidden role="alert"></div>
        ${guardada ? `<button type="button" class="btn primario ancho" data-guardada>${ico("log-in")} Seguir como ${esc(guardada.usuario.nombre)}</button>
          <div class="fila" style="gap:10px;color:var(--tinta-suave);font-size:13px;font-weight:700"><span style="flex:1;height:1px;background:var(--borde-fuerte)"></span>u otra cuenta<span style="flex:1;height:1px;background:var(--borde-fuerte)"></span></div>` : ""}
        <div class="campo"><label for="nu">Usuario</label><div class="entrada">${ico("user")}<input id="nu" name="nombre" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${esc(NOM.leer("nom.ultimoNombre", ""))}"></div></div>
        <div class="campo"><label for="nc">Contraseña</label><div class="entrada">${ico("lock")}<input id="nc" name="contrasena" type="password" autocomplete="current-password" required></div></div>
        <button class="btn ${guardada ? "" : "primario"} ancho" type="submit">${ico("cloud")} Entrar con mi cuenta</button>
        <p class="suave chico">Así lo que escribas aquí queda a tu nombre también cuando el espacio se suba a la nube.</p></form>`);
      let hecho = null;
      const h = hoja({ titulo: "Entrar con mi cuenta", icono: "cloud", cuerpo, alCerrar: () => listo(hecho) });
      const alerta = $("[data-alerta]", cuerpo);
      const error = (e) => { alerta.hidden = false; alerta.className = "alerta error"; alerta.innerHTML = `${ico("triangle-alert")}<span>${esc(e.message)}</span>`; };
      const g = $("[data-guardada]", cuerpo);
      if (g) g.onclick = async () => {
        g.disabled = true;
        try { hecho = await entrarConSesionGuardada(); h.cerrar(); } catch (e) { g.disabled = false; error(e); }
      };
      cuerpo.onsubmit = async (e) => {
        e.preventDefault();
        const nombre = cuerpo.nombre.value.trim(), contrasena = cuerpo.contrasena.value;
        if (!nombre || !contrasena) return error(new Error("Escribe tu usuario y tu contraseña"));
        const b = $("button[type=submit]", cuerpo);
        b.disabled = true; b.innerHTML = `<span class="cargando"></span>`;
        try {
          const ses = await aNube("POST", "/api/cuentas/sesion", { nombre, contrasena });
          const p = await aNube("POST", "/api/cuentas/pase", {}, ses.token);
          // En la app, la sesión de la nube se guarda para volver a ella y para otros pases; en el
          // navegador se cierra ya (solo servía para pedir el pase).
          if (api().empaquetada) NOM.guardar("nom.sesionNube", { servidor: NUBE, token: ses.token, usuario: ses.usuario, t: Date.now() });
          else aNube("DELETE", "/api/cuentas/sesion", undefined, ses.token).catch(() => {});
          NOM.guardar("nom.ultimoNombre", nombre);
          hecho = await entrarConPase(p.pase, contrasena);
          h.cerrar();
        } catch (x) { b.disabled = false; b.innerHTML = `${ico("cloud")} Entrar con mi cuenta`; error(x); }
      };
      setTimeout(() => (cuerpo.nombre.value ? cuerpo.contrasena : cuerpo.nombre).focus(), 40);
    });
  }

  /** En la app: al volver a la nube, si había una sesión guardada de esa nube, se retoma sola. */
  async function retomarNube() {
    const s = sesionNube();
    if (!s || !api().empaquetada || s.servidor !== api().servidor() || api().token()) return false;
    try {
      api().fijarSesion(s.token, s.usuario);
      const r = await api().get("/api/cuentas/yo", undefined, { ms: 6000, sin401: true });
      api().fijarSesion(s.token, r.usuario);
      if (!(await NOM.boveda.reanudar(r.usuario.id))) { api().limpiarSesion(); return false; }
      NOM.aplicarPreferencias(r.preferencias);
      olvidarSesionNube();
      return true;
    } catch (e) {
      if (e.estado === 401) olvidarSesionNube();
      api().limpiarSesion();
      return false;
    }
  }

  NOM.acceso = {
    NUBE, infoServidor, infoGuardada, esTelefono, aliasGuardado, aliasDeEsteServidor, volverConAlias, secretoAlias, entrarConAlias, entrarComoDueno,
    sesionNube, guardarSesionNube, olvidarSesionNube, nubeAlcanzable, entrarConPase, entrarConSesionGuardada, dialogoCuenta, retomarNube, azar,
  };
})();
