/* NOM-COLAB · Espacios cifrados de extremo a extremo (fase 15, parte D.2).
   El contenido se cifra en este equipo antes de enviarse y se descifra al recibirlo; el servidor
   guarda la estructura en claro (ids, relojes, autor, dueño de cada parte) para seguir juntando
   cambios, revisar permisos y contar aportes, pero no puede leer lo que dicen.

   - Cada espacio cifrado tiene una LLAVE DEL ESPACIO (32 bytes al azar).
   - Cada documento, una LLAVE DEL DOCUMENTO, envuelta con la del espacio (una rama y las copias en
     el mismo espacio usan la misma). El enlace para ver un documento lleva solo la suya.
   - Cada cuenta tiene un par de llaves ECDH P-256: la privada va envuelta con la contraseña y con el
     código de recuperación; la llave del espacio se envuelve para cada miembro con su llave pública.
   - Un código o QR de invitación lleva la llave del espacio después del # (no se manda al servidor).
   - Texto letra por letra: cada letra se cifra conservando que es UNA letra (y los saltos de párrafo
     quedan en claro), con un flujo AES-CTR que sale del id de la letra; así el servidor sigue
     juntando el texto. Los demás valores, con AES-GCM (o AES-CTR + HMAC sin WebCrypto).
   Se cifra y descifra en el borde de la API (api.js): el editor trabaja en claro dentro del equipo,
   y lo que se guarda en el equipo va en la bóveda, cifrado con la contraseña. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const C = () => NOM.cripto;
  const api = () => NOM.api;
  const PREFIJO = "e2e:";
  /** Campos que van en claro: la estructura que el servidor necesita. */
  const CLARO = new Set(["tipo", "eliminado", "dueno", "maestro", "pagina", "paginas", "orden", "padre", "resuelto", "grupo", "modo",
    "oculto", "bloqueado", "x", "y", "w", "h", "rot", "z"]);
  const claro = (c) => CLARO.has(c) || c.startsWith("dueno:");

  // ------------------------------------------------------------ utilidades
  const b64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const deB64 = (t) => { const s = atob(String(t).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(t).length + 3) % 4)); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
  const unir = (...ps) => { const n = ps.reduce((a, p) => a + p.length, 0), r = new Uint8Array(n); let o = 0; ps.forEach((p) => { r.set(p, o); o += p.length; }); return r; };
  const cifrado = (v) => typeof v === "string" && v.startsWith(PREFIJO);
  const hayWebCrypto = () => !!(window.crypto && crypto.subtle && window.isSecureContext !== false);

  /** "e2e:" + alg(1) + iv + datos: lo descifra cualquier equipo (con o sin WebCrypto). */
  async function cifrarBytes(llave, datos) {
    const s = await C().cifrar(llave, datos, C().algPreferido());
    return PREFIJO + b64(unir(new Uint8Array([s.alg === "gcm" ? 1 : 2]), s.iv, s.ct));
  }
  async function descifrarBytes(llave, texto) {
    const b = deB64(texto.slice(PREFIJO.length));
    const alg = b[0] === 1 ? "gcm" : "ctr", n = alg === "gcm" ? 12 : 16;
    return C().descifrar(llave, { alg, iv: b.subarray(1, 1 + n), ct: b.subarray(1 + n) });
  }
  const cifrarValor = (llave, v) => cifrarBytes(llave, C().bytes(JSON.stringify(v)));
  async function descifrarValor(llave, t) {
    try { return JSON.parse(C().texto(await descifrarBytes(llave, t))); }
    catch (e) { return null; }
  }

  // ------------------------------------------------------------ letras: cifrar conservando el largo
  const N = 0x110000 - 2048 - 1;   // todos los caracteres menos los sustitutos y el salto de párrafo
  const f = (c) => (c < 10 ? c : c < 0xd800 ? c - 1 : c - 2049);
  const fi = (v) => (v < 10 ? v : v <= 0xd7fe ? v + 1 : v + 2049);
  const hashNodo = new Map();
  function flujo(llave, n, t, largo) {
    let h = hashNodo.get(n);
    if (!h) { h = C().sha256(C().bytes(String(n))).subarray(0, 8); hashNodo.set(n, h); }
    const iv = new Uint8Array(16);
    iv.set(h);
    let x = t;
    for (let i = 15; i >= 8; i--) { iv[i] = x % 256; x = Math.floor(x / 256); }
    const ks = C().aesCtr(llave, iv, new Uint8Array(16 * largo));
    const r = new Array(largo);
    for (let i = 0; i < largo; i++) r[i] = ((ks[16 * i] << 24) >>> 0) + (ks[16 * i + 1] << 16) + (ks[16 * i + 2] << 8) + ks[16 * i + 3];
    return r;
  }
  function letras(llave, n, t, x, signo) {
    const cs = Array.from(String(x || ""));
    if (!cs.length) return x;
    const k = flujo(llave, n, t, cs.length);
    return cs.map((ch, i) => {
      const c = ch.codePointAt(0);
      if (c === 10 || (c >= 0xd800 && c <= 0xdfff)) return ch;
      return String.fromCodePoint(fi(((f(c) + signo * (k[i] % N)) % N + N) % N));
    }).join("");
  }

  // ------------------------------------------------------------ operaciones y estados
  async function cifrarCampos(llave, campos) {
    const r = {};
    for (const c in campos || {}) r[c] = claro(c) || campos[c] === null || campos[c] === undefined || cifrado(campos[c]) ? campos[c] : await cifrarValor(llave, campos[c]);
    return r;
  }
  async function descifrarCampos(llave, campos) {
    const r = {};
    for (const c in campos || {}) r[c] = cifrado(campos[c]) ? await descifrarValor(llave, campos[c]) : campos[c];
    return r;
  }
  async function cifrarSeq(llave, s, t, n) {
    if (!s || s.k !== "i") return s;
    const r = Object.assign({}, s);
    if (typeof s.x === "string" && !s.cx) { r.x = letras(llave, n, t, s.x, 1); r.cx = 1; }
    if (s.e && typeof s.e === "object") r.e = await cifrarValor(llave, s.e);
    return r;
  }
  async function descifrarSeq(llave, s, t, n) {
    if (!s || s.k === "v") return s;
    const r = Object.assign({}, s);
    if (s.cx && typeof s.x === "string") { r.x = letras(llave, n, t, s.x, -1); delete r.cx; }
    if (cifrado(s.e)) r.e = await descifrarValor(llave, s.e);
    return r;
  }
  async function cifrarOps(llave, ops) {
    const r = [];
    for (const op of ops || []) {
      const o = Object.assign({}, op);
      if (o.campos) o.campos = await cifrarCampos(llave, o.campos);
      if (o.s) o.s = await cifrarSeq(llave, o.s, o.t, o.n);
      r.push(o);
    }
    return r;
  }
  async function descifrarOps(llave, ops) {
    const r = [];
    for (const op of ops || []) {
      const o = Object.assign({}, op);
      if (o.campos) o.campos = await descifrarCampos(llave, o.campos);
      if (o.s) o.s = await descifrarSeq(llave, o.s, o.t, o.n);
      r.push(o);
    }
    return r;
  }
  /** Un estado completo (como lo da GET /api/documentos/{id}). */
  async function descifrarEstado(llave, est) {
    if (!est) return est;
    const r = Object.assign({}, est, { bloques: {}, seq: {} });
    for (const b in est.bloques || {}) {
      r.bloques[b] = {};
      for (const c in est.bloques[b]) {
        const g = est.bloques[b][c];
        r.bloques[b][c] = g && cifrado(g.v) ? Object.assign({}, g, { v: await descifrarValor(llave, g.v) }) : g;
      }
    }
    for (const b in est.seq || {}) {
      const s = est.seq[b] || {};
      const ins = [];
      for (const e of s.ins || []) {
        const x = Object.assign({}, e);
        if (e.cx && typeof e.x === "string") { x.x = letras(llave, e.n, e.t, e.x, -1); delete x.cx; }
        if (cifrado(e.e)) x.e = await descifrarValor(llave, e.e);
        ins.push(x);
      }
      r.seq[b] = Object.assign({}, s, { ins });
    }
    return r;
  }
  /** La foto de una versión: bloque → campo → valor, y "_seq:bloque" → registro. */
  async function descifrarFoto(llave, foto) {
    const r = {};
    for (const b in foto || {}) {
      if (b.startsWith("_seq:")) {
        const s = foto[b] || {}, ins = [];
        for (const e of s.ins || []) { const x = Object.assign({}, e); if (e.cx && typeof e.x === "string") { x.x = letras(llave, e.n, e.t, e.x, -1); delete x.cx; } if (cifrado(e.e)) x.e = await descifrarValor(llave, e.e); ins.push(x); }
        r[b] = Object.assign({}, s, { ins });
      } else r[b] = await descifrarCampos(llave, foto[b]);
    }
    return r;
  }

  // ------------------------------------------------------------ llaves de la cuenta (ECDH P-256)
  const claveVault = (k) => api().clave("e2e." + k);
  const recordar = (k, v) => NOM.guardar(claveVault(k), v);
  const recordado = (k) => NOM.leer(claveVault(k), null);
  const normalCodigo = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  async function envolverConSecreto(secreto, datos) {
    const sal = C().azar(16), alg = C().algPreferido();
    const k = await C().llaveDeContrasena(secreto, sal, alg);
    const s = await C().cifrar(k, datos, alg);
    return JSON.stringify({ sal: b64(sal), alg, iv: b64(s.iv), ct: b64(s.ct) });
  }
  async function abrirConSecreto(secreto, texto) {
    const o = JSON.parse(texto);
    const k = await C().llaveDeContrasena(secreto, deB64(o.sal), o.alg);
    return C().descifrar(k, { alg: o.alg, iv: deB64(o.iv), ct: deB64(o.ct) });
  }

  /**
   * Al entrar (o al crear la cuenta): si la cuenta no tiene par de llaves se crea; la privada se abre
   * con la contraseña y se guarda en la bóveda de este equipo. codigo: el de recuperación, si se sabe.
   */
  async function prepararCuenta(contrasena, codigo) {
    if (!api().token() || NOM.sinContrasena(api().usuario())) return false;
    let ll;
    try { ll = await api().get("/api/cuentas/llaves", undefined, { ms: 10000, sin401: true }); } catch (e) { return false; }
    if (ll.publica && ll.privadaContrasena) {
      try {
        const jwk = C().texto(await abrirConSecreto(contrasena, ll.privadaContrasena));
        recordar("privada", jwk);
        recordar("publica", ll.publica);
        if (codigo && !ll.privadaRecuperacion) await api().put("/api/cuentas/llaves", { privadaRecuperacion: await envolverConSecreto(normalCodigo(codigo), C().bytes(jwk)) });
        return true;
      } catch (e) { console.warn("No se pudo abrir la llave privada con esta contraseña", e); return false; }
    }
    if (!hayWebCrypto()) return false;
    const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const pub = JSON.stringify(await crypto.subtle.exportKey("jwk", par.publicKey));
    const priv = JSON.stringify(await crypto.subtle.exportKey("jwk", par.privateKey));
    await api().put("/api/cuentas/llaves", { publica: pub, privadaContrasena: await envolverConSecreto(contrasena, C().bytes(priv)),
      privadaRecuperacion: codigo ? await envolverConSecreto(normalCodigo(codigo), C().bytes(priv)) : null });
    recordar("privada", priv);
    recordar("publica", pub);
    return true;
  }

  /** Al cambiar la contraseña o el código: la llave privada se vuelve a envolver. */
  async function reenvolver(contrasena, codigo) {
    const priv = recordado("privada");
    if (!priv) return false;
    const c = { privadaContrasena: contrasena ? await envolverConSecreto(contrasena, C().bytes(priv)) : null };
    if (codigo) c.privadaRecuperacion = await envolverConSecreto(normalCodigo(codigo), C().bytes(priv));
    await api().put("/api/cuentas/llaves", c);
    return true;
  }

  /** Tras restablecer con el código: se abre con el código anterior y se envuelve con lo nuevo. */
  async function recuperarConCodigo(codigoViejo, contrasena, codigoNuevo) {
    try {
      const ll = await api().get("/api/cuentas/llaves");
      if (!ll.privadaRecuperacion) return false;
      const priv = C().texto(await abrirConSecreto(normalCodigo(codigoViejo), ll.privadaRecuperacion));
      recordar("privada", priv);
      recordar("publica", ll.publica);
      await reenvolver(contrasena, codigoNuevo);
      return true;
    } catch (e) { console.warn(e); return false; }
  }

  async function derivarCompartida(privJwk, pubJwk) {
    const priv = await crypto.subtle.importKey("jwk", privJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const pub = await crypto.subtle.importKey("jwk", pubJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256));
    return C().sha256(unir(bits, C().bytes("nom-colab/e2e/envoltura")));
  }
  /** Envuelve una llave para una llave pública (ECDH con una llave de un solo uso). */
  async function envolverPara(publicaJwkTexto, llave) {
    if (!hayWebCrypto()) throw new Error("Para dar llaves hace falta una conexión segura (https) o la app");
    const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const ephPriv = await crypto.subtle.exportKey("jwk", eph.privateKey), ephPub = await crypto.subtle.exportKey("jwk", eph.publicKey);
    const k = await derivarCompartida(ephPriv, JSON.parse(publicaJwkTexto));
    return JSON.stringify({ epk: ephPub, s: await cifrarBytes(k, llave) });
  }
  async function abrirEnvuelta(texto) {
    const priv = recordado("privada");
    if (!priv || !hayWebCrypto()) return null;
    const o = JSON.parse(texto);
    const k = await derivarCompartida(JSON.parse(priv), o.epk);
    return descifrarBytes(k, o.s);
  }

  // ------------------------------------------------------------ llaves de espacios y documentos
  const memEsp = new Map(), memDoc = new Map(), espCifrado = new Map();
  function guardarLlaveEspacio(espacioId, llave) { memEsp.set(espacioId, llave); recordar("esp." + espacioId, b64(llave)); espCifrado.set(espacioId, true); }
  /** La llave de un espacio cifrado (o null si este equipo no la tiene). esp: { id, e2e, miLlave } si ya se sabe. */
  async function llaveEspacio(espacioId, esp) {
    if (memEsp.has(espacioId)) return memEsp.get(espacioId);
    const g = recordado("esp." + espacioId);
    if (g) { const k = deB64(g); memEsp.set(espacioId, k); return k; }
    let mia = esp && esp.miLlave;
    if (!mia && (!esp || esp.e2e)) {
      try { const l = await api().get(`/api/espacios/${espacioId}/llaves`, undefined, { ms: 8000, sin401: true, crudo: true }); mia = l.mia; espCifrado.set(espacioId, !!l.e2e); } catch (e) { return null; }
    }
    if (!mia) return null;
    try { const k = await abrirEnvuelta(mia); if (k) { guardarLlaveEspacio(espacioId, k); return k; } } catch (e) { console.warn(e); }
    return null;
  }
  async function llaveDoc(docId, meta) {
    if (memDoc.has(docId)) return memDoc.get(docId);
    const g = recordado("doc." + docId);
    if (g) { const k = deB64(g); memDoc.set(docId, k); return k; }
    if (!meta || !meta.llave || !meta.espacioId) return null;
    const ke = await llaveEspacio(meta.espacioId, meta.espacio);
    if (!ke) return null;
    try { const k = deB64(C().texto(await descifrarBytes(ke, meta.llave))); fijarLlaveDoc(docId, k); return k; } catch (e) { return null; }
  }
  function fijarLlaveDoc(docId, k) { memDoc.set(docId, k); recordar("doc." + docId, b64(k)); }
  const sinLlave = () => Object.assign(new Error("Este espacio está cifrado de extremo a extremo y este equipo todavía no tiene su llave. Ábrelo con el código o el QR de invitación, o pide a alguien del espacio que lo abra."), { estado: 0, sinLlave: true });

  /** Para mostrar un nombre: descifrado, o «Documento cifrado» si este equipo no tiene la llave. */
  async function nombreDoc(d, ke) {
    if (!d || !cifrado(d.nombre)) return d && d.nombre;
    try {
      let k = memDoc.get(d.id) || (recordado("doc." + d.id) && deB64(recordado("doc." + d.id)));
      if (!k && d.llave && ke) { k = deB64(C().texto(await descifrarBytes(ke, d.llave))); fijarLlaveDoc(d.id, k); }
      if (k) { const v = await descifrarValor(k, d.nombre); if (typeof v === "string") return v; }
    } catch (e) { /* sin llave */ }
    return "Documento cifrado";
  }
  async function nombreEspacio(e) {
    if (!e || !cifrado(e.nombre)) return e && e.nombre;
    const k = await llaveEspacio(e.id, e);
    if (k) { const v = await descifrarValor(k, e.nombre); if (typeof v === "string") return v; }
    return "Espacio cifrado";
  }

  /** Quien tiene la llave se la da (envuelta) a los miembros que todavía no la tienen. */
  async function repartir(espacioId) {
    const k = await llaveEspacio(espacioId);
    if (!k || !hayWebCrypto()) return 0;
    let l;
    try { l = await api().get(`/api/espacios/${espacioId}/llaves`, undefined, { crudo: true }); } catch (e) { return 0; }
    let n = 0;
    for (const x of l.faltan || []) {
      if (!x.publica) continue;
      try { await api().put(`/api/espacios/${espacioId}/llaves`, { usuario: x.id, llave: await envolverPara(x.publica, k) }); n++; } catch (e) { console.warn(e); }
    }
    if (!l.mia) {
      const pub = recordado("publica");
      if (pub) try { await api().put(`/api/espacios/${espacioId}/llaves`, { llave: await envolverPara(pub, k) }); } catch (e) { /* luego */ }
    }
    return n;
  }

  // ------------------------------------------------------------ invitaciones: la llave en el #
  /** La parte de la dirección de invitación que lleva la llave (#k=…), o "" si el espacio no es cifrado. */
  async function fragmento(espacioId) {
    const k = await llaveEspacio(espacioId);
    return k ? "#k=" + b64(k) : "";
  }
  /** Al abrir un código con su llave (#k=…), se guarda hasta entrar al espacio. */
  function recordarInvitacion(codigo, k) { try { sessionStorage.setItem("nom.e2e.inv." + codigo, k); } catch (e) { /* sin almacenamiento */ } }
  function invitacion(codigo) { try { return sessionStorage.getItem("nom.e2e.inv." + codigo); } catch (e) { return null; } }
  /** Ya dentro del espacio: la llave que trajo el código se guarda en la bóveda (y en el servidor, envuelta). */
  async function alEntrar(codigo, espacioId) {
    const k = invitacion(codigo);
    if (!k) return;
    guardarLlaveEspacio(espacioId, deB64(k));
    try { sessionStorage.removeItem("nom.e2e.inv." + codigo); } catch (e) { /* nada */ }
    repartir(espacioId).catch(() => {});
  }

  // ------------------------------------------------------------ el borde de la API
  const docDeRuta = (r) => (r.match(/^\/api\/documentos\/([^/?]+)/) || [])[1];
  const espDeRuta = (r) => (r.match(/^\/api\/espacios\/([^/?]+)/) || [])[1];
  const espacioCifrado = (id) => espCifrado.get(id) === true || memEsp.has(id) || !!recordado("esp." + id) || !!((NOM.app && NOM.app.espacios) || []).find((e) => e.id === id && e.e2e);

  async function alEnviar(metodo, ruta, cuerpo) {
    if (!cuerpo || typeof cuerpo !== "object") return cuerpo;
    let m;
    if (metodo === "POST" && ruta === "/api/espacios" && cuerpo.e2e) {
      if (!hayWebCrypto() || !recordado("publica")) throw new Error("Para crear un espacio cifrado hace falta la app o una conexión segura (https), y entrar con tu contraseña.");
      const k = C().azar(32);
      const r = Object.assign({}, cuerpo, { nombre: await cifrarValor(k, cuerpo.nombre), llave: await envolverPara(recordado("publica"), k) });
      r._llave = k;
      return r;
    }
    if ((m = ruta.match(/^\/api\/espacios\/([^/]+)$/)) && metodo === "PUT" && cuerpo.nombre && espacioCifrado(m[1])) {
      const k = await llaveEspacio(m[1]);
      if (!k) throw sinLlave();
      return Object.assign({}, cuerpo, { nombre: await cifrarValor(k, cuerpo.nombre) });
    }
    if ((m = ruta.match(/^\/api\/espacios\/([^/]+)\/documentos$/)) && metodo === "POST" && espacioCifrado(m[1])) {
      const ke = await llaveEspacio(m[1]);
      if (!ke) throw sinLlave();
      const kd = C().azar(32);
      return Object.assign({}, cuerpo, { nombre: await cifrarValor(kd, cuerpo.nombre || "Documento sin título"), ops: await cifrarOps(kd, cuerpo.ops), llave: await cifrarBytes(ke, C().bytes(b64(kd))), _llaveDoc: kd });
    }
    if ((m = ruta.match(/^\/api\/espacios\/([^/]+)\/chat$/)) && metodo === "POST" && espacioCifrado(m[1])) {
      const k = await llaveEspacio(m[1]);
      if (!k) throw sinLlave();
      const r = Object.assign({}, cuerpo);
      if (r.texto) r.texto = await cifrarValor(k, r.texto);
      if (r.adjunto) r.adjunto = Object.assign({}, r.adjunto, { datos: await cifrarValor(k, r.adjunto.datos), nombre: await cifrarValor(k, r.adjunto.nombre || "") });
      return r;
    }
    const id = docDeRuta(ruta);
    if (!id) return cuerpo;
    const kd = await llaveDoc(id);
    if (!kd) return cuerpo;
    if (/\/ops$/.test(ruta)) return Object.assign({}, cuerpo, { ops: await cifrarOps(kd, cuerpo.ops) });
    if (/\/ramas$/.test(ruta)) return Object.assign({}, cuerpo, { nombre: await cifrarValor(kd, cuerpo.nombre || "Rama"), ops: await cifrarOps(kd, cuerpo.ops), propios: await cifrarOps(kd, cuerpo.propios) });
    if (/\/nombre$/.test(ruta)) return Object.assign({}, cuerpo, { nombre: await cifrarValor(kd, cuerpo.nombre) });
    if (/\/copia$/.test(ruta)) {
      const base = cuerpo.nombre || ("Copia de " + ((NOM.editorActual && NOM.editorActual.id === id && NOM.editorActual.doc && NOM.editorActual.doc.valor("_doc", "nombre")) || "documento"));
      return Object.assign({}, cuerpo, { nombre: await cifrarValor(kd, base) });
    }
    return cuerpo;
  }

  async function alRecibir(metodo, ruta, datos, cuerpoEnviado) {
    let m;
    if (metodo === "POST" && ruta === "/api/espacios" && cuerpoEnviado && cuerpoEnviado._llave && datos && datos.id) {
      guardarLlaveEspacio(datos.id, cuerpoEnviado._llave);
      datos.nombre = await nombreEspacio(datos);
      return datos;
    }
    if ((m = ruta.match(/^\/api\/espacios\/([^/]+)\/documentos$/)) && metodo === "POST" && cuerpoEnviado && cuerpoEnviado._llaveDoc && datos && datos.id) {
      fijarLlaveDoc(datos.id, cuerpoEnviado._llaveDoc);
      datos.nombre = await nombreDoc(datos);
      return datos;
    }
    if (metodo !== "GET") {
      if (datos && datos.id && cifrado(datos.nombre)) datos.nombre = /^\/api\/espacios\//.test(ruta) && !docDeRuta(ruta) ? await nombreEspacio(datos) : await nombreDoc(datos);
      return datos;
    }
    if (ruta === "/api/espacios" && Array.isArray(datos)) {
      for (const e of datos) if (e.e2e) { espCifrado.set(e.id, true); e.nombre = await nombreEspacio(e); }
      return datos;
    }
    if ((m = ruta.match(/^\/api\/espacios\/([^/?]+)$/)) && datos && datos.id) {
      if (datos.e2e) {
        espCifrado.set(datos.id, true);
        const ke = await llaveEspacio(datos.id, datos);
        datos.nombre = await nombreEspacio(datos);
        for (const d of datos.lista || []) d.nombre = await nombreDoc(d, ke);
        datos.sinLlave = !ke;
      }
      return datos;
    }
    if ((m = ruta.match(/^\/api\/espacios\/([^/?]+)\/(documentos|papelera)/)) && Array.isArray(datos) && espacioCifrado(m[1])) {
      const ke = await llaveEspacio(m[1]);
      for (const d of datos) d.nombre = await nombreDoc(d, ke);
      return datos;
    }
    if ((m = ruta.match(/^\/api\/espacios\/([^/?]+)\/buscar/)) && espacioCifrado(m[1])) return [];
    if ((m = ruta.match(/^\/api\/espacios\/([^/?]+)\/chat(\?|$)/)) && datos && datos.e2e) {
      const k = await llaveEspacio(m[1]);
      for (const x of datos.mensajes || []) {
        if (!k) { x.texto = x.texto ? "Mensaje cifrado" : ""; continue; }
        if (cifrado(x.texto)) x.texto = await descifrarValor(k, x.texto);
        if (x.adjunto && cifrado(x.adjunto.nombre)) x.adjunto.nombre = await descifrarValor(k, x.adjunto.nombre);
      }
      return datos;
    }
    if ((m = ruta.match(/^\/api\/espacios\/([^/?]+)\/chat\/[^/]+\/adjunto/)) && datos && cifrado(datos.datos)) {
      const k = await llaveEspacio(m[1]);
      if (k) datos.datos = await descifrarValor(k, datos.datos);
      return datos;
    }
    const id = docDeRuta(ruta);
    if (id && /^\/api\/documentos\/[^/?]+$/.test(ruta) && datos && datos.documento) {
      const esp = datos.espacio || {};
      if (esp.e2e) {
        espCifrado.set(esp.id, true);
        const kd = await llaveDoc(id, { llave: datos.documento.llave, espacioId: esp.id, espacio: esp });
        if (!kd) throw sinLlave();
        datos.estado = await descifrarEstado(kd, datos.estado);
        datos.documento.nombre = await nombreDoc(datos.documento);
        esp.nombre = await nombreEspacio(esp);
        datos.e2e = true;
      }
      return datos;
    }
    if (id && /\/versiones\/\d+$/.test(ruta)) {
      const kd = await llaveDoc(id);
      return kd ? descifrarFoto(kd, datos) : datos;
    }
    if (id && /\/ramas$/.test(ruta) && Array.isArray(datos)) {
      for (const x of datos) if (cifrado(x.nombre)) x.nombre = await nombreDoc({ id: x.id, nombre: x.nombre });
      return datos;
    }
    if (id && /\/recibo/.test(ruta) && datos && datos.documento && cifrado(datos.documento.nombre)) {
      datos.documento = Object.assign({}, datos.documento, { nombreVisible: await nombreDoc({ id, nombre: datos.documento.nombre }) });
      return datos;
    }
    return datos;
  }

  /** Lo que llega en vivo (ops de otros): se descifra en orden. */
  async function descifrarEnVivo(docId, ops) {
    const k = memDoc.get(docId) || (recordado("doc." + docId) && deB64(recordado("doc." + docId)));
    return k ? descifrarOps(k, ops) : ops;
  }
  const esCifrado = (docId) => memDoc.has(docId) || !!recordado("doc." + docId);
  /** La llave de un documento en texto (para el enlace para ver y la pantalla del proyector). */
  async function llaveDocTexto(docId) { const k = await llaveDoc(docId); return k ? b64(k) : ""; }
  /** Con la llave que trae una dirección (#…): para quien abre un enlace para ver o el proyector. */
  const estadoConLlave = (texto, est) => descifrarEstado(deB64(texto), est);
  const valorConLlave = (texto, v) => (cifrado(v) ? descifrarValor(deB64(texto), v) : Promise.resolve(v));

  NOM.e2e = {
    hayWebCrypto, cifrado, prepararCuenta, reenvolver, recuperarConCodigo, llaveEspacio, llaveDoc, repartir, fragmento,
    recordarInvitacion, alEntrar, alEnviar, alRecibir, descifrarEnVivo, esCifrado, llaveDocTexto, estadoConLlave, valorConLlave,
    nombreDoc, nombreEspacio, espacioCifrado,
    // para las pruebas
    _letras: letras, _cifrarOps: cifrarOps, _descifrarOps: descifrarOps, _b64: b64, _deB64: deB64,
  };
})();
