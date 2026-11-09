/* NOM-COLAB · Ver un solo documento con su enlace (8.5): sin cuenta y en solo lectura.
   El propietario del espacio crea el enlace y lo puede quitar cuando quiera. Lo que se ve sale
   del servidor ya sin comentarios, sin notas del orador y sin las partes asignadas. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, $, $$ } = NOM;

  async function abrir(raiz, token) {
    raiz.innerHTML = `<div class="ver-publico">
      <header class="ver-cab"><svg class="logo" aria-hidden="true"><use href="#logo"/></svg>
        <div class="crece ver-titulo"><b data-nombre>Abriendo…</b><small class="suave" data-sub></small></div>
        <button class="btn chico" type="button" data-imprimir hidden>${ico("download", "ico-s")} <span>Imprimir o guardar PDF</span></button></header>
      <main class="ver-cuerpo" data-cuerpo><div class="esqueleto" style="height:60vh;border-radius:18px"></div></main>
      <footer class="ver-pie suave">Hecho con NOM-COLAB · Solo lectura</footer></div>`;
    const cuerpo = $("[data-cuerpo]", raiz);
    let r;
    try { r = await NOM.api.get("/api/ver/" + encodeURIComponent(token), undefined, { sin401: true, ms: 15000 }); }
    catch (e) {
      $("[data-nombre]", raiz).textContent = "Enlace para ver";
      cuerpo.innerHTML = `<div class="vacio"><div class="burbuja">${ico(e.red ? "wifi-off" : "link-2-off")}</div><h3>${esc(e.red ? "No se pudo abrir el enlace" : e.message)}</h3>
        <p>${e.red ? "Revisa tu conexión y vuelve a intentarlo." : "Pídele a quien te lo compartió un enlace nuevo."}</p></div>`;
      return () => {};
    }
    const d = r.documento || {};
    document.title = (d.nombre || "Documento") + " · NOM-COLAB";
    $("[data-nombre]", raiz).textContent = d.nombre || "Documento";
    const M = (NOM.MODOS || {})[d.modo] || {};
    $("[data-sub]", raiz).textContent = [M.nombre, r.espacio ? "de " + r.espacio : "", "solo lectura"].filter(Boolean).join(" · ");
    const doc = new NOM.DocCRDT("ver-" + String(token).slice(0, 10), r.estado, { soloLectura: true, soloMemoria: true });
    const modo = d.modo || doc.valor("_doc", "modo") || "TEXTO";
    const imprimir = $("[data-imprimir]", raiz);
    const limpiar = [];

    if (modo === "TEXTO" || modo === "HOJA") {
      // En un marco aislado y sin scripts: se ve igual que el documento exportado a HTML.
      const f = document.createElement("iframe");
      f.className = "ver-marco";
      f.title = d.nombre || "Documento";
      f.setAttribute("sandbox", "allow-same-origin allow-modals");
      f.srcdoc = NOM.formatos.aHtml(doc, d.nombre || "Documento");
      cuerpo.innerHTML = "";
      cuerpo.append(f);
      const ajustar = () => { try { f.style.height = Math.max(400, f.contentDocument.documentElement.scrollHeight + 24) + "px"; } catch (e) { /* sin acceso: alto fijo */ } };
      f.onload = () => { ajustar(); setTimeout(ajustar, 400); };
      imprimir.hidden = false;
      imprimir.onclick = () => { try { f.contentWindow.print(); } catch (e) { window.print(); } };
    } else if (modo === "PRESENTACION" && NOM.lienzoVista) {
      const T = NOM.lienzoVista.tam(doc);
      cuerpo.innerHTML = `<div class="ver-diapos">${doc.paginas().map((p, i) => `<figure class="ver-diapo">
        <div class="ver-diapo-caja" style="aspect-ratio:${T.w} / ${T.h}"><div class="diapo-mini ver-escala" style="${NOM.diapo ? NOM.diapo.estiloDiapo(doc, p) : `width:${T.w}px;height:${T.h}px`}">${NOM.lienzoVista.htmlDiapositiva(doc, p)}</div></div>
        <figcaption>${i + 1} / ${doc.paginas().length}</figcaption></figure>`).join("")}</div>`;
      const escalar = () => $$(".ver-diapo-caja", cuerpo).forEach((c) => { c.firstElementChild.style.transform = `scale(${c.clientWidth / T.w})`; });
      escalar();
      addEventListener("resize", escalar);
      limpiar.push(() => removeEventListener("resize", escalar));
      imprimir.hidden = false;
      imprimir.onclick = () => window.print();
    } else {
      // Diagrama: cada página como imagen (un SVG dentro de <img> no ejecuta nada).
      const pags = doc.paginas();
      const imgs = pags.map((p) => { try { return NOM.formatos.aSvg(doc, p); } catch (e) { return null; } }).filter(Boolean);
      cuerpo.innerHTML = imgs.length
        ? `<div class="ver-diagramas">${imgs.map((s, i) => `<figure><img alt="${esc((d.nombre || "Diagrama") + (imgs.length > 1 ? " · página " + (i + 1) : ""))}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}"></figure>`).join("")}</div>`
        : `<div class="vacio"><div class="burbuja">${ico("workflow")}</div><h3>Este diagrama está vacío</h3></div>`;
      imprimir.hidden = !imgs.length;
      imprimir.onclick = () => window.print();
    }
    return () => limpiar.forEach((f) => f());
  }

  NOM.vistaVer = { abrir };
})();
