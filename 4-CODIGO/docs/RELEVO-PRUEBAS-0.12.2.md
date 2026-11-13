# Relevo: revisión completa de pruebas (0.12.2, 13 de noviembre de 2026)

Para la siguiente sesión de trabajo: qué se probó, cómo volver a correrlo, qué se corrigió y **qué
queda por revisar a ojo** (lo que las pruebas automáticas no alcanzan a juzgar). La lista de
defectos corregidos está en `PLAN-CONSTRUCCION.md`, fase 12, y en `LOG.md`, entrada 54.

## 1. Dónde se probó

| Equipo | Cómo se maneja | Qué corrió |
|---|---|---|
| Laptop (`nomcolab`) | Playwright con Chromium y Firefox | todo: seguridad, límites, las 12 de `pruebas/interfaz`, `rastreo.py`, `prueba_funciones.py`, Office |
| Escritorio (`flast-desktop`, Debian 13, X11) | Chromium 157 de verdad en su pantalla, por CDP (túnel SSH al puerto 9333) | `rastreo.py`, `prueba_funciones.py` |
| Samsung A55 (Android 16, WebView 157) | Chrome por CDP (puerto 9222); la app con un APK de **depuración** (su WebView sí da CDP, puerto 9224); toques reales con `adb shell input` | `rastreo.py`, `prueba_funciones.py`, ruedita con el dedo, teclado del teléfono, el teléfono como servidor (212 de 212 de `seguridad.py`), tres equipos editando a la vez |
| La Raspberry (`https://nomcolab.dpdns.org`) | la app del A55 + Chromium de la laptop + Chromium del escritorio | sincronización a tres, sin red y de regreso, hoja en los dos sentidos (cuentas `prueba…` que se borraron al final) |

Registros de esta tanda: `6-PLAN-DE-PRUEBAS/registros/` (copiados de `~/.cache/nom-pruebas/registros/final/`).

## 2. Cómo volver a correrlo

```bash
# servidor de pruebas (interfaz en vivo desde el código)
cd 4-CODIGO/app && mvn -o -q package
NOM_PUERTO=8099 NOM_DATOS=~/nom-datos-pruebas SPRING_WEB_RESOURCES_STATIC_LOCATIONS=file:$PWD/src/main/resources/static/ java -jar target/nom-colab.jar &
export PLAYWRIGHT_BROWSERS_PATH=~/.cache/nom-pruebas/navegadores; PY=~/.cache/nom-pruebas/venv/bin/python
cd ../pruebas
python3 seguridad.py                                   # arranca su propio servidor limpio
$PY interfaz/prueba_funciones.py SALIDA [--movil]      # NOM_NAVEGADOR=firefox para Firefox
$PY interfaz/rastreo.py SALIDA [--movil]
$PY office/fidelidad.py ~/.cache/nom-pruebas/corpus/*/* ~/.cache/nom-pruebas/corpus-web/*/*
$PY office/visor.py SALIDA ~/.cache/nom-pruebas/corpus-web/*/*     # capturas lado a lado con LibreOffice
```

- **A55 por adb inalámbrico:** el puerto cambia; se encuentra con `adb mdns services` y
  `adb connect 192.168.0.59:<puerto>`. Chrome: `adb forward tcp:9222 localabstract:chrome_devtools_remote`.
- **La app por CDP:** solo con `./gradlew assembleDebug` (misma llave, se instala encima sin borrar
  datos). `adb forward tcp:9224 localabstract:webview_devtools_remote_$(adb shell pidof mx.wack.nom)`
  y luego `NOM_APP=1 … --cdp http://localhost:9224 --base http://100.77.150.52:8099`. **Al terminar,
  volver a instalar el APK publicable** (`3-APP-Android/NOM-COLAB.apk`).
- **Escritorio:** `ssh 100.84.188.120 'DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
  flatpak run org.chromium.Chromium --user-data-dir=/tmp/nom-perfil --remote-debugging-port=9333 …'`
  (sin la variable de DBus, flatpak no arranca desde SSH) y `ssh -f -N -L 9333:localhost:9333 100.84.188.120`.
- **Corpus de Office:** `~/.cache/nom-pruebas/corpus` (Microsoft Open XML SDK y Apache POI) y
  `~/.cache/nom-pruebas/corpus-web` (43 archivos de Microsoft Office tomados de las pruebas de
  regresión de LibreOffice y del paquete officer; uno, `lo-forcepoint107.xlsx`, viene dañado a
  propósito: sirve para probar que un archivo roto no tumbe la exportación).
- **Cloudflare** (la Raspberry) rechaza el cliente de `urllib` con el error 1010: `nomprueba.py` ya
  manda un nombre de cliente propio.
- LibreOffice **se queda esperando** con `ms-brownbag.pptx` (también con el original de Microsoft):
  `ediciones.py` ahora mata ese proceso a los 3 min y lo cuenta solo si con el original no le pasa.

## 3. Qué revisar a ojo (no se puede dar por 100 % con pruebas automáticas)

1. **Dibujos de Word (lienzos y grupos de formas, p. ej. `lo-fdo74605.docx`):** en el editor se ven
   como recuadros con su texto ("Forma", "Cuadro de texto"); al descargar salen completos. Pintarlos
   igual que Word es trabajo nuevo (pendiente desde la entrada 52 del LOG).
2. **Lo que falta de ver de Office** (de antes): columnas de verdad, tabuladores con puntos, texto
   vertical y bordes por celda en Word; comentarios, formato condicional, gráficas e imágenes de Excel.
   Medida de lo que NOM-COLAB entiende sin el original: `fidelidad.py --modelo` (≈78 %).
3. **Encabezados de Word con tabla y logotipos** (p. ej. `lo-tdf104420_lostParagraph.docx`): se ven
   como una línea de texto sin las imágenes; y si el documento cambia de sección a media obra, el
   encabezado de la segunda sección no se ve. Al descargar sale el original completo.
4. **Las capturas lado a lado** de `visor.py` (carpeta de salida): se revisaron unas cuantas; vale la
   pena mirarlas todas.
5. **Escanear el QR con la cámara** no se puede automatizar: se comprobó que el QR de la pantalla se
   decodifica (OpenCV) y abre el mismo enlace que el código escrito.
6. **Descargas dentro de la app** van por `NomAndroid.guardarArchivo` (a Descargas): por CDP no se
   ven; revisar a mano que lleguen (exportar .docx, .nom y "Descargar todo").
7. **Pendientes del plan de pruebas:** cinco equipos reales a la vez, en la red de la escuela, y la
   prueba de aceptación con usuarios (cuestionario SUS).
8. **Dos casos de la app del A55 sin confirmar** (la depuración inalámbrica del teléfono se apagó a
   mitad de la última tanda y ya no se pudieron repetir; en Chrome del A55, en la computadora, con
   ancho de celular y en Firefox pasan):
   - en `prueba_funciones.py` dentro de la app, la letra "B" escrita en D5 no quedó (SUMAR.SI dio
     7.5 en vez de 13.5), aunque la misma letra en D3 sí. Revisar si teclear una sola letra y Enter
     muy rápido en una celda pierde la letra en el WebView (`modo-hoja.js`, `abrirEditor`).
   - "Entrega con fecha límite" quedó en 0 dentro de la app (en los demás sí se guarda). Revisar el
     campo `datetime-local` en el WebView de Android (`editor.js`, `dialogoEntrega`).
   Para repetirlo: activar Depuración inalámbrica en el A55, instalar el APK de depuración, y correr
   `NOM_APP=1 … prueba_funciones.py SALIDA --cdp http://localhost:9224 --base http://100.77.150.52:8099 --solo hoja cuentas`.
9. **Guardar una copia de `~/.android/debug.keystore`** fuera de la laptop: sin ese archivo no se
   puede publicar una actualización de la app.

## 4. Estado en que quedaron los equipos

- **A55 (falta regresarlo):** la depuración inalámbrica se apagó sola a mitad de la última tanda, así
  que el teléfono quedó con el **APK de depuración** 0.12.2 y la app apuntando al servidor de pruebas
  de la laptop (`http://100.77.150.52:8099`, apagado) con una cuenta de prueba. Al reactivar la
  depuración inalámbrica (Opciones de desarrollador → Depuración inalámbrica; el puerto se ve con
  `adb mdns services`): instalar `3-APP-Android/NOM-COLAB.apk`, regresar en la app el servidor que
  tenía (`http://192.168.0.199:8080`, respaldo de sus ajustes en
  `~/.cache/nom-pruebas/respaldo-a55/app-ajustes-antes.json`), cerrar la sesión de prueba y
  `adb shell svc power stayon false` (estaba apagado). Los datos del teléfono como servidor ya se
  regresaron tal cual (respaldo en `~/.cache/nom-pruebas/respaldo-a55/servidor-antes.tar`).
- Escritorio: el Chromium de pruebas y su perfil aparte se cerraron y se borraron.
- Raspberry: jar 0.12.2 (`nomcolab-pi actualizar`); las cuentas de prueba se borraron.

## 5. Documentos al día y documentos ya entregados

Se pusieron al día el mapa de navegación (`diagramas/navegacion/generar.py`), los diagramas de
actividades A1 y A2 (código de recuperación y bloqueo por red), la especificación de casos de uso
(CU-01, CU-04, CU-14, CU-16 y un anexo con lo de las fases 1 a 11), `README.md`, `../LEEME.md`,
`docs/SERVIDOR-PROPIO.md` (la Raspberry), el documento del módulo (`5-DOCUMENTO-MODULO`) y el plan de
pruebas (`6-PLAN-DE-PRUEBAS`). **No se tocaron** los PDF/DOCX que ya se entregaron en octubre
(`1-ENTREGA-Diagramas-de-Actividades/`): muestran cómo era entonces; si se vuelven a entregar, hay que
rehacerlos con las imágenes nuevas de `diagramas/actividades/png/`.
