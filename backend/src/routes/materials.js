import { Router } from 'express'
import { randomUUID } from 'crypto'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

const router = Router()
router.use(authMiddleware)

// GET /api/materials
router.get('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { search, category_id } = req.query

    let query = supabase
      .from('cons_materials')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name')

    if (category_id) {
      query = query.eq('category_id', category_id)
    }

    if (search) {
      query = query.or(`name.ilike."%${search}%",code.ilike."%${search}%"`)
    }

    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/materials/prefixes - returns unique code prefixes (e.g. LEROY from LEROY-001)
// Optional query: ?supplier_id=xxx — filters to prefixes used by that supplier's linked materials
router.get('/prefixes', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { supplier_id } = req.query

    let materialIds = null
    if (supplier_id) {
      const { data: links } = await supabase
        .from('cons_supplier_materials')
        .select('material_id')
        .eq('supplier_id', supplier_id)
      materialIds = (links || []).map(l => l.material_id)
      if (materialIds.length === 0) return res.json([])
    }

    let query = supabase
      .from('cons_materials')
      .select('code')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .like('code', '%-%')

    if (materialIds) {
      query = query.in('id', materialIds)
    }

    const { data, error } = await query
    if (error) throw error

    const prefixMap = new Map()
    for (const row of (data || [])) {
      if (!row.code) continue
      const match = row.code.match(/^(.+)-\d+$/)
      if (match) {
        const prefix = match[1].toUpperCase().trim()
        prefixMap.set(prefix, (prefixMap.get(prefix) || 0) + 1)
      }
    }

    const prefixes = Array.from(prefixMap.entries())
      .map(([prefix, count]) => ({ prefix, count }))
      .sort((a, b) => b.count - a.count) // most used first

    res.json(prefixes)
  } catch (err) {
    next(err)
  }
})

// GET /api/materials/next-code?prefix=LEROY
router.get('/next-code', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { prefix } = req.query
    if (!prefix) return res.status(400).json({ error: 'prefix is required' })

    const upperPrefix = prefix.toUpperCase()
    const { data, error } = await supabase
      .from('cons_materials')
      .select('code')
      .eq('organization_id', orgId)
      .ilike('code', `${upperPrefix}-%`)

    if (error) throw error

    let maxNum = 0
    let maxPadding = 3 // default minimum padding
    for (const row of (data || [])) {
      const match = row.code.match(new RegExp(`^${upperPrefix}-(\\d+)$`, 'i'))
      if (match) {
        const numStr = match[1]
        const num = parseInt(numStr, 10)
        if (num > maxNum) maxNum = num
        // Detect padding width from existing codes
        if (numStr.length > maxPadding) maxPadding = numStr.length
      }
    }

    const nextCode = `${upperPrefix}-${String(maxNum + 1).padStart(maxPadding, '0')}`
    res.json({ next_code: nextCode, prefix: upperPrefix, last_number: maxNum })
  } catch (err) {
    next(err)
  }
})

// GET /api/materials/comparison — pivot table data for price comparison
router.get('/comparison', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id

    const { data: materials, error: matErr } = await supabase
      .from('cons_materials')
      .select('id, code, name, unit, unit_price, material_group_id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name')
    if (matErr) throw matErr

    const materialIds = materials.map(m => m.id)
    let supplierMats = []
    if (materialIds.length > 0) {
      const { data, error: smErr } = await supabase
        .from('cons_supplier_materials')
        .select('material_id, supplier_id, unit_price, supplier:cons_suppliers(id, name)')
        .in('material_id', materialIds)
      if (smErr) throw smErr
      supplierMats = data || []
    }

    const { data: suppliers, error: supErr } = await supabase
      .from('cons_suppliers')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name')
    if (supErr) throw supErr

    // Build groups
    const grouped = new Map()
    const ungrouped = []
    for (const mat of materials) {
      if (mat.material_group_id) {
        if (!grouped.has(mat.material_group_id)) grouped.set(mat.material_group_id, [])
        grouped.get(mat.material_group_id).push(mat)
      } else {
        ungrouped.push(mat)
      }
    }

    // Price map: material_id -> { supplier_id: price }
    const priceMap = new Map()
    for (const sm of supplierMats) {
      if (!priceMap.has(sm.material_id)) priceMap.set(sm.material_id, {})
      priceMap.get(sm.material_id)[sm.supplier_id] = Number(sm.unit_price)
    }

    const rows = []

    for (const [groupId, mats] of grouped) {
      const supplierPrices = {}
      for (const mat of mats) {
        const prices = priceMap.get(mat.id) || {}
        for (const [supId, price] of Object.entries(prices)) {
          if (!supplierPrices[supId] || price < supplierPrices[supId].price) {
            supplierPrices[supId] = { price, material_code: mat.code, material_name: mat.name }
          }
        }
      }
      rows.push({
        type: 'group',
        group_id: groupId,
        canonical_name: mats[0].name,
        unit: mats[0].unit,
        materials: mats,
        supplier_prices: supplierPrices,
      })
    }

    for (const mat of ungrouped) {
      const prices = priceMap.get(mat.id) || {}
      rows.push({
        type: 'single',
        group_id: null,
        canonical_name: mat.name,
        unit: mat.unit,
        materials: [mat],
        supplier_prices: Object.fromEntries(
          Object.entries(prices).map(([supId, price]) => [supId, { price, material_code: mat.code, material_name: mat.name }])
        ),
      })
    }

    rows.sort((a, b) => a.canonical_name.localeCompare(b.canonical_name))
    res.json({ rows, suppliers })
  } catch (err) {
    next(err)
  }
})

// PUT /api/materials/group — group materials as equivalent
router.put('/group', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { material_ids } = req.body
    if (!material_ids || !Array.isArray(material_ids) || material_ids.length < 2) {
      return res.status(400).json({ error: 'Se necesitan al menos 2 materiales' })
    }

    const { data: mats, error: fetchErr } = await supabase
      .from('cons_materials')
      .select('id, material_group_id')
      .in('id', material_ids)
      .eq('organization_id', orgId)
    if (fetchErr) throw fetchErr
    if (mats.length !== material_ids.length) {
      return res.status(403).json({ error: 'Algunos materiales no pertenecen a esta organización' })
    }

    const existingGroupIds = [...new Set(mats.map(m => m.material_group_id).filter(Boolean))]
    let groupId
    if (existingGroupIds.length > 0) {
      groupId = existingGroupIds[0]
      for (const oldGroupId of existingGroupIds.slice(1)) {
        await supabase
          .from('cons_materials')
          .update({ material_group_id: groupId })
          .eq('material_group_id', oldGroupId)
          .eq('organization_id', orgId)
      }
    } else {
      groupId = randomUUID()
    }

    const { data, error } = await supabase
      .from('cons_materials')
      .update({ material_group_id: groupId })
      .in('id', material_ids)
      .eq('organization_id', orgId)
      .select()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/materials/ungroup/:id — remove a material from its group
router.delete('/ungroup/:id', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id

    const { data: mat, error: fetchErr } = await supabase
      .from('cons_materials')
      .select('id, material_group_id')
      .eq('id', req.params.id)
      .eq('organization_id', orgId)
      .single()
    if (fetchErr) throw fetchErr
    if (!mat.material_group_id) return res.json({ success: true })

    const groupId = mat.material_group_id
    await supabase.from('cons_materials').update({ material_group_id: null }).eq('id', req.params.id)

    // If only 1 remains, dissolve group
    const { data: remaining } = await supabase
      .from('cons_materials')
      .select('id')
      .eq('material_group_id', groupId)
      .eq('organization_id', orgId)
    if (remaining && remaining.length === 1) {
      await supabase.from('cons_materials').update({ material_group_id: null }).eq('id', remaining[0].id)
    }

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/materials
router.post('/', async (req, res, next) => {
  try {
    const { category_id, supplier_id, ...rest } = req.body
    const material = {
      ...rest,
      organization_id: req.user.organization_id,
      category_id: category_id || null,
      supplier_id: supplier_id || null,
    }

    const { data, error } = await supabase
      .from('cons_materials')
      .insert(material)
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/materials/:id
router.put('/:id', async (req, res, next) => {
  try {
    // Fetch current material to check if price changed
    const { data: current, error: fetchError } = await supabase
      .from('cons_materials')
      .select('unit_price')
      .eq('id', req.params.id)
      .single()

    if (fetchError) throw fetchError

    // If unit_price changed, log a price history entry
    if (req.body.unit_price !== undefined && current && Number(req.body.unit_price) !== Number(current.unit_price)) {
      await supabase
        .from('cons_material_price_history')
        .insert({
          material_id: req.params.id,
          unit_price: Number(req.body.unit_price),
          source: 'price_update',
          notes: `Precio actualizado de ${current.unit_price} a ${req.body.unit_price}`,
        })
    }

    const { category_id, supplier_id, ...rest } = req.body
    const { data, error } = await supabase
      .from('cons_materials')
      .update({
        ...rest,
        category_id: category_id || null,
        supplier_id: supplier_id || null,
        updated_at: new Date().toISOString(),
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

// DELETE /api/materials/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_materials')
      .update({ is_active: false })
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// GET /api/materials/categories
router.get('/categories', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_material_categories')
      .select('*')
      .order('sort_order')

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/materials/smart-import
// Receives extracted materials, detects duplicates, creates/updates, links to supplier
router.post('/smart-import', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { supplier_id: existingSupplierId, supplier_data, materials, code_prefix: requestedPrefix } = req.body

    if (!materials || !Array.isArray(materials) || materials.length === 0) {
      return res.status(400).json({ error: 'materials array is required' })
    }

    // 1. Create supplier if new supplier data provided
    let supplierId = existingSupplierId || null
    if (!supplierId && supplier_data?.name) {
      const { data: newSupplier, error: supErr } = await supabase
        .from('cons_suppliers')
        .insert({
          organization_id: orgId,
          name: supplier_data.name,
          category: supplier_data.category || null,
          phone: supplier_data.phone || null,
          email: supplier_data.email || null,
          notes: supplier_data.notes || null,
          is_active: true,
        })
        .select()
        .single()
      if (supErr) throw supErr
      supplierId = newSupplier.id
    }

    // 2. Code prefix: use frontend-specified prefix, or auto-detect from supplier
    let codePrefix = 'IMP'
    if (requestedPrefix && requestedPrefix.trim()) {
      codePrefix = requestedPrefix.trim().toUpperCase()
    } else if (supplierId) {
      // Auto-detect from supplier's existing linked materials
      const { data: linkedMats } = await supabase
        .from('cons_supplier_materials')
        .select('material_id')
        .eq('supplier_id', supplierId)
      if (linkedMats && linkedMats.length > 0) {
        const matIds = linkedMats.map(lm => lm.material_id)
        const { data: matCodes } = await supabase
          .from('cons_materials')
          .select('code')
          .eq('organization_id', orgId)
          .in('id', matIds)
        const prefixCounts = {}
        for (const row of (matCodes || [])) {
          const m = row.code?.match(/^(.+)-\d+$/)
          if (m) { prefixCounts[m[1]] = (prefixCounts[m[1]] || 0) + 1 }
        }
        const sorted = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1])
        if (sorted.length > 0) codePrefix = sorted[0][0]
      }
      if (codePrefix === 'IMP') {
        const { data: sup } = await supabase.from('cons_suppliers').select('name').eq('id', supplierId).single()
        if (sup?.name) codePrefix = sup.name.replace(/[^A-Za-z0-9]/g, '').substring(0, 6).toUpperCase() || 'IMP'
      }
    } else if (supplier_data?.name) {
      codePrefix = supplier_data.name.replace(/[^A-Za-z0-9]/g, '').substring(0, 6).toUpperCase() || 'IMP'
    }

    // Find max existing code number for this prefix
    const { data: existingCodes } = await supabase
      .from('cons_materials')
      .select('code')
      .eq('organization_id', orgId)
      .ilike('code', `${codePrefix}-%`)
    let codeCounter = 0
    for (const row of (existingCodes || [])) {
      const match = row.code?.match(new RegExp(`^${codePrefix}-(\\d+)$`, 'i'))
      if (match) { const n = parseInt(match[1], 10); if (n > codeCounter) codeCounter = n }
    }

    // 3. Process each material
    const results = { created: 0, updated: 0, skipped: 0, supplier_links: 0, supplier_id: supplierId }

    for (const mat of materials) {
      const { name, unit, unit_price, code, action, existing_material_id } = mat
      if (action === 'skip') { results.skipped++; continue }

      let materialId = existing_material_id || null
      const price = parseFloat(unit_price)

      if (action === 'update' && materialId) {
        // Fetch current price for history logging
        const { data: current } = await supabase
          .from('cons_materials')
          .select('unit_price')
          .eq('id', materialId)
          .single()

        if (current && Number(current.unit_price) !== price) {
          await supabase.from('cons_material_price_history').insert({
            material_id: materialId,
            unit_price: price,
            supplier_id: supplierId,
            source: 'import',
            notes: 'Importado desde listado de proveedor',
          })
          await supabase
            .from('cons_materials')
            .update({ unit_price: price, updated_at: new Date().toISOString() })
            .eq('id', materialId)
        }
        results.updated++
      } else {
        // Create new material with auto-generated code
        codeCounter++
        const autoCode = code || `${codePrefix}-${String(codeCounter).padStart(3, '0')}`
        const { data: newMat, error: createErr } = await supabase
          .from('cons_materials')
          .insert({
            organization_id: orgId,
            name: name.trim(),
            unit: (unit || 'ud').trim(),
            unit_price: price,
            sale_price: Math.round(price * 1.2 * 100) / 100,
            code: autoCode,
            is_active: true,
          })
          .select()
          .single()
        if (createErr) throw createErr
        materialId = newMat.id
        results.created++
      }

      // 3. Create or update supplier_material link (save supplier description for future matching)
      if (materialId && supplierId) {
        const supplierDesc = (name || '').trim() // original description from import
        const { data: existingLink } = await supabase
          .from('cons_supplier_materials')
          .select('id')
          .eq('supplier_id', supplierId)
          .eq('material_id', materialId)
          .maybeSingle()

        if (existingLink) {
          await supabase
            .from('cons_supplier_materials')
            .update({ unit_price: price, supplier_description: supplierDesc, last_updated: new Date().toISOString().split('T')[0] })
            .eq('id', existingLink.id)
        } else {
          await supabase.from('cons_supplier_materials').insert({
            supplier_id: supplierId,
            material_id: materialId,
            unit_price: price,
            supplier_description: supplierDesc,
            last_updated: new Date().toISOString().split('T')[0],
          })
        }
        results.supplier_links++
      }
    }

    res.json(results)
  } catch (err) {
    next(err)
  }
})

// POST /api/materials/bulk-import
router.post('/bulk-import', async (req, res, next) => {
  try {
    const { materials } = req.body
    const orgId = req.user.organization_id

    const toInsert = materials.map(m => ({ ...m, organization_id: orgId }))

    const { data, error } = await supabase
      .from('cons_materials')
      .insert(toInsert)
      .select()

    if (error) throw error
    res.json({ imported: (data || []).length })
  } catch (err) {
    next(err)
  }
})

// GET /api/materials/:id/price-history
router.get('/:id/price-history', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_material_price_history')
      .select('*')
      .eq('material_id', req.params.id)
      .order('effective_date', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) { next(err) }
})

// POST /api/materials/:id/price-history
router.post('/:id/price-history', async (req, res, next) => {
  try {
    const { unit_price, supplier_id, effective_date, source, notes } = req.body
    const { data, error } = await supabase
      .from('cons_material_price_history')
      .insert({ material_id: req.params.id, unit_price, supplier_id, effective_date, source, notes })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { next(err) }
})

export default router
