---
titulo: Aviso de privacidad integral
descripcion: Qué datos personales trata NOM-COLAB, para qué, cómo los protege y cómo ejercer tus derechos.
orden: 10
aplica: Navegador, App Android, Teléfono que comparte
actualizado: 2026-11-13
version: 2026-11-13
---
!> **Proyecto escolar.** Este texto lo redactó el equipo con base en la Ley Federal de Protección de Datos Personales en Posesión de los Particulares publicada en el Diario Oficial de la Federación el 20 de marzo de 2025 (en vigor desde el 21 de marzo de 2025). No es asesoría legal: está pendiente la revisión del profesor y del texto vigente en el DOF.

## 1. Quién es el responsable {#responsable}

El responsable del tratamiento de tus datos personales es el **equipo 6 «WACK»** del grupo 5IM7
del CECyT 9 «Juan de Dios Bátiz» del Instituto Politécnico Nacional, en la Ciudad de México, que
desarrolla y opera NOM-COLAB como proyecto escolar. Domicilio para oír y recibir notificaciones: el
medio de contacto de la sección [Cómo ejercer tus derechos](#derechos).

Este aviso aplica a la nube de NOM-COLAB ([nomcolab.dpdns.org](https://nomcolab.dpdns.org)), a la versión en Azure y a
la app de Android. Una computadora o un teléfono que comparte en un salón **lo opera quien lo
enciende** (la escuela, el maestro o un alumno): es esa persona quien responde por lo que se guarda
en su equipo.

## 2. Qué datos personales tratamos {#datos}

| Dato | Para qué | Dónde se guarda |
|---|---|---|
| Nombre de usuario y, si lo das, escuela o grupo | Identificarte ante los miembros de tus espacios | Servidor |
| Huella de la contraseña y del código de recuperación (PBKDF2 con sal) | Comprobar que eres tú; nunca guardamos la contraseña | Servidor |
| Color, preferencias (tema, letra, autoguardado) | Mostrar la app como la configuraste | Servidor y tu equipo |
| Versión de los términos que aceptaste y fecha | Saber qué aceptaste | Servidor |
| Intentos fallidos y bloqueos | Proteger tu cuenta contra quien adivina contraseñas | Servidor |
| Sesiones abiertas (identificador y vencimiento) | Mantenerte dentro sin escribir la contraseña cada vez | Servidor y tu equipo |
| Espacios, permisos, enlaces de invitación, documentos, versiones, comentarios, avisos, chat y bitácora de actividad (quién cambió qué, cuándo y desde qué tipo de dispositivo) | Dar el servicio: guardar y compartir tu trabajo con tu equipo | Servidor |
| Alias al azar y la huella de la llave de tu equipo | Que vuelvas a ser el mismo alias en un teléfono que comparte | El teléfono que comparte |
| Ramas (qué tenías al volver la conexión) | No perder lo que editaste sin Internet | Servidor |
| La dirección IP de tu conexión | Limitar intentos de contraseña y cuentas nuevas | **Solo en memoria**, se olvida sola; no se escribe en disco ni en la bitácora |
| Copias de tus documentos y cambios por enviar | Abrirlos sin Internet | Tu equipo, cifrados con tu contraseña |

**No pedimos** correo, nombre real, teléfono, fecha de nacimiento ni ubicación. **No tratamos datos
personales sensibles** a propósito; lo que tú escribas en tus documentos es tuyo y lo ven solo los
miembros de tus espacios: evita escribir ahí datos sensibles tuyos o de otras personas.

## 3. Para qué los usamos (finalidades) {#finalidades}

Únicamente para **darte el servicio**: crear tu cuenta, guardar y sincronizar tus documentos,
compartirlos con quien invites, mostrar quién escribió cada parte, proteger las cuentas y hacer
respaldos. Todas son necesarias para el servicio.

**No hay finalidades secundarias**: no usamos tus datos para publicidad, no los vendemos, no hacemos
perfiles ni estadísticas propias con ellos, y no los usamos para entrenar inteligencia artificial.
Por eso no te pedimos consentimiento para otras finalidades.

## 4. Quién más ve los datos {#terceros}

No compartimos tus datos con nadie para sus propios fines. Por la forma en que funciona el
servicio, estos proveedores procesan el tráfico o guardan datos por nosotros:

- **Cloudflare** (el túnel por el que se llega a la nube): ve el tráfico cifrado y la dirección IP.
- **Microsoft Azure**, solo si usas la versión en Azure.
- **GitHub**, cuando descargas la app de Android.

## 5. Dónde están y cuánto tiempo {#conservacion}

- La nube es una computadora pequeña (Raspberry Pi) del equipo, en México. Los respaldos diarios se
  guardan **14 días** en ella y una copia en una computadora del equipo (30 días).
- Tus datos se guardan **mientras exista tu cuenta**. Al borrarla, se borran del servidor en ese
  momento y de los respaldos cuando estos se borran solos (a más tardar en 14 días; 30 en la copia).
- Lo que está en tu equipo se queda hasta que lo borres.

## 6. Cómo los protegemos {#seguridad}

- **En tu equipo**: cifrados con una llave que se abre con tu contraseña.
- **En el camino**: HTTPS por Internet. En la red del salón la conexión no va cifrada y la app lo
  avisa ([Conexión sin cifrar](ayuda:cuentas/conexion-sin-cifrar)).
- **En el servidor**: cifrado en reposo (AES-256-GCM) de documentos, cuentas y respaldos. Quien
  administra el servidor tiene esa llave.
- **Espacios cifrados de extremo a extremo**: si así lo creas, su contenido se cifra en tu equipo y
  ni el servidor puede leerlo; el servidor sí sabe quién está en qué espacio, los tamaños y las horas.

Más en [Seguridad](legal:seguridad).

## 7. Cómo limitar el uso de tus datos {#limitar}

- Usa NOM-COLAB [sin cuenta](ayuda:empezar/sin-cuenta) o con un alias en la red del salón.
- No te unas a espacios que no quieras: son cerrados y solo entras si te invitan.
- Borra las copias de tu equipo en **Este equipo**, sal de un espacio o borra tus documentos.
- [Borra tu cuenta](ayuda:cuentas/borrar-la-cuenta) cuando quieras.

## 8. Cómo ejercer tus derechos (ARCO) y revocar tu consentimiento {#derechos}

Tienes derecho a **acceder** a tus datos, **rectificarlos**, **cancelarlos** y **oponerte** a su
tratamiento, y a revocar tu consentimiento. Muchas cosas las puedes hacer tú mismo, al instante:

- **Acceso**: **Ajustes → Descargar los datos de mi cuenta** (JSON) y **Descargar todo** de cada espacio.
- **Rectificación**: cambia tus preferencias y tus documentos; el nombre de usuario no se cambia
  (crea otra cuenta si lo necesitas).
- **Cancelación y revocación**: **Borrar mi cuenta**.

Para todo lo demás, escríbenos indicando tu nombre de usuario, qué derecho quieres ejercer y qué
datos; te pediremos comprobar que eres la persona dueña de la cuenta (por ejemplo, iniciando
sesión). Respondemos en un máximo de **20 días** y, si procede, lo hacemos en los **15 días**
siguientes, sin costo.

{{contacto}}

Si no estás de acuerdo con la respuesta, puedes acudir a la **Secretaría Anticorrupción y Buen
Gobierno**, autoridad encargada de la protección de datos personales en posesión de los particulares.

## 9. Menores de edad {#menores}

NOM-COLAB no pide la edad. Los espacios son **cerrados**: solo se entra por invitación de su
propietario. Cada persona decide si se une a un grupo de trabajo; **si eres menor de edad, tus
padres o tutores son responsables** de que uses NOM-COLAB y de los espacios a los que te unes.

## 10. Cookies {#cookies}

No usamos cookies. Lo que guardamos en tu navegador está en [Cookies y almacenamiento](legal:almacenamiento).

## 11. Cambios a este aviso {#cambios}

Si cambiamos este aviso, se publica aquí con su nueva fecha y, la próxima vez que entres, la app te
pide **leerlo y aceptarlo** antes de seguir. Versión vigente: 13 de noviembre de 2026.
