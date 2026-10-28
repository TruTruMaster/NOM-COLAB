#!/bin/sh
# configure.sh - run INSIDE the new root (chroot) by make-sd.sh.
# Reads /etc/servidor-alpine.conf and the one-time files in /root/.install
# (authorized_keys, wifi, ts-authkey, optional <user>.hash), then deletes them.
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

# commit=60: the SD card is written at most once a minute (less wear, less power)
cat > /etc/fstab <<EOF
# <device>        <dir> <type> <options>                               <dump> <pass>
UUID=$ROOT_UUID   /     ext4   rw,noatime,commit=60,errors=remount-ro    0 1
UUID=$BOOT_UUID   /boot vfat   rw,noatime,umask=0077,shortname=mixed     0 2
tmpfs             /tmp  tmpfs  nosuid,nodev,mode=1777,size=25%           0 0
EOF

# ------------------------------------------------------------------ users
id s6log >/dev/null 2>&1 || adduser -S -D -H -h /var/empty -s /sbin/nologin -G adm s6log
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

# Passwords: only used for doas and the serial console (SSH is keys only)
set_password() { # set_password <user>
  if [ -s "$INST/$1.hash" ]; then
    echo "$1:$(cat "$INST/$1.hash")" | chpasswd -e
  elif [ -t 0 ]; then
    echo "Password for '$1' (doas and the serial console; SSH never asks for it):"
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
[ -f /etc/ssh/ssh_host_ed25519_key ] || ssh-keygen -q -t ed25519 -N "" -C "root@$SERVER_NAME" -f /etc/ssh/ssh_host_ed25519_key
chmod 600 /etc/doas.d/wheel.conf

# ------------------------------------------------------------------ network
if [ -f "$INST/wifi" ]; then
  ssid=$(sed -n 1p "$INST/wifi"); psk=$(sed -n 2p "$INST/wifi")
  mkdir -p /etc/wpa_supplicant
  {
    echo "ctrl_interface=DIR=/run/wpa_supplicant GROUP=wheel"
    echo "country=$WIFI_COUNTRY"
    # only the derived key (psk=<hex>) is stored, not the password
    wpa_passphrase "$ssid" "$psk" | grep -v '#psk='
  } > /etc/wpa_supplicant/wpa_supplicant.conf
  chmod 600 /etc/wpa_supplicant/wpa_supplicant.conf
  say "Wi-Fi: $ssid"
fi
if [ -s "$INST/ts-authkey" ]; then
  mkdir -p /etc/tailscale
  cp "$INST/ts-authkey" /etc/tailscale/authkey
  chmod 600 /etc/tailscale/authkey
  say "Tailscale: joins with the auth key on first boot"
fi

# ------------------------------------------------------------------ static site
# Owned by the admin user so `scp`/`rsync` from the laptop can update it; nginx only reads
mkdir -p /srv/www/default
chown -R "$ADMIN_USER" /srv/www
find /srv/www -type d -exec chmod 755 {} +
find /srv/www -type f -exec chmod 644 {} +

# ------------------------------------------------------------------ stock kernel (rescue slot)
# Pin it: the rescue copy on the boot partition must keep matching /lib/modules
if apk info -e linux-rpi >/dev/null 2>&1; then
  v=$(awk '/^P:linux-rpi$/ { f = 1 } f && /^V:/ { print substr($0, 3); exit }' /lib/apk/db/installed)
  sed -i "s/^linux-rpi$/linux-rpi=$v/" /etc/apk/world
  say "stock kernel linux-rpi $v (rescue, pinned)"
fi
if apk info -e tzdata >/dev/null 2>&1; then apk del -q tzdata; fi

# ------------------------------------------------------------------ s6: boot bundle + compiled database
src=/etc/s6-rc/source
rm -rf "$src/default"
mkdir -p "$src/default/contents.d"
echo bundle > "$src/default/type"
: > "$src/default/contents.d/base"
: > "$src/default/contents.d/web"
if [ -n "${WIFI_SSID:-}" ]; then : > "$src/default/contents.d/wifi"; fi
say "boot bundle: $(ls "$src/default/contents.d" | tr '\n' ' ')"

rm -rf /etc/s6-rc/compiled /etc/s6-rc/compiled-*
s6-rc-compile /etc/s6-rc/compiled-initial "$src"
ln -sfn compiled-initial /etc/s6-rc/compiled

# ------------------------------------------------------------------ s6-linux-init as PID 1
# Serial console on the Pi 5's 3-pin UART connector (ttyAMA10): no screen needed
rm -rf /etc/s6-linux-init/current
s6-linux-init-maker \
  -c /etc/s6-linux-init/current \
  -u s6log \
  -1 \
  -G "/sbin/getty -L 115200 ttyAMA10 vt100" \
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

  $SERVER_NAME - Raspberry Pi 5, Alpine + s6, headless
  svc                  services (svc log <name>, svc restart <name>)
  doas kernel-min ...  build / try / confirm / roll back the stripped kernel
  tailscale status     tailnet; public site: tailscale funnel status
  site files           /srv/www/default (nginx, port 80)
  doas cloudflare-tunnel <token>   the site on your own domain

EOF

# check-sd.sh compares the Pi's boot counter with this to tell whether it booted
mkdir -p /var/lib/servidor-alpine
echo 0 > /var/lib/servidor-alpine/boots-at-update

rm -rf "$INST"
echo "   configure.sh done"
