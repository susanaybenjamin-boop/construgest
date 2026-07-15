/**
 * Budget Parser v8.0 — Extracción máxima: capítulos, partidas, descripciones Y mediciones
 *
 * Diseñado para manejar:
 *   - Códigos alfanuméricos (02AVV00002, E09NAL020, ICS020, K21, 04.02)
 *   - CAPÍTULO C01 y SUBCAPÍTULO C08.03 con prefijo C
 *   - Separadores de guiones bajos como delimitadores de bloques
 *   - Unidades variadas (m2, m3, ud, u, m, kg, ml, Ml, Ud, etc.)
 *   - Ruido de página (cabeceras, pies, fechas, totales, software headers)
 *   - Partidas que cruzan saltos de página
 *   - MEDICIONES con uds, largo, ancho, alto, parcial (incluso negativos)
 *   - Cabeceras de medición con sinónimos: Longitud/Largo, Anchura/Ancho, Altura/Alto
 *   - Formatos: Presto, Arquímedes, TCQ, Cype, BC3, manuales
 *   - Fórmulas inline: 2*(3,50+4,20), expresiones aritméticas
 *   - Grupos de medición: "Planta baja", "Fachada norte", "Zona A"
 *   - Mediciones con "idem", "id.", "igual anterior"
 *   - Subtotales parciales por grupo
 *
 * Estrategia:
 *   1. Pre-limpieza agresiva de ruido de página
 *   2. Parser algorítmico usando separadores ___ como delimitadores
 *   3. Extracción de mediciones del body de cada partida
 *   4. Validación: suma de parciales ≈ cantidad total
 *   5. Fallback IA si el algoritmo extrae menos del 30% esperado
 */

import { callAI } from './ai-service.js'

// ═══════════════════════════════════════════════════════
// PROMPT EXPERTO PARA IA
// ═══════════════════════════════════════════════════════

const PDF_EXTRACTION_PROMPT = `Eres un sistema experto en presupuestos de construcción españoles. Tu ÚNICA tarea es extraer capítulos, partidas y sus mediciones de un PDF de presupuesto.

═══════════════════════════════════════════════════════════════
ESTRUCTURA DE PRESUPUESTOS ESPAÑOLES
═══════════════════════════════════════════════════════════════

CAPÍTULO = grupo de trabajos.
  Código: C01, C02, 01, 02 (con o sin prefijo C).
  Nombre: "MOVIMIENTO DE TIERRAS", "CIMENTACIONES", etc.

PARTIDA = trabajo concreto DENTRO de un capítulo.
  Código ALFANUMÉRICO: 02AVV00002, E09NAL020, ICS020, 04.02, K21
  Unidad: UD, ML, M2, M3, KG, PA, H, M, U
  NOMBRE = título CORTO de la partida (primera línea, máx 100 caracteres)
  CONCEPTO EXHAUSTIVO (description) = descripción detallada DESPUÉS del título.
    Contiene parte del título pero con más explicación y detalle técnico.
    Incluye especificaciones técnicas, materiales, métodos, acabados, etc.
    SIEMPRE extraer el description completo — es información valiosa para el proyecto.
  Al final: Cantidad total, Precio unitario, Importe

MEDICIONES = líneas de cálculo que aparecen DESPUÉS de la descripción y ANTES del total.
  Son el DESGLOSE de cómo se calcula la cantidad total de la partida.

  ESTRUCTURA de cada línea de medición:
    [Descripción]    [Uds]    [Largo]    [Ancho]    [Alto]    [Parcial]

  SINÓNIMOS DE COLUMNAS (todas son válidas):
    Uds = Uds, Unidades, Nº, N°, Num, Cantidad, Ud, Repeticiones, Nº veces, Veces
    Largo = Largo, Longitud, Long., L, Dimensión 1
    Ancho = Ancho, Anchura, Anch., A, Dimensión 2, Latitud
    Alto = Alto, Altura, Alt., H, Dimensión 3, Profundidad
    Parcial = Parcial, Subtotal, Total parcial, Importe parcial, Resultado

  Donde: Parcial = Uds × Largo × Ancho × Alto (los campos vacíos valen 1.0)
  La SUMA de todos los parciales = Cantidad total de la partida

  REGLAS DE MEDICIONES:
  - Uds puede ser NEGATIVO (ej: -1, -2) para descontar huecos, ventanas, etc.
  - No todas las columnas están siempre presentes (puede faltar Ancho o Alto)
  - La descripción es CORTA (ej: "Cocina", "Baño P1", "A deducir huecos")
  - Puede haber líneas sin descripción (solo números)
  - Cabeceras de medición varían entre programas:
    * Presto: "Comentario  Nº  Longitud  Anchura  Altura  Parcial"
    * Arquímedes: "Descripción  Uds  Largo  Ancho  Alto  Parcial"
    * TCQ: "Concepto  N  Long.  Anch.  Alt.  Subtotal"
    * Manual: "Detalle  Uds  Largo  Ancho  Alto  Parcial"
  - "A deducir", "Igual", "Idem", "Id." son descripciones válidas de medición
  - Puede haber fórmulas: "2*(3,50+4,20)" que ya están evaluadas en el parcial
  - Los subtotales por grupo ("Subtotal planta baja: 25,50") NO son mediciones → IGNORAR
  - Líneas "Suma anterior" o "A origen" NO son mediciones → IGNORAR

  FORMATOS COMUNES:
  - Con etiqueta: "Cocina    1    4,20    2,50         10,50"
  - Solo números (SIN descripción): "1    6,00    0,75    4,50"
    → description="", units=1, length=6.00, width=0.75, partial=4.50
  - Negativo: "A deducir hueco    -1    1,50    2,10    -3,15"
  - Sin dimensiones: "Planta baja    15,00    15,00"
  - Con fórmula: "Perímetro    1    2*(3,50+4,20)    0,50    7,70"
  - Idem: "Idem    1    17,10"
  - Solo parcial: "Según proyecto    125,00"
  IMPORTANTE: Si una línea de medición empieza con un número SIN texto antes,
  ese número es Uds (no descripción). description debe ser "" en ese caso.

RESUMEN = la línea con 3 números al final de cada partida:
  cantidad_total    precio_unitario    importe
  Donde importe ≈ cantidad × precio

═══════════════════════════════════════════════════════════════
REGLAS
═══════════════════════════════════════════════════════════════

1. DECIMALES: Texto español (75,30) → JSON con punto (75.3). Miles: 1.250,00 → 1250.0
2. UNIDADES normalizar: ud→UD, ml→ML, m2→M2, m3→M3, kg→KG, pa→PA, m→M
3. AMOUNT = quantity × price (recalcula siempre)
4. DESCRIPCIONES MULTILÍNEA: une en una sola cadena. NO incluyas mediciones en la descripción.
5. IGNORA: Totales de capítulo, Impuestos, Cabeceras de tabla, Costes indirectos
6. FECHAS — NUNCA son capítulos: "2 de febrero de 2026" → IGNORAR
7. Si no hay capítulos claros, crea: code:"01", name:"PARTIDAS GENERALES"
8. MEDICIONES: Extraer TODAS las líneas de medición de cada partida
9. Si la suma de parciales de mediciones no cuadra con quantity, ajusta

═══════════════════════════════════════════════════════════════
EJEMPLO 1: Partida con mediciones simples
═══════════════════════════════════════════════════════════════

TEXTO:
---
CAPÍTULO C01 MOVIMIENTO DE TIERRAS
02AVV00002    m3    EXCAVACIÓN EN VACIADO, DE TIERRAS
Excavación en vaciado de tierras de consistencia dura, realizada por medios mecánicos,
incluso carga y transporte a vertedero.
Retirada capa vegetal    1    310,73    0,40    124,29
Losa cimentación    1    123,70    0,30    37,11
Rampa acceso    1    15,00    3,50    0,80    42,00
A deducir arqueta    -1    0,60    0,40    -0,24
_______________________________________________________
203,16    0,36    73,14
---

JSON CORRECTO:
{"chapters":[{"code":"01","name":"MOVIMIENTO DE TIERRAS","items":[{"code":"02AVV00002","name":"EXCAVACIÓN EN VACIADO, DE TIERRAS","description":"Excavación en vaciado de tierras de consistencia dura, realizada por medios mecánicos, incluso carga y transporte a vertedero.","unit":"M3","quantity":203.16,"unit_price":0.36,"measurements":[{"description":"Retirada capa vegetal","units":1,"length":310.73,"width":0.4,"height":0,"partial":124.29},{"description":"Losa cimentación","units":1,"length":123.7,"width":0.3,"height":0,"partial":37.11},{"description":"Rampa acceso","units":1,"length":15.0,"width":3.5,"height":0.8,"partial":42.0},{"description":"A deducir arqueta","units":-1,"length":0.6,"width":0.4,"height":0,"partial":-0.24}]}]}]}

═══════════════════════════════════════════════════════════════
EJEMPLO 2: Partida con mediciones sin descripción y uds negativos
═══════════════════════════════════════════════════════════════

TEXTO:
---
E09NAL020    m2    SOLADO GRES PORCELÁNICO 40x40
Solado de baldosa de gres porcelánico de 40x40 cm, recibido con cemento cola,
sobre capa de arena de 2 cm de espesor, i/p.p. de rodapié y rejuntado.
Planta baja
Salón    1    6,50    4,20    27,30
Cocina    1    3,80    3,20    12,16
Pasillo    1    5,50    1,10    6,05
Planta alta
Dormitorio 1    1    4,50    3,80    17,10
Dormitorio 2    1    3,80    3,20    12,16
Baño    1    2,80    2,10    5,88
A deducir huecos puertas    -5    0,80    0,10    -0,40
_______________________________________________________
80,25    18,50    1.484,63
---

JSON CORRECTO:
{"chapters":[{"code":"01","name":"PARTIDAS GENERALES","items":[{"code":"E09NAL020","name":"SOLADO GRES PORCELÁNICO 40x40","description":"Solado de baldosa de gres porcelánico de 40x40 cm, recibido con cemento cola, sobre capa de arena de 2 cm de espesor, i/p.p. de rodapié y rejuntado.","unit":"M2","quantity":80.25,"unit_price":18.5,"measurements":[{"description":"Salón","units":1,"length":6.5,"width":4.2,"height":0,"partial":27.3},{"description":"Cocina","units":1,"length":3.8,"width":3.2,"height":0,"partial":12.16},{"description":"Pasillo","units":1,"length":5.5,"width":1.1,"height":0,"partial":6.05},{"description":"Dormitorio 1","units":1,"length":4.5,"width":3.8,"height":0,"partial":17.1},{"description":"Dormitorio 2","units":1,"length":3.8,"width":3.2,"height":0,"partial":12.16},{"description":"Baño","units":1,"length":2.8,"width":2.1,"height":0,"partial":5.88},{"description":"A deducir huecos puertas","units":-5,"length":0.8,"width":0.1,"height":0,"partial":-0.4}]}]}]}

═══════════════════════════════════════════════════════════════
EJEMPLO 3: Partida sin mediciones (solo totales directos)
═══════════════════════════════════════════════════════════════

TEXTO:
---
K21    ud    PUERTA INTERIOR LACADA
Puerta interior abatible de una hoja, ciega, lacada en blanco.
_______________________________________________________
5,00    285,00    1.425,00
---

JSON CORRECTO:
{"chapters":[{"code":"01","name":"PARTIDAS GENERALES","items":[{"code":"K21","name":"PUERTA INTERIOR LACADA","description":"Puerta interior abatible de una hoja, ciega, lacada en blanco.","unit":"UD","quantity":5.0,"unit_price":285.0,"measurements":[]}]}]}

═══════════════════════════════════════════════════════════════
EJEMPLO 4: Formato Presto — columnas Longitud/Anchura/Altura
═══════════════════════════════════════════════════════════════

TEXTO:
---
CAPÍTULO 02 CIMENTACIONES
ICS020    m3    HORMIGÓN EN ZAPATAS HA-25/B/20/IIa
Hormigón en masa HA-25/B/20/IIa, elaborado en central y vertido desde camión,
para formación de zapatas de cimentación, incluso p.p. de vibrado y curado.
Comentario    Nº    Longitud    Anchura    Altura    Parcial
Zapata Z1    3    1,20    1,20    0,50    2,16
Zapata Z2    2    1,50    1,50    0,60    2,70
Zapata Z3    1    2,00    2,00    0,80    3,20
Riostra R1    2    3,50    0,40    0,50    1,40
_______________________________________________________
9,46    85,30    806,94
---

JSON CORRECTO:
{"chapters":[{"code":"02","name":"CIMENTACIONES","items":[{"code":"ICS020","name":"HORMIGÓN EN ZAPATAS HA-25/B/20/IIa","description":"Hormigón en masa HA-25/B/20/IIa, elaborado en central y vertido desde camión, para formación de zapatas de cimentación, incluso p.p. de vibrado y curado.","unit":"M3","quantity":9.46,"unit_price":85.3,"measurements":[{"description":"Zapata Z1","units":3,"length":1.2,"width":1.2,"height":0.5,"partial":2.16},{"description":"Zapata Z2","units":2,"length":1.5,"width":1.5,"height":0.6,"partial":2.7},{"description":"Zapata Z3","units":1,"length":2.0,"width":2.0,"height":0.8,"partial":3.2},{"description":"Riostra R1","units":2,"length":3.5,"width":0.4,"height":0.5,"partial":1.4}]}]}]}

═══════════════════════════════════════════════════════════════
EJEMPLO 5: Mediciones con subtotales por grupo y deducciones
═══════════════════════════════════════════════════════════════

TEXTO:
---
04.03    m2    ENFOSCADO MORTERO M-5 VERTICAL
Enfoscado guarnecido maestreado, con mortero de cemento M-5, en paramentos
verticales, con acabado superficial rugoso, para servir de base a un posterior
revestimiento. Según NTE-RPE-7.
Uds.    Long.    Anch.    Alt.    Parcial
Planta baja
Fachada norte    1    12,50    3,00    37,50
Fachada sur    1    12,50    3,00    37,50
Fachada este    1    8,00    3,00    24,00
Fachada oeste    1    8,00    3,00    24,00
A deducir huecos
Ventanas    -6    1,20    1,10    -7,92
Puerta entrada    -1    2,10    2,20    -4,62
Puerta garaje    -1    3,00    2,50    -7,50
Planta primera
Fachada norte    1    12,50    2,80    35,00
Fachada sur    1    12,50    2,80    35,00
A deducir ventanas P1    -8    1,20    1,10    -10,56
_______________________________________________________
162,40    12,75    2.070,60
---

JSON CORRECTO:
{"chapters":[{"code":"01","name":"PARTIDAS GENERALES","items":[{"code":"04.03","name":"ENFOSCADO MORTERO M-5 VERTICAL","description":"Enfoscado guarnecido maestreado, con mortero de cemento M-5, en paramentos verticales, con acabado superficial rugoso, para servir de base a un posterior revestimiento. Según NTE-RPE-7.","unit":"M2","quantity":162.4,"unit_price":12.75,"measurements":[{"description":"Fachada norte","units":1,"length":12.5,"width":0,"height":3.0,"partial":37.5},{"description":"Fachada sur","units":1,"length":12.5,"width":0,"height":3.0,"partial":37.5},{"description":"Fachada este","units":1,"length":8.0,"width":0,"height":3.0,"partial":24.0},{"description":"Fachada oeste","units":1,"length":8.0,"width":0,"height":3.0,"partial":24.0},{"description":"Ventanas","units":-6,"length":1.2,"width":1.1,"height":0,"partial":-7.92},{"description":"Puerta entrada","units":-1,"length":2.1,"width":2.2,"height":0,"partial":-4.62},{"description":"Puerta garaje","units":-1,"length":3.0,"width":2.5,"height":0,"partial":-7.5},{"description":"Fachada norte","units":1,"length":12.5,"width":0,"height":2.8,"partial":35.0},{"description":"Fachada sur","units":1,"length":12.5,"width":0,"height":2.8,"partial":35.0},{"description":"A deducir ventanas P1","units":-8,"length":1.2,"width":1.1,"height":0,"partial":-10.56}]}]}]}

═══════════════════════════════════════════════════════════════
EJEMPLO 6: Mediciones con pocas columnas y formato TCQ
═══════════════════════════════════════════════════════════════

TEXTO:
---
EHN030    kg    ACERO CORRUGADO B-500-S
Acero corrugado B-500-S, cortado, doblado, armado y colocado en obra,
incluso p.p. de despuntes. Según EHE-08.
Concepto    N    Subtotal
Según despiece cimentación    835,00    835,00
Según despiece estructura P1    1.250,00    1.250,00
Según despiece estructura P2    1.180,00    1.180,00
Según despiece escalera    95,00    95,00
_______________________________________________________
3.360,00    1,15    3.864,00
---

JSON CORRECTO:
{"chapters":[{"code":"01","name":"PARTIDAS GENERALES","items":[{"code":"EHN030","name":"ACERO CORRUGADO B-500-S","description":"Acero corrugado B-500-S, cortado, doblado, armado y colocado en obra, incluso p.p. de despuntes. Según EHE-08.","unit":"KG","quantity":3360.0,"unit_price":1.15,"measurements":[{"description":"Según despiece cimentación","units":1,"length":0,"width":0,"height":0,"partial":835.0},{"description":"Según despiece estructura P1","units":1,"length":0,"width":0,"height":0,"partial":1250.0},{"description":"Según despiece estructura P2","units":1,"length":0,"width":0,"height":0,"partial":1180.0},{"description":"Según despiece escalera","units":1,"length":0,"width":0,"height":0,"partial":95.0}]}]}]}

═══════════════════════════════════════════════════════════════
EJEMPLO 7: Múltiples partidas en un capítulo, unas con y otras sin mediciones
═══════════════════════════════════════════════════════════════

TEXTO:
---
CAPÍTULO C03 ALBAÑILERÍA
03.01    m2    FÁBRICA LADRILLO 1/2 PIE
Fábrica de ladrillo cerámico hueco de 1/2 pie de espesor, para revestir,
tomada con mortero de cemento M-5, incluso replanteo y aplomado.
Tabiques interiores    1    45,80    2,70    123,66
Cerramiento patio    1    12,50    3,00    37,50
A deducir puertas    -7    0,80    2,10    -11,76
_______________________________________________________
149,40    22,50    3.361,50

03.02    ud    AYUDA ALBAÑILERÍA INSTALACIONES
Ayuda de albañilería a instalaciones, incluso apertura y tapado de rozas,
pasatubos, sellados y limpieza. Según medición.
_______________________________________________________
1,00    950,00    950,00

03.03    m    VIERTEAGUAS PIEDRA ARTIFICIAL
Vierteaguas de piedra artificial, recibido con mortero M-5,
incluso sellado de juntas con silicona neutra.
Ventanas fachada N    6    1,30    7,80
Ventanas fachada S    4    1,50    6,00
Ventana escalera    1    0,80    0,80
_______________________________________________________
14,60    18,90    275,94
---

JSON CORRECTO:
{"chapters":[{"code":"03","name":"ALBAÑILERÍA","items":[{"code":"03.01","name":"FÁBRICA LADRILLO 1/2 PIE","description":"Fábrica de ladrillo cerámico hueco de 1/2 pie de espesor, para revestir, tomada con mortero de cemento M-5, incluso replanteo y aplomado.","unit":"M2","quantity":149.4,"unit_price":22.5,"measurements":[{"description":"Tabiques interiores","units":1,"length":45.8,"width":0,"height":2.7,"partial":123.66},{"description":"Cerramiento patio","units":1,"length":12.5,"width":0,"height":3.0,"partial":37.5},{"description":"A deducir puertas","units":-7,"length":0.8,"width":2.1,"height":0,"partial":-11.76}]},{"code":"03.02","name":"AYUDA ALBAÑILERÍA INSTALACIONES","description":"Ayuda de albañilería a instalaciones, incluso apertura y tapado de rozas, pasatubos, sellados y limpieza. Según medición.","unit":"UD","quantity":1.0,"unit_price":950.0,"measurements":[]},{"code":"03.03","name":"VIERTEAGUAS PIEDRA ARTIFICIAL","description":"Vierteaguas de piedra artificial, recibido con mortero M-5, incluso sellado de juntas con silicona neutra.","unit":"M","quantity":14.6,"unit_price":18.9,"measurements":[{"description":"Ventanas fachada N","units":6,"length":1.3,"width":0,"height":0,"partial":7.8},{"description":"Ventanas fachada S","units":4,"length":1.5,"width":0,"height":0,"partial":6.0},{"description":"Ventana escalera","units":1,"length":0.8,"width":0,"height":0,"partial":0.8}]}]}]}

═══════════════════════════════════════════════════════════════
IMPORTANTE SOBRE name vs description vs measurements
═══════════════════════════════════════════════════════════════

- "name" = título breve (1ª línea de la partida, corto, máx 100 chars)
- "description" = concepto exhaustivo COMPLETO (todo el texto descriptivo detallado)
- "measurements" = array de líneas de medición con: description, units, length, width, height, partial
- El description suele contener el nombre pero más ampliado con detalles técnicos
- NUNCA dejar description vacío si hay texto descriptivo en la partida
- NUNCA incluir líneas de medición dentro del description
- Si una partida NO tiene mediciones, devolver measurements: []
- Las mediciones son las líneas con NÚMEROS que aparecen después de la descripción
- Las cabeceras como "Planta baja" o "Planta alta" sin números NO son mediciones → IGNORARLAS
- Líneas que dicen "A deducir" SÍ son mediciones (con uds negativo)

═══════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA — JSON PURO
═══════════════════════════════════════════════════════════════

Responde ÚNICAMENTE con JSON válido: {"chapters":[...]}.
Cada capítulo: code, name, items[].
Cada partida: code, name, description, unit, quantity, unit_price, measurements[].
Cada medición: description (string), units (number), length (number), width (number), height (number), partial (number).
Sin texto adicional.

═══════════════════════════════════════════════════════════════
TEXTO DEL PDF:
═══════════════════════════════════════════════════════════════
`

// ═══════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════

/** Parsear numero en formato español: "75,30" → 75.3, "1.250,00" → 1250.0 */
function parseSpanishNum(s) {
  if (!s || typeof s !== 'string') return 0
  s = s.trim().replace(/€/g, '').trim()
  if (!s) return 0
  if (s.includes(',')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  }
  const dotParts = s.split('.')
  if (dotParts.length === 2 && dotParts[1].length === 3) {
    return parseFloat(s.replace(/\./g, '')) || 0
  }
  return parseFloat(s) || 0
}

/** Normalizar unidad de medida */
function normalizeUnit(u) {
  if (!u) return 'UD'
  const map = {
    'u.': 'UD', 'u': 'UD', 'unid': 'UD', 'unid.': 'UD', 'unidad': 'UD', 'unidades': 'UD',
    'uds': 'UD', 'uds.': 'UD', 'ud': 'UD', 'ud.': 'UD', 'uni': 'UD', 'un': 'UD',
    'm.l.': 'ML', 'm.l': 'ML', 'ml': 'ML', 'ml.': 'ML', 'm.lin': 'ML', 'm lin': 'ML',
    'm.2': 'M2', 'm2': 'M2', 'm²': 'M2', 'm2.': 'M2', 'mc': 'M2',
    'm.3': 'M3', 'm3': 'M3', 'm³': 'M3', 'm3.': 'M3',
    'kg': 'KG', 'kgs': 'KG', 'kg.': 'KG', 'kgs.': 'KG', 'kilogramo': 'KG', 'kilogramos': 'KG',
    'p.a.': 'PA', 'p.a': 'PA', 'pa': 'PA', 'pa.': 'PA', 'part.': 'PA', 'partida': 'PA',
    'p.alz': 'PA', 'p.alzada': 'PA', 'alzada': 'PA',
    'h.': 'H', 'h': 'H', 'hora': 'H', 'horas': 'H', 'hr': 'H', 'hr.': 'H',
    'm': 'M', 'm.': 'M', 'metro': 'M', 'metros': 'M',
    'mes': 'MES', 'meses': 'MES',
    'litros': 'L', 'l': 'L', 'l.': 'L', 'litro': 'L', 'lt': 'L',
    't': 'T', 'tn': 'T', 'tn.': 'T', 'tonelada': 'T', 'toneladas': 'T',
    'dm3': 'DM3', 'dm³': 'DM3',
    'cm': 'CM', 'cm.': 'CM',
    'cm2': 'CM2', 'cm²': 'CM2',
    'km': 'KM', 'km.': 'KM',
    'jornada': 'JOR', 'jor': 'JOR', 'jor.': 'JOR', 'día': 'DIA', 'dia': 'DIA',
    'sem': 'SEM', 'semana': 'SEM',
    'gl': 'GL', 'global': 'GL',
  }
  return map[u.toLowerCase()] || u.toUpperCase()
}

// ═══════════════════════════════════════════════════════
// PATRONES DE DETECCIÓN
// ═══════════════════════════════════════════════════════

const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre'

// Unidades reconocidas (para regex de detección de partidas)
const UNIT_WORDS = 'm[23²³]|m\\.?[23]|m\\.?l\\.?|ud|Ud|UD|u\\.?|kg|kgs?\\.?|pa|p\\.?a\\.?|tn?\\.?|ml|Ml|ML|h\\.?|unid(?:ad(?:es)?)?|uds?\\.?|uni?\\.?|jor\\.?|sem\\.?|gl|dm[23³]|cm[2²]?|km\\.?|m\\b'

/** Normalizar código numérico con coma a punto: "2,1" → "2.1" (deja el resto igual). */
function normalizeCode(code) {
  return /^\d+,\d+$/.test(code) ? code.replace(',', '.') : code
}

/**
 * Detectar si una línea es inicio de partida: CODE unit TITLE
 * Retorna { code, unit, title } o null
 *
 * allowComma: permite códigos con coma decimal (2,1) — SOLO en el parser inline
 * (formato Excel). En el parser de separadores queda desactivado para no confundir
 * una línea de descripción que empiece por una medida ("1,5 m de tubería…").
 */
function detectPartidaStart(line, allowComma = false) {
  const codeChars = allowComma ? 'A-Za-z0-9.,\\-' : 'A-Za-z0-9.\\-'

  // Patrón principal: CÓDIGO  unidad  TÍTULO
  const re1 = new RegExp(
    `^([A-Z0-9][${codeChars}]{1,15})\\s+(${UNIT_WORDS})\\s+(.+)$`, 'i'
  )
  const m1 = line.match(re1)
  if (m1 && /[a-záéíóúñü]/i.test(m1[3])) {
    const code = m1[1]
    if (/^[A-Z0-9]/.test(code) && looksLikePartidaCode(code)) {
      return { code: normalizeCode(code), unit: normalizeUnit(m1[2]), title: m1[3].trim() }
    }
  }

  // Patrón secundario: CÓDIGO  TÍTULO_EN_MAYÚSCULAS (sin unidad explícita)
  const m2 = line.match(new RegExp(`^([A-Z0-9][${codeChars}]{1,15})\\s{2,}([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\\s,./\\-()#]{3,})$`))
  if (m2 && looksLikePartidaCode(m2[1])) {
    return { code: normalizeCode(m2[1]), unit: 'UD', title: m2[2].trim() }
  }

  // Patrón inline SIN unidad: "5.1 CITARA L/PERF…" — código numérico (N.N, N.N.N,
  // N,N) + título, un solo espacio, sin unidad reconocible. Solo en modo inline y
  // solo para códigos puramente numéricos punteados (no "40x15x20 cm" de descripción).
  if (allowComma) {
    const m3 = line.match(/^(\d{1,3}(?:[.,]\d{1,3}){1,2})\s+([A-Za-zÁÉÍÓÚÑÜ].+)$/)
    if (m3 && /[a-záéíóúñü]/i.test(m3[2]) && !checkInlineSummary(line)) {
      return { code: normalizeCode(m3[1]), unit: 'UD', title: m3[2].trim() }
    }
  }

  return null
}

/** Determinar si un string parece código de partida vs palabra española */
function looksLikePartidaCode(s) {
  if (s.length < 2 || s.length > 16) return false
  if (!/^[A-Z0-9]/.test(s)) return false
  if (/[a-zA-Z]/.test(s) && /\d/.test(s)) return true
  if (/^\d+[.,]\d+/.test(s)) return true
  if (/^[A-Z]{2,10}$/.test(s)) {
    const blacklist = ['LA', 'EL', 'DE', 'EN', 'UN', 'SE', 'NO', 'ES', 'POR', 'CON',
      'SIN', 'MAS', 'DOS', 'SUS', 'LOS', 'LAS', 'DEL', 'UNA', 'QUE', 'SU', 'AL']
    return !blacklist.includes(s)
  }
  return false
}

/**
 * Detectar capítulo o subcapítulo.
 */
function detectChapter(line) {
  const m1 = line.match(/^(?:CAP[ÍI]TULO|CAP\.?)\s+C?(\d{1,3}(?:\.\d{1,3})?)\s+(.+)$/i)
  if (m1 && m1[2].trim().length >= 3) {
    return { code: m1[1], name: m1[2].trim(), type: 'chapter' }
  }

  const m2 = line.match(/^SUBCAP[ÍI]TULO\s+C?(\d{1,3}(?:\.\d{1,3})*)\s+(.+)$/i)
  if (m2 && m2[2].trim().length >= 3) {
    return { code: m2[1], name: m2[2].trim(), type: 'subcapitulo' }
  }

  const m3 = line.match(/^(\d{1,3})[\s:.\-]+([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s,./\-()]{3,})$/)
  if (m3) {
    const name = m3[2].trim()
    const dateRe = new RegExp(`\\b(${MONTHS})\\b`, 'i')
    if (dateRe.test(name) || /\d{4}/.test(name)) return null
    const alpha = name.replace(/[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ]/g, '')
    if (!alpha) return null
    const upper = alpha.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, '').length
    if (upper / alpha.length >= 0.6) {
      return { code: m3[1], name, type: 'chapter' }
    }
  }

  return null
}

/** Comprobar si es línea TOTAL */
function isTotalLine(line) {
  return /^(total\s+(cap[íi]tulo|subcap[íi]tulo|presupuesto|general|parcial)|suma\s+y\s+sigue|suma\s+anterior|pase\s+a\s+)/i.test(line) ||
    /^(base\s+imponible|gastos\s+generales|beneficio\s+industrial)/i.test(line) ||
    /^(presupuesto\s+de\s+ejecuci[óo]n|total\b)/i.test(line) ||
    /^(i\.?v\.?a\.?\s|impuesto|costes?\s+indirectos|coeficiente\s+k)/i.test(line) ||
    /^(importe\s+total|importe\s+de\s+ejecuci[óo]n|ejecuci[óo]n\s+material)/i.test(line) ||
    /^(asciende\s+|son\s+|el\s+presente\s+presupuesto)/i.test(line) ||
    /^(a\s+origen|en\s+letra)/i.test(line)
}

/** Comprobar si es separador de guiones bajos para partidas (30-75 chars) */
function isPartidaSeparator(line) {
  return /^_{30,75}$/.test(line.trim())
}

/** Comprobar si es ruido de página */
function isPageNoise(line) {
  const t = line.trim()
  if (/^---\s*PAGE\s+\d+\s*---$/.test(t)) return true
  if (/^PRESUPUESTO\s+(Y\s+MEDICIONES|DE\s+EJECUCI|GENERAL|PARCIAL)/i.test(t)) return true
  if (/^C[ÓO]DIGO\s+RESUMEN/i.test(t)) return true
  if (/^C[ÓO]DIGO\s+(CANTIDAD|DESCRIPCI[ÓO]N|CONCEPTO|NAT)/i.test(t)) return true
  if (/^_{76,}$/.test(t)) return true
  if (/^_{5,29}$/.test(t)) return true
  const dateRe = new RegExp(`^\\s*\\d{1,2}\\s+de\\s+(${MONTHS})\\s+de\\s+\\d{2,4}\\s*$`, 'i')
  if (dateRe.test(t)) return true
  if (/^\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}$/.test(t)) return true
  if (/^P[áa]gina\s*\d+$/i.test(t)) return true
  if (/^(p[áa]g\.?\s*\d|hoja\s+\d)/i.test(t)) return true
  if (/^\d{1,3}$/.test(t)) return true

  // Software-specific headers/footers
  if (/^(PRESTO|Arqu[íi]medes|TCQ|Cype|Menfis|Cost-It|BIM\s)/i.test(t)) return true
  if (/^(Generado|Impreso|Exportado|Creado)\s+(con|por|desde|el)\s/i.test(t)) return true
  if (/^(MEDICIONES|CUADRO\s+DE\s+PRECIOS|PLIEGO\s+DE\s+CONDICIONES)\s*$/i.test(t)) return true
  if (/^(Presupuesto\s+de\s+referencia|Proyecto\s*:?\s*$)/i.test(t)) return true
  if (/^(Cliente|Promotor|Propiedad|Arquitecto|Aparejador|Dirección|Situación)\s*:\s*$/i.test(t)) return true
  if (/^(N[ºo]\s*de\s*presupuesto|Referencia|Expediente|Obra)\s*:/i.test(t)) return true
  if (/^RESUMEN\s+(DE\s+)?PRESUPUESTO/i.test(t)) return true
  if (/^(CUADRO|LISTADO)\s+DE\s+(PRECIOS|MATERIALES|MANO\s+DE\s+OBRA)/i.test(t)) return true
  if (/^(SON\s+|ASCIENDE\s+)/i.test(t)) return true
  if (/^(Suma\s+y\s+sigue|Suma\s+anterior|Pase\s+a)/i.test(t)) return true
  if (/^Nº\s+Orden\s/i.test(t)) return true

  return false
}

/**
 * Comprobar summary: 3 números donde importe ≈ qty × price
 * Retorna { qty, price, amount } o null
 */
function checkSummaryLine(line) {
  const match = line.match(/^\s*(\d[\d.,]*)\s+(\d[\d.,]*[.,]\d+)\s+(\d[\d.,]*[.,]\d+)\s*€?\s*$/)
  if (!match) return null

  const qty = parseSpanishNum(match[1])
  const price = parseSpanishNum(match[2])
  const amount = parseSpanishNum(match[3])
  if (qty <= 0 || price <= 0 || amount <= 0) return null

  const expected = qty * price
  const diff = Math.abs(amount - expected)
  const tolerance = Math.max(0.10, expected * 0.05)

  if (diff <= tolerance) return { qty, price, amount }
  if (amount > 0 && diff / amount < 0.02) return { qty, price, amount }
  if (qty > 0 && price > 0 && amount > 5 && diff / amount < 0.10) return { qty, price, amount }

  return null
}

/**
 * Comprobar summary INLINE (formato Excel): los 3 últimos números de la línea son
 * cantidad · precio · importe, aunque haya texto delante y símbolos € entre medias.
 *   "Losa de cimentación… 18 185,00 € 3.330,00 €"  → qty 18, price 185, amount 3330
 *   "1 850,00 € 850,00 €"                          → qty 1,  price 850, amount 850
 * Se exige importe ≈ cantidad × precio (precio > 0) para no confundir con texto.
 * Retorna { qty, price, amount, textBefore } o null.
 */
function checkInlineSummary(line) {
  const cleaned = line.trim().replace(/€/g, ' ')
  const matches = [...cleaned.matchAll(/-?\d[\d.,]*/g)]
  if (matches.length < 3) return null

  const last3 = matches.slice(-3)
  // Precio e importe DEBEN venir con 2 decimales (formato dinero: 185,00 / 1.331,00).
  // Así una línea de descripción con enteros sueltos (…árido 15 mm… → 15·1=15) NO se
  // confunde con un total. La cantidad (1er nº) puede ser entera o decimal.
  const money2dec = s => /[.,]\d{2}$/.test(s)
  if (!money2dec(last3[1][0]) || !money2dec(last3[2][0])) return null

  const qty = parseSpanishNum(last3[0][0])
  const price = parseSpanishNum(last3[1][0])
  const amount = parseSpanishNum(last3[2][0])
  if (qty <= 0 || price <= 0 || amount <= 0) return null

  const expected = qty * price
  const diff = Math.abs(amount - expected)
  const tolerance = Math.max(0.5, expected * 0.03)
  if (diff > tolerance) return null

  const textBefore = cleaned.substring(0, last3[0].index).replace(/\s+/g, ' ').trim()
  return { qty, price, amount, textBefore }
}

/**
 * Comprobar si una línea es medición (desglose de cantidades).
 * Mediciones: terminan con números, tienen etiquetas cortas.
 *
 * Formatos soportados:
 *   "Cocina    1    4,20    2,50    10,50"          — etiqueta + 4 nums
 *   "1    6,00    0,75    4,50"                     — solo nums (4)
 *   "-1    1,50    2,10    -3,15"                   — uds negativo
 *   "Planta baja    15,00    15,00"                 — etiqueta + 2 nums
 *   "Según proyecto    835,00    835,00"            — texto + 2 nums
 *   "Idem    1    17,10"                            — idem + 2 nums
 *   "2*(3,50+4,20)    1    15,40    15,40"          — fórmula en descripción
 *   "1    2x(3,50+4,20)    15,40"                   — fórmula en dimensión
 *   "A deducir huecos    -6    1,20    1,10    -7,92" — deducción
 *   "125,00"                                        — solo parcial (raro pero válido)
 *   "Perímetro    1    2*(3,50+4,20)    0,50    7,70" — fórmula con resultado
 */
function isMeasurementLine(line) {
  // Debe terminar con número (entero o decimal) — requisito básico
  if (!/\-?\d+[.,]?\d*\s*$/.test(line)) return false

  // Filtrar líneas que parecen subtotales de grupo
  if (/^\s*(subtotal|total\s+parcial|suma\s+parcial|suma\s+y\s+sigue|suma\s+anterior|a\s+origen)/i.test(line)) return false

  // Solo números: "1  6,00  0,75  4,50" o "1  1,00"
  if (/^\s*-?\d{1,6}[.,]?\d*(\s+\-?\d+[.,]?\d+){1,5}\s*$/.test(line)) {
    const nums = line.trim().split(/\s+/)
    if (nums.length === 1) return true  // solo parcial
    if (nums.length === 2) return true  // uds + parcial
    if (nums.length >= 4) return true   // uds + largo + ancho + parcial (mín)
    return false // 3 nums ambiguo → podría ser summary
  }

  // Etiqueta + números: "Cocina  1  4,20  2,50  10,50"
  const textPart = line.replace(/(\s+\-?\d+[.,]?\d*)+\s*$/, '').trim()
  const numPart = line.substring(textPart.length)
  const numsInNumPart = (numPart.match(/\-?\d+[.,]?\d*/g) || []).filter(n => n.length > 0)

  if (numsInNumPart.length >= 2 && textPart.length <= 60) {
    const realWords = textPart.split(/\s+/).filter(w => /[a-záéíóúñü]/i.test(w))
    if (realWords.length <= 6) return true
  }

  // Solo 1 número al final con etiqueta (ej: "Según proyecto    125,00")
  if (numsInNumPart.length === 1 && textPart.length > 0 && textPart.length <= 50) {
    const realWords = textPart.split(/\s+/).filter(w => /[a-záéíóúñü]/i.test(w))
    if (realWords.length <= 4) return true
  }

  // Líneas con fórmulas inline: contiene paréntesis con operaciones
  if (/\d+\s*[\*x×]\s*\([\d.,+\-\s]+\)/.test(line) && /\d+[.,]\d+\s*$/.test(line)) {
    return true
  }

  // Líneas "idem" / "id." / "igual" con números
  if (/^\s*(idem|id\.|igual(\s+anterior)?)\s/i.test(line) && /\d+[.,]\d+\s*$/.test(line)) {
    return true
  }

  return false
}

/**
 * Parsear una línea de medición y extraer sus campos estructurados.
 *
 * Formatos soportados:
 *   "Cocina    1    4,20    2,50         10,50"        → desc + uds + largo + ancho + parcial
 *   "1    6,00    0,75    4,50"                        → uds + largo + ancho + parcial
 *   "Planta baja    15,00    15,00"                    → desc + uds(o valor) + parcial
 *   "-1    1,50    2,10    -3,15"                      → uds negativo
 *   "Según proyecto    125,00"                         → desc + solo parcial
 *   "Cocina    1    4,20    2,50    3,00    31,50"     → desc + uds + largo + ancho + alto + parcial
 *   "1    2*(3,50+4,20)    0,50    7,70"               → fórmula (se ignora, se toma parcial)
 *   "Idem    1    17,10"                               → idem con nums
 *   "125,00"                                           → solo parcial
 *
 * Estrategia de parsing numérico:
 *   Si hay N números, el ÚLTIMO siempre es el parcial.
 *   Luego intentamos verificar si Parcial ≈ Uds × Largo × Ancho × Alto
 *   para asignar correctamente los campos.
 */
function parseMeasurementLine(line) {
  const trimmed = line.trim()

  // Limpiar fórmulas inline: reemplazar "2*(3,50+4,20)" por su resultado evaluado
  // No evaluamos, pero las marcamos para no confundir con números separados
  let cleanLine = trimmed

  // Separar parte textual de parte numérica
  let textPart = cleanLine.replace(/(\s+\-?\d+[.,]?\d*)+\s*$/, '').trim()
  let numPart = cleanLine.substring(textPart.length).trim()

  // FIX: Si textPart parece ser un número (solo dígitos, coma, punto, signo menos),
  // inclúyelo como parte de los números, no como descripción.
  // Esto evita que líneas como "1  4,20  2,50  10,50" traten el "1" como descripción.
  if (textPart && /^-?\d+[.,]?\d*$/.test(textPart)) {
    numPart = textPart + ' ' + numPart
    textPart = ''
  }

  // Extraer todos los números (ignorando fórmulas complejas)
  const numStrings = (numPart.match(/\-?\d+[.,]?\d*/g) || []).filter(n => n.length > 0)
  const nums = numStrings.map(parseSpanishNum)

  if (nums.length === 0) return null

  const description = textPart || ''

  // El último número siempre es el parcial
  const partial = nums[nums.length - 1]

  let units = 0
  let length = 0
  let width = 0
  let height = 0

  if (nums.length === 1) {
    // Solo parcial → units=1, parcial es el total
    units = 1
    length = 0
  } else if (nums.length === 2) {
    // Dos posibilidades:
    //   a) uds + parcial (ej: "6  7,80" → 6 uds, parcial 7,80)
    //   b) valor + valor repetido (ej: "835,00  835,00" → parcial duplicado, uds=1)
    if (Math.abs(nums[0] - nums[1]) < 0.01) {
      // Mismo número repetido → es valor + parcial, uds=1
      units = 1
      length = 0
    } else if (Math.abs(nums[0]) <= 100 && nums[0] === Math.round(nums[0]) && nums[0] !== 0) {
      // Primer número parece entero pequeño → es uds
      units = nums[0]
      length = 0
    } else {
      // Primer número es grande o decimal → podría ser valor directo
      units = nums[0]
      length = 0
    }
  } else if (nums.length === 3) {
    // uds + largo + parcial  (más común)
    // O: uds + parcial_check + parcial — verificar multiplicación
    units = nums[0]
    length = nums[1]

    // Verificar: si uds * largo ≈ parcial → asignación correcta
    const check = nums[0] * nums[1]
    if (Math.abs(check - partial) > Math.max(0.1, Math.abs(partial) * 0.05)) {
      // No cuadra → quizás son 3 valores independientes, mantener asignación default
    }
  } else if (nums.length === 4) {
    // uds + largo + ancho + parcial
    units = nums[0]
    length = nums[1]
    width = nums[2]
  } else if (nums.length >= 5) {
    // uds + largo + ancho + alto + parcial
    units = nums[0]
    length = nums[1]
    width = nums[2]
    height = nums[3]
  }

  return {
    description,
    units,
    length,
    width,
    height,
    partial,
  }
}

/**
 * Comprobar si una línea es cabecera de tabla de mediciones (no es medición real).
 *
 * Cabeceras posibles según programa de presupuestos:
 *   Presto:     "Comentario  Nº   Longitud  Anchura  Altura  Parcial"
 *   Arquímedes: "Descripción Uds  Largo     Ancho    Alto    Parcial"
 *   TCQ:        "Concepto    N    Long.     Anch.    Alt.    Subtotal"
 *   Cype:       "Detalle     Uds. Longitud  Anchura  Altura  Total parcial"
 *   Manual:     "            Uds  Largo     Ancho    Alto    Parcial"
 *   Genérico:   "            Nº   L         A        H       Parcial"
 */
function isMeasurementHeader(line) {
  const t = line.trim().toLowerCase()

  // Sinónimos de cada columna
  const DESC_WORDS = 'descripci[óo]n|comentario|concepto|detalle|observaci[óo]n|texto|partida'
  const UDS_WORDS = 'uds\\.?|unidades|n[ºo°]?\\.?|num\\.?|cantidad|ud\\.?|repeticiones|veces|n[ºo]\\.?\\s*veces'
  const LARGO_WORDS = 'largo|longitud|long\\.?|dimens(?:i[óo]n)?\\s*1|l\\b'
  const ANCHO_WORDS = 'ancho|anchura|anch\\.?|dimens(?:i[óo]n)?\\s*2|latitud|a\\b'
  const ALTO_WORDS = 'alto|altura|alt\\.?|dimens(?:i[óo]n)?\\s*3|profundidad|h\\b'
  const PARCIAL_WORDS = 'parcial|subtotal|total\\s*parcial|importe\\s*parcial|resultado|total'

  // Patrón 1: Al menos 2 columnas dimensionales reconocidas en la línea
  const dimensionWords = [LARGO_WORDS, ANCHO_WORDS, ALTO_WORDS]
  let dimensionMatches = 0
  for (const dw of dimensionWords) {
    if (new RegExp(`\\b(${dw})\\b`, 'i').test(t)) dimensionMatches++
  }

  // Si tiene al menos 2 palabras de dimensión → es cabecera
  if (dimensionMatches >= 2) return true

  // Patrón 2: Tiene una palabra de uds + una dimensión + parcial
  const hasUds = new RegExp(`\\b(${UDS_WORDS})\\b`, 'i').test(t)
  const hasParcial = new RegExp(`\\b(${PARCIAL_WORDS})\\b`, 'i').test(t)
  if (hasUds && dimensionMatches >= 1 && hasParcial) return true

  // Patrón 3: Tiene descripción/comentario + uds + dimensión
  const hasDesc = new RegExp(`\\b(${DESC_WORDS})\\b`, 'i').test(t)
  if (hasDesc && hasUds && dimensionMatches >= 1) return true

  // Patrón 4: Formato compacto solo con abreviaturas: "Uds  L  A  H  Parcial"
  if (hasUds && hasParcial && dimensionMatches >= 1) return true

  // Patrón 5: Línea que contiene "parcial" o "subtotal" con uds y/o largo
  if (hasParcial && (hasUds || dimensionMatches >= 1)) return true

  return false
}

/**
 * Comprobar si una línea es etiqueta de grupo de mediciones.
 * Estas son líneas de texto puro sin números → se usan como prefijo de descripción.
 *
 * Patrones reconocidos:
 *   "Planta baja", "Planta alta", "Planta sótano", "Planta cubierta"
 *   "Zona A", "Zona común", "Zona húmeda"
 *   "Fachada norte", "Fachada principal", "Fachada posterior"
 *   "Edificio A", "Bloque 1", "Portal 2"
 *   "Interior", "Exterior"
 *   "1.- Planta baja" (numerados)
 *   "A deducir", "A deducir huecos"
 *   "Según proyecto", "Según planos"
 *   "Igual anterior", "Idem", "Id."
 */
function isMeasurementGroupLabel(line) {
  const t = line.trim()
  // Demasiado largo → no es etiqueta
  if (t.length > 50) return false
  // Si termina con número decimal → probablemente es medición
  if (/\d+[.,]\d+\s*$/.test(t)) return false

  // Patrones explícitos de grupo
  if (/^(planta|piso|nivel|s[óo]tano)\s/i.test(t)) return true
  if (/^(zona|sector|bloque|m[óo]dulo|portal|edificio|ala)\s/i.test(t)) return true
  if (/^(fachada|medianera|cerramiento|cubierta|terraza|balc[óo]n)\s/i.test(t)) return true
  if (/^(interior|exterior|perimetral|central)e?s?\s*$/i.test(t)) return true
  if (/^(cocina|ba[ñn]o|sal[óo]n|dormitorio|pasillo|vest[íi]bulo|hall|aseo|comedor)\s*$/i.test(t)) return true
  if (/^(a deducir|descontar|menos|restar)/i.test(t)) return true
  if (/^(seg[úu]n\s+(proyecto|planos|medici[óo]n|despiece))/i.test(t)) return true
  if (/^(igual(\s+anterior)?|idem|id\.)\s*$/i.test(t)) return true
  if (/^(subtotal|total\s+parcial)\s/i.test(t)) return true

  // Numerados: "1.- Planta baja", "A) Fachada"
  if (/^\d{1,2}[\.\-\)]\s*[A-Za-záéíóúñü]/i.test(t) && !/\d+[.,]\d+/.test(t)) return true
  if (/^[A-Z]\)\s*[A-Za-záéíóúñü]/i.test(t)) return true

  // Solo texto (letras + espacios + guiones), mínimo 3 chars
  if (/^[A-Za-záéíóúñüÁÉÍÓÚÑÜ\s\-.,()]+$/.test(t) && t.length >= 3) {
    // Excluir posibles descripciones demasiado largas (>3 palabras significativas)
    const words = t.split(/\s+/).filter(w => w.length > 2)
    if (words.length <= 4) return true
  }

  return false
}

// ═══════════════════════════════════════════════════════
// PRE-LIMPIEZA DE TEXTO PDF
// ═══════════════════════════════════════════════════════

export function cleanPdfText(raw) {
  const cleanedLines = []
  let removedCount = 0

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (isPageNoise(trimmed)) { removedCount++; continue }
    if (isTotalLine(trimmed)) { removedCount++; continue }

    cleanedLines.push(trimmed)
  }

  const logs = []
  if (removedCount > 0) {
    logs.push(`Pre-limpieza: eliminadas ${removedCount} líneas de ruido`)
  }

  return { text: cleanedLines.join('\n'), logs }
}

// ═══════════════════════════════════════════════════════
// PARSER ALGORÍTMICO v7.0 — CON EXTRACCIÓN DE MEDICIONES
// ═══════════════════════════════════════════════════════

/**
 * Parser principal.
 *
 * Estructura de cada partida en el texto:
 *   [CÓDIGO    unidad    TÍTULO]        ← detectPartidaStart()
 *   [Descripción multilínea]            ← texto con letras
 *   [Cabecera mediciones]               ← opcional: "Uds  Largo  Ancho  Alto  Parcial"
 *   [Mediciones]                        ← números con etiquetas cortas
 *   _______________________________________________________    ← separador
 *   [qty    price    amount]            ← summary (checkSummaryLine)
 */
export function parseBudgetAlgorithmic(text) {
  const logs = ['📋 Parser algorítmico v8.0 — detección por separadores + mediciones']

  const lines = text.split('\n').map(l => l.trim()).filter(l => l)

  // FASE 1: Clasificar cada línea
  const classified = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const ch = detectChapter(line)
    if (ch) {
      classified.push({ index: i, type: 'chapter', data: ch })
      continue
    }

    if (isPartidaSeparator(line)) {
      classified.push({ index: i, type: 'separator' })
      continue
    }

    if (isTotalLine(line)) {
      classified.push({ index: i, type: 'skip' })
      continue
    }

    const ps = detectPartidaStart(line)
    if (ps) {
      classified.push({ index: i, type: 'partida_start', data: ps })
      continue
    }

    classified.push({ index: i, type: 'body' })
  }

  const partidaStarts = classified.filter(c => c.type === 'partida_start').length
  const chapterCount = classified.filter(c => c.type === 'chapter').length
  const separatorCount = classified.filter(c => c.type === 'separator').length

  logs.push(`Fase 1: ${partidaStarts} partidas, ${chapterCount} capítulos, ${separatorCount} separadores`)

  // FASE 2: Construir bloques de partida
  const chapters = []
  let currentChapter = null
  let currentPartida = null

  function closePartida() {
    if (!currentPartida) return
    const item = buildPartidaItem(currentPartida, logs)
    if (item) {
      if (!currentChapter) {
        currentChapter = { code: '01', name: 'PARTIDAS GENERALES', items: [] }
      }
      currentChapter.items.push(item)
    }
    currentPartida = null
  }

  let expectSummary = false

  for (let ci = 0; ci < classified.length; ci++) {
    const entry = classified[ci]

    if (entry.type === 'chapter') {
      closePartida()
      if (currentChapter) chapters.push(currentChapter)
      currentChapter = {
        code: entry.data.code,
        name: entry.data.name,
        items: [],
      }
      expectSummary = false
      continue
    }

    if (entry.type === 'partida_start') {
      closePartida()
      currentPartida = {
        code: entry.data.code,
        unit: entry.data.unit,
        title: entry.data.title,
        bodyLines: [],
        summary: null,
      }
      expectSummary = false
      continue
    }

    if (entry.type === 'separator') {
      expectSummary = true
      continue
    }

    if (entry.type === 'skip') {
      continue
    }

    if (entry.type === 'body') {
      const line = lines[entry.index]

      if (expectSummary) {
        expectSummary = false
        const sum = checkSummaryLine(line)
        if (sum && currentPartida && !currentPartida.summary) {
          currentPartida.summary = sum
          closePartida()
          continue
        }
      }

      if (currentPartida) {
        currentPartida.bodyLines.push(line)
      }
      continue
    }
  }

  closePartida()
  if (currentChapter) chapters.push(currentChapter)

  const totalItems = chapters.reduce((s, ch) => s + ch.items.length, 0)
  const totalMeasurements = chapters.reduce((s, ch) =>
    s + ch.items.reduce((si, item) => si + (item.measurements?.length || 0), 0), 0)
  logs.push(`✅ Fase 2: ${chapters.length} capítulos, ${totalItems} partidas, ${totalMeasurements} mediciones`)

  return { chapters, logs }
}

/**
 * Parser INLINE (formato Excel / hoja de cálculo).
 *
 * Estructura de cada partida en este formato:
 *   [CÓDIGO  unidad  TÍTULO]                              ← detectPartidaStart(_, true)
 *   [Descripción multilínea]                              ← texto con letras
 *   [Ubicación…  cantidad  precio€  importe€]             ← checkInlineSummary() cierra la partida
 *
 * No hay líneas separadoras "____" y los totales van al FINAL de una línea de texto
 * (no en línea aparte). Se usa solo cuando el parser de separadores no extrae nada.
 */
export function parseBudgetInlineSummary(text) {
  const logs = ['📐 Parser inline v1.0 — totales en línea (formato Excel, sin separadores)']

  const lines = text.split('\n').map(l => l.trim()).filter(l => l)
  const chapters = []
  let currentChapter = null
  let currentPartida = null

  function closePartida() {
    if (currentPartida && currentPartida.summary) {
      const item = buildPartidaItem(currentPartida, logs)
      if (item) {
        if (!currentChapter) {
          currentChapter = { code: '01', name: 'PARTIDAS GENERALES', items: [] }
        }
        currentChapter.items.push(item)
      }
    }
    currentPartida = null
  }

  for (const line of lines) {
    // Capítulo
    const ch = detectChapter(line)
    if (ch) {
      closePartida()
      if (currentChapter) chapters.push(currentChapter)
      currentChapter = { code: ch.code, name: ch.name, items: [] }
      continue
    }

    // "total capitulo …" y demás totales cierran la partida abierta y se ignoran
    if (isTotalLine(line)) {
      closePartida()
      continue
    }

    // Inicio de partida (con soporte de códigos con coma: 2,1)
    const ps = detectPartidaStart(line, true)
    if (ps) {
      closePartida()
      currentPartida = { code: ps.code, unit: ps.unit, title: ps.title, bodyLines: [], summary: null }
      continue
    }

    // Summary inline: cierra la partida en curso
    const inl = currentPartida ? checkInlineSummary(line) : null
    if (inl) {
      if (inl.textBefore) currentPartida.bodyLines.push(inl.textBefore)
      currentPartida.summary = { qty: inl.qty, price: inl.price, amount: inl.amount }
      closePartida()
      continue
    }

    // Resto → cuerpo de la partida (descripción)
    if (currentPartida) currentPartida.bodyLines.push(line)
  }

  closePartida()
  if (currentChapter) chapters.push(currentChapter)

  const totalItems = chapters.reduce((s, ch) => s + ch.items.length, 0)
  logs.push(`✅ Parser inline: ${chapters.length} capítulos, ${totalItems} partidas`)

  return { chapters, logs }
}

/**
 * Construir un item de partida a partir de su bloque de datos.
 * Ahora extrae TAMBIÉN las mediciones.
 */
function buildPartidaItem(partida, logs) {
  const { code, unit, title, bodyLines, summary } = partida

  if (!summary) {
    logs.push(`⚠️ ${code}: sin summary — ignorada`)
    return null
  }

  // Separar líneas del body en: descripción vs mediciones
  const descParts = []
  const measurements = []
  let currentGroupLabel = '' // Para etiquetas de grupo como "Planta baja"
  let inMeasurementZone = false // Una vez encontramos la primera medición, las siguientes son mediciones

  for (const line of bodyLines) {
    // Saltar cabeceras de medición
    if (isMeasurementHeader(line)) {
      inMeasurementZone = true
      continue
    }

    // Saltar summaries intermedios (no confundir con mediciones)
    if (checkSummaryLine(line)) continue

    // Saltar subtotales de grupo: "Subtotal planta baja    25,50"
    if (/^\s*(subtotal|total\s+parcial|suma\s+parcial)\s/i.test(line)) continue

    // Saltar líneas "Suma y sigue" / "Suma anterior" / "A origen"
    if (/^\s*(suma\s+(y\s+sigue|anterior)|a\s+origen|pase\s+a\s+)/i.test(line)) continue

    // Comprobar si es línea de medición
    if (isMeasurementLine(line)) {
      inMeasurementZone = true
      const parsed = parseMeasurementLine(line)
      if (parsed) {
        // Si no tiene descripción propia, usar la etiqueta del grupo
        if (!parsed.description && currentGroupLabel) {
          parsed.description = currentGroupLabel
        }
        measurements.push(parsed)
      }
      continue
    }

    // Si estamos en zona de mediciones, comprobar si es etiqueta de grupo
    if (inMeasurementZone && isMeasurementGroupLabel(line)) {
      currentGroupLabel = line.trim()
      continue
    }

    // Si es "A deducir" / "Igual" / "Idem" sin números, es intro de grupo
    if (/^(A deducir|a deducir|Igual\s|Idem|Id\.)/i.test(line) && !/\d+[.,]\d+/.test(line)) {
      currentGroupLabel = line.trim()
      inMeasurementZone = true
      continue
    }

    // Si es "Según proyecto/planos/medición" sin números → etiqueta de grupo
    if (/^(seg[úu]n\s+(proyecto|planos|medici[óo]n|despiece|c[áa]lculo))/i.test(line) && !/\d+[.,]\d+/.test(line)) {
      currentGroupLabel = line.trim()
      inMeasurementZone = true
      continue
    }

    // Si ya estamos en zona de mediciones, las líneas de texto cortas son etiquetas de grupo
    if (inMeasurementZone && line.length <= 50 && /[a-záéíóúñü]/i.test(line) && !/\d+[.,]\d+/.test(line)) {
      currentGroupLabel = line.trim()
      continue
    }

    // Línea con texto real → descripción (solo si no estamos en zona de mediciones)
    if (!inMeasurementZone && /[a-záéíóúñü]{2,}/i.test(line)) {
      let cleanLine = line
      // Limpiar si hay números sueltos al final que parecen ruido
      const inlineMatch = cleanLine.match(/^(.{10,}?)\s{3,}\d{1,3}\s+[\d.,]+/)
      if (inlineMatch) {
        cleanLine = inlineMatch[1].trim()
      }
      descParts.push(cleanLine)
    }
  }

  // Construir descripción completa (concepto exhaustivo)
  let description = descParts.join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .replace(/-\s+/g, '-')
    .trim()

  // Nombre corto (primera frase)
  const name = title
    .replace(/\s+/g, ' ')
    .substring(0, 100)
    .trim()

  if (!name) return null

  // Si la descripción es casi igual al nombre o vacía
  if (!description) {
    description = null
  } else {
    const descNorm = description.toLowerCase().replace(/[^a-záéíóúñü0-9]/g, '')
    const nameNorm = name.toLowerCase().replace(/[^a-záéíóúñü0-9]/g, '')
    if (descNorm === nameNorm || descNorm.length < 5) {
      description = null
    } else if (!description.toLowerCase().startsWith(name.toLowerCase().substring(0, 20))) {
      description = name + '. ' + description
    }
  }

  // Validar mediciones: suma de parciales vs quantity
  if (measurements.length > 0) {
    const sumPartials = measurements.reduce((s, m) => s + m.partial, 0)
    const diff = Math.abs(sumPartials - summary.qty)
    const tolerance = Math.max(0.5, summary.qty * 0.05)
    if (diff > tolerance) {
      logs.push(`⚠️ ${code}: suma mediciones (${sumPartials.toFixed(2)}) ≠ cantidad (${summary.qty}) — diferencia ${diff.toFixed(2)}`)
    }
  }

  return {
    code,
    name,
    description,
    unit: unit || 'UD',
    quantity: summary.qty,
    unit_price: summary.price,
    measurements,
  }
}

// ═══════════════════════════════════════════════════════
// VALIDACIÓN Y LIMPIEZA
// ═══════════════════════════════════════════════════════

function validateAndClean(chapters) {
  const errors = []
  const warnings = []

  for (const ch of chapters) {
    // Auto-generate chapter code if missing
    if (!ch.code) {
      ch.code = String(chapters.indexOf(ch) + 1).padStart(2, '0')
    }

    // Auto-generate item codes if missing
    let autoIdx = 0
    for (const item of ch.items) {
      if (!item.code) {
        autoIdx++
        item.code = `${ch.code}.${String(autoIdx).padStart(2, '0')}`
      }
    }

    ch.items = ch.items.filter(item => {
      let valid = true

      if (!item.quantity || item.quantity <= 0) {
        errors.push(`Cap ${ch.code}: cantidad inválida en '${item.code}' (${item.quantity})`)
        valid = false
      }
      if (!item.unit_price || item.unit_price <= 0) {
        errors.push(`Cap ${ch.code}: precio inválido en '${item.code}' (${item.unit_price})`)
        valid = false
      }

      return valid
    })

    for (const item of ch.items) {
      item.unit = normalizeUnit(item.unit)
      if (!item.name) {
        item.name = (item.description || '').substring(0, 100).trim()
      }
      // Ensure measurements array exists
      if (!item.measurements) item.measurements = []
    }
  }

  const filtered = chapters.filter(ch => ch.items.length > 0)
  return { chapters: filtered, errors, warnings }
}

// ═══════════════════════════════════════════════════════
// PARSER PRINCIPAL CON FALLBACK
// ═══════════════════════════════════════════════════════

/**
 * Parsea texto de presupuesto con estrategia híbrida:
 * 1. Limpieza de ruido de página
 * 2. Parser algorítmico v8.0 (separadores + códigos + mediciones)
 * 3. Si extrae < 30% de lo esperado → IA con prompt experto
 */
export async function parseBudgetFromText(rawText, useAI = true, organizationId = null, userId = null) {
  const allLogs = []

  // Paso 1: Limpiar texto
  const { text: cleanedText, logs: cleanLogs } = cleanPdfText(rawText)
  allLogs.push(...cleanLogs)

  const origLines = rawText.split('\n').filter(l => l.trim()).length
  const cleanLines = cleanedText.split('\n').filter(l => l.trim()).length
  allLogs.push(`Texto: ${origLines} líneas → ${cleanLines} tras limpieza`)

  // Paso 2: Parser algorítmico
  const algoResult = parseBudgetAlgorithmic(cleanedText)
  allLogs.push(...algoResult.logs)

  const algoItems = algoResult.chapters.reduce((s, ch) => s + ch.items.length, 0)

  if (algoItems > 0) {
    const { chapters, errors, warnings } = validateAndClean(algoResult.chapters)
    if (errors.length) allLogs.push(`❌ ${errors.length} errores: ${errors.slice(0, 3).join('; ')}`)

    const finalItems = chapters.reduce((s, ch) => s + ch.items.length, 0)
    const finalMeasurements = chapters.reduce((s, ch) =>
      s + ch.items.reduce((si, item) => si + (item.measurements?.length || 0), 0), 0)
    allLogs.push(`✅ Resultado: ${chapters.length} capítulos, ${finalItems} partidas, ${finalMeasurements} mediciones (algorítmico)`)

    const separatorEstimate = (cleanedText.match(/_{30,75}/g) || []).length
    const coverageOk = separatorEstimate === 0 || finalItems >= separatorEstimate * 0.3

    if (coverageOk || !useAI) {
      return { chapters, logs: allLogs }
    }

    allLogs.push(`⚠️ Solo ${finalItems}/${separatorEstimate} partidas (< 30%). Intentando IA...`)
  }

  // Paso 2b: Parser INLINE (formato Excel: totales al final de línea, sin
  // separadores ___). Determinista y rápido — se intenta ANTES de la IA local.
  if (algoItems === 0) {
    const inlineResult = parseBudgetInlineSummary(cleanedText)
    const { chapters: inlineChapters, errors: inlineErrors } = validateAndClean(inlineResult.chapters)
    const inlineItems = inlineChapters.reduce((s, ch) => s + ch.items.length, 0)
    allLogs.push(...inlineResult.logs)
    if (inlineErrors.length) allLogs.push(`ℹ️ ${inlineErrors.length} partidas descartadas (cantidad/precio 0)`)
    if (inlineItems > 0) {
      allLogs.push(`✅ Resultado: ${inlineChapters.length} capítulos, ${inlineItems} partidas (inline)`)
      return { chapters: inlineChapters, logs: allLogs }
    }
  }

  // Paso 3: Fallback IA
  if (!useAI) {
    if (algoItems > 0) {
      const { chapters } = validateAndClean(algoResult.chapters)
      return { chapters, logs: allLogs }
    }
    allLogs.push('⚠️ Sin resultados y la IA está desactivada.')
    return { chapters: [], logs: allLogs }
  }

  allLogs.push('🤖 Intentando extracción con IA...')

  try {
    const fullPrompt = PDF_EXTRACTION_PROMPT + cleanedText.substring(0, 15000)
    const aiResult = await callAI(fullPrompt, { maxTokens: 8192, organizationId, userId })

    let chapters = []
    if (aiResult.chapters && Array.isArray(aiResult.chapters)) {
      chapters = aiResult.chapters
    } else if (Array.isArray(aiResult)) {
      chapters = aiResult
    }

    for (const ch of chapters) {
      if (!ch.items) ch.items = ch.partidas || []
      for (const item of ch.items) {
        if (!item.unit_price && item.price) item.unit_price = item.price
        if (!item.name && item.description) {
          item.name = item.description.substring(0, 100).trim()
        }
        if (!item.unit) item.unit = 'UD'
        item.quantity = item.quantity || 0
        item.unit_price = item.unit_price || 0
        // Ensure measurements array from AI — normalize all possible Spanish/English field names
        if (!item.measurements) item.measurements = item.mediciones || []
        if (Array.isArray(item.measurements)) {
          item.measurements = item.measurements.map(m => ({
            description: m.description || m.descripcion || m.comentario || m.concepto || m.detalle || '',
            units: m.units ?? m.uds ?? m.unidades ?? m.n ?? m.num ?? m.cantidad ?? m.repeticiones ?? 1,
            length: m.length ?? m.largo ?? m.longitud ?? m.long ?? m.l ?? 0,
            width: m.width ?? m.ancho ?? m.anchura ?? m.anch ?? m.a ?? 0,
            height: m.height ?? m.alto ?? m.altura ?? m.alt ?? m.h ?? m.profundidad ?? 0,
            partial: m.partial ?? m.parcial ?? m.subtotal ?? m.total_parcial ?? m.resultado ?? 0,
          }))
        }
      }
    }

    const { chapters: validatedChapters } = validateAndClean(chapters)
    const aiItems = validatedChapters.reduce((s, ch) => s + ch.items.length, 0)

    if (aiItems > 0) {
      const aiMeasurements = validatedChapters.reduce((s, ch) =>
        s + ch.items.reduce((si, item) => si + (item.measurements?.length || 0), 0), 0)
      allLogs.push(`✅ IA extrajo ${aiItems} partidas, ${aiMeasurements} mediciones en ${validatedChapters.length} capítulos`)

      if (algoItems > 0) {
        const { chapters: algoChapters } = validateAndClean(algoResult.chapters)
        const combinedItems = algoChapters.reduce((s, ch) => s + ch.items.length, 0)
        if (combinedItems > aiItems) {
          allLogs.push(`↩️ Manteniendo resultado algorítmico (${combinedItems} > ${aiItems} items)`)
          return { chapters: algoChapters, logs: allLogs }
        }
      }

      return { chapters: validatedChapters, logs: allLogs }
    } else {
      allLogs.push('⚠️ IA no pudo extraer partidas válidas')
    }
  } catch (err) {
    allLogs.push(`⚠️ IA falló: ${err.message}`)
  }

  if (algoItems > 0) {
    const { chapters } = validateAndClean(algoResult.chapters)
    return { chapters, logs: allLogs }
  }

  return { chapters: [], logs: allLogs }
}

/**
 * Parse budget from a scanned PDF using LOCAL OCR (100% local, sin nube).
 *   PDF -> imágenes (pdftoppm) -> texto (tesseract, español) -> parseBudgetFromText
 * Reutiliza todo el pipeline (algorítmico + LLM local). Mantiene el nombre para
 * no cambiar la ruta que la llama. (Antes: Vision OCR de Gemini/Anthropic.)
 */
export async function parseBudgetWithVision(pdfBase64, organizationId, userId) {
  const logs = []
  const { ocrPdfToText, ocrAvailable } = await import('./local-ocr.js')

  if (!(await ocrAvailable())) {
    logs.push('⚠️ OCR local no disponible (falta tesseract/poppler en el entorno).')
    return { chapters: [], logs }
  }

  logs.push('🔍 OCR local (Tesseract, español)...')
  let ocrText = ''
  try {
    ocrText = await ocrPdfToText(pdfBase64, { lang: 'spa' })
  } catch (err) {
    logs.push(`⚠️ OCR falló: ${err.message}`)
    return { chapters: [], logs }
  }

  const chars = ocrText.trim().length
  logs.push(`OCR: ${chars} caracteres extraídos`)
  if (chars === 0) {
    logs.push('⚠️ El OCR no extrajo texto legible del PDF.')
    return { chapters: [], logs }
  }

  // Reusar el pipeline de texto (algorítmico + LLM local de refuerzo).
  const result = await parseBudgetFromText(ocrText, true, organizationId, userId)
  return { chapters: result.chapters, logs: [...logs, ...result.logs] }
}

export default parseBudgetFromText
