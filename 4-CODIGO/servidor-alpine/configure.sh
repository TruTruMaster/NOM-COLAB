#!/bin/sh
# configure.sh - run INSIDE the new root (chroot) by 1-install.sh.
# Reads /etc/servidor-alpine.conf and the one-time files in /root/.install
# (authorized_keys, wifi-network, ts-authkey, optional *.hash), then deletes them.
set -eu
# shellcheck disable=SC1091
. /etc/servidor-alpine.conf
INST=/root/.install
say() { echo "   $*"; }

# ------------------------------------------------------------------ identity
echo "$SERVER_NAME" > /etc/hostname
cat > /etc/hosts <<EOF
127.0.0.1 localhost
127.0.1.1 $SERVER_NAME
::1       localhost
EOF

cat > /etc/fstab <<EOF
# <device>        <dir> <type> <options>                               <dump> <pass>
UUID=$ROOT_UUID   /     ext4   rw,noatime,errors=remount-ro              0 1
UUID=$ESP_UUID    /boot vfat   rw,noatime,umask=0077,shortname=mixed     0 2
tmpfs             /tmp  tmpfs  nosuid,nodev,mode=1777,size=1G            0 0
EOF

# ------------------------------------------------------------------ users
id s6log >/dev/null 2>&1 || adduser -S -D -H -h /var/empty -s /sbin/nologin -G adm s6log
if [ "$NOMCOLAB" = yes ]; then
  getent group nomcolab >/dev/null || addgroup -S nomcolab
  id nomcolab >/dev/null 2>&1 || adduser -S -D -H -h /srv/nomcolab -s /sbin/nologin -G nomcolab nomcolab
fi
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  adduser -D -s /bin/sh -g "Server admin" "$ADMIN_USER"
fi
addgroup "$ADMIN_USER" wheel 2>/dev/null || true
addgroup "$ADMIN_USER" adm 2>/dev/null || true

home=$(awk -F: -v u="$ADMIN_USER" '$1 == u { print $6 }' /etc/passwd)
mkdir -p "$home/.ssh"
cp "$INST/authorized_keys" "$home/.ssh/authorized_keys"
chmod 700 "$home/.ssh"; chmod 600 "$home/.ssh/authorized_keys"
chown -R "$ADMIN_USER" "$home/.ssh"
say "$(wc -l < "$home/.ssh/authorized_keys") SSH key(s) for $ADMIN_USER"

# Passwords: only used for doas and the local console (SSH is keys only)
set_password() { # set_password <user>
  if [ -s "$INST/$1.hash" ]; then
    echo "$1:$(cat "$INST/$1.hash")" | chpasswd -e
  elif [ -t 0 ]; then
    echo "Password for '$1' (doas and the local console; SSH never asks for it):"
    until passwd "$1"; do echo "try again"; done
  else
    # "*" = no password login, but NOT a locked account ("!"): OpenSSH refuses
    # even key logins for locked accounts
    sed -i "s/^$1:[^:]*:/$1:*:/" /etc/shadow; say "$1 has no password"
  fi
}
set_password "$ADMIN_USER"
set_password root

# ------------------------------------------------------------------ ssh, doas
echo "AllowUsers $ADMIN_USER" >> /etc/ssh/sshd_config
[ -f /etc/ssh/ssh_host_ed25519_key ] || ssh-keygen -q -t ed25519 -N "" -f /etc/ssh/ssh_host_ed25519_key
chmod 600 /etc/doas.d/wheel.conf

# ------------------------------------------------------------------ network
if [ -f "$INST/wifi-network" ]; then
  mkdir -p /etc/wpa_supplicant
  {
    echo "ctrl_interface=DIR=/run/wpa_supplicant GROUP=wheel"
    echo "country=$WIFI_COUNTRY"
    cat "$INST/wifi-network"
  } > /etc/wpa_supplicant/wpa_supplicant.conf
  chmod 600 /etc/wpa_supplicant/wpa_supplicant.conf
  say "Wi-Fi: $WIFI_SSID"
fi
if [ -s "$INST/ts-authkey" ]; then
  mkdir -p /etc/tailscale
  cp "$INST/ts-authkey" /etc/tailscale/authkey
  chmod 600 /etc/tailscale/authkey
  say "Tailscale: will join with the auth key on first boot"
fi
if [ -f /var/lib/tailscale/tailscaled.state ]; then say "Tailscale: migrated identity"; fi

# ------------------------------------------------------------------ apps
mkdir -p /srv/www
if [ "$NOMCOLAB" = yes ]; then
  mkdir -p /srv/nomcolab/datos /srv/nomcolab/respaldos
  chown -R nomcolab:nomcolab /srv/nomcolab
  mkdir -p /etc/crontabs
  grep -q nomcolab-respaldo /etc/crontabs/root 2>/dev/null \
    || echo "30 3 * * * /usr/local/sbin/nomcolab-respaldo" >> /etc/crontabs/root
  if ! [ -f /srv/nomcolab/nom-colab.jar ]; then say "NOM-COLAB: copy nom-colab.jar to /srv/nomcolab/ later"; fi
fi

# ------------------------------------------------------------------ stock kernel initramfs
if ls /lib/modules/*-lts >/dev/null 2>&1; then
  sed -i 's/^features=.*/features="ata base ext4 nvme scsi usb"/' /etc/mkinitfs/mkinitfs.conf
  for k in /lib/modules/*-lts; do mkinitfs -o /boot/initramfs-lts "$(basename "$k")" >/dev/null; done
  say "initramfs for the stock kernel rebuilt"
fi

# ------------------------------------------------------------------ s6: boot bundle + compiled database
src=/etc/s6-rc/source
rm -rf "$src/default"
mkdir -p "$src/default/contents.d"
echo bundle > "$src/default/type"
: > "$src/default/contents.d/base"
if [ -n "${WIFI_SSID:-}" ]; then : > "$src/default/contents.d/wifi"; fi
if [ "$WEB" = yes ]; then : > "$src/default/contents.d/web"; fi
if [ "$NOMCOLAB" = yes ] && [ "$NOMCOLAB_AUTOSTART" = yes ]; then : > "$src/default/contents.d/nomcolab-app"; fi
say "boot bundle: $(ls "$src/default/contents.d" | tr '\n' ' ')"

rm -rf /etc/s6-rc/compiled /etc/s6-rc/compiled-*
s6-rc-compile /etc/s6-rc/compiled-initial "$src"
ln -sfn compiled-initial /etc/s6-rc/compiled

# ------------------------------------------------------------------ s6-linux-init as PID 1
rm -rf /etc/s6-linux-init/current
s6-linux-init-maker \
  -c /etc/s6-linux-init/current \
  -u s6log \
  -1 \
  -G "/sbin/getty 38400 tty1 linux" \
  -p "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  -m 0022 \
  -t 2 \
  -s /run/kernel_env \
  -D default \
  -f /etc/s6-linux-init/skel \
  /etc/s6-linux-init/current
for b in init halt poweroff reboot shutdown telinit; do
  if [ -e "/etc/s6-linux-init/current/bin/$b" ]; then ln -sf "/etc/s6-linux-init/current/bin/$b" "/sbin/$b"; fi
done
say "init: $(readlink /sbin/init)"

cat > /etc/motd <<EOF

  $SERVER_NAME - Alpine + s6, headless
  svc                  services (svc log <name>, svc restart <name>)
  doas kernel-min ...  build / confirm / roll back the stripped kernel
  nomcolab             NOM-COLAB (up, down, estado)
  tailscale status     tailnet; Funnel: tailscale funnel status

EOF

rm -rf "$INST"
echo "   configure.sh done"
