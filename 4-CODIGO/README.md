# NOM-COLAB

Suite colaborativa en red local: **texto, hojas de cálculo, presentaciones y
diagramas en una sola app**, con edición simultánea entre equipos de la misma
red y sin depender de Internet.

Equipo 6 "WACK" · CECyT 9 "Juan de Dios Bátiz" · 5IM7

```
NOM-COLAB/
├── nucleo/        Lógica del servidor sin Spring (cuentas, espacios, documentos, CRDT, red):
│                   la comparten el servidor de la computadora y el del teléfono
├── app/            Servidor (Java 17 + Spring Boot 4.1) e interfaz web
│   └── src/main/resources/static/   la interfaz (la misma para navegador y Android)
├── android/        App Android 7+ que empaqueta esa interfaz (y en Android 8+ puede ser el servidor)
├── diagramas/      UML en PlantUML + diagramas de actividades (A1-A7)
├── azure/          desplegar.sh: crea y actualiza la versión en Azure
├── docs/           DISENO-UI.md (interfaz) · DESPLIEGUE-AZURE.md (nube, BD y roles)
└── entregables/    Documentos para entregar (PDF / DOCX)
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
Usuarios, roles y sesiones van en una base de datos: H2 embebido por defecto
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
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
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
cd app && mvn test               # convergencia del CRDT: 5 usuarios, 200 órdenes de llegada distintos
```

## Lo que ya funciona

| Módulo (mapa de navegación) | Funcionalidad |
|---|---|
| **Gestión de cuentas** | Base de datos (H2 / Azure SQL) · roles ADMINISTRADOR y USUARIO con pantalla Administrar usuarios (403 para los demás) · Crear usuario (nombre, contraseña, empresa opcional) · iniciar y cerrar sesión · contraseñas con PBKDF2 + sal · bloqueo al 6.º intento fallido (15 min) · preferencias (tema, autoguardado, versiones, calidad, movimiento) |
| **Espacios de trabajo** | Crear espacio · conexión del proyecto (anuncio UDP en la LAN) · descubrir y unirse · solicitudes de acceso · máximo 5 personas simultáneas |
| **Gestión de accesos** | Invitar, cambiar Lectura/Edición, quitar acceso (desconecta al usuario), aprobar o rechazar solicitudes |
| **Editor** | 4 tipos de documento (fijo al crear) · **texto tipo Word sincronizado letra por letra** (~20 ms en LAN) con páginas, estilos, fuentes, colores, listas, tablas, imágenes, encabezado/pie, índice, buscar y reemplazar, copiar formato · cursores de los demás con su nombre · **ruedita de acciones** (clic derecho o mantener) · **figuras tipo Canva** (20+ figuras, girar, borde, transparencia, agrupar, alinear, guías) · descarga en .docx/.xlsx/.pptx · importar Word (.docx) · bitácora de actividad · deshacer/rehacer · sin conexión con cola persistente · micro-textos · plantillas · importar (.docx .nom .md .txt .csv .html) · exportar (.nom .html .md .csv .svg PDF) · modo enfoque |
| **Almacenamiento** | Consumo por documento · historial de versiones · vista previa y restauración como versión nueva · depurar versiones (pospone los abiertos por otros) · autoguardado |

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
