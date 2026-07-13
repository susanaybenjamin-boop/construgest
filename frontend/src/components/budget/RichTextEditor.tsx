'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { useRef, useCallback, useEffect } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, Pilcrow,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered,
  Undo2, Redo2, Palette, Highlighter, RemoveFormatting,
} from 'lucide-react'

interface Props {
  content: string
  onChange: (html: string) => void
  placeholder?: string
}

// Toolbar button component
function TBtn({
  onClick,
  isActive,
  title,
  children,
}: {
  onClick: () => void
  isActive?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition cursor-pointer ${
        isActive
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

// Separator between button groups
function Sep() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />
}

const ICON = 'w-4 h-4'

export default function RichTextEditor({ content, onChange, placeholder }: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleUpdate = useCallback(
    (html: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onChange(html)
      }, 1000)
    },
    [onChange]
  )

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: content || '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none px-4 py-3 min-h-[200px] outline-none focus:outline-none ' +
          'prose-headings:text-gray-900 prose-p:text-gray-700 prose-p:leading-relaxed ' +
          'prose-ul:my-1 prose-ol:my-1 prose-li:my-0',
      },
    },
    onUpdate: ({ editor: e }) => {
      handleUpdate(e.getHTML())
    },
  })

  // Flush pending debounce on blur (save immediately when leaving)
  const handleBlur = useCallback(() => {
    if (debounceRef.current && editor) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
      onChange(editor.getHTML())
    }
  }, [editor, onChange])

  if (!editor) return null

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* ─── Toolbar ─── */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        {/* Text formatting */}
        <TBtn onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Negrita (Ctrl+B)">
          <Bold className={ICON} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Cursiva (Ctrl+I)">
          <Italic className={ICON} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Subrayado (Ctrl+U)">
          <UnderlineIcon className={ICON} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Tachado">
          <Strikethrough className={ICON} />
        </TBtn>

        <Sep />

        {/* Headings */}
        <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="Encabezado 1">
          <Heading1 className={ICON} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Encabezado 2">
          <Heading2 className={ICON} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title="Encabezado 3">
          <Heading3 className={ICON} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setParagraph().run()} isActive={editor.isActive('paragraph') && !editor.isActive('heading')} title="Texto normal">
          <Pilcrow className={ICON} />
        </TBtn>

        <Sep />

        {/* Alignment */}
        <TBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Alinear izquierda">
          <AlignLeft className={ICON} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Centrar">
          <AlignCenter className={ICON} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Alinear derecha">
          <AlignRight className={ICON} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} title="Justificar">
          <AlignJustify className={ICON} />
        </TBtn>

        <Sep />

        {/* Lists */}
        <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Lista con viñetas">
          <List className={ICON} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Lista numerada">
          <ListOrdered className={ICON} />
        </TBtn>

        <Sep />

        {/* Color & highlight */}
        <div className="relative">
          <TBtn onClick={() => {}} isActive={false} title="Color de texto">
            <Palette className={ICON} />
          </TBtn>
          <input
            type="color"
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            title="Color de texto"
          />
        </div>
        <TBtn
          onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
          isActive={editor.isActive('highlight')}
          title="Resaltar"
        >
          <Highlighter className={ICON} />
        </TBtn>

        <Sep />

        {/* Clear formatting */}
        <TBtn onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Limpiar formato">
          <RemoveFormatting className={ICON} />
        </TBtn>

        <Sep />

        {/* Undo/Redo */}
        <TBtn onClick={() => editor.chain().focus().undo().run()} title="Deshacer (Ctrl+Z)">
          <Undo2 className={ICON} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().redo().run()} title="Rehacer (Ctrl+Y)">
          <Redo2 className={ICON} />
        </TBtn>
      </div>

      {/* ─── Editor Content ─── */}
      <div onBlur={handleBlur}>
        <EditorContent
          editor={editor}
          className="rich-editor-content"
        />
      </div>

      {/* Placeholder hint */}
      {editor.isEmpty && placeholder && (
        <div className="px-4 -mt-[200px] pt-3 pointer-events-none text-sm text-gray-400 select-none h-[200px]">
          {placeholder}
        </div>
      )}
    </div>
  )
}
