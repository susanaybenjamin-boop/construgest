import jwt from 'jsonwebtoken'
import supabase from '../db/local.js'

const JWT_SECRET = process.env.JWT_SECRET

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' })
  }

  const token = authHeader.split(' ')[1]

  let decoded
  try {
    decoded = jwt.verify(token, JWT_SECRET)
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }

  // Revalidar que el usuario sigue activo en cada petición. El JWT no se puede
  // revocar por sí solo (y la expiración deslizante lo renueva indefinidamente),
  // así que desactivar un usuario debe cortarle el acceso en la siguiente llamada.
  try {
    const { data: user } = await supabase
      .from('cons_users').select('is_active').eq('id', decoded.id).single()
    if (!user || user.is_active === false) {
      return res.status(401).json({ error: 'Sesión no válida' })
    }
  } catch (err) {
    return next(err)
  }

  req.user = decoded

  // Sliding expiration: renew token on every authenticated request.
  // Only include the user payload, not jwt metadata (iat, exp).
  const { iat, exp, ...payload } = decoded
  const newToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
  res.setHeader('X-Renewed-Token', newToken)

  next()
}

// ────────────────────────────────────────────────────────────────────
// Resolver acceso a un proyecto. Devuelve { project, role, sharedKinds, sharedRefs }
// si el usuario tiene acceso, o null si no. Centraliza la lógica que antes
// vivía solo en projectAccessMiddleware para poder reutilizarla desde
// otros middlewares (presupuestos, items, mediciones…).
// ────────────────────────────────────────────────────────────────────
export async function resolveProjectAccess(userId, userOrgId, projectId) {
  const { data: project } = await supabase
    .from('cons_projects')
    .select('id, organization_id, created_by')
    .eq('id', projectId)
    .single()

  if (!project) return null

  // Miembro directo de la org del proyecto
  const { data: member } = await supabase
    .from('cons_organization_members')
    .select('role')
    .eq('organization_id', project.organization_id)
    .eq('user_id', userId)
    .single()

  if (member) {
    return { project, role: member.role, sharedKinds: null, sharedRefs: null }
  }

  // Acceso por sucursal vinculada con visibilidad activa
  const projectOrgId = project.organization_id
  const orgA = userOrgId < projectOrgId ? userOrgId : projectOrgId
  const orgB = userOrgId < projectOrgId ? projectOrgId : userOrgId

  const { data: link } = await supabase
    .from('cons_branch_links')
    .select('id')
    .eq('organization_a_id', orgA)
    .eq('organization_b_id', orgB)
    .single()

  if (link) {
    const { data: visibility } = await supabase
      .from('cons_branch_project_visibility')
      .select('visible')
      .eq('project_id', projectId)
      .eq('branch_link_id', link.id)
      .eq('visible', true)
      .single()

    if (visibility) {
      return { project, role: 'branch_viewer', sharedKinds: null, sharedRefs: null }
    }
  }

  // Acceso por buzón
  const { data: sharedRows } = await supabase
    .from('cons_mailbox_shared_access')
    .select('kind, ref_id')
    .eq('user_id', userId)
    .eq('project_id', projectId)

  if (sharedRows && sharedRows.length > 0) {
    const kinds = [...new Set(sharedRows.filter(r => r.kind !== 'project').map(r => r.kind))]
    return { project, role: 'mailbox_guest', sharedKinds: kinds, sharedRefs: sharedRows }
  }

  return null
}

// Compatible con dos usos:
//   projectAccessMiddleware                       -> middleware directo (solo lectura)
//   projectAccessMiddleware({ requireWrite: true }) -> factory que devuelve el middleware
// Así las rutas de escritura pueden exigir permiso de edición (rechazar
// branch_viewer / mailbox_guest) sin romper las rutas de lectura existentes.
function makeProjectAccess(options = {}) {
  const { requireWrite = false } = options
  return async (req, res, next) => {
    const projectId = req.params.projectId || req.params.id
    const userId = req.user.id
    const userOrgId = req.user.organization_id

    if (!projectId) return next()

    const access = await resolveProjectAccess(userId, userOrgId, projectId)
    if (!access) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' })
    }

    if (requireWrite && (access.role === 'branch_viewer' || access.role === 'mailbox_guest')) {
      return res.status(403).json({ error: 'Acceso de solo lectura' })
    }

    req.project = access.project
    req.userRole = access.role
    req.mailboxSharedKinds = access.sharedKinds
    req.mailboxSharedRefs = access.sharedRefs
    next()
  }
}

export function projectAccessMiddleware(a, b, c) {
  // Llamado por Express como middleware directo: (req, res, next)
  if (a && b && typeof c === 'function') return makeProjectAccess({})(a, b, c)
  // Llamado como factory: ({ requireWrite })
  return makeProjectAccess(a || {})
}

// ────────────────────────────────────────────────────────────────────
// Resolución de project_id Y budget_id desde IDs de recursos del árbol
// de presupuesto. Usado por budgetAccessMiddleware para validar acceso
// y para que los handlers puedan emitir broadcasts al budget correcto.
// ────────────────────────────────────────────────────────────────────
async function lookupBudget(budgetId) {
  const { data } = await supabase
    .from('cons_budgets').select('id, project_id').eq('id', budgetId).single()
  if (!data) return null
  return { projectId: data.project_id, budgetId: data.id }
}

// project_id de un presupuesto (para validar acceso en la comparativa).
async function projectIdFromBudget(budgetId) {
  const b = await lookupBudget(budgetId)
  return b?.projectId || null
}

async function lookupChapter(chapterId) {
  const { data } = await supabase
    .from('cons_chapters').select('budget_id').eq('id', chapterId).single()
  if (!data) return null
  return lookupBudget(data.budget_id)
}

async function lookupItem(itemId) {
  const { data } = await supabase
    .from('cons_budget_items').select('chapter_id').eq('id', itemId).single()
  if (!data) return null
  return lookupChapter(data.chapter_id)
}

async function lookupMeasurement(measurementId) {
  const { data } = await supabase
    .from('cons_measurements').select('budget_item_id').eq('id', measurementId).single()
  if (!data) return null
  return lookupItem(data.budget_item_id)
}

async function lookupBreakdown(breakdownId) {
  const { data } = await supabase
    .from('cons_price_breakdown').select('budget_item_id').eq('id', breakdownId).single()
  if (!data) return null
  return lookupItem(data.budget_item_id)
}

const RESOLVERS = {
  budget: lookupBudget,
  chapter: lookupChapter,
  item: lookupItem,
  measurement: lookupMeasurement,
  breakdown: lookupBreakdown,
  project: async (id) => ({ projectId: id, budgetId: null }),
}

const PARAM_KEYS = {
  budget: ['id', 'budgetId', 'budget_id'],
  chapter: ['chapterId', 'chapter_id'],
  item: ['itemId', 'item_id'],
  measurement: ['measurementId', 'measurement_id'],
  breakdown: ['id', 'breakdownId', 'breakdown_id'],
  project: ['projectId', 'project_id'],
}

// budgetAccessMiddleware('budget') → resuelve req.params.id al project_id del presupuesto
//                                    y valida acceso.
// budgetAccessMiddleware('item')   → req.params.itemId  → item → chapter → budget → project
//
// Las rutas WRITE (PUT/POST/DELETE) además rechazan a usuarios sin permiso de
// edición (branch_viewer, mailbox_guest). El parámetro `requireWrite` controla
// eso (default: true para writes, false para reads).
export function budgetAccessMiddleware(kind, options = {}) {
  const { requireWrite = false } = options
  return async (req, res, next) => {
    try {
      const userId = req.user.id
      const userOrgId = req.user.organization_id

      // Resolver id del recurso en req.params según convención
      const candidates = PARAM_KEYS[kind] || ['id']
      let resourceId = null
      for (const key of candidates) {
        if (req.params[key]) { resourceId = req.params[key]; break }
      }

      // Para POST se espera un campo en body (p.ej. project_id, budget_id)
      if (!resourceId && req.body) {
        for (const key of candidates) {
          if (req.body[key]) { resourceId = req.body[key]; break }
        }
      }

      if (!resourceId) {
        return res.status(400).json({ error: 'Identificador de recurso requerido' })
      }

      const resolver = RESOLVERS[kind]
      if (!resolver) return res.status(500).json({ error: 'Resolver no configurado' })

      const lookup = await resolver(resourceId)
      const projectId = lookup?.projectId || null
      if (!projectId) return res.status(404).json({ error: 'Recurso no encontrado' })

      const access = await resolveProjectAccess(userId, userOrgId, projectId)
      if (!access) {
        return res.status(403).json({ error: 'No tienes acceso a este recurso' })
      }

      // Sucursales y buzón solo lectura por defecto
      if (requireWrite) {
        if (access.role === 'branch_viewer') {
          return res.status(403).json({ error: 'Acceso de solo lectura' })
        }
        if (access.role === 'mailbox_guest') {
          return res.status(403).json({ error: 'Acceso de solo lectura' })
        }
      }

      req.project = access.project
      req.userRole = access.role
      req.resourceProjectId = projectId
      // budgetId es opcional: solo presente para kinds que cuelgan de un
      // presupuesto. Permite a los handlers hacer notifyBudgetChange().
      req.resolvedBudgetId = lookup?.budgetId || null
      next()
    } catch (err) {
      next(err)
    }
  }
}

// Para endpoints de comparación que reciben dos budgetIds. Valida acceso a
// AMBOS proyectos antes de pasar al handler.
export function comparisonAccessMiddleware(options = {}) {
  const { requireWrite = false } = options
  return async (req, res, next) => {
    try {
      const userId = req.user.id
      const userOrgId = req.user.organization_id

      const a = req.params.budgetAId
      const b = req.params.budgetBId
      if (!a || !b) {
        return res.status(400).json({ error: 'IDs de presupuesto requeridos' })
      }

      const [pidA, pidB] = await Promise.all([
        projectIdFromBudget(a),
        projectIdFromBudget(b),
      ])
      if (!pidA || !pidB) return res.status(404).json({ error: 'Recurso no encontrado' })

      const [accessA, accessB] = await Promise.all([
        resolveProjectAccess(userId, userOrgId, pidA),
        resolveProjectAccess(userId, userOrgId, pidB),
      ])
      if (!accessA || !accessB) {
        return res.status(403).json({ error: 'No tienes acceso a estos presupuestos' })
      }

      if (requireWrite) {
        for (const acc of [accessA, accessB]) {
          if (acc.role === 'branch_viewer' || acc.role === 'mailbox_guest') {
            return res.status(403).json({ error: 'Acceso de solo lectura' })
          }
        }
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}

// Para PATCH/DELETE de grupos de comparación, donde solo se conoce el groupId.
// Resuelve el grupo → budget_a_id/budget_b_id → valida acceso a ambos.
export function comparisonGroupAccessMiddleware(options = {}) {
  const { requireWrite = false } = options
  return async (req, res, next) => {
    try {
      const userId = req.user.id
      const userOrgId = req.user.organization_id

      const groupId = req.params.groupId
      if (!groupId) return res.status(400).json({ error: 'groupId requerido' })

      const { data: group } = await supabase
        .from('cons_budget_comparison_groups')
        .select('budget_a_id, budget_b_id')
        .eq('id', groupId)
        .single()
      if (!group) return res.status(404).json({ error: 'Grupo no encontrado' })

      const [pidA, pidB] = await Promise.all([
        projectIdFromBudget(group.budget_a_id),
        projectIdFromBudget(group.budget_b_id),
      ])
      if (!pidA || !pidB) return res.status(404).json({ error: 'Recurso no encontrado' })

      const [accessA, accessB] = await Promise.all([
        resolveProjectAccess(userId, userOrgId, pidA),
        resolveProjectAccess(userId, userOrgId, pidB),
      ])
      if (!accessA || !accessB) {
        return res.status(403).json({ error: 'No tienes acceso a este grupo' })
      }

      if (requireWrite) {
        for (const acc of [accessA, accessB]) {
          if (acc.role === 'branch_viewer' || acc.role === 'mailbox_guest') {
            return res.status(403).json({ error: 'Acceso de solo lectura' })
          }
        }
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}

export default authMiddleware
