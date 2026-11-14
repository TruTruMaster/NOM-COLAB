---
titulo: «Conexión sin cifrar (red local)»
descripcion: Por qué aparece este aviso en la red del salón y qué hacer.
orden: 60
aplica: Navegador, App Android, Teléfono que comparte
actualizado: 2026-11-13
version: 0.13.0
---
En la red del salón se entra por una dirección como `http://192.168.1.20:8080`. Ahí no se puede
dar un certificado de confianza, así que la conexión **no va cifrada**: alguien conectado al mismo
Wi-Fi podría ver lo que se envía (también la contraseña al iniciar sesión en una computadora que
comparte).

Qué hacer:

- Úsalo solo en un **Wi-Fi de confianza** (el del salón o la casa), o conéctate al **punto de acceso
  del teléfono que comparte**, que solo usa tu equipo.
- En el teléfono que comparte no se escribe contraseña: se entra con [alias](ayuda:sin-internet/alias),
  o con tu cuenta por medio de un pase (tu contraseña va directo y cifrada a la nube).
- Con Internet, usa la dirección **https** de la nube.
