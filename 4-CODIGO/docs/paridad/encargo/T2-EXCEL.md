# Tarea: EXCEL → escribe `salida/EXCEL.md` y `salida/EXCEL-FUNCIONES.csv`

Lee primero `COMUN.md` (reglas y formato de fila). Catálogo **completo** de Excel para Microsoft 365
(escritorio, canal actual) comparado con la hoja de NOM-COLAB (`modo-hoja.js`, `formulas.js`,
`graficas.js` y la parte de Excel de `ooxml.js`).

## A. `salida/EXCEL-FUNCIONES.csv` (hazlo primero)

**Todas** las funciones de la lista oficial «Excel functions (alphabetical)» / «Funciones de Excel
(por orden alfabético)» de support.microsoft.com (son unas 500; no te saltes ninguna, cuéntalas y
compara el total con la página). Columnas, separadas por coma y con comillas cuando haga falta:

`nombre_ingles,nombre_espanol,categoria,version_excel,prefijo_en_archivo,en_nomcolab,prioridad,devuelve_matriz,notas`

- `nombre_espanol`: el de Excel en español (es-ES) tomado de la página en español de Microsoft
  (`support.microsoft.com/es-es/...`); si es-MX difiere, ponlo en notas.
- `prefijo_en_archivo`: cómo se escribe en el XML de la celda (`_xlfn.`, `_xlfn._xlws.`, `_xlfn.
  _xlpm.` para parámetros de LET/LAMBDA, o ninguno). Fuente: [MS-XLSX] (lista de funciones
  futuras) y ECMA-376 parte 1 §18.17.
- `en_nomcolab`: `si` si está en `FUNCS` o `ALIAS` de `formulas.js` (revisa el nombre en español Y la
  tabla `INGLES`), si no `no`.
- `prioridad`: Alta = uso escolar u oficina cada semana; Media; Baja (ingeniería, cubos, web, compat).
- `devuelve_matriz`: `si` para funciones de matriz dinámica (FILTRAR, ORDENAR, UNICOS, SECUENCIA…).
Al final de `EXCEL.md`, una sección «Funciones» con el total, cuántas tiene NOM-COLAB, el porcentaje
por categoría y las 100 que faltan más importantes en orden.

## B. `salida/EXCEL.md`

1. **Cinta, pestaña por pestaña, grupo por grupo, comando por comando** (lista oficial del
   repositorio `OfficeDev/office-fluent-ui-command-identifiers`, descárgala): Archivo (Backstage),
   Inicio, Insertar, Dibujar, Disposición de página, Fórmulas, Datos, Revisar, Vista, Automatizar,
   Ayuda; contextuales: Diseño de tabla, Analizar tabla dinámica, Diseño (tabla dinámica), Diseño y
   Formato de gráfico, Formato de imagen, Formato de forma, Minigráfico, Segmentación.
2. **Lo que está dentro de los diálogos y en el archivo** (una fila por opción):
   - Formato de celdas: **gramática completa de los códigos de formato de número** (secciones `;`,
     colores `[Rojo]`/`[Color10]`, condiciones `[>100]`, configuración regional `[$-es-MX]`,
     fracciones, científico, texto `@`, relleno `*`, espacio `_`, tiempo transcurrido `[h]`,
     fechas y horas, `numFmtId` integrados 0-163), alineación (todas: horizontal incluida
     «Rellenar», «Centrar en la selección», «Distribuido»; vertical; sangría; orientación y
     grados; ajustar texto; reducir hasta ajustar; combinar), fuente, bordes (todos los estilos y
     diagonales), relleno (sólido, tramas, degradado), protección (bloqueada, oculta).
   - Estilos de celda, temas.
   - **Formato condicional**: cada tipo (`cellIs` con cada operador, `expression`, `colorScale` de 2 y
     3 colores, `dataBar` con extensiones x14, `iconSet` con **cada conjunto de íconos**, `top10`,
     `aboveAverage`, `duplicateValues`, `uniqueValues`, `containsText`/`notContainsText`/
     `beginsWith`/`endsWith`, `containsBlanks`, `containsErrors`, `timePeriod` con cada periodo),
     prioridad, «detener si es verdad», administrar reglas.
   - **Validación de datos**: cada tipo y operador, mensaje de entrada y de error (3 estilos), listas
     desde rango o texto, ignorar en blanco.
   - Ordenar y filtrar: autofiltro (valores, personalizado, por color, top 10, dinámico de fechas),
     `sortState`, filtro avanzado.
   - **Tablas** (ListObject): estilos integrados, fila de totales, columnas calculadas, referencias
     estructuradas en fórmulas (`Tabla1[Columna]`, `[@Columna]`, `#Totales`).
   - Tablas dinámicas y gráficos dinámicos (`pivotCacheDefinition`, `pivotTable`): al menos
     conservar; qué mínimo sería mostrarlas.
   - **Gráficos**: cada tipo y subtipo de Excel 365, incluidos los de `cx:` (chartex: cascada,
     histograma, Pareto, cajas y bigotes, rectángulos, proyección solar, embudo, mapa), y cada
     elemento (títulos, ejes, ejes secundarios, leyenda, etiquetas de datos, líneas de tendencia,
     barras de error, tabla de datos, líneas de división, combinados, estilos y colores).
   - Minigráficos (`x14:sparklineGroups`), segmentaciones y escalas de tiempo, comentarios (notas
     clásicas con VML y comentarios encadenados `threadedComments`, `persons`), hipervínculos,
     imágenes y formas (parte `drawing`), imágenes **dentro de la celda** (rich value), nombres
     definidos (incluidos `_xlnm.Print_Area`, `_xlnm.Print_Titles`, `_xlnm._FilterDatabase`),
     proteger hoja y libro (con cada permiso), inmovilizar paneles y dividir, agrupar/esquema,
     ocultar filas y columnas, ancho de columna y alto de fila (unidades), celdas combinadas,
     configurar página (`pageSetup`, márgenes, encabezados y pies con sus códigos `&P` `&N` `&D`
     `&A` `&F`…, área de impresión, títulos, saltos de página, ajuste a N páginas), cálculo
     (`calcPr`: automático, manual, iterativo), fórmulas compartidas, matriciales (CSE) y de
     **matriz dinámica** (desbordamiento, metadatos `cm`), tipos de datos vinculados (conservar),
     vínculos a otros libros, Power Query/conexiones (conservar), análisis de hipótesis (buscar
     objetivo, escenarios, tabla de datos `{=TABLA()}`), controles de formulario, macros (`.xlsm`:
     conservar), varias hojas (ocultas, muy ocultas, color de pestaña), vistas personalizadas.
   - Límites oficiales («Excel specifications and limits») comparados con los de la app (en
     `ooxml.js` hay `LIM_F` y `LIM_C`).
3. Para cada fila Alta o Media, en qué archivo(s) del corpus (`corpus*/xlsx/`) aparece.
4. Totales, los 40 faltantes más importantes con su plan, y fuentes (ver `COMUN.md`). Ojo con una
   regla del proyecto: el exportador de Excel compara contra lo que `modeloXlsx` lee HOY del
   original; cambiar lo que lee el importador altera documentos ya importados. Cada propuesta de
   cambio en el importador tiene que decir cómo no romper eso.
