# NOM-COLAB

Suite colaborativa: **texto, hojas de cálculo, presentaciones y diagramas en una sola app**,
con edición simultánea. Funciona en la red local sin depender de Internet (un equipo o un
teléfono hace de servidor), en Azure (https://nomcolab-wack.azurewebsites.net) o en el servidor
propio: una Raspberry Pi publicada con Cloudflare Tunnel en https://nomcolab.dpdns.org
(`docs/SERVIDOR-PROPIO.md`).

Equipo 6 "WACK" · CECyT 9 "Juan de Dios Bátiz" · 5IM7

```
NOM-COLAB/
├── nucleo/        Lógica del servidor sin Spring (cuentas, espacios, documentos, CRDT, red):
│                   la comparten el servidor de la computadora y el del teléfono
├── app/            Servidor (Java 17 + Spring Boot 4.1) e interfaz web
│   └── src/main/resources/static/   la interfaz (la misma para navegador y Android)
├── android/        App Android 7+ que empaqueta esa interfaz (y en Android 8+ puede ser el servidor)
├── diagramas/      UML en PlantUML, mapa de navegación (navegacion/generar.py) y actividades (A1-A8)
├── azure/          desplegar.sh (crea Azure, roles de la base, sube el jar) · roles-bd.sql · AplicarSql.java ·
│                   nomcolab (prende y apaga Azure o el servidor propio)
├── servidor-propio/ publicar NOM-COLAB desde una computadora o la Raspberry Pi (pi/: servicios s6, respaldo, nomcolab-pi)
├── pruebas/        seguridad.py (API) · interfaz/ (la página en navegadores reales) · office/ (Word, Excel y PowerPoint)
└── docs/           PLAN-CONSTRUCCION.md · DISENO-UI.md · DESPLIEGUE-AZURE.md · SERVIDOR-PROPIO.md · GUIA-FACIL-DE-USAR.md · MARCA.md
(Los PDF para entregar están fuera del código, en ../ENTREGA/.)
```

## Arrancar el servidor (equipo que comparte los espacios)

Requiere JDK 17 o superior.

```bash
cd app
mvn package -DskipTests          # genera target/nom-colab.jar
java -jar target/nom-colab.jar   # puerto 8080; datos en ./datos-nom
```

La consola muestra las direcciones para entrar:

```
NOM-COLAB listo.
  En este equipo:   http://localhost:8080
  Desde la red:     http://192.168.1.20:8080
```

Variables opcionales: `NOM_PUERTO` (puerto HTTP) y `NOM_DATOS` (carpeta de datos).
Usuarios y sesiones van en una base de datos: H2 embebido por defecto
(`NOM_DATOS/nom-db`), o Azure SQL con `SPRING_DATASOURCE_URL/_USERNAME/_PASSWORD` y
`NOM_DB_PLATAFORMA=sqlserver`. En línea: https://nomcolab-wack.azurewebsites.net
(ver `docs/DESPLIEGUE-AZURE.md`).
El firewall debe permitir el puerto TCP 8080 y el UDP 47474 (anuncio de espacios en la LAN).

## Usarlo desde el navegador

Abrir la dirección "Desde la red" en Chromium, Firefox o Safari, en computadora o
celular. La interfaz se adapta sola a la pantalla.

## App Android

```bash
cd android
./gradlew assembleRelease        # app/build/outputs/apk/release/app-release.apk (el que se publica; firmado con ~/.android/debug.keystore)
./gradlew assembleDebug          # solo para probar en un teléfono con las herramientas de depuración; no se publica
```

Al abrirla pide el servidor: **Buscar en la red** lo encuentra por UDP, o se escribe
`IP:8080`. La app abre los documentos aunque no haya red y envía los cambios al
volver (CU-26).

### El teléfono como servidor (Android 8+)

En "Conecta con tu red" → **Usar este teléfono como servidor** (o en *Este dispositivo* →
*Servidor en este teléfono*). La app enciende un servicio en primer plano
(`android/.../anfitrion/`) que arma los mismos servicios de `nucleo/` sobre archivos de la app,
abre el puerto 8080 (o el siguiente libre), sirve la API, los canales en tiempo real y la misma
página web, y se anuncia por UDP como cualquier otro servidor. Los demás entran desde la app
(**Buscar en la red**) o desde el navegador con `http://IP-del-teléfono:8080`, en el mismo
Wi-Fi o conectados al punto de acceso del teléfono (sin router ni Internet). Mientras sirve hay
una notificación con la dirección y un botón **Detener**; si Android cierra la app, al abrirla
otra vez se enciende solo.

## Pruebas

```bash
cd app && mvn test                       # CRDT: convergencia con 5 usuarios y 200 órdenes de llegada distintos
python3 pruebas/seguridad.py             # 226 casos de la API (sesión, bloqueo, permisos, cuentas, tope de tamaño…)
pruebas/interfaz/correr.sh               # la página en un navegador de verdad (ver pruebas/interfaz/LEEME.md)
python pruebas/interfaz/rastreo.py SALIDA        # toca CADA botón, menú y acción de la ruedita de los 4 editores
python pruebas/interfaz/prueba_funciones.py SALIDA   # que cada función haga lo correcto (≈180 casos)
python pruebas/office/fidelidad.py       # Word, Excel y PowerPoint reales de Microsoft: abrir y volver a guardar
python pruebas/office/visor.py SALIDA archivos…   # cómo se ve en NOM-COLAB junto a LibreOffice
cd azure && ./desplegar.sh roles         # roles de la base en Azure SQL: los aplica y prueba qué se permite y qué no
```

Las mismas pruebas de la interfaz corren con `--movil` (ancho de celular), con `NOM_NAVEGADOR=firefox`,
contra un navegador ya abierto (`--cdp`: el Chrome del teléfono o el de otra computadora) y dentro de
la app Android (`NOM_APP=1 --cdp` con el WebView de un APK de depuración). Los resultados de cada
tanda quedan en `../6-PLAN-DE-PRUEBAS/registros/`.

## Lo que ya funciona

| Módulo (mapa de navegación) | Funcionalidad |
|---|---|
| **Gestión de cuentas** | Base de datos (H2 / Azure SQL) con **seguridad con roles en la base** · sin administrador general: cada cuenta controla sus espacios · crear cuenta con **código de recuperación** · iniciar y cerrar sesión · recuperar la contraseña con el código · cambiar la contraseña y **borrar la cuenta** · contraseñas con PBKDF2 + sal · bloqueo por intentos (por cuenta y por red) y tope de cuentas nuevas por hora · preferencias (tema, letra, movimiento) · lo guardado en el equipo va **cifrado** (bóveda por cuenta) |
| **Espacios de trabajo** | Crear espacio · **invitar con código de 8 letras o QR** (con fecha de vencimiento, anulable, y entrada **con apodo sin cuenta**) · agregar por nombre de usuario · visible en el mismo Wi-Fi (UDP) · Puede editar / Solo lectura / quitar · máximo 5 personas a la vez · carpetas, destacados, ordenar y buscar dentro del contenido · **papelera de 30 días** · @menciones · plantillas del espacio · letra de los textos nuevos · descargar todo · cuánto ocupa y depurar versiones · copia en otro NOM-COLAB |
| **Editores** | 4 tipos (fijo al crear) · **texto tipo Word letra por letra** (estilos, listas, tablas, imágenes, notas al pie, ecuaciones, índice, encabezado y pie, columnas, marca de agua, configurar página) · **hoja de cálculo** (fórmulas en español e inglés, referencias $ y entre hojas, relleno, filtro y orden personales, fijar filas, formato condicional, listas desplegables, gráficas) · **presentación** (temas, diseños, animaciones, transiciones, notas, modo presentador, proyector, láser) · **diagrama** (UML, entidad-relación, diagramas listos, texto a diagrama, conectores) · **ruedita de acciones** en los cuatro · comentarios y **modo sugerencia** · partes asignadas a una persona · entrega con fecha límite · **recibo del proceso de escritura** verificable · investigar y citar en APA · deshacer/rehacer · sin conexión con cola persistente |
| **Importar y exportar** | .docx, .xlsx y .pptx de Office (un archivo sin cambios sale idéntico; lo editado se reescribe), .nom (formato propio comprimido), PDF, HTML, Markdown, CSV, SVG y PNG |
| **Almacenamiento** | Límite por cuenta a la vista · 25 MB por documento · historial de versiones con vista previa y restauración · respaldos rotativos |
| **Android** | La misma interfaz en una app · el **teléfono como servidor** (sin computadora ni Internet) · escanear el QR para unirse · guardar y compartir archivos |

## Cómo se sincroniza

Cada documento es un mapa de **bloques**; cada campo de un bloque es un registro
*last-writer-wins* marcado con (reloj de Lamport, id de nodo). Dos personas que
editan figuras o celdas distintas nunca se pisan; si editan el **mismo** campo a la
vez, gana la misma escritura en todos los equipos, sin preguntar a nadie. El mismo
algoritmo está en `core/crdt/MotorCRDT.java` y en `static/js/crdt.js`.

**El texto va letra por letra** (`core/crdt/Secuencia.java` y `static/js/secuencia.js`).
Los documentos de texto guardan su contenido como una secuencia CRDT tipo RGA: cada
letra, salto de párrafo u objeto (imagen, tabla, salto de página) tiene un id propio
(`t@nodo`) y recuerda a su vecino izquierdo al nacer. Hay tres operaciones, todas
idempotentes y conmutativas:

| Operación | Qué hace |
|---|---|
| `i` insertar | Un tramo de texto escrito seguido (el servidor junta los tramos para ahorrar espacio). |
| `v` mostrar/ocultar | Borrar oculta letras; deshacer las vuelve a mostrar con el mismo id. |
| `f` formato | Negrita, color, fuente… por letra; el formato de párrafo vive en su salto de párrafo. |

Por eso dos personas pueden escribir **en la misma palabra al mismo tiempo** y todos
los equipos terminan con el mismo texto. Cada tecla se envía casi de inmediato (lotes
de ~16 ms, un envío a la vez); en la red local llega a los demás en unos 20 ms. El
servidor no necesita conocer el orden de las letras: guarda las operaciones sin repetir
y, para restaurar una versión, oculta, revela y reformatea letras por su id.
Los documentos de antes (un bloque por párrafo) se convierten solos la primera vez que
se abren, con ids deterministas para que dos equipos que los abren a la vez coincidan.

## Licencia

NOM-COLAB es **software libre** bajo la **Licencia Pública General de GNU, versión 3**
(GPL-3.0; el texto completo está en `LICENSE`, en la raíz del repositorio). Puedes usarlo,
estudiarlo, cambiarlo y compartirlo; si distribuyes una versión modificada, tiene que ir con su
código fuente y bajo la misma licencia.

Las bibliotecas y fuentes de terceros conservan su propia licencia, todas compatibles con la
GPL-3.0: Spring Boot (Apache-2.0), H2 (se usa bajo la MPL-2.0), mssql-jdbc (MIT),
qrcode-generator (MIT), jsQR (Apache-2.0), los íconos Lucide (ISC) y las fuentes Nunito, Carlito,
Caladea, Liberation y Comic Neue (OFL-1.1, se distribuyen aparte). El detalle está en
`app/src/main/resources/static/js/vendor/LICENCIAS.md` y `static/fonts/LICENCIAS-FUENTES.txt`.

Es un proyecto escolar (equipo WACK, CECyT 9, 5IM7): al terminar, el código queda en GitHub como
portafolio de sus cuatro integrantes.
