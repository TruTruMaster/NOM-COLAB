# NOM — todo el proyecto NOM-COLAB listo para usar

Equipo 6 "WACK" · CECyT 9 · 5IM7

| Carpeta | Qué es | Qué hacer |
|---|---|---|
| **`ENTREGA/`** | **Los 2 PDF para entregar:** la presentación y el documento del módulo web (BD + Azure + roles) | Entregar ambos |
| `1-ENTREGA-Diagramas-de-Actividades/` | **PDF para entregar** (y el mismo en .docx), las 7 imágenes sueltas y los editables de draw.io | Entregar `Diagrama de Actividades NOM-COLAB.pdf` |
| `2-PAGINA-Servidor/` | La página completa (servidor + interfaz), **con Java incluido** | Windows: doble clic en `INICIAR-Windows.bat` · Linux: `./INICIAR-Linux.sh` |
| `3-APP-Android/` | `NOM-COLAB.apk` (Android 7 en adelante) | Pasarla al celular e instalarla |
| `4-CODIGO/` | Todo el código fuente, diagramas UML y documentación | Para revisar o seguir desarrollando |
| `5-PRESENTACION/` | Imágenes de la presentación (diagramas y capturas). | Presentar |
| `CREDENCIALES-AZURE.txt` | Usuario administrador y contraseña de la base de datos de Azure. **Privado** | No compartir ni subir |
| `LOG.md` | Registro de todo lo que se hizo | — |

## En Internet (Azure)

**https://nomcolab-wack.azurewebsites.net** — el módulo de cuentas conectado a Azure SQL
Database, con roles (Administrador / Usuario). Cómo se subió y cómo hacer la demo:
`4-CODIGO/docs/DESPLIEGUE-AZURE.md`. Ábrelo unos minutos antes de presentar: la primera
entrada tras un rato sin uso tarda ~1 min porque el plan gratuito se duerme.

## Usarlo en 3 pasos

1. **En la computadora que comparte** (la del profesor o un compañero): abrir
   `2-PAGINA-Servidor` y ejecutar `INICIAR-Windows.bat` (o `INICIAR-Linux.sh`).
   No hay que instalar nada: el Java ya viene dentro. La página se abre sola en
   el navegador. **No cierres la ventana negra** mientras trabajen.
   - Si Windows pregunta por el **Firewall**, elige *Permitir acceso* en redes
     privadas; si no, los demás equipos no podrán entrar.
   - La ventana muestra la dirección para los demás, por ejemplo
     `Desde la red: http://192.168.1.20:8080`.
2. **En las demás computadoras** de la misma red: abrir esa dirección en el
   navegador. También funciona en el navegador del celular.
3. **En Android:** instalar `NOM-COLAB.apk` (permite "instalar apps de origen
   desconocido" si lo pide). Con el celular en el **mismo Wi-Fi**, la app
   encuentra sola el servidor y se conecta; si hay varios, eliges uno. Si la
   red bloquea el descubrimiento, escribe la dirección (`192.168.1.20:8080`).

### Sin cuenta
En la pantalla de inicio está el botón **"Usar sin cuenta"**. En la app Android también aparece
cuando no hay servidor, así que la app funciona sola en el teléfono. Sin cuenta se pueden crear,
editar, importar y exportar documentos en los 4 modos, pero:
- se guardan **solo en ese navegador o teléfono**;
- **si se borran la caché o los datos del navegador (o de la app), se pierden**, salvo que se hayan
  descargado (menú **… → Descargar copia (.nom)**);
- no se comparten ni tienen historial de versiones.

Si después se crea una cuenta, esos documentos aparecen en Inicio como **"En este equipo (sin subir)"**
y con **… → Subir a un espacio** quedan guardados en el servidor.

### Con cuenta
**Crear cuenta → Nuevo espacio → Activar conexión → Nuevo documento.**
Para que otra persona entre a tu espacio, en el espacio usa **Compartir** y
escribe su nombre de usuario (o acepta su solicitud).

Los datos se guardan en `2-PAGINA-Servidor/datos/`: usuarios, roles y sesiones en la base
de datos H2 (`nom-db.mv.db`); espacios, documentos y versiones en JSON. Para empezar desde
cero, borra esa carpeta. **La primera cuenta que se registra queda como Administrador** y ve
"Administrar usuarios" (cambiar roles, desbloquear cuentas).
