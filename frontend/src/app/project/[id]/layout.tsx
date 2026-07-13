'use client'

import { useEffect } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { useProjectStore } from '@/stores/projectStore'
import { useTranslation } from 'react-i18next'
import {
  Building2, LayoutDashboard, Calculator, Map, Award,
  Wallet, FileText, Settings, ArrowLeft, LogOut, Loader2,
  Library, Brain, ClipboardCheck, Banknote, FolderOpen, Truck, HardHat
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAutoSync } from '@/hooks/useAutoSync'
import { getToken } from '@/lib/tokenStorage'

const navItems = [
  { key: 'dashboard', icon: LayoutDashboard, href: '' },
  { key: 'budget', icon: Calculator, href: '/budget' },
  { key: 'plans', icon: FileText, href: '/plans' },
  { key: 'daily-work', icon: HardHat, href: '/daily-work' },
  { key: 'certifications', icon: ClipboardCheck, href: '/certifications' },
  { key: 'economic', icon: Banknote, href: '/expenses' },
  { key: 'files', icon: FolderOpen, href: '/files' },
  { key: 'suppliers', icon: Truck, href: '/admin/suppliers', absolute: true },
  { key: 'subcontractors', icon: HardHat, href: '/admin/subcontractors', absolute: true },
  { key: 'partidas', icon: Library, href: '/admin/library', absolute: true },
  { key: 'ai', icon: Brain, href: '/ai' },
  { key: 'settings', icon: Settings, href: '/settings' },
]

const KIND_TO_NAV_KEY: Record<string, string> = {
  budget: 'budget',
  certification: 'certifications',
  work_log: 'daily-work',
  expense: 'economic',
  project_file: 'files',
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const { user, checkAuth, logout } = useAuthStore()
  const { activeProject, loadProject, loading } = useProjectStore()
  const projectId = params.id as string

  const isMailboxGuest = activeProject?.access?.role === 'mailbox_guest'
  const sharedKinds = activeProject?.access?.shared_kinds || []
  const allowedNavKeys = isMailboxGuest
    ? new Set(sharedKinds.map(k => KIND_TO_NAV_KEY[k]).filter(Boolean))
    : null
  const visibleNavItems = allowedNavKeys
    ? navItems.filter(i => allowedNavKeys.has(i.key))
    : navItems

  // Auto-sync solo para miembros del proyecto, no para invitados
  useAutoSync(isMailboxGuest ? '' : projectId)

  useEffect(() => {
    checkAuth().then(() => {
      const token = getToken()
      if (!token) {
        router.push('/login')
      } else {
        loadProject(projectId)
      }
    })
  }, [projectId])

  // Invitados del buzón: redirigir del dashboard al primer tab permitido
  useEffect(() => {
    if (!activeProject || !isMailboxGuest) return
    const isDashboard = pathname === `/project/${projectId}`
    if (!isDashboard) return
    const first = visibleNavItems.find(i => i.href && !('absolute' in i && i.absolute))
    if (first) router.replace(`/project/${projectId}${first.href}`)
  }, [activeProject, isMailboxGuest, pathname, projectId])

  if (loading || !activeProject) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        {/* Skeleton sidebar */}
        <aside className="w-56 bg-slate-900 flex flex-col fixed h-full shadow-xl">
          <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-700/40">
            <div className="w-8 h-8 rounded-lg bg-slate-700 animate-pulse" />
            <div className="h-4 w-24 bg-slate-700 rounded animate-pulse" />
          </div>
          <div className="px-4 py-4 border-b border-slate-700/40">
            <div className="h-2.5 w-14 bg-slate-700 rounded animate-pulse mb-2" />
            <div className="h-4 w-32 bg-slate-600 rounded animate-pulse" />
          </div>
          <div className="px-2.5 py-3 space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${i === 0 ? 'bg-blue-600/30' : ''}`}>
                <div className="w-[18px] h-[18px] rounded bg-slate-700 animate-pulse" />
                <div className={`h-3.5 rounded animate-pulse ${i === 0 ? 'w-20 bg-blue-500/30' : 'w-16 bg-slate-700'}`} />
              </div>
            ))}
          </div>
        </aside>
        {/* Skeleton main content */}
        <main className="flex-1 ml-56 p-6 lg:p-8">
          <div className="h-7 w-40 bg-gray-200 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-64 bg-gray-100 rounded animate-pulse mb-6" />
          <div className="grid grid-cols-3 gap-4 mb-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="h-3 w-20 bg-gray-200 rounded animate-pulse mb-3" />
                <div className="h-6 w-28 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50">
                <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
                <div className="flex-1" />
                <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar - Dark theme like desktop */}
      <aside className="w-56 bg-slate-900 flex flex-col fixed h-full shadow-xl">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-700/40">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
          <span className="font-bold text-white text-sm">ConstruGest</span>
        </div>

        {/* Project Name */}
        <div className="px-4 py-4 border-b border-slate-700/40">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Proyecto</p>
          <p className="font-medium text-white text-sm truncate">{activeProject.name}</p>
          {activeProject.client_name && (
            <p className="text-xs text-slate-400 truncate mt-0.5">{activeProject.client_name}</p>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const isAbsolute = 'absolute' in item && item.absolute
            const fullHref = isAbsolute ? item.href : `/project/${projectId}${item.href}`
            const isActive = item.href === ''
              ? pathname === `/project/${projectId}`
              : isAbsolute
                ? pathname.startsWith(item.href)
                : pathname.startsWith(fullHref)

            return (
              <Link
                key={item.key}
                href={fullHref}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-blue-600/90 text-white shadow-lg shadow-blue-600/20 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50 border border-transparent'
                )}
              >
                <item.icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2 : 1.5} />
                <span>{t(`nav.${item.key}`)}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-2.5 border-t border-slate-700/40 space-y-1">
          <Link
            href="/admin"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-white hover:bg-slate-700/50 transition-all duration-200 border border-transparent"
          >
            <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={1.5} />
            <span>Panel Admin</span>
          </Link>
          <button
            onClick={() => { logout(); router.push('/login') }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 border border-transparent hover:border-red-500/20"
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.5} />
            <span>{t('auth.logout')}</span>
          </button>
          {user && (
            <div className="px-3 py-2 text-xs text-slate-500 truncate">
              {user.full_name}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-56">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
