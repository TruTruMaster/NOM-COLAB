#!/bin/sh
# 1-install.sh <disk> - run as root on the Alpine "extended" USB stick (UEFI mode).
#
# ERASES <disk> and installs Alpine + s6 + the services in config.env:
#   ESP (FAT32, 512 MB, mounted on /boot) + ext4 root, no bootloader: the
#   firmware boots the kernel directly (EFI stub). First boot uses Alpine's
#   stock kernel; build the stripped one afterwards with `kernel-min build`.
#
#   MIGRATION=/media/usb/nomcolab-migracion ./1-install.sh /dev/nvme0n1
set -eu
HERE=$(dirname "$(readlink -f "$0")")
die() { echo "1-install: ERROR: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

[ -f "$HERE/config.env" ] || die "cp config.example.env config.env, edit it, run again"
# shellcheck disable=SC1091
. "$HERE/config.env"
DISK=${1:-}
MIG=${MIGRATION:-}

# ------------------------------------------------------------------ checks
[ "$(id -u)" = 0 ] || die "run as root"
grep -qi alpine /etc/os-release || die "run this from the Alpine USB stick"
[ -d /sys/firmware/efi ] || die "the USB stick was booted in legacy BIOS mode: enable UEFI in the BIOS setup"
[ -b "$DISK" ] || die "usage: $0 /dev/<disk>   (see: lsblk)"
grep -q "^$DISK" /proc/mounts && die "$DISK is mounted (is it the USB stick?)"
[ -z "$MIG" ] || [ -d "$MIG" ] || die "MIGRATION=$MIG is not a folder"

keys=$(mktemp)
printf '%s\n' "$SSH_KEYS" | sed 's/^[[:space:]]*//' | grep -E '^(ssh-|ecdsa-|sk-)' > "$keys" || true
if [ -n "$MIG" ] && [ -f "$MIG/authorized_keys" ]; then grep -E '^(ssh-|ecdsa-|sk-)' "$MIG/authorized_keys" >> "$keys" || true; fi
sort -u -o "$keys" "$keys"
[ -s "$keys" ] || die "no SSH public key: set SSH_KEYS in config.env (or migrate authorized_keys)"
[ -z "$WIFI_SSID" ] || [ ${#WIFI_PSK} -ge 8 ] || die "WIFI_PSK must have at least 8 characters"

part() { case "$DISK" in *[0-9]) echo "${DISK}p$1" ;; *) echo "${DISK}$1" ;; esac; }
P1=$(part 1) P2=$(part 2)
BRANCH=v$(cut -d. -f1,2 /etc/alpine-release)
MIRROR=${ALPINE_MIRROR:-https://dl-cdn.alpinelinux.org/alpine}

echo "This ERASES everything on $DISK:"
lsblk -o NAME,SIZE,MODEL,FSTYPE,LABEL "$DISK" 2>/dev/null || fdisk -l "$DISK"
printf 'Type the disk name (%s) to continue: ' "$DISK"
read -r answer
[ "$answer" = "$DISK" ] || die "cancelled"

# ------------------------------------------------------------------ tools for the installer itself
step "installer tools"
apk add -q -X "$MIRROR/$BRANCH/main" -X "$MIRROR/$BRANCH/community" \
  sfdisk dosfstools e2fsprogs efibootmgr blkid tzdata wpa_supplicant

# ------------------------------------------------------------------ disk
step "partitioning $DISK (GPT: ESP 512M + root ${ROOT_SIZE:-rest of disk})"
sfdisk -q --wipe always --wipe-partitions always "$DISK" <<EOF
label: gpt
size=512MiB, type=U, name="ESP"
${ROOT_SIZE:+size=$ROOT_SIZE, }type=L, name="alpine-root"
EOF
sleep 2
mkfs.vfat -F 32 -n ESP "$P1" >/dev/null
mkfs.ext4 -q -F -L alpine-root "$P2"
ROOT_UUID=$(blkid -s UUID -o value "$P2")
ROOT_PARTUUID=$(blkid -s PARTUUID -o value "$P2")
ESP_UUID=$(blkid -s UUID -o value "$P1")
mount -t ext4 "$P2" /mnt
mkdir -p /mnt/boot
mount -t vfat -o umask=0077 "$P1" /mnt/boot
for d in proc sys dev; do mkdir -p "/mnt/$d"; done
mount -t proc proc /mnt/proc
mount --rbind /sys /mnt/sys
mount --rbind /dev /mnt/dev

# ------------------------------------------------------------------ packages
step "installing Alpine $BRANCH packages"
PKGS="alpine-baselayout alpine-release alpine-keys apk-tools busybox busybox-binsh musl-utils
  ca-certificates-bundle s6 s6-rc s6-linux-init execline mdevd e2fsprogs dosfstools efibootmgr
  nftables tailscale openssh-server openssh-keygen doas intel-ucode linux-lts mkinitfs kmod"
if [ -n "$WIFI_SSID" ]; then
  PKGS="$PKGS wpa_supplicant wireless-regdb linux-firmware-intel linux-firmware-other"
else
  PKGS="$PKGS linux-firmware-none"
fi
if [ "$WEB" = yes ]; then PKGS="$PKGS nginx"; fi
if [ "$NOMCOLAB" = yes ]; then PKGS="$PKGS openjdk21-jre-headless"; fi
mkdir -p /mnt/etc/apk/keys
cp /etc/apk/keys/* /mnt/etc/apk/keys/
printf '%s\n' "$MIRROR/$BRANCH/main" "$MIRROR/$BRANCH/community" > /mnt/etc/apk/repositories
# shellcheck disable=SC2086
apk add --root /mnt --initdb -U -q $PKGS

# ------------------------------------------------------------------ files
step "copying the s6 service tree and configuration"
cp -a "$HERE/rootfs/." /mnt/
mkdir -p /mnt/usr/local/share/servidor-alpine
cp -a "$HERE/kernel" "$HERE/configure.sh" "$HERE/config.example.env" "$HERE/README.md" /mnt/usr/local/share/servidor-alpine/
cp "/usr/share/zoneinfo/$TIMEZONE" /mnt/etc/localtime || die "unknown TIMEZONE $TIMEZONE"
echo "$TIMEZONE" > /mnt/etc/timezone

# Settings the server scripts read (no secrets)
cat > /mnt/etc/servidor-alpine.conf <<EOF
# Written by 1-install.sh on $(date +%Y-%m-%d). Read by the s6 scripts and kernel-min.
SERVER_NAME="$SERVER_NAME"
ADMIN_USER="$ADMIN_USER"
WIFI_SSID="$WIFI_SSID"
WIFI_COUNTRY="$WIFI_COUNTRY"
TS_ACCEPT_DNS="$TS_ACCEPT_DNS"
WEB="$WEB"
NOMCOLAB="$NOMCOLAB"
NOMCOLAB_AUTOSTART="$NOMCOLAB_AUTOSTART"
NOMCOLAB_DISCOVERY="$NOMCOLAB_DISCOVERY"
CPU_EPP="$CPU_EPP"
CONSOLE_BLANK="$CONSOLE_BLANK"
BATTERY_MIN="$BATTERY_MIN"
BATTERY_CHARGE_START="$BATTERY_CHARGE_START"
BATTERY_CHARGE_END="$BATTERY_CHARGE_END"
KSERIES="$KSERIES"
CONTAINERS="$CONTAINERS"
GAMING="$GAMING"
ROOT_UUID="$ROOT_UUID"
ROOT_PARTUUID="$ROOT_PARTUUID"
ESP_UUID="$ESP_UUID"
EOF

# Secrets and keys for configure.sh, deleted when it ends
INST=/mnt/root/.install
mkdir -p "$INST" && chmod 700 "$INST"
cp "$keys" "$INST/authorized_keys"
if [ -n "$WIFI_SSID" ]; then
  # stores only the derived key (psk=<hex>), not the password
  wpa_passphrase "$WIFI_SSID" "$WIFI_PSK" | grep -v '#psk=' > "$INST/wifi-network"
fi
if [ -n "$TS_AUTHKEY" ]; then printf '%s\n' "$TS_AUTHKEY" > "$INST/ts-authkey"; fi

if [ -n "$MIG" ]; then
  step "restoring migration data from $MIG"
  if [ -f "$MIG/tailscaled.state" ]; then
    mkdir -p /mnt/var/lib/tailscale
    cp "$MIG/tailscaled.state" /mnt/var/lib/tailscale/tailscaled.state
    chmod 600 /mnt/var/lib/tailscale/tailscaled.state
    echo "   Tailscale identity restored"
  fi
  if [ -d "$MIG/nomcolab" ]; then
    mkdir -p /mnt/srv/nomcolab
    cp -a "$MIG/nomcolab/." /mnt/srv/nomcolab/
    echo "   NOM-COLAB data restored ($(du -sh /mnt/srv/nomcolab | cut -f1))"
  fi
fi

# ------------------------------------------------------------------ configure inside the new system
step "configuring (users, passwords, ssh, s6)"
chroot /mnt /bin/sh /usr/local/share/servidor-alpine/configure.sh

# ------------------------------------------------------------------ boot entry
step "UEFI boot entry for the stock kernel"
# Remove entries that point to partitions that no longer exist (the old OS)
live=$(blkid -s PARTUUID -o value | tr 'A-F' 'a-f')
efibootmgr -v | sed -n 's/^Boot\([0-9A-Fa-f]\{4\}\).*HD([0-9]*,GPT,\([0-9A-Fa-f-]*\),.*/\1 \2/p' |
while read -r num guid; do
  echo "$live" | grep -qix "$guid" || { echo "   removing stale entry Boot$num"; efibootmgr -q -b "$num" -B; }
done
cmdline="initrd=\\intel-ucode.img initrd=\\initramfs-lts root=UUID=$ROOT_UUID rootfstype=ext4 ro"
cmdline="$cmdline modules=sd-mod,usb-storage,ext4,nvme init=/sbin/init consoleblank=$CONSOLE_BLANK"
efibootmgr -q -c -d "$DISK" -p 1 -L "Alpine stock (rescue)" -l '\vmlinuz-lts' -u "$cmdline"
efibootmgr

# ------------------------------------------------------------------ done
fp=$(ssh-keygen -lf /mnt/etc/ssh/ssh_host_ed25519_key.pub 2>/dev/null || chroot /mnt ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub)
sync
umount -l /mnt/dev /mnt/sys
umount /mnt/proc /mnt/boot /mnt
rm -f "$keys"
cat <<EOF

Installed. Remove the USB stick and reboot:   reboot

On first boot it gets an address by DHCP on eth0${WIFI_SSID:+ and Wi-Fi "$WIFI_SSID"}.
SSH host key (check it on your first connection):
  $fp
Then, from your device:
  ssh $ADMIN_USER@$SERVER_NAME          (tailnet, MagicDNS)   or   ssh $ADMIN_USER@<LAN IP>
EOF
