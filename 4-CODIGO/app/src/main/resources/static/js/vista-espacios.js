/* NOM-COLAB · Inicio y Módulo 3 (Espacios de trabajo): lista, crear (A3), unirse (A4),
   gestión de accesos (A5), almacenamiento (A7), preferencias y nuevo documento. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, api, aviso, hoja, confirmar, haceCuanto, bytes, avatar, MODOS } = { ...NOM, api: NOM.api };

  const PERMISOS = { PROPIETARIO: "Propietario", EDICION: "Puede editar", LECTURA: "Solo lectura" };
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
        <div class="fila solo-escritorio">
          <button class="btn" data-a="unirse" data-micro="Unirse a un espacio|Busca los espacios que tus compañeros comparten en esta red.">${ico("radio")} Unirse</button>
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
    if (NOM.primerosPasos) NOM.primerosPasos($(".encabezado", cont), lista);
    $("[data-cuantos]", cont).textContent = lista.length + (lista.length === 1 ? " espacio" : " espacios");
    if (!lista.length) {
      rej.outerHTML = `<div class="vacio">
        <div class="burbuja">${ico("layout-grid")}</div>
        <h3>Aún no tienes espacios</h3>
        <p style="max-width:42ch">Un espacio reúne los documentos de un equipo o proyecto. Crea uno o únete al de un compañero en esta red.</p>
        <div class="fila"><button class="btn" data-v="unirse">${ico("radio")} Unirse a uno</button><button class="btn primario" data-v="nuevo">${ico("plus")} Crear mi primer espacio</button></div>
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
        <span class="fila">${e.conexion ? `<span class="chip ok" data-micro="Visible en la red|Otros equipos de esta red pueden encontrar el espacio."><span class="punto vivo"></span>En red</span>` : ""}
        ${e.solicitudes ? `<span class="chip aviso">${e.solicitudes} solicitud${e.solicitudes > 1 ? "es" : ""}</span>` : ""}</span>
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
        <div class="entrada"><input id="ne" name="nombre" maxlength="60" placeholder="Ej. Academia de Matemáticas" autocomplete="off" autofocus></div>
        <div class="ayuda">Un espacio agrupa los documentos de un equipo o proyecto.</div></div>
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
        preguntarConexion(esp);
      } catch (err) {
        al.className = "alerta error"; al.hidden = false; al.innerHTML = `${ico("triangle-alert")}<span>${esc(err.message)}</span>`;
        $("[data-si]", pie).disabled = false;
      }
    };
    cuerpo.onsubmit = enviar;
    $("[data-si]", pie).onclick = enviar;
  }

  function preguntarConexion(esp) {
    const cuerpo = html(`<div class="col">
      <div class="exito-check">${ico("check")}</div>
      <p style="text-align:center;font-weight:650">El espacio <b>${esc(esp.nombre)}</b> está listo.<br><span class="suave">¿Quieres que tus compañeros de esta red lo encuentren?</span></p>
      <div class="alerta info">${ico("wifi")}<span>Al activar la <b>Conexión del proyecto</b>, el espacio se anuncia en tu red local. Solo entran quienes tú autorices.</span></div>
    </div>`);
    const pie = html(`<div style="display:contents"><button class="btn" data-no>Ahora no</button><button class="btn primario" data-si>${ico("wifi")} Activar conexión</button></div>`);
    const h = hoja({ titulo: "Conexión del proyecto", cuerpo, pie });
    $("[data-no]", pie).onclick = () => { h.cerrar(true); location.hash = "#/espacio/" + esp.id; };
    $("[data-si]", pie).onclick = async () => {
      try {
        const c = await api.put(`/api/espacios/${esp.id}/conexion`, { activa: true });
        h.cerrar(true);
        location.hash = "#/espacio/" + esp.id;
        aviso(c.sinRed ? "Activada, pero este equipo no está conectado a ninguna red" : "Visible en la red", { tipo: c.sinRed ? "aviso" : "ok" });
      } catch (e) { aviso(e.message, { tipo: "error" }); }
    };
  }

  // ================================================================== Conexión del proyecto (CU-14)
  async function conexion(esp, alCambiar) {
    let d;
    try { d = await api.get(`/api/espacios/${esp.id}`); } catch (e) { return aviso(e.message, { tipo: "error" }); }
    const c = d.conexionDetalle;
    const cuerpo = html(`<div class="col">
      <div class="lista-item" style="padding:14px">
        <span class="modo-insignia" style="background:var(--ok-tenue);color:var(--ok)">${ico("wifi")}</span>
        <span class="crece"><b>Visible en la red local</b><small>Se anuncia a los equipos de esta red para que puedan pedir acceso</small></span>
        <label class="interruptor"><input type="checkbox" ${c.activa ? "checked" : ""} aria-label="Conexión del proyecto"><span></span></label>
      </div>
      <div data-detalle></div>
    </div>`);
    const det = $("[data-detalle]", cuerpo);
    const pintar = (c) => {
      det.innerHTML = c.sinRed
        ? `<div class="alerta aviso">${ico("wifi-off")}<span>Este equipo no está conectado a ninguna red. No habrá descubrimiento hasta que te conectes a una.</span></div>`
        : c.activa
          ? `<p class="etiqueta">Tus compañeros entran desde</p>
             <div class="lista">${c.direcciones.map((ip) => `<div class="lista-item">${ico("link")}<span class="crece"><b style="font-family:var(--mono)">http://${esc(ip)}:${c.puerto}</b><small>Equipo ${esc(c.equipo)}</small></span><button class="icono-btn" data-copiar="http://${esc(ip)}:${c.puerto}" aria-label="Copiar" data-micro="Copiar dirección|Pégala en el navegador o en la app de tu compañero.">${ico("copy")}</button></div>`).join("")}</div>
             <p class="suave chico">La app Android también los encuentra con “Buscar en la red”.</p>`
          : `<div class="alerta info">${ico("lock")}<span>El espacio solo existe en este equipo. Los miembros que ya tienen acceso pueden seguir entrando con la dirección del servidor.</span></div>`;
      $$("[data-copiar]", det).forEach((b) => (b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copiar); aviso("Dirección copiada", { tipo: "ok" }); }));
    };
    pintar(c);
    hoja({ titulo: "Conexión del proyecto", cuerpo });
    $("input", cuerpo).onchange = async (e) => {
      try {
        const r = await api.put(`/api/espacios/${esp.id}/conexion`, { activa: e.target.checked });
        pintar(r);
        aviso(r.activa ? "El espacio ya es visible en la red" : "El espacio dejó de anunciarse", { tipo: "ok" });
        alCambiar && alCambiar();
      } catch (err) { e.target.checked = !e.target.checked; aviso(err.message, { tipo: "error" }); }
    };
  }

  // ================================================================== Unirse (A4)
  function unirse() {
    if (!api.lan) {
      hoja({ titulo: "Unirse a un espacio", icono: "radio", cuerpo: html(`<div class="col">
        <div class="alerta info">${ico("cloud")}<span>Estás en la versión en línea: no hace falta buscar en la red. Pide al propietario que te comparta el espacio desde <b>Compartir</b> con tu nombre de usuario <b>${esc((api.usuario() || {}).nombre || "")}</b>; aparecerá solo en tu Inicio, en todos tus dispositivos.</span></div></div>`) });
      return;
    }
    const cuerpo = html(`<div class="col">
      <div class="fila-e"><span class="etiqueta">Espacios en tu red</span><span class="chip" data-buscando><span class="cargando" style="width:12px;height:12px;border-width:2px"></span> Buscando…</span></div>
      <div class="lista" data-lista></div>
      <details style="margin-top:4px"><summary class="etiqueta" style="cursor:pointer">¿No aparece? Escribe la dirección</summary>
        <form class="fila" style="margin-top:10px" data-manual>
          <div class="entrada crece">${ico("server")}<input name="dir" placeholder="192.168.1.20:8080" inputmode="url" autocapitalize="none"></div>
          <button class="btn">Abrir</button>
        </form>
      </details>
    </div>`);
    const h = hoja({ titulo: "Unirse a un espacio", icono: "radio", cuerpo, alCerrar: () => clearInterval(t) });
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
            <p>Pide al propietario que active la <b>Conexión del proyecto</b>, o escribe la dirección abajo.${r.sinRed ? "<br><b>Este equipo no está conectado a una red.</b>" : ""}</p></div>`;
          if (primera) $("details", cuerpo).open = true;
        } else {
          lista.innerHTML = "";
          items.forEach((e) => {
            const ya = mios.has(e.id);
            const it = html(`<button class="lista-item" style="text-align:left;width:100%">
              <span class="icono-espacio" style="width:40px;height:40px;border-radius:14px;display:grid;place-items:center;color:#fff;font-weight:900;background:${esc(e.color || "#7AA7FF")}">${inicial(e.nombre)}</span>
              <span class="crece"><b>${esc(e.nombre)}</b><small>de ${esc(e.propietario)} · ${e.local ? "este servidor" : "equipo " + esc(e.equipo)}</small></span>
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
    const h = hoja({ titulo: "Compartir “" + esp.nombre + "”", icono: "share-2", cuerpo, ancha: true });
    let datos;
    async function cargar() {
      try { datos = await api.get(`/api/espacios/${esp.id}/accesos`); pintar(); }
      catch (e) { cuerpo.innerHTML = `<div class="alerta error">${ico("triangle-alert")}<span>${esc(e.message)}</span></div>`; }
    }
    function pintar() {
      const dueno = datos.miPermiso === "PROPIETARIO";
      cuerpo.innerHTML = `
        ${dueno ? `<form class="col" data-agregar novalidate>
          <span class="etiqueta">Invitar a alguien</span>
          <div class="fila" style="flex-wrap:wrap">
            <div class="entrada crece" style="min-width:200px">${ico("user-plus")}<input name="usuario" placeholder="Nombre de usuario" autocapitalize="none" autocomplete="off"></div>
            <div class="segmentado" role="group" aria-label="Permiso">
              <button type="button" data-p="EDICION" aria-pressed="true" data-micro="Puede editar|Crea y modifica documentos.">${ico("pencil", "ico-s")} Editar</button>
              <button type="button" data-p="LECTURA" aria-pressed="false" data-micro="Solo lectura|Ve los documentos sin cambiarlos.">${ico("eye", "ico-s")} Leer</button>
            </div>
            <button class="btn primario">Dar acceso</button>
          </div>
          <div class="alerta error" data-alerta hidden></div>
        </form>` : `<div class="alerta info">${ico("info")}<span>Solo el propietario puede cambiar los accesos.</span></div>`}
        ${dueno && datos.solicitudes.length ? `<div class="col"><span class="etiqueta">Quieren entrar (${datos.solicitudes.length})</span><div class="lista">${datos.solicitudes.map((s) => `
          <div class="lista-item">${avatar(s)}<span class="crece"><b>${esc(s.nombre)}</b><small>${esc(s.empresa || "")} ${esc(haceCuanto(s.fecha))}</small></span>
            <button class="btn chico" data-aceptar="${esc(s.nombre)}" data-p="LECTURA">Leer</button>
            <button class="btn chico primario" data-aceptar="${esc(s.nombre)}" data-p="EDICION">Editar</button>
            <button class="icono-btn" data-rechazar="${esc(s.id)}" aria-label="Rechazar" data-micro="Rechazar solicitud">${ico("x")}</button>
          </div>`).join("")}</div></div>` : ""}
        <div class="col"><span class="etiqueta">Miembros (${datos.miembros.length})</span><div class="lista">${datos.miembros.map((m) => `
          <div class="lista-item">${avatar(m)}<span class="crece"><b>${esc(m.nombre)}${m.id === (api.usuario() || {}).id ? " (tú)" : ""}</b><small>${m.conectado ? `<span style="color:var(--ok)">● conectado</span>` : esc(m.empresa || "")}</small></span>
            ${m.permiso === "PROPIETARIO" ? `<span class="chip acento">${ico("crown", "ico-s")} Propietario</span>`
              : dueno ? `<select class="mini-select" data-cambiar="${esc(m.nombre)}" aria-label="Permiso de ${esc(m.nombre)}" style="height:36px;border-radius:12px;border:1px solid var(--borde);background:var(--sup-2);padding:0 8px;font-weight:700">
                  <option value="EDICION" ${m.permiso === "EDICION" ? "selected" : ""}>Puede editar</option>
                  <option value="LECTURA" ${m.permiso === "LECTURA" ? "selected" : ""}>Solo lectura</option>
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
      cuerpo.innerHTML = `
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
    const pie = html(`<div style="display:contents"><button type="button" class="btn" data-importar>${ico("upload")} Importar archivo</button><span class="crece solo-escritorio"></span><button class="btn primario" data-crear>Crear documento</button></div>`);
    const h = hoja({ titulo: esp ? "Nuevo documento" : "Nuevo documento (en este equipo)", cuerpo, pie, ancha: true });
    if (!esp) cuerpo.prepend(html(`<div class="alerta aviso">${ico("hard-drive")}<span>Sin cuenta, el documento se guarda <b>solo ${NOM.aqui().en}</b>. Si ${NOM.aqui().borrar} se pierde, salvo que lo descargues.</span></div>`));
    function pintarPlantillas() {
      const ps = NOM.plantillas.delModo(modo);
      if (!plantilla || plantilla.modo !== modo) plantilla = ps[0];
      $("[data-plantillas]", cuerpo).innerHTML = ps.map((p) => `<button type="button" class="plantilla" data-p="${p.id}" aria-pressed="${p === plantilla}">${esc(p.nombre)}<small>${esc(p.desc)}</small></button>`).join("");
      $$("[data-p]", cuerpo).forEach((b) => (b.onclick = () => { plantilla = ps.find((p) => p.id === b.dataset.p); pintarPlantillas(); }));
    }
    $$("[data-modo]", cuerpo).forEach((b) => (b.onclick = () => { modo = b.dataset.modo; $$("[data-modo]", cuerpo).forEach((x) => x.setAttribute("aria-pressed", x === b)); pintarPlantillas(); }));
    pintarPlantillas();
    const crear = async (e) => {
      e && e.preventDefault();
      const nombre = cuerpo.nombre.value.trim() || (plantilla && plantilla.nombre !== "En blanco" ? plantilla.nombre : "");
      $("[data-crear]", pie).disabled = true;
      try {
        const ops = plantilla ? plantilla.crear() : [];
        if (!esp) { const d = NOM.local.crear(nombre, modo, ops); h.cerrar(true); location.hash = "#/local/" + d.id; return; }
        const d = await api.post(`/api/espacios/${esp.id}/documentos`, { nombre, modo, ops });
        h.cerrar(true);
        location.hash = "#/doc/" + d.id;
      } catch (err) { aviso(err.message, { tipo: "error" }); $("[data-crear]", pie).disabled = false; }
    };
    cuerpo.onsubmit = crear;
    $("[data-crear]", pie).onclick = crear;
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
          const d = await api.post(`/api/espacios/${esp.id}/documentos`, { nombre: r.nombre, modo: r.modo, ops: r.ops });
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
    cont.innerHTML = `
      <div class="fila-e"><h2>${conCuenta ? "En este equipo" : "Tus documentos en este equipo"}</h2>
        <div class="fila"><button class="btn chico" data-importar-local>${ico("upload", "ico-s")} Importar</button>
        <button class="btn chico ${conCuenta ? "" : "primario"}" data-nuevo-local>${ico("plus", "ico-s")} Nuevo documento</button></div></div>
      ${conCuenta ? `<p class="suave chico" style="font-weight:650;margin:-6px 0 14px">${ico("lock", "ico-s")} Solo en este dispositivo y cifrados con tu contraseña: no ocupan espacio en la nube. Para colaborar, guárdalos en un espacio.</p>` : ""}
      ${sueltos.length ? `<div class="alerta info" style="margin-bottom:12px">${ico("info")}<span class="crece">Hay ${sueltos.length} documento(s) creados sin cuenta ${NOM.aqui().en}, sin cifrar.</span><button class="btn chico" data-mover-local>Pasarlos a mi cuenta</button></div>` : ""}
      ${docs.length ? `<div class="rejilla doc-rejilla" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${docs.map(tarjetaLocal).join("")}</div>`
        : `<div class="vacio"><div class="burbuja">${ico("file-text")}</div><h3>Aún no tienes documentos</h3>
            <p style="max-width:44ch">Texto, hoja de cálculo, presentación o diagrama: todo en el mismo lienzo.</p>
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
        ...(api.token() ? [{ texto: "Guardar en un espacio (nube o red)", icono: "upload", fn: () => subirLocal(id, () => seccionLocal(cont, conCuenta)) }] : []),
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
        <p style="max-width:44ch">Un espacio reúne los documentos de un equipo y los guarda en el servidor: los editan juntos, desde la computadora o el celular, y no se pierden si cambias de equipo. Para tener espacios necesitas una cuenta (es gratis).</p>
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
    const cuerpo = html(`<div class="col"><p class="suave" style="font-weight:650">Elige el espacio. Al subirlo quedará guardado en el servidor y se quitará la copia de este equipo.</p>
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
    try { d = await api.get(`/api/espacios/${id}`); NOM.guardar(api.clave("cache.esp." + id), d); }
    catch (e) {
      d = NOM.leer(api.clave("cache.esp." + id), null);
      if (!d) { cont.innerHTML = `<div class="vacio"><div class="burbuja">${ico("triangle-alert")}</div><h3>${esc(e.message)}</h3><a class="btn" href="#/">Volver al inicio</a></div>`; return; }
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
          <button class="btn" data-a="compartir" data-micro="Compartir|Invita personas y elige si pueden editar o solo leer.">${ico("share-2")} <span class="solo-escritorio">Compartir</span></button>
          ${dueno && api.lan ? `<button class="btn" data-a="conexion" data-micro="Conexión del proyecto|Haz visible el espacio a otros equipos de tu red local.">${ico("wifi")} <span class="solo-escritorio">Conexión</span></button>` : ""}
          <button class="btn" data-a="almacen" data-micro="Almacenamiento|Cuánto ocupa el espacio y su historial de versiones.">${ico("hard-drive")} <span class="solo-escritorio">Almacenamiento</span></button>
          ${edita ? `<button class="btn primario solo-escritorio" data-a="nuevo">${ico("plus")} Nuevo documento</button>` : ""}
        </div>
      </div>
      <div class="fila-e" style="flex-wrap:wrap;margin-bottom:16px">
        <div class="segmentado" role="group" aria-label="Filtrar por modo" data-filtros>
          <button aria-pressed="true" data-f="TODOS">Todos</button>
          ${Object.keys(MODOS).map((m) => `<button aria-pressed="false" data-f="${m}" class="modo-${m}" data-micro="${esc(MODOS[m].nombre)}|Mostrar solo documentos que se abren en este modo.">${ico(MODOS[m].icono, "ico-s")}<span class="solo-escritorio">${esc(MODOS[m].nombre)}</span></button>`).join("")}
        </div>
        <div class="entrada" style="min-height:42px;width:min(320px,100%)">${ico("search")}<input placeholder="Buscar documento" data-buscar aria-label="Buscar documento"></div>
      </div>
      <div data-docs></div>`;

    const pintarRed = (activa) => {
      $("[data-chip-red]", cont).innerHTML = !api.lan
        ? `<span class="chip ok" data-micro="En línea|Está en el servidor en Internet: lo abres desde cualquier dispositivo con tu cuenta.">${ico("cloud", "ico-s")} En línea</span>`
        : activa
        ? `<span class="chip ok" data-micro="Visible en la red|Los equipos de esta red pueden encontrar el espacio y pedir acceso."><span class="punto vivo"></span>Visible en la red</span>`
        : `<span class="chip">${ico("lock", "ico-s")} Solo en este equipo</span>`;
    };
    const pintarConectados = (us) => { const c = $("[data-conectados]", cont); if (c) c.innerHTML = (us || []).slice(0, 5).map((u) => avatar(u)).join(""); };
    pintarRed(d.conexion);
    pintarConectados(d.conectados);

    function pintarDocs() {
      const cont2 = $("[data-docs]", cont);
      if (!cont2) return;
      const docs = d.lista.filter((x) => (filtro === "TODOS" || x.modo === filtro) && (!busqueda || x.nombre.toLowerCase().includes(busqueda)));
      if (!d.lista.length) {
        cont2.innerHTML = `<div class="vacio"><div class="burbuja">${ico("file-text")}</div><h3>Este espacio está vacío</h3>
          <p>${edita ? "Crea el primer documento: texto, hoja, presentación o diagrama, todo en el mismo lienzo." : "Cuando alguien cree un documento aparecerá aquí."}</p>
          ${edita ? `<button class="btn primario" data-v="nuevo">${ico("plus")} Crear documento</button>` : ""}</div>`;
        const b = $("[data-v=nuevo]", cont2); if (b) b.onclick = () => nuevoDocumento(d);
        return;
      }
      if (!docs.length) { cont2.innerHTML = `<p class="suave" style="padding:24px 4px;font-weight:650">Nada coincide con tu búsqueda.</p>`; return; }
      cont2.innerHTML = `<div class="rejilla doc-rejilla" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${docs.map((x) => `
        <a class="tarjeta doc-tarjeta clay modo-${esc(x.modo)}" href="#/doc/${esc(x.id)}">
          <div class="miniatura">${NOM.miniatura(x.modo)}</div>
          <div class="cuerpo"><span class="titulo recorta" style="font-size:15px">${esc(x.nombre)}</span>
            <span class="meta"><span>${ico(MODOS[x.modo].icono, "ico-s")} ${esc(MODOS[x.modo].nombre)}</span><span>${esc(haceCuanto(x.modificado))}</span></span></div>
          ${edita ? `<div class="acciones"><button class="icono-btn" data-menu="${esc(x.id)}" aria-label="Más opciones">${ico("more-horizontal")}</button></div>` : ""}
        </a>`).join("")}</div>`;
      $$("[data-menu]", cont2).forEach((b) => (b.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const doc = d.lista.find((x) => x.id === b.dataset.menu);
        NOM.menu(b, [
          { texto: "Abrir", icono: "folder-open", fn: () => (location.hash = "#/doc/" + doc.id) },
          "-",
          { texto: "Eliminar", icono: "trash-2", peligro: true, fn: async () => {
            if (!(await confirmar("Eliminar documento", `“${doc.nombre}” y todo su historial se eliminarán para todos los miembros.`, { si: "Eliminar", peligro: true }))) return;
            try { await api.delete(`/api/documentos/${doc.id}`); aviso("Documento eliminado", { tipo: "ok" }); } catch (err) { aviso(err.message, { tipo: "error" }); }
          } },
        ]);
      }));
    }
    pintarDocs();

    $$("[data-f]", cont).forEach((b) => (b.onclick = () => { filtro = b.dataset.f; $$("[data-f]", cont).forEach((x) => x.setAttribute("aria-pressed", x === b)); pintarDocs(); }));
    $("[data-buscar]", cont).oninput = (e) => { busqueda = e.target.value.trim().toLowerCase(); pintarDocs(); };
    $("[data-a=compartir]", cont).onclick = () => accesos(d);
    const bc = $("[data-a=conexion]", cont); if (bc) bc.onclick = () => conexion(d, recargar);
    $("[data-a=almacen]", cont).onclick = () => almacenamiento(d);
    const bn = $("[data-a=nuevo]", cont); if (bn) bn.onclick = () => nuevoDocumento(d);
    NOM.app.fijarFab(edita ? () => nuevoDocumento(d) : null);

    async function recargar() {
      try { const n = await api.get(`/api/espacios/${id}`); d = n; pintarRed(d.conexion); pintarConectados(d.conectados); pintarDocs(); } catch (e) { /* se reintenta con el siguiente evento */ }
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
    });
    return () => canal.cerrar();
  }

  // ================================================================== Preferencias (CU-27)
  const FABRICA = { tema: "auto", autoguardadoMin: 5, versionesConservar: 30, calidad: "alta", movimientoReducido: false, enfoqueAtenuar: true, idioma: "es" };
  async function preferencias() {
    let p = Object.assign({}, FABRICA, NOM.leer("nom.pref", {}));
    const sinCuenta = !api.token();
    if (!sinCuenta) { try { const r = await api.get("/api/cuentas/yo"); p = Object.assign({}, FABRICA, r.preferencias); } catch (e) { /* se usan las locales */ } }
    const u = sinCuenta ? NOM.local.usuario() : api.usuario() || {};
    const cuerpo = html(`<div class="col">
      <div class="lista-item" style="padding:14px">${avatar(u, "g")}<span class="crece"><b>${esc(u.nombre)}</b><small>${esc(sinCuenta ? "Preferencias guardadas en este equipo" : u.empresa || "Sin organización")}</small></span></div>
      <div class="campo"><span class="etiqueta">Apariencia</span>
        <div class="segmentado lleno" data-tema>${[["auto", "monitor", "Automático"], ["claro", "sun", "Claro"], ["oscuro", "moon", "Oscuro"]].map(([v, i, t]) => `<button type="button" data-v="${v}" aria-pressed="${p.tema === v}">${ico(i, "ico-s")} ${t}</button>`).join("")}</div></div>
      <div class="campo"><label class="etiqueta" for="pa">Guardar una versión automática cada <b data-va>${p.autoguardadoMin}</b> min</label>
        <input id="pa" type="range" min="1" max="60" value="${p.autoguardadoMin}" style="accent-color:var(--acento)"></div>
      <div class="campo"><label class="etiqueta" for="pv">Conservar <b data-vv>${p.versionesConservar}</b> versiones por documento</label>
        <input id="pv" type="range" min="5" max="200" step="5" value="${p.versionesConservar}" style="accent-color:var(--acento)"></div>
      <div class="lista">
        <label class="lista-item">${ico("sparkles")}<span class="crece"><b>Calidad visual alta</b><small>Desactívala en equipos con el hardware mínimo</small></span><span class="interruptor"><input type="checkbox" data-calidad ${p.calidad === "alta" ? "checked" : ""}><span></span></span></label>
        <label class="lista-item">${ico("hand")}<span class="crece"><b>Reducir movimiento</b><small>Quita animaciones y transiciones</small></span><span class="interruptor"><input type="checkbox" data-mov ${p.movimientoReducido ? "checked" : ""}><span></span></span></label>
        <label class="lista-item">${ico("scan-eye")}<span class="crece"><b>Atenuar en modo enfoque</b><small>Resalta solo el párrafo que escribes</small></span><span class="interruptor"><input type="checkbox" data-atenuar ${p.enfoqueAtenuar ? "checked" : ""}><span></span></span></label>
      </div>
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
    $("#pa", cuerpo).oninput = (e) => ($("[data-va]", cuerpo).textContent = e.target.value);
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

  NOM.vistaEspacios = { inicio, inicioSinCuenta, subirLocal, espacio, nuevoEspacio, unirse, accesos, almacenamiento, conexion, nuevoDocumento, preferencias, PERMISOS };
})();
