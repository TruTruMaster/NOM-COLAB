/* NOM-COLAB · arranque y navegación (diagrama 07: Bienvenida → Cuentas → Inicio → Espacios → Editor). */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, api, aviso, confirmar, avatar } = { ...NOM, api: NOM.api };
  const raiz = document.getElementById("app");
  let desmontar = null, fab = null;

  const app = (NOM.app = {
    espacios: api.token() ? NOM.leer(api.clave("cache.espacios"), []) : [],
    fijarEspacios(l) { app.espacios = l || []; pintarRielEspacios(); },
    fijarTitulo(t) { const el = $("[data-titulo-movil]"); if (el) el.textContent = t; document.title = t + " · NOM-COLAB"; },
    fijarFab(fn) { fab = fn; const b = $("[data-fab]"); if (b) b.hidden = !fn; },
    alIniciarSesion() { NOM.local.salir(); api.migrarClaves(); app.espacios = NOM.leer(api.clave("cache.espacios"), []); location.hash = "#/"; ruta(); },
    cerrarSesion,
  });

  api.alExpirar = async () => {
    if (!api.token()) return;
    await NOM.boveda.cerrar();   // sin sesión, los documentos de este equipo quedan cifrados
    api.limpiarSesion();
    aviso("Tu sesión expiró. Inicia sesión de nuevo.", { tipo: "aviso" });
    ruta();
  };

  // ------------------------------------------------------------ cascarón (riel + barra móvil + pestañas)
  function cascaron(actual, tituloMovil) {
    const sinCuenta = NOM.local.activo();
    const u = sinCuenta ? NOM.local.usuario() : api.usuario() || {};
    const esAdmin = !sinCuenta && u.rol === "ADMINISTRADOR";
    raiz.innerHTML = "";
    const c = html(`<div class="app con-riel">
      <aside class="riel" aria-label="Navegación">
        <a class="marca" href="#/" style="text-decoration:none;color:inherit"><svg class="logo"><use href="#logo"/></svg><div>NOM-COLAB<small>Suite colaborativa en red local</small></div></a>
        <button class="riel-buscar" type="button" data-a="paleta" aria-label="Buscar o ir a (Ctrl+K)">${ico("search")}<span class="crece">Buscar o ir a…</span><kbd>Ctrl K</kbd></button>
        <a class="riel-item" href="#/" ${actual === "inicio" ? 'aria-current="page"' : ""}>${ico("house")} Inicio</a>
        <a class="riel-item" href="#/dispositivo" ${actual === "dispositivo" ? 'aria-current="page"' : ""} data-micro="Este dispositivo|Documentos guardados aquí, cuánto ocupan y cambios sin enviar.">${ico("hard-drive")} Este dispositivo</a>
        ${esAdmin ? `<a class="riel-item" href="#/admin" ${actual === "admin" ? 'aria-current="page"' : ""}>${ico("shield-check")} Administrar usuarios</a>` : ""}
        ${sinCuenta ? `
        <div class="clay" style="margin-top:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
          <b style="font-size:14px">Sin cuenta</b>
          <span class="chico suave" style="font-weight:650">Tus documentos viven solo ${NOM.aqui().en}. Con una cuenta los guardas en un espacio y colaboras con tu equipo.</span>
          <button class="btn primario chico" data-a="ir-cuenta">${ico("user-plus", "ico-s")} Crear cuenta</button>
        </div><span class="crece"></span>` : `
        <button class="riel-item" data-a="unirse" data-micro="Unirse a un espacio|Encuentra los espacios que se comparten en esta red.">${ico("radio")} Unirse a un espacio</button>
        <div class="riel-titulo fila-e">Tus espacios <button class="icono-btn" data-a="nuevo" style="width:30px;height:30px" aria-label="Nuevo espacio" data-micro="Nuevo espacio">${ico("plus", "ico-s")}</button></div>
        <nav class="riel-lista" data-riel-espacios></nav>`}
        <div class="riel-pie">
          ${avatar(u)}
          <div class="crece"><div class="recorta" style="font-weight:800">${esc(u.nombre || "")}</div><div class="chico suave recorta" ${sinCuenta ? "" : "data-red-texto"} style="font-weight:700">${sinCuenta ? "Solo en este equipo" : api.enLinea ? "Conectado" : "Sin conexión"}</div>${sinCuenta ? "" : `<div class="chico suave recorta" style="font-weight:800">${ico(esAdmin ? "shield-check" : "users", "ico-s")} ${esAdmin ? "Administrador" : "Usuario"}</div>`}</div>
          <button class="icono-btn" data-a="cuenta" aria-label="Cuenta y ajustes" data-micro="Cuenta|Preferencias y cerrar sesión.">${ico("settings")}</button>
        </div>
      </aside>
      <div>
        <header class="barra-movil">
          ${actual === "espacio" ? `<a class="icono-btn" href="#/" aria-label="Volver">${ico("chevron-left")}</a>` : `<svg class="logo" style="width:30px;height:30px"><use href="#logo"/></svg>`}
          <span class="titulo recorta" data-titulo-movil>${esc(tituloMovil || "NOM-COLAB")}</span>
          <button class="icono-btn" data-a="paleta" aria-label="Buscar o ir a">${ico("search")}</button>
          <span class="chip ${api.enLinea ? "ok" : "error"}" data-red-chip style="${api.enLinea ? "display:none" : ""}">${ico("wifi-off", "ico-s")} Sin red</span>
          <button class="icono-btn" data-a="cuenta" aria-label="Cuenta">${avatar(u)}</button>
        </header>
        <main class="contenido" id="vista" tabindex="-1"></main>
      </div>
      <nav class="pestanas" aria-label="Secciones">
        <a href="#/" ${actual === "inicio" ? 'aria-current="page"' : ""}>${ico("house")}Inicio</a>
        ${sinCuenta ? `<button data-a="ir-cuenta">${ico("user-plus")}Cuenta</button>` : `<button data-a="unirse">${ico("radio")}Unirse</button>`}
        <button data-a="cuenta">${ico("settings")}Ajustes</button>
      </nav>
      <button class="btn primario fab solo-movil" data-fab aria-label="Crear" hidden>${ico("plus")}</button>
    </div>`);
    raiz.append(c);
    $$("[data-a=unirse]", c).forEach((b) => (b.onclick = NOM.vistaEspacios.unirse));
    $$("[data-a=nuevo]", c).forEach((b) => (b.onclick = NOM.vistaEspacios.nuevoEspacio));
    $$("[data-a=ir-cuenta]", c).forEach((b) => (b.onclick = () => irACuentas("registro")));
    $$("[data-a=cuenta]", c).forEach((b) => (b.onclick = () => NOM.menu(b, sinCuenta ? [
      { titulo: "Sin cuenta" },
      { texto: "Crear cuenta", icono: "user-plus", fn: () => irACuentas("registro") },
      { texto: "Iniciar sesión", icono: "log-out", fn: () => irACuentas("entrar") },
      { texto: "Archivos en este dispositivo", icono: "hard-drive", fn: () => { location.hash = "#/dispositivo"; } },
      { texto: "Ajustes y preferencias", icono: "settings", fn: NOM.vistaEspacios.preferencias },
    ] : [
      { titulo: u.nombre + (u.empresa ? " · " + u.empresa : "") + " · " + (esAdmin ? "Administrador" : "Usuario") },
      ...(esAdmin ? [{ texto: "Administrar usuarios", icono: "shield-check", fn: () => { location.hash = "#/admin"; } }] : []),
      { texto: "Archivos en este dispositivo", icono: "hard-drive", fn: () => { location.hash = "#/dispositivo"; } },
      { texto: "Ajustes y preferencias", icono: "settings", fn: NOM.vistaEspacios.preferencias },
      ...(api.empaquetada ? [{ texto: "Cambiar de servidor", icono: "server", fn: () => { api.fijarServidor(""); cerrarSesion(true); } }] : []),
      "-",
      { texto: "Cerrar sesión", icono: "log-out", peligro: true, fn: () => cerrarSesion() },
    ])));
    $("[data-fab]", c).onclick = () => fab && fab();
    pintarRielEspacios(actual);
    return $("#vista", c);
  }

  function pintarRielEspacios() {
    const l = $("[data-riel-espacios]");
    if (!l) return;
    const actualId = (location.hash.match(/#\/espacio\/([^/]+)/) || [])[1];
    l.innerHTML = app.espacios.map((e) => `<a class="riel-item" href="#/espacio/${esc(e.id)}" ${e.id === actualId ? 'aria-current="page"' : ""}>
      <span class="punto-color" style="background:${esc(e.color)}"></span><span class="crece recorta">${esc(e.nombre)}</span>
      ${e.conexion ? `<span class="chip ok" style="height:20px;padding:0 6px" title="Visible en la red"><span class="punto"></span></span>` : ""}</a>`).join("")
      || `<p class="chico suave" style="padding:4px 12px;font-weight:650">Aún no tienes espacios.</p>`;
  }

  api.alCambiarRed((ok) => {
    const t = $("[data-red-texto]"); if (t) t.textContent = ok ? "Conectado" : "Sin conexión";
    const c = $("[data-red-chip]"); if (c) c.style.display = ok ? "none" : "";
    if (!ok) aviso("Se perdió la conexión con el servidor. Puedes seguir trabajando.", { tipo: "aviso" });
  });

  // ------------------------------------------------------------ cerrar sesión (CU-03)
  async function cerrarSesion(sinPreguntar) {
    let pendientes = 0;
    NOM.boveda.claves(api.clave("cola.")).forEach((k) => { pendientes += (NOM.leer(k, []) || []).length; });
    if (pendientes && !sinPreguntar) {
      const salir = await confirmar("Cambios sin sincronizar", `Hay ${pendientes} cambio(s) que aún no llegan al servidor. Si sales ahora se quedarán en este equipo y se enviarán la próxima vez que entres.`, { si: "Salir de todos modos", peligro: true });
      if (!salir) return;
    }
    try { await api.delete("/api/cuentas/sesion", undefined, { ms: 3000, sin401: true }); } catch (e) { /* si ya expiró, se cierra igual */ }
    // Se descartan las copias de consulta de ESTA cuenta; sus cambios pendientes se conservan
    // (separados por cuenta) y se envían la próxima vez que entre.
    const borrar = [api.clave("cache."), api.clave("doc."), api.clave("recientes")];
    NOM.boveda.claves("nom.u.").filter((k) => borrar.some((p) => k.startsWith(p))).forEach((k) => NOM.quitar(k));
    await NOM.boveda.cerrar();   // se olvida la llave: lo que queda en el equipo solo se abre con la contraseña
    api.limpiarSesion();
    app.espacios = [];
    location.hash = "#/";
    ruta();
  }

  // ------------------------------------------------------------ rutas
  // Turno de navegación: si se cambia de pantalla mientras otra aún carga, la vieja se descarta
  // (si no, quedaba un editor "huérfano" conectado y escuchando en segundo plano).
  let turno = 0;
  async function ruta() {
    const fin = NOM.cargando ? NOM.cargando.empezar() : () => {};
    try { await rutaInterna(); } finally { fin(); }
  }
  async function rutaInterna() {
    const mio = ++turno;
    const vigente = () => mio === turno;
    const montar = async (promesa) => {
      const d = await promesa;
      if (vigente()) desmontar = d;
      else if (typeof d === "function") { try { d(); } catch (e) { console.error(e); } }
    };
    // Al cambiar de pantalla (incluido el botón Atrás) no se queda ninguna ventana encima.
    NOM.cerrarHoja();
    NOM.cerrarMenu();
    NOM.ocultarMicro();
    if (NOM.rueda) NOM.rueda.cerrar();
    if (desmontar) { try { desmontar(); } catch (e) { console.error(e); } desmontar = null; }
    document.title = "NOM-COLAB";
    const h = location.hash || "#/";
    let m;
    // Documentos de este equipo: se abren con o sin cuenta.
    if ((m = h.match(/^#\/local\/([^/?]+)/))) {
      await montar(NOM.editor.abrir(raiz, decodeURIComponent(m[1]), { local: true, vigente }));
      return;
    }
    if (!api.token() && !NOM.local.activo()) { NOM.vistaCuentas.pintar(raiz, cuentasModo ? { modo: cuentasModo } : undefined); cuentasModo = null; return; }
    if (h.startsWith("#/dispositivo")) {
      const v = cascaron("dispositivo", "Este dispositivo");
      app.fijarFab(null);
      document.title = "Archivos en este dispositivo · NOM-COLAB";
      await NOM.vistaDispositivo.pintar(v);
      return;
    }
    if (NOM.local.activo()) {
      if (h !== "#/" && h !== "#") { location.hash = "#/"; return; }   // espacios y documentos del servidor piden cuenta
      const v = cascaron("inicio", "Mis documentos");
      app.fijarFab(() => NOM.vistaEspacios.nuevoDocumento(null));
      NOM.vistaEspacios.inicioSinCuenta(v);
      return;
    }
    if ((m = h.match(/^#\/doc\/([^/?]+)/))) {
      await montar(NOM.editor.abrir(raiz, decodeURIComponent(m[1]), { vigente }));
      return;
    }
    if ((m = h.match(/^#\/espacio\/([^/?]+)/))) {
      const v = cascaron("espacio", (app.espacios.find((e) => e.id === m[1]) || {}).nombre);
      app.fijarFab(null);
      api.get("/api/espacios").then((l) => { NOM.guardar(api.clave("cache.espacios"), l); app.fijarEspacios(l); }).catch(() => {});
      await montar(NOM.vistaEspacios.espacio(v, decodeURIComponent(m[1])));
      return;
    }
    if (h.startsWith("#/admin")) {
      const v = cascaron("admin", "Administrar usuarios");
      app.fijarFab(null);
      document.title = "Administrar usuarios · NOM-COLAB";
      await NOM.vistaAdmin.pintar(v);
      return;
    }
    const v = cascaron("inicio", "Inicio");
    app.fijarFab(NOM.vistaEspacios.nuevoEspacio);
    await NOM.vistaEspacios.inicio(v);
  }
  window.addEventListener("hashchange", ruta);

  /** Sale del modo sin cuenta hacia la pantalla de cuentas (los documentos locales se conservan). */
  let cuentasModo = null;
  function irACuentas(modo) {
    NOM.local.salir();
    cuentasModo = modo || null;
    if (location.hash === "#/" || !location.hash) ruta(); else location.hash = "#/";
  }
  app.irACuentas = irACuentas;
  app.sinCuenta = () => { NOM.local.entrar(); if (location.hash === "#/" || !location.hash) ruta(); else location.hash = "#/"; };


  // ¿Servidor en la red local o en la nube? Cambia los textos de conexión y "Unirse".
  api.get("/api/red/info", undefined, { ms: 90000 }).then((i) => { api.lan = i.lan !== false; NOM.guardar("nom.lan", api.lan); }).catch(() => {});

  // El rol también se refresca aquí: si un administrador lo cambió, el menú se actualiza al recargar.
  if (api.token()) api.get("/api/cuentas/yo").then((r) => {
    const antes = (api.usuario() || {}).rol;
    api.fijarSesion(api.token(), r.usuario);
    NOM.aplicarPreferencias(r.preferencias);
    if (antes !== r.usuario.rol) ruta();
  }).catch(() => {});

  /** Al abrir la página con sesión: se reabre la bóveda cifrada de la cuenta. Si su llave ya no
      está (se cerró sesión en otra pestaña, se borraron datos), se pide la contraseña otra vez. */
  async function arrancar() {
    if (api.token()) {
      const u = api.usuario() || {};
      if (u.id && await NOM.boveda.reanudar(u.id)) {
        api.migrarClaves();
        app.espacios = NOM.leer(api.clave("cache.espacios"), []);
      } else {
        api.delete("/api/cuentas/sesion", undefined, { ms: 3000, sin401: true }).catch(() => {});
        api.limpiarSesion();
        cuentasModo = "entrar";
        aviso("Por seguridad, escribe de nuevo tu contraseña para abrir tus documentos.", { tipo: "info", ms: 6000 });
      }
    }
    ruta();
  }
  arrancar();
})();
