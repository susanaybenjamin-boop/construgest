'use client'

import { useEffect, useState, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useTranslation } from 'react-i18next'
import {
  Save, Loader2, Building2, Sliders, Brain, Palette,
  Globe, Percent, DollarSign, Zap,
  Eye, EyeOff, Copy, CheckCircle2, XCircle, Key,
  Printer, Info, FileText, Upload, Trash2, RefreshCw, Image as ImageIcon,
  Lock, User as UserIcon, FolderOpen, Download, UploadCloud, BarChart3,
} from 'lucide-react'
import api from '@/lib/api'
import localApi from '@/lib/localApi'
import { DecimalInput } from '@/components/ui/DecimalInput'
import { FolderPicker } from '@/components/ui/FolderPicker'
import { useProjectStore } from '@/stores/projectStore'

type Tab = 'company' | 'defaults' | 'ai' | 'print' | 'appearance' | 'pdf_styles' | 'account'

interface ConsumptionData {
  total_calls: number
  total_input_tokens: number
  total_output_tokens: number
  by_provider: { provider: string; calls: number; input_tokens: number; output_tokens: number }[]
}

function AIConsumptionPanel() {
  const [data, setData] = useState<ConsumptionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/settings/ai-consumption?period=month')
      .then(({ data: d }) => setData(d as ConsumptionData))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center gap-2 text-gray-400 text-sm py-3"><Loader2 className="w-4 h-4 animate-spin" /> Cargando consumo...</div>
  if (!data || data.total_calls === 0) return <p className="text-sm text-gray-400 py-2">Sin consumo registrado en los últimos 30 días.</p>

  const providerColors: Record<string, string> = { anthropic: 'bg-orange-100 text-orange-700', groq: 'bg-purple-100 text-purple-700', gemini: 'bg-blue-100 text-blue-700' }
  const formatTokens = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-center">
          <p className="text-2xl font-bold text-gray-900">{data.total_calls}</p>
          <p className="text-xs text-gray-500">Llamadas</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-center">
          <p className="text-2xl font-bold text-gray-900">{formatTokens(data.total_input_tokens)}</p>
          <p className="text-xs text-gray-500">Tokens entrada</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-center">
          <p className="text-2xl font-bold text-gray-900">{formatTokens(data.total_output_tokens)}</p>
          <p className="text-xs text-gray-500">Tokens salida</p>
        </div>
      </div>
      {data.by_provider.length > 0 && (
        <div className="space-y-1.5">
          {data.by_provider.map((p) => (
            <div key={p.provider} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100 bg-white">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${providerColors[p.provider] || 'bg-gray-100 text-gray-700'}`}>
                  {p.provider}
                </span>
                <span className="text-sm text-gray-600">{p.calls} llamadas</span>
              </div>
              <span className="text-xs text-gray-400">{formatTokens(p.input_tokens + p.output_tokens)} tokens</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminSettingsPage() {
  const { t, i18n } = useTranslation()
  const { user, organizationId, checkAuth, isSuperAdmin } = useAuthStore()
  const settings = useSettingsStore()
  const { projects, loadProjects } = useProjectStore()
  const { addToast } = useNotificationStore()

  const [activeTab, setActiveTab] = useState<Tab>('company')
  const [saving, setSaving] = useState(false)

  // ── Password change state ──
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)

  // ── Logo state ──
  const [logoUrl, setLogoUrl] = useState<string>('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // ── API Key UI state ──
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({
    anthropic_api_key: false,
    groq_api_key: false,
    gemini_api_key: false,
  })
  const [verifying, setVerifying] = useState<Record<string, boolean>>({})
  const [verifyResult, setVerifyResult] = useState<Record<string, { valid: boolean; message: string } | null>>({})
  const [copied, setCopied] = useState<string | null>(null)

  // ── PDF preview state ──
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false)

  // ── Sync folders & backup state ──
  const [syncingFolders, setSyncingFolders] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [verifyingPath, setVerifyingPath] = useState(false)
  const [pathVerification, setPathVerification] = useState<{ valid: boolean; message: string } | null>(null)

  useEffect(() => {
    checkAuth()
    loadProjects()
  }, [])

  useEffect(() => {
    if (organizationId) {
      settings.loadSettings(organizationId)
    }
  }, [organizationId])

  // Sync logo URL from store when settings load
  useEffect(() => {
    if (settings.company.company_logo_url) {
      setLogoUrl(settings.company.company_logo_url)
    }
  }, [settings.company.company_logo_url])

  // Generate PDF preview when on pdf_styles tab (debounced 600ms)
  useEffect(() => {
    if (activeTab !== 'pdf_styles') return
    setPdfPreviewLoading(true)
    const timer = setTimeout(async () => {
      try {
        const { generateSamplePdfBlob } = await import('@/services/samplePdfPreview')
        const blob = await generateSamplePdfBlob(settings.pdf_styles)
        const url = URL.createObjectURL(blob)
        setPdfPreviewUrl(prev => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      } catch (err) {
        console.error('Error generating PDF preview:', err)
      } finally {
        setPdfPreviewLoading(false)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [activeTab, settings.pdf_styles])

  // Cleanup PDF preview URL on unmount
  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Logo handlers ──
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !organizationId) return
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('logo', file)
      formData.append('organization_id', organizationId)
      const { data } = await api.post('/settings/logo/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const url = (data as { url: string }).url
      setLogoUrl(url)
      settings.updateCompany('company_logo_url', url)
      addToast('success', 'Logo subido correctamente')
    } catch {
      addToast('error', 'Error al subir el logo')
    } finally {
      setUploadingLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const handleLogoDelete = async () => {
    if (!organizationId) return
    setUploadingLogo(true)
    try {
      await api.delete(`/settings/logo?organization_id=${organizationId}`)
      setLogoUrl('')
      settings.updateCompany('company_logo_url', '')
      addToast('success', 'Logo eliminado')
    } catch {
      addToast('error', 'Error al eliminar el logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleSave = async () => {
    if (!organizationId) return
    setSaving(true)
    try {
      await settings.saveSettings(organizationId)
      addToast('success', 'Configuracion guardada correctamente')
    } catch {
      addToast('error', 'Error al guardar la configuracion')
    } finally {
      setSaving(false)
    }
  }

  // ── API Key handlers ──
  const toggleKeyVisibility = (field: string) => {
    setShowKeys(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const copyToClipboard = async (field: string) => {
    const value = settings.ai[field as keyof typeof settings.ai] as string
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  const verifyKey = async (provider: string, keyField: string) => {
    const apiKey = settings.ai[keyField as keyof typeof settings.ai] as string
    if (!apiKey || apiKey.includes('••••')) {
      addToast('warning', 'Introduce una API key nueva antes de verificar')
      return
    }
    setVerifying(prev => ({ ...prev, [keyField]: true }))
    setVerifyResult(prev => ({ ...prev, [keyField]: null }))
    try {
      const { data } = await api.post('/settings/verify-ai-key', {
        provider,
        api_key: apiKey,
      })
      setVerifyResult(prev => ({ ...prev, [keyField]: data }))
      addToast(data.valid ? 'success' : 'error', data.message)
    } catch {
      setVerifyResult(prev => ({ ...prev, [keyField]: { valid: false, message: 'Error de conexion' } }))
      addToast('error', 'Error al verificar la API key')
    } finally {
      setVerifying(prev => ({ ...prev, [keyField]: false }))
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Building2; desc: string }[] = [
    { id: 'company', label: 'Empresa / Emisor', icon: Building2, desc: 'Datos de la empresa que aparecen en los documentos' },
    { id: 'defaults', label: 'Valores por Defecto', icon: Sliders, desc: 'IVA y moneda por defecto' },
    ...(isSuperAdmin ? [{ id: 'ai' as Tab, label: 'Inteligencia Artificial', icon: Brain, desc: 'Proveedores de IA y API keys' }] : []),
    { id: 'print', label: 'Impresion', icon: Printer, desc: 'Formato, orientacion y margenes' },
    { id: 'appearance', label: 'Apariencia', icon: Palette, desc: 'Idioma y tema visual' },
    { id: 'pdf_styles', label: 'Estilos PDF', icon: FileText, desc: 'Colores, fuentes y maquetacion de PDFs' },
    { id: 'account', label: 'Mi Cuenta', icon: UserIcon, desc: 'Contraseña y datos personales' },
  ]

  const inputClass = 'w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition'

  return (
    <div>
      {/* Header — sticky */}
      <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
            <p className="text-gray-500 text-sm mt-1">Ajustes de la organización - se aplican a todos los proyectos</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl transition shadow-sm disabled:opacity-50 font-medium text-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar cambios
          </button>
        </div>
      </div>

      <div>
        <div className="flex gap-8">
          {/* Sidebar Tabs */}
          <div className="w-64 shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-100 border border-transparent'
                  }`}
                >
                  <tab.icon className={`w-5 h-5 mt-0.5 shrink-0 ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div>
                    <p className="text-sm font-medium">{tab.label}</p>
                    <p className={`text-xs mt-0.5 ${activeTab === tab.id ? 'text-blue-500' : 'text-gray-400'}`}>{tab.desc}</p>
                  </div>
                </button>
              ))}
            </nav>

            <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <p className="text-xs text-amber-700">
                Estos ajustes se comparten entre todos tus proyectos. Los datos del cliente se configuran individualmente en cada proyecto.
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* ─── Tab: Empresa ─── */}
            {activeTab === 'company' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Datos de la Empresa / Emisor</h2>
                <p className="text-sm text-gray-500 mb-5">Esta informacion aparecera en los PDFs de presupuestos y certificaciones.</p>

                {/* ── Logo Section ── */}
                <div className="mb-6 pb-6 border-b border-gray-100">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    <ImageIcon className="w-4 h-4 inline mr-1.5 text-gray-400" />
                    Logo de empresa
                  </label>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  {logoUrl ? (
                    <div className="flex items-start gap-4">
                      <div className="relative group">
                        <div className="w-40 h-24 rounded-xl border-2 border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={logoUrl}
                            alt="Logo de empresa"
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 pt-1">
                        <button
                          onClick={() => logoInputRef.current?.click()}
                          disabled={uploadingLogo}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition disabled:opacity-50"
                        >
                          {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Sustituir
                        </button>
                        <button
                          onClick={handleLogoDelete}
                          disabled={uploadingLogo}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Limpiar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="w-full max-w-sm h-24 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 hover:bg-gray-100/50 hover:border-gray-400 transition flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:text-gray-500 disabled:opacity-50"
                    >
                      {uploadingLogo ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <>
                          <Upload className="w-6 h-6" />
                          <span className="text-xs font-medium">Subir logo de empresa</span>
                          <span className="text-[10px]">PNG, JPG, SVG (max 5MB)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de empresa</label>
                      <input type="text" value={settings.company.company_name} onChange={(e) => settings.updateCompany('company_name', e.target.value)} className={inputClass} placeholder="Mi Empresa S.L." />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CIF / NIF</label>
                      <input type="text" value={settings.company.company_cif} onChange={(e) => settings.updateCompany('company_cif', e.target.value)} className={inputClass} placeholder="B12345678" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">N. Colegiado / Profesional</label>
                      <input type="text" value={settings.company.company_professional_number} onChange={(e) => settings.updateCompany('company_professional_number', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                      <input type="text" value={settings.company.company_iban} onChange={(e) => settings.updateCompany('company_iban', e.target.value)} className={inputClass} placeholder="ES91 2100 0418 4502 0005 1332" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Direccion</label>
                    <input type="text" value={settings.company.company_address} onChange={(e) => settings.updateCompany('company_address', e.target.value)} className={inputClass} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                      <input type="text" value={settings.company.company_city} onChange={(e) => settings.updateCompany('company_city', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
                      <input type="text" value={settings.company.company_province} onChange={(e) => settings.updateCompany('company_province', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Codigo Postal</label>
                      <input type="text" value={settings.company.company_postal_code} onChange={(e) => settings.updateCompany('company_postal_code', e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
                      <input type="tel" value={settings.company.company_phone} onChange={(e) => settings.updateCompany('company_phone', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input type="email" value={settings.company.company_email} onChange={(e) => settings.updateCompany('company_email', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Web</label>
                      <input type="url" value={settings.company.company_web} onChange={(e) => settings.updateCompany('company_web', e.target.value)} className={inputClass} placeholder="https://" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Tab: Valores ─── */}
            {activeTab === 'defaults' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Valores por Defecto</h2>
                <p className="text-sm text-gray-500 mb-5">Estos valores se aplican al crear nuevos presupuestos en cualquier proyecto.</p>
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4 max-w-md">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <span className="flex items-center gap-1.5"><Percent className="w-3.5 h-3.5" /> IVA por defecto (%)</span>
                      </label>
                      <DecimalInput value={settings.defaults.tax_rate} onChange={(v) => settings.updateDefaults('tax_rate', v)} className={inputClass} />
                      <p className="text-xs text-gray-400 mt-1">Se puede activar/desactivar en cada presupuesto</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <span className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Moneda</span>
                      </label>
                      <select value={settings.defaults.currency} onChange={(e) => settings.updateDefaults('currency', e.target.value)} className={inputClass}>
                        <option value="EUR">EUR - Euro</option>
                        <option value="USD">USD - Dolar</option>
                        <option value="GBP">GBP - Libra</option>
                      </select>
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <p className="text-sm font-medium text-blue-900 mb-2">Fórmula de cálculo:</p>
                    <p className="text-sm text-blue-700 font-mono">
                      PEM + IVA ({settings.defaults.tax_rate}%) = Total
                    </p>
                    <p className="text-xs text-blue-600 mt-1">El IVA se puede activar o desactivar en cada presupuesto individual.</p>
                  </div>

                  {/* Ruta base de almacenamiento */}
                  <div className="pt-5 border-t border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-orange-500" /> Ubicación de almacenamiento
                    </h3>
                    <p className="text-sm text-gray-500 mb-3">Ruta base donde se crearán las carpetas de cada proyecto.</p>
                    <div className="max-w-lg">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <span className="flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> Ruta base de proyectos</span>
                      </label>
                      <FolderPicker
                        value={settings.defaults.default_folder_path}
                        onChange={(path) => settings.updateDefaults('default_folder_path', path)}
                        placeholder="C:/Proyectos/ConstruGest"
                      />
                      {settings.defaults.default_folder_path ? (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              setVerifyingPath(true)
                              setPathVerification(null)
                              try {
                                const { data } = await localApi.post('/settings/verify-path', {
                                  path: settings.defaults.default_folder_path,
                                })
                                setPathVerification(data as { valid: boolean; message: string })
                              } catch {
                                setPathVerification({ valid: false, message: 'No se pudo conectar con el servidor local' })
                              } finally {
                                setVerifyingPath(false)
                              }
                            }}
                            disabled={verifyingPath}
                            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-lg text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {verifyingPath ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Comprobar ruta
                          </button>
                          {pathVerification && (
                            pathVerification.valid ? (
                              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg flex-1">
                                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                <span className="text-xs text-green-700">{pathVerification.message}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex-1">
                                <Info className="w-4 h-4 text-red-600 shrink-0" />
                                <span className="text-xs text-red-700">{pathVerification.message}</span>
                              </div>
                            )
                          )}
                          {!pathVerification && !verifyingPath && (
                            <span className="text-xs text-gray-400 font-mono">{settings.defaults.default_folder_path}</span>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                          <Info className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="text-xs text-amber-700">Sin ruta configurada. Los proyectos no se guardarán en disco local.</span>
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-1">Al crear un proyecto se generará una subcarpeta automáticamente dentro de esta ruta.</p>
                    </div>
                    {settings.defaults.default_folder_path && (
                      <div className="mt-4 space-y-5">
                        <button
                          type="button"
                          onClick={async () => {
                            setSyncingFolders(true)
                            try {
                              const { data } = await localApi.post('/projects/sync-folders', {
                                base_path: settings.defaults.default_folder_path,
                              })
                              const result = data as { synced: number; results: { status: string }[] }
                              const ok = result.results.filter((r: { status: string }) => r.status === 'ok').length
                              const errors = result.results.filter((r: { status: string }) => r.status === 'error').length
                              addToast('success', `Carpetas sincronizadas: ${ok} creadas${errors > 0 ? `, ${errors} errores` : ''}`)
                            } catch {
                              addToast('error', 'Error al sincronizar carpetas')
                            } finally {
                              setSyncingFolders(false)
                            }
                          }}
                          disabled={syncingFolders}
                          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
                        >
                          {syncingFolders ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          Sincronizar carpetas de proyectos existentes
                        </button>
                        <p className="text-xs text-gray-400 mt-1">Crea subcarpetas en disco para todos los proyectos que aún no las tengan.</p>

                        {/* Backup & Restore */}
                        <div className="mt-5 pt-5 border-t border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                          <Download className="w-4 h-4 text-green-600" /> Copias de seguridad
                        </h4>
                        <p className="text-sm text-gray-500 mb-3">Exporta todos los datos de los proyectos a sus carpetas locales como backup.</p>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={async () => {
                              setBackingUp(true)
                              try {
                                let ok = 0, errors = 0
                                for (const p of projects) {
                                  if (!p.folder_path) continue
                                  try {
                                    await localApi.post(`/projects/${p.id}/backup`)
                                    ok++
                                  } catch { errors++ }
                                }
                                addToast('success', `Backup completado: ${ok} proyectos exportados${errors > 0 ? `, ${errors} errores` : ''}`)
                              } catch {
                                addToast('error', 'Error al realizar backup')
                              } finally {
                                setBackingUp(false)
                              }
                            }}
                            disabled={backingUp || projects.length === 0}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
                          >
                            {backingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Backup de todos los proyectos
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm('¿Restaurar todos los proyectos desde sus backups locales? Los datos actuales se sobrescribirán.')) return
                              setRestoring(true)
                              try {
                                let ok = 0, errors = 0
                                for (const p of projects) {
                                  if (!p.folder_path) continue
                                  try {
                                    await localApi.post(`/projects/${p.id}/restore`)
                                    ok++
                                  } catch { errors++ }
                                }
                                addToast('success', `Restauración completada: ${ok} proyectos${errors > 0 ? `, ${errors} sin backup` : ''}`)
                              } catch {
                                addToast('error', 'Error al restaurar')
                              } finally {
                                setRestoring(false)
                              }
                            }}
                            disabled={restoring || projects.length === 0}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
                          >
                            {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                            Restaurar desde backup
                          </button>
                        </div>
                          <p className="text-xs text-gray-400 mt-1">Los backups se guardan en una subcarpeta _backup dentro de cada proyecto.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─── Tab: IA ─── */}
            {activeTab === 'ai' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Inteligencia Artificial</h2>
                <p className="text-sm text-gray-500 mb-5">Configura los proveedores de IA para el analisis de presupuestos.</p>

                <div className="space-y-4">
                  {/* ── Toggles de proveedores ── */}
                  {[
                    { key: 'anthropic_enabled', name: 'Anthropic (Claude)', desc: 'Mejor razonamiento, recomendado', color: 'bg-orange-100 text-orange-600' },
                    { key: 'groq_enabled', name: 'Groq (Llama)', desc: 'Rapido y economico', color: 'bg-purple-100 text-purple-600' },
                    { key: 'gemini_enabled', name: 'Google Gemini', desc: 'Alternativa Google', color: 'bg-blue-100 text-blue-600' },
                  ].map((provider) => (
                    <div key={provider.key} className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg ${provider.color} flex items-center justify-center`}>
                          <Zap className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{provider.name}</p>
                          <p className="text-xs text-gray-500">{provider.desc}</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.ai[provider.key as keyof typeof settings.ai] as boolean}
                          onChange={(e) => settings.updateAI(provider.key, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                      </label>
                    </div>
                  ))}

                  <div className="max-w-xs">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor por defecto</label>
                    <select value={settings.ai.default_provider} onChange={(e) => settings.updateAI('default_provider', e.target.value)} className={inputClass}>
                      <option value="anthropic">Anthropic (Claude)</option>
                      <option value="groq">Groq (Llama)</option>
                      <option value="gemini">Google Gemini</option>
                    </select>
                  </div>

                  {/* ── API Keys ── */}
                  <div className="border-t border-gray-200 pt-5 mt-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                      <Key className="w-4 h-4 text-gray-500" />
                      API Keys
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                      Introduce las claves API de cada proveedor. Se guardan de forma segura por organizacion.
                    </p>

                    {[
                      { keyField: 'anthropic_api_key', provider: 'anthropic', label: 'Anthropic API Key', placeholder: 'sk-ant-api03-...' },
                      { keyField: 'groq_api_key', provider: 'groq', label: 'Groq API Key', placeholder: 'gsk_...' },
                      { keyField: 'gemini_api_key', provider: 'gemini', label: 'Gemini API Key', placeholder: 'AIza...' },
                    ].map(({ keyField, provider, label, placeholder }) => (
                      <div key={keyField} className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type={showKeys[keyField] ? 'text' : 'password'}
                              value={(settings.ai[keyField as keyof typeof settings.ai] as string) || ''}
                              onChange={(e) => settings.updateAI(keyField, e.target.value)}
                              className={`${inputClass} pr-20`}
                              placeholder={placeholder}
                              autoComplete="off"
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleKeyVisibility(keyField)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition"
                                tabIndex={-1}
                                title={showKeys[keyField] ? 'Ocultar' : 'Mostrar'}
                              >
                                {showKeys[keyField]
                                  ? <EyeOff className="w-4 h-4" />
                                  : <Eye className="w-4 h-4" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(keyField)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition"
                                tabIndex={-1}
                                title="Copiar"
                              >
                                {copied === keyField
                                  ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => verifyKey(provider, keyField)}
                            disabled={!!verifying[keyField]}
                            className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition disabled:opacity-50 whitespace-nowrap flex items-center gap-1.5"
                          >
                            {verifying[keyField]
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : 'Verificar'}
                          </button>
                        </div>
                        {verifyResult[keyField] && (
                          <p className={`text-xs mt-1 flex items-center gap-1 ${
                            verifyResult[keyField]!.valid ? 'text-green-600' : 'text-red-500'
                          }`}>
                            {verifyResult[keyField]!.valid
                              ? <CheckCircle2 className="w-3 h-3" />
                              : <XCircle className="w-3 h-3" />}
                            {verifyResult[keyField]!.message}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
                    <p className="text-sm text-violet-700">
                      Los proveedores se usan con fallback automatico: si el principal falla, se intenta con el siguiente habilitado.
                      Si no configuras una API key aqui, se usara la clave del servidor (si existe).
                    </p>
                  </div>

                  {/* ── Consumo de IA ── */}
                  <div className="border-t border-gray-200 pt-5 mt-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-gray-500" />
                      Consumo de IA
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">Uso de IA en los últimos 30 días.</p>
                    <AIConsumptionPanel />
                  </div>
                </div>
              </div>
            )}

            {/* ─── Tab: Impresion ─── */}
            {activeTab === 'print' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Configuracion de Impresion</h2>
                <p className="text-sm text-gray-500 mb-5">Define el formato y orientacion por defecto para los documentos PDF.</p>

                {/* Info banner */}
                <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="flex gap-3">
                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Seleccion de impresora</p>
                      <p className="text-sm text-blue-700 mt-0.5">
                        Al pulsar &quot;Imprimir&quot; en la vista previa del PDF, se abrira el dialogo de impresion
                        nativo del navegador. Desde ahi podras elegir la impresora, numero de copias,
                        color/blanco y negro y rango de paginas.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  {/* Format & orientation */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Formato de pagina</span>
                      </label>
                      <select
                        value={settings.print.default_format}
                        onChange={(e) => settings.updatePrint('default_format', e.target.value)}
                        className={inputClass}
                      >
                        <option value="A4">A4 (210 x 297 mm) — Estandar</option>
                        <option value="A3">A3 (297 x 420 mm)</option>
                        <option value="A2">A2 (420 x 594 mm)</option>
                        <option value="A1">A1 (594 x 841 mm)</option>
                        <option value="A0">A0 (841 x 1189 mm)</option>
                      </select>
                      <p className="text-xs text-gray-400 mt-1">
                        La impresion en el navegador puede limitarse a los formatos soportados por tu impresora.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Orientacion por defecto</label>
                      <div className="flex gap-2 mt-2">
                        {(['portrait', 'landscape'] as const).map(o => (
                          <button
                            key={o}
                            type="button"
                            onClick={() => settings.updatePrint('default_orientation', o)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition ${
                              settings.print.default_orientation === o
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <div className={`${o === 'portrait' ? 'w-3 h-4' : 'w-4 h-3'} border-2 rounded-sm ${
                              settings.print.default_orientation === o ? 'border-white' : 'border-gray-400'
                            }`} />
                            {o === 'portrait' ? 'Vertical' : 'Horizontal'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Margins */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">Margenes por defecto (mm)</label>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'default_margin_top', label: 'Superior' },
                        { key: 'default_margin_bottom', label: 'Inferior' },
                        { key: 'default_margin_left', label: 'Izquierdo' },
                        { key: 'default_margin_right', label: 'Derecho' },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <label className="block text-xs text-gray-500 mb-1 text-center">{label}</label>
                          <input
                            type="number"
                            min={0}
                            max={50}
                            step={1}
                            value={settings.print[key as keyof typeof settings.print] as number}
                            onChange={(e) => settings.updatePrint(key, parseFloat(e.target.value) || 0)}
                            className={`${inputClass} text-center`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Tab: Estilos PDF ─── */}
            {activeTab === 'pdf_styles' && (
              <div className="flex gap-5 items-start">
                {/* Left: Config panel */}
                <div className="w-72 shrink-0 space-y-4">

                  {/* Colores */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Colores</h3>
                    <div className="space-y-2.5">
                      {[
                        { key: 'pdf_color_primary', label: 'Color principal (barras, cabeceras)' },
                        { key: 'pdf_color_dark', label: 'Título principal (oscuro)' },
                        { key: 'pdf_color_accent', label: 'Subtítulo / Acento' },
                        { key: 'pdf_color_text', label: 'Texto del cuerpo' },
                        { key: 'pdf_color_muted', label: 'Texto secundario' },
                        { key: 'pdf_color_row_alt', label: 'Filas alternas' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <label className="text-sm text-gray-600">{label}</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={settings.pdf_styles[key as keyof typeof settings.pdf_styles] as string}
                              onChange={(e) => settings.updatePdfStyles(key, e.target.value)}
                              className="w-9 h-7 rounded cursor-pointer border border-gray-300 p-0.5"
                            />
                            <input
                              type="text"
                              value={settings.pdf_styles[key as keyof typeof settings.pdf_styles] as string}
                              onChange={(e) => settings.updatePdfStyles(key, e.target.value)}
                              className="w-24 px-2 py-1 text-xs rounded border border-gray-300 font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                              maxLength={7}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Logo */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Logo</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Ancho del logo (pt)</label>
                        <input
                          type="number"
                          value={settings.pdf_styles.pdf_logo_width}
                          onChange={(e) => settings.updatePdfStyles('pdf_logo_width', parseInt(e.target.value) || 140)}
                          min={60} max={300} step={10}
                          className="w-28 px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Alineacion</label>
                        <div className="flex gap-1.5">
                          {(['left', 'center', 'right'] as const).map((align) => (
                            <button
                              key={align}
                              type="button"
                              onClick={() => settings.updatePdfStyles('pdf_logo_align', align)}
                              className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition ${
                                settings.pdf_styles.pdf_logo_align === align
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {align === 'left' ? 'Izq.' : align === 'center' ? 'Centro' : 'Der.'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tipografia */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Tipografia</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Fuente</label>
                        <select
                          value={settings.pdf_styles.pdf_font_family}
                          onChange={(e) => settings.updatePdfStyles('pdf_font_family', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option value="Roboto">Roboto</option>
                          <option value="Helvetica">Helvetica</option>
                          <option value="Times">Times</option>
                          <option value="Courier">Courier</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: 'pdf_title_size', label: 'Titulo' },
                          { key: 'pdf_subtitle_size', label: 'Subtitulo' },
                          { key: 'pdf_table_header_size', label: 'Cab. tabla' },
                          { key: 'pdf_body_size', label: 'Cuerpo' },
                        ].map(({ key, label }) => (
                          <div key={key}>
                            <label className="block text-xs text-gray-500 mb-1">{label}</label>
                            <input
                              type="number"
                              value={settings.pdf_styles[key as keyof typeof settings.pdf_styles] as number}
                              onChange={(e) => settings.updatePdfStyles(key, parseInt(e.target.value) || 9)}
                              min={6} max={72} step={1}
                              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Opciones */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Opciones</h3>
                    <div className="space-y-3">
                      {[
                        { key: 'pdf_header_shadow', label: 'Sombra en cabeceras', desc: 'Relleno de color en cabeceras de tabla' },
                        { key: 'pdf_row_striping', label: 'Filas alternas', desc: 'Color alternado en filas de tabla' },
                      ].map(({ key, label, desc }) => (
                        <label key={key} className="flex items-start gap-3 cursor-pointer">
                          <div className="relative mt-0.5">
                            <input
                              type="checkbox"
                              checked={settings.pdf_styles[key as keyof typeof settings.pdf_styles] as boolean}
                              onChange={(e) => settings.updatePdfStyles(key, e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-checked:bg-blue-600 rounded-full transition-colors" />
                            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-700">{label}</p>
                            <p className="text-xs text-gray-400">{desc}</p>
                          </div>
                        </label>
                      ))}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Altura barra superior (pt)</label>
                        <input
                          type="number"
                          value={settings.pdf_styles.pdf_top_bar_height}
                          onChange={(e) => settings.updatePdfStyles('pdf_top_bar_height', parseInt(e.target.value) || 8)}
                          min={0} max={30} step={1}
                          className="w-24 px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right: Live preview */}
                <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden sticky top-20">
                  <div className="bg-gray-100 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Vista previa</span>
                    {pdfPreviewLoading && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Generando...
                      </div>
                    )}
                  </div>
                  <div className="h-[750px]">
                    {pdfPreviewUrl ? (
                      <iframe src={pdfPreviewUrl} className="w-full h-full border-0" title="Vista previa PDF" />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─── Tab: Apariencia ─── */}
            {activeTab === 'appearance' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-5">Apariencia</h2>
                <div className="space-y-5">
                  <div className="max-w-xs">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Idioma</span>
                    </label>
                    <select
                      value={i18n.language}
                      onChange={(e) => {
                        i18n.changeLanguage(e.target.value)
                        settings.updateAppearance('language', e.target.value)
                      }}
                      className={inputClass}
                    >
                      <option value="es">Espanol</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                  <div className="max-w-xs">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <span className="flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" /> Tema</span>
                    </label>
                    <select value={settings.appearance.theme} onChange={(e) => settings.updateAppearance('theme', e.target.value)} className={inputClass}>
                      <option value="system">Sistema</option>
                      <option value="light">Claro</option>
                      <option value="dark">Oscuro</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ─── TAB: ACCOUNT ─── */}
            {activeTab === 'account' && (
              <div className="space-y-6">
                {/* User Info */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Datos de la cuenta</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Nombre</label>
                      <p className="text-sm text-gray-900 bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">{user?.full_name || '—'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Correo electrónico</label>
                      <p className="text-sm text-gray-900 bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">{user?.email || '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Change Password */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Cambiar contraseña
                  </h3>
                  <div className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Contraseña actual</label>
                      <div className="relative">
                        <input
                          type={showCurrentPw ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition pr-10"
                          placeholder="Tu contraseña actual"
                        />
                        <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Nueva contraseña</label>
                      <div className="relative">
                        <input
                          type={showNewPw ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition pr-10"
                          placeholder="Mínimo 6 caracteres"
                        />
                        <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Confirmar nueva contraseña</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
                        placeholder="Repite la nueva contraseña"
                      />
                    </div>
                    <button
                      onClick={async () => {
                        if (!currentPassword || !newPassword) { addToast('error', 'Rellena todos los campos'); return }
                        if (newPassword.length < 6) { addToast('error', 'La contraseña debe tener al menos 6 caracteres'); return }
                        if (newPassword !== confirmPassword) { addToast('error', 'Las contraseñas no coinciden'); return }
                        setChangingPassword(true)
                        try {
                          await api.put('/auth/change-password', { current_password: currentPassword, new_password: newPassword })
                          addToast('success', 'Contraseña actualizada correctamente')
                          setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
                        } catch (err: any) {
                          addToast('error', err.response?.data?.error || 'Error al cambiar la contraseña')
                        } finally {
                          setChangingPassword(false)
                        }
                      }}
                      disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition shadow-sm disabled:opacity-50 font-medium text-sm"
                    >
                      {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      Cambiar contraseña
                    </button>
                  </div>
                </div>

                {/* Desktop App */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" />
                    Aplicación de Escritorio
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Instala la app de escritorio para sincronizar automáticamente tus proyectos en tu disco local.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={`${process.env.NEXT_PUBLIC_API_URL || 'https://construgest-web.onrender.com/api'}/settings/installer`}
                      download
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shadow-sm font-medium text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Descargar Instalador
                    </a>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    Ejecuta el archivo descargado una sola vez. Queda instalado en Windows y puedes borrar el archivo de Descargas.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
