import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { readdir, stat, readFile, writeFile, unlink } from 'fs/promises'
import { join, resolve, dirname, relative } from 'path'
import { fileURLToPath } from 'url'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/local.js'

const router = Router()

// ── PUBLIC: Installer download (no auth required) ──
// Collects all backend source files, creates a self-extracting .bat installer
async function collectBackendFiles(baseDir) {
  const files = []
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        await walk(fullPath)
      } else if (entry.name.endsWith('.js') || entry.name === 'package.json' || entry.name === 'package-lock.json') {
        const content = await readFile(fullPath)
        const relPath = relative(baseDir, fullPath).replace(/\\/g, '/')
        files.push({ path: relPath, content })
      }
    }
  }
  await walk(baseDir)
  return files
}

// Simple ZIP creator (no external deps)
function createZipBuffer(files) {
  const entries = []
  let offset = 0

  for (const { path, content } of files) {
    const nameBuffer = Buffer.from(path, 'utf-8')
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content)

    // Local file header
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0) // signature
    header.writeUInt16LE(20, 4) // version needed
    header.writeUInt16LE(0, 6) // flags
    header.writeUInt16LE(0, 8) // compression (store)
    header.writeUInt16LE(0, 10) // mod time
    header.writeUInt16LE(0, 12) // mod date
    // CRC32
    const crc = crc32(data)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(data.length, 18) // compressed size
    header.writeUInt32LE(data.length, 22) // uncompressed size
    header.writeUInt16LE(nameBuffer.length, 26) // file name length
    header.writeUInt16LE(0, 28) // extra field length

    entries.push({ header, nameBuffer, data, offset, crc })
    offset += 30 + nameBuffer.length + data.length
  }

  // Central directory
  const centralEntries = []
  for (const entry of entries) {
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0) // signature
    cd.writeUInt16LE(20, 4) // version made by
    cd.writeUInt16LE(20, 6) // version needed
    cd.writeUInt16LE(0, 8) // flags
    cd.writeUInt16LE(0, 10) // compression
    cd.writeUInt16LE(0, 12) // mod time
    cd.writeUInt16LE(0, 14) // mod date
    cd.writeUInt32LE(entry.crc, 16)
    cd.writeUInt32LE(entry.data.length, 20) // compressed
    cd.writeUInt32LE(entry.data.length, 24) // uncompressed
    cd.writeUInt16LE(entry.nameBuffer.length, 28)
    cd.writeUInt16LE(0, 30) // extra length
    cd.writeUInt16LE(0, 32) // comment length
    cd.writeUInt16LE(0, 34) // disk start
    cd.writeUInt16LE(0, 36) // internal attrs
    cd.writeUInt32LE(0, 38) // external attrs
    cd.writeUInt32LE(entry.offset, 42) // local header offset
    centralEntries.push(Buffer.concat([cd, entry.nameBuffer]))
  }

  const centralDir = Buffer.concat(centralEntries)
  const centralDirOffset = offset

  // End of central directory
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4) // disk number
  eocd.writeUInt16LE(0, 6) // disk with cd
  eocd.writeUInt16LE(entries.length, 8) // entries on disk
  eocd.writeUInt16LE(entries.length, 10) // total entries
  eocd.writeUInt32LE(centralDir.length, 12) // cd size
  eocd.writeUInt32LE(centralDirOffset, 16) // cd offset
  eocd.writeUInt16LE(0, 20) // comment length

  const parts = []
  for (const entry of entries) {
    parts.push(entry.header, entry.nameBuffer, entry.data)
  }
  parts.push(centralDir, eocd)

  return Buffer.concat(parts)
}

// CRC32 lookup table
const crc32Table = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  crc32Table[i] = c
}
function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = crc32Table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

router.get('/installer', async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || ''
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    const JWT_SECRET = process.env.JWT_SECRET || ''
    // Always use production URL for the installer (not localhost)
    const FRONTEND_URL = (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost'))
      ? process.env.FRONTEND_URL
      : 'https://construgest-web.vercel.app'

    // Find backend root (this file is in backend/src/routes/)
    const __filename = fileURLToPath(import.meta.url)
    const cleanRoot = resolve(dirname(__filename), '..', '..')

    const files = await collectBackendFiles(cleanRoot)

    // Create ZIP and base64 encode it
    const zipBuffer = createZipBuffer(files)
    const zipB64 = zipBuffer.toString('base64')

    // Split base64 into lines of 76 chars for certutil compatibility
    const b64Lines = zipB64.match(/.{1,76}/g).join('\n')

    const bat = `@echo off
chcp 65001 >nul
title ConstruGest - Instalador
echo.
echo  ==========================================
echo   ConstruGest - Instalador de Escritorio
echo  ==========================================
echo.

:: Verificar Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Node.js no esta instalado.
    echo  Abriendo la pagina de descarga...
    start https://nodejs.org
    echo.
    echo  Instala Node.js y vuelve a ejecutar este instalador.
    pause
    exit /b 1
)
echo  [OK] Node.js encontrado.

set "INSTALL_DIR=%LOCALAPPDATA%\\ConstruGest"
set "BACKEND_DIR=%INSTALL_DIR%\\backend"

:: Crear directorio de instalacion
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if exist "%BACKEND_DIR%\\src" rmdir /s /q "%BACKEND_DIR%\\src" 2>nul

echo  [1/5] Extrayendo archivos del backend (${files.length} archivos)...
:: Escribir datos base64 del ZIP embebido
> "%INSTALL_DIR%\\backend.b64" (
echo -----BEGIN CERTIFICATE-----
echo ${b64Lines.split('\n').join('\necho ')}
echo -----END CERTIFICATE-----
)
:: Decodificar base64 a ZIP usando certutil
certutil -decode "%INSTALL_DIR%\\backend.b64" "%INSTALL_DIR%\\backend.zip" >nul 2>&1
del "%INSTALL_DIR%\\backend.b64" 2>nul
:: Extraer ZIP
powershell -Command "Expand-Archive -Path '%INSTALL_DIR%\\backend.zip' -DestinationPath '%BACKEND_DIR%' -Force"
del "%INSTALL_DIR%\\backend.zip" 2>nul
echo  [OK] Archivos extraidos.

echo  [2/5] Configurando variables de entorno...
:: Generar .env
(
echo PORT=5000
echo FRONTEND_URL=${FRONTEND_URL}
echo SUPABASE_URL=${SUPABASE_URL}
echo SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_KEY}
echo JWT_SECRET=${JWT_SECRET}
) > "%BACKEND_DIR%\\.env"
echo  [OK] Configuracion creada.

echo  [3/5] Instalando dependencias...
cd /d "%BACKEND_DIR%"
call npm install --production --silent 2>nul
echo  [OK] Dependencias instaladas.

echo  [4/5] Configurando arranque automatico...
:: Crear script VBS de arranque silencioso
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%BACKEND_DIR%"
echo WshShell.Run "cmd /c node src/app.js ^> backend.log 2^>^&1", 0, False
) > "%BACKEND_DIR%\\start-local.vbs"

:: Crear acceso directo en Startup (arranque con Windows)
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Startup') + '\\ConstruGest-Backend.lnk'); $s.TargetPath = '%BACKEND_DIR%\\start-local.vbs'; $s.WorkingDirectory = '%BACKEND_DIR%'; $s.Description = 'ConstruGest Backend Local'; $s.Save()" >nul 2>&1

:: Crear acceso directo en Escritorio (abre como PWA)
:: Buscar Chrome o Edge para modo --app (PWA)
powershell -Command "$desk = [Environment]::GetFolderPath('Desktop'); $ws = New-Object -ComObject WScript.Shell; $chrome = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe' -EA 0).'(default)'; $edge = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe' -EA 0).'(default)'; $browser = if ($chrome) { $chrome } elseif ($edge) { $edge } else { $null }; if ($browser) { $s = $ws.CreateShortcut($desk + '\\ConstruGest.lnk'); $s.TargetPath = $browser; $s.Arguments = '--app=${FRONTEND_URL}'; $s.Description = 'ConstruGest - Gestion de Proyectos'; $s.IconLocation = $browser + ',0'; $s.Save() } else { $s = $ws.CreateShortcut($desk + '\\ConstruGest.lnk'); $s.TargetPath = '${FRONTEND_URL}'; $s.Description = 'ConstruGest - Gestion de Proyectos'; $s.Save() }" >nul 2>&1

:: Crear desinstalador
(
echo @echo off
echo title ConstruGest - Desinstalar
echo echo.
echo echo  Desinstalando ConstruGest...
echo echo.
echo for /f "tokens=5" %%%%a in ^('netstat -ano ^^^| findstr ":5000" ^^^| findstr "LISTENING"'^) do taskkill /PID %%%%a /F ^>nul 2^>^&1
echo del "%%APPDATA%%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\ConstruGest-Backend.lnk" 2^>nul
echo del "%%USERPROFILE%%\\Desktop\\ConstruGest.lnk" 2^>nul
echo rmdir /s /q "%INSTALL_DIR%" 2^>nul
echo echo  [OK] ConstruGest desinstalado completamente.
echo pause
) > "%INSTALL_DIR%\\Desinstalar-ConstruGest.bat"

echo  [OK] Arranque automatico configurado.

echo  [5/5] Iniciando backend...
:: Arrancar backend en segundo plano
start "" wscript.exe "%BACKEND_DIR%\\start-local.vbs"
timeout /t 2 /nobreak >nul
echo  [OK] Backend iniciado en segundo plano.

echo.
echo  ==========================================
echo   Instalacion completada!
echo  ==========================================
echo.
echo  - Acceso directo "ConstruGest" creado en el Escritorio
echo  - El backend local se inicia con Windows automaticamente
echo  - Puedes borrar este archivo de instalacion
echo  - Para desinstalar: %INSTALL_DIR%\\Desinstalar-ConstruGest.bat
echo.
echo  Abriendo ConstruGest...
start ${FRONTEND_URL}
echo.
pause
`

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', 'attachment; filename=ConstruGest-Setup.bat')
    res.send(bat)
  } catch (err) {
    console.error('Installer generation error:', err)
    res.status(500).json({ error: 'Error generating installer' })
  }
})

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
