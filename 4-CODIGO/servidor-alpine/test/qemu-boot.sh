#!/bin/sh
# qemu-boot.sh <linux.efi> - boot test of the stripped kernel + the s6 scripts.
#
# Runs on an Ubuntu/Debian host (packages: qemu-system-x86 ovmf fdisk mtools
# dosfstools e2fsprogs busybox-static s6 execline nftables openssh-client libwrap0,
# plus the openssh-server .deb in the work dir). The kernel must be built with the
# qemu fragment and root=PARTUUID=$ROOT_PARTUUID (README.md, "How it was tested").
#
# The guest is a q35 PC booted by OVMF straight into the kernel's EFI stub from
# \EFI\BOOT\BOOTX64.EFI, with the laptop's real driver set: NVMe disk, Intel
# e1000e NIC (DHCP from QEMU), AHCI, Intel TCO watchdog. Userland is Ubuntu's
# busybox/s6/OpenSSH/nft running OUR oneshot scripts in s6-rc order and OUR
# longrun + logger scripts under s6-svscan. (s6-rc and s6-linux-init are not
# packaged on Ubuntu, so a small stand-in init replaces them here.)
set -eu
KERNEL=$(readlink -f "${1:?usage: qemu-boot.sh linux.efi}")
HERE=$(dirname "$(readlink -f "$0")")
ROOTFS_SRC=$HERE/../rootfs
W=${WORK:-$PWD/qemu-work}
ROOT_PARTUUID=6a1c2b3d-0000-4000-8000-000000000002
ROOT_UUID=6a1c2b3d-0000-4000-8000-0000000000f2
rm -rf "$W/root"; mkdir -p "$W/root"
R=$W/root

# ------------------------------------------------------------------ userland
mkdir -p "$R"/bin "$R"/sbin "$R"/usr/bin "$R"/usr/sbin "$R"/lib "$R"/lib64 "$R"/etc "$R"/proc "$R"/sys \
  "$R"/dev "$R"/run "$R"/tmp "$R"/var/log "$R"/var/empty "$R"/root "$R"/home/admin/.ssh "$R"/boot "$R"/srv
cp /bin/busybox "$R/bin/busybox"
for a in $(/bin/busybox --list); do [ -e "$R/bin/$a" ] || ln -s busybox "$R/bin/$a"; done
rm -f "$R/bin/init"
copy_bin() { # copy_bin <host path> <guest dir>: binary and its shared libraries
  if ldd "$1" 2>/dev/null | grep 'not found'; then echo "qemu-boot: install the missing host libraries for $1" >&2; exit 1; fi
  cp "$1" "$R$2/"
  ldd "$1" 2>/dev/null | awk '/=> \// { print $3 } /^\t\/lib64/ { print $1 }' | while read -r l; do
    mkdir -p "$R$(dirname "$l")"; cp -L "$l" "$R$l"
  done
}
for b in /usr/bin/s6-*; do copy_bin "$b" /usr/bin; done
copy_bin /usr/sbin/nft /usr/sbin
dpkg-deb -x "$W"/openssh-server_*.deb "$W/sshd-deb"
copy_bin "$W/sshd-deb/usr/sbin/sshd" /usr/sbin
copy_bin /usr/bin/ssh-keygen /usr/bin
copy_bin "$(command -v e2fsck)" /sbin
mkdir -p "$R/usr/lib/x86_64-linux-gnu"; cp -L /lib/x86_64-linux-gnu/libnss_files.so.2 "$R/usr/lib/x86_64-linux-gnu/" 2>/dev/null || true
mkdir -p "$R/usr/share/udhcpc"
cat > "$R/usr/share/udhcpc/default.script" <<'EOF'
#!/bin/sh
case "$1" in
  bound|renew) ip addr flush dev "$interface"; ip addr add "$ip/${mask:-24}" dev "$interface"
               [ -n "$router" ] && ip route add default via "${router%% *}" dev "$interface"
               for d in $dns; do echo "nameserver $d"; done > /etc/resolv.conf ;;
  deconfig) ip addr flush dev "$interface" ;;
esac
EOF
chmod 755 "$R/usr/share/udhcpc/default.script"

# ------------------------------------------------------------------ our files
cp -a "$ROOTFS_SRC/." "$R/"
cat > "$R/etc/servidor-alpine.conf" <<'EOF'
CPU_EPP=balance_power
BATTERY_MIN=10
TS_ACCEPT_DNS=no
EOF
echo qemu-test > "$R/etc/hostname"
cat > "$R/etc/fstab" <<EOF
UUID=$ROOT_UUID / ext4 rw,noatime 0 1
tmpfs /tmp tmpfs nosuid,nodev,mode=1777 0 0
EOF
cat > "$R/etc/passwd" <<'EOF'
root:x:0:0:root:/root:/bin/sh
sshd:x:22:22:sshd:/var/empty:/bin/false
s6log:x:100:4:s6log:/var/empty:/bin/false
admin:x:1000:1000:admin:/home/admin:/bin/sh
EOF
cat > "$R/etc/group" <<'EOF'
root:x:0:
adm:x:4:admin
tty:x:5:
sshd:x:22:
wheel:x:10:admin
admin:x:1000:
EOF
# The test userland is glibc (Ubuntu): it needs nsswitch.conf to read these files
printf 'passwd: files\ngroup: files\nshadow: files\nhosts: files dns\n' > "$R/etc/nsswitch.conf"
echo 'admin:*:19000:0:99999:7:::' > "$R/etc/shadow"; echo 'root:*:19000:0:99999:7:::' >> "$R/etc/shadow"
chmod 600 "$R/etc/shadow"
echo "AllowUsers admin" >> "$R/etc/ssh/sshd_config"
[ -f "$W/id_test" ] || ssh-keygen -q -t ed25519 -N "" -f "$W/id_test"
cp "$W/id_test.pub" "$R/home/admin/.ssh/authorized_keys"
chmod 700 "$R/home/admin/.ssh"; chmod 600 "$R/home/admin/.ssh/authorized_keys"
chown -R 1000:1000 "$R/home/admin"   # mkfs.ext4 -d keeps host ownership

# Stand-in for s6-linux-init (stage 1) + s6-rc (oneshots in dependency order)
cat > "$R/sbin/init" <<'EOF'
#!/bin/sh
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
mount -t tmpfs -o mode=0755,nosuid,nodev tmpfs /run
mount -t proc proc /proc
mount -t sysfs sysfs /sys
exec >/dev/console 2>&1
for s in fs hostname sysctl loopback firewall power; do
  if /etc/s6-rc/scripts/$s; then echo "TEST oneshot $s ok"; else echo "TEST oneshot $s FAILED"; fi
done
mkdir -p /run/service /run/sshd
for s in sshd udhcpc-eth0 watchdog battery-guard syslogd klogd; do
  cp -a /etc/s6-rc/source/$s /run/service/$s
  # one logger per service here (s6-rc funnels several producers into one in production)
  mkdir -p /run/service/$s/log
  printf '#!/bin/sh\nexec /etc/s6-rc/scripts/logger %s\n' "$s" > /run/service/$s/log/run
  chmod 755 /run/service/$s/log/run
  echo 3 > /run/service/$s/log/notification-fd
done
echo "TEST starting s6-svscan"
exec s6-svscan /run/service
EOF
chmod 755 "$R/sbin/init"

# ------------------------------------------------------------------ disk image
rm -f "$W/disk.img" "$W/esp.img" "$W/root.img"
truncate -s 600M "$W/disk.img"
sfdisk -q "$W/disk.img" <<EOF
label: gpt
start=2048, size=64MiB, type=U, name="ESP"
start=133120, size=520MiB, type=L, name="alpine-root", uuid=$ROOT_PARTUUID
EOF
mkfs.vfat -C -F 32 -n ESP "$W/esp.img" 65536 >/dev/null
mmd -i "$W/esp.img" ::/EFI ::/EFI/BOOT
mcopy -i "$W/esp.img" "$KERNEL" ::/EFI/BOOT/BOOTX64.EFI
mkfs.ext4 -q -F -L alpine-root -U "$ROOT_UUID" -d "$R" "$W/root.img" 520M
dd if="$W/esp.img" of="$W/disk.img" bs=512 seek=2048 conv=notrunc status=none
dd if="$W/root.img" of="$W/disk.img" bs=512 seek=133120 conv=notrunc status=none
cp /usr/share/OVMF/OVMF_VARS_4M.fd "$W/vars.fd"

# ------------------------------------------------------------------ boot
rm -f "$W/serial.log"
qemu-system-x86_64 -machine q35 -cpu max -smp 2 -m 1024 -display none -no-reboot \
  -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd \
  -drive if=pflash,format=raw,file="$W/vars.fd" \
  -drive if=none,id=d0,file="$W/disk.img",format=raw -device nvme,drive=d0,serial=nvme0 \
  -netdev user,id=n0,hostfwd=tcp:127.0.0.1:2222-:22 -device e1000e,netdev=n0 \
  -serial file:"$W/serial.log" -pidfile "$W/qemu.pid" -daemonize
echo "qemu started; serial log: $W/serial.log"

ssh_t() { ssh -q -p 2222 -i "$W/id_test" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -o ConnectTimeout=5 -o BatchMode=yes admin@127.0.0.1 "$@"; }
i=0
until ssh_t true 2>/dev/null; do
  i=$((i + 1))
  if [ $i -gt 120 ] || ! kill -0 "$(cat "$W/qemu.pid")" 2>/dev/null; then
    echo "FAIL: no SSH after $((i * 5)) s"; tail -40 "$W/serial.log"; kill "$(cat "$W/qemu.pid")" 2>/dev/null; exit 1
  fi
  sleep 5
done
echo "SSH up after ~$((i * 5)) s"

ssh_t 'set -x
uname -a
cat /proc/cmdline
ls /sys/firmware/efi >/dev/null && echo "booted by UEFI (EFI stub)"
grep " / " /proc/mounts
ip -4 addr show eth0
cat /etc/resolv.conf
ps -o pid,user,args | grep -v \]$
ls -l /dev/watchdog /dev/net/tun
cat /sys/class/watchdog/watchdog0/identity
cat /proc/sys/net/ipv4/tcp_congestion_control /proc/sys/net/core/default_qdisc
ls /var/log; tail -n 3 /var/log/sshd/current
tail -n 2 /var/log/udhcpc-eth0/current /var/log/watchdog/current /var/log/battery-guard/current
' 2>&1 | sed 's/^/    /'
echo "--- firewall (needs root inside the guest; shown from the serial log instead)"
grep 'TEST' "$W/serial.log"
kill "$(cat "$W/qemu.pid")"
echo "qemu-boot: PASS"
