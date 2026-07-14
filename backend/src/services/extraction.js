// ============================================================================
// Extracción de listas de proveedor — arquitectura de 2 capas.
//
//  CAPA 1 (código determinista, PRIMARIO): parsea las líneas tabulares con regex.
//    Código, precio y unidad salen POSICIONALES → 100% fiables, instantáneo y
//    consistente. Ninguna línea con precio se pierde.
//  CAPA 2 (LLM local, REFUERZO): limpia nombres y caza líneas NO tabulares que el
//    regex no pilla. Se fusiona con lo determinista por el precio (clave fuerte).
//
// Si el LLM falla o está caído, la extracción sigue funcionando con la Capa 1.
//
// Hallazgos del spike que justifican esto: el qwen2.5:3b es inconsistente
// (se deja filas, pierde códigos, alucina con placeholders). Lo regular lo hace
// el código; el modelo solo lo borroso.
// ============================================================================

const UNIT = '(?:uds?|m2|m²|m3|m³|ml|kg|kgs|lt|l|h|t|sacos?|botes?|palets?|cajas?|km|gr?|m)'
const PRICE_END = new RegExp('(\\d[\\d.]*,\\d{1,2}|\\d+\\.\\d{1,2}|\\d+)\\s*(?:€|eur|euros)?\\s*$', 'i')
const CODE_START = /^\s*([A-Za-z]{2,5}[-. ]?\d{2,6}[A-Za-z0-9-]*)\b/
const UNIT_END = new RegExp('\\b(' + UNIT + ')\\b\\s+(?:\\d[\\d.]*,\\d{1,2}|\\d+\\.\\d{1,2}|\\d+)\\s*(?:€|eur|euros)?\\s*$', 'i')

// "1.250,00" -> 1250.00 · "4,85" -> 4.85 · "1,200.50" -> 1200.50 · "3.5" -> 3.5
export function normalizeSpanishNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null) return null
  let s = String(v).trim().replace(/[^\d.,-]/g, '')
  if (!s) return null
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.')
  if (lc > ld) s = s.replace(/\./g, '').replace(',', '.')   // coma decimal (ES): . = miles
  else if (ld > lc) s = s.replace(/,/g, '')                 // punto decimal (EN): , = miles
  else s = s.replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

// Quita ruido que confunde al modelo o no es un material.
export function precleanLines(text) {
  const out = []
  for (const ln of String(text || '').split(/\r?\n/)) {
    const s = ln.trim()
    if (!s) continue
    if (/^[-=_.\s]+$/.test(s)) continue               // separadores
    if (/^(sub\s*total|total)\b/i.test(s)) continue   // subtotales / totales
    if (/^==.*==$/.test(s)) continue                  // títulos de sección == X ==
    out.push(ln)
  }
  return out
}

// CAPA 1: de cada línea con precio al final saca {code, name, unit, unit_price}.
export function parseCandidateLines(lines) {
  const res = []
  for (const ln of lines) {
    const mp = PRICE_END.exec(ln.replace(/\s+$/, ''))
    if (!mp) continue
    const price = normalizeSpanishNumber(mp[1])
    if (price == null) continue
    const mc = CODE_START.exec(ln)
    const code = mc ? mc[1].trim() : ''
    const mu = UNIT_END.exec(ln.replace(/\s+$/, ''))
    const unit = mu ? mu[1].toLowerCase() : ''
    let name = ln.trim()
    if (code) name = name.replace(CODE_START, '').trim()
    name = name.replace(PRICE_END, '').trim()
    if (unit) name = name.replace(new RegExp('\\b' + mu[1] + '\\b\\s*$', 'i'), '').trim()
    name = name.replace(/[.\s]+$/, '').trim()
    if (!name) continue
    res.push({ code, name, unit, unit_price: price })
  }
  return res
}

// Prompt afinado al modelo pequeño (ejemplo realista, sin frase "responde []").
// `fewShot` (opcional) son correcciones aprendidas (AI-4) que se insertan como
// ejemplos extra para que el modelo repita los arreglos previos del usuario.
export function buildExtractionPrompt(cleanedText, filename, fewShot = '') {
  return `Extrae los materiales de esta lista de precios de proveedor${filename ? ` (archivo: ${filename})` : ''}.

Para cada linea que tenga un material y un precio, devuelve un objeto con:
- "code": el identificador al inicio de la linea si existe (ej: CEM-001, HIE-08). Si la linea no empieza por un codigo, pon "".
- "name": el nombre del material, limpio.
- "unit": la unidad (saco, ud, m, m2, m3, kg, l, bote...).
- "unit_price": el precio como numero decimal. Los precios usan coma decimal espanola: 4,85 significa 4.85 ; 1.250,00 significa 1250.00.

Ejemplo de salida:
[
  {"code": "CEM-001", "name": "Cemento CEM II/B-L 32,5 R saco 25kg", "unit": "saco", "unit_price": 4.85},
  {"code": "", "name": "Malla electrosoldada 15x15x6", "unit": "ud", "unit_price": 12.30}
]
${fewShot}
Devuelve SOLO el array JSON, un objeto por material. No incluyas cabeceras ni notas.

LISTA:
${cleanedText}`
}

// Normaliza el array devuelto por el LLM.
export function normalizeLlmItems(arr) {
  if (!Array.isArray(arr)) return []
  const out = []
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue
    const name = (it.name ?? '').toString().trim()
    const price = normalizeSpanishNumber(it.unit_price)
    if (!name || price == null) continue
    out.push({
      code: (it.code ?? '').toString().trim(),
      name,
      unit: (it.unit ?? '').toString().trim(),
      unit_price: price,
    })
  }
  return out
}

// Fusiona Capa 1 (determinista) con Capa 2 (LLM) por precio. La Capa 1 manda en
// code/price; el LLM aporta nombre limpio y filas no tabulares que el regex no cazó.
export function mergeMaterials(deterministic, llmItems) {
  const near = (a, b) => Math.abs(a - b) < 0.005
  const usedLlm = new Set()
  const out = []

  for (const d of deterministic) {
    const j = llmItems.findIndex((l, i) => !usedLlm.has(i) && near(l.unit_price, d.unit_price))
    if (j >= 0) {
      usedLlm.add(j)
      const l = llmItems[j]
      out.push({
        code: d.code || l.code || '',
        name: (l.name && l.name.length >= 3) ? l.name : d.name,   // LLM limpia el nombre
        unit: d.unit || l.unit || 'ud',                            // regex manda en unidad
        unit_price: d.unit_price,                                  // regex manda en precio
      })
    } else {
      out.push({ code: d.code, name: d.name, unit: d.unit || 'ud', unit_price: d.unit_price })
    }
  }
  // Filas que solo vio el LLM (no tabulares) → añadir.
  for (let i = 0; i < llmItems.length; i++) {
    if (usedLlm.has(i)) continue
    const l = llmItems[i]
    out.push({ code: l.code || '', name: l.name, unit: l.unit || 'ud', unit_price: l.unit_price })
  }
  // Formato final: omitir code vacío.
  return out.map((m) => {
    const o = { name: m.name, unit: m.unit, unit_price: m.unit_price }
    if (m.code) o.code = m.code
    return o
  })
}

// Orquestador: Capa 1 + (Capa 2 si hay LLM). Robusto a fallo del LLM.
export async function extractMaterials(text, { filename, callAI, aiContext = {}, fewShot = '' } = {}) {
  const lines = precleanLines(text)
  const deterministic = parseCandidateLines(lines)

  let llmItems = []
  if (typeof callAI === 'function') {
    try {
      const cleaned = lines.join('\n').slice(0, 15000)
      const result = await callAI(buildExtractionPrompt(cleaned, filename, fewShot), aiContext)
      llmItems = normalizeLlmItems(Array.isArray(result) ? result : (result?.materials || []))
    } catch (err) {
      console.warn('[extraction] LLM falló, se usa solo Capa 1:', err.message)
    }
  }
  return mergeMaterials(deterministic, llmItems)
}
