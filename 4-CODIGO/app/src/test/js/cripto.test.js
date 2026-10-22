// Pruebas de static/js/cripto.js contra vectores oficiales y contra la implementación de Node.
// Uso: node app/src/test/js/cripto.test.js
const fs = require("fs"), path = require("path"), nodeCrypto = require("crypto");
global.window = { crypto: nodeCrypto.webcrypto, isSecureContext: true };
global.crypto = nodeCrypto.webcrypto;
eval(fs.readFileSync(path.join(__dirname, "../../main/resources/static/js/cripto.js"), "utf8"));
const C = window.NOM.cripto;
const hex = (b) => Buffer.from(b).toString("hex"), deHex = (h) => new Uint8Array(Buffer.from(h, "hex"));
let fallas = 0;
const prueba = (nombre, ok) => { console.log((ok ? "OK    " : "FALLA ") + nombre); if (!ok) fallas++; };

prueba("SHA-256 de 'abc' (FIPS 180-2)", hex(C.sha256(Buffer.from("abc"))) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
prueba("SHA-256 de 56 bytes (dos bloques)", hex(C.sha256(Buffer.from("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))) === "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
for (const n of [0, 1, 55, 56, 63, 64, 65, 1000, 70000]) {
  const d = nodeCrypto.randomBytes(n);
  prueba(`SHA-256 aleatorio de ${n} bytes = Node`, hex(C.sha256(d)) === nodeCrypto.createHash("sha256").update(d).digest("hex"));
}
prueba("HMAC-SHA256 RFC 4231 caso 2", hex(C.hmac(Buffer.from("Jefe"), Buffer.from("what do ya want for nothing?"))) === "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
prueba("HMAC con llave de 131 bytes = Node", (() => { const k = nodeCrypto.randomBytes(131), d = nodeCrypto.randomBytes(300); return hex(C.hmac(k, d)) === nodeCrypto.createHmac("sha256", k).update(d).digest("hex"); })());
prueba("PBKDF2-SHA256 RFC 7914 (1 iteración, 64 bytes)", hex(C.pbkdf2(Buffer.from("passwd"), Buffer.from("salt"), 1, 64)) === "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783");
prueba("PBKDF2-SHA256 4096 iteraciones = Node", (() => { const p = Buffer.from("contraseña Ñ#2026"), s = nodeCrypto.randomBytes(16); return hex(C.pbkdf2(p, s, 4096, 32)) === nodeCrypto.pbkdf2Sync(p, s, 4096, 32, "sha256").toString("hex"); })());
const fips = C.expandir(deHex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")), o = new Uint8Array(16);
C.cifrarBloque(fips, deHex("00112233445566778899aabbccddeeff"), o);
prueba("AES-256 FIPS-197 apéndice C.3", hex(o) === "8ea2b7ca516745bfeafc49904b496089");
for (const n of [1, 16, 17, 1000, 65537]) {
  const k = nodeCrypto.randomBytes(32), iv = nodeCrypto.randomBytes(16), d = nodeCrypto.randomBytes(n);
  const c = nodeCrypto.createCipheriv("aes-256-ctr", k, iv); const esp = Buffer.concat([c.update(d), c.final()]);
  prueba(`AES-256-CTR de ${n} bytes = Node`, hex(C.aesCtr(k, iv, d)) === esp.toString("hex"));
}
(async () => {
  for (const alg of ["gcm", "ctr"]) {
    const k = C.azar(32), msg = C.bytes(JSON.stringify({ texto: "Plan de clase · ñandú 🙂", n: [1, 2, 3] }));
    const s = await C.cifrar(k, msg, alg);
    prueba(`${alg}: cifrar y descifrar devuelve el original`, C.texto(await C.descifrar(k, s)) === C.texto(msg));
    let rechazo = false; try { await C.descifrar(C.azar(32), s); } catch (e) { rechazo = true; }
    prueba(`${alg}: otra llave no puede descifrar`, rechazo);
    s.ct[3] ^= 1; rechazo = false; try { await C.descifrar(k, s); } catch (e) { rechazo = true; }
    prueba(`${alg}: un byte alterado se detecta`, rechazo);
  }
  const t0 = Date.now(); C.pbkdf2(Buffer.from("x"), Buffer.from("y"), 60000, 32);
  console.log(`PBKDF2 en JS puro con 60 000 iteraciones: ${Date.now() - t0} ms`);
  console.log(fallas ? `${fallas} FALLA(S)` : "Todas las pruebas pasaron");
  process.exit(fallas ? 1 : 0);
})();
