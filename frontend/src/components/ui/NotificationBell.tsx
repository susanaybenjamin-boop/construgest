'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, GitBranch, Mail, ExternalLink, Trash2 } from 'lucide-react'
import { useRealtimeNotificationStore } from '@/stores/realtimeNotificationStore'
import type { AppNotification } from '@/types'
import { cn } from '@/lib/utils'

function getNotificationRoute(n: AppNotification): string | null {
  switch (n.type) {
    case 'branch_invitation':
    case 'branch_accepted':
    case 'branch_rejected':
      return '/admin/branches'
    case 'mailbox_message':
      return n.data?.message_id ? `/admin/mailbox?msg=${n.data.message_id}` : '/admin/mailbox'
    default:
      return null
  }
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'branch_invitation':
    case 'branch_accepted':
    case 'branch_rejected':
      return GitBranch
    case 'mailbox_message':
      return Mail
    default:
      return Bell
  }
}

export default function NotificationBell() {
  const router = useRouter()
  const { notifications, unreadCount, loadNotifications, loadUnreadCount, markAsRead, markAllAsRead, clearRead } = useRealtimeNotificationStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadNotifications()
    loadUnreadCount()
  }, [])

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'Ahora'
    if (diffMin < 60) return `${diffMin}m`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h`
    const diffD = Math.floor(diffH / 24)
    return `${diffD}d`
  }

  const readCount = notifications.filter(n => n.read).length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all duration-200 border border-transparent w-full"
      >
        <Bell className="w-[18px] h-[18px]" strokeWidth={1.5} />
        <span>Notificaciones</span>
        {unreadCount > 0 && (
          <span className="absolute top-1.5 left-7 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-16 left-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden" style={{ zIndex: 99999 }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h3 className="text-sm font-semibold text-white">Notificaciones</h3>
            <div className="flex items-center gap-2">
              {readCount > 0 && (
                <button
                  onClick={() => clearRead()}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-red-500/10 transition"
                  title="Limpiar leidas"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-blue-500/10 transition"
                  title="Marcar todas como leidas"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Marcar todo
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                Sin notificaciones
              </div>
            ) : (
              notifications.map((n) => {
                const route = getNotificationRoute(n)
                const Icon = getNotificationIcon(n.type)
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.read) markAsRead(n.id)
                      if (route) {
                        setOpen(false)
                        router.push(route)
                      }
                    }}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-slate-700/50 transition-colors border-b border-slate-700/50 last:border-0',
                      !n.read && 'bg-blue-500/5',
                      route && 'cursor-pointer'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                        !n.read ? 'bg-blue-500/20' : 'bg-slate-700/50'
                      )}>
                        <Icon className={cn('w-3.5 h-3.5', !n.read ? 'text-blue-400' : 'text-slate-500')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm truncate', !n.read ? 'font-medium text-white' : 'text-slate-300')}>{n.title}</p>
                        {n.body && (
                          <p className="text-xs text-slate-400 truncate mt-0.5">{n.body}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[10px] text-slate-500">{formatTime(n.created_at)}</p>
                          {route && (
                            <ExternalLink className="w-2.5 h-2.5 text-slate-600" />
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
