#!/usr/bin/env python3
"""Reconstruye index.html: visor sin internet de todos los diagramas (SVG incrustados).
Uso: python3 generar-visor.py   (después de regenerar svg/ y actividades/svg/)"""
import html, os, re

AQUI = os.path.dirname(os.path.abspath(__file__))
DIAGRAMAS = [
    ("svg/01-clases.svg", "Clases (núcleo)", "Cada clase es un archivo con el mismo nombre en mx.wack.nom."),
    ("svg/02-paquetes.svg", "Paquetes", "Todo depende de core; core no depende de nadie."),
    ("svg/03-flujo-cuentas.svg", "Flujo — registro e inicio de sesión", ""),
    ("svg/04-flujo-espacio.svg", "Flujo — crear/unirse a espacio + servidor local", ""),
    ("svg/05-flujo-edicion.svg", "Flujo — edición colaborativa (CRDT)", "Aplicar local primero, difundir después."),
    ("svg/06-flujo-android.svg", "Flujo — conexión Android", ""),
    ("svg/07-navegacion.svg", "Navegación", "Conoce NOM se retiró; las preferencias viven en el menú de cuenta."),
    ("svg/08-cu-cuentas.svg", "Casos de uso — Gestión de cuentas", ""),
    ("svg/10-cu-espacios.svg", "Casos de uso — Espacios de trabajo", ""),
    ("svg/11-cu-general.svg", "Casos de uso — vista general", ""),
    ("svg/12-modelo-datos.svg", "Modelo de base de datos", ""),
    ("svg/13-secuencia-login.svg", "Secuencia — inicio de sesión", ""),
    ("svg/14-secuencia-unirse.svg", "Secuencia — unirse a un espacio en la LAN", ""),
    ("svg/15-secuencia-edicion.svg", "Secuencia — edición concurrente", ""),
    ("svg/16-secuencia-android.svg", "Secuencia — Android sin conexión", ""),
    ("actividades/svg/A1-crear-usuario.svg", "Actividades — Crear usuario", "Módulo Gestión de cuentas"),
    ("actividades/svg/A2-iniciar-sesion.svg", "Actividades — Iniciar sesión", "Módulo Gestión de cuentas"),
    ("actividades/svg/A8-usar-sin-cuenta.svg", "Actividades — Usar sin cuenta", "Módulo Gestión de cuentas"),
    ("actividades/svg/A3-crear-espacio.svg", "Actividades — Crear espacio y activar conexión", "Módulo Espacios de trabajo"),
    ("actividades/svg/A4-unirse-espacio.svg", "Actividades — Unirse a un espacio", "Módulo Espacios de trabajo"),
    ("actividades/svg/A5-gestion-accesos.svg", "Actividades — Gestión de accesos", "Módulo Espacios de trabajo"),
    ("actividades/svg/A6-editor.svg", "Actividades — Editor", "Módulo Espacios de trabajo"),
    ("actividades/svg/A7-almacenamiento.svg", "Actividades — Almacenamiento y versiones", "Módulo Espacios de trabajo"),
]

def svg(ruta):
    s = open(os.path.join(AQUI, ruta), encoding="utf-8").read()
    s = re.sub(r"<\?xml[^>]*\?>", "", s)
    return s[s.index("<svg"):]

nav, secciones = [], []
for i, (ruta, titulo, desc) in enumerate(DIAGRAMAS):
    ident = os.path.splitext(os.path.basename(ruta))[0]
    nav.append(f'<a href="#{ident}">{html.escape(titulo.split(" — ")[-1])}</a>')
    secciones.append(f'<section id="{ident}"><h2>{html.escape(titulo)}</h2>'
                     + (f'<p class="d">{html.escape(desc)}</p>' if desc else "")
                     + f'<div class="box">{svg(ruta)}</div></section>')

pagina = f"""<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NOM-COLAB Diagramas</title><style>
:root{{--bg:#f6f7f9;--fg:#15202b;--mut:#5b6b7c;--card:#fff;--bd:#dde3ea;--ac:#4343B8}}
@media(prefers-color-scheme:dark){{:root{{--bg:#11161c;--fg:#e7edf4;--mut:#9aa9b8;--card:#1a212a;--bd:#2c3742;--ac:#9B9BFF}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}}
header{{padding:28px 16px;border-bottom:1px solid var(--bd);background:var(--card)}}h1{{margin:0 0 6px;font-size:1.5rem}}.sub{{color:var(--mut);margin:0}}
nav{{position:sticky;top:0;z-index:9;display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px;background:var(--card);border-bottom:1px solid var(--bd)}}
nav a{{font-size:.82rem;color:var(--ac);text-decoration:none;border:1px solid var(--bd);padding:5px 10px;border-radius:99px;white-space:nowrap}}
main{{max-width:1100px;margin:0 auto;padding:16px}}section{{margin:32px 0}}h2{{font-size:1.15rem;margin:0 0 4px}}.d{{color:var(--mut);margin:0 0 12px}}
.box{{background:#fff;border:1px solid var(--bd);border-radius:10px;padding:14px;overflow:auto}}.box svg{{width:100%;height:auto;display:block}}
</style></head><body>
<header><h1>NOM-COLAB — Diagramas</h1><p class="sub">Equipo 6 "WACK" · CECyT 9 · 5IM7 · {len(DIAGRAMAS)} diagramas, sin internet</p></header>
<nav>{''.join(nav)}</nav><main>{''.join(secciones)}</main></body></html>"""
open(os.path.join(AQUI, "index.html"), "w", encoding="utf-8").write(pagina)
print("index.html:", len(DIAGRAMAS), "diagramas,", len(pagina) // 1024, "KB")
