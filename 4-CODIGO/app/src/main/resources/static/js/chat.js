/* NOM-COLAB · Chat del espacio (fase 15, parte E).
   Cada espacio tiene su chat, con imágenes y archivos (hasta 2 MB). El espacio es cerrado, así que
   el chat también. En un espacio cifrado de extremo a extremo los mensajes se cifran en este equipo
   (e2e.js, en el borde de la API) y el servidor no los puede leer; por eso, para reportar uno, quien
   reporta descarga el mensaje ya descifrado con su contexto y lo manda al equipo. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso, hoja, confirmar, avatar } = NOM;
  const api = () => NOM.api;
  const MAX = 2 * 1024 * 1024;

  const hora = (t) => new Date(t).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function leerArchivo(f) {
    return new Promise((ok, mal) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""));
      r.onerror = () => mal(new Error("No se pudo leer el archivo"));
      r.readAsDataURL(f);
    });
  }

  /** Abre el chat del espacio esp ({ id, nombre, permiso, e2e }). Devuelve una función para cerrarlo. */
  function abrir(esp) {
    const yo = (api().usuario() || {}).id;
    const cuerpo = html(`<div class="chat">
      ${esp.e2e ? `<p class="chat-nota">${ico("lock-keyhole", "ico-s")} Cifrado de extremo a extremo: solo los miembros lo leen.</p>` : `<p class="chat-nota">${ico("users", "ico-s")} Solo lo ven los miembros de este espacio.</p>`}
      <div class="chat-lista" data-lista role="log" aria-live="polite"><div class="esqueleto" style="height:60px"></div></div>
      <form class="chat-escribir" data-form>
        <button type="button" class="icono-btn" data-adjuntar aria-label="Adjuntar imagen o archivo" data-micro="Adjuntar|Una imagen o un archivo de hasta 2 MB.">${ico("paperclip")}</button>
        <textarea name="texto" rows="1" maxlength="4000" placeholder="Escribe un mensaje…" aria-label="Mensaje"></textarea>
        <button class="icono-btn primario" aria-label="Enviar">${ico("send")}</button>
      </form>
    </div>`);
    const h = hoja({ titulo: "Chat · " + esp.nombre, icono: "message-circle", cuerpo, ancha: true, alCerrar: () => canal && canal.cerrar() });
    const lista = $("[data-lista]", cuerpo), form = $("[data-form]", cuerpo);
    let mensajes = [];

    function pintar() {
      if (!mensajes.length) { lista.innerHTML = `<p class="suave chat-vacio">Aún no hay mensajes. Escribe el primero.</p>`; return; }
      lista.innerHTML = mensajes.map((m) => `<div class="chat-msg ${m.usuarioId === yo ? "mio" : ""}" data-m="${esc(m.id)}">
        ${m.usuarioId === yo ? "" : avatar({ nombre: m.usuario, color: m.color })}
        <div class="burbuja-chat"><b>${esc(m.usuarioId === yo ? "Tú" : m.usuario)}</b>
          ${m.texto ? `<p>${esc(m.texto)}</p>` : ""}
          ${m.adjunto ? `<button type="button" class="chat-adjunto" data-ver="${esc(m.id)}">${ico(m.adjunto.tipo === "imagen" ? "image" : "file-text", "ico-s")} ${esc(m.adjunto.nombre || "archivo")} <small>${esc(NOM.bytes(m.adjunto.bytes || 0))}</small></button><div data-img="${esc(m.id)}"></div>` : ""}
          <small class="chat-hora">${esc(hora(m.t))}</small></div>
        <button type="button" class="icono-btn chico chat-mas" data-mas="${esc(m.id)}" aria-label="Opciones del mensaje">${ico("more-horizontal", "ico-s")}</button></div>`).join("");
      lista.scrollTop = lista.scrollHeight;
      $$("[data-ver]", lista).forEach((b) => (b.onclick = () => verAdjunto(mensajes.find((x) => x.id === b.dataset.ver), b)));
      $$("[data-mas]", lista).forEach((b) => (b.onclick = () => opciones(mensajes.find((x) => x.id === b.dataset.mas), b)));
      // Mantener presionado (con el dedo) también abre las opciones.
      $$(".chat-msg", lista).forEach((el) => (el.oncontextmenu = (e) => { e.preventDefault(); opciones(mensajes.find((x) => x.id === el.dataset.m), el); }));
    }

    async function cargar() {
      try { const r = await api().get(`/api/espacios/${esp.id}/chat`); mensajes = r.mensajes || []; pintar(); }
      catch (e) { lista.innerHTML = `<div class="alerta error">${ico("triangle-alert")}<span>${esc(e.message)}</span></div>`; }
    }

    async function verAdjunto(m, b) {
      b.disabled = true;
      try {
        const r = await api().get(`/api/espacios/${esp.id}/chat/${m.id}/adjunto`, undefined, { ms: 30000 });
        const mime = m.adjunto.mime || "application/octet-stream";
        if (m.adjunto.tipo === "imagen" && /^image\//.test(mime)) {
          const caja = $(`[data-img="${m.id}"]`, lista);
          caja.innerHTML = `<img class="chat-img" alt="${esc(m.adjunto.nombre || "Imagen")}" src="data:${esc(mime)};base64,${r.datos}">`;
        } else {
          const bytes = Uint8Array.from(atob(r.datos), (c) => c.charCodeAt(0));
          NOM.formatos.descargarBytes(m.adjunto.nombre || "archivo", mime, bytes);
        }
      } catch (e) { aviso(e.message, { tipo: "error" }); }
      b.disabled = false;
    }

    function opciones(m, ancla) {
      if (!m) return;
      const puedeBorrar = m.usuarioId === yo || esp.permiso === "PROPIETARIO";
      NOM.menu(ancla, [
        ...(m.texto ? [{ texto: "Copiar", icono: "copy", fn: () => NOM.copiarConAviso(m.texto, "Mensaje copiado") }] : []),
        { texto: "Reportar…", icono: "flag", fn: () => reportar(m) },
        ...(puedeBorrar ? ["-", { texto: "Borrar", icono: "trash-2", peligro: true, fn: async () => {
          if (!(await confirmar("Borrar el mensaje", "Se borra para todos.", { si: "Borrar", peligro: true }))) return;
          try { await api().delete(`/api/espacios/${esp.id}/chat/${m.id}`); } catch (e) { aviso(e.message, { tipo: "error" }); }
        } }] : []),
      ]);
    }

    /** Reportar: el equipo no puede leer un chat cifrado, así que se descarga lo reportado ya descifrado. */
    async function reportar(m) {
      if (!(await confirmar("Reportar un mensaje", "Se descarga un archivo con este mensaje y los 5 anteriores, como los ves tú. Mándalo al equipo de NOM-COLAB (Ayuda → Reportar contenido). Primero habla con el propietario del espacio: él puede borrarlo.", { si: "Descargar el reporte" }))) return;
      const i = mensajes.indexOf(m);
      const r = { reporte: "NOM-COLAB · contenido reportado", fecha: new Date().toISOString(), espacio: esp.nombre, cifrado: !!esp.e2e,
        mensaje: { autor: m.usuario, hora: new Date(m.t).toISOString(), texto: m.texto, adjunto: m.adjunto ? m.adjunto.nombre : null },
        contexto: mensajes.slice(Math.max(0, i - 5), i).map((x) => ({ autor: x.usuario, hora: new Date(x.t).toISOString(), texto: x.texto })) };
      NOM.formatos.descargar("reporte-nom-colab.json", "application/json", JSON.stringify(r, null, 2));
      NOM.ayuda("legal/denuncias");
    }

    const texto = form.texto;
    texto.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const t = texto.value.trim();
      if (!t) return;
      texto.disabled = true;
      try { await api().post(`/api/espacios/${esp.id}/chat`, { texto: t }); texto.value = ""; }
      catch (x) { aviso(x.message, { tipo: "error" }); }
      texto.disabled = false; texto.focus();
    };
    $("[data-adjuntar]", cuerpo).onclick = async () => {
      const f = await NOM.formatos.elegirArchivo("image/*,.pdf,.docx,.xlsx,.pptx,.txt,.csv,.nom");
      if (!f) return;
      if (f.size > MAX) return aviso("El archivo pasa de 2 MB. Súbelo como documento del espacio.", { tipo: "aviso", ms: 6000 });
      try {
        const datos = await leerArchivo(f);
        await api().post(`/api/espacios/${esp.id}/chat`, { texto: texto.value.trim(), adjunto: { tipo: /^image\//.test(f.type) ? "imagen" : "archivo", nombre: f.name, mime: f.type || "application/octet-stream", datos } }, { ms: 60000 });
        texto.value = "";
      } catch (x) { aviso(x.message, { tipo: "error" }); }
    };

    // En vivo: el canal del espacio avisa de cada mensaje (se vuelve a pedir la lista: así llega descifrado).
    const canal = api().eventos(`/api/espacios/${esp.id}/eventos`, "chat-" + Math.random().toString(36).slice(2, 7), {
      chat: () => cargar(),
      hola: () => cargar(),
    });
    cargar();
    setTimeout(() => texto.focus(), 60);
    return () => h.cerrar(true);
  }

  NOM.chat = { abrir };
})();
