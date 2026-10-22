# NOM-COLAB — Especificación de casos de uso

Equipo 6 "WACK" · CECyT 9 "Juan de Dios Bátiz" · 5IM7

Diagramas correspondientes: `08-cu-cuentas`, `10-cu-espacios`, `11-cu-general`
y los diagramas de actividades `actividades/A1` a `A7`.

> **Cambio (oct. 2026):** el módulo *Conoce NOM* se retiró del proyecto, junto con
> CU-06 a CU-12. La configuración de preferencias (CU-27) pasó al módulo de
> cuentas: se abre desde el menú de la cuenta en cualquier pantalla.

## Actores

| Actor | Descripción |
|---|---|
| **Visitante** | Persona sin sesión iniciada. Solo puede registrarse y autenticarse. |
| **Usuario** | Visitante autenticado. Hereda todo lo del Visitante y accede a sus espacios y preferencias. |
| **Propietario** | Usuario que creó un espacio. Hereda todo lo del Usuario y además administra accesos, conexión y almacenamiento de ese espacio. |
| **Administrador** | Usuario con el rol `ADMINISTRADOR` en la base de datos. Hereda todo lo del Usuario y además administra las cuentas y sus roles (CU-30). |
| **Módulo de seguridad** | Actor sistema. Cifra credenciales y aplica el bloqueo por intentos fallidos. |
| **Nodo remoto (LAN)** | Actor sistema. Otra instancia de NOM-COLAB en la red local. |
| **Dispositivo Android** | Actor sistema. Cliente móvil que sincroniza con un espacio. |

## Índice

| ID | Caso de uso | Módulo | Prioridad |
|---|---|---|---|
| CU-01 | Crear usuario | Cuentas | Alta |
| CU-02 | Iniciar sesión | Cuentas | Alta |
| CU-03 | Cerrar sesión | Cuentas | Media |
| CU-04 | Bloquear acceso por intentos fallidos | Cuentas | Alta |
| CU-05 | Cifrar credenciales | Cuentas | Alta |
| CU-27 | Configurar preferencias del sistema | Cuentas | Media |
| CU-30 | Administrar usuarios y roles | Cuentas | Alta |
| CU-13 | Crear espacio de trabajo | Espacios | Alta |
| CU-14 | Activar conexión del proyecto | Espacios | Alta |
| CU-15 | Descubrir espacios en la LAN | Espacios | Alta |
| CU-16 | Unirse a un espacio | Espacios | Alta |
| CU-17 | Gestionar accesos y permisos | Espacios | Alta |
| CU-18 | Crear documento | Espacios | Alta |
| CU-19 | Editar documento en el lienzo | Espacios | Alta |
| CU-20 | Elegir el tipo del documento (fijo) | Espacios | Alta |
| CU-21 | Sincronizar edición concurrente (CRDT) | Espacios | Alta |
| CU-22 | Consultar micro-textos de ayuda | Espacios | Baja |
| CU-23 | Gestionar versiones | Espacios | Media |
| CU-24 | Administrar almacenamiento | Espacios | Media |
| CU-25 | Conectar dispositivo Android | Espacios | Alta |
| CU-26 | Trabajar sin conexión y resincronizar | Espacios | Alta |
| CU-28 | Importar archivo | Espacios | Alta |
| CU-29 | Exportar documento | Espacios | Alta |

---

# Módulo 1 — Gestión de cuentas

## CU-01 · Crear usuario

| | |
|---|---|
| **Actor principal** | Visitante |
| **Actores secundarios** | Módulo de seguridad |
| **Descripción** | Registra una cuenta nueva con nombre y contraseña, y opcionalmente el nombre de la empresa. |
| **Precondiciones** | Ninguna. |
| **Postcondiciones** | Existe un `Usuario` persistido con su contraseña cifrada. |
| **Incluye** | CU-05 Cifrar credenciales |

**Flujo principal**
1. El Visitante abre la pantalla de registro.
2. Captura nombre de usuario y contraseña.
3. Captura el nombre de la empresa u organización (campo opcional).
4. El sistema valida que el nombre no esté ocupado.
5. El sistema cifra la contraseña (CU-05).
6. El sistema guarda el `Usuario` y confirma el registro.
7. El sistema redirige a la pantalla de inicio de sesión.

**Flujos alternativos**
- *3a.* El Visitante deja la empresa vacía → el registro continúa sin ella.

**Excepciones**
- *4a.* Nombre ya existe → mensaje "el nombre ya está en uso"; regresa al paso 2.
- *2a.* Nombre o contraseña vacíos → mensaje de campo obligatorio; regresa al paso 2.
- *6a.* Falla al guardar → mensaje de error; no se crea la cuenta.

**Requerimientos** RF Cuentas 1, 2 · RNF Cuentas 1 (cifrado), 2 (≤ 2 s)

---

## CU-02 · Iniciar sesión

| | |
|---|---|
| **Actor principal** | Visitante |
| **Actores secundarios** | Módulo de seguridad |
| **Descripción** | Autentica a un usuario registrado y abre una sesión. |
| **Precondiciones** | El usuario existe y su acceso no está bloqueado. |
| **Postcondiciones** | Existe una `Sesion` vigente con su token; se cargan los espacios del usuario. |
| **Incluye** | CU-05 Cifrar credenciales |
| **Extendido por** | CU-04 Bloquear acceso por intentos fallidos |

**Flujo principal**
1. El Visitante captura nombre y contraseña.
2. El sistema recupera al `Usuario` por su nombre.
3. El sistema compara el hash de la contraseña (CU-05).
4. El sistema reinicia el contador de intentos fallidos a cero.
5. El sistema crea una `Sesion` con token y fecha de expiración.
6. El sistema carga la lista de espacios del usuario.
7. El sistema muestra la pantalla de inicio.

**Flujos alternativos**
- *1a.* El Visitante no tiene cuenta → va a CU-01.

**Excepciones**
- *2a.* El usuario no existe → mensaje genérico "credenciales inválidas" (no se revela si el nombre existe).
- *3a.* Contraseña incorrecta → se incrementa `intentosFallidos`; si supera 5 se dispara CU-04; regresa al paso 1.
- *3b.* El acceso ya está bloqueado → mensaje de cuenta bloqueada; el caso de uso termina.

**Requerimientos** RF Cuentas 3 · RNF Cuentas 1, 2, 3

---

## CU-03 · Cerrar sesión

| | |
|---|---|
| **Actor principal** | Usuario |
| **Descripción** | Termina la sesión activa. |
| **Precondiciones** | Existe una sesión vigente. |
| **Postcondiciones** | El token queda invalidado; se regresa a la pantalla de bienvenida. |

**Flujo principal**
1. El Usuario selecciona "cerrar sesión".
2. El sistema invalida el token de la `Sesion`.
3. El sistema descarta del cliente los datos en memoria.
4. El sistema muestra la pantalla de bienvenida.

**Flujos alternativos**
- *1a.* Hay cambios sin sincronizar → el sistema advierte y ofrece esperar la sincronización antes de salir.

**Excepciones**
- *2a.* La sesión ya expiró → se cierra igualmente sin error.

**Requerimientos** RF Cuentas 3

---

## CU-04 · Bloquear acceso por intentos fallidos

| | |
|---|---|
| **Actor principal** | Módulo de seguridad |
| **Descripción** | Bloquea el acceso a una cuenta tras más de 5 intentos de contraseña incorrecta. |
| **Tipo** | «extend» sobre CU-02 |
| **Precondiciones** | `intentosFallidos` del usuario es mayor que 5. |
| **Postcondiciones** | La cuenta queda bloqueada y se rechazan nuevos intentos. |

**Flujo principal**
1. El módulo detecta el sexto intento fallido consecutivo.
2. El módulo marca la cuenta como bloqueada.
3. El módulo registra el evento (fecha y origen).
4. El sistema informa al Visitante que el acceso fue bloqueado.

**Flujos alternativos**
- *4a.* El bloqueo es temporal → se indica el tiempo restante para reintentar.

**Excepciones**
- *2a.* No se puede persistir el bloqueo → se rechaza el acceso de todas formas (falla cerrada).

**Requerimientos** RNF Cuentas 3

---

## CU-05 · Cifrar credenciales

| | |
|---|---|
| **Actor principal** | Módulo de seguridad |
| **Descripción** | Cifra las contraseñas en tránsito y en reposo con un algoritmo robusto. |
| **Tipo** | «include» de CU-01 y CU-02 |
| **Precondiciones** | Se recibió una contraseña en texto claro. |
| **Postcondiciones** | Solo se almacena o compara el hash; el texto claro se descarta de memoria. |

**Flujo principal**
1. El módulo recibe la contraseña por un canal cifrado.
2. El módulo genera el hash con sal.
3. El módulo entrega el hash para guardarlo o compararlo.
4. El módulo descarta el texto claro.

**Excepciones**
- *1a.* El canal no está cifrado → se rechaza la operación.

**Requerimientos** RNF Cuentas 1

---

## CU-27 · Configurar preferencias del sistema

| | |
|---|---|
| **Actor principal** | Usuario |
| **Descripción** | Ajusta las preferencias globales, el comportamiento de guardado y el rendimiento del entorno. |
| **Precondiciones** | Sesión vigente. |
| **Postcondiciones** | Las `Preferencias` del usuario quedan guardadas y aplican de inmediato. |

**Flujo principal**
1. El Usuario abre "Ajustes y preferencias".
2. El sistema muestra las preferencias actuales.
3. El Usuario ajusta idioma, intervalo de autoguardado, cuántas versiones conservar o la calidad de render.
4. El sistema valida los valores y guarda las `Preferencias`.
5. El sistema aplica los cambios sin necesidad de reiniciar.

**Flujos alternativos**
- *3a.* El Usuario restaura los valores de fábrica → se reescriben con los predeterminados.
- *3b.* El Usuario baja la calidad de render → el lienzo reduce efectos para equipos que apenas cumplen el mínimo de hardware.

**Excepciones**
- *4a.* Valor fuera de rango (por ejemplo autoguardado en 0) → se rechaza indicando el rango válido.

**Requerimientos** Proceso de negocio Fase 5 · Requerimientos de hardware (WebGL 1 mínimo)

---

## CU-30 · Administrar usuarios y roles

| | |
|---|---|
| **Actor principal** | Administrador |
| **Actores secundarios** | Módulo de seguridad |
| **Descripción** | Consulta las cuentas registradas en la base de datos, cambia el rol de una cuenta (ADMINISTRADOR / USUARIO) y desbloquea cuentas bloqueadas por intentos fallidos. |
| **Precondiciones** | Sesión vigente y la cuenta tiene el rol `ADMINISTRADOR` en la tabla `rol`. |
| **Postcondiciones** | El rol o el bloqueo de la cuenta queda actualizado en la base de datos y aplica en la siguiente petición de esa cuenta. |
| **Incluye** | CU-02 Iniciar sesión |

**Flujo principal**
1. El Administrador abre "Administrar usuarios" desde el menú lateral o el menú de su cuenta.
2. El sistema vuelve a leer el rol de la sesión en la base de datos y confirma que es `ADMINISTRADOR`.
3. El sistema muestra cada cuenta con su empresa, fecha de registro, rol y si está bloqueada.
4. El Administrador elige "Hacer administrador" o "Quitar administrador" en una cuenta.
5. El sistema actualiza `usuario.id_rol` y muestra el rol nuevo.
6. Si la cuenta está bloqueada, el Administrador elige "Desbloquear" y el sistema reinicia `bloqueado_hasta` e `intentos_fallidos`.

**Flujos alternativos**
- *4a.* El Administrador cancela la confirmación → no cambia nada.

**Excepciones**
- *2a.* La cuenta tiene rol `USUARIO` → el servidor responde 403 "Esta sección es solo para administradores"; la interfaz ni siquiera muestra la opción.
- *4b.* El Administrador intenta quitarse su propio rol → se rechaza para que siempre quede al menos un administrador.
- *5a.* Rol desconocido → se rechaza indicando los roles válidos.

**Requerimientos** RF Cuentas 4 (gestionar y validar el acceso) · RNF Cuentas 1 (seguridad)

---

# Módulo 2 — Espacios de trabajo

## CU-13 · Crear espacio de trabajo

| | |
|---|---|
| **Actor principal** | Usuario (queda como Propietario) |
| **Descripción** | Crea un espacio colaborativo donde vivirán los documentos. |
| **Precondiciones** | Sesión vigente. |
| **Postcondiciones** | Existe un `Espacio` y un `Acceso` con permiso `PROPIETARIO` para su creador. |

**Flujo principal**
1. El Usuario elige "crear espacio" en la lista de espacios.
2. Captura el nombre del espacio.
3. El sistema crea el `Espacio`.
4. El sistema asigna al creador un `Acceso` con permiso `PROPIETARIO`.
5. El sistema ofrece activar la conexión del proyecto (CU-14).
6. El sistema muestra el espacio abierto.

**Flujos alternativos**
- *5a.* El Propietario declina → el espacio queda solo en local.

**Excepciones**
- *2a.* Nombre vacío o duplicado para ese usuario → se solicita corregirlo.
- *3a.* Falla al persistir → no se crea el espacio y se informa el error.

**Requerimientos** RF Espacios 1

---

## CU-14 · Activar conexión del proyecto

| | |
|---|---|
| **Actor principal** | Propietario |
| **Actores secundarios** | Nodo remoto (LAN) |
| **Descripción** | Inicializa el puerto de red (servidor local o P2P) y hace visible el proyecto a otros usuarios de la misma red. |
| **Precondiciones** | El espacio existe y el actor tiene permiso `PROPIETARIO`. |
| **Postcondiciones** | `NodoLocal` escucha en un puerto y el espacio se anuncia en la LAN. |

**Flujo principal**
1. El Propietario activa "Conexión del proyecto".
2. El sistema selecciona un puerto disponible.
3. `NodoLocal.iniciar()` abre el puerto.
4. `ServicioDescubrimiento.anunciar()` publica el espacio en la red local.
5. El sistema muestra el estado "visible en la red" con el nombre del host.

**Flujos alternativos**
- *1a.* El Propietario desactiva la conexión → se cierra el puerto y se deja de anunciar; el trabajo sigue en local.

**Excepciones**
- *2a.* No hay puertos disponibles → se informa y el espacio queda en local.
- *3a.* El sistema operativo o el firewall bloquea el puerto → se indica qué permiso hace falta.
- *4a.* No hay interfaz de red activa → se avisa que no habrá descubrimiento hasta conectarse a una red.

**Requerimientos** RF Espacios 1 (conexión del proyecto)

---

## CU-15 · Descubrir espacios en la LAN

| | |
|---|---|
| **Actor principal** | Usuario |
| **Actores secundarios** | Nodo remoto (LAN) |
| **Descripción** | Lista los espacios anunciados por otros nodos de la red local. |
| **Precondiciones** | Sesión vigente y equipo conectado a una red local. |
| **Postcondiciones** | Se muestra la lista de `EspacioRemoto` detectados. |

**Flujo principal**
1. El Usuario abre "unirse a un espacio".
2. `ServicioDescubrimiento.buscarEnLan()` emite la consulta de descubrimiento.
3. Los nodos remotos responden con nombre, host y puerto.
4. El sistema lista los espacios encontrados.

**Flujos alternativos**
- *4a.* El Usuario refresca la búsqueda → se repite desde el paso 2.
- *4b.* El Usuario captura host y puerto a mano → se omite el descubrimiento.

**Excepciones**
- *3a.* Ningún nodo responde → se muestra "no se encontraron espacios" con la opción de capturar la dirección manualmente.

**Requerimientos** RF Espacios 1

---

## CU-16 · Unirse a un espacio

| | |
|---|---|
| **Actor principal** | Usuario |
| **Actores secundarios** | Nodo remoto (LAN) |
| **Descripción** | Se conecta a un espacio descubierto y descarga el estado actual del documento. |
| **Precondiciones** | El espacio está visible y el Usuario tiene un `Acceso` válido. |
| **Postcondiciones** | `CanalSync` abierto y documento sincronizado localmente. |
| **Incluye** | CU-15 Descubrir espacios en la LAN |

**Flujo principal**
1. El Usuario elige un espacio de la lista (CU-15).
2. El sistema verifica que exista un `Acceso` para ese usuario.
3. `CanalSync.conectar()` establece el canal con el nodo.
4. El sistema descarga el estado del `Documento`.
5. El sistema abre el editor con el permiso correspondiente.

**Flujos alternativos**
- *2a.* Sin acceso → el Usuario solicita invitación al Propietario (CU-17) y el caso de uso termina.
- *5a.* Permiso `LECTURA` → el editor abre en modo solo lectura.

**Excepciones**
- *3a.* El nodo dejó de responder → se informa y se regresa a la lista.
- *4a.* Se alcanzó el máximo de 5 usuarios simultáneos → se rechaza la conexión indicando el motivo.

**Requerimientos** RF Espacios 1 · RNF Espacios 1

---

## CU-17 · Gestionar accesos y permisos

| | |
|---|---|
| **Actor principal** | Propietario |
| **Descripción** | Invita usuarios al espacio y define si pueden leer o editar. |
| **Precondiciones** | Permiso `PROPIETARIO` sobre el espacio. |
| **Postcondiciones** | Los `Acceso` del espacio quedan actualizados y aplican de inmediato. |

**Flujo principal**
1. El Propietario abre "Gestión de accesos".
2. El sistema lista los usuarios con acceso y su permiso.
3. El Propietario agrega un usuario y le asigna `LECTURA` o `EDICION`.
4. El sistema crea o actualiza el `Acceso`.
5. El sistema notifica el cambio a los nodos conectados.

**Flujos alternativos**
- *3a.* El Propietario cambia el permiso de un usuario ya listado → se actualiza el `Acceso`.
- *3b.* El Propietario revoca un acceso → el usuario pasa a solo lectura o es desconectado.

**Excepciones**
- *3c.* El usuario indicado no existe → se informa y no se crea el acceso.
- *3d.* El Propietario intenta quitarse su propio permiso `PROPIETARIO` → se impide para no dejar el espacio sin dueño.

**Requerimientos** RF Espacios 5 (control de accesos)

---

## CU-18 · Crear documento

| | |
|---|---|
| **Actor principal** | Usuario |
| **Descripción** | Crea un documento nuevo dentro del espacio, eligiendo su tipo (CU-20), que ya no cambia. |
| **Precondiciones** | Acceso con permiso `EDICION` sobre el espacio. |
| **Postcondiciones** | Existe un `Documento` con una `Pagina` inicial vacía. |

**Flujo principal**
1. El Usuario elige "nuevo documento".
2. Captura el nombre y elige el tipo (texto, hoja, presentación o diagrama) y una plantilla (CU-20).
3. El sistema crea el `Documento` con `version` 1 y una `Pagina` vacía.
4. El sistema agrega el documento al `Espacio`.
5. El sistema abre el editor (CU-19).

**Flujos alternativos**
- *2a.* El Usuario parte de una plantilla → el documento se crea con los bloques de la plantilla.

**Excepciones**
- *3a.* Falla al persistir → no se crea el documento y se informa el error.

**Requerimientos** RF Espacios 2

---

## CU-19 · Editar documento en el lienzo

| | |
|---|---|
| **Actor principal** | Usuario |
| **Actores secundarios** | Nodo remoto (LAN) |
| **Descripción** | Crea y manipula bloques —texto, tablas, imágenes y figuras— sobre el lienzo único y dinámico. |
| **Precondiciones** | Documento abierto y permiso `EDICION`. |
| **Postcondiciones** | Los bloques quedan modificados, la operación aplicada localmente y difundida a los demás nodos. |
| **Incluye** | CU-21 Sincronizar edición concurrente |
| **Extendido por** | CU-22 Micro-textos de ayuda · CU-23 Gestionar versiones |

**Flujo principal**
1. El sistema verifica que el permiso sea `EDICION`.
2. El Usuario elige una herramienta del panel superior iconográfico.
3. El Usuario crea o selecciona un `Bloque` sobre el lienzo.
4. El Usuario modifica su contenido, posición, tamaño o estilo.
5. El sistema genera una `Operacion` con el tipo, el `idBloque` y la carga.
6. El sistema incrementa el `RelojVectorial`.
7. `MotorCRDT.aplicarLocal()` aplica el cambio y se ve al instante.
8. El sistema difunde la operación (CU-21).
9. El sistema guarda y crea una nueva `Version`.

**Flujos alternativos**
- *4a.* El Usuario deshace o rehace → se genera la operación inversa y se difunde igual.
- *4b.* El Usuario trabaja sobre una tabla → edita `Celda` con valor o fórmula y el sistema recalcula.
- *4c.* Cada cambio se guarda solo (~250 ms después de dejar de escribir), se envía al servidor y queda en la bitácora de actividad del documento.

**Excepciones**
- *1a.* Permiso `LECTURA` → el editor queda en modo solo lectura y el caso de uso termina.
- *8a.* Sin red → la operación se encola y se reintenta al reconectar (CU-26); la edición local no se interrumpe.

**Requerimientos** RF Espacios 2, 3, 4 · RNF Espacios 2

---

## CU-20 · Elegir el tipo del documento

| | |
|---|---|
| **Actor principal** | Usuario |
| **Descripción** | Al crear un documento se elige su tipo: texto, hoja de cálculo, presentación o diagrama. El tipo **queda fijo**: convertir un documento de un tipo a otro rompería su formato (por ejemplo, una hoja con fórmulas leída como texto). |
| **Tipo** | «include» de CU-18 |
| **Precondiciones** | El Usuario está creando un documento (CU-18). |
| **Postcondiciones** | `Documento.modo` queda guardado y el documento siempre se abre en el editor de ese tipo. |

**Flujo principal**
1. En "Nuevo documento" el Usuario elige el tipo y, si quiere, una plantilla de ese tipo.
2. El sistema crea el `Documento` con ese `modo`.
3. Cada vez que se abre, el sistema muestra el editor del tipo y una etiqueta con el tipo junto al nombre.

**Excepciones**
- *3a.* Un cliente intenta cambiar `_doc.modo` (versión vieja o petición manual) → el servidor descarta ese campo de la operación; el tipo no cambia.

**Requerimientos** RF Espacios 2 · decisión del cliente (oct. 2026): no cambiar el tipo para no romper el formato.

> Las tablas dentro de un documento de texto se editan ahí mismo, celda por celda.

---

## CU-21 · Sincronizar edición concurrente (CRDT)

| | |
|---|---|
| **Actor principal** | Nodo remoto (LAN) |
| **Descripción** | Propaga y fusiona las operaciones de varios usuarios sobre la misma base, garantizando consistencia sin conflictos. |
| **Tipo** | «include» de CU-19 |
| **Precondiciones** | Canal `CanalSync` abierto entre los nodos. |
| **Postcondiciones** | Todos los nodos convergen al mismo estado del documento. |

**Flujo principal**
1. `CanalSync.enviar()` transmite la `Operacion` local a los nodos conectados.
2. Cada nodo receptor la recibe con `CanalSync.alRecibir()`.
3. `MotorCRDT.fusionarRemota()` integra la operación comparando `RelojVectorial`.
4. El nodo receptor repinta el lienzo.
5. El estado resultante es idéntico en todos los nodos, sin importar el orden de llegada.

**Flujos alternativos**
- *3a.* Dos usuarios editan el mismo bloque a la vez → el CRDT resuelve por reglas deterministas; **no** se pierde el trabajo de ninguno ni se pregunta al usuario.
- *3b.* Llega una operación ya aplicada → se descarta por idempotencia.
- *3c.* Llega una operación sobre un bloque eliminado → se descarta según la regla de precedencia.

**Excepciones**
- *1a.* Se cae el canal → las operaciones se encolan y se reenvían al reconectar (CU-26).
- *4a.* Se supera la latencia de 1500 ms → se registra para diagnóstico; la consistencia no se ve afectada.

**Requerimientos** RF Espacios 4 · RNF Espacios 1, 2

---

## CU-22 · Consultar micro-textos de ayuda

| | |
|---|---|
| **Actor principal** | Usuario |
| **Descripción** | Muestra una explicación breve de cada herramienta al mantener el cursor encima o hacer una pulsación prolongada. |
| **Tipo** | «extend» sobre CU-19 |
| **Precondiciones** | El editor está abierto. |
| **Postcondiciones** | Se muestra el micro-texto; no se modifica el documento. |

**Flujo principal**
1. El Usuario mantiene el cursor sobre un ícono, o hace una pulsación prolongada en pantalla táctil.
2. El sistema despliega el micro-texto explicativo de esa herramienta.
3. El micro-texto se oculta al retirar el cursor o soltar.

**Requerimientos** RF Espacios 3

---

## CU-23 · Gestionar versiones

| | |
|---|---|
| **Actor principal** | Usuario |
| **Descripción** | Consulta el historial del documento (versiones y **actividad**: quién cambió qué, desde qué dispositivo y cuándo) y restaura una versión anterior. |
| **Tipo** | «extend» sobre CU-19 |
| **Precondiciones** | El documento tiene al menos una versión guardada. |
| **Postcondiciones** | Se muestra el historial; si se restaura, el documento vuelve a ese estado **como una versión nueva**. |

**Flujo principal**
1. El Usuario abre el historial del documento.
2. `RepositorioDocumentos.historial()` devuelve las `Version` con número, autor y fecha.
3. El Usuario elige una versión y la previsualiza.
4. El Usuario confirma la restauración.
5. El sistema aplica ese estado **como una versión nueva**, sin borrar las intermedias.
6. El sistema difunde el cambio a los nodos conectados (CU-21).

**Flujos alternativos**
- *3a.* El Usuario solo consulta y cierra → no hay cambios.

**Excepciones**
- *4a.* Permiso `LECTURA` → puede consultar y previsualizar, pero no restaurar.
- *5a.* Otro usuario está editando → se le notifica el salto de versión para evitar confusión.

**Requerimientos** RF Espacios 5 (gestión de versiones)

---

## CU-24 · Administrar almacenamiento

| | |
|---|---|
| **Actor principal** | Propietario |
| **Descripción** | Consulta el espacio ocupado, depura versiones antiguas y ajusta preferencias de guardado. |
| **Precondiciones** | Permiso `PROPIETARIO`. |
| **Postcondiciones** | El almacenamiento del espacio queda ajustado según lo indicado. |

**Flujo principal**
1. El Propietario abre "Almacenamiento".
2. El sistema muestra el consumo por documento y por historial de versiones.
3. El Propietario depura versiones antiguas o ajusta cuántas conservar.
4. El sistema libera el espacio y confirma el resultado.

**Flujos alternativos**
- *3a.* El Propietario exporta un documento antes de depurarlo → se genera la copia y luego se depura.

**Excepciones**
- *4a.* Un documento está abierto por otro usuario → se posterga su depuración y se informa.

**Requerimientos** RF Espacios 5 · RNF Espacios 1

---

## CU-25 · Conectar dispositivo Android

| | |
|---|---|
| **Actor principal** | Usuario |
| **Actores secundarios** | Dispositivo Android, Nodo remoto (LAN) |
| **Descripción** | Empareja la aplicación Android con un espacio de la red local para editar desde el celular o la tableta. |
| **Precondiciones** | Sesión iniciada en la app y espacio con la conexión activa (CU-14) en la misma red. |
| **Postcondiciones** | El dispositivo queda sincronizado con el espacio. |

**Flujo principal**
1. El Usuario abre la app Android e inicia sesión (CU-02).
2. El Usuario elige "conectar a un espacio en la red".
3. La app busca los nodos anunciados (CU-15).
4. El Usuario elige el espacio y confirma el emparejamiento con el código del espacio.
5. `ClienteAndroid.emparejar()` abre el `CanalSync`.
6. La app descarga el estado del documento y muestra el lienzo.

**Flujos alternativos**
- *3a.* El Usuario captura host y puerto a mano → se omite el descubrimiento.
- *4a.* Código incorrecto → se solicita de nuevo.

**Excepciones**
- *3b.* El dispositivo está en otra red o la Wi-Fi está apagada → se ofrece el modo sin conexión (CU-26).
- *5a.* Se alcanzó el límite de 5 usuarios simultáneos → se rechaza la conexión indicando el motivo.

**Requerimientos** RF Espacios 1, 4 · Requerimientos de software (Android 7 / API 24 en adelante)

---

## CU-26 · Trabajar sin conexión y resincronizar

| | |
|---|---|
| **Actor principal** | Usuario |
| **Actores secundarios** | Dispositivo Android, Nodo remoto (LAN) |
| **Descripción** | Permite seguir editando una copia local cuando no hay red, y fusionar los cambios al reconectarse. |
| **Tipo** | «extend» sobre CU-21 |
| **Precondiciones** | Existe una copia local del documento en el dispositivo. |
| **Postcondiciones** | Las operaciones pendientes se fusionan y el documento converge con los demás nodos. |

**Flujo principal**
1. El sistema detecta que no hay red disponible.
2. El sistema abre la copia local del documento e informa el estado "sin conexión".
3. El Usuario edita normalmente; cada `Operacion` se aplica en local y se **encola**.
4. El sistema detecta que la red volvió.
5. El sistema envía en orden las operaciones encoladas.
6. El sistema recibe las operaciones que ocurrieron mientras estaba desconectado.
7. `MotorCRDT.fusionarRemota()` fusiona ambos lados y el documento converge.
8. El sistema informa que la sincronización terminó.

**Flujos alternativos**
- *3a.* El Usuario cierra la app → la cola persiste en disco y se reenvía en el siguiente arranque.
- *6a.* El documento fue eliminado mientras estaba sin conexión → se ofrece guardarlo como documento nuevo.

**Excepciones**
- *5a.* El espacio ya no está visible en la red → la cola se conserva y se reintenta más tarde.
- *7a.* El permiso del usuario cambió a `LECTURA` mientras no había conexión → las operaciones encoladas se rechazan y se le ofrece exportarlas como copia propia.

**Requerimientos** RF Espacios 4 · Misión y visión (operar sin depender de Internet)


---

## CU-28 · Importar archivo

| | |
|---|---|
| **Actor principal** | Usuario |
| **Descripción** | Integra un archivo existente al espacio colaborativo, convirtiéndolo a un `Documento` editable. |
| **Tipo** | «extend» sobre CU-18 |
| **Precondiciones** | Permiso `EDICION` sobre el espacio y formato soportado. |
| **Postcondiciones** | Existe un `Documento` con los bloques equivalentes al archivo original. |

**Flujo principal**
1. El Usuario elige "importar archivo".
2. El Usuario selecciona el archivo de su equipo.
3. El sistema identifica el `FormatoArchivo` por extensión y contenido.
4. `ConversorFormato.importar()` traduce el archivo a `Pagina` y `Bloque`.
5. El sistema abre el documento resultante en el modo correspondiente.
6. El sistema difunde el documento nuevo a los nodos conectados.

**Flujos alternativos**
- *4a.* El archivo trae elementos sin equivalencia directa → se importan como bloque libre y se avisa qué se aproximó.

**Excepciones**
- *3a.* Formato no soportado → se informa y se listan los formatos válidos.
- *4b.* Archivo corrupto o protegido con contraseña → se cancela la importación sin crear el documento.

**Requerimientos** RF Cuentas 4 (consulta e integración de archivos) · Objetivo específico "amplia compatibilidad en diversos formatos" · Antecedente "carece de formatos de archivo enriquecidos"

---

## CU-29 · Exportar documento

| | |
|---|---|
| **Actor principal** | Usuario |
| **Descripción** | Descarga una copia en un formato universal: Word (.docx) para texto, Excel (.xlsx, con fórmulas) para hojas, PowerPoint (.pptx) para presentaciones y diagramas, además de PDF, PNG, SVG, CSV, HTML, Markdown y .nom. |
| **Tipo** | «extend» sobre CU-19 |
| **Precondiciones** | Documento abierto (basta permiso `LECTURA`). |
| **Postcondiciones** | Se genera el archivo en el formato elegido; el documento original no cambia. |

**Flujo principal**
1. El Usuario elige "exportar".
2. El Usuario elige "Descargar" (el formato de Office de su tipo) o "Exportar en otro formato".
3. `ConversorFormato.exportar()` genera el archivo.
4. El sistema entrega el archivo al Usuario.

**Flujos alternativos**
- *2a.* El Usuario exporta solo una página o la selección → se exporta ese subconjunto.

**Excepciones**
- *3a.* El formato destino no admite algún elemento → se exporta con la aproximación más cercana y se informa.
- *3b.* Sin espacio en disco → se cancela y se informa.
- *3c.* En la app Android el archivo se guarda en Descargas.

**Requerimientos** Objetivo general "compatibilidad con formatos de uso libre"
