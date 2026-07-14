import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import { callAI } from '../services/ai-service.js'
import { extractMaterials } from '../services/extraction.js'
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

/** Truncate data string to avoid exceeding model context window */
function truncateData(data, maxChars = 10000) {
  const str = (typeof data === 'string' ? data : JSON.stringify(data)) ?? ''
  if (str.length <= maxChars) return str
  console.warn(`[AI] Datos truncados de ${str.length} a ${maxChars} chars`)
  return str.substring(0, maxChars) + '...(datos truncados)'
}

/** Generic AI analysis handler — supports single or multi-field data */
async function handleAIAnalysis(req, res, next, buildPrompt, aiOptions = {}) {
  try {
    const body = req.body
    // Support both { data: ... } and custom fields
    if (!body || (Object.keys(body).length === 0)) {
      return res.status(400).json({ error: 'Datos requeridos para el análisis' })
    }

    const prompt = typeof buildPrompt === 'string'
      ? `${buildPrompt}\n\nDATOS:\n${truncateData(body.data)}`
      : buildPrompt(body)

    const result = await callAI(prompt, { organizationId: req.user.organization_id, userId: req.user.id, ...aiOptions })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

// ================================================================
//  PRESUPUESTOS — 8 skills
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

// POST /api/ai/suggest-optimizations — Optimizaciones de costes
router.post('/suggest-optimizations', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const data = truncateData(body.data, 10000)
    return `Eres experto en optimización de costes de construcción. Analiza precios y sugiere optimizaciones.

Responde SOLO con un array JSON:
[
  {"item_code": "01.01", "item_name": "Nombre partida", "current_price": 100, "suggested_price": 85, "savings": 15, "reason": "Precio negociable con proveedores locales", "confidence": 0.8}
]

Si no hay optimizaciones posibles, responde: []

PRESUPUESTO:
${data}`
  })
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

// POST /api/ai/estimate-timeline — Estimación de cronograma
router.post('/estimate-timeline', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const data = truncateData(body.data, 8000)
    return `Eres un planificador de obras experto. Estima un cronograma para este presupuesto.

Responde SOLO con JSON válido:
{
  "total_duration_weeks": 20,
  "phases": [
    {"phase": "Preparación", "duration_weeks": 2, "tasks": ["Excavación", "Desbroce"], "is_critical": true}
  ],
  "critical_path": ["Cimentación", "Estructura", "Cubierta"],
  "recommendations": "Recomendaciones sobre el cronograma"
}

PRESUPUESTO:
${data}`
  })
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

// POST /api/ai/compare-prices — Comparación con precios de mercado
router.post('/compare-prices', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const data = truncateData(body.data, 8000)
    const projectType = body.project_type || 'obra de construcción'
    return `Compara este presupuesto de construcción con precios de mercado para: ${projectType}.

Responde SOLO con JSON válido:
{
  "project_type": "${projectType}",
  "market_analysis": [
    {"item_code": "01.01", "item_name": "Nombre", "market_price_avg": 100, "quoted_price": 95, "status": "within_range", "opportunity": "Sin acción necesaria"}
  ],
  "overall_assessment": "Valoración general del presupuesto vs mercado",
  "negotiation_potential": 5000,
  "indice_competitividad": 85
}

status puede ser: "within_range", "overpriced", "underpriced"

PRESUPUESTO:
${data}`
  })
})

// POST /api/ai/validate-specifications — Validar especificaciones técnicas
router.post('/validate-specifications', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const data = truncateData(body.data, 8000)
    return `Valida estas especificaciones técnicas de obra.

Verifica: completitud, compatibilidad de materiales, cumplimiento normativo, viabilidad técnica.

Responde SOLO con JSON válido:
{
  "is_complete": true,
  "issues": [
    {"spec_id": "s1", "severity": "warning", "issue": "Problema detectado", "solution": "Cómo solucionarlo"}
  ],
  "compliance_score": 85,
  "recommendations": ["Recomendación"]
}

ESPECIFICACIONES:
${data}`
  })
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

// POST /api/ai/analyze-materials — Análisis de materiales con catálogo
router.post('/analyze-materials', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const materialsData = truncateData(body.data, 8000)
    const catalogData = body.catalog ? truncateData(body.catalog, 4000) : '(Sin catálogo de referencia disponible)'

    const catalogSection = body.catalog
      ? `CATÁLOGO DE REFERENCIA (código|nombre|categoría|ud|coste|venta):\n${catalogData}`
      : catalogData

    return `Eres un experto en materiales de construcción. Analiza estos materiales comparándolos con el catálogo.

${catalogSection}

Responde SOLO con JSON válido:
{
  "total_items": 10,
  "potential_savings": 5000.0,
  "total_value": 50000.0,
  "duplicates": [
    {"id_1": "M1", "id_2": "M2", "name_1": "Nombre1", "name_2": "Nombre2", "similarity_score": 90.0, "reason": "Mismo material", "suggested_action": "Fusionar", "cost_impact": 500.0}
  ],
  "unused_materials": [],
  "supplier_optimization": ["Consejo de optimización"],
  "inventory_insights": ["Observación del inventario"],
  "price_alerts": [
    {"material_name": "Material", "user_price": 120.0, "catalog_price": 85.0, "difference_percent": 41.0, "recommendation": "Negociar precio"}
  ],
  "catalog_alternatives": [
    {"current_material": "Material actual", "alternative_code": "ALT1", "alternative_name": "Alternativa", "alternative_price": 80.0, "savings_estimate": 500.0, "reason": "Más económico"}
  ],
  "missing_from_catalog": []
}

Usa arrays vacíos [] si no hay datos para un campo.

MATERIALES DEL USUARIO:
${materialsData}`
  })
})

// POST /api/ai/analyze-plans — Análisis de planos (Texto)
router.post('/analyze-plans', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const data = truncateData(body.data, 8000)
    return `Eres un especialista en revisión de planos de construcción. Analiza esta información.

Responde SOLO con JSON válido:
{
  "summary": "Resumen del análisis de los planos",
  "scale_detected": "1:100",
  "measurements_found": 42,
  "confidence_score": 80.0,
  "potential_issues": [
    "Problema o inconsistencia encontrada"
  ],
  "recommendations": [
    "Recomendación para mejorar"
  ]
}

INFORMACIÓN DE PLANOS:
${data}`
  })
})

// ================================================================
//  CRONOGRAMA — análisis avanzado de planificación
// ================================================================

// POST /api/ai/analyze-schedule — Análisis de cronograma
router.post('/analyze-schedule', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const data = truncateData(body.data, 8000)
    return `Eres un especialista en planificación de obras. Analiza este cronograma.

Responde SOLO con JSON válido:
{
  "total_duration_weeks": 24,
  "feasibility_score": 75.0,
  "critical_path": ["Cimentación", "Estructura", "Cubierta"],
  "bottlenecks": ["Cuello de botella identificado"],
  "resource_conflicts": ["Conflicto de recursos"],
  "optimization_recommendations": ["Recomendación de optimización"],
  "risk_factors": ["Factor de riesgo"]
}

Usa arrays vacíos [] si no hay datos para un campo.

CRONOGRAMA:
${data}`
  })
})

// ================================================================
//  ANOTACIONES — análisis de observaciones de obra
// ================================================================

// POST /api/ai/analyze-annotations — Análisis de anotaciones
router.post('/analyze-annotations', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const data = truncateData(body.data, 8000)
    return `Eres un especialista en gestión de anotaciones y observaciones de obra. Agrupa y analiza.

Responde SOLO con JSON válido:
{
  "total_annotations": 28,
  "by_type": {"error": 5, "comentario": 12, "mejora": 8, "duda": 3},
  "grouped_issues": ["Grupo de problemas relacionados (N anotaciones)"],
  "priority_issues": ["Problema prioritario (severidad)"],
  "related_annotations": [[0, 5, 8], [2, 7]],
  "resolution_suggestions": ["Sugerencia de resolución ordenada por prioridad"]
}

ANOTACIONES:
${data}`
  })
})

// ================================================================
//  CERTIFICACIONES — análisis de progreso y facturación
// ================================================================

// POST /api/ai/analyze-certifications — Análisis de certificaciones
router.post('/analyze-certifications', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const data = truncateData(body.data, 8000)
    return `Eres un especialista en certificaciones y facturación de obras. Analiza el progreso.

Responde SOLO con JSON válido:
{
  "summary": "Resumen del estado de certificaciones",
  "total_progress": 65.5,
  "completed_units": 150,
  "pending_units": 80,
  "completion_estimate": "Estimado completar en 3 meses",
  "critical_path": ["Estructura", "Acabados"],
  "recommendations": ["Recomendación para acelerar certificación"],
  "risk_assessment": "Valoración general de riesgos del avance"
}

CERTIFICACIONES:
${data}`
  })
})

// ================================================================
//  GASTOS — control económico
// ================================================================

// POST /api/ai/analyze-expenses — Análisis de gastos vs presupuesto
router.post('/analyze-expenses', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const expensesData = truncateData(body.data || body.expenses, 6000)
    const budgetData = body.budget ? truncateData(body.budget, 6000) : ''

    const budgetSection = budgetData ? `\n\nPRESUPUESTO:\n${budgetData}` : ''

    return `Eres un especialista en control de costos de obras. Compara gastos vs presupuesto.

Responde SOLO con JSON válido:
{
  "summary": "Resumen del control de gastos",
  "total_spent": 150000.0,
  "budget_total": 200000.0,
  "variance_percentage": -25.0,
  "budget_variance": -50000.0,
  "anomalies_found": 3,
  "risk_level": "medium",
  "expense_anomalies": ["Anomalía: gasto X supera presupuesto en Y%"],
  "optimization_opportunities": ["Oportunidad de ahorro identificada"],
  "trend_analysis": "Análisis de la tendencia de gasto"
}

risk_level puede ser: "low", "medium", "high"
variance_percentage y budget_variance negativos = por debajo del presupuesto (bien)
variance_percentage y budget_variance positivos = por encima del presupuesto (mal)

GASTOS:
${expensesData}${budgetSection}`
  })
})

// ================================================================
//  DETECCIÓN DE ERRORES — debugging
// ================================================================

// POST /api/ai/detect-errors — Análisis de logs de error
router.post('/detect-errors', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const logsData = truncateData(body.data || body.logs, 6000)
    const contextData = body.context ? truncateData(body.context, 2000) : ''

    const contextSection = contextData ? `\nCONTEXTO:\n${contextData}\n` : ''

    return `Eres un ingeniero experto en debugging. Analiza estos logs de error.

Responde SOLO con un array JSON de errores encontrados:
[
  {
    "error_type": "tipo de error",
    "severity": "high",
    "description": "Descripción del error",
    "affected_area": "Área afectada",
    "root_cause": "Causa raíz probable",
    "suggested_fix": "Cómo solucionarlo",
    "fix_code_snippet": "Código o comando sugerido"
  }
]

severity puede ser: "critical", "high", "medium", "low"
Si no hay errores, responde: []
${contextSection}
LOGS:
${logsData}`
  })
})

// ================================================================
//  SIMILITUD DE PARTIDAS
// ================================================================

// POST /api/ai/find-similar — Encontrar partidas similares en biblioteca
router.post('/find-similar', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const partidaData = truncateData(body.data || body.partida)
    const libraryData = body.library ? truncateData(body.library, 8000) : '[]'

    return `Compara esta partida de construcción con las de la biblioteca. Encuentra similares (>60%).

Criterios: nombre similar, misma unidad, precio comparable (±30%), alcance parecido.

Responde SOLO con un array JSON:
[
  {"saved_partida_id": "5", "saved_name": "Nombre partida", "similarity_score": 87.5, "reason": "Mismo concepto, precio similar"}
]

Si no hay similitudes >60%, responde: []

PARTIDA NUEVA:
${partidaData}

BIBLIOTECA:
${libraryData}`
  })
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

    const materials = await extractMaterials(text, {
      filename,
      callAI,
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
//  IMPORTACIÓN DE PRESUPUESTO PDF — Parser híbrido
// ================================================================

// POST /api/ai/parse-budget-pdf — Parse budget structure from PDF
// Modo dual: si hay pdfBase64 y el usuario tiene IA activa -> Gemini Vision OCR
//             si no -> texto de pdfjs-dist + parser algoritmico + fallback IA
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
