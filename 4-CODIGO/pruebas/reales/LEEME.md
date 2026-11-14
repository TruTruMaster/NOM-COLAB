# Pruebas con equipos reales

Lo que las pruebas automáticas no alcanzan: la app publicable en el A55 con toques reales, el
Chromium de verdad del escritorio, varios equipos a la vez contra la Raspberry y el teléfono como
servidor. Resultados y cómo se usaron: `docs/RELEVO-PARIDAD-Y-PRUEBAS-REALES.md` (secciones 3 y 6).

Preparación:

```bash
export PLAYWRIGHT_BROWSERS_PATH=~/.cache/nom-pruebas/navegadores; PY=~/.cache/nom-pruebas/venv/bin/python
adb devices -l                              # el A55 (depuración inalámbrica); NOM_A55=<serie> si cambia
ssh -f -N -L 9333:localhost:9333 100.84.188.120   # CDP del Chromium del escritorio (ver el relevo para lanzarlo)
echo "<token>" > ~/.cache/nom-pruebas/token-x1    # sesión del dueño del espacio de prueba (o NOM_TOKEN)
```

Capturas y descargas: `~/.cache/nom-pruebas/capturas-reales/` y `~/.cache/nom-pruebas/exportados-k/`.
Con un servidor de pruebas en la laptop, arrancarlo con `NOM_DESCUBRIMIENTO=false`: si no, la app del
A55 lo encuentra sola en el Wi-Fi y se conecta a él (hallazgo H-8).
