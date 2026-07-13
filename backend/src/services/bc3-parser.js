/**
 * Parser de archivos BC3 (FIEBDC-3) para presupuestos de construccion.
 *
 * Formato FIEBDC-3:
 *   - Los registros comienzan con ~TIPO|campo1|campo2|...|
 *   - Subcampos separados por \
 *   - Codigos terminados en ## = raiz, # = capitulo, otro = partida/material/mano de obra
 *
 * Uso:
 *   import { parseBC3 } from './bc3-parser.js';
 *   const resultado = parseBC3(buffer);
 */

// ---------------------------------------------------------------------------
// Decodificacion del buffer segun la codificacion detectada en ~V
// ---------------------------------------------------------------------------

/**
 * Detecta la codificacion a partir del registro ~V y decodifica el buffer.
 * Por defecto usa latin1 si no se encuentra informacion de codificacion.
 */
function decodeBuffer(buffer) {
  // Primera pasada rapida en latin1 para leer ~V
  const raw = buffer.toString('latin1');

  // Buscar registro ~V para detectar codificacion
  const vMatch = raw.match(/~V\|([^|]*)\|/);
  let encoding = 'latin1';

  if (vMatch) {
    const vField = vMatch[1].toUpperCase();
    if (vField.includes('ANSI') || vField.includes('1252')) {
      encoding = 'latin1'; // cp1252 es compatible con latin1 para la mayoria de caracteres
    } else if (vField.includes('850')) {
      encoding = 'latin1'; // Aproximacion; cp850 comparte rango ASCII
    }
    // Si no se reconoce, dejamos latin1 por defecto
  }

  // Node no soporta cp1252/cp850 nativamente; latin1 cubre la mayoria de casos
  return buffer.toString(encoding);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Convierte texto numerico a float, aceptando coma o punto como separador decimal. */
function parseNum(str) {
  if (!str || typeof str !== 'string') return 0;
  const cleaned = str.trim().replace(',', '.');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/** Elimina caracteres de control y espacios alrededor de un texto. */
function clean(str) {
  if (!str) return '';
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '').trim();
}

/** Elimina los # finales de un codigo. */
function stripHash(code) {
  return code.replace(/#+$/, '');
}

/**
 * Resuelve una clave en un Map tolerando el sufijo # (capitulo) o ## (raiz).
 * Presto exporta ~D con codigos sin # aunque los ~C los declaren con #.
 * Devuelve la clave real que existe en el mapa, o null si no hay coincidencia.
 */
function resolveKey(map, code) {
  if (!code) return null;
  if (map.has(code)) return code;
  if (map.has(code + '#')) return code + '#';
  if (map.has(code + '##')) return code + '##';
  const stripped = stripHash(code);
  if (stripped !== code && map.has(stripped)) return stripped;
  return null;
}

/** Formatea un indice numerico a dos digitos: 1 -> "01". */
function pad2(n) {
  return String(n).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Extraccion de registros
// ---------------------------------------------------------------------------

/**
 * Separa el texto en registros individuales.
 * Cada registro empieza con ~ y su primer caracter indica el tipo.
 */
function splitRecords(text) {
  // Dividir por ~ y descartar el primer fragmento (antes del primer ~)
  const parts = text.split('~');
  const records = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part || part.length < 2) continue;

    const type = part[0].toUpperCase();
    // Quitar el tipo y el primer |
    const rest = part.substring(1);
    // Separar campos por |
    const fields = rest.split('|').map(f => clean(f));
    records.push({ type, fields });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Construccion del mapa de conceptos (~C)
// ---------------------------------------------------------------------------

/**
 * Procesa registros ~C y construye un mapa de conceptos.
 * Formato: ~C|CODIGO|UNIDAD|RESUMEN|PRECIO1\PRECIO2...|FECHA|TIPO|
 *
 * Tipo de concepto segun el codigo:
 *   - Termina en ## -> raiz del presupuesto
 *   - Termina en #  -> capitulo
 *   - Otro           -> partida / material / mano de obra
 */
function buildConceptMap(records) {
  const concepts = new Map();

  for (const rec of records) {
    if (rec.type !== 'C') continue;

    const code = clean(rec.fields[1] || '');
    if (!code) continue;

    const unit = clean(rec.fields[2] || '');
    const summary = clean(rec.fields[3] || '');

    // El campo de precios puede tener varios valores separados por \
    const priceField = rec.fields[4] || '';
    const prices = priceField.split('\\');
    const price = parseNum(prices[0]);

    // Determinar tipo segun sufijo del codigo
    let conceptType = 'partida';
    if (code.endsWith('##')) {
      conceptType = 'root';
    } else if (code.endsWith('#')) {
      conceptType = 'chapter';
    }

    concepts.set(code, {
      code,
      cleanCode: stripHash(code),
      unit,
      summary,
      price,
      conceptType,
    });
  }

  return concepts;
}

// ---------------------------------------------------------------------------
// Construccion de la jerarquia (~D)
// ---------------------------------------------------------------------------

/**
 * Procesa registros ~D para construir relaciones padre-hijo.
 * Formato: ~D|PADRE|HIJO1\factor\rendimiento\HIJO2\factor\rendimiento\...|
 *
 * El rendimiento (yield) en la relacion capitulo->partida representa la medicion total.
 */
function buildHierarchy(records) {
  const hierarchy = new Map(); // padre -> [{childCode, factor, yield}]

  for (const rec of records) {
    if (rec.type !== 'D') continue;

    const parentCode = clean(rec.fields[1] || '');
    if (!parentCode) continue;

    const childrenField = rec.fields[2] || '';
    const parts = childrenField.split('\\');

    const children = [];
    // Los hijos vienen en grupos de 3: codigo, factor, rendimiento
    for (let i = 0; i < parts.length; i += 3) {
      const childCode = clean(parts[i] || '');
      if (!childCode) continue;

      const factor = parseNum(parts[i + 1]);
      const qty = parseNum(parts[i + 2]);

      children.push({
        childCode,
        factor: factor || 1,
        yield: qty,
      });
    }

    if (children.length > 0) {
      // Puede haber multiples registros ~D para el mismo padre; concatenar
      const existing = hierarchy.get(parentCode) || [];
      hierarchy.set(parentCode, existing.concat(children));
    }
  }

  return hierarchy;
}

// ---------------------------------------------------------------------------
// Textos descriptivos (~T)
// ---------------------------------------------------------------------------

/**
 * Procesa registros ~T y devuelve un mapa codigo -> descripcion.
 * Formato: ~T|CODIGO|TEXTO_DESCRIPTIVO|
 */
function buildTextMap(records) {
  const texts = new Map();

  for (const rec of records) {
    if (rec.type !== 'T') continue;

    const code = clean(rec.fields[1] || '');
    const text = clean(rec.fields[2] || '');
    if (code && text) {
      texts.set(code, text);
    }
  }

  return texts;
}

// ---------------------------------------------------------------------------
// Mediciones (~M y ~N)
// ---------------------------------------------------------------------------

/**
 * Procesa registros ~M y ~N para extraer lineas de medicion.
 * Formato: ~M|PADRE\HIJO|RUTA|TOTAL|TIPO\COMENTARIO\UNIDADES\LONGITUD\ANCHURA\ALTURA\...|ETIQUETA|
 *
 * Las lineas de medicion vienen en grupos de 6 subcampos dentro del campo 4:
 *   TIPO, COMENTARIO, UNIDADES, LONGITUD, ANCHURA, ALTURA
 */
function buildMeasurementMap(records) {
  const measurements = new Map(); // "PADRE\HIJO" -> [{description, units, length, width, height, partial}]

  for (const rec of records) {
    if (rec.type !== 'M' && rec.type !== 'N') continue;

    const keyField = rec.fields[1] || '';
    const key = clean(keyField);
    if (!key) continue;

    // Campo de lineas de medicion (indice 4 en el registro)
    const measField = rec.fields[4] || '';
    const parts = measField.split('\\');

    const lines = [];
    // Grupos de 6 subcampos: tipo, comentario, uds, longitud, anchura, altura
    for (let i = 0; i < parts.length; i += 6) {
      // const lineType = clean(parts[i] || '');  // No lo usamos directamente
      const comment = clean(parts[i + 1] || '');
      const units = parseNum(parts[i + 2]);
      const length = parseNum(parts[i + 3]);
      const width = parseNum(parts[i + 4]);
      const height = parseNum(parts[i + 5]);

      // Calcular parcial: uds * longitud * anchura * altura
      // Si alguna dimension es 0, se ignora en el producto
      // Si uds=0 pero hay dimensiones, interpretar como 1 unidad
      const dims = [length, width, height].filter(d => d !== 0);
      let partial;
      if (units !== 0) {
        partial = dims.length > 0 ? units * dims.reduce((a, b) => a * b, 1) : units;
      } else {
        partial = dims.length > 0 ? dims.reduce((a, b) => a * b, 1) : 0;
      }

      // Agregar si hay algun dato util (numerico o descriptivo)
      if (comment || units || length || width || height) {
        lines.push({
          description: comment,
          units: units || 0,
          length: length || 0,
          width: width || 0,
          height: height || 0,
          partial: Math.round(partial * 1000) / 1000, // Redondear a 3 decimales
        });
      }
    }

    if (lines.length > 0) {
      const existing = measurements.get(key) || [];
      measurements.set(key, existing.concat(lines));
    }
  }

  return measurements;
}

// ---------------------------------------------------------------------------
// Ensamblado del resultado final
// ---------------------------------------------------------------------------

/**
 * Recorre la jerarquia desde la raiz y construye la estructura de salida
 * con capitulos, partidas y mediciones.
 */
function assembleResult(concepts, hierarchy, texts, measurements) {
  // 1. Encontrar la raiz (codigo que termina en ##)
  let rootCode = null;
  for (const [code, concept] of concepts) {
    if (concept.conceptType === 'root') {
      rootCode = code;
      break;
    }
  }

  // Si no hay raiz explicita, buscar en la jerarquia el primer padre con hijos tipo capitulo
  if (!rootCode) {
    for (const [parentCode] of hierarchy) {
      if (parentCode.endsWith('##')) {
        rootCode = parentCode;
        break;
      }
    }
  }

  if (!rootCode) {
    // Sin raiz: devolver estructura vacia
    return { chapters: [] };
  }

  // 2. Obtener capitulos (hijos directos de la raiz)
  const rootChildren = hierarchy.get(rootCode) || [];
  const chapters = [];
  let chapterIdx = 0;

  for (const chapterRef of rootChildren) {
    // Resolver concepto del capitulo tolerando sufijos # (Presto exporta sin #)
    const chapterConceptKey = resolveKey(concepts, chapterRef.childCode);
    const chapterConcept = chapterConceptKey ? concepts.get(chapterConceptKey) : null;
    if (!chapterConcept) continue;

    chapterIdx++;
    const chapterNum = pad2(chapterIdx);

    // Nombre del capitulo: resumen del concepto o texto descriptivo
    const chapterName =
      chapterConcept.summary ||
      texts.get(chapterConceptKey) ||
      texts.get(chapterRef.childCode) ||
      `Capitulo ${chapterNum}`;

    // 3. Obtener partidas del capitulo (jerarquia tambien tolera sufijo #)
    const chapterHierKey = resolveKey(hierarchy, chapterRef.childCode);
    const chapterChildren = chapterHierKey ? hierarchy.get(chapterHierKey) : [];
    const items = [];
    let itemIdx = 0;

    for (const itemRef of chapterChildren) {
      const itemConceptKey = resolveKey(concepts, itemRef.childCode);
      const itemConcept = itemConceptKey ? concepts.get(itemConceptKey) : null;
      if (!itemConcept) continue;

      itemIdx++;
      const itemNum = `${chapterNum}.${pad2(itemIdx)}`;

      // Descripcion larga desde ~T, o el resumen del concepto
      const description =
        texts.get(itemConceptKey) ||
        texts.get(itemRef.childCode) ||
        itemConcept.summary ||
        '';

      // La cantidad viene del yield en la relacion capitulo->partida
      const quantity = itemRef.yield || 0;

      // Precio unitario del concepto
      const unitPrice = itemConcept.price || 0;

      // Buscar mediciones asociadas (clave: "PADRE\HIJO"), tolerando variantes con/sin #
      const rawMeasurements =
        measurements.get(`${chapterRef.childCode}\\${itemRef.childCode}`) ||
        measurements.get(`${chapterConceptKey}\\${itemConceptKey}`) ||
        measurements.get(`${stripHash(chapterRef.childCode)}\\${stripHash(itemRef.childCode)}`) ||
        [];

      const roundedQty = Math.round(quantity * 1000) / 1000;

      // Si no hay lineas de medicion pero si hay cantidad, crear medicion sintetica
      // para que la importacion refleje la cantidad correctamente
      const itemMeasurements = rawMeasurements.length > 0 ? rawMeasurements : (roundedQty > 0 ? [{
        description: (itemConcept.summary || description).substring(0, 80),
        units: roundedQty,
        length: 0,
        width: 0,
        height: 0,
        partial: roundedQty,
      }] : []);

      items.push({
        code: itemNum,
        name: itemConcept.summary || description,
        description,
        unit: itemConcept.unit || '',
        quantity: roundedQty,
        unit_price: Math.round(unitPrice * 100) / 100,
        measurements: itemMeasurements,
      });
    }

    chapters.push({
      code: chapterNum,
      name: chapterName,
      items,
    });
  }

  return { chapters };
}

// ---------------------------------------------------------------------------
// Funcion principal de parseo
// ---------------------------------------------------------------------------

/**
 * Parsea un archivo BC3 (FIEBDC-3) desde un Buffer y devuelve la estructura
 * de presupuesto con capitulos, partidas y mediciones.
 *
 * @param {Buffer} buffer - Contenido binario del archivo .bc3
 * @returns {{ chapters: Array }} Presupuesto parseado
 */
export function parseBC3(buffer) {
  // 1. Decodificar buffer con la codificacion detectada
  const text = decodeBuffer(buffer);

  // 2. Separar en registros individuales
  const records = splitRecords(text);

  // 3. Construir mapas intermedios
  const concepts = buildConceptMap(records);
  const hierarchy = buildHierarchy(records);
  const texts = buildTextMap(records);
  const measurementMap = buildMeasurementMap(records);

  // 4. Ensamblar resultado final recorriendo la jerarquia
  const result = assembleResult(concepts, hierarchy, texts, measurementMap);

  return result;
}
