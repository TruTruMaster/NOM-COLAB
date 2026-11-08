/* NOM-COLAB · Autoría y trabajo en equipo (3.2, 3.2b y 3.3).
   - Recibo de proceso de escritura: sesiones, letras tecleadas contra pegadas, pegados grandes
     (hora y tamaño, nunca el texto), versiones y la huella SHA-256 que calcula el servidor. Se ve
     como hoja imprimible (PDF desde el navegador; en la app, con la impresión de Android) y se
     descarga en JSON para verificarlo después.
   - Verificar: el JSON vuelve al servidor, que recalcula la huella y revisa que él la emitió.
   - Mapa de aportes: una barra por persona, con su color.
   - Repetición: el documento avanzando versión por versión. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso, hoja, avatar } = NOM;
  const api = () => NOM.api;
  const n = (x) => Number(x || 0).toLocaleString("es-MX");
  const fecha = (ms) => new Date(ms).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const hora = (ms) => new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const TIPOS = { TEXTO: "Texto", HOJA: "Hoja de cálculo", PRESENTACION: "Presentación", DIAGRAMA: "Diagrama" };

  // "1 versión guardada; la guardó esta persona" / "3 versiones guardadas; 2 las guardó esta persona".
  function textoVersiones(v) {
    const total = Number(v.total) || 0, mias = Number(v.guardadasPorLaPersona) || 0;
    if (!total) return "El documento todavía no tiene versiones guardadas.";
    const a = total === 1 ? "El documento tiene 1 versión guardada" : `El documento tiene ${total.toLocaleString("es-MX")} versiones guardadas`;
    let b;
    if (!mias) b = "ninguna la guardó esta persona";
    else if (total === 1) b = "la guardó esta persona";
    else if (mias === total) b = "todas las guardó esta persona";
    else if (mias === 1) b = "1 la guardó esta persona";
    else b = `${mias.toLocaleString("es-MX")} las guardó esta persona`;
    return a + "; " + b + ".";
  }

  function hojaRecibo(r) {
    const t = r.totales || {}, per = r.persona || {}, doc = r.documento || {};
    const ses = r.sesiones || [], peg = r.pegadosGrandes || [];
    return `<article class="recibo-hoja">
      <header class="recibo-cab"><svg class="logo" aria-hidden="true"><use href="#logo"/></svg>
        <div><h1>Recibo de proceso de escritura</h1><p>NOM-COLAB · emitido por <b>${esc(r.servidor || "el servidor")}</b> el ${esc(fecha(r.generado))} a las ${esc(hora(r.generado))}</p></div></header>
      <section class="recibo-quien">
        <div><span>Documento</span><b>${esc(doc.nombre)}</b><small>${esc(TIPOS[doc.tipo] || doc.tipo || "")} · espacio ${esc(doc.espacio || "")}</small></div>
        <div><span>Persona</span><b>${esc(per.nombre)}</b><small>${r.primeraActividad ? `trabajó del ${esc(fecha(r.primeraActividad))} al ${esc(fecha(r.ultimaActividad))}` : "sin actividad registrada"}</small></div>
      </section>
      <section class="recibo-cifras">
        <div><b>${n(t.minutosActivos)}</b><span>minutos activos</span></div>
        <div><b>${n(t.letrasTecleadas)}</b><span>letras tecleadas</span></div>
        <div><b>${n(t.letrasPegadas)}</b><span>letras pegadas</span></div>
        <div><b>${n(t.porcentajeTecleado)}%</b><span>de lo escrito fue tecleado</span></div>
      </section>
      <h2>Sesiones de trabajo (${n(t.sesiones)})</h2>
      ${ses.length ? `<table class="recibo-tabla"><thead><tr><th>Fecha</th><th>Horario</th><th>Minutos</th><th>Dispositivo</th><th>Tecleadas</th><th>Pegadas</th><th>Borradas</th></tr></thead><tbody>
        ${ses.map((s) => `<tr><td>${esc(fecha(s.inicio))}</td><td>${esc(hora(s.inicio))}–${esc(hora(s.fin))}</td><td>${n(s.minutosActivos)}</td><td>${esc(s.dispositivo)}</td><td>${n(s.letrasTecleadas)}</td><td>${n(s.letrasPegadas)}</td><td>${n(s.letrasBorradas)}</td></tr>`).join("")}
        </tbody></table>` : `<p>No hay sesiones registradas para esta persona en este documento.</p>`}
      <h2>Pegados grandes (más de 40 letras)</h2>
      ${peg.length ? `<table class="recibo-tabla"><thead><tr><th>Fecha</th><th>Hora</th><th>Letras</th></tr></thead><tbody>${peg.map((p) => `<tr><td>${esc(fecha(p.t))}</td><td>${esc(hora(p.t))}</td><td>${n(p.letras)}</td></tr>`).join("")}</tbody></table>`
        : `<p>Ninguno.</p>`}
      <h2>Versiones</h2>
      <p>${textoVersiones(r.versiones || {})}</p>
      <h2>Huella digital</h2>
      <p class="recibo-huella">${esc(r.hash)}</p>
      <p class="recibo-nota">La huella es el SHA-256 de todo lo de arriba. Para comprobar el recibo, abre NOM-COLAB → Historial → <b>Verificar un recibo</b> y elige el archivo .json: si alguien cambió una sola cifra, la huella ya no coincide. Lo tecleado y lo pegado lo anota el editor al momento; el texto pegado nunca se guarda.</p>
    </article>`;
  }

  /** La hoja del recibo encima de todo, con imprimir, descargar y cerrar. */
  function ver(r) {
    const capa = html(`<div class="recibo-capa" role="dialog" aria-label="Recibo de proceso de escritura">
      <div class="recibo-barra">
        <button class="btn chico primario" data-imprimir>${ico("download", "ico-s")} Imprimir o guardar PDF</button>
        <button class="btn chico" data-json>${ico("file-down", "ico-s")} Descargar .json</button>
        <span class="crece"></span><button class="icono-btn" data-cerrar aria-label="Cerrar">${ico("x")}</button></div>
      ${hojaRecibo(r)}</div>`);
    document.body.append(capa);
    document.body.classList.add("imprimiendo-recibo");
    const cerrar = () => { capa.remove(); document.body.classList.remove("imprimiendo-recibo"); document.removeEventListener("keydown", tecla, true); };
    const tecla = (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    document.addEventListener("keydown", tecla, true);
    $("[data-cerrar]", capa).onclick = cerrar;
    const nombre = `Recibo - ${(r.documento || {}).nombre || "documento"} - ${(r.persona || {}).nombre || ""}`.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 90);
    $("[data-imprimir]", capa).onclick = () => {
      if (window.NomAndroid && window.NomAndroid.imprimir) window.NomAndroid.imprimir(nombre);
      else setTimeout(() => window.print(), 60);
    };
    $("[data-json]", capa).onclick = () => { NOM.formatos.descargar(nombre + ".json", "application/json", JSON.stringify(r, null, 2)); aviso("Recibo descargado", { tipo: "ok" }); };
    return capa;
  }

  async function mostrar(ed, usuarioId) {
    const fin = NOM.cargando ? NOM.cargando.empezar() : () => {};
    try {
      const r = await api().get(`/api/documentos/${ed.id}/recibo${usuarioId ? "?usuario=" + encodeURIComponent(usuarioId) : ""}`, undefined, { ms: 20000 });
      ver(r);
    } catch (e) { aviso(e.red ? "El recibo lo emite el servidor: necesitas conexión" : e.message, { tipo: "error" }); }
    finally { fin(); }
  }

  /** Recibos que se adjuntaron solos al cerrar una entrega (los ve el propietario). */
  function lista(recibos) {
    const cuerpo = html(`<div class="col"><p class="suave" style="font-weight:650">Se generaron al pasar la fecha límite, uno por cada persona que trabajó en el documento.</p>
      <div class="lista">${(recibos || []).map((x, i) => `<button class="lista-item" data-i="${i}" style="text-align:left;width:100%">${ico("shield-check")}<span class="crece"><b>${esc(x.usuario)}</b><small>${esc(fecha(x.generado))} · ${esc((x.recibo && x.recibo.totales && x.recibo.totales.porcentajeTecleado) != null ? x.recibo.totales.porcentajeTecleado + "% tecleado" : "")}</small></span>${ico("chevron-right")}</button>`).join("") || `<p class="suave">Nadie trabajó en el documento.</p>`}</div></div>`);
    const h = hoja({ titulo: "Recibos de la entrega", icono: "shield-check", cuerpo });
    $$("[data-i]", cuerpo).forEach((b) => (b.onclick = () => { h.cerrar(true); ver(recibos[+b.dataset.i].recibo); }));
  }

  function verificar() {
    const cuerpo = html(`<div class="col">
      <p class="suave" style="font-weight:650">Elige el archivo <b>.json</b> del recibo (o pega su contenido). El servidor recalcula la huella y revisa que él lo emitió.</p>
      <button class="btn" data-archivo>${ico("file-up")} Elegir archivo .json</button>
      <textarea data-texto rows="5" placeholder="…o pega aquí el contenido del recibo" style="width:100%;border-radius:12px;border:1px solid var(--borde);background:var(--sup-2);padding:10px;font:500 12px/1.4 var(--mono);color:var(--tinta)"></textarea>
      <div data-resultado></div></div>`);
    const pie = html(`<div style="display:contents"><button class="btn" data-no>Cerrar</button><button class="btn primario" data-si>${ico("circle-check")} Verificar</button></div>`);
    const h = hoja({ titulo: "Verificar un recibo", icono: "circle-check", cuerpo, pie });
    const res = $("[data-resultado]", cuerpo), txt = $("[data-texto]", cuerpo);
    $("[data-no]", pie).onclick = () => h.cerrar();
    $("[data-archivo]", cuerpo).onclick = async () => {
      const f = await NOM.formatos.elegirArchivo(".json,application/json");
      if (f) { txt.value = await f.text(); comprobar(); }
    };
    async function comprobar() {
      let r;
      try { r = JSON.parse(txt.value); } catch (e) { res.innerHTML = `<div class="alerta error">${ico("triangle-alert")}<span>Eso no es un archivo JSON válido.</span></div>`; return; }
      try {
        const v = await api().post("/api/recibos/verificar", r, { sin401: true });
        res.innerHTML = v.valido
          ? `<div class="alerta ok">${ico("circle-check")}<span><b>Auténtico.</b> Lo emitió ${esc(v.servidor || "este servidor")} el ${esc(fecha(v.emitido))} a las ${esc(hora(v.emitido))} para <b>${esc(v.persona)}</b> en “${esc(v.documento)}”, y nadie lo ha cambiado.</span></div>`
          : `<div class="alerta error">${ico("triangle-alert")}<span><b>No es válido.</b> ${esc(v.motivo)}</span></div>`;
      } catch (e) { res.innerHTML = `<div class="alerta error">${ico("triangle-alert")}<span>${esc(e.message)}</span></div>`; }
    }
    $("[data-si]", pie).onclick = comprobar;
  }

  // ------------------------------------------------------------ 3.3 mapa de aportes
  async function aportes(cont, ed) {
    cont.innerHTML = `<div class="esqueleto" style="height:56px"></div><div class="esqueleto" style="height:56px"></div>`;
    let d;
    try { d = await api().get(`/api/documentos/${ed.id}/aportes`); } catch (e) { cont.innerHTML = `<div class="alerta error">${ico("triangle-alert")}<span>${esc(e.message)}</span></div>`; return; }
    const ps = d.personas || [];
    if (!ps.length) { cont.innerHTML = `<p class="suave">Aún no hay aportes registrados.</p>`; return; }
    const texto = d.letrasEnDocumento > 0;
    const peso = (p) => (texto ? p.enDocumento : p.operaciones) || 0;
    const total = ps.reduce((a, p) => a + peso(p), 0) + (texto ? d.sinAutor || 0 : 0) || 1;
    const yo = (api().usuario() || {}).id;
    cont.innerHTML = `<div class="aportes">
      <p class="suave chico" style="font-weight:700">${texto ? `Del texto que hay hoy (${n(d.letrasEnDocumento)} letras), cuánto escribió cada quien.` : "Cuántos cambios hizo cada quien."}</p>
      <div class="aportes-barra" role="img" aria-label="Aportes por persona">${ps.map((p) => `<i style="width:${(peso(p) / total) * 100}%;background:${esc(p.color || "#6B6875")}" title="${esc(p.usuario)}"></i>`).join("")}${texto && d.sinAutor ? `<i class="otros" style="width:${(d.sinAutor / total) * 100}%" title="Plantilla o importado"></i>` : ""}</div>
      <div class="col" style="gap:6px">${ps.map((p) => `<div class="version" style="cursor:default">${avatar({ nombre: p.usuario, color: p.color })}
        <span class="crece"><b>${esc(p.usuario)} <span class="suave" style="font-weight:800">${Math.round((peso(p) / total) * 100)}%</span></b>
        <small>${texto ? `${n(p.enDocumento)} letras en el documento · escribió ${n(p.escritas)}${p.pegadas ? ` (${n(p.pegadas)} pegadas)` : ""} · borró ${n(p.borradas)}` : `${n(p.operaciones)} cambios${p.pegadas ? ` · ${n(p.pegadas)} letras pegadas` : ""}`} · ${n(p.minutos)} min</small></span>
        ${p.usuarioId === yo || ed.esPropietario ? `<button class="icono-btn chico" data-recibo="${esc(p.usuarioId)}" aria-label="Recibo de ${esc(p.usuario)}" data-micro="Recibo|${p.usuarioId === yo ? "Tu recibo de proceso de escritura" : "El recibo de esta persona (solo el propietario lo ve)"}">${ico("shield-check", "ico-s")}</button>` : ""}</div>`).join("")}
        ${texto && d.sinAutor ? `<div class="version" style="cursor:default"><span class="avatar" style="--c:#B7B4C2">·</span><span class="crece"><b>Plantilla o importado <span class="suave">${Math.round((d.sinAutor / total) * 100)}%</span></b><small>${n(d.sinAutor)} letras que no tecleó nadie del espacio</small></span></div>` : ""}</div></div>`;
    $$("[data-recibo]", cont).forEach((b) => (b.onclick = () => mostrar(ed, b.dataset.recibo === yo ? null : b.dataset.recibo)));
  }

  // ------------------------------------------------------------ 3.2b repetición por versiones
  /** Texto visible de la foto de una versión: [{ id, c }] (o null si no es de texto). */
  function letrasDe(foto) {
    const reg = foto && foto["_seq:cuerpo"];
    if (!reg) return null;
    return new NOM.Secuencia(reg).visibles().map((it) => ({ id: it.id, c: it.e ? "▪" : it.c }));
  }
  async function repeticion(ed) {
    let vs;
    try { vs = (await api().get(`/api/documentos/${ed.id}/versiones`)).slice().reverse(); } catch (e) { return aviso(e.message, { tipo: "error" }); }
    if (!vs.length) return aviso("Aún no hay versiones", { tipo: "info" });
    const capa = html(`<div class="repeticion" role="dialog" aria-label="Repetición">
      <div class="repeticion-barra"><button class="icono-btn" data-play aria-label="Reproducir">${ico("play")}</button>
        <input type="range" min="0" max="${vs.length - 1}" value="0" data-v aria-label="Versión"><span class="chip" data-etq></span>
        <button class="icono-btn" data-cerrar aria-label="Cerrar">${ico("x")}</button></div>
      <div class="repeticion-hoja" data-hoja></div></div>`);
    document.body.append(capa);
    const fotos = new Map(), hojaEl = $("[data-hoja]", capa), rango = $("[data-v]", capa), etq = $("[data-etq]", capa);
    let t = null, actual = -1;
    const foto = async (i) => { if (!fotos.has(i)) fotos.set(i, await api().get(`/api/documentos/${ed.id}/versiones/${vs[i].numero}`)); return fotos.get(i); };
    async function ir(i) {
      actual = i;
      rango.value = i;
      const v = vs[i];
      etq.textContent = `v${v.numero} · ${v.autorNombre || ""} · ${fecha(v.fecha)} ${hora(v.fecha)}`;
      let f;
      try { f = await foto(i); } catch (e) { hojaEl.innerHTML = `<div class="alerta error">${ico("triangle-alert")}<span>${esc(e.message)}</span></div>`; return; }
      if (actual !== i) return;
      const ls = letrasDe(f);
      if (!ls) { hojaEl.innerHTML = `<div class="vacio"><h3>${esc(v.etiqueta || "Versión")}</h3><p>${n(v.bloques)} bloques en esta versión.</p></div>`; return; }
      let antes = new Set();
      if (i > 0) { try { antes = new Set((letrasDe(await foto(i - 1)) || []).map((x) => x.id)); } catch (e) { /* sin anterior */ } }
      let h = "", nuevo = false, tramo = "";
      const cerrarTramo = () => { if (tramo) h += nuevo ? `<mark>${esc(tramo)}</mark>` : esc(tramo); tramo = ""; };
      ls.forEach((x) => { const es = i > 0 && !antes.has(x.id); if (es !== nuevo) { cerrarTramo(); nuevo = es; } tramo += x.c; });
      cerrarTramo();
      hojaEl.innerHTML = `<div class="repeticion-texto">${h.replace(/\n/g, "<br>") || '<span class="suave">(vacío)</span>'}</div>`;
    }
    const parar = () => { clearInterval(t); t = null; $("[data-play]", capa).innerHTML = ico("play"); };
    $("[data-play]", capa).onclick = () => {
      if (t) return parar();
      if (actual >= vs.length - 1) ir(0);
      $("[data-play]", capa).innerHTML = ico("minus");
      t = setInterval(() => { if (actual >= vs.length - 1) return parar(); ir(actual + 1); }, 1400);
    };
    rango.oninput = () => { parar(); ir(+rango.value); };
    const cerrar = () => { parar(); capa.remove(); document.removeEventListener("keydown", tecla, true); };
    const tecla = (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    document.addEventListener("keydown", tecla, true);
    $("[data-cerrar]", capa).onclick = cerrar;
    ir(0);
  }

  NOM.recibo = { mostrar, ver, lista, verificar, aportes, repeticion };
})();
