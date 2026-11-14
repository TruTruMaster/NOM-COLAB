#!/usr/bin/env python3
"""Cobertura de Office Open XML en NOM-COLAB.

Uso:
    python3 -I cobertura.py <carpeta-esquemas> <carpeta-corpus> <carpeta-codigo> [<carpeta-salida>]

  <carpeta-esquemas>  la carpeta `esquemas/` (ecma-transitional/*.xsd, opc/*.xsd, ms-extensiones/*.json,
                      secciones-ecma.tsv). Ver FUENTES.md para saber de dónde sale cada cosa.
  <carpeta-corpus>    una o varias carpetas separadas por «:» (p. ej. corpus:corpus-web). Se recorren
                      todos los .docx, .xlsx y .pptx que haya dentro.
  <carpeta-codigo>    la carpeta `codigo/` (se leen codigo/js/ooxml.js y codigo/js/ecuaciones.js).
  <carpeta-salida>    donde se escriben los resultados (por omisión, la carpeta superior de este programa).

Sin dependencias externas (solo la biblioteca estándar de Python 3).

Qué hace (el método completo está explicado en OOXML-COBERTURA.md):
  1. Enumera cada elemento y atributo declarado en los XSD de ECMA-376 5.ª ed. (Transitional) y en los
     esquemas de las extensiones de Microsoft (datos del Open XML SDK).
  2. Cuenta, por programa (Word/Excel/PowerPoint), en cuántos archivos del corpus y cuántas veces aparece
     cada elemento y atributo (espacio de nombres + nombre local), incluido el contenido de
     mc:AlternateContent.
  3. Analiza el código JavaScript de la app con un lector léxico propio (cadenas, plantillas, expresiones
     regulares) y determina qué elementos busca el importador y cuáles escribe el exportador.
  4. Revisa el orden de los hijos que escribe el exportador contra la secuencia del esquema.
Escribe: ooxml-elementos.csv, ooxml-atributos.csv y herramientas/tablas-generadas.md (+ orden-hallazgos.tsv).
"""
import csv
import glob
import io
import json
import os
import re
import sys
import zipfile
import collections
import xml.etree.ElementTree as ET

XS = "{http://www.w3.org/2001/XMLSchema}"
PROGRAMAS = ("Word", "Excel", "PowerPoint")
MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"

# ----------------------------------------------------------------------------------------------
# Espacios de nombres: a qué programa pertenecen y qué prefijo usa Office
# ----------------------------------------------------------------------------------------------
PREFIJOS_BASE = {
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main": "w",
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main": "x",
    "http://schemas.openxmlformats.org/presentationml/2006/main": "p",
    "http://schemas.openxmlformats.org/drawingml/2006/main": "a",
    "http://schemas.openxmlformats.org/drawingml/2006/picture": "pic",
    "http://schemas.openxmlformats.org/drawingml/2006/chart": "c",
    "http://schemas.openxmlformats.org/drawingml/2006/chartDrawing": "cdr",
    "http://schemas.openxmlformats.org/drawingml/2006/diagram": "dgm",
    "http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas": "lc",
    "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing": "wp",
    "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing": "xdr",
    "http://schemas.openxmlformats.org/officeDocument/2006/math": "m",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships": "r",
    "http://schemas.openxmlformats.org/officeDocument/2006/sharedTypes": "s",
    "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes": "vt",
    "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties": "ep",
    "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties": "cp2",
    "http://schemas.openxmlformats.org/officeDocument/2006/bibliography": "b",
    "http://schemas.openxmlformats.org/officeDocument/2006/customXml": "cxml",
    "http://schemas.openxmlformats.org/officeDocument/2006/characteristics": "ac",
    "http://schemas.openxmlformats.org/package/2006/relationships": "rel",
    "http://schemas.openxmlformats.org/package/2006/content-types": "ct",
    "http://schemas.openxmlformats.org/package/2006/metadata/core-properties": "cp",
    "http://schemas.openxmlformats.org/package/2006/digital-signature": "ds",
    "http://schemas.openxmlformats.org/markup-compatibility/2006": "mc",
    "http://schemas.openxmlformats.org/drawingml/2006/compatibility": "dmlc",
    "urn:schemas-microsoft-com:vml": "v",
    "urn:schemas-microsoft-com:office:office": "o",
    "urn:schemas-microsoft-com:office:word": "w10",
    "urn:schemas-microsoft-com:office:excel": "xvml",
    "urn:schemas-microsoft-com:office:powerpoint": "pvml",
    "http://purl.org/dc/elements/1.1/": "dc",
    "http://purl.org/dc/terms/": "dcterms",
    "http://purl.org/dc/dcmitype/": "dcmitype",
    "http://www.w3.org/2001/XMLSchema-instance": "xsi",
    "http://www.w3.org/XML/1998/namespace": "xml",
}


def grupo_de(uri):
    """Programa «natural» de un espacio de nombres: Word, Excel, PowerPoint o Compartido."""
    u = uri.lower()
    if ("wordprocessingml" in u or "wordprocessingdrawing" in u or "/office/word" in u or u.endswith(":office:word")
            or "wordprocessing" in u):
        return "Word"
    if "spreadsheetml" in u or "spreadsheetdrawing" in u or "/office/excel" in u or u.endswith(":office:excel"):
        return "Excel"
    if "presentationml" in u or "/office/powerpoint" in u or u.endswith(":office:powerpoint"):
        return "PowerPoint"
    return "Compartido"


# Documento de referencia de cada familia de espacios de nombres (columna «seccion_ecma» de las extensiones)
def fuente_de(uri):
    u = uri.lower()
    if u.startswith("http://schemas.microsoft.com/office/word/"):
        return "[MS-DOCX]"
    if u.startswith("http://schemas.microsoft.com/office/spreadsheetml/"):
        return "[MS-XLSX]"
    if u.startswith("http://schemas.microsoft.com/office/powerpoint/"):
        return "[MS-PPTX]"
    if u.startswith("http://schemas.microsoft.com/office/drawing/"):
        return "[MS-ODRAWXML]"
    if u.startswith("http://schemas.microsoft.com/office/"):
        return "[MS-OI29500]/[MS-ODRAWXML] (extensión de Office)"
    if u.startswith("http://schemas.openxmlformats.org/"):
        return "ECMA-376"
    return "ECMA-376 (parte 4 u otra norma abierta)"


# Capítulos de ECMA-376 parte 1 en los que se describe cada espacio de nombres
CAPITULOS = {
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main": ("17.",),
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main": ("18.",),
    "http://schemas.openxmlformats.org/presentationml/2006/main": ("19.",),
    "http://schemas.openxmlformats.org/drawingml/2006/main": ("20.1.", "21.1."),
    "http://schemas.openxmlformats.org/drawingml/2006/picture": ("20.2.",),
    "http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas": ("20.3.",),
    "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing": ("20.4.",),
    "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing": ("20.5.",),
    "http://schemas.openxmlformats.org/drawingml/2006/chart": ("21.2.",),
    "http://schemas.openxmlformats.org/drawingml/2006/chartDrawing": ("21.3.",),
    "http://schemas.openxmlformats.org/drawingml/2006/diagram": ("21.4.",),
    "http://schemas.openxmlformats.org/officeDocument/2006/math": ("22.1.",),
    "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties": ("22.2.",),
    "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties": ("22.3.",),
    "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes": ("22.4.",),
    "http://schemas.openxmlformats.org/officeDocument/2006/bibliography": ("22.5.",),
    "http://schemas.openxmlformats.org/officeDocument/2006/customXml": ("22.",),
    "http://schemas.openxmlformats.org/officeDocument/2006/characteristics": ("22.",),
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships": ("22.8.",),
    "http://schemas.openxmlformats.org/officeDocument/2006/sharedTypes": ("22.9.",),
}

DC_ELEMENTOS = {
    "http://purl.org/dc/elements/1.1/": "title subject creator description publisher contributor date type format "
                                        "identifier source language relation coverage rights".split(),
    "http://purl.org/dc/terms/": "created modified issued available valid".split(),
}


# ----------------------------------------------------------------------------------------------
# 1. Esquemas
# ----------------------------------------------------------------------------------------------
class Tipo:
    """Un tipo complejo de un XSD, ya con su contexto de nombres."""
    __slots__ = ("nodo", "ctx", "clave")

    def __init__(self, nodo, ctx, clave):
        self.nodo, self.ctx, self.clave = nodo, ctx, clave


def rangos_sdk(part, prefijo2uri, tns):
    """Orden de los hijos según la «partícula» del Open XML SDK (la que usa OpenXmlValidator).
    Devuelve {(uri, nombre): [posiciones]} o None si el contenido es libre (repetible)."""
    casillas = []
    completos = {}

    def clave(nombre):
        q = nombre.split("/", 1)[1] if "/" in nombre else nombre
        p, l = q.split(":", 1) if ":" in q else ("", q)
        return (prefijo2uri.get(p, tns) if p else tns, l)

    def ilimitado(n):
        occ = n.get("Occurs")
        if not occ:
            return False
        return any(("Max" not in o) or o.get("Max", 1) == 0 or o.get("Max", 1) > 1 for o in occ)

    def hojas(n, acum):
        if n.get("Name"):
            acum.add(clave(n["Name"]))
            completos[clave(n["Name"])] = n["Name"]
        for h in n.get("Items", ()):
            hojas(h, acum)

    def visitar(n):
        if n.get("Name"):
            casillas.append({clave(n["Name"])})
            completos[clave(n["Name"])] = n["Name"]
            return
        k = n.get("Kind")
        if ilimitado(n) or k == "Choice":
            u = set()
            hojas(n, u)
            if u:
                casillas.append(u)
            return
        for h in n.get("Items", ()):
            visitar(h)

    if ilimitado(part) or part.get("Kind") == "Choice":
        return None
    visitar(part)
    res = collections.defaultdict(list)
    for i, c in enumerate(casillas):
        for k in c:
            res[k].append(i)
    return dict(res), completos


class Esquemas:
    def __init__(self, carpeta):
        self.carpeta = carpeta
        self.elementos = {}      # (uri, nombre) -> {"fuente","archivo","tipos":set(clave),"attrs":{(uri,nom):req}}
        self.tipos = {}          # (uri, nombre) -> Tipo
        self.grupos = {}         # (uri, nombre) -> (nodo, ctx)
        self.attr_grupos = {}
        self.globales = {}       # (uri, nombre) -> nodo element global
        self.raices = []         # (ruta, root, ctx)
        self.prefijos = dict(PREFIJOS_BASE)
        self.uris_xsd = set()
        self.anon = {}           # id(nodo) -> Tipo
        self.secciones = {}      # (uri, nombre) -> (seccion, titulo)
        self.tipo_hijo = {}      # (clave_tipo_padre, (uri,nombre)) -> Tipo | None
        self.rangos_cache = {}
        self._cargar_xsd()
        self._cargar_json()
        self._cargar_secciones()

    # ---- XSD
    def _leer(self, ruta):
        nsmap, tns = {}, None
        root = None
        for ev, el in ET.iterparse(ruta, events=("start-ns", "start")):
            if ev == "start-ns":
                p, u = el
                nsmap[p] = u
            elif root is None:
                root = el
                tns = el.get("targetNamespace")
                break
        arbol = ET.parse(ruta)
        return arbol.getroot(), {"ns": nsmap, "tns": tns, "archivo": os.path.basename(ruta)}

    def _cargar_xsd(self):
        rutas = sorted(glob.glob(os.path.join(self.carpeta, "ecma-transitional", "*.xsd"))
                       + glob.glob(os.path.join(self.carpeta, "opc", "*.xsd")))
        for r in rutas:
            root, ctx = self._leer(r)
            if not ctx["tns"]:
                continue
            self.uris_xsd.add(ctx["tns"])
            self.raices.append((r, root, ctx))
            tns = ctx["tns"]
            for hijo in root:
                nom = hijo.get("name")
                if not nom:
                    continue
                k = (tns, nom)
                if hijo.tag == XS + "complexType":
                    self.tipos[k] = Tipo(hijo, ctx, k)
                elif hijo.tag == XS + "group":
                    self.grupos[k] = (hijo, ctx)
                elif hijo.tag == XS + "attributeGroup":
                    self.attr_grupos[k] = (hijo, ctx)
                elif hijo.tag == XS + "element":
                    self.globales[k] = (hijo, ctx)
        for r, root, ctx in self.raices:
            tns = ctx["tns"]
            for el in root.iter(XS + "element"):
                nom = el.get("name")
                if not nom:
                    continue
                k = (tns, nom)
                d = self.elementos.setdefault(k, {"fuente": fuente_de(tns), "archivo": ctx["archivo"], "tipos": set(),
                                                  "attrs": {}, "origen": "XSD"})
                t = self.tipo_de_elemento(el, ctx)
                if t is not None:
                    d["tipos"].add(t.clave)
                    for a, req in self.atributos_de(t).items():
                        if a not in d["attrs"] or req:
                            d["attrs"][a] = req
        # elementos de Dublin Core (los XSD los importan de otro lugar)
        for uri, noms in DC_ELEMENTOS.items():
            for n in noms:
                self.elementos.setdefault((uri, n), {"fuente": "ECMA-376 parte 2 (OPC)", "archivo": "(integrado)", "tipos": set(),
                                                     "attrs": {}, "origen": "integrado"})

    def resolver(self, qn, ctx):
        if qn is None:
            return None
        if ":" in qn:
            p, l = qn.split(":", 1)
            return (ctx["ns"].get(p), l)
        return (ctx["ns"].get("") or ctx["tns"], qn)

    def tipo_de_elemento(self, el, ctx):
        t = el.get("type")
        if t:
            k = self.resolver(t, ctx)
            return self.tipos.get(k)
        ct = el.find(XS + "complexType")
        if ct is not None:
            return self.anonimo(ct, ctx)
        ref = el.get("ref")
        if ref:
            k = self.resolver(ref, ctx)
            g = self.globales.get(k)
            if g:
                return self.tipo_de_elemento(g[0], g[1])
        return None

    def anonimo(self, nodo, ctx):
        t = self.anon.get(id(nodo))
        if t is None:
            t = self.anon[id(nodo)] = Tipo(nodo, ctx, ("anon", ctx["archivo"], id(nodo)))
        return t

    def atributos_de(self, tipo, vistos=None):
        res = {}
        vistos = vistos or set()
        if tipo.clave in vistos:
            return res
        vistos.add(tipo.clave)
        self._attrs_nodo(tipo.nodo, tipo.ctx, res, vistos)
        return res

    def _attrs_nodo(self, nodo, ctx, res, vistos):
        for h in nodo:
            if h.tag == XS + "attribute":
                nom = h.get("name")
                if nom:
                    res[(None, nom)] = h.get("use") == "required"
                elif h.get("ref"):
                    uri, l = self.resolver(h.get("ref"), ctx)
                    res[(uri, l)] = h.get("use") == "required"
            elif h.tag == XS + "attributeGroup" and h.get("ref"):
                g = self.attr_grupos.get(self.resolver(h.get("ref"), ctx))
                if g:
                    self._attrs_nodo(g[0], g[1], res, vistos)
            elif h.tag in (XS + "complexContent", XS + "simpleContent"):
                for e in h:
                    if e.tag in (XS + "extension", XS + "restriction"):
                        base = self.tipos.get(self.resolver(e.get("base"), ctx))
                        if base and e.tag == XS + "extension":
                            for a, rq in self.atributos_de(base, vistos).items():
                                res.setdefault(a, rq)
                        self._attrs_nodo(e, ctx, res, vistos)

    # ---- orden de hijos (para revisar el exportador)
    def rangos(self, tipo):
        """{(uri,nombre): [rangos]}: posición de cada hijo posible según xsd:sequence/choice (los de una
        misma alternativa o de un grupo repetible comparten posición)."""
        if tipo.clave in self.rangos_cache:
            return self.rangos_cache[tipo.clave]
        self.rangos_cache[tipo.clave] = {}
        casillas = []
        self._casillas_tipo(tipo, casillas, set())
        res = collections.defaultdict(list)
        for i, cas in enumerate(casillas):
            for k in cas:
                res[k].append(i)
        self.rangos_cache[tipo.clave] = dict(res)
        return self.rangos_cache[tipo.clave]

    def _casillas_tipo(self, tipo, casillas, vistos):
        if tipo.clave in vistos:
            return
        vistos = vistos | {tipo.clave}
        for h in tipo.nodo:
            if h.tag in (XS + "sequence", XS + "choice", XS + "all", XS + "group"):
                self._casillas(h, tipo.ctx, casillas, tipo, vistos)
            elif h.tag == XS + "complexContent":
                for e in h:
                    if e.tag == XS + "extension":
                        base = self.tipos.get(self.resolver(e.get("base"), tipo.ctx))
                        if base:
                            self._casillas_tipo(base, casillas, vistos)
                        for q in e:
                            if q.tag in (XS + "sequence", XS + "choice", XS + "all", XS + "group"):
                                self._casillas(q, tipo.ctx, casillas, tipo, vistos)

    def _casillas(self, nodo, ctx, casillas, tipo, vistos):
        rep = nodo.get("maxOccurs") not in (None, "0", "1")
        if nodo.tag == XS + "element":
            nom = nodo.get("name")
            if nom:
                k = (ctx["tns"], nom)
                t = self.tipo_de_elemento(nodo, ctx)
            else:
                k = self.resolver(nodo.get("ref"), ctx)
                g = self.globales.get(k)
                t = self.tipo_de_elemento(g[0], g[1]) if g else None
            self.tipo_hijo.setdefault((tipo.clave, k), t)
            casillas.append({k})
            return
        if nodo.tag == XS + "any":
            return
        if nodo.tag == XS + "group":
            ref = nodo.get("ref")
            g = self.grupos.get(self.resolver(ref, ctx)) if ref else None
            if g is None:
                return
            sub = []
            for q in g[0]:
                if q.tag in (XS + "sequence", XS + "choice", XS + "all"):
                    self._casillas(q, g[1], sub, tipo, vistos)
            if rep:
                sub = [set().union(*sub)] if sub else []
            casillas.extend(sub)
            return
        sub = []
        for q in nodo:
            if q.tag in (XS + "element", XS + "sequence", XS + "choice", XS + "any", XS + "group", XS + "all"):
                self._casillas(q, ctx, sub, tipo, vistos)
        if nodo.tag == XS + "sequence" and not rep:
            casillas.extend(sub)
        elif sub:
            casillas.append(set().union(*sub))

    # ---- extensiones de Microsoft (Open XML SDK)
    def _cargar_json(self):
        ruta_ns = os.path.join(self.carpeta, "ms-extensiones", "_namespaces.json")
        prefijo2uri = {}
        if os.path.exists(ruta_ns):
            for e in json.load(open(ruta_ns, encoding="utf-8")):
                if e.get("Prefix") and e.get("Uri"):
                    prefijo2uri[e["Prefix"]] = e["Uri"]
                    self.prefijos.setdefault(e["Uri"], e["Prefix"])
        self.prefijo2uri = prefijo2uri
        self.particulas = collections.defaultdict(list)    # (uri, nombre) -> [rangos por hijo según el SDK]
        for r in sorted(glob.glob(os.path.join(self.carpeta, "ms-extensiones", "schemas*.json"))):
            d = json.load(open(r, encoding="utf-8"))
            tns0 = d.get("TargetNamespace")
            for t in d.get("Types", []):
                nm = t.get("Name", "")
                if "/" not in nm or not t.get("Particle"):
                    continue
                p, l = (nm.split("/", 1)[1].split(":", 1) + [""])[:2] if ":" in nm.split("/", 1)[1] else ("", nm.split("/", 1)[1])
                uri = prefijo2uri.get(p, tns0) if p else tns0
                rg = rangos_sdk(t["Particle"], prefijo2uri, tns0)
                if rg is not None:
                    self.particulas[(uri, l)].append((nm, rg[0], rg[1]))
        tipos_por_clase, pendientes = {}, []
        for r in sorted(glob.glob(os.path.join(self.carpeta, "ms-extensiones", "schemas*.json"))):
            d = json.load(open(r, encoding="utf-8"))
            tns = d.get("TargetNamespace")
            if not tns or tns in self.uris_xsd or tns.startswith("http://schemas.openxmlformats.org/"):
                continue
            if tns.startswith("http://www.w3.org/"):
                continue
            for t in d.get("Types", []):
                tipos_por_clase[t.get("ClassName")] = t
                nom = t.get("Name", "")
                if "/" not in nom:
                    continue
                tipo_xsd, el = nom.split("/", 1)
                if not el:
                    continue
                p, l = (el.split(":", 1) if ":" in el else ("", el))
                uri = prefijo2uri.get(p, tns) if p else tns
                if uri != tns:
                    continue
                pendientes.append((uri, l, t, os.path.basename(r)))
        for uri, l, t, arch in pendientes:
            attrs = {}
            cur, saltos = t, 0
            while cur is not None and saltos < 12:
                for a in cur.get("Attributes", []):
                    q = a.get("QName", "")
                    p, n = (q.split(":", 1) if ":" in q else ("", q))
                    auri = prefijo2uri.get(p) if p else None
                    req = any(v.get("Name") == "RequiredValidator" for v in a.get("Validators", []))
                    attrs.setdefault((auri, n), req)
                cur = tipos_por_clase.get(cur.get("BaseClass")) if cur.get("BaseClass") else None
                saltos += 1
            d = self.elementos.setdefault((uri, l), {"fuente": fuente_de(uri), "archivo": arch, "tipos": set(),
                                                     "attrs": {}, "origen": "SDK"})
            for a, req in attrs.items():
                d["attrs"].setdefault(a, req)
            d["clase"] = t.get("ClassName")

    def _cargar_secciones(self):
        ruta = os.path.join(self.carpeta, "secciones-ecma.tsv")
        if not os.path.exists(ruta):
            return
        por_nombre = collections.defaultdict(list)
        for lin in open(ruta, encoding="utf-8"):
            p = lin.rstrip("\n").split("\t")
            if len(p) == 3:
                por_nombre[p[1]].append((p[0], p[2]))
        for (uri, nom) in self.elementos:
            caps = CAPITULOS.get(uri)
            if not caps:
                continue
            c = [s for s in por_nombre.get(nom, []) if any(s[0].startswith(x) for x in caps)]
            c = [s for s in c if not s[1].startswith(("Previous", "Style ", "Numbering Level", "Table Style"))] or c
            if c:
                c.sort(key=lambda s: [int(q) for q in s[0].split(".")])
                self.secciones[(uri, nom)] = c[0]

    def prefijo(self, uri):
        return self.prefijos.get(uri) or uri_corto(uri)


def uri_corto(uri):
    return re.sub(r"[^A-Za-z0-9]+", "_", uri.rstrip("/").split("/")[-1])[:12] or "ns"


# ----------------------------------------------------------------------------------------------
# 2. Corpus
# ----------------------------------------------------------------------------------------------
class Corpus:
    def __init__(self, carpetas):
        self.archivos = []                       # (programa, ruta)
        self.el = collections.defaultdict(lambda: [set(), 0, 0])     # (prog, uri, nom) -> [archivos, veces, veces_en_fallback]
        self.at = collections.defaultdict(lambda: [set(), 0])        # (prog, uri, nom, auri, anom) -> [archivos, veces]
        self.partes = collections.defaultdict(set)                   # (prog, nombre de parte genérico) -> archivos
        self.errores = []
        self.partes_total = 0
        self.mc_ignorable = collections.Counter()
        ext = {".docx": "Word", ".xlsx": "Excel", ".pptx": "PowerPoint"}
        vistos = set()
        for c in carpetas:
            for raiz, _, fs in os.walk(c):
                for f in sorted(fs):
                    e = os.path.splitext(f)[1].lower()
                    if e in ext and not f.startswith("~$"):
                        ruta = os.path.join(raiz, f)
                        if ruta not in vistos:
                            vistos.add(ruta)
                            self.archivos.append((ext[e], ruta))
        self.archivos.sort(key=lambda t: (t[0], t[1]))
        for prog, ruta in self.archivos:
            self._archivo(prog, ruta)

    def _archivo(self, prog, ruta):
        try:
            z = zipfile.ZipFile(ruta)
        except Exception as e:      # archivo dañado: se anota y se sigue
            self.errores.append((ruta, "zip", str(e)))
            return
        for nombre in z.namelist():
            if not re.search(r"\.(xml|rels|vml)$", nombre, re.I) and nombre != "[Content_Types].xml":
                continue
            try:
                datos = z.read(nombre)
            except Exception as e:
                self.errores.append((ruta, nombre, "lectura: " + str(e)))
                continue
            self.partes_total += 1
            self.partes[(prog, re.sub(r"\d+", "N", nombre))].add(ruta)
            try:
                self._parte(prog, ruta, datos)
            except ET.ParseError as e:
                # VML antiguo y otras partes mal formadas: se cuentan las etiquetas con una expresión regular
                self.errores.append((ruta, nombre, "XML mal formado (" + str(e) + "); recuento aproximado"))
                self._parte_aprox(prog, ruta, datos)

    def _parte(self, prog, ruta, datos):
        nsmap_pila = [{}]
        pila_mc = []      # nombres de mc: abiertos
        for ev, el in ET.iterparse(io.BytesIO(datos), events=("start-ns", "start", "end")):
            if ev == "start-ns":
                continue
            if ev == "start":
                tag = el.tag
                if tag.startswith("{"):
                    uri, nom = tag[1:].split("}", 1)
                else:
                    uri, nom = "", tag
                k = (prog, uri, nom)
                e = self.el[k]
                e[0].add(ruta)
                e[1] += 1
                if "Fallback" in pila_mc:
                    e[2] += 1
                pila_mc.append(nom if uri == MC_NS else None)
                for a in el.attrib:
                    if a.startswith("{"):
                        au, an = a[1:].split("}", 1)
                    else:
                        au, an = None, a
                    r = self.at[(prog, uri, nom, au, an)]
                    r[0].add(ruta)
                    r[1] += 1
                    if au == MC_NS and an == "Ignorable":
                        for p in el.attrib[a].split():
                            self.mc_ignorable[p] += 1
            else:
                if pila_mc:
                    pila_mc.pop()
                el.clear()

    def _parte_aprox(self, prog, ruta, datos):
        txt = datos.decode("utf-8", "replace")
        pref = dict(re.findall(r'xmlns:([\w.-]+)="([^"]+)"', txt))
        for m in re.finditer(r"<([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)", txt):
            uri = pref.get(m.group(1))
            if uri:
                e = self.el[(prog, uri, m.group(2))]
                e[0].add(ruta)
                e[1] += 1


# ----------------------------------------------------------------------------------------------
# 3. Código JavaScript: lector léxico
# ----------------------------------------------------------------------------------------------
class Tok:
    __slots__ = ("k", "v", "l", "p")

    def __init__(self, k, v, l, p=0):
        self.k, self.v, self.l, self.p = k, v, l, p

    def __repr__(self):
        return "%s:%r@%d" % (self.k, self.v, self.l)


PALABRAS_ANTES_DE_REGEX = {"return", "typeof", "case", "in", "of", "void", "delete", "throw", "else", "do", "new", "instanceof"}


def lexer(src):
    """Convierte JavaScript en señales: id, str, tmpl (plantilla completa; las expresiones `${…}` quedan
    como U+0001), re (expresión regular), op. Los comentarios se descartan."""
    toks = []
    i, n, linea = 0, len(src), 1
    pila_plantillas = []        # cada elemento: [trozos, profundidad_llaves, linea_inicio]
    llaves = 0

    def ultimo():
        return toks[-1] if toks else None

    def leer_trozo_plantilla(i, marco):
        """Lee texto de plantilla desde i. Devuelve (i, terminó_con_backtick)."""
        nonlocal linea
        buf = []
        while i < n:
            c = src[i]
            if c == "\\":
                buf.append(src[i:i + 2])
                if src[i + 1:i + 2] == "\n":
                    linea += 1
                i += 2
                continue
            if c == "`":
                marco[0].append("".join(buf))
                return i + 1, True
            if c == "$" and src[i + 1:i + 2] == "{":
                marco[0].append("".join(buf))
                return i + 2, False
            if c == "\n":
                linea += 1
            buf.append(c)
            i += 1
        marco[0].append("".join(buf))
        return i, True

    while i < n:
        c = src[i]
        if c == "\n":
            linea += 1
            i += 1
            continue
        if c in " \t\r":
            i += 1
            continue
        if c == "/" and src[i + 1:i + 2] == "/":
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and src[i + 1:i + 2] == "*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            linea += src.count("\n", i, j)
            i = j
            continue
        if c in "\"'":
            j, buf, l0 = i + 1, [], linea
            while j < n and src[j] != c:
                if src[j] == "\\":
                    sig = src[j + 1:j + 2]
                    buf.append({"n": "\n", "t": "\t", "r": "\r"}.get(sig, sig))
                    j += 2
                    continue
                if src[j] == "\n":
                    break
                buf.append(src[j])
                j += 1
            toks.append(Tok("str", "".join(buf), l0))
            i = j + 1
            continue
        if c == "`":
            marco = [[], llaves, linea]
            i, fin = leer_trozo_plantilla(i + 1, marco)
            if fin:
                toks.append(Tok("tmpl", "\u0001".join(marco[0]), marco[2]))
            else:
                pila_plantillas.append(marco)
                llaves = 0
            continue
        if c == "/":
            u = ultimo()
            es_re = u is None or (u.k == "op" and u.v not in (")", "]", "}")) or (u.k == "id" and u.v in PALABRAS_ANTES_DE_REGEX)
            if es_re:
                j, clase, l0 = i + 1, False, linea
                while j < n:
                    d = src[j]
                    if d == "\\":
                        j += 2
                        continue
                    if d == "[":
                        clase = True
                    elif d == "]":
                        clase = False
                    elif d == "/" and not clase:
                        break
                    elif d == "\n":
                        break
                    j += 1
                toks.append(Tok("re", src[i + 1:j], l0))
                j += 1
                while j < n and src[j].isalpha():
                    j += 1
                i = j
                continue
        if c.isalpha() or c in "_$":
            j = i + 1
            while j < n and (src[j].isalnum() or src[j] in "_$"):
                j += 1
            toks.append(Tok("id", src[i:j], linea))
            i = j
            continue
        if c.isdigit():
            j = i + 1
            while j < n and (src[j].isalnum() or src[j] in "._"):
                j += 1
            toks.append(Tok("num", src[i:j], linea))
            i = j
            continue
        if c == "{":
            llaves += 1
            toks.append(Tok("op", "{", linea))
            i += 1
            continue
        if c == "}":
            if pila_plantillas and llaves == 0:
                marco = pila_plantillas.pop()
                llaves = marco[1]
                i, fin = leer_trozo_plantilla(i + 1, marco)
                if fin:
                    toks.append(Tok("tmpl", "\u0001".join(marco[0]), marco[2]))
                else:
                    pila_plantillas.append(marco)
                    llaves = 0
                continue
            llaves -= 1
            toks.append(Tok("op", "}", linea))
            i += 1
            continue
        if c in "()[],;.:?":
            if c == "." and src[i:i + 3] == "...":
                toks.append(Tok("op", "...", linea))
                i += 3
                continue
            if c == "?" and src[i + 1:i + 2] in ".?":
                toks.append(Tok("op", src[i:i + 2], linea))
                i += 2
                continue
            toks.append(Tok("op", c, linea))
            i += 1
            continue
        j = i + 1
        while j < n and src[j] in "=!<>+-*/%&|^~" and not (src[j] == "/" and src[j + 1:j + 2] in "/*"):
            j += 1
        toks.append(Tok("op", src[i:j], linea))
        i = j
    return toks


AYUDAS_LECTURA = {"hijo", "hijos", "todos", "hs", "h1", "hijoXml", "hijosXml"}
AYUDAS_ATRIBUTO = {"at", "getAttribute", "getAttributeNS", "hasAttribute", "attr", "getAttributeNode"}
IDENT_ELEMENTO = re.compile(r"^[A-Za-z][A-Za-z0-9]*$")


def argumentos(toks, i):
    """toks[i] es '('; devuelve la lista de argumentos (cada uno, lista de señales) y el índice del ')'."""
    prof, args, cur = 0, [], []
    j = i
    while j < len(toks):
        t = toks[j]
        if t.k == "op" and t.v in "([{":
            prof += 1
            if prof > 1:
                cur.append(t)
        elif t.k == "op" and t.v in ")]}":
            prof -= 1
            if prof == 0:
                if cur or args:
                    args.append(cur)
                return args, j
            cur.append(t)
        elif t.k == "op" and t.v == "," and prof == 1:
            args.append(cur)
            cur = []
        else:
            cur.append(t)
        j += 1
    return args, j


class Codigo:
    """Lo que el importador busca y lo que el exportador escribe, con su evidencia (archivo:línea)."""

    def __init__(self, carpeta_codigo):
        js = os.path.join(carpeta_codigo, "js")
        self.archivos = {}
        for f in ("ooxml.js", "ecuaciones.js", "formatos.js"):
            ruta = os.path.join(js, f)
            if os.path.exists(ruta):
                self.archivos[f] = open(ruta, encoding="utf-8").read()
        self.ooxml = self.archivos["ooxml.js"]
        self.lineas = self.ooxml.split("\n")
        self.rangos = self._rangos()
        self.funciones = self._funciones()
        self.tokens = {f: lexer(s) for f, s in self.archivos.items()}
        self.prefijo_a_uris = collections.defaultdict(set)     # prefijo usado en el código -> uris
        self.consts_ns = {}                                    # const W = "http…"
        self.lee = collections.defaultdict(dict)               # prog -> {(clave): [(nivel, archivo, linea)]}
        self.escribe = collections.defaultdict(dict)
        self.dinamicos = []                                    # <w:${x}: (prog, archivo, linea, prefijo)
        self.lee_attr = collections.defaultdict(lambda: collections.defaultdict(list))   # prog -> nombre -> [líneas]
        self.escribe_attr = collections.defaultdict(lambda: collections.defaultdict(list))
        self.plantillas = []                                   # (prog, archivo, linea, texto) de lo que se escribe
        self.nombres_genericos = collections.defaultdict(lambda: collections.defaultdict(list))
        self.vars_localname = set()
        self._recolectar_namespaces()

    # ---- rangos de línea por programa
    def _rangos(self):
        marcas = [("word_w", r"^Word \(\.docx\)"), ("word_r", r"^leer \.docx"), ("xl_w", r"^Excel \(\.xlsx\)"),
                  ("xl_r", r"^importar Excel"), ("pp_w", r"^PowerPoint \(\.pptx\)"), ("pp_r", r"^importar PowerPoint")]
        pos = {}
        for i, lin in enumerate(self.lineas, 1):
            m = re.match(r"^  //\s*-{8,}\s+(.*)$", lin)
            if m:
                for k, pat in marcas:
                    if k not in pos and re.search(pat, m.group(1)):
                        pos[k] = i
        faltan = [k for k, _ in marcas if k not in pos]
        if faltan:
            sys.exit("No encuentro las marcas de sección de ooxml.js: %s" % faltan)
        fin = len(self.lineas) + 1
        r = {}
        r[("Word", "escribe")] = (pos["word_w"], pos["word_r"] - 1)
        r[("Word", "lee")] = (pos["word_r"], pos["xl_w"] - 1)
        r[("Excel", "escribe")] = (pos["xl_w"], pos["xl_r"] - 1)
        r[("Excel", "lee")] = (pos["xl_r"], pos["pp_w"] - 1)
        r[("PowerPoint", "escribe")] = (pos["pp_w"], pos["pp_r"] - 1)
        r[("PowerPoint", "lee")] = (pos["pp_r"], fin)
        return r

    def _funciones(self):
        fs = []
        for i, lin in enumerate(self.lineas, 1):
            m = re.match(r"^  (?:async )?function (\w+)", lin)
            if m:
                fs.append((i, m.group(1)))
        return fs

    def funcion_en(self, linea):
        res = "(global)"
        for i, n in self.funciones:
            if i <= linea:
                res = n
            else:
                break
        return res

    def donde(self, archivo, linea):
        if archivo == "ooxml.js":
            return "ooxml.js:%d %s" % (linea, self.funcion_en(linea))
        return "%s:%d" % (archivo, linea)

    def prog_de(self, archivo, linea):
        if archivo == "ecuaciones.js":
            return ("Word", "escribe")
        if archivo != "ooxml.js":
            return None
        for k, (a, b) in self.rangos.items():
            if a <= linea <= b:
                return k
        return None

    # ---- constantes de espacios de nombres y prefijos declarados
    def _recolectar_namespaces(self):
        for f, toks in self.tokens.items():
            for i, t in enumerate(toks):
                if t.k == "id" and i + 2 < len(toks) and toks[i + 1].v == "=" and toks[i + 2].k == "str" and toks[i + 2].v.startswith("http"):
                    self.consts_ns.setdefault(t.v, set()).add(toks[i + 2].v)
                if t.k in ("str", "tmpl"):
                    for p, u in re.findall(r'xmlns:([\w.-]+)=\\?"([^"\\]+)', t.v):
                        self.prefijo_a_uris[p].add(u)
                    for u in re.findall(r'xmlns=\\?"([^"\\]+)', t.v):
                        self.prefijo_a_uris[""].add(u)

    # ---- análisis
    def analizar(self, esq):
        self.esq = esq
        # nombre local -> espacios de nombres que lo declaran (con su grupo)
        self.por_nombre = collections.defaultdict(set)
        for (uri, nom) in esq.elementos:
            self.por_nombre[nom].add(uri)
        for f, toks in self.tokens.items():
            self._variables_localname(toks)
        for f, toks in self.tokens.items():
            self._lecturas(f, toks)
            self._escrituras(f, toks)

    def _variables_localname(self, toks):
        for i, t in enumerate(toks):
            if t.k == "id" and t.v in ("localName", "tagName", "nodeName") and i > 0 and toks[i - 1].v == ".":
                for j in range(i - 1, max(i - 8, 0), -1):
                    if toks[j].v == "=" and toks[j - 1].k == "id":
                        self.vars_localname.add(toks[j - 1].v)
                        break
                    if toks[j].v in (";", "{", "}"):
                        break

    def _candidatos(self, prog, nombre, uri_explicito=None):
        """Espacios de nombres a los que puede referirse una búsqueda por nombre local en el programa `prog`."""
        if uri_explicito:
            return [uri_explicito], True
        cands = []
        for uri in self.por_nombre.get(nombre, ()):
            g = grupo_de(uri)
            if g == prog or g == "Compartido":
                cands.append(uri)
        return cands, False

    def _reg_lee(self, prog, nombre, linea, archivo, tipo, uri_explicito=None):
        cands, explicito = self._candidatos(prog, nombre, uri_explicito)
        if not cands:
            return
        nivel = "si" if (explicito or len(cands) == 1) else "ambiguo"
        for u in cands:
            self.lee[prog].setdefault((u, nombre), []).append((nivel, archivo, linea, tipo))

    def _uri_de_expresion(self, toks):
        """Primer argumento de getElementsByTagNameNS: una constante conocida o «*»."""
        if len(toks) == 1:
            t = toks[0]
            if t.k == "str" and t.v.startswith("http"):
                return t.v
            if t.k == "id" and t.v in self.consts_ns and len(self.consts_ns[t.v]) == 1:
                return next(iter(self.consts_ns[t.v]))
        return None

    def _lecturas(self, archivo, toks):
        for i, t in enumerate(toks):
            lin = t.l
            rk = self.prog_de(archivo, lin)
            if rk is None:
                continue
            prog, modo = rk
            # Dentro de un exportador, localizar un elemento del archivo original también es «leerlo».
            es_lect = modo == "lee"
            if t.k == "id" and i + 1 < len(toks) and toks[i + 1].v == "(" and (toks[i - 1].v != "function" if i else True):
                if t.v in AYUDAS_LECTURA or t.v in ("getElementsByTagNameNS", "getElementsByTagName", "querySelector", "querySelectorAll"):
                    args, fin = argumentos(toks, i + 1)
                    uri = None
                    lits = []
                    if t.v == "getElementsByTagNameNS" and args:
                        uri = self._uri_de_expresion(args[0])
                        cand = args[1:2]
                    elif t.v in ("getElementsByTagName", "querySelector", "querySelectorAll"):
                        cand = args[:1]
                    else:
                        cand = args[1:]
                    for a in cand:
                        if len(a) == 1 and a[0].k == "str":
                            lits.append(a[0].v)
                    for v in lits:
                        pref = None
                        if ":" in v:
                            pref, v = v.split(":", 1)
                            uris = self.prefijo_a_uris.get(pref) or ({self.esq.prefijo2uri[pref]} if pref in self.esq.prefijo2uri else set())
                            uri = next(iter(uris)) if len(uris) == 1 else uri
                        if IDENT_ELEMENTO.match(v):
                            self._reg_lee(prog, v, lin, archivo, "busca:" + t.v + (":" + modo if not es_lect else ""), uri)
                elif t.v in AYUDAS_ATRIBUTO or t.v == "val":
                    args, fin = argumentos(toks, i + 1)
                    cand = args[1:2] if t.v in ("getAttributeNS",) else (args[1:2] if t.v == "at" else args[:1])
                    if t.v == "val":
                        self.lee_attr[prog]["val"].append((archivo, lin, modo))
                    for a in cand:
                        if len(a) == 1 and a[0].k == "str":
                            nm = a[0].v.split(":")[-1]
                            self.lee_attr[prog][nm].append((archivo, lin, modo))
                elif t.v == "switch":
                    args, fin = argumentos(toks, i + 1)
                    expr = {x.v for x in args[0]} if args else set()
                    if expr & (self.vars_localname | {"localName", "tagName", "nodeName"}):
                        j = fin + 1
                        if j < len(toks) and toks[j].v == "{":
                            prof = 0
                            while j < len(toks):
                                if toks[j].v == "{" and toks[j].k == "op":
                                    prof += 1
                                elif toks[j].v == "}" and toks[j].k == "op":
                                    prof -= 1
                                    if prof == 0:
                                        break
                                elif toks[j].k == "id" and toks[j].v == "case" and toks[j + 1].k == "str":
                                    if IDENT_ELEMENTO.match(toks[j + 1].v):
                                        self._reg_lee(prog, toks[j + 1].v, toks[j].l, archivo, "case", None)
                                j += 1
            # comparaciones con localName
            if t.k == "op" and t.v in ("===", "!==", "==", "!="):
                a, b = toks[i - 1] if i else None, toks[i + 1] if i + 1 < len(toks) else None
                for x, y in ((a, b), (b, a)):
                    if x and y and y.k == "str" and IDENT_ELEMENTO.match(y.v) and x.k == "id" and (
                            x.v in self.vars_localname or x.v in ("localName", "tagName", "nodeName")):
                        self._reg_lee(prog, y.v, lin, archivo, "localName", None)
            # [..].includes(localName) y /^(a|b)$/.test(localName)
            if t.k == "id" and t.v in ("includes", "has", "test", "indexOf") and i > 1 and toks[i - 1].v == "." and i + 1 < len(toks) and toks[i + 1].v == "(":
                args, fin = argumentos(toks, i + 1)
                usado = {x.v for x in args[0]} if args else set()
                if usado & (self.vars_localname | {"localName", "tagName", "nodeName"}):
                    prev = toks[i - 2]
                    if prev.k == "re":
                        for w in re.findall(r"[A-Za-z][A-Za-z0-9]*", prev.v):
                            if w in self.por_nombre:
                                self._reg_lee(prog, w, prev.l, archivo, "regex(localName)", None)
                    elif prev.v == "]":
                        j = i - 3
                        while j >= 0 and toks[j].v != "[":
                            if toks[j].k == "str" and IDENT_ELEMENTO.match(toks[j].v):
                                self._reg_lee(prog, toks[j].v, toks[j].l, archivo, "lista(localName)", None)
                            j -= 1
            # texto XML analizado con expresiones regulares o con cadenas: <w:nombre
            if es_lect and t.k in ("str", "tmpl", "re"):
                for m in re.finditer(r"<([A-Za-z][\w.-]*):([A-Za-z][\w.-]*)", t.v):
                    pref, nom = m.groups()
                    uris = self.prefijo_a_uris.get(pref) or ({self.esq.prefijo2uri[pref]} if pref in self.esq.prefijo2uri else set())
                    uri = next(iter(uris)) if len(uris) == 1 else None
                    self._reg_lee(prog, nom, lin, archivo, "texto", uri)
            # cualquier otro literal con forma de nombre: lectura posible (señal débil)
            if es_lect and t.k == "str" and IDENT_ELEMENTO.match(t.v) and t.v in self.por_nombre:
                self.nombres_genericos[prog][t.v].append((archivo, lin))

    def _resolver_prefijo(self, prog, pref):
        uris = set(self.prefijo_a_uris.get(pref, ()))
        if not uris and pref in self.esq.prefijo2uri:
            uris = {self.esq.prefijo2uri[pref]}
        # el mismo prefijo puede estar declarado con otro espacio (p. ej. «p» de pml y de VML): se queda
        # con el que tiene elementos en el esquema
        return uris

    def _escrituras(self, archivo, toks):
        for t in toks:
            if t.k not in ("str", "tmpl"):
                continue
            rk = self.prog_de(archivo, t.l)
            if rk is None or rk[1] != "escribe":
                continue
            prog = rk[0]
            txt = t.v
            if "<" not in txt:
                continue
            self.plantillas.append((prog, archivo, t.l, txt))
            for m in re.finditer(r"<(?!/|!|\?)(?:([A-Za-z][\w.-]*):)?([A-Za-z][\w.-]*|\u0001)([^>]*)", txt):
                pref, nom, resto = m.group(1), m.group(2), m.group(3)
                if nom == "\u0001":
                    self.dinamicos.append((prog, archivo, t.l, pref or ""))
                    continue
                if pref:
                    uris = self._resolver_prefijo(prog, pref)
                    uris = {u for u in uris if (u, nom) in self.esq.elementos} or uris
                    if not uris:
                        continue
                    uri = None
                    if len(uris) == 1:
                        uri = next(iter(uris))
                    else:
                        c = [u for u in uris if (u, nom) in self.esq.elementos]
                        uri = c[0] if c else None
                    if uri is None:
                        continue
                else:
                    uri = self._uri_sin_prefijo(prog, nom)
                    if uri is None:
                        continue
                self.escribe[prog].setdefault((uri, nom), []).append((archivo, t.l))
                for am in re.finditer(r"[\s\u0001\"']([A-Za-z][\w.-]*(?::[\w.-]+)?)=[\"'\u0001\\]", " " + resto):
                    self.escribe_attr[prog][(uri, nom)].append((am.group(1), archivo, t.l))

    def _uri_sin_prefijo(self, prog, nom):
        orden = []
        if prog == "Excel":
            orden.append("http://schemas.openxmlformats.org/spreadsheetml/2006/main")
        orden += ["http://schemas.openxmlformats.org/package/2006/content-types",
                  "http://schemas.openxmlformats.org/package/2006/relationships",
                  "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
                  "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties",
                  "http://schemas.openxmlformats.org/drawingml/2006/main" if prog == "PowerPoint" else "",
                  ]
        for u in orden:
            if u and (u, nom) in self.esq.elementos:
                return u
        return None


# ----------------------------------------------------------------------------------------------
# 4. Orden de los hijos que escribe el exportador
# ----------------------------------------------------------------------------------------------
def arbol_plantilla(txt):
    """Árbol de etiquetas de una plantilla: nodos [(pref, nombre), hijos, linea_rel]; U+0001 = trozo desconocido."""
    raiz = [("", "#raiz"), [], 0]
    pila = [raiz]
    for m in re.finditer(r"<(/?)(?:([A-Za-z][\w.-]*):)?([A-Za-z][\w.-]*)([^<>]*?)(/?)>|(\u0001)", txt):
        if m.group(6):
            pila[-1][1].append(None)
            continue
        cierra, pref, nom, _, auto = m.group(1), m.group(2) or "", m.group(3), m.group(4), m.group(5)
        if cierra:
            for k in range(len(pila) - 1, 0, -1):
                if pila[k][0] == (pref, nom):
                    del pila[k:]
                    break
            continue
        nodo = [(pref, nom), [], 0]
        pila[-1][1].append(nodo)
        if not auto:
            pila.append(nodo)
    return raiz


def revisar_orden(codigo, esq):
    """Recorre las plantillas que escribe el exportador y busca hijos fuera del orden del esquema."""
    hallazgos = []
    vistos = set()
    for prog, archivo, linea, txt in codigo.plantillas:
        raiz = arbol_plantilla(txt)

        def visitar(nodo, tipos_padre, sdk_pista=None):
            (pref, nom), hijos, _ = nodo
            if nom == "#raiz":
                for h in hijos:
                    if h:
                        visitar(h, None, None)
                return
            uris = codigo._resolver_prefijo(prog, pref) if pref else set()
            uri = None
            c = [u for u in uris if (u, nom) in esq.elementos]
            if c:
                uri = c[0]
            elif not pref and prog == "Excel":
                uri = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
            if uri is None:
                for h in hijos:
                    if h:
                        visitar(h, None)
                return
            # tipos posibles del elemento (por contexto, si se conoce; si no, todos los de ese nombre)
            if tipos_padre:
                cand = [esq.tipo_hijo.get((tp.clave, (uri, nom))) for tp in tipos_padre]
                cand = [x for x in cand if x is not None]
            else:
                cand = []
            if not cand:
                cand = [esq.tipos[k] if k in esq.tipos else None for k in esq.elementos.get((uri, nom), {}).get("tipos", ())]
                cand = [x for x in cand if x is not None]
                for k in esq.elementos.get((uri, nom), {}).get("tipos", ()):
                    if k not in esq.tipos:
                        for tt in esq.anon.values():
                            if tt.clave == k:
                                cand.append(tt)
            claves = []
            for h in hijos:
                if not h:
                    continue
                hp, hn = h[0]
                huris = codigo._resolver_prefijo(prog, hp) if hp else set()
                hc = [u for u in huris if (u, hn) in esq.elementos]
                if not hc and not hp and prog == "Excel":
                    hc = ["http://schemas.openxmlformats.org/spreadsheetml/2006/main"]
                claves.append((hc[0], hn) if hc else None)
            vio = []
            # modelo del SDK (más estricto: w:rPr y w:pPr de Word van en secuencia fija)
            modelos = esq.particulas.get((uri, nom), [])
            if sdk_pista:
                filtrados = [m_ for m_ in modelos if m_[0] in sdk_pista]
                modelos = filtrados or modelos
            nuevas_pistas = set()
            for _nm, rg, _comp in modelos:
                prev, ok, previo_nombre, detalle = -1, True, None, None
                for k in claves:
                    if k is None or k not in rg:
                        continue
                    elegibles = [r for r in rg[k] if r >= prev]
                    if not elegibles:
                        ok = False
                        detalle = "«%s» aparece después de «%s», pero en el esquema del Open XML SDK va antes" % (k[1], previo_nombre)
                        break
                    prev = min(elegibles)
                    previo_nombre = k[1]
                for k in claves:
                    if k in _comp:
                        nuevas_pistas.add(_comp[k])
                if ok:
                    detalle = None
                    break
            else:
                detalle = detalle if modelos else None
            if detalle:
                vio.append(detalle)
            if cand and not vio:
                malos_todos = True
                detalle = None
                for tp in cand:
                    rg = esq.rangos(tp)
                    prev, ok, previo_nombre = -1, True, None
                    for k in claves:
                        if k is None or k not in rg:
                            continue
                        elegibles = [r for r in rg[k] if r >= prev]
                        if not elegibles:
                            ok = False
                            detalle = "«%s» aparece después de «%s», pero en el esquema va antes" % (k[1], previo_nombre)
                            break
                        prev = min(elegibles)
                        previo_nombre = k[1]
                    if ok:
                        malos_todos = False
                        break
                if malos_todos and detalle:
                    vio.append(detalle)
            for d in vio:
                clave = (archivo, linea, pref, nom, d)
                if clave not in vistos:
                    vistos.add(clave)
                    hallazgos.append((prog, archivo, linea, "%s:%s" % (pref, nom) if pref else nom, d))
            for h in hijos:
                if h:
                    visitar(h, cand, nuevas_pistas)

        visitar(raiz, None)
    return hallazgos


# ----------------------------------------------------------------------------------------------
# 5. Unir todo y escribir resultados
# ----------------------------------------------------------------------------------------------
def recortar(lst, n=2):
    return lst[:n]


def principal():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    esq_dir, corp_dirs, cod_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    qui = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    salida = sys.argv[4] if len(sys.argv) > 4 else qui
    os.makedirs(os.path.join(salida, "herramientas"), exist_ok=True)

    print("1/5 esquemas…", file=sys.stderr)
    esq = Esquemas(esq_dir)
    print("    %d elementos declarados" % len(esq.elementos), file=sys.stderr)
    print("2/5 corpus…", file=sys.stderr)
    corp = Corpus([c for c in corp_dirs.split(":") if c])
    print("    %d archivos, %d partes XML" % (len(corp.archivos), corp.partes_total), file=sys.stderr)
    print("3/5 código…", file=sys.stderr)
    cod = Codigo(cod_dir)
    cod.analizar(esq)
    print("4/5 orden de los hijos…", file=sys.stderr)
    orden = revisar_orden(cod, esq)

    # ---- filas
    claves = set(esq.elementos)
    for (prog, uri, nom) in corp.el:
        claves.add((uri, nom))
    for prog in PROGRAMAS:
        for k in list(cod.lee[prog]) + list(cod.escribe[prog]):
            claves.add(k)
    n_prog = {p: sum(1 for q, _ in corp.archivos if q == p) for p in PROGRAMAS}
    filas = []
    for (uri, nom) in sorted(claves, key=lambda k: (esq.prefijo(k[0]), k[1])):
        g = grupo_de(uri) if uri else "Compartido"
        if g in PROGRAMAS:
            progs = [g]
        else:
            progs = [p for p in PROGRAMAS if (p, uri, nom) in corp.el or (uri, nom) in cod.lee[p] or (uri, nom) in cod.escribe[p]]
            if not progs:
                progs = ["Compartido"]
        sec = esq.secciones.get((uri, nom))
        info = esq.elementos.get((uri, nom))
        if sec:
            seccion = "ECMA-376-1 §" + sec[0]
        elif info:
            seccion = info["fuente"]
        else:
            seccion = "(no está en los esquemas)"
        for p in progs:
            c = corp.el.get((p, uri, nom))
            archivos = len(c[0]) if c else 0
            veces = c[1] if c else 0
            ev_l = cod.lee.get(p, {}).get((uri, nom), [])
            ev_e = cod.escribe.get(p, {}).get((uri, nom), [])
            nivel = "no"
            if ev_l:
                nivel = "si" if any(e[0] == "si" for e in ev_l) else "ambiguo"
            gen = cod.nombres_genericos.get(p, {}).get(nom)
            if nivel == "no" and gen and uri in esq.elementos and grupo_de(uri) in (p, "Compartido"):
                nivel = "posible"
            esc = "no"
            if ev_e:
                esc = "si"
            else:
                par = [e for e in ev_l if e[3].endswith(":escribe")]
                if par:
                    esc = "parcha"
            lee_real = [e for e in ev_l if not e[3].endswith(":escribe")]
            if ev_l and not lee_real and nivel in ("si", "ambiguo"):
                nivel = "no" if not gen else "posible"
            # si solo hay evidencia en el exportador, el importador no lo lee
            donde = []
            if lee_real:
                donde.append("lee: " + "; ".join(sorted({cod.donde(e[1], e[2]) for e in lee_real[:2]})))
            elif nivel == "posible":
                donde.append("posible lectura: " + cod.donde(*gen[0]))
            if ev_e:
                donde.append("escribe: " + "; ".join(sorted({cod.donde(e[0], e[1]) for e in ev_e[:2]})))
            elif esc == "parcha":
                donde.append("parcha el original: " + cod.donde(*[(e[1], e[2]) for e in ev_l if e[3].endswith(":escribe")][0]))
            filas.append({"programa": p, "uri": uri, "espacio": esq.prefijo(uri), "elemento": nom, "seccion": seccion,
                          "archivos": archivos, "veces": veces, "lee": nivel if nivel != "ambiguo" else "ambiguo",
                          "escribe": esc, "donde": " | ".join(donde), "en_esquema": (uri, nom) in esq.elementos,
                          "grupo": g, "titulo": sec[1] if sec else ""})

    with open(os.path.join(salida, "ooxml-elementos.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["programa", "espacio", "elemento", "seccion_ecma", "archivos_corpus", "veces_corpus", "lo_lee", "lo_escribe", "donde"])
        for r in filas:
            w.writerow([r["programa"], r["espacio"], r["elemento"], r["seccion"], r["archivos"], r["veces"], r["lee"], r["escribe"], r["donde"]])

    # ---- atributos
    nat = 0
    with open(os.path.join(salida, "ooxml-atributos.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["programa", "espacio", "elemento", "atributo", "requerido", "archivos_corpus", "veces_corpus", "lo_lee", "lo_escribe"])
        vistos_attr = set()
        for r in filas:
            p, uri, nom = r["programa"], r["uri"], r["elemento"]
            info = esq.elementos.get((uri, nom), {"attrs": {}})
            attrs = {}
            for (au, an), req in info["attrs"].items():
                attrs[(au, an)] = req
            for (cp, cu, cn, au, an), v in corp.at.items():
                if cp == p and cu == uri and cn == nom:
                    attrs.setdefault((au, an), None)
            esc_attrs = {a[0].split(":")[-1] for a in cod.escribe_attr.get(p, {}).get((uri, nom), [])}
            lee_attrs = set(cod.lee_attr.get(p, {}))
            for (au, an), req in sorted(attrs.items(), key=lambda t: (t[0][1], t[0][0] or "")):
                cc = corp.at.get((p, uri, nom, au, an))
                lee = "no" if r["lee"] in ("no",) else ("si" if an in lee_attrs else "no")
                esc = "no" if r["escribe"] == "no" else ("si" if an in esc_attrs else "no")
                w.writerow([p, r["espacio"], nom, (esq.prefijo(au) + ":" if au else "") + an,
                            {True: "si", False: "no", None: "(solo corpus)"}[req], len(cc[0]) if cc else 0, cc[1] if cc else 0, lee, esc])
                nat += 1

    # ---- orden
    with open(os.path.join(salida, "herramientas", "orden-hallazgos.tsv"), "w", encoding="utf-8") as f:
        f.write("programa\tarchivo\tlinea\telemento_padre\tproblema\n")
        for h in sorted(orden):
            f.write("\t".join(str(x) for x in h) + "\n")

    # ---- datos para tablas
    resumen(esq, corp, cod, filas, orden, salida, nat, n_prog)
    print("5/5 listo: %d filas de elementos, %d de atributos, %d avisos de orden" % (len(filas), nat, len(orden)), file=sys.stderr)


def pct(a, b):
    return "%.1f %%" % (100.0 * a / b) if b else "—"


def resumen(esq, corp, cod, filas, orden, salida, nat, n_prog):
    sal = []
    P = sal.append
    # --- resumen por programa
    P("### Resumen por programa\n")
    P("| Programa | Archivos en el corpus | Elementos en el esquema (espacios propios) | Aparecen en el corpus | Los lee la app (seguro) | Lectura ambigua (mismo nombre en varios espacios) | Cobertura simple de lectura | Ponderada por archivos (seguro) | Ponderada (seguro + ambiguo) | Los escribe la app |")
    P("|---|---|---|---|---|---|---|---|---|---|")
    for p in PROGRAMAS:
        propios = {k for k in esq.elementos if grupo_de(k[0]) == p}
        fp = [r for r in filas if r["programa"] == p and r["archivos"] > 0]
        fp_prop = [r for r in fp if r["grupo"] == p]
        # todas las filas de este programa que aparecen, sea cual sea su espacio de nombres
        ap = len(fp)
        si = sum(1 for r in fp if r["lee"] == "si")
        am = sum(1 for r in fp if r["lee"] == "ambiguo")
        tot_arch = sum(r["archivos"] for r in fp)
        arch_si = sum(r["archivos"] for r in fp if r["lee"] == "si")
        arch_am = sum(r["archivos"] for r in fp if r["lee"] == "ambiguo")
        esc = sum(1 for r in filas if r["programa"] == p and r["escribe"] in ("si", "parcha") and r["en_esquema"])
        P("| %s | %d | %d | %d | %d | %d | %s | %s | %s | %d |" % (
            p, n_prog[p], len(propios), ap, si, am, pct(si, ap), pct(arch_si, tot_arch), pct(arch_si + arch_am, tot_arch), esc))
    P("")
    # --- por espacio de nombres
    P("### Resumen por espacio de nombres\n")
    P("| Programa | Prefijo | Espacio de nombres | Elementos en el esquema | Aparecen en el corpus | Seguro | Ambiguo | Posible | Archivos-elemento (suma) | Leídos (suma, seguro) |")
    P("|---|---|---|---|---|---|---|---|---|---|")
    por_ns = collections.defaultdict(list)
    for r in filas:
        por_ns[(r["grupo"], r["uri"])].append(r)
    for (g, uri), rs in sorted(por_ns.items(), key=lambda t: (PROGRAMAS.index(t[0][0]) if t[0][0] in PROGRAMAS else 9, esq.prefijo(t[0][1]))):
        if not any(r["archivos"] for r in rs) and not any(k[0] == uri for k in esq.elementos):
            continue
        uniq = {r["elemento"] for r in rs if r["en_esquema"]}
        apar = {}
        for r in rs:
            if r["archivos"]:
                apar.setdefault(r["elemento"], []).append(r)
        # un elemento puede estar en varios programas (espacios compartidos): se cuenta una vez, con su mejor nivel
        orden_niv = {"si": 3, "ambiguo": 2, "posible": 1, "no": 0}
        mejor = {n: max(v, key=lambda r: orden_niv[r["lee"]])["lee"] for n, v in apar.items()}
        s = sum(1 for v in mejor.values() if v == "si")
        a = sum(1 for v in mejor.values() if v == "ambiguo")
        po = sum(1 for v in mejor.values() if v == "posible")
        sa = sum(sum(x["archivos"] for x in v) for v in apar.values())
        sl = sum(sum(x["archivos"] for x in v if x["lee"] == "si") for v in apar.values())
        P("| %s | %s | `%s` | %d | %d | %d | %d | %d | %d | %d |" % (g, esq.prefijo(uri), uri, len(uniq), len(apar), s, a, po, sa, sl))
    P("")

    # --- lista de elementos que aparecen en 3 o más archivos y la app no lee
    for p in PROGRAMAS:
        P("### Elementos de %s que aparecen en 3 o más archivos del corpus y la app no lee\n" % p)
        P("Columnas: archivos · veces · espacio:elemento · sección · título oficial (inglés) · lectura (no / posible).\n")
        cand = [r for r in filas if r["programa"] == p and r["archivos"] >= 3 and r["lee"] in ("no", "posible")]
        cand.sort(key=lambda r: (-r["archivos"], -r["veces"], r["espacio"], r["elemento"]))
        P("| Archivos | Veces | Elemento | Sección | Título oficial | Lectura | ¿Lo escribe? |")
        P("|---|---|---|---|---|---|---|")
        for r in cand:
            P("| %d | %d | `%s:%s` | %s | %s | %s | %s |" % (r["archivos"], r["veces"], r["espacio"], r["elemento"], r["seccion"], r["titulo"], r["lee"], r["escribe"]))
        P("")
    with open(os.path.join(salida, "herramientas", "tablas-generadas.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(sal) + "\n")

    # --- datos auxiliares en JSON para el informe
    datos = {
        "archivos": [(p, os.path.basename(r)) for p, r in corp.archivos],
        "errores": corp.errores,
        "dinamicos": [(p, a, l, pf) for p, a, l, pf in cod.dinamicos],
        "prefijos_codigo": {k: sorted(v) for k, v in cod.prefijo_a_uris.items()},
        "rangos": {"%s/%s" % k: v for k, v in cod.rangos.items()},
        "ignorable": dict(corp.mc_ignorable),
        "partes": {"%s|%s" % k: len(v) for k, v in corp.partes.items()},
        "total_elementos_esquema": len(esq.elementos),
    }
    with open(os.path.join(salida, "herramientas", "datos-auxiliares.json"), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    principal()
