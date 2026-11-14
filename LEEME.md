# NOM — todo el proyecto NOM-COLAB listo para usar

Equipo 6 "WACK" · CECyT 9 · 5IM7

| Carpeta | Qué es | Qué hacer |
|---|---|---|
| **`ENTREGA/`** | **Los PDF para entregar:** el documento del módulo web (base de datos + Azure + seguridad con roles) y el plan de pruebas `5IM7_WACK_PP.pdf` | Entregarlos |
| `1-ENTREGA-Diagramas-de-Actividades/` | **PDF para entregar** (y el mismo en .docx), las 7 imágenes sueltas y los editables de draw.io | Entregar `Diagrama de Actividades NOM-COLAB.pdf` |
| `2-PAGINA-Servidor/` | La página completa (servidor + interfaz), **con Java incluido** | Windows: doble clic en `INICIAR-Windows.bat` · Linux: `./INICIAR-Linux.sh` |
| `3-APP-Android/` | `NOM-COLAB.apk` (Android 7 en adelante) | Pasarla al celular e instalarla |
| `4-CODIGO/` | Todo el código fuente, diagramas UML y documentación | Para revisar o seguir desarrollando |
| `5-DOCUMENTO-MODULO/` | Fuentes del PDF del módulo: `fuentes/modulo.html`, sus imágenes y `fuentes/imprimir.py`, que lo vuelve a generar en `ENTREGA/` | Solo si se cambia el documento |
| `6-PLAN-DE-PRUEBAS/` | Fuentes del plan de pruebas: `fuentes/plan.html`, `fuentes/imprimir.py` (lo genera en `ENTREGA/5IM7_WACK_PP.pdf`), `fuentes/prueba_limites.py` y `registros/` con la salida de cada suite | Solo si se cambia el plan |
| `CREDENCIALES-AZURE.txt` | Contraseñas de la base de Azure (administrador y usuarios con rol) y cuentas de prueba. **Privado** | No compartir ni subir |
| `LOG.md` | Registro de todo lo que se hizo | — |

## En Internet (Azure)

**https://nomcolab-wack.azurewebsites.net** — el módulo de cuentas conectado a Azure SQL
Database, con seguridad con roles: en la base (la página entra como `nomcolab_app`, con el rol
`rol_nomcolab_app`, sin poder tocar las tablas) y en cada espacio (Propietario / Puede editar /
Solo lectura). Cómo se subió y cómo hacer la demo:
`4-CODIGO/docs/DESPLIEGUE-AZURE.md`. Normalmente está apagado para no gastar: antes de presentar,
prenderlo con `nomcolab` → 1 Azure → 1 Prender (abre la base y despierta la página; la primera
entrada tras un rato sin uso tarda ~1 min porque el plan gratuito se duerme). Al terminar,
`nomcolab` → 1 Azure → 2 Apagar.

## En Internet desde un servidor propio (la Raspberry Pi)

**https://nomcolab.dpdns.org** — la misma página, corriendo en una Raspberry Pi 5 que está siempre
prendida y publicada gratis con un túnel de Cloudflare (sin abrir puertos). La app Android la usa
como "En Internet". Cada cuenta tiene un límite de almacenamiento a la vista (200 MB) y solo guarda
documentos de NOM-COLAB, comprimidos. Respaldo diario en la Pi y una copia diaria en la laptop.

```
ssh pi5 doas nomcolab-pi estado      # servicios, túnel, respaldo, temperatura
ssh pi5 doas nomcolab-pi actualizar  # pone el jar nuevo (antes: copiarlo a /home/user/nom-colab.jar.nuevo)
```

Azure, la Raspberry y un servidor en el salón son independientes (cada uno tiene sus cuentas y
documentos). Cómo funciona, respaldos e instalación: `4-CODIGO/docs/SERVIDOR-PROPIO.md`.

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

### Sin computadora: el teléfono es el servidor
En Android 8 o más reciente, en **"Conecta con tu red" → Usar este teléfono como servidor →
Encender**. Ese teléfono guarda los espacios y los documentos (no tiene cuentas con contraseña) y
los demás entran:
- con la app, en el mismo Wi-Fi: **Buscar en la red** (aparece el nombre del teléfono);
- con el navegador (computadora u otro celular): la dirección que muestra la app, por ejemplo
  `http://192.168.0.232:8080` (botón **Compartir** para mandarla por WhatsApp o correo).

Quien llega **sin Internet** entra con un **alias al azar** (no escribe nada); quien **sí tiene
Internet** entra con su cuenta de la nube y la app le da un pase firmado de 10 minutos para el
teléfono. Si dos personas cambian el mismo documento mientras una estaba sin conexión, lo de esa
persona queda en una **rama** y el original no se toca: después se compara y se fusiona.

Sin router: activa el **punto de acceso** de ese teléfono y conecta a los demás a esa red.
Mientras está encendido aparece una notificación con la dirección y el botón **Detener**; gasta
algo más de batería. Se apaga en *Este dispositivo → Servidor en este teléfono*.

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
**Crear cuenta → Nuevo espacio → Nuevo documento.** Al crear la cuenta sale un **código de
recuperación**: guárdalo (sirve si se olvida la contraseña).
Para que otras personas entren a tu espacio usa **Invitar**: **Crear código** da un código de 8
letras y un QR (se puede dejar entrar **con apodo, sin cuenta**, por 1 hora, 1 día, 1 semana o 30
días, y anularlo cuando quieras); o escribe el nombre de usuario de alguien que ya tiene cuenta.
Quien tenga el código lo escribe en **Tengo un código de invitación** o escanea el QR con la cámara.

Cada espacio tiene su **chat** (con imágenes y archivos de hasta 2 MB). Al crear un espacio se puede
marcar **Cifrado de extremo a extremo**: el nombre, los documentos y el chat se cifran en el equipo
de cada miembro y ni el servidor los puede leer (no se puede quitar después y no hay búsqueda dentro
del contenido).

Los datos se guardan **cifrados** en `2-PAGINA-Servidor/datos/`: usuarios y sesiones en la base de
datos H2 (`nom-db.mv.db`); espacios, documentos y versiones en JSON. La llave está aparte, en
`2-PAGINA-Servidor/datos-llaves/reposo.key`: **sin ella no se abre nada**, así que respáldala en
otro lugar. Para empezar desde cero, borra las dos carpetas. **No hay administrador:** cada cuenta controla solo sus espacios y documentos. El
propietario de un espacio decide quién entra, cambia a cada miembro entre *Puede editar* y
*Solo lectura*, o le quita el acceso.

## Licencia

El código es software libre bajo la **GPL-3.0** (archivo `LICENSE`). Las bibliotecas y fuentes de
terceros conservan sus licencias (ver `4-CODIGO/README.md`, sección Licencia).
