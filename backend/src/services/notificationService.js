import supabase from '../db/supabase.js'

/**
 * Crea una notificacion en DB y la envia por Supabase Broadcast al usuario destino
 */
export async function createNotification(userId, type, title, body, data = {}) {
  // Insertar en DB
  const { data: notification, error } = await supabase
    .from('cons_notifications')
    .insert({
      user_id: userId,
      type,
      title,
      body,
      data,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating notification:', error.message)
    return null
  }

  // Broadcast via Supabase Realtime
  try {
    const channel = supabase.channel(`user:${userId}`)
    await channel.send({
      type: 'broadcast',
      event: 'notification',
      payload: notification,
    })
    supabase.removeChannel(channel)
  } catch (err) {
    console.error('Error broadcasting notification:', err.message)
  }

  return notification
}

export default { createNotification }
