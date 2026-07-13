'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { getToken } from '@/lib/tokenStorage'
import BudgetReferenceViewer from '@/components/budget/BudgetReferenceViewer'

function ReferencePopupInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialProjectId = searchParams?.get('project') || undefined
  const initialBudgetId = searchParams?.get('budget') || undefined
  const targetLabel = searchParams?.get('target') || undefined

  const { checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth().then(() => {
      const token = getToken()
      if (!token) router.push('/login')
    })
  }, [checkAuth, router])

  useEffect(() => {
    document.title = 'Consultar presupuesto — Construgest'
  }, [])

  return (
    <BudgetReferenceViewer
      standalone={true}
      initialProjectId={initialProjectId}
      initialBudgetId={initialBudgetId}
      targetPartidaLabel={targetLabel}
      onClose={() => window.close()}
    />
  )
}

export default function BudgetReferencePopupPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="animate-spin w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full" />
      </div>
    }>
      <ReferencePopupInner />
    </Suspense>
  )
}
