'use client'

// COND-2 — Elegir una cláusula de la biblioteca e insertarla en el capítulo de
// condiciones. Si la cláusula lleva huecos {{etiqueta|valor}}, antes de
// insertarla pide esos valores: así no se queda el importe de la obra anterior.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Loader2, Search, FileText } from 'lucide-react'
import api from '@/lib/api'
import { useNotificationStore } from '@/stores/notificationStore'
import type { ConditionClause } from '@/types'

/** Un hueco del texto: {{etiqueta|valor por defecto}} */
export interface Hueco {
  etiqueta: string
  valor: string
}

const HUECO_RE = /\{\{([^|}]+)(?:\|([^}]*))?\}\}/g

/** Saca los huecos de un texto, sin repetir etiqueta (el mismo hueco se rellena una vez). */
export function extraerHuecos(texto: string): Hueco[] {
  const vistos = new Map<string, string>()
  for (const m of texto.matchAll(HUECO_RE)) {
    const etiqueta = m[1].trim()
    if (!vistos.has(etiqueta)) vistos.set(etiqueta, (m[2] ?? '').trim())
  }
  return [...vistos.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor }))
}

/** Sustituye los huecos por sus valores. Lo que se quede vacío se deja en blanco. */
export function rellenarHuecos(texto: string, valores: Record<string, string>): string {
  return texto.replace(HUECO_RE, (_m, etiqueta: string) => valores[etiqueta.trim()] ?? '')
}

const NOMBRE_BLOQUE: Record<string, string> = {
  general: 'Generales',
  economica: 'Condiciones económicas',
  exclusion: 'Exclusiones',
}

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Se llama con el HTML ya listo para meter en el editor. */
  onInsert: (html: string) => void
}

export default function ClausePickerDialog({ isOpen, onClose, onInsert }: Props) {
  const { addToast } = useNotificationStore()
  const [clauses, setClauses] = useState<ConditionClause[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [elegida, setElegida] = useState<ConditionClause | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<ConditionClause[]>('/condition-clauses')
      setClauses(data || [])
    } catch (e) {
      const r = e as { response?: { data?: { error?: string } }; message?: string }
      addToast('error', `No se pudieron cargar las cláusulas: ${r?.response?.data?.error || r?.message || 'error'}`)
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    if (!isOpen) return
    setElegida(null)
    setQuery('')
    cargar()
  }, [isOpen, cargar])

  const huecos = useMemo(() => (elegida ? extraerHuecos(elegida.body) : []), [elegida])

  useEffect(() => {
    // Al elegir cláusula, precargar los valores por defecto de sus huecos.
    if (!elegida) return
    const iniciales: Record<string, string> = {}
    for (const h of extraerHuecos(elegida.body)) iniciales[h.etiqueta] = h.valor
    setValores(iniciales)
  }, [elegida])

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clauses
    return clauses.filter((c) =>
      [c.title, c.body, c.tag].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
  }, [clauses, query])

  const porBloque = useMemo(() => {
    const grupos: Record<string, ConditionClause[]> = {}
    for (const c of visibles) (grupos[c.block] ||= []).push(c)
    return grupos
  }, [visibles])

  if (!isOpen) return null

  const insertar = () => {
    if (!elegida) return
    onInsert(rellenarHuecos(elegida.body, valores))
    onClose()
  }

  /** Vista previa con los valores puestos, en texto plano. */
  const vistaPrevia = elegida
    ? rellenarHuecos(elegida.body, valores).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : ''

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Añadir cláusula</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Textos que se repiten obra tras obra. Se insertan donde tengas el cursor.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por texto o por tipo de obra…"
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando cláusulas…
            </div>
          ) : visibles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText className="w-9 h-9 text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-700">
                {query ? 'Ninguna cláusula coincide' : 'Todavía no hay cláusulas'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Se gestionan en Panel de administración → Cláusulas.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(porBloque).map(([bloque, lista]) => (
                <div key={bloque}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {NOMBRE_BLOQUE[bloque] || bloque}
                  </p>
                  <div className="space-y-2">
                    {lista.map((c) => {
                      const sel = elegida?.id === c.id
                      return (
                        <button
                          key={c.id}
                          onClick={() => setElegida(c)}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition ${sel ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{c.title}</span>
                            {c.tag && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                {c.tag}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                            {c.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Huecos de la cláusula elegida */}
        {elegida && (
          <div className="px-6 py-3 border-t bg-gray-50 space-y-3">
            {huecos.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Rellena los datos de esta obra
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {huecos.map((h) => (
                    <div key={h.etiqueta}>
                      <label className="block text-xs text-gray-600 mb-1">{h.etiqueta}</label>
                      <input
                        type="text"
                        value={valores[h.etiqueta] ?? ''}
                        onChange={(e) => setValores((v) => ({ ...v, [h.etiqueta]: e.target.value }))}
                        className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">Esta cláusula no tiene datos que rellenar.</p>
            )}
            <p className="text-xs text-gray-600 bg-white border border-gray-200 rounded p-2">
              {vistaPrevia}
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm">
            Cancelar
          </button>
          <button
            onClick={insertar}
            disabled={!elegida}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm disabled:opacity-50"
          >
            Insertar cláusula
          </button>
        </div>
      </div>
    </div>
  )
}
