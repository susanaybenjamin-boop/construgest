'use client'

// COND-2 — Elegir una cláusula de la biblioteca e insertarla en el capítulo de
// condiciones. Si la cláusula lleva huecos {{etiqueta|valor}}, antes de
// insertarla pide esos valores: así no se queda el importe de la obra anterior.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Loader2, Search, FileText, Check } from 'lucide-react'
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

// Orden del documento: primero las generales, luego lo que NO entra, y al final
// las económicas (como en las condiciones de siempre). Se usa para pintar la
// lista Y para insertar, así se mete en el mismo orden en el que se ve.
const ORDEN_BLOQUE = ['general', 'exclusion', 'economica']
const pesoBloque = (b: string) => {
  const i = ORDEN_BLOQUE.indexOf(b)
  return i === -1 ? ORDEN_BLOQUE.length : i
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
  // Varias cláusulas a la vez: se guardan los ids elegidos y, para los huecos,
  // una clave por cláusula ("idDeLaClausula::etiqueta"). Dos cláusulas pueden
  // tener un hueco con el mismo nombre ("unidad") y querer decir cosas
  // distintas, así que NO se comparten.
  const [elegidas, setElegidas] = useState<string[]>([])
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
    setElegidas([])
    setValores({})
    setQuery('')
    cargar()
  }, [isOpen, cargar])

  /** Las elegidas, en el MISMO orden en que se ven en la lista. */
  const seleccionadas = useMemo(
    () => clauses
      .filter((c) => elegidas.includes(c.id))
      .sort((a, b) => pesoBloque(a.block) - pesoBloque(b.block) || a.sort_order - b.sort_order),
    [clauses, elegidas],
  )

  useEffect(() => {
    // Al marcar una cláusula se precargan los valores por defecto de SUS huecos,
    // sin tocar lo que ya hubiera escrito en las demás.
    setValores((previos) => {
      const siguiente = { ...previos }
      for (const c of clauses) {
        if (!elegidas.includes(c.id)) continue
        for (const h of extraerHuecos(c.body)) {
          const clave = `${c.id}::${h.etiqueta}`
          if (siguiente[clave] === undefined) siguiente[clave] = h.valor
        }
      }
      return siguiente
    })
  }, [elegidas, clauses])

  /** Valores de una cláusula concreta, con la etiqueta sin prefijo. */
  const valoresDe = useCallback((c: ConditionClause) => {
    const propios: Record<string, string> = {}
    for (const h of extraerHuecos(c.body)) propios[h.etiqueta] = valores[`${c.id}::${h.etiqueta}`] ?? h.valor
    return propios
  }, [valores])

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clauses
    return clauses.filter((c) =>
      [c.title, c.body, c.tag].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
  }, [clauses, query])

  const porBloque = useMemo(() => {
    const grupos: Record<string, ConditionClause[]> = {}
    for (const c of visibles) (grupos[c.block] ||= []).push(c)
    // Mismo orden que al insertar.
    return Object.fromEntries(
      Object.entries(grupos).sort(([a], [b]) => pesoBloque(a) - pesoBloque(b)),
    )
  }, [visibles])

  if (!isOpen) return null

  const insertar = () => {
    if (seleccionadas.length === 0) return
    // En el orden de la lista, que es el del documento.
    onInsert(seleccionadas.map((c) => rellenarHuecos(c.body, valoresDe(c))).join(''))
    onClose()
  }

  const aTextoPlano = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

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
                      const sel = elegidas.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          onClick={() => setElegidas((prev) =>
                            prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition flex items-start gap-2 ${sel ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${sel ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                            {sel && <Check className="w-3 h-3 text-white" />}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{c.title}</span>
                              {c.tag && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                  {c.tag}
                                </span>
                              )}
                            </span>
                            <span className="block text-xs text-gray-500 mt-0.5 line-clamp-2">
                              {aTextoPlano(c.body)}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Huecos y vista previa de cada cláusula elegida */}
        {seleccionadas.length > 0 && (
          <div className="px-6 py-3 border-t bg-gray-50 space-y-3 max-h-[30vh] overflow-y-auto">
            {seleccionadas.map((c) => {
              const huecos = extraerHuecos(c.body)
              return (
                <div key={c.id} className="space-y-2">
                  <p className="text-xs font-semibold text-gray-600">{c.title}</p>
                  {huecos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {huecos.map((h) => (
                        <div key={h.etiqueta}>
                          <label className="block text-[11px] text-gray-500 mb-0.5">{h.etiqueta}</label>
                          <input
                            type="text"
                            value={valores[`${c.id}::${h.etiqueta}`] ?? h.valor}
                            onChange={(e) => setValores((v) => ({ ...v, [`${c.id}::${h.etiqueta}`]: e.target.value }))}
                            className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-600 bg-white border border-gray-200 rounded p-2">
                    {aTextoPlano(rellenarHuecos(c.body, valoresDe(c)))}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <span className="text-sm text-gray-500">
            {seleccionadas.length === 0
              ? 'Marca las que quieras añadir'
              : `${seleccionadas.length} cláusula${seleccionadas.length === 1 ? '' : 's'} seleccionada${seleccionadas.length === 1 ? '' : 's'}`}
          </span>
          <div className="flex items-center gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm">
            Cancelar
          </button>
          <button
            onClick={insertar}
            disabled={seleccionadas.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm disabled:opacity-50"
          >
            {seleccionadas.length > 1
              ? `Insertar ${seleccionadas.length} cláusulas`
              : 'Insertar cláusula'}
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}
