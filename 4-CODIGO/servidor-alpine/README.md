# servidor-alpine — the laptop as a stripped, headless Alpine + s6 server

Turns the NOM-COLAB laptop (i7-10610U, 16 GB) into a dedicated server you only
reach over **SSH** and **Tailscale**:

- **Alpine Linux 3.24**, no OpenRC, no bootloader, no initramfs.
- **Own monolithic kernel** (6.18 LTS) built *for this laptop*: no modules, only
  the drivers it has, CPU microcode + GPU/Wi-Fi firmware and the boot command
  line baked into one EFI file that the firmware starts directly.
- **s6 everywhere**: `s6-linux-init` is PID 1, `s6-rc` starts every service in
  dependency order, `s6` supervises and restarts them, `s6-log` keeps rotating
  logs. Device events: **mdevd** (skarnet's, the lightest udev replacement).
- **SSH** (OpenSSH, keys only, no root) and **Tailscale** working from the first
  boot; the Tailscale identity is migrated, so `https://nomcolab.tailfd65f2.ts.net`
  keeps working.
- **Hosting**: nginx (multi-site, reverse proxy) + NOM-COLAB; public HTTPS
  through Tailscale Funnel (no ports opened on the router).
- Laptop-as-server care: screen off, no sleep on lid close, hardware watchdog
  reboot on hangs, clean poweroff before the battery runs out after a power cut,
  battery charge limit where supported.

```
UEFI firmware ──> \EFI\minimal\linux.efi   (kernel + cmdline + firmware, EFI stub)
                    └─ s6-linux-init  (PID 1 = s6-svscan, catch-all logger, getty on tty1)
                         └─ rc.init ─> s6-rc change default
                              oneshots:  fs ─ hostname ─ sysctl ─ firewall ─ loopback
                                         mdevd ─> coldplug ─> power
                              longruns:  sshd · tailscaled · udhcpc-eth0 (· wpa_supplicant)
                                         ntpd · crond · syslogd+klogd · watchdog
                                         battery-guard · nginx · nomcolab
                              loggers:   /var/log/{sshd,tailscaled,net,system,syslogd,nginx,nomcolab}
```

## What you need to do — every command, in order

You need: the laptop, a cable to your router (strongly recommended for a server),
**two USB sticks** (one for Alpine, one for the backup), and the device you will
SSH from (phone with Termux, another PC…).

> **Everything on the laptop's disk is erased in step 4.** `0-prepare.sh` saves
> only NOM-COLAB, its Tailscale identity and SSH keys. Copy anything else first.

### 1. On the laptop's current Linux: backup + hardware report

```sh
git clone -b claude/peaceful-turing-e2zegt https://github.com/TruTruMaster/NOM-COLAB ~/NOM-COLAB-alpine
cd ~/NOM-COLAB-alpine/4-CODIGO/servidor-alpine
# plug in USB stick #2; it mounts at /media/$USER/<NAME> (check with: lsblk)
./0-prepare.sh /media/$USER/<NAME>
cat /media/$USER/<NAME>/nomcolab-migracion/hw-report.txt
```

**Send me `hw-report.txt`** (paste it). With it I check that the kernel config
has your exact disk, network, Wi-Fi and GPU, and which laptop brand extras apply.

No SSH key yet? On the device you will connect *from*: `ssh-keygen -t ed25519`,
then put the contents of `~/.ssh/id_ed25519.pub` in `SSH_KEYS` in step 4.

### 2. BIOS/UEFI setup (F2 at power-on on Dell/Lenovo, F10 on HP)

| Setting | Value | Why |
|---|---|---|
| Boot mode | **UEFI** (no Legacy/CSM) | the kernel boots directly as an EFI program |
| Secure Boot | **Off** | your own kernel is not signed by Microsoft |
| SATA/Storage operation | **AHCI** (not "RAID On"/RST) | with RST the NVMe disk is invisible to Linux |
| Power on when AC is connected / Auto power-on | **On** if it exists | it comes back by itself after a power cut |
| Battery charge limit (Dell "Primarily AC use", HP "Battery Health Manager") | **On** | 24/7 on the charger at 100 % swells batteries |

### 3. Make the Alpine USB stick (on any Linux)

```sh
wget https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86_64/alpine-extended-3.24.3-x86_64.iso{,.sha256}
sha256sum -c alpine-extended-3.24.3-x86_64.iso.sha256
lsblk                                   # find USB stick #1, e.g. /dev/sdb
sudo dd if=alpine-extended-3.24.3-x86_64.iso of=/dev/sdX bs=4M oflag=sync status=progress
```

### 4. Install (at the laptop, booted from the Alpine stick)

Boot menu: F12 (Dell/Lenovo) or F9 (HP), choose the USB stick (UEFI). Log in as `root` (no password).

```sh
setup-interfaces -ar         # cable: DHCP on eth0 (Wi-Fi only: run plain setup-interfaces, pick wlan0)
setup-apkrepos -c -1
apk add git
git clone --depth 1 -b claude/peaceful-turing-e2zegt https://github.com/TruTruMaster/NOM-COLAB
cd NOM-COLAB/4-CODIGO/servidor-alpine
cp config.example.env config.env
vi config.env                # SSH_KEYS at least; Wi-Fi only if no cable (i = edit, Esc :wq = save)
mkdir -p /media/usb && mount /dev/sdb1 /media/usb    # USB stick #2 (check: ls /dev/sd*)
ls /dev/nvme* /dev/sd*       # the laptop disk is usually /dev/nvme0n1
MIGRATION=/media/usb/nomcolab-migracion ./1-install.sh /dev/nvme0n1
reboot                       # remove the sticks
```

Wi-Fi by hand, if `setup-interfaces` does not offer it:
`wpa_passphrase "SSID" "password" > /etc/wpa_supplicant/wpa_supplicant.conf; ip link set wlan0 up;
wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf; udhcpc -i wlan0`.

The installer asks you to type the disk name, then for two passwords (your admin
user and root). They are for `doas` and the local console only: SSH never accepts
passwords. At the end it prints the SSH host key fingerprint: note it.

### 5. First boot — from now on everything is remote

```sh
ssh admin@nomcolab            # over Tailscale (or ssh admin@<LAN IP>)
svc                           # every service: up / pid / uptime
tailscale status; tailscale funnel status
nomcolab estado               # NOM-COLAB: running, public URL, RAM, data, last backup
```

If the Tailscale identity was not migrated and you gave no `TS_AUTHKEY`: at the
laptop's own keyboard log in as admin and run `doas tailscale up --qr`, scan the QR
with your phone.

### 6. The stripped kernel (over SSH, ~20 min)

```sh
doas kernel-min build         # downloads 6.18.x, builds for THIS machine, installs it as a one-time trial
cat /var/cache/kernel-min/out/missing-drivers.txt     # send me this list
doas reboot
# ~1 min later:
ssh admin@nomcolab
uname -r                      # 6.18.x-min
doas kernel-min confirm       # make it the default
```

The trial uses EFI `BootNext`: it boots **once**. If it does not come back within
~3 minutes, hold the power button 10 s and power on again: the previous kernel
boots and nothing is lost. **Send me** the `missing-drivers.txt` output and, after
the first good boot, `doas dmesg | grep -iE 'error|fail|firmware'` and `svc`.

### 7. A few days later, when all is well

```sh
doas kernel-min drop-stock    # removes Alpine's stock kernel, initramfs and firmware packages (~300 MB)
```

## Everyday use

| Task | Command |
|---|---|
| Services, logs | `svc` (asks your password: doas) · `svc log sshd` · `svc log nomcolab` · `svc restart nginx` · `svc boot` |
| Start/stop at boot | `svc enable <name>` · `svc disable <name>` |
| Updates (monthly) | `doas apk upgrade` then `doas kernel-min build` → reboot → `doas kernel-min confirm` |
| Roll back a kernel | `doas kernel-min rollback && doas reboot` |
| NOM-COLAB | `nomcolab up` · `nomcolab down` · `nomcolab estado` · backups in `/srv/nomcolab/respaldos` (03:30 daily, 14 kept) |
| Firewall | edit `/etc/nftables.nft`, then `doas nft -f /etc/nftables.nft` |
| Temperatures, power | `cat /sys/class/hwmon/hwmon*/temp*_input` · `cat /sys/class/power_supply/BAT*/capacity` |

### Hosting web pages

nginx serves `/srv/www/default` on port 80 (LAN and tailnet). Add sites as
`/etc/nginx/http.d/<site>.conf` (`proxy-example.conf.off` shows a reverse proxy),
then `doas nginx -t && doas svc restart nginx`.

To publish over HTTPS with Tailscale (Funnel = public internet, Serve = tailnet only;
Funnel allows ports 443, 8443 and 10000 on your `.ts.net` name):

```sh
doas tailscale funnel --bg 8080                               # NOM-COLAB on https://nomcolab.tailfd65f2.ts.net
doas tailscale funnel --bg --https=8443 http://127.0.0.1:80   # nginx sites on :8443
doas tailscale serve --bg --https=10000 http://127.0.0.1:80   # private, tailnet only
```

For your own domain (`nomcolab.eu.org` once approved) the next step is a
Cloudflare Tunnel into nginx; ask and I'll add it as another s6 service.

## Gaming: can this laptop do a stable 60 fps, e.g. with Debian?

**Yes for light and older games, no for modern 3D ones.** The limit is the GPU:
the i7-10610U's integrated **Intel UHD Graphics 620** (24 execution units, sharing a
15 W budget and the system RAM with the CPU). On Linux it is well supported (Mesa:
OpenGL 4.6 via *iris*, Vulkan 1.3 via *anv*).

| Stable 60 fps (720p–1080p, low, capped at 60) | Not stable / no |
|---|---|
| 2D and indie: Stardew Valley, Terraria, Celeste, Hollow Knight, Dead Cells, Balatro | CS2 (well under 60 even at 720p low), Fortnite, Apex, GTA V |
| Older 3D: Portal 2, Half-Life 2, Left 4 Dead 2 (720p) | Any recent AAA (Cyberpunk, Elden Ring…) |
| Minecraft Java with Sodium (short render distance) | Switch and most PS2 emulation |
| Emulation up to PS1/N64/DS, some lighter GameCube titles | |
| Rocket League and Dota 2 at 720p low: around 60, with dips | |

What makes it *stable*: a 60 fps cap (MangoHud `fps_limit=60` or `gamescope -r 60`),
`CPU_EPP=performance` while playing, **dual-channel RAM** (two memory modules; with a
single 16 GB module the iGPU typically loses 20–40 % of its speed — `hw-report.txt` lets
me check), and a cooling pad (15 W chips throttle when hot). Native Linux and OpenGL
games run better here than Windows games through Proton/DXVK.

Two ways to have Debian for games on the same laptop:

1. **Dual boot (simplest, most compatible).** Before installing, set
   `ROOT_SIZE="80G"` in `config.env`: Alpine takes 80 GB and the rest stays free.
   Later install Debian 13 into the free space and pick it with F12 at power-on.
   Downside: while you play, the server is **off** (NOM-COLAB offline).
2. **Debian inside the server (server stays online).** A Debian chroot on the Alpine
   server runs Steam/games on the laptop screen through gamescope, while s6 keeps
   serving. Needs `GAMING="yes"` (kernel fragment `kernel/gaming.config`: sound,
   input, 32-bit programs, Wine's ntsync). More moving parts; I can script it once
   the server runs. The idle server costs the games almost nothing (well under 1 % CPU).

**Decide before step 4**: option 1 needs `ROOT_SIZE`, option 2 needs nothing now.

## Files

| Path | What |
|---|---|
| `config.example.env` | the only file you edit (copy to `config.env`, which git ignores) |
| `0-prepare.sh` | old system: hardware report, SSH keys, Tailscale identity, NOM-COLAB data |
| `1-install.sh` | Alpine USB stick: partitions, installs packages, copies `rootfs/`, runs `configure.sh`, UEFI entry |
| `configure.sh` | inside the new system: users, passwords, SSH, Wi-Fi, s6-rc database, s6-linux-init |
| `kernel/*.config` | kernel fragments: `base` (always), `wifi`, `vendor-{lenovo,dell,hp}`, `containers`, `gaming`, `qemu` (tests) |
| `kernel/build-kernel.sh` | builds `linux.efi` for the machine it runs on; `check-config.sh` lists options Kconfig dropped |
| `rootfs/etc/s6-linux-init/skel/` | `rc.init`, `runlevel`, `rc.shutdown` (stage 2/3 of s6-linux-init) |
| `rootfs/etc/s6-rc/source/` | one directory per service (`type`, `run`/`up`, `dependencies.d/`, loggers) |
| `rootfs/etc/s6-rc/scripts/` | the scripts the oneshots and some longruns run |
| `rootfs/usr/local/sbin/` | `svc`, `kernel-min`, `nomcolab-respaldo`; `rootfs/usr/local/bin/nomcolab` |
| `rootfs/etc/` | `nftables.nft`, `mdev.conf`, `sysctl.d/`, `ssh/sshd_config`, `doas.d/`, `nginx/` |
| `test/` | `check-s6-tree.py` (offline s6-rc checks), `qemu-boot.sh` (boot test) |

## How it was tested, and what was not

Built and checked in a cloud sandbox that can reach Ubuntu's archive and Docker
Hub but **not** Alpine's mirrors or kernel.org:

- **Kernel**: every fragment combination merged on Linux 7.0 (Ubuntu's source
  package) with `check-config.sh` reporting zero dropped options; a review of every
  default-on option `allnoconfig` removes (it was dropping USB host support, PCIe
  extended config space, the laptop embedded controller and all CPU vulnerability
  mitigations, now restored); full compile with real embedded firmware.
- **Boot**: `test/qemu-boot.sh` boots that kernel under OVMF UEFI on an emulated
  NVMe disk and Intel e1000e NIC, runs the real oneshot scripts (fsck, mounts,
  sysctl, firewall, power) and the real longrun + logger scripts under s6, and logs in
  over SSH with a key.
- **s6-rc tree**: `test/check-s6-tree.py` checks what `s6-rc-compile` would reject.
  All shell scripts pass `shellcheck`.

To repeat the kernel + boot test on an Ubuntu/Debian machine:

```sh
cd kernel && WORK=/tmp/kmin CONF=/dev/null ./build-kernel.sh --src <linux source> --no-native --no-deps \
  --fragments "base qemu" --cmdline "root=PARTUUID=6a1c2b3d-0000-4000-8000-000000000002 rootfstype=ext4 ro rootwait=20 init=/sbin/init console=ttyS0"
cd .. && apt-get download openssh-server && mkdir -p qemu-work && mv openssh-server_*.deb qemu-work/
test/qemu-boot.sh /tmp/kmin/out/linux.efi
```

Not run here (no Alpine packages in the sandbox): `apk` bootstrap, `s6-rc-compile`,
`s6-linux-init-maker`, mdevd, tailscaled, nginx and Java on Alpine. That is why the
install boots Alpine's stock kernel first and the stripped kernel only as a
one-time trial: every step has a way back.
