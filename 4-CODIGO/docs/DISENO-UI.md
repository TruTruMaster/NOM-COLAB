# NOM-COLAB — Diseño de la interfaz

Equipo 6 "WACK" · CECyT 9 · 5IM7 · octubre 2026

Este documento explica **por qué** la interfaz se ve y se comporta como lo hace.
Cada decisión sale de un principio de psicología cognitiva o de diseño de
interacción, y cada una dice en qué archivo vive.

## 1. Estilo: "arcilla suave" (claymorphism contenido)

**Qué es.** Superficies con volumen suave: esquinas muy redondeadas (16–28 px),
una luz interior arriba, una sombra interior abajo y una sombra exterior
difusa y teñida. Se siente "apretable" y amable.

**Por qué no claymorphism puro.** La investigación sobre los estilos "soft UI"
coincide en un riesgo: cuando el límite de un elemento depende solo de una
sombra sutil, las personas con baja visión, daltonismo o monitores de baja
calidad no distinguen dónde empieza y dónde acaba. Claymorphism es más legible
que neumorphism porque usa rellenos con color y sombras teñidas, pero aun así
las sombras no deben cargar significado por sí solas
([Setproduct](https://www.setproduct.com/blog/neumorphism-design-guide),
[Pixso](https://pixso.net/articles/glassmorphism-vs-neumorphism-vs-claymorphism/),
[LogRocket](https://blog.logrocket.com/ux-design/what-is-claymorphism-web-design/)).

**Decisión.**

| Regla | Dónde |
|---|---|
| La arcilla es solo para **lo que se toca**: tarjetas, botones, hojas, barras. El **lienzo de trabajo es plano** (papel blanco, rejilla, pizarrón con puntos) para no competir con el contenido. | `css/nom.css` (`--clay`), `css/editor.css` (`.papel`, `.plano`) |
| Toda superficie de arcilla lleva además un **borde de 1 px** (`--borde`). La sombra decora; el borde delimita. | `.clay`, `.btn` |
| Contraste de texto medido contra WCAG 2.x AA: tinta 12.8:1, texto secundario 4.9:1, botón principal 5.4:1 (blanco sobre índigo). | tokens `--tinta`, `--tinta-suave`, `--acento` |
| Modo **calidad baja** que apaga las sombras compuestas (hardware mínimo de los requerimientos). | `:root[data-calidad="baja"]`, CU-27 |

## 2. Captar la atención rápido (sin robarla)

| Principio | Qué dice | Cómo se aplica |
|---|---|---|
| **Atributos preatentivos** | El color, la forma y la posición se procesan antes de la atención consciente (≈ 200–250 ms). | Cada modo tiene un color fijo en todo el sistema: Texto azul, Hoja verde, Presentación naranja, Diagrama violeta. Se reconoce el tipo de documento sin leer. `--m-texto`, `--m-hoja`… |
| **Efecto Von Restorff** | Lo que es distinto a su entorno se recuerda y se encuentra primero ([Laws of UX](https://lawsofux.com/)). | Un solo color de acento (índigo) y se usa para **una** acción principal por pantalla: "Entrar", "Nuevo espacio", "Nuevo documento". Todo lo demás es neutro. |
| **Efecto estético-usabilidad** | Lo atractivo se percibe como más fácil de usar y la gente tolera mejor fallas menores ([Laws of UX](https://lawsofux.com/)). | Paleta armónica, una sola tipografía redondeada (Nunito), radios y espaciado en múltiplos de 4/8. |
| **Gestalt: región común y proximidad** | Lo que comparte un contorno se lee como un grupo. | Cada espacio, documento y ajuste es una tarjeta; los controles relacionados van juntos (segmentados de 2–4 opciones). |
| **Efecto Zeigarnik** | Las tareas inconclusas se recuerdan más y la gente quiere cerrarlas. | En Inicio, lo primero es **"Continúa donde lo dejaste"** con los últimos documentos abiertos. `vista-espacios.js · inicio()` |

## 3. Familiar: que no haya que aprender nada nuevo

**Ley de Jakob:** la gente pasa la mayor parte de su tiempo en *otros*
programas y espera que el tuyo funcione igual
([Laws of UX](https://lawsofux.com/)). Por eso cada modo imita al programa que
ya conocen los docentes:

| Modo | Se parece a | Detalles que lo hacen familiar |
|---|---|---|
| Texto | Google Docs / Word | Hoja de papel centrada; Ctrl+B/I/U; Enter crea párrafo; atajos `#`, `-`, `[]`, `>` y menú `/` como en Notion. |
| Hoja | Excel / Sheets | Barra de fórmulas `fx`, letras y números de fila, flechas, Tab, F2, Supr, copiar y pegar; clic en otra celda mientras escribes una fórmula inserta su referencia; funciones en **español y en inglés** (`=SUMA` o `=SUM`). |
| Presentación | PowerPoint / Slides | Miniaturas a la izquierda, diapositiva 16:9 al centro, F5 para presentar, clic o → para avanzar. |
| Diagrama | Miro / draw.io | Pizarrón con puntos, rueda para moverse, Ctrl+rueda o pellizco para zoom, flecha que sale de la figura. |

Atajos universales: Ctrl+Z / Ctrl+Y, Ctrl+S (guarda versión), Esc (cierra),
Supr (borra).

## 4. Decidir rápido y sin cansarse

| Principio | Qué dice | Cómo se aplica |
|---|---|---|
| **Ley de Hick** | El tiempo de decisión crece con el número de opciones ([Laws of UX](https://lawsofux.com/)). | La barra de herramientas muestra **solo las del modo activo**. Opciones raras van a un menú "…". Los segmentados nunca pasan de 4 opciones. |
| **Carga cognitiva / memoria de trabajo** | La memoria de trabajo maneja ≈ 4 bloques a la vez. | Cuatro modos, tres secciones en móvil (Inicio, Unirse, Ajustes), un solo campo obligatorio extra al registrarse. |
| **Divulgación progresiva** | Mostrar lo avanzado solo cuando se necesita. | La dirección manual del servidor está plegada bajo "¿No aparece?"; las funciones de hoja, en un menú. |
| **Ley de Fitts** | Un objetivo grande y cercano se alcanza más rápido. | Objetivos táctiles ≥ 44 px (48 en la barra inferior del editor móvil). En móvil la navegación y las herramientas están **abajo, al alcance del pulgar**, y el botón flotante "+" en la esquina. |
| **Prevención de errores** | Es mejor evitar el error que explicarlo. | Validación al momento con el mensaje junto al campo; medidor de fuerza de contraseña; aviso de Bloq Mayús; confirmación antes de borrar o depurar. |

## 5. Fluido: respuesta y movimiento

| Principio | Qué dice | Cómo se aplica |
|---|---|---|
| **Umbrales de respuesta (Nielsen)** | 0.1 s se siente instantáneo; 1 s es el límite antes de perder el hilo ([SAP Fiori, motion](https://www.sap.com/design-system/fiori-design-web/v1-120/foundations/visual/motion-design)). | Cada cambio se **aplica en local primero** y se envía después (CRDT); escribir nunca espera a la red. Medido: 42 ms entre que un equipo envía y otro recibe. |
| **Umbral de Doherty** | La productividad sube cuando la respuesta baja de ≈ 400 ms ([Laws of UX](https://lawsofux.com/)). | Esqueletos de carga en lugar de pantallas en blanco; si la red tarda más de 2.5 s, el indicador ya dice "Sin conexión" en vez de dejar esperando. |
| **Duración del movimiento** | Microinteracciones ≤ 150 ms; movimientos pequeños 150–250 ms; grandes 250–500 ms ([SAP Fiori](https://www.sap.com/design-system/fiori-design-web/v1-120/foundations/visual/motion-design), [Val Head](https://valhead.com/?p=2978)). | Tokens `--t-micro` 120 ms, `--t-corto` 200 ms, `--t-largo` 280 ms. Curva de salida suave `cubic-bezier(.2,.8,.2,1)`; rebote solo en el interruptor y en los avisos de éxito. |
| **Respeto al movimiento reducido** | Las animaciones pueden marear a algunas personas. | `prefers-reduced-motion` y la preferencia "Reducir movimiento" ponen todas las duraciones en 1 ms. |
| **Regla pico-final** | Se recuerda el momento más intenso y el final. | Al crear cuenta o espacio aparece una palomita animada; al guardar, "Versión N guardada". |

## 6. Un entorno enfocado, sin distracciones

**Lo que dice la investigación.** Cambiar de tarea deja *residuo atencional*:
parte de la mente se queda en lo anterior, sobre todo si quedó incompleto
(Leroy, 2009). Tras una interrupción, la gente tarda en volver a la tarea
original y suele pasar por otras dos antes; el número exacto de minutos está en
discusión entre fuentes, pero el costo en estrés y esfuerzo sí se repite
([resumen 1](https://blog.saner.ai/context-switching-statistics/),
[resumen 2](https://concepts.dsebastien.net/concept/task-switching-cost/)).
NOM-COLAB nació justo para quitar el cambio entre programas.

| Decisión | Dónde |
|---|---|
| **Un tipo por documento** (cambio oct. 2026): el tipo se elige al crear y queda a la vista junto al nombre; no se puede cambiar para no romper el formato. Las tablas de un texto se editan ahí mismo. | `editor.js` (etiqueta `.ed-tipo`) · `modo-texto.js` (tablas) |
| **Nadie te cambia la pantalla.** Si un compañero cambia el modo del documento, solo aparece un aviso con "Ir"; tú decides. | `editor.js · alCambiar` |
| **Modo enfoque** (Ctrl+.): oculta barras, pasa a pantalla completa y atenúa todo menos el párrafo que escribes. | `.editor.enfoque.atenuar` |
| Avisos **abajo, sin sonido, sin bloquear**, máximo 3, se van solos. Nunca hay ventanas emergentes por algo que no pediste. | `nucleo.js · aviso` |
| La presencia de otros se ve **en el borde del bloque** que editan (color + nombre), no como notificación. | `editor.js · pintarPresencia` |
| Longitud de línea de 50–75 caracteres (`max-width: 70ch`): la lectura más cómoda. | `.b-texto` |
| El editor de texto en escritorio se abre **ya con el cursor puesto** en el primer párrafo vacío. | `modo-texto.js` |

## 7. Micro-textos (CU-22)

Todo ícono tiene un micro-texto: **título + qué hace + atajo**. Aparece al dejar
el cursor 350 ms (para no parpadear al pasar), o con una **pulsación prolongada
de 450 ms** en pantalla táctil (con una vibración corta). Tras la pulsación
prolongada no se ejecuta la acción, así explorar nunca causa un cambio.
`nucleo.js · micro-textos`, atributo `data-micro="Título|explicación|atajo"`.

## 8. Escritorio y móvil, una sola interfaz

| | Navegador (escritorio) | Móvil (navegador o app Android) |
|---|---|---|
| Navegación | Riel lateral con tus espacios | Barra superior + pestañas abajo + botón "+" |
| Hojas (modales) | Centradas | Suben desde abajo, con agarradera |
| Herramientas del editor | Arriba | **Abajo**, sobre el teclado (la app usa `adjustResize`) |
| Selector de modo | En la barra, al centro | Fila propia; solo el modo activo muestra su nombre |
| Diapositivas | Miniaturas a la izquierda | Tira horizontal abajo |

La app Android (`android/`) empaqueta **los mismos archivos** de la interfaz
web: no hay dos interfaces que mantener. Solo agrega lo que un navegador no
puede hacer: escuchar el anuncio UDP de la red, guardar en Descargas y abrir el
selector de archivos.

## 9. Accesibilidad

- Foco visible en todo (anillo de 2 px del color de acento con separación).
- Navegación completa con teclado: Tab en hojas atrapa el foco; flechas en menús.
- `aria-label` en todos los botones de ícono; `role="status"` en el indicador de sincronización.
- Tema claro, oscuro o automático (sigue al sistema).
- Campos de 16 px para que iOS no haga zoom al escribir.

## 10. Texto como en Word (y en tiempo real como Google Docs)

| Decisión | Por qué | Dónde |
|---|---|---|
| **Una sola hoja editable** con páginas reales (Carta, A4, Oficio; vertical u horizontal; márgenes de Word), en vez de un cuadro por párrafo. | Es el modelo mental de Word: seleccionar varios párrafos, arrastrar, pegar o borrar a través de párrafos funciona como siempre. | `modo-texto.js` |
| Estilos con los nombres y medidas de Word: Normal (Calibri 11, interlineado 1.15, 8 pt después), Título, Subtítulo, Título 1-3, Cita, Código. | Familiaridad (ley de Jakob) y exportar a .docx con estilos **reales** de Word: el panel de navegación y el índice de Word los reconocen. | `modo-texto.js`, `ooxml.js` |
| Barra de herramientas en el orden de Google Docs: estilo · fuente · tamaño · B I U S · color · resaltado · enlace · alinear · interlineado · listas · sangría · insertar · copiar formato. | Lo que más se usa, a un clic; lo demás en "Más" e "Insertar" (ley de Hick). | `modo-texto.js` |
| **Minibarra al seleccionar** (como la de Word) y atajos de Word/Docs: Ctrl+B/I/U, Ctrl+Mayús+L/E/R/J, Ctrl+Alt+1/2/3, Ctrl+Mayús+7/8/9, Ctrl+K, Ctrl+Enter, Mayús+F3… | Las manos no dejan el teclado; quien viene de Word no aprende nada nuevo. | `modo-texto.js · dialogoAtajos` |
| Atajos al escribir: `# `, `## `, `- `, `1. `, `[] `, `> ` al inicio del párrafo. | Autoformato como el de Word y Notion. | `atajosMarkdown` |
| **Cursores de los demás** con su nombre y color, y su selección sombreada. | Se ve dónde escribe cada quien antes de chocar (Google Docs). | `pintarCursores` |
| Deshacer por palabra; Enter, pegar o mover el cursor empiezan un paso nuevo. Solo deshace **tus** cambios. | Como Word; deshacer nunca borra lo que escribió otra persona. | `crdt.js · _inversoSeq` |
| Barra de estado con página actual, conteo de palabras (también de la selección), vista con o sin páginas y zoom. | Información siempre a la vista, sin abrir diálogos. | `pintarEstado` |

## 11. Ruedita de acciones (menú radial)

Inspirada en las ruedas de "ping" de los juegos (Apex Legends, League of Legends,
la rueda de comunicación de Overwatch): **se mantiene presionado** (clic derecho, o clic
izquierdo / dedo quieto ~0.45 s) y aparece un anillo de 8 acciones alrededor del puntero.
Se elige **por dirección**: basta mover hacia la acción y soltar.

| Principio | Qué dice la investigación | Cómo se aplica |
|---|---|---|
| Menús circulares (pie menus) | Callahan, Hopkins, Weiser y Shneiderman (CHI 1988): elegir en un menú circular es más rápido y con menos errores que en uno en lista, porque todas las opciones quedan a la misma distancia del puntero. | 8 sectores iguales; el puntero empieza en el centro. |
| Ley de Fitts | El tiempo para alcanzar un objetivo depende de la distancia y el tamaño. | Cada sector es una cuña que crece hacia afuera: el objetivo es "infinito" en su dirección. |
| Menús de marcas (marking menus) | Kurtenbach y Buxton (CHI 1993/1994): con práctica la gente elige por el gesto, sin mirar el menú. | Las acciones están siempre en la misma posición (Negrita arriba, Cursiva arriba-derecha…). |
| Zona muerta y cancelar | Soltar sin moverse no debe ejecutar nada. | Soltar en el centro cancela; un clic derecho rápido deja la rueda abierta para elegir con clic. |
| Submenús | Mantener la rueda corta (8 máximo). | "Color", "Resaltar", "Estilo" y "Más" abren una segunda rueda en el mismo lugar. |
| Accesibilidad | Debe poder usarse sin ratón. | Tecla Menú o Mayús+F10 la abre en el cursor; flechas, 1-8 y Enter para elegir; Esc cierra. Mayús+clic derecho deja el menú normal del navegador (corrector ortográfico). |

En el texto ofrece: negrita, cursiva, subrayado, color, resaltar, estilo, enlace y más
(copiar, cortar, pegar, copiar formato…); sobre una imagen: tamaño, centrar y eliminar.
En presentaciones y diagramas: duplicar, bloquear, color, al frente, eliminar, al fondo,
girar y agrupar; en el fondo vacío: crear figuras, texto, imagen o pegar. `rueda.js`.

## 12. Figuras como en Canva

| Función | Cómo se usa |
|---|---|
| Más de 20 figuras (galería con vista previa real) | Botón "Figuras": rectángulo, elipse, rombo, triángulos, pentágono, hexágono, octágono, estrella, corazón, nube, globo de diálogo, flechas, chevrón, cruz, paralelogramo, trapecio, cilindro, documento, nota, líneas. |
| **Barra contextual** sobre la selección | Relleno (o sin relleno), borde (color, grosor, sólido/guiones/puntos), texto (tamaño, color, negrita, alineación, fuente), transparencia, esquinas redondeadas, sombra, posición, girar, voltear, agrupar, bloquear, duplicar, eliminar. |
| Girar | Tirador redondo debajo de la figura; Mayús gira de 15° en 15° y se "pega" a 0°, 90°, 180° y 270°. |
| Cambiar tamaño | 8 tiradores; funcionan aunque la figura esté girada (la esquina opuesta se queda fija). Mayús conserva la proporción. |
| **Guías inteligentes** | Al mover, la selección se alinea sola con los bordes y centros de las demás figuras (y con el centro de la diapositiva); se ven líneas rosas. Alt para mover libre. |
| Selección múltiple | Recuadro arrastrando en el fondo, Mayús+clic, Ctrl+A. |
| Agrupar, alinear y distribuir | Ctrl+G / Ctrl+Mayús+G; alinear a la izquierda/centro/derecha/arriba/medio/abajo; distribuir con espacios iguales. |
| Orden y bloqueo | Ctrl+] / Ctrl+[ (Mayús: al frente / al fondo); bloquear evita moverlo por accidente. |
| Copiar y pegar | Ctrl+C / Ctrl+V entre diapositivas y entre pestañas; Ctrl+D duplica. |

Todo se exporta a PowerPoint con geometrías **nativas** (`star5`, `heart`, `cloud`,
`rightArrow`, `can`…), giro, volteo, borde, transparencia y sombra: se ve igual en
PowerPoint, Google Slides o LibreOffice.

## Fuentes

- Laws of UX (Jakob, Hick, Fitts, Doherty, Von Restorff, estético-usabilidad): https://lawsofux.com/
- SAP Fiori — Motion design (umbrales de 0.1 s y 1 s, duraciones por tamaño): https://www.sap.com/design-system/fiori-design-web/v1-120/foundations/visual/motion-design
- Val Head — How fast should your UI animations be?: https://valhead.com/?p=2978
- Setproduct — Dónde falla neumorphism (contraste): https://www.setproduct.com/blog/neumorphism-design-guide
- Pixso — Glassmorphism vs neumorphism vs claymorphism: https://pixso.net/articles/glassmorphism-vs-neumorphism-vs-claymorphism/
- LogRocket — What is claymorphism: https://blog.logrocket.com/ux-design/what-is-claymorphism-web-design/
- Costo del cambio de tarea y residuo atencional (Leroy 2009; Mark, Gudith y Klocke 2008): https://blog.saner.ai/context-switching-statistics/ · https://concepts.dsebastien.net/concept/task-switching-cost/
- Callahan, Hopkins, Weiser y Shneiderman — *An empirical comparison of pie vs. linear menus* (CHI 1988).
- Kurtenbach y Buxton — *The limits of expert performance using hierarchic marking menus* (CHI 1993) y *User learning and performance with marking menus* (CHI 1994).
- Roh, Jeon, Kim y Lee — *Replicated abstract data types: Building blocks for collaborative applications* (JPDC, 2011): el algoritmo RGA.
- Ink & Switch — *Peritext: A CRDT for rich-text collaboration*: https://www.inkandswitch.com/peritext/
