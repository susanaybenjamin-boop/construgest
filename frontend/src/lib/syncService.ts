import localApi, { isLocalBackendAvailable } from './localApi'

/**
 * Sync service - silently syncs data to local backend disk.
 * All methods are fire-and-forget: they never throw or block the UI.
 */

/** Sync a JSON data file to the project's local _backup folder */
export async function syncProjectData(
  projectId: string,
  folderPath: string | null | undefined,
  filename: string,
  data: unknown
) {
  if (!folderPath) return
  const available = await isLocalBackendAvailable()
  if (!available) return
  try {
    await localApi.post(`/projects/${projectId}/sync-data`, {
      folder_path: folderPath,
      filename,
      data,
    })
  } catch {
    // Silent fail - local backend not reachable or disk error
  }
}

/** Sync a file (blob) to the project's local _backup/files folder */
export async function syncProjectFile(
  projectId: string,
  folderPath: string | null | undefined,
  fileName: string,
  fileBlob: Blob
) {
  if (!folderPath) return
  const available = await isLocalBackendAvailable()
  if (!available) return
  try {
    const formData = new FormData()
    formData.append('folder_path', folderPath)
    formData.append('file_name', fileName)
    formData.append('file', fileBlob, fileName)
    await localApi.post(`/projects/${projectId}/sync-file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  } catch {
    // Silent fail
  }
}

/** Sync full project metadata (project.json) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncProject(project: any) {
  if (!project?.id) return
  await syncProjectData(project.id, project.folder_path, 'project.json', project)
}

/** Sync budget data for a project */
export async function syncBudgets(projectId: string, folderPath: string | null | undefined, budgets: unknown[]) {
  await syncProjectData(projectId, folderPath, 'budgets.json', budgets)
}

/** Sync chapters data */
export async function syncChapters(projectId: string, folderPath: string | null | undefined, chapters: unknown[]) {
  await syncProjectData(projectId, folderPath, 'chapters.json', chapters)
}

/** Sync budget items */
export async function syncBudgetItems(projectId: string, folderPath: string | null | undefined, items: unknown[]) {
  await syncProjectData(projectId, folderPath, 'budget_items.json', items)
}

/** Sync work logs */
export async function syncWorkLogs(projectId: string, folderPath: string | null | undefined, workLogs: unknown[]) {
  await syncProjectData(projectId, folderPath, 'work_logs.json', workLogs)
}

/** Sync expenses */
export async function syncExpenses(projectId: string, folderPath: string | null | undefined, expenses: unknown[]) {
  await syncProjectData(projectId, folderPath, 'expenses.json', expenses)
}

/** Sync measurements */
export async function syncMeasurements(projectId: string, folderPath: string | null | undefined, measurements: unknown[]) {
  await syncProjectData(projectId, folderPath, 'measurements.json', measurements)
}

/** Sync certifications */
export async function syncCertifications(projectId: string, folderPath: string | null | undefined, certs: unknown[]) {
  await syncProjectData(projectId, folderPath, 'certifications.json', certs)
}
