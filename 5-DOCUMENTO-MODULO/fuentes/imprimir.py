"""Imprime modulo.html a PDF (tamaño carta) con LibreWolf/Firefox sin ventana, por WebDriver.

    python3 imprimir.py                      # deja el PDF en ../../ENTREGA/
    python3 imprimir.py salida.pdf

Necesita geckodriver (lo descarga Selenium la primera vez, o se instala aparte) y LibreWolf o
Firefox. No usa el módulo selenium: habla con geckodriver por HTTP.
"""
import base64, glob, json, os, shutil, socket, subprocess, sys, time, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
ENTRADA = os.path.join(AQUI, "modulo.html")
SALIDA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "..", "..", "ENTREGA", "Modulo web con BD, Azure y roles - NOM-COLAB.pdf")
GECKO = shutil.which("geckodriver") or (sorted(glob.glob(os.path.expanduser("~/.cache/selenium/geckodriver/*/*/geckodriver"))) or [None])[-1]
NAVEGADOR = shutil.which("librewolf") or shutil.which("firefox")
if not GECKO or not NAVEGADOR:
    sys.exit("Falta geckodriver o LibreWolf/Firefox")

s = socket.socket(); s.bind(("127.0.0.1", 0)); puerto = s.getsockname()[1]; s.close()
gd = subprocess.Popen([GECKO, "--port", str(puerto)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def pedir(metodo, ruta, cuerpo=None):
    r = urllib.request.Request(f"http://127.0.0.1:{puerto}{ruta}", method=metodo,
                               data=json.dumps(cuerpo).encode() if cuerpo is not None else None, headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=180))["value"]
try:
    for _ in range(50):
        try: urllib.request.urlopen(f"http://127.0.0.1:{puerto}/status", timeout=1); break
        except Exception: time.sleep(0.1)
    sid = pedir("POST", "/session", {"capabilities": {"alwaysMatch": {"browserName": "firefox", "moz:firefoxOptions": {
        "binary": NAVEGADOR, "args": ["-headless"], "prefs": {"privacy.resistFingerprinting": False}}}}})["sessionId"]
    pedir("POST", f"/session/{sid}/url", {"url": "file://" + ENTRADA})
    pedir("POST", f"/session/{sid}/execute/async", {"script": "const d=arguments[arguments.length-1]; document.fonts.ready.then(()=>setTimeout(()=>d(1),800))", "args": []})
    pdf = pedir("POST", f"/session/{sid}/print", {"background": True, "shrinkToFit": False, "scale": 1.0,
        "page": {"width": 21.59, "height": 27.94}, "margin": {"top": 0, "bottom": 0, "left": 0, "right": 0}})
    open(SALIDA, "wb").write(base64.b64decode(pdf))
    pedir("DELETE", f"/session/{sid}")
    print("listo:", os.path.normpath(SALIDA))
finally:
    gd.terminate()
