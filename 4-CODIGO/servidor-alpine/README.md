# servidor-alpine — Raspberry Pi 5 headless server (Alpine + s6, stripped kernel)

A microSD card for a **Raspberry Pi 5** that boots straight into a small,
fast, low-power server you reach only over **SSH** (your laptop's key) and
**Tailscale**, serving a **static website**. Everything is prepared on your
laptop; the Pi never needs a screen or keyboard.

- **Alpine Linux 3.24 (aarch64)**: no OpenRC, no initramfs, a few dozen packages.
- **Stripped kernel built for the Pi 5 only**: Raspberry Pi's own kernel tree,
  `allnoconfig` + just the board's hardware (BCM2712, RP1 Ethernet, microSD, fan,
  watchdog, RTC) + what SSH/Tailscale/nftables need. No modules. One 10 MB
  `kernel_2712.img`.
- **s6 for everything**: `s6-linux-init` is PID 1, `s6-rc` starts the services in
  dependency order, `s6` supervises and restarts them, `s6-log` keeps rotating logs.
  Devices: **mdevd** (the lightest udev replacement, made for s6).
- **SSH**: OpenSSH, your laptop's key only, no passwords, no root.
- **Tailscale**: joins your tailnet on first boot; **Funnel** publishes the site
  over HTTPS without opening router ports.
- **Website**: nginx serving `/srv/www/default` (static files).
- **Speed / power**: 16K memory pages and fake-NUMA (Raspberry Pi's own Pi 5
  tuning), `schedutil` CPU governor, BBR + fq networking, `mq-deadline` for the
  SD card. Wi-Fi, Bluetooth, audio, HDMI and camera stay off. Ethernet runs
  without EEE (`kernel/eee-off-pi5-overlay.dts`): with it, the link dropped 1 s
  after every link-up on the first real boot. The official fan
  follows the kernel's temperature curve. Root is written at most once a minute
  to spare the SD card. The hardware watchdog reboots it if the kernel hangs.

```
Pi 5 bootloader (EEPROM) -> config.txt [all] os_prefix=a/
   a/kernel_2712.img + a/bcm2712*-rpi-5-b.dtb + a/cmdline.txt + overlays/ (shared by all slots)
     └─ s6-linux-init  (PID 1 = s6-svscan, catch-all log, getty on the debug UART)
          └─ rc.init -> s6-rc change default
               oneshots: fs (fsck, rw) · hostname · sysctl · firewall · loopback
                         mdevd -> coldplug -> power (CPU governor)
               longruns: udhcpc-eth0 · sshd · tailscaled (+ first-boot login)
                         nginx · ntpd · crond · syslogd + klogd · watchdog
               logs:     /var/log/{sshd,tailscaled,nginx,net,system,syslogd}
```

## Copy-paste, on your laptop (Linux)

Put the microSD card in the laptop (or a USB card reader), open a terminal and paste:

```sh
command -v git >/dev/null || sudo apt-get install -y git || sudo dnf install -y git || sudo pacman -S --noconfirm git
git clone -b claude/peaceful-turing-e2zegt https://github.com/TruTruMaster/NOM-COLAB ~/pi5-server
cd ~/pi5-server/4-CODIGO/servidor-alpine && sh pi5.sh
```

`pi5.sh` finds what it needs by itself (your Linux's package manager, your SSH
key, user name and time zone, the microSD card) and only asks:

1. a **Tailscale auth key** (optional; make it at
   https://login.tailscale.com/admin/settings/keys, or press Enter),
2. the **folder of your website** (or Enter for a placeholder page),
3. a **Wi-Fi name** only if the Pi will have no network cable (Enter = cable),
4. `yes` before erasing the card, and two **passwords** (for `doas` on the Pi and
   the serial console; SSH never asks for them).

It builds the kernel (~10 min) and writes the card. Then: card in the Pi, network
cable, power. Half a minute later, from the laptop:

```sh
ssh pi5                            # with the Tailscale key
sh pi5.sh find                     # without it: prints "ssh <you>@<the Pi's address>"
```

On the Pi (once, if you skipped the Tailscale key): `doas tailscale up --qr`.
Publish the site (HTTPS at `https://pi5.<your-tailnet>.ts.net`):

```sh
doas tailscale funnel --bg 80      # public internet
doas tailscale serve --bg 80       # or: only your own devices
```

Update the site later, from the laptop: `scp -r <your site folder>/* pi5:/srv/www/default/`

### Your own domain (Cloudflare Tunnel)

Funnel only serves `*.ts.net` names. For a domain of your own (a free one from
[EU.org](https://nic.eu.org) works, e.g. `vefose.eu.org`), Cloudflare's free plan
holds its DNS and a Cloudflare Tunnel carries the visits to the Pi. The tunnel is
an outgoing connection: no port opens at home and your IP stays hidden.

1. Cloudflare dashboard: **Add a domain**, type the domain, Free plan. It shows two
   nameservers (`<name>.ns.cloudflare.com`).
2. Registrar (EU.org: the domain request form): put those two nameservers as
   Name1 and Name2, IPs empty (no glue: they are outside your domain). EU.org
   reviews requests by hand; Cloudflare shows the domain **Active** once it is delegated.
3. Cloudflare: **Zero Trust > Networks > Tunnels > Create a tunnel > Cloudflared**,
   copy the token, and in **Public hostname** send the domain to `http://localhost:80`.
4. On the Pi: `doas cloudflare-tunnel <token>` (downloads `cloudflared`, starts the
   `cloudflared` service). `doas cloudflare-tunnel status` shows the connection.

### Updating the running Pi

`sh pi5.sh push` sends this folder's service scripts and tools to the Pi over SSH,
switches the running system to them and starts any new service (`apply-on-pi.sh`
does the Pi side). Users, keys, Tailscale and the site are left alone. With the
card in the laptop instead: `sudo sh update-sd.sh`.

Everything `pi5.sh` decided is in `config.env` (every option explained in
`config.example.env`). Change it and run `sh pi5.sh` again to rebuild and rewrite a card.

## Everyday use (on the Pi)

| Task | Command |
|---|---|
| Services, logs | `svc` · `svc log nginx` · `svc log sshd` · `svc restart nginx` · `svc boot` |
| Start/stop at boot | `svc enable <name>` · `svc disable <name>` |
| Package updates | `doas apk upgrade` |
| Temperature, fan, CPU speed | `cat /sys/class/thermal/thermal_zone0/temp` · `cat /sys/class/hwmon/hwmon*/fan1_input` · `cat /sys/devices/system/cpu/cpufreq/policy0/scaling_cur_freq` |
| Firewall | edit `/etc/nftables.nft`, then `doas nft -f /etc/nftables.nft` |
| Own domain | `doas cloudflare-tunnel <token>` · `doas cloudflare-tunnel status` · `doas cloudflare-tunnel off` |

### Kernel updates, with automatic way back

The boot partition has two kernel slots, `a/` and `b/` (plus `s/`, Alpine's stock
kernel, as a rescue). A new kernel goes into the free slot and boots **once**
through the Pi firmware's `tryboot`. If it does not come back, power-cycle: the
old slot boots.

```sh
doas kernel-min build      # on the Pi (~20 min); or build on the laptop and:
                           #   scp -r kernel/build/out pi5:/tmp/k && ssh pi5 doas kernel-min install /tmp/k
doas kernel-min trial      # reboots once into the new slot
ssh pi5; uname -r          # back in? then:
doas kernel-min confirm    # make it the default
doas kernel-min status     # slots and what boots next
```

When the stripped kernel has run well for a while: `doas kernel-min drop-stock`
removes the stock rescue kernel and its modules.

### Rescue

- **It does not boot**: put the card in the laptop, open `config.txt` on the
  `BOOT` partition and change `os_prefix=a/` to `os_prefix=s/` (Alpine's stock
  kernel, which has every driver). Then send me what went wrong.
- **Serial console**: the Pi 5's 3-pin `UART` connector, 115200 baud, gives a
  login prompt (Raspberry Pi Debug Probe or any 3.3 V USB-serial adapter).
- **Forgot a password**: SSH never uses it; log in with your key and `doas passwd`.

## Files

| Path | What |
|---|---|
| `pi5.sh` | the one command: tools, `config.env`, kernel, microSD; `pi5.sh find` locates the Pi; `pi5.sh push` updates it over SSH |
| `apply-on-pi.sh` | the Pi side of `pi5.sh push` |
| `update-sd.sh`, `check-sd.sh` | update / check a written card from the laptop (`check-sd.sh` copies the Pi's logs to `pi5-logs/`) |
| `config.example.env` | every setting explained; `pi5.sh` writes `config.env` (git ignores it) |
| `kernel/build-kernel.sh` | builds the kernel (cross on the laptop, native on the Pi) into `kernel/build/out/` |
| `kernel/common.config` | what SSH, Tailscale, nftables and the s6 userland need |
| `kernel/pi5.config` | the Pi 5 hardware, taken from its device tree and Raspberry Pi's `bcm2712_defconfig` |
| `kernel/wifi.config`, `kernel/usb.config` | added only when `config.env` asks for Wi-Fi / USB |
| `kernel/check-config.sh` | lists options Kconfig dropped (missing dependency) |
| `kernel/rpi-tryboot.c` | 1 KB helper: reboot with `"0 tryboot"` for the one-time trial |
| `make-sd.sh` | partitions the card, installs Alpine aarch64, copies `rootfs/`, runs `configure.sh`, writes the boot slots |
| `configure.sh` | inside the new system: users, passwords, SSH key, Wi-Fi, s6-rc database, s6-linux-init |
| `rootfs/etc/s6-linux-init/skel/` | `rc.init`, `runlevel`, `rc.shutdown`, `rc.shutdown.final` (tryboot hook) |
| `rootfs/etc/s6-rc/source/` | one directory per service (`type`, `run`/`up`, `dependencies.d/`, loggers) |
| `rootfs/etc/s6-rc/scripts/` | the scripts the services run |
| `rootfs/usr/local/sbin/` | `svc` (services), `kernel-min` (kernel slots), `cloudflare-tunnel` (own domain) |
| `rootfs/etc/` | `nftables.nft`, `mdev.conf`, `sysctl.d/`, `ssh/sshd_config`, `doas.d/`, `nginx/` |
| `test/check-s6-tree.py` | offline checks of the s6-rc service tree |

## Gaming on the Pi 5 (with another OS like Debian)

Stable 60 fps is realistic for **retro emulation** (NES to PS1, most N64,
Dreamcast, many PSP games) and native ARM Linux games. **Not** for GameCube/PS2
or x86 PC games (those need x86 translation like Box64, too slow for a steady 60).
Best done with Raspberry Pi OS (Debian-based) or Batocera on a **second SD card
or USB drive**: swap cards, or set the Pi's boot order, and the server card stays
untouched.

## How it was tested, and what was not

Built in a cloud sandbox without access to Alpine's mirrors or GitHub, so:

- **Kernel**: configured and **compiled for the Pi 5** from Ubuntu's `linux-raspi`
  7.0 source (Raspberry Pi's tree with their patches): 10.4 MB `Image` with 16K pages,
  both Pi 5 device trees and the two overlays. `check-config.sh` reports every
  requested option applied. Every device the Pi 5 device tree enables was checked
  against the compiled drivers: SD slot, Ethernet (RP1 GEM + Broadcom PHY over PCIe),
  debug UART, firmware mailbox and clocks, PSCI, fan PWM, thermal, watchdog, RTC,
  RNG are all built in. The Wi-Fi + USB variant also compiles, with real Broadcom
  firmware embedded.
- **Userland scripts**: the shared s6 scripts (fsck and mounts, firewall, DHCP,
  sshd with key login, s6-log) booted under QEMU in an earlier x86 version; all shell
  scripts pass `shellcheck`, the firewall passes `nft -c`, the s6-rc tree passes
  `test/check-s6-tree.py`, the `config.txt` slot logic was unit-tested.
- **Not run here**: the real Pi 5 boot, `make-sd.sh` end to end (needs Alpine's
  mirror), `s6-rc-compile`/`s6-linux-init-maker`/mdevd/tailscaled on Alpine.
  `kernel/build-kernel.sh` uses Raspberry Pi's current branch from GitHub
  (6.x), while the test compile used their 7.0 patches from Ubuntu; that is
  why `check-config.sh` runs on every build and stops if anything is dropped,
  and why the card carries the stock-kernel rescue slot.
