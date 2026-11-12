#!/usr/bin/env bash
# Pruebas de la página en el navegador (Chromium con Playwright) contra un servidor YA encendido.
#   pruebas/interfaz/correr.sh                         # todas, salida en ~/.cache/nom-pruebas/salida
#   pruebas/interfaz/correr.sh ~/capturas prueba_85    # una, con otra carpeta de salida
#   NOM_BASE=http://192.168.0.77:8080 pruebas/interfaz/correr.sh   # contra el teléfono como servidor
#   NOM_NAVEGADOR=firefox pruebas/interfaz/correr.sh             # con Firefox (se instala la primera vez)
# La primera vez prepara su propio Python (venv) y el Chromium de Playwright en ~/.cache/nom-pruebas.
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
CACHE="${NOM_PRUEBAS_CACHE:-$HOME/.cache/nom-pruebas}"
SALIDA="${1:-$CACHE/salida}"
[ $# -gt 0 ] && shift
VENV="$CACHE/venv"
export PLAYWRIGHT_BROWSERS_PATH="$CACHE/navegadores"
if [ ! -x "$VENV/bin/python" ]; then
  echo "Preparando Python y Chromium para las pruebas (solo la primera vez)…"
  python3 -m venv "$VENV" && "$VENV/bin/pip" install -q playwright openpyxl python-docx python-pptx pillow \
    && "$VENV/bin/python" -m playwright install chromium || { echo "No se pudo preparar el entorno"; exit 1; }
fi
if [ "${NOM_NAVEGADOR:-chromium}" != chromium ] && ! ls "$PLAYWRIGHT_BROWSERS_PATH" | grep -q "^${NOM_NAVEGADOR}-"; then
  "$VENV/bin/python" -m playwright install "$NOM_NAVEGADOR" || { echo "No se pudo instalar $NOM_NAVEGADOR"; exit 1; }
fi
mkdir -p "$SALIDA"
PRUEBAS=("$@")
[ ${#PRUEBAS[@]} -eq 0 ] && PRUEBAS=(prueba_pres1 prueba_pptx prueba_pptx2 prueba_diag1 prueba_diag_movil prueba_85 prueba_citas prueba_datos prueba_biblioteca prueba_fuentes_api prueba_red)
for t in "${PRUEBAS[@]}"; do
  echo "=== $t"
  timeout 600 "$VENV/bin/python" "$AQUI/$t.py" "$SALIDA" 2>&1 | grep -v '^  File\|^    ' | tail -45
done
echo "Capturas y archivos en: $SALIDA"
