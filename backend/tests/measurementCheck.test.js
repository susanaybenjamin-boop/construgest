// Revisión de la hoja de mediciones.
// Ejecutar con:  node --test backend/tests/

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { checkMeasurements, expectedPartial, normalizeZone } from '../src/services/measurement-check.js'

/** Presupuesto de una partida con las mediciones que se le pasen. */
function budget(measurements, { quantity = null, code = '01.01' } = {}) {
  const suma = Math.round(measurements.reduce((s, m) => s + (m.partial || 0), 0) * 1000) / 1000
  return [{
    chapter: { code: '01', name: 'CAP' },
    items: [{ code, name: 'Partida', unit: 'm2', quantity: quantity === null ? suma : quantity, measurements }],
  }]
}

const m = (o) => ({ description: 'linea', units: 0, length: 0, width: 0, height: 0, partial: 0, zone: null, ...o })

// ─── expectedPartial ────────────────────────────────────────────────

test('el parcial ignora las dimensiones a cero', () => {
  // Medición lineal: solo largo
  assert.equal(expectedPartial(m({ units: 2, length: 4.5 })), 9)
  // Superficie: largo x alto, el ancho vacío no anula
  assert.equal(expectedPartial(m({ units: 2, length: 4.5, height: 2.7 })), 24.3)
  // Volumen
  assert.equal(expectedPartial(m({ units: 1, length: 2, width: 3, height: 4 })), 24)
})

test('sin dimensiones, el parcial son las unidades', () => {
  assert.equal(expectedPartial(m({ units: 7 })), 7)
})

test('con unidades a 0 pero dimensiones escritas se cuenta 1 unidad', () => {
  assert.equal(expectedPartial(m({ units: 0, length: 3, height: 2 })), 6)
})

// ─── Parciales que no cuadran ───────────────────────────────────────

test('caza el parcial tecleado que no sale de sus dimensiones', () => {
  // 2 x 4,5 x 2,7 = 24,3 pero pone 25
  const issues = checkMeasurements(budget([m({ units: 2, length: 4.5, height: 2.7, partial: 25 })]))
  const malo = issues.find((i) => i.message.includes('no cuadra'))
  assert.ok(malo, 'deberia avisar')
  assert.equal(malo.severity, 'critical')
  assert.ok(malo.message.includes('25'))
  assert.ok(malo.message.includes('24.3'))
  assert.deepEqual(malo.affected_items, ['01.01'])
})

test('no se queja si el parcial cuadra', () => {
  const issues = checkMeasurements(budget([
    m({ units: 2, length: 4.5, height: 2.7, partial: 24.3 }),
    m({ units: 1, length: 3.2, height: 2.7, partial: 8.64 }),
  ]))
  assert.equal(issues.filter((i) => i.message.includes('no cuadra')).length, 0)
})

test('una linea con formula propia no se discute', () => {
  const issues = checkMeasurements(budget([
    m({ units: 2, length: 4.5, height: 2.7, partial: 100, formula: 'algo raro' }),
  ]))
  assert.equal(issues.filter((i) => i.message.includes('no cuadra')).length, 0)
})

test('tolera el redondeo de 3 decimales', () => {
  // 1 x 0,333 x 3 = 0,999, guardado como 0,999
  const issues = checkMeasurements(budget([m({ units: 1, length: 0.333, width: 3, partial: 0.999 })]))
  assert.equal(issues.filter((i) => i.message.includes('no cuadra')).length, 0)
})

// ─── Cantidad contra la suma medida ─────────────────────────────────

test('caza la cantidad que no es la suma de sus mediciones', () => {
  const issues = checkMeasurements(budget(
    [m({ units: 2, length: 5, partial: 10 })],
    { quantity: 125.5 }   // lo medido son 10
  ))
  const malo = issues.find((i) => i.message.includes('cantidad distinta'))
  assert.ok(malo, 'deberia avisar')
  assert.ok(malo.message.includes('125.5'))
  assert.ok(malo.message.includes('10'))
})

test('si la cantidad es la suma, no dice nada', () => {
  const issues = checkMeasurements(budget([
    m({ units: 2, length: 5, partial: 10 }),
    m({ units: 1, length: 3, partial: 3 }),
  ], { quantity: 13 }))
  assert.equal(issues.filter((i) => i.message.includes('cantidad distinta')).length, 0)
})

// ─── Zonas escritas de varias formas ────────────────────────────────

test('normalizeZone iguala grafias', () => {
  assert.equal(normalizeZone('Planta 1ª'), normalizeZone('planta 1a'))
  assert.equal(normalizeZone('PLANTA  1A'), normalizeZone('Planta 1ª'))
  assert.notEqual(normalizeZone('Planta 1'), normalizeZone('Planta 2'))
})

test('avisa de la misma zona escrita de varias formas', () => {
  const issues = checkMeasurements(budget([
    m({ units: 1, length: 2, partial: 2, zone: 'Planta 1ª' }),
    m({ units: 1, length: 3, partial: 3, zone: 'planta 1a' }),
  ]))
  const aviso = issues.find((i) => i.message.includes('escrita de'))
  assert.ok(aviso, 'deberia avisar')
  assert.ok(aviso.message.includes('Planta 1ª'))
  assert.ok(aviso.message.includes('planta 1a'))
})

test('zonas distintas de verdad no se mezclan', () => {
  const issues = checkMeasurements(budget([
    m({ units: 1, length: 2, partial: 2, zone: 'Planta 1' }),
    m({ units: 1, length: 3, partial: 3, zone: 'Planta 2' }),
  ]))
  assert.equal(issues.filter((i) => i.message.includes('escrita de')).length, 0)
})

// ─── Líneas a cero y casos borde ────────────────────────────────────

test('avisa de las lineas que no suman nada', () => {
  const issues = checkMeasurements(budget([m({ description: 'pendiente de medir', partial: 0 })]))
  const aviso = issues.find((i) => i.message.includes('no suma'))
  assert.ok(aviso)
  assert.equal(aviso.severity, 'info')
})

test('un presupuesto sin mediciones no da avisos', () => {
  assert.deepEqual(checkMeasurements([]), [])
  assert.deepEqual(
    checkMeasurements([{ chapter: { code: '01' }, items: [{ code: '01.01', quantity: 5, measurements: [] }] }]),
    []
  )
})

test('el capitulo de condiciones se salta', () => {
  const issues = checkMeasurements([{
    chapter: { code: '99', name: 'CONDICIONES', is_legal_text: true },
    items: [{ code: '99.01', quantity: 0, measurements: [m({ units: 2, length: 5, partial: 999 })] }],
  }])
  assert.deepEqual(issues, [])
})
