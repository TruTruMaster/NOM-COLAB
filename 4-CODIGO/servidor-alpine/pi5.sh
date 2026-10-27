#!/bin/sh
# pi5.sh - does everything on your laptop, run as your normal user:
#   1. installs the build tools (apt, dnf or pacman; asks for sudo)
#   2. writes config.env from what it finds: your SSH key (makes one if you
#      have none), your user name and time zone; asks for the optional bits
#   3. builds the Raspberry Pi 5 kernel
#   4. finds the microSD card and writes it (asks before erasing)
#
#   sh pi5.sh          all of the above (safe to run again: reuses what is done)
#   sh pi5.sh find     after the Pi boots: find its address on your network
set -eu
HERE=$(dirname "$(readlink -f "$0")")
cd "$HERE"
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\npi5.sh: %s\n' "$*" >&2; exit 1; }
ask() { printf '%s' "$1" >&2; read -r REPLY || REPLY=""; }
q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }   # sh single-quote

[ "$(id -u)" != 0 ] || die "run it as your normal user (it uses sudo only where needed): sh pi5.sh"

# ------------------------------------------------------------------ find the Pi
if [ "${1:-}" = find ]; then
  net=$(ip -4 route show default | awk '{ print $5; exit }')
  cidr=$(ip -4 -o addr show "$net" | awk '{ print $4; exit }')
  [ -n "$cidr" ] || die "no network found"
  base=${cidr%.*}
  say "looking for a Raspberry Pi on $cidr ($net)"
  i=1; while [ $i -le 254 ]; do ping -c1 -W1 "$base.$i" >/dev/null 2>&1 & i=$((i + 1)); done; wait
  # Raspberry Pi Ltd / Foundation network card prefixes
  found=$(ip neigh show dev "$net" | grep -iE 'lladdr (2c:cf:67|d8:3a:dd|dc:a6:32|e4:5f:01|28:cd:c1|b8:27:eb|88:a2:9e)' | awk '{ print $1 }')
  [ -n "$found" ] || die "no Raspberry Pi answered (is it on the same network, with the cable in?)"
  user=$(sed -n "s/^ADMIN_USER='\(.*\)'$/\1/p" config.env 2>/dev/null)
  for a in $found; do echo "   ssh ${user:-admin}@$a"; done
  exit 0
fi

# ------------------------------------------------------------------ 1. tools
say "1/4 build tools"
if command -v apt-get >/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq git make gcc gcc-aarch64-linux-gnu bison flex bc libssl-dev libelf-dev \
    wget zstd fdisk dosfstools e2fsprogs openssh-client
  sudo apt-get install -y -qq qemu-user-static 2>/dev/null || sudo apt-get install -y -qq qemu-user-binfmt
elif command -v dnf >/dev/null; then
  sudo dnf install -y git make gcc gcc-aarch64-linux-gnu bison flex bc openssl-devel elfutils-libelf-devel \
    wget zstd util-linux dosfstools e2fsprogs openssh-clients qemu-user-static
elif command -v pacman >/dev/null; then
  sudo pacman -S --needed --noconfirm git make gcc aarch64-linux-gnu-gcc bison flex bc openssl libelf \
    wget zstd util-linux dosfstools e2fsprogs openssh qemu-user-static qemu-user-static-binfmt
else
  die "unknown Linux (no apt, dnf or pacman): install a gcc-aarch64 cross compiler and qemu-user-static by hand"
fi
if ! [ -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ]; then
  sudo systemctl restart systemd-binfmt 2>/dev/null || sudo update-binfmts --enable qemu-aarch64 2>/dev/null || true
fi
[ -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ] || die "qemu-user-static is installed but aarch64 programs are not enabled; reboot the laptop and run this again"

# ------------------------------------------------------------------ 2. config.env
say "2/4 settings"
if [ -f config.env ]; then
  echo "   using the existing config.env (delete it to start over)"
else
  key=""
  for k in "$HOME"/.ssh/id_ed25519.pub "$HOME"/.ssh/id_ecdsa.pub "$HOME"/.ssh/id_rsa.pub; do
    [ -f "$k" ] && { key=$k; break; }
  done
  if [ -z "$key" ]; then
    echo "   no SSH key on this laptop yet: making one (a passphrase is optional, Enter skips it)"
    mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
    ssh-keygen -t ed25519 -f "$HOME/.ssh/id_ed25519"
    key=$HOME/.ssh/id_ed25519.pub
  fi
  echo "   SSH key: $key"
  tz=$(timedatectl show -p Timezone --value 2>/dev/null || true)
  [ -n "$tz" ] || tz=$(readlink /etc/localtime 2>/dev/null | sed -n 's|.*/zoneinfo/||p')
  [ -n "$tz" ] || tz=UTC
  user=$(id -un)
  echo "   user on the Pi: $user (same as here, so 'ssh pi5' just works)   time zone: $tz"

  echo
  echo "   Tailscale auth key: lets the Pi join your tailnet by itself on first boot."
  echo "   Make one at https://login.tailscale.com/admin/settings/keys (Generate auth key)."
  ask "   Paste it (tskey-...), or press Enter to skip: "; tskey=$REPLY
  echo
  ask "   Folder with your website (index.html inside), or Enter for a placeholder page: "; site=$REPLY
  case "$site" in "~"/*) site=$HOME/${site#"~/"} ;; esac
  [ -z "$site" ] || [ -d "$site" ] || die "$site is not a folder"
  echo
  ask "   Wi-Fi name if the Pi will NOT have a network cable (Enter = cable): "; ssid=$REPLY
  psk="" country=""
  if [ -n "$ssid" ]; then
    ask "   Wi-Fi password: "; psk=$REPLY
    ask "   Country, two letters (MX, US, ES...): "; country=$(echo "$REPLY" | tr '[:lower:]' '[:upper:]')
  fi

  cat > config.env <<EOF
# Written by pi5.sh on $(date +%Y-%m-%d). See config.example.env for every option.
SERVER_NAME='pi5'
TIMEZONE=$(q "$tz")
ADMIN_USER=$(q "$user")
SSH_KEYS=$(q "$(cat "$key")")
WIFI_SSID=$(q "$ssid")
WIFI_PSK=$(q "$psk")
WIFI_COUNTRY=$(q "$country")
TS_AUTHKEY=$(q "$tskey")
TS_ACCEPT_DNS='no'
SITE_DIR=$(q "$site")
CPU_GOVERNOR='schedutil'
USB='no'
KERNEL_BRANCH=''
STOCK_KERNEL='yes'
ALPINE_BRANCH='v3.24'
ALPINE_MIRROR='https://dl-cdn.alpinelinux.org/alpine'
EOF
  chmod 600 config.env
  echo "   config.env written"
fi

# ------------------------------------------------------------------ 3. kernel
say "3/4 Raspberry Pi 5 kernel"
if [ -n "$(find kernel/build/out/kernel_2712.img -newer config.env 2>/dev/null)" ]; then
  echo "   already built: $(cat kernel/build/out/version)"
else
  sh kernel/build-kernel.sh
fi

# ------------------------------------------------------------------ 4. microSD
say "4/4 microSD card"
rootdisk=$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null || true)
cards=$(lsblk -dpno NAME,RM,TRAN,TYPE | awk -v r="/dev/$rootdisk" \
  '$1 != r && $NF == "disk" && ($2 == 1 || $3 == "usb" || $3 == "mmc" || $1 ~ /mmcblk/) { print $1 }')
n=$(echo "$cards" | grep -c . || true)
if [ "$n" = 0 ]; then
  die "no microSD card found: put it in the laptop (or a USB card reader) and run: sh pi5.sh"
elif [ "$n" = 1 ]; then
  dev=$cards
else
  echo "   several removable disks:"
  # shellcheck disable=SC2086
  lsblk -dpo NAME,SIZE,MODEL,TRAN $cards
  ask "   Which one is the microSD for the Pi? (full name, e.g. /dev/sdb): "; dev=$REPLY
fi
sudo sh ./make-sd.sh "$dev"

name=$(id -un)
cat <<EOF

All done. Put the card in the Pi 5, plug the network cable, then power.
In about 30 seconds, from this laptop:
EOF
if grep -q "^TS_AUTHKEY=''" config.env; then
  cat <<EOF
  sh pi5.sh find                 shows the Pi's address, then: ssh $name@<address>
  doas tailscale up --qr         (on the Pi) joins Tailscale: open the link it prints
EOF
else
  echo "  ssh pi5                        (over Tailscale)"
fi
cat <<EOF
  doas tailscale funnel --bg 80  (on the Pi) publishes the site on https://pi5.<your-tailnet>.ts.net
EOF
