#!/usr/bin/env python3
"""Prueba de carga: muchas personas escribiendo A LA VEZ en el mismo documento.

Cada persona es una cuenta de verdad (registro, sesión, permiso de edición en el espacio), con su
propio canal en vivo abierto, y teclea al ritmo de una persona (un envío cada 0.3 s con 1 o 2
letras). Se mide:
  - cuánto tarda el servidor en aceptar cada envío,
  - cuánto tarda en llegarle a las DEMÁS personas por el canal en vivo,
  - si a alguien le faltó algún cambio y si el documento final tiene TODAS las letras.

No hay un tope de personas en el código: esta prueba dice hasta dónde aguanta el equipo.

    python3 pruebas/carga.py                                  # contra http://localhost:8099
    python3 pruebas/carga.py --personas 5,10,25,50,100 --segundos 30
    NOM_BASE=https://nomcolab.dpdns.org python3 pruebas/carga.py --personas 10 --borrar

Desde el propio equipo las cuentas no cuentan para el tope de registros por hora; contra otro
servidor sí (30 por red y por hora): ahí se usan pocas personas y --borrar al final.
"""
import argparse, http.client, json, os, random, statistics, string, sys, threading, time, urllib.parse, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("--base", default=os.environ.get("NOM_BASE", "http://localhost:8099"))
ap.add_argument("--personas", default="5,10,25,50")
ap.add_argument("--segundos", type=float, default=20)
ap.add_argument("--cada", type=float, default=0.3, help="segundos entre envíos de cada persona")
ap.add_argument("--borrar", action="store_true", help="borrar las cuentas de prueba al terminar")
ap.add_argument("--salida", default="", help="archivo JSON con los resultados")
A = ap.parse_args()
B = A.base.rstrip("/")
U = urllib.parse.urlsplit(B)
CL = "Carga-" + "".join(random.choice(string.ascii_letters) for _ in range(12))
AG = {"User-Agent": "NOM-COLAB-pruebas/1.0"}   # Cloudflare rechaza el de urllib


def r(m, u, b=None, t=None):
    h = dict(AG, **{"Content-Type": "application/json"})
    if t: h["Authorization"] = "Bearer " + t
    q = urllib.request.Request(B + u, method=m, data=json.dumps(b).encode() if b is not None else None, headers=h)
    try:
        with urllib.request.urlopen(q, timeout=60) as x:
            c = x.read(); return x.status, (json.loads(c) if c[:1] in b"{[" else None)
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        return 0, str(e)


def cuenta(nombre):
    s, _ = r("POST", "/api/cuentas/registro", {"nombre": nombre, "contrasena": CL, "acepto": "2026-11-13"})
    if s not in (200, 201): raise SystemExit(f"No se pudo registrar {nombre}: HTTP {s}")
    s = r("POST", "/api/cuentas/sesion", {"nombre": nombre, "contrasena": CL})[1]
    return s["token"]


def conexion():
    return (http.client.HTTPSConnection if U.scheme == "https" else http.client.HTTPConnection)(U.netloc, timeout=90)


class Persona:
    def __init__(self, i, token, doc, enviados, lock):
        self.i, self.tok, self.doc = i, token, doc
        self.cli = f"k{i}"
        self.enviados, self.lock = enviados, lock   # id de op -> hora de envío (compartido)
        self.t = 0
        self.letras = 0
        self.lat_envio, self.lat_llega, self.errores = [], [], []
        self.recibidas = set()
        self.listo = threading.Event()
        self.alto = threading.Event()

    def escuchar(self):
        try:
            bol = r("POST", "/api/cuentas/boleto", {}, self.tok)[1]["boleto"]
            c = conexion()
            c.request("GET", f"{U.path}/api/documentos/{self.doc}/eventos?boleto={bol}&cliente={self.cli}",
                      headers=dict(AG, Accept="text/event-stream"))
            res = c.getresponse()
            if res.status != 200: self.errores.append(f"canal HTTP {res.status}"); self.listo.set(); return
            self.listo.set()
            evento, datos = None, []
            while not self.alto.is_set():
                linea = res.fp.readline()
                if not linea: break
                linea = linea.decode().rstrip("\r\n")
                if linea.startswith("event:"): evento = linea[6:].strip()
                elif linea.startswith("data:"): datos.append(linea[5:].lstrip())
                elif linea == "":
                    if evento == "ops" and datos:
                        ahora = time.time()
                        m = json.loads("\n".join(datos))
                        if m.get("cliente") != self.cli:
                            for o in m.get("ops", []):
                                oid = o.get("id")
                                if oid and oid not in self.recibidas:
                                    self.recibidas.add(oid)
                                    with self.lock: t0 = self.enviados.get(oid)
                                    if t0: self.lat_llega.append(ahora - t0)
                    evento, datos = None, []
        except Exception as e:
            if not self.alto.is_set(): self.errores.append("canal: " + str(e)[:80])
            self.listo.set()

    def teclear(self, hasta):
        while time.time() < hasta:
            x = "".join(random.choice("abcdefghijklmnñopqrstuvwxyz ") for _ in range(random.randint(1, 2)))
            inicio = self.t + 1          # cada letra es (persona, número): el lote ocupa inicio..inicio+len-1
            self.t += len(x)
            oid = f"{self.cli}:{inicio}"
            op = {"id": oid, "t": inicio, "n": self.cli, "campos": {}, "bloque": "cuerpo",
                  "s": {"k": "i", "iz": None, "x": x}}
            t0 = time.time()
            with self.lock: self.enviados[oid] = t0
            s, d = r("POST", f"/api/documentos/{self.doc}/ops", {"ops": [op], "cliente": self.cli, "dispositivo": "carga"}, self.tok)
            self.lat_envio.append(time.time() - t0)
            if s != 200 or (d or {}).get("rechazadas"): self.errores.append(f"envío HTTP {s} {str(d)[:60]}")
            else: self.letras += len(x)
            time.sleep(max(0, A.cada * random.uniform(0.8, 1.2)))


def pct(v, p):
    if not v: return None
    v = sorted(v); return v[min(len(v) - 1, int(round(p / 100 * (len(v) - 1))))]


def ronda(n, duena, tok_duena, nombres, tokens):
    esp = r("POST", "/api/espacios", {"nombre": f"Carga {n}"}, tok_duena)[1]["id"]
    for nom in nombres[:n]: r("PUT", f"/api/espacios/{esp}/accesos", {"usuario": nom, "permiso": "EDICION"}, tok_duena)
    doc = r("POST", f"/api/espacios/{esp}/documentos", {"nombre": f"Acta a {n}", "modo": "TEXTO", "ops": []}, tok_duena)[1]["id"]
    enviados, lock = {}, threading.Lock()
    ps = [Persona(i, tokens[i], doc, enviados, lock) for i in range(n)]
    oyentes = [threading.Thread(target=p.escuchar, daemon=True) for p in ps]
    for h in oyentes: h.start()
    for p in ps: p.listo.wait(30)
    time.sleep(1)
    hasta = time.time() + A.segundos
    escritores = [threading.Thread(target=p.teclear, args=(hasta,)) for p in ps]
    for h in escritores: h.start()
    for h in escritores: h.join()
    time.sleep(3)   # que termine de llegar lo último
    for p in ps: p.alto.set()
    estado = r("GET", f"/api/documentos/{doc}", t=tok_duena)[1]["estado"]
    en_doc = sum(len(o.get("x", "")) for o in estado["seq"]["cuerpo"]["ins"])
    escritas = sum(p.letras for p in ps)
    total_ops = len(enviados)
    faltaron = 0
    for p in ps:
        esperadas = {oid for oid in enviados if not oid.startswith(p.cli + ":")}
        faltaron += len(esperadas - p.recibidas)
    env = [x for p in ps for x in p.lat_envio]
    lle = [x for p in ps for x in p.lat_llega]
    errores = [e for p in ps for e in p.errores]
    res = {
        "personas": n, "segundos": A.segundos, "envios": total_ops, "envios_por_segundo": round(total_ops / A.segundos, 1),
        "letras_escritas": escritas, "letras_en_documento": en_doc, "documento_completo": escritas == en_doc,
        "entregas_esperadas": total_ops * (n - 1) - 0, "entregas_que_faltaron": faltaron,
        "envio_ms": {k: round(1000 * pct(env, q)) for k, q in (("p50", 50), ("p95", 95), ("max", 100))} if env else None,
        "llega_a_los_demas_ms": {k: round(1000 * pct(lle, q)) for k, q in (("p50", 50), ("p95", 95), ("max", 100))} if lle else None,
        "errores": len(errores), "ejemplos_de_error": sorted(set(errores))[:5],
    }
    r("DELETE", f"/api/documentos/{doc}", t=tok_duena)
    return res


def main():
    for _ in range(60):
        if r("GET", "/api/red/info")[0] == 200: break
        time.sleep(1)
    rondas = [int(x) for x in A.personas.split(",")]
    sufijo = "".join(random.choice("abcdefghjkmnpqrstuvwxyz") for _ in range(4))
    duena = f"carga_{sufijo}_d"
    tok_duena = cuenta(duena)
    nombres = [f"carga_{sufijo}_{i}" for i in range(max(rondas))]
    print(f"Creando {len(nombres)} cuentas en {B}…", flush=True)
    tokens = [cuenta(nom) for nom in nombres]
    resultados = []
    for n in rondas:
        print(f"\n=== {n} personas escribiendo a la vez durante {A.segundos:.0f} s", flush=True)
        res = ronda(n, duena, tok_duena, nombres, tokens)
        resultados.append(res)
        ok = res["documento_completo"] and res["entregas_que_faltaron"] == 0 and res["errores"] == 0
        print(f"  envíos: {res['envios']} ({res['envios_por_segundo']}/s) · letras {res['letras_escritas']} → en el documento {res['letras_en_documento']}")
        print(f"  servidor acepta: {res['envio_ms']} ms · llega a los demás: {res['llega_a_los_demas_ms']} ms")
        print(f"  entregas que faltaron: {res['entregas_que_faltaron']} · errores: {res['errores']} {res['ejemplos_de_error']}")
        print("  " + ("CORRECTO" if ok else "FALLA"), flush=True)
    if A.borrar:
        for nom, tk in [(duena, tok_duena)] + list(zip(nombres, tokens)):
            r("POST", "/api/cuentas/eliminar", {"contrasena": CL, "confirmacion": "BORRAR"}, tk)
    if A.salida:
        json.dump(resultados, open(A.salida, "w"), ensure_ascii=False, indent=1)
    bien = all(x["documento_completo"] and x["entregas_que_faltaron"] == 0 and x["errores"] == 0 for x in resultados)
    print("\nResultado:", "todas las rondas correctas" if bien else "hubo fallas")
    sys.exit(0 if bien else 1)


main()
