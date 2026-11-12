#!/bin/sh
# Instala NOM-COLAB en la Raspberry Pi (Alpine con s6-rc) como servicios supervisados:
#
#   nomcolab-servidor   el jar, con su propio usuario sin privilegios (nomcolab)
#   nomcolab-tunel      Cloudflare Tunnel -> https://nomcolab.dpdns.org (usuario cloudflared)
#   nomcolab-vigia      revisa cada minuto que el servidor y el túnel contesten; si no, los reinicia
#   (cada uno con su bitácora en /var/log/<nombre>, 10 archivos de 1 MB)
#
# s6 los arranca con la Pi y los levanta al instante si se caen. Además: respaldo diario de los
# datos (se guardan 14) y la orden `nomcolab-pi` para ver el estado, actualizar el jar, etc.
#
# Se puede correr las veces que haga falta (no repite lo que ya está hecho):
#   doas sh instalar-pi.sh
# Lo manda y lo corre desde la laptop:  nomcolab pi instalar
set -eu
[ "$(id -u)" = 0 ] || { echo "instalar-pi: hay que correrlo como root (doas sh $0)"; exit 1; }
AQUI="$(cd "$(dirname "$0")" && pwd)"
SRC=/etc/s6-rc/source
VAR=/var/lib/nomcolab
OPT=/opt/nomcolab
VIEJO=/home/user/nomcolab-servidor          # donde quedó la primera instalación (con cron)
ADMIN=user                                   # la cuenta con la que se entra por SSH
TUNEL_ID=869abbea-c306-4ef3-b6ff-2dc21263328a
di() { echo "instalar-pi: $*"; }

command -v s6-rc-compile >/dev/null || { di "esta Pi no usa s6-rc"; exit 1; }
[ -x /usr/local/sbin/svc ] || { di "falta /usr/local/sbin/svc"; exit 1; }

# ---- Java
if ! command -v java >/dev/null; then di "instalando Java"; apk add -q openjdk21-jre-headless; fi

# ---- usuario y carpetas
getent group nomcolab >/dev/null || addgroup -S nomcolab
id nomcolab >/dev/null 2>&1 || adduser -S -D -H -h $VAR -s /sbin/nologin -G nomcolab nomcolab
mkdir -p $OPT $VAR/datos $VAR/respaldos $VAR/tmp
chown root:root $OPT && chmod 755 $OPT
chown nomcolab:nomcolab $VAR $VAR/datos $VAR/tmp && chmod 750 $VAR $VAR/datos $VAR/tmp
chown root:adm $VAR/respaldos && chmod 750 $VAR/respaldos
# el grupo adm (la cuenta de administración) puede entrar a ver los respaldos
chgrp adm $VAR && chmod 750 $VAR

# ---- quitar la instalación vieja: el cron que lanzaba todo con nohup
if grep -q nomcolab-servidor /etc/crontabs/root 2>/dev/null; then
  di "quito del crontab de root las líneas de la instalación vieja"
  grep -v -e nomcolab-servidor -e '^# NOM-COLAB: arranca y vigila' /etc/crontabs/root > /etc/crontabs/root.n
  cat /etc/crontabs/root.n > /etc/crontabs/root && rm -f /etc/crontabs/root.n
fi
migrar=0
if [ -d $VIEJO/datos ] && [ -z "$(ls -A $VAR/datos)" ]; then migrar=1; fi
if pgrep -u $ADMIN -f nom-colab.jar >/dev/null 2>&1 || pgrep -u $ADMIN -f 'cloudflared.*nomcolab.yml' >/dev/null 2>&1; then
  di "apago los procesos sueltos de la instalación vieja"
  pkill -u $ADMIN -f nom-colab.jar 2>/dev/null || true
  pkill -u $ADMIN -f 'cloudflared.*nomcolab.yml' 2>/dev/null || true
  i=0; while pgrep -u $ADMIN -f nom-colab.jar >/dev/null 2>&1 && [ $i -lt 30 ]; do sleep 1; i=$((i + 1)); done
  pkill -9 -u $ADMIN -f nom-colab.jar 2>/dev/null || true
fi
if [ $migrar = 1 ]; then
  di "paso los datos de $VIEJO/datos a $VAR/datos"
  tar -czf $VAR/respaldos/datos-antes-de-migrar-$(date +%Y-%m-%d_%H%M).tar.gz -C $VIEJO datos
  cp -a $VIEJO/datos/. $VAR/datos/
  chown -R nomcolab:nomcolab $VAR/datos
fi
find $VAR/datos -type d -exec chmod 750 {} + ; find $VAR/datos -type f -exec chmod 640 {} +

# ---- el jar
if [ -s "$AQUI/nom-colab.jar" ]; then
  cp "$AQUI/nom-colab.jar" $OPT/nom-colab.jar.n && mv $OPT/nom-colab.jar.n $OPT/nom-colab.jar
elif ! [ -s $OPT/nom-colab.jar ] && [ -s $VIEJO/nom-colab.jar ]; then
  cp $VIEJO/nom-colab.jar $OPT/nom-colab.jar
fi
[ -s $OPT/nom-colab.jar ] || { di "falta el jar (ponlo junto a este script como nom-colab.jar)"; exit 1; }
chown root:root $OPT/nom-colab.jar && chmod 644 $OPT/nom-colab.jar

# ---- ajustes del servidor (no se pisan si ya existen)
if ! [ -f /etc/nomcolab.conf ]; then
  install -m 644 "$AQUI/nomcolab.conf" /etc/nomcolab.conf
fi

# ---- el túnel: credenciales junto a las del otro túnel, solo para root y cloudflared
[ -x /usr/local/bin/cloudflared ] || { di "falta cloudflared (doas cloudflare-tunnel setup ...)"; exit 1; }
mkdir -p /etc/cloudflared
if ! [ -s /etc/cloudflared/$TUNEL_ID.json ]; then
  for c in "$AQUI/$TUNEL_ID.json" /home/$ADMIN/.cloudflared/$TUNEL_ID.json; do
    [ -s "$c" ] && { cp "$c" /etc/cloudflared/$TUNEL_ID.json; break; }
  done
fi
[ -s /etc/cloudflared/$TUNEL_ID.json ] || { di "faltan las credenciales del túnel ($TUNEL_ID.json)"; exit 1; }
install -m 640 -g cloudflared "$AQUI/nomcolab-tunel.yml" /etc/cloudflared/nomcolab.yml
chown root:cloudflared /etc/cloudflared/$TUNEL_ID.json && chmod 640 /etc/cloudflared/$TUNEL_ID.json

# ---- servicios s6-rc
for s in nomcolab nomcolab-servidor nomcolab-servidor-log nomcolab-tunel nomcolab-tunel-log \
         nomcolab-vigia nomcolab-vigia-log; do
  rm -rf "$SRC/$s"
  cp -R "$AQUI/s6/$s" "$SRC/$s"
  [ -f "$SRC/$s/run" ] && chmod 755 "$SRC/$s/run"
done
: > $SRC/default/contents.d/nomcolab

# ---- respaldo diario y la orden nomcolab-pi
install -m 755 "$AQUI/nomcolab-pi" /usr/local/sbin/nomcolab-pi
install -m 755 "$AQUI/respaldo-diario" /etc/periodic/daily/nomcolab-respaldo
# la cuenta de administración puede usar nomcolab-pi sin escribir la contraseña (así la laptop
# puede actualizar el jar o pedir el estado); todo lo demás sigue pidiéndola
printf '%s\n' "# NOM-COLAB: estado, reinicio, respaldo y actualización sin contraseña" \
  "permit nopass $ADMIN as root cmd /usr/local/sbin/nomcolab-pi" > /etc/doas.d/zz-nomcolab.conf
chmod 600 /etc/doas.d/zz-nomcolab.conf   # zz: doas aplica la última regla que coincide (después de wheel.conf)
rm -f /etc/doas.d/nomcolab.conf

# ---- compilar y prender
# por si el cron viejo alcanzó a lanzar algo mientras tanto
sleep 2; pkill -u $ADMIN -f nom-colab.jar 2>/dev/null || true; pkill -u $ADMIN -f 'cloudflared.*nomcolab.yml' 2>/dev/null || true
/usr/local/sbin/svc reload
s6-rc -u change nomcolab
di "esperando a que conteste..."
i=0
until wget -q -O /dev/null -T 3 http://127.0.0.1:8080/api/red/info 2>/dev/null; do
  i=$((i + 1)); [ $i -ge 90 ] && { di "el servidor no contestó en 90 s (svc log nomcolab-servidor)"; exit 1; }
  sleep 1
done
# lo viejo ya no se usa: se guarda con otro nombre por si acaso (borrarlo cuando se quiera)
if [ -d $VIEJO ] && [ $migrar = 1 ]; then mv $VIEJO $VIEJO.viejo-$(date +%Y%m%d); fi
/usr/local/sbin/nomcolab-pi estado
