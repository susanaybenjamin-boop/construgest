// ============================================================================
// MIG-1 — Migrador de esquema.
//
// POR QUÉ EXISTE: `database/init/01_schema.sql` solo se aplica la PRIMERA vez
// (desktop/main.js:404 `if (!await databaseExists(...))`, y en Docker porque
// docker-entrypoint-initdb.d solo corre al crear el volumen). Es decir: en una
// instalación que YA existe —la de Benjamin— una columna nueva no llegaba nunca,
// y el backend acababa dando errores de SQL contra columnas inexistentes.
//
// Este migrador aplica, en CADA arranque del backend, los .sql pendientes de
// `backend/migrations/mariadb/`, en orden de nombre, y anota cuáles ya se han
// aplicado en `cons_schema_migrations`. Sirve igual para la app instalada, para
// Docker y para desarrollo, porque el backend arranca en los tres casos.
//
// REGLAS PARA ESCRIBIR UNA MIGRACIÓN:
//  - Nombre `NNN_descripcion.sql` con NNN correlativo (001, 002, …).
//  - IDEMPOTENTE: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
//    `DROP ... IF EXISTS` (MariaDB 11.4 los soporta; comprobado en ejecución).
//    Así una migración a medias se puede repetir sin romper nada.
//  - Sentencias separadas por `;`. NO meter rutinas almacenadas con `;` dentro
//    (no se usa DELIMITER aquí).
//  - Tablas nuevas: SIEMPRE `COLLATE utf8mb4_unicode_ci`, o las FK fallan con
//    errno 150 (la lección de Benjagest).
//
// Las migraciones viejas de `backend/migrations/*.sql` (001_soft_delete,
// 002_sonnet_4_6_pricing) son de la época de Supabase: SQL de Postgres que NO
// se debe ejecutar aquí. Por eso las nuevas van en el subdirectorio `mariadb/`.
// ============================================================================
import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pool from './mariadb.js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_DIR = join(HERE, '..', '..', 'migrations', 'mariadb')

/**
 * Partir un fichero .sql en sentencias por `;`, respetando comillas y
 * comentarios (`-- …`, `# …`, `/* … *\/`). Un split a lo bruto por ';' rompería
 * cualquier literal que lleve un punto y coma dentro.
 */
export function splitStatements(sql) {
  const out = []
  let current = ''
  let quote = null          // ', " o `
  let lineComment = false
  let blockComment = false

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]
    const next = sql[i + 1]

    if (lineComment) {
      if (c === '\n') { lineComment = false; current += c }
      continue
    }
    if (blockComment) {
      if (c === '*' && next === '/') { blockComment = false; i++ }
      continue
    }
    if (quote) {
      current += c
      if (c === '\\' && quote !== '`') { current += next ?? ''; i++; continue }
      if (c === quote) quote = null
      continue
    }

    if (c === '-' && next === '-') { lineComment = true; i++; continue }
    if (c === '#') { lineComment = true; continue }
    if (c === '/' && next === '*') { blockComment = true; i++; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; current += c; continue }

    if (c === ';') {
      if (current.trim()) out.push(current.trim())
      current = ''
      continue
    }
    current += c
  }

  if (current.trim()) out.push(current.trim())
  return out
}

/** Tabla de control. Se crea sola la primera vez. */
async function ensureControlTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS cons_schema_migrations (
      filename   VARCHAR(255) NOT NULL,
      applied_at DATETIME(3)  NOT NULL,
      PRIMARY KEY (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

/** Esperar a que la BD conteste (la app arranca MariaDB justo antes). */
async function waitForDb(attempts = 10, delayMs = 1000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const conn = await pool.getConnection()
      conn.release()
      return
    } catch (err) {
      if (i === attempts) throw err
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
}

/**
 * Aplica las migraciones pendientes. Devuelve { applied: [...], skipped: n }.
 * Lanza si alguna falla: el backend NO debe servir con el esquema a medias.
 */
export async function runMigrations({ log = console.log } = {}) {
  if (!existsSync(MIGRATIONS_DIR)) {
    return { applied: [], skipped: 0 }
  }

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort()

  if (files.length === 0) return { applied: [], skipped: 0 }

  await waitForDb()

  const conn = await pool.getConnection()
  try {
    await ensureControlTable(conn)
    const [rows] = await conn.query('SELECT filename FROM cons_schema_migrations')
    const done = new Set(rows.map((r) => r.filename))

    const applied = []
    for (const file of files) {
      if (done.has(file)) continue

      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8')
      const statements = splitStatements(sql)
      log(`[migraciones] aplicando ${file} (${statements.length} sentencias)`)

      for (const stmt of statements) {
        try {
          await conn.query(stmt)
        } catch (err) {
          // Decirlo CLARO: qué fichero, qué sentencia y qué dijo MariaDB.
          throw new Error(
            `La migración ${file} falló.\n`
            + `  Sentencia: ${stmt.slice(0, 200)}${stmt.length > 200 ? '…' : ''}\n`
            + `  MariaDB: ${err.message}`,
          )
        }
      }

      await conn.query(
        'INSERT INTO cons_schema_migrations (filename, applied_at) VALUES (?, UTC_TIMESTAMP(3))',
        [file],
      )
      applied.push(file)
    }

    return { applied, skipped: files.length - applied.length }
  } finally {
    conn.release()
  }
}

export default runMigrations
