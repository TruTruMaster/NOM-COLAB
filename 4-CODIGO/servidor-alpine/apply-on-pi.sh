#!/bin/sh
# apply-on-pi.sh <unpacked folder> - run on the Pi, as root, by `sh pi5.sh push`.
#
# Applies the same files as update-sd.sh to the running system: service scripts
# and tools are replaced, the s6-rc database is recompiled and switched live,
# and services new to the boot bundle are started. Users, passwords, SSH keys,
# Wi-Fi, Tailscale and the site are left alone.
set -eu
S=${1:?usage: apply-on-pi.sh <unpacked folder>}
[ "$(id -u)" = 0 ] || { echo "apply-on-pi: run it as root" >&2; exit 1; }

cp -R "$S/rootfs/etc/s6-rc/source/." /etc/s6-rc/source/
cp -R "$S/rootfs/etc/s6-rc/scripts/." /etc/s6-rc/scripts/
cp -R "$S/rootfs/etc/s6-linux-init/skel/." /etc/s6-linux-init/skel/
cp -R "$S/rootfs/usr/local/sbin/." /usr/local/sbin/
share=/usr/local/share/servidor-alpine
for f in kernel configure.sh config.example.env README.md; do
  rm -rf "${share:?}/$f"
  cp -R "$S/$f" "$share/"
done
echo "   service scripts and tools updated"

# Recompile, switch the running system to it, start what is new in the boot bundle
/usr/local/sbin/svc reload
s6-rc -u change default
echo "apply-on-pi: done"
/usr/local/sbin/svc
