"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarraNecesaria,
  ConfigConstruccion,
  ElementoEstructural,
  Proyecto,
  Sobrante,
  ResultadoDespieceExtendido,
  CATEGORIAS_INFO,
  DIAMETROS_DISPONIBLES,
  PESO_POR_METRO,
  pesoBarra,
} from "@/lib/ferrapp/types";
import { optimizarCortes, inferirPosicionSolape } from "@/lib/ferrapp/optimizador";
import { useFerrappStore, crearElemento } from "@/stores/ferrappStore";
import BarraInput from "@/components/ferrapp/BarraInput";
import ResultadoCortes from "@/components/ferrapp/ResultadoCortes";
import VistaImpresion from "@/components/ferrapp/VistaImpresion";
import ResumenImpresion from "@/components/ferrapp/ResumenImpresion";
import SyncIndicator from "@/components/ferrapp/SyncIndicator";
import SelectorElemento from "@/components/ferrapp/SelectorElemento";
import GeometriaInput from "@/components/ferrapp/GeometriaInput";
import MallazoConfig from "@/components/ferrapp/MallazoConfig";
import { generarBarrasDesdeGeometria, getGeometriaDefault, getTipoGeometria } from "@/lib/ferrapp/generadores";

/** Tabla de pesos de barras corrugadas a 12m — derivada de PESO_POR_METRO (UNE-EN 10080) */
const PESOS_BARRAS_12M: { d: number; kgm: number; kg12: number }[] = Object.entries(PESO_POR_METRO).map(([d, kgm]) => ({
  d: Number(d),
  kgm,
  kg12: pesoBarra(Number(d), 12),
}));

function TablaPesosBarras() {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setAbierto(!abierto)}
        className="text-gray-400 hover:text-accent transition-colors text-xs px-1.5 py-0.5 border border-gray-700 rounded hover:border-accent"
        title="Tabla de pesos de barras a 12m"
      >
        kg
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute top-8 left-0 z-50 bg-surface border border-border rounded-lg shadow-xl p-3 min-w-[260px]">
            <h3 className="text-xs font-bold text-accent mb-2">Peso barras corrugadas (12m)</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-border">
                  <th className="text-left py-1 pr-3">&#x2300; mm</th>
                  <th className="text-right py-1 pr-3">kg/m</th>
                  <th className="text-right py-1">kg/barra 12m</th>
                </tr>
              </thead>
              <tbody>
                {PESOS_BARRAS_12M.map((r) => (
                  <tr key={r.d} className="border-b border-border/50 hover:bg-surface-light">
                    <td className="py-1 pr-3 font-medium text-foreground">{r.d}</td>
                    <td className="text-right py-1 pr-3 text-gray-300">{r.kgm.toFixed(3)}</td>
                    <td className="text-right py-1 text-accent font-medium">{r.kg12.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function generarId() {
  return Math.random().toString(36).substring(2, 9);
}

/** Etiquetas de barras longitudinales en elementos lineales (vigas/zunchos) */
const ETIQUETAS_LONGITUDINALES = [
  "Barras abajo", "Barras arriba", "Barras centrales", "Barras longitudinales",
  "Barras principales", "Barras de piel", "Refuerzo negativo", "Portaestribos",
  "Inferior a lo largo", "Superior a lo largo",
];

/** Determina si una barra es longitudinal (vs estribo) */
function esBarraLongitudinal(etiqueta: string): boolean {
  return ETIQUETAS_LONGITUDINALES.some(e => etiqueta.startsWith(e));
}

/** Aplica el multiplicador de tramos para elementos lineales:
 *  - Barras longitudinales: (mult-1) tramos con solape + 1 tramo final sin solape
 *    Ej: 4 tramos de 3.9m con solape 0.60m → 3 uds de 4.50m + 1 ud de 3.90m por barra
 *  - Estribos: multiplica cantidad (cada tramo tiene sus estribos)
 *  Para otros tipos de elemento, multiplica cantidad de todo.
 */
function aplicarMultiplicador(
  barras: BarraNecesaria[],
  mult: number,
  esLineal: boolean,
  nombreElemento: string,
  solapes?: Record<number, number>
): BarraNecesaria[] {
  if (mult <= 1) {
    return barras.map((b, i) => ({
      ...b,
      etiqueta: b.etiqueta || `${nombreElemento} - Pieza ${i + 1}`,
    }));
  }
  return barras.flatMap((b, i) => {
    if (esLineal && esBarraLongitudinal(b.etiqueta)) {
      // Longitudinales: (mult-1) tramos con solape + 1 tramo final sin solape
      const solape = solapes?.[b.diametro] || 0.50;
      const tramosConSolape = mult - 1;
      const resultado: BarraNecesaria[] = [];
      // Tramos con solape (uniones)
      if (tramosConSolape > 0) {
        resultado.push({
          ...b,
          longitud: +(b.longitud + solape).toFixed(2),
          cantidad: b.cantidad * tramosConSolape,
          etiqueta: b.etiqueta || `${nombreElemento} - Pieza ${i + 1}`,
        });
      }
      // Último tramo sin solape
      resultado.push({
        ...b,
        longitud: b.longitud,
        cantidad: b.cantidad,
        etiqueta: (b.etiqueta || `${nombreElemento} - Pieza ${i + 1}`) + " (extremo)",
      });
      return resultado;
    } else {
      // Estribos o elementos no lineales: multiplicar cantidad
      return [{
        ...b,
        cantidad: b.cantidad * mult,
        etiqueta: b.etiqueta || `${nombreElemento} - Pieza ${i + 1}`,
      }];
    }
  });
}

// ===== UNDO/REDO =====
const MAX_HISTORY = 30;

export default function ObraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [proyecto, setProyectoRaw] = useState<Proyecto | null>(null);
  const [elementoActivo, setElementoActivo] = useState(0);
  const [resultados, setResultados] = useState<Map<string, ResultadoDespieceExtendido>>(new Map());
  const [usarSobrantes, setUsarSobrantes] = useState(true);
  const [tab, setTab] = useState<"despiece" | "resumen">("despiece");
  const [mostrarSelector, setMostrarSelector] = useState(false);
  const [sidebarAbierto, setSidebarAbierto] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ idx: number; x: number; y: number } | null>(null);

  // Undo/Redo
  const [history, setHistory] = useState<Proyecto[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [skipHistory, setSkipHistory] = useState(false);

  const setProyecto = useCallback((p: Proyecto | null) => {
    if (!p) { setProyectoRaw(p); return; }
    setProyectoRaw(p);
    if (!skipHistory) {
      setHistory(prev => {
        const base = prev.slice(0, historyIdx + 1);
        const next = [...base, JSON.parse(JSON.stringify(p))];
        if (next.length > MAX_HISTORY) next.shift();
        return next;
      });
      setHistoryIdx(prev => Math.min(prev + 1, MAX_HISTORY - 1));
    }
  }, [skipHistory, historyIdx]);

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const newIdx = historyIdx - 1;
    setSkipHistory(true);
    setProyectoRaw(JSON.parse(JSON.stringify(history[newIdx])));
    setHistoryIdx(newIdx);
    setTimeout(() => setSkipHistory(false), 0);
  }, [history, historyIdx]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const newIdx = historyIdx + 1;
    setSkipHistory(true);
    setProyectoRaw(JSON.parse(JSON.stringify(history[newIdx])));
    setHistoryIdx(newIdx);
    setTimeout(() => setSkipHistory(false), 0);
  }, [history, historyIdx]);

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  const { loadProyecto, saveProyecto } = useFerrappStore();

  useEffect(() => {
    loadProyecto(id).then(() => {
      const p = useFerrappStore.getState().activeProyecto;
      if (p) {
        setProyectoRaw(p);
        setHistory([JSON.parse(JSON.stringify(p))]);
        setHistoryIdx(0);
        // Restore previously calculated results
        const restored = new Map<string, ResultadoDespieceExtendido>();
        for (const el of p.elementos) {
          if (el.calculado && el.resultado) {
            restored.set(el.id, el.resultado as ResultadoDespieceExtendido);
          }
        }
        if (restored.size > 0) setResultados(restored);
      } else {
        router.push("/ferrapp");
      }
    });
  }, [id, router]);

  // Auto-save (debounced inside store)
  useEffect(() => {
    if (proyecto) {
      saveProyecto(proyecto);
    }
  }, [proyecto]);

  if (!proyecto) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-gray-400">Cargando...</div>;

  const config: ConfigConstruccion = proyecto.config;
  const elemento = proyecto.elementos[elementoActivo];

  const getSobrantesDisponibles = (): Sobrante[] => {
    if (!usarSobrantes) return [];
    const sobrantes: Sobrante[] = [];
    for (let i = 0; i < elementoActivo; i++) {
      const el = proyecto.elementos[i];
      if (el.calculado) {
        const res = resultados.get(el.id);
        if (res) {
          sobrantes.push(...res.sobrantesNuevos.filter((s) => !s.usado));
        }
      }
    }
    return sobrantes;
  };

  const actualizarElemento = (elem: ElementoEstructural) => {
    const nuevos = [...proyecto.elementos];
    nuevos[elementoActivo] = elem;
    setProyecto({ ...proyecto, elementos: nuevos });
  };

  const agregarElemento = (nombre: string, subtipo?: string) => {
    const nuevo = crearElemento(nombre, subtipo);
    // Heredar planta del elemento activo actual
    if (elemento?.planta) {
      nuevo.planta = elemento.planta;
    }
    setProyecto({ ...proyecto, elementos: [...proyecto.elementos, nuevo] });
    setElementoActivo(proyecto.elementos.length);
    setMostrarSelector(false);
  };

  const eliminarElemento = (idx: number) => {
    if (proyecto.elementos.length === 1) return;
    const nuevos = proyecto.elementos.filter((_, i) => i !== idx);
    const nuevosResultados = new Map(resultados);
    nuevosResultados.delete(proyecto.elementos[idx].id);
    setResultados(nuevosResultados);
    setProyecto({ ...proyecto, elementos: nuevos });
    setElementoActivo(Math.min(elementoActivo, nuevos.length - 1));
  };

  const duplicarElemento = (idx: number) => {
    const original = proyecto.elementos[idx];
    const copia: ElementoEstructural = {
      ...JSON.parse(JSON.stringify(original)),
      id: generarId(),
      nombre: original.nombre + " (copia)",
      calculado: false,
      sobrantesGenerados: [],
      sobrantesConsumidos: [],
    };
    // Reasignar IDs a las barras
    copia.barrasNecesarias = copia.barrasNecesarias.map((b: BarraNecesaria) => ({ ...b, id: generarId() }));
    const nuevos = [...proyecto.elementos];
    nuevos.splice(idx + 1, 0, copia);
    setProyecto({ ...proyecto, elementos: nuevos });
    setElementoActivo(idx + 1);
  };

  const moverElemento = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= proyecto.elementos.length) return;
    const nuevos = [...proyecto.elementos];
    [nuevos[idx], nuevos[newIdx]] = [nuevos[newIdx], nuevos[idx]];
    setProyecto({ ...proyecto, elementos: nuevos });
    if (elementoActivo === idx) setElementoActivo(newIdx);
    else if (elementoActivo === newIdx) setElementoActivo(idx);
  };

  const agregarBarra = () => {
    const g = elemento.geometria;
    const longDefault = g?.lados[0]?.longitud || 5.0;
    const nuevaBarra: BarraNecesaria = {
      id: generarId(),
      longitud: +longDefault.toFixed(2),
      diametro: 12,
      cantidad: 1,
      etiqueta: "",
    };
    actualizarElemento({
      ...elemento,
      barrasNecesarias: [nuevaBarra, ...elemento.barrasNecesarias],
    });
  };

  const actualizarBarra = (idx: number, barra: BarraNecesaria) => {
    const nuevas = [...elemento.barrasNecesarias];
    nuevas[idx] = barra;
    actualizarElemento({ ...elemento, barrasNecesarias: nuevas });
  };

  const eliminarBarra = (idx: number) => {
    if (elemento.barrasNecesarias.length === 1) return;
    actualizarElemento({
      ...elemento,
      barrasNecesarias: elemento.barrasNecesarias.filter((_, i) => i !== idx),
    });
  };

  const calcular = () => {
    const barrasValidas = elemento.barrasNecesarias.filter((b) => b.longitud > 0 && b.cantidad > 0);
    if (barrasValidas.length === 0) return;

    // Aplicar multiplicador según tipo de elemento
    const mult = elemento.cantidad || 1;
    const tipoGeo = getTipoGeometria(elemento.categoria || "libre", elemento.subtipo);
    const esLineal = tipoGeo === "lineal";
    const barrasConEtiqueta = aplicarMultiplicador(barrasValidas, mult, esLineal, elemento.nombre, config.solape);

    const sobrantesDisp = getSobrantesDisponibles();
    const res = optimizarCortes(barrasConEtiqueta, config, sobrantesDisp);

    const nuevosResultados = new Map(resultados);
    nuevosResultados.set(elemento.id, res);
    setResultados(nuevosResultados);

    actualizarElemento({
      ...elemento,
      calculado: true,
      resultado: res,
      sobrantesGenerados: res.sobrantesNuevos,
      sobrantesConsumidos: res.sobrantesUsados.map((s) => s.id),
    });
  };

  // Calcular todos secuencialmente
  const calcularTodos = () => {
    const nuevosResultados = new Map<string, ResultadoDespieceExtendido>();

    for (let i = 0; i < proyecto.elementos.length; i++) {
      const el = proyecto.elementos[i];
      const barrasValidas = el.barrasNecesarias.filter((b) => b.longitud > 0 && b.cantidad > 0);
      if (barrasValidas.length === 0) continue;

      const mult = el.cantidad || 1;
      const tipoGeo = getTipoGeometria(el.categoria || "libre", el.subtipo);
      const esLineal = tipoGeo === "lineal";
      const barrasConEtiqueta = aplicarMultiplicador(barrasValidas, mult, esLineal, el.nombre, config.solape);

      // Sobrantes de elementos anteriores
      const sobrantesDisp: Sobrante[] = [];
      if (usarSobrantes) {
        for (let j = 0; j < i; j++) {
          const resAnterior = nuevosResultados.get(proyecto.elementos[j].id);
          if (resAnterior) {
            sobrantesDisp.push(...resAnterior.sobrantesNuevos.filter((s) => !s.usado));
          }
        }
      }

      const res = optimizarCortes(barrasConEtiqueta, config, sobrantesDisp);
      nuevosResultados.set(el.id, res);

      // Actualizar elemento
      proyecto.elementos[i] = {
        ...el,
        calculado: true,
        resultado: res,
        sobrantesGenerados: res.sobrantesNuevos,
        sobrantesConsumidos: res.sobrantesUsados.map((s) => s.id),
      };
    }

    setResultados(nuevosResultados);
    setProyecto({ ...proyecto });
  };

  // Recalcular todos los elementos con una nueva config
  const recalcularConConfig = (nuevaConfig: ConfigConstruccion) => {
    const nuevosResultados = new Map<string, ResultadoDespieceExtendido>();
    const elementosActualizados = [...proyecto.elementos];

    for (let i = 0; i < elementosActualizados.length; i++) {
      const el = elementosActualizados[i];
      const barrasValidas = el.barrasNecesarias.filter((b) => b.longitud > 0 && b.cantidad > 0);
      if (barrasValidas.length === 0) continue;

      const mult = el.cantidad || 1;
      const tipoGeo = getTipoGeometria(el.categoria || "libre", el.subtipo);
      const esLineal = tipoGeo === "lineal";
      const barrasConEtiqueta = aplicarMultiplicador(barrasValidas, mult, esLineal, el.nombre, nuevaConfig.solape);

      const sobrantesDisp: Sobrante[] = [];
      if (usarSobrantes) {
        for (let j = 0; j < i; j++) {
          const resAnterior = nuevosResultados.get(elementosActualizados[j].id);
          if (resAnterior) {
            sobrantesDisp.push(...resAnterior.sobrantesNuevos.filter((s) => !s.usado));
          }
        }
      }

      const res = optimizarCortes(barrasConEtiqueta, nuevaConfig, sobrantesDisp);
      nuevosResultados.set(el.id, res);

      elementosActualizados[i] = {
        ...el,
        calculado: true,
        resultado: res,
        sobrantesGenerados: res.sobrantesNuevos,
        sobrantesConsumidos: res.sobrantesUsados.map((s) => s.id),
      };
    }

    setResultados(nuevosResultados);
    setProyecto({ ...proyecto, elementos: elementosActualizados, config: nuevaConfig });
  };

  const resumenGlobal = () => {
    let barrasTotal = 0;
    let pesoTotal = 0;
    let desperdicioTotal = 0;
    let metrosCompra = 0;
    let sobrantesDisponibles = 0;
    let barrasAhorradas = 0;
    const barrasPorLongitud = new Map<number, number>();

    for (const [, res] of resultados) {
      for (const r of res.resultadosPorDiametro) {
        barrasTotal += r.totalBarrasComerciales;
        for (const bc of r.barrasComerciales) {
          if (bc.id > 0) {
            metrosCompra += bc.longitudTotal;
            barrasPorLongitud.set(bc.longitudTotal, (barrasPorLongitud.get(bc.longitudTotal) || 0) + 1);
          }
        }
      }
      pesoTotal += res.pesoTotal;
      desperdicioTotal += res.desperdicioTotal;
      sobrantesDisponibles += res.sobrantesNuevos.filter((s) => !s.usado).length;
      barrasAhorradas += res.barrasComercialAhorradas;
    }

    const barrasTexto = [...barrasPorLongitud.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([L, n]) => `${n} de ${L}m`)
      .join(" + ");

    return { barrasTotal, pesoTotal, desperdicioTotal, metrosCompra, sobrantesDisponibles, barrasAhorradas, barrasTexto, barrasPorLongitud };
  };

  const global = resumenGlobal();
  const resultado = resultados.get(elemento?.id || "");

  // Plantas únicas
  const plantasUnicas = [...new Set(proyecto.elementos.map(e => e.planta || "").filter(Boolean))].sort();

  // Agrupar elementos por planta
  const elementosPorPlanta = () => {
    const sinPlanta = proyecto.elementos.map((el, idx) => ({ el, idx })).filter(({ el }) => !el.planta);
    const conPlanta = new Map<string, { el: ElementoEstructural; idx: number }[]>();
    proyecto.elementos.forEach((el, idx) => {
      if (el.planta) {
        const arr = conPlanta.get(el.planta) || [];
        arr.push({ el, idx });
        conPlanta.set(el.planta, arr);
      }
    });
    return { sinPlanta, conPlanta };
  };

  const { sinPlanta, conPlanta } = elementosPorPlanta();

  const renderElementoSidebar = (el: ElementoEstructural, idx: number) => (
    <div
      key={el.id}
      className={`group flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-colors ${
        idx === elementoActivo
          ? "bg-accent/20 border border-accent/40"
          : "hover:bg-surface-light border border-transparent"
      }`}
      onClick={() => { setElementoActivo(idx); setContextMenu(null); }}
      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ idx, x: e.clientX, y: e.clientY }); }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {el.categoria && el.categoria !== "libre" && (
            <span className="text-[10px] font-bold bg-accent/20 text-accent px-1.5 py-0.5 rounded leading-none shrink-0">
              {CATEGORIAS_INFO[el.categoria]?.icono || ""}
            </span>
          )}
          <div className="text-sm font-medium truncate">{el.nombre}</div>
          {(el.cantidad || 1) > 1 && (() => {
            const tg = getTipoGeometria(el.categoria || "libre", el.subtipo);
            return (
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded leading-none shrink-0">
              {tg === "lineal" ? `${el.cantidad} tramos` : `x${el.cantidad}`}
            </span>
            );
          })()}
        </div>
        <div className="text-xs text-gray-500">
          {el.calculado ? (
            <>
              <span className="text-success">OK</span>
              {resultados.get(el.id) && (
                <span className="ml-1">{resultados.get(el.id)!.pesoTotal.toFixed(0)} kg</span>
              )}
            </>
          ) : (
            <span>Pendiente</span>
          )}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setContextMenu({ idx, x: e.clientX, y: e.clientY }); }}
        className="text-gray-600 hover:text-gray-300 text-xs p-1 opacity-0 group-hover:opacity-100 shrink-0"
        title="Opciones"
      >
        &#8942;
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Top bar */}
      <div className="bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarAbierto(!sidebarAbierto)}
            className={`text-gray-400 hover:text-accent transition-colors p-1 ${sidebarAbierto ? "text-accent" : ""}`}
            title={sidebarAbierto ? "Ocultar panel" : "Mostrar panel"}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="5" x2="17" y2="5" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="15" x2="17" y2="15" />
            </svg>
          </button>
          <button
            onClick={() => router.push("/ferrapp")}
            className="text-gray-400 hover:text-accent transition-colors text-sm"
          >
            &larr; Mis obras
          </button>
          <h1 className="text-xl font-bold text-accent">FERRAPP</h1>
          <TablaPesosBarras />
          <SyncIndicator />
          <span className="text-gray-500">|</span>
          <input
            type="text"
            value={proyecto.nombre}
            onChange={(e) => setProyecto({ ...proyecto, nombre: e.target.value })}
            className="bg-transparent border-none text-foreground font-medium focus:outline-none text-lg"
          />
        </div>
        <div className="flex items-center gap-3">
          {/* Undo/Redo */}
          <div className="flex gap-1">
            <button
              onClick={undo}
              disabled={historyIdx <= 0}
              className="text-gray-400 hover:text-accent disabled:text-gray-700 disabled:cursor-not-allowed p-1 transition-colors"
              title="Deshacer (Ctrl+Z)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7h7a3 3 0 0 1 0 6H9" /><path d="M6 10L3 7l3-3" />
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={historyIdx >= history.length - 1}
              className="text-gray-400 hover:text-accent disabled:text-gray-700 disabled:cursor-not-allowed p-1 transition-colors"
              title="Rehacer (Ctrl+Y)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 7H6a3 3 0 0 0 0 6h1" /><path d="M10 10l3-3-3-3" />
              </svg>
            </button>
          </div>
          {/* Tabs */}
          <div className="flex bg-surface-light rounded-lg p-0.5">
            <button
              onClick={() => setTab("despiece")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === "despiece" ? "bg-accent text-black" : "text-gray-400 hover:text-foreground"
              }`}
            >
              Despiece
            </button>
            <button
              onClick={() => setTab("resumen")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === "resumen" ? "bg-accent text-black" : "text-gray-400 hover:text-foreground"
              }`}
            >
              Resumen
            </button>
          </div>
          <button
            onClick={calcularTodos}
            className="bg-accent hover:bg-accent-dark text-black font-medium py-1.5 px-4 rounded-lg text-sm transition-colors"
          >
            Calcular todo
          </button>
        </div>
      </div>

      {tab === "resumen" ? (
        /* TAB RESUMEN */
        <div className="h-[calc(100vh-57px)] overflow-y-auto">
          {resultados.size > 0 ? (
            <ResumenImpresion
              proyecto={proyecto}
              resultados={resultados}
              longitudBarraComercial={config.longitudBarraComercial}
            />
          ) : (
            <div className="text-center py-20 text-gray-500">
              <p className="text-lg mb-2">No hay resultados todavia</p>
              <p className="text-sm">Calcula los elementos para ver el resumen</p>
            </div>
          )}
        </div>
      ) : (
        /* TAB DESPIECE */
        <div className="flex h-[calc(100vh-57px)] relative overflow-hidden">
          {/* Backdrop */}
          {sidebarAbierto && (
            <div
              className="absolute inset-0 z-20"
              onClick={() => setSidebarAbierto(false)}
            />
          )}

          {/* Sidebar de elementos */}
          <div
            className={`bg-surface border-r border-border p-4 overflow-y-auto w-72 shrink-0 absolute left-0 top-0 bottom-0 z-30 transition-transform duration-300 ${
              sidebarAbierto ? "translate-x-0 shadow-2xl shadow-black/30" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Elementos</h2>
              <button
                onClick={() => setMostrarSelector(true)}
                className="bg-accent hover:bg-accent-dark text-black font-bold w-7 h-7 rounded text-sm transition-colors"
              >
                +
              </button>
            </div>

            {/* Filtro/agregar planta */}
            <div className="mb-3">
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => {
                    const nombre = prompt("Nombre de la planta/zona:");
                    if (nombre && nombre.trim()) {
                      // Asignar al elemento activo
                      if (elemento) {
                        actualizarElemento({ ...elemento, planta: nombre.trim() });
                      }
                    }
                  }}
                  className="text-[10px] text-gray-500 hover:text-accent px-1.5 py-0.5 border border-dashed border-gray-700 rounded transition-colors"
                  title="Asignar planta al elemento activo"
                >
                  + Planta
                </button>
                {plantasUnicas.map(p => (
                  <span key={p} className="text-[10px] bg-surface-light text-gray-400 px-1.5 py-0.5 rounded">
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* Elementos agrupados */}
            <div className="space-y-1 mb-4">
              {plantasUnicas.length > 0 ? (
                <>
                  {/* Con planta */}
                  {[...conPlanta.entries()].map(([planta, items]) => (
                    <div key={planta}>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-2 mb-1 px-1 flex items-center gap-1">
                        <span className="bg-accent/10 text-accent px-1.5 py-0.5 rounded">{planta}</span>
                        <span className="text-gray-600">({items.length})</span>
                      </div>
                      {items.map(({ el, idx }) => renderElementoSidebar(el, idx))}
                    </div>
                  ))}
                  {/* Sin planta */}
                  {sinPlanta.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mt-2 mb-1 px-1">Sin planta</div>
                      {sinPlanta.map(({ el, idx }) => renderElementoSidebar(el, idx))}
                    </div>
                  )}
                </>
              ) : (
                proyecto.elementos.map((el, idx) => renderElementoSidebar(el, idx))
              )}
            </div>

            {/* Config */}
            <div className="border-t border-border pt-4 space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">Barras disponibles:</label>
                <div className="flex gap-2">
                  {[6, 12].map((L) => {
                    const activas = config.longitudesDisponibles || [config.longitudBarraComercial];
                    const activo = activas.includes(L);
                    return (
                      <label key={L} className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activo}
                          onChange={() => {
                            let nuevas: number[];
                            if (activo) {
                              nuevas = activas.filter((x) => x !== L);
                              if (nuevas.length === 0) nuevas = [L];
                            } else {
                              nuevas = [...activas, L].sort((a, b) => a - b);
                            }
                            const nuevaConfig: ConfigConstruccion = {
                              ...config,
                              longitudesDisponibles: nuevas,
                              longitudBarraComercial: Math.max(...nuevas),
                            };
                            const hayCalculados = proyecto.elementos.some((el) => el.calculado);
                            if (hayCalculados) {
                              recalcularConConfig(nuevaConfig);
                            } else {
                              setProyecto({ ...proyecto, config: nuevaConfig });
                            }
                          }}
                          className="rounded border-border accent-accent"
                        />
                        {L}m
                      </label>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usarSobrantes}
                  onChange={(e) => setUsarSobrantes(e.target.checked)}
                  className="rounded border-border accent-accent"
                />
                Reutilizar sobrantes
              </label>
              {/* Solapes personalizados por posicion */}
              {(() => {
                const POSICIONES: { key: "vInf" | "vSup" | "hInf" | "hSup"; label: string }[] = [
                  { key: "vInf", label: "V. inferior" },
                  { key: "vSup", label: "V. superior" },
                  { key: "hInf", label: "H. inferior" },
                  { key: "hSup", label: "H. superior" },
                ];
                const diamsUsados = [...new Set(proyecto.elementos.flatMap((el) =>
                  el.barrasNecesarias.map((b) => b.diametro)
                ))].sort((a, b) => a - b);
                if (diamsUsados.length === 0) return null;

                const setSolapeCelda = (pos: "vInf" | "vSup" | "hInf" | "hSup", diam: number, cm: number | null) => {
                  const actual = config.solapesPorPosicion || {};
                  const cubeta = { ...(actual[pos] || {}) };
                  if (cm == null || isNaN(cm)) {
                    delete cubeta[diam];
                  } else {
                    cubeta[diam] = cm / 100;
                  }
                  const nuevaCubeta = Object.keys(cubeta).length > 0 ? cubeta : undefined;
                  const nuevoMapa = { ...actual, [pos]: nuevaCubeta };
                  if (nuevaCubeta === undefined) delete (nuevoMapa as Record<string, unknown>)[pos];
                  const nuevaConfig: ConfigConstruccion = {
                    ...config,
                    solapesPorPosicion: Object.keys(nuevoMapa).length > 0 ? nuevoMapa : undefined,
                  };
                  const hayCalculados = proyecto.elementos.some((el) => el.calculado);
                  if (hayCalculados) recalcularConConfig(nuevaConfig);
                  else setProyecto({ ...proyecto, config: nuevaConfig });
                };

                const resetTodo = () => {
                  const nuevaConfig: ConfigConstruccion = { ...config, solapesPorPosicion: undefined };
                  const hayCalculados = proyecto.elementos.some((el) => el.calculado);
                  if (hayCalculados) recalcularConConfig(nuevaConfig);
                  else setProyecto({ ...proyecto, config: nuevaConfig });
                };

                const fmtSolape = (pos: "vInf" | "vSup" | "hInf" | "hSup", diam: number): string => {
                  const v = config.solapesPorPosicion?.[pos]?.[diam];
                  return v != null ? String(Math.round(v * 100)) : "";
                };
                const placeholderSolape = (diam: number): string =>
                  String(Math.round((config.solape[diam] ?? 0.50) * 100));

                return (
                  <details className="text-xs">
                    <summary className="text-gray-300 cursor-pointer hover:text-foreground">
                      Solapes personalizados
                    </summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="text-[10px] border-collapse">
                        <thead>
                          <tr>
                            <th className="text-left text-gray-500 font-normal pr-1">cm</th>
                            {diamsUsados.map((d) => (
                              <th key={d} className="text-center text-amber-400 font-semibold px-1">Ø{d}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {POSICIONES.map(({ key, label }) => (
                            <tr key={key}>
                              <td className="text-gray-400 pr-1 py-0.5">{label}</td>
                              {diamsUsados.map((d) => (
                                <td key={d} className="px-0.5">
                                  <input
                                    type="number"
                                    min={0}
                                    placeholder={placeholderSolape(d)}
                                    value={fmtSolape(key, d)}
                                    onChange={(e) => {
                                      const v = e.target.value === "" ? null : parseInt(e.target.value);
                                      setSolapeCelda(key, d, v);
                                    }}
                                    className="bg-surface-light border border-border rounded px-1 py-0.5 text-foreground w-12 text-center focus:outline-none focus:border-accent"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[9px] text-gray-500 italic">Vacío = usa solape global EHE-08</span>
                        {config.solapesPorPosicion && (
                          <button onClick={resetTodo} className="text-[10px] text-amber-400 hover:text-amber-300">
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })()}
            </div>

            {/* Sobrantes disponibles */}
            {elementoActivo > 0 && usarSobrantes && (
              <div className="border-t border-border pt-4 mt-4">
                <h3 className="text-xs font-semibold text-green-400 mb-2 uppercase">Sobrantes disponibles</h3>
                {(() => {
                  const sobrantes = getSobrantesDisponibles();
                  if (sobrantes.length === 0) {
                    return <p className="text-xs text-gray-600">Calcula elementos anteriores</p>;
                  }
                  const porDiam = new Map<number, { count: number; metros: number }>();
                  for (const s of sobrantes) {
                    const g = porDiam.get(s.diametro) || { count: 0, metros: 0 };
                    g.count++;
                    g.metros += s.longitud;
                    porDiam.set(s.diametro, g);
                  }
                  return (
                    <div className="space-y-1">
                      {[...porDiam.entries()].sort((a, b) => a[0] - b[0]).map(([d, g]) => (
                        <div key={d} className="flex justify-between text-xs">
                          <span className="text-gray-300">d{d}: {g.count} trozos</span>
                          <span className="text-green-400">{g.metros.toFixed(1)}m</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Context menu */}
          {contextMenu && (
            <div
              className="fixed z-50 bg-surface border border-border rounded-lg shadow-xl shadow-black/30 py-1 min-w-[160px]"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-surface-light hover:text-foreground transition-colors flex items-center gap-2"
                onClick={() => { duplicarElemento(contextMenu.idx); setContextMenu(null); }}
              >
                <span className="text-blue-400">⧉</span> Duplicar
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-surface-light hover:text-foreground transition-colors flex items-center gap-2"
                onClick={() => { moverElemento(contextMenu.idx, -1); setContextMenu(null); }}
                disabled={contextMenu.idx === 0}
              >
                <span className="text-gray-400">↑</span> Mover arriba
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-surface-light hover:text-foreground transition-colors flex items-center gap-2"
                onClick={() => { moverElemento(contextMenu.idx, 1); setContextMenu(null); }}
                disabled={contextMenu.idx === proyecto.elementos.length - 1}
              >
                <span className="text-gray-400">↓</span> Mover abajo
              </button>
              <div className="border-t border-border my-1" />
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-surface-light hover:text-foreground transition-colors flex items-center gap-2"
                onClick={() => {
                  const nombre = prompt("Planta/zona:", proyecto.elementos[contextMenu.idx].planta || "");
                  if (nombre !== null) {
                    const nuevos = [...proyecto.elementos];
                    nuevos[contextMenu.idx] = { ...nuevos[contextMenu.idx], planta: nombre.trim() || undefined };
                    setProyecto({ ...proyecto, elementos: nuevos });
                  }
                  setContextMenu(null);
                }}
              >
                <span className="text-accent">◫</span> Asignar planta
              </button>
              <div className="border-t border-border my-1" />
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/30 transition-colors flex items-center gap-2"
                onClick={() => {
                  if (proyecto.elementos.length > 1 && confirm(`¿Eliminar "${proyecto.elementos[contextMenu.idx].nombre}"?`)) {
                    eliminarElemento(contextMenu.idx);
                  }
                  setContextMenu(null);
                }}
                disabled={proyecto.elementos.length <= 1}
              >
                <span>✕</span> Eliminar
              </button>
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto space-y-4">
              {/* Elemento header */}
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={elemento.nombre}
                      onChange={(e) => actualizarElemento({ ...elemento, nombre: e.target.value })}
                      className="bg-surface border border-border rounded-lg px-3 py-2 text-xl font-bold text-foreground flex-1 focus:outline-none focus:border-accent"
                    />
                    <select
                      value={elemento.categoria || "libre"}
                      onChange={(e) => {
                        const cat = e.target.value as import("@/lib/ferrapp/types").CategoriaElemento;
                        const geo = getGeometriaDefault(elemento.subtipo || cat, cat);
                        actualizarElemento({ ...elemento, categoria: cat, geometria: geo });
                      }}
                      className="bg-surface border border-border rounded-lg px-2 py-2 text-sm text-gray-400 focus:outline-none focus:border-accent shrink-0"
                    >
                      {(Object.entries(CATEGORIAS_INFO) as [import("@/lib/ferrapp/types").CategoriaElemento, { nombre: string; icono: string }][]).map(([cat, info]) => (
                        <option key={cat} value={cat}>{info.nombre}</option>
                      ))}
                      <option value="libre">Libre</option>
                    </select>
                  </div>
                  {/* Cantidad/Tramos + Planta + Recubrimiento */}
                  {(() => {
                    const tipoGeoUI = getTipoGeometria(elemento.categoria || "libre", elemento.subtipo);
                    const esLinealUI = tipoGeoUI === "lineal";
                    const cantUI = elemento.cantidad || 1;
                    const longTramo = elemento.geometria?.lados[0]?.longitud || 0;
                    const longTotal = esLinealUI && cantUI > 1 ? +(longTramo * cantUI).toFixed(2) : 0;
                    const numUniones = cantUI > 1 ? cantUI - 1 : 0;
                    return (
                  <div className="flex flex-col gap-1.5 mt-2 px-1">
                    <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span>{esLinealUI ? "Tramos:" : "Uds:"}</span>
                      <input
                        type="number"
                        min={1}
                        value={cantUI}
                        onChange={(e) => actualizarElemento({ ...elemento, cantidad: Math.max(1, parseInt(e.target.value) || 1), calculado: false })}
                        className="bg-surface-light border border-border rounded px-2 py-0.5 w-14 text-center text-foreground text-xs focus:outline-none focus:border-accent"
                      />
                    </label>
                    {esLinealUI && cantUI > 1 && (
                      <span className="text-xs text-blue-400 font-medium">
                        {cantUI} tramos de {longTramo}m — {numUniones} uniones con solape
                      </span>
                    )}
                    <label className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span>Planta:</span>
                      <input
                        type="text"
                        value={elemento.planta || ""}
                        onChange={(e) => actualizarElemento({ ...elemento, planta: e.target.value || undefined })}
                        placeholder="—"
                        className="bg-surface-light border border-border rounded px-2 py-0.5 w-24 text-foreground text-xs focus:outline-none focus:border-accent"
                        list="plantas-list"
                      />
                      <datalist id="plantas-list">
                        {plantasUnicas.map(p => <option key={p} value={p} />)}
                      </datalist>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span>Recub:</span>
                      <input
                        type="number"
                        min={0}
                        step={0.005}
                        value={elemento.recubrimiento ?? config.recubrimiento}
                        onChange={(e) => actualizarElemento({ ...elemento, recubrimiento: parseFloat(e.target.value) || 0.05 })}
                        className="bg-surface-light border border-border rounded px-2 py-0.5 w-16 text-center text-foreground text-xs focus:outline-none focus:border-accent"
                      />
                      <span className="text-gray-600">m</span>
                    </label>
                    </div>
                  </div>
                    );
                  })()}
                </div>
                <span className="text-sm text-gray-500 whitespace-nowrap">
                  {elementoActivo + 1} / {proyecto.elementos.length}
                </span>
              </div>

              {/* Geometria */}
              <GeometriaInput
                geometria={elemento.geometria}
                categoria={elemento.categoria || "libre"}
                subtipo={elemento.subtipo}
                recubrimientoBase={elemento.recubrimiento ?? config.recubrimiento}
                onGeometriaChange={(g) => {
                  // Auto-regenerar barras al cambiar geometria
                  const recuBase = elemento.recubrimiento ?? config.recubrimiento;
                  const barras = generarBarrasDesdeGeometria(
                    g,
                    elemento.categoria || "libre",
                    elemento.subtipo,
                    recuBase
                  );
                  actualizarElemento({
                    ...elemento,
                    geometria: g,
                    barrasNecesarias: barras.map((b) => ({ ...b, id: generarId() })),
                    calculado: false,
                  });
                }}
                onGenerarBarras={() => {
                  if (!elemento.geometria) return;
                  const recuBase = elemento.recubrimiento ?? config.recubrimiento;
                  const barras = generarBarrasDesdeGeometria(
                    elemento.geometria,
                    elemento.categoria || "libre",
                    elemento.subtipo,
                    recuBase
                  );
                  actualizarElemento({
                    ...elemento,
                    barrasNecesarias: barras.map((b) => ({ ...b, id: generarId() })),
                    calculado: false,
                  });
                }}
              />

              {/* Mallazo electrosoldado (opcional) */}
              <MallazoConfig
                elemento={elemento}
                onChange={(mallazo) => actualizarElemento({ ...elemento, mallazo })}
              />

              {/* Info solapes activos */}
              {elemento.barrasNecesarias.some(b => {
                const nPatas = b.patas || 0;
                const lPata = b.longitudPata || 0.15;
                return (b.longitud + nPatas * lPata) > config.longitudBarraComercial;
              }) && (
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                      Solapes activos (barras &gt; {config.longitudBarraComercial}m)
                    </h3>
                  </div>
                  <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                    {elemento.barrasNecesarias.filter(b => {
                      const nPatas = b.patas || 0;
                      const lPata = b.longitudPata || 0.15;
                      return (b.longitud + nPatas * lPata) > config.longitudBarraComercial;
                    }).map((b, i) => {
                      const nPatas = b.patas || 0;
                      const lPata = b.longitudPata || 0.15;
                      const longitudTotal = b.longitud + nPatas * lPata;
                      const pos = b.posicionSolape || inferirPosicionSolape(b.etiqueta);
                      const solape = (pos && config.solapesPorPosicion?.[pos]?.[b.diametro])
                        ?? config.solape[b.diametro] ?? 0.50;
                      const longitudEfectiva = config.longitudBarraComercial - solape;
                      const numTramos = Math.ceil(longitudTotal / longitudEfectiva);
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-amber-400">Ø{b.diametro}</span>
                          <span>{b.etiqueta || `Pieza ${i+1}`}: {longitudTotal.toFixed(2)}m</span>
                          <span className="text-amber-500">→ {numTramos} tramos × {b.cantidad} uds = {numTramos * b.cantidad} piezas</span>
                          <span className="text-gray-500">(solape {(solape*100).toFixed(0)}cm)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sobrantes reutilizados */}
              {resultado && resultado.sobrantesUsados.length > 0 && (
                <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3">
                  <span className="text-sm text-green-400 font-medium">
                    Se reutilizaron {resultado.sobrantesUsados.length} sobrantes
                    {resultado.barrasComercialAhorradas > 0 && (
                      <span> — ~{resultado.barrasComercialAhorradas} barras ahorradas</span>
                    )}
                  </span>
                </div>
              )}

              {/* Control de diámetros */}
              {elemento.barrasNecesarias.length > 0 && (() => {
                const diametrosUsados = [...new Set(elemento.barrasNecesarias.map(b => b.diametro))].sort((a, b) => a - b);
                return diametrosUsados.length > 0 && (
                  <div className="bg-surface rounded-xl border border-border p-3 flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Diámetros:</span>
                    {diametrosUsados.map(d => (
                      <span key={d} className="text-xs bg-surface-light border border-border rounded px-2 py-0.5 text-foreground">
                        Ø{d}
                      </span>
                    ))}
                    {diametrosUsados.length > 1 && (
                      <>
                        <span className="text-gray-600">|</span>
                        <label className="flex items-center gap-1.5 text-xs text-gray-400">
                          <span>Unificar a:</span>
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              const nuevoD = parseInt(e.target.value);
                              if (!nuevoD) return;
                              actualizarElemento({
                                ...elemento,
                                barrasNecesarias: elemento.barrasNecesarias.map(b => ({ ...b, diametro: nuevoD })),
                                calculado: false,
                              });
                              e.target.value = "";
                            }}
                            className="bg-surface-light border border-border rounded px-2 py-0.5 text-foreground text-xs focus:outline-none focus:border-accent"
                          >
                            <option value="" disabled>Ø...</option>
                            {DIAMETROS_DISPONIBLES.map(d => (
                              <option key={d} value={d}>Ø{d}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                    {diametrosUsados.length === 1 && (
                      <>
                        <span className="text-gray-600">|</span>
                        <label className="flex items-center gap-1.5 text-xs text-gray-400">
                          <span>Cambiar a:</span>
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              const nuevoD = parseInt(e.target.value);
                              if (!nuevoD) return;
                              actualizarElemento({
                                ...elemento,
                                barrasNecesarias: elemento.barrasNecesarias.map(b => ({ ...b, diametro: nuevoD })),
                                calculado: false,
                              });
                              e.target.value = "";
                            }}
                            className="bg-surface-light border border-border rounded px-2 py-0.5 text-foreground text-xs focus:outline-none focus:border-accent"
                          >
                            <option value="" disabled>Ø...</option>
                            {DIAMETROS_DISPONIBLES.filter(d => d !== diametrosUsados[0]).map(d => (
                              <option key={d} value={d}>Ø{d}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Barras */}
              <div className="bg-surface rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                    Barras necesarias ({elemento.barrasNecesarias.reduce((s, b) => s + b.cantidad, 0)} piezas
                    {(elemento.cantidad || 1) > 1 && (() => {
                      const tg = getTipoGeometria(elemento.categoria || "libre", elemento.subtipo);
                      return tg === "lineal"
                        ? ` — ${elemento.cantidad} tramos`
                        : ` × ${elemento.cantidad} uds = ${elemento.barrasNecesarias.reduce((s, b) => s + b.cantidad, 0) * (elemento.cantidad!)}`;
                    })()}
                    )
                  </h2>
                  <button
                    onClick={agregarBarra}
                    className="bg-accent hover:bg-accent-dark text-black font-medium py-1.5 px-4 rounded-lg text-sm transition-colors"
                  >
                    + Agregar
                  </button>
                </div>
                <div className="space-y-2">
                  {elemento.barrasNecesarias.map((barra, idx) => {
                    const pos = barra.posicionSolape || inferirPosicionSolape(barra.etiqueta);
                    const solapeEfectivo = (pos && config.solapesPorPosicion?.[pos]?.[barra.diametro])
                      ?? config.solape[barra.diametro] ?? 0.50;
                    return (
                      <BarraInput
                        key={barra.id}
                        barra={barra}
                        longitudMax={config.longitudBarraComercial}
                        solapeActual={solapeEfectivo}
                        posicionSolape={pos}
                        categoria={elemento.categoria || "libre"}
                        onSolapeChange={(diametro, valor, posicion) => {
                          let nuevaConfig: ConfigConstruccion;
                          if (posicion) {
                            const actual = config.solapesPorPosicion || {};
                            const cubeta = { ...(actual[posicion] || {}), [diametro]: valor };
                            nuevaConfig = {
                              ...config,
                              solapesPorPosicion: { ...actual, [posicion]: cubeta },
                            };
                          } else {
                            nuevaConfig = {
                              ...config,
                              solape: { ...config.solape, [diametro]: valor },
                            };
                          }
                          const hayCalculados = proyecto.elementos.some((el) => el.calculado);
                          if (hayCalculados) recalcularConConfig(nuevaConfig);
                          else setProyecto({ ...proyecto, config: nuevaConfig });
                        }}
                        onChange={(b) => actualizarBarra(idx, b)}
                        onDelete={() => eliminarBarra(idx)}
                      />
                    );
                  })}
                </div>
              </div>

              <button
                onClick={calcular}
                className="w-full bg-accent hover:bg-accent-dark text-black font-bold py-3 px-6 rounded-xl text-lg transition-colors shadow-lg shadow-accent/20"
              >
                OPTIMIZAR CORTES
                {(elemento.cantidad || 1) > 1 && (() => {
                  const tg = getTipoGeometria(elemento.categoria || "libre", elemento.subtipo);
                  return tg === "lineal"
                    ? ` (${elemento.cantidad} tramos)`
                    : ` (×${elemento.cantidad} uds)`;
                })()}
                {usarSobrantes && elementoActivo > 0 && " + sobrantes"}
              </button>

              {resultado && (
                <>
                  <div className="flex gap-2">
                    <VistaImpresion
                      resultado={resultado}
                      longitudBarraComercial={config.longitudBarraComercial}
                      nombreElemento={elemento.nombre}
                      nombreProyecto={proyecto.nombre}
                      geometria={elemento.geometria}
                      categoria={elemento.categoria}
                      subtipo={elemento.subtipo}
                    />
                  </div>
                  <ResultadoCortes
                    resultado={resultado}
                    longitudBarraComercial={config.longitudBarraComercial}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FAB optimizar cortes - siempre accesible sin scroll */}
      {tab === "despiece" && elemento && (
        <button
          onClick={calcular}
          className="fixed bottom-6 right-6 z-40 bg-accent hover:bg-accent-dark text-black font-bold py-3 px-5 rounded-full shadow-2xl shadow-accent/40 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
          title="Optimizar cortes (sin necesidad de scroll)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-sm">OPTIMIZAR</span>
          {(elemento.cantidad || 1) > 1 && (() => {
            const tg = getTipoGeometria(elemento.categoria || "libre", elemento.subtipo);
            return (
              <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded">
                {tg === "lineal" ? `${elemento.cantidad} tramos` : `×${elemento.cantidad}`}
              </span>
            );
          })()}
        </button>
      )}

      {/* Modal selector de elemento */}
      {mostrarSelector && (
        <SelectorElemento
          onSelect={agregarElemento}
          onClose={() => setMostrarSelector(false)}
        />
      )}
    </div>
  );
}
