// Cálculo y optimización de mallazo electrosoldado en paneles estándar (6 × 2.2 m).
// Distinto al despiece de barras: el mallazo se compra en paneles enteros y se cubre
// la superficie por área, contemplando solapes (~1 retícula a cada lado).

import { ElementoEstructural, GeometriaElemento } from "./types";
import { getTipoGeometria } from "./generadores";

/** Tipo estándar de mallazo electrosoldado (medidas y peso) */
export interface TipoMallazo {
  ref: string;          // p.ej. "ME 15x15 Ø6"
  diametro: number;     // mm
  retícula: number;     // m (separación entre alambres)
  pesoKgM2: number;     // kg/m²
  largoPanel: number;   // m (típicamente 6.0)
  anchoPanel: number;   // m (típicamente 2.2)
}

/** Catálogo de mallazos estándar habituales en España (UNE 36092) */
export const MALLAZOS: TipoMallazo[] = [
  { ref: "ME 15x15 Ø5",  diametro: 5,  retícula: 0.15, pesoKgM2: 2.10, largoPanel: 6.0, anchoPanel: 2.2 },
  { ref: "ME 15x15 Ø6",  diametro: 6,  retícula: 0.15, pesoKgM2: 3.02, largoPanel: 6.0, anchoPanel: 2.2 },
  { ref: "ME 15x15 Ø8",  diametro: 8,  retícula: 0.15, pesoKgM2: 5.36, largoPanel: 6.0, anchoPanel: 2.2 },
  { ref: "ME 15x15 Ø10", diametro: 10, retícula: 0.15, pesoKgM2: 8.36, largoPanel: 6.0, anchoPanel: 2.2 },
  { ref: "ME 20x20 Ø5",  diametro: 5,  retícula: 0.20, pesoKgM2: 1.57, largoPanel: 6.0, anchoPanel: 2.2 },
  { ref: "ME 20x20 Ø6",  diametro: 6,  retícula: 0.20, pesoKgM2: 2.27, largoPanel: 6.0, anchoPanel: 2.2 },
  { ref: "ME 20x20 Ø8",  diametro: 8,  retícula: 0.20, pesoKgM2: 4.02, largoPanel: 6.0, anchoPanel: 2.2 },
  { ref: "ME 20x20 Ø10", diametro: 10, retícula: 0.20, pesoKgM2: 6.27, largoPanel: 6.0, anchoPanel: 2.2 },
  { ref: "ME 30x30 Ø6",  diametro: 6,  retícula: 0.30, pesoKgM2: 1.51, largoPanel: 6.0, anchoPanel: 2.2 },
];

export function getMallazo(ref: string): TipoMallazo | undefined {
  return MALLAZOS.find((m) => m.ref === ref);
}

/** Configuración por elemento: cuántas capas de mallazo lleva y de qué tipo */
export interface ConfigMallazo {
  ref: string;          // referencia en MALLAZOS
  capas: number;        // 1 = una capa, 2 = doble (sup+inf)
  solape?: number;      // m de solape entre paneles (default = 1 retícula)
}

/** Resultado del cálculo de mallazo para un elemento */
export interface ResultadoMallazo {
  ref: string;
  capas: number;
  panelesPorCapa: number;
  panelesTotal: number;
  m2Cubiertos: number;     // área teórica cubierta (m² del elemento × capas)
  m2Comprados: number;     // área de panel × paneles
  m2Desperdicio: number;
  porcentajeDesperdicio: number;
  pesoKg: number;
  /** Estrategia usada: "geometrico" (strip packing con polígono) o "area" (fórmula con factor). */
  estrategia?: "geometrico" | "area";
  /** Detalle por franja cuando se usa la estrategia geométrica. */
  franjas?: { y: number; segmentos: { x0: number; x1: number; longitud: number }[]; panelesNuevos: number; retalesUsados: number }[];
  /** Retales reaprovechados (longitud en metros). */
  retalesReusados?: number;
}

/**
 * Strip-packing geométrico para polígono: lee la forma real, coloca paneles
 * 6×2.2 enteros donde caben, corta en los bordes y reaprovecha los retales en
 * franjas posteriores. Refleja cómo trabaja un encofrador con un mazo de
 * mallazos: deja un pool de retales > 0.5m y los va consumiendo.
 *
 * Algoritmo:
 *  1. Recorre el polígono en franjas horizontales de altura `anchoPanel - solape`.
 *  2. En cada franja calcula los segmentos X donde el polígono está presente
 *     (intersección horizontal con el contorno).
 *  3. Cubre cada segmento usando primero retales del banco (mayor primero) y
 *     después paneles nuevos. El retal sobrante de un panel nuevo vuelve al banco.
 *  4. Si la franja se cierra (final de segmento), se aplica solape en la unión
 *     entre paneles consecutivos dentro del mismo segmento.
 */
export function calcularPanelesPoligono(
  vertices: { x: number; y: number }[],
  largoPanel: number,
  anchoPanel: number,
  solape: number,
  huecos: { x: number; y: number; largo: number; ancho: number }[] = []
): {
  paneles: number;
  retalesReusados: number;
  longitudCubierta: number;
  franjas: { y: number; segmentos: { x0: number; x1: number; longitud: number }[]; panelesNuevos: number; retalesUsados: number }[];
} {
  if (!vertices || vertices.length < 3) {
    return { paneles: 0, retalesReusados: 0, longitudCubierta: 0, franjas: [] };
  }
  const ys = vertices.map((v) => v.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Probamos las dos orientaciones (panel largo en X o en Y) y nos quedamos
  // con la que use menos paneles.
  const r1 = packStripsOrient(vertices, huecos, minY, maxY, largoPanel, anchoPanel, solape);
  const r2 = packStripsOrient(
    vertices.map((v) => ({ x: v.y, y: v.x })),
    huecos.map((h) => ({ x: h.y, y: h.x, largo: h.ancho, ancho: h.largo })),
    Math.min(...vertices.map((v) => v.x)),
    Math.max(...vertices.map((v) => v.x)),
    largoPanel,
    anchoPanel,
    solape
  );
  return r1.paneles <= r2.paneles ? r1 : r2;
}

function packStripsOrient(
  vertices: { x: number; y: number }[],
  huecos: { x: number; y: number; largo: number; ancho: number }[],
  minY: number,
  maxY: number,
  largoPanel: number,
  anchoPanel: number,
  solape: number
): {
  paneles: number;
  retalesReusados: number;
  longitudCubierta: number;
  franjas: { y: number; segmentos: { x0: number; x1: number; longitud: number }[]; panelesNuevos: number; retalesUsados: number }[];
} {
  const stripH = Math.max(0.10, anchoPanel - solape);
  const banco: number[] = []; // retales disponibles (longitudes en m)
  let panelesTotal = 0;
  let retalesReusados = 0;
  let longitudCubierta = 0;
  const franjas: { y: number; segmentos: { x0: number; x1: number; longitud: number }[]; panelesNuevos: number; retalesUsados: number }[] = [];

  const SOBRANTE_MIN = 0.5; // < 0.5 m no se reaprovecha en mallazo

  for (let y = minY; y < maxY - 0.005; y += stripH) {
    const yMid = Math.min(y + anchoPanel / 2, maxY - 0.001);
    const segmentos = segmentosPoligonoEnY(vertices, yMid)
      .map((s) => recortarSegmentoConHuecos(s, yMid, huecos))
      .flat()
      .filter((s) => s.x1 - s.x0 > 0.10);

    let panelesNuevosFranja = 0;
    let retalesUsadosFranja = 0;

    for (const seg of segmentos) {
      let needed = seg.x1 - seg.x0;
      longitudCubierta += needed;

      // Consumir retales (mayor primero) — cada retal cubre (retal - solape)
      banco.sort((a, b) => b - a);
      while (needed > 0.05 && banco.length > 0) {
        const off = banco[0];
        if (off < SOBRANTE_MIN) break;
        if (off >= needed + solape) {
          // Retal cubre con solape, sobra resto
          const resto = off - needed - solape;
          banco.shift();
          if (resto >= SOBRANTE_MIN) banco.push(resto);
          retalesUsadosFranja++;
          retalesReusados++;
          needed = 0;
        } else if (off >= needed) {
          // Retal cubre justo (sin necesidad de solape al final del segmento)
          banco.shift();
          retalesUsadosFranja++;
          retalesReusados++;
          needed = 0;
        } else {
          // Retal aporta su longitud útil, hay que seguir
          banco.shift();
          retalesUsadosFranja++;
          retalesReusados++;
          needed -= off - solape;
        }
      }

      // Paneles nuevos
      while (needed > 0.05) {
        panelesTotal++;
        panelesNuevosFranja++;
        if (largoPanel >= needed + solape) {
          const resto = largoPanel - needed - solape;
          if (resto >= SOBRANTE_MIN) banco.push(resto);
          needed = 0;
        } else if (largoPanel >= needed) {
          const resto = largoPanel - needed;
          if (resto >= SOBRANTE_MIN) banco.push(resto);
          needed = 0;
        } else {
          needed -= largoPanel - solape;
        }
      }
    }

    if (segmentos.length > 0) {
      franjas.push({
        y: +y.toFixed(2),
        segmentos: segmentos.map((s) => ({ x0: +s.x0.toFixed(2), x1: +s.x1.toFixed(2), longitud: +(s.x1 - s.x0).toFixed(2) })),
        panelesNuevos: panelesNuevosFranja,
        retalesUsados: retalesUsadosFranja,
      });
    }
  }

  return { paneles: panelesTotal, retalesReusados, longitudCubierta: +longitudCubierta.toFixed(2), franjas };
}

/** Devuelve los segmentos X del polígono cortado por la línea horizontal y. */
function segmentosPoligonoEnY(
  vertices: { x: number; y: number }[],
  y: number
): { x0: number; x1: number }[] {
  const hits: number[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const yMin = Math.min(a.y, b.y);
    const yMax = Math.max(a.y, b.y);
    if (y < yMin || y > yMax || Math.abs(a.y - b.y) < 0.001) continue;
    const t = (y - a.y) / (b.y - a.y);
    hits.push(+(a.x + t * (b.x - a.x)).toFixed(4));
  }
  hits.sort((a, b) => a - b);
  const segs: { x0: number; x1: number }[] = [];
  for (let i = 0; i < hits.length - 1; i += 2) {
    segs.push({ x0: hits[i], x1: hits[i + 1] });
  }
  return segs;
}

/** Resta a un segmento horizontal las zonas tapadas por huecos rectangulares en y. */
function recortarSegmentoConHuecos(
  seg: { x0: number; x1: number },
  y: number,
  huecos: { x: number; y: number; largo: number; ancho: number }[]
): { x0: number; x1: number }[] {
  const cortes = huecos
    .filter((h) => y >= h.y && y <= h.y + h.ancho)
    .map((h) => ({ x0: h.x, x1: h.x + h.largo }))
    .sort((a, b) => a.x0 - b.x0);
  if (cortes.length === 0) return [seg];
  const resultado: { x0: number; x1: number }[] = [];
  let cursor = seg.x0;
  for (const c of cortes) {
    const cx0 = Math.max(c.x0, seg.x0);
    const cx1 = Math.min(c.x1, seg.x1);
    if (cx1 <= cursor) continue;
    if (cx0 > cursor) resultado.push({ x0: cursor, x1: cx0 });
    cursor = Math.max(cursor, cx1);
  }
  if (cursor < seg.x1) resultado.push({ x0: cursor, x1: seg.x1 });
  return resultado.filter((s) => s.x1 - s.x0 > 0.10);
}

/** Área neta del elemento usable como base de cálculo del mallazo */
function areaNetaElemento(g: GeometriaElemento): number {
  let area = 0;
  if (g.forma === "rectangular") {
    area = (g.lados[0]?.longitud || 0) * (g.lados[1]?.longitud || 0);
  } else if (g.forma === "l" && g.lados.length >= 6) {
    area = g.lados[0].longitud * g.lados[1].longitud + g.lados[4].longitud * g.lados[3].longitud;
  } else if (g.forma === "u" && g.lados.length >= 6) {
    area =
      g.lados[0].longitud * g.lados[1].longitud +
      g.lados[2].longitud * g.lados[3].longitud +
      g.lados[4].longitud * g.lados[5].longitud;
  } else if (g.forma === "poligono" && g.vertices && g.vertices.length >= 3) {
    if (g.areaAproximada) area = g.areaAproximada;
    else {
      let s = 0;
      for (let i = 0; i < g.vertices.length; i++) {
        const a = g.vertices[i];
        const b = g.vertices[(i + 1) % g.vertices.length];
        s += a.x * b.y - b.x * a.y;
      }
      area = Math.abs(s) / 2;
    }
  } else {
    area = (g.lados[0]?.longitud || 0) * (g.lados[1]?.longitud || 0);
  }
  // Descontar huecos
  for (const h of g.huecos || []) area -= h.largo * h.ancho;
  return Math.max(0, area);
}

/**
 * Calcula los paneles 6×2.2 necesarios para cubrir un rectángulo dimX × dimY,
 * con solape `s` (m) entre paneles. Estrategia: tiling regular, cada panel cubre
 * (largoPanel - s) × (anchoPanel - s) de superficie útil. Es una aproximación
 * pesimista (real puede ser un poco mejor con cortes), pero refleja la práctica
 * habitual donde no se reaprovechan recortes pequeños de mallazo.
 */
export function panelesParaRectangulo(
  dimX: number,
  dimY: number,
  m: TipoMallazo,
  solape: number
): number {
  if (dimX <= 0 || dimY <= 0) return 0;
  // Probamos las dos orientaciones del panel y nos quedamos con la mejor
  const op1 = orient(dimX, dimY, m.largoPanel, m.anchoPanel, solape);
  const op2 = orient(dimX, dimY, m.anchoPanel, m.largoPanel, solape);
  return Math.min(op1, op2);
}

function orient(dimX: number, dimY: number, panelX: number, panelY: number, s: number): number {
  const efX = Math.max(0.01, panelX - s);
  const efY = Math.max(0.01, panelY - s);
  const nX = Math.max(1, Math.ceil(dimX / efX));
  const nY = Math.max(1, Math.ceil(dimY / efY));
  return nX * nY;
}

/**
 * Calcula los paneles necesarios para un elemento (superficie + capas).
 *
 * Modelo basado en m² con overhead de solape (lo que usa un encofrador real
 * en mediciones de obra, asumiendo reaprovechamiento de retales):
 *
 *   paneles = ceil( area_obra · capas · (1 + factor_solape) / area_panel )
 *
 *   factor_solape ≈ solape · (1/largoPanel + 1/anchoPanel)
 *
 * El mallazo cubre toda la huella del elemento (incluido el perímetro
 * macizo en forjados reticulares — la práctica habitual es no dejar zonas
 * sin mallazo antifisuración en la capa de compresión).
 */
export function calcularMallazoElemento(el: ElementoEstructural): ResultadoMallazo | null {
  const cfg = el.mallazo;
  if (!cfg || !el.geometria) return null;
  const tipo = getTipoGeometria(el.categoria || "libre", el.subtipo);
  if (tipo !== "superficie" && tipo !== "escalera") return null;
  const m = getMallazo(cfg.ref);
  if (!m) return null;
  const cantidad = el.cantidad || 1;

  const g = el.geometria;
  const areaUtil = areaNetaElemento(g);
  if (areaUtil <= 0) {
    return {
      ref: m.ref, capas: cfg.capas, panelesPorCapa: 0, panelesTotal: 0,
      m2Cubiertos: 0, m2Comprados: 0, m2Desperdicio: 0, porcentajeDesperdicio: 0, pesoKg: 0,
    };
  }

  const areaPanel = m.largoPanel * m.anchoPanel;
  const solape = cfg.solape ?? m.retícula;

  // Estrategia 1: GEOMÉTRICA — strip-packing real sobre el contorno del polígono,
  // con reaprovechamiento de retales. Disponible cuando hay vértices definidos
  // (formas "poligono", "rectangular", "l", "u").
  const verts = vertsDeGeometria(g);
  if (verts && verts.length >= 3) {
    const huecosRect = (g.huecos || []).map((h) => ({
      x: h.x ?? 0,
      y: h.y ?? 0,
      largo: h.largo,
      ancho: h.ancho,
    }));
    const r = calcularPanelesPoligono(verts, m.largoPanel, m.anchoPanel, solape, huecosRect);
    const panelesPorCapa = Math.max(1, r.paneles);
    const panelesTotal = panelesPorCapa * cfg.capas * cantidad;
    const m2Comprados = panelesTotal * areaPanel;
    const m2Cubiertos = areaUtil * cfg.capas * cantidad;
    const m2Desperdicio = +(m2Comprados - m2Cubiertos).toFixed(2);
    return {
      ref: m.ref,
      capas: cfg.capas,
      panelesPorCapa,
      panelesTotal,
      m2Cubiertos: +m2Cubiertos.toFixed(2),
      m2Comprados: +m2Comprados.toFixed(2),
      m2Desperdicio: Math.max(0, m2Desperdicio),
      porcentajeDesperdicio: m2Comprados > 0 ? +((m2Desperdicio / m2Comprados) * 100).toFixed(1) : 0,
      pesoKg: +(m2Comprados * m.pesoKgM2).toFixed(2),
      estrategia: "geometrico",
      franjas: r.franjas,
      retalesReusados: r.retalesReusados,
    };
  }

  // Estrategia 2: ÁREA — fallback con factor de solape (cuando no hay polígono).
  const factorSolape = solape * (1 / m.largoPanel + 1 / m.anchoPanel);
  const panelesPorCapa = Math.max(1, Math.ceil(areaUtil * (1 + factorSolape) / areaPanel));
  const panelesTotal = panelesPorCapa * cfg.capas * cantidad;
  const m2Comprados = panelesTotal * areaPanel;
  const m2Cubiertos = areaUtil * cfg.capas * cantidad;
  const m2Desperdicio = +(m2Comprados - m2Cubiertos).toFixed(2);
  const porcentajeDesperdicio = m2Comprados > 0 ? +((m2Desperdicio / m2Comprados) * 100).toFixed(1) : 0;
  const pesoKg = +(m2Comprados * m.pesoKgM2).toFixed(2);
  return {
    ref: m.ref,
    capas: cfg.capas,
    panelesPorCapa,
    panelesTotal,
    m2Cubiertos: +m2Cubiertos.toFixed(2),
    m2Comprados: +m2Comprados.toFixed(2),
    m2Desperdicio: Math.max(0, m2Desperdicio),
    porcentajeDesperdicio: Math.max(0, porcentajeDesperdicio),
    pesoKg,
    estrategia: "area",
  };
}

/**
 * Extrae los vértices de la geometría como polígono cerrado, soportando
 * rectangular / L / U / poligono. Devuelve null para formas no convertibles.
 */
function vertsDeGeometria(g: GeometriaElemento): { x: number; y: number }[] | null {
  if (g.forma === "poligono" && g.vertices && g.vertices.length >= 3) {
    return g.vertices;
  }
  if (g.forma === "rectangular") {
    const a = g.lados[0]?.longitud || 0;
    const b = g.lados[1]?.longitud || 0;
    if (a <= 0 || b <= 0) return null;
    return [{ x: 0, y: 0 }, { x: a, y: 0 }, { x: a, y: b }, { x: 0, y: b }];
  }
  if (g.forma === "l" && g.lados.length >= 6) {
    // [Superior, Derecho, Entrante H, Entrante V, Inferior, Izquierdo]
    const la = g.lados[0].longitud;
    const lb = g.lados[1].longitud;
    const ld = g.lados[3].longitud;
    const le = g.lados[4].longitud;
    return [
      { x: 0, y: lb + ld },
      { x: la, y: lb + ld },
      { x: la, y: ld },
      { x: le, y: ld },
      { x: le, y: 0 },
      { x: 0, y: 0 },
    ];
  }
  if (g.forma === "u" && g.lados.length >= 6) {
    // 3 zonas en U
    const alaIzqL = g.lados[0].longitud;
    const alaIzqA = g.lados[1].longitud;
    const centroL = g.lados[2].longitud;
    const centroA = g.lados[3].longitud;
    const alaDerL = g.lados[4].longitud;
    const alaDerA = g.lados[5].longitud;
    const totalH = Math.max(alaIzqL, alaDerL);
    return [
      { x: 0, y: 0 },
      { x: alaIzqA, y: 0 },
      { x: alaIzqA, y: totalH - centroA },
      { x: centroL - alaDerA, y: totalH - centroA },
      { x: centroL - alaDerA, y: 0 },
      { x: centroL, y: 0 },
      { x: centroL, y: totalH },
      { x: 0, y: totalH },
    ];
  }
  return null;
}

/** Resumen consolidado de mallazo del proyecto: agrupa por referencia y suma paneles+kg. */
export interface ResumenMallazoProyecto {
  porRef: Map<string, { paneles: number; m2: number; pesoKg: number }>;
  panelesTotal: number;
  pesoTotalKg: number;
}

export function resumirMallazoProyecto(elementos: ElementoEstructural[]): ResumenMallazoProyecto {
  const porRef = new Map<string, { paneles: number; m2: number; pesoKg: number }>();
  let panelesTotal = 0;
  let pesoTotalKg = 0;
  for (const el of elementos) {
    const r = calcularMallazoElemento(el);
    if (!r) continue;
    const cur = porRef.get(r.ref) || { paneles: 0, m2: 0, pesoKg: 0 };
    cur.paneles += r.panelesTotal;
    cur.m2 += r.m2Comprados;
    cur.pesoKg += r.pesoKg;
    porRef.set(r.ref, cur);
    panelesTotal += r.panelesTotal;
    pesoTotalKg += r.pesoKg;
  }
  return { porRef, panelesTotal, pesoTotalKg: +pesoTotalKg.toFixed(2) };
}
