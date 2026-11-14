#!/usr/bin/env python3
"""Saca de ECMA-376 Parte 1 (PDF) la tabla «sección → elemento» que usa cobertura.py.

Uso:  python3 -I extraer_secciones.py <carpeta-esquemas>
Necesita `pdftotext` (poppler-utils). Lee  <esquemas>/_descargas/p1/*Part 1*.pdf  y escribe
<esquemas>/secciones-ecma.tsv  (columnas: sección, nombre, título). Cada encabezado numerado del
cuerpo del libro tiene la forma «17.3.1.26   pPr (Paragraph Properties)».
"""
import glob, os, re, subprocess, sys

def main():
    esq = sys.argv[1]
    pdf = glob.glob(os.path.join(esq, "_descargas", "p1", "*Part 1*.pdf"))
    if not pdf:
        sys.exit("No encuentro el PDF de la Parte 1 en _descargas/p1")
    txt = os.path.join(esq, "texto", "parte1.txt")
    os.makedirs(os.path.dirname(txt), exist_ok=True)
    if not os.path.exists(txt):
        subprocess.run(["pdftotext", "-layout", pdf[0], txt], check=True)
    pat = re.compile(r"^(\d{2}(?:\.\d+)+)\s+([A-Za-z_][\w.-]*)\s+\((.+?)\)\s*$")
    salida, vistos = [], set()
    with open(txt, encoding="utf-8", errors="replace") as f:
        for n, lin in enumerate(f, 1):
            if n < 8300:      # el índice (con puntos guía) termina antes; el cuerpo empieza después
                continue
            m = pat.match(lin.rstrip())
            if not m or "....." in lin:
                continue
            sec, nom, tit = m.groups()
            if (sec, nom) in vistos:
                continue
            vistos.add((sec, nom))
            salida.append((sec, nom, tit))
    with open(os.path.join(esq, "secciones-ecma.tsv"), "w", encoding="utf-8") as g:
        for r in salida:
            g.write("\t".join(r) + "\n")
    print(len(salida), "encabezados")

main()
