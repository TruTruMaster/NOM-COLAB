#!/bin/sh
# Copia de los respaldos de la Raspberry FUERA de la Raspberry.
#
# La Pi hace un respaldo diario de los datos de NOM-COLAB (02:00, guarda 14), pero los deja en su
# propia tarjeta: si la tarjeta se daña, se pierden los datos y los respaldos a la vez. Este guion
# corre en la laptop (o en cualquier otro equipo con `ssh pi5`) y trae el respaldo más nuevo que
# todavía no tenga. Aquí se guardan los últimos 30.
#
#   traer-respaldos.sh              trae el más nuevo a ~/nomcolab-servidor/respaldos-pi
#   traer-respaldos.sh /otra/carpeta
#   NOM_PI=otro-nombre traer-respaldos.sh
#
# Se instala con un temporizador diario (nomcolab-traer-respaldos.timer); si la laptop estaba
# apagada a esa hora, corre al prenderla. No necesita contraseña: el usuario de la Pi está en el
# grupo adm y puede leer los respaldos.
set -u
PI="${NOM_PI:-pi5}"
ORIGEN=/var/lib/nomcolab/respaldos
DESTINO="${1:-$HOME/nomcolab-servidor/respaldos-pi}"
GUARDAR=30
mkdir -p "$DESTINO" && chmod 700 "$DESTINO" || { echo "traer-respaldos: no se pudo crear $DESTINO"; exit 1; }
SSH="ssh -o BatchMode=yes -o ConnectTimeout=20"

# El respaldo diario más nuevo de la Pi y su tamaño (para comprobar que llegó completo).
linea="$($SSH "$PI" "f=\$(ls -1t $ORIGEN/datos-2*.tar.gz 2>/dev/null | head -1); [ -n \"\$f\" ] && echo \"\$(basename \"\$f\") \$(wc -c < \"\$f\")\"")" \
  || { echo "traer-respaldos: no se pudo entrar a $PI (¿está prendida y en la red?)"; exit 1; }
nombre="${linea% *}"; tam="${linea##* }"
case "$nombre" in datos-2*.tar.gz) ;; *) echo "traer-respaldos: la Pi todavía no tiene respaldos"; exit 1 ;; esac

if [ -f "$DESTINO/$nombre" ] && [ "$(wc -c < "$DESTINO/$nombre")" = "$tam" ]; then
  echo "traer-respaldos: ya estaba $nombre"
else
  scp -q -o BatchMode=yes -o ConnectTimeout=20 "$PI:$ORIGEN/$nombre" "$DESTINO/$nombre.parte" \
    || { rm -f "$DESTINO/$nombre.parte"; echo "traer-respaldos: falló la copia de $nombre"; exit 1; }
  # Completo y legible antes de darlo por bueno (una copia cortada no sirve para restaurar).
  if [ "$(wc -c < "$DESTINO/$nombre.parte")" = "$tam" ] && tar -tzf "$DESTINO/$nombre.parte" >/dev/null 2>&1; then
    chmod 600 "$DESTINO/$nombre.parte" && mv "$DESTINO/$nombre.parte" "$DESTINO/$nombre"
    echo "traer-respaldos: $nombre ($(du -h "$DESTINO/$nombre" | cut -f1)) en $DESTINO"
  else
    rm -f "$DESTINO/$nombre.parte"; echo "traer-respaldos: $nombre llegó incompleto o dañado"; exit 1
  fi
fi
ls -1t "$DESTINO"/datos-2*.tar.gz 2>/dev/null | tail -n +$((GUARDAR + 1)) | xargs -r rm -f
echo "traer-respaldos: $(ls -1 "$DESTINO"/datos-2*.tar.gz 2>/dev/null | wc -l) respaldos de la Pi guardados aquí"
