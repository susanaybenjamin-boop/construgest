'use client'

// COND-1 — Biblioteca de cláusulas de condiciones.
//
// Los textos que se repiten obra tras obra (validez, forma de pago,
// exclusiones…). Desde el capítulo de condiciones de cualquier presupuesto se
// insertan de un clic.
//
// El texto puede llevar HUECOS con la forma {{etiqueta|valor}}: al insertar la
// cláusula, la app pide esos datos.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Search, Loader2, FileText, Archive, RotateCcw, X, Save } from 'lucide-react'
import api from '@/lib/api'
import { useNotificationStore } from '@/stores/notificationStore'
import type { ConditionClause } from '@/types'
import { extraerHuecos } from '@/components/budget/ClausePickerDialog'

const BLOQUES = [
  { value: 'general', label: 'Generales' },
  { value: 'economica', label: 'Condiciones económicas' },
  { value: 'exclusion', label: 'Exclusiones' },
]

/** HTML → texto para editar cómodo (un párrafo por línea). */
const htmlATexto = (html: string) =>
  html.replace(/<\/p>\s*<p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()

/** Texto → HTML (cada línea, un párrafo). */
const textoAHtml = (texto: string) =>
  texto.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    .map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('')

export default function ClausesPage() {
  const { addToast } = useNotificationStore()
  const [clauses, setClauses] = useState<ConditionClause[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [verBajas, setVerBajas] = useState(false)
  const [editando, setEditando] = useState<ConditionClause | null>(null)
  const [creando, setCreando] = useState(false)

  const err = (e: unknown) => {
    const r = e as { response?: { data?: { error?: string } }; message?: string }
    return r?.response?.data?.error || r?.message || 'error desconocido'
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<ConditionClause[]>(`/condition-clauses${verBajas ? '?all=true' : ''}`)
      setClauses(data || [])
    } catch (e) {
      addToast('error', `No se pudieron cargar las cláusulas: ${err(e)}`)
    } finally {
      setLoading(false)
    }
  }, [addToast, verBajas])

  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clauses
    return clauses.filter((c) => [c.title, c.body, c.tag].filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)))
  }, [clauses, query])

  const darDeBaja = async (c: ConditionClause) => {
    try {
      await api.delete(`/condition-clauses/${c.id}`)
      addToast('success', 'Cláusula dada de baja')
      cargar()
    } catch (e) { addToast('error', `No se pudo dar de baja: ${err(e)}`) }
  }

  const reactivar = async (c: ConditionClause) => {
    try {
      await api.put(`/condition-clauses/${c.id}`, { is_active: true })
      cargar()
    } catch (e) { addToast('error', `No se pudo reactivar: ${err(e)}`) }
  }

  return (
    <div>
      <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cláusulas de condiciones</h1>
            <p className="text-sm text-gray-500 mt-1">
              Se insertan de un clic en el capítulo de condiciones de cualquier presupuesto
            </p>
          </div>
          <button
            onClick={() => { setEditando(null); setCreando(true) }}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition shadow-sm font-medium text-sm"
          >
            <Plus className="w-4 h-4" /> Nueva cláusula
          </button>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por texto o tipo de obra…"
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)}
              className="rounded border-gray-300" />
            Ver dadas de baja
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
        </div>
      ) : visibles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col items-center py-16">
          <FileText className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-700">
            {query ? 'Ninguna cláusula coincide' : 'Todavía no hay cláusulas'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {BLOQUES.map((b) => {
            const lista = visibles.filter((c) => c.block === b.value)
            if (lista.length === 0) return null
            return (
              <div key={b.value}>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{b.label}</h2>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                  {lista.map((c) => {
                    const huecos = extraerHuecos(c.body)
                    return (
                      <div key={c.id} className={`px-4 py-3 ${c.is_active ? '' : 'opacity-60'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{c.title}</span>
                              {c.tag && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{c.tag}</span>
                              )}
                              {!c.is_active && <span className="text-[10px] text-gray-400">dada de baja</span>}
                            </div>
                            <p className="text-xs text-gray-600 mt-1">{htmlATexto(c.body)}</p>
                            {huecos.length > 0 && (
                              <p className="text-[11px] text-blue-600 mt-1">
                                Pide al insertar: {huecos.map((h) => h.etiqueta).join(', ')}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => { setCreando(false); setEditando(c) }}
                              className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-lg transition flex items-center gap-1.5 text-xs font-medium"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Editar
                            </button>
                            {c.is_active ? (
                              <button onClick={() => darDeBaja(c)}
                                className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-300 text-gray-600 rounded-lg transition flex items-center gap-1.5 text-xs font-medium">
                                <Archive className="w-3.5 h-3.5" /> Baja
                              </button>
                            ) : (
                              <button onClick={() => reactivar(c)}
                                className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-300 text-gray-600 rounded-lg transition flex items-center gap-1.5 text-xs font-medium">
                                <RotateCcw className="w-3.5 h-3.5" /> Reactivar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(creando || editando) && (
        <ClauseForm
          clause={editando}
          onClose={() => { setCreando(false); setEditando(null) }}
          onSaved={() => { setCreando(false); setEditando(null); cargar() }}
        />
      )}
    </div>
  )
}

// ─── Alta / edición ─────────────────────────────────────────────────────────
function ClauseForm({
  clause, onClose, onSaved,
}: { clause: ConditionClause | null; onClose: () => void; onSaved: () => void }) {
  const { addToast } = useNotificationStore()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: clause?.title || '',
    block: clause?.block || 'general',
    tag: clause?.tag || '',
    texto: clause ? htmlATexto(clause.body) : '',
  })

  const huecos = extraerHuecos(form.texto)

  const guardar = async () => {
    if (!form.title.trim()) { addToast('error', 'Pon un título a la cláusula'); return }
    if (!form.texto.trim()) { addToast('error', 'La cláusula no puede estar vacía'); return }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(), block: form.block,
        tag: form.tag.trim() || null, body: textoAHtml(form.texto),
      }
      if (clause) await api.put(`/condition-clauses/${clause.id}`, payload)
      else await api.post('/condition-clauses', payload)
      addToast('success', clause ? 'Cláusula actualizada' : 'Cláusula creada')
      onSaved()
    } catch (e) {
      const r = e as { response?: { data?: { error?: string } }; message?: string }
      addToast('error', `No se pudo guardar: ${r?.response?.data?.error || r?.message || 'error'}`)
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {clause ? 'Editar cláusula' : 'Nueva cláusula'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
              <input type="text" value={form.title} className={inputClass} autoFocus
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Validez de la oferta" />
              <p className="text-xs text-gray-400 mt-1">Solo para encontrarla; no sale en el presupuesto.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bloque</label>
              <select value={form.block} className={inputClass}
                onChange={(e) => setForm({ ...form, block: e.target.value as ConditionClause['block'] })}>
                {BLOQUES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de obra</label>
            <input type="text" value={form.tag} className={inputClass}
              onChange={(e) => setForm({ ...form, tag: e.target.value })}
              placeholder="estructura de hormigón, reforma… (opcional)" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Texto *</label>
            <textarea value={form.texto} rows={7} className={`${inputClass} resize-none`}
              onChange={(e) => setForm({ ...form, texto: e.target.value })}
              placeholder={'Una línea por párrafo.\nPara los datos que cambian en cada obra, usa huecos:\nvalidez de {{días|30}} días'} />
            <p className="text-xs text-gray-400 mt-1">
              Un hueco se escribe <code className="bg-gray-100 px-1 rounded">{'{{etiqueta|valor por defecto}}'}</code>;
              al insertar la cláusula te pedirá ese dato.
            </p>
            {huecos.length > 0 && (
              <p className="text-xs text-blue-600 mt-1">
                Huecos detectados: {huecos.map((h) => `${h.etiqueta} (${h.valor || 'sin valor'})`).join(' · ')}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm">
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
