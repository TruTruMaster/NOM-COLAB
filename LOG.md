# LOG — todo lo hecho en NOM-COLAB (16 de octubre de 2026)

## 1. Revisión del proyecto
- Se leyó toda la documentación: `Requerimientos WACK.docx`, `Mapa de navegación y casos de uso.docx`,
  `Planeación del proyecto - NOM.docx`, `PE_WACK.docx`, y en `~/NOM-COLAB/diagramas` el README, la
  especificación de 29 casos de uso, el modelo de datos y los 16 diagramas PlantUML.
- Se tomó el formato del modelo `Diagrama de Actividades.pdf`: carriles Usuario / Sistema / Base de datos
  en rosa, azul y verde, y un diagrama por caso con su pie.
- Indicación del usuario: **se eliminó el módulo "Conoce NOM"**; todo lo demás sigue igual.

## 2. Correcciones a la documentación
- Se quitaron CU-06 a CU-12 (Conoce NOM) de `ESPECIFICACION-CASOS-DE-USO.md`. **CU-27 Preferencias** pasó
  al módulo de cuentas y ahora se abre desde el menú de la cuenta.
- Diagramas 07 (navegación) y 11 (casos de uso general) regenerados sin Conoce NOM. El 09 se movió a
  `diagramas/retirado/`.
- Inicio de sesión con usuario inexistente: el modelo decía "No tienes una cuenta". Se usó
  "Usuario o contraseña incorrectos", como ya marcaba la especificación CU-02, para no revelar qué
  usuarios existen.
- README de diagramas y Gantt actualizados: UI/UX y diseño del CRDT hechos; desarrollo en curso.

## 3. Diagramas de actividades (por módulo del mapa de navegación)
| # | Módulo | Caso |
|---|---|---|
| A1 | Gestión de cuentas | Crear usuario |
| A2 | Gestión de cuentas | Iniciar sesión (con bloqueo tras 5 intentos) |
| A3 | Espacios de trabajo | Crear espacio y activar conexión |
| A4 | Espacios de trabajo | Unirse a un espacio |
| A5 | Espacios de trabajo | Gestión de accesos |
| A6 | Espacios de trabajo | Editor (editar documento y sincronizar) |
| A7 | Espacios de trabajo | Almacenamiento y versiones |

- Generador `diagramas/actividades/generar.py`: cada diagrama se describe en una cuadrícula y salen SVG,
  PNG y `.drawio` editable. Trae un revisor automático que avisa si una línea cruza una caja.
- Documento final: `Diagrama de Actividades NOM-COLAB.pdf` / `.docx` (portada, índice, un diagrama por página).
- Visor `diagramas/index.html` regenerado con los 22 diagramas (`generar-visor.py`).

## 4. Investigación de diseño (psicología y estilo)
- Estilo **"arcilla suave"** (claymorphism contenido): volumen solo en lo que se toca y lienzo plano.
  Cada superficie lleva un borde de 1 px porque las sombras solas fallan en accesibilidad.
- Contrastes medidos contra WCAG AA: tinta 12.8:1, texto secundario 4.9:1, botón principal 5.4:1.
- Principios aplicados: leyes de Jakob (familiar), Hick (pocas opciones), Fitts (objetivos ≥ 44 px y
  herramientas al alcance del pulgar), Doherty (< 400 ms), Von Restorff (un solo color de acento),
  Zeigarnik ("Continúa donde lo dejaste"), atributos preatentivos (un color por modo), pico-final,
  costo del cambio de tarea (un solo lienzo, modo enfoque, avisos sin interrumpir).
- Todo documentado con fuentes en `4-CODIGO/docs/DISENO-UI.md`.

## 5. Programa construido
**Servidor** (`4-CODIGO/app`, Java 17 + Spring Boot 4.1.1, que cumple "3.5 o superior"):
- Paquetes según el diagrama 2: `core/modelo`, `core/crdt`, `core/almacen`, `servidor/api`,
  `servidor/servicio`, `servidor/repositorio`, `servidor/seguridad`, `red/nodo`, `red/descubrimiento`.
- Cuentas: registro (nombre, contraseña y empresa opcional), PBKDF2-SHA256 con sal, bloqueo al 6.º intento
  durante 15 min, sesiones con token y preferencias.
- Espacios: crear, conexión del proyecto (anuncio UDP 47474 en la LAN), descubrir, unirse y solicitar
  acceso, accesos Lectura/Edición/Quitar, máximo 5 usuarios simultáneos.
- Documentos: motor CRDT (mapa LWW por campo con reloj de Lamport), canal en tiempo real (SSE), presencia,
  versiones (manual, autoguardado y al cerrar), restaurar como versión nueva, depurar almacenamiento.
- Persistencia en archivos JSON con escritura atómica; no requiere instalar una base de datos.

**Interfaz** (la misma para navegador, celular y app; HTML, CSS y JS sin dependencias, fuente Nunito
e íconos Lucide incluidos para funcionar sin Internet):
- Bienvenida, iniciar sesión y crear cuenta (medidor de contraseña, aviso de Bloq Mayús, cuenta regresiva
  del bloqueo, palomita animada al registrarse).
- Inicio, espacios, unirse, compartir y accesos, conexión, almacenamiento, preferencias (tema claro,
  oscuro o automático; calidad; movimiento).
- **Editor de un solo lienzo con 4 modos:**
  - Texto: párrafos, títulos, listas, tareas, citas, menú "/", atajos de Markdown y formato.
  - Hoja: barra de fórmulas, SUMA/PROMEDIO/SI/SIERROR…, autosuma, copiar y pegar.
  - Presentación: miniaturas, figuras, imágenes, animaciones y reproductor F5.
  - Diagrama: pizarrón con zoom, figuras y flechas.
- Micro-textos (cursor 350 ms o pulsación de 450 ms), deshacer/rehacer, historial con vista previa, modo
  enfoque, plantillas (Acta, Plan de clase, Calificaciones, Presupuesto, Proyecto, Diagrama de flujo,
  Lluvia de ideas), importar (.nom .md .txt .csv .html) y exportar (.nom .html .md .csv .svg PDF).
- Sin conexión: los cambios se guardan en el dispositivo y se envían solos al volver la red.

**App Android** (`4-CODIGO/android`, minSdk 24, sin librerías externas):
- Empaqueta la misma interfaz y abre documentos sin red.
- Al abrirse busca sola el servidor en el Wi-Fi (UDP) y se conecta si hay uno solo.
- Exporta a Descargas, abre el selector de archivos y respeta las barras del sistema.

## 6. Pruebas realizadas
- API: **37/37** (registro, duplicados, bloqueo, permisos, CRDT idempotente y determinista, SSE en 42 ms,
  versiones, restauración, depuración, preferencias, cierre de sesión).
- Límite de 5 usuarios: el 6.º recibe "El espacio está lleno".
- JUnit `MotorCRDTTest`: **4/4**. Con 5 usuarios, 20 historias y 10 órdenes de llegada cada una, el
  resultado es idéntico; los duplicados no cambian nada; restaurar funciona.
- Navegador (Firefox headless): flujo completo sin errores de consola, en escritorio, celular y oscuro.
- Dos navegadores editando a la vez: texto y hoja convergen (10 + 32 → 42 en ambos), con presencia visible.
- Sin conexión: se detuvo el servidor, se editó y al reiniciarlo la cola llegó sola.
- Android (emulador API 35): instalación, conexión, inicio de sesión, espacios, editor; se editó sin red
  y llegó al servidor 2 s después de volver la red.

## 7. Errores encontrados y corregidos durante las pruebas
- La primera petición tardaba ~5 s en `localhost`: el servidor escuchaba solo IPv4. Ahora escucha IPv4 e IPv6.
- Tab y Enter en la hoja movían dos celdas; ya mueven una.
- Un `"-"` dentro de una fórmula se leía como signo menos; corregido.
- `SI()` ahora ignora errores en la rama que no toma (como Excel).
- La plantilla Calificaciones mostraba #DIV/0! en filas vacías; ya no.
- La presentación no cargaba porque el escenario no se encontraba; corregido.
- Las flechas del diagrama no se veían porque una regla CSS borraba su relleno; corregido.
- Los botones "planos" ocupaban toda la pantalla por un choque de nombres de clase con el pizarrón del
  diagrama; el pizarrón se renombró a `.pizarra`.
- El indicador decía "Sincronizando" sin red; ahora dice "Sin conexión" si tarda más de 2.5 s.
- El botón flotante "+" salía en escritorio; ahora solo sale en móvil.
- En Android el contenido quedaba debajo de las barras del sistema; ahora respeta los márgenes.
- Al cancelar Preferencias se quedaba el tema de vista previa; ahora vuelve al anterior.

## 7b. Cambio pedido después: usar el programa sin cuenta
- Nuevo botón **"Usar sin cuenta"** en iniciar sesión, en crear cuenta y en la pantalla de servidor de
  la app Android (la app ya funciona sin ningún servidor).
- Los documentos sin cuenta se guardan en el almacenamiento del navegador o la app (`js/local.js`),
  con el mismo editor de 4 modos. El indicador dice **"Solo en este equipo"**.
- Aviso visible en Inicio y en el editor: si se borra la caché se pierden, salvo que se descarguen
  (**… → Descargar copia .nom**). Ctrl+S guarda y ofrece descargar.
- Al crear cuenta o iniciar sesión, esos documentos aparecen como **"En este equipo (sin subir)"** y se
  pueden **subir a un espacio** (se crean en el servidor y se quita la copia local).
- Las preferencias funcionan sin cuenta (se guardan en el equipo).
- Prueba en el navegador: crear una hoja sin cuenta, recargar (sigue ahí, promedio correcto), crear
  cuenta, crear espacio, subir el documento (queda en el servidor y sale de la lista local). Sin errores.
- La app Android además se conecta sola al servidor si encuentra uno en el Wi-Fi; el servidor ahora se
  anuncia siempre.
- API: 37/37 otra vez con el jar final; JUnit 4/4.

## 7c. PDF final con la portada del equipo
- Los 7 diagramas originales no cambian con el modo sin cuenta (sus flujos siguen iguales).
- Se agregó el diagrama **"Usar sin cuenta"** (módulo Gestión de cuentas, `A8-usar-sin-cuenta`): elegir
  "Usar sin cuenta", ver documentos del navegador, crear/editar (cada cambio se guarda en el navegador)
  y al final descargar el .nom o subirlo a un espacio (pidiendo sesión si no la hay).
- El PDF ahora usa **exactamente la portada `PORTADA NOM (1).pdf`** del equipo como primera página,
  seguida del índice y los 8 diagramas en tamaño A4 (10 páginas). El .docx lleva la portada como imagen.

## 8. Límite conocido
Si dos personas escriben **en el mismo párrafo exactamente al mismo tiempo**, se conserva la última
versión de ese párrafo. En párrafos o celdas distintas nunca se pisan. El siguiente paso sería un CRDT
por carácter (tipo RGA).

## 9. Ubicaciones
- Proyecto de trabajo original: `~/NOM-COLAB` (este folder `NOM` es una copia lista para entregar).
- Compilar de nuevo: `cd 4-CODIGO/app && mvn package` (genera `target/nom-colab.jar`) y
  `cd 4-CODIGO/android && ./gradlew assembleDebug` (genera el APK).

---

# LOG — 21 de octubre de 2026: base de datos, roles, Azure y presentación

## 10. Revisión de cómo se subió la página anterior (práctica 4)
- `~/.azure/commands` y `P4_GIT_AZURE`: se usó `az webapp up --html` (plan F1 `plan-calif-win`,
  `westus`). Static Web Apps falló por la política del IPN, que solo permite westus,
  northcentralus, norwayeast, swedencentral y belgiumcentral. La sesión de `az` seguía activa.
- Había quedado un plan F1 Linux vacío (`plan-calificaciones`) de un intento fallido; no se tocó.

## 11. Lo que pidió el profesor: módulo conectado a la BD, en Azure, con roles
- **Usuarios, roles, sesiones y preferencias ahora viven en una base de datos** (antes JSON):
  `RepositorioUsuariosJdbc` (JdbcClient). Azure SQL Database en la nube; H2 embebido en la red
  local (sin instalar nada). Esquemas `schema-sqlserver.sql` y `schema-h2.sql`, idempotentes.
- Tabla `rol` (ADMINISTRADOR, USUARIO) + `usuario.id_rol`; el rol se lee con `JOIN rol`.
- `FiltroRol`: `/api/admin/**` responde 403 si no es ADMINISTRADOR. `AdminApi`: listar cuentas,
  cambiar rol, desbloquear. Nadie puede quitarse su propio rol.
- Admin inicial por variables `NOM_ADMIN_USUARIO`/`NOM_ADMIN_CONTRASENA` (Azure); en local la
  primera cuenta es administradora. Las cuentas de `usuarios.json` se importan solas.
- Interfaz: pantalla **Administrar usuarios** (`js/vista-admin.js`), rol visible en el riel y en el
  menú de la cuenta, aviso al entrar como administrador.
- Azure: `rg-nomcolab` (westus) · Azure SQL serverless con la **oferta gratuita** (se pausa si se
  agota, no cobra) · App Service **F1 Free** Linux Java 21 · solo HTTPS · secretos en App settings.
  Script `4-CODIGO/azure/desplegar.sh` y guía `4-CODIGO/docs/DESPLIEGUE-AZURE.md`.

## 12. Correcciones encontradas
- Un archivo inexistente (p. ej. el `robots933456.txt` con el que Azure sondea) devolvía **500** y
  ensuciaba el log; ahora 404.
- La app Android convertía `nomcolab-wack.azurewebsites.net` en `http://…:8080` y no podía usar
  un servidor en Internet. Ahora: IP/localhost/nombre.local → http y :8080; dominio → https.
- Login y registro esperan hasta 90 s y dicen "Conectando con la base de datos…": la BD gratuita
  se pausa sin uso y tarda ~1 min en despertar (antes cortaba a los 9 s con "sin conexión").
- README de diagramas decía Spring Boot 3.5; es 4.1.

## 13. Diagramas actualizados
- 07 navegación (Administrar usuarios), 08 casos de uso de cuentas (actor Administrador, CU-27,
  CU-30), 12 E-R (tabla rol y columnas reales), 13 secuencia de login (Azure SQL, JOIN rol, 403),
  nuevo **17 E-R del módulo de cuentas**. `modelo-datos.sql` con `rol`. CU-30 en la especificación.

## 14. Pruebas
- API local (H2): registro, duplicado 409, USUARIO→403, sin token→401, quitarse admin→403, rol
  inválido→400, bloqueo al 6.º intento, desbloqueo, cambio de rol aplicado con el mismo token,
  preferencias, cierre de sesión. Migración desde `usuarios.json`. JUnit OK.
- El jar contra Azure SQL real desde este equipo y luego en Azure: tablas creadas, admin creado.
- Navegador (LibreWolf headless, Selenium) en local y en Azure: 15 pantallas, **0 errores JS**.
- APK en el emulador conectado a Azure: inicio de sesión de admin y menú "Administrar usuarios".
- El jar nuevo con el Java incluido en `2-PAGINA-Servidor` (tiene `java.sql`).

## 15. Presentación
19 diapositivas con notas del orador: nombre, problemática, mapa de navegación, casos de uso +
especificación de 2 módulos, secuencia y actividades de 2 módulos, Look & Feel de 2 módulos,
E-R (cuentas y completo), arquitectura en Azure, avance web/móvil y guion de la demo.
Las imágenes están en `5-PRESENTACION/imagenes/`.

---

# LOG — 21 de octubre de 2026 (noche): logo, tipo fijo, descargas, bitácora y entregables

## 16. Costos de Azure
Todo en planes gratuitos: App Service F1 ($0) y Azure SQL con oferta gratuita (AutoPause al agotarse,
nunca cobra). Uso de la BD al cierre: 3 680 de 100 000 vCore-segundos del mes (3.7 %).

## 17. Logo nuevo
Documento cuadrado con 4 cuadros (texto azul, hoja verde, presentación naranja, diagrama morado),
márgenes iguales y esquinas concéntricas. En `img/icono.svg`, el sprite `#logo`, favicon y PNG 192/512
del manifest, ícono adaptable de Android (`ic_documentos.xml`) y la presentación. Logo de la empresa
WACK (de `PE_WACK.docx`) en la portada y el cierre de la presentación.

## 18. Cambios pedidos
- **El tipo de documento es fijo** (texto, hoja, presentación, diagrama): se quitó el selector de
  modos; el servidor descarta cualquier cambio de `_doc.modo`. Las tablas dentro de un texto ahora se
  editan ahí mismo, celda por celda.
- **Descargas universales** sin librerías (`js/ooxml.js`): Word .docx, Excel .xlsx (fórmulas traducidas
  a Excel: SUMA→SUM…), PowerPoint .pptx (presentaciones y diagramas con flechas), PNG del diagrama.
  En Android se guardan en Descargas. Validado abriéndolos con LibreOffice.
- **Bitácora de cambios** por documento (`actividad.jsonl`, `/api/documentos/{id}/actividad`): quién,
  desde qué dispositivo (computadora, celular, app Android) y qué tocó. Pestaña "Actividad" en el historial.
- **Autoguardado**: cada cambio se guarda ~250 ms después de dejar de escribir.
- **"Este dispositivo"**: copias locales, espacio usado, cambios sin enviar; liberar espacio.
- **Datos locales separados por cuenta** (`nom.u.<cuenta>.*`): otra cuenta en el mismo equipo no ve
  ni envía las copias o cambios pendientes de la anterior (antes sí podía).
- Versión en línea: "En línea" en lugar de "Solo en este equipo"; "Unirse" explica que el espacio se comparte.
- **Mapa de navegación** rehecho como mapa de sitio (`diagramas/navegacion/generar.py`) con el flujo ideal.
- CU-20 ahora es "Elegir el tipo del documento"; CU-18, CU-23 y CU-29 actualizados.

## 19. Errores encontrados y corregidos
- El botón invisible "Salir del modo enfoque" tapaba el botón "⋯ Más opciones" en computadora.
- Una ventana abierta se quedaba encima al cambiar de pantalla con Atrás; ahora se cierra. En Android,
  Atrás primero cierra la ventana y después regresa.
- `bytes()` no mostraba GB; enlaces con forma de botón salían subrayados.

## 20. Pruebas
- Prueba integral local: **35/35** (seguridad 401/403, inyección SQL, validaciones, permisos de lectura,
  tipo fijo, misma cuenta PC↔celular ~0.5 s, otra cuenta, tabla en texto, autoguardado, bitácora,
  descargas .docx/.xlsx/.pptx válidas, almacenamiento por cuenta, sin errores JS).
- Azure: PC + celular (misma cuenta) 9/9; app Android (emulador) ↔ PC en ambos sentidos.
- Teléfono real (Samsung A55, Android 16) por Tailscale + ADB: APK nuevo instalado; Chrome y la app
  inician sesión en Azure con el formulario. La prueba de 5 dispositivos quedó pendiente (se pausó para
  no seguir usando Azure).

## 21. Entregables (`ENTREGA/`)
1. `1 - Presentacion NOM-COLAB.pdf` — 20 diapositivas.
2. `2 - Modulo web con BD, Azure y roles - NOM-COLAB.pdf` — 7 páginas para Programación Web.
Fuentes para regenerarlos: `5-PRESENTACION/fuentes-pdf/`.

---

# LOG — 22 de octubre de 2026: texto letra por letra, editor tipo Word, ruedita y figuras tipo Canva

## 22. Sincronización letra por letra (como Google Docs)
- Los documentos de texto ahora son una **secuencia CRDT tipo RGA**: cada letra, salto de párrafo u
  objeto tiene id propio. Operaciones: insertar tramo, mostrar/ocultar y dar formato (registros LWW
  por letra). Dos personas pueden escribir en la misma palabra a la vez y todos terminan igual.
- Cliente: `js/secuencia.js` + `js/crdt.js` (envío en lotes de ~16 ms, cola sin conexión, deshacer por
  palabra que solo deshace lo propio). Servidor: `core/crdt/Secuencia.java` (guarda sin repetir, junta
  tramos, restaura versiones ocultando/revelando letras por id).
- El servidor escribe a disco cada ~0.8 s (no en cada tecla) y la bitácora junta la escritura seguida de
  una persona en una línea: "escribió 240 letras, borró 12".
- Los documentos de texto anteriores se convierten solos al abrirlos (ids deterministas).
- Cursores de los demás con nombre y color; mientras el teclado del celular compone una palabra, lo
  que llega de otros espera a que termine (para no romper el autocorrector).
- Se corrigió una carrera del enrutador: al cambiar de pantalla mientras un documento cargaba quedaba un
  editor "huérfano" conectado.

## 23. Editor de texto tipo Word
- Una sola hoja con páginas (Carta, A4, Oficio, vertical u horizontal, márgenes de Word), encabezado y
  pie con número de página, vista sin páginas para celular y zoom.
- Estilos de Word (Normal, Título, Subtítulo, Título 1-3, Cita, Código), fuentes, tamaños, negrita,
  cursiva, subrayado, tachado, superíndice, subíndice, color, resaltado, enlaces, alineación,
  interlineado, espacio antes/después, sangrías, viñetas, numeración y tareas con niveles.
- Insertar imagen (con tamaño ajustable), tabla (selector de tamaño), salto de página, línea, índice,
  fecha y símbolos. Pegar desde Word/Google Docs/la web conservando el formato.
- Buscar y reemplazar, contar palabras, esquema de títulos, copiar formato (brocha), MAYÚSCULAS,
  minibarra al seleccionar, atajos de Word y de Markdown, modo enfoque.
- Word: exporta .docx con estilos reales de Word (títulos, listas, tablas, imágenes, enlaces, página,
  encabezado/pie) e **importa .docx** (como documento nuevo o dentro del actual). Validado con
  LibreOffice en ambos sentidos.

## 24. Ruedita de acciones
- Mantener clic derecho (o el izquierdo quieto ~0.45 s, o el dedo en el lienzo) abre un anillo de 8
  acciones; se elige moviendo hacia la acción y soltando (como las ruedas de ping de los juegos).
  Submenús en la misma rueda, teclado completo, Mayús+clic derecho deja el menú normal. `js/rueda.js`.

## 25. Figuras y funciones tipo Canva (presentación y diagrama)
- 23 figuras en SVG; relleno o sin relleno, borde (color, grosor, guiones/puntos), transparencia,
  esquinas, sombra, giro con tirador, voltear, bloquear, agrupar, alinear, distribuir, orden de capas,
  selección con recuadro, guías inteligentes al mover, copiar/pegar y barra contextual.
- PowerPoint (.pptx) y SVG/PNG exportan las figuras con su giro, borde, transparencia y sombra.

## 26. Pruebas
- JUnit 7/7 (incluye convergencia de la secuencia en cualquier orden y con duplicados, y restaurar).
- Prueba aleatoria de la secuencia en Node: 4 × 60 rondas con 3-5 réplicas, entregas desordenadas y
  repetidas, deshacer y rehacer: todas convergen, también al recargar desde lo guardado.
- Navegador real (Firefox, dos ventanas en el mismo documento): 3 pruebas de estrés de 40 ediciones
  simultáneas al azar (escribir, Enter, borrar, formato, deshacer): las dos ventanas y una tercera
  recién abierta desde el servidor quedan idénticas, y la pantalla coincide con el modelo.
- Latencia tecla → pantalla del otro equipo en red local: mediana 20 ms. El cursor propio no salta
  cuando otra persona escribe antes en el mismo párrafo.
- Restaurar versión, modo sin cuenta (sobrevive a recargar), vista de celular, presentaciones,
  hoja de cálculo, vista previa de versiones: sin errores de JavaScript.

---

# LOG — 22 de octubre de 2026 (tarde): negrita, cursiva, Enter y la ruedita no funcionaban

## 27. Causa principal: lo escrito no llegaba al modelo
- En Chrome, Edge y la app Android (WebView), **lo que se escribía con el teclado solo se veía en
  pantalla**: no entraba a la secuencia CRDT, así que no se guardaba, no se sincronizaba y los
  comandos trabajaban sobre un documento vacío. Por eso negrita, cursiva, subrayado, colores,
  estilos y la ruedita "no hacían nada", y Enter fallaba (`Cannot read properties of undefined`).
- Motivo: el oyente de `input` de las celdas de tabla va en fase de captura y corre antes que el del
  editor. Al terminar, el navegador entrega los cambios del DOM al MutationObserver, cuyo callback
  estaba vacío y los tiraba; `takeRecords()` llegaba vacío. Venía del commit "Texto letra por letra".
- Arreglo (`modo-texto.js`): el observador guarda los registros en cuanto llegan y el editor los lee
  de ahí (`tomarRegistros()`), sin importar el orden de los oyentes.

## 28. Otras correcciones
- Pegar texto plano con varios renglones dentro de un título o una lista: la primera parte perdía su
  estilo. Ahora los párrafos nuevos toman el formato del párrafo donde se pega (como Word).
- Presentación y diagrama:
  - Al crear un cuadro de texto o una figura con la herramienta, el mismo clic le quitaba el foco:
    lo primero que se escribía se perdía y Enter solo activaba la edición.
  - El botón Negrita del panel "Texto" salía activado en cuadros de texto normales (que no van en
    negrita) y el primer clic no hacía nada visible.
  - Ctrl+B / I / U al escribir en una figura ponían formato que desaparecía al terminar. Ahora cambian
    la negrita, **cursiva** o **subrayado** de todo el cuadro (nuevos `tCursiva`, `tSubrayado`, también
    en el panel "Texto") y se exportan a SVG/PNG y PowerPoint.

## 29. Pruebas (Chromium, Playwright)
- Texto: escribir, Enter, Mayús+Enter, negrita/cursiva/subrayado con atajos, barra, minibarra y
  ruedita (mantener y soltar, clic rápido, submenús Estilo y Color, Más → Cortar), listas, Tab,
  atajos de Markdown, estilos, fuente, tamaño, color, enlace, borrar formato, deshacer/rehacer,
  seleccionar entre párrafos, Ctrl+A, pegar, teclado de celular (composición): todo queda en el
  modelo y sobrevive a recargar. Sin errores de JavaScript.
- Dos navegadores con cuenta en el mismo documento + una tercera ventana nueva: idénticos.
- Diagrama y presentación: escribir al crear, Enter, Ctrl+B/I/U, panel Texto; exportar SVG, PPTX,
  DOCX, HTML y Markdown con el formato. JUnit 7/7 y `cripto.test.js` OK.

## 30. Revisión del arreglo y dos correcciones más
- Verificado con LibreWolf (Firefox) contra el servidor local: escribir, Ctrl+B sobre una palabra,
  Enter y recargar conserva todo; la ruedita aplica Negrita, Estilo → Título 1 y Color; dos
  navegadores escribiendo a la vez quedan idénticos; en el diagrama, "Texto libre" guarda el texto,
  el salto de línea, negrita y cursiva después de Esc y de recargar.
- Texto suelto después del último párrafo (el cursor queda fuera de todo bloque): se perdía lo
  escrito y salía `visPintado[base + p - 1] is undefined`. Al comparar, la marca final del documento
  ya no puede quedar en la parte común; lo nuevo se inserta antes de ella como un párrafo más.
  También se evita `parrafoActual.classList` cuando el cursor está en ese texto suelto.
- Minibarra: al cambiar la selección, la barra anterior seguía 350 ms en su lugar y podía tapar el
  texto recién seleccionado (el clic derecho caía en ella y no abría la ruedita). Ahora se quita en
  cuanto cambia la selección y vuelve a salir sobre la nueva.
- JUnit 7/7 y `cripto.test.js` OK.

---

# LOG — 22 de octubre de 2026 (noche): la ruedita sale sola, vidrio, movimiento y estilo protegido

## 31. La ruedita aparece sola al seleccionar
- Al seleccionar texto, una imagen, figuras o celdas y dejar la selección quieta medio segundo, la
  ruedita aparece junto a lo seleccionado (debajo; si no cabe, arriba o a un lado) sin taparlo.
  Si se sigue seleccionando se esconde y vuelve en la siguiente pausa. No atrapa el puntero ni el
  teclado (modo "auto" en `rueda.js`): escribir, tocar fuera o Esc la cierran; tocarla no le quita
  el foco ni la selección al documento. Tras dar formato vuelve a salir; tras copiar, eliminar o
  Esc no vuelve hasta que cambie la selección. Se acomoda sola al desplazar la página.
- Mismo orden en todos los editores: negrita, cursiva, subrayado, color, eliminar o cortar (abajo),
  copiar o duplicar, estilo/orden/fórmulas, más. Lo que no aplica sale apagado en su lugar. Los
  submenús se abren en el mismo lugar y su centro regresa a la rueda anterior. Lo activo (negrita
  puesta, ancho actual) lleva una marca.
- Se quitó la barra pequeña que salía encima del texto seleccionado (la reemplaza la ruedita).
- Presentación y diagrama: la barra de opciones de la selección queda fija arriba del lienzo.
- Hoja de cálculo: ruedita nueva (al elegir celdas con el puntero o con Mayús+flechas) y formato
  de celda nuevo: cursiva, subrayado y color (Ctrl+I, Ctrl+U), que también se exporta a Excel.

## 32. Selección múltiple con el dedo
- Lienzo: sostener una figura y tocar otras con otro dedo, o mantener una figura 0.45 s y luego
  tocar las demás. Un aviso abajo dice cuántas van y "Listo" termina. Tocar una elegida la quita;
  arrastrar mueve todas. Mantener sobre una figura ya no abre la ruedita (sale sola).
- Hoja: sostener una celda y tocar otra, o mantener una celda y tocar otra, elige el rango.
- Texto: con la selección sostenida, tocar más allá con otro dedo la extiende hasta ese punto.

## 33. Vidrio (glassmorphism) con arcilla, y más movimiento
- Lo que flota encima deja ver lo de atrás desenfocado: ruedita, menús y paletas, ventanas, avisos,
  micro-textos, barra de selección del lienzo, zoom, buscar, cajón de versiones, barras del celular.
  Opacidad según la cantidad de texto; sin desenfoque disponible o en calidad baja, son opacas.
- Movimiento: pantallas en cascada, el editor baja su barra, menús y avisos entran con rebote y
  salen animados, la ruedita gira al abrir y sus acciones aparecen una tras otra, el tema se funde
  al cambiar, los íconos "saludan". "Reducir movimiento" lo apaga todo.
- Bienvenida: en lugar de cuadros y círculos, flotan un documento, una presentación y una hoja; se
  apartan del cursor, se inclinan hacia él y saltan al tocarlos. En el celular van en un grupo
  pequeño junto a la marca.

## 34. Estilo protegido
- `index.html`: `darkreader-lock` (Dark Reader), `color-scheme` (modo oscuro automático),
  `notranslate`. `nom.css`: `forced-color-adjust: none`, `text-size-adjust: 100%`,
  `print-color-adjust: exact`. `nucleo.js`: las hojas de estilo ajenas (extensiones de temas) se
  quitan en cuanto aparecen. App Android: sin modo oscuro forzado del sistema (versión 0.3.0).

## 35. Otras correcciones
- `editor.css` tenía declaraciones sin selector (restos de una regla borrada): el navegador las
  juntaba con la regla siguiente y se perdía el estilo del indicador "Guardado".
- La ruedita del lienzo no tapa los tiradores de girar y unir de la figura elegida.
- Pruebas (LibreWolf/Firefox contra el servidor local): texto, imagen, figuras, celdas, selección
  múltiple con uno y dos dedos, exportar a Excel con formato, dos navegadores a la vez, todas las
  pantallas sin errores de JavaScript, tema oscuro y ancho de celular. JUnit 7/7, `cripto.test.js`.

---

# LOG — 22 de octubre de 2026 (noche, 2): acabado de producto premium

## 36. Investigación
- Qué hace que una app se sienta de primer nivel (Linear, Stripe, Vercel, Raycast): densidad de
  comportamiento con visual sobrio, estados de cada elemento diseñados, movimiento corto con
  curvas propias, vacíos que invitan a actuar, paleta de comandos y una bienvenida cálida. La
  estética sube la credibilidad y la facilidad percibidas en los primeros segundos. Detalle y
  fuentes en `docs/DISENO-UI.md` §14.

## 37. Paleta de comandos (Ctrl+K)
- Nuevo `experiencia.js`. Busca documentos de todos los espacios, recientes, espacios y acciones
  (crear, ir a, tema, movimiento, atajos, cerrar sesión, y las del documento abierto: guardar
  versión, historial, descargar, exportar, enfoque, compartir). Sin acentos y por iniciales;
  submenú para elegir el espacio de un documento nuevo. En el texto se abre con Alt+/ (Ctrl+K es
  enlace). Botón "Buscar o ir a…" en el riel, lupa en la barra del celular y en el editor.

## 38. Bienvenida y primeros pasos
- Al entrar, un instante de bienvenida con el nombre y un mensaje según la hora. Al registrarse
  se entra directo (sin volver a escribir la contraseña).
- Tarjeta "Primeros pasos" con anillo de progreso (espacio, documento, ruedita, equipo, ajustes);
  se marca sola y desaparece al completarla u ocultarla. Consejo de la ruedita la primera vez en
  cada editor. Hoja de atajos con la tecla `?`.

## 39. Acabado visual y de movimiento
- Barra de carga arriba (solo si algo tarda, sin parpadeo). Resortes en ventanas, menús, avisos,
  ruedita y paleta; menús que crecen desde su botón; tema que cambia en círculo desde el clic.
- Luz que sigue al cursor en tarjetas, borde de luz en superficies principales, brillo en el botón
  principal, grano fino en el fondo, tipografía balanceada y cifras tabulares, avisos con cuenta
  regresiva que se detienen con el cursor, barras de desplazamiento discretas.
- Vidrio más opaco donde hay texto (menús, ventanas, paleta, avisos, barras con etiquetas) para que
  se lea igual aunque el dispositivo no desenfoque.
- Corrección: la tarjeta "Continúa donde lo dejaste" se apilaba en vertical (heredaba la columna
  de `.tarjeta`); ahora es una fila.

## 40. Pruebas
- Registro → entrada directa → bienvenida → primeros pasos; paleta (buscar, submenú, tema, abrir
  documento), atajos, consejo en el editor; todas las pantallas sin errores de JavaScript, en
  escritorio, ancho de celular y tema oscuro. JUnit 7/7 y `cripto.test.js`.
- Prueba en el teléfono real (Samsung A55, app 0.4.0) y a su ancho (411 px): el botón flotante
  "+" quedaba suelto abajo a la izquierda (la regla nueva del brillo, `.btn.primario
  { position: relative }`, le ganaba a `.fab`; ahora va con `:where(.btn)`), y en "Tus documentos
  en este equipo" los botones se salían a la derecha (los encabezados de sección ya se acomodan en
  dos renglones). La línea de cuenta regresiva de los avisos también salía en el cuadro de
  advertencia (comparte la clase `aviso`): los estilos de aviso emergente ahora son solo de
  `.avisos > .aviso`. App 0.4.1.
- En el teléfono, el consejo de la ruedita tapaba la barra de estado: ahora va encima. El contador
  dice "1 palabra" en singular. App 0.4.2.

---

# LOG — 22 de octubre de 2026 (noche, 3): paridad celular, web y app, probada en el teléfono

## 41. Cómo se probó
- En el teléfono real (Samsung A55) por adb: Chrome contra el servidor local (por Tailscale) y el
  WebView de la app, manejados con el protocolo de DevTools; toques reales con `adb input` para que
  la pulsación larga, la selección y la barra nativa se comporten como con el dedo. Además, todas
  las pantallas a 320, 360, 375, 390, 412 y 430 px de ancho y en horizontal (740×360, 915×412),
  sin nada que se salga.

## 42. La ruedita sale al mantener presionado, centrada en el dedo o el cursor
- Ya no sale sola al terminar de seleccionar (estorbaba). Con el dedo sobre texto sale con la
  pulsación larga del sistema; sobre figuras y celdas, al mantener ~0.55 s. Con el mouse, al
  mantener el clic quieto (también en una pausa al seleccionar arrastrando). Clic derecho: al
  instante. Soltar sin moverse la deja abierta para elegir con un toque; en formato sigue abierta.
- En la app se quitó la barra nativa de Cortar · Copiar · Seleccionar todo (WebView propio,
  `MainActivity.Hoja`); las manijas de selección se quedan. En Chrome esa barra es del navegador.
- "Elegir todo" en la rueda del texto; "Elegir varias" en la del lienzo (reemplaza al mantener una
  figura, que ahora abre la rueda). El título dice qué se eligió (Figura, B2:D5, Imagen…).
- Al cambiar de pantalla se cierra la ruedita (se quedaba abierta encima del inicio). El clic que
  manda el navegador al soltar el mismo gesto ya no la cierra.

## 43. Mismo movimiento y vidrio en todos lados
- El teléfono tenía las animaciones del sistema apagadas y la página lo respetaba: en el celular
  no se veía ninguna animación. Ahora manda la preferencia de la app ("Reducir movimiento").
- La ruedita es vidrio de verdad (más transparente, con desenfoque y saturación); en tema oscuro un
  poco más densa para que la tinta clara se lea sobre hojas blancas.

## 44. Textos y detalles del celular y la app
- En la app ya no dice "este navegador": los documentos sin cuenta viven en la app (en el teléfono)
  y se pierden si se desinstala o se borran sus datos.
- Entrar en la app: en vez de "dirección · cambiar" arriba, abajo dice "Conectado a NOM-COLAB en
  Internet · Cambiar" (o "tu red · IP"), con su explicación.
- Sin cuenta: tarjeta "Espacios de trabajo" que explica qué son (necesitan cuenta) con "Crear
  cuenta" y "Ya tengo cuenta".
- Vacíos: en celulares angostos los botones se apilan del mismo ancho y centrados.
- Hoja de cálculo: las celdas ya no seleccionan texto al mantener el dedo.
- Presentación: la tira de miniaturas salía vacía hasta el primer cambio (se pintaba antes de que
  existiera su función); ahora sale desde el inicio. App 0.5.0.

## 45. El teléfono puede ser el servidor; la ruedita se va al hacer la acción
- La lógica del servidor (cuentas, espacios, documentos, CRDT, descubrimiento) se separó de
  Spring en `4-CODIGO/nucleo`. El servidor de la computadora la usa igual que antes (mismas
  rutas y respuestas; pruebas de API 41/41 y de interfaz sin errores).
- La app Android (8+) trae ese mismo núcleo: "Usar este teléfono como servidor" enciende un
  servicio en primer plano con su servidor HTTP en el puerto 8080, la API, el tiempo real y la
  página web para los demás. Se anuncia en la red: otras apps lo encuentran con "Buscar en la
  red" y las computadoras entran con `http://IP-del-teléfono:8080`. Funciona también con el
  punto de acceso del teléfono, sin router ni Internet.
- Probado en el teléfono: la prueba de API pasa 41/41 contra el teléfono con las mismas formas
  de respuesta que la computadora; desde una computadora se abrió la página servida por el
  teléfono, se creó cuenta, espacio y documento, y lo escrito llegó en vivo a otro cliente.
- Notificación fija con la dirección y botón Detener; panel "Servidor en este teléfono" en
  *Este dispositivo* (copiar y compartir la dirección, apagar).
- Ruedita: al elegir cualquier acción (también formato) la rueda se cierra. App 0.6.0.

## 46. Logo nuevo: "la llama compartida"
- Se investigó la psicología de formas y colores en logos (Jiang et al. 2016; Henderson y Cote
  1998; Wiessner 2014 sobre la plática junto al fuego) y las reglas de íconos de app y de
  Android. El ícono anterior (cuatro cuadros de colores) caía en el problema de los íconos de
  Google Workspace de 2020 y se parecía al logo de Microsoft.
- Marca nueva: dos lenguas de fuego, índigo (la interfaz) y naranja (`--llama`, el lema de
  WACK), que se inclinan una hacia la otra y forman una sola llama, sobre un fondo de noche
  índigo. Logotipo en Nunito con el guion color llama. Manual en `4-CODIGO/docs/MARCA.md`,
  archivos en `4-CODIGO/marca/`.
- Aplicado en la página (favicon, símbolo `#logo`, íconos del manifiesto y versión maskable)
  y en Android (ícono adaptable con degradados, capa monocromática para los íconos con tema y
  un ícono de un solo color para la notificación del servidor). Jar y APK recompilados.

## 47. El logo nuevo en todas partes y revisión de la interfaz
- **Logo nuevo en la presentación y el documento del módulo:** `5-PRESENTACION/imagenes/logo-nom.png`
  es ahora la llama compartida (texto alternativo actualizado). El logo de WACK no cambió.
- **Capturas rehechas** (las 17 `lf-*.png`, mismos tamaños) con datos de demostración en un servidor
  aparte: cuentas maestra.lupita (administradora), profe.demo, uriel.mo y josep.sf (bloqueada);
  calificaciones con números, plan de clase lleno y una edición de uriel.mo desde el celular para la
  pestaña Actividad. Se volvieron a imprimir los dos PDF de `ENTREGA/` y se actualizó el deck publicado
  (portada y las cuatro diapositivas de Look & Feel).
- **La presentación cubre toda la lista de la rúbrica:** se agregaron dos diapositivas de la empresa
  (de `PE_WACK.docx`): nombre, eslogan, misión y visión, y el organigrama redibujado con los cuatro
  integrantes. Quedan 22 diapositivas: empresa (nombre, misión y visión, organigrama) y proyecto
  (nombre, problemática, mapa de navegación, casos de uso con especificación, secuencia y actividades
  de los 2 módulos, Look & Feel de los 2 módulos, entidad-relación y avance web y móvil).
- **Revisión de la interfaz** (claro, oscuro y celular), corregido:
  - Tarjetas de documento: cada tipo tiene su miniatura (renglones, cuadrícula, diapositiva o
    figuras unidas) que se levanta al pasar el cursor; el nombre va en una línea para que todas
    las tarjetas queden alineadas. Clase `.dmini` (la `.mini` ya era de las diapositivas).
  - Plantillas: "Plan de clase" y "Acta de reunión" usan el estilo Título de Word; en "Proyecto",
    la barra de color ya no tapa el título; los promedios de "Calificaciones" se redondean.
  - Editor de texto: el tamaño de letra se ve desde que abre (antes salía vacío) y la fuente dice
    "Calibri" sin cortarse.
  - Las miniaturas de diapositivas alinean el texto igual que la diapositiva (antes salía centrado).
  - El consejo del editor de texto ya no menciona la pausa al seleccionar (la ruedita sale solo al
    mantener presionado).
  - Primeros pasos: lo hecho ocupa una línea y lo pendiente explica en dos como máximo.
  - Este dispositivo ya no lista filas sin nombre (colas vacías de documentos sin copia).
  - Un aviso que aparece bajo el ratón quieto ya no se queda congelado: solo se pausa si el cursor
    se mueve encima.
- Jar y APK recompilados; app 0.7.0.

## 48. Sin administrador general y servidor propio en internet
- **Se quitó el rol ADMINISTRADOR** (pantalla "Administrar usuarios", `/api/admin/**`, `FiltroRol`,
  `Rol`, la cuenta inicial `NOM_ADMIN_*` y la regla "la primera cuenta administra"), en el servidor,
  el teléfono como servidor y la interfaz. Nadie ve ni maneja las cuentas de los demás: cada cuenta
  controla sus espacios y documentos, y el propietario de cada espacio cambia permisos (*Puede
  editar* / *Solo lectura*) o quita el acceso; el servidor responde 403 a lo demás.
- **Base de datos:** ya no existe la tabla `rol` ni `usuario.id_rol`. Las bases de antes se
  migran solas al arrancar (H2 y Azure SQL), conservando las cuentas. Probado: una base creada con
  la versión anterior abre con la nueva (cuentas y espacios intactos, `/api/admin` ya no existe,
  segundo arranque sin errores) y el script de Azure SQL se probó en un esquema aparte de la base
  real (el acceso se abrió unos minutos y se volvió a cerrar).
- Diagramas actualizados (casos de uso de cuentas sin CU-30, entidad-relación, modelo de datos,
  secuencia de inicio de sesión, mapa de navegación), la especificación de casos de uso,
  `DESPLIEGUE-AZURE.md`, `LEEME.md` y `README.md`. **Falta** actualizar la presentación y el PDF
  del módulo, que todavía muestran el rol de administrador (pendiente de decidir).
- **Servidor propio:** NOM-COLAB corre en la laptop del equipo y sale a internet con Tailscale
  Funnel en `https://nomcolab.tailfd65f2.ts.net` (enlace corto `is.gd/nomcolab`), gratis, sin abrir
  puertos y con HTTPS. Servicio de usuario `nomcolab.service` (no arranca solo), datos en
  `~/nomcolab-servidor`, respaldo diario y al apagar. Archivos e instalador en
  `4-CODIGO/servidor-propio/`; guía en `docs/SERVIDOR-PROPIO.md`.
- **`nomcolab` con menú:** 1 Azure / 2 Local, y luego Prender, Apagar, Estado o Reiniciar (también
  `nomcolab local up`, etc.; `--up/--down` siguen para Azure). Mensajes en español.
- Dominio `nomcolab.eu.org` solicitado (gratis), zona lista en Cloudflare; pendiente de aprobación.

## 49. Seguridad con roles en la base de datos, documentación al día y sin presentación
- **Roles en Azure SQL, como la práctica 7** (usuarios y privilegios en Oracle): la página ya no
  entra con el administrador del servidor (`nomadmin`) sino con `nomcolab_app`, que recibe sus
  privilegios por el rol `rol_nomcolab_app` (`SELECT/INSERT/UPDATE/DELETE` en `usuario`, `sesion` y
  `preferencias`; nada de `CREATE/ALTER/DROP`). `rol_nomcolab_consulta` (usuario `nomcolab_lector`)
  lee por columnas, sin `hash_contrasena` ni `sal`. Script `azure/roles-bd.sql`, aplicado con
  `./desplegar.sh roles` (nuevo; usa `azure/AplicarSql.java` con el controlador del propio jar).
- Aplicado y probado en Azure: 15 de 15 comprobaciones (sin rol: todo negado; la app no puede
  crear, cambiar ni borrar tablas; el lector no ve contraseñas) y el flujo completo de la página
  conectada como `nomcolab_app`. La Web App quedó con ese usuario y sin `NOM_ADMIN_*`. La base se
  abrió solo durante las pruebas y quedó cerrada.
- **Pruebas de seguridad de la aplicación** en `4-CODIGO/pruebas/seguridad.py`: 20 de 20 (sesión,
  validación, bloqueo y los roles de cada espacio).
- **Solo lectura:** la barra del editor ahora solo trae buscar, enfoque y descargar (antes la regla
  que la atenuaba no se aplicaba y además habría bloqueado las descargas); buscar no ofrece reemplazar.
- **Se eliminó la presentación** (PDF, fuentes e imágenes que solo usaba ella). `5-PRESENTACION`
  pasó a `5-DOCUMENTO-MODULO` con lo que usa el documento del módulo; `imprimir.py` ya no necesita
  Selenium. El PDF es ahora `ENTREGA/Modulo web con BD, Azure y roles - NOM-COLAB.pdf` (9 páginas),
  reescrito: roles en la base y por espacio, pruebas reales, capturas nuevas de Compartir y de
  Solo lectura.
- **Documentación revisada contra el código:** `LEEME.md`, `README.md`, `DESPLIEGUE-AZURE.md`
  (sección de roles de la base), `DISENO-UI.md` (ya no habla del selector de modo ni de la
  minibarra; agrega miniaturas y solo lectura), diagrama de paquetes (Spring Boot 4.1, dónde corre).

## 50. NOM-COLAB en https://nomcolab.dpdns.org, siempre prendido
- **Dominio propio:** `nomcolab.dpdns.org` (gratis, DigitalPlat) con la zona en Cloudflare. Un
  Cloudflare Tunnel (`nomcolab`) lo une con el servidor propio de esta computadora sin abrir
  puertos; Cloudflare pone el HTTPS. También `www.nomcolab.dpdns.org`. Funnel sigue como segunda
  dirección.
- **Siempre prendido:** el servidor y el túnel arrancan solos con la computadora (sin iniciar
  sesión) y se levantan si se caen; un vigía revisa cada 2 minutos y reinicia lo que no conteste;
  la computadora ya no se duerme (tapa ignorada, suspensión deshabilitada). Probado: al matar el
  servidor volvió a responder en el dominio en unos 8 s.
- **App:** "Usar NOM-COLAB en Internet" ahora entra a `https://nomcolab.dpdns.org`; la app 0.11.2
  y el jar se recompilaron (pruebas de seguridad: 171 de 171).
- `nomcolab` (Local) maneja también el túnel; "Apagar" quita el arranque automático hasta el
  siguiente "Prender". Archivos nuevos en `4-CODIGO/servidor-propio` (`tunel.sh`, `vigia.sh`,
  `nomcolab-tunel.service`, `nomcolab-vigia.*`, `logind-siempre-prendido.conf`). Guía:
  `docs/SERVIDOR-PROPIO.md`, con los pasos para pasarlo a la Raspberry Pi.

## 51. Descargar la app desde la página, sin gastar la conexión del servidor
- La pantalla de inicio (solo en el navegador, no dentro de la app) muestra "¿Usas Android?
  Descarga la app". El enlace apunta a la **release más reciente de GitHub**
  (`releases/latest/download/NOM-COLAB.apk`), así que el archivo lo entrega el CDN de GitHub
  (Fastly) y no la conexión de casa donde corre `nomcolab.dpdns.org`.
- Se eligió GitHub porque el token de Cloudflare (el del túnel) solo puede tocar el túnel y el
  DNS, no las reglas de caché; y porque así la descarga nunca pesa sobre el ancho de banda del
  servidor y siempre da la última versión publicada.
- Release `v0.11.2` creada con el APK (2.7 MB). Para las próximas versiones:
  `4-CODIGO/android/publicar-apk.sh` sube el APK actual y lo marca como el más reciente (lee la
  versión de `build.gradle.kts` y el token de `~/NOM/tokensito`).
- Desplegado y probado en `https://nomcolab.dpdns.org` (el botón aparece en un navegador real y
  el enlace responde 200). En la página de Azure aparecerá cuando se haga push a `main`.

## 52. Revisión de la conversión con Office y de la red: lo que se VE, no solo lo que se descarga
Revisión del 11 de noviembre de 2026. Las pruebas de la fase 10 daban 100 %, pero ese número solo
dice que un archivo sin tocar se descarga igual (sale del original guardado dentro del
documento). No decía qué se veía en el editor. Se armó un Word con combinaciones raras
(`pruebas/office/raros.py`) y se abrió en el editor de verdad.

- **Lo que estaba mal en pantalla y ya quedó (Word):** la hoja se tomaba de la última sección (un
  B5 vertical se veía carta horizontal) y ahora es la de la primera, con tamaños que no son de los
  comunes; borde de página; borde y fondo de párrafo; fuente, tamaño, interlineado y espacios que
  vienen del estilo y del tema (casi nada trae formato propio); interlineado exacto; encabezado y
  pie con sus tres lugares y el número de página donde va (y sin número si el archivo no trae);
  versalitas, mayúsculas y espacio entre letras; texto de derecha a izquierda; el texto de los
  cuadros de texto, SmartArt y gráficos se lee en un recuadro; en las tablas, cursiva, color,
  alineación y anchos de columna, y la tabla anidada renglón por renglón.
- **Columnas:** se siguen viendo a una columna, con una marca donde empieza cada sección y un
  aviso al importar (al descargar salen en columnas). La sección que empieza en hoja nueva, empieza
  en hoja nueva.
- **Error grave que no se había visto:** al TECLEAR en un párrafo importado, el cursor saltaba al
  inicio del renglón y el párrafo perdía su liga con el original (al descargar salía sin su borde,
  su fondo ni sus tabuladores). Las pruebas editaban con operaciones, no con el teclado. Causa: lo
  que se pinta de un párrafo tiene que poder leerse de vuelta de la página, y esa liga no se
  pintaba. Corregido; `pantalla.py` ahora teclea de verdad.
- **Fuentes que el equipo no tiene:** van dentro de la aplicación las equivalentes de medidas
  iguales (Carlito, Caladea, Liberation Sans, Serif y Mono, Comic Neue; 450 KB, licencia OFL),
  recortadas al alfabeto latino. Un Android no trae ninguna y el texto medía otra cosa. Una fuente
  desconocida cae en una de su tipo (con remates, palo seco, de máquina o manuscrita), ya no
  siempre en palo seco.
- **PowerPoint:** el SmartArt ya se ve (con el dibujo que el archivo guarda, o armado como
  organigrama o lista si no lo trae) y las figuras toman los colores del tema.
- **Red:** un documento con cambios sin enviar no se podía volver a abrir estando sin conexión
  (se quedaba cargando): `editor.js` retomaba el envío antes de armar la pantalla. Corregido.
- **Versiones:** el servidor informa su versión y su nivel de interfaz (`core/Version.java`,
  `/api/red/info`) y la app avisa si no coinciden (antes siempre decía 0.1.0 y nadie comparaba).
  App 0.12.0.
- **En el celular:** sin páginas, las sangrías en centímetros se achican para no dejar el texto
  en una tirita.
- **Pruebas nuevas:** `pruebas/office/pantalla.py` (lo que se ve, tecleando de verdad; 32 de 32 en
  computadora y 19 de 19 en ancho de celular), `fidelidad.py --modelo` (lo que NOM-COLAB entiende
  sin apoyarse en el original: Word 91.8 %, antes 82.6 %; Excel 59.2 %; PowerPoint 78.5 %) y
  `pruebas/interfaz/prueba_red.py` (página, celular y la interfaz del APK contra un servidor, con
  y sin conexión: 24 de 24). Sin tocar: 100 % en 47 archivos; ediciones 144 de 144; seguridad 171
  de 171.
- **Excel:** las celdas se ven con su tipo de letra y con los colores del tema (antes un relleno
  o una letra "de tema" salían sin color).
- **Publicado el mismo día, servidor y app juntos:** jar nuevo en `2-PAGINA-Servidor/` y en la
  Raspberry (`nomcolab-pi actualizar`: respaldó los datos y arrancó la versión nueva;
  `https://nomcolab.dpdns.org/api/red/info` responde 0.12.0, interfaz 12) y APK 0.12.0 en
  `3-APP-Android/` y como release más reciente en GitHub. Antes de publicar se probó el jar final
  sirviendo su propia página y la interfaz sacada del APK final contra él. La página de Azure no
  se tocó.
- **Falta:** tabuladores con puntos, texto vertical y bordes por celda en tablas de Word; en
  Excel, ver comentarios, formato condicional, gráficas e imágenes del archivo (se conservan al
  descargar); columnas de verdad en pantalla; probar en el A55. Los respaldos de la Raspberry se
  guardan en la misma Raspberry: falta sacar una copia a otro equipo.


## 53. Seguridad, cuentas y almacenamiento (0.12.1)
Revisión del 11 de noviembre de 2026 de todo lo que toca a las cuentas, a dónde se guarda cada
cosa y a la seguridad, con dos cuentas en un mismo navegador. Lo que ya estaba bien no se tocó: la
copia de cada equipo va cifrada por cuenta, una cuenta no ve nada de otra (ni sin conexión), el
HTML metido a la fuerza no se ejecuta y las contraseñas van con sal y PBKDF2.

- **Restablecer la contraseña ya no destruye lo que solo estaba en el equipo.** Antes, al entrar
  con la contraseña nueva, la copia cifrada con la anterior se borraba sin avisar (documentos de
  "Guardado en este equipo" y cambios sin enviar). Ahora se aparta, todavía cifrada, y al entrar
  se ofrece recuperarla escribiendo la contraseña anterior (o borrarla, o dejarlo para después;
  queda también en el menú de la cuenta). Los cambios sin enviar recuperados se mandan al servidor.
- **Cambiar la contraseña desde la cuenta** (menú de la cuenta): pide la actual, cierra las demás
  sesiones y lo guardado en ese equipo sigue abriendo sin pedir nada. En los otros equipos se pide
  la anterior una vez.
- **Borrar la cuenta** (menú de la cuenta): dice qué se borra, pide la contraseña y escribir el
  nombre. Se borran sus espacios con sus documentos y versiones, sale de los espacios de otros (lo
  que escribió ahí se queda), su nombre queda libre y en ese equipo no queda nada suyo.
- **Se ve dónde está guardado cada cosa.** En el inicio, bajo "Tus espacios": "Guardados en
  NOM-COLAB en Internet · 12 MB de 200 MB", con su barra; al tocarlo, el detalle por espacio. En
  la barra lateral, "En el servidor" junto a "Guardado en este equipo". "Nuevo documento" e
  "Importar" del inicio preguntan dónde: en un espacio (queda en el servidor y se ve en todos los
  equipos; es la opción por omisión) o solo en ese equipo.
- **Decidido por el dueño: no habrá respaldo en el Drive de cada persona.** El servidor guarda
  todo, con un límite por cuenta (200 MB en la Raspberry) que cada quien ve, y solo guarda
  documentos de NOM-COLAB, comprimidos: no hay forma de subir otros archivos. Para que eso sea
  cierto también en el disco, el estado de cada documento y las fotos de sus versiones se
  escriben con gzip (`AlmacenJson`); lo guardado por versiones anteriores se abre igual y se
  comprime al volver a guardarse. El tope de 25 MB por documento sigue midiendo el contenido sin
  comprimir.
- **Bloqueo de intentos por red.** Seis fallos bloquean 15 minutos a la red desde la que se
  falló, no al dueño de la cuenta que entra desde la suya (antes, quien supiera un nombre de
  usuario podía tenerlo bloqueado). Más de 50 fallos en una hora desde todos lados sí bloquean la
  cuenta. Detrás del túnel se usa la dirección real que manda Cloudflare.
- **Tope de cuentas nuevas:** 30 por hora desde una misma red y 300 en total.
- **Cabeceras de seguridad** en todas las respuestas y política de contenido en la página (solo
  corren los programas del propio servidor). La app lleva la misma política dentro de
  `index.html`. De paso: los errores del servidor salen siempre como JSON (al canal en vivo, que
  pide otro tipo de contenido, un 401 se le convertía en 500).
- **El canal en vivo ya no lleva el token de la sesión en la dirección:** abre con un boleto de un
  solo uso que dura 30 segundos. Los servidores anteriores siguen funcionando con la app nueva.
- **Aviso de "Conexión sin cifrar"** en la pantalla de entrada cuando se entra por la red local
  (http): ahí no hay forma de dar un certificado de confianza.
- **App de Android:** sin respaldo del sistema (ni en la nube ni al pasar a otro teléfono) y el
  APK que se publica ya no es de depuración (`assembleRelease`): otra app o una computadora por
  USB no pueden leer sus datos. Va firmado con la misma llave de siempre
  (`~/.android/debug.keystore` de la laptop), así que se instala encima de la anterior. **Hay que
  guardar copia de ese archivo**: sin él nadie puede publicar una actualización.
- **El teléfono como servidor** tiene lo mismo: rutas nuevas, bloqueo por red, cabeceras y boletos.
- **Detrás de Azure** la dirección real de cada quien también se toma de la cabecera que manda la
  plataforma (llega desde una dirección "de enlace", 169.254.x.x); sin eso, todos contarían como
  una sola red y el tope de 30 cuentas por hora sería para todos juntos.
- **El jar se empaqueta limpio** (`mvn clean package`): el anterior todavía cargaba un archivo
  de la pantalla de administración que se quitó en octubre (`vista-admin.js`, sin uso).
- **Respaldos de la Raspberry fuera de la Raspberry:** la laptop trae cada día el más nuevo
  (`servidor-propio/pi/traer-respaldos.sh`, temporizador `nomcolab-traer-respaldos`, guarda 30 en
  `~/nomcolab-servidor/respaldos-pi/`).
- **Decidido por el dueño: el disco de la Raspberry no se cifra.** No sale de casa y tiene que
  arrancar sola; una llave guardada en la misma tarjeta no protegería nada.
- **Pruebas:** `pruebas/seguridad.py` pasó de 171 a 226 casos (226 de 226 contra el jar; 206 de
  206 contra el teléfono como servidor, en el emulador de Android 15 con el APK publicable).
  Nueva `pruebas/interfaz/prueba_cuentas_equipo.py` (57 de 57: dos cuentas en un navegador,
  restablecer y cambiar la contraseña, recuperar lo del equipo, almacenamiento, borrar la cuenta,
  boletos y el aviso de red local). Con las cabeceras puestas siguen pasando todas las demás;
  `pruebas/office/ediciones.py` armaba sus ediciones con texto evaluado dentro de la página, cosa
  que la política ya no deja, y ahora las escribe en el propio programa de la prueba.
  La política de contenido de la app se probó en el WebView del emulador (sin una sola
  violación); en el A55 todavía no.
- **Publicado el mismo día, servidor y app juntos**, después de pasar todas las pruebas contra el
  jar final sirviendo su propia página y con la interfaz sacada del APK final (fidelidad 100 % en
  47 archivos, ediciones 144 de 144, interfaz 9 y 9, en pantalla 32 y 19, red 24 de 24, cuentas
  57 de 57 y las demás de la página): jar en `2-PAGINA-Servidor/` y en la Raspberry
  (`nomcolab-pi actualizar`; `https://nomcolab.dpdns.org/api/red/info` responde 0.12.1, interfaz
  13, y se probó por el túnel con una cuenta de prueba que luego se borró) y APK 0.12.1 en
  `3-APP-Android/` y como release más reciente en GitHub. Esta vez también va a git y a Azure
  (el push a `main` lo despliega).
- **Falta:** probar en el A55 (la app publicable y su política de contenido solo se vieron en el
  emulador); guardar una copia de `~/.android/debug.keystore` fuera de la laptop; y lo de Word y
  Excel que ya estaba pendiente (entrada 52).

## 54. Revisión completa en equipos reales y 0.12.2 (13 de noviembre de 2026)

Se probó **cada función** de la app en todos los lugares donde se usa, a mano y con pruebas
automáticas nuevas, y se corrigió todo lo que salió mal. El detalle para retomar está en
`4-CODIGO/docs/RELEVO-PRUEBAS-0.12.2.md`; la lista de defectos, en `PLAN-CONSTRUCCION.md`, fase 12.

- **Dónde:** la laptop (Chromium y Firefox), el escritorio `flast-desktop` (Chromium real en su
  pantalla), el **Samsung A55** (Chrome y la app, con toques de verdad por `adb`, el teclado del
  teléfono y la ruedita con el dedo) y la **nube propia** (la Raspberry, `nomcolab.dpdns.org`) con
  tres equipos a la vez. El A55 también como **servidor**: 212 de 212 de `seguridad.py` y la app,
  la laptop y el escritorio escribiendo a la vez en el mismo párrafo sin perder una letra.
- **Pruebas nuevas:** `pruebas/interfaz/rastreo.py` toca cada botón, cada opción de cada menú y cada
  acción de la ruedita (y sus submenús) de los cuatro editores y anota errores;
  `pruebas/interfaz/prueba_funciones.py` revisa que cada función haga lo correcto (fórmulas,
  formato, listas, enlaces, tablas, notas, índice, comentarios, sugerencias, partes con dueño, QR
  leído de la pantalla, entrar con apodo, recibo verificable, grupos dentro de grupos, capas, mesa
  de trabajo, notas del orador, modo presentador, conectores, registro, sin cuenta, letra del
  espacio, protección, entrega, descargar todo, Ctrl+K y sin red); `pruebas/office/visor.py` pone
  lado a lado cómo se ve un archivo en NOM-COLAB y en LibreOffice. Todas corren también con
  `--movil`, con Firefox, contra un navegador ya abierto (`--cdp`) y dentro de la app (`NOM_APP=1`).
- **Archivos reales de Microsoft nuevos:** 43 .docx, .xlsx y .pptx hechos con Word, Excel y
  PowerPoint (de las pruebas de regresión de LibreOffice y del paquete officer), además de los 47
  de antes.
- **Corregido (DEF-18 a DEF-34):** el tope de 25 MB se revisa antes de aplicar y responde 413 (lo
  escrito se queda en el equipo); la API manda `Cache-Control: no-store` (los documentos ya no se
  quedan en claro en la caché del navegador, y Firefox sin red ya no da una copia vieja); un
  documento con cambios sin enviar de una hoja o presentación ya se abre sin red; deshacer la
  creación de una figura ya no deja un bloque vacío; la ruedita cerca de la orilla ya no elige sola
  al soltar (podía tocar "Eliminar fila"); en el celular, tocar el número de una fila ya la elige,
  la tabla se inserta (el selector salía fuera de la pantalla) y las notas al pie se ven; con un
  grupo elegido la ruedita ofrece "Desagrupar"; una parte dañada de un archivo de Office ya no
  tumba la exportación ni el .nom (se copia tal cual); un archivo de Office sin cambios sale
  idéntico aunque se haya abierto en el editor (marca UTF-8 y sangría del XML); copiar y pegar
  funcionan en http (red del salón) sin decir "copiado" en falso; el orden personal ya no mueve el
  encabezado; elegir una fila o columna ya no corre la hoja; las manijas de Android ya no tapan la
  ruedita; la bienvenida ya no se traga el primer clic; la cita ya no deja doble espacio.
- **Documentos al día:** mapa de navegación, diagramas de actividades A1 y A2, especificación de
  casos de uso, README, LEEME, SERVIDOR-PROPIO (la Raspberry), documento del módulo y plan de
  pruebas (con los resultados y los defectos de esta revisión).
- **Resultados con la versión final 0.12.2** (registros en `6-PLAN-DE-PRUEBAS/registros/13-nov/`):
  unitarias 35 de 35 · seguridad 226 de 226 (y 212 de 212 con el A55 como servidor) · valores
  límite 18 de 18 (DEF-18 cerrado) · Office sin cambios 100 % en 90 archivos reales de Microsoft ·
  ediciones de Office 144 de 144 · Office por la interfaz 90 y 90 (computadora y celular) · en
  pantalla 32 y 19 · red 24 de 24 · cuentas y equipo 57 de 57 · funciones de la interfaz 167 de 167
  en computadora, celular y Firefox, 159 de 160 en el Chromium real del escritorio (la descarga se
  revisó aparte: en http Chrome pide "Conservar") · rastreo: más de 500 acciones por equipo sin un
  solo error de JavaScript (computadora, celular, Firefox, escritorio y la app del A55). Lo que el
  rastreo no alcanzó a reabrir de la ruedita se revisó a mano.
- **Publicado:** jar en `2-PAGINA-Servidor/` y en la Raspberry, APK 0.12.2 en `3-APP-Android/` y
  como release de GitHub; `main` empujado (despliega a Azure).
- **Falta:** confirmar en la app del A55 dos casos (una celda tecleada muy rápido y la fecha de
  entrega) que no se pudieron repetir porque el teléfono apagó la depuración inalámbrica; cinco
  equipos a la vez en la red de la escuela; la prueba con usuarios (SUS); ver los dibujos de Word y
  los encabezados con tablas o logotipos igual que Word. Detalle en `docs/RELEVO-PRUEBAS-0.12.2.md`.

## 55. ¿De verdad abre sin Internet en la computadora? Sí, también tras cerrar de golpe (0.12.3)

La pregunta: en otras páginas, recargar sin Internet deja la pantalla del dinosaurio; ¿con NOM-COLAB
no? Se comprobó a mano en el Chromium real del escritorio contra la Raspberry
(`https://nomcolab.dpdns.org`), quitando el acceso al dominio.

- **Cómo funciona:** la primera vez, con Internet, el *service worker* guarda la página entera (unos
  20 s después de abrir) y cada documento abierto queda cifrado en la bóveda del navegador. Sin
  Internet, la misma dirección abre la copia guardada y los documentos ya abiertos antes; lo escrito
  se envía al volver la red. No sirve para entrar por primera vez, iniciar sesión, abrir un documento
  que nunca se abrió en ese navegador, en una ventana privada ni por `http://IP:8080` (los navegadores
  solo dejan usar el service worker en https o localhost; en el salón no hace falta, el servidor
  está en la misma red).
- **Navegador cerrado normal:** abre, el documento sale con su texto, dice «Sin conexión», se sigue
  escribiendo y al volver la red llega a la Raspberry.
- **Corregido (DEF-35):** si el navegador se cerraba de golpe (`kill -9`, como si se fuera la luz),
  pedía iniciar sesión, y sin Internet eso no se puede. Chromium no había escrito al disco el token
  de `localStorage` (la llave de la bóveda, en IndexedDB, sí). Ahora una copia de la sesión va junto
  a esa llave y se recupera al abrir; cerrar sesión la borra. Lo mismo pasaba en la app cuando
  Android la cierra para liberar memoria.
- **Corregido (DEF-36):** el servidor dejaba un error en su bitácora cada vez que alguien cerraba una
  pestaña (revisaba de nuevo la sesión del canal en vivo con el boleto ya usado).
- **Pruebas con 0.12.3:** cuentas y equipo 61 de 61 (sección nueva, 11: cierre de golpe) ·
  seguridad 226 de 226 · valores límite 18 de 18 · red 24 de 24 · funciones 167 de 167 en
  computadora y con ancho de celular · unitarias 8 de 8 (JUnit) · ciclo real en el escritorio con
  `kill -9` y sin red: abre con la sesión y el documento (dos de dos); cerrar sesión y luego `kill
  -9`: no queda ninguna copia y pide entrar.
- **Publicado:** jar 0.12.3 en `2-PAGINA-Servidor/` y en la Raspberry, APK 0.12.3 (versionCode 19,
  misma llave) en `3-APP-Android/` y como release de GitHub; plan de pruebas regenerado (1542 de 1542,
  DEF-35 y DEF-36). Cómo repetir la prueba en el escritorio: `4-CODIGO/docs/RELEVO-PRUEBAS-0.12.2.md`,
  sección 6.
- **Sigue faltando:** regresar el A55 (depuración inalámbrica apagada) y confirmar ahí los dos casos
  de la app; quitar en Cloudflare el script de estadísticas que mete en la página (la política de
  contenido lo bloquea, pero ensucia la consola).


## 56. Sin Internet sin cuentas, ramas, cifrado y chat: fases 13, 14 y 15 (0.13.0, 13 de noviembre de 2026)

Se construyó completo el plan cerrado ese mismo día (`4-CODIGO/docs/PLAN-CUENTAS-PC-Y-AYUDA.md`),
en el orden de su parte H.

- **Licencia:** GPL-3.0 (archivo `LICENSE` y sección en los LEEME).
- **Fase 13, sin Internet:** el teléfono que comparte ya no tiene cuentas con contraseña. Quien no
  tiene Internet entra con un **alias al azar** (sin escribir nada; su equipo guarda la llave para
  volver a ser el mismo). Quien sí tiene Internet entra con su cuenta de la nube: la Raspberry le da
  un **pase firmado** (ECDSA P-256, 10 minutos, de un solo uso) y el teléfono lo acepta porque el APK
  trae la llave pública de la Raspberry (`static/pases/nubes.json`). Se pueden crear documentos en un
  espacio sin Internet (se suben solos al volver) e instalar la página en la computadora.
- **Ramas:** lo editado sin conexión se sube tal cual si nadie más cambió el documento; si alguien lo
  cambió (y se estuvo más de 2 minutos sin conexión), lo propio queda en una **rama** y el original
  no se toca. En el original aparece «Ramas (n)»: comparar, fusionar (con versión para regresar),
  dejar aparte o descartar.
- **Cifrado en reposo (D.1):** el servidor guarda cifrado (AES-256-GCM) todo lo que escribe:
  documentos, versiones, bitácoras, espacios, la base de cuentas (H2 con `CIPHER=AES`) y por lo tanto
  los respaldos. La llave vive aparte (`<datos>-llaves/reposo.key`); sin ella el servidor no arranca
  (no empieza de cero). Al arrancar, lo que estaba en claro se cifra solo: en la Raspberry, 89
  archivos y la base de cuentas, el 13 de noviembre.
- **Fase 14, ayuda y legal:** sitio estático `/ayuda/` y `/legal/` (65 páginas, sin sesión, lo
  principal también sin Internet), aviso de privacidad integral y simplificado, términos, uso
  aceptable, denuncias; aceptar los términos al registrarse; «Descargar los datos de mi cuenta».
  Cloudflare ya no mete su script de estadísticas y la bitácora de la Pi la rota s6 (10 × 1 MB),
  sin IPs de quien entra.
- **Fase 15, extremo a extremo y chat:** al crear un espacio se puede marcar **Cifrado de extremo a
  extremo**: el nombre, los documentos y el chat se cifran en el equipo de cada miembro (cada cuenta
  tiene un par de llaves; la privada va envuelta con la contraseña y con el código de recuperación).
  El servidor guarda la estructura (para que la edición a la vez, los permisos y las ramas sigan
  funcionando) pero no lo que dice. La llave llega a cada miembro envuelta para él, o en el `#` del
  QR, que nunca pasa por el servidor; el enlace para ver y el proyector llevan la llave del documento
  en la dirección. Cada espacio tiene su **chat** con imágenes y archivos de hasta 2 MB.
- **Corregido al probar:** el servidor no guardaba la marca de las letras cifradas y, al abrir de
  nuevo un documento cifrado, salían letras raras; un nombre en claro se podía poner con «Renombrar»
  en un espacio cifrado; un archivo de casi 2 MB no cabía en el chat cifrado (crece al cifrarse); el
  enlace para ver mostraba el nombre cifrado del espacio; el alias dueño del teléfono veía la opción
  de espacio cifrado, que no puede usar.
- **Pruebas con 0.13.0:** seguridad 363 de 363 · extremo a extremo en el navegador 27 de 27 (el
  servidor nunca ve el texto, el nombre ni el chat) · sin Internet 22 de 22 · ayuda 18 de 18 ·
  funciones 170 de 170 · red 24 de 24 · cuentas y equipo 61 de 61 · valores límite 18 de 18 ·
  unitarias 9 de 9 · el teléfono como servidor en el emulador (APK publicable) 18 de 18 · en la
  Raspberry ya publicada: cuenta, documento, pase, chat y espacio cifrado.
- **Publicado:** jar 0.13.0 en `2-PAGINA-Servidor/` y en la Raspberry; APK 0.13.0 (versionCode 20,
  misma llave) en `3-APP-Android/` y como release de GitHub.
- **Importante para el equipo:** guardar fuera de la Pi la carpeta `/var/lib/nomcolab/datos-llaves`
  (la llave del cifrado y la de firmar pases): sin ella no se abren los datos ni los respaldos, y si
  cambia la de los pases hay que publicar otro APK. Se lee con `doas cat
  /var/lib/nomcolab/datos-llaves/reposo.key` (pide la contraseña de la Pi).
- **Falta:** el ciclo real en el escritorio con la Raspberry (estaba apagado), el A55, el correo del
  proyecto y lo de Office de la fase 10.

## 57. Plan de pruebas de la presentación, 50 personas, tope por dispositivo y DEF-42 (0.13.1, 13 de noviembre de 2026, noche)

- **Revisión de lo que falta para presentar** (≈20 de noviembre): plan completo en
  `4-CODIGO/docs/PLAN-PRUEBAS-PRESENTACION.md` (bloques A a K: regresión, lo nuevo de 0.13.0 en
  equipos reales, red de la escuela, capacidad, almacenamiento, Office sin romper archivos, archivos
  ligeros, nuestros documentos a Office, Azure, personas ajenas, ensayo) y relevo detallado para la
  revisión profunda en `4-CODIGO/docs/RELEVO-REVISION-PROFUNDA.md` (inventario de funciones con su
  prueba, paridad con Word, Excel y PowerPoint, archivos más ligeros, entregables).
- **Pruebas nuevas:** `pruebas/carga.py` (muchas personas escribiendo a la vez en el mismo
  documento), `pruebas/humo.py` (contra un servidor publicado), `pruebas/regresion.sh` (todas las
  suites con resumen).
- **Capacidad medida:** en la laptop, 100 personas a la vez en un documento: 7444 letras, 0
  perdidas, 0 entregas perdidas, 95 % de los cambios en 10 ms o menos. En la Raspberry, 5 personas:
  238 ms (casi todo es el viaje por Cloudflare). En Azure (plan gratuito), 5 personas: 586 ms.
- **50 personas por espacio** y en el mismo documento (antes 5; decisión del equipo). Requisito,
  casos de uso, diagramas, ayuda, pantalla de inicio, plan de pruebas (VL-13 y VL-14) al día.
- **Tope de cuentas nuevas por dispositivo** (antes 30 por hora desde una red: una escuela entera
  sale con la misma IP). La MAC no se puede leer (los navegadores no la dan, Android la oculta y la
  cambia por red, y no viaja por Internet): la app manda el identificador de Android resumido con
  SHA-256 (no cambia al borrar los datos de la app, comprobado en el emulador) y el navegador un
  número al azar guardado en él. 5 por hora por dispositivo; 200 por red con dispositivo; 30 por red
  sin él. Solo en memoria; aviso de privacidad actualizado.
- **DEF-42 corregido:** el chat no contaba en el almacenamiento de la cuenta y no revisaba el límite
  (una cuenta podía llenar el disco de la Pi). Ahora cuenta en la cuota del dueño del espacio y con
  la cuota llena no se suben archivos.
- **Azure:** tenía la 0.13.0 desplegada; se prendió y probó (humo 31 de 31: cuentas en Azure SQL con
  el usuario de rol `nomcolab_app`), se le puso el límite de 50 MB por cuenta que le faltaba y se
  apagó.
- **Archivos ligeros, medido:** el `.nom` de un archivo importado pesa 81 % (Word), 85 %
  (PowerPoint) y 73 % (Excel) del original; el mejor compresor sin pérdida (`xz -9e`) llega a 77 %,
  82 % y 39 %. En Excel hay margen: queda como bloque J.
- **Pruebas automáticas con 0.13.1** (se toman solo como base): seguridad 375 de 375 · límites 18 de
  18 · unitarias 9 de 9 · cuentas y equipo 61 de 61 · sin Internet, extremo a extremo, ayuda y red:
  bien · funciones 170 de 170 en computadora, celular y Firefox · rastreo: las mismas fallas de la
  ruedita que el 13-nov, ninguna nueva · Office: sin tocar 100 %; lo que entiende, igual que antes
  (Word 91.9 %, Excel 59.2 %, PowerPoint 78.5 % en 47 archivos). Se corrigieron tres pruebas que
  fallaban por la prueba y no por la app (QR cortado en pantalla de celular, servidor de pruebas sin
  red local, 13.2 con la llave de la Pi en el APK).
- **Publicado:** jar 0.13.1 en `2-PAGINA-Servidor/` y en la Raspberry (humo 30 de 30), APK 0.13.1
  (versionCode 21, misma llave) en `3-APP-Android/` y como release v0.13.1 de GitHub, `main`
  empujado (Azure desplegó bien; sigue apagada a propósito).
- **Decisión del dueño:** las llaves de la Pi no se copian fuera de ella (riesgo aceptado).
- **Falta:** regresar el A55 (sigue con el APK de depuración 0.12.2 apuntando al servidor de pruebas;
  no se abrió la app porque el dueño estaba usando el teléfono).
