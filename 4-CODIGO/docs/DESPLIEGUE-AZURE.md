# NOM-COLAB en Azure — módulo web conectado a la base de datos, con roles

**Página:** https://nomcolab-wack.azurewebsites.net

Lo que pidió el profesor: *un módulo de la programación web conectado a la base de
datos y subido a Azure; la seguridad se aplica con roles*. El módulo es **Gestión de
cuentas** (registro, inicio de sesión, sesiones, preferencias y roles).

## Arquitectura

```
Navegador / celular / app Android
        │  HTTPS (solo HTTPS)
        ▼
Azure App Service  nomcolab-wack   (Linux, Java 21, plan F1 gratuito)
  Spring Boot: API /api/cuentas, /api/admin + la interfaz web
        │  JDBC cifrado (encrypt=true)
        ▼
Azure SQL Database  nomcolab   (serverless, oferta gratuita, se pausa sola)
  tablas: rol, usuario, sesion, preferencias
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
export SQLPASS='...' NOM_ADMIN_CONTRASENA='...'
./desplegar.sh crear                # una sola vez
./desplegar.sh subir                # cada vez que cambie el código
```

`desplegar.sh` hace: registrar `Microsoft.Sql` en la suscripción → crear grupo → servidor
SQL → base de datos gratuita → regla de firewall "servicios de Azure" → plan F1 Linux →
Web App Java 21 → solo HTTPS → variables de configuración → `az webapp deploy --type jar`.

## Seguridad

- **Roles en la base de datos.** Tabla `rol` (1 ADMINISTRADOR, 2 USUARIO) y `usuario.id_rol`.
  El repositorio trae el rol con `JOIN rol` en cada consulta.
- **`FiltroSesion`** exige el token en toda la API (salvo registro e inicio de sesión).
- **`FiltroRol`** protege `/api/admin/**`: si la cuenta no es ADMINISTRADOR responde **403**.
  Como el rol se relee en cada petición, un cambio de rol aplica de inmediato.
- La interfaz ni siquiera muestra "Administrar usuarios" a un USUARIO.
- Nadie puede quitarse su propio rol de administrador (siempre queda uno).
- Contraseñas con **PBKDF2-HMAC-SHA256** + sal de 16 bytes; nunca en texto.
- Bloqueo de 15 min al 6.º intento fallido; el administrador puede desbloquear.
- **Ningún secreto en el código:** la URL, usuario y contraseña de la BD y la cuenta de
  administrador inicial son *App settings* de la Web App (variables de entorno).
- Firewall de Azure SQL: solo servicios de Azure (y la IP del equipo de desarrollo).
- Solo HTTPS; HTTP redirige con 301.

## API del módulo

| Método | Ruta | Quién |
|---|---|---|
| POST | `/api/cuentas/registro` | cualquiera (queda como USUARIO) |
| POST | `/api/cuentas/sesion` | cualquiera → token + usuario con `rol` |
| GET | `/api/cuentas/yo` | con sesión |
| PUT | `/api/cuentas/preferencias` | con sesión |
| DELETE | `/api/cuentas/sesion` | con sesión |
| GET | `/api/admin/usuarios` | **solo ADMINISTRADOR** |
| PUT | `/api/admin/usuarios/{id}/rol` `{"rol":"ADMINISTRADOR"\|"USUARIO"}` | **solo ADMINISTRADOR** |
| POST | `/api/admin/usuarios/{id}/desbloquear` | **solo ADMINISTRADOR** |

## Para la demostración

1. **Abre la página 2-3 minutos antes.** El plan gratuito apaga la app tras ~20 min sin
   visitas y la base gratuita se pausa tras 1 h; la primera entrada tarda hasta ~1 min
   (el botón dice "Conectando con la base de datos…"). Después va normal.
2. Crear una cuenta nueva → entra como **Usuario**: no ve "Administrar usuarios" y si
   escribe `…/#/admin` le sale "Esta sección es solo para administradores".
3. Cerrar sesión y entrar como **admin** → menú lateral **Administrar usuarios** → se ve la
   cuenta recién creada (viene de Azure SQL) → "Hacer administrador" / "Desbloquear".
4. Opcional: en la app Android, *Cambiar de servidor* → `nomcolab-wack.azurewebsites.net`.

Las credenciales están en `NOM/CREDENCIALES-AZURE.txt` (privado, no se sube a ningún lado).

## En la red local (sin Azure)

El mismo jar, sin variables, usa **H2 embebido** (`datos/nom-db.mv.db`): no hay que
instalar nada. La primera cuenta que se registra queda como ADMINISTRADOR. Si había
cuentas de la versión anterior (`usuarios.json`), se importan solas al arrancar.

## Ver qué pasa en Azure

```bash
az webapp log tail -g rg-nomcolab -n nomcolab-wack
az sql db show -g rg-nomcolab -s nomcolab-sql-6a073f -n nomcolab --query status
```
