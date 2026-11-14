---
titulo: Cookies y almacenamiento en tu equipo
descripcion: No usamos cookies; esto es lo que se guarda en tu navegador o en la app.
orden: 50
aplica: Navegador, App Android, Teléfono que comparte
actualizado: 2026-11-13
version: 2026-11-13
---
**No usamos cookies**, ni nuestras ni de otros. La sesión viaja en una cabecera de cada petición.

Lo que NOM-COLAB guarda en tu navegador (o dentro de la app):

| Dónde | Qué | Cifrado |
|---|---|---|
| `localStorage` | La sesión (para no escribir la contraseña cada vez), el servidor elegido en la app, tus preferencias de pantalla, los alias de cada espacio | No (lo puede leer quien use este navegador) |
| IndexedDB («bóveda») | Copias de tus documentos, cambios por enviar, documentos solo de este equipo, una copia de la sesión | **Sí**, con una llave que se abre con tu contraseña |
| Caché del service worker | Los archivos de la página (no tus documentos), para abrir sin Internet | No contiene datos tuyos |

**Cómo borrarlo**: en **Este equipo** borra las copias; **Cerrar sesión** borra las copias de
consulta; para borrar todo, borra los datos del sitio en tu navegador (o los datos de la app en
Ajustes de Android). Lo que no se haya enviado se perdería.

La nube de NOM-COLAB pasa por Cloudflare; si llegara a insertar su script de estadísticas, la
página lo bloquea.
