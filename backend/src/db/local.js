// ============================================================================
// Ayudante que IMITA la API del query-builder de Supabase sobre MariaDB (mysql2).
// Objetivo: migrar las rutas cambiando solo el import, sin reescribir a mano las
// ~588 llamadas. Devuelve siempre { data, error }, igual que @supabase/supabase-js.
//
// Soportado:
//   .from(tabla)
//   .select(cols) .insert(obj|obj[]) .update(obj) .delete() .upsert(obj|obj[],{onConflict})
//   .eq .neq .gt .gte .lt .lte .is .in .like .ilike .or('col.op.val,col.op.val')
//   .order(col,{ascending}) .limit(n) .single() .maybeSingle()
//   insert/delete + .select() => RETURNING (MariaDB 10.5+)
//   update/upsert + .select() => SELECT posterior (MariaDB no tiene UPDATE/ON DUP RETURNING)
// NO soportado aún (lanza error claro): selects anidados "tabla(...)", .rpc(), .storage
// ============================================================================
import pool from './mariadb.js'
import storage from './storage.js'

const qi = (id) => '`' + String(id).replace(/`/g, '') + '`'

const toMariaDateTime = (d) => d.toISOString().slice(0, 23).replace('T', ' ')

// Normaliza un valor JS al formato que espera MariaDB (mysql2 no lo hace solo):
//  - Date/string ISO-8601 con hora ("...T..Z") -> DATETIME MariaDB en UTC.
//  - objeto/array -> JSON string (para columnas JSON, antes jsonb/arrays).
//  - resto -> sin tocar.
function normVal(v) {
  if (v === undefined || v === null) return null
  if (v instanceof Date) return toMariaDateTime(v)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return toMariaDateTime(d)
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

const OP_MAP = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'LIKE' }

// Entrecomilla la lista de columnas de un SELECT plano (sin anidados). Necesario
// porque hay columnas con nombre reservado (key, value, order, read, date...).
// Soporta "*", "a, b", y el renombrado de Supabase "nuevo:original".
function selectCols(cols) {
  if (!cols || cols.trim() === '*') return '*'
  return cols.split(',').map((c) => {
    c = c.trim()
    if (c === '*' || c === '') return c
    const m = c.match(/^(\w+):(\w+)$/)          // renombrado nuevo:original
    if (m) return `${qi(m[2])} AS ${qi(m[1])}`
    if (/^\w+$/.test(c)) return qi(c)
    return c                                     // expresión rara: dejar tal cual
  }).filter(Boolean).join(', ')
}

// ---- Selects anidados estilo Supabase: "*, alias:tabla(cols, nested:tabla2(...))" ----
// Convención: el embed `alias:tabla(...)` se resuelve por la FK local `alias_id`
// (many-to-one / belongs-to). Es como funcionan todos los usos del proyecto.
function splitTopComma(str) {
  const out = []; let depth = 0, cur = ''
  for (const ch of str) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
function parseSelect(str) {
  const baseCols = []; const embeds = []
  for (const p of splitTopComma(str)) {
    if (p.includes('(')) {
      const m = p.match(/^(\w+):(\w+)\s*\(([\s\S]*)\)$/) || p.match(/^(\w+)\s*\(([\s\S]*)\)$/)
      if (m.length === 4) embeds.push({ alias: m[1], table: m[2], sel: parseSelect(m[3]) })
      else embeds.push({ alias: m[1], table: m[1], sel: parseSelect(m[2]) })
    } else baseCols.push(p)
  }
  return { baseCols, embeds }
}
function colsForQuery(sel) {
  if (sel.baseCols.includes('*')) return '*'
  const cols = new Set(sel.baseCols)
  cols.add('id')                                   // necesario para mapear al anidar
  for (const e of sel.embeds) cols.add(e.alias + '_id') // FK para resolver el embed
  return [...cols].map(qi).join(', ')
}
async function attachEmbeds(rows, sel) {
  if (!rows.length) return
  for (const e of sel.embeds) {
    const fk = e.alias + '_id'
    const ids = [...new Set(rows.map((r) => r[fk]).filter((v) => v != null))]
    const map = {}
    if (ids.length) {
      const [subRows] = await pool.query(
        `SELECT ${colsForQuery(e.sel)} FROM ${qi(e.table)} WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
      await attachEmbeds(subRows, e.sel)
      for (const sr of subRows) map[sr.id] = sr
    }
    for (const r of rows) r[e.alias] = map[r[fk]] || null
  }
}

class Builder {
  constructor(table) {
    this.table = table
    this.op = 'select'
    this.cols = '*'
    this.filters = []
    this.orClauses = []       // [{ frag, params }]
    this.values = null
    this.onConflict = null
    this.orders = []
    this.lim = null
    this.rangeFrom = null
    this.rangeTo = null
    this.single_ = false
    this.maybe = false
    this.returning = false
  }

  select(cols = '*') {
    if (this.op === 'insert' || this.op === 'update' || this.op === 'delete' || this.op === 'upsert') this.returning = true
    this.cols = cols
    return this
  }
  insert(obj) { this.op = 'insert'; this.values = obj; return this }
  update(obj) { this.op = 'update'; this.values = obj; return this }
  delete() { this.op = 'delete'; return this }
  upsert(obj, opts = {}) { this.op = 'upsert'; this.values = obj; this.onConflict = opts.onConflict || null; return this }

  eq(c, v) { this.filters.push([c, '=', v]); return this }
  neq(c, v) { this.filters.push([c, '<>', v]); return this }
  gt(c, v) { this.filters.push([c, '>', v]); return this }
  gte(c, v) { this.filters.push([c, '>=', v]); return this }
  lt(c, v) { this.filters.push([c, '<', v]); return this }
  lte(c, v) { this.filters.push([c, '<=', v]); return this }
  is(c, v) { this.filters.push([c, v === null ? 'IS NULL' : '=', v]); return this }
  not(c, op, v) {
    if (op === 'is' && v === null) { this.filters.push([c, 'IS NOT NULL', null]); return this }
    this.filters.push([c, 'NOT ' + (OP_MAP[op] || '='), v]); return this
  }
  in(c, arr) { this.filters.push([c, 'IN', arr]); return this }
  like(c, p) { this.filters.push([c, 'LIKE', p]); return this }
  ilike(c, p) { this.filters.push([c, 'LIKE', p]); return this } // collation _ci => case-insensitive

  // Supabase .or('col.op.value,col.op.value') -> (col OP ? OR col OP ?)
  or(str) {
    const frags = []
    const params = []
    for (const term of str.split(',').map((t) => t.trim()).filter(Boolean)) {
      const i1 = term.indexOf('.')
      const i2 = term.indexOf('.', i1 + 1)
      if (i1 < 0 || i2 < 0) continue
      const col = term.slice(0, i1)
      const op = term.slice(i1 + 1, i2)
      let val = term.slice(i2 + 1)
      if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      frags.push(`${qi(col)} ${OP_MAP[op] || '='} ?`)
      params.push(normVal(val))
    }
    if (frags.length) this.orClauses.push({ frag: '(' + frags.join(' OR ') + ')', params })
    return this
  }

  order(c, opts = {}) { this.orders.push([c, opts.ascending === false ? 'DESC' : 'ASC']); return this }
  limit(n) { this.lim = n; return this }
  range(from, to) { this.rangeFrom = from; this.rangeTo = to; return this } // Supabase inclusivo
  single() { this.single_ = true; return this }
  maybeSingle() { this.single_ = true; this.maybe = true; return this }

  _where(params) {
    const parts = this.filters.map(([c, op, v]) => {
      if (op === 'IS NULL') return `${qi(c)} IS NULL`
      if (op === 'IS NOT NULL') return `${qi(c)} IS NOT NULL`
      if (op.startsWith('NOT ')) { params.push(normVal(v)); return `NOT (${qi(c)} ${op.slice(4)} ?)` }
      if (op === 'IN') {
        if (!v.length) return '1=0'
        params.push(...v.map(normVal))
        return `${qi(c)} IN (${v.map(() => '?').join(',')})`
      }
      params.push(normVal(v))
      return `${qi(c)} ${op} ?`
    })
    for (const oc of this.orClauses) { parts.push(oc.frag); params.push(...oc.params) }
    return parts.length ? ' WHERE ' + parts.join(' AND ') : ''
  }

  _selectTail(sql) {
    if (this.orders.length) sql += ' ORDER BY ' + this.orders.map(([c, d]) => `${qi(c)} ${d}`).join(', ')
    if (this.rangeFrom != null) {
      const count = Math.max(0, this.rangeTo - this.rangeFrom + 1)
      sql += ` LIMIT ${count} OFFSET ${Math.max(0, this.rangeFrom)}`
    } else if (this.lim != null) sql += ` LIMIT ${Number(this.lim)}`
    else if (this.single_) sql += ' LIMIT 2'
    return sql
  }

  _sql() {
    if (this.cols.includes('(')) {
      throw new Error(`shim: select anidado no soportado aún (${this.table}): ${this.cols}`)
    }
    const params = []
    let sql
    if (this.op === 'select') {
      sql = this._selectTail(`SELECT ${selectCols(this.cols)} FROM ${qi(this.table)}` + this._where(params))
    } else if (this.op === 'insert' || this.op === 'upsert') {
      const rows = Array.isArray(this.values) ? this.values : [this.values]
      const keys = Object.keys(rows[0])
      const ph = rows.map(() => `(${keys.map(() => '?').join(',')})`).join(', ')
      rows.forEach((r) => keys.forEach((k) => params.push(normVal(r[k]))))
      sql = `INSERT INTO ${qi(this.table)} (${keys.map(qi).join(', ')}) VALUES ${ph}`
      if (this.op === 'upsert') {
        sql += ' ON DUPLICATE KEY UPDATE ' + keys.map((k) => `${qi(k)} = VALUES(${qi(k)})`).join(', ')
      } else if (this.returning) {
        sql += ` RETURNING ${selectCols(this.cols)}`
      }
    } else if (this.op === 'update') {
      const keys = Object.keys(this.values)
      sql = `UPDATE ${qi(this.table)} SET ` + keys.map((k) => `${qi(k)} = ?`).join(', ')
      keys.forEach((k) => params.push(normVal(this.values[k])))
      sql += this._where(params)
      // MariaDB no soporta UPDATE...RETURNING -> el .select() se resuelve en exec() con un SELECT.
    } else if (this.op === 'delete') {
      sql = `DELETE FROM ${qi(this.table)}` + this._where(params)
      if (this.returning) sql += ` RETURNING ${selectCols(this.cols)}`
    }
    return { sql, params }
  }

  // Re-lectura tras update/upsert (MariaDB no tiene RETURNING para esos casos).
  _reselectSql() {
    const params = []
    if (this.op === 'upsert') {
      // localizar por las columnas de conflicto (onConflict) o por id si está en el objeto
      const obj = Array.isArray(this.values) ? this.values[0] : this.values
      const keyCols = this.onConflict
        ? this.onConflict.split(',').map((s) => s.trim())
        : (obj && obj.id !== undefined ? ['id'] : [])
      const where = keyCols.map((k) => { params.push(normVal(obj[k])); return `${qi(k)} = ?` }).join(' AND ')
      return { sql: `SELECT ${selectCols(this.cols)} FROM ${qi(this.table)}` + (where ? ` WHERE ${where}` : '') + ' LIMIT 2', params }
    }
    return { sql: this._selectTail(`SELECT ${selectCols(this.cols)} FROM ${qi(this.table)}` + this._where(params)), params }
  }

  async _execNested() {
    const sel = parseSelect(this.cols)
    const params = []
    const sql = this._selectTail(`SELECT ${colsForQuery(sel)} FROM ${qi(this.table)}` + this._where(params))
    const [rows] = await pool.query(sql, params)
    await attachEmbeds(rows, sel)
    if (this.single_) {
      if (!rows.length) return { data: null, error: this.maybe ? null : { code: 'PGRST116', message: 'No rows found' } }
      return { data: rows[0], error: null }
    }
    return { data: rows, error: null }
  }

  async exec() {
    try {
      if (this.op === 'select' && this.cols.includes('(')) return await this._execNested()
      const { sql, params } = this._sql()
      const [res] = await pool.query(sql, params)
      let rows = Array.isArray(res) ? res : null // OkPacket (insert/update/upsert sin RETURNING) => null
      if ((this.op === 'update' || this.op === 'upsert') && this.returning) {
        const rs = this._reselectSql()
        const [rows2] = await pool.query(rs.sql, rs.params)
        rows = rows2
      }
      if (this.single_) {
        if (!rows || rows.length === 0) {
          return { data: null, error: this.maybe ? null : { code: 'PGRST116', message: 'No rows found' } }
        }
        return { data: rows[0], error: null }
      }
      if (this.op !== 'select' && !this.returning) return { data: null, error: null }
      return { data: rows || [], error: null }
    } catch (e) {
      return { data: null, error: { message: e.message, code: e.code || 'DB_ERROR' } }
    }
  }

  then(resolve, reject) { this.exec().then(resolve, reject) }
  catch(reject) { return this.exec().catch(reject) }
}

const local = {
  from(table) { return new Builder(table) },
  rpc() { return Promise.resolve({ data: null, error: { message: 'shim: rpc() no implementado aún' } }) },
  storage,
}

export default local
