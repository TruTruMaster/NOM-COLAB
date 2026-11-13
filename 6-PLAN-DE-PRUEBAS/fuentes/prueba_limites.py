"""Casos de valores límite del plan de pruebas (sección 6.3): arranca el jar en el puerto 8093 con datos
temporales y deja el resultado en ../registros/limites.json.  Uso: python3 prueba_limites.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, http.client
JAR = os.path.expanduser("~/NOM/4-CODIGO/app/target/nom-colab.jar"); P = 8093; B = f"http://localhost:{P}"
D = tempfile.mkdtemp(prefix="nom-limites-")
srv = subprocess.Popen(["java", "-jar", JAR], env=dict(os.environ, NOM_PUERTO=str(P), NOM_DATOS=D, NOM_DESCUBRIMIENTO="false"), stdout=open(D + "/log", "w"), stderr=subprocess.STDOUT)
def r(m, u, b=None, t=None):
    h = {"Content-Type": "application/json"}
    if t: h["Authorization"] = "Bearer " + t
    q = urllib.request.Request(B + u, method=m, data=json.dumps(b).encode() if b is not None else None, headers=h)
    try:
        with urllib.request.urlopen(q, timeout=120) as x:
            c = x.read(); return x.status, (json.loads(c) if c[:1] in b"{[" else None)
    except urllib.error.HTTPError as e:
        c = e.read()
        try: return e.code, json.loads(c)
        except Exception: return e.code, None
res = []
def caso(id_, desc, esperado, obt):
    ok = str(esperado) == str(obt[0] if isinstance(obt, tuple) else obt)
    msg = (obt[1] or {}).get("mensaje", "") if isinstance(obt, tuple) and isinstance(obt[1], dict) else ""
    res.append(dict(id=id_, desc=desc, esperado=esperado, obtenido=obt[0] if isinstance(obt, tuple) else obt, ok=ok, msg=msg))
    print(("OK   " if ok else "FALLA"), id_, desc, "esperado", esperado, "obtenido", obt[0] if isinstance(obt, tuple) else obt, msg)
try:
    for _ in range(90):
        try: urllib.request.urlopen(B + "/api/red/info", timeout=2); break
        except Exception: time.sleep(1)
    CL = "Clave-Segura-123"
    reg = lambda n, c=CL: r("POST", "/api/cuentas/registro", {"nombre": n, "contrasena": c})
    caso("VL-01", "Nombre de 2 caracteres (ab)", 400, reg("ab"))
    caso("VL-02", "Nombre de 3 caracteres (abc)", 201, reg("abc"))
    caso("VL-03", "Nombre de 24 caracteres", 201, reg("n" * 24))
    caso("VL-04", "Nombre de 25 caracteres", 400, reg("m" * 25))
    caso("VL-05", "Nombre con espacio (ana luz)", 400, reg("ana luz"))
    caso("VL-06", "Contraseña de 7 caracteres", 400, reg("siete7", "Clave-7"))
    caso("VL-07", "Contraseña de 8 caracteres", 201, reg("ocho8", "Clave-88"))
    caso("VL-08", "Nombre repetido (abc)", 409, reg("abc"))
    caso("VL-09", "Nombre repetido con mayúsculas (ABC)", 409, reg("ABC"))
    # bloqueo: 5 fallos responden 401; el 6.º, 423
    reg("bloqueo")
    for i in range(1, 6):
        c = r("POST", "/api/cuentas/sesion", {"nombre": "bloqueo", "contrasena": "mala-" + str(i)})
        if i == 5: caso("VL-10", "5.º intento fallido (aún no bloquea)", 401, c)
    caso("VL-11", "6.º intento fallido (bloquea 15 min)", 423, r("POST", "/api/cuentas/sesion", {"nombre": "bloqueo", "contrasena": "mala-6"}))
    caso("VL-12", "Contraseña correcta durante el bloqueo", 423, r("POST", "/api/cuentas/sesion", {"nombre": "bloqueo", "contrasena": CL}))
    # 5 usuarios conectados a la vez en un espacio; el 6.º no entra
    nombres = ["duena"] + [f"miembro{i}" for i in range(1, 6)]
    for n in nombres: reg(n)
    tk = {n: r("POST", "/api/cuentas/sesion", {"nombre": n, "contrasena": CL})[1]["token"] for n in nombres}
    esp = r("POST", "/api/espacios", {"nombre": "Salon"}, tk["duena"])[1]["id"]
    for n in nombres[1:]: r("PUT", f"/api/espacios/{esp}/accesos", {"usuario": n, "permiso": "EDICION"}, tk["duena"])
    abiertos = []
    def abrir(n):
        b = r("POST", "/api/cuentas/boleto", {}, tk[n])[1]["boleto"]
        c = http.client.HTTPConnection("localhost", P, timeout=15)
        c.request("GET", f"/api/espacios/{esp}/eventos?boleto={b}&cliente=c-{n}", headers={"Accept": "text/event-stream"})
        x = c.getresponse(); abiertos.append(c)
        cuerpo = None if x.status == 200 else x.read()
        return x.status, (json.loads(cuerpo) if cuerpo else None)
    est = [abrir(n) for n in nombres[:5]]
    caso("VL-13", "5 personas conectadas a la vez al espacio", "[200, 200, 200, 200, 200]", str([e[0] for e in est]))
    caso("VL-14", "La 6.ª persona intenta conectarse", 409, abrir(nombres[5]))
    for c in abiertos:
        try: c.close()
        except Exception: pass
    # documento de más de 25 MB
    doc = r("POST", f"/api/espacios/{esp}/documentos", {"nombre": "Grande", "modo": "TEXTO", "ops": []}, tk["duena"])[1]["id"]
    def op(i, tam): return {"ops": [{"id": "p" + i, "bloque": "b" + i, "campos": {"tipo": "texto", "html": "x" * tam}, "t": int(time.time() * 1000), "n": "prueba"}], "cliente": "prueba", "dispositivo": "prueba"}
    caso("VL-15", "Agregar 1 MB de texto a un documento", 200, r("POST", f"/api/documentos/{doc}/ops", op("1", 1_000_000), tk["duena"]))
    caso("VL-16", "Agregar 26 MB de texto de una vez (tope: 25 MB)", 413, r("POST", f"/api/documentos/{doc}/ops", op("2", 26_000_000), tk["duena"]))
    time.sleep(12)
    caso("VL-17", "Después del rechazo, el documento sigue sano y acepta 10 bytes más", 200, r("POST", f"/api/documentos/{doc}/ops", op("3", 10), tk["duena"]))
    doc2 = r("POST", f"/api/espacios/{esp}/documentos", {"nombre": "Grande2", "modo": "TEXTO", "ops": []}, tk["duena"])[1]["id"]
    caso("VL-18", "Agregar 60 MB de una vez a un documento nuevo", 413, r("POST", f"/api/documentos/{doc2}/ops", op("4", 60_000_000), tk["duena"]))
finally:
    srv.terminate()
    json.dump(res, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "registros", "limites.json"), "w"), ensure_ascii=False, indent=1)
