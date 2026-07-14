// ============================================================================
// Cargador de BASES DE PRECIOS PUBLICAS (BC3) — 2a fuente de la tool de precios.
//
// Lee todos los ficheros `*.bc3` de un directorio (por defecto
// `<cwd>/data/price-bases`, configurable con PRICE_BASE_DIR), extrae una lista
// plana de precios de referencia y la cachea en memoria (invalidada por
// nombre+mtime+tamano de los ficheros). Es la 2a fuente, de respaldo, de
// `loadPriceReference()`: la biblioteca propia del usuario MANDA.
//
// Enchufable: para activar la base publica (p.ej. Base de Costes de la
// Construccion de Andalucia), basta con dejar su `.bc3` en el directorio.
// Sin ficheros, devuelve [] (el sistema funciona igual, solo con la biblioteca).
// ============================================================================
import fs from 'fs'
import path from 'path'
import { extractPriceRows } from './bc3-parser.js'
import { normalizeReference } from './price-reference.js'

const DIR = process.env.PRICE_BASE_DIR || path.resolve(process.cwd(), 'data/price-bases')

let cache = null // { sig: string, rows: Array }

/** Firma del directorio: cambia si se anade/edita/borra algun .bc3. */
function dirSignature() {
  let files
  try {
    files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.bc3'))
  } catch {
    return '' // el directorio no existe -> sin bases publicas
  }
  return files
    .map((f) => {
      try {
        const s = fs.statSync(path.join(DIR, f))
        return `${f}:${s.mtimeMs}:${s.size}`
      } catch {
        return `${f}:0:0`
      }
    })
    .sort()
    .join('|')
}

/**
 * Devuelve las filas de referencia (ya normalizadas) de todas las bases publicas
 * BC3 del directorio. Cacheado: solo re-parsea si cambian los ficheros.
 * @returns {Array<{name, unit, unit_price, cost_price, usage_count, source}>}
 */
export function loadPublicPriceBases() {
  const sig = dirSignature()
  if (cache && cache.sig === sig) return cache.rows

  const rows = []
  if (sig) {
    for (const f of fs.readdirSync(DIR)) {
      if (!f.toLowerCase().endsWith('.bc3')) continue
      try {
        const buf = fs.readFileSync(path.join(DIR, f))
        const raw = extractPriceRows(buf)
        rows.push(...normalizeReference(raw, `bc3:${f}`))
      } catch (err) {
        console.warn(`[price-base] no se pudo leer ${f}:`, err.message)
      }
    }
    if (rows.length) console.log(`[price-base] ${rows.length} precios de referencia cargados de ${DIR}`)
  }

  cache = { sig, rows }
  return rows
}

export default { loadPublicPriceBases }
