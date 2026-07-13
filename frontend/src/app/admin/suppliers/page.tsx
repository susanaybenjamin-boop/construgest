'use client'

import React, { useEffect, useState } from 'react'
import { useSuppliersStore } from '@/stores/suppliersStore'
import { useMaterialsStore } from '@/stores/materialsStore'
import { useNotificationStore } from '@/stores/notificationStore'
import api from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { DecimalInput } from '@/components/ui/DecimalInput'
import type { Supplier, SupplierMaterial, Material, ComparisonRow, ComparisonData } from '@/types'
import {
  Building2, Plus, Search, Star, Phone, Mail, MapPin, Globe,
  Trash2, Edit, X, Loader2, Truck, User, Package,
  ArrowLeftRight, ChevronDown, ChevronUp, Award, Hash, Link2, Unlink,
} from 'lucide-react'

const CATEGORIES = [
  'Materiales de construccion',
  'Electricidad',
  'Fontaneria',
  'Pintura',
  'Carpinteria',
  'Ferrreteria',
  'Maquinaria',
  'Transporte',
  'Seguridad',
  'Otros',
]

const emptyForm = {
  name: '',
  tax_id: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  province: '',
  postal_code: '',
  website: '',
  category: '',
  notes: '',
  rating: 0,
}

function StarRating({ rating, onChange }: { rating: number; onChange?: (r: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(star === rating ? 0 : star)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
          disabled={!onChange}
        >
          <Star
            className={`w-4 h-4 ${
              star <= rating
                ? 'fill-amber-400 text-amber-400'
                : 'text-gray-300'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

// ─── Supplier Materials Detail Modal ─────────────────────────────
const STANDARD_UNITS = [
  'ud', 'm', 'm²', 'm³', 'ml', 'kg', 'g', 't',
  'l', 'h', 'dia', 'sem', 'mes',
  'pa', 'paq', 'rollo', 'saco', 'bote', 'caja', 'palet',
]

function SupplierMaterialsModal({
  supplier,
  onClose,
}: {
  supplier: Supplier
  onClose: () => void
}) {
  const { addToast } = useNotificationStore()
  const { materials, loadMaterials, categories, loadCategories, fetchNextCode, fetchPrefixes, createMaterial } = useMaterialsStore()
  const [items, setItems] = useState<SupplierMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addMode, setAddMode] = useState<'associate' | 'create'>('associate')
  const [saving, setSaving] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState(0)
  const [editNotes, setEditNotes] = useState('')
  const [addForm, setAddForm] = useState({ material_id: '', unit_price: 0, notes: '' })
  const [newForm, setNewForm] = useState({
    code: '', name: '', unit: 'ud', unit_price: 0, sale_price: 0,
    category_id: '', brand: '', notes: '',
  })
  const [generatingCode, setGeneratingCode] = useState(false)
  const [prefixInput, setPrefixInput] = useState('')
  const [showPrefixDropdown, setShowPrefixDropdown] = useState(false)
  const [existingPrefixes, setExistingPrefixes] = useState<{ prefix: string; count: number }[]>([])

  const filteredPrefixes = prefixInput.trim()
    ? existingPrefixes.filter((p) => p.prefix.includes(prefixInput.toUpperCase().trim()))
    : existingPrefixes

  useEffect(() => {
    loadItems()
    loadMaterials()
    loadCategories()
    fetchPrefixes().then(setExistingPrefixes).catch(() => {})
  }, [supplier.id])

  const loadItems = async () => {
    setLoading(true)
    try {
      const { data } = await api.get<SupplierMaterial[]>(`/supplier-materials/supplier/${supplier.id}`)
      setItems(data)
    } catch {
      addToast('error', 'Error al cargar materiales del proveedor')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!addForm.material_id || (addForm.unit_price !== 0 && !addForm.unit_price)) return
    setSaving(true)
    try {
      await api.post('/supplier-materials', {
        supplier_id: supplier.id,
        material_id: addForm.material_id,
        unit_price: addForm.unit_price,
        notes: addForm.notes || null,
      })
      addToast('success', 'Material asociado al proveedor')
      setShowAddForm(false)
      setAddForm({ material_id: '', unit_price: 0, notes: '' })
      loadItems()
    } catch {
      addToast('error', 'Error al asociar material (puede que ya exista)')
    } finally {
      setSaving(false)
    }
  }

  const selectPrefix = async (prefix: string) => {
    setPrefixInput(prefix)
    setShowPrefixDropdown(false)
    setGeneratingCode(true)
    try {
      const code = await fetchNextCode(prefix)
      setNewForm((f) => ({ ...f, code }))
    } catch {
      addToast('error', 'Error al generar código')
    } finally {
      setGeneratingCode(false)
    }
  }

  const generateCodeFromInput = async () => {
    const prefix = prefixInput.trim().toUpperCase()
    if (!prefix) { addToast('error', 'Escribe un prefijo primero'); return }
    await selectPrefix(prefix)
  }

  const openCreateMode = async () => {
    setAddMode('create')
    setShowAddForm(true)
    setNewForm({ code: '', name: '', unit: 'ud', unit_price: 0, sale_price: 0, category_id: '', brand: '', notes: '' })
    const prefix = supplier.name.split(/\s+/)[0].toUpperCase()
    setPrefixInput(prefix)
    setGeneratingCode(true)
    try {
      const code = await fetchNextCode(prefix)
      setNewForm((f) => ({ ...f, code }))
    } catch { /* ignore */ }
    setGeneratingCode(false)
  }

  const handleCreateNew = async () => {
    if (!newForm.code || !newForm.name) return
    setSaving(true)
    try {
      // 1. Create the material
      const { data: created } = await api.post('/materials', {
        code: newForm.code,
        name: newForm.name,
        unit: newForm.unit,
        unit_price: newForm.unit_price,
        sale_price: newForm.sale_price,
        category_id: newForm.category_id || null,
        brand: newForm.brand || null,
        notes: newForm.notes || null,
      })
      // 2. Associate it to this supplier
      await api.post('/supplier-materials', {
        supplier_id: supplier.id,
        material_id: created.id,
        unit_price: newForm.unit_price,
        notes: null,
      })
      addToast('success', 'Material creado y asociado al proveedor')
      setShowAddForm(false)
      setNewForm({ code: '', name: '', unit: 'ud', unit_price: 0, sale_price: 0, category_id: '', brand: '', notes: '' })
      loadItems()
      loadMaterials()
      fetchPrefixes().then(setExistingPrefixes).catch(() => {})
    } catch {
      addToast('error', 'Error al crear material')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (id: string) => {
    setSaving(true)
    try {
      await api.put(`/supplier-materials/${id}`, { unit_price: editPrice, notes: editNotes })
      addToast('success', 'Precio actualizado')
      setEditingItemId(null)
      loadItems()
    } catch {
      addToast('error', 'Error al actualizar precio')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Quitar este material del proveedor?')) return
    try {
      await api.delete(`/supplier-materials/${id}`)
      addToast('success', 'Material eliminado del proveedor')
      loadItems()
    } catch {
      addToast('error', 'Error al eliminar')
    }
  }

  const startEdit = (item: SupplierMaterial) => {
    setEditingItemId(item.id)
    setEditPrice(Number(item.unit_price))
    setEditNotes(item.notes || '')
  }

  // Materials not yet associated
  const existingMaterialIds = new Set(items.map((i) => i.material_id))
  const availableMaterials = materials.filter((m) => !existingMaterialIds.has(m.id))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Materiales de {supplier.name}</h2>
            <p className="text-sm text-gray-500">{items.length} material{items.length !== 1 ? 'es' : ''} asociado{items.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {/* Materials Table */}
              {items.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-xl">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">Este proveedor no tiene materiales asociados</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-2.5 text-left">Codigo</th>
                        <th className="px-4 py-2.5 text-left">Material</th>
                        <th className="px-4 py-2.5 text-center">Unidad</th>
                        <th className="px-4 py-2.5 text-right">Precio Proveedor</th>
                        <th className="px-4 py-2.5 text-right">Precio Ref.</th>
                        <th className="px-4 py-2.5 text-left">Notas</th>
                        <th className="px-4 py-2.5 text-center w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                          <td className="px-4 py-2.5 text-sm text-gray-500 font-mono">
                            {item.material?.code || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-sm font-medium text-gray-900">
                            {item.material?.name || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-gray-500 text-center">
                            {item.material?.unit || '-'}
                          </td>
                          {editingItemId === item.id ? (
                            <>
                              <td className="px-4 py-2.5">
                                <DecimalInput
                                  value={editPrice}
                                  onChange={(v) => setEditPrice(v)}
                                  className="w-24 px-2 py-1 rounded border border-blue-300 text-sm text-right outline-none focus:ring-2 focus:ring-blue-500"
                                  autoFocus
                                />
                              </td>
                              <td className="px-4 py-2.5 text-sm text-gray-400 text-right">
                                {formatCurrency(Number(item.material?.unit_price || 0))}
                              </td>
                              <td className="px-4 py-2.5">
                                <input
                                  value={editNotes}
                                  onChange={(e) => setEditNotes(e.target.value)}
                                  className="w-full px-2 py-1 rounded border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Notas..."
                                />
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleUpdate(item.id)}
                                    disabled={saving}
                                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
                                  >
                                    OK
                                  </button>
                                  <button
                                    onClick={() => setEditingItemId(null)}
                                    className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded transition"
                                  >
                                    X
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-2.5 text-sm font-medium text-right text-gray-900">
                                {formatCurrency(Number(item.unit_price))}
                              </td>
                              <td className="px-4 py-2.5 text-sm text-gray-400 text-right">
                                {formatCurrency(Number(item.material?.unit_price || 0))}
                              </td>
                              <td className="px-4 py-2.5 text-sm text-gray-400 truncate max-w-[150px]">
                                {item.notes || '-'}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => startEdit(item)}
                                    className="p-1 text-gray-400 hover:text-blue-600 rounded transition"
                                    title="Editar precio"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(item.id)}
                                    className="p-1 text-gray-400 hover:text-red-500 rounded transition"
                                    title="Quitar material"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add Material Form */}
              {showAddForm ? (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  {/* Mode toggle */}
                  <div className="flex items-center gap-1 p-1 bg-gray-200 rounded-lg w-fit">
                    <button
                      onClick={() => setAddMode('associate')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                        addMode === 'associate' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Asociar existente
                    </button>
                    <button
                      onClick={() => { setAddMode('create'); if (!newForm.code) openCreateMode() }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                        addMode === 'create' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Crear nuevo
                    </button>
                  </div>

                  {addMode === 'associate' ? (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-1">
                          <label className="block text-xs text-gray-500 mb-1">Material *</label>
                          <select
                            value={addForm.material_id}
                            onChange={(e) => {
                              const matId = e.target.value
                              setAddForm({ ...addForm, material_id: matId })
                              if (matId) {
                                const mat = materials.find((m) => m.id === matId)
                                if (mat) setAddForm((prev) => ({ ...prev, material_id: matId, unit_price: Number(mat.unit_price) }))
                              }
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Seleccionar material...</option>
                            {availableMaterials.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.code} - {m.name} ({m.unit})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Precio *</label>
                          <DecimalInput
                            value={addForm.unit_price}
                            onChange={(v) => setAddForm({ ...addForm, unit_price: v })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-right"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Notas</label>
                          <input
                            value={addForm.notes}
                            onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Observaciones..."
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition">
                          Cancelar
                        </button>
                        <button
                          onClick={handleAdd}
                          disabled={!addForm.material_id || (addForm.unit_price !== 0 && !addForm.unit_price) || saving}
                          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Asociar'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Row 1: Prefix + Code */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Prefijo</label>
                          <div className="relative">
                            <div className="flex gap-1">
                              <input
                                value={prefixInput}
                                onChange={(e) => {
                                  const v = e.target.value.toUpperCase()
                                  setPrefixInput(v)
                                  setShowPrefixDropdown(true)
                                }}
                                onFocus={() => setShowPrefixDropdown(true)}
                                onBlur={() => setTimeout(() => setShowPrefixDropdown(false), 200)}
                                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                                placeholder="Escribe o selecciona..."
                              />
                              <button
                                onClick={generateCodeFromInput}
                                disabled={generatingCode || !prefixInput.trim()}
                                className="px-2 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition disabled:opacity-50"
                                title="Generar siguiente código"
                              >
                                {generatingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4" />}
                              </button>
                            </div>
                            {showPrefixDropdown && existingPrefixes.length > 0 && (
                              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {filteredPrefixes.length > 0 ? (
                                  filteredPrefixes.map((p) => (
                                      <button
                                        key={p.prefix}
                                        onMouseDown={(e) => { e.preventDefault(); selectPrefix(p.prefix) }}
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center justify-between transition"
                                      >
                                        <span className="font-mono font-medium">{p.prefix}</span>
                                        <span className="text-xs text-gray-400">{p.count} mat.</span>
                                      </button>
                                  ))
                                ) : (
                                  <div className="px-3 py-2 text-xs text-gray-400">
                                    Sin coincidencias — pulsa # para crear &quot;{prefixInput}&quot;
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Código *</label>
                          <input
                            value={newForm.code}
                            onChange={(e) => setNewForm({ ...newForm, code: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-gray-50"
                            placeholder="PROV-001"
                          />
                        </div>
                      </div>
                      {/* Row 2: Name + Unit */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                          <input
                            value={newForm.name}
                            onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Nombre del material"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Unidad</label>
                          <select
                            value={STANDARD_UNITS.includes(newForm.unit) ? newForm.unit : 'ud'}
                            onChange={(e) => setNewForm({ ...newForm, unit: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {STANDARD_UNITS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Precio coste</label>
                          <DecimalInput
                            value={newForm.unit_price}
                            onChange={(v) => setNewForm({ ...newForm, unit_price: v })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-right"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Precio venta</label>
                          <DecimalInput
                            value={newForm.sale_price}
                            onChange={(v) => setNewForm({ ...newForm, sale_price: v })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-right"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Categoría</label>
                          <select
                            value={newForm.category_id}
                            onChange={(e) => setNewForm({ ...newForm, category_id: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Sin categoría</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>{c.name_es}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Marca</label>
                          <input
                            value={newForm.brand}
                            onChange={(e) => setNewForm({ ...newForm, brand: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Notas</label>
                          <input
                            value={newForm.notes}
                            onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Observaciones..."
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition">
                          Cancelar
                        </button>
                        <button
                          onClick={handleCreateNew}
                          disabled={!newForm.code || !newForm.name || saving}
                          className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear y asociar'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setAddMode('associate'); setShowAddForm(true) }}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition"
                  >
                    <Plus className="w-4 h-4" /> Asociar existente
                  </button>
                  <button
                    onClick={openCreateMode}
                    className="flex items-center gap-2 text-sm text-green-600 hover:text-green-700 transition"
                  >
                    <Plus className="w-4 h-4" /> Crear nuevo material
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Price Comparison Tab ────────────────────────────────────────
function PriceComparisonTab() {
  const { groupMaterials, ungroupMaterial, loadComparison } = useMaterialsStore()
  const { addToast } = useNotificationStore()
  const [data, setData] = useState<ComparisonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set()) // row indices as "type-idx"
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [grouping, setGrouping] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const result = await loadComparison()
      setData(result)
    } catch {
      addToast('error', 'Error al cargar comparativa')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const filteredRows = (data?.rows || []).filter(row => {
    if (!search) return true
    const q = search.toLowerCase()
    return row.materials.some(m =>
      m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)
    )
  })

  // Only show rows that have at least one supplier price
  const rowsWithPrices = filteredRows.filter(r => Object.keys(r.supplier_prices).length > 0)
  const suppliers = data?.suppliers || []

  const toggleSelect = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      const key = String(idx)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const toggleExpand = (groupId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId)
      return next
    })
  }

  const handleGroup = async () => {
    const allMaterialIds: string[] = []
    for (const key of selected) {
      const row = rowsWithPrices[Number(key)]
      if (row) row.materials.forEach(m => allMaterialIds.push(m.id))
    }
    if (allMaterialIds.length < 2) {
      addToast('warning', 'Selecciona al menos 2 materiales para vincular')
      return
    }
    setGrouping(true)
    try {
      await groupMaterials(allMaterialIds)
      addToast('success', `${allMaterialIds.length} materiales vinculados como equivalentes`)
      setSelected(new Set())
      await reload()
    } catch {
      addToast('error', 'Error al vincular materiales')
    } finally {
      setGrouping(false)
    }
  }

  const handleUngroup = async (materialId: string) => {
    try {
      await ungroupMaterial(materialId)
      addToast('success', 'Material desvinculado')
      await reload()
    } catch {
      addToast('error', 'Error al desvincular')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-9 flex-1 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-9 w-32 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse mb-1" />
              <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar material..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          />
        </div>
        {selected.size >= 2 && (
          <button
            onClick={handleGroup}
            disabled={grouping}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {grouping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Vincular como equivalente ({selected.size})
          </button>
        )}
      </div>

      {rowsWithPrices.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No hay materiales con precios de proveedor</p>
          <p className="text-gray-400 text-xs mt-1">Importa materiales desde Excel/PDF para ver la comparativa</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-3 py-3 text-left w-10">
                  <span className="sr-only">Seleccionar</span>
                </th>
                <th className="px-3 py-3 text-left font-medium text-gray-600 min-w-[250px]">Material</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 w-16">Ud.</th>
                {suppliers.map(s => (
                  <th key={s.id} className="px-3 py-3 text-right font-medium text-gray-600 min-w-[110px]">
                    <div className="truncate max-w-[110px]" title={s.name}>{s.name}</div>
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-medium text-gray-600 w-24">Mejor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rowsWithPrices.map((row, idx) => {
                const prices = suppliers.map(s => {
                  const sp = row.supplier_prices[s.id]
                  return sp ? sp.price : null
                })
                const validPrices = prices.filter((p): p is number => p !== null)
                const bestPrice = validPrices.length > 0 ? Math.min(...validPrices) : null
                const isGroup = row.type === 'group'
                const isExpanded = row.group_id ? expanded.has(row.group_id) : false
                const isSelected = selected.has(String(idx))

                return (
                  <React.Fragment key={row.group_id || row.materials[0]?.id || idx}>
                    <tr className={`transition ${isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-50/30'}`}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(idx)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {isGroup && (
                            <button
                              onClick={() => toggleExpand(row.group_id!)}
                              className="p-0.5 hover:bg-gray-200 rounded"
                            >
                              {isExpanded
                                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                                : <ChevronDown className="w-4 h-4 text-gray-400" />}
                            </button>
                          )}
                          {isGroup && <Link2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                          <div>
                            <span className="font-medium text-gray-900">{row.canonical_name}</span>
                            {isGroup && (
                              <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                {row.materials.length} equiv.
                              </span>
                            )}
                            {!isGroup && (
                              <span className="ml-2 text-xs text-gray-400 font-mono">{row.materials[0]?.code}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{row.unit}</td>
                      {suppliers.map((s, si) => {
                        const price = prices[si]
                        const isBest = price !== null && price === bestPrice && validPrices.length > 1
                        return (
                          <td key={s.id} className="px-3 py-2.5 text-right">
                            {price !== null ? (
                              <span className={`font-medium ${isBest ? 'text-green-700 bg-green-50 px-1.5 py-0.5 rounded' : 'text-gray-900'}`}>
                                {formatCurrency(price)}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2.5 text-right">
                        {bestPrice !== null ? (
                          <span className="font-semibold text-green-700">{formatCurrency(bestPrice)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                    {/* Expanded sub-rows for groups */}
                    {isGroup && isExpanded && row.materials.map(mat => (
                      <tr key={mat.id} className="bg-gray-50/50">
                        <td className="px-3 py-1.5" />
                        <td className="px-3 py-1.5 pl-14">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-mono">{mat.code}</span>
                            <span className="text-xs text-gray-600">{mat.name}</span>
                            <button
                              onClick={() => handleUngroup(mat.id)}
                              className="ml-auto text-gray-400 hover:text-red-500 p-0.5"
                              title="Desvincular"
                            >
                              <Unlink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-center text-xs text-gray-400">{mat.unit}</td>
                        {suppliers.map(s => (
                          <td key={s.id} className="px-3 py-1.5 text-right text-xs text-gray-400">
                            {row.supplier_prices[s.id]?.material_name === mat.name
                              ? formatCurrency(row.supplier_prices[s.id].price)
                              : ''}
                          </td>
                        ))}
                        <td className="px-3 py-1.5" />
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Selecciona 2 o mas materiales y haz clic en &quot;Vincular como equivalente&quot; para comparar precios del mismo producto entre proveedores.
      </p>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────
export default function SuppliersPage() {
  const { suppliers, loading, loadSuppliers, createSupplier, updateSupplier, deleteSupplier } = useSuppliersStore()
  const { addToast } = useNotificationStore()

  const [activeTab, setActiveTab] = useState<'suppliers' | 'compare'>(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'compare') return 'compare'
    return 'suppliers'
  })
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [materialsSupplier, setMaterialsSupplier] = useState<Supplier | null>(null)

  useEffect(() => {
    loadSuppliers()
  }, [])

  const filtered = suppliers.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      (s.contact_name && s.contact_name.toLowerCase().includes(q)) ||
      (s.category && s.category.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.city && s.city.toLowerCase().includes(q))
    )
  })

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (supplier: Supplier) => {
    setEditingId(supplier.id)
    setForm({
      name: supplier.name,
      tax_id: supplier.tax_id || '',
      contact_name: supplier.contact_name || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      city: supplier.city || '',
      province: supplier.province || '',
      postal_code: supplier.postal_code || '',
      website: supplier.website || '',
      category: supplier.category || '',
      notes: supplier.notes || '',
      rating: supplier.rating || 0,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      addToast('error', 'El nombre es obligatorio')
      return
    }
    try {
      const payload = {
        ...form,
        tax_id: form.tax_id || null,
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        province: form.province || null,
        postal_code: form.postal_code || null,
        website: form.website || null,
        category: form.category || null,
        notes: form.notes || null,
      }

      if (editingId) {
        await updateSupplier(editingId, payload)
        addToast('success', 'Proveedor actualizado correctamente')
      } else {
        await createSupplier(payload)
        addToast('success', 'Proveedor creado correctamente')
      }
      setShowModal(false)
    } catch {
      addToast('error', 'Error al guardar el proveedor')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Desactivar este proveedor?')) return
    try {
      await deleteSupplier(id)
      addToast('success', 'Proveedor desactivado')
    } catch {
      addToast('error', 'Error al desactivar el proveedor')
    }
  }

  // Summary stats
  const activeCount = suppliers.length
  const withEmail = suppliers.filter((s) => s.email).length
  const avgRating = suppliers.length
    ? (suppliers.reduce((sum, s) => sum + (s.rating || 0), 0) / suppliers.length).toFixed(1)
    : '0'
  const categoriesCount = new Set(suppliers.filter((s) => s.category).map((s) => s.category)).size

  if (loading) {
    return (
      <div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="h-3 w-16 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-6 w-12 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 flex-1 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-9 w-36 bg-blue-100 rounded-lg animate-pulse" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
              <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-36 bg-gray-200 rounded animate-pulse mb-1" />
                <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
              </div>
              <div className="h-5 w-16 bg-gray-200 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header — sticky */}
      <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
            <p className="text-gray-500 text-sm mt-1">
              Gestion de proveedores, materiales y comparativa de precios
            </p>
          </div>
          {activeTab === 'suppliers' && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nuevo Proveedor
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-200/60 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              activeTab === 'suppliers'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Proveedores
            </div>
          </button>
          <button
            onClick={() => setActiveTab('compare')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              activeTab === 'compare'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" />
              Comparativa de Precios
            </div>
          </button>
        </div>
      </div>

      {/* ─── TAB: Suppliers ─── */}
      {activeTab === 'suppliers' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Proveedores</p>
                  <p className="text-lg font-bold text-gray-900">{activeCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Con Email</p>
                  <p className="text-lg font-bold text-gray-900">{withEmail}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Star className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Valoracion Media</p>
                  <p className="text-lg font-bold text-gray-900">{avgRating}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Categorias</p>
                  <p className="text-lg font-bold text-gray-900">{categoriesCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          {suppliers.length > 0 && (
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, contacto, categoria, email o ciudad..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                />
              </div>
            </div>
          )}

          {/* Supplier Cards */}
          {suppliers.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
              <Truck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No hay proveedores registrados</p>
              <p className="text-gray-400 text-sm mt-1">Haz clic en &quot;Nuevo Proveedor&quot; para comenzar</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No se encontraron proveedores para &quot;{search}&quot;</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((supplier) => (
                <div
                  key={supplier.id}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-200 transition group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{supplier.name}</h3>
                        {supplier.category && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full shrink-0">
                            {supplier.category}
                          </span>
                        )}
                      </div>
                      <StarRating rating={supplier.rating || 0} />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition ml-2">
                      <button
                        onClick={() => setMaterialsSupplier(supplier)}
                        className="p-1.5 text-gray-400 hover:text-green-600 rounded transition"
                        title="Ver materiales"
                      >
                        <Package className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(supplier)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(supplier.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded transition"
                        title="Desactivar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    {supplier.contact_name && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{supplier.contact_name}</span>
                      </div>
                    )}
                    {supplier.phone && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{supplier.phone}</span>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{supplier.email}</span>
                      </div>
                    )}
                    {(supplier.city || supplier.province) && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">
                          {[supplier.city, supplier.province].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                    {supplier.website && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{supplier.website}</span>
                      </div>
                    )}
                  </div>

                  {/* Footer: materials button + tax_id */}
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <button
                      onClick={() => setMaterialsSupplier(supplier)}
                      className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 transition"
                    >
                      <Package className="w-3.5 h-3.5" />
                      Ver materiales
                    </button>
                    {supplier.tax_id && (
                      <span className="text-xs text-gray-400">NIF/CIF: {supplier.tax_id}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── TAB: Price Comparison ─── */}
      {activeTab === 'compare' && <PriceComparisonTab />}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-lg font-semibold">
                {editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Name & Tax ID */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nombre del proveedor"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">NIF/CIF</label>
                  <input
                    value={form.tax_id}
                    onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="B12345678"
                  />
                </div>
              </div>

              {/* Contact & Category */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Persona de Contacto</label>
                  <input
                    value={form.contact_name}
                    onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nombre del contacto"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sin categoria</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+34 600 000 000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="contacto@proveedor.com"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Direccion</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Calle, numero, piso..."
                />
              </div>

              {/* City, Province, Postal Code */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ciudad"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
                  <input
                    value={form.province}
                    onChange={(e) => setForm({ ...form, province: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Provincia"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Codigo Postal</label>
                  <input
                    value={form.postal_code}
                    onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="28001"
                  />
                </div>
              </div>

              {/* Website */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sitio Web</label>
                <input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://www.proveedor.com"
                />
              </div>

              {/* Rating */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valoracion</label>
                <StarRating
                  rating={form.rating}
                  onChange={(r) => setForm({ ...form, rating: r })}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  placeholder="Notas adicionales sobre el proveedor..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t sticky bottom-0 bg-white rounded-b-2xl">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim()}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition shadow-sm disabled:opacity-50"
              >
                {editingId ? 'Guardar Cambios' : 'Crear Proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Materials Modal */}
      {materialsSupplier && (
        <SupplierMaterialsModal
          supplier={materialsSupplier}
          onClose={() => setMaterialsSupplier(null)}
        />
      )}
    </div>
  )
}
