#!/bin/sh
# make-sd.sh /dev/<sdcard> - run as root on your laptop (Linux). ERASES the
# microSD card and writes a headless Raspberry Pi 5 server that boots straight
# into SSH + Tailscale:
#
#   p1  FAT32 256 MB  config.txt, cmdline per slot, kernels:
#                     a/  stripped kernel (kernel/build-kernel.sh)  <- default
#                     b/  free slot for kernel updates (tryboot)
#                     s/  Alpine's stock kernel + initramfs (rescue)
#   p2  ext4          Alpine (aarch64) + s6 + OpenSSH + Tailscale + nginx
#
# Before: kernel/build-kernel.sh (as your user), and qemu-user-static so this
# x86 laptop can run the Alpine install scripts for aarch64 (binfmt).
set -eu
HERE=$(dirname "$(readlink -f "$0")")
die() { echo "make-sd: ERROR: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }
get() { if command -v wget >/dev/null; then wget -q -O "$2" "$1"; else curl -fsSL -o "$2" "$1"; fi; }

[ -f "$HERE/config.env" ] || die "cp config.example.env config.env, edit it, run again"
# shellcheck disable=SC1091
. "$HERE/config.env"
DEV=${1:-}
OUT=${KERNEL_OUT:-$HERE/kernel/build/out}
BRANCH=${ALPINE_BRANCH:-v3.24}
MIRROR=${ALPINE_MIRROR:-https://dl-cdn.alpinelinux.org/alpine}

# ------------------------------------------------------------------ checks
[ "$(id -u)" = 0 ] || die "run as root (sudo)"
[ -b "$DEV" ] || die "usage: sudo $0 /dev/<sdcard>   (see: lsblk)"
rootdisk=$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null || true)
[ "/dev/$rootdisk" != "$DEV" ] || die "$DEV holds this laptop's own system"
[ -f "$OUT/kernel_2712.img" ] || die "no kernel in $OUT: run kernel/build-kernel.sh first (as your user)"
for t in sfdisk mkfs.vfat mkfs.ext4 blkid tar; do command -v $t >/dev/null || die "missing $t"; done
if [ "$(uname -m)" != aarch64 ] && ! [ -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ]; then
  die "this PC cannot run aarch64 programs yet: apt install qemu-user-static (Fedora: dnf install qemu-user-static)"
fi
keys=$(mktemp)
printf '%s\n' "$SSH_KEYS" | sed 's/^[[:space:]]*//' | grep -E '^(ssh-|ecdsa-|sk-)' > "$keys" || true
[ -s "$keys" ] || die "no SSH public key in SSH_KEYS (cat ~/.ssh/id_ed25519.pub)"
[ -z "$WIFI_SSID" ] || [ ${#WIFI_PSK} -ge 8 ] || die "WIFI_PSK must have at least 8 characters"
[ -z "$WIFI_SSID" ] || [ -n "$WIFI_COUNTRY" ] || die "set WIFI_COUNTRY (two letters) for Wi-Fi"
[ -z "${SITE_DIR:-}" ] || [ -d "$SITE_DIR" ] || die "SITE_DIR=$SITE_DIR is not a folder"

echo "This ERASES everything on $DEV:"
lsblk -o NAME,SIZE,MODEL,TRAN,FSTYPE,LABEL,MOUNTPOINTS "$DEV" 2>/dev/null || lsblk "$DEV"
# Keep asking: a key pressed earlier (e.g. while the kernel compiled) must not decide this
while :; do
  printf 'Is this the microSD card for the Pi? Type yes to erase it, or no: '
  read -r answer || die "cancelled, nothing was changed"
  case "$answer" in
    yes) break ;;
    no|n|NO) die "cancelled, nothing was changed" ;;
  esac
done

part() { case "$DEV" in *[0-9]) echo "${DEV}p$1" ;; *) echo "${DEV}$1" ;; esac; }
P1=$(part 1) P2=$(part 2)
R=$(mktemp -d)
cleanup() {
  for m in "$R/dev" "$R/sys" "$R/proc" "$R/boot" "$R"; do mountpoint -q "$m" && umount -l "$m"; done
  rm -f "$keys"
}
trap cleanup EXIT

# ------------------------------------------------------------------ card
step "partitioning $DEV"
for p in "$DEV"?* ; do umount "$p" 2>/dev/null || true; done
DISKID=$(od -An -N4 -tx4 /dev/urandom | tr -d ' \n')
sfdisk -q --wipe always --wipe-partitions always "$DEV" <<EOF
label: dos
label-id: 0x$DISKID
size=256MiB, type=c, bootable
type=83
EOF
command -v udevadm >/dev/null && udevadm settle
sleep 2
mkfs.vfat -F 32 -n BOOT "$P1" >/dev/null
mkfs.ext4 -q -F -L alpine-root "$P2"
ROOT_UUID=$(blkid -s UUID -o value "$P2")
BOOT_UUID=$(blkid -s UUID -o value "$P1")
ROOT_PARTUUID=$DISKID-02
mount "$P2" "$R"
mkdir -p "$R/boot" "$R/proc" "$R/sys" "$R/dev"
mount -o umask=0077 "$P1" "$R/boot"
mount -t proc proc "$R/proc"
mount --rbind /sys "$R/sys"
mount --rbind /dev "$R/dev"

# ------------------------------------------------------------------ Alpine aarch64
step "installing Alpine $BRANCH (aarch64)"
host=$(uname -m)
idx=$(mktemp -d)
get "$MIRROR/$BRANCH/main/$host/APKINDEX.tar.gz" "$idx/APKINDEX.tar.gz"
v=$(tar -xzOf "$idx/APKINDEX.tar.gz" APKINDEX | awk '/^P:apk-tools-static$/ { f = 1 } f && /^V:/ { print substr($0, 3); exit }')
[ -n "$v" ] || die "apk-tools-static not found in the Alpine index"
get "$MIRROR/$BRANCH/main/$host/apk-tools-static-$v.apk" "$idx/apk.apk"
tar -xzf "$idx/apk.apk" -C "$idx" sbin/apk.static 2>/dev/null || tar -xzf "$idx/apk.apk" -C "$idx" 2>/dev/null || true
APK=$idx/sbin/apk.static
[ -x "$APK" ] || die "could not unpack apk.static"

mkdir -p "$R/etc/apk"
printf '%s\n' "$MIRROR/$BRANCH/main" "$MIRROR/$BRANCH/community" > "$R/etc/apk/repositories"
# alpine-keys first (over HTTPS), then everything else is signature-checked with them
"$APK" --arch aarch64 --root "$R" --initdb -U --allow-untrusted -q add alpine-keys
PKGS="alpine-baselayout alpine-release busybox busybox-binsh musl-utils apk-tools
  ca-certificates-bundle s6 s6-rc s6-linux-init execline mdevd e2fsprogs nftables
  tailscale openssh-server openssh-keygen doas nginx"
[ -n "$WIFI_SSID" ] && PKGS="$PKGS wpa_supplicant"
if [ "${STOCK_KERNEL:-yes}" = yes ]; then
  PKGS="$PKGS linux-rpi mkinitfs"
  if [ -n "$WIFI_SSID" ]; then PKGS="$PKGS linux-firmware-brcm linux-firmware-cypress"; else PKGS="$PKGS linux-firmware-none"; fi
fi
[ "${TIMEZONE:-UTC}" = UTC ] || PKGS="$PKGS tzdata"
# shellcheck disable=SC2086
"$APK" --arch aarch64 --root "$R" -U -q add $PKGS
rm -rf "$idx"

# ------------------------------------------------------------------ our files
step "copying the s6 service tree and settings"
# Owned by root on the card, not by the laptop user who cloned the repo
# (doas refuses a config file that root does not own)
cp -a --no-preserve=ownership "$HERE/rootfs/." "$R/"
mkdir -p "$R/usr/local/share/servidor-alpine"
tar -C "$HERE" --exclude=kernel/build -cf - kernel configure.sh config.example.env README.md \
  | tar -C "$R/usr/local/share/servidor-alpine" --no-same-owner -xf -
install -m 755 "$OUT/rpi-tryboot" "$R/usr/local/sbin/rpi-tryboot"
if [ -n "${SITE_DIR:-}" ]; then
  rm -rf "$R/srv/www/default"; mkdir -p "$R/srv/www/default"
  cp -a --no-preserve=ownership "$SITE_DIR/." "$R/srv/www/default/"
fi
if [ "${TIMEZONE:-UTC}" != UTC ]; then
  cp "$R/usr/share/zoneinfo/$TIMEZONE" "$R/etc/localtime" || die "unknown TIMEZONE $TIMEZONE"
  echo "$TIMEZONE" > "$R/etc/timezone"
fi

q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }   # sh single-quote
cat > "$R/etc/servidor-alpine.conf" <<EOF
# Written by make-sd.sh on $(date +%Y-%m-%d). Read by the s6 scripts and kernel-min.
SERVER_NAME=$(q "$SERVER_NAME")
ADMIN_USER=$(q "$ADMIN_USER")
WIFI_SSID=$(q "$WIFI_SSID")
WIFI_COUNTRY=$(q "$WIFI_COUNTRY")
TS_ACCEPT_DNS=$(q "$TS_ACCEPT_DNS")
CPU_GOVERNOR=$(q "$CPU_GOVERNOR")
USB=$(q "$USB")
KERNEL_BRANCH=$(q "$KERNEL_BRANCH")
ROOT_UUID='$ROOT_UUID'
ROOT_PARTUUID='$ROOT_PARTUUID'
BOOT_UUID='$BOOT_UUID'
EOF

INST=$R/root/.install
mkdir -p "$INST" && chmod 700 "$INST"
cp "$keys" "$INST/authorized_keys"
if [ -n "$WIFI_SSID" ]; then printf '%s\n%s\n' "$WIFI_SSID" "$WIFI_PSK" > "$INST/wifi"; fi
if [ -n "$TS_AUTHKEY" ]; then printf '%s\n' "$TS_AUTHKEY" > "$INST/ts-authkey"; fi

step "configuring inside the new system (users, passwords, ssh, s6)"
chroot "$R" /bin/sh /usr/local/share/servidor-alpine/configure.sh

# ------------------------------------------------------------------ boot partition
step "boot partition: config.txt and kernel slots"
B=$R/boot
cmdline() { # cmdline <slot>
  echo "root=PARTUUID=$ROOT_PARTUUID rootfstype=ext4 ro rootwait=20 init=/sbin/init console=ttyAMA10,115200 loglevel=4 kmin.slot=$1"
}
mkdir -p "$B/a/overlays"
cp "$OUT/kernel_2712.img" "$OUT/bcm2712-rpi-5-b.dtb" "$OUT/bcm2712d0-rpi-5-b.dtb" "$OUT/version" "$B/a/"
cp "$OUT"/overlays/*.dtbo "$B/a/overlays/"
cmdline a > "$B/a/cmdline.txt"

stock=no
if [ "${STOCK_KERNEL:-yes}" = yes ] && [ -f "$B/vmlinuz-rpi" ]; then
  d5=$(find "$B" -name bcm2712-rpi-5-b.dtb -not -path "$B/a/*" | head -n1)
  d0=$(find "$B" -name 'bcm2712d0-rpi-5-b.dtb' -not -path "$B/a/*" | head -n1)
  ov=$(find "$B" -name disable-wifi-pi5.dtbo -not -path "$B/a/*" | head -n1)
  if [ -n "$d5" ] && [ -f "$B/initramfs-rpi" ]; then
    mkdir -p "$B/s/overlays"
    cp "$B/vmlinuz-rpi" "$B/s/kernel_2712.img"
    cp "$B/initramfs-rpi" "$B/s/initramfs_2712"
    cp "$d5" "$B/s/"
    if [ -n "$d0" ]; then cp "$d0" "$B/s/"; else cp "$d5" "$B/s/bcm2712d0-rpi-5-b.dtb"; fi
    if [ -n "$ov" ]; then cp "$(dirname "$ov")"/disable-wifi-pi5.dtbo "$(dirname "$ov")"/disable-bt-pi5.dtbo "$B/s/overlays/"; fi
    echo "root=UUID=$ROOT_UUID rootfstype=ext4 ro modules=sd-mod,mmc_block,ext4 init=/sbin/init console=ttyAMA10,115200 kmin.slot=s" > "$B/s/cmdline.txt"
    stock=yes
  else
    echo "   WARNING: Alpine's linux-rpi has no Pi 5 device tree here: no stock rescue slot"
  fi
fi

radios="dtoverlay=disable-wifi-pi5
dtoverlay=disable-bt-pi5"
[ -n "$WIFI_SSID" ] && radios="dtoverlay=disable-bt-pi5"
cat > "$B/config.txt" <<EOF
# Raspberry Pi 5 - servidor-alpine. The firmware loads everything from the
# os_prefix folder: kernel_2712.img, the .dtb, overlays/ and cmdline.txt.
#   a/ b/  stripped kernel (kernel-min installs updates in the free one)
#   s/     Alpine stock kernel, rescue$( [ $stock = yes ] || echo ' (not installed)' )
# Rescue from another computer: change os_prefix=a/ below to os_prefix=s/.

[all]
os_prefix=a/
kernel=kernel_2712.img
arm_64bit=1
auto_initramfs=1
disable_splash=1
camera_auto_detect=0
display_auto_detect=0
dtparam=audio=off
dtparam=cooling_fan=on
$radios

# One-time trial boot of a new kernel (kernel-min trial)
[tryboot]
os_prefix=b/
EOF
sync

fp=$(chroot "$R" ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub)
# `pi5.sh find` recognises the Pi by this key, and pre-trusts it for `ssh pi5`
cp "$R/etc/ssh/ssh_host_ed25519_key.pub" "$HERE/pi5-hostkey.pub"
if [ -n "${SUDO_USER:-}" ]; then chown "$SUDO_USER" "$HERE/pi5-hostkey.pub"; fi
cleanup
trap - EXIT
cat <<EOF

Done. Put the card in the Pi 5, plug Ethernet and power. In ~30 s:
  ssh $ADMIN_USER@<pi's LAN IP>        (your router lists it as "$SERVER_NAME")
  ssh $ADMIN_USER@$SERVER_NAME         (over Tailscale, once it has joined)
SSH host key, check it on the first connection:
  $fp
Rescue: on any computer, edit config.txt on the card: os_prefix=a/ -> os_prefix=s/
EOF
