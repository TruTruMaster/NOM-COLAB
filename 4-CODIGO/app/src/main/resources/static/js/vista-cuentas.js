/* NOM-COLAB · Módulo 1: Gestión de cuentas (diagramas A1 Crear usuario y A2 Iniciar sesión). */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, api } = { ...NOM, api: NOM.api };

  function fuerza(c) {
    let n = 0;
    if (c.length >= 8) n++;
    if (c.length >= 12) n++;
    if (/[A-Z]/.test(c) && /[a-z]/.test(c)) n++;
    if (/\d/.test(c) && /[^A-Za-z0-9]/.test(c)) n++;
    return c ? Math.max(1, Math.min(4, n)) : 0;
  }
  const textoFuerza = ["", "Débil", "Aceptable", "Buena", "Excelente"];
  /** Tiempo límite de registro e inicio de sesión: cubre el arranque en frío de la base de datos. */
  const ESPERA_BD = 90000;

  /** El código para recuperar la contraseña: se muestra una sola vez (no hay correo ni administrador). */
  function mostrarCodigo(codigo, nombre) {
    return new Promise((listo) => {
      const cuerpo = html(`<div class="col" style="align-items:center;text-align:center">
        <span class="modo-insignia" style="width:56px;height:56px;border-radius:18px;background:var(--acento-tenue);color:var(--acento-tinta)">${ico("key-round", "ico-l")}</span>
        <p style="font-weight:650">Si algún día olvidas tu contraseña, con este código pones una nueva. <b>Guárdalo</b> (foto, papel o archivo): solo se muestra ahora y nadie más lo tiene, ni quien administra NOM-COLAB.</p>
        <b class="qr-codigo" style="font-size:24px;letter-spacing:.08em">${esc(codigo)}</b>
        <div class="fila"><button class="btn chico" data-copiar>${ico("copy", "ico-s")} Copiar</button><button class="btn chico" data-bajar>${ico("download", "ico-s")} Guardar archivo</button></div></div>`);
      const pie = html(`<div style="display:contents"><span class="crece"></span><button class="btn primario" data-ok>Ya lo guardé</button></div>`);
      const h = NOM.hoja({ titulo: "Tu código de recuperación", icono: "key-round", cuerpo, pie, alCerrar: () => listo() });
      $("[data-copiar]", cuerpo).onclick = () => NOM.copiarTexto(codigo).then((ok) => NOM.aviso(ok ? "Código copiado" : "No se pudo copiar: anótalo o usa «Descargar».", { tipo: ok ? "ok" : "aviso", ms: ok ? undefined : 6000 }));
      $("[data-bajar]", cuerpo).onclick = () => NOM.formatos.descargar(`Codigo de recuperacion NOM-COLAB - ${nombre || "cuenta"}.txt`, "text/plain", `Cuenta: ${nombre || ""}\r\nCódigo para recuperar la contraseña de NOM-COLAB: ${codigo}\r\nGuárdalo en un lugar seguro.\r\n`);
      $("[data-ok]", pie).onclick = () => h.cerrar();
    });
  }

  /** ¿Olvidaste tu contraseña?: usuario + código de recuperación + contraseña nueva. */
  function recuperar(nombre) {
    const cuerpo = html(`<form class="col" novalidate>
      <p class="suave" style="font-weight:650">Usa el código que te dio NOM-COLAB al crear la cuenta (o el último que generaste en Ajustes).</p>
      <p class="suave chico" style="font-weight:650">${ico("hard-drive", "ico-s")} Lo que está en tus espacios no cambia. Lo que solo está guardado en un equipo (documentos de “${esc(NOM.etiquetaEquipo())}” y cambios sin enviar) va cifrado con tu contraseña de ahora: al entrar con la nueva te la pediremos una vez para recuperarlo, así que si la recuerdas, mejor cámbiala desde tu cuenta.</p>
      <div class="alerta" data-alerta hidden role="alert"></div>
      <div class="campo"><label for="rn">Usuario</label><div class="entrada">${ico("user")}<input id="rn" name="nombre" autocomplete="username" autocapitalize="none" value="${esc(nombre || "")}"></div></div>
      <div class="campo"><label for="rk">Código de recuperación</label><div class="entrada">${ico("key-round")}<input id="rk" name="codigo" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCD-EFGH-JKMN-PQRS"></div></div>
      <div class="campo"><label for="rp">Contraseña nueva</label><div class="entrada">${ico("lock")}<input id="rp" name="nueva" type="password" autocomplete="new-password" minlength="8"></div></div>
    </form>`);
    const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>Cambiar contraseña</button></div>`);
    const h = NOM.hoja({ titulo: "Recuperar la contraseña", icono: "key-round", cuerpo, pie });
    const al = $("[data-alerta]", cuerpo);
    const enviar = async (e) => {
      e && e.preventDefault();
      const b = $("[data-si]", pie);
      b.disabled = true;
      try {
        const r = await api.post("/api/cuentas/recuperar", { nombre: cuerpo.nombre.value.trim(), codigo: cuerpo.codigo.value, nueva: cuerpo.nueva.value }, { sin401: true, ms: ESPERA_BD });
        h.cerrar(true);
        NOM.aviso("Listo: ya puedes entrar con tu contraseña nueva", { tipo: "ok", ms: 5000 });
        await mostrarCodigo(r.recuperacion, cuerpo.nombre.value.trim());
      } catch (x) {
        al.className = "alerta " + (x.estado === 423 ? "aviso" : "error"); al.hidden = false;
        al.innerHTML = `${ico("triangle-alert")}<span>${esc(x.message)}</span>`;
        b.disabled = false;
      }
    };
    cuerpo.onsubmit = enviar;
    $("[data-si]", pie).onclick = enviar;
    $("[data-no]", pie).onclick = () => h.cerrar();
  }

  /** Alerta dentro de una hoja (error del servidor o cuenta bloqueada). */
  function alertaEn(al, x) {
    al.className = "alerta " + (x.estado === 423 ? "aviso" : "error"); al.hidden = false;
    al.innerHTML = `${ico(x.estado === 423 ? "lock" : "triangle-alert")}<span>${esc(x.red ? "Sin conexión: revisa el Wi-Fi o los datos e intenta de nuevo." : x.message)}</span>`;
  }

  /**
   * Cambiar la contraseña sabiendo la actual. El servidor cierra las demás sesiones y da una nueva
   * para este equipo; la llave de lo guardado aquí se envuelve con la contraseña nueva, así que
   * los documentos de este equipo y los cambios sin enviar siguen abriendo.
   */
  function cambiarContrasena() {
    const u = api.usuario() || {};
    const cuerpo = html(`<form class="col" novalidate>
      <p class="suave" style="font-weight:650">Tus otros equipos tendrán que volver a entrar con la contraseña nueva. Lo guardado en este no se pierde.</p>
      <div class="alerta" data-alerta hidden role="alert"></div>
      <input type="text" name="usuario" autocomplete="username" value="${esc(u.nombre || "")}" hidden>
      <div class="campo"><label for="ca">Contraseña actual</label><div class="entrada">${ico("lock")}<input id="ca" name="actual" type="password" autocomplete="current-password" autofocus></div></div>
      <div class="campo"><label for="cn">Contraseña nueva</label><div class="entrada">${ico("key-round")}<input id="cn" name="nueva" type="password" autocomplete="new-password" minlength="8"></div>
        <div class="ayuda">Al menos 8 letras, números o signos.</div></div>
      <div class="campo"><label for="cr">Repite la contraseña nueva</label><div class="entrada">${ico("key-round")}<input id="cr" name="repite" type="password" autocomplete="new-password" minlength="8"></div></div>
    </form>`);
    const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>Cambiar contraseña</button></div>`);
    const h = NOM.hoja({ titulo: "Cambiar contraseña", icono: "key-round", cuerpo, pie });
    const al = $("[data-alerta]", cuerpo);
    const enviar = async (e) => {
      e && e.preventDefault();
      const actual = cuerpo.actual.value, nueva = cuerpo.nueva.value;
      if (!actual) return alertaEn(al, { message: "Escribe tu contraseña actual" });
      if (nueva.length < 8) return alertaEn(al, { message: "La contraseña nueva necesita al menos 8 letras, números o signos" });
      if (nueva !== cuerpo.repite.value) return alertaEn(al, { message: "Las dos contraseñas nuevas no son iguales" });
      if (nueva === actual) return alertaEn(al, { message: "La contraseña nueva es igual a la actual" });
      const b = $("[data-si]", pie);
      b.disabled = true;
      try {
        const r = await api.put("/api/cuentas/contrasena", { actual, nueva }, { sin401: true, ms: ESPERA_BD });
        api.fijarSesion(r.token, r.usuario);
        try { await NOM.boveda.cambiarContrasena(nueva); }
        catch (x) { console.error(x); NOM.aviso("La contraseña cambió, pero no se pudo actualizar lo guardado en este equipo: la próxima vez que entres te pediremos la anterior para abrirlo.", { tipo: "aviso", ms: 9000 }); }
        h.cerrar(true);
        NOM.aviso("Contraseña cambiada. En tus otros equipos vuelve a entrar con la nueva.", { tipo: "ok", ms: 6000 });
      } catch (x) {
        alertaEn(al, x);
        b.disabled = false;
      }
    };
    cuerpo.onsubmit = enviar;
    $("[data-si]", pie).onclick = enviar;
    $("[data-no]", pie).onclick = () => h.cerrar();
  }

  /**
   * Borrar la cuenta: dice qué se borra, pide la contraseña y escribir el nombre de usuario. Al
   * terminar se borra también lo suyo de este equipo y se vuelve a la pantalla de entrada.
   */
  async function borrarCuenta() {
    const u = api.usuario() || {};
    let alm = null;
    try { alm = await api.get("/api/cuentas/almacenamiento"); } catch (e) { /* se explica sin las cifras */ }
    const nEsp = alm ? alm.espacios.length : null, nDoc = alm ? alm.documentos : null;
    const cuerpo = html(`<form class="col" novalidate>
      <div class="alerta error">${ico("triangle-alert")}<span><b>No se puede deshacer.</b> Nadie, ni quien administra NOM-COLAB, puede recuperar la cuenta después.</span></div>
      <div class="lista">
        <div class="lista-item">${ico("trash-2")}<span class="crece"><b>Se borran ${nEsp === null ? "tus espacios" : nEsp === 1 ? "tu espacio" : "tus " + nEsp + " espacios"}${nDoc ? " y " + (nDoc === 1 ? "su documento" : "sus " + nDoc + " documentos") : ""}</b><small>Con todas sus versiones, también para las personas con quienes los compartes. Si quieres conservar algo, descárgalo antes.</small></span></div>
        <div class="lista-item">${ico("log-out")}<span class="crece"><b>Sales de los espacios de otras personas</b><small>Lo que escribiste ahí se queda: es de ese espacio.</small></span></div>
        <div class="lista-item">${ico(api.empaquetada ? "smartphone" : "hard-drive")}<span class="crece"><b>Se borra lo tuyo de este equipo</b><small>Los documentos de “${esc(NOM.etiquetaEquipo())}” y los cambios sin enviar de esta cuenta.</small></span></div>
      </div>
      <div class="alerta" data-alerta hidden role="alert"></div>
      <input type="text" name="usuario" autocomplete="username" value="${esc(u.nombre || "")}" hidden>
      <div class="campo"><label for="bc">Tu contraseña</label><div class="entrada">${ico("lock")}<input id="bc" name="contrasena" type="password" autocomplete="current-password"></div></div>
      <div class="campo"><label for="bn">Para confirmar, escribe tu nombre de usuario: <b>${esc(u.nombre || "")}</b></label><div class="entrada">${ico("user")}<input id="bn" name="nombre" autocomplete="off" autocapitalize="none" spellcheck="false"></div></div>
    </form>`);
    const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn peligro lleno" data-si>Borrar mi cuenta para siempre</button></div>`);
    const h = NOM.hoja({ titulo: "Borrar mi cuenta", icono: "trash-2", cuerpo, pie });
    const al = $("[data-alerta]", cuerpo);
    const enviar = async (e) => {
      e && e.preventDefault();
      if (!cuerpo.contrasena.value) return alertaEn(al, { message: "Escribe tu contraseña" });
      if (cuerpo.nombre.value.trim().toLowerCase() !== String(u.nombre || "").toLowerCase()) return alertaEn(al, { message: "Escribe tu nombre de usuario tal cual para confirmar" });
      const b = $("[data-si]", pie);
      b.disabled = true;
      try {
        await api.post("/api/cuentas/eliminar", { contrasena: cuerpo.contrasena.value }, { sin401: true, ms: ESPERA_BD });
        h.cerrar(true);
        await NOM.app.cuentaBorrada(u.id);
        NOM.aviso("Tu cuenta y todo lo que tenía se borraron.", { tipo: "ok", ms: 7000 });
      } catch (x) {
        alertaEn(al, x);
        b.disabled = false;
      }
    };
    cuerpo.onsubmit = enviar;
    $("[data-si]", pie).onclick = enviar;
    $("[data-no]", pie).onclick = () => h.cerrar();
  }

  /**
   * Si la contraseña cambió sin este equipo (se restableció con el código, o se cambió en otro),
   * lo que solo vivía aquí quedó apartado y cifrado con la anterior: se ofrece recuperarlo.
   * `alEntrar`: recién se inició sesión (se ofrece siempre); si no, como mucho una vez al día.
   * `pedido`: la persona lo abrió desde el menú. Cuando se ofrece solo, espera a que no haya otra
   * ventana abierta (por ejemplo, la de unirse a un espacio con un código): abrir esta la cerraría.
   */
  async function ofrecerRecuperar(alEntrar, pedido, intento) {
    if (!NOM.boveda || !NOM.boveda.activa()) return;
    if (!pedido && document.querySelector(".velo")) {
      if ((intento || 0) < 30) setTimeout(() => ofrecerRecuperar(alEntrar, false, (intento || 0) + 1).catch((e) => console.error(e)), 4000);
      return;
    }
    const r = await NOM.boveda.porRecuperar();
    NOM.app.viejaPendiente = r.hay;
    if (!r.hay) return;
    const uid = NOM.boveda.activa(), clave = "nom.viejaPospuesta." + uid;
    if (alEntrar === false && Date.now() - NOM.leer(clave, 0) < 86400000) return;
    const partes = [];
    if (r.docs) partes.push(r.docs === 1 ? "1 documento" : r.docs + " documentos");
    if (r.colas) partes.push("cambios sin enviar de " + (r.colas === 1 ? "1 documento" : r.colas + " documentos"));
    const cuerpo = html(`<form class="col" novalidate>
      <p style="font-weight:650">En este equipo hay <b>${esc(partes.join(" y "))}</b> que se guardaron con tu contraseña anterior. Siguen aquí, cifrados: escribe esa contraseña para recuperarlos.</p>
      <div class="alerta" data-alerta hidden role="alert"></div>
      <div class="campo"><label for="va">Tu contraseña anterior</label><div class="entrada">${ico("lock")}<input id="va" name="anterior" type="password" autocomplete="off" autofocus></div>
        <div class="ayuda">No se envía a ningún lado: solo abre lo guardado en este equipo.</div></div>
    </form>`);
    const pie = html(`<div style="display:contents"><button class="btn plano peligro" data-borrar type="button">Borrarlos</button><span class="crece"></span><button class="btn" data-no type="button">Ahora no</button><button class="btn primario" data-si>Recuperar</button></div>`);
    let hecho = false;
    const h = NOM.hoja({ titulo: "Guardado con tu contraseña anterior", icono: "key-round", cuerpo, pie, alCerrar: () => { if (!hecho) NOM.guardar(clave, Date.now()); } });
    const al = $("[data-alerta]", cuerpo);
    const enviar = async (e) => {
      e && e.preventDefault();
      if (!cuerpo.anterior.value) return alertaEn(al, { message: "Escribe la contraseña que tenías antes" });
      const b = $("[data-si]", pie);
      b.disabled = true;
      try {
        const x = await NOM.boveda.recuperarCon(cuerpo.anterior.value);
        hecho = true; NOM.quitar(clave);
        h.cerrar(true);
        const que = [];
        if (x.docs) que.push(x.docs === 1 ? "1 documento" : x.docs + " documentos");
        if (x.cambios) que.push(x.cambios === 1 ? "1 cambio sin enviar" : x.cambios + " cambios sin enviar");
        NOM.aviso(que.length ? "Se recuperó: " + que.join(" y ") + "." : "No había nada nuevo que recuperar.", { tipo: "ok", ms: 7000 });
        if (x.cambios && NOM.cola) NOM.cola.arrancar();
        NOM.app.viejaPendiente = x.quedan > 0;
        NOM.app.refrescar();
        // Quedó algo guardado con otra contraseña todavía más vieja: se vuelve a ofrecer.
        if (x.quedan) setTimeout(() => ofrecerRecuperar(true), 600);
      } catch (x) {
        alertaEn(al, x);
        b.disabled = false; cuerpo.anterior.select();
      }
    };
    cuerpo.onsubmit = enviar;
    $("[data-si]", pie).onclick = enviar;
    $("[data-no]", pie).onclick = () => h.cerrar();
    $("[data-borrar]", pie).onclick = async () => {
      // La confirmación abre otra hoja (cierra esta): si dice que no, se vuelve a ofrecer.
      hecho = true;
      const si = await NOM.confirmar("Borrar lo guardado con tu contraseña anterior", `Se borrarán de este equipo ${partes.join(" y ")}. Sin esa contraseña nadie puede abrirlos, y borrados no se pueden recuperar.`, { si: "Borrarlos", peligro: true });
      if (!si) return ofrecerRecuperar(true, true);
      await NOM.boveda.descartarVieja();
      NOM.quitar(clave);
      NOM.app.viejaPendiente = false;
      NOM.aviso("Se borró lo guardado con tu contraseña anterior.", { tipo: "ok" });
    };
  }

  /** "¿Tienes un código del salón?": QR con la cámara o código escrito. */
  async function entrarConCodigo() {
    if (!NOM.union) return;
    if (NOM.qr && NOM.qr.hayCamara()) return NOM.union.escanear();
    const c = await NOM.pedirTexto("Código para unirse", { etiqueta: "El código que te dio el propietario del espacio", ph: "ABCD-2345", si: "Entrar", max: 60 });
    if (c) NOM.union.usar(c);
  }

  function campoContrasena(id, auto) {
    return `<div class="campo">
      <label for="${id}">Contraseña</label>
      <div class="entrada">${ico("lock")}
        <input id="${id}" type="password" autocomplete="${auto}" required minlength="${auto === "new-password" ? 8 : 1}">
        <button type="button" class="icono-btn" data-ver aria-label="Mostrar contraseña" data-micro="Mostrar u ocultar|Revisa lo que escribiste antes de enviar.">${ico("eye")}</button>
      </div>
      <div class="ayuda" data-mayus hidden>${ico("triangle-alert", "ico-s")} Bloq Mayús está activado</div>
    </div>`;
  }

  /** Los documentos que flotan en la bienvenida se apartan del cursor (paralaje), se inclinan
      hacia él y dan un salto al tocarlos. Con movimiento reducido se quedan quietos. */
  function animarFlotantes(cont) {
    if (!cont || document.documentElement.dataset.movimiento === "reducido") return;
    const zona = cont.closest(".bienvenida") || cont.parentElement;
    let raf = 0;
    zona.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = zona.getBoundingClientRect();
        cont.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        cont.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
    });
    zona.addEventListener("pointerleave", () => { cont.style.setProperty("--mx", 0); cont.style.setProperty("--my", 0); });
    cont.querySelectorAll(".flot-cuerpo").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--rx", ((0.5 - (e.clientY - r.top) / r.height) * 22).toFixed(1) + "deg");
        el.style.setProperty("--ry", (((e.clientX - r.left) / r.width - 0.5) * 26).toFixed(1) + "deg");
      });
      el.addEventListener("pointerleave", () => { el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); });
      el.addEventListener("pointerdown", () => { el.classList.remove("salta"); void el.offsetWidth; el.classList.add("salta"); });
    });
  }

  function pintar(raiz, opc) {
    opc = opc || {};
    let modo = opc.modo || "entrar";
    raiz.innerHTML = "";
    const vista = html(`
      <main class="bienvenida">
        <section class="bienvenida-arte">
          <div class="marca"><svg class="logo"><use href="#logo"/></svg><div>NOM-COLAB<small>WACK · We carry the flame</small></div></div>
          <div>
            <h1>Todo tu equipo, en una sola app.</h1>
            <p class="lema">Escriban, calculen y presenten juntos, al mismo tiempo. Con Internet o sin él: basta con estar en el mismo Wi-Fi.</p>
          </div>
          <div class="valores">
            <div class="valor clay"><span class="modo-insignia modo-TEXTO">${ico("layers")}</span><div><b>Cuatro tipos, una app</b><span>Texto, hojas, presentaciones y diagramas</span></div></div>
            <div class="valor clay"><span class="modo-insignia modo-HOJA">${ico("wifi")}</span><div><b>Funciona sin Internet</b><span>En el mismo Wi-Fi, o con un teléfono que comparte</span></div></div>
            <div class="valor clay"><span class="modo-insignia modo-DIAGRAMA">${ico("users")}</span><div><b>Al mismo tiempo</b><span>Hasta 5 personas en el mismo espacio</span></div></div>
          </div>
          <div class="flotantes" aria-hidden="true" data-flotantes>
            <div class="flot flot-texto modo-TEXTO" style="--p:1.5"><div class="flot-flota"><div class="flot-cuerpo">
              <span class="flot-insignia">${ico("file-text", "ico-s")}</span><i class="f-titulo"></i><i></i><i></i><i class="corta"></i><i></i><i class="corta"></i>
            </div></div></div>
            <div class="flot flot-pres modo-PRESENTACION" style="--p:2.3"><div class="flot-flota"><div class="flot-cuerpo">
              <span class="flot-insignia">${ico("presentation", "ico-s")}</span><i class="f-titulo"></i><b class="f-forma"></b><b class="f-forma f-circulo"></b><i class="corta"></i>
            </div></div></div>
            <div class="flot flot-hoja modo-HOJA" style="--p:1"><div class="flot-flota"><div class="flot-cuerpo">
              <span class="flot-insignia">${ico("sheet", "ico-s")}</span><div class="f-rejilla">${Array.from({ length: 20 }, (_, i) => `<span class="${i < 4 ? "cab" : [5, 10, 14, 19].includes(i) ? "lleno" : ""}"></span>`).join("")}</div>
            </div></div></div>
          </div>
        </section>
        <section class="bienvenida-panel"><div class="tarjeta-cuenta clay" data-tarjeta></div></section>
      </main>`);
    raiz.append(vista);
    animarFlotantes($("[data-flotantes]", vista));
    const tarjeta = $("[data-tarjeta]", vista);

    if (api.empaquetada && !api.servidor()) return pintarServidor(tarjeta, () => pintar(raiz, opc));

    function render() {
      tarjeta.innerHTML = "";
      tarjeta.append(modo === "entrar" ? formEntrar() : formRegistro());
    }

    // ------------------------------------------------------------ fase 13: el teléfono que comparte
    /** En un teléfono que comparte no hay cuentas con contraseña: alias (con el código o el QR de un
        espacio) o la cuenta de la nube si este equipo tiene Internet. El dueño entra solo. */
    function pintarTelefono() {
      tarjeta.innerHTML = "";
      const propio = NOM.anfitrion && NOM.anfitrion.esLocal();
      if (propio) {
        const f = html(`<div class="col" style="align-items:center;text-align:center">
          <div class="burbuja">${ico("smartphone")}</div>
          <h2>Entrando a tu teléfono…</h2>
          <p class="suave" style="font-weight:650">Este teléfono comparte sin Internet. Aquí eres su dueño, con un alias que se elige al azar: así lo verán los demás.</p>
          <div class="alerta error" data-alerta hidden role="alert"></div>
          <button class="btn primario ancho" data-dueno hidden>${ico("log-in")} Entrar a mi teléfono</button></div>`);
        tarjeta.append(f);
        enlazarComunes(f);
        const b = $("[data-dueno]", f), al = $("[data-alerta]", f);
        const intentar = async () => {
          b.disabled = true;
          try {
            const r = await NOM.acceso.entrarComoDueno();
            if (NOM.bienvenida) NOM.bienvenida(r.usuario, false);
            NOM.app.alIniciarSesion(r);
          } catch (e) {
            al.hidden = false; al.className = "alerta error";
            al.innerHTML = `${ico("triangle-alert")}<span>${esc(e.message)}</span>`;
            b.hidden = false; b.disabled = false;
          }
        };
        b.onclick = intentar;
        intentar();
        return;
      }
      const f = html(`<div class="col">
        <div><h2>Un teléfono que comparte</h2><p class="suave" style="font-weight:650;margin-top:4px">Aquí no se crean cuentas ni se escribe contraseña: entra a un espacio con su <b>código</b> o su <b>QR</b> y te toca un alias al azar. Si este equipo tiene Internet, también puedes entrar con tu cuenta.</p></div>
        <div class="alerta" data-alerta hidden role="alert"></div>
        <div class="col" data-guardados></div>
        ${NOM.qr && NOM.qr.hayCamara() ? `<button type="button" class="btn primario ancho" data-escanear>${ico("qr-code")} Escanear el código QR</button>` : ""}
        <button type="button" class="btn ${NOM.qr && NOM.qr.hayCamara() ? "" : "primario"} ancho" data-codigo>${ico("key-round")} Tengo un código de invitación</button>
        <button type="button" class="btn ancho" data-mi-cuenta hidden>${ico("cloud")} <span class="btn-sub">Entrar con mi cuenta<small>Este equipo tiene Internet: lo tuyo queda a tu nombre</small></span></button>
        <p class="suave chico" data-sin-internet style="text-align:center">${ico("wifi-off", "ico-s")} Revisando si este equipo tiene Internet…</p>
        <div class="fila" style="gap:10px;color:var(--tinta-suave);font-size:13px;font-weight:700"><span style="flex:1;height:1px;background:var(--borde-fuerte)"></span>o<span style="flex:1;height:1px;background:var(--borde-fuerte)"></span></div>
        <button type="button" class="btn ancho" data-sin-cuenta data-micro="Usar sin cuenta|Trabaja sin registrarte. Tus documentos se guardan solo ${NOM.aqui().en}: si ${NOM.aqui().borrar} se pierden, salvo que los descargues.">${ico("hard-drive")} <span class="btn-sub">Usar sin cuenta<small>Tus documentos se quedan solo ${NOM.aqui().en}</small></span></button>
      </div>`);
      tarjeta.append(f);
      enlazarComunes(f);
      // Los alias que este equipo ya tiene en este teléfono: se vuelve a entrar sin el código.
      NOM.acceso.infoServidor().then((i) => {
        const ls = NOM.acceso.aliasDeEsteServidor(i.servidor), cont = $("[data-guardados]", f);
        if (!ls.length || !cont) return;
        cont.innerHTML = `<span class="etiqueta">Ya entraste desde este equipo</span>` + ls.slice(0, 4).map((g, k) => `<button type="button" class="btn ancho" data-g="${k}">${ico("sparkles")} <span class="btn-sub">Seguir como ${esc(g.nombre)}<small>${esc(g.espacio || "Espacio")}</small></span></button>`).join("");
        $$("[data-g]", cont).forEach((b) => (b.onclick = async () => {
          b.disabled = true;
          try {
            const r = await NOM.acceso.volverConAlias(ls[+b.dataset.g]);
            NOM.app.alIniciarSesion(r);
          } catch (e) {
            b.disabled = false;
            const al = $("[data-alerta]", f);
            al.hidden = false; al.className = "alerta error";
            al.innerHTML = `${ico("triangle-alert")}<span>${esc(e.message)}</span>`;
          }
        }));
      }).catch(() => {});
      const esc2 = $("[data-escanear]", f);
      if (esc2) esc2.onclick = () => NOM.union && NOM.union.escanear();
      $("[data-codigo]", f).onclick = async () => {
        const c = await NOM.pedirTexto("Código para unirse", { etiqueta: "El código que te dio quien comparte el espacio", ph: "ABCD-2345", si: "Entrar", max: 60 });
        if (c && NOM.union) NOM.union.usar(c);
      };
      const mi = $("[data-mi-cuenta]", f), sinInt = $("[data-sin-internet]", f);
      NOM.acceso.nubeAlcanzable().then((ok) => {
        if (!mi.isConnected) return;
        mi.hidden = !ok;
        sinInt.innerHTML = ok ? "" : `${ico("wifi-off", "ico-s")} Este equipo no tiene Internet: entra con el código o el QR de un espacio.`;
      });
      mi.onclick = async () => {
        const r = await NOM.acceso.dialogoCuenta();
        if (!r) return;
        if (NOM.bienvenida) NOM.bienvenida(r.usuario, false);
        NOM.app.alIniciarSesion(r);
      };
    }

    function cabecera(titulo, sub) {
      return `<div class="segmentado lleno" role="group" aria-label="Elegir acción">
          <button type="button" data-ir="entrar" aria-pressed="${modo === "entrar"}">Iniciar sesión</button>
          <button type="button" data-ir="registro" aria-pressed="${modo === "registro"}">Crear cuenta</button>
        </div>
        <div><h2>${titulo}</h2><p class="suave" style="font-weight:650;margin-top:4px">${sub}</p></div>`;
    }

    function enlazarComunes(f) {
      f.querySelectorAll("[data-sin-cuenta]").forEach((b) => (b.onclick = () => NOM.app.sinCuenta()));
      f.querySelectorAll("[data-ir]").forEach((b) => (b.onclick = () => { if (modo === b.dataset.ir) return; modo = b.dataset.ir; render(); }));
      f.querySelectorAll("[data-ver]").forEach((b) => (b.onclick = () => {
        const i = b.parentElement.querySelector("input");
        const ver = i.type === "password";
        i.type = ver ? "text" : "password";
        b.innerHTML = ico(ver ? "eye-off" : "eye");
        b.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
        i.focus();
      }));
      f.querySelectorAll('input[type="password"]').forEach((i) => {
        const avisoMayus = i.closest(".campo").querySelector("[data-mayus]");
        const rev = (e) => { if (e.getModifierState) avisoMayus.hidden = !e.getModifierState("CapsLock"); };
        i.addEventListener("keyup", rev); i.addEventListener("keydown", rev);
      });
      // En la red local se viaja por http:// (ahí no hay forma de dar un certificado de confianza):
      // se avisa para que se use solo en un Wi-Fi conocido. En el propio equipo no hace falta.
      const dir = api.empaquetada ? api.servidor() : location.origin;
      const equipo = (dir.replace(/^https?:\/\//i, "").match(/^\[[^\]]*\]|^[^/:]+/) || [""])[0].toLowerCase();
      if (/^http:/i.test(dir) && !/^(localhost|127(\.\d+){3}|\[::1\])$/.test(equipo))
        f.append(html(`<p class="servidor-pie" data-sin-cifrar>${ico("triangle-alert", "ico-s")}<span><b>Conexión sin cifrar (red local).</b> Úsala solo en un Wi-Fi de confianza: quien esté en la misma red podría ver lo que se envía.</span></p>`));
      // En la app: a qué servidor se conecta, dicho en palabras, y cómo cambiarlo (para equipos que
      // usan NOM-COLAB en su propia red, sin Internet).
      if (NOM.anfitrion && NOM.anfitrion.esLocal()) {
        const p = NOM.anfitrion.pie();
        if (p) f.append(p);
      } else if (api.empaquetada) {
        const srv = api.servidor().replace(/^https?:\/\//, "");
        const internet = /(^|\.)nomcolab\.dpdns\.org$|azurewebsites\.net|\.ts\.net$/.test(srv.replace(/\/.*$/, ""));
        const s = html(`<p class="servidor-pie">${ico(internet ? "globe" : "wifi", "ico-s")}<span>Trabajas en <b>${internet ? "NOM-COLAB en Internet" : "un equipo del Wi-Fi · " + esc(srv)}</b></span>
          <button type="button" data-micro="Cambiar dónde trabajas|Si tu equipo usa NOM-COLAB en otro lugar (en Internet, o en una computadora o teléfono del mismo Wi-Fi), elígelo aquí.">Cambiar</button></p>`);
        $("button", s).onclick = () => pintarServidor(tarjeta, render, { cambiar: true });
        f.append(s);
      } else {
        // En un navegador normal (no la app): un enlace para descargar la app de Android. El
        // archivo lo entrega la red de GitHub (Fastly), no la conexión del servidor, y
        // ".../releases/latest/..." trae siempre la versión más reciente que se haya publicado.
        f.append(html(`<p class="servidor-pie">${ico("smartphone", "ico-s")}<span>¿Usas Android? <a href="https://github.com/TruTruMaster/NOM-COLAB/releases/latest/download/NOM-COLAB.apk" rel="noopener" data-micro="Descargar la app para Android|Se descarga desde la red de GitHub, así que no gasta los datos del servidor. Ábrela en el teléfono para instalarla; trae siempre la versión más reciente."><b>Descarga la app</b></a> · siempre la más reciente</span></p>`));
      }
    }

    function mostrarError(f, err) {
      const caja = $("[data-alerta]", f);
      f.querySelectorAll(".entrada").forEach((x) => x.classList.remove("invalida"));
      f.querySelectorAll(".error-campo").forEach((x) => x.remove());
      clearInterval(f._cuenta);
      if (err.campo) {
        const i = f.querySelector(`[name="${err.campo}"]`);
        if (i) {
          i.closest(".entrada").classList.add("invalida");
          i.closest(".campo").append(html(`<div class="error-campo">${ico("triangle-alert", "ico-s")} ${esc(err.message)}</div>`));
          i.focus();
          caja.hidden = true;
          return;
        }
      }
      const bloqueo = err.estado === 423 && err.detalle && err.detalle.bloqueadoHasta;
      caja.className = "alerta " + (bloqueo ? "aviso" : "error");
      caja.hidden = false;
      const pintarMsg = () => {
        let m = err.message;
        if (bloqueo) {
          const s = Math.max(0, Math.round((err.detalle.bloqueadoHasta - Date.now()) / 1000));
          m = s > 0 ? `Por seguridad, la cuenta está bloqueada. Podrás intentar de nuevo en ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}.` : "Ya puedes intentar de nuevo.";
          if (s <= 0) { clearInterval(f._cuenta); $("button[type=submit]", f).disabled = false; }
        }
        caja.innerHTML = `${ico(bloqueo ? "lock" : "triangle-alert")}<span>${esc(m)}</span>`;
      };
      pintarMsg();
      if (bloqueo) { $("button[type=submit]", f).disabled = true; f._cuenta = setInterval(pintarMsg, 1000); }
      const t = $("[data-tarjeta]", vista);
      t.classList.remove("sacudir"); void t.offsetWidth; t.classList.add("sacudir");
    }

    /** Abre la sesión (también justo después de registrarse) y da la bienvenida. */
    async function iniciarSesion(nombre, contrasena, nuevo) {
      const r = await api.post("/api/cuentas/sesion", { nombre, contrasena }, { sin401: true, ms: ESPERA_BD });
      NOM.guardar("nom.ultimoNombre", nombre);
      api.fijarSesion(r.token, r.usuario);
      // La contraseña abre la bóveda cifrada de esta cuenta en este equipo (y no se guarda).
      try { await NOM.boveda.abrir(r.usuario.id, contrasena); }
      catch (e) { console.error(e); NOM.aviso("Este navegador no permite guardar documentos cifrados; se trabajará solo en línea.", { tipo: "aviso", ms: 6000 }); }
      NOM.aplicarPreferencias(r.preferencias);
      if (NOM.bienvenida) NOM.bienvenida(r.usuario, nuevo);
      NOM.app.alIniciarSesion(r);
      // Tras la bienvenida: ¿quedó algo en este equipo guardado con la contraseña anterior?
      setTimeout(() => ofrecerRecuperar(true).catch((e) => console.error(e)), nuevo ? 2600 : 1700);
    }

    async function enviando(f, fn) {
      const b = $("button[type=submit]", f);
      const original = b.innerHTML;
      b.disabled = true;
      b.innerHTML = `<span class="cargando"></span>`;
      // En Azure la base de datos gratuita se pausa sin uso y tarda ~1 min en despertar.
      const lento = setTimeout(() => { if (b.isConnected) b.innerHTML = `<span class="cargando"></span> Conectando con la base de datos…`; }, 4000);
      try { await fn(); } catch (e) { mostrarError(f, e); }
      finally { clearTimeout(lento); if (b.isConnected && !f._cuenta) { b.disabled = false; b.innerHTML = original; } else if (b.isConnected) b.innerHTML = original; }
    }

    function formEntrar() {
      const f = html(`<form class="col" novalidate>
        ${cabecera("Hola de nuevo", "Entra para ver tus espacios y documentos.")}
        <div class="alerta" data-alerta hidden role="alert"></div>
        <div class="campo"><label for="u">Usuario</label>
          <div class="entrada">${ico("user")}<input id="u" name="nombre" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${esc(opc.nombre || NOM.leer("nom.ultimoNombre", ""))}"></div></div>
        ${campoContrasena("c", "current-password").replace('id="c"', 'id="c" name="contrasena"')}
        <button class="btn primario ancho" type="submit">Entrar ${ico("arrow-right")}</button>
        <p class="suave chico" style="text-align:center">¿Primera vez? <a href="#" data-ir2="registro">Crea tu cuenta en un minuto</a> · <a href="#" data-olvide>¿Olvidaste tu contraseña?</a></p>
        <button type="button" class="btn ancho" data-codigo>${ico("qr-code")} Tengo un código de invitación</button>
        <div class="fila" style="gap:10px;color:var(--tinta-suave);font-size:13px;font-weight:700"><span style="flex:1;height:1px;background:var(--borde-fuerte)"></span>o<span style="flex:1;height:1px;background:var(--borde-fuerte)"></span></div>
        <button type="button" class="btn ancho" data-sin-cuenta data-micro="Usar sin cuenta|Trabaja sin registrarte. Tus documentos se guardan solo ${NOM.aqui().en}: si ${NOM.aqui().borrar} se pierden, salvo que los descargues.">${ico("hard-drive")} <span class="btn-sub">Usar sin cuenta<small>Tus documentos se quedan solo ${NOM.aqui().en}</small></span></button>
      </form>`);
      enlazarComunes(f);
      $("[data-ir2]", f).onclick = (e) => { e.preventDefault(); modo = "registro"; render(); };
      $("[data-olvide]", f).onclick = (e) => { e.preventDefault(); recuperar(f.nombre.value.trim()); };
      $("[data-codigo]", f).onclick = entrarConCodigo;
      f.onsubmit = (e) => {
        e.preventDefault();
        const nombre = f.nombre.value.trim(), contrasena = f.contrasena.value;
        if (!nombre) return mostrarError(f, { campo: "nombre", message: "Escribe tu usuario" });
        if (!contrasena) return mostrarError(f, { campo: "contrasena", message: "Escribe tu contraseña" });
        enviando(f, () => iniciarSesion(nombre, contrasena, false));
      };
      setTimeout(() => (f.nombre.value ? f.contrasena : f.nombre).focus(), 30);
      return f;
    }

    function formRegistro() {
      const f = html(`<form class="col" novalidate>
        ${cabecera("Crea tu cuenta", "Solo necesitas un nombre de usuario y una contraseña.")}
        <div class="alerta" data-alerta hidden role="alert"></div>
        <div class="campo"><label for="ru">Nombre de usuario</label>
          <div class="entrada">${ico("user")}<input id="ru" name="nombre" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="24" required></div>
          <div class="ayuda">De 3 a 24 letras o números, sin espacios. Así te verán los demás.</div></div>
        ${campoContrasena("rc", "new-password").replace('id="rc"', 'id="rc" name="contrasena"')}
        <div class="fila"><div class="medidor crece" data-medidor data-n="0"><i></i><i></i><i></i><i></i></div><span class="chico suave" data-fuerza style="min-width:70px;text-align:right;font-weight:750"></span></div>
        <div class="campo"><label for="re">Escuela, empresa o grupo <span class="suave" style="font-weight:600">(opcional)</span></label>
          <div class="entrada">${ico("door-open")}<input id="re" name="empresa" autocomplete="organization" maxlength="80" placeholder="Ej. CECyT 11 Wilfredo Massieu"></div></div>
        <button class="btn primario ancho" type="submit">Crear cuenta ${ico("sparkles")}</button>
        <p class="suave chico" style="text-align:center">Tu contraseña se guarda protegida: nadie puede verla, ni quien administra NOM-COLAB.</p>
        <div class="fila" style="gap:10px;color:var(--tinta-suave);font-size:13px;font-weight:700"><span style="flex:1;height:1px;background:var(--borde-fuerte)"></span>o<span style="flex:1;height:1px;background:var(--borde-fuerte)"></span></div>
        <button type="button" class="btn ancho" data-sin-cuenta data-micro="Usar sin cuenta|Trabaja sin registrarte. Tus documentos se guardan solo ${NOM.aqui().en}: si ${NOM.aqui().borrar} se pierden, salvo que los descargues.">${ico("hard-drive")} <span class="btn-sub">Usar sin cuenta<small>Tus documentos se quedan solo ${NOM.aqui().en}</small></span></button>
      </form>`);
      enlazarComunes(f);
      f.contrasena.addEventListener("input", () => {
        const n = fuerza(f.contrasena.value);
        $("[data-medidor]", f).dataset.n = n;
        $("[data-fuerza]", f).textContent = f.contrasena.value.length && f.contrasena.value.length < 8 ? `Faltan ${8 - f.contrasena.value.length}` : textoFuerza[n];
      });
      f.onsubmit = (e) => {
        e.preventDefault();
        const nombre = f.nombre.value.trim(), contrasena = f.contrasena.value, empresa = f.empresa.value.trim();
        if (!nombre) return mostrarError(f, { campo: "nombre", message: "Escribe un nombre de usuario" });
        if (!/^[\p{L}\p{N}._-]{3,24}$/u.test(nombre)) return mostrarError(f, { campo: "nombre", message: "Usa de 3 a 24 letras, números, punto, guion o guion bajo, sin espacios" });
        if (contrasena.length < 8) return mostrarError(f, { campo: "contrasena", message: "La contraseña necesita al menos 8 letras, números o signos" });
        enviando(f, async () => {
          const reg = await api.post("/api/cuentas/registro", { nombre, contrasena, empresa }, { ms: ESPERA_BD });
          // El código de recuperación solo se ve ahora: primero se guarda, después se entra.
          if (reg && reg.recuperacion) await mostrarCodigo(reg.recuperacion, nombre);
          tarjeta.innerHTML = "";
          tarjeta.append(html(`<div class="col" style="align-items:center;text-align:center;padding:24px 0">
            <div class="exito-check">${ico("check")}</div>
            <h2>¡Registro exitoso!</h2>
            <p class="suave" style="font-weight:650">Tu cuenta <b>${esc(nombre)}</b> está lista. Entrando…</p></div>`));
          // Sin volver a escribir la contraseña: se entra directo (si algo falla, al formulario de entrar).
          setTimeout(async () => {
            try { await iniciarSesion(nombre, contrasena, true); }
            catch (e) { opc.nombre = nombre; modo = "entrar"; render(); }
          }, 1200);
        });
      };
      setTimeout(() => f.nombre.focus(), 30);
      return f;
    }

    // ¿Es un teléfono que comparte? Lo último que se supo, y luego se confirma con el servidor.
    const ig = NOM.acceso && NOM.acceso.infoGuardada();
    if (ig && NOM.acceso.esTelefono(ig)) pintarTelefono();
    else render();
    if (NOM.acceso) NOM.acceso.infoServidor().then((i) => {
      if (!tarjeta.isConnected || api.token()) return;
      if (NOM.acceso.esTelefono(i)) { if (!(ig && NOM.acceso.esTelefono(ig))) pintarTelefono(); }
      else if (ig && NOM.acceso.esTelefono(ig)) render();
    }).catch(() => {});
    // En la app, al volver a la nube: si quedó guardada su sesión (al irse a un teléfono), se retoma.
    if (NOM.acceso && api.empaquetada && NOM.acceso.sesionNube()) NOM.acceso.retomarNube().then((ok) => { if (ok) NOM.app.alIniciarSesion({}); }).catch(() => {});
  }

  /** Solo en la app Android: elegir el equipo de la red que comparte los espacios. */
  function pintarServidor(tarjeta, listo, opc) {
    tarjeta.innerHTML = "";
    const f = html(`<form class="col">
      <div><h2>¿Dónde trabaja tu equipo?</h2><p class="suave" style="font-weight:650;margin-top:4px">Si te dieron un código QR, escanéalo y listo. Si no, elige una opción.</p></div>
      <div class="alerta" data-alerta hidden></div>
      <button type="button" class="btn primario ancho" data-escanear>${ico("qr-code")} Escanear el código QR</button>
      <button type="button" class="btn ancho" data-internet>${ico("cloud")} <span class="btn-sub">Usar NOM-COLAB en Internet<small>Desde cualquier lugar, con datos o Wi-Fi</small></span></button>
      ${window.NomAndroid && window.NomAndroid.buscarServidores ? `<button type="button" class="btn ancho" data-buscar>${ico("radio")} <span class="btn-sub">Buscar en este Wi-Fi<small>Una computadora o un teléfono que ya comparte</small></span></button>` : ""}
      <div class="lista" data-encontrados></div>
      <details><summary class="etiqueta" style="cursor:pointer">Escribir la dirección a mano</summary>
        <div class="col" style="margin-top:10px">
          <div class="campo"><label for="srv">Dirección que te dieron</label>
            <div class="entrada">${ico("server")}<input id="srv" inputmode="url" autocapitalize="none" placeholder="192.168.1.20:8080" value="${esc(api.servidor().replace(/^https?:\/\//, ""))}"></div></div>
          <button class="btn crece" type="submit">Conectar</button>
        </div>
      </details>
      <div class="fila" style="gap:10px;color:var(--tinta-suave);font-size:13px;font-weight:700"><span style="flex:1;height:1px;background:var(--borde-fuerte)"></span>o<span style="flex:1;height:1px;background:var(--borde-fuerte)"></span></div>
        <button type="button" class="btn ancho" data-sin-cuenta data-micro="Usar sin cuenta|Trabaja sin registrarte. Tus documentos se guardan solo ${NOM.aqui().en}: si ${NOM.aqui().borrar} se pierden, salvo que los descargues.">${ico("hard-drive")} <span class="btn-sub">Usar sin cuenta<small>Tus documentos se quedan solo ${NOM.aqui().en}</small></span></button>
      <p class="suave chico" style="text-align:center">Sin cuenta puedes crear y editar documentos en este teléfono; nadie más los ve hasta que los subas a un espacio.</p>
    </form>`);
    f.querySelector("[data-sin-cuenta]").onclick = () => NOM.app.sinCuenta();
    // 2.1 En la app: el QR trae la dirección del servidor y el código; el espacio se abre aquí, en la app.
    f.querySelector("[data-escanear]").onclick = () => NOM.union && NOM.union.escanear();
    f.querySelector("[data-internet]").onclick = () => probar("https://nomcolab.dpdns.org");
    // El teléfono también puede ser el servidor de la red (Android 8+).
    const propio = NOM.anfitrion && NOM.anfitrion.opcion(listo);
    if (propio) f.querySelector("[data-alerta]").before(propio);
    tarjeta.append(f);
    const alerta = $("[data-alerta]", f);
    async function probar(dir) {
      const anterior = api.servidor();
      api.fijarServidor(dir);
      try {
        const info = await api.get("/api/red/info", undefined, { ms: 4000 });
        if (info.nom !== 1) throw new Error();
        NOM.aviso("Conectado con " + info.equipo, { tipo: "ok" });
        if (NOM.revisarVersion) NOM.revisarVersion(info);
        listo();
      } catch (e) {
        api.fijarServidor(anterior);
        alerta.className = "alerta error"; alerta.hidden = false;
        alerta.innerHTML = `${ico("wifi-off")}<span>No encontramos NOM-COLAB en esa dirección. Revisa que estés en el mismo Wi-Fi que el equipo que comparte (o que tengas Internet, si es la versión en línea).</span>`;
      }
    }
    f.onsubmit = (e) => { e.preventDefault(); if (f.srv.value.trim()) probar(f.srv.value.trim()); };
    const b = $("[data-buscar]", f);
    if (b) b.onclick = () => {
      b.disabled = true; b.innerHTML = `<span class="cargando"></span> Buscando…`;
      window.__nomServidores = (json) => {
        b.disabled = false; b.innerHTML = `${ico("radio")} Buscar de nuevo`;
        const lista = JSON.parse(json || "[]");
        const cont = $("[data-encontrados]", f);
        cont.innerHTML = lista.length ? "" : `<p class="suave chico">No apareció ningún equipo. Pide al propietario que active la "Conexión del proyecto".</p>`;
        lista.forEach((s) => {
          const it = html(`<button type="button" class="lista-item" style="text-align:left">${ico("server")}<span class="crece"><b>${esc(s.equipo)}</b><small>${esc(s.host)}:${s.puerto} · ${s.espacios} espacio(s) en red</small></span>${ico("chevron-right")}</button>`);
          it.onclick = () => probar(s.host + ":" + s.puerto);
          cont.append(it);
        });
        // Primera vez: si en el Wi-Fi hay un solo servidor, se conecta solo.
        if (automatico && lista.length === 1) probar(lista[0].host + ":" + lista[0].puerto);
        automatico = false;
      };
      window.NomAndroid.buscarServidores();
    };
    // Al abrir la app se busca sin que haya que tocar nada. Solo la primera vez se conecta sola:
    // si la persona tocó "Cambiar", o ya empezó a tocar algo de esta pantalla, decide ella.
    let automatico = !!b && !(opc && opc.cambiar);
    f.addEventListener("pointerdown", () => { automatico = false; }, { capture: true });
    if (b) b.click();
  }

  NOM.vistaCuentas = { pintar, mostrarCodigo, recuperar, cambiarContrasena, borrarCuenta, ofrecerRecuperar };
})();
