/* NOM-COLAB · compresión propia, sin librerías (DEFLATE: LZ77 + Huffman).
   La usan los .zip de Office (.docx, .xlsx y .pptx se guardan comprimidos, como los de Word) y
   el formato propio .nom, que además usa una variante "grande": la misma idea pero con una
   ventana de hasta 4 MB en vez de 32 KB, así encuentra repeticiones lejanas que un .zip no ve.
   Todo es síncrono y funciona igual en el navegador, en la app y en Node (para las pruebas). */
(function () {
  "use strict";
  const G = typeof window !== "undefined" ? window : globalThis;
  const NOM = G.NOM || (G.NOM = {});

  // ------------------------------------------------------------ tablas
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const NDIST = 44;   // 30 en DEFLATE normal (32 KB); 44 en la variante grande (4 MB)
  const DBASE = new Int32Array(NDIST), DEXTRA = new Uint8Array(NDIST);
  for (let d = 0; d < NDIST; d++) {
    if (d < 4) { DBASE[d] = d + 1; DEXTRA[d] = 0; }
    else { const e = (d >> 1) - 1; DEXTRA[d] = e; DBASE[d] = ((2 + (d & 1)) << e) + 1; }
  }
  const ORDEN = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  const COD_LARGO = new Uint8Array(259);
  for (let c = 0; c < 29; c++) for (let l = LBASE[c]; l < (c === 28 ? 259 : LBASE[c + 1]); l++) COD_LARGO[l] = c;
  COD_LARGO[258] = 28;
  const codDist = (dist) => { const x = dist - 1; if (x < 2) return x; const e = 31 - Math.clz32(x); return 2 * e + ((x >> (e - 1)) & 1); };

  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b, c0) {
    let c = (c0 == null ? 0 : c0) ^ 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ------------------------------------------------------------ Huffman
  /** Largos de código (máximo `maxb` bits) para las frecuencias dadas. */
  function largos(frec, n, maxb) {
    const lens = new Uint8Array(n), sims = [];
    for (let i = 0; i < n; i++) if (frec[i]) sims.push(i);
    const m = sims.length;
    if (!m) return lens;
    if (m === 1) { lens[sims[0]] = 1; return lens; }
    sims.sort((a, b) => frec[a] - frec[b] || a - b);
    const w = new Float64Array(2 * m), padre = new Int32Array(2 * m), prof = new Int32Array(2 * m);
    for (let i = 0; i < m; i++) w[i] = frec[sims[i]];
    let i = 0, j = m;
    for (let k = m; k < 2 * m - 1; k++) {
      const a = i < m && (j >= k || w[i] <= w[j]) ? i++ : j++;
      const b = i < m && (j >= k || w[i] <= w[j]) ? i++ : j++;
      w[k] = w[a] + w[b]; padre[a] = k; padre[b] = k;
    }
    const cuenta = new Int32Array(Math.max(maxb + 1, m + 1));
    for (let k = 2 * m - 3; k >= 0; k--) { prof[k] = prof[padre[k]] + 1; if (k < m) cuenta[Math.min(prof[k], maxb)]++; }
    // Si algún código quedó más largo que el máximo, se reparten (igual que miniz/zlib).
    let total = 0;
    for (let l = maxb; l > 0; l--) total += cuenta[l] * Math.pow(2, maxb - l);
    const lleno = Math.pow(2, maxb);
    while (total > lleno) {
      cuenta[maxb]--;
      for (let l = maxb - 1; l > 0; l--) if (cuenta[l]) { cuenta[l]--; cuenta[l + 1] += 2; break; }
      total--;
    }
    let k = m;
    for (let l = 1; l <= maxb; l++) for (let c = cuenta[l]; c > 0; c--) lens[sims[--k]] = l;
    return lens;
  }
  /** Códigos canónicos ya volteados (DEFLATE escribe del bit menos significativo al más). */
  function codigos(lens, n) {
    const cuenta = new Int32Array(16), sig = new Int32Array(16), cod = new Uint16Array(n);
    for (let i = 0; i < n; i++) cuenta[lens[i]]++;
    cuenta[0] = 0;
    for (let l = 1, c = 0; l < 16; l++) { c = (c + cuenta[l - 1]) << 1; sig[l] = c; }
    for (let i = 0; i < n; i++) {
      const l = lens[i];
      if (!l) continue;
      let c = sig[l]++, r = 0;
      for (let b = 0; b < l; b++) { r = (r << 1) | (c & 1); c >>= 1; }
      cod[i] = r;
    }
    return cod;
  }
  const FIJO_LL = (() => { const l = new Uint8Array(288); for (let i = 0; i < 288; i++) l[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8; return l; })();
  const FIJO_D = new Uint8Array(30).fill(5);
  const FIJO_LL_COD = codigos(FIJO_LL, 288), FIJO_D_COD = codigos(FIJO_D, 30);

  // ------------------------------------------------------------ comprimir
  const NIVELES = { 1: [4, 0, 8], 2: [8, 4, 16], 3: [16, 4, 32], 4: [32, 8, 32], 5: [64, 16, 64], 6: [128, 16, 128], 7: [256, 32, 258], 8: [1024, 128, 258], 9: [4096, 258, 258] };

  /**
   * Comprime bytes a DEFLATE crudo (el de los .zip).
   * opc.nivel 1..9 (6 por omisión), opc.grande = ventana de 4 MB (solo lo lee `inflar` con la misma
   * opción), opc.dic = diccionario inicial (bytes que el lector también conoce).
   */
  function comprimir(datos, opc) {
    opc = opc || {};
    const grande = !!opc.grande, [cadenaMax, perezoso, bueno] = NIVELES[opc.nivel || 6] || NIVELES[6];
    let d = datos, ini = 0;
    if (opc.dic && opc.dic.length) { d = new Uint8Array(opc.dic.length + datos.length); d.set(opc.dic); d.set(datos, opc.dic.length); ini = opc.dic.length; }
    const n = d.length;
    let wbits = 15;
    if (grande) while (wbits < 22 && (1 << wbits) < n) wbits++;
    const WTAM = 1 << wbits, WMASK = WTAM - 1, DMAX = WTAM - 1;
    const HBITS = n > 1 << 18 ? 18 : 16, HDESP = 32 - HBITS;
    const cabeza = new Int32Array(1 << HBITS).fill(-1), previo = new Int32Array(WTAM);
    const nd = grande ? NDIST : 30;

    // salida
    let out = new Uint8Array(Math.max(64, (datos.length >> 1) + 64)), op = 0, buf = 0, cnt = 0;
    const crecer = (mas) => { if (op + mas > out.length) { const o = new Uint8Array(Math.max(out.length * 2, op + mas + 64)); o.set(out.subarray(0, op)); out = o; } };
    const pon = (v, nb) => { buf |= v << cnt; cnt += nb; while (cnt >= 8) { out[op++] = buf & 255; buf >>>= 8; cnt -= 8; } };

    // símbolos del bloque en curso
    const BLOQUE = 1 << 16;
    const sl = new Uint16Array(BLOQUE), sd = new Int32Array(BLOQUE);
    let ns = 0, bIni = ini, bBytes = 0;
    const fl = new Uint32Array(286), fd = new Uint32Array(nd);

    function cerrarBloque(ultimo) {
      fl[256]++;
      const ll = largos(fl, 286, 15), dl = largos(fd, nd, 15);
      let hayD = false;
      for (let i = 0; i < nd; i++) if (dl[i]) { hayD = true; break; }
      if (!hayD) dl[0] = 1;
      let hlit = 286; while (hlit > 257 && !ll[hlit - 1]) hlit--;
      let hdist = nd; while (hdist > 1 && !dl[hdist - 1]) hdist--;
      // cabecera dinámica: los largos van a su vez comprimidos (repeticiones 16, 17 y 18)
      const todos = new Uint8Array(hlit + hdist); todos.set(ll.subarray(0, hlit)); todos.set(dl.subarray(0, hdist), hlit);
      const cl = [], fc = new Uint32Array(19);
      for (let i = 0; i < todos.length;) {
        const v = todos[i]; let r = 1;
        while (i + r < todos.length && todos[i + r] === v) r++;
        i += r;
        if (v === 0) {
          while (r >= 11) { const k = Math.min(r, 138); cl.push(18, k - 11); fc[18]++; r -= k; }
          if (r >= 3) { cl.push(17, r - 3); fc[17]++; r = 0; }
          while (r-- > 0) { cl.push(0, 0); fc[0]++; }
        } else {
          cl.push(v, 0); fc[v]++; r--;
          while (r >= 3) { const k = Math.min(r, 6); cl.push(16, k - 3); fc[16]++; r -= k; }
          while (r-- > 0) { cl.push(v, 0); fc[v]++; }
        }
      }
      const cll = largos(fc, 19, 7), clc = codigos(cll, 19);
      let hclen = 19; while (hclen > 4 && !cll[ORDEN[hclen - 1]]) hclen--;
      let bitsDin = 5 + (grande ? 6 : 5) + 4 + 3 * hclen, bitsFijo = 0, extra = 0;
      for (let i = 0; i < 19; i++) bitsDin += fc[i] * (cll[i] + (i === 16 ? 2 : i === 17 ? 3 : i === 18 ? 7 : 0));
      for (let i = 0; i < 286; i++) if (fl[i]) { const e = i > 256 ? LEXTRA[i - 257] : 0; extra += fl[i] * e; bitsDin += fl[i] * ll[i]; bitsFijo += fl[i] * FIJO_LL[i]; }
      for (let i = 0; i < nd; i++) if (fd[i]) { extra += fd[i] * DEXTRA[i]; bitsDin += fd[i] * dl[i]; bitsFijo += fd[i] * 5; }
      bitsDin += extra; bitsFijo += extra;
      const fijoVale = !grande;
      // sin comprimir: relleno hasta el byte, 4 bytes de largo por trozo y los datos tal cual
      const trozos = Math.max(1, Math.ceil(bBytes / 65535));
      const bitsCrudo = ((8 - ((cnt + 3) & 7)) & 7) + 32 * trozos + 8 * bBytes + 3 * (trozos - 1);
      const mejor = Math.min(bitsDin, fijoVale ? bitsFijo : Infinity);
      crecer(((Math.min(mejor, bitsCrudo) + 80) >> 3) + 16);
      if (bitsCrudo < mejor) {
        // sin comprimir (datos que ya venían comprimidos): bloques de hasta 65535 bytes
        let p = bIni, q = bBytes;
        do {
          const k = Math.min(q, 65535);
          pon(ultimo && q === k ? 1 : 0, 3);
          if (cnt) pon(0, 8 - cnt);
          crecer(k + 8);
          out[op++] = k & 255; out[op++] = k >> 8; out[op++] = ~k & 255; out[op++] = (~k >> 8) & 255;
          out.set(d.subarray(p, p + k), op); op += k; p += k; q -= k;
        } while (q > 0);
      } else {
        let lc, dc, lls, dls;
        if (fijoVale && bitsFijo <= bitsDin) { pon(ultimo ? 3 : 2, 3); lc = FIJO_LL_COD; dc = FIJO_D_COD; lls = FIJO_LL; dls = FIJO_D; }
        else {
          pon(ultimo ? 5 : 4, 3);
          pon(hlit - 257, 5); pon(hdist - 1, grande ? 6 : 5); pon(hclen - 4, 4);
          for (let i = 0; i < hclen; i++) pon(cll[ORDEN[i]], 3);
          for (let i = 0; i < cl.length; i += 2) { const s = cl[i]; pon(clc[s], cll[s]); if (s === 16) pon(cl[i + 1], 2); else if (s === 17) pon(cl[i + 1], 3); else if (s === 18) pon(cl[i + 1], 7); }
          lc = codigos(ll, 286); dc = codigos(dl, nd); lls = ll; dls = dl;
        }
        for (let i = 0; i < ns; i++) {
          const dist = sd[i], v = sl[i];
          if (!dist) { pon(lc[v], lls[v]); continue; }
          const c = COD_LARGO[v];
          pon(lc[257 + c], lls[257 + c]);
          if (LEXTRA[c]) pon(v - LBASE[c], LEXTRA[c]);
          const k = codDist(dist);
          pon(dc[k], dls[k]);
          if (DEXTRA[k]) pon(dist - DBASE[k], DEXTRA[k]);
        }
        pon(lc[256], lls[256]);
      }
      bIni += bBytes; bBytes = 0; ns = 0; fl.fill(0); fd.fill(0);
    }

    const hash = (i) => Math.imul(d[i] | (d[i + 1] << 8) | (d[i + 2] << 16), 0x9E3779B1) >>> HDESP;
    for (let i = Math.max(0, ini - DMAX); i + 2 < ini && i + 2 < n; i++) { const h = hash(i); previo[i & WMASK] = cabeza[h]; cabeza[h] = i; }

    let i = ini, pl = 0, pd = 0, pendiente = false;
    while (i < n) {
      let ml = 0, md = 0;
      if (i + 2 < n) {
        const h = hash(i);
        let cand = cabeza[h];
        previo[i & WMASK] = cand; cabeza[h] = i;
        if (pl < perezoso || !pl) {
          const tope = Math.min(258, n - i);
          let mejor = pl >= 3 ? pl : 2, cadena = pl >= 32 ? cadenaMax >> 2 : cadenaMax;
          const d0 = d[i], d1 = d[i + 1];
          while (cand >= 0 && cadena-- > 0) {
            const dist = i - cand;
            if (dist > DMAX) break;
            if (mejor < tope && d[cand + mejor] === d[i + mejor] && d[cand] === d0 && d[cand + 1] === d1) {
              let l = 2;
              while (l < tope && d[cand + l] === d[i + l]) l++;
              // más larga pero mucho más lejos no siempre conviene: la distancia también ocupa bits
              if (l > mejor && (!ml || (l - ml) * 3 > Math.clz32(md) - Math.clz32(dist))) { mejor = l; md = dist; ml = l; if (l >= bueno || l >= tope) break; }
            }
            const sig = previo[cand & WMASK];
            if (sig >= cand) break;
            cand = sig;
          }
          // una coincidencia corta pero lejana cuesta más que escribir las letras
          if (ml === 3 && md > 4096) ml = 0;
          else if (md > 32768 && ml < (md > 262144 ? 8 : 7)) ml = 0;
        }
      }
      if (pl >= 3 && ml <= pl) {
        // la coincidencia que empezó en i-1 es la buena
        sl[ns] = pl; sd[ns++] = pd; fl[257 + COD_LARGO[pl]]++; fd[codDist(pd)]++; bBytes += pl;
        const fin = i - 1 + pl;
        for (let j = i + 1; j < fin; j++) if (j + 2 < n) { const h = hash(j); previo[j & WMASK] = cabeza[h]; cabeza[h] = j; }
        i = fin; pl = 0; pendiente = false;
      } else {
        if (pendiente) { sl[ns] = d[i - 1]; sd[ns++] = 0; fl[d[i - 1]]++; bBytes++; }
        if (perezoso === 0 && ml >= 3) {
          // nivel rápido: sin esperar a ver si la siguiente es mejor
          sl[ns] = ml; sd[ns++] = md; fl[257 + COD_LARGO[ml]]++; fd[codDist(md)]++; bBytes += ml;
          const fin = i + ml;
          for (let j = i + 1; j < fin; j++) if (j + 2 < n) { const h = hash(j); previo[j & WMASK] = cabeza[h]; cabeza[h] = j; }
          i = fin; pl = 0; pendiente = false;
        } else { pl = ml; pd = md; pendiente = true; i++; }
      }
      if (ns >= BLOQUE - 2) cerrarBloque(false);
    }
    if (pendiente) { sl[ns] = d[n - 1]; sd[ns++] = 0; fl[d[n - 1]]++; bBytes++; }
    cerrarBloque(true);
    if (cnt) { crecer(4); pon(0, 8 - cnt); }
    return out.slice(0, op);
  }

  // ------------------------------------------------------------ descomprimir
  /** Tabla de búsqueda directa: los `mb` bits siguientes → (símbolo << 4) | largo. */
  function tabla(lens, n) {
    let mb = 0;
    for (let i = 0; i < n; i++) if (lens[i] > mb) mb = lens[i];
    if (!mb) return { t: new Uint16Array(2), mb: 1 };
    const cod = codigos(lens, n), t = new Uint16Array(1 << mb);
    for (let i = 0; i < n; i++) {
      const l = lens[i];
      if (!l) continue;
      const v = (i << 4) | l, paso = 1 << l;
      for (let k = cod[i]; k < t.length; k += paso) t[k] = v;
    }
    return { t, mb };
  }
  const TAB_FIJA_LL = tabla(FIJO_LL, 288), TAB_FIJA_D = tabla(FIJO_D, 30);

  /** Descomprime DEFLATE crudo. opc.grande y opc.dic tienen que ser los mismos que al comprimir. */
  function inflar(src, opc) {
    opc = opc || {};
    const grande = !!opc.grande, dic = opc.dic && opc.dic.length ? opc.dic : null, base = dic ? dic.length : 0;
    let out = new Uint8Array(base + Math.max(256, opc.tam || src.length * 4)), op = base;
    if (dic) out.set(dic);
    const crecer = (mas) => { if (op + mas > out.length) { const o = new Uint8Array(Math.max(out.length * 2, op + mas)); o.set(out.subarray(0, op)); out = o; } };
    const n = src.length;
    let ip = 0, buf = 0, cnt = 0, ultimo = 0;
    const mal = () => { throw new Error("Los datos comprimidos están dañados"); };
    while (!ultimo) {
      while (cnt < 3) { buf |= src[ip++] << cnt; cnt += 8; }
      ultimo = buf & 1; const tipo = (buf >>> 1) & 3; buf >>>= 3; cnt -= 3;
      if (tipo === 0) {
        ip -= cnt >> 3; buf = 0; cnt = 0;   // se descartan los bits sueltos y se devuelven los bytes enteros ya leídos
        if (ip + 4 > n) mal();
        const k = src[ip] | (src[ip + 1] << 8), nk = src[ip + 2] | (src[ip + 3] << 8);
        if ((k ^ nk) !== 0xFFFF || ip + 4 + k > n) mal();
        ip += 4; crecer(k);
        out.set(src.subarray(ip, ip + k), op); op += k; ip += k;
        continue;
      }
      if (tipo === 3) mal();
      let TL, TD;
      if (tipo === 1) { if (grande) mal(); TL = TAB_FIJA_LL; TD = TAB_FIJA_D; }
      else {
        const bd = grande ? 6 : 5;
        while (cnt < 5 + bd + 4) { buf |= src[ip++] << cnt; cnt += 8; }
        const hlit = (buf & 31) + 257; buf >>>= 5;
        const hdist = (buf & ((1 << bd) - 1)) + 1; buf >>>= bd;
        const hclen = (buf & 15) + 4; buf >>>= 4; cnt -= 9 + bd;
        if (hlit > 286 || hdist > (grande ? NDIST : 30)) mal();
        const cll = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) { while (cnt < 3) { buf |= src[ip++] << cnt; cnt += 8; } cll[ORDEN[i]] = buf & 7; buf >>>= 3; cnt -= 3; }
        const tc = tabla(cll, 19), mc = (1 << tc.mb) - 1, todos = new Uint8Array(hlit + hdist);
        for (let i = 0; i < todos.length;) {
          while (cnt < 14) { buf |= src[ip++] << cnt; cnt += 8; }
          const e = tc.t[buf & mc], l = e & 15, s = e >>> 4;
          if (!l) mal();
          buf >>>= l; cnt -= l;
          if (s < 16) todos[i++] = s;
          else {
            let rep, v = 0;
            if (s === 16) { if (!i) mal(); v = todos[i - 1]; rep = 3 + (buf & 3); buf >>>= 2; cnt -= 2; }
            else if (s === 17) { rep = 3 + (buf & 7); buf >>>= 3; cnt -= 3; }
            else { rep = 11 + (buf & 127); buf >>>= 7; cnt -= 7; }
            if (i + rep > todos.length) mal();
            while (rep-- > 0) todos[i++] = v;
          }
        }
        TL = tabla(todos.subarray(0, hlit), hlit); TD = tabla(todos.subarray(hlit), hdist);
      }
      const tl = TL.t, ml = (1 << TL.mb) - 1, td = TD.t, mdm = (1 << TD.mb) - 1;
      for (;;) {
        while (cnt <= 24) { buf |= src[ip++] << cnt; cnt += 8; }
        let e = tl[buf & ml], l = e & 15, s = e >>> 4;
        if (!l) mal();
        buf >>>= l; cnt -= l;
        if (s < 256) { if (op >= out.length) crecer(1 + (out.length >> 1)); out[op++] = s; continue; }
        if (s === 256) break;
        s -= 257;
        if (s > 28) mal();
        let largo = LBASE[s];
        const le = LEXTRA[s];
        if (le) { largo += buf & ((1 << le) - 1); buf >>>= le; cnt -= le; }
        while (cnt <= 24) { buf |= src[ip++] << cnt; cnt += 8; }
        e = td[buf & mdm]; l = e & 15; s = e >>> 4;
        if (!l) mal();
        buf >>>= l; cnt -= l;
        let dist = DBASE[s];
        const de = DEXTRA[s];
        if (de) {
          if (cnt < de) { while (cnt <= 24) { buf |= src[ip++] << cnt; cnt += 8; } }
          dist += buf & ((1 << de) - 1); buf >>>= de; cnt -= de;
        }
        if (dist > op) mal();
        if (op + largo > out.length) crecer(largo + (out.length >> 1));
        let p = op - dist;
        if (dist >= largo) { out.set(out.subarray(p, p + largo), op); op += largo; }
        else { const fin = op + largo; while (op < fin) out[op++] = out[p++]; }
      }
      if (ip > n + 4) mal();
    }
    return out.slice(base, op);
  }

  NOM.compresion = { comprimir, inflar, crc32 };
  if (typeof module !== "undefined" && module.exports) module.exports = NOM.compresion;
})();
