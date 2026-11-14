# Plan de pruebas antes de la presentación (13 al 20 de noviembre de 2026, versiones 0.13.0 y 0.13.1)

Objetivo: llegar a la presentación con **todo probado en equipos reales**, con pruebas de que lo
que ya funcionaba **sigue funcionando** (sin regresiones) y sabiendo decir con números qué hace
la app, qué no y por qué los archivos no se rompen.

Regla de oro: **nada se corrige sin volver a correr la red de regresión** (bloque A). Cada
defecto nuevo se anota como DEF-42, DEF-43… en la tabla del final, con su prueba.

---

## 0. Estado de partida (13 de noviembre, noche)

| Qué | Dónde se probó | Resultado | ¿Falta? |
|---|---|---|---|
| Todo lo de 0.12.x (editores, Office, cuentas, permisos, sin red, seguridad) | laptop, escritorio, A55, Raspberry | 1542 de 1542 | Solo repetir como regresión |
| Fases 13-15 (alias, pase, ramas, cifrado, chat, ayuda) | laptop (navegador automático) y emulador de Android | seguridad 363, e2e 27, sin Internet 22, ayuda 18, funciones 170, red 24, cuentas 61, límites 18, unitarias 9, teléfono 18 | **Nunca en el A55 ni en el escritorio reales** |
| Azure con 0.13.0 | Azure (13-nov, esta revisión) | humo 31 de 31; 5 personas a la vez sin perder nada (p50 0.59 s, p95 1.15 s) | Repetir el día antes si se va a mostrar |
| Raspberry con 0.13.0 | nomcolab.dpdns.org (esta revisión) | 5 personas a la vez sin perder nada (p50 0.24 s) | Ciclo completo con equipos reales |
| Carga (cuántas personas aguantan) | laptop (esta revisión, sin tope) | **100 personas escribiendo a la vez: 0 letras perdidas, 0 entregas perdidas, p95 10 ms** | Medir en la Pi y en el teléfono |
| Red de la escuela | — | — | **Nunca** |
| Personas ajenas al equipo (SUS) | — | — | **Nunca** (programada) |

## 1. Hallazgos de esta revisión (hay que decidir o corregir)

| Id | Hallazgo | Riesgo | Propuesta |
|---|---|---|---|
| H-1 | Máximo de personas conectadas por espacio: era 5 (requisito RNF Espacios 1). | Un salón no cabía. La carga demostró que no era un límite técnico (100 a la vez sin perder nada). | **Decidido y hecho (0.13.1):** 50 por espacio y en el mismo documento (`nom.espacio.max-usuarios`, `NOM_MAX_PERSONAS`, `Difusor.MAX_PERSONAS` en el teléfono). Requisito, casos de uso, diagramas, ayuda, pantalla de inicio y VL-13/VL-14 al día. Pruebas: `seguridad.py` 16.1 y `prueba_limites.py`. |
| H-2 | Tope de 30 cuentas nuevas por hora desde una misma red. | En la escuela todos salen con la misma IP. | **Hecho (0.13.1): tope por dispositivo**, 5 por hora (`NOM_REGISTROS_HORA_EQUIPO`). La MAC no se puede leer (ningún navegador la da, Android 6+ devuelve una falsa y la cambia por red, y no viaja por Internet); se usa el `ANDROID_ID` resumido con SHA-256 en la app (sigue igual tras borrar datos o reinstalar, comprobado en el emulador) y un número al azar guardado en el navegador. Con dispositivo, el tope por red sube a 200 (solo frena programas); sin dispositivo (apps viejas, programas) sigue 30 por red. Solo en memoria; aviso de privacidad actualizado. Pruebas: `seguridad.py` 16.2. |
| H-3 (DEF-42) | El chat no contaba en el almacenamiento. | Una cuenta podía llenar el disco de la Pi. | **Corregido (0.13.1):** el chat (mensajes y archivos) cuenta en la cuota del dueño del espacio; con la cuota llena no se suben archivos (el texto sí). Pruebas: `seguridad.py` 16.3. |
| H-4 | Azure no tenía límite por cuenta (faltaba `NOM_CUOTA_MB`). | Disco del plan gratuito (1 GB). | **Corregido:** 50 MB en Azure y en `azure/desplegar.sh`. |
| H-5 | La llave del cifrado y la de los pases **solo están en la Pi** (`/var/lib/nomcolab/datos-llaves`). La copia diaria en la laptop no la incluye. | Si se daña la memoria de la Pi, no se abre ningún dato ni respaldo; si cambia la de los pases, hay que publicar otro APK. | **Decisión del dueño: no se copia** (riesgo aceptado). |
| H-6 | El APK solo confía en la llave de pases de la Raspberry. | En Azure el pase se emite, pero el teléfono no lo acepta. Es lo esperado. | Decirlo así si preguntan: «la nube de la app es nuestro servidor propio». |
| H-7 | Una hoja de Excel importada muestra hasta **5000 filas y 60 columnas** (`LIM_F`, `LIM_C` en `ooxml.js`); lo demás se conserva en el archivo. | Alguien abre una hoja grande y cree que se perdieron datos. | Ya avisa; probarlo (F-2) y saberlo decir. |

---

## Bloque A. Red de regresión automática (demuestra que nada se rompió)

**Un solo comando:** `4-CODIGO/pruebas/regresion.sh` (todo, unos 40-60 min) o
`regresion.sh rapido` (sin Office ni celular, unos 15 min). Deja el resumen en
`~/.cache/nom-pruebas/registros/<fecha>/resumen.txt`.

Antes: `cd 4-CODIGO/app && mvn -o -q package` y el servidor de pruebas en el 8099 con la interfaz
en vivo (receta en `docs/RELEVO-PRUEBAS-0.12.2.md`, sección 2).

| Suite | Qué cubre | Línea base 0.13.0 |
|---|---|---|
| `mvn test` (JUnit) | CRDT: converge en cualquier orden, cifrado, hash | 9 de 9 |
| `seguridad.py` | API, roles, permisos, sesiones, límites, cuota, pases, ramas, cifrado, 50 personas, tope por dispositivo, chat en la cuota (secciones 1-16) | 375 de 375 (0.13.1; 363 en 0.13.0) |
| `prueba_limites.py` | valores límite (VL-01 a VL-18; VL-13 y VL-14 ahora con 50 y 51 personas) | 18 de 18 |
| `carga.py --personas 5` | 5 a la vez: nada se pierde | correcto |
| `prueba_cuentas_equipo.py` | registro, recuperación, cambiar contraseña, borrar cuenta, cierre de golpe | 61 de 61 |
| `prueba_sin_internet.py` | alias, crear sin red, ramas, fusionar | 22 de 22 |
| `prueba_e2e.py` | el servidor nunca ve el texto, el nombre ni el chat | 27 de 27 |
| `prueba_ayuda.py` | ayuda y legal sin sesión y sin red | 18 de 18 |
| `prueba_red.py` | cortar y regresar la red con cambios pendientes | 24 de 24 |
| `prueba_funciones.py` (+ `--movil`, + Firefox) | que cada función haga lo correcto | 170 de 170 |
| `rastreo.py` (+ `--movil`) | toca cada botón, menú y acción de la ruedita sin errores | sin errores |
| `prueba_pres1`, `pptx`, `pptx2`, `diag1`, `diag_movil`, `85`, `citas`, `datos`, `biblioteca`, `fuentes_api` | presentaciones, diagramas, investigar, citas | todas bien |
| `office/fidelidad.py` | 90 archivos reales de Microsoft: sin tocar salen idénticos | 100 % |
| `office/fidelidad.py --modelo` | lo que la app **entiende** de esos archivos | docx 92.0 %, pptx 77.9 %, xlsx 60.9 % |
| `office/ediciones.py --office` | editar y volver a abrir en LibreOffice | 144 bien, 0 mal |
| `office/raros.py` | archivos dañados o raros no tumban nada | sin errores |

**Criterio:** 0 fallas y los mismos números o más. Si un número baja, es regresión y se corrige
antes de seguir. Se corre: (1) hoy, como línea base; (2) después de cada arreglo; (3) antes de
publicar el jar y el APK; (4) el día antes de presentar.

---

## Bloque B. Lo nuevo de 0.13.0 en equipos reales (nunca se ha hecho)

Equipos: el A55 con el **APK publicable 0.13.0**, el escritorio (`flast-desktop`, Chromium real),
la laptop y la Raspberry. Antes: regresar el A55 (ver `RELEVO-PRUEBAS-0.12.2.md`, sección 4).

| # | Prueba | Pasos | Resultado esperado |
|---|---|---|---|
| B-1 | APK publicable en el A55 | Instalar `3-APP-Android/NOM-COLAB.apk` encima del de depuración; abrir | Abre sin pedir desinstalar; misma sesión; versión 0.13.0 en Ajustes; sin errores de política de contenido |
| B-2 | Los dos casos pendientes del A55 | (a) teclear muy rápido «B» en D5 con `=SUMAR.SI(...)`; (b) «Entrega con fecha límite» y guardar | (a) la letra no se pierde; (b) la fecha queda guardada (no 0). Si falla: DEF nuevo |
| B-3 | Alias al azar en el teléfono que comparte | A55 con Wi-Fi sin Internet comparte un espacio; la laptop entra | Entra con alias generado (sin escribir apodo); al volver entra como el mismo alias |
| B-4 | Pase firmado | Con Internet en la laptop: entrar a la nube, luego al espacio del A55 | Conserva su cuenta (no alias); el pase vence a los 10 min y es de un solo uso |
| B-5 | Editar sin red sin conflicto | Escritorio: abrir un documento de la Pi, quitar la red 3 min, escribir, regresar la red | Se sube tal cual; nadie ve rama |
| B-6 | Rama por conflicto | Escritorio sin red 3 min escribiendo; mientras, el A55 cambia el mismo documento en la Pi; regresar la red | Se crea rama; el original no cambia; «Ramas (1)» en el original |
| B-7 | Comparar, fusionar, descartar | Desde el original: comparar, fusionar; luego regresar a la versión anterior; otra rama: descartar | Fusión correcta; la versión anterior regresa todo; descartar no toca el original |
| B-8 | Crear sin red | Escritorio sin red: crear un documento en un espacio | Aparece marcado como «solo en este equipo»; al volver la red se sube solo |
| B-9 | Cierre de golpe con 0.13.0 | `kill -9` del navegador del escritorio; forzar cierre de la app en el A55; abrir sin red | Abre con la sesión y el documento; lo escrito no se pierde |
| B-10 | Espacio cifrado de extremo a extremo | Crear espacio cifrado en la laptop; unir al A55 por QR (cámara real) | El A55 lee el nombre y los documentos; en la Pi (`ssh pi5`) los archivos no tienen el texto |
| B-11 | Chat del espacio | Desde el A55: foto de la galería y un PDF; desde el escritorio: responder | Llegan a todos; archivo > 2 MB rechazado con mensaje claro |
| B-12 | Enlace para ver y proyector en espacio cifrado | Abrir el enlace y el proyector en una tele/otro navegador | Se ve el documento; el nombre del espacio no sale cifrado |
| B-13 | Ayuda y legal | En la app sin red: botones «?» y pie «Ayuda · Privacidad · Términos» | Abren sin Internet |
| B-14 | Instalar en la computadora | Escritorio: «Instalar en esta computadora»; cerrar; quitar red; abrir el ícono | Abre; documentos ya abiertos se pueden leer y editar |
| B-15 | Descargar mis datos y borrar cuenta | Con una cuenta de prueba en la Pi | Descarga un archivo con lo suyo; al borrar, ya no entra y sus espacios desaparecen |
| B-16 | Tope por dispositivo en el A55 real | Crear 5 cuentas desde la app del A55 contra la Pi; la sexta; borrar los datos de la app y otra | La sexta y la de después de borrar datos: «demasiadas cuentas desde este dispositivo». Borrar las cuentas al final |
| B-17 | 50 en un espacio con equipos reales + carga | 4 equipos reales en un documento y `carga.py --personas 40` en el mismo espacio | Los equipos reales siguen fluidos (cambios en menos de 2 s) |

---

## Bloque C. Red de la escuela y varios dispositivos a la vez

| # | Prueba | Resultado esperado |
|---|---|---|
| C-1 | Laptop como servidor en el Wi-Fi de la escuela: ¿los demás la encuentran solos (UDP 47474)? | Se encuentra; si la red aísla equipos, anotarlo y usar el plan B |
| C-2 | Plan B: el A55 comparte su red (zona Wi-Fi) y es el servidor | 4 equipos entran sin Internet y editan juntos |
| C-3 | La Pi desde la red de la escuela (nomcolab.dpdns.org) | Entra y edita; anotar si el campus bloquea algo |
| C-4 | 5 dispositivos reales en el mismo documento (texto, hoja, presentación, diagrama) | Todos ven lo de todos en menos de 2 s; nada se pierde |
| C-5 | La persona 51 (con `carga.py --personas 51` contra el servidor del salón) | Ve «El espacio está lleno» y su copia sigue editable |
| C-6 | Registro de 10 cuentas desde 10 equipos de la escuela, a la Pi | Ninguno ve «demasiadas cuentas»; un mismo equipo no pasa de 5 por hora |

---

## Bloque D. Capacidad: cuántas personas aguantan de verdad

Herramienta: `4-CODIGO/pruebas/carga.py` (cuentas reales, cada una con su canal en vivo, tecleando
al ritmo de una persona; mide tiempos, letras perdidas y entregas perdidas).

| # | Dónde | Comando | Medido / esperado |
|---|---|---|---|
| D-1 | Laptop sin tope de 5 (`--nom.espacio.max-usuarios=1000`) | `carga.py --personas 5,10,25,50,100 --segundos 15` | **Medido:** 100 personas, 4934 envíos, 7444 letras, 0 perdidas; p95 10 ms |
| D-2 | La Pi (con el tope actual) | `NOM_BASE=https://nomcolab.dpdns.org carga.py --personas 5 --borrar` | **Medido:** p50 238 ms, p95 255 ms, 0 perdidas |
| D-3 | Azure | `NOM_BASE=https://nomcolab-wack.azurewebsites.net carga.py --personas 5 --borrar` | **Medido:** p50 586 ms, p95 1154 ms, 0 perdidas (plan gratuito) |
| D-4 | La Pi con el tope de 50 (0.13.1) | `carga.py --personas 10,25,50 --borrar` (las cuentas de la prueba no mandan dispositivo: cuentan 30 por hora desde la red; correrlo desde el propio equipo de la Pi con `ssh pi5` y un túnel, o en dos horas) | p95 < 2 s (RNF), 0 perdidas |
| D-5 | El A55 como servidor | `adb forward tcp:8098 tcp:8080`, `NOM_BASE=http://localhost:8098 carga.py --personas 5,10,20` (en el teléfono no hay cuentas: hay que adaptar el registro al alias) | Medir y fijar ahí el tope del teléfono |

Criterio del requisito: el cambio llega a los demás en **menos de 2 s** (RNF Cuentas 2) y no se
pierde nada.

---

## Bloque E. Almacenamiento (cuánto le toca a cada persona)

Cómo funciona hoy: cada cuenta tiene un límite (**200 MB en la Pi, 50 MB en Azure, sin límite en
el servidor del salón**). Cuenta lo que ocupan los **espacios de los que es propietaria**
(documentos y versiones, ya comprimidos y cifrados); lo que escribe en espacios ajenos ocupa el
lugar del dueño de ese espacio. Un documento no puede pasar de **25 MB**. La Pi tiene 54.6 GB
libres: alcanza para unas 270 cuentas llenas al tope (hoy todo ocupa 584 KB).

| # | Prueba | Resultado esperado |
|---|---|---|
| E-1 | Ver «Guardados en NOM-COLAB en Internet» con su barra | Coincide con lo que dice `/api/cuentas/almacenamiento` |
| E-2 | Llegar al límite (cuenta de prueba con `NOM_CUOTA_MB=1` en local) | Mensaje claro; lo escrito se queda en el equipo; borrar versiones viejas libera |
| E-3 | Documento de más de 25 MB | Responde 413; lo escrito se queda en el equipo |
| E-4 | Chat (DEF-42, corregido en 0.13.1) | El chat suma al almacenamiento («Cuánto espacio ocupa» lo muestra por espacio); al pasar el límite no deja subir archivos, el texto sí |
| E-5 | Papelera | A los 30 días se borra sola; «borrar para siempre» libera el espacio |

---

## Bloque F. Office: que ningún archivo se rompa

**La verdad que hay que saber decir:** NOM-COLAB no es Word, Excel ni PowerPoint, que tienen miles
de funciones. Lo que sí garantiza es esto: al importar, **el archivo original viaja dentro del
documento**. Lo que no se toca sale **idéntico, byte por byte**, y lo que no entiende (gráficas de
Excel, macros, SmartArt, videos…) se conserva al descargar. Medido con 90 archivos reales de
Microsoft:

- Sin tocar: 100 % idéntico al descargar.
- De lo que trae cada archivo, la app entiende: **Word 92 %, PowerPoint 78 %, Excel 61 %**. En
  Excel lo más flojo (0 %: no se ve, pero se conserva) son las gráficas, las imágenes, los
  comentarios, el formato condicional, los filtros y los nombres definidos.
- Fórmulas: 94 funciones (las de uso escolar y de oficina: SUMA, SI, BUSCARV, BUSCARX,
  CONTAR.SI.CONJUNTO, fechas, texto…). Excel tiene unas 500.

El riesgo real no es «tener pocas funciones». El riesgo es **editar justo al lado de algo que la
app no entiende**. Eso se prueba aquí:

| # | Prueba | Cómo | Resultado esperado |
|---|---|---|---|
| F-1 | Integridad de todo lo exportado | `office/integridad.py ~/.cache/nom-pruebas/office-salida` | 0 fallas (relaciones, tipos, XML) |
| F-2 | Excel: editar una celda en una hoja que tiene gráfica, imagen, formato condicional, comentario, filtro, nombres definidos, tabla dinámica; hoja de más de 5000 filas | importar → editar → descargar → abrir en LibreOffice **y en Excel real** (computadora de la escuela u Office en línea) | Se abre sin «reparar»; la gráfica y lo demás siguen; la celda editada tiene el valor nuevo |
| F-3 | Excel: fórmula con una función que la app no conoce (p. ej. `TRANSPONER`, `FILTRAR`) | importar → editar otra celda → descargar | La fórmula desconocida sale igual que venía |
| F-4 | Word: editar un párrafo junto a encabezado/pie, índice automático, control de cambios, comentarios, columnas, cuadro de texto, SmartArt, ecuación, nota al pie | igual que F-2, con Word real | Sin «reparar»; lo no tocado igual; el párrafo editado con su formato |
| F-5 | PowerPoint: editar el texto de una diapositiva con video, animaciones, SmartArt, notas, transición, patrón propio | igual, con PowerPoint real | Video, animaciones y transiciones siguen |
| F-6 | Archivos reales del equipo y de los maestros (pedir 10: tareas, listas de calificaciones, presentaciones de clase) | importar, editar, descargar, abrir en Office | Sin daños; anotar lo que no se ve |
| F-7 | Ida y vuelta `.nom` | descargar `.nom`, abrir en otro equipo, descargar `.docx` | Igual que el original |
| F-8 | Avisos al importar | Abrir un Excel con gráficas y un PowerPoint con video | La app avisa «no se ven aquí, pero se conservan» |

Lo que se encuentre aquí se anota como límite conocido (si es de «no se ve») o como defecto (si
se pierde o se daña algo al descargar: **eso nunca debe pasar**).

---

## Bloque J. Archivos ligeros: medirlo y que se vea

**Medido el 13 de noviembre** (90 archivos reales de Microsoft; `.nom` de un archivo importado,
que lleva dentro el original recomprimido y los cambios), comparado con el mejor compresor general
sin pérdida (`xz -9e` de todo el contenido del archivo):

| Tipo | Original | `.nom` | `xz -9e` (meta) |
|---|---|---|---|
| Word (34) | 9257 KB | 7516 KB (81 %) | 7161 KB (77 %) |
| PowerPoint (28) | 9339 KB | 7965 KB (85 %) | 7662 KB (82 %) |
| Excel (28) | 3068 KB | 2245 KB (73 %) | 1204 KB (39 %) |

Conclusión honesta: hoy **no** son «los más ligeros posibles». En Word y PowerPoint estamos a 3-4
puntos del límite (lo que pesa son imágenes ya comprimidas); en Excel, el `.nom` podría pesar casi
la mitad. La causa: `js/compresion.js` es DEFLATE (ventana de 4 MB); `xz` usa LZMA.

| # | Prueba / tarea | Resultado esperado |
|---|---|---|
| J-1 | Herramienta `pruebas/office/peso.py`: por archivo y por tipo, original, `.nom`, exportado y `xz -9e`; también para **documentos hechos en la app** (los 4 tipos, chicos, medianos y grandes, creados por `prueba_funciones.py`), comparando `.nom` contra su `.docx`/`.xlsx`/`.pptx` exportado | Tabla y gráfica reproducibles; se guardan en `6-PLAN-DE-PRUEBAS/registros/` |
| J-2 | Compresión más fuerte para `.nom` (sin librerías, como `compresion.js`): un LZMA propio (o modelado de contexto) solo para `.nom`, que se siga leyendo el `.nom` v3 actual | `.nom` ≤ `xz -9e` + 5 % en los tres tipos; abrir y guardar en menos de 1 s con un archivo de 5 MB en el A55 |
| J-3 | Que se vea en la app: al descargar, «Este `.nom` pesa X KB; en Word pesaría Y KB (Z % menos)»; en «Cuánto espacio ocupa», lo que se ahorró comprimiendo | El número coincide con el tamaño real del archivo descargado |
| J-4 | Ida y vuelta sin pérdida tras J-2 | `fidelidad.py` sigue en 100 % sin tocar; `.nom` viejos (v2 y v3) se siguen abriendo |

## Bloque K. Nuestros documentos a Word, Excel y PowerPoint

Lo de F es **importar** archivos de Office y volver a guardarlos. Aquí es lo contrario: un
documento **hecho en NOM-COLAB** (sin original de Office dentro) se descarga como `.docx`, `.xlsx`
o `.pptx` y tiene que abrirse en Office sin «reparar» y verse como en la app.

| # | Documento hecho en la app con… | Descargar como | Revisar en LibreOffice y en Office real |
|---|---|---|---|
| K-1 | Texto: títulos, listas, tabla con formato, imagen, nota al pie, ecuación, encabezado y pie, cita APA y referencias, comentario, sugerencia | `.docx` | Todo presente; estilos de título reconocidos por Word (índice automático funciona) |
| K-2 | Hoja: formatos de número, fórmulas de las 94 funciones, celdas combinadas, filas fijas, validación, gráfica, orden y filtro | `.xlsx` | Las fórmulas recalculan igual en Excel; la gráfica aparece |
| K-3 | Presentación: tema, fondos, tabla, gráfica, ícono, imagen recortada, animaciones por pasos, notas | `.pptx` | Animaciones en el mismo orden; notas presentes |
| K-4 | Diagrama: figuras UML y entidad-relación, flechas en codo y curva con texto | `.pptx`, `.svg`, `.png` | Las figuras nuevas salen como forma libre; las flechas siguen pegadas |
| K-5 | Documento a presentación y a mapa mental (generar sin IA) | `.pptx` | Igual que K-3 |
| K-6 | Validación automática | `office/integridad.py` sobre todo lo de K-1 a K-5; y abrir cada archivo con LibreOffice sin interfaz (`soffice --headless --convert-to pdf`) | 0 fallas; el PDF se genera |

## Bloque G. Azure (otra materia, pero por si preguntan)

Hecho el 13 de noviembre: la Web App ya tenía la 0.13.0 desplegada por el flujo de GitHub. Se
prendió, se probó y se volvió a apagar.

- `pruebas/humo.py` contra Azure: **31 de 31** (registro y sesión en Azure SQL, la página entra a la
  base como `nomcolab_app`, que solo tiene permisos sobre los datos; roles por espacio; los cuatro
  tipos de documento; lector no escribe (403); versiones; canal en vivo; chat; pase; borrar
  cuentas).
- Carga con 5 personas: correcta, p50 0.59 s (el plan gratuito es lento; por eso la app usa la
  Raspberry).
- Se agregó el límite por cuenta de 50 MB (`NOM_CUOTA_MB`), que faltaba.

**El día antes**, si se va a mostrar: `nomcolab azure up` (unos 3 min), luego
`NOM_BASE=https://nomcolab-wack.azurewebsites.net python3 4-CODIGO/pruebas/humo.py`; al terminar,
`nomcolab azure down`.

Cómo explicarlo: la entrega de la otra materia pedía base de datos en la nube con seguridad con
roles, y eso está en Azure (Azure SQL + usuarios con rol). Para el proyecto, **la nube es nuestro
servidor propio** (Raspberry Pi 5 + túnel de Cloudflare). Es gratis, siempre prendido, más rápido,
con los datos cifrados, y es el único en el que confía la app para los pases.

---

## Bloque H. Aceptación con personas ajenas (SUS)

Cinco personas que no conocen la app, de preferencia de edades distintas. Tareas guiadas, cada una
cronometrada:

1. Unirse a un espacio con el QR.
2. Escribir juntas un acta de 5 renglones.
3. Llenar una hoja de calificaciones con un promedio.
4. Hacer una presentación de 3 diapositivas a partir del documento.
5. Quitar la red, escribir y volver a ponerla.
6. Descargar en Word.

Al final, el cuestionario SUS (10 preguntas). Meta: SUS ≥ 68 y que cada tarea se termine sin
ayuda. Se anota lo que confundió.

---

## Bloque I. Ensayo de la demo

- Guion de 10-15 min con lo que distingue a la app (sin Internet, ramas, recibo de autoría,
  ruedita, Office sin romper), en el orden en que se va a mostrar.
- Ensayo completo dos veces: una en casa y otra, si se puede, en el salón.
- **Plan B por si algo falla en vivo:** el A55 como servidor con su propia red; documentos de
  ejemplo ya preparados; capturas o video de cada parte.
- La víspera: bloque A completo, `humo.py` contra la Pi (y Azure si se muestra), A55 cargado, APK
  0.13.0 instalado, sesión abierta.

---

## Calendario

| Día | Bloques |
|---|---|
| Vie 13 (noche) | Línea base del bloque A (corriendo); G hecho; D-1 a D-3 hechos |
| Sáb 14 | Regresar el A55; B-1, B-2, B-16 |
| Dom 15 | Corregir lo que salga de B; bloque A otra vez; publicar (todo junto) |
| Lun 16 | B-3 a B-15 con el escritorio, el A55 y la Pi; D-4, D-5 |
| Mar 17 | F-1 a F-8 y K-1 a K-6 (con Office real en la escuela); H (SUS) con 5 personas; C-1 a C-3 en la escuela |
| Mié 18 | C-4 a C-6; corregir; bloque A; guion de la demo |
| Jue 19 | Ensayo × 2; víspera (bloque I) |
| Vie 20 | Presentación |

Después de la presentación: pasar los resultados al plan de pruebas (`6-PLAN-DE-PRUEBAS`,
entrega del 27 de noviembre) y regenerar el PDF.

---

## Registro de resultados

| Id | Fecha | Equipo | Resultado | Defecto | Notas |
|---|---|---|---|---|---|
| A (línea base) | 13-nov | laptop | | | `regresion.sh` |
| D-1 | 13-nov | laptop | Correcto | — | 100 personas, 0 perdidas, p95 10 ms |
| D-2 | 13-nov | Pi | Correcto | — | 5 personas, p50 238 ms |
| D-3 | 13-nov | Azure | Correcto | — | 5 personas, p50 586 ms |
| G (humo) | 13-nov | Azure | 31 de 31 | — | cuota de 50 MB agregada |
| H-3 | 13-nov | código | Corregido en 0.13.1 | DEF-42 | el chat no contaba en la cuota; `seguridad.py` 16.3 |
| H-1, H-2 | 13-nov | laptop | Hecho en 0.13.1 | — | 50 por espacio; tope por dispositivo; `seguridad.py` 375 de 375, límites VL-13/VL-14 con 50 y 51 |
| J (medida) | 13-nov | laptop | Medido | — | `.nom` 73-85 % del original; `xz -9e` 39-82 %: hay margen en Excel |
| App 0.13.1 | 13-nov | emulador Android 15 | Correcto | — | identificador del teléfono igual tras borrar los datos de la app |
| B-1 | 14-nov | A55 (app publicable) | Correcto | DEF-43 | registra en la Pi; la versión no se ve en Ajustes |
| B-2 | 14-nov | A55 | Correcto | — | SUMAR.SI 13.5 con el teclado Samsung; fecha límite guardada (22-nov 12:39) |
| B-16 | 14-nov | A55 + Pi | Correcto | — | 5 por hora; la sexta y la de después de borrar datos: «demasiadas cuentas desde este dispositivo» |
| Tiempo real | 14-nov | A55, escritorio, laptop (Chromium y Firefox), Pi | Correcto | DEF-44 | p50 137-148 ms, máx. 177 ms; lector sin edición; escritura simultánea idéntica en los 4 |
| B-5 | 14-nov | escritorio + laptop + Pi | Correcto | — | 130 s sin red, sin rama, llega en 1.5 s |
| B-6 | 14-nov | escritorio + laptop + Pi | **Falla** | DEF-46 | 200 s sin red con cambio ajeno: se fusionó sin rama |
| B-8 | 14-nov | escritorio | Correcto | — | creado sin red, se subió solo |
| B-9 | 14-nov | escritorio (kill -9 real) | Correcto | — | abre sin la Pi con sesión y documento; lo escrito llega al volver |
| B-3 | 14-nov | A55 servidor + laptop | Correcto | DEF-47 | alias «Armadillo 85» |
| B-4 | 14-nov | A55 servidor + laptop | Correcto | — | entra como pruebaa55x2 con pase |
| F (A55) | 14-nov | A55 | Con defecto | DEF-45, MEJ-1 | Excel perfecto; Word pierde propiedades del párrafo editado; PowerPoint pierde animaciones de la diapositiva editada |
| K / F-1 | 14-nov | laptop | Correcto | — | validador de Microsoft: 511 de 511 sin errores nuevos; LibreOffice abre todo |
| B-11 | 14-nov | A55 servidor + laptop sin Internet | Correcto | — | PDF y foto desde el selector de Android; > 2 MB rechazado con mensaje claro; respuesta de la laptop llega |
| B-15 | 14-nov | laptop + Pi | Parcial | — | la API da los datos sin contraseña; el botón de Ajustes no descargó en el navegador automático: repetir a mano |
| B-10 | 14-nov | laptop + A55 + Pi | Parcial | DEF-48, DEF-49 | la Pi solo guarda cifrado (nombre y texto); el A55 entra con el código con guion, sin llave; falta el QR con cámara |
