# Tarea: FORMATOS → escribe `salida/OOXML-COBERTURA.md`, `salida/ooxml-elementos.csv` y `salida/FUENTES.md`

Lee primero `COMUN.md`. Esta tarea es mecánica y tiene que ser **exhaustiva y reproducible**: deja
el programa que usaste en `salida/herramientas/cobertura.py` (Python 3 sin dependencias externas;
que corra con `python3 -I cobertura.py <carpeta-esquemas> <carpeta-corpus> <carpeta-codigo>`).

1. Descarga los esquemas XSD de ECMA-376 5.ª edición (parte 1, conjunto **Transitional**, que es el
   que escribe Office; y los de extensiones de Microsoft que se puedan descargar, p. ej. los de
   [MS-DOCX], [MS-XLSX], [MS-PPTX], [MS-ODRAWXML] en learn.microsoft.com). Guárdalos en
   `esquemas/` (no los copies a la salida).
2. Enumera **cada elemento** declarado (y sus atributos) de: WordprocessingML (`wml.xsd`),
   SpreadsheetML (`sml.xsd`), PresentationML (`pml.xsd`), DrawingML (`dml-main.xsd`, `dml-picture`,
   `dml-wordprocessingDrawing`, `dml-spreadsheetDrawing`, `dml-chart`, `dml-chartDrawing`,
   `dml-diagram`, `dml-lockedCanvas`), tipos compartidos (`shared-*`), matemáticas (`shared-math`),
   VML (`vml-*`, solo contar), y las extensiones (`w14`, `w15`, `w16*`, `x14`, `x15`, `xr*`, `p14`,
   `p15`, `p188`, `a14`, `a16`, `c14`, `c15`, `c16`, `cx`…).
3. Recorre **todo** el corpus (`corpus/` y `corpus-web/`): descomprime cada archivo en memoria,
   analiza cada parte XML y cuenta, por elemento (espacio de nombres + nombre local), en cuántos
   archivos aparece y cuántas veces. Incluye los elementos que aparezcan en el corpus y no estén en
   los esquemas (extensiones), y el contenido de `mc:AlternateContent` (`mc:Choice` y `mc:Fallback`).
4. Revisa el código (`codigo/js/ooxml.js` sobre todo, también `formatos.js`): para cada elemento,
   si el **importador lo lee** y si el **exportador lo escribe**. Primero entiende cómo el código
   busca los elementos (lee las funciones auxiliares al principio de `ooxml.js`: cómo se llaman los
   hijos, con o sin prefijo) para que la búsqueda sea correcta; explica en el documento el método y
   sus límites (falsos positivos y negativos posibles).
5. `salida/ooxml-elementos.csv`: `programa,espacio,elemento,seccion_ecma,archivos_corpus,veces_corpus,lo_lee,lo_escribe,donde`.
6. `salida/OOXML-COBERTURA.md`: método; resumen por programa (elementos totales del esquema,
   cuántos aparecen en el corpus, cuántos de esos lee la app, ponderado por archivos en que
   aparecen); **la lista de elementos que aparecen en 3 o más archivos del corpus y la app no lee**,
   ordenada por archivos, con qué son (una línea) y su sección del estándar; lo mismo para lo que la
   app escribe al exportar algo hecho por ella (qué elementos mínimos exige Office para que no pida
   «reparar»: relaciones, `[Content_Types].xml`, orden de los hijos según el esquema — revisa en el
   exportador si respeta el orden `xsd:sequence` de `w:pPr`, `w:rPr`, `a:rPr`, `c:chart`, hojas de
   Excel (`sheetPr`…`extLst`), etc. y anota cada caso fuera de orden con evidencia).
7. `salida/FUENTES.md`: cada documento de referencia (ECMA-376 partes 1-4 con enlace de descarga;
   [MS-OI29500] y qué dice de cómo Office se aparta del estándar; [MS-DOCX], [MS-XLSX], [MS-PPTX],
   [MS-ODRAWXML], [MS-OE376], [MS-OFFCRYPTO] para archivos con contraseña, [MS-XLSB], Open XML SDK y
   su validador `OpenXmlValidator`, la lista de comandos de la cinta, «Excel specifications and
   limits», la lista de funciones, la lista de códigos de campo de Word, la de geometrías
   predefinidas), con URL y para qué sirve cada uno al implementar.
8. Al final de `OOXML-COBERTURA.md`: cómo validar de verdad que Office abriría un archivo sin
   «reparar» sin tener Office (Open XML SDK `OpenXmlValidator` en .NET: comandos exactos para
   instalarlo en Linux sin permisos de administrador y un programa mínimo que valide un archivo y
   liste los errores con su ruta XML), para que el equipo lo agregue a sus pruebas.
