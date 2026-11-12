#!/bin/sh
# Instala el servidor propio de NOM-COLAB en esta computadora, siempre prendido en
# https://nomcolab.dpdns.org (Cloudflare Tunnel) y también en Tailscale Funnel.
# Requiere: la copia de entrega en ~/NOM (con 2-PAGINA-Servidor), cloudflared (paquete de
# pkg.cloudflare.com) y haber corrido una vez `cloudflared tunnel login`.
set -e
AQUI="$(dirname "$(readlink -f "$0")")"
D="$HOME/nomcolab-servidor"
U="$HOME/.config/systemd/user"
mkdir -p "$D/datos" "$D/respaldos" "$U" "$HOME/.local/bin"
[ -f "$D/nom-colab.jar" ] || cp "$HOME/NOM/2-PAGINA-Servidor/nom-colab.jar" "$D/nom-colab.jar"
for s in respaldar.sh vigia.sh; do cp "$AQUI/$s" "$D/$s" && chmod +x "$D/$s"; done
for u in nomcolab.service nomcolab-tunel.service nomcolab-respaldo.service nomcolab-respaldo.timer \
         nomcolab-vigia.service nomcolab-vigia.timer; do cp "$AQUI/$u" "$U/"; done
ln -sf "$(readlink -f "$AQUI/../azure/nomcolab")" "$HOME/.local/bin/nomcolab"
# Que los servicios arranquen con la computadora sin iniciar sesión, y que Tailscale no pida sudo.
sudo loginctl enable-linger "$USER"
command -v tailscale >/dev/null && sudo tailscale set --operator="$USER" || true
# Que no se duerma: ni por la tapa ni por estar sin usar.
sudo mkdir -p /etc/systemd/logind.conf.d
sudo cp "$AQUI/logind-siempre-prendido.conf" /etc/systemd/logind.conf.d/nomcolab-siempre-prendido.conf
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target suspend-then-hibernate.target
[ -f "$HOME/.cloudflared/nomcolab.yml" ] || "$AQUI/tunel.sh"
systemctl --user daemon-reload
systemctl --user enable --now nomcolab.service nomcolab-tunel.service nomcolab-respaldo.timer nomcolab-vigia.timer
command -v tailscale >/dev/null && tailscale funnel --bg 8080 >/dev/null 2>&1 || true
echo "Listo: https://nomcolab.dpdns.org (estado: nomcolab local estado)"
