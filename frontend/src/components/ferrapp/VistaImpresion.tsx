"use client";

import { ResultadoDespieceExtendido, PESO_POR_METRO, GeometriaElemento, CategoriaElemento } from "@/lib/ferrapp/types";

interface VistaImpresionProps {
  resultado: ResultadoDespieceExtendido;
  longitudBarraComercial: number;
  nombreElemento: string;
  nombreProyecto: string;
  geometria?: GeometriaElemento;
  categoria?: CategoriaElemento;
  subtipo?: string;
}

export default function VistaImpresion({
  resultado,
  longitudBarraComercial,
  nombreElemento,
  nombreProyecto,
  geometria,
  categoria,
  subtipo,
}: VistaImpresionProps) {
  const imprimir = () => {
    const fecha = new Date().toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Generar lista de materiales a comprar
    const materialesCompra: { diametro: number; barras: number; peso: number }[] = [];
    for (const res of resultado.resultadosPorDiametro) {
      materialesCompra.push({
        diametro: res.diametro,
        barras: res.totalBarrasComerciales,
        peso: +(res.totalBarrasComerciales * longitudBarraComercial * (PESO_POR_METRO[res.diametro] || 0)).toFixed(1),
      });
    }

    let html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Despiece - ${nombreElemento} - ${nombreProyecto}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #000; padding: 10mm; }

  @media print {
    body { padding: 5mm; }
    .no-break { page-break-inside: avoid; }
    .page-break { page-break-before: always; }
    @page { margin: 8mm; size: A4 landscape; }
  }

  h1 { font-size: 18px; margin-bottom: 2px; }
  h2 { font-size: 14px; margin: 12px 0 6px; border-bottom: 2px solid #000; padding-bottom: 2px; }
  h3 { font-size: 12px; margin: 8px 0 4px; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
  .header-right { text-align: right; font-size: 10px; color: #555; }

  .geometria { background: #f8f8f8; border: 1px solid #ddd; border-radius: 4px; padding: 6px 10px; margin-bottom: 10px; font-size: 10px; }
  .geometria strong { font-size: 11px; }
  .geometria .geo-row { margin: 2px 0; }
  .geometria .geo-label { color: #666; }
  .geometria .geo-letter { font-weight: bold; color: #b45309; margin-right: 2px; }

  .resumen { display: flex; gap: 20px; margin: 8px 0 12px; }
  .resumen-item { background: #f0f0f0; padding: 6px 12px; border-radius: 4px; text-align: center; }
  .resumen-valor { font-size: 16px; font-weight: bold; }
  .resumen-label { font-size: 9px; color: #555; }

  .materiales { margin-bottom: 12px; }
  .materiales table { border-collapse: collapse; width: auto; }
  .materiales th, .materiales td { border: 1px solid #999; padding: 3px 8px; text-align: center; }
  .materiales th { background: #333; color: #fff; font-size: 10px; }
  .materiales td { font-size: 11px; }

  .barra-visual { display: flex; align-items: center; gap: 4px; margin: 3px 0; }
  .barra-num { width: 30px; text-align: right; font-size: 9px; color: #666; font-weight: bold; }
  .barra-bar { height: 22px; display: flex; border: 1px solid #333; border-radius: 2px; overflow: hidden; flex: 1; }
  .barra-corte { display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: bold; border-right: 1px solid #333; color: #000; }
  .barra-sobrante { display: flex; align-items: center; justify-content: center; font-size: 8px; color: #999; background: repeating-linear-gradient(45deg, #fff, #fff 2px, #eee 2px, #eee 4px); }

  .corte-table { border-collapse: collapse; width: 100%; margin: 4px 0; font-size: 10px; }
  .corte-table th, .corte-table td { border: 1px solid #ccc; padding: 2px 6px; }
  .corte-table th { background: #eee; text-align: left; font-size: 9px; }
  .corte-table td { text-align: center; }
  .corte-table td:first-child { text-align: left; }

  .footer { margin-top: 15px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9px; color: #888; display: flex; justify-content: space-between; }

  .colores { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 3px; vertical-align: middle; }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>DESPIECE DE FERRALLA</h1>
    <div style="font-size: 13px; margin-top: 2px;"><strong>${nombreProyecto}</strong> &mdash; ${nombreElemento}</div>
  </div>
  <div class="header-right">
    <div>Fecha: ${fecha}</div>
    <div>Barra comercial: ${longitudBarraComercial}m</div>
    <div>FERRAPP v1.0</div>
  </div>
</div>

${(() => {
      if (!geometria) return "";
      const g = geometria;
      const letraLado = (i: number) => g.lados[i]?.etiqueta || String.fromCharCode(97 + i);
      let html = `<div class="geometria"><strong>GEOMETRIA</strong>`;
      html += `<div class="geo-row"><span class="geo-label">Forma:</span> ${g.forma}${subtipo ? ` (${subtipo.replace(/_/g, " ")})` : ""}</div>`;
      // Lados con etiquetas custom
      if (g.forma === "poligono" && g.vertices && g.vertices.length >= 3) {
        // Polígono: mostrar como tabla de lados con de→a
        const ladosStr = g.lados.map((l, i) => {
          const from = i + 1;
          const to = (i + 1) % g.vertices!.length + 1;
          return `<span class="geo-letter">${letraLado(i)}</span>${from}&rarr;${to}: ${l.longitud.toFixed(2)}m`;
        }).join(" &mdash; ");
        html += `<div class="geo-row"><span class="geo-label">Lados (${g.lados.length}):</span> ${ladosStr}</div>`;
        html += `<div class="geo-row"><span class="geo-label">Envolvente:</span> ${(g.dimensionX || 0).toFixed(2)} &times; ${(g.dimensionY || 0).toFixed(2)}m &mdash; Área: ${(g.areaAproximada || 0).toFixed(1)}m²</div>`;
        // SVG inline del polígono
        const verts = g.vertices;
        const xs = verts.map(v => v.x), ys = verts.map(v => v.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
        const svgW = 250, svgH = 180, pad = 30;
        const drawW = svgW - pad * 2, drawH = svgH - pad * 2;
        const sc = Math.min(drawW / rangeX, drawH / rangeY);
        const oX = pad + (drawW - rangeX * sc) / 2, oY = pad + (drawH - rangeY * sc) / 2;
        const toSx = (v: { x: number; y: number }) => oX + (v.x - minX) * sc;
        const toSy = (v: { x: number; y: number }) => oY + (rangeY - (v.y - minY)) * sc;
        const polyPts = verts.map(v => `${toSx(v).toFixed(1)},${toSy(v).toFixed(1)}`).join(" ");
        const sLabels = g.lados.map((l, i) => {
          const from = verts[i], to = verts[(i + 1) % verts.length];
          const mx = (toSx(from) + toSx(to)) / 2, my = (toSy(from) + toSy(to)) / 2;
          const dx = toSx(to) - toSx(from), dy = toSy(to) - toSy(from);
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len * 12, ny = dx / len * 12;
          return `<text x="${(mx + nx).toFixed(1)}" y="${(my + ny).toFixed(1)}" text-anchor="middle" font-size="8" fill="#475569">${letraLado(i)}=${l.longitud.toFixed(2)}m</text>`;
        }).join("");
        const vLabels = verts.map((v, i) => `<circle cx="${toSx(v).toFixed(1)}" cy="${toSy(v).toFixed(1)}" r="3" fill="#b45309"/><text x="${toSx(v).toFixed(1)}" y="${(toSy(v) - 6).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="bold" fill="#b45309">${i + 1}</text>`).join("");
        html += `<div style="text-align:center;margin:8px 0"><svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg"><polygon points="${polyPts}" fill="rgba(180,83,9,0.06)" stroke="#b45309" stroke-width="1.5"/>${sLabels}${vLabels}</svg></div>`;
      } else {
        const ladosStr = g.lados.map((l, i) => `<span class="geo-letter">${letraLado(i)}</span>${l.nombre}: ${l.longitud}m`).join(" &mdash; ");
        html += `<div class="geo-row"><span class="geo-label">Lados:</span> ${ladosStr}</div>`;
      }
      if (g.alto) html += `<div class="geo-row"><span class="geo-label">Alto:</span> ${g.alto}m</div>`;
      if (g.seccionAncho && g.seccionAlto) html += `<div class="geo-row"><span class="geo-label">Seccion:</span> ${g.seccionAncho} &times; ${g.seccionAlto}m</div>`;
      html += `<div class="geo-row"><span class="geo-label">Separacion:</span> ${Math.round((g.espaciado || 0.20) * 100)}cm</div>`;
      if (g.anchoZuncho) html += `<div class="geo-row"><span class="geo-label">Zuncho perimetral:</span> ${Math.round(g.anchoZuncho * 100)}cm</div>`;
      if (g.huecos && g.huecos.length > 0) {
        const hStr = g.huecos.map(h => {
          const pos = (h.x !== undefined && h.y !== undefined) ? ` @(${h.x},${h.y})` : "";
          return `${h.nombre} (${h.largo}&times;${h.ancho}m${pos})`;
        }).join(", ");
        html += `<div class="geo-row"><span class="geo-label">Huecos:</span> ${hStr}</div>`;
      }
      html += `</div>`;
      return html;
    })()}

<div class="resumen">
  <div class="resumen-item">
    <div class="resumen-valor">${resultado.resultadosPorDiametro.reduce((s, r) => s + r.totalBarrasComerciales, 0)}</div>
    <div class="resumen-label">BARRAS ${longitudBarraComercial}m</div>
  </div>
  <div class="resumen-item">
    <div class="resumen-valor">${resultado.pesoTotal.toFixed(0)} kg</div>
    <div class="resumen-label">PESO TOTAL</div>
  </div>
  <div class="resumen-item">
    <div class="resumen-valor">${resultado.resultadosPorDiametro.reduce((s, r) => s + r.totalPiezas, 0)}</div>
    <div class="resumen-label">PIEZAS</div>
  </div>
  <div class="resumen-item">
    <div class="resumen-valor">${
      resultado.resultadosPorDiametro.length > 0
        ? (
            (resultado.desperdicioTotal /
              resultado.resultadosPorDiametro.reduce(
                (s, r) => s + r.totalBarrasComerciales * longitudBarraComercial,
                0
              )) *
            100
          ).toFixed(1)
        : "0"
    }%</div>
    <div class="resumen-label">DESPERDICIO</div>
  </div>
</div>

<div class="materiales">
  <h3>MATERIAL A COMPRAR</h3>
  <table>
    <thead>
      <tr>
        ${materialesCompra.map((m) => `<th>&oslash;${m.diametro}</th>`).join("")}
        <th>TOTAL</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        ${materialesCompra.map((m) => `<td><strong>${m.barras}</strong> barras<br>${m.peso} kg</td>`).join("")}
        <td><strong>${materialesCompra.reduce((s, m) => s + m.barras, 0)}</strong> barras<br>${materialesCompra.reduce((s, m) => s + m.peso, 0).toFixed(0)} kg</td>
      </tr>
    </tbody>
  </table>
</div>`;

    // Colores para los cortes (tonos claros para impresión)
    const colores = [
      "#FFD700", "#87CEEB", "#90EE90", "#FFA07A", "#DDA0DD",
      "#F0E68C", "#B0C4DE", "#98FB98", "#FFDAB9", "#D8BFD8",
      "#FFE4B5", "#ADD8E6", "#BDFCC9", "#FFC0CB", "#E6E6FA",
    ];

    // Detalle por diámetro
    for (const res of resultado.resultadosPorDiametro) {
      html += `
<h2>&oslash;${res.diametro} mm &mdash; ${res.totalBarrasComerciales} barras &mdash; ${res.totalPiezas} piezas &mdash; ${res.pesoKg.toFixed(1)} kg &mdash; ${res.porcentajeDesperdicio}% desp.</h2>`;

      // Visual de barras (máximo 60 por página para que sea legible)
      const barras = res.barrasComerciales;

      for (let i = 0; i < barras.length; i++) {
        const bc = barras[i];
        if (i > 0 && i % 40 === 0) {
          html += `<div class="page-break"></div>
<h3>&oslash;${res.diametro} mm (continuacion)</h3>`;
        }

        let offset = 0;
        const cortesHtml = bc.cortes
          .map((c, idx) => {
            const w = (c.longitud / bc.longitudTotal) * 100;
            const color = colores[idx % colores.length];
            const label = w > 6 ? `${c.longitud.toFixed(2)}m` : "";
            offset += w;
            return `<div class="barra-corte" style="width:${w}%;background:${color};" title="${c.etiqueta}: ${c.longitud.toFixed(2)}m">${label}</div>`;
          })
          .join("");

        const sobranteW = (bc.sobrante / bc.longitudTotal) * 100;
        const sobranteHtml =
          bc.sobrante > 0.01
            ? `<div class="barra-sobrante" style="width:${sobranteW}%">${bc.sobrante >= 0.1 ? bc.sobrante.toFixed(2) + "m" : ""}</div>`
            : "";

        html += `
<div class="barra-visual no-break">
  <span class="barra-num">#${bc.id > 0 ? bc.id : "R"}</span>
  <div class="barra-bar">${cortesHtml}${sobranteHtml}</div>
</div>`;
      }

      // Tabla de cortes detallada
      html += `
<table class="corte-table no-break" style="margin-top: 8px;">
  <thead>
    <tr><th>Barra #</th><th>Cortes (longitud x etiqueta)</th><th>Sobrante</th></tr>
  </thead>
  <tbody>`;

      for (const bc of barras) {
        const cortesStr = bc.cortes
          .map((c, idx) => {
            const color = colores[idx % colores.length];
            return `<span class="colores" style="background:${color}"></span>${c.longitud.toFixed(2)}m <small style="color:#888">(${c.etiqueta})</small>`;
          })
          .join(" + ");

        html += `
    <tr>
      <td style="width:50px;text-align:center;font-weight:bold">${bc.id > 0 ? "#" + bc.id : "Reciclada"}</td>
      <td>${cortesStr}</td>
      <td style="width:60px;text-align:center;color:#999">${bc.sobrante.toFixed(2)}m</td>
    </tr>`;
      }

      html += `
  </tbody>
</table>`;
    }

    html += `
<div class="footer">
  <span>Generado por FERRAPP &mdash; ${nombreProyecto} / ${nombreElemento}</span>
  <span>${fecha}</span>
</div>

</body></html>`;

    // Usar iframe oculto para evitar bloqueo de popups
    let iframe = document.getElementById("ferrapp-print-frame") as HTMLIFrameElement | null;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "ferrapp-print-frame";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      iframe!.contentWindow?.print();
    }, 500);
  };

  return (
    <button
      onClick={imprimir}
      className="flex items-center gap-2 bg-surface-light hover:bg-border text-foreground py-2 px-4 rounded-lg text-sm transition-colors border border-border"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
        <rect x="6" y="14" width="12" height="8"/>
      </svg>
      Imprimir despiece
    </button>
  );
}
