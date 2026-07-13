// ============================================================================
// Ayudante que IMITA la API del query-builder de Supabase sobre MariaDB (mysql2).
// Objetivo: migrar las rutas cambiando solo el import, sin reescribir a mano las
// ~588 llamadas `.from().select().eq()...`. Devuelve siempre { data, error },
// igual que @supabase/supabase-js.
//
// Soportado (se irá ampliando ruta a ruta, según haga falta — Fase 2):
//   .from(tabla)
//   .select(cols) .insert(obj|obj[]) .update(obj) .delete()
//   .eq .neq .gt .gte .lt .lte .is .in .like .ilike
//   .order(col,{ascending}) .limit(n) .single() .maybeSingle()
//   insert/update/delete + .select(...) => usa RETURNING de MariaDB 10.5+
// NO soportado aún (lanza error claro cuando una ruta lo necesite):
//   selects anidados "tabla(...)", .or(), .rpc(), .storage
// ============================================================================
import pool from './mariadb.js'

const qi = (id) => '`' + String(id).replace(/`/g, '') + '`'

// 'YYYY-MM-DD HH:MM:SS.mmm' en UTC (formato que acepta MariaDB DATETIME(3)).
const toMariaDateTime = (d) => d.toISOString().slice(0, 23).replace('T', ' ')

// Normaliza un valor JS al formato que espera MariaDB (mysql2 no lo hace solo):
//  - Date o string ISO-8601 con hora ("...T..Z") -> DATETIME MariaDB en UTC.
//    (Postgres/Supabase aceptaban ISO con 'T'/'Z'; MariaDB DATETIME no.)
//  - objeto/array -> JSON string (para columnas JSON, antes jsonb/arrays).
//  - resto (números, booleanos, 'YYYY-MM-DD', texto) -> sin tocar.
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

class Builder {
  constructor(table) {
    this.table = table
    this.op = 'select'
    this.cols = '*'
    this.filters = []
    this.values = null
    this.orders = []
    this.lim = null
    this.single_ = false
    this.maybe = false
    this.returning = false
  }

  select(cols = '*') {
    if (this.op === 'insert' || this.op === 'update' || this.op === 'delete') this.returning = true
    this.cols = cols
    return this
  }
  insert(obj) { this.op = 'insert'; this.values = obj; return this }
  update(obj) { this.op = 'update'; this.values = obj; return this }
  delete() { this.op = 'delete'; return this }

  eq(c, v) { this.filters.push([c, '=', v]); return this }
  neq(c, v) { this.filters.push([c, '<>', v]); return this }
  gt(c, v) { this.filters.push([c, '>', v]); return this }
  gte(c, v) { this.filters.push([c, '>=', v]); return this }
  lt(c, v) { this.filters.push([c, '<', v]); return this }
  lte(c, v) { this.filters.push([c, '<=', v]); return this }
  is(c, v) { this.filters.push([c, v === null ? 'IS NULL' : '=', v]); return this }
  in(c, arr) { this.filters.push([c, 'IN', arr]); return this }
  like(c, p) { this.filters.push([c, 'LIKE', p]); return this }
  ilike(c, p) { this.filters.push([c, 'LIKE', p]); return this } // collation _ci => ya es case-insensitive

  order(c, opts = {}) { this.orders.push([c, opts.ascending === false ? 'DESC' : 'ASC']); return this }
  limit(n) { this.lim = n; return this }
  single() { this.single_ = true; return this }
  maybeSingle() { this.single_ = true; this.maybe = true; return this }

  _where(params) {
    if (!this.filters.length) return ''
    const parts = this.filters.map(([c, op, v]) => {
      if (op === 'IS NULL') return `${qi(c)} IS NULL`
      if (op === 'IN') {
        if (!v.length) return '1=0'
        params.push(...v.map(normVal))
        return `${qi(c)} IN (${v.map(() => '?').join(',')})`
      }
      params.push(normVal(v))
      return `${qi(c)} ${op} ?`
    })
    return ' WHERE ' + parts.join(' AND ')
  }

  _sql() {
    if (this.cols.includes('(')) {
      throw new Error(`shim: select anidado no soportado aún (${this.table}): ${this.cols}`)
    }
    const params = []
    let sql
    if (this.op === 'select') {
      sql = `SELECT ${this.cols} FROM ${qi(this.table)}` + this._where(params)
      if (this.orders.length) sql += ' ORDER BY ' + this.orders.map(([c, d]) => `${qi(c)} ${d}`).join(', ')
      if (this.lim != null) sql += ` LIMIT ${Number(this.lim)}`
      else if (this.single_) sql += ' LIMIT 2' // para detectar >1 fila
    } else if (this.op === 'insert') {
      const rows = Array.isArray(this.values) ? this.values : [this.values]
      const keys = Object.keys(rows[0])
      const ph = rows.map(() => `(${keys.map(() => '?').join(',')})`).join(', ')
      rows.forEach((r) => keys.forEach((k) => params.push(normVal(r[k]))))
      sql = `INSERT INTO ${qi(this.table)} (${keys.map(qi).join(', ')}) VALUES ${ph}`
      if (this.returning) sql += ` RETURNING ${this.cols}`
    } else if (this.op === 'update') {
      const keys = Object.keys(this.values)
      sql = `UPDATE ${qi(this.table)} SET ` + keys.map((k) => `${qi(k)} = ?`).join(', ')
      keys.forEach((k) => params.push(normVal(this.values[k])))
      sql += this._where(params)
      // OJO: MariaDB NO soporta UPDATE ... RETURNING (sí INSERT/DELETE). El
      // .select() tras un update se resuelve con un SELECT posterior (ver exec()).
    } else if (this.op === 'delete') {
      sql = `DELETE FROM ${qi(this.table)}` + this._where(params)
      if (this.returning) sql += ` RETURNING ${this.cols}`
    }
    return { sql, params }
  }

  // SELECT de re-lectura (para update+select, ya que MariaDB no tiene UPDATE RETURNING).
  _reselectSql() {
    const params = []
    let sql = `SELECT ${this.cols} FROM ${qi(this.table)}` + this._where(params)
    if (this.lim != null) sql += ` LIMIT ${Number(this.lim)}`
    else if (this.single_) sql += ' LIMIT 2'
    return { sql, params }
  }

  async exec() {
    try {
      const { sql, params } = this._sql()
      const [res] = await pool.query(sql, params)
      let rows = Array.isArray(res) ? res : null // OkPacket (insert/update sin RETURNING) => null
      // update + .select(): releer la(s) fila(s) con los mismos filtros
      if (this.op === 'update' && this.returning) {
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

  // Hace el builder "awaitable" igual que Supabase (se puede `await` sin método terminal).
  then(resolve, reject) { this.exec().then(resolve, reject) }
  catch(reject) { return this.exec().catch(reject) }
}

const local = {
  from(table) { return new Builder(table) },
  rpc() { return Promise.resolve({ data: null, error: { message: 'shim: rpc() no implementado aún' } }) },
}

export default local
