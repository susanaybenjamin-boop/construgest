"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  CategoriaElemento,
  FormaElemento,
  GeometriaElemento,
  LadoGeometria,
  Hueco,
  PilarReticular,
  AbacoInterior,
  ConfigCaraMuro,
  ConfigEsperaLado,
  TramoEstribo,
  ZunchoEnElemento,
  BarraExtraZuncho,
  DIAMETROS_DISPONIBLES,
} from "@/lib/ferrapp/types";
import NumInput from "./NumInput";
import { getTipoGeometria, getLadosForma, getLadosSuperficie, getNombresZonaSuperficie, getGeometriaDefault, getPerimetrosLosa, getPerimetroSuperficie, calcularOpcionesReparto, resolverEtiquetaLado } from "@/lib/ferrapp/generadores";
import type { ZunchoTramo } from "@/lib/ferrapp/types";

// =============================================
// EditableLabel — click para editar la etiqueta
// =============================================
function EditableLabel({ label, onSave, className }: { label: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setVal(label); }, [label]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        title="Click para editar etiqueta"
        className={`cursor-pointer hover:bg-accent/20 rounded px-0.5 transition-colors ${className || ""}`}
      >
        {label}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      value={val}
      onChange={(e) => setVal(e.target.value.slice(0, 6))}
      onBlur={() => { setEditing(false); onSave(val.trim()); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { setEditing(false); onSave(val.trim()); }
        if (e.key === "Escape") { setEditing(false); setVal(label); }
      }}
      className="bg-accent/20 border border-accent rounded px-1 text-xs font-bold text-accent w-10 text-center focus:outline-none"
      maxLength={6}
    />
  );
}

// =============================================
// SVG Interactivo — geometria grande con huecos
// =============================================
interface SVGInteractivoProps {
  geometria: GeometriaElemento;
  tipo: string;
  getEtiqueta: (idx: number) => string;
  onHuecoMove?: (idx: number, x: number, y: number) => void;
  onVertexMove?: (idx: number, x: number, y: number) => void;
  backgroundImage?: string | null;
  onSvgClick?: (mx: number, my: number) => void; // coordenadas en metros
  trazando?: boolean;
}

function GeometriaSVGInteractivo({ geometria, tipo, getEtiqueta, onHuecoMove, onVertexMove, backgroundImage, onSvgClick, trazando }: SVGInteractivoProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [draggingVertex, setDraggingVertex] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, vbx: 0, vby: 0 });
  // ViewBox state: direct control of what's visible
  const [vb, setVb] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const g = geometria;

  // Calcular dimensiones reales de la geometria
  const getDimensiones = useCallback((): { totalW: number; totalH: number } => {
    if (tipo === "superficie") {
      if (g.forma === "rectangular") {
        return { totalW: g.lados[0]?.longitud || 10, totalH: g.lados[1]?.longitud || 8 };
      }
      if (g.forma === "l" && g.lados.length >= 6) {
        // totalH = b + d (zonas apiladas: Derecho + Entrante V)
        const b = g.lados[1]?.longitud || 4;
        const d = g.lados[3]?.longitud || 4;
        return { totalW: g.lados[0]?.longitud || 10, totalH: b + d };
      }
      if (g.forma === "u") {
        const maxL = Math.max(...[0, 2, 4].map(i => g.lados[i]?.longitud || 5));
        const maxA = Math.max(...[1, 3, 5].map(i => g.lados[i]?.longitud || 5));
        return { totalW: maxL, totalH: maxA };
      }
    }
    if (tipo === "superficie" && g.forma === "poligono") {
      // Siempre usar dimensionX/Y como sistema de coordenadas fijo
      return { totalW: g.dimensionX || 10, totalH: g.dimensionY || 10 };
    }
    if (tipo === "muro") {
      const totalL = g.lados.reduce((s, l) => s + l.longitud, 0);
      return { totalW: totalL, totalH: g.alto || 3 };
    }
    return { totalW: 10, totalH: 8 };
  }, [g, tipo]);

  const { totalW, totalH } = getDimensiones();

  // SVG layout — larger canvas for polygon with background image
  const isPoligono = g.forma === "poligono" && backgroundImage;
  const pad = isPoligono ? 20 : 40;
  const svgW = isPoligono ? 700 : 380, svgH = isPoligono ? 500 : 260;
  const drawW = svgW - pad * 2, drawH = svgH - pad * 2;
  const scaleX = drawW / (totalW || 1);
  const scaleY = drawH / (totalH || 1);
  const scale = Math.min(scaleX, scaleY);
  const shapeW = totalW * scale, shapeH = totalH * scale;
  const offX = pad + (drawW - shapeW) / 2;
  const offY = pad + (drawH - shapeH) / 2;

  // ViewBox: null = default (no zoom), otherwise direct coords
  const vbX = vb?.x ?? 0;
  const vbY = vb?.y ?? 0;
  const vbW = vb?.w ?? svgW;
  const vbH = vb?.h ?? svgH;
  const zoom = svgW / vbW; // current zoom level for inverse scaling

  // Convertir metros a SVG
  const mToSvgX = (m: number) => offX + m * scale;
  const mToSvgY = (m: number) => offY + (totalH - m) * scale; // Y invertido

  // Convertir SVG a metros
  const svgToM = (svgX: number, svgY: number): { mx: number; my: number } => {
    const mx = Math.max(0, Math.min(totalW, (svgX - offX) / scale));
    const my = Math.max(0, Math.min(totalH, totalH - (svgY - offY) / scale));
    return { mx: +mx.toFixed(2), my: +my.toFixed(2) };
  };

  // Drag hueco
  const handlePointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(idx);
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  };

  // Drag vertex (polygon)
  const handleVertexPointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingVertex(idx);
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = vbX + (e.clientX - rect.left) / rect.width * vbW;
    const svgY = vbY + (e.clientY - rect.top) / rect.height * vbH;

    if (draggingVertex !== null && onVertexMove) {
      // Convert to meters (no clamping — let vertex go where it needs to)
      const mx = +((svgX - offX) / scale).toFixed(2);
      const my = +(totalH - (svgY - offY) / scale).toFixed(2);
      onVertexMove(draggingVertex, mx, my);
      return;
    }
    if (dragging !== null && onHuecoMove) {
      const { mx, my } = svgToM(svgX, svgY);
      onHuecoMove(dragging, mx, my);
    }
  };

  const handlePointerUp = () => { setDragging(null); setDraggingVertex(null); };

  // Click en SVG
  const handleSvgClick = (e: React.MouseEvent) => {
    if (!svgRef.current || isPanning) return;

    // During tracing: check if clicking on first vertex to close polygon
    if (trazando && onSvgClick) {
      const vertexEl = (e.target as SVGElement).closest("[data-vertex-idx]");
      if (vertexEl && vertexEl.getAttribute("data-vertex-idx") === "0" && (g.vertices || []).length >= 3) {
        // Close polygon — signal with special coords
        onSvgClick(-1, -1);
        return;
      }
    }

    // Skip if clicking on a vertex or hueco (not during tracing)
    if ((e.target as SVGElement).closest("[data-hueco]") || (e.target as SVGElement).closest("[data-vertex]")) return;

    const rect = svgRef.current.getBoundingClientRect();
    // Map screen coords to viewBox coords (accounts for zoom/pan)
    const svgX = vbX + (e.clientX - rect.left) / rect.width * vbW;
    const svgY = vbY + (e.clientY - rect.top) / rect.height * vbH;

    // Tracing mode: click to add vertex (convert to meters directly)
    if (trazando && onSvgClick) {
      const mx = +((svgX - offX) / shapeW * totalW).toFixed(2);
      const my = +(totalH - (svgY - offY) / shapeH * totalH).toFixed(2);
      onSvgClick(
        Math.max(0, Math.min(totalW, mx)),
        Math.max(0, Math.min(totalH, my))
      );
      return;
    }

    // Default: move last hueco
    if (onHuecoMove && (g.huecos || []).length > 0) {
      const { mx, my } = svgToM(svgX, svgY);
      const lastIdx = (g.huecos || []).length - 1;
      onHuecoMove(lastIdx, mx, my);
    }
  };

  // Renderizar forma
  const renderForma = () => {
    const stroke = "#f59e0b";
    const fill = "rgba(245,158,11,0.05)";

    if (tipo === "superficie" && g.forma === "rectangular") {
      const x1 = offX, y1 = offY, w = shapeW, h = shapeH;
      const corners = [
        { x: x1, y: y1, n: 1 },
        { x: x1 + w, y: y1, n: 2 },
        { x: x1 + w, y: y1 + h, n: 3 },
        { x: x1, y: y1 + h, n: 4 },
      ];
      return (
        <>
          <rect x={x1} y={y1} width={w} height={h} fill={fill} stroke={stroke} strokeWidth="2" />
          {/* Labels en los lados */}
          <text x={x1 + w / 2} y={y1 - 6} textAnchor="middle" fontSize="12" fontWeight="bold" fill={stroke}>{getEtiqueta(0)} = {g.lados[0]?.longitud}m</text>
          <text x={x1 + w + 6} y={y1 + h / 2} textAnchor="start" fontSize="12" fontWeight="bold" fill={stroke} transform={`rotate(90,${x1 + w + 6},${y1 + h / 2})`}>{getEtiqueta(1)} = {g.lados[1]?.longitud}m</text>
          {/* Esquinas numeradas */}
          {corners.map(c => (
            <g key={c.n}>
              <circle cx={c.x} cy={c.y} r={8} fill="#1f2937" stroke={stroke} strokeWidth="1.5" />
              <text x={c.x} y={c.y + 3.5} textAnchor="middle" fontSize="9" fontWeight="bold" fill={stroke}>{c.n}</text>
            </g>
          ))}
        </>
      );
    }

    if (tipo === "superficie" && g.forma === "l" && g.lados.length >= 6) {
      const a = g.lados[0].longitud; // Superior (ancho total arriba)
      const b = g.lados[1].longitud; // Derecho (alto zona sup)
      const d = g.lados[3].longitud; // Entrante V (alto zona inf)
      const e = g.lados[4].longitud; // Inferior (ancho zona inf)
      const h = b + d; // altura total real = zona sup + zona inf
      const pts = [
        [0, h], [a, h], [a, d], [e, d], [e, 0], [0, 0], [0, h],
      ].map(([x, y]) => `${mToSvgX(x)},${mToSvgY(y)}`).join(" ");
      const zonaDivY = mToSvgY(d);
      // Esquinas numeradas: P1=top-left → P6=bottom-left (lado[i] va de P(i+1) a P(i+2))
      const corners = [
        { x: mToSvgX(0), y: mToSvgY(h), n: 1 },
        { x: mToSvgX(a), y: mToSvgY(h), n: 2 },
        { x: mToSvgX(a), y: mToSvgY(d), n: 3 },
        { x: mToSvgX(e), y: mToSvgY(d), n: 4 },
        { x: mToSvgX(e), y: mToSvgY(0), n: 5 },
        { x: mToSvgX(0), y: mToSvgY(0), n: 6 },
      ];
      return (
        <>
          <polygon points={pts} fill={fill} stroke={stroke} strokeWidth="2" />
          <line x1={mToSvgX(0)} y1={zonaDivY} x2={mToSvgX(e)} y2={zonaDivY} stroke={stroke} strokeWidth="0.5" strokeDasharray="4,3" opacity="0.3" />
          {/* Labels por lado */}
          <text x={mToSvgX(a / 2)} y={mToSvgY(h) - 6} textAnchor="middle" fontSize="11" fontWeight="bold" fill={stroke}>{getEtiqueta(0)}</text>
          <text x={mToSvgX(a) + 8} y={mToSvgY(d + b / 2)} textAnchor="start" fontSize="11" fontWeight="bold" fill={stroke}>{getEtiqueta(1)}</text>
          <text x={mToSvgX((a + e) / 2)} y={mToSvgY(d) + 14} textAnchor="middle" fontSize="11" fontWeight="bold" fill={stroke}>{getEtiqueta(2)}</text>
          <text x={mToSvgX(e) + 8} y={mToSvgY(d / 2)} textAnchor="start" fontSize="11" fontWeight="bold" fill={stroke}>{getEtiqueta(3)}</text>
          <text x={mToSvgX(e / 2)} y={mToSvgY(0) + 14} textAnchor="middle" fontSize="11" fontWeight="bold" fill={stroke}>{getEtiqueta(4)}</text>
          <text x={mToSvgX(0) - 8} y={mToSvgY(h / 2)} textAnchor="end" fontSize="11" fontWeight="bold" fill={stroke}>{getEtiqueta(5)}</text>
          {/* Esquinas numeradas */}
          {corners.map(c => (
            <g key={c.n}>
              <circle cx={c.x} cy={c.y} r={8} fill="#1f2937" stroke={stroke} strokeWidth="1.5" />
              <text x={c.x} y={c.y + 3.5} textAnchor="middle" fontSize="9" fontWeight="bold" fill={stroke}>{c.n}</text>
            </g>
          ))}
        </>
      );
    }

    if (tipo === "superficie" && g.forma === "u") {
      // U = 3 zonas: izq + centro + der
      const zonas = [];
      for (let i = 0; i < g.lados.length; i += 2) {
        zonas.push({ largo: g.lados[i]?.longitud || 5, ancho: g.lados[i + 1]?.longitud || 5 });
      }
      const centroW = zonas[1]?.largo || 5;
      const izqW = zonas[0]?.ancho || 3;
      const derW = zonas[2]?.ancho || 3;
      const uTotalW = izqW + centroW + derW;
      const wingH = zonas[0]?.largo || 5;
      const centroA = zonas[1]?.ancho || 5;
      const uTotalH = Math.max(wingH, centroA);
      const sc = Math.min(drawW / uTotalW, drawH / uTotalH);
      const oX = pad + (drawW - uTotalW * sc) / 2;
      const oY = pad + (drawH - uTotalH * sc) / 2;

      const pts = [
        [0, 0], [izqW, 0], [izqW, wingH - centroA], [izqW + centroW, wingH - centroA],
        [izqW + centroW, 0], [uTotalW, 0], [uTotalW, uTotalH],
        [0, uTotalH],
      ].map(([x, y]) => `${oX + x * sc},${oY + y * sc}`).join(" ");

      return (
        <>
          <polygon points={pts} fill={fill} stroke={stroke} strokeWidth="2" />
          {/* Dashed zone separators */}
          <line x1={oX + izqW * sc} y1={oY} x2={oX + izqW * sc} y2={oY + uTotalH * sc} stroke={stroke} strokeWidth="0.5" strokeDasharray="4,3" opacity="0.4" />
          <line x1={oX + (izqW + centroW) * sc} y1={oY} x2={oX + (izqW + centroW) * sc} y2={oY + uTotalH * sc} stroke={stroke} strokeWidth="0.5" strokeDasharray="4,3" opacity="0.4" />
          {/* Labels */}
          <text x={oX + izqW * sc / 2} y={oY - 6} textAnchor="middle" fontSize="10" fontWeight="bold" fill={stroke}>{getEtiqueta(1)}</text>
          <text x={oX - 6} y={oY + uTotalH * sc / 2} textAnchor="end" fontSize="10" fontWeight="bold" fill={stroke}>{getEtiqueta(0)}</text>
          <text x={oX + (izqW + centroW / 2) * sc} y={oY + uTotalH * sc + 14} textAnchor="middle" fontSize="10" fontWeight="bold" fill={stroke}>{getEtiqueta(2)}</text>
          <text x={oX + (izqW + centroW / 2) * sc} y={oY + (wingH - centroA) * sc - 4} textAnchor="middle" fontSize="10" fontWeight="bold" fill={stroke}>{getEtiqueta(3)}</text>
          <text x={oX + uTotalW * sc + 6} y={oY + uTotalH * sc / 2} textAnchor="start" fontSize="10" fontWeight="bold" fill={stroke}>{getEtiqueta(4)}</text>
          <text x={oX + (izqW + centroW + derW / 2) * sc} y={oY - 6} textAnchor="middle" fontSize="10" fontWeight="bold" fill={stroke}>{getEtiqueta(5)}</text>
          {/* Esquinas numeradas (8 puntos del U) */}
          {[
            { x: oX, y: oY, n: 1 },
            { x: oX + izqW * sc, y: oY, n: 2 },
            { x: oX + izqW * sc, y: oY + (wingH - centroA) * sc, n: 3 },
            { x: oX + (izqW + centroW) * sc, y: oY + (wingH - centroA) * sc, n: 4 },
            { x: oX + (izqW + centroW) * sc, y: oY, n: 5 },
            { x: oX + uTotalW * sc, y: oY, n: 6 },
            { x: oX + uTotalW * sc, y: oY + uTotalH * sc, n: 7 },
            { x: oX, y: oY + uTotalH * sc, n: 8 },
          ].map(c => (
            <g key={c.n}>
              <circle cx={c.x} cy={c.y} r={7} fill="#1f2937" stroke={stroke} strokeWidth="1.5" />
              <text x={c.x} y={c.y + 3.5} textAnchor="middle" fontSize="8" fontWeight="bold" fill={stroke}>{c.n}</text>
            </g>
          ))}
        </>
      );
    }

    if (tipo === "superficie" && g.forma === "poligono" && g.vertices && g.vertices.length > 0) {
      const verts = g.vertices;
      // Scale factor to keep markers constant screen size regardless of zoom
      const iz = 1 / zoom; // inverse zoom

      const toSvg = (v: { x: number; y: number }) => ({
        sx: offX + (v.x / totalW) * shapeW,
        sy: offY + ((totalH - v.y) / totalH) * shapeH,
      });

      // During tracing: only show dots, NO lines — polygon builds when closed
      if (trazando || verts.length < 3) {
        const svgPts = verts.map(toSvg);
        return (
          <>
            {svgPts.map((p, i) => (
              <g key={i} data-vertex data-vertex-idx={i}>
                <circle cx={p.sx} cy={p.sy} r={3 * iz} fill={i === 0 && verts.length >= 3 ? "#22c55e" : stroke} opacity={0.9} />
                <text x={p.sx} y={p.sy - 5 * iz} textAnchor="middle" fontSize={8 * iz} fontWeight="bold" fill={i === 0 && verts.length >= 3 ? "#22c55e" : stroke}>{i + 1}</text>
              </g>
            ))}
          </>
        );
      }

      const svgVerts = verts.map(toSvg);
      const polyStr = svgVerts.map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ");

      return (
        <>
          <polygon points={polyStr} fill={fill} stroke={stroke} strokeWidth={2 * iz} />
          {/* Medidas de cada lado */}
          {svgVerts.map((p, i) => {
            const next = svgVerts[(i + 1) % svgVerts.length];
            const mx = (p.sx + next.sx) / 2;
            const my = (p.sy + next.sy) / 2;
            const dist = g.lados[i]?.longitud ?? 0;
            const dx = next.sx - p.sx, dy = next.sy - p.sy;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len * 10 * iz, ny = dx / len * 10 * iz;
            return dist > 0 ? (
              <text key={`l${i}`} x={mx + nx} y={my + ny} textAnchor="middle" fontSize={8 * iz} fill="#94a3b8" dominantBaseline="central">
                {dist.toFixed(2)}m
              </text>
            ) : null;
          })}
          {/* Vértices arrastrables — tamaño constante en pantalla */}
          {svgVerts.map((p, i) => (
            <g key={i} data-vertex data-vertex-idx={i}
              onPointerDown={handleVertexPointerDown(i)}
              style={{ cursor: draggingVertex === i ? "grabbing" : "grab" }}
            >
              <circle cx={p.sx} cy={p.sy} r={6 * iz} fill="transparent" /> {/* hit area */}
              <circle cx={p.sx} cy={p.sy} r={3 * iz} fill={stroke} opacity={0.9} />
              <text x={p.sx} y={p.sy - 5 * iz} textAnchor="middle" fontSize={8 * iz} fontWeight="bold" fill={stroke}>{i + 1}</text>
            </g>
          ))}
          {/* Dimensiones envolvente */}
          <text x={offX + shapeW / 2} y={offY - 6 * iz} textAnchor="middle" fontSize={9 * iz} fill="#64748b">
            {(g.dimensionX || totalW).toFixed(2)}m
          </text>
          <text x={offX + shapeW + 10 * iz} y={offY + shapeH / 2} textAnchor="start" fontSize={9 * iz} fill="#64748b"
            transform={`rotate(90,${offX + shapeW + 10 * iz},${offY + shapeH / 2})`}>
            {(g.dimensionY || totalH).toFixed(2)}m
          </text>
        </>
      );
    }

    if (tipo === "muro") {
      if (g.forma === "recto") {
        return (
          <>
            <rect x={offX} y={offY} width={shapeW} height={shapeH} fill={fill} stroke={stroke} strokeWidth="2" />
            <text x={offX + shapeW / 2} y={offY - 6} textAnchor="middle" fontSize="12" fontWeight="bold" fill={stroke}>{getEtiqueta(0)} = {g.lados[0]?.longitud}m</text>
          </>
        );
      }
      // Muro L, U, cerrado — polyline
      let cx = offX;
      const segments: { x1: number; y1: number; x2: number; y2: number; idx: number }[] = [];
      const directions = g.forma === "l" ? [0, -90] : g.forma === "u" ? [0, -90, 0] : [0, -90, 180, 90];
      let angle = 0;
      let px = offX, py = offY + shapeH;

      for (let i = 0; i < g.lados.length && i < directions.length; i++) {
        angle = directions[i];
        const len = g.lados[i].longitud * scale;
        const rad = (angle * Math.PI) / 180;
        const nx = px + Math.cos(rad) * len;
        const ny = py + Math.sin(rad) * len;
        segments.push({ x1: px, y1: py, x2: nx, y2: ny, idx: i });
        px = nx; py = ny;
      }

      return (
        <>
          {segments.map((s, i) => (
            <g key={i}>
              <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={stroke} strokeWidth="3" />
              <text x={(s.x1 + s.x2) / 2 + (s.y2 !== s.y1 ? -12 : 0)} y={(s.y1 + s.y2) / 2 + (s.x2 !== s.x1 ? -8 : 0)} textAnchor="middle" fontSize="11" fontWeight="bold" fill={stroke}>{getEtiqueta(s.idx)}</text>
            </g>
          ))}
        </>
      );
    }

    return null;
  };

  // Renderizar huecos
  const renderHuecos = () => {
    if (!g.huecos || g.huecos.length === 0 || tipo !== "superficie") return null;

    return g.huecos.map((h, idx) => {
      const hx = h.x ?? totalW / 2;
      const hy = h.y ?? totalH / 2;
      const hw = h.largo * scale;
      const hh = h.ancho * scale;
      const sx = mToSvgX(hx) - hw / 2;
      const sy = mToSvgY(hy) - hh / 2;

      return (
        <g key={idx} data-hueco={idx}
          onPointerDown={handlePointerDown(idx)}
          style={{ cursor: dragging === idx ? "grabbing" : "grab" }}
        >
          <rect x={sx} y={sy} width={hw} height={hh}
            fill="rgba(239,68,68,0.15)" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,2" rx="2"
          />
          <text x={sx + hw / 2} y={sy + hh / 2 + 4} textAnchor="middle" fontSize="9" fill="#ef4444" fontWeight="bold">{h.nombre}</text>
          <text x={sx + hw / 2} y={sy + hh / 2 + 14} textAnchor="middle" fontSize="8" fill="#ef4444" opacity="0.7">{h.largo}×{h.ancho}m</text>
        </g>
      );
    });
  };

  // Helper: screen coords → SVG viewBox coords
  const screenToSvg = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const fracX = (clientX - rect.left) / rect.width;
    const fracY = (clientY - rect.top) / rect.height;
    return { x: vbX + fracX * vbW, y: vbY + fracY * vbH };
  };

  // Zoom with mouse wheel — block page scroll, zoom toward cursor
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY > 0 ? 1.1 : 0.9; // zoom out / in
      setVb(prev => {
        const curW = prev?.w ?? svgW, curH = prev?.h ?? svgH;
        const curX = prev?.x ?? 0, curY = prev?.y ?? 0;
        const newW = Math.min(svgW, Math.max(svgW / 50, curW * factor));
        const newH = Math.min(svgH, Math.max(svgH / 50, curH * factor));
        // Cursor position in SVG coords
        const rect = el.getBoundingClientRect();
        const fracX = (e.clientX - rect.left) / rect.width;
        const fracY = (e.clientY - rect.top) / rect.height;
        const cursorX = curX + fracX * curW;
        const cursorY = curY + fracY * curH;
        // Keep cursor at same screen position after zoom
        const newX = cursorX - fracX * newW;
        const newY = cursorY - fracY * newH;
        if (newW >= svgW) return null; // reset to default
        return { x: newX, y: newY, w: newW, h: newH };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [svgW, svgH]);

  // Pan with Alt+click drag
  const handlePanStart = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, vbx: vbX, vby: vbY };
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePanMove = (e: React.PointerEvent) => {
    if (isPanning && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      // Convert screen pixel delta to viewBox delta
      const dx = (e.clientX - panStart.current.x) / rect.width * vbW;
      const dy = (e.clientY - panStart.current.y) / rect.height * vbH;
      setVb(prev => prev ? { ...prev, x: panStart.current.vbx - dx, y: panStart.current.vby - dy } : prev);
    }
  };

  const handlePanEnd = () => { setIsPanning(false); };

  return (
    <div className="relative">
    <svg
      ref={svgRef}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      className={`w-full ${isPoligono ? "max-w-[700px]" : "max-w-[400px]"} bg-surface-light/30 rounded-lg border border-border/30 ${trazando ? "cursor-crosshair" : isPanning ? "cursor-grabbing" : ""}`}
      onClick={handleSvgClick}
      onPointerDown={handlePanStart}
      onPointerMove={(e) => { handlePanMove(e); handlePointerMove(e); }}
      onPointerUp={() => { handlePanEnd(); handlePointerUp(); }}
      onPointerLeave={() => { handlePanEnd(); handlePointerUp(); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Background image */}
      {backgroundImage && (
        <image
          href={backgroundImage}
          x={offX}
          y={offY}
          width={shapeW}
          height={shapeH}
          preserveAspectRatio="xMidYMid meet"
          opacity={0.35}
        />
      )}
      {renderForma()}
      {renderHuecos()}
      {/* Ejes de referencia */}
      {tipo === "superficie" && g.huecos && g.huecos.length > 0 && (
        <>
          <text x={offX} y={offY + shapeH + 16} fontSize="8" fill="#666">0</text>
          <text x={offX + shapeW} y={offY + shapeH + 16} textAnchor="end" fontSize="8" fill="#666">{totalW}m</text>
          <text x={offX - 4} y={offY + shapeH} textAnchor="end" fontSize="8" fill="#666">0</text>
          <text x={offX - 4} y={offY + 4} textAnchor="end" fontSize="8" fill="#666">{totalH}m</text>
        </>
      )}
    </svg>
    {/* Zoom controls */}
    {vb && (
      <button
        onClick={() => setVb(null)}
        className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] bg-surface-light/80 text-gray-400 hover:text-foreground border border-border/50"
        title="Resetear zoom"
      >
        {Math.round(zoom * 100)}% ✕
      </button>
    )}
    </div>
  );
}

// =============================================
// Componente principal
// =============================================
interface GeometriaInputProps {
  geometria: GeometriaElemento | undefined;
  categoria: CategoriaElemento;
  subtipo?: string;
  recubrimientoBase?: number;  // recubrimiento heredado (elemento o proyecto), m
  onGeometriaChange: (g: GeometriaElemento) => void;
  onGenerarBarras: () => void;
}

export default function GeometriaInput({
  geometria,
  categoria,
  subtipo,
  recubrimientoBase,
  onGeometriaChange,
  onGenerarBarras,
}: GeometriaInputProps) {
  if (!geometria) {
    return (
      <div className="bg-surface rounded-xl border border-border/50 p-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">Sin geometria definida</span>
        <button
          onClick={() => onGeometriaChange(getGeometriaDefault(subtipo || categoria, categoria))}
          className="bg-accent/20 hover:bg-accent/30 text-accent font-medium py-1 px-3 rounded-lg text-xs transition-colors"
        >
          Activar geometria
        </button>
      </div>
    );
  }

  const tipo = getTipoGeometria(categoria, subtipo);
  const g = geometria;

  // Migrar L antigua (4 lados) a nueva (6 lados perimetrales)
  useEffect(() => {
    if (g.forma === "l" && tipo === "superficie" && g.lados.length < 6) {
      const nombres = getLadosSuperficie("l");
      const prevLargo = g.lados[0]?.longitud || 10;
      const prevAncho = g.lados[1]?.longitud || 8;
      onGeometriaChange({
        ...g,
        lados: [
          { nombre: nombres[0], longitud: prevLargo },
          { nombre: nombres[1], longitud: +(prevAncho * 0.5).toFixed(1) },
          { nombre: nombres[2], longitud: +(prevLargo * 0.5).toFixed(1) },
          { nombre: nombres[3], longitud: +(prevAncho * 0.5).toFixed(1) },
          { nombre: nombres[4], longitud: +(prevLargo * 0.5).toFixed(1) },
          { nombre: nombres[5], longitud: prevAncho },
        ],
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.forma, g.lados.length]);

  const updateField = (field: Partial<GeometriaElemento>) => {
    onGeometriaChange({ ...g, ...field });
  };

  const updateLado = (idx: number, longitud: number) => {
    const nuevos = [...g.lados];
    nuevos[idx] = { ...nuevos[idx], longitud };
    onGeometriaChange({ ...g, lados: nuevos });
  };

  const updateLadoEtiqueta = (idx: number, etiqueta: string) => {
    const nuevos = [...g.lados];
    nuevos[idx] = { ...nuevos[idx], etiqueta: etiqueta || undefined };
    onGeometriaChange({ ...g, lados: nuevos });
  };

  // Etiqueta resuelta: custom o auto-letra
  const getEtiqueta = (idx: number) => resolverEtiquetaLado(g.lados[idx] || { nombre: "", longitud: 0 }, idx);

  // ── Imagen de fondo + trazar polígono ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Use persisted image from geometria, fallback to local state for upload preview
  const bgImage = g.imagenFondo || null;
  const setBgImage = (img: string | null) => {
    onGeometriaChange({ ...g, imagenFondo: img || undefined });
  };
  const [trazando, setTrazando] = useState(false);

  const handleCargarImagen = (file: File) => {
    // For PDFs, we can't show as background — only images
    if (file.type === "application/pdf") {
      alert("Para usar como fondo, sube una imagen (PNG, JPG). Puedes hacer una captura de pantalla del PDF.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setBgImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const finalizarTrazo = () => {
    const verts = g.vertices || [];
    if (verts.length >= 3) {
      // Normalize: shift so min x,y = 0
      const xs = verts.map(v => v.x), ys = verts.map(v => v.y);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const normalized = verts.map(v => ({
        x: +(v.x - minX).toFixed(2),
        y: +(v.y - minY).toFixed(2),
      }));
      const bb = calcularBoundingBox(normalized);
      const newLados = calcularLadosDesdeVertices(normalized, g.lados);
      onGeometriaChange({ ...g, vertices: normalized, lados: newLados, ...bb, areaAproximada: calcularArea(normalized) });
    }
    setTrazando(false);
  };

  const handleSvgClickAddVertex = (mx: number, my: number) => {
    // Signal to close polygon (click on first vertex)
    if (mx === -1 && my === -1) {
      finalizarTrazo();
      return;
    }
    // mx, my already in meters (converted by SVG component)
    // During tracing, do NOT update dimensionX/Y — keep canvas fixed so coords stay stable
    const newVerts = [...(g.vertices || []), { x: mx, y: my }];
    if (newVerts.length >= 3) {
      const newLados = calcularLadosDesdeVertices(newVerts, g.lados);
      onGeometriaChange({ ...g, vertices: newVerts, lados: newLados, areaAproximada: calcularArea(newVerts) });
    } else {
      const lados = newVerts.length === 2
        ? [{ nombre: "Lado 1", longitud: +Math.sqrt((newVerts[1].x - newVerts[0].x) ** 2 + (newVerts[1].y - newVerts[0].y) ** 2).toFixed(2) }]
        : [];
      onGeometriaChange({ ...g, vertices: newVerts, lados });
    }
  };

  /** Detectar ángulos en cada vértice.
   *  sign: +1 = giro izquierda (convexo en CCW), -1 = giro derecha (cóncavo/entrante)
   */
  const detectarDescuadres = (vertices: { x: number; y: number }[]): { idx: number; angle: number; deviation: number; sign: number }[] => {
    if (vertices.length < 3) return [];
    const result: { idx: number; angle: number; deviation: number; sign: number }[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const prev = vertices[(i - 1 + vertices.length) % vertices.length];
      const curr = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      const v1x = prev.x - curr.x, v1y = prev.y - curr.y;
      const v2x = next.x - curr.x, v2y = next.y - curr.y;
      const dot = v1x * v2x + v1y * v2y;
      const cross = v1x * v2y - v1y * v2x;
      const angleDeg = +Math.abs(Math.atan2(cross, dot) * 180 / Math.PI).toFixed(1);
      const dev90 = Math.abs(angleDeg - 90);
      const sign = cross >= 0 ? 1 : -1; // turn direction
      result.push({ idx: i, angle: angleDeg, deviation: dev90, sign });
    }
    return result;
  };

  const descuadres = g.forma === "poligono" && g.vertices ? detectarDescuadres(g.vertices) : [];

  /** Reconstruir polígono a partir de longitudes y ángulos.
   *  Usa el signo de giro (sign) de cada vértice original para saber si
   *  la esquina es convexa (giro normal) o cóncava (entrante).
   */
  const reconstruirPoligono = (longitudes: number[], angulos: number[]) => {
    const n = longitudes.length;
    if (n < 3 || !g.vertices || g.vertices.length !== n) return;

    // Get turn direction at each vertex from original shape
    const signs = descuadres.map(d => d.sign);

    // Initial direction from current vertices
    let dir = Math.atan2(
      g.vertices[1].y - g.vertices[0].y,
      g.vertices[1].x - g.vertices[0].x
    );

    const verts: { x: number; y: number }[] = [{ x: 0, y: 0 }];

    for (let i = 0; i < n; i++) {
      if (i > 0) {
        // Exterior angle = π - interior angle
        const exteriorAngle = Math.PI - (angulos[i] * Math.PI / 180);
        // Apply turn: sign determines left (+) or right (-) turn
        dir += signs[i] * exteriorAngle;
      }
      if (i < n - 1) {
        verts.push({
          x: +(verts[i].x + Math.cos(dir) * longitudes[i]).toFixed(2),
          y: +(verts[i].y + Math.sin(dir) * longitudes[i]).toFixed(2),
        });
      }
    }

    // Normalize: shift so min x,y = 0
    const xs = verts.map(v => v.x), ys = verts.map(v => v.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const normalized = verts.map(v => ({
      x: +(v.x - minX).toFixed(2),
      y: +(v.y - minY).toFixed(2),
    }));
    const newLados = calcularLadosDesdeVertices(normalized, g.lados);
    const bb = calcularBoundingBox(normalized);
    onGeometriaChange({ ...g, vertices: normalized, lados: newLados, ...bb, areaAproximada: calcularArea(normalized) });
  };

  // Gestion de huecos
  const addHueco = () => {
    const huecos = [...(g.huecos || [])];
    // Default al centro de la geometria
    let cx = 5, cy = 4;
    if (tipo === "superficie") {
      if (g.forma === "rectangular") {
        cx = (g.lados[0]?.longitud || 10) / 2;
        cy = (g.lados[1]?.longitud || 8) / 2;
      } else if (g.forma === "l" && g.lados.length >= 6) {
        cx = (g.lados[0]?.longitud || 10) / 2;
        cy = ((g.lados[1]?.longitud || 4) + (g.lados[3]?.longitud || 4)) / 2;
      }
    }
    huecos.push({ nombre: `Hueco ${huecos.length + 1}`, largo: 3, ancho: 1.2, x: +cx.toFixed(2), y: +cy.toFixed(2) });
    onGeometriaChange({ ...g, huecos });
  };
  const removeHueco = (idx: number) => {
    const huecos = [...(g.huecos || [])];
    huecos.splice(idx, 1);
    onGeometriaChange({ ...g, huecos });
  };
  const updateHueco = (idx: number, field: Partial<Hueco>) => {
    const huecos = [...(g.huecos || [])];
    huecos[idx] = { ...huecos[idx], ...field };
    onGeometriaChange({ ...g, huecos });
  };

  const esForjado = categoria === "forjado";

  // Cambiar forma para muros
  const cambiarFormaMuro = (forma: FormaElemento) => {
    const nombres = getLadosForma(forma);
    const lados: LadoGeometria[] = nombres.map((nombre, i) => ({
      nombre,
      longitud: g.lados[i]?.longitud || 5,
    }));
    onGeometriaChange({ ...g, forma, lados });
  };

  // Cambiar forma para superficies
  /** Calcula longitudes de lados a partir de vértices */
  const calcularLadosDesdeVertices = (vertices: { x: number; y: number }[], ladosPrev: LadoGeometria[]): LadoGeometria[] => {
    return vertices.map((v, i) => {
      const next = vertices[(i + 1) % vertices.length];
      const dist = +Math.sqrt((next.x - v.x) ** 2 + (next.y - v.y) ** 2).toFixed(2);
      return { nombre: ladosPrev[i]?.nombre || `Lado ${i + 1}`, longitud: dist };
    });
  };

  /** Calcula bounding box de vértices */
  const calcularBoundingBox = (vertices: { x: number; y: number }[]) => {
    const xs = vertices.map(v => v.x), ys = vertices.map(v => v.y);
    return {
      dimensionX: +(Math.max(...xs) - Math.min(...xs)).toFixed(2),
      dimensionY: +(Math.max(...ys) - Math.min(...ys)).toFixed(2),
    };
  };

  /** Calcula área del polígono con fórmula del cordón (Shoelace) */
  const calcularArea = (vertices: { x: number; y: number }[]): number => {
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    return +Math.abs(area / 2).toFixed(2);
  };

  const cambiarFormaSuperficie = (forma: FormaElemento) => {
    if (forma === "poligono") {
      if (g.forma === "poligono" && g.vertices) {
        // Ya es polígono, no cambiar
        return;
      }
      const w = g.lados[0]?.longitud || 10;
      const h = g.lados[1]?.longitud || 8;
      // Inicializar como rectángulo que el usuario puede deformar
      const vertices = [
        { x: 0, y: h },   // P1 arriba-izq
        { x: w, y: h },   // P2 arriba-der
        { x: w, y: 0 },   // P3 abajo-der
        { x: 0, y: 0 },   // P4 abajo-izq
      ];
      const lados = calcularLadosDesdeVertices(vertices, []);
      onGeometriaChange({ ...g, forma, lados, vertices, dimensionX: w, dimensionY: h, areaAproximada: +(w * h).toFixed(2) });
      return;
    }

    const nombres = getLadosSuperficie(forma);
    let lados: LadoGeometria[];

    if (forma === "l" && g.forma !== "l") {
      const prevLargo = g.dimensionX || g.lados[0]?.longitud || 10;
      const prevAncho = g.dimensionY || g.lados[1]?.longitud || 8;
      lados = [
        { nombre: nombres[0], longitud: prevLargo },
        { nombre: nombres[1], longitud: +(prevAncho * 0.5).toFixed(1) },
        { nombre: nombres[2], longitud: +(prevLargo * 0.5).toFixed(1) },
        { nombre: nombres[3], longitud: +(prevAncho * 0.5).toFixed(1) },
        { nombre: nombres[4], longitud: +(prevLargo * 0.5).toFixed(1) },
        { nombre: nombres[5], longitud: prevAncho },
      ];
    } else {
      lados = nombres.map((nombre, i) => ({
        nombre,
        longitud: g.lados[i]?.longitud || 5,
      }));
    }
    onGeometriaChange({ ...g, forma, lados });
  };

  // Agrupar lados de superficie en zonas (pares de largo/ancho)
  const getZonasSuperficie = () => {
    const zonas: { largo: LadoGeometria; ancho: LadoGeometria; idx: number }[] = [];
    for (let i = 0; i < g.lados.length; i += 2) {
      zonas.push({
        largo: g.lados[i],
        ancho: g.lados[i + 1] || { nombre: "Ancho", longitud: 5 },
        idx: i,
      });
    }
    return zonas;
  };

  const formasSuperficie: { forma: FormaElemento; label: string }[] = [
    { forma: "rectangular", label: "□ Rect" },
    { forma: "l", label: "L" },
    { forma: "u", label: "U" },
    { forma: "poligono", label: "⬠ Libre" },
  ];

  const formasMuro: { forma: FormaElemento; label: string }[] = [
    { forma: "recto", label: "━ Recto" },
    { forma: "l", label: "L" },
    { forma: "u", label: "U" },
    { forma: "cerrado", label: "□ Cerrado" },
  ];

  return (
    <div className="bg-surface rounded-xl border border-accent/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">
          Geometria
        </h3>
        <button
          onClick={onGenerarBarras}
          className="bg-accent hover:bg-accent-dark text-black font-medium py-1 px-3 rounded-lg text-xs transition-colors"
        >
          Generar barras
        </button>
      </div>

      {/* SUPERFICIE: selector de forma */}
      {tipo === "superficie" && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <label className="text-xs text-gray-400 mr-1">Forma:</label>
          {formasSuperficie.map(({ forma, label }) => (
            <button
              key={forma}
              onClick={() => cambiarFormaSuperficie(forma)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                g.forma === forma
                  ? "bg-accent text-black"
                  : "bg-surface-light text-gray-400 hover:text-foreground border border-border"
              }`}
            >
              {label}
            </button>
          ))}
          {g.forma === "poligono" && (
            <>
              <span className="text-gray-600 mx-1">|</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 rounded text-xs font-medium bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 transition-colors"
                title="Cargar imagen de plano como fondo de referencia"
              >
                {bgImage ? "Cambiar fondo" : "🖼 Cargar plano"}
              </button>
              {bgImage && (
                <button
                  onClick={() => {
                    if (trazando) {
                      finalizarTrazo();
                    } else {
                      // Al empezar a trazar, limpiar vértices
                      onGeometriaChange({ ...g, vertices: [], lados: [] });
                      setTrazando(true);
                    }
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    trazando
                      ? "bg-green-600/30 text-green-400 border border-green-500/40"
                      : "bg-surface-light text-gray-400 hover:text-foreground border border-border"
                  }`}
                >
                  {trazando ? "✓ Terminar trazo" : "✏ Trazar contorno"}
                </button>
              )}
              {bgImage && (
                <button
                  onClick={() => { setBgImage(null); setTrazando(false); }}
                  className="px-1.5 py-1 rounded text-xs text-gray-500 hover:text-danger transition-colors"
                  title="Quitar imagen de fondo"
                >
                  ✕
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCargarImagen(file);
                  e.target.value = "";
                }}
              />
            </>
          )}
          {trazando && (
            <span className="text-[10px] text-green-400 ml-1">Click en las esquinas del contorno</span>
          )}
        </div>
      )}

      {/* MURO: selector de forma */}
      {tipo === "muro" && (
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-400 mr-1">Forma:</label>
          {formasMuro.map(({ forma, label }) => (
            <button
              key={forma}
              onClick={() => cambiarFormaMuro(forma)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                g.forma === forma
                  ? "bg-accent text-black"
                  : "bg-surface-light text-gray-400 hover:text-foreground border border-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ===== SVG INTERACTIVO + INPUTS ===== */}
      {(tipo === "superficie" || tipo === "muro") && (
        <div className="flex gap-3 flex-col sm:flex-row">
          {/* SVG grande */}
          <GeometriaSVGInteractivo
            geometria={g}
            tipo={tipo}
            getEtiqueta={getEtiqueta}
            onHuecoMove={(idx, x, y) => updateHueco(idx, { x, y })}
            backgroundImage={g.forma === "poligono" ? bgImage : null}
            trazando={trazando}
            onSvgClick={trazando ? handleSvgClickAddVertex : undefined}
            onVertexMove={g.forma === "poligono" && !trazando ? (idx, x, y) => {
              if (!g.vertices) return;
              const newVerts = [...g.vertices];
              newVerts[idx] = { x, y };
              const lados = calcularLadosDesdeVertices(newVerts, g.lados);
              const bb = calcularBoundingBox(newVerts);
              const area = calcularArea(newVerts);
              onGeometriaChange({ ...g, vertices: newVerts, lados, ...bb, areaAproximada: area });
            } : undefined}
          />

          {/* Panel de inputs */}
          <div className="flex-1 space-y-2 min-w-0">
            {/* SUPERFICIE L: 6 lados */}
            {tipo === "superficie" && g.forma === "l" && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {g.lados.map((lado, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <EditableLabel
                      label={getEtiqueta(idx)}
                      onSave={(v) => updateLadoEtiqueta(idx, v)}
                      className="text-xs font-bold text-accent w-fit min-w-[12px]"
                    />
                    <label className="text-xs text-gray-400 shrink-0 truncate max-w-[50px]">{lado.nombre}:</label>
                    <NumInput
                      value={lado.longitud}
                      onChange={(v) => updateLado(idx, v)}
                      className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-16 text-foreground focus:outline-none focus:border-accent"
                    />
                    <span className="text-xs text-gray-500">m</span>
                  </div>
                ))}
              </div>
            )}

            {/* SUPERFICIE U: zonas */}
            {tipo === "superficie" && g.forma === "u" && (
              <div className="space-y-1.5">
                {getZonasSuperficie().map((zona, zIdx) => {
                  const nombresZona = getNombresZonaSuperficie(g.forma);
                  return (
                    <div key={zIdx} className="flex items-center gap-2 flex-wrap">
                      {nombresZona.length > 0 && (
                        <span className="text-[10px] font-bold text-accent/60 w-10">{nombresZona[zIdx]}</span>
                      )}
                      <EditableLabel label={getEtiqueta(zona.idx)} onSave={(v) => updateLadoEtiqueta(zona.idx, v)} className="text-xs font-bold text-accent" />
                      <NumInput
                        value={zona.largo.longitud}
                        onChange={(v) => updateLado(zona.idx, v)}
                        className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-14 text-foreground focus:outline-none focus:border-accent"
                      />
                      <span className="text-[10px] text-gray-500">×</span>
                      <EditableLabel label={getEtiqueta(zona.idx + 1)} onSave={(v) => updateLadoEtiqueta(zona.idx + 1, v)} className="text-xs font-bold text-accent" />
                      <NumInput
                        value={zona.ancho.longitud}
                        onChange={(v) => updateLado(zona.idx + 1, v)}
                        className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-14 text-foreground focus:outline-none focus:border-accent"
                      />
                      <span className="text-xs text-gray-500">m</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* SUPERFICIE rectangular: zonas */}
            {tipo === "superficie" && g.forma === "rectangular" && (
              <div className="space-y-2">
                {getZonasSuperficie().map((zona, zIdx) => {
                  const nombresZona = getNombresZonaSuperficie(g.forma);
                  return (
                    <div key={zIdx} className="flex items-center gap-3 flex-wrap">
                      {nombresZona.length > 0 && (
                        <span className="text-[10px] font-bold text-accent/60 w-14">{nombresZona[zIdx]}</span>
                      )}
                      <div className="flex items-center gap-1">
                        <EditableLabel label={getEtiqueta(zona.idx)} onSave={(v) => updateLadoEtiqueta(zona.idx, v)} className="text-xs font-bold text-accent" />
                        <label className="text-xs text-gray-400">Largo:</label>
                        <NumInput
                          value={zona.largo.longitud}
                          onChange={(v) => updateLado(zona.idx, v)}
                          className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-16 text-foreground focus:outline-none focus:border-accent"
                        />
                        <span className="text-xs text-gray-500">m</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <EditableLabel label={getEtiqueta(zona.idx + 1)} onSave={(v) => updateLadoEtiqueta(zona.idx + 1, v)} className="text-xs font-bold text-accent" />
                        <label className="text-xs text-gray-400">Ancho:</label>
                        <NumInput
                          value={zona.ancho.longitud}
                          onChange={(v) => updateLado(zona.idx + 1, v)}
                          className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-16 text-foreground focus:outline-none focus:border-accent"
                        />
                        <span className="text-xs text-gray-500">m</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* SUPERFICIE polígono libre */}
            {tipo === "superficie" && g.forma === "poligono" && (
              <div className="space-y-3">
                {/* Info envolvente */}
                <div className="flex items-center gap-4 text-[10px] text-gray-500">
                  <span>Envolvente: <span className="text-accent">{(g.dimensionX || 0).toFixed(2)}</span> × <span className="text-accent">{(g.dimensionY || 0).toFixed(2)}</span> m</span>
                  <span>Área: <span className="text-accent">{(g.areaAproximada || 0).toFixed(1)}</span> m²</span>
                  <span>Perímetro: {g.lados.reduce((s, l) => s + l.longitud, 0).toFixed(2)} m</span>
                </div>

                {/* Lados: longitud + ángulo editable → reconstruye polígono */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-accent/70 uppercase tracking-wide">Lados ({g.lados.length})</label>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          // Rectificar todos los ángulos a 90°
                          const longitudes = g.lados.map(l => l.longitud);
                          const angulos = descuadres.map(() => 90);
                          reconstruirPoligono(longitudes, angulos);
                        }}
                        className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded hover:bg-blue-500/30 transition-colors"
                        title="Poner todos los ángulos a 90°"
                      >
                        Todo 90°
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                    {g.lados.map((lado, idx) => {
                      const fromIdx = idx;
                      const toIdx = (idx + 1) % (g.vertices || []).length;
                      const d = descuadres[fromIdx];
                      return (
                        <div key={idx} className="flex items-center gap-1 group text-xs">
                          <span className="text-accent font-bold shrink-0 w-8 text-right">{fromIdx + 1}→{toIdx + 1}</span>
                          {/* Longitud editable */}
                          <NumInput
                            value={lado.longitud}
                            onChange={(v) => {
                              const longitudes = g.lados.map(l => l.longitud);
                              longitudes[idx] = v;
                              const angulos = descuadres.map(dd => dd.angle);
                              reconstruirPoligono(longitudes, angulos);
                            }}
                            className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-14 text-foreground focus:outline-none focus:border-accent"
                          />
                          <span className="text-gray-500 shrink-0">m</span>
                          {/* Ángulo editable en el vértice "from" */}
                          {d && (
                            <>
                              <span className={`text-[8px] shrink-0 ${d.sign < 0 ? "text-purple-400" : "text-gray-600"}`} title={d.sign < 0 ? "Entrante (cóncavo)" : "Convexo"}>
                                {d.sign < 0 ? "∠↙" : "∠"}
                              </span>
                              <NumInput
                                value={d.angle}
                                onChange={(v) => {
                                  const longitudes = g.lados.map(l => l.longitud);
                                  const angulos = descuadres.map(dd => dd.angle);
                                  angulos[fromIdx] = v;
                                  reconstruirPoligono(longitudes, angulos);
                                }}
                                className={`border rounded px-1 py-0.5 w-12 focus:outline-none focus:border-accent ${
                                  d.deviation <= 1
                                    ? "bg-surface-light border-border text-green-400"
                                    : d.deviation < 5
                                    ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                                    : "bg-orange-500/10 border-orange-500/30 text-orange-400"
                                }`}
                              />
                              <span className="text-gray-600 text-[9px] shrink-0">°</span>
                              {d.deviation > 1 && (
                                <button
                                  onClick={() => {
                                    const longitudes = g.lados.map(l => l.longitud);
                                    const angulos = descuadres.map(dd => dd.angle);
                                    angulos[fromIdx] = 90;
                                    reconstruirPoligono(longitudes, angulos);
                                  }}
                                  className="text-[8px] text-blue-400 hover:text-blue-300 px-0.5 shrink-0"
                                  title="Rectificar a 90°"
                                >
                                  →90°
                                </button>
                              )}
                            </>
                          )}
                          {(g.vertices || []).length > 3 && (
                            <button
                              onClick={() => {
                                const newVerts = (g.vertices || []).filter((_, i) => i !== toIdx);
                                const newLados = calcularLadosDesdeVertices(newVerts, []);
                                const bb = calcularBoundingBox(newVerts);
                                onGeometriaChange({ ...g, vertices: newVerts, lados: newLados, ...bb, areaAproximada: calcularArea(newVerts) });
                              }}
                              className="text-gray-600 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity px-0.5 shrink-0"
                              title={`Eliminar punto ${toIdx + 1}`}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Resumen descuadres */}
                  {descuadres.some(d => d.deviation > 1 && d.deviation < 80) && (
                    <div className="mt-2 text-[10px] text-orange-400 bg-orange-500/10 rounded px-2 py-1">
                      ⚠ {descuadres.filter(d => d.deviation > 1 && d.deviation < 80).length} descuadre(s) detectado(s)
                      {descuadres.filter(d => d.deviation > 1 && d.deviation < 80).map(d => (
                        <span key={d.idx} className="ml-1.5">P{d.idx + 1}: {d.angle}°</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MURO: lados */}
            {tipo === "muro" && (
              <div className="flex items-center gap-3 flex-wrap">
                {g.lados.map((lado, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <EditableLabel label={getEtiqueta(idx)} onSave={(v) => updateLadoEtiqueta(idx, v)} className="text-xs font-bold text-accent" />
                    <label className="text-xs text-gray-400">{lado.nombre}:</label>
                    <NumInput
                      value={lado.longitud}
                      onChange={(v) => updateLado(idx, v)}
                      className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-16 text-foreground focus:outline-none focus:border-accent"
                    />
                    <span className="text-xs text-gray-500">m</span>
                  </div>
                ))}
                {/* Alto */}
                <div className="flex items-center gap-1">
                  <label className="text-xs text-gray-400">Alto:</label>
                  <NumInput
                    value={g.alto || 3}
                    onChange={(v) => updateField({ alto: v })}
                    className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-16 text-foreground focus:outline-none focus:border-accent"
                  />
                  <span className="text-xs text-gray-500">m</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LINEAL / PILAR / ESCALERA: lados normales (sin SVG grande) */}
      {tipo !== "superficie" && tipo !== "muro" && (
        <div className="flex items-center gap-3 flex-wrap">
          {g.lados.map((lado, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <EditableLabel label={getEtiqueta(idx)} onSave={(v) => updateLadoEtiqueta(idx, v)} className="text-xs font-bold text-accent" />
              <label className="text-xs text-gray-400">{lado.nombre}:</label>
              <NumInput
                value={lado.longitud}
                onChange={(v) => updateLado(idx, v)}
                className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-16 text-foreground focus:outline-none focus:border-accent"
              />
              <span className="text-xs text-gray-500">m</span>
            </div>
          ))}

          {/* Alto (pilares) */}
          {tipo === "pilar" && (
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-400">Alto:</label>
              <NumInput
                value={g.alto || 3}
                onChange={(v) => updateField({ alto: v })}
                className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-16 text-foreground focus:outline-none focus:border-accent"
              />
              <span className="text-xs text-gray-500">m</span>
            </div>
          )}

          {/* Seccion (vigas, pilares) */}
          {(tipo === "lineal" || tipo === "pilar") && (
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-400">Seccion:</label>
              <NumInput
                value={g.seccionAncho || 0.30}
                onChange={(v) => updateField({ seccionAncho: v })}
                className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-14 text-foreground focus:outline-none focus:border-accent"
              />
              <span className="text-xs text-gray-500">x</span>
              <NumInput
                value={g.seccionAlto || 0.30}
                onChange={(v) => updateField({ seccionAlto: v })}
                className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-14 text-foreground focus:outline-none focus:border-accent"
              />
              <span className="text-xs text-gray-500">m</span>
            </div>
          )}
        </div>
      )}

      {/* Espaciado — comun a todos */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-400">Separacion:</label>
          <NumInput
            value={Math.round((g.espaciado || 0.20) * 100)}
            onChange={(v) => updateField({ espaciado: (v || 20) / 100 })}
            decimals={false}
            className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-16 text-foreground focus:outline-none focus:border-accent"
          />
          <span className="text-xs text-gray-500">cm</span>
        </div>

        {/* Zuncho — forjados */}
        {esForjado && (
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-400">Zuncho:</label>
            <NumInput
              value={Math.round((g.anchoZuncho || 0.30) * 100)}
              onChange={(v) => updateField({ anchoZuncho: (v || 30) / 100 })}
              decimals={false}
              className="bg-surface-light border border-border rounded px-2 py-1 text-sm w-16 text-foreground focus:outline-none focus:border-accent"
            />
            <span className="text-xs text-gray-500">cm</span>
          </div>
        )}
      </div>

      {/* Tramos de estribos — vigas/zunchos */}
      {tipo === "lineal" && (() => {
        const tramos = g.tramosEstribos || [];
        const longTotal = g.lados[0]?.longitud || 5;

        const addTramosPredefinidos = () => {
          // Crear 3 tramos: extremo izq (L/5), centro (3L/5), extremo der (L/5)
          const lExt = +(longTotal / 5).toFixed(2);
          const lCentro = +(longTotal - 2 * lExt).toFixed(2);
          updateField({
            tramosEstribos: [
              { nombre: "Extremo izq", longitud: lExt, espaciado: 0.10 },
              { nombre: "Centro", longitud: lCentro, espaciado: g.espaciado || 0.15 },
              { nombre: "Extremo der", longitud: lExt, espaciado: 0.10 },
            ],
          });
        };

        const updateTramo = (idx: number, field: keyof TramoEstribo, value: string | number) => {
          const nuevos = [...tramos];
          nuevos[idx] = { ...nuevos[idx], [field]: value };
          updateField({ tramosEstribos: nuevos });
        };

        const addTramo = () => {
          updateField({
            tramosEstribos: [...tramos, { nombre: `Tramo ${tramos.length + 1}`, longitud: 1.0, espaciado: 0.15 }],
          });
        };

        const removeTramo = (idx: number) => {
          updateField({ tramosEstribos: tramos.filter((_, i) => i !== idx) });
        };

        const sumaTramos = tramos.reduce((s, t) => s + t.longitud, 0);

        return (
          <div className="bg-surface-light/50 border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                Estribos por tramos
              </label>
              <div className="flex gap-1">
                {tramos.length === 0 ? (
                  <button
                    onClick={addTramosPredefinidos}
                    className="text-[10px] text-accent hover:text-accent-dark px-1.5 py-0.5 border border-accent/30 rounded transition-colors"
                  >
                    Activar tramos
                  </button>
                ) : (
                  <>
                    <button
                      onClick={addTramo}
                      className="text-[10px] text-accent hover:text-accent-dark px-1.5 py-0.5 border border-accent/30 rounded transition-colors"
                    >
                      + Tramo
                    </button>
                    <button
                      onClick={() => updateField({ tramosEstribos: undefined })}
                      className="text-[10px] text-gray-500 hover:text-red-400 px-1.5 py-0.5 border border-gray-700 rounded transition-colors"
                    >
                      Uniforme
                    </button>
                  </>
                )}
              </div>
            </div>
            {tramos.length > 0 && (
              <div className="space-y-1.5">
                {tramos.map((tramo, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={tramo.nombre}
                      onChange={(e) => updateTramo(idx, "nombre", e.target.value)}
                      className="bg-surface border border-border rounded px-1.5 py-0.5 text-xs text-foreground w-24 focus:outline-none focus:border-accent"
                    />
                    <NumInput
                      value={tramo.longitud}
                      onChange={(v) => updateTramo(idx, "longitud", v)}
                      className="bg-surface border border-border rounded px-1.5 py-0.5 text-xs w-14 text-foreground focus:outline-none focus:border-accent"
                    />
                    <span className="text-[10px] text-gray-500">m</span>
                    <span className="text-[10px] text-gray-500">c/</span>
                    <NumInput
                      value={Math.round(tramo.espaciado * 100)}
                      onChange={(v) => updateTramo(idx, "espaciado", (v || 15) / 100)}
                      decimals={false}
                      className="bg-surface border border-border rounded px-1.5 py-0.5 text-xs w-12 text-foreground focus:outline-none focus:border-accent"
                    />
                    <span className="text-[10px] text-gray-500">cm</span>
                    <span className="text-[10px] text-gray-500">({Math.max(1, Math.round(tramo.longitud / tramo.espaciado))} uds)</span>
                    <button
                      onClick={() => removeTramo(idx)}
                      className="text-red-400 hover:text-red-300 text-xs ml-auto"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="text-[10px] text-gray-500 flex justify-between">
                  <span>Total tramos: {sumaTramos.toFixed(2)}m</span>
                  {Math.abs(sumaTramos - longTotal) > 0.01 && (
                    <span className="text-amber-400">Viga: {longTotal}m (dif: {(sumaTramos - longTotal).toFixed(2)}m)</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Armadura por cara — muros */}
      {tipo === "muro" && (() => {
        const defExt: ConfigCaraMuro = g.caraExterior || { diametroVertical: 12, diametroHorizontal: 10, espaciado: g.espaciado || 0.20 };
        const defInt: ConfigCaraMuro = g.caraInterior || { diametroVertical: 12, diametroHorizontal: 10, espaciado: g.espaciado || 0.20 };
        const dHorq = g.diametroHorquillas || 8;

        const updateCara = (cara: "caraExterior" | "caraInterior", field: keyof ConfigCaraMuro, value: number) => {
          const current = cara === "caraExterior" ? defExt : defInt;
          updateField({ [cara]: { ...current, [field]: value } });
        };

        const DiamSelect = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
          <select
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:border-accent w-14"
          >
            {DIAMETROS_DISPONIBLES.map((d) => (
              <option key={d} value={d}>Ø{d}</option>
            ))}
          </select>
        );

        return (
          <div className="bg-surface-light/50 border border-border rounded-lg p-3 space-y-2">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Armadura por cara</label>
            <div className="grid grid-cols-2 gap-3">
              {/* Cara exterior */}
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-accent">Cara exterior</span>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-gray-400">V:</span>
                  <DiamSelect value={defExt.diametroVertical} onChange={(v) => updateCara("caraExterior", "diametroVertical", v)} />
                  <span className="text-[10px] text-gray-400">H:</span>
                  <DiamSelect value={defExt.diametroHorizontal} onChange={(v) => updateCara("caraExterior", "diametroHorizontal", v)} />
                  <span className="text-[10px] text-gray-400">@</span>
                  <NumInput
                    value={Math.round(defExt.espaciado * 100)}
                    onChange={(v) => updateCara("caraExterior", "espaciado", (v || 20) / 100)}
                    decimals={false}
                    className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-12 text-foreground focus:outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-gray-500">cm</span>
                </div>
              </div>
              {/* Cara interior */}
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-blue-400">Cara interior</span>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-gray-400">V:</span>
                  <DiamSelect value={defInt.diametroVertical} onChange={(v) => updateCara("caraInterior", "diametroVertical", v)} />
                  <span className="text-[10px] text-gray-400">H:</span>
                  <DiamSelect value={defInt.diametroHorizontal} onChange={(v) => updateCara("caraInterior", "diametroHorizontal", v)} />
                  <span className="text-[10px] text-gray-400">@</span>
                  <NumInput
                    value={Math.round(defInt.espaciado * 100)}
                    onChange={(v) => updateCara("caraInterior", "espaciado", (v || 20) / 100)}
                    decimals={false}
                    className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-12 text-foreground focus:outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-gray-500">cm</span>
                </div>
              </div>
            </div>
            {/* Horquillas */}
            <div className="flex items-center gap-4 pt-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400">Horquillas:</span>
                <DiamSelect value={dHorq} onChange={(v) => updateField({ diametroHorquillas: v })} />
              </div>
              <span className="text-[9px] text-gray-500 italic">Las esperas se configuran en la losa/zapata</span>
            </div>
          </div>
        );
      })()}

      {/* Huecos — superficies */}
      {tipo === "superficie" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Huecos</label>
            <button
              onClick={addHueco}
              className="text-[10px] text-accent hover:text-accent-dark font-medium"
            >
              + Añadir hueco
            </button>
          </div>
          {(g.huecos || []).length > 0 && (
            <div className="space-y-1.5">
              {(g.huecos || []).map((h, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-surface-light/50 rounded-lg px-2 py-1.5 flex-wrap">
                  <input
                    type="text"
                    value={h.nombre}
                    onChange={(e) => updateHueco(idx, { nombre: e.target.value })}
                    className="bg-transparent border-b border-border text-xs w-20 text-foreground focus:outline-none focus:border-accent"
                    placeholder="Nombre"
                  />
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-gray-500">L:</label>
                    <NumInput
                      value={h.largo}
                      onChange={(v) => updateHueco(idx, { largo: v })}
                      className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-14 text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-gray-500">A:</label>
                    <NumInput
                      value={h.ancho}
                      onChange={(v) => updateHueco(idx, { ancho: v })}
                      className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-14 text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-gray-500">X:</label>
                    <NumInput
                      value={h.x ?? 0}
                      onChange={(v) => updateHueco(idx, { x: v })}
                      className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-14 text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-gray-500">Y:</label>
                    <NumInput
                      value={h.y ?? 0}
                      onChange={(v) => updateHueco(idx, { y: v })}
                      className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-14 text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>
                  <span className="text-[10px] text-gray-500">m</span>
                  <button
                    onClick={() => removeHueco(idx)}
                    className="text-red-400 hover:text-red-300 text-xs ml-auto"
                  >
                    ×
                  </button>
                </div>
              ))}
              <p className="text-[9px] text-gray-500 italic">Click en el diagrama o arrastra los huecos para posicionarlos</p>
            </div>
          )}
        </div>
      )}

      {/* Reticular: Casetón + Ábaco perimetral + Pilares + Ábacos interiores */}
      {subtipo === "forjado_reticular" && (() => {
        const pilares = g.pilares || [];
        const abInt = g.abacosInteriores || [];
        const intereje = g.espaciado || 0.82;
        const casA = g.casetonAncho || 0.70;
        const casL = g.casetonLargo || 0.70;
        const nervA = g.nervioAncho || 0.12;

        const addPilar = () => {
          const nuevos = [...pilares, { nombre: `P${pilares.length + 1}`, x: +(dimXg / 2).toFixed(1), y: +(dimYg / 2).toFixed(1) }];
          onGeometriaChange({ ...g, pilares: nuevos });
        };
        const updatePilar = (idx: number, field: Partial<typeof pilares[0]>) => {
          const n = [...pilares]; n[idx] = { ...n[idx], ...field };
          onGeometriaChange({ ...g, pilares: n });
        };
        const removePilar = (idx: number) => {
          onGeometriaChange({ ...g, pilares: pilares.filter((_, i) => i !== idx) });
        };
        const addAbInt = () => {
          const n = [...abInt, { pilar: `P${abInt.length + 1}`, ancho: 1.20, largo: 1.20 }];
          onGeometriaChange({ ...g, abacosInteriores: n });
        };
        const updateAbInt = (idx: number, field: Partial<typeof abInt[0]>) => {
          const n = [...abInt]; n[idx] = { ...n[idx], ...field };
          onGeometriaChange({ ...g, abacosInteriores: n });
        };
        const removeAbInt = (idx: number) => {
          onGeometriaChange({ ...g, abacosInteriores: abInt.filter((_, i) => i !== idx) });
        };

        // Dimensiones del forjado para referencia
        const dimXg = g.dimensionX || g.lados[0]?.longitud || 10;
        const dimYg = g.dimensionY || g.lados[1]?.longitud || 8;

        return (
          <div className="space-y-3">
            {/* Casetón e intereje */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Casetón e intereje</label>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-gray-500">Casetón:</label>
                  <NumInput
                    value={Math.round(casA * 100)}
                    onChange={(v) => {
                      const ca = (v || 70) / 100;
                      onGeometriaChange({ ...g, casetonAncho: ca, espaciado: +(ca + (g.nervioAncho || 0.12)).toFixed(2) });
                    }}
                    decimals={false}
                    className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-12 text-center text-foreground focus:outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-gray-500">×</span>
                  <NumInput
                    value={Math.round(casL * 100)}
                    onChange={(v) => onGeometriaChange({ ...g, casetonLargo: (v || 70) / 100 })}
                    decimals={false}
                    className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-12 text-center text-foreground focus:outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-gray-500">cm</span>
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-gray-500">Nervio:</label>
                  <NumInput
                    value={Math.round(nervA * 100)}
                    onChange={(v) => {
                      const na = (v || 12) / 100;
                      onGeometriaChange({ ...g, nervioAncho: na, espaciado: +((g.casetonAncho || 0.70) + na).toFixed(2) });
                    }}
                    decimals={false}
                    className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-12 text-center text-foreground focus:outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-gray-500">cm</span>
                </div>
                <span className="text-[10px] text-blue-400 font-medium">
                  Intereje: {Math.round(intereje * 100)}cm
                </span>
              </div>
            </div>

            {/* Ábaco perimetral */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Ábaco perimetral (banda continua)</label>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-gray-500">Ancho banda:</label>
                  <NumInput
                    value={Math.round((g.anchoAbacoPerimetral || 1.20) * 100)}
                    onChange={(v) => onGeometriaChange({ ...g, anchoAbacoPerimetral: (v || 120) / 100 })}
                    decimals={false}
                    className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-14 text-center text-foreground focus:outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-gray-500">cm</span>
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-gray-500">Sep. neg:</label>
                  <NumInput
                    value={Math.round((g.espaciadoAbaco || 0.15) * 100)}
                    onChange={(v) => onGeometriaChange({ ...g, espaciadoAbaco: (v || 15) / 100 })}
                    decimals={false}
                    className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-12 text-center text-foreground focus:outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-gray-500">cm</span>
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-gray-500">Vuelo neg:</label>
                  <NumInput
                    value={Math.round((g.vueloAbaco || 0.50) * 100)}
                    onChange={(v) => onGeometriaChange({ ...g, vueloAbaco: (v || 50) / 100 })}
                    decimals={false}
                    className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-12 text-center text-foreground focus:outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-gray-500">cm</span>
                </div>
              </div>
            </div>

            {/* Pilares */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pilares</label>
                <button onClick={addPilar} className="text-[10px] text-accent hover:text-accent-dark font-medium">+ Añadir pilar</button>
              </div>
              {pilares.length > 0 && (
                <div className="space-y-1 mt-1">
                  {pilares.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-surface-light/50 rounded-lg px-2 py-1 flex-wrap">
                      <input
                        type="text"
                        value={p.nombre}
                        onChange={(e) => updatePilar(idx, { nombre: e.target.value })}
                        className="bg-transparent border-b border-border text-xs w-12 text-foreground focus:outline-none focus:border-accent"
                      />
                      <div className="flex items-center gap-1">
                        <label className="text-[10px] text-gray-500">X:</label>
                        <NumInput
                          value={p.x}
                          onChange={(v) => updatePilar(idx, { x: v })}
                          className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-14 text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-[10px] text-gray-500">Y:</label>
                        <NumInput
                          value={p.y}
                          onChange={(v) => updatePilar(idx, { y: v })}
                          className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-14 text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>
                      <span className="text-[10px] text-gray-500">m</span>
                      <button onClick={() => removePilar(idx)} className="text-red-400 hover:text-red-300 text-xs ml-auto">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ábacos interiores */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Ábacos interiores</label>
                <button onClick={addAbInt} className="text-[10px] text-accent hover:text-accent-dark font-medium">+ Añadir ábaco int.</button>
              </div>
              {abInt.length > 0 && (
                <div className="space-y-1 mt-1">
                  {abInt.map((ab, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-surface-light/50 rounded-lg px-2 py-1 flex-wrap">
                      <input
                        type="text"
                        value={ab.pilar}
                        onChange={(e) => updateAbInt(idx, { pilar: e.target.value })}
                        className="bg-transparent border-b border-border text-xs w-16 text-foreground focus:outline-none focus:border-accent"
                        placeholder="Pilar"
                      />
                      <div className="flex items-center gap-1">
                        <label className="text-[10px] text-gray-500">A:</label>
                        <NumInput
                          value={ab.ancho}
                          onChange={(v) => updateAbInt(idx, { ancho: v })}
                          className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-14 text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-[10px] text-gray-500">L:</label>
                        <NumInput
                          value={ab.largo}
                          onChange={(v) => updateAbInt(idx, { largo: v })}
                          className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-14 text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>
                      <span className="text-[10px] text-gray-500">m</span>
                      <button onClick={() => removeAbInt(idx)} className="text-red-400 hover:text-red-300 text-xs ml-auto">×</button>
                    </div>
                  ))}
                </div>
              )}
              {abInt.length === 0 && pilares.length === 0 && (
                <p className="text-[9px] text-gray-500 italic mt-1">Sin pilares interiores — solo ábaco perimetral continuo</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Esperas para muros — losa cimentación, zapata combinada, zapata corrida */}
      {(subtipo === "losa_cimentacion" || subtipo === "zapata_combinada" || subtipo === "zapata_corrida") && (() => {
        const cantoLosa = g.cantoLosa ?? 0.30;
        const cfgs = g.esperasPorLado || [];
        const findCfg = (idx: number): ConfigEsperaLado | undefined => cfgs.find((c) => c.ladoIdx === idx);

        const upsertEspera = (idx: number, partial: Partial<ConfigEsperaLado>) => {
          const existing = findCfg(idx);
          const base: ConfigEsperaLado = existing || {
            ladoIdx: idx,
            activo: true,
            diametro: 12,
            espaciado: 0.20,
            pliegue: 0.30,
            sobresale: 0.50,
            dosCaras: true,
          };
          const next = { ...base, ...partial };
          const nextList = existing
            ? cfgs.map((c) => (c.ladoIdx === idx ? next : c))
            : [...cfgs, next];
          updateField({ esperasPorLado: nextList });
        };

        const toggleEspera = (idx: number) => {
          const existing = findCfg(idx);
          if (existing) upsertEspera(idx, { activo: !existing.activo });
          else upsertEspera(idx, { activo: true });
        };

        const DiamSelectEsp = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
          <select
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:border-accent w-14"
          >
            {DIAMETROS_DISPONIBLES.map((d) => (
              <option key={d} value={d}>Ø{d}</option>
            ))}
          </select>
        );

        return (
          <div className="bg-surface-light/50 border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">Esperas para muros</label>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400">Canto losa:</span>
                <NumInput
                  value={Math.round(cantoLosa * 100)}
                  onChange={(v) => updateField({ cantoLosa: (v || 30) / 100 })}
                  decimals={false}
                  className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-12 text-foreground focus:outline-none focus:border-accent"
                />
                <span className="text-[10px] text-gray-500">cm</span>
              </div>
            </div>
            <p className="text-[9px] text-gray-500 italic">
              Marca los lados donde apoya un muro. La espera se ancla con su pliegue dentro de la losa y sobresale para empalmar con la armadura del muro.
            </p>
            <div className="space-y-1.5">
              {getPerimetrosLosa(g, tipo).map((per) => {
                const cfg = findCfg(per.idx);
                const activo = cfg?.activo ?? false;
                return (
                  <div key={per.idx} className="bg-surface-light/40 border border-border/50 rounded px-2 py-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activo}
                          onChange={() => toggleEspera(per.idx)}
                          className="accent-amber-500 w-3.5 h-3.5"
                        />
                        <span className="text-[11px] font-bold text-amber-400 w-20">{per.etiqueta}</span>
                      </label>
                      <span className="text-[10px] text-gray-500">{per.longitud}m</span>
                      {activo && cfg && (
                        <>
                          <span className="text-gray-600">|</span>
                          <span className="text-[10px] text-gray-400">Ø:</span>
                          <DiamSelectEsp value={cfg.diametro} onChange={(v) => upsertEspera(per.idx, { diametro: v })} />
                          <span className="text-[10px] text-gray-400">@</span>
                          <NumInput
                            value={Math.round(cfg.espaciado * 100)}
                            onChange={(v) => upsertEspera(per.idx, { espaciado: (v || 20) / 100 })}
                            decimals={false}
                            className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-12 text-foreground focus:outline-none focus:border-accent"
                          />
                          <span className="text-[10px] text-gray-500">cm</span>
                          <span className="text-gray-600">|</span>
                          <span className="text-[10px] text-gray-400">Pliegue:</span>
                          <NumInput
                            value={Math.round(cfg.pliegue * 100)}
                            onChange={(v) => upsertEspera(per.idx, { pliegue: (v || 0) / 100 })}
                            decimals={false}
                            className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-12 text-foreground focus:outline-none focus:border-accent"
                          />
                          <span className="text-[10px] text-gray-500">cm</span>
                          <span className="text-gray-600">|</span>
                          <span className="text-[10px] text-gray-400">Sobresale:</span>
                          <NumInput
                            value={Math.round(cfg.sobresale * 100)}
                            onChange={(v) => upsertEspera(per.idx, { sobresale: (v || 0) / 100 })}
                            decimals={false}
                            className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs w-12 text-foreground focus:outline-none focus:border-accent"
                          />
                          <span className="text-[10px] text-gray-500">cm</span>
                          <label className="flex items-center gap-1 cursor-pointer ml-auto">
                            <input
                              type="checkbox"
                              checked={cfg.dosCaras}
                              onChange={(e) => upsertEspera(per.idx, { dosCaras: e.target.checked })}
                              className="accent-amber-500 w-3.5 h-3.5"
                            />
                            <span className="text-[10px] text-gray-400">2 caras</span>
                          </label>
                        </>
                      )}
                    </div>
                    {activo && cfg && (() => {
                      const cant = Math.round(per.longitud / (cfg.espaciado || 0.20)) * (cfg.dosCaras ? 2 : 1);
                      const tramo = Math.max(0, cantoLosa - 0.05) + (cfg.sobresale || 0);
                      return (
                        <div className="text-[9px] text-amber-300/70 mt-1 pl-6">
                          → {cant} esperas Ø{cfg.diametro} de {tramo.toFixed(2)}m + pata {(cfg.pliegue || 0).toFixed(2)}m
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Zunchos (perimetrales o interiores) — losas y forjados (no zapatas) */}
      {tipo === "superficie" && !(subtipo && subtipo.includes("zapata")) && (() => {
        const zunchos = g.zunchos || [];
        const cantoLosaDef = g.cantoLosa;  // explicito; si no esta, no asumimos default 0.30
        const perim = +getPerimetroSuperficie(g).toFixed(2);

        const nuevoTramo = (longitud: number, nombre = "T1"): ZunchoTramo => ({
          id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          nombre,
          longitud: +longitud.toFixed(2),
        });

        const nuevoZuncho = (): ZunchoEnElemento => ({
          id: `z_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          nombre: `Z${zunchos.length + 1}`,
          ubicacion: "perimetral",
          tramos: [nuevoTramo(0, "T1")],
          ancho: 0.25,
          canto: cantoLosaDef ?? 0.30,
          longArriba: { diametro: 12, cantidad: 2 },
          longAbajo: { diametro: 12, cantidad: 2 },
          estribo: { diametro: 8, espaciado: 0.20, cerrado: true, longitudGancho: 0.10 },
        });

        const setZuncho = (idx: number, partial: Partial<ZunchoEnElemento>) => {
          const next = zunchos.map((z, i) => (i === idx ? { ...z, ...partial } : z));
          updateField({ zunchos: next });
        };

        const setEstribo = (idx: number, partial: Partial<ZunchoEnElemento["estribo"]>) => {
          const z = zunchos[idx];
          if (!z) return;
          setZuncho(idx, { estribo: { ...z.estribo, ...partial } });
        };

        const setLong = (idx: number, key: "longArriba" | "longAbajo", partial: Partial<ZunchoEnElemento["longArriba"]>) => {
          const z = zunchos[idx];
          if (!z) return;
          setZuncho(idx, { [key]: { ...z[key], ...partial } });
        };

        const removeZuncho = (idx: number) => {
          updateField({ zunchos: zunchos.filter((_, i) => i !== idx) });
        };

        // — Operaciones sobre tramos del zuncho
        const setTr = (zIdx: number, tIdx: number, partial: Partial<ZunchoTramo>) => {
          const z = zunchos[zIdx];
          if (!z) return;

          // En zunchos perimetrales, al cambiar la longitud de un tramo,
          // redistribuir el delta entre los demas tramos proporcionalmente
          // para mantener suma = perimetro.
          if (
            z.ubicacion === "perimetral" &&
            partial.longitud != null &&
            z.tramos.length > 1
          ) {
            const oldLong = z.tramos[tIdx]?.longitud || 0;
            const newLong = partial.longitud;
            const delta = newLong - oldLong;
            if (Math.abs(delta) > 0.001) {
              const sumaOtros = z.tramos.reduce(
                (s, t, i) => (i === tIdx ? s : s + (t.longitud || 0)),
                0
              );
              const minTramo = 0.20; // 20cm minimo absoluto al redistribuir
              if (sumaOtros > 0) {
                const tramosNuevos = z.tramos.map((t, i) => {
                  if (i === tIdx) return { ...t, ...partial };
                  const peso = (t.longitud || 0) / sumaOtros;
                  const nuevo = (t.longitud || 0) - delta * peso;
                  return { ...t, longitud: +Math.max(minTramo, nuevo).toFixed(2) };
                });
                setZuncho(zIdx, { tramos: tramosNuevos });
                return;
              }
            }
          }

          setZuncho(zIdx, { tramos: z.tramos.map((t, i) => (i === tIdx ? { ...t, ...partial } : t)) });
        };
        const addTr = (zIdx: number) => {
          const z = zunchos[zIdx];
          if (!z) return;
          const nuevoNombre = `T${z.tramos.length + 1}`;
          // Perimetral: el nuevo tramo "roba" longitud proporcionalmente para mantener perimetro
          if (z.ubicacion === "perimetral" && z.tramos.length >= 1) {
            const sumaActual = z.tramos.reduce((s, t) => s + (t.longitud || 0), 0);
            const longNuevo = +(sumaActual / (z.tramos.length + 1)).toFixed(2);
            const factor = (sumaActual - longNuevo) / sumaActual;
            const tramosAjustados = z.tramos.map((t) => ({
              ...t,
              longitud: +(((t.longitud || 0) * factor)).toFixed(2),
            }));
            setZuncho(zIdx, { tramos: [...tramosAjustados, nuevoTramo(longNuevo, nuevoNombre)] });
            return;
          }
          setZuncho(zIdx, { tramos: [...z.tramos, nuevoTramo(5, nuevoNombre)] });
        };
        const removeTr = (zIdx: number, tIdx: number) => {
          const z = zunchos[zIdx];
          if (!z || z.tramos.length <= 1) return;
          // Perimetral: la longitud del tramo eliminado se reparte entre los restantes
          if (z.ubicacion === "perimetral") {
            const longEliminado = z.tramos[tIdx]?.longitud || 0;
            const restantes = z.tramos.filter((_, i) => i !== tIdx);
            const sumaRest = restantes.reduce((s, t) => s + (t.longitud || 0), 0);
            if (sumaRest > 0 && longEliminado > 0) {
              const tramosAjustados = restantes.map((t) => {
                const peso = (t.longitud || 0) / sumaRest;
                return { ...t, longitud: +(((t.longitud || 0) + longEliminado * peso)).toFixed(2) };
              });
              setZuncho(zIdx, { tramos: tramosAjustados });
              return;
            }
          }
          setZuncho(zIdx, { tramos: z.tramos.filter((_, i) => i !== tIdx) });
        };

        // Cargar perimetro: aplica un reparto al zuncho
        const aplicarReparto = (zIdx: number, opcion: { tramos: number[]; nombres: string[] }) => {
          const tramos = opcion.tramos.map((L, i) => nuevoTramo(L, opcion.nombres[i] || `T${i + 1}`));
          setZuncho(zIdx, { tramos });
        };

        // — Estribos por tramo (espaciado variable)
        const setEstrTr = (zIdx: number, tIdx: number, partial: Partial<TramoEstribo>) => {
          const z = zunchos[zIdx];
          if (!z?.tramosEstribos) return;
          setZuncho(zIdx, { tramosEstribos: z.tramosEstribos.map((t, i) => (i === tIdx ? { ...t, ...partial } : t)) });
        };
        const addEstrTr = (zIdx: number) => {
          const z = zunchos[zIdx];
          if (!z) return;
          const tramos: TramoEstribo[] = [
            ...(z.tramosEstribos || []),
            { nombre: `EZ${(z.tramosEstribos?.length || 0) + 1}`, longitud: 1.0, espaciado: 0.10 },
          ];
          setZuncho(zIdx, { tramosEstribos: tramos });
        };
        const removeEstrTr = (zIdx: number, tIdx: number) => {
          const z = zunchos[zIdx];
          if (!z?.tramosEstribos) return;
          const next = z.tramosEstribos.filter((_, i) => i !== tIdx);
          setZuncho(zIdx, { tramosEstribos: next.length > 0 ? next : undefined });
        };

        // — Barras extra
        const addExtra = (zIdx: number) => {
          const z = zunchos[zIdx];
          if (!z) return;
          const next: BarraExtraZuncho[] = [
            ...(z.barrasExtra || []),
            {
              id: `be_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              nombre: "Refuerzo central",
              diametro: 12,
              cantidad: 2,
              longitudPct: 0.5,
              posicion: "arriba",
            },
          ];
          setZuncho(zIdx, { barrasExtra: next });
        };
        const removeExtra = (zIdx: number, bIdx: number) => {
          const z = zunchos[zIdx];
          if (!z?.barrasExtra) return;
          const next = z.barrasExtra.filter((_, i) => i !== bIdx);
          setZuncho(zIdx, { barrasExtra: next.length > 0 ? next : undefined });
        };
        const setExtra = (zIdx: number, bIdx: number, partial: Partial<BarraExtraZuncho>) => {
          const z = zunchos[zIdx];
          if (!z?.barrasExtra) return;
          setZuncho(zIdx, { barrasExtra: z.barrasExtra.map((b, i) => (i === bIdx ? { ...b, ...partial } : b)) });
        };

        const DiamSelectZ = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
          <select
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:border-accent w-14"
          >
            {DIAMETROS_DISPONIBLES.map((d) => (
              <option key={d} value={d}>Ø{d}</option>
            ))}
          </select>
        );

        return (
          <div className="bg-surface-light/50 border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wide">Zunchos</label>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-gray-500 italic">Perímetro: {perim}m</span>
                <button
                  onClick={() => updateField({ zunchos: [...zunchos, nuevoZuncho()] })}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-medium"
                >
                  + Añadir zuncho
                </button>
              </div>
            </div>

            {zunchos.length === 0 && (
              <p className="text-[9px] text-gray-500 italic">
                Añade zunchos perimetrales o interiores. Cada zuncho se compone de uno o más tramos (de pilar a pilar).
              </p>
            )}

            {zunchos.map((z, zIdx) => {
              const sumaTramos = +z.tramos.reduce((s, t) => s + (t.longitud || 0), 0).toFixed(2);
              const opciones = z.ubicacion === "perimetral"
                ? calcularOpcionesReparto(perim, 12, 2)
                : [];
              const cantoComp = cantoLosaDef ?? null;
              const esDescolgado = cantoComp != null && z.canto > cantoComp + 0.001;

              return (
                <div key={z.id} className="bg-surface-light/40 border border-border/50 rounded p-2 space-y-1.5">
                  {/* Cabecera */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={z.nombre}
                      onChange={(e) => setZuncho(zIdx, { nombre: e.target.value })}
                      className="bg-transparent border-b border-border text-xs font-bold text-cyan-400 w-20 focus:outline-none focus:border-accent"
                    />
                    <select
                      value={z.ubicacion}
                      onChange={(e) => setZuncho(zIdx, { ubicacion: e.target.value as "perimetral" | "interior" })}
                      className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground focus:outline-none focus:border-accent"
                    >
                      <option value="perimetral">Perimetral</option>
                      <option value="interior">Interior</option>
                    </select>
                    <span className="text-[9px] text-gray-500">
                      Suma tramos: {sumaTramos}m
                      {z.ubicacion === "perimetral" && Math.abs(sumaTramos - perim) > 0.05 && (
                        <span className="text-amber-400 ml-1">(perímetro {perim}m)</span>
                      )}
                    </span>
                    <button
                      onClick={() => removeZuncho(zIdx)}
                      className="ml-auto text-red-400 hover:text-red-300 text-xs"
                      title="Eliminar zuncho"
                    >×</button>
                  </div>

                  {/* Tramos */}
                  <div className="space-y-1 pl-2 border-l-2 border-cyan-700/30">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold text-cyan-400/80">Tramos:</span>
                      {z.ubicacion === "perimetral" && opciones.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const [tipoOp, valor] = e.target.value.split(":");
                            if (tipoOp === "iguales") {
                              const n = parseInt(valor);
                              const L = +(perim / n).toFixed(2);
                              aplicarReparto(zIdx, {
                                tramos: Array(n).fill(L),
                                nombres: Array.from({ length: n }, (_, i) => `T${i + 1}`),
                              });
                            } else if (tipoOp === "max") {
                              const [n12Str, restoStr] = valor.split(",");
                              const n12 = parseInt(n12Str);
                              const resto = parseFloat(restoStr);
                              const tramos = [...Array(n12).fill(12), resto];
                              aplicarReparto(zIdx, {
                                tramos,
                                nombres: tramos.map((_, i) => `T${i + 1}`),
                              });
                            }
                            e.target.value = "";
                          }}
                          className="bg-surface-light border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground focus:outline-none focus:border-accent"
                        >
                          <option value="" disabled>Cargar perímetro…</option>
                          {opciones[0]?.variante && (
                            <option value={`max:${opciones[0].variante.nMaximo},${opciones[0].variante.longitudResto}`}>
                              {opciones[0].variante.nMaximo} × 12m + 1 × {opciones[0].variante.longitudResto}m
                            </option>
                          )}
                          {opciones.map((op) => (
                            <option key={op.nTramos} value={`iguales:${op.nTramos}`}>
                              {op.nTramos} tramos iguales × {op.longitudPorTramo}m
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => addTr(zIdx)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-medium ml-auto"
                      >
                        + Tramo
                      </button>
                    </div>
                    {z.tramos.map((tr, tIdx) => {
                      const tieneSecOverride = tr.ancho != null || tr.canto != null;
                      return (
                        <div key={tr.id} className="bg-surface-light/30 rounded px-1.5 py-1 text-[10px] space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <input
                              type="text"
                              value={tr.nombre}
                              onChange={(e) => setTr(zIdx, tIdx, { nombre: e.target.value })}
                              className="bg-transparent border-b border-border w-16 text-foreground focus:outline-none focus:border-accent"
                              placeholder="P1→P2"
                            />
                            <span className="text-gray-500">L:</span>
                            <NumInput
                              value={tr.longitud}
                              onChange={(v) => setTr(zIdx, tIdx, { longitud: v })}
                              className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-16 text-foreground focus:outline-none focus:border-accent"
                            />
                            <span className="text-gray-500">m</span>
                            <button
                              onClick={() => {
                                if (tieneSecOverride) {
                                  setTr(zIdx, tIdx, { ancho: undefined, canto: undefined });
                                } else {
                                  setTr(zIdx, tIdx, { ancho: z.ancho, canto: z.canto });
                                }
                              }}
                              className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                tieneSecOverride
                                  ? "border-cyan-500/50 bg-cyan-900/20 text-cyan-300 hover:bg-cyan-900/30"
                                  : "border-border text-gray-500 hover:text-gray-300 hover:border-gray-500"
                              }`}
                              title={tieneSecOverride ? "Quitar sección propia" : "Sección propia para este tramo"}
                            >
                              {tieneSecOverride ? "★ sec." : "+ sec."}
                            </button>
                            {z.tramos.length > 1 && (
                              <button
                                onClick={() => removeTr(zIdx, tIdx)}
                                className="ml-auto text-red-400 hover:text-red-300"
                                title="Eliminar tramo"
                              >×</button>
                            )}
                          </div>
                          {/* Sección propia del tramo, inline (no popover) */}
                          {tieneSecOverride && (
                            <div className="flex items-center gap-1.5 flex-wrap pl-3 border-l-2 border-cyan-700/40">
                              <span className="text-[9px] text-cyan-400/80">Sección propia:</span>
                              <span className="text-[9px] text-gray-500">ancho</span>
                              <NumInput
                                value={Math.round((tr.ancho ?? z.ancho) * 100)}
                                onChange={(v) => setTr(zIdx, tIdx, { ancho: (v || Math.round(z.ancho * 100)) / 100 })}
                                decimals={false}
                                className="bg-surface-light border border-border rounded px-1 py-0.5 w-12 text-[9px] text-foreground focus:outline-none focus:border-accent"
                              />
                              <span className="text-[9px] text-gray-500">cm × canto</span>
                              <NumInput
                                value={Math.round((tr.canto ?? z.canto) * 100)}
                                onChange={(v) => setTr(zIdx, tIdx, { canto: (v || Math.round(z.canto * 100)) / 100 })}
                                decimals={false}
                                className="bg-surface-light border border-border rounded px-1 py-0.5 w-12 text-[9px] text-foreground focus:outline-none focus:border-accent"
                              />
                              <span className="text-[9px] text-gray-500">cm</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Sección común */}
                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                    <span className="text-gray-400">Sección común:</span>
                    <span className="text-gray-500">ancho</span>
                    <NumInput
                      value={Math.round(z.ancho * 100)}
                      onChange={(v) => setZuncho(zIdx, { ancho: (v || 25) / 100 })}
                      decimals={false}
                      className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-12 text-foreground focus:outline-none focus:border-accent"
                    />
                    <span className="text-gray-500">cm × canto</span>
                    <NumInput
                      value={Math.round(z.canto * 100)}
                      onChange={(v) => setZuncho(zIdx, { canto: (v || 30) / 100 })}
                      decimals={false}
                      className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-12 text-foreground focus:outline-none focus:border-accent"
                    />
                    <span className="text-gray-500">cm</span>
                    {esDescolgado && (
                      <span className="text-cyan-400/70 text-[9px]">(descolgado/peraltado +{Math.round((z.canto - (cantoComp ?? 0)) * 100)}cm)</span>
                    )}
                    <span className="text-gray-600">|</span>
                    <span className="text-gray-500">recubr.</span>
                    <NumInput
                      value={Math.round((z.recubrimiento ?? recubrimientoBase ?? 0.05) * 100)}
                      onChange={(v) => setZuncho(zIdx, { recubrimiento: (v || 5) / 100 })}
                      decimals={false}
                      className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-12 text-foreground focus:outline-none focus:border-accent"
                    />
                    <span className="text-gray-500">cm</span>
                    {z.recubrimiento == null && (
                      <span className="text-[9px] text-gray-500 italic">(heredado)</span>
                    )}
                  </div>

                  {/* Solape entre tramos */}
                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                    <span className="text-gray-400">Solape entre tramos:</span>
                    <NumInput
                      value={Math.round((z.solapeEntreTramos ?? 0) * 100)}
                      onChange={(v) => setZuncho(zIdx, { solapeEntreTramos: v == null || v <= 0 ? undefined : v / 100 })}
                      decimals={false}
                      className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-14 text-foreground focus:outline-none focus:border-accent"
                    />
                    <span className="text-gray-500">cm</span>
                    {z.solapeEntreTramos == null && (
                      <span className="text-[9px] text-gray-500 italic">(usa solape EHE-08 según Ø)</span>
                    )}
                  </div>

                  {/* Longitudinales */}
                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                    <span className="text-gray-400 w-20">Long. arriba:</span>
                    <DiamSelectZ value={z.longArriba.diametro} onChange={(v) => setLong(zIdx, "longArriba", { diametro: v })} />
                    <span className="text-gray-500">×</span>
                    <NumInput
                      value={z.longArriba.cantidad}
                      onChange={(v) => setLong(zIdx, "longArriba", { cantidad: Math.max(0, Math.round(v || 0)) })}
                      decimals={false}
                      className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-12 text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                    <span className="text-gray-400 w-20">Long. abajo:</span>
                    <DiamSelectZ value={z.longAbajo.diametro} onChange={(v) => setLong(zIdx, "longAbajo", { diametro: v })} />
                    <span className="text-gray-500">×</span>
                    <NumInput
                      value={z.longAbajo.cantidad}
                      onChange={(v) => setLong(zIdx, "longAbajo", { cantidad: Math.max(0, Math.round(v || 0)) })}
                      decimals={false}
                      className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-12 text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>

                  {/* Estribos */}
                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                    <span className="text-gray-400 w-20">Estribos:</span>
                    <DiamSelectZ value={z.estribo.diametro} onChange={(v) => setEstribo(zIdx, { diametro: v })} />
                    <span className="text-gray-500">@</span>
                    <NumInput
                      value={Math.round(z.estribo.espaciado * 100)}
                      onChange={(v) => setEstribo(zIdx, { espaciado: (v || 20) / 100 })}
                      decimals={false}
                      className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-12 text-foreground focus:outline-none focus:border-accent"
                    />
                    <span className="text-gray-500">cm</span>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={z.estribo.cerrado}
                        onChange={(e) => setEstribo(zIdx, { cerrado: e.target.checked })}
                        className="accent-cyan-500 w-3.5 h-3.5"
                      />
                      <span className="text-gray-400">cerrado</span>
                    </label>
                    {z.estribo.cerrado && (
                      <>
                        <span className="text-gray-500">gancho</span>
                        <NumInput
                          value={Math.round((z.estribo.longitudGancho ?? 0.10) * 100)}
                          onChange={(v) => setEstribo(zIdx, { longitudGancho: (v || 10) / 100 })}
                          decimals={false}
                          className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-12 text-foreground focus:outline-none focus:border-accent"
                        />
                        <span className="text-gray-500">cm</span>
                      </>
                    )}
                  </div>

                  {/* Tramos de estribos (espaciado variable) */}
                  <details className="text-[10px]">
                    <summary className="text-gray-400 cursor-pointer hover:text-foreground">
                      Estribos por tramo (espaciado variable) {z.tramosEstribos && z.tramosEstribos.length > 0 ? `(${z.tramosEstribos.length})` : ""}
                    </summary>
                    <div className="mt-1 space-y-1 pl-2">
                      {(z.tramosEstribos || []).map((te, tIdx) => (
                        <div key={tIdx} className="flex items-center gap-1.5 flex-wrap bg-surface-light/30 rounded px-1.5 py-1">
                          <input
                            type="text"
                            value={te.nombre}
                            onChange={(e) => setEstrTr(zIdx, tIdx, { nombre: e.target.value })}
                            className="bg-transparent border-b border-border w-16 text-foreground focus:outline-none focus:border-accent"
                          />
                          <span className="text-gray-500">L:</span>
                          <NumInput
                            value={te.longitud}
                            onChange={(v) => setEstrTr(zIdx, tIdx, { longitud: v })}
                            className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-14 text-foreground focus:outline-none focus:border-accent"
                          />
                          <span className="text-gray-500">m @</span>
                          <NumInput
                            value={Math.round(te.espaciado * 100)}
                            onChange={(v) => setEstrTr(zIdx, tIdx, { espaciado: (v || 20) / 100 })}
                            decimals={false}
                            className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-12 text-foreground focus:outline-none focus:border-accent"
                          />
                          <span className="text-gray-500">cm</span>
                          <button
                            onClick={() => removeEstrTr(zIdx, tIdx)}
                            className="ml-auto text-red-400 hover:text-red-300"
                          >×</button>
                        </div>
                      ))}
                      <button
                        onClick={() => addEstrTr(zIdx)}
                        className="text-cyan-400 hover:text-cyan-300 font-medium"
                      >
                        + Añadir zona
                      </button>
                    </div>
                  </details>

                  {/* Barras extra */}
                  <details className="text-[10px]">
                    <summary className="text-gray-400 cursor-pointer hover:text-foreground">
                      Barras adicionales {z.barrasExtra && z.barrasExtra.length > 0 ? `(${z.barrasExtra.length})` : ""}
                    </summary>
                    <div className="mt-1 space-y-1 pl-2">
                      {(z.barrasExtra || []).map((be, bIdx) => (
                        <div key={be.id} className="flex items-center gap-1.5 flex-wrap bg-surface-light/30 rounded px-1.5 py-1">
                          <input
                            type="text"
                            value={be.nombre}
                            onChange={(e) => setExtra(zIdx, bIdx, { nombre: e.target.value })}
                            placeholder="nombre"
                            className="bg-transparent border-b border-border w-24 text-foreground focus:outline-none focus:border-accent"
                          />
                          <DiamSelectZ value={be.diametro} onChange={(v) => setExtra(zIdx, bIdx, { diametro: v })} />
                          <span className="text-gray-500">×</span>
                          <NumInput
                            value={be.cantidad}
                            onChange={(v) => setExtra(zIdx, bIdx, { cantidad: Math.max(0, Math.round(v || 0)) })}
                            decimals={false}
                            className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-12 text-foreground focus:outline-none focus:border-accent"
                          />
                          <select
                            value={be.posicion}
                            onChange={(e) => setExtra(zIdx, bIdx, { posicion: e.target.value as BarraExtraZuncho["posicion"] })}
                            className="bg-surface-light border border-border rounded px-1 py-0.5 text-foreground focus:outline-none focus:border-accent"
                          >
                            <option value="arriba">arriba</option>
                            <option value="abajo">abajo</option>
                            <option value="centro">centro</option>
                          </select>
                          {be.longitud != null ? (
                            <>
                              <span className="text-gray-500">L:</span>
                              <NumInput
                                value={be.longitud}
                                onChange={(v) => setExtra(zIdx, bIdx, { longitud: v })}
                                className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-14 text-foreground focus:outline-none focus:border-accent"
                              />
                              <span className="text-gray-500">m</span>
                              <button
                                onClick={() => setExtra(zIdx, bIdx, { longitud: undefined, longitudPct: 0.5 })}
                                className="text-gray-500 hover:text-gray-300 text-[9px]"
                                title="Usar % en su lugar"
                              >→%</button>
                            </>
                          ) : (
                            <>
                              <span className="text-gray-500">% del tramo:</span>
                              <NumInput
                                value={Math.round((be.longitudPct ?? 0.5) * 100)}
                                onChange={(v) => setExtra(zIdx, bIdx, { longitudPct: Math.min(1, Math.max(0, (v || 50) / 100)) })}
                                decimals={false}
                                className="bg-surface-light border border-border rounded px-1.5 py-0.5 w-12 text-foreground focus:outline-none focus:border-accent"
                              />
                              <span className="text-gray-500">%</span>
                              <button
                                onClick={() => setExtra(zIdx, bIdx, { longitud: 1, longitudPct: undefined })}
                                className="text-gray-500 hover:text-gray-300 text-[9px]"
                                title="Usar metros en su lugar"
                              >→m</button>
                            </>
                          )}
                          <button
                            onClick={() => removeExtra(zIdx, bIdx)}
                            className="ml-auto text-red-400 hover:text-red-300"
                          >×</button>
                        </div>
                      ))}
                      <button
                        onClick={() => addExtra(zIdx)}
                        className="text-cyan-400 hover:text-cyan-300 font-medium"
                      >
                        + Añadir barra
                      </button>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Info preview — superficies */}
      {tipo === "superficie" && (() => {
        const esp = g.espaciado || 0.20;
        const zw = g.anchoZuncho || 0;
        const huecos = g.huecos || [];

        let zonasInfo: string[] = [];
        if (g.forma === "l" && g.lados.length >= 6) {
          const a = g.lados[0].longitud, b = g.lados[1].longitud;
          const d = g.lados[3].longitud, e = g.lados[4].longitud;
          const nA = zw > 0 ? Math.max(a - 2 * zw, 0) : a;
          const nB = zw > 0 ? Math.max(b - 2 * zw, 0) : b;
          const nD = zw > 0 ? Math.max(d - 2 * zw, 0) : d;
          const nE = zw > 0 ? Math.max(e - 2 * zw, 0) : e;
          zonasInfo.push(`Sup: ${getEtiqueta(0)}=${a}m×${Math.round(nB / esp)}uds + ${getEtiqueta(1)}=${b}m×${Math.round(nA / esp)}uds`);
          zonasInfo.push(`Inf: ${getEtiqueta(4)}=${e}m×${Math.round(nD / esp)}uds + ${getEtiqueta(3)}=${d}m×${Math.round(nE / esp)}uds`);
        } else {
          const zonas = getZonasSuperficie();
          const nombresZ = getNombresZonaSuperficie(g.forma);
          for (let i = 0; i < zonas.length; i++) {
            const z = zonas[i];
            const netL = zw > 0 ? Math.max(z.largo.longitud - 2 * zw, 0) : z.largo.longitud;
            const netA = zw > 0 ? Math.max(z.ancho.longitud - 2 * zw, 0) : z.ancho.longitud;
            const cantL = Math.round(netA / esp);
            const cantA = Math.round(netL / esp);
            const prefix = nombresZ.length > 0 ? `${nombresZ[i]}: ` : "";
            const lL = getEtiqueta(z.idx), lA = getEtiqueta(z.idx + 1);
            zonasInfo.push(`${prefix}${lL}=${z.largo.longitud}m×${cantL}uds + ${lA}=${z.ancho.longitud}m×${cantA}uds`);
          }
        }

        const parts: string[] = [...zonasInfo];
        if (zw > 0) parts.push(`Zuncho: ${Math.round(zw * 100)}cm`);
        if (huecos.length > 0) {
          const hStr = huecos.map(h => {
            const pos = (h.x !== undefined && h.y !== undefined) ? ` @(${h.x},${h.y})` : "";
            return `${h.nombre} ${h.largo}×${h.ancho}m${pos}`;
          }).join(", ");
          parts.push(`Huecos: ${hStr}`);
        }

        return (
          <div className="text-[10px] text-gray-600">
            {parts.join(" | ")} <span>(por capa)</span>
          </div>
        );
      })()}
      {/* Info preview — muro */}
      {tipo === "muro" && (
        <div className="text-[10px] text-gray-600">
          {g.lados.map((l, i) => `${getEtiqueta(i)}=${l.longitud}m`).join(" + ")}
          {g.alto ? ` — Alto ${g.alto}m` : ""}
        </div>
      )}
      {/* Info preview — lineal */}
      {tipo === "lineal" && (
        <div className="text-[10px] text-gray-600">
          {g.lados.map((l, i) => `${getEtiqueta(i)}=${l.longitud}m`).join(" + ")}
          {g.seccionAncho && g.seccionAlto ? ` — Seccion ${g.seccionAncho}×${g.seccionAlto}m` : ""}
        </div>
      )}
      {/* Info preview — pilar */}
      {tipo === "pilar" && (
        <div className="text-[10px] text-gray-600">
          {g.lados.map((l, i) => `${getEtiqueta(i)}=${l.longitud}m`).join(", ")}
          {g.alto ? ` — Alto ${g.alto}m` : ""}
          {g.seccionAncho && g.seccionAlto ? ` — Seccion ${g.seccionAncho}×${g.seccionAlto}m` : ""}
        </div>
      )}
    </div>
  );
}
