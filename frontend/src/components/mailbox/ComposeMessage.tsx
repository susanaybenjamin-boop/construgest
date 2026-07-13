'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMailboxStore } from '@/stores/mailboxStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { X, Send, Loader2, Star, User, Paperclip, Link2, FileText, ClipboardList, HardHat, Receipt } from 'lucide-react'
import type { MailboxUserSearchResult, MailboxAttachmentRef } from '@/types'
import AttachFromProjectModal from './AttachFromProjectModal'

interface ComposeMessageProps {
  onClose: () => void
  onSent: () => void
}

const KIND_ICON = {
  budget: FileText,
  certification: ClipboardList,
  project_file: Paperclip,
  work_log: HardHat,
  expense: Receipt,
} as const

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function ComposeMessage({ onClose, onSent }: ComposeMessageProps) {
  const { searchUsers, searchResults, sendMessage, saveContact } = useMailboxStore()
  const { addToast } = useNotificationStore()

  const [recipient, setRecipient] = useState<MailboxUserSearchResult | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [refs, setRefs] = useState<MailboxAttachmentRef[]>([])
  const [showAttachModal, setShowAttachModal] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { searchUsers(q) }, 300)
  }, [searchUsers])

  useEffect(() => {
    if (searchQuery.length >= 2 && !recipient) {
      doSearch(searchQuery)
      setShowDropdown(true)
    } else {
      setShowDropdown(false)
    }
  }, [searchQuery, recipient, doSearch])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectRecipient = (user: MailboxUserSearchResult) => {
    setRecipient(user); setSearchQuery(''); setShowDropdown(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && showDropdown && searchResults.length > 0 && !recipient) {
      e.preventDefault()
      selectRecipient(searchResults[0])
    }
  }

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list)
    setFiles((prev) => [...prev, ...incoming])
  }

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx))
  const removeRef = (idx: number) => setRefs((prev) => prev.filter((_, i) => i !== idx))

  const handleAttachRefs = (incoming: MailboxAttachmentRef[]) => {
    setRefs((prev) => {
      const existing = new Set(prev.map(r => `${r.kind}:${r.ref_id}`))
      const dedup = incoming.filter(r => !existing.has(`${r.kind}:${r.ref_id}`))
      return [...prev, ...dedup]
    })
    setShowAttachModal(false)
  }

  const handleSend = async () => {
    if (!recipient || !subject.trim()) return
    setSending(true)
    try {
      await sendMessage({
        to_user_id: recipient.id,
        subject: subject.trim(),
        body: body || undefined,
        files: files.length > 0 ? files : undefined,
        references: refs.length > 0 ? refs : undefined,
      })
      addToast('success', 'Mensaje enviado')
      onSent()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      addToast('error', msg || 'Error al enviar mensaje')
    } finally {
      setSending(false)
    }
  }

  const handleSaveContact = async () => {
    if (!recipient) return
    try {
      await saveContact(recipient.id)
      addToast('success', 'Contacto guardado')
    } catch {
      addToast('error', 'Error al guardar contacto')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Nuevo mensaje</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="relative" ref={dropdownRef}>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Para</label>
            {recipient ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 bg-purple-100 text-purple-700 px-3 py-1 rounded-lg text-sm font-medium">
                  <User className="w-3.5 h-3.5" />
                  {recipient.full_name || recipient.email}
                  <button onClick={() => setRecipient(null)} className="ml-1 hover:text-purple-900">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {!recipient.is_contact && (
                  <button onClick={handleSaveContact} className="p-1 text-gray-400 hover:text-amber-500 transition" title="Guardar contacto">
                    <Star className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Buscar por nombre o email..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                autoFocus
              />
            )}

            {showDropdown && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10 max-h-48 overflow-y-auto">
                {searchResults.map((user, idx) => (
                  <button
                    key={user.id}
                    onClick={() => selectRecipient(user)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-center gap-3 border-b border-gray-50 last:border-0"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-slate-600">
                      {(user.full_name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                    {user.is_contact && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                    {idx === 0 && (
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono shrink-0">Tab</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Asunto</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto del mensaje"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Mensaje</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribe tu mensaje..."
              rows={5}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
          </div>

          {(files.length > 0 || refs.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={`f-${i}`} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-2 py-1 text-xs">
                  <Paperclip className="w-3 h-3" />
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  <span className="text-blue-400">{formatBytes(f.size)}</span>
                  <button onClick={() => removeFile(i)} className="ml-0.5 hover:text-blue-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {refs.map((r, i) => {
                const Icon = KIND_ICON[r.kind] || Link2
                return (
                  <span key={`r-${i}`} className="flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg px-2 py-1 text-xs">
                    <Icon className="w-3 h-3" />
                    <span className="max-w-[180px] truncate">{r.label}</span>
                    <button onClick={() => removeRef(i)} className="ml-0.5 hover:text-purple-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = '' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <Paperclip className="w-3.5 h-3.5" /> Archivo
            </button>
            <button
              type="button"
              onClick={() => setShowAttachModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <Link2 className="w-3.5 h-3.5" /> Del proyecto
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !recipient || !subject.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 transition disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar
          </button>
        </div>
      </div>

      {showAttachModal && (
        <AttachFromProjectModal
          onClose={() => setShowAttachModal(false)}
          onConfirm={handleAttachRefs}
        />
      )}
    </div>
  )
}
