import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────
// Suscripciones Realtime con BROADCAST.
//
// La app no usa Supabase Auth (auth propia con JWT del backend),
// por lo que las RLS bloquean `postgres_changes` para el cliente
// anon. En su lugar usamos canales `broadcast`: el backend emite
// eventos en cada mutación (ver services/realtimeBroadcast.js)
// y el cliente los escucha aquí. No depende de RLS.
//
// Canales:
//   budget:{budgetId}            → cambios en un presupuesto.
//   org:{orgId}:projects         → cambios en proyectos de una org.
//   org:{orgId}:branches         → invitaciones / vínculos / shares.
// ─────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 400

// ─── Budget channel ──────────────────────────────────────────
let activeChannel: RealtimeChannel | null = null
let activeBudgetId: string | null = null
let budgetDebounce: ReturnType<typeof setTimeout> | null = null
let budgetCallback: (() => void) | null = null

function scheduleBudget() {
  if (!budgetCallback) return
  if (budgetDebounce) clearTimeout(budgetDebounce)
  budgetDebounce = setTimeout(() => {
    if (budgetCallback) budgetCallback()
  }, DEBOUNCE_MS)
}

export function subscribeToBudget(budgetId: string, onChange: () => void) {
  if (activeBudgetId === budgetId && activeChannel) {
    budgetCallback = onChange
    return
  }
  unsubscribeFromBudget()

  budgetCallback = onChange
  activeBudgetId = budgetId

  activeChannel = supabase
    .channel(`budget:${budgetId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'change' }, scheduleBudget)
    .subscribe()
}

export function unsubscribeFromBudget() {
  if (budgetDebounce) {
    clearTimeout(budgetDebounce)
    budgetDebounce = null
  }
  if (activeChannel) {
    supabase.removeChannel(activeChannel)
    activeChannel = null
  }
  activeBudgetId = null
  budgetCallback = null
}

// ─── Projects channel ────────────────────────────────────────
let projectsChannel: RealtimeChannel | null = null
let projectsOrgId: string | null = null
let projectsDebounce: ReturnType<typeof setTimeout> | null = null
let projectsCallback: (() => void) | null = null

function scheduleProjects() {
  if (!projectsCallback) return
  if (projectsDebounce) clearTimeout(projectsDebounce)
  projectsDebounce = setTimeout(() => {
    if (projectsCallback) projectsCallback()
  }, DEBOUNCE_MS)
}

export function subscribeToProjects(orgId: string, onChange: () => void) {
  if (!orgId) return
  if (projectsOrgId === orgId && projectsChannel) {
    projectsCallback = onChange
    return
  }
  unsubscribeFromProjects()
  projectsCallback = onChange
  projectsOrgId = orgId

  projectsChannel = supabase
    .channel(`org:${orgId}:projects`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'change' }, scheduleProjects)
    .subscribe()
}

export function unsubscribeFromProjects() {
  if (projectsDebounce) {
    clearTimeout(projectsDebounce)
    projectsDebounce = null
  }
  if (projectsChannel) {
    supabase.removeChannel(projectsChannel)
    projectsChannel = null
  }
  projectsOrgId = null
  projectsCallback = null
}

// ─── Branches channel ────────────────────────────────────────
let branchesChannel: RealtimeChannel | null = null
let branchesOrgId: string | null = null
let branchesDebounce: ReturnType<typeof setTimeout> | null = null
let branchesCallback: (() => void) | null = null

function scheduleBranches() {
  if (!branchesCallback) return
  if (branchesDebounce) clearTimeout(branchesDebounce)
  branchesDebounce = setTimeout(() => {
    if (branchesCallback) branchesCallback()
  }, DEBOUNCE_MS)
}

export function subscribeToBranches(orgId: string, onChange: () => void) {
  if (!orgId) return
  if (branchesOrgId === orgId && branchesChannel) {
    branchesCallback = onChange
    return
  }
  unsubscribeFromBranches()
  branchesCallback = onChange
  branchesOrgId = orgId

  branchesChannel = supabase
    .channel(`org:${orgId}:branches`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'change' }, scheduleBranches)
    .subscribe()
}

export function unsubscribeFromBranches() {
  if (branchesDebounce) {
    clearTimeout(branchesDebounce)
    branchesDebounce = null
  }
  if (branchesChannel) {
    supabase.removeChannel(branchesChannel)
    branchesChannel = null
  }
  branchesOrgId = null
  branchesCallback = null
}
