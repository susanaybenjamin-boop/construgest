import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import { callAI } from '../services/ai-service.js'
import { extractMaterials } from '../services/extraction.js'

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

// POST /api/ai/analyze-budget — Análisis comprehensivo de presupuesto
router.post('/analyze-budget', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const data = truncateData(body.data, 10000)
    return `Eres un experto en presupuestos de construcción. Analiza este presupuesto.

Responde SOLO con JSON válido en este formato exacto:
{
  "summary": "Resumen ejecutivo del presupuesto en 2-3 frases",
  "total_cost": 0.0,
  "estimated_savings": 0.0,
  "confidence_score": 80.0,
  "risk_level": "medium",
  "suggestions": [
    {"id": "s1", "title": "Título", "description": "Detalle de la sugerencia", "impact": "high", "savings": 0.0, "implementation": "Cómo implementar", "risk": "low"}
  ],
  "warnings": [
    {"id": "w1", "severity": "warning", "message": "Problema detectado", "affected_items": ["01.01"], "recommendation": "Solución propuesta"}
  ],
  "optimizations": [
    {"item_code": "01.01", "item_name": "Nombre", "current_price": 100, "suggested_price": 85, "savings": 15, "reason": "Motivo", "confidence": 0.8}
  ]
}

PRESUPUESTO:
${data}`
  })
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

// POST /api/ai/detect-issues — Detección de problemas e inconsistencias
router.post('/detect-issues', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const data = truncateData(body.data, 10000)
    return `Eres un auditor experto en construcción. Detecta problemas en este presupuesto.

Busca: duplicados, partidas faltantes, precios anómalos, inconsistencias, especificaciones vagas.

Responde SOLO con un array JSON:
[
  {"id": "w1", "severity": "critical", "message": "Descripción del problema", "affected_items": ["01.01"], "recommendation": "Cómo solucionarlo"}
]

severity puede ser: "critical", "warning", "info"
Si no hay problemas, responde: []

PRESUPUESTO:
${data}`
  })
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

// POST /api/ai/executive-report — Informe ejecutivo profesional
router.post('/executive-report', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const data = truncateData(body.data, 8000)
    return `Eres un consultor senior de construcción. Genera un informe ejecutivo profesional.

Incluye estas secciones:
1. RESUMEN EJECUTIVO (1 párrafo)
2. DESGLOSE DE COSTOS (por capítulo)
3. RIESGOS IDENTIFICADOS
4. OPORTUNIDADES DE AHORRO
5. RECOMENDACIONES

Responde SOLO con JSON válido:
{
  "titulo": "Informe Ejecutivo - [Nombre proyecto]",
  "resumen_ejecutivo": "Párrafo con el resumen ejecutivo completo",
  "desglose_costos": [{"capitulo": "01", "nombre": "Nombre", "importe": 0, "porcentaje": 0}],
  "riesgos": [{"descripcion": "Riesgo", "probabilidad": "alta|media|baja", "impacto": "alto|medio|bajo"}],
  "oportunidades_ahorro": [{"descripcion": "Oportunidad", "ahorro_estimado": 0}],
  "metricas_clave": [{"nombre": "Coste por m²", "valor": "850 €/m²"}],
  "conclusiones": ["Conclusión"],
  "proximos_pasos": ["Siguiente paso"]
}

PRESUPUESTO:
${data}`
  })
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

// POST /api/ai/estimate-contingency — Estimación de imprevistos
router.post('/estimate-contingency', (req, res, next) => {
  handleAIAnalysis(req, res, next, (body) => {
    const data = truncateData(body.data, 8000)
    const complexity = body.project_complexity || 'media'
    return `Estima un porcentaje de imprevistos para este presupuesto de obra.
Complejidad del proyecto: ${complexity}.

Responde SOLO con JSON válido:
{
  "recommended_contingency_pct": 15,
  "contingency_amount": 12345,
  "risk_factors": ["Factor de riesgo 1", "Factor 2"],
  "contingency_breakdown": {"materials": 5, "labor": 3, "unforeseen": 7},
  "justification": "Explicación detallada del porcentaje recomendado"
}

PRESUPUESTO:
${data}`
  })
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
//  CHAT LIBRE — Asistente general de construcción
// ================================================================

// POST /api/ai/chat — Chat libre con contexto de proyecto
router.post('/chat', async (req, res, next) => {
  try {
    const { message, context } = req.body
    if (!message) return res.status(400).json({ error: 'Mensaje requerido' })

    const contextSection = context ? `\nCONTEXTO DEL PROYECTO:\n${truncateData(context, 4000)}\n` : ''

    const prompt = `Eres un asistente experto en construcción, presupuestos de obra y gestión de proyectos en España.
Responde de forma clara, concisa y profesional en español.
Si te preguntan sobre datos específicos, utiliza el contexto proporcionado.
${contextSection}
PREGUNTA DEL USUARIO:
${message}`

    const result = await callAI(prompt, { organizationId: req.user.organization_id, userId: req.user.id })

    // For chat, return raw text if it's not JSON
    if (typeof result === 'string') {
      res.json({ response: result })
    } else if (result.raw_response) {
      res.json({ response: result.raw_response })
    } else {
      res.json(result)
    }
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

    // Intentar OCR con Vision si hay PDF original
    if (pdfBase64) {
      try {
        const visionResult = await parseBudgetWithVision(pdfBase64, req.user.organization_id, req.user.id)
        if (visionResult && visionResult.chapters && visionResult.chapters.length > 0) {
          result = visionResult
          console.log(`[parse-budget-pdf] Vision OCR: ${result.chapters.length} capitulos, ${result.chapters.reduce((s, c) => s + c.items.length, 0)} partidas`)
        }
      } catch (err) {
        console.log(`[parse-budget-pdf] Vision OCR fallo: ${err.message}, usando metodo texto`)
      }
    }

    // Fallback: metodo texto (pdfjs-dist + algoritmico + IA)
    if (!result && text) {
      result = await parseBudgetFromText(text, true, req.user.organization_id, req.user.id)
      if (result.logs?.length) console.log(`[parse-budget-pdf] ${result.logs[result.logs.length - 1]}`)
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
