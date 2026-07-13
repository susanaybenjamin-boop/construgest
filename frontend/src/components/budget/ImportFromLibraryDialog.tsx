'use client'

import { useEffect, useState, useMemo } from 'react'
import api from '@/lib/api'
import type { LibraryChapterWithPartidas, SavedPartida } from '@/types'
import {
  X, Loader2, Search, ChevronDown, ChevronRight,
  CheckSquare, Square, Library, FileDown, Layers
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Props {
  budgetId: string
  onClose: () => void
  onImported: () => void
}

export default function ImportFromLibraryDialog({ budgetId, onClose, onImported }: Props) {
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [chapters, setChapters] = useState<LibraryChapterWithPartidas[]>([])
  const [search, setSearch] = useState('')
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [selectedPartidas, setSelectedPartidas] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    loadLibrary()
  }, [])

  const loadLibrary = async () => {
    setLoading(true)
    try {
      const { data } = await api.get<{ chapters: LibraryChapterWithPartidas[]; orphans: SavedPartida[] }>('/library/partidas/grouped')
      // Only show chapters that have partidas
      const withPartidas = data.chapters.filter(ch => ch.partidas.length > 0)
      setChapters(withPartidas)
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
        p.code.toLowerCase().includes(q)
      ),
    })).filter(ch =>
      ch.partidas.length > 0 ||
      ch.chapter.name.toLowerCase().includes(q)
    )
  }, [chapters, search])

  // Selection helpers
  const getChapterPartidaIds = (chapterId: string) => {
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

  // Compute selections grouped by chapter
  const selections = useMemo(() => {
    return chapters
      .filter(ch => ch.partidas.some(p => selectedPartidas.has(p.id)))
      .map(ch => ({
        library_chapter_id: ch.chapter.id,
        chapter_name: ch.chapter.name,
        chapter_code: ch.chapter.code,
        partida_ids: ch.partidas.filter(p => selectedPartidas.has(p.id)).map(p => p.id),
      }))
  }, [chapters, selectedPartidas])

  const totalSelectedPartidas = selectedPartidas.size
  const totalSelectedChapters = selections.length

  // Select all
  const selectAll = () => {
    const allIds = chapters.flatMap(ch => ch.partidas.map(p => p.id))
    setSelectedPartidas(new Set(allIds))
  }

  const deselectAll = () => {
    setSelectedPartidas(new Set())
  }

  // Import
  const handleImport = async () => {
    if (selections.length === 0) return
    setImporting(true)
    setProgress(0)
    try {
      await api.post(`/budgets/${budgetId}/import-from-library`, { selections })
      setProgress(100)
      onImported()
    } catch {
      // Error
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <Library className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold">Importar desde Biblioteca</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : chapters.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <Layers className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 mb-1">No hay partidas en la biblioteca</p>
            <p className="text-sm text-gray-400">Guarda partidas desde un presupuesto importado por PDF</p>
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
                onClick={selectedPartidas.size === chapters.flatMap(c => c.partidas).length ? deselectAll : selectAll}
                className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap"
              >
                {selectedPartidas.size > 0 ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
            </div>

            {/* Chapters list */}
            <div className="flex-1 overflow-y-auto px-6 py-3">
              <div className="space-y-2">
                {filteredChapters.map(({ chapter, partidas }) => {
                  const isExpanded = expandedChapters.has(chapter.id)
                  const isFullySelected = isChapterFullySelected(chapter.id)
                  const isPartial = isChapterPartiallySelected(chapter.id)
                  const selectedCount = partidas.filter(p => selectedPartidas.has(p.id)).length
                  const chapterTotal = partidas.reduce((sum, p) => sum + Number(p.unit_price), 0)

                  return (
                    <div key={chapter.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Chapter row */}
                      <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition">
                        <button
                          onClick={() => toggleChapterSelection(chapter.id)}
                          className="p-0.5 shrink-0"
                        >
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
                        <button
                          onClick={() => toggleExpand(chapter.id)}
                          className="shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                        <span className="text-xs font-mono font-bold text-purple-600 shrink-0">{chapter.code}</span>
                        <span
                          className="text-sm font-medium text-gray-900 flex-1 cursor-pointer"
                          onClick={() => toggleExpand(chapter.id)}
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
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl shrink-0">
              <div className="text-sm text-gray-500">
                {totalSelectedPartidas > 0 ? (
                  <span>
                    <span className="font-medium text-gray-900">{totalSelectedChapters}</span> capítulo{totalSelectedChapters !== 1 ? 's' : ''},{' '}
                    <span className="font-medium text-gray-900">{totalSelectedPartidas}</span> partida{totalSelectedPartidas !== 1 ? 's' : ''}
                  </span>
                ) : (
                  'Selecciona capítulos o partidas para importar'
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
                  onClick={handleImport}
                  disabled={totalSelectedPartidas === 0 || importing}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition shadow-sm disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <FileDown className="w-4 h-4" />
                      Importar seleccionados
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Import progress overlay */}
        {importing && (
          <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center rounded-2xl">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
            <p className="text-sm font-medium text-gray-900">Importando partidas al presupuesto...</p>
            <p className="text-xs text-gray-400 mt-1">
              {totalSelectedChapters} capítulo{totalSelectedChapters !== 1 ? 's' : ''} con{' '}
              {totalSelectedPartidas} partida{totalSelectedPartidas !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
