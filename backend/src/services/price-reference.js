// ============================================================================
// Tool de PRECIOS DE REFERENCIA para las skills de optimización/mercado.
//
// Fuentes (decidido con Benjamin):
//   1) BIBLIOTECA propia del usuario (`cons_saved_partidas`) → MANDA (precios reales).
//   2) BASE PÚBLICA en BC3 (p.ej. Andalucía) → respaldo, enchufable (pendiente del
//      fichero; la firma ya la contempla vía `extraReference`).
//
// El emparejamiento partida→referencia es por SIMILITUD DE NOMBRE (Jaccard) + misma
// unidad, igual que el resto del motor. Todo es CÓDIGO (Capa 1): sin este dato, las
// skills de optimización no pueden dar cifras → devuelven [] a propósito.
// ============================================================================
import { _match } from './budget-analytics.js'

const { jaccard, normUnit } = _match
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100 }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }

const DEFAULT_THRESHOLD = 0.55   // similitud mínima de nombre para aceptar la referencia

/**
 * Normaliza filas de referencia (de la biblioteca o de la base pública) a un shape común.
 */
export function normalizeReference(rows = [], source = 'biblioteca') {
  return rows.map((r) => ({
    name: String(r.name || '').trim(),
    unit: String(r.unit || '').trim(),
    unit_price: num(r.unit_price),
    cost_price: r.cost_price != null ? num(r.cost_price) : null,
    usage_count: num(r.usage_count),
    source: r.source || source,
  })).filter((r) => r.name && r.unit_price > 0)
}

/**
 * Para cada partida del presupuesto, busca su mejor referencia de precio.
 * @param {Array} items  items_flat del motor ({name, unit, quantity, unit_price, code})
 * @param {Array} reference  filas de referencia ya normalizadas
 * @returns {Array} items enriquecidos con { ref_price, ref_name, ref_source, similarity } (o ref_price:null)
 */
export function lookupPrices(items, reference, { threshold = DEFAULT_THRESHOLD } = {}) {
  return items.map((it) => {
    let best = null, bestSim = 0
    for (const r of reference) {
      if (normUnit(it.unit) !== normUnit(r.unit)) continue
      const sim = jaccard(it.name, r.name)
      // A igualdad de similitud, prefiere la referencia más usada (más fiable).
      if (sim > bestSim || (sim === bestSim && best && r.usage_count > best.usage_count)) {
        bestSim = sim; best = r
      }
    }
    if (best && bestSim >= threshold) {
      return {
        ...it,
        ref_price: best.unit_price,
        ref_name: best.name,
        ref_source: best.source,
        similarity: round2(bestSim * 100),
      }
    }
    return { ...it, ref_price: null }
  })
}

/**
 * compare-prices: valora cada partida emparejada contra su referencia.
 * status: overpriced (>+10%), underpriced (<-10%), within_range.
 */
export function comparePrices(items, reference, opts = {}) {
  const looked = lookupPrices(items, reference, opts)
  const matched = looked.filter((i) => i.ref_price != null && i.ref_price > 0)

  const market_analysis = matched.map((i) => {
    const diffPct = round2(((i.unit_price - i.ref_price) / i.ref_price) * 100)
    const status = diffPct > 10 ? 'overpriced' : (diffPct < -10 ? 'underpriced' : 'within_range')
    return {
      item_code: i.code,
      item_name: i.name,
      market_price_avg: i.ref_price,
      quoted_price: i.unit_price,
      status,
      diff_pct: diffPct,
      source: i.ref_source,
      opportunity: status === 'overpriced'
        ? `Por encima de la referencia (${i.ref_source}): posible ahorro`
        : (status === 'underpriced' ? 'Por debajo de la referencia: revisar que no falte alcance' : 'En rango de referencia'),
    }
  })

  const negotiation_potential = round2(matched
    .filter((i) => i.unit_price > i.ref_price)
    .reduce((s, i) => s + (i.unit_price - i.ref_price) * num(i.quantity), 0))

  const withinOrBelow = market_analysis.filter((m) => m.status !== 'overpriced').length
  const indice_competitividad = market_analysis.length ? Math.round((withinOrBelow / market_analysis.length) * 100) : null

  return {
    matched_count: matched.length,
    total_count: items.length,
    market_analysis,
    negotiation_potential,
    indice_competitividad,
  }
}

/**
 * suggest-optimizations: partidas cuyo precio supera la referencia en >10%.
 * savings = (precio_actual − referencia) × cantidad. Array en el shape del frontend.
 */
export function suggestOptimizations(items, reference, opts = {}) {
  const looked = lookupPrices(items, reference, opts)
  const out = []
  for (const i of looked) {
    if (i.ref_price == null || i.ref_price <= 0) continue
    if (i.unit_price <= i.ref_price * 1.1) continue   // solo las claramente por encima
    const savings = round2((i.unit_price - i.ref_price) * num(i.quantity))
    if (savings <= 0) continue
    out.push({
      item_code: i.code,
      item_name: i.name,
      current_price: i.unit_price,
      suggested_price: i.ref_price,
      savings,
      reason: `Precio por encima de la referencia (${i.ref_source}: "${i.ref_name}")`,
      confidence: round2(i.similarity / 100),
    })
  }
  return out.sort((a, b) => b.savings - a.savings)
}
