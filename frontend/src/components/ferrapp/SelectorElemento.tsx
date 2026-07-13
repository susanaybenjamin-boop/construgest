"use client";

import { useState } from "react";
import { CategoriaElemento, CATEGORIAS_INFO, PlantillaElemento } from "@/lib/ferrapp/types";
import { PLANTILLAS, getPlantillasPorCategoria } from "@/lib/ferrapp/plantillas";

interface SelectorElementoProps {
  onSelect: (nombre: string, subtipo?: string) => void;
  onClose: () => void;
}

const CATEGORIAS_ORDEN: CategoriaElemento[] = [
  "cimentacion",
  "vertical",
  "forjado",
  "vigas",
  "escaleras",
  "especiales",
];

export default function SelectorElemento({ onSelect, onClose }: SelectorElementoProps) {
  const [catActiva, setCatActiva] = useState<CategoriaElemento>("cimentacion");
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<PlantillaElemento | null>(null);
  const [nombre, setNombre] = useState("");

  const plantillas = getPlantillasPorCategoria(catActiva);

  const seleccionarPlantilla = (p: PlantillaElemento) => {
    setPlantillaSeleccionada(p);
    setNombre(p.nombre);
  };

  const confirmar = () => {
    const nombreFinal = nombre.trim() || plantillaSeleccionada?.nombre || "Elemento";
    onSelect(nombreFinal, plantillaSeleccionada?.subtipo);
  };

  const crearLibre = () => {
    onSelect(nombre.trim() || "Elemento libre");
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl border border-border w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">Nuevo elemento</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-foreground text-xl leading-none">&times;</button>
        </div>

        {/* Tabs de categoria */}
        <div className="px-4 py-3 border-b border-border flex flex-wrap gap-1.5">
          {CATEGORIAS_ORDEN.map((cat) => {
            const info = CATEGORIAS_INFO[cat];
            const count = getPlantillasPorCategoria(cat).length;
            return (
              <button
                key={cat}
                onClick={() => {
                  setCatActiva(cat);
                  setPlantillaSeleccionada(null);
                  setNombre("");
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  catActiva === cat
                    ? "bg-accent text-black"
                    : "bg-surface-light text-gray-400 hover:text-foreground"
                }`}
              >
                {info.nombre}
                <span className="ml-1 text-xs opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Lista de plantillas */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {plantillas.map((p) => (
              <button
                key={p.subtipo}
                onClick={() => seleccionarPlantilla(p)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  plantillaSeleccionada?.subtipo === p.subtipo
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-gray-500 bg-surface-light"
                }`}
              >
                <div className="font-medium text-sm text-foreground">{p.nombre}</div>
                <div className="text-xs text-gray-500 mt-0.5">{p.descripcion}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {p.barrasDefault.length} tipos de barra
                </div>
              </button>
            ))}
          </div>

          {/* Detalle de plantilla seleccionada */}
          {plantillaSeleccionada && (
            <div className="mt-4 bg-surface-light rounded-xl border border-border p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">
                Barras que se generaran
              </h4>
              <div className="space-y-1">
                {plantillaSeleccionada.barrasDefault.map((b, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-accent font-mono w-10 text-right">d{b.diametro}</span>
                    <span className="text-gray-300 w-14 text-right">{b.longitud}m</span>
                    <span className="text-gray-500">x{b.cantidad}</span>
                    <span className="text-gray-400 flex-1 truncate">{b.etiqueta}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Las longitudes y cantidades son orientativas, las ajustaras a tu obra.
              </p>
            </div>
          )}
        </div>

        {/* Footer con nombre y botones */}
        <div className="px-6 py-4 border-t border-border space-y-3">
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (plantillaSeleccionada ? confirmar() : crearLibre())}
            placeholder="Nombre del elemento (ej: Zapata P1, Muro sotano norte...)"
            className="w-full bg-surface-light border border-border rounded-lg px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-accent placeholder:text-gray-600"
          />
          <div className="flex gap-2">
            <button
              onClick={confirmar}
              disabled={!plantillaSeleccionada}
              className={`flex-1 font-bold py-2.5 rounded-lg text-sm transition-colors ${
                plantillaSeleccionada
                  ? "bg-accent hover:bg-accent-dark text-black"
                  : "bg-gray-700 text-gray-500 cursor-not-allowed"
              }`}
            >
              Crear con plantilla
            </button>
            <button
              onClick={crearLibre}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-foreground bg-surface-light hover:bg-border transition-colors"
            >
              Elemento libre
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
