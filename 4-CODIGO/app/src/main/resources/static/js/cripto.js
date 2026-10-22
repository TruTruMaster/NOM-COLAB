/* NOM-COLAB · Criptografía para la bóveda local.
   Con WebCrypto (HTTPS, localhost, app Android) se usa PBKDF2-SHA256 + AES-256-GCM nativos.
   En la red local por http:// el navegador no ofrece WebCrypto, así que se usa esta
   implementación en JavaScript puro: SHA-256, HMAC, PBKDF2 y AES-256 en modo CTR con
   autenticación HMAC-SHA256 (cifrar-y-después-autenticar). Verificada con los vectores de
   FIPS-197, RFC 4231 y RFC 7914 en test/cripto.test.js. */
(function () {
  "use strict";
  const NOM = (window.NOM = window.NOM || {});
  const enc = new TextEncoder(), dec = new TextDecoder();

  // ------------------------------------------------------------ SHA-256
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const W = new Uint32Array(64);
  function bloqueSha(h, m, o) {
    for (let i = 0; i < 16; i++) W[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  function sha256(datos) {
    const largo = datos.length, total = Math.ceil((largo + 9) / 64) * 64;
    const m = new Uint8Array(total);
    m.set(datos); m[largo] = 0x80;
    const bits = largo * 8;
    m[total - 4] = bits >>> 24; m[total - 3] = bits >>> 16; m[total - 2] = bits >>> 8; m[total - 1] = bits;
    m[total - 8] = Math.floor(bits / 2 ** 32) >>> 0;
    const h = Int32Array.from(H0);
    for (let o = 0; o < total; o += 64) bloqueSha(h, m, o);
    const r = new Uint8Array(32);
    for (let i = 0; i < 8; i++) { r[4 * i] = h[i] >>> 24; r[4 * i + 1] = h[i] >>> 16; r[4 * i + 2] = h[i] >>> 8; r[4 * i + 3] = h[i]; }
    return r;
  }
  const unir = (...ps) => { const r = new Uint8Array(ps.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of ps) { r.set(p, i); i += p.length; } return r; };

  // ------------------------------------------------------------ HMAC y PBKDF2
  function hmac(llave, datos) {
    if (llave.length > 64) llave = sha256(llave);
    const k = new Uint8Array(64); k.set(llave);
    const ipad = k.map((x) => x ^ 0x36), opad = k.map((x) => x ^ 0x5c);
    return sha256(unir(opad, sha256(unir(ipad, datos))));
  }
  /** PBKDF2-HMAC-SHA256 (32 bytes por bloque). Precalcula los estados internos de ipad/opad. */
  function pbkdf2(clave, sal, iteraciones, largo) {
    let llave = clave.length > 64 ? sha256(clave) : clave;
    const k = new Uint8Array(64); k.set(llave);
    const estado = (pad) => { const h = Int32Array.from(H0); bloqueSha(h, k.map((x) => x ^ pad), 0); return h; };
    const hi = estado(0x36), ho = estado(0x5c);
    // HMAC de 32 bytes con estados precalculados: un bloque interno y uno externo.
    const bloqueFinal = new Uint8Array(64);
    bloqueFinal[32] = 0x80; bloqueFinal[62] = 0x03; bloqueFinal[63] = 0x00;   // longitud = (64 + 32) * 8 = 768 bits
    const rapido = (u) => {
      bloqueFinal.set(u);
      const a = Int32Array.from(hi); bloqueSha(a, bloqueFinal, 0);
      const ab = new Uint8Array(32);
      for (let i = 0; i < 8; i++) { ab[4 * i] = a[i] >>> 24; ab[4 * i + 1] = a[i] >>> 16; ab[4 * i + 2] = a[i] >>> 8; ab[4 * i + 3] = a[i]; }
      bloqueFinal.set(ab);
      const b = Int32Array.from(ho); bloqueSha(b, bloqueFinal, 0);
      const r = new Uint8Array(32);
      for (let i = 0; i < 8; i++) { r[4 * i] = b[i] >>> 24; r[4 * i + 1] = b[i] >>> 16; r[4 * i + 2] = b[i] >>> 8; r[4 * i + 3] = b[i]; }
      return r;
    };
    const salida = new Uint8Array(largo);
    for (let bloque = 1, pos = 0; pos < largo; bloque++) {
      let u = hmac(llave, unir(sal, new Uint8Array([bloque >>> 24, bloque >>> 16, bloque >>> 8, bloque])));
      const t = u.slice();
      for (let i = 1; i < iteraciones; i++) { u = rapido(u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; }
      salida.set(t.subarray(0, Math.min(32, largo - pos)), pos); pos += 32;
    }
    return salida;
  }

  // ------------------------------------------------------------ AES-256 (cifrado de bloque) y CTR
  const SBOX = new Uint8Array(256);
  (() => {
    let p = 1, q = 1;
    do {
      p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
      q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09;
      const x = q ^ ((q << 1) | (q >>> 7)) ^ ((q << 2) | (q >>> 6)) ^ ((q << 3) | (q >>> 5)) ^ ((q << 4) | (q >>> 4));
      SBOX[p] = (x ^ 0x63) & 0xff;
    } while (p !== 1);
    SBOX[0] = 0x63;
  })();
  const xt = (a) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
  function expandir(llave) {
    const w = new Uint8Array(240); w.set(llave);
    let rcon = 1;
    for (let i = 32; i < 240; i += 4) {
      let t = w.slice(i - 4, i);
      if (i % 32 === 0) { t = new Uint8Array([SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]]); rcon = xt(rcon); }
      else if (i % 32 === 16) t = t.map((x) => SBOX[x]);
      for (let j = 0; j < 4; j++) w[i + j] = w[i - 32 + j] ^ t[j];
    }
    return w;
  }
  function cifrarBloque(w, entrada, salida) {
    const s = entrada.slice();
    for (let i = 0; i < 16; i++) s[i] ^= w[i];
    for (let r = 1; r <= 14; r++) {
      for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
      let t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
      t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
      t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t;
      if (r < 14) for (let c = 0; c < 16; c += 4) {
        const a0 = s[c], a1 = s[c + 1], a2 = s[c + 2], a3 = s[c + 3], x = a0 ^ a1 ^ a2 ^ a3;
        s[c] ^= x ^ xt(a0 ^ a1); s[c + 1] ^= x ^ xt(a1 ^ a2); s[c + 2] ^= x ^ xt(a2 ^ a3); s[c + 3] ^= x ^ xt(a3 ^ a0);
      }
      for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
    }
    salida.set(s);
  }
  function aesCtr(llave, iv, datos) {
    const w = expandir(llave), ctr = new Uint8Array(16), ks = new Uint8Array(16), r = new Uint8Array(datos.length);
    ctr.set(iv);
    for (let o = 0; o < datos.length; o += 16) {
      cifrarBloque(w, ctr, ks);
      for (let i = 0; i < 16 && o + i < datos.length; i++) r[o + i] = datos[o + i] ^ ks[i];
      for (let i = 15; i >= 0; i--) { ctr[i] = (ctr[i] + 1) & 0xff; if (ctr[i]) break; }
    }
    return r;
  }

  // ------------------------------------------------------------ interfaz de la bóveda
  const nativo = !!(window.crypto && window.crypto.subtle && window.isSecureContext !== false);
  const azar = (n) => { const b = new Uint8Array(n); (window.crypto || window.msCrypto).getRandomValues(b); return b; };
  const ITER_NATIVO = 210000, ITER_JS = 100000;   // en JS puro se baja para que entrar no tarde más de ~1 s en un celular

  /** Llave para envolver la llave de datos, derivada de la contraseña (nunca se guarda). */
  async function llaveDeContrasena(contrasena, sal, alg) {
    if (alg === "gcm") {
      const base = await crypto.subtle.importKey("raw", enc.encode(contrasena), "PBKDF2", false, ["deriveBits"]);
      return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: sal, iterations: ITER_NATIVO, hash: "SHA-256" }, base, 256));
    }
    return pbkdf2(enc.encode(contrasena), sal, ITER_JS, 32);
  }

  /** Cifra bytes con una llave de 32 bytes. Formato: alg | iv | datos | etiqueta. */
  async function cifrar(llave, datos, alg) {
    if (alg === "gcm") {
      const k = await crypto.subtle.importKey("raw", llave, "AES-GCM", false, ["encrypt"]);
      const iv = azar(12);
      return { alg, iv, ct: new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, datos)) };
    }
    const iv = azar(16), kc = llave, km = sha256(unir(llave, enc.encode("mac")));
    const ct = aesCtr(kc, iv, datos);
    return { alg: "ctr", iv, ct: unir(ct, hmac(km, unir(iv, ct))) };
  }
  async function descifrar(llave, sobre) {
    if (sobre.alg === "gcm") {
      const k = await crypto.subtle.importKey("raw", llave, "AES-GCM", false, ["decrypt"]);
      return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: sobre.iv }, k, sobre.ct));
    }
    const km = sha256(unir(llave, enc.encode("mac")));
    const ct = sobre.ct.subarray(0, sobre.ct.length - 32), tag = sobre.ct.subarray(sobre.ct.length - 32);
    const esperado = hmac(km, unir(sobre.iv, ct));
    let dif = 0; for (let i = 0; i < 32; i++) dif |= esperado[i] ^ tag[i];
    if (dif) throw new Error("Datos alterados o llave incorrecta");
    return aesCtr(llave, sobre.iv, ct);
  }

  NOM.cripto = { nativo, azar, sha256, hmac, pbkdf2, aesCtr, cifrarBloque, expandir, llaveDeContrasena, cifrar, descifrar,
    algPreferido: () => (nativo ? "gcm" : "ctr"), texto: (b) => dec.decode(b), bytes: (s) => enc.encode(s) };
})();
