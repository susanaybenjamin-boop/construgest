// Tests de la exportacion a BC3 (FIEBDC-3).
// Ejecutar con:  node --test backend/tests/
//
// Lo que se vigila aqui, por orden de importancia:
//   1) COHERENCIA INTERNA: el precio de cada concepto con descomposicion tiene
//      que ser la suma de sus hijos. La spec dice que en caso de discrepancia
//      manda la descomposicion, asi que un descuadre cambia el importe de la
//      obra en el programa que lo recibe. Ya paso una vez (se sumaba sin
//      redondear y se imprimia redondeado: la raiz salia un centimo corta).
//   2) ROUND-TRIP: lo que exportamos lo tiene que poder volver a leer nuestro
//      propio importador, origen a origen.
//   3) Que ningun texto rompa el fichero con los separadores del formato.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildBC3, buildBC3Buffer } from '../src/services/bc3-export.js'
import { parseBC3 } from '../src/services/bc3-parser.js'

const BS = String.fromCharCode(92) // barra invertida: separador de subcampos

// ─── Utilidades de los tests ────────────────────────────────────────

function makeBudget(chapters) {
  return {
    project: { name: 'Obra de prueba', description: '' },
    budget: { name: 'Presupuesto', version: 1, overhead_pct: 13, profit_pct: 6, tax_rate: 21 },
    chapters,
  }
}

function chapter(code, name, items, extra = {}) {
  return { chapter: { id: code, code, name, parent_id: null, sort_order: 0, ...extra }, items }
}

function item(code, name, unit, quantity, unit_price, measurements = []) {
  return { id: code, code, name, description: '', unit, quantity, unit_price, sort_order: 0, measurements }
}

/**
 * Trocea el fichero en REGISTROS (no en lineas), igual que hace el parser.
 * Hace falta porque un ~T puede ocupar varias lineas: las descripciones
 * conservan sus parrafos, y el formato lo permite.
 */
function splitRecords(text) {
  return text
    .split('~')
    .filter(Boolean)
    .map(r => '~' + r.replace(/\r?\n$/, ''))
}

/** Relee el BC3 generado y devuelve precios por codigo + las descomposiciones. */
function readBack(text) {
  const prices = new Map()
  const decomp = []
  const records = {}
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('~')) continue
    const type = line[1]
    records[type] = (records[type] || 0) + 1
    const f = line.split('|')
    if (type === 'C') prices.set(f[1], parseFloat(f[4]))
    if (type === 'D') {
      const parts = f[2].split(BS)
      const kids = []
      for (let i = 0; i < parts.length; i += 3) {
        if (parts[i]) kids.push({ code: parts[i], yield: parseFloat(parts[i + 2] || '0') })
      }
      decomp.push({ parent: f[1], kids })
    }
  }
  return { prices, decomp, records }
}

// ─── Cabeceras ──────────────────────────────────────────────────────

test('~V declara presupuesto (tipo 2), ANSI y la version del formato', () => {
  const { text } = buildBC3(makeBudget([chapter('01', 'CAP', [item('01.01', 'P', 'm2', 1, 10)])]))
  const v = text.split(/\r?\n/)[0].split('|')
  assert.equal(v[0], '~V')
  assert.match(v[2], /^FIEBDC-3\/2016\\\d{8}$/)   // VERSION_FORMATO \ DDMMAAAA
  assert.equal(v[5], 'ANSI')                      // JUEGO_CARACTERES
  assert.equal(v[7], '2')                         // TIPO INFORMACION = presupuesto
})

test('~K lleva los porcentajes del presupuesto en CI/GG/BI/BAJA/IVA', () => {
  const data = makeBudget([chapter('01', 'CAP', [item('01.01', 'P', 'm2', 1, 10)])])
  const { text } = buildBC3(data)
  const k = text.split(/\r?\n/)[1].split('|')
  assert.equal(k[0], '~K')
  // CI = 0 (Construgest no tiene costes indirectos por partida todavia)
  assert.deepEqual(k[2].split(BS), ['0', '13', '6', '0', '21'])
})

// ─── Coherencia interna (el fallo que ya paso) ──────────────────────

test('el precio de cada concepto es la suma exacta de su descomposicion', () => {
  // Importes elegidos para forzar el arrastre de decimales:
  // 86.25 x 28.9 = 2492.625 y 125.5 x 12.4 = 1556.2
  const data = makeBudget([
    chapter('01', 'DEMOLICIONES', [
      item('01.01', 'Demolicion', 'm2', 125.5, 12.4),
      item('01.02', 'Excavacion', 'm3', 48, 23.15),
    ]),
    chapter('02', 'ALBANILERIA', [item('02.01', 'Tabique', 'm2', 86.25, 28.9)], { id: 'c2' }),
  ])
  const { text, stats } = buildBC3(data)
  const { prices, decomp } = readBack(text)

  for (const d of decomp) {
    const suma = Math.round(
      d.kids.reduce((s, k) => s + Math.round(prices.get(k.code) * k.yield * 100) / 100, 0) * 100
    ) / 100
    assert.equal(suma, prices.get(d.parent), `descuadre en ${d.parent}`)
  }

  // Y lo que ensena la app tiene que ser lo que dice el fichero
  const root = [...prices.entries()].find(([code]) => code.endsWith('##'))[1]
  assert.equal(stats.total, root)
})

test('los subcapitulos entran en el total de su capitulo padre', () => {
  const data = makeBudget([
    chapter('02', 'ALBANILERIA', [item('02.01', 'Tabique', 'm2', 10, 10)], { id: 'c2' }),
    chapter('02.1', 'Revestimientos', [item('02.1.01', 'Enfoscado', 'm2', 10, 5)], { id: 'c3', parent_id: 'c2' }),
  ])
  const { text, stats, warnings } = buildBC3(data)
  const { prices } = readBack(text)
  assert.equal(prices.get('02#'), 150)    // 100 propio + 50 del subcapitulo
  assert.equal(prices.get('02.1#'), 50)
  assert.equal(stats.total, 150)
  assert.ok(warnings.some(w => w.includes('subcapitulos')))
})

// ─── Round-trip ─────────────────────────────────────────────────────

test('round-trip: lo exportado lo vuelve a leer parseBC3 origen a origen', () => {
  const data = makeBudget([
    chapter('01', 'DEMOLICIONES', [
      item('01.01', 'Demolicion de tabique', 'm2', 125.5, 12.4, [
        { description: 'Salon', zone: 'Planta 1', units: 2, length: 4.5, width: 0, height: 2.7, sort_order: 0 },
        { description: 'Dormitorio', zone: 'Planta 1', units: 1, length: 3.2, width: 0, height: 2.7, sort_order: 1 },
      ]),
      item('01.02', 'Excavacion en zanja', 'm3', 48, 23.15),
    ]),
  ])
  const { buffer } = buildBC3Buffer(data)
  const back = parseBC3(buffer)

  assert.equal(back.chapters.length, 1)
  assert.equal(back.chapters[0].name, 'DEMOLICIONES')

  const items = back.chapters[0].items
  assert.equal(items.length, 2)
  assert.deepEqual(
    { code: items[0].code, unit: items[0].unit, quantity: items[0].quantity, unit_price: items[0].unit_price },
    { code: '01.01', unit: 'm2', quantity: 125.5, unit_price: 12.4 }
  )
  assert.equal(items[1].quantity, 48)
  assert.equal(items[1].unit_price, 23.15)

  // Las dos lineas de medicion vuelven con sus dimensiones y su zona
  assert.equal(items[0].measurements.length, 2)
  assert.equal(items[0].measurements[0].units, 2)
  assert.equal(items[0].measurements[0].length, 4.5)
  assert.equal(items[0].measurements[0].height, 2.7)
  assert.ok(items[0].measurements[0].description.includes('Planta 1'))
})

test('todo el fichero es representable en latin1 (la invariante del ~V ANSI)', () => {
  // Si se cuela un solo caracter fuera de latin1, Buffer.from(...,'latin1') se
  // queda con su byte bajo SIN AVISAR y el fichero sale corrupto. Esta
  // comprobacion lo caza: ida y vuelta por latin1 tiene que dar el mismo texto.
  const data = makeBudget([
    chapter('01', 'ALBAÑILERÍA “especial”', [
      { id: 'i1', code: '01.01', name: 'Murete de 20 cm — acabado “visto”', unit: 'm²', quantity: 1, unit_price: 10, sort_order: 0,
        description: 'Precio: 10 € … con junta de 1½ cm y aditivo “X”.', measurements: [] },
    ]),
  ])
  const { text, buffer } = buildBC3Buffer(data)
  assert.equal(buffer.toString('latin1'), text, 'hay caracteres que latin1 no puede escribir')
})

test('la tipografia de Word no rompe el fichero (comillas, guiones, euro)', () => {
  const data = makeBudget([
    chapter('01', 'CAP', [
      { id: 'i1', code: '01.01', name: 'Murete — acabado “visto”', unit: 'm2', quantity: 1, unit_price: 10, sort_order: 0,
        description: 'Son 10 € … y media: 1½. Comillas ‘simples’.', measurements: [] },
    ]),
  ])
  const { text } = buildBC3Buffer(data)

  // El guion largo seria 0x14 y las comillas curvas 0x1C: caracteres de control
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[\x00-\x09\x0B\x0C\x0E-\x1F]/.test(text), 'han quedado caracteres de control')

  const c = splitRecords(text).find(r => r.startsWith('~C|01.01|'))
  assert.ok(c.includes('Murete - acabado "visto"'), `resumen mal transliterado: ${c}`)

  const t = splitRecords(text).find(r => r.startsWith('~T|01.01|'))
  assert.ok(t.includes('10 EUR'), `el euro no se ha convertido: ${t}`)
  assert.ok(t.includes('...'), 'los puntos suspensivos no se han convertido')
  assert.ok(t.includes('1/2'), 'la fraccion no se ha convertido')
  assert.ok(t.includes("'simples'"), 'las comillas simples curvas no se han convertido')
})

test('el caracter de reemplazo de un texto ya roto no ensucia el fichero', () => {
  // U+FFFD aparece cuando el texto llego mal a la base de datos. Su byte bajo
  // es 0xFD = "y con acento", que es justo lo que salia antes en las pruebas.
  const data = makeBudget([
    chapter('01', 'CAP', [item('01.01', 'Demolici�n de tabique', 'm2', 1, 10)]),
  ])
  const { text } = buildBC3Buffer(data)
  assert.ok(!text.includes('�'))
  assert.ok(!text.includes('ý'), 'ha salido "y con acento" en vez de limpiarlo')
  assert.ok(text.includes('Demolicin de tabique') || text.includes('Demolici n de tabique'))
})

test('round-trip: los acentos sobreviven (latin1/ANSI, no UTF-8)', () => {
  const data = makeBudget([
    chapter('01', 'ALBAÑILERÍA', [item('01.01', 'Demolición de añadido', 'm2', 1, 10)]),
  ])
  const { buffer, text } = buildBC3Buffer(data)
  assert.ok(!text.includes('Ã'), 'el texto no debe llevar doble codificacion')
  const back = parseBC3(buffer)
  assert.equal(back.chapters[0].name, 'ALBAÑILERÍA')
  assert.equal(back.chapters[0].items[0].name, 'Demolición de añadido')
})

// ─── Robustez del formato ───────────────────────────────────────────

test('los separadores del formato en un texto no parten el fichero', () => {
  // Un nombre con ~ | y barra invertida reventaria el fichero si no se limpia
  const sucio = 'Tabique ~raro| con ' + BS + ' barras'
  const data = makeBudget([chapter('01', 'CAP', [item('01.01', sucio, 'm2', 2, 10)])])
  const { buffer, text } = buildBC3Buffer(data)

  // Ningun ~ ni | ni barra invertida de mas: el ~C de la partida tiene que
  // seguir teniendo sus 7 campos exactos, con el precio en su sitio
  const c = splitRecords(text).find(r => r.startsWith('~C|01.01|'))
  assert.ok(c, 'falta el ~C de la partida')
  assert.equal(c.indexOf('~', 1), -1, `~ suelto dentro del registro: ${c}`)
  const fields = c.split('|')
  assert.equal(fields.length, 8)        // ~C + 6 campos + el cierre vacio
  assert.equal(fields[4], '10')         // el precio no se ha desplazado
  assert.ok(!fields[3].includes(BS), 'el resumen no debe llevar barras invertidas')

  const back = parseBC3(buffer)
  assert.equal(back.chapters[0].items.length, 1)
  assert.equal(back.chapters[0].items[0].quantity, 2)
  assert.equal(back.chapters[0].items[0].unit_price, 10)
})

test('el HTML de las descripciones sale como texto plano en ~T', () => {
  const data = makeBudget([
    chapter('01', 'CAP', [
      { id: 'i1', code: '01.01', name: 'Partida', unit: 'm2', quantity: 1, unit_price: 10, sort_order: 0,
        description: '<p>Primer <strong>parrafo</strong>.</p><p>Segundo&nbsp;parrafo.</p>', measurements: [] },
    ]),
  ])
  const { text } = buildBC3(data)
  const t = splitRecords(text).find(r => r.startsWith('~T|01.01|'))
  assert.ok(t, 'falta el ~T de la partida')
  assert.ok(!t.includes('<'), 'no debe quedar HTML')
  assert.ok(!t.includes('&nbsp;'), 'no deben quedar entidades HTML')
  assert.ok(t.includes('Primer parrafo.'))
  assert.ok(t.includes('Segundo parrafo.'))
  // Los parrafos se conservan como saltos de linea dentro del registro
  assert.ok(t.includes('\n'), 'los parrafos deben seguir separados')
})

test('dos partidas con el mismo codigo no generan codigos duplicados', () => {
  const data = makeBudget([
    chapter('01', 'CAP', [
      item('01.01', 'Primera', 'm2', 1, 10),
      item('01.01', 'Duplicada', 'm2', 1, 20),
    ]),
  ])
  const { text } = buildBC3(data)
  const codes = text.split(/\r?\n/).filter(l => l.startsWith('~C|')).map(l => l.split('|')[1])
  assert.equal(new Set(codes).size, codes.length, `codigos repetidos: ${codes}`)
})

test('los codigos no pasan de 20 caracteres (limite de la spec)', () => {
  const data = makeBudget([
    chapter('CAPITULO-CON-UN-CODIGO-LARGUISIMO', 'CAP', [
      item('PARTIDA-CON-UN-CODIGO-TAMBIEN-LARGUISIMO', 'P', 'm2', 1, 10),
    ]),
  ])
  const { text } = buildBC3(data)
  for (const line of text.split(/\r?\n/).filter(l => l.startsWith('~C|'))) {
    const code = line.split('|')[1]
    assert.ok(code.length <= 20, `codigo de ${code.length} caracteres: ${code}`)
  }
})

test('un presupuesto vacio avisa en vez de generar basura', () => {
  const { warnings, stats } = buildBC3(makeBudget([]))
  assert.equal(stats.items, 0)
  assert.ok(warnings.some(w => w.includes('no tiene partidas')))
})

test('avisa de las partidas a cantidad 0 y a precio 0', () => {
  const data = makeBudget([
    chapter('01', 'CAP', [item('01.01', 'Sin cantidad', 'm2', 0, 10), item('01.02', 'Sin precio', 'm2', 5, 0)]),
  ])
  const { warnings } = buildBC3(data)
  assert.ok(warnings.some(w => w.includes('01.01') && w.includes('cantidad 0')))
  assert.ok(warnings.some(w => w.includes('01.02') && w.includes('precio 0')))
})

test('los avisos por partida se resumen en uno, no uno por partida', () => {
  // 10 partidas a precio 0 tienen que dar UN aviso, no diez
  const items = []
  for (let i = 1; i <= 10; i++) {
    items.push(item(`01.${String(i).padStart(2, '0')}`, `Partida ${i}`, 'm2', 1, 0))
  }
  const { warnings } = buildBC3(makeBudget([chapter('01', 'CAP', items)]))
  const dePrecio = warnings.filter(w => w.includes('precio 0'))
  assert.equal(dePrecio.length, 1, `deberia haber 1 aviso, hay ${dePrecio.length}`)
  assert.ok(dePrecio[0].includes('10 partidas'))
  assert.ok(dePrecio[0].includes('y 4 mas'), `no resume la lista: ${dePrecio[0]}`)
})
