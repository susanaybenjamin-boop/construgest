// ============================================================================
// IA 100% LOCAL (Ollama). Sin nube, sin Supabase, sin cuotas ni coste.
//   - callAI(prompt, options): llama al modelo local y devuelve el JSON parseado.
//   - Caché en memoria (dedup de llamadas repetidas, 30 min).
// El OCR de PDF escaneado va por services/local-ocr.js (tesseract), NO por aquí:
// qwen2.5:3b es solo-texto.
//
// Historia: antes esto era multi-proveedor nube (Anthropic/Groq/Gemini) con
// claves por org, cuotas y pricing en Supabase. Todo eso se eliminó al pasar a
// local (AI-5). El panel admin de consumo/cuotas (routes/admin.js + mcp-ai-tracker)
// se desmantela aparte.
// ============================================================================
import { createHash } from 'crypto'

// ── Config del modelo local ──
// El backend corre en Docker; Ollama corre en el host -> host.docker.internal.
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b'

// ── Caché en memoria de respuestas (dedup de extracciones repetidas) ──
// Clave = sha256 del prompt (texto + imágenes). LRU con tope y TTL.
const AI_CACHE_TTL_MS = 30 * 60 * 1000
const AI_CACHE_MAX = 200
const aiCache = new Map() // hash → { value, expiresAt }

function computeAICacheKey(prompt) {
  const hash = createHash('sha256')
  if (prompt && typeof prompt === 'object' && !Array.isArray(prompt)) {
    hash.update(prompt.text || '')
    for (const img of (prompt.images || [])) {
      hash.update('|')
      hash.update(img.mimeType || '')
      hash.update('|')
      hash.update(typeof img.data === 'string' ? img.data : '')
    }
  } else {
    hash.update(typeof prompt === 'string' ? prompt : JSON.stringify(prompt))
  }
  return hash.digest('hex')
}

function aiCacheGet(key) {
  const entry = aiCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    aiCache.delete(key)
    return null
  }
  aiCache.delete(key)      // LRU: tocar la entrada
  aiCache.set(key, entry)
  return entry.value
}

function aiCacheSet(key, value) {
  if (aiCache.size >= AI_CACHE_MAX) {
    const firstKey = aiCache.keys().next().value
    if (firstKey !== undefined) aiCache.delete(firstKey)
  }
  aiCache.set(key, { value, expiresAt: Date.now() + AI_CACHE_TTL_MS })
}

// ── Llamada al modelo local (Ollama) ──
async function tryLocal(textPrompt, imageFiles, options) {
  const model = options.localModel || OLLAMA_MODEL
  const body = {
    model,
    prompt: textPrompt,
    stream: false,
    // OJO: NO usar format:'json'. Fuerza a Ollama a un ÚNICO objeto JSON y las
    // skills que devuelven ARRAY se colapsan a un elemento. El prompt ya pide el
    // JSON y parseAIResponse() lo extrae/repara.
    options: {
      temperature: options.temperature ?? 0.1,
      num_ctx: options.numCtx || 8192,
      // Tope DURO de generación. En CPU (~10 tok/s) sin tope una llamada puede
      // tardar minutos. Se respeta options.maxTokens pero se capa a 2048.
      num_predict: Math.min(options.maxTokens || 1024, 2048),
    },
  }
  // Ollama admite imágenes base64 solo en modelos de visión; qwen2.5:3b las ignora.
  if (imageFiles && imageFiles.length > 0) {
    body.images = imageFiles.map((i) => i.data)
  }

  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  const data = await res.json()
  return parseAIResponse(data.response || '')
}

/**
 * Llama a la IA local y devuelve el JSON parseado (o { raw_response } si no es JSON).
 * options: { maxTokens, temperature, numCtx, localModel, skipCache }.
 * (organizationId/userId/operation se ignoran: ya no hay cuotas ni logging.)
 */
export async function callAI(prompt, options = {}) {
  const cacheKey = options.skipCache ? null : computeAICacheKey(prompt)
  if (cacheKey) {
    const cached = aiCacheGet(cacheKey)
    if (cached) return { ...cached, cached: true }
  }

  const isMultimodal = prompt && typeof prompt === 'object' && !Array.isArray(prompt) && prompt.text
  const textPrompt = isMultimodal ? prompt.text : (typeof prompt === 'string' ? prompt : JSON.stringify(prompt))
  const images = isMultimodal && prompt.images ? prompt.images : []
  // Los PDFs no van al LLM (van por local-ocr.js); solo imágenes de modelos de visión.
  const imageFiles = images.filter((i) => i.mimeType !== 'application/pdf')

  const result = await tryLocal(textPrompt, imageFiles, options)
  if (cacheKey) aiCacheSet(cacheKey, result)
  return result
}

/**
 * Extrae el JSON (objeto o array) de una respuesta que puede traer texto/markdown.
 * Devuelve { raw_response } si no consigue parsear JSON.
 */
function parseAIResponse(text) {
  if (!text || !text.trim()) {
    throw new Error('Respuesta vacía del modelo AI')
  }

  // Quitar think-tags (modelos de razonamiento)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  // Quitar bloques markdown
  cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  // Extraer objeto o array JSON
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (jsonMatch) cleaned = jsonMatch[1]

  // Comas colgantes
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')

  // Expresiones aritméticas como valor JSON ("1844.73 + 29.48")
  cleaned = cleaned.replace(/:\s*([\d.]+(?:\s*[+\-*/]\s*[\d.]+)+)\s*([,}\]])/g, (match, expr, end) => {
    try {
      if (/^[\d\s.+\-*/()]+$/.test(expr)) {
        const r = Function('"use strict"; return (' + expr + ')')()
        return ': ' + (Number.isFinite(r) ? parseFloat(r.toFixed(4)) : expr) + end
      }
    } catch { /* ignore */ }
    return match
  })

  try {
    return JSON.parse(cleaned)
  } catch (firstErr) {
    try {
      const secondMatch = cleaned.match(/(\{[\s\S]*\})/)
      if (secondMatch) return JSON.parse(secondMatch[1])
    } catch { /* ignore */ }
    console.warn('[ai-service] JSON parse failed:', firstErr.message?.substring(0, 100))
    return { raw_response: text }
  }
}

export default callAI
