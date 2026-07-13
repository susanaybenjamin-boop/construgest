// Tests del servicio de auto-matching entre presupuestos.
// Ejecutar con:  node --test backend/tests/

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeUnit,
  normalizeName,
  tokenize,
  similarityName,
  similarityQuantity,
  scorePair,
  computeSuggestions,
  pickGreedyMatches,
  orderBudgetIds,
} from '../src/services/budgetMatching.js'

// ─── normalizeUnit ──────────────────────────────────────────────────
test('normalizeUnit: sinónimos comunes', () => {
  assert.equal(normalizeUnit('m³'), 'm3')
  assert.equal(normalizeUnit('M3'), 'm3')
  assert.equal(normalizeUnit('m²'), 'm2')
  assert.equal(normalizeUnit('ml'), 'm')
  assert.equal(normalizeUnit('UD'), 'ud')
  assert.equal(normalizeUnit('uds'), 'ud')
  assert.equal(normalizeUnit('Kg'), 'kg')
  assert.equal(normalizeUnit('TN'), 't')
  assert.equal(normalizeUnit('hr'), 'h')
  assert.equal(normalizeUnit('lt'), 'l')
})

test('normalizeUnit: vacíos y desconocidos', () => {
  assert.equal(normalizeUnit(''), '')
  assert.equal(normalizeUnit(null), '')
  assert.equal(normalizeUnit(undefined), '')
  // Desconocido cae en lowercase trimmed
  assert.equal(normalizeUnit(' Custom '), 'custom')
})

// ─── normalizeName / tokenize ──────────────────────────────────────
test('normalizeName: acentos y abreviaturas', () => {
  assert.equal(normalizeName('Hormigón armado'), 'hormigon armado')
  assert.equal(normalizeName('H. arm.'), 'hormigon armado')
  assert.equal(normalizeName('Horm. arm.'), 'hormigon armado')
  assert.equal(normalizeName('Imp. lám. perm.'), 'impermeabilizacion lamina permanente')
})

test('tokenize: ignora stopwords', () => {
  const t = tokenize('Hormigón armado para cimentación de muros')
  assert.deepEqual(t.sort(), ['armado', 'cimentacion', 'hormigon', 'muros'].sort())
})

// ─── similarityName ────────────────────────────────────────────────
test('similarityName: idénticos = 1', () => {
  assert.equal(similarityName('Hormigón HA-25', 'Hormigón HA-25'), 1)
})

test('similarityName: parecidos > 0.5', () => {
  // "armado para cimentación" vs "armado para cim." — la abreviatura se expande
  assert.ok(similarityName('hormigón armado para cimentación', 'horm. arm. para cim.') > 0.5)
})

test('similarityName: distintos = 0 ó muy bajo', () => {
  const s = similarityName('Bordillo de hormigón', 'Pintura plástica')
  assert.ok(s < 0.2, `esperado <0.2, obtenido ${s}`)
})

test('similarityName: vacío → 0', () => {
  assert.equal(similarityName('', 'algo'), 0)
  assert.equal(similarityName('algo', ''), 0)
})

// ─── similarityQuantity ────────────────────────────────────────────
test('similarityQuantity: iguales → 1', () => {
  assert.equal(similarityQuantity(100, 100), 1)
  assert.equal(similarityQuantity(100, 100.4), 1) // diff 0.4% < 0.5%
})

test('similarityQuantity: ambas 0 → 0.5 (neutral)', () => {
  assert.equal(similarityQuantity(0, 0), 0.5)
})

test('similarityQuantity: una 0 → 0', () => {
  assert.equal(similarityQuantity(0, 100), 0)
  assert.equal(similarityQuantity(50, 0), 0)
})

test('similarityQuantity: ≥20% diff → 0', () => {
  // diff = |a-b| / max(a,b). Para 100 vs 125 → 25/125 = 0.20 → 0.
  assert.equal(similarityQuantity(100, 125), 0)
  assert.equal(similarityQuantity(125, 100), 0)
  assert.equal(similarityQuantity(100, 200), 0)
})

test('similarityQuantity: decae linealmente', () => {
  // 10% diff → entre 0 y 1
  const s = similarityQuantity(100, 110)
  assert.ok(s > 0 && s < 1, `esperado (0,1), obtenido ${s}`)
})

// ─── scorePair ─────────────────────────────────────────────────────
test('scorePair: match perfecto', () => {
  const a = { name: 'Hormigón HA-25', quantity: 100, unit: 'm3' }
  const b = { name: 'Hormigón HA-25', quantity: 100, unit: 'm³' } // unidad equivalente
  const ch = { name: 'Cimentaciones' }
  const { score, reason } = scorePair(a, b, ch, ch)
  assert.ok(score >= 0.95, `match perfecto debería ≥0.95, obtenido ${score}`)
  assert.match(reason, /nombre similar/)
  assert.match(reason, /misma cantidad/)
  assert.match(reason, /misma unidad/)
})

test('scorePair: mismo nombre, distinta cantidad', () => {
  const a = { name: 'Hormigón HA-25', quantity: 100, unit: 'm3' }
  const b = { name: 'Hormigón HA-25', quantity: 200, unit: 'm3' }
  const ch = { name: 'Cimentaciones' }
  const { score } = scorePair(a, b, ch, ch)
  // 0.50 nombre + 0.30*0 + 0.15 unidad + 0.05 capítulo (=1 igual) = 0.70
  assert.ok(score >= 0.6 && score <= 0.75, `obtenido ${score}`)
})

// ─── computeSuggestions ────────────────────────────────────────────
test('computeSuggestions: descarta legal_text e inactivos', () => {
  const fullA = {
    chapters: [
      { chapter: { id: 'c1', name: 'Cimentaciones', is_legal_text: false, is_active: true },
        items: [
          { id: 'a1', name: 'Hormigón HA-25', quantity: 100, unit: 'm3', is_active: true },
          { id: 'a2', name: 'Inactivo', quantity: 50, unit: 'm3', is_active: false },
        ] },
      { chapter: { id: 'c2', name: 'Legal', is_legal_text: true, is_active: true },
        items: [{ id: 'aL', name: 'Hormigón HA-25', quantity: 100, unit: 'm3', is_active: true }] },
    ],
  }
  const fullB = {
    chapters: [
      { chapter: { id: 'c3', name: 'Cimentaciones', is_legal_text: false, is_active: true },
        items: [{ id: 'b1', name: 'Hormigón HA-25', quantity: 100, unit: 'm3', is_active: true }] },
    ],
  }
  const sugg = computeSuggestions({
    fullA, fullB, linkedItemIds: [], excludedItemIds: [], minScore: 0.5,
  })
  // Solo a1↔b1 debe aparecer (los inactivos y legal_text quedan fuera)
  assert.equal(sugg.length, 1)
  assert.equal(sugg[0].item_a_id, 'a1')
  assert.equal(sugg[0].item_b_id, 'b1')
})

test('computeSuggestions: respeta linkedItemIds y excludedItemIds', () => {
  const fullA = { chapters: [{ chapter: { id: 'c1', name: 'X', is_legal_text: false, is_active: true },
    items: [
      { id: 'a1', name: 'item uno', quantity: 1, unit: 'ud', is_active: true },
      { id: 'a2', name: 'item dos', quantity: 1, unit: 'ud', is_active: true },
    ] }] }
  const fullB = { chapters: [{ chapter: { id: 'c2', name: 'X', is_legal_text: false, is_active: true },
    items: [
      { id: 'b1', name: 'item uno', quantity: 1, unit: 'ud', is_active: true },
      { id: 'b2', name: 'item dos', quantity: 1, unit: 'ud', is_active: true },
    ] }] }
  // a1 ya está vinculado; a2 está excluido → no se sugieren
  const sugg = computeSuggestions({
    fullA, fullB, linkedItemIds: ['a1'], excludedItemIds: ['a2'], minScore: 0.5,
  })
  // ningún item de A queda → 0 sugerencias
  assert.equal(sugg.length, 0)
})

// ─── pickGreedyMatches ─────────────────────────────────────────────
test('pickGreedyMatches: cada item usado a lo sumo 1 vez', () => {
  const suggestions = [
    { item_a_id: 'a1', item_b_id: 'b1', score: 0.95, reason: '' },
    { item_a_id: 'a1', item_b_id: 'b2', score: 0.92, reason: '' }, // a1 ya usado
    { item_a_id: 'a2', item_b_id: 'b1', score: 0.90, reason: '' }, // b1 ya usado
    { item_a_id: 'a2', item_b_id: 'b2', score: 0.88, reason: '' },
  ]
  const picks = pickGreedyMatches(suggestions, 0.85)
  assert.equal(picks.length, 2)
  assert.equal(picks[0].item_a_id, 'a1')
  assert.equal(picks[0].item_b_id, 'b1')
  assert.equal(picks[1].item_a_id, 'a2')
  assert.equal(picks[1].item_b_id, 'b2')
})

test('pickGreedyMatches: corta cuando el score baja del threshold', () => {
  const suggestions = [
    { item_a_id: 'a1', item_b_id: 'b1', score: 0.95, reason: '' },
    { item_a_id: 'a2', item_b_id: 'b2', score: 0.70, reason: '' }, // < 0.85
  ]
  const picks = pickGreedyMatches(suggestions, 0.85)
  assert.equal(picks.length, 1)
})

// ─── orderBudgetIds ────────────────────────────────────────────────
test('orderBudgetIds: ordena lexicográficamente', () => {
  assert.deepEqual(orderBudgetIds('aaa', 'bbb'), { a: 'aaa', b: 'bbb', swapped: false })
  assert.deepEqual(orderBudgetIds('bbb', 'aaa'), { a: 'aaa', b: 'bbb', swapped: true })
})
