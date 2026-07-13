'use client'

import { useState, useEffect } from 'react'
import type { BudgetItem } from '@/types'
import { BookmarkPlus, X, Search, FolderOpen, Loader2 } from 'lucide-react'
import api from '@/lib/api'

interface LibraryChapter {
  id: string
  code: string
  name: string
  partida_count: number
}

interface Props {
  isOpen: boolean
  onClose: () => void
  currentItem: BudgetItem
  onConfirm: (chapterId: string, newCode: string) => void
  loading?: boolean
}

export default function ChapterSelectorDialog({
  isOpen,
  onClose,
  currentItem,
  onConfirm,
  loading = false,
}: Props) {
  const [chapters, setChapters] = useState<LibraryChapter[]>([])
  const [loadingChapters, setLoadingChapters] = useState(false)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  const [nextCode, setNextCode] = useState<string>('')
  const [loadingCode, setLoadingCode] = useState(false)
  const [search, setSearch] = useState('')

  // Fetch chapters when dialog opens
  useEffect(() => {
    if (!isOpen) return
    setLoadingChapters(true)
    setSelectedChapterId(null)
    setNextCode('')
    setSearch('')
    api.get('/library/chapters')
      .then(({ data }) => setChapters(data))
      .catch(() => setChapters([]))
      .finally(() => setLoadingChapters(false))
  }, [isOpen])

  // Fetch next code when chapter is selected
  useEffect(() => {
    if (!selectedChapterId) { setNextCode(''); return }
    setLoadingCode(true)
    api.get(`/library/chapters/${selectedChapterId}/next-code`)
      .then(({ data }) => setNextCode(data.next_code))
      .catch(() => setNextCode('??'))
      .finally(() => setLoadingCode(false))
  }, [selectedChapterId])

  if (!isOpen) return null

  const filtered = chapters.filter((ch) => {
    if (!search) return true
    const q = search.toLowerCase()
    return ch.code.includes(q) || ch.name.toLowerCase().includes(q)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-purple-50 border-b border-purple-200">
          <div className="p-2 bg-purple-100 rounded-lg">
            <BookmarkPlus className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Guardar en Biblioteca</h3>
            <p className="text-sm text-gray-500 truncate">Selecciona el capítulo para: {currentItem.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar capítulo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Chapter list */}
        <div className="px-5 pb-3">
          {loadingChapters ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando capítulos...
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {filtered.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => setSelectedChapterId(ch.id)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                    selectedChapterId === ch.id
                      ? 'bg-purple-100 border border-purple-300 ring-1 ring-purple-200'
                      : 'border border-transparent hover:bg-gray-50 hover:border-gray-200'
                  }`}
                >
                  <FolderOpen className={`w-4 h-4 shrink-0 ${
                    selectedChapterId === ch.id ? 'text-purple-600' : 'text-gray-400'
                  }`} />
                  <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                    selectedChapterId === ch.id
                      ? 'text-purple-700 bg-purple-200'
                      : 'text-purple-600 bg-purple-50'
                  }`}>
                    {ch.code}
                  </span>
                  <span className="text-sm text-gray-800 truncate flex-1">{ch.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">({ch.partida_count})</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">No se encontraron capítulos</p>
              )}
            </div>
          )}
        </div>

        {/* Selected info + actions */}
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200">
          {selectedChapterId && (
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500">Nuevo código:</span>
              {loadingCode ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
              ) : (
                <span className="font-mono font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                  {nextCode}
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
            <button
              onClick={() => {
                if (selectedChapterId && nextCode) onConfirm(selectedChapterId, nextCode)
              }}
              disabled={!selectedChapterId || !nextCode || loadingCode || loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg
                hover:bg-purple-700 disabled:bg-gray-300 disabled:text-gray-500 transition text-sm font-medium"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BookmarkPlus className="w-4 h-4" />
              )}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
