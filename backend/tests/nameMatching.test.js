// Emparejamiento de nombres (budget-analytics `_match`).
// Ejecutar con:  node --test backend/tests/
//
// Esto es lo que decide los DUPLICADOS del análisis de materiales, la búsqueda
// de precio de referencia y find-similar. No lo hace la IA: es código.
//
// El caso que lo destapó (datos reales de Benjamin, 2026-11-15): el análisis
// proponía agrupar como equivalentes "TIPO V1 MF+", "TIPO V2 MF+" ... "TIPO V7
// MF+" con **100% de similitud**. Son siete vigas DISTINTAS. Pasaba porque
// `nameTokens` tiraba todo token de 2 caracteres o menos, así que de cada nombre
// solo sobrevivía "tipo".

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { _match } from '../src/services/budget-analytics.js'

const { fuzzyJaccard } = _match

// Umbral con el que materials-analytics marca un duplicado
const DUP_THRESHOLD = 0.7
// Umbral con el que price-reference acepta una referencia de precio
const REF_THRESHOLD = 0.55

// ─── El caso real ───────────────────────────────────────────────────

test('las vigas TIPO V1..V7 MF+ NO son el mismo material', () => {
  const vigas = ['TIPO V1 MF+', 'TIPO V2 MF+', 'TIPO V3 MF+', 'TIPO V4 MF+',
                 'TIPO V5 MF+', 'TIPO V6 MF+', 'TIPO V7 MF+']
  for (let i = 0; i < vigas.length; i++) {
    for (let j = i + 1; j < vigas.length; j++) {
      const sim = fuzzyJaccard(vigas[i], vigas[j])
      assert.ok(
        sim < DUP_THRESHOLD,
        `"${vigas[i]}" vs "${vigas[j]}" da ${sim}, se propondría agruparlas`
      )
    }
  }
})

test('una viga sigue siendo igual a si misma', () => {
  assert.equal(fuzzyJaccard('TIPO V1 MF+', 'TIPO V1 MF+'), 1)
  // Y tolera el formato: mayúsculas, acentos y signos
  assert.equal(fuzzyJaccard('TIPO V1 MF+', 'tipo v1 mf'), 1)
})

// ─── Los números son la especificación ──────────────────────────────

test('un codigo con digitos distinto impide el emparejamiento', () => {
  const pares = [
    ['Tornillo M8 inoxidable DIN 933', 'Tornillo M10 inoxidable DIN 933'],
    ['Mortero M-5 gris', 'Mortero M-10 gris'],
    ['Redondo corrugado D12 B500S', 'Redondo corrugado D16 B500S'],
    ['Viga HEB 200 acero S275', 'Viga HEB 300 acero S275'],
    ['Hormigon HA-25 blando', 'Hormigon HA-30 blando'],
  ]
  for (const [a, b] of pares) {
    const sim = fuzzyJaccard(a, b)
    assert.ok(sim < REF_THRESHOLD, `"${a}" vs "${b}" da ${sim}, se tomaria por el mismo`)
  }
})

test('mismo codigo y texto parecido SI empareja', () => {
  assert.ok(fuzzyJaccard('Mortero M-5 gris', 'Mortero M-5 gris a granel') >= REF_THRESHOLD)
  assert.ok(fuzzyJaccard('Hormigon HA-25 blando', 'Hormigon HA-25 blando en masa') >= REF_THRESHOLD)
})

test('que a uno le sobre un codigo no impide emparejar', () => {
  // Mismo producto con el formato detallado: no es un conflicto de códigos
  assert.ok(fuzzyJaccard('Mortero M-5 gris', 'Mortero M-5 gris saco 25 kg') >= REF_THRESHOLD)
})

// ─── El prefijo ya no vale por si solo ──────────────────────────────

test('el material y la maquina no son lo mismo aunque empiecen igual', () => {
  // "hormigon" vs "hormigonera": antes emparejaban por startsWith
  assert.ok(fuzzyJaccard('Hormigon gris', 'Hormigonera gris') < DUP_THRESHOLD)
})

test('pero el plural sigue emparejando', () => {
  assert.equal(fuzzyJaccard('Ladrillo perforado', 'Ladrillos perforados'), 1)
})

// ─── Que no se rompa lo que ya funcionaba ───────────────────────────

test('nombres iguales siguen dando 1 y distintos siguen dando 0', () => {
  assert.equal(fuzzyJaccard('Cemento gris a granel', 'Cemento gris a granel'), 1)
  assert.equal(fuzzyJaccard('Cemento gris', 'Pintura plastica'), 0)
})

test('un nombre vacio no rompe nada', () => {
  assert.equal(fuzzyJaccard('', 'Cemento'), 0)
  assert.equal(fuzzyJaccard('Cemento', ''), 0)
  assert.equal(fuzzyJaccard('', ''), 0)
})

test('nombres sin digitos siguen comparandose por texto', () => {
  // Sin códigos de por medio, el comportamiento es el de siempre
  assert.ok(fuzzyJaccard('Pintura plastica blanca mate', 'Pintura plastica blanca') >= REF_THRESHOLD)
})
