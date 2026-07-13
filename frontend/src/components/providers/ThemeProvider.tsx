'use client'

import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { applyTheme, getStoredTheme, isTheme, watchSystemTheme, type Theme } from '@/lib/theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.appearance.theme)

  useEffect(() => {
    const stored = getStoredTheme()
    const current = useSettingsStore.getState().appearance.theme
    if (isTheme(stored) && stored !== current) {
      useSettingsStore.setState((s) => ({
        appearance: { ...s.appearance, theme: stored },
      }))
    }
  }, [])

  useEffect(() => {
    const effective: Theme = isTheme(theme) ? (theme as Theme) : 'system'
    applyTheme(effective)
  }, [theme])

  useEffect(() => {
    const effective: Theme = isTheme(theme) ? (theme as Theme) : 'system'
    if (effective !== 'system') return
    return watchSystemTheme(() => applyTheme('system'))
  }, [theme])

  return <>{children}</>
}
