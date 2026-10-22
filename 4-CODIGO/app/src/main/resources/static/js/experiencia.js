/* NOM-COLAB · Experiencia: lo que hace que la app se sienta cuidada y que cada persona se sienta
   bienvenida.
   - Paleta de comandos (Ctrl+K, o Alt+/ dentro del texto): ir a documentos, espacios y acciones
     escribiendo unas letras, como en Linear, Vercel o Raycast. Muestra los atajos de cada acción.
   - Barra de carga arriba: solo aparece si algo tarda más de 160 ms y, si aparece, se queda al
     menos 350 ms (nunca parpadea).
   - Primeros pasos en el inicio de una cuenta nueva y un consejo de la ruedita en cada editor.
   - Bienvenida al entrar, hoja de atajos (tecla ?) y una luz que sigue al cursor en las tarjetas. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$ } = NOM;
  const api = () => NOM.api;
  const reducido = () => document.documentElement.dataset.movimiento === "reducido" || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const conCuenta = () => !!(NOM.api && NOM.api.token());
  const clave = (k) => (conCuenta() ? api().clave(k) : "nom.local." + k);

  // ================================================================== hitos (primeros pasos)
  const hitos = () => NOM.leer(clave("hitos"), {});
  /** Marca algo que la persona ya hizo (probar la ruedita, ajustar la app…). */
  NOM.hito = (nombre) => {
    const h = hitos();
    if (h[nombre]) return;
    h[nombre] = Date.now();
    NOM.guardar(clave("hitos"), h);
    document.dispatchEvent(new CustomEvent("nom:hito", { detail: nombre }));
  };

  // ================================================================== barra de carga
  let enCurso = 0, tMostrar = null, desde = 0, barra = null;
  const barraEl = () => barra || (barra = document.body.appendChild(html(`<div class="carga" role="progressbar" aria-label="Cargando" hidden><i></i></div>`)));
  function empezar() {
    enCurso++;
    if (enCurso === 1 && !desde) {
      clearTimeout(tMostrar);
      tMostrar = setTimeout(() => {
        const b = barraEl();
        b.hidden = false; b.classList.remove("fin"); void b.offsetWidth; b.classList.add("activa");
        desde = Date.now();
      }, 160);
    }
    let hecho = false;
    return () => {
      if (hecho) return;
      hecho = true;
      enCurso = Math.max(0, enCurso - 1);
      if (enCurso) return;
      clearTimeout(tMostrar);
      if (!desde) return;
      setTimeout(() => {
        if (enCurso) return;
        const b = barraEl(), i = b.firstElementChild;
        // Se congela donde iba y de ahí se completa (si no, regresaría a cero antes de llenarse).
        i.style.transform = getComputedStyle(i).transform;
        b.classList.remove("activa");
        void i.offsetWidth;
        i.style.transition = "transform .28s cubic-bezier(.16, 1, .3, 1)";
        i.style.transform = "scaleX(1)";
        b.classList.add("fin");
        desde = 0;
        setTimeout(() => { if (!enCurso && !desde) { b.hidden = true; b.classList.remove("fin"); i.style.transform = ""; i.style.transition = ""; } }, 480);
      }, Math.max(0, 350 - (Date.now() - desde)));
    };
  }
  NOM.cargando = { empezar, en: (promesa) => { const fin = empezar(); return Promise.resolve(promesa).finally(fin); } };

  // ================================================================== paleta de comandos
  const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  /** Qué tan bien coincide lo escrito (0: no coincide). Inicio de palabra > en medio > todas las
      palabras > letras en orden. */
  function puntaje(texto, q) {
    const t = sinAcentos(texto), p = sinAcentos(q).trim();
    if (!p) return 1;
    const i = t.indexOf(p);
    if (i === 0) return 100;
    if (i > 0) return (/[\s·(/-]/.test(t[i - 1]) ? 85 : 60) - Math.min(i, 30) / 3;
    const ps = p.split(/\s+/);
    if (ps.length > 1 && ps.every((w) => t.includes(w))) return 45;
    let j = 0;
    for (const c of t) if (c === p[j]) j++;
    return j === p.length ? 20 - Math.min(t.length, 60) / 6 : 0;
  }
  const MODO_ICONO = { TEXTO: "file-text", HOJA: "sheet", PRESENTACION: "presentation", DIAGRAMA: "workflow" };
  let docsCache = { t: 0, lista: [] };
  /** Documentos de todos los espacios (para buscarlos por nombre); se refresca cada minuto. */
  async function documentosDeEspacios() {
    if (!conCuenta()) return [];
    if (Date.now() - docsCache.t < 60000) return docsCache.lista;
    const espacios = (NOM.app && NOM.app.espacios) || [];
    const listas = await Promise.all(espacios.slice(0, 12).map((e) => api().get(`/api/espacios/${e.id}/documentos`, undefined, { ms: 5000 })
      .then((l) => (l || []).map((d) => ({ ...d, espacio: e.nombre }))).catch(() => [])));
    docsCache = { t: Date.now(), lista: listas.flat() };
    return docsCache.lista;
  }
  function cambiarPreferencia(campos, texto) {
    const p = Object.assign({}, NOM.leer("nom.pref", {}), campos);
    NOM.aplicarPreferencias(p);
    if (conCuenta()) api().put("/api/cuentas/preferencias", p).catch(() => {});
    NOM.hito("preferencias");
    NOM.aviso(texto, { tipo: "ok", ms: 1800 });
  }
  function espacioActual() {
    const m = location.hash.match(/^#\/espacio\/([^/?]+)/);
    const lista = (NOM.app && NOM.app.espacios) || [];
    if (m) return lista.find((e) => e.id === m[1]) || null;
    const ed = editorVisible();
    return ed && ed.espacio && ed.espacio.id ? lista.find((e) => e.id === ed.espacio.id) || ed.espacio : null;
  }
  const editorVisible = () => { const ed = NOM.editorActual; return ed && ed.vista && ed.vista.isConnected ? ed : null; };

  /** Todo lo que se puede buscar ahora, según dónde está la persona (docs: documentos de los espacios). */
  function elementos(docs) {
    const l = [];
    const ed = editorVisible();
    const pref = NOM.leer("nom.pref", {});
    const espacios = (NOM.app && NOM.app.espacios) || [];
    const u = conCuenta() ? api().usuario() || {} : null;
    if (ed && ed.acciones) ed.acciones().forEach((a) => l.push(Object.assign({ grupo: "En este documento" }, a)));

    const nuevoDoc = (esp) => () => NOM.vistaEspacios.nuevoDocumento(esp);
    if (conCuenta()) {
      const esp = espacioActual();
      if (esp) l.push({ grupo: "Crear", texto: `Nuevo documento en ${esp.nombre}`, icono: "file-plus", atajo: "", fn: nuevoDoc(esp), claves: "crear documento nuevo" });
      else if (espacios.length === 1) l.push({ grupo: "Crear", texto: `Nuevo documento en ${espacios[0].nombre}`, icono: "file-plus", fn: nuevoDoc(espacios[0]), claves: "crear documento nuevo" });
      else if (espacios.length) l.push({ grupo: "Crear", texto: "Nuevo documento…", icono: "file-plus", claves: "crear documento nuevo", sub: () => espacios.map((e) => ({ grupo: "¿En qué espacio?", texto: e.nombre, icono: "layout-grid", fn: nuevoDoc(e) })) });
      l.push({ grupo: "Crear", texto: "Nuevo espacio", icono: "plus", fn: () => NOM.vistaEspacios.nuevoEspacio(), claves: "crear espacio equipo proyecto" });
      l.push({ grupo: "Crear", texto: "Unirse a un espacio", icono: "radio", fn: () => NOM.vistaEspacios.unirse(), claves: "red compartir buscar" });
    } else {
      l.push({ grupo: "Crear", texto: "Nuevo documento (en este equipo)", icono: "file-plus", fn: nuevoDoc(null), claves: "crear documento nuevo" });
      l.push({ grupo: "Crear", texto: "Crear una cuenta", icono: "user-plus", fn: () => NOM.app.irACuentas("registro"), claves: "registrarse cuenta" });
    }

    // Recientes primero; luego todos los documentos.
    const vistos = new Set();
    const recientes = conCuenta() ? NOM.leer(api().clave("recientes"), []) : [];
    recientes.forEach((r) => { vistos.add(r.id); l.push({ grupo: "Recientes", texto: r.nombre || "Sin título", sub2: r.espacio, icono: MODO_ICONO[r.modo] || "file-text", fn: () => (location.hash = "#/doc/" + r.id), modo: r.modo }); });
    (docs || []).forEach((d) => { if (!vistos.has(d.id)) l.push({ grupo: "Documentos", texto: d.nombre || "Sin título", sub2: d.espacio, icono: MODO_ICONO[d.modo] || "file-text", fn: () => (location.hash = "#/doc/" + d.id), modo: d.modo, oculto: true }); });
    (NOM.local && NOM.local.lista ? NOM.local.lista() : []).forEach((d) => l.push({ grupo: "En este equipo", texto: d.nombre || "Sin título", sub2: "Solo en este equipo", icono: MODO_ICONO[d.modo] || "file-text", fn: () => (location.hash = "#/local/" + d.id), modo: d.modo, oculto: true }));
    espacios.forEach((e) => l.push({ grupo: "Espacios", texto: e.nombre, sub2: `${e.documentos} documento${e.documentos === 1 ? "" : "s"} · ${e.miembros} persona${e.miembros === 1 ? "" : "s"}`, icono: "layout-grid", color: e.color, fn: () => (location.hash = "#/espacio/" + e.id), oculto: espacios.length > 5 }));

    l.push({ grupo: "Ir a", texto: "Inicio", icono: "house", fn: () => (location.hash = "#/"), claves: "principal home" });
    l.push({ grupo: "Ir a", texto: "Archivos en este dispositivo", icono: "hard-drive", fn: () => (location.hash = "#/dispositivo"), claves: "local almacenamiento" });
    if (u && u.rol === "ADMINISTRADOR") l.push({ grupo: "Ir a", texto: "Administrar usuarios", icono: "shield-check", fn: () => (location.hash = "#/admin"), claves: "admin cuentas roles" });

    const tema = pref.tema || "auto";
    l.push({ grupo: "Apariencia", texto: "Tema oscuro", icono: "moon", marcado: tema === "oscuro", fn: () => cambiarPreferencia({ tema: "oscuro" }, "Tema oscuro"), claves: "noche negro dark" });
    l.push({ grupo: "Apariencia", texto: "Tema claro", icono: "sun", marcado: tema === "claro", fn: () => cambiarPreferencia({ tema: "claro" }, "Tema claro"), claves: "dia blanco light" });
    l.push({ grupo: "Apariencia", texto: "Tema automático (como el sistema)", icono: "monitor", marcado: tema === "auto", fn: () => cambiarPreferencia({ tema: "auto" }, "Tema automático"), claves: "sistema" });
    l.push({ grupo: "Apariencia", texto: pref.movimientoReducido ? "Activar animaciones" : "Reducir movimiento", icono: "sparkles", fn: () => cambiarPreferencia({ movimientoReducido: !pref.movimientoReducido }, pref.movimientoReducido ? "Animaciones activadas" : "Movimiento reducido"), claves: "animaciones accesibilidad" });
    l.push({ grupo: "Ayuda", texto: "Atajos de teclado", icono: "keyboard", atajo: "?", fn: atajos, claves: "teclas shortcuts ayuda" });
    l.push({ grupo: "Ayuda", texto: "Ajustes y preferencias", icono: "settings", fn: () => NOM.vistaEspacios.preferencias(), claves: "configuracion" });
    if (conCuenta()) l.push({ grupo: "Ayuda", texto: "Cerrar sesión", icono: "log-out", fn: () => NOM.app.cerrarSesion && NOM.app.cerrarSesion(), claves: "salir logout" });
    return l;
  }

  let paleta = null;
  async function abrirPaleta(inicial) {
    if (paleta) { $("input", paleta.el).focus(); return; }
    NOM.cerrarMenu(); NOM.rueda && NOM.rueda.cerrar();
    const anterior = document.activeElement;
    const el = html(`<div class="paleta-velo" role="presentation">
      <div class="paleta" role="dialog" aria-modal="true" aria-label="Buscar o ir a">
        <div class="paleta-buscar">${ico("search")}<input type="text" autocomplete="off" spellcheck="false" placeholder="Busca documentos, espacios o acciones…" aria-label="Buscar" role="combobox" aria-expanded="true" aria-controls="paleta-lista"><button class="paleta-esc" type="button" aria-label="Cerrar"><kbd>Esc</kbd></button></div>
        <div class="paleta-lista" id="paleta-lista" role="listbox"><div class="paleta-cargando">${'<div class="esqueleto" style="height:40px"></div>'.repeat(4)}</div></div>
        <div class="paleta-pie"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>Enter</kbd> abrir</span><span class="solo-escritorio"><kbd>Ctrl</kbd><kbd>K</kbd> en cualquier momento</span></div>
      </div></div>`);
    document.body.append(el);
    const input = $("input", el), lista = $(".paleta-lista", el);
    let todos = [], vistos = [], activo = 0, pila = [];
    const cerrar = () => {
      if (!paleta) return;
      paleta = null;
      document.removeEventListener("keydown", tecla, true);
      el.classList.add("saliendo");
      setTimeout(() => el.remove(), 160);
      if (anterior && anterior.focus && anterior.isConnected) anterior.focus({ preventScroll: true });
    };
    paleta = { el, cerrar };
    function pintar() {
      const q = input.value;
      const base = pila.length ? pila[pila.length - 1] : todos;
      vistos = base.map((it) => ({ it, p: Math.max(puntaje(it.texto, q), it.claves ? puntaje(it.claves, q) * 0.8 : 0, it.sub2 ? puntaje(it.sub2, q) * 0.5 : 0) }))
        .filter((x) => x.p > 0 && (q.trim() || !x.it.oculto || pila.length))
        .sort((a, b) => (q.trim() ? b.p - a.p : 0)).map((x) => x.it).slice(0, 40);
      activo = Math.min(activo, Math.max(0, vistos.length - 1));
      if (!vistos.length) {
        lista.innerHTML = `<div class="paleta-vacio">${ico("search")}<b>Nada con “${esc(q)}”</b><span>Prueba con otra palabra, o crea algo nuevo.</span></div>`;
        return;
      }
      let grupo = null, h = "";
      vistos.forEach((it, i) => {
        if (!q.trim() && it.grupo !== grupo) { grupo = it.grupo; h += `<div class="paleta-grupo">${esc(grupo)}</div>`; }
        h += `<button type="button" class="paleta-item ${i === activo ? "activo" : ""}" role="option" aria-selected="${i === activo}" data-i="${i}" style="--i:${Math.min(i, 12)}">
          <span class="paleta-ico ${it.modo ? "modo-" + esc(it.modo) : ""}" ${it.color ? `style="background:${esc(it.color)};color:#fff"` : ""}>${ico(it.icono || "chevron-right")}</span>
          <span class="crece recorta"><b>${esc(it.texto)}</b>${it.sub2 ? `<small>${esc(it.sub2)}</small>` : ""}</span>
          ${it.marcado ? ico("check", "ico-s") : ""}${it.atajo ? `<kbd>${esc(it.atajo)}</kbd>` : ""}${it.sub ? ico("chevron-right", "ico-s") : ""}</button>`;
      });
      lista.innerHTML = h;
      const a = $(".paleta-item.activo", lista);
      if (a) a.scrollIntoView({ block: "nearest" });
    }
    function marcar(i) {
      activo = (i + vistos.length) % vistos.length;
      $$(".paleta-item", lista).forEach((b) => { const on = +b.dataset.i === activo; b.classList.toggle("activo", on); b.setAttribute("aria-selected", on); });
      const a = $(".paleta-item.activo", lista);
      if (a) a.scrollIntoView({ block: "nearest" });
    }
    function elegir(i) {
      const it = vistos[i];
      if (!it) return;
      if (it.sub) { pila.push(it.sub()); input.value = ""; activo = 0; input.placeholder = it.texto.replace(/…$/, "") + ": elige…"; pintar(); return; }
      cerrar();
      setTimeout(() => it.fn && it.fn(), 0);
    }
    function tecla(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (pila.length) { pila.pop(); input.placeholder = "Busca documentos, espacios o acciones…"; pintar(); } else cerrar(); return; }
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) { e.preventDefault(); marcar(activo + 1); }
      else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) { e.preventDefault(); marcar(activo - 1); }
      else if (e.key === "Enter") { e.preventDefault(); elegir(activo); }
      else if (e.key === "Backspace" && !input.value && pila.length) { pila.pop(); pintar(); }
    }
    document.addEventListener("keydown", tecla, true);
    input.addEventListener("input", () => { activo = 0; pintar(); });
    lista.addEventListener("pointermove", (e) => { const b = e.target.closest(".paleta-item"); if (b && +b.dataset.i !== activo && e.pointerType === "mouse") marcar(+b.dataset.i); });
    lista.addEventListener("click", (e) => { const b = e.target.closest(".paleta-item"); if (b) elegir(+b.dataset.i); });
    el.addEventListener("pointerdown", (e) => { if (e.target === el) cerrar(); });
    $(".paleta-esc", el).onclick = cerrar;
    input.value = inicial || "";
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    // Se muestra al instante con lo que ya se sabe; los documentos de los espacios llegan después.
    todos = elementos(docsCache.lista);
    pintar();
    documentosDeEspacios().then((docs) => { if (paleta && paleta.el === el) { todos = elementos(docs); pintar(); } }).catch(() => {});
  }
  NOM.paleta = abrirPaleta;

  // ================================================================== hoja de atajos
  function atajos() {
    const g = (titulo, filas) => `<div class="atajos-grupo"><h3>${esc(titulo)}</h3>${filas.map(([t, k]) => `<div class="atajo"><span>${esc(t)}</span><span>${k.split(" ").map((x) => `<kbd>${esc(x)}</kbd>`).join("")}</span></div>`).join("")}</div>`;
    NOM.hoja({ titulo: "Atajos de teclado", icono: "keyboard", ancha: true, cuerpo: `<div class="atajos">
      ${g("En toda la app", [["Buscar o ir a…", "Ctrl K"], ["Buscar dentro del texto", "Alt /"], ["Estos atajos", "?"], ["Cerrar ventanas y menús", "Esc"]])}
      ${g("Documentos", [["Guardar versión", "Ctrl S"], ["Deshacer", "Ctrl Z"], ["Rehacer", "Ctrl Y"], ["Modo enfoque", "Ctrl ."], ["Buscar y reemplazar", "Ctrl F"]])}
      ${g("Formato", [["Negrita", "Ctrl B"], ["Cursiva", "Ctrl I"], ["Subrayado", "Ctrl U"], ["Enlace (texto)", "Ctrl K"], ["Título 1, 2, 3", "Ctrl Alt 1"]])}
      ${g("Ruedita", [["Aparece sola al seleccionar", "pausa"], ["Abrirla donde está el cursor", "Menú"], ["Elegir directo", "1-8"], ["Recorrer", "← →"], ["Regresar de un submenú", "Retroceso"]])}
      ${g("Presentaciones y diagramas", [["Duplicar", "Ctrl D"], ["Agrupar", "Ctrl G"], ["Elegir todo", "Ctrl A"], ["Eliminar", "Supr"], ["Mover fino", "Flechas"], ["Elegir varias", "Mayús clic"]])}
      ${g("Hoja de cálculo", [["Editar celda", "F2"], ["Elegir un rango", "Mayús Flechas"], ["Siguiente celda", "Tab"], ["Bajar", "Enter"], ["Borrar", "Supr"]])}
    </div>` });
  }
  NOM.atajos = atajos;

  // ================================================================== teclado global
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const t = e.target, mod = e.ctrlKey || e.metaKey;
    const enCampo = t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName));
    // En el texto, Ctrl+K es "enlace" (como en Word): ahí la paleta se abre con Alt+/.
    if ((mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k" && !enCampo) || (e.altKey && !mod && e.key === "/")) {
      e.preventDefault(); abrirPaleta(); return;
    }
    if (e.key === "?" && !mod && !enCampo && !editorVisible() && !NOM.hayHoja()) { e.preventDefault(); atajos(); }
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-a=paleta]");
    if (b) { e.preventDefault(); abrirPaleta(); }
  });

  // ================================================================== luz que sigue al cursor
  // Una mancha suave de luz bajo el cursor en tarjetas y opciones (solo con mouse).
  let rafLuz = 0;
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const el = e.target.closest && e.target.closest(".tarjeta, .valor, .modo-opcion, .plantilla, .lista-item, .pasos-item");
    if (!el) return;
    cancelAnimationFrame(rafLuz);
    rafLuz = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--lx", (e.clientX - r.left).toFixed(0) + "px");
      el.style.setProperty("--ly", (e.clientY - r.top).toFixed(0) + "px");
    });
  }, { passive: true });

  // ================================================================== bienvenida al entrar
  /** Un instante de bienvenida mientras se arma el inicio (no detiene nada: la app carga detrás). */
  NOM.bienvenida = (u, nuevo) => {
    if (!u) return;
    const nombre = esc(u.nombre || "");
    const h = new Date().getHours();
    const momento = h < 12 ? "Que tengas un gran día." : h < 19 ? "Que rinda la tarde." : "Gracias por seguir aquí esta noche.";
    const el = html(`<div class="bienvenida-momento" role="status" aria-live="polite">
      <div class="bm-tarjeta">
        <span class="avatar g bm-avatar" style="--c:${esc(u.color || "#5B5BD6")}">${esc(NOM.iniciales(u.nombre))}</span>
        <h2>${nuevo ? `¡Bienvenido a <span style="white-space:nowrap">NOM-COLAB</span>, ${nombre}!` : `¡Qué gusto verte, ${nombre}!`}</h2>
        <p>${nuevo ? "Tu cuenta está lista. Te mostramos por dónde empezar." : esc(momento)}</p>
      </div></div>`);
    document.body.append(el);
    const dura = reducido() ? 700 : nuevo ? 1700 : 1250;
    setTimeout(() => { el.classList.add("saliendo"); setTimeout(() => el.remove(), 520); }, dura);
    el.addEventListener("pointerdown", () => { el.classList.add("saliendo"); setTimeout(() => el.remove(), 520); });
  };

  // ================================================================== primeros pasos
  /** Tarjeta de primeros pasos en el inicio de una cuenta; desaparece al completarla u ocultarla. */
  NOM.primerosPasos = (cont, espacios) => {
    if (!cont || !conCuenta()) return;
    const ya = NOM.leer(clave("pasos.oculto"), false);
    if (ya) return;
    const h = hitos();
    const recientes = NOM.leer(api().clave("recientes"), []);
    const propio = espacios.find((e) => e.permiso === "PROPIETARIO") || espacios[0];
    const pasos = [
      { id: "espacio", t: "Crea tu primer espacio", d: "Reúne los documentos de un equipo o proyecto.", ok: espacios.length > 0, fn: () => NOM.vistaEspacios.nuevoEspacio(), icono: "layout-grid" },
      { id: "documento", t: "Escribe tu primer documento", d: "Texto, hoja, presentación o diagrama.", ok: espacios.some((e) => e.documentos > 0) || recientes.length > 0, fn: () => (propio ? NOM.vistaEspacios.nuevoDocumento(propio) : NOM.vistaEspacios.nuevoEspacio()), icono: "file-plus" },
      { id: "rueda", t: "Prueba la ruedita", d: "Selecciona algo y espera medio segundo.", ok: !!h.rueda, fn: () => (recientes[0] ? (location.hash = "#/doc/" + recientes[0].id) : propio ? NOM.vistaEspacios.nuevoDocumento(propio) : NOM.vistaEspacios.nuevoEspacio()), icono: "circle-dot" },
      { id: "equipo", t: "Invita a tu equipo", d: "Comparte el espacio en tu red o con su usuario.", ok: espacios.some((e) => e.miembros > 1 || e.conexion), fn: () => (propio ? NOM.vistaEspacios.accesos(propio) : NOM.vistaEspacios.unirse()), icono: "users" },
      { id: "ajustes", t: "Hazla tuya", d: "Tema, guardado automático y movimiento.", ok: !!h.preferencias, fn: () => NOM.vistaEspacios.preferencias(), icono: "palette" },
    ];
    const hechos = pasos.filter((p) => p.ok).length;
    if (hechos === pasos.length) {
      if (NOM.leer(clave("pasos.celebrado"), false)) return;
      NOM.guardar(clave("pasos.celebrado"), true);
    }
    const C = 2 * Math.PI * 18;
    const el = html(`<section class="pasos clay" aria-label="Primeros pasos">
      <div class="pasos-cab">
        <svg class="pasos-anillo" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" class="fondo"/><circle cx="22" cy="22" r="18" class="avance" style="stroke-dasharray:${C.toFixed(1)};--fin:${(C * (1 - hechos / pasos.length)).toFixed(1)}"/></svg>
        <div class="crece"><h2>${hechos === pasos.length ? "¡Todo listo! Ya dominas NOM-COLAB" : "Primeros pasos"}</h2>
          <p class="suave">${hechos === pasos.length ? "Gracias por darle una oportunidad. Esta tarjeta ya no volverá a salir." : `${hechos} de ${pasos.length} · unos minutos y tu equipo estará trabajando aquí.`}</p></div>
        <button class="icono-btn" data-ocultar aria-label="Ocultar primeros pasos" data-micro="Ocultar|Puedes seguir sin ella; no volverá a salir.">${ico("x")}</button>
      </div>
      ${hechos === pasos.length ? "" : `<div class="pasos-lista">${pasos.map((p, i) => `<button type="button" class="pasos-item ${p.ok ? "hecho" : ""}" data-p="${i}" style="--i:${i}">
        <span class="pasos-check">${ico(p.ok ? "check" : p.icono)}</span><span class="crece"><b>${esc(p.t)}</b><small>${esc(p.d)}</small></span>${p.ok ? "" : ico("chevron-right", "ico-s")}</button>`).join("")}</div>`}
    </section>`);
    cont.after(el);
    $("[data-ocultar]", el).onclick = () => { NOM.guardar(clave("pasos.oculto"), true); el.classList.add("saliendo"); setTimeout(() => el.remove(), 260); };
    $$("[data-p]", el).forEach((b) => (b.onclick = () => pasos[+b.dataset.p].fn()));
  };

  // ================================================================== consejo de la ruedita en el editor
  const CONSEJOS = {
    TEXTO: "Selecciona texto y espera medio segundo: sale la ruedita con negrita, color, estilos y más.",
    HOJA: "Elige celdas y espera medio segundo: sale la ruedita con formato, fórmulas y más.",
    PRESENTACION: "Toca una figura y sale su ruedita. Para elegir varias, mantén una y toca las demás.",
    DIAGRAMA: "Toca una figura y sale su ruedita. Para elegir varias, mantén una y toca las demás.",
  };
  NOM.alAbrirEditor = (ed, tipo) => {
    if (!ed || ed.soloLectura || !CONSEJOS[tipo]) return;
    const k = "consejo." + tipo;
    if (hitos()[k] || hitos().rueda) return;
    setTimeout(() => {
      if (!ed.vista || !ed.vista.isConnected) return;
      const el = html(`<div class="consejo" role="status">${ico("circle-dot")}<span>${esc(CONSEJOS[tipo])}</span><button class="btn chico" type="button">Entendido</button></div>`);
      ed.vista.append(el);
      const quitar = () => { if (!el.isConnected) return; NOM.hito(k); el.classList.add("saliendo"); setTimeout(() => el.remove(), 260); document.removeEventListener("nom:hito", alHito); };
      const alHito = (e) => { if (e.detail === "rueda") quitar(); };
      document.addEventListener("nom:hito", alHito);
      $("button", el).onclick = quitar;
      setTimeout(quitar, 16000);
    }, 1400);
  };
})();
