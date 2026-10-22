/* NOM-COLAB · Administrar usuarios (solo rol ADMINISTRADOR).
   El rol sale de la base de datos; el servidor responde 403 a cualquier otra cuenta. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, $, $$, api, aviso, confirmar, avatar, haceCuanto } = { ...NOM, api: NOM.api };

  const ROLES = {
    ADMINISTRADOR: { texto: "Administrador", chip: "acento", icono: "shield-check" },
    USUARIO: { texto: "Usuario", chip: "", icono: "users" },
  };

  async function pintar(cont) {
    const yo = api.usuario() || {};
    cont.innerHTML = `
      <div class="encabezado">
        <div><h1>Administrar usuarios</h1>
          <p class="sub">Cuentas guardadas en la base de datos, con su rol</p></div>
        <span class="chip acento">${ico("shield-check", "ico-s")} Solo administradores</span>
      </div>
      <div class="alerta info" style="margin-bottom:8px">${ico("info")}<span>El <b>rol</b> decide qué puede hacer cada cuenta. Un <b>Administrador</b> ve esta pantalla, cambia roles y desbloquea cuentas; un <b>Usuario</b> trabaja en sus espacios. El cambio aplica en su siguiente acción, sin cerrar su sesión.</span></div>
      <section class="seccion">
        <div class="fila-e"><h2>Cuentas</h2><span class="chip" data-cuantos></span></div>
        <div class="lista" data-usuarios>${'<div class="esqueleto" style="height:64px"></div>'.repeat(3)}</div>
      </section>`;

    let lista;
    try {
      lista = await api.get("/api/admin/usuarios");
    } catch (e) {
      $("[data-cuantos]", cont).hidden = true;
      $("[data-usuarios]", cont).innerHTML = `<div class="vacio"><div class="burbuja">${ico("lock")}</div><h3>${esc(e.message)}</h3>
        <p class="suave">Pide a un administrador que te dé el rol si necesitas esta sección.</p></div>`;
      return;
    }
    const pintarLista = () => {
      $("[data-cuantos]", cont).textContent = lista.length + (lista.length === 1 ? " cuenta" : " cuentas");
      $("[data-usuarios]", cont).innerHTML = lista.map((u) => {
        const r = ROLES[u.rol] || ROLES.USUARIO;
        const esYo = u.id === yo.id;
        return `<div class="lista-item" data-id="${esc(u.id)}" style="flex-wrap:wrap">
          ${avatar(u)}
          <span class="crece" style="min-width:160px"><b>${esc(u.nombre)}${esYo ? " (tú)" : ""}</b>
            <small>${esc(u.empresa || "Sin empresa")} · registrada ${esc(haceCuanto(u.creado))}</small></span>
          ${u.bloqueado ? `<span class="chip error">${ico("lock", "ico-s")} Bloqueada</span>` : ""}
          <span class="chip ${r.chip}">${ico(r.icono, "ico-s")} ${r.texto}</span>
          <div class="fila">
            ${u.bloqueado ? `<button class="btn chico" data-a="desbloquear">${ico("lock-open", "ico-s")} Desbloquear</button>` : ""}
            ${esYo ? "" : u.rol === "ADMINISTRADOR"
              ? `<button class="btn chico" data-a="rol" data-rol="USUARIO">Quitar administrador</button>`
              : `<button class="btn chico" data-a="rol" data-rol="ADMINISTRADOR">${ico("shield-check", "ico-s")} Hacer administrador</button>`}
          </div>
        </div>`;
      }).join("");
      $$("[data-a]", cont).forEach((b) => (b.onclick = () => accion(b)));
    };

    async function accion(b) {
      const id = b.closest("[data-id]").dataset.id;
      const u = lista.find((x) => x.id === id);
      try {
        let nuevo;
        if (b.dataset.a === "desbloquear") {
          nuevo = await api.post(`/api/admin/usuarios/${encodeURIComponent(id)}/desbloquear`);
          aviso(`${u.nombre} ya puede iniciar sesión`, { tipo: "ok" });
        } else {
          const rol = b.dataset.rol;
          if (rol === "ADMINISTRADOR" && !(await confirmar("Hacer administrador", `${u.nombre} podrá ver todas las cuentas, cambiar roles y desbloquear cuentas.`, { si: "Hacer administrador" }))) return;
          nuevo = await api.put(`/api/admin/usuarios/${encodeURIComponent(id)}/rol`, { rol });
          aviso(`${u.nombre} ahora es ${ROLES[nuevo.rol].texto}`, { tipo: "ok" });
        }
        lista = lista.map((x) => (x.id === id ? nuevo : x));
        pintarLista();
      } catch (e) {
        aviso(e.message, { tipo: "error" });
      }
    }
    pintarLista();
  }

  NOM.vistaAdmin = { pintar, ROLES };
})();
