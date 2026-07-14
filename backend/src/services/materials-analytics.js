// ============================================================================
// analyze-materials — análisis del catálogo de materiales (CAPA 1, determinista).
//
// TOOL = el propio catálogo (`cons_materials`) + los precios por proveedor
// (`cons_supplier_materials`). Sin IA:
//   - DUPLICADOS: materiales con nombre casi idéntico y misma unidad, sin agrupar
//     → candidatos a fusionar (equivalentes).
//   - ALERTAS DE PRECIO: materiales donde tu precio actual supera al del proveedor
//     más barato disponible → estás pagando de más.
//   - OPTIMIZACIÓN POR PROVEEDOR: para materiales con varias ofertas, cuál es la
//     más barata y cuánto te ahorras por unidad.
// ============================================================================
import { _match } from './budget-analytics.js'

// Duplicados de catálogo = SUGERENCIA de agrupar (el usuario confirma) → matching
// tolerante a abreviaturas/espaciado y umbral algo más laxo que en un presupuesto.
const { fuzzyJaccard: jaccard, normUnit } = _match
const DUP_THRESHOLD = 0.7
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100 }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/**
 * @param {Array} materials  [{id, code, name, unit, unit_price, material_group_id}]
 * @param {Array} supplierLinks  [{material_id, supplier_id, unit_price}]
 * @param {Array} suppliers  [{id, name}]
 */
export function analyzeMaterials(materials = [], supplierLinks = [], suppliers = []) {
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]))

  // Precio por proveedor de cada material.
  const pricesByMat = new Map()  // material_id → [{supplier_id, price}]
  for (const l of supplierLinks) {
    const price = num(l.unit_price)
    if (price <= 0) continue
    if (!pricesByMat.has(l.material_id)) pricesByMat.set(l.material_id, [])
    pricesByMat.get(l.material_id).push({ supplier_id: l.supplier_id, price })
  }

  // ── Duplicados sin agrupar (misma unidad, nombre muy similar) ──
  const duplicates = []
  for (let i = 0; i < materials.length; i++) {
    for (let j = i + 1; j < materials.length; j++) {
      const a = materials[i], b = materials[j]
      if (normUnit(a.unit) !== normUnit(b.unit)) continue
      // Ya agrupados juntos → no es duplicado pendiente.
      if (a.material_group_id && b.material_group_id && a.material_group_id === b.material_group_id) continue
      const sim = jaccard(a.name, b.name)
      if (sim >= DUP_THRESHOLD) {
        duplicates.push({
          id_1: a.id, id_2: b.id,
          name_1: a.name, name_2: b.name,
          similarity_score: round2(sim * 100),
          reason: 'Nombre casi idéntico y misma unidad',
          suggested_action: 'Agrupar como equivalentes',
        })
      }
    }
  }

  // ── Alertas de precio y optimización por proveedor ──
  const price_alerts = []
  const supplier_optimization = []
  let potential_unit_savings = 0

  for (const m of materials) {
    const offers = pricesByMat.get(m.id)
    if (!offers || offers.length === 0) continue
    const cheapest = offers.reduce((a, b) => (b.price < a.price ? b : a))
    const current = num(m.unit_price)

    // Pagas más que la oferta más barata que tienes registrada.
    if (current > 0 && cheapest.price < current * 0.9) {
      const diffPct = round2(((current - cheapest.price) / current) * 100)
      potential_unit_savings += round2(current - cheapest.price)
      price_alerts.push({
        material_name: m.name,
        current_price: current,
        best_supplier_price: cheapest.price,
        best_supplier_name: supplierName.get(cheapest.supplier_id) || 'proveedor',
        difference_percent: diffPct,
        recommendation: `Comprar a "${supplierName.get(cheapest.supplier_id) || 'proveedor'}" (${cheapest.price} € vs ${current} €).`,
      })
    }

    // Varias ofertas con diferencia relevante → insight de proveedor.
    if (offers.length >= 2) {
      const max = offers.reduce((a, b) => (b.price > a.price ? b : a))
      if (max.price > cheapest.price * 1.1) {
        supplier_optimization.push(
          `${m.name}: más barato en "${supplierName.get(cheapest.supplier_id) || 'proveedor'}" (${cheapest.price} €) frente a ${max.price} € (${round2(((max.price - cheapest.price) / max.price) * 100)}% de diferencia).`
        )
      }
    }
  }

  price_alerts.sort((a, b) => b.difference_percent - a.difference_percent)

  return {
    total_items: materials.length,
    materials_with_offers: pricesByMat.size,
    duplicates,
    price_alerts,
    supplier_optimization,
    potential_unit_savings: round2(potential_unit_savings),   // ahorro POR UNIDAD (el catálogo no tiene cantidades)
    inventory_insights: buildInsights(materials, duplicates, price_alerts),
  }
}

function buildInsights(materials, duplicates, alerts) {
  const out = []
  if (duplicates.length) out.push(`${duplicates.length} posible(s) duplicado(s) sin agrupar: consolidar evita medir/comprar dos veces.`)
  if (alerts.length) out.push(`${alerts.length} material(es) donde tu precio supera al del proveedor más barato registrado.`)
  const noOffers = materials.filter((m) => num(m.unit_price) <= 0).length
  if (noOffers) out.push(`${noOffers} material(es) sin precio: complétalos para poder comparar.`)
  if (!out.length) out.push('Catálogo sin duplicados ni sobreprecios evidentes.')
  return out
}
