// ============================================================================
// compare-budgets — concilia DOS presupuestos (CAPA 1, determinista).
//
// Caso de uso real: comparar el presupuesto que genera Construgest con un
// presupuesto externo de Presto (PDF/BC3/PZH ya importado) del MISMO proyecto.
// Los códigos NO coinciden (Construgest autonumera 02.01; Presto usa 03WSS80000),
// así que el emparejamiento es por SIMILITUD DE NOMBRE + misma unidad (Jaccard).
//
// TOOL = los dos presupuestos + el algoritmo de matching. No necesita datos
// externos. El LLM (si se usa) solo redacta el resumen; los números son del código.
// ============================================================================
import { analyzeBudget, _match } from './budget-analytics.js'

// Presupuesto↔presupuesto de fuentes distintas (Construgest/Presto): tolerante a abreviaturas.
const { fuzzyJaccard: jaccard, normUnit } = _match

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100 }
function pctDiff(a, b) { return a > 0 ? round2(((b - a) / a) * 100) : (b > 0 ? 100 : 0) }

const SIM_THRESHOLD = 0.6   // umbral mínimo de similitud de nombre para emparejar

/**
 * Empareja las partidas de B con las de A (greedy por mayor similitud), exigiendo
 * misma unidad. Devuelve emparejadas + huérfanas de cada lado.
 * @param {object} rawA presupuesto A (el de Construgest) — shape del frontend
 * @param {object} rawB presupuesto B (el importado de Presto)
 */
export function compareBudgets(rawA, rawB, opts = {}) {
  const A = analyzeBudget(rawA)
  const B = analyzeBudget(rawB)
  const itemsA = A.items_flat
  const itemsB = B.items_flat

  // Todas las parejas candidatas (misma unidad, similitud >= umbral), ordenadas.
  const candidates = []
  for (let i = 0; i < itemsA.length; i++) {
    for (let j = 0; j < itemsB.length; j++) {
      if (normUnit(itemsA[i].unit) !== normUnit(itemsB[j].unit)) continue
      const sim = jaccard(itemsA[i].name, itemsB[j].name)
      if (sim >= SIM_THRESHOLD) candidates.push({ i, j, sim })
    }
  }
  candidates.sort((x, y) => y.sim - x.sim)

  const usedA = new Set()
  const usedB = new Set()
  const matched = []
  for (const c of candidates) {
    if (usedA.has(c.i) || usedB.has(c.j)) continue
    usedA.add(c.i); usedB.add(c.j)
    const a = itemsA[c.i], b = itemsB[c.j]
    matched.push({
      name_a: a.name, name_b: b.name,
      code_a: a.code, code_b: b.code,
      unit: a.unit,
      similarity: round2(c.sim * 100),
      qty_a: a.quantity, qty_b: b.quantity,
      price_a: a.unit_price, price_b: b.unit_price,
      price_diff_pct: pctDiff(a.unit_price, b.unit_price),
      importe_a: a.importe, importe_b: b.importe,
    })
  }

  const onlyInA = itemsA.filter((_, i) => !usedA.has(i))
    .map((a) => ({ code: a.code, name: a.name, unit: a.unit, quantity: a.quantity, unit_price: a.unit_price, importe: a.importe }))
  const onlyInB = itemsB.filter((_, j) => !usedB.has(j))
    .map((b) => ({ code: b.code, name: b.name, unit: b.unit, quantity: b.quantity, unit_price: b.unit_price, importe: b.importe }))

  // Diferencias de precio significativas (>15%) entre partidas emparejadas.
  const bigPriceDiffs = matched
    .filter((m) => m.price_a > 0 && m.price_b > 0 && Math.abs(m.price_diff_pct) >= 15)
    .sort((x, y) => Math.abs(y.price_diff_pct) - Math.abs(x.price_diff_pct))

  const avgPriceDiff = matched.length
    ? round2(matched.filter((m) => m.price_a > 0 && m.price_b > 0)
        .reduce((s, m) => s + m.price_diff_pct, 0) / (matched.filter((m) => m.price_a > 0 && m.price_b > 0).length || 1))
    : 0

  return {
    label_a: opts.labelA || A.budget_name || 'Presupuesto A',
    label_b: opts.labelB || B.budget_name || 'Presupuesto B',
    total_a: A.budget_total,
    total_b: B.budget_total,
    total_diff: round2(B.budget_total - A.budget_total),
    total_diff_pct: pctDiff(A.budget_total, B.budget_total),
    summary: {
      matched_count: matched.length,
      only_a_count: onlyInA.length,
      only_b_count: onlyInB.length,
      big_price_diffs: bigPriceDiffs.length,
      avg_price_diff_pct: avgPriceDiff,
    },
    matched,
    only_in_a: onlyInA,
    only_in_b: onlyInB,
    big_price_diffs: bigPriceDiffs.slice(0, 20),
  }
}

/** Texto compacto de la comparación para que el LLM redacte un resumen (solo prosa). */
export function buildComparePrompt(c) {
  const diffs = c.big_price_diffs.slice(0, 6)
    .map((m) => `- ${m.name_a}: ${m.price_a} € vs ${m.price_b} € (${m.price_diff_pct > 0 ? '+' : ''}${m.price_diff_pct}%)`).join('\n') || '- (ninguna relevante)'
  return `Comparación de dos presupuestos del mismo proyecto. Redacta 2-3 frases (español)
resumiendo las diferencias. NO inventes cifras: usa solo estos datos.

"${c.label_a}": ${c.total_a} €  ·  "${c.label_b}": ${c.total_b} € (${c.total_diff_pct > 0 ? '+' : ''}${c.total_diff_pct}%)
Partidas emparejadas: ${c.summary.matched_count} · solo en A: ${c.summary.only_a_count} · solo en B: ${c.summary.only_b_count}
Diferencias de precio grandes:
${diffs}

Responde SOLO con este JSON:
{"resumen": "tu resumen aquí"}`
}

/** Resumen de reserva sin IA. */
export function fallbackCompareSummary(c) {
  return `"${c.label_a}" suma ${c.total_a} € y "${c.label_b}" ${c.total_b} € (${c.total_diff_pct > 0 ? '+' : ''}${c.total_diff_pct}%). ` +
    `${c.summary.matched_count} partidas emparejadas, ${c.summary.only_a_count} solo en A y ${c.summary.only_b_count} solo en B. ` +
    `${c.summary.big_price_diffs} con diferencia de precio relevante.`
}
