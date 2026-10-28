# Notes for Claude sessions

This repo holds two unrelated things:

1. **NOM-COLAB**: a school project by team "WACK" (CECyT 9, 5IM7). It covers the web page +
   Android app, the Azure deployment and the module documents. Start with `LEEME.md` (Spanish);
   `LOG.md` records every change.
2. **The owner's Raspberry Pi 5 server** (`4-CODIGO/servidor-alpine/`): Alpine + s6 +
   a custom kernel, publishing the owner's static site at **https://vefose.pp.ua** through a
   Cloudflare Tunnel. **Before doing anything about the Pi, the server, the domain or
   the site, read `4-CODIGO/servidor-alpine/STATE.md`**: what is running, how the chain
   works, what is verified, open items, and lessons learned. Then `README.md` in that folder.

The Pi server has nothing to do with NOM-COLAB. Don't mix them up: an earlier session
wrongly assumed the site was NOM-COLAB and built for the laptop instead of the Pi.

## Working with the owner

- **Copy-paste commands** with full paths, and say where each runs (laptop or Pi).
- **Verify instead of assuming.** Say clearly what is untested.
- **Flag anything that costs money** or asks for a card.
- **Chat in English;** repo `LOG.md` entries and commit messages in Spanish.
- **After changing the Pi setup:** update `4-CODIGO/servidor-alpine/STATE.md` and add a
  bullet to `LOG.md`.
