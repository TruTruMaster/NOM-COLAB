# Pendientes de NOM-COLAB

Lista de lo que falta para que NOM-COLAB sea original y útil de verdad (revisión del 7 de
noviembre de 2026). La idea central: **"Colabora donde no hay internet"**: un teléfono o una
laptop comparte, todos se conectan y los datos se quedan en el salón.

Marcar con `[x]` lo que se vaya terminando.

## 1. Que "sin internet" funcione de principio a fin

- [x] **Unirse con código QR**: el equipo que comparte (teléfono o computadora) muestra un QR con
      su dirección; los demás lo escanean y entran directo. Es lo más importante de la lista.
- [x] **Service worker (PWA)**: guardar la página en caché para que quien entra por el navegador
      no la pierda si se cae la conexión.
- [x] **Cola de cambios sin conexión**: lo que se edite sin conexión se guarda y se manda solo
      al volver (el CRDT ya permite juntar los cambios).
- [x] **Sincronizar entre servidores**: cuando el teléfono del salón vuelva a tener internet,
      subir el espacio a Azure o al servidor propio (y bajar los cambios de allá).
- [x] **Modo salón**: el maestro crea un espacio, los alumnos entran con el QR y un apodo (sin
      registrarse) y el maestro ve el documento de cada uno en vivo.

## 2. Lo básico que la gente nota en 5 minutos

- [x] **Deshacer / rehacer** en los 4 editores (texto, hoja, presentación y diagrama), que solo
      deshaga los cambios propios y no los de los demás.
- [x] **Comentarios y sugerencias**: comentar una parte del documento, responder, marcar como
      resuelto; sugerir cambios que el dueño acepta o rechaza.
- [x] **Buscar y reemplazar** en texto y en hojas.
- [x] **Hojas, fórmulas que faltan**: BUSCARV/VLOOKUP, CONTAR.SI/COUNTIF, SUMAR.SI/SUMIF,
      fechas (HOY, FECHA, DIAS).
- [x] **Hojas, funciones que faltan**: ordenar y filtrar, gráficas, fijar filas y columnas.
- [x] **Presentaciones**: modo presentador con notas, transiciones, y presentar desde el teléfono
      a un proyector conectado a un navegador.
- [ ] **Edición en el celular**: revisar tablas y hojas en pantallas chicas; hacer más fáciles de
      descubrir las acciones que solo salen al mantener presionado (la ruedita).

## 3. Confianza y solidez

- [x] **Almacenamiento de documentos**: hoy van en archivos JSON (`AlmacenJson`) y los usuarios en
      SQL. Pasar los documentos a la base, o usar escrituras atómicas con respaldos rotativos,
      para evitar archivos dañados y problemas con escrituras al mismo tiempo.
- [x] **Cuota de almacenamiento por usuario** en la nube.
- [x] **Más pruebas de permisos por rol en el servidor** (`pruebas/seguridad.py` pasó de 20 a 76).
- [ ] **Pruebas de conflictos del CRDT**: dos personas escribiendo en el mismo lugar, cambios sin
      conexión que se juntan después.
- [x] **Recuperar la contraseña**: hoy, si se olvida, se pierde la cuenta.
- [x] **Enlaces para unirse** (`/unirse`): que caduquen y que el dueño los pueda revocar.

## 4. Funciones originales

- [x] **Entrega de tareas**: los alumnos entregan un documento en el espacio del maestro, se
      bloquea al pasar la fecha límite y el historial de versiones sirve como prueba de quién
      escribió qué.
- [x] **Mapa de aportes**: cuánto escribió cada autor, con su color (ya se guarda un color por
      usuario y sus operaciones). Útil para los trabajos en equipo.
- [x] **Exportar todo el espacio** en un .zip con archivos de Office (.docx, .xlsx, .pptx).

## 5. Ideas sacadas de quejas reales en internet (investigación del 7 de noviembre de 2026)

Quejas de personas reales en Reddit, Hacker News, Microsoft Q&A y la prensa sobre Google Docs,
Word, Excel, Sheets, Canva y Notion. Cada punto lleva su fuente. **Ojo:** salvo donde se dice, no
se comprobó en las páginas oficiales que la función siga sin existir a noviembre de 2026; hay que
revisarlo antes de presentarlo como "nadie lo tiene". Las notas completas están en
`~/NOM/research_notes/Quejas reales sobre editores de documentos/` (no se suben al repositorio).

### 5.1 Lo que más nos distingue (sin internet y salón)

- [x] **Recibo de proceso de escritura**: un botón que exporte la línea de tiempo de cada
      sesión, cuánto se tecleó y cuánto se pegó, una repetición del tecleo y un hash SHA-256 de la
      bitácora, para que el alumno pruebe que él lo escribió. Caso real: a Leigh Burrell la acusó
      Turnitin de usar IA y tuvo que armar a mano "un PDF de 15 páginas con capturas" de su
      historial de Google Docs
      ([The Star, mayo 2025](https://www.thestar.com.my/tech/tech-news/2025/05/21/a-new-headache-for-honest-students-proving-they-didnt-use-ai));
      otro alumno dice que su universidad ni quiso ver su historial
      ([IBTimes](https://www.ibtimes.co.uk/student-scholarship-risk-ai-tool-flags-thesis-1799883)).
      Complementa "Entrega de tareas" (sección 4): aquí el dueño de la prueba es el alumno.
- [x] **Comentarios y permisos que funcionen sin internet**: en Google Docs sin conexión no se
      puede compartir ni comentar, y en el modo sin conexión de Notion (agosto 2025) tampoco hay
      comentarios ([TechRepublic](https://www.techrepublic.com/article/how-to-create-and-edit-google-docs-sheets-and-slides-offline),
      [AlternativeTo](https://alternativeto.net/news/2025/8/notion-rolls-out-offline-mode-edit-pages-without-an-internet-connection)).
      En la red del salón nosotros sí podemos.
- [x] **Respaldo automático del espacio en el teléfono servidor**, para que el salón conserve todo
      aunque nunca haya nube. "I personally prefer the Notion UI but hate being locked into their
      cloud" ([HN, 2023](https://news.ycombinator.com/item?id=37253385)); "there wasn't a simple,
      free way to sync between desktop, ios, and android"
      ([HN, 2024](https://news.ycombinator.com/item?id=41622351)).
- Respaldo de la idea central: nadie grande deja colaborar en vivo sin internet; solo hay
  proyectos chicos en GitHub (PeerEdit, peerdoc). "a class-room without internet connectivity
  could share a canvas & collaborate together" ([HN, 2024](https://news.ycombinator.com/item?id=39612823)).
  En México el 26.4 % de los hogares no tiene internet (Chiapas 50.7 %, Oaxaca 55.5 % y Guerrero
  58.9 % de hogares conectados) y el 81.7 % de los usuarios entra desde el celular
  ([INEGI ENDUTIH 2024](https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2025/endutih/ENDUTIH_24_RR.pdf),
  [México Industry](https://mexicoindustry.com/noticia/el-81-7-de-los-mexicanos-accede-a-internet-desde-su-celular-inegi)).
  Sirve para la presentación.

### 5.2 Colaboración

- [x] **"Qué cambió desde tu última visita"**: al abrir un documento, resaltar lo que otros
      cambiaron y quién, desde la última vez que lo abriste. En OneDrive "at every release the
      changes since the last release had to be looked up manually"
      ([HN, 2024](https://news.ycombinator.com/item?id=42227082)).
- [x] **Resumen al reconectar**: cuando se juntan los cambios hechos sin conexión, avisar qué pasó
      ("Ana borró el párrafo 3 mientras tú lo editabas"). El CRDT junta todo en silencio, y la
      gente pide ver "exactly what the other did" ([HN, mar 2026](https://news.ycombinator.com/item?id=47397454)).
- [x] **Bloquear secciones por persona** (cada alumno solo edita "su" parte del texto o sus
      diapositivas): "For over a decade, I have been both frustrated and baffled that such a
      feature [per-paragraph editing permissions] has not been available in Google Docs"
      ([r/googledocs, sep 2024](https://reddit.com/r/googledocs/comments/1fe59hn)). Los roles del
      servidor ya están; falta un dueño por bloque. También sirve para los trabajos en equipo:
      un alumno hizo todo el proyecto solo y la maestra no sabe cómo calificar
      ([r/Teachers, jul 2026](https://reddit.com/r/Teachers/comments/1utqwmg)); unos padres
      metieron abogado por un trabajo en equipo
      ([r/Teachers, may 2026](https://reddit.com/r/Teachers/comments/1trksfd)).
- [x] **Proteger documentos contra el borrado** (marca "no borrar"; para borrar hay que escribir
      BORRAR): alguien perdió 10 hojas de impuestos que usaba una o dos veces al año
      ([r/googledocs, mar 2024](https://reddit.com/r/googledocs/comments/1b4s2e8)).

### 5.3 Texto (Docs/Word)

- [x] **Pegar un enlace sobre el texto seleccionado lo convierte en vínculo**: "It's embarrassing
      that Google Docs ... still don't have this"
      ([r/googledocs, dic 2025](https://reddit.com/r/googledocs/comments/1pobhiw)). Es muy fácil.
- [x] **Formato por defecto que sí se respete**, y que el maestro lo pueda fijar para el espacio
      (por ejemplo Times New Roman 12, APA): a una usuaria no se le queda
      ([r/googledocs, oct 2025](https://reddit.com/r/googledocs/comments/1oi5ed7)).
- [ ] **Recuperar lo cortado en el celular**: a una persona le desaparecieron 30 páginas al cortar
      texto en Android ([r/googledocs, mar 2026](https://reddit.com/r/googledocs/comments/1rieioo)).
      Va junto con "Deshacer / rehacer" (sección 2).

### 5.4 Hojas

- [x] **Filtro y orden personales por defecto**, con un botón aparte de "aplicar a todos" y un
      aviso tipo "ves 12 de 40 filas (filtro solo tuyo)". En Excel: "I AM using a temporary view so
      my filters should not affect others, but they do"
      ([Microsoft Q&A, mar 2026](https://learn.microsoft.com/en-us/answers/questions/5845457/excel-shows-everyone-my-filters-in-a-shared-doc-ev)).
      Collabora también lo tiene
      ([foro Collabora](https://forum.collaboraonline.com/t/nextcloud-filtering-changes-view-of-all-users/434)).
      Esto sí está comprobado como parcialmente sin resolver. Basta con guardar la vista en cada
      cliente, fuera del CRDT. Afina el punto "ordenar y filtrar" de la sección 2.
- [ ] **Tablas con cálculos dentro de un diseño o presentación** (incrustar una hoja): lo piden en
      [r/canva (feb 2025)](https://reddit.com/r/canva/comments/1iwd7ym). Ya tenemos hojas.

### 5.5 Lienzo y presentaciones (Canva)

Todo esto sale de los hilos de r/canva
[1iwd7ym](https://reddit.com/r/canva/comments/1iwd7ym) (feb 2025),
[159z26v](https://reddit.com/r/canva/comments/159z26v) (jul 2023) y
[1syka6w](https://reddit.com/r/canva/comments/1syka6w) (abr 2026).

- [x] **Mesa de trabajo fuera de la página**: dejar elementos a un lado del lienzo para usarlos
      después, sin que se exporten (el comentario más votado: 21).
- [x] **Grupos dentro de grupos**: "Why does ungroup ungroup ALL elements? So dumb."
- [x] **Panel de capas** con ocultar y bloquear, para no tener que andar dando clic en la imagen.
- [x] **Bloquear elementos de una plantilla**: que el maestro fije el diseño y los alumnos solo
      llenen lo suyo (idea propia a partir de lo anterior, sin cita).
- [x] **Detalles rápidos**: girar 90° en un clic, cuentagotas para el color, revolver o reordenar
      páginas, varios efectos sobre el mismo texto, efectos de texto dentro de tablas.
- [ ] **Línea de tiempo de animaciones** en presentaciones, no solo entrada y salida.
- [ ] **Sin IA metida a fuerza**: "I wish all the AI fluff had an off button, like a Canva Lite
      that's also cheaper" (r/canva 1syka6w). Nosotros no la tenemos: hay que decirlo como ventaja.
