"use client";

import { useState } from "react";
import { BarraNecesaria, CategoriaElemento, DIAMETROS_DISPONIBLES, PosicionSolape, SOLAPES_ESTANDAR } from "@/lib/ferrapp/types";
import { getEtiquetasMerged } from "@/lib/ferrapp/plantillas";
import { useFerrappStore } from "@/stores/ferrappStore";
import NumInput from "./NumInput";

interface BarraInputProps {
  barra: BarraNecesaria;
  longitudMax: number;
  solapeActual: number;                        // solape efectivo aplicado (override por posicion o global)
  posicionSolape?: PosicionSolape;             // cubeta a la que pertenece esta barra (si conocida)
  categoria: CategoriaElemento;
  onSolapeChange: (diametro: number, valor: number, posicion?: PosicionSolape) => void;
  onChange: (barra: BarraNecesaria) => void;
  onDelete: () => void;
}

export default function BarraInput({ barra, longitudMax, solapeActual, posicionSolape, categoria, onSolapeChange, onChange, onDelete }: BarraInputProps) {
  const [modoCustom, setModoCustom] = useState(false);
  const { etiquetasCustom, saveEtiquetaCustom } = useFerrappStore();
  const nPatas = barra.patas || 0;
  const lPata = barra.longitudPata || 0.15;
  const longitudTotal = barra.longitud + nPatas * lPata;
  const tieneSolape = longitudTotal > longitudMax;

  const { predefinidas, custom } = getEtiquetasMerged(categoria, etiquetasCustom);
  const todasEtiquetas = [...predefinidas, ...custom];
  const esEtiquetaPredefinida = todasEtiquetas.includes(barra.etiqueta);

  const solapeEstandar = SOLAPES_ESTANDAR[barra.diametro] || 0.50;

  return (
    <div className={`bg-surface rounded-lg p-3 border space-y-1.5 ${tieneSolape ? "border-amber-500/40" : "border-border"}`}>
      {/* Fila 1: Etiqueta completa */}
      <div className="flex items-center gap-2">
        {!modoCustom && (esEtiquetaPredefinida || !barra.etiqueta) ? (
          <select
            value={esEtiquetaPredefinida ? barra.etiqueta : ""}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setModoCustom(true);
              } else {
                onChange({ ...barra, etiqueta: e.target.value });
              }
            }}
            className="bg-surface-light border border-border rounded px-3 py-1.5 text-sm flex-1 text-foreground focus:outline-none focus:border-accent"
          >
            <option value="" disabled>Seleccionar tipo de barra...</option>
            {predefinidas.map((et) => (
              <option key={et} value={et}>{et}</option>
            ))}
            {custom.length > 0 && (
              <optgroup label="Mis etiquetas">
                {custom.map((et) => (
                  <option key={`c_${et}`} value={et}>{et}</option>
                ))}
              </optgroup>
            )}
            <option value="__custom__">Personalizar...</option>
          </select>
        ) : (
          <div className="flex items-center gap-1 flex-1">
            <input
              type="text"
              value={barra.etiqueta}
              onChange={(e) => onChange({ ...barra, etiqueta: e.target.value })}
              placeholder="Etiqueta personalizada"
              autoFocus={modoCustom}
              className="bg-surface-light border border-border rounded px-3 py-1.5 text-sm flex-1 text-foreground placeholder:text-gray-500 focus:outline-none focus:border-accent"
            />
            {barra.etiqueta && !esEtiquetaPredefinida && (
              <button
                onClick={() => {
                  saveEtiquetaCustom(categoria, barra.etiqueta);
                  setModoCustom(false);
                }}
                className="text-green-400 hover:text-green-300 text-[10px] px-1.5 py-0.5 shrink-0 border border-green-700 rounded"
                title="Guardar etiqueta para reusar"
              >
                Guardar
              </button>
            )}
            <button
              onClick={() => {
                setModoCustom(false);
                if (!esEtiquetaPredefinida) onChange({ ...barra, etiqueta: "" });
              }}
              className="text-gray-500 hover:text-accent text-[10px] px-1.5 py-0.5 shrink-0 border border-border rounded"
              title="Volver a lista"
            >
              Lista
            </button>
          </div>
        )}
        <button
          onClick={onDelete}
          className="text-danger hover:text-red-300 p-0.5 transition-colors shrink-0"
          title="Eliminar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>

      {/* Fila 2: Diametro + Long + Cant + Pliegues — todo compacto */}
      <div className="flex items-center gap-1.5 text-xs">
        <select
          value={barra.diametro}
          onChange={(e) => onChange({ ...barra, diametro: Number(e.target.value) })}
          className="bg-surface-light border border-border rounded px-1.5 py-1 text-xs text-foreground focus:outline-none focus:border-accent"
        >
          {DIAMETROS_DISPONIBLES.map((d) => (
            <option key={d} value={d}>d{d}</option>
          ))}
        </select>

        <NumInput
          value={barra.longitud}
          onChange={(v) => onChange({ ...barra, longitud: v })}
          className="bg-surface-light border border-border rounded px-1.5 py-1 text-xs w-16 text-foreground focus:outline-none focus:border-accent"
        />
        <span className="text-gray-500">m</span>

        <span className="text-gray-600">x</span>
        <NumInput
          value={barra.cantidad}
          onChange={(v) => onChange({ ...barra, cantidad: v || 1 })}
          decimals={false}
          className="bg-surface-light border border-border rounded px-1.5 py-1 text-xs w-12 text-foreground focus:outline-none focus:border-accent"
        />

        <span className="text-gray-700 mx-0.5">|</span>

        <select
          value={nPatas}
          onChange={(e) => onChange({ ...barra, patas: Number(e.target.value) })}
          className="bg-surface-light border border-border rounded px-1.5 py-1 text-xs text-foreground focus:outline-none focus:border-accent"
        >
          <option value={0}>Sin pliegue</option>
          <option value={1}>1 pliegue</option>
          <option value={2}>2 pliegues</option>
        </select>
        {nPatas > 0 && (
          <>
            <select
              value={lPata}
              onChange={(e) => onChange({ ...barra, longitudPata: parseFloat(e.target.value) })}
              className="bg-surface-light border border-border rounded px-1.5 py-1 text-xs text-foreground focus:outline-none focus:border-accent"
            >
              <option value={0.10}>10cm</option>
              <option value={0.15}>15cm</option>
              <option value={0.20}>20cm</option>
              <option value={0.25}>25cm</option>
              <option value={0.30}>30cm</option>
              <option value={0.40}>40cm</option>
              <option value={0.50}>50cm</option>
            </select>
            <span className="text-gray-500">= {longitudTotal.toFixed(2)}m</span>
          </>
        )}
      </div>

      {/* Fila 3: Solape (solo si aplica — barra > longitud comercial) */}
      {tieneSolape && (
        <div className="flex items-center gap-1.5 bg-amber-900/30 border border-amber-500/30 rounded px-2 py-1 text-xs">
          <span className="text-amber-400 font-medium">Solape:</span>
          <input
            type="number"
            min={0}
            step={1}
            value={Math.round(solapeActual * 100)}
            onChange={(e) => {
              const cm = parseInt(e.target.value);
              if (isNaN(cm) || cm < 0) return;
              onSolapeChange(barra.diametro, cm / 100, posicionSolape);
            }}
            className="bg-amber-900/40 border border-amber-600/30 rounded px-1.5 py-0.5 text-xs text-amber-300 w-14 text-center focus:outline-none focus:border-amber-400"
          />
          <span className="text-amber-500/70">cm</span>
          {Math.abs(solapeActual - solapeEstandar) < 0.005 && (
            <span className="text-amber-600/60 text-[10px]">(EHE)</span>
          )}
          <span className="text-amber-500/70">
            | {longitudTotal.toFixed(2)}m &gt; {longitudMax}m
          </span>
          {(() => {
            const longitudEfectiva = longitudMax - solapeActual;
            const numTramos = Math.ceil(longitudTotal / longitudEfectiva);
            return (
              <span className="text-amber-400/80 ml-1">
                → {numTramos} tramos, {numTramos - 1} empalme{numTramos > 2 ? "s" : ""} de {Math.round(solapeActual * 100)}cm
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
}
