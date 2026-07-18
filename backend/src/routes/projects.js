import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { mkdir, writeFile, readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { authMiddleware, projectAccessMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'
import { parseDxf, formatEntitiesForAI } from '../services/dxf-service.js'
import { notifyProjectsChange } from '../services/realtimeBroadcast.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

// All routes require auth
router.use(authMiddleware)

// GET /api/projects - List user's projects
router.get('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id

    // Paginación opcional. Por defecto devuelve hasta 200 (compatible con
    // clientes que esperan la lista completa).
    const limit = Math.min(parseInt(req.query.limit) || 200, 500)
    const offset = parseInt(req.query.offset) || 0

    const [ownRes, linksARes, linksBRes] = await Promise.all([
      supabase
        .from('cons_projects')
        .select('*')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1),
      supabase
        .from('cons_branch_links')
        .select('id, organization_b_id')
        .eq('organization_a_id', orgId),
      supabase
        .from('cons_branch_links')
        .select('id, organization_a_id')
        .eq('organization_b_id', orgId),
    ])
    if (ownRes.error) throw ownRes.error
    const data = ownRes.data || []
    const linksA = linksARes.data
    const linksB = linksBRes.data

    const branchLinks = [
      ...((linksA || []).map(l => ({ linkId: l.id, partnerOrgId: l.organization_b_id }))),
      ...((linksB || []).map(l => ({ linkId: l.id, partnerOrgId: l.organization_a_id }))),
    ]

    let branchProjects = []
    if (branchLinks.length > 0) {
      // Obtener proyectos visibles de cada link
      const linkIds = branchLinks.map(bl => bl.linkId)
      const { data: visibilities } = await supabase
        .from('cons_branch_project_visibility')
        .select('project_id, branch_link_id')
        .in('branch_link_id', linkIds)
        .eq('visible', true)

      if (visibilities && visibilities.length > 0) {
        const visibleProjectIds = visibilities.map(v => v.project_id)
        const { data: bProjects } = await supabase
          .from('cons_projects')
          .select('*')
          .in('id', visibleProjectIds)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })

        // Obtener nombres de orgs partner
        const partnerOrgIds = [...new Set(branchLinks.map(bl => bl.partnerOrgId))]
        const { data: orgs } = await supabase
          .from('cons_organizations')
          .select('id, name')
          .in('id', partnerOrgIds)
        const orgMap = Object.fromEntries((orgs || []).map(o => [o.id, o.name]))

        // Mapear linkId -> partnerOrgId
        const linkToPartner = Object.fromEntries(branchLinks.map(bl => [bl.linkId, bl.partnerOrgId]))
        // Mapear projectId -> linkId
        const projectToLink = Object.fromEntries(visibilities.map(v => [v.project_id, v.branch_link_id]))

        branchProjects = (bProjects || []).map(p => {
          const linkId = projectToLink[p.id]
          const partnerOrgId = linkToPartner[linkId]
          return {
            ...p,
            source: 'branch',
            branch_link_id: linkId,
            branch_org_name: orgMap[partnerOrgId] || 'Desconocida',
          }
        })
      }
    }

    res.json([...data, ...branchProjects])
  } catch (err) {
    next(err)
  }
})

// POST /api/projects - Create project
router.post('/', async (req, res, next) => {
  try {
    const { name, description, location, client_name, client_contact, address, city, province, postal_code, country, start_date, end_date, folder_path } = req.body

    if (!name) {
      return res.status(400).json({ error: 'El nombre es obligatorio' })
    }

    const { data, error } = await supabase
      .from('cons_projects')
      .insert({
        organization_id: req.user.organization_id,
        created_by: req.user.id,
        name,
        description,
        location,
        client_name,
        client_contact,
        address,
        city,
        province,
        postal_code,
        country,
        start_date: start_date || null,
        end_date: end_date || null,
        folder_path,
      })
      .select()
      .single()

    if (error) throw error

    // Create physical folder on disk if folder_path is set (only works on local backend)
    if (data.folder_path && !process.env.RENDER) {
      try {
        await mkdir(data.folder_path, { recursive: true })
      } catch (fsErr) {
        console.warn('Could not create project folder:', fsErr.message)
      }
    }

    res.status(201).json(data)
    notifyProjectsChange(req.user.organization_id, 'project-create')
  } catch (err) {
    next(err)
  }
})

// POST /api/projects/sync-folders - Create folders for all existing projects
router.post('/sync-folders', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { base_path } = req.body

    if (!base_path) {
      return res.status(400).json({ error: 'Se requiere base_path' })
    }

    // Get all projects for this org
    const { data: projects, error } = await supabase
      .from('cons_projects')
      .select('id, name, folder_path')
      .eq('organization_id', orgId)

    if (error) throw error

    const slugify = (text) =>
      text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '-')

    const results = []
    const basePath = base_path.replace(/[/\\]+$/, '')

    for (const project of projects) {
      const projectSlug = slugify(project.name)
      const folderPath = `${basePath}/${projectSlug}`

      try {
        await mkdir(folderPath, { recursive: true })

        // Update folder_path in DB if not set or different
        if (project.folder_path !== folderPath) {
          await supabase
            .from('cons_projects')
            .update({ folder_path: folderPath, updated_at: new Date().toISOString() })
            .eq('id', project.id)
        }

        results.push({ id: project.id, name: project.name, folder_path: folderPath, status: 'ok' })
      } catch (fsErr) {
        results.push({ id: project.id, name: project.name, folder_path: folderPath, status: 'error', error: fsErr.message })
      }
    }

    res.json({ synced: results.length, results })
  } catch (err) {
    next(err)
  }
})

// GET /api/projects/trash - Listar proyectos en papelera (de mi org)
// IMPORTANTE: declarado antes de GET /:id para que '/trash' no caiga en :id.
router.get('/trash', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { data, error } = await supabase
      .from('cons_projects')
      .select('*')
      .eq('organization_id', orgId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    next(err)
  }
})

// GET /api/projects/:id - Get project details
router.get('/:id', projectAccessMiddleware, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_projects')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (error) throw error
    res.json({
      ...data,
      access: {
        role: req.userRole,
        shared_kinds: req.mailboxSharedKinds || null,
      },
    })
  } catch (err) {
    next(err)
  }
})

// PUT /api/projects/:id - Update project
router.put('/:id', projectAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    // Solo actualizar los campos que llegan en el body. Antes se reconstruía el
    // objeto entero y el shim convertía los `undefined` en NULL: al cambiar solo
    // el estado desde la lista (se manda { status }) hacía SET name=NULL sobre una
    // columna NOT NULL y fallaba ("Error al cambiar el estado").
    const editable = ['name', 'description', 'location', 'client_name', 'client_contact', 'address', 'city', 'province', 'postal_code', 'country', 'start_date', 'end_date', 'status', 'folder_path']
    const updates = { updated_at: new Date().toISOString() }
    for (const f of editable) {
      if (req.body[f] === undefined) continue
      updates[f] = (f === 'start_date' || f === 'end_date') ? (req.body[f] || null) : req.body[f]
    }

    const { data, error } = await supabase
      .from('cons_projects')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
    notifyProjectsChange(data.organization_id, 'project-update')
  } catch (err) {
    next(err)
  }
})

// DELETE /api/projects/:id - Soft delete (mover a papelera).
// Para eliminación definitiva usar DELETE /:id/permanent.
router.delete('/:id', projectAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    if (req.userRole !== 'owner') {
      return res.status(403).json({ error: 'Solo el propietario puede eliminar proyectos' })
    }

    const { error } = await supabase
      .from('cons_projects')
      .update({ deleted_at: new Date().toISOString(), deleted_by: req.user.id })
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true, soft: true })
    notifyProjectsChange(req.project.organization_id, 'project-delete')
  } catch (err) {
    next(err)
  }
})

// POST /api/projects/:id/restore - Restaurar proyecto desde papelera
router.post('/:id/restore', async (req, res, next) => {
  try {
    const orgId = req.user.organization_id
    const { data: project } = await supabase
      .from('cons_projects')
      .select('id, organization_id')
      .eq('id', req.params.id)
      .single()
    if (!project || project.organization_id !== orgId) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }
    const { error } = await supabase
      .from('cons_projects')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
    notifyProjectsChange(orgId, 'project-restore')
  } catch (err) {
    next(err)
  }
})

// DELETE /api/projects/:id/permanent - Eliminación definitiva (solo owner)
router.delete('/:id/permanent', projectAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    if (req.userRole !== 'owner') {
      return res.status(403).json({ error: 'Solo el propietario puede eliminar definitivamente' })
    }
    const { error } = await supabase
      .from('cons_projects')
      .delete()
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true, hard: true })
    notifyProjectsChange(req.project.organization_id, 'project-purge')
  } catch (err) {
    next(err)
  }
})

// POST /api/projects/:id/files - Upload file
router.post('/:id/files', projectAccessMiddleware({ requireWrite: true }), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha proporcionado ningún archivo' })
    }

    const projectId = req.params.id
    const originalName = req.file.originalname
    const ext = originalName.split('.').pop()?.toLowerCase() || ''
    const storedName = `${randomUUID()}.${ext}`
    const storagePath = `projects/${projectId}/${storedName}`
    const category = req.body.category || 'general'

    // Detect file type
    const typeMap = {
      pdf: 'pdf', dwg: 'dwg', dxf: 'dxf',
      jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image',
      doc: 'document', docx: 'document', txt: 'document',
      xls: 'spreadsheet', xlsx: 'spreadsheet', csv: 'spreadsheet',
    }
    const fileType = typeMap[ext] || 'other'

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('construgest-files')
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      })

    if (uploadError) throw uploadError

    // Save file record
    const { data, error } = await supabase
      .from('cons_project_files')
      .insert({
        project_id: projectId,
        original_name: originalName,
        stored_name: storedName,
        storage_path: storagePath,
        file_type: fileType,
        file_size: req.file.size,
        category,
        description: req.body.description || null,
      })
      .select()
      .single()

    if (error) throw error

    // ── DXF/DWG: parse and generate SVG + extracted data ──
    if (fileType === 'dxf' || fileType === 'dwg') {
      try {
        // Try to parse as DXF text (works for .dxf and some .dwg that are actually DXF format)
        const dxfContent = req.file.buffer.toString('utf-8')
        const parsed = parseDxf(dxfContent)

        // Store SVG preview in Supabase Storage
        const svgPath = `projects/${projectId}/${randomUUID()}_preview.svg`
        await supabase.storage
          .from('construgest-files')
          .upload(svgPath, Buffer.from(parsed.svg, 'utf-8'), {
            contentType: 'image/svg+xml',
            upsert: false,
          })

        // Store extracted data and SVG path in the file record
        await supabase
          .from('cons_project_files')
          .update({
            dxf_svg_path: svgPath,
            dxf_entities: parsed.entities,
            dxf_layers: parsed.layers,
            dxf_bounding_box: parsed.boundingBox,
          })
          .eq('id', data.id)

        data.dxf_svg_path = svgPath
        data.dxf_layers = parsed.layers
        data.dxf_bounding_box = parsed.boundingBox
        data.dxf_entity_count = {
          texts: parsed.entities.texts.length,
          dimensions: parsed.entities.dimensions.length,
          blocks: parsed.entities.blocks.length,
          lines: parsed.entities.lines.length,
        }

        console.log(`[projects] DXF parseado: ${parsed.entities.texts.length} textos, ${parsed.entities.dimensions.length} cotas, ${parsed.entities.blocks.length} bloques`)
      } catch (dxfErr) {
        console.warn('[projects] Error parseando DXF:', dxfErr.message)
        // File is still saved, just without DXF data
      }
    }

    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/projects/:id/files/:fileId/dxf-data - Get DXF extracted data + SVG URL
router.get('/:id/files/:fileId/dxf-data', projectAccessMiddleware, async (req, res, next) => {
  try {
    const { data: file, error } = await supabase
      .from('cons_project_files')
      .select('dxf_svg_path, dxf_entities, dxf_layers, dxf_bounding_box')
      .eq('id', req.params.fileId)
      .eq('project_id', req.params.id)
      .single()

    if (error) throw error
    if (!file.dxf_svg_path) {
      return res.status(404).json({ error: 'No hay datos DXF para este archivo' })
    }

    // Get signed URL for SVG
    const { data: signedUrl, error: urlError } = await supabase.storage
      .from('construgest-files')
      .createSignedUrl(file.dxf_svg_path, 3600)

    if (urlError) throw urlError

    res.json({
      svgUrl: signedUrl.signedUrl,
      entities: file.dxf_entities,
      layers: file.dxf_layers,
      boundingBox: file.dxf_bounding_box,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/projects/:id/files/:fileId/dxf-text - Get AI-formatted text from DXF
router.get('/:id/files/:fileId/dxf-text', projectAccessMiddleware, async (req, res, next) => {
  try {
    const { data: file, error } = await supabase
      .from('cons_project_files')
      .select('dxf_entities, dxf_layers')
      .eq('id', req.params.fileId)
      .eq('project_id', req.params.id)
      .single()

    if (error) throw error
    if (!file.dxf_entities) {
      return res.status(404).json({ error: 'No hay datos DXF para este archivo' })
    }

    const formattedText = formatEntitiesForAI(file.dxf_entities, file.dxf_layers || [])
    res.json({ text: formattedText, entityCount: file.dxf_entities.texts?.length || 0 })
  } catch (err) {
    next(err)
  }
})

// POST /api/projects/:id/files/multi-dwg — Upload multiple DWG/DXF files as pages of a single plan
router.post('/:id/files/multi-dwg', projectAccessMiddleware({ requireWrite: true }), upload.array('files', 50), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se han proporcionado archivos' })
    }

    const projectId = req.params.id
    const planName = req.body.planName || req.files[0].originalname.replace(/\.[^.]+$/, '')

    // Detect dominant file type from uploaded files
    const firstExt = req.files[0].originalname.split('.').pop()?.toLowerCase() || 'dxf'
    const parentFileType = firstExt === 'dxf' ? 'dxf' : firstExt === 'dwg' ? 'dwg' : 'dxf'

    // 1. Create the parent "container" file record
    const { data: parentRecord, error: parentError } = await supabase
      .from('cons_project_files')
      .insert({
        project_id: projectId,
        original_name: planName + '.' + parentFileType,
        stored_name: 'multi-dwg-container',
        storage_path: 'virtual',
        file_type: parentFileType,
        file_size: req.files.reduce((sum, f) => sum + f.size, 0),
        category: 'plan',
        description: `Plano multi-página (${req.files.length} archivos DWG/DXF)`,
        page_order: 0,
      })
      .select()
      .single()

    if (parentError) throw parentError

    // 2. Upload each file as a child page
    const childRecords = []
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i]
      const ext = file.originalname.split('.').pop()?.toLowerCase() || 'dxf'
      const storedName = `${randomUUID()}.${ext}`
      const storagePath = `projects/${projectId}/${storedName}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('construgest-files')
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype || 'application/octet-stream',
          upsert: false,
        })

      if (uploadError) {
        console.warn(`[multi-dwg] Error uploading file ${i + 1}:`, uploadError.message)
        continue
      }

      const fileType = ext === 'dwg' ? 'dwg' : ext === 'dxf' ? 'dxf' : 'other'

      // Create child record
      const { data: childRecord, error: childError } = await supabase
        .from('cons_project_files')
        .insert({
          project_id: projectId,
          original_name: file.originalname,
          stored_name: storedName,
          storage_path: storagePath,
          file_type: fileType,
          file_size: file.size,
          category: 'plan',
          parent_file_id: parentRecord.id,
          page_order: i,
        })
        .select()
        .single()

      if (childError) {
        console.warn(`[multi-dwg] Error creating record for ${file.originalname}:`, childError.message)
        continue
      }

      // Parse DXF/DWG — try to parse all CAD files as DXF text
      if (fileType === 'dxf' || fileType === 'dwg') {
        try {
          const parsed = parseDxf(file.buffer.toString('utf-8'))
          const svgPath = `projects/${projectId}/${randomUUID()}_preview.svg`
          await supabase.storage
            .from('construgest-files')
            .upload(svgPath, Buffer.from(parsed.svg, 'utf-8'), {
              contentType: 'image/svg+xml', upsert: false,
            })

          await supabase
            .from('cons_project_files')
            .update({
              dxf_svg_path: svgPath,
              dxf_entities: parsed.entities,
              dxf_layers: parsed.layers,
              dxf_bounding_box: parsed.boundingBox,
            })
            .eq('id', childRecord.id)

          childRecord.dxf_svg_path = svgPath
        } catch (dxfErr) {
          console.warn(`[multi-dwg] Error parsing DXF ${file.originalname}:`, dxfErr.message)
        }
      }

      childRecords.push(childRecord)
    }

    console.log(`[multi-dwg] Subidos ${childRecords.length}/${req.files.length} archivos como páginas de "${planName}"`)

    res.status(201).json({
      parent: parentRecord,
      pages: childRecords,
      totalPages: childRecords.length,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/projects/:id/files/:fileId/pages — Get child pages of a multi-DWG file
router.get('/:id/files/:fileId/pages', projectAccessMiddleware, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_project_files')
      .select('*')
      .eq('parent_file_id', req.params.fileId)
      .eq('project_id', req.params.id)
      .order('page_order', { ascending: true })

    if (error) throw error
    res.json(data || [])
  } catch (err) {
    next(err)
  }
})

// PUT /api/projects/:id/files/:fileId/reorder — Reorder pages of a multi-DWG file
router.put('/:id/files/:fileId/reorder', projectAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    const { pageOrder } = req.body // Array of child file IDs in desired order

    if (!Array.isArray(pageOrder)) {
      return res.status(400).json({ error: 'Se requiere un array pageOrder con los IDs de las páginas' })
    }

    // Update page_order for each child
    for (let i = 0; i < pageOrder.length; i++) {
      const { error } = await supabase
        .from('cons_project_files')
        .update({ page_order: i })
        .eq('id', pageOrder[i])
        .eq('parent_file_id', req.params.fileId)
        .eq('project_id', req.params.id)

      if (error) console.warn(`[reorder] Error updating page ${pageOrder[i]}:`, error.message)
    }

    res.json({ success: true, order: pageOrder })
  } catch (err) {
    next(err)
  }
})

// GET /api/projects/:id/files/:fileId/url - Get signed download URL
router.get('/:id/files/:fileId/url', projectAccessMiddleware, async (req, res, next) => {
  try {
    const { data: file, error } = await supabase
      .from('cons_project_files')
      .select('storage_path')
      .eq('id', req.params.fileId)
      .eq('project_id', req.params.id)
      .single()

    if (error || !file) return res.status(404).json({ error: 'Archivo no encontrado' })

    const { data: signedUrl, error: urlError } = await supabase.storage
      .from('construgest-files')
      .createSignedUrl(file.storage_path, 3600)

    if (urlError) throw urlError
    res.json({ url: signedUrl.signedUrl })
  } catch (err) {
    next(err)
  }
})

// GET /api/projects/:id/files - List project files (excludes child pages of multi-DWG)
router.get('/:id/files', projectAccessMiddleware, async (req, res, next) => {
  try {
    const { data: rows, error } = await supabase
      .from('cons_project_files')
      .select('*')
      .eq('project_id', req.params.id)
      .is('parent_file_id', null)
      .order('imported_at', { ascending: false })

    if (error) throw error
    const data = rows || []

    // Identificar contenedores multi-DWG (storage_path = 'virtual'). Para cada
    // uno necesitamos el SVG de la primera página. En lugar de N consultas (N+1),
    // hacemos una sola query que trae el primer hijo de TODOS los contenedores.
    const virtualParentIds = data
      .filter(f => (f.file_type === 'dwg' || f.file_type === 'dxf') && f.storage_path === 'virtual')
      .map(f => f.id)

    const firstChildByParent = {}
    if (virtualParentIds.length > 0) {
      const { data: children } = await supabase
        .from('cons_project_files')
        .select('parent_file_id, page_order, dxf_svg_path')
        .in('parent_file_id', virtualParentIds)
        .order('page_order', { ascending: true })
      for (const c of (children || [])) {
        // Como están ordenados ASC, el primer match para cada parent es el de menor page_order.
        if (!firstChildByParent[c.parent_file_id] && c.dxf_svg_path) {
          firstChildByParent[c.parent_file_id] = c.dxf_svg_path
        }
      }
    }

    // Reunir todos los paths que necesitan signed URL en una sola tanda y
    // mapear path → URL firmada. createSignedUrls (plural) devuelve todas
    // las URLs de una sola request.
    const pathSet = new Set()
    for (const file of data) {
      if (file.dxf_svg_path) pathSet.add(file.dxf_svg_path)
      if (file.file_type === 'image' && file.storage_path) pathSet.add(file.storage_path)
      const childPath = firstChildByParent[file.id]
      if (childPath) pathSet.add(childPath)
    }

    const signedByPath = {}
    if (pathSet.size > 0) {
      const paths = [...pathSet]
      const { data: signedList } = await supabase.storage
        .from('construgest-files')
        .createSignedUrls(paths, 3600)
      for (const s of (signedList || [])) {
        if (s && s.signedUrl && s.path) signedByPath[s.path] = s.signedUrl
      }
    }

    for (const file of data) {
      // DXF/DWG con SVG preview directo.
      if (file.dxf_svg_path && signedByPath[file.dxf_svg_path]) {
        file.thumbnail_url = signedByPath[file.dxf_svg_path]
      } else {
        // Multi-DWG container: usar el SVG del primer hijo.
        const childPath = firstChildByParent[file.id]
        if (childPath && signedByPath[childPath]) {
          file.thumbnail_url = signedByPath[childPath]
        }
      }
      // Imágenes: el thumbnail es la propia URL firmada del archivo.
      if (file.file_type === 'image' && file.storage_path && signedByPath[file.storage_path]) {
        file.thumbnail_url = signedByPath[file.storage_path]
      }
    }

    res.json(data)
  } catch (err) {
    next(err)
  }
})

// PUT /api/projects/:id/files/:fileId/replace - Replace file content (e.g. after page deletion)
router.put('/:id/files/:fileId/replace', projectAccessMiddleware({ requireWrite: true }), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha proporcionado ningún archivo' })
    }

    // Get existing file record
    const { data: existing, error: fetchError } = await supabase
      .from('cons_project_files')
      .select('storage_path')
      .eq('id', req.params.fileId)
      .eq('project_id', req.params.id)
      .single()

    if (fetchError || !existing) return res.status(404).json({ error: 'Archivo no encontrado' })

    // Overwrite in Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('construgest-files')
      .update(existing.storage_path, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      })

    if (uploadError) throw uploadError

    // Update file_size in DB
    const { data, error } = await supabase
      .from('cons_project_files')
      .update({ file_size: req.file.size })
      .eq('id', req.params.fileId)
      .eq('project_id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/projects/:id/files/:fileId
router.delete('/:id/files/:fileId', projectAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    // Get file path first
    const { data: file } = await supabase
      .from('cons_project_files')
      .select('storage_path')
      .eq('id', req.params.fileId)
      .eq('project_id', req.params.id)
      .single()

    // Delete from storage
    if (file?.storage_path) {
      await supabase.storage.from('construgest-files').remove([file.storage_path])
    }

    // Delete DB record
    const { error } = await supabase
      .from('cons_project_files')
      .delete()
      .eq('id', req.params.fileId)
      .eq('project_id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/projects/:id/backup - Export full project backup to folder_path
router.post('/:id/backup', projectAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    const projectId = req.params.id

    // Get project
    const { data: project, error: projErr } = await supabase
      .from('cons_projects').select('*').eq('id', projectId).single()
    if (projErr) throw projErr

    if (!project.folder_path) {
      return res.status(400).json({ error: 'El proyecto no tiene carpeta asignada' })
    }

    const backupDir = join(project.folder_path, '_backup')
    await mkdir(backupDir, { recursive: true })

    // Helper to query and save
    const exportTable = async (table, filter, filename) => {
      const { data, error } = await supabase.from(table).select('*').match(filter)
      if (error) throw error
      await writeFile(join(backupDir, filename), JSON.stringify(data || [], null, 2), 'utf-8')
      return data || []
    }

    // 1. Project metadata
    await writeFile(join(backupDir, 'project.json'), JSON.stringify(project, null, 2), 'utf-8')

    // 2. Project files metadata
    const files = await exportTable('cons_project_files', { project_id: projectId }, 'files.json')

    // 3. Budgets
    const budgets = await exportTable('cons_budgets', { project_id: projectId }, 'budgets.json')

    // 4. Chapters (for each budget)
    const allChapters = []
    const allItems = []
    const allMeasurements = []
    const allBreakdowns = []
    for (const budget of budgets) {
      const { data: chapters } = await supabase.from('cons_chapters').select('*').eq('budget_id', budget.id)
      if (chapters) {
        allChapters.push(...chapters)
        for (const ch of chapters) {
          const { data: items } = await supabase.from('cons_budget_items').select('*').eq('chapter_id', ch.id)
          if (items) {
            allItems.push(...items)
            for (const item of items) {
              const { data: measurements } = await supabase.from('cons_measurements').select('*').eq('budget_item_id', item.id)
              if (measurements) allMeasurements.push(...measurements)
              const { data: breakdowns } = await supabase.from('cons_price_breakdown').select('*').eq('budget_item_id', item.id)
              if (breakdowns) allBreakdowns.push(...breakdowns)
            }
          }
        }
      }
    }
    await writeFile(join(backupDir, 'chapters.json'), JSON.stringify(allChapters, null, 2), 'utf-8')
    await writeFile(join(backupDir, 'budget_items.json'), JSON.stringify(allItems, null, 2), 'utf-8')
    await writeFile(join(backupDir, 'measurements.json'), JSON.stringify(allMeasurements, null, 2), 'utf-8')
    await writeFile(join(backupDir, 'price_breakdowns.json'), JSON.stringify(allBreakdowns, null, 2), 'utf-8')

    // 5. Certifications
    const certs = await exportTable('cons_certifications', {}, 'certifications.json')
      .catch(() => []) // table might not exist
    // Filter by budget_ids
    const budgetIds = budgets.map(b => b.id)
    const filteredCerts = certs.filter(c => budgetIds.includes(c.budget_id))
    await writeFile(join(backupDir, 'certifications.json'), JSON.stringify(filteredCerts, null, 2), 'utf-8')

    if (filteredCerts.length > 0) {
      const certIds = filteredCerts.map(c => c.id)
      const { data: certItems } = await supabase.from('cons_certification_items').select('*').in('certification_id', certIds)
      await writeFile(join(backupDir, 'certification_items.json'), JSON.stringify(certItems || [], null, 2), 'utf-8')
    }

    // 6. Work logs
    const workLogs = await exportTable('cons_work_logs', { project_id: projectId }, 'work_logs.json')
    if (workLogs.length > 0) {
      const wlIds = workLogs.map(w => w.id)
      const tables = ['cons_work_log_labor', 'cons_work_log_materials', 'cons_work_log_equipment', 'cons_work_log_budget_links']
      for (const table of tables) {
        const { data } = await supabase.from(table).select('*').in('work_log_id', wlIds)
        const filename = table.replace('cons_', '') + '.json'
        await writeFile(join(backupDir, filename), JSON.stringify(data || [], null, 2), 'utf-8')
      }
    }

    // 7. Expenses
    await exportTable('cons_project_expenses', { project_id: projectId }, 'expenses.json')

    // 8. Plan annotations & calibrations (by file_id)
    if (files.length > 0) {
      const fileIds = files.map(f => f.id)
      const { data: annotations } = await supabase.from('cons_plan_annotations').select('*').in('file_id', fileIds)
      await writeFile(join(backupDir, 'plan_annotations.json'), JSON.stringify(annotations || [], null, 2), 'utf-8')
      const { data: calibrations } = await supabase.from('cons_plan_calibrations').select('*').in('file_id', fileIds)
      await writeFile(join(backupDir, 'plan_calibrations.json'), JSON.stringify(calibrations || [], null, 2), 'utf-8')
    }

    // 9. Download actual files from Supabase Storage
    const filesDir = join(backupDir, 'files')
    await mkdir(filesDir, { recursive: true })
    let downloadedCount = 0
    for (const file of files) {
      try {
        const { data: fileData } = await supabase.storage
          .from('construgest-files')
          .download(file.storage_path)
        if (fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer())
          await writeFile(join(filesDir, file.original_name), buffer)
          downloadedCount++
        }
      } catch {
        // Skip files that can't be downloaded
      }
    }

    // Write backup metadata
    const meta = {
      backup_date: new Date().toISOString(),
      project_id: projectId,
      project_name: project.name,
      tables: {
        budgets: budgets.length,
        chapters: allChapters.length,
        budget_items: allItems.length,
        measurements: allMeasurements.length,
        price_breakdowns: allBreakdowns.length,
        certifications: filteredCerts.length,
        work_logs: workLogs.length,
        expenses: 0,
        files: files.length,
        files_downloaded: downloadedCount,
      }
    }
    await writeFile(join(backupDir, '_backup_meta.json'), JSON.stringify(meta, null, 2), 'utf-8')

    res.json({ success: true, path: backupDir, meta })
  } catch (err) {
    next(err)
  }
})

// POST /api/projects/:id/restore - Restore project data from backup folder
router.post('/:id/restore', projectAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    const projectId = req.params.id

    const { data: project, error: projErr } = await supabase
      .from('cons_projects').select('*').eq('id', projectId).single()
    if (projErr) throw projErr

    if (!project.folder_path) {
      return res.status(400).json({ error: 'El proyecto no tiene carpeta asignada' })
    }

    const backupDir = join(project.folder_path, '_backup')

    // Read backup metadata
    let meta
    try {
      const metaRaw = await readFile(join(backupDir, '_backup_meta.json'), 'utf-8')
      meta = JSON.parse(metaRaw)
    } catch {
      return res.status(400).json({ error: 'No se encontró un backup válido en la carpeta del proyecto' })
    }

    // Helper to read JSON file
    const readJson = async (filename) => {
      try {
        const raw = await readFile(join(backupDir, filename), 'utf-8')
        return JSON.parse(raw)
      } catch {
        return []
      }
    }

    const restored = {}

    // Restore budgets
    const budgets = await readJson('budgets.json')
    if (budgets.length > 0) {
      const { error } = await supabase.from('cons_budgets').upsert(budgets, { onConflict: 'id' })
      if (error) console.warn('Restore budgets error:', error.message)
      restored.budgets = budgets.length
    }

    // Restore chapters
    const chapters = await readJson('chapters.json')
    if (chapters.length > 0) {
      const { error } = await supabase.from('cons_chapters').upsert(chapters, { onConflict: 'id' })
      if (error) console.warn('Restore chapters error:', error.message)
      restored.chapters = chapters.length
    }

    // Restore budget items
    const items = await readJson('budget_items.json')
    if (items.length > 0) {
      const { error } = await supabase.from('cons_budget_items').upsert(items, { onConflict: 'id' })
      if (error) console.warn('Restore items error:', error.message)
      restored.budget_items = items.length
    }

    // Restore measurements
    const measurements = await readJson('measurements.json')
    if (measurements.length > 0) {
      const { error } = await supabase.from('cons_measurements').upsert(measurements, { onConflict: 'id' })
      if (error) console.warn('Restore measurements error:', error.message)
      restored.measurements = measurements.length
    }

    // Restore price breakdowns
    const breakdowns = await readJson('price_breakdowns.json')
    if (breakdowns.length > 0) {
      const { error } = await supabase.from('cons_price_breakdown').upsert(breakdowns, { onConflict: 'id' })
      if (error) console.warn('Restore breakdowns error:', error.message)
      restored.price_breakdowns = breakdowns.length
    }

    // Restore work logs
    const workLogs = await readJson('work_logs.json')
    if (workLogs.length > 0) {
      const { error } = await supabase.from('cons_work_logs').upsert(workLogs, { onConflict: 'id' })
      if (error) console.warn('Restore work_logs error:', error.message)
      restored.work_logs = workLogs.length

      for (const table of ['work_log_labor', 'work_log_materials', 'work_log_equipment', 'work_log_budget_links']) {
        const data = await readJson(`${table}.json`)
        if (data.length > 0) {
          const { error } = await supabase.from(`cons_${table}`).upsert(data, { onConflict: 'id' })
          if (error) console.warn(`Restore ${table} error:`, error.message)
          restored[table] = data.length
        }
      }
    }

    // Restore expenses
    const expenses = await readJson('expenses.json')
    if (expenses.length > 0) {
      const { error } = await supabase.from('cons_project_expenses').upsert(expenses, { onConflict: 'id' })
      if (error) console.warn('Restore expenses error:', error.message)
      restored.expenses = expenses.length
    }

    // Restore certifications
    const certs = await readJson('certifications.json')
    if (certs.length > 0) {
      const { error } = await supabase.from('cons_certifications').upsert(certs, { onConflict: 'id' })
      if (error) console.warn('Restore certifications error:', error.message)
      restored.certifications = certs.length

      const certItems = await readJson('certification_items.json')
      if (certItems.length > 0) {
        const { error } = await supabase.from('cons_certification_items').upsert(certItems, { onConflict: 'id' })
        if (error) console.warn('Restore cert_items error:', error.message)
        restored.certification_items = certItems.length
      }
    }

    // Restore files to Supabase Storage
    const filesMeta = await readJson('files.json')
    const filesDir = join(backupDir, 'files')
    let uploadedCount = 0
    for (const fileMeta of filesMeta) {
      try {
        const localPath = join(filesDir, fileMeta.original_name)
        const buffer = await readFile(localPath)
        await supabase.storage
          .from('construgest-files')
          .upload(fileMeta.storage_path, buffer, {
            contentType: 'application/octet-stream',
            upsert: true,
          })
        uploadedCount++
      } catch {
        // Skip files that can't be uploaded
      }
    }

    // Restore file metadata
    if (filesMeta.length > 0) {
      const { error } = await supabase.from('cons_project_files').upsert(filesMeta, { onConflict: 'id' })
      if (error) console.warn('Restore files metadata error:', error.message)
      restored.files = filesMeta.length
      restored.files_uploaded = uploadedCount
    }

    res.json({ success: true, backup_date: meta.backup_date, restored })
  } catch (err) {
    next(err)
  }
})

// POST /api/projects/:id/sync-data - Sync project data JSON to local disk
router.post('/:id/sync-data', projectAccessMiddleware({ requireWrite: true }), async (req, res, next) => {
  try {
    const { folder_path, filename, data } = req.body
    if (!folder_path || !filename || data === undefined) {
      return res.status(400).json({ error: 'Se requiere folder_path, filename y data' })
    }
    const syncDir = join(folder_path, '_backup')
    await mkdir(syncDir, { recursive: true })
    await writeFile(join(syncDir, filename), JSON.stringify(data, null, 2), 'utf-8')
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'EPERM') {
      return res.status(400).json({ error: 'No se puede escribir en esta ruta' })
    }
    next(err)
  }
})

// POST /api/projects/:id/sync-file - Sync a file to local disk
router.post('/:id/sync-file', projectAccessMiddleware({ requireWrite: true }), upload.single('file'), async (req, res, next) => {
  try {
    const folderPath = req.body.folder_path
    const fileName = req.body.file_name
    if (!folderPath || !fileName || !req.file) {
      return res.status(400).json({ error: 'Se requiere folder_path, file_name y file' })
    }
    const filesDir = join(folderPath, '_backup', 'files')
    await mkdir(filesDir, { recursive: true })
    await writeFile(join(filesDir, fileName), req.file.buffer)
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'EPERM') {
      return res.status(400).json({ error: 'No se puede escribir en esta ruta' })
    }
    next(err)
  }
})

export default router
