'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useNotificationStore } from '@/stores/notificationStore'
import api from '@/lib/api'
import {
  Plus, MapPin, User, Calendar, Loader2, FolderOpen, Trash2, Search,
  Phone, Folder, Building2, Library, Truck, Settings, BookOpen, Hash, BarChart3, ArrowLeftRight,
  AlertTriangle, Save, GitBranch, LayoutGrid, List,
} from 'lucide-react'

type ViewMode = 'grid' | 'list'
type StatusFilter = 'all' | 'active' | 'paused' | 'completed' | 'archived'

const VIEW_STORAGE_KEY = 'cg-projects-view'
const STATUS_FILTER_STORAGE_KEY = 'cg-projects-status-filter'
import Link from 'next/link'
import { FolderPicker } from '@/components/ui/FolderPicker'
import { formatDate } from '@/lib/utils'

export default function AdminDashboardPage() {
  const router = useRouter()
  const { user, organizationId } = useAuthStore()
  const { projects, loading, loadProjects, createProject, deleteProject, updateProject } = useProjectStore()
  const settings = useSettingsStore()
  const { addToast } = useNotificationStore()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [creating, setCreating] = useState(false)
  const [savingPath, setSavingPath] = useState(false)
  const [tempFolderPath, setTempFolderPath] = useState('')
  const [stats, setStats] = useState({ partidas: 0, chapters: 0, suppliers: 0 })
  const [newProject, setNewProject] = useState({
    name: '', client_name: '', client_contact: '', location: '',
    address: '', city: '', province: '', postal_code: '',
    country: '', start_date: new Date().toISOString().split('T')[0], end_date: '', description: '',
  })

  const slugify = (text: string) =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '-')

  const defaultFolderPath = settings.defaults.default_folder_path

  useEffect(() => {
    loadProjects()
    loadStats()
    if (organizationId) settings.loadSettings(organizationId)
  }, [organizationId])

  useEffect(() => {
    const storedView = localStorage.getItem(VIEW_STORAGE_KEY)
    if (storedView === 'grid' || storedView === 'list') setViewMode(storedView)
    const storedFilter = localStorage.getItem(STATUS_FILTER_STORAGE_KEY)
    if (storedFilter === 'all' || storedFilter === 'active' || storedFilter === 'paused' || storedFilter === 'completed' || storedFilter === 'archived') {
      setStatusFilter(storedFilter)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    localStorage.setItem(STATUS_FILTER_STORAGE_KEY, statusFilter)
  }, [statusFilter])

  const loadStats = async () => {
    try {
      const [libRes, supRes] = await Promise.all([
        api.get('/library/partidas/grouped').catch(() => ({ data: { chapters: [], orphans: [] } })),
        api.get('/suppliers').catch(() => ({ data: [] })),
      ])
      const libData = libRes.data as { chapters: { partidas: unknown[] }[]; orphans: unknown[] }
      const totalPartidas = libData.chapters.reduce((sum: number, ch: { partidas: unknown[] }) => sum + ch.partidas.length, 0) + libData.orphans.length
      setStats({
        partidas: totalPartidas,
        chapters: libData.chapters.length,
        suppliers: Array.isArray(supRes.data) ? supRes.data.length : 0,
      })
    } catch {
      // Silently fail
    }
  }

  const handleSaveFolderPath = async () => {
    if (!organizationId || !tempFolderPath.trim()) return
    setSavingPath(true)
    try {
      settings.updateDefaults('default_folder_path', tempFolderPath.trim())
      await settings.saveSettings(organizationId)
      addToast('success', 'Ruta de almacenamiento guardada')
    } catch {
      addToast('error', 'Error al guardar la ruta')
    } finally {
      setSavingPath(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!defaultFolderPath) {
      addToast('warning', 'Configura la ruta de almacenamiento antes de crear un proyecto')
      return
    }
    setCreating(true)
    try {
      const projectSlug = slugify(newProject.name)
      const basePath = defaultFolderPath.replace(/[/\\]+$/, '')
      const folderPath = `${basePath}/${projectSlug}`

      const project = await createProject({
        name: newProject.name,
        client_name: newProject.client_name || undefined,
        location: newProject.location || undefined,
        description: newProject.description || undefined,
        address: newProject.address || undefined,
        city: newProject.city || undefined,
        province: newProject.province || undefined,
        postal_code: newProject.postal_code || undefined,
        country: newProject.country || undefined,
        start_date: newProject.start_date || undefined,
        end_date: newProject.end_date || undefined,
        folder_path: folderPath,
      })
      setShowCreate(false)
      resetForm()
      addToast('success', 'Proyecto creado correctamente')
      router.push(`/project/${project.id}`)
    } catch {
      addToast('error', 'Error al crear el proyecto')
    } finally {
      setCreating(false)
    }
  }

  const resetForm = () => {
    setNewProject({ name: '', client_name: '', client_contact: '', location: '', address: '', city: '', province: '', postal_code: '', country: '', start_date: new Date().toISOString().split('T')[0], end_date: '', description: '' })
    setTempFolderPath('')
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) {
      try {
        await deleteProject(id)
        addToast('success', 'Proyecto eliminado')
      } catch {
        addToast('error', 'Error al eliminar el proyecto')
      }
    }
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
    archived: 'bg-gray-100 text-gray-500',
  }

  const statusLabels: Record<string, string> = {
    active: 'Activo',
    paused: 'Pausado',
    completed: 'Completado',
    archived: 'Archivado',
  }

  const ownProjects = projects.filter(p => !p.source)
  const branchProjects = projects.filter(p => p.source === 'branch')

  const matchesSearch = (p: typeof projects[number]) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      (p.client_name && p.client_name.toLowerCase().includes(q)) ||
      (p.location && p.location.toLowerCase().includes(q)) ||
      (p.city && p.city.toLowerCase().includes(q))
    )
  }

  const matchesStatus = (p: typeof projects[number]) =>
    statusFilter === 'all' || p.status === statusFilter

  const filtered = ownProjects.filter((p) => matchesSearch(p) && matchesStatus(p))

  const filteredBranch = branchProjects.filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      (p.branch_org_name && p.branch_org_name.toLowerCase().includes(q)) ||
      (p.client_name && p.client_name.toLowerCase().includes(q))
    )
  })

  const statusCounts = {
    all: ownProjects.length,
    active: ownProjects.filter(p => p.status === 'active').length,
    paused: ownProjects.filter(p => p.status === 'paused').length,
    completed: ownProjects.filter(p => p.status === 'completed').length,
    archived: ownProjects.filter(p => p.status === 'archived').length,
  }
  const activeProjects = statusCounts.active

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Hola, {user?.full_name?.split(' ')[0] || 'Admin'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">Panel de administración</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FolderOpen className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Proyectos activos</p>
              <p className="text-xl font-bold text-gray-900">{activeProjects}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Hash className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Partidas en biblioteca</p>
              <p className="text-xl font-bold text-gray-900">{stats.partidas}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <BarChart3 className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Capítulos</p>
              <p className="text-xl font-bold text-gray-900">{stats.chapters}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <Truck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Proveedores</p>
              <p className="text-xl font-bold text-gray-900">{stats.suppliers}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <Link
          href="/admin/library"
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition group"
        >
          <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition">
            <Library className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Biblioteca</p>
            <p className="text-xs text-gray-400">Partidas y materiales</p>
          </div>
        </Link>
        <Link
          href="/admin/suppliers"
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-green-300 hover:shadow-md transition group"
        >
          <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200 transition">
            <Truck className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Proveedores</p>
            <p className="text-xs text-gray-400">Gestionar proveedores</p>
          </div>
        </Link>
        <Link
          href="/admin/settings"
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition group"
        >
          <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition">
            <Settings className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Configuración</p>
            <p className="text-xs text-gray-400">Empresa y ajustes</p>
          </div>
        </Link>
        <Link
          href="/admin/suppliers?tab=compare"
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-amber-300 hover:shadow-md transition group"
        >
          <div className="p-2 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition">
            <ArrowLeftRight className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Comparar Precios</p>
            <p className="text-xs text-gray-400">Materiales equivalentes</p>
          </div>
        </Link>
        <button
          onClick={() => { resetForm(); setShowCreate(true) }}
          className="flex items-center gap-3 p-4 bg-blue-600 rounded-xl border border-blue-500 hover:bg-blue-700 active:bg-blue-800 hover:shadow-md transition group text-left"
        >
          <div className="p-2 bg-blue-500 rounded-lg">
            <Plus className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Nuevo Proyecto</p>
            <p className="text-xs text-blue-200">Crear proyecto</p>
          </div>
        </button>
      </div>

      {/* Projects Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Proyectos</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              {filtered.length} de {ownProjects.length}
            </span>
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded transition ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Vista tarjetas"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Vista lista"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {ownProjects.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar proyectos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm bg-white"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { key: 'all', label: 'Todos' },
                { key: 'active', label: 'Activos' },
                { key: 'paused', label: 'Pausados' },
                { key: 'completed', label: 'Completados' },
                { key: 'archived', label: 'Archivados' },
              ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition border ${
                    statusFilter === key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {label} <span className={`ml-1 ${statusFilter === key ? 'text-blue-100' : 'text-gray-400'}`}>{statusCounts[key]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No hay proyectos</p>
          <p className="text-gray-400 text-sm mt-1 mb-4">Crea tu primer proyecto para comenzar</p>
          <button
            onClick={() => { resetForm(); setShowCreate(true) }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
          >
            <Plus className="w-4 h-4" /> Nuevo Proyecto
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            {search
              ? <>No se encontraron proyectos para &quot;{search}&quot;</>
              : <>No hay proyectos en este estado</>}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Nombre</th>
                  <th className="text-left font-medium px-4 py-2.5">Cliente</th>
                  <th className="text-left font-medium px-4 py-2.5">Ubicación</th>
                  <th className="text-left font-medium px-4 py-2.5">Estado</th>
                  <th className="text-left font-medium px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((project) => (
                  <tr
                    key={project.id}
                    onClick={() => router.push(`/project/${project.id}`)}
                    className="hover:bg-blue-50/40 cursor-pointer group transition"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 group-hover:text-blue-600">{project.name}</td>
                    <td className="px-4 py-3 text-gray-600">{project.client_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {[project.address, project.city, project.province].filter(Boolean).join(', ') || project.location || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={project.status}
                        onChange={async (e) => {
                          e.stopPropagation()
                          const newStatus = e.target.value as 'active' | 'paused' | 'completed' | 'archived'
                          try {
                            await updateProject(project.id, { status: newStatus })
                            addToast('success', `Estado cambiado a ${statusLabels[newStatus]}`)
                          } catch {
                            addToast('error', 'Error al cambiar el estado')
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap border-0 cursor-pointer outline-none ${statusColors[project.status]}`}
                      >
                        <option value="active">Activo</option>
                        <option value="paused">Pausado</option>
                        <option value="completed">Completado</option>
                        <option value="archived">Archivado</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(project.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => handleDelete(project.id, e)}
                        className="p-1.5 text-red-300 hover:text-white hover:bg-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="Eliminar proyecto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => (
            <div
              key={project.id}
              onClick={() => router.push(`/project/${project.id}`)}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-blue-200 transition cursor-pointer group relative"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition line-clamp-2">
                  {project.name}
                </h3>
                <select
                  value={project.status}
                  onChange={async (e) => {
                    e.stopPropagation()
                    const newStatus = e.target.value as 'active' | 'paused' | 'completed' | 'archived'
                    try {
                      await updateProject(project.id, { status: newStatus })
                      addToast('success', `Estado cambiado a ${statusLabels[newStatus]}`)
                    } catch {
                      addToast('error', 'Error al cambiar el estado')
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ml-2 border-0 cursor-pointer outline-none ${statusColors[project.status]}`}
                >
                  <option value="active">Activo</option>
                  <option value="paused">Pausado</option>
                  <option value="completed">Completado</option>
                  <option value="archived">Archivado</option>
                </select>
              </div>

              {project.client_name && (
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{project.client_name}</span>
                </div>
              )}

              {(project.address || project.city || project.location) && (
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {[project.address, project.city, project.province].filter(Boolean).join(', ') || project.location}
                  </span>
                </div>
              )}

              {project.client_contact && (
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{project.client_contact}</span>
                </div>
              )}

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formatDate(project.created_at)}</span>
                </div>
                <button
                  onClick={(e) => handleDelete(project.id, e)}
                  className="p-1.5 text-red-300 hover:text-white hover:bg-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  title="Eliminar proyecto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Branch Projects */}
      {filteredBranch.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-purple-600" />
            Proyectos de sucursales
          </h2>
          {viewMode === 'list' ? (
            <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-purple-50 text-xs uppercase tracking-wider text-purple-700">
                    <tr>
                      <th className="text-left font-medium px-4 py-2.5">Nombre</th>
                      <th className="text-left font-medium px-4 py-2.5">Sucursal</th>
                      <th className="text-left font-medium px-4 py-2.5">Cliente</th>
                      <th className="text-left font-medium px-4 py-2.5">Ubicación</th>
                      <th className="text-left font-medium px-4 py-2.5">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-50">
                    {filteredBranch.map((project) => (
                      <tr
                        key={project.id}
                        onClick={() => router.push(`/project/${project.id}`)}
                        className="hover:bg-purple-50/40 cursor-pointer group transition"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 group-hover:text-purple-600">{project.name}</td>
                        <td className="px-4 py-3 text-purple-600">{project.branch_org_name}</td>
                        <td className="px-4 py-3 text-gray-600">{project.client_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {[project.address, project.city, project.province].filter(Boolean).join(', ') || project.location || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(project.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBranch.map((project) => (
              <div
                key={project.id}
                onClick={() => router.push(`/project/${project.id}`)}
                className="bg-white rounded-xl border border-purple-200 p-5 hover:shadow-lg hover:border-purple-300 transition cursor-pointer group relative"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 group-hover:text-purple-600 transition line-clamp-2">
                    {project.name}
                  </h3>
                  <span className="text-xs px-2 py-1 rounded-full font-medium bg-purple-100 text-purple-700 whitespace-nowrap ml-2 flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    Sucursal
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm text-purple-600 mb-1">
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{project.branch_org_name}</span>
                </div>

                {project.client_name && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{project.client_name}</span>
                  </div>
                )}

                {(project.address || project.city || project.location) && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {[project.address, project.city, project.province].filter(Boolean).join(', ') || project.location}
                    </span>
                  </div>
                )}

                <div className="flex items-center mt-3 pt-3 border-t border-gray-100 text-sm text-gray-400">
                  <Calendar className="w-3.5 h-3.5 mr-2" />
                  <span>{formatDate(project.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-1">Nuevo Proyecto</h2>
            <p className="text-sm text-gray-500 mb-5">Completa la información del proyecto</p>
            <form onSubmit={handleCreate} className="space-y-5">
              {/* General */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" /> Información General
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del proyecto *</label>
                    <input
                      type="text" value={newProject.name}
                      onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      placeholder="Reforma vivienda C/ Mayor 15" required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                    <textarea
                      value={newProject.description}
                      onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                      rows={2} placeholder="Descripción breve del proyecto..."
                    />
                  </div>
                </div>
              </div>
              {/* Client */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-green-500" /> Cliente
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del cliente</label>
                    <input type="text" value={newProject.client_name}
                      onChange={(e) => setNewProject({ ...newProject, client_name: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      placeholder="Nombre del cliente" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contacto</label>
                    <input type="text" value={newProject.client_contact}
                      onChange={(e) => setNewProject({ ...newProject, client_contact: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      placeholder="Teléfono o email" />
                  </div>
                </div>
              </div>
              {/* Location */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-red-500" /> Ubicación
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                    <input type="text" value={newProject.address}
                      onChange={(e) => setNewProject({ ...newProject, address: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      placeholder="C/ Mayor 15, 2ºB" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                      <input type="text" value={newProject.city}
                        onChange={(e) => setNewProject({ ...newProject, city: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        placeholder="Madrid" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
                      <input type="text" value={newProject.province}
                        onChange={(e) => setNewProject({ ...newProject, province: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        placeholder="Madrid" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">C.P.</label>
                      <input type="text" value={newProject.postal_code}
                        onChange={(e) => setNewProject({ ...newProject, postal_code: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        placeholder="28001" />
                    </div>
                  </div>
                </div>
              </div>
              {/* Storage path */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-orange-500" /> Almacenamiento
                </h3>
                {defaultFolderPath ? (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">Carpeta del proyecto (auto-generada)</p>
                    <p className="text-sm font-mono text-gray-700 truncate">
                      {newProject.name
                        ? `${defaultFolderPath.replace(/[/\\]+$/, '')}/${slugify(newProject.name)}`
                        : `${defaultFolderPath.replace(/[/\\]+$/, '')}/...`
                      }
                    </p>
                  </div>
                ) : (
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">No hay ruta de almacenamiento configurada</p>
                        <p className="text-xs text-amber-600 mt-0.5">Configura una ruta base para guardar los archivos de los proyectos.</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <FolderPicker
                        value={tempFolderPath}
                        onChange={setTempFolderPath}
                        placeholder="C:/Proyectos/ConstruGest"
                      />
                      <button
                        type="button"
                        onClick={handleSaveFolderPath}
                        disabled={savingPath || !tempFolderPath.trim()}
                        className="w-full px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {savingPath ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Guardar como ruta predeterminada
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Dates */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-500" /> Fechas
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
                    <input type="date" value={newProject.start_date}
                      onChange={(e) => setNewProject({ ...newProject, start_date: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de fin</label>
                    <input type="date" value={newProject.end_date}
                      onChange={(e) => setNewProject({ ...newProject, end_date: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                  </div>
                </div>
              </div>
              {/* Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition">
                  Cancelar
                </button>
                <button type="submit" disabled={creating}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 flex items-center gap-2">
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Crear Proyecto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
