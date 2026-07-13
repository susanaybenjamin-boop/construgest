import { create } from 'zustand'
import api from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { AppNotification } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface RealtimeNotificationState {
  notifications: AppNotification[]
  unreadCount: number
  channel: RealtimeChannel | null

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
  channel: null,

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
    const existing = get().channel
    if (existing) return

    const channel = supabase.channel(`user:${userId}`)
      .on('broadcast', { event: 'notification' }, ({ payload }) => {
        const notification = payload as AppNotification
        set((s) => ({
          notifications: [notification, ...s.notifications],
          unreadCount: s.unreadCount + 1,
        }))
      })
      .subscribe()

    set({ channel })
  },

  unsubscribeRealtime: () => {
    const channel = get().channel
    if (channel) {
      supabase.removeChannel(channel)
      set({ channel: null })
    }
  },
}))
