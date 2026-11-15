// Revisión previa al envío (precio contra coste).
// Ejecutar con:  node --test backend/tests/

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { reviewBudget } from '../src/services/budget-review.js'

const item = (o) => ({ code: '01.01', name: 'Partida', unit: 'm2', quantity: 1, unit_price: 100, cost_price: 50, ...o })
const textoDe = (issues, frag) => issues.find((i) => i.message.includes(frag))

// ─── Vender por debajo del coste ────────────────────────────────────

test('caza la partida que se vende por debajo de su coste', () => {
  const issues = reviewBudget([item({ unit_price: 40, cost_price: 50, quantity: 10 })])
  const malo = textoDe(issues, 'POR DEBAJO')
  assert.ok(malo, 'deberia avisar')
  assert.equal(malo.severity, 'critical')
  assert.deepEqual(malo.affected_items, ['01.01'])
  // 10 uds x (50 - 40) = 100 EUR de perdida
  assert.ok(malo.message.includes('100'), `no da la perdida: ${malo.message}`)
})

test('un margen normal no se toca', () => {
  const issues = reviewBudget([item({ unit_price: 100, cost_price: 70 })])
  assert.equal(issues.length, 0)
})

test('vender justo al coste no es vender por debajo', () => {
  const issues = reviewBudget([item({ unit_price: 50, cost_price: 50 })])
  assert.equal(textoDe(issues, 'POR DEBAJO'), undefined)
})

// ─── Margen absurdo (dígito de más) ─────────────────────────────────

test('caza el margen sospechosamente alto', () => {
  // 12 EUR de coste y 1200 de precio: un cero de mas
  const issues = reviewBudget([item({ unit_price: 1200, cost_price: 12 })])
  const aviso = textoDe(issues, 'margen muy alto')
  assert.ok(aviso)
  assert.equal(aviso.severity, 'warning')
  assert.ok(aviso.recommendation.includes('dígito'))
})

test('un margen alto pero creible no salta', () => {
  // x3 es mucho, pero no es un error de tecleo
  const issues = reviewBudget([item({ unit_price: 150, cost_price: 50 })])
  assert.equal(textoDe(issues, 'margen muy alto'), undefined)
})

// ─── Sin coste ──────────────────────────────────────────────────────

test('agrupa las partidas sin coste en UN aviso', () => {
  const items = []
  for (let i = 1; i <= 8; i++) items.push(item({ code: `01.0${i}`, cost_price: 0 }))
  const issues = reviewBudget(items)
  const aviso = textoDe(issues, 'no tienen coste unitario')
  assert.ok(aviso)
  assert.equal(aviso.severity, 'info')
  assert.ok(aviso.message.includes('8 de 8 partidas'))
  assert.ok(aviso.message.includes('y 2 más'), `no resume: ${aviso.message}`)
  // Un solo aviso, no ocho
  assert.equal(issues.filter((i) => i.message.includes('no tienen coste')).length, 1)
})

test('con una sola partida el aviso va en singular', () => {
  const issues = reviewBudget([item({ cost_price: 0 })])
  const aviso = textoDe(issues, 'coste unitario')
  assert.ok(aviso.message.includes('1 de 1 partida no tiene'), `mal plural: ${aviso.message}`)
  assert.ok(!aviso.message.includes('1 partidas'))
})

test('una partida sin precio la ignora (ya la avisa detect-issues)', () => {
  const issues = reviewBudget([item({ unit_price: 0, cost_price: 0 })])
  assert.equal(issues.length, 0)
})

test('las partidas desactivadas no cuentan', () => {
  const issues = reviewBudget([item({ unit_price: 10, cost_price: 50, is_active: false })])
  assert.equal(issues.length, 0)
})

// ─── Desviación contra la biblioteca ────────────────────────────────

test('avisa de los precios que se alejan de la biblioteca', () => {
  const priced = [
    { code: '01.01', unit_price: 100, ref_price: 50 },   // +100%
    { code: '01.02', unit_price: 20, ref_price: 50 },    // -60%
    { code: '01.03', unit_price: 52, ref_price: 50 },    // +4%, dentro
    { code: '01.04', unit_price: 60, ref_price: null },  // sin referencia
  ]
  const issues = reviewBudget([], { priced })
  const aviso = textoDe(issues, 'se alejan')
  assert.ok(aviso)
  assert.ok(aviso.message.includes('1 por encima'))
  assert.ok(aviso.message.includes('1 por debajo'))
  assert.ok(aviso.message.includes('01.01') && aviso.message.includes('01.02'))
  assert.ok(!aviso.message.includes('01.03'), 'la que esta dentro no deberia salir')
  assert.ok(!aviso.message.includes('01.04'), 'la que no tiene referencia no deberia salir')
})

test('sin referencias no dice nada de la biblioteca', () => {
  const issues = reviewBudget([item()], { priced: [] })
  assert.equal(textoDe(issues, 'se alejan'), undefined)
})

// ─── Casos borde ────────────────────────────────────────────────────

test('un presupuesto vacio no da avisos', () => {
  assert.deepEqual(reviewBudget([]), [])
  assert.deepEqual(reviewBudget(), [])
})

test('los avisos traen el shape de detect-issues', () => {
  const issues = reviewBudget([item({ unit_price: 40, cost_price: 50 })])
  for (const i of issues) {
    for (const k of ['id', 'severity', 'message', 'affected_items', 'recommendation']) {
      assert.ok(k in i, `falta ${k}`)
    }
  }
})
