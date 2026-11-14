---
titulo: Sin Internet: cómo funciona
descripcion: Las tres formas de trabajar juntos sin Internet y qué pasa al volver la red.
orden: 10
aplica: Navegador, App Android, Teléfono que comparte
actualizado: 2026-11-13
version: 0.13.0
---
NOM-COLAB está hecho para **colaborar donde no hay Internet**. Hay tres situaciones:

## 1. Tu equipo, solo

Si ya entraste antes con Internet, la app o la página guardada abren sin red con lo que tenías:
editas la última versión de cada documento y puedes crear documentos nuevos. Todo se queda
**cifrado en tu equipo** y se envía al volver la red. Ver
[Crear sin Internet](ayuda:sin-internet/crear-sin-internet).

## 2. El mismo Wi-Fi que una computadora que comparte

Una computadora del salón corre NOM-COLAB (la carpeta `2-PAGINA-Servidor`) y los demás entran por
su dirección (`http://192.168.1.20:8080`). Esa computadora tiene sus propias cuentas y documentos.

## 3. Un teléfono que comparte

Un teléfono con la app se vuelve el servidor: los demás se conectan a su Wi-Fi o a su **punto de
acceso** (sin router ni Internet) y entran con el **QR o el código** de un espacio. En el teléfono
que comparte **no hay cuentas con contraseña**: quien no tiene Internet entra con un
[alias al azar](ayuda:sin-internet/alias), y quien sí tiene Internet puede
[entrar con su cuenta](ayuda:sin-internet/con-mi-cuenta). Paso a paso:
[el teléfono que comparte](ayuda:sin-internet/telefono-servidor).

## Al volver Internet

Lo que cambiaste sin conexión se sube tal cual **si nadie más cambió el documento mientras tanto**.
Si alguien más lo cambió, se abre una **rama** y el original no se toca. Ver
[Qué pasa al volver Internet](ayuda:sin-internet/al-volver).
