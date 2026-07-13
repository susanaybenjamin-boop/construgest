import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/supabase.js'

const router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/suppliers - List all suppliers for user's org
router.get('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    let query = supabase
      .from('cons_suppliers')
      .select('*')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })

    // By default only active suppliers, unless ?all=true
    if (req.query.all !== 'true') {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/suppliers - Create supplier
router.post('/', async (req, res, next) => {
  try {
    const {
      name, tax_id, contact_name, phone, email, address,
      city, province, postal_code, website, category, notes, rating,
    } = req.body

    if (!name) {
      return res.status(400).json({ error: 'El nombre es obligatorio' })
    }

    const { data, error } = await supabase
      .from('cons_suppliers')
      .insert({
        organization_id: req.user.organization_id,
        name,
        tax_id: tax_id || null,
        contact_name: contact_name || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        city: city || null,
        province: province || null,
        postal_code: postal_code || null,
        website: website || null,
        category: category || null,
        notes: notes || null,
        rating: rating && rating >= 1 && rating <= 5 ? rating : null,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/suppliers/:id - Get supplier by id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_suppliers')
      .select('*')
      .eq('id', req.params.id)
      .eq('organization_id', req.user.organization_id)
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/suppliers/:id - Update supplier
router.put('/:id', async (req, res, next) => {
  try {
    const {
      name, tax_id, contact_name, phone, email, address,
      city, province, postal_code, website, category, notes, rating, is_active,
    } = req.body

    const { data, error } = await supabase
      .from('cons_suppliers')
      .update({
        name, tax_id, contact_name, phone, email, address,
        city, province, postal_code, website, category, notes,
        rating: rating && rating >= 1 && rating <= 5 ? rating : (rating === 0 ? null : rating),
        is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('organization_id', req.user.organization_id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/suppliers/:id - Soft delete (set is_active = false)
router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_suppliers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('organization_id', req.user.organization_id)
      .select()
      .single()

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
