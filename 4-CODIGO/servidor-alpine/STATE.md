# servidor-alpine: current state (handoff for the next session)

Last updated: **2026-10-28**. Read this before touching anything in this folder.
`README.md` explains how the scripts work; this file says **what exists right now**,
how the pieces connect, what is verified, and what is still open.

## 1. What is running

| | |
|---|---|
| **Server** | Raspberry Pi 5, 8 GB, headless, booting from its own microSD slot |
| **OS** | Alpine 3.24.3 aarch64, no OpenRC, no initramfs: `s6-linux-init` is PID 1, `s6-rc` runs the services |
| **Kernel** | `6.18.59-min`, built on the laptop from `raspberrypi/linux` branch `rpi-6.18.y` with `kernel/*.config`; slot `a/` |
| **Rescue kernel** | Alpine's `linux-rpi` 6.18.58 in slot `s/` (`sudo sh update-sd.sh --rescue` switches to it) |
| **Public site** | **https://vefose.pp.ua**, confirmed working by the owner on 2026-10-28 |
| **Site files** | `/srv/www/default` on the Pi, served by nginx on port 80; the owner's site is a work in progress |
| **Admin** | `ssh pi5` from the laptop (user `user`, key only), `doas` for root (password set when the card was written) |
| **Idle usage** | 94 MB RAM used of 8 GB, CPU at 1500 MHz (its minimum), 41 °C, root filesystem 113 MB |

## 2. How the chain works

```
Visitor's browser
  -> DNS for vefose.pp.ua: delegated by NIC.UA to Cloudflare (anirban / brenda.ns.cloudflare.com)
  -> Cloudflare edge: HTTPS certificate, cache (Free plan)
  -> Cloudflare Tunnel: an OUTGOING connection the Pi keeps open; no port open at home
  -> cloudflared on the Pi (s6 service "cloudflared", runs as user cloudflared)
  -> http://localhost:80: nginx (s6 service "nginx")
  -> /srv/www/default
```

- **Tunnel:** a locally-managed tunnel, made on the Pi with
  `doas cloudflare-tunnel setup vefose.pp.ua www.vefose.pp.ua` (the owner was told to
  include `www`; `doas cloudflare-tunnel status` shows which names it serves). The setup
  used `cloudflared tunnel login` (browser approval, once), `tunnel create`, and
  `tunnel route dns` (it creates the CNAME records itself). No Zero Trust dashboard,
  because it asks for a payment card even on the free plan.
- **Tunnel files on the Pi:**
  - `/etc/cloudflared/config.yml`: tunnel id, hostnames, `http://localhost:80`
  - `/etc/cloudflared/<tunnel-id>.json`: credentials (root:cloudflared 640)
  - `/root/.cloudflared/cert.pem`: Cloudflare login, needed only to add or change names
  - `/usr/local/bin/cloudflared`: Cloudflare's official arm64 binary (Alpine 3.24 does not package it)
- **Admin path:** laptop -> `ssh pi5` -> LAN `192.168.0.199`. The `Host pi5` block in the
  laptop's `~/.ssh/config` is written by `sh pi5.sh find`, which also checks the Pi's host
  key. If the Pi's LAN address changes, run `sh pi5.sh find` again; it tries Tailscale first.
- **Tailscale:** the Pi joined the owner's tailnet `tailfd65f2.ts.net` as `pi5`
  (interactive `doas tailscale up`; no auth key on the card).
  - Funnel was enabled, so the site was also public at `https://pi5.tailfd65f2.ts.net`;
    whether it is still on is unknown (`doas tailscale funnel status`).
  - Funnel cannot serve custom domains, which is why the domain goes through Cloudflare.
- **Updating the Pi:** edit this folder, commit, then on the laptop run
  `git pull && sh pi5.sh push`. That command copies the service scripts and tools over
  SSH, and `apply-on-pi.sh` runs `svc reload` (recompile s6-rc, `s6-rc-update` live) and
  starts any new service. Asks for the doas password.
- **Updating the site:** `scp -r <site folder>/* pi5:/srv/www/default/` from the laptop.
  - Cloudflare caches images, CSS and JS: use Development Mode or Purge Everything in the
    Cloudflare dashboard when a change does not show.

### Boot chain

1. **EEPROM** reads `config.txt` on the FAT partition. Its `[all]` section has:
   - `os_prefix=a/`
   - `dtoverlay=disable-wifi-pi5`, `dtoverlay=disable-bt-pi5`, `dtoverlay=eee-off-pi5`
   - `dtparam=cooling_fan=on`, `dtparam=audio=off`
2. The firmware loads `a/kernel_2712.img`, `a/bcm2712*-rpi-5-b.dtb` and `a/cmdline.txt`.
3. Overlays come from the **shared `/overlays/` folder**, not `a/overlays/` (see 4.2).
4. The kernel mounts `root=PARTUUID=1d1bba87-02` read-only, with no initramfs.
5. `/sbin/init` (s6-linux-init) runs `rc.init`, then `s6-rc change default`.
6. The default bundle is `base` + `web`:
   - **oneshots:** fs (fsck, rw, boot counter), hostname, sysctl, loopback, firewall
     (nftables), coldplug, power (CPU governor), tailscale-login
   - **longruns:** mdevd, syslogd + klogd, sshd, tailscaled, udhcpc-eth0, ntpd, crond,
     watchdog, nginx, cloudflared, boot-report, getty-tty1
   - **logs:** `/var/log/<service>/current` (s6-log; `svc log <name>`)
7. `[tryboot]` has `os_prefix=b/`, for `kernel-min trial`; that path is untested on hardware.
8. `boot-report` writes `/boot/boot-report.txt` 30 s and 2 min after boot. `fs` counts
   boots in `/var/lib/servidor-alpine/boots`. `check-sd.sh` on the laptop reads both and
   copies all logs to `pi5-logs/`.

## 3. Where things are

| Place | What |
|---|---|
| **Laptop**: Debian 13, host `PC`, user `user` | Builds kernels and cards, holds the SSH key `~/.ssh/id_ed25519`. Wi-Fi `wlp3s0` at 192.168.0.246. The card reader shows the microSD as `/dev/sda`. |
| **Laptop: `~/pi5-server`** | Clone of this repo, branch `claude/peaceful-turing-e2zegt`. Work in `~/pi5-server/4-CODIGO/servidor-alpine`. |
| **Laptop, not in git** (`.gitignore`) | `config.env` (what `pi5.sh` decided), `pi5-hostkey.pub` (the Pi's SSH host key), `pi5-mac`, `pi5-logs/`, `kernel/build/` (kernel tree + `out/`) |
| **LAN** | Router 192.168.0.1 (the laptop's Wi-Fi and the Pi's cable). Pi: MAC `98:fe:54:13:a4:bb`, DHCP address 192.168.0.199. |
| **microSD**: 64 GB, "SD64G" | p1 FAT32 256 MiB `BOOT` (UUID in `/etc/fstab`), p2 ext4 `alpine-root`, PARTUUID `1d1bba87-02`, UUID `26c7ca7e-d1a0-4474-993f-13e54a217557` |
| **NIC.UA** (owner's account) | Free domain `vefose.pp.ua`, created 2026-10-28, order **2882931** (2882920 was a cancelled duplicate). Nameservers: `anirban.ns.cloudflare.com`, `brenda.ns.cloudflare.com`. A card is linked (NIC.UA requires one for free orders: a 1 UAH check). |
| **Cloudflare** (owner's account, Free plan) | Zone `vefose.pp.ua` and the tunnel (named after the Pi's hostname, `pi5`). DNS records come from `cloudflared tunnel route dns`; do not add A/CNAME records for those names by hand. |

### Renewing the domain (yearly, manual)

- **Free:** `.pp.ua` renewal costs 0 UAH, but there is **no auto-renew**.
- **When:** about 2027-08-29 (60 days before 2027-10-28), order the renewal in NIC.UA.
- **Confirm it:** with the code the registry sends by SMS (or its Telegram bot), within
  5 days, or the renewal does not happen.
- **Hard deadline:** more than 28 days after expiry, the name is lost.
- **Phone number:** the name is tied to the owner's phone number.

## 4. Lessons learned (do not repeat)

1. **Never `mount --rbind` the laptop's `/dev` or `/sys` into the chroot and then `umount -l`.**
   With systemd's shared mounts it unmounted the laptop's own `/dev/pts`. `sudo` then failed
   with "unable to allocate pty" until the laptop was rebooted. `make-sd.sh` and
   `update-sd.sh` now use their own proc/sysfs/devtmpfs mounts and `umount -R`.
2. **Pi firmware overlays:** `<os_prefix>overlays/` is read **only if it contains a `README`
   file**; otherwise the shared `/overlays/` folder is used. With a README in `a/overlays/`,
   the Pi showed no sign of booting (cause not proven). So all overlays live in `/overlays/`,
   where Alpine's `linux-rpi` puts its own. `update-sd.sh` removes any slot README.
3. **Ethernet EEE:** with EEE, the rpi-6.18 `macb` driver dropped the link 1 s after every
   "Link is Up". `kernel/eee-off-pi5-overlay.dts` (compiled into `eee-off-pi5.dtbo`) stops
   the PHY offering EEE.
   - **Not yet confirmed on hardware** since the overlay moved to `/overlays/`. On the Pi:
     `find /sys/firmware/devicetree/base -name eee-broken-1000t` (prints a path = applied),
     and `cat /sys/class/net/eth0/carrier_changes` (1 = no flapping).
4. **Network location:** the Pi's cable was first on another box (192.168.0.254, MAC
   `c6:c9:e3:1f:75:69`). It handed out 192.168.0.100 with 60 s leases and DNS that did not
   work, and the laptop could not reach it. The Pi now hangs off the main router.
5. **No clock battery:** the clock starts near 1970 until `ntpd` syncs, which needs DNS.
   Logs from before that show 1969/1970 dates.
6. **Power off cleanly** (`doas poweroff`) before unplugging, or the FAT partition is left
   dirty (kernel warning, so far harmless).
7. **Claude cloud sessions cannot reach the Pi, the LAN or the site.**
   - **Blocked:** Alpine mirrors (`dl-cdn.alpinelinux.org`), `dns.google`,
     `domain.digitalplat.org` and `docs.is-a.dev`.
   - **Reachable:** GitHub, `raw.githubusercontent.com`, web search.
   - Everything on hardware happens through commands the owner copies and pastes back.
8. **Testing without hardware** (what worked here):
   - `shellcheck -S warning`, plus `python3 test/check-s6-tree.py` for the s6 tree.
   - Card scripts: run under `unshare -m` with loop devices and `mknod` partition nodes
     (no udev in the sandbox; the sandbox kernel has no vfat, so use ext4 for the test boot
     partition).
   - Pi-side scripts: chroot into an x86_64 Alpine root with stubs for s6/cloudflared.
   - Device trees: build the real ones from a sparse clone of `rpi-6.18.y`, then check
     overlays with `fdtoverlay`.

## 5. Open items

- [ ] **Confirm EEE is off on hardware:** see 4.3.
- [ ] **Owner's site:** upload it to `/srv/www/default`; not done as of this note, as far as known.
- [ ] **Tailscale:** disable key expiry for `pi5` in the admin console (suggested; unknown if
  done). Decide whether to keep Funnel (`doas tailscale funnel reset` turns it off).
- [ ] **Power reading:** offered, not built. Needs `CONFIG_BCM_VCIO=y` (+ `CONFIG_BRCM_CHAR_DRIVERS`)
  in `kernel/pi5.config`, then `doas apk add raspberrypi-utils-vcgencmd`, then
  `vcgencmd pmic_read_adc` (sum of V x I per rail, an under-estimate). A USB-C meter gives
  the true wall draw; an idle Pi 5 is typically 2.5–3 W.
- [ ] **`kernel-min` build / trial / confirm** (A/B kernel update with tryboot): never run on hardware.
- [ ] **Wi-Fi / USB kernel variants:** built and compiled, never used on hardware.
- [ ] **Domain renewal:** around 2027-08-29 (section 3).

## 6. Working with the owner

- **Copy-paste commands** with full paths, and always say **where** each runs (laptop or Pi).
  The owner pastes the output back.
- **Don't assume, don't invent.** Earlier sessions built for the laptop instead of the Pi,
  and assumed the site was the NOM-COLAB project. The laptop is only the build machine and
  SSH client; the site is the owner's own static pages.
- **Say up front about anything that costs money or asks for a card**, and prefer free options.
- When asked for a list, make it complete; never trim logs or output the owner needs to see.
- **Language:** chat in English. In this repo, `LOG.md` gets a Spanish bullet per change and
  commit messages are in Spanish; this folder's docs are in English (the owner asked for that).
