import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

const router = Router()
router.use(authMiddleware)

// ─── Work Logs (Partes de Obra) ─────────────────────────────────────

// GET /api/work-logs/project/:projectId — List work logs for a project
router.get('/project/:projectId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_work_logs')
      .select('*')
      .eq('project_id', req.params.projectId)
      .order('date', { ascending: false })

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/work-logs/:id/full — Full work log with labor, materials, equipment, budget links
router.get('/:id/full', async (req, res, next) => {
  try {
    const logId = req.params.id

    const [logRes, laborRes, materialsRes, equipmentRes, linksRes, expensesRes, certLinksRes] = await Promise.all([
      supabase.from('cons_work_logs').select('*').eq('id', logId).single(),
      supabase.from('cons_work_log_labor').select('*').eq('work_log_id', logId).order('sort_order'),
      supabase.from('cons_work_log_materials').select('*').eq('work_log_id', logId).order('sort_order'),
      supabase.from('cons_work_log_equipment').select('*').eq('work_log_id', logId).order('sort_order'),
      supabase.from('cons_work_log_budget_links').select('*').eq('work_log_id', logId),
      supabase.from('cons_project_expenses').select('*').eq('work_log_id', logId).order('date', { ascending: false }),
      supabase.from('cons_certification_work_log_links').select('work_log_budget_link_id, consumed_quantity, certification_id').eq('work_log_id', logId),
    ])

    if (logRes.error) throw logRes.error

    const certifiedPerLink = {}
    for (const c of (certLinksRes.data || [])) {
      const k = c.work_log_budget_link_id
      certifiedPerLink[k] = (certifiedPerLink[k] || 0) + parseFloat(c.consumed_quantity || 0)
    }

    // Mark links locked by any non-draft cert (approved/submitted/finalized)
    let lockedLinkIds = []
    const certIds = [...new Set((certLinksRes.data || []).map(c => c.certification_id))]
    if (certIds.length > 0) {
      const { data: certs } = await supabase
        .from('cons_certifications')
        .select('id, status')
        .in('id', certIds)
      const nonDraftCertIds = new Set((certs || []).filter(c => c.status !== 'draft').map(c => c.id))
      const lockedSet = new Set()
      for (const c of (certLinksRes.data || [])) {
        if (nonDraftCertIds.has(c.certification_id)) lockedSet.add(c.work_log_budget_link_id)
      }
      lockedLinkIds = [...lockedSet]
    }

    res.json({
      workLog: logRes.data,
      labor: laborRes.data || [],
      materials: materialsRes.data || [],
      equipment: equipmentRes.data || [],
      budgetLinks: linksRes.data || [],
      expenses: expensesRes.data || [],
      certifiedPerLink,
      lockedLinkIds,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/work-logs — Create work log
router.post('/', async (req, res, next) => {
  try {
    const { project_id, date, description, weather, notes } = req.body
    const { data, error } = await supabase
      .from('cons_work_logs')
      .insert({
        project_id,
        date,
        description: description || null,
        weather: weather || null,
        notes: notes || null,
        status: 'draft',
        created_by: req.user.email,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/work-logs/:id — Update work log
router.put('/:id', async (req, res, next) => {
  try {
    const { date, description, weather, notes, status } = req.body
    const updateData = { updated_at: new Date().toISOString() }
    if (date !== undefined) updateData.date = date
    if (description !== undefined) updateData.description = description
    if (weather !== undefined) updateData.weather = weather
    if (notes !== undefined) updateData.notes = notes
    if (status !== undefined) updateData.status = status

    const { data, error } = await supabase
      .from('cons_work_logs')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/work-logs/:id — Delete work log (cascades to children)
// The direct FK cons_certification_work_log_links.work_log_id is RESTRICT, so a
// raw delete of a certified log aborts with a 500. Mirror the sibling
// DELETE /budget-links/:linkId behaviour keyed by work_log_id:
//   · Any non-draft cert consuming this log → 409 (locked).
//   · Only drafts consume → discount their cert_items (deleting empty ones),
//     delete the cert_links first (so the RESTRICT FK no longer blocks), then delete the log.
//   · Nothing consumes → just delete.
router.delete('/:id', async (req, res, next) => {
  try {
    const workLogId = req.params.id

    const { data: certLinks } = await supabase
      .from('cons_certification_work_log_links')
      .select('id, certification_id, certification_item_id, consumed_quantity')
      .eq('work_log_id', workLogId)

    if (certLinks && certLinks.length > 0) {
      const certIds = [...new Set(certLinks.map(cl => cl.certification_id))]
      const { data: certs } = await supabase
        .from('cons_certifications')
        .select('id, status')
        .in('id', certIds)
      const hasNonDraft = (certs || []).some(c => c.status !== 'draft')
      if (hasNonDraft) {
        return res.status(409).json({
          error: 'link_locked_by_non_draft_cert',
          message: 'Este parte está vinculado a una certificación aprobada/finalizada y no puede eliminarse.',
        })
      }

      // Only drafts → discount their cert_items
      const certItemIds = [...new Set(certLinks.map(cl => cl.certification_item_id))]
      const { data: certItems } = await supabase
        .from('cons_certification_items')
        .select('id, certified_quantity, budget_item_id')
        .in('id', certItemIds)
      const certItemMap = Object.fromEntries((certItems || []).map(ci => [ci.id, ci]))
      const biIds = [...new Set((certItems || []).map(ci => ci.budget_item_id))]
      const { data: bis } = await supabase
        .from('cons_budget_items')
        .select('id, unit_price')
        .in('id', biIds)
      const biMap = Object.fromEntries((bis || []).map(b => [b.id, parseFloat(b.unit_price || 0)]))

      const certItemDeltas = {}
      for (const cl of certLinks) {
        certItemDeltas[cl.certification_item_id] =
          (certItemDeltas[cl.certification_item_id] || 0) + parseFloat(cl.consumed_quantity || 0)
      }

      // Delete all cert_links for this work_log_id first (clears the RESTRICT FK)
      await supabase.from('cons_certification_work_log_links')
        .delete()
        .eq('work_log_id', workLogId)

      // Reduce / delete cert_items
      for (const [ciId, delta] of Object.entries(certItemDeltas)) {
        const ci = certItemMap[ciId]
        if (!ci) continue
        const newCertQty = parseFloat(ci.certified_quantity || 0) - delta
        const unitPrice = biMap[ci.budget_item_id] || 0
        if (newCertQty <= 1e-6) {
          await supabase.from('cons_certification_items').delete().eq('id', ciId)
        } else {
          await supabase.from('cons_certification_items')
            .update({
              certified_quantity: newCertQty,
              certified_amount: newCertQty * unitPrice,
            })
            .eq('id', ciId)
        }
      }
    }

    const { error } = await supabase
      .from('cons_work_logs')
      .delete()
      .eq('id', workLogId)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ─── Labor entries ──────────────────────────────────────────────────

// POST /api/work-logs/:id/labor
router.post('/:id/labor', async (req, res, next) => {
  try {
    const { role, worker_count, hours, hourly_rate, sort_order, date, worker_id, description } = req.body
    const hoursNum = parseFloat(hours)
    const rateNum = parseFloat(hourly_rate)
    const missing = []
    if (!role || !String(role).trim()) missing.push('role')
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) missing.push('hours')
    if (!Number.isFinite(rateNum) || rateNum < 0) missing.push('hourly_rate')
    if (missing.length) {
      return res.status(400).json({ error: 'missing_fields', fields: missing, message: `Faltan campos obligatorios: ${missing.join(', ')}` })
    }
    const { data, error } = await supabase
      .from('cons_work_log_labor')
      .insert({
        work_log_id: req.params.id,
        role: String(role).trim(),
        worker_count: parseInt(worker_count) || 1,
        hours: hoursNum,
        hourly_rate: rateNum,
        sort_order: sort_order || 0,
        date: date || null,
        worker_id: worker_id || null,
        description: description || null,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/work-logs/labor/:entryId
// Partial update con guardias: evita meter NaN en columnas NOT NULL
router.put('/labor/:entryId', async (req, res, next) => {
  try {
    const body = req.body || {}
    const updateData = {}
    if ('role' in body) {
      if (!body.role || !String(body.role).trim()) {
        return res.status(400).json({ error: 'missing_fields', fields: ['role'], message: 'El rol es obligatorio' })
      }
      updateData.role = String(body.role).trim()
    }
    if ('worker_count' in body) updateData.worker_count = parseInt(body.worker_count) || 1
    if ('hours' in body) {
      const n = parseFloat(body.hours)
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ error: 'missing_fields', fields: ['hours'], message: 'Las horas son obligatorias y mayores que 0' })
      }
      updateData.hours = n
    }
    if ('hourly_rate' in body) {
      const n = parseFloat(body.hourly_rate)
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: 'missing_fields', fields: ['hourly_rate'], message: 'El precio/hora es obligatorio' })
      }
      updateData.hourly_rate = n
    }
    if ('sort_order' in body) updateData.sort_order = parseInt(body.sort_order) || 0
    if ('date' in body) updateData.date = body.date || null
    if ('worker_id' in body) updateData.worker_id = body.worker_id || null
    if ('description' in body) updateData.description = body.description || null

    const { data, error } = await supabase
      .from('cons_work_log_labor')
      .update(updateData)
      .eq('id', req.params.entryId)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/work-logs/labor/:entryId
router.delete('/labor/:entryId', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_work_log_labor')
      .delete()
      .eq('id', req.params.entryId)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ─── Material entries ───────────────────────────────────────────────

// POST /api/work-logs/:id/materials
router.post('/:id/materials', async (req, res, next) => {
  try {
    const { material_name, quantity, unit, unit_price, sort_order, date, description } = req.body
    const qtyNum = parseFloat(quantity)
    const priceNum = parseFloat(unit_price)
    const missing = []
    if (!material_name || !String(material_name).trim()) missing.push('material_name')
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) missing.push('quantity')
    if (!Number.isFinite(priceNum) || priceNum < 0) missing.push('unit_price')
    if (missing.length) {
      return res.status(400).json({ error: 'missing_fields', fields: missing, message: `Faltan campos obligatorios: ${missing.join(', ')}` })
    }
    const { data, error } = await supabase
      .from('cons_work_log_materials')
      .insert({
        work_log_id: req.params.id,
        material_name: String(material_name).trim(),
        quantity: qtyNum,
        unit: unit || 'ud',
        unit_price: priceNum,
        sort_order: sort_order || 0,
        date: date || null,
        description: description || null,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/work-logs/materials/:entryId
router.put('/materials/:entryId', async (req, res, next) => {
  try {
    const body = req.body || {}
    const updateData = {}
    if ('material_name' in body) {
      if (!body.material_name || !String(body.material_name).trim()) {
        return res.status(400).json({ error: 'missing_fields', fields: ['material_name'], message: 'El nombre del material es obligatorio' })
      }
      updateData.material_name = String(body.material_name).trim()
    }
    if ('quantity' in body) {
      const n = parseFloat(body.quantity)
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ error: 'missing_fields', fields: ['quantity'], message: 'La cantidad es obligatoria y mayor que 0' })
      }
      updateData.quantity = n
    }
    if ('unit_price' in body) {
      const n = parseFloat(body.unit_price)
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: 'missing_fields', fields: ['unit_price'], message: 'El precio unitario es obligatorio' })
      }
      updateData.unit_price = n
    }
    if ('unit' in body) updateData.unit = body.unit || 'ud'
    if ('sort_order' in body) updateData.sort_order = parseInt(body.sort_order) || 0
    if ('date' in body) updateData.date = body.date || null
    if ('description' in body) updateData.description = body.description || null

    const { data, error } = await supabase
      .from('cons_work_log_materials')
      .update(updateData)
      .eq('id', req.params.entryId)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/work-logs/materials/:entryId
router.delete('/materials/:entryId', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_work_log_materials')
      .delete()
      .eq('id', req.params.entryId)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ─── Equipment entries ──────────────────────────────────────────────

// POST /api/work-logs/:id/equipment
router.post('/:id/equipment', async (req, res, next) => {
  try {
    const { equipment_name, hours, hourly_rate, sort_order, date, equipment_id, description } = req.body
    const hoursNum = parseFloat(hours)
    const rateNum = parseFloat(hourly_rate)
    const missing = []
    if (!equipment_name || !String(equipment_name).trim()) missing.push('equipment_name')
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) missing.push('hours')
    if (!Number.isFinite(rateNum) || rateNum < 0) missing.push('hourly_rate')
    if (missing.length) {
      return res.status(400).json({ error: 'missing_fields', fields: missing, message: `Faltan campos obligatorios: ${missing.join(', ')}` })
    }
    const { data, error } = await supabase
      .from('cons_work_log_equipment')
      .insert({
        work_log_id: req.params.id,
        equipment_name: String(equipment_name).trim(),
        hours: hoursNum,
        hourly_rate: rateNum,
        sort_order: sort_order || 0,
        date: date || null,
        equipment_id: equipment_id || null,
        description: description || null,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/work-logs/equipment/:entryId
router.put('/equipment/:entryId', async (req, res, next) => {
  try {
    const body = req.body || {}
    const updateData = {}
    if ('equipment_name' in body) {
      if (!body.equipment_name || !String(body.equipment_name).trim()) {
        return res.status(400).json({ error: 'missing_fields', fields: ['equipment_name'], message: 'El nombre del equipo es obligatorio' })
      }
      updateData.equipment_name = String(body.equipment_name).trim()
    }
    if ('hours' in body) {
      const n = parseFloat(body.hours)
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ error: 'missing_fields', fields: ['hours'], message: 'Las horas son obligatorias y mayores que 0' })
      }
      updateData.hours = n
    }
    if ('hourly_rate' in body) {
      const n = parseFloat(body.hourly_rate)
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: 'missing_fields', fields: ['hourly_rate'], message: 'El precio/hora es obligatorio' })
      }
      updateData.hourly_rate = n
    }
    if ('sort_order' in body) updateData.sort_order = parseInt(body.sort_order) || 0
    if ('date' in body) updateData.date = body.date || null
    if ('equipment_id' in body) updateData.equipment_id = body.equipment_id || null
    if ('description' in body) updateData.description = body.description || null

    const { data, error } = await supabase
      .from('cons_work_log_equipment')
      .update(updateData)
      .eq('id', req.params.entryId)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/work-logs/equipment/:entryId
router.delete('/equipment/:entryId', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_work_log_equipment')
      .delete()
      .eq('id', req.params.entryId)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ─── Budget Links (Fase 2) ──────────────────────────────────────────

// POST /api/work-logs/:id/budget-links
router.post('/:id/budget-links', async (req, res, next) => {
  try {
    const { budget_item_id, executed_quantity, notes } = req.body
    const { data, error } = await supabase
      .from('cons_work_log_budget_links')
      .insert({
        work_log_id: req.params.id,
        budget_item_id,
        executed_quantity: parseFloat(executed_quantity || '0'),
        notes: notes || null,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/work-logs/budget-links/:linkId
// Editing executed_quantity:
//   · New ≥ total_consumed (across all certs) → just update.
//   · New ≥ consumed_in_non_draft but < total_consumed → reduce proportionally the
//     consumed_quantity of links pointing to DRAFT certs (and adjust those certs'
//     certified_quantity). Aprovadas/finalizadas no se tocan.
//   · New < consumed_in_non_draft → 409.
router.put('/budget-links/:linkId', async (req, res, next) => {
  try {
    const { executed_quantity, notes } = req.body
    const updateData = {}
    if (executed_quantity !== undefined) updateData.executed_quantity = parseFloat(executed_quantity)
    if (notes !== undefined) updateData.notes = notes

    if (updateData.executed_quantity !== undefined) {
      const newExecuted = updateData.executed_quantity

      const { data: certLinks } = await supabase
        .from('cons_certification_work_log_links')
        .select('id, certification_id, certification_item_id, consumed_quantity')
        .eq('work_log_budget_link_id', req.params.linkId)

      let nonDraftConsumed = 0
      let draftConsumed = 0
      const draftLinks = []

      if (certLinks && certLinks.length > 0) {
        const certIds = [...new Set(certLinks.map(cl => cl.certification_id))]
        const { data: certs } = await supabase
          .from('cons_certifications')
          .select('id, status')
          .in('id', certIds)
        const certStatusMap = Object.fromEntries((certs || []).map(c => [c.id, c.status]))

        for (const cl of certLinks) {
          const status = certStatusMap[cl.certification_id]
          const consumed = parseFloat(cl.consumed_quantity || 0)
          if (status === 'draft') {
            draftConsumed += consumed
            draftLinks.push(cl)
          } else {
            nonDraftConsumed += consumed
          }
        }
      }

      // ─── Lock: any non-draft cert consuming this link → fully read-only ───
      if (nonDraftConsumed > 0) {
        return res.status(409).json({
          error: 'link_locked_by_non_draft_cert',
          message: 'Esta partida está vinculada a una certificación aprobada/finalizada y no puede modificarse.',
        })
      }

      // If we need to scale down draft links
      const totalConsumed = nonDraftConsumed + draftConsumed
      if (newExecuted + 1e-6 < totalConsumed && draftLinks.length > 0) {
        const availableForDraft = Math.max(0, newExecuted - nonDraftConsumed)
        const factor = draftConsumed > 0 ? availableForDraft / draftConsumed : 0

        // Look up cert_items + unit prices to recompute amounts
        const certItemIds = [...new Set(draftLinks.map(dl => dl.certification_item_id))]
        const { data: certItems } = await supabase
          .from('cons_certification_items')
          .select('id, certified_quantity, budget_item_id')
          .in('id', certItemIds)
        const certItemMap = Object.fromEntries((certItems || []).map(ci => [ci.id, ci]))

        const biIds = [...new Set((certItems || []).map(ci => ci.budget_item_id))]
        const { data: bis } = await supabase
          .from('cons_budget_items')
          .select('id, unit_price')
          .in('id', biIds)
        const biMap = Object.fromEntries((bis || []).map(b => [b.id, parseFloat(b.unit_price || 0)]))

        // Plan changes
        const linksToDelete = []
        const linksToUpdate = []
        const certItemDeltas = {} // cert_item_id → total reduction in consumed

        for (const dl of draftLinks) {
          const oldConsumed = parseFloat(dl.consumed_quantity || 0)
          const newConsumed = oldConsumed * factor
          const delta = oldConsumed - newConsumed
          if (newConsumed <= 1e-6) {
            linksToDelete.push(dl.id)
          } else {
            linksToUpdate.push({ id: dl.id, new_consumed: newConsumed })
          }
          certItemDeltas[dl.certification_item_id] =
            (certItemDeltas[dl.certification_item_id] || 0) + delta
        }

        // Apply link changes
        for (const id of linksToDelete) {
          await supabase.from('cons_certification_work_log_links').delete().eq('id', id)
        }
        for (const u of linksToUpdate) {
          await supabase.from('cons_certification_work_log_links')
            .update({ consumed_quantity: u.new_consumed })
            .eq('id', u.id)
        }

        // Apply cert_item changes (reduce certified_quantity, recalc amount, delete if drops to 0)
        for (const [ciId, delta] of Object.entries(certItemDeltas)) {
          const ci = certItemMap[ciId]
          if (!ci) continue
          const newCertQty = parseFloat(ci.certified_quantity || 0) - delta
          const unitPrice = biMap[ci.budget_item_id] || 0
          if (newCertQty <= 1e-6) {
            await supabase.from('cons_certification_items').delete().eq('id', ciId)
          } else {
            await supabase.from('cons_certification_items')
              .update({
                certified_quantity: newCertQty,
                certified_amount: newCertQty * unitPrice,
              })
              .eq('id', ciId)
          }
        }
      }
    }

    const { data, error } = await supabase
      .from('cons_work_log_budget_links')
      .update(updateData)
      .eq('id', req.params.linkId)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/work-logs/budget-links/:linkId
// · If any non-draft cert consumes this link → 409 (locked).
// · If only drafts consume → discount their cert_items (deleting empty ones) and delete the link.
// · If nothing consumes → just delete.
router.delete('/budget-links/:linkId', async (req, res, next) => {
  try {
    const { data: certLinks } = await supabase
      .from('cons_certification_work_log_links')
      .select('id, certification_id, certification_item_id, consumed_quantity')
      .eq('work_log_budget_link_id', req.params.linkId)

    if (certLinks && certLinks.length > 0) {
      const certIds = [...new Set(certLinks.map(cl => cl.certification_id))]
      const { data: certs } = await supabase
        .from('cons_certifications')
        .select('id, status')
        .in('id', certIds)
      const hasNonDraft = (certs || []).some(c => c.status !== 'draft')
      if (hasNonDraft) {
        return res.status(409).json({
          error: 'link_locked_by_non_draft_cert',
          message: 'Esta partida está vinculada a una certificación aprobada/finalizada y no puede eliminarse.',
        })
      }

      // Only drafts → discount their cert_items
      const certItemIds = [...new Set(certLinks.map(cl => cl.certification_item_id))]
      const { data: certItems } = await supabase
        .from('cons_certification_items')
        .select('id, certified_quantity, budget_item_id')
        .in('id', certItemIds)
      const certItemMap = Object.fromEntries((certItems || []).map(ci => [ci.id, ci]))
      const biIds = [...new Set((certItems || []).map(ci => ci.budget_item_id))]
      const { data: bis } = await supabase
        .from('cons_budget_items')
        .select('id, unit_price')
        .in('id', biIds)
      const biMap = Object.fromEntries((bis || []).map(b => [b.id, parseFloat(b.unit_price || 0)]))

      const certItemDeltas = {}
      for (const cl of certLinks) {
        certItemDeltas[cl.certification_item_id] =
          (certItemDeltas[cl.certification_item_id] || 0) + parseFloat(cl.consumed_quantity || 0)
      }

      // Delete all cert_links for this work_log_budget_link_id
      await supabase.from('cons_certification_work_log_links')
        .delete()
        .eq('work_log_budget_link_id', req.params.linkId)

      // Reduce / delete cert_items
      for (const [ciId, delta] of Object.entries(certItemDeltas)) {
        const ci = certItemMap[ciId]
        if (!ci) continue
        const newCertQty = parseFloat(ci.certified_quantity || 0) - delta
        const unitPrice = biMap[ci.budget_item_id] || 0
        if (newCertQty <= 1e-6) {
          await supabase.from('cons_certification_items').delete().eq('id', ciId)
        } else {
          await supabase.from('cons_certification_items')
            .update({
              certified_quantity: newCertQty,
              certified_amount: newCertQty * unitPrice,
            })
            .eq('id', ciId)
        }
      }
    }

    const { error } = await supabase
      .from('cons_work_log_budget_links')
      .delete()
      .eq('id', req.params.linkId)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// GET /api/work-logs/project/:projectId/certifiable
// Returns work logs with at least one budget link that has residual > 0
router.get('/project/:projectId/certifiable', async (req, res, next) => {
  try {
    const projectId = req.params.projectId

    const { data: logs, error: logsErr } = await supabase
      .from('cons_work_logs')
      .select('id, date, description, status')
      .eq('project_id', projectId)
      .order('date', { ascending: false })
    if (logsErr) throw logsErr
    if (!logs || logs.length === 0) return res.json([])

    const logIds = logs.map(l => l.id)

    const { data: links, error: linksErr } = await supabase
      .from('cons_work_log_budget_links')
      .select('id, work_log_id, budget_item_id, executed_quantity')
      .in('work_log_id', logIds)
    if (linksErr) throw linksErr
    if (!links || links.length === 0) return res.json([])

    const linkIds = links.map(l => l.id)
    const { data: certLinks } = await supabase
      .from('cons_certification_work_log_links')
      .select('work_log_budget_link_id, consumed_quantity')
      .in('work_log_budget_link_id', linkIds)

    const consumedByLink = {}
    for (const c of (certLinks || [])) {
      consumedByLink[c.work_log_budget_link_id] =
        (consumedByLink[c.work_log_budget_link_id] || 0) + parseFloat(c.consumed_quantity || 0)
    }

    const itemIds = [...new Set(links.map(l => l.budget_item_id))]
    const { data: budgetItems } = await supabase
      .from('cons_budget_items')
      .select('id, chapter_id, code, name, unit, unit_price')
      .in('id', itemIds)
    const budgetItemMap = Object.fromEntries((budgetItems || []).map(bi => [bi.id, bi]))

    const chapterIds = [...new Set((budgetItems || []).map(bi => bi.chapter_id))]
    const { data: chapters } = await supabase
      .from('cons_chapters')
      .select('id, code, name, budget_id')
      .in('id', chapterIds)
    const chapterMap = Object.fromEntries((chapters || []).map(c => [c.id, c]))

    const budgetIds = [...new Set((chapters || []).map(c => c.budget_id))]
    const { data: budgets } = await supabase
      .from('cons_budgets')
      .select('id, name, project_id')
      .in('id', budgetIds)
    const budgetMap = Object.fromEntries((budgets || []).map(b => [b.id, b]))

    const byLog = {}
    for (const link of links) {
      const bi = budgetItemMap[link.budget_item_id]
      if (!bi) continue
      const ch = chapterMap[bi.chapter_id]
      if (!ch) continue
      const bg = budgetMap[ch.budget_id]
      if (!bg || bg.project_id !== projectId) continue

      const executed = parseFloat(link.executed_quantity || 0)
      const already = consumedByLink[link.id] || 0
      const residual = Math.round((executed - already) * 10000) / 10000
      if (residual <= 0.0001) continue

      if (!byLog[link.work_log_id]) {
        const wl = logs.find(l => l.id === link.work_log_id)
        byLog[link.work_log_id] = { work_log: wl, items: [] }
      }
      byLog[link.work_log_id].items.push({
        work_log_budget_link_id: link.id,
        budget_item_id: bi.id,
        budget_id: bg.id,
        budget_name: bg.name,
        chapter_id: ch.id,
        chapter_code: ch.code,
        chapter_name: ch.name,
        code: bi.code,
        name: bi.name,
        unit: bi.unit,
        unit_price: parseFloat(bi.unit_price || 0),
        executed_quantity: executed,
        already_certified: already,
        residual,
      })
    }

    const result = logs
      .filter(l => byLog[l.id])
      .map(l => byLog[l.id])

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// GET /api/work-logs/project/:projectId/available-items?exclude_work_log_id=<id>
// Returns flat list of budget items with remaining quantity to execute (for the link selector).
// exclude_work_log_id: al editar un parte, deja que sus propias vinculaciones sigan apareciendo.
router.get('/project/:projectId/available-items', async (req, res, next) => {
  try {
    const projectId = req.params.projectId
    const excludeLogId = req.query.exclude_work_log_id || null

    // 1) Presupuesto "principal" del proyecto: approved > pending > version más alta.
    //    Los alternativos/draft NO se mezclan en el selector (de lo contrario parece biblioteca).
    const { data: budgets } = await supabase
      .from('cons_budgets')
      .select('id, name, status, version')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
    if (!budgets || budgets.length === 0) return res.json([])

    const primary =
      budgets.find(b => b.status === 'approved') ||
      budgets.find(b => b.status === 'pending') ||
      budgets[0]
    const budgetIds = [primary.id]

    // 2) Capítulos activos del presupuesto principal
    const { data: chapters } = await supabase
      .from('cons_chapters')
      .select('id, code, name, budget_id, sort_order, is_active')
      .in('budget_id', budgetIds)
      .eq('is_active', true)
      .order('sort_order')
    const chapterIds = (chapters || []).map(c => c.id)
    const chapterMap = Object.fromEntries((chapters || []).map(c => [c.id, c]))
    if (chapterIds.length === 0) return res.json([])

    // 3) Partidas activas de esos capítulos
    const { data: items } = await supabase
      .from('cons_budget_items')
      .select('id, chapter_id, code, name, description, unit, quantity, unit_price, cost_price, sort_order, is_auxiliary, is_active')
      .in('chapter_id', chapterIds)
      .eq('is_active', true)
      .order('sort_order')
    if (!items || items.length === 0) return res.json([])
    const itemIds = items.map(i => i.id)

    // 4) Total ejecutado en TODOS los partes del proyecto, agrupado por item
    // Filtramos excluyendo el parte actual si viene como query param
    const { data: allLogs } = await supabase
      .from('cons_work_logs')
      .select('id')
      .eq('project_id', projectId)
    const allLogIds = (allLogs || []).map(l => l.id).filter(id => id !== excludeLogId)

    let executedByItem = {}
    if (allLogIds.length > 0) {
      const { data: links } = await supabase
        .from('cons_work_log_budget_links')
        .select('budget_item_id, executed_quantity')
        .in('work_log_id', allLogIds)
        .in('budget_item_id', itemIds)
      for (const l of (links || [])) {
        executedByItem[l.budget_item_id] =
          (executedByItem[l.budget_item_id] || 0) + parseFloat(l.executed_quantity || 0)
      }
    }

    // 5) Total certificado por item (suma de certified_quantity en cons_certification_items)
    const { data: certItems } = await supabase
      .from('cons_certification_items')
      .select('budget_item_id, certified_quantity, certification_id')
      .in('budget_item_id', itemIds)
    // Solo certificaciones del proyecto
    const certIds = [...new Set((certItems || []).map(c => c.certification_id))]
    let validCertIds = new Set()
    if (certIds.length > 0) {
      const { data: certs } = await supabase
        .from('cons_certifications')
        .select('id, project_id')
        .in('id', certIds)
        .eq('project_id', projectId)
      validCertIds = new Set((certs || []).map(c => c.id))
    }
    const certifiedByItem = {}
    for (const c of (certItems || [])) {
      if (!validCertIds.has(c.certification_id)) continue
      certifiedByItem[c.budget_item_id] =
        (certifiedByItem[c.budget_item_id] || 0) + parseFloat(c.certified_quantity || 0)
    }

    // 6) Componer salida con remaining
    // Partidas auxiliares (is_auxiliary=true): no tienen tope, siempre disponibles. remaining=null.
    const out = items
      .map(it => {
        const ch = chapterMap[it.chapter_id]
        const quantity = parseFloat(it.quantity || 0)
        const executed_other_logs = parseFloat((executedByItem[it.id] || 0).toFixed(4))
        const certified_total = parseFloat((certifiedByItem[it.id] || 0).toFixed(4))
        // Remaining: lo que aún se puede ejecutar (no certificado). Usamos certificado como tope
        // para que una partida totalmente certificada nunca aparezca. En auxiliares → null (sin tope).
        const remaining = it.is_auxiliary
          ? null
          : Math.max(0, Math.round((quantity - Math.max(executed_other_logs, certified_total)) * 10000) / 10000)
        return {
          id: it.id,
          chapter_id: it.chapter_id,
          chapter_code: ch?.code || '',
          chapter_name: ch?.name || '',
          chapter_sort_order: ch?.sort_order ?? 0,
          code: it.code,
          name: it.name,
          description: it.description,
          unit: it.unit,
          quantity,
          unit_price: parseFloat(it.unit_price || 0),
          cost_price: parseFloat(it.cost_price || 0),
          sort_order: it.sort_order,
          is_auxiliary: !!it.is_auxiliary,
          executed_other_logs,
          certified_total,
          remaining,
        }
      })
      .filter(x => x.is_auxiliary || x.remaining > 0.0001)
      .sort((a, b) =>
        (a.chapter_sort_order - b.chapter_sort_order) ||
        a.chapter_code.localeCompare(b.chapter_code) ||
        (a.sort_order - b.sort_order)
      )

    res.json(out)
  } catch (err) {
    next(err)
  }
})

// ─── Cost Control (Fase 3) ──────────────────────────────────────────

// GET /api/work-logs/project/:projectId/cost-summary
// Returns project cost breakdown by category, supplier, equipment type, and material
router.get('/project/:projectId/cost-summary', async (req, res, next) => {
  try {
    const { projectId } = req.params
    const { from, to } = req.query // optional date filters

    // Get all work logs for this project (optionally filtered by date)
    let logsQuery = supabase
      .from('cons_work_logs')
      .select('id, date')
      .eq('project_id', projectId)
    if (from) logsQuery = logsQuery.gte('date', from)
    if (to) logsQuery = logsQuery.lte('date', to)

    const { data: logs, error: logsErr } = await logsQuery
    if (logsErr) throw logsErr
    if (!logs || logs.length === 0) {
      return res.json({
        by_category: { labor: 0, materials: 0, equipment: 0, expenses: 0, total: 0 },
        by_supplier: [],
        by_equipment_category: [],
        by_material: [],
        date_range: { from: from || null, to: to || null },
      })
    }

    const logIds = logs.map(l => l.id)

    // Fetch all sub-entries in parallel
    const [laborRes, matsRes, equipRes, expensesRes] = await Promise.all([
      supabase.from('cons_work_log_labor').select('work_log_id, role, worker_count, hours, hourly_rate, worker_id').in('work_log_id', logIds),
      supabase.from('cons_work_log_materials').select('work_log_id, material_name, quantity, unit, unit_price').in('work_log_id', logIds),
      supabase.from('cons_work_log_equipment').select('work_log_id, equipment_name, hours, hourly_rate, equipment_id').in('work_log_id', logIds),
      supabase.from('cons_project_expenses').select('work_log_id, supplier_name, supplier_id, concept, amount, tax_amount').eq('project_id', projectId),
    ])

    // ─── 1) By Category ─────────────────────────────────
    let laborTotal = 0, materialsTotal = 0, equipmentTotal = 0, expensesTotal = 0
    for (const l of (laborRes.data || [])) {
      laborTotal += (l.worker_count || 1) * (l.hours || 0) * (l.hourly_rate || 0)
    }
    for (const m of (matsRes.data || [])) {
      materialsTotal += (m.quantity || 0) * (m.unit_price || 0)
    }
    for (const e of (equipRes.data || [])) {
      equipmentTotal += (e.hours || 0) * (e.hourly_rate || 0)
    }
    for (const exp of (expensesRes.data || [])) {
      expensesTotal += (exp.amount || 0) + (exp.tax_amount || 0)
    }
    const totalCost = laborTotal + materialsTotal + equipmentTotal + expensesTotal

    // ─── 2) By Supplier ─────────────────────────────────
    // Gather equipment_ids to look up their suppliers
    const equipmentIds = [...new Set((equipRes.data || []).filter(e => e.equipment_id).map(e => e.equipment_id))]
    let equipCatalogMap = {}
    if (equipmentIds.length > 0) {
      const { data: catalogItems } = await supabase
        .from('cons_equipment_catalog')
        .select('id, name, category, supplier_id')
        .in('id', equipmentIds)
      for (const ci of (catalogItems || [])) {
        equipCatalogMap[ci.id] = ci
      }
    }

    // Get supplier names for all referenced supplier_ids
    const allSupplierIds = new Set()
    for (const ci of Object.values(equipCatalogMap)) {
      if (ci.supplier_id) allSupplierIds.add(ci.supplier_id)
    }
    for (const exp of (expensesRes.data || [])) {
      if (exp.supplier_id) allSupplierIds.add(exp.supplier_id)
    }

    let supplierNamesMap = {}
    if (allSupplierIds.size > 0) {
      const { data: suppliers } = await supabase
        .from('cons_suppliers')
        .select('id, name')
        .in('id', [...allSupplierIds])
      for (const s of (suppliers || [])) {
        supplierNamesMap[s.id] = s.name
      }
    }

    // Try to match work log materials to suppliers via cons_supplier_materials
    // Get ALL materials that have a supplier link, then fuzzy-match by name
    const materialNames = [...new Set((matsRes.data || []).map(m => m.material_name).filter(Boolean))]
    let materialSupplierMap = {} // material_name -> supplier_name
    if (materialNames.length > 0) {
      // Get all materials that have supplier links (with supplier info)
      const { data: supplierMats } = await supabase
        .from('cons_supplier_materials')
        .select('material_id, supplier_id, material:cons_materials(id, name)')

      if (supplierMats && supplierMats.length > 0) {
        // Get supplier names
        const smSupplierIds = [...new Set(supplierMats.map(sm => sm.supplier_id))]
        for (const sid of smSupplierIds) allSupplierIds.add(sid)
        if (smSupplierIds.length > 0) {
          const { data: extraSuppliers } = await supabase
            .from('cons_suppliers')
            .select('id, name')
            .in('id', smSupplierIds)
          for (const s of (extraSuppliers || [])) {
            supplierNamesMap[s.id] = s.name
          }
        }

        // Build catalog: array of { catalogName (uppercase), supplierName }
        const catalogEntries = supplierMats
          .filter(sm => sm.material?.name && sm.supplier_id && supplierNamesMap[sm.supplier_id])
          .map(sm => ({
            catalogName: sm.material.name.toUpperCase().trim(),
            supplierName: supplierNamesMap[sm.supplier_id],
          }))

        // Match each work log material name to best catalog entry
        for (const wlName of materialNames) {
          const upper = wlName.toUpperCase().trim()
          // 1) Exact match
          let match = catalogEntries.find(c => c.catalogName === upper)
          // 2) Catalog name starts with work log name (e.g. "HORMIGON HA 25 ARIDO 25" matches "HORMIGON HA 25 ARIDO 25 XC2")
          if (!match) match = catalogEntries.find(c => c.catalogName.startsWith(upper))
          // 3) Work log name starts with catalog name
          if (!match) match = catalogEntries.find(c => upper.startsWith(c.catalogName))
          // 4) Significant word overlap (at least 3 words match)
          if (!match) {
            const wlWords = upper.split(/\s+/).filter(w => w.length > 2)
            let bestScore = 0
            for (const c of catalogEntries) {
              const cWords = c.catalogName.split(/\s+/).filter(w => w.length > 2)
              const overlap = wlWords.filter(w => cWords.includes(w)).length
              if (overlap >= 3 && overlap > bestScore) {
                bestScore = overlap
                match = c
              }
            }
          }
          if (match) {
            materialSupplierMap[wlName] = match.supplierName
          }
        }
      }
    }

    // Aggregate costs by supplier
    const supplierCosts = {} // key: supplier name, value: { labor, materials, equipment, expenses, total }

    // Material costs by supplier (matched via material catalog → supplier_materials)
    for (const m of (matsRes.data || [])) {
      const cost = (m.quantity || 0) * (m.unit_price || 0)
      if (cost === 0) continue
      const supplierName = materialSupplierMap[m.material_name] || 'Sin proveedor'
      if (!supplierCosts[supplierName]) supplierCosts[supplierName] = { name: supplierName, labor: 0, materials: 0, equipment: 0, expenses: 0, total: 0 }
      supplierCosts[supplierName].materials += cost
      supplierCosts[supplierName].total += cost
    }

    // Build supplier names list for fuzzy equipment matching
    const allSupplierNames = Object.values(supplierNamesMap).map(n => ({ upper: n.toUpperCase().trim(), name: n }))

    // Equipment costs by supplier
    for (const e of (equipRes.data || [])) {
      const cost = (e.hours || 0) * (e.hourly_rate || 0)
      if (cost === 0) continue
      const catalog = e.equipment_id ? equipCatalogMap[e.equipment_id] : null
      let supplierName = null
      // 1) From catalog supplier_id
      if (catalog?.supplier_id) {
        supplierName = supplierNamesMap[catalog.supplier_id] || null
      }
      // 2) Fallback: match equipment name against supplier names
      if (!supplierName && e.equipment_name) {
        const eqUpper = e.equipment_name.toUpperCase().trim()
        const match = allSupplierNames.find(s => eqUpper.includes(s.upper) || s.upper.includes(eqUpper))
        if (match) supplierName = match.name
      }
      supplierName = supplierName || 'Sin proveedor'
      if (!supplierCosts[supplierName]) supplierCosts[supplierName] = { name: supplierName, labor: 0, materials: 0, equipment: 0, expenses: 0, total: 0 }
      supplierCosts[supplierName].equipment += cost
      supplierCosts[supplierName].total += cost
    }

    // Expense costs by supplier
    for (const exp of (expensesRes.data || [])) {
      const cost = (exp.amount || 0) + (exp.tax_amount || 0)
      if (cost === 0) continue
      const supplierName = exp.supplier_id ? (supplierNamesMap[exp.supplier_id] || exp.supplier_name || 'Proveedor desconocido') : (exp.supplier_name || 'Sin proveedor')
      if (!supplierCosts[supplierName]) supplierCosts[supplierName] = { name: supplierName, labor: 0, materials: 0, equipment: 0, expenses: 0, total: 0 }
      supplierCosts[supplierName].expenses += cost
      supplierCosts[supplierName].total += cost
    }

    const bySupplier = Object.values(supplierCosts)
      .sort((a, b) => b.total - a.total)
      .map(s => ({
        ...s,
        labor: Math.round(s.labor * 100) / 100,
        materials: Math.round(s.materials * 100) / 100,
        equipment: Math.round(s.equipment * 100) / 100,
        expenses: Math.round(s.expenses * 100) / 100,
        total: Math.round(s.total * 100) / 100,
        pct: totalCost > 0 ? Math.round(s.total / totalCost * 10000) / 100 : 0,
      }))

    // ─── 3) By Equipment (name as shown in work logs) ────────────────────────
    const equipCategoryCosts = {}
    for (const e of (equipRes.data || [])) {
      const cost = (e.hours || 0) * (e.hourly_rate || 0)
      if (cost === 0) continue
      const name = e.equipment_name || 'Sin nombre'
      const catalog = e.equipment_id ? equipCatalogMap[e.equipment_id] : null
      const category = catalog?.category || ''
      const key = name
      if (!equipCategoryCosts[key]) equipCategoryCosts[key] = { name, category, cost: 0, hours: 0, entries: 0 }
      equipCategoryCosts[key].cost += cost
      equipCategoryCosts[key].hours += (e.hours || 0)
      equipCategoryCosts[key].entries += 1
    }
    const byEquipmentCategory = Object.values(equipCategoryCosts)
      .sort((a, b) => b.cost - a.cost)
      .map(c => ({
        name: c.name,
        category: c.category,
        cost: Math.round(c.cost * 100) / 100,
        hours: Math.round(c.hours * 100) / 100,
        entries: c.entries,
        pct: equipmentTotal > 0 ? Math.round(c.cost / equipmentTotal * 10000) / 100 : 0,
      }))

    // ─── 4) By Material ─────────────────────────────────
    const materialCosts = {}
    for (const m of (matsRes.data || [])) {
      const cost = (m.quantity || 0) * (m.unit_price || 0)
      if (cost === 0) continue
      const name = m.material_name || 'Material sin nombre'
      if (!materialCosts[name]) materialCosts[name] = { name, cost: 0, quantity: 0, unit: m.unit || 'ud', entries: 0 }
      materialCosts[name].cost += cost
      materialCosts[name].quantity += (m.quantity || 0)
      materialCosts[name].entries += 1
    }
    const byMaterial = Object.values(materialCosts)
      .sort((a, b) => b.cost - a.cost)
      .map(m => ({
        ...m,
        cost: Math.round(m.cost * 100) / 100,
        quantity: Math.round(m.quantity * 100) / 100,
        pct: materialsTotal > 0 ? Math.round(m.cost / materialsTotal * 10000) / 100 : 0,
      }))

    res.json({
      by_category: {
        labor: Math.round(laborTotal * 100) / 100,
        materials: Math.round(materialsTotal * 100) / 100,
        equipment: Math.round(equipmentTotal * 100) / 100,
        expenses: Math.round(expensesTotal * 100) / 100,
        total: Math.round(totalCost * 100) / 100,
      },
      by_supplier: bySupplier,
      by_equipment_category: byEquipmentCategory,
      by_material: byMaterial,
      date_range: { from: from || null, to: to || null },
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/work-logs/project/:projectId/cost-control
// Returns per-work-log profit: sale value of all linked partidas vs real cost of that log
router.get('/project/:projectId/cost-control', async (req, res, next) => {
  try {
    // Get all work logs for this project
    const { data: logs, error: logsErr } = await supabase
      .from('cons_work_logs')
      .select('id, date, description')
      .eq('project_id', req.params.projectId)
      .order('date', { ascending: false })

    if (logsErr) throw logsErr

    if (!logs || logs.length === 0) {
      return res.json({ logs: [], items: [], totals: { sale_value: 0, real_cost: 0, profit: 0 } })
    }

    const logIds = logs.map(l => l.id)

    // Get all budget links with executed_quantity
    const { data: links, error: linksErr } = await supabase
      .from('cons_work_log_budget_links')
      .select('work_log_id, budget_item_id, executed_quantity')
      .in('work_log_id', logIds)

    if (linksErr) throw linksErr

    // Get unique budget item IDs
    const itemIds = [...new Set((links || []).map(l => l.budget_item_id))]

    // Get budget item details (unit_price = sale price)
    let budgetItemsMap = {}
    if (itemIds.length > 0) {
      const { data: budgetItems, error: itemsErr } = await supabase
        .from('cons_budget_items')
        .select('id, code, name, unit, quantity, unit_price')
        .in('id', itemIds)
      if (itemsErr) throw itemsErr
      for (const bi of (budgetItems || [])) {
        budgetItemsMap[bi.id] = bi
      }
    }

    // Get real costs per work log (labor + materials + equipment + linked expenses)
    const [laborRes, matsRes, equipRes, expensesRes] = await Promise.all([
      supabase.from('cons_work_log_labor').select('work_log_id, worker_count, hours, hourly_rate').in('work_log_id', logIds),
      supabase.from('cons_work_log_materials').select('work_log_id, quantity, unit_price').in('work_log_id', logIds),
      supabase.from('cons_work_log_equipment').select('work_log_id, hours, hourly_rate').in('work_log_id', logIds),
      supabase.from('cons_project_expenses').select('work_log_id, amount, tax_amount').eq('project_id', req.params.projectId).not('work_log_id', 'is', null),
    ])

    const logCosts = {}
    const logExpensesCosts = {}
    for (const l of (laborRes.data || [])) {
      logCosts[l.work_log_id] = (logCosts[l.work_log_id] || 0) + l.worker_count * l.hours * l.hourly_rate
    }
    for (const m of (matsRes.data || [])) {
      logCosts[m.work_log_id] = (logCosts[m.work_log_id] || 0) + m.quantity * m.unit_price
    }
    for (const e of (equipRes.data || [])) {
      logCosts[e.work_log_id] = (logCosts[e.work_log_id] || 0) + e.hours * e.hourly_rate
    }
    // Add linked expenses (amount + tax_amount = total with VAT)
    for (const exp of (expensesRes.data || [])) {
      const total = (exp.amount || 0) + (exp.tax_amount || 0)
      logCosts[exp.work_log_id] = (logCosts[exp.work_log_id] || 0) + total
      logExpensesCosts[exp.work_log_id] = (logExpensesCosts[exp.work_log_id] || 0) + total
    }

    // Calculate sale value per work log (sum of executed_quantity * unit_price for all linked partidas)
    const logSaleValues = {}
    for (const link of (links || [])) {
      const bi = budgetItemsMap[link.budget_item_id]
      if (bi) {
        const saleValue = parseFloat(link.executed_quantity) * bi.unit_price
        logSaleValues[link.work_log_id] = (logSaleValues[link.work_log_id] || 0) + saleValue
      }
    }

    // Build per-log results
    const logResults = logs
      .filter(log => logCosts[log.id] || logSaleValues[log.id]) // only logs with data
      .map(log => {
        const saleValue = Math.round((logSaleValues[log.id] || 0) * 100) / 100
        const realCost = Math.round((logCosts[log.id] || 0) * 100) / 100
        const profit = Math.round((saleValue - realCost) * 100) / 100

        // Get linked partidas for this log
        const logLinks = (links || [])
          .filter(l => l.work_log_id === log.id)
          .map(l => {
            const bi = budgetItemsMap[l.budget_item_id]
            return {
              budget_item_id: l.budget_item_id,
              code: bi?.code || '',
              name: bi?.name || '',
              unit: bi?.unit || '',
              budget_quantity: bi?.quantity || 0,
              executed_quantity: parseFloat(l.executed_quantity),
              unit_price: bi?.unit_price || 0,
              line_sale_value: Math.round(parseFloat(l.executed_quantity) * (bi?.unit_price || 0) * 100) / 100,
            }
          })

        return {
          work_log_id: log.id,
          date: log.date,
          description: log.description,
          sale_value: saleValue,
          real_cost: realCost,
          expenses_cost: Math.round((logExpensesCosts[log.id] || 0) * 100) / 100,
          profit,
          profit_pct: saleValue > 0 ? Math.round((profit / saleValue) * 10000) / 100 : 0,
          status: profit > 0 ? 'favorable' : profit < 0 ? 'desfavorable' : 'neutro',
          linked_items: logLinks,
        }
      })

    // Also build aggregated per-item view (accumulated across all work logs)
    const itemAgg = {}
    for (const link of (links || [])) {
      const bi = budgetItemsMap[link.budget_item_id]
      if (!bi) continue
      if (!itemAgg[bi.id]) {
        itemAgg[bi.id] = {
          budget_item_id: bi.id,
          code: bi.code,
          name: bi.name,
          unit: bi.unit,
          budget_quantity: bi.quantity,
          budget_unit_price: bi.unit_price,
          budget_total: bi.quantity * bi.unit_price,
          executed_quantity: 0,
        }
      }
      itemAgg[bi.id].executed_quantity += parseFloat(link.executed_quantity)
    }

    const items = Object.values(itemAgg).map(item => {
      const pct = item.budget_quantity > 0 ? Math.round((item.executed_quantity / item.budget_quantity) * 10000) / 100 : 0
      return { ...item, executed_pct: pct }
    })

    const totals = {
      sale_value: logResults.reduce((s, l) => s + l.sale_value, 0),
      real_cost: logResults.reduce((s, l) => s + l.real_cost, 0),
      profit: logResults.reduce((s, l) => s + l.profit, 0),
    }

    res.json({ logs: logResults, items, totals })
  } catch (err) {
    next(err)
  }
})

export default router
