#!/bin/sh
# update-sd.sh [--rescue | --normal] [/dev/<sdcard>] - run with sudo, card in the laptop.
#
# Copies this folder's newer service scripts and tools onto an already written
# card and recompiles its s6-rc database. Users, passwords, SSH keys, Wi-Fi and
# Tailscale state on the card are left alone.
#   --rescue   also make the card boot Alpine's stock kernel (slot s/), with
#              its console on an HDMI screen
#   --normal   back to the stripped kernel (slot a/)
set -eu
HERE=$(dirname "$(readlink -f "$0")")
die() { echo "update-sd: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run it with sudo: sudo sh $0"

slot=""
case "${1:-}" in --rescue) slot=s; shift ;; --normal) slot=a; shift ;; esac
DEV=${1:-}
if [ -z "$DEV" ]; then
  rootdisk=$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null || true)
  DEV=$(lsblk -dpno NAME,RM,TRAN,TYPE | awk -v r="/dev/$rootdisk" \
    '$1 != r && $NF == "disk" && ($2 == 1 || $3 == "usb" || $3 == "mmc" || $1 ~ /mmcblk/) { print $1 }')
  [ -n "$DEV" ] || die "no microSD card found in this laptop"
  [ "$(echo "$DEV" | wc -l)" = 1 ] || die "several removable disks: sudo sh $0 /dev/<the card>"
fi
[ -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ] || [ "$(uname -m)" = aarch64 ] || die "aarch64 programs cannot run here: run sh pi5.sh once first"

case "$DEV" in *[0-9]) P1=${DEV}p1 P2=${DEV}p2 ;; *) P1=${DEV}1 P2=${DEV}2 ;; esac
for p in "$P1" "$P2"; do umount "$p" 2>/dev/null || true; done
R=$(mktemp -d)
cleanup() {
  if mountpoint -q "$R"; then umount -R "$R" 2>/dev/null || umount -R -l "$R"; fi
  rmdir "$R" 2>/dev/null || true
}
trap cleanup EXIT
mount "$P2" "$R"
mount --make-private "$R"
[ -f "$R/etc/servidor-alpine.conf" ] || die "$P2 is not a card made by make-sd.sh"
mount "$P1" "$R/boot"
# Own proc, sysfs and devtmpfs mounts, never binds of the laptop's /sys and
# /dev (unmounting those also unmounts the laptop's /dev/pts)
mount -t proc proc "$R/proc"
mount -t sysfs sysfs "$R/sys"
mount -t devtmpfs devtmpfs "$R/dev"
echo "card: $DEV"

# Service scripts and tools (never the files configure.sh personalised)
cp -a --no-preserve=ownership "$HERE/rootfs/etc/s6-rc/source/." "$R/etc/s6-rc/source/"
cp -a --no-preserve=ownership "$HERE/rootfs/etc/s6-rc/scripts/." "$R/etc/s6-rc/scripts/"
cp -a --no-preserve=ownership "$HERE/rootfs/etc/s6-linux-init/skel/." "$R/etc/s6-linux-init/skel/"
cp -a --no-preserve=ownership "$HERE/rootfs/usr/local/sbin/." "$R/usr/local/sbin/"
tar -C "$HERE" --exclude=kernel/build -cf - kernel configure.sh config.example.env README.md \
  | tar -C "$R/usr/local/share/servidor-alpine" --no-same-owner -xf -
echo "   service scripts and tools updated"

# shellcheck disable=SC2016  # expanded inside the card, not here
chroot "$R" /bin/sh -e -c '
  new=/etc/s6-rc/compiled-$(date +%Y%m%d-%H%M%S)
  s6-rc-compile "$new" /etc/s6-rc/source
  ln -sfn "${new##*/}" /etc/s6-rc/compiled
  for old in /etc/s6-rc/compiled-*; do [ "$old" = "$new" ] || rm -rf "$old"; done
  echo "   s6-rc database recompiled (${new##*/})"
'

# The rescue slot shows its console on an HDMI screen as well
if [ -f "$R/boot/s/cmdline.txt" ] && ! grep -q 'console=tty1' "$R/boot/s/cmdline.txt"; then
  sed -i 's/$/ console=tty1/' "$R/boot/s/cmdline.txt"
  echo "   rescue slot s/: console also on HDMI"
fi
if [ -n "$slot" ]; then
  [ -f "$R/boot/$slot/kernel_2712.img" ] || die "slot $slot/ has no kernel on this card"
  awk -v v="$slot" '/^\[/ { all = ($0 == "[all]") } all && /^os_prefix=/ { $0 = "os_prefix=" v "/" } { print }' \
    "$R/boot/config.txt" > "$R/boot/config.txt.new"
  mv "$R/boot/config.txt.new" "$R/boot/config.txt"
  echo "   the card now boots slot $slot/ ($( [ $slot = s ] && echo "Alpine stock kernel, rescue" || echo "stripped kernel"))"
fi
rm -f "$R/boot/boot-report.txt"
sync
cleanup
trap - EXIT
echo "update-sd: done, card unmounted. Put it in the Pi."
