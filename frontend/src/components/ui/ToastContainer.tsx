'use client'

import { useNotificationStore } from '@/stores/notificationStore'
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'

const iconMap = {
  success: { icon: CheckCircle2, color: 'text-green-500 dark:text-green-400', bg: 'bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-900' },
  error: { icon: AlertCircle, color: 'text-red-500 dark:text-red-400', bg: 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900' },
  warning: { icon: AlertTriangle, color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900' },
  info: { icon: Info, color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-900' },
}

export function ToastContainer() {
  const { toasts, removeToast } = useNotificationStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const config = iconMap[toast.type]
        const Icon = config.icon
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-sm animate-slide-in ${config.bg}`}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.color}`} />
            <p className="text-sm text-gray-800 dark:text-gray-100 flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-200 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
