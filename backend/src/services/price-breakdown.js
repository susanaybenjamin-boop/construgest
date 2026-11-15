// ============================================================================
// A1 — EL COSTE DE LA PARTIDA SALE DE SU DESCOMPOSICION.
//
// Antes, `cons_price_breakdown` era DECORATIVA: el panel sumaba las lineas y
// solo las ENSEÑABA ("Coste Total Unitario"), mientras `cost_price` se tecleaba
// a mano. Una partida podia decir 42 EUR y su propia descomposicion sumar 51, y
// el Anexo III del PDF imprimia las dos cifras juntas. Ademas `cost_price` no es
// decorativo: alimenta el margen de la fila, el de las certificaciones y el del
// panel de la obra, asi que un coste que miente propaga la mentira.
//
// Regla (decidida con Benjamin el 2026-11-15):
//   - Si la partida TIENE lineas de descomposicion, su coste ES la suma de
//     ellas. El recuadro de coste pasa a ser de solo lectura y se recalcula
//     solo al tocar cualquier linea.
//   - Si NO tiene lineas, el coste se sigue tecleando a mano, como hasta ahora.
//   - El PRECIO DE VENTA no se toca nunca: vender es decision de Benjamin, no
//     una formula. Lo que cambia es el margen, que pasa a decir la verdad.
//
// Al borrar la ultima linea NO se pone el coste a 0: se deja el ultimo valor
// calculado y la partida vuelve a ser manual. Poner 0 seria destruir un dato
// sin que nadie lo haya pedido.
// ============================================================================

import supabase from '../db/local.js'

/**
 * Suma de una descomposicion: Σ cantidad x coste unitario, a 2 decimales.
 *
 * Se redondea a 2 decimales al final (no linea a linea) porque es un importe
 * unitario, igual que `cost_price` (DECIMAL(12,2)).
 *
 * @param {Array<{quantity:number|string, unit_cost:number|string}>} lines
 * @returns {number}
 */
export function sumBreakdown(lines = []) {
  const total = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0),
    0
  )
  return Math.round(total * 100) / 100
}

/**
 * Devuelve las lineas de descomposicion de una partida.
 * @returns {Promise<Array>}
 */
async function loadLines(itemId) {
  const { data, error } = await supabase
    .from('cons_price_breakdown')
    .select('quantity, unit_cost')
    .eq('budget_item_id', itemId)
  if (error) throw error
  return data || []
}

/**
 * ¿El coste de esta partida lo manda su descomposicion?
 * (es decir: ¿tiene al menos una linea?)
 *
 * @param {string} itemId
 * @returns {Promise<boolean>}
 */
export async function isCostLinked(itemId) {
  const lines = await loadLines(itemId)
  return lines.length > 0
}

/**
 * Recalcula `cost_price` de una partida desde su descomposicion y lo guarda.
 *
 * Llamarlo despues de CUALQUIER cambio en las lineas (alta, edicion, borrado).
 * Si la partida se queda sin lineas no toca el coste y lo deja manual.
 *
 * @param {string} itemId
 * @returns {Promise<{linked:boolean, cost:number|null, lines:number}>}
 */
export async function recalcItemCost(itemId) {
  const lines = await loadLines(itemId)

  if (lines.length === 0) {
    return { linked: false, cost: null, lines: 0 }
  }

  const cost = sumBreakdown(lines)
  const { error } = await supabase
    .from('cons_budget_items')
    .update({ cost_price: cost })
    .eq('id', itemId)
  if (error) throw error

  return { linked: true, cost, lines: lines.length }
}
