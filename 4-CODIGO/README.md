# NOM-COLAB

Suite colaborativa en red local: **texto, hojas de cálculo, presentaciones y
diagramas en una sola app**, con edición simultánea entre equipos de la misma
red y sin depender de Internet.

Equipo 6 "WACK" · CECyT 9 "Juan de Dios Bátiz" · 5IM7

```
NOM-COLAB/
├── app/            Servidor (Java 17 + Spring Boot 4.1) e interfaz web
│   └── src/main/resources/static/   la interfaz (la misma para navegador y Android)
├── android/        App Android 7+ que empaqueta esa interfaz
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
| **Editor** | 4 tipos de documento (fijo al crear) · descarga en .docx/.xlsx/.pptx · bitácora de actividad · CRDT en tiempo real (< 1.5 s; medido 42 ms en LAN) · presencia de quién edita qué · deshacer/rehacer · sin conexión con cola persistente · micro-textos · plantillas · importar (.nom .md .txt .csv .html) · exportar (.nom .html .md .csv .svg PDF) · modo enfoque |
| **Almacenamiento** | Consumo por documento · historial de versiones · vista previa y restauración como versión nueva · depurar versiones (pospone los abiertos por otros) · autoguardado |

## Cómo se sincroniza

Cada documento es un mapa de **bloques**; cada campo de un bloque es un registro
*last-writer-wins* marcado con (reloj de Lamport, id de nodo). Dos personas que
editan párrafos o celdas distintas nunca se pisan; si editan el **mismo** campo a la
vez, gana la misma escritura en todos los equipos, sin preguntar a nadie. El mismo
algoritmo está en `core/crdt/MotorCRDT.java` y en `static/js/crdt.js`.

**Límite conocido:** el texto de un mismo párrafo se resuelve por párrafo completo.
Si dos personas escriben exactamente en el mismo párrafo al mismo tiempo, se conserva
la última versión. El siguiente paso es un CRDT de secuencia (tipo RGA) por carácter.
