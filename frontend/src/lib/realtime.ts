import { subscribeTopic } from './realtimeClient'

// ─────────────────────────────────────────────────────────────
// Suscripciones Realtime sobre el WebSocket propio (hub local del
// backend, ver services/realtimeHub.js). Sustituye al Realtime de
// Supabase: el backend publica un evento en cada mutación y aquí
// se traduce a un callback (con debounce para agrupar ráfagas).
//
// Topics:
//   budget:{budgetId}            → cambios en un presupuesto.
//   org:{orgId}:projects         → cambios en proyectos de una org.
//   org:{orgId}:branches         → invitaciones / vínculos / shares.
// ─────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 400

// ─── Budget channel ──────────────────────────────────────────
let budgetUnsub: (() => void) | null = null
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
  if (activeBudgetId === budgetId && budgetUnsub) {
    budgetCallback = onChange
    return
  }
  unsubscribeFromBudget()

  budgetCallback = onChange
  activeBudgetId = budgetId
  budgetUnsub = subscribeTopic(`budget:${budgetId}`, scheduleBudget)
}

export function unsubscribeFromBudget() {
  if (budgetDebounce) {
    clearTimeout(budgetDebounce)
    budgetDebounce = null
  }
  if (budgetUnsub) {
    budgetUnsub()
    budgetUnsub = null
  }
  activeBudgetId = null
  budgetCallback = null
}

// ─── Projects channel ────────────────────────────────────────
let projectsUnsub: (() => void) | null = null
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
  if (projectsOrgId === orgId && projectsUnsub) {
    projectsCallback = onChange
    return
  }
  unsubscribeFromProjects()
  projectsCallback = onChange
  projectsOrgId = orgId
  projectsUnsub = subscribeTopic(`org:${orgId}:projects`, scheduleProjects)
}

export function unsubscribeFromProjects() {
  if (projectsDebounce) {
    clearTimeout(projectsDebounce)
    projectsDebounce = null
  }
  if (projectsUnsub) {
    projectsUnsub()
    projectsUnsub = null
  }
  projectsOrgId = null
  projectsCallback = null
}

// ─── Branches channel ────────────────────────────────────────
let branchesUnsub: (() => void) | null = null
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
  if (branchesOrgId === orgId && branchesUnsub) {
    branchesCallback = onChange
    return
  }
  unsubscribeFromBranches()
  branchesCallback = onChange
  branchesOrgId = orgId
  branchesUnsub = subscribeTopic(`org:${orgId}:branches`, scheduleBranches)
}

export function unsubscribeFromBranches() {
  if (branchesDebounce) {
    clearTimeout(branchesDebounce)
    branchesDebounce = null
  }
  if (branchesUnsub) {
    branchesUnsub()
    branchesUnsub = null
  }
  branchesOrgId = null
  branchesCallback = null
}
