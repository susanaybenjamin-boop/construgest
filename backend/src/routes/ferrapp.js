import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'
import { callAI } from '../services/ai-service.js'

const router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/ferrapp/proyectos - List ferrapp projects for user's org
router.get('/proyectos', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id

    const { data, error } = await supabase
      .from('ferrapp_proyectos')
      .select('id, nombre, fecha_modificacion, data')
      .eq('organization_id', orgId)
      .eq('deleted', false)
      .order('fecha_modificacion', { ascending: false })

    if (error) throw error
    res.json(data || [])
  } catch (err) {
    next(err)
  }
})

// GET /api/ferrapp/proyectos/:id - Get single project
router.get('/proyectos/:id', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id

    const { data, error } = await supabase
      .from('ferrapp_proyectos')
      .select('*')
      .eq('id', req.params.id)
      .eq('organization_id', orgId)
      .eq('deleted', false)
      .single()

    if (error || !data) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/ferrapp/proyectos - Create project
router.post('/proyectos', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const userId = req.user.id
    const { id, nombre, data } = req.body

    const { data: created, error } = await supabase
      .from('ferrapp_proyectos')
      .upsert({
        id,
        nombre,
        data,
        organization_id: orgId,
        created_by: userId,
        fecha_modificacion: new Date().toISOString(),
        deleted: false,
      }, { onConflict: 'id' })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

// PUT /api/ferrapp/proyectos/:id - Update project
router.put('/proyectos/:id', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { nombre, data } = req.body

    const { data: updated, error } = await supabase
      .from('ferrapp_proyectos')
      .update({
        nombre,
        data,
        fecha_modificacion: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('organization_id', orgId)
      .select()
      .single()

    if (error) throw error
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/ferrapp/proyectos/:id - Soft delete
router.delete('/proyectos/:id', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id

    const { error } = await supabase
      .from('ferrapp_proyectos')
      .update({ deleted: true, fecha_modificacion: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('organization_id', orgId)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// GET /api/ferrapp/etiquetas - Get custom labels for org
router.get('/etiquetas', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id

    const { data, error } = await supabase
      .from('ferrapp_etiquetas_custom')
      .select('categoria, etiqueta')
      .eq('organization_id', orgId)

    if (error) throw error

    // Convert to Record<string, string[]>
    const result = {}
    for (const row of (data || [])) {
      if (!result[row.categoria]) result[row.categoria] = []
      result[row.categoria].push(row.etiqueta)
    }
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// POST /api/ferrapp/etiquetas - Add custom label
router.post('/etiquetas', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { categoria, etiqueta } = req.body

    const { error } = await supabase
      .from('ferrapp_etiquetas_custom')
      .upsert({
        organization_id: orgId,
        categoria,
        etiqueta,
      }, { onConflict: 'organization_id,categoria,etiqueta', ignoreDuplicates: true })

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/ferrapp/importar-plano — Extract polygon from floor plan via Claude Vision
const PLANO_PROMPT = `Eres un sistema experto en lectura de planos de construcción.

TAREA: Extraer el CONTORNO EXTERIOR del edificio como un polígono cerrado.

MÉTODO PASO A PASO:
1. Mira la imagen y localiza el contorno exterior (la línea perimetral del edificio)
2. Identifica CADA ESQUINA (vértice) donde el contorno cambia de dirección
3. Empezando por la esquina superior-izquierda, recorre el contorno en sentido HORARIO
4. En cada esquina, anota si el segmento siguiente va hacia la DERECHA (+X), IZQUIERDA (-X), ARRIBA (+Y) o ABAJO (-Y)
5. Lee la COTA (medida en metros) de cada segmento del plano
6. Calcula las coordenadas x,y acumulando las distancias desde el punto de inicio

SISTEMA DE COORDENADAS:
- Origen (0,0) = esquina inferior-izquierda del polígono
- X crece hacia la derecha
- Y crece hacia arriba
- Unidades: METROS con 4 decimales (tal como aparecen en las cotas)

CÓMO CALCULAR COORDENADAS:
- Empieza en un vértice conocido
- Si el siguiente segmento va a la DERECHA: suma la cota a X, Y no cambia
- Si va ABAJO: resta la cota a Y, X no cambia
- Si va a la IZQUIERDA: resta la cota a X, Y no cambia
- Si va ARRIBA: suma la cota a Y, X no cambia
- Si va en DIAGONAL: descompón en componentes X e Y

IMPORTANTE:
- Incluye TODOS los vértices, incluyendo escalones, retranqueos y entrantes
- Un "escalón" en el contorno genera 2 vértices extra (no lo simplifiques)
- Lee las cotas EXACTAS del plano (no redondees ni inventes)
- Si un segmento es diagonal/curvo, aproxímalo con segmentos rectos
- Si no puedes leer una cota, marca confidence "estimated"
- VERIFICA: el último vértice debe conectar con el primero cerrando el polígono

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "vertices": [
    { "label": "P1", "x": 0.0000, "y": 13.9566 },
    { "label": "P2", "x": 11.8998, "y": 13.9566 }
  ],
  "lados": [
    { "from": "P1", "to": "P2", "length": 11.8998, "direction": "derecha", "confidence": "measured" }
  ],
  "notes": "Descripción breve de la forma detectada"
}`

router.post('/importar-plano', async (req, res, next) => {
  try {
    const { fileBase64, mimeType } = req.body
    if (!fileBase64) return res.status(400).json({ error: 'Archivo requerido' })

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({ error: 'Tipo no soportado. Usa PDF, PNG, JPG o WebP' })
    }

    const result = await callAI(
      {
        text: PLANO_PROMPT,
        images: [{ mimeType, data: fileBase64 }],
      },
      {
        organizationId: req.user.organization_id,
        userId: req.user.id,
        providerOrder: ['anthropic'],
        maxTokens: 4096,
        operation: 'ferrapp-importar-plano',
      }
    )

    // Validate response structure
    if (!result.vertices || !Array.isArray(result.vertices) || result.vertices.length < 3) {
      return res.status(422).json({ error: 'No se pudo extraer un polígono válido del plano', raw: result })
    }

    // Normalize: shift so min x,y = 0
    const xs = result.vertices.map(v => v.x)
    const ys = result.vertices.map(v => v.y)
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const vertices = result.vertices.map(v => ({
      label: v.label || '',
      x: +(v.x - minX).toFixed(2),
      y: +(v.y - minY).toFixed(2),
    }))

    // Build lados with confidence
    const lados = vertices.map((v, i) => {
      const next = vertices[(i + 1) % vertices.length]
      const dist = +Math.sqrt((next.x - v.x) ** 2 + (next.y - v.y) ** 2).toFixed(2)
      const aiLado = (result.lados || []).find(l => l.from === v.label && l.to === next.label)
      return {
        from: v.label,
        to: next.label,
        length: aiLado?.length || dist,
        calculated: dist,
        confidence: aiLado?.confidence || 'estimated',
      }
    })

    res.json({ vertices, lados, notes: result.notes || '' })
  } catch (err) {
    next(err)
  }
})

export default router
