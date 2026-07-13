'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { useFerrappStore } from '@/stores/ferrappStore'
import {
  Building2, LayoutDashboard, LogOut, Loader2, ArrowLeft, Scissors,
} from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import SyncIndicator from '@/components/ferrapp/SyncIndicator'
import { cn } from '@/lib/utils'
import { getToken } from '@/lib/tokenStorage'

export default function FerrappLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, organizationId, checkAuth, logout } = useAuthStore()
  const { company, loadSettings } = useSettingsStore()
  const { loadProyectos, loadEtiquetas } = useFerrappStore()

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
      loadProyectos()
      loadEtiquetas()
    }
  }, [organizationId])

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className="ferrapp-theme min-h-screen flex bg-[#0f172a]">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 flex flex-col fixed h-full shadow-xl">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-700/40">
          <div className="w-8 h-8 rounded-lg bg-amber-500 text-black flex items-center justify-center shrink-0">
            <Scissors className="w-4 h-4" />
          </div>
          <span className="font-bold text-white text-sm">FERRAPP</span>
          <SyncIndicator />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto">
          <Link
            href="/ferrapp"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
              pathname === '/ferrapp'
                ? 'bg-amber-500/90 text-black shadow-lg shadow-amber-500/20 border border-amber-400/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50 border border-transparent'
            )}
          >
            <LayoutDashboard className="w-[18px] h-[18px]" strokeWidth={pathname === '/ferrapp' ? 2 : 1.5} />
            <span>Mis obras</span>
          </Link>
        </nav>

        {/* Footer */}
        <div className="p-2.5 border-t border-slate-700/40 space-y-1">
          <Link
            href="/admin"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all duration-200 border border-transparent"
          >
            <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={1.5} />
            <span>Volver a ConstruGest</span>
          </Link>
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
        </div>
      </aside>

      {/* Main Content - Dark theme */}
      <main className="flex-1 ml-56 min-w-0 overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
