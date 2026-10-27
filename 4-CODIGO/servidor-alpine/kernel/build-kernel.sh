#!/bin/sh
# build-kernel.sh - build the stripped monolithic kernel for THIS machine.
#
# Normally run through `kernel-min build` on the server. Reads
# /etc/servidor-alpine.conf (KSERIES, ROOT_PARTUUID, WIFI_SSID, ...).
# Produces $WORK/out/linux.efi: an EFI executable with the command line, CPU
# microcode and the firmware this hardware needs built in. No modules, no
# initramfs, no bootloader.
#
# Options (mostly for testing elsewhere):
#   --src DIR          use this kernel source tree instead of downloading one
#   --fragments LIST   config fragments to merge (default: decided from the config)
#   --cmdline STRING   built-in command line (default: computed)
#   --firmware DIR     where firmware files are looked up (default: /lib/firmware)
#   --no-native        do not tune for this CPU (-march=native)
#   --no-deps          do not install/remove the apk build dependencies
set -eu

HERE=$(dirname "$(readlink -f "$0")")
CONF=${CONF:-/etc/servidor-alpine.conf}
# shellcheck disable=SC1090
[ -r "$CONF" ] && . "$CONF"

KSERIES=${KSERIES:-6.18}
WORK=${WORK:-/var/cache/kernel-min}
JOBS=${JOBS:-$(nproc)}
SRC="" FRAGMENTS="" CMDLINE="" FWDIR=/lib/firmware NATIVE=yes DEPS=yes

while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC=$(readlink -f "$2"); shift ;;
    --fragments) FRAGMENTS=$2; shift ;;
    --cmdline) CMDLINE=$2; shift ;;
    --firmware) FWDIR=$2; shift ;;
    --no-native) NATIVE=no ;;
    --no-deps) DEPS=no ;;
    *) echo "build-kernel: unknown option $1" >&2; exit 1 ;;
  esac
  shift
done

log() { echo "build-kernel: $*"; }
die() { echo "build-kernel: ERROR: $*" >&2; exit 1; }
yes_() { case "${1:-}" in yes|y|1|true) return 0 ;; esac; return 1; }

mkdir -p "$WORK/out" "$WORK/firmware"

# ------------------------------------------------------------ build dependencies
if [ "$DEPS" = yes ] && command -v apk >/dev/null 2>&1; then
  log "installing build dependencies (removed again at the end)"
  apk add -q --virtual .kernel-min-build build-base bison flex bc perl python3 \
    linux-headers elfutils-dev openssl-dev zstd xz diffutils findutils sed tar \
    intel-ucode wireless-regdb
  trap 'apk del -q .kernel-min-build' EXIT
fi

# ------------------------------------------------------------ kernel source
if [ -z "$SRC" ]; then
  if [ -z "${KVER:-}" ]; then
    KVER=$(wget -qO- https://www.kernel.org/releases.json \
      | grep -o "\"version\": *\"$KSERIES\.[0-9]*\"" | grep -o '[0-9.]*[0-9]' | sort -t. -k3 -n | tail -n1) || true
    [ -n "$KVER" ] || die "could not find the latest $KSERIES.x on kernel.org (set KVER=...)"
  fi
  major=${KVER%%.*}
  url=https://cdn.kernel.org/pub/linux/kernel/v$major.x
  SRC=$WORK/linux-$KVER
  if ! [ -f "$SRC/Makefile" ]; then
    log "downloading linux-$KVER"
    cd "$WORK"
    wget -q -O "linux-$KVER.tar.xz" "$url/linux-$KVER.tar.xz"
    wget -q -O sha256sums.asc "$url/sha256sums.asc"
    want=$(awk -v f="linux-$KVER.tar.xz" '$2 == f { print $1 }' sha256sums.asc)
    have=$(sha256sum "linux-$KVER.tar.xz" | cut -d' ' -f1)
    if [ -z "$want" ] || [ "$want" != "$have" ]; then die "checksum mismatch for linux-$KVER.tar.xz"; fi
    tar -xJf "linux-$KVER.tar.xz"
    rm -f "linux-$KVER.tar.xz" sha256sums.asc
    # keep only the tree being built
    for old in "$WORK"/linux-*; do [ "$old" = "$SRC" ] || rm -rf "$old"; done
  fi
fi
[ -f "$SRC/Makefile" ] || die "no kernel source in $SRC"
KVER=$(make -s -C "$SRC" kernelversion)
log "kernel $KVER in $SRC"

# ------------------------------------------------------------ fragments
if [ -z "$FRAGMENTS" ]; then
  FRAGMENTS=base
  [ -n "${WIFI_SSID:-}" ] && FRAGMENTS="$FRAGMENTS wifi"
  case "$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null)" in
    LENOVO*) FRAGMENTS="$FRAGMENTS vendor-lenovo" ;;
    Dell*) FRAGMENTS="$FRAGMENTS vendor-dell" ;;
    HP*|Hewlett*) FRAGMENTS="$FRAGMENTS vendor-hp" ;;
  esac
  yes_ "${CONTAINERS:-no}" && FRAGMENTS="$FRAGMENTS containers"
  yes_ "${GAMING:-no}" && FRAGMENTS="$FRAGMENTS gaming"
fi
log "fragments: $FRAGMENTS"

# ------------------------------------------------------------ firmware to embed
# Only what this machine uses: CPU microcode, i915 DMC, Wi-Fi + regulatory db.
fw_list=""
FW_GIT=https://git.kernel.org/pub/scm/linux/kernel/git/firmware/linux-firmware.git/plain
UCODE_GIT=https://raw.githubusercontent.com/intel/Intel-Linux-Processor-Microcode-Data-Files/main
fw_add() { # fw_add <path relative to /lib/firmware>: stage it (decompressed) for embedding
  out=$WORK/firmware/$1
  mkdir -p "$(dirname "$out")"
  for d in "$FWDIR" /lib/firmware; do
    for p in "$1" "intel/iwlwifi/${1##*/}"; do
      if [ -f "$d/$p" ]; then cp -L "$d/$p" "$out"
      elif [ -f "$d/$p.zst" ]; then zstd -q -d -c "$d/$p.zst" > "$out"
      elif [ -f "$d/$p.xz" ]; then xz -d -c "$d/$p.xz" > "$out"
      else continue
      fi
      fw_list="$fw_list $1"; log "embedding firmware $1 (from $d/$p)"; return 0
    done
  done
  # Not installed locally: fetch the exact file from upstream
  case "$1" in
    intel-ucode/*) urls="$UCODE_GIT/$1" ;;
    iwlwifi-*) urls="$FW_GIT/intel/iwlwifi/$1 $FW_GIT/$1" ;;
    *) urls="$FW_GIT/$1" ;;
  esac
  for u in $urls; do
    if wget -q -O "$out" "$u" && [ -s "$out" ]; then
      fw_list="$fw_list $1"; log "embedding firmware $1 (downloaded)"; return 0
    fi
  done
  rm -f "$out"
  log "WARNING: firmware $1 not found, not embedded"
  return 1
}
rm -rf "$WORK/firmware"; mkdir -p "$WORK/firmware"

if grep -q GenuineIntel /proc/cpuinfo 2>/dev/null && [ "$NATIVE" = yes ]; then
  ucode=$(awk -F': ' '/^cpu family/ { f = $2 } /^model\t/ { m = $2 } /^stepping/ { s = $2 }
    END { printf "intel-ucode/%02x-%02x-%02x", f, m, s }' /proc/cpuinfo)
  fw_add "$ucode" || true
fi

# dmesg, plus the kernel log kept by klogd in case the ring buffer wrapped
dmesg_text=$( { dmesg; cat /var/log/syslogd/@*.s /var/log/syslogd/current; } 2>/dev/null || true)
dmc=$(printf '%s\n' "$dmesg_text" | grep -o 'i915/[a-z0-9_]*dmc[a-z0-9_.]*\.bin' | tail -n1 || true)
if [ -z "$dmc" ] && [ "$NATIVE" = yes ]; then
  # Skylake-family iGPUs (Kaby/Coffee/Whiskey/Comet Lake) all use the KBL DMC
  case $(awk -F': ' '/^model\t/ { print $2; exit }' /proc/cpuinfo) in
    78|94) dmc=i915/skl_dmc_ver1_27.bin ;;
    142|158|165|166) dmc=i915/kbl_dmc_ver1_04.bin ;;
  esac
fi
case " $FRAGMENTS " in *" qemu "*) dmc="" ;; esac
[ -n "$dmc" ] && { fw_add "$dmc" || true; }

case " $FRAGMENTS " in *" wifi "*)
  iwl=${WIFI_FIRMWARE:-}
  [ -n "$iwl" ] || iwl=$(printf '%s\n' "$dmesg_text" \
    | sed -n 's/.*iwlwifi.*loaded firmware version .* \([A-Za-z0-9-]*\.ucode\) op_mode.*/iwlwifi-\1/p' | tail -n1)
  [ -n "$iwl" ] || die "Wi-Fi is on but the firmware in use is unknown: boot the stock kernel with Wi-Fi working, or set WIFI_FIRMWARE=iwlwifi-...ucode in $CONF"
  fw_add "$iwl" || die "missing $iwl"
  pnvm=${iwl%-*.ucode}.pnvm
  [ -f "$FWDIR/$pnvm" ] && fw_add "$pnvm"
  fw_add regulatory.db || true
  fw_add regulatory.db.p7s || true
  ;;
esac

# Anything else asked for in the config (e.g. rtl_nic/rtl8168h-2.fw)
for f in ${FIRMWARE_FILES:-}; do fw_add "$f" || true; done

# ------------------------------------------------------------ command line
if [ -z "$CMDLINE" ]; then
  [ -n "${ROOT_PARTUUID:-}" ] || ROOT_PARTUUID=$(sed -n 's/.*root=PARTUUID=\([^ ]*\).*/\1/p' /proc/cmdline)
  [ -n "${ROOT_PARTUUID:-}" ] || die "ROOT_PARTUUID is not set in $CONF"
  CMDLINE="root=PARTUUID=$ROOT_PARTUUID rootfstype=ext4 ro rootwait=20 init=/sbin/init"
  CMDLINE="$CMDLINE consoleblank=${CONSOLE_BLANK:-120} loglevel=4"
  [ -n "${WIFI_SSID:-}" ] && CMDLINE="$CMDLINE cfg80211.ieee80211_regdom=${WIFI_COUNTRY:-00}"
  [ -n "${KERNEL_EXTRA_CMDLINE:-}" ] && CMDLINE="$CMDLINE $KERNEL_EXTRA_CMDLINE"
fi
log "command line: $CMDLINE"

# ------------------------------------------------------------ configure
frag_files=""
for f in $FRAGMENTS; do
  [ -f "$HERE/$f.config" ] || die "no fragment $HERE/$f.config"
  frag_files="$frag_files $HERE/$f.config"
done
local_cfg=$WORK/local.config
{
  echo "CONFIG_CMDLINE=\"$CMDLINE\""
  echo "CONFIG_EXTRA_FIRMWARE=\"${fw_list# }\""
  echo "CONFIG_EXTRA_FIRMWARE_DIR=\"$WORK/firmware\""
  [ "$NATIVE" = yes ] && echo "CONFIG_X86_NATIVE_CPU=y"
} > "$local_cfg"
# shellcheck disable=SC2086
cat $frag_files "$local_cfg" > "$WORK/all.config"

cd "$SRC"
make -s ARCH=x86_64 KCONFIG_ALLCONFIG="$WORK/all.config" allnoconfig
# X86_NATIVE_CPU only exists on 6.16+: not an error if it is missing
# shellcheck disable=SC2086
"$HERE/check-config.sh" .config $frag_files || die "the options above did not apply; send this output to fix the fragments"

# ------------------------------------------------------------ build
log "compiling with $JOBS jobs (10-20 min on a 4-core laptop CPU)"
make -s ARCH=x86_64 -j"$JOBS" bzImage
cp arch/x86/boot/bzImage "$WORK/out/linux.efi"
cp .config "$WORK/out/config"
echo "$KVER" > "$WORK/out/version"

# ------------------------------------------------------------ hardware report
# Drivers loaded right now (stock kernel) whose option is not in our config:
# candidates to add if something does not work under the stripped kernel.
report=$WORK/out/missing-drivers.txt
if [ -s /proc/modules ]; then
  find . \( -name Makefile -o -name Kbuild \) -print0 | xargs -0 grep -hoE 'obj-\$\(CONFIG_[A-Z0-9_]+\)[[:space:]]*[+:]?=[^#]*' \
    | awk '{ sym = $0; sub(/^obj-\$\(/, "", sym); sub(/\).*/, "", sym)
             for (i = 2; i <= NF; i++) if ($i ~ /\.o$/) { m = $i; sub(/\.o$/, "", m); gsub(/-/, "_", m); print m, sym } }' \
    | sort -u > "$WORK/module-map.txt"
  : > "$report"
  cut -d' ' -f1 /proc/modules | while read -r m; do
    awk -v m="$m" '$1 == m { print $2 }' "$WORK/module-map.txt" | while read -r sym; do
      grep -q "^$sym=y" .config || echo "$m -> $sym" >> "$report"
    done
  done
  log "loaded drivers not in this kernel: $(wc -l < "$report") (see $report)"
fi

ls -l "$WORK/out/linux.efi"
log "done: $WORK/out/linux.efi ($KVER)"
