/* NOM-COLAB · Módulo 1: Gestión de cuentas (diagramas A1 Crear usuario y A2 Iniciar sesión). */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, api } = { ...NOM, api: NOM.api };

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
            <p class="lema">Texto, hojas de cálculo, presentaciones y diagramas en tiempo real: en tu red local aunque falle el Internet, o en línea desde cualquier lugar.</p>
          </div>
          <div class="valores">
            <div class="valor clay"><span class="modo-insignia modo-TEXTO">${ico("layers")}</span><div><b>Cuatro tipos, una app</b><span>Texto, hojas, presentaciones y diagramas</span></div></div>
            <div class="valor clay"><span class="modo-insignia modo-HOJA">${ico("wifi")}</span><div><b>Funciona en tu red</b><span>Colabora aunque falle el Internet</span></div></div>
            <div class="valor clay"><span class="modo-insignia modo-DIAGRAMA">${ico("users")}</span><div><b>En tiempo real</b><span>Hasta 5 personas en el mismo espacio</span></div></div>
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

    function cabecera(titulo, sub) {
      return `<div class="segmentado lleno" role="group" aria-label="Elegir acción">
          <button type="button" data-ir="entrar" aria-pressed="${modo === "entrar"}">Iniciar sesión</button>
          <button type="button" data-ir="registro" aria-pressed="${modo === "registro"}">Crear cuenta</button>
        </div>
        <div><h2>${titulo}</h2><p class="suave" style="font-weight:650;margin-top:4px">${sub}</p></div>`;
    }

    function enlazarComunes(f) {
      f.querySelectorAll("[data-sin-cuenta]").forEach((b) => (b.onclick = () => NOM.app.sinCuenta()));
      f.querySelectorAll("[data-ir]").forEach((b) => (b.onclick = () => { modo = b.dataset.ir; render(); }));
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
      // En la app: a qué servidor se conecta, dicho en palabras, y cómo cambiarlo (para equipos que
      // usan NOM-COLAB en su propia red, sin Internet).
      if (NOM.anfitrion && NOM.anfitrion.esLocal()) {
        const p = NOM.anfitrion.pie();
        if (p) f.append(p);
      } else if (api.empaquetada) {
        const srv = api.servidor().replace(/^https?:\/\//, "");
        const internet = /azurewebsites\.net/.test(srv);
        const s = html(`<p class="servidor-pie">${ico(internet ? "globe" : "wifi", "ico-s")}<span>Conectado a <b>${internet ? "NOM-COLAB en Internet" : "tu red · " + esc(srv)}</b></span>
          <button type="button" data-micro="Cambiar de servidor|Si tu equipo usa NOM-COLAB en su propia red (aunque no haya Internet), elige aquí ese equipo.">Cambiar</button></p>`);
        $("button", s).onclick = () => pintarServidor(tarjeta, render);
        f.append(s);
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
      if (r.usuario.rol === "ADMINISTRADOR") NOM.aviso("Entraste como Administrador: tienes acceso a Administrar usuarios", { tipo: "info", ms: 4500 });
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
        ${cabecera("Bienvenido de vuelta", "Entra para ver tus espacios de trabajo.")}
        <div class="alerta" data-alerta hidden role="alert"></div>
        <div class="campo"><label for="u">Usuario</label>
          <div class="entrada">${ico("users")}<input id="u" name="nombre" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${esc(opc.nombre || NOM.leer("nom.ultimoNombre", ""))}"></div></div>
        ${campoContrasena("c", "current-password").replace('id="c"', 'id="c" name="contrasena"')}
        <button class="btn primario ancho" type="submit">Entrar ${ico("arrow-right")}</button>
        <p class="suave chico" style="text-align:center">¿Primera vez? <a href="#" data-ir2="registro">Crea tu cuenta en un minuto</a></p>
        <div class="fila" style="gap:10px;color:var(--tinta-suave);font-size:13px;font-weight:700"><span style="flex:1;height:1px;background:var(--borde-fuerte)"></span>o<span style="flex:1;height:1px;background:var(--borde-fuerte)"></span></div>
        <button type="button" class="btn ancho" data-sin-cuenta data-micro="Usar sin cuenta|Trabaja sin registrarte. Tus documentos se guardan solo ${NOM.aqui().en}: si ${NOM.aqui().borrar} se pierden, salvo que los descargues.">${ico("hard-drive")} Usar sin cuenta</button>
      </form>`);
      enlazarComunes(f);
      $("[data-ir2]", f).onclick = (e) => { e.preventDefault(); modo = "registro"; render(); };
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
          <div class="entrada">${ico("users")}<input id="ru" name="nombre" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="24" required></div>
          <div class="ayuda">De 3 a 24 caracteres, sin espacios. Así te verán tus compañeros.</div></div>
        ${campoContrasena("rc", "new-password").replace('id="rc"', 'id="rc" name="contrasena"')}
        <div class="fila"><div class="medidor crece" data-medidor data-n="0"><i></i><i></i><i></i><i></i></div><span class="chico suave" data-fuerza style="min-width:70px;text-align:right;font-weight:750"></span></div>
        <div class="campo"><label for="re">Empresa u organización <span class="suave" style="font-weight:600">(opcional)</span></label>
          <div class="entrada">${ico("door-open")}<input id="re" name="empresa" autocomplete="organization" maxlength="80" placeholder="Ej. CECyT 11 Wilfredo Massieu"></div></div>
        <button class="btn primario ancho" type="submit">Crear cuenta ${ico("sparkles")}</button>
        <p class="suave chico" style="text-align:center">Tu contraseña se guarda cifrada; nadie puede leerla, ni el administrador.</p>
        <div class="fila" style="gap:10px;color:var(--tinta-suave);font-size:13px;font-weight:700"><span style="flex:1;height:1px;background:var(--borde-fuerte)"></span>o<span style="flex:1;height:1px;background:var(--borde-fuerte)"></span></div>
        <button type="button" class="btn ancho" data-sin-cuenta data-micro="Usar sin cuenta|Trabaja sin registrarte. Tus documentos se guardan solo ${NOM.aqui().en}: si ${NOM.aqui().borrar} se pierden, salvo que los descargues.">${ico("hard-drive")} Usar sin cuenta</button>
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
        if (contrasena.length < 8) return mostrarError(f, { campo: "contrasena", message: "La contraseña necesita al menos 8 caracteres" });
        enviando(f, async () => {
          await api.post("/api/cuentas/registro", { nombre, contrasena, empresa }, { ms: ESPERA_BD });
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

    render();
  }

  /** Solo en la app Android: elegir el equipo de la red que comparte los espacios. */
  function pintarServidor(tarjeta, listo) {
    tarjeta.innerHTML = "";
    const f = html(`<form class="col">
      <div><h2>Conecta con tu red</h2><p class="suave" style="font-weight:650;margin-top:4px">Escribe la dirección del equipo que tiene NOM-COLAB abierto, búscalo en tu Wi-Fi o usa la versión en Internet: <b>nomcolab-wack.azurewebsites.net</b>.</p></div>
      <div class="alerta" data-alerta hidden></div>
      <div class="campo"><label for="srv">Dirección del servidor</label>
        <div class="entrada">${ico("server")}<input id="srv" inputmode="url" autocapitalize="none" placeholder="192.168.1.20:8080" value="${esc(api.servidor().replace(/^https?:\/\//, ""))}"></div></div>
      <div class="lista" data-encontrados></div>
      <div class="fila">
        ${window.NomAndroid && window.NomAndroid.buscarServidores ? `<button type="button" class="btn crece" data-buscar>${ico("radio")} Buscar en la red</button>` : ""}
        <button class="btn primario crece" type="submit">Conectar</button>
      </div>
      <div class="fila" style="gap:10px;color:var(--tinta-suave);font-size:13px;font-weight:700"><span style="flex:1;height:1px;background:var(--borde-fuerte)"></span>o<span style="flex:1;height:1px;background:var(--borde-fuerte)"></span></div>
        <button type="button" class="btn ancho" data-sin-cuenta data-micro="Usar sin cuenta|Trabaja sin registrarte. Tus documentos se guardan solo ${NOM.aqui().en}: si ${NOM.aqui().borrar} se pierden, salvo que los descargues.">${ico("hard-drive")} Usar sin cuenta</button>
      <p class="suave chico" style="text-align:center">Sin servidor puedes crear y editar documentos en este teléfono; no se comparten hasta que los subas a un espacio.</p>
    </form>`);
    f.querySelector("[data-sin-cuenta]").onclick = () => NOM.app.sinCuenta();
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
        listo();
      } catch (e) {
        api.fijarServidor(anterior);
        alerta.className = "alerta error"; alerta.hidden = false;
        alerta.innerHTML = `${ico("wifi-off")}<span>No encontramos NOM-COLAB en esa dirección. Revisa que estés en la misma red Wi-Fi.</span>`;
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
    // Al abrir la app se busca sin que haya que tocar nada.
    let automatico = !!b;
    if (b) b.click();
  }

  NOM.vistaCuentas = { pintar };
})();
