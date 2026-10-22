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
    return lista;
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

  const LISTA = [
    { id: "vacio-texto", modo: "TEXTO", nombre: "En blanco", desc: "Página vacía", crear: () => ops([texto("", "p", 1)]) },
    {
      id: "acta", modo: "TEXTO", nombre: "Acta de reunión", desc: "Asistentes y acuerdos",
      crear: () => ops([
        texto("Acta de reunión", "h1", 1),
        texto("<b>Fecha:</b> " + new Date().toLocaleDateString("es-MX", { dateStyle: "long" }) + " · <b>Lugar:</b> ", "p", 2),
        texto("Asistentes", "h2", 3), texto("", "lista", 4),
        texto("Temas tratados", "h2", 5), texto("", "lista", 6),
        texto("Acuerdos", "h2", 7), texto("", "tarea", 8),
      ]),
    },
    {
      id: "plan-clase", modo: "TEXTO", nombre: "Plan de clase", desc: "Inicio, desarrollo y cierre",
      crear: () => ops([
        texto("Plan de clase", "h1", 1),
        texto("<b>Materia:</b>  · <b>Grupo:</b>  · <b>Fecha:</b> ", "p", 2),
        texto("Propósito", "h2", 3), texto("", "p", 4),
        texto("Secuencia didáctica", "h2", 5),
        texto("<b>Inicio (10 min):</b> ", "lista", 6), texto("<b>Desarrollo (30 min):</b> ", "lista", 7), texto("<b>Cierre (10 min):</b> ", "lista", 8),
        texto("Evaluación", "h2", 9), texto("", "tarea", 10),
      ]),
    },
    { id: "vacio-hoja", modo: "HOJA", nombre: "En blanco", desc: "Hoja de 30 × 10", crear: () => ops([tabla({}, 30, 10)]) },
    {
      id: "calificaciones", modo: "HOJA", nombre: "Calificaciones", desc: "Promedios automáticos",
      crear: () => {
        const c = { A1: "Alumno", B1: "Parcial 1", C1: "Parcial 2", D1: "Parcial 3", E1: "Promedio", F1: "Estado" };
        for (let f = 2; f <= 9; f++) {
          c["A" + f] = "Alumno " + (f - 1);
          c["E" + f] = `=SI(CONTAR(B${f}:D${f})=0,"",PROMEDIO(B${f}:D${f}))`;
          c["F" + f] = `=SI(E${f}="","",SI(E${f}>=6,"Aprobado","Revisar"))`;
        }
        c.A11 = "Promedio del grupo"; c.E11 = '=SI(CONTAR(E2:E9)=0,"",PROMEDIO(E2:E9))';
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
          Object.assign(texto("Nombre del proyecto", "h1", 1), { x: 80, y: 180, w: 800, h: 80, z: 1 }),
          Object.assign(texto("Equipo · Fecha", "p", 2), { x: 80, y: 280, w: 800, h: 50, z: 1 }),
          forma("rect", "", 80, 150, 12, 120, "#5B5BD6", "p1"),
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
    { id: "vacio-diag", modo: "DIAGRAMA", nombre: "En blanco", desc: "Lienzo libre", crear: () => ops([]) },
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
