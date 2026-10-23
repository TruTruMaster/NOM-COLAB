# NOM-COLAB en tu propia computadora (servidor propio en internet)

Además de Azure (que se queda para la entrega escolar), NOM-COLAB puede correr en una
computadora de la casa y estar en internet **gratis**, sin abrir puertos del módem y con HTTPS.

| | Azure | Servidor propio |
|---|---|---|
| Dirección | `https://nomcolab-wack.azurewebsites.net` | `https://nomcolab.tailfd65f2.ts.net` |
| Enlace corto | — | `https://is.gd/nomcolab` (lo crea el dueño en is.gd) |
| Base de datos | Azure SQL (serverless, oferta gratis) | H2 en `~/nomcolab-servidor/datos` |
| Límites | F1: 60 min de CPU al día, se duerme sin visitas, 1 GB de RAM compartida | Los de la computadora (la laptop actual: i7-10610U, 16 GB) y el internet de la casa |
| Costo | $0 (crédito de Azure for Students sin tocar) | $0 más la luz |
| Se prende y apaga con | `nomcolab` → 1 Azure | `nomcolab` → 2 Local |

Las dos son independientes: cuentas, espacios y documentos de una no aparecen en la otra.

## Cómo llega a internet: Tailscale Funnel

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
| **Prender** | Si hay un jar nuevo en `2-PAGINA-Servidor/` lo copia; arranca el servicio, espera a que responda y enciende Funnel. Termina mostrando la dirección pública |
| **Apagar** | Apaga Funnel (la dirección deja de responder), apaga el servidor y hace un respaldo |
| **Estado** | Si el servidor y Funnel están prendidos, cuánta RAM usa, cuánto pesan los datos y el último respaldo |
| **Reiniciar** | Apagar y prender (sirve para cargar una versión nueva del jar) |

**No arranca solo al prender la computadora**: solo está en línea cuando el dueño lo prende.
Mientras esté prendido, la computadora no debe suspenderse.

## Archivos

| Dónde | Qué |
|---|---|
| `~/nomcolab-servidor/nom-colab.jar` | La copia del jar que corre (se actualiza al prender) |
| `~/nomcolab-servidor/datos/` | Cuentas (H2), espacios, documentos y versiones |
| `~/nomcolab-servidor/respaldos/` | `datos-AAAA-MM-DD_HHMM.tar.gz`: uno diario a las 03:30 y otro al apagar; se guardan los últimos 14 |
| `~/.config/systemd/user/nomcolab.service` | El servicio (sin `[Install]`: nunca arranca solo) |
| `~/.config/systemd/user/nomcolab-respaldo.{service,timer}` | El respaldo diario |
| `4-CODIGO/servidor-propio/` | Las fuentes de todo lo anterior y `instalar.sh` |

Para restaurar un respaldo: apagar, mover la carpeta `datos` a otro lado y descomprimir el
respaldo dentro de `~/nomcolab-servidor` (`tar -xzf respaldos/datos-….tar.gz`), y prender.

## Instalar en otra computadora (Linux)

1. Tener la copia de entrega en `~/NOM` (con `2-PAGINA-Servidor/`) e instalar Tailscale con
   la misma cuenta.
2. En la consola de Tailscale, habilitar HTTPS (*DNS → HTTPS Certificates*) y Funnel (la
   primera vez que se corre `tailscale funnel`, Tailscale da un enlace para aprobarlo).
3. `~/NOM/4-CODIGO/servidor-propio/instalar.sh`
4. Opcional: `sudo tailscale set --hostname=nomcolab` para que la dirección diga nomcolab.
5. `nomcolab` → 2 Local → 1 Prender.

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

## Dominio propio (pendiente)

Se pidió `nomcolab.eu.org` (gratis, de por vida) el 23 de octubre de 2026: solicitud
`20261023061539-arf-26319`, contacto `RA2475-FREE` (con la dirección de la escuela y los datos
ocultos en el registro público). La zona ya está en una cuenta gratis de Cloudflare con los
servidores `anirban.ns.cloudflare.com` y `brenda.ns.cloudflare.com`. eu.org lo revisa a mano
(días o semanas). Cuando lo aprueben: crear un Cloudflare Tunnel desde esta computadora hacia
`nomcolab.eu.org` (tampoco abre puertos). Funnel no sirve para eso porque solo publica nombres
`.ts.net`, y el plan F1 de Azure no acepta dominios propios.

`is.gd` no deja cambiar a dónde apunta un enlace: si la dirección cambia, hay que crear otro.
