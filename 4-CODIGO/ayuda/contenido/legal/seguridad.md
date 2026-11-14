---
titulo: Seguridad
descripcion: Cómo protegemos tus datos y cómo reportar una falla.
orden: 80
aplica: Navegador, App Android, Teléfono que comparte
actualizado: 2026-11-13
version: 2026-11-13
---
## Cómo protegemos tus datos

- Contraseñas guardadas solo como huella (PBKDF2-HMAC-SHA256 con sal); bloqueo por intentos fallidos
  desde cada red y tope de cuentas nuevas por hora.
- Sesión en una cabecera (sin cookies); el canal en vivo se abre con un boleto de un solo uso.
- La página solo ejecuta programas del propio servidor (política de contenido) y no se deja meter
  dentro de otra página.
- Ninguna otra página de Internet puede usar la API desde el navegador de alguien (CORS cerrado).
- Cifrado en tu equipo, en el camino (HTTPS) y en el disco del servidor; espacios cifrados de
  extremo a extremo.
- Sin Internet no hay cuentas que suplantar: alias al azar, y pases firmados de un solo uso para
  quien sí tiene Internet.
- Cientos de pruebas automáticas de seguridad en cada versión.

## Lo que todavía no cubre

- En la red del salón la conexión no va cifrada (ver [Conexión sin cifrar](ayuda:cuentas/conexion-sin-cifrar)).
- Quien administra el servidor puede leer los espacios que no son de extremo a extremo.
- Es un proyecto escolar sin auditoría externa.

## Reportar una falla

Si encuentras una falla de seguridad, **no la uses ni la publiques**: avísanos en privado y la
arreglamos.

{{contacto}}

También está en [/.well-known/security.txt](archivo:.well-known/security.txt).
