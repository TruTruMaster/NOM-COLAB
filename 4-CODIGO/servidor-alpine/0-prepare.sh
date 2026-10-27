#!/bin/sh
# 0-prepare.sh <folder> - run on the laptop's CURRENT Linux, before wiping it.
#
# Writes <folder>/nomcolab-migracion/ (put <folder> on a USB stick):
#   hw-report.txt      what hardware this is: send it back so the kernel can be checked
#   authorized_keys    SSH keys that can log in today (go to the new admin user)
#   tailscaled.state   the Tailscale identity: same machine name, same 100.x IP,
#                      same https://<name>.<tailnet>.ts.net Funnel address
#   nomcolab/          NOM-COLAB jar, datos/ and the latest respaldos
#
# It stops the NOM-COLAB service for a consistent copy of its database.
# It does NOT back up anything else: copy your own files before wiping.
set -u
dest=${1:?usage: 0-prepare.sh /path/to/usb-stick}
out=$dest/nomcolab-migracion
mkdir -p "$out" || exit 1
have() { command -v "$1" >/dev/null 2>&1; }
SUDO=""; [ "$(id -u)" = 0 ] || SUDO=sudo

echo "== hardware report"
{
  echo "== date: $(date)"
  echo "== dmi"
  for f in sys_vendor product_name product_version bios_vendor bios_version bios_date; do
    printf '%s: %s\n' "$f" "$(cat /sys/class/dmi/id/$f 2>/dev/null)"
  done
  echo "== cpu"
  grep -m1 'model name' /proc/cpuinfo
  awk -F': ' '/^cpu family/ { f = $2 } /^model\t/ { m = $2 } /^stepping/ { s = $2 }
    END { printf "family %s model %s stepping %s -> intel-ucode/%02x-%02x-%02x\n", f, m, s, f, m, s }' /proc/cpuinfo
  echo "threads: $(nproc)"
  echo "== memory"; free -h
  echo "== kernel"; uname -a; cat /proc/cmdline
  echo "== boot mode"; if [ -d /sys/firmware/efi ]; then echo UEFI; else echo "LEGACY BIOS (switch to UEFI before installing)"; fi
  echo "== pci"; if have lspci; then lspci -nnk; else for d in /sys/bus/pci/devices/*; do echo "$(basename "$d") $(cat "$d/class") $(cat "$d/vendor"):$(cat "$d/device") driver=$(basename "$(readlink "$d/driver" 2>/dev/null)")"; done; fi
  echo "== usb"; have lsusb && lsusb
  echo "== modules"; if have lsmod; then lsmod; else cat /proc/modules; fi
  echo "== disks"; have lsblk && lsblk -o NAME,SIZE,TYPE,MODEL,TRAN,FSTYPE,MOUNTPOINT
  echo "== network"; ip -br link; ip -br addr
  echo "== rfkill"; have rfkill && rfkill list
  echo "== firmware loaded (dmesg)"; $SUDO dmesg 2>/dev/null | grep -iE 'firmware|dmc|iwlwifi|microcode|i915' | head -80
  echo "== efi entries"; have efibootmgr && $SUDO efibootmgr
  echo "== power"
  for s in /sys/class/power_supply/*; do
    echo "$(basename "$s"): type=$(cat "$s/type" 2>/dev/null) online=$(cat "$s/online" 2>/dev/null) capacity=$(cat "$s/capacity" 2>/dev/null) thresholds=$(cat "$s/charge_control_start_threshold" 2>/dev/null)/$(cat "$s/charge_control_end_threshold" 2>/dev/null)"
  done
  echo "== watchdog"; ls -l /dev/watchdog* 2>/dev/null; cat /sys/class/watchdog/*/identity 2>/dev/null
  echo "== tailscale"; have tailscale && { tailscale status 2>&1 | head -5; tailscale funnel status 2>&1; }
} > "$out/hw-report.txt" 2>&1
echo "   $out/hw-report.txt"

echo "== SSH keys"
: > "$out/authorized_keys"
for f in "$HOME/.ssh/authorized_keys" /root/.ssh/authorized_keys; do
  $SUDO cat "$f" 2>/dev/null >> "$out/authorized_keys"
done
echo "   $(grep -c '^ssh-\|^ecdsa-\|^sk-' "$out/authorized_keys") key(s) found"

echo "== Tailscale identity"
if $SUDO test -f /var/lib/tailscale/tailscaled.state; then
  $SUDO cat /var/lib/tailscale/tailscaled.state > "$out/tailscaled.state"
  chmod 600 "$out/tailscaled.state"
  echo "   saved. From now on do NOT start this old system again with Tailscale on:"
  echo "   two machines with the same identity fight over it."
else
  echo "   no /var/lib/tailscale/tailscaled.state here (use an auth key instead)"
fi

echo "== NOM-COLAB"
src=$HOME/nomcolab-servidor
if [ -d "$src/datos" ]; then
  if have systemctl && systemctl --user is-active -q nomcolab.service 2>/dev/null; then
    echo "   stopping nomcolab.service for a consistent copy"
    systemctl --user stop nomcolab.service
  fi
  mkdir -p "$out/nomcolab/respaldos"
  cp -a "$src/datos" "$out/nomcolab/"
  for j in "$src/nom-colab.jar" "$HOME/NOM/2-PAGINA-Servidor/nom-colab.jar"; do
    [ -f "$j" ] && { cp "$j" "$out/nomcolab/nom-colab.jar"; break; }
  done
  # shellcheck disable=SC2012
  ls -1t "$src"/respaldos/datos-*.tar.gz 2>/dev/null | head -n 3 | while read -r r; do cp "$r" "$out/nomcolab/respaldos/"; done
  echo "   $(du -sh "$out/nomcolab" | cut -f1) copied"
else
  echo "   no $src/datos (nothing to migrate)"
fi

sync
echo
echo "Done: $out"
echo "Send hw-report.txt back before installing, so the kernel config can be checked."
