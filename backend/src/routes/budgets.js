import { Router } from 'express'
import { authMiddleware, projectAccessMiddleware, budgetAccessMiddleware, comparisonAccessMiddleware, comparisonGroupAccessMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'
import { notifyBudgetChange, notifyProjectsChange } from '../services/realtimeBroadcast.js'
import {
  computeSuggestions,
  pickGreedyMatches,
  orderBudgetIds,
} from '../services/budgetMatching.js'

const router = Router()
router.use(authMiddleware)

// ─── Helpers for comparison endpoints ─────────────────────────────
async function loadFullBudgetInternal(budgetId) {
  const { data: budget, error: bErr } = await supabase
    .from('cons_budgets')
    .select('*')
    .eq('id', budgetId)
    .single()
  if (bErr) throw bErr

  const { data: chapters, error: chErr } = await supabase
    .from('cons_chapters')
    .select('*')
    .eq('budget_id', budgetId)
    .order('sort_order')
  if (chErr) throw chErr

  const chapterIds = chapters.map(c => c.id)
  let items = []
  if (chapterIds.length > 0) {
    const { data, error } = await supabase
      .from('cons_budget_items')
      .select('*')
      .in('chapter_id', chapterIds)
      .order('sort_order')
    if (error) throw error
    items = data || []
  }

  return {
    budget,
    chapters: chapters.map(ch => ({
      chapter: ch,
      items: items.filter(it => it.chapter_id === ch.id).map(it => ({ ...it, measurements: [] })),
    })),
  }
}

async function loadComparisonState(budgetAId, budgetBId) {
  const { a, b } = orderBudgetIds(budgetAId, budgetBId)

  const { data: groups, error: gErr } = await supabase
    .from('cons_budget_comparison_groups')
    .select('id, notes, created_at, updated_at')
    .eq('budget_a_id', a)
    .eq('budget_b_id', b)
  if (gErr) throw gErr

  const groupIds = (groups || []).map(g => g.id)
  let groupItems = []
  if (groupIds.length > 0) {
    const { data, error } = await supabase
      .from('cons_budget_comparison_group_items')
      .select('id, group_id, item_id, side')
      .in('group_id', groupIds)
    if (error) throw error
    groupItems = data || []
  }

  const { data: excl, error: eErr } = await supabase
    .from('cons_budget_comparison_exclusions')
    .select('id, item_id')
    .eq('budget_a_id', a)
    .eq('budget_b_id', b)
  if (eErr) throw eErr

  return {
    orderedA: a,
    orderedB: b,
    groups: (groups || []).map(g => ({
      id: g.id,
      notes: g.notes,
      items: groupItems
        .filter(gi => gi.group_id === g.id)
        .map(gi => ({ item_id: gi.item_id, side: gi.side })),
    })),
    exclusions: (excl || []).map(e => ({ id: e.id, item_id: e.item_id })),
  }
}

function collectLinkedItemIds(groups) {
  const out = new Set()
  for (const g of groups) for (const it of g.items) out.add(it.item_id)
  return [...out]
}

// GET /api/budgets/project/:projectId - List budgets for project
router.get('/project/:projectId', projectAccessMiddleware, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_budgets')
      .select('*')
      .eq('project_id', req.params.projectId)
      .is('deleted_at', null)
      .order('version', { ascending: false })

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/budgets/project/:projectId/trash - Presupuestos en papelera
router.get('/project/:projectId/trash', projectAccessMiddleware, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_budgets')
      .select('*')
      .eq('project_id', req.params.projectId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    next(err)
  }
})

// GET /api/budgets/:id/full - Get full budget with chapters and items
router.get('/:id/full', budgetAccessMiddleware('budget'), async (req, res, next) => {
  try {
    const budgetId = req.params.id

    // Get budget
    const { data: budget, error: budgetError } = await supabase
      .from('cons_budgets')
      .select('*')
      .eq('id', budgetId)
      .single()

    if (budgetError) throw budgetError

    // Get chapters
    const { data: chapters, error: chError } = await supabase
      .from('cons_chapters')
      .select('*')
      .eq('budget_id', budgetId)
      .order('sort_order')

    if (chError) throw chError

    // Get all budget items for this budget's chapters
    const chapterIds = chapters.map(c => c.id)
    let items = []
    if (chapterIds.length > 0) {
      const { data: itemsData, error: itemsError } = await supabase
        .from('cons_budget_items')
        .select('*')
        .in('chapter_id', chapterIds)
        .order('sort_order')

      if (itemsError) throw itemsError
      items = itemsData || []
    }

    // Get measurements for all items
    const itemIds = items.map(i => i.id)
    let measurements = []
    if (itemIds.length > 0) {
      const { data: measData, error: measError } = await supabase
        .from('cons_measurements')
        .select('*')
        .in('budget_item_id', itemIds)
        .order('sort_order')

      if (measError) throw measError
      measurements = measData || []
    }

    // Aggregates per item: executed (partes de obra) y certified (certificaciones)
    // Ambas suman sobre TODO el proyecto (no solo este presupuesto) usando budget_item_id.
    const executedByItem = {}
    const certifiedByItem = {}
    if (itemIds.length > 0) {
      const [{ data: execLinks }, { data: certLinks }] = await Promise.all([
        supabase
          .from('cons_work_log_budget_links')
          .select('budget_item_id, executed_quantity')
          .in('budget_item_id', itemIds),
        supabase
          .from('cons_certification_items')
          .select('budget_item_id, certified_quantity')
          .in('budget_item_id', itemIds),
      ])
      ;(execLinks || []).forEach(l => {
        executedByItem[l.budget_item_id] =
          (executedByItem[l.budget_item_id] || 0) + parseFloat(l.executed_quantity || 0)
      })
      ;(certLinks || []).forEach(c => {
        certifiedByItem[c.budget_item_id] =
          (certifiedByItem[c.budget_item_id] || 0) + parseFloat(c.certified_quantity || 0)
      })
    }

    // Assemble the full budget structure
    const chaptersWithItems = chapters.map(chapter => ({
      chapter,
      items: items
        .filter(item => item.chapter_id === chapter.id)
        .map(item => {
          const executed_total = Math.round((executedByItem[item.id] || 0) * 10000) / 10000
          const certified_total = Math.round((certifiedByItem[item.id] || 0) * 10000) / 10000
          const quantity = parseFloat(item.quantity || 0)
          // Pendiente: cuánto queda por asignar. En auxiliares no hay tope → null.
          const remaining = item.is_auxiliary
            ? null
            : Math.max(0, Math.round((quantity - Math.max(executed_total, certified_total)) * 10000) / 10000)
          return {
            ...item,
            measurements: measurements.filter(m => m.budget_item_id === item.id),
            executed_total,
            certified_total,
            remaining,
          }
        }),
    }))

    res.json({ budget, chapters: chaptersWithItems })
  } catch (err) {
    next(err)
  }
})

// POST /api/budgets - Create budget
router.post('/', budgetAccessMiddleware('project', { requireWrite: true }), async (req, res, next) => {
  try {
    const { project_id, name, tax_rate, overhead_pct, profit_pct, notes } = req.body

    const { data, error } = await supabase
      .from('cons_budgets')
      .insert({ project_id, name, tax_rate, overhead_pct, profit_pct, notes })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
    notifyProjectsChange(req.project.organization_id, 'budget-create')
  } catch (err) {
    next(err)
  }
})

// PUT /api/budgets/:id - Update budget (name, tax_rate, etc.)
router.put('/:id', budgetAccessMiddleware('budget', { requireWrite: true }), async (req, res, next) => {
  try {
    const { name, tax_rate, overhead_pct, profit_pct, notes, version } = req.body
    const updates = {}
    if (name !== undefined) updates.name = name
    if (tax_rate !== undefined) updates.tax_rate = tax_rate
    if (overhead_pct !== undefined) updates.overhead_pct = overhead_pct
    if (profit_pct !== undefined) updates.profit_pct = profit_pct
    if (notes !== undefined) updates.notes = notes
    if (version !== undefined) updates.version = version

    const { data, error } = await supabase
      .from('cons_budgets')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
    notifyBudgetChange(req.params.id, 'budget-update')
  } catch (err) {
    next(err)
  }
})

// DELETE /api/budgets/:id - Soft delete (mover a papelera).
router.delete('/:id', budgetAccessMiddleware('budget', { requireWrite: true }), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_budgets')
      .update({ deleted_at: new Date().toISOString(), deleted_by: req.user.id })
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true, soft: true })
    notifyBudgetChange(req.params.id, 'budget-delete')
    notifyProjectsChange(req.project.organization_id, 'budget-delete')
  } catch (err) {
    next(err)
  }
})

// POST /api/budgets/:id/restore - Restaurar presupuesto desde papelera
router.post('/:id/restore', budgetAccessMiddleware('budget', { requireWrite: true }), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_budgets')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
    notifyBudgetChange(req.params.id, 'budget-restore')
    notifyProjectsChange(req.project.organization_id, 'budget-restore')
  } catch (err) {
    next(err)
  }
})

// DELETE /api/budgets/:id/permanent - Eliminación definitiva
router.delete('/:id/permanent', budgetAccessMiddleware('budget', { requireWrite: true }), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_budgets')
      .delete()
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true, hard: true })
    notifyProjectsChange(req.project.organization_id, 'budget-purge')
  } catch (err) {
    next(err)
  }
})

// --- Chapters ---

// POST /api/budgets/:id/chapters
router.post('/:id/chapters', budgetAccessMiddleware('budget', { requireWrite: true }), async (req, res, next) => {
  try {
    const { code, name, description, sort_order, parent_id, is_legal_text } = req.body

    const { data, error } = await supabase
      .from('cons_chapters')
      .insert({ budget_id: req.params.id, code, name, description, sort_order, parent_id, is_legal_text: is_legal_text || false })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
    notifyBudgetChange(req.params.id, 'chapter-create')
  } catch (err) {
    next(err)
  }
})

// PUT /api/budgets/chapters/:chapterId
router.put('/chapters/:chapterId', budgetAccessMiddleware('chapter', { requireWrite: true }), async (req, res, next) => {
  try {
    const { code, name, description, sort_order, is_legal_text, is_active } = req.body
    const updates = {}
    if (code !== undefined) updates.code = code
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (sort_order !== undefined) updates.sort_order = sort_order
    if (is_legal_text !== undefined) updates.is_legal_text = is_legal_text
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error } = await supabase
      .from('cons_chapters')
      .update(updates)
      .eq('id', req.params.chapterId)
      .select()
      .single()

    if (error) throw error
    res.json(data)
    notifyBudgetChange(req.resolvedBudgetId, 'chapter-update')
  } catch (err) {
    next(err)
  }
})

// DELETE /api/budgets/chapters/:chapterId
router.delete('/chapters/:chapterId', budgetAccessMiddleware('chapter', { requireWrite: true }), async (req, res, next) => {
  try {
    const budgetId = req.resolvedBudgetId
    const { error } = await supabase
      .from('cons_chapters')
      .delete()
      .eq('id', req.params.chapterId)

    if (error) throw error
    res.json({ success: true })
    notifyBudgetChange(budgetId, 'chapter-delete')
  } catch (err) {
    next(err)
  }
})

// --- Budget Items ---

// POST /api/budgets/chapters/:chapterId/items
router.post('/chapters/:chapterId/items', budgetAccessMiddleware('chapter', { requireWrite: true }), async (req, res, next) => {
  try {
    const { code, name, description, unit, quantity, unit_price, cost_price, sort_order, notes, is_auxiliary } = req.body

    const { data, error } = await supabase
      .from('cons_budget_items')
      .insert({ chapter_id: req.params.chapterId, code, name, description, unit, quantity, unit_price, cost_price, sort_order, notes, is_auxiliary: !!is_auxiliary })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
    notifyBudgetChange(req.resolvedBudgetId, 'item-create')
  } catch (err) {
    next(err)
  }
})

// POST /api/budgets/chapters/:chapterId/items/from-library
router.post('/chapters/:chapterId/items/from-library', budgetAccessMiddleware('chapter', { requireWrite: true }), async (req, res, next) => {
  try {
    const { partida_ids } = req.body
    if (!Array.isArray(partida_ids) || partida_ids.length === 0) {
      return res.status(400).json({ error: 'partida_ids array is required' })
    }

    // Get the target chapter
    const { data: chapter, error: chErr } = await supabase
      .from('cons_chapters')
      .select('id, code, budget_id')
      .eq('id', req.params.chapterId)
      .single()
    if (chErr) throw chErr

    // Get max sort_order in this chapter
    const { data: existingItems } = await supabase
      .from('cons_budget_items')
      .select('sort_order')
      .eq('chapter_id', chapter.id)
      .order('sort_order', { ascending: false })
      .limit(1)
    const startOrder = (existingItems?.[0]?.sort_order || 0) + 1

    // Fetch selected library partidas
    const { data: partidas, error: pErr } = await supabase
      .from('cons_saved_partidas')
      .select('*')
      .in('id', partida_ids)
      .order('sort_order')
    if (pErr) throw pErr

    if (!partidas || partidas.length === 0) {
      return res.status(404).json({ error: 'No partidas found' })
    }

    // Create budget items from library partidas
    const budgetItems = partidas.map((p, idx) => ({
      chapter_id: chapter.id,
      code: `${chapter.code}.${String(startOrder + idx).padStart(2, '0')}`,
      name: p.name,
      description: p.description || null,
      unit: p.unit,
      quantity: 1,
      unit_price: p.unit_price,
      cost_price: p.cost_price,
      sort_order: startOrder + idx,
      notes: null,
      is_auxiliary: !!p.is_auxiliary,
    }))

    const { error: insertErr } = await supabase
      .from('cons_budget_items')
      .insert(budgetItems)
    if (insertErr) throw insertErr

    // Increment usage_count on each library partida
    for (const p of partidas) {
      await supabase
        .from('cons_saved_partidas')
        .update({ usage_count: (p.usage_count || 0) + 1 })
        .eq('id', p.id)
    }

    res.status(201).json({ success: true, items_created: budgetItems.length })
    notifyBudgetChange(req.resolvedBudgetId, 'items-from-library')
  } catch (err) {
    next(err)
  }
})

// PUT /api/budgets/items/:itemId
router.put('/items/:itemId', budgetAccessMiddleware('item', { requireWrite: true }), async (req, res, next) => {
  try {
    const { code, name, description, unit, quantity, unit_price, cost_price, sort_order, notes, is_active, is_auxiliary, price_source } = req.body
    const updates = {}
    if (code !== undefined) updates.code = code
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (unit !== undefined) updates.unit = unit
    if (quantity !== undefined) updates.quantity = quantity
    if (unit_price !== undefined) updates.unit_price = unit_price
    if (cost_price !== undefined) updates.cost_price = cost_price
    if (sort_order !== undefined) updates.sort_order = sort_order
    if (notes !== undefined) updates.notes = notes
    if (is_active !== undefined) updates.is_active = is_active
    if (is_auxiliary !== undefined) updates.is_auxiliary = !!is_auxiliary
    // price_source: null explicito limpia la traza; objeto la guarda.
    // Requiere: ALTER TABLE cons_budget_items ADD COLUMN price_source JSONB NULL;
    if (price_source !== undefined) updates.price_source = price_source

    const { data, error } = await supabase
      .from('cons_budget_items')
      .update(updates)
      .eq('id', req.params.itemId)
      .select()
      .single()

    if (error) throw error
    res.json(data)
    notifyBudgetChange(req.resolvedBudgetId, 'item-update')
  } catch (err) {
    next(err)
  }
})

// DELETE /api/budgets/items/:itemId
// Body opcional: { force?: boolean } - si false y hay datos vinculados (work
// logs / certificaciones / mediciones / desglose), devuelve 409 con el
// resumen para que la UI pida confirmacion explicita.
router.delete('/items/:itemId', budgetAccessMiddleware('item', { requireWrite: true }), async (req, res, next) => {
  try {
    const itemId = req.params.itemId
    const force = req.body?.force === true

    // Contar dependencias en paralelo
    const [
      { count: measurementsCount },
      { count: breakdownCount },
      { count: workLogLinksCount },
      { count: certItemsCount },
    ] = await Promise.all([
      supabase.from('cons_measurements').select('id', { count: 'exact', head: true }).eq('budget_item_id', itemId),
      supabase.from('cons_price_breakdown').select('id', { count: 'exact', head: true }).eq('budget_item_id', itemId),
      supabase.from('cons_work_log_budget_links').select('id', { count: 'exact', head: true }).eq('budget_item_id', itemId),
      supabase.from('cons_certification_items').select('id', { count: 'exact', head: true }).eq('budget_item_id', itemId),
    ])

    const deps = {
      measurements: measurementsCount || 0,
      breakdown: breakdownCount || 0,
      work_log_links: workLogLinksCount || 0,
      certifications: certItemsCount || 0,
    }
    const hasDeps = deps.measurements || deps.breakdown || deps.work_log_links || deps.certifications

    if (hasDeps && !force) {
      return res.status(409).json({
        error: 'has_dependencies',
        message: 'La partida tiene datos vinculados',
        dependencies: deps,
      })
    }

    const { error } = await supabase
      .from('cons_budget_items')
      .delete()
      .eq('id', itemId)

    if (error) throw error
    res.json({ success: true, cascaded: deps })
    notifyBudgetChange(req.resolvedBudgetId, 'item-delete')
  } catch (err) {
    next(err)
  }
})

// POST /api/budgets/items/:itemId/duplicate
// Body opcional: { quantity?: number, name_suffix?: string, code_suffix?: string }
router.post('/items/:itemId/duplicate', budgetAccessMiddleware('item', { requireWrite: true }), async (req, res, next) => {
  try {
    const { quantity, name_suffix, code_suffix } = req.body || {}

    const { data: original, error: fetchErr } = await supabase
      .from('cons_budget_items')
      .select('*')
      .eq('id', req.params.itemId)
      .single()

    if (fetchErr) throw fetchErr

    const { id: _id, created_at: _c, updated_at: _u, ...itemData } = original
    itemData.code = `${itemData.code}${code_suffix || '_bis'}`
    if (name_suffix) itemData.name = `${itemData.name} ${name_suffix}`
    if (quantity != null && !Number.isNaN(Number(quantity))) {
      itemData.quantity = Number(quantity)
    }

    // sort_order al final del capítulo (max + 1)
    const { data: last } = await supabase
      .from('cons_budget_items')
      .select('sort_order')
      .eq('chapter_id', itemData.chapter_id)
      .order('sort_order', { ascending: false })
      .limit(1)
    itemData.sort_order = (last?.[0]?.sort_order || 0) + 1

    const { data, error } = await supabase
      .from('cons_budget_items')
      .insert(itemData)
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
    notifyBudgetChange(req.resolvedBudgetId, 'item-duplicate')
  } catch (err) {
    next(err)
  }
})

// PUT /api/budgets/:id/reorder - Reorder items
router.put('/:id/reorder', budgetAccessMiddleware('budget', { requireWrite: true }), async (req, res, next) => {
  try {
    const { items } = req.body // Array of { id, sort_order, chapter_id }

    for (const item of items) {
      await supabase
        .from('cons_budget_items')
        .update({ sort_order: item.sort_order, chapter_id: item.chapter_id })
        .eq('id', item.id)
    }

    res.json({ success: true })
    notifyBudgetChange(req.params.id, 'reorder')
  } catch (err) {
    next(err)
  }
})

// PUT /api/budgets/:id/renumber - Batch update item codes after move/reorder
router.put('/:id/renumber', budgetAccessMiddleware('budget', { requireWrite: true }), async (req, res, next) => {
  try {
    const { items } = req.body // Array of { id, code }
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' })
    }

    for (const item of items) {
      await supabase
        .from('cons_budget_items')
        .update({ code: item.code })
        .eq('id', item.id)
    }

    res.json({ success: true, updated: items.length })
    notifyBudgetChange(req.params.id, 'renumber')
  } catch (err) {
    next(err)
  }
})

// --- Measurements ---

// Si la partida tiene mediciones, su cantidad queda gobernada por la suma
// de los `partial`. Si no quedan mediciones, no tocamos quantity (queda
// editable manualmente desde la UI).
async function recomputePartidaQuantityFromMeasurements(itemId) {
  if (!itemId) return
  const { data: rows, error } = await supabase
    .from('cons_measurements')
    .select('partial')
    .eq('budget_item_id', itemId)
  if (error) throw error
  if (!rows || rows.length === 0) return
  const total = rows.reduce((sum, r) => sum + parseFloat(r.partial || 0), 0)
  const rounded = Math.round(total * 1000) / 1000
  const { error: updErr } = await supabase
    .from('cons_budget_items')
    .update({ quantity: rounded })
    .eq('id', itemId)
  if (updErr) throw updErr
}

// POST /api/budgets/items/:itemId/measurements
router.post('/items/:itemId/measurements', budgetAccessMiddleware('item', { requireWrite: true }), async (req, res, next) => {
  try {
    const { description, units, length, width, height, partial, sort_order } = req.body

    const { data, error } = await supabase
      .from('cons_measurements')
      .insert({ budget_item_id: req.params.itemId, description, units, length, width, height, partial, sort_order })
      .select()
      .single()

    if (error) throw error
    await recomputePartidaQuantityFromMeasurements(req.params.itemId)
    res.status(201).json(data)
    notifyBudgetChange(req.resolvedBudgetId, 'measurement-create')
  } catch (err) {
    next(err)
  }
})

// POST /api/budgets/items/:itemId/measurements/bulk - Bulk create measurements for an item
router.post('/items/:itemId/measurements/bulk', budgetAccessMiddleware('item', { requireWrite: true }), async (req, res, next) => {
  try {
    const { measurements } = req.body // Array of { description, units, length, width, height, partial, sort_order }
    if (!measurements || !Array.isArray(measurements) || measurements.length === 0) {
      return res.status(400).json({ error: 'measurements array is required' })
    }

    const inserts = measurements.map((m, idx) => ({
      budget_item_id: req.params.itemId,
      description: m.description || '',
      units: m.units ?? 1,
      length: m.length ?? 0,
      width: m.width ?? 0,
      height: m.height ?? 0,
      partial: m.partial ?? 0,
      sort_order: m.sort_order ?? idx + 1,
    }))

    const { data, error } = await supabase
      .from('cons_measurements')
      .insert(inserts)
      .select()

    if (error) throw error
    await recomputePartidaQuantityFromMeasurements(req.params.itemId)
    res.status(201).json(data)
    notifyBudgetChange(req.resolvedBudgetId, 'measurement-bulk')
  } catch (err) {
    next(err)
  }
})

// PUT /api/budgets/measurements/:measurementId
router.put('/measurements/:measurementId', budgetAccessMiddleware('measurement', { requireWrite: true }), async (req, res, next) => {
  try {
    const { description, units, length, width, height, partial, sort_order } = req.body

    const { data, error } = await supabase
      .from('cons_measurements')
      .update({ description, units, length, width, height, partial, sort_order })
      .eq('id', req.params.measurementId)
      .select()
      .single()

    if (error) throw error
    if (data?.budget_item_id) {
      await recomputePartidaQuantityFromMeasurements(data.budget_item_id)
    }
    res.json(data)
    notifyBudgetChange(req.resolvedBudgetId, 'measurement-update')
  } catch (err) {
    next(err)
  }
})

// DELETE /api/budgets/measurements/:measurementId
router.delete('/measurements/:measurementId', budgetAccessMiddleware('measurement', { requireWrite: true }), async (req, res, next) => {
  try {
    const budgetId = req.resolvedBudgetId
    // Necesitamos saber a qué partida pertenece para recalcular cantidad
    const { data: existing } = await supabase
      .from('cons_measurements')
      .select('budget_item_id')
      .eq('id', req.params.measurementId)
      .single()

    const { error } = await supabase
      .from('cons_measurements')
      .delete()
      .eq('id', req.params.measurementId)

    if (error) throw error
    if (existing?.budget_item_id) {
      await recomputePartidaQuantityFromMeasurements(existing.budget_item_id)
    }
    res.json({ success: true })
    notifyBudgetChange(budgetId, 'measurement-delete')
  } catch (err) {
    next(err)
  }
})

// --- Price Breakdown ---

// GET /api/budgets/items/:itemId/breakdown - Get price breakdown for an item
router.get('/items/:itemId/breakdown', budgetAccessMiddleware('item'), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_price_breakdown')
      .select('*')
      .eq('budget_item_id', req.params.itemId)
      .order('sort_order')
    if (error) throw error
    res.json(data)
  } catch (err) { next(err) }
})

// POST /api/budgets/items/:itemId/breakdown - Add breakdown line
router.post('/items/:itemId/breakdown', budgetAccessMiddleware('item', { requireWrite: true }), async (req, res, next) => {
  try {
    const { resource_type, material_id, description, unit, quantity, unit_cost, sort_order } = req.body
    const { data, error } = await supabase
      .from('cons_price_breakdown')
      .insert({ budget_item_id: req.params.itemId, resource_type, material_id, description, unit, quantity: quantity || 1, unit_cost: unit_cost || 0, sort_order: sort_order || 0 })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(data)
    notifyBudgetChange(req.resolvedBudgetId, 'breakdown-create')
  } catch (err) { next(err) }
})

// PUT /api/budgets/breakdown/:id - Update breakdown line
router.put('/breakdown/:id', budgetAccessMiddleware('breakdown', { requireWrite: true }), async (req, res, next) => {
  try {
    const { resource_type, material_id, description, unit, quantity, unit_cost, sort_order } = req.body
    const { data, error } = await supabase
      .from('cons_price_breakdown')
      .update({ resource_type, material_id, description, unit, quantity, unit_cost, sort_order })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error) throw error
    res.json(data)
    notifyBudgetChange(req.resolvedBudgetId, 'breakdown-update')
  } catch (err) { next(err) }
})

// DELETE /api/budgets/breakdown/:id - Delete breakdown line
router.delete('/breakdown/:id', budgetAccessMiddleware('breakdown', { requireWrite: true }), async (req, res, next) => {
  try {
    const budgetId = req.resolvedBudgetId
    const { error } = await supabase
      .from('cons_price_breakdown')
      .delete()
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
    notifyBudgetChange(budgetId, 'breakdown-delete')
  } catch (err) { next(err) }
})

// --- Import from Library ---

// POST /api/budgets/:id/import-from-library
// Import selected chapters and partidas from the library into a budget
router.post('/:id/import-from-library', budgetAccessMiddleware('budget', { requireWrite: true }), async (req, res, next) => {
  try {
    const budgetId = req.params.id
    const { selections } = req.body
    // selections: [{ library_chapter_id, chapter_name, chapter_code, partida_ids: string[] }]

    if (!selections || !Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: 'selections array is required' })
    }

    // Get existing chapters to determine next sort_order
    const { data: existingChapters } = await supabase
      .from('cons_chapters')
      .select('sort_order')
      .eq('budget_id', budgetId)
      .order('sort_order', { ascending: false })
      .limit(1)

    let nextSortOrder = (existingChapters?.[0]?.sort_order || 0) + 1
    let totalItems = 0

    for (const sel of selections) {
      // Create the budget chapter
      const chapterCode = String(nextSortOrder).padStart(2, '0')
      const { data: newChapter, error: chErr } = await supabase
        .from('cons_chapters')
        .insert({
          budget_id: budgetId,
          code: chapterCode,
          name: sel.chapter_name,
          sort_order: nextSortOrder,
          is_legal_text: false,
        })
        .select()
        .single()

      if (chErr) throw chErr

      // Get the selected partidas from library
      const { data: partidas, error: pErr } = await supabase
        .from('cons_saved_partidas')
        .select('*')
        .in('id', sel.partida_ids)
        .order('code')

      if (pErr) throw pErr

      // Create budget items from partidas
      if (partidas && partidas.length > 0) {
        const budgetItems = partidas.map((p, idx) => ({
          chapter_id: newChapter.id,
          code: `${chapterCode}.${String(idx + 1).padStart(2, '0')}`,
          name: p.name,
          description: p.description || null,
          unit: p.unit,
          quantity: 1,
          unit_price: p.unit_price,
          cost_price: p.cost_price,
          sort_order: idx + 1,
          notes: null,
        }))

        const { error: itemsErr } = await supabase
          .from('cons_budget_items')
          .insert(budgetItems)

        if (itemsErr) throw itemsErr

        totalItems += budgetItems.length

        // Increment usage_count for each used partida
        for (const p of partidas) {
          await supabase
            .from('cons_saved_partidas')
            .update({ usage_count: (p.usage_count || 0) + 1 })
            .eq('id', p.id)
        }
      }

      nextSortOrder++
    }

    res.json({ success: true, chapters_created: selections.length, items_created: totalItems })
  } catch (err) {
    next(err)
  }
})

// --- Budget Workflow ---

// PUT /api/budgets/:id/submit
router.put('/:id/submit', budgetAccessMiddleware('budget', { requireWrite: true }), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_budgets')
      .update({ status: 'pending', submitted_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/budgets/:id/approve
router.put('/:id/approve', budgetAccessMiddleware('budget', { requireWrite: true }), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_budgets')
      .update({
        status: 'approved',
        reviewed_by: req.user.email,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/budgets/:id/reject
router.put('/:id/reject', budgetAccessMiddleware('budget', { requireWrite: true }), async (req, res, next) => {
  try {
    const { rejection_reason } = req.body

    const { data, error } = await supabase
      .from('cons_budgets')
      .update({
        status: 'rejected',
        reviewed_by: req.user.email,
        reviewed_at: new Date().toISOString(),
        rejection_reason,
      })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/budgets/:id/reopen
router.put('/:id/reopen', budgetAccessMiddleware('budget', { requireWrite: true }), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_budgets')
      .update({ status: 'draft', rejection_reason: null })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// ═══════════════════════════════════════════════════════════════════
// COMPARACIÓN DE PRESUPUESTOS
// ═══════════════════════════════════════════════════════════════════

// GET /api/budgets/comparison/:budgetAId/:budgetBId
router.get('/comparison/:budgetAId/:budgetBId', comparisonAccessMiddleware(), async (req, res, next) => {
  try {
    const { budgetAId, budgetBId } = req.params
    if (budgetAId === budgetBId) {
      return res.status(400).json({ error: 'Los presupuestos deben ser distintos' })
    }

    const [fullA, fullB] = await Promise.all([
      loadFullBudgetInternal(budgetAId),
      loadFullBudgetInternal(budgetBId),
    ])

    const state = await loadComparisonState(budgetAId, budgetBId)

    // State items are stored with A/B relative to the ordered pair (lexicographic).
    // Remap side to match the caller's chosen A/B.
    const callerAFirst = budgetAId === state.orderedA
    const groups = state.groups.map(g => ({
      id: g.id,
      notes: g.notes,
      items: g.items.map(it => ({
        item_id: it.item_id,
        side: callerAFirst ? it.side : (it.side === 'A' ? 'B' : 'A'),
      })),
    }))

    const linkedItemIds = collectLinkedItemIds(groups)
    const excludedItemIds = state.exclusions.map(e => e.item_id)

    const suggestions = computeSuggestions({
      fullA, fullB, linkedItemIds, excludedItemIds, minScore: 0.5,
    })

    res.json({
      groups,
      exclusions: excludedItemIds,
      suggestions,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/budgets/comparison/:budgetAId/:budgetBId/groups
// body: { items: [{item_id, side: 'A'|'B'}], notes? }
router.post('/comparison/:budgetAId/:budgetBId/groups', comparisonAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    const { budgetAId, budgetBId } = req.params
    const { items, notes } = req.body
    if (!Array.isArray(items) || items.length < 2) {
      return res.status(400).json({ error: 'Se necesitan al menos 2 partidas' })
    }
    const hasA = items.some(i => i.side === 'A')
    const hasB = items.some(i => i.side === 'B')
    if (!hasA || !hasB) {
      return res.status(400).json({ error: 'El grupo debe tener al menos una partida de cada lado' })
    }

    const { a, b } = orderBudgetIds(budgetAId, budgetBId)
    const callerAFirst = budgetAId === a

    // Map caller side to stored side
    const normalizedItems = items.map(it => ({
      item_id: it.item_id,
      side: callerAFirst ? it.side : (it.side === 'A' ? 'B' : 'A'),
    }))

    // Check no item already linked in another group for this pair
    const itemIds = normalizedItems.map(i => i.item_id)
    const state = await loadComparisonState(budgetAId, budgetBId)
    const alreadyLinked = new Set(collectLinkedItemIds(state.groups))
    const alreadyExcluded = new Set(state.exclusions.map(e => e.item_id))
    const conflicts = itemIds.filter(id => alreadyLinked.has(id) || alreadyExcluded.has(id))
    if (conflicts.length > 0) {
      return res.status(409).json({
        error: 'Alguna partida ya está emparejada o excluida',
        conflicts,
      })
    }

    const { data: group, error: gErr } = await supabase
      .from('cons_budget_comparison_groups')
      .insert({
        budget_a_id: a,
        budget_b_id: b,
        notes: notes || null,
        created_by: req.user?.email || null,
      })
      .select()
      .single()
    if (gErr) throw gErr

    const rows = normalizedItems.map(it => ({
      group_id: group.id,
      item_id: it.item_id,
      side: it.side,
    }))
    const { error: giErr } = await supabase
      .from('cons_budget_comparison_group_items')
      .insert(rows)
    if (giErr) throw giErr

    // Return the group mapped to caller side
    res.json({
      id: group.id,
      notes: group.notes,
      items: items.map(it => ({ item_id: it.item_id, side: it.side })),
    })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/budgets/comparison/groups/:groupId
// body: { add?: [{item_id, side}], remove?: [item_id], notes? }
// Nota: side en add/remove es desde la perspectiva del par originalmente almacenado (A<B)
router.patch('/comparison/groups/:groupId', comparisonGroupAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    const { groupId } = req.params
    const { add, remove, notes } = req.body

    const { data: group, error: gErr } = await supabase
      .from('cons_budget_comparison_groups')
      .select('*')
      .eq('id', groupId)
      .single()
    if (gErr || !group) return res.status(404).json({ error: 'Grupo no encontrado' })

    if (Array.isArray(remove) && remove.length > 0) {
      const { error } = await supabase
        .from('cons_budget_comparison_group_items')
        .delete()
        .eq('group_id', groupId)
        .in('item_id', remove)
      if (error) throw error
    }

    if (Array.isArray(add) && add.length > 0) {
      // Map caller side (from the original budget_a_id ordering already stored)
      const rows = add.map(it => ({
        group_id: groupId,
        item_id: it.item_id,
        side: it.side,
      }))
      const { error } = await supabase
        .from('cons_budget_comparison_group_items')
        .insert(rows)
      if (error) throw error
    }

    if (typeof notes !== 'undefined') {
      const { error } = await supabase
        .from('cons_budget_comparison_groups')
        .update({ notes, updated_at: new Date().toISOString() })
        .eq('id', groupId)
      if (error) throw error
    }

    // Verify group still has at least one of each side; if not, delete it
    const { data: remaining } = await supabase
      .from('cons_budget_comparison_group_items')
      .select('side')
      .eq('group_id', groupId)

    const hasA = (remaining || []).some(r => r.side === 'A')
    const hasB = (remaining || []).some(r => r.side === 'B')
    if (!hasA || !hasB) {
      await supabase.from('cons_budget_comparison_groups').delete().eq('id', groupId)
      return res.json({ id: groupId, deleted: true })
    }

    res.json({ id: groupId, deleted: false })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/budgets/comparison/groups/:groupId
router.delete('/comparison/groups/:groupId', comparisonGroupAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_budget_comparison_groups')
      .delete()
      .eq('id', req.params.groupId)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/budgets/comparison/:budgetAId/:budgetBId/exclusions
// body: { item_id }
router.post('/comparison/:budgetAId/:budgetBId/exclusions', comparisonAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    const { budgetAId, budgetBId } = req.params
    const { item_id } = req.body
    if (!item_id) return res.status(400).json({ error: 'Falta item_id' })

    const { a, b } = orderBudgetIds(budgetAId, budgetBId)

    // Can't exclude an item that's already in a group for this pair
    const state = await loadComparisonState(budgetAId, budgetBId)
    if (collectLinkedItemIds(state.groups).includes(item_id)) {
      return res.status(409).json({ error: 'La partida está en un grupo, deshaz primero el emparejamiento' })
    }

    const { data, error } = await supabase
      .from('cons_budget_comparison_exclusions')
      .insert({ budget_a_id: a, budget_b_id: b, item_id })
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/budgets/comparison/:budgetAId/:budgetBId/exclusions/:itemId
router.delete('/comparison/:budgetAId/:budgetBId/exclusions/:itemId', comparisonAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    const { budgetAId, budgetBId, itemId } = req.params
    const { a, b } = orderBudgetIds(budgetAId, budgetBId)
    const { error } = await supabase
      .from('cons_budget_comparison_exclusions')
      .delete()
      .eq('budget_a_id', a)
      .eq('budget_b_id', b)
      .eq('item_id', itemId)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/budgets/comparison/:budgetAId/:budgetBId/auto-match
// body: { threshold?: number }
router.post('/comparison/:budgetAId/:budgetBId/auto-match', comparisonAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    const { budgetAId, budgetBId } = req.params
    const threshold = typeof req.body?.threshold === 'number' ? req.body.threshold : 0.85
    const { a, b } = orderBudgetIds(budgetAId, budgetBId)
    const callerAFirst = budgetAId === a

    const [fullA, fullB] = await Promise.all([
      loadFullBudgetInternal(budgetAId),
      loadFullBudgetInternal(budgetBId),
    ])

    const state = await loadComparisonState(budgetAId, budgetBId)
    const linkedItemIds = collectLinkedItemIds(state.groups)
    const excludedItemIds = state.exclusions.map(e => e.item_id)

    const suggestions = computeSuggestions({
      fullA, fullB, linkedItemIds, excludedItemIds, minScore: threshold,
    })
    const picks = pickGreedyMatches(suggestions, threshold)

    const createdGroups = []
    for (const p of picks) {
      // Caller-side items: A side = fullA items = from budgetAId
      const callerItems = [
        { item_id: p.item_a_id, side: 'A' },
        { item_id: p.item_b_id, side: 'B' },
      ]
      // Map to stored side
      const stored = callerItems.map(it => ({
        item_id: it.item_id,
        side: callerAFirst ? it.side : (it.side === 'A' ? 'B' : 'A'),
      }))

      const { data: group, error: gErr } = await supabase
        .from('cons_budget_comparison_groups')
        .insert({
          budget_a_id: a,
          budget_b_id: b,
          created_by: req.user?.email || null,
        })
        .select()
        .single()
      if (gErr) throw gErr

      const { error: giErr } = await supabase
        .from('cons_budget_comparison_group_items')
        .insert(stored.map(s => ({ group_id: group.id, ...s })))
      if (giErr) throw giErr

      createdGroups.push({
        id: group.id,
        items: callerItems,
        score: p.score,
        reason: p.reason,
      })
    }

    res.json({ created: createdGroups.length, groups: createdGroups })
  } catch (err) {
    next(err)
  }
})

// ═══════════════════════════════════════════════════════════════════
// CONSULTA DE PRESUPUESTOS DE REFERENCIA (copiar precios entre obras)
// ═══════════════════════════════════════════════════════════════════

// GET /api/budgets/for-reference
// Lista proyectos (de la org + sucursales visibles) con sus presupuestos,
// mas un resumen de la biblioteca. Se usa para poblar el selector del
// visor de presupuesto de referencia.
router.get('/for-reference', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id

    // Proyectos de la organizacion
    const { data: ownProjectsRaw, error: pErr } = await supabase
      .from('cons_projects')
      .select('id, name, client_name, city')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false })
    if (pErr) throw pErr

    const ownProjects = (ownProjectsRaw || []).map(p => ({ ...p, source: 'own', branch_org_name: null }))

    // Proyectos de sucursales vinculadas (lectura).
    // Excluimos los que ya son del propio usuario — la tabla de visibilidad
    // tambien guarda los proyectos que EL usuario comparte con la sucursal,
    // y si no los filtramos aparecerian duplicados.
    const ownIds = new Set(ownProjects.map(p => p.id))
    const [{ data: linksA }, { data: linksB }] = await Promise.all([
      supabase.from('cons_branch_links').select('id, organization_b_id').eq('organization_a_id', orgId),
      supabase.from('cons_branch_links').select('id, organization_a_id').eq('organization_b_id', orgId),
    ])
    // Mapa linkId → orgId del partner (la otra organización).
    const linkPartnerOrg = {}
    for (const l of (linksA || [])) linkPartnerOrg[l.id] = l.organization_b_id
    for (const l of (linksB || [])) linkPartnerOrg[l.id] = l.organization_a_id

    const linkIds = Object.keys(linkPartnerOrg)
    let branchProjects = []
    if (linkIds.length > 0) {
      const { data: visibilities } = await supabase
        .from('cons_branch_project_visibility')
        .select('project_id, branch_link_id')
        .in('branch_link_id', linkIds)
        .eq('visible', true)

      // Mapear projectId → linkId (si hay varias visibilidades por proyecto en
      // distintos vínculos, usamos la primera; el partner_org_id resultante
      // es informativo).
      const projectToLink = {}
      for (const v of (visibilities || [])) {
        if (!projectToLink[v.project_id]) projectToLink[v.project_id] = v.branch_link_id
      }
      const visibleIds = Object.keys(projectToLink).filter(id => !ownIds.has(id))

      if (visibleIds.length > 0) {
        const { data: bp } = await supabase
          .from('cons_projects')
          .select('id, name, client_name, city, organization_id')
          .in('id', visibleIds)
          .neq('organization_id', orgId)

        // Cargar nombres de las orgs partner para etiquetar los proyectos.
        const partnerOrgIds = [...new Set((bp || []).map(p => p.organization_id))]
        let orgMap = {}
        if (partnerOrgIds.length > 0) {
          const { data: orgs } = await supabase
            .from('cons_organizations')
            .select('id, name')
            .in('id', partnerOrgIds)
          orgMap = Object.fromEntries((orgs || []).map(o => [o.id, o.name]))
        }

        branchProjects = (bp || []).map(p => ({
          id: p.id,
          name: p.name,
          client_name: p.client_name,
          city: p.city,
          source: 'branch',
          branch_org_name: orgMap[p.organization_id] || 'Sucursal',
        }))
      }
    }

    // Defensa final: dedupe por id por si alguna fila se coló dos veces.
    const seen = new Set()
    const allProjects = [...ownProjects, ...branchProjects].filter(p => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })
    const projectIds = allProjects.map(p => p.id)

    // Presupuestos de todos esos proyectos
    let budgetsByProject = {}
    if (projectIds.length > 0) {
      const { data: budgets, error: bErr } = await supabase
        .from('cons_budgets')
        .select('id, project_id, name, version, status, tax_rate, updated_at')
        .in('project_id', projectIds)
        .is('deleted_at', null)
        .order('version', { ascending: false })
      if (bErr) throw bErr
      for (const b of (budgets || [])) {
        if (!budgetsByProject[b.project_id]) budgetsByProject[b.project_id] = []
        budgetsByProject[b.project_id].push(b)
      }
    }

    const projectsWithBudgets = allProjects
      .map(p => ({ ...p, budgets: budgetsByProject[p.id] || [] }))
      .filter(p => p.budgets.length > 0)

    // Resumen de biblioteca
    const { count: libraryPartidaCount } = await supabase
      .from('cons_saved_partidas')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)

    res.json({
      projects: projectsWithBudgets,
      library: { partida_count: libraryPartidaCount || 0 },
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/budgets/library-as-budget
// Adapta la biblioteca (cons_library_chapters + cons_saved_partidas) al
// formato FullBudget para que el visor de referencia pueda pintarla con
// el mismo componente que un presupuesto normal.
router.get('/library-as-budget', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id

    const { data: chapters, error: chErr } = await supabase
      .from('cons_library_chapters')
      .select('*')
      .eq('organization_id', orgId)
      .order('sort_order')
    if (chErr) throw chErr

    const { data: partidas, error: pErr } = await supabase
      .from('cons_saved_partidas')
      .select('*')
      .eq('organization_id', orgId)
      .order('sort_order')
      .order('code')
    if (pErr) throw pErr

    // Adaptar a shape de FullBudget
    const chaptersWithItems = (chapters || []).map(ch => ({
      chapter: {
        id: ch.id,
        budget_id: 'library',
        code: ch.code,
        name: ch.name,
        description: null,
        sort_order: ch.sort_order,
        is_legal_text: false,
        is_active: true,
      },
      items: (partidas || [])
        .filter(p => p.library_chapter_id === ch.id)
        .map(p => ({
          id: p.id,
          chapter_id: ch.id,
          code: p.code,
          name: p.name,
          description: p.description,
          unit: p.unit,
          quantity: 1,
          unit_price: parseFloat(p.unit_price || 0),
          cost_price: parseFloat(p.cost_price || 0),
          sort_order: p.sort_order || 0,
          notes: null,
          is_active: true,
          is_auxiliary: !!p.is_auxiliary,
          measurements: [],
        })),
    }))

    // Orphans agrupados
    const orphans = (partidas || []).filter(p => !p.library_chapter_id)
    if (orphans.length > 0) {
      chaptersWithItems.push({
        chapter: {
          id: 'library-orphans',
          budget_id: 'library',
          code: '--',
          name: 'Sin capítulo',
          description: null,
          sort_order: 9999,
          is_legal_text: false,
          is_active: true,
        },
        items: orphans.map(p => ({
          id: p.id,
          chapter_id: 'library-orphans',
          code: p.code,
          name: p.name,
          description: p.description,
          unit: p.unit,
          quantity: 1,
          unit_price: parseFloat(p.unit_price || 0),
          cost_price: parseFloat(p.cost_price || 0),
          sort_order: p.sort_order || 0,
          notes: null,
          is_active: true,
          is_auxiliary: !!p.is_auxiliary,
          measurements: [],
        })),
      })
    }

    res.json({
      budget: {
        id: 'library',
        project_id: 'library',
        name: 'Biblioteca',
        version: 1,
        status: 'library',
        tax_rate: 0,
      },
      chapters: chaptersWithItems,
    })
  } catch (err) {
    next(err)
  }
})

export default router
