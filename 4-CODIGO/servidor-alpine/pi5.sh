#!/bin/sh
# pi5.sh - does everything on your laptop, run as your normal user:
#   1. installs the build tools (apt, dnf or pacman; asks for sudo)
#   2. writes config.env from what it finds: your SSH key (makes one if you
#      have none), your user name and time zone; asks for the optional bits
#   3. builds the Raspberry Pi 5 kernel
#   4. finds the microSD card and writes it (asks before erasing)
#
#   sh pi5.sh          all of the above (safe to run again: reuses what is done)
#   sh pi5.sh find     after the Pi boots: find it and make `ssh pi5` work
set -eu
HERE=$(dirname "$(readlink -f "$0")")
cd "$HERE"
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\npi5.sh: %s\n' "$*" >&2; exit 1; }
ask() { printf '%s' "$1" >&2; read -r REPLY || REPLY=""; }
q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }   # sh single-quote

[ "$(id -u)" != 0 ] || die "run it as your normal user (it uses sudo only where needed): sh pi5.sh"

# ------------------------------------------------------------------ find the Pi
# Finds the Pi (Tailscale first, then the local network), checks it really is
# yours by its SSH host key, and writes a "Host pi5" entry so `ssh pi5` works.
if [ "${1:-}" = find ]; then
  [ -f config.env ] || die "no config.env here: run sh pi5.sh first"
  name=$(sed -n "s/^SERVER_NAME='\(.*\)'$/\1/p" config.env); name=${name:-pi5}
  user=$(sed -n "s/^ADMIN_USER='\(.*\)'$/\1/p" config.env); user=${user:-$(id -un)}
  blob=""; [ -f pi5-hostkey.pub ] && blob=$(cut -d' ' -f2 pi5-hostkey.pub)
  is_mine() { # is_mine <ip>: it answers SSH with the host key make-sd.sh created
    if [ -z "$blob" ]; then ssh-keyscan -T 3 "$1" >/dev/null 2>&1; return; fi
    ssh-keyscan -T 3 -t ed25519 "$1" 2>/dev/null | grep -qF "$blob"
  }
  ip=""
  if command -v tailscale >/dev/null 2>&1; then
    t=$(tailscale ip -4 "$name" 2>/dev/null | head -n1 || true)
    if [ -n "$t" ] && is_mine "$t"; then ip=$t; echo "   found $name on Tailscale: $ip (works from anywhere)"; fi
  fi
  if [ -z "$ip" ]; then
    # The laptop's real LAN interface (not Tailscale, VPNs or containers)
    net=$(ip -4 route show default | awk '{ for (i = 1; i < NF; i++) if ($i == "dev") print $(i + 1) }' \
      | grep -vE '^(tailscale|tun|wg|docker|br-|virbr|veth)' | head -n1)
    [ -n "$net" ] || die "this laptop has no network"
    if ! command -v arp-scan >/dev/null 2>&1; then
      echo "   installing arp-scan (lists every device on the network)"
      if command -v apt-get >/dev/null; then sudo apt-get install -y -qq arp-scan
      elif command -v dnf >/dev/null; then sudo dnf install -y -q arp-scan
      elif command -v pacman >/dev/null; then sudo pacman -S --needed --noconfirm arp-scan; fi
    fi
    say "every device on your network ($net, $(ip -4 -o addr show "$net" | awk '{ print $4; exit }')):"
    scan=$(mktemp)
    if command -v arp-scan >/dev/null 2>&1; then
      # ARP reaches every device on the network, even ones that ignore ping
      sudo arp-scan --localnet --interface "$net" --plain --retry 3 2>/dev/null | sort -t. -k4 -n -u > "$scan"
    else
      base=$(ip -4 -o addr show "$net" | awk '{ print $4; exit }'); base=${base%.*}
      i=1; while [ $i -le 254 ]; do ping -c1 -W1 "$base.$i" >/dev/null 2>&1 & i=$((i + 1)); done; wait
      ip neigh show dev "$net" | awk '/lladdr/ { print $1 "\t" $3 "\t" }' > "$scan"
    fi
    pimac='^(2c:cf:67|d8:3a:dd|dc:a6:32|e4:5f:01|28:cd:c1|b8:27:eb|88:a2:9e)'
    while IFS='	' read -r a m v; do
      tag=""; echo "$m" | grep -qiE "$pimac" && tag="   <-- Raspberry Pi"
      printf '   %-16s %-18s %s%s\n' "$a" "$m" "$v" "$tag"
    done < "$scan"
    echo "   ($(wc -l < "$scan") devices)"
    pis=$(awk -F'\t' -v re="$pimac" 'tolower($2) ~ re { print $1 }' "$scan")
    rest=""; [ -n "$blob" ] && rest=$(cut -f1 "$scan")
    rm -f "$scan"
    for c in $pis $rest; do
      if is_mine "$c"; then ip=$c; break; fi
    done
    if [ -z "$ip" ]; then
      if [ -n "$pis" ]; then
        die "a Raspberry Pi is there ($pis) but it does not answer SSH yet: wait a minute and run sh pi5.sh find again"
      fi
      die "no Raspberry Pi on the network: it did not get an address. Unplug its power, put the card in the laptop and run: sudo sh check-sd.sh"
    fi
    echo "   found the Pi at $ip"
  fi

  # ~/.ssh/config: our block first (first match wins in ssh), everything else kept
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  touch "$HOME/.ssh/config"
  {
    printf '# >>> %s (written by pi5.sh find)\nHost %s\n    HostName %s\n    User %s\n    HostKeyAlias %s\n# <<< %s\n\n' \
      "$name" "$name" "$ip" "$user" "$name" "$name"
    awk -v n="$name" '
      $0 == "# >>> " n " (written by pi5.sh find)" { skip = 1; next }
      skip && $0 == "# <<< " n { skip = 0; blank = 1; next }
      skip { next }
      blank && $0 == "" { blank = 0; next }
      { blank = 0; print }' "$HOME/.ssh/config"
  } > "$HOME/.ssh/config.new"
  mv "$HOME/.ssh/config.new" "$HOME/.ssh/config"; chmod 600 "$HOME/.ssh/config"
  # Pre-trust the key make-sd.sh recorded, so the first `ssh pi5` asks nothing
  if [ -n "$blob" ]; then
    ssh-keygen -R "$name" >/dev/null 2>&1 || true
    echo "$name $(cut -d' ' -f1,2 pi5-hostkey.pub)" >> "$HOME/.ssh/known_hosts"
  fi
  printf '\n   Now just:  ssh %s\n' "$name"
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

cat <<EOF

All done. Now:
  1. Take the card out of the laptop and put it in the Pi 5.
  2. Plug the network cable into the Pi, then the power.
  3. Wait one minute, then here on the laptop:
       sh pi5.sh find        finds the Pi and sets up the name
       ssh pi5
EOF
if grep -q "^TS_AUTHKEY=''" config.env; then
  cat <<EOF
  4. On the Pi, join Tailscale (open the link it prints):
       doas tailscale up --qr
EOF
fi
cat <<EOF
  Publish the site (on the Pi):  doas tailscale funnel --bg 80
EOF
