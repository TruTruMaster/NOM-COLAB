"""Pruebas de seguridad de NOM-COLAB contra un servidor recién arrancado (datos temporales).

    python3 pruebas/seguridad.py                 # usa app/target/nom-colab.jar
    python3 pruebas/seguridad.py ruta/al.jar
    NOM_PRUEBA_RAPIDA=1 python3 pruebas/seguridad.py   # sin la prueba de la fecha de entrega (1 min)
    NOM_BASE=http://192.168.0.77:8080 python3 pruebas/seguridad.py   # contra un servidor ya encendido

Con NOM_BASE no arranca nada: prueba ese servidor (por ejemplo, el teléfono como servidor, para
revisar que ApiTelefono tenga las mismas rutas y permisos que Spring). Ese servidor debe estar
recién instalado o con sus datos borrados: las cuentas de prueba (maestra, alumno1…) no deben
existir antes. Ojo: también prueba el bloqueo de cuenta tras 6 intentos fallidos.

Arranca el jar en el puerto 8092 con una carpeta de datos temporal, crea cuentas y espacios, y
prueba sesión, validación, bloqueo y los roles de cada espacio (Propietario, Puede editar, Solo
lectura y sin acceso). También lo de noviembre de 2026: protección contra el borrado, partes con
dueño (párrafo, figura, diapositiva y plantilla del maestro), enlaces para unirse que caducan y se
revocan, invitados con apodo, recibos de proceso de escritura, recuperar la contraseña,
presentar en otra pantalla y la fecha límite de entrega. Y lo de la versión 0.12.1: cabeceras
de seguridad, cambiar la contraseña, borrar la cuenta, boletos de un solo uso para el canal en
vivo, bloqueo de intentos por red, tope de cuentas nuevas por hora, almacenamiento de la cuenta y
que los documentos se guarden comprimidos (y sigan abriendo tras reiniciar el servidor).
Imprime cada prueba y termina con error si alguna falla.
Los roles de la base de Azure SQL se prueban aparte con azure/desplegar.sh roles.
"""
import glob, gzip, json, os, shutil, subprocess, time, urllib.request, urllib.parse
import sys, tempfile
AQUI = os.path.dirname(os.path.abspath(__file__))
JAR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "..", "app", "target", "nom-colab.jar")
D = tempfile.mkdtemp(prefix="nomcolab-pruebas-")
JAVA = shutil.which("java") or "java"
EXTERNO = os.environ.get("NOM_BASE", "").rstrip("/")
P = 8092; B = EXTERNO or f"http://localhost:{P}"
def arrancar():
    return None if EXTERNO else subprocess.Popen([JAVA, "-jar", JAR],
        env=dict(os.environ, NOM_PUERTO=str(P), NOM_DATOS=D, NOM_DESCUBRIMIENTO="false", NOM_CUOTA_MB="200"), stdout=open(os.path.join(D, "servidor.log"), "a"), stderr=subprocess.STDOUT)
def esperar():
    for _ in range(90):
        try: urllib.request.urlopen(B + "/api/red/info", timeout=2); return
        except Exception: time.sleep(1)
srv = arrancar()
def r(m, u, b=None, t=None, de=None):
    """de: la dirección de red que se simula (solo se cree cuando la petición llega del propio equipo)."""
    h = {"Content-Type": "application/json"}
    if t: h["Authorization"] = "Bearer " + t
    if de: h["X-Forwarded-For"] = de
    q = urllib.request.Request(B + u, method=m, data=json.dumps(b).encode() if b is not None else None, headers=h)
    try:
        with urllib.request.urlopen(q, timeout=30) as x:
            c = x.read(); return x.status, (json.loads(c) if c[:1] in b"{[" else None)
    except urllib.error.HTTPError as e: return e.code, None
def cabeceras(u):
    try:
        with urllib.request.urlopen(B + u, timeout=30) as x: return {k.lower(): v for k, v in x.headers.items()}
    except urllib.error.HTTPError as e: return {k.lower(): v for k, v in e.headers.items()}
def canal(u):
    """Abre un canal en vivo y lo cierra en cuanto contesta: devuelve el código y el tipo de contenido."""
    try:
        x = urllib.request.urlopen(urllib.request.Request(B + u, headers={"Accept": "text/event-stream"}), timeout=15)
        try: return x.status, (x.headers.get("Content-Type") or "").split(";")[0]
        finally: x.close()
    except urllib.error.HTTPError as e: return e.code, ""
res = []
def prueba(nombre, esperado, obtenido): res.append((nombre, esperado, obtenido, str(esperado) == str(obtenido)))
try:
    esperar()
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

    # ================================================================ noviembre de 2026
    for n in ("maestra", "alumno1", "alumno2", "visitante", "recupera"): r("POST", "/api/cuentas/registro", {"nombre": n, "contrasena": CL})
    ses = {n: r("POST", "/api/cuentas/sesion", {"nombre": n, "contrasena": CL})[1] for n in ("maestra", "alumno1", "alumno2", "visitante")}
    tk = {n: ses[n]["token"] for n in ses}
    uid = {n: ses[n]["usuario"]["id"] for n in ses}
    salon = r("POST", "/api/espacios", {"nombre": "Salón 3B"}, tk["maestra"])[1]["id"]
    for n in ("alumno1", "alumno2"): r("PUT", f"/api/espacios/{salon}/accesos", {"usuario": n, "permiso": "EDICION"}, tk["maestra"])
    T = [1000]
    def lote(cliente, *ops):
        out = []
        for o in ops:
            T[0] += 1
            o = dict(o); o.setdefault("id", cliente + ":" + str(T[0])); o.setdefault("t", T[0]); o.setdefault("n", cliente); o.setdefault("campos", {})
            out.append(o)
        return {"ops": out, "cliente": cliente, "dispositivo": "prueba"}
    def rechazadas(res): return len((res[1] or {}).get("rechazadas", [])) if res[0] == 200 else "HTTP " + str(res[0])

    # 1.2 Protección contra el borrado
    pdoc = r("POST", f"/api/espacios/{salon}/documentos", {"nombre": "Impuestos", "modo": "HOJA", "ops": []}, tk["maestra"])[1]["id"]
    prueba("1.2 El propietario protege un documento", 200, r("PUT", f"/api/documentos/{pdoc}/proteccion", {"protegido": True}, tk["maestra"])[0])
    prueba("1.2 Un editor no puede borrarlo", 409, r("DELETE", f"/api/documentos/{pdoc}", t=tk["alumno1"])[0])
    prueba("1.2 Un editor no puede quitarle la protección", 403, r("PUT", f"/api/documentos/{pdoc}/proteccion", {"protegido": False, "confirmacion": "BORRAR"}, tk["alumno1"])[0])
    prueba("1.2 Quitarla sin escribir BORRAR", 400, r("PUT", f"/api/documentos/{pdoc}/proteccion", {"protegido": False}, tk["maestra"])[0])
    prueba("1.2 El propietario la quita escribiendo BORRAR", 200, r("PUT", f"/api/documentos/{pdoc}/proteccion", {"protegido": False, "confirmacion": "borrar"}, tk["maestra"])[0])
    prueba("1.2 …y ya se puede borrar", 200, r("DELETE", f"/api/documentos/{pdoc}", t=tk["alumno1"])[0])

    # 3.5 Párrafos con dueño (texto letra por letra)
    tdoc = r("POST", f"/api/espacios/{salon}/documentos", {"nombre": "Ensayo en equipo", "modo": "TEXTO", "ops": []}, tk["maestra"])[1]["id"]
    r("POST", f"/api/documentos/{tdoc}/ops", lote("m1", {"bloque": "cuerpo", "t": 1, "s": {"k": "i", "iz": None, "x": "Uno\nDos"}}), tk["maestra"])
    # El párrafo "Uno" (su marca de párrafo es 4@m1) es de alumno1.
    prueba("3.5 Un editor no puede asignarse un párrafo", 1, rechazadas(r("POST", f"/api/documentos/{tdoc}/ops", lote("a2", {"bloque": "cuerpo", "s": {"k": "f", "a": {"dueno": uid["alumno2"]}, "r": [["m1", 4, 4]]}}), tk["alumno2"])))
    prueba("3.5 El propietario asigna el párrafo 1 a alumno1", 0, rechazadas(r("POST", f"/api/documentos/{tdoc}/ops", lote("m1", {"bloque": "cuerpo", "s": {"k": "f", "a": {"dueno": uid["alumno1"]}, "r": [["m1", 4, 4]]}}), tk["maestra"])))
    prueba("3.5 Otro editor no puede borrar en ese párrafo", 1, rechazadas(r("POST", f"/api/documentos/{tdoc}/ops", lote("a2", {"bloque": "cuerpo", "s": {"k": "v", "v": False, "r": [["m1", 2, 2]]}}), tk["alumno2"])))
    prueba("3.5 …ni escribir en él", 1, rechazadas(r("POST", f"/api/documentos/{tdoc}/ops", lote("a2", {"bloque": "cuerpo", "s": {"k": "i", "iz": "1@m1", "x": "zz"}}), tk["alumno2"])))
    prueba("3.5 …pero sí en el párrafo de nadie", 0, rechazadas(r("POST", f"/api/documentos/{tdoc}/ops", lote("a2", {"bloque": "cuerpo", "s": {"k": "i", "iz": "7@m1", "x": "!"}}), tk["alumno2"])))
    prueba("3.5 Su dueño sí escribe en su párrafo", 0, rechazadas(r("POST", f"/api/documentos/{tdoc}/ops", lote("a1", {"bloque": "cuerpo", "s": {"k": "i", "iz": "3@m1", "x": " uno"}}), tk["alumno1"])))
    est = r("GET", f"/api/documentos/{tdoc}", t=tk["maestra"])[1]["estado"]["seq"]["cuerpo"]
    xs = [e["x"] for e in est["ins"]]
    prueba("3.5 El servidor guardó lo del dueño y no lo rechazado", "sí", "sí" if " uno" in xs and "zz" not in xs else str(xs))
    prueba("3.5 Con partes asignadas, un editor no restaura versiones", 403, r("POST", f"/api/documentos/{tdoc}/versiones/1/restaurar", t=tk["alumno2"])[0])

    # 3.5 y 5.4 Figuras, diapositivas y plantilla del maestro
    pres = r("POST", f"/api/espacios/{salon}/documentos", {"nombre": "Exposición", "modo": "PRESENTACION", "ops": []}, tk["maestra"])[1]["id"]
    r("POST", f"/api/documentos/{pres}/ops", lote("m1",
        {"bloque": "fig1", "campos": {"tipo": "forma", "pagina": "p1", "x": 10, "y": 10, "w": 100, "h": 50, "dueno": uid["alumno1"]}},
        {"bloque": "fondo", "campos": {"tipo": "forma", "pagina": "p1", "x": 0, "y": 0, "w": 960, "h": 540, "maestro": True}},
        {"bloque": "_doc", "campos": {"paginas": ["p1", "p2"], "dueno:p2": uid["alumno1"]}}), tk["maestra"])
    prueba("3.5 Otro editor no mueve la figura de alumno1", 1, rechazadas(r("POST", f"/api/documentos/{pres}/ops", lote("a2", {"bloque": "fig1", "campos": {"x": 300}}), tk["alumno2"])))
    prueba("3.5 alumno1 sí mueve su figura", 0, rechazadas(r("POST", f"/api/documentos/{pres}/ops", lote("a1", {"bloque": "fig1", "campos": {"x": 300}}), tk["alumno1"])))
    prueba("3.5 Otro editor no agrega figuras en la diapositiva de alumno1", 1, rechazadas(r("POST", f"/api/documentos/{pres}/ops", lote("a2", {"bloque": "intrusa", "campos": {"tipo": "texto", "pagina": "p2", "x": 1, "y": 1, "w": 9, "h": 9}}), tk["alumno2"])))
    prueba("3.5 …ni quita esa diapositiva", 1, rechazadas(r("POST", f"/api/documentos/{pres}/ops", lote("a2", {"bloque": "_doc", "campos": {"paginas": ["p1"]}}), tk["alumno2"])))
    prueba("5.4 Nadie más que el propietario mueve la plantilla del maestro", 1, rechazadas(r("POST", f"/api/documentos/{pres}/ops", lote("a1", {"bloque": "fondo", "campos": {"x": 5}}), tk["alumno1"])))
    prueba("5.4 …ni le quita el candado", 1, rechazadas(r("POST", f"/api/documentos/{pres}/ops", lote("a1", {"bloque": "fondo", "campos": {"maestro": None}}), tk["alumno1"])))
    prueba("5.4 El propietario sí la cambia", 0, rechazadas(r("POST", f"/api/documentos/{pres}/ops", lote("m1", {"bloque": "fondo", "campos": {"x": 5}}), tk["maestra"])))
    bl = r("GET", f"/api/documentos/{pres}", t=tk["maestra"])[1]["estado"]["bloques"]
    prueba("3.5 El servidor conserva la posición que puso el dueño", 300, bl["fig1"]["x"]["v"])

    # 2.1 / 2.3 Enlaces para unirse que caducan y se revocan
    prueba("2.3 Un editor no crea enlaces para unirse", 403, r("POST", f"/api/espacios/{salon}/enlaces", {"permiso": "EDICION", "horas": 2}, tk["alumno1"])[0])
    en = r("POST", f"/api/espacios/{salon}/enlaces", {"permiso": "EDICION", "horas": 2, "invitados": True}, tk["maestra"])
    prueba("2.1 El propietario crea un enlace (QR)", 201, en[0])
    cod = (en[1] or {}).get("codigo", "X")
    prueba("2.1 Lo que dice el enlace se ve sin sesión", 200, r("GET", f"/api/enlaces/{cod}")[0])
    prueba("2.1 Una cuenta entra con el enlace", 200, r("POST", f"/api/enlaces/{cod}/entrar", t=tk["visitante"])[0])
    prueba("2.1 …y ya abre el espacio", 200, r("GET", f"/api/espacios/{salon}", t=tk["visitante"])[0])
    prueba("2.1 Entrar con el enlace pide sesión", 401, r("POST", f"/api/enlaces/{cod}/entrar")[0])
    # 2.2 Invitados con apodo
    inv = r("POST", f"/api/enlaces/{cod}/invitado", {"apodo": "Ana"})
    prueba("2.2 Alguien entra con apodo, sin registrarse", 200, inv[0])
    ti = (inv[1] or {}).get("token")
    prueba("2.2 El invitado ve el espacio del enlace", 200, r("GET", f"/api/espacios/{salon}", t=ti)[0])
    prueba("2.2 El invitado no puede crear espacios", 403, r("POST", "/api/espacios", {"nombre": "Mío"}, ti)[0])
    prueba("2.2 Un apodo con HTML no se acepta", 400, r("POST", f"/api/enlaces/{cod}/invitado", {"apodo": "<b>x</b>"})[0])
    prueba("2.3 El propietario revoca el enlace", 200, r("DELETE", f"/api/espacios/{salon}/enlaces/{cod}", t=tk["maestra"])[0])
    prueba("2.3 …y ya no sirve", 403, r("GET", f"/api/enlaces/{cod}")[0])
    prueba("2.3 …ni para entrar con apodo", 403, r("POST", f"/api/enlaces/{cod}/invitado", {"apodo": "Beto"})[0])
    prueba("2.3 Un código inventado", 404, r("GET", "/api/enlaces/ZZZZ9999")[0])

    # 3.2 Recibo de proceso de escritura
    prueba("3.2 alumno1 pide su recibo", 200, r("GET", f"/api/documentos/{tdoc}/recibo", t=tk["alumno1"])[0])
    prueba("3.2 alumno2 no puede ver el recibo de alumno1", 403, r("GET", f"/api/documentos/{tdoc}/recibo?usuario={uid['alumno1']}", t=tk["alumno2"])[0])
    rec = r("GET", f"/api/documentos/{tdoc}/recibo?usuario={uid['alumno1']}", t=tk["maestra"])
    prueba("3.2 El propietario ve el recibo de alumno1", 200, rec[0])
    rc = rec[1] or {}
    prueba("3.2 Un recibo auténtico se verifica (sin sesión)", True, (r("POST", "/api/recibos/verificar", rc)[1] or {}).get("valido"))
    alterado = json.loads(json.dumps(rc)); alterado.setdefault("totales", {})["letrasTecleadas"] = 99999
    prueba("3.2 Un recibo modificado no pasa", False, (r("POST", "/api/recibos/verificar", alterado)[1] or {}).get("valido"))

    # 5.5 Presentar en otra pantalla
    pr = r("POST", f"/api/documentos/{pres}/proyeccion", t=tk["alumno1"])
    prueba("5.5 Quien presenta obtiene un código", 200, pr[0])
    prueba("5.5 El proyector abre la presentación con el código (sin sesión)", 200, r("GET", f"/api/proyeccion/{(pr[1] or {}).get('codigo', 'X')}")[0])
    prueba("5.5 Un código de proyección inventado", 404, r("GET", "/api/proyeccion/ZZZ999")[0])
    # 8.3 Láser y pluma: solo quien presenta dibuja en la pantalla del proyector, y con límites.
    codigo_pr = (pr[1] or {}).get("codigo", "X")
    muchos = {"puntero": {"x": 0.5, "y": 0.5}, "trazos": [[0.1, 0.2] * 500] * 90, "color": "red;<script>"}
    prueba("8.3 Quien presenta marca con láser y pluma", 200, r("PUT", f"/api/documentos/{pres}/proyeccion/marcas", muchos, t=tk["alumno1"])[0])
    mk = (r("GET", f"/api/proyeccion/{codigo_pr}")[1] or {}).get("marcas") or {}
    prueba("8.3 …el proyector recibe el puntero", 0.5, (mk.get("puntero") or {}).get("x"))
    prueba("8.3 …los trazos se recortan (máx. 60 de 800 números)", [60, 800], [len(mk.get("trazos") or []), len((mk.get("trazos") or [[]])[0])])
    prueba("8.3 …un color inválido se cambia por el de la pluma", "#F2385A", mk.get("color"))
    prueba("8.3 Quien no está presentando no puede marcar", 404, r("PUT", f"/api/documentos/{pres}/proyeccion/marcas", {"trazos": []}, t=tk["maestra"])[0])
    prueba("8.3 Sin sesión no se marca", 401, r("PUT", f"/api/documentos/{pres}/proyeccion/marcas", {"trazos": []})[0])

    # Recuperar la contraseña con el código
    reg = r("POST", "/api/cuentas/registro", {"nombre": "recupera2", "contrasena": CL})
    codigo_rec = (reg[1] or {}).get("recuperacion", "")
    t_viejo = r("POST", "/api/cuentas/sesion", {"nombre": "recupera2", "contrasena": CL})[1]["token"]
    prueba("Recuperar con un código equivocado", 401, r("POST", "/api/cuentas/recuperar", {"nombre": "recupera2", "codigo": "AAAA-BBBB-CCCC-DDDD", "nueva": "Otra-Clave-456"})[0])
    prueba("Recuperar con el código correcto", 200, r("POST", "/api/cuentas/recuperar", {"nombre": "recupera2", "codigo": codigo_rec, "nueva": "Otra-Clave-456"})[0])
    prueba("…la contraseña vieja ya no entra", 401, r("POST", "/api/cuentas/sesion", {"nombre": "recupera2", "contrasena": CL})[0])
    prueba("…la nueva sí", 200, r("POST", "/api/cuentas/sesion", {"nombre": "recupera2", "contrasena": "Otra-Clave-456"})[0])
    prueba("…y las sesiones de antes se cerraron", 401, r("GET", "/api/espacios", t=t_viejo)[0])
    prueba("…y el código usado ya no sirve", 401, r("POST", "/api/cuentas/recuperar", {"nombre": "recupera2", "codigo": codigo_rec, "nueva": "Tercera-Clave-7"})[0])

    # 8.5 Afuera de los editores: papelera, copias, mover, nombre, carpetas, destacados, buscar,
    #     plantillas, @menciones y enlace para ver un solo documento
    r("PUT", f"/api/espacios/{salon}/accesos", {"usuario": "visitante", "permiso": "LECTURA"}, tk["maestra"])
    bdoc = r("POST", f"/api/espacios/{salon}/documentos", {"nombre": "Fotosíntesis", "modo": "DIAGRAMA", "ops": []}, tk["alumno1"])[1]["id"]
    r("POST", f"/api/documentos/{bdoc}/ops", lote("a1", {"bloque": "f1", "campos": {"tipo": "forma", "texto": "La clorofila absorbe la luz"}}), tk["alumno1"])
    lista = lambda t: [d["id"] for d in (r("GET", f"/api/espacios/{salon}", t=t)[1] or {}).get("lista", [])]
    reg = lambda res, b, c: ((((res[1] or {}).get("estado") or {}).get("bloques") or {}).get(b) or {}).get(c, {}).get("v")
    prueba("8.5 Un lector no manda documentos a la papelera", 403, r("DELETE", f"/api/documentos/{bdoc}", t=tk["visitante"])[0])
    prueba("8.5 Un editor manda el documento a la papelera", 200, r("DELETE", f"/api/documentos/{bdoc}", t=tk["alumno1"])[0])
    prueba("8.5 …ya no sale en la lista", False, bdoc in lista(tk["alumno2"]))
    prueba("8.5 …ni se puede abrir", 404, r("GET", f"/api/documentos/{bdoc}", t=tk["alumno2"])[0])
    prueba("8.5 …ni editar", 404, r("POST", f"/api/documentos/{bdoc}/ops", lote("a2", {"bloque": "f2", "campos": {"tipo": "forma"}}), tk["alumno2"])[0])
    prueba("8.5 Un lector no ve la papelera", 403, r("GET", f"/api/espacios/{salon}/papelera", t=tk["visitante"])[0])
    prueba("8.5 Un editor ve el documento en la papelera", True, bdoc in [x["id"] for x in (r("GET", f"/api/espacios/{salon}/papelera", t=tk["alumno2"])[1] or [])])
    prueba("8.5 Un lector no lo restaura", 403, r("POST", f"/api/documentos/{bdoc}/restaurar", t=tk["visitante"])[0])
    prueba("8.5 Un editor lo restaura", 200, r("POST", f"/api/documentos/{bdoc}/restaurar", t=tk["alumno2"])[0])
    prueba("8.5 …y vuelve a la lista", True, bdoc in lista(tk["alumno1"]))
    r("DELETE", f"/api/documentos/{bdoc}", t=tk["alumno1"])
    prueba("8.5 Un editor no lo borra para siempre", 403, r("DELETE", f"/api/documentos/{bdoc}/definitivo", t=tk["alumno1"])[0])
    r("POST", f"/api/documentos/{bdoc}/restaurar", t=tk["alumno1"])
    prueba("8.5 Un lector no hace copias en el espacio", 403, r("POST", f"/api/documentos/{bdoc}/copia", {}, tk["visitante"])[0])
    cop = r("POST", f"/api/documentos/{bdoc}/copia", {"nombre": "Fotosíntesis (mi versión)"}, tk["alumno2"])
    prueba("8.5 Un editor hace una copia", 200, cop[0])
    cid = (cop[1] or {}).get("id", "X")
    abierto = r("GET", f"/api/documentos/{cid}", t=tk["alumno2"])
    prueba("8.5 …con el mismo contenido", "La clorofila absorbe la luz", reg(abierto, "f1", "texto"))
    prueba("8.5 …y su propio nombre", "Fotosíntesis (mi versión)", (abierto[1] or {}).get("documento", {}).get("nombre"))
    prueba("8.5 Lo que no está en la papelera no se borra para siempre", 409, r("DELETE", f"/api/documentos/{cid}/definitivo", t=tk["maestra"])[0])
    otro = r("POST", "/api/espacios", {"nombre": "Ajeno"}, tk["alumno2"])[1]["id"]
    prueba("8.5 No se copia a un espacio donde no puedes editar", 403, r("POST", f"/api/documentos/{bdoc}/copia", {"espacioId": otro}, tk["alumno1"])[0])
    prueba("8.5 No se mueve a un espacio ajeno", 403, r("PUT", f"/api/documentos/{cid}/espacio", {"espacioId": otro}, tk["alumno1"])[0])
    prueba("8.5 Quien edita en los dos espacios lo mueve", 200, r("PUT", f"/api/documentos/{cid}/espacio", {"espacioId": otro}, tk["alumno2"])[0])
    prueba("8.5 …ya no está en el salón", False, cid in lista(tk["alumno2"]))
    prueba("8.5 …y la maestra ya no lo abre (es de otro espacio)", 403, r("GET", f"/api/documentos/{cid}", t=tk["maestra"])[0])
    prueba("8.5 Un lector no cambia el nombre", 403, r("PUT", f"/api/documentos/{bdoc}/nombre", {"nombre": "X"}, tk["visitante"])[0])
    prueba("8.5 Un editor cambia el nombre desde la lista", "Fotosíntesis y respiración", (r("PUT", f"/api/documentos/{bdoc}/nombre", {"nombre": "Fotosíntesis y respiración"}, tk["alumno1"])[1] or {}).get("nombre"))
    prueba("8.5 …y el nombre nuevo llega al contenido", "Fotosíntesis y respiración", reg(r("GET", f"/api/documentos/{bdoc}", t=tk["alumno2"]), "_doc", "nombre"))
    prueba("8.5 Un nombre vacío no se acepta", 400, r("PUT", f"/api/documentos/{bdoc}/nombre", {"nombre": "  "}, tk["alumno1"])[0])
    prueba("8.5 Un lector no cambia la carpeta", 403, r("PUT", f"/api/documentos/{bdoc}/carpeta", {"carpeta": "Ciencias"}, tk["visitante"])[0])
    prueba("8.5 Un editor lo pone en una carpeta", "Ciencias", (r("PUT", f"/api/documentos/{bdoc}/carpeta", {"carpeta": "  Ciencias "}, tk["alumno1"])[1] or {}).get("carpeta"))
    prueba("8.5 …la carpeta sale en el espacio", ["Ciencias"], (r("GET", f"/api/espacios/{salon}", t=tk["visitante"])[1] or {}).get("carpetas"))
    prueba("8.5 Renombrar la carpeta cambia sus documentos", 1, (r("PUT", f"/api/espacios/{salon}/carpetas", {"de": "Ciencias", "a": "Biología"}, tk["alumno2"])[1] or {}).get("documentos"))
    prueba("8.5 Un lector no renombra carpetas", 403, r("PUT", f"/api/espacios/{salon}/carpetas", {"de": "Biología", "a": "X"}, tk["visitante"])[0])
    dl = lambda t: next((d for d in (r("GET", f"/api/espacios/{salon}", t=t)[1] or {}).get("lista", []) if d["id"] == bdoc), {})
    prueba("8.5 Un lector sí puede destacar (es su propia marca)", 200, r("PUT", f"/api/documentos/{bdoc}/destacado", {"destacado": True}, tk["visitante"])[0])
    prueba("8.5 …y lo ve destacado en su lista", [uid["visitante"]], dl(tk["visitante"]).get("destacadoPor"))
    prueba("8.5 …pero los demás no ven de quién es la marca", None, dl(tk["alumno1"]).get("destacadoPor"))
    busca = lambda q, t: [x["id"] for x in (r("GET", f"/api/espacios/{salon}/buscar?q={q}", t=t)[1] or [])]
    prueba("8.5 Buscar encuentra el texto de adentro", True, bdoc in busca("CLOROFILA", tk["visitante"]))
    prueba("8.5 …también sin acentos", True, bdoc in busca("fotosintesis", tk["visitante"]))
    prueba("8.5 Quien no es del espacio no busca en él", 403, r("GET", f"/api/espacios/{salon}/buscar?q=luz", t=tok["lectora"])[0])
    pl = r("POST", f"/api/documentos/{bdoc}/copia", {"plantilla": True}, tk["alumno1"])[1] or {}
    prueba("8.5 Un editor guarda el documento como plantilla del espacio", True, pl.get("plantilla"))
    nv = r("POST", f"/api/documentos/{pl.get('id', 'X')}/copia", {"nombre": "Desde plantilla"}, tk["alumno2"])[1] or {}
    prueba("8.5 Un documento nuevo desde la plantilla ya no es plantilla", [False, "Desde plantilla"], [nv.get("plantilla"), nv.get("nombre")])
    r("POST", f"/api/documentos/{bdoc}/ops", lote("a1", {"bloque": "com1", "campos": {"tipo": "comentario", "texto": "Revisa esto @alumno2, por favor", "autorId": uid["alumno1"], "autor": "alumno1"}}), tk["alumno1"])
    prueba("8.5 La persona mencionada en un comentario tiene un aviso", 1, (r("GET", f"/api/espacios/{salon}", t=tk["alumno2"])[1] or {}).get("avisos"))
    avs = r("GET", f"/api/espacios/{salon}/avisos", t=tk["alumno2"])[1] or [{}]
    prueba("8.5 …dice quién la mencionó y dónde", ["alumno1", bdoc], [avs[0].get("por"), avs[0].get("docId")])
    prueba("8.5 …y al verlo queda leído", 0, (r("GET", f"/api/espacios/{salon}", t=tk["alumno2"])[1] or {}).get("avisos"))
    prueba("8.5 A quien no mencionan no le llega nada", 0, (r("GET", f"/api/espacios/{salon}", t=tk["maestra"])[1] or {}).get("avisos"))
    prueba("8.5 Un editor no crea el enlace para ver", 403, r("POST", f"/api/documentos/{bdoc}/enlace-ver", t=tk["alumno1"])[0])
    enl = (r("POST", f"/api/documentos/{bdoc}/enlace-ver", t=tk["maestra"])[1] or {}).get("enlace", "")
    prueba("8.5 El propietario crea el enlace para ver", True, len(enl) >= 40)
    pv = r("GET", f"/api/ver/{enl}")
    prueba("8.5 Con el enlace se ve el documento sin cuenta", 200, pv[0])
    prueba("8.5 …sin los comentarios", False, "com1" in (((pv[1] or {}).get("estado") or {}).get("bloques") or {}))
    prueba("8.5 Los miembros no ven el enlace en la lista", None, dl(tk["alumno1"]).get("enlaceVer"))
    prueba("8.5 Un enlace inventado no sirve", 404, r("GET", "/api/ver/" + "x" * 43)[0])
    r("DELETE", f"/api/documentos/{bdoc}/enlace-ver", t=tk["maestra"])
    prueba("8.5 Al quitar el enlace deja de servir", 404, r("GET", f"/api/ver/{enl}")[0])
    enl2 = (r("POST", f"/api/documentos/{bdoc}/enlace-ver", t=tk["maestra"])[1] or {}).get("enlace", "")
    r("DELETE", f"/api/documentos/{bdoc}", t=tk["alumno1"])
    prueba("8.5 Un documento en la papelera no se ve con su enlace", 404, r("GET", f"/api/ver/{enl2}")[0])
    prueba("8.5 Un editor no vacía la papelera", 403, r("DELETE", f"/api/espacios/{salon}/papelera", t=tk["alumno1"])[0])
    prueba("8.5 El propietario vacía la papelera", 200, r("DELETE", f"/api/espacios/{salon}/papelera", t=tk["maestra"])[0])
    prueba("8.5 …y ya no se puede restaurar", 404, r("POST", f"/api/documentos/{bdoc}/restaurar", t=tk["maestra"])[0])

    # Fase 9: leer una dirección web nunca toca la red interna; la biblioteca respeta los permisos
    web = lambda url, t=tk["alumno1"]: r("GET", "/api/fuentes/web?url=" + urllib.parse.quote(url, safe=""), t=t)[0]
    prueba("9 Sin sesión no se leen direcciones", 401, r("GET", "/api/fuentes/web?url=https%3A%2F%2Fexample.com")[0])
    prueba("9 No lee el propio servidor (localhost)", 403, web("http://localhost/"))
    prueba("9 No lee 127.0.0.1", 403, web("http://127.0.0.1/"))
    prueba("9 No lee 127.0.0.1 escrito como número (2130706433)", 403, web("http://2130706433/"))
    prueba("9 No lee 127.0.0.1 en hexadecimal (0x7f000001)", 403, web("http://0x7f000001/"))
    prueba("9 No lee 127.0.0.1 abreviado (127.1): inválida o interna", True, web("http://127.1/") in (400, 403))
    prueba("9 No lee 127.0.0.1 con ceros a la izquierda (0177.0.0.1)", 403, web("http://0177.0.0.1/"))
    prueba("9 No lee 0.0.0.0", 403, web("http://0.0.0.0/"))
    prueba("9 No lee la red del salón (192.168.x)", 403, web("http://192.168.1.10/"))
    prueba("9 No lee redes privadas (10.x)", 403, web("http://10.0.0.1/"))
    prueba("9 No lee 172.16.x", 403, web("http://172.16.5.4/"))
    prueba("9 No lee los datos internos de la nube (169.254.169.254)", 403, web("http://169.254.169.254/latest/meta-data/"))
    prueba("9 No lee la red compartida del proveedor (100.64.x)", 403, web("http://100.64.0.1/"))
    prueba("9 No lee ::1 (IPv6 del propio equipo)", 403, web("http://[::1]/"))
    prueba("9 No lee ::ffff:127.0.0.1", 403, web("http://[::ffff:127.0.0.1]/"))
    prueba("9 No lee fd00:: (IPv6 privada)", 403, web("http://[fd00::1]/"))
    prueba("9 No lee nombres .local", 403, web("http://impresora.local/"))
    prueba("9 Solo los puertos 80 y 443", 400, web("http://127.0.0.1:8092/api/red/info"))
    prueba("9 Ni con un puerto raro en un sitio público", 400, web("http://example.com:22/"))
    prueba("9 Solo http y https (file:)", 400, web("file:///etc/passwd"))
    prueba("9 Solo http y https (ftp:)", 400, web("ftp://example.com/"))
    prueba("9 Sin usuario ni contraseña en la dirección", 400, web("http://usuario:clave@example.com/"))
    prueba("9 Un DOI inválido", 400, r("GET", "/api/fuentes/doi?doi=hola", t=tk["alumno1"])[0])
    prueba("9 Un ISBN inválido", 400, r("GET", "/api/fuentes/isbn?isbn=123", t=tk["alumno1"])[0])
    prueba("9 Un conjunto de datos que no existe", 400, r("GET", "/api/fuentes/datos/borrar-todo", t=tk["alumno1"])[0])
    fte = {"fuente": {"tipo": "libro", "titulo": "Cien años de soledad", "autores": [{"familia": "García Márquez", "nombres": "Gabriel"}], "anio": "1967", "editorial": "Sudamericana", "otro": "x"}, "texto": "Muchos años después, frente al pelotón de fusilamiento…"}
    prueba("9 Quien no es del espacio no ve su biblioteca", 403, r("GET", f"/api/espacios/{salon}/biblioteca", t=tok["lectora"])[0])
    prueba("9 Un lector no agrega a la biblioteca", 403, r("POST", f"/api/espacios/{salon}/biblioteca", fte, tk["visitante"])[0])
    prueba("9 Una fuente sin título ni dirección no se guarda", 400, r("POST", f"/api/espacios/{salon}/biblioteca", {"fuente": {"tipo": "libro"}}, tk["alumno1"])[0])
    bib = r("POST", f"/api/espacios/{salon}/biblioteca", fte, tk["alumno1"])
    prueba("9 Un editor guarda una fuente con su texto", 200, bib[0])
    fid = (bib[1] or {}).get("id", "X")
    prueba("9 …los campos desconocidos no se guardan", None, ((bib[1] or {}).get("fuente") or {}).get("otro"))
    prueba("9 Un lector ve la biblioteca", 1, len(r("GET", f"/api/espacios/{salon}/biblioteca", t=tk["visitante"])[1] or []))
    prueba("9 …y busca en sus textos (sin Internet)", 1, len(r("GET", f"/api/espacios/{salon}/biblioteca?q=peloton", t=tk["visitante"])[1] or []))
    prueba("9 …y lee el texto guardado", True, "pelotón" in ((r("GET", f"/api/espacios/{salon}/biblioteca/{fid}", t=tk["visitante"])[1] or {}).get("texto") or ""))
    prueba("9 Guardar la misma fuente no la repite", 1, (r("POST", f"/api/espacios/{salon}/biblioteca", fte, tk["alumno2"]), len(r("GET", f"/api/espacios/{salon}/biblioteca", t=tk["alumno1"])[1] or []))[1])
    prueba("9 Un lector no la quita", 403, r("DELETE", f"/api/espacios/{salon}/biblioteca/{fid}", t=tk["visitante"])[0])
    prueba("9 Un editor la quita", 200, r("DELETE", f"/api/espacios/{salon}/biblioteca/{fid}", t=tk["alumno1"])[0])

    # ================================================================ versión 0.12.1
    # Cabeceras de seguridad
    cp, ca = cabeceras("/"), cabeceras("/api/red/info")
    prueba("12.1 La página dice que no se adivinen tipos de archivo", "nosniff", cp.get("x-content-type-options"))
    prueba("12.1 …que no se meta dentro de otra página", "SAMEORIGIN", cp.get("x-frame-options"))
    prueba("12.1 …y que no se diga de dónde viene", "no-referrer", cp.get("referrer-policy"))
    prueba("12.1 …y solo corre programas de este servidor", True, "script-src 'self'" in cp.get("content-security-policy", "") and "object-src 'none'" in cp.get("content-security-policy", ""))
    prueba("12.1 La API también lleva las cabeceras", ["nosniff", "no-referrer"], [ca.get("x-content-type-options"), ca.get("referrer-policy")])

    # Cambiar la contraseña sabiendo la actual
    r("POST", "/api/cuentas/registro", {"nombre": "cambia", "contrasena": CL})
    c1 = r("POST", "/api/cuentas/sesion", {"nombre": "cambia", "contrasena": CL})[1]["token"]
    c2 = r("POST", "/api/cuentas/sesion", {"nombre": "cambia", "contrasena": CL})[1]["token"]
    NV = "Otra-Clave-Nueva-9"
    prueba("12.1 Cambiar la contraseña pide sesión", 401, r("PUT", "/api/cuentas/contrasena", {"actual": CL, "nueva": NV})[0])
    prueba("12.1 …y la contraseña actual correcta", 400, r("PUT", "/api/cuentas/contrasena", {"actual": "no-es-esta", "nueva": NV}, c1)[0])
    prueba("12.1 …y una nueva de 8 o más", 400, r("PUT", "/api/cuentas/contrasena", {"actual": CL, "nueva": "corta"}, c1)[0])
    prueba("12.1 Un invitado no tiene contraseña que cambiar", 403, r("PUT", "/api/cuentas/contrasena", {"actual": "x", "nueva": NV}, ti)[0])
    cam = r("PUT", "/api/cuentas/contrasena", {"actual": CL, "nueva": NV}, c1)
    prueba("12.1 Con la actual correcta, cambia", 200, cam[0])
    c3 = (cam[1] or {}).get("token")
    prueba("12.1 …y da una sesión nueva para ese equipo", 200, r("GET", "/api/cuentas/yo", t=c3)[0])
    prueba("12.1 …las demás sesiones se cierran", [401, 401], [r("GET", "/api/espacios", t=c1)[0], r("GET", "/api/espacios", t=c2)[0]])
    prueba("12.1 …la contraseña vieja ya no entra", 401, r("POST", "/api/cuentas/sesion", {"nombre": "cambia", "contrasena": CL})[0])
    prueba("12.1 …la nueva sí", 200, r("POST", "/api/cuentas/sesion", {"nombre": "cambia", "contrasena": NV})[0])

    # Boletos de un solo uso para el canal en vivo (el token ya no va en la dirección)
    prueba("12.1 Pedir un boleto pide sesión", 401, r("POST", "/api/cuentas/boleto", {})[0])
    bol = lambda t: (r("POST", "/api/cuentas/boleto", {}, t)[1] or {}).get("boleto", "")
    b1 = bol(tk["maestra"])
    prueba("12.1 Con sesión se obtiene un boleto", True, len(b1) >= 20 and b1 != tk["maestra"])
    prueba("12.1 El canal en vivo abre con el boleto", [200, "text/event-stream"], list(canal(f"/api/espacios/{salon}/eventos?boleto={b1}&cliente=prueba-b")))
    prueba("12.1 …y el mismo boleto no sirve dos veces", 401, canal(f"/api/espacios/{salon}/eventos?boleto={b1}&cliente=prueba-b")[0])
    prueba("12.1 Un boleto inventado no abre nada", 401, canal(f"/api/espacios/{salon}/eventos?boleto=inventado&cliente=prueba-b")[0])
    prueba("12.1 El boleto de otra persona no da su permiso (espacio ajeno)", 403, canal(f"/api/espacios/{salon}/eventos?boleto={bol(tok['duena'])}&cliente=prueba-b")[0])
    prueba("12.1 Sin boleto ni token el canal no abre", 401, canal(f"/api/espacios/{salon}/eventos?cliente=prueba-b")[0])
    boleto_viejo = bol(tk["maestra"]); t_boleto = time.time()   # se prueba que vence, más abajo

    # Almacenamiento de la cuenta: cuánto ocupa lo suyo y cuánto tiene permitido
    prueba("12.1 Ver el almacenamiento pide sesión", 401, r("GET", "/api/cuentas/almacenamiento")[0])
    time.sleep(2)   # el estado de los documentos se escribe en segundo plano
    alm = r("GET", "/api/cuentas/almacenamiento", t=tk["maestra"])[1] or {}
    prueba("12.1 La cuenta ve cuánto ocupa y su límite", True, alm.get("uso", 0) > 0 and alm.get("documentos", 0) >= 3 and (EXTERNO != "" or alm.get("cuota") == 200 * 1024 * 1024))
    prueba("12.1 …solo de los espacios que son suyos", [salon], [e["id"] for e in alm.get("espacios", [])])
    alm1 = r("GET", "/api/cuentas/almacenamiento", t=tk["alumno1"])[1] or {}
    prueba("12.1 …lo que escribe en espacios ajenos no le cuenta", [0, []], [alm1.get("uso"), alm1.get("espacios")])

    if not EXTERNO:
        # Los documentos se guardan comprimidos en el servidor
        estados = glob.glob(os.path.join(D, "docs", "*", "estado.json"))
        prueba("12.1 El estado de los documentos se guarda comprimido", True, len(estados) > 0 and all(open(f, "rb").read(2) == b"\x1f\x8b" for f in estados))
        fotos = glob.glob(os.path.join(D, "docs", "*", "v", "*.json"))
        r("POST", f"/api/documentos/{pres}/versiones", {"etiqueta": "Para la prueba"}, tk["maestra"])
        fotos = glob.glob(os.path.join(D, "docs", "*", "v", "*.json"))
        prueba("12.1 …y las fotos de sus versiones también", True, len(fotos) > 0 and all(open(f, "rb").read(2) == b"\x1f\x8b" for f in fotos))

        # Bloqueo de intentos por red: quien falla desde su red no deja fuera al dueño
        r("POST", "/api/cuentas/registro", {"nombre": "asediada", "contrasena": CL})
        mala, buena = "203.0.113.5", "198.51.100.7"
        cods = [r("POST", "/api/cuentas/sesion", {"nombre": "asediada", "contrasena": "mala"}, de=mala)[0] for _ in range(6)]
        prueba("12.1 6 intentos fallidos desde una red la bloquean ahí", 423, cods[-1])
        prueba("12.1 …ni con la contraseña correcta entra desde esa red", 423, r("POST", "/api/cuentas/sesion", {"nombre": "asediada", "contrasena": CL}, de=mala)[0])
        prueba("12.1 …pero su dueño entra desde otra red", 200, r("POST", "/api/cuentas/sesion", {"nombre": "asediada", "contrasena": CL}, de=buena)[0])
        prueba("12.1 …y desde el propio equipo", 200, r("POST", "/api/cuentas/sesion", {"nombre": "asediada", "contrasena": CL})[0])

        # Tope de cuentas nuevas por hora desde una misma red
        granja = "203.0.113.77"
        regs = [r("POST", "/api/cuentas/registro", {"nombre": f"granja{i}", "contrasena": CL}, de=granja)[0] for i in range(31)]
        prueba("12.1 Una red crea hasta 30 cuentas por hora", [201] * 30, regs[:30])
        prueba("12.1 …la 31 se rechaza", 429, regs[30])
        prueba("12.1 …otra red sí puede crear la suya", 201, r("POST", "/api/cuentas/registro", {"nombre": "vecina", "contrasena": CL}, de="198.51.100.8")[0])
        prueba("12.1 …y el propio equipo no tiene tope", 201, r("POST", "/api/cuentas/registro", {"nombre": "delequipo", "contrasena": CL})[0])

    # Borrar la cuenta
    r("POST", "/api/cuentas/registro", {"nombre": "borrable", "contrasena": CL})
    sb = r("POST", "/api/cuentas/sesion", {"nombre": "borrable", "contrasena": CL})[1]
    tb, ub = sb["token"], sb["usuario"]["id"]
    eb = r("POST", "/api/espacios", {"nombre": "Se va conmigo"}, tb)[1]["id"]
    r("PUT", f"/api/espacios/{eb}/accesos", {"usuario": "alumno1", "permiso": "EDICION"}, tb)
    db = r("POST", f"/api/espacios/{eb}/documentos", {"nombre": "Mío", "modo": "TEXTO", "ops": []}, tb)[1]["id"]
    r("PUT", f"/api/espacios/{salon}/accesos", {"usuario": "borrable", "permiso": "EDICION"}, tk["maestra"])
    dsalon = r("POST", f"/api/espacios/{salon}/documentos", {"nombre": "Lo dejé en el salón", "modo": "TEXTO", "ops": []}, tb)[1]["id"]
    miembros = lambda: [a.get("id") for a in ((r("GET", f"/api/espacios/{salon}/accesos", t=tk["maestra"])[1] or {}).get("miembros") or [])]
    cuantos = lambda: (r("GET", f"/api/espacios/{salon}", t=tk["maestra"])[1] or {}).get("miembros")
    antes = cuantos()
    prueba("12.1 (antes) está en el salón de la maestra", True, ub in miembros())
    prueba("12.1 Borrar la cuenta pide sesión", 401, r("POST", "/api/cuentas/eliminar", {"contrasena": CL})[0])
    prueba("12.1 …y la contraseña", 400, r("POST", "/api/cuentas/eliminar", {}, tb)[0])
    prueba("12.1 …la correcta", 400, r("POST", "/api/cuentas/eliminar", {"contrasena": "no-es-esta"}, tb)[0])
    prueba("12.1 Un invitado no borra cuentas", 403, r("POST", "/api/cuentas/eliminar", {"contrasena": "x"}, ti)[0])
    prueba("12.1 (tras los intentos) la cuenta sigue ahí", 200, r("GET", f"/api/documentos/{db}", t=tb)[0])
    bo = r("POST", "/api/cuentas/eliminar", {"contrasena": CL}, tb)
    prueba("12.1 Con su contraseña, la cuenta se borra", [200, 1, 1], [bo[0], (bo[1] or {}).get("espacios"), (bo[1] or {}).get("documentos")])
    prueba("12.1 …su sesión deja de servir", 401, r("GET", "/api/espacios", t=tb)[0])
    prueba("12.1 …ya no puede entrar", 401, r("POST", "/api/cuentas/sesion", {"nombre": "borrable", "contrasena": CL})[0])
    prueba("12.1 …su espacio ya no existe para quien estaba invitado", 404, r("GET", f"/api/espacios/{eb}", t=tk["alumno1"])[0])
    prueba("12.1 …ni sus documentos", 404, r("GET", f"/api/documentos/{db}", t=tk["alumno1"])[0])
    prueba("12.1 …sale de los espacios de otros", [False, antes - 1], [ub in miembros(), cuantos()])
    prueba("12.1 …pero lo que escribió ahí se queda", 200, r("GET", f"/api/documentos/{dsalon}", t=tk["maestra"])[0])
    prueba("12.1 …y su nombre queda libre", 201, r("POST", "/api/cuentas/registro", {"nombre": "borrable", "contrasena": CL})[0])
    prueba("12.1 …la cuenta nueva no hereda nada", [], r("GET", "/api/espacios", t=r("POST", "/api/cuentas/sesion", {"nombre": "borrable", "contrasena": CL})[1]["token"])[1])

    if not EXTERNO:
        # Reiniciar el servidor: lo guardado comprimido abre igual, y también un estado sin
        # comprimir como los que dejaron las versiones anteriores.
        time.sleep(2)
        f_pres = os.path.join(D, "docs", pres, "estado.json")
        srv.terminate(); srv.wait(60)
        plano = gzip.open(f_pres, "rb").read()
        open(f_pres, "wb").write(plano)
        srv = arrancar(); esperar()
        tm = r("POST", "/api/cuentas/sesion", {"nombre": "maestra", "contrasena": CL})[1]["token"]
        bl2 = (r("GET", f"/api/documentos/{pres}", t=tm)[1] or {}).get("estado", {}).get("bloques", {})
        prueba("12.1 Tras reiniciar, un estado sin comprimir (versión anterior) abre", 300, ((bl2.get("fig1") or {}).get("x") or {}).get("v"))
        xs2 = [e["x"] for e in (r("GET", f"/api/documentos/{tdoc}", t=tm)[1] or {}).get("estado", {}).get("seq", {}).get("cuerpo", {}).get("ins", [])]
        prueba("12.1 …y uno comprimido también", True, " uno" in xs2)
        prueba("12.1 …con sus versiones", True, len(r("GET", f"/api/documentos/{pres}/versiones", t=tm)[1] or []) >= 1 and r("GET", f"/api/documentos/{pres}/versiones/1", t=tm)[0] == 200)
        r("POST", f"/api/documentos/{pres}/ops", lote("m1", {"bloque": "fig1", "campos": {"x": 301}}), tm)
        time.sleep(2.5)
        prueba("12.1 …y al volver a guardarse queda comprimido", b"\x1f\x8b", open(f_pres, "rb").read(2))
        tk["maestra"] = tm
        tk["alumno1"] = r("POST", "/api/cuentas/sesion", {"nombre": "alumno1", "contrasena": CL})[1]["token"]

    # 3.6 Entrega con fecha límite
    edoc = r("POST", f"/api/espacios/{salon}/documentos", {"nombre": "Tarea 1", "modo": "TEXTO", "ops": []}, tk["alumno1"])[1]["id"]
    prueba("3.6 Un editor no fija la fecha de entrega", 403, r("PUT", f"/api/documentos/{edoc}/entrega", {"limite": int(time.time() * 1000) + 3600_000}, tk["alumno1"])[0])
    if not os.environ.get("NOM_PRUEBA_RAPIDA"):
        prueba("3.6 El propietario fija la fecha límite", 200, r("PUT", f"/api/documentos/{edoc}/entrega", {"limite": int(time.time() * 1000) + 62_000}, tk["maestra"])[0])
        prueba("3.6 Antes de la fecha, el alumno escribe", 0, rechazadas(r("POST", f"/api/documentos/{edoc}/ops", lote("a1", {"bloque": "cuerpo", "s": {"k": "i", "iz": None, "x": "Mi tarea"}}), tk["alumno1"])))
        print("(esperando 64 s a que pase la fecha límite de entrega…)", flush=True)
        time.sleep(64)
        prueba("3.6 Al pasar la fecha, el alumno ya no puede escribir", 403, r("POST", f"/api/documentos/{edoc}/ops", lote("a1", {"bloque": "cuerpo", "s": {"k": "i", "iz": None, "x": "tarde"}}), tk["alumno1"])[0])
        prueba("3.6 …y lo abre en solo lectura", "LECTURA", (r("GET", f"/api/documentos/{edoc}", t=tk["alumno1"])[1] or {}).get("permiso"))
        prueba("3.6 El propietario sí puede", 200, r("POST", f"/api/documentos/{edoc}/ops", lote("m1", {"bloque": "_doc", "campos": {"nota": "revisado"}}), tk["maestra"])[0])
        if not EXTERNO or time.time() - t_boleto > 31:
            prueba("12.1 Un boleto sin usar vence a los 30 segundos", 401, canal(f"/api/espacios/{salon}/eventos?boleto={boleto_viejo}&cliente=prueba-b")[0])
finally:
    if srv: srv.kill(); srv.wait(30)
    shutil.rmtree(D, ignore_errors=True)
for n, e, o, ok in res: print(("OK " if ok else "MAL"), f"{n:<66} esperado {e} obtenido {o}")
print(sum(ok for *_, ok in res), "de", len(res))
sys.exit(0 if all(ok for *_, ok in res) else 1)
