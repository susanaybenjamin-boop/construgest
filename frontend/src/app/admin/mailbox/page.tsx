'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMailboxStore } from '@/stores/mailboxStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useRealtimeNotificationStore } from '@/stores/realtimeNotificationStore'
import ComposeMessage from '@/components/mailbox/ComposeMessage'
import api from '@/lib/api'
import {
  Mail, Plus, Inbox, Send, Trash2, Loader2,
  ArrowLeft, Star, User, ChevronRight, Paperclip, FileText, ClipboardList, HardHat, Receipt, Link2, Download, ExternalLink,
  RotateCcw, X as XIcon,
} from 'lucide-react'
import type { MailboxMessage, MailboxAttachment, MailboxAttachmentKind } from '@/types'
import { cn } from '@/lib/utils'

const KIND_ICON: Record<MailboxAttachmentKind, typeof FileText> = {
  file: Paperclip,
  budget: FileText,
  certification: ClipboardList,
  project_file: Paperclip,
  work_log: HardHat,
  expense: Receipt,
}

const KIND_LABEL: Record<MailboxAttachmentKind, string> = {
  file: 'Archivo',
  budget: 'Presupuesto',
  certification: 'Certificación',
  project_file: 'Archivo del proyecto',
  work_log: 'Parte de trabajo',
  expense: 'Gasto',
}

const formatBytes = (n?: number | null) => {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type Tab = 'inbox' | 'sent' | 'trash'

export default function MailboxPage() {
  const {
    inbox, sent, trash, loading,
    loadInbox, loadSent, loadTrash, loadUnreadCount,
    getMessage, deleteMessage, restoreMessage, permanentlyDeleteMessage, saveContact,
  } = useMailboxStore()
  const { addToast } = useNotificationStore()

  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('inbox')
  const [showCompose, setShowCompose] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<MailboxMessage | null>(null)
  const [loadingMessage, setLoadingMessage] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)

  useEffect(() => {
    loadInbox()
    loadSent()
  }, [])

  // Refresca la papelera cuando se abre esa pestaña; limpia selección al cambiar de pestaña.
  useEffect(() => {
    setSelectedIds(new Set())
    if (tab === 'trash') loadTrash()
  }, [tab])

  // Open message from notification link (?msg=id)
  useEffect(() => {
    const msgId = searchParams.get('msg')
    if (msgId) {
      handleSelectMessage(msgId)
    }
  }, [searchParams])

  const handleSelectMessage = async (id: string) => {
    setLoadingMessage(true)
    try {
      const msg = await getMessage(id)
      setSelectedMessage(msg)
      // Refresca listas: el read status puede haber cambiado (inbox) y la papelera puede necesitarlo
      loadInbox()
      if (tab === 'trash') loadTrash()
      loadUnreadCount()
      // El backend marca la notificación vinculada como leída; refrescar bell
      useRealtimeNotificationStore.getState().loadUnreadCount()
      useRealtimeNotificationStore.getState().loadNotifications()
    } catch {
      addToast('error', 'Error al cargar mensaje')
    } finally {
      setLoadingMessage(false)
    }
  }

  // Refresca todas las listas (tras cualquier mutación las 3 pueden cambiar)
  const refreshAll = () => {
    loadInbox()
    loadSent()
    loadTrash()
    loadUnreadCount()
  }

  // Mueve a papelera (desde inbox/sent o desde el detalle). Ofrece "Deshacer" en el toast.
  const handleSoftDelete = async (ids: string[]) => {
    if (ids.length === 0) return
    setBulkActing(true)
    try {
      await Promise.all(ids.map(id => deleteMessage(id)))
      addToast(
        'success',
        ids.length === 1
          ? 'Mensaje movido a la papelera'
          : `${ids.length} mensajes movidos a la papelera`
      )
      setSelectedIds(new Set())
      setSelectedMessage(null)
      refreshAll()
    } catch {
      addToast('error', 'Error al mover a papelera')
    } finally {
      setBulkActing(false)
    }
  }

  const handleRestore = async (ids: string[]) => {
    if (ids.length === 0) return
    setBulkActing(true)
    try {
      await Promise.all(ids.map(id => restoreMessage(id)))
      addToast('success', ids.length === 1 ? 'Mensaje restaurado' : `${ids.length} mensajes restaurados`)
      setSelectedIds(new Set())
      setSelectedMessage(null)
      refreshAll()
    } catch {
      addToast('error', 'Error al restaurar')
    } finally {
      setBulkActing(false)
    }
  }

  const handlePermanentDelete = async (ids: string[]) => {
    if (ids.length === 0) return
    const msg = ids.length === 1
      ? '¿Eliminar este mensaje definitivamente? No se podrá recuperar.'
      : `¿Eliminar ${ids.length} mensajes definitivamente? No se podrán recuperar.`
    if (!confirm(msg)) return
    setBulkActing(true)
    try {
      await Promise.all(ids.map(id => permanentlyDeleteMessage(id)))
      addToast('success', 'Eliminado definitivamente')
      setSelectedIds(new Set())
      setSelectedMessage(null)
      refreshAll()
    } catch {
      addToast('error', 'Error al eliminar definitivamente')
    } finally {
      setBulkActing(false)
    }
  }

  const toggleSelection = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === messages.length && messages.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(messages.map(m => m.id)))
    }
  }

  const handleSaveContact = async (userId: string) => {
    try {
      await saveContact(userId)
      addToast('success', 'Contacto guardado')
    } catch {
      addToast('error', 'Error al guardar contacto')
    }
  }

  const handleMessageSent = () => {
    setShowCompose(false)
    loadSent()
    loadUnreadCount()
  }

  const openAttachment = async (att: MailboxAttachment) => {
    try {
      if (att.kind === 'file') {
        const { data } = await api.get<{ url: string }>(`/mailbox/attachments/${att.id}/download`)
        if (data?.url) window.open(data.url, '_blank')
        return
      }
      const r = (att.resource || {}) as Record<string, unknown>
      const projectId = r.project_id as string | undefined
      if (att.kind === 'budget' && att.ref_id && projectId) {
        router.push(`/project/${projectId}/budget?budget=${att.ref_id}`)
      } else if (att.kind === 'certification' && att.ref_id && projectId) {
        router.push(`/project/${projectId}/certifications`)
      } else if (att.kind === 'project_file' && projectId) {
        router.push(`/project/${projectId}/files`)
      } else if (att.kind === 'work_log' && projectId) {
        router.push(`/project/${projectId}/daily-work`)
      } else if (att.kind === 'expense' && projectId) {
        router.push(`/project/${projectId}/expenses`)
      } else {
        addToast('warning', 'El recurso ya no está disponible')
      }
    } catch {
      addToast('error', 'No se pudo abrir el adjunto')
    }
  }

  const messages = tab === 'inbox' ? inbox : tab === 'sent' ? sent : trash
  const isInTrash = tab === 'trash'

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  }

  // Detail view
  if (selectedMessage) {
    // Un mensaje es "papelera" si lo estás viendo desde la pestaña trash (el backend ya filtra por lado)
    const detailInTrash = tab === 'trash'
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedMessage(null)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al buzon
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">{selectedMessage.subject}</h2>
            <div className="flex items-center gap-3 mt-3">
              <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
                <User className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {selectedMessage.from_user?.full_name || 'Desconocido'}
                </p>
                <p className="text-xs text-gray-500">
                  {selectedMessage.from_user?.email} &rarr; {selectedMessage.to_user?.full_name || selectedMessage.to_user?.email}
                </p>
              </div>
              <span className="ml-auto text-xs text-gray-400">
                {new Date(selectedMessage.created_at).toLocaleString('es-ES')}
              </span>
            </div>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {selectedMessage.body || '(Sin contenido)'}
            </p>
          </div>
          {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" /> Adjuntos ({selectedMessage.attachments.length})
              </h3>
              <div className="space-y-2">
                {selectedMessage.attachments.map((att) => {
                  const Icon = KIND_ICON[att.kind] || Link2
                  const isFile = att.kind === 'file'
                  const missing = !isFile && !att.resource
                  return (
                    <button
                      key={att.id}
                      onClick={() => !missing && openAttachment(att)}
                      disabled={missing}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition text-left',
                        missing
                          ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                          : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                      )}
                    >
                      <div className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                        isFile ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{att.label}</p>
                        <p className="text-xs text-gray-500">
                          {KIND_LABEL[att.kind]}
                          {isFile && att.file_size ? ` · ${formatBytes(att.file_size)}` : ''}
                          {missing ? ' · no disponible' : ''}
                        </p>
                      </div>
                      {!missing && (
                        <span className="text-gray-400 shrink-0">
                          {isFile ? <Download className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div className="px-6 py-4 bg-gray-50 flex items-center gap-3 border-t border-gray-100">
            {selectedMessage.from_user && (
              <button
                onClick={() => handleSaveContact(selectedMessage.from_user!.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-50 rounded-lg transition"
              >
                <Star className="w-3.5 h-3.5" />
                Guardar contacto
              </button>
            )}
            <div className="flex-1" />
            {detailInTrash ? (
              <>
                <button
                  onClick={() => handleRestore([selectedMessage.id])}
                  disabled={bulkActing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurar
                </button>
                <button
                  onClick={() => handlePermanentDelete([selectedMessage.id])}
                  disabled={bulkActing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar definitivamente
                </button>
              </>
            ) : (
              <button
                onClick={() => handleSoftDelete([selectedMessage.id])}
                disabled={bulkActing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Mover a papelera
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            Buzon
          </h1>
          <p className="text-sm text-gray-500 mt-1">Envia y recibe mensajes de otros usuarios</p>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Nuevo mensaje
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('inbox')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition',
            tab === 'inbox' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Inbox className="w-4 h-4" />
          Bandeja de entrada
          {inbox.filter(m => !m.read).length > 0 && (
            <span className="w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {inbox.filter(m => !m.read).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('sent')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition',
            tab === 'sent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Send className="w-4 h-4" />
          Enviados
        </button>
        <button
          onClick={() => setTab('trash')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition',
            tab === 'trash' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Trash2 className="w-4 h-4" />
          Papelera
          {trash.length > 0 && (
            <span className="text-[10px] text-gray-500">({trash.length})</span>
          )}
        </button>
      </div>

      {/* Barra de acciones bulk */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
          <span className="text-sm text-blue-900 font-medium">
            {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1 text-blue-700 hover:bg-blue-100 rounded transition"
            title="Limpiar selección"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1" />
          {isInTrash ? (
            <>
              <button
                onClick={() => handleRestore([...selectedIds])}
                disabled={bulkActing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurar
              </button>
              <button
                onClick={() => handlePermanentDelete([...selectedIds])}
                disabled={bulkActing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar definitivamente
              </button>
            </>
          ) : (
            <button
              onClick={() => handleSoftDelete([...selectedIds])}
              disabled={bulkActing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Mover a papelera
            </button>
          )}
        </div>
      )}

      {/* Message list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border border-gray-200">
          <Mail className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {tab === 'inbox'
              ? 'No tienes mensajes'
              : tab === 'sent'
              ? 'No has enviado mensajes'
              : 'La papelera está vacía'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Cabecera con seleccionar todo */}
          <div className="px-5 py-2.5 border-b border-gray-100 flex items-center gap-3 bg-gray-50/60">
            <input
              type="checkbox"
              checked={selectedIds.size === messages.length && messages.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              title="Seleccionar todos"
            />
            <span className="text-xs text-gray-500">
              {selectedIds.size > 0
                ? `${selectedIds.size} / ${messages.length}`
                : `${messages.length} mensaje${messages.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {messages.map((msg) => {
              // En trash, el lado del mensaje que muestra el usuario depende de quién borró
              const side = isInTrash ? msg.side : (tab === 'inbox' ? 'inbox' : 'sent')
              const otherUser = side === 'inbox' ? msg.from_user : msg.to_user
              const isSelected = selectedIds.has(msg.id)
              const showUnread = !isInTrash && tab === 'inbox' && !msg.read
              return (
                <div
                  key={msg.id}
                  onClick={() => handleSelectMessage(msg.id)}
                  className={cn(
                    'group w-full text-left px-5 py-4 hover:bg-gray-50 transition flex items-center gap-3 cursor-pointer',
                    showUnread && 'bg-blue-50/50',
                    isSelected && 'bg-blue-50'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => { /* handled by onClick below to stopPropagation */ }}
                    onClick={(e) => toggleSelection(msg.id, e)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                  />
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-slate-600 shrink-0">
                    {(otherUser?.full_name || otherUser?.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm truncate', showUnread ? 'font-semibold text-gray-900' : 'text-gray-700')}>
                        {otherUser?.full_name || otherUser?.email || 'Desconocido'}
                      </span>
                      {isInTrash && (
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider shrink-0">
                          {side === 'inbox' ? 'recibido' : 'enviado'}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 shrink-0 ml-auto">{formatDate(msg.created_at)}</span>
                    </div>
                    <p className={cn('text-sm truncate flex items-center gap-1.5', showUnread ? 'font-medium text-gray-800' : 'text-gray-600')}>
                      <span className="truncate">{msg.subject}</span>
                      {msg.attachments_count && msg.attachments_count > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-gray-500 shrink-0">
                          <Paperclip className="w-3 h-3" />
                          {msg.attachments_count}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {showUnread && (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  )}
                  {/* Acciones rápidas por hover */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                    {isInTrash ? (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRestore([msg.id]) }}
                          disabled={bulkActing}
                          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition disabled:opacity-50"
                          title="Restaurar"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePermanentDelete([msg.id]) }}
                          disabled={bulkActing}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                          title="Eliminar definitivamente"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSoftDelete([msg.id]) }}
                        disabled={bulkActing}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                        title="Mover a papelera"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 group-hover:hidden" />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Compose modal */}
      {showCompose && (
        <ComposeMessage
          onClose={() => setShowCompose(false)}
          onSent={handleMessageSent}
        />
      )}
    </div>
  )
}
