import { create } from 'zustand'
import api from '@/lib/api'
import { subscribeTopic } from '@/lib/realtimeClient'
import type { AppNotification } from '@/types'

interface RealtimeNotificationState {
  notifications: AppNotification[]
  unreadCount: number
  unsub: (() => void) | null

  loadNotifications: () => Promise<void>
  loadUnreadCount: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  clearRead: () => Promise<void>
  subscribeRealtime: (userId: string) => void
  unsubscribeRealtime: () => void
}

export const useRealtimeNotificationStore = create<RealtimeNotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  unsub: null,

  loadNotifications: async () => {
    try {
      const { data } = await api.get('/notifications')
      set({ notifications: data })
    } catch { /* ignore */ }
  },

  loadUnreadCount: async () => {
    try {
      const { data } = await api.get('/notifications/unread-count')
      set({ unreadCount: data.count })
    } catch { /* ignore */ }
  },

  markAsRead: async (id) => {
    await api.put(`/notifications/${id}/read`)
    set((s) => ({
      notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }))
  },

  markAllAsRead: async () => {
    await api.put('/notifications/read-all')
    set((s) => ({
      notifications: s.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  clearRead: async () => {
    await api.delete('/notifications/read')
    set((s) => ({
      notifications: s.notifications.filter(n => !n.read),
    }))
  },

  subscribeRealtime: (userId) => {
    if (get().unsub) return

    const unsub = subscribeTopic(`user:${userId}`, (event, payload) => {
      if (event !== 'notification') return
      const notification = payload as AppNotification
      set((s) => ({
        notifications: [notification, ...s.notifications],
        unreadCount: s.unreadCount + 1,
      }))
    })

    set({ unsub })
  },

  unsubscribeRealtime: () => {
    const unsub = get().unsub
    if (unsub) {
      unsub()
      set({ unsub: null })
    }
  },
}))
