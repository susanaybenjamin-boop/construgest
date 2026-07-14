'use client'

// ─────────────────────────────────────────────────────────────
// Panel de análisis IA reutilizable.
//
// Envuelve una skill del backend (`/ai/*`) en una tarjeta con botón
// "Analizar con IA", estado de carga y un renderizador GENÉRICO del
// resultado (prosa + métricas + listas). Sirve para las skills cuyo
// shape es {summary/assessment + métricas + arrays}: analyze-materials,
// analyze-expenses, analyze-certifications, compare-budgets…
//
// La IA es 100% local (Ollama); el backend calcula las cifras y el LLM
// solo redacta el resumen → aquí no se muestran claves ni cuotas.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react'
import api from '@/lib/api'
import { Brain, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

interface AiInsightPanelProps {
  title: string
  description?: string
  endpoint: string
  /** Cuerpo de la petición. Función que devuelve el body, o `null` si aún no se puede analizar. */
  body?: () => Record<string, unknown> | null
  /** Deshabilita el botón (p.ej. faltan datos) con un motivo. */
  disabled?: boolean
  disabledReason?: string
  cta?: string
}

// Claves que se muestran como párrafo de prosa (resumen del LLM).
const PROSE_KEYS = new Set([
  'summary', 'assessment', 'trend_analysis', 'risk_assessment',
  'completion_estimate', 'justification', 'overall_assessment',
])
const PCT_RE = /(pct|percentage|percent|progress|similarity|difference)/i
const EUR_RE = /(amount|total|spent|budget|price|savings|variance|certified|pending)/i
const SKIP_KEYS = new Set(['id', 'organization_id', 'project_id', 'budget_id', 'chapter_id'])

// Traducción de las claves que devuelven los servicios de análisis (backend en
// inglés) a etiquetas en español. Si una clave no está, se "humaniza" la cruda.
const LABELS: Record<string, string> = {
  // gastos
  summary: 'Resumen', trend_analysis: 'Tendencia', total_spent: 'Gastado',
  budget_total: 'Presupuestado', budget_variance: 'Desviación (€)',
  variance_percentage: 'Desviación (%)', unassigned_amount: 'Sin asignar',
  anomalies_found: 'Anomalías', risk_level: 'Riesgo', expenses_count: 'Nº gastos',
  by_chapter: 'Por capítulo', expense_anomalies: 'Anomalías de gasto',
  optimization_opportunities: 'Oportunidades', overspent: 'Sobrecoste',
  variance_pct: 'Desv. %', budgeted: 'Presupuestado', spent: 'Gastado', variance: 'Desviación',
  // certificaciones
  certifications_count: 'Nº certificaciones', total_progress: 'Avance',
  total_certified: 'Certificado', pending_amount: 'Pendiente', avg_per_cert: 'Media/cert',
  completion_estimate: 'Estimación fin', risk_assessment: 'Riesgo',
  per_certification: 'Por certificación', progress_pct: 'Avance %',
  current_amount: 'Importe actual', recommendations: 'Recomendaciones',
  // materiales
  total_items: 'Materiales', materials_with_offers: 'Con ofertas', duplicates: 'Duplicados',
  price_alerts: 'Alertas de precio', supplier_optimization: 'Optimización proveedor',
  potential_unit_savings: 'Ahorro/ud', inventory_insights: 'Observaciones',
  material_name: 'Material', current_price: 'Precio actual', best_supplier_price: 'Mejor precio',
  best_supplier_name: 'Mejor proveedor', difference_percent: 'Diferencia', recommendation: 'Recomendación',
  similarity_score: 'Similitud', reason: 'Motivo', suggested_action: 'Acción',
  // comunes / compare-budgets / find-similar
  assessment: 'Valoración', resultados: 'Resultados', code: 'Código', name: 'Nombre',
  number: 'Nº', status: 'Estado', unit: 'Unidad', unit_price: 'Precio ud.', usage_count: 'Usos',
}

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const num = (n: number) => new Intl.NumberFormat('es-ES').format(n)

function fmtValue(key: string, val: number): string {
  if (PCT_RE.test(key)) return `${num(val)}%`
  if (EUR_RE.test(key)) return eur(val)
  return num(val)
}

function fmtScalar(key: string, val: number | string | boolean): string {
  if (typeof val === 'boolean') return val ? 'Sí' : 'No'
  if (typeof val === 'number') return fmtValue(key, val)
  return String(val)
}

function humanize(key: string): string {
  return LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/, (c) => c.toUpperCase())
}

function ObjectCard({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj).filter(
    ([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== undefined && v !== '',
  )
  return (
    <div className="p-2.5 bg-white border border-gray-200 rounded-lg">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {entries.map(([k, v]) => (
          <span key={k} className="text-xs text-gray-600">
            <span className="text-gray-400">{humanize(k)}:</span>{' '}
            <span className="font-medium text-gray-800">
              {fmtScalar(k, v as number | string | boolean)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function GenericResult({ result }: { result: Record<string, unknown> }) {
  if (result.error) {
    return (
      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-700">{String(result.error)}</p>
      </div>
    )
  }

  const prose: [string, string][] = []
  const scalars: [string, number | string][] = []
  const lists: [string, unknown[]][] = []

  for (const [key, val] of Object.entries(result)) {
    if (val === null || val === undefined || val === '') continue
    if (PROSE_KEYS.has(key) && typeof val === 'string') { prose.push([key, val]); continue }
    if (Array.isArray(val)) { if (val.length) lists.push([key, val]); continue }
    if (typeof val === 'string' || typeof val === 'number') scalars.push([key, val])
  }

  return (
    <div className="mt-3 space-y-3">
      {prose.map(([k, v]) => (
        <div key={k} className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{v}</p>
        </div>
      ))}

      {scalars.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {scalars.map(([k, v]) => (
            <div key={k} className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-center">
              <p className="text-sm font-bold text-gray-900">
                {fmtScalar(k, v)}
              </p>
              <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{humanize(k)}</p>
            </div>
          ))}
        </div>
      )}

      {lists.map(([k, arr]) => (
        <div key={k}>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{humanize(k)}</p>
          <div className="space-y-1.5">
            {(arr as unknown[]).map((item, i) =>
              item && typeof item === 'object' ? (
                <ObjectCard key={i} obj={item as Record<string, unknown>} />
              ) : (
                <p key={i} className="text-xs text-gray-600 flex gap-2">
                  <span>•</span><span>{String(item)}</span>
                </p>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AiInsightPanel({
  title, description, endpoint, body, disabled, disabledReason, cta = 'Analizar con IA',
}: AiInsightPanelProps) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | unknown[] | null>(null)
  const [expanded, setExpanded] = useState(true)

  const run = async () => {
    const payload = body ? body() : {}
    if (payload === null) return
    setRunning(true)
    try {
      const { data } = await api.post(endpoint, payload)
      setResult(data)
      setExpanded(true)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error || (err as { message?: string })?.message || 'Error al ejecutar el análisis'
      setResult({ error: msg })
      setExpanded(true)
    } finally {
      setRunning(false)
    }
  }

  // Normaliza: el renderer genérico espera un objeto; si la skill devuelve
  // un array lo envolvemos bajo una clave para que se pinte como lista.
  const normalized: Record<string, unknown> | null =
    result === null ? null : Array.isArray(result) ? { resultados: result } : result

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <Brain className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {normalized && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded transition"
              title={expanded ? 'Contraer' : 'Expandir'}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={run}
            disabled={running || disabled}
            title={disabled ? disabledReason : undefined}
            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {running ? (
              <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Analizando...</span>
            ) : normalized ? 'Repetir' : cta}
          </button>
        </div>
      </div>

      {disabled && disabledReason && (
        <p className="text-xs text-amber-600 mt-2">{disabledReason}</p>
      )}

      {expanded && normalized && <GenericResult result={normalized} />}
    </div>
  )
}
