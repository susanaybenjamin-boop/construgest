'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import {
  X, ArrowRightLeft, TrendingUp, TrendingDown, Minus,
  Maximize2, Minimize2, RefreshCw, Link2, Unlink, EyeOff, Eye,
  Wand2, ChevronDown, ChevronRight, Move, ExternalLink, Brain, Loader2,
} from 'lucide-react'
import api from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { useBudgetStore } from '@/stores/budgetStore'
import type {
  Budget, FullBudget, BudgetItem, Chapter,
  ComparisonGroup, ComparisonSuggestion,
} from '@/types'
import ComparisonMatchPicker from './ComparisonMatchPicker'

interface Props {
  isOpen: boolean
  onClose: () => void
  budgets: Budget[]
  projectId: string
  /** Rendered as a full-window page in a detached popup window (no drag, no backdrop concerns). */
  standalone?: boolean
  /** Initial A/B selection (used when rendered inside a popup window). */
  initialBudgetAId?: string
  initialBudgetBId?: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

function DiffBadge({ diff, pct }: { diff: number; pct: number }) {
  if (Math.abs(diff) < 0.01) {
    return <span className="text-xs text-gray-400 flex items-center gap-0.5"><Minus className="w-3 h-3" /> Igual</span>
  }
  const isUp = diff > 0
  return (
    <span className={`text-xs font-medium flex items-center gap-0.5 ${isUp ? 'text-red-600' : 'text-green-600'}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{formatCurrency(diff)} ({isUp ? '+' : ''}{pct.toFixed(1)}%)
    </span>
  )
}

// ─── Row types for unified table ───────────────────────────────────────────────
type ItemsBySide = { A: BudgetItem[]; B: BudgetItem[] }
type RowKind = 'match' | 'only-a' | 'only-b' | 'excluded'

interface UnifiedRow {
  key: string
  kind: RowKind
  groupId?: string
  itemsA: BudgetItem[]
  itemsB: BudgetItem[]
  chapterA?: Chapter
  chapterB?: Chapter
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function indexItems(full: FullBudget | null) {
  const byId = new Map<string, { item: BudgetItem; chapter: Chapter }>()
  if (!full) return byId
  for (const ch of full.chapters) {
    if (ch.chapter.is_legal_text) continue
    if (ch.chapter.is_active === false) continue
    for (const it of ch.items) {
      if (it.is_active === false) continue
      byId.set(it.id, { item: it, chapter: ch.chapter })
    }
  }
  return byId
}

function itemsImportTotal(items: BudgetItem[]) {
  return items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
}

export default function BudgetComparisonModal({
  isOpen, onClose, budgets, projectId,
  standalone = false, initialBudgetAId, initialBudgetBId,
}: Props) {
  // Budget selection
  const [budgetAId, setBudgetAId] = useState(initialBudgetAId || '')
  const [budgetBId, setBudgetBId] = useState(initialBudgetBId || '')

  // Loaded budgets
  const [fullA, setFullA] = useState<FullBudget | null>(null)
  const [fullB, setFullB] = useState<FullBudget | null>(null)
  const [loading, setLoading] = useState(false)

  // Comparison state
  const [groups, setGroups] = useState<ComparisonGroup[]>([])
  const [exclusions, setExclusions] = useState<Set<string>>(new Set())
  const [suggestions, setSuggestions] = useState<ComparisonSuggestion[]>([])

  // Picker state
  const [picker, setPicker] = useState<{
    sourceItem: BudgetItem
    sourceSide: 'A' | 'B'
    groupId?: string
    anchor: DOMRect | null
  } | null>(null)

  // UI state
  const [maximized, setMaximized] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'excluded'>('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Resumen IA (local): prosa que redacta el LLM sobre el diff determinista.
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  // Movable + resizable
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState({ width: 1200, height: 720 })
  const draggingRef = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const resizingRef = useRef(false)
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })

  // Live sync with active budget from store
  const activeBudget = useBudgetStore(s => s.activeBudget)

  // ─── Initial selection ────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && budgets.length >= 2) {
      setBudgetAId(prev => prev || initialBudgetAId || budgets[1]?.id || '')
      setBudgetBId(prev => prev || initialBudgetBId || budgets[0]?.id || '')
    }
  }, [isOpen, budgets, initialBudgetAId, initialBudgetBId])

  // ─── Load budgets and comparison state ────────────────────────────
  const reloadAll = useCallback(async () => {
    if (!budgetAId || !budgetBId || budgetAId === budgetBId) return
    setLoading(true)
    try {
      const [resA, resB, resCmp] = await Promise.all([
        api.get<FullBudget>(`/budgets/${budgetAId}/full`),
        api.get<FullBudget>(`/budgets/${budgetBId}/full`),
        api.get(`/budgets/comparison/${budgetAId}/${budgetBId}`),
      ])
      setFullA(resA.data)
      setFullB(resB.data)
      setGroups(resCmp.data.groups || [])
      setExclusions(new Set(resCmp.data.exclusions || []))
      setSuggestions(resCmp.data.suggestions || [])
    } finally {
      setLoading(false)
    }
  }, [budgetAId, budgetBId])

  useEffect(() => {
    if (isOpen) reloadAll()
  }, [isOpen, reloadAll])

  // Helper: refresh suggestions/groups/exclusions
  const refreshCmpState = useCallback(() => {
    if (!budgetAId || !budgetBId) return
    api.get(`/budgets/comparison/${budgetAId}/${budgetBId}`)
      .then(res => {
        setGroups(res.data.groups || [])
        setExclusions(new Set(res.data.exclusions || []))
        setSuggestions(res.data.suggestions || [])
      })
      .catch(() => { /* ignore */ })
  }, [budgetAId, budgetBId])

  // ─── Live sync (same window): when user edits activeBudget (A or B)
  useEffect(() => {
    if (!isOpen) return
    if (!activeBudget) return
    const bid = activeBudget.budget.id
    if (bid === budgetAId) setFullA(activeBudget)
    else if (bid === budgetBId) setFullB(activeBudget)
    else return
    refreshCmpState()
  }, [activeBudget, budgetAId, budgetBId, isOpen, refreshCmpState])

  // ─── Cross-window sync: listen for budget updates from other windows
  useEffect(() => {
    if (!isOpen || !budgetAId || !budgetBId) return
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return
    const ch = new BroadcastChannel('budget-sync')
    ch.onmessage = (e) => {
      if (e.data?.type !== 'full-budget') return
      const fb = e.data.budget as FullBudget
      if (!fb?.budget?.id) return
      if (fb.budget.id === budgetAId) setFullA(fb)
      else if (fb.budget.id === budgetBId) setFullB(fb)
      else return
      refreshCmpState()
    }
    return () => ch.close()
  }, [isOpen, budgetAId, budgetBId, refreshCmpState])

  // ─── Dragging the modal by the header ────────────────────────────
  const handleDragMouseDown = useCallback((e: React.MouseEvent) => {
    if (maximized) return
    e.preventDefault()
    draggingRef.current = true
    dragStart.current = {
      x: e.clientX, y: e.clientY,
      ox: pos?.x ?? (window.innerWidth - size.width) / 2,
      oy: pos?.y ?? (window.innerHeight - size.height) / 2,
    }

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return
      const dx = ev.clientX - dragStart.current.x
      const dy = ev.clientY - dragStart.current.y
      setPos({
        x: Math.max(-size.width + 120, Math.min(window.innerWidth - 120, dragStart.current.ox + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 60, dragStart.current.oy + dy)),
      })
    }
    const onUp = () => {
      draggingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [maximized, pos, size])

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (maximized) return
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = true
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height }
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      const dw = ev.clientX - resizeStart.current.x
      const dh = ev.clientY - resizeStart.current.y
      setSize({
        width: Math.max(700, Math.min(window.innerWidth - 20, resizeStart.current.w + dw)),
        height: Math.max(400, Math.min(window.innerHeight - 20, resizeStart.current.h + dh)),
      })
    }
    const onUp = () => {
      resizingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [maximized, size])

  // ─── Derived: item index and unified rows ─────────────────────────
  const indexA = useMemo(() => indexItems(fullA), [fullA])
  const indexB = useMemo(() => indexItems(fullB), [fullB])

  const linkedItemIds = useMemo(() => {
    const s = new Set<string>()
    for (const g of groups) for (const it of g.items) s.add(it.item_id)
    return s
  }, [groups])

  const rows = useMemo<UnifiedRow[]>(() => {
    if (!fullA || !fullB) return []
    const rowsByChapter = new Map<string, UnifiedRow[]>() // chapter A id → rows
    const orphanRowsB: UnifiedRow[] = []
    const excludedRows: UnifiedRow[] = []

    // 1. Groups (matched rows)
    for (const g of groups) {
      const itemsA = g.items
        .filter(i => i.side === 'A')
        .map(i => indexA.get(i.item_id)?.item)
        .filter(Boolean) as BudgetItem[]
      const itemsB = g.items
        .filter(i => i.side === 'B')
        .map(i => indexB.get(i.item_id)?.item)
        .filter(Boolean) as BudgetItem[]
      const chapterA = itemsA.length > 0 ? indexA.get(itemsA[0].id)?.chapter : undefined
      const chapterB = itemsB.length > 0 ? indexB.get(itemsB[0].id)?.chapter : undefined

      const row: UnifiedRow = {
        key: `g-${g.id}`,
        kind: 'match',
        groupId: g.id,
        itemsA,
        itemsB,
        chapterA,
        chapterB,
      }
      const chKey = chapterA?.id || (chapterB ? `__B:${chapterB.id}` : '__unknown')
      const arr = rowsByChapter.get(chKey) || []
      arr.push(row)
      rowsByChapter.set(chKey, arr)
    }

    // 2. Only-A rows
    for (const ch of fullA.chapters) {
      if (ch.chapter.is_legal_text) continue
      if (ch.chapter.is_active === false) continue
      for (const it of ch.items) {
        if (it.is_active === false) continue
        if (linkedItemIds.has(it.id)) continue
        if (exclusions.has(it.id)) {
          excludedRows.push({
            key: `ex-${it.id}`, kind: 'excluded',
            itemsA: [it], itemsB: [], chapterA: ch.chapter,
          })
          continue
        }
        const row: UnifiedRow = {
          key: `a-${it.id}`, kind: 'only-a',
          itemsA: [it], itemsB: [], chapterA: ch.chapter,
        }
        const arr = rowsByChapter.get(ch.chapter.id) || []
        arr.push(row)
        rowsByChapter.set(ch.chapter.id, arr)
      }
    }

    // 3. Only-B rows (grouped per their own chapter, appended at end)
    const bByChapter = new Map<string, { chapter: Chapter; rows: UnifiedRow[] }>()
    for (const ch of fullB.chapters) {
      if (ch.chapter.is_legal_text) continue
      if (ch.chapter.is_active === false) continue
      for (const it of ch.items) {
        if (it.is_active === false) continue
        if (linkedItemIds.has(it.id)) continue
        if (exclusions.has(it.id)) {
          excludedRows.push({
            key: `ex-${it.id}`, kind: 'excluded',
            itemsA: [], itemsB: [it], chapterB: ch.chapter,
          })
          continue
        }
        const row: UnifiedRow = {
          key: `b-${it.id}`, kind: 'only-b',
          itemsA: [], itemsB: [it], chapterB: ch.chapter,
        }
        if (!bByChapter.has(ch.chapter.id)) bByChapter.set(ch.chapter.id, { chapter: ch.chapter, rows: [] })
        bByChapter.get(ch.chapter.id)!.rows.push(row)
      }
    }

    // Flatten in A-chapter order, then only-B chapters, then excluded
    const flat: UnifiedRow[] = []
    for (const ch of fullA.chapters) {
      if (ch.chapter.is_legal_text) continue
      if (ch.chapter.is_active === false) continue
      const list = rowsByChapter.get(ch.chapter.id) || []
      flat.push(...list)
    }
    for (const [, { rows: list }] of bByChapter) {
      flat.push(...list)
    }
    // match rows without chapterA (only came via only-B chapter) already handled in rowsByChapter with __B: key
    for (const [k, list] of rowsByChapter) {
      if (k.startsWith('__B:')) flat.push(...list)
    }
    flat.push(...excludedRows)
    return flat
  }, [fullA, fullB, groups, exclusions, indexA, indexB, linkedItemIds])

  // Filter rows per tab
  const visibleRows = useMemo(() => {
    if (filter === 'unmatched') return rows.filter(r => r.kind === 'only-a' || r.kind === 'only-b')
    if (filter === 'excluded') return rows.filter(r => r.kind === 'excluded')
    return rows.filter(r => r.kind !== 'excluded')
  }, [rows, filter])

  // Group rows for display by chapterA (or chapterB if A missing)
  const grouped = useMemo(() => {
    const byChap = new Map<string, { title: string; rows: UnifiedRow[]; onlyB?: boolean }>()
    for (const r of visibleRows) {
      let key: string
      let title: string
      let onlyB = false
      if (r.chapterA) {
        key = `A-${r.chapterA.id}`
        title = `${r.chapterA.code}  ${r.chapterA.name}`
      } else if (r.chapterB) {
        key = `B-${r.chapterB.id}`
        title = `Solo en B · ${r.chapterB.code}  ${r.chapterB.name}`
        onlyB = true
      } else {
        key = '__unknown'
        title = 'Sin capítulo'
      }
      if (!byChap.has(key)) byChap.set(key, { title, rows: [], onlyB })
      byChap.get(key)!.rows.push(r)
    }
    return [...byChap.values()]
  }, [visibleRows])

  // ─── Totals ─────────────────────────────────────────────────────
  const totals = useMemo(() => {
    if (!fullA || !fullB) return null
    let totalA = 0, totalB = 0
    let matchA = 0, matchB = 0
    let onlyA = 0, onlyB = 0

    for (const r of rows) {
      if (r.kind === 'excluded') continue
      const a = itemsImportTotal(r.itemsA)
      const b = itemsImportTotal(r.itemsB)
      totalA += a
      totalB += b
      if (r.kind === 'match') { matchA += a; matchB += b }
      if (r.kind === 'only-a') onlyA += a
      if (r.kind === 'only-b') onlyB += b
    }

    const taxA = fullA.budget.tax_rate || 0
    const taxB = fullB.budget.tax_rate || 0

    return {
      totalA, totalB,
      ivaA: totalA * taxA / 100,
      ivaB: totalB * taxB / 100,
      grandTotalA: totalA * (1 + taxA / 100),
      grandTotalB: totalB * (1 + taxB / 100),
      diff: totalB - totalA,
      pct: totalA !== 0 ? ((totalB - totalA) / totalA) * 100 : 0,
      matchDiff: matchB - matchA,
      onlyA, onlyB,
    }
  }, [rows, fullA, fullB])

  // ─── Actions ─────────────────────────────────────────────────────
  const openPicker = (item: BudgetItem, side: 'A' | 'B', groupId: string | undefined, anchorEl: HTMLElement | null) => {
    setPicker({
      sourceItem: item,
      sourceSide: side,
      groupId,
      anchor: anchorEl?.getBoundingClientRect() ?? null,
    })
  }

  const handleConfirmPairing = async (itemIds: string[]) => {
    if (!picker) return
    const otherSide: 'A' | 'B' = picker.sourceSide === 'A' ? 'B' : 'A'
    try {
      if (picker.groupId) {
        // Add to existing group
        await api.patch(`/budgets/comparison/groups/${picker.groupId}`, {
          add: itemIds.map(item_id => ({ item_id, side: otherSide })),
        })
      } else {
        // Create new group: source item + selected items
        await api.post(`/budgets/comparison/${budgetAId}/${budgetBId}/groups`, {
          items: [
            { item_id: picker.sourceItem.id, side: picker.sourceSide },
            ...itemIds.map(item_id => ({ item_id, side: otherSide })),
          ],
        })
      }
      setPicker(null)
      await reloadAll()
    } catch (err: any) {
      alert('Error al emparejar: ' + (err?.response?.data?.error || err.message))
    }
  }

  const handleUnlink = async (groupId: string) => {
    if (!confirm('¿Deshacer este emparejamiento?')) return
    await api.delete(`/budgets/comparison/groups/${groupId}`)
    await reloadAll()
  }

  const handleExclude = async (itemId: string) => {
    await api.post(`/budgets/comparison/${budgetAId}/${budgetBId}/exclusions`, { item_id: itemId })
    await reloadAll()
  }

  const handleUnexclude = async (itemId: string) => {
    await api.delete(`/budgets/comparison/${budgetAId}/${budgetBId}/exclusions/${itemId}`)
    await reloadAll()
  }

  const handleAutoMatch = async () => {
    const strong = suggestions.filter(s => s.score >= 0.85).length
    if (strong === 0) {
      alert('No hay sugerencias fuertes (score ≥ 85%) para emparejar automáticamente')
      return
    }
    if (!confirm(`¿Auto-emparejar ${strong} sugerencia(s) con score ≥ 85%?`)) return
    await api.post(`/budgets/comparison/${budgetAId}/${budgetBId}/auto-match`, { threshold: 0.85 })
    await reloadAll()
  }

  // Construye el payload de un presupuesto con el shape que espera el backend
  // (mismo que analyze-budget: budget + chapters[{code,name,items[...]}]).
  const toBudgetPayload = (full: FullBudget) => ({
    budget: full.budget,
    chapters: full.chapters
      .filter((ch) => !ch.chapter.is_legal_text && ch.chapter.is_active !== false)
      .map((ch) => ({
        code: ch.chapter.code,
        name: ch.chapter.name,
        items: ch.items
          .filter((it) => it.is_active !== false)
          .map((it) => ({
            code: it.code, name: it.name, unit: it.unit,
            quantity: it.quantity, unit_price: it.unit_price,
          })),
      })),
  })

  const handleAiSummary = async () => {
    if (!fullA || !fullB) return
    setAiLoading(true)
    setAiSummary(null)
    try {
      const { data } = await api.post('/ai/compare-budgets', {
        budget_a: toBudgetPayload(fullA),
        budget_b: toBudgetPayload(fullB),
        label_a: fullA.budget.name,
        label_b: fullB.budget.name,
      })
      setAiSummary(data?.assessment || 'Sin resumen disponible.')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error || (err as { message?: string })?.message || 'Error al generar el resumen'
      setAiSummary(msg)
    } finally {
      setAiLoading(false)
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (!isOpen) return null

  const nameA = fullA?.budget.name || 'A'
  const nameB = fullB?.budget.name || 'B'

  const defaultX = (typeof window !== 'undefined' ? window.innerWidth - size.width : 0) / 2
  const defaultY = (typeof window !== 'undefined' ? window.innerHeight - size.height : 0) / 2
  const modalStyle: React.CSSProperties = standalone
    ? { position: 'fixed', inset: 0, width: '100vw', height: '100vh', borderRadius: 0 }
    : maximized
    ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', borderRadius: 0 }
    : {
        position: 'fixed',
        top: (pos?.y ?? defaultY),
        left: (pos?.x ?? defaultX),
        width: size.width,
        height: size.height,
      }

  const openInNewWindow = () => {
    if (!budgetAId || !budgetBId) return
    const url = `/budget-comparison?project=${encodeURIComponent(projectId)}&a=${encodeURIComponent(budgetAId)}&b=${encodeURIComponent(budgetBId)}`
    const features = 'popup=yes,width=1300,height=800,menubar=no,toolbar=no,location=no,status=no'
    const w = window.open(url, `cmp-${budgetAId}-${budgetBId}`, features)
    if (w) {
      w.focus()
      onClose()
    }
  }

  const strongCount = suggestions.filter(s => s.score >= 0.85).length

  return (
    <>
      {/* No backdrop: user can click through to edit budget behind */}
      <div
        style={modalStyle}
        className="bg-white shadow-2xl flex flex-col z-50 rounded-xl overflow-hidden border border-gray-200"
      >
        {/* Header — draggable (disabled in standalone popup window) */}
        <div
          onMouseDown={standalone ? undefined : handleDragMouseDown}
          className={`flex items-center justify-between px-4 py-2 border-b bg-gradient-to-r from-amber-50 to-blue-50 flex-shrink-0 select-none ${
            !standalone && !maximized ? 'cursor-move' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            {!standalone && !maximized && <Move className="w-3.5 h-3.5 text-gray-400" />}
            <ArrowRightLeft className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-gray-800">Comparativa de Presupuestos</h2>
            {standalone && (
              <span className="ml-1 text-[10px] font-medium px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                Ventana independiente · sync en vivo
              </span>
            )}
          </div>
          <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
            <button onClick={() => reloadAll()} className="p-1.5 hover:bg-white/60 rounded" title="Actualizar">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {!standalone && (
              <button
                onClick={openInNewWindow}
                className="p-1.5 hover:bg-white/60 rounded"
                title="Abrir en ventana independiente (para doble pantalla)"
              >
                <ExternalLink className="w-4 h-4 text-gray-500" />
              </button>
            )}
            {!standalone && (
              <button onClick={() => setMaximized(!maximized)} className="p-1.5 hover:bg-white/60 rounded">
                {maximized ? <Minimize2 className="w-4 h-4 text-gray-500" /> : <Maximize2 className="w-4 h-4 text-gray-500" />}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-white/60 rounded" title={standalone ? 'Cerrar ventana' : 'Cerrar'}>
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Selectors + actions bar */}
        <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-3 flex-wrap flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <select
              value={budgetAId}
              onChange={(e) => setBudgetAId(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none max-w-[200px]"
            >
              {budgets.map(b => (
                <option key={b.id} value={b.id} disabled={b.id === budgetBId}>{b.name}</option>
              ))}
            </select>
          </div>
          <span className="text-gray-400 text-xs">vs</span>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <select
              value={budgetBId}
              onChange={(e) => setBudgetBId(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none max-w-[200px]"
            >
              {budgets.map(b => (
                <option key={b.id} value={b.id} disabled={b.id === budgetAId}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="flex-1" />

          {strongCount > 0 && (
            <button
              onClick={handleAutoMatch}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Auto-emparejar {strongCount} sugerencia(s) fuertes
            </button>
          )}

          <button
            onClick={handleAiSummary}
            disabled={aiLoading || !fullA || !fullB}
            title="Resumen del análisis con IA local"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            Resumen IA
          </button>

          <div className="flex bg-white border border-gray-300 rounded overflow-hidden text-xs">
            {(['all', 'unmatched', 'excluded'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 ${filter === f ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {f === 'all' ? 'Todo' : f === 'unmatched' ? 'Sin emparejar' : 'Excluidas'}
              </button>
            ))}
          </div>
        </div>

        {/* Banner de resumen IA (prosa del LLM local) */}
        {aiSummary && (
          <div className="px-4 py-2 border-b bg-indigo-50/60 flex items-start gap-2 flex-shrink-0">
            <Brain className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-700 flex-1">{aiSummary}</p>
            <button onClick={() => setAiSummary(null)} className="p-0.5 hover:bg-indigo-100 rounded" title="Ocultar">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        )}

        {/* Summary */}
        {totals && (
          <div className="grid grid-cols-5 gap-2 px-4 py-2 border-b flex-shrink-0 bg-white">
            <div className="bg-blue-50 rounded p-2 border border-blue-100">
              <div className="flex items-center gap-1 mb-0.5">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <p className="text-[10px] font-medium text-blue-600 truncate">{nameA}</p>
              </div>
              <p className="text-base font-bold text-blue-800">{formatCurrency(totals.totalA)}</p>
              <p className="text-[10px] text-blue-500">IVA {fullA?.budget.tax_rate}%: {formatCurrency(totals.grandTotalA)}</p>
            </div>
            <div className="bg-amber-50 rounded p-2 border border-amber-100">
              <div className="flex items-center gap-1 mb-0.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <p className="text-[10px] font-medium text-amber-600 truncate">{nameB}</p>
              </div>
              <p className="text-base font-bold text-amber-800">{formatCurrency(totals.totalB)}</p>
              <p className="text-[10px] text-amber-500">IVA {fullB?.budget.tax_rate}%: {formatCurrency(totals.grandTotalB)}</p>
            </div>
            <div className="bg-gray-50 rounded p-2 border border-gray-200">
              <p className="text-[10px] font-medium text-gray-500 mb-0.5">Diferencia PEM</p>
              <DiffBadge diff={totals.diff} pct={totals.pct} />
              <p className="text-[10px] text-gray-400 mt-0.5">Matches: {formatCurrency(totals.matchDiff)}</p>
            </div>
            <div className="bg-blue-50/40 rounded p-2 border border-blue-100">
              <p className="text-[10px] font-medium text-blue-500 mb-0.5">Solo en {nameA}</p>
              <p className="text-sm font-semibold text-blue-700">{formatCurrency(totals.onlyA)}</p>
            </div>
            <div className="bg-amber-50/40 rounded p-2 border border-amber-100">
              <p className="text-[10px] font-medium text-amber-500 mb-0.5">Solo en {nameB}</p>
              <p className="text-sm font-semibold text-amber-700">{formatCurrency(totals.onlyB)}</p>
            </div>
          </div>
        )}

        {/* Unified table */}
        <div className="flex-1 overflow-auto">
          {!fullA || !fullB ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              {loading ? <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" /> : 'Selecciona dos presupuestos para comparar'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-100 z-10">
                <tr className="text-[10px] uppercase text-gray-500">
                  <th className="px-2 py-1.5 text-left font-medium w-[36%]">Partida A</th>
                  <th className="px-1 py-1.5 text-center font-medium w-[3%]">↔</th>
                  <th className="px-2 py-1.5 text-left font-medium w-[36%]">Partida B</th>
                  <th className="px-2 py-1.5 text-right font-medium w-[7%]">Δ Cant.</th>
                  <th className="px-2 py-1.5 text-right font-medium w-[7%]">Δ PU</th>
                  <th className="px-2 py-1.5 text-right font-medium w-[8%]">Δ Importe</th>
                  <th className="px-2 py-1.5 text-center font-medium w-[3%]"></th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(({ title, rows: chRows, onlyB }) => (
                  <Fragment key={title}>
                    <tr className={onlyB ? 'bg-amber-50' : 'bg-blue-50/50'}>
                      <td colSpan={7} className="px-2 py-1 text-xs font-semibold text-gray-700">
                        {title}
                        <span className="ml-2 text-[10px] text-gray-400 font-normal">{chRows.length} fila(s)</span>
                      </td>
                    </tr>
                    {chRows.map(r => (
                      <UnifiedRowView
                        key={r.key}
                        row={r}
                        expanded={r.groupId ? expandedGroups.has(r.groupId) : false}
                        onToggle={() => r.groupId && toggleExpand(r.groupId)}
                        onPickMatch={(item, side, groupId, target) => openPicker(item, side, groupId, target)}
                        onUnlink={handleUnlink}
                        onExclude={handleExclude}
                        onUnexclude={handleUnexclude}
                      />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Resize handle */}
        {!maximized && !standalone && (
          <div
            onMouseDown={handleResizeMouseDown}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            style={{ touchAction: 'none' }}
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 text-gray-300">
              <path d="M14 14L8 14L14 8Z" fill="currentColor" />
              <path d="M14 14L11 14L14 11Z" fill="currentColor" opacity="0.5" />
            </svg>
          </div>
        )}
      </div>

      {picker && fullA && fullB && (
        <ComparisonMatchPicker
          sourceItem={picker.sourceItem}
          sourceSide={picker.sourceSide}
          sourceName={picker.sourceSide === 'A' ? nameA : nameB}
          candidates={
            picker.sourceSide === 'A'
              ? [...indexB.values()].filter(c => !linkedItemIds.has(c.item.id) && !exclusions.has(c.item.id))
              : [...indexA.values()].filter(c => !linkedItemIds.has(c.item.id) && !exclusions.has(c.item.id))
          }
          suggestions={suggestions}
          onConfirm={handleConfirmPairing}
          onClose={() => setPicker(null)}
          anchorRect={picker.anchor}
        />
      )}
    </>
  )
}

// ─── Row view ──────────────────────────────────────────────────────────────────
interface RowProps {
  row: UnifiedRow
  expanded: boolean
  onToggle: () => void
  onPickMatch: (item: BudgetItem, side: 'A' | 'B', groupId: string | undefined, target: HTMLElement | null) => void
  onUnlink: (groupId: string) => void
  onExclude: (itemId: string) => void
  onUnexclude: (itemId: string) => void
}

function UnifiedRowView({ row, expanded, onToggle, onPickMatch, onUnlink, onExclude, onUnexclude }: RowProps) {
  const totalA = itemsImportTotal(row.itemsA)
  const totalB = itemsImportTotal(row.itemsB)
  const diff = totalB - totalA
  const qtyA = row.itemsA.reduce((s, i) => s + i.quantity, 0)
  const qtyB = row.itemsB.reduce((s, i) => s + i.quantity, 0)
  const diffQty = qtyB - qtyA
  const singleA = row.itemsA.length === 1
  const singleB = row.itemsB.length === 1
  const puA = singleA ? row.itemsA[0].unit_price : null
  const puB = singleB ? row.itemsB[0].unit_price : null
  const diffPU = puA !== null && puB !== null ? puB - puA : null
  const isMatch = row.kind === 'match'
  const isMulti = row.itemsA.length > 1 || row.itemsB.length > 1
  const rowClass = row.kind === 'excluded'
    ? 'text-gray-400 line-through'
    : row.kind === 'only-a'
    ? 'bg-blue-50/30'
    : row.kind === 'only-b'
    ? 'bg-amber-50/30'
    : ''

  const showExpandToggle = isMatch && isMulti

  return (
    <>
      <tr className={`border-t border-gray-100 hover:bg-gray-50 ${rowClass}`}>
        {/* Partida A */}
        <td className="px-2 py-1 align-top">
          {row.itemsA.length === 0 ? (
            <span className="text-gray-300 italic">—</span>
          ) : (
            <div className="flex items-start gap-1.5">
              {showExpandToggle && (
                <button onClick={onToggle} className="mt-0.5">
                  {expanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                </button>
              )}
              <div className="flex-1 min-w-0">
                {row.itemsA.length === 1 ? (
                  <div>
                    <span className="text-[10px] font-mono text-gray-400 mr-1">{row.itemsA[0].code}</span>
                    <span className="text-gray-700">{row.itemsA[0].name}</span>
                    <div className="text-[10px] text-gray-500">
                      {fmt(row.itemsA[0].quantity)} {row.itemsA[0].unit} × {fmt(row.itemsA[0].unit_price)} ={' '}
                      <span className="font-semibold text-blue-700">{formatCurrency(totalA)}</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="text-gray-700 font-medium">[Grupo] {row.itemsA.length} partidas</span>
                    <div className="text-[10px] text-gray-500">
                      Subtotal: <span className="font-semibold text-blue-700">{formatCurrency(totalA)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </td>

        {/* Link indicator */}
        <td className="px-1 py-1 text-center align-middle">
          {isMatch ? (
            <Link2 className="w-3.5 h-3.5 text-green-600 inline-block" />
          ) : row.kind === 'excluded' ? (
            <EyeOff className="w-3.5 h-3.5 text-gray-300 inline-block" />
          ) : null}
        </td>

        {/* Partida B */}
        <td className="px-2 py-1 align-top">
          {row.itemsB.length === 0 ? (
            <span className="text-gray-300 italic">—</span>
          ) : row.itemsB.length === 1 ? (
            <div>
              <span className="text-[10px] font-mono text-gray-400 mr-1">{row.itemsB[0].code}</span>
              <span className="text-gray-700">{row.itemsB[0].name}</span>
              <div className="text-[10px] text-gray-500">
                {fmt(row.itemsB[0].quantity)} {row.itemsB[0].unit} × {fmt(row.itemsB[0].unit_price)} ={' '}
                <span className="font-semibold text-amber-700">{formatCurrency(totalB)}</span>
              </div>
            </div>
          ) : (
            <div>
              <span className="text-gray-700 font-medium">[Grupo] {row.itemsB.length} partidas</span>
              <div className="text-[10px] text-gray-500">
                Subtotal: <span className="font-semibold text-amber-700">{formatCurrency(totalB)}</span>
              </div>
            </div>
          )}
        </td>

        {/* Δ Cant */}
        <td className="px-2 py-1 text-right align-top text-[11px] text-gray-600">
          {isMatch ? (diffQty === 0 ? '=' : (diffQty > 0 ? '+' : '') + fmt(diffQty)) : '—'}
        </td>
        {/* Δ PU */}
        <td className="px-2 py-1 text-right align-top text-[11px] text-gray-600">
          {diffPU !== null ? (diffPU === 0 ? '=' : (diffPU > 0 ? '+' : '') + fmt(diffPU)) : '—'}
        </td>
        {/* Δ Importe */}
        <td className={`px-2 py-1 text-right align-top text-[11px] font-semibold ${
          !isMatch ? 'text-gray-400'
          : diff > 0 ? 'text-red-600'
          : diff < 0 ? 'text-green-600'
          : 'text-gray-500'
        }`}>
          {isMatch ? (diff === 0 ? '0' : (diff > 0 ? '+' : '') + formatCurrency(diff)) : '—'}
        </td>

        {/* Actions */}
        <td className="px-1 py-1 align-middle">
          <RowActions
            row={row}
            onPickMatch={onPickMatch}
            onUnlink={onUnlink}
            onExclude={onExclude}
            onUnexclude={onUnexclude}
          />
        </td>
      </tr>

      {/* Sub-rows for multi-item groups */}
      {isMatch && isMulti && expanded && (
        <>
          {Array.from({ length: Math.max(row.itemsA.length, row.itemsB.length) }).map((_, i) => {
            const a = row.itemsA[i]
            const b = row.itemsB[i]
            return (
              <tr key={`sub-${row.key}-${i}`} className="bg-gray-50/50 text-[11px] text-gray-500">
                <td className="px-2 pl-6 py-0.5">
                  {a ? (
                    <>
                      <span className="font-mono text-gray-400 mr-1">{a.code}</span>
                      <span>{a.name}</span>
                      <span className="ml-1 text-gray-400">{fmt(a.quantity)} {a.unit} × {fmt(a.unit_price)}</span>
                    </>
                  ) : <span className="text-gray-300 italic">—</span>}
                </td>
                <td></td>
                <td className="px-2 py-0.5">
                  {b ? (
                    <>
                      <span className="font-mono text-gray-400 mr-1">{b.code}</span>
                      <span>{b.name}</span>
                      <span className="ml-1 text-gray-400">{fmt(b.quantity)} {b.unit} × {fmt(b.unit_price)}</span>
                    </>
                  ) : <span className="text-gray-300 italic">—</span>}
                </td>
                <td colSpan={4}></td>
              </tr>
            )
          })}
        </>
      )}
    </>
  )
}

function RowActions({ row, onPickMatch, onUnlink, onExclude, onUnexclude }: Pick<RowProps, 'row' | 'onPickMatch' | 'onUnlink' | 'onExclude' | 'onUnexclude'>) {
  if (row.kind === 'excluded') {
    const item = row.itemsA[0] || row.itemsB[0]
    return (
      <button
        onClick={() => item && onUnexclude(item.id)}
        className="p-1 hover:bg-gray-200 rounded"
        title="Reincluir"
      >
        <Eye className="w-3.5 h-3.5 text-gray-400" />
      </button>
    )
  }
  if (row.kind === 'match' && row.groupId) {
    return (
      <button
        onClick={() => onUnlink(row.groupId!)}
        className="p-1 hover:bg-red-50 rounded"
        title="Deshacer emparejamiento"
      >
        <Unlink className="w-3.5 h-3.5 text-red-500" />
      </button>
    )
  }
  const item = row.kind === 'only-a' ? row.itemsA[0] : row.itemsB[0]
  const side: 'A' | 'B' = row.kind === 'only-a' ? 'A' : 'B'
  return (
    <div className="flex gap-0.5">
      <button
        onClick={(e) => onPickMatch(item, side, undefined, e.currentTarget)}
        className="p-1 hover:bg-blue-50 rounded"
        title="Emparejar con…"
      >
        <Link2 className="w-3.5 h-3.5 text-blue-500" />
      </button>
      <button
        onClick={() => onExclude(item.id)}
        className="p-1 hover:bg-gray-100 rounded"
        title="Excluir"
      >
        <EyeOff className="w-3.5 h-3.5 text-gray-400" />
      </button>
    </div>
  )
}
