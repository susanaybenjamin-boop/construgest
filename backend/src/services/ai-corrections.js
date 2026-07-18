// ============================================================================
// AUTOAPRENDIZAJE (AI-4) — correcciones del usuario → few-shot local.
//
// Idea: cuando el usuario corrige lo que la IA extrajo (p.ej. un nombre/precio de
// material mal leído de una lista de proveedor), guardamos la corrección en
// `cons_ai_corrections`. En la siguiente extracción del MISMO tipo (skill) y
// organización, esas correcciones se inyectan como EJEMPLOS (few-shot) en el
// prompt del LLM local → el modelo "aprende" de los arreglos previos sin
// reentrenar. 100% local, por organización.
//
// Complementa a `find-similar` (partidas guardadas, determinista), que es la base
// del autoaprendizaje del lado de las partidas.
// ============================================================================
import supabase from '../db/local.js'

// Skills que soportan corrección (LLM-heavy). Se valida en el endpoint.
export const CORRECTION_SKILLS = new Set(['extract-materials', 'parse-budget'])

/** Guarda una corrección del usuario. `corrected` es obligatorio (lo que quedó bien). */
export async function recordCorrection({ orgId, skill, context, wrong, corrected }) {
  if (!orgId || !skill || corrected == null) return null
  // Las columnas `wrong` y `corrected` son JSON NOT NULL. El shim (normVal en
  // db/local.js) solo serializa OBJETOS a JSON; un escalar de texto plano
  // ("cemento gris 25kg") pasaría crudo y MariaDB lo rechaza (json_valid).
  // Por eso envolvemos aquí los escalares (string) con JSON.stringify, dejando
  // los objetos intactos para que normVal los serialice una sola vez (sin
  // doble-serializar). Un número ya es JSON válido, pero lo tratamos igual por
  // consistencia.
  const toJson = (v) => (v == null ? null : (typeof v === 'object' ? v : JSON.stringify(v)))
  const { data, error } = await supabase
    .from('cons_ai_corrections')
    .insert({
      organization_id: orgId,
      skill,
      context: context != null ? String(context).slice(0, 2000) : null,
      wrong: toJson(wrong),
      corrected: toJson(corrected),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Últimas correcciones de una skill/organización (para few-shot). */
export async function getRecentCorrections(orgId, skill, limit = 6) {
  if (!orgId || !skill) return []
  const { data, error } = await supabase
    .from('cons_ai_corrections')
    .select('context, corrected, created_at')
    .eq('organization_id', orgId)
    .eq('skill', skill)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

/**
 * Convierte una lista de correcciones en un bloque de texto few-shot para el
 * prompt. Vacío si no hay correcciones (el prompt queda como antes).
 */
export function buildFewShotBlock(corrections) {
  if (!corrections || !corrections.length) return ''
  const lines = corrections.map((c) => {
    const corr = typeof c.corrected === 'string' ? c.corrected : JSON.stringify(c.corrected)
    const ctx = (c.context || '').toString().replace(/\s+/g, ' ').trim().slice(0, 160)
    return ctx ? `- Linea: "${ctx}" -> ${corr}` : `- ${corr}`
  })
  return `\nCorrecciones aprendidas de importaciones anteriores (aplica estas equivalencias exactas cuando veas lineas parecidas):\n${lines.join('\n')}\n`
}

/** Atajo: carga las correcciones de una skill y devuelve ya el bloque few-shot. */
export async function fewShotFor(orgId, skill, limit = 6) {
  try {
    return buildFewShotBlock(await getRecentCorrections(orgId, skill, limit))
  } catch (err) {
    console.warn('[ai-corrections] no se pudo cargar few-shot:', err.message)
    return ''
  }
}

export default { recordCorrection, getRecentCorrections, buildFewShotBlock, fewShotFor, CORRECTION_SKILLS }
