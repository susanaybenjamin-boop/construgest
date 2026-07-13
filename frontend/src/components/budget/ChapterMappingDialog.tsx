'use client'

import { useState, useEffect } from 'react'
import { BookmarkPlus, X, Loader2, ArrowRight, FolderOpen, ChevronDown, FolderPlus } from 'lucide-react'
import api from '@/lib/api'

interface BudgetChapter {
  code: string
  name: string
  itemCount: number
}

interface LibraryChapter {
  id: string
  code: string
  name: string
  partida_count: number
}

interface Props {
  isOpen: boolean
  onClose: () => void
  budgetChapters: BudgetChapter[]
  onConfirm: (mapping: Record<string, string>) => void
  onConfirmAutoCreate?: () => void
  loading?: boolean
}

// Simple name similarity check
function similarity(a: string, b: string): number {
  const la = a.toLowerCase().trim()
  const lb = b.toLowerCase().trim()
  if (la === lb) return 1
  if (la.includes(lb) || lb.includes(la)) return 0.8
  // Word overlap
  const wordsA = la.split(/\s+/)
  const wordsB = lb.split(/\s+/)
  const common = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb)))
  return common.length / Math.max(wordsA.length, wordsB.length)
}

export default function ChapterMappingDialog({
  isOpen,
  onClose,
  budgetChapters,
  onConfirm,
  onConfirmAutoCreate,
  loading = false,
}: Props) {
  const [libraryChapters, setLibraryChapters] = useState<LibraryChapter[]>([])
  const [loadingChapters, setLoadingChapters] = useState(false)
  const [mapping, setMapping] = useState<Record<string, string>>({}) // budget code → library chapter id
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  // Fetch library chapters and auto-match
  useEffect(() => {
    if (!isOpen) return
    setLoadingChapters(true)
    setMapping({})
    setOpenDropdown(null)
    api.get('/library/chapters')
      .then(({ data }: { data: LibraryChapter[] }) => {
        setLibraryChapters(data)
        // Auto-match by name similarity
        const autoMap: Record<string, string> = {}
        for (const bch of budgetChapters) {
          let bestMatch: LibraryChapter | null = null
          let bestScore = 0
          for (const lch of data) {
            const score = similarity(bch.name, lch.name)
            if (score > bestScore && score >= 0.5) {
              bestScore = score
              bestMatch = lch
            }
          }
          if (bestMatch) {
            autoMap[bch.code] = bestMatch.id
          }
        }
        setMapping(autoMap)
      })
      .catch(() => setLibraryChapters([]))
      .finally(() => setLoadingChapters(false))
  }, [isOpen, budgetChapters])

  if (!isOpen) return null

  const libraryEmpty = !loadingChapters && libraryChapters.length === 0
  const allMapped = budgetChapters.every(ch => mapping[ch.code])
  const mappedCount = budgetChapters.filter(ch => mapping[ch.code]).length
  const totalItems = budgetChapters.reduce((s, ch) => s + ch.itemCount, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-purple-50 border-b border-purple-200 shrink-0">
          <div className="p-2 bg-purple-100 rounded-lg">
            <BookmarkPlus className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">Guardar en Biblioteca</h3>
            <p className="text-sm text-gray-500">
              {libraryEmpty
                ? 'Importa los capítulos de este presupuesto como estructura inicial'
                : 'Asigna cada capítulo del presupuesto a un capítulo de la biblioteca'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loadingChapters ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando capítulos...
            </div>
          ) : libraryEmpty ? (
            /* Empty library — show auto-create UI */
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <FolderPlus className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Tu biblioteca está vacía</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Se crearán automáticamente {budgetChapters.length} capítulos con {totalItems} partidas
                    a partir de este presupuesto. Podrás modificarlos después desde la biblioteca.
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {budgetChapters.map((bch) => (
                  <div key={bch.code} className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg">
                    <span className="text-xs font-mono font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">{bch.code}</span>
                    <span className="text-sm text-gray-800 truncate flex-1">{bch.name}</span>
                    <span className="text-xs text-gray-400">({bch.itemCount} partidas)</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Normal mapping UI */
            <div className="space-y-2">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_32px_1fr] gap-2 text-xs font-medium text-gray-400 uppercase tracking-wider px-1 pb-1">
                <span>Capítulo del presupuesto</span>
                <span></span>
                <span>Capítulo de la biblioteca</span>
              </div>

              {budgetChapters.map((bch) => {
                const selectedLib = libraryChapters.find(l => l.id === mapping[bch.code])
                const isDropdownOpen = openDropdown === bch.code

                return (
                  <div key={bch.code} className="grid grid-cols-[1fr_32px_1fr] gap-2 items-center">
                    {/* Budget chapter */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-xs font-mono font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">{bch.code}</span>
                      <span className="text-sm text-gray-800 truncate flex-1">{bch.name}</span>
                      <span className="text-xs text-gray-400">({bch.itemCount})</span>
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="w-4 h-4 text-gray-400 mx-auto" />

                    {/* Library chapter selector */}
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdown(isDropdownOpen ? null : bch.code)}
                        className={`w-full flex items-center gap-2 px-3 py-2 border rounded-lg text-left transition ${
                          selectedLib
                            ? 'bg-purple-50 border-purple-300 hover:bg-purple-100'
                            : 'bg-white border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {selectedLib ? (
                          <>
                            <FolderOpen className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                            <span className="text-xs font-mono font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded shrink-0">{selectedLib.code}</span>
                            <span className="text-sm text-gray-800 truncate flex-1">{selectedLib.name}</span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-400 flex-1">Seleccionar capítulo...</span>
                        )}
                        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition ${isDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {isDropdownOpen && (
                        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto py-1">
                          {libraryChapters.map((lch) => (
                            <button
                              key={lch.id}
                              onClick={() => {
                                setMapping(prev => ({ ...prev, [bch.code]: lch.id }))
                                setOpenDropdown(null)
                              }}
                              className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-purple-50 transition ${
                                mapping[bch.code] === lch.id ? 'bg-purple-100' : ''
                              }`}
                            >
                              <span className="text-xs font-mono font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded shrink-0">{lch.code}</span>
                              <span className="text-gray-800 truncate flex-1">{lch.name}</span>
                              <span className="text-xs text-gray-400 shrink-0">({lch.partida_count})</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 shrink-0">
          {!libraryEmpty && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">
                {mappedCount} de {budgetChapters.length} capítulos asignados
              </span>
              {!allMapped && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                  Capítulos sin asignar se omitirán
                </span>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition text-sm"
            >
              Cancelar
            </button>
            {libraryEmpty ? (
              <button
                onClick={() => onConfirmAutoCreate?.()}
                disabled={loading || budgetChapters.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg
                  hover:bg-purple-700 disabled:bg-gray-300 disabled:text-gray-500 transition text-sm font-medium"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FolderPlus className="w-4 h-4" />
                )}
                Importar como nuevos capítulos ({budgetChapters.length})
              </button>
            ) : (
              <button
                onClick={() => onConfirm(mapping)}
                disabled={mappedCount === 0 || loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg
                  hover:bg-purple-700 disabled:bg-gray-300 disabled:text-gray-500 transition text-sm font-medium"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <BookmarkPlus className="w-4 h-4" />
                )}
                Guardar {mappedCount > 0 ? `(${mappedCount} capítulos)` : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
