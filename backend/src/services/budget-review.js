// ============================================================================
// REVISIÓN PREVIA AL ENVÍO (AI-8) — la parte que mira PRECIO contra COSTE.
//
// Amplía los avisos de `detect-issues` (que ya caza partidas sin precio, sin
// cantidad, capítulos vacíos, duplicados y totales que no cuadran) con lo que
// solo se puede saber desde que el coste es de fiar (A1: el coste de la partida
// sale de su descomposición):
//
//   - Partidas que se venden POR DEBAJO de su coste.
//   - Márgenes absurdos, que casi siempre son un dígito de más al teclear.
//   - Partidas sin coste unitario: no se puede saber si se gana dinero.
//   - Precios que se alejan mucho del que hay en la biblioteca para algo
//     casi igual.
//
// Sin IA: son comparaciones. Devuelve el mismo shape que detect-issues
// ({id, severity, message, affected_items, recommendation}).
// ============================================================================

/** Margen por encima del cual un precio huele a dígito de más. */
const MARGEN_SOSPECHOSO = 10      // precio >= 10 x coste
/** Desviación contra la biblioteca a partir de la cual merece una mirada. */
const DESVIACION_REF = 0.30       // 30%

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** "01.01, 01.02 y 3 más" — para no soltar un aviso por partida. */
function listar(codes, max = 6) {
  if (codes.length <= max) return codes.join(', ')
  return `${codes.slice(0, max).join(', ')} y ${codes.length - max} más`
}

/**
 * @param {Array} items  filas de cons_budget_items (code, name, quantity,
 *                       unit_price, cost_price, is_active, is_auxiliary)
 * @param {object} [opts]
 * @param {Array}  [opts.priced]  items pasados por lookupPrices (con ref_price)
 * @returns {Array} avisos
 */
export function reviewBudget(items = [], { priced = [] } = {}) {
  const issues = []
  let seq = 0
  const nextId = () => `rev-${++seq}`

  const activos = items.filter((it) => it.is_active !== false)

  const bajoCoste = []
  const margenRaro = []
  const sinCoste = []

  for (const it of activos) {
    const precio = num(it.unit_price)
    const coste = num(it.cost_price)
    if (precio <= 0) continue          // ya lo avisa detect-issues

    if (coste <= 0) {
      sinCoste.push(it.code)
      continue
    }
    if (precio < coste) {
      bajoCoste.push({
        code: it.code,
        precio: round2(precio),
        coste: round2(coste),
        perdida: round2((coste - precio) * num(it.quantity)),
      })
    } else if (precio >= coste * MARGEN_SOSPECHOSO) {
      margenRaro.push({ code: it.code, precio: round2(precio), coste: round2(coste) })
    }
  }

  if (bajoCoste.length > 0) {
    const perdidaTotal = round2(bajoCoste.reduce((s, b) => s + b.perdida, 0))
    const muestra = bajoCoste.slice(0, 5)
      .map((b) => `${b.code}: vendes a ${b.precio} € y te cuesta ${b.coste} €`)
      .join('; ')
    issues.push({
      id: nextId(),
      severity: 'critical',
      message:
        `${bajoCoste.length} ${bajoCoste.length === 1 ? 'partida se vende' : 'partidas se venden'} ` +
        `POR DEBAJO de su coste (${muestra}${bajoCoste.length > 5 ? '; …' : ''})` +
        (perdidaTotal > 0 ? `. Con las cantidades del presupuesto son ${perdidaTotal} € de pérdida` : ''),
      affected_items: bajoCoste.map((b) => b.code),
      recommendation: 'Sube el precio o revisa el coste: tal como está, esas partidas te cuestan dinero.',
    })
  }

  if (margenRaro.length > 0) {
    const muestra = margenRaro.slice(0, 5)
      .map((m) => `${m.code}: ${m.precio} € sobre un coste de ${m.coste} €`)
      .join('; ')
    issues.push({
      id: nextId(),
      severity: 'warning',
      message:
        `${margenRaro.length} ${margenRaro.length === 1 ? 'partida tiene' : 'partidas tienen'} ` +
        `un margen muy alto (${muestra}${margenRaro.length > 5 ? '; …' : ''})`,
      affected_items: margenRaro.map((m) => m.code),
      recommendation:
        'Suele ser un dígito de más al teclear el precio. Compruébalo antes de mandar el presupuesto.',
    })
  }

  if (sinCoste.length > 0) {
    issues.push({
      id: nextId(),
      severity: 'info',
      message:
        `${sinCoste.length} de ${activos.length} ${activos.length === 1 ? 'partida' : 'partidas'} ` +
        `${sinCoste.length === 1 ? 'no tiene' : 'no tienen'} coste unitario, ` +
        `así que de ${sinCoste.length === 1 ? 'esa' : 'esas'} no se sabe si ganas dinero (${listar(sinCoste)})`,
      affected_items: sinCoste,
      recommendation:
        'Ponles coste a mano, o móntales la descomposición y el coste sale solo de ella.',
    })
  }

  // ── Desviación contra la biblioteca ──
  // Solo el AVISO: el detalle lo da la skill de Comparación de Precios, que es
  // la que existe para eso. Aquí interesa que salte antes de enviar.
  const desviadas = []
  for (const p of priced) {
    const ref = num(p.ref_price)
    const precio = num(p.unit_price)
    if (ref <= 0 || precio <= 0) continue
    const dif = Math.abs(precio - ref) / ref
    if (dif > DESVIACION_REF) {
      desviadas.push({ code: p.code, pct: Math.round(dif * 100), arriba: precio > ref })
    }
  }
  if (desviadas.length > 0) {
    const arriba = desviadas.filter((d) => d.arriba).length
    issues.push({
      id: nextId(),
      severity: 'warning',
      message:
        `${desviadas.length} ${desviadas.length === 1 ? 'partida se aleja' : 'partidas se alejan'} ` +
        `más de un ${Math.round(DESVIACION_REF * 100)} % del precio que tienes en tu biblioteca ` +
        `(${arriba} por encima, ${desviadas.length - arriba} por debajo): ${listar(desviadas.map((d) => d.code))}`,
      affected_items: desviadas.map((d) => d.code),
      recommendation: 'El detalle, con la referencia de cada una, está en la skill de Comparación de Precios.',
    })
  }

  return issues
}
