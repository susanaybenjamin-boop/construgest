import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration: number
}

interface NotificationState {
  toasts: Toast[]
  addToast: (type: ToastType, message: string, duration?: number) => void
  removeToast: (id: string) => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  toasts: [],

  addToast: (type, message, duration) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const defaultDuration = type === 'error' ? 8000 : 5000
    const toast: Toast = { id, type, message, duration: duration ?? defaultDuration }

    set((s) => ({ toasts: [...s.toasts, toast] }))

    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, toast.duration)
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))
