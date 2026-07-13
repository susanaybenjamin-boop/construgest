"use client";

import { useState } from "react";
import { ElementoEstructural } from "@/lib/ferrapp/types";
import { MALLAZOS, calcularMallazoElemento } from "@/lib/ferrapp/mallazo";
import { getTipoGeometria } from "@/lib/ferrapp/generadores";

interface Props {
  elemento: ElementoEstructural;
  onChange: (mallazo: ElementoEstructural["mallazo"]) => void;
}

/**
 * Panel para configurar mallazo electrosoldado en una superficie.
 * Calcula en vivo los paneles 6×2.2 necesarios y los kg.
 */
export default function MallazoConfig({ elemento, onChange }: Props) {
  const tipoGeo = getTipoGeometria(elemento.categoria || "libre", elemento.subtipo);
  const aplicable = tipoGeo === "superficie" || tipoGeo === "escalera";
  const activo = !!elemento.mallazo;
  const [abierto, setAbierto] = useState(activo);

  if (!aplicable) return null;

  const cfg = elemento.mallazo;
  const seleccionado = cfg ? MALLAZOS.find((m) => m.ref === cfg.ref) : undefined;
  const resultado = activo ? calcularMallazoElemento(elemento) : null;

  const toggleActivo = () => {
    if (activo) {
      onChange(undefined);
      setAbierto(false);
    } else {
      // Default: ME 15x15 Ø6, una capa
      onChange({ ref: "ME 15x15 Ø6", capas: 1 });
      setAbierto(true);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <button
          onClick={() => setAbierto(!abierto)}
          className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-accent transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            className={`transition-transform ${abierto ? "rotate-90" : ""}`}
            fill="currentColor"
          >
            <path d="M6 4l4 4-4 4z" />
          </svg>
          <span className="text-accent">▦</span> Mallazo electrosoldado
          {activo && resultado && (
            <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded ml-1">
              {resultado.panelesTotal} paneles · {resultado.pesoKg.toFixed(0)} kg
            </span>
          )}
          {!activo && (
            <span className="text-[10px] text-gray-500 ml-1">(opcional)</span>
          )}
        </button>
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={activo}
            onChange={toggleActivo}
            className="rounded border-border accent-accent"
          />
          {activo ? "Activado" : "Desactivado"}
        </label>
      </div>

      {abierto && activo && cfg && (
        <div className="border-t border-border p-3 space-y-3">
          {/* Selector de tipo de mallazo */}
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Referencia (UNE 36092)</label>
            <select
              value={cfg.ref}
              onChange={(e) => onChange({ ...cfg, ref: e.target.value })}
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
            >
              {MALLAZOS.map((m) => (
                <option key={m.ref} value={m.ref}>
                  {m.ref} — {m.pesoKgM2.toFixed(2)} kg/m² ({m.largoPanel}×{m.anchoPanel}m)
                </option>
              ))}
            </select>
          </div>

          {/* Capas + solape */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Capas</label>
              <div className="flex bg-surface-light rounded-lg p-0.5">
                {[1, 2].map((n) => (
                  <button
                    key={n}
                    onClick={() => onChange({ ...cfg, capas: n })}
                    className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      cfg.capas === n
                        ? "bg-accent text-black"
                        : "text-gray-400 hover:text-foreground"
                    }`}
                  >
                    {n === 1 ? "Una" : "Dos (sup+inf)"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">
                Solape entre paneles (m)
              </label>
              <input
                type="number"
                step="0.05"
                min="0"
                value={cfg.solape ?? seleccionado?.retícula ?? 0.15}
                onChange={(e) =>
                  onChange({
                    ...cfg,
                    solape: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent"
                placeholder={`Default ${seleccionado?.retícula ?? 0.15}m`}
              />
            </div>
          </div>

          {/* Resultado en vivo */}
          {resultado && (
            <div className="bg-surface-light rounded-lg p-3 grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-xl font-bold text-accent">{resultado.panelesTotal}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">PANELES</div>
              </div>
              <div>
                <div className="text-xl font-bold text-foreground">
                  {resultado.m2Comprados.toFixed(0)}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">m² COMPRADOS</div>
              </div>
              <div>
                <div className="text-xl font-bold text-foreground">
                  {resultado.pesoKg.toFixed(0)}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">kg TOTAL</div>
              </div>
              <div>
                <div
                  className={`text-xl font-bold ${
                    resultado.porcentajeDesperdicio < 15
                      ? "text-success"
                      : resultado.porcentajeDesperdicio < 30
                      ? "text-accent"
                      : "text-danger"
                  }`}
                >
                  {resultado.porcentajeDesperdicio.toFixed(0)}%
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">DESPERDICIO</div>
              </div>
            </div>
          )}

          {/* Detalle del strip-packing geométrico */}
          {resultado?.estrategia === "geometrico" && resultado.franjas && resultado.franjas.length > 0 && (
            <details className="bg-surface-light rounded-lg p-3">
              <summary className="text-xs text-gray-300 cursor-pointer hover:text-accent select-none flex items-center justify-between">
                <span>
                  ▦ Strip-packing geom&eacute;trico — {resultado.franjas.length} franjas
                  {resultado.retalesReusados ? `, ${resultado.retalesReusados} retales reaprovechados` : ""}
                </span>
                <span className="text-[10px] text-gray-500">click para ver</span>
              </summary>
              <table className="w-full mt-2 text-[11px]">
                <thead>
                  <tr className="text-gray-400 border-b border-border">
                    <th className="text-left py-1">Franja Y</th>
                    <th className="text-left py-1">Segmentos (m)</th>
                    <th className="text-right py-1">Paneles nuevos</th>
                    <th className="text-right py-1">Retales</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.franjas.map((f, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1 text-gray-300">y={f.y}</td>
                      <td className="py-1 text-gray-400">
                        {f.segmentos.map((s) => `${s.longitud}m`).join(" + ")}
                      </td>
                      <td className="py-1 text-right text-accent font-medium">+{f.panelesNuevos}</td>
                      <td className="py-1 text-right text-gray-400">{f.retalesUsados || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          <div className="text-[10px] text-gray-500 leading-relaxed">
            {resultado?.estrategia === "geometrico"
              ? "Optimizador geom&eacute;trico: lee el contorno real, coloca paneles enteros, corta en los bordes y reaprovecha retales > 50 cm en franjas posteriores. Si quieres ajustar al m&iacute;nimo te&oacute;rico, baja el solape a 0 (butt-join, t&iacute;pico para mallazo antifisuraci&oacute;n)."
              : "Modelo basado en m&sup2; con factor de solape (sin pol&iacute;gono concreto disponible)."}
          </div>
        </div>
      )}
    </div>
  );
}
