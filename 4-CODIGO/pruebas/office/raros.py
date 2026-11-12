#!/usr/bin/env python3
"""Arma archivos de Office con combinaciones raras que el corpus real no trae juntas, para probar
lo que casi nunca se prueba: hoja de tamaño poco común con cuatro márgenes distintos, borde de
página, fuente y espaciado que vienen del estilo Normal, sangrías combinadas, interlineado exacto,
párrafo con recuadro y fondo, fuentes que nadie tiene instaladas, versalitas, tabulador con puntos,
cuadro de texto flotante, tabla con celdas de colores, texto vertical y otra tabla adentro,
secciones a dos y tres columnas, hoja acostada a media obra, texto de derecha a izquierda,
encabezado y pie.

  ~/.cache/nom-pruebas/venv/bin/python pruebas/office/raros.py            # los deja en el corpus
  ... raros.py /otra/carpeta

Los nombres en MAYÚSCULAS dentro del documento (SANGRIA-COMBO, BORDE-Y-SOMBRA…) son las marcas que
busca `pantalla.py` para revisar cómo se ve cada cosa en el editor.
"""
import sys
from pathlib import Path
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

CORPUS = Path.home() / ".cache" / "nom-pruebas" / "corpus"


def hacer_docx(ruta):
    d = Document()
    # El estilo Normal manda la fuente (como en casi todos los documentos reales): Garamond 13
    n = d.styles["Normal"]; n.font.name = "Garamond"; n.font.size = Pt(13)
    n.paragraph_format.space_after = Pt(9); n.paragraph_format.line_spacing = 1.5
    s = d.sections[0]
    s.page_width, s.page_height = Cm(17.6), Cm(25.0)     # B5: ni carta ni A4 ni oficio
    s.top_margin, s.bottom_margin, s.left_margin, s.right_margin = Cm(1.27), Cm(2.2), Cm(3.5), Cm(1.0)
    s.header.paragraphs[0].text = "ENCABEZADO-RARO Instituto"; s.footer.paragraphs[0].text = "PIE-RARO página"
    d.add_heading("TITULO-UNO Combinaciones raras", 1)
    p = d.add_paragraph("NORMAL-HEREDADO Este párrafo no trae formato propio: la fuente Garamond 13 y el interlineado 1.5 vienen del estilo Normal. " * 2)
    p = d.add_paragraph("SANGRIA-COMBO izquierda 2.5 cm, derecha 1.5 cm, primera línea 1.25 cm, justificado, interlineado exacto 18 pt. " * 3)
    f = p.paragraph_format; f.left_indent, f.right_indent, f.first_line_indent = Cm(2.5), Cm(1.5), Cm(1.25)
    f.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY; f.line_spacing_rule = WD_LINE_SPACING.EXACTLY; f.line_spacing = Pt(18)
    p = d.add_paragraph("FRANCESA-COMBO sangría francesa de 1.5 cm con izquierda de 3 cm, como una referencia APA larga que da la vuelta. " * 2)
    p.paragraph_format.left_indent = Cm(3); p.paragraph_format.first_line_indent = Cm(-1.5)
    p = d.add_paragraph()
    r = p.add_run("BORDE-Y-SOMBRA párrafo con recuadro azul, fondo amarillo y fuente Bookman Old Style que nadie tiene. "); r.font.name = "Bookman Old Style"; r.font.size = Pt(11)
    r = p.add_run("SEGOE-SCRIPT manuscrita. "); r.font.name = "Segoe Script"
    r = p.add_run("VERSALITAS y espaciado."); r.font.small_caps = True
    r._r.get_or_add_rPr().append(parse_xml(f'<w:spacing {nsdecls("w")} w:val="60"/>'))
    p._p.get_or_add_pPr().append(parse_xml(f'<w:pBdr {nsdecls("w")}><w:top w:val="single" w:sz="18" w:space="4" w:color="0070C0"/><w:left w:val="single" w:sz="18" w:space="4" w:color="0070C0"/><w:bottom w:val="single" w:sz="18" w:space="4" w:color="0070C0"/><w:right w:val="single" w:sz="18" w:space="4" w:color="0070C0"/></w:pBdr>'))
    p._p.get_or_add_pPr().append(parse_xml(f'<w:shd {nsdecls("w")} w:val="clear" w:color="auto" w:fill="FFF2CC"/>'))
    p.paragraph_format.left_indent = Cm(1); p.paragraph_format.right_indent = Cm(1)
    p = d.add_paragraph("TABULADORES Capítulo uno\t12\nCapítulo dos\t345")
    p.paragraph_format.tab_stops.add_tab_stop(Cm(11), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
    # cuadro de texto flotante (DrawingML)
    p = d.add_paragraph("ANCLA del cuadro de texto. ")
    p.add_run()._r.append(parse_xml(f'''<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" {nsdecls("w","wp","a")} xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:v="urn:schemas-microsoft-com:vml"><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>2500000</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>100000</wp:posOffset></wp:positionV><wp:extent cx="2000000" cy="700000"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="77" name="Cuadro 77"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="700000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="E2EFDA"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="00B050"/></a:solidFill></a:ln></wps:spPr><wps:txbx><w:txbxContent><w:p><w:r><w:t>TEXTO-DEL-CUADRO que debe poder leerse</w:t></w:r></w:p></w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:rect style="width:150pt;height:55pt"><v:textbox><w:txbxContent><w:p><w:r><w:t>TEXTO-DEL-CUADRO que debe poder leerse</w:t></w:r></w:p></w:txbxContent></v:textbox></v:rect></w:pict></mc:Fallback></mc:AlternateContent>'''))
    # tabla con bordes, anchos, texto con formato dentro, celda vertical y tabla anidada
    t = d.add_table(rows=2, cols=3); t.style = "Table Grid"
    t.columns[0].width = Cm(2); t.columns[1].width = Cm(7); t.columns[2].width = Cm(3.5)
    c = t.cell(0, 0); c.text = ""; rr = c.paragraphs[0].add_run("CELDA-ROJA-CURSIVA"); rr.italic = True; rr.font.color.rgb = RGBColor(0xC0, 0, 0)
    c.width = Cm(2)
    t.cell(0, 1).text = "CELDA-CENTRADA"; t.cell(0, 1).paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER; t.cell(0, 1).width = Cm(7)
    v = t.cell(0, 2); v.text = "CELDA-VERTICAL"; v._tc.get_or_add_tcPr().append(parse_xml(f'<w:textDirection {nsdecls("w")} w:val="btLr"/>'))
    a = t.cell(1, 1); a.text = "ANTES-DE-ANIDADA"; ta = a.add_table(rows=1, cols=2); ta.style = "Table Grid"; ta.cell(0, 0).text = "ANIDADA-1"; ta.cell(0, 1).text = "ANIDADA-2"
    t.cell(1, 0)._tc.get_or_add_tcPr().append(parse_xml(f'<w:tcBorders {nsdecls("w")}><w:top w:val="thick" w:sz="24" w:color="7030A0"/><w:bottom w:val="dashed" w:sz="12" w:color="7030A0"/></w:tcBorders>')); t.cell(1, 0).text = "CELDA-BORDE-MORADO"
    # sección 2: dos columnas con línea, continua
    s2 = d.add_section(WD_SECTION.CONTINUOUS)
    d.add_paragraph("DOS-COLUMNAS " + "Texto que corre en dos columnas con línea en medio, como una revista o un artículo. " * 14)
    # sección 3: horizontal, tres columnas desiguales
    s3 = d.add_section(WD_SECTION.NEW_PAGE); s3.orientation = WD_ORIENT.LANDSCAPE; s3.page_width, s3.page_height = Cm(25.0), Cm(17.6)
    d.add_paragraph("TRES-COLUMNAS-HORIZONTAL " + "Texto en hoja acostada con tres columnas de ancho distinto. " * 20)
    p = d.add_paragraph("DERECHA-A-IZQUIERDA مرحبا بالعالم"); p._p.get_or_add_pPr().append(parse_xml(f'<w:bidi {nsdecls("w")}/>'))
    # Borde de página y columnas de cada sección. Se ponen al final (python-docx reacomoda las
    # secciones al agregar una) y en el orden que pide el esquema de Word.
    ORDEN = ["headerReference", "footerReference", "footnotePr", "endnotePr", "type", "pgSz", "pgMar", "paperSrc", "pgBorders", "lnNumType", "pgNumType", "cols"]
    def poner(sect, xml):
        nuevo = parse_xml(xml); nombre = nuevo.tag.split("}")[1]
        for viejo in [c for c in sect if c.tag == nuevo.tag]: sect.remove(viejo)
        despues = [c for c in sect if c.tag.split("}")[1] not in ORDEN or ORDEN.index(c.tag.split("}")[1]) > ORDEN.index(nombre)]
        if despues: despues[0].addprevious(nuevo)
        else: sect.append(nuevo)
    BORDE = f'<w:pgBorders {nsdecls("w")} w:offsetFrom="page">' + "".join(f'<w:{l} w:val="double" w:sz="12" w:space="24" w:color="C00000"/>' for l in ("top", "left", "bottom", "right")) + "</w:pgBorders>"
    s1, s2, s3 = [x._sectPr for x in d.sections]
    for x in (s1, s2, s3): poner(x, BORDE)
    poner(s1, f'<w:cols {nsdecls("w")} w:space="720"/>')
    poner(s2, f'<w:cols {nsdecls("w")} w:num="2" w:sep="1" w:space="567"/>')
    poner(s3, f'<w:cols {nsdecls("w")} w:num="3" w:equalWidth="0"><w:col w:w="2000" w:space="400"/><w:col w:w="5000" w:space="400"/><w:col w:w="3000"/></w:cols>')
    d.save(str(ruta))


def main():
    carpeta = Path(sys.argv[1]) if len(sys.argv) > 1 else CORPUS
    (carpeta / "docx").mkdir(parents=True, exist_ok=True)
    f = carpeta / "docx" / "raro-combinaciones.docx"
    hacer_docx(f)
    print("ok  ", f, f.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
