# Pruebas de la interfaz en el navegador

Pruebas automáticas de la página con Chromium (Playwright), escritas el 8 de noviembre de 2026
para las fases 8 y 9. **No sustituyen las pruebas reales** en la laptop, el escritorio y el A55
(ver `docs/PLAN-PRUEBAS-REALES.md`): sirven para revisar rápido que nada se rompió después de un
cambio.

Necesitan un servidor encendido (por defecto `http://localhost:8099`, o el de `NOM_BASE`):

```bash
cd 4-CODIGO/app
NOM_PUERTO=8099 NOM_DATOS=~/nom-datos-pruebas \
SPRING_WEB_RESOURCES_STATIC_LOCATIONS=file:$PWD/src/main/resources/static/ \
java -jar target/nom-colab.jar &
cd ..
pruebas/interfaz/correr.sh            # todas
pruebas/interfaz/correr.sh ~/salida prueba_citas
```

Cada prueba crea sus propias cuentas y espacios, **imprime lo que encuentra** (no se detiene en el
primer error) y deja capturas en la carpeta de salida: se revisan a ojo. Al final de cada una sale
`errores: [...]` con los errores de JavaScript de la página; tiene que salir vacío.

| Prueba | Qué revisa | Necesita |
|---|---|---|
| `prueba_pres1` | Presentación: tema, diseños, texto con formato, tabla, gráfica, ícono, imagen recortada, animaciones, presentar con láser, 4:3, PNG | — |
| `prueba_pptx` | Exportar .pptx (lo abre python-pptx y LibreOffice) y volverlo a importar | LibreOffice, `pdftoppm` |
| `prueba_pptx2` | Importar un .pptx hecho con otro programa (marcadores, viñetas, grupos, gráfica, fondo, notas) | — |
| `prueba_diag1` | Diagramas listos, flechas (codo, puntas, texto), cuadrícula, UML, texto a diagrama, SVG y .pptx, diagrama en una diapositiva | LibreOffice |
| `prueba_diag_movil` | Diagramas en ancho de celular (390 px) | — |
| `prueba_85` | Carpetas, destacados, renombrar, copia, plantilla del espacio, buscar en el contenido, papelera, enlace para ver, menciones | — |
| `prueba_citas` | Investigar (Wikipedia), fichas, fuente por DOI, citar, referencias APA, armar reporte, recibo con "citado" | Internet |
| `prueba_datos` | Reporte de una encuesta, combinar correspondencia, documento a presentación y a mapa mental, flujo desde texto, Wikidata | Internet (Wikidata) |
| `prueba_biblioteca` | Biblioteca del espacio (guardar con texto y leerla), reporte desde un CSV, Investigar en el celular | Internet |
| `prueba_red` | La red de punta a punta: dos páginas, el navegador de un celular y la interfaz del APK (cargada desde archivos) contra un servidor; misma cuenta en app y página, en vivo en todos los sentidos, sin conexión y de regreso, reabrir sin red con cambios pendientes, registrarse desde la app, aviso de versión | — |
| `prueba_cuentas_equipo` | Cuentas y lo guardado en el equipo: dos cuentas en un mismo navegador, restablecer y cambiar la contraseña sin perder lo local (se recupera con la anterior), almacenamiento a la vista, dónde se guarda lo nuevo, boletos del canal en vivo, aviso de red local y borrar la cuenta | — (no va en la tanda por omisión: tarda unos 4 min) |
| `prueba_fuentes_api` | Las rutas de fuentes (Wikipedia, libros, artículos, DOI, ISBN, página web, Wikidata) | Internet |

`nomprueba.py` tiene lo común: crear cuentas, espacios y documentos por la API, y abrir el
navegador (computadora o celular).
