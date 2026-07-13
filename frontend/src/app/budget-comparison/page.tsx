'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '@/lib/api'
import { getToken } from '@/lib/tokenStorage'
import { useAuthStore } from '@/stores/authStore'
import type { Budget } from '@/types'
import BudgetComparisonModal from '@/components/budget/BudgetComparisonModal'

function ComparisonPopupInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams?.get('project') || ''
  const a = searchParams?.get('a') || ''
  const b = searchParams?.get('b') || ''

  const { checkAuth } = useAuthStore()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkAuth().then(() => {
      const token = getToken()
      if (!token) {
        router.push('/login')
      }
    })
  }, [checkAuth, router])

  useEffect(() => {
    if (!projectId) {
      setError('Falta el id de proyecto')
      setLoading(false)
      return
    }
    api.get<Budget[]>(`/budgets/project/${projectId}`)
      .then(res => {
        setBudgets(res.data)
        setLoading(false)
      })
      .catch(err => {
        setError(err?.response?.data?.error || err.message || 'Error cargando presupuestos')
        setLoading(false)
      })
  }, [projectId])

  useEffect(() => {
    document.title = 'Comparativa de Presupuestos'
  }, [])

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || budgets.length < 2 || !a || !b) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white p-8">
        <div className="max-w-md text-center">
          <p className="text-red-600 font-medium mb-2">
            {error || 'No se puede abrir la comparativa'}
          </p>
          <p className="text-sm text-gray-500">
            Se necesitan dos presupuestos válidos del mismo proyecto.
          </p>
          <button
            onClick={() => window.close()}
            className="mt-4 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 rounded"
          >
            Cerrar ventana
          </button>
        </div>
      </div>
    )
  }

  return (
    <BudgetComparisonModal
      isOpen={true}
      onClose={() => window.close()}
      budgets={budgets}
      projectId={projectId}
      standalone={true}
      initialBudgetAId={a}
      initialBudgetBId={b}
    />
  )
}

export default function BudgetComparisonPopupPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    }>
      <ComparisonPopupInner />
    </Suspense>
  )
}
