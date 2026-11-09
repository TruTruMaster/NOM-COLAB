# Plan de construcción de NOM-COLAB

Qué construir, en qué orden y cómo comprobar que quedó. Sale de `PENDIENTES.md` (secciones 1 a 5,
revisión e investigación del 7 de noviembre de 2026). Se trabaja **una fase a la vez**: al terminar
cada tarea se marca `[x]` aquí y en `PENDIENTES.md`.

Idea que guía todo: **"Colabora donde no hay internet"**. Primero va lo que nadie más tiene; lo
demás después.

---

## 0. Reglas para cada tarea

1. **Antes de escribir código**, leer los archivos que la tarea indica. Las rutas y líneas de este
   plan son del 7-nov-2026 y pueden haberse movido.
2. **Toda ruta nueva del servidor va en dos lugares**: Spring (`app/.../servidor/api/*Api.java`) y
   el servidor del teléfono (`android/app/src/main/java/mx/wack/nom/android/anfitrion/`, la clase
   que replica las rutas, `ApiTelefono`). Si no, en el celular-servidor la función no existe.
3. **La lógica va en `nucleo/`** (Java sin frameworks), para que la usen Spring y Android por igual.
4. **Se prueba en local (puerto 8099), no en Azure.** Para editar CSS/JS sin recompilar:
   `SPRING_WEB_RESOURCES_STATIC_LOCATIONS=file:<repo>/4-CODIGO/app/src/main/resources/static/`.
5. **Si cambia algo de la interfaz**, recompilar el APK y subir `versionName`/`versionCode` en
   `android/app/build.gradle.kts` (hoy 0.10.0 / 12).
6. **Pruebas**: agregar casos a `pruebas/seguridad.py` cuando la tarea toque permisos (hoy 76/76;
   tienen que seguir pasando).
7. **Commits**: en español, a nombre de trutrumaster, sin menciones a quien ayudó a escribirlos
   (ver las reglas del proyecto). No subir `py.py`, `research_notes/` ni `reports/`.
8. **Interfaz**: todo texto visible en español; las acciones nuevas también van en la ruedita
   (`rueda.js`, orden fijo de casillas) y en la paleta de comandos (`experiencia.js`).
9. **Paridad celular, web y app (obligatoria en cada tarea).** Una tarea no está terminada hasta
   que funciona igual en estas 4 situaciones:
   - **Web en computadora**: mouse y teclado.
   - **Navegador del celular**: toque y pantalla chica, mínimo 360 px de ancho.
   - **App Android**: el WebView; se prueba en el A55 real.
   - **Teléfono como servidor**: `ApiTelefono`, con otra persona conectada.

   Puntos a cuidar:
   - Toda acción que en la computadora va con atajo o clic derecho tiene que poder hacerse con el
     dedo, en la ruedita (mantener presionado).
   - Nada depende de pasar el mouse por encima (hover).
   - Las API del navegador que a veces no existen (`EyeDropper`, `BarcodeDetector`, la cámara,
     las descargas) llevan una alternativa. Para el WebView, revisar cómo `MainActivity` maneja ya
     las descargas de .docx/.xlsx/.pptx y usar lo mismo.
   - En la app, el menú nativo de Cortar/Copiar está oculto (`MainActivity.Hoja`), así que pegar
     y cortar pasan por la ruedita (`pegarPortapapeles` en `modo-texto.js`).

   Cada "Listo cuando" se revisa en las cuatro.

---

## Fase 1. Cosas rápidas que se notan (1 a 2 días)

Pocas líneas cada una; sirven para calentar con el código.

- [x] **1.1 Pegar un enlace sobre texto seleccionado lo convierte en vínculo.**
  - Dónde: `modo-texto.js`, manejador `paste` (cerca de la línea 1384).
  - Cómo: si hay selección no vacía y el portapapeles trae solo un URL (`^https?://\S+$`), aplicar
    el formato de enlace a la selección en vez de reemplazar el texto. Hacerlo también en el lienzo
    cuando se edita un texto.
  - Celular y app: aplicar la misma regla en `pegarPortapapeles` (el "Pegar" de la ruedita), no
    solo en el evento `paste`.
  - Listo cuando: seleccionar "aquí", pegar `https://ipn.mx` y queda "aquí" como enlace, tanto con
    Ctrl+V como con la ruedita en el A55; con deshacer se quita en un paso.
- [x] **1.2 Proteger documentos contra el borrado.**
  - Dónde: `nucleo/.../modelo/Documento.java` (campo nuevo `protegido`),
    `ServicioDocumentos.eliminar()` (línea ~292), `DocumentosApi` y `ApiTelefono`, y la vista de
    espacios (`vista-espacios.js`).
  - Cómo: solo el PROPIETARIO pone o quita la marca. Si está protegido, `eliminar` responde un
    error claro ("Quita la protección para borrarlo"). Al quitarla, pedir que escriba `BORRAR`.
  - Listo cuando: un editor no puede borrar ni quitar la marca (agregar la prueba en
    `seguridad.py`).
- [x] **1.3 Lienzo: girar 90° en un clic y cuentagotas de color.**
  - Dónde: `lienzo.js` (el campo `rot` ya existe), ruedita y barra.
  - Girar 90° también va en la ruedita, para hacerlo con el dedo.
  - Cuentagotas: `EyeDropper` solo existe en Chrome de computadora. En el celular y en la app, la
    alternativa es tocar otra figura para copiar su color; esa misma alternativa sirve en todos.
- [x] **1.4 Formato por defecto del espacio.**
  - Dónde: `Espacio.java` (campo `formatoBase`: fuente, tamaño, interlineado) y `modo-texto.js`
    (estilo inicial al crear un documento de texto en ese espacio).
  - Cómo: el dueño del espacio lo fija ("Times New Roman 12, doble espacio"). Los documentos nuevos
    lo heredan.

## Fase 2. Unirse sin internet (lo más importante de la lista)

- [x] **2.1 Unirse con código QR.** El equipo que comparte (Spring en la laptop o
  `ServicioAnfitrion` en el teléfono) muestra un QR con `http://<ip-local>:<puerto>/unirse?c=<código>`.
  - Dónde: `anfitrion.js` (panel en "Este dispositivo"), `vista-dispositivo.js`, `RedApi`.
  - El QR se genera **en el navegador sin internet**: meter una librería pequeña de QR en
    `static/js/` (no CDN), con su licencia anotada.
  - Para leerlo, la cámara del sistema basta: abre el enlace en el navegador. En la app, poner un
    botón "Escanear QR" que pida permiso de cámara (`BarcodeDetector` en el WebView o el escáner
    de Android) y abra el espacio dentro de la app, no en Chrome. Si no hay cámara, escribir el
    código a mano.
  - El QR se ve en los dos sentidos: lo muestra el teléfono-servidor (app) y también la laptop
    (web).
  - Listo cuando: con el teléfono como servidor y el internet apagado, otra persona escanea y queda
    dentro del espacio.
- [x] **2.2 Entrar con apodo, sin registrarse** (modo salón, parte 1). Una cuenta de invitado ligada
  al espacio y a ese dispositivo. Solo puede editar lo que el dueño permita. Revisar
  `ServicioCuentas` y `FiltroSesion`.
- [x] **2.3 Enlaces para unirse que caducan y se pueden revocar** (`/unirse`), ya en PENDIENTES 3.

## Fase 3. Autoría y trabajo en equipo (lo que nos distingue)

Base que ya existe: `ServicioDocumentos.anotar()` (línea ~187) junta "rachas" de actividad de 60 s
por usuario (`usuarioId`, `operaciones`, `bloques`, `escritas`, `borradas`, dispositivo) y las guarda
con `repo.anotarActividad`; `actividad()` devuelve las últimas 300. Las versiones (`Version`, `foto`)
guardan fotos del documento.

- [x] **3.1 Contar lo tecleado y lo pegado.**
  - Cliente (`modo-texto.js`, `crdt.js`): marcar las operaciones que vienen de pegar (Ctrl+V,
    "Pegar" de la ruedita y pegar desde el teclado del celular, que llega como `insertFromPaste`
    en `beforeinput`), con un campo
    opcional en la operación o en la petición, por ejemplo `origen: "pegado"`.
  - Servidor: en la racha, sumar `tecleadas` y `pegadas` (caracteres) y guardar cada pegado mayor de
    40 caracteres con hora y tamaño, **sin el texto pegado**.
- [x] **3.2 Recibo de proceso de escritura** (sección 5.1 de PENDIENTES).
  - Ruta: `GET /api/documentos/{id}/recibo?usuario=<id>`. El alumno ve su propio recibo; el dueño
    del espacio ve el de todos.
  - Contenido: sesiones (inicio, fin, minutos activos, dispositivo), letras tecleadas contra
    pegadas, lista de pegados grandes, número de versiones y un **hash SHA-256** del JSON canónico
    (en el `nucleo`, sin librerías).
  - Interfaz: botón "Recibo de mi trabajo" en el historial. Se ve como página imprimible (PDF desde
    el navegador) y se descarga en JSON. En la app no hay "imprimir" del navegador: generar el
    PDF o usar `PrintManager` desde `MainActivity`, y que la descarga del JSON llegue a Descargas.
  - Verificar: `POST /api/recibos/verificar` con el JSON responde si el hash coincide con lo que
    guarda el servidor.
  - Fase 3.2b, después: repetición del tecleo, avanzando entre fotos de versiones.
- [x] **3.3 Mapa de aportes** (PENDIENTES 4): barra por autor con su color, usando las mismas
  rachas.
- [x] **3.4 "Qué cambió desde tu última visita".**
  - Guardar por usuario y documento el reloj (`est.reloj`) de la última vez que lo abrió.
  - Al abrir, si hay cambios de otros, mostrar un aviso "Cambios de Ana y Luis desde el martes" y
    resaltar los bloques tocados (las rachas traen `bloques`), con un botón para quitar el resaltado.
- [x] **3.5 Bloquear secciones por persona.**
  - Bloque de texto, diapositiva o figura con campo `dueno` (id de usuario). En
    `ServicioDocumentos.aplicar()`, rechazar las operaciones de otros sobre ese bloque (el dueño del
    espacio siempre puede).
  - Ojo: el texto letra por letra va en `Secuencia`. Primero ver cómo se asigna un párrafo a un
    bloque antes de decidir el alcance (párrafo, sección entre títulos o diapositiva).
  - Interfaz: "Asignar a…" en la ruedita y el nombre del dueño en el margen.
  - Pruebas en `seguridad.py`: un editor no puede escribir en el bloque de otro.
- [x] **3.6 Entrega de tareas con fecha límite** (PENDIENTES 4). Al pasar la fecha el documento
  queda en LECTURA para el alumno, y el recibo 3.2 se adjunta solo.

## Fase 4. Hojas

- [x] **4.1 Filtro y orden personales por defecto** (PENDIENTES 5.4).
  - Dónde: `modo-hoja.js`. El filtro y el orden se guardan **solo en el cliente** (localStorage con
    la clave `nom.u.<id>.filtro.<doc>`), nunca en el CRDT. Se pinta una vista ordenada de las
    filas; las ediciones siguen yendo a la celda real.
  - Mostrar el aviso "Ves 12 de 40 filas (filtro solo tuyo)". El botón "Aplicar a todos" solo
    aparece para EDICION o más.
  - Celular: el filtro se abre al mantener presionado el encabezado de la columna (ruedita), no
    con un menú que dependa del mouse.
  - Listo cuando: una persona filtra en el A55 y otra, en la computadora, sigue viendo todo (y al
    revés); editar una celda filtrada cambia la fila correcta.
- [x] **4.2 Fórmulas que faltan** (BUSCARV, CONTAR.SI, SUMAR.SI, HOY, FECHA, DIAS) en `formulas.js`,
  en español e inglés.
- [x] **4.3 Fijar filas y columnas, y gráficas** (PENDIENTES 2).

## Fase 5. Lienzo y presentaciones (estilo Canva)

Base: `lienzo.js` ya tiene los campos `bloqueado` y `grupo` (un solo nivel; ver la línea ~349).

- [x] **5.1 Mesa de trabajo fuera de la página**: zona gris alrededor donde se pueden dejar
  figuras. Lo que quede fuera del rectángulo de la página no se exporta (`ooxml.js`, PDF) ni se
  presenta. En el celular hay que poder alejar con dos dedos para verla y arrastrar figuras hacia
  ella.
- [x] **5.2 Grupos dentro de grupos**: cambiar `grupo` por una lista de ancestros o un `padre`.
  "Desagrupar" quita solo el nivel de arriba. Mantener compatibles los documentos viejos (un
  `grupo` de texto equivale a un solo nivel).
- [x] **5.3 Panel de capas**: lista de figuras con ojo (ocultar), candado (`bloqueado`) y orden
  arrastrable. En el celular va como hoja que sube desde abajo.
- [x] **5.4 Plantilla con candado de maestro**: figuras con `bloqueado` que solo puede quitar el
  dueño del espacio (validarlo en el servidor, como en 3.5).
- [x] **5.5 Modo presentador** con notas y transiciones, y presentar desde el teléfono a un
  proyector conectado a otro navegador (PENDIENTES 2).

## Fase 6. Sin internet de verdad

- [x] **6.1 Service worker (PWA)**: guardar en caché `static/` para que quien entró por el navegador
  la siga viendo aunque se caiga la red.
- [x] **6.2 Cola de cambios sin conexión**: guardar las operaciones en IndexedDB y mandarlas al
  volver (el CRDT ya junta los cambios repetidos sin problema porque cada operación tiene id).
- [x] **6.3 Resumen al reconectar**: después de mandar la cola, comparar qué bloques que tú tocaste
  cambiaron también otros mientras no estabas, y avisarlo ("Ana borró el párrafo 3 mientras lo
  editabas").
- [x] **6.4 Respaldo automático en el teléfono servidor**: copia diaria de `filesDir/servidor` con
  las últimas 7, y botón "Exportar todo" (junto con el .zip de Office de PENDIENTES 4).
- [x] **6.5 Sincronizar entre servidores** (teléfono del salón con Azure o el servidor propio).
  Es lo más grande de la lista: hacerlo al final.

## Fase 7. Comentarios, solidez y lo demás

- [x] Comentarios y sugerencias, que funcionen igual en la red del salón sin internet (PENDIENTES
  2 y 5.1).
- [x] Buscar y reemplazar en texto y hojas.
- [x] Revisar el deshacer: `crdt.js` ya tiene `deshacerPila` (solo los cambios propios). Confirmar
  que funcione en los 4 editores antes de rehacerlo.
- [x] Almacenamiento atómico con respaldos rotativos (`AlmacenJson`), cuota por usuario y
  recuperar la contraseña (PENDIENTES 3).

## Fase 8. Lo que tienen Word, Excel, PowerPoint y Canva (revisión del 8 de noviembre de 2026)

Sale de comparar los cuatro editores con los programas reales. Primero lo que más se nota.

### 8.0 Base
- [x] Partir los cambios de más de 380 campos en varias operaciones (el servidor descarta las de
  más de 400 sin avisar: hoy "Ordenar para todos" y la importación de un CSV grande se pierden).
- [x] Operaciones de reacomodo (`m.o = "r"`: insertar o borrar filas, ordenar) que la bitácora no
  cuente como tecleado, y citas con fuente (`m.o = "c"`) que cuenten aparte en el recibo.

### 8.1 Hoja
- [x] Referencias `$A$1`, `$A1`, `A$1`, a otra hoja (`Hoja2!A1`, `'Mi hoja'!A1`) y a columnas o
  filas enteras (`A:A`, `1:1`).
- [x] Copiar y pegar fórmulas ajusta las referencias relativas; Ctrl+D y Ctrl+R; cuadrito de
  relleno para arrastrar (series de números, fechas, días, meses y "Tema 1, Tema 2").
- [x] Insertar y eliminar filas y columnas en cualquier lugar, ajustando fórmulas, formatos,
  gráficas, filas fijas y comentarios.
- [x] Formato de celda: número (decimales, moneda, porcentaje, fecha, texto), relleno, bordes,
  alineación, ajustar texto, combinar celdas y tamaño de letra.
- [x] Ancho de columna y alto de fila (arrastrar el borde; doble clic ajusta; en el celular desde
  la ruedita).
- [x] Funciones que faltan (PROMEDIO.SI, CONTAR.SI.CONJUNTO, SUMAR.SI.CONJUNTO, MEDIANA, MODA,
  DESVEST, JERARQUIA, IZQUIERDA, DERECHA, EXTRAE, AÑO, MES, DIA, AHORA, BUSCARX, INDICE,
  COINCIDIR, SI.CONJUNTO, TEXTO y más), en español e inglés.
- [x] Sugerir la función al escribir `=PRO` y mostrar qué datos pide.
- [x] Hojas: cambiar nombre, eliminar, mover y duplicar.
- [x] Formato condicional (por ejemplo, en rojo si es menor que 6) y lista desplegable.
- [x] Gráficas: barras horizontales, dispersión y área; títulos de los ejes y colores.
- [x] Exportar a .xlsx todo lo nuevo e **importar .xlsx**.

### 8.2 Texto
- [x] Párrafo: sangría de primera línea y francesa, sangrías en cm, espacio antes y después.
- [x] Encabezado y pie: lugar del número de página (arriba o abajo, izquierda, centro o derecha),
  "Página 1 de 5", primera página distinta y la misma letra del documento.
- [x] Márgenes personalizados en cm.
- [x] Listas: continuar la numeración, empezar en un número, y estilos de viñeta y número.
- [x] Tablas: insertar y eliminar filas y columnas en cualquier lugar, combinar celdas, formato
  por celda (negrita, cursiva, color, relleno, alineación), bordes, fila de encabezado y ancho de
  columnas.
- [x] Imágenes: recortar, girar, pie de imagen numerado ("Figura 1."), texto alternativo y texto
  alrededor.
- [x] Notas al pie.
- [x] Ecuaciones.
- [x] Un párrafo largo se parte entre dos páginas en vez de saltar completo.
- [x] Marca de agua y columnas (columnas lado a lado como bloque, en Insertar; no es texto que corre de
  una columna a otra como en un periódico).

### 8.3 Presentación
- [x] Texto con formato dentro de los cuadros y figuras (negrita en una palabra, viñetas y
  numeración, tamaño y color por parte).
- [x] Fondo de diapositiva (color, degradado o imagen), temas y diseños de diapositiva.
- [x] Insertar tabla y gráfica en la diapositiva.
- [x] Tamaño de diapositiva: 16:9, 4:3, carta vertical y horizontal, cartel.
- [x] Animaciones: entrada, énfasis y salida; orden que elige la persona; al hacer clic, con la
  anterior o después; retraso y duración.
- [x] Imágenes: recortar, foto dentro de una figura y filtros; los GIF se conservan.
- [x] Elementos: íconos para insertar (sin internet).
- [x] Exportar cada diapositiva como imagen (PNG).
- [x] Puntero láser y pluma al presentar (también en la pantalla del proyector).
- [x] Exportar a .pptx lo nuevo (fondos, texto con formato, tablas, notas) e **importar .pptx**.

### 8.4 Diagrama
- [x] Flechas con texto, color, grosor, estilo, puntas y forma (recta, codo, curva).
- [x] Figuras UML y entidad-relación (clase, actor, caso de uso, entidad, relación…).
- [x] Cuadrícula con ajuste.
- [x] Diagramas precargados (ciclo, línea del tiempo, organigrama, mapa mental, Venn, espina de
  pescado, FODA, mapa conceptual, clases, casos de uso y entidad-relación).

### 8.5 Afuera de los editores
- [x] Papelera de 30 días: borrar manda a la papelera; restaurar o borrar para siempre.
- [x] Hacer una copia, mover a otro espacio y cambiar el nombre desde la lista.
- [x] Carpetas dentro del espacio, ordenar por nombre, fecha o tipo, y destacados.
- [x] Buscar dentro del contenido de los documentos.
- [x] Guardar un documento como plantilla del espacio, y plantillas escolares nuevas.
- [x] `@menciones` en los comentarios, con aviso a esa persona.
- [x] Enlace para ver un solo documento sin entrar al espacio (se puede revocar).

## Fase 9. Generar sin IA (la app organiza y cita; la persona escribe)

- [x] Fuentes y citas: formulario (libro, artículo, página web, video…), autollenado por DOI,
  ISBN o dirección web, cita "(Autor, año)" en el texto y lista de referencias en APA con sangría
  francesa.
- [x] Recibo: columna "citado con fuente" junto a tecleado y pegado.
- [x] Panel Investigar: Wikipedia en español, libros y artículos; fichas de trabajo (textual,
  paráfrasis y resumen) con su referencia.
- [x] Armar reporte: portada, índice, secciones con preguntas guía, fichas en su sección y
  bibliografía.
- [x] Biblioteca del espacio: fuentes guardadas en el servidor para investigar sin internet.
- [x] Ruta del servidor que lee los datos de una dirección web, con protección (no lee la red
  local, ni `localhost`, ni los datos internos de la nube) y sus pruebas en `seguridad.py`.
- [x] Datos → reporte: de una hoja o un CSV/XLSX, un documento con resumen, frecuencias y
  gráficas (por ejemplo, una encuesta de Google Forms).
- [x] Combinar correspondencia: plantilla con `{{campos}}` + hoja = un documento por fila.
- [x] Documento → presentación y documento → mapa mental.
- [x] Texto → diagrama (flujo, organigrama, mapa mental, línea del tiempo y ciclo) con acomodo
  automático.
- [x] Tablas de datos públicos desde Wikidata (experimento).

---

## Cómo quedó (8 de noviembre de 2026)

Las fases 8 y 9 están construidas en Spring, en el servidor del teléfono (`ApiTelefono`) y en la
página; el APK (0.11.0) y el jar de `2-PAGINA-Servidor/` llevan todo.

**Probado en local** (puerto 8099, computadora y ancho de celular, sin errores en la consola):
- Presentaciones: tema, diseños, texto con formato por partes, tabla, gráfica, ícono, imagen
  recortada en forma de círculo y en blanco y negro, animaciones por pasos, láser y pluma (también
  en el proyector), tamaño 4:3, PNG de la diapositiva. Exportar a .pptx (python-pptx y LibreOffice
  lo abren) e importar .pptx propios y de otros programas (marcadores, viñetas, grupos, imagen,
  tabla, gráfica, fondo y notas).
- Diagramas: 13 diagramas listos, flechas recta, en codo y curva con texto, cardinalidad y puntas
  de herencia o composición, figuras UML y entidad-relación, íconos de redes, cuadrícula con ajuste,
  texto a diagrama (flujo con decisiones, ciclo, línea del tiempo, organigrama, mapas), exportar a
  SVG, PNG y .pptx (las figuras nuevas van como forma libre).
- Afuera de los editores: papelera de 30 días (restaurar, borrar para siempre, vaciar), copiar,
  mover a otro espacio, renombrar, carpetas (arrastrando la tarjeta), destacados, orden, buscar
  dentro del contenido, plantillas del espacio y escolares, @menciones con aviso y enlace para ver
  un documento sin cuenta (con su QR; el propietario lo quita).
- Generar sin IA: buscar en Wikipedia, Open Library y Crossref, leer, hacer fichas (textual,
  paráfrasis, resumen), fuentes llenadas por DOI, ISBN o dirección web, citas "(Autor, año, p. x)",
  referencias en APA con cursivas y sangría francesa, armar reporte con portada, índice y fichas,
  biblioteca del espacio para leer sin Internet, reporte de una encuesta (hoja, CSV o Excel) con
  tablas y gráficas, combinar correspondencia, documento a presentación (con notas) y a mapa
  mental, datos públicos de Wikidata. El recibo ya separa lo "citado con su fuente".
- `pruebas/seguridad.py`: 168 de 168 (nuevas: papelera, copias, mover, carpetas, búsqueda,
  menciones, enlace para ver, biblioteca y 20 pruebas de que leer una dirección web nunca toca
  `localhost`, la red del salón ni los datos internos de la nube).

**Arreglos de seguridad de esta sesión**: el dibujo de los íconos y los colores que vienen del
documento ya no pueden meter código en la página (se limpian antes de pintarlos).

**Antes de subir a Azure**: lo de esta sesión no cambia la base de datos (todo va en los archivos
JSON del servidor; la biblioteca de cada espacio en `biblioteca/<espacio>.json`). El servidor
necesita salida a Internet para Investigar y Wikidata (Azure la tiene). Sigue pendiente lo de la
sesión anterior: `./desplegar.sh roles` para las columnas nuevas de usuarios.

**Limitaciones conocidas**:
- El service worker solo existe en https o en localhost (en `http://<ip-del-salón>` ayuda la app).
- Al importar .pptx, los videos y el SmartArt no se traen (se avisa); las formas libres llegan como
  rectángulos.
- Investigar necesita Internet en el servidor; sin Internet queda la biblioteca del espacio.
- La copia de trabajo `~/NOM-COLAB` no se actualizó en esta sesión (es más vieja que `~/NOM`).

## Orden recomendado para la siguiente sesión

1. Probar en el A55: la app 0.11.0, el teléfono como servidor con otra persona, el QR con la cámara
   y Investigar con los datos del teléfono.
2. Revisión de facilidad de uso de lo nuevo (menús Insertar, Investigar, papelera y carpetas) con
   alguien que no conozca la app, de cualquier edad.
3. Subir a Azure (después de `./desplegar.sh roles`) y probar Investigar desde la nube.
4. Lo que quedó fuera en `PENDIENTES.md` (incrustar una hoja en una presentación, línea de tiempo
   de animaciones, recuperar lo cortado en el celular).

Al cerrar cada sesión: marcar las casillas, compilar (jar y APK si hubo cambios de interfaz),
probar en local y hacer el commit con un mensaje en español.

---

## Antes: cómo quedó el 7 de noviembre de 2026


Las 7 fases están construidas en Spring, en el servidor del teléfono (`ApiTelefono`) y en la página.

**Probado en local** (servidor en el puerto 8099, navegador de computadora y ancho de celular):
- Texto: pegar un enlace sobre "aquí" (y deshacerlo en un paso), conteo de tecleado contra pegado,
  recibo con huella SHA-256 y su verificación, mapa de aportes, formato del espacio (Times New Roman
  12 a doble espacio).
- Unirse: invitar con QR, entrar con apodo sin cuenta, escribir el código a mano, revocar el código;
  un invitado no puede crear espacios.
- Hojas: BUSCARV, CONTAR.SI, SUMAR.SI, HOY, FECHA, DIAS (y en inglés); filtro y orden solo tuyos,
  "Aplicar a todos" y "Quitar para todos"; fijar la fila 1; gráfica que se actualiza sola; buscar y
  reemplazar con deshacer de un paso.
- Presentaciones: grupos dentro de grupos (tocar entra un nivel; desagrupar quita solo el de
  arriba), capas (ocultar, bloquear), cuentagotas, notas, modo presentador y pantalla del
  proyector (también abriendo `/proyectar` sin código).
- Comentarios con respuestas y "resuelto", sugerencias (agregar y borrar, aceptar y rechazar) y
  "cambios desde tu última visita" (la visita termina al salir del documento).
- Deshacer y rehacer con Ctrl+Z / Ctrl+Y en los 4 editores.
- Sin conexión: con el servidor apagado, dos personas escriben; al volver se junta todo y aparece
  el resumen "Mientras no tenías conexión".
- Sincronizar un espacio con otro servidor, en los dos sentidos.
- `pruebas/seguridad.py`: 76 de 76 (incluye esperar a que pase la fecha de entrega).

**Falta probar en el A55 real** (la app y el teléfono como servidor con otra persona conectada):
el APK compila y lleva todo, pero en esta sesión no hubo teléfono.

**Antes de subir a Azure**: la base de la nube necesita las columnas nuevas de usuarios
(`invitado_de`, `hash_recuperacion`, `sal_recuperacion`). El usuario de la aplicación no puede
alterar tablas, así que hay que correr `./desplegar.sh roles` (o `azure/roles-bd.sql` con el
administrador) antes del despliegue. Opcional: `NOM_CUOTA_MB=50` para la cuota por persona.

**Limitaciones conocidas**:
- El service worker solo existe en https o en localhost. Quien entra por `http://<ip-del-salón>`
  no tiene la página guardada; ahí ayuda la app.
- Al exportar a Office no van las gráficas ni las filas fijas (.xlsx), ni las notas del orador ni
  las transiciones (.pptx). *(Resuelto en la fase 8.)*
- El resumen al reconectar cuenta lo que ya estaba en el servidor al volver; si la otra persona
  también estaba sin conexión, sus cambios llegan después como cambios normales.

### Orden que se había recomendado el 7 de noviembre

1. Probar en el A55: la app, el teléfono como servidor con otra persona y el QR con la cámara.
2. Revisión de facilidad de uso de toda la interfaz (palabras, lugar de cada cosa, repetición,
   colores) para que la entienda cualquier persona, de cualquier edad.
3. Lo que quedó fuera de este plan en `PENDIENTES.md` (incrustar una hoja en una presentación,
   línea de tiempo de animaciones, recuperar lo cortado en el celular).

Al cerrar cada sesión: marcar las casillas, compilar (jar y APK si hubo cambios de interfaz),
probar en local y hacer el commit con un mensaje en español.
