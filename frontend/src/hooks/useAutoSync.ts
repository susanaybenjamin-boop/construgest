'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { useBudgetStore } from '@/stores/budgetStore'
import { useWorkLogStore } from '@/stores/workLogStore'
import { useExpenseStore } from '@/stores/expenseStore'
import { useCertificationStore } from '@/stores/certificationStore'
import { isLocalBackendAvailable } from '@/lib/localApi'
import localApi from '@/lib/localApi'

/**
 * Hook that automatically syncs ALL project data to local disk.
 * Monitors all project-related stores and triggers a full backup
 * 5 seconds after the last change (debounced).
 *
 * Place in the project layout - covers budgets, chapters, items,
 * work logs, expenses, certifications, files, etc.
 */
export function useAutoSync(projectId: string | undefined) {
  const activeProject = useProjectStore((s) => s.activeProject)
  const projectFiles = useProjectStore((s) => s.projectFiles)

  // Watch store states that indicate data changes
  const budgets = useBudgetStore((s) => s.budgets)
  const activeBudget = useBudgetStore((s) => s.activeBudget)
  const workLogs = useWorkLogStore((s) => s.workLogs)
  const activeWorkLog = useWorkLogStore((s) => s.activeWorkLog)
  const expenses = useExpenseStore((s) => s.expenses)
  const certifications = useCertificationStore((s) => s.certifications)

  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSyncingRef = useRef(false)

  const triggerSync = useCallback(async () => {
    if (!projectId || !activeProject?.folder_path || isSyncingRef.current) return

    const available = await isLocalBackendAvailable()
    if (!available) return

    isSyncingRef.current = true
    try {
      await localApi.post(`/projects/${projectId}/backup`)
    } catch {
      // Silent fail
    } finally {
      isSyncingRef.current = false
    }
  }, [projectId, activeProject?.folder_path])

  // Debounced sync: triggers 5s after any store change
  useEffect(() => {
    if (!projectId || !activeProject?.folder_path) return

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    syncTimeoutRef.current = setTimeout(triggerSync, 5000)

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    }
  }, [
    projectId,
    activeProject?.folder_path,
    activeProject?.updated_at,
    projectFiles,
    budgets,
    activeBudget,
    workLogs,
    activeWorkLog,
    expenses,
    certifications,
    triggerSync,
  ])
}
