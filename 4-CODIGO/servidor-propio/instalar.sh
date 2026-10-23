#!/bin/sh
# Instala el servidor propio de NOM-COLAB en esta computadora (una sola vez).
# Requiere: la copia de entrega en ~/NOM (con 2-PAGINA-Servidor) y Tailscale con Funnel habilitado.
set -e
AQUI="$(dirname "$(readlink -f "$0")")"
D="$HOME/nomcolab-servidor"
mkdir -p "$D/datos" "$D/respaldos" "$HOME/.config/systemd/user" "$HOME/.local/bin"
cp "$HOME/NOM/2-PAGINA-Servidor/nom-colab.jar" "$D/nom-colab.jar"
cp "$AQUI/respaldar.sh" "$D/respaldar.sh" && chmod +x "$D/respaldar.sh"
cp "$AQUI"/nomcolab.service "$AQUI"/nomcolab-respaldo.service "$AQUI"/nomcolab-respaldo.timer "$HOME/.config/systemd/user/"
ln -sf "$(readlink -f "$AQUI/../azure/nomcolab")" "$HOME/.local/bin/nomcolab"
# Que el servidor siga prendido al cerrar la sesión, y que Tailscale no pida sudo.
sudo loginctl enable-linger "$USER"
sudo tailscale set --operator="$USER"
systemctl --user daemon-reload
systemctl --user enable --now nomcolab-respaldo.timer
echo "Listo. Para prenderlo: nomcolab  (2 Local -> 1 Prender)"
