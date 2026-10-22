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
     cada escritura se cifra y se persiste en segundo plano. */
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
        // anterior: sus datos son irrecuperables y se empieza una nueva.
        console.warn("Bóveda ilegible con esta contraseña; se crea una nueva", e);
        await borrarDatosDe(usuarioId);
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
    await put("sesion", usuarioId, { llave: datosLlave, alg });
    await cargar(usuarioId, datosLlave, alg);
    return true;
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
      if (!persistir.avisado) { persistir.avisado = true; NOM.aviso && NOM.aviso("No hay espacio para guardar en este equipo. Libera espacio en “Este dispositivo”.", { tipo: "error", ms: 7000 }); }
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
    abrir, reanudar, cerrar, vaciar,
    activa: () => uid,
    cifrado: () => (alg === "gcm" ? "AES-256-GCM" : alg === "ctr" ? "AES-256-CTR + HMAC-SHA256" : null),
    /** Claves de la cuenta abierta que empiezan con este prefijo. */
    claves: (p) => (uid ? [...memoria.keys()].filter((k) => k.startsWith(p)) : []),
    /** Bytes que ocupa una entrada (texto cifrado + 28-48 bytes de sobre). */
    tam: (k) => (memoria.has(k) ? new Blob([memoria.get(k)]).size + 40 : 0),
    /** Bytes de otras cuentas guardados en este equipo (ilegibles para la cuenta actual). */
    async ajenos() {
      let n = 0;
      for (const [k, s] of await todos("datos")) if (!uid || !k.startsWith(prefijo())) n += (s.ct ? s.ct.length : 0) + 40;
      return n;
    },
  };
})();
