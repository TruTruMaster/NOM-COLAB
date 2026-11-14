# Relevo: paridad con Word, Excel y PowerPoint + pruebas reales en equipos (14 de noviembre de 2026, 0.13.1)

Para la siguiente sesión. Lo pedido por el dueño: (1) investigar **todo** lo que tienen Word, Excel y
PowerPoint y que NOM-COLAB todavía no tiene, con la documentación de Microsoft, para que todo lo que
se importe y exporte quede perfecto; (2) probar **a mano y de verdad** lo nuevo (0.13.x) con todas
las formas de conexión: el A55 con la app publicada, el escritorio con su Chromium, la laptop, la
Raspberry; (3) dejar este relevo para que la siguiente sesión termine el trabajo.

Leer antes: las reglas locales del proyecto (el archivo de instrucciones de la raíz de `~/NOM`: qué no
se escribe en archivos, commits ni PR; commits como `trutrumaster`; todo en español), `RELEVO-REVISION-PROFUNDA.md` (T1-T5, sigue
vigente) y `PLAN-PRUEBAS-PRESENTACION.md` (bloques A-K; este relevo llena parte de su registro).

---

## 1. Qué quedó hecho en esta sesión

1. **Pruebas reales** (sección 3): B-1, B-2, B-3, B-4, B-5, B-6, B-8, B-9, B-16, tiempo real con
   cuatro equipos, Office desde el A55 (bloque F) y documentos hechos en la app (bloque K).
2. **Defectos nuevos con causa y arreglo propuesto** (sección 4): DEF-43 a DEF-49, MEJ-1 y el hallazgo H-8.
   **Ninguno se corrigió todavía**: se dejan para una sola versión 0.13.2 (corregir, `regresion.sh`,
   publicar todo junto, como pide el dueño).
3. **Herramienta nueva: el validador oficial de Microsoft** (`pruebas/office/validar_openxml.py` +
   `pruebas/office/openxml/`): valida cada `.docx/.xlsx/.pptx` con el Open XML SDK 3.5.1 (el que usa
   Microsoft; formato Microsoft 365) y reporta **solo los errores nuevos** comparando con el archivo
   original del corpus. Es lo más cercano a «Office lo abre sin reparar» sin tener Office.
   Resultado: **511 de 511 archivos exportados sin errores nuevos** (sección 3.6).
4. **Pruebas reales reutilizables** en `pruebas/reales/` (sección 6): manejar el A55 con toques
   reales (incluido el teclado Samsung tecla por tecla), el Chromium del escritorio por CDP, y varios
   equipos a la vez contra la Raspberry.
5. **Investigación de Office** (sección 5): catálogos de Word, Excel y PowerPoint (cinta completa,
   diálogos, formato del archivo con su sección de ECMA-376, estado en NOM-COLAB con evidencia del
   código, prioridad y cómo implementar) y cobertura mecánica de **cada elemento de los esquemas**
   contra el corpus y el código. Parte quedó terminada y parte sigue corriendo en el escritorio
   (se reanuda sola; ver 5.2).

## 2. Estado exacto de los equipos al cerrar (hay que regresarlos)

| Equipo | Cómo quedó | Qué hacer |
|---|---|---|
| A55 | App 0.13.1 publicable, **otra vez en «NOM-COLAB en Internet»** con la sesión de `pruebaa55x1` (el servidor del teléfono se detuvo; en el teléfono quedó su espacio «Salon A55» con el chat de prueba, del alias de dueño «Grillo 52»); se le dio permiso de notificaciones. En `Download/` quedaron archivos de prueba: carpeta `NOM-pruebas/` (10 de Office), `lo-tdf104420_lostParagraph.docx`, `ms-financial-sample.xlsx`, `ms-animacion.pptx` (exportados) y `Codigo de recuperacion NOM-COLAB - pruebaa55x1.txt`. **No** hay que tocar los demás archivos de `Download/` (son personales). | Al terminar las pruebas: borrar esos archivos (`adb shell rm`) y, si se quiere, el espacio «Salon A55» del teléfono. Para volver de «este teléfono comparte» a la nube: Ajustes → «Cambiar dónde trabaja tu equipo» → abajo «Cambiar» → «Usar NOM-COLAB en Internet» (la notificación «Detener» apaga el servidor, pero al abrir la app vuelve a encenderlo si sigue elegido). |
| Raspberry | Cuentas de prueba `pruebaa55x1` a `pruebaa55x5` y `pruebaflast1` (contraseñas en `~/.cache/nom-pruebas/cuentas-prueba.json`, fuera de git). Espacio «Pruebas A55» (de x1; flast1 y x2 editan, x3 solo ve) con 8 documentos de prueba. Token de x1 en `~/.cache/nom-pruebas/token-x1` (vence el 17-nov). | Reutilizarlas para lo que falta (B-7, B-10, B-11…). Al final, borrarlas (Ajustes → Borrar mi cuenta, o `DELETE /api/cuentas/yo`). |
| Escritorio (`flast-desktop`) | Chromium de pruebas abierto en su pantalla (unidad de usuario `nomchromium4`, perfil `~/.var/app/org.chromium.Chromium/data/nom-real`, CDP en el 9333; desde la laptop: `ssh -f -N -L 9333:localhost:9333 100.84.188.120`), con sesión de `pruebaflast1`. La investigación sigue en `~/investigacion-office/` (ver 5.2). | Cerrar ese Chromium al terminar (`/tmp/matar-nom.sh` en el escritorio; ver 6). |
| Laptop | Servidor de pruebas del 8099 **apagado** (se apagó porque la app del A55 lo encontraba sola en el Wi-Fi: ver H-8). .NET 8 en `~/.dotnet`; validador compilado en `~/.cache/nom-pruebas/openxml-bin`. Registros en `~/.cache/nom-pruebas/registros/2026-11-14-openxml/` y capturas en `~/.cache/nom-pruebas/capturas-reales/`. | Nada. |

Trampas nuevas de esta sesión:
- **Chromium de flatpak desde SSH** ya no arranca con `nohup flatpak run …` (error `Spawn(): Could not
  find requesting pid`): hay que lanzarlo como unidad de usuario:
  `XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus systemd-run --user --unit=nomchromiumN --setenv=DISPLAY=:0 --setenv=XAUTHORITY=/home/user/.Xauthority flatpak run org.chromium.Chromium --user-data-dir=… --remote-debugging-port=9333 …`
- **`systemctl --user kill` no mata al navegador** (flatpak lo saca a otro grupo de procesos): para
  un `kill -9` de verdad, matar el proceso principal `chrome` cuyo `cmdline` tiene el perfil y no
  tiene `--type=` (script `/tmp/matar-nom.sh` en el escritorio; su texto está en la sección 6).
- **Un servidor de pruebas en la laptop con descubrimiento encendido cambia lo que hace la app del
  A55**: tras borrar los datos de la app (o al «Cambiar dónde trabaja tu equipo»), la app se conecta
  sola a ese servidor. Para pruebas con el A55, arrancar el de la laptop con `NOM_DESCUBRIMIENTO=false`.
- **uiautomator** sí lee la página dentro del WebView de la app publicable (botones y textos con su
  posición), pero tras deslizar dentro de una hoja inferior a veces da la lista vieja: confirmar con
  una captura. `adb shell input tap` dos veces no alcanza a ser «doble toque» (más de 350 ms entre
  toques), así que editar el texto de una diapositiva por adb no se pudo (una persona sí puede).
- `KEYCODE_BACK` con el teclado ya oculto **regresa de pantalla** (cerró la hoja de «Nuevo espacio» y
  el formulario de cuenta): ocultar el teclado solo si `dumpsys input_method` dice `mInputShown=true`.
- La investigación del escritorio tiene un tope de uso que se renueva cada 5 horas (con 4 tareas a la
  vez se acabó en 12 minutos); `~/investigacion-office/continuar.sh` espera solo y sigue.

## 3. Resultados de las pruebas reales (14 de noviembre)

Equipos: **A55** (Android 16, WebView 157, app 0.13.1 publicable, toques reales por adb y el
teclado Samsung), **escritorio** (Chromium 157 real en su pantalla, por CDP), **laptop** (Chromium y
Firefox de Playwright), **Raspberry** (`https://nomcolab.dpdns.org`, 0.13.1).

### 3.1 Bloque B en el A55 y el escritorio

| Id | Resultado | Detalle |
|---|---|---|
| B-1 | Correcto, con DEF-43 | La app publicable abre y registra contra la Pi; el código de recuperación se guarda en Descargas («Guardar archivo»). **La versión no aparece en ningún lado de Ajustes** (solo en los avisos de versión distinta); agregarla en «Ajustes y preferencias» (abajo) o en Ayuda → Acerca de. |
| B-2 (a) | **Correcto** | Hoja en la app: datos con teclas rápidas (Tab, Enter) y «B» en D6 tecleada en el teclado Samsung (por el IME) → `=SUMAR.SI(D2:D5;"B";B2:B5)` = 13.5. La falla de la 0.12.2 no se repite con la app publicable. |
| B-2 (b) | **Correcto** | «Entrega con fecha límite»: el campo abre el selector nativo de Android («Set date and time»); se eligió 22-nov 12:39 p. m., se guardó y el servidor tiene `entregaLimite` = 2026-11-22 12:39. |
| B-16 | **Correcto** | Desde la app del A55 contra la Pi: 5 cuentas; la sexta: «Se crearon demasiadas cuentas desde este dispositivo en la última hora. Intenta más tarde.»; tras **borrar los datos de la app** (`pm clear`), igual. Sin marcar «Leí y acepto…»: «Para crear la cuenta, lee y acepta los Términos y el Aviso de privacidad». |
| Tiempo real | **Correcto**, con DEF-44 | Mismo texto en la app del A55 (x1), Chromium del escritorio (flast1), Chromium de la laptop (x2) y Firefox de la laptop (x3, solo ver), por la Pi. Llegada: **p50 137-148 ms, máx. 177 ms** (8 muestras por sentido). El lector no puede escribir (no hay campo editable; dice «Solo puedes ver: también buscar y descargar»). Dos personas escribiendo en el mismo renglón a la vez: los cuatro equipos quedan **idénticos**. |
| B-5 | **Correcto** | Escritorio sin red 130 s escribiendo («Sin conexión · 24 cambios guardados aquí»); nadie más cambia; al volver la red la laptop lo ve en 1.5 s; no hay rama. |
| B-6 | **FALLA: DEF-46** | Escritorio sin red **200 s** escribiendo mientras la laptop cambia el mismo documento: **no se creó rama**, lo escrito sin red se fusionó solo en el original. Causa encontrada (sección 4). |
| B-7 | No hecho | Depende de B-6 (DEF-46). |
| B-8 | **Correcto** | Escritorio sin acceso a la Pi: «Nuevo documento» → abre `#/local/…` con «Se sube al volver la red · Lo creaste sin conexión dentro de Pruebas A55: se guarda aquí, cifrado…»; al volver la red se subió solo. |
| B-9 | **Correcto** | `kill -9` real del Chromium del escritorio justo después de escribir sin red; al abrirlo **sin acceso a la Pi** (`--host-resolver-rules`): abre con la sesión (DEF-35 confirmado en un navegador real), el documento y lo escrito («Sin conexión» en rojo). Al volver la red, lo escrito llegó a la Pi. |
| B-3 | **Correcto** | A55 como servidor; la laptop **sin acceso a la nube** abre `http://192.168.0.86:8080/unirse?c=…`: «Este espacio está en un teléfono que comparte, sin Internet… Entrar con un alias» → entra como «Armadillo 85» (`alias: true`). |
| B-4 | **Correcto** | La laptop **con Internet**: el mismo enlace ofrece además «Entrar con mi cuenta»; pide usuario y contraseña de la nube (el origen del teléfono no comparte la sesión del navegador) y entra como `pruebaa55x2` (mismo id que en la nube, `nube: https://nomcolab.dpdns.org`). |
| Encender en el A55 | Falla de flujo: DEF-47 | Ver sección 4. Tras cerrar y abrir la app, entra directo como dueño («Grillo 52»), como dice la ayuda. |
| B-11 | **Correcto** | Chat del espacio del teléfono: desde el A55 (selector de Android, vista de lista) un PDF y una foto; la laptop **sin Internet** (alias) los ve, el PDF llega idéntico byte por byte y la foto abre en su visor a 800×600; su respuesta llega al A55. Un archivo de 11.7 MB: «El archivo pasa de 2 MB. Súbelo como documento del espacio.» Ojo: en el selector de Android, en vista de cuadrícula, tocar el nombre abre la **vista previa de la Galería** en vez de elegir el archivo (es de Android; una persona lo nota, pero confunde). |
| B-15 | Parcial | `GET /api/cuentas/datos` con la cuenta x5: 200, 771 bytes, sin contraseña. Desde el botón «Descargar» de Ajustes (Chromium automático de la laptop) **no salió la descarga ni un aviso**; repetir a mano en un navegador real (puede ser de la prueba). Borrar la cuenta: no se hizo (x5 sigue). |
| B-10 | Parcial, con DEF-48 y DEF-49 | Espacio cifrado creado en la laptop (x2) con un documento; en la Pi el nombre del espacio es `e2e:AX2P…` y el documento no tiene ni el texto ni el nombre en claro (**correcto**). El A55 (x1) entra con el código escrito **con guion** (`V5MP-4CWE`): «Este código no trae la llave: entra con el QR o la dirección completa…», y dentro: «este equipo todavía no tiene su llave» (correcto según el diseño). **Sin guion** (`V5MP4CWE`) la app lo toma como dirección de un servidor: DEF-48. La dirección completa (con `#k=` la llave) no se puede meter en la app: DEF-49. Falta: escanear el QR con la cámara (necesita a una persona). |
| B-12 | Correcto (enlace) | «Enlace para ver sin cuenta» del acta (dueño x1): en un navegador sin sesión se ve «Acta A55 · Texto · de Pruebas A55 · solo lectura», con «Imprimir o guardar PDF», sin edición y sin errores. **Proyector:** no se terminó (la prueba automática no encontró el código en la pantalla de quien presenta: `pruebas/reales/b12_proyector.py`; revisar a mano). |
| Funciones en navegadores reales | 160 de 163 en el escritorio; **162 de 163 en Chrome del A55** | `prueba_funciones.py --cdp` contra el Chromium 157 real del escritorio (servidor de la laptop por túnel inverso, `NOM_DESCUBRIMIENTO=false`): fallan solo los 2 casos del QR (el servidor de prueba no se anuncia en la red: esperado) y «Descargar todo» (por CDP remoto la descarga llega vacía a la laptop: es de la prueba, no de la app; en local pasa). En el Chrome real del A55 (`--cdp` por adb, servidor de la laptop por la red de la casa) falla solo «Descargar todo» por lo mismo; el `.zip` **sí llegó** a `Download/` del teléfono (6 documentos hechos en la app: texto, hoja, presentación, diagrama, hoja protegida) y los 6 pasan el validador de Microsoft sin errores y abren en LibreOffice. Registro: `~/.cache/nom-pruebas/registros/2026-11-14-reales/`. |
| B-13, B-14, B-17 | No hechos | Lista en la sección 7. |

### 3.2 Office en el A55 (bloque F, con la app publicable)

Archivos copiados a `Download/NOM-pruebas/` e importados con **«Nuevo documento → Importar
archivo»** (abre el selector de archivos de Android); editados con el dedo; descargados con el menú
(⋯ → «Descargar Word/Excel/PowerPoint»), que los deja en `Download/`. Comparados parte por parte
con el original:

| Archivo | Edición | Qué cambió en el archivo descargado | Validador de Microsoft | LibreOffice |
|---|---|---|---|---|
| `lo-tdf104420_lostParagraph.docx` (encabezado con tabla y logotipo, dos secciones) | texto al final del párrafo | 21 de 22 partes idénticas (encabezados, imagen, estilos). En `document.xml` solo el párrafo editado, pero **perdió `<w:rFonts w:cs="Arial"/>` y los `rsid`** (lo que el modelo no guarda se borra al regenerar el párrafo): ver MEJ-1 en la sección 4. En pantalla el encabezado no se ve (límite conocido). | 0 errores | abre |
| `ms-financial-sample.xlsx` (tabla con formato) | B2 = `CanadaEditadoA55` | 24 de 26 partes idénticas; en la hoja solo B2 (cadena en línea) y `calcPr fullCalcOnLoad="1"` (para que Excel recalcule). Parche mínimo: **perfecto**. En pantalla la tabla no muestra su estilo (límite conocido). | 0 errores | abre |
| `ms-animacion.pptx` (animaciones) | negrita del título con la ruedita | 42 de 43 partes idénticas, pero la diapositiva editada **perdió sus animaciones y su marcador de posición**: **DEF-45** | 0 errores | abre |

### 3.3 Documentos hechos en la app (bloque K)

Desde el Chromium de la laptop (x2) se descargaron los 7 documentos del espacio de prueba (texto con
plantilla de acta, hoja con `SUMAR.SI`, documento creado sin red, más los tres importados): **0 errores
en el validador de Microsoft**, LibreOffice abre los 7, y la fórmula sale en inglés y recalcula
(`Notas_A55.xlsx` → A7 = 13.5). El `.pptx` descargado en el navegador pesa lo mismo que el del A55
(94 109 bytes): misma salida en los dos equipos.

### 3.4 Cosas de la interfaz vistas al usarla (no son defectos graves, pero hay que decidir)

- **Hoja en el celular:** «Enter» después de varios «Tab» baja en la misma columna; en Excel regresa a
  la columna donde empezó la fila (A2). Paridad, prioridad media.
- **Diapositiva en el celular:** para escribir en un cuadro hay que tocar dos veces rápido (< 350 ms,
  `lienzo.js:1532`). El consejo dice «Mantén presionada una figura: sale su ruedita» pero no cómo
  escribir, y la ruedita no tiene «Editar texto». Proponer: un toque sobre un cuadro ya
  seleccionado = escribir (como PowerPoint en el celular) y «Editar texto» en la ruedita.
- **Selector de fecha** del A55 sale en inglés (sigue el idioma del sistema del teléfono): normal.
- El A55 mostró «Buenos días» a las 00:13: correcto en español, pero se puede revisar el corte.
- Con la tecla «Atrás» de Android con un menú abierto en la hoja, se cerró el menú **y** se salió del
  documento (una sola pulsación). Revisar que «Atrás» solo cierre el menú.

### 3.5 Lo que mide el validador de Microsoft (para decirlo con números)

`python3 pruebas/office/validar_openxml.py <carpetas>` sobre todo lo que exportan las pruebas
(`office-ediciones` 144, `office-ui-escritorio` 180, `office-ui-movil` 180, los del A55, los hechos en
la app): **511 bien, 0 con errores nuevos**. Los 22 archivos que sí tienen errores los traen ya los
originales de Microsoft (`w:smartTag` viejo, `pageSetup` con DPI 0, ids de VML repetidos en
`mc:Fallback`) y 2 originales ni siquiera abren en el validador (`lo-forcepoint107.xlsx`, dañado a
propósito; `lo-tdf169781.pptx`, le falta `slideLayout19.xml`): salen igual que entraron.
Registro: `~/.cache/nom-pruebas/registros/2026-11-14-openxml/`.

**Agregarlo a `regresion.sh`** (bloque F) después de `ediciones.py` y `pantalla.py`:
`python3 pruebas/office/validar_openxml.py ~/.cache/nom-pruebas/office-ediciones ~/.cache/nom-pruebas/office-ui-escritorio`.

## 4. Defectos nuevos (en orden de prioridad para la 0.13.2)

### DEF-46 (alta) · Ramas: lo editado sin red se fusiona solo aunque otra persona cambió el documento

- **Pasos (escritorio real):** documento abierto; quitar la red 200 s escribiendo; mientras, otra
  persona escribe en el mismo documento en la nube; regresar la red. **Esperado:** rama; el original
  sin lo escrito sin red. **Pasa:** sin rama; todo junto en el original (decisión del dueño violada:
  «nunca fusión automática»).
- **Causa (comprobada por CDP):** en `crdt.js` `enviar()`, cada reintento sin red pasa por
  `NOM.ramas.decidir()`. Como `Date.now() - m.desde <= UMBRAL`, `decidir()` (`ramas.js`, función
  `decidir`, primera condición) hace **`soltar(ctx.docId)`** y regresa `"enviar"`; el envío falla sin
  red y el `catch (e.red)` vuelve a `NOM.ramas.marcar()` con **`desde = ahora`**. Los reintentos son
  cada ≤ 4 s, así que la marca nunca cumple 2 minutos: al volver la red tiene segundos de edad → se
  manda tal cual. Visto: la marca pasó de `desde=1794640349335` a `1794640353336` en 4 s, y al volver
  la red solo hubo `POST /ops`, ningún `POST /cambios-desde`.
- **Por qué no lo vio `prueba_sin_internet.py`:** acorta el umbral con `nom.prueba.umbralRama` a menos
  que el intervalo entre reintentos.
- **Arreglo:** en `decidir()`, si no ha pasado el umbral, `return "enviar"` **sin** `soltar()`;
  soltar la marca solo cuando el envío salió bien y no quedan pendientes (rama de éxito de `enviar()`
  en `crdt.js` y en `vaciar()` de `cola.js`). Revisar también `marcar()`: si ya hay marca, no tocar
  `desde` ni `base`.
- **Prueba nueva:** en `prueba_sin_internet.py`, umbral de 10 s, sin red 25 s **con reintentos reales**
  (no adelantar el reloj) y otra cuenta cambiando el documento → debe haber rama; y otra con 5 s sin
  red → sin rama. Después, B-6 y B-7 en el escritorio real con `pruebas/reales/rama.py`.

### DEF-45 (alta) · PowerPoint: editar una diapositiva importada borra sus animaciones y sus marcadores

- **Pasos:** importar `ms-animacion.pptx`, poner en negrita el título de la diapositiva 1 (ruedita),
  descargar `.pptx`.
- **Pasa:** `ppt/slides/slide1.xml` se regenera completo: (1) **sin `<p:timing>`** (las animaciones de
  esa diapositiva se pierden), (2) el título `p:ph type="ctrTitle"` con `p:spPr` vacío (hereda del
  diseño) sale como **cuadro de texto suelto** (`txBox="1"`, `a:xfrm`, `prstGeom rect`, `sz=4000`,
  color y fuente fijos): en PowerPoint deja de ser el título (esquema, accesibilidad, cambiar de
  diseño), (3) cambia `name`/`id` («Title 1» → «Título 4»), `lang` en-US → es-MX, se pierden
  `endParaRPr` y `smtClean`. El archivo es válido (0 errores) pero **pierde información**.
- **Causa en el código:** `ooxml.js`, `pptxArmar` → `conOrigen`: cada figura importada queda en un
  modo (`ooxml.js:2647-2660`): «igual», «geo» (solo se movió), «texto» (cambió lo escrito) o «nuevo»
  (se vuelve a escribir desde el modelo). Un cambio de **formato** (negrita) cae en «nuevo», y en
  `ooxml.js:2709-2710` basta una figura «nueva» para **quitar todo `p:timing`** («las animaciones
  apuntan a figuras por número»). Al reescribirla, además, sale con `id` nuevo y sin `p:ph`.
- **Arreglo propuesto:** (1) un modo «formato» que parche solo `a:rPr`/`a:pPr` dentro del `p:txBody`
  original; (2) al reescribir una figura, **conservar su `p:cNvPr id` y su `p:nvSpPr`** (con `p:ph`) y
  dejar `p:spPr` vacío si no se movió; (3) con los `id` conservados, **no quitar `p:timing`**: solo
  borrar los `p:par` cuyo `p:spTgt spid` apunte a una figura que ya no existe (y su `p:bldP`). Es lo
  mismo que ya hace Excel (`xlsxConOrigen`): partir del XML original y **reemplazar solo lo cambiado**; si solo
  cambió texto o formato, parchar su `p:txBody` (y `a:rPr` de las corridas tocadas) y dejar
  `p:nvSpPr` (con `p:ph`), `p:spPr` vacío si no se movió, `p:timing`, `p:transition` y `p:extLst` tal
  cual. Si se borró una figura con animación, quitar sus `p:par` de `p:timing` (si no, PowerPoint
  pide reparar). La investigación de PowerPoint (`docs/paridad/POWERPOINT.md`, sección del modelo de
  herencia) explica cómo leer `p:ph` y la herencia patrón → diseño → diapositiva.
- **Prueba nueva:** en `office/ediciones.py`, «negrita del título» y «cambiar el texto del título» en
  `ms-animacion.pptx` y `ms-of16.pptx`; revisar en la salida `<p:timing`, `<p:ph` y que las demás
  diapositivas salgan idénticas; y `validar_openxml.py` sobre la salida.

### DEF-44 (media) · Error de JavaScript al marcar «lo que cambió desde tu última visita»

- **Visto en:** Chromium y Firefox de la laptop (cuentas que ya habían visitado el documento),
  mientras otra persona escribía al final del documento: `Cannot read properties of undefined
  (reading 'v')` / `sec().items[k] is undefined`.
- **Causa:** `modo-texto.js:1389` (`aplicarResaltado`): para un rango que termina en `FIN`,
  `sec().item(FIN)` regresa `sec().fin`, que no está en `sec().items`; `sec().indice()` da -1 y
  `sec().items[-1].v` truena.
- **Arreglo:** `const it = …; if (!it) return; if (it === sec().fin) { tocados.add(parrafoEn(visPintado.length - 1)); return; } let k = sec().indice(it); if (k < 0) return;`
- **Prueba:** caso en `prueba_funciones.py`: dos cuentas; B escribe con Control+End al final; A
  vuelve a abrir el documento → 0 `pageerror`.

### DEF-47 (media) · «Encender» en el teléfono no cambia la app al servidor del teléfono

- **Pasos (A55):** con la app conectada a un servidor de la red local (p. ej. la computadora del
  salón), «Cambiar dónde trabaja tu equipo» → «Compartir desde este teléfono → Encender».
- **Pasa:** el servidor del teléfono enciende (aviso verde «Este teléfono comparte · los demás entran
  en 192.168.0.86:8080»), pero la app se queda en el otro servidor y pide usuario y contraseña. Solo
  al cerrar y abrir la app entra como dueño del teléfono. La ayuda (`sin-internet/telefono-servidor`)
  dice «Entras directo como dueño del teléfono».
- **Arreglo:** al encender, fijar el servidor de la app en el propio teléfono y entrar como dueño
  (lo mismo que hace al arrancar). Probar con otro servidor anunciándose en el Wi-Fi.

### DEF-48 (media) · En la app, un código escrito sin guion se toma como dirección de un servidor

- **Pasos (A55, app publicable, con sesión en la Pi):** Unirse → Escribir código → `V5MP4CWE` (el
  código de un espacio de la Pi, sin el guion) → Entrar.
- **Pasa:** «Abrir otro equipo — Este espacio vive en V5MP4CWE. Se abrirá NOM-COLAB de ese equipo
  (http://V5MP4CWE:8080)». Con guion (`V5MP-4CWE`) sí entra. En el escritorio, el mismo flujo sin
  guion (`RTZQ9TP8`) sí funcionó. La ayuda dice «escriben 8 letras»: la gente no escribe el guion.
- **Arreglo:** si lo escrito son 8 letras/números (con o sin guion, en mayúsculas o minúsculas), es
  un código; solo con punto, dos puntos o diagonal es una dirección. Prueba en `prueba_funciones.py`
  (y en `--movil`): código sin guion, con guion, en minúsculas y con espacios.

### DEF-49 (media) · La llave de un espacio cifrado no se puede llevar a la app sin la cámara

- La app no abre enlaces (`AndroidManifest.xml` solo tiene `MAIN/LAUNCHER`): una invitación
  `https://nomcolab.dpdns.org/unirse?c=…#k=…` que llega por mensaje se abre en Chrome, no en la app.
- El campo «Escribir código» corta a 12 caracteres: la dirección completa (que trae la llave) no se
  puede pegar. El aviso del espacio dice «ábrelo con el código QR o la dirección completa».
- **Arreglo:** (1) que «Escribir código» acepte una dirección completa pegada (sacar `c` y `k`);
  (2) *App Links*: `intent-filter` con `autoVerify` para `https://nomcolab.dpdns.org/unirse` y
  `/.well-known/assetlinks.json` en la Pi con la huella SHA-256 del APK (`2ef146f6…b6c9`); en
  `MainActivity`, pasar la URL al WebView. Probar con `adb shell am start -a android.intent.action.VIEW -d '<enlace>'`.

### DEF-43 (baja) · «Valores de fábrica» sale cortado en el A55

En «Ajustes y preferencias», abajo a la izquierda: «/alores de fábric» (el texto es más ancho que su
botón y se recorta por los dos lados), 1080 px de ancho, letra normal. Revisar el pie de la hoja
(CSS del botón secundario: `white-space`, `min-width` o que el pie permita dos renglones).

### H-8 (decidir con el dueño) · La app elige sola un servidor de la red local

Tras borrar los datos de la app, y al tocar «Cambiar dónde trabaja tu equipo», la app **se conectó
sola** al primer servidor que encontró en el Wi-Fi (la laptop de pruebas, «user 192.168.0.96:8099») y
mostró «Iniciar sesión» ahí, con «Conectado con user» en letra chica. En un Wi-Fi público cualquiera
puede anunciar un servidor: la persona podría escribir su contraseña de la nube en un servidor ajeno.
Propuesta: no elegir solo; mostrar la lista (nombre del equipo, dirección) y que la persona toque; en
la pantalla de entrar, decir en grande a qué servidor entra. (Además: así se creó `pruebaa55x7` en el
servidor de la laptop, no en la Pi.)

### MEJ-1 (Office, parte de la paridad) · Al editar un párrafo de Word se borran las propiedades que la app no guarda

El párrafo editado se regenera desde el modelo (`ooxml.js`: `cuerpoConOrigen`, línea 280, copia textual los párrafos sin cambios y reescribe los cambiados con el escritor de corridas de las líneas 194-206): lo que el modelo no tiene (`w:rFonts w:cs`,
`w:eastAsia`, `rsid`, `w:lang`, subrayados de estilo distinto a sencillo, etc.) se pierde. Arreglo de
fondo (igual que DEF-45): **parchar** el XML original del párrafo (conservar `w:pPr`/`w:rPr`
originales y cambiar solo los atributos que la persona tocó). La lista de lo que el modelo no guarda
está en `docs/paridad/WORD.md` (filas «Parcial» y «No» con «se conserva sin verse»).

## 5. Investigación de Word, Excel y PowerPoint

### 5.1 Qué hay y dónde

Se hizo en segundo plano en el escritorio (`flast-desktop`), con las fuentes de Microsoft: la lista oficial de comandos de la cinta (`OfficeDev/office-fluent-ui-command-identifiers`),
support.microsoft.com, learn.microsoft.com, las especificaciones abiertas `[MS-OI29500]`, `[MS-DOCX]`,
`[MS-XLSX]`, `[MS-PPTX]`, `[MS-ODRAWXML]` y los esquemas XSD de **ECMA-376 5.ª edición** (descargados
de ecma-international.org). Instrucciones exactas que se le dieron: `docs/paridad/encargo/` (copiar
de `~/investigacion-office/*.md` del escritorio).

| Archivo (en el escritorio: `~/investigacion-office/salida/`) | Qué es | Estado al cerrar |
|---|---|---|
| `WORD.md` | Catálogo de Word: cada pestaña, grupo y comando, y cada opción de los diálogos; por fila: qué hace, cómo se guarda (parte, elemento, sección de ECMA-376), si NOM-COLAB lo tiene (con `archivo:línea`), qué pasa al importar y exportar, prioridad, cómo implementarlo y en qué archivo del corpus aparece | Archivo, Inicio e Insertar (150 filas); sigue |
| `POWERPOINT.md` | Lo mismo para PowerPoint, más cada transición, cada animación (`presetClass`/`presetID`), cada geometría y el modelo de herencia | Inicio e Insertar (152 filas); sigue |
| `EXCEL.md` y `EXCEL-FUNCIONES.csv` | Lo mismo para Excel; todas las funciones (~500) con nombre en español, categoría, versión, prefijo `_xlfn.` y si la app la tiene | Sin escribir todavía; sigue |
| `OOXML-COBERTURA.md`, `ooxml-elementos.csv`, `ooxml-atributos.csv`, `FUENTES.md`, `herramientas/cobertura.py` | Cada elemento y atributo de los esquemas (WordprocessingML, SpreadsheetML, PresentationML, DrawingML, gráficas, extensiones de Microsoft): en cuántos archivos del corpus aparece, si el importador lo lee y si el exportador lo escribe; el programa es reproducible | CSV hechos (329 KB y 504 KB); falta el documento y las fuentes |

Copia de lo que había al cerrar: `docs/paridad/` (ver su `LEEME.md`). **La versión final está en el
escritorio** cuando termine 5.2.

### 5.2 Cómo sigue sola y cómo recoger el resultado

En el escritorio corre `~/investigacion-office/continuar.sh` (lo lanzó un `nohup` que esperaba a las
02:52 hora del escritorio, cuando se renueva el tope de uso): continúa las tareas de dos en
dos (Excel y Word primero, luego PowerPoint y formatos), cada una retomando su archivo de salida sin
rehacerlo; si se acaba el tope de uso, espera a que se renueve y sigue. Bitácora: `logs/continuar.log`; una
tarea terminada escribe `TAREA-TERMINADA` en `logs/<tarea>.estado`.

Para recoger: `scp -r 100.84.188.120:investigacion-office/salida/* 4-CODIGO/docs/paridad/` y, antes del
commit, revisar que no haya menciones prohibidas por las reglas del proyecto (las instrucciones del
encargo ya lo piden).

### 5.3 Qué hacer con la investigación (orden recomendado)

1. Juntar los cuatro catálogos en `docs/PARIDAD-OFFICE.md` (T3.1 de `RELEVO-REVISION-PROFUNDA.md`):
   porcentaje por programa y por pestaña, y la lista única de «los 40 faltantes más importantes» de
   cada uno, reordenada por lo que más usan estudiantes y oficinas.
2. Antes de agregar funciones nuevas, **que no se pierda nada al editar** (lo que el dueño pidió:
   «importados y exportados perfectos»): DEF-45 y MEJ-1 (parchar en vez de regenerar, en Word y
   PowerPoint), y lo que `OOXML-COBERTURA.md` marque como «aparece en ≥ 3 archivos del corpus y la app
   no lo lee» dentro de una parte que la app regenera.
3. Después, lo que se **ve**: herencia de PowerPoint (negrita 56 %, posición 86 % en `--modelo`),
   encabezados y pies de Word, gráficas/formato condicional/comentarios/imágenes de Excel (0 %).
4. Funciones de Excel por prioridad desde `EXCEL-FUNCIONES.csv` (meta: 150 con prueba).
5. Medir después de cada tanda: `fidelidad.py --modelo`, `fidelidad.py`, `ediciones.py --office`,
   `validar_openxml.py` (0 errores nuevos), `pantalla.py`, `raros.py`.

### 5.4 Office de verdad

En casa no hay Microsoft Office. Opciones, de más fácil a más difícil: (1) el validador de Microsoft
(ya está, sección 3.5); (2) instalar **Microsoft 365 (Office)** desde Play Store en el A55 y abrir ahí
los archivos descargados (en el teléfono se pueden ver sin pagar; anotar si dice «reparar»);
(3) el escritorio tiene otra instalación, `flast-desktop-win` en Tailscale (apagada): si tiene Office,
arrancar ahí con permiso del dueño; (4) la computadora de la escuela (bloques F y K del plan).

## 6. Pruebas reales reutilizables (`pruebas/reales/`)

| Archivo | Qué hace |
|---|---|
| `a55.py` | El A55 por adb: árbol de la pantalla (también dentro del WebView), tocar por texto, deslizar, escribir, capturas reducidas y **teclear con el teclado Samsung** tecla por tecla (`teclear_ime`, pasa por el IME como una persona). Variable `NOM_A55` = serie de `adb devices`. |
| `registrar.py`, `entrar.py` | Crear cuentas y entrar desde la app del A55 (B-16). |
| `fl.py` | El Chromium real del escritorio por CDP (`localhost:9333` por túnel). |
| `comun.py` | Varios equipos a la vez contra la Pi (`NOM_BASE`): perfiles persistentes en la laptop, CDP del escritorio. |
| `sync_texto.py DOC` | Tiempo real con 4 equipos (incluye el A55) y escritura simultánea. |
| `latencia.py DOC [N]` | Tiempo de llegada entre equipos (escritorio↔laptop, y al lector en Firefox). |
| `rama.py DOC ESPACIO SEGUNDOS [solo6]` | B-5 y B-6 con el escritorio real (sin red por CDP). |
| `diag_rama.py DOC` | Muestra la marca de rama en la bóveda mientras se está sin red (DEF-46). |
| `telefono.py ENLACE`, `telefono2.py ENLACE` | B-3 (alias sin Internet) y B-4 (con cuenta) contra el A55 como servidor. |
| `exportar_k.py ESPACIO` | Descarga cada documento del espacio como Office (bloque K). |
| `b10.py` | Crea en la laptop un espacio cifrado con un documento (B-10); el código se mete en el A55 a mano o con `a55.py`. |
| `b12.py DOC`, `b12_proyector.py DOC` | Enlace para ver sin cuenta y proyector (B-12). |
| `b15.py` | Descargar mis datos y borrar cuenta (B-15). |
| `chat_laptop.py ENLACE captura.png` | Del lado de la laptop sin Internet: abre la foto del chat y responde (B-11). |
| Suites en navegadores reales | `prueba_funciones.py SALIDA --cdp http://localhost:9333 --base http://localhost:8099` (escritorio: servidor de la laptop con `NOM_DESCUBRIMIENTO=false` y `ssh -f -N -R 8099:localhost:8099 100.84.188.120`); Chrome del A55: `adb forward tcp:9222 localabstract:chrome_devtools_remote` (con Chrome abierto) y `--cdp http://localhost:9222 --base http://192.168.0.96:8099`. |

Matar solo el Chromium de pruebas del escritorio (`/tmp/matar-nom.sh` allá):

```bash
for p in $(pgrep -x chrome); do
  if tr "\0" " " < /proc/$p/cmdline | grep -q "data/nom-real" && ! tr "\0" " " < /proc/$p/cmdline | grep -q -- "--type="; then kill -9 $p; fi
done
```

## 7. Lo que falta del plan (después de la 0.13.2)

- **B-7** (comparar, fusionar, regresar, descartar) con una rama de verdad (después de DEF-46).
- **B-10** terminar: QR con la **cámara real** (una persona apunta el A55 a la pantalla); después
  de DEF-48/DEF-49, el enlace completo.
- **B-12** el proyector; **B-13** ayuda sin red en la app; **B-14** instalar la página
  en el escritorio y abrirla sin red; **B-15** terminar: botón «Descargar» de Ajustes a mano y borrar la cuenta `pruebaa55x5`.
- **B-17** 4 equipos reales + `carga.py --personas 40` en el mismo espacio; **D-4** (Pi con 50),
  **D-5** (A55 como servidor: `carga.py` con alias).
- **C** (red de la escuela), **H** (SUS con 5 personas), **I** (ensayo).
- Pasar todo al registro de `PLAN-PRUEBAS-PRESENTACION.md` y al plan de pruebas (PDF del 27-nov).
