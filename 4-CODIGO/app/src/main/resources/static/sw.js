/* NOM-COLAB · Service worker (6.1): la página sigue abriendo aunque se caiga la red.
   Red primero (el servidor siempre tiene la versión más nueva) y, si no responde en 3 s o no hay
   red, la copia guardada. La API (/api/...) nunca se guarda: los documentos sin red viven en la
   bóveda cifrada de cada cuenta. Al cambiar VERSION se descarta la caché anterior. */
const VERSION = "nom-colab-2026-11-08";
const BASE = [
  "./", "index.html", "manifest.webmanifest",
  "css/nom.css", "css/editor.css",
  "fonts/nunito-latin-wght-normal.woff2", "fonts/nunito-latin-ext-wght-normal.woff2",
  "img/icono.svg", "img/icono-192.png", "img/icono-512.png", "img/icono-maskable-512.png",
  "js/nucleo.js", "js/rueda.js", "js/cripto.js", "js/boveda.js", "js/api.js", "js/secuencia.js", "js/crdt.js", "js/local.js",
  "js/formulas.js", "js/graficas.js", "js/ecuaciones.js", "js/plantillas.js", "js/formatos.js", "js/ooxml.js", "js/vista-cuentas.js", "js/vista-espacios.js",
  "js/vista-dispositivo.js", "js/editor.js", "js/modo-texto.js", "js/modo-hoja.js", "js/lienzo.js", "js/experiencia.js",
  "js/anfitrion.js", "js/app.js", "js/vendor/qrcode.js", "js/qr.js", "js/union.js", "js/cola.js", "js/recibo.js",
  "js/comentarios.js", "js/proyector.js", "js/vendor/jsQR.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function guardada(pedido) {
  return caches.match(pedido, { ignoreSearch: true }).then((r) => r || (pedido.mode === "navigate" ? caches.match("index.html") : Response.error()));
}

self.addEventListener("fetch", (e) => {
  const p = e.request, u = new URL(p.url);
  if (p.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith(new Promise((resolver) => {
    let listo = false;
    const usar = (r) => { if (!listo) { listo = true; resolver(r); } };
    const espera = setTimeout(() => guardada(p).then((r) => { if (r && r.ok) usar(r); }), 3000);
    fetch(p).then((r) => {
      clearTimeout(espera);
      if (r && r.ok) { const c = r.clone(); caches.open(VERSION).then((k) => k.put(p, c)).catch(() => {}); usar(r); }
      else guardada(p).then((g) => usar(g && g.ok ? g : r));
    }).catch(() => { clearTimeout(espera); guardada(p).then(usar); });
  }));
});
