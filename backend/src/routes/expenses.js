import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/supabase.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
router.use(authMiddleware)

// GET /api/expenses/project/:projectId
router.get('/project/:projectId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_project_expenses')
      .select('*')
      .eq('project_id', req.params.projectId)
      .order('date', { ascending: false })

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/expenses
router.post('/', upload.single('receipt'), async (req, res, next) => {
  try {
    const { project_id, date, supplier_name, supplier_id, concept, amount, tax_amount, budget_chapter_id, work_log_id, notes } = req.body

    // Validar antes de tocar storage: amount es NOT NULL en BD
    const amountNum = parseFloat(amount)
    if (!Number.isFinite(amountNum)) {
      return res.status(400).json({ error: 'amount_required', message: 'El importe del gasto es obligatorio' })
    }
    if (!project_id || !concept) {
      return res.status(400).json({ error: 'missing_fields', message: 'Faltan campos obligatorios (project_id, concept)' })
    }

    let image_path = null

    // Upload receipt image if provided
    if (req.file) {
      const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg'
      const storedName = `${randomUUID()}.${ext}`
      const storagePath = `receipts/${project_id}/${storedName}`

      const { error: uploadError } = await supabase.storage
        .from('construgest-files')
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        })

      if (uploadError) throw uploadError
      image_path = storagePath
    }

    const { data, error } = await supabase
      .from('cons_project_expenses')
      .insert({
        project_id,
        date,
        supplier_name,
        supplier_id: supplier_id || null,
        concept,
        amount: parseFloat(amount),
        tax_amount: parseFloat(tax_amount || '0'),
        budget_chapter_id: budget_chapter_id || null,
        work_log_id: work_log_id || null,
        notes,
        image_path,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/expenses/:id
router.put('/:id', upload.single('receipt'), async (req, res, next) => {
  try {
    const body = req.body || {}

    // Partial update: solo tocamos columnas presentes en el body.
    // Antes hacíamos parseFloat(undefined) → NaN → NULL en Postgres,
    // lo que rompía el NOT NULL de "amount" al vincular/desvincular
    // un gasto a un parte (el cliente solo envía work_log_id).
    const updateData = { updated_at: new Date().toISOString() }
    if ('date' in body) updateData.date = body.date
    if ('supplier_name' in body) updateData.supplier_name = body.supplier_name
    if ('supplier_id' in body) updateData.supplier_id = body.supplier_id || null
    if ('concept' in body) updateData.concept = body.concept
    if ('amount' in body) {
      const n = parseFloat(body.amount)
      if (Number.isFinite(n)) updateData.amount = n
    }
    if ('tax_amount' in body) {
      const n = parseFloat(body.tax_amount || '0')
      if (Number.isFinite(n)) updateData.tax_amount = n
    }
    if ('budget_chapter_id' in body) updateData.budget_chapter_id = body.budget_chapter_id || null
    if ('work_log_id' in body) updateData.work_log_id = body.work_log_id || null
    if ('notes' in body) updateData.notes = body.notes

    // Upload new receipt image if provided
    if (req.file) {
      // Get project_id from existing expense
      const { data: existing } = await supabase
        .from('cons_project_expenses')
        .select('project_id, image_path')
        .eq('id', req.params.id)
        .single()

      // Delete old receipt if exists
      if (existing?.image_path) {
        await supabase.storage.from('construgest-files').remove([existing.image_path])
      }

      const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg'
      const storedName = `${randomUUID()}.${ext}`
      const storagePath = `receipts/${existing?.project_id || 'unknown'}/${storedName}`

      const { error: uploadError } = await supabase.storage
        .from('construgest-files')
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        })

      if (uploadError) throw uploadError
      updateData.image_path = storagePath
    }

    const { data, error } = await supabase
      .from('cons_project_expenses')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/expenses/:id/receipt-url - Get signed URL for receipt image
router.get('/:id/receipt-url', async (req, res, next) => {
  try {
    const { data: expense, error } = await supabase
      .from('cons_project_expenses')
      .select('image_path')
      .eq('id', req.params.id)
      .single()

    if (error) throw error
    if (!expense?.image_path) {
      return res.status(404).json({ error: 'No receipt image found' })
    }

    const { data: signedUrl, error: urlError } = await supabase.storage
      .from('construgest-files')
      .createSignedUrl(expense.image_path, 3600)

    if (urlError) throw urlError
    res.json({ url: signedUrl.signedUrl })
  } catch (err) {
    next(err)
  }
})

// GET /api/expenses/work-log/:workLogId - Expenses linked to a work log
router.get('/work-log/:workLogId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_project_expenses')
      .select('*')
      .eq('work_log_id', req.params.workLogId)
      .order('date', { ascending: false })

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_project_expenses')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
