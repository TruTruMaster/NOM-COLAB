/* NOM-COLAB · Bóveda local cifrada por cuenta.
   Todo lo que se guarda bajo "nom.u.<cuenta>." (copias de documentos, cambios sin enviar,
   documentos de este equipo, recientes) vive cifrado en IndexedDB. Nada de eso toca
   localStorage en claro.

   - Cada cuenta tiene una llave de datos aleatoria (256 bits), guardada envuelta con una llave
     derivada de su contraseña (PBKDF2). Sin la contraseña no se puede desenvolver.
   - Al iniciar sesión se desenvuelve y se conserva solo mientras la sesión está abierta
     (para no pedir la contraseña en cada recarga). Al cerrar sesión o al vencer, se borra:
     desde ese momento los datos de la cuenta son ilegibles para cualquiera en el equipo.
   - En memoria se mantiene una copia descifrada para que leer/guardar sigan siendo inmediatos;
     cada escritura se cifra y se persiste en segundo plano.
   - Si la contraseña cambia con la sesión abierta, la llave de datos se envuelve otra vez con la
     nueva (cambiarContrasena) y no se pierde nada. Si cambió sin esta bóveda abierta (se restableció
     con el código de recuperación, o se cambió en otro equipo), la contraseña nueva no la abre: lo
     que solo vivía en este equipo (documentos de aquí y cambios sin enviar) se aparta, todavía
     cifrado, bajo "vieja.<cuenta>.<tanda>." y se recupera escribiendo la contraseña anterior. */
(function () {
  "use strict";
  const NOM = window.NOM;
  const C = NOM.cripto;
  const BD = "nom-boveda", VERSION = 1;
  const leerPlano = NOM.leer, guardarPlano = NOM.guardar, quitarPlano = NOM.quitar;

  let uid = null, llave = null, alg = null;
  const memoria = new Map();          // clave → texto JSON descifrado
  const pendientes = new Map();       // clave → temporizador de escritura
  const borrados = new Set();

  // ------------------------------------------------------------ IndexedDB mínima
  let bdPromesa = null;
  function bd() {
    if (bdPromesa) return bdPromesa;
    bdPromesa = new Promise((ok, mal) => {
      if (!window.indexedDB) return mal(new Error("Este navegador no tiene IndexedDB"));
      const r = indexedDB.open(BD, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("cuentas")) db.createObjectStore("cuentas");   // uid → { sal, alg, envuelta }
        if (!db.objectStoreNames.contains("sesion")) db.createObjectStore("sesion");     // uid → llave de datos (solo con sesión abierta)
        if (!db.objectStoreNames.contains("datos")) db.createObjectStore("datos");       // clave → { uid, alg, iv, ct }
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
    return bdPromesa;
  }
  async function op(almacen, modo, fn) {
    const db = await bd();
    return new Promise((ok, mal) => {
      const tx = db.transaction(almacen, modo), s = tx.objectStore(almacen);
      const r = fn(s);
      tx.oncomplete = () => ok(r && "result" in r ? r.result : undefined);
      tx.onerror = () => mal(tx.error);
      tx.onabort = () => mal(tx.error || new Error("Transacción cancelada"));
    });
  }
  const get = (a, k) => op(a, "readonly", (s) => s.get(k));
  const put = (a, k, v) => op(a, "readwrite", (s) => s.put(v, k));
  const del = (a, k) => op(a, "readwrite", (s) => s.delete(k));
  async function todos(almacen) {
    const db = await bd();
    return new Promise((ok, mal) => {
      const r = [], tx = db.transaction(almacen, "readonly");
      tx.objectStore(almacen).openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { r.push([c.key, c.value]); c.continue(); } };
      tx.oncomplete = () => ok(r); tx.onerror = () => mal(tx.error);
    });
  }

  // ------------------------------------------------------------ abrir y cerrar
  const prefijo = () => "nom.u." + uid + ".";

  /** Al iniciar sesión: desenvuelve (o crea) la llave de datos con la contraseña. */
  async function abrir(usuarioId, contrasena) {
    await cerrar(false);
    let cuenta = await get("cuentas", usuarioId);
    let datosLlave = null;
    if (cuenta) {
      try {
        const kek = await C.llaveDeContrasena(contrasena, cuenta.sal, cuenta.alg);
        datosLlave = await C.descifrar(kek, cuenta.envuelta);
        alg = cuenta.alg;
      } catch (e) {
        // La contraseña ya la validó el servidor; si no abre, la bóveda es de una contraseña
        // anterior. No se borra: se aparta para recuperarla con esa contraseña, y se empieza otra.
        console.warn("Bóveda de una contraseña anterior: se aparta y se crea una nueva", e);
        await apartar(usuarioId, cuenta);
        cuenta = null;
      }
    }
    if (!cuenta) {
      alg = C.algPreferido();
      const sal = C.azar(16);
      datosLlave = C.azar(32);
      const kek = await C.llaveDeContrasena(contrasena, sal, alg);
      await put("cuentas", usuarioId, { sal, alg, envuelta: await C.cifrar(kek, datosLlave, alg) });
    }
    await put("sesion", usuarioId, { llave: datosLlave, alg, ...sesionDeCuenta(usuarioId) });
    await cargar(usuarioId, datosLlave, alg);
    return true;
  }

  /* La sesión (token y usuario) vive en localStorage, pero Chromium lo escribe al disco cuando
     quiere: si el navegador se cierra de golpe (se va la luz, se traba, se mata el proceso), al
     volver no está, y sin Internet ya no se puede iniciar sesión otra vez. IndexedDB sí queda
     escrito, así que una copia va junto a la llave de la bóveda (que ya está ahí sin cifrar) y,
     al abrir, si localStorage la perdió, se toma de aquí. Cerrar sesión borra el registro entero. */
  function sesionDeCuenta(usuarioId) {
    const token = leerPlano("nom.token", null), usuario = leerPlano("nom.usuario", null);
    return token && usuario && usuario.id === usuarioId ? { token, usuario, t: Date.now() } : {};
  }

  /** Lo llama api.fijarSesion: si la bóveda de esa cuenta está abierta, actualiza la copia. */
  async function recordarSesion(token, usuario) {
    try {
      if (!usuario || usuario.id !== uid) return;
      const s = await get("sesion", uid);
      if (s && (s.token !== token || JSON.stringify(s.usuario) !== JSON.stringify(usuario))) await put("sesion", uid, { ...s, token, usuario, t: Date.now() });
    } catch (e) { /* sin IndexedDB */ }
  }

  /** Lo llama api.limpiarSesion: ninguna copia del token se queda en el equipo. */
  async function soltarSesion() {
    try {
      for (const [k, s] of await todos("sesion")) if (s && s.token) { const { token, usuario, t, ...resto } = s; await put("sesion", k, resto); }
    } catch (e) { /* sin IndexedDB */ }
  }

  /** Al abrir la página sin token en localStorage: la sesión más reciente que quedó en IndexedDB. */
  async function rescatarSesion() {
    try {
      let mejor = null;
      for (const [k, s] of await todos("sesion")) if (s && s.token && s.usuario && s.usuario.id === k && (!mejor || (s.t || 0) > (mejor.t || 0))) mejor = s;
      return mejor ? { token: mejor.token, usuario: mejor.usuario } : null;
    } catch (e) { return null; }
  }

  /** Al recargar la página con la sesión abierta. false = hay que volver a escribir la contraseña. */
  async function reanudar(usuarioId) {
    try {
      const s = await get("sesion", usuarioId);
      if (!s) return false;
      await cargar(usuarioId, s.llave, s.alg);
      return true;
    } catch (e) {
      console.warn("No se pudo reanudar la bóveda", e);
      return false;
    }
  }

  async function cargar(usuarioId, k, a) {
    uid = usuarioId; llave = k; alg = a;
    memoria.clear();
    const p = prefijo();
    for (const [clave, sobre] of await todos("datos")) {
      if (!clave.startsWith(p)) continue;
      try { memoria.set(clave, C.texto(await C.descifrar(llave, sobre))); }
      catch (e) { console.warn("Registro ilegible descartado:", clave); await del("datos", clave); }
    }
    // Datos que quedaron en claro de versiones anteriores: se cifran y se borran de localStorage.
    try {
      Object.keys(localStorage).filter((k2) => k2.startsWith(p)).forEach((k2) => {
        const v = localStorage.getItem(k2);
        if (!memoria.has(k2) && v != null) { memoria.set(k2, v); programar(k2); }
        localStorage.removeItem(k2);
      });
    } catch (e) { /* sin localStorage */ }
  }

  /** Al cerrar sesión: guarda lo pendiente y olvida la llave. Los datos quedan cifrados. */
  async function cerrar(olvidar = true) {
    if (!uid) return;
    await vaciar();
    if (olvidar) { try { await del("sesion", uid); } catch (e) { /* sin IndexedDB */ } }
    memoria.clear(); uid = null; llave = null; alg = null;
  }

  async function borrarDatosDe(usuarioId) {
    const p = "nom.u." + usuarioId + ".";
    for (const [k] of await todos("datos")) if (k.startsWith(p)) await del("datos", k);
  }

  // ------------------------------------------------------------ lo guardado con una contraseña anterior
  const VIEJA = "vieja.";
  /** Lo único que no está también en el servidor: los documentos de este equipo y lo no enviado. */
  const valioso = (resto) => resto.startsWith("local.") || resto.startsWith("cola.");
  /** Una cola sin cambios cifrada ("[]") mide 2 bytes más la etiqueta: no hay nada que rescatar. */
  const vacio = (sobre) => !sobre || !sobre.ct || sobre.ct.length <= (sobre.alg === "gcm" ? 18 : 34);

  /** Aparta, sin descifrar, lo que la contraseña nueva no abre. Las copias de consulta se borran. */
  async function apartar(usuarioId, cuenta) {
    const p = "nom.u." + usuarioId + ".", tanda = Date.now().toString(36);
    let n = 0;
    const destino = VIEJA + usuarioId + "." + tanda + ".";
    for (const [k, sobre] of await todos("datos")) {
      if (!k.startsWith(p)) continue;
      const resto = k.slice(p.length);
      // El índice de documentos acompaña a los documentos, pero solo no cuenta como algo que rescatar.
      if (resto === "local.docs") await put("datos", destino + resto, sobre);
      else if (valioso(resto) && !(resto.startsWith("cola.") && vacio(sobre))) { await put("datos", destino + resto, sobre); n++; }
      await del("datos", k);
    }
    // Sin documentos ni cambios no hay nada que recuperar: tampoco se guarda la llave vieja.
    if (n) await put("cuentas", VIEJA + usuarioId + "." + tanda, cuenta);
    else await del("datos", destino + "local.docs");
    await del("cuentas", usuarioId);
  }

  /** Tandas apartadas de la cuenta abierta: [{ tanda, cuenta, registros: [[resto, sobre]] }]. */
  async function viejas() {
    if (!uid) return [];
    const p = VIEJA + uid + ".", r = new Map();
    for (const [k, cuenta] of await todos("cuentas")) if (typeof k === "string" && k.startsWith(p)) r.set(k.slice(p.length), { tanda: k.slice(p.length), cuenta, registros: [] });
    for (const [k, sobre] of await todos("datos")) {
      if (!k.startsWith(p)) continue;
      const i = k.indexOf(".", p.length), t = r.get(k.slice(p.length, i));
      if (t) t.registros.push([k.slice(i + 1), sobre]);
    }
    return [...r.values()];
  }

  /** Cuántos documentos de este equipo y cuántos con cambios sin enviar quedaron de una contraseña anterior. */
  async function porRecuperar() {
    let docs = 0, colas = 0;
    try {
      for (const t of await viejas()) for (const [resto] of t.registros) {
        if (resto.startsWith("local.doc.")) docs++; else if (resto.startsWith("cola.")) colas++;
      }
    } catch (e) { console.warn("No se pudo revisar la bóveda anterior", e); }
    return { docs, colas, hay: docs + colas > 0 };
  }

  async function borrarTanda(t) {
    const p = VIEJA + uid + "." + t.tanda;
    for (const [resto] of t.registros) await del("datos", p + "." + resto);
    await del("cuentas", p);
  }

  /**
   * Con la contraseña anterior: descifra lo apartado y lo pasa a la bóveda actual. Los documentos
   * de este equipo vuelven a la lista y los cambios sin enviar se ponen antes de los de ahora.
   * Lanza un error si la contraseña no abre ninguna de las tandas apartadas.
   */
  async function recuperarCon(contrasenaAnterior) {
    if (!uid) throw new Error("Primero inicia sesión");
    const p = prefijo(), res = { docs: 0, cambios: 0, quedan: 0 };
    let abiertas = 0;
    for (const t of await viejas()) {
      let k;
      try { k = await C.descifrar(await C.llaveDeContrasena(contrasenaAnterior, t.cuenta.sal, t.cuenta.alg), t.cuenta.envuelta); }
      catch (e) { res.quedan++; continue; }
      abiertas++;
      const leer = async (sobre) => { try { return JSON.parse(C.texto(await C.descifrar(k, sobre))); } catch (e) { return undefined; } };
      const indiceViejo = new Map();
      for (const [resto, sobre] of t.registros) if (resto === "local.docs") ((await leer(sobre)) || []).forEach((d) => d && d.id && indiceViejo.set(d.id, d));
      const indice = NOM.leer(p + "local.docs", []) || [];
      for (const [resto, sobre] of t.registros) {
        const v = await leer(sobre);
        if (v === undefined) continue;
        if (resto.startsWith("local.doc.")) {
          const id = resto.slice("local.doc.".length);
          if (!memoria.has(p + resto)) NOM.guardar(p + resto, v);
          if (!indice.some((d) => d.id === id)) {
            const doc = (v.bloques && v.bloques._doc) || {};
            indice.push(indiceViejo.get(id) || { id, nombre: (doc.nombre && doc.nombre.v) || "Documento recuperado", modo: (doc.modo && doc.modo.v) || "TEXTO", creado: Date.now(), modificado: Date.now() });
          }
          res.docs++;
        } else if (resto.startsWith("cola.") && Array.isArray(v) && v.length) {
          const ahora = NOM.leer(p + resto, []) || [], ya = new Set(ahora.map((o) => o && o.id));
          const antes = v.filter((o) => o && !ya.has(o.id));
          NOM.guardar(p + resto, antes.concat(ahora));
          res.cambios += antes.length;
        }
      }
      if (res.docs) NOM.guardar(p + "local.docs", indice);
      await vaciar();
      await borrarTanda(t);
    }
    if (!abiertas) throw new Error("Esa no es la contraseña con la que se guardaron");
    return res;
  }

  /** Borra para siempre lo apartado (la persona decidió no recuperarlo). */
  async function descartarVieja() { for (const t of await viejas()) await borrarTanda(t); }

  /**
   * La contraseña cambió con la sesión abierta: la misma llave de datos se envuelve con la nueva,
   * así lo guardado en este equipo sigue abriendo.
   */
  async function cambiarContrasena(nueva) {
    if (!uid || !llave) return false;
    const sal = C.azar(16), kek = await C.llaveDeContrasena(nueva, sal, alg);
    await put("cuentas", uid, { sal, alg, envuelta: await C.cifrar(kek, llave, alg) });
    return true;
  }

  /** Borra de este equipo todo lo de una cuenta (al borrar la cuenta): datos, llaves y lo apartado. */
  async function olvidarCuenta(usuarioId) {
    if (uid === usuarioId) { [...pendientes.values()].forEach(clearTimeout); pendientes.clear(); memoria.clear(); uid = null; llave = null; alg = null; }
    await borrarDatosDe(usuarioId);
    for (const [k] of await todos("datos")) if (k.startsWith(VIEJA + usuarioId + ".")) await del("datos", k);
    for (const [k] of await todos("cuentas")) if (k === usuarioId || (typeof k === "string" && k.startsWith(VIEJA + usuarioId + "."))) await del("cuentas", k);
    await del("sesion", usuarioId);
  }

  // ------------------------------------------------------------ escritura en segundo plano
  function programar(k) {
    clearTimeout(pendientes.get(k));
    pendientes.set(k, setTimeout(() => persistir(k), 300));
  }
  async function persistir(k) {
    pendientes.delete(k);
    if (!llave || !k.startsWith(prefijo())) return;
    try {
      if (!memoria.has(k)) { await del("datos", k); return; }
      const s = await C.cifrar(llave, C.bytes(memoria.get(k)), alg);
      await put("datos", k, s);
    } catch (e) {
      console.error("No se pudo guardar cifrado", k, e);
      if (!persistir.avisado) { persistir.avisado = true; NOM.aviso && NOM.aviso("No hay espacio para guardar en este equipo. Libera espacio en “" + NOM.etiquetaEquipo() + "”.", { tipo: "error", ms: 7000 }); }
    }
  }
  async function vaciar() {
    const ks = [...pendientes.keys()];
    ks.forEach((k) => clearTimeout(pendientes.get(k)));
    await Promise.all(ks.map(persistir));
  }
  addEventListener("pagehide", () => { vaciar(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") vaciar(); });

  // ------------------------------------------------------------ leer / guardar / quitar
  const esCuenta = (k) => typeof k === "string" && k.startsWith("nom.u.");
  NOM.leer = (k, def) => {
    if (!esCuenta(k)) return leerPlano(k, def);
    if (!uid || !k.startsWith(prefijo()) || !memoria.has(k)) return def;
    try { return JSON.parse(memoria.get(k)); } catch (e) { return def; }
  };
  NOM.guardar = (k, v) => {
    if (!esCuenta(k)) return guardarPlano(k, v);
    if (!uid || !k.startsWith(prefijo())) return false;   // nunca se escribe en claro
    memoria.set(k, JSON.stringify(v)); programar(k);
    return true;
  };
  NOM.quitar = (k) => {
    if (!esCuenta(k)) return quitarPlano(k);
    if (!uid || !k.startsWith(prefijo())) return;
    memoria.delete(k); programar(k);
  };

  NOM.boveda = {
    abrir, reanudar, cerrar, vaciar, recordarSesion, soltarSesion, rescatarSesion,
    porRecuperar, recuperarCon, descartarVieja, cambiarContrasena, olvidarCuenta,
    activa: () => uid,
    cifrado: () => (alg === "gcm" ? "AES-256-GCM" : alg === "ctr" ? "AES-256-CTR + HMAC-SHA256" : null),
    /** Claves de la cuenta abierta que empiezan con este prefijo. */
    claves: (p) => (uid ? [...memoria.keys()].filter((k) => k.startsWith(p)) : []),
    /** Bytes que ocupa una entrada (texto cifrado + 28-48 bytes de sobre). */
    tam: (k) => (memoria.has(k) ? new Blob([memoria.get(k)]).size + 40 : 0),
    /** Bytes de otras cuentas guardados en este equipo (ilegibles para la cuenta actual). */
    async ajenos() {
      let n = 0;
      for (const [k, s] of await todos("datos")) if (!uid || !(k.startsWith(prefijo()) || k.startsWith(VIEJA + uid + "."))) n += (s.ct ? s.ct.length : 0) + 40;
      return n;
    },
  };
})();
