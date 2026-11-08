# Guía para que NOM-COLAB sea fácil de usar

Para quién escribimos: una alumna de secundaria, un maestro de 65 años, alguien que usa el celular
solo para WhatsApp y alguien que programa. Si la entiende quien sabe menos, la entienden todos.

En México, el promedio de escolaridad de las personas de 15 años o más es de **9.7 años** (INEGI,
Censo 2020): poco más de la secundaria. Por eso cada palabra cuenta.

---

## 1. Lo que dice la investigación

### Palabras

- Quienes leen con dificultad **hacen exactamente lo que dice cada palabra**. En pruebas de boletas
  electrónicas con personas de baja lectura, de edad avanzada o con deterioro cognitivo leve, lo
  que mejoró los resultados fue el lenguaje llano, menos texto y quitar la jerga
  ([Summers y Chisnell, 2014](https://usenix.org/system/files/conference/evtwote14/jets_0202-summers.pdf);
  [NIST, NISTIR 7556](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir7556.pdf): con
  instrucciones en lenguaje llano la gente votó con más precisión).
- Hasta los expertos prefieren textos cortos y claros
  ([NN/g, Plain Language for Everyone](https://www.nngroup.com/videos/plain-language-for-experts/)).
- En español, la referencia es la
  [Guía panhispánica de lenguaje claro y accesible](https://www.asale.org/sites/default/files/2025-10/Gu%C3%ADa%20panhisp%C3%A1nica%20de%20lenguaje%20claro%20y%20accesible.pdf)
  (RAE y ASALE).
- En los botones, un verbo que diga lo que pasa ("Crear el código", "Anular") en lugar de
  "Aceptar": la gente pulsa "Aceptar" por costumbre sin leer
  ([NN/g, UI Copy](https://www.nngroup.com/articles/ui-copy/)).

### Íconos y gestos

- Casi ningún ícono se entiende solo: los únicos que reconoce casi todo el mundo son la casa, la
  impresora y la lupa. **Todo ícono lleva su nombre a la vista**; lo que solo aparece al pasar el
  mouse no existe en el celular ([NN/g, Icon Usability](https://www.nngroup.com/articles/icon-usability/);
  [NN/g, Tooltips](https://nngroup.com/articles/tooltip-guidelines)).
- Mantener presionado es un **gesto oculto**: nada en la pantalla avisa que existe
  ([Norman y Nielsen, Gestural Interfaces](https://ignorethecode.net/blog/2010/05/30/nielsen_and_norman_on_gestures/)).
  Por eso la ruedita siempre tiene otro camino visible (la barra, el menú "Más") y un consejo la
  primera vez.
- Esconder las opciones en un menú reduce cuánto las encuentra la gente; en computadora, mucho más
  ([NN/g, Hamburger Menus](https://www.nngroup.com/articles/hamburger-menus/), 179 personas).
  Lo frecuente va a la vista; lo raro, en "Más".

### Memoria y opciones

- **Reconocer es más fácil que recordar**: que las opciones estén a la vista, no que haya que
  acordarse de ellas ([NN/g, Recognition vs. Recall](https://www.nngroup.com/articles/recognition-and-recall/)).
- La gente pasa casi todo su tiempo en otras apps y espera que la nuestra funcione igual
  ([NN/g, Mental Models](https://www.nngroup.com/articles/mental-models/)). Por eso "Compartir"
  junta todo, como en Google Docs, y unirse con un código es como entrar a un grupo de WhatsApp.
- Cada opción de más hace más lenta la decisión
  ([ley de Hick](https://lawsofux.com/hicks-law/)). Mostrar primero lo esencial y el resto
  después ayuda, pero cada capa extra también cuesta
  ([UX Magazine](https://uxmag.com/articles/balancing-cognitive-load-and-discoverability)).

### Ayuda y errores

- Los tutoriales al abrir la app **no ayudan**: en un estudio con 70 personas, quienes los leyeron
  no terminaron más tareas ni más rápido, y sintieron la app más difícil
  ([NN/g, Mobile Tutorials](https://www.nngroup.com/articles/mobile-tutorials/)). Mejor: consejos
  cortos en el momento en que hacen falta.
- Un buen mensaje de error dice **qué pasó, por qué y qué hacer**, y ofrece el botón para hacerlo
  ([NN/g, Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/)).

### Personas mayores

- Letra de al menos 16 px, buen contraste, botones grandes, errores claros y aceptar varias formas
  de escribir los datos ([NN/g, Usability for Seniors](https://www.nngroup.com/articles/usability-for-senior-citizens/),
  123 personas de 65 años o más).
- Con la edad, los azules y amarillos se ven más pálidos: no usarlos claros para texto importante
  ([guía de diseño para adultos mayores](https://uxdesign.cc/a-guide-to-interface-design-for-older-adults-31109468d46d)).
- Que cada quien pueda **agrandar la letra**.

### Niñas y niños

- Leen menos y se distraen más: ícono **y** palabra, metáforas del mundo real y respuestas muy
  evidentes a lo que hacen ([NN/g, Kids' Cognition](https://www.nngroup.com/articles/kids-cognition/)).

### Color, contraste y tamaño

- Texto con contraste de al menos **4.5:1**; bordes y controles, 3:1; botones de al menos 24 px
  (WCAG 2.2) y mejor **44 px** para el dedo ([WebAIM](https://webaim.org/articles/contrast/)).
- Alrededor de 1 de cada 12 hombres no distingue bien algunos colores: **nunca solo el color**
  para decir algo; siempre con texto o ícono.

---

## 2. Reglas para NOM-COLAB (revisarlas en cada cambio)

1. **Palabras de todos los días.** Usar el glosario de abajo. Frases cortas, en "tú". Nada de
   "servidor", "red local", "sincronizar", "LAN", "cifrado", "token" en lo que ve la gente.
2. **Un verbo en cada botón** que diga lo que pasa.
3. **Todo ícono con su nombre.** Si no cabe, el nombre aparece al mantenerlo presionado (y al pasar
   el mouse), pero lo esencial nunca vive solo ahí.
4. **Un solo lugar para cada cosa.** Si una acción aparece en tres sitios de la misma pantalla,
   dejar uno.
5. **Primero lo frecuente.** Lo raro o técnico va en "Más" u "Opciones avanzadas".
6. **Cada gesto oculto tiene un camino visible** (botón o menú) y un consejo la primera vez.
7. **Errores que ayudan:** qué pasó, qué hacer y el botón ("Volver a intentar").
8. **En el celular:** botones de 44 px, nada que dependa del mouse y sin mostrar atajos de teclado.
9. **Contraste de 4.5:1 o más** en todo el texto, también en modo oscuro. Color + texto, nunca
   solo color.
10. **Con mouse se dice "clic derecho"; con el dedo, "mantén presionado".**

---

## 3. Glosario: lo que decimos en lugar de la palabra técnica

| En vez de… | Decimos… |
|---|---|
| Servidor | el equipo que comparte · NOM-COLAB en Internet · otro NOM-COLAB |
| Red local, LAN, "en tu red" | el mismo Wi-Fi |
| Conexión del proyecto (anunciar en la red) | Que lo encuentren en el mismo Wi-Fi |
| Sincronizar | guardar una copia en otro NOM-COLAB · enviar tus cambios |
| Sincronizando | Guardando… |
| Solo lectura | Solo ver / Solo puede ver |
| Revocar, caducar | Anular, vencer |
| Enlace para unirse | Código de invitación |
| Exportar | Descargar |
| Cifrado (AES-256) | protegido con tu contraseña |
| Servidor en este teléfono | Trabajar sin Internet con este teléfono / Compartir desde este teléfono |
| Archivos en este dispositivo | Guardado en este equipo (en la app: Este teléfono) |
| Empresa u organización | Escuela, empresa o grupo |
| caracteres | letras o números |
| Bienvenido (masculino) | Hola de nuevo · Ya estás en NOM-COLAB |

---

## 4. Qué se cambió (noviembre de 2026)

- **Invitar en un solo lugar.** El espacio tiene un botón "Invitar" con nombre visible. Ahí está,
  primero, "Invitar con un código" (QR u 8 letras); luego agregar por nombre de usuario, quién
  quiere entrar, los miembros y "Que lo encuentren en el mismo Wi-Fi". Antes eran tres botones de
  solo ícono (compartir, QR y conexión).
- **Al crear un espacio**, en lugar de preguntar por la "Conexión del proyecto" en la red local,
  se ofrece "¿Invitas a tu equipo?".
- **Inicio sin repetir:** con cero espacios, un solo lugar con "Crear mi primer espacio" y "Tengo
  un código para entrar" (antes eran 4 botones para crear y 3 para unirse a la vez). La sección de
  documentos solo en este equipo aparece cuando ya hay alguno.
- **Pestañas y botones con nombre:** Textos, Hojas, Presentaciones, Diagramas; "Invitar" y "Más"
  también en el celular.
- **Entrar:** el texto ya no queda tapado por los dibujos; "Usar sin cuenta" explica a la vista que
  todo se queda solo en ese equipo; ícono de una persona en "Usuario"; "Hola de nuevo" en vez de
  "Bienvenido de vuelta"; "Tengo un código de invitación".
- **App Android:** la primera pantalla pregunta "¿Dónde trabaja tu equipo?" con las opciones en el
  orden en que se usan: escanear el QR, usar NOM-COLAB en Internet, buscar en este Wi-Fi o escribir
  la dirección.
- **Tamaño de la letra** en Ajustes (Normal, Grande, Muy grande), por equipo. En la app agranda
  todo el texto.
- **Contraste:** el gris del texto secundario pasó de 4.5:1 a 5.5–6:1; el contador de comentarios
  pasó de 2.3:1 a 6.3:1. Letra mínima de 11 px en las etiquetas pequeñas.
- **Celular:** botones de al menos 44 px y sin atajos de teclado en los menús.
- **Errores con salida:** si un espacio o documento no abre por la red, hay "Volver a intentar".
- **Consejos según el aparato:** "Haz clic derecho" con mouse; "Mantén presionado" con el dedo.
- Cerca de 50 textos más, sin "servidor", "red local", "sincronizar" ni "solo lectura" (ver el
  glosario). Los mensajes de error del servidor usan las mismas palabras.

---

## 5. Pendiente

- **Probar con personas reales**, con cinco de cada grupo: niñas y niños de 10 a 12 años, personas
  de 65 años o más y personas con poca experiencia en computadoras. Tareas: crear un espacio,
  invitar con el código, entrar con el código desde otro celular, escribir un párrafo, comentar y
  descargar en Word. Medir quién lo logra, cuánto tarda y en qué palabra se atora.
- **Nombre de "espacio".** Funciona como "carpeta compartida" o "grupo". "Grupo" se parece a los
  grupos de WhatsApp que casi todos conocen (crear, invitar con enlace, salir), pero cambiarlo
  toca la documentación y la presentación: decidirlo con las pruebas de arriba.
- En la app, probar en el A55 la letra "Grande" y "Muy grande" en los editores.
