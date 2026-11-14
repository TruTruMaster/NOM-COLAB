# Tarea: WORD → escribe `salida/WORD.md`

Lee primero `COMUN.md` (reglas y formato de fila). Catálogo **completo** de Word para Microsoft 365
(escritorio, canal actual) comparado con el editor de texto de NOM-COLAB (`modo-texto.js`, y la
parte de Word de `ooxml.js`).

1. **Cinta, pestaña por pestaña, grupo por grupo, comando por comando.** Usa la lista oficial de
   comandos de Word del repositorio `OfficeDev/office-fluent-ui-command-identifiers` para no saltarte
   ninguno (descárgala con curl; quédate con las pestañas visibles por omisión y las contextuales).
   Pestañas: Archivo (Backstage: Nuevo, Abrir, Información —proteger, inspeccionar, versiones—,
   Guardar como, Imprimir con sus opciones, Compartir, Exportar —PDF/XPS, cambiar tipo—, Opciones
   que cambian el archivo), Inicio, Insertar, Dibujar, Diseño, Disposición, Referencias,
   Correspondencia, Revisar, Vista, Ayuda; contextuales: Diseño de tabla, Disposición (tabla),
   Formato de imagen, Formato de forma, Encabezado y pie de página, Ecuación, SmartArt, Gráfico,
   Diseño/Formato de cuadro de texto.
2. **Lo que está dentro de los cuadros de diálogo** y cambia el archivo (una fila por opción):
   Fuente (todos los efectos y la pestaña Avanzado: espaciado, escala, posición, interletraje,
   ligaduras y demás OpenType), Párrafo (sangrías, especial, espaciado, todos los tipos de
   interlineado, viudas y huérfanas, conservar con el siguiente, conservar líneas juntas, salto de
   página anterior, suprimir números de línea, no dividir con guiones), Tabulaciones (tipos y
   relleno), Bordes y sombreado (párrafo, página, celda), Configurar página (márgenes,
   encuadernación, orientación, tamaño, secciones y sus tipos, encabezado distinto en primera página
   y en pares/impares, numeración de líneas, alineación vertical), Columnas (número, ancho,
   separador), Estilos (tipos párrafo/carácter/vinculado/tabla/lista; `basedOn`, `next`, `link`,
   `latentStyles`, estilos predeterminados `docDefaults`), Numeración y viñetas multinivel
   (`abstractNum`, `lvl`, `lvlOverride`, `numPicBullet`), **todos los códigos de campo** de la lista
   oficial de Microsoft («List of field codes in Word»: PAGE, NUMPAGES, DATE, TOC, REF, PAGEREF, SEQ,
   HYPERLINK, MERGEFIELD, IF, =, STYLEREF, XE, INDEX, TA, TOA, CITATION, BIBLIOGRAPHY, etc.; con
   `fldSimple` y `fldChar`), control de cambios (`ins`, `del`, `moveFrom/moveTo`, `rPrChange`,
   `pPrChange`, `sectPrChange`, `tblPrChange`, cambios de celdas), comentarios (clásicos y modernos:
   `commentsExtended`, `commentsIds`, `commentsExtensible`, `people`, respuestas y resueltos), notas
   al pie y al final, marcadores, referencias cruzadas, tabla de contenido, tabla de ilustraciones,
   índice, tabla de autoridades, citas y bibliografía (parte de fuentes `customXml`), ecuaciones OMML
   (cada estructura: fracción, radical, índices, integrales, operadores grandes, matrices, acentos,
   delimitadores…), formas y cuadros de texto (`wps`, `wpg`, `wpc`, VML de respaldo en
   `mc:AlternateContent`), imágenes (en línea / ancladas, cada tipo de ajuste del texto, recorte,
   efectos, SVG con PNG de respaldo), SmartArt, gráficos, íconos, modelos 3D, hipervínculos,
   protección (`documentProtection`, restricciones de edición, `permStart`), propiedades del
   documento (core, app, custom), marca de agua, color de página, bordes de página, tema (fuentes y
   colores del tema), controles de contenido (`sdt`: texto, texto enriquecido, casilla, lista
   desplegable, cuadro combinado, fecha, imagen, sección repetitiva, enlace a XML), correspondencia,
   macros (`.docm`, `vbaProject.bin`: solo conservar), fuentes incrustadas, configuración de
   compatibilidad (`compat`, `compatSetting`), idioma y revisión ortográfica (`lang`, `proofErr`,
   `noProof`), saltos (página, columna, ajuste de texto, sección continua/página siguiente/par/impar),
   texto oculto, números de línea, guiones automáticos, texto vertical y dirección de texto (`bidi`,
   `textDirection`), tablas (todas las propiedades: anchos, `tblLayout`, celdas combinadas `gridSpan`
   y `vMerge`, encabezado repetido, no dividir fila, alineación vertical, márgenes de celda, estilo
   de tabla con `tblLook` y formato condicional de bandas, tablas anidadas, tablas flotantes
   `tblpPr`).
3. Revisa en el corpus (`corpus*/docx/`) qué de todo esto aparece de verdad: para cada fila Alta o
   Media, di en qué archivo(s) del corpus aparece (descomprime y busca el elemento). Eso le sirve a
   quien implemente para probar.
4. Totales, los 40 faltantes más importantes con su plan, y fuentes (ver `COMUN.md`).
