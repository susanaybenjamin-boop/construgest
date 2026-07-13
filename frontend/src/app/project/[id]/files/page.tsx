'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import type { ProjectFile } from '@/types'
import { FileText, Upload, Loader2, Trash2, FolderOpen, Download, Image, FileSpreadsheet, File } from 'lucide-react'
import { formatDate } from '@/lib/utils'

const categoryOptions = [
  { value: 'general', label: 'General' },
  { value: 'plan', label: 'Plano' },
  { value: 'memory', label: 'Memoria' },
  { value: 'measurement', label: 'Medición' },
  { value: 'budget', label: 'Presupuesto' },
  { value: 'photo', label: 'Foto' },
]

const categoryLabels: Record<string, string> = {
  plan: 'Plano', memory: 'Memoria', measurement: 'Medición',
  budget: 'Presupuesto', photo: 'Foto', general: 'General',
}

const fileIcons: Record<string, typeof FileText> = {
  pdf: FileText, image: Image, spreadsheet: FileSpreadsheet,
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FilesPage() {
  const { t } = useTranslation()
  const params = useParams()
  const projectId = params.id as string
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<ProjectFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('general')

  useEffect(() => {
    loadFiles()
  }, [projectId])

  const loadFiles = async () => {
    setLoading(true)
    try {
      const { data } = await api.get<ProjectFile[]>(`/projects/${projectId}/files`)
      setFiles(data)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', selectedCategory)
      await api.post(`/projects/${projectId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await loadFiles()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al subir archivo')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const downloadFile = async (file: ProjectFile) => {
    try {
      const { data } = await api.get<{ url: string }>(`/projects/${projectId}/files/${file.id}/url`)
      window.open(data.url, '_blank')
    } catch {
      alert('Error al descargar archivo')
    }
  }

  const deleteFile = async (fileId: string) => {
    if (!confirm('¿Eliminar este archivo?')) return
    try {
      await api.delete(`/projects/${projectId}/files/${fileId}`)
      loadFiles()
    } catch {
      alert('Error al eliminar archivo')
    }
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="h-7 w-36 bg-gray-200 rounded-lg animate-pulse" />
          <div className="flex gap-3">
            <div className="h-9 w-32 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-9 w-36 bg-blue-100 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gray-200 animate-pulse" />
                <div className="flex-1">
                  <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-1" />
                  <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.files')}</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          >
            {categoryOptions.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Subir Archivo
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">No hay archivos en este proyecto</p>
          <p className="text-sm text-gray-400">Sube planos, memorias, fotos y otros documentos</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Categoría</th>
                <th className="px-4 py-3 text-right">Tamaño</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const Icon = fileIcons[file.file_type] || File
                return (
                  <tr key={file.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate max-w-xs">{file.original_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 uppercase">{file.file_type}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {categoryLabels[file.category] || file.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">{formatFileSize(file.file_size)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(file.imported_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => downloadFile(file)} className="p-1 text-gray-400 hover:text-blue-600 rounded transition" title="Descargar">
                          <Download className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteFile(file.id)} className="p-1 text-gray-400 hover:text-red-500 rounded transition" title="Eliminar">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
