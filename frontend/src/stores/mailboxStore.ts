import { create } from 'zustand'
import api from '@/lib/api'
import type { MailboxMessage, MailboxContact, MailboxUserSearchResult, MailboxAttachmentRef } from '@/types'

interface SendMessageParams {
  to_user_id: string
  subject: string
  body?: string
  budget_id?: string
  project_id?: string
  files?: File[]
  references?: MailboxAttachmentRef[]
}

interface MailboxState {
  inbox: MailboxMessage[]
  sent: MailboxMessage[]
  trash: MailboxMessage[]
  contacts: MailboxContact[]
  searchResults: MailboxUserSearchResult[]
  unreadCount: number
  loading: boolean

  loadInbox: () => Promise<void>
  loadSent: () => Promise<void>
  loadTrash: () => Promise<void>
  loadContacts: () => Promise<void>
  loadUnreadCount: () => Promise<void>
  searchUsers: (query: string) => Promise<void>
  sendMessage: (params: SendMessageParams) => Promise<void>
  getMessage: (id: string) => Promise<MailboxMessage>
  /** Envía el mensaje a la papelera (soft delete en el lado del usuario) */
  deleteMessage: (id: string) => Promise<void>
  /** Saca el mensaje de la papelera */
  restoreMessage: (id: string) => Promise<void>
  /** Elimina definitivamente del lado del usuario. Hard delete si el otro lado también purgó. */
  permanentlyDeleteMessage: (id: string) => Promise<{ hardDeleted: boolean }>
  saveContact: (contactUserId: string) => Promise<void>
  deleteContact: (id: string) => Promise<void>
}

export const useMailboxStore = create<MailboxState>((set) => ({
  inbox: [],
  sent: [],
  trash: [],
  contacts: [],
  searchResults: [],
  unreadCount: 0,
  loading: false,

  loadInbox: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/mailbox/inbox')
      set({ inbox: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  loadSent: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/mailbox/sent')
      set({ sent: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  loadTrash: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/mailbox/trash')
      set({ trash: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  loadContacts: async () => {
    try {
      const { data } = await api.get('/mailbox/contacts')
      set({ contacts: data })
    } catch { /* ignore */ }
  },

  loadUnreadCount: async () => {
    try {
      const { data } = await api.get('/mailbox/unread-count')
      set({ unreadCount: data.count })
    } catch { /* ignore */ }
  },

  searchUsers: async (query) => {
    if (query.length < 2) {
      set({ searchResults: [] })
      return
    }
    try {
      const { data } = await api.get(`/mailbox/search-users?q=${encodeURIComponent(query)}`)
      set({ searchResults: data })
    } catch {
      set({ searchResults: [] })
    }
  },

  sendMessage: async ({ to_user_id, subject, body, budget_id, project_id, files, references }) => {
    const hasFiles = files && files.length > 0
    const hasRefs = references && references.length > 0
    if (hasFiles || hasRefs) {
      const fd = new FormData()
      fd.append('to_user_id', to_user_id)
      fd.append('subject', subject)
      if (body) fd.append('body', body)
      if (budget_id) fd.append('budget_id', budget_id)
      if (project_id) fd.append('project_id', project_id)
      if (references && references.length > 0) fd.append('references', JSON.stringify(references))
      for (const f of files || []) fd.append('files', f)
      await api.post('/mailbox', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    } else {
      await api.post('/mailbox', { to_user_id, subject, body, budget_id, project_id })
    }
  },

  getMessage: async (id) => {
    const { data } = await api.get(`/mailbox/${id}`)
    return data
  },

  deleteMessage: async (id) => {
    await api.delete(`/mailbox/${id}`)
  },

  restoreMessage: async (id) => {
    await api.post(`/mailbox/${id}/restore`)
  },

  permanentlyDeleteMessage: async (id) => {
    const { data } = await api.delete(`/mailbox/${id}/permanent`)
    return { hardDeleted: !!data?.hardDeleted }
  },

  saveContact: async (contactUserId) => {
    await api.post('/mailbox/contacts', { contact_user_id: contactUserId })
  },

  deleteContact: async (id) => {
    await api.delete(`/mailbox/contacts/${id}`)
  },
}))
