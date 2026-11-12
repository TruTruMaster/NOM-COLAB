#!/usr/bin/env bash
# Baja el corpus de archivos reales de Office con el que se mide la fidelidad de importar y
# exportar (pruebas/office/fidelidad.py). No se guardan en el repositorio: quedan en
# ~/.cache/nom-pruebas/corpus (o en la carpeta que se pase).
#
# De dónde salen:
#  - Los archivos de prueba del Open XML SDK de Microsoft (github.com/dotnet/Open-XML-SDK, MIT):
#    documentos hechos con Word, Excel y PowerPoint de verdad, de los simples a los "complex".
#  - "Financial Sample.xlsx", el libro de ejemplo oficial de Microsoft.
#  - Archivos de prueba de Apache POI (github.com/apache/poi, Apache 2.0).
set -u
D="${1:-$HOME/.cache/nom-pruebas/corpus}"
mkdir -p "$D/docx" "$D/xlsx" "$D/pptx"
SDK="https://raw.githubusercontent.com/dotnet/Open-XML-SDK/main/test/DocumentFormat.OpenXml.Tests.Assets/assets"
POI="https://raw.githubusercontent.com/apache/poi/trunk/test-data"
baja() {  # baja <carpeta> <nombre-local> <dirección>
  local f="$D/$1/$2"
  [ -s "$f" ] && return 0
  local u; u=$(python3 -c "import sys,urllib.parse as u; print(u.quote(sys.argv[1], safe=':/'))" "$3")
  if curl -fsSL -m 120 --retry 2 -o "$f.n" "$u" && [ -s "$f.n" ]; then mv "$f.n" "$f"; echo "ok   $1/$2 ($(wc -c < "$f") bytes)"
  else rm -f "$f.n"; echo "FALLÓ $1/$2  <- $3"; fi
}
T="$SDK/TestFiles"; V="$SDK/TestDataStorage/v2FxTestFiles"; O="$SDK/TestDataStorage/O14ISOStrict"
# ---- Word
baja docx ms-complex01.docx        "$T/Complex01.docx"
baja docx ms-document.docx         "$T/Document.docx"
baja docx ms-complex2010.docx      "$T/complex2010.docx"
baja docx ms-complex0.docx         "$T/complex0.docx"
baja docx ms-complex2005.docx      "$V/bvt/complex2005_12rtm.docx"
baja docx ms-notes.docx            "$T/Notes.docx"
baja docx ms-informe-gobernanza.docx "$V/wordprocessing/mixed features/BackgroundReport - THE WORKING GROUP ON INTERNET GOVERNANCE.docx"
baja docx ms-hoja-informativa.docx "$V/wordprocessing/footer & header/Outreach_Toolkit_2007_After_the_Flood_Fact_Sheet[1].docx"
baja docx ms-ecuaciones.docx       "$V/wordprocessing/equation/equation-1.docx"
baja docx ms-tabla.docx            "$V/wordprocessing/table/table.docx"
baja docx ms-marcadores.docx       "$V/wordprocessing/bookmark/bookmark.docx"
baja docx ms-imagenes.docx         "$V/wordprocessing/picture/pic-1.docx"
baja docx ms-smartart.docx         "$V/wordprocessing/smart art/SmartArt1.docx"
baja docx ms-comentarios.docx      "$SDK/TestDataStorage/O15Conformance/WD/CommentExTest/Comments-Sample-15-12-01/Comment049.docx"
baja docx poi-encabezados.docx     "$POI/document/ThreeColHeadFoot.docx"
baja docx poi-notas-al-pie.docx    "$POI/document/footnotes.docx"
baja docx poi-listas.docx          "$POI/document/Numbering.docx"
baja docx poi-campos.docx          "$POI/document/FldSimple.docx"
# ---- Excel
baja xlsx ms-financial-sample.xlsx "https://go.microsoft.com/fwlink/?LinkID=521962"
baja xlsx ms-complex01.xlsx        "$T/Complex01.xlsx"
baja xlsx ms-excel14.xlsx          "$T/excel14.xlsx"
baja xlsx ms-rendimiento.xlsx      "$V/spreadsheet/PerformanceEng.xlsx"
baja xlsx ms-hojas.xlsx            "$V/ForTestCase/worksheets.xlsx"
baja xlsx ms-datos-a1.xlsx         "$V/spreadsheet/NoExtDataA1.xlsx"
baja xlsx ms-dinamica-b1.xlsx      "$V/spreadsheet/RelationalPivotB1.xlsx"
baja xlsx ms-galeria.xlsx          "$O/Excel/xl8galry.xlsx"
baja xlsx ms-filtros.xlsx          "$O/Excel/filter_type.xlsx"
baja xlsx poi-formato-condicional.xlsx "$POI/spreadsheet/WithConditionalFormatting.xlsx"
baja xlsx poi-graficas.xlsx        "$POI/spreadsheet/WithMoreVariousData.xlsx"
baja xlsx poi-formulas.xlsx        "$POI/spreadsheet/FormulaEvalTestData_Copy.xlsx"
baja xlsx poi-validacion.xlsx      "$POI/spreadsheet/DataValidations-49244.xlsx"
baja xlsx poi-estilos.xlsx         "$POI/spreadsheet/styles.xlsx"
# ---- PowerPoint
baja pptx ms-presentation.pptx     "$T/Presentation.pptx"
baja pptx ms-rendimiento-tipico.pptx "$T/o09_Performance_typical.pptx"
baja pptx ms-o12-tipico.pptx       "$V/bvt/O12Typical.pptx"
baja pptx ms-tipico.pptx           "$V/ForTestCase/typical.pptx"
baja pptx ms-brownbag.pptx         "$V/ForTestCase/Bug571679_Brownbag.pptx"
baja pptx ms-animacion.pptx        "$T/animation.pptx"
baja pptx ms-of16.pptx             "$T/Of16-03.pptx"
baja pptx ms-tabla-grande.pptx     "$V/presentation/Table_Large.pptx"
baja pptx ms-album.pptx            "$O/PowerPoint/Photo Album3.pptx"
baja pptx ms-organigrama.pptx      "$V/presentation/SmartArt_OrgChart1_3D.pptx"
baja pptx ms-grafica-area.pptx     "$O/Graphics/2D Area-O12-PPT-Charts.pptx"
baja pptx poi-tablas.pptx          "$POI/slideshow/pptx2svg.pptx"
baja pptx poi-temas.pptx           "$POI/slideshow/themes.pptx"
baja pptx poi-formas.pptx          "$POI/slideshow/shapes.pptx"
# ---- Lo que el corpus real no trae junto: un Word con combinaciones raras, hecho aquí
#      (hoja B5 con márgenes distintos, borde de página, columnas, fuentes que nadie tiene…)
PY="$HOME/.cache/nom-pruebas/venv/bin/python"; [ -x "$PY" ] || PY=python3
"$PY" "$(dirname "$0")/raros.py" "$D" || echo "FALLÓ raros.py (necesita python-docx)"
echo "Corpus en $D: $(ls "$D"/docx | wc -l) docx, $(ls "$D"/xlsx | wc -l) xlsx, $(ls "$D"/pptx | wc -l) pptx"
