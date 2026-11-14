---
titulo: Espacios cifrados de extremo a extremo
descripcion: Espacios donde ni el servidor puede leer lo que escriben sus miembros.
orden: 55
aplica: Navegador, App Android
actualizado: 2026-11-13
version: 0.13.0
---
Al crear un espacio puedes marcar **Cifrado de extremo a extremo**. Entonces el contenido
(texto, celdas, figuras, comentarios, el chat y los nombres de los documentos) se cifra **en tu
equipo** antes de enviarse, con una llave que solo tienen los miembros. El servidor guarda y
reparte lo cifrado sin poder leerlo.

## Cómo llega la llave a cada quien

- Cada cuenta tiene un **par de llaves**; la privada va protegida con tu contraseña y también con tu
  código de recuperación (si restableces la contraseña, no pierdes tus espacios).
- Cuando el propietario agrega a alguien por su nombre, la app de un miembro que ya tiene la llave
  se la envía cifrada para esa persona (la próxima vez que abre el espacio). Mientras, esa persona
  ve un aviso de que a su equipo le falta la llave.
- Un **código o QR** de invitación lleva la llave después del `#`, la parte de la dirección que el
  navegador nunca manda al servidor.

## Lo que cambia

- La búsqueda **dentro del contenido** no está disponible (el servidor no lo puede leer); los
  nombres sí se ven y se ordenan en tu equipo.
- Un documento cifrado no se copia ni se mueve a otro espacio: descárgalo (`.nom`) e impórtalo allá.
- El enlace para ver un documento sin cuenta y la pantalla del proyector llevan la llave del
  documento en la dirección.
- El servidor todavía ve **quién** está en qué espacio, los tamaños y las horas, y la estructura del
  documento (cuántos párrafos y celdas, quién escribió cada parte), pero no lo que dicen.
- Si pierdes tu contraseña **y** tu código de recuperación, nadie puede recuperar esos espacios.
