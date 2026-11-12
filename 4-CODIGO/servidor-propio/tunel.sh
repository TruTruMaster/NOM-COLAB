#!/bin/sh
# Crea (una sola vez) el Cloudflare Tunnel "nomcolab", escribe ~/.cloudflared/nomcolab.yml y
# apunta nomcolab.dpdns.org y www.nomcolab.dpdns.org a él.
# Antes: `cloudflared tunnel login` con la cuenta de Cloudflare que tiene la zona
# nomcolab.dpdns.org (deja ~/.cloudflared/cert.pem).
#
# Usa la API de Cloudflare con curl y el token que trae cert.pem, no los comandos
# `cloudflared tunnel create/route`: en la red de la escuela esas llamadas de cloudflared se
# cortan ("connection reset by peer") y las de curl no. Si el túnel ya existe en la cuenta y
# su .json está en ~/.cloudflared (por ejemplo, copiado de otra computadora), lo reutiliza.
set -e
DOMINIO="${NOM_DOMINIO:-nomcolab.dpdns.org}"
NOMBRE=nomcolab
C="$HOME/.cloudflared"
[ -f "$C/cert.pem" ] || { echo "Falta $C/cert.pem: corre 'cloudflared tunnel login' primero"; exit 1; }
export C NOMBRE DOMINIO
python3 - <<'P'
import base64, json, os, secrets, subprocess, sys
C, NOMBRE, DOMINIO = os.environ["C"], os.environ["NOMBRE"], os.environ["DOMINIO"]
pem = open(f"{C}/cert.pem").read()
d = json.loads(base64.b64decode("".join(l for l in pem.splitlines() if not l.startswith("-----"))))
tok, acc, zona = d["apiToken"], d["accountID"], d["zoneID"]

def api(metodo, ruta, cuerpo=None):
    cmd = ["curl", "-s", "-m", "30", "-X", metodo, "-H", f"Authorization: Bearer {tok}",
           "-H", "Content-Type: application/json", "https://api.cloudflare.com/client/v4" + ruta]
    if cuerpo is not None: cmd[1:1] = ["--data", json.dumps(cuerpo)]
    r = json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
    if not r.get("success"): sys.exit(f"API {metodo} {ruta}: {r.get('errors')}")
    return r["result"]

tuneles = [t for t in api("GET", f"/accounts/{acc}/cfd_tunnel?is_deleted=false&name={NOMBRE}") if t["name"] == NOMBRE]
if tuneles and os.path.exists(f"{C}/{tuneles[0]['id']}.json"):
    tid = tuneles[0]["id"]; print(f"Túnel {NOMBRE} ya existe: {tid}")
elif tuneles:
    sys.exit(f"El túnel {NOMBRE} ({tuneles[0]['id']}) existe pero falta {C}/{tuneles[0]['id']}.json: cópialo de la computadora que lo creó")
else:
    secreto = base64.b64encode(secrets.token_bytes(32)).decode()
    r = api("POST", f"/accounts/{acc}/cfd_tunnel", {"name": NOMBRE, "tunnel_secret": secreto, "config_src": "local"})
    tid = r["id"]
    p = f"{C}/{tid}.json"
    with open(os.open(p, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump({"AccountTag": r["account_tag"], "TunnelSecret": secreto, "TunnelID": tid}, f)
    print(f"Túnel {NOMBRE} creado: {tid}")

open(f"{C}/nomcolab.yml", "w").write(f"""# Cloudflare Tunnel de NOM-COLAB (lo genera 4-CODIGO/servidor-propio/tunel.sh)
tunnel: {tid}
credentials-file: {C}/{tid}.json
metrics: 127.0.0.1:20241
ingress:
  - hostname: {DOMINIO}
    service: http://127.0.0.1:8080
  - hostname: www.{DOMINIO}
    service: http://127.0.0.1:8080
  - service: http_status:404
""")

destino = f"{tid}.cfargotunnel.com"
for nombre in (DOMINIO, "www." + DOMINIO):
    hay = api("GET", f"/zones/{zona}/dns_records?name={nombre}")
    reg = {"type": "CNAME", "name": nombre, "content": destino, "proxied": True, "comment": "Túnel nomcolab"}
    if hay: api("PUT", f"/zones/{zona}/dns_records/{hay[0]['id']}", reg)
    else: api("POST", f"/zones/{zona}/dns_records", reg)
    print(f"DNS: {nombre} -> {destino}")
P
cloudflared --config "$C/nomcolab.yml" tunnel ingress validate
echo "Listo: https://$DOMINIO"
