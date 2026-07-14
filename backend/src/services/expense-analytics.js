// ============================================================================
// analyze-expenses — gastos reales vs presupuesto (CAPA 1, determinista).
//
// TOOL = gastos del proyecto (`cons_project_expenses`, enlazados a capítulo por
// `budget_chapter_id`) + los importes presupuestados por capítulo. Sin IA calcula
// desviación por capítulo, total gastado vs presupuestado y anomalías (sobrecoste,
// gastos sin asignar a capítulo). El LLM solo redacta resumen/tendencia.
//
// Convención de signo (como el frontend): variación NEGATIVA = por debajo del
// presupuesto (bien); POSITIVA = por encima (mal).
// ============================================================================
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function round2(n) { return Math.round(num(n) * 100) / 100 }
function pct(part, whole) { return whole > 0 ? round2((part / whole) * 100) : 0 }

/**
 * @param {Array} expenses  [{budget_chapter_id, amount, concept, supplier_name}]
 * @param {Array} chapters  [{id, code, name, budgeted}]  (importe presupuestado por capítulo)
 */
export function analyzeExpenses(expenses = [], chapters = []) {
  const chapterById = new Map(chapters.map((c) => [c.id, c]))

  // Gasto por capítulo + total + no asignado.
  const spentByChapter = new Map()
  let totalSpent = 0
  let unassigned = 0
  for (const e of expenses) {
    const amt = num(e.amount)
    totalSpent += amt
    if (e.budget_chapter_id && chapterById.has(e.budget_chapter_id)) {
      spentByChapter.set(e.budget_chapter_id, (spentByChapter.get(e.budget_chapter_id) || 0) + amt)
    } else {
      unassigned += amt
    }
  }
  totalSpent = round2(totalSpent)
  unassigned = round2(unassigned)

  const totalBudget = round2(chapters.reduce((s, c) => s + num(c.budgeted), 0))

  // Desglose por capítulo (presupuestado vs gastado).
  const by_chapter = chapters.map((c) => {
    const spent = round2(spentByChapter.get(c.id) || 0)
    const budgeted = round2(c.budgeted)
    const variance = round2(spent - budgeted)
    return {
      code: c.code, name: c.name, budgeted, spent,
      variance, variance_pct: pct(variance, budgeted),
      overspent: budgeted > 0 && spent > budgeted,
    }
  }).sort((a, b) => b.spent - a.spent)

  // Anomalías deterministas.
  const expense_anomalies = []
  for (const c of by_chapter.filter((c) => c.overspent)) {
    expense_anomalies.push(`Capítulo "${c.name}": gastado ${c.spent} € supera lo presupuestado ${c.budgeted} € (+${c.variance_pct}%).`)
  }
  if (unassigned > 0) {
    expense_anomalies.push(`${unassigned} € en gastos sin asignar a ningún capítulo del presupuesto.`)
  }

  const budget_variance = round2(totalSpent - totalBudget)
  const variance_percentage = pct(budget_variance, totalBudget)
  const risk_level = budget_variance > 0 ? 'high' : (expense_anomalies.length > 0 ? 'medium' : 'low')

  return {
    total_spent: totalSpent,
    budget_total: totalBudget,
    budget_variance,             // €  (>0 = sobrecoste)
    variance_percentage,         // %  (>0 = sobrecoste)
    unassigned_amount: unassigned,
    anomalies_found: expense_anomalies.length,
    risk_level,
    by_chapter,
    expense_anomalies,
    expenses_count: expenses.length,
  }
}

export function buildExpensesPrompt(a) {
  const top = a.by_chapter.slice(0, 8)
    .map((c) => `- ${c.name}: gastado ${c.spent} € / presupuestado ${c.budgeted} € (${c.variance_pct > 0 ? '+' : ''}${c.variance_pct}%)`).join('\n')
  return `Eres un jefe de obra controlando costes. Con estos datos YA CALCULADOS, escribe 2-3 frases
(español) sobre el control de gasto y la tendencia. NO inventes cifras: usa solo estas.

Gastado total: ${a.total_spent} € / Presupuestado: ${a.budget_total} € (${a.variance_percentage > 0 ? '+' : ''}${a.variance_percentage}%)
Sin asignar: ${a.unassigned_amount} €
Por capítulo:
${top}

Responde SOLO con este JSON: {"resumen": "...", "tendencia": "..."}`
}

export function fallbackExpensesSummary(a) {
  const dir = a.budget_variance > 0 ? 'por ENCIMA' : 'por debajo'
  return `Gastado ${a.total_spent} € de ${a.budget_total} € presupuestados (${dir}, ${a.variance_percentage}%). ` +
    `${a.anomalies_found} anomalía(s) detectada(s)${a.unassigned_amount > 0 ? `; ${a.unassigned_amount} € sin asignar` : ''}.`
}
