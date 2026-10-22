import json, re, sys, os
R, I, FONT, OUT = sys.argv[1:5]
BLOB = {"59ae60dc8c6f226a4075a9d86549fd53": "logo-wack.png", "a88e62b0947189e0ba89d1ad6b359240": "logo-nom.png",
 "28aa2636d532bf90bbcf850c2a370028": "07-navegacion.png", "771ab4ebdb27c985ab2c74575559a7b7": "08-cu-cuentas.png",
 "4a52a7ac226fae55dde2cdcb8fb649ee": "10-cu-espacios.png", "e6056f3c675cdbd5d49c5769e69d9f96": "13-secuencia-login.png",
 "1cc6a2b4070551ed59519faa1adf8544": "14-secuencia-unirse.png", "ad3976dd85c5fd23465cedc8e2f372b9": "17-er-cuentas.png",
 "13752e2c332f0ae136401a2ebd20a224": "12-modelo-datos.png", "4757dba411a6f4a2170277408086cab0": "A1-crear-usuario.png",
 "70530be8d08869b44a7fb93faceded69": "A2-iniciar-sesion.png", "f81f7ae5cbc2e37ad7dcda071c5d407d": "A3-crear-espacio.png",
 "63d77701ee41866ed38b32fb4885b044": "A4-unirse-espacio.png", "ecf1332692d8a1a9b7f99f9ed40b6fd4": "lf-cuentas-2-crear-cuenta.png",
 "e0cd1f6a98351c148b59713f9d76fd90": "lf-cuentas-4-usuario-sin-permiso.png", "3af264b801b8718add010ab3f10da074": "lf-cuentas-6-administrar-usuarios.png",
 "ff7a67db2d0fb0c64581211a5cb69c36": "lf-espacios-2-espacio.png", "6f88e28529b2c37bbddbf46f9b9b32af": "lf-espacios-3-editor-texto.png",
 "cdbc24fc23d1e53cfa01cb9b87c56d61": "lf-espacios-5-nuevo-documento.png", "2ee66b847059159358536ee4c989a148": "lf-espacios-6-descargar.png",
 "e97ec224439dece05fbe21b5c30b4b44": "lf-espacios-7-actividad.png", "a77627bb420cfc4444b0f00be2584c7d": "lf-movil-login.png"}
ICONOS = {  # trazos estilo Lucide (24x24)
 "GraduationCap": '<path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
 "Globe": '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
 "Code": '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
 "Database": '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
}
deck = json.load(open(os.path.join(R, "deck.json")))
partes = []
for sid in deck["order"]:
    s = open(os.path.join(R, "slides", sid + ".html"), encoding="utf-8").read()
    s = re.sub(r"<aside>.*?</aside>", "", s, flags=re.S)
    s = re.sub(r'/_blob/([0-9a-f]{32})', lambda m: "file://" + os.path.join(I, BLOB[m.group(1)]), s)
    s = s.replace('data-crop="1 100% 0%"', 'data-crop="1 100% 0%" style-extra="1"').replace('style-extra="1" alt', 'alt')
    s = re.sub(r'(<img[^>]*data-crop="1 100% 0%"[^>]*style=")', r'\1object-position:100% 0%;', s)
    def icono(m):
        nombre, estilo = m.group(1), m.group(2)
        color = re.search(r"color:([^;\"]+)", estilo).group(1)
        return f'<svg viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="{estilo};flex:none">{ICONOS[nombre]}</svg>'
    s = re.sub(r'<x-icon name="(\w+)" style="([^"]*)"></x-icon>', icono, s)
    def flecha(m):
        estilo = m.group(1); color = re.search(r"background:([^;\"]+)", estilo).group(1)
        return f'<svg viewBox="0 0 72 40" style="width:72px;height:40px;flex:none"><path d="M0 12h44V0l28 20-28 20V28H0z" fill="{color}"/></svg>'
    s = re.sub(r'<x-shape kind="arrow-right" style="([^"]*)"></x-shape>', flecha, s)
    partes.append(s)
html = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{deck['title']}</title><style>
@font-face {{ font-family: 'Nunito'; src: url(file://{FONT}) format('woff2'); font-weight: 200 1000; }}
@page {{ size: 1920px 1080px; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; }}
html, body {{ background: #fff; }}
section {{ position: relative; width: 1920px; height: 1080px; overflow: hidden; page-break-after: always; break-after: page; }}
h1, h2, h3 {{ font-weight: 600; }}
ol, ul {{ padding-left: 1.4em; }}
table {{ border-collapse: collapse; width: 100%; }}
th, td {{ padding: 0.35em 0.6em; border-bottom: 1px solid #D9D4CA; text-align: left; vertical-align: top; }}
th {{ font-weight: 800; }}
</style></head><body>
{''.join(partes)}
</body></html>"""
open(OUT, "w", encoding="utf-8").write(html)
print(len(partes), "diapositivas")
