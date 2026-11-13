"""Cuentas, almacenamiento y lo guardado en el equipo, en un navegador de verdad.

    pruebas/interfaz/correr.sh ~/capturas prueba_cuentas_equipo

Contra un servidor ya encendido (NOM_BASE, por omisión http://localhost:8099). Revisa:
  1. Dos cuentas en el MISMO navegador: la copia local va cifrada y una no ve nada de la otra.
  2. HTML metido a la fuerza en nombres y documentos no se ejecuta.
  3. Restablecer la contraseña con el código NO pierde lo que solo estaba en el equipo: se
     recupera escribiendo la contraseña anterior (documentos de este equipo y cambios sin enviar).
  4. Cambiar la contraseña desde la cuenta: lo guardado en el equipo sigue abriendo, sin pedir nada.
  5. Cambiarla desde otro equipo: aquí se pide la anterior una vez.
  6. El inicio dice dónde están guardados los espacios y cuánto lleva usado la cuenta.
  7. "Nuevo documento" e "Importar" del inicio preguntan dónde (espacio o solo este equipo).
  8. El canal en vivo abre con un boleto de un solo uso: el token no viaja en ninguna dirección.
  9. Aviso de conexión sin cifrar al entrar por la red local (http y no localhost).
 10. Borrar la cuenta: pide contraseña y nombre, borra lo del servidor y lo de este equipo.
 11. El navegador se cierra de golpe: si localStorage no alcanzó a guardar la sesión, se recupera
     de la copia junto a la llave de la bóveda; cerrar sesión no deja ninguna copia.
Termina con error si algo falla.
"""
import os, sys, tempfile, socket, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nomprueba as N
B, CL = N.B, N.CL
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), "nom-pruebas"); os.makedirs(OUT, exist_ok=True)
N.esperar_servidor()
res = []
def anota(n, ok, det=""):
    res.append((n, bool(ok)))
    print(("  ok   " if ok else "  MAL  ") + n + (f"  -> {str(det)[:300]}" if det != "" and not ok else ""), flush=True)

w = N.Navegador(); p = w.p
pedidas = []
p.on("request", lambda q: pedidas.append(q.url))
def entrar(c, clave=CL, base=B):
    p.goto(base + "/"); p.wait_for_selector("#u", timeout=20000); p.fill("#u", c["nombre"]); p.fill("#c", clave); p.click("button[type=submit]")
    p.wait_for_function("() => !!localStorage.getItem('nom.token')", timeout=30000); p.wait_for_timeout(1200)
def salir():
    p.evaluate("() => { NOM.cerrarHoja(); location.hash = '#/'; }"); p.wait_for_timeout(500)
    p.evaluate("() => NOM.app.cerrarSesion(true)"); p.wait_for_function("() => !localStorage.getItem('nom.token')", timeout=15000); p.wait_for_timeout(800)
def limpio():
    p.evaluate("() => document.querySelectorAll('.bienvenida-momento, .pista').forEach((x) => x.remove())")
def menu_cuenta(texto):
    limpio(); p.evaluate("() => NOM.cerrarHoja()"); p.wait_for_timeout(250)
    p.click(".riel [data-a=cuenta]"); p.wait_for_timeout(300); p.click(f".menu >> text={texto}"); p.wait_for_timeout(500)
def hoja_titulo():
    return p.evaluate("() => { const h = document.querySelector('.hoja #hoja-titulo'); return h ? h.textContent : ''; }")
def esperar_hoja(titulo, ms=9000):
    try: p.wait_for_function("(t) => { const h = document.querySelector('.hoja #hoja-titulo'); return !!h && h.textContent.includes(t); }", arg=titulo, timeout=ms); return True
    except Exception: return False
JS_BD = """async () => { const db = await new Promise((ok, mal) => { const r = indexedDB.open('nom-boveda'); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
  const leer = (a) => new Promise((ok) => { const r = [], tx = db.transaction(a, 'readonly'); tx.objectStore(a).openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { r.push([String(c.key), c.value]); c.continue(); } }; tx.oncomplete = () => ok(r); });
  const dec = new TextDecoder('utf-8', { fatal: false }); const plano = (v) => { try { return v && v.ct ? dec.decode(v.ct) : JSON.stringify(v); } catch (e) { return ''; } };
  const datos = await leer('datos'), sesion = await leer('sesion'), cuentas = await leer('cuentas');
  return { claves: datos.map((d) => d[0]), textoCrudo: datos.map((d) => plano(d[1])).join(' '), sesiones: sesion.map((s) => s[0]), cuentas: cuentas.map((c) => c[0]),
    local: Object.keys(localStorage).map((k) => [k, (localStorage.getItem(k) || '').length]), localTodo: Object.keys(localStorage).map((k) => localStorage.getItem(k)).join(' ') }; }"""
# Copias de consulta de una cuenta (lo que también está en el servidor): ".doc." y ".cache.", pero
# no ".local.doc." (documentos que solo viven en el equipo) ni ".cola." (cambios sin enviar).
def de_consulta(k, uid): return k.startswith("nom.u." + uid + ".doc.") or k.startswith("nom.u." + uid + ".cache.")

# ================================================================== 1. Dos cuentas, un navegador
print("== 1. Dos cuentas en el mismo navegador")
A, Bc = N.cuenta(), N.cuenta()
espA = N.espacio(A["token"], "Espacio de A")
SEC = "SECRETO-EN-EL-SERVIDOR-DE-A"
docA = N.documento(A["token"], espA, "TEXTO", "Reporte privado de A")
entrar(A)
p.goto(B + "/#/doc/" + docA); p.wait_for_selector(".wd-cuerpo", timeout=25000); p.wait_for_timeout(800)
p.click(".wd-cuerpo"); p.keyboard.type(SEC, delay=10); p.wait_for_function("() => NOM.editorActual.doc.pendientes.length === 0", timeout=20000); p.wait_for_timeout(1500)
idLocal = p.evaluate("() => NOM.local.crear('Diario local de A', 'TEXTO').id")
p.goto(B + "/#/local/" + idLocal); p.wait_for_selector(".wd-cuerpo", timeout=20000); p.wait_for_timeout(600)
p.click(".wd-cuerpo"); p.keyboard.type("SECRETO-LOCAL-DE-A", delay=10); p.wait_for_timeout(1800)
p.evaluate("() => { location.hash = '#/'; }"); p.wait_for_timeout(1500)
bd = p.evaluate(JS_BD); uidA = A["id"]
anota("con la sesión abierta, la copia local va cifrada (el texto no está en claro en el disco)", any(".doc." in k or ".local." in k or ".cache." in k for k in bd["claves"]) and "SECRETO" not in bd["textoCrudo"] and "SECRETO" not in bd["localTodo"], bd["claves"][:6])
anota("nombres de documentos o espacios no quedan en claro", "Reporte privado" not in bd["localTodo"] and "Espacio de A" not in bd["localTodo"] and "Diario local" not in bd["localTodo"], bd["local"])
salir()
bd = p.evaluate(JS_BD)
anota("al cerrar sesión se borra la llave de A del equipo", uidA not in bd["sesiones"], bd["sesiones"])
anota("y sus copias de consulta se borran (quedan sus documentos de este equipo y lo no enviado, cifrados)", not any(de_consulta(k, uidA) for k in bd["claves"]) and any(k.startswith("nom.u." + uidA + ".local.doc.") for k in bd["claves"]), [k for k in bd["claves"] if uidA in k])
anota("sin sesión no queda token ni texto en claro", "SECRETO" not in bd["textoCrudo"] and "SECRETO" not in bd["localTodo"] and not any(k == "nom.token" for k, _ in bd["local"]))
entrar(Bc); p.wait_for_timeout(800)
pant = p.evaluate("() => document.body.innerText")
anota("B no ve en pantalla nada de A", "Espacio de A" not in pant and "Reporte privado" not in pant and "Diario local" not in pant, pant[:300])
r = p.evaluate("""async ([doc, esp, uidA]) => { const o = {}; for (const [k, u] of [['doc', '/api/documentos/' + doc], ['esp', '/api/espacios/' + esp], ['docsEsp', '/api/espacios/' + esp + '/documentos']]) { try { await NOM.api.get(u); o[k] = 200; } catch (e) { o[k] = e.estado || String(e); } }
  try { await NOM.api.post('/api/documentos/' + doc + '/ops', { ops: [{ id: 'm1', bloque: '_doc', campos: { nombre: 'hackeado' }, t: 99, n: 'm' }] }); o.escribir = 200; } catch (e) { o.escribir = e.estado || String(e); }
  o.leerBoveda = NOM.leer('nom.u.' + uidA + '.local.docs', 'NADA'); o.locales = NOM.local.lista().length; o.clavesDeA = NOM.boveda.claves('nom.u.' + uidA).length; return o; }""", [docA, espA, uidA])
anota("el servidor le niega a B leer el documento y el espacio de A", r["doc"] in (403, 404) and r["esp"] in (403, 404) and r["docsEsp"] in (403, 404), r)
anota("y le niega escribir en el documento de A", r["escribir"] in (403, 404, 405), r)
anota("la bóveda no le entrega a B nada de A", r["leerBoveda"] == "NADA" and r["locales"] == 0 and r["clavesDeA"] == 0, r)
w.ctx.set_offline(True); p.evaluate("(d) => { location.hash = '#/doc/' + d; }", docA); p.wait_for_timeout(3500)
anota("sin conexión, B tampoco abre la copia guardada del documento de A", SEC not in p.evaluate("() => document.body.innerText"))
p.evaluate("(d) => { location.hash = '#/local/' + d; }", idLocal); p.wait_for_timeout(2500)
anota("ni el documento de este equipo de A", "SECRETO-LOCAL-DE-A" not in p.evaluate("() => document.body.innerText"))
w.ctx.set_offline(False); p.evaluate("() => { location.hash = '#/'; }"); p.wait_for_timeout(800)
salir()
entrar(A); p.wait_for_timeout(800)
l = p.evaluate("() => NOM.local.lista().map((d) => d.nombre)")
anota("A recupera su documento de este equipo al entrar con su contraseña", "Diario local de A" in l, l)
anota("…sin que se le pida ninguna contraseña anterior", not p.evaluate("async () => (await NOM.boveda.porRecuperar()).hay"))
p.goto(B + "/#/doc/" + docA); p.wait_for_selector(".wd-cuerpo", timeout=25000); p.wait_for_timeout(1000)
anota("y su documento del servidor sigue con lo que escribió", SEC in p.evaluate("() => document.querySelector('.wd-cuerpo').innerText"))

# ================================================================== 6. Dónde se guarda y cuánto ocupa
print("== 6. Almacenamiento a la vista")
p.evaluate("() => { location.hash = '#/'; }")
try: p.wait_for_selector(".almacen-linea", timeout=10000)
except Exception: pass
linea = p.evaluate("() => { const b = document.querySelector('.almacen-linea'); return b ? b.innerText.replace(/\\s+/g, ' ') : ''; }")
anota("el inicio dice dónde están guardados los espacios y cuánto lleva usado la cuenta", "Guardados en" in linea and ("MB" in linea or "KB" in linea or " B" in linea) and "documentos de NOM-COLAB" in linea, linea)
p.screenshot(path=os.path.join(OUT, "cuentas-inicio-almacenamiento.png"))
limpio(); p.click(".almacen-linea"); ok = esperar_hoja("Tu almacenamiento"); p.wait_for_timeout(700)
txt = p.evaluate("() => (document.querySelector('.hoja') || document.body).innerText.replace(/\\s+/g, ' ')")
anota("al tocarlo se abre el detalle (por espacio, y que solo se guardan documentos de NOM-COLAB)", ok and "Espacio de A" in txt and "Solo documentos de NOM-COLAB" in txt, txt[:300])
p.screenshot(path=os.path.join(OUT, "cuentas-almacenamiento.png"))
p.evaluate("() => NOM.cerrarHoja()"); p.wait_for_timeout(300)
anota("la barra lateral tiene «En el servidor» junto a lo guardado en el equipo", p.evaluate("() => !!document.querySelector('.riel [data-a=almacen]')"))

# ================================================================== 7. ¿Dónde lo guardamos?
print("== 7. Nuevo documento e Importar del inicio preguntan dónde")
limpio(); p.click("[data-locales] [data-nuevo-local]"); ok = esperar_hoja("¿Dónde creamos el documento?")
opc = p.evaluate("() => [...document.querySelectorAll('.hoja .lista-item b')].map((b) => b.textContent)")
anota("«Nuevo documento» pregunta dónde, con el espacio primero y «Solo en este equipo» después", ok and opc[:1] == ["Espacio de A"] and opc[-1:] == ["Solo en este equipo"], opc)
p.click(".hoja [data-esp]"); ok = esperar_hoja("Nuevo documento"); p.wait_for_timeout(400)
p.fill("#nd", "Creado desde el inicio"); p.click(".hoja-pie [data-crear]")
try: p.wait_for_function("() => location.hash.startsWith('#/doc/')", timeout=15000)
except Exception: pass
anota("…y al elegir el espacio, el documento queda en el servidor", p.evaluate("() => location.hash").startswith("#/doc/") and "Creado desde el inicio" in str(N.api("GET", f"/api/espacios/{espA}", None, A["token"])[1]), p.evaluate("() => location.hash"))
p.evaluate("() => { location.hash = '#/'; }"); p.wait_for_selector("[data-locales] [data-importar-local]", timeout=15000); p.wait_for_timeout(600)
nom_archivo = os.path.join(OUT, "importar-prueba.txt"); open(nom_archivo, "w", encoding="utf-8").write("Primera línea importada\nSegunda línea\n")
limpio()
with p.expect_file_chooser() as fc: p.click("[data-locales] [data-importar-local]")
fc.value.set_files(nom_archivo); ok = esperar_hoja("¿Dónde guardamos lo importado?")
if ok: p.click(".hoja [data-esp]")
try: p.wait_for_function("() => location.hash.startsWith('#/doc/')", timeout=20000)
except Exception: pass
anota("«Importar» también pregunta, y lo importado queda en el espacio", ok and p.evaluate("() => location.hash").startswith("#/doc/"), p.evaluate("() => location.hash"))
p.wait_for_timeout(1200)

# ================================================================== 8. El canal en vivo sin el token en la dirección
print("== 8. Canal en vivo con boleto")
canales = [u for u in pedidas if "/eventos" in u]
anota("los canales en vivo abren con un boleto de un solo uso", len(canales) > 0 and all("boleto=" in u for u in canales if "/api/proyeccion/" not in u), canales[:3])
anota("el token de la sesión no viaja en ninguna dirección", not any("token=" in u for u in pedidas), [u for u in pedidas if "token=" in u][:3])
anota("cada conexión usa un boleto distinto", len(set(canales)) == len(canales), canales[:4])

# ================================================================== 4. Cambiar la contraseña desde la cuenta
print("== 4. Cambiar la contraseña con la sesión abierta")
p.evaluate("() => { location.hash = '#/'; }"); p.wait_for_timeout(900)
NUEVA = "Otra-Clave-Nueva-456"
menu_cuenta("Cambiar contraseña…"); esperar_hoja("Cambiar contraseña")
p.fill("#ca", "no-es-esta"); p.fill("#cn", NUEVA); p.fill("#cr", NUEVA); p.click(".hoja-pie [data-si]"); p.wait_for_timeout(1500)
anota("con la contraseña actual equivocada no cambia y lo dice", "contraseña actual" in p.evaluate("() => (document.querySelector('.hoja [data-alerta]') || {}).innerText || ''"))
p.fill("#ca", CL); p.fill("#cr", NUEVA + "x"); p.click(".hoja-pie [data-si]"); p.wait_for_timeout(500)
anota("si las dos nuevas no coinciden, lo dice", "no son iguales" in p.evaluate("() => (document.querySelector('.hoja [data-alerta]') || {}).innerText || ''"))
p.fill("#cr", NUEVA); p.click(".hoja-pie [data-si]")
try: p.wait_for_function("() => !document.querySelector('.hoja')", timeout=20000)
except Exception: pass
p.wait_for_timeout(800)
anota("con la actual correcta cambia y la sesión de este equipo sigue abierta", p.evaluate("async () => { try { await NOM.api.get('/api/cuentas/yo'); return true; } catch (e) { return false; } }"))
anota("la sesión que tenía en otro equipo se cerró", N.api("GET", "/api/espacios", None, A["token"])[0] == 401)
anota("la contraseña vieja ya no entra", N.api("POST", "/api/cuentas/sesion", {"nombre": A["nombre"], "contrasena": CL})[0] == 401)
salir(); entrar(A, NUEVA); p.wait_for_timeout(2500)
l = p.evaluate("() => NOM.local.lista().map((d) => d.nombre)")
anota("al volver a entrar con la nueva, el documento de este equipo sigue ahí", "Diario local de A" in l, l)
anota("…y no se pide la contraseña anterior", not p.evaluate("async () => (await NOM.boveda.porRecuperar()).hay") and "contraseña anterior" not in hoja_titulo())

# ================================================================== 5. La contraseña cambió en otro equipo
print("== 5. La contraseña cambia desde otro equipo")
# Antes: un cambio sin enviar (escrito sin red) en el documento del servidor.
p.goto(B + "/#/doc/" + docA); p.wait_for_selector(".wd-cuerpo", timeout=25000); p.wait_for_timeout(900)
w.ctx.set_offline(True); p.click(".wd-cuerpo"); p.keyboard.press("Control+End"); p.keyboard.type(" ESCRITO-SIN-RED", delay=10); p.wait_for_timeout(1500)
sin_enviar = p.evaluate("() => NOM.editorActual.doc.pendientes.length")
p.evaluate("() => { location.hash = '#/'; }"); p.wait_for_timeout(600); p.evaluate("() => NOM.app.cerrarSesion(true)"); p.wait_for_timeout(1500); w.ctx.set_offline(False)
otro = N.api("POST", "/api/cuentas/sesion", {"nombre": A["nombre"], "contrasena": NUEVA})[1]["token"]
TERCERA = "Tercera-Clave-789"
anota("(otro equipo) cambia la contraseña", N.api("PUT", "/api/cuentas/contrasena", {"actual": NUEVA, "nueva": TERCERA}, otro)[0] == 200)
entrar(A, TERCERA)
l = p.evaluate("() => NOM.local.lista().map((d) => d.nombre)")
anota("aquí, con la contraseña nueva, lo de este equipo queda apartado (no borrado)", "Diario local de A" not in l and p.evaluate("async () => (await NOM.boveda.porRecuperar()).docs") == 1, l)
ok = esperar_hoja("Guardado con tu contraseña anterior", 12000)
txt = p.evaluate("() => (document.querySelector('.hoja') || document.body).innerText.replace(/\\s+/g, ' ')")
anota("se ofrece recuperarlo, diciendo cuánto hay", ok and "1 documento" in txt and "cambios sin enviar" in txt, txt[:260])
p.screenshot(path=os.path.join(OUT, "cuentas-recuperar-anterior.png"))
p.click(".hoja-pie [data-no]"); p.wait_for_timeout(600)
anota("con «Ahora no» nada se borra", p.evaluate("async () => (await NOM.boveda.porRecuperar()).hay"))
menu_cuenta("Recuperar lo de mi contraseña anterior…"); ok = esperar_hoja("Guardado con tu contraseña anterior")
p.fill("#va", "esta-no-fue"); p.click(".hoja-pie [data-si]"); p.wait_for_timeout(2500)
anota("con una contraseña que no era, lo dice y no pierde nada", ok and "no es la contraseña" in p.evaluate("() => (document.querySelector('.hoja [data-alerta]') || {}).innerText || ''").lower() and p.evaluate("async () => (await NOM.boveda.porRecuperar()).hay"))
p.fill("#va", NUEVA); p.click(".hoja-pie [data-si]")
try: p.wait_for_function("() => !document.querySelector('.hoja')", timeout=20000)
except Exception: pass
p.wait_for_timeout(2500)
l = p.evaluate("() => NOM.local.lista().map((d) => d.nombre)")
anota("con la anterior correcta, el documento de este equipo vuelve", "Diario local de A" in l and not p.evaluate("async () => (await NOM.boveda.porRecuperar()).hay"), l)
p.goto(B + "/#/local/" + idLocal); p.wait_for_selector(".wd-cuerpo", timeout=20000); p.wait_for_timeout(800)
anota("…con su contenido", "SECRETO-LOCAL-DE-A" in p.evaluate("() => document.querySelector('.wd-cuerpo').innerText"))
p.evaluate("() => { location.hash = '#/'; }")
llego = False
for _ in range(20):
    est = N.api("GET", "/api/documentos/" + docA, None, N.api("POST", "/api/cuentas/sesion", {"nombre": A["nombre"], "contrasena": TERCERA})[1]["token"])[1]
    llego = "ESCRITO-SIN-RED" in "".join(e.get("x", "") for e in est.get("estado", {}).get("seq", {}).get("cuerpo", {}).get("ins", []))
    if llego: break
    p.wait_for_timeout(1000)
anota(f"…y los {sin_enviar} cambios que no se habían enviado llegan al servidor", sin_enviar > 0 and llego)

# ================================================================== 3. Restablecer con el código de recuperación
print("== 3. Restablecer la contraseña con el código")
salir()
nombre = "rec" + str(int(time.time()) % 1000000)
st, reg = N.api("POST", "/api/cuentas/registro", {"nombre": nombre, "contrasena": CL}); codigo = reg.get("recuperacion")
R = {"nombre": nombre}
entrar(R)
idR = p.evaluate("() => NOM.local.crear('Solo en este equipo', 'HOJA').id"); p.wait_for_timeout(900)
salir()
p.goto(B + "/"); p.wait_for_selector("[data-olvide]", timeout=20000); p.click("[data-olvide]"); esperar_hoja("Recuperar la contraseña")
txt = p.evaluate("() => (document.querySelector('.hoja') || document.body).innerText.replace(/\\s+/g, ' ')")
anota("al recuperar se avisa qué pasa con lo guardado solo en el equipo", "solo está guardado en un equipo" in txt and "te la pediremos" in txt, txt[:300])
p.fill("#rn", nombre); p.fill("#rk", codigo); p.fill("#rp", NUEVA); p.click(".hoja-pie [data-si]")
ok = esperar_hoja("Tu código de recuperación", 20000)
anota("con el código se pone una contraseña nueva (y da un código nuevo)", ok)
p.evaluate("() => NOM.cerrarHoja()"); p.wait_for_timeout(500)
entrar(R, NUEVA)
ok = esperar_hoja("Guardado con tu contraseña anterior", 12000)
anota("al entrar con la nueva, se ofrece recuperar lo que estaba en el equipo", ok and p.evaluate("async () => (await NOM.boveda.porRecuperar()).docs") == 1)
p.fill("#va", CL); p.click(".hoja-pie [data-si]")
try: p.wait_for_function("() => !document.querySelector('.hoja')", timeout=20000)
except Exception: pass
p.wait_for_timeout(1500)
l = p.evaluate("() => NOM.local.lista().map((d) => d.nombre)")
anota("y con la contraseña anterior vuelve el documento", l == ["Solo en este equipo"], l)
anota("…y aparece en la pantalla de inicio", "Solo en este equipo" in p.evaluate("() => document.body.innerText"))
# Segunda vuelta: restablecer otra vez y elegir «Borrarlos».
salir()
cod2 = N.api("POST", "/api/cuentas/recuperacion", {}, N.api("POST", "/api/cuentas/sesion", {"nombre": nombre, "contrasena": NUEVA})[1]["token"])[1]["recuperacion"]
N.api("POST", "/api/cuentas/recuperar", {"nombre": nombre, "codigo": cod2, "nueva": TERCERA})
entrar(R, TERCERA); ok = esperar_hoja("Guardado con tu contraseña anterior", 12000)
p.click(".hoja-pie [data-borrar]"); ok2 = esperar_hoja("Borrar lo guardado con tu contraseña anterior")
p.click(".hoja-pie [data-si]"); p.wait_for_timeout(1500)
bd = p.evaluate(JS_BD)
anota("«Borrarlos» pide confirmar y entonces sí los borra del equipo", ok and ok2 and not any(k.startswith("vieja.") for k in bd["claves"] + bd["cuentas"]) and p.evaluate("() => NOM.local.lista().length") == 0, [k for k in bd["claves"] if k.startswith("vieja.")])

# ================================================================== 10. Borrar la cuenta
print("== 10. Borrar la cuenta")
tokR = N.api("POST", "/api/cuentas/sesion", {"nombre": nombre, "contrasena": TERCERA})[1]["token"]
espR = N.espacio(tokR, "Se va con la cuenta"); docR = N.documento(tokR, espR, "TEXTO", "Adiós")
uidR = p.evaluate("() => NOM.api.usuario().id")
p.evaluate("() => NOM.local.crear('Local que también se va', 'TEXTO')"); p.wait_for_timeout(900)
menu_cuenta("Borrar mi cuenta…"); ok = esperar_hoja("Borrar mi cuenta"); p.wait_for_timeout(500)
txt = p.evaluate("() => (document.querySelector('.hoja') || document.body).innerText.replace(/\\s+/g, ' ')")
anota("antes de borrar dice qué se borra (su espacio y su documento) y que no se puede deshacer", ok and "tu espacio y su documento" in txt and "No se puede deshacer" in txt, txt[:300])
p.screenshot(path=os.path.join(OUT, "cuentas-borrar.png"))
p.fill("#bc", TERCERA); p.fill("#bn", "otro-nombre"); p.click(".hoja-pie [data-si]"); p.wait_for_timeout(600)
anota("sin escribir bien el nombre no borra", N.api("GET", "/api/cuentas/yo", None, tokR)[0] == 200 and "nombre de usuario" in p.evaluate("() => (document.querySelector('.hoja [data-alerta]') || {}).innerText || ''"))
p.fill("#bn", nombre); p.fill("#bc", "no-es-esta"); p.click(".hoja-pie [data-si]"); p.wait_for_timeout(1500)
anota("con la contraseña equivocada tampoco", N.api("GET", "/api/cuentas/yo", None, tokR)[0] == 200 and "contraseña" in p.evaluate("() => (document.querySelector('.hoja [data-alerta]') || {}).innerText || ''"))
p.fill("#bc", TERCERA); p.click(".hoja-pie [data-si]")
try: p.wait_for_selector("#u", timeout=20000)
except Exception: pass
p.wait_for_timeout(1000)
anota("con nombre y contraseña, la cuenta se borra y se vuelve a la pantalla de entrada", p.evaluate("() => !!document.querySelector('#u') && !localStorage.getItem('nom.token')"))
anota("en el servidor ya no existe (ni su sesión, ni su documento)", N.api("GET", "/api/cuentas/yo", None, tokR)[0] == 401 and N.api("POST", "/api/cuentas/sesion", {"nombre": nombre, "contrasena": TERCERA})[0] == 401)
bd = p.evaluate(JS_BD)
anota("y en este equipo no queda nada suyo", not any(uidR in k for k in bd["claves"] + bd["cuentas"] + bd["sesiones"]), [k for k in bd["claves"] + bd["cuentas"] if uidR in k])

# ================================================================== 2. HTML metido a la fuerza
print("== 2. Contenido malicioso guardado por un miembro (XSS)")
antes_xss = len(w.errores)
X = N.cuenta(); espX = N.espacio(X["token"], '<img src=x onerror="window.__xss=1">Esp')
ops = [{"id": "x:1", "bloque": "b1", "campos": {"tipo": "texto", "pagina": "p1", "orden": 1, "x": 40, "y": 40, "w": 400, "h": 100, "html": '<img src=x onerror="window.__xss=2"><script>window.__xss=3</script><a href="javascript:window.__xss=4">clic</a>'}, "t": 2, "n": "x"},
       {"id": "x:2", "bloque": "b2", "campos": {"tipo": "forma", "figura": "rect", "pagina": "p1", "orden": 2, "x": 40, "y": 200, "w": 200, "h": 80, "texto": "<img src=x onerror=window.__xss=5>", "html": "<svg onload=window.__xss=6>", "color": '"><img src=x onerror=window.__xss=7>', "icono": '<img src=x onerror=window.__xss=8>'}, "t": 2, "n": "x"},
       {"id": "x:3", "bloque": "b3", "campos": {"tipo": "tabla", "enDiapo": True, "pagina": "p1", "orden": 3, "x": 300, "y": 200, "w": 300, "h": 100, "filas": 2, "cols": 2, "c:A1": "<img src=x onerror=window.__xss=9>"}, "t": 2, "n": "x"}]
dx = N.documento(X["token"], espX, "PRESENTACION", '<img src=x onerror="window.__xss=10">', ops)
dt = N.documento(X["token"], espX, "TEXTO", "Texto", [])
entrar(X); p.evaluate("() => { window.__xss = 0; }")
despues_xss = None
p.goto(B + "/#/doc/" + dx); p.wait_for_timeout(3500); x1 = p.evaluate("() => window.__xss || 0")
p.evaluate("() => { location.hash = '#/'; }"); p.wait_for_timeout(1500); x2 = p.evaluate("() => window.__xss || 0")
anota("HTML metido a la fuerza en una diapositiva, un nombre de documento o de espacio no ejecuta nada", not x1 and not x2, (x1, x2))
p.goto(B + "/#/doc/" + dt); p.wait_for_selector(".wd-cuerpo", timeout=20000)
p.evaluate("""() => { const d = NOM.editorActual.doc; d.seq('cuerpo', { k: 'i', iz: null, x: 'enlace', a: { enlace: 'javascript:window.__xss=11', fuente: "x';background:url(javascript:1)", color: 'red;background:url(x)', borde: 'x', sombra: '"><img src=x onerror=window.__xss=12>' } }, { origen: 'comando' }); }""")
p.wait_for_timeout(1500)
enl = p.evaluate("() => [...document.querySelectorAll('.wd-cuerpo a')].map((a) => a.getAttribute('href'))")
anota("un enlace javascript: metido a la fuerza en un texto no queda como enlace activo", not any((h or "").lower().startswith("javascript") for h in enl) and not p.evaluate("() => window.__xss || 0"), enl)
anota("…y nada de eso queda en la página con un manejador de eventos", p.evaluate("() => document.querySelectorAll('[onerror],[onload],[onclick]').length") == 0)
salir()
despues_xss = len(w.errores)

# ================================================================== 11. Cierre de golpe
# Chromium escribe localStorage al disco cuando le conviene: si el proceso muere (se va la luz, se
# mata), al volver puede faltar la sesión aunque IndexedDB sí quedó. Visto en flast-desktop con kill -9.
# Aquí se simula quitando la sesión de localStorage sin cerrarla.
print("== 11. El navegador se cierra de golpe")
JS_TOKENS = """async () => { const db = await new Promise((ok, mal) => { const r = indexedDB.open('nom-boveda'); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
  return await new Promise((ok) => { const q = db.transaction('sesion').objectStore('sesion').getAll(); q.onsuccess = () => ok(q.result.filter((x) => x && x.token).length); }); }"""
K = N.cuenta(); e11 = N.espacio(K["token"], "Golpe"); d11 = N.documento(K["token"], e11, "TEXTO", "Antes del golpe")
entrar(K)
p.evaluate("() => { localStorage.removeItem('nom.token'); localStorage.removeItem('nom.usuario'); }")
p.goto(B + "/#/doc/" + d11); p.reload()
try:
    p.wait_for_function("() => !!localStorage.getItem('nom.token') && !!document.querySelector('.editor-hoja, [contenteditable=true]')", timeout=20000); ok = True
except Exception: ok = False
anota("si localStorage perdió la sesión, se recupera de la copia junto a la bóveda", ok and p.evaluate("() => (JSON.parse(localStorage.getItem('nom.usuario') || 'null') || {}).id") == K["id"], p.evaluate("() => localStorage.getItem('nom.usuario')"))
anota("…y abre el documento sin pedir la contraseña", ok and not p.evaluate("() => !!document.querySelector('#u')"))
p.evaluate("() => { location.hash = '#/'; }"); p.wait_for_timeout(600)
p.evaluate("() => NOM.api.limpiarSesion()"); p.wait_for_timeout(800)
anota("al quitar la sesión (por ejemplo, al cambiar de servidor) la copia del token también se va", p.evaluate(JS_TOKENS) == 0)
entrar(K); salir(); p.reload(); p.wait_for_timeout(2500)
anota("después de cerrar sesión no queda ninguna copia y se pide entrar", p.evaluate(JS_TOKENS) == 0 and not p.evaluate("() => !!localStorage.getItem('nom.token')") and p.evaluate("() => !!document.querySelector('#u')"))

# ================================================================== 9. Aviso de red sin cifrar
print("== 9. Aviso de conexión sin cifrar")
anota("en el propio equipo (localhost) no sale el aviso", B.startswith("https") or not p.evaluate("() => !!document.querySelector('[data-sin-cifrar]')") if "localhost" in B or "127.0.0.1" in B else True)
ip = None
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("10.255.255.255", 1)); ip = s.getsockname()[0]; s.close()
except Exception: ip = None
puerto = B.rsplit(":", 1)[-1].split("/")[0] if B.count(":") >= 2 else "80"
if ip and not ip.startswith("127.") and B.startswith("http://") and ("localhost" in B or "127.0.0.1" in B):
    lan = f"http://{ip}:{puerto}"
    try:
        p.goto(lan + "/"); p.wait_for_selector("#u", timeout=15000)
        av = p.evaluate("() => (document.querySelector('[data-sin-cifrar]') || {}).innerText || ''")
        anota("entrando por la red local (http) sale «Conexión sin cifrar»", "Conexión sin cifrar" in av and "Wi-Fi de confianza" in av, av)
        p.screenshot(path=os.path.join(OUT, "cuentas-sin-cifrar.png"))
        # En la red local el navegador no ofrece su cifrado: la bóveda usa el propio, y también conserva lo local.
        L = N.cuenta(); entrar(L, CL, lan)
        p.evaluate("() => NOM.local.crear('Por la red local', 'TEXTO')"); p.wait_for_timeout(900)
        N.api("PUT", "/api/cuentas/contrasena", {"actual": CL, "nueva": NUEVA}, L["token"])
        p.evaluate("() => NOM.app.cerrarSesion(true)"); p.wait_for_timeout(1500)
        entrar(L, NUEVA, lan); ok = esperar_hoja("Guardado con tu contraseña anterior", 20000)
        if ok: p.fill("#va", CL); p.click(".hoja-pie [data-si]")
        try: p.wait_for_function("() => !document.querySelector('.hoja')", timeout=40000)
        except Exception: pass
        p.wait_for_timeout(1200)
        anota("por la red local (cifrado propio) también se recupera lo de la contraseña anterior", ok and p.evaluate("() => NOM.local.lista().map((d) => d.nombre)") == ["Por la red local"] and p.evaluate("() => NOM.boveda.cifrado()") == "AES-256-CTR + HMAC-SHA256", p.evaluate("() => NOM.boveda.cifrado()"))
    except Exception as e:
        print("   (no se pudo probar por la red local:", str(e)[:120], ")")
else:
    print("   (sin dirección de red local: se omite)")

# Mientras se abre el contenido malicioso de la prueba, la política de contenido avisa en la consola
# cada vez que el limpiador lee un onerror= plantado (lo lee en un <template>, donde no corre, y lo
# quita): esos avisos son la política haciendo su trabajo, no un error de la página.
plantado = lambda i, e: antes_xss <= i < (despues_xss or len(w.errores)) and "inline event handler" in e
graves = [e for i, e in enumerate(w.errores) if not plantado(i, e) and "Failed to load resource" not in e and "net::ERR_INTERNET_DISCONNECTED" not in e and "ERR_FAILED" not in e]
anota("la página no reporta errores (tampoco de la política de contenido)", not graves, graves[:4])
mal = sum(1 for _, ok in res if not ok)
print(f"\nCuentas y equipo: {len(res) - mal} de {len(res)}")
w.cerrar()
sys.exit(1 if mal else 0)
