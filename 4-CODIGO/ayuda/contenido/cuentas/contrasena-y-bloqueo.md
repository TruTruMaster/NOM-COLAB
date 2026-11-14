---
titulo: Contraseña y bloqueo
descripcion: Cómo se guarda tu contraseña y por qué a veces la cuenta se bloquea 15 minutos.
orden: 10
aplica: Navegador, App Android
actualizado: 2026-11-13
version: 0.13.0
---
- La contraseña necesita **al menos 8 caracteres**. Nadie puede verla, ni quien administra el
  servidor: solo se guarda su huella (PBKDF2-HMAC-SHA256 con sal).
- Tras **5 intentos fallidos desde una misma red**, la cuenta queda bloqueada **15 minutos desde
  esa red**. Desde otra red, su dueño puede seguir entrando. Si llueven fallos desde muchos lados
  (más de 50 en una hora), se bloquea la cuenta entera 15 minutos.
- La pantalla dice cuánto falta. Si olvidaste la contraseña, usa tu
  [código de recuperación](ayuda:empezar/codigo-recuperacion).
