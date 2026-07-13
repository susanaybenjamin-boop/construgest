import Anthropic from '@anthropic-ai/sdk'
import Groq from 'groq-sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createHash } from 'crypto'
import supabase from '../db/supabase.js'
import { createMCPTracker } from './mcp-ai-tracker.js'

const mcpTracker = createMCPTracker({ supabase, appId: 'construgest' })

// ── Fallback: env-var clients (used when no org-specific keys in DB) ──
const envAnthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

const envGroq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null

const envGenAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null

// ── In-memory cache for org API keys ──
const keyCache = {}
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ── In-memory cache for AI responses (dedup repeated extractions) ──
//
// Las extracciones IA son idempotentes para la misma entrada (PDF / texto /
// configuración). Cuando el usuario sube el mismo PDF dos veces, devolver
// la respuesta cacheada ahorra una llamada de coste no trivial.
//
// Cache simple LRU con tope de 200 entradas y TTL de 30 minutos. La clave
// es un sha256 del prompt completo (texto + imágenes/PDFs en hex).
const AI_CACHE_TTL_MS = 30 * 60 * 1000
const AI_CACHE_MAX = 200
const aiCache = new Map() // hash → { value, expiresAt }

function computeAICacheKey(prompt, options = {}) {
  const hash = createHash('sha256')
  // Para multimodal hashing: text + (mimeType + data) por imagen.
  if (prompt && typeof prompt === 'object' && !Array.isArray(prompt)) {
    hash.update(prompt.text || '')
    for (const img of (prompt.images || [])) {
      hash.update('|')
      hash.update(img.mimeType || '')
      hash.update('|')
      // img.data puede ser base64 o Buffer; tomamos string seguro.
      const d = typeof img.data === 'string' ? img.data : ''
      hash.update(d)
    }
  } else {
    hash.update(typeof prompt === 'string' ? prompt : JSON.stringify(prompt))
  }
  // Provider order influye en el resultado: incluirlo evita colisiones
  // si el mismo prompt se llama con distinta priorización.
  hash.update('|')
  hash.update((options.providerOrder || []).join(','))
  return hash.digest('hex')
}

function aiCacheGet(key) {
  const entry = aiCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    aiCache.delete(key)
    return null
  }
  // LRU: tocar la entrada
  aiCache.delete(key)
  aiCache.set(key, entry)
  return entry.value
}

function aiCacheSet(key, value) {
  if (aiCache.size >= AI_CACHE_MAX) {
    // Eliminar la entrada más antigua (primer key del Map insertion-ordered)
    const firstKey = aiCache.keys().next().value
    if (firstKey !== undefined) aiCache.delete(firstKey)
  }
  aiCache.set(key, { value, expiresAt: Date.now() + AI_CACHE_TTL_MS })
}

/**
 * Fetch API keys for an organization from the database (with TTL cache)
 */
async function getKeysForOrg(organizationId) {
  if (!organizationId) return {}

  const cached = keyCache[organizationId]
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.keys
  }

  try {
    const { data } = await supabase
      .from('cons_app_settings')
      .select('key, value')
      .eq('organization_id', organizationId)
      .in('key', ['anthropic_api_key', 'groq_api_key', 'gemini_api_key', 'anthropic_enabled', 'groq_enabled', 'gemini_enabled'])

    const keys = {}
    for (const row of (data || [])) {
      if (row.value && row.value.trim()) {
        keys[row.key] = row.value
      }
    }

    keyCache[organizationId] = { keys, fetchedAt: Date.now() }
    return keys
  } catch (err) {
    console.warn('[ai-service] Error fetching org keys:', err.message)
    return {}
  }
}

/**
 * Fetch keys from a "master" organization (shared keys for all orgs)
 */
async function getMasterOrgKeys() {
  const masterOrgId = process.env.MASTER_ORG_ID
  if (!masterOrgId) return {}
  return getKeysForOrg(masterOrgId)
}

/**
 * Build SDK clients: DB keys take priority, master org keys, then env vars as fallback
 * Returns { anthropic, groq, genAI, keySource } where keySource tracks origin
 */
function getClients(orgKeys, keySource = 'own') {
  // A provider is disabled if explicitly set to 'false' in settings
  const anthropicDisabled = orgKeys.anthropic_enabled === 'false'
  const groqDisabled = orgKeys.groq_enabled === 'false'
  const geminiDisabled = orgKeys.gemini_enabled === 'false'

  const anthropic = anthropicDisabled ? null : (orgKeys.anthropic_api_key
    ? new Anthropic({ apiKey: orgKeys.anthropic_api_key })
    : envAnthropic)

  const groq = groqDisabled ? null : (orgKeys.groq_api_key
    ? new Groq({ apiKey: orgKeys.groq_api_key })
    : envGroq)

  const genAI = geminiDisabled ? null : (orgKeys.gemini_api_key
    ? new GoogleGenerativeAI(orgKeys.gemini_api_key)
    : envGenAI)

  // Determine actual key source per provider
  const sources = {
    anthropic: orgKeys.anthropic_api_key ? keySource : (envAnthropic ? 'env' : null),
    groq: orgKeys.groq_api_key ? keySource : (envGroq ? 'env' : null),
    gemini: orgKeys.gemini_api_key ? keySource : (envGenAI ? 'env' : null),
  }

  return { anthropic, groq, genAI, sources }
}

// ── Dynamic pricing from DB with in-memory cache ──
let pricingCache = null
let pricingCacheAt = 0
const PRICING_CACHE_TTL = 60 * 60 * 1000 // 1 hour in-memory cache
const PRICING_REFRESH_DAYS = 7 // refresh from AI every 7 days

/**
 * Load pricing from database (with 1h in-memory cache)
 */
async function getPricing() {
  if (pricingCache && (Date.now() - pricingCacheAt) < PRICING_CACHE_TTL) {
    return pricingCache
  }

  try {
    const { data } = await supabase
      .from('cons_ai_pricing')
      .select('model, provider, input_price_per_million, output_price_per_million, updated_at')

    const pricing = {}
    for (const row of (data || [])) {
      pricing[row.model] = {
        input: parseFloat(row.input_price_per_million),
        output: parseFloat(row.output_price_per_million),
        updatedAt: row.updated_at,
      }
    }
    pricingCache = pricing
    pricingCacheAt = Date.now()
    return pricing
  } catch (err) {
    console.warn('[ai-service] Error loading pricing:', err.message)
    return pricingCache || {}
  }
}

/**
 * Check if pricing needs refresh (older than PRICING_REFRESH_DAYS)
 * If so, ask Gemini Flash Lite (cheapest) for current prices and update DB
 */
async function refreshPricingIfNeeded(genAI) {
  if (!genAI) return

  const pricing = await getPricing()
  const entries = Object.values(pricing)
  if (entries.length === 0) return

  // Check oldest update
  const oldest = entries.reduce((min, e) => {
    const t = new Date(e.updatedAt).getTime()
    return t < min ? t : min
  }, Date.now())

  const daysSinceUpdate = (Date.now() - oldest) / (1000 * 60 * 60 * 24)
  if (daysSinceUpdate < PRICING_REFRESH_DAYS) return

  console.log('[ai-service] Pricing is', Math.floor(daysSinceUpdate), 'days old, refreshing via Gemini...')

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
    const modelsToCheck = Object.keys(pricing)

    const prompt = `You are a pricing lookup assistant. Return ONLY a JSON object with current pricing per 1 million tokens (USD) for these AI models. Use the most recent publicly available pricing. Format:
{"model_id": {"input": number, "output": number}}

Models to look up:
${modelsToCheck.map(m => `- ${m}`).join('\n')}

Return ONLY the JSON object, no explanation. If you don't know a model's price, use the last known values I provide:
${JSON.stringify(Object.fromEntries(modelsToCheck.map(m => [m, { input: pricing[m].input, output: pricing[m].output }])))}
`

    const result = await model.generateContent([prompt])
    const text = result.response.text()

    // Parse response
    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[ai-service] Pricing refresh: could not parse response')
      return
    }

    const newPrices = JSON.parse(jsonMatch[0])
    let updated = 0

    for (const [modelId, prices] of Object.entries(newPrices)) {
      const inp = parseFloat(prices.input)
      const out = parseFloat(prices.output)
      if (!inp || !out || inp <= 0 || out <= 0) continue

      // Only update if price actually changed
      const current = pricing[modelId]
      if (current && Math.abs(current.input - inp) < 0.001 && Math.abs(current.output - out) < 0.001) {
        // Same price, just touch updated_at
        await supabase
          .from('cons_ai_pricing')
          .update({ updated_at: new Date().toISOString() })
          .eq('model', modelId)
        continue
      }

      const { error } = await supabase
        .from('cons_ai_pricing')
        .upsert({
          model: modelId,
          provider: current?.provider || modelId.split('-')[0],
          input_price_per_million: inp,
          output_price_per_million: out,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'model' })

      if (!error) {
        updated++
        console.log(`[ai-service] Pricing updated: ${modelId} -> in:$${inp}/M out:$${out}/M`)
      }
    }

    // Invalidate cache so next call picks up new prices
    pricingCache = null
    pricingCacheAt = 0

    if (updated > 0) {
      console.log(`[ai-service] Pricing refresh complete: ${updated} models updated`)
    } else {
      console.log('[ai-service] Pricing refresh complete: all prices unchanged')
    }
  } catch (err) {
    console.warn('[ai-service] Pricing refresh failed:', err.message)
    // Touch updated_at on all rows so we don't retry immediately
    await supabase
      .from('cons_ai_pricing')
      .update({ updated_at: new Date().toISOString() })
      .gte('updated_at', '2000-01-01')
      .catch(() => {})
  }
}

async function estimateCost(model, inputTokens, outputTokens) {
  const pricing = await getPricing()
  const p = pricing[model]
  if (!p) return 0
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

/**
 * Log AI consumption to both legacy table and MCP centralized system
 */
async function logAIConsumption({ organizationId, userId, provider, model, inputTokens, outputTokens, keySource, operation }) {
  if (!organizationId) return
  const cost = await estimateCost(model, inputTokens || 0, outputTokens || 0)

  // Write to MCP centralized table
  mcpTracker.recordUsage({
    orgId: organizationId,
    userId: userId || null,
    provider: provider || 'unknown',
    model: model || 'unknown',
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    estimatedCost: Math.round(cost * 1000000) / 1000000,
    keySource: keySource || 'unknown',
    operation: operation || 'unknown',
  }).catch(err => console.warn('[ai-service] MCP recordUsage error:', err.message))

  // Also sync pricing to MCP if we have it
  if (model) {
    const pricing = await getPricing()
    const p = pricing[model]
    if (p) {
      mcpTracker.upsertPricing({
        model,
        provider: provider || 'unknown',
        inputPricePerMillion: p.input,
        outputPricePerMillion: p.output,
      }).catch(() => {})
    }
  }

  // Legacy: keep writing to cons_ai_consumption for backward compatibility
  try {
    await supabase.from('cons_ai_consumption').insert({
      organization_id: organizationId,
      user_id: userId || null,
      provider,
      model: model || 'unknown',
      input_tokens: inputTokens || 0,
      output_tokens: outputTokens || 0,
      estimated_cost: Math.round(cost * 1000000) / 1000000,
      key_source: keySource || 'unknown',
      operation: operation || 'unknown',
    })
  } catch (err) {
    console.warn('[ai-service] Error logging consumption:', err.message)
  }
}

// ── Provider implementations ──

async function tryAnthropic(anthropic, textPrompt, images, pdfDocs, imageFiles, options) {
  let content = textPrompt
  if (images.length > 0) {
    content = []
    for (const pdf of pdfDocs) {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdf.data }
      })
    }
    for (const img of imageFiles) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.data }
      })
    }
    content.push({ type: 'text', text: textPrompt })
  }

  const anthropicModelsToTry = options.model
    ? [options.model]
    : ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001']

  for (const model of anthropicModelsToTry) {
    try {
      // `effort` solo lo soportan los modelos Sonnet 4.6+ y Opus 4.5+.
      // Haiku 4.5 da 400 si se pasa, así que lo añadimos condicionalmente.
      // Para extracción JSON usamos `low` — más rápido y barato sin perder
      // calidad notable en este tipo de tarea.
      const req = {
        model,
        max_tokens: options.maxTokens || 4096,
        messages: [{ role: 'user', content }],
      }
      if (model.startsWith('claude-sonnet-4-6') || model.startsWith('claude-opus-4-')) {
        req.output_config = { effort: options.effort || 'low' }
      }
      const response = await anthropic.messages.create(req)
      const result = parseAIResponse(response.content[0]?.text || '')
      result.__usage = {
        provider: 'anthropic', model,
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      }
      return result
    } catch (err) {
      if (err.message && err.message.includes('not_found_error')) {
        console.warn(`[ai-service] Anthropic model ${model} not found, trying fallback...`)
        continue
      }
      throw err
    }
  }
  throw new Error('Ningún modelo Anthropic disponible')
}

async function tryGroq(groq, textPrompt, images, pdfDocs, imageFiles, options) {
  if (pdfDocs.length > 0) throw new Error('Groq no soporta PDFs')

  let content = textPrompt
  if (imageFiles.length > 0) {
    content = [{ type: 'text', text: textPrompt }]
    for (const img of imageFiles) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.data}` }
      })
    }
  }

  const groqModelsToTry = options.groqModel
    ? [options.groqModel]
    : (imageFiles.length > 0
        ? ['llama-3.2-11b-vision-preview']
        : ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'])

  for (const model of groqModelsToTry) {
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: 'user', content }],
        max_tokens: options.maxTokens || 4096,
        temperature: 0.3,
      })
      const result = parseAIResponse(response.choices[0]?.message?.content || '')
      result.__usage = {
        provider: 'groq', model,
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      }
      return result
    } catch (err) {
      if (err.message && (err.message.includes('not found') || err.message.includes('does not exist') || err.message.includes('decommissioned'))) {
        console.warn(`[ai-service] Groq model ${model} not found/decommissioned, trying fallback...`)
        continue
      }
      throw err
    }
  }
  throw new Error('Ningún modelo Groq disponible')
}

async function tryGemini(genAI, textPrompt, images, options) {
  const hasMedia = images.length > 0
  const geminiModelsToTry = options.geminiModel
    ? [options.geminiModel]
    : (hasMedia
        ? ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
        : ['gemini-2.5-flash', 'gemini-2.5-flash-lite'])

  for (const modelName of geminiModelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName })

      let genContent = [textPrompt]
      if (hasMedia) {
        genContent = [textPrompt]
        for (const item of images) {
          genContent.push({
            inlineData: { data: item.data, mimeType: item.mimeType }
          })
        }
      }

      const genResult = await model.generateContent(genContent)
      const result = parseAIResponse(genResult.response.text())
      const usageMeta = genResult.response.usageMetadata
      result.__usage = {
        provider: 'gemini', model: modelName,
        inputTokens: usageMeta?.promptTokenCount || 0,
        outputTokens: usageMeta?.candidatesTokenCount || 0,
      }
      return result
    } catch (err) {
      if (err.message && (err.message.includes('404') || err.message.includes('deprecated') || err.message.includes('no longer available') || err.message.includes('not found'))) {
        console.warn(`[ai-service] Gemini model ${modelName} not available, trying fallback...`)
        continue
      }
      throw err
    }
  }
  throw new Error('Ningún modelo Gemini disponible')
}

/**
 * Call AI with multi-provider fallback
 * options.organizationId: if provided, fetches org-specific keys from DB
 * options.providerOrder: array to control fallback priority (default: ['anthropic', 'groq', 'gemini'])
 * Default priority: Anthropic (Claude) -> Groq (Llama) -> Gemini
 */
export async function callAI(prompt, options = {}) {
  // Cache hit: si el mismo prompt ya se pidió en los últimos 30 min,
  // devolver la respuesta cacheada y ahorrar la llamada a IA.
  // Saltable con options.skipCache = true (p.ej. para A/B o re-runs forzados).
  const cacheKey = options.skipCache ? null : computeAICacheKey(prompt, options)
  if (cacheKey) {
    const cached = aiCacheGet(cacheKey)
    if (cached) {
      return { ...cached, cached: true }
    }
  }

  // Check if user has AI enabled
  if (options.userId) {
    const { data: userData } = await supabase
      .from('cons_users')
      .select('ai_enabled')
      .eq('id', options.userId)
      .single()
    if (userData && userData.ai_enabled === false) {
      throw new Error('Tu acceso a IA está desactivado. Contacta al administrador.')
    }
  }

  // MCP: Check quota before calling AI
  if (options.organizationId) {
    const quotaCheck = await mcpTracker.checkQuota({
      orgId: options.organizationId,
      userId: options.userId || null
    })
    if (!quotaCheck.allowed) {
      const reason = quotaCheck.reason === 'daily_limit'
        ? `Has alcanzado tu límite de ${quotaCheck.limit} consultas diarias.`
        : quotaCheck.reason === 'monthly_limit'
        ? `Has alcanzado tu límite de ${quotaCheck.limit} consultas mensuales.`
        : quotaCheck.reason === 'ai_disabled'
        ? 'El servicio de IA está desactivado para tu organización.'
        : 'Límite de IA alcanzado.'
      throw new Error(reason)
    }
  }

  let orgKeys = await getKeysForOrg(options.organizationId)
  let keySource = 'own'

  // If org has no keys, try master org keys
  const hasOrgKeys = orgKeys.anthropic_api_key || orgKeys.groq_api_key || orgKeys.gemini_api_key
  if (!hasOrgKeys) {
    const masterKeys = await getMasterOrgKeys()
    if (masterKeys.anthropic_api_key || masterKeys.groq_api_key || masterKeys.gemini_api_key) {
      orgKeys = { ...masterKeys, ...orgKeys } // preserve any enabled/disabled flags from org
      keySource = 'master'
    }
  }

  const { anthropic, groq, genAI, sources } = getClients(orgKeys, keySource)

  // Auto-refresh pricing if stale (fire-and-forget, non-blocking on error)
  refreshPricingIfNeeded(genAI).catch(() => {})

  const errors = []

  // Support for multimodal prompts: { text: string, images: [{ mimeType, data }] }
  const isMultimodal = prompt && typeof prompt === 'object' && !Array.isArray(prompt) && prompt.text
  const textPrompt = isMultimodal ? prompt.text : (typeof prompt === 'string' ? prompt : JSON.stringify(prompt))
  const images = isMultimodal && prompt.images ? prompt.images : []

  // Separate PDFs from images
  const pdfDocs = images.filter(i => i.mimeType === 'application/pdf')
  const imageFiles = images.filter(i => i.mimeType !== 'application/pdf')

  const providerOrder = options.providerOrder || ['anthropic', 'groq', 'gemini']

  const providers = {
    anthropic: {
      client: anthropic,
      fn: () => tryAnthropic(anthropic, textPrompt, images, pdfDocs, imageFiles, options),
      skipReason: !anthropic ? 'Sin clave API' : null,
    },
    groq: {
      client: groq,
      fn: () => tryGroq(groq, textPrompt, images, pdfDocs, imageFiles, options),
      skipReason: !groq ? 'Sin clave API' : pdfDocs.length > 0 ? 'No soporta PDFs' : null,
    },
    gemini: {
      client: genAI,
      fn: () => tryGemini(genAI, textPrompt, images, options),
      skipReason: !genAI ? 'Clave API no guardada en Configuración o servicio deshabilitado' : null,
    },
  }

  for (const providerName of providerOrder) {
    const provider = providers[providerName]
    if (!provider) continue

    if (provider.skipReason) {
      errors.push(`${providerName}: Omitido (${provider.skipReason})`)
      continue
    }

    try {
      const result = await provider.fn()
      // Log consumption (fire-and-forget)
      if (result.__usage) {
        logAIConsumption({
          organizationId: options.organizationId,
          userId: options.userId,
          provider: result.__usage.provider,
          model: result.__usage.model,
          inputTokens: result.__usage.inputTokens,
          outputTokens: result.__usage.outputTokens,
          keySource: sources[providerName] || keySource,
          operation: options.operation || 'unknown',
        })
        delete result.__usage
      }
      // Guardar en cache para deduplicar llamadas repetidas. No cacheamos
      // resultados con __usage porque ya se eliminó arriba: el resultado
      // visible es estable y reutilizable.
      if (cacheKey) aiCacheSet(cacheKey, result)
      return result
    } catch (err) {
      errors.push(`${providerName}: ${err.message}`)
    }
  }

  throw new Error(`Todos los proveedores AI fallaron:\n ${errors.join(' | ')}`)
}

/**
 * Parse AI response - extract JSON from mixed text
 */
function parseAIResponse(text) {
  if (!text || !text.trim()) {
    throw new Error('Respuesta vacía del modelo AI')
  }

  // Remove think tags (DeepSeek/reasoning models)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  // Remove markdown code blocks
  cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  // Try to extract JSON object or array
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (jsonMatch) {
    cleaned = jsonMatch[1]
  }

  // Fix trailing commas
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')

  // Fix arithmetic expressions in JSON values (Gemini sometimes outputs "1844.73 + 29.48 + 24.86")
  // Match number + number [+ number...] that appear as JSON values (after : and before , or })
  cleaned = cleaned.replace(/:\s*([\d.]+(?:\s*[+\-*/]\s*[\d.]+)+)\s*([,}\]])/g, (match, expr, end) => {
    try {
      // Only evaluate simple arithmetic (numbers and +-*/)
      if (/^[\d\s.+\-*/()]+$/.test(expr)) {
        const result = Function('"use strict"; return (' + expr + ')')()
        return ': ' + (Number.isFinite(result) ? parseFloat(result.toFixed(4)) : expr) + end
      }
    } catch { /* ignore */ }
    return match
  })

  try {
    return JSON.parse(cleaned)
  } catch (firstErr) {
    // Second pass: try to fix common JSON issues from AI models
    try {
      // Remove any remaining non-JSON text before/after the object
      const secondMatch = cleaned.match(/(\{[\s\S]*\})/)
      if (secondMatch) {
        return JSON.parse(secondMatch[1])
      }
    } catch { /* ignore */ }

    // Return as text if not valid JSON
    console.warn('[ai-service] JSON parse failed:', firstErr.message?.substring(0, 100))
    return { raw_response: text }
  }
}

export default callAI
