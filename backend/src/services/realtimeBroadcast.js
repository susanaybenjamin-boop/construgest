// ════════════════════════════════════════════════════════════════════
// Broadcast Realtime: emite eventos a través de Supabase Realtime
// para que los clientes se actualicen en vivo sin depender de RLS.
// (postgres_changes requiere policies de SELECT que aquí no aplican
// porque el frontend usa la anon key sin sesión Supabase Auth).
//
// Cada handler que muta datos llama a uno de los helpers `notifyXxx`,
// que envía un broadcast al canal correspondiente vía la API HTTP de
// Realtime. Este enfoque NO requiere mantener un socket abierto desde
// el backend (versión anterior con .channel().send() perdía los
// primeros eventos porque el subscribe es asíncrono).
//
// Best-effort: si la red falla o el endpoint responde error, se
// loguea pero no se rompe el handler que llamó.
// ════════════════════════════════════════════════════════════════════

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

async function broadcast(channelName, event, payload) {
  if (!supabaseUrl || !supabaseServiceKey) return
  try {
    const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{
          topic: channelName,
          event,
          payload: payload || {},
          // private:false → cualquier cliente suscrito al topic recibe el
          // evento sin necesidad de tener sesión autenticada en Supabase.
          private: false,
        }],
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[realtime] broadcast HTTP ${res.status} en ${channelName}/${event}: ${body}`)
    }
  } catch (err) {
    console.warn(`[realtime] broadcast falló (${channelName}/${event}):`, err.message || err)
  }
}

// Eventos a nivel de presupuesto: cualquier cambio en chapters / items /
// measurements / breakdowns / metadata del propio budget. Se reciben en
// `budget:{budgetId}` con event 'change'.
export function notifyBudgetChange(budgetId, kind = 'unknown') {
  if (!budgetId) return
  return broadcast(`budget:${budgetId}`, 'change', { kind, ts: Date.now() })
}

// Eventos de la lista de proyectos del usuario: alta/baja/edición de
// proyectos o cambios de visibilidad/vínculos de sucursal. Se reciben en
// `org:{orgId}:projects` con event 'change'.
export function notifyProjectsChange(orgId, kind = 'unknown') {
  if (!orgId) return
  return broadcast(`org:${orgId}:projects`, 'change', { kind, ts: Date.now() })
}

// Eventos de invitaciones / vínculos de sucursal del usuario. Cada org
// tiene su propio canal porque las invitaciones son por org.
export function notifyBranchesChange(orgId, kind = 'unknown') {
  if (!orgId) return
  return broadcast(`org:${orgId}:branches`, 'change', { kind, ts: Date.now() })
}

// Helper combinado: cuando una mutación afecta a DOS orgs (envío de
// invitación, aceptar/rechazar, eliminar vínculo, compartir biblioteca),
// notifica a ambas.
export async function notifyBranchesChangeBoth(orgIdA, orgIdB, kind) {
  await Promise.all([
    notifyBranchesChange(orgIdA, kind),
    notifyBranchesChange(orgIdB, kind),
  ])
}

export default { notifyBudgetChange, notifyProjectsChange, notifyBranchesChange, notifyBranchesChangeBoth }
