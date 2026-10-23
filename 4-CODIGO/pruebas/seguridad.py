"""Pruebas de seguridad de NOM-COLAB contra un servidor recién arrancado (datos temporales).

    python3 pruebas/seguridad.py                 # usa app/target/nom-colab.jar
    python3 pruebas/seguridad.py ruta/al.jar

Arranca el jar en el puerto 8092 con una carpeta de datos temporal, crea cuatro cuentas y un
espacio, y prueba sesión, validación, bloqueo y los roles de cada espacio (Propietario, Puede
editar, Solo lectura y sin acceso). Imprime cada prueba y termina con error si alguna falla.
Los roles de la base de Azure SQL se prueban aparte con azure/desplegar.sh roles.
"""
import json, os, shutil, subprocess, time, urllib.request
import sys, tempfile
AQUI = os.path.dirname(os.path.abspath(__file__))
JAR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "..", "app", "target", "nom-colab.jar")
D = tempfile.mkdtemp(prefix="nomcolab-pruebas-")
JAVA = shutil.which("java") or "java"
P = 8092; B = f"http://localhost:{P}"
srv = subprocess.Popen([JAVA, "-jar", JAR],
    env=dict(os.environ, NOM_PUERTO=str(P), NOM_DATOS=D, NOM_DESCUBRIMIENTO="false"), stdout=open(os.path.join(D, "servidor.log"), "w"), stderr=subprocess.STDOUT)
def r(m, u, b=None, t=None):
    h = {"Content-Type": "application/json"}
    if t: h["Authorization"] = "Bearer " + t
    q = urllib.request.Request(B + u, method=m, data=json.dumps(b).encode() if b is not None else None, headers=h)
    try:
        with urllib.request.urlopen(q, timeout=30) as x:
            c = x.read(); return x.status, (json.loads(c) if c[:1] in b"{[" else None)
    except urllib.error.HTTPError as e: return e.code, None
res = []
def prueba(nombre, esperado, obtenido): res.append((nombre, esperado, obtenido, str(esperado) == str(obtenido)))
try:
    for _ in range(90):
        try: urllib.request.urlopen(B + "/api/red/info", timeout=2); break
        except Exception: time.sleep(1)
    CL = "Clave-Segura-123"
    for n in ("duena", "lectora", "editora", "ajena"): r("POST", "/api/cuentas/registro", {"nombre": n, "contrasena": CL})
    tok = {n: r("POST", "/api/cuentas/sesion", {"nombre": n, "contrasena": CL})[1]["token"] for n in ("duena", "lectora", "editora", "ajena")}
    esp = r("POST", "/api/espacios", {"nombre": "Prueba"}, tok["duena"])[1]["id"]
    r("PUT", f"/api/espacios/{esp}/accesos", {"usuario": "lectora", "permiso": "LECTURA"}, tok["duena"])
    r("PUT", f"/api/espacios/{esp}/accesos", {"usuario": "editora", "permiso": "EDICION"}, tok["duena"])
    doc = r("POST", f"/api/espacios/{esp}/documentos", {"nombre": "Doc", "modo": "TEXTO", "ops": []}, tok["duena"])[1]["id"]
    op = lambda i: {"ops": [{"id": "p" + i, "bloque": "b1", "campos": {"tipo": "texto", "html": "hola"}, "t": int(time.time() * 1000), "n": "prueba"}], "cliente": "prueba", "dispositivo": "prueba"}
    prueba("Pedir datos sin token", 401, r("GET", "/api/espacios")[0])
    prueba("Token inventado", 401, r("GET", "/api/espacios", t="inventado")[0])
    prueba("La ruta de administración ya no existe", 404, r("GET", "/api/admin/usuarios", t=tok["duena"])[0])
    prueba("Inyección SQL en el inicio de sesión (' OR 1=1 --)", 401, r("POST", "/api/cuentas/sesion", {"nombre": "' OR 1=1 --", "contrasena": "x"})[0])
    prueba("Registro con HTML en el nombre", 400, r("POST", "/api/cuentas/registro", {"nombre": "<script>", "contrasena": CL})[0])
    prueba("Contraseña de menos de 8 caracteres", 400, r("POST", "/api/cuentas/registro", {"nombre": "corta", "contrasena": "1234"})[0])
    prueba("Cuenta ajena abre un espacio que no es suyo", 403, r("GET", f"/api/espacios/{esp}", t=tok["ajena"])[0])
    prueba("Cuenta ajena abre un documento de ese espacio", 403, r("GET", f"/api/documentos/{doc}", t=tok["ajena"])[0])
    prueba("Solo lectura abre el documento", 200, r("GET", f"/api/documentos/{doc}", t=tok["lectora"])[0])
    prueba("Solo lectura intenta editar", 403, r("POST", f"/api/documentos/{doc}/ops", op("1"), t=tok["lectora"])[0])
    prueba("Puede editar escribe en el documento", 200, r("POST", f"/api/documentos/{doc}/ops", op("2"), t=tok["editora"])[0])
    prueba("Puede editar intenta dar acceso a otra cuenta", 403, r("PUT", f"/api/espacios/{esp}/accesos", {"usuario": "ajena", "permiso": "LECTURA"}, tok["editora"])[0])
    prueba("El propietario cambia a solo lectura a la editora", 200, r("PUT", f"/api/espacios/{esp}/accesos", {"usuario": "editora", "permiso": "LECTURA"}, tok["duena"])[0])
    prueba("…y en su siguiente cambio ya no puede escribir", 403, r("POST", f"/api/documentos/{doc}/ops", op("3"), t=tok["editora"])[0])
    prueba("El propietario le quita el acceso a la lectora", 200, r("PUT", f"/api/espacios/{esp}/accesos", {"usuario": "lectora", "permiso": None}, tok["duena"])[0])
    prueba("…y ya no puede abrir el espacio", 403, r("GET", f"/api/espacios/{esp}", t=tok["lectora"])[0])
    prueba("Nadie puede quitarle el espacio a su propietario", 400, r("PUT", f"/api/espacios/{esp}/accesos", {"usuario": "duena", "permiso": "LECTURA"}, tok["duena"])[0])
    cods = [r("POST", "/api/cuentas/sesion", {"nombre": "ajena", "contrasena": "mala"})[0] for _ in range(6)]
    prueba("6 intentos fallidos bloquean la cuenta", 423, cods[-1])
    prueba("…y ni con la contraseña correcta entra (15 min)", 423, r("POST", "/api/cuentas/sesion", {"nombre": "ajena", "contrasena": CL})[0])
    prueba("Cerrar sesión invalida el token", 401, (r("DELETE", "/api/cuentas/sesion", t=tok["editora"]), r("GET", "/api/espacios", t=tok["editora"])[0])[1])
finally:
    srv.kill(); srv.wait(30)
    shutil.rmtree(D, ignore_errors=True)
for n, e, o, ok in res: print(("OK " if ok else "MAL"), f"{n:<58} esperado {e} obtenido {o}")
print(sum(ok for *_, ok in res), "de", len(res))
sys.exit(0 if all(ok for *_, ok in res) else 1)
