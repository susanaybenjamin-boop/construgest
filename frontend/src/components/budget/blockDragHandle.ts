// ============================================================================
// COND-4 — Tirador para arrastrar los párrafos del capítulo de condiciones.
//
// Las cláusulas son párrafos del texto del capítulo, y Benjamin quiere
// ordenarlas arrastrándolas "como las demás partidas", sin que puedan salir de
// ese capítulo. Como son su propio texto, de ahí no salen por definición.
//
// Se hace con ProseMirror (que ya viene dentro de TipTap, `@tiptap/pm`) en vez
// de añadir una dependencia nueva: al pasar el ratón aparece un tirador a la
// izquierda del bloque; al arrastrarlo se selecciona ese bloque entero y se
// deja que ProseMirror haga el movimiento (el cursor de destino lo pinta la
// extensión Dropcursor, que ya estaba).
// ============================================================================
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const CLASE = 'cg-drag-handle'

/**
 * Posición del bloque de primer nivel que hay bajo esas coordenadas, o null.
 *
 * OJO con `inside`: ProseMirror ya devuelve ahí la posición ANTES del nodo
 * interior, no una posición dentro de él. Al resolverla sale `depth === 0` y,
 * si se trata como "dentro", se descarta el bloque y el tirador no aparece
 * nunca (así estaba al principio).
 */
function bloqueEn(view: EditorView, x: number, y: number): number | null {
  const encontrado = view.posAtCoords({ left: x, top: y })
  if (!encontrado) return null

  if (encontrado.inside >= 0) {
    const $dentro = view.state.doc.resolve(encontrado.inside)
    return $dentro.depth === 0 ? encontrado.inside : $dentro.before(1)
  }

  const $pos = view.state.doc.resolve(encontrado.pos)
  if ($pos.depth === 0) return null
  return $pos.before(1)
}

function crearTirador(): HTMLElement {
  const el = document.createElement('div')
  el.className = CLASE
  el.setAttribute('draggable', 'true')
  el.setAttribute('title', 'Arrastra para mover este párrafo')
  el.setAttribute('aria-label', 'Mover párrafo')
  // Estilos en línea para no tocar los estilos globales de la app.
  Object.assign(el.style, {
    position: 'fixed',
    width: '18px',
    height: '18px',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
    borderRadius: '4px',
    color: '#9ca3af',
    fontSize: '12px',
    lineHeight: '1',
    userSelect: 'none',
    zIndex: '20',
  } as Partial<CSSStyleDeclaration>)
  el.textContent = '⠿'
  el.addEventListener('mouseenter', () => { el.style.background = '#e5e7eb'; el.style.color = '#4b5563' })
  el.addEventListener('mouseleave', () => { el.style.background = 'transparent'; el.style.color = '#9ca3af' })
  return el
}

export const BlockDragHandle = Extension.create({
  name: 'blockDragHandle',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockDragHandle'),
        view(view) {
          // El tirador se cuelga del BODY y se coloca con `position: fixed`.
          // Antes se colgaba del contenedor del editor, pero cuando el plugin
          // arranca ese contenedor todavía no está montado (TipTap crea el
          // editor con immediatelyRender:false y React lo monta después), así
          // que ni se podía dar por bueno su posicionamiento ni sus medidas.
          const tirador = crearTirador()
          document.body.appendChild(tirador)
          let posActual: number | null = null

          const esconder = () => { tirador.style.display = 'none'; posActual = null }

          const colocar = (pos: number) => {
            const dom = view.nodeDOM(pos) as HTMLElement | null
            if (!dom || !dom.getBoundingClientRect) return esconder()
            const r = dom.getBoundingClientRect()
            tirador.style.top = `${r.top + 2}px`
            tirador.style.left = `${r.left - 24}px`
            tirador.style.display = 'flex'
          }

          const onMouseMove = (e: MouseEvent) => {
            if (!view.editable) return esconder()
            const pos = bloqueEn(view, e.clientX, e.clientY)
            if (pos === null) return
            posActual = pos
            colocar(pos)
          }

          const onMouseLeave = (e: MouseEvent) => {
            const hacia = e.relatedTarget as HTMLElement | null
            if (hacia && hacia.closest?.(`.${CLASE}`)) return  // va hacia el tirador
            esconder()
          }

          const onDragStart = (e: DragEvent) => {
            if (posActual === null || !e.dataTransfer) return
            const { state } = view
            if (posActual >= state.doc.content.size) return

            // Seleccionar el bloque entero y dejar que ProseMirror lo mueva.
            const seleccion = NodeSelection.create(state.doc, posActual)
            view.dispatch(state.tr.setSelection(seleccion))

            const slice = view.state.selection.content()
            view.dragging = { slice, move: true }

            const dom = view.nodeDOM(posActual) as HTMLElement | null
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/html', dom?.outerHTML || '')
            if (dom) e.dataTransfer.setDragImage(dom, 0, 0)
            tirador.style.cursor = 'grabbing'
          }

          const onDragEnd = () => { tirador.style.cursor = 'grab'; esconder() }

          view.dom.addEventListener('mousemove', onMouseMove)
          view.dom.addEventListener('mouseleave', onMouseLeave)
          window.addEventListener('scroll', esconder, true)
          tirador.addEventListener('dragstart', onDragStart)
          tirador.addEventListener('dragend', onDragEnd)

          return {
            destroy() {
              view.dom.removeEventListener('mousemove', onMouseMove)
              view.dom.removeEventListener('mouseleave', onMouseLeave)
              window.removeEventListener('scroll', esconder, true)
              tirador.remove()
            },
          }
        },
      }),
    ]
  },
})

export default BlockDragHandle
