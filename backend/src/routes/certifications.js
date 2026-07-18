import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

const router = Router()
router.use(authMiddleware)

// Estados válidos de una certificación (constraint en BD).
const ALLOWED_STATUSES = ['draft', 'submitted', 'approved', 'finalized']

// Valida que certificar `newQtyByItem` (budget_item_id -> cantidad) en el
// presupuesto `budgetId` no supere la cantidad presupuestada, teniendo en cuenta
// lo ya certificado en OTRAS certificaciones del mismo presupuesto. Las partidas
// auxiliares (is_auxiliary) se saltan, igual que en PUT /:id/items/:itemId.
// Devuelve null si todo OK, o un objeto de error 409 si alguna partida se pasa.
async function checkExceedsBudget(budgetId, newQtyByItem, excludeCertId = null) {
  const itemIds = Object.keys(newQtyByItem).filter(id => parseFloat(newQtyByItem[id] || 0) > 0)
  if (itemIds.length === 0) return null

  // Info de las partidas (cantidad presupuestada + flag auxiliar)
  const { data: bis } = await supabase
    .from('cons_budget_items')
    .select('id, quantity, is_auxiliary')
    .in('id', itemIds)
  const biMap = Object.fromEntries((bis || []).map(b => [b.id, b]))

  // Cantidades ya certificadas en OTRAS certificaciones del presupuesto
  const { data: certs } = await supabase
    .from('cons_certifications')
    .select('id')
    .eq('budget_id', budgetId)
  const otherCertIds = (certs || []).map(c => c.id).filter(id => id !== excludeCertId)

  const otherQtyByItem = {}
  if (otherCertIds.length > 0) {
    const { data: otherItems } = await supabase
      .from('cons_certification_items')
      .select('budget_item_id, certified_quantity')
      .in('certification_id', otherCertIds)
    for (const it of (otherItems || [])) {
      otherQtyByItem[it.budget_item_id] =
        (otherQtyByItem[it.budget_item_id] || 0) + parseFloat(it.certified_quantity || 0)
    }
  }

  for (const id of itemIds) {
    const bi = biMap[id]
    if (!bi || bi.is_auxiliary) continue
    const budgetQty = parseFloat(bi.quantity || 0)
    const otherQty = otherQtyByItem[id] || 0
    const newQty = parseFloat(newQtyByItem[id] || 0)
    const maxAllowed = budgetQty - otherQty
    if (newQty > maxAllowed + 1e-6) {
      return {
        error: 'exceeds_budget_total',
        budget_item_id: id,
        max: maxAllowed,
        message: `Máximo permitido: ${maxAllowed.toFixed(2)} (presupuesto: ${budgetQty.toFixed(2)}, certificado en otras: ${otherQty.toFixed(2)}).`,
      }
    }
  }
  return null
}

// GET /api/certifications/project/:projectId/overview
// Returns all certifications for a project with amounts and progress
router.get('/project/:projectId/overview', async (req, res, next) => {
  try {
    const projectId = req.params.projectId

    // Get all budgets for this project
    const { data: budgets, error: budgetsError } = await supabase
      .from('cons_budgets')
      .select('id, name')
      .eq('project_id', projectId)

    if (budgetsError) throw budgetsError
    if (!budgets || budgets.length === 0) return res.json([])

    const budgetIds = budgets.map(b => b.id)
    const budgetMap = Object.fromEntries(budgets.map(b => [b.id, b.name]))

    // Get all certifications for these budgets
    const { data: certs, error: certsError } = await supabase
      .from('cons_certifications')
      .select('*')
      .in('budget_id', budgetIds)
      .order('number', { ascending: true })

    if (certsError) throw certsError
    if (!certs || certs.length === 0) return res.json([])

    // Get all certification items (only need quantities — amounts recalculated from prices)
    const certIds = certs.map(c => c.id)
    const { data: allItems, error: itemsError } = await supabase
      .from('cons_certification_items')
      .select('certification_id, budget_item_id, certified_quantity')
      .in('certification_id', certIds)

    if (itemsError) throw itemsError

    // Get all unique budget_item_ids and look up their unit prices
    const allBudgetItemIds = [...new Set((allItems || []).map(i => i.budget_item_id))]
    const priceMap = {}
    if (allBudgetItemIds.length > 0) {
      const { data: biPrices } = await supabase
        .from('cons_budget_items')
        .select('id, unit_price')
        .in('id', allBudgetItemIds)
      for (const bi of (biPrices || [])) {
        priceMap[bi.id] = bi.unit_price || 0
      }
    }

    // Get budget totals (solo capítulos y partidas activas)
    const budgetTotals = {}
    for (const budgetId of budgetIds) {
      const { data: activeChapters } = await supabase
        .from('cons_chapters')
        .select('id')
        .eq('budget_id', budgetId)
        .eq('is_active', true)

      const activeChapterIds = (activeChapters || []).map(c => c.id)
      if (activeChapterIds.length === 0) {
        budgetTotals[budgetId] = 0
        continue
      }

      const { data: budgetItems } = await supabase
        .from('cons_budget_items')
        .select('quantity, unit_price, chapter_id')
        .in('chapter_id', activeChapterIds)
        .eq('is_active', true)

      budgetTotals[budgetId] = (budgetItems || []).reduce(
        (sum, item) => sum + item.quantity * item.unit_price, 0
      )
    }

    // Group items by cert
    const itemsByCert = {}
    for (const item of (allItems || [])) {
      if (!itemsByCert[item.certification_id]) itemsByCert[item.certification_id] = []
      itemsByCert[item.certification_id].push(item)
    }

    // Build overview — recalculate amounts from certified_quantity × unit_price
    // Use running cumulative totals per budget to compute "anterior" correctly
    const sortedCerts = [...certs].sort((a, b) => a.number - b.number)
    const cumulativeByBudget = {} // budget_id → running cumulative certified amount

    const overview = sortedCerts.map(cert => {
      const items = itemsByCert[cert.id] || []
      const current_amount = items.reduce((s, i) =>
        s + (i.certified_quantity || 0) * (priceMap[i.budget_item_id] || 0), 0)

      const previous_amount = cumulativeByBudget[cert.budget_id] || 0
      const total_certified = previous_amount + current_amount

      // Update running cumulative
      cumulativeByBudget[cert.budget_id] = total_certified

      const budget_total = budgetTotals[cert.budget_id] || 0
      const progress_pct = budget_total > 0 ? (total_certified / budget_total) * 100 : 0

      return {
        id: cert.id,
        budget_id: cert.budget_id,
        number: cert.number,
        name: cert.name,
        status: cert.status,
        period_start: cert.period_start,
        period_end: cert.period_end,
        created_at: cert.created_at,
        budget_name: budgetMap[cert.budget_id] || '',
        current_amount,
        previous_amount,
        total_certified,
        budget_total,
        progress_pct,
      }
    })

    res.json(overview)
  } catch (err) {
    next(err)
  }
})

// GET /api/certifications/budget/:budgetId
router.get('/budget/:budgetId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_certifications')
      .select('*')
      .eq('budget_id', req.params.budgetId)
      .order('number', { ascending: true })

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/certifications
router.post('/', async (req, res, next) => {
  try {
    const { budget_id, name, period_start, period_end, notes, items } = req.body

    // Validar que ninguna partida supere lo presupuestado ANTES de crear nada
    // (misma comprobación que PUT /:id/items/:itemId). Evita dejar una cert huérfana.
    if (items && items.length > 0) {
      const newQtyByItem = {}
      for (const it of items) {
        newQtyByItem[it.budget_item_id] =
          (newQtyByItem[it.budget_item_id] || 0) + parseFloat(it.certified_quantity || 0)
      }
      const exceed = await checkExceedsBudget(budget_id, newQtyByItem)
      if (exceed) return res.status(409).json(exceed)
    }

    // Get next certification number
    const { data: existing } = await supabase
      .from('cons_certifications')
      .select('number')
      .eq('budget_id', budget_id)
      .order('number', { ascending: false })
      .limit(1)

    const nextNumber = (existing?.[0]?.number || 0) + 1

    const { data: cert, error: certError } = await supabase
      .from('cons_certifications')
      .insert({ budget_id, number: nextNumber, name, period_start, period_end, notes })
      .select()
      .single()

    if (certError) throw certError

    // Insert certification items if provided
    if (items && items.length > 0) {
      // 1. Get previous certification items first to know ALL budget_item_ids we need prices for
      const prevMap = {}
      const { data: prevCerts } = await supabase
        .from('cons_certifications')
        .select('id')
        .eq('budget_id', budget_id)
        .neq('id', cert.id)

      let prevItemIds = []
      if (prevCerts && prevCerts.length > 0) {
        const { data: prevItems } = await supabase
          .from('cons_certification_items')
          .select('budget_item_id, certified_quantity')
          .in('certification_id', prevCerts.map(c => c.id))

        // Collect all previous budget_item_ids
        prevItemIds = (prevItems || []).map(p => p.budget_item_id)

        // Aggregate quantities per budget_item_id (amounts will be recalculated from prices)
        for (const p of (prevItems || [])) {
          if (!prevMap[p.budget_item_id]) prevMap[p.budget_item_id] = { qty: 0 }
          prevMap[p.budget_item_id].qty += (p.certified_quantity || 0)
        }
      }

      // 2. Look up unit prices for ALL budget items (current + previous)
      const currentItemIds = items.map(i => i.budget_item_id)
      const allItemIds = [...new Set([...currentItemIds, ...prevItemIds])]

      const { data: budgetItemsData } = await supabase
        .from('cons_budget_items')
        .select('id, unit_price')
        .in('id', allItemIds)

      const priceMap = Object.fromEntries(
        (budgetItemsData || []).map(bi => [bi.id, bi.unit_price || 0])
      )

      // 3. Build certification items with correct previous amounts (recalculated from qty * price)
      const certItems = items.map(item => {
        const unitPrice = priceMap[item.budget_item_id] || 0
        const prevQty = prevMap[item.budget_item_id]?.qty || 0
        const prevAmt = prevQty * (priceMap[item.budget_item_id] || 0)
        return {
          certification_id: cert.id,
          budget_item_id: item.budget_item_id,
          certified_quantity: item.certified_quantity || 0,
          certified_amount: (item.certified_quantity || 0) * unitPrice,
          previous_quantity: prevQty,
          previous_amount: prevAmt,
        }
      })

      await supabase.from('cons_certification_items').insert(certItems)
    }

    res.status(201).json(cert)
  } catch (err) {
    next(err)
  }
})

// GET /api/certifications/:id/summary
router.get('/:id/summary', async (req, res, next) => {
  try {
    const certId = req.params.id

    const { data: cert, error: certError } = await supabase
      .from('cons_certifications')
      .select('*')
      .eq('id', certId)
      .single()

    if (certError) throw certError

    // Get certification items with budget item + chapter details via JOIN
    const { data: items, error: itemsError } = await supabase
      .from('cons_certification_items')
      .select(`
        *,
        budget_item:cons_budget_items (
          id, code, name, description, unit, quantity, unit_price, is_auxiliary,
          chapter:cons_chapters (
            id, code, name
          )
        )
      `)
      .eq('certification_id', certId)

    if (itemsError) throw itemsError

    // Query ALL previous certification items to recalculate "anterior" from real quantities.
    // We need both:
    //   · prevMap[budget_item_id] → qty (used per-row "Anterior" column).
    //   · total_previous_full → € sum across ALL items in previous certs (NOT only those that
    //     also appear in this cert), so the "Anterior" KPI is correct even when this cert
    //     covers different partidas than previous ones.
    const prevMap = {}
    let total_previous_full = 0
    const { data: prevCerts } = await supabase
      .from('cons_certifications')
      .select('id')
      .eq('budget_id', cert.budget_id)
      .neq('id', certId)
      .lt('number', cert.number) // only certs with lower number = truly previous

    if (prevCerts && prevCerts.length > 0) {
      const { data: prevItems } = await supabase
        .from('cons_certification_items')
        .select('budget_item_id, certified_quantity, budget_item:cons_budget_items(unit_price)')
        .in('certification_id', prevCerts.map(c => c.id))

      for (const p of (prevItems || [])) {
        const qty = parseFloat(p.certified_quantity || 0)
        const price = parseFloat(p.budget_item?.unit_price || 0)
        if (!prevMap[p.budget_item_id]) prevMap[p.budget_item_id] = 0
        prevMap[p.budget_item_id] += qty
        total_previous_full += qty * price
      }
    }

    // Fetch work-log links grouped by certification_item_id for badge/UI
    const certItemIds = (items || []).map(i => i.id)
    const linksByCertItem = {}
    if (certItemIds.length > 0) {
      const { data: wllRows } = await supabase
        .from('cons_certification_work_log_links')
        .select('id, certification_item_id, work_log_id, consumed_quantity, work_log_budget_link_id')
        .in('certification_item_id', certItemIds)
      const logIds = [...new Set((wllRows || []).map(l => l.work_log_id))]
      let logMap = {}
      if (logIds.length > 0) {
        const { data: logRows } = await supabase
          .from('cons_work_logs')
          .select('id, date, description')
          .in('id', logIds)
        logMap = Object.fromEntries((logRows || []).map(l => [l.id, l]))
      }
      for (const wll of (wllRows || [])) {
        const log = logMap[wll.work_log_id] || {}
        if (!linksByCertItem[wll.certification_item_id]) linksByCertItem[wll.certification_item_id] = []
        linksByCertItem[wll.certification_item_id].push({
          id: wll.id,
          work_log_id: wll.work_log_id,
          work_log_date: log.date || null,
          work_log_description: log.description || null,
          consumed_quantity: parseFloat(wll.consumed_quantity || 0),
          work_log_budget_link_id: wll.work_log_budget_link_id,
        })
      }
    }

    // Enrich items with flattened budget/chapter fields for the PDF export
    // RECALCULATE amounts from quantities × unit_price (don't trust stored amounts)
    const enrichedItems = (items || []).map(item => {
      const bi = item.budget_item || {}
      const ch = bi.chapter || {}
      const unitPrice = bi.unit_price || 0
      const prevQty = prevMap[item.budget_item_id] || 0
      return {
        ...item,
        item_code: bi.code || '',
        item_name: bi.name || '',
        item_unit: bi.unit || '',
        item_quantity: bi.quantity || 0,
        item_unit_price: unitPrice,
        is_auxiliary: !!bi.is_auxiliary,
        chapter_id: ch.id || null,
        chapter_code: ch.code || '',
        chapter_name: ch.name || '',
        // Recalculate from actual data — handles old certs with stored 0s
        certified_amount: (item.certified_quantity || 0) * unitPrice,
        previous_quantity: prevQty,
        previous_amount: prevQty * unitPrice,
        certified_pct: (bi.quantity && bi.quantity > 0)
          ? (item.certified_quantity || 0) / bi.quantity * 100
          : 0,
        work_log_links: linksByCertItem[item.id] || [],
      }
    })

    // Totals recalculated from quantities × prices.
    // total_previous = full cumulative across ALL prior certs (covers partidas that
    // this cert may not include); not just sum of per-row previous_amount.
    const total_current = enrichedItems.reduce((sum, i) => sum + (i.certified_amount || 0), 0)
    const total_previous = total_previous_full
    const total_certified = total_current + total_previous // cumulative "a origen"

    // Calculate budget total for pending (solo capítulos y partidas activas)
    const budgetId = cert.budget_id
    const { data: chapters } = await supabase
      .from('cons_chapters')
      .select('id')
      .eq('budget_id', budgetId)
      .eq('is_active', true)

    let budgetTotal = 0
    if (chapters && chapters.length > 0) {
      const chapterIds = chapters.map(c => c.id)
      const { data: budgetItems } = await supabase
        .from('cons_budget_items')
        .select('quantity, unit_price')
        .in('chapter_id', chapterIds)
        .eq('is_active', true)

      budgetTotal = (budgetItems || []).reduce(
        (sum, bi) => sum + (bi.quantity || 0) * (bi.unit_price || 0), 0
      )
    }

    res.json({
      certification: cert,
      items: enrichedItems,
      total_certified,   // cumulative "a origen"
      total_previous,    // sum from prior certifications
      total_current,     // this certification only (incremental)
      total_pending: budgetTotal - total_certified,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/certifications/budget/:budgetId/certified-totals
// Returns cumulative certified quantities per budget_item_id across ALL certifications for a budget
router.get('/budget/:budgetId/certified-totals', async (req, res, next) => {
  try {
    const budgetId = req.params.budgetId

    // Get all certifications for this budget
    const { data: certs, error: certsError } = await supabase
      .from('cons_certifications')
      .select('id')
      .eq('budget_id', budgetId)

    if (certsError) throw certsError
    if (!certs || certs.length === 0) return res.json({})

    // Get all certification items
    const { data: items, error: itemsError } = await supabase
      .from('cons_certification_items')
      .select('budget_item_id, certified_quantity, certified_amount')
      .in('certification_id', certs.map(c => c.id))

    if (itemsError) throw itemsError

    // Aggregate per budget_item_id
    const totals = {}
    for (const item of (items || [])) {
      if (!totals[item.budget_item_id]) {
        totals[item.budget_item_id] = { quantity: 0, amount: 0 }
      }
      totals[item.budget_item_id].quantity += (item.certified_quantity || 0)
      totals[item.budget_item_id].amount += (item.certified_amount || 0)
    }

    res.json(totals)
  } catch (err) {
    next(err)
  }
})

// PUT /api/certifications/:id/items/:itemId
// Edits the certified quantity for a single item in a DRAFT certification.
// - Recalculates amount from price (don't trust client).
// - Validates against budget total (skipped for auxiliary).
// - If there are linked work-log entries:
//     · Reducing → proportional reduction across all links (rows that hit 0 are deleted).
//     · Increasing → consumes residual from existing linked partes (FIFO by created order).
// - newQty === 0 deletes the cert_item and all its work-log links.
router.put('/:id/items/:itemId', async (req, res, next) => {
  try {
    const certId = req.params.id
    const itemId = req.params.itemId
    const newQty = parseFloat(req.body.certified_quantity ?? 0)
    if (!Number.isFinite(newQty) || newQty < 0) {
      return res.status(400).json({ error: 'invalid_quantity' })
    }

    // 1. Cert must exist and be draft
    const { data: cert, error: certError } = await supabase
      .from('cons_certifications')
      .select('id, budget_id, status')
      .eq('id', certId)
      .single()
    if (certError || !cert) return res.status(404).json({ error: 'cert_not_found' })
    if (cert.status !== 'draft') {
      return res.status(409).json({
        error: 'only_draft_editable',
        message: 'Solo se pueden editar partidas en certificaciones en borrador.',
      })
    }

    // 2. Cert item must belong to this cert
    const { data: item, error: itemError } = await supabase
      .from('cons_certification_items')
      .select('id, certification_id, budget_item_id, certified_quantity')
      .eq('id', itemId)
      .single()
    if (itemError || !item) return res.status(404).json({ error: 'item_not_found' })
    if (item.certification_id !== certId) return res.status(400).json({ error: 'item_does_not_belong_to_cert' })

    // 3. Budget item info (price, total qty, auxiliary flag)
    const { data: bi, error: biError } = await supabase
      .from('cons_budget_items')
      .select('id, unit_price, quantity, is_auxiliary')
      .eq('id', item.budget_item_id)
      .single()
    if (biError || !bi) return res.status(404).json({ error: 'budget_item_not_found' })

    // 4. Existing work-log links for THIS cert_item
    const { data: links } = await supabase
      .from('cons_certification_work_log_links')
      .select('id, work_log_budget_link_id, consumed_quantity')
      .eq('certification_item_id', itemId)
      .order('id', { ascending: true })

    const oldQty = parseFloat(item.certified_quantity || 0)
    const delta = newQty - oldQty
    const unitPrice = parseFloat(bi.unit_price || 0)

    // ─── 5. Special case: newQty === 0 → delete item + links ───
    if (newQty <= 1e-6) {
      if (links && links.length > 0) {
        await supabase.from('cons_certification_work_log_links')
          .delete()
          .eq('certification_item_id', itemId)
      }
      await supabase.from('cons_certification_items').delete().eq('id', itemId)
      return res.json({ deleted: true })
    }

    // ─── 6. Validate against budget total (skip for auxiliary) ───
    if (!bi.is_auxiliary) {
      const { data: otherCerts } = await supabase
        .from('cons_certifications')
        .select('id')
        .eq('budget_id', cert.budget_id)
        .neq('id', certId)
      let otherQty = 0
      if (otherCerts && otherCerts.length > 0) {
        const { data: otherItems } = await supabase
          .from('cons_certification_items')
          .select('certified_quantity')
          .in('certification_id', otherCerts.map(c => c.id))
          .eq('budget_item_id', item.budget_item_id)
        otherQty = (otherItems || []).reduce(
          (s, x) => s + parseFloat(x.certified_quantity || 0), 0
        )
      }
      const budgetQty = parseFloat(bi.quantity || 0)
      const maxAllowed = budgetQty - otherQty
      if (newQty > maxAllowed + 1e-6) {
        return res.status(409).json({
          error: 'exceeds_budget_total',
          max: maxAllowed,
          message: `Máximo permitido: ${maxAllowed.toFixed(2)} (presupuesto: ${budgetQty.toFixed(2)}, certificado en otras: ${otherQty.toFixed(2)}).`,
        })
      }
    }

    // ─── 7. Adjust work-log links if any ───
    if (links && links.length > 0) {
      if (delta < -1e-6) {
        // REDUCE → proportional reduction
        const totalLinkQty = links.reduce(
          (s, l) => s + parseFloat(l.consumed_quantity || 0), 0
        )
        if (totalLinkQty > 0) {
          const factor = newQty / totalLinkQty
          for (const link of links) {
            const newConsumed = parseFloat(link.consumed_quantity || 0) * factor
            if (newConsumed <= 1e-6) {
              await supabase.from('cons_certification_work_log_links')
                .delete().eq('id', link.id)
            } else {
              await supabase.from('cons_certification_work_log_links')
                .update({ consumed_quantity: newConsumed })
                .eq('id', link.id)
            }
          }
        }
      } else if (delta > 1e-6) {
        // INCREASE strategy (the budget total already passed step 6, so the increase is allowed):
        //   1. Consume free residual from already-linked partes (FIFO) without touching their executed.
        //   2. If still short, raise executed_quantity on the FIRST linked parte to absorb the rest,
        //      bumping its consumed_quantity in lockstep. Keeps invariant executed ≥ consumed.
        const linkIds = links.map(l => l.work_log_budget_link_id)
        const { data: wllRows } = await supabase
          .from('cons_work_log_budget_links')
          .select('id, executed_quantity, work_log_id')
          .in('id', linkIds)
        const wllMap = Object.fromEntries((wllRows || []).map(l => [l.id, l]))

        // Total consumed across ALL certs per work_log_budget_link_id
        const { data: allConsumed } = await supabase
          .from('cons_certification_work_log_links')
          .select('work_log_budget_link_id, consumed_quantity')
          .in('work_log_budget_link_id', linkIds)
        const consumedByLink = {}
        for (const c of (allConsumed || [])) {
          consumedByLink[c.work_log_budget_link_id] =
            (consumedByLink[c.work_log_budget_link_id] || 0) +
            parseFloat(c.consumed_quantity || 0)
        }

        // Phase 1: free residual on linked partes
        let needed = delta
        const consumedUpdates = {} // link.id → new_consumed
        for (const link of links) {
          if (needed <= 1e-6) break
          const wll = wllMap[link.work_log_budget_link_id]
          if (!wll) continue
          const executed = parseFloat(wll.executed_quantity || 0)
          const totalConsumed = consumedByLink[link.work_log_budget_link_id] || 0
          const linkResidual = executed - totalConsumed
          if (linkResidual <= 1e-6) continue
          const take = Math.min(needed, linkResidual)
          consumedUpdates[link.id] = parseFloat(link.consumed_quantity || 0) + take
          needed -= take
        }

        // Phase 2: if still short, expand the first linked parte (executed_quantity ↑)
        const executedUpdates = {} // wll.id → new_executed
        if (needed > 1e-6) {
          const firstLink = links[0]
          const wll = firstLink ? wllMap[firstLink.work_log_budget_link_id] : null
          if (!firstLink || !wll) {
            return res.status(409).json({
              error: 'cannot_expand_parte',
              message: 'No se pudo ampliar el parte vinculado para absorber el aumento.',
            })
          }
          const newExecuted = parseFloat(wll.executed_quantity || 0) + needed
          executedUpdates[firstLink.work_log_budget_link_id] = newExecuted
          // Bump consumed on the same link by the same amount (executed and consumed grow together)
          const baseConsumed = (consumedUpdates[firstLink.id] !== undefined)
            ? consumedUpdates[firstLink.id]
            : parseFloat(firstLink.consumed_quantity || 0)
          consumedUpdates[firstLink.id] = baseConsumed + needed
          needed = 0
        }

        // Apply executed_quantity bumps first (so subsequent reads see fresh data)
        for (const [wllId, newExecuted] of Object.entries(executedUpdates)) {
          await supabase.from('cons_work_log_budget_links')
            .update({ executed_quantity: newExecuted })
            .eq('id', wllId)
        }
        // Apply consumed_quantity updates
        for (const [linkId, newConsumed] of Object.entries(consumedUpdates)) {
          await supabase.from('cons_certification_work_log_links')
            .update({ consumed_quantity: newConsumed })
            .eq('id', linkId)
        }
      }
      // delta === 0: nothing to do
    }

    // ─── 8. Update cert item ───
    const { data: updated, error: updError } = await supabase
      .from('cons_certification_items')
      .update({
        certified_quantity: newQty,
        certified_amount: newQty * unitPrice,
      })
      .eq('id', itemId)
      .select()
      .single()
    if (updError) throw updError
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// PUT /api/certifications/:id/status
router.put('/:id/status', async (req, res, next) => {
  try {
    const { status, invoice_number } = req.body

    // B3: validar el estado destino ANTES de tocar la BD (si no, el constraint
    // de MariaDB revienta con un 500 filtrando su nombre interno).
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'invalid_status',
        message: `Estado no válido: ${status}. Válidos: ${ALLOWED_STATUSES.join(', ')}.`,
      })
    }

    // M3: leer el estado actual para validar la transición. Una certificación
    // finalizada (facturada) es terminal: no puede volver a otro estado, o si no
    // se podría revertir a 'draft' y borrar una cert ya facturada (el guard de
    // DELETE solo mira el estado actual).
    const { data: current, error: curErr } = await supabase
      .from('cons_certifications')
      .select('status')
      .eq('id', req.params.id)
      .single()
    if (curErr || !current) return res.status(404).json({ error: 'cert_not_found' })
    if (current.status === 'finalized' && status !== 'finalized') {
      return res.status(409).json({
        error: 'cannot_revert_finalized',
        message: 'Una certificación finalizada (facturada) no puede volver a otro estado.',
      })
    }

    const updateData = { status, updated_at: new Date().toISOString() }
    // When finalizing, also store the invoice number and finalized_at date
    if (status === 'finalized') {
      updateData.invoice_number = invoice_number || null
      updateData.finalized_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('cons_certifications')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error

    // ─── Auto-update project status when certification is finalized ───
    // cons_certifications NO tiene project_id: se deriva desde el presupuesto.
    if (status === 'finalized' && data.budget_id) {
      try {
        // Derivar el proyecto desde el presupuesto de la certificación
        const { data: budgetRow } = await supabase
          .from('cons_budgets')
          .select('project_id')
          .eq('id', data.budget_id)
          .single()
        const projectId = budgetRow?.project_id

        if (projectId) {
          // Todos los presupuestos del proyecto
          const { data: projBudgets } = await supabase
            .from('cons_budgets')
            .select('id')
            .eq('project_id', projectId)
          const budgetIds = (projBudgets || []).map(b => b.id)

          if (budgetIds.length > 0) {
            // Total presupuestado (solo capítulos y partidas activas), como en el resto del fichero
            let budgetTotal = 0
            const { data: activeChapters } = await supabase
              .from('cons_chapters')
              .select('id')
              .in('budget_id', budgetIds)
              .eq('is_active', true)
            const activeChapterIds = (activeChapters || []).map(c => c.id)
            if (activeChapterIds.length > 0) {
              const { data: budgetItems } = await supabase
                .from('cons_budget_items')
                .select('quantity, unit_price')
                .in('chapter_id', activeChapterIds)
                .eq('is_active', true)
              budgetTotal = (budgetItems || []).reduce(
                (s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0
              )
            }

            // Certificaciones finalizadas de estos presupuestos
            const { data: finalizedCerts } = await supabase
              .from('cons_certifications')
              .select('id')
              .in('budget_id', budgetIds)
              .eq('status', 'finalized')
            const finalizedIds = (finalizedCerts || []).map(c => c.id)

            if (finalizedIds.length > 0 && budgetTotal > 0) {
              // Sumar directamente la columna certified_amount (ya es qty × unit_price)
              const { data: certItems } = await supabase
                .from('cons_certification_items')
                .select('certified_amount')
                .in('certification_id', finalizedIds)
              const totalCertified = (certItems || []).reduce(
                (s, ci) => s + parseFloat(ci.certified_amount || 0), 0
              )
              const progressPct = (totalCertified / budgetTotal) * 100

              // If >= 99.5% certified, mark project as completed
              if (progressPct >= 99.5) {
                await supabase
                  .from('cons_projects')
                  .update({ status: 'completed', updated_at: new Date().toISOString() })
                  .eq('id', projectId)
              }
            }
          }
        }
      } catch (autoErr) {
        // Non-critical: log but don't fail the certification update
        console.warn('Auto-update project status failed:', autoErr.message)
      }
    }

    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/certifications/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { data: cert } = await supabase
      .from('cons_certifications')
      .select('status')
      .eq('id', req.params.id)
      .single()

    if (cert && cert.status === 'finalized') {
      return res.status(409).json({
        error: 'cannot_delete_finalized',
        message: 'No se puede borrar una certificación finalizada.',
      })
    }

    const { error } = await supabase
      .from('cons_certifications')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/certifications/from-work-logs
// Creates a certification from selected work log budget links
router.post('/from-work-logs', async (req, res, next) => {
  let createdCertId = null
  try {
    const { budget_id, name, period_start, period_end, notes, selections } = req.body

    if (!budget_id || !name) {
      return res.status(400).json({ error: 'budget_id and name are required' })
    }
    if (!Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: 'selections must be a non-empty array' })
    }
    const cleanSelections = selections
      .map(s => ({
        work_log_budget_link_id: s.work_log_budget_link_id,
        budget_item_id: s.budget_item_id,
        consumed_quantity: parseFloat(s.consumed_quantity || 0),
      }))
      .filter(s => s.consumed_quantity > 0)
    if (cleanSelections.length === 0) {
      return res.status(400).json({ error: 'no_positive_quantities' })
    }

    // Validate all budget_item_ids belong to budget_id via chapters
    const itemIds = [...new Set(cleanSelections.map(s => s.budget_item_id))]
    const { data: budgetItemsCheck } = await supabase
      .from('cons_budget_items')
      .select('id, chapter_id, unit_price')
      .in('id', itemIds)
    const chapterIds = [...new Set((budgetItemsCheck || []).map(bi => bi.chapter_id))]
    const { data: chaptersCheck } = await supabase
      .from('cons_chapters')
      .select('id, budget_id')
      .in('id', chapterIds)
    const chapterBudgetMap = Object.fromEntries((chaptersCheck || []).map(c => [c.id, c.budget_id]))
    for (const bi of (budgetItemsCheck || [])) {
      if (chapterBudgetMap[bi.chapter_id] !== budget_id) {
        return res.status(400).json({
          error: 'budget_item_mismatch',
          message: 'Alguna partida no pertenece al presupuesto indicado.',
        })
      }
    }

    // Validate residual per link (recheck)
    const linkIds = cleanSelections.map(s => s.work_log_budget_link_id)
    const { data: linksCheck } = await supabase
      .from('cons_work_log_budget_links')
      .select('id, work_log_id, budget_item_id, executed_quantity')
      .in('id', linkIds)
    const linkMap = Object.fromEntries((linksCheck || []).map(l => [l.id, l]))

    const { data: existingConsumed } = await supabase
      .from('cons_certification_work_log_links')
      .select('work_log_budget_link_id, consumed_quantity')
      .in('work_log_budget_link_id', linkIds)
    const consumedMap = {}
    for (const c of (existingConsumed || [])) {
      consumedMap[c.work_log_budget_link_id] =
        (consumedMap[c.work_log_budget_link_id] || 0) + parseFloat(c.consumed_quantity || 0)
    }

    // Also aggregate consumed from the current request (same link selected twice)
    const reqConsumed = {}
    for (const s of cleanSelections) {
      reqConsumed[s.work_log_budget_link_id] = (reqConsumed[s.work_log_budget_link_id] || 0) + s.consumed_quantity
    }

    for (const s of cleanSelections) {
      const link = linkMap[s.work_log_budget_link_id]
      if (!link) {
        return res.status(400).json({ error: 'link_not_found', linkId: s.work_log_budget_link_id })
      }
      if (link.budget_item_id !== s.budget_item_id) {
        return res.status(400).json({ error: 'link_budget_item_mismatch', linkId: s.work_log_budget_link_id })
      }
      const executed = parseFloat(link.executed_quantity || 0)
      const already = consumedMap[s.work_log_budget_link_id] || 0
      const residual = executed - already
      const requested = reqConsumed[s.work_log_budget_link_id] || 0
      if (requested > residual + 1e-6) {
        return res.status(409).json({
          error: 'quantity_exceeds_residual',
          linkId: s.work_log_budget_link_id,
          residual,
          requested,
        })
      }
    }

    // Group by budget_item_id for certification_items
    const itemTotals = {}
    for (const s of cleanSelections) {
      itemTotals[s.budget_item_id] = (itemTotals[s.budget_item_id] || 0) + s.consumed_quantity
    }

    // Validar que ninguna partida supere lo presupuestado antes de crear la cert
    const exceed = await checkExceedsBudget(budget_id, itemTotals)
    if (exceed) return res.status(409).json(exceed)

    // Next certification number
    const { data: existing } = await supabase
      .from('cons_certifications')
      .select('number')
      .eq('budget_id', budget_id)
      .order('number', { ascending: false })
      .limit(1)
    const nextNumber = (existing?.[0]?.number || 0) + 1

    // Insert certification
    const { data: cert, error: certError } = await supabase
      .from('cons_certifications')
      .insert({
        budget_id,
        number: nextNumber,
        name,
        period_start: period_start || null,
        period_end: period_end || null,
        notes: notes || null,
      })
      .select()
      .single()
    if (certError) throw certError
    createdCertId = cert.id

    // Build cert items with previous amounts (reuse logic from main POST)
    const { data: prevCerts } = await supabase
      .from('cons_certifications')
      .select('id')
      .eq('budget_id', budget_id)
      .neq('id', cert.id)
    const prevMap = {}
    let prevItemIds = []
    if (prevCerts && prevCerts.length > 0) {
      const { data: prevItems } = await supabase
        .from('cons_certification_items')
        .select('budget_item_id, certified_quantity')
        .in('certification_id', prevCerts.map(c => c.id))
      prevItemIds = (prevItems || []).map(p => p.budget_item_id)
      for (const p of (prevItems || [])) {
        if (!prevMap[p.budget_item_id]) prevMap[p.budget_item_id] = { qty: 0 }
        prevMap[p.budget_item_id].qty += (p.certified_quantity || 0)
      }
    }

    const allItemIds = [...new Set([...itemIds, ...prevItemIds])]
    const { data: budgetItemsData } = await supabase
      .from('cons_budget_items')
      .select('id, unit_price')
      .in('id', allItemIds)
    const priceMap = Object.fromEntries(
      (budgetItemsData || []).map(bi => [bi.id, parseFloat(bi.unit_price || 0)])
    )

    const certItems = Object.entries(itemTotals).map(([bid, qty]) => {
      const unitPrice = priceMap[bid] || 0
      const prevQty = prevMap[bid]?.qty || 0
      return {
        certification_id: cert.id,
        budget_item_id: bid,
        certified_quantity: qty,
        certified_amount: qty * unitPrice,
        previous_quantity: prevQty,
        previous_amount: prevQty * unitPrice,
      }
    })

    const { data: insertedItems, error: itemsError } = await supabase
      .from('cons_certification_items')
      .insert(certItems)
      .select('id, budget_item_id')
    if (itemsError) throw itemsError

    const certItemIdByBudgetItem = Object.fromEntries(
      (insertedItems || []).map(it => [it.budget_item_id, it.id])
    )

    // Insert work_log_links (one per original selection to preserve granularity)
    const workLogLinks = cleanSelections.map(s => ({
      certification_id: cert.id,
      certification_item_id: certItemIdByBudgetItem[s.budget_item_id],
      work_log_id: linkMap[s.work_log_budget_link_id].work_log_id,
      work_log_budget_link_id: s.work_log_budget_link_id,
      budget_item_id: s.budget_item_id,
      consumed_quantity: s.consumed_quantity,
    }))

    const { error: wllError } = await supabase
      .from('cons_certification_work_log_links')
      .insert(workLogLinks)
    if (wllError) throw wllError

    res.status(201).json(cert)
  } catch (err) {
    // Rollback manual
    if (createdCertId) {
      await supabase.from('cons_certifications').delete().eq('id', createdCertId)
    }
    next(err)
  }
})

// GET /api/certifications/:id/work-log-links
// Returns the work log links consumed by this certification (reverse traceability)
router.get('/:id/work-log-links', async (req, res, next) => {
  try {
    const { data: links, error } = await supabase
      .from('cons_certification_work_log_links')
      .select('*')
      .eq('certification_id', req.params.id)
    if (error) throw error
    if (!links || links.length === 0) return res.json([])

    const logIds = [...new Set(links.map(l => l.work_log_id))]
    const itemIds = [...new Set(links.map(l => l.budget_item_id))]

    const [logsRes, itemsRes] = await Promise.all([
      supabase.from('cons_work_logs').select('id, date, description').in('id', logIds),
      supabase.from('cons_budget_items').select('id, code, name, unit').in('id', itemIds),
    ])
    const logMap = Object.fromEntries((logsRes.data || []).map(l => [l.id, l]))
    const itemMap = Object.fromEntries((itemsRes.data || []).map(i => [i.id, i]))

    const enriched = links.map(l => ({
      ...l,
      work_log_date: logMap[l.work_log_id]?.date || null,
      work_log_description: logMap[l.work_log_id]?.description || null,
      budget_item_code: itemMap[l.budget_item_id]?.code || null,
      budget_item_name: itemMap[l.budget_item_id]?.name || null,
      budget_item_unit: itemMap[l.budget_item_id]?.unit || null,
    }))
    res.json(enriched)
  } catch (err) {
    next(err)
  }
})

export default router
