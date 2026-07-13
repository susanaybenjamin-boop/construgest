'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useBudgetStore } from '@/stores/budgetStore'
import api from '@/lib/api'
import {
  Brain, TrendingUp, AlertTriangle, BarChart3, FileText,
  DollarSign, Loader2, ChevronDown, ChevronUp, Sparkles,
  CheckCircle, XCircle, Info, TrendingDown,
} from 'lucide-react'

interface AnalysisType {
  id: string
  name: string
  description: string
  icon: typeof Brain
  endpoint: string
  color: string
}

const analysisTypes: AnalysisType[] = [
  { id: 'budget', name: 'Análisis de Presupuesto', description: 'Analiza desviaciones, márgenes y coherencia del presupuesto', icon: BarChart3, endpoint: '/ai/analyze-budget', color: 'blue' },
  { id: 'optimize', name: 'Optimización de Costes', description: 'Sugiere oportunidades de ahorro y optimización', icon: TrendingUp, endpoint: '/ai/suggest-optimizations', color: 'green' },
  { id: 'issues', name: 'Detección de Problemas', description: 'Identifica errores, inconsistencias y riesgos', icon: AlertTriangle, endpoint: '/ai/detect-issues', color: 'amber' },
  { id: 'report', name: 'Informe Ejecutivo', description: 'Genera un resumen ejecutivo completo del proyecto', icon: FileText, endpoint: '/ai/executive-report', color: 'purple' },
  { id: 'prices', name: 'Comparación de Precios', description: 'Compara precios unitarios con referencias del mercado', icon: DollarSign, endpoint: '/ai/compare-prices', color: 'rose' },
  { id: 'contingency', name: 'Estimación de Contingencia', description: 'Calcula reservas de contingencia recomendadas', icon: Sparkles, endpoint: '/ai/estimate-contingency', color: 'indigo' },
]

const colorMap: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200 hover:border-blue-400',
  green: 'bg-green-50 text-green-700 border-green-200 hover:border-green-400',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400',
  purple: 'bg-purple-50 text-purple-700 border-purple-200 hover:border-purple-400',
  rose: 'bg-rose-50 text-rose-700 border-rose-200 hover:border-rose-400',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:border-indigo-400',
}

const iconBgMap: Record<string, string> = {
  blue: 'bg-blue-100', green: 'bg-green-100', amber: 'bg-amber-100',
  purple: 'bg-purple-100', rose: 'bg-rose-100', indigo: 'bg-indigo-100',
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    warning: 'bg-amber-100 text-amber-700',
    info: 'bg-blue-100 text-blue-700',
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-green-100 text-green-700',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[severity] || 'bg-gray-100 text-gray-600'}`}>
      {severity}
    </span>
  )
}

function renderResult(result: any) {
  if (!result) return null

  if (result.error) {
    return (
      <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-700">{result.error}</p>
        <p className="text-xs text-red-500 mt-1">Configura las API keys de AI en Ajustes para usar esta función</p>
      </div>
    )
  }

  // Array response (suggest-optimizations, detect-issues, etc.)
  if (Array.isArray(result)) {
    if (result.length === 0) {
      return (
        <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700">No se detectaron problemas ni optimizaciones necesarias.</p>
        </div>
      )
    }

    // Detect if it's an issues array or optimizations array
    const isIssues = result[0] && ('message' in result[0] || 'severity' in result[0])
    const isOptimizations = result[0] && ('current_price' in result[0])
    const isMarket = result[0] && ('market_price_avg' in result[0] || 'quoted_price' in result[0])

    return (
      <div className="mt-3 space-y-2">
        {result.map((item: any, i: number) => (
          <div key={i} className="p-3 bg-white border border-gray-200 rounded-lg">
            {isIssues && (
              <>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5"><SeverityBadge severity={item.severity || 'info'} /></div>
                  <p className="text-sm font-medium text-gray-800">{item.message || item.issue}</p>
                </div>
                {item.recommendation && (
                  <p className="text-xs text-gray-500 mt-1 pl-0">💡 {item.recommendation}</p>
                )}
                {item.affected_items?.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">Afecta: {item.affected_items.join(', ')}</p>
                )}
              </>
            )}
            {isOptimizations && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{item.item_code} — {item.item_name}</span>
                  <span className="text-sm font-semibold text-green-700">Ahorro: {fmt(item.savings || 0)}</span>
                </div>
                <div className="flex gap-4 mt-1 text-xs text-gray-500">
                  <span>Actual: <strong>{fmt(item.current_price)}</strong></span>
                  <span>Sugerido: <strong>{fmt(item.suggested_price)}</strong></span>
                  <span>Confianza: {Math.round((item.confidence || 0) * 100)}%</span>
                </div>
                {item.reason && <p className="text-xs text-gray-400 mt-1">{item.reason}</p>}
              </>
            )}
            {isMarket && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{item.item_code} — {item.item_name}</span>
                  <SeverityBadge severity={item.status === 'overpriced' ? 'warning' : item.status === 'underpriced' ? 'info' : 'low'} />
                </div>
                <div className="flex gap-4 mt-1 text-xs text-gray-500">
                  <span>Mercado: <strong>{fmt(item.market_price_avg)}</strong></span>
                  <span>Ofertado: <strong>{fmt(item.quoted_price)}</strong></span>
                </div>
                {item.opportunity && <p className="text-xs text-gray-400 mt-1">{item.opportunity}</p>}
              </>
            )}
            {!isIssues && !isOptimizations && !isMarket && (
              <pre className="text-xs text-gray-600 whitespace-pre-wrap">{JSON.stringify(item, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
    )
  }

  // analyze-budget response
  if (result.summary && (result.suggestions || result.warnings || result.optimizations)) {
    return (
      <div className="mt-3 space-y-3">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">{result.summary}</p>
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-blue-600">
            {result.total_cost > 0 && <span>Coste total: <strong>{fmt(result.total_cost)}</strong></span>}
            {result.estimated_savings > 0 && <span>Ahorro potencial: <strong>{fmt(result.estimated_savings)}</strong></span>}
            {result.confidence_score && <span>Confianza: <strong>{result.confidence_score}%</strong></span>}
            {result.risk_level && <span>Riesgo: <SeverityBadge severity={result.risk_level} /></span>}
          </div>
        </div>

        {result.warnings?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Alertas</p>
            {result.warnings.map((w: any, i: number) => (
              <div key={i} className="p-2 bg-amber-50 border border-amber-200 rounded mb-1">
                <div className="flex items-start gap-2">
                  <SeverityBadge severity={w.severity} />
                  <p className="text-xs text-gray-700">{w.message}</p>
                </div>
                {w.recommendation && <p className="text-xs text-gray-500 mt-1">💡 {w.recommendation}</p>}
              </div>
            ))}
          </div>
        )}

        {result.suggestions?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Sugerencias</p>
            {result.suggestions.map((s: any, i: number) => (
              <div key={i} className="p-2 bg-white border border-gray-200 rounded mb-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-800">{s.title}</p>
                  {s.savings > 0 && <span className="text-xs text-green-700 font-semibold">-{fmt(s.savings)}</span>}
                </div>
                {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
              </div>
            ))}
          </div>
        )}

        {result.optimizations?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Optimizaciones de precios</p>
            {result.optimizations.map((o: any, i: number) => (
              <div key={i} className="p-2 bg-green-50 border border-green-200 rounded mb-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-800">{o.item_code} — {o.item_name}</span>
                  <span className="text-xs text-green-700 font-semibold">-{fmt(o.savings)}</span>
                </div>
                <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                  <span>{fmt(o.current_price)} → {fmt(o.suggested_price)}</span>
                  {o.reason && <span>· {o.reason}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // executive-report response
  if (result.resumen_ejecutivo || result.titulo) {
    return (
      <div className="mt-3 space-y-3">
        {result.titulo && <p className="text-sm font-bold text-gray-800">{result.titulo}</p>}
        {result.resumen_ejecutivo && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Resumen Ejecutivo</p>
            <p className="text-sm text-gray-700">{result.resumen_ejecutivo}</p>
          </div>
        )}
        {result.metricas_clave?.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {result.metricas_clave.map((m: any, i: number) => (
              <div key={i} className="p-2 bg-white border border-gray-200 rounded text-center">
                <p className="text-xs text-gray-500">{m.nombre}</p>
                <p className="text-sm font-semibold text-gray-800">{m.valor}</p>
              </div>
            ))}
          </div>
        )}
        {result.riesgos?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Riesgos</p>
            {result.riesgos.map((r: any, i: number) => (
              <div key={i} className="p-2 bg-red-50 border border-red-100 rounded mb-1 text-xs text-gray-700">
                <span className="font-medium">{r.descripcion}</span>
                {r.probabilidad && <span className="text-gray-500"> · Probabilidad: {r.probabilidad} · Impacto: {r.impacto}</span>}
              </div>
            ))}
          </div>
        )}
        {result.oportunidades_ahorro?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Oportunidades de Ahorro</p>
            {result.oportunidades_ahorro.map((o: any, i: number) => (
              <div key={i} className="p-2 bg-green-50 border border-green-100 rounded mb-1 text-xs text-gray-700 flex justify-between">
                <span>{o.descripcion}</span>
                {o.ahorro_estimado > 0 && <span className="text-green-700 font-semibold">{fmt(o.ahorro_estimado)}</span>}
              </div>
            ))}
          </div>
        )}
        {result.conclusiones?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Conclusiones</p>
            <ul className="space-y-1">
              {result.conclusiones.map((c: string, i: number) => (
                <li key={i} className="text-xs text-gray-700 flex gap-2"><span>•</span><span>{c}</span></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // compare-prices response
  if (result.market_analysis || result.overall_assessment) {
    return (
      <div className="mt-3 space-y-3">
        {result.overall_assessment && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
            <p className="text-sm text-gray-700">{result.overall_assessment}</p>
            <div className="flex gap-4 mt-2 text-xs text-rose-600">
              {result.negotiation_potential > 0 && <span>Margen negociación: <strong>{fmt(result.negotiation_potential)}</strong></span>}
              {result.indice_competitividad && <span>Índice competitividad: <strong>{result.indice_competitividad}%</strong></span>}
            </div>
          </div>
        )}
        {result.market_analysis?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Análisis por partida</p>
            {result.market_analysis.map((m: any, i: number) => (
              <div key={i} className="p-2 bg-white border border-gray-200 rounded mb-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-800">{m.item_code} — {m.item_name}</span>
                  <SeverityBadge severity={m.status === 'overpriced' ? 'warning' : m.status === 'underpriced' ? 'info' : 'low'} />
                </div>
                <div className="flex gap-4 mt-0.5 text-xs text-gray-500">
                  <span>Mercado: {fmt(m.market_price_avg)}</span>
                  <span>Ofertado: {fmt(m.quoted_price)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // estimate-contingency response
  if (result.recommended_contingency_pct !== undefined || result.contingency_amount !== undefined) {
    return (
      <div className="mt-3 space-y-3">
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-indigo-800">Contingencia recomendada</span>
            <span className="text-xl font-bold text-indigo-700">{result.recommended_contingency_pct}%</span>
          </div>
          {result.contingency_amount > 0 && (
            <p className="text-sm text-indigo-600 mt-1">Importe: <strong>{fmt(result.contingency_amount)}</strong></p>
          )}
          {result.justification && <p className="text-xs text-gray-600 mt-2">{result.justification}</p>}
        </div>
        {result.risk_factors?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Factores de riesgo</p>
            <ul className="space-y-1">
              {result.risk_factors.map((f: string, i: number) => (
                <li key={i} className="text-xs text-gray-700 flex gap-2"><span>⚠️</span><span>{f}</span></li>
              ))}
            </ul>
          </div>
        )}
        {result.contingency_breakdown && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Desglose</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(result.contingency_breakdown).map(([k, v]) => (
                <div key={k} className="p-2 bg-white border border-gray-200 rounded text-center">
                  <p className="text-xs text-gray-500 capitalize">{k}</p>
                  <p className="text-sm font-semibold text-gray-800">{String(v)}%</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Generic fallback: render key-value pairs in a readable way
  return (
    <div className="mt-3 p-4 bg-gray-50 rounded-lg space-y-2">
      {Object.entries(result).map(([key, val]) => {
        if (val === null || val === undefined) return null
        if (Array.isArray(val) && val.length === 0) return null
        return (
          <div key={key}>
            <p className="text-xs font-semibold text-gray-500 uppercase">{key.replace(/_/g, ' ')}</p>
            {typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' ? (
              <p className="text-sm text-gray-700">{String(val)}</p>
            ) : Array.isArray(val) ? (
              <ul className="space-y-0.5 mt-0.5">
                {(val as any[]).map((item, i) => (
                  <li key={i} className="text-xs text-gray-600">
                    {typeof item === 'string' ? `• ${item}` : JSON.stringify(item)}
                  </li>
                ))}
              </ul>
            ) : (
              <pre className="text-xs text-gray-600 whitespace-pre-wrap">{JSON.stringify(val, null, 2)}</pre>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AIPage() {
  const params = useParams()
  const projectId = params.id as string
  const { activeBudget, budgets, loadBudgets, loadFullBudget } = useBudgetStore()

  const [running, setRunning] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, any>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loadingBudget, setLoadingBudget] = useState(false)

  // Auto-load approved budget if none is loaded
  useEffect(() => {
    if (activeBudget) return
    const load = async () => {
      setLoadingBudget(true)
      try {
        await loadBudgets(projectId)
        const all = useBudgetStore.getState().budgets
        const approved = all.find((b) => b.status === 'approved') || all.find((b) => b.status === 'pending') || all[0]
        if (approved) await loadFullBudget(approved.id)
      } catch {
        // ignore
      } finally {
        setLoadingBudget(false)
      }
    }
    load()
  }, [projectId])

  const runAnalysis = async (analysis: AnalysisType) => {
    setRunning(analysis.id)
    try {
      const current = useBudgetStore.getState().activeBudget
      const budgetData = current
        ? JSON.stringify({
            budget: current.budget,
            chapters: current.chapters.map((ch) => ({
              code: ch.chapter.code,
              name: ch.chapter.name,
              items: ch.items.map((item) => ({
                code: item.code,
                name: item.name,
                unit: item.unit,
                quantity: item.quantity,
                unit_price: item.unit_price,
                cost_price: item.cost_price,
                total: item.quantity * item.unit_price,
              })),
            })),
          })
        : JSON.stringify({ project_id: projectId, note: 'No budget loaded' })

      const { data } = await api.post(analysis.endpoint, {
        data: budgetData,
        project_id: projectId,
      })

      setResults((prev) => ({ ...prev, [analysis.id]: data }))
      setExpanded((prev) => ({ ...prev, [analysis.id]: true }))
    } catch (err: any) {
      setResults((prev) => ({
        ...prev,
        [analysis.id]: { error: err.response?.data?.error || err.message || 'Error al ejecutar análisis' },
      }))
      setExpanded((prev) => ({ ...prev, [analysis.id]: true }))
    } finally {
      setRunning(null)
    }
  }

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const currentBudget = useBudgetStore((s) => s.activeBudget)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Asistente IA</h1>
        <p className="text-sm text-gray-500 mt-1">Análisis inteligente de tu proyecto con IA</p>
      </div>

      {loadingBudget && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <p className="text-sm text-blue-700">Cargando presupuesto...</p>
        </div>
      )}

      {!currentBudget && !loadingBudget && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">
            No hay presupuesto cargado. Ve a la sección de Presupuesto y selecciona uno, o asegúrate de que el proyecto tenga un presupuesto creado.
          </p>
        </div>
      )}

      {currentBudget && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <p className="text-sm text-green-700">
            Presupuesto cargado: <strong>{currentBudget.budget?.name || 'Sin nombre'}</strong>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {analysisTypes.map((analysis) => {
          const result = results[analysis.id]
          const isExpanded = expanded[analysis.id]
          const isRunning = running === analysis.id

          return (
            <div
              key={analysis.id}
              className={`rounded-xl border-2 p-5 transition-all ${result ? 'bg-white border-gray-200' : colorMap[analysis.color]}`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBgMap[analysis.color]}`}>
                  <analysis.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{analysis.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{analysis.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {result && (
                    <button
                      onClick={() => toggleExpanded(analysis.id)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded transition"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    onClick={() => runAnalysis(analysis)}
                    disabled={isRunning || running !== null}
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    {isRunning ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Analizando...
                      </span>
                    ) : result ? (
                      'Repetir'
                    ) : (
                      'Ejecutar'
                    )}
                  </button>
                </div>
              </div>

              {isExpanded && result && renderResult(result)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
