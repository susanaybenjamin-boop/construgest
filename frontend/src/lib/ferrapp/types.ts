// Tipos fundamentales de FERRAPP

/** Posicion de la barra en el elemento — define que solape aplica */
export type PosicionSolape = "vInf" | "vSup" | "hInf" | "hSup";

/** Una pieza que necesitamos cortar */
export interface BarraNecesaria {
  id: string;
  longitud: number; // en metros
  diametro: number; // en mm (8, 10, 12, 16, 20, 25, 32)
  cantidad: number;
  etiqueta: string; // ej: "Losa inferior - Dir X", "Negativo viga V1"
  patas?: number; // 0, 1 o 2 patas (ganchos de anclaje)
  longitudPata?: number; // longitud de cada pata en metros (default 0.15)
  posicionSolape?: PosicionSolape; // si no se define, se infiere por etiqueta
}

/** Una barra comercial con los cortes asignados */
export interface BarraComercial {
  id: number;
  longitudTotal: number; // 12m por defecto
  cortes: CorteAsignado[];
  sobrante: number; // metros de desperdicio
}

/** Un corte específico dentro de una barra comercial */
export interface CorteAsignado {
  barraId: string;
  longitud: number;
  etiqueta: string;
  diametro: number;
}

/** Resultado del optimizador para un diámetro */
export interface ResultadoOptimizacion {
  diametro: number;
  barrasComerciales: BarraComercial[];
  totalBarrasComerciales: number;
  totalPiezas: number;
  metrosUtilizados: number;
  metrosDesperdicio: number;
  porcentajeDesperdicio: number;
  pesoKg: number;
}

/** Resultado global del despiece */
export interface ResultadoDespiece {
  resultadosPorDiametro: ResultadoOptimizacion[];
  pesoTotal: number;
  desperdicioTotal: number;
  costoEstimado?: number;
}

/** Configuración constructiva */
export interface ConfigConstruccion {
  longitudBarraComercial: number; // longitud principal (para compat)
  longitudesDisponibles: number[]; // longitudes de barra disponibles [6, 12]
  recubrimiento: number; // en metros, por defecto 0.05 (5cm)
  solape: Record<number, number>; // diámetro -> longitud solape en metros (fallback global)
  // Override por posicion (vInf/vSup/hInf/hSup): cada uno es un Record<diam, metros> opcional.
  // Si una entrada existe, prevalece sobre `solape` para esa cubeta+diametro.
  solapesPorPosicion?: Partial<Record<PosicionSolape, Record<number, number>>>;
  precioKg?: number; // precio por kg de acero
}

/** Peso por metro lineal según diámetro (kg/m) - datos UNE-EN 10080 / AENOR (acero corrugado B500S) */
export const PESO_POR_METRO: Record<number, number> = {
  6: 0.222,
  8: 0.395,
  10: 0.617,
  12: 0.888,
  14: 1.208,
  16: 1.578,
  20: 2.466,
  25: 3.853,
  32: 6.313,
};

/** Peso de barra comercial completa para una longitud dada (kg) */
export function pesoBarra(diametro: number, longitudBarra: number): number {
  return +((PESO_POR_METRO[diametro] || 0) * longitudBarra).toFixed(2);
}

/** Solapes estándar por diámetro (en metros) - EHE-08 */
export const SOLAPES_ESTANDAR: Record<number, number> = {
  6: 0.30,
  8: 0.35,
  10: 0.40,
  12: 0.50,
  14: 0.55,
  16: 0.60,
  20: 0.80,
  25: 1.00,
  32: 1.30,
};

export const DIAMETROS_DISPONIBLES = [6, 8, 10, 12, 14, 16, 20, 25, 32];

export const CONFIG_DEFAULT: ConfigConstruccion = {
  longitudBarraComercial: 12,
  longitudesDisponibles: [12],
  recubrimiento: 0.05,
  solape: SOLAPES_ESTANDAR,
};

// ===== SISTEMA DE PROYECTO =====

/** Un sobrante reutilizable de un elemento anterior */
export interface Sobrante {
  id: string;
  longitud: number; // metros
  diametro: number; // mm
  origen: string; // "Losa PB - Barra #45"
  usado: boolean;
}

// ===== SISTEMA DE CATEGORIAS =====

export type CategoriaElemento =
  | "cimentacion"
  | "vertical"
  | "forjado"
  | "vigas"
  | "escaleras"
  | "especiales"
  | "libre";

export interface PlantillaElemento {
  subtipo: string;
  nombre: string;
  categoria: CategoriaElemento;
  descripcion: string;
  icono: string;
  barrasDefault: Omit<BarraNecesaria, "id">[];
}

export const CATEGORIAS_INFO: Record<CategoriaElemento, { nombre: string; icono: string }> = {
  cimentacion: { nombre: "Cimentacion", icono: "C" },
  vertical: { nombre: "Vertical", icono: "V" },
  forjado: { nombre: "Forjados", icono: "F" },
  vigas: { nombre: "Vigas/Zunchos", icono: "Z" },
  escaleras: { nombre: "Escaleras", icono: "E" },
  especiales: { nombre: "Especiales", icono: "S" },
  libre: { nombre: "Libre", icono: "L" },
};

// ===== GEOMETRIA PARAMETRICA =====

export type FormaElemento = "rectangular" | "recto" | "l" | "u" | "cerrado" | "circular" | "poligono";

export interface LadoGeometria {
  nombre: string;    // "Izquierdo", "Fondo", "Derecho"
  longitud: number;  // metros
  etiqueta?: string; // label custom ("m1","m2"...) — si vacío usa letra auto (a,b,c)
}

/** Hueco rectangular en una superficie (escalera, ascensor, patio, etc.) */
export interface Hueco {
  nombre: string;   // "Escalera", "Ascensor", "Patio"
  largo: number;    // metros
  ancho: number;    // metros
  x?: number;       // posicion X en metros desde borde izquierdo
  y?: number;       // posicion Y en metros desde borde inferior
}

/** Pilar en forjado reticular */
export interface PilarReticular {
  nombre: string;   // "P1", "P2", etc.
  x: number;        // posición X en metros (dentro del polígono)
  y: number;        // posición Y en metros
}

/** Ábaco interior (zona maciza alrededor de pilar interior en forjado reticular) */
export interface AbacoInterior {
  pilar: string;    // nombre del pilar asociado
  ancho: number;    // dimensión X en metros
  largo: number;    // dimensión Y en metros
}

/** Configuracion de armadura por cara de muro */
export interface ConfigCaraMuro {
  diametroVertical: number;   // Ø vertical (mm)
  diametroHorizontal: number; // Ø horizontal (mm)
  espaciado: number;          // separacion entre barras (m), default 0.20
}

/** Configuracion de esperas (arranques) para los muros que apoyan en la cimentacion. */
export interface ConfigEsperaLado {
  ladoIdx: number;       // indice del lado de la losa/zapata
  activo: boolean;       // si este lado lleva muro encima
  diametro: number;      // Ø de la espera (mm)
  espaciado: number;     // separacion entre esperas (m)
  pliegue: number;       // longitud de la pata anclada dentro de la cimentacion (m)
  sobresale: number;     // longitud que sobresale por encima de la losa (m)
  dosCaras: boolean;     // muro de doble armadura → 2 esperas por punto
}

export interface GeometriaElemento {
  forma: FormaElemento;
  lados: LadoGeometria[];     // lados del elemento
  alto?: number;              // altura (muros, pilares)
  espesorMuro?: number;       // espesor de muro (m), usado para volumen de hormigón
  espaciado?: number;         // separacion entre barras (default 0.20)
  seccionAncho?: number;      // ancho seccion (vigas, pilares)
  seccionAlto?: number;       // alto seccion (vigas, pilares)
  anchoZuncho?: number;       // ancho zuncho perimetral (metros), reticular
  huecos?: Hueco[];           // huecos rectangulares (escalera, ascensor, etc.)
  // Muros: armadura por cara
  caraExterior?: ConfigCaraMuro;
  caraInterior?: ConfigCaraMuro;
  diametroHorquillas?: number;  // Ø horquillas (default 8)
  incluirEsperas?: boolean;     // (legacy) recuento simple de esperas en el muro
  // Esperas configuradas en la losa/zapata para los muros que apoyan encima
  esperasPorLado?: ConfigEsperaLado[];
  cantoLosa?: number;           // canto de la losa/zapata (m), define la longitud vertical de la espera
  // Zunchos (perimetrales o interiores) integrados en el elemento (losa/forjado)
  zunchos?: ZunchoEnElemento[];
  // Estribos por tramos (vigas, zunchos)
  tramosEstribos?: TramoEstribo[];
  // Forjado reticular
  pilares?: PilarReticular[];       // posiciones de pilares
  anchoAbacoPerimetral?: number;    // ancho banda ábaco perimetral continuo (m), default 1.20
  abacosInteriores?: AbacoInterior[]; // ábacos interiores (alrededor de pilares interiores)
  espaciadoAbaco?: number;          // separación barras neg en ábaco (m), default 0.15
  vueloAbaco?: number;              // extensión neg más allá del ábaco (m), default 0.50
  casetonAncho?: number;            // ancho pieza casetón (m), default 0.80
  casetonLargo?: number;            // largo pieza casetón (m), default 0.80
  nervioAncho?: number;             // ancho nervio entre casetones (m), default 0.12
  // Polígono libre: rectángulo envolvente para cálculo de armadura
  dimensionX?: number;          // largo máximo del polígono (m)
  dimensionY?: number;          // ancho máximo del polígono (m)
  areaAproximada?: number;      // área real aproximada en m² (informativo)
  vertices?: { x: number; y: number }[];  // coordenadas de vértices en metros (polígono libre)
  imagenFondo?: string;           // base64 data URL de imagen de plano (polígono libre)
}

/** Tramo de estribos con espaciado diferente */
export interface TramoEstribo {
  nombre: string;      // "Extremo izq", "Centro", "Extremo der"
  longitud: number;    // longitud del tramo en metros
  espaciado: number;   // separación entre estribos en metros
}

/** Configuracion del estribo dentro de un zuncho */
export interface EstriboZuncho {
  diametro: number;        // mm
  espaciado: number;       // m (uniforme; si hay tramosEstribos prevalecen)
  cerrado: boolean;        // true = cerrado con ganchos
  longitudGancho?: number; // m, default 0.10 si cerrado
}

/** Barra adicional dentro de un zuncho (refuerzo negativo, portaestribos, etc.) */
export interface BarraExtraZuncho {
  id: string;
  nombre: string;          // p.ej. "Refuerzo negativo C", "Portaestribos"
  diametro: number;
  cantidad: number;
  longitud?: number;       // metros explícitos
  longitudPct?: number;    // 0..1: fracción de la longitud del zuncho (si no hay longitud)
  posicion: "arriba" | "abajo" | "centro"; // determina si solapa como hSup/hInf
  patas?: number;
  longitudPata?: number;
}

/** Un tramo del zuncho entre dos puntos (tipicamente entre pilares). */
export interface ZunchoTramo {
  id: string;
  nombre: string;          // "P1→P2", "P2→P3", "Tramo 1"...
  longitud: number;        // distancia entre apoyos (centro de pilar a centro de pilar), m
  // Override de seccion: si presentes, este tramo cambia de seccion (raro, pero se da)
  ancho?: number;          // m
  canto?: number;          // m
  // Si false, el tramo NO solapa con el siguiente (extremo libre, ultimo tramo abierto).
  // Default true: la barra del tramo se extiende para solapar con la del tramo siguiente.
  solapaSiguiente?: boolean;
}

/** Un zuncho completo dentro de una losa o forjado. */
export interface ZunchoEnElemento {
  id: string;
  nombre: string;
  ubicacion: "perimetral" | "interior";  // informativo, decide cierre del ultimo tramo
  tramos: ZunchoTramo[];                 // segmentos entre pilares (≥1)
  ancho: number;           // m — seccion por defecto (cada tramo puede sobreescribir)
  canto: number;           // m — seccion por defecto
  recubrimiento?: number;  // m — override del recubrimiento del proyecto
  longArriba: { diametro: number; cantidad: number };
  longAbajo: { diametro: number; cantidad: number };
  estribo: EstriboZuncho;
  // Solape para empalmar las longitudinales en el cruce del pilar.
  // Si se omite, se usa SOLAPES_ESTANDAR[diametro] de cada longitudinal.
  solapeEntreTramos?: number;
  tramosEstribos?: TramoEstribo[];      // opcional: distintos espaciados por zonas (aplica a cada tramo)
  barrasExtra?: BarraExtraZuncho[];     // refuerzos centrales, portaestribos, etc. (por tramo)
}

/** Que tipo de geometria usa cada categoria */
export type TipoGeometria = "superficie" | "muro" | "lineal" | "pilar" | "escalera";

export const CATEGORIA_A_GEOMETRIA: Record<CategoriaElemento, TipoGeometria> = {
  cimentacion: "superficie",  // zapatas y losas son superficies; muros se sobreescriben por subtipo
  vertical: "muro",           // muros y pantallas; pilares se sobreescriben por subtipo
  forjado: "superficie",
  vigas: "lineal",
  escaleras: "escalera",
  especiales: "superficie",
  libre: "superficie",
};

/** Subtipos que usan geometria diferente a su categoria */
export const SUBTIPO_GEOMETRIA_OVERRIDE: Record<string, TipoGeometria> = {
  pilar_rectangular: "pilar",
  pilar_circular: "pilar",
  muro_contencion: "muro",
  viga_riostra: "lineal",
  zapata_corrida: "lineal",
};

/** Un elemento estructural dentro del proyecto */
export interface ElementoEstructural {
  id: string;
  nombre: string;
  categoria?: CategoriaElemento;
  subtipo?: string;
  geometria?: GeometriaElemento;
  barrasNecesarias: BarraNecesaria[];
  resultado?: ResultadoDespiece;
  sobrantesGenerados: Sobrante[];
  sobrantesConsumidos: string[];
  calculado: boolean;
  cantidad?: number; // multiplicador: cuantas unidades iguales (default 1)
  planta?: string;   // agrupación por planta/zona
  recubrimiento?: number; // recubrimiento específico del elemento (metros), si no usa el global
  // Mallazo electrosoldado (opcional). Si se define, se calculan paneles 6×2.2
  // y kg de mallazo por separado del despiece de barras.
  mallazo?: { ref: string; capas: number; solape?: number };
}

/** Proyecto completo de obra */
export interface Proyecto {
  id: string;
  nombre: string;
  config: ConfigConstruccion;
  elementos: ElementoEstructural[];
  fechaCreacion: string;
  fechaModificacion: string;
}

/** Resultado extendido con info de sobrantes reutilizados */
export interface ResultadoDespieceExtendido extends ResultadoDespiece {
  sobrantesUsados: Sobrante[]; // sobrantes de elementos previos que se usaron
  sobrantesNuevos: Sobrante[]; // nuevos sobrantes generados por este elemento
  barrasComercialAhorradas: number; // cuántas barras nuevas se evitaron gracias a sobrantes
}
