# Relevo: revisión profunda, pruebas de cada función y paridad con Office (desde el 13 de noviembre de 2026, 0.13.1)

Para la siguiente sesión de trabajo. Este documento dice **exactamente** qué hacer, en qué orden,
con qué comandos y cómo saber que quedó bien. La presentación del proyecto es alrededor del **20 de
noviembre de 2026** y el plan de pruebas (PDF) se entrega el **27 de noviembre**.

Leer antes, en este orden:
1. Las reglas locales del proyecto (el archivo de instrucciones de la raíz de `~/NOM`, que no va en
   git): sin menciones a herramientas de IA en ningún archivo, commit ni PR; commits como
   `trutrumaster <drodrigueze2400@alumno.ipn.mx>`; todo en español.
2. `4-CODIGO/docs/PLAN-PRUEBAS-PRESENTACION.md` (bloques A a K, calendario, registro de resultados).
3. `4-CODIGO/docs/PLAN-CONSTRUCCION.md`, fase 16.
4. `4-CODIGO/docs/RELEVO-PRUEBAS-0.12.2.md` (cómo manejar cada equipo: A55, escritorio, Pi).

---

## 1. Estado exacto al cerrar el 13 de noviembre

- **Versión 0.13.1** (interfaz 14, `versionCode` 21). Cambios contra 0.13.0:
  - Máximo **50 personas conectadas por espacio** y en el mismo documento (antes 5):
    `nom.espacio.max-usuarios=${NOM_MAX_PERSONAS:50}`, `Difusor.MAX_PERSONAS` en el teléfono.
  - **Tope de cuentas nuevas por dispositivo**: 5 por hora por dispositivo
    (`NOM_REGISTROS_HORA_EQUIPO`); con dispositivo, 200 por red (`NOM_REGISTROS_HORA_RED_EQUIPO`);
    sin dispositivo, 30 por red como antes. Cliente: `api.equipo()` en `js/api.js`; app:
    `NomAndroid.equipo()` en `MainActivity.Puente` (SHA-256 del `ANDROID_ID`, 32 caracteres).
    Servidor: `ServicioCuentas.anotarRegistro(origen, equipo, ahora)`.
  - **DEF-42**: el chat cuenta en la cuota del propietario (`ServicioChat.usarCuota`,
    `ServicioDocumentos.contarChat/revisarCuotaDe/olvidarUso`); con la cuota llena no se suben
    archivos al chat (el texto sí).
  - Azure: `NOM_CUOTA_MB=50` (en la Web App y en `azure/desplegar.sh`).
  - Pruebas nuevas: `pruebas/carga.py` (carga), `pruebas/humo.py` (humo contra un servidor publicado),
    `pruebas/regresion.sh` (todas las suites con resumen), sección 16 de `seguridad.py`.
- **Resultados de esta sesión (automáticos, solo como base):** `seguridad.py` 375 de 375 ·
  `prueba_limites.py` 18 de 18 (VL-13 con 50, VL-14 con la 51) · JUnit 9 de 9 · cuentas y equipo
  61 de 61 · sin Internet, extremo a extremo, ayuda, red: bien · funciones 170 de 170 en
  computadora, celular y Firefox · rastreo: las mismas fallas de la ruedita que el 13-nov (ninguna
  nueva) · Office sin tocar 100 % · carga en la laptop: 100 personas a la vez, 0 letras y 0 entregas
  perdidas, p95 10 ms · Pi: 5 personas, p50 238 ms · Azure: humo 31 de 31, 5 personas p50 586 ms ·
  APK 0.13.1 en el emulador: el identificador del teléfono no cambia al borrar los datos de la app.
  Resumen completo en el LOG (entrada 57) y en `~/.cache/nom-pruebas/registros/2026-11-13_2133/`.
- **Hecho pero NO publicado** (el dueño no lo pidió todavía): el jar 0.13.1 está en
  `2-PAGINA-Servidor/` y el APK 0.13.1 en `3-APP-Android/`, pero la Raspberry sigue con 0.13.0, la
  release de GitHub es v0.13.0 y el commit no se ha empujado (un push a `main` despliega a Azure).
  **Primer paso de la siguiente sesión: preguntar al dueño si se publica** y, si sí, seguir la
  sección 4.
- **Corregido en las pruebas, no en la app:** en `prueba_funciones.py --movil`, el QR quedaba a
  medias fuera de la pantalla y la foto salía cortada (ahora se desliza a la vista). En
  `regresion.sh`, los 2 casos del QR fallan si el servidor de pruebas arranca con
  `NOM_DESCUBRIMIENTO=false` (sin red local no hay QR); el script lo avisa. En `seguridad.py`, el
  caso 13.2 esperaba 403 y desde que el APK trae la llave de la Pi la respuesta correcta es 401.
- **Pendiente del dueño (no lo puede hacer nadie más):** copiar `/var/lib/nomcolab/datos-llaves` de
  la Pi (pide la contraseña de `doas`) y encender la depuración inalámbrica del A55.

## 1b. Qué tan confiables son las pruebas automáticas (léelo antes de creerles)

El dueño las toma **solo como base**: que pasen NO demuestra que la app funcione bien para una
persona. La siguiente sesión tiene que comprobarlo **usándola de verdad** (equipos reales, Office
real, personas reales). Lo que cada suite NO demuestra:

| Suite | Lo que sí demuestra | Lo que NO demuestra |
|---|---|---|
| `seguridad.py`, `prueba_limites.py` | Que la API responde el código correcto a cada rol y límite | Que la interfaz lleve a la persona ahí, ni que el mensaje se entienda |
| `prueba_funciones.py` | Que ~170 funciones hagan algo correcto en un caso sencillo | Casos raros, documentos grandes, combinaciones de funciones, cómo se ve |
| `rastreo.py` | Que tocar cada botón visible no deja errores de JavaScript | Que el botón haga lo correcto; además **27 acciones de la ruedita (20 en celular) nunca se alcanzan a abrir**: son las mismas desde el 13-nov y se revisaron a mano una vez. Mejorar la prueba o revisarlas a mano otra vez |
| `--movil` | Pantalla de celular simulada en Chromium de escritorio | Toques reales, teclado del teléfono, manijas de selección de Android, WebView de la app (eso solo en el A55 o el emulador) |
| `fidelidad.py` | Que un archivo **sin tocar** sale idéntico (se devuelve el original guardado) | Nada sobre lo que se ve ni sobre lo editado. Por omisión solo corre `corpus/` (47 archivos); para los 90, pasarle también `corpus-web/*/*` |
| `fidelidad.py --modelo` | Cuánto del archivo entiende la app | Si se ve igual (eso es `pantalla.py` y `visor.py`, comparando a ojo) |
| `ediciones.py --office` | Que LibreOffice abre lo editado | Que **Microsoft Office** lo abre sin «reparar» (nunca se ha probado con Office real) |
| `carga.py` | Que el servidor no pierde nada con 100 a la vez | La interfaz con muchas personas (cursores, presencia, rendimiento del navegador del celular) |
| `prueba_red.py`, `prueba_sin_internet.py` | Cortar la red en el navegador automático | El ciclo real con equipos reales y la Raspberry (bloque B del plan) |

Además: todas corren en un navegador sin pantalla, contra un servidor local recién creado y con
datos de prueba pequeños. **Tardan**: `regresion.sh` completo, unos 60 min (rastreo 15 min por
pantalla). Para el día a día: `regresion.sh rapido` y solo la suite de lo que se tocó; el completo,
antes de publicar. Se puede acelerar corriendo las suites en paralelo con servidores en puertos
distintos (cada una ya acepta `NOM_BASE`).

**Regla para la siguiente sesión:** una función solo se marca «funciona» en
`INVENTARIO-FUNCIONES.md` cuando se usó a mano en al menos un equipo real (y en el celular si
aplica) y además tiene prueba automática. Lo que solo pasó la automática se marca «solo
automática».

## 2. Decisiones del dueño (no volver a discutirlas)

- 50 personas por espacio y por documento. Tope de cuentas por **dispositivo**, no por red. La MAC
  **no** se usa porque no se puede leer (navegadores no la dan; Android 6+ da `02:00:00:00:00:00` y la
  cambia al azar por red; no viaja por Internet).
- Sin administrador general. Sin edades (espacios cerrados por invitación). Sin Internet no hay
  cuentas (alias al azar); quien tiene Internet entra al teléfono con su pase.
- Lo editado sin red: se sube tal cual si nadie cambió el documento; si sí, rama (más de 2 min sin
  conexión o documento abierto ya sin red). Nunca fusión automática.
- Los datos se cifran en el servidor (reposo) y hay espacios de extremo a extremo. GPL-3.0.
- La nube del proyecto es la **Raspberry Pi** (`https://nomcolab.dpdns.org`). Azure es de otra
  materia: se mantiene al día y apagada; se prende solo para demostrar.
- Límite por cuenta: 200 MB en la Pi, 50 MB en Azure, sin límite en el servidor del salón. Solo
  documentos de NOM-COLAB, comprimidos. Sin respaldo en Drive.

## 3. Entorno y trampas conocidas

- Servidor de pruebas (interfaz en vivo desde el código, **con red local** para que salga el QR):
  ```bash
  cd 4-CODIGO/app && mvn -o -q package
  cp target/nom-colab.jar /tmp/x/ && cd /tmp/x   # no correr el servidor desde target/ si se va a recompilar
  NOM_PUERTO=8099 NOM_DATOS=/tmp/x/datos SPRING_WEB_RESOURCES_STATIC_LOCATIONS=file:$HOME/NOM/4-CODIGO/app/src/main/resources/static/ java -jar nom-colab.jar &
  ```
  Sin tope de personas, para medir: agregar `--nom.espacio.max-usuarios=1000` al final.
- Playwright: `PLAYWRIGHT_BROWSERS_PATH=~/.cache/nom-pruebas/navegadores`, Python
  `~/.cache/nom-pruebas/venv/bin/python`. Corpus de Office: `~/.cache/nom-pruebas/corpus` y
  `corpus-web` (90 archivos reales de Microsoft).
- **No matar procesos con `pkill -f <patrón>` si el patrón aparece en el mismo comando**: se mata la
  propia terminal (código 144). Matar por PID: `ss -ltnp | grep :8099`.
- La carpeta temporal de la sesión se borra al reiniciar; los registros largos van en
  `~/.cache/nom-pruebas/registros/`.
- Cloudflare rechaza el User-Agent de `urllib` (error 1010): mandar `NOM-COLAB-pruebas/1.0`.
- Contra la Pi, el registro cuenta 30 por hora desde la red de la casa (las pruebas no mandan
  dispositivo). Usar `--borrar` en `carga.py` y pocas personas, o mandar `equipo` en la prueba.
- Emulador: `~/Android/Sdk/emulator/emulator -avd Pixel_ListView -no-window -no-audio -gpu swiftshader_indirect`;
  la app se abre con `adb shell monkey -p mx.wack.nom -c android.intent.category.LAUNCHER 1`; su
  WebView por CDP: `adb forward tcp:9223 localabstract:webview_devtools_remote_$(adb shell pidof mx.wack.nom)`
  y WebSocket crudo de Node (Playwright no se conecta a un WebView). Desde el emulador la laptop es `10.0.2.2`.
- A55: depuración inalámbrica con puerto al azar (`adb mdns services`). Tras usar un APK de
  depuración, reinstalar el publicable `3-APP-Android/NOM-COLAB.apk`.
- Escritorio `flast-desktop` (`ssh 100.84.188.120`): Chromium por flatpak necesita
  `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus`; no correr dos pruebas en el mismo perfil.
- Pi: `ssh pi5 'doas -n /usr/local/sbin/nomcolab-pi estado|actualizar|respaldo|bitacora|reiniciar'`
  (ruta completa). Actualizar: `scp 4-CODIGO/app/target/nom-colab.jar pi5:/home/user/nom-colab.jar.nuevo`
  y `actualizar` (si no arranca, regresa sola al anterior). Ajustes en `/etc/nomcolab.conf` (pide contraseña).
- Azure: `4-CODIGO/azure/nomcolab azure up|down|estado`. Después de prender:
  `NOM_BASE=https://nomcolab-wack.azurewebsites.net python3 4-CODIGO/pruebas/humo.py`. Apagar al terminar.
- GitHub: token en `~/NOM/tokensito` (nunca imprimirlo). `gh` falla con reinicios de conexión en
  esta red; usar `curl` con el token. Pushes grandes: `git -c http.postBuffer=524288000 -c http.version=HTTP/1.1 push`.
  Hacer `git fetch` antes de creer el "ahead N".
- Nunca subir `py.py` ni `tokensito` ni `CREDENCIALES-AZURE.txt`.

## 4. Cómo publicar una versión (siempre todo junto)

1. Subir la versión en `nucleo/.../core/Version.java` (`APP`, e `INTERFAZ` solo si cambia el
   protocolo), `js/nucleo.js` (`NOM.VERSION`, `NOM.INTERFAZ`), `static/sw.js` (`VERSION`),
   `android/app/build.gradle.kts` (`versionName`, `versionCode` + 1) y `ayuda/generar.py` (`VERSION`);
   novedades en `ayuda/contenido/novedades/index.md`; `python3 4-CODIGO/ayuda/generar.py`.
2. `cd 4-CODIGO/app && mvn -o -q package` → copiar `target/nom-colab.jar` a `2-PAGINA-Servidor/`.
3. `pruebas/regresion.sh` completo: 0 fallas.
4. `cd 4-CODIGO/android && ANDROID_HOME=~/Android/Sdk ./gradlew assembleRelease` → copiar
   `app/build/outputs/apk/release/app-release.apk` a `3-APP-Android/NOM-COLAB.apk`. Revisar la firma:
   `apksigner verify --print-certs` debe dar SHA-256 `2ef146f6…b6c9`.
5. Pi: subir el jar y `actualizar`; `humo.py` contra `https://nomcolab.dpdns.org`.
6. `4-CODIGO/android/publicar-apk.sh` (release "latest" con el APK).
7. LOG (entrada nueva), casillas en `PLAN-CONSTRUCCION.md`, commit en español sin menciones y push a
   `main` (despliega solo a Azure).

---

## 5. Trabajo, en orden de prioridad

### T1. Ejecutar el plan de pruebas (antes de la presentación)

Seguir el calendario de `PLAN-PRUEBAS-PRESENTACION.md`. Cada resultado va a su tabla "Registro de
resultados"; cada defecto, como DEF-43, DEF-44… con su prueba automática nueva cuando se pueda.
Prioridad: B-1, B-2, B-16 (A55) → B-3 a B-15 (ciclo sin Internet real) → F y K (Office real) → C
(escuela) → D-4, D-5 (carga en la Pi y el teléfono) → H (SUS) → I (ensayo).

**Criterio de terminado:** todas las filas de B, C, D, E, F, K con resultado; 0 defectos abiertos
de prioridad alta; `regresion.sh` sin fallas después del último arreglo.

### T2. Revisión profunda: cada función con su prueba

Objetivo: que **no exista ninguna función sin prueba**, y saber exactamente todo lo que hace la app.

1. Crear `4-CODIGO/docs/INVENTARIO-FUNCIONES.md` con una fila por función, sacada del código (no de
   memoria):
   - Las 110 rutas de la API: `grep -rn "@\(Get\|Post\|Put\|Delete\)Mapping" 4-CODIGO/app/src/main/java`
     y las de `ApiTelefono` (teléfono). Para cada una: qué hace, quién puede (rol), qué prueba la
     cubre (`seguridad.py` sección y nombre del caso) o "SIN PRUEBA".
   - Cada botón, menú, atajo y acción de la ruedita por editor (texto `modo-texto.js`, hoja
     `modo-hoja.js` + `formulas.js`, presentación `diapositivas.js` + `lienzo.js`, diagrama
     `diagramas.js` + `lienzo.js`) y fuera de los editores (`vista-*.js`, `union.js`, `chat.js`,
     `ramas.js`, `recibo.js`, `citas.js`, `datos.js`, `plantillas.js`, `proyector.js`). `rastreo.py`
     ya recorre los botones visibles: usar su salida como lista de partida y completar a mano lo que
     no ve (atajos, arrastrar, toques largos).
   - Columnas: función · dónde está (archivo:línea) · computadora / celular / app / teléfono
     servidor · prueba automática · prueba manual del plan · estado.
2. Toda fila "SIN PRUEBA" se cubre: en `prueba_funciones.py` (interfaz, que la función haga lo
   correcto, no solo que no truene) o en `seguridad.py` (API). Correr en Chromium, Firefox y
   `--movil`.
3. Revisión a ojo en el A55 y el escritorio reales de lo que la automática no juzga (cómo se ve,
   que la ruedita no tape, teclado del teléfono). Anotar en el inventario.
4. El inventario es también la **guía de estudio** del dueño para la presentación: escribir cada
   función en una línea sencilla (qué hace para la persona), no en términos de código.

**Criterio de terminado:** 0 filas "SIN PRUEBA"; las suites nuevas dentro de `regresion.sh`.

### T3. Paridad con Word, Excel y PowerPoint

Punto de partida medido (13-nov, `office/fidelidad.py --modelo`, lo que la app ENTIENDE de 90 archivos
reales): **Word 92.0 %, PowerPoint 77.9 %, Excel 60.9 %**. Lo que no entiende se conserva al
descargar (el original va dentro), pero no se ve ni se edita.

1. Crear `4-CODIGO/docs/PARIDAD-OFFICE.md`: una matriz por programa, con los comandos de **cada
   pestaña de la cinta** (Word: Inicio, Insertar, Diseño, Disposición, Referencias, Correspondencia,
   Revisar, Vista; Excel: Inicio, Insertar, Disposición de página, Fórmulas por categoría, Datos,
   Revisar, Vista; PowerPoint: Inicio, Insertar, Diseño, Transiciones, Animaciones, Presentación con
   diapositivas, Revisar, Vista). Por comando: **Tiene / Parcial / No / No aplica**, si se conserva
   al importar y exportar, y prioridad (Alta = lo usa un estudiante o una oficina cada semana). Dar
   el porcentaje por programa con esa matriz (así se contesta con números a «¿qué tanto de Office
   tiene?»).
2. Implementar por prioridad. Lista concreta de partida (revisar contra el código antes, porque
   algo puede ya existir):
   - **Excel, funciones** (hoy 94 en `formulas.js` `FUNCS`; Excel tiene unas 500). Faltan de uso
     diario: `AÑO`, `HORA`, `MINUTO`, `SEGUNDO`, `NUM.DE.SEMANA`, `DIAS360`, `FECHANUMERO`,
     `HORANUMERO`, `FILA`, `COLUMNA`, `FILAS`, `COLUMNAS`, `INDIRECTO`, `DESREF`, `DIRECCION`,
     `TRANSPONER`, `FILTRAR`, `ORDENAR`, `ORDENARPOR`, `UNICOS`, `SECUENCIA`, `LET`, `ESNOD`, `NOD`,
     `SI.ND`, `ES.PAR`, `ES.IMPAR`, `CAMBIAR`, `XO`, `VERDADERO`, `FALSO`, `CONCAT`, `TEXTOANTES`,
     `TEXTODESPUES`, `DIVIDIRTEXTO`, `LIMPIAR`, `CODIGO`, `UNICAR`, `MONEDA`, `DECIMAL`, `FIJO`,
     `MULTIPLO.SUPERIOR`, `MULTIPLO.INFERIOR`, `M.C.D`, `M.C.M`, `COMBINAT`, `FACT`, `PROMEDIOA`,
     `CONTAR.SI` con comodines, `PERCENTIL`, `CUARTIL`, `JERARQUIA.EQV`, `DESVEST.M`, `DESVEST.P`,
     `VAR.S`, `VAR.P`, `PRONOSTICO`, `TENDENCIA`, `PENDIENTE`, `INTERSECCION.EJE`, `COEF.DE.CORREL`,
     `SUMA.CUADRADOS`, `MMULT`, financieras `PAGO`, `VA`, `VF`, `TASA`, `NPER`, `VNA`, `TIR`,
     `PAGOINT`, `PAGOPRIN`. Cada una: nombre en inglés en `ALIAS`/`INGLES` (Excel guarda los nombres
     en inglés en el archivo), firma en `FIRMAS` (ayuda al escribir), página en la referencia de
     fórmulas de la ayuda, y un caso en `prueba_funciones.py` comparando contra el valor que da
     LibreOffice con el mismo archivo.
   - **Excel, en pantalla:** gráficas del archivo (hoy 0 %: se conservan pero no se ven; `graficas.js`
     tiene 6 tipos: barras, barras horizontales, líneas, área, dispersión, pastel → agregar anillo,
     radar, combinada, histograma, cajas, cascada, ejes secundarios, etiquetas de datos, línea de
     tendencia), formato condicional (mayor que, entre, texto que contiene, duplicados, escala de
     color, barras de datos, íconos), comentarios y notas, imágenes, autofiltro, nombres definidos,
     tablas con formato (ListObject), proteger hoja. Hojas de más de **5000 filas × 60 columnas**
     (`LIM_F`, `LIM_C` en `ooxml.js`): mostrar todo con dibujo virtual en lugar de recortar.
   - **Word:** encabezados (37 %) y pies (57 %) del archivo, columnas reales, tabuladores con relleno
     de puntos, texto vertical, bordes por celda, control de cambios (importar y exportar como
     sugerencias de la app), índice automático y campos (número de página, fecha), estilos propios
     del archivo, marca de agua, dibujos de Word (lienzos y grupos de formas, hoy recuadros con su
     texto), SmartArt editable.
   - **PowerPoint:** negrita y cursiva (49 %), posición y tamaño (64 %), tamaño de diapositiva (65 %),
     tamaño de letra (75 %): probablemente herencia del patrón y el diseño (`p:sldMaster`,
     `p:sldLayout`) no aplicada; transiciones; video y audio; formas libres reales (`a:custGeom`,
     hoy rectángulos); patrón de diapositivas editable; WordArt; secciones.
3. Reglas que ya costaron defectos (no romperlas):
   - Editor de texto: todo atributo de `PAR`/`CAR` (`modo-texto.js`) se pinta en el DOM (`data-*`,
     `style`) **y** se lee de vuelta (`attrsParrafo`/`attrsInline`); si no, se borra al teclear.
   - Excel: el exportador compara contra lo que `modeloXlsx` lee HOY del original; cambiar lo que lee
     el importador altera documentos ya importados. Probar con documentos importados con la versión
     anterior (guardar `.nom` de prueba antes del cambio).
   - Los ids de bloques del importador deben ser deterministas (el `.nom` v3 reimporta el original y
     aplica el delta).
   - Nada de librerías nuevas en la interfaz; todo con `script-src 'self'` (sin `eval`).
4. Medir después de cada tanda: `fidelidad.py --modelo` (que suba la categoría trabajada y no baje
   ninguna), `fidelidad.py` (100 % sin tocar), `ediciones.py --office` (0 mal), `integridad.py` sobre
   las salidas (0 fallas), `pantalla.py` y `visor.py` (cómo se ve junto a LibreOffice), `raros.py`.

**Metas:** `--modelo` Word ≥ 96 %, PowerPoint ≥ 90 %, Excel ≥ 80 %; 150 funciones de hoja con prueba;
los bloques F y K del plan sin defectos en Office real.

### T4. Archivos más ligeros (bloque J del plan)

Medido: `.nom` = 81 % (Word), 85 % (PowerPoint), 73 % (Excel) del original; el mejor compresor sin
pérdida (`xz -9e`) llega a 77 %, 82 % y **39 %**. Hacer J-1 (`pruebas/office/peso.py`), J-2 (LZMA
propio en `js/compresion.js`, solo para `.nom`, que siga abriendo v2 y v3; meta: ≤ `xz -9e` + 5 %,
< 1 s con 5 MB en el A55), J-3 (que la app muestre cuánto pesa y cuánto se ahorra al descargar) y J-4.
Esto también va en el servidor: el estado y las versiones hoy se guardan con gzip (`AlmacenJson`);
medir si conviene lo mismo ahí (menos uso de la cuota de cada cuenta).

### T5. Documentos y entregables

- `6-PLAN-DE-PRUEBAS/fuentes/plan.html`: ya dice 50 personas (VL-13, VL-14, M2, alcance). Agregar la
  sección 16 de `seguridad.py`, la prueba de carga, DEF-42, los resultados de B a K y el SUS;
  regenerar el PDF con `fuentes/imprimir.py` (el PDF de `ENTREGA/` todavía dice 5).
- `LOG.md`, `PLAN-CONSTRUCCION.md` (casillas de la fase 16), `docs/PLAN-PRUEBAS-PRESENTACION.md`
  (registro de resultados).
- La presentación (diapositivas, guion de demo y guía de estudio): preguntar al dueño la duración
  y el formato que pide el profesor antes de hacerla.
