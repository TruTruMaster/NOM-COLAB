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
