/* NOM-COLAB · Modo Hoja. Cada celda es un campo del bloque tabla ("c:A1"), así dos
   personas pueden escribir en celdas distintas a la vez y el CRDT no pierde ninguna. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $, $$, aviso } = NOM;
  const F = () => NOM.formulas;

  NOM.modos.HOJA = {
    montar(ed) {
      const doc = () => ed.doc;
      const raiz = html(`<div class="hoja-calc">
        <div class="barra-formula">
          <span class="celda-ref" data-ref>A1</span><span class="fx">fx</span>
          <input data-fx aria-label="Contenido de la celda" spellcheck="false" autocomplete="off" ${ed.soloLectura ? "readonly" : ""}>
        </div>
        <div class="rejilla-hoja" data-rejilla tabindex="0" aria-label="Hoja de cálculo"></div>
        <div class="bandeja-libres" data-bandeja></div>
      </div>`);
      ed.lienzo.append(raiz);
      ed.lienzo.style.overflow = "hidden";
      const rej = $("[data-rejilla]", raiz), fx = $("[data-fx]", raiz), refEl = $("[data-ref]", raiz);
      let sel = { c: 0, f: 0 }, ancla = null, editor = null, arrastrando = false;
      let porPuntero = false, extender = false, esperaRango = null;
      const dedos = new Set();

      function tabla() {
        const t = doc().deLaPagina(ed.pagina).find((b) => b.tipo === "tabla");
        if (t) return t;
        if (ed.soloLectura) return null;
        const id = "hoja-" + ed.pagina;   // id fijo: si dos personas abren a la vez, crean la misma
        doc().cambiar(id, { tipo: "tabla", pagina: ed.pagina, orden: 0, filas: 30, cols: 10, x: 40, y: 40, w: 880, h: 300 }, { deshacible: false });
        return doc().bloque(id);
      }
      let t = tabla();
      const crudo = (c, f) => (t ? t["c:" + F().ref(c, f)] : "") || "";
      const rango = () => {
        if (!ancla) return { c1: sel.c, c2: sel.c, f1: sel.f, f2: sel.f };
        return { c1: Math.min(ancla.c, sel.c), c2: Math.max(ancla.c, sel.c), f1: Math.min(ancla.f, sel.f), f2: Math.max(ancla.f, sel.f) };
      };

      function render() {
        t = tabla();
        if (!t) {
          rej.innerHTML = `<div class="vacio" style="margin:32px">${ico("sheet")}<h3>Esta página no tiene hoja</h3><p>Tu permiso es de solo lectura.</p></div>`;
          return;
        }
        const ev = F().evaluador(crudo);
        const filas = t.filas || 30, cols = t.cols || 10;
        const r = rango();
        let h = `<table><thead><tr><th></th>${Array.from({ length: cols }, (_, c) => `<th class="${c >= r.c1 && c <= r.c2 ? "activa" : ""}">${F().colLetra(c)}</th>`).join("")}</tr></thead><tbody>`;
        for (let f = 0; f < filas; f++) {
          h += `<tr><th class="${f >= r.f1 && f <= r.f2 ? "activa" : ""}">${f + 1}</th>`;
          for (let c = 0; c < cols; c++) {
            const ref = F().ref(c, f);
            const v = ev.valor(c, f);
            const txt = F().formatear(v);
            const clases = [typeof v === "number" ? "num" : "", v instanceof F().ErrorF ? "err" : "",
              c === sel.c && f === sel.f ? "sel" : (c >= r.c1 && c <= r.c2 && f >= r.f1 && f <= r.f2 ? "rango" : "")].join(" ");
            h += `<td data-c="${c}" data-f="${f}" data-id="${esc(t.id)}!${ref}" class="${clases}" ${t["n:" + ref] ? "data-negrita" : ""} ${t["i:" + ref] ? "data-cursiva" : ""} ${t["u:" + ref] ? "data-subrayado" : ""} ${t["k:" + ref] ? `style="color:${esc(t["k:" + ref])}"` : ""} title="${esc(String(crudo(c, f)).startsWith("=") ? crudo(c, f) : "")}">${esc(txt)}</td>`;
          }
          h += "</tr>";
        }
        rej.innerHTML = h + "</tbody></table>";
        pintarSeleccion();
        pintarBandeja();
        ed.pintarPresencia();
      }

      function pintarSeleccion() {
        refEl.textContent = ancla && (ancla.c !== sel.c || ancla.f !== sel.f) ? `${F().ref(rango().c1, rango().f1)}:${F().ref(rango().c2, rango().f2)}` : F().ref(sel.c, sel.f);
        if (document.activeElement !== fx) fx.value = crudo(sel.c, sel.f);
        const r = rango();
        $$("td.sel, td.rango", rej).forEach((x) => x.classList.remove("sel", "rango"));
        $$("th.activa", rej).forEach((x) => x.classList.remove("activa"));
        for (let f = r.f1; f <= r.f2; f++) for (let c = r.c1; c <= r.c2; c++) {
          const td = celda(c, f); if (td) td.classList.add(c === sel.c && f === sel.f ? "sel" : "rango");
        }
        const ths = $$("thead th", rej);
        for (let c = r.c1; c <= r.c2; c++) ths[c + 1] && ths[c + 1].classList.add("activa");
        const filasTh = $$("tbody th", rej);
        for (let f = r.f1; f <= r.f2; f++) filasTh[f] && filasTh[f].classList.add("activa");
        const td = celda(sel.c, sel.f);
        if (td) td.scrollIntoView({ block: "nearest", inline: "nearest" });
        if (t) ed.seleccionar(t.id + "!" + F().ref(sel.c, sel.f));
      }
      const celda = (c, f) => rej.querySelector(`td[data-c="${c}"][data-f="${f}"]`);

      function pintarBandeja() {
        const libres = doc().deLaPagina(ed.pagina).filter((b) => b.tipo !== "tabla" && b.tipo !== "conector");
        const pags = doc().paginas();
        const b = $("[data-bandeja]", raiz);
        b.innerHTML = `${pags.length > 1 ? pags.map((p, i) => `<button class="btn chico ${p === ed.pagina ? "primario" : "plano"}" data-pag="${esc(p)}">Hoja ${i + 1}</button>`).join("") : ""}
          ${ed.soloLectura ? "" : `<button class="icono-btn" data-nueva data-micro="Nueva hoja|Agrega otra página con su propia tabla.">${ico("plus")}</button>`}
          <span class="crece"></span>
          ${libres.length ? `<span class="chip" data-micro="Bloques libres|Texto, figuras o imágenes de otros modos. Se conservan aunque aquí no se editen.">${ico("layers", "ico-s")} ${libres.length} bloque${libres.length > 1 ? "s" : ""} libre${libres.length > 1 ? "s" : ""}</span>` : ""}`;
        $$("[data-pag]", b).forEach((x) => (x.onclick = () => { ed.pagina = x.dataset.pag; sel = { c: 0, f: 0 }; ancla = null; render(); }));
        const n = $("[data-nueva]", b);
        if (n) n.onclick = () => { ed.pagina = ed.nuevaPagina(ed.pagina); sel = { c: 0, f: 0 }; render(); };
      }

      // ------------------------------------------------------------ escritura
      function escribir(c, f, valor) {
        if (ed.soloLectura || !t) return;
        const k = "c:" + F().ref(c, f);
        if ((t[k] || "") === valor) return;
        const campos = { [k]: valor };
        if (f >= (t.filas || 30) - 1) campos.filas = (t.filas || 30) + 10;
        if (c >= (t.cols || 10) - 1) campos.cols = (t.cols || 10) + 2;
        doc().cambiar(t.id, campos);
      }
      function mover(dc, df, extender) {
        if (extender) { if (!ancla) ancla = { ...sel }; } else ancla = null;
        sel = { c: Math.max(0, Math.min((t.cols || 10) - 1, sel.c + dc)), f: Math.max(0, Math.min((t.filas || 30) - 1, sel.f + df)) };
        pintarSeleccion();
      }

      function abrirEditor(inicial, conservar) {
        if (ed.soloLectura || !t) return;
        ruedaAuto.ocultar();
        cerrarEditor(false);
        const td = celda(sel.c, sel.f);
        if (!td) return;
        const r = td.getBoundingClientRect(), b = rej.getBoundingClientRect();
        editor = html(`<input class="editor-celda" spellcheck="false" autocomplete="off">`);
        editor.style.left = r.left - b.left + rej.scrollLeft + "px";
        editor.style.top = r.top - b.top + rej.scrollTop + "px";
        editor.style.width = Math.max(r.width, 160) + "px";
        editor.style.height = r.height + "px";
        editor.value = conservar ? crudo(sel.c, sel.f) : inicial || "";
        editor._c = sel.c; editor._f = sel.f;
        rej.append(editor);
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
        editor.addEventListener("input", () => (fx.value = editor.value));
        editor.addEventListener("keydown", teclaEditor);
        editor.addEventListener("blur", () => setTimeout(() => { if (editor && document.activeElement !== editor) cerrarEditor(true); }, 0));
      }
      function cerrarEditor(guardar) {
        if (!editor) return;
        const e = editor; editor = null;
        if (guardar) escribir(e._c, e._f, e.value);
        e.remove();
      }
      function teclaEditor(e) {
        if (["Enter", "Tab", "Escape"].includes(e.key)) e.stopPropagation();   // si no, la rejilla mueve otra vez
        if (e.key === "Enter") { e.preventDefault(); cerrarEditor(true); mover(0, e.shiftKey ? -1 : 1); rej.focus(); }
        else if (e.key === "Tab") { e.preventDefault(); cerrarEditor(true); mover(e.shiftKey ? -1 : 1, 0); rej.focus(); }
        else if (e.key === "Escape") { e.preventDefault(); cerrarEditor(false); pintarSeleccion(); rej.focus(); }
      }

      rej.addEventListener("keydown", (e) => {
        if (editor || !t) return;
        const mod = e.ctrlKey || e.metaKey;
        const flechas = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        if (flechas[e.key]) { e.preventDefault(); porPuntero = false; mover(...flechas[e.key], e.shiftKey); ruedaAuto.avisar(); return; }
        if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? mover(0, -1) : abrirEditor(null, true); return; }
        if (e.key === "Tab") { e.preventDefault(); mover(e.shiftKey ? -1 : 1, 0); return; }
        if (e.key === "F2") { e.preventDefault(); abrirEditor(null, true); return; }
        if ((e.key === "Delete" || e.key === "Backspace") && !ed.soloLectura) {
          e.preventDefault();
          vaciarRango();
          return;
        }
        if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); alternarFormato("n"); return; }
        if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); alternarFormato("i"); return; }
        if (mod && e.key.toLowerCase() === "u") { e.preventDefault(); alternarFormato("u"); return; }
        if (!mod && !e.altKey && e.key.length === 1) { e.preventDefault(); abrirEditor(e.key); }
      });
      /** El rango elegido como texto con tabuladores (lo que entienden Excel y Sheets al pegar). */
      function comoTexto() {
        const r = rango(), filas = [];
        for (let f = r.f1; f <= r.f2; f++) { const fila = []; for (let c = r.c1; c <= r.c2; c++) fila.push(crudo(c, f)); filas.push(fila.join("\t")); }
        return filas.join("\n");
      }
      function vaciarRango() {
        if (ed.soloLectura || !t) return;
        const r = rango(), campos = {};
        for (let f = r.f1; f <= r.f2; f++) for (let c = r.c1; c <= r.c2; c++) if (crudo(c, f)) campos["c:" + F().ref(c, f)] = "";
        if (Object.keys(campos).length) doc().cambiar(t.id, campos);
      }
      async function copiarRango(cortar) {
        const texto = comoTexto();
        try { await navigator.clipboard.writeText(texto); }
        catch (e) {
          // Sin permiso del portapapeles (o en la app): un campo oculto y el copiar de siempre.
          const a = html(`<textarea style="position:fixed;opacity:0;pointer-events:none"></textarea>`);
          a.value = texto; document.body.append(a); a.select();
          try { document.execCommand("copy"); } catch (e2) { /* sin portapapeles */ }
          a.remove(); rej.focus({ preventScroll: true });
        }
        if (cortar) vaciarRango();
        aviso(cortar ? "Celdas cortadas" : "Celdas copiadas", { tipo: "ok", ms: 1600 });
      }
      async function pegarRango() {
        try {
          const texto = await navigator.clipboard.readText();
          if (texto) pegarTexto(texto);
        } catch (e) { aviso("El navegador no dejó leer el portapapeles. Usa Ctrl+V.", { tipo: "info" }); }
      }
      rej.addEventListener("copy", (e) => {
        e.clipboardData.setData("text/plain", comoTexto());
        e.preventDefault();
      });
      rej.addEventListener("paste", (e) => {
        if (ed.soloLectura || editor || !t) return;
        e.preventDefault();
        pegarTexto(e.clipboardData.getData("text/plain"));
      });
      function pegarTexto(texto) {
        if (ed.soloLectura || !t) return;
        const filas = texto.replace(/\r/g, "").split("\n").filter((x, i, a) => x !== "" || i < a.length - 1);
        const campos = {};
        let maxF = t.filas || 30, maxC = t.cols || 10;
        filas.forEach((fila, df) => fila.split("\t").forEach((v, dc) => {
          campos["c:" + F().ref(sel.c + dc, sel.f + df)] = v;
          maxF = Math.max(maxF, sel.f + df + 2); maxC = Math.max(maxC, sel.c + dc + 2);
        }));
        campos.filas = maxF; campos.cols = maxC;
        doc().cambiar(t.id, campos);
      }

      rej.addEventListener("pointerdown", (e) => {
        ruedaAuto.ocultar();
        const td = e.target.closest("td");
        if (e.pointerType === "touch") dedos.add(e.pointerId);
        if (!td) return;
        const c = +td.dataset.c, f = +td.dataset.f;
        // Escribiendo una fórmula: el clic en otra celda inserta su referencia (como en Excel).
        if (editor && editor.value.startsWith("=") && (c !== editor._c || f !== editor._f)) {
          e.preventDefault();
          const p = editor.selectionStart;
          editor.value = editor.value.slice(0, p) + F().ref(c, f) + editor.value.slice(editor.selectionEnd);
          editor.setSelectionRange(p + F().ref(c, f).length, p + F().ref(c, f).length);
          fx.value = editor.value;
          return;
        }
        if (editor) cerrarEditor(true);
        // Mayús + clic, un dedo sosteniendo otra celda, o tocar después de mantener: rango.
        const sumar = e.shiftKey || (e.pointerType === "touch" && (dedos.size > 1 || extender));
        if (sumar) { if (!ancla) ancla = { ...sel }; extender = false; } else ancla = { c, f };
        sel = { c, f };
        porPuntero = true;
        arrastrando = e.pointerType === "mouse";
        pintarSeleccion();
        if (e.pointerType === "touch" && !sumar) {
          clearTimeout(esperaRango && esperaRango.t);
          esperaRango = { x: e.clientX, y: e.clientY, id: e.pointerId, t: setTimeout(() => { esperaRango = null; extender = true; if (navigator.vibrate) navigator.vibrate(14); aviso("Toca otra celda para elegir el rango", { ms: 1800 }); }, 450) };
        }
        if (e.pointerType === "mouse") rej.focus({ preventScroll: true });
      });
      rej.addEventListener("pointermove", (e) => {
        if (esperaRango && e.pointerId === esperaRango.id && Math.hypot(e.clientX - esperaRango.x, e.clientY - esperaRango.y) > 7) { clearTimeout(esperaRango.t); esperaRango = null; }
        if (!arrastrando) return;
        const td = e.target.closest && e.target.closest("td");
        if (!td) return;
        const c = +td.dataset.c, f = +td.dataset.f;
        if (c !== sel.c || f !== sel.f) { sel = { c, f }; pintarSeleccion(); }
      });
      const soltar = (e) => {
        dedos.delete(e.pointerId);
        if (esperaRango && e.pointerId === esperaRango.id) { clearTimeout(esperaRango.t); esperaRango = null; }
        const eraMio = arrastrando || (e.target && e.target.closest && e.target.closest("[data-rejilla]"));
        arrastrando = false;
        if (ancla && ancla.c === sel.c && ancla.f === sel.f) ancla = null;
        if (eraMio && porPuntero) ruedaAuto.avisar();
      };
      document.addEventListener("pointerup", soltar);
      document.addEventListener("pointercancel", soltar);
      rej.addEventListener("dblclick", (e) => { if (e.target.closest("td")) abrirEditor(null, true); });

      fx.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); escribir(sel.c, sel.f, fx.value); mover(0, 1); rej.focus(); }
        if (e.key === "Escape") { fx.value = crudo(sel.c, sel.f); rej.focus(); }
      });
      fx.addEventListener("blur", () => { if (fx.value !== crudo(sel.c, sel.f)) escribir(sel.c, sel.f, fx.value); });

      // ------------------------------------------------------------ herramientas
      /** Negrita (n), cursiva (i) o subrayado (u) de todo el rango, según la celda activa. */
      function alternarFormato(k) {
        if (ed.soloLectura || !t) return;
        const r = rango(), valor = !t[k + ":" + F().ref(sel.c, sel.f)], campos = {};
        for (let f = r.f1; f <= r.f2; f++) for (let c = r.c1; c <= r.c2; c++) campos[k + ":" + F().ref(c, f)] = valor || null;
        doc().cambiar(t.id, campos);
      }
      function colorCeldas(color) {
        if (ed.soloLectura || !t) return;
        const r = rango(), campos = {};
        for (let f = r.f1; f <= r.f2; f++) for (let c = r.c1; c <= r.c2; c++) campos["k:" + F().ref(c, f)] = color;
        doc().cambiar(t.id, campos);
      }
      const negrita = () => alternarFormato("n");
      function autosuma() {
        if (ed.soloLectura || !t) return;
        let f = sel.f - 1;
        while (f >= 0 && typeof F().evaluador(crudo).valor(sel.c, f) === "number") f--;
        if (f === sel.f - 1) return aviso("Coloca la celda debajo de una columna de números", { tipo: "info" });
        escribir(sel.c, sel.f, `=SUMA(${F().ref(sel.c, f + 1)}:${F().ref(sel.c, sel.f - 1)})`);
      }
      // ------------------------------------------------------------ ruedita
      // Sale sola al elegir celdas con el puntero o con Mayús+flechas (y con clic derecho). Mismo
      // orden que en los demás editores: negrita, cursiva, subrayado, color, borrar, copiar, fórmulas, más.
      const COLORES_CELDA = ["#000000", "#C2372B", "#E8590C", "#2FA868", "#1D7A4C", "#3D72F2", "#8B5CF6"];
      function accionesCeldas() {
        const ref = F().ref(sel.c, sel.f), lect = ed.soloLectura || !t;
        const funcion = (fn) => ({ texto: fn, corto: fn.length > 8 ? fn.slice(0, 7) + "…" : fn, icono: "sigma", fn: () => abrirEditor(`=${fn}(`) });
        return [
          { texto: "Negrita", icono: "bold", off: lect, marcado: !!(t && t["n:" + ref]), mantener: true, fn: () => alternarFormato("n") },
          { texto: "Cursiva", icono: "italic", off: lect, marcado: !!(t && t["i:" + ref]), mantener: true, fn: () => alternarFormato("i") },
          { texto: "Subrayado", icono: "underline", off: lect, marcado: !!(t && t["u:" + ref]), mantener: true, fn: () => alternarFormato("u") },
          { texto: "Color", icono: "baseline", off: lect, sub: COLORES_CELDA.map((c) => ({ texto: c === "#000000" ? "Automático" : c, corto: " ", color: c, mantener: true, fn: () => colorCeldas(c === "#000000" ? null : c) })) },
          { texto: "Borrar", icono: "eraser", off: lect, fn: vaciarRango },
          { texto: "Copiar", icono: "copy", fn: () => copiarRango(false) },
          { texto: "Fórmulas", icono: "sigma", off: lect, sub: [{ texto: "Autosuma", icono: "sigma", fn: autosuma }, ...["SUMA", "PROMEDIO", "MIN", "MAX", "CONTAR", "SI", "REDONDEAR"].map(funcion)] },
          { texto: "Más", icono: "more-horizontal", sub: [
            { texto: "Cortar", icono: "scissors", off: lect, fn: () => copiarRango(true) },
            { texto: "Pegar", icono: "clipboard-paste", off: lect, fn: pegarRango },
            { texto: "Editar celda", corto: "Editar", icono: "type", off: lect, fn: () => abrirEditor(null, true) },
            { texto: "Agregar filas", corto: "+ Filas", icono: "rows-3", off: lect, fn: () => t && doc().cambiar(t.id, { filas: (t.filas || 30) + 10 }) },
            { texto: "Agregar columnas", corto: "+ Columnas", icono: "columns-3", off: lect, fn: () => t && doc().cambiar(t.id, { cols: (t.cols || 10) + 2 }) }] },
        ];
      }
      function leerRueda() {
        if (editor || !t || !rej.isConnected || arrastrando) return null;
        const r = rango(), varias = r.c1 !== r.c2 || r.f1 !== r.f2;
        if (!varias && !porPuntero) return null;   // moverse con las flechas no la saca
        const rect = NOM.rueda.rectDe([celda(r.c1, r.f1), celda(r.c2, r.f2)]);
        if (!rect) return null;
        return { firma: `${ed.pagina}:${r.c1},${r.f1}:${r.c2},${r.f2}`, rect, titulo: varias ? `${F().ref(r.c1, r.f1)}:${F().ref(r.c2, r.f2)}` : F().ref(sel.c, sel.f), items: accionesCeldas() };
      }
      const ruedaAuto = NOM.rueda.automatica(leerRueda);
      NOM.rueda.enlazar(rej, (e) => {
        const td = e.target.closest && e.target.closest("td");
        if (!td) return null;
        const c = +td.dataset.c, f = +td.dataset.f, r = rango();
        if (!(c >= r.c1 && c <= r.c2 && f >= r.f1 && f <= r.f2)) { ancla = null; sel = { c, f }; pintarSeleccion(); }
        ruedaAuto.ocultar();
        return accionesCeldas();
      }, { izquierdo: false, tactil: false, titulo: "Celdas" });

      this._herr = [
        { id: "negrita", icono: "bold", micro: "Negrita|Para encabezados y totales.|Ctrl+B", fn: negrita },
        { id: "cursiva", icono: "italic", micro: "Cursiva||Ctrl+I", fn: () => alternarFormato("i") },
        { id: "subrayado", icono: "underline", micro: "Subrayado||Ctrl+U", fn: () => alternarFormato("u") },
        { id: "suma", icono: "sigma", micro: "Autosuma|Suma los números que están arriba de la celda.", fn: autosuma },
        { id: "funciones", icono: "wand-sparkles", micro: "Funciones|SUMA, PROMEDIO, MIN, MAX, CONTAR, SI, REDONDEAR…", fn: (e, b) => NOM.menu(b, [
          { titulo: "Insertar función" },
          ...["SUMA", "PROMEDIO", "MIN", "MAX", "CONTAR", "SI", "REDONDEAR"].map((fn) => ({ texto: fn, fn: () => abrirEditor(`=${fn}(`) })),
        ]) },
        "|",
        { id: "fila", icono: "rows-3", micro: "Agregar filas|Suma 10 filas al final.", fn: () => t && doc().cambiar(t.id, { filas: (t.filas || 30) + 10 }) },
        { id: "columna", icono: "columns-3", micro: "Agregar columnas|Suma 2 columnas a la derecha.", fn: () => t && doc().cambiar(t.id, { cols: (t.cols || 10) + 2 }) },
      ];

      /** Actualiza solo los valores visibles; no reconstruye la tabla (no estorba a quien escribe). */
      function actualizarValores() {
        const ev = F().evaluador(crudo);
        $$("td", rej).forEach((td) => {
          const c = +td.dataset.c, f = +td.dataset.f, ref = F().ref(c, f);
          const v = ev.valor(c, f), txt = F().formatear(v);
          if (td.textContent !== txt) td.textContent = txt;
          td.classList.toggle("num", typeof v === "number");
          td.classList.toggle("err", v instanceof F().ErrorF);
          td.toggleAttribute("data-negrita", !!t["n:" + ref]);
          td.toggleAttribute("data-cursiva", !!t["i:" + ref]);
          td.toggleAttribute("data-subrayado", !!t["u:" + ref]);
          td.style.color = t["k:" + ref] || "";
          const cr = String(crudo(c, f));
          td.title = cr.startsWith("=") ? cr : "";
        });
        if (document.activeElement !== fx && !editor) fx.value = crudo(sel.c, sel.f);
      }

      this.cambios = (lista) => {
        const tId = t && t.id;
        if (lista.some((c) => c.bloque === tId || c.bloque === "_doc" || c.campos.tipo === "tabla")) {
          const antes = t ? [t.filas, t.cols, t.id] : null;
          t = tabla();
          if (antes && t && antes[0] === t.filas && antes[1] === t.cols && antes[2] === t.id) { actualizarValores(); return; }
          const scroll = [rej.scrollLeft, rej.scrollTop];
          const e = editor;
          if (e) e.remove();
          render();
          if (e) { rej.append(e); e.focus(); }
          rej.scrollLeft = scroll[0]; rej.scrollTop = scroll[1];
        } else pintarBandeja();
      };
      this.desmontar = () => { cerrarEditor(true); ruedaAuto.destruir(); document.removeEventListener("pointerup", soltar); document.removeEventListener("pointercancel", soltar); ed.lienzo.style.overflow = ""; };

      render();
      if (matchMedia("(hover: hover)").matches) rej.focus({ preventScroll: true });
    },
    herramientas() { return this._herr || []; },
  };
})();
