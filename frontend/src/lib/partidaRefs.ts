// ============================================================================
// COND-2 — Referencias VIVAS a partidas dentro del texto de condiciones.
//
// Una condición del tipo "EN EL APARTADO 2.1 HORMIGÓN DE LIMPIEZA se
// presupuestan 18 m³…" se queda mentirosa en cuanto se renumera el presupuesto
// (y la app renumera sola). Por eso la referencia no se pega como texto: se
// guarda como <span data-partida-ref="ID">etiqueta</span> y la etiqueta se
// vuelve a calcular SIEMPRE que se muestra o se imprime.
//
// Esta función es pura y se usa en los dos sitios — el editor y el PDF — así
// que no hay forma de que uno diga una cosa y el otro otra.
// ============================================================================
import type { ChapterWithItems } from '@/types'

/** Texto que se muestra para una partida: "2.1 HORMIGÓN DE LIMPIEZA". */
export function partidaLabel(code: string, name: string): string {
  return [code, name].filter(Boolean).join(' ').trim()
}

/** Lo que se ve cuando la partida referenciada ya no existe. */
export const REF_BORRADA = '[partida eliminada]'

/**
 * Reescribe las etiquetas de todas las referencias del HTML con el código y el
 * nombre que tienen HOY las partidas. Si una partida ya no existe, lo dice en
 * vez de dejar un número que ya no significa nada.
 */
export function resolvePartidaRefs(html: string, chapters: ChapterWithItems[]): string {
  if (!html || !html.includes('data-partida-ref')) return html
  if (typeof document === 'undefined') return html

  const porId = new Map<string, { code: string; name: string }>()
  for (const ch of chapters || []) {
    for (const it of ch.items || []) porId.set(it.id, { code: it.code, name: it.name })
  }

  const div = document.createElement('div')
  div.innerHTML = html

  for (const span of Array.from(div.querySelectorAll('[data-partida-ref]'))) {
    const id = span.getAttribute('data-partida-ref') || ''
    const item = porId.get(id)
    const texto = item ? partidaLabel(item.code, item.name) : REF_BORRADA
    if (span.textContent !== texto) span.textContent = texto
    if (!item) span.setAttribute('data-partida-missing', 'true')
    else span.removeAttribute('data-partida-missing')
  }

  return div.innerHTML
}

/** ¿Hay alguna referencia a una partida que ya no existe? (para avisar en pantalla) */
export function countMissingRefs(html: string, chapters: ChapterWithItems[]): number {
  if (!html || !html.includes('data-partida-ref')) return 0
  if (typeof document === 'undefined') return 0

  const ids = new Set<string>()
  for (const ch of chapters || []) for (const it of ch.items || []) ids.add(it.id)

  const div = document.createElement('div')
  div.innerHTML = html
  return Array.from(div.querySelectorAll('[data-partida-ref]'))
    .filter((s) => !ids.has(s.getAttribute('data-partida-ref') || '')).length
}
