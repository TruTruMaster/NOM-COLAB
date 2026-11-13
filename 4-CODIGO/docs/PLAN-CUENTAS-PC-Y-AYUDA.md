# Plan: sin Internet sin cuentas (alias y ramas), cifrado, sitio de ayuda y legal

13 de noviembre de 2026, segunda versión: ya con las decisiones del equipo. Solo es el plan: se
construye en otras sesiones (fases 13, 14 y 15 de `PLAN-CONSTRUCCION.md`), en el orden de la parte H.

Contenido:

- **Decisiones tomadas** (y las que faltan, parte G).
- **A. Sin Internet no hay cuentas:** alias al azar (fase 13).
- **B. Ramas para lo editado sin Internet** (fase 13).
- **C. La computadora:** la página descargada basta (fase 13).
- **D. Documentos cifrados en el servidor** (fase 14 y fase 15).
- **E. Chat cifrado** (fase 15, solo lo que condiciona lo demás).
- **F. Sitio de ayuda y legal**, aparte de la app (fase 14).
- **G. Lo que falta decidir.**
- **H. Orden, pruebas y documentos.**

---

## Decisiones tomadas (13 de noviembre de 2026)

| Tema | Decisión |
|---|---|
| Licencia del código | **GPL-3.0** (archivo `LICENSE` y sección en el README) |
| Cuentas | **Con Internet hay cuenta** (la de la Raspberry, la misma en la app y en la página). **Sin Internet no se entra a ninguna cuenta**, pase lo que pase: solo alias generados al azar |
| Azure | **Se une con todo** (una sola cuenta), pero por ahora es de adorno: no se sabe si será requisito. No se trabaja en ello hasta que se pida |
| Lo editado sin Internet | Si nadie más cambió el documento mientras tanto, se sube tal cual. Si alguien más lo cambió, **se abre una rama** y el original de la nube no se toca |
| La computadora | Basta con la página descargada (service worker): crear documentos nuevos y editar la última versión que se tenga de cada uno. Sin Internet no se actualizan los espacios ni la nube: todo se queda en el equipo hasta que vuelva |
| Documentos en el servidor | **Se cifran** (parte D) |
| Edad | **Sin edad mínima** para usar NOM-COLAB. Para grupos de trabajo con chat, pendiente (G.2) |
| Responsable del aviso, buscadores, «¿Te resultó útil?» | Las recomendaciones de la primera versión: equipo WACK con un correo solo del proyecto; la ayuda de la Raspberry visible en buscadores y Azure con `noindex`; contador anónimo o nada |

Se **quita** de la primera versión del plan: entrar al teléfono con la cuenta de la nube (copias de
cuenta, verificador del teléfono, pase sin conexión firmado), el permiso «Acceso a la red local» de
Chrome y empaquetar el jar con su propio Java. Ya no hacen falta con las decisiones de arriba.

## Cómo está hoy (comprobado en el código)

| Dónde | Base de datos | Cuentas |
|---|---|---|
| Página en `https://nomcolab.dpdns.org` y app con «Internet» | La de la Raspberry | Las mismas en las dos |
| Página en Azure | Azure SQL, otra base | Otras (se unirán cuando Azure sea requisito) |
| Teléfono como servidor | La del teléfono (`Almacen`) | Hoy: apodo con QR o código, **o una cuenta creada en el teléfono** (eso se quita, parte A) |

- Sin Internet, lo editado se guarda en la cola cifrada del equipo y **al volver la red se junta
  solo** con lo de los demás (CRDT, `cola.js`; resumen al reconectar en `cola.js` 6.3). Eso cambia
  con la parte B.
- Crear un documento **en un espacio** necesita al servidor (`POST /api/espacios/{id}/documentos`);
  sin Internet solo se puede «Solo en este equipo», y `local.js` ya sabe subir uno de esos a un espacio.
- El teléfono ya copia un espacio a la nube cuando tiene Internet (`ServicioSincronia`): inicia
  sesión en la nube de servidor a servidor con la cuenta del dueño y junta todo.
- Datos que se guardan (para el aviso, parte F): nombre de usuario, hash PBKDF2-HMAC-SHA256 de la
  contraseña con sal, hash del código de recuperación, color, preferencias, intentos y bloqueo,
  fecha de creación; espacios, permisos, enlaces, documentos, versiones, comentarios y avisos
  (**hoy comprimidos, sin cifrar**); la IP solo en memoria para los límites contra el abuso;
  respaldos diarios de la Raspberry (los últimos 14, y copias en la laptop del equipo). No se pide
  correo, nombre real, teléfono ni fecha de nacimiento.
- Terceros que ven el tráfico: Cloudflare (túnel; además mete su script de estadísticas), Microsoft
  Azure cuando se usa, GitHub al descargar el APK.
- Bibliotecas con su licencia: Spring Boot (Apache-2.0), H2 (MPL-2.0 o EPL-1.0), mssql-jdbc (MIT),
  qrcode-generator (MIT), jsQR (Apache-2.0); fuentes Nunito, Carlito, Caladea, Liberation y Comic Neue (OFL).
  **Con GPL-3.0 todo es compatible:** Apache-2.0, MIT y MPL-2.0 se pueden combinar con GPL-3.0
  (H2 se usa bajo su MPL-2.0, no la EPL-1.0) y las fuentes OFL se distribuyen aparte.

---

## A. Sin Internet no hay cuentas: alias al azar (fase 13)

**Regla:** sin Internet nadie inicia sesión ni crea cuenta, en ningún lado. Lo que sí sigue:

1. **Quien ya tenía la sesión abierta en su equipo** sigue trabajando con lo que su equipo guardó
   (su bóveda): no es «entrar a una cuenta», es seguir donde estaba. No puede iniciar sesión de
   nuevo ni cambiar de cuenta hasta que haya Internet.
2. **En el teléfono que comparte, todos entran con un alias generado al azar** (p. ej. «Colibrí
   37», con un color), sin escribir nada: el QR o el código y listo. El alias se guarda en ese
   equipo para ese espacio, así que al reconectarse al mismo teléfono es el mismo alias. Con
   «Otro alias» se genera otro. No se escribe a mano (así nadie se hace pasar por otro).
3. El dueño del teléfono también trabaja ahí con un alias; lo que lo distingue es que el teléfono es suyo.

Cambios:

- Teléfono como servidor: quitar el registro y el inicio de sesión de cuentas
  (`/api/cuentas/registro` y `/api/cuentas/sesion` en `ApiTelefono` responden «Sin Internet se
  entra con alias»); la pantalla de unirse ya no pide apodo, muestra el alias que tocó.
- Las cuentas del teléfono que ya existan: se dejan de usar; sus documentos quedan en el espacio
  con su nombre como autor. Se borran del teléfono en la primera versión que traiga esto.
- Permisos en el espacio del teléfono: el dueño elige al encender si los alias **editan** o solo
  **ven**; los permisos finos (partes con dueño, comentar) se quedan para la nube.
- Al subir el espacio a la nube (`ServicioSincronia`), lo escrito por alias queda a nombre del alias
  («Colibrí 37, sin conexión»). No se «reclama» después: así es más simple y no hay cuentas sin Internet.
- La página sin Internet que no tenga sesión abierta: solo «Usar sin cuenta» (documentos de este equipo).

## B. Ramas para lo editado sin Internet (fase 13)

### B.1 La regla

Al volver Internet, por cada documento de un espacio que la persona cambió sin Internet:

- **Nadie más lo cambió en la nube mientras tanto** → lo suyo se sube tal cual, como hoy, sin rama.
- **Alguien más lo cambió en la nube mientras tanto** → **se abre una rama**: un documento nuevo,
  ligado al original, con todo lo que esa persona tenía. **El original de la nube no se toca.**

«Mientras tanto» es desde que el equipo se quedó sin Internet hasta que volvió. Lo que otros
cambiaron **antes** de perder la conexión no cuenta: eso ya lo tenía.

### B.2 Qué cuenta como «sin Internet» (para no llenar todo de ramas)

En un espacio con varias personas escribiendo en vivo, el Wi-Fi se corta unos segundos todo el
tiempo. Si cada corte abriera una rama, habría ramas a cada rato. **Propuesta (confirmar al
probar):** la regla de ramas aplica cuando el equipo estuvo sin conexión **más de 2 minutos**, o
cuando el documento **se abrió ya sin Internet** (reabrir la página o la app sin red). Un corte más
corto se junta solo, como hoy: el CRDT no pierde nada en esos casos.

### B.3 Cómo se sabe si alguien más lo cambió

- Al quedarse sin conexión, el equipo apunta la **base**: el reloj más alto de cada nodo que tenía de
  ese documento (el CRDT ya guarda reloj y nodo en cada registro).
- Al volver, antes de enviar la cola, pregunta: `GET /api/documentos/{id}/cambios-desde?base=…` →
  el servidor dice si tiene registros de **otros** nodos posteriores a esa base.
- No → envía la cola como hoy. Sí → crea la rama (B.4) y **no** envía la cola al original.

### B.4 Qué es una rama

- Un documento nuevo en el **mismo espacio** y con los mismos permisos, con todo lo que la persona
  tenía en su equipo (la base más sus cambios); se crea con el `POST` de siempre más
  `ramaDe = id del original`, `base` y la lista de cambios propios (para fusionar después).
- Nombre: «Informe final — rama de Ana (sin conexión, 13 nov 10:42)». Si la hizo un alias del teléfono:
  «— rama del teléfono de Ana (Colibrí 37, Nutria 12)».
- En el original sale «Ramas (1)» en el panel del documento, y un aviso a quien la creó y al dueño.
- La rama se puede abrir y editar como cualquier documento (y seguir en vivo con otros).

### B.5 Juntar una rama con el original

Desde la rama o desde el original: **«Comparar con el original»** muestra lado a lado qué cambió
cada quien desde la base (por párrafo en textos, por celda en hojas, por figura en diagramas y
presentaciones). Y luego:

- **Fusionar en el original:** se aplican al original los cambios propios de la rama (el CRDT junta
  sin perder lo de los demás; si dos cambiaron la misma letra o celda, se muestra para elegir).
  Queda una versión «Antes de fusionar la rama de Ana» para poder regresar.
- **Elegir cambio por cambio** (segunda vuelta, después de la primera versión).
- **Dejarla como documento aparte** (se quita el lazo con el original).
- **Descartar la rama** (va a la papelera, como cualquier documento).

Pueden fusionar quien editó la rama y quien tenga permiso de edición en el original; las partes con
dueño se respetan al fusionar (el dueño de una parte decide sobre ella).

### B.6 Casos especiales

- **Documento nuevo creado sin Internet** (parte C): se sube como documento nuevo, sin rama.
- **El original se borró en la nube mientras tanto:** la rama queda como documento aparte («recuperado»).
- **La persona lo borró sin Internet y otro lo cambió en la nube:** no se borra; se le avisa.
- **Cambio de nombre en los dos lados:** gana el de la nube; el de la persona se queda en la rama.
- **Documento protegido o con fecha de entrega vencida mientras tanto:** la rama se crea y se marca
  («editado después de la fecha límite»); no se fusiona sola.
- **Varias personas sin Internet a la vez:** una rama por persona (o por teléfono).
- **El teléfono que comparte, al subir a la nube:** la misma regla por documento: si la nube no
  cambió desde la última copia, se sube tal cual; si cambió, rama del teléfono.
- **Documentos «Solo en este equipo»:** no tienen original en la nube; no aplica.

### B.7 Lo que cambia en el código

`cola.js` (antes de vaciar la cola, preguntar `cambios-desde`; el resumen al reconectar ahora dice
«Se creó una rama porque…»), `datos.js` y `vista-espacios.js` (crear y mostrar ramas, comparar,
fusionar), `ServicioDocumentos` (campos `ramaDe`, `base`, `cambiosPropios`; `cambios-desde`;
fusionar), `ServicioSincronia` (la regla al subir el espacio del teléfono), `ApiTelefono` (las mismas
rutas), y el `.nom` (llevar `ramaDe` al exportar).

## C. La computadora: la página descargada basta (fase 13)

- Con una visita con Internet, la página queda guardada (service worker) y se puede **instalar**
  (Chrome o Edge: botón «Instalar en esta computadora» con `beforeinstallprompt`; falta ese botón).
- Sin Internet: se editan las últimas versiones guardadas de cada documento y **se pueden crear
  documentos nuevos también dentro de un espacio**: se guardan en el equipo marcados con su espacio
  de destino y, al volver Internet, se suben solos a ese espacio (con lo que ya hace `local.js`).
  Hoy eso solo se puede como «Solo en este equipo».
- Sin Internet no se actualiza nada de los espacios ni de la nube: no se ven cambios de otros, no se
  crean espacios, no se invita. Al volver, se aplica la parte B.
- Sin haber entrado nunca: solo con un teléfono que comparta (por `http`, como hoy).

## D. Documentos cifrados en el servidor (fases 14 y 15)

Sí: hoy en el equipo todo va cifrado y solo lo abre la cuenta; en el servidor no. Hay dos niveles y
conviene hacerlos en orden:

### D.1 Nivel 1: cifrado en reposo (fase 14, antes de publicar el aviso)

- El servidor cifra con AES-256-GCM lo que escribe en disco: documentos, versiones, comentarios, y
  los **respaldos**. La llave vive fuera de la carpeta de datos (en la Raspberry, en un archivo solo
  legible por el servicio; en Azure, en su configuración).
- Protege contra: robo del disco o de la tarjeta de la Raspberry, un respaldo copiado a otro lado.
- **No** protege contra quien administra el servidor (tiene la llave). El aviso lo dice así.
- Trabajo: chico; el resto del servidor no cambia.

### D.2 Nivel 2: de extremo a extremo (fase 15, junto con el chat)

Para que ni quien administra el servidor pueda leer:

- Cada espacio tiene una **llave del espacio**; cada cuenta, un par de llaves; la privada va
  envuelta con la contraseña (como la bóveda) **y también con el código de recuperación** (si no,
  restablecer la contraseña dejaría sin acceso a todos los espacios).
- La llave del espacio va envuelta para cada miembro; un enlace o QR de invitación la lleva después
  del `#` (eso no se manda al servidor).
- Se cifra el **contenido** (texto, valores de celdas, figuras, nombres de documentos y espacios);
  la **estructura** sigue en claro (identificadores, reloj, autor, dueño de cada parte), así el
  servidor puede seguir juntando cambios, aplicar el tope de 25 MB, guardar versiones, revisar
  permisos y contar aportes.
- Lo que deja de poder hacer el servidor o hay que mover al equipo: la proyección pública (el enlace
  lleva la llave), el recibo verificable (huella sobre lo cifrado), cualquier búsqueda en el servidor.
- El teléfono que comparte sin Internet: los alias reciben la llave del espacio por el QR.
- Lo que el servidor todavía ve aunque esté cifrado: quién está en qué espacio, tamaños y horas. El aviso lo dice.
- Trabajo: grande; necesita su propia fase y pruebas de seguridad nuevas.

## E. Chat cifrado (fase 15; aquí solo lo que condiciona lo demás)

Se planea un chat por espacio, con imágenes y documentos, **100 % cifrado** (sobre la llave del
espacio de D.2). Lo que ya hay que tener en cuenta:

- Con cifrado de extremo a extremo nadie puede revisar lo que se manda: para reportar, quien reporta
  comparte los mensajes ya descifrados desde su equipo (la página «Reportar contenido» lo explica).
- Tope de tamaño de imágenes y archivos, y que cuenten en el espacio de la cuenta.
- Sin Internet, en el teléfono que comparte: el chat funciona entre los alias y se sube como el resto.
- Por esto sigue pendiente la edad para los grupos (G.2).

## F. Sitio de ayuda y legal (fase 14)

### F.1 Qué es

Un sitio **aparte de la app**, como la documentación de Microsoft: páginas sueltas que se leen sin
iniciar sesión, con barra lateral, buscador, migas de pan, «En este artículo», «Se aplica a» y fecha
de actualización. Vive en el mismo servidor, en `/ayuda/` y `/legal/`, para que exista también sin
Internet: lo sirve la Raspberry, Azure, el jar y el teléfono como servidor, y va dentro del APK.

### F.2 Mapa del sitio

```
/ayuda/                         Inicio: buscador, tarjetas por tema, «Lo más consultado»
  empezar/                      Qué es NOM-COLAB · Crear cuenta y entrar · Código de recuperación ·
                                Usar sin cuenta · Instalar en la computadora · Instalar la app de
                                Android (orígenes desconocidos, actualizar) · Requisitos
  espacios/                     Espacios y documentos · Permisos · Invitar (enlace, QR, código) ·
                                Modo salón · Partes con dueño · Comentarios y sugerencias · Versiones ·
                                Ramas (qué son, comparar, fusionar) · Entrega con fecha límite · Hasta 5 personas
  editores/                     Texto · Hoja (y referencia de fórmulas, generada de formulas.js) ·
                                Presentación · Diagrama · La ruedita · Atajos de teclado
  sin-internet/                 Cómo funciona · Qué se puede en cada caso (tabla) · Alias al azar ·
                                Qué pasa al volver Internet (subir tal cual o rama) · El teléfono como
                                servidor paso a paso (Wi-Fi y punto de acceso) · Crear documentos sin Internet
  office/                       Abrir y descargar .docx/.xlsx/.pptx · El formato .nom · Qué se ve igual
                                y qué todavía no · Tope de 25 MB y espacio por cuenta
  cuentas/                      Contraseña y bloqueo · Varios equipos · Cambiar y restablecer ·
                                Lo guardado en tu equipo · Cifrado (en tu equipo y en el servidor) ·
                                «Conexión sin cifrar» · Borrar la cuenta · Descargar todo lo tuyo
  problemas/                    No encuentro el teléfono en la red · «Conexión sin cifrar» · Se ve
                                distinto que en Word · La app no se actualiza · «Se creó una rama» ·
                                No puedo entrar sin Internet · Se llenó el espacio
  preguntas-frecuentes/         Ver F.4
  novedades/                    Qué cambió en cada versión, en palabras sencillas (sale del LOG)
  acerca/                       Proyecto escolar (CECyT 9, IPN, 5IM7, equipo WACK) · Código fuente
                                (GPL-3.0) · Contacto · Estado del servicio
/legal/
  privacidad/                   Aviso de privacidad integral
  privacidad-corto/             Aviso de privacidad simplificado (el que se enlaza en el registro)
  terminos/                     Términos y condiciones de uso
  uso-aceptable/                Política de uso aceptable
  almacenamiento/               Cookies y almacenamiento en tu equipo (no usamos cookies)
  permisos-android/             Para qué es cada permiso de la app
  licencias/                    La licencia de NOM-COLAB (GPL-3.0) y las de terceros
  seguridad/                    Cómo protegemos tus datos · Reportar una falla de seguridad
  accesibilidad/                Declaración de accesibilidad
  denuncias/                    Reportar contenido
/.well-known/security.txt       Contacto para fallas de seguridad
/sitemap.xml, /robots.txt       Raspberry visible; Azure con noindex
```

### F.3 Las páginas legales

Base: la **Ley Federal de Protección de Datos Personales en Posesión de los Particulares** de 2025
(DOF 20 de marzo de 2025, vigente desde el 21). La autoridad ya no es el INAI: sus funciones pasaron
a la **Secretaría Anticorrupción y Buen Gobierno**. El aviso debe detallar los datos que se tratan
(y cuáles son sensibles) y separar las finalidades que requieren consentimiento. **Antes de
publicar, revisar el texto vigente en el DOF u ordenjuridico.gob.mx** y pedir al profesor que lo
lea: es un proyecto escolar, no asesoría legal.

- **Aviso integral:** responsable (equipo WACK, correo del proyecto); qué datos (el inventario de
  «Cómo está hoy», más los alias y las ramas); finalidades: solo dar el servicio, **ninguna**
  secundaria (sin publicidad, sin vender, sin estadísticas propias); quién más ve los datos
  (Cloudflare, Microsoft Azure, GitHub); dónde están; cuánto se guardan (mientras exista la cuenta;
  respaldos hasta 14 días después; lo del equipo hasta que la persona lo borre); **cifrado**: en el
  equipo siempre; en el servidor, lo que diga D según el nivel que ya esté hecho (no prometer el
  nivel 2 antes de tenerlo); derechos ARCO y revocación (correo; y lo que se hace solo: Descargar
  todo, borrar la cuenta); menores de edad (sin edad mínima: a quien sea menor se le pide usarla con
  su madre, padre o tutor; revisar qué pide la ley); cambios al aviso y fecha.
- **Aviso simplificado:** responsable, finalidades y dónde leer el integral.
- **Términos:** servicio escolar gratis «tal como está», sin garantía de que esté prendido; qué pasa
  si se apaga (G.1); una cuenta por persona; cuidar la contraseña y el código de recuperación;
  **lo que escribes es tuyo**; sin Internet no hay cuentas, solo alias, y al volver se suben los
  cambios o se abre una rama; reglas de uso; el código es software libre bajo **GPL-3.0**; «Word,
  Excel y PowerPoint son marcas de Microsoft; NOM-COLAB no está afiliado a Microsoft»; ley mexicana.
- **Uso aceptable:** nada ilegal, acoso o burlas (entorno escolar), datos personales de otros sin
  permiso, archivos dañinos, abusar del servicio, intentar romper la seguridad (salvo reportarla).
- **Almacenamiento en tu equipo:** sin cookies; qué se guarda en `localStorage`, IndexedDB
  (cifrado), la caché del service worker y el alias de cada espacio; cómo borrarlo.
- **Permisos de Android:** cámara (QR), Internet, estado de red y Wi-Fi, multicast (buscar en la
  red), servicio en primer plano (el teléfono como servidor), notificaciones, mantener despierto,
  almacenamiento (descargas en Android viejo): para qué y qué pasa si se niega.
- **Licencias:** texto de la GPL-3.0 y de cada biblioteca y fuente (de `vendor/LICENCIAS.md`,
  `fonts/LICENCIAS-FUENTES.txt` y el `pom.xml`).
- **Seguridad:** resumen honesto y cómo reportar una falla. **Accesibilidad:** meta WCAG 2.2 AA y lo
  que falta. **Denuncias:** el dueño del espacio puede quitar contenido; cómo avisar al equipo; con
  el chat cifrado, cómo compartir lo reportado (E).

### F.4 Preguntas frecuentes (borrador)

Primeros pasos: 1. ¿Qué es NOM-COLAB y en qué se parece y se diferencia de Word, Excel, PowerPoint o
Canva? 2. ¿Cuesta, tiene anuncios, usa inteligencia artificial? 3. ¿Necesito cuenta? 4. ¿Por qué no
me piden correo y cómo recupero la contraseña? 5. ¿En qué navegadores y teléfonos funciona? ¿Hay
app para iPhone o computadora? 6. ¿Desde qué edad se puede usar?

Sin Internet: 7. ¿De verdad funciona sin Internet y qué necesito haber hecho antes? 8. Nunca entré a
la página y no hay Internet: ¿cómo trabajamos juntos? 9. ¿Por qué sin Internet no puedo entrar con
mi cuenta y me toca un alias? 10. ¿Puedo crear documentos sin Internet? 11. ¿Qué pasa con lo que
escribí sin Internet cuando vuelve la red? 12. ¿Qué es una rama y por qué se creó una de mi documento?
13. ¿Cómo junto una rama con el original?

Cuentas y datos: 14. ¿Dónde se guardan mis documentos y quién los puede ver? 15. ¿Están cifrados?
16. ¿La cuenta de la página es la misma que la de la app? ¿Y la de Azure? 17. ¿Qué es «Conexión sin
cifrar»? 18. ¿Cómo descargo todo lo mío y borro mi cuenta? ¿Qué queda después? 19. Me bloqueó tras
varios intentos: ¿cuánto dura?

Trabajo en equipo: 20. ¿Cuántas personas a la vez? 21. ¿Qué puede hacer cada permiso? 22. ¿Cómo sé
quién escribió cada parte? 23. ¿Cómo entrego una tarea con fecha límite?

Office y archivos: 24. ¿Mis archivos de Office quedan iguales al descargarlos? 25. ¿Por qué algo se
ve distinto que en Word? 26. ¿Qué es un .nom? 27. ¿Cuánto puede pesar un documento?

La app: 28. ¿Por qué no está en la Play Store y es seguro instalarla? 29. ¿Para qué pide cada
permiso? 30. ¿Cómo la actualizo sin perder lo mío? 31. ¿Qué hace «Trabajar sin Internet con este
teléfono» y gasta mucha batería? 32. ¿El código es libre? (GPL-3.0)

### F.5 Cambios en la app que pide la parte legal

- Registro: casilla «Leí y acepto los Términos y el Aviso de privacidad» con enlaces y la frase para
  menores; guardar qué versión aceptó y cuándo (`aceptoVersion`, `aceptoFecha`); si cambia el aviso,
  pedir aceptar la nueva.
- Pie de la entrada y menú de la cuenta: «Ayuda · Privacidad · Términos». Botón «?» en editores y
  diálogos importantes hacia su artículo.
- **Quitar el script de estadísticas de Cloudflare** (panel de Cloudflare → Web Analytics del
  dominio) antes de publicar el aviso.
- «Descargar los datos de mi cuenta» (JSON sin hashes), además de «Descargar todo».
- Bitácora del servidor sin IPs ni contenido, con rotación (s6 en la Pi).
- Al borrar la cuenta, mencionar los respaldos (hasta 14 días).
- Cifrado en reposo (D.1) antes de publicar el aviso.

### F.6 Cómo se construye

- Fuentes en Markdown: `4-CODIGO/ayuda/contenido/<sección>/<artículo>.md`, con cabecera (`titulo`,
  `descripcion`, `aplica`, `actualizado`, `version`, `orden`).
- `4-CODIGO/ayuda/generar.py` escribe HTML estático en `static/ayuda/` y `static/legal/` con una sola
  plantilla; el HTML generado se sube al repositorio (compilar el jar y el APK no necesita Python).
- Buscador sin bibliotecas (`ayuda/indice.json` y `ayuda/buscar.js`); sin JavaScript se navega igual.
- Colores y letra de `nom.css` y `MARCA.md`; claro y oscuro; ancho de celular; imprimible; nada en
  línea (política de contenido).
- Rutas: reenviar `/ayuda/**` y `/legal/**` sin extensión a su `index.html` en Spring y en
  `ServidorHttp` del teléfono (hoy solo mapea `/`, `/unirse` y `/proyectar`); en la app se abren
  dentro del WebView.
- El service worker guarda de una vez lo legal, «Sin Internet» y las preguntas frecuentes.
- `ayuda/capturas.py` saca las capturas de la app de verdad (computadora y celular).
- `pruebas/interfaz/prueba_ayuda.py`: enlaces, cada «?» de la app, sin errores ni desplazamiento a
  360 px, buscador, páginas legales sin sesión, desde el teléfono y sin Internet.

### F.7 De dónde sale el contenido

`GUIA-FACIL-DE-USAR.md` (glosario y tono), la especificación de casos de uso, el documento del
módulo, `PENDIENTES.md` sección 6, `RELEVO-PRUEBAS-0.12.2.md` (lo que no se ve como en Office),
`LOG.md` (novedades), `static/js/formulas.js` (referencia de fórmulas) y el inventario de este plan.

---

## G. Lo que falta decidir

| # | Qué | Qué significa y propuesta |
|---|---|---|
| G.1 | **Si se apaga el servicio, qué pasa con los datos** | Se refiere a la **nube** (la Raspberry, y Azure si se usa): si al terminar el proyecto o el ciclo escolar se apaga, las cuentas y documentos guardados ahí dejarían de estar. Lo guardado en cada equipo no se pierde. Propuesta: avisar en la página con 30 días, dejar descargar todo y después borrar la nube **y sus respaldos**; si se decide no apagarla nunca, decirlo así |
| G.2 | **Edad para grupos con chat** | Usar NOM-COLAB: sin edad mínima (decidido). Para el chat cifrado nadie puede moderar lo que se manda. Opciones: (a) sin límite, con la frase para menores; (b) chat solo en espacios cuyo dueño sea un adulto (p. ej. modo salón del maestro); (c) edad mínima para el chat. Decidir antes de la fase 15 |
| G.3 | **Cuánto tiempo sin conexión abre una rama** | Propuesta de B.2: más de 2 minutos, o abierto ya sin Internet. Confirmar al probar con el equipo |
| G.4 | **Cómo se une Azure** (cuando sea requisito) | Una sola base para todo: o Azure usa la misma de la Raspberry, o una réplica. Se diseña cuando se pida |
| G.5 | Crear el correo del proyecto | Para el aviso, `security.txt` y denuncias |

## H. Orden, pruebas y documentos

1. **Ya:** archivo `LICENSE` con la GPL-3.0 y sección en el README; crear el correo del proyecto (G.5).
2. **Fase 13 (sin Internet):** A (alias, quitar cuentas del teléfono), C (crear documentos en un
   espacio sin Internet, botón «Instalar»), B (ramas: detectar, crear, mostrar, comparar, fusionar).
3. **Fase 14 (ayuda, legal y cifrado en reposo):** infraestructura del sitio, D.1, páginas legales
   y cambios de F.5, después la ayuda (Sin Internet, Empezar, Cuentas, preguntas frecuentes,
   Problemas; luego editores, Office, novedades, fórmulas) y los «?» de la app.
4. **Fase 15 (cuando se decida G.2):** cifrado de extremo a extremo (D.2) y chat (E).
5. En cada fase: versión nueva, todas las suites, publicar en la Raspberry, GitHub y el APK.

Pruebas nuevas:

- **Alias:** sin Internet no se puede iniciar sesión ni registrarse en el teléfono; el alias se
  repite en el mismo equipo y espacio; no se puede escribir a mano.
- **Ramas:** sin cambios de otros → se sube tal cual; con cambios de otros → rama y original intacto;
  corte corto → se junta solo; cada caso de B.6; fusionar (con versión para regresar) y descartar;
  el teléfono subiendo con y sin cambios en la nube.
- **Crear sin Internet** en un espacio y que se suba solo.
- **Cifrado en reposo:** en el disco y en los respaldos no aparece texto en claro; sin la llave no arranca.
- **Ayuda:** `prueba_ayuda.py` (F.6).
- **Ciclo real en `flast-desktop`** con la Raspberry: editar sin Internet mientras otro edita en
  línea, volver y ver la rama.

Documentos que hay que poner al día cuando se construya: mapa de navegación (ramas, alias, «Ayuda» y
«Legal» fuera de la sesión), casos de uso (editar sin Internet con rama, fusionar, entrar con alias,
consultar la ayuda, aceptar el aviso), diagramas de actividades de sin Internet, plan de pruebas,
`README.md`, `LEEME.md`, `SERVIDOR-PROPIO.md` (la llave del cifrado en reposo y su respaldo), `LOG.md`.
