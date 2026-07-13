/**
 * MCP AI Tracker — Sistema centralizado de control de consumo IA
 * Módulo compartido entre app180 y construgest-web
 * Versión para Supabase JS client
 *
 * Uso:
 *   import { createMCPTracker } from './mcp-ai-tracker.js'
 *   const mcpTracker = createMCPTracker({ supabase, appId: 'construgest' })
 */

/**
 * @param {{ supabase: import('@supabase/supabase-js').SupabaseClient, appId: string }} config
 */
export function createMCPTracker({ supabase, appId }) {
  if (!supabase) throw new Error('mcp-ai-tracker: supabase client is required')
  if (!appId) throw new Error('mcp-ai-tracker: appId is required')

  /**
   * Pre-flight: check if org/user has quota available (no recording)
   */
  async function checkQuota({ orgId, userId = null }) {
    try {
      const { data, error } = await supabase.rpc('mcp_check_quota', {
        p_app_id: appId,
        p_org_id: String(orgId),
        p_user_id: userId
      })
      if (error) throw error
      return data || { allowed: true, reason: 'no_response' }
    } catch (err) {
      console.warn(`[mcp-tracker] checkQuota error: ${err.message}`)
      return { allowed: true, reason: 'check_error' }
    }
  }

  /**
   * Record AI usage (fire-and-forget, does NOT check quota)
   */
  async function recordUsage({
    orgId, userId = null, provider, model,
    inputTokens = 0, outputTokens = 0,
    estimatedCost = null, keySource = 'env',
    operation = 'chat', toolCalls = 0
  }) {
    try {
      let cost = estimatedCost
      if (cost === null) {
        cost = await estimateCostFromPricing(model, inputTokens, outputTokens)
      }

      const { error } = await supabase.from('mcp_ai_consumption').insert({
        app_id: appId,
        org_id: String(orgId),
        user_id: userId,
        provider,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost: Math.round((cost || 0) * 1000000) / 1000000,
        key_source: keySource,
        operation,
        tool_calls: toolCalls
      })
      if (error) throw error
    } catch (err) {
      console.warn(`[mcp-tracker] recordUsage error: ${err.message}`)
    }
  }

  /**
   * Atomic: check quota + record usage in one call via RPC
   */
  async function checkAndRecord({
    orgId, userId = null, provider, model,
    inputTokens = 0, outputTokens = 0,
    estimatedCost = null, keySource = 'env',
    operation = 'chat', toolCalls = 0
  }) {
    try {
      let cost = estimatedCost
      if (cost === null) {
        cost = await estimateCostFromPricing(model, inputTokens, outputTokens)
      }

      const { data, error } = await supabase.rpc('mcp_check_and_record_usage', {
        p_app_id: appId,
        p_org_id: String(orgId),
        p_user_id: userId,
        p_provider: provider,
        p_model: model,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
        p_estimated_cost: Math.round((cost || 0) * 1000000) / 1000000,
        p_key_source: keySource,
        p_operation: operation,
        p_tool_calls: toolCalls
      })
      if (error) throw error
      return data || { allowed: true, reason: 'no_response' }
    } catch (err) {
      console.warn(`[mcp-tracker] checkAndRecord error: ${err.message}`)
      return { allowed: true, reason: 'rpc_error' }
    }
  }

  /**
   * Get usage summary for dashboard
   */
  async function getUsageSummary({ orgId = null, appFilter = null, period = 'month' } = {}) {
    try {
      let query = supabase.from('mcp_ai_consumption').select('app_id, provider, user_id, input_tokens, output_tokens, estimated_cost, created_at')

      if (orgId) query = query.eq('org_id', String(orgId))
      if (appFilter) query = query.eq('app_id', appFilter)

      if (period === 'day') {
        query = query.gte('created_at', new Date().toISOString().split('T')[0])
      } else if (period === 'month') {
        const monthStart = new Date()
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)
        query = query.gte('created_at', monthStart.toISOString())
      }

      const { data, error } = await query
      if (error) throw error

      // Aggregate in JS (Supabase JS doesn't support GROUP BY)
      const totalsMap = {}
      const providerMap = {}
      const userMap = {}

      for (const row of (data || [])) {
        // Totals by app
        const ak = row.app_id
        if (!totalsMap[ak]) totalsMap[ak] = { app_id: ak, total_calls: 0, total_input_tokens: 0, total_output_tokens: 0, total_cost: 0 }
        totalsMap[ak].total_calls++
        totalsMap[ak].total_input_tokens += row.input_tokens || 0
        totalsMap[ak].total_output_tokens += row.output_tokens || 0
        totalsMap[ak].total_cost += parseFloat(row.estimated_cost) || 0

        // By provider
        const pk = `${row.app_id}:${row.provider}`
        if (!providerMap[pk]) providerMap[pk] = { app_id: row.app_id, provider: row.provider, calls: 0, input_tokens: 0, output_tokens: 0, cost: 0 }
        providerMap[pk].calls++
        providerMap[pk].input_tokens += row.input_tokens || 0
        providerMap[pk].output_tokens += row.output_tokens || 0
        providerMap[pk].cost += parseFloat(row.estimated_cost) || 0

        // By user
        const uk = `${row.app_id}:${row.user_id}`
        if (!userMap[uk]) userMap[uk] = { app_id: row.app_id, user_id: row.user_id, calls: 0, cost: 0 }
        userMap[uk].calls++
        userMap[uk].cost += parseFloat(row.estimated_cost) || 0
      }

      return {
        totals: Object.values(totalsMap),
        byProvider: Object.values(providerMap),
        byUser: Object.values(userMap).sort((a, b) => b.cost - a.cost).slice(0, 20)
      }
    } catch (err) {
      console.error(`[mcp-tracker] getUsageSummary error: ${err.message}`)
      return { totals: [], byProvider: [], byUser: [] }
    }
  }

  /**
   * Get quotas
   */
  async function getQuotas({ orgId = null, appFilter = null } = {}) {
    try {
      let query = supabase.from('mcp_ai_quotas').select('*').order('app_id').order('org_id')
      if (orgId) query = query.eq('org_id', String(orgId))
      if (appFilter) query = query.eq('app_id', appFilter)
      const { data, error } = await query
      if (error) throw error
      return data || []
    } catch (err) {
      console.error(`[mcp-tracker] getQuotas error: ${err.message}`)
      return []
    }
  }

  /**
   * Upsert quota
   */
  async function upsertQuota({ targetAppId, orgId, quotaType, maxCalls, maxCostUsd, maxTokens, creditsExtra, bypassUserIds, enabled }) {
    try {
      const { error } = await supabase.from('mcp_ai_quotas').upsert({
        app_id: targetAppId,
        org_id: String(orgId),
        quota_type: quotaType,
        max_calls: maxCalls ?? null,
        max_cost_usd: maxCostUsd ?? null,
        max_tokens: maxTokens ?? null,
        credits_extra: creditsExtra ?? 0,
        bypass_user_ids: bypassUserIds || [],
        enabled: enabled ?? true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'app_id,org_id,quota_type' })
      if (error) throw error
      return { success: true }
    } catch (err) {
      console.error(`[mcp-tracker] upsertQuota error: ${err.message}`)
      return { success: false, error: err.message }
    }
  }

  /**
   * Get pricing table
   */
  async function getPricing() {
    try {
      const { data, error } = await supabase.from('mcp_ai_pricing').select('*').order('provider').order('model')
      if (error) throw error
      return data || []
    } catch (err) {
      console.error(`[mcp-tracker] getPricing error: ${err.message}`)
      return []
    }
  }

  /**
   * Upsert pricing
   */
  async function upsertPricing({ model, provider, inputPricePerMillion, outputPricePerMillion }) {
    try {
      const { error } = await supabase.from('mcp_ai_pricing').upsert({
        model,
        provider,
        input_price_per_million: inputPricePerMillion,
        output_price_per_million: outputPricePerMillion,
        updated_at: new Date().toISOString()
      }, { onConflict: 'model' })
      if (error) throw error
    } catch (err) {
      console.warn(`[mcp-tracker] upsertPricing error: ${err.message}`)
    }
  }

  /**
   * Get provider credits with consumed amounts
   */
  async function getProviderCredits() {
    try {
      const { data: credits, error: credErr } = await supabase.from('mcp_ai_provider_credits').select('*').order('provider')
      if (credErr) throw credErr

      // Get consumed totals per provider
      const { data: consumption } = await supabase.from('mcp_ai_consumption').select('provider, estimated_cost')
      const consumedMap = {}
      for (const row of (consumption || [])) {
        consumedMap[row.provider] = (consumedMap[row.provider] || 0) + parseFloat(row.estimated_cost || 0)
      }

      return (credits || []).map(c => ({
        ...c,
        consumed: consumedMap[c.provider] || 0,
        remaining: parseFloat(c.initial_amount) - (consumedMap[c.provider] || 0)
      }))
    } catch (err) {
      console.error(`[mcp-tracker] getProviderCredits error: ${err.message}`)
      return []
    }
  }

  /**
   * Update provider credits
   */
  async function upsertProviderCredits({ provider, initialAmount, creditType = 'credit', notes = null }) {
    try {
      const { error } = await supabase.from('mcp_ai_provider_credits').upsert({
        provider,
        initial_amount: initialAmount,
        credit_type: creditType,
        notes,
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' })
      if (error) throw error
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  /**
   * Estimate cost from mcp_ai_pricing table
   */
  async function estimateCostFromPricing(model, inputTokens, outputTokens) {
    try {
      const { data } = await supabase.from('mcp_ai_pricing')
        .select('input_price_per_million, output_price_per_million')
        .eq('model', model)
        .single()
      if (!data) return 0
      return (inputTokens * parseFloat(data.input_price_per_million) +
              outputTokens * parseFloat(data.output_price_per_million)) / 1_000_000
    } catch {
      return 0
    }
  }

  /**
   * Daily consumption trend
   */
  async function getDailyTrend({ orgId = null, appFilter = null, days = 30 } = {}) {
    try {
      const sinceDate = new Date()
      sinceDate.setDate(sinceDate.getDate() - days)

      let query = supabase.from('mcp_ai_consumption')
        .select('app_id, input_tokens, output_tokens, estimated_cost, created_at')
        .gte('created_at', sinceDate.toISOString())

      if (orgId) query = query.eq('org_id', String(orgId))
      if (appFilter) query = query.eq('app_id', appFilter)

      const { data, error } = await query
      if (error) throw error

      // Group by app_id + date in JS
      const grouped = {}
      for (const row of (data || [])) {
        const date = row.created_at.split('T')[0]
        const key = `${row.app_id}:${date}`
        if (!grouped[key]) grouped[key] = { app_id: row.app_id, date, calls: 0, input_tokens: 0, output_tokens: 0, cost: 0 }
        grouped[key].calls++
        grouped[key].input_tokens += row.input_tokens || 0
        grouped[key].output_tokens += row.output_tokens || 0
        grouped[key].cost += parseFloat(row.estimated_cost) || 0
      }

      return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date))
    } catch (err) {
      console.error(`[mcp-tracker] getDailyTrend error: ${err.message}`)
      return []
    }
  }

  // ══════════════════════════════════════
  // Gestión de usuarios cross-app
  // ══════════════════════════════════════

  /**
   * Get all users across both apps (via mcp_users_view)
   */
  async function getAllUsers({ appFilter = null, search = null } = {}) {
    try {
      let query = supabase.from('mcp_users_view').select('*').order('created_at', { ascending: false })
      if (appFilter) query = query.eq('source_app', appFilter)
      if (search) query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)

      const { data: users, error } = await query
      if (error) throw error

      const userIds = (users || []).map(u => u.user_id).filter(Boolean)
      if (userIds.length === 0) return users || []

      // Get consumption per user
      const { data: consumption } = await supabase.from('mcp_ai_consumption')
        .select('user_id, app_id, input_tokens, output_tokens, estimated_cost')
        .in('user_id', userIds)

      const consumptionMap = {}
      for (const c of (consumption || [])) {
        const key = `${c.user_id}:${c.app_id}`
        if (!consumptionMap[key]) consumptionMap[key] = { calls: 0, input_tokens: 0, output_tokens: 0, cost: 0 }
        consumptionMap[key].calls++
        consumptionMap[key].input_tokens += c.input_tokens || 0
        consumptionMap[key].output_tokens += c.output_tokens || 0
        consumptionMap[key].cost += parseFloat(c.estimated_cost) || 0
      }

      // Get user quotas
      const { data: userQuotas } = await supabase.from('mcp_ai_user_quotas')
        .select('*')
        .in('user_id', userIds)

      const quotaMap = {}
      for (const q of (userQuotas || [])) {
        if (!quotaMap[q.user_id]) quotaMap[q.user_id] = []
        quotaMap[q.user_id].push(q)
      }

      return (users || []).map(u => {
        const c = consumptionMap[`${u.user_id}:${u.source_app}`] || {}
        return {
          ...u,
          ai_calls: c.calls || 0,
          ai_input_tokens: c.input_tokens || 0,
          ai_output_tokens: c.output_tokens || 0,
          ai_cost: c.cost || 0,
          user_quotas: quotaMap[u.user_id] || []
        }
      })
    } catch (err) {
      console.error(`[mcp-tracker] getAllUsers error: ${err.message}`)
      return []
    }
  }

  /**
   * Get user-level quotas
   */
  async function getUserQuotas({ userId }) {
    try {
      const { data, error } = await supabase.from('mcp_ai_user_quotas').select('*').eq('user_id', userId)
      if (error) throw error
      return data || []
    } catch (err) {
      console.error(`[mcp-tracker] getUserQuotas error: ${err.message}`)
      return []
    }
  }

  /**
   * Upsert user-level quota
   */
  async function upsertUserQuota({ targetAppId, userId, quotaType, maxCalls, maxTokens, maxCostUsd, enabled }) {
    try {
      const { error } = await supabase.from('mcp_ai_user_quotas').upsert({
        app_id: targetAppId,
        user_id: userId,
        quota_type: quotaType,
        max_calls: maxCalls ?? null,
        max_tokens: maxTokens ?? null,
        max_cost_usd: maxCostUsd ?? null,
        enabled: enabled ?? true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'app_id,user_id,quota_type' })
      if (error) throw error
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  /**
   * Toggle AI for a user (updates source table)
   */
  async function toggleUserAI({ userId, sourceApp, enabled }) {
    try {
      const table = sourceApp === 'app180' ? 'users_180' : 'cons_users'
      const { error } = await supabase.from(table).update({ ai_enabled: enabled }).eq('id', userId)
      if (error) throw error
      return { success: true, ai_enabled: enabled }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  /**
   * Update user's app field
   */
  async function updateUserApp({ userId, sourceApp, app }) {
    try {
      const table = sourceApp === 'app180' ? 'users_180' : 'cons_users'
      const { error } = await supabase.from(table).update({ app }).eq('id', userId)
      if (error) throw error
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  /**
   * Get consumption for a specific user
   */
  async function getUserConsumption({ userId, period = 'month' }) {
    try {
      let query = supabase.from('mcp_ai_consumption')
        .select('app_id, provider, model, operation, input_tokens, output_tokens, estimated_cost, created_at')
        .eq('user_id', userId)

      if (period === 'day') {
        query = query.gte('created_at', new Date().toISOString().split('T')[0])
      } else if (period === 'month') {
        const monthStart = new Date()
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)
        query = query.gte('created_at', monthStart.toISOString())
      }

      const { data, error } = await query
      if (error) throw error

      // Aggregate in JS
      const grouped = {}
      for (const row of (data || [])) {
        const key = `${row.app_id}:${row.provider}:${row.model}:${row.operation}`
        if (!grouped[key]) grouped[key] = { app_id: row.app_id, provider: row.provider, model: row.model, operation: row.operation, calls: 0, input_tokens: 0, output_tokens: 0, cost: 0 }
        grouped[key].calls++
        grouped[key].input_tokens += row.input_tokens || 0
        grouped[key].output_tokens += row.output_tokens || 0
        grouped[key].cost += parseFloat(row.estimated_cost) || 0
      }

      return Object.values(grouped).sort((a, b) => b.cost - a.cost)
    } catch (err) {
      console.error(`[mcp-tracker] getUserConsumption error: ${err.message}`)
      return []
    }
  }

  return {
    checkQuota,
    recordUsage,
    checkAndRecord,
    getUsageSummary,
    getQuotas,
    upsertQuota,
    getPricing,
    upsertPricing,
    getProviderCredits,
    upsertProviderCredits,
    getDailyTrend,
    estimateCost: estimateCostFromPricing,
    // User management
    getAllUsers,
    getUserQuotas,
    upsertUserQuota,
    toggleUserAI,
    updateUserApp,
    getUserConsumption,
  }
}
