// ════════════════════════════════════════════════════════════════════
// Broadcast Realtime LOCAL: cada handler que muta datos llama a un helper
// `notifyXxx`, que publica un evento 'change' en el hub WebSocket propio
// (services/realtimeHub.js). Los clientes suscritos al topic refrescan.
//
// Antes esto iba contra la API HTTP de Supabase Realtime (nube). Ahora es
// 100% local. Los helpers mantienen la MISMA firma para no tocar los callers.
// Best-effort: publicar nunca rompe el handler que llamó.
// ════════════════════════════════════════════════════════════════════
import { publish } from './realtimeHub.js'

// Cambios en un presupuesto (chapters / items / measurements / breakdowns /
// metadata). Se reciben en `budget:{budgetId}` con event 'change'.
export function notifyBudgetChange(budgetId, kind = 'unknown') {
  if (!budgetId) return
  publish(`budget:${budgetId}`, 'change', { kind, ts: Date.now() })
}

// Alta/baja/edición de proyectos o cambios de visibilidad/vínculos de sucursal.
// Se reciben en `org:{orgId}:projects`.
export function notifyProjectsChange(orgId, kind = 'unknown') {
  if (!orgId) return
  publish(`org:${orgId}:projects`, 'change', { kind, ts: Date.now() })
}

// Invitaciones / vínculos de sucursal del usuario. Un canal por org.
export function notifyBranchesChange(orgId, kind = 'unknown') {
  if (!orgId) return
  publish(`org:${orgId}:branches`, 'change', { kind, ts: Date.now() })
}

// Cuando una mutación afecta a DOS orgs (invitación, aceptar/rechazar, quitar
// vínculo, compartir biblioteca), notifica a ambas.
export function notifyBranchesChangeBoth(orgIdA, orgIdB, kind) {
  notifyBranchesChange(orgIdA, kind)
  notifyBranchesChange(orgIdB, kind)
}

export default { notifyBudgetChange, notifyProjectsChange, notifyBranchesChange, notifyBranchesChangeBoth }
