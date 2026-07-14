// ============================================================================
// Motor de análisis de presupuestos — CAPA 1 (código determinista).
//
// Recibe el presupuesto normalizado (el mismo shape que manda el frontend) y
// calcula TODO sin IA: totales por capítulo, %, métricas, incidencias reales y
// duplicados. Rápido, exacto y consistente run-to-run.
//
// El LLM local (qwen2.5:3b) NO ve números que deba calcular: solo redacta la
// prosa (resumen/justificación) a partir de las cifras que le pasa este motor.
// Motivo (spike AI-0/AI-2): el 3B alucina y parrotea placeholders cuando se le
// piden totales/varianzas. Las cifras las hace el código; el modelo solo el texto.
//
// Shape de entrada aceptado (flexible):
//   { budget:{name,...}, chapters:[ { code, name, items:[
//        { code, name, unit, quantity, unit_price, cost_price, total } ] } ] }
//   — o directamente un array de capítulos.
// ============================================================================

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
function round2(n) { return Math.round((num(n)) * 100) / 100 }
function pct(part, whole) { return whole > 0 ? round2((part / whole) * 100) : 0 }

// Normaliza un nombre para comparar (duplicados): minúsculas, sin acentos ni signos.
function normName(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}
function nameTokens(s) { return new Set(normName(s).split(' ').filter((w) => w.length > 2)) }
// Similitud de Jaccard entre dos nombres (0..1).
function jaccard(a, b) {
  const A = nameTokens(a), B = nameTokens(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}
function normUnit(u) { return String(u || '').toLowerCase().replace(/[²³]/g, (c) => (c === '²' ? '2' : '3')).replace(/[^a-z0-9]/g, '') }

// Similitud tolerante a abreviaturas: dos tokens casan si son iguales o uno es
// prefijo del otro (mín. 3 chars). Necesario en construcción, donde la misma partida
// se escribe "HORM. ARM." o "HORMIGON ARMADO". Se usa al emparejar entre fuentes
// distintas (presupuesto↔biblioteca/base); para duplicados dentro de un presupuesto
// se usa el Jaccard estricto (más conservador).
function tokenMatch(a, b) {
  if (a === b) return true
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  return s.length >= 3 && l.startsWith(s)
}
function fuzzyJaccard(a, b) {
  const A = [...nameTokens(a)], B = [...nameTokens(b)]
  if (!A.length || !B.length) return 0
  const usedB = new Set()
  let inter = 0
  for (const ta of A) {
    for (let k = 0; k < B.length; k++) {
      if (usedB.has(k)) continue
      if (tokenMatch(ta, B[k])) { usedB.add(k); inter++; break }
    }
  }
  return inter / (A.length + B.length - inter)
}

function safeParse(raw) {
  if (raw == null) return {}
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

// Helpers de matching reutilizables por otras skills (compare-budgets, find-similar…).
// jaccard = estricto (duplicados); fuzzyJaccard = tolerante a abreviaturas (cross-fuente).
export const _match = { normName, nameTokens, jaccard, fuzzyJaccard, normUnit }

/**
 * Núcleo del análisis. Devuelve todos los hechos calculados en código.
 * Ningún número de aquí procede del LLM.
 */
export function analyzeBudget(raw) {
  const data = safeParse(raw)
  const chaptersIn = Array.isArray(data) ? data : (Array.isArray(data?.chapters) ? data.chapters : [])
  const budgetMeta = (data && !Array.isArray(data) && data.budget) ? data.budget : {}

  const chapters = []
  const itemsFlat = []          // { chapter, code, name, unit, quantity, unit_price, cost_price, importe }
  let budgetTotal = 0

  for (const ch of chaptersIn) {
    const chCode = String(ch?.code ?? '').trim()
    const chName = String(ch?.name ?? '').trim()
    const items = Array.isArray(ch?.items) ? ch.items : []
    let chTotal = 0
    const chItems = []

    for (const it of items) {
      const quantity = num(it?.quantity)
      const unitPrice = num(it?.unit_price)
      const costPrice = it?.cost_price != null ? num(it.cost_price) : null
      // importe: usa el declarado si cuadra; si no, cantidad × precio.
      const computed = round2(quantity * unitPrice)
      const declared = it?.total != null || it?.importe != null ? round2(it.total ?? it.importe) : null
      const importe = declared != null && Math.abs(declared - computed) < 0.02 ? declared : computed

      const row = {
        chapter: chCode,
        code: String(it?.code ?? '').trim(),
        name: String(it?.name ?? '').trim(),
        unit: String(it?.unit ?? '').trim(),
        quantity,
        unit_price: unitPrice,
        cost_price: costPrice,
        importe,
      }
      chTotal += importe
      chItems.push(row)
      itemsFlat.push(row)
    }

    chTotal = round2(chTotal)
    budgetTotal += chTotal
    chapters.push({ code: chCode, name: chName, total: chTotal, item_count: chItems.length, items: chItems })
  }

  budgetTotal = round2(budgetTotal)
  for (const ch of chapters) ch.pct = pct(ch.total, budgetTotal)

  // ── Métricas ──
  const withPrice = itemsFlat.filter((i) => i.unit_price > 0).length
  const largestChapter = chapters.slice().sort((a, b) => b.total - a.total)[0] || null
  const mostExpensive = itemsFlat.slice().sort((a, b) => b.importe - a.importe).slice(0, 5)
    .map((i) => ({ code: i.code, name: i.name, importe: i.importe }))

  const metrics = {
    num_chapters: chapters.length,
    num_items: itemsFlat.length,
    items_with_price: withPrice,
    items_without_price: itemsFlat.length - withPrice,
    largest_chapter: largestChapter ? { code: largestChapter.code, name: largestChapter.name, total: largestChapter.total, pct: largestChapter.pct } : null,
    most_expensive_items: mostExpensive,
  }

  // ── Incidencias (deterministas) ──
  const issues = []
  let wid = 0
  const nextId = () => `w${++wid}`

  // 1) Partidas sin precio (con cantidad) → sin valorar
  const noPrice = itemsFlat.filter((i) => i.unit_price <= 0 && i.quantity > 0)
  if (noPrice.length) {
    issues.push({
      id: nextId(),
      severity: 'warning',
      message: `${noPrice.length} partida${noPrice.length > 1 ? 's' : ''} sin valorar (precio 0)`,
      affected_items: noPrice.map((i) => i.code).filter(Boolean).slice(0, 20),
      recommendation: 'Asignar precio unitario a estas partidas antes de cerrar el presupuesto.',
    })
  }

  // 2) Partidas sin cantidad
  const noQty = itemsFlat.filter((i) => i.quantity <= 0)
  if (noQty.length) {
    issues.push({
      id: nextId(),
      severity: 'warning',
      message: `${noQty.length} partida${noQty.length > 1 ? 's' : ''} sin cantidad (medición 0)`,
      affected_items: noQty.map((i) => i.code).filter(Boolean).slice(0, 20),
      recommendation: 'Revisar las mediciones: una cantidad 0 no aporta importe al presupuesto.',
    })
  }

  // 3) Capítulos vacíos o sin importe
  const emptyChapters = chapters.filter((c) => c.item_count === 0 || c.total <= 0)
  for (const c of emptyChapters) {
    issues.push({
      id: nextId(),
      severity: 'info',
      message: `Capítulo ${c.code || ''} "${c.name}" sin importe`,
      affected_items: c.code ? [c.code] : [],
      recommendation: c.item_count === 0 ? 'Añadir partidas o eliminar el capítulo.' : 'Todas sus partidas suman 0: revisar precios/cantidades.',
    })
  }

  // 4) Posibles duplicados (nombres muy similares y misma unidad)
  const duplicates = []
  for (let i = 0; i < itemsFlat.length; i++) {
    for (let j = i + 1; j < itemsFlat.length; j++) {
      const a = itemsFlat[i], b = itemsFlat[j]
      if (!a.name || !b.name) continue
      if (normUnit(a.unit) !== normUnit(b.unit)) continue
      const sim = jaccard(a.name, b.name)
      if (sim >= 0.85) {
        duplicates.push({ a: a.code, b: b.code, name_a: a.name, name_b: b.name, similarity: round2(sim * 100) })
      }
    }
  }
  if (duplicates.length) {
    for (const d of duplicates.slice(0, 10)) {
      issues.push({
        id: nextId(),
        severity: 'warning',
        message: `Posible duplicado: "${d.name_a}" y "${d.name_b}" (${d.similarity}% similares)`,
        affected_items: [d.a, d.b].filter(Boolean),
        recommendation: 'Verificar si son la misma partida para no medirla dos veces.',
      })
    }
  }

  // 5) Descripciones vagas (nombre muy corto o igual al código)
  const vague = itemsFlat.filter((i) => i.name && (normName(i.name).length < 6 || normName(i.name) === normName(i.code)))
  if (vague.length) {
    issues.push({
      id: nextId(),
      severity: 'info',
      message: `${vague.length} partida${vague.length > 1 ? 's' : ''} con descripción demasiado breve`,
      affected_items: vague.map((i) => i.code).filter(Boolean).slice(0, 20),
      recommendation: 'Ampliar la descripción para que la partida sea inequívoca.',
    })
  }

  // 6) Descuadre entre total declarado y suma de partidas
  const declaredTotal = budgetMeta.total != null ? round2(budgetMeta.total)
    : (budgetMeta.amount != null ? round2(budgetMeta.amount) : null)
  if (declaredTotal != null && Math.abs(declaredTotal - budgetTotal) > 0.5) {
    issues.push({
      id: nextId(),
      severity: 'critical',
      message: `El total declarado (${declaredTotal} €) no cuadra con la suma de partidas (${budgetTotal} €)`,
      affected_items: [],
      recommendation: 'Recalcular: la diferencia indica partidas mal sumadas o precios cambiados.',
    })
  }

  // ── Riesgo y confianza (deterministas) ──
  const critical = issues.filter((i) => i.severity === 'critical').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const risk_level = critical > 0 ? 'high' : (warnings >= 3 ? 'medium' : (warnings > 0 ? 'medium' : 'low'))
  const confidence_score = itemsFlat.length ? Math.round((withPrice / itemsFlat.length) * 100) : 0

  return {
    budget_name: String(budgetMeta.name || '').trim(),
    budget_total: budgetTotal,
    declared_total: declaredTotal,
    chapters: chapters.map((c) => ({ code: c.code, name: c.name, total: c.total, pct: c.pct, item_count: c.item_count })),
    metrics,
    issues,
    duplicates,
    items_flat: itemsFlat,
    risk_level,
    confidence_score,
  }
}

/**
 * Compacta los hechos calculados a un texto breve para que el LLM redacte prosa.
 * NO se le pide ningún cálculo: solo convertir estos datos en 2-3 frases.
 */
export function factsForNarrative(a) {
  const chLines = a.chapters
    .slice().sort((x, y) => y.total - x.total).slice(0, 8)
    .map((c) => `- ${c.code} ${c.name}: ${c.total} € (${c.pct}%)`).join('\n')
  const issueLines = a.issues.length
    ? a.issues.slice(0, 8).map((i) => `- [${i.severity}] ${i.message}`).join('\n')
    : '- (sin incidencias)'
  return `Presupuesto${a.budget_name ? ` "${a.budget_name}"` : ''}
Total: ${a.budget_total} €
Capítulos: ${a.metrics.num_chapters} · Partidas: ${a.metrics.num_items}
Capítulo mayor: ${a.metrics.largest_chapter ? `${a.metrics.largest_chapter.name} (${a.metrics.largest_chapter.pct}%)` : 'n/d'}

Desglose por capítulo:
${chLines}

Incidencias detectadas:
${issueLines}`
}

/**
 * Prompt para el resumen ejecutivo (solo prosa). Pide UN objeto JSON con un campo
 * de texto → seguro con el 3B (el colapso de format:json solo afecta a arrays).
 */
export function buildSummaryPrompt(a) {
  return `Eres un jefe de obra experto. Con estos datos YA CALCULADos de un presupuesto,
escribe un resumen ejecutivo de 2 o 3 frases en español. NO inventes cifras: usa solo
las que aparecen aquí. Comenta el reparto de coste y las incidencias más importantes.

${factsForNarrative(a)}

Responde SOLO con este JSON:
{"resumen": "tu resumen aquí"}`
}

/**
 * Sugerencias accionables derivadas de los hechos (sin IA). Cada una en el shape
 * que espera el frontend: {id,title,description,impact,savings,implementation,risk}.
 */
export function buildSuggestions(a) {
  const out = []
  let sid = 0
  const push = (o) => out.push({ id: `s${++sid}`, savings: 0, ...o })

  if (a.metrics.items_without_price > 0) {
    push({
      title: `Valorar ${a.metrics.items_without_price} partida${a.metrics.items_without_price > 1 ? 's' : ''} sin precio`,
      description: 'Hay partidas con medición pero sin precio unitario: no aportan importe y falsean el total.',
      impact: 'high', implementation: 'Asignar precio desde tu catálogo o pedir oferta al proveedor.', risk: 'low',
    })
  }
  if (a.duplicates.length > 0) {
    push({
      title: `Revisar ${a.duplicates.length} posible${a.duplicates.length > 1 ? 's' : ''} duplicado${a.duplicates.length > 1 ? 's' : ''}`,
      description: 'Partidas con nombre casi idéntico y misma unidad: riesgo de medir dos veces el mismo trabajo.',
      impact: 'medium', implementation: 'Comparar sus mediciones y fusionar si procede.', risk: 'low',
    })
  }
  const empty = a.chapters.filter((c) => c.item_count === 0 || c.total <= 0).length
  if (empty > 0) {
    push({
      title: `Completar ${empty} capítulo${empty > 1 ? 's' : ''} vacío${empty > 1 ? 's' : ''}`,
      description: 'Capítulos sin importe: o faltan partidas o sobran en el presupuesto.',
      impact: 'medium', implementation: 'Añadir las partidas que falten o eliminar el capítulo.', risk: 'low',
    })
  }
  if (a.metrics.largest_chapter && a.metrics.largest_chapter.pct >= 40) {
    push({
      title: `Concentración de coste en "${a.metrics.largest_chapter.name}"`,
      description: `Este capítulo supone el ${a.metrics.largest_chapter.pct}% del presupuesto: conviene afinar sus precios y pedir varias ofertas.`,
      impact: 'medium', implementation: 'Solicitar comparativa de proveedores para las partidas de mayor importe.', risk: 'low',
    })
  }
  return out
}

// ── estimate-contingency: % de imprevistos por reglas (tool = reglas + señales del motor) ──
// Base por complejidad + ajuste por incertidumbre detectada (partidas sin valorar,
// incidencias críticas). El LLM solo redacta la justificación.
export function estimateContingency(a, complexity = 'media') {
  const BASE = { baja: 8, media: 12, alta: 18 }
  let pct = BASE[String(complexity).toLowerCase()] ?? 12
  const risk_factors = []

  const noPriceRatio = a.metrics.num_items ? a.metrics.items_without_price / a.metrics.num_items : 0
  if (noPriceRatio > 0.05) {
    pct += 3
    risk_factors.push(`${a.metrics.items_without_price} partidas sin valorar: coste final incierto`)
  }
  const critical = a.issues.filter((i) => i.severity === 'critical').length
  if (critical > 0) {
    pct += 2
    risk_factors.push(`${critical} incidencia(s) crítica(s) sin resolver`)
  }
  if (a.metrics.largest_chapter && a.metrics.largest_chapter.pct >= 50) {
    pct += 2
    risk_factors.push(`Coste muy concentrado en "${a.metrics.largest_chapter.name}" (${a.metrics.largest_chapter.pct}%)`)
  }
  if (String(complexity).toLowerCase() === 'alta') risk_factors.push('Proyecto marcado de alta complejidad')
  if (!risk_factors.length) risk_factors.push('Presupuesto completo y sin incidencias graves')

  pct = Math.min(pct, 30)
  return {
    recommended_contingency_pct: pct,
    contingency_amount: Math.round(a.budget_total * (pct / 100) * 100) / 100,
    risk_factors,
    // reparto orientativo del colchón
    contingency_breakdown: { materials: Math.round(pct * 0.4), labor: Math.round(pct * 0.25), unforeseen: pct - Math.round(pct * 0.4) - Math.round(pct * 0.25) },
  }
}

export function buildContingencyPrompt(a, c) {
  return `Eres un jefe de obra. Justifica en 2-3 frases (español) por qué una contingencia del
${c.recommended_contingency_pct}% (${c.contingency_amount} €) es razonable para este presupuesto.
NO inventes cifras: usa solo estos datos.

${factsForNarrative(a)}
Factores de riesgo: ${c.risk_factors.join('; ')}

Responde SOLO con este JSON:
{"justificacion": "tu justificación aquí"}`
}

// ── executive-report: estructura del motor + LLM solo para la prosa ──
export function reportStructure(a) {
  const m = a.metrics
  const avg = m.num_items ? Math.round((a.budget_total / m.num_items) * 100) / 100 : 0
  return {
    titulo: `Informe Ejecutivo${a.budget_name ? ` — ${a.budget_name}` : ''}`,
    desglose_costos: a.chapters.slice().sort((x, y) => y.total - x.total)
      .map((c) => ({ capitulo: c.code, nombre: c.name, importe: c.total, porcentaje: c.pct })),
    metricas_clave: [
      { nombre: 'Importe total', valor: `${a.budget_total} €` },
      { nombre: 'Capítulos', valor: String(m.num_chapters) },
      { nombre: 'Partidas', valor: String(m.num_items) },
      { nombre: 'Importe medio/partida', valor: `${avg} €` },
      ...(m.largest_chapter ? [{ nombre: 'Capítulo de mayor peso', valor: `${m.largest_chapter.name} (${m.largest_chapter.pct}%)` }] : []),
    ],
    riesgos: a.issues.map((i) => ({
      descripcion: i.message,
      probabilidad: i.severity === 'critical' ? 'alta' : (i.severity === 'warning' ? 'media' : 'baja'),
      impacto: i.severity === 'critical' ? 'alto' : (i.severity === 'warning' ? 'medio' : 'bajo'),
    })),
    oportunidades_ahorro: [],   // requiere base de precios (compare-prices)
  }
}

export function buildReportPrompt(a) {
  return `Eres un consultor senior de construcción. Con estos datos YA CALCULADOS, redacta la parte
narrativa de un informe ejecutivo en español. NO inventes cifras: usa solo las que aparecen aquí.

${factsForNarrative(a)}

Responde SOLO con este JSON:
{"resumen_ejecutivo": "un párrafo", "conclusiones": ["conclusión 1", "conclusión 2"], "proximos_pasos": ["paso 1", "paso 2"]}`
}

/** Resumen de reserva (sin IA) por si el LLM falla o está caído. */
export function fallbackSummary(a) {
  const big = a.metrics.largest_chapter
  const parts = [`Presupuesto de ${a.budget_total} € en ${a.metrics.num_chapters} capítulos y ${a.metrics.num_items} partidas.`]
  if (big) parts.push(`El capítulo con más peso es "${big.name}" (${big.pct}%).`)
  if (a.issues.length) parts.push(`Se han detectado ${a.issues.length} incidencia${a.issues.length > 1 ? 's' : ''} a revisar.`)
  else parts.push('No se han detectado incidencias.')
  return parts.join(' ')
}
