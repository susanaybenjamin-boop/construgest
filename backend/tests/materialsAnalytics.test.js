// Análisis de materiales: un GRUPO vinculado es un producto.
// Ejecutar con:  node --test backend/tests/
//
// Antes, vincular dos materiales (mismo material_group_id) solo servía para
// dejar de sugerir el duplicado: la comparativa seguía mirando material por
// material, así que el trabajo de vincular NO devolvía nada.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { analyzeMaterials } from '../src/services/materials-analytics.js'

const proveedores = [
  { id: 'sA', name: 'Proveedor A' },
  { id: 'sB', name: 'Proveedor B' },
]

test('vinculados: compara las ofertas de los DOS proveedores', () => {
  // Cada material está a su propio precio: por separado NINGUNO da aviso.
  // El aviso solo puede salir de comparar los dos, o sea de haberlos vinculado.
  const materials = [
    { id: 'm1', name: 'Cemento gris 25 kg (Prov. A)', unit: 'sc', unit_price: 6, material_group_id: 'g1' },
    { id: 'm2', name: 'Cemento gris 25kg (Prov. B)', unit: 'sc', unit_price: 4, material_group_id: 'g1' },
  ]
  const links = [
    { material_id: 'm1', supplier_id: 'sA', unit_price: 6 },
    { material_id: 'm2', supplier_id: 'sB', unit_price: 4 },   // el barato
  ]
  const r = analyzeMaterials(materials, links, proveedores)

  assert.equal(r.price_alerts.length, 1, 'un aviso por grupo, no uno por material')
  const a = r.price_alerts[0]
  assert.equal(a.best_supplier_price, 4)
  assert.equal(a.best_supplier_name, 'Proveedor B')
  // Dice de qué material vinculado sale la oferta buena
  assert.equal(a.linked_material_name, 'Cemento gris 25kg (Prov. B)')
  assert.ok(a.recommendation.includes('vinculado'))

  assert.equal(r.supplier_optimization.length, 1)
  assert.ok(r.supplier_optimization[0].includes('2 materiales que tienes vinculados'))
})

test('sin vincular, esos mismos materiales no se comparan entre si', () => {
  const materials = [
    { id: 'm1', name: 'Cemento gris 25 kg (Prov. A)', unit: 'sc', unit_price: 6, material_group_id: null },
    { id: 'm2', name: 'Cemento gris 25kg (Prov. B)', unit: 'sc', unit_price: 4, material_group_id: null },
  ]
  const links = [
    { material_id: 'm1', supplier_id: 'sA', unit_price: 6 },
    { material_id: 'm2', supplier_id: 'sB', unit_price: 4 },
  ]
  const r = analyzeMaterials(materials, links, proveedores)
  // Cada uno con su unica oferta: nadie es mas barato que si mismo
  assert.equal(r.price_alerts.length, 0)
  assert.equal(r.supplier_optimization.length, 0)
  // Pero SI se propone vincularlos
  assert.equal(r.duplicates.length, 1)
  assert.equal(r.duplicates[0].suggested_action, 'Agrupar como equivalentes')
})

test('un material suelto se comporta como siempre', () => {
  const materials = [{ id: 'm1', name: 'Arena', unit: 'm3', unit_price: 30, material_group_id: null }]
  const links = [
    { material_id: 'm1', supplier_id: 'sA', unit_price: 30 },
    { material_id: 'm1', supplier_id: 'sB', unit_price: 20 },
  ]
  const r = analyzeMaterials(materials, links, proveedores)
  assert.equal(r.price_alerts.length, 1)
  assert.equal(r.price_alerts[0].best_supplier_price, 20)
  // No es un grupo vinculado: no debe hablar de vinculacion
  assert.equal(r.price_alerts[0].linked_material_name, undefined)
  assert.ok(!r.price_alerts[0].recommendation.includes('vinculado'))
})

test('del grupo se avisa sobre el precio MAS CARO, que es donde esta el ahorro', () => {
  const materials = [
    { id: 'm1', name: 'Caro', unit: 'ud', unit_price: 10, material_group_id: 'g1' },
    { id: 'm2', name: 'Barato', unit: 'ud', unit_price: 7, material_group_id: 'g1' },
  ]
  const links = [{ material_id: 'm2', supplier_id: 'sB', unit_price: 5 }]
  const r = analyzeMaterials(materials, links, proveedores)
  assert.equal(r.price_alerts.length, 1)
  assert.equal(r.price_alerts[0].material_name, 'Caro')
  assert.equal(r.price_alerts[0].current_price, 10)
})

test('un grupo con oferta cuenta como UN producto con oferta', () => {
  const materials = [
    { id: 'm1', name: 'A', unit: 'ud', unit_price: 5, material_group_id: 'g1' },
    { id: 'm2', name: 'B', unit: 'ud', unit_price: 5, material_group_id: 'g1' },
  ]
  const links = [
    { material_id: 'm1', supplier_id: 'sA', unit_price: 5 },
    { material_id: 'm2', supplier_id: 'sB', unit_price: 5 },
  ]
  const r = analyzeMaterials(materials, links, proveedores)
  assert.equal(r.materials_with_offers, 1)
  assert.equal(r.total_items, 2)
})

test('un catalogo vacio no rompe nada', () => {
  const r = analyzeMaterials([], [], [])
  assert.equal(r.total_items, 0)
  assert.deepEqual(r.duplicates, [])
  assert.deepEqual(r.price_alerts, [])
})
