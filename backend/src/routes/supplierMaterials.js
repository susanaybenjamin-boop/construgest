import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

const router = Router()
router.use(authMiddleware)

// GET /api/supplier-materials/descriptions — all supplier descriptions for duplicate detection during import
router.get('/descriptions', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { data, error } = await supabase
      .from('cons_supplier_materials')
      .select('material_id, supplier_id, supplier_description, material:cons_materials(organization_id)')
      .not('supplier_description', 'is', null)

    if (error) throw error
    // Filter by org (through material's organization_id)
    const filtered = (data || []).filter(d => d.material?.organization_id === orgId)
    res.json(filtered.map(d => ({
      material_id: d.material_id,
      supplier_id: d.supplier_id,
      supplier_description: d.supplier_description,
    })))
  } catch (err) {
    next(err)
  }
})

// GET /api/supplier-materials/supplier/:supplierId — materials for a supplier
router.get('/supplier/:supplierId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_supplier_materials')
      .select('*, material:cons_materials(id, code, name, unit, unit_price, sale_price)')
      .eq('supplier_id', req.params.supplierId)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/supplier-materials/material/:materialId — suppliers for a material
router.get('/material/:materialId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_supplier_materials')
      .select('*, supplier:cons_suppliers(id, name, phone, email, rating, category)')
      .eq('material_id', req.params.materialId)
      .order('unit_price', { ascending: true })

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/supplier-materials — associate material to supplier
router.post('/', async (req, res, next) => {
  try {
    const { supplier_id, material_id, unit_price, notes } = req.body

    const { data, error } = await supabase
      .from('cons_supplier_materials')
      .insert({
        supplier_id,
        material_id,
        unit_price: parseFloat(unit_price),
        notes: notes || null,
        last_updated: new Date().toISOString().split('T')[0],
      })
      .select('*, material:cons_materials(id, code, name, unit, unit_price, sale_price)')
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/supplier-materials/:id — update price
router.put('/:id', async (req, res, next) => {
  try {
    const { unit_price, notes } = req.body

    // Construir el patch SOLO con las claves presentes en el body: si unit_price
    // no viene, parseFloat(undefined) sería NaN y mysql2 lo serializa como el
    // identificador `NaN` -> 500 "Unknown column 'NaN'".
    const patch = { last_updated: new Date().toISOString().split('T')[0] }
    if (unit_price !== undefined) patch.unit_price = parseFloat(unit_price)
    if (notes !== undefined) patch.notes = notes || null

    const { data, error } = await supabase
      .from('cons_supplier_materials')
      .update(patch)
      .eq('id', req.params.id)
      .select('*, material:cons_materials(id, code, name, unit, unit_price, sale_price)')
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/supplier-materials/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_supplier_materials')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
