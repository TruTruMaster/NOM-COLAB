import os, sys, tempfile; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sys, json
from nomprueba import *
import urllib.parse as up
esperar_servidor()
c = cuenta()
t = c["token"]
def g(u):
    st, r = api("GET", u, None, t); return st, r
st, r = g("/api/fuentes/buscar?q=" + up.quote("fotosíntesis") + "&donde=wikipedia"); print("wikipedia buscar:", st, [x["titulo"] for x in (r or [])][:4])
st, r = g("/api/fuentes/wikipedia?titulo=" + up.quote("Fotosíntesis")); print("wikipedia artículo:", st, (r or {}).get("fuente"), len((r or {}).get("texto", "")))
st, r = g("/api/fuentes/buscar?q=" + up.quote("cien años de soledad") + "&donde=libros"); print("libros:", st, [(x["fuente"].get("titulo"), x["fuente"].get("anio"), [a for a in x["fuente"].get("autores", [])][:1]) for x in (r or [])][:3])
st, r = g("/api/fuentes/buscar?q=" + up.quote("climate change mexico") + "&donde=articulos"); print("artículos:", st, [(x["fuente"].get("titulo", "")[:50], x["fuente"].get("revista"), x["fuente"].get("anio")) for x in (r or [])][:3])
st, r = g("/api/fuentes/doi?doi=10.1038/nature12373"); print("doi:", st, (r or {}).get("fuente"))
st, r = g("/api/fuentes/isbn?isbn=9780307474728"); print("isbn:", st, (r or {}).get("fuente"))
st, r = g("/api/fuentes/web?url=" + up.quote("https://www.bbc.com/mundo", safe="")); print("web bbc:", st, {k: v for k, v in ((r or {}).get("fuente") or {}).items() if k in ("tipo", "titulo", "sitio", "autores", "fecha")})
st, r = g("/api/fuentes/web?url=" + up.quote("https://es.wikipedia.org/wiki/Revoluci%C3%B3n_mexicana", safe="")); print("web wiki:", st, {k: v for k, v in ((r or {}).get("fuente") or {}).items() if k in ("tipo", "titulo", "sitio", "fecha")})
st, r = g("/api/fuentes/datos"); print("conjuntos:", st, [x["id"] for x in (r or [])])
st, r = g("/api/fuentes/datos/estados-mexico"); print("wikidata estados:", st, (r or {}).get("columnas"), len((r or {}).get("filas", [])), ((r or {}).get("filas") or [None])[:2])
st, r = g("/api/fuentes/datos/elementos"); print("wikidata elementos:", st, len((r or {}).get("filas", [])), ((r or {}).get("filas") or [None])[:2])
st, r = g("/api/fuentes/datos/planetas"); print("wikidata planetas:", st, ((r or {}).get("filas") or [None])[:3])
