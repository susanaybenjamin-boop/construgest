// ============================================================================
// PRES-1 — Clientes: ficha reutilizable por organización.
//
// Antes el cliente era texto suelto en el proyecto (`client_name`), sin NIF ni
// dirección fiscal, y había que reescribirlo en cada obra. Ahora el proyecto
// apunta a una ficha (`cons_projects.client_id`) y el presupuesto en PDF puede
// imprimir los datos fiscales en la portada.
//
// Mismo patrón que routes/suppliers.js (shim de MariaDB compatible con Supabase).
// ============================================================================
import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

const router = Router()

router.use(authMiddleware)

/** Campos que el cliente puede mandar. El resto se ignora. */
function pickFields(body) {
  const {
    name, legal_name, tax_id, contact_name, phone, email,
    address, postal_code, city, province, country, notes,
  } = body || {}
  return {
    name, legal_name, tax_id, contact_name, phone, email,
    address, postal_code, city, province, country, notes,
  }
}

// GET /api/clients — lista de la organización (solo activos salvo ?all=true)
router.get('/', async (req, res, next) => {
  try {
    let query = supabase
      .from('cons_clients')
      .select('*')
      .eq('organization_id', req.user.organization_id)
      .order('name', { ascending: true })

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

// POST /api/clients — crear ficha
router.post('/', async (req, res, next) => {
  try {
    const f = pickFields(req.body)
    if (!f.name || !String(f.name).trim()) {
      return res.status(400).json({ error: 'El nombre del cliente es obligatorio' })
    }

    const { data, error } = await supabase
      .from('cons_clients')
      .insert({
        organization_id: req.user.organization_id,
        name: String(f.name).trim(),
        legal_name: f.legal_name || null,
        tax_id: f.tax_id || null,
        contact_name: f.contact_name || null,
        phone: f.phone || null,
        email: f.email || null,
        address: f.address || null,
        postal_code: f.postal_code || null,
        city: f.city || null,
        province: f.province || null,
        country: f.country || 'ES',
        notes: f.notes || null,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/clients/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_clients')
      .select('*')
      .eq('id', req.params.id)
      .eq('organization_id', req.user.organization_id)
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Cliente no encontrado' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/clients/:id
router.put('/:id', async (req, res, next) => {
  try {
    const f = pickFields(req.body)
    if (f.name !== undefined && !String(f.name || '').trim()) {
      return res.status(400).json({ error: 'El nombre del cliente es obligatorio' })
    }
    if (f.name !== undefined) f.name = String(f.name).trim()

    const { data, error } = await supabase
      .from('cons_clients')
      .update({
        ...f,
        is_active: req.body?.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('organization_id', req.user.organization_id)
      .select()
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Cliente no encontrado' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/clients/:id — baja lógica (is_active = false).
// Los proyectos que lo usen NO se tocan: siguen apuntando a la ficha.
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_clients')
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
