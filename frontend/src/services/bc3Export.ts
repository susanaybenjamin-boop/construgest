// ============================================================================
// Descarga del presupuesto en BC3 (FIEBDC-3), el formato de intercambio del
// sector. Sirve para MANDAR el presupuesto a un arquitecto, a una propiedad o a
// otra contrata (antes Construgest solo sabia importar BC3).
//
// El backend (`GET /budgets/:id/export-bc3`) devuelve el fichero en base64 y,
// de paso, los avisos de la exportacion.
// ============================================================================

import api from '@/lib/api'

export interface Bc3ExportStats {
  chapters: number
  items: number
  measurements: number
  /** Total del PEM: suma de cantidad x precio. GG, BI e IVA van como % en el ~K. */
  total: number
}

export interface Bc3ExportResult {
  filename: string
  bytes: number
  stats: Bc3ExportStats
  warnings: string[]
}

/**
 * Pide el BC3 al backend y lo descarga. Devuelve las estadisticas y los avisos
 * para que la pantalla los pueda mostrar.
 */
export async function exportBudgetToBC3(budgetId: string): Promise<Bc3ExportResult> {
  const { data } = await api.get<Bc3ExportResult & { content_base64: string }>(
    `/budgets/${budgetId}/export-bc3`
  )

  // base64 -> bytes, uno a uno. El BC3 va en ANSI (latin1), no en UTF-8: si se
  // deja que el navegador lo trate como texto, los acentos y las ñ salen como
  // basura en Presto y en Arquimedes.
  const binary = atob(data.content_base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const blob = new Blob([bytes], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = data.filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return {
    filename: data.filename,
    bytes: data.bytes,
    stats: data.stats,
    warnings: data.warnings || [],
  }
}
