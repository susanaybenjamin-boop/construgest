/**
 * Parser de archivos Presto .pzh (presupuestos de construcción)
 *
 * Formato PZH: binario propietario de Presto.
 * Estructura de registros detectada por ingeniería inversa:
 *
 *   Marcador: 0x3A 0x01
 *   Bytes 2-3: tamaño del registro (uint16 LE)
 *   Bytes 6-7: secuencia (uint16 LE)
 *   Bytes 10-22: código (13 bytes, space-padded, latin1)
 *   Byte 24: tipo de registro:
 *     0x10 → Capítulo
 *     0x11 → Partida (con unidad, precio, cantidad)
 *     0x20 → Porcentaje
 *     0x21 → Precio compuesto
 *     0x01 → Material
 *     0x08 → Maquinaria
 *     0x05/0x06 → Mano de obra
 *
 *   Campos TLV (tag-length-value con terminador 0x00):
 *     Tag 0x04 → Nombre del proyecto
 *     Tag 0x05 → Unidad de medida
 *     Tag 0x06 → Descripción
 *
 *   Sección numérica (tag 0x08):
 *     2 bytes flag + 0x09 + IEEE 754 doubles con tags:
 *       0x20 (space) → Precio directo
 *       0x21 (!)     → Importe
 *       0x25 (%)     → Precio con costes indirectos
 *       0x2A (*)     → Factor porcentual A
 *       0x34 (4)     → Importe total A
 */

/**
 * Lee un string terminado en 0x00 desde el buffer.
 * @returns {{ value: string, endOffset: number }} o null si no se puede leer
 */
function readNullTermString(buffer, offset, maxLen) {
  const end = buffer.indexOf(0x00, offset)
  if (end < 0 || end > offset + maxLen) return null
  return {
    value: buffer.toString('latin1', offset, end),
    endOffset: end + 1,
  }
}

/**
 * Parsea la sección numérica de un registro PZH.
 * Extrae doubles IEEE 754 etiquetados.
 *
 * Estructura detectada:
 *   tag 0x08 + 2 bytes flags + 0x09
 *   [8 bytes] = precio base (double LE)
 *   Después una mezcla de:
 *     - tags cortos (1 byte + 1 byte): 0x0E, 0x0F, 0x14 → flags de formato
 *     - tags largos (1 byte + 8 bytes double): 0x1E, 0x20-0x35 → precios/cantidades
 *   En Presto POWER00DIC02004 aparece 0x1E como double (cantidad?); en otras
 *   versiones solo se ven tags >= 0x20 como doubles.
 */
const SHORT_FLAG_TAGS = new Set([0x0E, 0x0F, 0x14]) // tags de 1 byte de valor

function parseNumericSection(buffer, offset, endOffset) {
  const nums = {}
  let pos = offset + 3 // skip tag 0x08 + 2 flag bytes
  if (pos < endOffset && buffer[pos] === 0x09) pos++ // skip 0x09

  // Primer double sin tag explícito = precio base (precio unitario total)
  if (pos + 8 <= endOffset) {
    const val = buffer.readDoubleLE(pos)
    if (Number.isFinite(val) && Math.abs(val) < 1e12) {
      nums.base = Math.round(val * 100) / 100
    }
    pos += 8
  }

  // Recorrer tags hasta agotar el registro. Los tags conocidos de 1 byte se
  // saltan como flags; el resto se interpretan como doubles de 8 bytes.
  while (pos < endOffset) {
    const tag = buffer[pos]

    if (SHORT_FLAG_TAGS.has(tag)) {
      pos += 2 // tag + valor de 1 byte
      continue
    }

    // Double: necesita 9 bytes disponibles
    if (pos + 9 > endOffset) break
    const val = buffer.readDoubleLE(pos + 1)
    if (!Number.isFinite(val) || Math.abs(val) >= 1e12) {
      // Valor absurdo: probablemente no es un double aquí. Avanzar 1 byte y reintentar.
      pos++
      continue
    }
    const rounded = Math.round(val * 100) / 100
    if (tag === 0x1E) nums.quantity = rounded          // Cantidad/rendimiento (POWER00DIC02004)
    else if (tag === 0x20) nums.directPrice = rounded
    else if (tag === 0x21) nums.amount = rounded
    else if (tag === 0x25) nums.indirectPrice = rounded
    else if (tag === 0x26) nums.altCost = rounded
    else if (tag === 0x2A) nums.factorA = rounded
    else if (tag === 0x2B) nums.factorB = rounded
    else if (tag === 0x34) nums.totalA = rounded
    else if (tag === 0x35) nums.totalB = rounded
    pos += 9
  }

  return nums
}

/**
 * Intenta parsear un registro con un offset de código concreto.
 * Distintas versiones de Presto usan layouts ligeramente diferentes:
 *   - Layout estándar: código @+10, typeByte @+24, tags TLV @+28
 *   - Layout extendido (POWER00DIC02004): 9 bytes extra (referencia al padre),
 *     código @+19, typeByte @+33, tags TLV @+37
 */
function tryLayout(buffer, offset, codeOffset, recEnd) {
  const codeEnd = offset + codeOffset + 13
  if (codeEnd + 5 >= recEnd) return null
  const code = buffer.toString('latin1', offset + codeOffset, codeEnd).trim()
  // Código válido: letras ASCII, dígitos, puntos, guiones, barras, espacios
  if (!code || !/^[A-Za-z0-9_./\- ]{1,13}$/.test(code)) return null
  const typeByte = buffer[codeEnd + 1] // byte tras separador (0x01) que sigue al code

  // Tras el code hay una cabecera fija de 5 bytes: separador(01) + typeByte + 00 02 XX,
  // donde XX es el primer tag real (0x04/0x05/0x06 según el registro).
  // Saltamos directamente a ese primer tag.
  let pos = codeEnd + 5

  let unit = '', description = '', project = ''
  let nums = {}

  while (pos < recEnd - 1) {
    const tag = buffer[pos]

    if (tag === 0x04) {
      const str = readNullTermString(buffer, pos + 1, 200)
      if (str) { project = str.value; pos = str.endOffset }
      else pos++
    } else if (tag === 0x05) {
      const str = readNullTermString(buffer, pos + 1, 50)
      if (str) { unit = str.value; pos = str.endOffset }
      else pos++
    } else if (tag === 0x06) {
      const str = readNullTermString(buffer, pos + 1, 1000)
      if (str) { description = str.value; pos = str.endOffset }
      else pos++
    } else if (tag === 0x08) {
      nums = parseNumericSection(buffer, pos, recEnd)
      break // sección numérica es lo último
    } else {
      pos++
    }
  }

  // Validar que se extrajo algo útil (evita falsos positivos del layout alternativo)
  if (!description && !unit && !nums.base) return null

  return { code, typeByte, unit, description, project, nums, recEnd }
}

/**
 * Parsea un registro individual del archivo PZH.
 * Prueba múltiples layouts para soportar distintas versiones de Presto.
 */
function parseRecord(buffer, offset) {
  if (offset + 30 > buffer.length) return null
  if (buffer[offset] !== 0x3a || buffer[offset + 1] !== 0x01) return null

  const recLen = buffer.readUInt16LE(offset + 2)
  if (recLen < 20 || recLen > 10000) return null
  const recEnd = Math.min(offset + recLen + 4, buffer.length)

  // Probar layout estándar primero (código @+10). Si no da resultados válidos,
  // probar el layout extendido de Presto POWER00DIC02004 (código @+19 con prefijo
  // de 9 bytes que contiene una referencia al padre).
  return tryLayout(buffer, offset, 10, recEnd) || tryLayout(buffer, offset, 19, recEnd)
}

/**
 * Extrae líneas de medición del archivo PZH.
 *
 * TRES PATRONES de medición detectados en PZH:
 *   A) CON concepto:        código + 0x01 0x04 + string + 0x00 + tags doubles
 *   B) CON concepto y prefijo: código + 0x01 0x02 0x01 0x04 + string + 0x00 + tags doubles
 *   C) SIN concepto:        código + 0x01 + tags doubles directamente (0x0C/0x0D/0x0E/0x0F)
 *
 * Tags de dimensiones: 0x0C=N(uds), 0x0D=Largo, 0x0E=Ancho, 0x0F=Alto
 *
 * Previsto para cualquier presupuesto PZH:
 *   - Acepta códigos con mayúsculas, minúsculas, dígitos, puntos, guiones
 *   - Acepta mediciones con o sin comentario/concepto
 *   - Acepta mediciones con solo N (sin dimensiones), o solo dimensiones (sin N)
 *   - Filtro de valores razonables (|val| < 100000) para evitar falsos positivos
 *
 * @returns {Map<string, Array<{description, units, length, width, height, partial}>>}
 */
function extractMeasurements(buffer) {
  const measurements = new Map()
  const text = buffer.toString('latin1')
  // Límite de valor razonable para descartar falsos positivos (bytes en sección descomposición)
  const MAX_REASONABLE = 100000

  for (let i = 0; i < buffer.length - 10; i++) {
    if (buffer[i] !== 0x01) continue

    const nextByte = buffer[i + 1]
    // Patrón A: 0x01 0x04 + string concepto + 0x00 + tags doubles
    // Patrón B: 0x01 0x02 0x01 0x04 + string + 0x00 + tags doubles
    // Patrón C: 0x01 + tag double directo (0x0C-0x0F) → sin concepto
    const hasComment = nextByte === 0x04
    const hasPrefixComment = nextByte === 0x02 && buffer[i + 2] === 0x01 && buffer[i + 3] === 0x04
    const hasDirectTag = nextByte >= 0x0C && nextByte <= 0x0F
    if (!hasComment && !hasPrefixComment && !hasDirectTag) continue

    // Retroceder para encontrar el código de partida (13 bytes space-padded).
    // El código termina antes de los posibles bytes 0x01/0x02 que forman parte del prefijo.
    let codeEnd = i
    while (codeEnd > 0 && buffer[codeEnd - 1] === 0x20) codeEnd--
    if (codeEnd <= 1) continue

    let codeStart = codeEnd
    while (codeStart > 0 && buffer[codeStart - 1] !== 0x00 && buffer[codeStart - 1] !== 0x20 &&
           codeStart > codeEnd - 15) {
      codeStart--
    }
    if (buffer[codeStart] === 0x20 || buffer[codeStart] === 0x00) codeStart++

    const code = text.substring(codeStart, codeEnd).trim()
    if (!code || !/^[A-Za-z0-9]/.test(code)) continue

    // Leer comentario (solo en patrones A y B)
    let comment = ''
    let doublesStart

    if (hasPrefixComment) {
      // i+3 apunta a 0x04, i+4 al primer carácter
      const strEnd = buffer.indexOf(0x00, i + 4)
      if (strEnd < 0 || strEnd > i + 500) continue
      comment = strEnd > i + 4 ? buffer.toString('latin1', i + 4, strEnd) : ''
      doublesStart = strEnd + 1
    } else if (hasComment) {
      const strEnd = buffer.indexOf(0x00, i + 2)
      if (strEnd < 0 || strEnd > i + 500) continue
      comment = strEnd > i + 2 ? buffer.toString('latin1', i + 2, strEnd) : ''
      doublesStart = strEnd + 1
    } else {
      // Patrón C: los tags doubles empiezan directamente en i+1
      doublesStart = i + 1
    }

    // Leer doubles etiquetados: 0x0C=N, 0x0D=Largo, 0x0E=Ancho, 0x0F=Alto
    let pos = doublesStart
    let n = 0, largo = 0, ancho = 0, alto = 0
    let hasData = false
    const maxPos = Math.min(buffer.length, doublesStart + 100)

    while (pos + 9 <= maxPos) {
      const tag = buffer[pos]
      if (tag < 0x0C || tag > 0x0F) break

      const val = buffer.readDoubleLE(pos + 1)
      // Validar: finito y dentro de rango razonable
      if (!Number.isFinite(val) || Math.abs(val) > MAX_REASONABLE) {
        hasData = false // Invalidar toda la medición si un valor es absurdo
        break
      }

      if (tag === 0x0C) { n = val; hasData = true }
      else if (tag === 0x0D) { largo = val; hasData = true }
      else if (tag === 0x0E) { ancho = val; hasData = true }
      else if (tag === 0x0F) { alto = val; hasData = true }
      pos += 9
    }

    if (!hasData) continue

    // Redondear valores antes de evaluar (evitar falsos por tiny doubles como 1e-300)
    n = Math.round(n * 100) / 100
    largo = Math.round(largo * 100) / 100
    ancho = Math.round(ancho * 100) / 100
    alto = Math.round(alto * 100) / 100

    // Descartar líneas cabecera/separador donde todos los valores son 0
    if (n === 0 && largo === 0 && ancho === 0 && alto === 0) continue

    // Calcular parcial: N × Largo × Ancho × Alto (dimensiones 0 se tratan como 1)
    const dims = [largo, ancho, alto].filter(d => d !== 0)
    let partial
    if (n !== 0) {
      partial = dims.length > 0 ? n * dims.reduce((a, b) => a * b, 1) : n
    } else {
      partial = dims.reduce((a, b) => a * b, 1)
    }

    if (!measurements.has(code)) measurements.set(code, [])
    measurements.get(code).push({
      description: comment.replace(/[\x00-\x1f]/g, ' ').trim().substring(0, 200) || '',
      units: n,
      length: largo,
      width: ancho,
      height: alto,
      partial: Math.round(partial * 100) / 100,
    })
  }

  return measurements
}

/**
 * Extrae las cantidades de los registros de descomposición.
 *
 * Formato del registro descomp (detectado en Presto POWER00DIC02004):
 *   <child_code 13 bytes space-padded> <0-2 espacios extra>
 *   0x01 (0x04 0x00 0x02 | 0x0D 0x02 0x02)   ← 4 bytes header
 *   <back_ref1: 2 bytes> 0x03 <back_ref2: 2 bytes>   ← punteros a registros
 *   0x0E <double 8 bytes>    ← cantidad total en el presupuesto
 *   [resto: enteros opcionales]
 *
 * La cantidad extraída representa cuánto del concepto hijo se usa en el padre,
 * que es la cantidad real del presupuesto (distinta del rendimiento base).
 *
 * @returns {Map<string, number>} Mapa código → cantidad total
 */
function extractDescompAmounts(buffer) {
  const amounts = new Map()

  for (let i = 20; i < buffer.length - 30; i++) {
    if (buffer[i] !== 0x01) continue
    const b1 = buffer[i + 1], b2 = buffer[i + 2], b3 = buffer[i + 3]
    const isDescomp = (b1 === 0x04 && b2 === 0x00 && b3 === 0x02) ||
                      (b1 === 0x0D && b2 === 0x02 && b3 === 0x02)
    if (!isDescomp) continue

    // Tras el header de 4 bytes hay 5 bytes de back-refs (XX XX 03 XX XX), luego 0x0E
    const tagPos = i + 9
    if (tagPos + 9 > buffer.length) continue
    if (buffer[tagPos] !== 0x0E) continue

    const amount = buffer.readDoubleLE(tagPos + 1)
    if (!Number.isFinite(amount) || Math.abs(amount) > 1e9) continue

    // Retroceder para encontrar el código (13 bytes space-padded)
    let codeEnd = i
    while (codeEnd > 0 && buffer[codeEnd - 1] === 0x20) codeEnd--
    if (codeEnd <= 1) continue
    let codeStart = codeEnd
    while (codeStart > 0 && codeStart > codeEnd - 15 &&
           buffer[codeStart - 1] !== 0x00 && buffer[codeStart - 1] !== 0x20) {
      codeStart--
    }
    const code = buffer.toString('latin1', codeStart, codeEnd).trim()
    if (!code || !/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,14}$/.test(code)) continue

    const rounded = Math.round(amount * 1000) / 1000
    // Si el código aparece varias veces (hijo en distintos padres), nos quedamos
    // con el primero (normalmente es el uso en capítulo directo).
    if (!amounts.has(code)) amounts.set(code, rounded)
  }

  return amounts
}

/**
 * Extrae la tabla de descomposición (jerarquía padre→hijos) del archivo PZH.
 * Escanea el buffer buscando pares de códigos de 13 bytes (parent + child)
 * en la sección de descomposición del archivo.
 *
 * @returns {Map<string, string[]>} Mapa padre → lista de hijos ordenados
 */
function extractDecomposition(buffer) {
  const validCode = /^[A-Za-z0-9][A-Za-z0-9._-]{0,12}$/
  const decomp = new Map()

  // La sección de descomposición está típicamente en la segunda mitad del archivo
  const searchStart = Math.floor(buffer.length * 0.3)

  for (let i = searchStart; i < buffer.length - 26; i++) {
    const parent = buffer.toString('latin1', i, i + 13).trim()
    const child = buffer.toString('latin1', i + 13, i + 26).trim()

    if (!parent || !child || parent.length < 2 || child.length < 2) continue
    if (!validCode.test(parent) || !validCode.test(child)) continue
    if (parent === child) continue

    if (!decomp.has(parent)) decomp.set(parent, [])
    const children = decomp.get(parent)
    if (!children.includes(child)) {
      children.push(child)
    }
  }

  return decomp
}

/**
 * Parser principal de archivos PZH.
 *
 * @param {Buffer} buffer - Contenido binario del archivo .pzh
 * @returns {{ chapters: Array<{ code: string, name: string, items: Array }> }}
 */
export function parsePZH(buffer) {
  if (!buffer || buffer.length === 0) {
    console.warn('[PZH] Buffer vacío')
    return { chapters: [] }
  }

  // Paso 1: Parsear todos los registros marcados con 0x3A 0x01
  const chapterRecords = new Map()  // código → { code, name }  (typeByte 0x10)
  const partidaRecords = new Map()  // código → { code, unit, description, price, ... }  (typeByte 0x11)

  // Patrón de código de capítulo (usado para clasificar cuando typeByte no es 0x10)
  const looksLikeChapterCode = (c) =>
    /^[CK]\d{1,2}$/.test(c) ||        // C01, K21
    /^\d{1,3}$/.test(c) ||             // 01, 02, 001
    /^CAP\d{1,3}$/i.test(c) ||         // CAP01
    /^[CK]\d{1,2}\.\d{1,2}$/.test(c)   // C08.01

  for (let i = 0; i < buffer.length - 30; i++) {
    if (buffer[i] !== 0x3a || buffer[i + 1] !== 0x01) continue

    const record = parseRecord(buffer, i)
    if (!record) continue

    // Algunas versiones de Presto (p. ej. POWER00DIC02004) marcan capítulos
    // indistintamente con typeByte 0x10 o 0x11. Si el código tiene patrón de
    // capítulo, lo tratamos como tal aunque el typeByte diga 0x11.
    const isChapter = record.typeByte === 0x10 ||
                      (record.typeByte === 0x11 && looksLikeChapterCode(record.code))

    if (isChapter && record.description) {
      chapterRecords.set(record.code, {
        code: record.code,
        name: record.description,
      })
    } else if (!isChapter && record.description) {
      // Recoger TODOS los registros con descripción como candidatos a partida.
      // La tabla de descomposición decidirá cuáles son partidas reales
      // (hijas directas de capítulos) vs componentes de precio.
      // base = precio total unitario correcto; directPrice (tag 0x20) es precio de componente
      const price = record.nums.base ?? record.nums.indirectPrice ?? 0
      const amount = record.nums.amount ?? record.nums.totalA ?? 0
      // Cantidad: primero el tag 0x1E (rendimiento directo en POWER00DIC02004),
      // si no se puede derivar de amount/price
      let quantity = record.nums.quantity ?? 0
      if (!quantity && price > 0 && amount > 0) {
        quantity = Math.round((amount / price) * 100) / 100
      }

      partidaRecords.set(record.code, {
        code: record.code,
        unit: record.unit || 'UD',
        description: record.description,
        unit_price: price,
        quantity,
        amount,
      })
    }

    // Avance conservador: saltamos solo hasta el final del header de 4 bytes.
    // Algunas versiones de Presto (POWER00DIC02004) anidan records dentro del
    // recLen declarado, por lo que saltar `recLen` bytes se saltaría capítulos.
    // Los Maps deduplican por código si hubiese reescaneo.
    i += 3
  }

  // Paso 1b: Extraer mediciones
  const measurements = extractMeasurements(buffer)
  const totalMeas = Array.from(measurements.values()).reduce((s, m) => s + m.length, 0)

  // Paso 1c: Extraer cantidades de la tabla de descomposición (cantidad total en presupuesto)
  const descompAmounts = extractDescompAmounts(buffer)

  // Paso 2: Extraer tabla de descomposición (jerarquía padre→hijos)
  const decomp = extractDecomposition(buffer)

  // Logging diagnóstico
  console.log(`[PZH] Records: ${chapterRecords.size} chapters, ${partidaRecords.size} partidas, ${totalMeas} mediciones, ${descompAmounts.size} amounts`)
  if (chapterRecords.size > 0) console.log(`[PZH] Chapter codes: ${[...chapterRecords.keys()].slice(0, 30).join(', ')}`)
  if (decomp.size > 0) console.log(`[PZH] Decomp roots (top 15): ${[...decomp.keys()].slice(0, 15).join(', ')}`)

  // Encontrar la raíz del proyecto — aceptar múltiples patrones
  const ROOT_PREFIXES = ['PROYECTO', 'PRESUPUESTO', 'OBRA', 'ROOT', 'PROY']
  let rootCode = null
  for (const [code] of decomp) {
    if (ROOT_PREFIXES.some(p => code.toUpperCase().startsWith(p))) { rootCode = code; break }
  }
  // Fallback: nodo en decomp con más hijos que no sea partida (probablemente la raíz)
  if (!rootCode) {
    let maxChildren = 0
    for (const [code, children] of decomp) {
      if (children.length > maxChildren && !partidaRecords.has(code)) {
        maxChildren = children.length
        rootCode = code
      }
    }
  }
  if (rootCode) console.log(`[PZH] Root: ${rootCode} (${(decomp.get(rootCode) || []).length} hijos)`)

  // Paso 3: Construir la estructura de capítulos usando la descomposición
  const finalChapters = []

  // Patrón flexible para códigos de capítulo
  const isChapterCode = (c) =>
    /^[CK]\d{1,2}$/.test(c) ||        // C01, K21
    /^\d{1,3}$/.test(c) ||             // 01, 02, 001
    /^CAP\d{1,3}$/i.test(c) ||         // CAP01
    /^[CK]\d{1,2}\.\d{1,2}$/.test(c)   // C08.01

  const rootChildren = rootCode ? (decomp.get(rootCode) || []) : []
  // Filtrar capítulos: primero por patrón de código, luego por ser chapterRecord
  const mainChapterCodes = rootChildren.filter(c => isChapterCode(c) || chapterRecords.has(c))

  if (mainChapterCodes.length === 0) {
    // Fallback 1: usar todos los capítulos encontrados con typeByte 0x10
    for (const [code] of chapterRecords) {
      if (isChapterCode(code)) mainChapterCodes.push(code)
    }
    mainChapterCodes.sort()
  }

  if (mainChapterCodes.length === 0 && chapterRecords.size > 0) {
    // Fallback 2: usar TODOS los chapterRecords que tengan hijos en decomp
    for (const [code] of chapterRecords) {
      if (decomp.has(code)) mainChapterCodes.push(code)
    }
    mainChapterCodes.sort()
  }

  let globalChapterIdx = 0

  for (const chCode of mainChapterCodes) {
    const chRecord = chapterRecords.get(chCode)
    if (!chRecord) continue

    const chChildren = decomp.get(chCode) || []

    // Separar hijos en: subcapítulos (tienen typeByte 0x10 o son capítulos con sus propios hijos)
    // vs partidas directas (tienen typeByte 0x11)
    const subChapters = []
    const directPartidas = []

    // Patrón de código de subcapítulo real: C08.01, K21, 001, etc. (códigos cortos)
    // Los precios compuestos con typeByte 0x10 tienen códigos largos (08EPP00113) → no son subcapítulos
    const subChapterCodePattern = /^[CK]?\d{1,3}(\.\d{1,2})?$/

    for (const childCode of chChildren) {
      // Es subcapítulo si: tiene registro de capítulo + hijos en descomposición + código corto tipo capítulo
      const isSubChapter = chapterRecords.has(childCode) && decomp.has(childCode) &&
                           subChapterCodePattern.test(childCode)
      if (isSubChapter) {
        subChapters.push(childCode)
      } else if (partidaRecords.has(childCode)) {
        directPartidas.push(childCode)
      }
    }

    // Helper: crear items de partida a partir de códigos.
    // Prioridad de cantidad: mediciones (suma de parciales) > descomp amount > qty del registro
    const buildItems = (partidaCodes) => partidaCodes.map(pCode => {
      const p = partidaRecords.get(pCode)
      if (!p) return null
      const meas = measurements.get(pCode) || []
      const measTotal = meas.reduce((s, m) => s + m.partial, 0)
      const descAmount = descompAmounts.get(pCode) ?? 0
      const quantity = measTotal > 0
        ? Math.round(measTotal * 100) / 100
        : (descAmount > 0 ? descAmount : p.quantity)

      // Si no hay líneas de medición pero sí hay cantidad, crear medición sintética
      // para que la importación refleje la cantidad correctamente
      const finalMeas = meas.length > 0 ? meas : (quantity > 0 ? [{
        description: p.description.substring(0, 80),
        units: quantity,
        length: 0,
        width: 0,
        height: 0,
        partial: quantity,
      }] : [])

      return {
        code: pCode,
        name: p.description.substring(0, 120),
        description: p.description,
        unit: p.unit,
        quantity,
        unit_price: p.unit_price,
        measurements: finalMeas,
      }
    }).filter(Boolean)

    // A) Si hay partidas directas, crear capítulo con ellas
    if (directPartidas.length > 0) {
      globalChapterIdx++
      const items = buildItems(directPartidas)
      if (items.length > 0) {
        finalChapters.push({
          code: String(globalChapterIdx).padStart(2, '0'),
          name: chRecord.name,
          items,
        })
      } else {
        globalChapterIdx--
      }
    }

    // B) Promover SIEMPRE los subcapítulos a capítulos independientes
    // Ej: C15 → C08.01 se convierte en capítulo propio
    // Ej: C06 → K21 se convierte en capítulo propio (URBANIZACIÓN)
    for (const subCode of subChapters) {
      const subRecord = chapterRecords.get(subCode)
      if (!subRecord) continue

      const subChildren = decomp.get(subCode) || []
      const subPartidas = subChildren.filter(c => partidaRecords.has(c))

      if (subPartidas.length === 0) continue

      globalChapterIdx++
      const items = buildItems(subPartidas)
      if (items.length > 0) {
        finalChapters.push({
          code: String(globalChapterIdx).padStart(2, '0'),
          name: subRecord.name,
          items,
        })
      } else {
        globalChapterIdx--
      }
    }
  }

  // Fallback: si no se encontraron capítulos pero sí partidas, intentar agrupar por decomp
  if (finalChapters.length === 0 && partidaRecords.size > 0) {
    console.log(`[PZH] Fallback: intentando agrupar ${partidaRecords.size} partidas por descomposición`)
    // Buscar capítulos que contengan partidas directamente
    for (const [parentCode, children] of decomp) {
      if (!chapterRecords.has(parentCode)) continue
      const childPartidas = children.filter(c => partidaRecords.has(c))
      if (childPartidas.length === 0) continue
      const chRecord = chapterRecords.get(parentCode)
      globalChapterIdx++
      const items = childPartidas.map(pCode => {
        const p = partidaRecords.get(pCode)
        if (!p) return null
        const meas = measurements.get(pCode) || []
        const measTotal = meas.reduce((s, m) => s + m.partial, 0)
        const descAmount = descompAmounts.get(pCode) ?? 0
        const quantity = measTotal > 0
          ? Math.round(measTotal * 100) / 100
          : (descAmount > 0 ? descAmount : p.quantity)
        const finalMeas = meas.length > 0 ? meas : (quantity > 0 ? [{
          description: p.description.substring(0, 80),
          units: quantity, length: 0, width: 0, height: 0, partial: quantity,
        }] : [])
        return {
          code: pCode,
          name: p.description.substring(0, 120),
          description: p.description,
          unit: p.unit, quantity,
          unit_price: p.unit_price,
          measurements: finalMeas,
        }
      }).filter(Boolean)
      if (items.length > 0) {
        finalChapters.push({
          code: String(globalChapterIdx).padStart(2, '0'),
          name: chRecord.name,
          items,
        })
      }
    }
  }

  // Último recurso: si aún no hay capítulos, crear uno genérico con todas las partidas
  if (finalChapters.length === 0 && partidaRecords.size > 0) {
    console.log(`[PZH] Último recurso: capítulo único con ${partidaRecords.size} partidas`)
    const items = [...partidaRecords.values()].map(p => {
      const meas = measurements.get(p.code) || []
      const measTotal = meas.reduce((s, m) => s + m.partial, 0)
      const descAmount = descompAmounts.get(p.code) ?? 0
      const quantity = measTotal > 0
        ? Math.round(measTotal * 100) / 100
        : (descAmount > 0 ? descAmount : p.quantity)
      const finalMeas = meas.length > 0 ? meas : (quantity > 0 ? [{
        description: p.description.substring(0, 80),
        units: quantity, length: 0, width: 0, height: 0, partial: quantity,
      }] : [])
      return {
        code: p.code,
        name: p.description.substring(0, 120),
        description: p.description,
        unit: p.unit, quantity,
        unit_price: p.unit_price,
        measurements: finalMeas,
      }
    })
    if (items.length > 0) {
      finalChapters.push({
        code: '01',
        name: 'Presupuesto General',
        items,
      })
    }
  }

  // Paso 4: Autonumerar partidas dentro de cada capítulo
  const result = finalChapters.map(ch => ({
    code: ch.code,
    name: ch.name,
    items: ch.items.map((item, ii) => ({
      ...item,
      code: `${ch.code}.${String(ii + 1).padStart(2, '0')}`,
    })),
  }))

  const totalItems = result.reduce((s, ch) => s + ch.items.length, 0)
  console.log(`[PZH] Resultado final: ${result.length} capítulos, ${totalItems} partidas, ${totalMeas} mediciones`)

  return { chapters: result }
}
