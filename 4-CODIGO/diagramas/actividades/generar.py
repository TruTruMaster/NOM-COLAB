#!/usr/bin/env python3
"""Genera los diagramas de actividades de NOM-COLAB con el estilo del modelo
(carriles Usuario / Sistema / Base de datos, cajas rectas, rombos, nodos de
inicio y fin en rosa).

Cada diagrama se describe en una cuadricula: carril, columna dentro del carril
y renglon.  De la misma descripcion salen tres archivos:

    svg/<id>.svg      vector, para el documento
    png/<id>.png      imagen a 2x
    drawio/<id>.drawio  editable en diagrams.net (draw.io)

Uso:  python3 generar.py
"""
import html
import os
import subprocess

AQUI = os.path.dirname(os.path.abspath(__file__))

CARRILES = [
    # nombre, encabezado, borde, relleno de actividades, fondo
    ("Usuario", "#F8CECC", "#B85450", "#F8CECC", "#FFFFFF"),
    ("Sistema", "#DAE8FC", "#6C8EBF", "#DAE8FC", "#FFFFFF"),
    ("Base de datos", "#D5E8D4", "#82B366", "#D5E8D4", "#FFFFFF"),
]
TITULO_COLOR = "#B5397A"
LINEA = "#6E6E6E"
FUENTE = "Liberation Sans, Arial, Helvetica, sans-serif"
FS = 11            # tamano de letra
LH = 13            # alto de renglon de texto
FILA = 64          # alto de un renglon de la cuadricula
COL = 80           # ancho de una columna de la cuadricula
CAJA_W = 112
ROMBO_W, ROMBO_H = 104, 46
R_NODO = 11
TOP = 64           # y del primer renglon (titulo + encabezado de carril)


def envolver(texto, ancho=19):
    lineas = []
    for parrafo in texto.split("\n"):
        actual = ""
        for palabra in parrafo.split():
            if actual and len(actual) + 1 + len(palabra) > ancho:
                lineas.append(actual)
                actual = palabra
            else:
                actual = (actual + " " + palabra).strip()
        lineas.append(actual)
    return lineas


class Nodo:
    def __init__(self, d, ident, tipo, carril, col, fila, texto=""):
        self.id, self.tipo, self.carril, self.texto = ident, tipo, carril, texto
        self.cx = d.x_carril(carril) + d.anchos[carril] / 2 + col * COL
        self.cy = TOP + fila * FILA
        if tipo == "act":
            self.lineas = envolver(texto)
            self.w = CAJA_W
            self.h = max(34, 12 + LH * len(self.lineas))
        elif tipo == "dec":
            self.lineas = envolver(texto, 16)
            self.w, self.h = ROMBO_W, ROMBO_H + (len(self.lineas) - 1) * 10
        else:
            self.lineas = []
            self.w = self.h = 2 * R_NODO

    # bordes
    @property
    def top(self): return self.cy - self.h / 2
    @property
    def bottom(self): return self.cy + self.h / 2
    @property
    def left(self): return self.cx - self.w / 2
    @property
    def right(self): return self.cx + self.w / 2


class Diagrama:
    def __init__(self, ident, titulo, pie, anchos=(250, 280, 330)):
        self.ident, self.titulo, self.pie = ident, titulo, pie
        self.anchos = list(anchos)
        self.nodos, self.aristas = {}, []

    def x_carril(self, i):
        return 10 + sum(self.anchos[:i])

    def n(self, ident, tipo, carril, col, fila, texto=""):
        self.nodos[ident] = Nodo(self, ident, tipo, carril, col, fila, texto)

    def e(self, a, b, ruta="auto", etiqueta=None, y=None, x=None):
        self.aristas.append((a, b, ruta, etiqueta, y, x))

    # ---------------------------------------------------------------- rutas
    def puntos(self, a, b, ruta, y=None, x=None):
        s, t = self.nodos[a], self.nodos[b]
        if ruta == "auto":
            if abs(s.cy - t.cy) < 1:
                ruta = "h"
            elif abs(s.cx - t.cx) < 1:
                ruta = "v"
            else:
                ruta = "hv"
        if ruta == "h":
            if t.cx > s.cx:
                return [(s.right, s.cy), (t.left, t.cy)], ruta
            return [(s.left, s.cy), (t.right, t.cy)], ruta
        if ruta == "v":
            if abs(s.cx - t.cx) < 1:
                return [(s.cx, s.bottom), (t.cx, t.top)], ruta
            ruta = "vhv"
        if ruta == "hv":
            sx = s.right if t.cx > s.cx else s.left
            return [(sx, s.cy), (t.cx, s.cy), (t.cx, t.top)], ruta
        if ruta == "vh":
            tx = t.left if t.cx > s.cx else t.right
            return [(s.cx, s.bottom), (s.cx, t.cy), (tx, t.cy)], ruta
        if ruta == "vhv":
            my = y if y is not None else t.top - 18
            return [(s.cx, s.bottom), (s.cx, my), (t.cx, my), (t.cx, t.top)], ruta
        if ruta == "regreso":       # sale por la izquierda, sube y entra por la izquierda
            gx = x if x is not None else min(s.left, t.left) - 24
            return [(s.left, s.cy), (gx, s.cy), (gx, t.cy), (t.left, t.cy)], ruta
        raise ValueError(ruta)


    # ------------------------------------------------------------- revision
    def revisar(self):
        """Avisa si una linea atraviesa una caja ajena o si dos cajas se enciman."""
        avisos = []
        nds = list(self.nodos.values())
        for i, a in enumerate(nds):
            for b in nds[i + 1:]:
                if (a.left - 6 < b.right and b.left - 6 < a.right and
                        a.top - 6 < b.bottom and b.top - 6 < a.bottom):
                    avisos.append(f"cajas encimadas: {a.id} / {b.id}")
        for a, b, ruta, etq, y, x in self.aristas:
            pts, _ = self.puntos(a, b, ruta, y, x)
            for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
                for nd in nds:
                    if nd.id in (a, b):
                        continue
                    lx, hx = sorted((x1, x2)); ly, hy = sorted((y1, y2))
                    if lx < nd.right + 3 and hx > nd.left - 3 and ly < nd.bottom + 3 and hy > nd.top - 3:
                        avisos.append(f"linea {a}->{b} cruza {nd.id}")
            s_, t_ = self.nodos[a], self.nodos[b]
            if ruta in ("hv",) and t_.left - 2 < (s_.right if t_.cx > s_.cx else s_.left) < t_.right + 2 and abs(t_.cx - s_.cx) < (s_.w / 2 + 8):
                avisos.append(f"linea {a}->{b}: el destino queda bajo el lado de salida")
        return avisos

    # ------------------------------------------------------------------ svg
    def svg(self):
        alto = max(nd.bottom for nd in self.nodos.values()) + 30
        ancho = self.x_carril(3) + 10
        o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{ancho:.0f}" height="{alto:.0f}" '
             f'viewBox="0 0 {ancho:.0f} {alto:.0f}" font-family="{FUENTE}" font-size="{FS}">',
             '<defs><marker id="f" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" '
             f'markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{LINEA}"/></marker></defs>',
             f'<rect width="100%" height="100%" fill="#FFFFFF"/>',
             f'<text x="10" y="20" fill="{TITULO_COLOR}" font-size="14">{html.escape(self.titulo)}</text>']
        y0 = 30
        for i, (nombre, enc, borde, _r, fondo) in enumerate(CARRILES):
            x = self.x_carril(i)
            w = self.anchos[i]
            o.append(f'<rect x="{x}" y="{y0}" width="{w}" height="{alto - y0 - 8}" fill="{fondo}" stroke="{borde}" stroke-width="1.2"/>')
            o.append(f'<rect x="{x}" y="{y0}" width="{w}" height="22" fill="{enc}" stroke="{borde}" stroke-width="1.2"/>')
            o.append(f'<text x="{x + w / 2}" y="{y0 + 15}" text-anchor="middle" font-weight="bold">{nombre}</text>')
        for a, b, ruta, etq, y, x in self.aristas:
            pts, ruta = self.puntos(a, b, ruta, y, x)
            d = " ".join(f"{px:.1f},{py:.1f}" for px, py in pts)
            o.append(f'<polyline points="{d}" fill="none" stroke="{LINEA}" stroke-width="1.1" marker-end="url(#f)"/>')
            if etq:
                (x1, y1), (x2, y2) = pts[0], pts[1]
                if abs(y1 - y2) < 1:          # primer tramo horizontal
                    anchor = "start" if x2 > x1 else "end"
                    lx = x1 + (4 if x2 > x1 else -4)
                    o.append(f'<text x="{lx:.1f}" y="{y1 - 4:.1f}" text-anchor="{anchor}" font-size="9.5" fill="#333">{html.escape(etq)}</text>')
                else:
                    o.append(f'<text x="{x1 + 5:.1f}" y="{y1 + 13:.1f}" font-size="9.5" fill="#333">{html.escape(etq)}</text>')
        for nd in self.nodos.values():
            _n, _e, borde, relleno, _f = CARRILES[nd.carril]
            if nd.tipo == "act":
                o.append(f'<rect x="{nd.left:.1f}" y="{nd.top:.1f}" width="{nd.w}" height="{nd.h}" fill="{relleno}" stroke="{borde}" stroke-width="1.1"/>')
            elif nd.tipo == "dec":
                p = f"{nd.cx},{nd.top} {nd.right},{nd.cy} {nd.cx},{nd.bottom} {nd.left},{nd.cy}"
                o.append(f'<polygon points="{p}" fill="{relleno}" stroke="{borde}" stroke-width="1.1"/>')
            elif nd.tipo == "inicio":
                o.append(f'<circle cx="{nd.cx}" cy="{nd.cy}" r="{R_NODO}" fill="#F8CECC" stroke="#B85450" stroke-width="1.1"/>')
            elif nd.tipo == "fin":
                o.append(f'<circle cx="{nd.cx}" cy="{nd.cy}" r="{R_NODO}" fill="#FFFFFF" stroke="#B85450" stroke-width="1.1"/>')
                o.append(f'<circle cx="{nd.cx}" cy="{nd.cy}" r="{R_NODO - 4}" fill="#F8CECC" stroke="#B85450" stroke-width="1"/>')
            if nd.lineas:
                y = nd.cy - (len(nd.lineas) - 1) * LH / 2 + 4
                for ln in nd.lineas:
                    o.append(f'<text x="{nd.cx:.1f}" y="{y:.1f}" text-anchor="middle">{html.escape(ln)}</text>')
                    y += LH
        o.append("</svg>")
        return "\n".join(o)

    # --------------------------------------------------------------- drawio
    def drawio(self):
        alto = max(nd.bottom for nd in self.nodos.values()) + 30
        c = ['<mxfile host="nom-colab-generar.py"><diagram name="%s"><mxGraphModel grid="1" gridSize="10">'
             '<root><mxCell id="0"/><mxCell id="1" parent="0"/>' % html.escape(self.titulo)]
        c.append(f'<mxCell id="titulo" value="{html.escape(self.titulo)}" style="text;html=1;fontColor={TITULO_COLOR};fontSize=14;align=left;" vertex="1" parent="1">'
                 f'<mxGeometry x="10" y="4" width="600" height="22" as="geometry"/></mxCell>')
        for i, (nombre, enc, borde, _r, _f) in enumerate(CARRILES):
            c.append(f'<mxCell id="carril{i}" value="{nombre}" style="swimlane;startSize=22;fillColor={enc};strokeColor={borde};swimlaneFillColor=#FFFFFF;" vertex="1" parent="1">'
                     f'<mxGeometry x="{self.x_carril(i)}" y="30" width="{self.anchos[i]}" height="{alto - 38:.0f}" as="geometry"/></mxCell>')
        for nd in self.nodos.values():
            _n, _e, borde, relleno, _f = CARRILES[nd.carril]
            texto = html.escape("<br>".join(nd.lineas)) if nd.lineas else ""
            if nd.tipo == "act":
                st = f"rounded=0;whiteSpace=wrap;html=1;fillColor={relleno};strokeColor={borde};fontSize={FS};"
            elif nd.tipo == "dec":
                st = f"rhombus;whiteSpace=wrap;html=1;fillColor={relleno};strokeColor={borde};fontSize={FS};"
            elif nd.tipo == "inicio":
                st = "ellipse;fillColor=#F8CECC;strokeColor=#B85450;"
            else:
                st = "ellipse;shape=doubleEllipse;fillColor=#F8CECC;strokeColor=#B85450;"
            c.append(f'<mxCell id="{nd.id}" value="{texto}" style="{st}" vertex="1" parent="1">'
                     f'<mxGeometry x="{nd.left:.1f}" y="{nd.top:.1f}" width="{nd.w}" height="{nd.h}" as="geometry"/></mxCell>')
        for k, (a, b, ruta, etq, y, x) in enumerate(self.aristas):
            pts, _ = self.puntos(a, b, ruta, y, x)
            mid = pts[1:-1]
            arr = "".join(f'<mxPoint x="{px:.1f}" y="{py:.1f}"/>' for px, py in mid)
            s, t = self.nodos[a], self.nodos[b]
            ex, ey = (pts[0][0] - s.left) / s.w, (pts[0][1] - s.top) / s.h
            nx, ny = (pts[-1][0] - t.left) / t.w, (pts[-1][1] - t.top) / t.h
            st = (f"edgeStyle=none;rounded=0;html=1;endArrow=block;endFill=1;strokeColor={LINEA};fontSize=9;"
                  f"exitX={ex:.3f};exitY={ey:.3f};exitDx=0;exitDy=0;entryX={nx:.3f};entryY={ny:.3f};entryDx=0;entryDy=0;"
                  "align=left;verticalAlign=bottom;")
            val = html.escape(etq) if etq else ""
            c.append(f'<mxCell id="a{k}" value="{val}" style="{st}" edge="1" parent="1" source="{a}" target="{b}">'
                     f'<mxGeometry relative="1" as="geometry">{"<Array as=%spoints%s>%s</Array>" % (chr(34), chr(34), arr) if arr else ""}</mxGeometry></mxCell>')
        c.append("</root></mxGraphModel></diagram></mxfile>")
        return "".join(c)


# =========================================================================
#  Diagramas, por modulo del mapa de navegacion
# =========================================================================
U, S, B = 0, 1, 2
DIAGRAMAS = []


def crear_usuario():
    d = Diagrama("A1-crear-usuario", "Módulo Gestión de cuentas (Crear usuario)",
                 "Diagrama de actividades Gestión de cuentas — Crear usuario")
    d.n("i", "inicio", U, 0, 0)
    d.n("a1", "act", U, 0, 1, 'Selecciona opción "Crear cuenta"')
    d.n("s1", "act", S, 0, 1, "Despliega formulario de registro")
    d.n("a2", "act", U, 0, 2, "Visualiza formulario")
    d.n("a3", "act", U, 0, 3, "Ingresa nombre de usuario y contraseña")
    d.n("a4", "act", U, 0, 4, "Ingresa empresa u organización (opcional)")
    d.n("a5", "act", U, 0, 5, "Envía solicitud de registro")
    d.n("d1", "dec", S, 0, 6.2, "Valida datos")
    d.n("e1", "act", U, -0.6, 7.3, 'Recibe mensaje "Campo obligatorio"')
    d.n("f1", "fin", U, -0.6, 8.3)
    d.n("s2", "act", S, 0, 7.4, "Cifra la contraseña (hash con sal)")
    d.n("b1", "act", B, 0, 7.4, "Busca registro previo con ese nombre")
    d.n("d2", "dec", B, 0, 8.6, "¿Encuentra?")
    d.n("b2", "act", B, -1.2, 9.8, "Cancela registro")
    d.n("b3", "act", B, 1.2, 9.8, "Realiza registro del usuario")
    d.n("s3", "act", S, -0.5, 11, 'Manda mensaje "El nombre ya está en uso"')
    d.n("e2", "act", U, 0, 12, "Recibe mensaje de error")
    d.n("f2", "fin", U, 0, 13)
    d.n("s4", "act", S, 0.5, 13.4, 'Manda mensaje "Registro exitoso"')
    d.n("e3", "act", U, 0, 14.4, "Recibe mensaje y visualiza Iniciar sesión")
    d.n("f3", "fin", U, 0, 15.4)
    for a, b in [("i", "a1"), ("a1", "s1"), ("a2", "a3"), ("a3", "a4"), ("a4", "a5"),
                 ("e1", "f1"), ("s2", "b1"), ("b1", "d2"), ("b2", "s3"), ("s3", "e2"),
                 ("e2", "f2"), ("s4", "e3"), ("e3", "f3")]:
        d.e(a, b)
    d.e("s1", "a2", "vh")
    d.e("a5", "d1")
    d.e("d1", "e1", "hv", "[Datos incorrectos]")
    d.e("d1", "s2", "v", "[Datos correctos]")
    d.e("d2", "b2", "hv", "[Sí]")
    d.e("d2", "b3", "hv", "[No]")
    d.e("b3", "s4", "vhv")
    return d


def iniciar_sesion():
    d = Diagrama("A2-iniciar-sesion", "Módulo Gestión de cuentas (Iniciar sesión)",
                 "Diagrama de actividades Gestión de cuentas — Iniciar sesión",
                 anchos=(250, 300, 400))
    d.n("i", "inicio", U, 0, 0)
    d.n("a1", "act", U, 0, 1, "Ingresa a la aplicación")
    d.n("s1", "act", S, 0, 1, "Despliega formulario de inicio de sesión")
    d.n("a2", "act", U, 0, 2, "Visualiza formulario")
    d.n("a3", "act", U, 0, 3, "Ingresa nombre y contraseña")
    d.n("a4", "act", U, 0, 4, "Realiza petición de ingreso")
    d.n("d1", "dec", S, 0, 5.2, "Valida datos")
    d.n("e1", "act", U, -0.6, 6.3, "Recibe mensaje de error")
    d.n("f1", "fin", U, -0.6, 7.3)
    d.n("b1", "act", B, 0, 5.2, "Busca usuario")
    d.n("d2", "dec", B, 0, 6.3, "¿Encuentra?")
    d.n("n1", "act", B, -1.5, 7.4, "Niega acceso")
    d.n("d3", "dec", B, 1.5, 7.4, "¿Cuenta bloqueada?")
    d.n("n2", "act", B, 0, 8.6, "Niega acceso")
    d.n("m1", "act", S, -0.8, 8.6, 'Manda mensaje "Credenciales inválidas"')
    d.n("e2", "act", U, -0.6, 9.6, "Recibe mensaje de error")
    d.n("f2", "fin", U, -0.6, 10.6)
    d.n("b2", "act", B, 1.5, 8.7, "Compara el hash de la contraseña")
    d.n("m2", "act", S, 0.8, 9.8, 'Manda mensaje "Cuenta bloqueada" con tiempo restante')
    d.n("e3", "act", U, 0.6, 11.0, "Recibe mensaje de error")
    d.n("f3", "fin", U, 0.6, 12.0)
    d.n("d4", "dec", B, 1.5, 9.9, "¿Son iguales?")
    d.n("b3", "act", B, 0, 11.1, "Incrementa intentos fallidos")
    d.n("ok", "act", B, 1.5, 11.2, "Reinicia intentos y cede acceso (crea sesión)")
    d.n("d5", "dec", B, 0, 12.3, "¿Más de 5 intentos?")
    d.n("m4", "act", S, 0.8, 13.4, 'Manda mensaje "Credenciales inválidas" e intentos restantes')
    d.n("b4", "act", B, 0, 13.5, "Bloquea la cuenta y registra el evento")
    d.n("e4", "act", U, 0.6, 14.5, "Recibe mensaje de error")
    d.n("f4", "fin", U, 0.6, 15.4)
    d.n("m3", "act", S, -0.8, 15.9, 'Manda mensaje "Acceso bloqueado"')
    d.n("e5", "act", U, -0.6, 16.9, "Recibe mensaje de error")
    d.n("f5", "fin", U, -0.6, 17.9)
    d.n("m5", "act", S, 0.4, 18.3, "Carga sus espacios y lo direcciona a Inicio")
    d.n("e6", "act", U, 0, 19.3, "Visualiza pantalla de inicio")
    d.n("f6", "fin", U, 0, 20.3)
    for a, b in [("i", "a1"), ("a1", "s1"), ("a2", "a3"), ("a3", "a4"), ("a4", "d1"),
                 ("e1", "f1"), ("b1", "d2"), ("n1", "m1"), ("m1", "e2"), ("e2", "f2"),
                 ("n2", "m2"), ("m2", "e3"), ("e3", "f3"), ("b2", "d4"), ("b3", "d5"),
                 ("m4", "e4"), ("e4", "f4"), ("m3", "e5"), ("e5", "f5"), ("m5", "e6"),
                 ("e6", "f6")]:
        d.e(a, b)
    d.e("s1", "a2", "vh")
    d.e("d1", "e1", "hv", "[Datos incorrectos]")
    d.e("d1", "b1", "h", "[Datos correctos]")
    d.e("d2", "n1", "hv", "[No]")
    d.e("d2", "d3", "hv", "[Sí]")
    d.e("d3", "n2", "hv", "[Sí]")
    d.e("d3", "b2", "v", "[No]")
    d.e("d4", "b3", "hv", "[No]")
    d.e("d4", "ok", "v", "[Sí]")
    d.e("d5", "m4", "hv", "[No]")
    d.e("d5", "b4", "v", "[Sí]")
    d.e("b4", "m3", "vhv")
    d.e("ok", "m5", "vhv")
    return d


def crear_espacio():
    d = Diagrama("A3-crear-espacio", "Módulo Espacios de trabajo (Crear espacio y activar conexión)",
                 "Diagrama de actividades Espacios de trabajo — Crear espacio y activar conexión",
                 anchos=(250, 300, 330))
    d.n("i", "inicio", U, 0, 0)
    d.n("a1", "act", U, 0, 1, 'Selecciona opción "Nuevo espacio"')
    d.n("s1", "act", S, 0, 1, "Despliega formulario del espacio")
    d.n("a2", "act", U, 0, 2, "Visualiza formulario")
    d.n("a3", "act", U, 0, 3, "Ingresa nombre del espacio")
    d.n("a4", "act", U, 0, 4, "Envía solicitud")
    d.n("d1", "dec", S, 0, 5.2, "Valida datos")
    d.n("e1", "act", U, -0.6, 6.3, "Recibe mensaje de error")
    d.n("f1", "fin", U, -0.6, 7.3)
    d.n("b1", "act", B, 0, 5.2, "Busca espacio del usuario con ese nombre")
    d.n("d2", "dec", B, 0, 6.4, "¿Encuentra?")
    d.n("b2", "act", B, -1.2, 7.6, "Cancela registro")
    d.n("b3", "act", B, 1.2, 7.6, "Guarda el espacio y el acceso PROPIETARIO")
    d.n("s2", "act", S, -0.5, 8.8, 'Manda mensaje "Ya tienes un espacio con ese nombre"')
    d.n("e2", "act", U, 0, 9.9, "Recibe mensaje de error")
    d.n("f2", "fin", U, 0, 10.9)
    d.n("s3", "act", S, 0.5, 10.6, 'Pregunta si activa la "Conexión del proyecto"')
    d.n("d3", "dec", U, 0.3, 12, "¿Activa conexión?")
    d.n("s4", "act", S, -0.85, 13.2, "Abre el espacio solo en local")
    d.n("s5", "act", S, 0.85, 13.2, "Busca un puerto disponible")
    d.n("d4", "dec", S, 0.85, 14.4, "¿Hay puerto?")
    d.n("s6", "act", S, -0.85, 15.6, 'Manda mensaje "Sin puerto: el espacio queda local"')
    d.n("s7", "act", S, 0.85, 15.6, "Abre el puerto y anuncia el espacio en la red local")
    d.n("b4", "act", B, 0, 15.6, "Guarda estado de conexión (host, puerto, visible)")
    d.n("s8", "act", S, 0.85, 16.9, 'Muestra estado "Visible en la red"')
    d.n("e3", "act", U, 0, 18.1, "Visualiza el espacio abierto")
    d.n("f3", "fin", U, 0, 19.1)
    for a, b in [("i", "a1"), ("a1", "s1"), ("a2", "a3"), ("a3", "a4"), ("a4", "d1"),
                 ("e1", "f1"), ("b1", "d2"), ("b2", "s2"), ("s2", "e2"), ("e2", "f2"),
                 ("s5", "d4"), ("s7", "b4"), ("e3", "f3")]:
        d.e(a, b)
    d.e("s1", "a2", "vh")
    d.e("d1", "e1", "hv", "[Nombre vacío]")
    d.e("d1", "b1", "h", "[Datos correctos]")
    d.e("d2", "b2", "hv", "[Sí]")
    d.e("d2", "b3", "hv", "[No]")
    d.e("b3", "s3", "vhv")
    d.e("s3", "d3", "vhv")
    d.e("d3", "s4", "vhv", "[No]")
    d.e("d3", "s5", "hv", "[Sí]")
    d.e("d4", "s6", "hv", "[No]")
    d.e("d4", "s7", "v", "[Sí]")
    d.e("b4", "s8", "vh")
    d.e("s4", "e3", "hv")
    d.e("s6", "e3", "hv")
    d.e("s8", "e3", "hv")
    return d


def unirse_espacio():
    d = Diagrama("A4-unirse-espacio", "Módulo Espacios de trabajo (Unirse a un espacio)",
                 "Diagrama de actividades Espacios de trabajo — Unirse a un espacio",
                 anchos=(250, 300, 330))
    d.n("i", "inicio", U, 0, 0)
    d.n("a1", "act", U, 0, 1, 'Selecciona opción "Unirse a un espacio"')
    d.n("s1", "act", S, 0, 1, "Busca espacios anunciados en la red local")
    d.n("d1", "dec", S, 0, 2.3, "¿Encuentra espacios?")
    d.n("s3", "act", S, -0.95, 3.5, 'Manda mensaje "No se encontraron espacios"')
    d.n("s2", "act", S, 0.95, 3.5, "Despliega la lista de espacios")
    d.n("a2", "act", U, 0, 4.7, "Captura host y puerto a mano")
    d.n("a3", "act", U, 0, 5.9, "Elige un espacio")
    d.n("b1", "act", B, 0, 6.9, "Busca el acceso del usuario al espacio")
    d.n("d2", "dec", B, 0, 8.1, "¿Tiene acceso?")
    d.n("b2", "act", B, -1.2, 9.3, "Registra solicitud de acceso")
    d.n("s4", "act", S, -0.85, 10.5, 'Manda mensaje "Solicitud enviada al propietario"')
    d.n("e1", "act", U, -0.6, 11.5, "Recibe mensaje")
    d.n("f1", "fin", U, -0.6, 12.5)
    d.n("s5", "act", S, 0.85, 10.5, "Cuenta usuarios conectados")
    d.n("d3", "dec", S, 0.85, 11.7, "¿Menos de 5?")
    d.n("s6", "act", S, -0.85, 12.9, 'Manda mensaje "Espacio lleno (5/5)"')
    d.n("e2", "act", U, 0.6, 13.9, "Recibe mensaje de error")
    d.n("f2", "fin", U, 0.6, 14.9)
    d.n("s7", "act", S, 0.85, 12.9, "Abre canal de sincronización")
    d.n("b3", "act", B, 0, 12.9, "Entrega estado actual de los documentos")
    d.n("s8", "act", S, 0.85, 15.6, "Abre el espacio con su permiso (lectura o edición)")
    d.n("e3", "act", U, 0, 16.6, "Visualiza el espacio")
    d.n("f3", "fin", U, 0, 17.6)
    for a, b in [("i", "a1"), ("a1", "s1"), ("s1", "d1"), ("a2", "a3"),
                 ("b1", "d2"), ("b2", "s4"), ("s4", "e1"), ("e1", "f1"), ("s5", "d3"),
                 ("s7", "b3"), ("s6", "e2"), ("e2", "f2"), ("s8", "e3"), ("e3", "f3")]:
        d.e(a, b)
    d.e("d1", "s3", "hv", "[No]")
    d.e("d1", "s2", "hv", "[Sí]")
    d.e("s3", "a2", "vh")
    d.e("s2", "a3", "vh")
    d.e("a3", "b1", "vhv")
    d.e("d2", "b2", "hv", "[No]")
    d.e("d2", "s5", "vhv", "[Sí]", y=d.nodos["s5"].top - 16)
    d.e("d3", "s6", "hv", "[No]")
    d.e("d3", "s7", "v", "[Sí]")
    d.e("b3", "s8", "vhv")
    return d


def gestion_accesos():
    d = Diagrama("A5-gestion-accesos", "Módulo Espacios de trabajo (Gestión de accesos)",
                 "Diagrama de actividades Espacios de trabajo — Gestión de accesos",
                 anchos=(250, 300, 330))
    d.n("i", "inicio", U, 0, 0)
    d.n("a1", "act", U, 0, 1, 'Selecciona opción "Compartir"')
    d.n("b1", "act", B, 0, 1, "Consulta accesos y solicitudes del espacio")
    d.n("s1", "act", S, 0, 2.1, "Despliega miembros, permisos y solicitudes")
    d.n("a2", "act", U, 0, 3.1, "Visualiza la lista")
    d.n("a3", "act", U, 0, 4.1, "Ingresa usuario y elige permiso (Lectura, Edición o Quitar)")
    d.n("a4", "act", U, 0, 5.3, "Envía el cambio")
    d.n("d1", "dec", S, 0, 6.5, "Valida datos")
    d.n("s2", "act", S, 0, 7.8, 'Manda mensaje "El espacio no puede quedar sin dueño"')
    d.n("e1", "act", U, -0.6, 8.8, "Recibe mensaje de error")
    d.n("f1", "fin", U, -0.6, 9.8)
    d.n("b2", "act", B, 0, 6.5, "Busca al usuario")
    d.n("d2", "dec", B, 0, 7.7, "¿Encuentra?")
    d.n("b3", "act", B, -1.2, 8.9, "Cancela cambio")
    d.n("b4", "act", B, 1.2, 8.9, "Crea, actualiza o elimina el acceso")
    d.n("s3", "act", S, 0, 10.1, 'Manda mensaje "El usuario no existe"')
    d.n("e2", "act", U, 0.6, 11.1, "Recibe mensaje de error")
    d.n("f2", "fin", U, 0.6, 12.1)
    d.n("s4", "act", S, 0, 11.9, "Notifica el cambio a los usuarios conectados")
    d.n("s5", "act", S, 0, 13.1, 'Manda mensaje "Acceso actualizado"')
    d.n("e3", "act", U, -0.3, 14.1, "Visualiza la lista actualizada")
    d.n("f3", "fin", U, -0.3, 15.1)
    for a, b in [("i", "a1"), ("a1", "b1"), ("a2", "a3"), ("a3", "a4"), ("a4", "d1"),
                 ("e1", "f1"), ("b2", "d2"), ("b3", "s3"), ("s3", "e2"),
                 ("e2", "f2"), ("s4", "s5"), ("s5", "e3"), ("e3", "f3"), ("s2", "e1")]:
        d.e(a, b)
    d.e("b1", "s1", "vh")
    d.e("s1", "a2", "vh")
    d.e("d1", "s2", "v", "[Deja el espacio sin dueño]")
    d.e("d1", "b2", "h", "[Datos correctos]")
    d.e("d2", "b3", "hv", "[No]")
    d.e("d2", "b4", "hv", "[Sí]")
    d.e("b4", "s4", "vhv")
    return d


def editor():
    d = Diagrama("A6-editor", "Módulo Espacios de trabajo (Editor — editar documento)",
                 "Diagrama de actividades Espacios de trabajo — Editor",
                 anchos=(260, 300, 320))
    d.n("i", "inicio", U, 0, 0)
    d.n("a1", "act", U, 0, 1, "Abre un documento del espacio")
    d.n("b1", "act", B, 0, 1, "Busca el documento y el permiso del usuario")
    d.n("s1", "act", S, 0, 2.2, "Despliega el lienzo en el modo guardado")
    d.n("d1", "dec", S, 0, 3.4, "¿Permiso de edición?")
    d.n("s2", "act", S, -0.95, 4.6, "Bloquea herramientas (solo lectura)")
    d.n("e1", "act", U, -0.75, 5.4, "Visualiza el documento")
    d.n("f1", "fin", U, -0.75, 6.15)
    d.n("a2", "act", U, 0.7, 6.6, "Elige herramienta o modo (texto, hoja, presentación, diagrama)")
    d.n("a3", "act", U, 0.7, 7.9, "Crea o modifica un bloque")
    d.n("s3", "act", S, -0.15, 7.9, "Genera la operación (bloque + reloj)")
    d.n("s4", "act", S, -0.15, 9.0, "Aplica el cambio en local (se ve al instante)")
    d.n("d2", "dec", S, -0.15, 10.2, "¿Hay conexión?")
    d.n("s5", "act", S, -1.05, 11.4, 'Encola la operación y muestra "Sin conexión"')
    d.n("s6", "act", S, 1.05, 11.4, "Difunde la operación al servidor")
    d.n("d3", "dec", B, 0, 11.4, "¿Operación ya aplicada?")
    d.n("b2", "act", B, -1.05, 12.6, "Descarta el duplicado")
    d.n("b3", "act", B, 1.05, 12.6, "Guarda la operación y actualiza el documento")
    d.n("s7", "act", S, 1.05, 13.8, "Repinta el lienzo de los demás usuarios (< 1.5 s)")
    d.n("d4", "dec", U, 0.7, 15.3, "¿Sigue editando?")
    d.n("b4", "act", B, 0, 16.5, "Guarda una nueva versión del documento")
    d.n("s8", "act", S, 0, 17.6, 'Manda mensaje "Guardado"')
    d.n("e2", "act", U, 0.7, 18.7, "Visualiza el documento guardado")
    d.n("f2", "fin", U, 0.7, 19.7)
    for a, b in [("i", "a1"), ("a1", "b1"), ("s1", "d1"), ("e1", "f1"),
                 ("a2", "a3"), ("a3", "s3"), ("s3", "s4"), ("s4", "d2"), ("s6", "d3"),
                 ("e2", "f2")]:
        d.e(a, b)
    d.e("b1", "s1", "vh")
    d.e("d1", "s2", "hv", "[No]")
    d.e("s2", "e1", "vh")
    d.e("d1", "a2", "vhv", "[Sí]", y=d.nodos["a2"].top - 14)
    d.e("d2", "s5", "hv", "[No]")
    d.e("d2", "s6", "hv", "[Sí]")
    d.e("d3", "b2", "hv", "[Sí]")
    d.e("d3", "b3", "hv", "[No]")
    d.e("b3", "s7", "vh")
    d.e("s5", "d4", "vhv", y=d.nodos["d4"].top - 30)
    d.e("b2", "d4", "vhv", y=d.nodos["d4"].top - 30)
    d.e("s7", "d4", "vhv", y=d.nodos["d4"].top - 16)
    d.e("d4", "a2", "regreso", "[Sí]", x=d.x_carril(U) + 16)
    d.e("d4", "b4", "hv", "[No]")
    d.e("b4", "s8", "vh")
    d.e("s8", "e2", "vhv")
    return d


def almacenamiento():
    d = Diagrama("A7-almacenamiento", "Módulo Espacios de trabajo (Almacenamiento y versiones)",
                 "Diagrama de actividades Espacios de trabajo — Almacenamiento",
                 anchos=(260, 300, 330))
    d.n("i", "inicio", U, 0, 0)
    d.n("a1", "act", U, 0, 1, 'Selecciona opción "Almacenamiento"')
    d.n("b1", "act", B, 0, 1, "Calcula consumo por documento y versiones")
    d.n("s1", "act", S, 0, 2.2, "Despliega el uso del espacio y el historial")
    d.n("a2", "act", U, 0.6, 3.2, "Visualiza almacenamiento")
    d.n("d1", "dec", U, 0.6, 4.4, "¿Qué acción elige?")
    d.n("a3", "act", U, -0.9, 5.6, "Elige una versión")
    d.n("a4", "act", U, 0.6, 5.7, "Indica cuántas versiones conservar")
    d.n("d3", "dec", B, 0, 5.7, "¿Documento abierto por otro usuario?")
    d.n("b2", "act", B, -1.15, 7.0, "Posterga la depuración de ese documento")
    d.n("b3", "act", B, 1.15, 7.0, "Elimina las versiones antiguas")
    d.n("s2", "act", S, -0.9, 7.0, "Muestra la previsualización")
    d.n("s4", "act", S, 0.95, 8.3, "Manda mensaje con el espacio liberado")
    d.n("a5", "act", U, -0.9, 8.3, "Confirma la restauración")
    d.n("d2", "dec", S, 0, 9.5, "¿Permiso de edición?")
    d.n("s3", "act", S, -0.95, 10.7, 'Manda mensaje "Solo puedes consultar versiones"')
    d.n("b4", "act", B, -1.0, 10.7, "Guarda ese estado como una versión nueva")
    d.n("e1", "act", U, 0.6, 11.7, "Recibe mensaje de error")
    d.n("f1", "fin", U, 0.6, 12.6)
    d.n("s5", "act", S, -0.1, 11.9, "Avisa el salto de versión a los usuarios conectados")
    d.n("e2", "act", U, -0.6, 14.0, "Visualiza el resultado")
    d.n("f2", "fin", U, -0.6, 15.0)
    for a, b in [("i", "a1"), ("a1", "b1"), ("a2", "d1"), ("e1", "f1"), ("e2", "f2")]:
        d.e(a, b)
    d.e("b1", "s1", "vh")
    d.e("s1", "a2", "vh")
    d.e("d1", "a3", "hv", "[Restaurar]")
    d.e("d1", "a4", "v", "[Depurar]")
    d.e("a4", "d3", "h")
    d.e("a3", "s2", "vhv")
    d.e("s2", "a5", "vh")
    d.e("a5", "d2", "hv")
    d.e("d2", "s3", "hv", "[No]")
    d.e("d2", "b4", "hv", "[Sí]")
    d.e("s3", "e1", "hv")
    d.e("d3", "b2", "hv", "[Sí]")
    d.e("d3", "b3", "hv", "[No]")
    d.e("b2", "s4", "vh")
    d.e("b3", "s4", "vh")
    d.e("b4", "s5", "vh")
    d.e("s4", "e2", "vhv", y=d.nodos["e2"].top - 40)
    d.e("s5", "e2", "vhv", y=d.nodos["e2"].top - 18)
    return d




def usar_sin_cuenta():
    d = Diagrama("A8-usar-sin-cuenta", "Módulo Gestión de cuentas (Usar sin cuenta)",
                 "Diagrama de actividades Gestión de cuentas — Usar sin cuenta",
                 anchos=(260, 300, 330))
    d.n("i", "inicio", U, 0, 0)
    d.n("a1", "act", U, 0, 1, 'Selecciona opción "Usar sin cuenta"')
    d.n("s1", "act", S, 0, 1, "Activa el modo sin cuenta")
    d.n("b1", "act", B, 0, 2.1, "Busca documentos guardados en el navegador")
    d.n("s2", "act", S, 0, 3.2, 'Despliega documentos y aviso "solo en este equipo"')
    d.n("a2", "act", U, 0, 4.3, "Visualiza sus documentos")
    d.n("a3", "act", U, 0, 5.3, "Crea o abre un documento")
    d.n("s3", "act", S, 0, 5.3, "Abre el editor sin servidor")
    d.n("a4", "act", U, 0, 6.4, "Edita el documento")
    d.n("b2", "act", B, 0, 6.4, "Guarda cada cambio en el navegador")
    d.n("d1", "dec", U, 0, 7.7, "¿Descargar o subir?")
    d.n("s4", "act", S, -0.8, 8.9, "Genera el archivo .nom")
    d.n("d2", "dec", S, 0.8, 10.3, "¿Sesión iniciada?")
    d.n("e2", "act", U, 0.65, 10.9, "Recibe el archivo descargado")
    d.n("f2", "fin", U, 0.65, 11.6)
    d.n("a5", "act", U, -0.85, 11.4, "Inicia sesión o crea cuenta")
    d.n("b3", "act", B, 0, 12.6, "Crea el documento en el espacio y borra la copia local")
    d.n("s5", "act", S, 0, 13.7, 'Manda mensaje "Guardado en el espacio"')
    d.n("e3", "act", U, 0, 14.7, "Visualiza el documento en el espacio")
    d.n("f3", "fin", U, 0, 15.6)
    for a, b in [("i", "a1"), ("a1", "s1"), ("a2", "a3"), ("a3", "s3"), ("a4", "b2"), ("e2", "f2"), ("e3", "f3")]:
        d.e(a, b)
    d.e("s1", "b1", "hv")
    d.e("b1", "s2", "vh")
    d.e("s2", "a2", "vh")
    d.e("s3", "a4", "vhv")
    d.e("b2", "d1", "vhv")
    d.e("d1", "s4", "hv", "[Descargar]")
    d.e("d1", "d2", "vhv", "[Subir a un espacio]")
    d.e("s4", "e2", "vh")
    d.e("d2", "a5", "hv", "[No]")
    d.e("d2", "b3", "hv", "[Sí]")
    d.e("a5", "b3", "vhv")
    d.e("b3", "s5", "vh")
    d.e("s5", "e3", "hv")
    return d

DIAGRAMAS = [crear_usuario, iniciar_sesion, usar_sin_cuenta, crear_espacio, unirse_espacio,
             gestion_accesos, editor, almacenamiento]

if __name__ == "__main__":
    for carpeta in ("svg", "png", "drawio"):
        os.makedirs(os.path.join(AQUI, carpeta), exist_ok=True)
    for f in DIAGRAMAS:
        d = f()
        svg = os.path.join(AQUI, "svg", d.ident + ".svg")
        with open(svg, "w", encoding="utf-8") as fh:
            fh.write(d.svg())
        with open(os.path.join(AQUI, "drawio", d.ident + ".drawio"), "w", encoding="utf-8") as fh:
            fh.write(d.drawio())
        subprocess.run(["rsvg-convert", "-z", "2", "-o",
                        os.path.join(AQUI, "png", d.ident + ".png"), svg], check=True)
        avisos = d.revisar()
        print("ok" if not avisos else "REVISAR", d.ident)
        for a in avisos:
            print("   ", a)
