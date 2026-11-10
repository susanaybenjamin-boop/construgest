// ============================================================================
// MIG-1 — el troceador de sentencias del migrador.
//
// Es la parte delicada: partir el .sql por `;` a lo bruto rompería cualquier
// literal o comentario que lleve un punto y coma dentro, y una migración mal
// partida deja el esquema a medias.
// ============================================================================
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { splitStatements, MIGRATIONS_DIR } from '../src/db/migrate.js'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('splitStatements', () => {
  test('parte por punto y coma y quita los vacíos', () => {
    assert.deepEqual(
      splitStatements('SELECT 1; SELECT 2;;  ;'),
      ['SELECT 1', 'SELECT 2'],
    )
  })

  test('NO parte dentro de un literal con punto y coma', () => {
    const sql = "INSERT INTO t (a) VALUES ('uno; dos'); SELECT 3;"
    assert.deepEqual(splitStatements(sql), [
      "INSERT INTO t (a) VALUES ('uno; dos')",
      'SELECT 3',
    ])
  })

  test('ignora comentarios de línea y de bloque', () => {
    const sql = `
      -- esto no cuenta; ni esto
      SELECT 1;
      /* tampoco
         esto; */
      SELECT 2;  # ni esto;
    `
    assert.deepEqual(splitStatements(sql), ['SELECT 1', 'SELECT 2'])
  })

  test('respeta comillas dobles, backticks y escapes', () => {
    const sql = 'ALTER TABLE `a;b` ADD COLUMN c TEXT; SELECT "x;y", \'z\\\';w\';'
    const out = splitStatements(sql)
    assert.equal(out.length, 2)
    assert.match(out[0], /`a;b`/)
    assert.match(out[1], /"x;y"/)
  })

  test('la última sentencia sin ; final también sale', () => {
    assert.deepEqual(splitStatements('SELECT 1'), ['SELECT 1'])
  })
})

describe('migraciones de MariaDB', () => {
  test('todas acaban en .sql, van numeradas y no se repite el número', () => {
    if (!existsSync(MIGRATIONS_DIR)) return
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
    assert.ok(files.length > 0, 'hay al menos una migración')

    const numbers = files.map((f) => {
      assert.match(f, /^\d{3}_[a-z0-9_]+\.sql$/, `${f}: nombre NNN_descripcion.sql`)
      return f.slice(0, 3)
    })
    assert.equal(new Set(numbers).size, numbers.length, 'números sin repetir')
  })

  test('cada sentencia se puede trocear y ninguna queda vacía', () => {
    if (!existsSync(MIGRATIONS_DIR)) return
    for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql'))) {
      const stmts = splitStatements(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'))
      assert.ok(stmts.length > 0, `${f} no tiene sentencias`)
      for (const s of stmts) assert.ok(s.trim().length > 0)
    }
  })

  test('las migraciones viejas de Supabase siguen fuera del directorio de MariaDB', () => {
    // backend/migrations/*.sql son de la época de la nube (SQL de Postgres) y
    // NO deben ejecutarse: el migrador solo lee el subdirectorio mariadb/.
    const legacy = join(HERE, '..', 'migrations')
    if (!existsSync(legacy)) return
    const sueltos = readdirSync(legacy).filter((f) => f.endsWith('.sql'))
    for (const f of sueltos) {
      const sql = readFileSync(join(legacy, f), 'utf-8')
      if (/timestamptz|supabase/i.test(sql)) {
        assert.ok(
          !existsSync(join(MIGRATIONS_DIR, f)),
          `${f} es de Postgres y no puede estar en migrations/mariadb/`,
        )
      }
    }
  })
})
