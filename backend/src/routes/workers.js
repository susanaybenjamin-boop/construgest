import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/supabase.js'

const router = Router()
router.use(authMiddleware)

// GET /api/workers — List workers for the organization
router.get('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { status, role, search } = req.query
    const { data, error } = await supabase.rpc('rpc_list_workers', {
      p_org_id: orgId,
      p_status: status || null,
      p_role: role || null,
      p_search: search || null,
    })
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    next(err)
  }
})

// GET /api/workers/roles — Get distinct roles
router.get('/roles', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { data, error } = await supabase.rpc('rpc_list_workers', {
      p_org_id: orgId,
    })
    if (error) throw error
    const roles = [...new Set((data || []).map(w => w.role))].sort()
    res.json(roles)
  } catch (err) {
    next(err)
  }
})

// GET /api/workers/:id — Get single worker
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('rpc_get_worker', {
      p_id: req.params.id,
    })
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/workers — Create worker
router.post('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const payload = { ...req.body, organization_id: orgId }
    const { data, error } = await supabase.rpc('rpc_create_worker', {
      p_data: payload,
    })
    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/workers/:id — Update worker
router.put('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('rpc_update_worker', {
      p_id: req.params.id,
      p_data: req.body,
    })
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/workers/:id — Delete worker
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase.rpc('rpc_delete_worker', {
      p_id: req.params.id,
    })
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
