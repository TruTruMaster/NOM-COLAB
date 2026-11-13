# NOM-COLAB en tu propia computadora (servidor propio en internet)

Además de Azure (que se queda para la entrega escolar), NOM-COLAB puede correr en una
computadora de la casa y estar en internet **gratis**, sin abrir puertos del módem y con HTTPS.

> **Estado actual (13 de noviembre de 2026):** el servidor propio corre en la **Raspberry Pi 5**
> (ver "En la Raspberry Pi", abajo). Los servicios de la laptop (`nomcolab.service`,
> `nomcolab-tunel.service`) están apagados y deshabilitados; lo que se describe de la laptop queda
> como la forma de montarlo en otra computadora.

| | Azure | Servidor propio (Raspberry Pi) |
|---|---|---|
| Dirección | `https://nomcolab-wack.azurewebsites.net` | **`https://nomcolab.dpdns.org`** |
| Base de datos | Azure SQL (serverless, oferta gratis) | H2 en `/var/lib/nomcolab/datos` |
| Límites | F1: 60 min de CPU al día, se duerme sin visitas, 1 GB de RAM compartida | Raspberry Pi 5 (8 GB) y el internet de la casa; 200 MB por cuenta, a la vista |
| Costo | $0 (crédito de Azure for Students sin tocar) | $0 más la luz |
| Encendido | Normalmente apagado; `nomcolab` → 1 Azure | **Siempre prendido** (s6 lo levanta si se cae) |

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
- Contraseñas con PBKDF2 + sal. El bloqueo de 15 min al 6.º intento fallido es **por red**:
  quien falla desde su red queda fuera desde ahí, pero no deja fuera al dueño de la cuenta, que
  entra desde la suya (más de 50 fallos en una hora desde todos lados sí bloquean la cuenta).
- Tope de cuentas nuevas por hora: 30 desde una misma red y 300 en total
  (`NOM_REGISTROS_HORA_RED` y `NOM_REGISTROS_HORA`; 0 = sin tope). Lo del propio equipo no cuenta.
- Cada quien puede **cambiar su contraseña** (cierra sus otras sesiones) y **borrar su cuenta**
  (con sus espacios y documentos) desde el menú de la cuenta.
- La página manda cabeceras de seguridad: solo corre programas del propio servidor, no se deja
  meter dentro de otra página y por HTTPS pide volver siempre por HTTPS.
- El canal en vivo se abre con un boleto de un solo uso (30 s): el token de la sesión ya no
  aparece en ninguna dirección ni en las bitácoras del túnel.
- Conviene que la computadora tenga el sistema actualizado y que nadie más use esa cuenta.
- El servidor está en modo "red local" (la app lo encuentra sola en el mismo Wi-Fi), así que
  `/api/red/info` muestra la IP interna de la casa (`192.168.x.x`), que no sirve desde afuera.
  Para ocultarla, agregar `Environment=NOM_DESCUBRIMIENTO=false` al servicio.

## Almacenamiento: qué se guarda y cuánto

- En el servidor solo se guardan **documentos de NOM-COLAB** (textos, hojas, presentaciones y
  diagramas). No hay forma de subir otros archivos: lo que se importa de Word, Excel o
  PowerPoint se convierte al formato propio (el original va dentro del documento, recomprimido).
- En disco van **comprimidos**: el estado de cada documento (`docs/<id>/estado.json`) y las
  fotos de sus versiones (`docs/<id>/v/<n>.json`) se escriben con gzip, con el mismo nombre de
  archivo. Los datos de versiones anteriores (sin comprimir) se abren igual y se comprimen la
  siguiente vez que se guardan. Para ver uno a mano: `zcat estado.json | head -c 300`.
- **Límite por cuenta**: `NOM_CUOTA_MB` (en la Pi, 200 MB; 0 = sin límite). Cuenta lo de los
  espacios de los que la cuenta es propietaria (documentos y versiones, ya comprimidos). Cada
  quien ve cuánto lleva en el inicio ("Guardados en… · X de 200 MB") y en "En el servidor".
- No hay respaldo en el Drive de cada persona: el servidor guarda todo, con ese límite.

## Copia de los respaldos de la Raspberry en otro equipo

La Pi hace su respaldo diario (02:00, guarda 14) en su propia tarjeta. Para que un daño de la
tarjeta no se lleve datos y respaldos a la vez, la laptop trae cada día el más nuevo:

| Archivo | Para qué |
|---|---|
| `4-CODIGO/servidor-propio/pi/traer-respaldos.sh` | Copia por `scp` el respaldo más nuevo de `pi5:/var/lib/nomcolab/respaldos/`, comprueba que llegó completo y guarda los últimos 30 |
| `~/nomcolab-servidor/respaldos-pi/` | Donde quedan (solo los puede leer el usuario) |
| `~/.config/systemd/user/nomcolab-traer-respaldos.{service,timer}` | Diario a las 09:30; si la laptop estaba apagada, al prenderla |

Instalarlo en otro equipo (necesita `ssh pi5` con llave):

```sh
mkdir -p ~/nomcolab-servidor && cp 4-CODIGO/servidor-propio/pi/traer-respaldos.sh ~/nomcolab-servidor/
cp 4-CODIGO/servidor-propio/nomcolab-traer-respaldos.* ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now nomcolab-traer-respaldos.timer
~/nomcolab-servidor/traer-respaldos.sh      # una vez, para probar
```

Restaurar en la Pi: `scp` del respaldo a la Pi, `doas nomcolab-pi apagar`, descomprimirlo en
`/var/lib/nomcolab` (`tar -xzf datos-….tar.gz`, deja la carpeta `datos`) y `doas nomcolab-pi prender`.

**Cifrado del disco de la Pi: decidido que no** (11 de noviembre de 2026). Los datos van sin
cifrar en la tarjeta: la Pi no sale de casa y tiene que arrancar sola. Cifrarlos "desde el
programa" con una llave guardada en la misma tarjeta no protegería nada. Las contraseñas sí van
protegidas (PBKDF2 + sal) y los respaldos solo los leen `root` y el grupo `adm`.

## En la Raspberry Pi (así está montado)

La Pi (`pi5` en Tailscale, Raspberry Pi 5, Alpine Linux con s6-rc) corre NOM-COLAB desde el 10 de
noviembre de 2026. Se instaló con `servidor-propio/pi/instalar-pi.sh` (se puede volver a correr:
no repite lo que ya está hecho):

| Qué | Dónde |
|---|---|
| Servicios supervisados por s6 (arrancan con la Pi y se levantan solos si se caen) | `nomcolab-servidor` (el jar, usuario `nomcolab` sin privilegios), `nomcolab-tunel` (Cloudflare Tunnel → `nomcolab.dpdns.org`), `nomcolab-vigia` (cada minuto revisa que contesten) |
| El jar | `/opt/nomcolab/nom-colab.jar` |
| Datos | `/var/lib/nomcolab/datos` |
| Ajustes (puerto, cuota por cuenta…) | `/etc/nomcolab.conf` |
| Bitácoras | `/var/log/<servicio>` (10 archivos de 1 MB) |
| Respaldo | diario a las 02:00 en la Pi (se guardan 14) y copia diaria en la laptop (`~/nomcolab-servidor/respaldos-pi/`, ver la sección anterior) |

La orden `nomcolab-pi` (con `doas`, sin contraseña solo para ella) hace lo de todos los días:

```
ssh pi5 doas nomcolab-pi estado      # servicios, túnel, jar, datos, respaldo y temperatura
ssh pi5 doas nomcolab-pi reiniciar
ssh pi5 doas nomcolab-pi respaldo    # un respaldo ahora
ssh pi5 doas nomcolab-pi bitacora
# Actualizar el servidor: copiar el jar nuevo y pedir el cambio (respalda antes y vuelve al anterior si no arranca)
scp 2-PAGINA-Servidor/nom-colab.jar pi5:/home/user/nom-colab.jar.nuevo && ssh pi5 doas nomcolab-pi actualizar
```

El túnel `pi5` de `vefose.pp.ua` (otro sitio del dueño en la misma Pi) no se toca.

## Historia del dominio

Primero se pidió `nomcolab.eu.org` (23 de octubre de 2026, solicitud
`20261023061539-arf-26319`); eu.org lo revisa a mano y no llegó a aprobarse. Se usa
`nomcolab.dpdns.org` (DigitalPlat), con la misma cuenta de Cloudflare. El plan F1 de Azure no
acepta dominios propios, así que el dominio apunta al servidor propio.

`is.gd` no deja cambiar a dónde apunta un enlace: si la dirección cambia, hay que crear otro.
