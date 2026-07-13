// Budget comparison auto-matching: unit normalization, name tokenization and scoring.

const UNIT_MAP = {
  m3: 'm3', 'm³': 'm3', 'M3': 'm3', 'M³': 'm3',
  m2: 'm2', 'm²': 'm2', 'M2': 'm2', 'M²': 'm2',
  ml: 'm', m: 'm', M: 'm', ML: 'm',
  ud: 'ud', UD: 'ud', Ud: 'ud', u: 'ud', U: 'ud', uds: 'ud',
  kg: 'kg', KG: 'kg', Kg: 'kg',
  t: 't', T: 't', tn: 't', TN: 't',
  h: 'h', H: 'h', hr: 'h',
  l: 'l', L: 'l', lt: 'l',
  pa: 'pa', PA: 'pa',
}

export function normalizeUnit(u) {
  if (!u) return ''
  const trimmed = String(u).trim()
  if (UNIT_MAP[trimmed]) return UNIT_MAP[trimmed]
  return trimmed.toLowerCase()
}

const STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'o', 'en', 'con', 'para',
  'por', 'a', 'al', 'un', 'una', 'sobre', 'sin', 'e', 'u', 'que', 'como',
])

const ABBREV_MAP = [
  [/\bh\.?\s*arm\.?/gi, 'hormigon armado'],
  [/\bhorm\.?\s*arm\.?/gi, 'hormigon armado'],
  [/\bhorm\.?\s*limpieza/gi, 'hormigon limpieza'],
  [/\bimp\.?\b/gi, 'impermeabilizacion'],
  [/\blam\.?\b/gi, 'lamina'],
  [/\bred\.?\b/gi, 'reticular'],
  [/\besp\.?\b/gi, 'espesor'],
  [/\bcim\.?\b/gi, 'cimentacion'],
  [/\bestr\.?\b/gi, 'estructura'],
  [/\bmec\.?\b/gi, 'mecanico'],
  [/\bv\.?\s*man\.?\b/gi, 'vertido manual'],
  [/\bv\.?\s*bomba\b/gi, 'vertido bomba'],
  [/\bvert\.?\b/gi, 'vertido'],
  [/\bmax\.?\b/gi, 'maximo'],
  [/\bprof\.?\b/gi, 'profundidad'],
  [/\btransp\.?\b/gi, 'transporte'],
  [/\bverted\.?\b/gi, 'vertedero'],
  [/\bhor\.?\b/gi, 'horizontal'],
  [/\bsop\.?\b/gi, 'soporte'],
  [/\bforj\.?\b/gi, 'forjado'],
  [/\bperm\.?\b/gi, 'permanente'],
]

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function normalizeName(name) {
  if (!name) return ''
  let s = stripAccents(String(name).toLowerCase())
  for (const [re, rep] of ABBREV_MAP) {
    s = s.replace(re, rep)
  }
  // Keep alphanumerics, HA-25 style codes, slashes within codes, and whitespace
  s = s.replace(/[.,;:()\[\]"']/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

export function tokenize(name) {
  const norm = normalizeName(name)
  const tokens = norm.split(/\s+/).filter(t => t && !STOPWORDS.has(t))
  return tokens
}

// Jaccard-like with partial token matching: tokens match if either contains the other
// or they share a 4+ char prefix.
export function similarityName(a, b) {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.length === 0 || tb.length === 0) return 0

  const used = new Set()
  let matched = 0
  for (const t of ta) {
    for (let i = 0; i < tb.length; i++) {
      if (used.has(i)) continue
      const o = tb[i]
      if (t === o || (t.length >= 4 && o.includes(t)) || (o.length >= 4 && t.includes(o))) {
        matched++
        used.add(i)
        break
      }
    }
  }
  const union = ta.length + tb.length - matched
  return union > 0 ? matched / union : 0
}

// 1 if exact (diff ≤ 0.5%), decays linearly to 0 at 20% diff.
export function similarityQuantity(qa, qb) {
  const a = Number(qa) || 0
  const b = Number(qb) || 0
  if (a === 0 && b === 0) return 0.5 // both unmeasured: neutral
  if (a === 0 || b === 0) return 0
  const max = Math.max(Math.abs(a), Math.abs(b))
  const diff = Math.abs(a - b) / max
  if (diff <= 0.005) return 1
  if (diff >= 0.2) return 0
  return 1 - (diff - 0.005) / (0.2 - 0.005)
}

export function scorePair(itemA, itemB, chapterA, chapterB) {
  const nameScore = similarityName(itemA.name, itemB.name)
  const qtyScore = similarityQuantity(itemA.quantity, itemB.quantity)
  const unitScore = normalizeUnit(itemA.unit) === normalizeUnit(itemB.unit) ? 1 : 0
  const chapterScore = chapterA && chapterB
    ? similarityName(chapterA.name, chapterB.name)
    : 0

  const score = 0.50 * nameScore + 0.30 * qtyScore + 0.15 * unitScore + 0.05 * chapterScore

  const reasons = []
  if (nameScore > 0.6) reasons.push('nombre similar')
  if (qtyScore === 1) reasons.push('misma cantidad')
  else if (qtyScore > 0.7) reasons.push('cantidad próxima')
  if (unitScore === 1) reasons.push('misma unidad')
  if (chapterScore > 0.6) reasons.push('mismo capítulo')

  return { score, reason: reasons.join(', ') }
}

// Returns ordered list of suggestions { item_a_id, item_b_id, score, reason }
// Excludes items already linked or excluded.
export function computeSuggestions({ fullA, fullB, linkedItemIds, excludedItemIds, minScore = 0.5 }) {
  const linked = new Set(linkedItemIds)
  const excluded = new Set(excludedItemIds)
  const itemsA = []
  const itemsB = []

  for (const ch of fullA.chapters) {
    if (ch.chapter.is_legal_text) continue
    if (ch.chapter.is_active === false) continue
    for (const it of ch.items) {
      if (it.is_active === false) continue
      if (linked.has(it.id) || excluded.has(it.id)) continue
      itemsA.push({ item: it, chapter: ch.chapter })
    }
  }
  for (const ch of fullB.chapters) {
    if (ch.chapter.is_legal_text) continue
    if (ch.chapter.is_active === false) continue
    for (const it of ch.items) {
      if (it.is_active === false) continue
      if (linked.has(it.id) || excluded.has(it.id)) continue
      itemsB.push({ item: it, chapter: ch.chapter })
    }
  }

  const suggestions = []
  for (const a of itemsA) {
    for (const b of itemsB) {
      const { score, reason } = scorePair(a.item, b.item, a.chapter, b.chapter)
      if (score >= minScore) {
        suggestions.push({
          item_a_id: a.item.id,
          item_b_id: b.item.id,
          score: Math.round(score * 1000) / 1000,
          reason,
        })
      }
    }
  }
  suggestions.sort((x, y) => y.score - x.score)
  return suggestions
}

// Pick best non-conflicting pairs (each item used at most once) above threshold.
export function pickGreedyMatches(suggestions, threshold = 0.85) {
  const usedA = new Set()
  const usedB = new Set()
  const picks = []
  for (const s of suggestions) {
    if (s.score < threshold) break
    if (usedA.has(s.item_a_id) || usedB.has(s.item_b_id)) continue
    usedA.add(s.item_a_id)
    usedB.add(s.item_b_id)
    picks.push(s)
  }
  return picks
}

// Orders a pair of budget ids lexicographically and returns { a, b, swapped }.
export function orderBudgetIds(x, y) {
  if (x < y) return { a: x, b: y, swapped: false }
  return { a: y, b: x, swapped: true }
}
