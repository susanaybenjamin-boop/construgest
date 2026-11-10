'use client'

// COND-3 — Elegir una partida del presupuesto para referenciarla en el texto de
// condiciones. No se pega el texto: se inserta una referencia viva, así que si
// luego renumeras o renombras la partida, la condición se actualiza sola.

import { useMemo, useState } from 'react'
import { X, Search, Link2 } from 'lucide-react'
import type { ChapterWithItems } from '@/types'
import { partidaLabel } from '@/lib/partidaRefs'

interface Props {
  isOpen: boolean
  onClose: () => void
  chapters: ChapterWithItems[]
  onPick: (ref: { itemId: string; label: string }) => void
}

export default function PartidaRefDialog({ isOpen, onClose, chapters, onPick }: Props) {
  const [query, setQuery] = useState('')

  const capitulos = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (chapters || [])
      .filter((ch) => !ch.chapter.is_legal_text)
      .map((ch) => ({
        chapter: ch.chapter,
        items: (ch.items || []).filter((it) =>
          !q || `${it.code} ${it.name}`.toLowerCase().includes(q)),
      }))
      .filter((ch) => ch.items.length > 0)
  }, [chapters, query])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Referenciar una partida</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Queda enlazada: si renumeras o cambias el nombre, el texto se actualiza solo.
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
              placeholder="Buscar por código o concepto…"
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {capitulos.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              {query ? 'Ninguna partida coincide con la búsqueda.' : 'Este presupuesto todavía no tiene partidas.'}
            </p>
          ) : (
            <div className="space-y-4">
              {capitulos.map(({ chapter, items }) => (
                <div key={chapter.id}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    {chapter.code} · {chapter.name}
                  </p>
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                    {items.map((it) => (
                      <button
                        key={it.id}
                        onClick={() => {
                          onPick({ itemId: it.id, label: partidaLabel(it.code, it.name) })
                          onClose()
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 transition flex items-center gap-2"
                      >
                        <Link2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        <span className="text-xs font-medium text-gray-500 w-16 flex-shrink-0">{it.code}</span>
                        <span className="text-sm text-gray-800 truncate">{it.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
