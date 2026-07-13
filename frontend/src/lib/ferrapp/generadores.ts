import {
  BarraNecesaria,
  CategoriaElemento,
  FormaElemento,
  GeometriaElemento,
  TipoGeometria,
  CATEGORIA_A_GEOMETRIA,
  SUBTIPO_GEOMETRIA_OVERRIDE,
  LadoGeometria,
  ZunchoEnElemento,
  SOLAPES_ESTANDAR,
} from "./types";
import { getPlantilla } from "./plantillas";

type BarraBase = Omit<BarraNecesaria, "id">;

/** Devuelve la etiqueta custom del lado o la letra automática (a,b,c...) */
export function resolverEtiquetaLado(lado: LadoGeometria, idx: number): string {
  return lado.etiqueta || String.fromCharCode(97 + idx);
}

/** Info de qué lados y esquinas corresponden a cada zona rectangular de una superficie */
interface InfoLadoZona {
  ladoLargoIdx: number;
  ladoAnchoIdx: number;
  esquinaLargoDesde: number; // 1-based
  esquinaLargoHasta: number;
  esquinaAnchoDesde: number;
  esquinaAnchoHasta: number;
}

function getInfoZonaSuperficie(forma: FormaElemento, zonaIdx: number): InfoLadoZona {
  if (forma === "l") {
    if (zonaIdx === 0) return { ladoLargoIdx: 0, ladoAnchoIdx: 1, esquinaLargoDesde: 1, esquinaLargoHasta: 2, esquinaAnchoDesde: 2, esquinaAnchoHasta: 3 };
    return { ladoLargoIdx: 4, ladoAnchoIdx: 3, esquinaLargoDesde: 5, esquinaLargoHasta: 6, esquinaAnchoDesde: 4, esquinaAnchoHasta: 5 };
  }
  if (forma === "u") {
    const base = zonaIdx * 2;
    const p1 = base + 1, p2 = base + 2, p3 = base + 3;
    return { ladoLargoIdx: base, ladoAnchoIdx: base + 1, esquinaLargoDesde: p1, esquinaLargoHasta: p2, esquinaAnchoDesde: p2, esquinaAnchoHasta: p3 };
  }
  // Rectangular
  return { ladoLargoIdx: 0, ladoAnchoIdx: 1, esquinaLargoDesde: 1, esquinaLargoHasta: 2, esquinaAnchoDesde: 2, esquinaAnchoHasta: 3 };
}

/** Genera ref de lado con esquinas: "M2(1-2)" o "a(1-2)" */
function refLado(lados: LadoGeometria[], ladoIdx: number, desde: number, hasta: number): string {
  const lado = lados[ladoIdx];
  if (!lado) return `L${ladoIdx + 1}(${desde}-${hasta})`;
  const etiq = resolverEtiquetaLado(lado, ladoIdx);
  return `${etiq}(${desde}-${hasta})`;
}

/**
 * Obtiene el tipo de geometria para un subtipo/categoria dados
 */
export function getTipoGeometria(categoria: CategoriaElemento, subtipo?: string): TipoGeometria {
  if (subtipo && SUBTIPO_GEOMETRIA_OVERRIDE[subtipo]) {
    return SUBTIPO_GEOMETRIA_OVERRIDE[subtipo];
  }
  return CATEGORIA_A_GEOMETRIA[categoria] || "superficie";
}

/**
 * Genera barras automaticamente desde la geometria del elemento.
 * Usa los diametros de la plantilla como referencia.
 * recubrimientoBase: recubrimiento efectivo del elemento/proyecto (m), usado en zunchos
 * cuando el zuncho no define el suyo propio. Default 0.05.
 */
export function generarBarrasDesdeGeometria(
  geometria: GeometriaElemento,
  categoria: CategoriaElemento,
  subtipo?: string,
  recubrimientoBase?: number
): BarraBase[] {
  const tipo = getTipoGeometria(categoria, subtipo);

  switch (tipo) {
    case "superficie":
      return generarBarrasSuperficie(geometria, subtipo, recubrimientoBase);
    case "muro":
      return generarBarrasMuro(geometria, subtipo, recubrimientoBase);
    case "lineal":
      return generarBarrasLineal(geometria, subtipo, recubrimientoBase);
    case "pilar":
      return generarBarrasPilar(geometria, subtipo, recubrimientoBase);
    case "escalera":
      return generarBarrasEscalera(geometria, subtipo, recubrimientoBase);
    default:
      return generarBarrasSuperficie(geometria, subtipo, recubrimientoBase);
  }
}

/**
 * Obtiene los diametros de referencia de la plantilla.
 * Busca en barrasDefault las barras que coincidan con etiquetas clave.
 */
function getDiametrosPlantilla(subtipo?: string): Record<string, number> {
  if (!subtipo) return {};
  const plantilla = getPlantilla(subtipo);
  if (!plantilla) return {};

  const map: Record<string, number> = {};
  for (const b of plantilla.barrasDefault) {
    map[b.etiqueta] = b.diametro;
  }
  return map;
}

// ============================================================
// SUPERFICIES (losas, zapatas, forjados) — soporta multi-zona
// ============================================================
function generarBarrasSuperficie(g: GeometriaElemento, subtipo?: string, recubrimientoBase?: number): BarraBase[] {
  const esp = g.espaciado || 0.20;
  const recBase = recubrimientoBase ?? 0.05;
  const diam = getDiametrosPlantilla(subtipo);
  const barras: BarraBase[] = [];

  // Extraer zonas rectangulares desde los lados
  interface Zona { largo: number; ancho: number; }
  const zonas: Zona[] = [];

  if (g.forma === "l" && g.lados.length >= 6) {
    // L con 6 lados perimetrales → 2 zonas rectangulares
    // [0]=Superior, [1]=Derecho, [2]=Entrante H, [3]=Entrante V, [4]=Inferior, [5]=Izquierdo
    // Zona sup: Superior × Derecho (franja ancha superior)
    zonas.push({ largo: g.lados[0].longitud, ancho: g.lados[1].longitud });
    // Zona inf: Inferior × Entrante V (franja estrecha inferior)
    zonas.push({ largo: g.lados[4].longitud, ancho: g.lados[3].longitud });
  } else {
    // Rectangular, U, etc: cada par (largo, ancho) es una zona
    for (let i = 0; i < g.lados.length; i += 2) {
      zonas.push({
        largo: g.lados[i]?.longitud || 5,
        ancho: g.lados[i + 1]?.longitud || g.lados[i]?.longitud || 5,
      });
    }
    if (zonas.length === 0) zonas.push({ largo: 5, ancho: 5 });
  }

  const multiZona = zonas.length > 1;
  const tieneSuper = !subtipo || !subtipo.includes("zapata_aislada");

  // Diametros referencia
  const dInf = diam["Inferior largo"] || diam["Parrilla lado largo"] || diam["Inferior principal"] || 12;
  const dInfAncho = diam["Inferior ancho"] || diam["Parrilla lado corto"] || diam["Inferior reparto"] || dInf;
  const dSup = diam["Superior largo"] || diam["Superior (negativos)"] || 10;
  const dSupAncho = diam["Superior ancho"] || diam["Superior reparto"] || dSup;

  // ── Forjado reticular (rectangular O polígono) ──
  if (subtipo === "forjado_reticular" && g.lados.length >= 2) {
    const dNervio = diam["Nervios abajo largo"] || 12;
    const dMalla = diam["Malla base"] || 6;
    const dNegAb = diam["Neg. ábaco X"] || diam["Neg. ábaco perim X"] || 16;
    const zw = g.anchoZuncho || 0;
    const huecos = g.huecos || [];
    const abPerim = g.anchoAbacoPerimetral || 0;  // banda ábaco perimetral
    const abInt = g.abacosInteriores || [];
    const espAbaco = g.espaciadoAbaco || 0.15;
    const vuelo = g.vueloAbaco || 0.50;
    const rec = recBase;
    // Margen interior = zuncho + ábaco perimetral
    const margen = zw + abPerim;

    // Helpers para intersección con contorno poligonal
    const usaPoligono = g.forma === "poligono" && g.vertices && g.vertices.length >= 3;
    const verts = usaPoligono ? g.vertices! : [];
    const dimX = g.dimensionX || (g.lados[0]?.longitud || 10);
    const dimY = g.dimensionY || (g.lados[1]?.longitud || 8);

    const intersectH = (y: number): number[] => {
      if (!usaPoligono) return [];
      const hits: number[] = [];
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i], b = verts[(i + 1) % verts.length];
        const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
        if (y < minY || y > maxY || Math.abs(a.y - b.y) < 0.001) continue;
        const t = (y - a.y) / (b.y - a.y);
        hits.push(+(a.x + t * (b.x - a.x)).toFixed(4));
      }
      return hits.sort((a, b) => a - b);
    };
    const intersectV = (x: number): number[] => {
      if (!usaPoligono) return [];
      const hits: number[] = [];
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i], b = verts[(i + 1) % verts.length];
        const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
        if (x < minX || x > maxX || Math.abs(a.x - b.x) < 0.001) continue;
        const t = (x - a.x) / (b.x - a.x);
        hits.push(+(a.y + t * (b.y - a.y)).toFixed(4));
      }
      return hits.sort((a, b) => a - b);
    };

    const groupBarsRet = (lengths: number[], diametro: number, etiquetaBase: string) => {
      const grouped = new Map<number, number>();
      for (const len of lengths) {
        const rounded = +len.toFixed(2);
        if (rounded < 0.10) continue;
        grouped.set(rounded, (grouped.get(rounded) || 0) + 1);
      }
      for (const [len, cant] of [...grouped.entries()].sort((a, b) => b[0] - a[0])) {
        barras.push({ longitud: len, diametro, cantidad: cant, etiqueta: `${etiquetaBase} (${len}m)` });
      }
    };

    if (usaPoligono) {
      // ── Nervios cortados según contorno (zona casetones = dentro del margen) ──
      const xLens: number[] = [];
      const startY = rec + margen, endY = dimY - rec - margen;
      for (let y = startY; y <= endY + 0.001; y += esp) {
        const hits = intersectH(y);
        for (let j = 0; j < hits.length - 1; j += 2) {
          // Recortar al margen interior (zona casetones)
          const x0 = Math.max(hits[j] + margen, hits[j]);
          const x1 = Math.min(hits[j + 1] - margen, hits[j + 1]);
          const barLen = +(x1 - x0).toFixed(2);
          if (barLen > 0.10) xLens.push(barLen);
        }
      }
      groupBarsRet(xLens, dNervio, "Nervio inf X");

      const yLens: number[] = [];
      const startX = rec + margen, endX = dimX - rec - margen;
      for (let x = startX; x <= endX + 0.001; x += esp) {
        const hits = intersectV(x);
        for (let j = 0; j < hits.length - 1; j += 2) {
          const y0 = Math.max(hits[j] + margen, hits[j]);
          const y1 = Math.min(hits[j + 1] - margen, hits[j + 1]);
          const barLen = +(y1 - y0).toFixed(2);
          if (barLen > 0.10) yLens.push(barLen);
        }
      }
      groupBarsRet(yLens, dNervio, "Nervio inf Y");

      // Malla base antifisuración
      groupBarsRet(xLens, dMalla, "Malla X");

      // ── Negativos ábaco perimetral ──
      // Barras negativas en la banda perimetral (zuncho+ábaco)
      if (abPerim > 0) {
        // Barras X en banda superior e inferior del contorno
        const negXlens: number[] = [];
        for (let y = rec; y <= margen; y += espAbaco) {
          const hits = intersectH(y);
          for (let j = 0; j < hits.length - 1; j += 2) {
            const barLen = +(hits[j + 1] - hits[j] - 2 * rec).toFixed(2);
            if (barLen > 0.10) negXlens.push(barLen);
          }
          // Espejo en banda superior
          const yMirror = dimY - y;
          const hits2 = intersectH(yMirror);
          for (let j = 0; j < hits2.length - 1; j += 2) {
            const barLen = +(hits2[j + 1] - hits2[j] - 2 * rec).toFixed(2);
            if (barLen > 0.10) negXlens.push(barLen);
          }
        }
        groupBarsRet(negXlens, dNegAb, "Neg. ábaco perim X");

        // Barras Y en banda izquierda y derecha del contorno
        const negYlens: number[] = [];
        for (let x = rec; x <= margen; x += espAbaco) {
          const hits = intersectV(x);
          for (let j = 0; j < hits.length - 1; j += 2) {
            const barLen = +(hits[j + 1] - hits[j] - 2 * rec).toFixed(2);
            if (barLen > 0.10) negYlens.push(barLen);
          }
          const xMirror = dimX - x;
          const hits2 = intersectV(xMirror);
          for (let j = 0; j < hits2.length - 1; j += 2) {
            const barLen = +(hits2[j + 1] - hits2[j] - 2 * rec).toFixed(2);
            if (barLen > 0.10) negYlens.push(barLen);
          }
        }
        groupBarsRet(negYlens, dNegAb, "Neg. ábaco perim Y");
      }

    } else {
      // ── Reticular rectangular / L / U ──
      for (const [idx, z] of zonas.entries()) {
        const info = getInfoZonaSuperficie(g.forma, idx);
        const rL = refLado(g.lados, info.ladoLargoIdx, info.esquinaLargoDesde, info.esquinaLargoHasta);
        const rA = refLado(g.lados, info.ladoAnchoIdx, info.esquinaAnchoDesde, info.esquinaAnchoHasta);
        const netLargo = Math.max(z.largo - 2 * margen, 0);
        const netAncho = Math.max(z.ancho - 2 * margen, 0);
        let cantL = Math.round(netAncho / esp);
        let cantA = Math.round(netLargo / esp);
        if (idx === 0) {
          for (const h of huecos) {
            cantL = Math.max(0, cantL - Math.round(h.ancho / esp));
            cantA = Math.max(0, cantA - Math.round(h.largo / esp));
          }
        }
        barras.push(
          { longitud: +netLargo.toFixed(2), diametro: dNervio, cantidad: cantL, etiqueta: `${rL} nervio abajo` },
          { longitud: +netAncho.toFixed(2), diametro: dNervio, cantidad: cantA, etiqueta: `${rA} nervio abajo` },
          { longitud: +netLargo.toFixed(2), diametro: dMalla, cantidad: Math.round(netAncho / 0.30), etiqueta: `${rL} malla` },
        );
        // Negativos ábaco perimetral (rectangular)
        if (abPerim > 0) {
          const cantNegL = Math.max(1, Math.ceil(abPerim / espAbaco)) * 2; // arriba + abajo
          const cantNegA = Math.max(1, Math.ceil(abPerim / espAbaco)) * 2; // izq + der
          barras.push(
            { longitud: +(z.largo - 2 * rec).toFixed(2), diametro: dNegAb, cantidad: cantNegL, etiqueta: `${rL} neg perim` },
            { longitud: +(z.ancho - 2 * rec).toFixed(2), diametro: dNegAb, cantidad: cantNegA, etiqueta: `${rA} neg perim` },
          );
        }
      }
    }

    // ── Ábacos interiores — negativos alrededor de pilares interiores ──
    for (const ab of abInt) {
      const longX = +(ab.ancho + 2 * vuelo).toFixed(2);
      const longY = +(ab.largo + 2 * vuelo).toFixed(2);
      const cantX = Math.max(1, Math.ceil(ab.largo / espAbaco));
      const cantY = Math.max(1, Math.ceil(ab.ancho / espAbaco));
      barras.push(
        { longitud: longX, diametro: dNegAb, cantidad: cantX, etiqueta: `Neg. ábaco int ${ab.pilar} X` },
        { longitud: longY, diametro: dNegAb, cantidad: cantY, etiqueta: `Neg. ábaco int ${ab.pilar} Y` },
      );
    }

    // Refuerzo perimetral de huecos
    for (const h of huecos) {
      const dRef = diam["Nervios abajo largo"] || 12;
      barras.push({ longitud: +h.largo.toFixed(2), diametro: dRef, cantidad: 4, etiqueta: `Refuerzo hueco ${h.nombre} largo` });
      barras.push({ longitud: +h.ancho.toFixed(2), diametro: dRef, cantidad: 4, etiqueta: `Refuerzo hueco ${h.nombre} ancho` });
    }

    return barras;
  }

  // ── Polígono libre (losa, zapata, etc.): armadura cortada según contorno real ──
  if (g.forma === "poligono" && g.vertices && g.vertices.length >= 3) {
    const verts = g.vertices;
    const dimX = g.dimensionX || 10;
    const dimY = g.dimensionY || 8;
    const zw = g.anchoZuncho || 0;
    const rec = recBase;

    // Helper: intersect horizontal line y=Y with polygon edges, return sorted X intercepts
    const intersectHorizontal = (y: number): number[] => {
      const hits: number[] = [];
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i], b = verts[(i + 1) % verts.length];
        const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
        if (y < minY || y > maxY || Math.abs(a.y - b.y) < 0.001) continue;
        const t = (y - a.y) / (b.y - a.y);
        hits.push(+(a.x + t * (b.x - a.x)).toFixed(4));
      }
      return hits.sort((a, b) => a - b);
    };

    // Helper: intersect vertical line x=X with polygon edges, return sorted Y intercepts
    const intersectVertical = (x: number): number[] => {
      const hits: number[] = [];
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i], b = verts[(i + 1) % verts.length];
        const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
        if (x < minX || x > maxX || Math.abs(a.x - b.x) < 0.001) continue;
        const t = (x - a.x) / (b.x - a.x);
        hits.push(+(a.y + t * (b.y - a.y)).toFixed(4));
      }
      return hits.sort((a, b) => a - b);
    };

    // Group bars by rounded length to avoid hundreds of unique sizes
    const groupBars = (lengths: number[], dir: string, diametro: number, etiquetaBase: string) => {
      // Round to nearest cm for grouping
      const grouped = new Map<number, number>();
      for (const len of lengths) {
        const rounded = +len.toFixed(2);
        if (rounded < 0.10) continue; // skip tiny bars
        grouped.set(rounded, (grouped.get(rounded) || 0) + 1);
      }
      // Sort by length descending
      const entries = [...grouped.entries()].sort((a, b) => b[0] - a[0]);
      for (const [len, cant] of entries) {
        barras.push({ longitud: len, diametro, cantidad: cant, etiqueta: `${etiquetaBase} (${len}m)` });
      }
    };

    // === Direction X (horizontal bars) ===
    // For each row (Y position), find where the horizontal line crosses the polygon
    const xLengths: number[] = [];
    const startY = rec + zw;
    const endY = dimY - rec - zw;
    for (let y = startY; y <= endY + 0.001; y += esp) {
      const hits = intersectHorizontal(y);
      // Process pairs: each pair of hits defines a bar span
      for (let j = 0; j < hits.length - 1; j += 2) {
        const barLen = +(hits[j + 1] - hits[j] - 2 * rec).toFixed(2);
        if (barLen > 0.10) xLengths.push(barLen);
      }
    }
    groupBars(xLengths, "X", dInf, "X inf");

    // === Direction Y (vertical bars) ===
    const yLengths: number[] = [];
    const startX = rec + zw;
    const endX = dimX - rec - zw;
    for (let x = startX; x <= endX + 0.001; x += esp) {
      const hits = intersectVertical(x);
      for (let j = 0; j < hits.length - 1; j += 2) {
        const barLen = +(hits[j + 1] - hits[j] - 2 * rec).toFixed(2);
        if (barLen > 0.10) yLengths.push(barLen);
      }
    }
    groupBars(yLengths, "Y", dInfAncho, "Y inf");

    // === Superior (same lengths, different label) ===
    if (tieneSuper) {
      groupBars(xLengths, "X", dSup, "X sup");
      groupBars(yLengths, "Y", dSupAncho, "Y sup");
    }

    // Arranque pilar para zapatas
    if (subtipo?.includes("zapata")) {
      barras.push({ longitud: 1.20, diametro: 12, cantidad: 4, etiqueta: "Arranque pilar" });
    }
    // Refuerzo huecos
    for (const h of (g.huecos || [])) {
      barras.push(
        { longitud: +h.largo.toFixed(2), diametro: dInf, cantidad: 4, etiqueta: `Refuerzo hueco ${h.nombre} largo` },
        { longitud: +h.ancho.toFixed(2), diametro: dInf, cantidad: 4, etiqueta: `Refuerzo hueco ${h.nombre} ancho` },
      );
    }
    return barras;
  }

  // Forjados especiales tienen su propia logica
  if (subtipo === "forjado_unidireccional") {
    const dNeg = diam["Negativos gruesos"] || 12;
    const dNegFino = diam["Negativos finos"] || 10;
    const dMalla = diam["Malla reparto largo"] || 6;
    const zwUni = g.anchoZuncho || 0;
    const huecosUni = g.huecos || [];
    // Intereje de nervios (esp del forjado, p.ej. 0.70m) vs espaciado de malla de reparto (~0.30m).
    const intereje = esp;
    const espMalla = 0.30;
    for (const [idx, z] of zonas.entries()) {
      const info = getInfoZonaSuperficie(g.forma, idx);
      const rL = refLado(g.lados, info.ladoLargoIdx, info.esquinaLargoDesde, info.esquinaLargoHasta);
      const rA = refLado(g.lados, info.ladoAnchoIdx, info.esquinaAnchoDesde, info.esquinaAnchoHasta);
      const netLargo = Math.max(z.largo - 2 * zwUni, 0);
      const netAncho = Math.max(z.ancho - 2 * zwUni, 0);
      // Negativos: una cuadrilla por cada nervio (intereje)
      let cantNervios = Math.round(netAncho / intereje);
      let cantNerviosT = Math.round(netLargo / intereje);
      // Malla de reparto: a su propio espaciado
      let cantMallaL = Math.round(netAncho / espMalla);
      let cantMallaA = Math.round(netLargo / espMalla);
      if (idx === 0) {
        for (const h of huecosUni) {
          cantNervios = Math.max(0, cantNervios - Math.round(h.ancho / intereje));
          cantNerviosT = Math.max(0, cantNerviosT - Math.round(h.largo / intereje));
          cantMallaL = Math.max(0, cantMallaL - Math.round(h.ancho / espMalla));
          cantMallaA = Math.max(0, cantMallaA - Math.round(h.largo / espMalla));
        }
      }
      barras.push(
        { longitud: +(netLargo * 0.5).toFixed(2), diametro: dNeg, cantidad: cantNervios, etiqueta: `${rL} neg gruesos` },
        { longitud: +(netLargo * 0.3).toFixed(2), diametro: dNegFino, cantidad: cantNerviosT, etiqueta: `${rA} neg finos` },
        { longitud: +netLargo.toFixed(2), diametro: dMalla, cantidad: cantMallaL, etiqueta: `${rL} malla` },
        { longitud: +netAncho.toFixed(2), diametro: dMalla, cantidad: cantMallaA, etiqueta: `${rA} malla` },
      );
    }
    // Refuerzo perimetral de huecos
    for (const h of huecosUni) {
      barras.push({ longitud: +h.largo.toFixed(2), diametro: dMalla, cantidad: 4, etiqueta: `Refuerzo hueco ${h.nombre} largo` });
      barras.push({ longitud: +h.ancho.toFixed(2), diametro: dMalla, cantidad: 4, etiqueta: `Refuerzo hueco ${h.nombre} ancho` });
    }
    return barras;
  }

  // (reticular ya procesado arriba)

  // Caso general: losas, zapatas, forjados bidireccionales
  const zw2 = g.anchoZuncho || 0; // zuncho perimetral (forjados)
  const huecos = g.huecos || [];

  // L-shape: barras verticales continuas a lo largo del lado izquierdo (lado[5] = lb+ld)
  // En vez de cortar barras por zona, las que solapan ambas zonas son continuas
  const isL = g.forma === "l" && g.lados.length >= 6;
  let lContinuousCant = 0; // cantidad de barras continuas en la zona solapada
  if (isL) {
    const le = g.lados[4].longitud; // ancho de zona inferior
    const netLe = Math.max(le - 2 * zw2, 0);
    lContinuousCant = Math.round(netLe / esp);
  }

  for (const [idx, z] of zonas.entries()) {
    const info = getInfoZonaSuperficie(g.forma, idx);
    const rL = refLado(g.lados, info.ladoLargoIdx, info.esquinaLargoDesde, info.esquinaLargoHasta);
    const rA = refLado(g.lados, info.ladoAnchoIdx, info.esquinaAnchoDesde, info.esquinaAnchoHasta);
    // Dimensiones netas (descontando zunchos si los hay)
    const netLargo = Math.max(z.largo - 2 * zw2, 0);
    const netAncho = Math.max(z.ancho - 2 * zw2, 0);
    let cantLargo = Math.round(netAncho / esp);
    let cantAncho = Math.round(netLargo / esp);

    // Descontar huecos (solo zona principal idx=0)
    if (idx === 0) {
      for (const h of huecos) {
        cantLargo = Math.max(0, cantLargo - Math.round(h.ancho / esp));
        cantAncho = Math.max(0, cantAncho - Math.round(h.largo / esp));
      }
    }

    // LARGO (horizontal): siempre por zona
    barras.push({
      longitud: +(zw2 > 0 ? netLargo : z.largo).toFixed(2),
      diametro: dInf,
      cantidad: cantLargo,
      etiqueta: `${rL} inf`,
    });

    // ANCHO (vertical): L-shape usa barras continuas en la zona solapada
    if (isL && idx === 0) {
      // Zone 0: solo la porcion no solapada (lado derecho, la-le)
      const cantNonOverlap = Math.max(0, cantAncho - lContinuousCant);
      if (cantNonOverlap > 0) {
        barras.push({
          longitud: +(zw2 > 0 ? netAncho : z.ancho).toFixed(2),
          diametro: dInfAncho,
          cantidad: cantNonOverlap,
          etiqueta: `${rA} inf`,
        });
      }
    } else if (isL && idx === 1) {
      // Zone 1: barras verticales ya cubiertas por las continuas — no generar
    } else {
      // Caso normal (rectangular, U, etc.)
      barras.push({
        longitud: +(zw2 > 0 ? netAncho : z.ancho).toFixed(2),
        diametro: dInfAncho,
        cantidad: cantAncho,
        etiqueta: `${rA} inf`,
      });
    }

    if (tieneSuper) {
      barras.push({
        longitud: +(zw2 > 0 ? netLargo : z.largo).toFixed(2),
        diametro: dSup,
        cantidad: cantLargo,
        etiqueta: `${rL} sup`,
      });

      if (isL && idx === 0) {
        const cantNonOverlap = Math.max(0, cantAncho - lContinuousCant);
        if (cantNonOverlap > 0) {
          barras.push({
            longitud: +(zw2 > 0 ? netAncho : z.ancho).toFixed(2),
            diametro: dSupAncho,
            cantidad: cantNonOverlap,
            etiqueta: `${rA} sup`,
          });
        }
      } else if (isL && idx === 1) {
        // ya cubiertas por continuas
      } else {
        barras.push({
          longitud: +(zw2 > 0 ? netAncho : z.ancho).toFixed(2),
          diametro: dSupAncho,
          cantidad: cantAncho,
          etiqueta: `${rA} sup`,
        });
      }
    }
  }

  // L-shape: añadir barras verticales continuas a lo largo del lado izquierdo completo
  // lado[5] = P6→P1, longitud = lb + ld (todo el lado izquierdo)
  if (isL && lContinuousCant > 0) {
    const lb = g.lados[1].longitud;
    const ld = g.lados[3].longitud;
    const fullHeight = lb + ld;
    // Solo zuncho en borde superior e inferior (no en la junta interna entre zonas)
    const netFullHeight = zw2 > 0 ? Math.max(fullHeight - 2 * zw2, 0) : fullHeight;
    const rIzq = refLado(g.lados, 5, 6, 1); // lado[5] = P6→P1

    barras.push({
      longitud: +netFullHeight.toFixed(2),
      diametro: dInfAncho,
      cantidad: lContinuousCant,
      etiqueta: `${rIzq} inf`,
    });
    if (tieneSuper) {
      barras.push({
        longitud: +netFullHeight.toFixed(2),
        diametro: dSupAncho,
        cantidad: lContinuousCant,
        etiqueta: `${rIzq} sup`,
      });
    }
  }

  // Refuerzo perimetral de huecos
  for (const h of huecos) {
    barras.push({ longitud: +h.largo.toFixed(2), diametro: dInf, cantidad: 4, etiqueta: `Refuerzo hueco ${h.nombre} largo` });
    barras.push({ longitud: +h.ancho.toFixed(2), diametro: dInf, cantidad: 4, etiqueta: `Refuerzo hueco ${h.nombre} ancho` });
  }

  // Zapatas: añadir arranque pilar
  if (subtipo && subtipo.includes("zapata")) {
    const dArr = diam["Arranque pilar"] || 12;
    barras.push({
      longitud: 0.90,
      diametro: dArr,
      cantidad: 4,
      etiqueta: "Arranque pilar",
    });
  }

  // Esperas para muros (configuradas por lado de la losa/zapata)
  barras.push(...generarBarrasEsperas(g, "superficie", recBase));

  // Zunchos perimetrales o interiores definidos en el elemento
  barras.push(...generarBarrasZunchos(g, recBase));

  return barras;
}

// ============================================================
// ESPERAS para muros (arranques en losa/zapata corrida/zapata combinada)
// ============================================================
export interface PerimetroLosa {
  idx: number;       // identificador estable del perimetro (lo guarda ConfigEsperaLado.ladoIdx)
  etiqueta: string;  // nombre legible del perimetro
  longitud: number;  // longitud del muro que apoya en este perimetro (m)
}

/**
 * Devuelve los perimetros donde puede apoyar un muro.
 * - Rectangular: 4 lados (Frontal/Derecho/Fondo/Izquierdo) aunque g.lados solo guarde 2 (largo y ancho).
 * - L / U: cada g.lados es un perimetro real.
 * - Poligono: cada g.lados es un perimetro real.
 * - Lineal (zapata corrida): 2 caras (Frontal / Trasero) sobre la misma longitud.
 */
export function getPerimetrosLosa(g: GeometriaElemento, tipo: TipoGeometria): PerimetroLosa[] {
  if (tipo === "lineal") {
    const L = g.lados[0]?.longitud || 0;
    return [
      { idx: 0, etiqueta: "Frontal", longitud: L },
      { idx: 1, etiqueta: "Trasero", longitud: L },
    ];
  }
  if (g.forma === "rectangular") {
    const a = g.lados[0]?.longitud || 0;
    const b = g.lados[1]?.longitud || 0;
    return [
      { idx: 0, etiqueta: "Frontal", longitud: a },
      { idx: 1, etiqueta: "Derecho", longitud: b },
      { idx: 2, etiqueta: "Fondo", longitud: a },
      { idx: 3, etiqueta: "Izquierdo", longitud: b },
    ];
  }
  return g.lados.map((l, idx) => ({
    idx,
    etiqueta: resolverEtiquetaLado(l, idx),
    longitud: l.longitud,
  }));
}

export function generarBarrasEsperas(g: GeometriaElemento, tipo: TipoGeometria = "superficie", recubrimientoBase?: number): BarraBase[] {
  const cfgs = g.esperasPorLado;
  if (!cfgs || cfgs.length === 0) return [];
  const canto = g.cantoLosa || 0.30;
  const recubrimiento = recubrimientoBase ?? 0.05;
  const out: BarraBase[] = [];
  const perimetros = getPerimetrosLosa(g, tipo);
  for (const e of cfgs) {
    if (!e.activo) continue;
    const per = perimetros.find((p) => p.idx === e.ladoIdx);
    if (!per) continue;
    const longLado = per.longitud;
    const espac = e.espaciado > 0 ? e.espaciado : 0.20;
    const sobresale = Math.max(0, e.sobresale || 0);
    const pliegue = Math.max(0, e.pliegue || 0);
    const tramoVertical = Math.max(0, canto - recubrimiento) + sobresale;
    if (tramoVertical < 0.05 && pliegue < 0.05) continue;
    const cantidadPorLinea = Math.round(longLado / espac);
    if (cantidadPorLinea < 1) continue;
    const cantidad = cantidadPorLinea * (e.dosCaras ? 2 : 1);
    out.push({
      longitud: +tramoVertical.toFixed(2),
      diametro: e.diametro,
      cantidad,
      etiqueta: `Espera muro ${per.etiqueta}`,
      patas: 1,
      longitudPata: +pliegue.toFixed(2),
    });
  }
  return out;
}

// ============================================================
// ZUNCHOS dentro de losa/forjado
// ============================================================
/** Calcula el perimetro real de la superficie (no de g.lados directos en rectangular). */
export function getPerimetroSuperficie(g: GeometriaElemento): number {
  if (g.forma === "rectangular") {
    return 2 * ((g.lados[0]?.longitud || 0) + (g.lados[1]?.longitud || 0));
  }
  // L (6 lados perimetrales), U (6), poligono — los lados ya son perimetrales reales
  return g.lados.reduce((s, l) => s + l.longitud, 0);
}

export function generarBarrasZunchos(g: GeometriaElemento, recubrimientoBase?: number): BarraBase[] {
  const zunchos = g.zunchos;
  if (!zunchos || zunchos.length === 0) return [];
  const recuFallback = recubrimientoBase ?? 0.05;
  const out: BarraBase[] = [];

  for (const z of zunchos) {
    const tramos = z.tramos;
    if (!tramos || tramos.length === 0) continue;

    const nombreZ = z.nombre || "Zuncho";
    const recu = z.recubrimiento ?? recuFallback;
    const dArriba = z.longArriba?.diametro || 12;
    const dAbajo = z.longAbajo?.diametro || 12;
    const cantArriba = z.longArriba?.cantidad || 0;
    const cantAbajo = z.longAbajo?.cantidad || 0;

    // Solape al cruzar el pilar entre dos tramos consecutivos.
    // Si z.solapeEntreTramos esta seteado, se usa para arriba y abajo.
    // Si no, se toma SOLAPES_ESTANDAR del diametro de cada longitudinal.
    const solapeArriba = z.solapeEntreTramos ?? SOLAPES_ESTANDAR[dArriba] ?? 0.50;
    const solapeAbajo = z.solapeEntreTramos ?? SOLAPES_ESTANDAR[dAbajo] ?? 0.50;

    for (let i = 0; i < tramos.length; i++) {
      const tr = tramos[i];
      const longTramo = Math.max(0, tr.longitud || 0);
      if (longTramo < 0.10) continue;

      // ¿Este tramo solapa con el siguiente?
      // Por defecto: si NO es el ultimo, solapa.
      // Si es el ultimo Y la ubicacion es perimetral (zuncho cerrado), tambien solapa (con el primero).
      // Si solapaSiguiente esta explicito, gana.
      const esUltimo = i === tramos.length - 1;
      const solapaSig = tr.solapaSiguiente ?? (!esUltimo || z.ubicacion === "perimetral");

      const longBarraArriba = +(longTramo + (solapaSig ? solapeArriba : 0)).toFixed(2);
      const longBarraAbajo = +(longTramo + (solapaSig ? solapeAbajo : 0)).toFixed(2);

      const ancho = Math.max(0.10, tr.ancho ?? z.ancho ?? 0.25);
      const canto = Math.max(0.10, tr.canto ?? z.canto ?? 0.30);
      const nombreT = tr.nombre || `T${i + 1}`;
      const etiquetaBase = `${nombreZ} ${nombreT}`;

      // Longitudinales arriba — clasificadas como hSup por la palabra "arriba"
      if (cantArriba > 0 && dArriba > 0) {
        out.push({
          longitud: longBarraArriba,
          diametro: dArriba,
          cantidad: cantArriba,
          etiqueta: `${etiquetaBase} arriba`,
        });
      }
      // Longitudinales abajo — clasificadas como hInf por la palabra "abajo"
      if (cantAbajo > 0 && dAbajo > 0) {
        out.push({
          longitud: longBarraAbajo,
          diametro: dAbajo,
          cantidad: cantAbajo,
          etiqueta: `${etiquetaBase} abajo`,
        });
      }

      // Estribos — perimetro_seccion - 4*recubrimiento (+ 2 ganchos si cerrado)
      const periEstribo = Math.max(
        0.20,
        2 * ((ancho - 2 * recu) + (canto - 2 * recu))
      );
      const gancho = z.estribo.cerrado ? (z.estribo.longitudGancho ?? 0.10) : 0;
      const longEstribo = +(periEstribo + 2 * gancho).toFixed(2);

      if (z.tramosEstribos && z.tramosEstribos.length > 0) {
        // Espaciados distintos por zona, prorrateados al tramo
        let acum = 0;
        const totalLongTramos = z.tramosEstribos.reduce((s, t) => s + (t.longitud || 0), 0) || longTramo;
        for (const teZ of z.tramosEstribos) {
          const fraccion = (teZ.longitud || 0) / totalLongTramos;
          const longParte = longTramo * fraccion;
          if (longParte < 0.05) continue;
          const cant = Math.max(1, Math.round(longParte / Math.max(0.05, teZ.espaciado || 0.20)));
          out.push({
            longitud: longEstribo,
            diametro: z.estribo.diametro,
            cantidad: cant,
            etiqueta: `${etiquetaBase} estribos ${teZ.nombre}`,
          });
          acum += longParte;
        }
        // Si quedan metros sin cubrir, los hacemos con el espaciado uniforme principal
        if (longTramo - acum > 0.05) {
          const cantResto = Math.max(1, Math.round((longTramo - acum) / Math.max(0.05, z.estribo.espaciado || 0.20)));
          out.push({
            longitud: longEstribo,
            diametro: z.estribo.diametro,
            cantidad: cantResto,
            etiqueta: `${etiquetaBase} estribos resto`,
          });
        }
      } else {
        const cantEst = Math.max(1, Math.round(longTramo / Math.max(0.05, z.estribo.espaciado || 0.20)));
        out.push({
          longitud: longEstribo,
          diametro: z.estribo.diametro,
          cantidad: cantEst,
          etiqueta: `${etiquetaBase} estribos`,
        });
      }

      // Barras extra (refuerzos centrales, portaestribos) — por tramo
      if (z.barrasExtra && z.barrasExtra.length > 0) {
        for (const be of z.barrasExtra) {
          if (be.cantidad < 1 || be.diametro <= 0) continue;
          const longBarra = be.longitud != null
            ? Math.max(0.10, be.longitud)
            : Math.max(0.10, longTramo * (be.longitudPct ?? 0.5));
          out.push({
            longitud: +longBarra.toFixed(2),
            diametro: be.diametro,
            cantidad: be.cantidad,
            etiqueta: `${etiquetaBase} ${be.nombre || (be.posicion === "arriba" ? "refuerzo arriba" : be.posicion === "abajo" ? "refuerzo abajo" : "refuerzo")}`,
            patas: be.patas,
            longitudPata: be.longitudPata,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Calcula opciones para repartir un perimetro en N tramos iguales,
 * respetando longitud maxima (12m por defecto) y minima (2m por defecto).
 * Devuelve hasta 4 opciones desde el N minimo posible.
 */
export interface OpcionRepartoPerimetro {
  nTramos: number;
  longitudPorTramo: number;
  // Opcion alternativa: floor(P/Lmax) tramos a Lmax + 1 residual.
  // Si null, no es valida (residual < minTramo).
  variante?: { nMaximo: number; longitudResto: number };
}

export function calcularOpcionesReparto(perimetro: number, longitudMax = 12, minTramo = 2): OpcionRepartoPerimetro[] {
  if (perimetro <= 0) return [];
  // Caso: perimetro <= longitudMax → un solo tramo
  if (perimetro <= longitudMax + 0.01) {
    return [{ nTramos: 1, longitudPorTramo: +perimetro.toFixed(2) }];
  }
  const nMin = Math.ceil(perimetro / longitudMax);
  const nMax = Math.floor(perimetro / Math.max(0.01, minTramo));
  const opciones: OpcionRepartoPerimetro[] = [];
  for (let n = nMin; n <= Math.min(nMin + 3, nMax); n++) {
    const longTramo = +(perimetro / n).toFixed(2);
    if (longTramo < minTramo) continue;
    opciones.push({ nTramos: n, longitudPorTramo: longTramo });
  }
  // Variante "tramos a 12m + uno residual" para la opcion mas eficiente (cerca de 12m)
  const nMax12 = Math.floor(perimetro / longitudMax);
  if (nMax12 >= 1) {
    const resto = +(perimetro - nMax12 * longitudMax).toFixed(2);
    if (resto >= minTramo && opciones[0]) {
      opciones[0].variante = { nMaximo: nMax12, longitudResto: resto };
    }
  }
  return opciones;
}

// ============================================================
// MUROS (muro de carga, contencion, pantalla, nucleo)
// ============================================================
function generarBarrasMuro(g: GeometriaElemento, subtipo?: string, _recubrimientoBase?: number): BarraBase[] {
  const alto = g.alto || 3;
  const espGlobal = g.espaciado || 0.20;
  const diam = getDiametrosPlantilla(subtipo);
  const barras: BarraBase[] = [];

  // Diametros de referencia (plantilla / fallback)
  const dVertRef = diam["Vertical cara 1"] || diam["Muro vertical exterior"] || diam["Vertical exterior"] || 12;
  const dHorizRef = diam["Horizontal cara 1"] || diam["Muro horizontal exterior"] || diam["Horizontal exterior"] || 10;
  const dHorq = g.diametroHorquillas || diam["Horquillas"] || diam["Horquillas muro"] || 8;

  // Config por cara (si existe) o fallback a valores de plantilla
  const ext = g.caraExterior || { diametroVertical: dVertRef, diametroHorizontal: dHorizRef, espaciado: espGlobal };
  const int = g.caraInterior || { diametroVertical: dVertRef, diametroHorizontal: dHorizRef, espaciado: espGlobal };

  // Generar barras por cada lado — cada cara puede tener Ø y espaciado diferentes
  for (const lado of g.lados) {
    const nombre = g.lados.length > 1 ? ` ${lado.nombre}` : "";

    const cantVertExt = Math.round(lado.longitud / ext.espaciado);
    const cantVertInt = Math.round(lado.longitud / int.espaciado);
    const cantHorizExt = Math.round(alto / ext.espaciado);
    const cantHorizInt = Math.round(alto / int.espaciado);

    barras.push({
      longitud: +alto.toFixed(2),
      diametro: ext.diametroVertical,
      cantidad: cantVertExt,
      etiqueta: `Vert. ext${nombre}`,
    });
    barras.push({
      longitud: +alto.toFixed(2),
      diametro: int.diametroVertical,
      cantidad: cantVertInt,
      etiqueta: `Vert. int${nombre}`,
    });
    barras.push({
      longitud: +lado.longitud.toFixed(2),
      diametro: ext.diametroHorizontal,
      cantidad: cantHorizExt,
      etiqueta: `Horiz. ext${nombre}`,
    });
    barras.push({
      longitud: +lado.longitud.toFixed(2),
      diametro: int.diametroHorizontal,
      cantidad: cantHorizInt,
      etiqueta: `Horiz. int${nombre}`,
    });
  }

  // Horquillas: total por area (usa espaciado mayor de ambas caras para ser conservador)
  const espHorq = Math.min(ext.espaciado, int.espaciado);
  const areaTotal = g.lados.reduce((s, l) => s + l.longitud * alto, 0);
  const cantHorquillas = Math.round(areaTotal / (espHorq * espHorq));
  barras.push({
    longitud: 0.30,
    diametro: dHorq,
    cantidad: cantHorquillas,
    etiqueta: "Horquillas",
  });

  // Muro contencion: añadir zapata
  if (subtipo === "muro_contencion") {
    const longitudTotal = g.lados.reduce((s, l) => s + l.longitud, 0);
    const dZap = diam["Zapata ancho"] || 12;
    barras.push(
      { longitud: 2.00, diametro: dZap, cantidad: Math.round(longitudTotal / espGlobal), etiqueta: "Zapata ancho" },
      { longitud: +longitudTotal.toFixed(2), diametro: dZap, cantidad: 4, etiqueta: "Zapata largo" },
    );
  }

  return barras;
}

// ============================================================
// LINEALES (vigas, zunchos, riostras, brochales)
// ============================================================
function generarBarrasLineal(g: GeometriaElemento, subtipo?: string, recubrimientoBase?: number): BarraBase[] {
  const longitud = g.lados[0]?.longitud || 5;
  const secAncho = g.seccionAncho || 0.30;
  const secAlto = g.seccionAlto || 0.30;
  const espEstribos = g.espaciado || 0.15;
  const recu = recubrimientoBase ?? 0.05;
  const diam = getDiametrosPlantilla(subtipo);
  const barras: BarraBase[] = [];
  const plantilla = subtipo ? getPlantilla(subtipo) : null;

  // Zapata corrida: barras "a lo largo" + "a lo ancho" (sin estribos cerrados)
  if (subtipo === "zapata_corrida") {
    const dLargo = diam["Inferior a lo largo"] || 12;
    const dAncho = diam["Inferior a lo ancho"] || 10;
    const dSuperior = diam["Superior a lo largo"] || 10;
    const cantLargo = plantilla?.barrasDefault.find(b => b.etiqueta === "Inferior a lo largo")?.cantidad || 4;
    const cantSuperior = plantilla?.barrasDefault.find(b => b.etiqueta === "Superior a lo largo")?.cantidad || 2;
    const cantAncho = Math.round(longitud / espEstribos);

    barras.push({ longitud: +longitud.toFixed(2), diametro: dLargo, cantidad: cantLargo, etiqueta: "Inferior a lo largo" });
    barras.push({ longitud: +(secAncho - 2 * recu).toFixed(2), diametro: dAncho, cantidad: cantAncho, etiqueta: "Inferior a lo ancho" });
    barras.push({ longitud: +longitud.toFixed(2), diametro: dSuperior, cantidad: cantSuperior, etiqueta: "Superior a lo largo" });
    barras.push(...generarBarrasEsperas(g, "lineal", recu));
    return barras;
  }

  // Vigas/zunchos: barras arriba/abajo + estribos cerrados
  const dAbajo = diam["Barras abajo"] || 16;
  const dArriba = diam["Barras arriba"] || 12;
  const dEstribo = diam["Estribos"] || 8;

  const cantAbajo = plantilla?.barrasDefault.find(b => b.etiqueta === "Barras abajo")?.cantidad || 3;
  const cantArriba = plantilla?.barrasDefault.find(b => b.etiqueta === "Barras arriba")?.cantidad || 2;

  barras.push({
    longitud: +longitud.toFixed(2),
    diametro: dAbajo,
    cantidad: cantAbajo,
    etiqueta: "Barras abajo",
  });
  barras.push({
    longitud: +longitud.toFixed(2),
    diametro: dArriba,
    cantidad: cantArriba,
    etiqueta: "Barras arriba",
  });

  // Estribos: perimetro util de la seccion (descontando recubrimiento) + 2 ganchos cerrados (~10 cm c/u)
  const gancho = 0.10;
  const periEstribos = +(2 * ((secAncho - 2 * recu) + (secAlto - 2 * recu)) + 2 * gancho).toFixed(2);

  if (g.tramosEstribos && g.tramosEstribos.length > 0) {
    // Estribos por tramos (diferentes espaciados)
    for (const tramo of g.tramosEstribos) {
      const cantTramo = Math.max(1, Math.round(tramo.longitud / tramo.espaciado));
      barras.push({
        longitud: periEstribos,
        diametro: dEstribo,
        cantidad: cantTramo,
        etiqueta: `Estribos ${tramo.nombre}`,
      });
    }
  } else {
    // Estribos uniformes
    const cantEstribos = Math.round(longitud / espEstribos);
    barras.push({
      longitud: periEstribos,
      diametro: dEstribo,
      cantidad: cantEstribos,
      etiqueta: "Estribos",
    });
  }

  // Refuerzo negativo (si la plantilla lo tiene)
  if (plantilla?.barrasDefault.some(b => b.etiqueta === "Refuerzo negativo")) {
    const dNeg = diam["Refuerzo negativo"] || dAbajo;
    barras.push({
      longitud: +(longitud * 0.5).toFixed(2),
      diametro: dNeg,
      cantidad: 2,
      etiqueta: "Refuerzo negativo",
    });
  }

  // Portaestribos
  if (plantilla?.barrasDefault.some(b => b.etiqueta === "Portaestribos")) {
    barras.push({
      longitud: +longitud.toFixed(2),
      diametro: dEstribo,
      cantidad: 2,
      etiqueta: "Portaestribos",
    });
  }

  return barras;
}

// ============================================================
// PILARES
// ============================================================
function generarBarrasPilar(g: GeometriaElemento, subtipo?: string, recubrimientoBase?: number): BarraBase[] {
  const alto = g.alto || 3;
  const secAncho = g.seccionAncho || 0.30;
  const secAlto = g.seccionAlto || 0.30;
  const espEstribos = g.espaciado || 0.15;
  const recu = recubrimientoBase ?? 0.05;
  const diam = getDiametrosPlantilla(subtipo);
  const barras: BarraBase[] = [];

  const dLong = diam["Longitudinales"] || diam["Barras longitudinales"] || 16;
  const dEstribo = diam["Estribos"] || diam["Cercos"] || diam["Cercos circulares"] || 8;

  const plantilla = subtipo ? getPlantilla(subtipo) : null;
  const cantLong = plantilla?.barrasDefault.find(b =>
    b.etiqueta.includes("ongitudinal") || b.etiqueta.includes("Longitudinal")
  )?.cantidad || 4;

  // Longitudinales: altura libre + solape al pilar superior + pata de arranque (anclaje en zapata o forjado inferior).
  // Aproximaciones EHE-08: solape ~50Ø, pata de anclaje ~30-40Ø.
  const solape = SOLAPES_ESTANDAR[dLong] ?? 0.50;
  const arranque = +(Math.max(0.30, dLong * 0.030)).toFixed(2); // ~30Ø en metros
  const longLong = +(alto + solape).toFixed(2);

  barras.push({
    longitud: longLong,
    diametro: dLong,
    cantidad: cantLong,
    etiqueta: "Longitudinales",
    patas: 1,
    longitudPata: arranque,
  });

  // Estribos/cercos: perimetro util de la seccion + 2 ganchos de cierre (~10cm c/u)
  const gancho = 0.10;
  const esCircular = g.forma === "circular" || subtipo === "pilar_circular";
  const periEstribos = esCircular
    ? +((Math.max(0.05, secAncho - 2 * recu) * Math.PI) + 2 * gancho).toFixed(2)
    : +(2 * ((secAncho - 2 * recu) + (secAlto - 2 * recu)) + 2 * gancho).toFixed(2);
  const cantEstribos = Math.round(alto / espEstribos);

  barras.push({
    longitud: periEstribos,
    diametro: dEstribo,
    cantidad: cantEstribos,
    etiqueta: esCircular ? "Cercos circulares" : "Estribos",
  });

  return barras;
}

// ============================================================
// ESCALERAS
// ============================================================
function generarBarrasEscalera(g: GeometriaElemento, subtipo?: string, _recubrimientoBase?: number): BarraBase[] {
  const desarrollo = g.lados[0]?.longitud || 4.5;
  const ancho = g.lados[1]?.longitud || 1.2;
  const esp = g.espaciado || 0.20;
  const diam = getDiametrosPlantilla(subtipo);

  const dInfLargo = diam["Inferior a lo largo"] || 12;
  const dInfAncho = diam["Inferior a lo ancho"] || 10;
  const dSupLargo = diam["Superior a lo largo"] || 10;
  const dSupAncho = diam["Superior a lo ancho"] || 8;

  return [
    { longitud: +desarrollo.toFixed(2), diametro: dInfLargo, cantidad: Math.round(ancho / esp), etiqueta: "Inferior a lo largo" },
    { longitud: +ancho.toFixed(2), diametro: dInfAncho, cantidad: Math.round(desarrollo / esp), etiqueta: "Inferior a lo ancho" },
    { longitud: +desarrollo.toFixed(2), diametro: dSupLargo, cantidad: Math.round(ancho / (esp * 2)), etiqueta: "Superior a lo largo" },
    { longitud: +ancho.toFixed(2), diametro: dSupAncho, cantidad: Math.round(desarrollo / esp), etiqueta: "Superior a lo ancho" },
  ];
}

// ============================================================
// GEOMETRIA POR DEFECTO para cada subtipo
// ============================================================
export function getGeometriaDefault(subtipo: string, categoria: CategoriaElemento): GeometriaElemento {
  const tipo = getTipoGeometria(categoria, subtipo);

  // Forjados tienen espaciado especifico (bovedillas/casetones)
  if (subtipo === "forjado_unidireccional") {
    return {
      forma: "rectangular",
      lados: [
        { nombre: "Largo", longitud: 5 },
        { nombre: "Ancho", longitud: 5 },
      ],
      espaciado: 0.70,
      anchoZuncho: 0.25,
    };
  }
  if (subtipo === "forjado_reticular") {
    return {
      forma: "rectangular",
      lados: [
        { nombre: "Largo", longitud: 5 },
        { nombre: "Ancho", longitud: 5 },
      ],
      espaciado: 0.82,           // intereje = casetón 70cm + nervio 12cm
      anchoZuncho: 0.30,
      anchoAbacoPerimetral: 1.20, // banda ábaco continua perimetral
      espaciadoAbaco: 0.15,
      vueloAbaco: 0.50,
      casetonAncho: 0.70,
      casetonLargo: 0.70,
      nervioAncho: 0.12,
    };
  }

  switch (tipo) {
    case "superficie":
      return {
        forma: "rectangular",
        lados: [
          { nombre: "Largo", longitud: 5 },
          { nombre: "Ancho", longitud: 5 },
        ],
        espaciado: 0.20,
      };
    case "muro":
      return {
        forma: "recto",
        lados: [{ nombre: "Longitud", longitud: 5 }],
        alto: 3,
        espaciado: 0.20,
      };
    case "lineal":
      return {
        forma: "recto",
        lados: [{ nombre: "Longitud", longitud: 5 }],
        seccionAncho: 0.30,
        seccionAlto: 0.30,
        espaciado: 0.15,
      };
    case "pilar":
      return {
        forma: subtipo === "pilar_circular" ? "circular" : "rectangular",
        lados: [],
        alto: 3,
        seccionAncho: 0.30,
        seccionAlto: 0.30,
        espaciado: 0.15,
      };
    case "escalera":
      return {
        forma: "rectangular",
        lados: [
          { nombre: "Desarrollo", longitud: 4.5 },
          { nombre: "Ancho", longitud: 1.2 },
        ],
        espaciado: 0.20,
      };
    default:
      return {
        forma: "rectangular",
        lados: [
          { nombre: "Largo", longitud: 5 },
          { nombre: "Ancho", longitud: 5 },
        ],
        espaciado: 0.20,
      };
  }
}

/**
 * Nombres de lados segun la forma del muro
 */
export function getLadosForma(forma: FormaElemento): string[] {
  switch (forma) {
    case "recto": return ["Longitud"];
    case "l": return ["Lado 1", "Lado 2"];
    case "u": return ["Izquierdo", "Fondo", "Derecho"];
    case "cerrado": return ["Frontal", "Derecho", "Fondo", "Izquierdo"];
    default: return ["Longitud"];
  }
}

/**
 * Nombres de lados para superficies segun la forma.
 * Cada par (Largo, Ancho) define una zona rectangular.
 */
export function getLadosSuperficie(forma: FormaElemento): string[] {
  switch (forma) {
    case "rectangular": return ["Largo", "Ancho"];
    case "l": return ["Superior", "Derecho", "Entrante H", "Entrante V", "Inferior", "Izquierdo"];
    case "u": return ["Ala izq Largo", "Ala izq Ancho", "Centro Largo", "Centro Ancho", "Ala der Largo", "Ala der Ancho"];
    case "poligono": return []; // Lados dinámicos, no predefinidos
    default: return ["Largo", "Ancho"];
  }
}

/** Nombres de zona para mostrar en UI */
export function getNombresZonaSuperficie(forma: FormaElemento): string[] {
  switch (forma) {
    case "l": return ["Ala 1", "Ala 2"];
    case "u": return ["Ala izq", "Centro", "Ala der"];
    default: return [];
  }
}
