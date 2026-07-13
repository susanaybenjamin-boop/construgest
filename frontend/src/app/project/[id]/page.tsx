'use client'

import { useEffect, useState } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import type { Budget, FullBudget, ProjectFile, CertificationOverview } from '@/types'
import {
  Calculator, Map, Award, Wallet, FileText, TrendingUp,
  Library, Brain, Loader2, User, MapPin, Calendar,
  Clock, CheckCircle2, Lock, ClipboardCheck, Banknote
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

export default function ProjectDashboard() {
  const { t } = useTranslation()
  const params = useParams()
  const projectId = params.id as string
  const { activeProject } = useProjectStore()

  const [financials, setFinancials] = useState({
    budgetTotal: 0,
    certified: 0,
    expenses: 0,
    costLabor: 0,
    costMaterials: 0,
    costEquipment: 0,
    costInvoices: 0,
    margin: 0,
    marginPct: 0,
    completionPct: 0,
    budgetCount: 0,
    certCount: 0,
    fileCount: 0,
    budgetName: '',
  })
  const [recentFiles, setRecentFiles] = useState<ProjectFile[]>([])
  const [certOverview, setCertOverview] = useState<CertificationOverview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [projectId])

  const loadDashboardData = async () => {
    setLoading(true)
    try {
      // Load all data in parallel
      const [budgetsRes, filesRes, certsRes, costSummaryRes] = await Promise.allSettled([
        api.get<Budget[]>(`/budgets/project/${projectId}`),
        api.get<ProjectFile[]>(`/projects/${projectId}/files`),
        api.get<CertificationOverview[]>(`/certifications/project/${projectId}/overview`),
        api.get<{ by_category: { labor: number; materials: number; equipment: number; expenses: number; total: number } }>(
          `/work-logs/project/${projectId}/cost-summary`
        ),
      ])

      const budgets = budgetsRes.status === 'fulfilled' ? budgetsRes.value.data : []
      const files = filesRes.status === 'fulfilled' ? filesRes.value.data : []
      const certs = certsRes.status === 'fulfilled' ? certsRes.value.data : []
      const costSummary = costSummaryRes.status === 'fulfilled'
        ? costSummaryRes.value.data
        : { by_category: { labor: 0, materials: 0, equipment: 0, expenses: 0, total: 0 } }

      // Calculate budget total from the first (main) budget
      let budgetTotal = 0
      let budgetName = ''
      if (budgets.length > 0) {
        budgetName = budgets[0].name
        try {
          const { data: full } = await api.get<FullBudget>(`/budgets/${budgets[0].id}/full`)
          budgetTotal = full.chapters.reduce((sum, ch) => {
            if (ch.chapter.is_active === false) return sum
            return sum + ch.items.reduce(
              (s, item) => item.is_active === false ? s : s + item.quantity * item.unit_price, 0,
            )
          }, 0)
        } catch { /* ignore */ }
      }

      // Total coste real = facturas + mano de obra + materiales + maquinaria de partes de trabajo
      // cost-summary.by_category.expenses ya incluye todas las facturas del proyecto,
      // así que usamos el total que ya combina todo sin doble conteo.
      const cat = costSummary.by_category
      const realCostTotal = cat.total
      const certifiedTotal = Array.isArray(certs)
        ? certs.reduce((sum, c) => sum + (c.current_amount || 0), 0) : 0

      const margin = certifiedTotal - realCostTotal
      const marginPct = certifiedTotal > 0 ? (margin / certifiedTotal) * 100 : 0
      const completionPct = budgetTotal > 0 ? (certifiedTotal / budgetTotal) * 100 : 0

      setFinancials({
        budgetTotal,
        certified: certifiedTotal,
        expenses: realCostTotal,
        costLabor: cat.labor,
        costMaterials: cat.materials,
        costEquipment: cat.equipment,
        costInvoices: cat.expenses,
        margin,
        marginPct,
        completionPct,
        budgetCount: budgets.length,
        certCount: Array.isArray(certs) ? certs.length : 0,
        fileCount: Array.isArray(files) ? files.length : 0,
        budgetName,
      })

      if (Array.isArray(files)) {
        setRecentFiles(files.slice(0, 5))
      }
      if (Array.isArray(certs)) {
        setCertOverview(certs)
      }
    } catch {
      // Dashboard data is optional
    } finally {
      setLoading(false)
    }
  }

  if (!activeProject) return null

  const statusConfig: Record<string, { label: string; color: string }> = {
    active: { label: 'Activo', color: 'bg-green-100 text-green-700 border-green-200' },
    paused: { label: 'Pausado', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    completed: { label: 'Completado', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    archived: { label: 'Archivado', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  }

  const status = statusConfig[activeProject.status] || statusConfig.active

  // Chart data
  const chartData = [
    {
      name: 'Financiero',
      Presupuestado: financials.budgetTotal,
      Certificado: financials.certified,
      'Coste Real': financials.expenses,
    },
  ]

  const formatAxisValue = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M€`
    if (value >= 1000) return `${(value / 1000).toFixed(0)}k€`
    return `${value}€`
  }

  // Group certifications by year
  const certsByYear = certOverview.reduce((acc, cert) => {
    const year = new Date(cert.created_at).getFullYear()
    if (!acc[year]) acc[year] = []
    acc[year].push(cert)
    return acc
  }, {} as Record<number, CertificationOverview[]>)

  const certStatusConfig: Record<string, { icon: typeof Clock; color: string; bg: string }> = {
    draft: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100' },
    submitted: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100' },
    approved: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
    finalized: { icon: Lock, color: 'text-blue-600', bg: 'bg-blue-100' },
  }

  const quickLinks = [
    { label: t('nav.budget'), icon: Calculator, href: `/project/${projectId}/budget`, color: 'bg-blue-500', desc: `${financials.budgetCount} presupuestos` },
    { label: t('nav.plans'), icon: Map, href: `/project/${projectId}/plans`, color: 'bg-emerald-500', desc: 'Planos y anotaciones' },
    { label: t('nav.certifications'), icon: Award, href: `/project/${projectId}/certifications`, color: 'bg-purple-500', desc: `${financials.certCount} certificaciones` },
    { label: t('nav.economic'), icon: Wallet, href: `/project/${projectId}/expenses`, color: 'bg-amber-500', desc: 'Control de gastos' },
    { label: t('nav.files'), icon: FileText, href: `/project/${projectId}/files`, color: 'bg-slate-500', desc: `${financials.fileCount} archivos` },
    { label: 'Biblioteca', icon: Library, href: `/project/${projectId}/library`, color: 'bg-teal-500', desc: 'Materiales y partidas' },
    { label: 'Asistente IA', icon: Brain, href: `/project/${projectId}/ai`, color: 'bg-violet-500', desc: 'Análisis inteligente' },
  ]

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  return (
    <div className="space-y-8">
      {/* ─── Project Header ─── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">{activeProject.name}</h1>
              <span className={`text-xs px-3 py-1 rounded-full font-medium border ${status.color}`}>
                {status.label}
              </span>
            </div>
            {activeProject.description && (
              <p className="text-gray-500 mb-3">{activeProject.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-500">
              {activeProject.client_name && (
                <span className="flex items-center gap-1.5">
                  <User className="w-4 h-4 text-gray-400" />
                  {activeProject.client_name}
                </span>
              )}
              {(activeProject.address || activeProject.city) && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  {[activeProject.address, activeProject.city, activeProject.province].filter(Boolean).join(', ')}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                {formatDate(activeProject.created_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Budget */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Banknote className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium text-gray-500">Presupuesto Aprobado</span>
          </div>
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(financials.budgetTotal)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {financials.budgetName || 'PEM total planificado'}
              </p>
            </>
          )}
        </div>

        {/* Certified */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium text-gray-500">Total Certificado</span>
          </div>
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(financials.certified)}</p>
              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Avance</span>
                  <span className="font-medium text-gray-600">{financials.completionPct.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(financials.completionPct, 100)}%` }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Coste Real (facturas + partes de trabajo) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium text-gray-500">Coste Real</span>
          </div>
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(financials.expenses)}</p>
              <div className="mt-2 space-y-0.5 text-[11px] text-gray-500">
                <div className="flex justify-between">
                  <span>Facturas</span>
                  <span className="font-medium text-gray-700">{formatCurrency(financials.costInvoices)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Mano de obra</span>
                  <span className="font-medium text-gray-700">{formatCurrency(financials.costLabor)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Materiales</span>
                  <span className="font-medium text-gray-700">{formatCurrency(financials.costMaterials)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Maquinaria</span>
                  <span className="font-medium text-gray-700">{formatCurrency(financials.costEquipment)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Margin */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium text-gray-500">Margen Real</span>
          </div>
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          ) : (
            <>
              <p className={`text-2xl font-bold ${financials.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {financials.certified > 0 ? `${financials.marginPct.toFixed(1)}%` : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {financials.certified > 0
                  ? `${formatCurrency(financials.margin)} sobre certificado`
                  : 'Sin certificaciones'}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ─── Main Content Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Financial Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Evolución Financiera</h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
            </div>
          ) : financials.budgetTotal === 0 && financials.certified === 0 && financials.expenses === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
              Sin datos financieros aún
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={formatAxisValue} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} width={80} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Legend wrapperStyle={{ fontSize: '13px' }} />
                <Bar dataKey="Presupuestado" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={32} />
                <Bar dataKey="Certificado" fill="#22c55e" radius={[0, 6, 6, 0]} barSize={32} />
                <Bar dataKey="Coste Real" fill="#f59e0b" radius={[0, 6, 6, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Quick Actions + Recent Files */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Acceso Rápido</h2>
            <div className="grid grid-cols-2 gap-2">
              {quickLinks.slice(0, 6).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition group"
                >
                  <div className={`w-10 h-10 rounded-xl ${link.color} text-white flex items-center justify-center group-hover:scale-110 transition`}>
                    <link.icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-gray-600 text-center">{link.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Files */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Archivos Recientes</h2>
              <Link href={`/project/${projectId}/files`} className="text-xs text-blue-600 hover:underline">
                Ver todos
              </Link>
            </div>
            {recentFiles.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Sin archivos subidos</p>
            ) : (
              <div className="space-y-2">
                {recentFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700 truncate">{file.original_name}</p>
                      <p className="text-xs text-gray-400">{formatFileSize(file.file_size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Certification Progress ─── */}
      {certOverview.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Progreso de Certificaciones</h2>
            <Link href={`/project/${projectId}/certifications`} className="text-xs text-blue-600 hover:underline">
              Ver detalle
            </Link>
          </div>
          {Object.entries(certsByYear)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([year, certs]) => {
              const finalized = certs.filter(c => c.status === 'finalized').length
              return (
                <div key={year} className="mb-6 last:mb-0">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">{year}</h3>
                    <span className="text-xs text-gray-400">
                      {finalized}/{certs.length} finalizadas
                    </span>
                  </div>
                  <div className="space-y-3">
                    {certs.map((cert) => {
                      const statusCfg = certStatusConfig[cert.status] || certStatusConfig.draft
                      const StatusIcon = statusCfg.icon
                      const progress = cert.progress_pct || 0
                      const progressColor =
                        progress >= 100 ? 'bg-green-500' :
                        progress >= 50 ? 'bg-amber-500' :
                        'bg-gray-400'

                      return (
                        <div key={cert.id} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
                          <div className={`w-8 h-8 rounded-lg ${statusCfg.bg} ${statusCfg.color} flex items-center justify-center shrink-0`}>
                            <StatusIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-700 truncate">
                                #{cert.number} {cert.name}
                              </span>
                              <span className="text-sm font-semibold text-gray-900 shrink-0 ml-2">
                                {formatCurrency(cert.total_certified || 0)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div
                                  className={`${progressColor} h-1.5 rounded-full transition-all duration-500`}
                                  style={{ width: `${Math.min(progress, 100)}%` }}
                                />
                              </div>
                              <span className={`text-xs font-medium shrink-0 ${
                                progress >= 100 ? 'text-green-600' :
                                progress >= 50 ? 'text-amber-600' :
                                'text-gray-500'
                              }`}>
                                {progress.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* ─── AI Quick Access ─── */}
      <div className="bg-gradient-to-r from-violet-50 to-blue-50 rounded-2xl border border-violet-200 p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-500 text-white flex items-center justify-center shrink-0">
            <Brain className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">Asistente IA</h3>
            <p className="text-sm text-gray-500">Analiza presupuestos, detecta problemas y optimiza costes con inteligencia artificial</p>
          </div>
          <Link
            href={`/project/${projectId}/ai`}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition shrink-0"
          >
            Abrir IA
          </Link>
        </div>
      </div>
    </div>
  )
}
