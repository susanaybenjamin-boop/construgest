import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

const router = Router()
router.use(authMiddleware)

// GET /api/equipment-catalog — List equipment for the organization
router.get('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { status, type, search } = req.query
    const { data, error } = await supabase.rpc('rpc_list_equipment', {
      p_org_id: orgId,
      p_status: status || null,
      p_type: type || null,
      p_search: search || null,
    })
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    next(err)
  }
})

// GET /api/equipment-catalog/categories — Get distinct categories
router.get('/categories', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { data, error } = await supabase.rpc('rpc_list_equipment', {
      p_org_id: orgId,
    })
    if (error) throw error
    const categories = [...new Set((data || []).filter(e => e.category).map(e => e.category))].sort()
    res.json(categories)
  } catch (err) {
    next(err)
  }
})

// GET /api/equipment-catalog/:id — Get single equipment
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('rpc_get_equipment', {
      p_id: req.params.id,
      p_org_id: req.user.organization_id,
    })
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Equipment not found' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/equipment-catalog — Create equipment
router.post('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const payload = { ...req.body, organization_id: orgId }
    const { data, error } = await supabase.rpc('rpc_create_equipment', {
      p_data: payload,
    })
    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/equipment-catalog/:id — Update equipment
router.put('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('rpc_update_equipment', {
      p_id: req.params.id,
      p_org_id: req.user.organization_id,
      p_data: req.body,
    })
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Equipment not found' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/equipment-catalog/:id — Delete equipment
router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('rpc_delete_equipment', {
      p_id: req.params.id,
      p_org_id: req.user.organization_id,
    })
    if (error) throw error
    if (!data || !data.affected) return res.status(404).json({ error: 'Equipment not found' })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ─── Equipment ↔ Supplier Materials (portes, etc.) ───────────────

// Verifica que el equipo pertenece a la org del usuario (evita IDOR al operar
// materiales de un equipo ajeno conociendo su id). Devuelve true si es propio.
async function equipmentBelongsToOrg(equipmentId, orgId) {
  const { data, error } = await supabase.rpc('rpc_get_equipment', {
    p_id: equipmentId,
    p_org_id: orgId,
  })
  if (error) throw error
  return !!data
}

// GET /api/equipment-catalog/:id/materials — Get linked supplier materials for an equipment
router.get('/:id/materials', async (req, res, next) => {
  try {
    if (!(await equipmentBelongsToOrg(req.params.id, req.user.organization_id))) {
      return res.status(404).json({ error: 'Equipment not found' })
    }
    const { data, error } = await supabase
      .from('cons_equipment_materials')
      .select('*, supplier_material:cons_supplier_materials(*, material:cons_materials(id, code, name, unit, unit_price, sale_price), supplier:cons_suppliers(id, name))')
      .eq('equipment_id', req.params.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    next(err)
  }
})

// POST /api/equipment-catalog/:id/materials — Link a supplier material to equipment
router.post('/:id/materials', async (req, res, next) => {
  try {
    if (!(await equipmentBelongsToOrg(req.params.id, req.user.organization_id))) {
      return res.status(404).json({ error: 'Equipment not found' })
    }
    const { supplier_material_id, notes } = req.body
    const { data, error } = await supabase
      .from('cons_equipment_materials')
      .insert({
        equipment_id: req.params.id,
        supplier_material_id,
        notes: notes || null,
      })
      .select('*, supplier_material:cons_supplier_materials(*, material:cons_materials(id, code, name, unit, unit_price, sale_price), supplier:cons_suppliers(id, name))')
      .single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/equipment-catalog/:id/materials/:linkId — Unlink a supplier material
router.delete('/:id/materials/:linkId', async (req, res, next) => {
  try {
    if (!(await equipmentBelongsToOrg(req.params.id, req.user.organization_id))) {
      return res.status(404).json({ error: 'Equipment not found' })
    }
    const { error } = await supabase
      .from('cons_equipment_materials')
      .delete()
      .eq('id', req.params.linkId)
      .eq('equipment_id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
