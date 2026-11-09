/* NOM-COLAB · plantillas (Plantilla del diagrama de clases, CU-18 flujo 2a).
   Cada plantilla produce las operaciones iniciales del documento. */
(function () {
  "use strict";
  const NOM = window.NOM;

  function ops(bloques, paginas) {
    const lista = [];
    let i = 0;
    if (paginas) lista.push({ id: "tpl:" + i++, bloque: "_doc", campos: { paginas }, t: 2, n: "plantilla" });
    bloques.forEach((b) => {
      const { id, ...campos } = b;
      lista.push({ id: "tpl:" + i++, bloque: id, campos, t: 2, n: "plantilla" });
    });
    return NOM.DocCRDT.partir(lista);
  }
  let n = 0;
  const id = () => "t" + (++n).toString(36) + Math.random().toString(36).slice(2, 6);
  const texto = (html, estilo, orden, extra) => Object.assign({ id: id(), tipo: "texto", pagina: "p1", orden, html, estilo: estilo || "p" }, extra || {});
  const forma = (figura, txt, x, y, w, h, color, pagina, extra) => Object.assign({ id: id(), tipo: "forma", figura, texto: txt, x, y, w, h, z: 1, color, pagina: pagina || "p1", orden: y }, extra || {});
  const conector = (a, b, pagina) => ({ id: id(), tipo: "conector", desde: a.id, hasta: b.id, pagina: pagina || "p1", orden: 0 });
  function tabla(celdas, filas, cols, negritas) {
    const b = { id: id(), tipo: "tabla", pagina: "p1", orden: 1, filas, cols, x: 40, y: 40, w: 880, h: 300 };
    Object.keys(celdas).forEach((k) => (b["c:" + k] = celdas[k]));
    (negritas || []).forEach((k) => (b["n:" + k] = true));
    return b;
  }
  const C = { azul: "#CFE0FF", verde: "#CDEFD9", naranja: "#FFE0BF", violeta: "#E4D9FF", rosa: "#FFD6DE", amarillo: "#FFF1B8", gris: "#E7E5EE" };
  const hoy = () => new Date().toLocaleDateString("es-MX", { dateStyle: "long" });
  /** 8.5 Datos del documento además de las páginas (tema y tamaño de la presentación). */
  const conDoc = (lista, campos) => lista.concat([{ id: "tpl:doc", bloque: "_doc", campos, t: 2, n: "plantilla" }]);
  /** 8.5 Diapositivas con los diseños de la app (portada, título y contenido…) y su texto. */
  function diapos(lista) {
    const D = NOM.diapo, T = D ? D.TAMANOS["16:9"] : { w: 960, h: 540 }, bloques = [], paginas = [];
    lista.forEach(([diseno, textos], i) => {
      const pg = "p" + (i + 1);
      paginas.push(pg);
      const ds = D ? D.DISENOS.find((x) => x.id === diseno) : null;
      (ds ? ds.arma(T.w, T.h) : []).forEach((b, k) => {
        const t = (textos || [])[k];
        const html = t == null ? b.html || "" : Array.isArray(t) ? `<ul>${t.map((x) => `<li>${NOM.esc(x)}</li>`).join("")}</ul>` : NOM.esc(t);
        bloques.push(Object.assign({}, b, { id: id(), pagina: pg, orden: k + 1, z: k + 1, html, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }));
      });
    });
    return { bloques, paginas };
  }
  /** 8.5 Un diagrama listo (NOM.diagramas) como documento nuevo. */
  function deDiagrama(g) {
    const x0 = Math.min(...g.bloques.map((b) => b.x)), y0 = Math.min(...g.bloques.map((b) => b.y));
    const bs = g.bloques.map((b, i) => Object.assign({}, b, { id: id(), pagina: "p1", orden: i + 1, z: i + 1, x: b.x - x0 + 80, y: b.y - y0 + 80 }));
    const cs = (g.uniones || []).map(([a, b, o]) => Object.assign({ id: id(), tipo: "conector", desde: bs[a].id, hasta: bs[b].id, pagina: "p1", orden: 0 }, o || {}));
    return ops(bs.concat(cs));
  }
  const diag = (nombre) => () => deDiagrama(NOM.diagramas.generar(NOM.diagramas.CATALOGO.find((x) => x.id === nombre)));

  const LISTA = [
    { id: "vacio-texto", modo: "TEXTO", nombre: "En blanco", desc: "Página vacía", crear: () => ops([texto("", "p", 1)]) },
    {
      id: "acta", modo: "TEXTO", nombre: "Acta de reunión", desc: "Asistentes y acuerdos",
      crear: () => ops([
        texto("Acta de reunión", "titulo", 1),
        texto("<b>Fecha:</b> " + new Date().toLocaleDateString("es-MX", { dateStyle: "long" }) + " · <b>Lugar:</b> ", "p", 2),
        texto("Asistentes", "h2", 3), texto("", "lista", 4),
        texto("Temas tratados", "h2", 5), texto("", "lista", 6),
        texto("Acuerdos", "h2", 7), texto("", "tarea", 8),
      ]),
    },
    {
      id: "plan-clase", modo: "TEXTO", nombre: "Plan de clase", desc: "Inicio, desarrollo y cierre",
      crear: () => ops([
        texto("Plan de clase", "titulo", 1),
        texto("<b>Materia:</b>  · <b>Grupo:</b>  · <b>Fecha:</b> ", "p", 2),
        texto("Propósito", "h2", 3), texto("", "p", 4),
        texto("Secuencia didáctica", "h2", 5),
        texto("<b>Inicio (10 min):</b> ", "lista", 6), texto("<b>Desarrollo (30 min):</b> ", "lista", 7), texto("<b>Cierre (10 min):</b> ", "lista", 8),
        texto("Evaluación", "h2", 9), texto("", "tarea", 10),
      ]),
    },
    {
      id: "reporte-practica", modo: "TEXTO", nombre: "Reporte de práctica", desc: "Objetivo, hipótesis, resultados",
      crear: () => ops([
        texto("Reporte de práctica", "titulo", 1),
        texto("<b>Materia:</b>  · <b>Equipo:</b>  · <b>Fecha:</b> " + hoy(), "p", 2),
        texto("Objetivo", "h2", 3), texto("", "p", 4),
        texto("Hipótesis", "h2", 5), texto("", "p", 6),
        texto("Materiales", "h2", 7), texto("", "lista", 8),
        texto("Procedimiento", "h2", 9), texto("", "lista", 10),
        texto("Resultados", "h2", 11), texto("", "p", 12),
        texto("Conclusiones", "h2", 13), texto("", "p", 14),
        texto("Referencias", "h2", 15), texto("", "p", 16),
      ]),
    },
    {
      id: "ensayo", modo: "TEXTO", nombre: "Ensayo", desc: "Introducción, desarrollo, conclusión",
      crear: () => ops([
        texto("Título del ensayo", "titulo", 1),
        texto("Nombre · Grupo · " + hoy(), "p", 2),
        texto("Introducción", "h2", 3), texto("", "p", 4),
        texto("Desarrollo", "h2", 5), texto("", "p", 6),
        texto("Conclusión", "h2", 7), texto("", "p", 8),
        texto("Referencias", "h2", 9), texto("", "p", 10),
      ]),
    },
    {
      id: "ficha-lectura", modo: "TEXTO", nombre: "Ficha de lectura", desc: "Datos del libro e ideas",
      crear: () => ops([
        texto("Ficha de lectura", "titulo", 1),
        texto("<b>Título:</b>  · <b>Autor:</b>  · <b>Año:</b>  · <b>Editorial:</b> ", "p", 2),
        texto("Ideas principales", "h2", 3), texto("", "lista", 4),
        texto("Personajes o conceptos", "h2", 5), texto("", "lista", 6),
        texto("Cita que me gustó", "h2", 7), texto("", "cita", 8),
        texto("Mi opinión", "h2", 9), texto("", "p", 10),
      ]),
    },
    {
      id: "carta-formal", modo: "TEXTO", nombre: "Carta formal", desc: "Fecha, destinatario y firma",
      crear: () => ops([
        texto("Ciudad, a " + hoy(), "p", 1),
        texto("<b>Nombre de quien la recibe</b><br>Cargo<br>Presente", "p", 2),
        texto("Por medio de la presente me dirijo a usted para…", "p", 3),
        texto("Sin más por el momento, le envío un cordial saludo.", "p", 4),
        texto("Atentamente,<br><br><br>Nombre y firma", "p", 5),
      ]),
    },
    { id: "vacio-hoja", modo: "HOJA", nombre: "En blanco", desc: "Hoja de 30 × 10", crear: () => ops([tabla({}, 30, 10)]) },
    {
      id: "asistencia", modo: "HOJA", nombre: "Lista de asistencia", desc: "Escribe A (asistió) o F (faltó)",
      crear: () => {
        const c = { A1: "Alumno", L1: "Asistencias", M1: "% de asistencia" };
        for (let k = 0; k < 10; k++) c[String.fromCharCode(66 + k) + "1"] = "Día " + (k + 1);
        for (let f = 2; f <= 21; f++) {
          c["A" + f] = "Alumno " + (f - 1);
          c["L" + f] = `=CONTAR.SI(B${f}:K${f},"A")`;
          c["M" + f] = `=SI(CONTARA(B${f}:K${f})=0,"",REDONDEAR(L${f}/CONTARA(B${f}:K${f})*100,0))`;
        }
        return ops([tabla(c, 30, 13, ["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1", "I1", "J1", "K1", "L1", "M1"])]);
      },
    },
    {
      id: "horario", modo: "HOJA", nombre: "Horario de clases", desc: "Lunes a viernes por hora",
      crear: () => {
        const c = { A1: "Hora", B1: "Lunes", C1: "Martes", D1: "Miércoles", E1: "Jueves", F1: "Viernes" };
        ["7:00", "7:50", "8:40", "9:30", "10:00 (receso)", "10:30", "11:20", "12:10", "13:00"].forEach((h, i) => (c["A" + (i + 2)] = h));
        return ops([tabla(c, 14, 6, ["A1", "B1", "C1", "D1", "E1", "F1"])]);
      },
    },
    {
      id: "experimento", modo: "HOJA", nombre: "Registro de experimento", desc: "Mediciones y promedio",
      crear: () => {
        const c = { A1: "Intento", B1: "Distancia (m)", C1: "Tiempo (s)", D1: "Velocidad (m/s)" };
        for (let f = 2; f <= 7; f++) { c["A" + f] = String(f - 1); c["D" + f] = `=SI(O(B${f}="",C${f}="",C${f}=0),"",REDONDEAR(B${f}/C${f},2))`; }
        c.A9 = "Promedio"; c.B9 = '=SI(CONTAR(B2:B7)=0,"",PROMEDIO(B2:B7))'; c.C9 = '=SI(CONTAR(C2:C7)=0,"",PROMEDIO(C2:C7))'; c.D9 = '=SI(CONTAR(D2:D7)=0,"",REDONDEAR(PROMEDIO(D2:D7),2))';
        return ops([tabla(c, 20, 6, ["A1", "B1", "C1", "D1", "A9"])]);
      },
    },
    {
      id: "calificaciones", modo: "HOJA", nombre: "Calificaciones", desc: "Promedios automáticos",
      crear: () => {
        const c = { A1: "Alumno", B1: "Parcial 1", C1: "Parcial 2", D1: "Parcial 3", E1: "Promedio", F1: "Estado" };
        for (let f = 2; f <= 9; f++) {
          c["A" + f] = "Alumno " + (f - 1);
          c["E" + f] = `=SI(CONTAR(B${f}:D${f})=0,"",REDONDEAR(PROMEDIO(B${f}:D${f}),1))`;
          c["F" + f] = `=SI(E${f}="","",SI(E${f}>=6,"Aprobado","Revisar"))`;
        }
        c.A11 = "Promedio del grupo"; c.E11 = '=SI(CONTAR(E2:E9)=0,"",REDONDEAR(PROMEDIO(E2:E9),2))';
        return ops([tabla(c, 30, 8, ["A1", "B1", "C1", "D1", "E1", "F1", "A11", "E11"])]);
      },
    },
    {
      id: "presupuesto", modo: "HOJA", nombre: "Presupuesto", desc: "Cantidades y totales",
      crear: () => {
        const c = { A1: "Concepto", B1: "Cantidad", C1: "Precio", D1: "Subtotal" };
        [["Papelería", 10, 35], ["Impresiones", 120, 1.5], ["Material didáctico", 4, 250]].forEach((r, i) => {
          const f = i + 2; c["A" + f] = r[0]; c["B" + f] = String(r[1]); c["C" + f] = String(r[2]); c["D" + f] = `=B${f}*C${f}`;
        });
        c.C7 = "Total"; c.D7 = "=SUMA(D2:D6)";
        return ops([tabla(c, 30, 8, ["A1", "B1", "C1", "D1", "C7", "D7"])]);
      },
    },
    {
      id: "vacio-pres", modo: "PRESENTACION", nombre: "En blanco", desc: "Una diapositiva",
      crear: () => ops([Object.assign(texto("", "h1", 1), { x: 80, y: 200, w: 800, h: 90, z: 1, ph: "Título de la presentación" })]),
    },
    {
      id: "proyecto", modo: "PRESENTACION", nombre: "Proyecto", desc: "Portada, problema y propuesta",
      crear: () => {
        const b = [
          Object.assign(texto("Nombre del proyecto", "h1", 1), { x: 116, y: 170, w: 760, h: 80, z: 1 }),
          Object.assign(texto("Equipo · Fecha", "p", 2), { x: 116, y: 262, w: 760, h: 50, z: 1 }),
          forma("rect", "", 80, 176, 10, 128, "#5B5BD6", "p1"),
          Object.assign(texto("El problema", "h2", 1), { x: 80, y: 60, w: 800, h: 60, z: 1, pagina: "p2" }),
          Object.assign(texto("¿Qué pasa hoy?", "lista", 2), { x: 80, y: 150, w: 800, h: 50, z: 1, pagina: "p2", animacion: "aparecer" }),
          Object.assign(texto("¿A quién afecta?", "lista", 3), { x: 80, y: 210, w: 800, h: 50, z: 1, pagina: "p2", animacion: "aparecer" }),
          Object.assign(texto("Nuestra propuesta", "h2", 1), { x: 80, y: 60, w: 800, h: 60, z: 1, pagina: "p3" }),
          forma("rect", "Idea 1", 80, 180, 240, 160, C.azul, "p3", { animacion: "zoom" }),
          forma("rect", "Idea 2", 360, 180, 240, 160, C.verde, "p3", { animacion: "zoom" }),
          forma("rect", "Idea 3", 640, 180, 240, 160, C.naranja, "p3", { animacion: "zoom" }),
        ];
        return ops(b, ["p1", "p2", "p3"]);
      },
    },
    {
      id: "exposicion", modo: "PRESENTACION", nombre: "Exposición de clase", desc: "Portada, índice, temas y fuentes",
      crear: () => {
        const r = diapos([
          ["portada", ["Tema de la exposición", "Equipo · Grupo · " + hoy()]],
          ["contenido", ["Índice", ["Introducción", "Tema 1", "Tema 2", "Conclusiones"]]],
          ["contenido", ["Introducción", ["¿De qué trata?", "¿Por qué es importante?"]]],
          ["dos", ["Tema 1", ["Idea principal", "Ejemplo"], ["Dato importante", "Imagen o gráfica"]]],
          ["contenido", ["Tema 2", ["Idea principal", "Ejemplo"]]],
          ["contenido", ["Conclusiones", ["Lo que aprendimos", "Preguntas"]]],
          ["contenido", ["Fuentes", ["Autor (año). Título. Editorial o sitio."]]],
        ]);
        return conDoc(ops(r.bloques, r.paginas), { tema: "oceano" });
      },
    },
    {
      id: "feria-ciencias", modo: "PRESENTACION", nombre: "Feria de ciencias", desc: "Pregunta, hipótesis, método, resultados",
      crear: () => {
        const r = diapos([
          ["portada", ["Nombre del proyecto", "Equipo · Escuela · " + hoy()]],
          ["contenido", ["Pregunta de investigación", ["¿Qué queremos saber?"]]],
          ["contenido", ["Hipótesis", ["Creemos que…"]]],
          ["contenido", ["Materiales y método", ["Materiales", "Pasos que seguimos"]]],
          ["dos", ["Resultados", ["Lo que medimos"], ["Gráfica o tabla"]]],
          ["contenido", ["Conclusión", ["¿Se cumplió la hipótesis?", "¿Qué haríamos diferente?"]]],
        ]);
        return conDoc(ops(r.bloques, r.paginas), { tema: "pizarron" in ((NOM.diapo || {}).TEMAS || {}) ? "pizarron" : "oceano" });
      },
    },
    { id: "vacio-diag", modo: "DIAGRAMA", nombre: "En blanco", desc: "Lienzo libre", crear: () => ops([]) },
    { id: "mapa-conceptual", modo: "DIAGRAMA", nombre: "Mapa conceptual", desc: "Conceptos unidos con palabras", crear: diag("conceptual") },
    { id: "linea-tiempo", modo: "DIAGRAMA", nombre: "Línea del tiempo", desc: "Fechas y sucesos", crear: diag("tiempo") },
    { id: "mapa-mental", modo: "DIAGRAMA", nombre: "Mapa mental", desc: "Idea central y ramas", crear: diag("mental") },
    { id: "clases-uml", modo: "DIAGRAMA", nombre: "Diagrama de clases (UML)", desc: "Clases, herencia y asociación", crear: diag("clases") },
    { id: "entidad-relacion", modo: "DIAGRAMA", nombre: "Entidad-relación", desc: "Para diseñar una base de datos", crear: diag("er") },
    {
      id: "flujo", modo: "DIAGRAMA", nombre: "Diagrama de flujo", desc: "Inicio, proceso, decisión",
      crear: () => {
        const a = forma("elipse", "Inicio", 380, 40, 200, 80, C.verde);
        const b = forma("rect", "Proceso", 380, 180, 200, 90, C.azul);
        const c = forma("rombo", "¿Decisión?", 370, 330, 220, 130, C.amarillo);
        const d = forma("rect", "Otro proceso", 700, 350, 200, 90, C.azul);
        const e = forma("elipse", "Fin", 380, 530, 200, 80, C.rosa);
        return ops([a, b, c, d, e, conector(a, b), conector(b, c), conector(c, d), conector(c, e)]);
      },
    },
    {
      id: "ideas", modo: "DIAGRAMA", nombre: "Lluvia de ideas", desc: "Idea central y ramas",
      crear: () => {
        const centro = forma("elipse", "Tema central", 400, 250, 240, 120, C.violeta);
        const pos = [[120, 60], [700, 60], [60, 330], [760, 330], [400, 500]];
        const colores = [C.amarillo, C.verde, C.azul, C.naranja, C.rosa];
        const notas = pos.map((p, i) => forma("nota", "Idea " + (i + 1), p[0], p[1], 180, 120, colores[i]));
        return ops([centro, ...notas, ...notas.map((x) => conector(centro, x))]);
      },
    },
  ];

  NOM.plantillas = { LISTA, COLORES: C, delModo: (m) => LISTA.filter((p) => p.modo === m) };
})();
