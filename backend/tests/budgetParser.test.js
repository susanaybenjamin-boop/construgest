// ============================================================================
// Red de seguridad del parser de presupuestos (PARSE-2).
//
// Hasta ahora `npm test` NO probaba el parser: solo existía el script manual
// `test-parser-v6.mjs`. Resultado: al añadir soporte para un formato nuevo no
// había forma rápida de ver si se rompía otro. Aquí va un caso por FORMATO.
//
// Todo con `useAI = false`: determinista, sin Ollama y sin base de datos.
// ============================================================================
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseBudgetFromText, cleanPdfText } from '../src/services/budget-parser.js'

const HERE = dirname(fileURLToPath(import.meta.url))

const parse = (text) => parseBudgetFromText(text, false, null, null)
const countItems = (chapters) => chapters.reduce((s, c) => s + c.items.length, 0)
const total = (chapters) =>
  chapters.reduce((s, c) => s + c.items.reduce((t, i) => t + i.quantity * i.unit_price, 0), 0)
const findItem = (chapters, code) =>
  chapters.flatMap((c) => c.items).find((i) => i.code === code)

// ---------------------------------------------------------------------------
// FORMATO 1 — partida en UNA LÍNEA (Word / Excel / PDF redactado con un LLM).
// Es el del presupuesto de Parque Fórum (2026-11-09): código + título + unidad
// + cantidad · precio · importe en la misma línea, descripción debajo.
// ---------------------------------------------------------------------------
const UNA_LINEA = `
BENJAMIN RECIO LOPEZ
PRESUPUESTO
Presupuesto: Nº 2026-023
ÍNDICE DE CAPÍTULOS
N. CAPÍTULO IMPORTE %
01 INTERIOR DE ZONAS COMUNES 2.743,60 € 63,21%
CAPÍTULO 01 INTERIOR DE ZONAS COMUNES
Código Concepto Ud. Cantidad Precio Importe
01.01 PROTECCIÓN DE ZONAS COMUNES    ud 1,00 680,00 € 680,00 €
Protección de suelos, peldaños, carpinterías, puertas de ascensor,
revestimientos de madera y luminarias, con retirada al terminar.
01.02 TRATAMIENTO DE FISURAS FINAS    ml 93,80 22,00 € 2.063,60 €
Tratamiento de fisura fina en paramento o techo: apertura en V, limpieza,
sellado con masilla elástica. Medida la longitud ejecutada.
SUBTOTAL 2.743,60 €
BENJAMIN RECIO LOPEZ Presupuesto 2026-023 — 9 de noviembre de 2026 Página 3 de 23
CAPÍTULO 02 EXTERIOR
02.01 PINTURA EXTERIOR    M2 124,25 14,00 € 1.739,50 €
Pintura de los paramentos exteriores afectados.
SUBTOTAL 1.739,50 €
`

describe('formato "partida en una línea" (Word/Excel/LLM)', () => {
  test('extrae los capítulos y las partidas con sus importes', async () => {
    const { chapters } = await parse(UNA_LINEA)

    assert.equal(chapters.length, 2, 'dos capítulos')
    assert.equal(countItems(chapters), 3, 'tres partidas')
    assert.equal(Math.round(total(chapters) * 100) / 100, 4483.1)
  })

  test('respeta código, unidad, cantidad y precio de cada partida', async () => {
    const { chapters } = await parse(UNA_LINEA)

    const fisuras = findItem(chapters, '01.02')
    assert.ok(fisuras, 'la partida 01.02 existe')
    assert.equal(fisuras.name, 'TRATAMIENTO DE FISURAS FINAS')
    assert.equal(fisuras.unit, 'ML', 'la unidad va DETRÁS del título, no delante')
    assert.equal(fisuras.quantity, 93.8)
    assert.equal(fisuras.unit_price, 22)

    const pintura = findItem(chapters, '02.01')
    assert.equal(pintura.unit, 'M2')
    assert.equal(pintura.quantity, 124.25)
  })

  test('la descripción de debajo se queda en la partida', async () => {
    const { chapters } = await parse(UNA_LINEA)
    const proteccion = findItem(chapters, '01.01')

    assert.match(proteccion.description, /puertas de ascensor/)
    assert.match(proteccion.description, /con retirada al terminar/)
  })

  test('el pie de página con texto delante no se cuela en la descripción', async () => {
    const { chapters } = await parse(UNA_LINEA)
    const fisuras = findItem(chapters, '01.02')

    assert.doesNotMatch(fisuras.description, /P[áa]gina 3 de 23/)
    assert.doesNotMatch(fisuras.description, /BENJAMIN RECIO LOPEZ/)
    // Y la línea se quita ya en la pre-limpieza:
    const { text } = cleanPdfText('EMPRESA S.L. Presupuesto 2026-023 — 9 de noviembre Página 3 de 23')
    assert.equal(text, '')
  })

  test('el SUBTOTAL del capítulo no se cuela como descripción', async () => {
    const { chapters } = await parse(UNA_LINEA)
    for (const item of chapters.flatMap((c) => c.items)) {
      assert.doesNotMatch(item.description || '', /SUBTOTAL/i)
    }
  })
})

// ---------------------------------------------------------------------------
// ANEXOS — un presupuesto "completo" trae anexo de mediciones por zona y
// reportaje fotográfico. No son partidas y no deben contaminar la última
// partida del capítulo (ni como descripción ni como mediciones).
// ---------------------------------------------------------------------------
const CON_ANEXOS = `${UNA_LINEA}
ANEXO I. MEDICIONES POR ZONA
Capítulo 01. Interior de zonas comunes
Zona Fisuras finas (ml) Techos (m²) Paredes (m²)
Planta 5ª (pasillo, rellanos y acceso a cubierta) 8,00 10,95 24,76
Planta 4ª 10,00 10,95 19,47
TOTAL INTERIOR 93,80 112,25 244,69
ANEXO II. REPORTAJE FOTOGRÁFICO POR ZONAS
Planta 5ª
Foto 1 Foto 2
Foto 3
`

describe('anexos y reportaje fotográfico', () => {
  test('no cambian ni el número de partidas ni los importes', async () => {
    const sin = await parse(UNA_LINEA)
    const con = await parse(CON_ANEXOS)

    assert.equal(con.chapters.length, sin.chapters.length)
    assert.equal(countItems(con.chapters), countItems(sin.chapters))
    assert.equal(total(con.chapters).toFixed(2), total(sin.chapters).toFixed(2))
  })

  test('ni se cuelan en la descripción ni inventan mediciones', async () => {
    const { chapters } = await parse(CON_ANEXOS)

    for (const item of chapters.flatMap((c) => c.items)) {
      assert.doesNotMatch(item.description || '', /Foto \d/)
      assert.doesNotMatch(item.description || '', /ANEXO/i)
      assert.doesNotMatch(item.description || '', /Planta 5/)
      assert.equal(item.measurements.length, 0, `${item.code} sin mediciones inventadas`)
    }
  })
})

// ---------------------------------------------------------------------------
// FORMATO 2 — clásico con separador de guiones bajos y resumen debajo
// (PRESTO / Arquímedes exportando a PDF), CON mediciones.
// ---------------------------------------------------------------------------
const SEPARADORES = `
CAPÍTULO 01 ACTUACIONES PREVIAS
01.01 m2 Demolición de solado de baldosa cerámica
Demolición de solado de baldosas cerámicas con medios manuales, incluso
retirada de escombros a vertedero autorizado.
Uds. Largo Ancho Alto Parcial
Planta baja 1 4,20 2,50 10,50
Planta primera 1 3,00 2,50 7,50
_______________________________________________
18,00 12,50 225,00
01.02 ud Arqueta de paso registrable
Arqueta de paso registrable de 40x40x50 cm.
_______________________________________________
3,00 85,00 255,00
`

describe('formato clásico con separadores (PRESTO/Arquímedes)', () => {
  test('sigue extrayendo partidas, importes y mediciones', async () => {
    const { chapters } = await parse(SEPARADORES)

    assert.equal(chapters.length, 1)
    assert.equal(countItems(chapters), 2)

    const demolicion = findItem(chapters, '01.01')
    assert.equal(demolicion.unit, 'M2', 'aquí la unidad SÍ va detrás del código')
    assert.equal(demolicion.quantity, 18)
    assert.equal(demolicion.unit_price, 12.5)
    assert.equal(demolicion.measurements.length, 2)
    assert.equal(demolicion.measurements[0].partial, 10.5)

    const arqueta = findItem(chapters, '01.02')
    assert.equal(arqueta.unit, 'UD')
    assert.equal(arqueta.quantity, 3)
    assert.equal(arqueta.unit_price, 85)
  })
})

// ---------------------------------------------------------------------------
// Partidas inválidas: cantidad o precio a cero se descartan (y se dice por qué
// en los logs). Es el motivo más habitual de "faltan partidas".
// ---------------------------------------------------------------------------
describe('descartes', () => {
  test('una partida con precio 0 se descarta y queda constancia en los logs', async () => {
    const { chapters, logs } = await parse(`
CAPÍTULO 01 VARIOS
01.01 PARTIDA BUENA    ud 2,00 50,00 € 100,00 €
01.02 PARTIDA SIN PRECIO    ud 1,00 0,00 € 0,00 €
`)
    assert.equal(countItems(chapters), 1)
    assert.equal(findItem(chapters, '01.01').unit_price, 50)
    assert.ok(logs.length > 0, 'el parser SIEMPRE devuelve traza')
  })

  test('un texto que no es un presupuesto no revienta: devuelve vacío con traza', async () => {
    const { chapters, logs } = await parse('Hola, esto es una carta.\nUn saludo.')

    assert.equal(chapters.length, 0)
    assert.ok(logs.length > 0, 'hay que poder decirle al usuario POR QUÉ')
  })
})

// ---------------------------------------------------------------------------
// Fixture real (presupuesto de Ogijares, formato PRESTO con separadores). Es el
// guardián contra regresiones: si tocas el parser y estos números bajan, has
// roto un presupuesto que YA funcionaba.
// ---------------------------------------------------------------------------
describe('fixture real de Ogijares (no romper lo que ya iba)', () => {
  const fixture = join(HERE, '..', 'test-pdf-output.txt')

  test('26 capítulos, 149 partidas, 293 mediciones, 95.426,76 €', async (t) => {
    if (!existsSync(fixture)) {
      t.skip('falta backend/test-pdf-output.txt')
      return
    }
    const { chapters } = await parse(readFileSync(fixture, 'utf-8'))
    const measurements = chapters.reduce(
      (s, c) => s + c.items.reduce((t2, i) => t2 + (i.measurements?.length || 0), 0), 0)

    assert.equal(chapters.length, 26)
    assert.equal(countItems(chapters), 149)
    assert.equal(measurements, 293)
    assert.equal(total(chapters).toFixed(2), '95426.76')
  })
})
