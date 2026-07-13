'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useMaterialsStore } from '@/stores/materialsStore'
import { useSuppliersStore } from '@/stores/suppliersStore'
import { useNotificationStore } from '@/stores/notificationStore'
import api from '@/lib/api'
import { useWorkersStore } from '@/stores/workersStore'
import { useEquipmentCatalogStore } from '@/stores/equipmentCatalogStore'
import type { SavedPartida, LibraryChapter, LibraryChapterWithPartidas, SupplierMaterial, Worker, EquipmentCatalogItem } from '@/types'
import {
  Search, Plus, Trash2, Edit3, Loader2, Package, X,
  BookOpen, Hash, Tag, ArrowUpDown, BarChart3, TrendingUp, CheckSquare, Square, BarChart2,
  ChevronDown, ChevronRight, FolderPlus, Layers, GripVertical, AlertTriangle, ArrowLeftRight, Award, Star, Upload,
  HardHat, Wrench, Users, Phone, Mail
} from 'lucide-react'
import PriceHistoryModal from '@/components/budget/PriceHistoryModal'
import ImportMaterialsModal from '@/components/materials/ImportMaterialsModal'
import { formatCurrency } from '@/lib/utils'
import { DecimalInput } from '@/components/ui/DecimalInput'

type Tab = 'materials' | 'partidas' | 'workers' | 'equipment'

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<Tab>('partidas')

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'partidas', label: 'Partidas Guardadas', icon: BookOpen },
    { key: 'materials', label: 'Materiales', icon: Package },
    { key: 'workers', label: 'Personal de Obra', icon: Users },
    { key: 'equipment', label: 'Maquinaria', icon: Wrench },
  ]

  return (
    <div>
      {/* Header — sticky */}
      <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Biblioteca</h1>
            <p className="text-gray-500 text-sm mt-1">Partidas, materiales, personal y maquinaria de tu organización</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 active:bg-gray-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'materials' && <MaterialsTab />}
      {activeTab === 'partidas' && <PartidasTab />}
      {activeTab === 'workers' && <WorkersTab />}
      {activeTab === 'equipment' && <EquipmentTab />}
    </div>
  )
}

const STANDARD_UNITS = [
  'ud', 'm', 'm²', 'm³', 'ml', 'kg', 'g', 't',
  'l', 'h', 'dia', 'sem', 'mes',
  'pa', 'paq', 'rollo', 'saco', 'bote', 'caja', 'palet',
]

// ──── Materials Tab ────────────────────────────────────────────

function MaterialsTab() {
  const { addToast } = useNotificationStore()
  const {
    materials, categories, loading, search,
    setSearch, loadMaterials, loadCategories, createMaterial, updateMaterial, deleteMaterial,
    fetchNextCode, fetchPrefixes,
  } = useMaterialsStore()
  const { suppliers, loadSuppliers } = useSuppliersStore()

  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [priceHistoryMaterialId, setPriceHistoryMaterialId] = useState<string | null>(null)
  const [priceHistoryMaterialName, setPriceHistoryMaterialName] = useState('')
  const [compareMaterialId, setCompareMaterialId] = useState<string | null>(null)
  const [compareMaterialName, setCompareMaterialName] = useState('')
  const [compareData, setCompareData] = useState<SupplierMaterial[]>([])
  const [compareLoading, setCompareLoading] = useState(false)
  const [showCustomUnit, setShowCustomUnit] = useState(false)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [existingPrefixes, setExistingPrefixes] = useState<{ prefix: string; count: number }[]>([])
  const [showPrefixDropdown, setShowPrefixDropdown] = useState(false)
  const [form, setForm] = useState({
    code: '', name: '', unit: 'ud', unit_price: 0, sale_price: 0,
    category_id: '', description: '', brand: '', notes: '', supplier_id: '',
  })

  useEffect(() => {
    loadMaterials()
    loadCategories()
    loadSuppliers()
    fetchPrefixes().then(setExistingPrefixes).catch(() => {})
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => loadMaterials(), 300)
    return () => clearTimeout(timer)
  }, [search])

  const openComparison = async (materialId: string, materialName: string) => {
    setCompareMaterialId(materialId)
    setCompareMaterialName(materialName)
    setCompareLoading(true)
    try {
      const { data } = await api.get<SupplierMaterial[]>(`/supplier-materials/material/${materialId}`)
      setCompareData(data)
    } catch {
      addToast('error', 'Error al cargar comparativa')
    } finally {
      setCompareLoading(false)
    }
  }

  const filteredMaterials = filterCategory
    ? materials.filter((m) => m.category_id === filterCategory)
    : materials

  // Build unit list: standard + any custom units already used in materials
  const existingUnits = new Set(materials.map((m) => m.unit).filter(Boolean))
  const allUnits = Array.from(new Set([...STANDARD_UNITS, ...existingUnits]))

  const openCreate = () => {
    setEditingId(null)
    setShowCustomUnit(false)
    setForm({ code: '', name: '', unit: 'ud', unit_price: 0, sale_price: 0, category_id: '', description: '', brand: '', notes: '', supplier_id: '' })
    setShowModal(true)
  }

  const openEdit = (m: typeof materials[0]) => {
    setEditingId(m.id)
    // Check if the unit is custom (not in standard list)
    setShowCustomUnit(!STANDARD_UNITS.includes(m.unit) && !allUnits.includes(m.unit))
    setForm({
      code: m.code, name: m.name, unit: m.unit,
      unit_price: m.unit_price, sale_price: m.sale_price,
      category_id: m.category_id || '', description: m.description || '',
      brand: m.brand || '', notes: m.notes || '', supplier_id: '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      const { supplier_id, ...materialData } = form
      if (editingId) {
        await updateMaterial(editingId, materialData)
        addToast('success', 'Material actualizado')
      } else {
        const { data: created } = await api.post('/materials', {
          ...materialData,
          category_id: materialData.category_id || null,
        })
        // If supplier selected, create supplier-material association
        if (supplier_id && created?.id) {
          try {
            await api.post('/supplier-materials', {
              supplier_id,
              material_id: created.id,
              unit_price: materialData.unit_price,
              notes: null,
            })
            addToast('success', 'Material creado y vinculado al proveedor')
          } catch {
            addToast('success', 'Material creado (error al vincular proveedor)')
          }
        } else {
          addToast('success', 'Material creado')
        }
        loadMaterials()
        fetchPrefixes().then(setExistingPrefixes).catch(() => {})
      }
      setShowModal(false)
    } catch {
      addToast('error', 'Error al guardar el material')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este material?')) return
    try {
      await deleteMaterial(id)
      addToast('success', 'Material eliminado')
    } catch {
      addToast('error', 'Error al eliminar')
    }
  }

  return (
    <>
      {/* Search & Filter + Create */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar materiales..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name_es}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg transition shadow-sm"
          >
            <Upload className="w-4 h-4" /> Importar
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Nuevo Material
          </button>
        </div>
      </div>

      {/* Materials Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">No hay materiales</p>
          <p className="text-sm text-gray-400">Crea tu primer material o importa un catálogo</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-center">Unidad</th>
                <th className="px-4 py-3 text-right">P. Coste</th>
                <th className="px-4 py-3 text-right">P. Venta</th>
                <th className="px-4 py-3 text-left">Marca</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.map((m) => (
                <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition group">
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">{m.code}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.name}</p>
                      {m.description && <p className="text-xs text-gray-400 truncate max-w-xs">{m.description}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-center">{m.unit}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(m.unit_price)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(m.sale_price)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{m.brand || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => openComparison(m.id, m.name)}
                        className="p-1 text-gray-400 hover:text-green-600 rounded transition"
                        title="Comparar precios entre proveedores"
                      >
                        <ArrowLeftRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setPriceHistoryMaterialId(m.id); setPriceHistoryMaterialName(m.name) }}
                        className="p-1 text-gray-400 hover:text-amber-600 rounded transition"
                        title="Historial de precios"
                      >
                        <BarChart2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(m)} className="p-1 text-gray-400 hover:text-blue-600 rounded transition">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(m.id)} className="p-1 text-gray-400 hover:text-red-500 rounded transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{editingId ? 'Editar Material' : 'Nuevo Material'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                  <div className="relative">
                    <div className="flex gap-1">
                      <input
                        value={form.code}
                        onChange={(e) => {
                          setForm({ ...form, code: e.target.value.toUpperCase() })
                          setShowPrefixDropdown(true)
                        }}
                        onFocus={() => setShowPrefixDropdown(true)}
                        onBlur={() => setTimeout(() => setShowPrefixDropdown(false), 200)}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                        placeholder="Prefijo + #"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const prefix = form.code.replace(/-\d+$/, '').trim()
                          if (!prefix) { addToast('error', 'Escribe un prefijo primero'); return }
                          setGeneratingCode(true)
                          try {
                            const code = await fetchNextCode(prefix)
                            setForm((f) => ({ ...f, code }))
                          } catch { addToast('error', 'Error al generar código') }
                          setGeneratingCode(false)
                        }}
                        disabled={generatingCode}
                        className="px-2 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition disabled:opacity-50"
                        title="Auto-numerar: escribe un prefijo y pulsa para generar"
                      >
                        {generatingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4 text-gray-500" />}
                      </button>
                    </div>
                    {showPrefixDropdown && existingPrefixes.length > 0 && (() => {
                      const codeInput = form.code.replace(/-\d+$/, '').trim()
                      const filtered = codeInput
                        ? existingPrefixes.filter((p) => p.prefix.includes(codeInput.toUpperCase()))
                        : existingPrefixes
                      return (
                        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filtered.length > 0 ? (
                            filtered.map((p) => (
                              <button
                                key={p.prefix}
                                onMouseDown={async (e) => {
                                  e.preventDefault()
                                  setShowPrefixDropdown(false)
                                  setGeneratingCode(true)
                                  try {
                                    const code = await fetchNextCode(p.prefix)
                                    setForm((f) => ({ ...f, code }))
                                  } catch { addToast('error', 'Error al generar código') }
                                  setGeneratingCode(false)
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center justify-between transition"
                              >
                                <span className="font-mono font-medium">{p.prefix}</span>
                                <span className="text-xs text-gray-400">{p.count} mat.</span>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-xs text-gray-400">
                              Sin coincidencias — pulsa # para crear &quot;{codeInput}&quot;
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Escribe un prefijo y pulsa # para auto-numerar</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
                  {showCustomUnit ? (
                    <div className="flex gap-2">
                      <input
                        value={form.unit}
                        onChange={(e) => setForm({ ...form, unit: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Nueva unidad..."
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => { setShowCustomUnit(false); setForm({ ...form, unit: 'ud' }) }}
                        className="px-2 py-2 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition"
                        title="Volver a lista"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={allUnits.includes(form.unit) ? form.unit : '__other'}
                        onChange={(e) => {
                          if (e.target.value === '__other') {
                            setShowCustomUnit(true)
                            setForm({ ...form, unit: '' })
                          } else {
                            setForm({ ...form, unit: e.target.value })
                          }
                        }}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {allUnits.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                        <option value="__other">+ Nueva unidad...</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nombre del material"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio Coste</label>
                  <DecimalInput
                    value={form.unit_price} onChange={(v) => setForm({ ...form, unit_price: v })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio Venta</label>
                  <DecimalInput
                    value={form.sale_price} onChange={(v) => setForm({ ...form, sale_price: v })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                <select
                  value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin categoría</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name_es}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
                  <select
                    value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sin proveedor</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                  <input
                    value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name || !form.code}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
              >
                {editingId ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Materials Modal */}
      <ImportMaterialsModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        existingMaterials={materials}
        onImportComplete={() => {
          loadMaterials()
          fetchPrefixes().then(setExistingPrefixes).catch(() => {})
        }}
      />

      {/* Price History Modal */}
      {priceHistoryMaterialId && (
        <PriceHistoryModal
          materialId={priceHistoryMaterialId}
          materialName={priceHistoryMaterialName}
          onClose={() => setPriceHistoryMaterialId(null)}
        />
      )}

      {/* Price Comparison Modal */}
      {compareMaterialId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <div>
                <h2 className="text-lg font-semibold">Comparativa de Precios</h2>
                <p className="text-sm text-gray-500 truncate max-w-md">{compareMaterialName}</p>
              </div>
              <button onClick={() => setCompareMaterialId(null)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {compareLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : compareData.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">Ningun proveedor tiene este material asociado</p>
                  <p className="text-gray-400 text-xs mt-1">Asocia materiales desde Proveedores &gt; Ver materiales</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-2.5 text-left w-8">#</th>
                      <th className="px-4 py-2.5 text-left">Proveedor</th>
                      <th className="px-4 py-2.5 text-center">Valoracion</th>
                      <th className="px-4 py-2.5 text-right">Precio</th>
                      <th className="px-4 py-2.5 text-right">Dif.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const bestPrice = Math.min(...compareData.map((c) => Number(c.unit_price)))
                      return compareData.map((item, idx) => {
                        const price = Number(item.unit_price)
                        const isBest = price === bestPrice
                        const diff = bestPrice > 0 ? ((price - bestPrice) / bestPrice) * 100 : 0
                        return (
                          <tr key={item.id} className={`border-b border-gray-50 ${isBest ? 'bg-green-50/50' : ''}`}>
                            <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {isBest && <Award className="w-4 h-4 text-green-600 shrink-0" />}
                                <span className="text-sm font-medium text-gray-900">{item.supplier?.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star key={s} className={`w-3 h-3 ${s <= (item.supplier?.rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-sm font-semibold ${isBest ? 'text-green-700' : 'text-gray-900'}`}>
                                {formatCurrency(price)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isBest ? (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Mejor</span>
                              ) : (
                                <span className="text-xs text-red-600 font-medium">+{diff.toFixed(1)}%</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ──── Partidas Guardadas Tab (Agrupadas por Capítulos) ────────

function PartidasTab() {
  const { addToast } = useNotificationStore()
  const [chapters, setChapters] = useState<LibraryChapterWithPartidas[]>([])
  const [orphans, setOrphans] = useState<SavedPartida[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Drag and drop (partidas)
  const [draggingPartidaId, setDraggingPartidaId] = useState<string | null>(null)
  const [dragOverChapterId, setDragOverChapterId] = useState<string | null>(null)
  const dragOverChapterRef = useRef<string | null>(null)
  const globalDragCleanupRef = useRef<(() => void) | null>(null)
  // Intra-chapter reorder
  const [dragOverPartidaId, setDragOverPartidaId] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)

  // Drag and drop (chapters reorder)
  const [draggingChapterId, setDraggingChapterId] = useState<string | null>(null)
  const [dragOverChapterTargetId, setDragOverChapterTargetId] = useState<string | null>(null)
  const [reorderingChapters, setReorderingChapters] = useState(false) // blocks concurrent reorders
  const chapterGripActive = useRef<string | null>(null) // tracks which chapter grip was mousedown'd

  // Partida modal
  const [showPartidaModal, setShowPartidaModal] = useState(false)
  const [editingPartidaId, setEditingPartidaId] = useState<string | null>(null)
  const [partidaForm, setPartidaForm] = useState({
    code: '', name: '', description: '', unit: 'ud',
    unit_price: 0, cost_price: 0, library_chapter_id: '', tags: '',
    is_auxiliary: false,
  })
  const [duplicateWarning, setDuplicateWarning] = useState<SavedPartida[]>([])
  const [units, setUnits] = useState<{ value: string; label: string }[]>([])
  const [newUnitInput, setNewUnitInput] = useState('')
  const [addingUnit, setAddingUnit] = useState(false)

  // Chapter modal
  const [showChapterModal, setShowChapterModal] = useState(false)
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null)
  const [chapterForm, setChapterForm] = useState({ code: '', name: '' })

  useEffect(() => {
    loadGrouped()
  }, [])

  const loadGrouped = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data } = await api.get<{ chapters: LibraryChapterWithPartidas[]; orphans: SavedPartida[] }>('/library/partidas/grouped')
      setChapters(data.chapters)
      setOrphans(data.orphans)
    } catch {
      addToast('error', 'Error al cargar partidas')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const loadUnits = async () => {
    try {
      const { data } = await api.get<{ value: string; label: string }[]>('/library/units')
      setUnits(data)
    } catch { /* keep defaults empty */ }
  }

  // All partidas flat (for stats)
  const allPartidas = useMemo(() => {
    const items = chapters.flatMap(c => c.partidas)
    return [...items, ...orphans]
  }, [chapters, orphans])

  // Filter chapters and partidas by search
  const filteredChapters = useMemo(() => {
    if (!search) return chapters
    const q = search.toLowerCase()
    return chapters.map(ch => ({
      chapter: ch.chapter,
      partidas: ch.partidas.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.tags && p.tags.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      ),
    })).filter(ch =>
      ch.partidas.length > 0 ||
      ch.chapter.name.toLowerCase().includes(q) ||
      ch.chapter.code.toLowerCase().includes(q)
    )
  }, [chapters, search])

  const filteredOrphans = useMemo(() => {
    if (!search) return orphans
    const q = search.toLowerCase()
    return orphans.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.tags && p.tags.toLowerCase().includes(q))
    )
  }, [orphans, search])

  // Auto-expand chapters with search results
  useEffect(() => {
    if (search) {
      const matchedIds = filteredChapters.filter(ch => ch.partidas.length > 0).map(ch => ch.chapter.id)
      setExpandedChapters(prev => new Set([...prev, ...matchedIds]))
    }
  }, [search, filteredChapters])

  // Summary stats
  const totalPartidas = allPartidas.length
  const totalChapters = chapters.length
  const avgPrice = totalPartidas > 0
    ? allPartidas.reduce((sum, p) => sum + Number(p.unit_price), 0) / totalPartidas
    : 0

  const toggleChapter = (id: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`¿Eliminar ${selectedIds.size} partida${selectedIds.size > 1 ? 's' : ''}?`)) return
    setBulkDeleting(true)
    try {
      await Promise.all(Array.from(selectedIds).map(id => api.delete(`/library/partidas/${id}`)))
      addToast('success', `${selectedIds.size} partida${selectedIds.size > 1 ? 's' : ''} eliminada${selectedIds.size > 1 ? 's' : ''}`)
      setSelectedIds(new Set())
      loadGrouped(true)
    } catch {
      addToast('error', 'Error al eliminar partidas')
    } finally {
      setBulkDeleting(false)
    }
  }

  // ─── Chapter actions ───────────────────────────────────────
  const openCreateChapter = () => {
    setEditingChapterId(null)
    const nextCode = String(chapters.length + 1).padStart(2, '0')
    setChapterForm({ code: nextCode, name: '' })
    setShowChapterModal(true)
  }

  const openEditChapter = (ch: LibraryChapter) => {
    setEditingChapterId(ch.id)
    setChapterForm({ code: ch.code, name: ch.name })
    setShowChapterModal(true)
  }

  const handleSaveChapter = async () => {
    try {
      if (editingChapterId) {
        await api.put(`/library/chapters/${editingChapterId}`, chapterForm)
        addToast('success', 'Capítulo actualizado')
      } else {
        await api.post('/library/chapters', { ...chapterForm, sort_order: chapters.length + 1 })
        addToast('success', 'Capítulo creado')
      }
      setShowChapterModal(false)
      loadGrouped(true)
    } catch {
      addToast('error', 'Error al guardar capítulo')
    }
  }

  const handleDeleteChapter = async (id: string) => {
    if (!confirm('¿Eliminar este capítulo? Las partidas quedarán sin capítulo.')) return
    try {
      await api.delete(`/library/chapters/${id}`)
      addToast('success', 'Capítulo eliminado')
      loadGrouped(true)
    } catch {
      addToast('error', 'Error al eliminar capítulo')
    }
  }

  // ─── Partida actions ───────────────────────────────────────
  const openCreatePartida = async (chapterId?: string) => {
    setEditingPartidaId(null)
    setDuplicateWarning([])

    let nextCode = ''
    if (chapterId) {
      try {
        const { data } = await api.get<{ next_code: string }>(`/library/chapters/${chapterId}/next-code`)
        nextCode = data.next_code
      } catch { /* leave empty */ }
    }

    setPartidaForm({
      code: nextCode, name: '', description: '', unit: 'ud',
      unit_price: 0, cost_price: 0, library_chapter_id: chapterId || '', tags: '',
      is_auxiliary: false,
    })
    setNewUnitInput('')
    loadUnits()
    setShowPartidaModal(true)
  }

  const openEditPartida = (p: SavedPartida) => {
    setEditingPartidaId(p.id)
    setDuplicateWarning([])
    setPartidaForm({
      code: p.code, name: p.name, description: p.description || '',
      unit: p.unit, unit_price: Number(p.unit_price), cost_price: Number(p.cost_price),
      library_chapter_id: p.library_chapter_id || '', tags: p.tags || '',
      is_auxiliary: !!p.is_auxiliary,
    })
    setNewUnitInput('')
    loadUnits()
    setShowPartidaModal(true)
  }

  const handleSavePartida = async (forceCreate = false) => {
    // Check for duplicates before creating a new partida
    if (!editingPartidaId && !forceCreate) {
      try {
        const { data: dupes } = await api.post<SavedPartida[]>('/library/partidas/check-duplicates', {
          code: partidaForm.code,
          name: partidaForm.name,
        })
        if (dupes && dupes.length > 0) {
          setDuplicateWarning(dupes)
          return
        }
      } catch {
        // If check fails, proceed normally
      }
    }
    try {
      const payload: Record<string, unknown> = { ...partidaForm }
      // Find chapter_code from library_chapter_id
      if (partidaForm.library_chapter_id) {
        const ch = chapters.find(c => c.chapter.id === partidaForm.library_chapter_id)
        if (ch) payload.chapter_code = ch.chapter.code
      }
      if (!partidaForm.library_chapter_id) {
        payload.library_chapter_id = null
        payload.chapter_code = null
      }

      if (editingPartidaId) {
        await api.put(`/library/partidas/${editingPartidaId}`, payload)
        addToast('success', 'Partida actualizada')
      } else {
        await api.post('/library/partidas', { ...payload, source: 'manual' })
        addToast('success', 'Partida creada')
      }
      setDuplicateWarning([])
      setShowPartidaModal(false)
      loadGrouped(true)
    } catch {
      addToast('error', 'Error al guardar la partida')
    }
  }

  const handleDeletePartida = async (id: string) => {
    if (!confirm('¿Eliminar esta partida?')) return
    try {
      await api.delete(`/library/partidas/${id}`)
      selectedIds.delete(id)
      setSelectedIds(new Set(selectedIds))
      addToast('success', 'Partida eliminada')
      loadGrouped(true)
    } catch {
      addToast('error', 'Error al eliminar')
    }
  }

  // ─── Drag & Drop handlers ─────────────────────────────────
  const handleDragStart = (e: React.DragEvent, partidaId: string) => {
    e.stopPropagation()
    setDraggingPartidaId(partidaId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', partidaId)

    // Global dragover listener to track real target chapter
    const onGlobalDragOver = (ev: DragEvent) => {
      ev.preventDefault()
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const chapterEl = el?.closest('[data-chapter-id]') as HTMLElement | null
      const chId = chapterEl?.getAttribute('data-chapter-id') || null
      if (chId !== dragOverChapterRef.current) {
dragOverChapterRef.current = chId
        setDragOverChapterId(chId)
      }
    }
    document.addEventListener('dragover', onGlobalDragOver, true)
    globalDragCleanupRef.current = () => {
      document.removeEventListener('dragover', onGlobalDragOver, true)
    }
  }

  // onDrag fires on the SOURCE element (partida) — backup cursor tracking
  const handleDragMove = (e: React.DragEvent) => {
    if (e.clientX === 0 && e.clientY === 0) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const chapterEl = el?.closest('[data-chapter-id]') as HTMLElement | null
    const chId = chapterEl?.getAttribute('data-chapter-id') || null
    if (chId !== dragOverChapterRef.current) {
      dragOverChapterRef.current = chId
      setDragOverChapterId(chId)
    }
  }

  const restoreDragState = () => {
    setDraggingPartidaId(null)
    setDragOverChapterId(null)
    setDragOverPartidaId(null)
    setDropPosition(null)
    dragOverChapterRef.current = null
    if (globalDragCleanupRef.current) {
      globalDragCleanupRef.current()
      globalDragCleanupRef.current = null
    }
  }

  const handleReorderWithinChapter = async (partidaId: string, chapterId: string | null) => {
    const chapterGroup = chapterId ? chapters.find(c => c.chapter.id === chapterId) : null
    const currentPartidas = chapterGroup ? [...chapterGroup.partidas] : [...orphans]

    const sourceIdx = currentPartidas.findIndex(p => p.id === partidaId)
    const targetIdx = currentPartidas.findIndex(p => p.id === dragOverPartidaId)
    if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) {
      restoreDragState()
      return
    }

    // Remove from old position, insert at new position
    const [moved] = currentPartidas.splice(sourceIdx, 1)
    let insertIdx = currentPartidas.findIndex(p => p.id === dragOverPartidaId)
    if (insertIdx === -1) insertIdx = currentPartidas.length
    if (dropPosition === 'below') insertIdx += 1
    currentPartidas.splice(insertIdx, 0, moved)

    // Optimistic UI update
    if (chapterGroup) {
      setChapters(prev => prev.map(ch =>
        ch.chapter.id === chapterId ? { ...ch, partidas: currentPartidas } : ch
      ))
    } else {
      setOrphans(currentPartidas)
    }

    // Build reorder payload
    const reorderPayload = currentPartidas.map((p, idx) => ({ id: p.id, sort_order: idx + 1 }))

    try {
      await api.put('/library/partidas/reorder', { partidas: reorderPayload })
    } catch {
      addToast('error', 'Error al reordenar partidas')
      await loadGrouped(true)
    } finally {
      restoreDragState()
    }
  }

  const handleDragEnd = () => {
restoreDragState()
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnterChapter = (chapterId: string | null) => {
    setDragOverChapterId(chapterId)
    dragOverChapterRef.current = chapterId
  }

  const handleDropOnChapter = async (partidaId: string, rawTargetId: string | null) => {
    if (!partidaId) return

    const targetChapterId = rawTargetId === '__orphan__' ? null : rawTargetId

    // Find which chapter the partida currently belongs to
    const currentChapterId = (() => {
      for (const ch of chapters) {
        if (ch.partidas.some(p => p.id === partidaId)) return ch.chapter.id
      }
      return null // orphan
    })()

    // Same chapter → reorder within the chapter
    if (currentChapterId === targetChapterId) {
      if (!dragOverPartidaId || !dropPosition) {
        restoreDragState()
        return
      }
      await handleReorderWithinChapter(partidaId, currentChapterId)
      return
    }

    // Find chapter_code for the target
    const targetChapterGroup = targetChapterId
      ? chapters.find(c => c.chapter.id === targetChapterId)
      : null
    const targetChapter = targetChapterGroup?.chapter || null

    // Calculate the next available partida code in the target chapter
    let newCode: string | null = null
    if (targetChapter) {
      const targetPartidas = targetChapterGroup?.partidas || []
      let maxNum = 0
      for (const p of targetPartidas) {
        if (p.code) {
          const parts = p.code.split('.')
          if (parts.length >= 2) {
            const num = parseInt(parts[parts.length - 1])
            if (!isNaN(num) && num > maxNum) maxNum = num
          }
        }
      }
      newCode = `${targetChapter.code}.${String(maxNum + 1).padStart(2, '0')}`
    }

    const payload = {
      library_chapter_id: targetChapterId || null,
      chapter_code: targetChapter?.code || null,
      sort_order: (targetChapterGroup?.partidas.length || 0) + 1,
      ...(newCode ? { code: newCode } : {}),
    }
    try {
      await api.put(`/library/partidas/${partidaId}`, payload)
      addToast('success', targetChapter
        ? `Partida movida a "${targetChapter.name}"`
        : 'Partida movida a "Sin capítulo"'
      )
      await loadGrouped(true)
    } catch {
      addToast('error', 'Error al mover la partida')
    } finally {
      restoreDragState()
    }
  }

  // ─── Chapter Drag & Drop (reorder) ──────────────────────────
  const handleChapterDragStart = (e: React.DragEvent, chapterId: string) => {
    setDraggingChapterId(chapterId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/chapter', chapterId)
  }

  const handleChapterDragEnd = () => {
    setDraggingChapterId(null)
    setDragOverChapterTargetId(null)
    chapterGripActive.current = null
  }

  const handleChapterDragOver = (e: React.DragEvent) => {
    if (!draggingChapterId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleChapterDragEnter = (targetId: string) => {
    if (!draggingChapterId || targetId === draggingChapterId) return
    setDragOverChapterTargetId(targetId)
  }

  const handleChapterDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const sourceId = e.dataTransfer.getData('application/chapter')
    if (!sourceId || sourceId === targetId || reorderingChapters) {
      setDraggingChapterId(null)
      setDragOverChapterTargetId(null)
      return
    }

    // Reorder locally
    const currentOrder = chapters.map(c => c.chapter.id)
    const sourceIdx = currentOrder.indexOf(sourceId)
    const targetIdx = currentOrder.indexOf(targetId)
    if (sourceIdx === -1 || targetIdx === -1) return

    const newOrder = [...currentOrder]
    newOrder.splice(sourceIdx, 1)
    newOrder.splice(targetIdx, 0, sourceId)

    // Reorder chapters in state + auto-number codes
    const reordered = newOrder.map((id, idx) => {
      const ch = chapters.find(c => c.chapter.id === id)!
      return {
        ...ch,
        chapter: { ...ch.chapter, code: String(idx + 1).padStart(2, '0'), sort_order: idx + 1 },
      }
    })
    setChapters(reordered)
    setDraggingChapterId(null)
    setDragOverChapterTargetId(null)
    setReorderingChapters(true)

    // Save to backend
    try {
      await api.put('/library/chapters/reorder', {
        chapters: reordered.map((ch, idx) => ({
          id: ch.chapter.id,
          code: ch.chapter.code,
          sort_order: idx + 1,
        })),
      })
      addToast('success', 'Capítulos reordenados')
      await loadGrouped(true)
    } catch {
      addToast('error', 'Error al reordenar capítulos')
      await loadGrouped(true) // Rollback
    } finally {
      setReorderingChapters(false)
    }
  }

  const sourceLabel: Record<string, { text: string; color: string }> = {
    manual: { text: 'Manual', color: 'bg-gray-100 text-gray-600' },
    from_budget: { text: 'Presupuesto', color: 'bg-blue-100 text-blue-700' },
    imported: { text: 'Importada', color: 'bg-green-100 text-green-700' },
  }

  const renderPartidaRow = (p: SavedPartida) => {
    const src = sourceLabel[p.source] || sourceLabel.manual
    const isSelected = selectedIds.has(p.id)
    const isDragging = draggingPartidaId === p.id
    const isDropTarget = dragOverPartidaId === p.id && draggingPartidaId && draggingPartidaId !== p.id
    return (
      <div
        key={p.id}
        draggable
        onDragStart={(e) => handleDragStart(e, p.id)}
        onDrag={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => {
          if (!draggingPartidaId || draggingPartidaId === p.id) return
          e.preventDefault()
          e.stopPropagation()
          const rect = e.currentTarget.getBoundingClientRect()
          const midY = rect.top + rect.height / 2
          setDragOverPartidaId(p.id)
          setDropPosition(e.clientY < midY ? 'above' : 'below')
        }}
        onDragLeave={() => {
          if (dragOverPartidaId === p.id) {
            setDragOverPartidaId(null)
            setDropPosition(null)
          }
        }}
        onClick={() => openEditPartida(p)}
        className={`relative flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50/50 transition cursor-pointer group ${
          isSelected ? 'bg-blue-50/30' : ''
        } ${isDragging ? 'opacity-40' : ''}`}
      >
        {isDropTarget && dropPosition === 'above' && (
          <div className="absolute top-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10 -translate-y-px pointer-events-none" />
        )}
        {isDropTarget && dropPosition === 'below' && (
          <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10 translate-y-px pointer-events-none" />
        )}
        <div
          className="cursor-grab active:cursor-grabbing shrink-0 text-gray-300 hover:text-gray-500 transition"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <button onClick={(e) => { e.stopPropagation(); toggleSelect(p.id) }} className="p-0.5 text-gray-400 hover:text-blue-600 transition shrink-0">
          {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
        </button>
        <span className="text-xs font-mono text-gray-400 w-16 shrink-0">{p.code}</span>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="text-sm text-gray-900 truncate min-w-0">{p.name}</h4>
            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${src.color}`}>{src.text}</span>
            {p.is_auxiliary && (
              <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-amber-100 text-amber-700 font-semibold" title="Partida auxiliar (sin tope de cantidad)">
                AUX ∞
              </span>
            )}
            {p.usage_count > 0 && (
              <span className="text-[10px] text-gray-400 shrink-0">{p.usage_count} uso{p.usage_count !== 1 ? 's' : ''}</span>
            )}
          </div>
          {p.description && <p className="text-xs text-gray-400 truncate" title={p.description}>{p.description}</p>}
        </div>
        <span className="text-xs text-gray-400 w-8 text-center shrink-0">{p.unit}</span>
        {(() => {
          const sale = Number(p.unit_price || 0)
          const cost = Number(p.cost_price || 0)
          const margin = sale - cost
          const marginPct = sale > 0 ? (margin / sale) * 100 : 0
          return (
            <div className="w-28 text-right shrink-0 leading-tight">
              <div className="text-sm font-medium text-gray-900">{formatCurrency(sale)}</div>
              {cost > 0 && (
                <div className="text-[10px] text-gray-400" title={`Coste ${formatCurrency(cost)} · Margen ${formatCurrency(margin)} (${marginPct.toFixed(0)}%)`}>
                  coste {formatCurrency(cost)} · <span className={marginPct < 10 ? 'text-amber-600' : 'text-emerald-600'}>{marginPct.toFixed(0)}%</span>
                </div>
              )}
            </div>
          )
        })()}
        <div className="flex items-center gap-1 w-16 justify-end shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); openEditPartida(p) }}
            className="p-1 text-gray-400 hover:text-blue-600 rounded transition"
            title="Editar partida"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDeletePartida(p.id) }}
            className="p-1 text-gray-400 hover:text-red-500 rounded transition"
            title="Eliminar partida"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ── Floating selection bar (visible when partidas selected + scrolled) ── */}
      {selectedIds.size > 0 && !draggingPartidaId && (
        <div className="fixed top-0 left-56 right-0 z-40 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 shadow-lg flex items-center gap-4">
          <CheckSquare className="w-4 h-4" />
          <span className="text-sm font-medium">
            {selectedIds.size} partida{selectedIds.size > 1 ? 's' : ''} seleccionada{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-lg transition shadow-sm disabled:opacity-50"
          >
            {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Eliminar ({selectedIds.size})
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-sm text-white/70 hover:text-white transition flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
        </div>
      )}

      {/* ── Floating chapter drop zones (visible during partida drag) ── */}
      {draggingPartidaId && (
        <div className="fixed top-0 left-56 right-0 z-50 bg-white/95 backdrop-blur-sm border-b-2 border-purple-200 shadow-lg px-6 py-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Soltar en capítulo:</p>
          <div className="flex flex-wrap gap-2">
            {chapters.map(({ chapter }) => {
              const isOver = dragOverChapterId === chapter.id
              return (
                <div
                  key={chapter.id}
                  data-chapter-id={chapter.id}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverChapterId(chapter.id); dragOverChapterRef.current = chapter.id }}
                  onDragLeave={() => { if (dragOverChapterId === chapter.id) { setDragOverChapterId(null); dragOverChapterRef.current = null } }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const pid = e.dataTransfer.getData('text/plain'); if (pid) handleDropOnChapter(pid, chapter.id) }}
                  className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition ${
                    isOver
                      ? 'border-purple-400 bg-purple-100 text-purple-700 scale-105'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="font-mono text-xs mr-1">{chapter.code}</span>
                  {chapter.name}
                </div>
              )
            })}
            <div
              data-chapter-id="__orphan__"
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverChapterId('__orphan__'); dragOverChapterRef.current = '__orphan__' }}
              onDragLeave={() => { if (dragOverChapterId === '__orphan__') { setDragOverChapterId(null); dragOverChapterRef.current = null } }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const pid = e.dataTransfer.getData('text/plain'); if (pid) handleDropOnChapter(pid, '__orphan__') }}
              className={`px-3 py-1.5 rounded-lg border-2 border-dashed text-sm font-medium transition ${
                dragOverChapterId === '__orphan__'
                  ? 'border-amber-400 bg-amber-100 text-amber-700 scale-105'
                  : 'border-gray-300 bg-gray-50 text-gray-500 hover:border-gray-400'
              }`}
            >
              Sin capítulo
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {!loading && allPartidas.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg"><Hash className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Total partidas</p>
                <p className="text-xl font-bold text-gray-900">{totalPartidas}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg"><Layers className="w-5 h-5 text-purple-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Capítulos</p>
                <p className="text-xl font-bold text-gray-900">{totalChapters}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg"><BarChart3 className="w-5 h-5 text-amber-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Precio medio</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(avgPrice)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search + Actions */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por capítulo, partida, código o tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
          />
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-2 px-3 py-2.5 text-sm bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 active:bg-red-200 rounded-lg transition shadow-sm disabled:opacity-50"
          >
            {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Eliminar ({selectedIds.size})
          </button>
        )}
        <button
          onClick={openCreateChapter}
          className="flex items-center gap-2 px-4 py-2.5 text-sm bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-lg transition shadow-sm shrink-0"
        >
          <FolderPlus className="w-4 h-4" /> Nuevo Capítulo
        </button>
        <button
          onClick={() => openCreatePartida()}
          className="flex items-center gap-2 px-4 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" /> Nueva Partida
        </button>
      </div>

      {/* Chapters Accordion */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : filteredChapters.length === 0 && filteredOrphans.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">
            {search ? 'No se encontraron partidas' : 'No hay partidas guardadas'}
          </p>
          <p className="text-sm text-gray-400">
            {!search && 'Guarda partidas desde presupuestos o crea nuevas manualmente'}
          </p>
        </div>
      ) : (
        <div
          className="space-y-3"
          onDragOver={(e) => { if (draggingPartidaId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
          onDrop={(e) => {
            // Fallback: if drop lands between chapter divs, use the ref
            const pid = e.dataTransfer.getData('text/plain')
            if (pid && dragOverChapterRef.current) {
              e.preventDefault()
              handleDropOnChapter(pid, dragOverChapterRef.current)
            }
          }}
        >
          {filteredChapters.map(({ chapter, partidas }, chapterIdx) => {
            const isExpanded = expandedChapters.has(chapter.id)
            const chapterTotal = partidas.reduce((sum, p) => sum + Number(p.unit_price), 0)
            const isPartidaDropTarget = draggingPartidaId && dragOverChapterId === chapter.id
            const isChapterDropTarget = draggingChapterId && dragOverChapterTargetId === chapter.id && draggingChapterId !== chapter.id
            const isBeingDragged = draggingChapterId === chapter.id
            return (
              <div
                key={chapter.id}
                data-chapter-id={chapter.id}
                draggable={!draggingPartidaId && !reorderingChapters}
                onDragStart={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (reorderingChapters) { e.preventDefault(); return }
                  if (chapterGripActive.current !== chapter.id) { e.preventDefault(); return }
                  handleChapterDragStart(e, chapter.id)
                }}
                onDragEnd={handleChapterDragEnd}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDragEnter={() => {
                  if (draggingPartidaId) handleDragEnterChapter(chapter.id)
                  if (draggingChapterId) handleChapterDragEnter(chapter.id)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const types = Array.from(e.dataTransfer.types)
                  const pid = e.dataTransfer.getData('text/plain')
                  // Use the ref (always current) to get the REAL target chapter the user hovered over,
                  // because the drop event may fire on the source chapter div (parent of the dragged partida)
                  const realTarget = dragOverChapterRef.current
                  if (types.includes('application/chapter')) {
                    handleChapterDrop(e, chapter.id)
                  } else if (pid) {
                    handleDropOnChapter(pid, realTarget)
                  }
                }}
                className={`bg-white rounded-xl border-2 transition-all ${
                  isPartidaDropTarget ? 'border-purple-400 bg-purple-50/30'
                  : isChapterDropTarget ? 'border-blue-400 bg-blue-50/30 ring-2 ring-blue-200'
                  : isBeingDragged ? 'border-gray-300 opacity-50'
                  : 'border-gray-200'
                }`}
              >
                {/* Chapter header */}
                <div
                  className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 transition min-w-0"
                  onClick={() => toggleChapter(chapter.id)}
                >
                  {/* Drag handle */}
                  <div
                    data-chapter-grip
                    className={`p-0.5 -ml-1 transition shrink-0 ${
                      reorderingChapters ? 'cursor-wait text-gray-200' : 'cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500'
                    }`}
                    title={reorderingChapters ? 'Guardando orden...' : 'Arrastrar para reordenar'}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={() => { if (!reorderingChapters) chapterGripActive.current = chapter.id }}
                    onMouseUp={() => { chapterGripActive.current = null }}
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <span className="text-xs font-mono font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded shrink-0">
                    {chapter.code}
                  </span>
                  <h3 className="text-sm font-semibold text-gray-900 flex-1 min-w-0 truncate">{chapter.name}</h3>
                  <span className="text-xs text-gray-400 shrink-0">
                    ({partidas.length})
                  </span>
                  <span className="text-xs font-medium text-gray-500 shrink-0">
                    {formatCurrency(chapterTotal)}
                  </span>
                  {/* Action buttons - inline after description */}
                  <div className="flex items-center gap-1 shrink-0 ml-auto" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openCreatePartida(chapter.id)}
                      className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition"
                      title="Añadir partida"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openEditChapter(chapter)}
                      className="p-1.5 text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition"
                      title="Editar capítulo"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteChapter(chapter.id)}
                      className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition"
                      title="Eliminar capítulo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {/* Partidas inside chapter */}
                {isExpanded && partidas.length > 0 && (
                  <div className="border-t border-gray-100">
                    {partidas.map(renderPartidaRow)}
                  </div>
                )}
                {isExpanded && partidas.length === 0 && (
                  <div className="border-t border-gray-100 px-4 py-6 text-center">
                    <p className="text-xs text-gray-400">Sin partidas en este capítulo</p>
                    <button
                      onClick={() => openCreatePartida(chapter.id)}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-700"
                    >
                      + Añadir partida
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {/* Orphan partidas (also drop target) */}
          {(filteredOrphans.length > 0 || draggingPartidaId) && (
            <div
              data-chapter-id="__orphan__"
              className={`bg-white rounded-xl border-2 overflow-hidden transition-colors ${
                draggingPartidaId && dragOverChapterId === '__orphan__' ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200'
              }`}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDragEnter={() => handleDragEnterChapter('__orphan__')}
              onDrop={(e) => { e.preventDefault(); const pid = e.dataTransfer.getData('text/plain'); if (pid) handleDropOnChapter(pid, dragOverChapterRef.current || '__orphan__') }}
            >
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b">
                <Layers className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-500 flex-1">Sin capítulo</h3>
                <span className="text-xs text-gray-400">
                  {filteredOrphans.length} partida{filteredOrphans.length !== 1 ? 's' : ''}
                </span>
              </div>
              {filteredOrphans.length > 0 ? (
                filteredOrphans.map(renderPartidaRow)
              ) : draggingPartidaId ? (
                <div className="px-4 py-6 text-center text-xs text-gray-400">
                  Suelta aquí para quitar del capítulo
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Partida Modal */}
      {showPartidaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{editingPartidaId ? 'Editar Partida' : 'Nueva Partida'}</h2>
              <button onClick={() => { setDuplicateWarning([]); setShowPartidaModal(false) }} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Codigo *</label>
                  <input
                    value={partidaForm.code} onChange={(e) => setPartidaForm({ ...partidaForm, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="01.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
                  <select
                    value={partidaForm.unit}
                    onChange={(e) => setPartidaForm({ ...partidaForm, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    size={1}
                  >
                    <option value="">— Seleccionar —</option>
                    {units.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                  {/* Add custom unit */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <input
                      type="text"
                      value={newUnitInput}
                      onChange={(e) => setNewUnitInput(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && newUnitInput.trim()) {
                          e.preventDefault()
                          setAddingUnit(true)
                          try {
                            await api.post('/library/units', { value: newUnitInput.trim(), label: newUnitInput.trim() })
                            await loadUnits()
                            setPartidaForm(f => ({ ...f, unit: newUnitInput.trim() }))
                            setNewUnitInput('')
                          } catch { /* ignore duplicate */ }
                          finally { setAddingUnit(false) }
                        }
                      }}
                      placeholder="Nueva unidad..."
                      className="flex-1 px-2.5 py-1.5 rounded-md border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      disabled={!newUnitInput.trim() || addingUnit}
                      onClick={async () => {
                        if (!newUnitInput.trim()) return
                        setAddingUnit(true)
                        try {
                          await api.post('/library/units', { value: newUnitInput.trim(), label: newUnitInput.trim() })
                          await loadUnits()
                          setPartidaForm(f => ({ ...f, unit: newUnitInput.trim() }))
                          setNewUnitInput('')
                        } catch { /* ignore duplicate */ }
                        finally { setAddingUnit(false) }
                      }}
                      className="px-2.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md transition disabled:opacity-40"
                    >
                      {addingUnit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capítulo</label>
                  <select
                    value={partidaForm.library_chapter_id}
                    onChange={(e) => setPartidaForm({ ...partidaForm, library_chapter_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sin capítulo</option>
                    {chapters.map(({ chapter }) => (
                      <option key={chapter.id} value={chapter.id}>{chapter.code} - {chapter.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  value={partidaForm.name} onChange={(e) => setPartidaForm({ ...partidaForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nombre de la partida"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
                <textarea
                  value={partidaForm.description} onChange={(e) => setPartidaForm({ ...partidaForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                  placeholder="Descripcion detallada..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio Venta</label>
                  <DecimalInput
                    value={partidaForm.unit_price} onChange={(v) => setPartidaForm({ ...partidaForm, unit_price: v })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio Coste</label>
                  <DecimalInput
                    value={partidaForm.cost_price} onChange={(v) => setPartidaForm({ ...partidaForm, cost_price: v })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50/60 border border-amber-200">
                <input
                  id="partida-is-auxiliary"
                  type="checkbox"
                  checked={partidaForm.is_auxiliary}
                  onChange={(e) => setPartidaForm({ ...partidaForm, is_auxiliary: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="partida-is-auxiliary" className="flex-1 text-sm text-amber-900 cursor-pointer">
                  <span className="font-medium">Partida auxiliar (sin tope de cantidad)</span>
                  <br />
                  <span className="text-xs text-amber-700">
                    Para ayudas de albañilería, medios auxiliares, limpieza… Al llevarla a un presupuesto se puede certificar/imputar más cantidad de la presupuestada.
                  </span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                <input
                  value={partidaForm.tags} onChange={(e) => setPartidaForm({ ...partidaForm, tags: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="albanileria, demolicion, estructura... (separados por coma)"
                />
              </div>
              {duplicateWarning.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Ya existe {duplicateWarning.length === 1 ? 'una partida similar' : 'partidas similares'}:
                  </p>
                  <div className="space-y-1">
                    {duplicateWarning.map(d => (
                      <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-amber-700 truncate">
                          <span className="font-mono font-medium">{d.code}</span> — {d.name}
                        </span>
                        <button
                          onClick={() => { setDuplicateWarning([]); setShowPartidaModal(false); setSearch(d.code || d.name) }}
                          className="text-blue-600 hover:text-blue-700 hover:underline shrink-0"
                        >
                          Ver en listado
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-amber-600">¿Deseas crear la partida de todas formas?</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t">
              <button onClick={() => { setDuplicateWarning([]); setShowPartidaModal(false) }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                Cancelar
              </button>
              <button
                onClick={() => handleSavePartida(duplicateWarning.length > 0)}
                disabled={!partidaForm.name || !partidaForm.code}
                className={`px-4 py-2 text-sm text-white rounded-lg transition disabled:opacity-50 ${
                  duplicateWarning.length > 0 ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {editingPartidaId ? 'Guardar' : duplicateWarning.length > 0 ? 'Crear de todas formas' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Chapter Modal */}
      {showChapterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{editingChapterId ? 'Editar Capítulo' : 'Nuevo Capítulo'}</h2>
              <button onClick={() => setShowChapterModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
                <input
                  value={chapterForm.code} onChange={(e) => setChapterForm({ ...chapterForm, code: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  value={chapterForm.name} onChange={(e) => setChapterForm({ ...chapterForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Albañilería, Demoliciones..."
                  autoFocus
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowChapterModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                Cancelar
              </button>
              <button
                onClick={handleSaveChapter}
                disabled={!chapterForm.name || !chapterForm.code}
                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50"
              >
                {editingChapterId ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ──── Workers Tab (Personal de Obra) ─────────────────────────────

const WORKER_ROLES = [
  'Peón', 'Oficial 1ª', 'Oficial 2ª', 'Oficial 3ª', 'Encargado',
  'Jefe de obra', 'Capataz', 'Gruista', 'Ferrallista',
  'Electricista', 'Fontanero', 'Pintor', 'Soldador', 'Albañil',
  'Carpintero', 'Cristalero', 'Escayolista', 'Yesero', 'Otro',
]

function WorkersTab() {
  const { addToast } = useNotificationStore()
  const { workers, loading, loadWorkers, createWorker, updateWorker, deleteWorker } = useWorkersStore()
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('active')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Worker>>({
    name: '', role: 'Peón', hourly_rate: 0, status: 'active',
  })

  useEffect(() => { loadWorkers({ status: filterStatus || undefined }) }, [filterStatus])

  const filtered = useMemo(() => {
    let list = workers
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(w => w.name.toLowerCase().includes(s) || (w.dni && w.dni.toLowerCase().includes(s)) || (w.specialty && w.specialty.toLowerCase().includes(s)))
    }
    if (filterRole) list = list.filter(w => w.role === filterRole)
    return list
  }, [workers, search, filterRole])

  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', role: 'Peón', hourly_rate: 0, status: 'active', dni: '', phone: '', email: '', specialty: '', emergency_contact: '', notes: '', hire_date: new Date().toISOString().split('T')[0] })
    setShowModal(true)
  }

  const openEdit = (w: Worker) => {
    setEditingId(w.id)
    setForm({ ...w })
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      if (!form.name?.trim()) { addToast('error', 'El nombre es obligatorio'); return }
      if (editingId) {
        await updateWorker(editingId, form)
        addToast('success', 'Trabajador actualizado')
      } else {
        await createWorker(form)
        addToast('success', 'Trabajador creado')
      }
      setShowModal(false)
      loadWorkers({ status: filterStatus || undefined })
    } catch (e: any) {
      addToast('error', e.message || 'Error')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name}?`)) return
    try {
      await deleteWorker(id)
      addToast('success', 'Trabajador eliminado')
    } catch (e: any) {
      addToast('error', e.message || 'Error')
    }
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-600',
    on_leave: 'bg-yellow-100 text-yellow-700',
  }
  const statusLabels: Record<string, string> = {
    active: 'Activo', inactive: 'Inactivo', on_leave: 'De baja',
  }

  return (
    <div className="mt-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Buscar trabajador..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="text-sm border rounded-lg px-3 py-2">
          <option value="">Todos los roles</option>
          {WORKER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-sm border rounded-lg px-3 py-2">
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="on_leave">De baja</option>
        </select>
        <button onClick={openCreate} className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" /> Añadir Trabajador
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500">Total activos</p>
          <p className="text-2xl font-bold text-gray-900">{workers.filter(w => w.status === 'active').length}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500">Roles distintos</p>
          <p className="text-2xl font-bold text-gray-900">{new Set(workers.map(w => w.role)).size}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500">Subcontratados</p>
          <p className="text-2xl font-bold text-gray-900">{workers.filter(w => w.is_subcontracted).length}</p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hay trabajadores</p>
          <p className="text-sm mt-1">Añade personal de obra para seleccionarlos en los partes</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">DNI/NIE</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Rol</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Especialidad</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">€/hora</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Contacto</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(w => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {w.name}
                    {w.is_subcontracted && <span className="ml-2 text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">SUB</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{w.dni || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{w.role}</td>
                  <td className="px-4 py-3 text-gray-500">{w.specialty || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{w.hourly_rate.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[w.status]}`}>{statusLabels[w.status]}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-gray-400">
                      {w.phone && <span title={w.phone}><Phone className="w-3.5 h-3.5" /></span>}
                      {w.email && <span title={w.email}><Mail className="w-3.5 h-3.5" /></span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(w)} className="p-1.5 hover:bg-gray-100 rounded"><Edit3 className="w-4 h-4 text-gray-400" /></button>
                      <button onClick={() => handleDelete(w.id, w.name)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editingId ? 'Editar Trabajador' : 'Nuevo Trabajador'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                  <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">DNI/NIE</label>
                  <input value={form.dni || ''} onChange={e => setForm({ ...form, dni: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rol *</label>
                  <select value={form.role || 'Peón'} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {WORKER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Especialidad</label>
                  <input value={form.specialty || ''} onChange={e => setForm({ ...form, specialty: e.target.value })} placeholder="Albañilería, electricidad..." className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tarifa €/hora</label>
                  <DecimalInput value={form.hourly_rate || 0} onChange={v => setForm({ ...form, hourly_rate: v })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                  <select value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value as Worker['status'] })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                    <option value="on_leave">De baja</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
                  <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contacto de emergencia</label>
                <input value={form.emergency_contact || ''} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de alta</label>
                  <input type="date" value={form.hire_date || ''} onChange={e => setForm({ ...form, hire_date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de baja</label>
                  <input type="date" value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_subcontracted" checked={form.is_subcontracted || false} onChange={e => setForm({ ...form, is_subcontracted: e.target.checked })} className="rounded" />
                <label htmlFor="is_subcontracted" className="text-sm text-gray-700">Trabajador subcontratado</label>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingId ? 'Guardar' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ──── Equipment Tab (Maquinaria) ─────────────────────────────────

const EQUIPMENT_CATEGORIES = [
  'Excavación', 'Elevación', 'Transporte', 'Compactación', 'Hormigonado',
  'Encofrado', 'Soldadura', 'Corte', 'Andamios', 'Señalización',
  'Iluminación', 'Bombeo', 'Generadores', 'Herramienta menor', 'Otro',
]

function EquipmentTab() {
  const { addToast } = useNotificationStore()
  const { equipment, loading, loadEquipment, createEquipment, updateEquipment, deleteEquipment } = useEquipmentCatalogStore()
  const { suppliers, loadSuppliers } = useSuppliersStore()
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('available')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<EquipmentCatalogItem>>({
    name: '', type: 'propia', hourly_rate: 0, daily_rate: 0, status: 'available',
  })

  // Supplier materials for the selected supplier
  const [supplierMaterials, setSupplierMaterials] = useState<SupplierMaterial[]>([])
  const [linkedMaterialIds, setLinkedMaterialIds] = useState<Set<string>>(new Set())
  const [equipmentLinks, setEquipmentLinks] = useState<any[]>([]) // existing links for editing
  const [loadingSM, setLoadingSM] = useState(false)

  useEffect(() => { loadEquipment({ status: filterStatus || undefined }) }, [filterStatus])
  useEffect(() => { loadSuppliers() }, [])

  // When supplier changes in form, fetch its materials
  const fetchSupplierMaterials = async (supplierId: string | null) => {
    if (!supplierId) { setSupplierMaterials([]); return }
    setLoadingSM(true)
    try {
      const res = await api.get(`/supplier-materials/supplier/${supplierId}`)
      setSupplierMaterials(res.data || [])
    } catch { setSupplierMaterials([]) }
    setLoadingSM(false)
  }

  // When editing, fetch existing equipment-material links
  const fetchEquipmentLinks = async (equipmentId: string) => {
    try {
      const res = await api.get(`/equipment-catalog/${equipmentId}/materials`)
      setEquipmentLinks(res.data || [])
      setLinkedMaterialIds(new Set((res.data || []).map((l: any) => l.supplier_material_id)))
    } catch { setEquipmentLinks([]); setLinkedMaterialIds(new Set()) }
  }

  const toggleMaterialLink = async (smId: string) => {
    if (editingId) {
      // Editing existing equipment: immediate API calls
      try {
        if (linkedMaterialIds.has(smId)) {
          const link = equipmentLinks.find((l: any) => l.supplier_material_id === smId)
          if (link) {
            await api.delete(`/equipment-catalog/${editingId}/materials/${link.id}`)
            addToast('success', 'Material desvinculado')
          }
        } else {
          await api.post(`/equipment-catalog/${editingId}/materials`, { supplier_material_id: smId })
          addToast('success', 'Material vinculado')
        }
        await fetchEquipmentLinks(editingId)
      } catch (e: any) {
        addToast('error', e.message || 'Error al vincular material')
      }
    } else {
      // Creating new equipment: toggle in local state, save later
      setLinkedMaterialIds(prev => {
        const next = new Set(prev)
        if (next.has(smId)) next.delete(smId)
        else next.add(smId)
        return next
      })
    }
  }

  const filtered = useMemo(() => {
    let list = equipment
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(e => e.name.toLowerCase().includes(s) || (e.code && e.code.toLowerCase().includes(s)) || (e.category && e.category.toLowerCase().includes(s)))
    }
    if (filterType) list = list.filter(e => e.type === filterType)
    return list
  }, [equipment, search, filterType])

  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', type: 'propia', hourly_rate: 0, daily_rate: 0, status: 'available', code: '', category: '', license_plate: '', serial_number: '', notes: '' })
    setSupplierMaterials([])
    setLinkedMaterialIds(new Set())
    setEquipmentLinks([])
    setShowModal(true)
  }

  const openEdit = async (e: EquipmentCatalogItem) => {
    setEditingId(e.id)
    setForm({ ...e })
    setShowModal(true)
    if (e.supplier_id) {
      fetchSupplierMaterials(e.supplier_id)
      fetchEquipmentLinks(e.id)
    } else {
      setSupplierMaterials([])
      setLinkedMaterialIds(new Set())
      setEquipmentLinks([])
    }
  }

  const handleSave = async () => {
    try {
      if (!form.name?.trim()) { addToast('error', 'El nombre es obligatorio'); return }
      if (editingId) {
        await updateEquipment(editingId, form)
        addToast('success', 'Equipo actualizado')
      } else {
        const created = await createEquipment(form)
        // Link selected materials after creation
        if (created?.id && linkedMaterialIds.size > 0) {
          const linkPromises = Array.from(linkedMaterialIds).map(smId =>
            api.post(`/equipment-catalog/${created.id}/materials`, { supplier_material_id: smId }).catch(() => null)
          )
          await Promise.all(linkPromises)
          addToast('success', `Equipo creado con ${linkedMaterialIds.size} material(es) vinculado(s)`)
        } else {
          addToast('success', 'Equipo creado')
        }
      }
      setShowModal(false)
      loadEquipment({ status: filterStatus || undefined })
    } catch (e: any) {
      addToast('error', e.message || 'Error')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar ${name}?`)) return
    try {
      await deleteEquipment(id)
      addToast('success', 'Equipo eliminado')
    } catch (e: any) {
      addToast('error', e.message || 'Error')
    }
  }

  const statusColors: Record<string, string> = {
    available: 'bg-green-100 text-green-700',
    in_use: 'bg-blue-100 text-blue-700',
    maintenance: 'bg-yellow-100 text-yellow-700',
    retired: 'bg-gray-100 text-gray-600',
  }
  const statusLabels: Record<string, string> = {
    available: 'Disponible', in_use: 'En uso', maintenance: 'Mantenimiento', retired: 'Retirada',
  }

  return (
    <div className="mt-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Buscar maquinaria..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="text-sm border rounded-lg px-3 py-2">
          <option value="">Todas</option>
          <option value="propia">Propia</option>
          <option value="alquilada">Alquilada</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-sm border rounded-lg px-3 py-2">
          <option value="">Todos</option>
          <option value="available">Disponible</option>
          <option value="in_use">En uso</option>
          <option value="maintenance">Mantenimiento</option>
          <option value="retired">Retirada</option>
        </select>
        <button onClick={openCreate} className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" /> Añadir Maquinaria
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500">Disponibles</p>
          <p className="text-2xl font-bold text-gray-900">{equipment.filter(e => e.status === 'available').length}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500">Propias</p>
          <p className="text-2xl font-bold text-gray-900">{equipment.filter(e => e.type === 'propia').length}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500">Alquiladas</p>
          <p className="text-2xl font-bold text-gray-900">{equipment.filter(e => e.type === 'alquilada').length}</p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Wrench className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hay maquinaria</p>
          <p className="text-sm mt-1">Añade equipos para seleccionarlos en los partes de obra</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Código</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Categoría</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Tipo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">€/hora</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">€/día</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Proveedor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Matrícula</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{e.code || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{e.category || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${e.type === 'propia' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                      {e.type === 'propia' ? 'Propia' : 'Alquilada'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{e.hourly_rate.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{e.daily_rate.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[e.status]}`}>{statusLabels[e.status]}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.supplier_id ? (suppliers.find(s => s.id === e.supplier_id)?.name || '—') : '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.license_plate || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(e)} className="p-1.5 hover:bg-gray-100 rounded"><Edit3 className="w-4 h-4 text-gray-400" /></button>
                      <button onClick={() => handleDelete(e.id, e.name)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editingId ? 'Editar Maquinaria' : 'Nueva Maquinaria'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                  <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Código</label>
                  <input value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="EQ-001" className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                  <select value={form.type || 'propia'} onChange={e => setForm({ ...form, type: e.target.value as EquipmentCatalogItem['type'] })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="propia">Propia</option>
                    <option value="alquilada">Alquilada</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
                  <select value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Sin categoría</option>
                    {EQUIPMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor</label>
                <select value={form.supplier_id || ''} onChange={e => {
                  const sid = e.target.value || null
                  setForm({ ...form, supplier_id: sid })
                  fetchSupplierMaterials(sid)
                  if (!sid) { setLinkedMaterialIds(new Set()); setEquipmentLinks([]) }
                }} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Sin proveedor</option>
                  {suppliers.filter(s => s.is_active).map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.tax_id ? ` (${s.tax_id})` : ''}</option>
                  ))}
                </select>
              </div>
              {/* Supplier materials list (portes, etc.) */}
              {form.supplier_id && (
                <div className="border rounded-lg p-3 bg-gray-50">
                  <label className="block text-xs font-medium text-gray-600 mb-2">Materiales del proveedor {linkedMaterialIds.size > 0 && <span className="text-blue-600 font-medium">({linkedMaterialIds.size} seleccionado{linkedMaterialIds.size > 1 ? 's' : ''})</span>}</label>
                  {loadingSM ? (
                    <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /></div>
                  ) : supplierMaterials.length === 0 ? (
                    <p className="text-xs text-gray-400">Este proveedor no tiene materiales asociados</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {supplierMaterials.map(sm => {
                        const isLinked = linkedMaterialIds.has(sm.id)
                        return (
                          <div
                            key={sm.id}
                            onClick={() => toggleMaterialLink(sm.id)}
                            className={`flex items-center justify-between px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${isLinked ? 'bg-blue-50 border border-blue-300' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {isLinked ? <CheckSquare className="w-5 h-5 text-blue-600 shrink-0" /> : <Square className="w-5 h-5 text-gray-400 shrink-0" />}
                              <span className={`truncate ${isLinked ? 'text-blue-800 font-medium' : 'text-gray-700'}`}>{sm.material?.name || 'Material'}</span>
                              {sm.material?.unit && <span className="text-[10px] text-gray-400 shrink-0">({sm.material.unit})</span>}
                            </div>
                            <span className="text-xs font-mono text-gray-600 shrink-0 ml-2">{sm.unit_price.toFixed(2)} €</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tarifa €/hora</label>
                  <DecimalInput value={form.hourly_rate || 0} onChange={v => setForm({ ...form, hourly_rate: v })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tarifa €/día</label>
                  <DecimalInput value={form.daily_rate || 0} onChange={v => setForm({ ...form, daily_rate: v })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Matrícula</label>
                  <input value={form.license_plate || ''} onChange={e => setForm({ ...form, license_plate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nº Serie</label>
                  <input value={form.serial_number || ''} onChange={e => setForm({ ...form, serial_number: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                  <select value={form.status || 'available'} onChange={e => setForm({ ...form, status: e.target.value as EquipmentCatalogItem['status'] })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="available">Disponible</option>
                    <option value="in_use">En uso</option>
                    <option value="maintenance">Mantenimiento</option>
                    <option value="retired">Retirada</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Próximo mantenimiento</label>
                  <input type="date" value={form.maintenance_next || ''} onChange={e => setForm({ ...form, maintenance_next: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingId ? 'Guardar' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
