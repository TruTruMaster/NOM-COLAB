/* NOM-COLAB · Ayuda: el tema de la app (claro u oscuro) y el buscador, sin bibliotecas.
   Sin JavaScript la ayuda se navega igual (el buscador lleva a la lista de todas las páginas). */
(function () {
  "use strict";
  // El tema que eligió la persona en la app (mismo origen: misma memoria del navegador).
  try {
    const p = JSON.parse(localStorage.getItem("nom.pref") || "{}");
    const oscuro = p.tema === "oscuro" || (p.tema !== "claro" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-tema", oscuro ? "oscuro" : "claro");
  } catch (e) { /* sin almacenamiento: el del sistema */ }

  const yo = document.currentScript && document.currentScript.src;
  const base = yo ? yo.replace(/ayuda\/ayuda\.js(\?.*)?$/, "") : "";
  const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let indice = null;

  function cargar() {
    if (indice) return Promise.resolve(indice);
    // file:// (dentro de la app) no deja usar fetch con archivos: XMLHttpRequest sí.
    return new Promise((ok) => {
      const x = new XMLHttpRequest();
      x.open("GET", base + "ayuda/indice.json");
      x.onload = () => { try { indice = JSON.parse(x.responseText); } catch (e) { indice = []; } ok(indice); };
      x.onerror = () => { indice = []; ok(indice); };
      x.send();
    });
  }

  /** Puntos de una página para lo que se busca: el título pesa más que el texto. */
  function buscar(q) {
    const palabras = sinAcentos(q).split(/\s+/).filter((p) => p.length > 1);
    if (!palabras.length) return [];
    return indice.map((a) => {
      const t = sinAcentos(a.t), d = sinAcentos(a.d), h = sinAcentos((a.h || []).join(" ")), x = a.x || "";
      let pts = 0;
      for (const p of palabras) {
        const n = (t.includes(p) ? 10 : 0) + (h.includes(p) ? 5 : 0) + (d.includes(p) ? 4 : 0) + (x.includes(p) ? 1 : 0);
        if (!n) return null;
        pts += n;
      }
      return { a, pts };
    }).filter(Boolean).sort((a, b) => b.pts - a.pts).map((r) => r.a);
  }

  function pintar(cont, lista, q) {
    cont.hidden = false;
    cont.innerHTML = lista.length
      ? lista.slice(0, 8).map((a, i) => `<a href="${esc(base + a.u)}" ${i === 0 ? 'aria-selected="true"' : ""}><b>${esc(a.t)}</b><span>${esc(a.s)}${a.d ? " · " + esc(a.d) : ""}</span></a>`).join("")
      : `<p>No encontramos «${esc(q)}». Prueba con otras palabras, o revisa las <a href="${esc(base)}ayuda/preguntas-frecuentes/index.html">preguntas frecuentes</a>.</p>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const entrada = document.querySelector("[data-buscar]"), cont = document.querySelector("[data-resultados]");
    if (entrada && cont) {
      entrada.addEventListener("input", async () => {
        const q = entrada.value.trim();
        if (q.length < 2) { cont.hidden = true; return; }
        await cargar();
        pintar(cont, buscar(q), q);
      });
      entrada.addEventListener("keydown", (e) => {
        const ls = [...cont.querySelectorAll("a")];
        const i = ls.findIndex((a) => a.getAttribute("aria-selected") === "true");
        if (e.key === "Escape") { cont.hidden = true; return; }
        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && ls.length) {
          e.preventDefault();
          const j = (i + (e.key === "ArrowDown" ? 1 : -1) + ls.length) % ls.length;
          ls.forEach((a, k) => a.setAttribute("aria-selected", k === j));
          return;
        }
        if (e.key === "Enter" && ls.length && !cont.hidden) { e.preventDefault(); location.href = ls[Math.max(0, i)].href; }
      });
      document.addEventListener("click", (e) => { if (!e.target.closest(".buscar")) cont.hidden = true; });
    }
    // Página «Buscar»: los resultados de ?q=
    const pag = document.querySelector("[data-pagina-buscar]");
    const q = new URLSearchParams(location.search).get("q");
    if (pag && q) {
      if (entrada) entrada.value = q;
      cargar().then(() => {
        const l = buscar(q);
        pag.innerHTML = `<p class="entrada">${l.length ? l.length + (l.length === 1 ? " página" : " páginas") + " para «" + esc(q) + "»:" : "No encontramos «" + esc(q) + "»."}</p>`
          + `<ul class="lista-articulos">${l.map((a) => `<li><a href="${esc(base + a.u)}"><b>${esc(a.t)}</b><span>${esc(a.s)}${a.d ? " · " + esc(a.d) : ""}</span></a></li>`).join("")}</ul>`;
      });
    }
    // Dentro de la app: «Abrir NOM-COLAB» regresa a donde estaba (la página anterior).
    const volver = document.querySelector("[data-volver-app]");
    if (volver && window.NomAndroid && history.length > 1) volver.addEventListener("click", (e) => { e.preventDefault(); history.back(); });
  });
})();
