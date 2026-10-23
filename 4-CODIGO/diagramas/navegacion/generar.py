#!/usr/bin/env python3
"""NOM-COLAB · Mapa de navegación (árbol del sitio con el flujo ideal del usuario).

Cada pantalla tiene una posición fija en una cuadrícula y las uniones son ortogonales
(padre → barra horizontal → hijos), así ninguna línea cruza una caja.
Genera ../svg/07-navegacion.svg y ../png/07-navegacion.png (con rsvg-convert).

    python3 navegacion/generar.py
"""
import os
import subprocess
from xml.sax.saxutils import escape

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA_SVG = os.path.join(AQUI, "..", "svg", "07-navegacion.svg")
SALIDA_PNG = os.path.join(AQUI, "..", "png", "07-navegacion.png")

ANCHO, ALTO = 2560, 1420
CAJA_W, CAJA_H = 236, 76
FILAS = [150, 290, 430, 600, 770, 930, 1100, 1290]

# Paleta por módulo: (relleno, borde, texto)
C = {
    "inicio": ("#EEEEFF", "#5B5BD6", "#2B2A6B"),
    "cuentas": ("#FDE7EF", "#D6336C", "#7A1D3F"),
    "espacios": ("#E8EEFF", "#3D72F2", "#1E3F8F"),
    "texto": ("#E8EEFF", "#3D72F2", "#1E3F8F"),
    "hoja": ("#E3F6EC", "#2FA868", "#165C38"),
    "pres": ("#FFF0E0", "#F08C2A", "#7A3E06"),
    "diag": ("#F0EAFF", "#8B5CF6", "#4C2A9E"),
    "editor": ("#F5F3EF", "#6B6875", "#2E2C38"),
    "sistema": ("#F5F3EF", "#9A97A6", "#3A3752"),
}

# id: (texto (\n = renglón), x del centro, fila, estilo)
N = {
    "bienvenida": ("Bienvenida", 1180, 0, "inicio"),
    "login": ("Iniciar sesión", 860, 1, "cuentas"),
    "registro": ("Crear cuenta\nnombre, contraseña, empresa", 1260, 1, "cuentas"),
    "sincuenta": ("Usar sin cuenta", 2300, 1, "sistema"),
    "inicio": ("Inicio\nrecientes y tus espacios", 860, 2, "inicio"),
    "locales": ("Mis documentos locales\nsolo en este equipo", 2300, 2, "sistema"),
    "continua": ("Continúa donde lo dejaste\n→ abre el editor", 170, 3, "inicio"),
    "espacio": ("Espacio de trabajo", 700, 3, "espacios"),
    "unirse": ("Unirse a un espacio\nred local o compartido", 1110, 3, "espacios"),
    "dispositivo": ("Este dispositivo\ncopias y espacio usado", 1390, 3, "sistema"),
    "cuenta": ("Menú de la cuenta\najustes · cerrar sesión", 1670, 3, "inicio"),
    "editorlocal": ("Editor local\nmismos 4 tipos", 2300, 3, "sistema"),
    "subir": ("Subir a un espacio\nal crear cuenta o entrar", 2300, 4, "sistema"),
    "docs": ("Documentos del espacio\nfiltrar por tipo · buscar", 330, 4, "espacios"),
    "accesos": ("Compartir y accesos\nlectura · edición · quitar", 610, 4, "espacios"),
    "conexion": ("Conexión del proyecto\nsolo en red local", 890, 4, "espacios"),
    "almacen": ("Almacenamiento\nconsumo · depurar", 1170, 4, "espacios"),
    "nuevo": ("Nuevo documento\nnombre + TIPO + plantilla", 190, 5, "espacios"),
    "abrir": ("Abrir documento\nse abre en su tipo", 470, 5, "espacios"),
    "etexto": ("Editor de Texto", 150, 6, "texto"),
    "ehoja": ("Editor de Hoja", 410, 6, "hoja"),
    "epres": ("Editor de Presentación", 670, 6, "pres"),
    "ediag": ("Editor de Diagrama", 930, 6, "diag"),
    "historial": ("Historial y actividad\nversiones · quién cambió", 250, 7, "editor"),
    "descargar": ("Descargar\n.docx .xlsx .pptx PDF", 540, 7, "editor"),
    "volver": ("Volver al espacio\nya está guardado", 830, 7, "editor"),
}

# (padre, [hijos], etiqueta opcional junto al padre)
ARBOL = [
    ("bienvenida", ["login", "registro", "sincuenta"], None),
    ("login", ["inicio"], "sesión válida · cuenta en la BD"),
    ("sincuenta", ["locales"], None),
    ("locales", ["editorlocal"], None),
    ("editorlocal", ["subir"], None),
    ("inicio", ["continua", "espacio", "unirse", "dispositivo", "cuenta"], None),
    ("espacio", ["docs", "accesos", "conexion", "almacen"], None),
    ("docs", ["nuevo", "abrir"], None),
]


def ancho(texto):
    """La caja crece con su texto: ~10.6 px por letra en el título (19 px) y ~8.2 en el subtítulo."""
    l = texto.split("\n")
    return max(CAJA_W, len(l[0]) * 10.6 + 34, *(len(x) * 8.2 + 34 for x in l[1:]))


def caja(nid):
    texto, cx, fila, estilo = N[nid]
    w = ancho(texto)
    return cx - w / 2, FILAS[fila] - CAJA_H / 2, w, CAJA_H, texto, estilo


def svg_caja(nid):
    x, y, w, h, texto, estilo = caja(nid)
    f, b, t = C[estilo]
    lineas = texto.split("\n")
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{f}" stroke="{b}" stroke-width="2.5"/>']
    y0 = y + h / 2 - (len(lineas) - 1) * 12
    for i, l in enumerate(lineas):
        peso, tam, col = (800, 19, t) if i == 0 else (600, 15, t)
        out.append(f'<text x="{x + w / 2}" y="{y0 + i * 24}" text-anchor="middle" dominant-baseline="middle" '
                   f'font-family="Nunito, sans-serif" font-size="{tam}" font-weight="{peso}" fill="{col}">{escape(l)}</text>')
    return "\n".join(out)


def linea(puntos, flecha=True, color="#3A3752", guiones=False):
    d = "M" + " L".join(f"{x},{y}" for x, y in puntos)
    extra = ' stroke-dasharray="7 6"' if guiones else ""
    fin = ' marker-end="url(#flecha)"' if flecha else ""
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2.2"{extra}{fin}/>'


def bus(padre, hijos):
    """Padre → barra horizontal a media altura → cada hijo."""
    px, py, pw, ph, *_ = caja(padre)
    sx, sy = px + pw / 2, py + ph
    hy = min(caja(h)[1] for h in hijos)
    my = (sy + hy) / 2
    xs = [caja(h)[0] + caja(h)[2] / 2 for h in hijos]
    out = [linea([(sx, sy), (sx, my)], flecha=False)]
    if len(hijos) > 1 or xs[0] != sx:
        out.append(linea([(min(xs + [sx]), my), (max(xs + [sx]), my)], flecha=False))
    for h, x in zip(hijos, xs):
        out.append(linea([(x, my), (x, caja(h)[1] - 2)]))
    return "\n".join(out), my


def etiqueta(x, y, texto, ancla="start", color="#55526A"):
    return (f'<text x="{x}" y="{y}" text-anchor="{ancla}" font-family="Nunito, sans-serif" font-size="15" '
            f'font-weight="700" fill="{color}">{escape(texto)}</text>')


def generar():
    partes = []
    for padre, hijos, txt in ARBOL:
        s, my = bus(padre, hijos)
        partes.append(s)
        if txt:
            px = caja(padre)[0] + caja(padre)[2] / 2
            partes.append(etiqueta(px + 10, my - 8, txt))

    # Crear cuenta → Iniciar sesión (registro exitoso)
    rx, ry, *_ = caja("registro")
    lx, ly, lw, *_ = caja("login")
    partes.append(linea([(rx, ry + CAJA_H / 2), (lx + lw + 4, ly + CAJA_H / 2)]))
    partes.append(etiqueta((rx + lx + lw) / 2, ry + CAJA_H / 2 - 10, "registro exitoso", "middle"))

    # Abrir y Nuevo → los 4 editores (barra común)
    tipos = ["etexto", "ehoja", "epres", "ediag"]
    ytop = caja("etexto")[1]
    yb = (caja("nuevo")[1] + CAJA_H + ytop) / 2
    for o in ("nuevo", "abrir"):
        ox, oy, ow, oh, *_ = caja(o)
        partes.append(linea([(ox + ow / 2, oy + oh), (ox + ow / 2, yb)], flecha=False))
    xs = [caja(t)[0] + caja(t)[2] / 2 for t in tipos]
    partes.append(linea([(min(xs), yb), (max(xs), yb)], flecha=False))
    for x in xs:
        partes.append(linea([(x, yb), (x, ytop - 2)]))
    partes.append(etiqueta(1100, yb + 5, "el tipo se elige al crear y queda fijo"))

    # Los 4 editores → acciones comunes
    acciones = ["historial", "descargar", "volver"]
    yb2 = (ytop + CAJA_H + caja("historial")[1]) / 2
    for x in xs:
        partes.append(linea([(x, ytop + CAJA_H), (x, yb2)], flecha=False))
    xa = [caja(a)[0] + caja(a)[2] / 2 for a in acciones]
    partes.append(linea([(min(xs + xa), yb2), (max(xs + xa), yb2)], flecha=False))
    for x in xa:
        partes.append(linea([(x, yb2), (x, caja("historial")[1] - 2)]))
    partes.append(etiqueta(1100, yb2 + 5, "cada cambio se guarda solo y queda en la bitácora"))

    # Atajos al editor (punteados): Continúa donde lo dejaste y Este dispositivo
    cx_, cy_, cw_, ch_, *_ = caja("continua")
    partes.append(linea([(cx_ + 30, cy_ + ch_), (cx_ + 30, ytop - 2)], guiones=True, color="#5B5BD6"))
    # Volver al espacio → Documentos (punteado, sube por la izquierda)
    vx, vy, vw, vh, *_ = caja("volver")
    dx_, dy_, dw_, dh_, *_ = caja("docs")
    xr = max(caja(t)[0] + caja(t)[2] for t in tipos) + 36   # por fuera de los editores
    partes.append(linea([(vx + vw, vy + vh / 2), (xr, vy + vh / 2), (xr, dy_ + dh_ / 2 + 60),
                         (dx_ + dw_ + 4, dy_ + dh_ / 2 + 60)], guiones=True, color="#5B5BD6"))
    # Unirse → Espacio (acceso concedido)
    ux, uy, uw, uh, *_ = caja("unirse")
    ex, ey, ew, eh, *_ = caja("espacio")
    partes.append(linea([(ux, uy + uh / 2), (ex + ew + 4, ey + eh / 2)], guiones=True, color="#5B5BD6"))
    partes.append(etiqueta((ux + ex + ew) / 2, uy + uh / 2 - 10, "acceso concedido", "middle", "#5B5BD6"))

    cajas = "\n".join(svg_caja(n) for n in N)

    # Leyenda y notas
    lx0, ly0 = 1500, 1080
    ley = [f'<rect x="{lx0}" y="{ly0}" width="1010" height="300" rx="18" fill="#FBFAF7" stroke="#D9D4CA"/>',
           etiqueta(lx0 + 28, ly0 + 44, "Cómo leer el mapa", color="#1E1B2E")]
    items = [("cuentas", "Gestión de cuentas"), ("inicio", "Inicio y cuenta"), ("espacios", "Espacios de trabajo"),
             ("sistema", "Sin cuenta / este dispositivo")]
    for i, (e, t) in enumerate(items):
        f, b, _ = C[e]
        y = ly0 + 80 + i * 40
        ley.append(f'<rect x="{lx0 + 28}" y="{y - 16}" width="34" height="24" rx="7" fill="{f}" stroke="{b}" stroke-width="2"/>')
        ley.append(etiqueta(lx0 + 76, y + 2, t, color="#3A3752"))
    notas = ["Línea continua: navegación principal.",
             "Punteada: atajo o regreso (siempre al espacio del documento).",
             "Un documento conserva el tipo con el que se creó:",
             "cambiarlo rompería su formato (texto ↔ hoja).",
             "Sin administrador: el propietario de cada espacio",
             "da, cambia o quita accesos; lo demás recibe 403."]
    for i, t in enumerate(notas):
        ley.append(etiqueta(lx0 + 520, ly0 + 82 + i * 40, t, color="#3A3752"))

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ANCHO} {ALTO}" width="{ANCHO}" height="{ALTO}">
<defs><marker id="flecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0,0 L10,5 L0,10 z" fill="#3A3752"/></marker></defs>
<rect width="100%" height="100%" fill="#FFFFFF"/>
<text x="{ANCHO / 2}" y="60" text-anchor="middle" font-family="Nunito, sans-serif" font-size="34" font-weight="900" fill="#1E1B2E">NOM-COLAB · Mapa de navegación</text>
<text x="{ANCHO / 2}" y="92" text-anchor="middle" font-family="Nunito, sans-serif" font-size="18" font-weight="600" fill="#55526A">El camino ideal del usuario, de la bienvenida al documento</text>
{chr(10).join(partes)}
{cajas}
{chr(10).join(ley)}
</svg>'''
    os.makedirs(os.path.dirname(SALIDA_SVG), exist_ok=True)
    with open(SALIDA_SVG, "w", encoding="utf-8") as f:
        f.write(svg)
    subprocess.run(["rsvg-convert", "-w", str(ANCHO), SALIDA_SVG, "-o", SALIDA_PNG], check=True)
    print("ok:", SALIDA_SVG, SALIDA_PNG)


if __name__ == "__main__":
    generar()
