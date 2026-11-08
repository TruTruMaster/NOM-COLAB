/* NOM-COLAB · Sin internet de verdad (6.1 y 6.2).
   - Cola de cambios: lo que se edita sin conexión ya se guarda cifrado en IndexedDB (la bóveda,
     clave nom.u.<cuenta>.cola.<documento>). Aquí se manda solo al volver la red, aunque ese
     documento ya no esté abierto (antes esperaba a que se volviera a abrir). El CRDT junta los
     cambios repetidos sin problema: cada operación tiene su id.
   - Service worker (sw.js): guarda la página en caché para que quien entró por el navegador la
     siga viendo aunque se caiga la red. Los navegadores solo lo permiten en https o en localhost;
     en http://<ip-local> no hay service worker, pero la página abierta sigue funcionando. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico } = NOM;
  const api = () => NOM.api;
  let enviando = false;

  /** Manda las colas de los documentos que no están abiertos. Devuelve cuántos cambios se enviaron. */
  async function vaciar() {
    if (enviando || !api().token() || !NOM.boveda || !NOM.boveda.activa()) return 0;
    enviando = true;
    let total = 0;
    try {
      const prefijo = api().clave("cola.");
      const ed = NOM.editorActual;
      const abierto = ed && ed.vista && ed.vista.isConnected ? ed.id : null;
      for (const k of NOM.boveda.claves(prefijo)) {
        const id = k.slice(prefijo.length);
        if (id === abierto) continue;
        let ops = NOM.leer(k, []) || [];
        if (!ops.length) continue;
        try {
          // Una petición por pestaña de origen (cliente = nodo), igual que si siguiera abierta.
          const nodos = [...new Set(ops.map((o) => o.n))];
          for (const n of nodos) {
            const suyas = ops.filter((o) => o.n === n);
            for (let i = 0; i < suyas.length; i += 300) {
              const lote = suyas.slice(i, i + 300);
              await api().post(`/api/documentos/${id}/ops`, { cliente: n, ops: lote, dispositivo: api().dispositivo }, { ms: 15000 });
              const enviados = new Set(lote.map((o) => o.id));
              ops = (NOM.leer(k, []) || []).filter((o) => !enviados.has(o.id));
              NOM.guardar(k, ops);
              total += lote.length;
            }
          }
        } catch (e) {
          if (e.red) break;   // otra vez sin red: se intenta al volver
          // Documento borrado o permiso de solo lectura: la cola se queda; se resuelve al abrirlo.
        }
      }
    } finally { enviando = false; }
    if (total) NOM.aviso(`Se enviaron ${total} cambio(s) que estaban guardados en este equipo`, { tipo: "ok" });
    return total;
  }

  function arrancar() {
    setTimeout(() => vaciar().catch(() => {}), 2500);
    api().alCambiarRed((ok) => { if (ok) setTimeout(() => vaciar().catch(() => {}), 800); });
    // 6.1 El service worker solo existe en contextos seguros (https o localhost).
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && window.isSecureContext) {
      addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Sin service worker:", e && e.message)));
    }
  }

  NOM.cola = { vaciar, arrancar };

  // ================================================================== 6.3 resumen al reconectar
  /* El CRDT junta todo en silencio; aquí se cuenta qué pasó: lo que yo cambié sin conexión (mi
     cola) contra lo que cambiaron otros desde que se fue la red (lo que el servidor tiene con un
     reloj mayor y otro nodo). En el texto se compara por párrafo; en hojas y lienzos, por campo,
     y se dice cuál valor se quedó (gana el cambio más reciente). */
  const FIN = "fin";
  function calcular(ed, remoto, R, mios) {
    const doc = ed.doc, mias = new Set(mios.map((o) => o.n)), r = [];
    // --- campos (celdas, figuras, nombre…)
    const vistos = new Set();
    mios.filter((o) => !o.s).forEach((o) => {
      for (const c in o.campos || {}) {
        const k = o.bloque + "|" + c;
        if (vistos.has(k)) continue;
        vistos.add(k);
        const reg = remoto.bloques && remoto.bloques[o.bloque] && remoto.bloques[o.bloque][c];
        if (!reg || reg.t <= R || mias.has(reg.n)) continue;
        const ganoOtro = reg.t > o.t || (reg.t === o.t && String(reg.n) > String(o.n));
        r.push({ tipo: "campo", bloque: o.bloque, campo: c, nodo: reg.n, gano: ganoOtro ? "otro" : "yo", valor: reg.v });
      }
    });
    // --- texto letra por letra: por párrafo
    const porBloque = {};
    mios.filter((o) => o.s).forEach((o) => (porBloque[o.bloque] = porBloque[o.bloque] || []).push(o));
    for (const b in porBloque) {
      const reg = remoto.seq && remoto.seq[b];
      if (!reg) continue;
      const sec = doc.secuencia(b), S = NOM.Secuencia, its = sec.items;
      const idx = new Map(its.map((it, i) => [it.id, i]));
      const marcaDe = (id) => {
        if (id === FIN) return FIN;
        let i = idx.get(id);
        if (i == null) return null;
        for (; i < its.length; i++) if (its[i].v && its[i].c === "\n" && !its[i].e) return its[i].id;
        return FIN;
      };
      const ids = (o) => {
        if (o.k === "i") { const n = o.e ? 1 : S.caracteres(o.x).length; return [S.clave(o.t, o.n)].concat(n > 1 ? [S.clave(o.t + n - 1, o.n)] : []); }
        const l = [];
        (o.r || []).forEach(([n, t1, t2]) => { if (n === FIN) l.push(FIN); else { l.push(S.clave(t1, n)); if (t2 !== t1) l.push(S.clave(t2, n)); } });
        return l;
      };
      const mis = new Set();
      porBloque[b].forEach((o) => ids(Object.assign({ t: o.t, n: o.n }, o.s)).forEach((id) => { const m = marcaDe(id); if (m) mis.add(m); }));
      const otros = new Map();
      const anotar = (m, nodo, campo, n) => { if (!m) return; const x = otros.get(m) || { nodos: new Set(), escritas: 0, borradas: 0, formato: false }; x.nodos.add(nodo); if (campo === "formato") x.formato = true; else x[campo] += n; otros.set(m, x); };
      (reg.ins || []).forEach((e) => { if (e.t <= R || mias.has(e.n)) return; const n = e.e ? 1 : S.caracteres(e.x).length; anotar(marcaDe(S.clave(e.t, e.n)), e.n, "escritas", n); });
      (reg.vis || []).forEach((e) => { if (e.t <= R || mias.has(e.n) || e.v) return; (e.r || []).forEach(([n, t1, t2]) => anotar(marcaDe(n === FIN ? FIN : S.clave(t1, n)), e.n, "borradas", n === FIN ? 0 : t2 - t1 + 1)); });
      (reg.fmt || []).forEach((e) => { if (e.t <= R || mias.has(e.n)) return; (e.r || []).forEach(([n, t1]) => anotar(marcaDe(n === FIN ? FIN : S.clave(t1, n)), e.n, "formato", 0)); });
      const vis = sec.visibles();
      for (const m of mis) {
        const x = otros.get(m);
        if (!x) continue;
        // Número de párrafo y sus primeras palabras.
        let num = 1, ini = 0, fin = vis.length;
        for (let i = 0; i < vis.length; i++) { if (vis[i].c === "\n" && !vis[i].e) { if (vis[i].id === m) { fin = i; break; } num++; ini = i + 1; } }
        const texto = vis.slice(ini, fin).map((it) => (it.e ? "" : it.c)).join("").trim();
        r.push({ tipo: "parrafo", bloque: b, marca: m, numero: num, inicio: texto.slice(0, 48), nodos: [...x.nodos], escritas: x.escritas, borradas: x.borradas, formato: x.formato });
      }
    }
    return r;
  }

  async function mostrar(ed, resumen) {
    // Quién es cada nodo: la bitácora dice qué persona usaba cada pestaña (cliente).
    const nombres = new Map();
    try { (await api().get(`/api/documentos/${ed.id}/actividad`)).forEach((a) => { if (a.cliente && !nombres.has(a.cliente)) nombres.set(a.cliente, a.usuario); }); } catch (e) { /* sin nombres */ }
    (ed.presencia || []).forEach((p) => { if (p.cliente && !nombres.has(p.cliente)) nombres.set(p.cliente, p.nombre); });
    const quien = (n) => nombres.get(n) || "Otra persona";
    const lista = (ns) => { const l = [...new Set(ns.map(quien))]; return l.length > 1 ? l.slice(0, -1).join(", ") + " y " + l[l.length - 1] : l[0]; };
    const F = NOM.formulas;
    const cosa = (x) => {
      if (x.bloque === "_doc") return { nombre: "el nombre del documento", paginas: "el orden de las páginas" }[x.campo] || "el documento";
      if (/^c:/.test(x.campo)) return "la celda " + x.campo.slice(2);
      const b = ed.doc.bloque(x.bloque) || {};
      const t = (b.texto || (b.html && NOM.formatos.textoPlano(b.html)) || "").trim();
      return ({ forma: "la figura", texto: "el cuadro de texto", imagen: "la imagen", tabla: "la tabla", comentario: "un comentario" }[b.tipo] || "un elemento") + (t ? ` «${t.slice(0, 30)}»` : "");
    };
    const filas = resumen.slice(0, 30).map((x) => {
      if (x.tipo === "parrafo") {
        const hizo = [x.escritas ? `escribió ${x.escritas} letra${x.escritas === 1 ? "" : "s"}` : "", x.borradas ? `borró ${x.borradas}` : "", x.formato ? "cambió el formato" : ""].filter(Boolean).join(", ");
        return `<li>${ico("pilcrow", "ico-s")}<span><b>Párrafo ${x.numero}</b>${x.inicio ? ` («${esc(x.inicio)}…»)` : ""}: ${esc(lista(x.nodos))} ${esc(hizo || "lo cambió")} mientras tú lo editabas. Quedaron los cambios de los dos.</span></li>`;
      }
      const valor = typeof x.valor === "string" || typeof x.valor === "number" ? ` («${esc(String(F && /^c:/.test(x.campo) ? x.valor : x.valor).slice(0, 40))}»)` : "";
      return `<li>${ico(/^c:/.test(x.campo) ? "sheet" : "shapes", "ico-s")}<span><b>${esc(cosa(x).replace(/^./, (c) => c.toUpperCase()))}</b>: ${esc(quien(x.nodo))} también la cambió; ${x.gano === "otro" ? `quedó su cambio${valor}` : "quedó el tuyo (fue el más reciente)"}.</span></li>`;
    });
    NOM.hoja({ titulo: "Mientras no tenías conexión", icono: "wifi", cuerpo: `<div class="col"><p class="suave" style="font-weight:650">Tus cambios ya se enviaron. Esto lo cambiaron también otras personas al mismo tiempo:</p><ul class="resumen-reconexion">${filas.join("")}</ul>${resumen.length > 30 ? `<p class="suave chico">…y ${resumen.length - 30} más.</p>` : ""}</div>` });
  }

  NOM.reconexion = { calcular, mostrar };
})();
