import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { readdir, stat, writeFile, unlink } from 'fs/promises'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

const router = Router()


router.use(authMiddleware)

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Solo se permiten imágenes'))
  },
})

// Agrupación de settings por sección. (La sección "ai" de claves cloud se eliminó:
// la IA es 100% local, sin claves ni proveedores externos que configurar.)
const SECTIONS = {
  company: [
    'company_name', 'company_cif', 'company_address', 'company_city',
    'company_province', 'company_postal_code', 'company_phone',
    'company_email', 'company_web', 'company_iban',
    'company_professional_number', 'company_logo_url',
  ],
  defaults: ['tax_rate', 'overhead_pct', 'profit_pct', 'currency', 'default_folder_path'],
  appearance: ['theme', 'language'],
  print: [
    'default_format', 'default_orientation',
    'default_margin_top', 'default_margin_bottom',
    'default_margin_left', 'default_margin_right',
  ],
  pdf_styles: [
    'pdf_color_primary', 'pdf_color_accent', 'pdf_color_text', 'pdf_color_muted', 'pdf_color_row_alt',
    'pdf_header_shadow', 'pdf_row_striping',
    'pdf_logo_width', 'pdf_logo_align',
    'pdf_font_family',
    'pdf_title_size', 'pdf_subtitle_size', 'pdf_table_header_size', 'pdf_body_size',
    'pdf_top_bar_height',
  ],
}

// GET /api/settings/organization/:orgId
router.get('/organization/:orgId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_app_settings')
      .select('key, value')
      .eq('organization_id', req.params.orgId)

    if (error) throw error

    // Group into sections
    const flat = Object.fromEntries((data || []).map(r => [r.key, r.value]))
    const result = {}

    for (const [section, keys] of Object.entries(SECTIONS)) {
      result[section] = {}
      for (const key of keys) {
        if (flat[key] !== undefined) {
          // Parse booleans and numbers
          let val = flat[key]
          if (val === 'true') val = true
          else if (val === 'false') val = false
          else if (!isNaN(Number(val)) && val !== '') val = Number(val)
          result[section][key] = val
        }
      }
    }

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// PUT /api/settings/organization/:orgId
router.put('/organization/:orgId', async (req, res, next) => {
  try {
    const orgId = req.params.orgId
    const body = req.body // { company: {...}, defaults: {...}, ai: {...}, appearance: {...} }

    // Flatten all sections into key-value pairs
    const pairs = []
    for (const [section, keys] of Object.entries(SECTIONS)) {
      const sectionData = body[section]
      if (!sectionData) continue
      for (const key of keys) {
        if (sectionData[key] !== undefined) {
          pairs.push({ key, value: String(sectionData[key]) })
        }
      }
    }

    // Upsert each pair
    for (const { key, value } of pairs) {
      const { data: existing } = await supabase
        .from('cons_app_settings')
        .select('id')
        .eq('organization_id', orgId)
        .eq('key', key)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase
          .from('cons_app_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('id', existing[0].id)
      } else {
        await supabase
          .from('cons_app_settings')
          .insert({ organization_id: orgId, key, value })
      }
    }

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ── Logo upload / delete ──

// Helper: upsert a setting key
async function upsertSetting(orgId, key, value) {
  const { data: existing } = await supabase
    .from('cons_app_settings')
    .select('id')
    .eq('organization_id', orgId)
    .eq('key', key)
    .limit(1)

  if (existing && existing.length > 0) {
    await supabase
      .from('cons_app_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('id', existing[0].id)
  } else {
    await supabase
      .from('cons_app_settings')
      .insert({ organization_id: orgId, key, value })
  }
}

// POST /api/settings/logo/upload
router.post('/logo/upload', logoUpload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha proporcionado ninguna imagen' })
    }

    const orgId = req.body.organization_id
    if (!orgId) {
      return res.status(400).json({ error: 'organization_id es requerido' })
    }

    const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'png'
    const storagePath = `logos/${orgId}/logo_${randomUUID()}.${ext}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('construgest-files')
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      })

    if (uploadError) throw uploadError

    // Generate signed URL (30 days)
    const { data: signedUrl, error: urlError } = await supabase.storage
      .from('construgest-files')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 30)

    if (urlError) throw urlError

    const logoUrl = signedUrl.signedUrl

    // Save the storage path AND signed URL in settings
    await upsertSetting(orgId, 'company_logo_url', logoUrl)
    await upsertSetting(orgId, 'company_logo_path', storagePath)

    res.json({ url: logoUrl })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/settings/logo
router.delete('/logo', async (req, res, next) => {
  try {
    const orgId = req.query.organization_id
    if (!orgId) {
      return res.status(400).json({ error: 'organization_id es requerido' })
    }

    // Read current storage path
    const { data: pathRow } = await supabase
      .from('cons_app_settings')
      .select('value')
      .eq('organization_id', orgId)
      .eq('key', 'company_logo_path')
      .limit(1)

    if (pathRow && pathRow.length > 0 && pathRow[0].value) {
      // Delete from storage
      await supabase.storage
        .from('construgest-files')
        .remove([pathRow[0].value])
    }

    // Clear settings
    await upsertSetting(orgId, 'company_logo_url', '')
    await upsertSetting(orgId, 'company_logo_path', '')

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// GET /api/settings/browse-directories - List directories at a given path
router.get('/browse-directories', async (req, res, next) => {
  try {
    const defaultRoot = process.platform === 'win32' ? 'C:\\' : '/'
    const rawPath = req.query.path || defaultRoot
    // Use the path as-is on Windows, resolve only on matching platform
    const requestedPath = rawPath.match(/^[A-Za-z]:/) && process.platform !== 'win32'
      ? rawPath  // Windows path on Linux - use as-is (will fail with ENOENT)
      : resolve(rawPath)

    const parentPath = dirname(requestedPath)
    const isRoot = parentPath === requestedPath

    const entries = await readdir(requestedPath, { withFileTypes: true })
    const dirs = []

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('$')) {
        const fullPath = join(requestedPath, entry.name)
        let hasChildren = false
        try {
          const sub = await readdir(fullPath, { withFileTypes: true })
          hasChildren = sub.some(s => s.isDirectory())
        } catch {
          // Permission denied - skip
        }
        dirs.push({ name: entry.name, path: fullPath, hasChildren })
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name))
    res.json({ path: requestedPath, parent: isRoot ? null : parentPath, directories: dirs })
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'EPERM') {
      return res.status(400).json({ error: 'No se puede acceder a esta ruta' })
    }
    next(err)
  }
})

// POST /api/settings/verify-path - Verify a folder path exists and is writable
router.post('/verify-path', async (req, res, next) => {
  try {
    const { path: targetPath } = req.body
    if (!targetPath) return res.status(400).json({ valid: false, message: 'Ruta no proporcionada' })

    const resolved = resolve(targetPath)
    const info = await stat(resolved)
    if (!info.isDirectory()) {
      return res.json({ valid: false, message: 'La ruta no es un directorio' })
    }
    // Test writability
    const testFile = join(resolved, `.construgest_test_${Date.now()}`)
    await writeFile(testFile, '')
    await unlink(testFile)
    return res.json({ valid: true, message: 'Ruta válida y con permisos de escritura' })
  } catch (err) {
    if (err.code === 'ENOENT') return res.json({ valid: false, message: 'La ruta no existe' })
    if (err.code === 'EACCES' || err.code === 'EPERM') return res.json({ valid: false, message: 'Sin permisos de escritura' })
    return res.json({ valid: false, message: err.message })
  }
})

export default router
