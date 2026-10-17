// ============================================================================
// Copias de seguridad de un proyecto en su carpeta local (<folder_path>/_backup).
//
//  - backupProject(): vuelca TODOS los datos del proyecto a JSON + sus ficheros.
//    Se escribe en una carpeta temporal y se cambia por la buena al final, para
//    que un backup a medias nunca sustituya a uno bueno.
//  - restoreProject(): SUSTITUYE los datos actuales del proyecto por los del
//    backup (decisión de Benjamin, 2026-10-17). Antes guarda una copia del estado
//    actual en <folder_path>/_backup_antes_de_restaurar_<fecha>. Todo el cambio en
//    BD va en UNA transacción: si algo falla, el proyecto queda como estaba.
//  - readBackupInfo(): fecha y recuentos del backup de una carpeta.
//
// Va directo a MariaDB (pool) y no por db/local.js: necesita transacción, IN de
// listas largas y saber las columnas reales de cada tabla (los backups de la
// época de Supabase traen columnas que aquí ya no existen).
// ============================================================================
import { mkdir, writeFile, readFile, rm, rename, access } from 'fs/promises'
import { join, normalize, dirname } from 'path'
import pool from '../db/mariadb.js'
import storage from '../db/storage.js'
import { normVal } from '../db/local.js'

const BUCKET = 'construgest-files'
const BACKUP_DIR = '_backup'
const META_FILE = '_backup_meta.json'
// 1 (o sin campo) = backups de la época Supabase; 2 = este formato.
const BACKUP_FORMAT = 2

// Tablas del backup y su fichero. El ORDEN es el de inserción al restaurar
// (padres antes que hijos). Los nombres de fichero son los del formato antiguo
// para poder restaurar también los backups de la época de la nube.
const TABLES = [
  ['cons_project_files', 'files.json'],
  ['cons_plan_annotations', 'plan_annotations.json'],
  ['cons_plan_calibrations', 'plan_calibrations.json'],
  ['cons_plan_extractions', 'plan_extractions.json'],
  ['cons_budgets', 'budgets.json'],
  ['cons_chapters', 'chapters.json'],
  ['cons_budget_items', 'budget_items.json'],
  ['cons_measurements', 'measurements.json'],
  ['cons_price_breakdown', 'price_breakdowns.json'],
  ['cons_budget_comparison_groups', 'budget_comparison_groups.json'],
  ['cons_budget_comparison_group_items', 'budget_comparison_group_items.json'],
  ['cons_budget_comparison_exclusions', 'budget_comparison_exclusions.json'],
  ['cons_certifications', 'certifications.json'],
  ['cons_certification_items', 'certification_items.json'],
  ['cons_work_logs', 'work_logs.json'],
  ['cons_work_log_labor', 'work_log_labor.json'],
  ['cons_work_log_materials', 'work_log_materials.json'],
  ['cons_work_log_equipment', 'work_log_equipment.json'],
  ['cons_work_log_budget_links', 'work_log_budget_links.json'],
  ['cons_certification_work_log_links', 'certification_work_log_links.json'],
  ['cons_project_expenses', 'expenses.json'],
]

// Columnas del proyecto que NO se restauran (identidad, dueño, carpeta, papelera).
const PROJECT_KEEP = new Set(['id', 'organization_id', 'created_by', 'created_at', 'folder_path', 'deleted_at', 'deleted_by'])

function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}

const ids = (rows, col = 'id') => [...new Set(rows.map((r) => r[col]).filter(Boolean))]

async function q(conn, sql, params = []) {
  const [rows] = await conn.query(sql, params)
  return rows
}

// SELECT * FROM t WHERE col IN (...) — vacío si no hay ids.
async function whereIn(conn, table, col, list) {
  if (!list.length) return []
  return q(conn, `SELECT * FROM \`${table}\` WHERE \`${col}\` IN (?)`, [list])
}

// SELECT * FROM t WHERE colA IN (a) OR colB IN (b), ignorando las listas vacías.
async function whereInAny(conn, table, pairs) {
  const parts = []; const params = []
  for (const [col, list] of pairs) {
    if (list.length) { parts.push(`\`${col}\` IN (?)`); params.push(list) }
  }
  if (!parts.length) return []
  return q(conn, `SELECT * FROM \`${table}\` WHERE ${parts.join(' OR ')}`, params)
}

/** Lee de BD todo lo que cuelga del proyecto. Devuelve { project, data: {fichero: filas} }. */
async function collectProjectData(conn, projectId) {
  const [project] = await q(conn, 'SELECT * FROM cons_projects WHERE id = ?', [projectId])
  if (!project) throw httpError(404, 'Proyecto no encontrado')

  const d = {}
  d['files.json'] = await q(conn, 'SELECT * FROM cons_project_files WHERE project_id = ?', [projectId])
  const fileIds = ids(d['files.json'])
  d['plan_annotations.json'] = await whereIn(conn, 'cons_plan_annotations', 'file_id', fileIds)
  d['plan_calibrations.json'] = await whereIn(conn, 'cons_plan_calibrations', 'file_id', fileIds)
  d['plan_extractions.json'] = await q(conn, 'SELECT * FROM cons_plan_extractions WHERE project_id = ?', [projectId])

  d['budgets.json'] = await q(conn, 'SELECT * FROM cons_budgets WHERE project_id = ?', [projectId])
  const budgetIds = ids(d['budgets.json'])
  d['chapters.json'] = await whereIn(conn, 'cons_chapters', 'budget_id', budgetIds)
  d['budget_items.json'] = await whereIn(conn, 'cons_budget_items', 'chapter_id', ids(d['chapters.json']))
  const itemIds = ids(d['budget_items.json'])
  d['measurements.json'] = await whereIn(conn, 'cons_measurements', 'budget_item_id', itemIds)
  d['price_breakdowns.json'] = await whereIn(conn, 'cons_price_breakdown', 'budget_item_id', itemIds)

  d['budget_comparison_groups.json'] = await whereInAny(conn, 'cons_budget_comparison_groups', [['budget_a_id', budgetIds], ['budget_b_id', budgetIds]])
  d['budget_comparison_group_items.json'] = await whereIn(conn, 'cons_budget_comparison_group_items', 'group_id', ids(d['budget_comparison_groups.json']))
  d['budget_comparison_exclusions.json'] = await whereInAny(conn, 'cons_budget_comparison_exclusions', [['budget_a_id', budgetIds], ['budget_b_id', budgetIds]])

  d['certifications.json'] = await whereIn(conn, 'cons_certifications', 'budget_id', budgetIds)
  const certIds = ids(d['certifications.json'])
  d['certification_items.json'] = await whereIn(conn, 'cons_certification_items', 'certification_id', certIds)

  d['work_logs.json'] = await q(conn, 'SELECT * FROM cons_work_logs WHERE project_id = ?', [projectId])
  const wlIds = ids(d['work_logs.json'])
  d['work_log_labor.json'] = await whereIn(conn, 'cons_work_log_labor', 'work_log_id', wlIds)
  d['work_log_materials.json'] = await whereIn(conn, 'cons_work_log_materials', 'work_log_id', wlIds)
  d['work_log_equipment.json'] = await whereIn(conn, 'cons_work_log_equipment', 'work_log_id', wlIds)
  d['work_log_budget_links.json'] = await whereIn(conn, 'cons_work_log_budget_links', 'work_log_id', wlIds)
  d['certification_work_log_links.json'] = await whereInAny(conn, 'cons_certification_work_log_links', [['certification_id', certIds], ['work_log_id', wlIds]])

  d['expenses.json'] = await q(conn, 'SELECT * FROM cons_project_expenses WHERE project_id = ?', [projectId])
  return { project, data: d }
}

// Ruta de un fichero de storage dentro de <backup>/files, sin poder salirse de ahí.
function storageFileInBackup(dir, storagePath) {
  const rel = normalize(String(storagePath)).replace(/^([\\/])+/, '')
  if (!rel || rel.startsWith('..')) return null
  return join(dir, 'files', rel)
}

// Rutas de storage de un fichero de proyecto: el fichero y, si es DXF/DWG, su SVG.
const storagePathsOf = (f) => [f.storage_path, f.dxf_svg_path].filter(Boolean)

/** Escribe el backup completo del proyecto en `dir` (que se crea). */
async function writeBackupTo(dir, projectId) {
  const conn = await pool.getConnection()
  let collected
  try {
    collected = await collectProjectData(conn, projectId)
  } finally {
    conn.release()
  }
  const { project, data } = collected

  await mkdir(join(dir, 'files'), { recursive: true })
  await writeFile(join(dir, 'project.json'), JSON.stringify(project, null, 2), 'utf-8')
  const counts = {}
  for (const [, file] of TABLES) {
    await writeFile(join(dir, file), JSON.stringify(data[file] || [], null, 2), 'utf-8')
    counts[file.replace('.json', '')] = (data[file] || []).length
  }

  // Ficheros reales (planos, fotos, PDF…), guardados con su ruta de storage.
  let saved = 0; const missing = []
  for (const f of data['files.json']) {
    for (const sp of storagePathsOf(f)) {
      const target = storageFileInBackup(dir, sp)
      const { data: blob } = await storage.from(BUCKET).download(sp)
      if (!target || !blob) { missing.push(sp); continue }
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, Buffer.from(await blob.arrayBuffer()))
      saved++
    }
  }

  const meta = {
    format: BACKUP_FORMAT,
    backup_date: new Date().toISOString(),
    project_id: projectId,
    project_name: project.name,
    project,
    tables: counts,
    files_saved: saved,
    files_missing: missing,
  }
  // El meta va el ÚLTIMO: una carpeta sin meta no se considera un backup válido.
  await writeFile(join(dir, META_FILE), JSON.stringify(meta, null, 2), 'utf-8')
  return meta
}

const exists = (p) => access(p).then(() => true, () => false)
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)

/**
 * Backup del proyecto en <folder_path>/_backup. Se escribe en una carpeta temporal
 * y solo al terminar bien sustituye a la anterior.
 */
export async function backupProject(projectId, folderPath) {
  if (!folderPath) throw httpError(400, 'El proyecto no tiene carpeta asignada')
  await mkdir(folderPath, { recursive: true })
  const finalDir = join(folderPath, BACKUP_DIR)
  const tmpDir = join(folderPath, `${BACKUP_DIR}.tmp-${Date.now()}`)
  const oldDir = join(folderPath, `${BACKUP_DIR}.old-${Date.now()}`)
  try {
    const meta = await writeBackupTo(tmpDir, projectId)
    const hadOld = await exists(finalDir)
    if (hadOld) await rename(finalDir, oldDir)
    await rename(tmpDir, finalDir)
    if (hadOld) await rm(oldDir, { recursive: true, force: true })
    return { path: finalDir, meta }
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    throw err
  }
}

/** Fecha y recuentos del backup de una carpeta de proyecto (null si no hay). */
export async function readBackupInfo(folderPath) {
  if (!folderPath) return null
  try {
    const meta = JSON.parse(await readFile(join(folderPath, BACKUP_DIR, META_FILE), 'utf-8'))
    return {
      backup_date: meta.backup_date || null,
      format: meta.format || 1,
      project_id: meta.project_id || null,
      tables: meta.tables || {},
    }
  } catch {
    return null
  }
}

// ── Restaurar ────────────────────────────────────────────────────────────────

async function readJson(dir, file) {
  try {
    const v = JSON.parse(await readFile(join(dir, file), 'utf-8'))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** Columnas reales de una tabla (los backups antiguos traen columnas que ya no existen). */
async function columnsOf(conn, table, cache) {
  if (!cache[table]) {
    const rows = await q(conn, `SHOW COLUMNS FROM \`${table}\``)
    cache[table] = new Set(rows.map((r) => r.Field))
  }
  return cache[table]
}

async function insertRow(conn, table, row, cols) {
  const keys = Object.keys(row).filter((k) => cols.has(k) && row[k] !== undefined)
  if (!keys.length) return
  const sql = `INSERT INTO \`${table}\` (${keys.map((k) => '`' + k + '`').join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  await conn.query(sql, keys.map((k) => normVal(row[k])))
}

// Ids de `table` que existen hoy en BD, de entre los de `list`.
async function existingIds(conn, table, list) {
  if (!list.length) return new Set()
  const rows = await q(conn, `SELECT id FROM \`${table}\` WHERE id IN (?)`, [list])
  return new Set(rows.map((r) => r.id))
}

/** Borra de BD todo lo que cuelga del proyecto (no el proyecto). */
async function deleteProjectData(conn, projectId) {
  const budgetIds = ids(await q(conn, 'SELECT id FROM cons_budgets WHERE project_id = ?', [projectId]))
  const wlIds = ids(await q(conn, 'SELECT id FROM cons_work_logs WHERE project_id = ?', [projectId]))
  const certIds = budgetIds.length
    ? ids(await q(conn, 'SELECT id FROM cons_certifications WHERE budget_id IN (?)', [budgetIds]))
    : []

  // El enlace certificación↔parte tiene ON DELETE RESTRICT hacia el parte: va primero.
  const links = await whereInAny(conn, 'cons_certification_work_log_links', [['certification_id', certIds], ['work_log_id', wlIds]])
  if (links.length) await q(conn, 'DELETE FROM cons_certification_work_log_links WHERE id IN (?)', [ids(links)])
  // Los gastos apuntan a capítulos sin cascada.
  await q(conn, 'DELETE FROM cons_project_expenses WHERE project_id = ?', [projectId])
  // Auto-referencias: se sueltan antes de borrar para que la cascada no tropiece.
  if (budgetIds.length) await q(conn, 'UPDATE cons_chapters SET parent_id = NULL WHERE budget_id IN (?)', [budgetIds])
  await q(conn, 'UPDATE cons_project_files SET parent_file_id = NULL WHERE project_id = ?', [projectId])
  // El resto cae en cascada (capítulos, partidas, mediciones, certificaciones,
  // líneas de parte, anotaciones de planos…).
  await q(conn, 'DELETE FROM cons_budgets WHERE project_id = ?', [projectId])
  await q(conn, 'DELETE FROM cons_work_logs WHERE project_id = ?', [projectId])
  await q(conn, 'DELETE FROM cons_plan_extractions WHERE project_id = ?', [projectId])
  await q(conn, 'DELETE FROM cons_project_files WHERE project_id = ?', [projectId])
}

/**
 * Sustituye los datos del proyecto por los de su backup. Devuelve un resumen.
 * Lanza 400 si no hay backup o si el backup es de otro proyecto.
 */
export async function restoreProject(projectId, folderPath) {
  if (!folderPath) throw httpError(400, 'El proyecto no tiene carpeta asignada')
  const dir = join(folderPath, BACKUP_DIR)

  let meta
  try {
    meta = JSON.parse(await readFile(join(dir, META_FILE), 'utf-8'))
  } catch {
    throw httpError(400, 'No se encontró un backup válido en la carpeta del proyecto')
  }
  if (meta.project_id && meta.project_id !== projectId) {
    throw httpError(400, 'El backup de esta carpeta pertenece a otro proyecto')
  }

  const data = {}
  for (const [, file] of TABLES) data[file] = await readJson(dir, file)

  // 1) Copia del estado actual, por si hay que deshacer.
  const safetyDir = join(folderPath, `${BACKUP_DIR}_antes_de_restaurar_${stamp()}`)
  await writeBackupTo(safetyDir, projectId)

  // 2) Sustituir en BD, todo o nada.
  const conn = await pool.getConnection()
  const restored = {}
  const warnings = []
  try {
    await conn.beginTransaction()
    await deleteProjectData(conn, projectId)

    const cache = {}
    // Referencias a tablas de FUERA del proyecto que pueden haber desaparecido
    // desde el backup: se dejan a NULL en vez de tumbar la restauración.
    const materialIds = await existingIds(conn, 'cons_materials', ids(data['price_breakdowns.json'], 'material_id'))
    const supplierIds = await existingIds(conn, 'cons_suppliers', ids(data['expenses.json'], 'supplier_id'))
    const budgetIdsInBackup = new Set(ids(data['budgets.json']))

    for (const [table, file] of TABLES) {
      const cols = await columnsOf(conn, table, cache)
      let rows = data[file].map((r) => ({ ...r }))
      if (cols.has('project_id')) rows.forEach((r) => { r.project_id = projectId })

      if (table === 'cons_price_breakdown') {
        rows.forEach((r) => { if (r.material_id && !materialIds.has(r.material_id)) { r.material_id = null; warnings.push('price_breakdown.material_id') } })
      }
      if (table === 'cons_project_expenses') {
        rows.forEach((r) => { if (r.supplier_id && !supplierIds.has(r.supplier_id)) { r.supplier_id = null; warnings.push('expenses.supplier_id') } })
      }
      // Comparaciones con un presupuesto de OTRO proyecto: solo si ese sigue existiendo.
      if (table === 'cons_budget_comparison_groups' || table === 'cons_budget_comparison_exclusions') {
        const others = ids(rows, 'budget_a_id').concat(ids(rows, 'budget_b_id')).filter((x) => !budgetIdsInBackup.has(x))
        const alive = await existingIds(conn, 'cons_budgets', others)
        rows = rows.filter((r) => [r.budget_a_id, r.budget_b_id].every((b) => budgetIdsInBackup.has(b) || alive.has(b)))
      }
      if (table === 'cons_budget_comparison_group_items') {
        const groups = new Set(ids(data['budget_comparison_groups.json']))
        const items = await existingIds(conn, 'cons_budget_items', ids(rows, 'item_id'))
        rows = rows.filter((r) => groups.has(r.group_id) && items.has(r.item_id))
      }

      // Auto-referencias: se insertan sin padre y se enlazan después.
      const selfCol = table === 'cons_chapters' ? 'parent_id' : table === 'cons_project_files' ? 'parent_file_id' : null
      for (const r of rows) {
        const row = selfCol ? { ...r, [selfCol]: null } : r
        try {
          await insertRow(conn, table, row, cols)
        } catch (e) {
          throw httpError(400, `No se pudo restaurar ${table} (${e.code || e.message}): ${e.sqlMessage || e.message}`)
        }
      }
      if (selfCol) {
        for (const r of rows) {
          if (r[selfCol]) await q(conn, `UPDATE \`${table}\` SET \`${selfCol}\` = ? WHERE id = ?`, [r[selfCol], r.id])
        }
      }
      if (rows.length) restored[file.replace('.json', '')] = rows.length
    }

    // Datos del propio proyecto (nombre, cliente, dirección…), solo en backups nuevos.
    if (meta.project) {
      const cols = await columnsOf(conn, 'cons_projects', cache)
      const keys = Object.keys(meta.project).filter((k) => cols.has(k) && !PROJECT_KEEP.has(k))
      if (keys.length) {
        await q(conn,
          `UPDATE cons_projects SET ${keys.map((k) => '`' + k + '` = ?').join(', ')} WHERE id = ?`,
          [...keys.map((k) => normVal(meta.project[k])), projectId])
      }
    }

    await conn.commit()
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }

  // 3) Ficheros a storage (fuera de la transacción; si falta alguno se informa).
  let filesRestored = 0; const filesMissing = []
  for (const f of data['files.json']) {
    for (const sp of storagePathsOf(f)) {
      // Formato nuevo: files/<storage_path>. Formato nube: files/<original_name>.
      const candidates = [storageFileInBackup(dir, sp)]
      if (sp === f.storage_path && f.original_name) candidates.push(join(dir, 'files', String(f.original_name)))
      let buf = null
      for (const c of candidates.filter(Boolean)) {
        try { buf = await readFile(c); break } catch { /* siguiente */ }
      }
      if (!buf) { filesMissing.push(sp); continue }
      const { error } = await storage.from(BUCKET).upload(sp, buf, { upsert: true })
      if (error) filesMissing.push(sp)
      else filesRestored++
    }
  }

  return {
    backup_date: meta.backup_date || null,
    format: meta.format || 1,
    restored,
    files_restored: filesRestored,
    files_missing: filesMissing,
    warnings: [...new Set(warnings)],
    safety_copy: safetyDir,
  }
}
