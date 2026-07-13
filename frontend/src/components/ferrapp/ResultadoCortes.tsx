"use client";

import { ResultadoDespiece, PESO_POR_METRO } from "@/lib/ferrapp/types";

interface ResultadoCortesProps {
  resultado: ResultadoDespiece;
  longitudBarraComercial: number;
}

const COLORES = [
  "#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#a855f7",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  "#e879f9", "#fb923c", "#2dd4bf", "#fbbf24", "#818cf8",
];

export default function ResultadoCortes({ resultado, longitudBarraComercial }: ResultadoCortesProps) {
  if (resultado.resultadosPorDiametro.length === 0) return null;

  // Contar barras por longitud para el resumen
  const barrasPorLongitud = new Map<number, number>();
  for (const res of resultado.resultadosPorDiametro) {
    for (const bc of res.barrasComerciales) {
      if (bc.id > 0) { // solo comerciales, no sobrantes
        const L = bc.longitudTotal;
        barrasPorLongitud.set(L, (barrasPorLongitud.get(L) || 0) + 1);
      }
    }
  }

  const totalBarras = resultado.resultadosPorDiametro.reduce((s, r) => s + r.totalBarrasComerciales, 0);
  const metrosCompra = resultado.resultadosPorDiametro.reduce(
    (s, r) => s + r.barrasComerciales.filter(b => b.id > 0).reduce((sum, bc) => sum + bc.longitudTotal, 0),
    0
  );
  const pctDesperdicio = metrosCompra > 0
    ? ((resultado.resultadosPorDiametro.reduce((s, r) => s + r.metrosDesperdicio, 0) / metrosCompra) * 100).toFixed(1)
    : "0";

  // Texto de barras (ej: "320 de 12m + 48 de 6m")
  const barrasTexto = [...barrasPorLongitud.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([L, n]) => `${n} de ${L}m`)
    .join(" + ");

  return (
    <div className="space-y-6">
      {/* Resumen global */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="text-lg font-bold text-accent mb-4">Resumen del Despiece</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface-light rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{totalBarras}</div>
            <div className="text-xs text-gray-400 mt-1">
              {barrasPorLongitud.size > 1 ? barrasTexto : `Barras de ${longitudBarraComercial}m`}
            </div>
          </div>
          <div className="bg-surface-light rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-foreground">
              {resultado.pesoTotal.toFixed(0)} kg
            </div>
            <div className="text-xs text-gray-400 mt-1">Peso total</div>
          </div>
          <div className="bg-surface-light rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-success">{pctDesperdicio}%</div>
            <div className="text-xs text-gray-400 mt-1">Desperdicio</div>
          </div>
          <div className="bg-surface-light rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-foreground">
              {resultado.desperdicioTotal.toFixed(1)} m
            </div>
            <div className="text-xs text-gray-400 mt-1">Metros sobrantes</div>
          </div>
        </div>
      </div>

      {/* Detalle por diametro */}
      {resultado.resultadosPorDiametro.map((res) => (
        <div key={res.diametro} className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">
              <span className="text-accent">&#8960; {res.diametro} mm</span>
            </h3>
            <div className="flex gap-4 text-sm text-gray-400">
              <span>{res.totalBarrasComerciales} barras</span>
              <span>{res.totalPiezas} piezas</span>
              <span>{res.pesoKg.toFixed(1)} kg</span>
              <span className={res.porcentajeDesperdicio < 5 ? "text-success" : res.porcentajeDesperdicio < 10 ? "text-accent" : "text-danger"}>
                {res.porcentajeDesperdicio}% desperdicio
              </span>
            </div>
          </div>

          {/* Visualizacion grafica de cada barra */}
          <div className="space-y-2">
            {res.barrasComerciales.map((bc) => {
              const barLong = bc.longitudTotal; // longitud real de ESTA barra
              return (
                <div key={bc.id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-8 text-right shrink-0">
                    {bc.id > 0 ? `#${bc.id}` : "R"}
                  </span>
                  <div className="flex-1 bg-surface-light rounded-md h-10 relative overflow-hidden border border-border"
                    style={{ maxWidth: `${(barLong / longitudBarraComercial) * 100}%` }}
                  >
                    {(() => {
                      let offset = 0;
                      return bc.cortes.map((corte, idx) => {
                        const width = (corte.longitud / barLong) * 100;
                        const left = offset;
                        offset += width;
                        return (
                          <div
                            key={idx}
                            className="absolute top-0 h-full flex items-center justify-center text-[10px] font-medium overflow-hidden border-r border-background"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              backgroundColor: COLORES[idx % COLORES.length],
                              color: "#000",
                            }}
                            title={`${corte.etiqueta}: ${corte.longitud.toFixed(2)}m`}
                          >
                            {width > 8 && (
                              <span className="truncate px-1">
                                {corte.longitud.toFixed(2)}m
                              </span>
                            )}
                          </div>
                        );
                      });
                    })()}
                    {bc.sobrante > 0.01 && (
                      <div
                        className="absolute top-0 h-full flex items-center justify-center text-[10px] text-gray-500"
                        style={{
                          right: 0,
                          width: `${(bc.sobrante / barLong) * 100}%`,
                          background: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 6px)",
                        }}
                      >
                        {bc.sobrante >= 0.1 && `${bc.sobrante.toFixed(2)}m`}
                      </div>
                    )}
                  </div>
                  {/* Etiqueta de longitud de barra si hay varias medidas */}
                  {barrasPorLongitud.size > 1 && bc.id > 0 && (
                    <span className="text-[10px] text-gray-600 w-8 shrink-0">{barLong}m</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tabla resumen de cortes */}
          <details className="mt-4">
            <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300 select-none">
              Ver detalle de cortes
            </summary>
            <table className="w-full mt-2 text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-border">
                  <th className="text-left py-1 px-2">Barra #</th>
                  <th className="text-left py-1 px-2">Cortes</th>
                  <th className="text-right py-1 px-2">Sobrante</th>
                </tr>
              </thead>
              <tbody>
                {res.barrasComerciales.map((bc) => (
                  <tr key={bc.id} className="border-b border-border/50">
                    <td className="py-1 px-2">
                      {bc.id > 0 ? `#${bc.id}` : "Reciclada"}
                      {barrasPorLongitud.size > 1 && bc.id > 0 && (
                        <span className="text-gray-600 ml-1">({bc.longitudTotal}m)</span>
                      )}
                    </td>
                    <td className="py-1 px-2">
                      {bc.cortes.map((c, i) => (
                        <span key={i} className="inline-block mr-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-1"
                            style={{ backgroundColor: COLORES[i % COLORES.length] }}
                          />
                          {c.longitud.toFixed(2)}m
                          <span className="text-gray-500 ml-1">({c.etiqueta})</span>
                        </span>
                      ))}
                    </td>
                    <td className="py-1 px-2 text-right text-gray-500">{bc.sobrante.toFixed(2)}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      ))}
    </div>
  );
}
