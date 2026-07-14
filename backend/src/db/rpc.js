// ============================================================================
// Reimplementación en Node de las funciones RPC de Postgres que el backend
// llamaba vía supabase.rpc(...). Fuente original (PL/pgSQL):
//   docs/schema/raw/rpc-functions.postgres.sql
//
// Cubre las funciones que usan las rutas equipmentCatalog / subcontractors /
// workers. Las cuotas de IA (mcp_check_quota / mcp_check_and_record_usage) NO se
// reimplementan aquí todavía: las usa ai.js, que sigue en Supabase (se hará al
// migrar la IA). Si se invoca una RPC no implementada, se devuelve un error claro.
//
// Se despacha desde el shim (db/local.js) con .rpc(nombre, params) y devuelve
// siempre { data, error }, igual que @supabase/supabase-js.
// ============================================================================
import { randomUUID } from 'crypto'
import pool from './mariadb.js'

const qi = (id) => '`' + String(id).replace(/`/g, '') + '`'

// --- Normalizadores de valores de entrada (p_data del RPC) -------------------

// Texto/valor tal cual; undefined -> null.
const val = (v) => (v === undefined ? null : v)

// Numérico con default (COALESCE((..)::numeric, def)).
function num(v, def = 0) {
  if (v === undefined || v === null || v === '') return def
  const n = Number(v)
  return Number.isNaN(n) ? def : n
}

// Booleano -> 1/0 con default (COALESCE((..)::boolean, def)).
function bool(v, def) {
  if (v === undefined || v === null || v === '') return def ? 1 : 0
  if (v === true || v === 'true' || v === 1 || v === '1') return 1
  if (v === false || v === 'false' || v === 0 || v === '0') return 0
  return def ? 1 : 0
}

// DATE (::date): '' / null -> null; ISO/fecha -> 'YYYY-MM-DD'.
function date(v) {
  if (v === undefined || v === null || v === '') return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]
  }
  return v
}

// certifications (jsonb): objeto/array -> string JSON; string -> tal cual.
function jsonCol(v, def = '[]') {
  if (v === undefined || v === null) return def
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

// --- Hidratación de filas de salida ------------------------------------------
// En Postgres row_to_json devolvía la columna jsonb `certifications` ya como
// array. MariaDB (JSON == LONGTEXT) la devuelve como string -> la parseamos para
// que la respuesta sea idéntica a la de la nube.
function hydrateWorker(row) {
  if (row && typeof row.certifications === 'string') {
    try { row.certifications = JSON.parse(row.certifications) } catch { /* dejar tal cual */ }
  }
  return row
}

// Ejecuta un SELECT * WHERE id=? y devuelve la fila (o null).
async function selectById(table, id) {
  const [rows] = await pool.query(`SELECT * FROM ${qi(table)} WHERE id = ? LIMIT 1`, [id])
  return rows[0] || null
}

// Inserta con id generado en Node (CHAR(36)) y devuelve la fila completa.
async function insertReturning(table, cols) {
  const id = randomUUID()
  const keys = ['id', ...Object.keys(cols)]
  const vals = [id, ...Object.values(cols)]
  const sql = `INSERT INTO ${qi(table)} (${keys.map(qi).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  await pool.query(sql, vals)
  return selectById(table, id)
}

// Construye el UPDATE a partir de una lista de asignaciones [col, value] y
// re-lee la fila. `sets` ya viene filtrado (solo columnas a tocar).
async function updateReturning(table, id, sets) {
  if (sets.length) {
    const assigns = sets.map(([c]) => `${qi(c)} = ?`).concat(['`updated_at` = NOW(3)'])
    const params = sets.map(([, v]) => v)
    params.push(id)
    await pool.query(`UPDATE ${qi(table)} SET ${assigns.join(', ')} WHERE id = ?`, params)
  }
  return selectById(table, id)
}

// COALESCE(p_data->>'col', col): incluir solo si el valor viene no-nulo.
function coalesceSets(data, spec) {
  const out = []
  for (const [col, fn] of spec) {
    const v = data[col]
    if (v !== undefined && v !== null) out.push([col, fn ? fn(v) : v])
  }
  return out
}
// CASE WHEN p_data ? 'col': incluir si la CLAVE está presente (permite poner null).
function keySets(data, spec) {
  const out = []
  for (const [col, fn] of spec) {
    if (Object.prototype.hasOwnProperty.call(data, col)) out.push([col, fn ? fn(data[col]) : data[col]])
  }
  return out
}

// ============================================================================
// EQUIPMENT (cons_equipment_catalog)
// ============================================================================

async function rpc_list_equipment({ p_org_id, p_status = null, p_type = null, p_search = null }) {
  let sql = `SELECT * FROM cons_equipment_catalog WHERE organization_id = ?`
  const params = [p_org_id]
  if (p_status != null) { sql += ` AND status = ?`; params.push(p_status) }
  if (p_type != null) { sql += ` AND type = ?`; params.push(p_type) }
  if (p_search != null) { sql += ` AND (name LIKE ? OR category LIKE ?)`; params.push(`%${p_search}%`, `%${p_search}%`) }
  const [rows] = await pool.query(sql, params)
  return rows
}

async function rpc_get_equipment({ p_id }) {
  return selectById('cons_equipment_catalog', p_id)
}

async function rpc_create_equipment({ p_data: d }) {
  return insertReturning('cons_equipment_catalog', {
    organization_id: val(d.organization_id),
    name: val(d.name),
    code: val(d.code),
    type: d.type ?? 'propia',
    category: val(d.category),
    hourly_rate: num(d.hourly_rate, 0),
    daily_rate: num(d.daily_rate, 0),
    supplier_id: val(d.supplier_id),
    license_plate: val(d.license_plate),
    serial_number: val(d.serial_number),
    maintenance_next: date(d.maintenance_next),
    status: d.status ?? 'available',
    notes: val(d.notes),
    photo_url: val(d.photo_url),
  })
}

async function rpc_update_equipment({ p_id, p_data: d }) {
  const sets = coalesceSets(d, [
    ['name'], ['code'], ['type'], ['category'],
    ['hourly_rate', (v) => num(v, 0)], ['daily_rate', (v) => num(v, 0)],
    ['license_plate'], ['serial_number'],
    ['status'], ['notes'], ['photo_url'],
  ]).concat(keySets(d, [['maintenance_next', date]]))
  return updateReturning('cons_equipment_catalog', p_id, sets)
}

async function rpc_delete_equipment({ p_id }) {
  await pool.query(`DELETE FROM cons_equipment_catalog WHERE id = ?`, [p_id])
  return null
}

// ============================================================================
// WORKERS (cons_workers)
// ============================================================================

async function rpc_list_workers({ p_org_id, p_status = null, p_role = null, p_search = null }) {
  let sql = `SELECT * FROM cons_workers WHERE organization_id = ?`
  const params = [p_org_id]
  if (p_status != null) { sql += ` AND status = ?`; params.push(p_status) }
  if (p_role != null) { sql += ` AND role = ?`; params.push(p_role) }
  if (p_search != null) { sql += ` AND (name LIKE ? OR dni LIKE ? OR specialty LIKE ?)`; params.push(`%${p_search}%`, `%${p_search}%`, `%${p_search}%`) }
  const [rows] = await pool.query(sql, params)
  return rows.map(hydrateWorker)
}

async function rpc_get_worker({ p_id }) {
  return hydrateWorker(await selectById('cons_workers', p_id))
}

async function rpc_create_worker({ p_data: d }) {
  const row = await insertReturning('cons_workers', {
    organization_id: val(d.organization_id),
    name: val(d.name),
    dni: val(d.dni),
    role: d.role ?? 'Peón',
    specialty: val(d.specialty),
    hourly_rate: num(d.hourly_rate, 0),
    phone: val(d.phone),
    email: val(d.email),
    emergency_contact: val(d.emergency_contact),
    is_subcontracted: bool(d.is_subcontracted, false),
    subcontractor_id: val(d.subcontractor_id),
    certifications: jsonCol(d.certifications, '[]'),
    status: d.status ?? 'active',
    photo_url: val(d.photo_url),
    hire_date: date(d.hire_date),
    end_date: date(d.end_date),
    notes: val(d.notes),
  })
  return hydrateWorker(row)
}

async function rpc_update_worker({ p_id, p_data: d }) {
  const sets = coalesceSets(d, [
    ['name'], ['dni'], ['role'], ['specialty'],
    ['hourly_rate', (v) => num(v, 0)],
    ['phone'], ['email'], ['emergency_contact'],
    ['is_subcontracted', (v) => bool(v, false)],
    ['certifications', (v) => jsonCol(v, '[]')],
    ['status'], ['photo_url'], ['notes'],
  ]).concat(keySets(d, [
    ['subcontractor_id'], ['hire_date', date], ['end_date', date],
  ]))
  return hydrateWorker(await updateReturning('cons_workers', p_id, sets))
}

async function rpc_delete_worker({ p_id }) {
  await pool.query(`DELETE FROM cons_workers WHERE id = ?`, [p_id])
  return null
}

// ============================================================================
// SUBCONTRACTORS (cons_subcontractors) + DOCUMENTS (cons_subcontractor_documents)
// ============================================================================

async function rpc_list_subcontractors({ p_org_id, p_specialty = null, p_is_active = null, p_search = null }) {
  let sql = `SELECT * FROM cons_subcontractors WHERE organization_id = ?`
  const params = [p_org_id]
  if (p_specialty != null) { sql += ` AND specialty LIKE ?`; params.push(`%${p_specialty}%`) }
  if (p_is_active != null) { sql += ` AND is_active = ?`; params.push(p_is_active === 'true' || p_is_active === true ? 1 : 0) }
  if (p_search != null) { sql += ` AND (name LIKE ? OR tax_id LIKE ? OR contact_name LIKE ?)`; params.push(`%${p_search}%`, `%${p_search}%`, `%${p_search}%`) }
  const [rows] = await pool.query(sql, params)
  return rows
}

async function rpc_get_subcontractor({ p_id }) {
  const subcontractor = await selectById('cons_subcontractors', p_id)
  const [documents] = await pool.query(
    `SELECT * FROM cons_subcontractor_documents WHERE subcontractor_id = ?`, [p_id])
  return { subcontractor, documents }
}

async function rpc_get_sub_specialties({ p_org_id }) {
  const [rows] = await pool.query(
    `SELECT DISTINCT specialty FROM cons_subcontractors WHERE organization_id = ? AND specialty IS NOT NULL`,
    [p_org_id])
  return rows.map((r) => r.specialty)
}

async function rpc_create_subcontractor({ p_data: d }) {
  return insertReturning('cons_subcontractors', {
    organization_id: val(d.organization_id),
    name: val(d.name),
    tax_id: val(d.tax_id),
    contact_name: val(d.contact_name),
    phone: val(d.phone),
    email: val(d.email),
    address: val(d.address),
    city: val(d.city),
    province: val(d.province),
    postal_code: val(d.postal_code),
    specialty: val(d.specialty),
    rating: num(d.rating, 3),
    is_active: bool(d.is_active, true),
    notes: val(d.notes),
  })
}

async function rpc_update_subcontractor({ p_id, p_data: d }) {
  const sets = coalesceSets(d, [
    ['name'], ['tax_id'], ['contact_name'], ['phone'], ['email'],
    ['address'], ['city'], ['province'], ['postal_code'], ['specialty'],
    ['rating', (v) => num(v, 3)], ['is_active', (v) => bool(v, true)], ['notes'],
  ])
  return updateReturning('cons_subcontractors', p_id, sets)
}

async function rpc_delete_subcontractor({ p_id }) {
  await pool.query(`DELETE FROM cons_subcontractors WHERE id = ?`, [p_id])
  return null
}

// --- Documentos PRL ---------------------------------------------------------

async function rpc_list_sub_documents({ p_sub_id, p_project_id = null }) {
  let sql = `SELECT * FROM cons_subcontractor_documents WHERE subcontractor_id = ?`
  const params = [p_sub_id]
  if (p_project_id != null) { sql += ` AND project_id = ?`; params.push(p_project_id) }
  const [rows] = await pool.query(sql, params)
  return rows
}

async function rpc_create_sub_document({ p_data: d }) {
  return insertReturning('cons_subcontractor_documents', {
    subcontractor_id: val(d.subcontractor_id),
    project_id: val(d.project_id),
    doc_type: val(d.doc_type),
    name: val(d.name),
    file_path: val(d.file_path),
    expiry_date: date(d.expiry_date),
    status: d.status ?? 'pending',
    notes: val(d.notes),
  })
}

async function rpc_update_sub_document({ p_id, p_data: d }) {
  const sets = coalesceSets(d, [
    ['doc_type'], ['name'], ['file_path'], ['status'], ['notes'],
  ]).concat(keySets(d, [['expiry_date', date]]))
  return updateReturning('cons_subcontractor_documents', p_id, sets)
}

async function rpc_delete_sub_document({ p_id }) {
  await pool.query(`DELETE FROM cons_subcontractor_documents WHERE id = ?`, [p_id])
  return null
}

async function rpc_get_expiring_documents({ p_org_id, p_days = 30 }) {
  const [rows] = await pool.query(
    `SELECT d.* FROM cons_subcontractor_documents d
       JOIN cons_subcontractors s ON d.subcontractor_id = s.id
      WHERE s.organization_id = ?
        AND d.expiry_date IS NOT NULL
        AND d.expiry_date <= (CURRENT_DATE + INTERVAL ? DAY)
        AND d.status <> 'rejected'`,
    [p_org_id, Number(p_days)])
  return rows
}

// ============================================================================
// Dispatcher
// ============================================================================

const HANDLERS = {
  rpc_list_equipment, rpc_get_equipment, rpc_create_equipment, rpc_update_equipment, rpc_delete_equipment,
  rpc_list_workers, rpc_get_worker, rpc_create_worker, rpc_update_worker, rpc_delete_worker,
  rpc_list_subcontractors, rpc_get_subcontractor, rpc_get_sub_specialties,
  rpc_create_subcontractor, rpc_update_subcontractor, rpc_delete_subcontractor,
  rpc_list_sub_documents, rpc_create_sub_document, rpc_update_sub_document,
  rpc_delete_sub_document, rpc_get_expiring_documents,
}

export async function callRpc(name, params = {}) {
  const fn = HANDLERS[name]
  if (!fn) {
    return { data: null, error: { message: `shim: rpc('${name}') no implementada`, code: 'RPC_NOT_IMPLEMENTED' } }
  }
  try {
    const data = await fn(params || {})
    return { data, error: null }
  } catch (e) {
    return { data: null, error: { message: e.message, code: e.code || 'DB_ERROR' } }
  }
}

export default callRpc
