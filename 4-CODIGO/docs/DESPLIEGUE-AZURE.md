# NOM-COLAB en Azure — módulo web conectado a la base de datos, con permisos por espacio

**Página:** https://nomcolab-wack.azurewebsites.net

Lo que pidió el profesor: *un módulo de la programación web conectado a la base de
datos y subido a Azure; la seguridad se aplica con roles*. El módulo es **Gestión de
cuentas** (registro, inicio de sesión, sesiones y preferencias) y la seguridad con roles va en
dos niveles:

- **En la base de datos** (como la práctica 7, usuarios y privilegios en Oracle): la página no
  entra con el administrador del servidor, sino con `nomcolab_app`, que recibe sus privilegios
  por el rol `rol_nomcolab_app` (solo datos, nada de estructura). Un segundo rol,
  `rol_nomcolab_consulta` (usuario `nomcolab_lector`), solo lee y no ve las contraseñas.
- **En la aplicación**: los roles de cada espacio (Propietario, Puede editar, Solo lectura).

No hay un administrador general: cada cuenta controla solo sus espacios y sus documentos.
(Hasta el 23 de octubre de 2026 existía un rol ADMINISTRADOR con la pantalla "Administrar
usuarios"; se quitó porque ninguna persona debe poder ver o manejar las cuentas de las demás.)

## Arquitectura

```
Navegador / celular / app Android
        │  HTTPS (solo HTTPS)
        ▼
Azure App Service  nomcolab-wack   (Linux, Java 21, plan F1 gratuito)
  Spring Boot: API /api/cuentas, /api/espacios, /api/documentos + la interfaz web
        │  JDBC cifrado (encrypt=true), como nomcolab_app (rol_nomcolab_app)
        ▼
Azure SQL Database  nomcolab   (serverless, oferta gratuita, se pausa sola)
  tablas: usuario, sesion, preferencias
```

| Recurso | Nombre | Región | Costo |
|---|---|---|---|
| Grupo de recursos | `rg-nomcolab` | westus | — |
| Servidor SQL | `nomcolab-sql-6a073f` | westus | — |
| Base de datos | `nomcolab` (serverless, *free offer*) | westus | $0 (si se agota el límite del mes, se pausa) |
| Plan App Service | `plan-nomcolab` (Linux **F1 Free**) | westus | $0 |
| Web App | `nomcolab-wack` (Java 21) | westus | $0 |

La política de la suscripción *Azure for Students* del IPN solo deja crear recursos en
`westus`, `northcentralus`, `norwayeast`, `swedencentral` y `belgiumcentral` (por eso en la
práctica 4 falló Static Web Apps). Se usó `westus`, la misma región de la práctica 4.

## Cómo se hizo (igual que en la práctica 4, pero con Java y base de datos)

En la práctica 4 se subió una página estática con `az webapp up --html`. Esta vez es un
servidor Java, así que se crea la Web App con runtime Java y se sube el `.jar`:

```bash
az login --use-device-code          # cuenta @alumno.ipn.mx con MFA
cd 4-CODIGO/azure
export SQLPASS='...'                # contraseña de nomadmin
./desplegar.sh crear                # una sola vez
export APP_PASS='...' LECTOR_PASS='...'
./desplegar.sh roles                # tablas, roles y usuarios de la base; la página pasa a nomcolab_app
./desplegar.sh subir                # cada vez que cambie el código (o push a main: GitHub Actions)
```

`desplegar.sh` hace: registrar `Microsoft.Sql` en la suscripción → crear grupo → servidor
SQL → base de datos gratuita → regla de firewall "servicios de Azure" → plan F1 Linux →
Web App Java 21 → solo HTTPS → variables de configuración → `az webapp deploy --type jar`.

## Seguridad con roles en la base de datos

`azure/roles-bd.sql`, aplicado con `./desplegar.sh roles` (el programa `azure/AplicarSql.java`
usa el controlador de SQL Server del propio jar, porque aquí no hay `sqlcmd`):

| Rol | Privilegios | Usuario |
|---|---|---|
| `rol_nomcolab_app` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` en `usuario`, `sesion` y `preferencias`. Sin `CREATE`, `ALTER` ni `DROP` | `nomcolab_app` (la Web App) |
| `rol_nomcolab_consulta` | `SELECT` por columnas en `usuario` (sin `hash_contrasena` ni `sal`) y en `preferencias` | `nomcolab_lector` (consultas) |

Son usuarios contenidos de la base (entran solo a `nomcolab`) y se crean sin privilegios propios:
todo lo reciben del rol. `nomadmin` queda solo para crear y cambiar tablas. Al terminar,
`desplegar.sh roles` prueba los permisos y muestra el resultado; el 23 de octubre de 2026 dio:

- un usuario sin rol: `SELECT` en `usuario` y `sesion` **negado** (error 229);
- `nomcolab_app`: `SELECT`, `UPDATE`, `DELETE` permitidos; `CREATE TABLE`, `ALTER TABLE` y
  `DROP TABLE` **negados** (262, 1088, 3701); el arranque de la página (`schema-sqlserver.sql`)
  funciona porque las tablas ya existen y no intenta crear nada;
- `nomcolab_lector`: lee `nombre`, `empresa`, `creado`; leer `hash_contrasena` o `SELECT *`
  **negado** (230, por columna); leer `sesion` o escribir **negado** (229).

Si cambian las tablas (por ejemplo una columna nueva), se vuelve a correr `./desplegar.sh roles`:
migra con el administrador y vuelve a dar los privilegios. Las contraseñas de los dos usuarios
están en `CREDENCIALES-AZURE.txt` (privado) y la de la página, en las *App settings*.

## Seguridad en la aplicación

- **Sin administrador general.** Ninguna cuenta puede ver la lista de usuarios ni cambiar a
  otras. Lo único que se administra son los espacios, y solo lo hace su propietario.
- **Roles por espacio**, revisados por el servidor en cada petición (`ServicioEspacios.exigir`):

  | Rol en el espacio | Puede |
  |---|---|
  | **Propietario** | Todo: invitar por nombre de usuario, aceptar o rechazar solicitudes, cambiar a alguien entre *Puede editar* y *Solo lectura*, **quitarle el acceso** (se desconecta al instante), renombrar el espacio, activar la conexión en la red y liberar almacenamiento |
  | **Puede editar** | Crear, editar, importar y eliminar documentos |
  | **Solo lectura** | Abrir y descargar; el editor no deja escribir y el servidor rechaza cualquier cambio con **403** |

  Cada espacio tiene un solo propietario y no puede quedarse sin él.
- **`FiltroSesion`** exige el token en toda la API (salvo registro e inicio de sesión).
- Contraseñas con **PBKDF2-HMAC-SHA256** + sal de 16 bytes; nunca en texto.
- Bloqueo de 15 min al 6.º intento fallido; se quita solo al pasar ese tiempo.
- **Ningún secreto en el código:** la URL, el usuario (`nomcolab_app`) y la contraseña de la
  BD son *App settings* de la Web App (variables de entorno).
- Firewall de Azure SQL: solo servicios de Azure (y la IP del equipo de desarrollo), y con
  `nomcolab azure down` el acceso desde internet queda cerrado del todo.
- Solo HTTPS; HTTP redirige con 301.

## API del módulo

| Método | Ruta | Quién |
|---|---|---|
| POST | `/api/cuentas/registro` | cualquiera |
| POST | `/api/cuentas/sesion` | cualquiera → token + datos públicos de la cuenta |
| GET | `/api/cuentas/yo` | con sesión |
| PUT | `/api/cuentas/preferencias` | con sesión |
| DELETE | `/api/cuentas/sesion` | con sesión |
| GET | `/api/espacios/{id}/accesos` | miembros del espacio |
| PUT | `/api/espacios/{id}/accesos` `{"usuario":"…","permiso":"EDICION"\|"LECTURA"\|null}` | **solo el propietario** (`null` quita el acceso) |
| DELETE | `/api/espacios/{id}/solicitudes/{usuarioId}` | **solo el propietario** |

## Para la demostración

1. **Prende Azure 2-3 minutos antes:** `nomcolab` → 1 Azure → 1 Prender (o `nomcolab azure up`).
   Abre la base a internet, prende la página y espera a que las dos respondan. Al terminar,
   `nomcolab azure down` la apaga y cierra la base.
   **Abre la página después de prenderla.** El plan gratuito apaga la app tras ~20 min sin
   visitas y la base gratuita se pausa tras 1 h; la primera entrada tarda hasta ~1 min
   (el botón dice "Conectando con la base de datos…"). Después va normal.
2. Con una cuenta, crear un espacio y un documento → **Compartir** → escribir el usuario de
   otra cuenta con *Solo lectura*.
3. Entrar con la otra cuenta (otra ventana o el celular): abre el documento pero no puede
   escribir. El propietario le cambia a *Puede editar* y ya escribe; después elige
   *Quitar acceso* y la otra ventana sale del espacio al instante.
4. Opcional: en la app Android, *Cambiar de servidor* → `nomcolab-wack.azurewebsites.net`.

Las credenciales están en `NOM/CREDENCIALES-AZURE.txt` (privado, no se sube a ningún lado).

## En la red local (sin Azure)

El mismo jar, sin variables, usa **H2 embebido** (`datos/nom-db.mv.db`): no hay que
instalar nada. Si había cuentas de la versión anterior (`usuarios.json`), se importan solas al
arrancar. Las bases creadas cuando existía el rol ADMINISTRADOR pierden la tabla `rol` y la
columna `usuario.id_rol` en el primer arranque (en H2 y en Azure SQL); las cuentas se conservan.

## Ver qué pasa en Azure

```bash
az webapp log tail -g rg-nomcolab -n nomcolab-wack
az sql db show -g rg-nomcolab -s nomcolab-sql-6a073f -n nomcolab --query status
```
