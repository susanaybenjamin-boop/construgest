"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import {
  Proyecto,
  ResultadoDespieceExtendido,
  PESO_POR_METRO,
  GeometriaElemento,
  CategoriaElemento,
  CATEGORIAS_INFO,
} from "@/lib/ferrapp/types";
import { getTipoGeometria, resolverEtiquetaLado } from "@/lib/ferrapp/generadores";
import { calcularVolumenProyecto, calcularVolumenElemento } from "@/lib/ferrapp/hormigon";
import { resumirMallazoProyecto, calcularMallazoElemento } from "@/lib/ferrapp/mallazo";

interface ResumenImpresionProps {
  proyecto: Proyecto;
  resultados: Map<string, ResultadoDespieceExtendido>;
  longitudBarraComercial: number;
}

// ============================================================
// SVG GEOMETRY DIAGRAMS
// ============================================================

function letraLado(i: number, lado?: { etiqueta?: string }): string {
  if (lado?.etiqueta) return lado.etiqueta;
  return String.fromCharCode(97 + i);
}

function generarSVGGeometria(
  g: GeometriaElemento,
  categoria: CategoriaElemento,
  subtipo?: string
): string {
  const tipo = getTipoGeometria(categoria, subtipo);

  const lbl = (i: number) => letraLado(i, g.lados[i]);

  // Superficie rectangular
  if (tipo === "superficie" && g.forma === "rectangular") {
    const a = g.lados[0]?.longitud || 5;
    const b = g.lados[1]?.longitud || 5;
    const scX = 150 / a, scY = 100 / b;
    const huecosHtml = g.huecos && g.huecos.length > 0 ? g.huecos.map((h) => {
      const hx = h.x ?? a / 2;
      const hy = h.y ?? b / 2;
      const hw = h.largo * scX, hh = h.ancho * scY;
      const sx = 35 + hx * scX - hw / 2;
      const sy = 30 + (b - hy) * scY - hh / 2;
      return `<rect x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" width="${hw.toFixed(1)}" height="${hh.toFixed(1)}" fill="none" stroke="#999" stroke-dasharray="3,2"/>
        <text x="${(sx + hw / 2).toFixed(1)}" y="${(sy + hh / 2 + 3).toFixed(1)}" text-anchor="middle" font-size="7" fill="#999">${h.nombre}</text>`;
    }).join("") : "";
    const rectCorners = [
      { x: 35, y: 30, n: 1 },
      { x: 185, y: 30, n: 2 },
      { x: 185, y: 130, n: 3 },
      { x: 35, y: 130, n: 4 },
    ];
    const cornersSvg = rectCorners.map(c =>
      `<circle cx="${c.x}" cy="${c.y}" r="6" fill="#333" stroke="#b45309" stroke-width="1"/>
       <text x="${c.x}" y="${c.y + 3}" text-anchor="middle" font-size="7" font-weight="bold" fill="#b45309">${c.n}</text>`
    ).join("\n      ");
    return `<svg viewBox="0 0 220 160" width="280" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect x="35" y="30" width="150" height="100" fill="#f8f8f8" stroke="#333" stroke-width="1.5"/>
      <text x="110" y="22" text-anchor="middle" font-size="11" font-weight="bold" fill="#b45309">${lbl(0)} = ${a}m</text>
      <text x="195" y="82" text-anchor="start" font-size="11" font-weight="bold" fill="#b45309">${lbl(1)} = ${b}m</text>
      ${huecosHtml}
      ${cornersSvg}
    </svg>`;
  }

  // Superficie L (6 lados perimetrales)
  if (tipo === "superficie" && g.forma === "l" && g.lados.length >= 6) {
    const dims = g.lados.map(l => l.longitud);
    const [la, lb, , ld, le] = dims;
    const totalW = la, totalH = lb + ld;
    const scale = Math.min(150 / totalW, 110 / totalH);
    const ox = 35, oy = 25;
    const w = totalW * scale, h = totalH * scale;
    const bh = lb * scale;
    const ew = le * scale;
    const dh = ld * scale;

    const pts = [
      [ox, oy], [ox + w, oy], [ox + w, oy + bh],
      [ox + ew, oy + bh], [ox + ew, oy + h],
      [ox, oy + h]
    ];
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";

    const labels = [
      { x: ox + w / 2, y: oy - 6, text: `${lbl(0)}=${la}m`, anchor: "middle" },
      { x: ox + w + 6, y: oy + bh / 2, text: `${lbl(1)}=${lb}m`, anchor: "start" },
      { x: (ox + w + ox + ew) / 2, y: oy + bh + 10, text: `${lbl(2)}=${+(la - le).toFixed(1)}m`, anchor: "middle" },
      { x: ox + ew + 6, y: oy + bh + dh / 2, text: `${lbl(3)}=${ld}m`, anchor: "start" },
      { x: ox + ew / 2, y: oy + h + 12, text: `${lbl(4)}=${le}m`, anchor: "middle" },
      { x: ox - 6, y: oy + h / 2, text: `${lbl(5)}=${+(lb + ld).toFixed(1)}m`, anchor: "end" },
    ];

    const cornersSvg = pts.map((p, i) =>
      `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="6" fill="#333" stroke="#b45309" stroke-width="1"/>
       <text x="${p[0].toFixed(1)}" y="${(p[1] + 3).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="bold" fill="#b45309">${i + 1}</text>`
    ).join("\n      ");
    return `<svg viewBox="0 0 220 160" width="280" height="200" xmlns="http://www.w3.org/2000/svg">
      <path d="${path}" fill="#f8f8f8" stroke="#333" stroke-width="1.5"/>
      <line x1="${ox}" y1="${(oy + bh).toFixed(1)}" x2="${(ox + ew).toFixed(1)}" y2="${(oy + bh).toFixed(1)}" stroke="#333" stroke-width="0.5" stroke-dasharray="3,2" opacity="0.3"/>
      ${labels.map(l => `<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="${l.anchor}" font-size="9" font-weight="bold" fill="#b45309">${l.text}</text>`).join("\n      ")}
      ${cornersSvg}
    </svg>`;
  }

  // Superficie U (3 zonas)
  if (tipo === "superficie" && g.forma === "u" && g.lados.length >= 6) {
    const alaIzqL = g.lados[0]?.longitud || 5;
    const alaIzqA = g.lados[1]?.longitud || 2;
    const centroL = g.lados[2]?.longitud || 10;
    const centroA = g.lados[3]?.longitud || 3;
    const alaDerL = g.lados[4]?.longitud || 5;
    const alaDerA = g.lados[5]?.longitud || 2;

    const totalW = centroL;
    const totalH = Math.max(alaIzqL, alaDerL);
    const scale = Math.min(150 / totalW, 110 / totalH);
    const ox = 35, oy = 20;
    const w = totalW * scale, h = totalH * scale;
    const lw = alaIzqA * scale;
    const rw = alaDerA * scale;
    const bh = centroA * scale;

    const pts = [
      [ox, oy], [ox + lw, oy], [ox + lw, oy + h - bh],
      [ox + w - rw, oy + h - bh], [ox + w - rw, oy],
      [ox + w, oy], [ox + w, oy + h], [ox, oy + h]
    ];
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";

    const cornersSvg = pts.map((p, i) =>
      `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="6" fill="#333" stroke="#b45309" stroke-width="1"/>
       <text x="${p[0].toFixed(1)}" y="${(p[1] + 3).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="bold" fill="#b45309">${i + 1}</text>`
    ).join("\n      ");
    return `<svg viewBox="0 0 220 160" width="280" height="200" xmlns="http://www.w3.org/2000/svg">
      <path d="${path}" fill="#f8f8f8" stroke="#333" stroke-width="1.5"/>
      <text x="${ox - 4}" y="${oy + h / 2}" text-anchor="end" font-size="9" font-weight="bold" fill="#b45309">${lbl(0)}=${alaIzqL}m</text>
      <text x="${ox + lw / 2}" y="${oy - 4}" text-anchor="middle" font-size="9" font-weight="bold" fill="#b45309">${lbl(1)}=${alaIzqA}m</text>
      <text x="${ox + w / 2}" y="${oy + h + 12}" text-anchor="middle" font-size="9" font-weight="bold" fill="#b45309">${lbl(2)}=${centroL}m</text>
      <text x="${ox + w / 2}" y="${oy + h - bh - 4}" text-anchor="middle" font-size="9" font-weight="bold" fill="#b45309">${lbl(3)}=${centroA}m</text>
      <text x="${ox + w + 4}" y="${oy + h / 2}" text-anchor="start" font-size="9" font-weight="bold" fill="#b45309">${lbl(4)}=${alaDerL}m</text>
      <text x="${ox + w - rw / 2}" y="${oy - 4}" text-anchor="middle" font-size="9" font-weight="bold" fill="#b45309">${lbl(5)}=${alaDerA}m</text>
      ${cornersSvg}
    </svg>`;
  }

  // Muro recto
  if (tipo === "muro" && (g.forma === "recto" || g.lados.length === 1)) {
    const a = g.lados[0]?.longitud || 5;
    const alto = g.alto || 3;
    return `<svg viewBox="0 0 220 120" width="280" height="140" xmlns="http://www.w3.org/2000/svg">
      <rect x="30" y="30" width="160" height="60" fill="#f8f8f8" stroke="#333" stroke-width="1.5"/>
      <text x="110" y="22" text-anchor="middle" font-size="11" font-weight="bold" fill="#b45309">${lbl(0)} = ${a}m</text>
      <text x="200" y="62" text-anchor="start" font-size="10" fill="#666">h = ${alto}m</text>
    </svg>`;
  }

  // Muro L
  if (tipo === "muro" && g.forma === "l" && g.lados.length >= 2) {
    const a = g.lados[0]?.longitud || 5;
    const b = g.lados[1]?.longitud || 5;
    return `<svg viewBox="0 0 220 140" width="280" height="170" xmlns="http://www.w3.org/2000/svg">
      <polyline points="30,30 30,110 150,110" fill="none" stroke="#333" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="18" y="70" text-anchor="end" font-size="11" font-weight="bold" fill="#b45309">${lbl(0)}=${a}m</text>
      <text x="90" y="128" text-anchor="middle" font-size="11" font-weight="bold" fill="#b45309">${lbl(1)}=${b}m</text>
      ${g.alto ? `<text x="160" y="110" font-size="10" fill="#666">h=${g.alto}m</text>` : ""}
    </svg>`;
  }

  // Muro U
  if (tipo === "muro" && g.forma === "u" && g.lados.length >= 3) {
    const a = g.lados[0]?.longitud || 5;
    const b = g.lados[1]?.longitud || 5;
    const c = g.lados[2]?.longitud || 5;
    return `<svg viewBox="0 0 220 140" width="280" height="170" xmlns="http://www.w3.org/2000/svg">
      <polyline points="30,30 30,110 170,110 170,30" fill="none" stroke="#333" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="18" y="72" text-anchor="end" font-size="10" font-weight="bold" fill="#b45309">${lbl(0)}=${a}m</text>
      <text x="100" y="128" text-anchor="middle" font-size="10" font-weight="bold" fill="#b45309">${lbl(1)}=${b}m</text>
      <text x="182" y="72" text-anchor="start" font-size="10" font-weight="bold" fill="#b45309">${lbl(2)}=${c}m</text>
      ${g.alto ? `<text x="100" y="22" text-anchor="middle" font-size="10" fill="#666">h=${g.alto}m</text>` : ""}
    </svg>`;
  }

  // Muro cerrado
  if (tipo === "muro" && g.forma === "cerrado" && g.lados.length >= 4) {
    return `<svg viewBox="0 0 220 160" width="280" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect x="35" y="30" width="150" height="100" fill="none" stroke="#333" stroke-width="6" rx="2"/>
      ${g.lados.slice(0, 4).map((l, i) => {
        const positions = [
          { x: 110, y: 20, anchor: "middle" },
          { x: 196, y: 82, anchor: "start" },
          { x: 110, y: 145, anchor: "middle" },
          { x: 24, y: 82, anchor: "end" },
        ];
        const p = positions[i];
        return `<text x="${p.x}" y="${p.y}" text-anchor="${p.anchor}" font-size="10" font-weight="bold" fill="#b45309">${lbl(i)}=${l.longitud}m</text>`;
      }).join("\n      ")}
      ${g.alto ? `<text x="110" y="85" text-anchor="middle" font-size="10" fill="#666">h=${g.alto}m</text>` : ""}
    </svg>`;
  }

  // Pilar
  if (tipo === "pilar") {
    const sw = g.seccionAncho || 0.30;
    const sh = g.seccionAlto || 0.30;
    const alto = g.alto || 3;
    return `<svg viewBox="0 0 220 140" width="280" height="170" xmlns="http://www.w3.org/2000/svg">
      <rect x="60" y="30" width="100" height="80" fill="#f8f8f8" stroke="#333" stroke-width="1.5"/>
      <text x="110" y="22" text-anchor="middle" font-size="10" font-weight="bold" fill="#b45309">${sw}m</text>
      <text x="170" y="72" text-anchor="start" font-size="10" font-weight="bold" fill="#b45309">${sh}m</text>
      <text x="110" y="128" text-anchor="middle" font-size="10" fill="#666">Alto: ${alto}m</text>
    </svg>`;
  }

  // Lineal (viga/zuncho)
  if (tipo === "lineal") {
    const a = g.lados[0]?.longitud || 5;
    const sw = g.seccionAncho || 0.30;
    const sh = g.seccionAlto || 0.30;
    return `<svg viewBox="0 0 220 100" width="280" height="110" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="30" width="180" height="30" fill="#f8f8f8" stroke="#333" stroke-width="1.5"/>
      <text x="110" y="22" text-anchor="middle" font-size="11" font-weight="bold" fill="#b45309">${lbl(0)} = ${a}m</text>
      <text x="110" y="80" text-anchor="middle" font-size="9" fill="#666">Seccion: ${sw} × ${sh}m</text>
    </svg>`;
  }

  // Escalera
  if (tipo === "escalera") {
    const a = g.lados[0]?.longitud || 4;
    const b = g.lados[1]?.longitud || 1.2;
    return `<svg viewBox="0 0 220 140" width="280" height="170" xmlns="http://www.w3.org/2000/svg">
      <polygon points="30,110 180,30 195,38 45,118" fill="#f8f8f8" stroke="#333" stroke-width="1.5"/>
      <text x="105" y="55" text-anchor="middle" font-size="11" font-weight="bold" fill="#b45309" transform="rotate(-25,105,55)">${lbl(0)} = ${a}m</text>
      <text x="195" y="22" text-anchor="start" font-size="11" font-weight="bold" fill="#b45309">${lbl(1)} = ${b}m</text>
    </svg>`;
  }

  // Polígono libre con vértices
  if (tipo === "superficie" && g.forma === "poligono" && g.vertices && g.vertices.length >= 3) {
    const verts = g.vertices;
    const xs = verts.map(v => v.x), ys = verts.map(v => v.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
    const svgW = 200, svgH = 150, pad = 25;
    const drawW = svgW - pad * 2, drawH = svgH - pad * 2;
    const sc = Math.min(drawW / rangeX, drawH / rangeY);
    const offX = pad + (drawW - rangeX * sc) / 2;
    const offY = pad + (drawH - rangeY * sc) / 2;
    const toSx = (v: { x: number; y: number }) => offX + (v.x - minX) * sc;
    const toSy = (v: { x: number; y: number }) => offY + (rangeY - (v.y - minY)) * sc;

    const polyPts = verts.map(v => `${toSx(v).toFixed(1)},${toSy(v).toFixed(1)}`).join(" ");

    // Side labels
    const sideLabels = g.lados.map((l, i) => {
      const from = verts[i], to = verts[(i + 1) % verts.length];
      const mx = (toSx(from) + toSx(to)) / 2;
      const my = (toSy(from) + toSy(to)) / 2;
      const dx = toSx(to) - toSx(from), dy = toSy(to) - toSy(from);
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len * 10, ny = dx / len * 10;
      return `<text x="${(mx + nx).toFixed(1)}" y="${(my + ny).toFixed(1)}" text-anchor="middle" font-size="7" fill="#475569" dominant-baseline="central">${lbl(i)}=${l.longitud.toFixed(2)}m</text>`;
    }).join("\n    ");

    // Vertex numbers
    const vertLabels = verts.map((v, i) => {
      return `<circle cx="${toSx(v).toFixed(1)}" cy="${toSy(v).toFixed(1)}" r="2" fill="#b45309"/>
      <text x="${toSx(v).toFixed(1)}" y="${(toSy(v) - 5).toFixed(1)}" text-anchor="middle" font-size="6" font-weight="bold" fill="#b45309">${i + 1}</text>`;
    }).join("\n    ");

    return `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${polyPts}" fill="rgba(180,83,9,0.05)" stroke="#b45309" stroke-width="1.5"/>
    ${sideLabels}
    ${vertLabels}
    <text x="${svgW / 2}" y="${svgH - 3}" text-anchor="middle" font-size="7" fill="#64748b">Envolvente: ${rangeX.toFixed(2)} × ${rangeY.toFixed(2)}m — Área: ${(g.areaAproximada || 0).toFixed(1)}m²</text>
  </svg>`;
  }

  // Fallback genérico
  return `<svg viewBox="0 0 220 80" width="200" height="60" xmlns="http://www.w3.org/2000/svg">
    ${g.lados.map((l, i) => `<text x="10" y="${16 + i * 14}" font-size="10" font-weight="bold" fill="#b45309">${lbl(i)} = ${l.longitud}m (${l.nombre})</text>`).join("\n    ")}
  </svg>`;
}


// ============================================================
// HTML GENERATION (shared for preview + print)
// ============================================================

function generarHTML(
  proyecto: Proyecto,
  resultados: Map<string, ResultadoDespieceExtendido>,
  longitudBarraComercial: number,
  orientacion: "portrait" | "landscape" = "portrait"
): string {
  const fecha = new Date().toLocaleDateString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  // ── Datos globales (soporta mezcla de barras 6m y 12m) ──
  let barrasTotal = 0, pesoTotal = 0, desperdicioTotal = 0, metrosCompra = 0;
  let sobrantesDisponibles = 0, barrasAhorradas = 0;
  const materialGlobal = new Map<number, { barrasPorLong: Map<number, number>; peso: number }>();
  const longitudesUsadas = new Set<number>();

  for (const [, res] of resultados) {
    for (const r of res.resultadosPorDiametro) {
      const prev = materialGlobal.get(r.diametro) || { barrasPorLong: new Map(), peso: 0 };
      prev.peso += r.pesoKg;
      for (const bc of r.barrasComerciales) {
        if (bc.id > 0) {
          metrosCompra += bc.longitudTotal;
          prev.barrasPorLong.set(bc.longitudTotal, (prev.barrasPorLong.get(bc.longitudTotal) || 0) + 1);
          longitudesUsadas.add(bc.longitudTotal);
          barrasTotal++;
        }
      }
      materialGlobal.set(r.diametro, prev);
    }
    pesoTotal += res.pesoTotal;
    desperdicioTotal += res.desperdicioTotal;
    sobrantesDisponibles += res.sobrantesNuevos.filter(s => !s.usado).length;
    barrasAhorradas += res.barrasComercialAhorradas;
  }
  const despPct = metrosCompra > 0 ? ((desperdicioTotal / metrosCompra) * 100).toFixed(1) : "0";
  const matSorted = [...materialGlobal.entries()].sort((a, b) => a[0] - b[0]);
  const longsSorted = [...longitudesUsadas].sort((a, b) => b - a); // ej: [12, 6]
  const hayMezcla = longsSorted.length > 1;

  // Hormigón y mallazo a nivel proyecto
  const volumenHormigon = calcularVolumenProyecto(proyecto.elementos);
  const resumenMallazo = resumirMallazoProyecto(proyecto.elementos);

  // ── CSS (pantalla + impresion) ──
  const css = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-size: 10px; color: #000; }

@media screen {
  body { background: #d1d5db; padding: 20px 12px; }
  .page {
    background: white;
    max-width: ${orientacion === "landscape" ? "1080px" : "780px"};
    margin: 0 auto 20px auto;
    padding: 24px 28px;
    border-radius: 6px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.18);
  }
}
@media print {
  body { background: white; padding: 0; }
  .page { box-shadow: none; margin: 0; border-radius: 0; padding: 0; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  @page { margin: 8mm; size: A4 ${orientacion}; }
}

h1 { font-size: 16px; margin-bottom: 2px; }
h2 { font-size: 13px; margin: 10px 0 5px; border-bottom: 2px solid #000; padding-bottom: 2px; }
h3 { font-size: 11px; margin: 6px 0 3px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
.header-right { text-align: right; font-size: 9px; color: #555; }
.stats { display: flex; gap: 10px; margin: 8px 0; }
.stat { background: #f0f0f0; padding: 5px 10px; border-radius: 3px; text-align: center; flex: 1; }
.stat-val { font-size: 15px; font-weight: bold; }
.stat-lbl { font-size: 8px; color: #666; }
table { border-collapse: collapse; width: 100%; margin: 4px 0; }
th, td { border: 1px solid #ccc; padding: ${orientacion === "landscape" ? "3px 6px" : "2px 5px"}; font-size: ${orientacion === "landscape" ? "10px" : "9px"}; }
th { background: #333; color: #fff; font-size: ${orientacion === "landscape" ? "9px" : "8px"}; text-transform: uppercase; }
td { text-align: center; }
td:first-child { text-align: left; }
.mat-table th, .mat-table td { padding: 3px 8px; }
.element-content { display: flex; gap: 12px; margin-top: 6px; }
.element-left { width: ${orientacion === "landscape" ? "38%" : "46%"}; }
.element-right { width: ${orientacion === "landscape" ? "62%" : "54%"}; }
.element-left svg { width: 100%; height: auto; max-height: 220px; }
.geo-info { font-size: 9px; margin-top: 6px; }
.geo-info div { margin: 1px 0; }
.geo-info .label { color: #666; }
.geo-info .amber { color: #b45309; font-weight: bold; }
.barras-table { margin-top: 6px; }
.barras-table td, .barras-table th { font-size: ${orientacion === "landscape" ? "9px" : "8px"}; padding: ${orientacion === "landscape" ? "2px 5px" : "1px 4px"}; }
.footer { margin-top: 10px; padding-top: 5px; border-top: 1px solid #ccc; font-size: 8px; color: #888; display: flex; justify-content: space-between; }
.green { color: #16a34a; }
.amber { color: #b45309; }
.red { color: #dc2626; }
`;

  // ── PÁGINA 1: RESUMEN GLOBAL ──
  let html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Resumen - ${proyecto.nombre}</title><style>${css}</style></head><body>
<div class="page">
<div class="header">
  <div>
    <h1>RESUMEN DE FERRALLA</h1>
    <div style="font-size:12px;margin-top:2px;"><strong>${proyecto.nombre}</strong></div>
  </div>
  <div class="header-right">
    <div>Fecha: ${fecha}</div>
    <div>Barras: ${longsSorted.map(l => l + "m").join(" + ")}</div>
    <div>Elementos: ${proyecto.elementos.length}</div>
    <div>FERRAPP v1.0</div>
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-val">${barrasTotal}</div><div class="stat-lbl">${hayMezcla
    ? longsSorted.map(l => { let c = 0; for (const [, v] of materialGlobal) c += (v.barrasPorLong.get(l) || 0); return c + "&times;" + l + "m"; }).join(" + ")
    : "BARRAS " + longsSorted[0] + "m"}</div></div>
  <div class="stat"><div class="stat-val">${pesoTotal.toFixed(0)} kg</div><div class="stat-lbl">PESO ACERO</div></div>
  <div class="stat"><div class="stat-val">${volumenHormigon.toFixed(2)} m&sup3;</div><div class="stat-lbl">HORMIG&Oacute;N</div></div>
  ${resumenMallazo.panelesTotal > 0 ? `<div class="stat"><div class="stat-val">${resumenMallazo.panelesTotal}</div><div class="stat-lbl">PANELES MALLAZO</div></div>` : ""}
  <div class="stat"><div class="stat-val">${despPct}%</div><div class="stat-lbl">DESPERDICIO</div></div>
  <div class="stat"><div class="stat-val">${sobrantesDisponibles}</div><div class="stat-lbl">SOBRANTES</div></div>
</div>
${resumenMallazo.panelesTotal > 0 ? `
<h2>MALLAZO ELECTROSOLDADO</h2>
<table class="mat-table">
  <thead><tr><th>Referencia</th><th>Paneles 6&times;2.2</th><th>m&sup2; comprados</th><th>kg</th></tr></thead>
  <tbody>
    ${[...resumenMallazo.porRef.entries()].map(([ref, v]) =>
      `<tr><td style="text-align:left;font-weight:bold">${ref}</td><td><strong>${v.paneles}</strong></td><td>${v.m2.toFixed(1)}</td><td>${v.pesoKg.toFixed(0)}</td></tr>`
    ).join("")}
    <tr><td style="font-weight:bold">TOTAL</td><td><strong>${resumenMallazo.panelesTotal}</strong></td><td>-</td><td><strong>${resumenMallazo.pesoTotalKg.toFixed(0)}</strong> kg</td></tr>
  </tbody>
</table>` : ""}

<h2>MATERIAL A COMPRAR</h2>
<table class="mat-table">
  <thead><tr>
    <th></th>
    ${matSorted.map(([d]) => `<th>&oslash;${d}</th>`).join("")}
    <th>TOTAL</th>
  </tr></thead>
  <tbody>
    ${longsSorted.map(L => {
      let totalL = 0;
      const cells = matSorted.map(([, v]) => {
        const cnt = v.barrasPorLong.get(L) || 0;
        totalL += cnt;
        return `<td>${cnt > 0 ? `<strong>${cnt}</strong> barras` : "-"}</td>`;
      }).join("");
      return `<tr><td style="font-weight:bold">${L}m</td>${cells}<td><strong>${totalL}</strong> barras</td></tr>`;
    }).join("")}
    <tr><td style="font-weight:bold">Peso</td>${matSorted.map(([, v]) => `<td>${v.peso.toFixed(0)} kg</td>`).join("")}<td><strong>${pesoTotal.toFixed(0)}</strong> kg</td></tr>
  </tbody>
</table>

<h2>RECUENTO TOTAL DE PIEZAS A CORTAR</h2>`;

  // Recuento global
  {
    const globalCuts = new Map<number, Map<string, { longitud: number; count: number }>>();
    for (const [, res] of resultados) {
      for (const r of res.resultadosPorDiametro) {
        if (!globalCuts.has(r.diametro)) globalCuts.set(r.diametro, new Map());
        const dMap = globalCuts.get(r.diametro)!;
        for (const bc of r.barrasComerciales) {
          for (const c of bc.cortes) {
            const key = c.longitud.toFixed(2);
            const prev = dMap.get(key);
            if (prev) { prev.count++; }
            else { dMap.set(key, { longitud: c.longitud, count: 1 }); }
          }
        }
      }
    }
    const diametros = [...globalCuts.keys()].sort((a, b) => a - b);
    html += `<table class="mat-table"><thead><tr>
      <th>Diametro</th><th>Cant.</th><th>Medida</th>
    </tr></thead><tbody>`;
    for (const d of diametros) {
      const cuts = [...globalCuts.get(d)!.values()].sort((a, b) => b.longitud - a.longitud);
      const matD = materialGlobal.get(d);
      let barrasCompra = 0;
      if (matD) for (const c of matD.barrasPorLong.values()) barrasCompra += c;
      html += `<tr style="border-top:2px solid #333;">
        <td rowspan="${cuts.length}" style="font-weight:bold;vertical-align:top;background:#f5f5f5">&oslash;${d}mm<br><small style="color:#666">${barrasCompra} barras</small></td>
        <td style="font-weight:bold">${cuts[0].count}</td>
        <td style="text-align:left">&oslash;${d} a ${cuts[0].longitud.toFixed(2)}m</td>
      </tr>`;
      for (let i = 1; i < cuts.length; i++) {
        html += `<tr>
          <td style="font-weight:bold">${cuts[i].count}</td>
          <td style="text-align:left">&oslash;${d} a ${cuts[i].longitud.toFixed(2)}m</td>
        </tr>`;
      }
    }
    html += `</tbody></table>`;
  }

  html += `
<h2>DESGLOSE POR ELEMENTO</h2>
<table>
  <thead><tr>
    <th style="width:30px">#</th><th style="text-align:left">Elemento</th><th>Categoria</th>
    <th>Barras</th><th>Peso (kg)</th><th>Hormig&oacute;n m&sup3;</th><th>Mallazo</th><th>Desperdicio</th>
  </tr></thead>
  <tbody>`;

  proyecto.elementos.forEach((el, idx) => {
    const res = resultados.get(el.id);
    const vol = calcularVolumenElemento(el);
    const mall = calcularMallazoElemento(el);
    const mallTxt = mall ? `${mall.panelesTotal}×${mall.ref}` : "-";
    if (!res) {
      html += `<tr><td>${idx + 1}</td><td style="text-align:left">${el.nombre}</td><td colspan="2" style="color:#999">No calculado</td><td>-</td><td>${vol > 0 ? vol.toFixed(2) : "-"}</td><td>${mallTxt}</td><td>-</td></tr>`;
      return;
    }
    const b = res.resultadosPorDiametro.reduce((s, r) => s + r.totalBarrasComerciales, 0);
    const mc = res.resultadosPorDiametro.reduce(
      (s, r) => s + r.barrasComerciales.filter(bc => bc.id > 0).reduce((sum, bc) => sum + bc.longitudTotal, 0), 0
    );
    const pct = mc > 0 ? ((res.desperdicioTotal / mc) * 100).toFixed(1) : "0";
    const catNombre = el.categoria ? CATEGORIAS_INFO[el.categoria]?.nombre || el.categoria : "-";
    const pctClass = Number(pct) < 5 ? "green" : Number(pct) < 15 ? "amber" : "red";
    html += `<tr>
      <td>${idx + 1}</td>
      <td style="text-align:left;font-weight:bold">${el.nombre}</td>
      <td>${catNombre}${el.subtipo ? `<br><small>${el.subtipo.replace(/_/g, " ")}</small>` : ""}</td>
      <td>${b}</td>
      <td>${res.pesoTotal.toFixed(0)}</td>
      <td>${vol > 0 ? vol.toFixed(2) : "-"}</td>
      <td>${mallTxt}</td>
      <td class="${pctClass}">${pct}%</td>
    </tr>`;
  });

  html += `</tbody></table>
<div class="footer"><span>FERRAPP &mdash; ${proyecto.nombre}</span><span>${fecha}</span></div>
</div>`;

  // ── PÁGINAS POR ELEMENTO ──
  const totalPages = 1 + proyecto.elementos.filter(el => resultados.has(el.id)).length;

  let pageNum = 1;
  for (const el of proyecto.elementos) {
    const res = resultados.get(el.id);
    if (!res) continue;
    pageNum++;

    const catNombre = el.categoria ? CATEGORIAS_INFO[el.categoria]?.nombre || el.categoria : "-";
    const subLabel = el.subtipo ? el.subtipo.replace(/_/g, " ") : "";

    const svgDiagram = el.geometria
      ? generarSVGGeometria(el.geometria, el.categoria || "libre", el.subtipo)
      : '<div style="color:#999;font-size:10px;">Sin geometria</div>';

    let geoMeta = "";
    if (el.geometria) {
      const g = el.geometria;
      const tipoGeo = getTipoGeometria(el.categoria || "libre", el.subtipo);
      const showCorners = tipoGeo === "superficie" && ["rectangular", "l", "u", "poligono"].includes(g.forma);
      const numCorners = g.forma === "rectangular" ? 4 : g.forma === "l" ? 6 : g.forma === "u" ? 8 : g.forma === "poligono" ? (g.vertices?.length || 0) : 0;
      geoMeta += `<div><span class="label">Forma:</span> ${g.forma}${showCorners ? ` — ${numCorners} vértices` : ""}</div>`;
      geoMeta += `<div><span class="label">Lados:</span> ${g.lados.map((l, i) => {
        const from = i + 1;
        const to = g.forma === "poligono"
          ? (i + 1) % (g.vertices?.length || g.lados.length) + 1
          : (g.forma === "l" && i === g.lados.length - 1) ? 1 : i + 2;
        const cRef = showCorners ? ` (${from}→${to})` : "";
        return `<span class="amber">${letraLado(i, l)}</span>=${l.longitud.toFixed(2)}m${cRef}`;
      }).join(", ")}</div>`;
      if (g.forma === "poligono" && g.dimensionX) {
        geoMeta += `<div><span class="label">Envolvente:</span> ${(g.dimensionX).toFixed(2)} &times; ${(g.dimensionY || 0).toFixed(2)}m — Área: ${(g.areaAproximada || 0).toFixed(1)}m²</div>`;
      }
      if (g.alto) geoMeta += `<div><span class="label">Alto:</span> ${g.alto}m</div>`;
      if (g.seccionAncho && g.seccionAlto) geoMeta += `<div><span class="label">Seccion:</span> ${g.seccionAncho}&times;${g.seccionAlto}m</div>`;
      geoMeta += `<div><span class="label">Separacion:</span> ${Math.round((g.espaciado || 0.20) * 100)}cm</div>`;
      if (g.anchoZuncho) geoMeta += `<div><span class="label">Zuncho:</span> ${Math.round(g.anchoZuncho * 100)}cm</div>`;
      if (g.huecos && g.huecos.length > 0) {
        geoMeta += `<div><span class="label">Huecos:</span> ${g.huecos.map(h => {
          const pos = (h.x !== undefined && h.y !== undefined) ? ` @(${h.x},${h.y})` : "";
          return `${h.nombre} ${h.largo}&times;${h.ancho}m${pos}`;
        }).join(", ")}</div>`;
      }
    }

    let diaTable = `<table><thead><tr><th>&oslash;</th><th>Barras</th><th>Piezas</th><th>Peso (kg)</th><th>Desp.</th></tr></thead><tbody>`;
    let elBarrasTotal = 0, elPesoTotal = 0;
    for (const r of res.resultadosPorDiametro) {
      elBarrasTotal += r.totalBarrasComerciales;
      elPesoTotal += r.pesoKg;
      diaTable += `<tr>
        <td>&oslash;${r.diametro}</td>
        <td>${r.totalBarrasComerciales}</td>
        <td>${r.totalPiezas}</td>
        <td>${r.pesoKg.toFixed(1)}</td>
        <td>${r.porcentajeDesperdicio}%</td>
      </tr>`;
    }
    diaTable += `<tr style="font-weight:bold;border-top:2px solid #333;">
      <td>Total</td><td>${elBarrasTotal}</td><td>${res.resultadosPorDiametro.reduce((s, r) => s + r.totalPiezas, 0)}</td><td>${elPesoTotal.toFixed(0)}</td><td></td>
    </tr></tbody></table>`;

    // Material por elemento: agrupar barras por (diametro, longitud)
    const elBarrasPorLong = new Map<number, Map<number, number>>();
    for (const r of res.resultadosPorDiametro) {
      const dMap = new Map<number, number>();
      for (const bc of r.barrasComerciales) {
        if (bc.id > 0) dMap.set(bc.longitudTotal, (dMap.get(bc.longitudTotal) || 0) + 1);
      }
      elBarrasPorLong.set(r.diametro, dMap);
    }
    const elLongs = [...new Set(Array.from(elBarrasPorLong.values()).flatMap(m => [...m.keys()]))].sort((a, b) => b - a);

    let matEl = `<table class="mat-table"><thead><tr><th>&oslash;</th>${elLongs.map(L => `<th>Barras ${L}m</th>`).join("")}<th>Peso (kg)</th></tr></thead><tbody>`;
    for (const r of res.resultadosPorDiametro) {
      const dMap = elBarrasPorLong.get(r.diametro) || new Map();
      let pesoCompra = 0;
      for (const [L, cnt] of dMap) pesoCompra += cnt * L * (PESO_POR_METRO[r.diametro] || 0);
      matEl += `<tr><td>&oslash;${r.diametro}</td>${elLongs.map(L => {
        const cnt = dMap.get(L) || 0;
        return `<td>${cnt > 0 ? cnt : "-"}</td>`;
      }).join("")}<td>${pesoCompra.toFixed(1)}</td></tr>`;
    }
    matEl += `</tbody></table>`;

    let recuento = "";
    for (const r of res.resultadosPorDiametro) {
      const countByLength = new Map<string, { longitud: number; count: number; etiquetas: string[] }>();
      for (const bc of r.barrasComerciales) {
        for (const c of bc.cortes) {
          const key = c.longitud.toFixed(2);
          const prev = countByLength.get(key);
          if (prev) {
            prev.count++;
            if (!prev.etiquetas.includes(c.etiqueta)) prev.etiquetas.push(c.etiqueta);
          } else {
            countByLength.set(key, { longitud: c.longitud, count: 1, etiquetas: [c.etiqueta] });
          }
        }
      }

      const sorted = [...countByLength.values()].sort((a, b) => b.longitud - a.longitud);

      const dMapR = elBarrasPorLong.get(r.diametro) || new Map();
      const barDesc = elLongs.filter(L => (dMapR.get(L) || 0) > 0).map(L => `${dMapR.get(L)} barras de ${L}m`).join(" + ");

      recuento += `<table class="barras-table"><thead><tr>
        <th colspan="3" style="text-align:left;background:#555;">&oslash;${r.diametro}mm &mdash; Comprar ${barDesc} &rarr; ${r.totalPiezas} piezas</th>
      </tr><tr>
        <th style="width:50px">Cant.</th>
        <th style="text-align:left">Medida</th>
        <th style="text-align:left">Descripcion</th>
      </tr></thead><tbody>`;

      for (const item of sorted) {
        recuento += `<tr>
          <td style="text-align:center;font-weight:bold">${item.count}</td>
          <td style="text-align:left;font-weight:bold">&oslash;${r.diametro} a ${item.longitud.toFixed(2)}m</td>
          <td style="text-align:left;color:#888;font-size:8px">${item.etiquetas.join(", ")}</td>
        </tr>`;
      }

      recuento += `</tbody></table>`;
    }

    html += `
<div class="page">
<div class="header">
  <div>
    <h1>${el.nombre}</h1>
    <div style="font-size:11px;color:#555;">${catNombre}${subLabel ? ` &mdash; ${subLabel}` : ""}</div>
  </div>
  <div class="header-right">
    <div>${proyecto.nombre}</div>
    <div>Pag. ${pageNum} de ${totalPages}</div>
  </div>
</div>

<div class="element-content">
  <div class="element-left">
    ${svgDiagram}
    <div class="geo-info">${geoMeta}</div>
  </div>
  <div class="element-right">
    <h3>RESUMEN POR DIAMETRO</h3>
    ${diaTable}
    <h3 style="margin-top:8px;">MATERIAL A COMPRAR</h3>
    ${matEl}
  </div>
</div>

<h3 style="margin-top:8px;">RECUENTO DE PIEZAS A CORTAR</h3>
${recuento}

<div class="footer"><span>FERRAPP &mdash; ${proyecto.nombre} / ${el.nombre}</span><span>${fecha}</span></div>
</div>`;
  }

  html += `</body></html>`;
  return html;
}


// ============================================================
// MAIN COMPONENT — Vista previa + boton imprimir
// ============================================================

export default function ResumenImpresion({
  proyecto,
  resultados,
  longitudBarraComercial,
}: ResumenImpresionProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [orientacion, setOrientacion] = useState<"portrait" | "landscape">("portrait");

  const ajustarAltura = useCallback(() => {
    const body = iframeRef.current?.contentDocument?.body;
    if (body) {
      iframeRef.current!.style.height = body.scrollHeight + 40 + "px";
    }
  }, []);

  useEffect(() => {
    const html = generarHTML(proyecto, resultados, longitudBarraComercial, orientacion);
    const doc = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();

    // Ajustar altura tras renderizar
    const t1 = setTimeout(ajustarAltura, 150);
    const t2 = setTimeout(ajustarAltura, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [proyecto, resultados, longitudBarraComercial, orientacion, ajustarAltura]);

  const imprimir = () => {
    iframeRef.current?.contentWindow?.print();
  };

  return (
    <div className="relative w-full">
      {/* Barra sticky con boton imprimir */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-background/90 backdrop-blur-sm border-b border-border">
        <span className="text-sm text-gray-400">Vista previa del resumen</span>
        <div className="flex items-center gap-3">
          {/* Selector de orientación */}
          <div className="flex items-center bg-gray-800 rounded-lg overflow-hidden border border-gray-600">
            <button
              onClick={() => setOrientacion("portrait")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                orientacion === "portrait"
                  ? "bg-accent text-black"
                  : "text-gray-300 hover:text-white hover:bg-gray-700"
              }`}
              title="Vertical (Portrait)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="14" viewBox="0 0 12 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="1" width="10" height="14" rx="1"/>
              </svg>
              Vertical
            </button>
            <button
              onClick={() => setOrientacion("landscape")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                orientacion === "landscape"
                  ? "bg-accent text-black"
                  : "text-gray-300 hover:text-white hover:bg-gray-700"
              }`}
              title="Horizontal (Landscape)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="1" width="14" height="10" rx="1"/>
              </svg>
              Horizontal
            </button>
          </div>
          {/* Botón imprimir */}
          <button
            onClick={imprimir}
            className="flex items-center gap-2 bg-accent hover:bg-accent-dark text-black font-medium py-2 px-4 rounded-lg text-sm transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Imprimir
          </button>
        </div>
      </div>
      {/* Iframe visible con preview */}
      <iframe
        ref={iframeRef}
        className="w-full border-0"
        style={{ minHeight: "600px" }}
      />
    </div>
  );
}
