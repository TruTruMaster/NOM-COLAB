#!/usr/bin/env python3
"""Revisa que un .docx, .xlsx o .pptx esté bien armado por dentro, sin abrir ningún programa:
  - cada relación interna apunta a una parte que existe,
  - cada parte tiene declarado su tipo de contenido y cada tipo declarado tiene su parte,
  - todo el XML está bien formado y no hay ids de relación repetidos.
Es lo que hace que Office diga "el archivo está dañado" cuando falla.

  python pruebas/office/integridad.py archivo.pptx [más archivos o carpetas]
"""
import sys, zipfile, re, posixpath
from pathlib import Path
from xml.dom import minidom


def revisar(ruta):
    fallas = []
    try: z = zipfile.ZipFile(ruta)
    except Exception as e: return [f"no es un zip: {e}"]
    if z.testzip() is not None: fallas.append("zip con datos dañados")
    nombres = {i.filename for i in z.infolist() if not i.is_dir()}
    if "[Content_Types].xml" not in nombres: return fallas + ["falta [Content_Types].xml"]
    ct = z.read("[Content_Types].xml").decode("utf8", "replace")
    defecto = {m.lower() for m in re.findall(r'<Default\b[^>]*Extension="([^"]+)"', ct)}
    sobre = re.findall(r'<Override\b[^>]*PartName="([^"]+)"', ct)
    for p in sobre:
        if p.lstrip("/") not in nombres: fallas.append(f"tipo declarado sin parte: {p}")
    if len(sobre) != len(set(sobre)): fallas.append("tipos de contenido repetidos")
    for n in nombres:
        if n == "[Content_Types].xml": continue
        if "/" + n not in sobre and n.rsplit(".", 1)[-1].lower() not in defecto: fallas.append(f"parte sin tipo de contenido: {n}")
    for n in sorted(nombres):
        if n.endswith(".xml") or n.endswith(".rels") or n.endswith(".vml"):
            try: minidom.parseString(z.read(n))
            except Exception as e:
                if not n.endswith(".vml"): fallas.append(f"XML mal formado en {n}: {str(e)[:80]}")
        if not n.endswith(".rels"): continue
        carpeta = posixpath.dirname(posixpath.dirname(n))
        dueno = posixpath.join(carpeta, posixpath.basename(n)[:-5])
        if dueno and dueno not in nombres: fallas.append(f"relaciones de una parte que no existe: {n}")
        t = z.read(n).decode("utf8", "replace")
        ids = re.findall(r'<Relationship\b[^>]*\bId="([^"]+)"', t)
        if len(ids) != len(set(ids)): fallas.append(f"ids de relación repetidos en {n}")
        for m in re.finditer(r"<Relationship\b([^>]*)/?>", t):
            a = m.group(1)
            if 'TargetMode="External"' in a: continue
            d = re.search(r'Target="([^"]*)"', a)
            if not d: continue
            destino = d.group(1).split("#")[0]
            if not destino: continue
            abs_ = destino.lstrip("/") if destino.startswith("/") else posixpath.normpath(posixpath.join(carpeta, destino))
            if abs_ not in nombres and destino != "NULL": fallas.append(f"{n}: apunta a una parte que no existe ({destino})")
        # cada r:id usado en la parte existe en sus relaciones
        if dueno in nombres and dueno.endswith(".xml"):
            cuerpo = z.read(dueno).decode("utf8", "replace")
            usados = set(re.findall(r'\br:(?:id|embed|link|pict|dm|lo|qs|cs)="([^"]+)"', cuerpo))
            faltan = [u for u in usados if u not in ids]
            if faltan: fallas.append(f"{dueno}: usa relaciones que no existen {faltan[:4]}")
    return fallas


def main():
    archivos = []
    for a in sys.argv[1:]:
        p = Path(a)
        archivos += sorted(x for x in p.rglob("*") if x.suffix in (".docx", ".xlsx", ".pptx")) if p.is_dir() else [p]
    mal = 0
    for f in archivos:
        fs = revisar(f)
        if fs:
            mal += 1; print(f"MAL {f.name}"); [print("     ", x) for x in fs[:6]]
    print(f"Integridad: {len(archivos) - mal} bien, {mal} mal de {len(archivos)} archivos")
    sys.exit(1 if mal else 0)


if __name__ == "__main__":
    main()
