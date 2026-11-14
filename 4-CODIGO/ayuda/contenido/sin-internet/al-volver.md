---
titulo: Qué pasa al volver Internet
descripcion: Lo editado sin conexión se sube tal cual o se abre una rama, sin tocar el original.
orden: 40
aplica: Navegador, App Android, Teléfono que comparte
actualizado: 2026-11-13
version: 0.13.0
---
Cuando vuelve la red, por cada documento que cambiaste **sin conexión**:

- **Nadie más lo cambió mientras tanto** → lo tuyo se sube **tal cual** y se junta con lo de los
  demás, como siempre.
- **Alguien más lo cambió mientras tanto** → se abre una **[rama](ayuda:espacios/ramas)**: un
  documento nuevo, ligado al original, con todo lo que tú tenías. **El original no se toca.**

«Mientras tanto» es desde que tu equipo se quedó sin conexión hasta que volvió: lo que otros
cambiaron antes, ya lo tenías.

## ¿Cuándo cuenta como «sin conexión»?

El Wi-Fi de un salón se corta unos segundos todo el tiempo; si cada corte abriera una rama habría
ramas a cada rato. Por eso la regla de las ramas aplica cuando:

- estuviste sin conexión **más de 2 minutos**, o
- **abriste el documento ya sin Internet** (reabriste la página o la app sin red).

Un corte más corto se junta solo: el sistema no pierde ninguna letra de nadie.

## Lo que ves

- Si se subió tal cual: *«Se enviaron N cambios que estaban guardados en este equipo»* y, si otros
  cambiaron las mismas partes, un resumen de qué quedó.
- Si se abrió una rama: *«Se creó una rama porque Ana cambió el documento mientras no tenías
  conexión»*, con **Abrir la rama**. El original se vuelve a mostrar como está en el servidor.

## Casos especiales

| Qué pasó mientras no tenías conexión | Qué hace NOM-COLAB |
|---|---|
| Creaste un documento nuevo | Se sube como documento nuevo, sin rama |
| Borraron el original (o está en la papelera) | Lo tuyo queda como documento aparte «(recuperado)» |
| Le cambiaron el nombre y tú también | Gana el nombre de la nube; el tuyo se queda en la rama |
| Pasó la fecha límite de entrega | La rama se crea marcada «editado después de la fecha límite» y no se fusiona sola |
| Lo protegieron contra el borrado | La rama se crea marcada |
| Varias personas sin Internet a la vez | Una rama por persona |
