/**
 * DXF/DWG Parsing Service
 * Extracts structured data from DXF files: text, dimensions, blocks, layers
 * Generates SVG preview for browser viewing
 */

import DxfParser from 'dxf-parser'

/**
 * Parse a DXF file buffer and extract all useful entities
 * @param {Buffer|string} dxfContent - DXF file content
 * @returns {{ entities: object, layers: object[], svg: string, boundingBox: object }}
 */
export function parseDxf(dxfContent) {
  const parser = new DxfParser()
  const dxf = parser.parseSync(typeof dxfContent === 'string' ? dxfContent : dxfContent.toString('utf-8'))

  if (!dxf) throw new Error('No se pudo parsear el archivo DXF')

  const layers = extractLayers(dxf)
  const entities = extractEntities(dxf)
  const boundingBox = calculateBoundingBox(dxf)
  const svg = generateSvg(dxf, boundingBox)

  return { entities, layers, svg, boundingBox }
}

/**
 * Extract layer information
 */
function extractLayers(dxf) {
  if (!dxf.tables?.layer?.layers) return []
  return Object.entries(dxf.tables.layer.layers).map(([name, layer]) => ({
    name,
    color: layer.color ?? 7,
    visible: !layer.frozen && layer.visible !== false,
    frozen: !!layer.frozen,
    locked: !!layer.locked,
  }))
}

/**
 * Extract structured entities grouped by type
 */
function extractEntities(dxf) {
  const texts = []
  const dimensions = []
  const blocks = []
  const lines = []

  // Process main entities
  if (dxf.entities) {
    for (const entity of dxf.entities) {
      processEntity(entity, texts, dimensions, blocks, lines)
    }
  }

  // Process block definitions (for INSERT references)
  const blockDefs = {}
  if (dxf.blocks) {
    for (const [name, block] of Object.entries(dxf.blocks)) {
      blockDefs[name] = {
        name,
        entities: (block.entities || []).length,
        // Extract text entities inside blocks too
        texts: [],
      }
      if (block.entities) {
        for (const entity of block.entities) {
          if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
            blockDefs[name].texts.push({
              content: cleanText(entity.text || entity.string || ''),
              x: entity.startPoint?.x ?? entity.position?.x ?? 0,
              y: entity.startPoint?.y ?? entity.position?.y ?? 0,
              height: entity.textHeight || entity.height || 2.5,
            })
          }
        }
      }
    }
  }

  // Resolve block references: expand INSERT entities with block text
  for (const block of blocks) {
    const def = blockDefs[block.blockName]
    if (def && def.texts.length > 0) {
      block.blockTexts = def.texts.map(t => ({
        ...t,
        // Transform text position by INSERT position and scale
        x: t.x * (block.scaleX || 1) + block.x,
        y: t.y * (block.scaleY || 1) + block.y,
      }))
    }
  }

  return { texts, dimensions, blocks, lines, blockDefinitions: blockDefs }
}

/**
 * Process a single entity
 */
function processEntity(entity, texts, dimensions, blocks, lines) {
  switch (entity.type) {
    case 'TEXT':
      texts.push({
        content: cleanText(entity.text || entity.string || ''),
        x: entity.startPoint?.x ?? entity.position?.x ?? 0,
        y: entity.startPoint?.y ?? entity.position?.y ?? 0,
        height: entity.textHeight || entity.height || 2.5,
        rotation: entity.rotation || 0,
        layer: entity.layer || '0',
      })
      break

    case 'MTEXT':
      texts.push({
        content: cleanMtext(entity.text || entity.string || ''),
        x: entity.position?.x ?? 0,
        y: entity.position?.y ?? 0,
        height: entity.height || entity.textHeight || 2.5,
        rotation: entity.rotation || 0,
        layer: entity.layer || '0',
        multiline: true,
      })
      break

    case 'DIMENSION':
      dimensions.push({
        type: entity.dimensionType || 'linear',
        text: entity.text || '',
        value: entity.measurement ?? null,
        x1: entity.anchorPoint?.x ?? 0,
        y1: entity.anchorPoint?.y ?? 0,
        x2: entity.middleOfText?.x ?? 0,
        y2: entity.middleOfText?.y ?? 0,
        layer: entity.layer || '0',
      })
      break

    case 'INSERT':
      blocks.push({
        blockName: entity.name || '',
        x: entity.position?.x ?? 0,
        y: entity.position?.y ?? 0,
        scaleX: entity.xScale ?? 1,
        scaleY: entity.yScale ?? 1,
        rotation: entity.rotation || 0,
        layer: entity.layer || '0',
        attributes: (entity.attributes || []).map(a => ({
          tag: a.tag || '',
          value: a.text || a.value || '',
        })),
      })
      break

    case 'LINE':
      lines.push({
        x1: entity.vertices?.[0]?.x ?? entity.startPoint?.x ?? 0,
        y1: entity.vertices?.[0]?.y ?? entity.startPoint?.y ?? 0,
        x2: entity.vertices?.[1]?.x ?? entity.endPoint?.x ?? 0,
        y2: entity.vertices?.[1]?.y ?? entity.endPoint?.y ?? 0,
        layer: entity.layer || '0',
      })
      break

    case 'LWPOLYLINE':
    case 'POLYLINE':
      if (entity.vertices && entity.vertices.length >= 2) {
        for (let i = 0; i < entity.vertices.length - 1; i++) {
          lines.push({
            x1: entity.vertices[i].x,
            y1: entity.vertices[i].y,
            x2: entity.vertices[i + 1].x,
            y2: entity.vertices[i + 1].y,
            layer: entity.layer || '0',
          })
        }
        // Close polyline if needed
        if (entity.shape || entity.closed) {
          const last = entity.vertices[entity.vertices.length - 1]
          const first = entity.vertices[0]
          lines.push({
            x1: last.x, y1: last.y,
            x2: first.x, y2: first.y,
            layer: entity.layer || '0',
          })
        }
      }
      break

    case 'CIRCLE':
    case 'ARC':
    case 'ELLIPSE':
    case 'SPLINE':
      // Store as geometry for SVG but not for text extraction
      break
  }
}

/**
 * Clean TEXT entity content
 */
function cleanText(text) {
  return text.replace(/\\[A-Za-z][^;]*;/g, '') // Remove formatting codes like \A1;
    .replace(/\{\\[^}]+}/g, '') // Remove {\\fArial;...}
    .replace(/[{}]/g, '')
    .trim()
}

/**
 * Clean MTEXT formatting codes
 */
function cleanMtext(text) {
  return text
    .replace(/\\P/g, '\n') // Paragraph break
    .replace(/\\[A-Za-z][^;]*;/g, '') // Formatting codes
    .replace(/\{\\[^}]+}/g, '') // Font/style blocks
    .replace(/[{}]/g, '')
    .replace(/%%d/gi, '°') // Degree symbol
    .replace(/%%c/gi, 'Ø') // Diameter symbol
    .replace(/%%p/gi, '±') // Plus/minus
    .replace(/%%u/g, '') // Underline toggle (remove)
    .trim()
}

/**
 * Calculate bounding box from all entities
 */
function calculateBoundingBox(dxf) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  // Check header variables first
  if (dxf.header?.$EXTMIN) {
    minX = dxf.header.$EXTMIN.x
    minY = dxf.header.$EXTMIN.y
  }
  if (dxf.header?.$EXTMAX) {
    maxX = dxf.header.$EXTMAX.x
    maxY = dxf.header.$EXTMAX.y
  }

  // If header extents are valid, use them
  if (minX < maxX && minY < maxY) {
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
  }

  // Otherwise calculate from entities
  if (dxf.entities) {
    for (const e of dxf.entities) {
      const points = getEntityPoints(e)
      for (const p of points) {
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
        if (p.x > maxX) maxX = p.x
        if (p.y > maxY) maxY = p.y
      }
    }
  }

  if (minX === Infinity) {
    return { minX: 0, minY: 0, maxX: 1000, maxY: 1000, width: 1000, height: 1000 }
  }

  // Add 5% margin
  const w = maxX - minX
  const h = maxY - minY
  const margin = Math.max(w, h) * 0.05
  return {
    minX: minX - margin, minY: minY - margin,
    maxX: maxX + margin, maxY: maxY + margin,
    width: w + 2 * margin, height: h + 2 * margin,
  }
}

function getEntityPoints(entity) {
  const points = []
  if (entity.startPoint) points.push(entity.startPoint)
  if (entity.endPoint) points.push(entity.endPoint)
  if (entity.position) points.push(entity.position)
  if (entity.center) points.push(entity.center)
  if (entity.vertices) points.push(...entity.vertices)
  return points.filter(p => p && typeof p.x === 'number' && typeof p.y === 'number')
}

/**
 * Generate SVG from DXF entities
 */
function generateSvg(dxf, bbox) {
  const width = bbox.width
  const height = bbox.height

  // AutoCAD colors (ACI index → hex)
  const aciColors = {
    1: '#FF0000', 2: '#FFFF00', 3: '#00FF00', 4: '#00FFFF',
    5: '#0000FF', 6: '#FF00FF', 7: '#000000', 8: '#808080',
    9: '#C0C0C0',
  }

  function getColor(entity) {
    const c = entity.color ?? entity.colorIndex ?? 7
    return aciColors[c] || '#000000'
  }

  const svgParts = []
  // No fixed width/height — viewBox only so it scales as true vector at any zoom
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bbox.minX} ${-bbox.maxY} ${width} ${height}">`)
  svgParts.push(`<style>text { font-family: Arial, sans-serif; }</style>`)

  // Group by layer
  const layerEntities = {}
  if (dxf.entities) {
    for (const e of dxf.entities) {
      const layer = e.layer || '0'
      if (!layerEntities[layer]) layerEntities[layer] = []
      layerEntities[layer].push(e)
    }
  }

  for (const [layerName, entities] of Object.entries(layerEntities)) {
    svgParts.push(`<g data-layer="${layerName}" class="dxf-layer">`)

    for (const e of entities) {
      const color = getColor(e)

      switch (e.type) {
        case 'LINE':
          svgParts.push(`<line x1="${e.startPoint?.x ?? e.vertices?.[0]?.x}" y1="${-(e.startPoint?.y ?? e.vertices?.[0]?.y)}" x2="${e.endPoint?.x ?? e.vertices?.[1]?.x}" y2="${-(e.endPoint?.y ?? e.vertices?.[1]?.y)}" stroke="${color}" stroke-width="0.5"/>`)
          break

        case 'LWPOLYLINE':
        case 'POLYLINE':
          if (e.vertices?.length >= 2) {
            const pts = e.vertices.map(v => `${v.x},${-v.y}`).join(' ')
            const closed = e.shape || e.closed ? 'Z' : ''
            svgParts.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="0.5" ${closed ? 'fill="none"' : ''}/>`)
          }
          break

        case 'CIRCLE':
          if (e.center) {
            svgParts.push(`<circle cx="${e.center.x}" cy="${-e.center.y}" r="${e.radius || 1}" fill="none" stroke="${color}" stroke-width="0.5"/>`)
          }
          break

        case 'ARC':
          if (e.center && e.radius) {
            const r = e.radius
            const startAngle = (e.startAngle || 0) * Math.PI / 180
            const endAngle = (e.endAngle || 360) * Math.PI / 180
            const x1 = e.center.x + r * Math.cos(startAngle)
            const y1 = -(e.center.y + r * Math.sin(startAngle))
            const x2 = e.center.x + r * Math.cos(endAngle)
            const y2 = -(e.center.y + r * Math.sin(endAngle))
            const largeArc = (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI) > Math.PI ? 1 : 0
            svgParts.push(`<path d="M${x1},${y1} A${r},${r} 0 ${largeArc},0 ${x2},${y2}" fill="none" stroke="${color}" stroke-width="0.5"/>`)
          }
          break

        case 'TEXT':
          if (e.startPoint || e.position) {
            const x = e.startPoint?.x ?? e.position?.x ?? 0
            const y = -(e.startPoint?.y ?? e.position?.y ?? 0)
            const h = e.textHeight || e.height || 2.5
            const text = cleanText(e.text || e.string || '')
            if (text) {
              svgParts.push(`<text x="${x}" y="${y}" font-size="${h}" fill="${color}" dominant-baseline="auto">${escapeXml(text)}</text>`)
            }
          }
          break

        case 'MTEXT':
          if (e.position) {
            const h = e.height || e.textHeight || 2.5
            const text = cleanMtext(e.text || e.string || '')
            if (text) {
              const lines = text.split('\n')
              svgParts.push(`<text x="${e.position.x}" y="${-e.position.y}" font-size="${h}" fill="${color}">`)
              lines.forEach((line, i) => {
                svgParts.push(`<tspan x="${e.position.x}" dy="${i === 0 ? 0 : h * 1.2}">${escapeXml(line)}</tspan>`)
              })
              svgParts.push('</text>')
            }
          }
          break

        case 'INSERT':
          // Render block reference as a group with transform
          if (dxf.blocks?.[e.name]?.entities) {
            const tx = e.position?.x ?? 0
            const ty = -(e.position?.y ?? 0)
            const sx = e.xScale ?? 1
            const sy = e.yScale ?? 1
            svgParts.push(`<g transform="translate(${tx},${ty}) scale(${sx},${-sy})">`)
            for (const be of dxf.blocks[e.name].entities) {
              // Simplified: render lines and text from blocks
              if (be.type === 'LINE' && be.startPoint && be.endPoint) {
                svgParts.push(`<line x1="${be.startPoint.x}" y1="${-be.startPoint.y}" x2="${be.endPoint.x}" y2="${-be.endPoint.y}" stroke="${color}" stroke-width="0.5"/>`)
              }
              if ((be.type === 'TEXT' || be.type === 'MTEXT') && (be.startPoint || be.position)) {
                const bx = be.startPoint?.x ?? be.position?.x ?? 0
                const by = -(be.startPoint?.y ?? be.position?.y ?? 0)
                const bh = be.textHeight || be.height || 2.5
                const bt = cleanText(be.text || be.string || '')
                if (bt) svgParts.push(`<text x="${bx}" y="${by}" font-size="${bh}" fill="${color}">${escapeXml(bt)}</text>`)
              }
            }
            svgParts.push('</g>')
          }
          break
      }
    }

    svgParts.push('</g>')
  }

  svgParts.push('</svg>')
  return svgParts.join('\n')
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Format extracted entities as structured text for AI interpretation
 * This replaces the need for vision AI — the AI just interprets pre-extracted text
 */
export function formatEntitiesForAI(entities, layers) {
  const parts = []

  parts.push('=== DATOS EXTRAÍDOS DEL ARCHIVO DXF/DWG ===')
  parts.push(`Capas encontradas: ${layers.map(l => l.name).join(', ')}`)
  parts.push('')

  // Group texts by layer for context
  const textsByLayer = {}
  for (const t of entities.texts) {
    if (!textsByLayer[t.layer]) textsByLayer[t.layer] = []
    textsByLayer[t.layer].push(t)
  }

  for (const [layer, layerTexts] of Object.entries(textsByLayer)) {
    parts.push(`── Capa "${layer}" (${layerTexts.length} textos) ──`)
    // Sort by Y descending then X ascending (top to bottom, left to right)
    const sorted = [...layerTexts].sort((a, b) => b.y - a.y || a.x - b.x)
    for (const t of sorted) {
      const pos = `(${Math.round(t.x)}, ${Math.round(t.y)})`
      parts.push(`  ${pos}: "${t.content}"${t.height > 5 ? ' [TÍTULO]' : ''}`)
    }
    parts.push('')
  }

  // Dimensions
  if (entities.dimensions.length > 0) {
    parts.push(`── Cotas (${entities.dimensions.length}) ──`)
    for (const d of entities.dimensions) {
      const val = d.value != null ? `${d.value}` : d.text || 'sin valor'
      parts.push(`  Cota: ${val} (capa: ${d.layer})`)
    }
    parts.push('')
  }

  // Block references
  if (entities.blocks.length > 0) {
    const blockCounts = {}
    for (const b of entities.blocks) {
      blockCounts[b.blockName] = (blockCounts[b.blockName] || 0) + 1
    }
    parts.push(`── Bloques insertados ──`)
    for (const [name, count] of Object.entries(blockCounts)) {
      parts.push(`  ${name}: ${count} instancias`)
    }

    // Show block attributes
    const withAttrs = entities.blocks.filter(b => b.attributes?.length > 0)
    if (withAttrs.length > 0) {
      parts.push('')
      parts.push('── Atributos de bloques ──')
      for (const b of withAttrs) {
        const attrs = b.attributes.map(a => `${a.tag}="${a.value}"`).join(', ')
        parts.push(`  ${b.blockName} en (${Math.round(b.x)}, ${Math.round(b.y)}): ${attrs}`)
      }
    }
    parts.push('')
  }

  return parts.join('\n')
}
