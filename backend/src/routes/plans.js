import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/supabase.js'

const router = Router()
router.use(authMiddleware)

// GET /api/plans/file/:fileId/annotations
router.get('/file/:fileId/annotations', async (req, res, next) => {
  try {
    const { page } = req.query

    let query = supabase
      .from('cons_plan_annotations')
      .select('*')
      .eq('file_id', req.params.fileId)
      .order('created_at')

    if (page) {
      query = query.eq('page_number', parseInt(page))
    }

    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/plans/annotations
router.post('/annotations', async (req, res, next) => {
  try {
    const { file_id, page_number, annotation_type, data: annotationData } = req.body

    const { data, error } = await supabase
      .from('cons_plan_annotations')
      .insert({ file_id, page_number, annotation_type, data: annotationData })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/plans/annotations/:id — update annotation data (style, color, etc.)
router.patch('/annotations/:id', async (req, res, next) => {
  try {
    const { data: annotationData } = req.body
    const { data, error } = await supabase
      .from('cons_plan_annotations')
      .update({ data: annotationData })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/plans/annotations/:id
router.delete('/annotations/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_plan_annotations')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/plans/file/:fileId/pages/:page/annotations
router.delete('/file/:fileId/pages/:page/annotations', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_plan_annotations')
      .delete()
      .eq('file_id', req.params.fileId)
      .eq('page_number', parseInt(req.params.page))

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// GET /api/plans/file/:fileId/pages/:page/calibration
router.get('/file/:fileId/pages/:page/calibration', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_plan_calibrations')
      .select('*')
      .eq('file_id', req.params.fileId)
      .eq('page_number', parseInt(req.params.page))
      .single()

    if (error && error.code !== 'PGRST116') throw error
    res.json(data || null)
  } catch (err) {
    next(err)
  }
})

// POST /api/plans/calibrations
router.post('/calibrations', async (req, res, next) => {
  try {
    const { file_id, page_number, pixels_distance, real_distance, unit } = req.body

    const { data, error } = await supabase
      .from('cons_plan_calibrations')
      .upsert(
        { file_id, page_number, pixels_distance, real_distance, unit },
        { onConflict: 'file_id,page_number' }
      )
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/plans/file/:fileId/shift-pages - After deleting a PDF page, renumber annotations
router.post('/file/:fileId/shift-pages', async (req, res, next) => {
  try {
    const fileId = req.params.fileId
    const { deletedPage } = req.body

    if (!deletedPage || typeof deletedPage !== 'number') {
      return res.status(400).json({ error: 'deletedPage es obligatorio y debe ser un numero' })
    }

    // Delete annotations and calibrations for the deleted page
    await supabase
      .from('cons_plan_annotations')
      .delete()
      .eq('file_id', fileId)
      .eq('page_number', deletedPage)

    await supabase
      .from('cons_plan_calibrations')
      .delete()
      .eq('file_id', fileId)
      .eq('page_number', deletedPage)

    // Decrement page_number for pages after the deleted one
    // Supabase doesn't support SET page_number = page_number - 1 via JS client,
    // so we use RPC or fetch + update individually
    const { data: annsToShift } = await supabase
      .from('cons_plan_annotations')
      .select('id, page_number')
      .eq('file_id', fileId)
      .gt('page_number', deletedPage)

    if (annsToShift && annsToShift.length > 0) {
      for (const ann of annsToShift) {
        await supabase
          .from('cons_plan_annotations')
          .update({ page_number: ann.page_number - 1 })
          .eq('id', ann.id)
      }
    }

    const { data: calsToShift } = await supabase
      .from('cons_plan_calibrations')
      .select('id, page_number')
      .eq('file_id', fileId)
      .gt('page_number', deletedPage)

    if (calsToShift && calsToShift.length > 0) {
      for (const cal of calsToShift) {
        await supabase
          .from('cons_plan_calibrations')
          .update({ page_number: cal.page_number - 1 })
          .eq('id', cal.id)
      }
    }

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
