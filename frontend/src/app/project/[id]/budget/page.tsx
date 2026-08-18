'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useBudgetStore } from '@/stores/budgetStore'
import { useNotificationStore } from '@/stores/notificationStore'
import api from '@/lib/api'
import type { ChapterWithItems, BudgetItem, BatchSaveResult } from '@/types'
import PartidaEditRow from '@/components/budget/PartidaEditRow'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Loader2, Calculator, ChevronDown, ChevronRight,
  Trash2, FileDown, FileUp, Send, Check, RotateCcw, GripVertical, BookmarkPlus, Eye, EyeOff, X,
  ArrowRightLeft, FileText, List, Library, Search, Undo2
} from 'lucide-react'
import type { PricePickMessage } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { DecimalInput } from '@/components/ui/DecimalInput'
import { useProjectStore } from '@/stores/projectStore'
import ImportBudgetDialog from '@/components/budget/ImportBudgetDialog'
import ImportFromLibraryDialog from '@/components/budget/ImportFromLibraryDialog'
import PickFromLibraryDialog from '@/components/budget/PickFromLibraryDialog'
import BudgetPdfPreviewModal from '@/components/budget/BudgetPdfPreviewModal'
import ChapterMappingDialog from '@/components/budget/ChapterMappingDialog'
import BudgetComparisonModal from '@/components/budget/BudgetComparisonModal'
import BudgetTrashModal from '@/components/budget/BudgetTrashModal'
import RichTextEditor from '@/components/budget/RichTextEditor'

// ─── Chapter Templates ─────────────────────────────────────────────
const CHAPTER_TEMPLATES = [
  { code: 'CG', name: 'Condiciones Generales', isLegalText: true },
  { code: 'SYS', name: 'Seguridad y Salud', isLegalText: false },
  { code: 'GR', name: 'Gestión de Residuos', isLegalText: false },
  { code: 'CA', name: 'Control de Calidad', isLegalText: false },
  { code: 'DM', name: 'Demoliciones', isLegalText: false },
  { code: 'MT', name: 'Movimiento de Tierras', isLegalText: false },
  { code: 'CI', name: 'Cimentaciones', isLegalText: false },
  { code: 'ES', name: 'Estructuras', isLegalText: false },
  { code: 'AL', name: 'Albañilería', isLegalText: false },
  { code: 'CU', name: 'Cubiertas', isLegalText: false },
  { code: 'RE', name: 'Revestimientos', isLegalText: false },
  { code: 'SO', name: 'Solados y Pavimentos', isLegalText: false },
  { code: 'CA', name: 'Carpintería', isLegalText: false },
  { code: 'CE', name: 'Cerrajería', isLegalText: false },
  { code: 'VI', name: 'Vidriería', isLegalText: false },
  { code: 'PI', name: 'Pintura', isLegalText: false },
  { code: 'FO', name: 'Fontanería', isLegalText: false },
  { code: 'EL', name: 'Electricidad', isLegalText: false },
  { code: 'CL', name: 'Climatización', isLegalText: false },
  { code: 'UR', name: 'Urbanización', isLegalText: false },
]

// ─── Sortable Item Wrapper ────────────────────────────────────────────
function SortableItemRow({
  item,
  isExpanded,
  onToggleExpand,
  isSelected,
  onSelect,
}: {
  item: BudgetItem
  isExpanded: boolean
  onToggleExpand: () => void
  isSelected: boolean
  onSelect: (e: React.MouseEvent) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative' as const,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'shadow-lg rounded-lg' : ''}
    >
      <PartidaEditRow
        item={item}
        dragHandleProps={{ ...attributes, ...listeners }}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        isSelected={isSelected}
        onSelect={onSelect}
      />
    </div>
  )
}

// ─── Sortable Chapter Wrapper ────────────────────────────────────────────
function SortableChapterRow({
  id,
  children,
}: {
  id: string
  children: (props: { dragHandleProps: Record<string, any>; isDragging: boolean }) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative' as const,
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'shadow-lg rounded-lg' : ''}>
      {children({ dragHandleProps: { ...attributes, ...listeners }, isDragging })}
    </div>
  )
}

export default function BudgetPage() {
  const { t } = useTranslation()
  const params = useParams()
  const projectId = params.id as string

  const {
    budgets, activeBudget, loading,
    expandedChapters, expandedItems,
    activeItemId, priceUndoStack,
    loadBudgets, loadFullBudget, createBudget, updateBudget, deleteBudget,
    addChapter, updateChapter, deleteChapter, moveChapter, reorderChapters, addItem, reorderItems,
    submitBudget, approveBudget, reopenBudget,
    batchMoveItems, autoRenumberAll, autoRenumberChapters,
    toggleChapter, toggleItem, expandItem, initExpandedState,
    setActiveItemId, applyImportedPrice, undoLastPriceChange,
  } = useBudgetStore()

  const { addToast } = useNotificationStore()
  const { activeProject } = useProjectStore()
  const [creating, setCreating] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [lastClickedItem, setLastClickedItem] = useState<string | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showLibraryImport, setShowLibraryImport] = useState(false)
  const [pickLibraryForChapter, setPickLibraryForChapter] = useState<string | null>(null)
  const [batchSaving, setBatchSaving] = useState(false)
  const [showChapterMapping, setShowChapterMapping] = useState(false)
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null)
  const [deletingInProgress, setDeletingInProgress] = useState(false)
  const [editingChapterCode, setEditingChapterCode] = useState<string | null>(null)
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const [addingItemToChapter, setAddingItemToChapter] = useState<string | null>(null)
  const [showChapterTemplates, setShowChapterTemplates] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [editingChapterName, setEditingChapterName] = useState<string | null>(null)
  const [statusActionInProgress, setStatusActionInProgress] = useState(false)
  const [renamingBudgetId, setRenamingBudgetId] = useState<string | null>(null)
  const [renamingBudgetName, setRenamingBudgetName] = useState('')
  const [showComparison, setShowComparison] = useState(false)
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const [showTrash, setShowTrash] = useState(false)

  // Ref for scroll preservation
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowChapterTemplates(false)
        setShowMoveMenu(false)
        setTemplateSearch('')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  // Flat list of all items (for shift+click range selection)
  const flatItems = useMemo(() => {
    if (!activeBudget) return []
    return activeBudget.chapters.flatMap((ch) =>
      expandedChapters.has(ch.chapter.id) ? ch.items : []
    )
  }, [activeBudget, expandedChapters])

  useEffect(() => {
    loadBudgets(projectId)
  }, [projectId])

  // Auto-load the first budget when budgets are loaded but none is active
  useEffect(() => {
    if (budgets.length > 0 && !activeBudget && !loading) {
      loadFullBudget(budgets[0].id)
    }
  }, [budgets, activeBudget, loading])

  // Initialize expanded state when budget loads (preserves existing state on re-navigation)
  useEffect(() => {
    if (activeBudget) {
      initExpandedState()
      // Clear selection when budget changes
      setSelectedItems(new Set())
      setLastClickedItem(null)
    }
  }, [activeBudget?.budget.id])

  // ─── Ventana "Consultar presupuesto" ─────────────────────────────
  // Mantenemos una sola ventana de referencia abierta a la vez.
  const referenceWindowRef = useRef<Window | null>(null)

  const activeItem = useMemo(() => {
    if (!activeBudget || !activeItemId) return null
    for (const ch of activeBudget.chapters) {
      const it = ch.items.find(i => i.id === activeItemId)
      if (it) return it
    }
    return null
  }, [activeBudget, activeItemId])

  const openReferenceViewer = useCallback(() => {
    // Reutilizar ventana existente si sigue abierta
    if (referenceWindowRef.current && !referenceWindowRef.current.closed) {
      referenceWindowRef.current.focus()
      return
    }
    const isStandalonePWA = typeof window !== 'undefined'
      && window.matchMedia?.('(display-mode: standalone)').matches
    const target = activeItem ? `${activeItem.code} · ${activeItem.name}` : ''
    const params = new URLSearchParams()
    if (target) params.set('target', target)
    const url = `/budget-reference${params.toString() ? `?${params.toString()}` : ''}`

    // En PWA/escritorio: ventana estilo app (sin chrome del navegador).
    // En web: popup estandar del navegador.
    const features = isStandalonePWA
      ? 'popup=yes,width=1200,height=800,menubar=no,toolbar=no,location=no,status=no'
      : 'popup=yes,width=1200,height=800,menubar=no,toolbar=no,location=no,status=no'
    const w = window.open(url, 'budget-reference', features)
    if (w) {
      w.focus()
      referenceWindowRef.current = w
    } else {
      addToast('error', 'No se pudo abrir la ventana. Permite las ventanas emergentes.')
    }
  }, [activeBudget, activeItem, addToast])

  // Cerrar la ventana de referencia al salir de la pagina del presupuesto.
  useEffect(() => {
    return () => {
      if (referenceWindowRef.current && !referenceWindowRef.current.closed) {
        try { referenceWindowRef.current.close() } catch { /* ignore */ }
      }
    }
  }, [])

  // ─── Listener: aplicar precio importado desde el visor ──────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return
    const ch = new BroadcastChannel('budget-price-pick')
    const handler = async (ev: MessageEvent<PricePickMessage>) => {
      const msg = ev.data
      if (!msg || msg.type !== 'budget-price-pick') return
      const target = useBudgetStore.getState().activeItemId
      if (!target) {
        addToast('warning', 'Selecciona primero la partida a la que aplicar el precio')
        return
      }
      try {
        await applyImportedPrice(target, msg.unit_price, msg.source)
        const origin = msg.source.kind === 'library'
          ? 'biblioteca'
          : `${msg.source.project_name || 'proyecto'} · ${msg.source.budget_name || ''}`
        addToast('success', `Precio aplicado (${origin}). Ctrl+Z para deshacer.`)
      } catch {
        addToast('error', 'No se pudo aplicar el precio')
      }
    }
    ch.addEventListener('message', handler)
    return () => {
      ch.removeEventListener('message', handler)
      ch.close()
    }
  }, [applyImportedPrice, addToast])

  // ─── Ctrl+Z: deshacer ultimo cambio de precio importado ───────────
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key !== 'z' && e.key !== 'Z') return
      if (e.shiftKey) return // Shift+Ctrl+Z es redo — no implementado
      // No interferir con undo nativo en inputs editables
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
      if (useBudgetStore.getState().priceUndoStack.length === 0) return
      e.preventDefault()
      const ok = await undoLastPriceChange()
      if (ok) addToast('success', 'Precio anterior restaurado')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [undoLastPriceChange, addToast])

  const handleCreateBudget = async () => {
    setCreating(true)
    try {
      const b = await createBudget(projectId)
      await loadFullBudget(b.id)
    } finally {
      setCreating(false)
    }
  }

  const handleAddChapterFromTemplate = async (template: typeof CHAPTER_TEMPLATES[0]) => {
    if (!activeBudget) return
    const nextOrder = activeBudget.chapters.length + 1
    const code = String(nextOrder).padStart(2, '0')
    await addChapter(activeBudget.budget.id, code, template.name, template.isLegalText)
    setShowChapterTemplates(false)
    setTemplateSearch('')
  }

  const handleAddBlankChapter = async () => {
    if (!activeBudget) return
    const nextOrder = activeBudget.chapters.length + 1
    const code = String(nextOrder).padStart(2, '0')
    await addChapter(activeBudget.budget.id, code, `Capítulo ${code}`)
    setShowChapterTemplates(false)
    setTemplateSearch('')
  }

  const handleAddItem = async (chapterId: string) => {
    const chapter = activeBudget?.chapters.find((c) => c.chapter.id === chapterId)
    if (!chapter || !activeBudget) return
    setAddingItemToChapter(chapterId)
    try {
      const nextOrder = chapter.items.length + 1
      await addItem(chapterId, {
        code: `${chapter.chapter.code}.${String(nextOrder).padStart(2, '0')}`,
        name: 'Nueva partida',
        unit: 'ud',
        quantity: 1,
        unit_price: 0,
        cost_price: 0,
        sort_order: nextOrder,
      })
      await autoRenumberAll()

      // Auto-expand the newly created item (last in the chapter)
      const updatedBudget = useBudgetStore.getState().activeBudget
      const updatedChapter = updatedBudget?.chapters.find(c => c.chapter.id === chapterId)
      if (updatedChapter && updatedChapter.items.length > 0) {
        const newItem = updatedChapter.items[updatedChapter.items.length - 1]
        expandItem(newItem.id)
      }
    } finally {
      setAddingItemToChapter(null)
    }
  }

  const handleDeleteChapter = async (chapterId: string) => {
    if (!confirm('¿Eliminar este capítulo y todas sus partidas?')) return
    await deleteChapter(chapterId)
    // Renumber remaining chapters (01, 02, 03...) and their items
    await autoRenumberChapters()
  }

  const handleDeleteBudget = async (budgetId: string) => {
    setDeletingInProgress(true)
    try {
      // The store's deleteBudget already handles:
      // 1. Removing from budgets array
      // 2. Loading next budget if the deleted one was active
      await deleteBudget(budgetId)
      setDeletingBudgetId(null)

      addToast('success', 'Presupuesto eliminado')
    } catch {
      addToast('error', 'Error al eliminar el presupuesto')
    } finally {
      setDeletingInProgress(false)
    }
  }

  // Open chapter mapping dialog (works for all items or selected items)
  const handleBatchSaveToLibrary = () => {
    if (!activeBudget) return
    setShowChapterMapping(true)
  }

  // Execute batch save with chapter mapping
  const executeBatchSave = async (mapping: Record<string, string>) => {
    if (!activeBudget) return
    setBatchSaving(true)
    setShowChapterMapping(false)
    try {
      // If there are selected items, only save those; otherwise save all
      const chaptersToSave = activeBudget.chapters.filter(ch => !ch.chapter.is_legal_text)
      const items = chaptersToSave.flatMap((ch) =>
        ch.items
          .filter((item) => selectedItems.size === 0 || selectedItems.has(item.id))
          .map((item) => ({
            action: 'create' as const,
            data: {
              code: item.code,
              name: item.name,
              description: item.description || '',
              unit: item.unit,
              unit_price: item.unit_price,
              cost_price: item.cost_price,
              chapter_code: ch.chapter.code,
              chapter_name: ch.chapter.name,
              source: 'from_budget',
              tags: '',
            },
          }))
      )
      const { data } = await api.post<BatchSaveResult>('/library/partidas/batch-save', {
        items,
        chapter_mapping: mapping,
      })
      addToast('success', `${data.created} creadas, ${data.updated} actualizadas, ${data.skipped} omitidas`)
    } catch {
      addToast('error', 'Error al guardar partidas en biblioteca')
    } finally {
      setBatchSaving(false)
    }
  }

  // Auto-create library chapters from budget (when library is empty)
  const executeAutoCreateSave = async () => {
    if (!activeBudget) return
    setBatchSaving(true)
    setShowChapterMapping(false)
    try {
      const chaptersToSave = activeBudget.chapters.filter(ch => !ch.chapter.is_legal_text)
      const items = chaptersToSave.flatMap((ch) =>
        ch.items
          .filter((item) => selectedItems.size === 0 || selectedItems.has(item.id))
          .map((item) => ({
            action: 'create' as const,
            data: {
              code: item.code,
              name: item.name,
              description: item.description || '',
              unit: item.unit,
              unit_price: item.unit_price,
              cost_price: item.cost_price,
              chapter_code: ch.chapter.code,
              chapter_name: ch.chapter.name,
              source: 'from_budget',
              tags: '',
            },
          }))
      )
      const { data } = await api.post<BatchSaveResult>('/library/partidas/batch-save', {
        items,
        auto_create_chapters: true,
      })
      addToast('success', `Biblioteca inicializada: ${data.created} partidas en ${chaptersToSave.length} capítulos`)
    } catch {
      addToast('error', 'Error al crear capítulos en biblioteca')
    } finally {
      setBatchSaving(false)
    }
  }

  // Build budget chapters info for the mapping dialog
  const budgetChaptersForMapping = useMemo(() => {
    if (!activeBudget) return []
    return activeBudget.chapters
      .filter(ch => !ch.chapter.is_legal_text)
      .filter(ch => {
        // If items are selected, only include chapters that have selected items
        if (selectedItems.size === 0) return ch.items.length > 0
        return ch.items.some(item => selectedItems.has(item.id))
      })
      .map(ch => ({
        code: ch.chapter.code,
        name: ch.chapter.name,
        itemCount: selectedItems.size === 0
          ? ch.items.length
          : ch.items.filter(item => selectedItems.has(item.id)).length,
      }))
  }, [activeBudget, selectedItems])

  // ─── Multi-selection handlers ─────────────────────────────
  // Comportamiento tipo checkbox:
  //  - clic normal: toggle (añade o quita) manteniendo el resto
  //  - Shift+clic: selección por rango desde la última casilla marcada
  //    → si la última casilla quedó marcada, añade el rango;
  //    → si la última casilla quedó desmarcada, desmarca el rango.
  //  - Ctrl/Cmd+clic: equivalente a clic normal (toggle)
  const handleItemSelect = useCallback((itemId: string, e: React.MouseEvent) => {
    const isShift = e.shiftKey

    setSelectedItems((prev) => {
      const next = new Set(prev)

      if (isShift && lastClickedItem && lastClickedItem !== itemId) {
        // Range selection — replica el estado de la última casilla clicada
        const flatIds = flatItems.map(i => i.id)
        const startIdx = flatIds.indexOf(lastClickedItem)
        const endIdx = flatIds.indexOf(itemId)
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
          const addMode = prev.has(lastClickedItem)
          for (let i = from; i <= to; i++) {
            if (addMode) next.add(flatIds[i])
            else next.delete(flatIds[i])
          }
        }
      } else {
        // Toggle individual
        if (next.has(itemId)) next.delete(itemId)
        else next.add(itemId)
      }

      return next
    })

    setLastClickedItem(itemId)
  }, [lastClickedItem, flatItems])

  const handleSelectAll = () => {
    if (selectedItems.size === flatItems.length && flatItems.length > 0) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(flatItems.map(i => i.id)))
    }
  }

  const handleBatchMove = async (targetChapterId: string) => {
    if (selectedItems.size === 0) return
    await batchMoveItems(Array.from(selectedItems), targetChapterId)
    setSelectedItems(new Set())
    setLastClickedItem(null)
    setShowMoveMenu(false)
    addToast('success', `${selectedItems.size} partidas movidas y renumeradas`)
  }

  const handleBatchDelete = async () => {
    if (selectedItems.size === 0) return
    const n = selectedItems.size
    if (!confirm(n === 1 ? '¿Eliminar la partida seleccionada?' : `¿Eliminar ${n} partidas seleccionadas?`)) return

    const { deleteItem } = useBudgetStore.getState()
    const ids = Array.from(selectedItems)
    let deleted = 0
    let failed = 0
    let force = false        // el usuario ya autorizó arrastrar los datos vinculados
    let cancelled = false

    for (const id of ids) {
      try {
        let res = await deleteItem(id, { force })

        // 409: la partida tiene datos vinculados y hace falta confirmación explícita.
        // Se pregunta UNA vez y a partir de ahí se aplica force al resto del lote.
        if (!res.success) {
          const d = res.dependencies
          const bits: string[] = []
          if (d.measurements) bits.push(`${d.measurements} mediciones`)
          if (d.breakdown) bits.push(`${d.breakdown} líneas de desglose`)
          if (d.work_log_links) bits.push(`${d.work_log_links} ejecuciones en partes`)
          if (d.certifications) bits.push(`${d.certifications} certificaciones`)
          const ok = confirm(
            `Una o más partidas tienen datos vinculados (${bits.join(', ')}).\n\n` +
            `¿Eliminar igualmente? Se borrarán también esos registros y los totales se recalcularán.`
          )
          if (!ok) { cancelled = true; break }
          force = true
          res = await deleteItem(id, { force: true })
          if (!res.success) { failed++; continue }
        }
        deleted++
      } catch (err) {
        // Un fallo puntual (red, 500, permisos) NO debe abortar el lote en
        // silencio: antes la excepción salía de aquí sin toast ni deselección y
        // parecía que el botón no hacía nada.
        console.error('[batch-delete] fallo al eliminar', id, err)
        failed++
      }
    }

    if (deleted > 0) await autoRenumberAll()
    setSelectedItems(new Set())
    setLastClickedItem(null)

    if (deleted > 0) {
      addToast('success', `${deleted} partida${deleted !== 1 ? 's' : ''} eliminada${deleted !== 1 ? 's' : ''}`)
    }
    if (failed > 0) {
      addToast('error', failed === 1
        ? 'Una partida no se pudo eliminar'
        : `${failed} partidas no se pudieron eliminar`)
    }
    if (cancelled && deleted === 0 && failed === 0) {
      addToast('info', 'Borrado cancelado')
    }
  }

  // Compute selected items total (excluye desactivadas)
  const selectedTotal = useMemo(() => {
    if (!activeBudget || selectedItems.size === 0) return 0
    let total = 0
    for (const ch of activeBudget.chapters) {
      if (ch.chapter.is_active === false) continue
      for (const item of ch.items) {
        if (item.is_active === false) continue
        if (selectedItems.has(item.id)) {
          total += item.quantity * item.unit_price
        }
      }
    }
    return total
  }, [activeBudget, selectedItems])

  // ─── Chapter code editing ─────────────────────────────
  const handleChapterCodeBlur = async (chapterId: string, newCode: string) => {
    setEditingChapterCode(null)
    const ch = activeBudget?.chapters.find(c => c.chapter.id === chapterId)
    if (!ch || ch.chapter.code === newCode.trim()) return
    await updateChapter(chapterId, { code: newCode.trim() })
    await autoRenumberAll()
  }

  // ─── Chapter name editing ─────────────────────────────
  const handleChapterNameBlur = async (chapterId: string, newName: string) => {
    setEditingChapterName(null)
    const ch = activeBudget?.chapters.find(c => c.chapter.id === chapterId)
    if (!ch || ch.chapter.name === newName.trim()) return
    await updateChapter(chapterId, { name: newName.trim() })
  }

  // ─── Chapter description editing (for legal text chapters) ─────
  const handleChapterDescriptionBlur = async (chapterId: string, newDesc: string) => {
    const ch = activeBudget?.chapters.find(c => c.chapter.id === chapterId)
    if (!ch) return
    if ((ch.chapter.description || '') !== newDesc) {
      await updateChapter(chapterId, { description: newDesc })
    }
  }

  const handleChapterDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !activeBudget) return

    const chapters = activeBudget.chapters
    const oldIndex = chapters.findIndex((c) => c.chapter.id === active.id)
    const newIndex = chapters.findIndex((c) => c.chapter.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(chapters, oldIndex, newIndex)
    reorderChapters(reordered.map(c => c.chapter.id))
  }, [activeBudget, reorderChapters])

  const handleDragEnd = useCallback((chapterId: string) => (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !activeBudget) return

    const chapter = activeBudget.chapters.find((c) => c.chapter.id === chapterId)
    if (!chapter) return

    const oldIndex = chapter.items.findIndex((i) => i.id === active.id)
    const newIndex = chapter.items.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(chapter.items, oldIndex, newIndex)
    const reorderPayload = reordered.map((item, idx) => ({
      id: item.id,
      sort_order: idx + 1,
      chapter_id: chapterId,
    }))

    reorderItems(reorderPayload).then(() => autoRenumberAll())
  }, [activeBudget, reorderItems, autoRenumberAll])

  const calcChapterTotal = (items: ChapterWithItems['items']) =>
    items.reduce((sum, item) => item.is_active === false ? sum : sum + item.quantity * item.unit_price, 0)

  const totalPEM = activeBudget?.chapters.reduce(
    (sum, ch) => ch.chapter.is_active === false ? sum : sum + calcChapterTotal(ch.items),
    0,
  ) || 0
  const ivaEnabled = (activeBudget?.budget.tax_rate || 0) > 0
  const ivaRate = activeBudget?.budget.tax_rate || 0
  const iva = totalPEM * (ivaRate / 100)
  const totalFinal = totalPEM + iva

  // Filter chapter templates by search
  const filteredTemplates = CHAPTER_TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.code.toLowerCase().includes(templateSearch.toLowerCase())
  )

  if (loading && !activeBudget) {
    return (
      <div className="pb-16">
        {/* Skeleton header */}
        <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-7 w-48 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-4 w-64 bg-gray-100 rounded mt-2 animate-pulse" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-9 w-36 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-9 w-32 bg-blue-100 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
        {/* Skeleton tabs */}
        <div className="flex gap-2 mb-4">
          <div className="h-8 w-32 bg-blue-100 rounded-lg animate-pulse" />
          <div className="h-8 w-32 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        {/* Skeleton table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[20px_24px_60px_1fr_60px_80px_90px_110px_180px] gap-1 px-3 py-3 bg-gray-50 border-b">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-3 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`px-3 py-3 border-b border-gray-100 ${i % 3 === 0 ? 'bg-blue-50/30' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="h-4 w-10 bg-gray-200 rounded animate-pulse" />
                <div className={`h-4 rounded animate-pulse ${i % 3 === 0 ? 'w-48 bg-blue-100' : 'w-64 bg-gray-100'}`} />
                <div className="flex-1" />
                <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }

  return (
    <div className="pb-16" ref={scrollContainerRef}>
      {/* Header — sticky */}
      <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('nav.budget')}</h1>
            {activeBudget && (
              <div className="flex items-center gap-3 mt-1">
                <p className="text-gray-500 text-sm">
                  {activeBudget.budget.name} — {activeBudget.chapters.length} capítulos
                </p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[activeBudget.budget.status] || ''}`}>
                  {activeBudget.budget.status}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {activeBudget && (
              <>
                {activeBudget.budget.status === 'draft' && (
                  <button
                    onClick={async () => { setStatusActionInProgress(true); try { await submitBudget(activeBudget.budget.id) } finally { setStatusActionInProgress(false) } }}
                    disabled={statusActionInProgress}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition shadow-sm disabled:opacity-50"
                    title="Enviar para aprobación"
                  >
                    {statusActionInProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar
                  </button>
                )}
                {activeBudget.budget.status === 'pending' && (
                  <button
                    onClick={async () => { setStatusActionInProgress(true); try { await approveBudget(activeBudget.budget.id) } finally { setStatusActionInProgress(false) } }}
                    disabled={statusActionInProgress}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg transition shadow-sm disabled:opacity-50"
                  >
                    {statusActionInProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Aprobar
                  </button>
                )}
                {(activeBudget.budget.status === 'approved' || activeBudget.budget.status === 'rejected') && (
                  <button
                    onClick={async () => { setStatusActionInProgress(true); try { await reopenBudget(activeBudget.budget.id) } finally { setStatusActionInProgress(false) } }}
                    disabled={statusActionInProgress}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition shadow-sm disabled:opacity-50"
                  >
                    {statusActionInProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Reabrir
                  </button>
                )}
                <button
                  onClick={handleBatchSaveToLibrary}
                  disabled={batchSaving}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition shadow-sm disabled:opacity-50"
                  title="Guardar todas las partidas en la biblioteca"
                >
                  {batchSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
                  Guardar en Biblioteca
                </button>
                <button
                  onClick={() => setShowLibraryImport(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 active:bg-purple-200 rounded-lg transition shadow-sm"
                  title="Importar capítulos desde la biblioteca"
                >
                  <Library className="w-4 h-4" /> Desde Biblioteca
                </button>
                <button
                  onClick={() => setShowImportDialog(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition shadow-sm"
                  title="Importar presupuesto desde PDF"
                >
                  <FileUp className="w-4 h-4" /> Importar desde...
                </button>
                <button
                  onClick={() => setShowPdfPreview(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition shadow-sm"
                  title="Vista previa del PDF"
                >
                  <Eye className="w-4 h-4" /> Vista Previa PDF
                </button>
                {budgets.length >= 2 && (
                  <button
                    onClick={() => setShowComparison(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 active:bg-amber-200 rounded-lg transition shadow-sm"
                    title="Comparar presupuestos"
                  >
                    <ArrowRightLeft className="w-4 h-4" /> Comparar
                  </button>
                )}
              {/* Add Chapter with template picker */}
              <div className="relative">
                <button
                  onClick={() => setShowChapterTemplates(!showChapterTemplates)}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Capítulo
                </button>
                {showChapterTemplates && (
                  <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[320px] z-50 max-h-[400px] flex flex-col">
                    {/* Search */}
                    <div className="px-3 py-2 border-b border-gray-100">
                      <input
                        autoFocus
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded outline-none focus:border-blue-500"
                        placeholder="Buscar capítulo..."
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                      />
                    </div>
                    {/* Blank chapter option */}
                    <button
                      onClick={handleAddBlankChapter}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition flex items-center gap-2 border-b border-gray-100 font-medium text-blue-700"
                    >
                      <Plus className="w-4 h-4" />
                      Capítulo en blanco
                    </button>
                    {/* Template list */}
                    <div className="overflow-y-auto flex-1">
                      {filteredTemplates.map((tpl, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleAddChapterFromTemplate(tpl)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition flex items-center gap-2"
                        >
                          {tpl.isLegalText ? (
                            <FileText className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          ) : (
                            <List className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                          )}
                          <span className="font-medium text-gray-700 w-8 flex-shrink-0">{tpl.code}</span>
                          <span className="text-gray-600 truncate">{tpl.name}</span>
                          {tpl.isLegalText && (
                            <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">texto</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          <button
            onClick={openReferenceViewer}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 active:bg-indigo-200 rounded-lg transition shadow-sm"
            title={activeItem
              ? `Consultar otro presupuesto y aplicar precio a: ${activeItem.code} · ${activeItem.name}`
              : 'Consultar otro presupuesto. Selecciona primero una partida para aplicar su precio.'}
          >
            <Search className="w-4 h-4" /> Consultar presupuesto
            {priceUndoStack.length > 0 && (
              <span
                className="ml-1 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700"
                title={`${priceUndoStack.length} precio(s) importado(s). Ctrl+Z para deshacer.`}
              >
                <Undo2 className="w-3 h-3" /> {priceUndoStack.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowTrash(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition"
            title="Ver presupuestos eliminados"
          >
            <Trash2 className="w-4 h-4" />
            Papelera
          </button>
          <button
            onClick={handleCreateBudget}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition shadow-sm disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            Nuevo Presupuesto
          </button>
          </div>
        </div>
      </div>

      {showTrash && (
        <BudgetTrashModal
          projectId={projectId}
          onClose={() => setShowTrash(false)}
          onRestored={() => loadBudgets(projectId)}
        />
      )}

      {/* Budget Tabs */}
      {budgets.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {budgets.map((b) => (
            <div
              key={b.id}
              className={`relative group flex items-center ${dragOverTabId === b.id && draggingTabId !== b.id ? 'ring-2 ring-blue-400 rounded-lg' : ''}`}
              draggable={!renamingBudgetId && !deletingBudgetId}
              onDragStart={(e) => {
                setDraggingTabId(b.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverTabId(b.id)
              }}
              onDragLeave={() => setDragOverTabId(null)}
              onDrop={async (e) => {
                e.preventDefault()
                setDragOverTabId(null)
                if (!draggingTabId || draggingTabId === b.id) return
                // Reorder: move dragged to target position
                const fromIdx = budgets.findIndex(x => x.id === draggingTabId)
                const toIdx = budgets.findIndex(x => x.id === b.id)
                if (fromIdx === -1 || toIdx === -1) return
                const reordered = [...budgets]
                const [moved] = reordered.splice(fromIdx, 1)
                reordered.splice(toIdx, 0, moved)
                // Assign descending versions (backend orders by version DESC)
                const total = reordered.length
                for (let i = 0; i < reordered.length; i++) {
                  const newVersion = total - i
                  if (reordered[i].version !== newVersion) {
                    await api.put(`/budgets/${reordered[i].id}`, { version: newVersion })
                  }
                }
                await loadBudgets(projectId)
                setDraggingTabId(null)
              }}
              onDragEnd={() => { setDraggingTabId(null); setDragOverTabId(null) }}
            >
              {deletingBudgetId === b.id ? (
                <div className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-red-50 border border-red-200">
                  <span className="text-red-700 text-xs font-medium mr-1">Eliminar?</span>
                  <button
                    onClick={() => handleDeleteBudget(b.id)}
                    disabled={deletingInProgress}
                    className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {deletingInProgress ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Si'}
                  </button>
                  <button
                    onClick={() => setDeletingBudgetId(null)}
                    className="px-2 py-0.5 text-xs bg-white text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition"
                  >
                    No
                  </button>
                </div>
              ) : renamingBudgetId === b.id ? (
                <input
                  autoFocus
                  value={renamingBudgetName}
                  onChange={(e) => setRenamingBudgetName(e.target.value)}
                  onBlur={async () => {
                    const trimmed = renamingBudgetName.trim()
                    if (trimmed && trimmed !== b.name) {
                      await updateBudget(b.id, { name: trimmed })
                      await loadBudgets(projectId)
                    }
                    setRenamingBudgetId(null)
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur()
                    } else if (e.key === 'Escape') {
                      setRenamingBudgetId(null)
                    }
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg border-2 border-blue-400 outline-none bg-white min-w-[120px]"
                />
              ) : (
                <button
                  onClick={() => loadFullBudget(b.id)}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    setRenamingBudgetId(b.id)
                    setRenamingBudgetName(b.name)
                  }}
                  className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition flex items-center gap-1.5 cursor-grab active:cursor-grabbing ${
                    draggingTabId === b.id ? 'opacity-50' : ''
                  } ${
                    activeBudget?.budget.id === b.id
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                  title="Doble click para renombrar · Arrastra para reordenar"
                >
                  {b.name}
                  <span
                    onClick={(e) => { e.stopPropagation(); setDeletingBudgetId(b.id) }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-500 text-gray-400 transition cursor-pointer"
                    title="Eliminar version"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No Budgets */}
      {budgets.length === 0 && (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Calculator className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg mb-4">No hay presupuestos aún</p>
          <button
            onClick={handleCreateBudget}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition shadow-sm"
          >
            Crear primer presupuesto
          </button>
        </div>
      )}

      {/* Budget Content */}
      {activeBudget && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[20px_24px_60px_1fr_60px_80px_90px_110px_180px] gap-1 px-3 py-3 bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
            {/* Select All checkbox */}
            <div
              className="flex items-center justify-center cursor-pointer"
              onClick={handleSelectAll}
              title={selectedItems.size === flatItems.length && flatItems.length > 0
                ? 'Deseleccionar todo'
                : 'Seleccionar todo (tip: Shift+clic en una casilla para seleccionar rango)'}
            >
              <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition ${
                selectedItems.size > 0 && selectedItems.size === flatItems.length
                  ? 'bg-blue-600 border-blue-600'
                  : selectedItems.size > 0
                    ? 'bg-blue-200 border-blue-400'
                    : 'border-gray-300 hover:border-blue-400'
              }`}>
                {selectedItems.size > 0 && selectedItems.size === flatItems.length && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {selectedItems.size > 0 && selectedItems.size < flatItems.length && (
                  <div className="w-2 h-0.5 bg-blue-600 rounded" />
                )}
              </div>
            </div>
            <span></span>
            <span>Código</span>
            <span>Descripción</span>
            <span className="text-center">Ud.</span>
            <span className="text-right">Cantidad</span>
            <span className="text-right">P. Unit.</span>
            <span className="text-right">Importe</span>
            <span></span>
          </div>

          {/* Chapters — drag-and-drop reorder */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleChapterDragEnd}
          >
            <SortableContext
              items={activeBudget.chapters.map(c => c.chapter.id)}
              strategy={verticalListSortingStrategy}
            >
          {activeBudget.chapters.map((ch, chIdx) => (
            <SortableChapterRow key={ch.chapter.id} id={ch.chapter.id}>
              {({ dragHandleProps }) => (
            <div>
              {/* Chapter Row */}
              <div
                className={`grid grid-cols-[20px_24px_60px_1fr_60px_80px_90px_110px_180px] gap-1 px-3 py-3 bg-blue-50/60 border-b border-blue-100 hover:bg-blue-50 dark:bg-blue-950/40 dark:border-blue-900/60 dark:hover:bg-blue-900/40 cursor-pointer transition group ${ch.chapter.is_active === false ? 'opacity-50 line-through' : ''}`}
                onClick={() => toggleChapter(ch.chapter.id)}
              >
                {/* Drag handle */}
                <div
                  className="flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-400 hover:text-blue-600"
                  {...dragHandleProps}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="w-4 h-4" />
                </div>
                <div className="flex items-center">
                  {expandedChapters.has(ch.chapter.id) ? (
                    <ChevronDown className="w-4 h-4 text-blue-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-blue-400" />
                  )}
                </div>
                {/* Editable chapter code */}
                {editingChapterCode === ch.chapter.id ? (
                  <input
                    autoFocus
                    className="font-bold text-blue-700 dark:text-blue-300 text-sm bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-500 rounded px-1 py-0.5 outline-none w-full"
                    defaultValue={ch.chapter.code}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => handleChapterCodeBlur(ch.chapter.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditingChapterCode(null)
                    }}
                  />
                ) : (
                  <span
                    className="font-bold text-blue-700 dark:text-blue-300 text-sm cursor-text hover:underline"
                    onClick={(e) => { e.stopPropagation(); setEditingChapterCode(ch.chapter.id) }}
                    title="Click para editar código"
                  >
                    {ch.chapter.code}
                  </span>
                )}
                {/* Editable chapter name */}
                {editingChapterName === ch.chapter.id ? (
                  <input
                    autoFocus
                    className="font-semibold text-gray-900 dark:text-slate-50 text-sm bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-500 rounded px-1 py-0.5 outline-none w-full"
                    defaultValue={ch.chapter.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => handleChapterNameBlur(ch.chapter.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditingChapterName(null)
                    }}
                  />
                ) : (
                  <span
                    className="font-semibold text-gray-900 dark:text-slate-50 text-sm cursor-text hover:underline flex items-center gap-2"
                    onClick={(e) => { e.stopPropagation(); setEditingChapterName(ch.chapter.id) }}
                    title="Click para editar nombre"
                  >
                    {ch.chapter.name}
                    {ch.chapter.is_legal_text && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded font-normal">texto legal</span>
                    )}
                  </span>
                )}
                <span></span>
                <span></span>
                <span></span>
                <span className="text-right font-bold text-gray-900 dark:text-slate-50 text-sm">
                  {ch.chapter.is_legal_text ? '' : formatCurrency(calcChapterTotal(ch.items))}
                </span>
                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      updateChapter(ch.chapter.id, { is_active: ch.chapter.is_active === false ? true : false })
                    }}
                    className={`p-1 rounded transition ${ch.chapter.is_active === false ? 'text-amber-500 hover:text-amber-600' : 'text-gray-400 hover:text-amber-600'}`}
                    title={ch.chapter.is_active === false ? 'Reactivar capítulo (vuelve a contar en totales)' : 'Desactivar capítulo completo (no contará en totales)'}
                  >
                    {ch.chapter.is_active === false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteChapter(ch.chapter.id) }}
                    className="p-1 text-gray-400 hover:text-red-500 rounded transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Chapter Content */}
              {expandedChapters.has(ch.chapter.id) && (
                <>
                  {/* Legal text chapter — show a description textarea instead of items grid */}
                  {ch.chapter.is_legal_text ? (
                    <div className="px-6 py-4 border-b border-gray-100 bg-amber-50/30">
                      <RichTextEditor
                        content={ch.chapter.description || ''}
                        onChange={(html) => handleChapterDescriptionBlur(ch.chapter.id, html)}
                        placeholder="Escriba aquí el texto legal, condiciones generales, normativa..."
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        Capítulo de texto legal — use la barra de herramientas para dar formato.
                      </p>
                    </div>
                  ) : (
                    /* Normal chapter — show items with drag-and-drop */
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd(ch.chapter.id)}
                    >
                      <SortableContext
                        items={ch.items.map((i) => i.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {ch.items.map((item) => (
                          <SortableItemRow
                            key={item.id}
                            item={item}
                            isExpanded={expandedItems.has(item.id)}
                            onToggleExpand={() => toggleItem(item.id)}
                            isSelected={selectedItems.has(item.id)}
                            onSelect={(e) => handleItemSelect(item.id, e)}
                          />
                        ))}
                      </SortableContext>
                      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
                        <button
                          onClick={() => handleAddItem(ch.chapter.id)}
                          disabled={addingItemToChapter === ch.chapter.id}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded cursor-pointer ml-6 transition disabled:opacity-50 disabled:cursor-wait"
                        >
                          {addingItemToChapter === ch.chapter.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          {addingItemToChapter === ch.chapter.id ? 'Creando...' : 'Añadir partida'}
                        </button>
                        <button
                          onClick={() => setPickLibraryForChapter(ch.chapter.id)}
                          className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2 py-1 rounded cursor-pointer transition"
                        >
                          <Library className="w-3.5 h-3.5" />
                          Desde Biblioteca
                        </button>
                      </div>
                    </DndContext>
                  )}
                </>
              )}
            </div>
              )}
            </SortableChapterRow>
          ))}
            </SortableContext>
          </DndContext>

          {/* Budget Summary */}
          <div className="border-t-2 border-gray-200 bg-gray-50 px-4 py-4">
            <div className="max-w-md ml-auto space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">Presupuesto de Ejecución Material (PEM)</span>
                <span className="font-bold">{formatCurrency(totalPEM)}</span>
              </div>

              {/* IVA toggle */}
              <div className="flex items-center justify-between border-t pt-2">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={ivaEnabled}
                        onChange={(e) => {
                          const newRate = e.target.checked ? 21 : 0
                          updateBudget(activeBudget.budget.id, { tax_rate: newRate })
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-checked:bg-blue-600 rounded-full transition-colors" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                    </div>
                    <span className="text-gray-600">Aplicar IVA</span>
                  </label>
                  {ivaEnabled && (
                    <div className="flex items-center gap-1">
                      <DecimalInput
                        min="0"
                        max="100"
                        value={ivaRate}
                        onChange={(v) => {
                          updateBudget(activeBudget.budget.id, { tax_rate: v })
                        }}
                        className="w-16 px-2 py-0.5 text-sm text-right border border-gray-300 rounded outline-none focus:border-blue-500"
                      />
                      <span className="text-gray-500">%</span>
                    </div>
                  )}
                </div>
                {ivaEnabled && (
                  <span className="text-gray-600">{formatCurrency(iva)}</span>
                )}
              </div>

              {!ivaEnabled && (
                <p className="text-xs text-gray-400 italic">
                  Presupuesto sin IVA. Los importes mostrados corresponden al Presupuesto de Ejecución Material.
                </p>
              )}

              <div className="flex justify-between border-t pt-2 text-lg">
                <span className="font-bold text-gray-900">TOTAL</span>
                <span className="font-bold text-blue-700">{formatCurrency(totalFinal)}</span>
              </div>

              {ivaEnabled && (
                <p className="text-xs text-gray-400 italic">
                  Total con IVA ({ivaRate}%) incluido.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Batch Action Bar (fixed bottom) ─── */}
      {selectedItems.size > 0 && activeBudget && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">
                {selectedItems.size} partida{selectedItems.size !== 1 ? 's' : ''} seleccionada{selectedItems.size !== 1 ? 's' : ''}
              </span>
              <span className="text-sm text-gray-500">
                Total: <span className="font-medium text-gray-900">{formatCurrency(selectedTotal)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Move to chapter */}
              <div className="relative">
                <button
                  onClick={() => setShowMoveMenu(!showMoveMenu)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition shadow-sm"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  Mover a...
                </button>
                {showMoveMenu && (
                  <div className="absolute bottom-full mb-1 right-0 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[200px] z-50">
                    {activeBudget.chapters.filter(ch => !ch.chapter.is_legal_text).map((ch) => (
                      <button
                        key={ch.chapter.id}
                        onClick={() => handleBatchMove(ch.chapter.id)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition flex items-center gap-2"
                      >
                        <span className="font-medium text-blue-700">{ch.chapter.code}</span>
                        <span className="text-gray-700 truncate">{ch.chapter.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Save selected to library */}
              <button
                onClick={handleBatchSaveToLibrary}
                disabled={batchSaving}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 active:bg-purple-200 transition shadow-sm disabled:opacity-50"
              >
                {batchSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
                Guardar en Biblioteca
              </button>
              {/* Delete selected */}
              <button
                onClick={handleBatchDelete}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 active:bg-red-200 transition shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
              {/* Deselect all */}
              <button
                onClick={() => { setSelectedItems(new Set()); setLastClickedItem(null) }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition"
              >
                Deseleccionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Budget from PDF Dialog */}
      {activeBudget && (
        <ImportBudgetDialog
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          budgetId={activeBudget.budget.id}
          projectId={projectId}
          onImportComplete={() => loadFullBudget(activeBudget.budget.id)}
        />
      )}

      {/* Import from Library Dialog (full chapters) */}
      {activeBudget && showLibraryImport && (
        <ImportFromLibraryDialog
          budgetId={activeBudget.budget.id}
          onClose={() => setShowLibraryImport(false)}
          onImported={async () => {
            setShowLibraryImport(false)
            await loadFullBudget(activeBudget.budget.id)
            await autoRenumberAll()
          }}
        />
      )}

      {/* Pick partidas from Library (add to existing chapter) */}
      {activeBudget && pickLibraryForChapter && (
        <PickFromLibraryDialog
          chapterId={pickLibraryForChapter}
          budgetId={activeBudget.budget.id}
          onClose={() => setPickLibraryForChapter(null)}
          onAdded={async () => {
            setPickLibraryForChapter(null)
            await loadFullBudget(activeBudget.budget.id)
            await autoRenumberAll()
          }}
        />
      )}

      {/* PDF Preview Modal */}
      {activeBudget && (
        <BudgetPdfPreviewModal
          isOpen={showPdfPreview}
          onClose={() => setShowPdfPreview(false)}
          budget={activeBudget}
          projectName={activeProject?.name || projectId}
        />
      )}

      {/* Budget Comparison Modal */}
      <BudgetComparisonModal
        isOpen={showComparison}
        onClose={() => setShowComparison(false)}
        budgets={budgets}
        projectId={projectId}
      />

      {/* Chapter Mapping Dialog for batch save to library */}
      <ChapterMappingDialog
        isOpen={showChapterMapping}
        onClose={() => setShowChapterMapping(false)}
        budgetChapters={budgetChaptersForMapping}
        onConfirm={executeBatchSave}
        onConfirmAutoCreate={executeAutoCreateSave}
        loading={batchSaving}
      />

      {/* Close menus when clicking outside — z-20 so it sits BELOW sticky header (z-30) */}
      {(showMoveMenu || showChapterTemplates) && (
        <div className="fixed inset-0 z-20" onClick={() => { setShowMoveMenu(false); setShowChapterTemplates(false) }} />
      )}
    </div>
  )
}
