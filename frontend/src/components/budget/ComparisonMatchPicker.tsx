'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, Check, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { BudgetItem, Chapter, ComparisonSuggestion } from '@/types'

interface CandidateItem {
  item: BudgetItem
  chapter: Chapter
}

interface Props {
  sourceItem: BudgetItem
  sourceSide: 'A' | 'B'
  sourceName: string
  candidates: CandidateItem[]
  suggestions: ComparisonSuggestion[]
  onConfirm: (itemIds: string[]) => void
  onClose: () => void
  anchorRect: DOMRect | null
}

const fmtNum = (n: number) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export default function ComparisonMatchPicker({
  sourceItem,
  sourceSide,
  sourceName,
  candidates,
  suggestions,
  onConfirm,
  onClose,
  anchorRect,
}: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Map suggestion scores for this source item
  const scoreMap = useMemo(() => {
    const m = new Map<string, { score: number; reason: string }>()
    for (const s of suggestions) {
      const theirId = sourceSide === 'A' ? s.item_b_id : s.item_a_id
      const myId = sourceSide === 'A' ? s.item_a_id : s.item_b_id
      if (myId === sourceItem.id) m.set(theirId, { score: s.score, reason: s.reason })
    }
    return m
  }, [suggestions, sourceItem.id, sourceSide])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = candidates.map(c => {
      const sc = scoreMap.get(c.item.id)
      return { ...c, score: sc?.score ?? 0, reason: sc?.reason ?? '' }
    })
    const matching = q
      ? list.filter(c =>
          (c.item.name || '').toLowerCase().includes(q) ||
          (c.item.code || '').toLowerCase().includes(q) ||
          (c.chapter.name || '').toLowerCase().includes(q)
        )
      : list
    return matching.sort((a, b) => b.score - a.score)
  }, [candidates, scoreMap, query])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const confirm = () => {
    if (selected.size === 0) return
    onConfirm([...selected])
  }

  // Pop-up position: try to anchor near source row, fall back to center
  const style: React.CSSProperties = anchorRect
    ? {
        position: 'fixed',
        top: Math.min(anchorRect.bottom + 6, window.innerHeight - 420),
        left: Math.max(12, Math.min(anchorRect.left, window.innerWidth - 520)),
        width: 500,
        maxHeight: 420,
      }
    : {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 500,
        maxHeight: 420,
      }

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        style={style}
        className="z-[61] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Emparejar "${sourceItem.name}" con…`}
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 120 }}>
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">Sin candidatos</div>
          ) : (
            filtered.map((c) => {
              const isSel = selected.has(c.item.id)
              const importe = c.item.quantity * c.item.unit_price
              const scorePct = Math.round(c.score * 100)
              const scoreColor =
                c.score >= 0.85 ? 'bg-green-100 text-green-700'
                : c.score >= 0.65 ? 'bg-amber-100 text-amber-700'
                : c.score > 0 ? 'bg-gray-100 text-gray-600'
                : 'bg-gray-50 text-gray-400'
              return (
                <button
                  key={c.item.id}
                  onClick={() => toggle(c.item.id)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-blue-50/50 flex items-center gap-2 ${
                    isSel ? 'bg-blue-50' : ''
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      isSel ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                    }`}
                  >
                    {isSel && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {c.score > 0 && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${scoreColor}`}>
                      {scorePct}%
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{c.item.code}</span>
                      <span className="text-sm text-gray-800 truncate">{c.item.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                      <span className="truncate">{c.chapter.name}</span>
                      <span className="flex-shrink-0">{fmtNum(c.item.quantity)} {c.item.unit}</span>
                      <span className="flex-shrink-0 font-medium text-gray-700">{formatCurrency(importe)}</span>
                    </div>
                    {c.reason && (
                      <div className="text-[10px] text-gray-400 mt-0.5 truncate">{c.reason}</div>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
        <div className="px-3 py-2 border-t bg-gray-50 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {selected.size > 0 ? `${selected.size} seleccionada(s)` : `${sourceName}`}
          </span>
          <button
            onClick={confirm}
            disabled={selected.size === 0}
            className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500"
          >
            Emparejar ({selected.size})
          </button>
        </div>
      </div>
    </>
  )
}
