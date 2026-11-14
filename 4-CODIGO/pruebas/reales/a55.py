"""Manejo del A55 por adb: toques reales, texto, capturas y árbol de accesibilidad (WebView incluido)."""
import subprocess, re, time, sys, os, xml.etree.ElementTree as ET
def _serie():
    """El A55: NOM_A55, o el primer equipo de `adb devices` (depuración inalámbrica)."""
    if os.environ.get("NOM_A55"): return os.environ["NOM_A55"]
    ls = [l.split()[0] for l in subprocess.run(["adb", "devices"], capture_output=True, text=True).stdout.splitlines()[1:] if l.strip().endswith("device")]
    return next((x for x in ls if "tls-connect" in x), ls[0] if ls else "")
SER = _serie()
D = os.environ.get("NOM_CAPTURAS", os.path.expanduser("~/.cache/nom-pruebas/capturas-reales")); os.makedirs(D, exist_ok=True)
def sh(c, t=60):
    return subprocess.run(["adb", "-s", SER, "shell", c], capture_output=True, text=True, timeout=t).stdout
def nodos():
    sh("uiautomator dump /sdcard/ui.xml >/dev/null 2>&1")
    x = subprocess.run(["adb", "-s", SER, "exec-out", "cat /sdcard/ui.xml"], capture_output=True, timeout=60).stdout
    try: r = ET.fromstring(x)
    except Exception: return []
    out = []
    for n in r.iter("node"):
        b = re.findall(r"\d+", n.get("bounds", "[0,0][0,0]"))
        x1, y1, x2, y2 = map(int, b)
        out.append(dict(t=n.get("text", "") or (("[" + n.get("class","").split(".")[-1] + "] " + n.get("hint","")) if "Edit" in n.get("class","") else ""), d=n.get("content-desc", ""), id=n.get("resource-id", ""),
                        c=n.get("class", "").split(".")[-1], cx=(x1 + x2) // 2, cy=(y1 + y2) // 2,
                        w=x2 - x1, h=y2 - y1, clk=n.get("clickable") == "true", foc=n.get("focused") == "true",
                        chk=n.get("checked") == "true", b=(x1, y1, x2, y2)))
    return out
def ver(filtro=None, maxn=80):
    """Lista compacta de lo que hay en pantalla con texto o descripción."""
    ns = [n for n in nodos() if (n["t"] or n["d"]) and n["w"] > 0 and n["h"] > 0]
    if filtro: ns = [n for n in ns if re.search(filtro, n["t"] + " " + n["d"], re.I)]
    for n in ns[:maxn]:
        print(f'{n["cx"]:4d},{n["cy"]:4d} {n["c"][:10]:10s} {"C" if n["clk"] else " "}{"F" if n["foc"] else " "} {(n["t"] or "")[:50]!r} {("d=" + n["d"][:40]) if n["d"] else ""}')
    return ns
def buscar(txt, exacto=False):
    for n in nodos():
        s = n["t"] or n["d"]
        if (s == txt) if exacto else (txt.lower() in (n["t"] + " " + n["d"]).lower()):
            if n["w"] > 0 and n["h"] > 0: return n
    return None
def tocar(x, y=None, espera=0.6):
    if isinstance(x, str):
        n = buscar(x)
        if not n: print("NO ENCONTRADO:", x); return False
        x, y = n["cx"], n["cy"]
    sh(f"input tap {x} {y}"); time.sleep(espera); return True
def largo(x, y, ms=900): sh(f"input swipe {x} {y} {x} {y} {ms}"); time.sleep(0.6)
def deslizar(x1, y1, x2, y2, ms=300): sh(f"input swipe {x1} {y1} {x2} {y2} {ms}"); time.sleep(0.5)
def escribir(t):
    # adb input text: espacios como %s; caracteres especiales escapados
    e = t.replace("\\", "\\\\").replace(" ", "%s")
    for ch in "()<>|;&*'\"`$!?#~":
        e = e.replace(ch, "\\" + ch)
    sh(f"input text {e}"); time.sleep(0.3)
def tecla(k): sh(f"input keyevent {k}"); time.sleep(0.3)
def cap(nombre, ancho=400):
    p = os.path.join(D, nombre)
    subprocess.run(f"adb -s {SER} exec-out screencap -p > {p}-full.png && convert {p}-full.png -resize {ancho}x {p}.png", shell=True)
    print(p + ".png")
def consola(desde=None):
    """Mensajes de consola del WebView (chromium) en logcat."""
    o = subprocess.run(["adb", "-s", SER, "logcat", "-d", "-v", "time", "-s", "chromium:*", "Console:*"], capture_output=True, text=True).stdout
    return o
if __name__ == "__main__":
    f = sys.argv[1] if len(sys.argv) > 1 else None
    ver(f)
def teclado_visible():
    return "mInputShown=true" in sh("dumpsys input_method | grep mInputShown")
def ocultar_teclado():
    if teclado_visible(): sh("input keyevent 4"); time.sleep(0.6)
# Teclado Samsung (inglés UK) del A55 a 1080x2340: se teclea con toques reales en el teclado (pasa por el IME).
_FILAS = {1668: "qwertyuiop", 1815: "asdfghjkl", 1965: "zxcvbnm"}
_X = {1668: [66, 171, 276, 381, 486, 591, 696, 801, 906, 1011], 1815: [120, 225, 330, 435, 540, 645, 750, 855, 960], 1965: [225, 330, 435, 540, 645, 750, 855]}
_NUM = dict(zip("1234567890", [66, 171, 276, 381, 486, 591, 696, 801, 906, 1011]))
def _pos(ch):
    for y, fila in _FILAS.items():
        if ch in fila: return (_X[y][fila.index(ch)], y)
    if ch in _NUM: return (_NUM[ch], 1527)
    if ch == " ": return (540, 2115)
    if ch == ",": return (225, 2115)
    if ch == ".": return (855, 2115)
    if ch == "\n": return (987, 2115)
    return None
def teclear_ime(texto):
    cmds = []
    for ch in texto:
        if ch.isupper():
            cmds.append("input tap 81 1965"); ch = ch.lower()
        p = _pos(ch)
        if p: cmds.append(f"input tap {p[0]} {p[1]}")
    sh("; ".join(cmds), t=120); time.sleep(0.3)
