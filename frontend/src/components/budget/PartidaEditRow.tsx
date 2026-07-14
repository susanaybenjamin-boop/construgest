'use client'

import { useState, useRef, useEffect } from 'react'
import type { BudgetItem, Measurement } from '@/types'
import { useBudgetStore } from '@/stores/budgetStore'
import { useNotificationStore } from '@/stores/notificationStore'
import api from '@/lib/api'
import type { SavedPartida } from '@/types'
import { Trash2, Ruler, Copy, GripVertical, Layers, Bookmark, ChevronDown, ChevronRight, Plus, EyeOff, Eye, Infinity as InfinityIcon, CopyPlus, Link2, Sparkles } from 'lucide-react'
import { formatCurrency, parseLocaleNumber } from '@/lib/utils'

// Standard construction unit options
const UNIT_OPTIONS = [
  'ud', 'm', 'm²', 'm³', 'ml', 'km',
  'kg', 't', 'l',
  'h', 'día', 'mes',
  'pa', '%', 'gl',
  'cm', 'cm²', 'cm³',
  'mm',
]
import PriceBreakdownPanel from './PriceBreakdownPanel'
import DuplicatePartidaDialog from './DuplicatePartidaDialog'
import ChapterSelectorDialog from './ChapterSelectorDialog'

interface Props {
  item: BudgetItem
  dragHandleProps?: Record<string, any>
  isExpanded: boolean
  onToggleExpand: () => void
  isSelected: boolean
  onSelect: (e: React.MouseEvent) => void
}

const calcPartial = (m: { units: number; length: number; width: number; height: number }) => {
  // If all dimensions are 0, this is a spacer row → partial = 0
  if (!m.units && !m.length && !m.width && !m.height) return 0
  // If units is 0, partial is 0
  if (!m.units) return 0
  // Replace 0 with 1 for dimensions that aren't specified (standard measurement calc)
  const l = m.length || 1
  const w = m.width || 1
  const h = m.height || 1
  return m.units * l * w * h
}

// Shared props for all numeric text inputs (handles numpad comma + Enter→blur)
const numInputProps = {
  type: 'text' as const,
  inputMode: 'decimal' as const,
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.currentTarget as HTMLInputElement).blur()
      return
    }
    const allowed = ['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End', '-', '.', ',']
    if (!allowed.includes(e.key) && !/\d/.test(e.key)) {
      e.preventDefault()
    }
  },
}

// Sugerencia de partida guardada parecida (find-similar, IA local determinista).
interface SimilarPartida {
  saved_partida_id: string
  saved_code: string
  saved_name: string
  unit: string
  unit_price: number
  usage_count: number
  similarity_score: number
  reason: string
}

export default function PartidaEditRow({ item, dragHandleProps, isExpanded, onToggleExpand, isSelected, onSelect }: Props) {
  const { updateItem, deleteItem, duplicateItem, addMeasurement, updateMeasurement, deleteMeasurement, autoRenumberAll, activeItemId, setActiveItemId } = useBudgetStore()
  const { addToast } = useNotificationStore()
  const isActiveTarget = activeItemId === item.id
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [savingToLibrary, setSavingToLibrary] = useState(false)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [foundDuplicates, setFoundDuplicates] = useState<SavedPartida[]>([])
  const [chapterSelectorOpen, setChapterSelectorOpen] = useState(false)

  // find-similar: sugerencias de partidas guardadas parecidas al teclear el nombre.
  const [similar, setSimilar] = useState<SimilarPartida[]>([])
  const [showSimilar, setShowSimilar] = useState(false)
  const similarTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (similarTimer.current) clearTimeout(similarTimer.current) }, [])

  const fetchSimilar = (name: string) => {
    if (similarTimer.current) clearTimeout(similarTimer.current)
    const q = name.trim()
    if (q.length < 4) { setSimilar([]); setShowSimilar(false); return }
    similarTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.post<SimilarPartida[]>('/ai/find-similar', {
          partida: { name: q, unit: item.unit },
        })
        // No ofrecer la propia partida (mismo nombre exacto) como "sugerencia".
        const list = (data || []).filter((s) => s.saved_name.trim().toLowerCase() !== q.toLowerCase())
        setSimilar(list)
        setShowSimilar(list.length > 0)
      } catch {
        setSimilar([]); setShowSimilar(false)
      }
    }, 400)
  }

  const applySimilar = async (s: SimilarPartida) => {
    setShowSimilar(false)
    setSimilar([])
    await updateItem(item.id, { name: s.saved_name, unit: s.unit, unit_price: s.unit_price })
    addToast('success', `Partida reutilizada de la biblioteca (${s.saved_code})`)
  }

  // Controlled state for instant total recalculation
  const [localQty, setLocalQty] = useState(String(item.quantity))
  const [localPrice, setLocalPrice] = useState(String(item.unit_price))
  const [localCost, setLocalCost] = useState(String(item.cost_price ?? 0))

  // Sync from props when item changes externally (e.g., after API reload)
  const [prevItemId, setPrevItemId] = useState(item.id)
  const [prevQty, setPrevQty] = useState(item.quantity)
  const [prevPrice, setPrevPrice] = useState(item.unit_price)
  const [prevCost, setPrevCost] = useState(item.cost_price ?? 0)
  if (item.id !== prevItemId || item.quantity !== prevQty || item.unit_price !== prevPrice || (item.cost_price ?? 0) !== prevCost) {
    setPrevItemId(item.id)
    setPrevQty(item.quantity)
    setPrevPrice(item.unit_price)
    setPrevCost(item.cost_price ?? 0)
    setLocalQty(String(item.quantity))
    setLocalPrice(String(item.unit_price))
    setLocalCost(String(item.cost_price ?? 0))
  }

  const hasMeasurements = (item.measurements?.length || 0) > 0
  const measurements = item.measurements || []
  const measurementsTotal = measurements.reduce((sum, m) => sum + (m.partial || calcPartial(m)), 0)

  const partidaData = (overrides?: { code?: string; chapter_code?: string; library_chapter_id?: string }) => ({
    code: overrides?.code || item.code,
    name: item.name,
    description: item.description || '',
    unit: item.unit,
    unit_price: item.unit_price,
    cost_price: item.cost_price,
    chapter_code: overrides?.chapter_code || item.code.split('.')[0] || '',
    library_chapter_id: overrides?.library_chapter_id || undefined,
    source: 'from_budget' as const,
    tags: '',
  })

  // Step 1: Open chapter selector when user clicks save
  const handleSaveToLibrary = () => {
    setChapterSelectorOpen(true)
  }

  // Step 2: After chapter is selected, check for duplicates then save
  const handleChapterSelected = async (chapterId: string, newCode: string) => {
    setSavingToLibrary(true)
    const chapterCode = newCode.split('.')[0] || ''
    try {
      // Check duplicates by name
      const { data: duplicates } = await api.post('/library/partidas/check-duplicates', {
        name: item.name,
      })

      if (duplicates && duplicates.length > 0) {
        setFoundDuplicates(duplicates)
        setChapterSelectorOpen(false)
        setDuplicateDialogOpen(true)
        // Store chapter info for the duplicate action
        setPendingChapter({ chapterId, newCode, chapterCode })
        setSavingToLibrary(false)
        return
      }

      // No duplicates → save directly with selected chapter
      await api.post('/library/partidas', partidaData({
        code: newCode,
        chapter_code: chapterCode,
        library_chapter_id: chapterId,
      }))
      addToast('success', `Partida guardada como ${newCode}`)
      setChapterSelectorOpen(false)
    } catch {
      addToast('error', 'Error al guardar en biblioteca')
    } finally {
      setSavingToLibrary(false)
    }
  }

  // Pending chapter info for duplicate dialog flow
  const [pendingChapter, setPendingChapter] = useState<{
    chapterId: string; newCode: string; chapterCode: string
  } | null>(null)

  const handleDuplicateAction = async (action: 'update' | 'create_new' | 'skip', targetId?: string) => {
    setSavingToLibrary(true)
    const overrides = pendingChapter ? {
      code: pendingChapter.newCode,
      chapter_code: pendingChapter.chapterCode,
      library_chapter_id: pendingChapter.chapterId,
    } : undefined
    try {
      if (action === 'update' && targetId) {
        await api.put(`/library/partidas/${targetId}`, partidaData(overrides))
        addToast('success', 'Partida actualizada en biblioteca')
      } else if (action === 'create_new') {
        await api.post('/library/partidas', partidaData(overrides))
        addToast('success', `Partida guardada como ${overrides?.code || item.code}`)
      } else {
        addToast('info', 'Partida no guardada')
      }
    } catch {
      addToast('error', 'Error al procesar la partida')
    } finally {
      setSavingToLibrary(false)
      setDuplicateDialogOpen(false)
      setFoundDuplicates([])
      setPendingChapter(null)
    }
  }

  const handleBlur = (field: string, value: string) => {
    const numFields = ['quantity', 'unit_price', 'cost_price']
    const val = numFields.includes(field) ? parseLocaleNumber(value) : value
    updateItem(item.id, { [field]: val })
  }

  // ─── Measurement handlers ───────────────────────────────
  const handleMeasurementBlur = async (m: Measurement, field: string, rawValue: string) => {
    const numFields = ['units', 'length', 'width', 'height', 'partial']
    const value = numFields.includes(field) ? parseLocaleNumber(rawValue) : rawValue

    const updated = { ...m, [field]: value }

    if (['units', 'length', 'width', 'height'].includes(field)) {
      const newPartial = calcPartial(updated)
      await updateMeasurement(m.id, { [field]: value, partial: newPartial })
    } else {
      await updateMeasurement(m.id, { [field]: value })
    }
  }

  const handleAddMeasurement = async (spacer = false) => {
    await addMeasurement(item.id, {
      description: '',
      units: spacer ? 0 : 1,
      length: 0,
      width: 0,
      height: 0,
      partial: 0,
      sort_order: measurements.length + 1,
    })
  }

  // Calculate importe from local (instant) values for immediate feedback
  const liveQty = parseLocaleNumber(localQty)
  const livePrice = parseLocaleNumber(localPrice)
  const liveCost = parseLocaleNumber(localCost)
  const importe = liveQty * livePrice

  const isInactive = item.is_active === false
  const isAux = !!item.is_auxiliary

  // Métricas extra (solo visibles cuando hay datos relevantes o expandido)
  const marginAbs = livePrice - liveCost
  const marginPct = livePrice > 0 ? (marginAbs / livePrice) * 100 : 0
  const certifiedTotal = item.certified_total ?? 0
  const executedTotal = item.executed_total ?? 0
  const certifiedAmount = certifiedTotal * livePrice
  const certifiedPct = liveQty > 0 ? (certifiedTotal / liveQty) * 100 : 0
  const remaining = item.remaining ?? (isAux ? null : Math.max(0, liveQty - Math.max(executedTotal, certifiedTotal)))
  const hasActivity = certifiedTotal > 0 || executedTotal > 0 || liveCost > 0 || isAux

  // Duplicar con cantidad custom (p.ej. partida agotada que continúa)
  const handleDuplicateWithQuantity = async () => {
    if (typeof window === 'undefined') return
    const def = isAux ? '1' : (remaining && remaining > 0 ? String(remaining) : '1')
    const raw = window.prompt(
      `Duplicar "${item.name}"\n\n¿Qué cantidad de ${item.unit} quieres en la nueva partida?`,
      def
    )
    if (raw === null) return
    const qty = parseLocaleNumber(raw)
    if (!qty || qty <= 0) {
      addToast('warning', 'Cantidad no válida')
      return
    }
    await duplicateItem(item.id, { quantity: qty, code_suffix: '_cont' })
    await autoRenumberAll()
    addToast('success', `Partida duplicada con ${qty} ${item.unit}`)
  }

  const toggleAuxiliary = async () => {
    await updateItem(item.id, { is_auxiliary: !isAux })
    addToast(
      'success',
      !isAux
        ? 'Partida marcada como auxiliar (sin tope de cantidad)'
        : 'Partida ya no es auxiliar'
    )
  }

  const handleDelete = async () => {
    // Primer intento sin force: el backend dira si tiene dependencias
    const first = await deleteItem(item.id)
    if (first.success) {
      await autoRenumberAll()
      addToast('success', 'Partida eliminada')
      return
    }
    // Tiene datos vinculados: pedir confirmacion explicita
    const d = first.dependencies
    const bits: string[] = []
    if (d.measurements) bits.push(`${d.measurements} medici${d.measurements === 1 ? 'on' : 'ones'}`)
    if (d.breakdown) bits.push(`${d.breakdown} linea${d.breakdown === 1 ? '' : 's'} de desglose`)
    if (d.work_log_links) bits.push(`${d.work_log_links} ejecuci${d.work_log_links === 1 ? 'on' : 'ones'} en partes`)
    if (d.certifications) bits.push(`${d.certifications} certificaci${d.certifications === 1 ? 'on' : 'ones'}`)
    const detail = bits.join(', ')
    const confirmed = confirm(
      `Esta partida tiene datos vinculados (${detail}).\n\n` +
      `¿Eliminar igualmente? Se borrarán también esos registros y los totales se recalcularán.`
    )
    if (!confirmed) return
    const forced = await deleteItem(item.id, { force: true })
    if (forced.success) {
      await autoRenumberAll()
      addToast('success', 'Partida eliminada junto a sus datos vinculados')
    } else {
      addToast('error', 'No se pudo eliminar la partida')
    }
  }

  return (
    <>
      <div
        className={`border-b transition ${isActiveTarget ? 'ring-2 ring-indigo-400 ring-inset bg-indigo-50/60' : isSelected ? 'bg-blue-50/80 border-blue-200' : 'border-gray-50 hover:bg-gray-50/50'} ${isInactive ? 'opacity-50 line-through bg-gray-50/50' : ''}`}
      >
        {/* Main row */}
        <div className="grid grid-cols-[20px_24px_60px_1fr_60px_80px_90px_110px_180px] gap-1 px-3 py-2 items-center text-sm group">
          {/* Checkbox */}
          <div
            className="flex items-center justify-center cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onSelect(e) }}
            title={isSelected ? 'Deseleccionar (Shift+clic = rango)' : 'Seleccionar (Shift+clic = rango)'}
          >
            <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition ${
              isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 hover:border-blue-400'
            }`}>
              {isSelected && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>

          {/* Grip / Drag Handle */}
          <div
            className="text-gray-300 cursor-grab opacity-0 group-hover:opacity-100 transition"
            {...(dragHandleProps || {})}
          >
            <GripVertical className="w-4 h-4" />
          </div>

          {/* Code — key forces re-render when code changes via renumber */}
          <input
            key={item.code}
            className="px-1 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-xs text-gray-400 w-full"
            defaultValue={item.code}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
            onBlur={(e) => handleBlur('code', e.target.value)}
          />

          {/* Name + expand toggle — ALWAYS expandable */}
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
              className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 transition text-gray-400"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <input
                    key={`name-${item.id}-${item.name}`}
                    className="w-full px-1 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-gray-800 min-w-0"
                    defaultValue={item.name}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
                      if (e.key === 'Escape') setShowSimilar(false)
                    }}
                    onChange={(e) => fetchSimilar(e.target.value)}
                    onBlur={(e) => handleBlur('name', e.target.value)}
                  />
                  {/* Sugerencias de la biblioteca (find-similar, IA local) */}
                  {showSimilar && similar.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 top-full mt-0.5 bg-white border border-indigo-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-indigo-500 bg-indigo-50/70 flex items-center gap-1 sticky top-0">
                        <Sparkles className="w-3 h-3" /> Partidas guardadas parecidas
                      </div>
                      {similar.map((s) => (
                        <button
                          key={s.saved_partida_id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); applySimilar(s) }}
                          className="w-full text-left px-2 py-1.5 hover:bg-indigo-50 border-b border-gray-50 last:border-0 flex items-center gap-2"
                          title={`${s.reason} · usada ${s.usage_count} vez(ces)`}
                        >
                          <span className="flex-1 min-w-0">
                            <span className="block text-xs text-gray-800 truncate">{s.saved_name}</span>
                            <span className="block text-[10px] text-gray-400">
                              {s.saved_code} · {s.unit} · {formatCurrency(s.unit_price)}
                            </span>
                          </span>
                          <span className="flex-shrink-0 text-[10px] font-semibold text-indigo-600">{s.similarity_score}%</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {isAux && (
                  <span
                    className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold tracking-wide"
                    title="Partida auxiliar: sin tope de cantidad en certificaciones ni partes"
                  >
                    <InfinityIcon className="w-3 h-3" />
                    AUX
                  </span>
                )}
              </div>
              {/* Compact preview: truncated description if collapsed */}
              {!isExpanded && item.description && (
                <p className="text-[11px] text-gray-400 truncate px-1 leading-tight -mt-0.5">
                  {item.description}
                </p>
              )}
            </div>
            {/* Inline measurement count when collapsed */}
            {hasMeasurements && !isExpanded && (
              <span className="flex-shrink-0 text-blue-500 flex items-center gap-0.5" title={`${measurements.length} mediciones`}>
                <Ruler className="w-3.5 h-3.5" />
                <span className="text-[10px] font-medium">{measurements.length}</span>
              </span>
            )}
          </div>

          {/* Unit — select dropdown with standard construction units */}
          <select
            className="px-0.5 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-center text-gray-500 w-full bg-transparent cursor-pointer appearance-auto text-sm"
            defaultValue={item.unit}
            onChange={(e) => handleBlur('unit', e.target.value)}
          >
            <option value="">—</option>
            {/* If current unit is custom (not in list), show it first */}
            {item.unit && !UNIT_OPTIONS.includes(item.unit) && (
              <option value={item.unit}>{item.unit}</option>
            )}
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          {/* Quantity — locked when partida has mediciones (driven by sum of partials) */}
          <input
            {...numInputProps}
            className={`px-1 py-0.5 rounded border outline-none text-right w-full ${
              hasMeasurements
                ? 'border-transparent bg-blue-50/40 text-blue-700 cursor-not-allowed'
                : 'border-transparent hover:border-gray-300 focus:border-blue-500'
            }`}
            value={localQty}
            readOnly={hasMeasurements}
            title={hasMeasurements
              ? 'Cantidad calculada por las mediciones. Edita o elimina las mediciones para cambiarla.'
              : undefined}
            onChange={(e) => { if (!hasMeasurements) setLocalQty(e.target.value) }}
            onBlur={(e) => { if (!hasMeasurements) handleBlur('quantity', e.target.value) }}
            onFocus={(e) => e.target.select()}
          />

          {/* Unit Price — controlled for instant total */}
          <div className="relative flex items-center">
            <input
              {...numInputProps}
              className={`px-1 py-0.5 rounded border outline-none text-right w-full ${isActiveTarget ? 'border-indigo-400 bg-indigo-50/60 focus:border-indigo-500' : 'border-transparent hover:border-gray-300 focus:border-blue-500'}`}
              value={localPrice}
              onChange={(e) => setLocalPrice(e.target.value)}
              onBlur={(e) => handleBlur('unit_price', e.target.value)}
              onFocus={(e) => { setActiveItemId(item.id); e.target.select() }}
              onClick={() => setActiveItemId(item.id)}
            />
            {item.price_source && (
              <span
                className="absolute -left-3 top-1/2 -translate-y-1/2 text-indigo-500"
                title={
                  item.price_source.kind === 'library'
                    ? `Precio importado desde biblioteca${item.price_source.item_code ? ` · ${item.price_source.item_code}` : ''}${item.price_source.item_name ? ` · ${item.price_source.item_name}` : ''}`
                    : `Precio importado desde ${item.price_source.project_name || 'proyecto'} · ${item.price_source.budget_name || ''}${item.price_source.item_code ? ` · ${item.price_source.item_code}` : ''}`
                }
              >
                <Link2 className="w-3 h-3" />
              </span>
            )}
          </div>

          {/* Total */}
          <span className="text-right font-medium text-gray-900 pr-1">
            {formatCurrency(importe)}
          </span>

          {/* Actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={handleSaveToLibrary}
              disabled={savingToLibrary}
              className="p-1 text-gray-400 hover:text-amber-600 rounded transition disabled:opacity-50"
              title="Guardar en Biblioteca"
            >
              <Bookmark className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowBreakdown(true)}
              className="p-1 text-gray-400 hover:text-orange-600 rounded transition"
              title="Descomposición de precio"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={async () => { await duplicateItem(item.id); await autoRenumberAll() }}
              className="p-1 text-gray-400 hover:text-green-600 rounded transition"
              title="Duplicar (_bis)"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDuplicateWithQuantity}
              className="p-1 text-gray-400 hover:text-emerald-600 rounded transition"
              title="Duplicar con cantidad (continuar partida agotada)"
            >
              <CopyPlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={toggleAuxiliary}
              className={`p-1 rounded transition ${isAux ? 'text-amber-600 hover:text-amber-700' : 'text-gray-400 hover:text-amber-600'}`}
              title={isAux ? 'Quitar flag auxiliar' : 'Marcar como partida auxiliar (sin tope)'}
            >
              <InfinityIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={async () => { await updateItem(item.id, { is_active: isInactive ? true : false }) }}
              className={`p-1 rounded transition ${isInactive ? 'text-amber-500 hover:text-amber-600' : 'text-gray-400 hover:text-amber-600'}`}
              title={isInactive ? 'Reactivar partida (vuelve a contar en totales)' : 'Desactivar partida (no contará en totales)'}
            >
              {isInactive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleDelete}
              className="p-1 text-gray-400 hover:text-red-500 rounded transition"
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ─── Metrics strip: coste, margen, certificado, pendiente ─── */}
        {(hasActivity || isExpanded) && (
          <div className="pl-[104px] pr-3 pb-1.5 pt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500 -mt-1">
            <label className="flex items-center gap-1" title="Coste unitario">
              <span className="text-gray-400">Coste</span>
              <input
                {...numInputProps}
                className="w-[70px] px-1 py-0.5 rounded border border-gray-200 hover:border-gray-300 focus:border-blue-500 outline-none text-right bg-white"
                value={localCost}
                onChange={(e) => setLocalCost(e.target.value)}
                onBlur={(e) => handleBlur('cost_price', e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="0"
              />
              <span className="text-gray-400">€/{item.unit}</span>
            </label>
            {liveCost > 0 && (
              <span
                className={`font-medium ${marginPct < 0 ? 'text-red-600' : marginPct < 10 ? 'text-amber-600' : 'text-emerald-600'}`}
                title="Margen bruto: (venta − coste) / venta"
              >
                Margen {marginPct.toFixed(1)}% · {formatCurrency(marginAbs * liveQty)}
              </span>
            )}
            {certifiedTotal > 0 && (
              <span className="text-blue-600" title={`Certificado ${certifiedTotal} ${item.unit} · ${formatCurrency(certifiedAmount)}`}>
                Certif. {certifiedPct.toFixed(0)}% ({certifiedTotal.toFixed(2)} {item.unit})
              </span>
            )}
            {executedTotal > 0 && executedTotal !== certifiedTotal && (
              <span className="text-gray-500" title={`Ejecutado total en partes de obra: ${executedTotal} ${item.unit}`}>
                Ejec. {executedTotal.toFixed(2)} {item.unit}
              </span>
            )}
            <span
              className={`ml-auto font-medium ${
                isAux
                  ? 'text-amber-600'
                  : (remaining ?? 0) <= 0.0001
                    ? 'text-gray-400'
                    : (remaining ?? 0) < liveQty * 0.15
                      ? 'text-amber-600'
                      : 'text-gray-600'
              }`}
              title={
                isAux
                  ? 'Partida auxiliar: sin tope de cantidad'
                  : `Pendiente de certificar/ejecutar (cantidad − max(ejecutado, certificado))`
              }
            >
              {isAux ? (
                <>Pendiente: <InfinityIcon className="inline w-3 h-3 -mt-0.5" /> sin tope</>
              ) : (
                <>Pendiente {(remaining ?? 0).toFixed(2)} {item.unit}</>
              )}
            </span>
          </div>
        )}

        {/* ─── Expanded content: description + inline measurements ─── */}
        {isExpanded && (
          <div className="pl-[104px] pr-3 pb-3 bg-gray-50/50">
            {/* Auxiliary toggle panel */}
            <div className="mb-2 flex items-center gap-2 px-2 py-1.5 rounded bg-white border border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer select-none flex-1">
                <input
                  type="checkbox"
                  checked={isAux}
                  onChange={toggleAuxiliary}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-medium text-gray-700">Partida auxiliar (sin tope de cantidad)</span>
                <span className="text-[11px] text-gray-400">
                  Para ayudas de albañilería, medios auxiliares, limpieza… se puede certificar/imputar más de lo presupuestado.
                </span>
              </label>
            </div>

            {/* Editable description */}
            <textarea
              className="w-full px-2 py-1.5 text-sm text-gray-700 bg-white border border-gray-200
                         hover:border-gray-300 focus:border-blue-500
                         dark:text-slate-100 dark:bg-slate-900/60 dark:border-slate-700
                         dark:hover:border-slate-600 dark:focus:border-blue-400
                         rounded outline-none resize-none leading-relaxed"
              defaultValue={item.description || ''}
              placeholder="Descripción detallada del trabajo..."
              rows={Math.min(Math.max(2, Math.ceil((item.description?.length || 0) / 100)), 6)}
              onBlur={(e) => handleBlur('description', e.target.value)}
            />

            {/* Editable notes (texto interno, no aparece en PDF al cliente) */}
            <textarea
              className="w-full mt-1 px-2 py-1.5 text-xs text-amber-900 bg-amber-50/50 border border-amber-200
                         hover:border-amber-300 focus:border-amber-500
                         dark:text-amber-100 dark:bg-amber-950/40 dark:border-amber-900/60
                         dark:hover:border-amber-800 dark:focus:border-amber-500
                         rounded outline-none resize-none leading-relaxed"
              defaultValue={item.notes || ''}
              placeholder="Notas internas (uso interno, no se envían al cliente)..."
              rows={2}
              onBlur={(e) => handleBlur('notes', e.target.value)}
            />

            {/* ─── Inline Measurements Table ─── */}
            <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden bg-white">
              {/* Measurements header */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-blue-50/80 border-b border-gray-200">
                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
                  <Ruler className="w-3.5 h-3.5" />
                  Mediciones
                  {hasMeasurements && (
                    <span className="text-blue-500 font-normal">({measurements.length})</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAddMeasurement(false)}
                    className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-medium hover:bg-blue-100 px-2 py-0.5 rounded transition cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Añadir
                  </button>
                  <button
                    onClick={() => handleAddMeasurement(true)}
                    className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 font-medium hover:bg-gray-100 px-2 py-0.5 rounded transition cursor-pointer"
                    title="Añadir línea separadora (solo descripción)"
                  >
                    <Plus className="w-3 h-3" /> Separador
                  </button>
                </div>
              </div>

              {/* Column headers */}
              {hasMeasurements && (
                <div className="grid grid-cols-[1fr_64px_72px_72px_72px_80px_28px] gap-px px-2 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                  <span className="px-1">Descripción</span>
                  <span className="px-1 text-right">Uds.</span>
                  <span className="px-1 text-right">Largo</span>
                  <span className="px-1 text-right">Ancho</span>
                  <span className="px-1 text-right">Alto</span>
                  <span className="px-1 text-right">Parcial</span>
                  <span></span>
                </div>
              )}

              {/* Measurement rows */}
              {measurements.map((m) => (
                <MeasurementRow
                  key={m.id}
                  measurement={m}
                  onBlur={handleMeasurementBlur}
                  onDelete={() => deleteMeasurement(m.id)}
                />
              ))}

              {/* No measurements placeholder */}
              {!hasMeasurements && (
                <div className="px-3 py-3 text-center text-xs text-gray-400">
                  Sin mediciones — pulsa &quot;Añadir&quot; para crear una línea
                </div>
              )}

              {/* Total row */}
              {hasMeasurements && (
                <div className="grid grid-cols-[1fr_64px_72px_72px_72px_80px_28px] gap-px px-2 py-1.5 bg-blue-50/60 border-t border-gray-200">
                  <span className="px-1 text-xs font-semibold text-gray-700">TOTAL</span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span className="px-1 text-right text-xs font-bold text-blue-700">
                    {measurementsTotal.toFixed(3)}
                  </span>
                  <span></span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Price Breakdown Panel */}
      <PriceBreakdownPanel
        itemId={item.id}
        itemName={`${item.code} - ${item.name}`}
        isOpen={showBreakdown}
        onClose={() => setShowBreakdown(false)}
      />

      {/* Chapter Selector Dialog */}
      <ChapterSelectorDialog
        isOpen={chapterSelectorOpen}
        onClose={() => setChapterSelectorOpen(false)}
        currentItem={item}
        onConfirm={handleChapterSelected}
        loading={savingToLibrary}
      />

      {/* Duplicate Partida Dialog */}
      <DuplicatePartidaDialog
        isOpen={duplicateDialogOpen}
        onClose={() => { setDuplicateDialogOpen(false); setFoundDuplicates([]); setPendingChapter(null) }}
        currentItem={item}
        duplicates={foundDuplicates}
        onAction={handleDuplicateAction}
        loading={savingToLibrary}
      />
    </>
  )
}

// ─── Inline Measurement Row ──────────────────────────────────────────
function MeasurementRow({
  measurement: m,
  onBlur,
  onDelete,
}: {
  measurement: Measurement
  onBlur: (m: Measurement, field: string, value: string) => void
  onDelete: () => void
}) {
  const partial = m.partial || calcPartial(m)
  // Spacer: units=0 and all dimensions=0 → just a text separator line
  const isSpacer = m.units === 0 && !m.length && !m.width && !m.height && !m.partial

  if (isSpacer) {
    return (
      <div className="grid grid-cols-[1fr_64px_72px_72px_72px_80px_28px] gap-px px-2 py-0.5 border-b border-gray-50 group/row hover:bg-amber-50/50 items-center bg-gray-50/30">
        {/* Spacer description spans all columns visually */}
        <input
          className="px-1 py-0.5 text-xs text-gray-500 italic rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none w-full bg-transparent"
          defaultValue={m.description || ''}
          placeholder="Línea separadora..."
          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
          onBlur={(e) => onBlur(m, 'description', e.target.value)}
        />
        <span className="text-[10px] text-gray-300 text-center">—</span>
        <span className="text-[10px] text-gray-300 text-center">—</span>
        <span className="text-[10px] text-gray-300 text-center">—</span>
        <span className="text-[10px] text-gray-300 text-center">—</span>
        <span className="text-[10px] text-gray-300 text-center">—</span>
        <button
          onClick={onDelete}
          className="p-0.5 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover/row:opacity-100 transition cursor-pointer"
          title="Eliminar línea"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[1fr_64px_72px_72px_72px_80px_28px] gap-px px-2 py-0.5 border-b border-gray-50 group/row hover:bg-gray-50/50 items-center">
      {/* Description */}
      <input
        className="px-1 py-0.5 text-xs text-gray-700 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none w-full bg-transparent"
        defaultValue={m.description || ''}
        placeholder="Descripción..."
        onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
        onBlur={(e) => onBlur(m, 'description', e.target.value)}
      />
      {/* Units */}
      <input
        {...numInputProps}
        className="px-1 py-0.5 text-xs text-right rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none w-full bg-transparent"
        defaultValue={m.units}
        onBlur={(e) => onBlur(m, 'units', e.target.value)}
        onFocus={(e) => e.target.select()}
      />
      {/* Length */}
      <input
        {...numInputProps}
        className="px-1 py-0.5 text-xs text-right rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none w-full bg-transparent"
        defaultValue={m.length || ''}
        placeholder="—"
        onBlur={(e) => onBlur(m, 'length', e.target.value)}
        onFocus={(e) => e.target.select()}
      />
      {/* Width */}
      <input
        {...numInputProps}
        className="px-1 py-0.5 text-xs text-right rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none w-full bg-transparent"
        defaultValue={m.width || ''}
        placeholder="—"
        onBlur={(e) => onBlur(m, 'width', e.target.value)}
        onFocus={(e) => e.target.select()}
      />
      {/* Height */}
      <input
        {...numInputProps}
        className="px-1 py-0.5 text-xs text-right rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none w-full bg-transparent"
        defaultValue={m.height || ''}
        placeholder="—"
        onBlur={(e) => onBlur(m, 'height', e.target.value)}
        onFocus={(e) => e.target.select()}
      />
      {/* Partial (read-only calculated) */}
      <span className="px-1 py-0.5 text-xs text-right font-medium text-gray-700">
        {partial.toFixed(3)}
      </span>
      {/* Delete */}
      <button
        onClick={onDelete}
        className="p-0.5 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover/row:opacity-100 transition cursor-pointer"
        title="Eliminar medición"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
