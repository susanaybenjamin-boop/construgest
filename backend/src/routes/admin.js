import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

// Panel de administración: SOLO gestión de usuarios (master org).
// El antiguo panel de consumo/cuotas/pricing de IA (cons_ai_*, mcp-ai-tracker) se
// desmanteló al pasar la IA a local y gratis (AI-5).

const router = Router()

// Middleware: solo el owner de la master org accede a estas rutas.
async function masterOrgOnly(req, res, next) {
  const masterOrgId = process.env.MASTER_ORG_ID
  if (!masterOrgId) {
    return res.status(403).json({ error: 'Panel de administración no configurado' })
  }
  if (req.user.organization_id !== masterOrgId) {
    return res.status(403).json({ error: 'No tienes permisos de superadministrador' })
  }
  next()
}

// GET /api/admin/users — lista de usuarios con su org.
router.get('/users', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { data: users, error } = await supabase
      .from('cons_users')
      .select('id, email, full_name, avatar_url, is_active, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    const userIds = users.map(u => u.id)
    const { data: memberships } = await supabase
      .from('cons_organization_members')
      .select('user_id, organization_id, role')
      .in('user_id', userIds)

    const { data: orgs } = await supabase
      .from('cons_organizations')
      .select('id, name')

    const orgMap = {}
    for (const org of (orgs || [])) orgMap[org.id] = org.name

    const enriched = users.map(u => {
      const mem = (memberships || []).find(m => m.user_id === u.id)
      return {
        ...u,
        organization_id: mem?.organization_id || null,
        organization_name: mem ? (orgMap[mem.organization_id] || 'Sin nombre') : null,
        role: mem?.role || null,
      }
    })

    res.json(enriched)
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/users/:id/toggle-active — activar/desactivar un usuario.
router.put('/users/:id/toggle-active', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { id } = req.params
    if (id === req.user.id) {
      return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' })
    }

    const { data: user, error: fetchErr } = await supabase
      .from('cons_users')
      .select('id, is_active')
      .eq('id', id)
      .single()

    if (fetchErr || !user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const newStatus = !user.is_active
    const { error } = await supabase
      .from('cons_users')
      .update({ is_active: newStatus })
      .eq('id', id)

    if (error) throw error
    res.json({ id, is_active: newStatus })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/users/:id — borra un usuario y su org (si era owner).
router.delete('/users/:id', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { id } = req.params
    if (id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' })
    }

    const { data: mem } = await supabase
      .from('cons_organization_members')
      .select('organization_id')
      .eq('user_id', id)
      .single()

    await supabase.from('cons_organization_members').delete().eq('user_id', id)

    if (mem?.organization_id) {
      await supabase
        .from('cons_organizations')
        .delete()
        .eq('id', mem.organization_id)
        .eq('owner_id', id)
    }

    const { error } = await supabase.from('cons_users').delete().eq('id', id)
    if (error) throw error

    res.json({ deleted: true })
  } catch (err) {
    next(err)
  }
})

export default router
