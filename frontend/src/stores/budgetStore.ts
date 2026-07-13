import { create } from 'zustand'
import api from '@/lib/api'
import { subscribeToBudget, unsubscribeFromBudget } from '@/lib/realtime'
import type { Budget, FullBudget, Chapter, BudgetItem, Measurement, PriceSource } from '@/types'

export type DeleteItemDeps = {
  measurements: number
  breakdown: number
  work_log_links: number
  certifications: number
}

/**
 * Entrada del undo stack para cambios de precio reversibles (Ctrl+Z).
 * Solo guardamos cambios de precio (la feature principal de "consultar
 * presupuesto"); no es un undo generico para cualquier edición.
 */
export type PriceUndoEntry = {
  budget_id: string
  item_id: string
  prev_unit_price: number
  prev_price_source: PriceSource | null | undefined
  timestamp: number
}

interface BudgetState {
  budgets: Budget[]
  activeBudget: FullBudget | null
  loading: boolean
  error: string | null

  /** Partida activa en el editor. Cuando llega un price-pick desde el visor de
   *  referencia, se aplica a esta partida. Null si no hay ninguna seleccionada. */
  activeItemId: string | null

  /** LIFO stack de cambios de precio reversibles con Ctrl+Z. Max 50. */
  priceUndoStack: PriceUndoEntry[]

  // UI state persisted across navigation
  expandedChapters: Set<string>
  expandedItems: Set<string>

  loadBudgets: (projectId: string) => Promise<void>
  loadFullBudget: (budgetId: string) => Promise<void>
  createBudget: (projectId: string, name?: string) => Promise<Budget>
  updateBudget: (budgetId: string, data: Partial<Budget>) => Promise<void>
  deleteBudget: (budgetId: string) => Promise<void>

  // Chapters
  addChapter: (budgetId: string, code: string, name: string, isLegalText?: boolean) => Promise<void>
  updateChapter: (chapterId: string, data: Partial<Chapter>) => Promise<void>
  deleteChapter: (chapterId: string) => Promise<void>
  moveChapter: (chapterId: string, direction: 'up' | 'down') => Promise<void>
  reorderChapters: (orderedIds: string[]) => Promise<void>

  // Items
  addItem: (chapterId: string, data: Partial<BudgetItem>) => Promise<void>
  updateItem: (itemId: string, data: Partial<BudgetItem>) => Promise<void>
  deleteItem: (itemId: string, opts?: { force?: boolean }) => Promise<{ success: true; cascaded?: DeleteItemDeps } | { success: false; dependencies: DeleteItemDeps }>
  duplicateItem: (itemId: string, opts?: { quantity?: number; name_suffix?: string; code_suffix?: string }) => Promise<void>
  reorderItems: (items: { id: string; sort_order: number; chapter_id: string }[]) => Promise<void>

  // Batch operations
  batchMoveItems: (itemIds: string[], targetChapterId: string) => Promise<void>
  autoRenumberAll: () => Promise<void>
  autoRenumberChapters: () => Promise<void>

  // Measurements
  addMeasurement: (itemId: string, data: Partial<Measurement>) => Promise<void>
  updateMeasurement: (measurementId: string, data: Partial<Measurement>) => Promise<void>
  deleteMeasurement: (measurementId: string) => Promise<void>

  // UI state actions
  toggleChapter: (chapterId: string) => void
  toggleItem: (itemId: string) => void
  expandItem: (itemId: string) => void
  initExpandedState: () => void
  setActiveItemId: (itemId: string | null) => void

  // Price undo (Ctrl+Z) — solo para precios importados desde referencia
  applyImportedPrice: (itemId: string, unitPrice: number, source: PriceSource) => Promise<void>
  undoLastPriceChange: () => Promise<boolean>
  clearPriceUndoStack: () => void

  // Workflow
  submitBudget: (budgetId: string) => Promise<void>
  approveBudget: (budgetId: string) => Promise<void>
  rejectBudget: (budgetId: string, reason: string) => Promise<void>
  reopenBudget: (budgetId: string) => Promise<void>

  // Papelera
  trashedBudgets: Budget[]
  loadTrash: (projectId: string) => Promise<void>
  restoreBudget: (budgetId: string) => Promise<void>
  permanentDeleteBudget: (budgetId: string) => Promise<void>

  // Realtime
  stopRealtime: () => void
}

// Cross-window sync: broadcast budget changes so detached comparison popups update live.
const syncChannel: BroadcastChannel | null =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('budget-sync')
    : null

function broadcastFullBudget(fb: FullBudget | null) {
  if (!syncChannel || !fb) return
  try { syncChannel.postMessage({ type: 'full-budget', budget: fb }) } catch {}
}

const MAX_PRICE_UNDO = 50

export const useBudgetStore = create<BudgetState>((set, get) => ({
  budgets: [],
  activeBudget: null,
  trashedBudgets: [],
  loading: false,
  error: null,
  activeItemId: null,
  priceUndoStack: [],
  expandedChapters: new Set(),
  expandedItems: new Set(),

  loadBudgets: async (projectId) => {
    set({ loading: true, budgets: [], activeBudget: null, expandedChapters: new Set(), expandedItems: new Set(), activeItemId: null, priceUndoStack: [] })
    try {
      const { data } = await api.get<Budget[]>(`/budgets/project/${projectId}`)
      set({ budgets: data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  loadFullBudget: async (budgetId) => {
    const prevId = get().activeBudget?.budget.id
    set({ loading: true })
    try {
      const { data } = await api.get<FullBudget>(`/budgets/${budgetId}/full`)
      // Si cambiamos de presupuesto, limpiamos el undo stack (las entradas son
      // por-presupuesto y no tienen sentido al saltar entre ellos).
      const stackReset = prevId && prevId !== budgetId ? { priceUndoStack: [] as PriceUndoEntry[] } : {}
      set({ activeBudget: data, loading: false, ...stackReset })
      broadcastFullBudget(data)
      // Realtime: cuando otro usuario edita este presupuesto recibimos un
      // evento y refrescamos. Debounced en realtime.ts para evitar reloads
      // duplicados con la propia edición local que también gatilla.
      subscribeToBudget(budgetId, () => {
        // Solo recargar si seguimos en el mismo budget.
        if (get().activeBudget?.budget.id === budgetId) {
          api.get<FullBudget>(`/budgets/${budgetId}/full`)
            .then(res => {
              set({ activeBudget: res.data })
              broadcastFullBudget(res.data)
            })
            .catch(() => { /* tolerar fallos transitorios */ })
        }
      })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  stopRealtime: () => {
    unsubscribeFromBudget()
  },

  loadTrash: async (projectId) => {
    const { data } = await api.get<Budget[]>(`/budgets/project/${projectId}/trash`)
    set({ trashedBudgets: data })
  },

  restoreBudget: async (budgetId) => {
    await api.post(`/budgets/${budgetId}/restore`)
    set((s) => ({ trashedBudgets: s.trashedBudgets.filter(b => b.id !== budgetId) }))
  },

  permanentDeleteBudget: async (budgetId) => {
    await api.delete(`/budgets/${budgetId}/permanent`)
    set((s) => ({ trashedBudgets: s.trashedBudgets.filter(b => b.id !== budgetId) }))
  },

  createBudget: async (projectId, name) => {
    const budgets = get().budgets
    const { data } = await api.post<Budget>('/budgets', {
      project_id: projectId,
      name: name || `Presupuesto v${budgets.length + 1}`,
      tax_rate: 21.0,
      overhead_pct: 0,
      profit_pct: 0,
    })
    set({ budgets: [data, ...budgets] })
    return data
  },

  updateBudget: async (budgetId, data) => {
    await api.put(`/budgets/${budgetId}`, data)
    // Update in-memory budget immediately for reactivity
    const active = get().activeBudget
    if (active && active.budget.id === budgetId) {
      set({
        activeBudget: {
          ...active,
          budget: { ...active.budget, ...data },
        },
      })
    }
    // Also update in budgets list
    set({
      budgets: get().budgets.map(b =>
        b.id === budgetId ? { ...b, ...data } : b
      ),
    })
  },

  deleteBudget: async (budgetId) => {
    await api.delete(`/budgets/${budgetId}`)
    const wasActive = get().activeBudget?.budget.id === budgetId
    const remaining = get().budgets.filter((b) => b.id !== budgetId)
    set({ budgets: remaining })
    if (wasActive) {
      if (remaining.length > 0) {
        await get().loadFullBudget(remaining[0].id)
      } else {
        set({ activeBudget: null })
      }
    }
  },

  // Chapters
  addChapter: async (budgetId, code, name, isLegalText = false) => {
    const chapters = get().activeBudget?.chapters || []
    await api.post(`/budgets/${budgetId}/chapters`, {
      code,
      name,
      sort_order: chapters.length + 1,
      is_legal_text: isLegalText,
    })
    await get().loadFullBudget(budgetId)
  },

  updateChapter: async (chapterId, data) => {
    await api.put(`/budgets/chapters/${chapterId}`, data)
    const budget = get().activeBudget
    if (budget) await get().loadFullBudget(budget.budget.id)
  },

  deleteChapter: async (chapterId) => {
    await api.delete(`/budgets/chapters/${chapterId}`)
    const budget = get().activeBudget
    if (budget) await get().loadFullBudget(budget.budget.id)
  },

  moveChapter: async (chapterId, direction) => {
    const budget = get().activeBudget
    if (!budget) return

    const chapters = budget.chapters
    const idx = chapters.findIndex(ch => ch.chapter.id === chapterId)
    if (idx === -1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= chapters.length) return

    // Swap sort_orders between the two chapters
    const currentSortOrder = chapters[idx].chapter.sort_order
    const swapSortOrder = chapters[swapIdx].chapter.sort_order

    await api.put(`/budgets/chapters/${chapters[idx].chapter.id}`, { sort_order: swapSortOrder })
    await api.put(`/budgets/chapters/${chapters[swapIdx].chapter.id}`, { sort_order: currentSortOrder })

    // Reload and renumber chapters + items
    await get().loadFullBudget(budget.budget.id)
    await get().autoRenumberChapters()
  },

  reorderChapters: async (orderedIds) => {
    const budget = get().activeBudget
    if (!budget) return

    // Update sort_order for each chapter based on new position
    for (let i = 0; i < orderedIds.length; i++) {
      await api.put(`/budgets/chapters/${orderedIds[i]}`, { sort_order: i + 1 })
    }

    await get().loadFullBudget(budget.budget.id)
    await get().autoRenumberChapters()
  },

  // Items
  addItem: async (chapterId, data) => {
    await api.post(`/budgets/chapters/${chapterId}/items`, {
      code: data.code || 'NEW',
      name: data.name || 'Nueva partida',
      unit: data.unit || 'ud',
      quantity: data.quantity ?? 1,
      unit_price: data.unit_price ?? 0,
      cost_price: data.cost_price ?? 0,
      sort_order: data.sort_order ?? 0,
      description: data.description || null,
      notes: data.notes || null,
    })
    const budget = get().activeBudget
    if (budget) await get().loadFullBudget(budget.budget.id)
  },

  updateItem: async (itemId, data) => {
    await api.put(`/budgets/items/${itemId}`, data)
    const budget = get().activeBudget
    if (budget) await get().loadFullBudget(budget.budget.id)
  },

  deleteItem: async (itemId, opts) => {
    const force = opts?.force === true
    try {
      // axios.delete soporta body via { data: ... }
      const res = await api.delete(`/budgets/items/${itemId}`, { data: { force } })
      const budget = get().activeBudget
      if (budget) await get().loadFullBudget(budget.budget.id)
      return { success: true as const, cascaded: res.data?.cascaded }
    } catch (err: unknown) {
      // 409: el backend pide confirmacion explicita porque hay datos vinculados
      const e = err as { response?: { status?: number; data?: { dependencies?: DeleteItemDeps } } }
      if (e?.response?.status === 409 && e.response.data?.dependencies) {
        return { success: false as const, dependencies: e.response.data.dependencies }
      }
      throw err
    }
  },

  duplicateItem: async (itemId, opts) => {
    await api.post(`/budgets/items/${itemId}/duplicate`, opts || {})
    const budget = get().activeBudget
    if (budget) await get().loadFullBudget(budget.budget.id)
  },

  reorderItems: async (items) => {
    const budget = get().activeBudget
    if (!budget) return
    await api.put(`/budgets/${budget.budget.id}/reorder`, { items })
    await get().loadFullBudget(budget.budget.id)
  },

  // ─── Batch Operations ───────────────────────────────────
  batchMoveItems: async (itemIds, targetChapterId) => {
    const budget = get().activeBudget
    if (!budget) return

    // Find target chapter to compute sort_order starting point
    const targetChapter = budget.chapters.find(ch => ch.chapter.id === targetChapterId)
    if (!targetChapter) return

    const existingCount = targetChapter.items.length

    const payload = itemIds.map((id, idx) => ({
      id,
      sort_order: existingCount + idx + 1,
      chapter_id: targetChapterId,
    }))

    await api.put(`/budgets/${budget.budget.id}/reorder`, { items: payload })
    await get().loadFullBudget(budget.budget.id)

    // Auto-renumber all chapters after move
    await get().autoRenumberAll()
  },

  autoRenumberAll: async () => {
    const budget = get().activeBudget
    if (!budget) return

    const updates: { id: string; code: string }[] = []

    for (const ch of budget.chapters) {
      for (let i = 0; i < ch.items.length; i++) {
        const expectedCode = `${ch.chapter.code}.${String(i + 1).padStart(2, '0')}`
        if (ch.items[i].code !== expectedCode) {
          updates.push({ id: ch.items[i].id, code: expectedCode })
        }
      }
    }

    if (updates.length > 0) {
      await api.put(`/budgets/${budget.budget.id}/renumber`, { items: updates })
      await get().loadFullBudget(budget.budget.id)
    }
  },

  autoRenumberChapters: async () => {
    const budget = get().activeBudget
    if (!budget) return

    let changed = false
    for (let i = 0; i < budget.chapters.length; i++) {
      const expectedCode = String(i + 1).padStart(2, '0')
      const current = budget.chapters[i].chapter
      if (current.code !== expectedCode) {
        await api.put(`/budgets/chapters/${current.id}`, { code: expectedCode })
        changed = true
      }
    }

    if (changed) {
      // Reload to get updated chapter codes, then renumber items with new prefixes
      await get().loadFullBudget(budget.budget.id)
      await get().autoRenumberAll()
    }
  },

  // Measurements
  addMeasurement: async (itemId, data) => {
    await api.post(`/budgets/items/${itemId}/measurements`, {
      description: data.description || '',
      units: data.units ?? 1,
      length: data.length ?? 0,
      width: data.width ?? 0,
      height: data.height ?? 0,
      partial: data.partial ?? 0,
      sort_order: data.sort_order ?? 0,
    })
    const budget = get().activeBudget
    if (budget) await get().loadFullBudget(budget.budget.id)
  },

  updateMeasurement: async (measurementId, data) => {
    await api.put(`/budgets/measurements/${measurementId}`, data)
    const budget = get().activeBudget
    if (budget) await get().loadFullBudget(budget.budget.id)
  },

  deleteMeasurement: async (measurementId) => {
    await api.delete(`/budgets/measurements/${measurementId}`)
    const budget = get().activeBudget
    if (budget) await get().loadFullBudget(budget.budget.id)
  },

  // ─── UI State Actions ─────────────────────────────────
  toggleChapter: (chapterId) => {
    set((state) => {
      const next = new Set(state.expandedChapters)
      next.has(chapterId) ? next.delete(chapterId) : next.add(chapterId)
      return { expandedChapters: next }
    })
  },

  toggleItem: (itemId) => {
    set((state) => {
      const next = new Set(state.expandedItems)
      next.has(itemId) ? next.delete(itemId) : next.add(itemId)
      return { expandedItems: next }
    })
  },

  expandItem: (itemId) => {
    set((state) => {
      const next = new Set(state.expandedItems)
      next.add(itemId)
      return { expandedItems: next }
    })
  },

  initExpandedState: () => {
    const budget = get().activeBudget
    if (!budget) return

    // Only initialize if expandedChapters is empty (first load or budget change)
    const currentExpanded = get().expandedChapters
    if (currentExpanded.size > 0) return // Preserve existing state

    // Expand all chapters by default
    const chapters = new Set(budget.chapters.map((c) => c.chapter.id))

    // Expand items that have measurements
    const items = new Set<string>()
    for (const ch of budget.chapters) {
      for (const item of ch.items) {
        if (item.measurements && item.measurements.length > 0) {
          items.add(item.id)
        }
      }
    }

    set({ expandedChapters: chapters, expandedItems: items })
  },

  setActiveItemId: (itemId) => set({ activeItemId: itemId }),

  // ─── Price import / undo ──────────────────────────────────
  // Aplica un precio importado desde el visor de referencia:
  //  1. empuja el estado anterior al undo stack,
  //  2. update optimista en memoria (para UI instantánea),
  //  3. PUT al backend con price_source denormalizado,
  //  4. si falla, deshace el update local.
  applyImportedPrice: async (itemId, unitPrice, source) => {
    const budget = get().activeBudget
    if (!budget) return

    let prevItem: BudgetItem | undefined
    for (const ch of budget.chapters) {
      const found = ch.items.find(it => it.id === itemId)
      if (found) { prevItem = found; break }
    }
    if (!prevItem) return

    const entry: PriceUndoEntry = {
      budget_id: budget.budget.id,
      item_id: itemId,
      prev_unit_price: prevItem.unit_price,
      prev_price_source: prevItem.price_source ?? null,
      timestamp: Date.now(),
    }

    const nextStack = [...get().priceUndoStack, entry]
    if (nextStack.length > MAX_PRICE_UNDO) nextStack.splice(0, nextStack.length - MAX_PRICE_UNDO)

    const optimistic = {
      ...budget,
      chapters: budget.chapters.map(ch => ({
        ...ch,
        items: ch.items.map(it => it.id === itemId ? { ...it, unit_price: unitPrice, price_source: source } : it),
      })),
    }
    set({ activeBudget: optimistic, priceUndoStack: nextStack })
    broadcastFullBudget(optimistic)

    try {
      await api.put(`/budgets/items/${itemId}`, { unit_price: unitPrice, price_source: source })
    } catch (err) {
      // Revert local si falla la API
      set({ activeBudget: budget, priceUndoStack: get().priceUndoStack.slice(0, -1) })
      broadcastFullBudget(budget)
      throw err
    }
  },

  undoLastPriceChange: async () => {
    const stack = get().priceUndoStack
    const budget = get().activeBudget
    if (stack.length === 0 || !budget) return false
    const last = stack[stack.length - 1]
    if (last.budget_id !== budget.budget.id) {
      // Stack pertenece a otro presupuesto; lo ignoramos.
      return false
    }

    const reverted = {
      ...budget,
      chapters: budget.chapters.map(ch => ({
        ...ch,
        items: ch.items.map(it => it.id === last.item_id
          ? { ...it, unit_price: last.prev_unit_price, price_source: last.prev_price_source ?? null }
          : it),
      })),
    }
    set({ activeBudget: reverted, priceUndoStack: stack.slice(0, -1) })
    broadcastFullBudget(reverted)

    try {
      await api.put(`/budgets/items/${last.item_id}`, {
        unit_price: last.prev_unit_price,
        price_source: last.prev_price_source ?? null,
      })
      return true
    } catch {
      // No revertimos el revert en este caso: la UI ya muestra el estado anterior,
      // que es lo que el usuario esperaba. Si el servidor sigue desincronizado,
      // un reload posterior lo corregira.
      return true
    }
  },

  clearPriceUndoStack: () => set({ priceUndoStack: [] }),

  // Workflow
  submitBudget: async (budgetId) => {
    await api.put(`/budgets/${budgetId}/submit`)
    await get().loadFullBudget(budgetId)
  },

  approveBudget: async (budgetId) => {
    await api.put(`/budgets/${budgetId}/approve`)
    await get().loadFullBudget(budgetId)
  },

  rejectBudget: async (budgetId, reason) => {
    await api.put(`/budgets/${budgetId}/reject`, { rejection_reason: reason })
    await get().loadFullBudget(budgetId)
  },

  reopenBudget: async (budgetId) => {
    await api.put(`/budgets/${budgetId}/reopen`)
    await get().loadFullBudget(budgetId)
  },
}))
