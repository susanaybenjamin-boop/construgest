// ============================================================================
// EXPORTACION a BC3 (FIEBDC-3) — el camino inverso de `bc3-parser.js`.
//
// Genera el fichero de intercambio estandar del sector para poder MANDAR un
// presupuesto a un arquitecto, a una propiedad o a otra contrata. Hasta ahora
// Construgest solo sabia IMPORTAR BC3 (era una calle de sentido unico).
//
// Formato verificado contra la especificacion OFICIAL FIEBDC-3/2024 de la
// Asociacion FIEBDC (https://www.fiebdc.es), no de memoria:
//
//   ~V | PROPIEDAD | VERSION[\DDMMAAAA] | PROGRAMA | CABECERA\{ROTULO\} |
//        JUEGO_CARACTERES | COMENTARIO | TIPO_INFO | NUM_CERT | FECHA_CERT | URL |
//        - JUEGO_CARACTERES: "ANSI" (Windows) o 850/437 (DOS). Vacio => 850.
//        - TIPO_INFO: 1 base de datos, 2 presupuesto, 3 certificacion, 4 actualizacion.
//   ~K | {DN\DD\DS\DR\DI\DP\DC\DM\DIVISA\} | CI\GG\BI\BAJA\IVA | {...} | [n] |
//        - Decimales en NEGATIVO = "maximo N decimales" (en positivo serian EXACTOS,
//          y un importe con mas decimales de los declarados es un ERROR de formato).
//   ~C | CODIGO | UNIDAD | RESUMEN | {PRECIO\} | {FECHA\} | TIPO |
//        - Raiz => CODIGO##, capitulo => CODIGO#. Obligatorio en ~C, opcional en el resto.
//        - CODIGO: maximo 20 caracteres. RESUMEN: se recomienda maximo 64.
//        - TIPO: 0 sin clasificar, 1 mano de obra, 2 maquinaria y medios auxiliares,
//          3 materiales, 4 componentes de residuo, 5 clasificacion de residuo.
//   ~D | CODIGO_PADRE | <CODIGO_HIJO\FACTOR\RENDIMIENTO\> |
//   ~T | CODIGO | TEXTO_DESCRIPTIVO |
//   ~M | [PADRE\]HIJO | {POSICION\} | MEDICION_TOTAL |
//        {TIPO\COMENTARIO\UNIDADES\LONGITUD\ANCHURA\ALTURA\} | [ETIQUETA] |
//
// Todos los numeros van SIN separador de miles y con PUNTO decimal (spec 2024).
//
// ─── DOS DECISIONES DE ALCANCE, para que no sorprendan ──────────────────────
//
// 1) Se exporta el PEM (presupuesto de ejecucion material): el precio de cada
//    partida es su `unit_price` (precio de VENTA) y el total de la raiz es la
//    suma de precio x cantidad. Los GG, BI e IVA NO van en los importes: viajan
//    como PORCENTAJES en el registro ~K (campo CI\GG\BI\BAJA\IVA), que es
//    donde el formato los pone. Asi es como se intercambian los presupuestos en
//    BC3: el que recibe aplica los coeficientes.
//
// 2) NO se exporta la descomposicion de precios (`cons_price_breakdown`).
//    Motivo de formato, no de pereza: la spec dice que si un concepto lleva
//    descomposicion, su precio DEBE ser el resultado de esa descomposicion, y
//    "en caso de discrepancia tendra preponderancia el resultado obtenido por la
//    descomposicion". En Construgest la descomposicion suma el COSTE y el precio
//    exportado es la VENTA, asi que al mandarla el receptor recalcularia la obra
//    a precio de coste y cambiaria el total. Exportar la descomposicion requiere
//    antes cerrar A1 (que el precio salga de la descomposicion).
//    Ver `docs/comparativa-presto.md`.
// ============================================================================

const FORMAT_VERSION = 'FIEBDC-3/2016' // la version que declara el formato vigente
const MAX_CODE = 20                    // limite de CODIGO en ~C (spec)
const MAX_SUMMARY = 64                 // recomendacion de RESUMEN en ~C (spec)

// ---------------------------------------------------------------------------
// Utilidades de formato
// ---------------------------------------------------------------------------

/** Numero con punto decimal, sin separador de miles y sin exponente. */
function fmt(value, decimals) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return '0'
  // Los ceros de cola se quitan SOLO si hay parte decimal: "25.500" -> "25.5",
  // "10.00" -> "10". Recortar a ciegas convertiria "1000" (decimals=0) en "1".
  let fixed = n.toFixed(decimals)
  if (fixed.includes('.')) {
    fixed = fixed.replace(/0+$/, '').replace(/\.$/, '')
  }
  return fixed === '' || fixed === '-' ? '0' : fixed
}

/**
 * Redondea a 2 decimales (los de un importe).
 *
 * Se aplica en CADA nivel al acumular: el precio que se escribe en el ~C de un
 * capitulo tiene que ser exactamente la suma de lo que se escribe en sus hijos,
 * porque la spec dice que el precio de un concepto con descomposicion "sera el
 * resultado de dicha descomposicion" y un lector estricto lo comprueba. Sumando
 * sin redondear y redondeando solo al imprimir, la raiz salia descuadrada un
 * centimo respecto a la suma de sus capitulos.
 */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Fecha en DDMMAAAA, el formato de fechas del estandar. */
function fmtDate(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  return `${dd}${mm}${yyyy}`
}

/**
 * Caracteres tipograficos que NO existen en latin1 y que entran constantemente
 * al pegar texto de Word: comillas curvas, guion largo, puntos suspensivos...
 *
 * Importa porque el fichero se escribe en latin1 (ANSI) y `Buffer.from(s,
 * 'latin1')` se queda con el BYTE BAJO del caracter, sin avisar. Un guion largo
 * `—` (U+2014) saldria como 0x14, que es un caracter de CONTROL, y unas
 * comillas `“` (U+201C) como 0x1C: el fichero llega corrupto al otro programa.
 */
const LATIN1_FALLBACKS = {
  '‘': "'", '’': "'", '‚': ',', '‛': "'",
  '“': '"', '”': '"', '„': '"', '‟': '"',
  '′': "'", '″': '"',
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '―': '-',
  '…': '...', '•': '-', ' ': ' ', ' ': ' ', ' ': ' ',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ',
  '​': '', '‌': '', '‍': '', '﻿': '',
  '€': 'EUR', // el euro no esta en ISO-8859-1
  '™': '(TM)', '‹': '<', '›': '>',
  '⅛': '1/8', '¼': '1/4', '½': '1/2', '¾': '3/4',
  '�': '',    // caracter de reemplazo: texto que ya venia roto
}

/**
 * Deja el texto en caracteres que latin1 sepa representar.
 *
 * Primero las sustituciones tipograficas; despues, lo que siga fuera de latin1
 * se intenta salvar quitandole los diacriticos (`ā` -> `a`, `ş` -> `s`) y, si
 * aun asi no cabe, se sustituye por `?`. Las vocales acentuadas del castellano
 * y la ñ SI estan en latin1, asi que no se tocan.
 */
function toLatin1Safe(str) {
  let s = str.replace(/[  -⁯€™¼-¾﻿�]/g, (ch) =>
    LATIN1_FALLBACKS[ch] !== undefined ? LATIN1_FALLBACKS[ch] : ch
  )

  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\xFF]/.test(s)) return s

  return s.replace(/[^\x00-\xFF]/gu, (ch) => {
    const plain = ch
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[^\x00-\xFF]/gu, '')
    return plain || '?'
  })
}

/**
 * Limpia un texto para que quepa en un campo BC3.
 *
 * Quita el HTML (las condiciones y algunas descripciones vienen del editor
 * rico) y los caracteres que SON separadores del formato: `~` inicia registro,
 * `|` separa campos y `\` separa subcampos. Si se cuelan, el fichero que lee el
 * otro programa queda partido por la mitad.
 */
function cleanText(raw, { singleLine = true } = {}) {
  if (raw === null || raw === undefined) return ''
  let s = String(raw)

  // HTML -> texto: los bloques se convierten en salto de linea antes de limpiar
  s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n')
  s = s.replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
  s = s.replace(/<[^>]*>/g, '')
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

  // Separadores del formato y caracteres de control
  s = s.replace(/[~|\\]/g, ' ')
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '')

  if (singleLine) {
    s = s.replace(/[\r\n]+/g, ' ')
  } else {
    s = s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n')
  }

  // Lo ultimo: dejarlo representable en latin1, que es como se escribe el fichero
  s = toLatin1Safe(s)

  return s.replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * Convierte un codigo de Construgest ("01", "01.01") en un CODIGO valido de BC3.
 * Solo se permiten caracteres seguros, y nunca `#` (que el formato reserva para
 * marcar raiz y capitulo) ni los separadores.
 */
function sanitizeCode(raw, fallback, suffixLen = 0) {
  let s = String(raw ?? '').toUpperCase()
  s = s.replace(/[^A-Z0-9._\-+/]/g, '')
  s = s.slice(0, MAX_CODE - suffixLen)
  return s || fallback
}

// ---------------------------------------------------------------------------
// Naturaleza (campo TIPO de ~C)
// ---------------------------------------------------------------------------

/** `resource_type` de `cons_price_breakdown` -> campo TIPO del registro ~C. */
export const RESOURCE_TYPE_TO_BC3 = {
  labor: '1',       // mano de obra
  equipment: '2',   // maquinaria y medios auxiliares
  material: '3',    // materiales
  subcontract: '0', // el formato no tiene tipo propio para subcontrata
  other: '0',
}

// ---------------------------------------------------------------------------
// Arbol de capitulos
// ---------------------------------------------------------------------------

/**
 * `/budgets/:id/full` devuelve los capitulos EN PLANO (ordenados por sort_order),
 * cada uno con sus partidas, y la jerarquia en `chapter.parent_id`. Aqui se
 * reconstruye el arbol para poder emitir los ~D de cada nivel.
 *
 * Un capitulo cuyo `parent_id` apunte a un capitulo que no viene en la lista se
 * trata como de primer nivel (no se pierde).
 */
function buildChapterTree(chapterBlocks) {
  const byId = new Map()
  for (const block of chapterBlocks) {
    byId.set(block.chapter.id, { ...block, children: [] })
  }

  const roots = []
  for (const node of byId.values()) {
    const parentId = node.chapter.parent_id
    const parent = parentId ? byId.get(parentId) : null
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }

  const bySort = (a, b) => (a.chapter.sort_order ?? 0) - (b.chapter.sort_order ?? 0)
  roots.sort(bySort)
  for (const node of byId.values()) node.children.sort(bySort)

  return roots
}

// ---------------------------------------------------------------------------
// Generacion
// ---------------------------------------------------------------------------

/**
 * Construye el contenido de un fichero BC3 a partir de un presupuesto.
 *
 * @param {object}   args
 * @param {object}   args.budget         fila de `cons_budgets`
 * @param {object}   args.project        fila de `cons_projects`
 * @param {Array}    args.chapters       [{ chapter, items: [{..., measurements }] }]
 * @param {string}  [args.programVersion] version de Construgest, para ~V
 * @param {string}  [args.author]        quien exporta (PROPIEDAD_ARCHIVO de ~V)
 * @returns {{ text: string, stats: object, warnings: string[] }}
 */
export function buildBC3({ budget, project, chapters = [], programVersion = '', author = '' }) {
  const warnings = []
  const lines = []
  const today = fmtDate(new Date())

  // Codigos ya usados en el fichero: el formato exige que un CODIGO identifique
  // un unico concepto. Dos partidas con el mismo codigo (pasa: se duplica una
  // partida y no se renumera) generarian un BC3 corrupto, asi que se desambigua.
  const usedCodes = new Set()
  function uniqueCode(base, suffix = '') {
    let code = base
    let n = 1
    while (usedCodes.has(code + suffix)) {
      const tail = `_${++n}`
      code = base.slice(0, MAX_CODE - suffix.length - tail.length) + tail
    }
    usedCodes.add(code + suffix)
    return code
  }

  // ─── ~V. Propiedad y version ──────────────────────────────────────────────
  const propiedad = cleanText(author || project?.client_name || project?.name || 'Construgest')
  const programa = cleanText(`Construgest${programVersion ? ' ' + programVersion : ''}`)
  const comentario = cleanText(
    [project?.name, budget?.name, budget?.version ? `v${budget.version}` : '']
      .filter(Boolean)
      .join(' - ')
  )
  // TIPO INFORMACION = 2 (Presupuesto). JUEGO_CARACTERES = ANSI (Windows).
  lines.push(`~V|${propiedad}|${FORMAT_VERSION}\\${today}|${programa}||ANSI|${comentario}|2||||`)

  // ─── ~K. Coeficientes ─────────────────────────────────────────────────────
  // Decimales en NEGATIVO = maximo (mas tolerante que exigirlos exactos).
  // Construgest: cantidades y mediciones DECIMAL(,3), importes DECIMAL(,2).
  // CI = 0 porque Construgest todavia no tiene costes indirectos por partida
  // (carencia A4 de docs/comparativa-presto.md); GG, BI e IVA salen del presupuesto.
  const gg = fmt(budget?.overhead_pct ?? 0, 2)
  const bi = fmt(budget?.profit_pct ?? 0, 2)
  const iva = fmt(budget?.tax_rate ?? 0, 2)
  lines.push(`~K|-3\\-3\\-3\\-3\\-2\\-2\\-2\\-2\\EUR\\|0\\${gg}\\${bi}\\0\\${iva}|||`)

  // ─── Conceptos y jerarquia ────────────────────────────────────────────────
  const tree = buildChapterTree(chapters)

  const conceptRecords = []   // ~C
  const textRecords = []      // ~T
  const decompRecords = []    // ~D
  const measureRecords = []   // ~M

  let itemCount = 0
  let measurementCount = 0
  let hasSubchapters = false

  // Los avisos por partida se ACUMULAN y se resumen en uno al final: un
  // presupuesto con 40 partidas a precio 0 no debe soltar 40 avisos.
  const zeroQuantity = []
  const zeroPrice = []

  /**
   * Emite un capitulo (y recursivamente sus subcapitulos y partidas).
   * Devuelve el importe total del capitulo, que es el precio de su concepto.
   */
  function emitChapter(node, depth) {
    const ch = node.chapter
    if (depth > 0) hasSubchapters = true

    const chapterCode = uniqueCode(
      sanitizeCode(ch.code, `CAP${conceptRecords.length + 1}`, 1),
      '#'
    )
    const chapterKey = `${chapterCode}#`

    // --- Partidas del capitulo ---
    const items = (node.items || [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    const childRefs = []
    let total = 0

    for (const item of items) {
      const itemCode = uniqueCode(sanitizeCode(item.code, `P${itemCount + 1}`))
      itemCount++

      const quantity = Number(item.quantity) || 0
      const price = Number(item.unit_price) || 0
      // DM de ~K: el importe de medicion x precio lleva 2 decimales
      total += round2(quantity * price)

      if (quantity === 0) zeroQuantity.push(itemCode)
      if (price === 0) zeroPrice.push(itemCode)

      const summary = cleanText(item.name).slice(0, MAX_SUMMARY)
      const unit = cleanText(item.unit).slice(0, 16)
      conceptRecords.push(
        `~C|${itemCode}|${unit}|${summary}|${fmt(price, 2)}|${today}|0|`
      )

      // Texto descriptivo largo: solo si aporta algo mas que el resumen
      const description = cleanText(item.description, { singleLine: false })
      if (description && description !== summary) {
        textRecords.push(`~T|${itemCode}|${description}|`)
      }

      childRefs.push(`${itemCode}\\1\\${fmt(quantity, 3)}\\`)

      // --- Mediciones de la partida ---
      const measurements = (item.measurements || [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

      if (measurements.length > 0) {
        const subfields = measurements
          .map((m) => {
            measurementCount++
            // La zona (PRES-2) no tiene campo propio en ~M: se antepone al
            // comentario para no perderla al salir de Construgest.
            const zone = cleanText(m.zone)
            const desc = cleanText(m.description)
            const comment = (zone ? `[${zone}] ` : '') + desc
            return [
              '', // TIPO de linea (vacio = linea normal de medicion)
              comment,
              fmt(m.units ?? 0, 3),
              fmt(m.length ?? 0, 3),
              fmt(m.width ?? 0, 3),
              fmt(m.height ?? 0, 3),
            ].join('\\') + '\\'
          })
          .join('')

        measureRecords.push(
          `~M|${chapterKey}\\${itemCode}||${fmt(quantity, 3)}|${subfields}|`
        )
      }
    }

    // --- Subcapitulos ---
    for (const child of node.children) {
      const sub = emitChapter(child, depth + 1)
      total += sub.total
      childRefs.push(`${sub.key}\\1\\1\\`)
    }

    total = round2(total)

    // --- Concepto del capitulo (se emite despues: su precio es el total) ---
    const chapterSummary = cleanText(ch.name).slice(0, MAX_SUMMARY)
    conceptRecords.push(`~C|${chapterKey}||${chapterSummary}|${fmt(total, 2)}|${today}|0|`)

    const chapterText = cleanText(ch.description, { singleLine: false })
    if (chapterText && chapterText !== chapterSummary) {
      textRecords.push(`~T|${chapterKey}|${chapterText}|`)
    }

    if (childRefs.length > 0) {
      decompRecords.push(`~D|${chapterKey}|${childRefs.join('')}|`)
    }

    return { key: chapterKey, total }
  }

  // --- Raiz de la obra ---
  const rootCode = uniqueCode(sanitizeCode(project?.name, 'OBRA', 2), '##')
  const rootKey = `${rootCode}##`

  const rootRefs = []
  let budgetTotal = 0
  for (const node of tree) {
    const result = emitChapter(node, 0)
    budgetTotal += result.total
    rootRefs.push(`${result.key}\\1\\1\\`)
  }
  budgetTotal = round2(budgetTotal)

  const rootSummary = cleanText(project?.name || budget?.name || 'Obra').slice(0, MAX_SUMMARY)
  conceptRecords.push(`~C|${rootKey}||${rootSummary}|${fmt(budgetTotal, 2)}|${today}|0|`)
  if (rootRefs.length > 0) {
    decompRecords.push(`~D|${rootKey}|${rootRefs.join('')}|`)
  }

  const rootText = cleanText(project?.description, { singleLine: false })
  if (rootText && rootText !== rootSummary) {
    textRecords.push(`~T|${rootKey}|${rootText}|`)
  }

  // ─── Orden de salida: ~V, ~K, ~C, ~D, ~T, ~M ──────────────────────────────
  // Los conceptos se emiten antes de la jerarquia para que un lector secuencial
  // ya los conozca cuando llegue a los ~D.
  lines.push(...conceptRecords, ...decompRecords, ...textRecords, ...measureRecords)

  // ─── Avisos ───────────────────────────────────────────────────────────────
  /** "01.01, 01.02 y 3 mas" — para no soltar un aviso por partida. */
  function listCodes(codes, max = 6) {
    if (codes.length <= max) return codes.join(', ')
    return `${codes.slice(0, max).join(', ')} y ${codes.length - max} mas`
  }

  if (zeroQuantity.length > 0) {
    warnings.push(
      `${zeroQuantity.length} ${zeroQuantity.length === 1 ? 'partida va' : 'partidas van'} ` +
      `con cantidad 0: ${listCodes(zeroQuantity)}.`
    )
  }
  if (zeroPrice.length > 0) {
    warnings.push(
      `${zeroPrice.length} ${zeroPrice.length === 1 ? 'partida va' : 'partidas van'} ` +
      `con precio 0: ${listCodes(zeroPrice)}.`
    )
  }
  if (hasSubchapters) {
    warnings.push(
      'El presupuesto tiene subcapitulos. Se exportan con su jerarquia real, pero ' +
      'el importador de Construgest solo lee dos niveles (capitulo > partida).'
    )
  }
  if (itemCount === 0) {
    warnings.push('El presupuesto no tiene partidas: el BC3 sale practicamente vacio.')
  }

  return {
    text: lines.join('\r\n') + '\r\n',
    stats: {
      chapters: conceptRecords.length - itemCount - 1, // menos partidas y menos raiz
      items: itemCount,
      measurements: measurementCount,
      total: budgetTotal,
    },
    warnings,
  }
}

/**
 * Igual que `buildBC3` pero devuelve el Buffer listo para descargar.
 *
 * Se codifica en latin1 porque el ~V declara `ANSI` (cp1252) y, para el texto
 * castellano (acentos, ñ, ¿, ¡), latin1 y cp1252 coinciden byte a byte. En UTF-8
 * los acentos saldrian como basura en Presto y Arquimedes.
 */
export function buildBC3Buffer(args) {
  const result = buildBC3(args)
  return { ...result, buffer: Buffer.from(result.text, 'latin1') }
}
