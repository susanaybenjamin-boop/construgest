'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/stores/projectStore'
import { useNotificationStore } from '@/stores/notificationStore'
import {
  Save, Loader2, FileText, FolderOpen, Folder, ExternalLink
} from 'lucide-react'
import Link from 'next/link'

export default function SettingsPage() {
  const { t } = useTranslation()
  const params = useParams()
  const projectId = params.id as string
  const { activeProject, updateProject } = useProjectStore()
  const { addToast } = useNotificationStore()

  const [saving, setSaving] = useState(false)
  const [projectForm, setProjectForm] = useState({
    name: activeProject?.name || '',
    client_name: activeProject?.client_name || '',
    client_contact: activeProject?.client_contact || '',
    location: activeProject?.location || '',
    address: activeProject?.address || '',
    city: activeProject?.city || '',
    province: activeProject?.province || '',
    postal_code: activeProject?.postal_code || '',
    country: activeProject?.country || '',
    start_date: activeProject?.start_date || '',
    end_date: activeProject?.end_date || '',
    description: activeProject?.description || '',
    status: activeProject?.status || 'active',
    folder_path: activeProject?.folder_path || '',
  })

  const handleSaveProject = async () => {
    setSaving(true)
    try {
      await updateProject(projectId, projectForm)
      addToast('success', 'Datos del proyecto guardados')
    } catch {
      addToast('error', 'Error al guardar datos del proyecto')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition'

  return (
    <div>
      {/* Header — sticky */}
      <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('nav.settings')}</h1>
            <p className="text-sm text-gray-500 mt-1">Datos del proyecto y del cliente</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/settings"
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl transition"
            >
              <ExternalLink className="w-4 h-4" />
              Config. Empresa / IA
            </Link>
            <button
              onClick={handleSaveProject}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl transition shadow-sm disabled:opacity-50 font-medium text-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar cambios
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        {/* ─── Datos del Proyecto ─── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Datos del Proyecto</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del proyecto *</label>
              <input type="text" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
              <textarea value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} className={`${inputClass} resize-none`} rows={3} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select value={projectForm.status} onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value as 'active' | 'paused' | 'completed' | 'archived' })} className={inputClass}>
                <option value="active">Activo</option>
                <option value="paused">Pausado</option>
                <option value="completed">Completado</option>
                <option value="archived">Archivado</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
                <input type="date" value={projectForm.start_date} onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de fin</label>
                <input type="date" value={projectForm.end_date} onChange={(e) => setProjectForm({ ...projectForm, end_date: e.target.value })} className={inputClass} />
              </div>
            </div>

            {/* Location */}
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Ubicacion</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Direccion</label>
                  <input type="text" value={projectForm.address} onChange={(e) => setProjectForm({ ...projectForm, address: e.target.value })} className={inputClass} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                    <input type="text" value={projectForm.city} onChange={(e) => setProjectForm({ ...projectForm, city: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
                    <input type="text" value={projectForm.province} onChange={(e) => setProjectForm({ ...projectForm, province: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">C.P.</label>
                    <input type="text" value={projectForm.postal_code} onChange={(e) => setProjectForm({ ...projectForm, postal_code: e.target.value })} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pais</label>
                  <input type="text" value={projectForm.country} onChange={(e) => setProjectForm({ ...projectForm, country: e.target.value })} className={inputClass} placeholder="Espana" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Datos del Cliente ─── */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <h2 className="text-lg font-semibold text-gray-900">Datos del Cliente</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del cliente</label>
                <input type="text" value={projectForm.client_name} onChange={(e) => setProjectForm({ ...projectForm, client_name: e.target.value })} className={inputClass} placeholder="Juan Perez / Empresa S.L." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contacto (telefono/email)</label>
                <input type="text" value={projectForm.client_contact} onChange={(e) => setProjectForm({ ...projectForm, client_contact: e.target.value })} className={inputClass} placeholder="600 123 456 / cliente@email.com" />
              </div>
            </div>
          </div>

          {/* ─── Carpeta del Proyecto ─── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Folder className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-gray-900">Carpeta del Proyecto</h2>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={projectForm.folder_path}
                onChange={(e) => setProjectForm({ ...projectForm, folder_path: e.target.value })}
                className={`${inputClass} flex-1`}
                placeholder="C:\Proyectos\Mi Proyecto"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    if ('showDirectoryPicker' in window) {
                      const handle = await (window as any).showDirectoryPicker()
                      setProjectForm({ ...projectForm, folder_path: handle.name })
                    } else {
                      addToast('info', 'Tu navegador no soporta el selector de carpetas. Escribe la ruta manualmente.')
                    }
                  } catch {
                    // User cancelled
                  }
                }}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition flex items-center gap-2 text-sm font-medium whitespace-nowrap"
              >
                <FolderOpen className="w-4 h-4" />
                Explorar
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Ruta de la carpeta donde guardas los archivos del proyecto en tu equipo</p>
          </div>

          {/* Info note */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <p className="text-sm text-blue-700">
              Los datos de empresa (emisor), configuracion de IA y valores por defecto se gestionan desde la{' '}
              <Link href="/admin/settings" className="font-medium underline hover:text-blue-900">
                Configuracion General
              </Link>
              {' '}y se aplican a todos los proyectos.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
