'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function SuppliersRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin/suppliers')
  }, [router])

  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  )
}
