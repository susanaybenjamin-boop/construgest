// Cálculo de volúmenes de hormigón a partir de la geometría del elemento.
// Resultado en m³ (informativo, lo usa la UI/resumen para reportar el total
// de hormigón de la obra junto al despiece de acero).

import {
  GeometriaElemento,
  CategoriaElemento,
  ElementoEstructural,
} from "./types";
import { getTipoGeometria } from "./generadores";

/** Área de un polígono cerrado (shoelace) */
function areaPoligono(verts: { x: number; y: number }[]): number {
  if (!verts || verts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Área neta de la superficie según forma — descuenta huecos. */
function areaSuperficie(g: GeometriaElemento): number {
  let area = 0;
  if (g.forma === "rectangular") {
    const a = g.lados[0]?.longitud || 0;
    const b = g.lados[1]?.longitud || 0;
    area = a * b;
  } else if (g.forma === "l" && g.lados.length >= 6) {
    // Suma de las dos zonas (la extracted in generadores.ts)
    const lA = g.lados[0].longitud * g.lados[1].longitud; // zona sup
    const lB = g.lados[4].longitud * g.lados[3].longitud; // zona inf
    area = lA + lB;
  } else if (g.forma === "u" && g.lados.length >= 6) {
    const z1 = g.lados[0].longitud * g.lados[1].longitud;
    const z2 = g.lados[2].longitud * g.lados[3].longitud;
    const z3 = g.lados[4].longitud * g.lados[5].longitud;
    area = z1 + z2 + z3;
  } else if (g.forma === "poligono" && g.vertices && g.vertices.length >= 3) {
    area = g.areaAproximada || areaPoligono(g.vertices);
  } else {
    // Fallback: producto de los dos primeros lados
    const a = g.lados[0]?.longitud || 0;
    const b = g.lados[1]?.longitud || 0;
    area = a * b;
  }
  // Descontar huecos
  for (const h of g.huecos || []) {
    area -= h.largo * h.ancho;
  }
  return Math.max(0, area);
}

/** Longitud total de zunchos perimetrales o interiores definidos en el elemento. */
function volumenZunchosEnElemento(g: GeometriaElemento): number {
  if (!g.zunchos || g.zunchos.length === 0) return 0;
  let v = 0;
  for (const z of g.zunchos) {
    const ancho = z.ancho || 0.25;
    const canto = z.canto || 0.30;
    for (const tr of z.tramos || []) {
      const a = tr.ancho ?? ancho;
      const c = tr.canto ?? canto;
      const L = Math.max(0, tr.longitud || 0);
      v += a * c * L;
    }
  }
  return v;
}

/** Volumen de hormigón de UN elemento (m³). Devuelve 0 si no se puede calcular. */
export function calcularVolumenElemento(el: ElementoEstructural): number {
  const g = el.geometria;
  if (!g) return 0;
  const tipo = getTipoGeometria(el.categoria || "libre", el.subtipo);
  const cantidad = el.cantidad || 1;
  let v = 0;

  if (tipo === "superficie") {
    const canto = g.cantoLosa || 0.30;
    const area = areaSuperficie(g);
    if (el.subtipo === "forjado_reticular") {
      // Restar volumen de casetones: aprox (área útil) × (canto - capa compresión 5cm)
      const capa = 0.05; // capa de compresión típica
      const cAncho = g.casetonAncho || 0.70;
      const cLargo = g.casetonLargo || 0.70;
      const nervAncho = g.nervioAncho || 0.12;
      const intereje = cAncho + nervAncho;
      const fraccionCaseton = (cAncho * cLargo) / (intereje * intereje);
      const margen = (g.anchoZuncho || 0) + (g.anchoAbacoPerimetral || 0);
      // Área de zona casetonada (descontando perímetro macizo y ábacos interiores)
      let areaCasetonable = Math.max(0, area - 2 * margen * Math.sqrt(area)); // aprox
      for (const ab of g.abacosInteriores || []) {
        areaCasetonable -= ab.ancho * ab.largo;
      }
      areaCasetonable = Math.max(0, areaCasetonable);
      const volCasetones = areaCasetonable * fraccionCaseton * Math.max(0, canto - capa);
      v = area * canto - volCasetones;
    } else if (el.subtipo === "forjado_unidireccional") {
      // Aprox: 60% del volumen total (bovedillas restan ~40%)
      v = area * canto * 0.60;
    } else {
      v = area * canto;
    }
    v += volumenZunchosEnElemento(g);
  } else if (tipo === "lineal") {
    const L = g.lados[0]?.longitud || 0;
    const a = g.seccionAncho || 0.30;
    const h = g.seccionAlto || 0.30;
    v = L * a * h;
  } else if (tipo === "pilar") {
    const alto = g.alto || 3;
    const a = g.seccionAncho || 0.30;
    const h = g.seccionAlto || 0.30;
    if (g.forma === "circular" || el.subtipo === "pilar_circular") {
      v = Math.PI * (a / 2) * (a / 2) * alto; // diámetro = seccionAncho
    } else {
      v = a * h * alto;
    }
  } else if (tipo === "muro") {
    const alto = g.alto || 3;
    const espesor = g.espesorMuro || 0.20;
    const longTotal = g.lados.reduce((s, l) => s + l.longitud, 0);
    v = longTotal * alto * espesor;
  } else if (tipo === "escalera") {
    const desarrollo = g.lados[0]?.longitud || 4.5;
    const ancho = g.lados[1]?.longitud || 1.2;
    const canto = g.cantoLosa || 0.20;
    v = desarrollo * ancho * canto;
  }

  return +(v * cantidad).toFixed(3);
}

/** Volumen total de hormigón del proyecto (m³). */
export function calcularVolumenProyecto(elementos: ElementoEstructural[]): number {
  let total = 0;
  for (const el of elementos) {
    total += calcularVolumenElemento(el);
  }
  return +total.toFixed(2);
}

/** Volumen agrupado por subtipo, para mostrar en el resumen. */
export function volumenPorSubtipo(elementos: ElementoEstructural[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const el of elementos) {
    const v = calcularVolumenElemento(el);
    if (v <= 0) continue;
    const k = el.subtipo || el.categoria || "otros";
    m.set(k, +((m.get(k) || 0) + v).toFixed(3));
  }
  return m;
}
