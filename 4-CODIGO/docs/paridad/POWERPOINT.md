# PowerPoint (Microsoft 365, escritorio, canal actual) contra las presentaciones de NOM-COLAB

Catálogo para implementar sin volver a investigar. Compara cada comando de la cinta de PowerPoint, cada transición, cada efecto de animación, cada geometría de forma y cada objeto del archivo `.pptx` con lo que hacen hoy `diapositivas.js`, `lienzo.js`, `graficas.js`, `proyector.js` y la parte de PowerPoint de `ooxml.js` (importar y exportar).

## 0. Cómo leer este documento

**Fuentes de la lista de comandos.** Repositorio oficial `OfficeDev/office-fluent-ui-command-identifiers`, archivo `Microsoft 365/Current Channel/powerpointcontrols.xlsx` (columnas: Control Name, Control Type, Tab Set, Tab, Group/Context Menu Name, Parent Control…). Se leyeron unas 5 100 filas. Se catalogan los controles **de la cinta y de la vista Backstage** (botones, botones divididos, menús, galerías, casillas, cuadros de diálogo); no se cuentan las filas que son solo un grupo, una pestaña o un menú contextual (1 588 filas de menús contextuales y 378 controles «fuera de la cinta» quedan fuera del conteo, salvo los pocos que se mencionan). Los controles que solo abren un servicio en línea ligado a la cuenta de Microsoft 365 se anotan como «No aplica» con su motivo, y no se describen más.

**Nombres.** El repositorio solo trae el identificador en inglés. El nombre en español se da cuando es el rótulo conocido de la cinta en español; si no se pudo comprobar, se pone el inglés con «(sin nombre en español verificado)». Los nombres de formas y de efectos de animación en español salen de las páginas `es-es` de learn.microsoft.com (`MsoAutoShapeType`, `MsoAnimEffect`).

**Estados de NOM-COLAB** (solo con evidencia del código, archivo y función o línea):
- **Tiene**: la app lo hace de forma equivalente.
- **Parcial**: lo hace en parte (la evidencia dice qué parte).
- **No**: no hay código que lo haga (se buscó con `grep` en `lienzo.js`, `diapositivas.js`, `graficas.js`, `proyector.js`, `ooxml.js`).
- **No aplica**: no tiene sentido en una suite web colaborativa; se da el motivo.

**Columnas de importación y exportación.** *Al importar*: «se ve y edita», «se conserva sin verse» (el archivo original viaja en `_origen` y las partes no tocadas salen idénticas) o «se pierde» (se pierde al reconstruir una diapositiva). *Al exportar algo hecho en NOM-COLAB*: «se escribe» o «no».

**Regla general de conservación.** `ooxml.js` (`conOrigen`, `huellasPptx`, `parcialesPptx`) copia del original las partes y los objetos que no se tocaron. Cuando una diapositiva tiene algún objeto «nuevo», se regenera la diapositiva completa y se pierden en ella lo que la app no lee (por ejemplo `p:timing`, que solo se conserva si ningún objeto de esa diapositiva se reconstruyó: `ooxml.js` cerca de la línea 2710). Por eso «se conserva sin verse» vale solo para lo que no se edita.

**Prioridad.** Alta = lo usa un estudiante u oficina cada semana; Media = de vez en cuando; Baja = rara vez.

**Corpus.** En las filas Alta y Media, «Corpus:» lista los archivos de `corpus/pptx/` o `corpus-web/pptx/` donde el elemento aparece (medido con un recorrido del XML de los 28 archivos). «Corpus: ninguno» significa que no aparece en los 28 archivos y hay que crear un archivo de prueba en PowerPoint.

**Medición de referencia** (`medicion.txt`, pptx): 78,5 % en 14 archivos; categorías débiles: partes idénticas 0 % (2), número de partes 36 % (2), negrita y cursiva 56 % (11), tamaño de la diapositiva 83 % (12), posición y tamaño 86 % (11). La sección 4 explica la causa de cada una.

**Fuentes principales de esta sección:** https://github.com/OfficeDev/office-fluent-ui-command-identifiers · https://learn.microsoft.com/es-es/office/vba/api/overview/powerpoint · https://learn.microsoft.com/es-es/office/open-xml/presentation/structure-of-a-presentationml-document

### 1.2 Pestaña Inicio (Home)

Fuente: https://support.microsoft.com/es-es/office/ · lista oficial TabHome. Evidencia de NOM-COLAB: `lienzo.js` (barra de texto y de figura), `diapositivas.js`, `ooxml.js` (`htmlTexto` ~2974-3006, `parrafosRicos` 2360-2381, `pptxArmar`).

**Grupo «Portapapeles» (`GroupClipboard`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Pegar (Paste), opciones de pegado (`PasteMenu`, `Paste`, `PasteGallery`, `PasteDuplicate`) | Inserta lo copiado (con formato, solo texto, imagen) | Texto: `a:p`/`a:r`; objetos: nuevo `p:sp`/`p:pic` en `p:spTree` (ECMA-376 19.3.1.45) | Parcial — lienzo.js:924 `pegarBloques` pega bloques copiados dentro de la app; diapositivas.js:226 pega texto en las tablas; no se encontró pegar imágenes del portapapeles del sistema ni opciones «conservar formato de origen/destino» | se ve y edita | se escribe | Alta | Lo que se pega se exporta como objeto nuevo. Pendiente: evento `paste` con `clipboardData.files` para imágenes en `lienzo.js`. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico, ms-brownbag |
| Pegado especial (Paste Special) (`PasteSpecialDialog`) | Elige el formato con que se pega (HTML, imagen, texto) | Sin elemento propio; decide qué objeto se crea | No — no hay cuadro de pegado especial | se ve y edita | no | Baja | Solo tendría sentido «pegar como texto sin formato». |
| Cortar / Copiar (Cut / Copy) (`Cut`, `CopySplitButton`, `Copy`) | Quita o duplica la selección al portapapeles | No toca el archivo | Tiene — lienzo.js:942 `copiar(cortar)` (Ctrl+X, Ctrl+C) | se ve y edita | se escribe | Alta | Hecho. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Copiar formato (Format Painter) (`FormatPainter`) | Copia el formato de un objeto a otro | Copia `p:spPr` (relleno, línea, efectos) y `a:rPr` de texto | No — `grep` de «copiar formato\|pincel» en lienzo.js y diapositivas.js: 0 coincidencias | se ve y edita | se escribe | Media | Guardar en memoria las propiedades del bloque (relleno, borde, sombra, tColor, tTam, tFuente…) y aplicarlas con `cambiarSel` (lienzo.js). Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Portapapeles de Office (Show Clipboard) (`ShowClipboard`) | Panel con los últimos elementos copiados | — | No aplica — historial del portapapeles de Office, sin sentido en web | se ve y edita | no | Baja | El navegador no expone el historial. |

**Grupo «Diapositivas» (`GroupSlides`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Nueva diapositiva (New Slide) (`SlideNewGallery`) | Agrega una diapositiva con un diseño elegido | Nueva `ppt/slides/slideN.xml` + relación a un `p:sldLayout`; `p:sldId` en `p:sldIdLst` (ECMA-376 19.2.1.34) | Parcial — lienzo.js:2176 `menuNueva` con los 10 diseños de diapositivas.js:166 `DISENOS`; no están ligados a un diseño de patrón (en el archivo solo hay un diseño «blank») | se ve y edita | se escribe | Alta | Al importar, mapear `p:sldLayout` `type` (title, obj, twoObj, secHead…) a `DISENOS` y guardar el `idx` de cada marcador (ver sección 4). Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-n821567, lo-slide-sections (+23) |
| Duplicar las diapositivas seleccionadas (Duplicate Selected Slides) (`DuplicateSelectedSlides`) | Copia la diapositiva justo después | Nueva parte slideN.xml con copia del XML | Tiene — lienzo.js:2036 `duplicarDiapo` (acción «Duplicar») | se ve y edita | se escribe | Alta | Hecho en el modelo; al exportar sale como diapositiva nueva. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Diapositivas desde el esquema (Slides from Outline) (`SlidesFromOutline`) | Crea diapositivas desde un .docx/.txt con títulos | Una `p:sld` por título; `title`/`body` | No — no hay importación de esquema | se ve y edita | se escribe | Baja | Aprovechar `NOM.diagrama` «Convertir un texto en diagrama» (lienzo.js:2645) como base. |
| Reutilizar diapositivas (Reuse Slides) (`SlidesReuseSlides`, `ReuseSlides`) | Inserta diapositivas de otro archivo | Copia partes slide + layout + master | No — no se encontró | se ve y edita | se escribe | Media | Pedir un .pptx, leer con `pptx()` y añadir las páginas elegidas. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Pegar como diapositiva (Paste as Slide) (`PasteAsSlide`) | — | — | No — no se encontró | se ve y edita | no | Baja | (sin nombre en español verificado) |
| Diseño (Layout) (`SlideLayoutGallery`) | Cambia el diseño de la diapositiva actual | `p:sldLayout` relacionado en `slideN.xml.rels`; marcadores `p:ph` (ECMA-376 19.3.1.36) | Parcial — diapositivas.js:166 `DISENOS` (10 diseños de la app), sin lectura de `p:sldLayout` | se ve y edita | se escribe | Alta | Es la pieza clave de la herencia: ver sección 4. Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-n821567, lo-slide-sections (+23) |
| Restablecer (Reset) (`SlideReset`) | Devuelve posición, tamaño y formato de los marcadores al diseño | Quita `a:xfrm` y propiedades locales del marcador | No — sin herencia de diseño no hay a qué restablecer | se ve y edita | se escribe | Media | Depende de la herencia (sección 4). Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-n821567, lo-slide-sections (+21) |
| Sección: Agregar, Cambiar nombre, Combinar, Quitar todas, Contraer, Expandir (Section) (`SectionMenu`, `SectionAdd`, `SectionRename`, `SectionMergeWithPrevious`, `SectionRemoveAll`, `SectionCollapseAll`, `SectionExpandAll`) | Agrupa diapositivas con nombre | `p:extLst/p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"/p14:sectionLst/p14:section name id/p14:sldIdLst` ([MS-PPTX] 2.3.? `sectionLst`) | No — `grep` de `sectionLst` en ooxml.js: 0 | se conserva sin verse | no | Media | Leer `p14:section` al importar y guardar `seccion:<página>` en `_doc`; escribirlo en `p:presentation/p:extLst`. Corpus: lo-multiplelayoutfooter, lo-slide-sections, lo-tdf89927 |

**Grupo «Fuente» (`GroupFont`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Fuente (Font) (`Font`) | Tipo de letra | `a:rPr/a:latin\|a:ea\|a:cs typeface`; temas `+mj-lt` / `+mn-lt` (ECMA-376 21.1.2.3.7) | Parcial — lienzo.js:181 `tFuente`; se escribe `a:latin` en cada ejecución (ooxml.js `parrafosRicos` 2360-2381). Al importar `htmlTexto` no lee `typeface` ni las fuentes del tema | se ve y edita | se escribe | Alta | Leer `a:latin` y resolver `+mj-lt`/`+mn-lt` con `a:fontScheme` del tema y `p:txStyles`. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico, ms-brownbag |
| Tamaño de fuente, Aumentar, Disminuir (Font Size) (`FontSize`, `FontSizeIncrease`, `FontSizeDecrease`) | Tamaño en puntos | `a:rPr sz` en centésimas de punto (21.1.2.3.9) | Tiene — lienzo.js `tTam`; barra A-/A+; importa `sz` explícito | se ve y edita | se escribe | Alta | El tamaño heredado del patrón no se lee (sección 4). Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Borrar todo el formato (Clear All Formatting) (`ClearFormatting`) | Quita el formato de carácter | Quita atributos de `a:rPr` | Tiene — barra de texto «quitar formato» (lienzo.js ~725) | se ve y edita | se escribe | Media | Hecho. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Negrita, Cursiva (Bold, Italic) (`Bold`, `Italic`) | Resalta el texto | `a:rPr b="1"`, `i="1"` (21.1.2.3.9) | Parcial — se escribe `b="0\|1"` en cada ejecución; al importar solo acepta `b="1"` e `i="1"` (no «true»), ignora la negrita heredada; títulos y texto de figuras salen en negrita aunque el original no lo tenga (ooxml.js:2416 y 2432) | se ve y edita | se escribe | Alta | Es la causa de «negrita y cursiva 56 %» (sección 4). Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico, ms-brownbag |
| Subrayado (Underline) (`Underline`) | Subraya | `a:rPr u="sng"` y otros 18 valores (`dbl`, `heavy`, `dash`…; ST_TextUnderlineType 20.1.10.82) | Parcial — importa y escribe `u` simple; no hay los otros estilos ni color de subrayado | se ve y edita | se escribe | Media | Añadir `u` con `dbl`/`wavy`. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Tachado (Strikethrough) (`Strikethrough`) | Tacha | `a:rPr strike="sngStrike\|dblStrike"` | Tiene — barra de texto strikeThrough; importa `strike` | se ve y edita | se escribe | Baja | Falta tachado doble. |
| Sombra de texto (Text Shadow) (`Shadow`) | Sombra bajo el texto | `a:rPr/a:effectLst/a:outerShdw` | No — no se lee ni escribe en texto | se conserva sin verse | no | Baja | — |
| Espaciado entre caracteres (Character Spacing) (`CharacterSpacingGallery`) | Junta o separa letras | `a:rPr spc` en centésimas de punto | No — 0 coincidencias de `spc` | se conserva sin verse | no | Media | Mapear a `letter-spacing` en CSS. Corpus: lo-tdf89927 |
| Cambiar mayúsculas y minúsculas (Change Case) (`ChangeCaseGallery`) | MAYÚSCULAS, minúsculas… | Texto cambiado; `a:rPr cap="all\|small"` para versalitas | No — no se encontró | se ve y edita | se escribe | Baja | Transformar el texto y, para versalitas, `cap="small"`. |
| Color de resaltado de texto (Text Highlight Color) (`TextHighlightColorPickerLicensed`, `HighlightingStop`) | Resalta con color de fondo | `a:rPr/a:highlight` ([MS-OI29500] extensión de Office 2013) | No — no se lee ni se escribe | se conserva sin verse | no | Media | CSS `background` por ejecución. Corpus: ninguno |
| Color de fuente, más colores, cuentagotas (Font Color) (`FontColorPicker`, `FontColorMoreColorsDialogPowerPoint`, `EyedropperFillText`) | Color del texto | `a:rPr/a:solidFill` (`a:srgbClr`, `a:schemeClr` con `lumMod/lumOff`) (20.1.2.3) | Parcial — `tColor`; importa `solidFill` y color de tema con `matiz` (lumMod, lumOff, shade, tint); no hay colores de tema en la paleta ni cuentagotas | se ve y edita | se escribe | Alta | Guardar `schemeClr` para que el cambio de tema recolore. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Cuadro Fuente (Font dialog) (`FontDialogPowerPoint`) | Fuente, estilo, efectos (superíndice, versalitas) | `a:rPr` (`baseline`, `cap`, `spc`, `strike`) | No — no hay cuadro; el superíndice (`baseline`) no se lee | se ve y edita | se escribe | Media | Añadir `baseline="30000\|-25000"`. Corpus: lo-cshapes, lo-tdf169781 |

**Grupo «Párrafo» (`GroupParagraph`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Viñetas (Bullets) (`BulletsGallery`, `BulletsAndNumberingBulletsDialog`) | Lista con símbolos | `a:pPr/a:buChar char` + `a:buFont`, `a:buClr`, `a:buSzPct`; imagen `a:buBlip` (21.1.2.4.1) | Parcial — barra «viñetas» (ul); importa `buChar`→ul; el símbolo, color, tamaño y `buBlip` se pierden | se ve y edita | se escribe | Alta | Guardar `char` y `buFont` por párrafo. Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-multiplelayoutfooter, lo-n821567 (+23) |
| Numeración (Numbering) (`NumberingGallery`, `BulletsAndNumberingNumberingDialog`) | Lista numerada | `a:buAutoNum type` (`arabicPeriod`, `arabicParenR`, `romanUcPeriod`, `alphaLcParenR`… 36 valores, ST_TextAutonumberScheme 20.1.10.61) + `startAt` | Parcial — barra «numeración» (ol); importa `buAutoNum`→ol sin el esquema ni `startAt` | se ve y edita | se escribe | Alta | Guardar `type` y `startAt`. Corpus: ninguno |
| Disminuir / Aumentar nivel de lista (Decrease / Increase List Level) (`IndentDecrease`, `IndentIncrease`) | Cambia el nivel del párrafo | `a:pPr lvl` (0-8), `marL`, `indent` | No — 0 coincidencias de `marL`/`indent`/`lvl` en la app | se ve y edita | se escribe | Alta | Guardar `lvl` por párrafo; el patrón da sangría y viñeta por nivel (sección 4). Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-multiplelayoutfooter, lo-n821567 (+23) |
| Interlineado (Line Spacing) (`LineSpacingGalleryPowerPoint`) | Separación entre líneas | `a:pPr/a:lnSpc/a:spcPct\|spcPts`, `a:spcBef`, `a:spcAft` (21.1.2.2.5) | No — no hay interlineado | se conserva sin verse | no | Alta | Guardar `lnSpc`, `spcBef`, `spcAft` por párrafo. Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-multiplelayoutfooter, lo-n821567 (+23) |
| Alinear a la izquierda / Centrar / Alinear a la derecha (Align) (`AlignLeft`, `AlignCenter`, `AlignRight`) | Alinea el párrafo | `a:pPr algn="l\|ctr\|r"` | Tiene — barra de texto; importa y escribe `algn` | se ve y edita | se escribe | Alta | Hecho. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Justificar y variantes (Justify) (`AlignJustify`, `AlignJustifyMenu`, `AlignJustifyWithMixedLanguages`, `AlignJustifyLow`, `ParagraphDistributed`, `AlignJustifyThai`) | Justifica el párrafo | `algn="just\|justLow\|dist\|thaiDist"` | Parcial — importa `just`; la barra no tiene botón de justificar; no se leen `justLow`, `dist` | se ve y edita | se escribe | Media | Añadir botón y los 3 valores. Corpus: ninguno |
| Dirección del texto izquierda a derecha / derecha a izquierda (Text direction) (`TextDirectionLeftToRight`, `TextDirectionRightToLeft`) | Dirección del párrafo | `a:pPr rtl="1"` | No — no se encontró | se conserva sin verse | no | Baja | Solo para árabe y hebreo. |
| Agregar o quitar columnas (Columns) (`TableColumnsGallery`, `ParagraphMoreColumnsDialog`) | Texto en 2 o 3 columnas | `a:bodyPr numCol spcCol` (21.1.2.1.1) | No — 0 coincidencias de `numCol` | se conserva sin verse | no | Media | CSS `column-count`. Corpus: lo-cshapes, lo-smartart-linear-rule-vert, lo-tdf106638, lo-tdf169781, lo-tdf89927 (+4) |
| Dirección del texto (Text Direction) (`TextDirectionGallery`, `TextDirectionMoreOptionsDialog`) | Gira el texto 90° / 270° / apilado | `a:bodyPr vert="vert\|vert270\|wordArtVert\|eaVert"` | No — `vert` no se lee ni se escribe | se conserva sin verse | no | Media | CSS `writing-mode`. Corpus: lo-accent-color, lo-crop-to-shape, lo-n821567, lo-smartart-linear-rule-vert, lo-tdf106638 (+16) |
| Alinear texto: arriba, medio, abajo (Align Text) (`TextAlignGallery`, `TextAlignMoreOptionsDialog`) | Alineación vertical en el cuadro | `a:bodyPr anchor="t\|ctr\|b\|just\|dist"`, `anchorCtr` | No — no se lee `anchor`; todas las figuras centran el texto | se conserva sin verse | no | Alta | Leer `anchor`; sin esto el texto de títulos y figuras se ve movido. Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-n821567, lo-slide-sections (+21) |
| Convertir en gráfico SmartArt (Convert to SmartArt) (`ConvertToSmartArt`, `ConvertToSmartArtMoreSmartArtGraphicsDialog`) | Texto en lista → diagrama | Partes `diagrams/data\|layout\|quickStyle\|colors\|drawing` (21.4) | No — se leen SmartArt, no se crean | se ve y edita | se escribe | Baja | Ver Diseño de SmartArt. |
| Cuadro Párrafo (Paragraph dialog) (`PowerPointParagraphDialog`) | Sangría, espaciado, tabulaciones | `a:pPr marL indent`, `a:tabLst` | No — no hay cuadro | se conserva sin verse | no | Media | Ver sangría e interlineado. Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-multiplelayoutfooter, lo-n821567 (+23) |

**Grupo «Dibujo» (`GroupDrawing`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Formas (Shapes) (`GalleryAllShapesAndTextboxes`) | Galería de formas y cuadros de texto | `p:sp/p:spPr/a:prstGeom prst` (187 valores; sección 5) o `a:custGeom` | Parcial — lienzo.js:37 `FIGURAS`: 23 figuras de 187 (+ listas UML/ER/Red); importa 28 nombres (`GEO_INV`), el resto se ve como rectángulo | se ve y edita | se escribe | Alta | Ampliar `GEO`/`GEO_INV` y dibujar con `gdLst` (sección 5). Corpus: lo-cshapes, lo-slide-sections, lo-tdf106638, lo-tdf169781, lo-tdf89927 (+4) |
| Organizar: traer al frente, enviar al fondo, avanzar, retroceder (Arrange) (`ObjectsArrangeMenu`, `ObjectBringToFront`, `ObjectSendToBack`, `ObjectBringForward`, `ObjectSendBackward`) | Orden de apilado | Orden de los hijos de `p:spTree` | Tiene — lienzo.js `capas` y botón frente/atrás; el orden se conserva al exportar | se ve y edita | se escribe | Alta | Hecho. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Agrupar, Desagrupar, Reagrupar (Group) (`ObjectsGroup`, `ObjectsUngroup`, `ObjectsRegroup`) | Une objetos para moverlos juntos | `p:grpSp` con `a:xfrm off/ext/chOff/chExt` (19.3.1.22) | Parcial — lienzo.js:984 `agrupar` (campo `grupo`); al importar `grpSp` se aplana con la transformación chOff/chExt; al exportar no se escribe `p:grpSp` | se ve y edita | no | Alta | Escribir `p:grpSp` con chOff=off, chExt=ext. Corpus: lo-accent-color, lo-cshapes, lo-slide-sections, lo-tdf89927, officer-table-complex (+6) |
| Alinear y distribuir (Align) (`ObjectAlignMenu`, `ObjectsAlignLeftSmart`, `ObjectsAlignCenterHorizontalSmart`, `ObjectsAlignRightSmart`, `ObjectsAlignTopSmart`, `ObjectsAlignMiddleVerticalSmart`, `ObjectsAlignBottomSmart`, `AlignDistributeHorizontally`, `AlignDistributeVertically`, `ObjectsAlignRelativeToContainerSmart`, `ObjectsAlignSelectedSmart`) | Alinea los objetos entre sí o a la diapositiva | Cambia `a:off` de cada objeto | Tiene — lienzo.js:1006 `alinear`, 1020 `distribuir`; guías inteligentes al mover (lienzo.js:10) | se ve y edita | se escribe | Alta | Falta «alinear a la diapositiva» (solo entre sí). Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Girar (Rotate) (`ObjectRotateGallery`, `ObjectRotationOptionsDialog`) | Gira 90° o voltea | `a:xfrm rot` (60 000 por grado), `flipH`, `flipV` | Tiene — lienzo.js:1032 `voltear`; `rot` y girar 90° | se ve y edita | se escribe | Alta | Hecho. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Panel de selección (Selection Pane) (`SelectionPane`) | Lista, oculta y reordena objetos | `p:cNvPr name`, `hidden="1"` | Tiene — lienzo.js:1682 y 2301 «Capas» | se ve y edita | se escribe | Media | Escribir `hidden` para objetos ocultos (hoy no se exporta). Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Estilos rápidos (Quick Styles) (`ShapeQuickStylesHome`, `ShapeStylesOtherThemeFillsGallery`) | Combinaciones de relleno, línea y efecto del tema | `p:style` con `a:lnRef`, `a:fillRef`, `a:effectRef`, `a:fontRef idx` (19.3.1.46) | No — se lee `p:style` para pintar, no hay galería | se ve y edita | se escribe | Media | Escribir `p:style` con los índices del tema. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico, poi-formas |
| Relleno de forma (Shape Fill) (`ShapeFillColorPicker`, `ObjectFillMoreColorsDialog`, `EyedropperFill`) | Color de relleno | `p:spPr/a:solidFill` (20.1.8.54) | Tiene — propiedad `relleno`; importa `solidFill` y colores de tema | se ve y edita | se escribe | Alta | Falta cuentagotas y paleta del tema. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico, poi-formas |
| Relleno con imagen (Picture Fill) (`ObjectPictureFill`) | Imagen dentro de la forma | `a:blipFill` en `p:spPr` (20.1.8.14) | No — `blipFill` de formas no se pinta; solo en imágenes y en fondos | se conserva sin verse | no | Media | Pintar con `background-image` y escribir `a:blipFill`. Corpus: lo-accent-color, lo-n821567, lo-tdf169781, ms-brownbag, ms-presentation (+4) |
| Degradado (Gradient) (`GradientGallery`, `ShapeFillMoreGradientsDialog`) | Relleno con varios colores | `a:gradFill` (`a:gsLst/a:gs pos`, `a:lin ang scaled` o `a:path`) (20.1.8.33) | Parcial — importa solo la primera y última parada con ángulo fijo de 135°; no hay galería en formas (solo el fondo: `{tipo:"degradado",c1,c2,angulo}`) | se ve y edita | se escribe | Media | Leer todas las paradas y el ángulo real. Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-multiplelayoutfooter, lo-n821567 (+23) |
| Textura (Texture) (`ShapeFillTextureGallery`, `MoreTextureOptions`) | Relleno con una imagen en mosaico | `a:blipFill/a:tile` (20.1.8.58) | No — no hay | se conserva sin verse | no | Baja | — |
| Contorno de forma (Shape Outline) (`ShapeOutlineColorPicker`, `ObjectBorderOutlineColorMoreColorsDialog`, `EyedropperOutline`) | Color de línea | `a:ln/a:solidFill` (20.1.2.2.24) | Tiene — borde color; importa `a:ln` | se ve y edita | se escribe | Alta | Hecho. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Grosor (Weight) (`OutlineWeightGallery`, `LineStylesDialog`, `MoreLines2`) | Ancho de línea | `a:ln w` en EMU (12 700 = 1 pt) | Tiene — borde grosor (ooxml.js escribe `a:ln w`) | se ve y edita | se escribe | Alta | Falta línea compuesta (`cmpd`). Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-multiplelayoutfooter, lo-n821567 (+23) |
| Guiones y boceto (Dashes, Sketched) (`OutlineDashesGallery`, `GallerySketchyShapes`) | Línea punteada, discontinua o «a mano» | `a:ln/a:prstDash val` (11 valores: solid, dot, dash, lgDash, dashDot, lgDashDot, lgDashDotDot, sysDash, sysDot, sysDashDot, sysDashDotDot) y `a:custDash`; boceto: `a:ln` con `a14:` | Parcial — escribe `dash` y `sysDot`; importa los demás como línea sólida | se ve y edita | se escribe | Media | Añadir los 11 valores a `estilo`. Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-multiplelayoutfooter, lo-n821567 (+23) |
| Flechas (Arrows) (`ArrowStyleGallery`, `ArrowsMore`) | Puntas de línea | `a:ln/a:headEnd\|a:tailEnd type="triangle\|arrow\|stealth\|diamond\|oval\|none" w len` (20.1.2.2.15) | Parcial — `tipoPunta` abierta, hueco, rombo, rombo-hueco, círculo; importa `triangle` y `arrow` | se ve y edita | se escribe | Media | Añadir `stealth`, tamaños `w`/`len`. Corpus: lo-cshapes, lo-smartart-linear-rule-vert, lo-tdf106638, lo-tdf169781, lo-tdf89927 (+5) |
| Efectos de forma (Shape Effects) (`ShapeEffectsMenu`, `ObjectEffectPresetGallery`) | Sombra, reflejo, iluminado, bordes suaves, bisel, 3D | `p:spPr/a:effectLst` (`outerShdw`, `innerShdw`, `prstShdw`, `reflection`, `glow`, `softEdge`), `a:scene3d`, `a:sp3d` (20.1.8.26) | Parcial — solo sombra exterior (`sombra`, `outerShdw` en ooxml.js); el resto no | se conserva sin verse | no | Media | Ver sección 6.2. Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-multiplelayoutfooter, lo-n821567 (+23) |
| Sombra (Shadow) (`ObjectEffectShadowGallery`, `ShadowOptionsDialog`) | Sombra exterior, interior, en perspectiva | `a:outerShdw blurRad dist dir algn rotWithShape` con color y alfa; `a:innerShdw`, `a:prstShdw` | Parcial — booleano `sombra` → `outerShdw` fija; no se lee `innerShdw` ni los parámetros | se ve y edita | se escribe | Media | Guardar `blurRad`, `dist`, `dir`, color. Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-multiplelayoutfooter, lo-n821567 (+23) |
| Reflexión (Reflection) (`ReflectionGallery`, `ReflectionsMoreOptions`) | Imagen reflejada bajo el objeto | `a:effectLst/a:reflection blurRad stA endA dist dir fadeDir sy` | No — 0 coincidencias | se conserva sin verse | no | Baja | CSS `-webkit-box-reflect`. Corpus: ms-brownbag, ms-o12-tipico, poi-temas |
| Iluminado (Glow) (`ObjectEffectGlowGallery`, `GlowColorPicker`, `GlowColorMoreColorsDialog`, `EyedropperGlow`, `GlowsMoreOptions`) | Halo de color | `a:glow rad` + color | No — 0 coincidencias | se conserva sin verse | no | Baja | CSS `filter: drop-shadow`. |
| Bordes suaves (Soft Edges) (`ObjectEffectSoftEdgesGallery`, `SoftEdgesMoreOptions`) | Difumina el borde | `a:softEdge rad` | No — 0 coincidencias | se conserva sin verse | no | Baja | — |
| Bisel y rotación 3D (Bevel, 3-D Rotation) (`BevelShapeGallery`, `_3DBevelOptionsDialog`, `_3DRotationGallery`, `_3DRotationOptionsDialog`) | Relieve y perspectiva | `a:sp3d` (`a:bevelT`, `a:bevelB`, `extrusionH`, `prstMaterial`) y `a:scene3d` (`a:camera prst`, `a:lightRig`) | No — 0 coincidencias; se conservan solo si la diapositiva no se regenera | se conserva sin verse | no | Baja | Se ve plano; conservar. Corpus: lo-cshapes, lo-n821567, lo-smartart-linear-rule-vert, lo-tdf106638, lo-tdf134174 (+16) |
| Formato de forma (Format Shape pane) (`ObjectFormatDialog`) | Panel con todas las opciones | `p:spPr` completo | Parcial — barra flotante de la figura con color, borde, transparencia, esquinas, sombra | se ve y edita | se escribe | Alta | —  Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |

**Grupo «Edición» (`GroupEditing`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Buscar, Reemplazar (Find, Replace) (`FindDialog`, `ReplaceMenu`, `ReplaceDialog`) | Busca y cambia texto en todas las diapositivas | Texto de `a:t` | No — no hay búsqueda en diapositivas (lienzo.js:1310 `buscar` es de guías) | se ve y edita | se escribe | Alta | Recorrer `textoPlano` (diapositivas.js:112) por página. Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |
| Reemplazar fuentes (Replace Fonts) (`FontsReplaceFonts`) | Cambia una fuente por otra en todo el archivo | `a:latin typeface` | No — no se encontró | se ve y edita | se escribe | Baja | — |
| Seleccionar (Select) (`SelectMenu`, `SelectAll`, `ObjectsSelect`, `SelectionPane`) | Selecciona todo u objetos | — | Tiene — lienzo.js:1040 `seleccionarTodo`; recuadro de selección | se ve y edita | no | Media | Corpus: ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |

**Grupo «Voz» (`GroupVoiceTools`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Dictar (Dictate) (`DictationMenu`, `Dictate`, `DictateInMenu`, `SetDictationLanguageGallery`) | Escribe por voz | Sin elemento propio | No — no se encontró reconocimiento de voz | se ve y edita | no | Baja | Se podría con la API de voz del navegador (comprobar la política de seguridad del contenido). |

**Grupo «Activación» (`GroupActivation`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Activar Office (Activate Office) (`ActivateOffice`) | Licencia | — | No aplica — licencia de producto, no existe en la suite | se ve y edita | no | Baja | — |

**Grupo «Etiquetas» (`GroupClassifyLabelProtect`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Confidencialidad (Sensitivity) (`ClassifyLabelProtect`) | Aplica una etiqueta de protección | `docProps/custom.xml` y `MSIP_Label_*` | No aplica — usa el servicio de etiquetas de la cuenta de Microsoft 365 | se conserva sin verse | no | Baja | Se conserva en `_origen`. |

**Grupo «Diseñador» (`GroupDesignerOptions`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Ideas de diseño (Designer) (`DesignerPane`) | Propone diseños de diapositiva desde un servicio en línea | — | No aplica — servicio en línea ligado a la cuenta | se ve y edita | no | Baja | Sin equivalente local. |

**Grupo «Complementos» (`GroupOfficeExtensionsAddinFlyout`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Complementos (Add-ins) (`OfficeExtensionsShowAddinFlyout`) | Abre complementos de Office | `ppt/webextensions/` | No aplica — complementos de Office no corren en la suite | se conserva sin verse | no | Baja | Se conservan en `_origen`. |

**Grupo «Asistencia en línea» (`GroupAIAssistance`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Ideas de diseño (Designer) (aparece otra vez en este grupo) (`DesignerPane`) | Servicio en línea | — | No aplica — servicio en línea ligado a la cuenta | se ve y edita | no | Baja | Igual que «Diseñador». |

### 1.3 Pestaña Insertar (Insert)

Fuente: https://support.microsoft.com/es-es/office/ ; lista oficial TabInsert. Evidencia: `lienzo.js` `menuInsertar` (2197-2210), `imagen` (887), `recortarImagen` (1225), `diapositivas.js` `editarDatos`.

**Grupo «Diapositivas» (`GroupSlides2`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Nueva diapositiva, Duplicar, Desde esquema, Reutilizar (New Slide…) (`SlideNewGalleryInsert`, `DuplicateSelectedSlides`, `SlidesFromOutline`, `SlidesReuseSlides`, `ReuseSlides`, `PasteAsSlide`) | Mismos comandos que en Inicio > Diapositivas | Ver pestaña Inicio | Parcial — Nueva y Duplicar sí (lienzo.js:2176, 2036); esquema, reutilizar y pegar como diapositiva no | se ve y edita | se escribe | Alta | Ver Inicio > Diapositivas. Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-n821567, lo-slide-sections (+21) |

**Grupo «Tablas» (`GroupInsertTables`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Tabla (Table) (`TableInsertGallery`, `TableInsert`) | Inserta una tabla de filas y columnas | `p:graphicFrame/a:graphic/a:graphicData uri=".../drawingml/2006/table"/a:tbl` con `a:tblPr`, `a:tblGrid/a:gridCol w`, `a:tr h/a:tc` (21.1.3) | Tiene — lienzo.js:2201 «Tabla…» con editor de datos (diapositivas.js:200-260); filas y columnas; se exporta `a:tbl` (ooxml.js, `tblPr firstRow bandRow`) | se ve y edita | se escribe | Alta | Falta elegir tamaño con cuadrícula y estilo de tabla. Corpus: officer-table-complex, ms-o12-tipico, ms-rendimiento-tipico, ms-tabla-grande, ms-tipico (+1) |
| Dibujar tabla (Draw Table) (`TableDrawTable`) | Dibuja celdas con lápiz | Igual que tabla con combinación `gridSpan`/`rowSpan`/`hMerge`/`vMerge` | No — no hay dibujo de tablas | se ve y edita | se escribe | Baja | — |
| Hoja de cálculo de Excel (Excel Spreadsheet) (`ExcelSpreadsheetInsert`) | Incrusta una hoja como objeto OLE | `p:oleObj progId="Excel.Sheet.12"` + `ppt/embeddings/*.xlsx` + imagen de vista previa (19.3.2.4) | No — los objetos OLE se conservan sin verse; no se crean | se conserva sin verse | no | Media | Mostrar la imagen `p:pic` de vista previa y abrir la hoja incrustada con el editor de hojas. Corpus: lo-tdf169781, ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |

**Grupo «Imágenes» (`GroupImages`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Imágenes: este dispositivo (Pictures) (`FlyoutAnchorInsertPictures`, `PictureInsertFromFilePowerPoint`) | Inserta una imagen desde un archivo | `p:pic` con `p:blipFill/a:blip r:embed` → `ppt/media/imageN.*`; `a:srcRect` recorte; `p:cNvPr descr` texto alternativo (19.3.1.37) | Tiene — lienzo.js:887 `imagen()`, recorte lienzo.js:1225, máscara de forma; `descr` se escribe (ooxml.js:2384) | se ve y edita | se escribe | Alta | Falta `a:srcRect` con valores negativos y relleno de forma. Corpus: lo-accent-color, lo-cshapes, lo-n821567, lo-tdf106638, lo-tdf149206 (+8) |
| Imágenes desde el teléfono, de la nube o en línea (`InsertMobilePicture`, `InsertM365Picture`, `ClipArtInsertDialog`) | Insertan desde servicios en línea | — | No aplica — dependen de cuentas y servicios de Microsoft; en la suite se insertan desde archivo | se ve y edita | no | Baja | — |
| Captura de pantalla (Screenshot) (`ScreenshotInsertGallery`, `ScreenClipping`) | Inserta una captura de una ventana | Imagen `p:pic` | No — no se encontró `getDisplayMedia` | se ve y edita | se escribe | Baja | API del navegador `getDisplayMedia`; revisar política de seguridad. |
| Álbum de fotografías (Photo Album) (`PhotoAlbumInsertMenu`, `PhotoAlbumInsert`, `PhotoAlbumEdit`) | Crea una presentación con muchas fotos | Presentación con `p:pic` y atributos de álbum en `p:presentation/p:extLst` ([MS-PPTX]) | No — se abre como diapositivas con imágenes; no hay comando | se ve y edita | se escribe | Media | Aceptar varias imágenes y crear una por diapositiva. Corpus: ms-album |

**Grupo «Cámara» (`GroupChunkCameoCamera`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Cameo (Cameo) (`DropdownInsertCameo`, `InsertCameo`, `InsertCameoAllSlides`) | Inserta tu cámara como objeto en vivo | Video en `p:pic` con `a:videoFile` y extensión de Office | No aplica — usa la cámara y la presentación en escritorio | se conserva sin verse | no | Baja | — |

**Grupo «Ilustraciones» (`GroupInsertIllustrations`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Formas (Shapes) (`ShapesInsertGallery`) | Galería de formas | Ver Inicio > Dibujo y sección 5 | Parcial — 23 de 187 formas; lienzo.js:37 | se ve y edita | se escribe | Alta | Ver sección 5. Corpus: lo-cshapes, poi-formas |
| Iconos (Icons) (`IconInsertFromFile`) | Inserta un icono vectorial | `p:pic` con `a:blip` PNG y `asvg:svgBlip` (extensión `{96DAC541-7B7A-43D3-8B79-37D633B846F1}`, [MS-ODRAWXML]) | Parcial — lienzo.js:2205 `bibliotecaIconos` (íconos propios, se inserta como figura); no lee `svgBlip` | se ve y edita | se escribe | Media | Leer `asvg:svgBlip`, mostrar el SVG y escribir PNG + SVG. Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-multiplelayoutfooter, lo-n821567 (+17) |
| Modelos 3D (3D Models) (`Insert3DModelFallback`, `Insert3DModelDropdown`, `Insert3DModelDefault`, `Insert3DModelFromFile`, `Insert3DModelFromFileConsumer`, `Insert3DModelFromOnline`, `Insert3DModelFromOnlineConsumer`) | Inserta un modelo .glb que se puede girar | `mc:AlternateContent` con `am3d:model3d` y `r:embed` a `.glb` + imagen de reserva ([MS-ODRAWXML] 2.3) | No — se conserva con la imagen de reserva | se conserva sin verse | no | Baja | Mostrar la imagen de reserva `mc:Fallback`. Corpus: lo-tdf169781, lo-tdf89927, ms-animacion, ms-grafica-area, ms-of16 |
| SmartArt (SmartArt) (`SmartArtInsert`) | Inserta un diagrama de gráficos con texto | `p:graphicFrame` con `dgm:relIds` → `diagrams/data\|layout\|quickStyle\|colors` y `drawing` (ECMA-376 21.4) | Parcial — se pinta `drawing#.xml` (dsp:) al importar; no se crea ni se edita; menú «Diagrama listo» propio (lienzo.js:2207) | se ve y edita | se escribe | Alta | Ver Diseño de SmartArt. Corpus: lo-smartart-linear-rule-vert, lo-tdf169781, ms-brownbag, ms-o12-tipico, ms-organigrama (+1) |
| Gráfico (Chart) (`ChartInsert`) | Inserta un gráfico | `p:graphicFrame` → `ppt/charts/chartN.xml` (`c:chartSpace`, 21.2) + libro incrustado | Parcial — lienzo.js:2203 «Gráfica…»; 6 tipos (graficas.js TIPOS); se exporta con `graficaPptx` (ooxml.js:2792) | se ve y edita | se escribe | Alta | Faltan combinados, secundario, líneas de tendencia. Corpus: lo-tdf169781, ms-o12-tipico |

**Grupo «Contenido» (`GroupContent`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Recopilador (Collector) (`Collector`) | Guarda contenido de la web | — | No aplica — herramienta de navegador antiguo | se ve y edita | no | Baja | — |

**Grupo «Power BI» (`GroupPowerBI`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Power BI (Power BI) (`InsertPowerBI`) | Inserta un informe en vivo | Objeto web de complemento | No aplica — servicio externo con cuenta | se conserva sin verse | no | Baja | — |

**Grupo «Formularios» (`GroupMSForms`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Formularios (Forms) (`InsertMSForms`) | Inserta un formulario en línea | — | No aplica — servicio con cuenta | se conserva sin verse | no | Baja | La suite tiene sus propios formularios. |

**Grupo «Complementos» (`GroupOfficeExtension`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Complementos (Add-ins) (`OfficeExtensionsAppStore`, `OfficeExtensionsGallery2`, `OfficeExtensionsDialog`, `OfficeExtensionsManageOtherAddins`, `ExtensibilityExperimentation`, `OfficeExtensionsFeaturedApp1`, `OfficeExtensionsFeaturedApp2`, `OfficeExtensionsFeaturedApp3`, `OfficeExtensionsFeaturedApp4`, `OfficeExtensionsFeaturedApp5`, `OfficeExtensionsFeaturedApp6`) | Tienda y complementos de Office | `ppt/webextensions/webextension1.xml` | No aplica — los complementos de Office no corren en la suite | se conserva sin verse | no | Baja | Se conservan en `_origen`. |

**Grupo «Vínculos» (`GroupInsertLinks`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Zoom: de resumen, de sección, de diapositiva (Zoom) (`InsertZoomMenu`, `SectionZoomInsert`, `SlideZoomInsert`, `MSPPTInsertTableofContents`) | Miniatura que salta a otra parte | `mc:AlternateContent` con `pslz:sldZm`/`pslz:sectionZm` y `p166:` ([MS-PPTX] 2.6) con imagen de reserva | No — se conserva con la imagen de reserva | se conserva sin verse | no | Media | Mostrar el `mc:Fallback` y saltar a la diapositiva `sldId`. Corpus: lo-tdf169781, lo-tdf89927, ms-animacion, ms-grafica-area, ms-of16 (+2) |
| Vínculo (Link) (`InsertLinkGallery`, `HyperlinkInsert`) | Enlace web, a diapositiva o a archivo | `a:hlinkClick r:id` + relación `hyperlink` en el texto o en `p:cNvPr` (20.1.2.2.23, 21.1.2.3.5) | Parcial — importa y escribe el enlace en textos de Word; en diapositivas solo detecta texto http(s) (lienzo.js:297); no se escribe `a:hlinkClick` | se ve y edita | no | Alta | Escribir `a:hlinkClick` con relación externa y `action="ppaction://hlinksldjump"` para diapositivas. Corpus: lo-slide-sections, lo-tdf120573, ms-brownbag, ms-tipico, poi-formas |
| Acción (Action) (`ActionInsert`) | Hace algo al hacer clic (siguiente, programa, sonido) | `a:hlinkClick action="ppaction://hlinkshowjump?jump=nextslide\|previousslide\|firstslide\|lastslide\|endshow"`, `ppaction://program`, `ppaction://macro` | No — 0 coincidencias de `ppaction` en `codigo/js` | se conserva sin verse | no | Media | Soportar saltos de diapositiva y URL; los programas y macros no aplican. Corpus: lo-tdf120573, ms-tipico, poi-formas |

**Grupo «Comentarios» (`GroupInsertComments`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Comentario nuevo (New Comment) (`InsertNewComment`) | Añade una nota con autor | Clásico: `ppt/comments/commentN.xml` + `commentAuthors.xml`; moderno: `ppt/comments/modernComment_*.xml` + `authors.xml` ([MS-PPTX] 2.1.? p188) | Parcial — comentarios.js los guarda en el documento; no se escriben al .pptx ni se leen del .pptx | se ve y edita | no | Alta | Leer y escribir `p:cm` (clásico) y `p188:cm` (moderno). Corpus: ninguno |

**Grupo «Texto» (`GroupInsertText`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Cuadro de texto (Text Box) (`TextBoxInsert`, `TextBoxInsertMenu`, `TextBoxInsertHorizontal`, `TextBoxInsertVertical`) | Cuadro libre, horizontal o vertical | `p:sp` con `p:cNvSpPr txBox="1"`, `a:bodyPr wrap="square" vert=…` | Parcial — lienzo.js:2199 «Cuadro de texto» (horizontal); el vertical (`vert`) no | se ve y edita | se escribe | Alta | Añadir `vert`. Corpus: lo-accent-color, lo-crop-to-shape, lo-n821567, lo-smartart-linear-rule-vert, lo-tdf106638 (+17) |
| Encabezado y pie de página (Header & Footer) (`HeaderFooterInsert`) | Fecha, número y pie en cada diapositiva | Marcadores `p:ph type="dt\|ftr\|sldNum"` con `a:fld type="datetime\|slidenum"`; `p:hf` en patrón (19.3.1.25) | No — no hay comando; marcadores de patrón se leen como texto | se ve y edita | se escribe | Alta | Ver sección 6. Corpus: lo-multiplelayoutfooter, lo-slide-sections, lo-tdf106638, lo-tdf169781, lo-tdf89927 (+22) |
| WordArt (WordArt) (`WordArtInsertGallery`) | Texto decorativo | `a:bodyPr/a:prstTxWarp prst="textArchUp"…` (41 valores, 20.1.9.19) + `a:ln`/`a:gradFill` en `a:rPr` | No — `prstTxWarp` no se interpreta; se conserva si no se regenera | se conserva sin verse | no | Media | Ver sección 6. Corpus: lo-cshapes, lo-smartart-linear-rule-vert, lo-tdf106638, lo-tdf169781, lo-tdf89927 (+2) |
| Fecha y hora, Número de diapositiva (Date & Time, Slide Number) (`DateAndTimeInsert`, `NumberInsert`) | Campo que se actualiza | `a:fld type="datetime1…datetime13"` y `type="slidenum"` (21.1.2.2.4) | No — los campos se leen como texto fijo | se ve y edita | se escribe | Alta | Escribir `a:fld` con `id` GUID. Corpus: lo-accent-color, lo-crop-to-shape, lo-cshapes, lo-multiplelayoutfooter, lo-n821567 (+21) |
| Objeto (Object) (`OleObjectctInsert`) | Incrusta un objeto de otro programa | `p:oleObj` (19.3.2.4) | No — ver arriba | se conserva sin verse | no | Baja | Corpus: lo-tdf169781, ms-o12-tipico, ms-rendimiento-tipico, ms-tipico |

**Grupo «Símbolos» (`GroupInsertSymbols`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Ecuación (Equation) (`InsertBuildingBlocksEquationsGallery`, `EquationInsertNew`, `InkEquation`) | Inserta ecuaciones | `a14:m` con `m:oMathPara` dentro de `mc:AlternateContent` (Office Math, 22.1) | Parcial — lienzo.js:2208 `editarEcuacion` (ecuaciones.js: texto tipo LaTeX → OMML en Word); en diapositivas no se lee ni escribe `a14:m` | se ve y edita | se escribe | Media | Reutilizar `ommlATex` del modo texto. Corpus: lo-tdf169781, lo-tdf89927, ms-animacion, ms-grafica-area, ms-of16 |
| Símbolo (Symbol) (`SymbolInsert`) | Inserta caracteres especiales | Texto Unicode en `a:t`; fuente `a:sym` | No — no hay selector de símbolos (se escribe con el teclado) | se ve y edita | se escribe | Baja | — |

**Grupo «Multimedia» (`GroupInsertMediaClips`)**

| Comando o función | Qué hace | Cómo se guarda en el archivo | NOM-COLAB | Al importar | Al exportar | Prioridad | Notas para implementar |
|---|---|---|---|---|---|---|---|
| Video (Video) (`MovieInsert02`, `InsertVideoFromDevice`, `MovieFromFileInsert`, `InsertM365Video`, `MovieFromClipOrganizerInsert`) | Inserta un video | `p:pic/p:nvPicPr/p:nvPr/a:videoFile r:link` + `p14:media r:embed` → `ppt/media/mediaN.mp4`, imagen de portada `a:blip` (20.1.3.6, [MS-PPTX] p14:media) | No — 0 coincidencias de `videoFile` en la app; se conserva si no se regenera | se ve y edita | se escribe | Alta | Mostrar `<video>` con la portada; escribir `a:videoFile` + `p14:media`. Corpus: lo-tdf120573, ms-presentation |
| Audio (Audio) (`SoundInsertMenu02`, `SoundInsertFromFile`, `SoundRecord`) | Inserta o graba sonido | `a:audioFile r:link` + `p14:media`; icono `p:pic` (20.1.3.1) | No — no se encontró | se ve y edita | se escribe | Media | `<audio>`; grabar con `MediaRecorder`. Corpus: lo-tdf120573 |
| Grabación de pantalla (Screen Recording) (`ObjectScreenRecording`) | Graba la pantalla y la inserta como video | Como video | No — no se encontró | se ve y edita | se escribe | Baja | `getDisplayMedia` + `MediaRecorder`. |

