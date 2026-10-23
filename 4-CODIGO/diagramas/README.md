# NOM-COLAB — Diagramas

Equipo 6 "WACK" · CECyT 9 "Juan de Dios Bátiz" · 5IM7

Todos los diagramas son **código** (PlantUML). Se editan en `src/*.puml` y se
regeneran con:

    plantuml -tpng -o ../png src/*.puml
    plantuml -tsvg -o ../svg src/*.puml

| # | Diagrama | Archivo |
|---|----------|---------|
| 1 | Clases (núcleo) | `src/01-clases.puml` |
| 2 | Paquetes | `src/02-paquetes.puml` |
| 3 | Flujo — registro e inicio de sesión | `src/03-flujo-cuentas.puml` |
| 4 | Flujo — crear/unirse a espacio + servidor local | `src/04-flujo-espacio.puml` |
| 5 | Flujo — edición colaborativa (CRDT) | `src/05-flujo-edicion.puml` |
| 6 | Flujo — conexión Android | `src/06-flujo-android.puml` |
| 7 | Navegación (mapa del sitio, flujo ideal) | `navegacion/generar.py` |
| 8 | Casos de uso — Gestión de cuentas | `src/08-cu-cuentas.puml` |
| 10 | Casos de uso — Espacios de trabajo | `src/10-cu-espacios.puml` |
| 11 | Casos de uso — vista general | `src/11-cu-general.puml` |
| 12 | **Modelo de base de datos** (entidad-relación) | `src/12-modelo-datos.puml` |
| 13 | Secuencia — inicio de sesión | `src/13-secuencia-login.puml` |
| 14 | Secuencia — unirse a un espacio en la LAN | `src/14-secuencia-unirse.puml` |
| 15 | Secuencia — edición concurrente y convergencia CRDT | `src/15-secuencia-edicion.puml` |
| 16 | Secuencia — Android sin conexión y resincronización | `src/16-secuencia-android.puml` |
| 17 | **Base de datos del módulo Gestión de cuentas** (usuario, sesión, preferencias — Azure SQL) | `src/17-er-cuentas.puml` |

| A1–A8 | **Actividades** por módulo del mapa de navegación (carriles Usuario / Sistema / Base de datos) | `actividades/generar.py` |

Los diagramas de actividades siguen el formato del modelo entregado (carriles de
colores, un diagrama por caso). Se describen en `actividades/generar.py` como una
cuadrícula y de ahí salen `svg/`, `png/` y un `.drawio` editable en diagrams.net:

    python3 actividades/generar.py      # regenera A1-A7 y avisa si alguna línea cruza una caja
    python3 generar-visor.py            # reconstruye index.html con todos los diagramas

El documento para entregar está en `../entregables/Diagrama de Actividades NOM-COLAB.docx` (y `.pdf`).

> **Cambio (oct. 2026):** el módulo *Conoce NOM* se retiró. Su diagrama de casos de
> uso quedó en `retirado/`. Las preferencias (CU-27) pasaron al menú de la cuenta.

Además:

- **`ESPECIFICACION-CASOS-DE-USO.md`** — especificación escrita de los 29 casos
  de uso (actores, precondiciones, postcondiciones, flujo principal, flujos
  alternativos, excepciones y requerimiento relacionado).
- **`modelo-datos.sql`** — el DDL del diagrama 12, listo para ejecutar
  (PostgreSQL; nota incluida para SQLite/H2 en el nodo local).
- **`index.html`** — visor: abre los 22 diagramas en el navegador, sin
  internet y sin servidor (se regenera con `generar-visor.py`).

(La interfaz y su justificación están en `../docs/DISENO-UI.md`.)

---

## Idea en una línea

Un **solo lienzo** que cambia de modo (texto, hoja, presentación, diagrama) en
lugar de cuatro programas distintos, con edición simultánea sobre la **red
local** — sin depender de Internet.

## Cómo el código sigue a los diagramas

Cada paquete del diagrama 2 es una carpeta real. Cada clase del diagrama 1 es
un archivo con ese mismo nombre.

    mx.wack.nom
    ├── core/
    │   ├── modelo/     Usuario, Sesion, Espacio, Acceso, Permiso,
    │   │               Documento, ModoEditor, Pagina, Bloque,
    │   │               BloqueTexto, BloqueTabla, Celda, BloqueImagen,
    │   │               BloqueForma, Estilo, Version, Plantilla,
    │   │               Animacion, Preferencias
    │   ├── crdt/       Operacion, TipoOperacion, RelojVectorial, MotorCRDT,
    │   │               ColaPendiente
    │   ├── almacen/    RepositorioUsuarios, RepositorioEspacios,
    │   │               RepositorioDocumentos (interfaces)
    │   └── formatos/   ConversorFormato (interfaz), FormatoArchivo
    ├── editor/
    │   ├── lienzo/     dibujo y selección de Bloques
    │   ├── modos/      un archivo por valor de ModoEditor
    │   └── herramientas/  barra superior iconográfica + micro-textos
    ├── red/
    │   ├── nodo/       NodoLocal
    │   ├── descubrimiento/  ServicioDescubrimiento, EspacioRemoto
    │   └── sync/       CanalSync
    ├── servidor/       Spring Boot 4.1 — JDK 17
    │   ├── api/        controladores REST + WebSocket
    │   ├── servicio/   ServicioCuentas, ServicioEspacios
    │   ├── repositorio/  implementación de los 3 repositorios
    │   └── seguridad/  hash de contraseñas, bloqueo a los 5 intentos
    ├── web/            paginas/, componentes/
    ├── escritorio/     ventana/ — aplicacion nativa (Windows, macOS, Linux)
    └── android/        ui/, puente/ (ClienteAndroid)

**Regla única de dependencias:** todo apunta hacia `core`. `core` no depende de
nadie, por eso el mismo núcleo corre en web, escritorio y Android.

## Decisiones que quedan fijadas aquí

- **Un tipo por documento (cambio oct. 2026).** El tipo se elige al crear y no cambia,
  para no romper su formato; el servidor descarta cualquier cambio de `_doc.modo`. Antes:
  "un solo lienzo" donde cambiar de modo no era cambiar de pantalla (nota del
  diagrama 7). Por eso `Documento` tiene un campo `modo` y no existen cuatro
  clases de documento.
- **`Bloque` es la unidad de todo.** Un párrafo, una tabla, una imagen y una
  figura son el mismo tipo base con posición `x, y, ancho, alto, z`. Esto es lo
  que permite que una presentación y un documento de texto compartan editor.
- **El CRDT opera sobre bloques, no sobre pantallas.** Una `Operacion` siempre
  lleva `idBloque`. Sin esto la sincronización no converge.
- **Aplicar local primero, difundir después** (diagrama 5). El usuario nunca
  espera a la red; por eso se cumple la latencia < 1500 ms del documento de
  requerimientos.
- **El servidor local es solo para la parte web.** `NodoLocal` abre el puerto;
  el escritorio y Android hablan por `CanalSync` directamente.
- **Los formatos son una pieza aparte.** `ConversorFormato` traduce archivos
  externos a `Bloque`; el editor nunca conoce un formato de archivo. Así se
  agregan formatos nuevos sin tocar el lienzo.
- **Hay tres clientes, no dos.** Web, **aplicación nativa de escritorio** y
  Android, los tres sobre el mismo `core`. El servidor local solo lo necesita
  la parte web.
- **Android funciona sin conexión.** Las operaciones se encolan y se envían al
  volver a la LAN (diagrama 6). Es el mismo `MotorCRDT`, no un camino aparte.

## Decisiones del modelo de datos (diagrama 12)

- **Los bloques usan tabla-por-subclase.** `bloque` guarda lo común (posición,
  tamaño, z) y la columna `tipo` dice en cuál de las cuatro tablas hijas está
  el resto. Así el lienzo consulta una sola tabla para dibujar.
- **`bloque.eliminado` es borrado lógico, no `DELETE`.** Un CRDT tiene que
  recordar lo que se borró: si la fila desapareciera, una operación que llega
  tarde volvería a insertar el bloque. Es la regla `3c` de CU-21.
- **El reloj vectorial son filas, no un blob.** `reloj_marca` guarda un
  renglón por nodo, así se puede comparar en SQL qué operación precede a cuál
  sin deserializar nada.
- **`operacion.id_operacion` es `idNodo + contador`.** Esa llave hace la
  sincronización idempotente: si la misma operación llega dos veces, la
  segunda choca con la primaria y se descarta (regla `3b` de CU-21).
- **`cola_pendiente` vive en la base, no en memoria.** Es lo que permite
  cerrar la app sin conexión y reenviar al siguiente arranque (CU-26).
- **Motor sugerido:** SQLite o H2 embebido para el nodo local (encaja con
  "suite liviana"); PostgreSQL si algún día se ofrece como SaaS. El DDL está
  en PostgreSQL con la nota de qué cambiar.

## Trazabilidad con los requerimientos

| Requerimiento (doc. *Requerimientos WACK*) | Dónde vive |
|---|---|
| Crear usuario (nombre, contraseña, empresa opcional) | `ServicioCuentas.registrar` · CU-01 · diagrama 3 |
| Contraseñas cifradas | `Usuario.hashContrasena` · CU-05 |
| Bloqueo tras 5 intentos | `Usuario.intentosFallidos` · CU-04 |
| Iniciar sesión | `ServicioCuentas.iniciarSesion` → `Sesion` · CU-02 |
| Conexión del proyecto (puerto de red) | `NodoLocal.iniciar` · CU-14 |
| Visibilizar proyectos a otros usuarios | `ServicioDescubrimiento` · CU-15, CU-16 |
| 4 tipos de documento (texto, hoja, presentación, diagrama), fijo al crear | `Documento.modo` + `ModoEditor` · CU-18, CU-20 |
| Micro-textos al pasar el cursor | `editor.herramientas` · CU-22 |
| Sincronización concurrente sin conflictos | `MotorCRDT` · CU-21 · diagrama 5 |
| Máx. 5 usuarios simultáneos | límite en `NodoLocal` · CU-16, CU-25 |
| Latencia < 1500 ms | diagrama 5 (aplicar local → difundir) |
| Versiones y control de acceso | `Version`, `Acceso`, `Permiso` · CU-17, CU-23, CU-24 |
| Cliente Android | `ClienteAndroid` · CU-25, CU-26 |
| Fórmulas en hojas de cálculo | `Celda.formula` · CU-19 |
| Tipografía y estilos | `Estilo` · CU-19 |
| Plantillas | `Plantilla` · CU-18 |
| Animaciones (modo presentación) | `Animacion` · CU-19 |
| Compatibilidad de formatos libres | `ConversorFormato`, `FormatoArchivo` · CU-28, CU-29 |
| Preferencias globales y rendimiento | `Preferencias` · CU-27 (menú de cuenta) |
| Aplicación nativa (Windows/macOS/Linux) | paquete `escritorio` |
| Máx. 2 s para login/registro | RNF medido en `servidor.servicio` · CU-01, CU-02 · diagrama 13 |
| "Misma base de datos" para trabajo paralelo (Fase 4) | diagrama 12 · `modelo-datos.sql` |


---

## Pendientes según el Gantt del equipo

El cronograma (imagen en *Requerimientos WACK.docx*) lista estos entregables:

| Entregable del Gantt | Fechas | Estado aqui |
|---|---|---|
| Modelado de la base de datos | 18–23/09/2026 | **Hecho:** diagrama 12 + `modelo-datos.sql` (21 tablas). |
| Diagrama de secuencia | 21–24/09/2026 | **Hecho:** diagramas 13 a 16. |
| Diseño de implementación de OT/CRDT | 25/09–01/10/2026 | **Hecho:** mapa LWW por campo (`core/crdt/MotorCRDT.java` y `static/js/crdt.js`), con pruebas de convergencia. |
| Diseño de UI/UX | 30/09–05/10/2026 | **Hecho:** `../docs/DISENO-UI.md` y la interfaz en `../app/src/main/resources/static`. |
| Desarrollo | 06/10–26/10/2026 | **En curso:** servidor, web y Android funcionando (`../README.md`). |

> El Gantt dice "OT/CRDT", pero los requerimientos y el proceso de negocio
> nombran **CRDT** dos veces y de forma explícita. Estos diagramas asumen CRDT.
> Si el equipo se decide por OT, cambia `MotorCRDT` y el diagrama 5; el resto
> del diseño no se ve afectado.
