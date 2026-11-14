# Encargo de investigación: Word, Excel y PowerPoint contra NOM-COLAB

Trabajas solo, sin preguntar nada. Al final tiene que quedar un archivo de salida completo y correcto.
Trabaja en `~/investigacion-office/` (todo lo necesario ya está ahí). Tienes Internet (búsqueda y
descarga de páginas), Python 3, Node, git, unzip y curl.

## Qué es NOM-COLAB

Suite de oficina colaborativa de un equipo de estudiantes: página web + app Android (WebView), en
JavaScript sin librerías (`script-src 'self'`, sin `eval`), servidor Spring Boot. Tiene cuatro tipos
de documento: **texto** (como Word), **hoja** (como Excel), **presentación** (como PowerPoint) y
**diagrama**. Importa y exporta `.docx`, `.xlsx` y `.pptx`:

- Al importar, el archivo de Office original viaja dentro del documento (bloque `_origen`).
- Al exportar, lo que no se tocó sale idéntico al original; lo que se cambió se regenera.
- Lo que la app no entiende se conserva al exportar, pero no se ve ni se edita.

El objetivo del proyecto: que **todo** lo que tienen Word, Excel y PowerPoint quede inventariado, que
se sepa exactamente qué tiene la app y qué no, y que todo archivo importado o exportado se lea y se
escriba sin perder ni dañar nada (que Office lo abra sin «reparar»). Este encargo es la
investigación; otra persona implementará después con tu documento como guía, así que tiene que
servir para implementar sin volver a investigar.

## Dónde está cada cosa

- `codigo/js/` — el código de la interfaz y de la conversión (léelo con `grep -n` y ventanas de
  líneas; los archivos grandes no se leen enteros):
  - `ooxml.js` — importar y exportar Office. Funciones: `docx`, `docxArmar`, `huellasDocx`,
    `attrsRun`, `attrsParrafo`, `parDe`, `datosSeccion`, `ommlATex` (Word); `modeloXlsx`, `xlsx`,
    `xlsxNuevo`, `xlsxConOrigen`, `parcharHoja`, `hojaDesdeCero`, `estilo`, `dxf`, `regla`,
    `validacion`, `graficaXlsx`, `fabricaXlsx` (Excel); `pptx`, `pptxArmar`, `huellasPptx`,
    `parcialesPptx`, `custGeom`, `caminoDrawingML`, `graficaPptx`, `tema`, `xfrmDe`
    (PowerPoint); `formulaExcel` (traducción de fórmulas).
  - `modo-texto.js` — editor de texto. Atributos de párrafo en `PAR` y de carácter en `CAR`.
  - `modo-hoja.js` — editor de hoja de cálculo; `formulas.js` — motor de fórmulas: `FUNCS`
    (funciones, nombres en español), `ALIAS`, `INGLES` (nombre en inglés que va al archivo),
    `FIRMAS` (ayuda al escribir).
  - `diapositivas.js` y `lienzo.js` — presentaciones y diagramas (formas, imágenes, tablas,
    animaciones); `graficas.js` — gráficas; `ecuaciones.js` — ecuaciones; `comentarios.js` —
    comentarios y sugerencias; `citas.js` — citas y bibliografía; `formatos.js` — exportar a otros
    formatos; `plantillas.js`; `rueda.js` — menú de rueda; `editor.js`, `nucleo.js`, etc.
- `codigo/docs/` — documentos de diseño del proyecto (contexto, no hace falta leerlos todos).
- `codigo/pruebas/office/fidelidad.py` — la medida que usa el equipo (categorías que compara).
- `medicion.txt` — última medida de cuánto entiende la app de 47 archivos reales (por categoría).
- `corpus/{docx,xlsx,pptx}/` y `corpus-web/{docx,xlsx,pptx}/` — 100 archivos reales (muchos de
  Microsoft: plantillas, Open XML SDK; otros de Apache POI). Úsalos para ver qué aparece de verdad
  en los archivos.

## Reglas de la salida (obligatorias)

1. Todo en **español**. Los comandos con el nombre que muestra Office en español y, entre
   paréntesis, el nombre en inglés. Ejemplo: «Pintar formato (Format Painter)».
2. **Ninguna mención** a las herramientas con que se hizo el trabajo, en ningún archivo que escribas
   (los archivos se copian tal cual al repositorio del proyecto). Escribe como lo escribiría el equipo.
3. **Fuentes de Microsoft primero**: learn.microsoft.com, support.microsoft.com, las
   especificaciones abiertas de Office (`[MS-OI29500]`, `[MS-DOCX]`, `[MS-XLSX]`, `[MS-PPTX]`,
   `[MS-ODRAWXML]`, `[MS-OE376]`, `[MS-XLSB]` si hace falta), el repositorio
   `github.com/OfficeDev/office-fluent-ui-command-identifiers` (lista oficial de **todos** los
   comandos de la cinta, por pestaña y grupo) y el estándar **ECMA-376** (5.ª edición, partes 1-4,
   ecma-international.org) / ISO/IEC 29500. Cita la URL en cada sección. Si un dato no está en
   Microsoft, otra fuente seria y dilo.
4. El estado de NOM-COLAB **solo con evidencia del código** (archivo y nombre de función o línea).
   Si no lo encuentras, es «No». No adivines; si dudas, «Revisar» y di qué buscaste.
5. Escribe el archivo de salida **por secciones, guardando cada sección al terminarla** (si el
   trabajo se corta, tiene que quedar lo hecho). Al final, revisa que no falte ninguna pestaña.
6. No inventes atajos ni nombres en español: si no encuentras el nombre en español de Microsoft,
   pon el inglés y márcalo con «(sin nombre en español verificado)».

## Formato de cada fila del catálogo

| Comando o función | Qué hace (una línea, para una persona) | Cómo se guarda en el archivo (parte y elemento/atributo; sección de ECMA-376 o de MS-xxx) | NOM-COLAB: Tiene / Parcial / No / No aplica (+ evidencia) | Al importar: se ve y edita / se conserva sin verse / se pierde | Al exportar algo hecho en NOM-COLAB: se escribe / no | Prioridad: Alta (lo usa un estudiante u oficina cada semana) / Media / Baja | Notas para implementar |

«No aplica» solo para lo que no tiene sentido en una suite web colaborativa (por ejemplo,
«Complementos COM»), y di por qué.

Al final del documento:
- Totales por pestaña y por programa: cuántos comandos, cuántos Tiene / Parcial / No / No aplica;
  porcentaje simple (Tiene = 1, Parcial = 0.5, sin contar No aplica) y porcentaje solo de Alta.
- **Los 40 faltantes más importantes**, en orden, cada uno con: qué hacer, qué elementos XML leer y
  escribir (con su sección del estándar), qué función del código tocar, qué archivo del corpus lo
  trae para probarlo, y cómo saber que quedó bien.
- Lista de fuentes con URL.
