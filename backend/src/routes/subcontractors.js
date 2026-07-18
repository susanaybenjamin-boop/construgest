import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

const router = Router()
router.use(authMiddleware)

// ─── Subcontractors CRUD ──────────────────────────────────────────

// GET /api/subcontractors — List subcontractors
router.get('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { search, specialty, is_active } = req.query
    const { data, error } = await supabase.rpc('rpc_list_subcontractors', {
      p_org_id: orgId,
      p_specialty: specialty || null,
      p_is_active: is_active !== undefined ? is_active : null,
      p_search: search || null,
    })
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    next(err)
  }
})

// GET /api/subcontractors/specialties — Get distinct specialties
router.get('/specialties', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { data, error } = await supabase.rpc('rpc_get_sub_specialties', {
      p_org_id: orgId,
    })
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    next(err)
  }
})

// GET /api/subcontractors/:id — Get subcontractor with documents
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('rpc_get_subcontractor', {
      p_id: req.params.id,
      p_org_id: req.user.organization_id,
    })
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Subcontractor not found' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/subcontractors — Create subcontractor
router.post('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const payload = { ...req.body, organization_id: orgId }
    const { data, error } = await supabase.rpc('rpc_create_subcontractor', {
      p_data: payload,
    })
    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/subcontractors/:id — Update subcontractor
router.put('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('rpc_update_subcontractor', {
      p_id: req.params.id,
      p_org_id: req.user.organization_id,
      p_data: req.body,
    })
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Subcontractor not found' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/subcontractors/:id — Delete subcontractor (cascades docs)
router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('rpc_delete_subcontractor', {
      p_id: req.params.id,
      p_org_id: req.user.organization_id,
    })
    if (error) throw error
    if (!data || !data.affected) return res.status(404).json({ error: 'Subcontractor not found' })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ─── PRL Documents ────────────────────────────────────────────────

// GET /api/subcontractors/:id/documents — List documents
router.get('/:id/documents', async (req, res, next) => {
  try {
    const { project_id } = req.query
    const { data, error } = await supabase.rpc('rpc_list_sub_documents', {
      p_sub_id: req.params.id,
      p_org_id: req.user.organization_id,
      p_project_id: project_id || null,
    })
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    next(err)
  }
})

// POST /api/subcontractors/:id/documents — Add document
router.post('/:id/documents', async (req, res, next) => {
  try {
    const payload = { ...req.body, subcontractor_id: req.params.id }
    const { data, error } = await supabase.rpc('rpc_create_sub_document', {
      p_org_id: req.user.organization_id,
      p_data: payload,
    })
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Subcontractor not found' })
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/subcontractors/documents/:docId — Update document
router.put('/documents/:docId', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('rpc_update_sub_document', {
      p_id: req.params.docId,
      p_org_id: req.user.organization_id,
      p_data: req.body,
    })
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Document not found' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/subcontractors/documents/:docId — Delete document
router.delete('/documents/:docId', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('rpc_delete_sub_document', {
      p_id: req.params.docId,
      p_org_id: req.user.organization_id,
    })
    if (error) throw error
    if (!data || !data.affected) return res.status(404).json({ error: 'Document not found' })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// GET /api/subcontractors/documents/expiring — Documents expiring soon
router.get('/documents/expiring', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const daysAhead = parseInt(req.query.days) || 30
    const { data, error } = await supabase.rpc('rpc_get_expiring_documents', {
      p_org_id: orgId,
      p_days: daysAhead,
    })
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    next(err)
  }
})

export default router
