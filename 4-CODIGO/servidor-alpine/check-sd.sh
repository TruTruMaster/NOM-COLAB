#!/bin/sh
# check-sd.sh [/dev/<sdcard>] - run with sudo on the laptop, card inserted.
# Mounts the card READ-ONLY, checks everything make-sd.sh puts there, unmounts.
# Changes nothing on the card.
#   sudo sh check-sd.sh            (finds the card itself)
HERE=$(dirname "$(readlink -f "$0")")
die() { echo "check-sd: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run it with sudo: sudo sh $0"

DEV=${1:-}
if [ -z "$DEV" ] && [ -z "${CHECK_ROOT:-}" ]; then
  rootdisk=$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null || true)
  DEV=$(lsblk -dpno NAME,RM,TRAN,TYPE | awk -v r="/dev/$rootdisk" \
    '$1 != r && $NF == "disk" && ($2 == 1 || $3 == "usb" || $3 == "mmc" || $1 ~ /mmcblk/) { print $1 }')
  [ -n "$DEV" ] || die "no microSD card found in this laptop"
  [ "$(echo "$DEV" | wc -l)" = 1 ] || die "several removable disks ($(echo "$DEV" | tr '\n' ' ')): sudo sh $0 /dev/<the card>"
fi

# The helpers below run through check(); shellcheck cannot see that
# shellcheck disable=SC2317
ok=0 bad=0
pass() { ok=$((ok + 1)); printf '  ok    %s\n' "$*"; }
fail() { bad=$((bad + 1)); printf '  FAIL  %s\n' "$*"; }
check() { # check <description> <test command...>
  d=$1; shift
  if "$@" >/dev/null 2>&1; then pass "$d"; else fail "$d"; fi
}
has() { [ -e "$1" ] || [ -L "$1" ]; }                 # exists (symlinks not followed: they point into the card)
bigger() { [ -f "$1" ] && [ "$(wc -c < "$1")" -gt "$2" ]; }
contains() { grep -q -- "$2" "$1"; }
in_group() { awk -F: -v g="$1" -v u="$2" '$1 == g { n = split($4, m, ","); for (i = 1; i <= n; i++) if (m[i] == u) f = 1 } END { exit !f }' "$R/etc/group"; }
has_password() { awk -F: -v u="$1" '$1 == u { f = 1; ok = ($2 ~ /^[$]/) } END { exit !(f && ok) }' "$R/etc/shadow"; }
sshd_locked_down() {
  c=$R/etc/ssh/sshd_config
  grep -q '^PasswordAuthentication no' "$c" && grep -q '^PermitRootLogin no' "$c" && grep -qx "AllowUsers $1" "$c"
}
in_bin() { for dir in bin sbin usr/bin usr/sbin; do has "$R/$dir/$1" && return 0; done; return 1; }

# ------------------------------------------------------------------ mount read-only
if [ -n "${CHECK_ROOT:-}" ]; then       # testing: already-unpacked folders
  R=$CHECK_ROOT B=${CHECK_BOOT:?} P1=boot P2=root
else
  case "$DEV" in *[0-9]) P1=${DEV}p1 P2=${DEV}p2 ;; *) P1=${DEV}1 P2=${DEV}2 ;; esac
  for p in "$P1" "$P2"; do umount "$p" 2>/dev/null; done
  B=$(mktemp -d) R=$(mktemp -d)
  trap 'umount "$B" "$R" 2>/dev/null; rmdir "$B" "$R" 2>/dev/null' EXIT
  mount -o ro "$P1" "$B" || die "cannot mount $P1"
  mount -o ro "$P2" "$R" || die "cannot mount $P2"
  echo "card: $DEV  ($(lsblk -dno SIZE,MODEL "$DEV" | tr -s ' '))"
fi

# shellcheck disable=SC1091
. "$R/etc/servidor-alpine.conf" 2>/dev/null || true
user=${ADMIN_USER:-}

echo
echo "boot partition ($P1):"
check "config.txt boots slot a/"                    contains "$B/config.txt" '^os_prefix=a/'
check "config.txt has the [tryboot] section"         contains "$B/config.txt" '^\[tryboot\]'
check "config.txt turns the fan on"                  contains "$B/config.txt" 'cooling_fan=on'
check "a/kernel_2712.img (stripped kernel, $(cat "$B/a/version" 2>/dev/null))" bigger "$B/a/kernel_2712.img" 5000000
check "a/bcm2712-rpi-5-b.dtb"                        has "$B/a/bcm2712-rpi-5-b.dtb"
check "a/bcm2712d0-rpi-5-b.dtb"                      has "$B/a/bcm2712d0-rpi-5-b.dtb"
check "a/overlays/disable-wifi-pi5.dtbo"             has "$B/a/overlays/disable-wifi-pi5.dtbo"
check "a/overlays/disable-bt-pi5.dtbo"               has "$B/a/overlays/disable-bt-pi5.dtbo"
check "Ethernet EEE off (eee-off-pi5 in config.txt and in /overlays, the folder the firmware reads)" \
  sh -c "grep -q '^dtoverlay=eee-off-pi5' '$B/config.txt' && test -f '$B/overlays/eee-off-pi5.dtbo' && ! test -e '$B/a/overlays/README'"
check "a/cmdline.txt points at this card's root ($ROOT_PARTUUID)" contains "$B/a/cmdline.txt" "root=PARTUUID=${ROOT_PARTUUID:-none} "
check "s/ stock rescue kernel + initramfs"           bigger "$B/s/initramfs_2712" 1000000
check "s/cmdline.txt points at this card's root"    contains "$B/s/cmdline.txt" "root=UUID=${ROOT_UUID:-none} "
if [ -z "${CHECK_ROOT:-}" ]; then
  check "partition 2 really has PARTUUID $ROOT_PARTUUID" test "$(blkid -s PARTUUID -o value "$P2")" = "$ROOT_PARTUUID"
  check "partition 2 really has UUID $ROOT_UUID"         test "$(blkid -s UUID -o value "$P2")" = "$ROOT_UUID"
fi

echo
echo "system ($P2):"
check "Alpine $(cat "$R/etc/alpine-release" 2>/dev/null) (aarch64)" contains "$R/etc/apk/arch" aarch64
check "/sbin/init is s6-linux-init"                  test "$(readlink "$R/sbin/init")" = /etc/s6-linux-init/current/bin/init
check "s6-linux-init built (bin/init, scripts/rc.init)" has "$R/etc/s6-linux-init/current/scripts/rc.init"
check "s6-rc database compiled"                      has "$R/etc/s6-rc/compiled/resolve.cdb"
check "boot bundle has base + web"                   test -e "$R/etc/s6-rc/source/default/contents.d/base" -a -e "$R/etc/s6-rc/source/default/contents.d/web"
for b in busybox s6-svscan s6-rc s6-linux-init mdevd e2fsck nft sshd tailscaled tailscale nginx doas; do
  check "program $b"                                 in_bin "$b"
done
check "rpi-tryboot, svc, kernel-min"                 test -x "$R/usr/local/sbin/rpi-tryboot" -a -x "$R/usr/local/sbin/svc" -a -x "$R/usr/local/sbin/kernel-min"
check "stock kernel modules (rescue slot)"           sh -c "ls -d '$R'/lib/modules/*rpi* '$R'/usr/lib/modules/*rpi* 2>/dev/null | grep -q ."
check "hostname is ${SERVER_NAME:-?}"                test "$(cat "$R/etc/hostname")" = "${SERVER_NAME:-x}"
check "fstab mounts this card's root and boot"       sh -c "grep -q 'UUID=$ROOT_UUID ' '$R/etc/fstab' && grep -q 'UUID=$BOOT_UUID ' '$R/etc/fstab'"
check "firewall rules (/etc/nftables.nft)"           contains "$R/etc/nftables.nft" 'table inet host'
check "website (/srv/www/default/index.html)"        has "$R/srv/www/default/index.html"

echo
echo "access:"
uid=$(awk -F: -v u="$user" '$1 == u { print $3 }' "$R/etc/passwd")
home=$(awk -F: -v u="$user" '$1 == u { print $6 }' "$R/etc/passwd")
check "user '$user' exists"                          test -n "$uid"
check "'$user' is in wheel (doas)"                   in_group wheel "$user"
check "'$user' has a password (for doas)"            has_password "$user"
laptop_home=$(getent passwd "${SUDO_USER:-root}" | cut -d: -f6)
key=$(cut -d' ' -f2 "$laptop_home/.ssh/id_ed25519.pub" 2>/dev/null)
[ -n "$key" ] || key=$(sed -n "s/^SSH_KEYS='[^ ]* \([^ ]*\).*/\1/p" "$HERE/config.env" 2>/dev/null)
check "your laptop's SSH key is in authorized_keys"  contains "$R$home/.ssh/authorized_keys" "${key:-no-key-found}"
check "authorized_keys belongs to '$user', mode 600" test "$(stat -c '%u %a' "$R$home/.ssh/authorized_keys")" = "$uid 600"
check "sshd: keys only, no root, AllowUsers $user"   sshd_locked_down "$user"
check "SSH host key"                                 has "$R/etc/ssh/ssh_host_ed25519_key"
# Everything in /etc belongs to root, except the catch-all log folder that
# s6-linux-init-maker gives to its logger user on purpose
nonroot=$(find "$R/etc" -xdev ! -user 0 -printf '%U %P\n' 2>/dev/null \
  | awk -v pw="$R/etc/passwd" 'BEGIN { FS = ":"; while ((getline l < pw) > 0) { split(l, f, ":"); n[f[3]] = f[1] } FS = " " }
      { u = $1; sub(/^[0-9]+ /, ""); print $0 " (owner " (u in n ? n[u] : "uid " u) ")" }' \
  | grep -v '^s6-linux-init/current/run-image/uncaught-logs (')
if [ -z "$nonroot" ]; then pass "/etc files owned by root (doas needs it)"
else fail "/etc files not owned by root:"; echo "$nonroot" | head -n 15 | sed 's|^|          /etc/|'; fi
check "doas rule for wheel (root-owned, 600)"        test "$(stat -c '%u %a' "$R/etc/doas.d/wheel.conf")" = "0 600"
if [ -n "${WIFI_SSID:-}" ]; then
  check "Wi-Fi '$WIFI_SSID' configured"              has "$R/etc/wpa_supplicant/wpa_supplicant.conf"
fi
if [ -s "$R/etc/tailscale/authkey" ]; then pass "Tailscale auth key ready (joins on first boot)"
else echo "  --    no Tailscale key on the card: after the first boot run 'doas tailscale up --qr' on the Pi"; fi

# ------------------------------------------------------------------ what the Pi recorded
echo
echo "what the Pi itself recorded:"
num() { case "$1" in ''|*[!0-9]*) ;; *) echo "$1" ;; esac; }
boots=$(num "$(cat "$R/var/lib/servidor-alpine/boots" 2>/dev/null)")
at=$(num "$(cat "$R/var/lib/servidor-alpine/boots-at-update" 2>/dev/null)")
if [ -n "$boots" ] && [ -n "$at" ]; then
  echo "  it booted $((boots - at)) time(s) since the card was last written or updated ($boots in total)"
elif [ -n "$at" ]; then
  echo "  it has NOT booted since the card was last written or updated (or never got as far as mounting its disk)"
elif [ -n "$boots" ]; then
  echo "  it booted $boots time(s) in total"
else
  echo "  (no boot counter on this card yet: sudo sh update-sd.sh adds it)"
fi
logs=""
if [ -z "${CHECK_ROOT:-}" ]; then
  # Complete copies on the laptop: the report and every log the Pi keeps on the card
  logs=$HERE/pi5-logs
  rm -rf "$logs"; mkdir -p "$logs"
  cp -r "$R/var/log" "$logs/" 2>/dev/null
  cp "$B"/boot-report*.txt "$logs/" 2>/dev/null
  chmod -R u+rwX "$logs"
  if [ -n "${SUDO_USER:-}" ]; then chown -R "$SUDO_USER" "$logs"; fi
  echo "  complete copies of its report and logs (nothing cut): $logs"
fi

if [ -f "$B/boot-report.txt" ]; then
  echo
  echo "=== the Pi's boot report (written 30 s and 2 min after it booted):"
  cat "$B/boot-report.txt"
  # `pi5.sh find` marks this address in the list of devices on the network
  mac=$(awk '/^[0-9]+: eth0:/ { e = 1 } e && /link\/ether/ { print $2; exit }' "$B/boot-report.txt")
  if [ -n "$mac" ] && [ -z "${CHECK_ROOT:-}" ]; then
    echo "$mac" > "$HERE/pi5-mac"
    if [ -n "${SUDO_USER:-}" ]; then chown "$SUDO_USER" "$HERE/pi5-mac"; fi
  fi
  # Is the Pi's cable on the same network as this laptop?
  pi_ip=$(awk '/^ +inet .* scope global eth0/ { sub(/\/.*/, "", $2); print $2; exit }' "$B/boot-report.txt")
  pi_gw=$(awk '/^default via .* dev eth0/ { print $3; exit }' "$B/boot-report.txt")
  my_gw=$(ip -4 route show default 2>/dev/null | awk '$0 !~ /tailscale/ { print $3; exit }')
  echo
  if [ -z "$pi_ip" ]; then
    echo "network: the Pi got NO address on its cable."
  elif [ -z "$my_gw" ]; then
    echo "network: the Pi got $pi_ip from router ${pi_gw:-none}."
  elif [ "$pi_gw" != "$my_gw" ]; then
    echo "network: the Pi got $pi_ip from router ${pi_gw:-none}, but this laptop uses router $my_gw."
    echo "         The Pi's cable is on ANOTHER network (another router, modem or extender),"
    echo "         so this laptop cannot reach it. Plug the cable into the router at $my_gw."
  else
    echo "network: the Pi got $pi_ip from router $pi_gw, the same router as this laptop."
  fi
else
  echo
  echo "  no boot report from a boot after the last update (the Pi writes it 30 s after booting)"
  if [ -f "$B/boot-report-before-update.txt" ] && [ -n "$logs" ]; then
    echo "  the report from before the update: $logs/boot-report-before-update.txt"
  fi
  # The logs stay on the card across boots: newest lines are the latest boot
  for l in net sshd tailscaled system syslogd; do
    if [ -f "$R/var/log/$l/current" ]; then
      n=30; [ $l = syslogd ] && n=80
      echo; echo "--- the Pi's /var/log/$l (last $n lines)"; tail -n $n "$R/var/log/$l/current"
    fi
  done
fi

echo
if [ "$bad" = 0 ]; then echo "check-sd: all $ok checks passed. The card is complete."
else echo "check-sd: $bad of $((ok + bad)) checks FAILED (send me this output)"; fi
[ -n "${CHECK_ROOT:-}" ] || echo "check-sd: card unmounted, you can remove it."
exit "$bad"
