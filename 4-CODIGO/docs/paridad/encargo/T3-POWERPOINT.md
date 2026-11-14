# Tarea: POWERPOINT → escribe `salida/POWERPOINT.md`

Lee primero `COMUN.md` (reglas y formato de fila). Catálogo **completo** de PowerPoint para
Microsoft 365 (escritorio, canal actual) comparado con las presentaciones de NOM-COLAB
(`diapositivas.js`, `lienzo.js`, `graficas.js` y la parte de PowerPoint de `ooxml.js`).

1. **Cinta, pestaña por pestaña, grupo por grupo, comando por comando** (lista oficial del
   repositorio `OfficeDev/office-fluent-ui-command-identifiers`, descárgala): Archivo, Inicio,
   Insertar, Dibujar, Diseño, Transiciones, Animaciones, Presentación con diapositivas, Grabar,
   Revisar, Vista (incluidos Patrón de diapositivas, Patrón de documentos, Patrón de notas), Ayuda;
   contextuales: Formato de forma, Formato de imagen, Diseño de tabla, Disposición (tabla), Diseño y
   Formato de gráfico, Diseño y Formato de SmartArt, Reproducción y Formato de video y audio,
   Ecuación.
2. **Cada transición** (una fila por transición, con su elemento: hijos de `p:transition` y las
   extensiones `p14:` y `p15:prstTrans` —«Caída», «Cortinas», «Viento», «Prestigio», «Fractura»,
   «Aplastar», «Despegar», «Rizo de página», «Avión», «Origami»…— y Transformación `p159:morph`), con
   sus opciones de efecto, duración, sonido y avance (al hacer clic / después de).
3. **Cada efecto de animación** de entrada, énfasis, salida y trayectorias (una fila por efecto, con
   `presetClass` y `presetID` tal como se guardan en `p:timing`), más inicio (al hacer clic, con la
   anterior, después de la anterior), duración, retraso, repetición, desencadenadores, animar texto
   por palabra/letra, panel de animación, y cómo se guarda (`p:par`, `p:seq`, `p:cTn`, `p:bldP`).
4. **El modelo de herencia** y lo que hace falta para que se vea igual: presentación → patrón
   (`p:sldMaster`) → diseño (`p:sldLayout`) → diapositiva; marcadores de posición (`type`, `idx`) y
   cómo heredan posición, tamaño y formato; `p:txStyles` (`titleStyle`, `bodyStyle`, `otherStyle`)
   por nivel; `lstStyle`; fuentes del tema (`+mj-lt`, `+mn-lt`); `p:clrMap` y `clrMapOvr`; fondo
   (`p:bg`, `bgRef`); autoajuste (`normAutofit` con `fontScale` y `lnSpcReduction`, `spAutoFit`);
   viñetas (`buChar`, `buAutoNum` con cada esquema, `buBlip`, tamaño y color); propiedades del cuadro
   de texto (`bodyPr`: márgenes, anclaje, `vert`, ajuste, `numCol`, rotación). Explica por qué se
   miden bajas «negrita y cursiva 56 %», «tamaño de la diapositiva 83 %» y «posición y tamaño 86 %»
   en `medicion.txt` (revisa `fidelidad.py` y `ooxml.js` y di la causa concreta con evidencia).
5. Formas: **cada geometría predefinida** (`prstGeom`, son unas 187; tabla con nombre, nombre en
   español en la galería de formas y si la app la dibuja) con valores de ajuste `avLst` y `gdLst`;
   `custGeom` (cada comando de trazo); efectos (sombra, iluminado, bordes suaves, reflejo, bisel,
   3-D); rellenos (sólido, degradado, trama, imagen, transparencia); líneas (guiones, flechas,
   compuestas); grupos (`grpSp` con `chOff`/`chExt`); conectores (`cxnSp` con `stCxn`/`endCxn`);
   tablas (`a:tbl`, `tableStyleId` y los estilos de tabla integrados); gráficos (`c:chart`);
   SmartArt (`dgm`); video y audio (`p14:media`, incrustado o vinculado, recorte, portada); objetos
   OLE; hipervínculos y configuración de acción; secciones (`p14:sectionLst`); notas del orador;
   comentarios (modernos y clásicos); tamaño de diapositiva (cada tamaño predefinido); encabezado y
   pie (fecha, número de diapositiva); zoom de resumen, sección y diapositiva; modelos 3D; entrada
   de lápiz; WordArt.
6. Para cada fila Alta o Media, en qué archivo(s) del corpus (`corpus*/pptx/`) aparece.
7. Totales, los 40 faltantes más importantes con su plan, y fuentes (ver `COMUN.md`).
