// ============================================================================
// analyze-certifications — avance de obra certificado (CAPA 1, determinista).
//
// TOOL = las certificaciones del proyecto ya valoradas (mismo cálculo que el
// endpoint /certifications/project/:id/overview: importe por certificación,
// acumulado a origen, total presupuestado y % de avance). Sin IA calcula avance,
// pendiente, ritmo y estimación de cierre. El LLM solo redacta el resumen.
//
// @param overview  Array por certificación ordenada por número:
//   [{ number, name, status, current_amount, total_certified, budget_total, progress_pct }]
// ============================================================================
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function round2(n) { return Math.round(num(n) * 100) / 100 }

/**
 * Construye el overview por certificación a partir de datos crudos (misma lógica que
 * el endpoint /certifications/project/:id/overview). Puro: sin BD.
 * @param certs     [{id, budget_id, number, name, status}]
 * @param items     [{certification_id, budget_item_id, certified_quantity}]
 * @param priceMap  { budget_item_id: unit_price }
 * @param budgetTotals { budget_id: total_presupuestado }
 */
export function buildOverview(certs = [], items = [], priceMap = {}, budgetTotals = {}) {
  const itemsByCert = {}
  for (const it of items) {
    (itemsByCert[it.certification_id] ||= []).push(it)
  }
  const sorted = [...certs].sort((a, b) => num(a.number) - num(b.number))
  const cumulativeByBudget = {}

  return sorted.map((cert) => {
    const its = itemsByCert[cert.id] || []
    const current_amount = its.reduce((s, i) => s + num(i.certified_quantity) * num(priceMap[i.budget_item_id]), 0)
    const previous_amount = cumulativeByBudget[cert.budget_id] || 0
    const total_certified = previous_amount + current_amount
    cumulativeByBudget[cert.budget_id] = total_certified
    const budget_total = num(budgetTotals[cert.budget_id])
    return {
      number: cert.number, name: cert.name, status: cert.status,
      current_amount, total_certified, budget_total,
      progress_pct: budget_total > 0 ? (total_certified / budget_total) * 100 : 0,
    }
  })
}

export function analyzeCertifications(overview = []) {
  const certs = [...overview].sort((a, b) => num(a.number) - num(b.number))
  const last = certs[certs.length - 1] || null

  const budget_total = round2(last?.budget_total || 0)
  const total_certified = round2(last?.total_certified || 0)
  const total_progress = last ? round2(num(last.progress_pct)) : 0
  const pending_amount = round2(budget_total - total_certified)

  // Ritmo medio por certificación (solo las que aportan importe).
  const productive = certs.filter((c) => num(c.current_amount) > 0)
  const avg_per_cert = productive.length ? round2(total_certified / productive.length) : 0
  const remaining_certs = avg_per_cert > 0 ? Math.ceil(pending_amount / avg_per_cert) : null

  // Señales de riesgo deterministas.
  const risk_factors = []
  if (total_progress > 100.5) risk_factors.push(`Sobre-certificación: ${total_progress}% del presupuesto (>100%).`)
  if (last && num(last.current_amount) <= 0 && certs.length > 0) risk_factors.push('La última certificación no aporta importe: avance parado.')
  if (pending_amount > 0 && certs.length >= 3 && avg_per_cert > 0 && remaining_certs && remaining_certs > certs.length * 2) {
    risk_factors.push('Al ritmo actual, cerrar la obra requeriría muchas más certificaciones que las emitidas.')
  }
  if (!risk_factors.length) risk_factors.push('Avance dentro de lo esperado.')

  const completion_estimate = pending_amount <= 0.5
    ? 'Obra prácticamente certificada al 100%.'
    : (remaining_certs ? `A este ritmo, ~${remaining_certs} certificación(es) más para cerrar.` : 'Sin ritmo suficiente para estimar el cierre.')

  return {
    certifications_count: certs.length,
    total_progress,          // % acumulado a origen
    total_certified,         // €
    budget_total,            // €
    pending_amount,          // €
    avg_per_cert,            // € por certificación productiva
    completion_estimate,
    risk_assessment: risk_factors.join(' '),
    per_certification: certs.map((c) => ({
      number: c.number, name: c.name, status: c.status,
      current_amount: round2(c.current_amount), total_certified: round2(c.total_certified),
      progress_pct: round2(c.progress_pct),
    })),
  }
}

export function buildCertificationsPrompt(a) {
  const lines = a.per_certification.slice(-6)
    .map((c) => `- Cert nº${c.number} (${c.status}): +${c.current_amount} € → acumulado ${c.total_certified} € (${c.progress_pct}%)`).join('\n')
  return `Eres un jefe de obra. Con estos datos YA CALCULADOS del avance certificado, escribe 2-3 frases
(español). NO inventes cifras: usa solo estas.

Avance: ${a.total_progress}% · Certificado ${a.total_certified} € de ${a.budget_total} € · Pendiente ${a.pending_amount} €
${lines}

Responde SOLO con este JSON: {"resumen": "..."}`
}

export function fallbackCertificationsSummary(a) {
  return `Avance certificado ${a.total_progress}% (${a.total_certified} € de ${a.budget_total} €), ` +
    `pendiente ${a.pending_amount} € en ${a.certifications_count} certificación(es). ${a.completion_estimate}`
}
