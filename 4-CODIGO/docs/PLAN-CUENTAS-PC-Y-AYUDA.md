# Plan: una sola cuenta en todos lados, rutas para la computadora y sitio de ayuda y legal

13 de noviembre de 2026. Solo es el plan: se construye en otra sesión, en este orden (fases 13 y
14 de `PLAN-CONSTRUCCION.md`). Sale de la pregunta «¿el teléfono y la web no deberían usar la misma
base de datos de la Pi, con las mismas cuentas?» y de la tabla de casos de `PENDIENTES.md`, sección 6.

Contenido:

- **A. Una sola cuenta** (fase 13): que la cuenta de la nube sirva también en el teléfono que comparte sin Internet.
- **B. Rutas para la computadora** (fase 13): sin app de escritorio, qué se puede hacer y qué no.
- **C. Sitio de ayuda y legal** (fase 14): páginas aparte de la app, como la documentación de
  Microsoft, con preguntas frecuentes, guías, aviso de privacidad, términos y lo demás que falta.
- **D. Decisiones que tiene que tomar el equipo** antes de empezar.
- **E. Orden, pruebas y documentos que se tocan.**

---

## Cómo está hoy (comprobado en el código)

| Dónde se usa | A qué base de datos va | Cuentas |
|---|---|---|
| La página en `https://nomcolab.dpdns.org` | La de la Raspberry | Las de la Raspberry |
| La app de Android con el servidor «Internet» | La de la Raspberry (la misma) | Las mismas |
| La página en Azure (`nomcolab-wack.azurewebsites.net`) | Azure SQL, **otra base** | **Otras**: la misma persona puede tener una cuenta en cada nube, con contraseñas distintas |
| El teléfono como servidor (sin Internet) | La del propio teléfono (`Almacen`) | **Las del teléfono**: se entra con QR o código y un apodo, o creando una cuenta ahí |
| Una computadora con el jar | La de esa computadora | Las de esa computadora |

O sea: **con Internet ya es una sola cuenta** (app y web van a la Raspberry). El hueco está en el
teléfono que comparte sin Internet (y en Azure, que es otra nube). Lo que ya existe y sirve de base:
el teléfono ya inicia sesión en la nube de servidor a servidor para copiar un espacio
(`ServicioSincronia.configurar`, `POST /api/cuentas/sesion` contra la nube, guarda el token).

Datos que se guardan hoy (sirven para el aviso de privacidad, parte C):

- Cuenta (`Usuario`): nombre de usuario, hash PBKDF2-HMAC-SHA256 de la contraseña con sal de 16 bytes,
  hash del código de recuperación, color, preferencias, intentos fallidos y bloqueo, fecha de creación,
  si es invitado (apodo) y de qué espacio. **No** se pide correo, nombre real, teléfono ni fecha de nacimiento.
- Espacios, permisos, enlaces de invitación, documentos, versiones, comentarios, avisos (menciones).
  En el servidor van **comprimidos, no cifrados** (decisión de la 0.12.1): quien administra el
  servidor puede verlos.
- Dirección IP: solo en memoria, para los límites contra el abuso (intentos de contraseña, cuentas
  nuevas por hora y bloqueo por red); no se escribe en disco (`Origen.java`, `ServicioCuentas.fallos`).
- Respaldos de la Raspberry: diarios a las 02:00, se guardan los últimos 14 (`nomcolab-pi`), y
  `traer-respaldos.sh` copia unos a la laptop del equipo. Lo borrado sigue en esos respaldos hasta
  que salen de la rotación.
- En el equipo de la persona: la bóveda cifrada (IndexedDB), `localStorage` (sesión, preferencias,
  servidor elegido), la caché del service worker. La cámara del QR se procesa en el equipo y no se sube.
- Terceros que ven el tráfico: **Cloudflare** (el túnel termina el https; además mete su script de
  estadísticas `beacon.min.js`, que la política de contenido bloquea), **Microsoft Azure** cuando se
  usa esa nube, **GitHub** al descargar el APK.
- Permisos de la app: cámara (QR), Internet, estado de red y Wi-Fi, multicast (buscar en la red),
  servicio en primer plano (el teléfono como servidor), notificaciones, mantener despierto,
  escribir en almacenamiento (descargas en Android viejo). `minSdk 24`, `targetSdk 37`.
- Bibliotecas y fuentes de terceros: Spring Boot (Apache-2.0), H2 (MPL-2.0 o EPL-1.0), mssql-jdbc
  (MIT), qrcode-generator 1.4.4 (MIT), jsQR 1.4.0 (Apache-2.0), fuentes Nunito, Carlito, Caladea,
  Liberation y Comic Neue (OFL; `static/fonts/LICENCIAS-FUENTES.txt`). El repositorio público
  **no tiene archivo de licencia** (hoy, legalmente, «todos los derechos reservados»).

---

## A. Una sola cuenta (fase 13)

**Meta:** quien tiene cuenta en la Raspberry entra con el mismo nombre y contraseña al espacio del
teléfono que comparte, aunque no haya Internet, y lo que escribe ahí queda a su nombre cuando el
espacio se sube a la nube.

### A.1 Tres maneras de entrar al teléfono, de la mejor a la de respaldo

1. **El teléfono tiene Internet en ese momento → pregunta a la nube.**
   La persona escribe usuario y contraseña en el teléfono; el teléfono los manda a la nube
   (`/api/cuentas/sesion`, como ya hace la sincronía). Si la nube dice que sí:
   - crea o actualiza en el teléfono una **copia de esa cuenta con el mismo `id`** de la nube
     (nombre, color, preferencias), marcada `origen = "https://nomcolab.dpdns.org"`;
   - guarda un verificador **propio del teléfono**: PBKDF2 de la contraseña escrita con una sal nueva
     (nunca el hash de la nube);
   - no guarda el token de la nube (no lo necesita) y da una sesión del teléfono.
2. **Sin Internet, pero esa cuenta ya entró antes en este teléfono → verificador local.**
   Se compara con el verificador del punto 1. Si la contraseña cambió en la nube, aquí sigue la
   anterior hasta que el teléfono vuelva a tener Internet (se dice en la ayuda).
3. **Sin Internet y nunca entró en este teléfono → «pase sin conexión» (solo la app) o apodo.**
   - **Pase sin conexión:** cada vez que la app tiene Internet, la nube le firma un pase corto:
     `{ uid, nombre, color, versionContrasena, emitido, caduca (14 días), nube }`, firmado con
     ECDSA P-256 (hay en Java 17 y en Android desde la API 24; Ed25519 no está en Android 7).
     La llave pública de la Raspberry va **dentro del APK y del jar**, así que el teléfono puede
     revisar la firma aunque nunca haya tenido Internet. La app guarda el pase en su bóveda y lo
     presenta al unirse (`POST /api/cuentas/pase`). El teléfono crea la copia de la cuenta (mismo `id`).
   - **Por qué solo la app:** el navegador de una computadora que entra al teléfono por
     `http://IP:8080` está en **otro origen** que `https://nomcolab.dpdns.org`; no ve la bóveda de la
     nube, así que no tiene el pase. Para la computadora queda la manera 1 o la 2, o la ruta B.2.
   - **Apodo** (como hoy), para quien no tiene nada de lo anterior.

**Descartado:** bajar al teléfono los hashes de la nube de todos los miembros para que entren sin
Internet la primera vez. El dueño del teléfono (el maestro, por ejemplo) se quedaría con los hashes de
sus alumnos y podría probar contraseñas sin límite. No vale el riesgo.

### A.2 Crear cuenta en el teléfono

- Con Internet en el teléfono: el registro se pasa a la nube (la cuenta nace en la Raspberry) y se
  sigue como en A.1, manera 1.
- Sin Internet: no se crean cuentas «del teléfono» nuevas; se entra con apodo y, cuando haya
  Internet, «Guardar lo mío en una cuenta» convierte al invitado en cuenta de la nube y le pasa la
  autoría. Así no hay dos cuentas con el mismo nombre en dos lugares.
- Las cuentas del teléfono que ya existen (de antes de esta fase) siguen funcionando; se ofrece
  «Unir con mi cuenta de la nube» la próxima vez que haya Internet.

### A.3 Permisos y sincronía

- La lista de miembros de la nube es la que manda: al sincronizar, el teléfono baja los accesos del
  espacio; al entrar con una cuenta copiada, recibe el permiso que tiene en la nube.
- Lo que el dueño cambie de accesos sin Internet queda **pendiente** y, al volver la red, se le pide
  confirmar antes de aplicarlo en la nube.
- Como las copias tienen el mismo `id`, `ServicioSincronia` sube los cambios con la autoría
  correcta. **Revisar en el código** cómo se guarda hoy el autor de cada registro al sincronizar y
  qué pasa con los registros de invitados (deben quedar como «apodo (invitado)»).

### A.4 Seguridad

- Contraseñas por `http` en la red local: hoy ya viajan sin cifrar (sale el aviso «Conexión sin
  cifrar»). Con la manera 1 eso se vuelve más delicado porque es la contraseña de la nube.
  Por eso: la app usa el pase (no manda contraseña) siempre que lo tenga, y la página por `http` dice
  claramente, antes de enviar, que en esa red alguien podría verla.
- El pase es «al portador»: caduca a los 14 días y lleva `versionContrasena`; cambiar la contraseña o
  borrar la cuenta invalida los pases en cuanto el teléfono vuelve a tener Internet (lista de
  revocados que baja con la sincronía).
- Límites contra el abuso también en el teléfono (ya los tiene) y para `/api/cuentas/pase`.
- `seguridad.py`: pases falsos, vencidos, de otra nube, de una cuenta borrada, repetidos en dos
  teléfonos, con la contraseña cambiada; copia de cuenta con `id` ya usado; nombre en conflicto.

### A.5 Azure

Azure es otra nube con su propia base. **Recomendación:** dejarla aparte (es la de la entrega
escolar y casi siempre está apagada) y decirlo en la interfaz y en la ayuda: «Nube de la escuela
(Azure): cuentas aparte». Si el equipo quiere una sola cuenta también ahí, el mismo pase sirve: Azure
confiaría en la llave pública de la Raspberry (más trabajo; ver decisión D.4).

---

## B. Rutas para la computadora (fase 13)

El proyecto es página web y app de Android: no se hace app de escritorio. Lo que sí hay:

| Ruta | Qué logra | Estado |
|---|---|---|
| **B.1 Instalar la página** (Chrome o Edge: «Instalar NOM-COLAB») desde `https://nomcolab.dpdns.org` | Ícono en el escritorio; con una sola visita con Internet, abre sin Internet con sus documentos | Ya funciona; falta un botón «Instalar en esta computadora» (`beforeinstallprompt`) y su página de ayuda |
| **B.2 La página instalada habla con el teléfono** («Acceso a la red local» de Chrome) | La computadora usa el teléfono sin Internet **desde el origen de la nube**: misma bóveda, pase sin conexión, service worker y cifrado del navegador | **Por investigar** (ver abajo) |
| **B.3 El navegador entra al teléfono por `http://IP:8080`** | Funciona aunque nunca haya entrado a la página | Ya funciona. Límites: sin service worker (si el teléfono se va, no se puede recargar), cifrado propio en lugar del del navegador, portapapeles limitado |
| **B.4 Una computadora como servidor** (el jar) | Igual que el teléfono, sin teléfono | Existe para el equipo; empaquetarlo con su propio Java es opcional y **no prioritario** |

**B.2, qué investigar (un día, antes de prometer nada):** desde Chrome 142, una página `https`
puede pedir a una dirección privada por `http` si la persona da el permiso «Acceso a la red local»;
`fetch(url, { targetAddressSpace: "local" })` la exime del bloqueo de contenido mixto, y una IP
privada escrita como número ya está exenta. Hay que probar:
1. que `fetch` a `http://192.168.x.x:8080/api/...` funcione desde la página instalada, sin Internet;
2. el canal en vivo: `EventSource` quizá no lleve esa opción → cambiarlo por `fetch` con lectura en
   flujo si hace falta;
3. que el teléfono conteste el permiso previo (CORS y la cabecera que pida Chrome);
4. qué pasa en Firefox y Safari (no lo tienen: se queda B.3).

Si sale bien, es la mejor ruta para la computadora y la página ofrece «Usar el teléfono del salón»
cuando lo encuentre. Si no, se documenta y se queda B.3.

**Descartadas (y por qué, para no volver a pensarlas):**
- https en la red local con certificado de verdad: el nombre se resuelve en Internet y el punto de
  acceso de Android no deja poner DNS propio.
- Página guardada como archivo (`file://`): sin service worker, almacenamiento raro y origen `null`.
- APK en Windows: Microsoft quitó el subsistema de Android en 2025.
- Conexión directa entre navegadores (WebRTC): necesita un servidor para presentarse.
- App de escritorio (Electron, Tauri): fuera del alcance del proyecto.

---

## C. Sitio de ayuda y legal (fase 14)

### C.1 Qué es

Un sitio **aparte de la app**, como la documentación de Microsoft: páginas sueltas que se leen sin
iniciar sesión, con barra lateral, buscador, migas de pan, «En este artículo», «Se aplica a» y fecha
de actualización. Vive en el mismo servidor, en `/ayuda/` y `/legal/`, para que exista también sin
Internet: lo sirve la Raspberry, Azure, el jar, el teléfono como servidor, y va dentro del APK.

### C.2 Mapa del sitio

```
/ayuda/                         Inicio: buscador, tarjetas por tema, «Lo más consultado»
  empezar/                      Qué es NOM-COLAB · Crear cuenta y entrar · Código de recuperación ·
                                Usar sin cuenta · Instalar en la computadora (B.1) ·
                                Instalar la app de Android (orígenes desconocidos, actualizar) ·
                                Requisitos (navegadores, Android 7 o más nuevo)
  espacios/                     Espacios y documentos · Permisos (tabla de roles) · Invitar (enlace,
                                QR, código, apodo) · Modo salón · Partes con dueño · Comentarios y
                                sugerencias · Versiones · Entrega con fecha límite · Hasta 5 personas
  editores/
    texto/                      Formato, listas, tablas, notas al pie, índice, citas
    hoja/                       Celdas, orden, filtros · Referencia de fórmulas (generada del código)
    presentacion/               Diapositivas, animaciones, modo presentador, notas del orador
    diagrama/                   Figuras, conectores, grupos, capas, mesa de trabajo
    ruedita/                    La ruedita: cómo se abre y qué ofrece en cada lugar
    atajos/                     Atajos de teclado (Ctrl+K, etc.)
  sin-internet/                 Cómo funciona · La tabla de casos (PENDIENTES 6) · El teléfono como
                                servidor paso a paso (Wi-Fi y punto de acceso) · Una computadora como
                                servidor · Sincronizar con la nube · Qué pasa si dos escriben a la vez
  office/                       Abrir y descargar .docx/.xlsx/.pptx · El formato .nom · Qué se ve
                                igual y qué todavía no (lista honesta, de RELEVO-PRUEBAS) · Tope de 25 MB y espacio por cuenta
  cuentas/                      Contraseña y bloqueo · Varios equipos · Cambiar y restablecer ·
                                Lo guardado en tu equipo (bóveda) · «Conexión sin cifrar» · Borrar la cuenta ·
                                Descargar todo lo tuyo
  problemas/                    No encuentro el teléfono en la red · Sale «Conexión sin cifrar» ·
                                Se ve distinto que en Word · La app no se actualiza · No puedo entrar
                                sin Internet · «Esta página está apagada» (Azure) · Se llenó el espacio
  preguntas-frecuentes/         Ver C.4
  novedades/                    Qué cambió en cada versión, en palabras sencillas (sale del LOG)
  acerca/                       Proyecto escolar (CECyT 9, IPN, 5IM7, equipo WACK) · Código fuente ·
                                Contacto · Estado del servicio
/legal/
  privacidad/                   Aviso de privacidad integral
  privacidad-corto/             Aviso de privacidad simplificado (el que se enlaza en el registro)
  terminos/                     Términos y condiciones de uso
  uso-aceptable/                Política de uso aceptable
  almacenamiento/               Cookies y almacenamiento en tu equipo (no usamos cookies)
  permisos-android/             Para qué es cada permiso de la app
  licencias/                    Licencias de terceros (bibliotecas y fuentes)
  seguridad/                    Cómo protegemos tus datos · Reportar una falla de seguridad
  accesibilidad/                Declaración de accesibilidad
  denuncias/                    Reportar contenido
/.well-known/security.txt       Contacto para fallas de seguridad
/sitemap.xml, /robots.txt       Según la decisión D.3
```

### C.3 Las páginas legales, qué debe llevar cada una

Base: la **nueva Ley Federal de Protección de Datos Personales en Posesión de los Particulares**
(DOF 20 de marzo de 2025, vigente desde el 21 de marzo de 2025). La autoridad ya no es el INAI: sus
funciones pasaron a la **Secretaría Anticorrupción y Buen Gobierno**. El aviso ahora debe detallar
los datos que se tratan (y cuáles son sensibles) y separar las finalidades que requieren
consentimiento. **Antes de publicar, revisar el texto vigente en el DOF u ordenjuridico.gob.mx** y
pedir al profesor que lo lea: es un proyecto escolar, no asesoría legal.

- **Aviso de privacidad integral:** quién es el responsable y cómo contactarlo (decisión D.1);
  qué datos (el inventario de arriba, en una tabla, diciendo que no hay datos sensibles salvo lo que
  la persona escriba en sus documentos); finalidades: solo dar el servicio (cuenta, guardar y
  compartir documentos, seguridad); **ninguna** secundaria (sin publicidad, sin vender, sin
  estadísticas propias); quién más ve los datos (Cloudflare, Microsoft Azure, GitHub, como
  encargados del transporte o del alojamiento); dónde están (la Raspberry, Azure); cuánto se guardan
  (mientras exista la cuenta; respaldos hasta 14 días después; lo del equipo hasta que la persona lo
  borre); derechos ARCO y revocar el consentimiento: cómo pedirlos (correo) y lo que se puede hacer
  solo (Descargar todo, borrar la cuenta); que los documentos **no** van cifrados en el servidor
  (o lo contrario, si se decide cifrarlos: D.7); menores de edad (D.6); cambios al aviso y fecha.
- **Aviso simplificado:** responsable, finalidades y dónde leer el integral, en un párrafo.
- **Términos de uso:** servicio escolar gratis «tal como está», sin garantía de que esté prendido
  (la Raspberry está en una casa, Azure casi siempre apagada); que puede terminar al cerrar el ciclo
  escolar y que se avisará con 30 días para descargar todo (D.5); una cuenta por persona y cuidar la
  contraseña y el código de recuperación (sin él no se puede recuperar); **lo que escribes es tuyo**
  y solo nos das permiso de guardarlo y mostrarlo a quien tú compartas; reglas de uso (enlace a la
  política); propiedad del código (D.2); «Word, Excel y PowerPoint son marcas de Microsoft; NOM-COLAB
  no está afiliado a Microsoft»; ley mexicana; cómo se avisan los cambios.
- **Uso aceptable:** nada ilegal, acoso o burlas (es un entorno escolar), datos personales de otros
  sin permiso, archivos dañinos, abusar del servicio, intentar romper la seguridad (salvo reportarla
  por `seguridad/`).
- **Almacenamiento en tu equipo:** no hay cookies; tabla de lo que se guarda en `localStorage`,
  IndexedDB (cifrado) y la caché del service worker, para qué y cómo borrarlo; qué se queda en el
  teléfono cuando comparte.
- **Permisos de Android:** cada permiso de la lista de arriba, para qué sirve y qué pasa si se niega.
- **Licencias de terceros:** generada de `vendor/LICENCIAS.md`, `fonts/LICENCIAS-FUENTES.txt` y las
  dependencias del `pom.xml`, con su texto completo.
- **Seguridad:** resumen honesto (PBKDF2, bóveda cifrada, boleto de un solo uso, límites contra el
  abuso, `no-store`, política de contenido) y cómo reportar una falla.
- **Accesibilidad:** meta WCAG 2.2 AA para el sitio; qué funciona hoy en la app (teclado, contraste,
  ancho de celular) y qué falta (lector de pantalla en los editores).
- **Reportar contenido:** el dueño del espacio puede quitarlo; cómo avisar al equipo y qué se hace.

### C.4 Preguntas frecuentes (borrador de la lista)

Primeros pasos
1. ¿Qué es NOM-COLAB y en qué se parece y se diferencia de Word, Excel, PowerPoint o Canva?
2. ¿Cuesta? ¿Tiene anuncios? ¿Usa inteligencia artificial? (no, no, no)
3. ¿Necesito cuenta? ¿Qué pasa si uso «Usar sin cuenta»?
4. ¿Por qué no me piden correo? ¿Cómo recupero mi contraseña entonces?
5. ¿En qué navegadores y teléfonos funciona? ¿Hay app para iPhone o para la computadora?

Sin Internet
6. ¿De verdad funciona sin Internet? ¿Qué necesito haber hecho antes?
7. Nunca entré a la página y no hay Internet: ¿cómo trabajamos juntos? (el teléfono que comparte)
8. ¿Y si nadie tiene la app? (la tabla de casos: a veces no se puede, y se dice)
9. ¿Puedo entrar al teléfono del salón con mi cuenta de siempre? (fase 13)
10. ¿Qué pasa con lo que escribí sin Internet cuando vuelve la red? ¿Se puede perder?
11. ¿Qué pasa si dos personas escriben lo mismo al mismo tiempo?

Cuentas y datos
12. ¿Dónde se guardan mis documentos? ¿Quién los puede ver?
13. ¿Están cifrados? (en el equipo sí; en el servidor, según D.7)
14. ¿La cuenta de la página es la misma que la de la app? ¿Y la de Azure?
15. ¿Qué es «Conexión sin cifrar» y cuándo me debe preocupar?
16. ¿Cómo descargo todo lo mío? ¿Cómo borro mi cuenta y qué queda después (respaldos)?
17. Me bloqueó tras varios intentos: ¿cuánto dura y por qué?
18. Soy menor de edad: ¿puedo usarla?

Trabajo en equipo
19. ¿Cuántas personas pueden estar a la vez en un espacio?
20. ¿Qué puede hacer cada permiso (ver, comentar, editar, dueño)?
21. ¿Cómo sé quién escribió cada parte? ¿Qué son las partes con dueño?
22. ¿Cómo entrego una tarea con fecha límite?

Office y archivos
23. ¿Mis archivos de Word, Excel o PowerPoint quedan iguales al descargarlos?
24. ¿Por qué algo se ve distinto en el editor que en Word?
25. ¿Qué es un archivo .nom?
26. ¿Cuánto puede pesar un documento?

La app de Android
27. ¿Por qué la app no está en la Play Store? ¿Es seguro instalarla?
28. ¿Para qué pide la cámara y los demás permisos?
29. ¿Cómo la actualizo sin perder lo mío?
30. ¿Qué hace «Trabajar sin Internet con este teléfono» y gasta mucha batería?

### C.5 Cambios en la app que pide la parte legal

- Registro: casilla «Leí y acepto los Términos y el Aviso de privacidad» con enlaces, y la frase
  para menores (D.6). Guardar en la cuenta qué versión aceptó y cuándo (`aceptoVersion`,
  `aceptoFecha`); si cambia el aviso, un aviso arriba pide aceptar la nueva versión.
- Pie de la pantalla de entrada y menú de la cuenta: «Ayuda · Privacidad · Términos».
- Botón «?» en cada editor y en los diálogos importantes que abre el artículo de ese tema.
- **Quitar el script de estadísticas de Cloudflare** (panel de Cloudflare → Web Analytics del
  dominio) **antes** de publicar el aviso, o el aviso tendría que declararlo.
- «Descargar todo» ya existe; agregar «Descargar los datos de mi cuenta» (JSON con lo de `Usuario`
  sin hashes, espacios y permisos) para el derecho de acceso.
- Bitácora del servidor: comprobar que no guarde IPs ni contenido y ponerle rotación (s6 en la Pi).
- Al borrar la cuenta, el diálogo menciona los respaldos (hasta 14 días).

### C.6 Cómo se construye

- **Fuentes en Markdown:** `4-CODIGO/ayuda/contenido/<sección>/<artículo>.md`, con cabecera
  (`titulo`, `descripcion`, `aplica: [pagina, app, telefono-servidor]`, `actualizado`, `version`, `orden`).
- **Generador:** `4-CODIGO/ayuda/generar.py` (como los generadores de diagramas) escribe HTML estático
  en `app/src/main/resources/static/ayuda/` y `static/legal/`, con una sola plantilla: barra
  superior (logo, buscador, «Ir a la app»), barra lateral, migas, «En este artículo», «Se aplica a»,
  fecha y versión, anterior y siguiente. El HTML generado se sube al repositorio, para que compilar
  el jar y el APK no necesite Python.
- **Buscador:** `ayuda/indice.json` (título, encabezados, palabras) y `ayuda/buscar.js` sin
  bibliotecas; sin JavaScript, el sitio se navega igual.
- **Estilo:** los mismos colores y la letra de `nom.css` y `MARCA.md`; claro y oscuro según el
  sistema; ancho de celular sin desplazamiento horizontal; imprimible.
- **Política de contenido:** nada en línea; solo `ayuda.css` y `buscar.js` propios.
- **Rutas:** Spring no da `index.html` de las subcarpetas solo: agregar un reenvío de `/ayuda/**` y
  `/legal/**` sin extensión a su `index.html`. En el teléfono, `ServidorHttp` hoy solo mapea `/`,
  `/unirse` y `/proyectar`: agregar la misma regla. En la app, los enlaces a `/ayuda` se abren dentro
  del WebView.
- **Sin Internet:** el service worker guarda de una vez lo legal, «Sin Internet» y las preguntas
  frecuentes, y lo demás conforme se visita.
- **Capturas de pantalla:** `ayuda/capturas.py` (Playwright) las saca de la app de verdad, en
  computadora y celular, para que no se queden viejas.
- **Revisión automática:** `pruebas/interfaz/prueba_ayuda.py`: todos los enlaces existen, cada «?»
  de la app abre un artículo que existe, ninguna página tiene errores de JavaScript ni desplazamiento
  horizontal a 360 px, el buscador encuentra «sin internet», «contraseña», «QR», las páginas
  legales abren sin sesión, desde el teléfono como servidor y sin Internet (service worker).

### C.7 De dónde sale el contenido

`GUIA-FACIL-DE-USAR.md` (glosario y tono), `ESPECIFICACION-CASOS-DE-USO`, el documento del módulo,
`PENDIENTES.md` sección 6 (tabla de casos), `RELEVO-PRUEBAS-0.12.2.md` (lo que todavía no se ve como
en Office), `LOG.md` (novedades), las funciones de `static/js/formulas.js`
(la referencia se genera de ahí), y el inventario de datos de este plan.

---

## D. Decisiones del equipo (antes de empezar)

| # | Decisión | Recomendación |
|---|---|---|
| D.1 | Quién aparece como **responsable** en el aviso y con qué contacto | «Equipo WACK, proyecto escolar del CECyT 9 del IPN» con un **correo nuevo solo para el proyecto**; no publicar domicilios ni correos personales. Preguntar al profesor si se puede nombrar a la escuela |
| D.2 | **Licencia del código** (el repositorio es público y no tiene) | MIT si se quiere que otros lo usen; si no, decirlo en el README («todos los derechos reservados») |
| D.3 | ¿Que los buscadores encuentren la ayuda? | Sí para la Raspberry; `noindex` en Azure para no duplicar |
| D.4 | Azure: ¿cuentas aparte o una sola con la Raspberry? | Aparte, dicho en la interfaz (A.5) |
| D.5 | ¿Cuándo se apaga el servicio y qué pasa con los datos? | Fecha al terminar el ciclo escolar, aviso 30 días antes, «Descargar todo» y borrado de respaldos |
| D.6 | Edad y menores | Uso escolar: a partir de 12 años; a menores de 18 se les pide que lo usen con permiso de su madre, padre o tutor (frase y casilla en el registro) |
| D.7 | ¿Cifrar los documentos en el servidor? | Decidirlo antes del aviso: o se cifran (trabajo extra en el servidor) o el aviso dice claro que no |
| D.8 | «¿Te resultó útil?» en cada artículo | Sin rastreo: un contador anónimo por artículo en el servidor, o nada |

---

## E. Orden, pruebas y documentos

Orden recomendado (lo más útil y menos riesgoso primero):

1. **D:** decisiones (una sesión corta con el equipo y el profesor).
2. **C, infraestructura:** generador, plantilla, rutas en Spring y en el teléfono, service worker, APK.
3. **C, legal:** las diez páginas de `/legal/` y los cambios de la app de C.5 (registro, pie,
   Cloudflare). Es lo que hoy no existe en absoluto.
4. **C, ayuda:** primero «Sin Internet», «Empezar», «Cuentas», preguntas frecuentes y «Problemas»;
   luego editores, Office, novedades y la referencia de fórmulas; al final, los «?» de la app.
5. **B.2:** el día de investigación de «Acceso a la red local»; B.1 (botón de instalar).
6. **A:** una sola cuenta (manera 1, luego 2, luego el pase), con `seguridad.py` ampliado.
7. Versión nueva, todas las suites, publicar en la Raspberry, GitHub y el APK.

Pruebas nuevas: `prueba_ayuda.py` (C.6), casos de cuentas copiadas y pases en `seguridad.py` y en
`prueba_cuentas_equipo.py`, y el ciclo real en `flast-desktop` (con el teléfono, sin Internet, una
cuenta de la nube que nunca entró al teléfono).

Documentos que hay que poner al día cuando se construya: mapa de navegación (`diagramas/navegacion`,
nodos «Ayuda» y «Legal» fuera de la sesión), casos de uso (consultar la ayuda, aceptar el aviso,
entrar al teléfono con la cuenta de la nube), plan de pruebas (casos nuevos), `README.md`, `LEEME.md`,
`SERVIDOR-PROPIO.md` (la llave del pase en la Raspberry y cómo cambiarla), `LOG.md`.
