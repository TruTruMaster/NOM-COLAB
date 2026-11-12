/* NOM-COLAB · Inicio y Módulo 3 (Espacios de trabajo): lista, crear (A3), unirse (A4),
   gestión de accesos (A5), almacenamiento (A7), preferencias y nuevo documento. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, api, aviso, hoja, confirmar, haceCuanto, bytes, avatar, MODOS } = { ...NOM, api: NOM.api };

  const PERMISOS = { PROPIETARIO: "Propietario", EDICION: "Puede editar", LECTURA: "Solo puede ver" };
  const inicial = (s) => esc((String(s || "?").trim()[0] || "?").toUpperCase());
  function saludo() {
    const h = new Date().getHours();
    return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  }
  const recientes = () => NOM.leer(api.clave("recientes"), []);
  NOM.anotarReciente = (doc, espacio) => {
    const r = recientes().filter((x) => x.id !== doc.id);
    r.unshift({ id: doc.id, nombre: doc.nombre, modo: doc.modo, espacio: espacio && espacio.nombre, espacioId: espacio && espacio.id, cuando: Date.now() });
    NOM.guardar(api.clave("recientes"), r.slice(0, 6));
  };

  // ================================================================== Inicio
  async function inicio(cont) {
    if (NOM.local.activo()) return inicioSinCuenta(cont);
    const u = api.usuario() || {};
    cont.innerHTML = `
      <div class="encabezado">
        <div><h1>${saludo()}, ${esc(u.nombre || "")}</h1>
          <p class="sub">${esc(new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }))}</p></div>
        <div class="fila solo-escritorio" data-acciones-inicio>
          <button class="btn" data-a="unirse" data-micro="Unirse a un espacio|Entra al espacio de otra persona con su código o su QR.">${ico("qr-code")} Tengo un código</button>
          <button class="btn primario" data-a="nuevo">${ico("plus")} Nuevo espacio</button>
        </div>
      </div>
      <div data-recientes></div>
      <section class="seccion">
        <div class="fila-e"><h2>Tus espacios</h2><span class="chip" data-cuantos></span></div>
        <div class="rejilla" data-espacios>${'<div class="esqueleto" style="height:150px"></div>'.repeat(3)}</div>
      </section>
      <section class="seccion" data-locales></section>`;
    seccionLocal($("[data-locales]", cont), true);
    $("[data-a=unirse]", cont).onclick = unirse;
    $("[data-a=nuevo]", cont).onclick = nuevoEspacio;

    const rec = recientes().slice(0, 3);
    if (rec.length) {
      const cajas = rec.map((r, i) => `
        <a class="continuar clay tarjeta modo-${esc(r.modo)}" href="#/doc/${esc(r.id)}" style="${i ? "padding:14px 18px" : ""}">
          <span class="modo-insignia">${ico(MODOS[r.modo] ? MODOS[r.modo].icono : "file-text")}</span>
          <span class="crece"><span class="suave chico" style="font-weight:800">${i ? "" : "Continúa donde lo dejaste · "}${esc(r.espacio || "")}</span>
            <span class="titulo recorta" style="display:block">${esc(r.nombre)}</span>
            <span class="suave chico">${esc(haceCuanto(r.cuando))}</span></span>
          ${ico("chevron-right")}
        </a>`).join("");
      $("[data-recientes]", cont).innerHTML = `<div class="rejilla" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${cajas}</div>`;
    }

    let lista;
    try {
      lista = await api.get("/api/espacios");
      NOM.guardar(api.clave("cache.espacios"), lista);
    } catch (e) {
      lista = NOM.leer(api.clave("cache.espacios"), []);
      if (e.red) aviso("Sin conexión: mostramos tus espacios guardados en este equipo", { tipo: "aviso" });
    }
    NOM.app.fijarEspacios(lista);
    const rej = $("[data-espacios]", cont);
    if (!rej) return;
    // Sin espacios, la tarjeta de primeros pasos y los botones de arriba repetirían lo mismo que el
    // aviso de abajo: se deja un solo lugar con las dos opciones.
    if (NOM.primerosPasos && lista.length) NOM.primerosPasos($(".encabezado", cont), lista);
    $("[data-cuantos]", cont).textContent = lista.length ? lista.length + (lista.length === 1 ? " espacio" : " espacios") : "";
    $("[data-cuantos]", cont).hidden = !lista.length;
    if (!lista.length) {
      const arriba = $("[data-acciones-inicio]", cont); if (arriba) arriba.hidden = true;
      NOM.app.fijarFab(null);
      rej.outerHTML = `<div class="vacio">
        <div class="burbuja">${ico("layout-grid")}</div>
        <h3>Aún no tienes espacios</h3>
        <p style="max-width:44ch">Un espacio es como una carpeta compartida: ahí guardan sus documentos tú y tu equipo, clase o proyecto.</p>
        <div class="fila" style="flex-wrap:wrap;justify-content:center"><button class="btn primario" data-v="nuevo">${ico("plus")} Crear mi primer espacio</button><button class="btn" data-v="unirse">${ico("qr-code")} Tengo un código para entrar</button></div>
      </div>`;
      $("[data-v=unirse]", cont).onclick = unirse;
      $("[data-v=nuevo]", cont).onclick = nuevoEspacio;
      return;
    }
    rej.innerHTML = lista.map(tarjetaEspacio).join("");
  }

  function tarjetaEspacio(e) {
    const con = (e.conectados || []).slice(0, 4);
    return `<a class="tarjeta tarjeta-espacio clay" href="#/espacio/${esc(e.id)}">
      <div class="fila-e">
        <span class="icono-espacio" style="background:${esc(e.color)};--c:${esc(e.color)}">${inicial(e.nombre)}</span>
        <span class="fila">${e.conexion ? `<span class="chip ok" data-micro="Visible en el Wi-Fi|Quienes estén en el mismo Wi-Fi pueden encontrarlo."><span class="punto vivo"></span>En el Wi-Fi</span>` : ""}
        ${e.solicitudes ? `<span class="chip aviso">${e.solicitudes} solicitud${e.solicitudes > 1 ? "es" : ""}</span>` : ""}
        ${e.avisos ? `<span class="chip acento" data-micro="Menciones|Te mencionaron en comentarios de este espacio.">${ico("at-sign", "ico-s")} ${e.avisos}</span>` : ""}</span>
      </div>
      <div><div class="titulo recorta">${esc(e.nombre)}</div><div class="suave chico" style="font-weight:700">${esc(PERMISOS[e.permiso] || "")}${e.permiso !== "PROPIETARIO" ? " · de " + esc(e.propietario) : ""}</div></div>
      <div class="meta">
        <span>${ico("file-text", "ico-s")} ${e.documentos}</span>
        <span>${ico("users", "ico-s")} ${e.miembros}</span>
        <span>${ico("clock", "ico-s")} ${esc(haceCuanto(e.actividad))}</span>
        ${con.length ? `<span class="avatares" style="margin-left:auto">${con.map((u) => avatar(u)).join("")}</span>` : ""}
      </div>
    </a>`;
  }

  // ================================================================== Crear espacio (A3)
  function nuevoEspacio() {
    const cuerpo = html(`<form class="col" novalidate>
      <div class="alerta" data-alerta hidden></div>
      <div class="campo"><label for="ne">Nombre del espacio</label>
        <div class="entrada"><input id="ne" name="nombre" maxlength="60" placeholder="Ej. Historia 3B o Equipo de ventas" autocomplete="off" autofocus></div>
        <div class="ayuda">Como una carpeta compartida para tu equipo, tu clase o un proyecto.</div></div>
    </form>`);
    const pie = html(`<div style="display:contents"><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>Crear espacio</button></div>`);
    const h = hoja({ titulo: "Nuevo espacio", icono: "plus", cuerpo, pie });
    $("[data-no]", pie).onclick = () => h.cerrar();
    const enviar = async (e) => {
      e && e.preventDefault();
      const nombre = cuerpo.nombre.value.trim();
      const al = $("[data-alerta]", cuerpo);
      if (!nombre) { al.className = "alerta error"; al.hidden = false; al.innerHTML = `${ico("triangle-alert")}<span>Ponle un nombre al espacio</span>`; cuerpo.nombre.focus(); return; }
      $("[data-si]", pie).disabled = true;
      try {
        const esp = await api.post("/api/espacios", { nombre });
        h.cerrar(true);
        listoParaInvitar(esp);
      } catch (err) {
        al.className = "alerta error"; al.hidden = false; al.innerHTML = `${ico("triangle-alert")}<span>${esc(err.message)}</span>`;
        $("[data-si]", pie).disabled = false;
      }
    };
    cuerpo.onsubmit = enviar;
    $("[data-si]", pie).onclick = enviar;
  }

  /** Recién creado: lo siguiente que la gente quiere hacer es invitar a su equipo (no configurar la red). */
  function listoParaInvitar(esp) {
    const cuerpo = html(`<div class="col">
      <div class="exito-check">${ico("check")}</div>
      <p style="text-align:center;font-weight:650"><b>${esc(esp.nombre)}</b> ya está listo.<br><span class="suave">¿Invitas a tu equipo? Les das un código y entran desde su celular o su computadora.</span></p>
    </div>`);
    const pie = html(`<div style="display:contents"><button class="btn" data-no>Después</button><button class="btn primario" data-si>${ico("user-plus")} Invitar ahora</button></div>`);
    const h = hoja({ titulo: "Espacio creado", cuerpo, pie });
    const ir = () => { location.hash = "#/espacio/" + esp.id; };
    $("[data-no]", pie).onclick = () => { h.cerrar(true); ir(); };
    $("[data-si]", pie).onclick = () => { h.cerrar(true); ir(); setTimeout(() => accesos(esp), 350); };
  }

  // ================================================================== Conexión del proyecto (CU-14)
  async function conexion(esp, alCambiar) {
    let d;
    try { d = await api.get(`/api/espacios/${esp.id}`); } catch (e) { return aviso(e.message, { tipo: "error" }); }
    const c = d.conexionDetalle;
    const cuerpo = html(`<div class="col">
      <div class="lista-item" style="padding:14px">
        <span class="modo-insignia" style="background:var(--ok-tenue);color:var(--ok)">${ico("wifi")}</span>
        <span class="crece"><b>Que lo encuentren en el mismo Wi-Fi</b><small>Quien busque espacios desde ese Wi-Fi lo verá y te podrá pedir entrar</small></span>
        <label class="interruptor"><input type="checkbox" ${c.activa ? "checked" : ""} aria-label="Que lo encuentren en el mismo Wi-Fi"><span></span></label>
      </div>
      <div data-detalle></div>
    </div>`);
    const det = $("[data-detalle]", cuerpo);
    const pintar = (c) => {
      det.innerHTML = c.sinRed
        ? `<div class="alerta aviso">${ico("wifi-off")}<span>Este equipo no está conectado a ningún Wi-Fi. Conéctalo para que los demás lo encuentren.</span></div>`
        : c.activa
          ? `<p class="etiqueta">Si no lo encuentran, que escriban esta dirección en su navegador</p>
             <div class="lista">${c.direcciones.map((ip) => `<div class="lista-item">${ico("link")}<span class="crece"><b style="font-family:var(--mono)">http://${esc(ip)}:${c.puerto}</b><small>Equipo ${esc(c.equipo)}</small></span><button class="icono-btn" data-qrdir="http://${esc(ip)}:${c.puerto}" aria-label="Código QR" data-micro="Código QR|Quien lo escanea abre NOM-COLAB de este equipo.">${ico("qr-code")}</button><button class="icono-btn" data-copiar="http://${esc(ip)}:${c.puerto}" aria-label="Copiar" data-micro="Copiar dirección|Pégala en el navegador o en la app de tu compañero.">${ico("copy")}</button></div>`).join("")}</div>
             <p class="suave chico">Lo más fácil para que entren directo, sin pedir permiso: <b>Compartir → Crear código de invitación</b>.</p>`
          : `<div class="alerta info">${ico("lock")}<span>No aparece al buscar. Quienes ya son miembros, o tienen un código de invitación, sí pueden entrar.</span></div>`;
      $$("[data-copiar]", det).forEach((b) => (b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copiar); aviso("Dirección copiada", { tipo: "ok" }); }));
      $$("[data-qrdir]", det).forEach((b) => (b.onclick = () => NOM.anfitrion.qrDireccion(b.dataset.qrdir)));
    };
    pintar(c);
    hoja({ titulo: "Visible en el mismo Wi-Fi", icono: "wifi", cuerpo });
    $("input", cuerpo).onchange = async (e) => {
      try {
        const r = await api.put(`/api/espacios/${esp.id}/conexion`, { activa: e.target.checked });
        pintar(r);
        aviso(r.activa ? "Listo: ya lo encuentran en el mismo Wi-Fi" : "Ya no aparece al buscar en el Wi-Fi", { tipo: "ok" });
        alCambiar && alCambiar();
      } catch (err) { e.target.checked = !e.target.checked; aviso(err.message, { tipo: "error" }); }
    };
  }

  // ================================================================== Unirse (A4)
  function unirse() {
    if (!api.lan) {
      const c0 = html(`<div class="col">
        <p style="font-weight:650">Pídele a quien creó el espacio <b>su código de invitación</b> (un QR o 8 letras). También te puede agregar con tu nombre de usuario: <b>${esc((api.usuario() || {}).nombre || "")}</b>.</p>
        <div class="fila"><button class="btn primario crece" data-qr>${ico("qr-code")} Escanear código QR</button><button class="btn crece" data-codigo>${ico("keyboard")} Escribir código</button></div></div>`);
      const h0 = hoja({ titulo: "Entrar a un espacio", icono: "qr-code", cuerpo: c0 });
      $("[data-qr]", c0).onclick = () => { h0.cerrar(true); NOM.union.escanear(); };
      $("[data-codigo]", c0).onclick = async () => { const c = await NOM.pedirTexto("Escribe el código", { etiqueta: "Las 8 letras y números que te dieron", ph: "ABCD-2345", si: "Entrar", max: 12 }); if (c) { h0.cerrar(true); NOM.union.usar(c); } };
      return;
    }
    const cuerpo = html(`<div class="col">
      <div class="fila union-rapida">
        <button class="btn primario crece" type="button" data-qr>${ico("qr-code")} Escanear código QR</button>
        <button class="btn crece" type="button" data-codigo>${ico("keyboard")} Escribir código</button></div>
      <div class="fila-e"><span class="etiqueta">Espacios en este Wi-Fi</span><span class="chip" data-buscando><span class="cargando" style="width:12px;height:12px;border-width:2px"></span> Buscando…</span></div>
      <div class="lista" data-lista></div>
      <details style="margin-top:4px"><summary class="etiqueta" style="cursor:pointer">¿No aparece? Escribe la dirección que te dieron</summary>
        <form class="fila" style="margin-top:10px" data-manual>
          <div class="entrada crece">${ico("server")}<input name="dir" placeholder="192.168.1.20:8080" inputmode="url" autocapitalize="none"></div>
          <button class="btn">Abrir</button>
        </form>
      </details>
    </div>`);
    const h = hoja({ titulo: "Entrar a un espacio", icono: "qr-code", cuerpo, alCerrar: () => clearInterval(t) });
    $("[data-qr]", cuerpo).onclick = () => { h.cerrar(true); NOM.union.escanear(); };
    $("[data-codigo]", cuerpo).onclick = async () => {
      const c = await NOM.pedirTexto("Escribe el código", { etiqueta: "Las 8 letras y números que te dieron", ph: "ABCD-2345", si: "Entrar", max: 12 });
      if (c) { h.cerrar(true); NOM.union.usar(c); }
    };
    const lista = $("[data-lista]", cuerpo);
    let primera = true;
    async function buscar() {
      try {
        const r = await api.get("/api/red/descubrir", undefined, { ms: 5000 });
        const mios = new Set((NOM.app.espacios || []).map((e) => e.id));
        const items = r.espacios;
        $("[data-buscando]", cuerpo).innerHTML = `${ico("refresh-cw", "ico-s")} Actualizado`;
        if (!items.length) {
          lista.innerHTML = `<div class="vacio" style="padding:28px 16px"><div class="burbuja">${ico("radio")}</div><h3>No se encontraron espacios</h3>
            <p>Lo más fácil: pide su <b>código de invitación</b> y usa los botones de arriba.${r.sinRed ? "<br><b>Este equipo no está conectado a ningún Wi-Fi.</b>" : ""}</p></div>`;
          if (primera) $("details", cuerpo).open = true;
        } else {
          lista.innerHTML = "";
          items.forEach((e) => {
            const ya = mios.has(e.id);
            const it = html(`<button class="lista-item" style="text-align:left;width:100%">
              <span class="icono-espacio" style="width:40px;height:40px;border-radius:14px;display:grid;place-items:center;color:#fff;font-weight:900;background:${esc(e.color || "#7AA7FF")}">${inicial(e.nombre)}</span>
              <span class="crece"><b>${esc(e.nombre)}</b><small>de ${esc(e.propietario)}${e.local ? "" : " · en " + esc(e.equipo)}</small></span>
              ${ya ? `<span class="chip ok">Ya eres miembro</span>` : `<span class="chip acento">Entrar</span>`}
            </button>`);
            it.onclick = () => elegir(e, h);
            lista.append(it);
          });
        }
      } catch (e) {
        $("[data-buscando]", cuerpo).innerHTML = `${ico("wifi-off", "ico-s")} Sin conexión`;
      }
      primera = false;
    }
    buscar();
    const t = setInterval(buscar, 3000);
    $("[data-manual]", cuerpo).onsubmit = (e) => {
      e.preventDefault();
      const dir = e.target.dir.value.trim();
      if (!dir) return;
      abrirOtroEquipo({ host: dir.replace(/^https?:\/\//, "").split(":")[0], puerto: (dir.split(":")[2] || dir.split(":")[1] || "8080").replace(/\D/g, "") || 8080, equipo: dir });
    };
  }

  async function elegir(e, h) {
    if (!e.local) return abrirOtroEquipo(e);
    try {
      const r = await api.post(`/api/espacios/${e.id}/unirse`);
      if (r.estado === "miembro") { h.cerrar(true); location.hash = "#/espacio/" + e.id; return; }
      h.cerrar(true);
      hoja({
        titulo: "Solicitud enviada",
        cuerpo: `<div class="col" style="align-items:center;text-align:center"><div class="exito-check">${ico("check")}</div>
          <p style="font-weight:650">Le avisamos a <b>${esc(r.propietario)}</b> que quieres entrar a <b>${esc(e.nombre)}</b>.<br><span class="suave">Cuando te dé acceso, el espacio aparecerá en tu inicio.</span></p></div>`,
      });
    } catch (err) { aviso(err.message, { tipo: "error" }); }
  }

  async function abrirOtroEquipo(e) {
    const url = `http://${e.host}:${e.puerto}`;
    const ok = await confirmar("Abrir otro equipo", `Este espacio vive en ${e.equipo || e.host}. Se abrirá NOM-COLAB de ese equipo (${url}); ahí necesitas una cuenta propia.`, { si: "Abrir" });
    if (!ok) return;
    if (api.empaquetada) { api.fijarServidor(url); api.limpiarSesion(); location.hash = "#/"; location.reload(); }
    else window.open(url, "_blank", "noopener");
  }

  // ================================================================== Accesos (A5)
  async function accesos(esp) {
    const cuerpo = html(`<div class="col"><div class="esqueleto" style="height:180px"></div></div>`);
    const esDueno = esp.permiso === "PROPIETARIO" || esp.miPermiso === "PROPIETARIO";
    const h = hoja({ titulo: (esDueno ? "Invitar a “" : "Miembros de “") + esp.nombre + "”", icono: esDueno ? "user-plus" : "users", cuerpo, ancha: true });
    let datos;
    async function cargar() {
      try { datos = await api.get(`/api/espacios/${esp.id}/accesos`); pintar(); }
      catch (e) { cuerpo.innerHTML = `<div class="alerta error">${ico("triangle-alert")}<span>${esc(e.message)}</span></div>`; }
    }
    function pintar() {
      const dueno = datos.miPermiso === "PROPIETARIO";
      cuerpo.innerHTML = `
        ${dueno ? `<div class="compartir-codigo clay">
          <span class="modo-insignia">${ico("qr-code")}</span>
          <span class="crece"><b>Invitar con un código</b><small>Lo más fácil: escanean un QR o escriben 8 letras y entran desde su celular o computadora.</small></span>
          <button class="btn primario" type="button" data-codigo-inv>${ico("qr-code")} Crear código</button>
        </div>` : ""}
        ${dueno ? `<form class="col" data-agregar novalidate>
          <span class="etiqueta">O agrega a alguien que ya tiene cuenta</span>
          <div class="fila" style="flex-wrap:wrap">
            <div class="entrada crece" style="min-width:200px">${ico("user-plus")}<input name="usuario" placeholder="Nombre de usuario" autocapitalize="none" autocomplete="off"></div>
            <div class="segmentado" role="group" aria-label="Permiso">
              <button type="button" data-p="EDICION" aria-pressed="true" data-micro="Puede editar|Crea y cambia documentos.">${ico("pencil", "ico-s")} Puede editar</button>
              <button type="button" data-p="LECTURA" aria-pressed="false" data-micro="Solo puede ver|Abre los documentos sin cambiarlos.">${ico("eye", "ico-s")} Solo ver</button>
            </div>
            <button class="btn">Agregar</button>
          </div>
          <div class="alerta error" data-alerta hidden></div>
        </form>` : `<div class="alerta info">${ico("info")}<span>Solo el propietario del espacio puede invitar o cambiar quién entra.</span></div>`}
        ${dueno && api.lan ? `<label class="lista-item" style="padding:12px 14px">${ico("wifi")}<span class="crece"><b>Que lo encuentren en el mismo Wi-Fi</b><small>Aparece al buscar espacios desde ese Wi-Fi; quien lo vea te pide entrar</small></span>
          <span class="interruptor"><input type="checkbox" data-wifi ${datos.conexion || esp.conexion ? "checked" : ""}><span></span></span></label>` : ""}
        ${dueno && datos.solicitudes.length ? `<div class="col"><span class="etiqueta">Quieren entrar (${datos.solicitudes.length})</span><div class="lista">${datos.solicitudes.map((s) => `
          <div class="lista-item">${avatar(s)}<span class="crece"><b>${esc(s.nombre)}</b><small>${esc(s.empresa || "")} ${esc(haceCuanto(s.fecha))}</small></span>
            <button class="btn chico" data-aceptar="${esc(s.nombre)}" data-p="LECTURA">Solo ver</button>
            <button class="btn chico primario" data-aceptar="${esc(s.nombre)}" data-p="EDICION">Puede editar</button>
            <button class="icono-btn" data-rechazar="${esc(s.id)}" aria-label="Rechazar" data-micro="Rechazar solicitud">${ico("x")}</button>
          </div>`).join("")}</div></div>` : ""}
        <div class="col"><span class="etiqueta">Miembros (${datos.miembros.length})</span><div class="lista">${datos.miembros.map((m) => `
          <div class="lista-item">${avatar(m)}<span class="crece"><b>${esc(m.nombre)}${m.id === (api.usuario() || {}).id ? " (tú)" : ""}</b><small>${m.conectado ? `<span style="color:var(--ok)">● conectado</span>` : esc(m.empresa || "")}</small></span>
            ${m.permiso === "PROPIETARIO" ? `<span class="chip acento">${ico("crown", "ico-s")} Propietario</span>`
              : dueno ? `<select class="mini-select" data-cambiar="${esc(m.nombre)}" aria-label="Permiso de ${esc(m.nombre)}" style="height:36px;border-radius:12px;border:1px solid var(--borde);background:var(--sup-2);padding:0 8px;font-weight:700">
                  <option value="EDICION" ${m.permiso === "EDICION" ? "selected" : ""}>Puede editar</option>
                  <option value="LECTURA" ${m.permiso === "LECTURA" ? "selected" : ""}>Solo puede ver</option>
                  <option value="NINGUNO">Quitar acceso</option></select>`
              : `<span class="chip">${esc(PERMISOS[m.permiso])}</span>`}
          </div>`).join("")}</div></div>`;
      const f = $("[data-agregar]", cuerpo);
      if (f) {
        let permiso = "EDICION";
        $$("[data-p]", f).forEach((b) => (b.onclick = () => { permiso = b.dataset.p; $$("[data-p]", f).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
        f.onsubmit = async (e) => {
          e.preventDefault();
          const nombre = f.usuario.value.trim();
          const al = $("[data-alerta]", f);
          if (!nombre) { al.hidden = false; al.innerHTML = `${ico("triangle-alert")}<span>Escribe el nombre de usuario</span>`; return; }
          try { datos = await api.put(`/api/espacios/${esp.id}/accesos`, { usuario: nombre, permiso }); pintar(); aviso(`${nombre} ya tiene acceso`, { tipo: "ok" }); }
          catch (err) { al.hidden = false; al.innerHTML = `${ico("triangle-alert")}<span>${esc(err.message)}</span>`; }
        };
      }
      const ci = $("[data-codigo-inv]", cuerpo); if (ci) ci.onclick = () => NOM.union.invitar(esp);
      const wf = $("[data-wifi]", cuerpo);
      if (wf) wf.onchange = async () => {
        try { const r = await api.put(`/api/espacios/${esp.id}/conexion`, { activa: wf.checked }); esp.conexion = r.activa; datos.conexion = r.activa;
          aviso(r.sinRed ? "Este equipo no está conectado a ningún Wi-Fi" : r.activa ? "Listo: ya lo encuentran en el mismo Wi-Fi" : "Ya no aparece al buscar en el Wi-Fi", { tipo: r.sinRed ? "aviso" : "ok" }); }
        catch (err) { wf.checked = !wf.checked; aviso(err.message, { tipo: "error" }); }
      };
      $$("[data-aceptar]", cuerpo).forEach((b) => (b.onclick = () => cambiar(b.dataset.aceptar, b.dataset.p)));
      $$("[data-rechazar]", cuerpo).forEach((b) => (b.onclick = async () => { datos = await api.delete(`/api/espacios/${esp.id}/solicitudes/${b.dataset.rechazar}`); pintar(); }));
      $$("[data-cambiar]", cuerpo).forEach((s) => (s.onchange = async () => {
        if (s.value === "NINGUNO" && !(await confirmar("Quitar acceso", `${s.dataset.cambiar} ya no podrá entrar a este espacio y se desconectará si está dentro.`, { si: "Quitar", peligro: true }))) { pintar(); return; }
        cambiar(s.dataset.cambiar, s.value);
      }));
    }
    async function cambiar(nombre, permiso) {
      try { datos = await api.put(`/api/espacios/${esp.id}/accesos`, { usuario: nombre, permiso }); pintar(); aviso("Acceso actualizado", { tipo: "ok" }); }
      catch (e) { aviso(e.message, { tipo: "error" }); cargar(); }
    }
    cargar();
    return h;
  }

  // ================================================================== Almacenamiento (A7)
  async function almacenamiento(esp) {
    const cuerpo = html(`<div class="col"><div class="esqueleto" style="height:200px"></div></div>`);
    hoja({ titulo: "Almacenamiento", icono: "hard-drive", cuerpo, ancha: true });
    async function cargar() {
      let d;
      try { d = await api.get(`/api/espacios/${esp.id}/almacenamiento`); } catch (e) { cuerpo.innerHTML = `<div class="alerta error">${ico("triangle-alert")}<span>${esc(e.message)}</span></div>`; return; }
      const max = Math.max(1, ...d.documentos.map((x) => x.bytesDocumento + x.bytesVersiones));
      const cuota = d.cuota > 0 ? `<div class="clay col" style="padding:14px 16px;gap:8px"><div class="fila-e"><b>Espacio en la nube de ${d.esPropietario ? "tu cuenta" : "quien es propietario"}</b><span class="chip ${d.usoPropietario >= d.cuota ? "error" : d.usoPropietario > d.cuota * 0.8 ? "aviso" : ""}">${bytes(d.usoPropietario)} de ${bytes(d.cuota)}</span></div>
          <div class="barra-uso"><i style="width:${Math.min(100, (d.usoPropietario / d.cuota) * 100)}%"></i></div>${d.usoPropietario >= d.cuota ? `<span class="suave chico" style="font-weight:700">Lleno: los cambios nuevos se quedan en cada equipo hasta liberar espacio (depura versiones abajo).</span>` : ""}</div>` : "";
      cuerpo.innerHTML = cuota + `
        <div class="clay" style="padding:18px;display:flex;align-items:center;gap:16px">
          <span class="modo-insignia" style="width:52px;height:52px;border-radius:18px;background:var(--acento-tenue);color:var(--acento-tinta)">${ico("hard-drive", "ico-l")}</span>
          <div class="crece"><div style="font-size:26px;font-weight:900">${bytes(d.total)}</div><div class="suave chico" style="font-weight:700">en ${d.documentos.length} documento(s) y su historial</div></div>
        </div>
        <div class="lista">${d.documentos.map((x) => `
          <div class="lista-item modo-${esc(x.modo)}" style="flex-wrap:wrap">
            <span class="modo-insignia">${ico(MODOS[x.modo].icono)}</span>
            <span class="crece"><b>${esc(x.nombre)}</b><small>${bytes(x.bytesDocumento)} documento · ${bytes(x.bytesVersiones)} en ${x.versiones} versiones${x.abiertoPorOtros ? " · abierto por otra persona" : ""}</small>
              <div class="barra-uso" style="margin-top:6px"><i style="width:${Math.max(2, ((x.bytesDocumento + x.bytesVersiones) / max) * 100)}%"></i></div></span>
          </div>`).join("") || `<p class="suave">Todavía no hay documentos.</p>`}</div>
        ${d.esPropietario ? `<div class="clay col" style="padding:16px">
          <span class="etiqueta">Depurar versiones antiguas</span>
          <p class="suave chico" style="font-weight:650">Se conservan las versiones más recientes de cada documento; las demás se borran. Los documentos abiertos por otras personas se dejan para después.</p>
          <div class="fila" style="flex-wrap:wrap">
            <label class="fila crece" style="font-weight:750">Conservar <input type="number" min="1" max="200" value="${d.conservar}" style="width:84px;height:40px;border-radius:12px;border:1px solid var(--borde);background:var(--sup-2);padding:0 10px;font-weight:800"> versiones</label>
            <button class="btn peligro" data-depurar>${ico("trash-2")} Depurar</button>
          </div></div>` : `<div class="alerta info">${ico("info")}<span>Solo el propietario puede depurar versiones.</span></div>`}`;
      const b = $("[data-depurar]", cuerpo);
      if (b) b.onclick = async () => {
        const n = parseInt($("input[type=number]", cuerpo).value, 10);
        if (!(n >= 1 && n <= 200)) return aviso("Elige entre 1 y 200 versiones", { tipo: "error" });
        if (!(await confirmar("Depurar versiones", `Cada documento conservará solo sus ${n} versiones más recientes. Esto no se puede deshacer.`, { si: "Depurar", peligro: true }))) return;
        try {
          const r = await api.post(`/api/espacios/${esp.id}/almacenamiento/depurar`, { conservar: n });
          aviso(`Se liberaron ${bytes(r.liberado)}` + (r.pospuestos.length ? ` · pendientes: ${r.pospuestos.join(", ")}` : ""), { tipo: "ok", ms: 5000 });
          cargar();
        } catch (e) { aviso(e.message, { tipo: "error" }); }
      };
    }
    cargar();
  }

  // ================================================================== Nuevo documento (CU-18 / CU-28)
  function nuevoDocumento(esp, modoInicial) {
    let modo = modoInicial || "TEXTO", plantilla = null;
    const cuerpo = html(`<form class="col" novalidate>
      <div class="campo"><label for="nd">Nombre</label><div class="entrada"><input id="nd" name="nombre" maxlength="120" placeholder="Documento sin título" autocomplete="off"></div></div>
      <div class="col" style="gap:8px"><span class="etiqueta">¿Qué tipo de documento? <span class="suave" style="font-weight:650">(no cambia después)</span></span>
        <div class="modo-opciones">${Object.keys(MODOS).map((m) => `<button type="button" class="modo-opcion modo-${m}" data-modo="${m}" aria-pressed="${m === modo}" data-micro="${esc(MODOS[m].nombre)}|${esc(MODOS[m].micro)} El tipo queda fijo para conservar su formato."><span class="modo-insignia">${ico(MODOS[m].icono, "ico-l")}</span>${esc(MODOS[m].nombre)}</button>`).join("")}</div></div>
      <div class="col" style="gap:8px"><span class="etiqueta">Plantilla</span><div class="plantillas" data-plantillas></div></div>
    </form>`);
    const pie = html(`<div style="display:contents"><button type="button" class="btn" data-importar>${ico("upload")} Importar archivo</button>${esp && NOM.datos ? `<button type="button" class="btn" data-mas-crear aria-label="Más formas de crear" data-micro="Más|Reporte desde datos (CSV o Excel) y datos públicos.">${ico("more-horizontal")}</button>` : ""}<span class="crece solo-escritorio"></span><button class="btn primario" data-crear>Crear documento</button></div>`);
    const h = hoja({ titulo: esp ? "Nuevo documento" : "Nuevo documento (en este equipo)", cuerpo, pie, ancha: true });
    if (!esp) cuerpo.prepend(html(`<div class="alerta aviso">${ico("hard-drive")}<span>Sin cuenta, el documento se guarda <b>solo ${NOM.aqui().en}</b>. Si ${NOM.aqui().borrar} se pierde, salvo que lo descargues.</span></div>`));
    // 8.5 Las plantillas que guardó el equipo en este espacio salen primero (con su marca).
    let listaEsp = esp && esp.lista ? esp.lista : null;
    if (esp && !listaEsp) api.get(`/api/espacios/${esp.id}`).then((r) => { listaEsp = r.lista || []; pintarPlantillas(); }).catch(() => {});
    function pintarPlantillas() {
      const propias = (listaEsp || []).filter((x) => x.plantilla && x.modo === modo).map((x) => ({ id: "esp:" + x.id, docId: x.id, modo: x.modo, nombre: x.nombre, desc: "Del espacio", delEspacio: true }));
      const ps = propias.concat(NOM.plantillas.delModo(modo));
      if (!plantilla || plantilla.modo !== modo || !ps.includes(plantilla)) plantilla = ps.find((p) => p.id === (plantilla || {}).id) || ps.find((p) => !p.delEspacio) || ps[0];
      $("[data-plantillas]", cuerpo).innerHTML = ps.map((p) => `<button type="button" class="plantilla${p.delEspacio ? " del-espacio" : ""}" data-p="${esc(p.id)}" aria-pressed="${p === plantilla}">${p.delEspacio ? ico("copy-plus", "ico-s") + " " : ""}${esc(p.nombre)}<small>${esc(p.desc)}</small></button>`).join("");
      $$("[data-p]", cuerpo).forEach((b) => (b.onclick = () => { plantilla = ps.find((p) => p.id === b.dataset.p); pintarPlantillas(); }));
    }
    $$("[data-modo]", cuerpo).forEach((b) => (b.onclick = () => { modo = b.dataset.modo; $$("[data-modo]", cuerpo).forEach((x) => x.setAttribute("aria-pressed", x === b)); pintarPlantillas(); }));
    pintarPlantillas();
    const crear = async (e) => {
      e && e.preventDefault();
      const nombre = cuerpo.nombre.value.trim() || (plantilla && plantilla.nombre !== "En blanco" ? plantilla.nombre : "");
      $("[data-crear]", pie).disabled = true;
      try {
        if (plantilla && plantilla.delEspacio && esp) {
          const d = await api.post(`/api/documentos/${plantilla.docId}/copia`, { nombre: nombre || plantilla.nombre });
          h.cerrar(true);
          location.hash = "#/doc/" + d.id;
          return;
        }
        const ops = plantilla ? plantilla.crear() : [];
        if (!esp) { const d = NOM.local.crear(nombre, modo, ops); h.cerrar(true); location.hash = "#/local/" + d.id; return; }
        const d = await api.post(`/api/espacios/${esp.id}/documentos`, { nombre, modo, ops });
        h.cerrar(true);
        location.hash = "#/doc/" + d.id;
      } catch (err) { aviso(err.message, { tipo: "error" }); $("[data-crear]", pie).disabled = false; }
    };
    cuerpo.onsubmit = crear;
    $("[data-crear]", pie).onclick = crear;
    const masCrear = $("[data-mas-crear]", pie);
    if (masCrear) masCrear.onclick = () => NOM.menu(masCrear, [{ titulo: "Crear desde…" },
      { texto: "Reporte desde datos (CSV o Excel)…", icono: "bar-chart", fn: async () => { const f = await NOM.formatos.elegirArchivo(".csv,.tsv,.xlsx"); if (!f) return; h.cerrar(true); NOM.datos.reporteDeDatos({ espacio: esp, local: false }, { archivo: f }); } },
      { texto: "Datos públicos (Wikidata)…", icono: "globe", fn: () => { h.cerrar(true); NOM.datos.datosPublicos(esp); } },
    ]);
    $("[data-importar]", pie).onclick = async () => {
      const f = await NOM.formatos.elegirArchivo(NOM.formatos.IMPORTABLES.join(","));
      if (!f) return;
      try {
        const r = await NOM.formatos.importar(f);
        if (!esp) {
          const d = NOM.local.crear(r.nombre, r.modo, r.ops);
          h.cerrar(true);
          location.hash = "#/local/" + d.id;
        } else {
          const d = await api.post(`/api/espacios/${esp.id}/documentos`, { nombre: r.nombre, modo: r.modo, ops: NOM.DocCRDT.partir(r.ops) });
          h.cerrar(true);
          location.hash = "#/doc/" + d.id;
        }
        aviso(r.aviso || `“${r.nombre}” importado`, { tipo: r.aviso ? "aviso" : "ok", ms: 5000 });
      } catch (err) { aviso(err.message, { tipo: "error", ms: 6000 }); }
    };
  }


  // ================================================================== Sin cuenta (documentos en este equipo)
  function tarjetaLocal(d) {
    const m = MODOS[d.modo] || MODOS.TEXTO;
    return `<a class="tarjeta doc-tarjeta clay modo-${esc(d.modo)}" href="#/local/${esc(d.id)}">
      <div class="miniatura">${NOM.miniatura(d.modo)}</div>
      <div class="cuerpo"><span class="titulo recorta" style="font-size:15px">${esc(d.nombre)}</span>
        <span class="meta"><span>${ico("hard-drive", "ico-s")} En este equipo</span><span>${esc(haceCuanto(d.modificado))}</span></span></div>
      <div class="acciones"><button class="icono-btn" data-menu-local="${esc(d.id)}" aria-label="Más opciones">${ico("more-horizontal")}</button></div>
    </a>`;
  }

  /** Lista de documentos guardados solo en este equipo (con cuenta: solo si hay alguno). */
  function seccionLocal(cont, conCuenta) {
    if (!cont) return;
    const docs = NOM.local.lista();
    const sueltos = conCuenta ? NOM.local.sinCuenta() : [];
    // Con cuenta, lo normal es trabajar en espacios: esta sección solo aparece si ya hay algo aquí
    // (así quien recién llega ve dos opciones, no cuatro).
    if (conCuenta && !docs.length && !sueltos.length) { cont.innerHTML = ""; cont.hidden = true; return; }
    cont.hidden = false;
    cont.innerHTML = `
      <div class="fila-e"><h2>${conCuenta ? "En este equipo" : "Tus documentos en este equipo"}</h2>
        <div class="fila"><button class="btn chico" data-importar-local>${ico("upload", "ico-s")} Importar</button>
        <button class="btn chico ${conCuenta ? "" : "primario"}" data-nuevo-local>${ico("plus", "ico-s")} Nuevo documento</button></div></div>
      ${conCuenta ? `<p class="suave chico" style="font-weight:650;margin:-6px 0 14px">${ico("lock", "ico-s")} Solo en este equipo y protegidos con tu contraseña. Nadie más los ve: para trabajarlos en equipo, pásalos a un espacio.</p>` : ""}
      ${sueltos.length ? `<div class="alerta info" style="margin-bottom:12px">${ico("info")}<span class="crece">Hay ${sueltos.length} documento(s) creados sin cuenta ${NOM.aqui().en}, sin cifrar.</span><button class="btn chico" data-mover-local>Pasarlos a mi cuenta</button></div>` : ""}
      ${docs.length ? `<div class="rejilla doc-rejilla" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${docs.map(tarjetaLocal).join("")}</div>`
        : `<div class="vacio"><div class="burbuja">${ico("file-text")}</div><h3>Aún no tienes documentos</h3>
            <p style="max-width:44ch">Puede ser un texto, una hoja de cálculo, una presentación o un diagrama.</p>
            <button class="btn primario" data-nuevo-local>${ico("plus")} Crear documento</button></div>`}`;
    $$("[data-nuevo-local]", cont).forEach((b) => (b.onclick = () => nuevoDocumento(null)));
    const mover = $("[data-mover-local]", cont);
    if (mover) mover.onclick = () => { const n = NOM.local.moverACuenta(); aviso(`${n} documento(s) ahora están cifrados en tu cuenta`, { tipo: "ok" }); seccionLocal(cont, conCuenta); };
    const imp = $("[data-importar-local]", cont);
    if (imp) imp.onclick = async () => {
      const f = await NOM.formatos.elegirArchivo(NOM.formatos.IMPORTABLES.join(","));
      if (!f) return;
      try { const r = await NOM.formatos.importar(f); const d = NOM.local.crear(r.nombre, r.modo, r.ops); location.hash = "#/local/" + d.id; aviso(r.aviso || `“${r.nombre}” importado`, { tipo: r.aviso ? "aviso" : "ok" }); }
      catch (e) { aviso(e.message, { tipo: "error", ms: 6000 }); }
    };
    $$("[data-menu-local]", cont).forEach((b) => (b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const id = b.dataset.menuLocal, d = NOM.local.meta(id);
      NOM.menu(b, [
        { texto: "Abrir", icono: "folder-open", fn: () => (location.hash = "#/local/" + id) },
        { texto: "Descargar copia (.nom)", icono: "download", fn: () => { const doc = NOM.local.abrirEnMemoria(id); if (doc) NOM.formatos.exportar(doc, "nom", d.nombre); } },
        ...(api.token() ? [{ texto: "Pasar a un espacio (para trabajarlo en equipo)", icono: "upload", fn: () => subirLocal(id, () => seccionLocal(cont, conCuenta)) }] : []),
        "-",
        { texto: "Eliminar", icono: "trash-2", peligro: true, fn: async () => {
          if (!(await confirmar("Eliminar documento", `“${d.nombre}” se borrará de este equipo y no se puede recuperar.`, { si: "Eliminar", peligro: true }))) return;
          NOM.local.eliminar(id); seccionLocal(cont, conCuenta);
        } },
      ]);
    }));
  }

  function inicioSinCuenta(cont) {
    cont.innerHTML = `
      <div class="encabezado">
        <div><h1>${saludo()}</h1><p class="sub">Estás usando NOM-COLAB sin cuenta</p></div>
        <div class="fila solo-escritorio"><button class="btn primario" data-cuenta>${ico("user-plus")} Crear cuenta o iniciar sesión</button></div>
      </div>
      <div class="alerta aviso" style="margin-bottom:8px" data-aviso-local>${ico("triangle-alert")}<span>Tus documentos se guardan <b>solo ${NOM.aqui().en}</b>. Si ${NOM.aqui().borrar}, <b>se pierden</b>. Descárgalos (menú … → Descargar copia) o crea una cuenta para guardarlos en un espacio y trabajar con tu equipo.</span></div>
      <section class="seccion" data-locales></section>`;
    $("[data-cuenta]", cont).onclick = () => NOM.app.irACuentas("registro");
    seccionLocal($("[data-locales]", cont), false);
    // Los espacios viven en un servidor y son de una cuenta: sin cuenta se explica qué son y cómo tenerlos.
    $("[data-locales]", cont).after(html(`<section class="seccion"><div class="fila-e"><h2>Espacios de trabajo</h2></div>
      <div class="vacio espacios-sin-cuenta"><div class="burbuja">${ico("users")}</div>
        <h3>Trabaja con tu equipo en tiempo real</h3>
        <p style="max-width:44ch">Un espacio reúne los documentos de un equipo: los editan juntos, desde la computadora o el celular, y no se pierden si cambias de equipo. Para tener espacios necesitas una cuenta (es gratis).</p>
        <div class="fila"><button class="btn" data-v="entrar">${ico("log-in")} Ya tengo cuenta</button><button class="btn primario" data-v="registro">${ico("user-plus")} Crear cuenta</button></div></div></section>`));
    $("[data-v=entrar]", cont).onclick = () => NOM.app.irACuentas("entrar");
    $("[data-v=registro]", cont).onclick = () => NOM.app.irACuentas("registro");
  }

  /** Sube un documento local a un espacio donde el usuario puede editar. */
  async function subirLocal(id, listo) {
    let espacios = NOM.app.espacios || [];
    try { espacios = await api.get("/api/espacios"); } catch (e) { /* se usa la lista en memoria */ }
    const editables = espacios.filter((e) => e.permiso !== "LECTURA");
    if (!editables.length) return aviso("Primero crea un espacio (o pide permiso de edición en uno) para subir el documento.", { tipo: "info", ms: 5000 });
    const cuerpo = html(`<div class="col"><p class="suave" style="font-weight:650">Elige el espacio. Al subirlo quedará guardado en ese espacio y se quitará de este equipo.</p>
      <div class="lista">${editables.map((e) => `<button class="lista-item" data-esp="${esc(e.id)}" style="text-align:left;width:100%"><span class="icono-espacio" style="width:36px;height:36px;border-radius:12px;display:grid;place-items:center;color:#fff;font-weight:900;background:${esc(e.color)}">${inicial(e.nombre)}</span><span class="crece"><b>${esc(e.nombre)}</b><small>${esc(PERMISOS[e.permiso])}</small></span>${ico("chevron-right")}</button>`).join("")}</div></div>`);
    const h = hoja({ titulo: "Subir a un espacio", icono: "upload", cuerpo });
    $$("[data-esp]", cuerpo).forEach((b) => (b.onclick = async () => {
      try {
        const d = await NOM.local.subir(id, b.dataset.esp);
        h.cerrar(true);
        aviso("Listo: el documento ya está guardado en el espacio", { tipo: "ok" });
        if (listo) listo(); else location.hash = "#/doc/" + d.id;
      } catch (e) { aviso(e.message, { tipo: "error" }); }
    }));
  }

  // ================================================================== Espacio
  async function espacio(cont, id) {
    cont.innerHTML = `<div class="esqueleto" style="height:90px;margin-bottom:24px"></div><div class="rejilla">${'<div class="esqueleto" style="height:200px"></div>'.repeat(4)}</div>`;
    let d, filtro = "TODOS", busqueda = "";
    // 8.5 Carpeta elegida (null: todas), solo destacados, orden y búsqueda dentro del contenido.
    let carpetaSel = null, soloDestacados = false, orden = NOM.leer("nom.orden.docs", "reciente"), carpetasNuevas = [];
    let enContenido = null, consulta = 0;
    try { d = await api.get(`/api/espacios/${id}`); NOM.guardar(api.clave("cache.esp." + id), d); }
    catch (e) {
      d = NOM.leer(api.clave("cache.esp." + id), null);
      if (!d) {
        cont.innerHTML = `<div class="vacio"><div class="burbuja">${ico(e.red ? "wifi-off" : "triangle-alert")}</div><h3>${esc(e.red ? "No se pudo abrir el espacio" : e.message)}</h3>
          ${e.red ? `<p>No hay conexión y este equipo no tiene una copia guardada. Revisa el Wi-Fi y vuelve a intentarlo.</p>` : ""}
          <div class="fila" style="justify-content:center;flex-wrap:wrap">${e.red ? `<button class="btn primario" data-reintentar>${ico("refresh-cw")} Volver a intentar</button>` : ""}<a class="btn" href="#/">Ir al inicio</a></div></div>`;
        const re = $("[data-reintentar]", cont); if (re) re.onclick = () => window.dispatchEvent(new HashChangeEvent("hashchange"));
        return;
      }
      aviso("Sin conexión: mostramos la última copia guardada", { tipo: "aviso" });
    }
    NOM.app.fijarTitulo(d.nombre);
    const dueno = d.permiso === "PROPIETARIO", edita = d.permiso !== "LECTURA";
    cont.innerHTML = `
      <div class="encabezado">
        <div class="fila" style="gap:16px;align-items:center">
          <span class="icono-espacio" style="width:60px;height:60px;border-radius:20px;display:grid;place-items:center;color:#fff;font-weight:900;font-size:26px;background:${esc(d.color)};box-shadow:inset 0 2px 0 rgba(255,255,255,.35),inset 0 -3px 0 rgba(0,0,0,.12),0 10px 20px -8px ${esc(d.color)}">${inicial(d.nombre)}</span>
          <div><h1>${esc(d.nombre)}</h1>
            <div class="fila" style="margin-top:6px;flex-wrap:wrap">
              <span class="chip ${dueno ? "acento" : ""}">${ico(dueno ? "crown" : d.permiso === "EDICION" ? "pencil" : "eye", "ico-s")} ${esc(PERMISOS[d.permiso])}</span>
              <span data-chip-red></span>
              <span class="avatares" data-conectados></span>
            </div></div>
        </div>
        <div class="fila" style="flex-wrap:wrap">
          <button class="btn ${dueno ? "primario-suave" : ""}" data-a="compartir" data-micro="Compartir|Invita con un código o QR, y elige quién puede editar o solo ver.">${ico(dueno ? "user-plus" : "users")} ${dueno ? "Invitar" : "Miembros"}</button>
          <span data-avisos></span>
          <button class="btn" data-a="mas-espacio" aria-label="Más opciones del espacio" data-micro="Más|Papelera, espacio usado, descargar todo y otras opciones.">${ico("more-horizontal")} Más</button>
          ${edita ? `<button class="btn primario solo-escritorio" data-a="nuevo">${ico("plus")} Nuevo documento</button>` : ""}
        </div>
      </div>
      <div class="fila-e" style="flex-wrap:wrap;margin-bottom:16px">
        <div class="segmentado filtros-modo" role="group" aria-label="Mostrar solo un tipo de documento" data-filtros>
          <button aria-pressed="true" data-f="TODOS">Todos</button>
          ${Object.keys(MODOS).map((m) => `<button aria-pressed="false" data-f="${m}" class="modo-${m}">${ico(MODOS[m].icono, "ico-s")}<span>${esc(MODOS[m].plural || MODOS[m].nombre)}</span></button>`).join("")}
        </div>
        <div class="entrada" style="min-height:42px;width:min(320px,100%)">${ico("search")}<input placeholder="Buscar por nombre o por lo que dice" data-buscar aria-label="Buscar en los documentos"></div>
      </div>
      <div class="fila-e carpetas-fila" data-carpetas></div>
      <div data-docs></div>`;

    const pintarRed = (activa) => {
      $("[data-chip-red]", cont).innerHTML = !api.lan
        ? `<span class="chip ok" data-micro="En Internet|Lo abres desde cualquier celular o computadora con tu cuenta.">${ico("cloud", "ico-s")} En Internet</span>`
        : activa
        ? `<span class="chip ok" data-micro="Visible en el Wi-Fi|Quienes estén en el mismo Wi-Fi pueden encontrarlo y pedirte entrar."><span class="punto vivo"></span>Visible en el Wi-Fi</span>`
        : "";
    };
    const pintarConectados = (us) => { const c = $("[data-conectados]", cont); if (c) c.innerHTML = (us || []).slice(0, 5).map((u) => avatar(u)).join(""); };
    pintarRed(d.conexion);
    pintarConectados(d.conectados);

    const yoId = () => (api.usuario() || {}).id;
    const esDestacado = (x) => (x.destacadoPor || []).includes(yoId());
    const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const carpetasDe = () => [...new Set(d.lista.filter((x) => !x.plantilla && x.carpeta).map((x) => x.carpeta).concat(carpetasNuevas))].sort((a, b) => a.localeCompare(b, "es"));
    function ordenar(l) {
      const r = l.slice();
      if (orden === "nombre") r.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
      else if (orden === "tipo") r.sort((a, b) => Object.keys(MODOS).indexOf(a.modo) - Object.keys(MODOS).indexOf(b.modo) || b.modificado - a.modificado);
      else r.sort((a, b) => b.modificado - a.modificado);
      // Los destacados van primero.
      return r.filter(esDestacado).concat(r.filter((x) => !esDestacado(x)));
    }
    function chipsDoc(x) {
      const c = [
        x.protegido ? `<span class="chip chico" data-micro="Protegido|Nadie lo puede borrar hasta que el propietario quite la marca.">${ico("lock", "ico-s")} Protegido</span>` : "",
        x.entregaLimite ? `<span class="chip chico ${Date.now() >= x.entregaLimite ? "aviso" : "acento"}">${ico("calendar", "ico-s")} ${Date.now() >= x.entregaLimite ? "Entrega cerrada" : "Entrega " + esc(new Date(x.entregaLimite).toLocaleDateString("es-MX", { day: "numeric", month: "short" }))}</span>` : "",
        x.carpeta && carpetaSel == null ? `<span class="chip chico">${ico("folder", "ico-s")} ${esc(x.carpeta)}</span>` : "",
        x.enlaceVer ? `<span class="chip chico" data-micro="Con enlace para ver|Cualquiera con el enlace lo ve, sin cuenta.">${ico("link-2", "ico-s")} Enlace</span>` : "",
      ].filter(Boolean).join("");
      return c ? `<span class="meta">${c}</span>` : "";
    }
    const tarjetaDoc = (x) => `
        <a class="tarjeta doc-tarjeta clay modo-${esc(x.modo)}${x.plantilla ? " es-plantilla" : ""}" href="#/doc/${esc(x.id)}" data-doc="${esc(x.id)}"${edita && !x.plantilla ? ' draggable="true"' : ""}>
          <div class="miniatura">${NOM.miniatura(x.modo)}${esDestacado(x) ? `<span class="doc-estrella" title="Destacado">${ico("star", "ico-s")}</span>` : ""}${x.plantilla ? `<span class="doc-plantilla">${ico("copy-plus", "ico-s")} Plantilla</span>` : ""}</div>
          <div class="cuerpo"><span class="titulo recorta" style="font-size:15px">${esc(x.nombre)}</span>
            <span class="meta"><span>${ico(MODOS[x.modo].icono, "ico-s")} ${esc(MODOS[x.modo].nombre)}</span><span>${esc(haceCuanto(x.modificado))}</span></span>
            ${chipsDoc(x)}</div>
          <div class="acciones"><button class="icono-btn" data-menu="${esc(x.id)}" aria-label="Más opciones de ${esc(x.nombre)}">${ico("more-horizontal")}</button></div>
        </a>`;
    function pintarCarpetas() {
      const c = $("[data-carpetas]", cont);
      if (!c) return;
      const docs = d.lista.filter((x) => !x.plantilla), cs = carpetasDe();
      if (!docs.length) { c.innerHTML = ""; return; }
      const n = (k) => docs.filter((x) => x.carpeta === k).length;
      c.innerHTML = `<div class="chips-carpetas" role="group" aria-label="Carpetas">
          <button type="button" class="chip-carpeta" data-carpeta="*" aria-pressed="${carpetaSel == null && !soloDestacados}">${ico("layout-grid", "ico-s")} Todo</button>
          <button type="button" class="chip-carpeta" data-destacados aria-pressed="${soloDestacados}">${ico("star", "ico-s")} Destacados</button>
          ${cs.map((k) => `<button type="button" class="chip-carpeta" data-carpeta="${esc(k)}" data-soltar="${esc(k)}" aria-pressed="${carpetaSel === k}">${ico("folder", "ico-s")} ${esc(k)} <small>${n(k)}</small></button>`).join("")}
          ${edita ? `<button type="button" class="chip-carpeta tenue" data-nueva-carpeta data-micro="Nueva carpeta|Luego arrastra documentos a ella o usa «Mover a carpeta» en su menú.">${ico("folder-plus", "ico-s")} Nueva carpeta</button>` : ""}
        </div>
        <label class="orden-docs" data-micro="Ordenar|Los destacados siempre van primero.">${ico("arrow-up-down", "ico-s")}<select data-orden aria-label="Ordenar documentos"><option value="reciente">Recientes</option><option value="nombre">Por nombre</option><option value="tipo">Por tipo</option></select></label>`;
      $("[data-orden]", c).value = orden;
      $("[data-orden]", c).onchange = (e) => { orden = e.target.value; NOM.guardar("nom.orden.docs", orden); pintarDocs(); };
      $$("[data-carpeta]", c).forEach((b) => {
        b.onclick = () => { carpetaSel = b.dataset.carpeta === "*" ? null : b.dataset.carpeta; soloDestacados = false; pintarDocs(); };
        if (b.dataset.carpeta !== "*" && edita) b.oncontextmenu = (e) => { e.preventDefault(); menuCarpeta(b, b.dataset.carpeta); };
      });
      $("[data-destacados]", c).onclick = () => { soloDestacados = !soloDestacados; carpetaSel = null; pintarDocs(); };
      const nc = $("[data-nueva-carpeta]", c);
      if (nc) nc.onclick = async () => {
        const nombre = await NOM.pedirTexto("Nueva carpeta", { etiqueta: "Nombre de la carpeta", ph: "Por ejemplo: Tareas, Exposiciones…", max: 60, si: "Crear" });
        if (!nombre) return;
        if (!carpetasNuevas.includes(nombre)) carpetasNuevas.push(nombre);
        carpetaSel = nombre; soloDestacados = false;
        pintarDocs();
        aviso("Carpeta lista: arrastra documentos aquí o usa «Mover a carpeta» en su menú", { ms: 4000 });
      };
      // Arrastrar una tarjeta sobre una carpeta la mete ahí (con el mouse).
      $$("[data-soltar]", c).forEach((b) => {
        b.ondragover = (e) => { if (e.dataTransfer.types.includes("text/nom-doc")) { e.preventDefault(); b.classList.add("soltar"); } };
        b.ondragleave = () => b.classList.remove("soltar");
        b.ondrop = (e) => { e.preventDefault(); b.classList.remove("soltar"); const id = e.dataTransfer.getData("text/nom-doc"); if (id) ponerEnCarpeta(d.lista.find((x) => x.id === id), b.dataset.soltar); };
      });
    }
    function pintarResultados() {
      if (busqueda.length < 3) return "";
      if (enContenido == null) return `<h3 class="busqueda-titulo">${ico("file-search", "ico-s")} Dentro de los documentos</h3><div class="esqueleto" style="height:56px"></div>`;
      const l = enContenido.filter((x) => x.encontrado);
      if (!l.length) return `<h3 class="busqueda-titulo">${ico("file-search", "ico-s")} Dentro de los documentos</h3><p class="suave" style="font-weight:650">Ningún documento dice “${esc(busqueda)}”.</p>`;
      return `<h3 class="busqueda-titulo">${ico("file-search", "ico-s")} Dentro de los documentos</h3><div class="lista-resultados">${l.map((x) => `<a class="resultado" href="#/doc/${esc(x.id)}">
        <span class="resultado-ico modo-${esc(x.modo)}">${ico(MODOS[x.modo] ? MODOS[x.modo].icono : "file-text", "ico-s")}</span>
        <span class="crece"><b>${esc(x.nombre)}</b>${x.plantilla ? ` <small class="chip chico">${ico("copy-plus", "ico-s")} Plantilla</small>` : ""}${x.veces > 1 ? ` <small class="suave">${x.veces} veces</small>` : ""}<span class="fragmento">${esc(x.antes || "")}<mark>${esc(x.encontrado || "")}</mark>${esc(x.despues || "")}</span></span></a>`).join("")}</div>`;
    }
    const buscarContenido = NOM.debounce(async () => {
      if (busqueda.length < 3) return;
      const n = ++consulta, q = busqueda;
      try {
        const r = await api.get(`/api/espacios/${id}/buscar?q=${encodeURIComponent(q)}`);
        if (n !== consulta) return;
        enContenido = r;
      } catch (e) { if (n === consulta) enContenido = []; }
      const c = $("[data-contenido]", cont);
      if (c) c.innerHTML = pintarResultados();
    }, 350);

    function pintarDocs() {
      const cont2 = $("[data-docs]", cont);
      if (!cont2) return;
      pintarCarpetas();
      const normales = d.lista.filter((x) => !x.plantilla), plantillas = d.lista.filter((x) => x.plantilla);
      const docs = ordenar(normales.filter((x) => (filtro === "TODOS" || x.modo === filtro) && (!busqueda || sinAcentos(x.nombre).includes(busqueda))
        && (carpetaSel == null || x.carpeta === carpetaSel) && (!soloDestacados || esDestacado(x))));
      // Con el espacio vacío, el botón de abajo ya dice "Crear documento": el "+" flotante sobraría.
      NOM.app.fijarFab(edita && d.lista.length ? () => nuevoDocumento(d) : null);
      if (!d.lista.length) {
        cont2.innerHTML = `<div class="vacio"><div class="burbuja">${ico("file-text")}</div><h3>Este espacio está vacío</h3>
          <p>${edita ? "Crea el primer documento: un texto, una hoja de cálculo, una presentación o un diagrama." : "Cuando alguien cree un documento, aparecerá aquí."}</p>
          ${edita ? `<button class="btn primario" data-v="nuevo">${ico("plus")} Crear documento</button>` : ""}
          ${d.enPapelera ? `<p><button class="btn chico" data-v="papelera">${ico("trash-2", "ico-s")} Ver la papelera (${d.enPapelera})</button></p>` : ""}</div>`;
        const b = $("[data-v=nuevo]", cont2); if (b) b.onclick = () => nuevoDocumento(d);
        const pp = $("[data-v=papelera]", cont2); if (pp) pp.onclick = () => papelera();
        return;
      }
      let h = "";
      if (!docs.length) {
        h += `<p class="suave" style="padding:18px 4px;font-weight:650">${busqueda ? "Ningún nombre coincide." : soloDestacados ? "Aún no destacas documentos: usa la estrella en su menú (⋯)." : carpetaSel != null ? "Esta carpeta está vacía: arrastra documentos aquí o usa «Mover a carpeta» en su menú." : "Nada coincide con lo que elegiste."}</p>`;
      } else h += `<div class="rejilla doc-rejilla" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${docs.map(tarjetaDoc).join("")}</div>`;
      if (busqueda.length >= 3) h += `<div class="busqueda-contenido" data-contenido>${pintarResultados()}</div>`;
      if (plantillas.length && !busqueda && carpetaSel == null && !soloDestacados) {
        h += `<details class="plantillas-espacio"${NOM.leer("nom.plantillas.abiertas", false) ? " open" : ""}><summary>${ico("copy-plus", "ico-s")} Plantillas de este espacio <small>${plantillas.length}</small></summary>
          <p class="suave chico" style="margin:4px 0 10px">Aparecen al crear un documento nuevo. Tócalas para usarlas.</p>
          <div class="rejilla doc-rejilla" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">${ordenar(plantillas).map(tarjetaDoc).join("")}</div></details>`;
      }
      cont2.innerHTML = h;
      const det = $(".plantillas-espacio", cont2);
      if (det) det.ontoggle = () => NOM.guardar("nom.plantillas.abiertas", det.open);
      $$("[data-doc]", cont2).forEach((a) => {
        const x = d.lista.find((y) => y.id === a.dataset.doc);
        if (x && x.plantilla) a.onclick = (e) => { if (e.target.closest("[data-menu]")) return; e.preventDefault(); usarPlantilla(x); };
        a.ondragstart = (e) => { e.dataTransfer.setData("text/nom-doc", a.dataset.doc); e.dataTransfer.effectAllowed = "move"; };
        // Clic derecho en una tarjeta: su menú (igual que el botón ⋯).
        a.oncontextmenu = (e) => { e.preventDefault(); const b = $("[data-menu]", a); if (b) menuDoc(b, x); };
      });
      $$("[data-menu]", cont2).forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); menuDoc(b, d.lista.find((x) => x.id === b.dataset.menu)); }));
    }

    // ------------------------------------------------------------ 8.5 menú de cada documento
    function menuDoc(ancla, doc) {
      if (!doc) return;
      const otros = (NOM.app.espacios || []).filter((e) => e.id !== d.id && e.permiso !== "LECTURA");
      const destacado = esDestacado(doc);
      NOM.menu(ancla, [
        doc.plantilla
          ? { texto: "Usar esta plantilla", icono: "file-plus", fn: () => usarPlantilla(doc) }
          : { texto: "Abrir", icono: "folder-open", fn: () => (location.hash = "#/doc/" + doc.id) },
        ...(doc.plantilla ? [{ texto: "Abrir para cambiarla", icono: "pencil", fn: () => (location.hash = "#/doc/" + doc.id) }] : []),
        { texto: destacado ? "Quitar de destacados" : "Destacar", icono: destacado ? "star-off" : "star", fn: () => destacar(doc, !destacado) },
        ...(edita ? [
          "-",
          { texto: "Cambiar el nombre…", icono: "pencil-line", fn: () => renombrar(doc) },
          { texto: "Hacer una copia", icono: "copy-plus", fn: () => copiar(doc) },
          ...(!doc.plantilla ? [
            { texto: "Mover a carpeta…", icono: "folder-input", fn: () => menuMoverCarpeta(ancla, doc) },
            { texto: "Guardar como plantilla del espacio", icono: "copy", fn: () => comoPlantilla(doc) },
          ] : []),
        ] : []),
        ...(otros.length ? [{ texto: edita ? "Mover a otro espacio…" : "Copiar a otro de mis espacios…", icono: "folder-input", fn: () => menuOtroEspacio(ancla, doc, otros, edita) }] : []),
        ...(dueno ? [
          "-",
          { texto: doc.enlaceVer ? "Enlace para ver (activo)…" : "Enlace para ver sin cuenta…", icono: "link-2", fn: () => enlaceVer(doc) },
          { texto: doc.protegido ? "Quitar la protección contra el borrado" : "Proteger contra el borrado", icono: doc.protegido ? "lock-open" : "lock", fn: () => proteger(doc, !doc.protegido) },
        ] : []),
        ...(edita ? [
          "-",
          { texto: "Mandar a la papelera", icono: "trash-2", peligro: true, fn: () => aPapelera(doc) },
        ] : []),
      ]);
    }
    async function accion(promesa, ok) {
      try { const r = await promesa; if (ok) aviso(typeof ok === "function" ? ok(r) : ok, { tipo: "ok" }); await recargar(); return r; }
      catch (e) { aviso(e.message, { tipo: "error", ms: 5000 }); return null; }
    }
    const destacar = (doc, si) => accion(api.put(`/api/documentos/${doc.id}/destacado`, { destacado: si }), si ? `“${doc.nombre}” está en tus destacados` : null);
    async function renombrar(doc) {
      const nombre = await NOM.pedirTexto("Cambiar el nombre", { etiqueta: "Nombre", valor: doc.nombre, max: 120, si: "Guardar" });
      if (!nombre || nombre === doc.nombre) return;
      accion(api.put(`/api/documentos/${doc.id}/nombre`, { nombre }), "Nombre cambiado");
    }
    const copiar = (doc) => accion(api.post(`/api/documentos/${doc.id}/copia`, {}), (r) => `Copia creada: “${r.nombre}”`);
    const comoPlantilla = (doc) => accion(api.post(`/api/documentos/${doc.id}/copia`, { plantilla: true }), "Guardada en las plantillas del espacio: sale al crear un documento nuevo");
    const ponerEnCarpeta = (doc, carpeta) => doc && accion(api.put(`/api/documentos/${doc.id}/carpeta`, { carpeta }), carpeta ? `“${doc.nombre}” está en ${carpeta}` : `“${doc.nombre}” ya no está en una carpeta`);
    function menuMoverCarpeta(ancla, doc) {
      const cs = carpetasDe().filter((c) => c !== doc.carpeta);
      NOM.menu(ancla, [{ titulo: "Mover a carpeta" },
        ...cs.map((c) => ({ texto: c, icono: "folder", fn: () => ponerEnCarpeta(doc, c) })),
        ...(doc.carpeta ? [{ texto: "Sacar de la carpeta", icono: "folder-open", fn: () => ponerEnCarpeta(doc, null) }] : []),
        "-",
        { texto: "Nueva carpeta…", icono: "folder-plus", fn: async () => { const c = await NOM.pedirTexto("Nueva carpeta", { etiqueta: "Nombre de la carpeta", max: 60, si: "Mover aquí" }); if (c) ponerEnCarpeta(doc, c); } },
      ]);
    }
    function menuCarpeta(ancla, carpeta) {
      NOM.menu(ancla, [{ titulo: carpeta },
        { texto: "Cambiar el nombre…", icono: "pencil-line", fn: async () => {
          const a = await NOM.pedirTexto("Cambiar el nombre de la carpeta", { etiqueta: "Nombre", valor: carpeta, max: 60, si: "Guardar" });
          if (!a || a === carpeta) return;
          carpetasNuevas = carpetasNuevas.map((c) => (c === carpeta ? a : c));
          if (carpetaSel === carpeta) carpetaSel = a;
          accion(api.put(`/api/espacios/${d.id}/carpetas`, { de: carpeta, a }), "Carpeta renombrada");
        } },
        { texto: "Quitar la carpeta (los documentos se quedan)", icono: "folder-open", fn: () => {
          carpetasNuevas = carpetasNuevas.filter((c) => c !== carpeta);
          if (carpetaSel === carpeta) carpetaSel = null;
          if (!d.lista.some((x) => x.carpeta === carpeta)) { pintarDocs(); return; }
          accion(api.put(`/api/espacios/${d.id}/carpetas`, { de: carpeta, a: null }), "Carpeta quitada");
        } },
      ]);
    }
    function menuOtroEspacio(ancla, doc, otros, mover) {
      NOM.menu(ancla, [{ titulo: mover ? "¿A qué espacio?" : "Copiar a…" },
        ...otros.map((e) => ({ texto: e.nombre, icono: "layout-grid", fn: async () => {
          if (mover) {
            if (!(await confirmar("Mover a otro espacio", `“${doc.nombre}” pasará a ${e.nombre}: lo verán sus miembros y dejará de estar aquí.`, { si: "Mover" }))) return;
            accion(api.put(`/api/documentos/${doc.id}/espacio`, { espacioId: e.id }), `Movido a ${e.nombre}`);
          } else accion(api.post(`/api/documentos/${doc.id}/copia`, { espacioId: e.id }), `Copia creada en ${e.nombre}`);
        } })),
        ...(mover ? ["-", { texto: "Mejor copiarlo a otro espacio…", icono: "copy-plus", fn: () => menuOtroEspacio(ancla, doc, otros, false) }] : []),
      ]);
    }
    async function usarPlantilla(doc) {
      const nombre = await NOM.pedirTexto("Nuevo documento desde la plantilla", { etiqueta: "Nombre", valor: doc.nombre, max: 120, si: "Crear" });
      if (nombre == null) return;
      try { const r = await api.post(`/api/documentos/${doc.id}/copia`, { nombre: nombre || doc.nombre }); location.hash = "#/doc/" + r.id; }
      catch (e) { aviso(e.message, { tipo: "error" }); }
    }
    async function aPapelera(doc) {
      if (doc.protegido) return aviso("Está protegido contra el borrado. " + (dueno ? "Quita la protección primero." : "Solo el propietario del espacio puede quitar la protección."), { tipo: "aviso", ms: 4500 });
      try {
        await api.delete(`/api/documentos/${doc.id}`);
        aviso(`“${doc.nombre}” está en la papelera (30 días)`, { tipo: "ok", ms: 6000, accion: { texto: "Deshacer", fn: () => accion(api.post(`/api/documentos/${doc.id}/restaurar`), "Restaurado") } });
        recargar();
      } catch (err) { aviso(err.message, { tipo: "error" }); }
    }

    // ------------------------------------------------------------ 8.5 papelera, enlace para ver y menciones
    async function papelera() {
      let l;
      try { l = await api.get(`/api/espacios/${d.id}/papelera`); } catch (e) { return aviso(e.message, { tipo: "error" }); }
      const cuerpo = html(`<div class="col"><p class="suave" style="margin:0">Lo que se manda a la papelera se borra solo a los ${30} días. Mientras, cualquiera que edite lo puede restaurar${dueno ? "; solo tú (propietario) lo borras para siempre" : ""}.</p><div class="lista" data-l></div></div>`);
      const pie = html(`<div style="display:contents">${dueno ? `<button class="btn peligro" type="button" data-vaciar>${ico("trash-2")} Vaciar la papelera</button>` : ""}<span class="crece"></span><button class="btn" type="button" data-cerrar>Cerrar</button></div>`);
      const h = hoja({ titulo: "Papelera", icono: "trash-2", cuerpo, pie });
      const pintar = () => {
        $("[data-l]", cuerpo).innerHTML = l.length ? l.map((x) => `<div class="lista-item" data-id="${esc(x.id)}">${ico(MODOS[x.modo] ? MODOS[x.modo].icono : "file-text")}<span class="crece"><b>${esc(x.nombre)}</b><small>${esc(x.eliminadoPor || "")} · ${esc(haceCuanto(x.eliminado))} · se borra en ${x.dias} día${x.dias === 1 ? "" : "s"}</small></span>
          <button class="btn chico" data-r>${ico("archive-restore", "ico-s")} Restaurar</button>${dueno ? `<button class="icono-btn" data-b aria-label="Borrar para siempre" data-micro="Borrar para siempre">${ico("x")}</button>` : ""}</div>`).join("")
          : `<div class="vacio" style="padding:20px"><div class="burbuja">${ico("trash")}</div><h3>La papelera está vacía</h3></div>`;
        const v = $("[data-vaciar]", pie); if (v) v.disabled = !l.length;
      };
      pintar();
      $("[data-l]", cuerpo).onclick = async (e) => {
        const it = e.target.closest("[data-id]");
        if (!it) return;
        const x = l.find((y) => y.id === it.dataset.id);
        if (e.target.closest("[data-r]")) {
          try { await api.post(`/api/documentos/${x.id}/restaurar`); l = l.filter((y) => y !== x); pintar(); aviso(`“${x.nombre}” volvió al espacio`, { tipo: "ok" }); recargar(); }
          catch (err) { aviso(err.message, { tipo: "error" }); }
        } else if (e.target.closest("[data-b]")) {
          if (!(await confirmar("Borrar para siempre", `“${x.nombre}” y todo su historial se borran y no se pueden recuperar.`, { si: "Borrar para siempre", peligro: true }))) return;
          try { await api.delete(`/api/documentos/${x.id}/definitivo`); l = l.filter((y) => y !== x); pintar(); recargar(); }
          catch (err) { aviso(err.message, { tipo: "error" }); }
        }
      };
      const v = $("[data-vaciar]", pie);
      if (v) v.onclick = async () => {
        if (!(await confirmar("Vaciar la papelera", `Se borran para siempre ${l.length} documento${l.length === 1 ? "" : "s"}.`, { si: "Vaciar", peligro: true }))) return;
        try { await api.delete(`/api/espacios/${d.id}/papelera`); l = []; pintar(); recargar(); } catch (err) { aviso(err.message, { tipo: "error" }); }
      };
      $("[data-cerrar]", pie).onclick = () => h.cerrar();
    }
    const enlaceVer = (doc) => enlaceVerDoc(doc, recargar);
    function pintarAvisos() {
      const c = $("[data-avisos]", cont);
      if (!c) return;
      c.innerHTML = d.avisos ? `<button class="btn primario-suave" data-a="avisos" data-micro="Menciones|Alguien te escribió @${esc((api.usuario() || {}).nombre || "")} en un comentario.">${ico("at-sign")} Menciones <span class="insignia">${d.avisos}</span></button>` : "";
      const b = $("[data-a=avisos]", c);
      if (b) b.onclick = () => menciones();
    }
    async function menciones() {
      let l;
      try { l = await api.get(`/api/espacios/${d.id}/avisos`); } catch (e) { return aviso(e.message, { tipo: "error" }); }
      d.avisos = 0; pintarAvisos();
      const cuerpo = html(`<div class="col"><div class="lista">${l.length ? l.map((a) => `<a class="lista-item" href="#/doc/${esc(a.docId)}${a.comentario ? "?comentario=" + encodeURIComponent(a.comentario) : ""}">${avatar({ nombre: a.por, color: a.color })}<span class="crece"><b>${esc(a.por)}</b> te mencionó en <b>${esc(a.documento)}</b><small>“${esc(a.texto)}” · ${esc(haceCuanto(a.t))}</small></span>${a.leido ? "" : '<span class="punto vivo"></span>'}</a>`).join("")
        : `<div class="vacio" style="padding:20px"><div class="burbuja">${ico("at-sign")}</div><h3>Nadie te ha mencionado</h3><p>Cuando alguien escriba @${esc((api.usuario() || {}).nombre || "tu-nombre")} en un comentario, aparecerá aquí.</p></div>`}</div></div>`);
      const h = hoja({ titulo: "Menciones", icono: "at-sign", cuerpo });
      cuerpo.onclick = (e) => { if (e.target.closest("a")) h.cerrar(true); };
    }
    pintarDocs();

    pintarAvisos();
    $$("[data-f]", cont).forEach((b) => (b.onclick = () => { filtro = b.dataset.f; $$("[data-f]", cont).forEach((x) => x.setAttribute("aria-pressed", x === b)); pintarDocs(); }));
    $("[data-buscar]", cont).oninput = (e) => {
      busqueda = sinAcentos(e.target.value.trim());
      // 8.5 Con 3 letras o más también se busca dentro de lo que dicen los documentos.
      enContenido = null;
      pintarDocs();
      if (busqueda.length >= 3) buscarContenido();
    };
    $("[data-a=compartir]", cont).onclick = () => accesos(d);
    $("[data-a=mas-espacio]", cont).onclick = (e) => NOM.menu(e.currentTarget, [
      ...(edita ? [{ texto: d.enPapelera ? `Papelera (${d.enPapelera})` : "Papelera", icono: "trash-2", fn: () => papelera() }] : []),
      { texto: "Menciones", icono: "at-sign", fn: () => menciones() },
      "-",
      { texto: "Descargar todo (Word, Excel y PowerPoint)", icono: "archive", fn: () => exportarTodo(d) },
      { texto: "Cuánto espacio ocupa", icono: "hard-drive", fn: () => almacenamiento(d) },
      ...(dueno ? [
        "-",
        { texto: "Letra de los textos nuevos…", icono: "type", fn: () => formatoEspacio(d, recargar) },
        ...(api.lan ? [{ texto: "Visible en el mismo Wi-Fi…", icono: "wifi", fn: () => conexion(d, recargar) }] : []),
        { texto: d.sincronia ? "Copia en otro NOM-COLAB…" : "Guardar una copia en otro NOM-COLAB…", icono: "refresh-cw", fn: () => sincronia(d, recargar) },
      ] : []),
    ]);
    const bn = $("[data-a=nuevo]", cont); if (bn) bn.onclick = () => nuevoDocumento(d);

    async function recargar() {
      try { const n = await api.get(`/api/espacios/${id}`); d = n; pintarRed(d.conexion); pintarConectados(d.conectados); pintarAvisos(); pintarDocs(); if (busqueda.length >= 3) buscarContenido(); } catch (e) { /* se reintenta con el siguiente evento */ }
    }
    async function proteger(doc, si) {
      let confirmacion = null;
      if (!si) { confirmacion = await NOM.pedirTexto("Quitar la protección", { etiqueta: "Para quitarla, escribe BORRAR", ph: "BORRAR", si: "Quitar protección", max: 10 }); if (confirmacion == null) return; }
      try { await api.put(`/api/documentos/${doc.id}/proteccion`, { protegido: si, confirmacion }); aviso(si ? `“${doc.nombre}” está protegido contra el borrado` : "Protección quitada", { tipo: "ok" }); recargar(); }
      catch (e) { aviso(e.message, { tipo: "error" }); }
    }
    const canal = api.eventos(`/api/espacios/${id}/eventos`, "esp-" + NOM.idCorto(), {
      hola: () => recargar(),
      documentos: () => recargar(),
      conectados: (x) => pintarConectados(x.usuarios),
      conexion: (x) => pintarRed(x.activa),
      espacio: () => recargar(),
      solicitud: (x) => { if (dueno) aviso(`${x.usuario} quiere entrar al espacio`, { accion: { texto: "Revisar", fn: () => accesos(d) } }); },
      permiso: (x) => { if (x.usuarioId === (api.usuario() || {}).id) { aviso("Tu permiso cambió", { tipo: "info" }); espacio(cont, id); } },
      expulsado: (x) => { aviso(x.motivo, { tipo: "aviso" }); location.hash = "#/"; },
      rechazo: (e) => aviso(e.message, { tipo: "aviso", ms: 6000 }),
      // 8.5 Alguien te mencionó en un comentario.
      aviso: (a) => { if (a && a.tipo === "mencion" && NOM.avisoNuevo(a)) { aviso(`${a.por} te mencionó en “${a.documento}”`, { accion: { texto: "Ver", fn: () => (location.hash = "#/doc/" + a.docId) }, ms: 8000 }); recargar(); } },
    });
    return () => canal.cerrar();
  }

  /** 8.5 Enlace para ver un solo documento sin cuenta (el propietario lo crea y lo quita). */
  async function enlaceVerDoc(doc, alCambiar) {
    let r;
    try { r = await api.post(`/api/documentos/${doc.id}/enlace-ver`); } catch (e) { return aviso(e.message, { tipo: "error" }); }
    const url = location.origin + location.pathname + "#/ver/" + r.enlace;
    const cuerpo = html(`<div class="col"><p style="margin:0">Quien tenga este enlace ve <b>${esc(doc.nombre)}</b> en solo lectura, <b>sin cuenta</b> y sin los comentarios. Sirve para compartirlo con familias o con otro grupo. Lo puedes quitar cuando quieras.</p>
      <div class="entrada">${ico("link-2")}<input readonly value="${esc(url)}" data-url aria-label="Enlace para ver"></div>
      <div class="pv-qr" style="align-self:center">${NOM.qr ? NOM.qr.svg(url, { titulo: "QR para ver el documento" }) : ""}</div></div>`);
    const pie = html(`<div style="display:contents"><button class="btn peligro" type="button" data-quitar>${ico("link-2-off")} Quitar el enlace</button><span class="crece"></span><button class="btn primario" type="button" data-copiar>${ico("copy")} Copiar enlace</button></div>`);
    const h = hoja({ titulo: "Enlace para ver", icono: "link-2", cuerpo, pie });
    $("[data-copiar]", pie).onclick = async () => {
      try { await navigator.clipboard.writeText(url); aviso("Enlace copiado", { tipo: "ok" }); } catch (e) { $("[data-url]", cuerpo).select(); document.execCommand("copy"); aviso("Enlace copiado", { tipo: "ok" }); }
    };
    $("[data-quitar]", pie).onclick = async () => {
      try { await api.delete(`/api/documentos/${doc.id}/enlace-ver`); h.cerrar(); aviso("Enlace quitado: ya no sirve", { tipo: "ok" }); if (alCambiar) alCambiar(); } catch (e) { aviso(e.message, { tipo: "error" }); }
    };
    if (alCambiar) alCambiar();
  }

  // ================================================================== 1.4 Formato por defecto del espacio
  function formatoEspacio(esp, listo) {
    const fb = esp.formatoBase || {};
    const FUENTES = (NOM.textoRico && NOM.textoRico.FUENTES) || {};
    const cuerpo = html(`<form class="col">
      <p class="suave" style="font-weight:650">Los documentos de texto <b>nuevos</b> de este espacio nacen con este formato (por ejemplo, para APA: Times New Roman 12 a doble espacio). Cada documento lo puede cambiar después en Más → Formato del documento.</p>
      <div class="campo"><label>Fuente</label><div class="entrada"><select data-f><option value="">Calibri (la de siempre)</option>${Object.keys(FUENTES).filter((f) => f !== "Calibri").map((f) => `<option ${fb.fuente === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></div></div>
      <div class="fila"><div class="campo crece"><label>Tamaño (pt)</label><div class="entrada"><input data-t inputmode="decimal" value="${esc(fb.tam || "")}" placeholder="11"></div></div>
        <div class="campo crece"><label>Primera línea (cm)</label><div class="entrada"><input data-pr inputmode="decimal" value="${esc(fb.primera || "")}" placeholder="0"></div></div>
        <div class="campo crece"><label>Interlineado</label><div class="entrada"><select data-l>${[["", "1.15 (Word)"], [1, "Sencillo"], [1.5, "1.5"], [2, "Doble"]].map(([v, t]) => `<option value="${v}" ${String(fb.interlineado || "") === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select></div></div></div>
      <button type="button" class="btn chico" data-apa>${ico("type", "ico-s")} Usar APA (Times New Roman 12, doble, sangría de 1.27 cm)</button></form>`);
    const pie = html(`<div style="display:contents"><button class="btn plano" data-quitar type="button">Sin formato propio</button><span class="crece"></span><button class="btn" data-no type="button">Cancelar</button><button class="btn primario" data-si>Guardar</button></div>`);
    const h = hoja({ titulo: "Formato de los documentos de texto", icono: "type", cuerpo, pie });
    const guardar = async (f) => {
      try { const r = await api.put(`/api/espacios/${esp.id}/formato`, f || {}); esp.formatoBase = r.formatoBase; h.cerrar(); aviso(f ? "Los documentos de texto nuevos tendrán este formato" : "Sin formato propio", { tipo: "ok" }); listo && listo(); }
      catch (e) { aviso(e.message, { tipo: "error" }); }
    };
    $("[data-apa]", cuerpo).onclick = () => { $("[data-f]", cuerpo).value = "Times New Roman"; $("[data-t]", cuerpo).value = 12; $("[data-l]", cuerpo).value = "2"; $("[data-pr]", cuerpo).value = "1.27"; };
    $("[data-no]", pie).onclick = () => h.cerrar();
    $("[data-quitar]", pie).onclick = () => guardar(null);
    $("[data-si]", pie).onclick = () => {
      const t = parseFloat(String($("[data-t]", cuerpo).value).replace(",", "."));
      const pr = parseFloat(String($("[data-pr]", cuerpo).value).replace(",", "."));
      const f = { fuente: $("[data-f]", cuerpo).value || null, tam: t > 0 ? t : null, interlineado: +$("[data-l]", cuerpo).value || null, primera: pr > 0 ? pr : null };
      guardar(f.fuente || f.tam || f.interlineado || f.primera ? f : null);
    };
  }

  // ================================================================== 6.5 Copia del espacio en otro servidor
  function sincronia(esp, listo) {
    const s = esp.sincronia;
    const cuerpo = html(`<div class="col">
      <p class="suave" style="font-weight:650">Por ejemplo, el teléfono del salón (que trabajó sin Internet) con NOM-COLAB en Internet. Cuando haya conexión, los documentos de este espacio se copian en los dos lugares cada 5 minutos: nada se borra y los permisos de cada lugar no cambian.</p>
      ${s ? `<div class="lista-item">${ico(s.estado === "ok" ? "cloud" : "cloud-off")}<span class="crece"><b>${esc((s.servidor || "").replace(/^https?:\/\//, ""))}</b><small>como ${esc(s.usuario || "")} · ${s.ultima ? "última copia " + esc(haceCuanto(s.ultima)) : "aún sin copiar"} · ${s.documentos} documento(s)${s.error ? " · " + esc(s.error) : ""}</small></span></div>` : ""}
      <form class="col" data-f ${s && s.estado !== "sesion" ? "hidden" : ""}>
        <div class="campo"><label for="ss">Dirección del otro NOM-COLAB</label><div class="entrada">${ico("server")}<input id="ss" name="servidor" placeholder="nomcolab.dpdns.org o 192.168.1.20:8080" value="${esc(s ? s.servidor : "")}" autocapitalize="none"></div></div>
        <div class="fila"><div class="campo crece"><label for="su">Tu usuario allá</label><div class="entrada"><input id="su" name="usuario" autocapitalize="none" value="${esc(s ? s.usuario : (api.usuario() || {}).nombre || "")}"></div></div>
          <div class="campo crece"><label for="sc">Contraseña allá</label><div class="entrada"><input id="sc" name="contrasena" type="password" autocomplete="off"></div></div></div>
        <div class="alerta error" data-err hidden></div>
        <button class="btn primario">${ico("refresh-cw")} Conectar y copiar</button></form>
      <div data-res></div></div>`);
    const pie = s ? html(`<div style="display:contents"><button class="btn plano peligro" data-quitar>Desconectar</button><span class="crece"></span><button class="btn" data-cambiar>Cambiar cuenta</button><button class="btn primario" data-ahora>${ico("refresh-cw", "ico-s")} Copiar ahora</button></div>`) : null;
    const h = hoja({ titulo: "Copia en otro NOM-COLAB", icono: "refresh-cw", cuerpo, pie, ancha: true });
    const res = $("[data-res]", cuerpo), f = $("[data-f]", cuerpo);
    const mostrar = (r) => { res.innerHTML = `<div class="alerta ${r.estado === "ok" ? "ok" : "aviso"}">${ico(r.estado === "ok" ? "circle-check" : "triangle-alert")}<span>${r.estado === "ok" ? `Listo: se enviaron ${r.subidas} cambio(s) y llegaron ${r.bajadas}. ${r.nuevosAlla ? r.nuevosAlla + " documento(s) nuevos allá. " : ""}${r.nuevosAqui ? r.nuevosAqui + " documento(s) nuevos aquí." : ""}` : esc(r.error || "No se pudo copiar")}</span></div>`; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const b = $("button", f), err = $("[data-err]", f);
      b.disabled = true; b.innerHTML = `<span class="cargando"></span> Conectando…`; err.hidden = true;
      try { const r = await api.put(`/api/espacios/${esp.id}/sincronia`, { servidor: f.servidor.value, usuario: f.usuario.value, contrasena: f.contrasena.value }, { ms: 120000 }); mostrar(r); f.hidden = true; listo && listo(); }
      catch (x) { err.hidden = false; err.innerHTML = `${ico("triangle-alert")}<span>${esc(x.message)}</span>`; }
      b.disabled = false; b.innerHTML = `${ico("refresh-cw")} Conectar y copiar`;
    };
    if (pie) {
      $("[data-cambiar]", pie).onclick = () => { f.hidden = false; f.contrasena.focus(); };
      $("[data-ahora]", pie).onclick = async (e) => { const b = e.currentTarget; b.disabled = true; try { mostrar(await api.post(`/api/espacios/${esp.id}/sincronia`, {}, { ms: 120000 })); listo && listo(); } catch (x) { aviso(x.message, { tipo: "error" }); } b.disabled = false; };
      $("[data-quitar]", pie).onclick = async () => { if (!(await confirmar("Desconectar", "Ya no se copiará este espacio. Lo copiado se queda en los dos servidores.", { si: "Desconectar" }))) return; try { await api.delete(`/api/espacios/${esp.id}/sincronia`); h.cerrar(); listo && listo(); } catch (x) { aviso(x.message, { tipo: "error" }); } };
    }
  }

  // ================================================================== Exportar todo el espacio (.zip con Office)
  async function exportarTodo(esp) {
    const fin = NOM.cargando ? NOM.cargando.empezar() : () => {};
    const cerrar = aviso("Preparando el .zip con todos los documentos…", { ms: 60000 });
    try {
      const lista = esp.lista || await api.get(`/api/espacios/${esp.id}/documentos`);
      const usados = new Set(), archivos = [];
      const nombreUnico = (base, ext) => { let n = NOM.formatos.limpioNombre(base) || "documento", k = 2; while (usados.has((n + "." + ext).toLowerCase())) n = NOM.formatos.limpioNombre(base) + " (" + k++ + ")"; usados.add((n + "." + ext).toLowerCase()); return n + "." + ext; };
      for (const d of lista) {
        const r = await api.get(`/api/documentos/${d.id}`, undefined, { ms: 20000 });
        const doc = new NOM.DocCRDT("zip-" + d.id, r.estado, { local: true, soloMemoria: true, soloLectura: true });
        const modo = (r.documento || d).modo;
        const ext = modo === "HOJA" ? "xlsx" : modo === "TEXTO" ? "docx" : "pptx";
        const datos = ext === "docx" ? NOM.ooxml.docx(doc) : ext === "xlsx" ? NOM.ooxml.xlsx(doc) : NOM.ooxml.pptx(doc, modo === "DIAGRAMA");
        archivos.push({ nombre: nombreUnico(d.nombre, ext), datos });
      }
      archivos.push({ nombre: "LEEME.txt", datos: `Espacio "${esp.nombre}" exportado de NOM-COLAB el ${new Date().toLocaleString("es-MX")}.\r\n${lista.length} documento(s): texto en .docx (Word), hojas en .xlsx (Excel), presentaciones y diagramas en .pptx (PowerPoint).\r\n` });
      NOM.formatos.descargarBytes(NOM.formatos.limpioNombre(esp.nombre) + ".zip", "application/zip", NOM.ooxml.zip(archivos));
      cerrar();
      aviso(`Listo: ${lista.length} documento(s) en el .zip`, { tipo: "ok" });
    } catch (e) { cerrar(); aviso(e.red ? "Sin conexión: no se pudieron leer los documentos" : e.message, { tipo: "error" }); }
    finally { fin(); }
  }

  // ================================================================== Preferencias (CU-27)
  const FABRICA = { tema: "auto", autoguardadoMin: 5, versionesConservar: 30, calidad: "alta", movimientoReducido: false, enfoqueAtenuar: true, idioma: "es" };
  async function preferencias() {
    let p = Object.assign({}, FABRICA, NOM.leer("nom.pref", {}));
    const sinCuenta = !api.token();
    if (!sinCuenta) { try { const r = await api.get("/api/cuentas/yo"); p = Object.assign({}, FABRICA, r.preferencias); } catch (e) { /* se usan las locales */ } }
    const u = sinCuenta ? NOM.local.usuario() : api.usuario() || {};
    let recuperacion = null;
    if (!sinCuenta) { try { recuperacion = (await api.get("/api/cuentas/yo")).recuperacion; } catch (e) { /* sin red */ } }
    const cuerpo = html(`<div class="col">
      <div class="lista-item" style="padding:14px">${avatar(u, "g")}<span class="crece"><b>${esc(u.nombre)}</b><small>${esc(sinCuenta ? "Preferencias guardadas en este equipo" : u.empresa || "Sin organización")}</small></span></div>
      <div class="campo"><span class="etiqueta">Apariencia</span>
        <div class="segmentado lleno" data-tema>${[["auto", "monitor", "Automático"], ["claro", "sun", "Claro"], ["oscuro", "moon", "Oscuro"]].map(([v, i, t]) => `<button type="button" data-v="${v}" aria-pressed="${p.tema === v}">${ico(i, "ico-s")} ${t}</button>`).join("")}</div></div>
      <div class="campo"><span class="etiqueta">Tamaño de la letra <span class="suave" style="font-weight:600">(en este equipo)</span></span>
        <div class="segmentado lleno" data-letra>${[["normal", "Normal", 15], ["grande", "Grande", 17], ["muy-grande", "Muy grande", 19]].map(([v, t, px]) => `<button type="button" data-v="${v}" aria-pressed="${(NOM.leer("nom.letra", "normal")) === v}" style="font-size:${px}px">${t}</button>`).join("")}</div>
        <div class="ayuda">${api.empaquetada ? "Agranda el texto de toda la app." : "Agranda el texto de las listas, menús y ventanas. Para agrandar todo, usa Ctrl y + en el navegador."}</div></div>
      <div class="campo"><label class="etiqueta" for="pa">Guardar una versión automática cada <b data-va>${p.autoguardadoMin}</b> min</label>
        <input id="pa" type="range" min="1" max="60" value="${p.autoguardadoMin}" style="accent-color:var(--acento)"></div>
      <div class="campo"><label class="etiqueta" for="pv">Conservar <b data-vv>${p.versionesConservar}</b> versiones por documento</label>
        <input id="pv" type="range" min="5" max="200" step="5" value="${p.versionesConservar}" style="accent-color:var(--acento)"></div>
      <div class="lista">
        <label class="lista-item">${ico("sparkles")}<span class="crece"><b>Calidad visual alta</b><small>Desactívala si el equipo se siente lento</small></span><span class="interruptor"><input type="checkbox" data-calidad ${p.calidad === "alta" ? "checked" : ""}><span></span></span></label>
        <label class="lista-item">${ico("hand")}<span class="crece"><b>Reducir movimiento</b><small>Quita animaciones y transiciones</small></span><span class="interruptor"><input type="checkbox" data-mov ${p.movimientoReducido ? "checked" : ""}><span></span></span></label>
        <label class="lista-item">${ico("scan-eye")}<span class="crece"><b>Atenuar en modo enfoque</b><small>Resalta solo el párrafo que escribes</small></span><span class="interruptor"><input type="checkbox" data-atenuar ${p.enfoqueAtenuar ? "checked" : ""}><span></span></span></label>
      </div>
      ${sinCuenta || u.invitado ? "" : `<div class="lista-item">${ico("key-round")}<span class="crece"><b>Código para recuperar tu contraseña</b><small data-rec>${recuperacion === false ? "Aún no tienes uno: genéralo y guárdalo en un lugar seguro." : "Si olvidas tu contraseña, con él pones una nueva."}</small></span><button type="button" class="btn chico" data-recuperacion>${recuperacion === false ? "Generar" : "Generar otro"}</button></div>`}
    </div>`);
    const pie = html(`<div style="display:contents"><button class="btn plano" data-fabrica>Valores de fábrica</button><span class="crece"></span><button class="btn primario" data-guardar>Guardar</button></div>`);
    let guardado = false;
    const original = Object.assign({}, p);
    // Si se cierra sin guardar, se deshace la vista previa del tema.
    const h = hoja({ titulo: "Ajustes y preferencias", icono: "settings", cuerpo, pie, alCerrar: () => { if (!guardado) NOM.aplicarPreferencias(original); } });
    const leerForm = () => ({
      ...p,
      tema: ($("[data-tema] [aria-pressed=true]", cuerpo) || {}).dataset.v || "auto",
      autoguardadoMin: +$("#pa", cuerpo).value,
      versionesConservar: +$("#pv", cuerpo).value,
      calidad: $("[data-calidad]", cuerpo).checked ? "alta" : "baja",
      movimientoReducido: $("[data-mov]", cuerpo).checked,
      enfoqueAtenuar: $("[data-atenuar]", cuerpo).checked,
    });
    $$("[data-tema] button", cuerpo).forEach((b) => (b.onclick = () => { $$("[data-tema] button", cuerpo).forEach((x) => x.setAttribute("aria-pressed", x === b)); NOM.aplicarPreferencias(leerForm()); }));
    $$("[data-letra] button", cuerpo).forEach((b) => (b.onclick = () => { $$("[data-letra] button", cuerpo).forEach((x) => x.setAttribute("aria-pressed", x === b)); NOM.aplicarLetra(b.dataset.v); }));
    $("#pa", cuerpo).oninput = (e) => ($("[data-va]", cuerpo).textContent = e.target.value);
    const br = $("[data-recuperacion]", cuerpo);
    if (br) br.onclick = async () => {
      if (recuperacion !== false && !(await confirmar("Código nuevo", "El código anterior dejará de servir.", { si: "Generar" }))) return;
      try { const r = await api.post("/api/cuentas/recuperacion"); recuperacion = true; NOM.vistaCuentas.mostrarCodigo(r.recuperacion, u.nombre); } catch (e) { aviso(e.message, { tipo: "error" }); }
    };
    $("#pv", cuerpo).oninput = (e) => ($("[data-vv]", cuerpo).textContent = e.target.value);
    ["[data-calidad]", "[data-mov]"].forEach((s) => ($(s, cuerpo).onchange = () => NOM.aplicarPreferencias(leerForm())));
    $("[data-fabrica]", pie).onclick = async () => {
      try { p = sinCuenta ? Object.assign({}, FABRICA) : await api.put("/api/cuentas/preferencias", FABRICA); guardado = true; NOM.aplicarPreferencias(p); h.cerrar(true); aviso("Se restauraron los valores de fábrica", { tipo: "ok" }); preferencias(); }
      catch (e) { aviso(e.message, { tipo: "error" }); }
    };
    $("[data-guardar]", pie).onclick = async () => {
      try { const n = sinCuenta ? leerForm() : await api.put("/api/cuentas/preferencias", leerForm()); guardado = true; NOM.aplicarPreferencias(n); if (NOM.hito) NOM.hito("preferencias"); h.cerrar(); aviso("Preferencias guardadas", { tipo: "ok" }); }
      catch (e) { aviso(e.message, { tipo: "error" }); }
    };
  }

  NOM.vistaEspacios = { enlaceVer: enlaceVerDoc, inicio, inicioSinCuenta, subirLocal, espacio, nuevoEspacio, unirse, accesos, almacenamiento, conexion, nuevoDocumento, preferencias, formatoEspacio, sincronia, exportarTodo, PERMISOS };
})();
