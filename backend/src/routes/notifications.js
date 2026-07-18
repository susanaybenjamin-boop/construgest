import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

const router = Router()
router.use(authMiddleware)

// GET /api/notifications - Listar notificaciones (50 mas recientes)
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_notifications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_notifications')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('read', false)

    if (error) throw error
    res.json({ count: (data || []).length })
  } catch (err) {
    next(err)
  }
})

// PUT /api/notifications/:id/read - Marcar como leida
router.put('/:id/read', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_notifications')
      .update({ read: true })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// PUT /api/notifications/read-all - Marcar todas como leidas
router.put('/read-all', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_notifications')
      .update({ read: true })
      .eq('user_id', req.user.id)
      .eq('read', false)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/notifications/read - Eliminar todas las leidas
router.delete('/read', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_notifications')
      .delete()
      .eq('user_id', req.user.id)
      .eq('read', true)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
