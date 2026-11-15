// ============================================================================
// REVISIÓN DE LA HOJA DE MEDICIONES (AI-7).
//
// Aritmética pura, sin IA: caza los errores que acaban en el presupuesto que se
// le manda al cliente. El LLM, si acaso, solo redacta el resumen por encima.
//
// Por qué hace falta: el PARCIAL de cada línea es un campo que se teclea a
// mano, así que puede no corresponderse con las dimensiones escritas al lado
// (uds x largo x ancho x alto). Nadie lo comprueba hoy, y de ahí sale la
// cantidad de la partida y por tanto su importe.
//
// Devuelve el MISMO shape que `detect-issues` ({id, severity, message,
// affected_items, recommendation}) para que la pantalla de IA lo pinte sin
// tocar nada en el frontend.
// ============================================================================

/** Redondeo a 3 decimales, que es la precisión con la que se guardan. */
function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Parcial que DEBERÍA tener una línea según sus dimensiones.
 *
 * Misma regla que usa el parser de BC3: las dimensiones a cero no cuentan (una
 * medición lineal deja ancho y alto vacíos, y multiplicar por cero lo anularía
 * todo). Sin dimensiones, el parcial son las unidades.
 */
export function expectedPartial(line) {
  const units = num(line.units)
  const dims = [num(line.length), num(line.width), num(line.height)].filter((d) => d !== 0)
  if (dims.length === 0) return round3(units)
  const producto = dims.reduce((a, b) => a * b, 1)
  // Con unidades a 0 pero dimensiones escritas, se interpreta 1 unidad: es lo
  // que hace el importador y lo que espera quien mide.
  return round3((units !== 0 ? units : 1) * producto)
}

/** Normaliza el nombre de una zona para detectar las escritas de varias formas. */
export function normalizeZone(z) {
  return String(z || '')
    .toLowerCase()
    // Los ordinales ª y º NO se descomponen con NFD, y en obra se escriben a
    // todas horas ("planta 1ª", "3º"). Sin esto, "Planta 1ª" y "planta 1a" se
    // tomaban por zonas distintas, que es justo lo que se quiere detectar.
    .replace(/ª/g, 'a').replace(/º/g, 'o')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Revisa las mediciones de un presupuesto.
 *
 * @param {Array} chapters  [{ chapter, items: [{..., measurements: [...] }] }]
 * @returns {Array} avisos con el shape de detect-issues
 */
export function checkMeasurements(chapters = []) {
  const issues = []
  let seq = 0
  const nextId = () => `meas-${++seq}`

  const descuadres = []   // parcial que no cuadra con sus dimensiones
  const sinCuadrar = []   // cantidad de la partida != suma de parciales
  const aCero = []        // líneas que no suman nada
  const zonas = new Map() // zona normalizada -> Set de grafías originales

  for (const bloque of chapters) {
    const ch = bloque?.chapter || {}
    if (ch.is_legal_text) continue

    for (const item of (bloque?.items || [])) {
      const lineas = item?.measurements || []
      if (lineas.length === 0) continue

      let suma = 0
      for (const l of lineas) {
        const partial = round3(num(l.partial))
        suma += partial

        for (const z of [l.zone]) {
          if (!z || !String(z).trim()) continue
          const k = normalizeZone(z)
          if (!k) continue
          if (!zonas.has(k)) zonas.set(k, new Set())
          zonas.get(k).add(String(z).trim())
        }

        // Una línea con fórmula propia puede desviarse a propósito
        if (l.formula) continue

        const esperado = expectedPartial(l)
        if (Math.abs(partial - esperado) > 0.005) {
          descuadres.push({
            code: item.code,
            descripcion: l.description || '(sin descripción)',
            escrito: partial,
            esperado,
          })
        }

        if (partial === 0) {
          aCero.push({ code: item.code, descripcion: l.description || '(sin descripción)' })
        }
      }

      suma = round3(suma)
      const cantidad = round3(num(item.quantity))
      if (Math.abs(suma - cantidad) > 0.005) {
        sinCuadrar.push({ code: item.code, name: item.name, cantidad, suma })
      }
    }
  }

  // ── Avisos ──────────────────────────────────────────────────────────
  if (descuadres.length > 0) {
    const muestra = descuadres.slice(0, 5)
      .map((d) => `${d.code} "${d.descripcion}": pone ${d.escrito} y sale ${d.esperado}`)
      .join('; ')
    issues.push({
      id: nextId(),
      severity: 'critical',
      message:
        `${descuadres.length} ${descuadres.length === 1 ? 'línea de medición no cuadra' : 'líneas de medición no cuadran'} ` +
        `con sus dimensiones (${muestra}${descuadres.length > 5 ? '; …' : ''})`,
      affected_items: [...new Set(descuadres.map((d) => d.code))],
      recommendation:
        'Revisa el parcial: tiene que ser unidades x largo x ancho x alto, contando solo las dimensiones escritas. ' +
        'De ahí sale la cantidad de la partida y por tanto su importe.',
    })
  }

  if (sinCuadrar.length > 0) {
    const muestra = sinCuadrar.slice(0, 5)
      .map((d) => `${d.code}: cantidad ${d.cantidad} frente a ${d.suma} medido`)
      .join('; ')
    issues.push({
      id: nextId(),
      severity: 'critical',
      message:
        `${sinCuadrar.length} ${sinCuadrar.length === 1 ? 'partida tiene' : 'partidas tienen'} ` +
        `una cantidad distinta de la suma de sus mediciones (${muestra}${sinCuadrar.length > 5 ? '; …' : ''})`,
      affected_items: sinCuadrar.map((d) => d.code),
      recommendation:
        'La cantidad debería salir de las mediciones. Suele pasar en presupuestos importados: ' +
        'toca una medición de la partida para que se recalcule, o corrige la cantidad.',
    })
  }

  if (aCero.length > 0) {
    issues.push({
      id: nextId(),
      severity: 'info',
      message:
        `${aCero.length} ${aCero.length === 1 ? 'línea de medición no suma nada' : 'líneas de medición no suman nada'} ` +
        `(parcial 0)`,
      affected_items: [...new Set(aCero.map((d) => d.code))],
      recommendation: 'Si son líneas de apoyo o comentarios, déjalas; si no, bórralas para que el anexo quede limpio.',
    })
  }

  for (const [, grafias] of zonas) {
    if (grafias.size > 1) {
      issues.push({
        id: nextId(),
        severity: 'warning',
        message: `La misma zona está escrita de ${grafias.size} formas: ${[...grafias].map((g) => `"${g}"`).join(', ')}`,
        affected_items: [],
        recommendation:
          'Unifica la grafía: en el Anexo I de mediciones por zona cada forma sale como una columna distinta.',
      })
    }
  }

  return issues
}
