'use client'

import { useEffect, useMemo, useState } from 'react'
import { Library, Truck, X, Loader2, Send, CheckSquare, Square } from 'lucide-react'
import api from '@/lib/api'
import { useNotificationStore } from '@/stores/notificationStore'
import type { BranchLink } from '@/types'

interface LibraryChapter {
  id: string
  code: string
  name: string
  partida_count?: number
}

interface SavedPartida {
  id: string
  code: string
  name: string
  unit_price?: number
  library_chapter_id?: string | null
}

interface Supplier {
  id: string
  name: string
  category?: string | null
  is_active?: boolean
}

type Tab = 'library' | 'suppliers'

interface Props {
  link: BranchLink
  onClose: () => void
}

export default function BranchShareModal({ link, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('library')

  // Library
  const [chapters, setChapters] = useState<LibraryChapter[]>([])
  const [partidas, setPartidas] = useState<SavedPartida[]>([])
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set())
  const [selectedPartidas, setSelectedPartidas] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')

  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { addToast } = useNotificationStore()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.get<LibraryChapter[]>('/library/chapters'),
      api.get<SavedPartida[]>('/library/partidas'),
      api.get<Supplier[]>('/suppliers?all=true'),
    ])
      .then(([chRes, paRes, suRes]) => {
        if (cancelled) return
        setChapters(chRes.data || [])
        setPartidas(paRes.data || [])
        setSuppliers(suRes.data || [])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filteredPartidas = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return partidas
    return partidas.filter(p =>
      p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)
    )
  }, [partidas, filter])

  const filteredSuppliers = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(s =>
      s.name?.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q)
    )
  }, [suppliers, filter])

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }

  const selectAllChapters = () => {
    setSelectedChapters(new Set(chapters.map(c => c.id)))
  }
  const clearChapterSelection = () => setSelectedChapters(new Set())

  // "Todos" selecciona TODA la biblioteca/proveedores ignorando el filtro de
  // búsqueda. "Visibles" sólo lo que está mostrándose tras el filtro. Ambas
  // ofrecidas porque a veces el usuario filtra para enviar un subconjunto y
  // otras veces quiere mandar todo de golpe.
  const selectAllPartidas = () => {
    setSelectedPartidas(new Set(partidas.map(p => p.id)))
  }
  const selectAllVisiblePartidas = () => {
    setSelectedPartidas(new Set(filteredPartidas.map(p => p.id)))
  }
  const clearPartidaSelection = () => setSelectedPartidas(new Set())

  const selectAllSuppliers = () => {
    setSelectedSuppliers(new Set(suppliers.map(s => s.id)))
  }
  const selectAllVisibleSuppliers = () => {
    setSelectedSuppliers(new Set(filteredSuppliers.map(s => s.id)))
  }
  const clearSupplierSelection = () => setSelectedSuppliers(new Set())

  // Atajo combinado: en "Biblioteca", marcar TODO (capítulos + partidas).
  const selectAllLibrary = () => {
    setSelectedChapters(new Set(chapters.map(c => c.id)))
    setSelectedPartidas(new Set(partidas.map(p => p.id)))
  }
  const clearLibrarySelection = () => {
    setSelectedChapters(new Set())
    setSelectedPartidas(new Set())
  }

  const handleSendLibrary = async () => {
    if (selectedChapters.size === 0 && selectedPartidas.size === 0) {
      addToast('error', 'Selecciona al menos un capítulo o partida')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post<{
        chapters_imported: number
        partidas_created: number
        partidas_updated: number
      }>(`/branches/${link.id}/share-library`, {
        chapter_ids: [...selectedChapters],
        partida_ids: [...selectedPartidas],
      })
      const { partidas_created, partidas_updated } = res.data
      addToast('success', `Enviado: ${partidas_created} nuevas, ${partidas_updated} actualizadas`)
      onClose()
    } catch (err: any) {
      addToast('error', err.response?.data?.error || 'Error al enviar la biblioteca')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendSuppliers = async () => {
    if (selectedSuppliers.size === 0) {
      addToast('error', 'Selecciona al menos un proveedor')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post<{
        created: number
        updated: number
        materials_created?: number
        materials_updated?: number
        supplier_materials_created?: number
        supplier_materials_updated?: number
      }>(
        `/branches/${link.id}/share-suppliers`,
        { supplier_ids: [...selectedSuppliers] }
      )
      const { created, updated, materials_created = 0, materials_updated = 0 } = res.data
      const matMsg = (materials_created || materials_updated)
        ? ` · ${materials_created} materiales nuevos, ${materials_updated} reutilizados`
        : ''
      addToast('success', `Proveedores: ${created} nuevos, ${updated} actualizados${matMsg}`)
      onClose()
    } catch (err: any) {
      addToast('error', err.response?.data?.error || 'Error al enviar proveedores')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Enviar a {link.partner_organization_name}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Las entradas con el mismo nombre se actualizarán en la sucursal
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 border-b border-gray-200 flex gap-2">
          <button
            onClick={() => { setTab('library'); setFilter('') }}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-t-lg ${
              tab === 'library' ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600 -mb-px' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Library className="w-4 h-4" />
            Biblioteca
          </button>
          <button
            onClick={() => { setTab('suppliers'); setFilter('') }}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-t-lg ${
              tab === 'suppliers' ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600 -mb-px' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Truck className="w-4 h-4" />
            Proveedores
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={tab === 'library' ? 'Buscar partida o código…' : 'Buscar proveedor o categoría…'}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : tab === 'library' ? (
            <div className="space-y-4">
              {/* Acciones globales de biblioteca */}
              <div className="flex items-center justify-between bg-purple-50/60 border border-purple-100 rounded-lg px-3 py-2">
                <span className="text-xs text-purple-900">
                  <strong>{selectedChapters.size}</strong> capítulos · <strong>{selectedPartidas.size}</strong> partidas sueltas seleccionadas
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllLibrary}
                    className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    Marcar TODO
                  </button>
                  <button
                    onClick={clearLibrarySelection}
                    className="text-xs px-2 py-1 bg-white border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
                  >
                    Limpiar todo
                  </button>
                </div>
              </div>

              {/* Capítulos */}
              {chapters.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs uppercase tracking-wide font-medium text-gray-500">
                      Capítulos ({selectedChapters.size}/{chapters.length})
                    </h3>
                    <div className="flex gap-1">
                      <button onClick={selectAllChapters} className="text-[11px] text-purple-600 hover:underline">
                        Todos
                      </button>
                      <span className="text-gray-300">·</span>
                      <button onClick={clearChapterSelection} className="text-[11px] text-gray-500 hover:underline">
                        Limpiar
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {chapters.map(ch => (
                      <button
                        key={ch.id}
                        onClick={() => toggle(selectedChapters, ch.id, setSelectedChapters)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition ${
                          selectedChapters.has(ch.id)
                            ? 'bg-purple-50 border-purple-300 text-purple-900'
                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {selectedChapters.has(ch.id) ? <CheckSquare className="w-4 h-4 text-purple-600 shrink-0" /> : <Square className="w-4 h-4 text-gray-400 shrink-0" />}
                        <span className="font-mono text-xs text-gray-500">{ch.code}</span>
                        <span className="truncate">{ch.name}</span>
                        {typeof ch.partida_count === 'number' && (
                          <span className="ml-auto text-[10px] text-gray-400">{ch.partida_count} part.</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    Al seleccionar un capítulo, se envían también todas sus partidas.
                  </p>
                </div>
              )}

              {/* Partidas sueltas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-wide font-medium text-gray-500">
                    Partidas sueltas ({selectedPartidas.size}/{partidas.length})
                  </h3>
                  <div className="flex gap-1">
                    <button onClick={selectAllPartidas} className="text-[11px] text-purple-600 hover:underline font-medium">
                      Todas
                    </button>
                    <span className="text-gray-300">·</span>
                    <button onClick={selectAllVisiblePartidas} className="text-[11px] text-purple-600 hover:underline">
                      Visibles
                    </button>
                    <span className="text-gray-300">·</span>
                    <button onClick={clearPartidaSelection} className="text-[11px] text-gray-500 hover:underline">
                      Limpiar
                    </button>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg max-h-[260px] overflow-auto divide-y divide-gray-100">
                  {filteredPartidas.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Sin resultados</p>
                  ) : filteredPartidas.map(p => (
                    <button
                      key={p.id}
                      onClick={() => toggle(selectedPartidas, p.id, setSelectedPartidas)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                        selectedPartidas.has(p.id) ? 'bg-purple-50' : ''
                      }`}
                    >
                      {selectedPartidas.has(p.id) ? <CheckSquare className="w-4 h-4 text-purple-600 shrink-0" /> : <Square className="w-4 h-4 text-gray-400 shrink-0" />}
                      <span className="font-mono text-xs text-gray-500">{p.code}</span>
                      <span className="truncate flex-1">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Acciones globales de proveedores */}
              <div className="flex items-center justify-between bg-purple-50/60 border border-purple-100 rounded-lg px-3 py-2">
                <span className="text-xs text-purple-900">
                  <strong>{selectedSuppliers.size}</strong> de <strong>{suppliers.length}</strong> proveedores seleccionados
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllSuppliers}
                    className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    Marcar TODOS
                  </button>
                  <button
                    onClick={clearSupplierSelection}
                    className="text-xs px-2 py-1 bg-white border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-wide font-medium text-gray-500">
                  Proveedores
                </h3>
                <div className="flex gap-1">
                  <button onClick={selectAllVisibleSuppliers} className="text-[11px] text-purple-600 hover:underline">
                    Seleccionar visibles
                  </button>
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg max-h-[400px] overflow-auto divide-y divide-gray-100">
                {filteredSuppliers.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Sin resultados</p>
                ) : filteredSuppliers.map(s => (
                  <button
                    key={s.id}
                    onClick={() => toggle(selectedSuppliers, s.id, setSelectedSuppliers)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                      selectedSuppliers.has(s.id) ? 'bg-purple-50' : ''
                    }`}
                  >
                    {selectedSuppliers.has(s.id) ? <CheckSquare className="w-4 h-4 text-purple-600 shrink-0" /> : <Square className="w-4 h-4 text-gray-400 shrink-0" />}
                    <span className="truncate flex-1">{s.name}</span>
                    {s.category && <span className="text-[10px] text-gray-400">{s.category}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl"
          >
            Cancelar
          </button>
          <button
            onClick={tab === 'library' ? handleSendLibrary : handleSendSuppliers}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar a sucursal
          </button>
        </div>
      </div>
    </div>
  )
}
