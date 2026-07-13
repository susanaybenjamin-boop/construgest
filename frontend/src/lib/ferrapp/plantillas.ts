import { CategoriaElemento, PlantillaElemento } from "./types";

/** Etiquetas predefinidas + custom mergeadas para una categoría */
export function getEtiquetasMerged(categoria: CategoriaElemento, etiquetasCustom?: Record<string, string[]>): { predefinidas: string[]; custom: string[] } {
  const predefinidas = ETIQUETAS_POR_CATEGORIA[categoria] || [];
  const custom = ((etiquetasCustom || {})[categoria] || []).filter(c => !predefinidas.includes(c));
  return { predefinidas, custom };
}

/**
 * Etiquetas predefinidas por categoria.
 * Organizadas por relevancia: las mas usadas primero.
 */
export const ETIQUETAS_POR_CATEGORIA: Record<CategoriaElemento, string[]> = {
  cimentacion: [
    "Inferior largo",
    "Inferior ancho",
    "Superior largo",
    "Superior ancho",
    "Parrilla lado largo",
    "Parrilla lado corto",
    "Arranque pilar",
    "Zapata largo",
    "Zapata ancho",
    "Muro vertical exterior",
    "Muro vertical interior",
    "Muro horizontal exterior",
    "Muro horizontal interior",
    "Horquillas muro",
    "Barras abajo",
    "Barras arriba",
    "Estribos",
    "Cercos",
  ],
  vertical: [
    "Longitudinales",
    "Estribos",
    "Cercos",
    "Cercos circulares",
    "Vertical cara 1",
    "Vertical cara 2",
    "Horizontal cara 1",
    "Horizontal cara 2",
    "Horquillas",
    "Barras de piel",
    "Vertical pared 1",
    "Vertical pared 2",
    "Vertical pared 3",
    "Horizontal paredes largas",
    "Horizontal pared corta",
  ],
  forjado: [
    "Inferior largo",
    "Inferior ancho",
    "Superior largo",
    "Superior ancho",
    "Negativos gruesos",
    "Negativos finos",
    "Negativos sobre apoyos",
    "Inferior principal",
    "Inferior reparto",
    "Superior (negativos)",
    "Superior reparto",
    "Malla reparto largo",
    "Malla reparto ancho",
    "Malla reparto",
    "Malla base",
    "Nervios abajo largo",
    "Nervios abajo ancho",
    "Nervios arriba largo (negativos)",
    "Nervios arriba ancho (negativos)",
    "Neg. ábaco perim X",
    "Neg. ábaco perim Y",
    "Neg. ábaco int X",
    "Neg. ábaco int Y",
    "Refuerzo capiteles",
    "Refuerzo punzonamiento",
  ],
  vigas: [
    "Barras abajo",
    "Barras arriba",
    "Estribos",
    "Refuerzo negativo",
    "Portaestribos",
    "Barras de piel",
    "Cercos",
  ],
  escaleras: [
    "Inferior a lo largo",
    "Inferior a lo ancho",
    "Superior a lo largo",
    "Superior a lo ancho",
    "Peldanos",
    "Refuerzo meseta",
  ],
  especiales: [
    "Barras principales",
    "Cercos",
    "Pared vertical exterior",
    "Pared vertical interior",
    "Pared horizontal exterior",
    "Pared horizontal interior",
    "Fondo largo",
    "Fondo ancho",
    "Inferior largo",
    "Inferior ancho",
    "Superior largo",
    "Superior ancho",
    "Horquillas",
  ],
  libre: [
    "Inferior largo",
    "Inferior ancho",
    "Superior largo",
    "Superior ancho",
    "Barras abajo",
    "Barras arriba",
    "Estribos",
    "Cercos",
    "Horquillas",
    "Longitudinales",
    "Negativos",
    "Malla reparto",
    "Refuerzo",
  ],
};

/**
 * Catalogo de plantillas de elementos estructurales.
 * Etiquetas simples y descriptivas - el usuario ajusta longitudes y cantidades.
 */
export const PLANTILLAS: PlantillaElemento[] = [
  // ===================== CIMENTACION =====================
  {
    subtipo: "zapata_aislada",
    nombre: "Zapata aislada",
    categoria: "cimentacion",
    descripcion: "Zapata individual bajo pilar",
    icono: "C",
    barrasDefault: [
      { longitud: 1.20, diametro: 12, cantidad: 8, etiqueta: "Parrilla lado largo" },
      { longitud: 1.20, diametro: 12, cantidad: 8, etiqueta: "Parrilla lado corto" },
      { longitud: 0.90, diametro: 12, cantidad: 4, etiqueta: "Arranque pilar" },
    ],
  },
  {
    subtipo: "zapata_combinada",
    nombre: "Zapata combinada",
    categoria: "cimentacion",
    descripcion: "Zapata bajo 2 o mas pilares",
    icono: "C",
    barrasDefault: [
      { longitud: 3.00, diametro: 16, cantidad: 10, etiqueta: "Inferior largo" },
      { longitud: 1.50, diametro: 12, cantidad: 20, etiqueta: "Inferior ancho" },
      { longitud: 3.00, diametro: 12, cantidad: 6, etiqueta: "Superior largo" },
      { longitud: 1.50, diametro: 12, cantidad: 12, etiqueta: "Superior ancho" },
    ],
  },
  {
    subtipo: "zapata_corrida",
    nombre: "Zapata corrida",
    categoria: "cimentacion",
    descripcion: "Cimentacion continua bajo muro",
    icono: "C",
    barrasDefault: [
      { longitud: 5.00, diametro: 12, cantidad: 4, etiqueta: "Inferior a lo largo" },
      { longitud: 1.00, diametro: 10, cantidad: 20, etiqueta: "Inferior a lo ancho" },
      { longitud: 5.00, diametro: 10, cantidad: 2, etiqueta: "Superior a lo largo" },
    ],
  },
  {
    subtipo: "losa_cimentacion",
    nombre: "Losa de cimentacion",
    categoria: "cimentacion",
    descripcion: "Losa maciza completa",
    icono: "C",
    barrasDefault: [
      { longitud: 10.00, diametro: 12, cantidad: 40, etiqueta: "Inferior largo" },
      { longitud: 8.00, diametro: 12, cantidad: 50, etiqueta: "Inferior ancho" },
      { longitud: 10.00, diametro: 12, cantidad: 40, etiqueta: "Superior largo" },
      { longitud: 8.00, diametro: 12, cantidad: 50, etiqueta: "Superior ancho" },
    ],
  },
  {
    subtipo: "viga_riostra",
    nombre: "Viga riostra / atado",
    categoria: "cimentacion",
    descripcion: "Viga de atado entre zapatas",
    icono: "C",
    barrasDefault: [
      { longitud: 5.00, diametro: 16, cantidad: 2, etiqueta: "Barras abajo" },
      { longitud: 5.00, diametro: 16, cantidad: 2, etiqueta: "Barras arriba" },
      { longitud: 0.76, diametro: 8, cantidad: 25, etiqueta: "Estribos" },
    ],
  },
  {
    subtipo: "encepado",
    nombre: "Encepado",
    categoria: "cimentacion",
    descripcion: "Encepado sobre pilotes",
    icono: "C",
    barrasDefault: [
      { longitud: 2.00, diametro: 16, cantidad: 8, etiqueta: "Parrilla lado largo" },
      { longitud: 2.00, diametro: 16, cantidad: 8, etiqueta: "Parrilla lado corto" },
      { longitud: 0.80, diametro: 8, cantidad: 12, etiqueta: "Cercos" },
    ],
  },
  {
    subtipo: "muro_contencion",
    nombre: "Muro de contencion",
    categoria: "cimentacion",
    descripcion: "Muro con su zapata",
    icono: "C",
    barrasDefault: [
      { longitud: 3.50, diametro: 12, cantidad: 40, etiqueta: "Muro vertical exterior" },
      { longitud: 3.50, diametro: 12, cantidad: 40, etiqueta: "Muro vertical interior" },
      { longitud: 5.00, diametro: 10, cantidad: 24, etiqueta: "Muro horizontal exterior" },
      { longitud: 5.00, diametro: 10, cantidad: 24, etiqueta: "Muro horizontal interior" },
      { longitud: 0.40, diametro: 8, cantidad: 200, etiqueta: "Horquillas muro" },
      { longitud: 2.00, diametro: 12, cantidad: 40, etiqueta: "Zapata ancho" },
      { longitud: 5.00, diametro: 12, cantidad: 4, etiqueta: "Zapata largo" },
    ],
  },

  // ===================== VERTICAL =====================
  {
    subtipo: "pilar_rectangular",
    nombre: "Pilar rectangular",
    categoria: "vertical",
    descripcion: "Pilar cuadrado o rectangular",
    icono: "V",
    barrasDefault: [
      { longitud: 3.00, diametro: 16, cantidad: 4, etiqueta: "Barras longitudinales" },
      { longitud: 0.96, diametro: 8, cantidad: 15, etiqueta: "Estribos" },
    ],
  },
  {
    subtipo: "pilar_circular",
    nombre: "Pilar circular",
    categoria: "vertical",
    descripcion: "Pilar redondo",
    icono: "V",
    barrasDefault: [
      { longitud: 3.00, diametro: 16, cantidad: 6, etiqueta: "Barras longitudinales" },
      { longitud: 1.10, diametro: 8, cantidad: 15, etiqueta: "Cercos circulares" },
    ],
  },
  {
    subtipo: "muro_carga",
    nombre: "Muro de carga",
    categoria: "vertical",
    descripcion: "Muro portante de hormigon",
    icono: "V",
    barrasDefault: [
      { longitud: 3.00, diametro: 10, cantidad: 30, etiqueta: "Vertical cara 1" },
      { longitud: 3.00, diametro: 10, cantidad: 30, etiqueta: "Vertical cara 2" },
      { longitud: 5.00, diametro: 8, cantidad: 20, etiqueta: "Horizontal cara 1" },
      { longitud: 5.00, diametro: 8, cantidad: 20, etiqueta: "Horizontal cara 2" },
      { longitud: 0.30, diametro: 6, cantidad: 150, etiqueta: "Horquillas" },
    ],
  },
  {
    subtipo: "pantalla",
    nombre: "Pantalla",
    categoria: "vertical",
    descripcion: "Muro pantalla excavacion",
    icono: "V",
    barrasDefault: [
      { longitud: 6.00, diametro: 12, cantidad: 40, etiqueta: "Vertical exterior" },
      { longitud: 6.00, diametro: 12, cantidad: 40, etiqueta: "Vertical interior" },
      { longitud: 5.00, diametro: 10, cantidad: 30, etiqueta: "Horizontal exterior" },
      { longitud: 5.00, diametro: 10, cantidad: 30, etiqueta: "Horizontal interior" },
      { longitud: 0.40, diametro: 8, cantidad: 300, etiqueta: "Horquillas" },
    ],
  },
  {
    subtipo: "nucleo_rigidez",
    nombre: "Nucleo de rigidez",
    categoria: "vertical",
    descripcion: "Nucleo ascensor o escalera",
    icono: "V",
    barrasDefault: [
      { longitud: 3.00, diametro: 12, cantidad: 40, etiqueta: "Vertical pared 1" },
      { longitud: 3.00, diametro: 12, cantidad: 40, etiqueta: "Vertical pared 2" },
      { longitud: 3.00, diametro: 12, cantidad: 20, etiqueta: "Vertical pared 3" },
      { longitud: 2.50, diametro: 10, cantidad: 30, etiqueta: "Horizontal paredes largas" },
      { longitud: 1.50, diametro: 10, cantidad: 30, etiqueta: "Horizontal pared corta" },
      { longitud: 0.40, diametro: 8, cantidad: 200, etiqueta: "Horquillas" },
    ],
  },

  // ===================== FORJADOS =====================
  {
    subtipo: "forjado_unidireccional",
    nombre: "Forjado unidireccional",
    categoria: "forjado",
    descripcion: "Viguetas + bovedillas",
    icono: "F",
    barrasDefault: [
      { longitud: 2.50, diametro: 12, cantidad: 30, etiqueta: "Negativos gruesos" },
      { longitud: 1.50, diametro: 10, cantidad: 30, etiqueta: "Negativos finos" },
      { longitud: 5.00, diametro: 6, cantidad: 40, etiqueta: "Malla reparto largo" },
      { longitud: 5.00, diametro: 6, cantidad: 40, etiqueta: "Malla reparto ancho" },
    ],
  },
  {
    subtipo: "losa_unidireccional",
    nombre: "Losa maciza unidireccional",
    categoria: "forjado",
    descripcion: "Losa armada en una direccion",
    icono: "F",
    barrasDefault: [
      { longitud: 5.00, diametro: 12, cantidad: 30, etiqueta: "Inferior principal" },
      { longitud: 5.00, diametro: 10, cantidad: 15, etiqueta: "Inferior reparto" },
      { longitud: 2.50, diametro: 10, cantidad: 30, etiqueta: "Superior (negativos)" },
      { longitud: 5.00, diametro: 8, cantidad: 15, etiqueta: "Superior reparto" },
    ],
  },
  {
    subtipo: "losa_bidireccional",
    nombre: "Losa maciza bidireccional",
    categoria: "forjado",
    descripcion: "Losa armada en dos direcciones",
    icono: "F",
    barrasDefault: [
      { longitud: 5.00, diametro: 12, cantidad: 30, etiqueta: "Inferior largo" },
      { longitud: 5.00, diametro: 12, cantidad: 30, etiqueta: "Inferior ancho" },
      { longitud: 5.00, diametro: 10, cantidad: 30, etiqueta: "Superior largo" },
      { longitud: 5.00, diametro: 10, cantidad: 30, etiqueta: "Superior ancho" },
    ],
  },
  {
    subtipo: "forjado_reticular",
    nombre: "Forjado reticular",
    categoria: "forjado",
    descripcion: "Losa con casetones (nervios cruzados)",
    icono: "F",
    barrasDefault: [
      { longitud: 5.00, diametro: 12, cantidad: 40, etiqueta: "Nervios abajo largo" },
      { longitud: 5.00, diametro: 12, cantidad: 40, etiqueta: "Nervios abajo ancho" },
      { longitud: 5.00, diametro: 6, cantidad: 30, etiqueta: "Malla base" },
      { longitud: 2.20, diametro: 16, cantidad: 8, etiqueta: "Neg. ábaco perim X" },
      { longitud: 2.20, diametro: 16, cantidad: 8, etiqueta: "Neg. ábaco perim Y" },
    ],
  },
  {
    subtipo: "forjado_chapa",
    nombre: "Forjado chapa colaborante",
    categoria: "forjado",
    descripcion: "Losa sobre chapa de acero",
    icono: "F",
    barrasDefault: [
      { longitud: 2.50, diametro: 12, cantidad: 30, etiqueta: "Negativos sobre apoyos" },
      { longitud: 5.00, diametro: 8, cantidad: 30, etiqueta: "Malla reparto largo" },
      { longitud: 5.00, diametro: 8, cantidad: 20, etiqueta: "Malla reparto ancho" },
    ],
  },
  {
    subtipo: "forjado_sanitario",
    nombre: "Forjado sanitario",
    categoria: "forjado",
    descripcion: "Forjado ventilado sobre muretes",
    icono: "F",
    barrasDefault: [
      { longitud: 5.00, diametro: 10, cantidad: 30, etiqueta: "Inferior principal" },
      { longitud: 2.00, diametro: 10, cantidad: 30, etiqueta: "Negativos" },
      { longitud: 5.00, diametro: 6, cantidad: 30, etiqueta: "Malla reparto" },
    ],
  },

  // ===================== VIGAS / ZUNCHOS =====================
  {
    subtipo: "viga_plana",
    nombre: "Viga plana",
    categoria: "vigas",
    descripcion: "Viga dentro del canto del forjado",
    icono: "Z",
    barrasDefault: [
      { longitud: 5.00, diametro: 16, cantidad: 3, etiqueta: "Barras abajo" },
      { longitud: 5.00, diametro: 12, cantidad: 2, etiqueta: "Barras arriba" },
      { longitud: 2.50, diametro: 16, cantidad: 2, etiqueta: "Refuerzo negativo" },
      { longitud: 0.76, diametro: 8, cantidad: 25, etiqueta: "Estribos" },
      { longitud: 5.00, diametro: 8, cantidad: 2, etiqueta: "Portaestribos" },
    ],
  },
  {
    subtipo: "viga_canto",
    nombre: "Viga de canto",
    categoria: "vigas",
    descripcion: "Viga descolgada del forjado",
    icono: "Z",
    barrasDefault: [
      { longitud: 5.00, diametro: 20, cantidad: 3, etiqueta: "Barras abajo" },
      { longitud: 5.00, diametro: 16, cantidad: 2, etiqueta: "Barras arriba" },
      { longitud: 2.50, diametro: 20, cantidad: 2, etiqueta: "Refuerzo negativo" },
      { longitud: 1.10, diametro: 8, cantidad: 25, etiqueta: "Estribos" },
      { longitud: 5.00, diametro: 10, cantidad: 2, etiqueta: "Barras de piel" },
    ],
  },
  {
    subtipo: "zuncho_perimetral",
    nombre: "Zuncho perimetral",
    categoria: "vigas",
    descripcion: "Zuncho de borde del forjado",
    icono: "Z",
    barrasDefault: [
      { longitud: 5.00, diametro: 16, cantidad: 2, etiqueta: "Barras abajo" },
      { longitud: 5.00, diametro: 16, cantidad: 2, etiqueta: "Barras arriba" },
      { longitud: 0.76, diametro: 8, cantidad: 25, etiqueta: "Estribos" },
    ],
  },
  {
    subtipo: "brochal",
    nombre: "Brochal",
    categoria: "vigas",
    descripcion: "Viga borde de hueco (escalera, ascensor)",
    icono: "Z",
    barrasDefault: [
      { longitud: 3.00, diametro: 16, cantidad: 3, etiqueta: "Barras abajo" },
      { longitud: 3.00, diametro: 12, cantidad: 2, etiqueta: "Barras arriba" },
      { longitud: 0.76, diametro: 8, cantidad: 15, etiqueta: "Estribos" },
    ],
  },

  // ===================== ESCALERAS =====================
  {
    subtipo: "escalera_tramo",
    nombre: "Escalera tramo recto",
    categoria: "escaleras",
    descripcion: "Tramo recto con meseta",
    icono: "E",
    barrasDefault: [
      { longitud: 4.50, diametro: 12, cantidad: 8, etiqueta: "Inferior a lo largo" },
      { longitud: 1.20, diametro: 10, cantidad: 20, etiqueta: "Inferior a lo ancho" },
      { longitud: 4.50, diametro: 10, cantidad: 5, etiqueta: "Superior a lo largo" },
      { longitud: 1.20, diametro: 8, cantidad: 20, etiqueta: "Superior a lo ancho" },
    ],
  },
  {
    subtipo: "rampa",
    nombre: "Rampa",
    categoria: "escaleras",
    descripcion: "Rampa vehicular o peatonal",
    icono: "E",
    barrasDefault: [
      { longitud: 6.00, diametro: 12, cantidad: 15, etiqueta: "Inferior a lo largo" },
      { longitud: 3.00, diametro: 10, cantidad: 20, etiqueta: "Inferior a lo ancho" },
      { longitud: 6.00, diametro: 10, cantidad: 10, etiqueta: "Superior a lo largo" },
      { longitud: 3.00, diametro: 8, cantidad: 20, etiqueta: "Superior a lo ancho" },
    ],
  },

  // ===================== ESPECIALES =====================
  {
    subtipo: "mensula",
    nombre: "Mensula",
    categoria: "especiales",
    descripcion: "Voladizo corto en pilar o muro",
    icono: "S",
    barrasDefault: [
      { longitud: 1.20, diametro: 16, cantidad: 4, etiqueta: "Barras principales" },
      { longitud: 0.60, diametro: 8, cantidad: 8, etiqueta: "Cercos" },
    ],
  },
  {
    subtipo: "deposito",
    nombre: "Deposito / Piscina",
    categoria: "especiales",
    descripcion: "Estructura para liquidos",
    icono: "S",
    barrasDefault: [
      { longitud: 3.00, diametro: 12, cantidad: 40, etiqueta: "Pared vertical exterior" },
      { longitud: 3.00, diametro: 12, cantidad: 40, etiqueta: "Pared vertical interior" },
      { longitud: 5.00, diametro: 10, cantidad: 20, etiqueta: "Pared horizontal exterior" },
      { longitud: 5.00, diametro: 10, cantidad: 20, etiqueta: "Pared horizontal interior" },
      { longitud: 5.00, diametro: 12, cantidad: 15, etiqueta: "Fondo largo" },
      { longitud: 3.00, diametro: 12, cantidad: 25, etiqueta: "Fondo ancho" },
    ],
  },
  {
    subtipo: "losa_transicion",
    nombre: "Losa de transicion",
    categoria: "especiales",
    descripcion: "Losa de cambio de carga o apoyo",
    icono: "S",
    barrasDefault: [
      { longitud: 5.00, diametro: 16, cantidad: 20, etiqueta: "Inferior largo" },
      { longitud: 5.00, diametro: 16, cantidad: 20, etiqueta: "Inferior ancho" },
      { longitud: 5.00, diametro: 12, cantidad: 20, etiqueta: "Superior largo" },
      { longitud: 5.00, diametro: 12, cantidad: 20, etiqueta: "Superior ancho" },
    ],
  },
];

/** Buscar plantilla por subtipo */
export function getPlantilla(subtipo: string): PlantillaElemento | undefined {
  return PLANTILLAS.find((p) => p.subtipo === subtipo);
}

/** Obtener plantillas por categoria */
export function getPlantillasPorCategoria(cat: string): PlantillaElemento[] {
  return PLANTILLAS.filter((p) => p.categoria === cat);
}
