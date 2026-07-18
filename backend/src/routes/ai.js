import { Router } from 'express'
import { authMiddleware, resolveProjectAccess } from '../middlewares/auth.js'
import supabase from '../db/local.js'
import { callAI } from '../services/ai-service.js'
import { extractMaterials } from '../services/extraction.js'
import {
  comparePrices,
  suggestOptimizations,
  normalizeReference,
  findSimilar,
} from '../services/price-reference.js'
import { loadPublicPriceBases } from '../services/price-base.js'
import { recordCorrection, getRecentCorrections, fewShotFor, CORRECTION_SKILLS } from '../services/ai-corrections.js'
import {
  analyzeBudget,
  buildSummaryPrompt,
  buildSuggestions,
  fallbackSummary,
  estimateContingency,
  buildContingencyPrompt,
  reportStructure,
  buildReportPrompt,
} from '../services/budget-analytics.js'

const router = Router()
router.use(authMiddleware)

// ==================== Helpers ==================== //

/**
 * Carga la referencia de precios de una organización.
 * Fuente 1: biblioteca propia (`cons_saved_partidas`) → MANDA (precios reales).
 * Fuente 2: bases públicas BC3 del directorio `data/price-bases` (respaldo,
 * enchufable). Se concatenan; en `lookupPrices` la biblioteca gana a igualdad
 * de similitud (ver source priority en price-reference.js).
 */
async function loadPriceReference(orgId) {
  const { data, error } = await supabase
    .from('cons_saved_partidas')
    .select('name, unit, unit_price, cost_price, usage_count, source')
    .eq('organization_id', orgId)
  if (error) throw error
  const biblioteca = normalizeReference(data || [], 'biblioteca')
  const publicas = loadPublicPriceBases()
  return [...biblioteca, ...publicas]
}

// ================================================================
//  PRESUPUESTOS — análisis sobre el motor determinista
// ================================================================

// POST /api/ai/analyze-budget — Análisis comprehensivo de presupuesto.
// CAPA 1 (código): totales, %, incidencias, sugerencias → 0% alucinación.
// CAPA 2 (LLM local): SOLO redacta el resumen ejecutivo con las cifras ya dadas.
router.post('/analyze-budget', async (req, res, next) => {
  try {
    if (!req.body?.data) return res.status(400).json({ error: 'Datos requeridos para el análisis' })
    const a = analyzeBudget(req.body.data)

    // El LLM solo escribe la prosa. Si falla o está caído, resumen de reserva.
    let summary = fallbackSummary(a)
    try {
      const r = await callAI(buildSummaryPrompt(a), { maxTokens: 512, temperature: 0.2 })
      const text = (r?.resumen || r?.summary || r?.raw_response || '').toString().trim()
      if (text && text.length >= 20) summary = text
    } catch (err) {
      console.warn('[analyze-budget] LLM falló, resumen de reserva:', err.message)
    }

    res.json({
      summary,
      total_cost: a.budget_total,
      estimated_savings: 0,          // el ahorro real necesita catálogo/mercado (compare-prices)
      confidence_score: a.confidence_score,
      risk_level: a.risk_level,
      suggestions: buildSuggestions(a),
      warnings: a.issues,
      optimizations: [],             // se rellenan en compare-prices con precios de referencia
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/ai/compare-budgets — Concilia dos presupuestos del mismo proyecto
// (p.ej. el de Construgest vs uno importado de Presto). Empareja por nombre+unidad,
// calcula diferencias de precio/importe y qué falta en cada lado. LLM solo el resumen.
router.post('/compare-budgets', async (req, res, next) => {
  try {
    const a = req.body?.budget_a ?? req.body?.data_a ?? req.body?.a
    const b = req.body?.budget_b ?? req.body?.data_b ?? req.body?.b
    if (!a || !b) return res.status(400).json({ error: 'Se requieren dos presupuestos (budget_a, budget_b)' })

    const { compareBudgets, buildComparePrompt, fallbackCompareSummary } = await import('../services/budget-compare.js')
    const result = compareBudgets(a, b, { labelA: req.body?.label_a, labelB: req.body?.label_b })

    // OJO: `result.summary` es el objeto de conteos; la prosa del LLM va en `assessment`
    // para NO pisarlo.
    let assessment = fallbackCompareSummary(result)
    try {
      const r = await callAI(buildComparePrompt(result), { maxTokens: 500, temperature: 0.2 })
      const text = (r?.resumen || r?.raw_response || '').toString().trim()
      if (text && text.length >= 20) assessment = text
    } catch (err) {
      console.warn('[compare-budgets] LLM falló, resumen de reserva:', err.message)
    }

    res.json({ ...result, assessment })
  } catch (err) {
    next(err)
  }
})

// POST /api/ai/suggest-optimizations — Optimizaciones de costes.
// TOOL: precios de referencia (biblioteca del org). Marca las partidas cuyo precio
// supera su referencia >10%; savings = (precio − referencia) × cantidad. Sin
// referencia (biblioteca vacía) devuelve [] a propósito. 100% determinista.
router.post('/suggest-optimizations', async (req, res, next) => {
  try {
    if (!req.body?.data) return res.status(400).json({ error: 'Datos requeridos para el análisis' })
    const a = analyzeBudget(req.body.data)
    const reference = await loadPriceReference(req.user.organization_id)
    res.json(suggestOptimizations(a.items_flat, reference))
  } catch (err) {
    next(err)
  }
})

// POST /api/ai/detect-issues — Detección de problemas e inconsistencias.
// 100% determinista (sin LLM): duplicados, partidas sin valorar/sin cantidad,
// capítulos vacíos, descripciones vagas y descuadres. Consistente e instantáneo.
router.post('/detect-issues', (req, res, next) => {
  try {
    if (!req.body?.data) return res.status(400).json({ error: 'Datos requeridos para el análisis' })
    const a = analyzeBudget(req.body.data)
    res.json(a.issues)   // ya en el shape {id,severity,message,affected_items,recommendation}
  } catch (err) {
    next(err)
  }
})

// POST /api/ai/executive-report — Informe ejecutivo profesional.
// Estructura (título, desglose, métricas, riesgos) del motor; el LLM SOLO redacta
// resumen_ejecutivo / conclusiones / proximos_pasos.
router.post('/executive-report', async (req, res, next) => {
  try {
    if (!req.body?.data) return res.status(400).json({ error: 'Datos requeridos para el análisis' })
    const a = analyzeBudget(req.body.data)
    const base = reportStructure(a)

    let narrative = { resumen_ejecutivo: fallbackSummary(a), conclusiones: [], proximos_pasos: [] }
    try {
      const r = await callAI(buildReportPrompt(a), { maxTokens: 900, temperature: 0.2 })
      if (r && (r.resumen_ejecutivo || r.conclusiones || r.proximos_pasos)) {
        narrative = {
          resumen_ejecutivo: (r.resumen_ejecutivo || narrative.resumen_ejecutivo).toString(),
          conclusiones: Array.isArray(r.conclusiones) ? r.conclusiones.map(String) : [],
          proximos_pasos: Array.isArray(r.proximos_pasos) ? r.proximos_pasos.map(String) : [],
        }
      }
    } catch (err) {
      console.warn('[executive-report] LLM falló, informe con estructura del motor:', err.message)
    }

    res.json({ ...base, ...narrative })
  } catch (err) {
    next(err)
  }
})

// POST /api/ai/compare-prices — Comparación con precios de referencia.
// TOOL: biblioteca del org. Empareja cada partida con su referencia y la clasifica
// (overpriced/within_range/underpriced). El LLM SOLO redacta la valoración general.
router.post('/compare-prices', async (req, res, next) => {
  try {
    if (!req.body?.data) return res.status(400).json({ error: 'Datos requeridos para el análisis' })
    const projectType = req.body.project_type || 'obra de construcción'
    const a = analyzeBudget(req.body.data)
    const reference = await loadPriceReference(req.user.organization_id)
    const c = comparePrices(a.items_flat, reference)

    const over = c.market_analysis.filter((m) => m.status === 'overpriced').length
    let overall_assessment = c.matched_count === 0
      ? 'No hay referencia de precios en tu biblioteca para estas partidas todavía. Guarda partidas con precio para poder comparar.'
      : `${c.matched_count} de ${c.total_count} partidas tienen referencia; ${over} por encima. Margen de negociación estimado: ${c.negotiation_potential} €.`

    // El LLM solo redacta la valoración (con las cifras ya dadas), si hay datos.
    if (c.matched_count > 0) {
      try {
        const top = c.market_analysis.filter((m) => m.status === 'overpriced').slice(0, 6)
          .map((m) => `- ${m.item_name}: ${m.quoted_price} € vs ref ${m.market_price_avg} € (+${m.diff_pct}%)`).join('\n') || '- (ninguna por encima)'
        const prompt = `Valora en 2-3 frases (español) este presupuesto frente a los precios de referencia.
NO inventes cifras: usa solo estos datos.
Partidas con referencia: ${c.matched_count}/${c.total_count} · por encima: ${over} · margen negociación: ${c.negotiation_potential} €
Más caras que la referencia:
${top}
Responde SOLO con este JSON: {"valoracion": "tu valoración aquí"}`
        const r = await callAI(prompt, { maxTokens: 400, temperature: 0.2 })
        const text = (r?.valoracion || r?.raw_response || '').toString().trim()
        if (text && text.length >= 20) overall_assessment = text
      } catch (err) {
        console.warn('[compare-prices] LLM falló, valoración de reserva:', err.message)
      }
    }

    res.json({
      project_type: projectType,
      market_analysis: c.market_analysis,
      overall_assessment,
      negotiation_potential: c.negotiation_potential,
      indice_competitividad: c.indice_competitividad,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/ai/estimate-contingency — Estimación de imprevistos.
// % por reglas (complejidad + incertidumbre detectada por el motor); el LLM SOLO
// redacta la justificación.
router.post('/estimate-contingency', async (req, res, next) => {
  try {
    if (!req.body?.data) return res.status(400).json({ error: 'Datos requeridos para el análisis' })
    const a = analyzeBudget(req.body.data)
    const c = estimateContingency(a, req.body.project_complexity || 'media')

    let justification = `Contingencia del ${c.recommended_contingency_pct}% sobre ${a.budget_total} €. ${c.risk_factors.join('. ')}.`
    try {
      const r = await callAI(buildContingencyPrompt(a, c), { maxTokens: 400, temperature: 0.2 })
      const text = (r?.justificacion || r?.justification || r?.raw_response || '').toString().trim()
      if (text && text.length >= 20) justification = text
    } catch (err) {
      console.warn('[estimate-contingency] LLM falló, justificación de reserva:', err.message)
    }

    res.json({ ...c, justification })
  } catch (err) {
    next(err)
  }
})

// ================================================================
//  MATERIALES — análisis con catálogo
// ================================================================

// POST /api/ai/analyze-materials — Análisis del catálogo de materiales.
// TOOL: cons_materials + cons_supplier_materials (precios por proveedor). 100%
// determinista: duplicados a agrupar, materiales donde pagas más que el proveedor
// más barato, y optimización por proveedor.
router.post('/analyze-materials', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id

    const { data: materials, error: matErr } = await supabase
      .from('cons_materials')
      .select('id, code, name, unit, unit_price, material_group_id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
    if (matErr) throw matErr

    const ids = (materials || []).map((m) => m.id)
    let supplierLinks = []
    if (ids.length) {
      const { data, error } = await supabase
        .from('cons_supplier_materials')
        .select('material_id, supplier_id, unit_price')
        .in('material_id', ids)
      if (error) throw error
      supplierLinks = data || []
    }

    const { data: suppliers } = await supabase
      .from('cons_suppliers')
      .select('id, name')
      .eq('organization_id', orgId)

    const { analyzeMaterials } = await import('../services/materials-analytics.js')
    res.json(analyzeMaterials(materials || [], supplierLinks, suppliers || []))
  } catch (err) {
    next(err)
  }
})

// ================================================================
//  CERTIFICACIONES — análisis de progreso y facturación
// ================================================================

// POST /api/ai/analyze-certifications — Avance de obra certificado.
// TOOL: certificaciones del proyecto valoradas (mismo cálculo que el endpoint
// overview). Determinista: avance %, pendiente, ritmo, riesgo. LLM solo el resumen.
router.post('/analyze-certifications', async (req, res, next) => {
  try {
    const projectId = req.body?.project_id
    if (!projectId) return res.status(400).json({ error: 'Se requiere project_id' })

    // A4: mismo agujero que analyze-expenses — validar acceso antes de leer las
    // certificaciones/presupuestos del proyecto.
    const access = await resolveProjectAccess(req.user.id, req.user.organization_id, projectId)
    if (!access) return res.status(403).json({ error: 'No tienes acceso a este proyecto' })

    const { data: budgets } = await supabase
      .from('cons_budgets').select('id').eq('project_id', projectId)
    const budgetIds = (budgets || []).map((b) => b.id)

    const { analyzeCertifications, buildOverview, buildCertificationsPrompt, fallbackCertificationsSummary } =
      await import('../services/certification-analytics.js')

    let overview = []
    if (budgetIds.length) {
      const { data: certs } = await supabase
        .from('cons_certifications').select('id, budget_id, number, name, status').in('budget_id', budgetIds)
      const certIds = (certs || []).map((c) => c.id)

      let items = []
      if (certIds.length) {
        const { data } = await supabase
          .from('cons_certification_items').select('certification_id, budget_item_id, certified_quantity').in('certification_id', certIds)
        items = data || []
      }
      // Precios de las partidas certificadas.
      const itemIds = [...new Set(items.map((i) => i.budget_item_id))]
      const priceMap = {}
      if (itemIds.length) {
        const { data: prices } = await supabase
          .from('cons_budget_items').select('id, unit_price').in('id', itemIds)
        for (const p of (prices || [])) priceMap[p.id] = Number(p.unit_price) || 0
      }
      // Total presupuestado por presupuesto (capítulos + partidas activas).
      const budgetTotals = {}
      for (const bId of budgetIds) {
        const { data: chs } = await supabase
          .from('cons_chapters').select('id').eq('budget_id', bId).eq('is_active', true)
        const chIds = (chs || []).map((c) => c.id)
        let total = 0
        if (chIds.length) {
          const { data: bis } = await supabase
            .from('cons_budget_items').select('quantity, unit_price').in('chapter_id', chIds).eq('is_active', true)
          total = (bis || []).reduce((s, x) => s + Number(x.quantity) * Number(x.unit_price), 0)
        }
        budgetTotals[bId] = total
      }
      overview = buildOverview(certs || [], items, priceMap, budgetTotals)
    }

    const a = analyzeCertifications(overview)
    let summary = fallbackCertificationsSummary(a)
    if (overview.length) {
      try {
        const r = await callAI(buildCertificationsPrompt(a), { maxTokens: 400, temperature: 0.2 })
        if (r?.resumen) summary = String(r.resumen)
      } catch (err) {
        console.warn('[analyze-certifications] LLM falló, resumen de reserva:', err.message)
      }
    }

    res.json({ summary, recommendations: [], ...a })
  } catch (err) {
    next(err)
  }
})

// ================================================================
//  GASTOS — control económico
// ================================================================

// POST /api/ai/analyze-expenses — Gastos reales vs presupuesto.
// TOOL: cons_project_expenses (enlazados a capítulo) + importes presupuestados por
// capítulo. Determinista: desviación por capítulo, total, anomalías. LLM solo prosa.
router.post('/analyze-expenses', async (req, res, next) => {
  try {
    const projectId = req.body?.project_id
    if (!projectId) return res.status(400).json({ error: 'Se requiere project_id' })

    // A4: validar acceso al proyecto ANTES de leer sus gastos/presupuesto. Sin
    // esto se filtraba analítica de gastos de proyectos de OTRAS organizaciones.
    const access = await resolveProjectAccess(req.user.id, req.user.organization_id, projectId)
    if (!access) return res.status(403).json({ error: 'No tienes acceso a este proyecto' })

    // Gastos del proyecto.
    const { data: expenses, error: expErr } = await supabase
      .from('cons_project_expenses')
      .select('budget_chapter_id, amount, concept, supplier_name')
      .eq('project_id', projectId)
    if (expErr) throw expErr

    // Presupuesto del proyecto (aprobado si hay, si no el primero) → capítulos activos + importe.
    const { data: budgets } = await supabase
      .from('cons_budgets').select('id, status').eq('project_id', projectId)
    const budget = (budgets || []).find((b) => b.status === 'approved') || (budgets || [])[0]
    let chapters = []
    if (budget) {
      const { data: chs } = await supabase
        .from('cons_chapters').select('id, code, name').eq('budget_id', budget.id).eq('is_active', true)
      const chIds = (chs || []).map((c) => c.id)
      let items = []
      if (chIds.length) {
        const { data } = await supabase
          .from('cons_budget_items').select('chapter_id, quantity, unit_price').in('chapter_id', chIds).eq('is_active', true)
        items = data || []
      }
      const budgetedByCh = {}
      for (const it of items) budgetedByCh[it.chapter_id] = (budgetedByCh[it.chapter_id] || 0) + Number(it.quantity) * Number(it.unit_price)
      chapters = (chs || []).map((c) => ({ id: c.id, code: c.code, name: c.name, budgeted: budgetedByCh[c.id] || 0 }))
    }

    const { analyzeExpenses, buildExpensesPrompt, fallbackExpensesSummary } = await import('../services/expense-analytics.js')
    const a = analyzeExpenses(expenses || [], chapters)

    let summary = fallbackExpensesSummary(a)
    let trend_analysis = ''
    try {
      const r = await callAI(buildExpensesPrompt(a), { maxTokens: 500, temperature: 0.2 })
      if (r?.resumen) summary = String(r.resumen)
      if (r?.tendencia) trend_analysis = String(r.tendencia)
    } catch (err) {
      console.warn('[analyze-expenses] LLM falló, resumen de reserva:', err.message)
    }

    res.json({ summary, trend_analysis, optimization_opportunities: [], ...a })
  } catch (err) {
    next(err)
  }
})

// ================================================================
//  SIMILITUD DE PARTIDAS
// ================================================================

// POST /api/ai/find-similar — Partidas parecidas en la biblioteca (lookup determinista).
// TOOL: biblioteca del org. Empareja por nombre (Jaccard) + misma unidad. Base del
// autoaprendizaje (AI-4): al crear una partida se ofrecen las guardadas para reutilizar.
router.post('/find-similar', async (req, res, next) => {
  try {
    const raw = req.body?.partida ?? req.body?.data
    const query = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return { name: raw } } })() : raw
    if (!query?.name) return res.status(400).json({ error: 'Se requiere la partida (name, unit)' })

    const { data, error } = await supabase
      .from('cons_saved_partidas')
      .select('id, code, name, unit, unit_price, usage_count')
      .eq('organization_id', req.user.organization_id)
    if (error) throw error

    res.json(findSimilar(query, data || []))
  } catch (err) {
    next(err)
  }
})

// ================================================================
//  EXTRACCIÓN DE MATERIALES — desde texto de archivo (Excel/PDF)
// ================================================================

// POST /api/ai/extract-materials — Extrae materiales y precios de texto de lista de proveedor.
// Capa 1 (código): pre-limpieza + normalización de números + validación.
// Capa 2 (LLM local): solo convierte el texto borroso en JSON.
router.post('/extract-materials', async (req, res, next) => {
  try {
    const { text, filename } = req.body
    if (!text) return res.status(400).json({ error: 'Texto requerido para la extracción' })

    // AI-4: few-shot con las correcciones previas del usuario para esta skill.
    const fewShot = await fewShotFor(req.user.organization_id, 'extract-materials')

    const materials = await extractMaterials(text, {
      filename,
      callAI,
      fewShot,
      aiContext: {
        organizationId: req.user.organization_id,
        userId: req.user.id,
        operation: 'extract-materials',
      },
    })
    res.json(materials)
  } catch (err) {
    next(err)
  }
})

// ================================================================
//  AUTOAPRENDIZAJE (AI-4) — correcciones del usuario → few-shot
// ================================================================

// POST /api/ai/corrections — registra una corrección del usuario.
// body: { skill, context?, wrong?, corrected }. `corrected` = lo que quedó bien.
router.post('/corrections', async (req, res, next) => {
  try {
    const { skill, context, wrong, corrected } = req.body || {}
    if (!skill || !CORRECTION_SKILLS.has(skill)) {
      return res.status(400).json({ error: 'skill no válida' })
    }
    if (corrected == null) return res.status(400).json({ error: 'Falta el dato corregido' })

    const saved = await recordCorrection({
      orgId: req.user.organization_id, skill, context, wrong, corrected,
    })
    res.status(201).json(saved)
  } catch (err) {
    next(err)
  }
})

// GET /api/ai/corrections?skill=extract-materials — últimas correcciones (debug/UI).
router.get('/corrections', async (req, res, next) => {
  try {
    const skill = req.query.skill
    if (!skill || !CORRECTION_SKILLS.has(skill)) {
      return res.status(400).json({ error: 'skill no válida' })
    }
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    res.json(await getRecentCorrections(req.user.organization_id, skill, limit))
  } catch (err) {
    next(err)
  }
})

// ================================================================
//  IMPORTACIÓN DE PRESUPUESTO PDF — Parser híbrido
// ================================================================

// POST /api/ai/parse-budget-pdf — Parse budget structure from PDF
// Modo dual: 1) texto de pdfjs-dist + parser algorítmico + LLM local;
//            2) fallback OCR LOCAL (tesseract/poppler) si el PDF es escaneado.
router.post('/parse-budget-pdf', async (req, res, next) => {
  try {
    const { text, pdfBase64 } = req.body
    if (!text && !pdfBase64) return res.status(400).json({ error: 'No text or PDF provided' })

    const { parseBudgetFromText, parseBudgetWithVision } = await import('../services/budget-parser.js')

    let result

    // 1) Método texto (rápido): pdfjs (frontend) + parser algorítmico + LLM local.
    //    Es lo normal para PDFs digitales; el OCR (lento en CPU) solo si esto no da nada.
    if (text) {
      const r = await parseBudgetFromText(text, true, req.user.organization_id, req.user.id)
      if (r.logs?.length) console.log(`[parse-budget-pdf] ${r.logs[r.logs.length - 1]}`)
      if (r.chapters?.length > 0) result = r
    }

    // 2) Fallback: OCR LOCAL (PDF escaneado sin capa de texto).
    if (!result && pdfBase64) {
      try {
        const ocrResult = await parseBudgetWithVision(pdfBase64, req.user.organization_id, req.user.id)
        if (ocrResult?.chapters?.length > 0) {
          result = ocrResult
          console.log(`[parse-budget-pdf] OCR local: ${result.chapters.length} capitulos, ${result.chapters.reduce((s, c) => s + c.items.length, 0)} partidas`)
        } else if (ocrResult) {
          result = ocrResult   // devolver logs aunque no haya capítulos
        }
      } catch (err) {
        console.log(`[parse-budget-pdf] OCR local fallo: ${err.message}`)
      }
    }

    if (!result) {
      result = { chapters: [], logs: ['No se pudo extraer informacion del PDF'] }
    }

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ================================================================
//  IMPORTACIÓN DE PRESUPUESTO BC3 / PZH — Parsers nativos
// ================================================================

// POST /api/ai/parse-budget-file — Parse BC3 or PZH binary file
router.post('/parse-budget-file', async (req, res, next) => {
  try {
    const { fileData, fileType } = req.body
    if (!fileData) return res.status(400).json({ error: 'No file data provided' })

    const buffer = Buffer.from(fileData, 'base64')

    let result
    if (fileType === 'bc3') {
      const { parseBC3 } = await import('../services/bc3-parser.js')
      result = parseBC3(buffer)
    } else if (fileType === 'pzh') {
      const { parsePZH } = await import('../services/pzh-parser.js')
      result = parsePZH(buffer)
    } else {
      return res.status(400).json({ error: `Tipo de archivo no soportado: ${fileType}` })
    }

    console.log(`[parse-budget-file] ${fileType.toUpperCase()}: ${result.chapters.length} capítulos, ${result.chapters.reduce((s, c) => s + c.items.length, 0)} partidas`)
    res.json(result)
  } catch (err) {
    console.error(`[parse-budget-file] Error:`, err)
    next(err)
  }
})

export default router
