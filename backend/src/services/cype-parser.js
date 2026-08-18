/**
 * Parser de presupuestos CYPE / Arquímedes — listado "Presupuesto y mediciones".
 *
 * Este formato NO lo puede leer el parser genérico (budget-parser.js) porque:
 *   - El capítulo se escribe "Presupuesto parcial nº 2 Cimentaciones", que
 *     cleanPdfText() borra como ruido de página.
 *   - La partida lleva DOS tokens antes de la unidad:
 *     "2.1.1 CRL010    m² Capa de hormigón de limpieza…"
 *     (numeración jerárquica + código de la base de precios).
 *   - El cierre con cantidad/precio/importe empieza por "Total":
 *     "Total m² ............:    97,510    7,12    694,27"
 *     y cleanPdfText() lo borra como línea de totales.
 *
 * Estos PDF suelen venir de un proyecto completo (memoria + pliego + ESS +
 * presupuesto), así que sólo se parsea desde el primer "Presupuesto parcial"
 * hasta "Presupuesto de ejecución material". Todo lo anterior es prosa que el
 * parser genérico confundía con capítulos.
 *
 * Igual que bc3-parser.js, la salida es PLANA: los subcapítulos ("2.1
 * Regularización") no generan capítulo propio; sus partidas van al capítulo
 * padre. Es la convención del resto del pipeline (ImportBudgetDialog no maneja
 * parent_id).
 *
 * Salida: { chapters: [{ code, name, items: [{ code, name, description, unit,
 *          quantity, unit_price, measurements[] }] }], logs: [] }
 * La normalización de unidades la hace validateAndClean() en budget-parser.js.
 */

// ── Marcadores de estructura ──────────────────────────────────────────

/** "Presupuesto parcial nº 2 Cimentaciones" */
const CHAPTER_RE = /^Presupuesto\s+parcial\s+n[ºo°]?\s*(\d{1,3})\s+(.+)$/i

/** Fin del cuerpo del presupuesto: empiezan las hojas de resumen */
const END_RE = /^Presupuesto\s+de\s+ejecuci[óo]n\s+(material|por\s+contrata)/i

/** Unidades tal como las imprime CYPE, más largas primero */
const UNIT = '(?:m[²³]|dm[³3]|cm[²2]|m[23]|Ud|ud|UD|ml|ML|Ml|kg|Kg|KG|tn?|Tn|mes|%|u|U|h|H|l|L|m|M)'

/** "2.1.1 CRL010    m² Capa de hormigón…" — numeración + código base + unidad */
const PARTIDA_RE = new RegExp(
  `^(\\d{1,3}(?:\\.\\d{1,3}){1,3})\\s+([A-Za-z0-9][A-Za-z0-9._/-]{1,19})\\s+${UNIT}(?![A-Za-zÁÉÍÓÚÑÜáéíóúñü])\\s+(\\S.*)$`,
  'i'
)

/** Variante sin código de base de precios: "2.1.1  m² Capa de hormigón…" */
const PARTIDA_NO_CODE_RE = new RegExp(
  `^(\\d{1,3}(?:\\.\\d{1,3}){1,3})\\s+(${UNIT})(?![A-Za-zÁÉÍÓÚÑÜáéíóúñü])\\s+(\\S.*)$`,
  'i'
)

/** Recuperar la unidad de una línea de partida (el grupo va sin capturar arriba) */
const UNIT_ONLY_RE = new RegExp(`\\s(${UNIT})(?![A-Za-zÁÉÍÓÚÑÜáéíóúñü])\\s`, 'i')

/**
 * Cabecera que CYPE repite al cruzar salto de página:
 *   "9.2.1 RFP010    M² Pintura plástica sobre paramento exterior.    (Continuación...)"
 * NO es una partida nueva: la de arriba sigue abierta y su "Total" llega después.
 * Hay que saltarla ANTES de mirar partida/subcapítulo o se pierde la partida real
 * (3 partidas y 13.001,21 € en el proyecto de Huetor Vega).
 */
const CONTINUATION_RE = /\(\s*Continuaci[óo]n\s*[.…]*\s*\)/i

/**
 * "2.1 Regularización" — subcapítulo. Exactamente DOS niveles: las partidas
 * llevan tres ("2.1.1") y ya las captura PARTIDA_RE antes de llegar aquí.
 */
const SUBCHAPTER_RE = /^(\d{1,3}\.\d{1,3})\s+(\S.*)$/

/** "Total m² ............:    97,510    7,12    694,27" */
const SUMMARY_RE = /^Total\s+(.{1,8}?)\s*\.{2,}\s*:\s*(.*)$/i

/** "Uds.    Largo    Ancho    Alto    Subtotal" */
const MEAS_HEADER_RE = /^Uds\.?\s+Largo\s+Ancho\s+Alto\s+Subtotal/i

// ── Ruido del PDF firmado/visado ──────────────────────────────────────
// El sello del colegio y el pie de página se mezclan con el texto útil
// porque van rotados en la misma capa. Se quitan en línea, no sólo entera.

const OVERLAY_INLINE = [
  /\(Ref\.\s*[\d-]+\)/gi,
  /P[áa]g\.\s*\d+\s*de\s*\d+/gi,
  /N[ºo°]\s*\d{2}-\d{4,}/gi,
  /\b\d{2}\/\d{2}\/\d{2,4}\b/g,
  /COLEGIO\s+OFICIAL\s+DE\s+[A-ZÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ]+)*/g,
  /\bVISADO\b/g,
]

function stripOverlay(line) {
  let out = line
  for (const re of OVERLAY_INLINE) out = out.replace(re, ' ')
  return out.replace(/\s{2,}/g, '    ').trim()
}

/** Líneas que son ruido completo y no aportan nada */
function isNoiseLine(line) {
  if (!line) return true
  if (/^---\s*PAGE\s+\d+\s*---$/i.test(line)) return true
  if (/^C[óo]digo\s+Ud\s+Denominaci[óo]n/i.test(line)) return true
  if (/^\d{6}\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+$/.test(line)) return true  // nº colegiado + nombre
  if (/^(COLEGIO\s+OFICIAL|VISADO)\b/i.test(line)) return true
  if (/^Total$/i.test(line)) return true                             // cabecera de columna partida
  if (/^-{1,3}$/.test(line)) return true
  if (/^[\s.·_-]+$/.test(line)) return true
  // "DEMOLICIÓN Y DE CONSTRUCCIÓN … Página 3" — título de proyecto en cabecera
  if (/\sP[áa]gina\s+\d+$/.test(line)) return true
  return false
}

// ── Números en formato español ────────────────────────────────────────

/** "3.182,28" → 3182.28 ; "97,510" → 97.51 ; "1" → 1 */
function parseNum(s) {
  if (!s) return 0
  const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const NUM_TOKEN = /-?\d[\d.]*(?:,\d+)?/g

/**
 * Nombre corto de la partida (máx. 100). CYPE mete el concepto entero en la
 * primera línea, así que se corta por la primera frase y, si no cabe, por la
 * última palabra completa — nunca a mitad de palabra.
 */
function shortName(title) {
  const clean = title.replace(/\s+/g, ' ').trim()
  // Primera frase, si es lo bastante larga y no es una abreviatura ("p.p. de")
  const dot = clean.search(/\.\s/)
  const isSentence = dot > 40 && dot <= 100 && /[a-záéíóúñü0-9]{3}$/i.test(clean.slice(0, dot))
  const base = isSentence ? clean.slice(0, dot) : clean
  if (base.length <= 100) return base.trim()
  const cut = base.slice(0, 100)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, '').trim()
}

// ── Parser ────────────────────────────────────────────────────────────

/**
 * ¿El texto es un listado CYPE "Presupuesto y mediciones"?
 * Se exigen 2 marcadores para no disparar por una mención suelta en el pliego.
 */
export function isCypeBudget(text) {
  if (!text) return false
  let hits = 0
  for (const raw of text.split('\n')) {
    if (CHAPTER_RE.test(stripOverlay(raw.trim()))) hits++
    if (hits >= 2) return true
  }
  return false
}

/** Convertir una línea de medición ("Sótano  1  25,950  25,950") a objeto */
function parseMeasurementLine(line) {
  const nums = line.match(NUM_TOKEN)
  if (!nums || nums.length < 2) return null

  const firstNumAt = line.search(NUM_TOKEN)
  const label = firstNumAt > 0 ? line.slice(0, firstNumAt).trim() : ''
  // Una etiqueta debe ser texto, no un resto de número partido
  if (label && !/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{2,}/.test(label)) return null

  const values = nums.map(parseNum)
  const partial = values[values.length - 1]
  if (!partial) return null

  const middle = values.slice(1, -1)
  return {
    description: label,
    units: values[0],
    length: middle[0] || 0,
    width: middle[1] || 0,
    height: middle[2] || 0,
    partial,
  }
}

export function parseCypeBudget(rawText) {
  const logs = ['🏗️ Parser CYPE/Arquímedes — listado "Presupuesto y mediciones"']

  const allLines = rawText.split('\n').map(l => stripOverlay(l.trim()))

  // Recortar al cuerpo del presupuesto: fuera memoria, pliego y resumen final
  const start = allLines.findIndex(l => CHAPTER_RE.test(l))
  if (start === -1) {
    logs.push('⚠️ No se encontró ningún "Presupuesto parcial nº N" — no es formato CYPE')
    return { chapters: [], logs }
  }
  let end = allLines.findIndex((l, i) => i > start && END_RE.test(l))
  if (end === -1) end = allLines.length
  const lines = allLines.slice(start, end)
  logs.push(`Cuerpo del presupuesto: líneas ${start + 1}–${end} de ${allLines.length}`)

  const chapters = []
  let chapter = null
  let partida = null
  let descParts = []
  let measurements = []
  let inMeasZone = false
  let skipped = 0

  function closePartida(summary) {
    if (!partida) return
    if (!summary || summary.qty <= 0 || summary.price <= 0) {
      skipped++
      partida = null
      descParts = []
      measurements = []
      inMeasZone = false
      return
    }

    // CYPE parte el concepto por ancho de columna, así que la línea de la partida
    // suele cortar a media frase ("…de 10 cm de"). El nombre se saca del concepto
    // completo (título + descripción), no sólo de esa primera línea.
    const name = shortName([partida.title, ...descParts].join(' '))
    let description = descParts.join(' ').replace(/\s+/g, ' ').trim() || null
    if (description && description.length < 5) description = null
    if (description && !description.toLowerCase().startsWith(name.toLowerCase().substring(0, 20))) {
      description = `${name}. ${description}`
    }

    // Las mediciones sólo valen si cuadran con la cantidad del total: en los PDF
    // firmados las columnas se entremezclan con el sello y salen descolocadas.
    let meas = measurements
    if (meas.length > 0) {
      const sum = meas.reduce((s, m) => s + m.partial, 0)
      const tolerance = Math.max(0.05, summary.qty * 0.02)
      if (Math.abs(sum - summary.qty) > tolerance) {
        logs.push(`⚠️ ${partida.code}: mediciones descartadas (suman ${sum.toFixed(3)} ≠ ${summary.qty})`)
        meas = []
      }
    }
    if (meas.length === 0) {
      meas = [{
        description: name.substring(0, 80),
        units: summary.qty,
        length: 0, width: 0, height: 0,
        partial: summary.qty,
      }]
    }

    if (!chapter) chapter = { code: '0', name: 'SIN CAPÍTULO', items: [] }
    chapter.items.push({
      code: partida.code,
      name,
      description,
      unit: summary.unit || partida.unit,
      quantity: summary.qty,
      unit_price: summary.price,
      measurements: meas,
    })

    partida = null
    descParts = []
    measurements = []
    inMeasZone = false
  }

  for (const line of lines) {
    if (isNoiseLine(line)) continue

    // ── Cabecera de continuación tras salto de página: la partida sigue abierta ──
    if (CONTINUATION_RE.test(line)) continue

    // ── Capítulo ──
    const mCh = line.match(CHAPTER_RE)
    if (mCh) {
      // La cabecera se repite en cada página del mismo capítulo
      if (chapter && chapter.code === mCh[1]) continue
      closePartida(null)
      if (chapter) chapters.push(chapter)
      chapter = { code: mCh[1], name: mCh[2].trim(), items: [] }
      continue
    }

    // ── Cabecera de mediciones ──
    if (MEAS_HEADER_RE.test(line)) {
      inMeasZone = true
      continue
    }

    // ── Total de la partida (cantidad, precio, importe) ──
    const mSum = line.match(SUMMARY_RE)
    if (mSum) {
      const nums = (mSum[2].match(NUM_TOKEN) || []).map(parseNum)
      closePartida({
        unit: mSum[1].trim(),
        qty: nums[0] || 0,
        price: nums[1] || 0,
      })
      continue
    }

    // ── Inicio de partida ──
    const mPart = line.match(PARTIDA_RE) || line.match(PARTIDA_NO_CODE_RE)
    if (mPart) {
      closePartida(null)
      const withBaseCode = PARTIDA_RE.test(line)
      const unitMatch = line.match(UNIT_ONLY_RE)
      partida = {
        // El código de la base de precios (CRL010) identifica la unidad de obra;
        // la numeración jerárquica (2.1.1) es sólo posición y Construgest
        // renumera al importar.
        code: withBaseCode ? mPart[2] : mPart[1],
        unit: unitMatch ? unitMatch[1] : 'UD',
        title: mPart[mPart.length - 1].trim(),
      }
      continue
    }

    // ── Subcapítulo: no crea capítulo (salida plana), sólo separa ──
    const mSub = line.match(SUBCHAPTER_RE)
    if (mSub && /[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{3,}/.test(mSub[2]) && !/[.,]\d{2,3}\s*$/.test(mSub[2])) {
      closePartida(null)
      continue
    }

    if (!partida) continue

    // ── Medición ──
    if (inMeasZone) {
      const m = parseMeasurementLine(line)
      if (m) {
        measurements.push(m)
        continue
      }
    }

    // ── Descripción ──
    if (/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{3,}/.test(line) && !inMeasZone) {
      descParts.push(line.replace(/\s{2,}/g, ' '))
    }
  }

  closePartida(null)
  if (chapter) chapters.push(chapter)

  const withItems = chapters.filter(ch => ch.items.length > 0)
  const totalItems = withItems.reduce((s, ch) => s + ch.items.length, 0)
  const totalMeas = withItems.reduce((s, ch) =>
    s + ch.items.reduce((si, it) => si + it.measurements.length, 0), 0)

  if (skipped > 0) logs.push(`⚠️ ${skipped} partidas sin línea de total — ignoradas`)
  logs.push(`✅ CYPE: ${withItems.length} capítulos, ${totalItems} partidas, ${totalMeas} mediciones`)

  return { chapters: withItems, logs }
}

export default parseCypeBudget
