'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { ToastContainer } from '@/components/ui/ToastContainer'
import { ThemeProvider } from '@/components/providers/ThemeProvider'

function I18nGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    import('@/lib/i18n').then(() => setReady(true))
  }, [])
  if (!ready) return null
  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  )

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <I18nGate>{children}</I18nGate>
        <ToastContainer />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
