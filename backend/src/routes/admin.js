import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/supabase.js'
import { createMCPTracker } from '../services/mcp-ai-tracker.js'

const mcpTracker = createMCPTracker({ supabase, appId: 'construgest' })

const router = Router()

// Middleware: only master org owner can access these routes
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

// GET /api/admin/users — list all registered users with their org info
router.get('/users', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { data: users, error } = await supabase
      .from('cons_users')
      .select('id, email, full_name, avatar_url, is_active, ai_enabled, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Get org memberships for all users
    const userIds = users.map(u => u.id)
    const { data: memberships } = await supabase
      .from('cons_organization_members')
      .select('user_id, organization_id, role')
      .in('user_id', userIds)

    const { data: orgs } = await supabase
      .from('cons_organizations')
      .select('id, name')

    const orgMap = {}
    for (const org of (orgs || [])) {
      orgMap[org.id] = org.name
    }

    // Get AI consumption per org
    const orgIds = (memberships || []).map(m => m.organization_id).filter(Boolean)
    const { data: consumption } = orgIds.length > 0
      ? await supabase
          .from('cons_ai_consumption')
          .select('organization_id, input_tokens, output_tokens, estimated_cost')
          .in('organization_id', orgIds)
      : { data: [] }

    const consumptionByOrg = {}
    for (const row of (consumption || [])) {
      if (!consumptionByOrg[row.organization_id]) {
        consumptionByOrg[row.organization_id] = { calls: 0, input_tokens: 0, output_tokens: 0, estimated_cost: 0 }
      }
      consumptionByOrg[row.organization_id].calls++
      consumptionByOrg[row.organization_id].input_tokens += row.input_tokens || 0
      consumptionByOrg[row.organization_id].output_tokens += row.output_tokens || 0
      consumptionByOrg[row.organization_id].estimated_cost += parseFloat(row.estimated_cost) || 0
    }

    const enriched = users.map(u => {
      const mem = (memberships || []).find(m => m.user_id === u.id)
      const orgConsumption = mem ? consumptionByOrg[mem.organization_id] : null
      return {
        ...u,
        organization_id: mem?.organization_id || null,
        organization_name: mem ? (orgMap[mem.organization_id] || 'Sin nombre') : null,
        role: mem?.role || null,
        ai_calls: orgConsumption?.calls || 0,
        ai_input_tokens: orgConsumption?.input_tokens || 0,
        ai_output_tokens: orgConsumption?.output_tokens || 0,
        ai_estimated_cost: orgConsumption ? Math.round(orgConsumption.estimated_cost * 1000000) / 1000000 : 0,
      }
    })

    res.json(enriched)
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/users/:id/toggle-active — activate/deactivate a user
router.put('/users/:id/toggle-active', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { id } = req.params

    // Don't allow deactivating yourself
    if (id === req.user.id) {
      return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' })
    }

    // Get current state
    const { data: user, error: fetchErr } = await supabase
      .from('cons_users')
      .select('id, is_active')
      .eq('id', id)
      .single()

    if (fetchErr || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

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

// DELETE /api/admin/users/:id — delete a user and their org
router.delete('/users/:id', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { id } = req.params

    // Don't allow deleting yourself
    if (id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' })
    }

    // Get user's organization
    const { data: mem } = await supabase
      .from('cons_organization_members')
      .select('organization_id')
      .eq('user_id', id)
      .single()

    // Delete membership
    await supabase
      .from('cons_organization_members')
      .delete()
      .eq('user_id', id)

    // Delete organization if user was owner
    if (mem?.organization_id) {
      await supabase
        .from('cons_organizations')
        .delete()
        .eq('id', mem.organization_id)
        .eq('owner_id', id)
    }

    // Delete user
    const { error } = await supabase
      .from('cons_users')
      .delete()
      .eq('id', id)

    if (error) throw error

    res.json({ deleted: true })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/ai-consumption — global AI consumption across all orgs
router.get('/ai-consumption', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const period = req.query.period || 'month'

    let since = new Date()
    if (period === 'month') since.setDate(since.getDate() - 30)
    else if (period === 'week') since.setDate(since.getDate() - 7)
    else since = new Date('2020-01-01')

    const { data, error } = await supabase
      .from('cons_ai_consumption')
      .select('organization_id, provider, model, input_tokens, output_tokens, estimated_cost, key_source, operation, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error) throw error

    // Get org names
    const orgIds = [...new Set((data || []).map(r => r.organization_id))]
    const { data: orgs } = await supabase
      .from('cons_organizations')
      .select('id, name')
      .in('id', orgIds)

    const orgMap = {}
    for (const org of (orgs || [])) {
      orgMap[org.id] = org.name
    }

    // Aggregate by org
    const byOrg = {}
    let totalInput = 0, totalOutput = 0, totalCalls = 0, totalCost = 0
    for (const row of (data || [])) {
      const orgId = row.organization_id
      const cost = parseFloat(row.estimated_cost) || 0
      if (!byOrg[orgId]) {
        byOrg[orgId] = {
          organization_id: orgId,
          organization_name: orgMap[orgId] || 'Desconocida',
          calls: 0, input_tokens: 0, output_tokens: 0, estimated_cost: 0,
          key_source: row.key_source,
        }
      }
      byOrg[orgId].calls++
      byOrg[orgId].input_tokens += row.input_tokens || 0
      byOrg[orgId].output_tokens += row.output_tokens || 0
      byOrg[orgId].estimated_cost += cost
      totalInput += row.input_tokens || 0
      totalOutput += row.output_tokens || 0
      totalCost += cost
      totalCalls++
    }

    // Aggregate by provider
    const byProvider = {}
    for (const row of (data || [])) {
      const key = row.provider
      const cost = parseFloat(row.estimated_cost) || 0
      if (!byProvider[key]) byProvider[key] = { provider: key, calls: 0, input_tokens: 0, output_tokens: 0, estimated_cost: 0 }
      byProvider[key].calls++
      byProvider[key].input_tokens += row.input_tokens || 0
      byProvider[key].output_tokens += row.output_tokens || 0
      byProvider[key].estimated_cost += cost
    }

    res.json({
      period,
      total_calls: totalCalls,
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      total_estimated_cost: Math.round(totalCost * 1000000) / 1000000,
      by_organization: Object.values(byOrg).map(o => ({ ...o, estimated_cost: Math.round(o.estimated_cost * 1000000) / 1000000 })),
      by_provider: Object.values(byProvider).map(p => ({ ...p, estimated_cost: Math.round(p.estimated_cost * 1000000) / 1000000 })),
      recent: (data || []).slice(0, 30).map(r => ({
        ...r,
        organization_name: orgMap[r.organization_id] || 'Desconocida',
      })),
    })
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/users/:id/toggle-ai — enable/disable AI for a user
router.put('/users/:id/toggle-ai', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { id } = req.params

    const { data: user, error: fetchErr } = await supabase
      .from('cons_users')
      .select('id, ai_enabled')
      .eq('id', id)
      .single()

    if (fetchErr || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const newStatus = !user.ai_enabled
    const { error } = await supabase
      .from('cons_users')
      .update({ ai_enabled: newStatus })
      .eq('id', id)

    if (error) throw error

    res.json({ id, ai_enabled: newStatus })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/provider-credits — get provider balances
router.get('/provider-credits', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { data: credits } = await supabase
      .from('cons_ai_provider_credits')
      .select('*')

    // Get total consumption per provider from cons_ai_consumption
    const { data: consumption } = await supabase
      .from('cons_ai_consumption')
      .select('provider, estimated_cost')

    const totalByProvider = {}
    for (const row of (consumption || [])) {
      const p = row.provider
      if (!totalByProvider[p]) totalByProvider[p] = 0
      totalByProvider[p] += parseFloat(row.estimated_cost) || 0
    }

    const result = (credits || []).map(c => {
      const tracked = totalByProvider[c.provider] || 0
      let current
      if (c.credit_type === 'credit') {
        // Claude: initial credit - tracked consumption
        current = c.initial_amount - tracked
      } else {
        // Gemini/Groq: initial (pre-tracking) + tracked consumption
        current = parseFloat(c.initial_amount) + tracked
      }
      return {
        ...c,
        tracked_consumption: Math.round(tracked * 10000) / 10000,
        current_amount: Math.round(current * 10000) / 10000,
      }
    })

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/provider-credits/:provider — update provider credit (e.g., add credit, reset after payment)
router.put('/provider-credits/:provider', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { provider } = req.params
    const { initial_amount } = req.body

    if (initial_amount === undefined) {
      return res.status(400).json({ error: 'initial_amount es obligatorio' })
    }

    const { error } = await supabase
      .from('cons_ai_provider_credits')
      .update({ initial_amount: parseFloat(initial_amount), updated_at: new Date().toISOString() })
      .eq('provider', provider)

    if (error) throw error

    // Sync to MCP table so both apps see the update
    await supabase
      .from('mcp_ai_provider_credits')
      .upsert({
        provider,
        initial_amount: parseFloat(initial_amount),
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' })
      .then(() => {})
      .catch(err => console.warn('[admin] mcp sync error:', err.message))

    res.json({ provider, initial_amount: parseFloat(initial_amount) })
  } catch (err) {
    next(err)
  }
})

// ══════════════════════════════════════════════
// MCP: Control centralizado cross-app
// ══════════════════════════════════════════════

// GET /api/admin/mcp/consumption — cross-app consumption
router.get('/mcp/consumption', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { period = 'month', app_id, org_id } = req.query
    const summary = await mcpTracker.getUsageSummary({
      orgId: org_id || null,
      appFilter: app_id || null,
      period
    })
    res.json(summary)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/mcp/quotas — all quotas
router.get('/mcp/quotas', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { app_id, org_id } = req.query
    const quotas = await mcpTracker.getQuotas({
      orgId: org_id || null,
      appFilter: app_id || null
    })
    res.json(quotas)
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/mcp/quotas — upsert a quota
router.put('/mcp/quotas', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { targetAppId, orgId, quotaType, maxCalls, maxCostUsd, maxTokens, creditsExtra, bypassUserIds, enabled } = req.body
    if (!targetAppId || !orgId || !quotaType) {
      return res.status(400).json({ error: 'targetAppId, orgId y quotaType son requeridos' })
    }
    const result = await mcpTracker.upsertQuota({
      targetAppId, orgId, quotaType,
      maxCalls, maxCostUsd, maxTokens,
      creditsExtra, bypassUserIds, enabled
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/mcp/pricing — unified pricing table
router.get('/mcp/pricing', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const pricing = await mcpTracker.getPricing()
    res.json(pricing)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/mcp/provider-credits — provider credits with consumed
router.get('/mcp/provider-credits', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const credits = await mcpTracker.getProviderCredits()
    res.json(credits)
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/mcp/provider-credits — update provider credits
router.put('/mcp/provider-credits', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { provider, initialAmount, creditType, notes } = req.body
    if (!provider || initialAmount === undefined) {
      return res.status(400).json({ error: 'provider e initialAmount son requeridos' })
    }
    const result = await mcpTracker.upsertProviderCredits({ provider, initialAmount, creditType, notes })

    // Sync to legacy table too
    await supabase
      .from('cons_ai_provider_credits')
      .upsert({
        provider,
        initial_amount: parseFloat(initialAmount),
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' })
      .then(() => {})
      .catch(err => console.warn('[admin] legacy sync error:', err.message))

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/mcp/trend — daily trend
router.get('/mcp/trend', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { days = 30, app_id, org_id } = req.query
    const trend = await mcpTracker.getDailyTrend({
      orgId: org_id || null,
      appFilter: app_id || null,
      days: parseInt(days)
    })
    res.json(trend)
  } catch (err) {
    next(err)
  }
})

// ══════════════════════════════════════════════
// MCP: Superadmin - Gestión de usuarios cross-app
// ══════════════════════════════════════════════

// GET /api/admin/mcp/users — all users cross-app with consumption
router.get('/mcp/users', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { app, search } = req.query
    const users = await mcpTracker.getAllUsers({
      appFilter: app || null,
      search: search || null
    })
    res.json(users)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/mcp/users/:userId/consumption — user's detailed consumption
router.get('/mcp/users/:userId/consumption', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { userId } = req.params
    const { period = 'month' } = req.query
    const consumption = await mcpTracker.getUserConsumption({ userId, period })
    res.json(consumption)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/mcp/users/:userId/quotas — user's individual quotas
router.get('/mcp/users/:userId/quotas', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { userId } = req.params
    const quotas = await mcpTracker.getUserQuotas({ userId })
    res.json(quotas)
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/mcp/users/:userId/quotas — set user individual quota
router.put('/mcp/users/:userId/quotas', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { userId } = req.params
    const { targetAppId, quotaType, maxCalls, maxTokens, maxCostUsd, enabled } = req.body
    if (!targetAppId || !quotaType) {
      return res.status(400).json({ error: 'targetAppId y quotaType son requeridos' })
    }
    const result = await mcpTracker.upsertUserQuota({
      targetAppId, userId, quotaType,
      maxCalls, maxTokens, maxCostUsd, enabled
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/mcp/users/:userId/toggle-ai — enable/disable AI for user
router.put('/mcp/users/:userId/toggle-ai', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { userId } = req.params
    const { sourceApp, enabled } = req.body
    if (!sourceApp || enabled === undefined) {
      return res.status(400).json({ error: 'sourceApp y enabled son requeridos' })
    }
    const result = await mcpTracker.toggleUserAI({ userId, sourceApp, enabled })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/mcp/users/:userId/app — update user's app assignment
router.put('/mcp/users/:userId/app', authMiddleware, masterOrgOnly, async (req, res, next) => {
  try {
    const { userId } = req.params
    const { sourceApp, app } = req.body
    if (!sourceApp || !app) {
      return res.status(400).json({ error: 'sourceApp y app son requeridos' })
    }
    const result = await mcpTracker.updateUserApp({ userId, sourceApp, app })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router
