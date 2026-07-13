import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

const router = Router()
router.use(authMiddleware)

// Helper: normalize name for dedup comparisons
const normalizeName = (name) => {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

// ─── Library Chapters ────────────────────────────────────────────────

// GET /api/library/chapters — List library chapters with partida counts
router.get('/chapters', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id

    const { data: chapters, error } = await supabase
      .from('cons_library_chapters')
      .select('*')
      .eq('organization_id', orgId)
      .order('sort_order')

    if (error) throw error

    // Get partida counts per chapter
    const { data: counts, error: countErr } = await supabase
      .from('cons_saved_partidas')
      .select('library_chapter_id')
      .eq('organization_id', orgId)
      .not('library_chapter_id', 'is', null)

    if (countErr) throw countErr

    const countMap = {}
    for (const row of (counts || [])) {
      countMap[row.library_chapter_id] = (countMap[row.library_chapter_id] || 0) + 1
    }

    const result = chapters.map(ch => ({
      ...ch,
      partida_count: countMap[ch.id] || 0,
    }))

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// POST /api/library/chapters — Create library chapter (with name dedup)
router.post('/chapters', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { code, name, sort_order } = req.body

    // Check if a chapter with the same name already exists (case-insensitive)
    if (name) {
      const { data: existing } = await supabase
        .from('cons_library_chapters')
        .select('*')
        .eq('organization_id', orgId)

      const match = (existing || []).find(ch =>
        normalizeName(ch.name) === normalizeName(name)
      )
      if (match) {
        // Return existing chapter instead of creating a duplicate
        return res.status(200).json(match)
      }
    }

    const { data, error } = await supabase
      .from('cons_library_chapters')
      .insert({ organization_id: orgId, code, name, sort_order: sort_order || 0 })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/library/chapters/reorder — Batch reorder chapters (update sort_order + code)
// IMPORTANT: This must be BEFORE /chapters/:id to avoid :id matching "reorder"
router.put('/chapters/reorder', async (req, res, next) => {
  try {
    const { chapters } = req.body // Array of { id, code, sort_order }
    if (!Array.isArray(chapters)) return res.status(400).json({ error: 'chapters array required' })

    // Two-pass approach to avoid unique constraint violations on (organization_id, code).
    // When swapping e.g. "01" ↔ "02", direct sequential update fails because both
    // temporarily share the same code. Using "_tmp_" prefix in pass 1 avoids this.

    // PASS 1: Collect old codes and assign temporary codes
    const chapterOldCodes = {}
    for (const ch of chapters) {
      const { data: oldChapter } = await supabase
        .from('cons_library_chapters')
        .select('code')
        .eq('id', ch.id)
        .single()
      chapterOldCodes[ch.id] = oldChapter?.code

      const tmpCode = `_tmp_${ch.id.substring(0, 8)}`
      const { error } = await supabase
        .from('cons_library_chapters')
        .update({ code: tmpCode, sort_order: ch.sort_order, updated_at: new Date().toISOString() })
        .eq('id', ch.id)
      if (error) throw error
    }

    // PASS 2: Set final codes + update partida codes
    for (const ch of chapters) {
      const { error } = await supabase
        .from('cons_library_chapters')
        .update({ code: ch.code })
        .eq('id', ch.id)
      if (error) throw error

      const oldCode = chapterOldCodes[ch.id]
      // Update partida code prefixes and chapter_code when chapter code changed
      if (oldCode && oldCode !== ch.code) {
        const { data: partidas } = await supabase
          .from('cons_saved_partidas')
          .select('id, code')
          .eq('library_chapter_id', ch.id)
        for (const p of (partidas || [])) {
          const suffix = p.code.includes('.') ? p.code.substring(p.code.indexOf('.')) : ''
          await supabase
            .from('cons_saved_partidas')
            .update({ code: ch.code + suffix, chapter_code: ch.code })
            .eq('id', p.id)
        }
      } else {
        await supabase
          .from('cons_saved_partidas')
          .update({ chapter_code: ch.code })
          .eq('library_chapter_id', ch.id)
      }
    }

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// PUT /api/library/chapters/:id — Update library chapter
router.put('/chapters/:id', async (req, res, next) => {
  try {
    const { code, name, sort_order } = req.body
    const updates = { updated_at: new Date().toISOString() }
    if (code !== undefined) updates.code = code
    if (name !== undefined) updates.name = name
    if (sort_order !== undefined) updates.sort_order = sort_order

    const { data, error } = await supabase
      .from('cons_library_chapters')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/library/chapters/:id/next-code — Get next available partida code for a chapter
router.get('/chapters/:id/next-code', async (req, res, next) => {
  try {
    const chapterId = req.params.id

    const { data: chapter, error: chErr } = await supabase
      .from('cons_library_chapters')
      .select('code')
      .eq('id', chapterId)
      .single()

    if (chErr || !chapter) return res.status(404).json({ error: 'Chapter not found' })

    const { data: partidas } = await supabase
      .from('cons_saved_partidas')
      .select('code')
      .eq('library_chapter_id', chapterId)

    let maxNum = 0
    for (const p of (partidas || [])) {
      const parts = p.code.split('.')
      if (parts.length >= 2) {
        const num = parseInt(parts[1])
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    }

    const nextCode = `${chapter.code}.${String(maxNum + 1).padStart(2, '0')}`
    res.json({ next_code: nextCode, chapter_code: chapter.code })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/library/chapters/:id — Delete library chapter (partidas become orphan)
router.delete('/chapters/:id', async (req, res, next) => {
  try {
    // Unlink partidas first (ON DELETE SET NULL handles this, but let's also clear chapter_code)
    await supabase
      .from('cons_saved_partidas')
      .update({ library_chapter_id: null, chapter_code: null })
      .eq('library_chapter_id', req.params.id)

    const { error } = await supabase
      .from('cons_library_chapters')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ─── Partidas (grouped) ─────────────────────────────────────────────

// GET /api/library/partidas/grouped — Chapters with their nested partidas
router.get('/partidas/grouped', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id

    // Get chapters
    const { data: chapters, error: chErr } = await supabase
      .from('cons_library_chapters')
      .select('*')
      .eq('organization_id', orgId)
      .order('sort_order')

    if (chErr) throw chErr

    // Get all partidas
    const { data: partidas, error: pErr } = await supabase
      .from('cons_saved_partidas')
      .select('*')
      .eq('organization_id', orgId)
      .order('sort_order')
      .order('code')

    if (pErr) throw pErr

    // Group partidas by chapter
    const grouped = chapters.map(chapter => ({
      chapter,
      partidas: (partidas || []).filter(p => p.library_chapter_id === chapter.id),
    }))

    // Orphan partidas (no chapter)
    const orphans = (partidas || []).filter(p => !p.library_chapter_id)

    res.json({ chapters: grouped, orphans })
  } catch (err) {
    next(err)
  }
})

// ─── Partidas CRUD ──────────────────────────────────────────────────

// GET /api/library/partidas
router.get('/partidas', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { search, chapter_code } = req.query

    let query = supabase
      .from('cons_saved_partidas')
      .select('*')
      .eq('organization_id', orgId)
      .order('usage_count', { ascending: false })

    if (search) {
      query = query.or(`name.ilike."%${search}%",code.ilike."%${search}%",tags.ilike."%${search}%"`)
    }

    if (chapter_code) {
      query = query.eq('chapter_code', chapter_code)
    }

    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/library/partidas/check-duplicates
// Checks for existing partidas by code or name (case-insensitive)
router.post('/partidas/check-duplicates', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { code, name } = req.body

    if (!code && !name) return res.json([])

    // Search by exact code OR similar name (case-insensitive)
    let query = supabase
      .from('cons_saved_partidas')
      .select('*')
      .eq('organization_id', orgId)

    // Build OR filter: match by code or by name (ilike for case-insensitive)
    const filters = []
    if (code) filters.push(`code.eq.${code}`)
    if (name) filters.push(`name.ilike."%${name}%"`)

    if (filters.length > 0) {
      query = query.or(filters.join(','))
    }

    const { data, error } = await query.limit(10)
    if (error) throw error

    res.json(data || [])
  } catch (err) {
    next(err)
  }
})

// POST /api/library/partidas (with name dedup within same chapter)
router.post('/partidas', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const partida = { ...req.body, organization_id: orgId }

    // Check if a partida with the same name already exists in the same chapter
    if (partida.name) {
      let dupQuery = supabase
        .from('cons_saved_partidas')
        .select('*')
        .eq('organization_id', orgId)

      if (partida.library_chapter_id) {
        dupQuery = dupQuery.eq('library_chapter_id', partida.library_chapter_id)
      } else {
        dupQuery = dupQuery.is('library_chapter_id', null)
      }

      const { data: siblings } = await dupQuery
      const match = (siblings || []).find(p =>
        normalizeName(p.name) === normalizeName(partida.name)
      )

      if (match) {
        // Update existing partida instead of creating a duplicate
        const updates = { updated_at: new Date().toISOString() }
        if (partida.unit_price !== undefined) updates.unit_price = partida.unit_price
        if (partida.cost_price !== undefined) updates.cost_price = partida.cost_price
        if (partida.description) updates.description = partida.description
        if (partida.unit) updates.unit = partida.unit
        if (partida.code) updates.code = partida.code
        if (partida.chapter_code) updates.chapter_code = partida.chapter_code
        if (partida.tags) updates.tags = partida.tags
        if (partida.is_auxiliary !== undefined) updates.is_auxiliary = !!partida.is_auxiliary

        const { data: updated, error: upErr } = await supabase
          .from('cons_saved_partidas')
          .update(updates)
          .eq('id', match.id)
          .select()
          .single()

        if (upErr) throw upErr
        return res.status(200).json(updated)
      }
    }

    // Auto-assign sort_order as max+1 within the target chapter
    const chapterFilter = partida.library_chapter_id
      ? supabase.from('cons_saved_partidas').select('sort_order').eq('library_chapter_id', partida.library_chapter_id)
      : supabase.from('cons_saved_partidas').select('sort_order').is('library_chapter_id', null).eq('organization_id', orgId)
    const { data: maxRow } = await chapterFilter.order('sort_order', { ascending: false }).limit(1).single()
    partida.sort_order = (maxRow?.sort_order || 0) + 1

    const { data, error } = await supabase
      .from('cons_saved_partidas')
      .insert(partida)
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/library/partidas/reorder — Batch reorder partidas within a chapter
// IMPORTANT: Must be BEFORE /partidas/:id to avoid :id matching "reorder"
router.put('/partidas/reorder', async (req, res, next) => {
  try {
    const { partidas } = req.body
    if (!Array.isArray(partidas)) {
      return res.status(400).json({ error: 'partidas array required' })
    }
    for (const p of partidas) {
      const { error } = await supabase
        .from('cons_saved_partidas')
        .update({ sort_order: p.sort_order, updated_at: new Date().toISOString() })
        .eq('id', p.id)
      if (error) throw error
    }
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// PUT /api/library/partidas/:id
router.put('/partidas/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_saved_partidas')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/library/partidas/:id
router.delete('/partidas/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_saved_partidas')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/library/partidas/:id/increment-usage
router.post('/partidas/:id/increment-usage', async (req, res, next) => {
  try {
    const { data: current } = await supabase
      .from('cons_saved_partidas')
      .select('usage_count')
      .eq('id', req.params.id)
      .single()

    const { data, error } = await supabase
      .from('cons_saved_partidas')
      .update({ usage_count: (current?.usage_count || 0) + 1 })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/library/partidas/batch-save
// Smart batch save with chapter mapping and auto-renumbering
router.post('/partidas/batch-save', async (req, res, next) => {
  try {
    const { items, auto_create_chapters, chapter_mapping } = req.body
    // chapter_mapping: { budget_chapter_code: library_chapter_id } — optional explicit mapping
    const orgId = req.user.organization_id
    let created = 0, updated = 0, skipped = 0

    // Build chapter map: budget chapter code → library chapter id
    const chapterMap = {}
    const chapterCodeMap = {} // library chapter id → library chapter code

    // If explicit mapping provided, use it
    if (chapter_mapping && typeof chapter_mapping === 'object') {
      // Get library chapters to build code map
      const { data: libChapters } = await supabase
        .from('cons_library_chapters')
        .select('id, code')
        .eq('organization_id', orgId)

      for (const ch of (libChapters || [])) {
        chapterCodeMap[ch.id] = ch.code
      }

      for (const [budgetCode, libChapterId] of Object.entries(chapter_mapping)) {
        if (libChapterId) chapterMap[budgetCode] = libChapterId
      }
    } else if (auto_create_chapters) {
      // Legacy: auto-create chapters by code matching
      const { data: existingChapters } = await supabase
        .from('cons_library_chapters')
        .select('*')
        .eq('organization_id', orgId)

      for (const ch of (existingChapters || [])) {
        chapterMap[ch.code] = ch.id
        chapterCodeMap[ch.id] = ch.code
      }

      const { data: templates } = await supabase
        .from('cons_budget_chapter_templates')
        .select('code, name, sort_order')

      const templateMap = {}
      for (const t of (templates || [])) {
        templateMap[t.code] = t
      }

      const newChapters = {}
      for (const item of items) {
        const code = item.data?.chapter_code
        if (code && !chapterMap[code] && !newChapters[code]) {
          newChapters[code] = item.data?.chapter_name || null
        }
      }

      for (const [code, itemChapterName] of Object.entries(newChapters)) {
        const tmpl = templateMap[code]
        const chapterName = tmpl?.name || itemChapterName || `Capítulo ${code}`

        // Check if a chapter with the same name already exists (case-insensitive)
        const existingByName = (existingChapters || []).find(ch =>
          normalizeName(ch.name) === normalizeName(chapterName)
        )

        if (existingByName) {
          // Reuse existing chapter instead of creating a duplicate
          chapterMap[code] = existingByName.id
          chapterCodeMap[existingByName.id] = existingByName.code
        } else {
          const { data: newCh, error: chErr } = await supabase
            .from('cons_library_chapters')
            .insert({
              organization_id: orgId,
              code,
              name: chapterName,
              sort_order: tmpl?.sort_order || parseInt(code) || 0,
            })
            .select()
            .single()

          if (!chErr && newCh) {
            chapterMap[code] = newCh.id
            chapterCodeMap[newCh.id] = newCh.code
          }
        }
      }
    }

    // Get existing partida codes per library chapter (for auto-renumbering)
    const maxCodePerChapter = {}
    if (Object.keys(chapterMap).length > 0) {
      const libChapterIds = [...new Set(Object.values(chapterMap))]
      const { data: existingInChapters } = await supabase
        .from('cons_saved_partidas')
        .select('code, library_chapter_id')
        .in('library_chapter_id', libChapterIds)

      for (const p of (existingInChapters || [])) {
        const parts = p.code.split('.')
        if (parts.length >= 2) {
          const num = parseInt(parts[1])
          if (!isNaN(num)) {
            const chId = p.library_chapter_id
            maxCodePerChapter[chId] = Math.max(maxCodePerChapter[chId] || 0, num)
          }
        }
      }
    }

    // Get all existing partidas for dedup by name (case-insensitive)
    const { data: existingPartidas } = await supabase
      .from('cons_saved_partidas')
      .select('id, code, name')
      .eq('organization_id', orgId)

    const existingByName = {}
    for (const p of (existingPartidas || [])) {
      existingByName[normalizeName(p.name)] = p
    }

    for (const item of items) {
      const data = { ...item.data, organization_id: orgId }
      const budgetChapterCode = data.chapter_code

      // Resolve target library chapter
      let targetChapterId = null
      if (budgetChapterCode && chapterMap[budgetChapterCode]) {
        targetChapterId = chapterMap[budgetChapterCode]
      }

      if (targetChapterId) {
        data.library_chapter_id = targetChapterId
        // Auto-renumber: assign next code in target chapter
        const libCode = chapterCodeMap[targetChapterId] || budgetChapterCode
        const nextNum = (maxCodePerChapter[targetChapterId] || 0) + 1
        maxCodePerChapter[targetChapterId] = nextNum
        data.code = `${libCode}.${String(nextNum).padStart(2, '0')}`
        data.chapter_code = libCode
      }

      // Check for existing partida by name (normalized) — dedup by concept
      const existing = data.name ? existingByName[normalizeName(data.name)] : null

      if (existing) {
        // Update existing: prices, description, chapter assignment
        await supabase
          .from('cons_saved_partidas')
          .update({
            unit_price: data.unit_price,
            cost_price: data.cost_price,
            description: data.description || undefined,
            library_chapter_id: data.library_chapter_id || undefined,
            code: data.code || undefined,
            chapter_code: data.chapter_code || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        updated++
      } else if (item.action === 'create') {
        // Remove chapter_name before insert (not a DB column)
        delete data.chapter_name
        const { error: insertErr } = await supabase
          .from('cons_saved_partidas')
          .insert(data)

        if (!insertErr) {
          created++
          if (data.name) existingByName[normalizeName(data.name)] = { id: 'new', code: data.code, name: data.name }
        } else {
          skipped++
        }
      } else if (item.action === 'update' && item.target_id) {
        delete data.chapter_name
        await supabase
          .from('cons_saved_partidas')
          .update(data)
          .eq('id', item.target_id)
        updated++
      } else {
        skipped++
      }
    }

    res.json({ created, updated, skipped })
  } catch (err) {
    next(err)
  }
})

// ─── Templates ───────────────────────────────────────────────────────

// GET /api/library/templates/chapters
router.get('/templates/chapters', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_budget_chapter_templates')
      .select('*')
      .order('sort_order')

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/library/templates/items/:chapterCode
router.get('/templates/items/:chapterCode', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_budget_item_templates')
      .select('*')
      .eq('chapter_code', req.params.chapterCode)
      .order('sort_order')

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// ─── Units ───────────────────────────────────────────────────────────

const DEFAULT_UNITS = [
  { value: 'ud', label: 'ud — Unidad' },
  { value: 'm', label: 'm — Metro lineal' },
  { value: 'm²', label: 'm² — Metro cuadrado' },
  { value: 'm³', label: 'm³ — Metro cúbico' },
  { value: 'kg', label: 'kg — Kilogramo' },
  { value: 't', label: 't — Tonelada' },
  { value: 'h', label: 'h — Hora' },
  { value: 'l', label: 'l — Litro' },
  { value: 'ml', label: 'ml — Mililitro' },
  { value: 'pa', label: 'pa — Partida alzada' },
]

// GET /api/library/units — list default + custom units for the org
router.get('/units', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { data, error } = await supabase
      .from('cons_units')
      .select('value, label, sort_order')
      .eq('organization_id', orgId)
      .order('sort_order')

    if (error) throw error

    const customValues = new Set((data || []).map(u => u.value))
    const defaults = DEFAULT_UNITS.filter(u => !customValues.has(u.value))
    res.json([...defaults, ...(data || [])])
  } catch (err) {
    next(err)
  }
})

// POST /api/library/units — add a custom unit for the org
router.post('/units', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { value, label } = req.body
    if (!value) return res.status(400).json({ error: 'value is required' })

    const { data: existing } = await supabase
      .from('cons_units')
      .select('id')
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const sort_order = existing && existing.length > 0 ? existing[0].sort_order + 1 : DEFAULT_UNITS.length

    const { data, error } = await supabase
      .from('cons_units')
      .insert({ organization_id: orgId, value: value.trim(), label: label || value.trim(), sort_order })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe esa unidad' })
      throw error
    }
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

export default router
