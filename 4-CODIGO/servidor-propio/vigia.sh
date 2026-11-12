#!/bin/sh
# Vigía de NOM-COLAB (cada 2 minutos): si el servidor o el túnel no responden dos veces
# seguidas, los reinicia. Deja lo que hizo en el diario: journalctl --user -u nomcolab-vigia
D="$HOME/nomcolab-servidor"; F="$D/.vigia-fallas"
mkdir -p "$D"
ok_local() { [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 http://127.0.0.1:8080/api/red/info)" = 200 ]; }
ok_tunel() { curl -s --max-time 10 http://127.0.0.1:20241/ready | grep -q '"readyConnections":[1-9]'; }
fallas() { cat "$F.$1" 2>/dev/null || echo 0; }
contar() { # contar <nombre> <ok 0|1> <servicio>
  if [ "$2" = 0 ]; then rm -f "$F.$1"; return; fi
  n=$(( $(fallas "$1") + 1 )); echo "$n" > "$F.$1"
  echo "vigía: $1 no responde ($n)"
  if [ "$n" -ge 2 ]; then echo "vigía: reiniciando $3"; systemctl --user restart "$3"; rm -f "$F.$1"; fi
}
# Apagado a propósito (nomcolab local down lo deshabilita): no hacer nada.
systemctl --user is-enabled --quiet nomcolab.service || exit 0
if ok_local; then contar servidor 0; else contar servidor 1 nomcolab.service; fi
if ok_tunel; then contar tunel 0; else contar tunel 1 nomcolab-tunel.service; fi
