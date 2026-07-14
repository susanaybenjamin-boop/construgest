// Notificaciones LOCAL: persiste en MariaDB (cons_notifications) y entrega en
// vivo por el hub WebSocket propio (topic `user:{userId}`, event 'notification').
// Antes insertaba en la nube (Supabase) y hacía broadcast por Supabase Realtime.
import supabase from '../db/local.js'
import { publish } from './realtimeHub.js'

/**
 * Crea una notificación en la BD local y la entrega en vivo al usuario destino.
 */
export async function createNotification(userId, type, title, body, data = {}) {
  const { data: notification, error } = await supabase
    .from('cons_notifications')
    .insert({ user_id: userId, type, title, body, data })
    .select()
    .single()

  if (error) {
    console.error('Error creating notification:', error.message)
    return null
  }

  publish(`user:${userId}`, 'notification', notification)
  return notification
}

export default { createNotification }
