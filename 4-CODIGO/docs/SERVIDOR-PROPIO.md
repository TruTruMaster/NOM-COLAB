# NOM-COLAB en tu propia computadora (servidor propio en internet)

Además de Azure (que se queda para la entrega escolar), NOM-COLAB puede correr en una
computadora de la casa y estar en internet **gratis**, sin abrir puertos del módem y con HTTPS.

| | Azure | Servidor propio |
|---|---|---|
| Dirección | `https://nomcolab-wack.azurewebsites.net` | **`https://nomcolab.dpdns.org`** (y `https://nomcolab.tailfd65f2.ts.net`) |
| Enlace corto | — | `https://is.gd/nomcolab` (lo crea el dueño en is.gd) |
| Base de datos | Azure SQL (serverless, oferta gratis) | H2 en `~/nomcolab-servidor/datos` |
| Límites | F1: 60 min de CPU al día, se duerme sin visitas, 1 GB de RAM compartida | Los de la computadora (la laptop actual: i7-10610U, 16 GB) y el internet de la casa |
| Costo | $0 (crédito de Azure for Students sin tocar) | $0 más la luz |
| Encendido | Normalmente apagado; `nomcolab` → 1 Azure | **Siempre prendido**: arranca solo con la computadora; `nomcolab` → 2 Local |

Las dos son independientes: cuentas, espacios y documentos de una no aparecen en la otra.

## El dominio: nomcolab.dpdns.org (Cloudflare Tunnel)

`nomcolab.dpdns.org` es un dominio gratis de DigitalPlat (dpdns.org) cuyos servidores de nombres
son los de una cuenta gratis de Cloudflare (`anirban.ns.cloudflare.com` y
`brenda.ns.cloudflare.com`). Cloudflare Tunnel lo conecta con esta computadora:

- `cloudflared` (paquete oficial de `pkg.cloudflare.com`, se actualiza con `apt`) abre una
  conexión **hacia afuera**: no se abre ningún puerto del módem, funciona detrás de CGNAT y en
  la red de la escuela, y nadie ve la IP de la computadora;
- Cloudflare pone el certificado HTTPS y lo renueva solo;
- `nomcolab.dpdns.org` y `www.nomcolab.dpdns.org` son registros CNAME al túnel
  `nomcolab` (los crea `servidor-propio/tunel.sh`);
- el tiempo real funciona: el servidor manda un "latido" cada 20 s y Cloudflare corta una
  conexión hasta después de 100 s sin datos.

| Pieza | Dónde |
|---|---|
| Certificado de la cuenta (`cloudflared tunnel login`) | `~/.cloudflared/cert.pem` |
| Credenciales del túnel | `~/.cloudflared/<id>.json` (no se suben a GitHub) |
| Configuración (a qué puerto manda cada nombre) | `~/.cloudflared/nomcolab.yml` |
| Servicio | `~/.config/systemd/user/nomcolab-tunel.service` |

El túnel se llama `nomcolab` (id `869abbea-c306-4ef3-b6ff-2dc21263328a`). En la misma cuenta
de Cloudflare está el túnel `pi5` de la Raspberry Pi, que publica `vefose.pp.ua`; son
independientes.

**En la red de la escuela** las llamadas de `cloudflared` a la API de Cloudflare se cortan
("connection reset by peer"), y también el inicio de sesión de `cloudflared tunnel login`. Por
eso `tunel.sh` usa `curl` (que sí pasa) con el token de `cert.pem`. Ahí el túnel se conecta por
QUIC (UDP 7844); HTTP/2 por TCP está bloqueado, así que si algún día bloquean también QUIC, el
túnel no conecta desde esa red. En casa no hay ese problema.

**HTTP a HTTPS:** el certificado de `cloudflared` solo puede manejar túneles y DNS. Para que
`http://nomcolab.dpdns.org` mande siempre a `https://`, hay que activarlo en el panel de
Cloudflare: zona `nomcolab.dpdns.org` → *SSL/TLS* → *Edge Certificates* → **Always Use HTTPS**.

## Siempre prendido

- `nomcolab.service` y `nomcolab-tunel.service` tienen `[Install]` y están habilitados: con
  *linger* activado arrancan al prender la computadora **aunque nadie inicie sesión**, y
  `Restart=always` los vuelve a levantar si se caen.
- **Vigía** (`nomcolab-vigia.timer`, cada 2 min): si el servidor no contesta en
  `127.0.0.1:8080` o el túnel no tiene conexiones con Cloudflare dos veces seguidas, reinicia
  el que falló. Lo que hace queda en `journalctl --user -u nomcolab-vigia`.
- La computadora **no se duerme**: `/etc/systemd/logind.conf.d/nomcolab-siempre-prendido.conf`
  hace que cerrar la tapa no haga nada, y los modos de suspensión están deshabilitados
  (`systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
  suspend-then-hibernate.target`). Para volver a lo normal: borrar ese archivo y
  `sudo systemctl unmask` con los mismos nombres.
- El Wi-Fi se conecta solo al arrancar (la conexión es del sistema, no de la sesión).
- Lo único que lo apaga: que la computadora se apague o pierda internet o luz. Al volver,
  todo arranca solo.

## También por Tailscale Funnel

`tailscale funnel` publica el puerto 8080 de la computadora en
`https://<equipo>.<red-tailscale>.ts.net`. La computadora se conecta **hacia afuera** con
Tailscale, así que:

- no se abre ningún puerto del módem y funciona aunque el internet de la casa esté detrás de
  CGNAT (común en Telmex, Izzi y Totalplay);
- nadie ve la IP de la casa;
- el certificado HTTPS lo pone Tailscale;
- el tiempo real de NOM-COLAB funciona: el servidor manda un "latido" cada 20 s.

Es gratis porque viene incluido en el plan Personal de Tailscale (Tailscale cobra a empresas).
Está pensado para proyectos personales; el tráfico pasa por sus servidores y tiene límites de
ancho de banda que sobran para una escuela. Solo publica por los puertos 443, 8443 o 10000 y el
nombre siempre termina en `.ts.net` (no acepta un dominio propio).

El equipo se renombró a `nomcolab` en Tailscale para que la dirección lo diga.

## Prender, apagar, estado

Todo se hace con el script `nomcolab` (`4-CODIGO/azure/nomcolab`, enlazado en `~/.local/bin`):

```
$ nomcolab
NOM-COLAB

¿Dónde?
  1) Azure  (https://nomcolab-wack.azurewebsites.net)
  2) Local  (esta computadora, por Tailscale Funnel; ahora: apagado)
Elige [1-2] (q para salir): 2

¿Qué hago en local?
  1) Prender (up)
  2) Apagar (down)
  3) Estado
  4) Reiniciar
```

También sin menú: `nomcolab local up`, `nomcolab local down`, `nomcolab local estado`,
`nomcolab local reiniciar` (y lo mismo con `azure`). La forma anterior `nomcolab --up` /
`--down` / `--state` / `--reset` sigue funcionando para Azure.

| Acción local | Qué hace |
|---|---|
| **Prender** | Si hay un jar nuevo en `2-PAGINA-Servidor/` lo copia; arranca y habilita el servidor y el túnel, espera a que `https://nomcolab.dpdns.org` responda y enciende Funnel |
| **Apagar** | Apaga el túnel y Funnel (las direcciones dejan de responder), apaga el servidor, le quita el arranque automático y hace un respaldo |
| **Estado** | Si el servidor, el túnel y Funnel están prendidos y responden, el arranque automático, cuánta RAM usa, cuánto pesan los datos y el último respaldo |
| **Reiniciar** | Apagar y prender (sirve para cargar una versión nueva del jar) |

**Apagar** deshabilita el arranque automático (y el vigía no lo vuelve a prender) hasta el
siguiente **Prender**. **Reiniciar** es la forma de cargar un jar nuevo de `2-PAGINA-Servidor/`.

## Archivos

| Dónde | Qué |
|---|---|
| `~/nomcolab-servidor/nom-colab.jar` | La copia del jar que corre (se actualiza al prender) |
| `~/nomcolab-servidor/datos/` | Cuentas (H2), espacios, documentos y versiones |
| `~/nomcolab-servidor/respaldos/` | `datos-AAAA-MM-DD_HHMM.tar.gz`: uno diario a las 03:30 y otro al apagar; se guardan los últimos 14 |
| `~/.config/systemd/user/nomcolab.service` | El servidor (arranca solo con la computadora) |
| `~/.config/systemd/user/nomcolab-tunel.service` | El túnel de Cloudflare hacia `nomcolab.dpdns.org` |
| `~/.config/systemd/user/nomcolab-vigia.{service,timer}` y `~/nomcolab-servidor/vigia.sh` | El vigía (cada 2 min) |
| `~/.config/systemd/user/nomcolab-respaldo.{service,timer}` | El respaldo diario |
| `4-CODIGO/servidor-propio/` | Las fuentes de todo lo anterior y `instalar.sh` |

Para restaurar un respaldo: apagar, mover la carpeta `datos` a otro lado y descomprimir el
respaldo dentro de `~/nomcolab-servidor` (`tar -xzf respaldos/datos-….tar.gz`), y prender.

## Instalar en otra computadora (Linux)

Primero apagar el de esta computadora (`nomcolab local down`): dos equipos con el mismo túnel
se reparten las visitas y cada uno tiene sus propios datos.

1. Tener la copia de entrega en `~/NOM` (con `2-PAGINA-Servidor/`). Copiar los datos si se
   quieren conservar (un respaldo de `~/nomcolab-servidor/respaldos`).
2. Instalar `cloudflared` desde `pkg.cloudflare.com` (instrucciones para Debian/Ubuntu en la
   página de Cloudflare) y copiar `~/.cloudflared/` de esta computadora (cert.pem, el `.json`
   del túnel y `nomcolab.yml`); o correr `cloudflared tunnel login` y dejar que `tunel.sh`
   lo arme.
3. Opcional: Tailscale con la misma cuenta, con HTTPS y Funnel habilitados.
4. `~/NOM/4-CODIGO/servidor-propio/instalar.sh` (deja todo habilitado y prendido).

## Seguridad

- No hay administrador: cada cuenta controla solo sus espacios y documentos; el propietario
  de un espacio cambia permisos (*Puede editar* / *Solo lectura*) o quita el acceso.
- Cualquiera con la dirección puede **crear una cuenta**, pero solo ve sus propios espacios y
  los que le compartan.
- Contraseñas con PBKDF2 + sal; bloqueo de 15 min al 6.º intento fallido.
- Conviene que la computadora tenga el sistema actualizado y que nadie más use esa cuenta.
- El servidor está en modo "red local" (la app lo encuentra sola en el mismo Wi-Fi), así que
  `/api/red/info` muestra la IP interna de la casa (`192.168.x.x`), que no sirve desde afuera.
  Para ocultarla, agregar `Environment=NOM_DESCUBRIMIENTO=false` al servicio.

## Pasarlo a la Raspberry Pi

La Pi (`pi5` en Tailscale, Raspberry Pi 5, `linux_arm64`) ya está prendida todo el tiempo y
corre `cloudflared` para `vefose.pp.ua`, así que es mejor casa para NOM-COLAB que una laptop.
Pasos (necesitan entrar a la Pi: `sudo tailscale set --ssh` en ella, o una llave SSH):

1. En la Pi: `sudo apt install openjdk-21-jre-headless` (el Java de `2-PAGINA-Servidor/java-linux`
   es para x86_64) y copiar `~/NOM` (o al menos `2-PAGINA-Servidor/nom-colab.jar` y
   `4-CODIGO/servidor-propio`, `4-CODIGO/azure/nomcolab`).
2. En la laptop: `nomcolab local down` (deja de escribir datos y hace un respaldo).
3. Copiar `~/nomcolab-servidor/datos` y `~/.cloudflared/{nomcolab.yml,869abbea-….json}` a la Pi.
4. En la Pi: cambiar `ExecStart` de `nomcolab.service` a `/usr/bin/java` y correr
   `instalar.sh` (encuentra el túnel y no crea otro). El túnel `pi5` de `vefose.pp.ua` no se toca.

## Historia del dominio

Primero se pidió `nomcolab.eu.org` (23 de octubre de 2026, solicitud
`20261023061539-arf-26319`); eu.org lo revisa a mano y no llegó a aprobarse. Se usa
`nomcolab.dpdns.org` (DigitalPlat), con la misma cuenta de Cloudflare. El plan F1 de Azure no
acepta dominios propios, así que el dominio apunta al servidor propio.

`is.gd` no deja cambiar a dónde apunta un enlace: si la dirección cambia, hay que crear otro.
