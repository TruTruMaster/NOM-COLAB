/* NOM-COLAB · Códigos QR (2.1): dibujarlos y leerlos, sin Internet.
   - Dibujar: qrcode-generator (js/vendor/qrcode.js, MIT), como SVG que se ve nítido a cualquier
     tamaño (también proyectado en el salón).
   - Leer: la cámara con BarcodeDetector cuando el navegador lo trae (Chrome en Android); si no,
     jsQR (js/vendor/jsQR.js, Apache 2.0), que se carga solo en ese momento. Sin cámara (o sin
     permiso) se escribe el código a mano: siempre hay una salida. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const { esc, ico, html, $ } = NOM;

  /** SVG de un QR. opc: { borde: módulos de margen (4), color, fondo, titulo }. */
  function svg(texto, opc) {
    opc = opc || {};
    if (!window.qrcode) return "";
    const qr = window.qrcode(0, opc.nivel || "M");
    qr.addData(String(texto));
    qr.make();
    const n = qr.getModuleCount(), b = opc.borde == null ? 4 : opc.borde, t = n + b * 2;
    let d = "";
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!qr.isDark(r, c)) { c++; continue; }
        let k = c;
        while (k < n && qr.isDark(r, k)) k++;
        d += `M${c + b},${r + b}h${k - c}v1h${c - k}z`;
        c = k;
      }
    }
    return `<svg class="qr" viewBox="0 0 ${t} ${t}" role="img" aria-label="${esc(opc.titulo || "Código QR")}" shape-rendering="crispEdges">`
      + `<rect width="${t}" height="${t}" fill="${esc(opc.fondo || "#fff")}"/><path d="${d}" fill="${esc(opc.color || "#15142A")}"/></svg>`;
  }

  // ------------------------------------------------------------ leer
  let cargaJsQR = null;
  function cargarJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    if (cargaJsQR) return cargaJsQR;
    cargaJsQR = new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = "js/vendor/jsQR.js";
      s.onload = () => (window.jsQR ? ok(window.jsQR) : mal(new Error("No se pudo cargar el lector de QR")));
      s.onerror = () => { cargaJsQR = null; mal(new Error("No se pudo cargar el lector de QR")); };
      document.head.append(s);
    });
    return cargaJsQR;
  }

  /** ¿Hay cámara en este navegador o en la app? (sin pedir permiso todavía) */
  const hayCamara = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  /**
   * Abre la cámara y devuelve lo que diga el primer QR (o lo que se escriba a mano, o null).
   * opc: { titulo, ayuda, manual: texto del campo manual, validar(texto) -> mensaje de error | null }
   */
  function escanear(opc) {
    opc = opc || {};
    return new Promise((resolver) => {
      let flujo = null, raf = 0, terminado = false, detector = null, lienzo = null, ultimo = 0;
      const cuerpo = html(`<div class="col qr-escaner">
        <div class="qr-camara" data-camara><video playsinline muted autoplay></video><div class="qr-mira" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div class="qr-estado" data-estado><span class="cargando"></span> Abriendo la cámara…</div></div>
        <p class="suave chico" style="font-weight:650;text-align:center">${esc(opc.ayuda || "Apunta al código QR que muestra la pantalla del propietario.")}</p>
        <form class="fila" data-manual>
          <div class="entrada crece">${ico("keyboard")}<input name="codigo" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="${esc(opc.manual || "O escribe el código (8 letras)")}" aria-label="Código"></div>
          <button class="btn primario">Entrar</button>
        </form>
        <div class="alerta error" data-error hidden></div>
      </div>`);
      const h = NOM.hoja({ titulo: opc.titulo || "Escanear código QR", icono: "qr-code", cuerpo, alCerrar: () => terminar(null) });
      const video = $("video", cuerpo), estado = $("[data-estado]", cuerpo), error = $("[data-error]", cuerpo);
      function terminar(valor) {
        if (terminado) return;
        terminado = true;
        cancelAnimationFrame(raf);
        if (flujo) flujo.getTracks().forEach((t) => t.stop());
        resolver(valor);
      }
      function listo(texto) {
        const malo = opc.validar ? opc.validar(texto) : null;
        if (malo) { error.hidden = false; error.innerHTML = `${ico("triangle-alert")}<span>${esc(malo)}</span>`; return false; }
        if (navigator.vibrate) navigator.vibrate(30);
        terminar(texto);
        h.cerrar(true);
        return true;
      }
      $("[data-manual]", cuerpo).onsubmit = (e) => {
        e.preventDefault();
        const v = e.target.codigo.value.trim();
        if (v) listo(v);
      };
      function sinCamara(motivo) {
        $("[data-camara]", cuerpo).classList.add("sin");
        estado.innerHTML = `${ico("camera-off")} ${esc(motivo)}`;
        setTimeout(() => { const i = $("input", cuerpo); if (i) i.focus(); }, 60);
      }
      async function cuadro() {
        if (terminado) return;
        raf = requestAnimationFrame(cuadro);
        const ahora = performance.now();
        if (ahora - ultimo < 160 || video.readyState < 2) return;
        ultimo = ahora;
        try {
          if (detector) {
            const l = await detector.detect(video);
            if (l && l.length && l[0].rawValue) listo(l[0].rawValue);
            return;
          }
          const w = video.videoWidth, hh = video.videoHeight;
          if (!w || !hh) return;
          const k = Math.min(1, 640 / Math.max(w, hh));
          if (!lienzo) lienzo = document.createElement("canvas");
          lienzo.width = Math.round(w * k); lienzo.height = Math.round(hh * k);
          const cx = lienzo.getContext("2d", { willReadFrequently: true });
          cx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
          const img = cx.getImageData(0, 0, lienzo.width, lienzo.height);
          const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (r && r.data) listo(r.data);
        } catch (e) { /* el siguiente cuadro */ }
      }
      (async () => {
        if (!hayCamara()) return sinCamara("Este navegador no deja usar la cámara aquí. Escribe el código.");
        try {
          flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        } catch (e) {
          return sinCamara(e && e.name === "NotAllowedError" ? "Sin permiso para la cámara. Escribe el código." : "No se pudo abrir la cámara. Escribe el código.");
        }
        if (terminado) { flujo.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = flujo;
        try { await video.play(); } catch (e) { /* autoplay */ }
        try {
          if ("BarcodeDetector" in window && (await window.BarcodeDetector.getSupportedFormats()).includes("qr_code")) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        } catch (e) { detector = null; }
        if (!detector) {
          try { await cargarJsQR(); } catch (e) { return sinCamara("No se pudo cargar el lector. Escribe el código."); }
        }
        estado.innerHTML = `${ico("scan-eye")} Buscando el código…`;
        cuadro();
      })();
    });
  }

  NOM.qr = { svg, escanear, hayCamara, cargarJsQR };
})();
