#!/bin/sh
# build-kernel.sh - build the stripped Raspberry Pi 5 kernel.
#
# Works on your laptop (cross-compiles; Debian/Ubuntu: apt install
# gcc-aarch64-linux-gnu make bison flex bc libssl-dev libelf-dev wget) and on
# the Pi itself (`kernel-min build` installs the Alpine build tools for it).
#
# Source: Raspberry Pi's kernel tree (github.com/raspberrypi/linux), the one
# Raspberry Pi OS ships, with all Pi 5 drivers (BCM2712, RP1). Configuration:
# allnoconfig + kernel/common.config + kernel/pi5.config (+ wifi/usb if asked).
#
# Output in $WORK/out/ (kernel/build/out/ on the laptop, /var/cache/kernel-min/out on the Pi):
#   kernel_2712.img, bcm2712-rpi-5-b.dtb, bcm2712d0-rpi-5-b.dtb, overlays/*.dtbo,
#   rpi-tryboot, config, version
#
# Options: --src DIR (use this tree), --branch rpi-6.x.y, --no-deps (Pi: skip apk)
set -eu

HERE=$(dirname "$(readlink -f "$0")")
# Settings: the server's /etc/servidor-alpine.conf, or config.env next to this folder
for c in "${CONF:-}" /etc/servidor-alpine.conf "$HERE/../config.env"; do
  # shellcheck disable=SC1090
  if [ -n "$c" ] && [ -r "$c" ]; then . "$c"; break; fi
done

if [ -f /etc/servidor-alpine.conf ]; then WORK=${WORK:-/var/cache/kernel-min}; else WORK=${WORK:-$HERE/build}; fi
JOBS=${JOBS:-$(nproc)}
SRC="" BRANCH=${KERNEL_BRANCH:-} DEPS=yes

while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC=$(readlink -f "$2"); shift ;;
    --branch) BRANCH=$2; shift ;;
    --no-deps) DEPS=no ;;
    *) echo "build-kernel: unknown option $1" >&2; exit 1 ;;
  esac
  shift
done

log() { echo "build-kernel: $*"; }
die() { echo "build-kernel: ERROR: $*" >&2; exit 1; }
yes_() { case "${1:-}" in yes|y|1|true) return 0 ;; esac; return 1; }
get() { if command -v wget >/dev/null; then wget -q -O "$2" "$1"; else curl -fsSL -o "$2" "$1"; fi; }

mkdir -p "$WORK/out"

# ------------------------------------------------------------ toolchain
if [ "$(uname -m)" = aarch64 ]; then
  CROSS=""
  if [ "$DEPS" = yes ] && command -v apk >/dev/null 2>&1; then
    log "installing build tools (removed again at the end)"
    apk add -q --virtual .kernel-min-build build-base bison flex bc perl python3 \
      linux-headers elfutils-dev openssl-dev xz diffutils findutils tar wget zstd
    trap 'apk del -q .kernel-min-build' EXIT
  fi
else
  CROSS=${CROSS_COMPILE:-aarch64-linux-gnu-}
  command -v "${CROSS}gcc" >/dev/null || die "no ${CROSS}gcc: apt install gcc-aarch64-linux-gnu (or set CROSS_COMPILE)"
fi
MAKE="make -s ARCH=arm64 CROSS_COMPILE=$CROSS"

# ------------------------------------------------------------ Raspberry Pi kernel source
if [ -z "$SRC" ]; then
  if [ -z "$BRANCH" ]; then
    BRANCH=$(get https://api.github.com/repos/raspberrypi/linux - 2>/dev/null \
      | sed -n 's/.*"default_branch": *"\([^"]*\)".*/\1/p' | head -n1)
    [ -n "$BRANCH" ] || BRANCH=rpi-6.12.y
  fi
  SRC=$WORK/linux-$BRANCH
  if ! [ -f "$SRC/Makefile" ]; then
    log "downloading raspberrypi/linux $BRANCH (~250 MB)"
    mkdir -p "$SRC"
    get "https://github.com/raspberrypi/linux/archive/refs/heads/$BRANCH.tar.gz" "$WORK/src.tar.gz"
    tar -xzf "$WORK/src.tar.gz" -C "$SRC" --strip-components=1
    rm -f "$WORK/src.tar.gz"
    for old in "$WORK"/linux-*; do [ "$old" = "$SRC" ] || rm -rf "$old"; done
  fi
fi
[ -f "$SRC/Makefile" ] || die "no kernel source in $SRC"
cd "$SRC"
# Some tarballs lose this symlink; the arm64 dts Makefile builds overlays through it
[ -e arch/arm64/boot/dts/overlays ] || ln -s ../../../arm/boot/dts/overlays arch/arm64/boot/dts/overlays
KVER=$($MAKE kernelversion)
log "kernel $KVER ($SRC)"

# ------------------------------------------------------------ configuration
FRAGMENTS="common pi5"
[ -n "${WIFI_SSID:-}" ] && FRAGMENTS="$FRAGMENTS wifi"
yes_ "${USB:-no}" && FRAGMENTS="$FRAGMENTS usb"
log "fragments: $FRAGMENTS"

# Wi-Fi firmware must be inside the kernel: brcmfmac probes before / is mounted
rm -rf "$WORK/firmware"; mkdir -p "$WORK/firmware"
fw_list=""
fw_add() { # fw_add <name in the kernel> <candidate paths under /lib/firmware...>
  name=$1; shift
  for d in ${FIRMWARE_DIR:-} /lib/firmware; do
    for p in "$@"; do
      for f in "$d/$p" "$d/$p.zst" "$d/$p.xz"; do
        [ -f "$f" ] || continue
        mkdir -p "$WORK/firmware/$(dirname "$name")"
        case "$f" in
          *.zst) zstd -q -d -c "$f" > "$WORK/firmware/$name" ;;
          *.xz) xz -d -c "$f" > "$WORK/firmware/$name" ;;
          *) cp -L "$f" "$WORK/firmware/$name" ;;
        esac
        fw_list="$fw_list $name"; log "embedding $name (from $f)"; return 0
      done
    done
  done
  return 1
}
case " $FRAGMENTS " in *" wifi "*)
  fw_add brcm/brcmfmac43455-sdio.bin brcm/brcmfmac43455-sdio.bin cypress/cyfmac43455-sdio.bin \
    || die "Wi-Fi firmware not found: install linux-firmware (brcm) here, or set FIRMWARE_DIR"
  fw_add brcm/brcmfmac43455-sdio.clm_blob brcm/brcmfmac43455-sdio.clm_blob cypress/cyfmac43455-sdio.clm_blob \
    || log "WARNING: no clm_blob (Wi-Fi channels may be limited)"
  fw_add brcm/brcmfmac43455-sdio.txt brcm/brcmfmac43455-sdio.raspberrypi,5-model-b.txt \
    brcm/brcmfmac43455-sdio.raspberrypi,4-model-b.txt brcm/brcmfmac43455-sdio.txt \
    || die "Wi-Fi nvram brcmfmac43455-sdio.*.txt not found"
  ;;
esac

frag_files=""
for f in $FRAGMENTS; do frag_files="$frag_files $HERE/$f.config"; done
{
  # shellcheck disable=SC2086
  cat $frag_files
  echo "CONFIG_EXTRA_FIRMWARE=\"${fw_list# }\""
  echo "CONFIG_EXTRA_FIRMWARE_DIR=\"$WORK/firmware\""
} > "$WORK/all.config"
$MAKE KCONFIG_ALLCONFIG="$WORK/all.config" allnoconfig
# shellcheck disable=SC2086
"$HERE/check-config.sh" .config $frag_files || die "the options above did not apply; send this output to fix the fragments"

# ------------------------------------------------------------ build
log "compiling with $JOBS jobs"
$MAKE -j"$JOBS" Image
dtb=arch/arm64/boot/dts/broadcom
d0=bcm2712d0-rpi-5-b.dtb
[ -f "$dtb/${d0%.dtb}.dts" ] || d0=bcm2712-d-rpi-5-b.dtb
$MAKE broadcom/bcm2712-rpi-5-b.dtb "broadcom/$d0" overlays/disable-wifi-pi5.dtbo overlays/disable-bt-pi5.dtbo

out=$WORK/out
rm -rf "$out"; mkdir -p "$out/overlays"
cp arch/arm64/boot/Image "$out/kernel_2712.img"
cp "$dtb/bcm2712-rpi-5-b.dtb" "$out/"
# Pi 5 boards with the D0 stepping (2 GB, 16 GB and newer 4/8 GB) load this name
cp "$dtb/$d0" "$out/bcm2712d0-rpi-5-b.dtb"
cp arch/arm64/boot/dts/overlays/disable-wifi-pi5.dtbo arch/arm64/boot/dts/overlays/disable-bt-pi5.dtbo "$out/overlays/"
"${CROSS}gcc" -Os -static -nostdlib -fno-pie -no-pie -fno-stack-protector \
  -o "$out/rpi-tryboot" "$HERE/rpi-tryboot.c"
"${CROSS}strip" "$out/rpi-tryboot" 2>/dev/null || true
cp .config "$out/config"
echo "$KVER" > "$out/version"

ls -l "$out" "$out/overlays"
log "done: $out ($KVER)"
