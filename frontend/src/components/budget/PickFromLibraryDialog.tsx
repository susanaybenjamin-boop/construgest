'use client'

import { useEffect, useState, useMemo } from 'react'
import api from '@/lib/api'
import type { LibraryChapterWithPartidas, SavedPartida } from '@/types'
import {
  X, Loader2, Search, ChevronDown, ChevronRight,
  CheckSquare, Square, Library, Plus, Layers
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Props {
  chapterId: string
  budgetId: string
  onClose: () => void
  onAdded: () => void
}

export default function PickFromLibraryDialog({ chapterId, onClose, onAdded }: Props) {
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [chapters, setChapters] = useState<LibraryChapterWithPartidas[]>([])
  const [orphans, setOrphans] = useState<SavedPartida[]>([])
  const [search, setSearch] = useState('')
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [selectedPartidas, setSelectedPartidas] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadLibrary()
  }, [])

  const loadLibrary = async () => {
    setLoading(true)
    try {
      const { data } = await api.get<{ chapters: LibraryChapterWithPartidas[]; orphans: SavedPartida[] }>('/library/partidas/grouped')
      const withPartidas = data.chapters.filter(ch => ch.partidas.length > 0)
      setChapters(withPartidas)
      setOrphans(data.orphans || [])
    } catch {
      // Error silently
    } finally {
      setLoading(false)
    }
  }

  // Filtered by search
  const filteredChapters = useMemo(() => {
    if (!search) return chapters
    const q = search.toLowerCase()
    return chapters.map(ch => ({
      chapter: ch.chapter,
      partidas: ch.partidas.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.tags && p.tags.toLowerCase().includes(q))
      ),
    })).filter(ch =>
      ch.partidas.length > 0 ||
      ch.chapter.name.toLowerCase().includes(q)
    )
  }, [chapters, search])

  const filteredOrphans = useMemo(() => {
    if (!search) return orphans
    const q = search.toLowerCase()
    return orphans.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.tags && p.tags.toLowerCase().includes(q))
    )
  }, [orphans, search])

  // All partidas for select-all
  const allPartidaIds = useMemo(() => {
    const ids = chapters.flatMap(ch => ch.partidas.map(p => p.id))
    return [...ids, ...orphans.map(p => p.id)]
  }, [chapters, orphans])

  // Selection helpers
  const getChapterPartidaIds = (chapterId: string) => {
    if (chapterId === '__orphans__') return orphans.map(p => p.id)
    const ch = chapters.find(c => c.chapter.id === chapterId)
    return ch ? ch.partidas.map(p => p.id) : []
  }

  const isChapterFullySelected = (chapterId: string) => {
    const ids = getChapterPartidaIds(chapterId)
    return ids.length > 0 && ids.every(id => selectedPartidas.has(id))
  }

  const isChapterPartiallySelected = (chapterId: string) => {
    const ids = getChapterPartidaIds(chapterId)
    return ids.some(id => selectedPartidas.has(id)) && !ids.every(id => selectedPartidas.has(id))
  }

  const toggleChapterSelection = (chapterId: string) => {
    const ids = getChapterPartidaIds(chapterId)
    setSelectedPartidas(prev => {
      const next = new Set(prev)
      if (isChapterFullySelected(chapterId)) {
        ids.forEach(id => next.delete(id))
      } else {
        ids.forEach(id => next.add(id))
      }
      return next
    })
  }

  const togglePartida = (id: string) => {
    setSelectedPartidas(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleExpand = (id: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedPartidas(new Set(allPartidaIds))
  const deselectAll = () => setSelectedPartidas(new Set())

  // Add to budget chapter
  const handleAdd = async () => {
    if (selectedPartidas.size === 0) return
    setAdding(true)
    try {
      await api.post(`/budgets/chapters/${chapterId}/items/from-library`, {
        partida_ids: Array.from(selectedPartidas),
      })
      onAdded()
    } catch {
      // Error handled by caller
    } finally {
      setAdding(false)
    }
  }

  const hasAnyPartidas = chapters.length > 0 || orphans.length > 0

  const renderChapterSection = (chapter: LibraryChapterWithPartidas['chapter'], partidas: SavedPartida[], sectionId: string) => {
    const isExpanded = expandedChapters.has(sectionId)
    const isFullySelected = isChapterFullySelected(sectionId)
    const isPartial = isChapterPartiallySelected(sectionId)
    const selectedCount = partidas.filter(p => selectedPartidas.has(p.id)).length
    const chapterTotal = partidas.reduce((sum, p) => sum + Number(p.unit_price), 0)

    return (
      <div key={sectionId} className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Chapter row */}
        <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition">
          <button onClick={() => toggleChapterSelection(sectionId)} className="p-0.5 shrink-0">
            {isFullySelected ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : isPartial ? (
              <div className="w-4 h-4 border-2 border-blue-600 rounded bg-blue-100 flex items-center justify-center">
                <div className="w-2 h-1 bg-blue-600 rounded-sm" />
              </div>
            ) : (
              <Square className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <button onClick={() => toggleExpand(sectionId)} className="shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {sectionId === '__orphans__' ? (
            <Layers className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <span className="text-xs font-mono font-bold text-purple-600 shrink-0">{chapter.code}</span>
          )}
          <span
            className="text-sm font-medium text-gray-900 flex-1 cursor-pointer"
            onClick={() => toggleExpand(sectionId)}
          >
            {chapter.name}
          </span>
          <span className="text-xs text-gray-400 shrink-0">
            {selectedCount > 0 && `${selectedCount}/`}{partidas.length} partida{partidas.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs font-medium text-gray-500 w-20 text-right shrink-0">
            {formatCurrency(chapterTotal)}
          </span>
        </div>
        {/* Expanded partidas */}
        {isExpanded && (
          <div className="border-t border-gray-100">
            {partidas.map(p => {
              const isSelected = selectedPartidas.has(p.id)
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 pl-12 border-b border-gray-50 hover:bg-blue-50/30 transition cursor-pointer ${
                    isSelected ? 'bg-blue-50/20' : ''
                  }`}
                  onClick={() => togglePartida(p.id)}
                >
                  <button className="p-0.5 shrink-0">
                    {isSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </button>
                  <span className="text-xs font-mono text-gray-400 w-14 shrink-0">{p.code}</span>
                  <span className="text-sm text-gray-700 flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-gray-400 w-8 text-center shrink-0">{p.unit}</span>
                  <span className="text-sm text-gray-700 w-20 text-right shrink-0">
                    {formatCurrency(Number(p.unit_price))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <Library className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold">Añadir desde Biblioteca</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : !hasAnyPartidas ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <Layers className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 mb-1">No hay partidas en la biblioteca</p>
            <p className="text-sm text-gray-400">Guarda partidas desde un presupuesto o créalas en la biblioteca</p>
          </div>
        ) : (
          <>
            {/* Search + Select all */}
            <div className="flex items-center gap-3 px-6 py-3 border-b shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar partidas..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                />
              </div>
              <button
                onClick={selectedPartidas.size === allPartidaIds.length ? deselectAll : selectAll}
                className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap"
              >
                {selectedPartidas.size > 0 ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
            </div>

            {/* Chapters list */}
            <div className="flex-1 overflow-y-auto px-6 py-3">
              <div className="space-y-2">
                {filteredChapters.map(({ chapter, partidas }) =>
                  renderChapterSection(chapter, partidas, chapter.id)
                )}
                {/* Orphans section */}
                {filteredOrphans.length > 0 && renderChapterSection(
                  { id: '__orphans__', name: 'Sin capítulo', code: '--', sort_order: 999, organization_id: '', created_at: '', updated_at: '' },
                  filteredOrphans,
                  '__orphans__'
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl shrink-0">
              <div className="text-sm text-gray-500">
                {selectedPartidas.size > 0 ? (
                  <span>
                    <span className="font-medium text-gray-900">{selectedPartidas.size}</span> partida{selectedPartidas.size !== 1 ? 's' : ''} seleccionada{selectedPartidas.size !== 1 ? 's' : ''}
                  </span>
                ) : (
                  'Selecciona partidas para añadir al capítulo'
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 active:bg-gray-300 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAdd}
                  disabled={selectedPartidas.size === 0 || adding}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition shadow-sm disabled:opacity-50"
                >
                  {adding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Añadiendo...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Añadir al capítulo
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Adding overlay */}
        {adding && (
          <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center rounded-2xl">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
            <p className="text-sm font-medium text-gray-900">Añadiendo partidas al presupuesto...</p>
            <p className="text-xs text-gray-400 mt-1">
              {selectedPartidas.size} partida{selectedPartidas.size !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
