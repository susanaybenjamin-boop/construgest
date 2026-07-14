'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import {
  Building2, LayoutDashboard, Library, Truck, Settings,
  LogOut, Loader2, HardHat, Users, GitBranch, Mail,
  Trash2,
} from 'lucide-react'
import NotificationBell from '@/components/ui/NotificationBell'
import { useRealtimeNotificationStore } from '@/stores/realtimeNotificationStore'
import { useMailboxStore } from '@/stores/mailboxStore'
import { useProjectStore } from '@/stores/projectStore'
import { useBranchStore } from '@/stores/branchStore'
import { getToken } from '@/lib/tokenStorage'
import { cn } from '@/lib/utils'
import { isLocalBackendAvailable } from '@/lib/localApi'

const navItems = [
  { key: 'panel', label: 'Panel', icon: LayoutDashboard, href: '/admin' },
  { key: 'library', label: 'Biblioteca', icon: Library, href: '/admin/library' },
  { key: 'branches', label: 'Sucursales', icon: GitBranch, href: '/admin/branches' },
  { key: 'mailbox', label: 'Buzón', icon: Mail, href: '/admin/mailbox' },
  { key: 'suppliers', label: 'Proveedores', icon: Truck, href: '/admin/suppliers' },
  { key: 'subcontractors', label: 'Subcontratas', icon: HardHat, href: '/admin/subcontractors' },
  { key: 'settings', label: 'Configuración', icon: Settings, href: '/admin/settings' },
  { key: 'users', label: 'Usuarios', icon: Users, href: '/admin/users', superAdminOnly: true },
  { key: 'trash', label: 'Papelera', icon: Trash2, href: '/admin/trash' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, organizationId, checkAuth, logout, isSuperAdmin } = useAuthStore()
  const { company, loadSettings } = useSettingsStore()
  const { subscribeRealtime, unsubscribeRealtime } = useRealtimeNotificationStore()
  const { loadUnreadCount: loadMailboxUnread, unreadCount: mailboxUnread } = useMailboxStore()
  const { startRealtime: startProjectsRealtime, stopRealtime: stopProjectsRealtime } = useProjectStore()
  const { startRealtime: startBranchesRealtime, stopRealtime: stopBranchesRealtime } = useBranchStore()
  const [localBackendUp, setLocalBackendUp] = useState<boolean | null>(null)

  // Check local backend status periodically
  useEffect(() => {
    const check = async () => {
      const available = await isLocalBackendAvailable()
      setLocalBackendUp(available)
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    checkAuth().then(() => {
      const token = getToken()
      if (!token) {
        router.push('/login')
      }
    })
  }, [])

  useEffect(() => {
    if (organizationId) {
      loadSettings(organizationId)
    }
  }, [organizationId])

  // Realtime notifications + mailbox unread count + sincronización de proyectos y sucursales
  useEffect(() => {
    if (user?.id && organizationId) {
      subscribeRealtime(user.id)
      loadMailboxUnread()
      startProjectsRealtime(organizationId)
      startBranchesRealtime(organizationId)
      return () => {
        unsubscribeRealtime()
        stopProjectsRealtime()
        stopBranchesRealtime()
      }
    }
  }, [user?.id, organizationId])

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 flex flex-col fixed h-full shadow-xl">
        {/* Logo / Company */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-700/40">
          {company.company_logo_url ? (
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={company.company_logo_url}
                alt="Logo"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
          )}
          <span className="font-bold text-white text-sm truncate">
            {company.company_name || 'ConstruGest'}
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto">
          {navItems.filter(item => !item.superAdminOnly || isSuperAdmin).map((item) => {
            const isActive = item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href)

            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-blue-600/90 text-white shadow-lg shadow-blue-600/20 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50 border border-transparent'
                )}
              >
                <div className="relative">
                  <item.icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2 : 1.5} />
                  {item.key === 'mailbox' && mailboxUnread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {mailboxUnread > 9 ? '9+' : mailboxUnread}
                    </span>
                  )}
                </div>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-2.5 border-t border-slate-700/40 space-y-1">
          <NotificationBell />
          <button
            onClick={() => { logout(); router.push('/login') }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 border border-transparent hover:border-red-500/20"
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.5} />
            <span>Cerrar sesión</span>
          </button>
          {user && (
            <div className="px-3 py-2 text-xs text-slate-500 truncate">
              {user.full_name}
            </div>
          )}
          <div className="px-3 py-1.5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className={`w-2 h-2 rounded-full shrink-0 ${localBackendUp ? 'bg-green-400' : localBackendUp === null ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`} />
              <span>{localBackendUp ? 'Sync local activo' : localBackendUp === null ? 'Comprobando...' : 'Sync local inactivo'}</span>
            </div>
            {localBackendUp === false && (
              <p className="text-[10px] text-slate-600 mt-1 leading-tight">
                Ejecuta <span className="text-amber-400 font-mono">setup.bat</span> en la carpeta backend
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-56 min-w-0 overflow-x-hidden">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
