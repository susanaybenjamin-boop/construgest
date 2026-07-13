'use client'

import { useState, useEffect } from 'react'
import { FolderOpen, ChevronRight, ChevronDown, Loader2, X, Check, HardDrive, ArrowUp } from 'lucide-react'
import localApi from '@/lib/localApi'

interface DirEntry {
  name: string
  path: string
  hasChildren: boolean
}

interface BrowseResult {
  path: string
  parent: string | null
  directories: DirEntry[]
}

interface FolderPickerProps {
  value: string
  onChange: (path: string) => void
  placeholder?: string
}

export function FolderPicker({ value, onChange, placeholder = 'Selecciona una carpeta...' }: FolderPickerProps) {
  const [open, setOpen] = useState(false)
  const [currentPath, setCurrentPath] = useState('')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [dirs, setDirs] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Record<string, DirEntry[]>>({})
  const [expandLoading, setExpandLoading] = useState<string | null>(null)

  const loadDirs = async (path?: string) => {
    setLoading(true)
    setError('')
    setExpanded({})
    try {
      const params = path ? `?path=${encodeURIComponent(path)}` : ''
      const { data } = await localApi.get(`/settings/browse-directories${params}`)
      const result = data as BrowseResult
      setCurrentPath(result.path)
      setParentPath(result.parent)
      setDirs(result.directories)
    } catch {
      setError('El explorador solo funciona con el servidor en local. Escribe la ruta manualmente.')
    } finally {
      setLoading(false)
    }
  }

  const loadSubDirs = async (dirPath: string) => {
    if (expanded[dirPath]) {
      const newExpanded = { ...expanded }
      delete newExpanded[dirPath]
      setExpanded(newExpanded)
      return
    }
    setExpandLoading(dirPath)
    try {
      const { data } = await localApi.get(`/settings/browse-directories?path=${encodeURIComponent(dirPath)}`)
      const result = data as BrowseResult
      setExpanded(prev => ({ ...prev, [dirPath]: result.directories }))
    } catch {
      // silently fail
    } finally {
      setExpandLoading(null)
    }
  }

  useEffect(() => {
    if (open) {
      // If user already has a value, open at that path; otherwise let the server decide the root
      if (value && value.trim()) {
        loadDirs(value.trim())
      } else {
        loadDirs()
      }
    }
  }, [open])

  const selectFolder = (path: string) => {
    onChange(path)
    setOpen(false)
  }

  // Build breadcrumbs from the resolved path
  const normalizedPath = currentPath.replace(/\\/g, '/')
  const breadcrumbs = normalizedPath.split('/').filter(Boolean)

  return (
    <div className="relative">
      {/* Input + button */}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg border border-blue-200 transition flex items-center gap-1.5 text-sm font-medium whitespace-nowrap"
        >
          <FolderOpen className="w-4 h-4" />
          Explorar
        </button>
      </div>

      {/* Folder browser dropdown */}
      {open && (
        <div className="absolute z-50 mt-2 w-full bg-white rounded-xl border border-gray-200 shadow-xl max-h-80 flex flex-col">
          {/* Header with breadcrumbs */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-xl">
            <div className="flex items-center gap-1 text-xs text-gray-500 overflow-x-auto flex-1 min-w-0">
              {/* Go up button */}
              {parentPath && (
                <button
                  type="button"
                  onClick={() => loadDirs(parentPath)}
                  className="hover:text-blue-600 shrink-0 p-0.5 hover:bg-blue-50 rounded"
                  title="Subir un nivel"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              )}
              {/* Root drive */}
              <button
                type="button"
                onClick={() => loadDirs()}
                className="hover:text-blue-600 shrink-0"
                title="Ir a la raíz"
              >
                <HardDrive className="w-3.5 h-3.5" />
              </button>
              {/* Path segments */}
              {breadcrumbs.map((part, i) => {
                const pathUpTo = breadcrumbs.slice(0, i + 1).join('\\')
                return (
                  <span key={i} className="flex items-center gap-1 shrink-0">
                    <ChevronRight className="w-3 h-3 text-gray-300" />
                    <button
                      type="button"
                      onClick={() => loadDirs(pathUpTo)}
                      className="hover:text-blue-600 truncate max-w-[120px]"
                    >
                      {part}
                    </button>
                  </span>
                )
              })}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 ml-2 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center border-b border-gray-100">
            <button
              type="button"
              onClick={() => selectFolder(currentPath)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium"
            >
              <Check className="w-4 h-4" />
              Seleccionar esta carpeta
            </button>
          </div>

          {/* Directory list */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : error ? (
              <p className="text-sm text-red-500 px-3 py-4 text-center">{error}</p>
            ) : dirs.length === 0 ? (
              <p className="text-sm text-gray-400 px-3 py-4 text-center">No hay subcarpetas</p>
            ) : (
              dirs.map((dir) => (
                <div key={dir.path}>
                  <div className="flex items-center hover:bg-gray-50 group">
                    {dir.hasChildren ? (
                      <button
                        type="button"
                        onClick={() => loadSubDirs(dir.path)}
                        className="px-2 py-2 text-gray-400 hover:text-gray-600"
                      >
                        {expandLoading === dir.path ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : expanded[dir.path] ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ) : (
                      <span className="px-2 py-2 w-7" />
                    )}
                    <button
                      type="button"
                      onClick={() => loadDirs(dir.path)}
                      className="flex-1 flex items-center gap-2 py-2 pr-2 text-sm text-gray-700"
                      onDoubleClick={() => selectFolder(dir.path)}
                    >
                      <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="truncate">{dir.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => selectFolder(dir.path)}
                      className="px-2 py-1 mr-2 text-xs text-blue-500 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition"
                    >
                      Elegir
                    </button>
                  </div>
                  {expanded[dir.path] && (
                    <div className="pl-6">
                      {expanded[dir.path].length === 0 ? (
                        <p className="text-xs text-gray-400 px-3 py-1">Sin subcarpetas</p>
                      ) : (
                        expanded[dir.path].map((sub) => (
                          <div key={sub.path} className="flex items-center hover:bg-gray-50 group">
                            <span className="px-2 py-1.5 w-7" />
                            <button
                              type="button"
                              onClick={() => loadDirs(sub.path)}
                              className="flex-1 flex items-center gap-2 py-1.5 pr-2 text-sm text-gray-600"
                              onDoubleClick={() => selectFolder(sub.path)}
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                              <span className="truncate">{sub.name}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => selectFolder(sub.path)}
                              className="px-2 py-1 mr-2 text-xs text-blue-500 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition"
                            >
                              Elegir
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
