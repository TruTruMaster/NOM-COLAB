/* NOM-COLAB · Pantalla del proyector (5.5).
   Quien presenta (desde su teléfono o su computadora) pide un código; la computadora conectada al
   proyector abre /proyectar?c=CÓDIGO en cualquier navegador, sin iniciar sesión, y muestra la
   diapositiva en la que va el presentador, con sus transiciones y animaciones. Si alguien edita
   la presentación mientras tanto, el cambio también se ve aquí. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $ } = NOM;
  const api = () => NOM.api;

  async function abrir(raiz, codigo) {
    codigo = (NOM.union ? NOM.union.limpiarCodigo(codigo) : String(codigo || "").toUpperCase());
    raiz.innerHTML = `<div class="proyector" tabindex="0"><div class="proy-espera"><svg class="logo"><use href="#logo"/></svg><p>Conectando con la presentación…</p></div></div>`;
    const cont = $(".proyector", raiz);
    /** Pantalla para escribir el código (sin código, o si el que llegó no sirve). */
    function pedirCodigo(titulo, texto) {
      cont.innerHTML = `<div class="proy-espera"><svg class="logo"><use href="#logo"/></svg><h2>${esc(titulo)}</h2>
        <p>${esc(texto)}</p>
        <form class="fila" data-otro><div class="entrada">${ico("keyboard")}<input name="c" placeholder="Código de 6 letras" autocapitalize="characters" autocomplete="off" aria-label="Código de la presentación"></div><button class="btn primario">Proyectar</button></form></div>`;
      const f = $("[data-otro]", cont);
      f.onsubmit = (ev) => { ev.preventDefault(); const c = f.c.value.trim(); if (c) location.hash = "#/proyectar/" + encodeURIComponent(c); };
      setTimeout(() => f.c.focus(), 40);
      return () => {};
    }
    if (!codigo) return pedirCodigo("Proyectar una presentación", "Escribe el código que aparece en la pantalla de quien presenta (Presentar → En otra pantalla).");
    let datos;
    try { datos = await api().get(`/api/proyeccion/${encodeURIComponent(codigo)}`, undefined, { sin401: true, ms: 12000 }); }
    catch (e) {
      return pedirCodigo(e.red ? "No hay conexión" : "No se encontró la presentación",
        e.red ? "Revisa que esta computadora esté en la misma red que el equipo que comparte." : "El código no existe o la presentación ya terminó. Pide el código otra vez.");
    }
    document.title = (datos.documento && datos.documento.nombre ? datos.documento.nombre + " · " : "") + "Proyector · NOM-COLAB";
    const doc = new NOM.DocCRDT("proy-" + codigo, datos.estado, { soloLectura: true, soloMemoria: true, local: true });
    const V = NOM.lienzoVista;
    let pagina = datos.pagina || doc.paginas()[0], paso = datos.paso || 0, ultimaPagina = null;
    cont.innerHTML = `<div class="diapo" data-d></div>
      <div class="proy-barra"><button class="btn chico" data-completa>${ico("maximize-2", "ico-s")} Pantalla completa</button><span class="chip" data-estado><span class="punto vivo"></span> En vivo</span></div>`;
    const d = $("[data-d]", cont);
    function escala() {
      const T = V.tam ? V.tam(doc) : { w: V.ANCHO, h: V.ALTO };
      if (NOM.diapo) NOM.diapo.aplicar(d, doc, pagina);
      const k = Math.min(innerWidth / T.w, innerHeight / T.h);
      d.style.transform = `scale(${k})`;
      d.style.left = (innerWidth - T.w * k) / 2 + "px";
      d.style.top = (innerHeight - T.h * k) / 2 + "px";
    }
    // 8.3 Puntero láser y trazos de la pluma de quien presenta.
    let marcas = datos.marcas || null;
    function pintarMarcas() {
      let s = d.querySelector(".pres-marcas");
      const T = V.tam ? V.tam(doc) : { w: V.ANCHO, h: V.ALTO };
      if (!s) { s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("class", "pres-marcas"); d.append(s); }
      s.setAttribute("viewBox", `0 0 ${T.w} ${T.h}`);
      const m = marcas || {}, c = /^#[0-9a-f]{6}$/i.test(m.color || "") ? m.color : "#F2385A";
      s.innerHTML = (m.trazos || []).map((t) => `<polyline points="${t.map(Number).join(" ")}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join("")
        + (m.puntero ? `<circle cx="${+m.puntero.x}" cy="${+m.puntero.y}" r="10" fill="#F2385A" fill-opacity=".85"/><circle cx="${+m.puntero.x}" cy="${+m.puntero.y}" r="22" fill="#F2385A" fill-opacity=".25"/>` : "");
    }
    function pintar() {
      const pags = doc.paginas();
      if (!pags.includes(pagina)) pagina = pags[0];
      const nueva = pagina !== ultimaPagina;
      d.innerHTML = V.htmlDiapositiva(doc, pagina, paso);
      escala();
      pintarMarcas();
      if (nueva) {
        const t = doc.valor("_doc", "trans:" + pagina);
        d.classList.remove("trans-desvanecer", "trans-deslizar", "trans-empujar", "trans-zoom");
        if (t && ultimaPagina) { void d.offsetWidth; d.classList.add("trans-" + t); }
      }
      ultimaPagina = pagina;
    }
    escala(); pintar();
    addEventListener("resize", escala);
    $("[data-completa]", cont).onclick = () => { if (cont.requestFullscreen) cont.requestFullscreen().catch(() => {}); };
    // La pantalla no se apaga mientras se proyecta.
    let wake = null;
    if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request("screen").then((w) => (wake = w)).catch(() => {});
    const estado = $("[data-estado]", cont);
    const canal = api().eventos(`/api/proyeccion/${encodeURIComponent(codigo)}/eventos`, "proyector", {
      hola: () => { estado.innerHTML = `<span class="punto vivo"></span> En vivo`; },
      caido: () => { estado.innerHTML = `${ico("wifi-off", "ico-s")} Reconectando…`; },
      diapositiva: (x) => { if ((x.pagina || pagina) !== pagina) marcas = null; pagina = x.pagina || pagina; paso = x.paso || 0; if (x.marcas) marcas = x.marcas; pintar(); },
      marcas: (x) => { marcas = x; pintarMarcas(); },
      ops: (x) => { doc.fusionarRemotas(x.ops || []); pintar(); },
      version: async () => { try { const r = await api().get(`/api/proyeccion/${encodeURIComponent(codigo)}`, undefined, { sin401: true }); doc.reemplazarEstado(r.estado); pintar(); } catch (e) { /* siguiente evento */ } },
      fin: () => { cont.innerHTML = `<div class="proy-espera"><svg class="logo"><use href="#logo"/></svg><h2>La presentación terminó</h2><p>Gracias.</p></div>`; },
      rechazo: () => { cont.innerHTML = `<div class="proy-espera"><svg class="logo"><use href="#logo"/></svg><h2>La presentación terminó</h2></div>`; },
    });
    return () => { canal.cerrar(); removeEventListener("resize", escala); if (wake) wake.release().catch(() => {}); };
  }

  NOM.proyector = { abrir };
})();
