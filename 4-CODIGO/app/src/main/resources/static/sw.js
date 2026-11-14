/* NOM-COLAB · Service worker (6.1): la página sigue abriendo aunque se caiga la red.
   Red primero (el servidor siempre tiene la versión más nueva) y, si no responde en 3 s o no hay
   red, la copia guardada. La API (/api/...) nunca se guarda: los documentos sin red viven en la
   bóveda cifrada de cada cuenta. Al cambiar VERSION se descarta la caché anterior. */
const VERSION = "nom-colab-0.13.0";
const BASE = [
  "./", "index.html", "manifest.webmanifest",
  "css/nom.css", "css/editor.css", "css/fuentes.css",
  "fonts/nunito-latin-wght-normal.woff2", "fonts/nunito-latin-ext-wght-normal.woff2",
  // equivalentes de las fuentes de Office (para que un documento mida lo mismo sin red y en el teléfono)
  "fonts/carlito-regular.woff2", "fonts/carlito-negrita.woff2", "fonts/carlito-cursiva.woff2", "fonts/carlito-negrita-cursiva.woff2",
  "fonts/caladea-regular.woff2", "fonts/caladea-negrita.woff2", "fonts/caladea-cursiva.woff2", "fonts/caladea-negrita-cursiva.woff2",
  "fonts/liberation-sans-regular.woff2", "fonts/liberation-sans-negrita.woff2", "fonts/liberation-sans-cursiva.woff2", "fonts/liberation-sans-negrita-cursiva.woff2",
  "fonts/liberation-serif-regular.woff2", "fonts/liberation-serif-negrita.woff2", "fonts/liberation-serif-cursiva.woff2", "fonts/liberation-serif-negrita-cursiva.woff2",
  "fonts/liberation-mono-regular.woff2", "fonts/liberation-mono-negrita.woff2", "fonts/liberation-mono-cursiva.woff2", "fonts/liberation-mono-negrita-cursiva.woff2",
  "fonts/comic-neue-regular.woff2", "fonts/comic-neue-negrita.woff2", "fonts/comic-neue-cursiva.woff2", "fonts/comic-neue-negrita-cursiva.woff2",
  "img/icono.svg", "img/icono-192.png", "img/icono-512.png", "img/icono-maskable-512.png",
  "js/nucleo.js", "js/rueda.js", "js/cripto.js", "js/boveda.js", "js/e2e.js", "js/api.js", "js/secuencia.js", "js/crdt.js", "js/local.js",
  "js/formulas.js", "js/graficas.js", "js/ecuaciones.js", "js/plantillas.js", "js/compresion.js", "js/origen.js", "js/formatos.js", "js/ooxml.js", "js/vista-cuentas.js", "js/vista-espacios.js",
  "js/vista-dispositivo.js", "js/editor.js", "js/modo-texto.js", "js/modo-hoja.js", "js/diapositivas.js", "js/iconos.js", "js/lienzo.js", "js/diagramas.js", "js/vista-ver.js", "js/citas.js", "js/datos.js", "js/experiencia.js",
  "js/anfitrion.js", "js/app.js", "js/vendor/qrcode.js", "js/qr.js", "js/acceso.js", "js/union.js", "js/cola.js", "js/ramas.js", "js/chat.js", "js/recibo.js",
  "js/comentarios.js",
  /* ayuda:inicio (lo escribe ayuda/generar.py) */ "ayuda/ayuda.css", "ayuda/ayuda.js", "ayuda/indice.json", "ayuda/index.html", "ayuda/buscar/index.html", "ayuda/preguntas-frecuentes/index.html", "ayuda/sin-internet/al-volver/index.html", "ayuda/sin-internet/alias/index.html", "ayuda/sin-internet/como-funciona/index.html", "ayuda/sin-internet/con-mi-cuenta/index.html", "ayuda/sin-internet/crear-sin-internet/index.html", "ayuda/sin-internet/index.html", "ayuda/sin-internet/que-se-puede/index.html", "ayuda/sin-internet/telefono-servidor/index.html", "legal/accesibilidad/index.html", "legal/almacenamiento/index.html", "legal/denuncias/index.html", "legal/index.html", "legal/licencias/index.html", "legal/permisos-android/index.html", "legal/privacidad-corto/index.html", "legal/privacidad/index.html", "legal/seguridad/index.html", "legal/terminos/index.html", "legal/uso-aceptable/index.html", /* ayuda:fin */ "js/proyector.js", "js/vendor/jsQR.js",
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
