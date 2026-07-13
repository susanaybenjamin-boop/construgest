"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFerrappStore, crearElemento } from "@/stores/ferrappStore";
import { Proyecto, PESO_POR_METRO, pesoBarra } from "@/lib/ferrapp/types";
import SyncIndicator from "@/components/ferrapp/SyncIndicator";

const PESOS_BARRAS = Object.entries(PESO_POR_METRO).map(([d, kgm]) => ({
  d: Number(d),
  kgm,
  kg12: pesoBarra(Number(d), 12),
}));

function TablaPesosHome() {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="mt-3 flex justify-center">
      <button
        onClick={() => setAbierto(!abierto)}
        className="text-gray-400 hover:text-amber-500 transition-colors text-sm px-3 py-1 border border-gray-700 rounded-lg hover:border-amber-500"
      >
        Tabla de pesos barras 12m
      </button>
      {abierto && (
        <div className="absolute mt-9 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-4">
          <table className="text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-slate-600">
                <th className="text-left py-1.5 pr-6">&#x2300; mm</th>
                <th className="text-right py-1.5 pr-6">kg/m</th>
                <th className="text-right py-1.5">kg/barra 12m</th>
              </tr>
            </thead>
            <tbody>
              {PESOS_BARRAS.map((r) => (
                <tr key={r.d} className="border-b border-slate-700/50 hover:bg-slate-700">
                  <td className="py-1.5 pr-6 font-medium text-slate-200">{r.d}</td>
                  <td className="text-right py-1.5 pr-6 text-gray-300">{r.kgm.toFixed(3)}</td>
                  <td className="text-right py-1.5 text-amber-500 font-bold">{r.kg12.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function FerrappHome() {
  const router = useRouter();
  const { proyectos, createProyecto, deleteProyecto, saveProyecto, loading } = useFerrappStore();
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const crearNuevo = async () => {
    const nombre = nuevoNombre.trim() || `Obra ${proyectos.length + 1}`;
    const p = await createProyecto(nombre);
    setNuevoNombre("");
    router.push(`/ferrapp/${p.id}`);
  };

  const abrirProyecto = (id: string) => {
    router.push(`/ferrapp/${id}`);
  };

  const borrarProyecto = (id: string) => {
    deleteProyecto(id);
    setConfirmDelete(null);
  };

  const cargarEjemplo = async () => {
    const p = await createProyecto("Edificio ejemplo");

    const losa = {
      id: Math.random().toString(36).substring(2, 9),
      nombre: "Losa de cimentacion",
      barrasNecesarias: [
        { id: "a1", longitud: 15.80, diametro: 12, cantidad: 58, etiqueta: "Losa inf - Dir X (ancha)" },
        { id: "a2", longitud: 6.05, diametro: 12, cantidad: 58, etiqueta: "Losa inf - Dir X (baja)" },
        { id: "a3", longitud: 11.40, diametro: 12, cantidad: 80, etiqueta: "Losa inf - Dir Y (izq)" },
        { id: "a4", longitud: 6.50, diametro: 12, cantidad: 48, etiqueta: "Losa inf - Dir Y (der)" },
        { id: "a5", longitud: 15.80, diametro: 12, cantidad: 58, etiqueta: "Losa sup - Dir X (ancha)" },
        { id: "a6", longitud: 6.05, diametro: 12, cantidad: 58, etiqueta: "Losa sup - Dir X (baja)" },
        { id: "a7", longitud: 11.40, diametro: 12, cantidad: 80, etiqueta: "Losa sup - Dir Y (izq)" },
        { id: "a8", longitud: 6.50, diametro: 12, cantidad: 48, etiqueta: "Losa sup - Dir Y (der)" },
      ],
      sobrantesGenerados: [],
      sobrantesConsumidos: [],
      calculado: false,
    };

    const muro = {
      id: Math.random().toString(36).substring(2, 9),
      nombre: "Muro sotano",
      barrasNecesarias: [
        { id: "b1", longitud: 3.50, diametro: 12, cantidad: 120, etiqueta: "Muro vertical ext" },
        { id: "b2", longitud: 3.50, diametro: 12, cantidad: 120, etiqueta: "Muro vertical int" },
        { id: "b3", longitud: 11.40, diametro: 10, cantidad: 48, etiqueta: "Muro horiz ext" },
        { id: "b4", longitud: 11.40, diametro: 10, cantidad: 48, etiqueta: "Muro horiz int" },
        { id: "b5", longitud: 0.40, diametro: 8, cantidad: 960, etiqueta: "Horquillas muro" },
      ],
      sobrantesGenerados: [],
      sobrantesConsumidos: [],
      calculado: false,
    };

    const zuncho = {
      id: Math.random().toString(36).substring(2, 9),
      nombre: "Zunchos perimetrales",
      barrasNecesarias: [
        { id: "c1", longitud: 11.40, diametro: 16, cantidad: 8, etiqueta: "Zuncho long 4d16" },
        { id: "c2", longitud: 15.80, diametro: 16, cantidad: 8, etiqueta: "Zuncho long 4d16" },
        { id: "c3", longitud: 0.96, diametro: 8, cantidad: 360, etiqueta: "Estribos zuncho" },
      ],
      sobrantesGenerados: [],
      sobrantesConsumidos: [],
      calculado: false,
    };

    const updated = { ...p, elementos: [losa, muro, zuncho] };
    saveProyecto(updated);
    router.push(`/ferrapp/${p.id}`);
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 text-center relative">
          <h1 className="text-5xl font-bold text-amber-500 mb-2">FERRAPP</h1>
          <p className="text-gray-400 text-lg">Optimizador de despiece de ferralla</p>
          <TablaPesosHome />
        </header>

        {/* Crear nueva obra */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Nueva obra</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && crearNuevo()}
              placeholder="Nombre de la obra (ej: Edificio Residencial C/ Mayor)"
              className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-slate-200 flex-1 focus:outline-none focus:border-amber-500 placeholder:text-gray-500"
            />
            <button
              onClick={crearNuevo}
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold py-3 px-8 rounded-lg transition-colors"
            >
              Crear
            </button>
          </div>
          <button
            onClick={cargarEjemplo}
            className="mt-3 text-sm text-gray-400 hover:text-amber-500 transition-colors"
          >
            O cargar edificio de ejemplo con datos de prueba
          </button>
        </div>

        {/* Lista de obras */}
        {loading ? (
          <div className="text-center py-16 text-gray-500">
            <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p>Cargando obras...</p>
          </div>
        ) : proyectos.length > 0 ? (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Mis obras ({proyectos.length})
            </h2>
            <div className="space-y-3">
              {[...proyectos]
                .sort((a, b) => new Date(b.fechaModificacion).getTime() - new Date(a.fechaModificacion).getTime())
                .map((p) => (
                  <div
                    key={p.id}
                    className="bg-slate-800 rounded-xl border border-slate-700 p-5 hover:border-amber-500/50 transition-colors cursor-pointer group"
                    onClick={() => abrirProyecto(p.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-200 group-hover:text-amber-500 transition-colors">
                          {p.nombre}
                        </h3>
                        <div className="flex gap-4 mt-1 text-sm text-gray-500">
                          <span>{p.elementos.length} elementos</span>
                          <span>{p.elementos.filter((e) => e.calculado).length} calculados</span>
                          <span>
                            Modificado: {new Date(p.fechaModificacion).toLocaleDateString("es-ES", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirmDelete === p.id) {
                              borrarProyecto(p.id);
                            } else {
                              setConfirmDelete(p.id);
                              setTimeout(() => setConfirmDelete(null), 3000);
                            }
                          }}
                          className={`text-sm px-3 py-1 rounded transition-colors ${
                            confirmDelete === p.id
                              ? "bg-red-500 text-white"
                              : "text-gray-500 hover:text-red-400"
                          }`}
                        >
                          {confirmDelete === p.id ? "Confirmar borrado" : "Eliminar"}
                        </button>
                        <span className="text-amber-500 text-xl group-hover:translate-x-1 transition-transform">
                          &rarr;
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-2">No tienes obras creadas</p>
            <p className="text-sm">Crea una nueva obra o carga el ejemplo para empezar</p>
          </div>
        )}
      </div>
    </div>
  );
}
