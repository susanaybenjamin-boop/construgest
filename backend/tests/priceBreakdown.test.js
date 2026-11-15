// A1 — el coste de la partida sale de su descomposición.
// Ejecutar con:  node --test backend/tests/
//
// Aquí solo se prueba `sumBreakdown`, que es la parte pura: la suma que define
// el coste. El recálculo contra la base de datos (`recalcItemCost`) se verifica
// en ejecución contra el backend levantado, que es donde de verdad importa.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { sumBreakdown } from '../src/services/price-breakdown.js'

test('suma cantidad x coste unitario de cada linea', () => {
  assert.equal(
    sumBreakdown([
      { quantity: 2, unit_cost: 10 },
      { quantity: 3, unit_cost: 5 },
    ]),
    35
  )
})

test('sin lineas la suma es 0', () => {
  assert.equal(sumBreakdown([]), 0)
  assert.equal(sumBreakdown(), 0)
})

test('redondea a 2 decimales, como el propio cost_price', () => {
  // 0.285 x 12.37 = 3.52545 -> 3.53
  assert.equal(sumBreakdown([{ quantity: 0.285, unit_cost: 12.37 }]), 3.53)
})

test('redondea al final, no linea a linea', () => {
  // Tres lineas de 0.005 suman 0.015 -> 0.02. Redondeando una a una darian 0.
  const r = sumBreakdown([
    { quantity: 1, unit_cost: 0.005 },
    { quantity: 1, unit_cost: 0.005 },
    { quantity: 1, unit_cost: 0.005 },
  ])
  assert.equal(r, 0.02)
})

test('acepta numeros que vienen como texto (lo que da el driver)', () => {
  // mysql2 devuelve los DECIMAL como string: si no se convierten, "2" * "10"
  // funciona pero "2" + "10" concatena. Aqui se vigila que salga 35, no basura.
  assert.equal(
    sumBreakdown([
      { quantity: '2', unit_cost: '10.00' },
      { quantity: '3.000', unit_cost: '5' },
    ]),
    35
  )
})

test('un valor nulo o ilegible cuenta como 0, no rompe la suma', () => {
  assert.equal(
    sumBreakdown([
      { quantity: 2, unit_cost: 10 },
      { quantity: null, unit_cost: 5 },
      { quantity: 3, unit_cost: undefined },
      { quantity: 'x', unit_cost: 'y' },
    ]),
    20
  )
})

test('una linea a coste 0 no estorba', () => {
  assert.equal(sumBreakdown([{ quantity: 5, unit_cost: 0 }, { quantity: 1, unit_cost: 7 }]), 7)
})
