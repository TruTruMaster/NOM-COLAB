#!/bin/sh
# Respaldo de NOM-COLAB: comprime la carpeta datos y conserva los últimos 14.
D="$HOME/nomcolab-servidor"
mkdir -p "$D/respaldos"
tar -czf "$D/respaldos/datos-$(date +%Y-%m-%d_%H%M).tar.gz" -C "$D" datos
ls -1t "$D"/respaldos/datos-*.tar.gz | tail -n +15 | xargs -r rm -f
