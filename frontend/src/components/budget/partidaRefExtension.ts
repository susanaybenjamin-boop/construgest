// ============================================================================
// COND-2 — Nodo de TipTap para la referencia a una partida.
//
// Se guarda como <span data-partida-ref="ID">2.1 HORMIGÓN DE LIMPIEZA</span>.
// Es un "atom": se comporta como una sola pieza (no se puede editar el texto a
// medias), para que la etiqueta la mande siempre la partida y no el dedo.
//
// El PDF no necesita saber nada de esto: htmlToPdfmake lee el texto del span.
// ============================================================================
import { Node, mergeAttributes } from '@tiptap/core'

export interface PartidaRefOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    partidaRef: {
      /** Inserta una referencia a una partida del presupuesto. */
      insertPartidaRef: (attrs: { itemId: string; label: string }) => ReturnType
    }
  }
}

export const PartidaRef = Node.create<PartidaRefOptions>({
  name: 'partidaRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      itemId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-partida-ref'),
        renderHTML: (attrs) => (attrs.itemId ? { 'data-partida-ref': attrs.itemId } : {}),
      },
      label: {
        default: '',
        // La etiqueta viaja como TEXTO del span (lo que lee el PDF), no como atributo.
        parseHTML: (el) => el.textContent || '',
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-partida-ref]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'partida-ref' }),
      node.attrs.label || '—',
    ]
  },

  // Para copiar/pegar como texto plano y para cualquier lectura de texto.
  renderText({ node }) {
    return node.attrs.label || ''
  },

  addCommands() {
    return {
      insertPartidaRef:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})

export default PartidaRef
