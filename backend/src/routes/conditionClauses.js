// ============================================================================
// COND-1 — Biblioteca de cláusulas del capítulo de condiciones.
//
// Las cláusulas que se repiten obra tras obra (validez, forma de pago,
// exclusiones…), para insertarlas de un clic en vez de reescribirlas. El texto
// puede llevar huecos {{etiqueta|valor}} que la app pide al insertar.
//
// Mismo patrón que routes/clients.js.
// ============================================================================
import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

const router = Router()

router.use(authMiddleware)

const BLOQUES = new Set(['general', 'economica', 'exclusion'])

function pickFields(body) {
  const { block, tag, title, body: texto, sort_order } = body || {}
  return { block, tag, title, body: texto, sort_order }
}

// GET /api/condition-clauses — las de la organización (solo activas salvo ?all=true)
router.get('/', async (req, res, next) => {
  try {
    let query = supabase
      .from('cons_condition_clauses')
      .select('*')
      .eq('organization_id', req.user.organization_id)
      .order('sort_order', { ascending: true })

    if (req.query.all !== 'true') query = query.eq('is_active', true)

    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/condition-clauses
router.post('/', async (req, res, next) => {
  try {
    const f = pickFields(req.body)
    if (!f.title || !String(f.title).trim()) {
      return res.status(400).json({ error: 'El título de la cláusula es obligatorio' })
    }
    if (!f.body || !String(f.body).trim()) {
      return res.status(400).json({ error: 'El texto de la cláusula es obligatorio' })
    }
    if (f.block && !BLOQUES.has(f.block)) {
      return res.status(400).json({ error: `Bloque no válido: ${f.block}` })
    }

    const { data, error } = await supabase
      .from('cons_condition_clauses')
      .insert({
        organization_id: req.user.organization_id,
        block: f.block || 'general',
        tag: f.tag || null,
        title: String(f.title).trim(),
        body: f.body,
        sort_order: Number(f.sort_order) || 0,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/condition-clauses/:id
router.put('/:id', async (req, res, next) => {
  try {
    const f = pickFields(req.body)
    if (f.block !== undefined && f.block !== null && !BLOQUES.has(f.block)) {
      return res.status(400).json({ error: `Bloque no válido: ${f.block}` })
    }
    if (f.title !== undefined && !String(f.title || '').trim()) {
      return res.status(400).json({ error: 'El título de la cláusula es obligatorio' })
    }

    const { data, error } = await supabase
      .from('cons_condition_clauses')
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
    if (!data) return res.status(404).json({ error: 'Cláusula no encontrada' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/condition-clauses/:id — baja lógica
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_condition_clauses')
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
