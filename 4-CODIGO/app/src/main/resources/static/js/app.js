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
    alIniciarSesion() {
      NOM.local.salir(); api.migrarClaves(); app.espacios = NOM.leer(api.clave("cache.espacios"), []);
      // Si llegó desde un enlace o QR para unirse, regresa a él ya con la sesión abierta.
      if (NOM.union && NOM.union.pendiente()) return;
      location.hash = "#/"; ruta();
    },
    cerrarSesion,
    /** ¿Quedó en este equipo algo guardado con una contraseña anterior? (lo fija vistaCuentas.ofrecerRecuperar) */
    viejaPendiente: false,
    /** Vuelve a pintar la pantalla actual (por ejemplo, tras recuperar documentos de este equipo). */
    refrescar() { ruta(); },
    /** La cuenta ya se borró en el servidor: se borra de este equipo todo lo suyo y se vuelve a la entrada. */
    async cuentaBorrada(usuarioId) {
      try { await NOM.boveda.olvidarCuenta(usuarioId); } catch (e) { console.error(e); }
      NOM.quitar("nom.viejaPospuesta." + usuarioId);
      NOM.quitar("nom.ultimoNombre");
      api.limpiarSesion();
      app.espacios = [];
      if (location.hash === "#/" || !location.hash) ruta(); else location.hash = "#/";
    },
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
    raiz.innerHTML = "";
    const c = html(`<div class="app con-riel">
      <aside class="riel" aria-label="Navegación">
        <a class="marca" href="#/" style="text-decoration:none;color:inherit"><svg class="logo"><use href="#logo"/></svg><div>NOM-COLAB<small>Trabajo en equipo, con o sin Internet</small></div></a>
        <button class="riel-buscar" type="button" data-a="paleta" aria-label="Buscar o ir a (Ctrl+K)">${ico("search")}<span class="crece">Buscar o ir a…</span><kbd>Ctrl K</kbd></button>
        <a class="riel-item" href="#/" ${actual === "inicio" ? 'aria-current="page"' : ""}>${ico("house")} Inicio</a>
        <a class="riel-item" href="#/dispositivo" ${actual === "dispositivo" ? 'aria-current="page"' : ""} data-micro="${esc(NOM.etiquetaEquipo())}|Lo guardado aquí para abrirlo sin Internet y cuánto ocupa.${api.empaquetada ? " También: compartir sin Internet desde este teléfono." : ""}">${ico(api.empaquetada ? "smartphone" : "hard-drive")} ${esc(NOM.etiquetaEquipo())}</a>
        ${sinCuenta || u.invitado ? "" : `<button class="riel-item" data-a="almacen" data-micro="En el servidor|Lo de tus espacios: cuánto ocupa en ${esc(NOM.vistaEspacios.nombreServidor())} y cuánto te queda.">${ico("cloud")} En el servidor</button>`}
        ${sinCuenta ? `
        <div class="clay" style="margin-top:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
          <b style="font-size:14px">Sin cuenta</b>
          <span class="chico suave" style="font-weight:650">Tus documentos viven solo ${NOM.aqui().en}. Con una cuenta los guardas en un espacio y colaboras con tu equipo.</span>
          <button class="btn primario chico" data-a="ir-cuenta">${ico("user-plus", "ico-s")} Crear cuenta</button>
        </div><span class="crece"></span>` : `
        <button class="riel-item" data-a="unirse" data-micro="Unirse a un espacio|Con el código o el QR que te dieron, o buscándolo en el mismo Wi-Fi.">${ico("qr-code")} Unirse a un espacio</button>
        <div class="riel-titulo fila-e">Tus espacios <button class="icono-btn" data-a="nuevo" style="width:30px;height:30px" aria-label="Nuevo espacio" data-micro="Nuevo espacio">${ico("plus", "ico-s")}</button></div>
        <nav class="riel-lista" data-riel-espacios></nav>`}
        <div class="riel-pie">
          ${avatar(u)}
          <div class="crece"><div class="recorta" style="font-weight:800">${esc(u.nombre || "")}</div><div class="chico suave recorta" ${sinCuenta ? "" : "data-red-texto"} style="font-weight:700">${sinCuenta ? "Solo en este equipo" : api.enLinea ? "Conectado" : "Sin conexión"}</div>${!sinCuenta && NOM.tipoCuenta(u) ? `<div class="chico suave recorta" style="font-weight:800">${esc(NOM.tipoCuenta(u))}</div>` : !sinCuenta && u.empresa ? `<div class="chico suave recorta" style="font-weight:800">${esc(u.empresa)}</div>` : ""}</div>
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
        ${sinCuenta ? `<button data-a="ir-cuenta">${ico("user-plus")}Cuenta</button>` : `<button data-a="unirse">${ico("qr-code")}Unirse</button>`}
        <button data-a="cuenta">${ico("settings")}Ajustes</button>
      </nav>
      <button class="btn primario fab solo-movil" data-fab aria-label="Crear" hidden>${ico("plus")}</button>
    </div>`);
    raiz.append(c);
    $$("[data-a=unirse]", c).forEach((b) => (b.onclick = NOM.vistaEspacios.unirse));
    $$("[data-a=nuevo]", c).forEach((b) => (b.onclick = NOM.vistaEspacios.nuevoEspacio));
    $$("[data-a=almacen]", c).forEach((b) => (b.onclick = () => NOM.vistaEspacios.miAlmacenamiento()));
    $$("[data-a=ir-cuenta]", c).forEach((b) => (b.onclick = () => irACuentas("registro")));
    $$("[data-a=cuenta]", c).forEach((b) => (b.onclick = () => NOM.menu(b, sinCuenta ? [
      { titulo: "Sin cuenta" },
      { texto: "Crear cuenta", icono: "user-plus", fn: () => irACuentas("registro") },
      { texto: "Iniciar sesión", icono: "log-out", fn: () => irACuentas("entrar") },
      { texto: NOM.etiquetaEquipo(), icono: api.empaquetada ? "smartphone" : "hard-drive", fn: () => { location.hash = "#/dispositivo"; } },
      { texto: "Ajustes y preferencias", icono: "settings", fn: NOM.vistaEspacios.preferencias },
    ] : [
      { titulo: u.nombre + (NOM.tipoCuenta(u) ? " · " + NOM.tipoCuenta(u) : u.empresa ? " · " + u.empresa : "") },
      { texto: NOM.etiquetaEquipo(), icono: api.empaquetada ? "smartphone" : "hard-drive", fn: () => { location.hash = "#/dispositivo"; } },
      ...(u.invitado ? [] : [{ texto: "En el servidor (tu almacenamiento)", icono: "cloud", fn: () => NOM.vistaEspacios.miAlmacenamiento() }]),
      { texto: "Ajustes y preferencias", icono: "settings", fn: NOM.vistaEspacios.preferencias },
      ...(NOM.instalar && NOM.instalar.disponible() ? [{ texto: "Instalar en esta computadora", icono: "monitor-down", fn: () => NOM.instalar.pedir() }] : []),
      ...(api.empaquetada ? [{ texto: "Cambiar dónde trabaja tu equipo", icono: "server", fn: async () => {
        // La sesión de la nube se guarda (sirve para el pase y para volver sin contraseña).
        if (NOM.acceso && NOM.acceso.guardarSesionNube()) { await NOM.boveda.cerrar(false); api.limpiarSesion(); app.espacios = []; api.fijarServidor(""); location.hash = "#/"; ruta(); return; }
        api.fijarServidor(""); cerrarSesion(true);
      } }] : []),
      // Los alias, invitados y cuentas con pase no tienen contraseña ni cuenta que borrar aquí.
      ...(NOM.sinContrasena(u) ? [] : [{ texto: "Cambiar contraseña…", icono: "key-round", fn: NOM.vistaCuentas.cambiarContrasena }]),
      ...(app.viejaPendiente ? [{ texto: "Recuperar lo de mi contraseña anterior…", icono: "hard-drive", fn: () => NOM.vistaCuentas.ofrecerRecuperar(true, true) }] : []),
      "-",
      { texto: "Cerrar sesión", icono: "log-out", peligro: true, fn: () => cerrarSesion() },
      ...(NOM.sinContrasena(u) ? [] : [{ texto: "Borrar mi cuenta…", icono: "trash-2", peligro: true, fn: NOM.vistaCuentas.borrarCuenta }]),
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
      ${e.conexion ? `<span class="chip ok" style="height:20px;padding:0 6px" title="Visible en el Wi-Fi" aria-label="Visible en el Wi-Fi"><span class="punto"></span></span>` : ""}</a>`).join("")
      || `<p class="chico suave" style="padding:4px 12px;font-weight:650">Aún no tienes espacios.</p>`;
  }

  api.alCambiarRed((ok) => {
    const t = $("[data-red-texto]"); if (t) t.textContent = ok ? "Conectado" : "Sin conexión";
    const c = $("[data-red-chip]"); if (c) c.style.display = ok ? "none" : "";
    if (!ok) aviso("Sin conexión. Puedes seguir trabajando: tus cambios se guardan aquí y se envían cuando vuelva.", { tipo: "aviso", ms: 6000 });
  });

  // ------------------------------------------------------------ cerrar sesión (CU-03)
  async function cerrarSesion(sinPreguntar) {
    let pendientes = 0;
    NOM.boveda.claves(api.clave("cola.")).forEach((k) => { pendientes += (NOM.leer(k, []) || []).length; });
    if (pendientes && !sinPreguntar) {
      const salir = await confirmar("Cambios sin enviar", `Hay ${pendientes} cambio(s) que aún no se envían. Si sales ahora, se quedan guardados en este equipo y se envían la próxima vez que entres.`, { si: "Salir de todos modos", peligro: true });
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
    // Unirse con un código o QR (2.1) y la pantalla del proyector (5.5): con o sin cuenta.
    // 8.5 Ver un solo documento con el enlace que creó el propietario: sin cuenta.
    if ((m = h.match(/^#\/ver\/([^/?]+)/))) { await montar(NOM.vistaVer.abrir(raiz, decodeURIComponent(m[1]))); return; }
    if ((m = h.match(/^#\/unirse\/([^/?]+)/))) { await montar(NOM.union.pantalla(raiz, decodeURIComponent(m[1]))); return; }
    if ((m = h.match(/^#\/proyectar(?:\/([^/?]*))?\/?$/))) { await montar(NOM.proyector.abrir(raiz, decodeURIComponent(m[1] || ""))); return; }
    // Documentos de este equipo: se abren con o sin cuenta.
    if ((m = h.match(/^#\/local\/([^/?]+)/))) {
      await montar(NOM.editor.abrir(raiz, decodeURIComponent(m[1]), { local: true, vigente }));
      return;
    }
    if (!api.token() && !NOM.local.activo()) { NOM.vistaCuentas.pintar(raiz, cuentasModo ? { modo: cuentasModo } : undefined); cuentasModo = null; return; }
    if (h.startsWith("#/dispositivo")) {
      const v = cascaron("dispositivo", NOM.etiquetaEquipo());
      app.fijarFab(null);
      document.title = NOM.etiquetaEquipo() + " · NOM-COLAB";
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


  /**
   * La app trae su interfaz empaquetada; el servidor puede ser de otra versión (la página nunca se
   * desfasa: siempre trae la de su servidor). Si no coinciden se avisa, una vez al día por servidor:
   * lo que una versión importa de Office la otra puede verlo distinto.
   */
  NOM.revisarVersion = (info) => {
    if (!api.empaquetada || !info || info.nom !== 1) return;
    const suya = +info.interfaz || 0, mia = NOM.INTERFAZ;
    if (suya === mia) return;
    const clave = (info.servidor || api.servidor()) + "|" + suya + "|" + mia, hoy = new Date().toISOString().slice(0, 10);
    const visto = NOM.leer("nom.versionAvisada", {});
    if (visto.clave === clave && visto.dia === hoy) return;
    NOM.guardar("nom.versionAvisada", { clave, dia: hoy });
    if (suya < mia) {
      NOM.aviso(`Este servidor tiene una versión anterior de NOM-COLAB${info.version && suya ? " (" + info.version + ")" : ""} que esta app (${NOM.VERSION}). Puedes trabajar, pero lo que importes de Word, Excel o PowerPoint puede verse distinto en la página hasta que actualicen el servidor.`, { tipo: "aviso", ms: 12000 });
    } else {
      NOM.aviso(`Hay una versión más nueva de la app (${info.version || "nueva"}; tienes la ${NOM.VERSION}). Actualízala para ver los documentos igual que en la página.`,
        { tipo: "aviso", ms: 15000, accion: { texto: "Descargar", fn: () => { location.href = "https://github.com/TruTruMaster/NOM-COLAB/releases/latest/download/NOM-COLAB.apk"; } } });
    }
  };
  // ¿Servidor en la red local o en la nube? Cambia los textos de conexión y "Unirse".
  api.get("/api/red/info", undefined, { ms: 90000 }).then((i) => { api.lan = i.lan !== false; NOM.guardar("nom.lan", api.lan); NOM.revisarVersion(i); }).catch(() => {});

  // Los datos de la cuenta y sus preferencias se refrescan al abrir (pudieron cambiar en otro equipo).
  if (api.token()) api.get("/api/cuentas/yo").then((r) => {
    api.fijarSesion(api.token(), r.usuario);
    NOM.aplicarPreferencias(r.preferencias);
  }).catch(() => {});

  /** Al abrir la página con sesión: se reabre la bóveda cifrada de la cuenta. Si su llave ya no
      está (se cerró sesión en otra pestaña, se borraron datos), se pide la contraseña otra vez. */
  async function arrancar() {
    // Se abrió desde un QR (/unirse?c=… o /proyectar?c=…): se pasa a la ruta de la app.
    if (NOM.union) NOM.union.desdeDireccion();
    // App Android: si este teléfono era el servidor y Android lo cerró, se vuelve a encender.
    if (NOM.anfitrion) NOM.anfitrion.reanudar();
    // El navegador se cerró de golpe y localStorage no alcanzó a guardar la sesión: se recupera de la
    // copia que quedó junto a la llave de la bóveda (sin esto, sin Internet ya no se podría entrar).
    if (!api.token() && NOM.boveda) {
      const s = await NOM.boveda.rescatarSesion();
      if (s) { NOM.guardar("nom.token", s.token); NOM.guardar("nom.usuario", s.usuario); }
    }
    if (api.token()) {
      const u = api.usuario() || {};
      // Un invitado no tiene contraseña: si el navegador borró la bóveda, se abre otra con el
      // secreto de este dispositivo (cerrar su sesión sería perder la cuenta para siempre).
      const secreto = u.id && NOM.leer("nom.inv." + u.id, null);
      if (u.id && (await NOM.boveda.reanudar(u.id) || (secreto && await NOM.boveda.abrir(u.id, secreto).catch(() => false)))) {
        api.migrarClaves();
        app.espacios = NOM.leer(api.clave("cache.espacios"), []);
        // ¿Quedó algo guardado con una contraseña anterior? Se recuerda como mucho una vez al día.
        setTimeout(() => NOM.vistaCuentas.ofrecerRecuperar(false).catch((e) => console.error(e)), 1500);
      } else {
        api.delete("/api/cuentas/sesion", undefined, { ms: 3000, sin401: true }).catch(() => {});
        api.limpiarSesion();
        cuentasModo = "entrar";
        aviso("Por seguridad, escribe de nuevo tu contraseña para abrir tus documentos.", { tipo: "info", ms: 6000 });
      }
    }
    ruta();
    if (NOM.cola) NOM.cola.arrancar();
  }
  arrancar();
})();
