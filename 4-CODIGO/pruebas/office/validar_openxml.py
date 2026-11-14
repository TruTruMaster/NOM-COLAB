#!/usr/bin/env python3
"""Valida archivos .docx/.xlsx/.pptx con el validador oficial de Microsoft (Open XML SDK) y dice
solo los errores NUEVOS: los que no traía ya el archivo original del corpus.

Es lo más cercano a «Office lo abre sin reparar» que se puede comprobar sin tener Office.
Muchos archivos reales de Microsoft ya traen errores del esquema (smartTag viejo, pageSetup con
DPI 0, ids de VML repetidos): esos no cuentan.

  python3 pruebas/office/validar_openxml.py CARPETA_O_ARCHIVOS... [--corpus DIR ...] [--detalle]

Necesita .NET 8 en ~/.dotnet (sin permisos de administrador):
  curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0 --install-dir ~/.dotnet
La primera vez compila pruebas/office/openxml (descarga el paquete DocumentFormat.OpenXml).
Salida: archivo, errores nuevos; código 1 si hay alguno.
"""
import os, re, subprocess, sys, glob
AQUI = os.path.dirname(os.path.abspath(__file__))
PROY = os.path.join(AQUI, "openxml")
DOTNET = os.path.expanduser("~/.dotnet/dotnet")
BIN = os.path.expanduser("~/.cache/nom-pruebas/openxml-bin")
EXT = (".docx", ".xlsx", ".pptx", ".docm", ".xlsm")
CORPUS = [os.path.expanduser("~/.cache/nom-pruebas/corpus"), os.path.expanduser("~/.cache/nom-pruebas/corpus-web")]

def compilar():
    exe = os.path.join(BIN, "validador")
    fuente = max(os.path.getmtime(os.path.join(PROY, f)) for f in os.listdir(PROY) if f.endswith((".cs", ".csproj")))
    if os.path.exists(exe) and os.path.getmtime(exe) > fuente: return exe
    env = dict(os.environ, DOTNET_CLI_TELEMETRY_OPTOUT="1", DOTNET_NOLOGO="1")
    r = subprocess.run([DOTNET, "build", PROY, "-c", "Release", "-o", BIN], capture_output=True, text=True, env=env)
    if r.returncode != 0: sys.exit("No compiló el validador:\n" + r.stdout[-2000:])
    return exe

def validar(exe, archivos):
    """{archivo: (n, [firma de cada error])}; la firma quita los índices para comparar con el original."""
    out = {}
    env = dict(os.environ, DOTNET_ROOT=os.path.expanduser("~/.dotnet"))
    for i in range(0, len(archivos), 40):
        r = subprocess.run([exe, "--max", "100000"] + archivos[i:i + 40], capture_output=True, text=True, env=env)
        actual = None
        for linea in r.stdout.splitlines():
            if "\t" in linea and not linea.startswith(" "):
                actual, n = linea.split("\t", 1); out[actual] = [n, []]
            elif actual and linea.strip().startswith("["):
                firma = re.sub(r"\[\d+\]", "[]", linea.strip())
                firma = re.sub(r"(sheet|slide|header|footer|chart|drawing)\d+", r"\1N", firma)
                firma = re.sub(r"current value '[^']*'", "current value '…'", firma)
                out[actual][1].append(firma)
    return out

def original_de(ruta, corpus):
    base = os.path.basename(ruta)
    base = re.sub(r"^(abierto|recargado|exportado)-", "", base)
    nombre, ext = os.path.splitext(base)
    nombre = nombre.split(".")[0]
    for d in corpus:
        for c in glob.glob(os.path.join(d, "**", nombre + ext), recursive=True): return c
    return None

def main():
    args, corpus, detalle = [], list(CORPUS), "--detalle" in sys.argv
    it = iter(sys.argv[1:])
    for a in it:
        if a == "--corpus": corpus.append(next(it))
        elif a != "--detalle": args.append(a)
    archivos = []
    for a in args:
        if os.path.isdir(a): archivos += sorted(os.path.join(a, f) for f in os.listdir(a) if f.lower().endswith(EXT))
        elif a.lower().endswith(EXT): archivos.append(a)
    if not archivos: sys.exit(__doc__)
    exe = compilar()
    orig = {a: original_de(a, corpus) for a in archivos}
    res = validar(exe, archivos + sorted({o for o in orig.values() if o}))
    malos = 0
    for a in archivos:
        n, errs = res.get(a, ["NO SE VALIDÓ", []])
        if not str(n).isdigit():
            on = str(res.get(orig[a], [""])[0]) if orig[a] else ""
            if on.split(":")[0] == str(n).split(":")[0] and not on.isdigit():
                if detalle: print(f"bien {os.path.basename(a)} (no abre en el validador, igual que el original: {n[:120]})")
                continue
            print(f"MAL  {os.path.basename(a)}: {n}"); malos += 1; continue
        base = list(res.get(orig[a], [0, []])[1]) if orig[a] else []
        nuevos = []
        for e in errs:
            if e in base: base.remove(e)
            else: nuevos.append(e)
        if nuevos:
            malos += 1
            print(f"MAL  {os.path.basename(a)}: {len(nuevos)} errores nuevos (el original {'trae ' + str(len(res[orig[a]][1])) if orig[a] else 'no está en el corpus'})")
            for e in nuevos[: (50 if detalle else 5)]: print("       " + e[:400])
        elif detalle: print(f"bien {os.path.basename(a)} ({n} errores, todos ya venían en el original)")
    print(f"\nValidador de Microsoft (Open XML SDK): {len(archivos) - malos} bien, {malos} con errores nuevos, de {len(archivos)} archivos")
    sys.exit(1 if malos else 0)

if __name__ == "__main__":
    main()
