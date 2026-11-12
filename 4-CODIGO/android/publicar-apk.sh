#!/bin/sh
# Publica 3-APP-Android/NOM-COLAB.apk como la release "más reciente" en GitHub, para que el
# botón "Descarga la app" de la página (https://.../releases/latest/download/NOM-COLAB.apk) dé
# siempre esta versión. El archivo lo sirve la red de GitHub, no la conexión del servidor.
#
# Correrlo después de compilar el APK (cuando ya está copiado en 3-APP-Android/NOM-COLAB.apk).
# Necesita el token de GitHub en ~/NOM/tokensito.
set -e
REPO="TruTruMaster/NOM-COLAB"
APK="$HOME/NOM/3-APP-Android/NOM-COLAB.apk"
TOK="$(cat "$HOME/NOM/tokensito")"
VER="$(grep -oE 'versionName = "[^"]+"' "$HOME/NOM/4-CODIGO/android/app/build.gradle.kts" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')"
TAG="v$VER"
[ -f "$APK" ] || { echo "No existe $APK (compila el APK primero)"; exit 1; }
[ -n "$VER" ] || { echo "No pude leer la versión"; exit 1; }
api() { curl -s -H "Authorization: Bearer $TOK" -H 'Accept: application/vnd.github+json' "$@"; }

echo "Publicando NOM-COLAB $TAG ($(du -h "$APK" | cut -f1))"
ID="$(api "https://api.github.com/repos/$REPO/releases/tags/$TAG" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("id","") or "")')"
if [ -z "$ID" ]; then
  BODY="$(python3 -c "import json;print(json.dumps({'tag_name':'$TAG','target_commitish':'main','name':'NOM-COLAB $VER','body':'Aplicacion de Android (APK) de NOM-COLAB. Descargala con el boton de la pagina o desde el archivo de aqui abajo. En el telefono, abrela y permite instalar de origenes desconocidos.','make_latest':'true'}))")"
  ID="$(api -X POST "https://api.github.com/repos/$REPO/releases" -d "$BODY" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')"
  echo "  release creada (id $ID)"
else
  api -X PATCH "https://api.github.com/repos/$REPO/releases/$ID" -d '{"make_latest":"true"}' >/dev/null
  echo "  release $TAG ya existía (id $ID), marcada como la más reciente"
  # Si ya tenía el APK, se borra para volver a subirlo.
  OLD="$(api "https://api.github.com/repos/$REPO/releases/$ID/assets" | python3 -c 'import sys,json;[print(a["id"]) for a in json.load(sys.stdin) if a["name"]=="NOM-COLAB.apk"]')"
  for a in $OLD; do api -X DELETE "https://api.github.com/repos/$REPO/releases/assets/$a" >/dev/null; echo "  asset anterior borrado"; done
fi
curl -s -H "Authorization: Bearer $TOK" -H 'Content-Type: application/vnd.android.package-archive' \
  --data-binary @"$APK" "https://uploads.github.com/repos/$REPO/releases/$ID/assets?name=NOM-COLAB.apk" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("  subido:",d.get("name"),d.get("size"),d.get("state"))'
echo "Listo. Enlace fijo: https://github.com/$REPO/releases/latest/download/NOM-COLAB.apk"
