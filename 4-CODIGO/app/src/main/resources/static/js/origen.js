/* NOM-COLAB · Paquete binario y "archivo de origen".

   1) NOM.paquete: un contenedor chico y comprimido (JSON + archivos adjuntos). Es el formato del
      .nom (versión 3) y también como se guarda, dentro del documento, el archivo de Office del
      que vino.

        "NOM" 0x03 | banderas | largo | flujo comprimido | adjuntos crudos | CRC-32

      El flujo comprimido lleva el JSON y los adjuntos que sí se comprimen (XML, texto), todos
      juntos: así lo que se repite entre un archivo y otro se guarda una sola vez. Lo que ya viene
      comprimido (fotos) va después, tal cual. El CRC del final detecta un archivo dañado.

   2) NOM.origen: al importar un .docx, .xlsx o .pptx se guarda el archivo original completo en
      el bloque "_origen" del documento. Al exportar al mismo formato se parte de ese original y
      solo se cambia lo que la persona editó: todo lo que NOM-COLAB no modela (temas, estilos,
      gráficas, SmartArt, macros de formato, encabezados complejos…) sale idéntico. */
(function () {
  "use strict";
  const G = typeof window !== "undefined" ? window : globalThis;
  const NOM = G.NOM || (G.NOM = {});
  const C = () => NOM.compresion;
  const enc = new TextEncoder(), dec = new TextDecoder();

  // ------------------------------------------------------------ base64 y huellas
  function aB64(u) { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  function deB64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  /** JSON con las llaves en orden: dos objetos iguales dan siempre el mismo texto. */
  function estable(v) {
    if (v === null || typeof v !== "object") return v === undefined ? "null" : JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(estable).join(",") + "]";
    return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + estable(v[k])).join(",") + "}";
  }
  /** Huella corta de cualquier valor (para saber si algo cambió desde que se importó). */
  function huella(v) {
    const b = enc.encode(typeof v === "string" ? v : estable(v));
    let h = 0x811C9DC5;
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
    return b.length.toString(36) + "." + (h >>> 0).toString(36) + "." + C().crc32(b).toString(36);
  }

  // ------------------------------------------------------------ paquete
  const DIC = enc.encode('"},"cuerpo":[[0,["{"f":"nom-colab","v":3,"d":{"nombre":"Documento sin título","modo":"PRESENTACION","modo":"DIAGRAMA","modo":"HOJA","modo":"TEXTO","paginas":["p1","p2","p3"],"pagina":{"tam":"carta","orient":"v","margen":{"s":96,"i":96,"iz":96,"d":96}}},"b":{"hoja-p1":{"tipo":"tabla","pagina":"p1","orden":0,"x":40,"y":40,"w":880,"h":300,"filas":30,"cols":10,"c:A1":"","c:B1":"","c:A2":"","n:A1":true,"f:B2":"0.00","aw:A":120},"tipo":"grafica","hoja":"hoja-p1","tipo":"imagen","src":"\\u0001","enTexto":true,"tipo":"forma","figura":"rect","color":"#CFE0FF","borde":"#4A4854","bordeAncho":2,"texto":"","tipo":"conector","de":"","a":"","tipo":"texto","estilo":"h1","estilo":"h2","estilo":"p","html":"<p></p><b></b><i></i><ul><li></li></ul>","pagina":"p2","orden":1,"x":0,"y":0,"w":100,"h":100,"rot":0},"t":{"cuerpo":[[{"estilo":"titulo"},["",{"b":true},"",{"i":true},"",{"u":true},"",{"color":"#000000","tam":12,"fuente":"Arial"},"",0]],[{"lista":"vinetas"},["",0]],[{"lista":"numeros","nivel":1},["",0]],[{"alin":"centro"},["",0]],[{"alin":"just","interlineado":1.5},[{"e":{"tipo":"imagen","ref":""}},0,{"e":{"tipo":"tabla","ref":""}},0]],[0,["',
  );
  function varint(n, out) { while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128); } out.push(n); }
  function leeVarint(u, p) { let n = 0, m = 1, b; do { b = u[p.i++]; n += (b & 127) * m; m *= 128; } while (b & 128); return n; }
  const unir = (trozos) => { const r = new Uint8Array(trozos.reduce((n, t) => n + t.length, 0)); let i = 0; for (const t of trozos) { r.set(t, i); i += t.length; } return r; };

  /**
   * Arma un paquete. `json` es cualquier objeto; `adjuntos` es una lista de
   * { datos: Uint8Array, crudo: true si ya viene comprimido (foto) }.
   */
  function empacar(json, adjuntos, opc) {
    adjuntos = adjuntos || []; opc = opc || {};
    // Un adjunto "crudo" (foto) que aun así se deja comprimir bastante va comprimido aparte (modo 2).
    adjuntos = adjuntos.map((a) => {
      if (!a.crudo || a.datos.length < 4096) return a;
      const c = C().comprimir(a.datos, { nivel: 3 });
      return c.length < a.datos.length * 0.97 ? { datos: c, crudo: true, modo: 2, largo: a.datos.length } : a;
    });
    const cab = Object.assign({}, json, { "~": adjuntos.map((a) => (a.modo === 2 ? [a.datos.length, 2, a.largo] : [a.datos.length, a.crudo ? 1 : 0])) });
    const jb = enc.encode(JSON.stringify(cab)), pre = [];
    varint(jb.length, pre);
    const flujo = unir([new Uint8Array(pre), jb, ...adjuntos.filter((a) => !a.crudo).map((a) => a.datos)]);
    const nivel = flujo.length > 6000000 ? 6 : 9;
    // Dos intentos (ventana normal y grande) y se queda el más chico.
    let comp = C().comprimir(flujo, { nivel, dic: DIC }), banderas = 0;
    if (flujo.length > 20000 && flujo.length < 12000000 && !opc.rapido) {
      const g = C().comprimir(flujo, { nivel, dic: DIC, grande: true });
      if (g.length < comp.length) { comp = g; banderas = 1; }
    }
    const cabeza = [0x4E, 0x4F, 0x4D, 3, banderas];
    varint(comp.length, cabeza);
    const cuerpo = unir([new Uint8Array(cabeza), comp, ...adjuntos.filter((a) => a.crudo).map((a) => a.datos)]);
    const crc = C().crc32(cuerpo), fin = new Uint8Array(4);
    new DataView(fin.buffer).setUint32(0, crc, true);
    return unir([cuerpo, fin]);
  }
  const esPaquete = (u) => !!u && u.length > 9 && u[0] === 0x4E && u[1] === 0x4F && u[2] === 0x4D && u[3] === 3;
  /** Abre un paquete: { json, adjuntos: [Uint8Array] }. Lanza si está dañado. */
  function desempacar(u) {
    if (!esPaquete(u)) throw new Error("No es un archivo de NOM-COLAB");
    const crc = new DataView(u.buffer, u.byteOffset + u.length - 4, 4).getUint32(0, true);
    if (C().crc32(u.subarray(0, u.length - 4)) !== crc) throw new Error("El archivo está dañado (no coincide su suma de comprobación)");
    const p = { i: 5 }, n = leeVarint(u, p);
    const flujo = C().inflar(u.subarray(p.i, p.i + n), { dic: DIC, grande: !!(u[4] & 1) });
    let crudo = p.i + n;
    const q = { i: 0 }, nj = leeVarint(flujo, q);
    const json = JSON.parse(dec.decode(flujo.subarray(q.i, q.i + nj)));
    let dentro = q.i + nj;
    const adjuntos = (json["~"] || []).map(([largo, modo, real]) => {
      if (modo === 1) { const a = u.subarray(crudo, crudo + largo); crudo += largo; return a; }
      if (modo === 2) { const a = C().inflar(u.subarray(crudo, crudo + largo), { tam: real }); crudo += largo; return a; }
      const a = flujo.subarray(dentro, dentro + largo); dentro += largo; return a;
    });
    delete json["~"];
    return { json, adjuntos };
  }

  // ------------------------------------------------------------ cortar XML sin analizarlo todo
  /** Posición del ">" que cierra la etiqueta que empieza en i (los valores entre comillas pueden traer ">"). */
  function finEtiqueta(x, i) {
    let q = 0;
    for (let j = i + 1; j < x.length; j++) {
      const c = x.charCodeAt(j);
      if (q) { if (c === q) q = 0; } else if (c === 34 || c === 39) q = c; else if (c === 62) return j;
    }
    return -1;
  }
  /**
   * Elementos hijos directos dentro de x[ini, fin): [{ n: nombre, i, f, ci, cf }]
   * (i..f = el elemento completo; ci..cf = su contenido; ci === cf si es <vacío/>).
   */
  function hijosXml(x, ini, fin) {
    const r = [];
    let i = ini == null ? 0 : ini;
    fin = fin == null ? x.length : fin;
    while (i < fin) {
      const lt = x.indexOf("<", i);
      if (lt < 0 || lt >= fin) break;
      const c1 = x.charCodeAt(lt + 1);
      if (c1 === 33) {   // <!-- --> o <![CDATA[ ]]> o <!DOCTYPE
        if (x.startsWith("<!--", lt)) { const k = x.indexOf("-->", lt + 4); i = k < 0 ? fin : k + 3; }
        else if (x.startsWith("<![CDATA[", lt)) { const k = x.indexOf("]]>", lt + 9); i = k < 0 ? fin : k + 3; }
        else { const k = finEtiqueta(x, lt); i = k < 0 ? fin : k + 1; }
        continue;
      }
      if (c1 === 63) { const k = x.indexOf("?>", lt + 2); i = k < 0 ? fin : k + 2; continue; }
      if (c1 === 47) break;   // cierre del padre
      const gt = finEtiqueta(x, lt);
      if (gt < 0) break;
      let e = lt + 1;
      while (e < gt) { const c = x.charCodeAt(e); if (c === 32 || c === 47 || c === 9 || c === 10 || c === 13) break; e++; }
      const nombre = x.slice(lt + 1, e);
      if (x.charCodeAt(gt - 1) === 47) { r.push({ n: nombre, i: lt, f: gt + 1, ci: gt + 1, cf: gt + 1, a: e, af: gt - 1 }); i = gt + 1; continue; }
      // buscar su cierre contando niveles
      let prof = 1, j = gt + 1, cf = -1, f = -1;
      while (prof > 0) {
        const l2 = x.indexOf("<", j);
        if (l2 < 0) break;
        const d1 = x.charCodeAt(l2 + 1);
        if (d1 === 33) {
          if (x.startsWith("<!--", l2)) { const k = x.indexOf("-->", l2 + 4); j = k < 0 ? x.length : k + 3; }
          else if (x.startsWith("<![CDATA[", l2)) { const k = x.indexOf("]]>", l2 + 9); j = k < 0 ? x.length : k + 3; }
          else { const k = finEtiqueta(x, l2); j = k < 0 ? x.length : k + 1; }
          continue;
        }
        if (d1 === 63) { const k = x.indexOf("?>", l2 + 2); j = k < 0 ? x.length : k + 2; continue; }
        const g2 = d1 === 47 ? x.indexOf(">", l2) : finEtiqueta(x, l2);
        if (g2 < 0) break;
        if (d1 === 47) { prof--; if (!prof) { cf = l2; f = g2 + 1; } }
        else if (x.charCodeAt(g2 - 1) !== 47) prof++;
        j = g2 + 1;
      }
      if (f < 0) break;
      r.push({ n: nombre, i: lt, f, ci: gt + 1, cf, a: e, af: gt });
      i = f;
    }
    return r;
  }
  /** Primer hijo con ese nombre (con o sin prefijo: "body" encuentra "w:body"). */
  const local = (n) => { const k = n.indexOf(":"); return k < 0 ? n : n.slice(k + 1); };
  function hijoXml(x, nombre, ini, fin) { return hijosXml(x, ini, fin).find((h) => local(h.n) === nombre) || null; }
  /** Valor de un atributo dentro del texto de atributos de una etiqueta. */
  function attr(x, h, nombre) {
    const s = x.slice(h.a, h.af), m = new RegExp("(?:^|\\s)" + nombre.replace(/[.:]/g, "\\$&") + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')').exec(s);
    return m ? desescapar(m[1] != null ? m[1] : m[2]) : null;
  }
  const desescapar = (s) => s.replace(/&(lt|gt|amp|quot|apos|#x?[0-9a-fA-F]+);/g, (m, k) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[k] || String.fromCodePoint(k[1] === "x" || k[1] === "X" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10))));

  // ------------------------------------------------------------ el archivo de origen dentro del documento
  const BLOQUE = "_origen", TROZO = 240000, MAX_ORIGEN = 14 * 1024 * 1024;
  /** Sube cuando cambia lo que el importador saca de un archivo (las huellas viejas dejan de valer). */
  const VERSION_IMPORTADOR = 1;
  const YA_COMPRIMIDO = /\.(png|jpe?g|gif|webp|mp4|m4a|mp3|wmv|avi|zip|odttf)$/i;

  // ---- imágenes incrustadas (data:…;base64,…) ↔ adjuntos binarios
  const ES_DATOS = /^data:([a-z0-9.+\/-]+);base64,/i;
  const huellaBytes = (u) => u.length + ":" + C().crc32(u);
  /**
   * Copia de `v` con cada imagen incrustada cambiada por una marca corta: sus bytes van a
   * `adjuntos` ("\u0001índice|mime"), o, si son los mismos de una parte del archivo de origen,
   * solo se anota cuál ("\u0002nombre|mime"). Así cada imagen se guarda una sola vez y sin base64.
   */
  function sacarDatos(v, adjuntos, enOrigen, vistos) {
    if (typeof v === "string") {
      if (v.length < 40 || v.charCodeAt(0) !== 100) return v;
      const m = ES_DATOS.exec(v);
      if (!m) return v;
      let u;
      try { u = deB64(v.slice(m[0].length)); } catch (e) { return v; }
      const h = huellaBytes(u);
      if (enOrigen && enOrigen.has(h)) return "\u0002" + enOrigen.get(h) + "|" + m[1];
      if (!vistos.has(h)) { vistos.set(h, adjuntos.length); adjuntos.push({ datos: u, crudo: /png|jpe?g|gif|webp/i.test(m[1]) }); }
      return "\u0001" + vistos.get(h) + "|" + m[1];
    }
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => sacarDatos(x, adjuntos, enOrigen, vistos));
    const o = {};
    for (const k in v) o[k] = sacarDatos(v[k], adjuntos, enOrigen, vistos);
    return o;
  }
  /** Lo contrario: vuelve a poner las imágenes como data:…;base64. */
  function meterDatos(v, adjuntos, partes) {
    if (typeof v === "string") {
      const c = v.charCodeAt(0);
      if (c !== 1 && c !== 2) return v;
      const k = v.lastIndexOf("|"), clave = v.slice(1, k), mime = v.slice(k + 1);
      const u = c === 1 ? adjuntos[+clave] : partes && partes.get(clave);
      return u ? "data:" + mime + ";base64," + aB64(u) : "";
    }
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => meterDatos(x, adjuntos, partes));
    const o = {};
    for (const k in v) o[k] = meterDatos(v[k], adjuntos, partes);
    return o;
  }
  // ------------------------------------------------------------ leer un .zip (síncrono)
  /**
   * Abre un .zip en memoria: { nombres, tiene(n), bytes(n), texto(n) }. Descomprime cada parte la
   * primera vez que se pide (con el descompresor propio, así funciona igual en cualquier WebView).
   */
  function abrirZip(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let fin = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    if (fin < 0) throw new Error("El archivo no es un documento de Office válido (no es un zip)");
    const n = dv.getUint16(fin + 10, true);
    let off = dv.getUint32(fin + 16, true);
    const entradas = new Map(), listos = new Map();
    for (let k = 0; k < n; k++) {
      if (off + 46 > u8.length || dv.getUint32(off, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(off + 10, true), crc = dv.getUint32(off + 16, true), comp = dv.getUint32(off + 20, true), tam = dv.getUint32(off + 24, true);
      const ln = dv.getUint16(off + 28, true), le = dv.getUint16(off + 30, true), lc = dv.getUint16(off + 32, true), loc = dv.getUint32(off + 42, true);
      const nombre = dec.decode(u8.subarray(off + 46, off + 46 + ln));
      if (loc + 30 <= u8.length) {
        const ini = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
        if (!nombre.endsWith("/")) entradas.set(nombre, { metodo, crc, datos: u8.subarray(ini, ini + comp), tam });
      }
      off += 46 + ln + le + lc;
    }
    function bytes(nombre) {
      if (listos.has(nombre)) return listos.get(nombre);
      const e = entradas.get(nombre);
      if (!e) return null;
      let r;
      if (e.metodo === 0) r = e.datos;
      else if (e.metodo === 8) {
        // Una parte dañada (Office la abre igual, sin esa parte): se lee como si no estuviera y, al
        // escribir el archivo otra vez, se copia tal cual venía (crudo). Antes una sola parte así
        // tumbaba la exportación fiel y el .nom.
        try { r = C().inflar(e.datos, { tam: e.tam }); }
        catch (x) { e.danada = true; console.warn("Parte dañada en el archivo de Office:", nombre); r = null; }
      } else throw new Error("Compresión no soportada en " + nombre);
      listos.set(nombre, r);
      return r;
    }
    /** Las partes que no se pudieron descomprimir, para copiarlas sin tocar: { datos (comprimidos), crc, tam }. */
    function crudo(nombre) {
      const e = entradas.get(nombre);
      if (!e) return null;
      if (!listos.has(nombre)) bytes(nombre);
      return e.danada ? { datos: e.datos, crc: e.crc, tam: e.tam } : null;
    }
    const z = { entradas, nombres: () => [...entradas.keys()], tiene: (nm) => entradas.has(nm), bytes, crudo, texto: (nm) => { const b = bytes(nm); return b ? dec.decode(b) : null; } };
    // nombres de antes (los lectores de Office los usan con await; devolver el valor directo también sirve)
    z.leer = bytes;
    return z;
  }

  // ------------------------------------------------------------ el archivo de origen dentro del documento
  /**
   * Operaciones que guardan en el documento el archivo de Office del que vino: los bytes tal cual
   * (en trozos) y `huellas`, que dicen cómo quedó cada parte recién importada. Con eso, al
   * exportar se sabe qué cambió la persona y qué se puede sacar idéntico del original.
   * Devuelve [] si el archivo es demasiado grande para llevarlo dentro.
   */
  function crearOps(fmt, archivo, huellas) {
    if (!archivo || archivo.length > MAX_ORIGEN) return [];
    const b64 = aB64(archivo), ops = [], n = Math.ceil(b64.length / TROZO);
    ops.push({ id: "imp:og", bloque: BLOQUE, campos: { tipo: "origen", fmt, n, tam: archivo.length, iv: VERSION_IMPORTADOR, h: JSON.stringify(huellas || {}) }, t: 1, n: "importar" });
    for (let i = 0; i < n; i++) ops.push({ id: "imp:og" + i, bloque: BLOQUE, campos: { ["p" + i]: b64.slice(i * TROZO, (i + 1) * TROZO) }, t: 1, n: "importar" });
    return ops;
  }
  /** Los bytes del archivo original, o null. */
  function bytesDe(doc) {
    const b = doc.estado && doc.estado.bloques && doc.estado.bloques[BLOQUE];
    if (!b || !b.n || !doc.vivo(BLOQUE)) return null;
    const n = +b.n.v || 0;
    let s = "";
    for (let i = 0; i < n; i++) { const p = b["p" + i]; if (!p || typeof p.v !== "string") return null; s += p.v; }
    try { return deB64(s); } catch (e) { return null; }
  }
  /** El original abierto: { fmt, h (huellas), iv, zip, archivo } o null si el documento no vino de Office. */
  function leer(doc) {
    const b = doc.estado && doc.estado.bloques && doc.estado.bloques[BLOQUE];
    if (!b || !b.n || !doc.vivo(BLOQUE)) return null;
    const clave = (b.n.v || 0) + ":" + (b.tam ? b.tam.v : 0) + ":" + (b.p0 ? b.p0.t + "@" + b.p0.n : "");
    if (doc._origen && doc._origen.clave === clave) return doc._origen.valor;
    let valor = null;
    try {
      const u = bytesDe(doc);
      if (u) {
        let h = {};
        try { h = JSON.parse((b.h && b.h.v) || "{}"); } catch (e) { h = {}; }
        valor = { fmt: b.fmt ? b.fmt.v : "", iv: b.iv ? b.iv.v : 0, h, archivo: u, zip: abrirZip(u) };
      }
    } catch (e) { valor = null; }
    doc._origen = { clave, valor };
    return valor;
  }
  /** Quita el original del documento (por ejemplo, para que pese menos). */
  const quitarOp = () => ({ bloque: BLOQUE, campos: { eliminado: true } });

  NOM.paquete = { empacar, desempacar, esPaquete, aB64, deB64 };
  NOM.origen = { BLOQUE, VERSION_IMPORTADOR, crearOps, sacarDatos, meterDatos, abrirZip, leer, bytesDe, huellaBytes, huella, estable, hijosXml, hijoXml, attr, finEtiqueta, local, desescapar, quitarOp, YA_COMPRIMIDO };
  if (typeof module !== "undefined" && module.exports) module.exports = { paquete: NOM.paquete, origen: NOM.origen };
})();
