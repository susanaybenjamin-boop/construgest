'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useWorkLogStore } from '@/stores/workLogStore'
import { useBudgetStore } from '@/stores/budgetStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useWorkersStore } from '@/stores/workersStore'
import { useEquipmentCatalogStore } from '@/stores/equipmentCatalogStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DecimalInput } from '@/components/ui/DecimalInput'
import api from '@/lib/api'
import type { WorkLog, FullWorkLog, ProjectExpense, Material, Worker, EquipmentCatalogItem, CertifiableWorkLog, CertifiableItem } from '@/types'
import {
  HardHat, Plus, Loader2, Trash2, Search, Edit, ArrowLeft,
  Users, Package, Wrench, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Minus, LinkIcon, X, BarChart3, Receipt,
  Sun, Cloud, CloudRain, CloudSnow, Wind, Check, ArrowUpDown, ArrowUp, ArrowDown,
  ClipboardList, FileText, Lock as LockIcon,
} from 'lucide-react'
import CertifyFromWorkLogsModal from '@/components/certifications/CertifyFromWorkLogsModal'

type Tab = 'list' | 'detail' | 'cost-control'
type SortField = 'date' | 'description' | 'weather'
type SortDir = 'asc' | 'desc'

const SORT_STORAGE_KEY = 'construgest_worklog_sort'

function loadSortPref(): { field: SortField; dir: SortDir } {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.field && parsed.dir) return parsed
    }
  } catch {}
  return { field: 'date', dir: 'desc' }
}

function saveSortPref(field: SortField, dir: SortDir) {
  localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ field, dir }))
}

// Sub-entry sorting (labor, materials, equipment, expenses)
type SubSortKey = 'labor' | 'materials' | 'equipment' | 'expenses'
const SUB_SORT_STORAGE_KEY = 'construgest_worklog_subsort'

function loadSubSortPrefs(): Record<SubSortKey, { field: string; dir: SortDir }> {
  try {
    const raw = localStorage.getItem(SUB_SORT_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { labor: { field: 'role', dir: 'asc' }, materials: { field: 'material_name', dir: 'asc' }, equipment: { field: 'equipment_name', dir: 'asc' }, expenses: { field: 'date', dir: 'desc' } }
}

function saveSubSortPrefs(prefs: Record<SubSortKey, { field: string; dir: SortDir }>) {
  localStorage.setItem(SUB_SORT_STORAGE_KEY, JSON.stringify(prefs))
}

function SortableHeader({ label, field, currentField, currentDir, onSort, align = 'left' }: { label: string; field: string; currentField: string; currentDir: SortDir; onSort: (field: string) => void; align?: 'left' | 'right' | 'center' }) {
  const textAlign = align === 'right' ? 'text-right justify-end' : align === 'center' ? 'text-center justify-center' : 'text-left'
  return (
    <th className={`py-1 ${textAlign} cursor-pointer select-none hover:text-gray-600 transition`} onClick={() => onSort(field)}>
      <span className={`inline-flex items-center gap-0.5 ${textAlign}`}>
        {label}
        {currentField === field ? (currentDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
      </span>
    </th>
  )
}

function sortEntries<T>(entries: T[], field: string, dir: SortDir): T[] {
  return [...entries].sort((a: any, b: any) => {
    let va = a[field], vb = b[field]
    if (va == null) va = ''
    if (vb == null) vb = ''
    let cmp: number
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb
    } else {
      cmp = String(va).localeCompare(String(vb))
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

const WEATHER_OPTIONS = [
  { value: 'sunny', icon: Sun, label: 'Soleado' },
  { value: 'cloudy', icon: Cloud, label: 'Nublado' },
  { value: 'rainy', icon: CloudRain, label: 'Lluvioso' },
  { value: 'snowy', icon: CloudSnow, label: 'Nieve' },
  { value: 'windy', icon: Wind, label: 'Ventoso' },
]

export default function DailyWorkPage() {
  const { t } = useTranslation()
  const params = useParams()
  const projectId = params.id as string

  const {
    workLogs, activeWorkLog, costControl, costSummary, loading,
    loadWorkLogs, loadFullWorkLog, createWorkLog, updateWorkLog, deleteWorkLog,
    addLabor, updateLabor, deleteLabor,
    addMaterial, updateMaterial, deleteMaterial,
    addEquipment, updateEquipment, deleteEquipment,
    addBudgetLink, updateBudgetLink, deleteBudgetLink,
    loadCostControl, loadCostSummary,
  } = useWorkLogStore()

  const { budgets, activeBudget, loadBudgets, loadFullBudget } = useBudgetStore()
  const { addToast } = useNotificationStore()

  const [tab, setTab] = useState<Tab>('list')
  const [costSubTab, setCostSubTab] = useState<'profit' | 'breakdown'>('profit')
  const [costDateFrom, setCostDateFrom] = useState('')
  const [costDateTo, setCostDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>(() => loadSortPref().field)
  const [sortDir, setSortDir] = useState<SortDir>(() => loadSortPref().dir)
  const [subSorts, setSubSorts] = useState(() => loadSubSortPrefs())

  const toggleSubSort = (section: SubSortKey, field: string) => {
    setSubSorts(prev => {
      const cur = prev[section]
      let newDir: SortDir = 'asc'
      if (cur.field === field) {
        newDir = cur.dir === 'asc' ? 'desc' : 'asc'
      } else if (field === 'date' || field === 'total') {
        newDir = 'desc'
      }
      const next = { ...prev, [section]: { field, dir: newDir } }
      saveSubSortPrefs(next)
      return next
    })
  }
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    weather: '',
    notes: '',
  })

  // Sub-entry forms
  const [showLaborForm, setShowLaborForm] = useState(false)
  const [laborForm, setLaborForm] = useState({ role: '', worker_count: '1', hours: '', hourly_rate: '', date: new Date().toISOString().split('T')[0], worker_id: '', description: '' })
  const [laborErrors, setLaborErrors] = useState<Set<string>>(new Set())
  const [showMaterialForm, setShowMaterialForm] = useState(false)
  const [materialForm, setMaterialForm] = useState({ material_name: '', quantity: '', unit: 'ud', unit_price: '', date: new Date().toISOString().split('T')[0], description: '' })
  const [materialErrors, setMaterialErrors] = useState<Set<string>>(new Set())
  const [showEquipmentForm, setShowEquipmentForm] = useState(false)
  const [equipmentForm, setEquipmentForm] = useState({ equipment_name: '', hours: '', hourly_rate: '', date: new Date().toISOString().split('T')[0], equipment_id: '', description: '' })
  const [equipmentErrors, setEquipmentErrors] = useState<Set<string>>(new Set())

  // Workers catalog search
  const { workers: catalogWorkers, loadWorkers: loadCatalogWorkers } = useWorkersStore()
  const [showWorkerSuggestions, setShowWorkerSuggestions] = useState(false)
  const [workerSearch, setWorkerSearch] = useState('')
  const filteredWorkers = useMemo(() => {
    if (!workerSearch || workerSearch.length < 1) return catalogWorkers.filter(w => w.status === 'active').slice(0, 8)
    const s = workerSearch.toLowerCase()
    return catalogWorkers.filter(w => w.status === 'active' && (w.name.toLowerCase().includes(s) || w.role.toLowerCase().includes(s))).slice(0, 8)
  }, [catalogWorkers, workerSearch])

  // Equipment catalog search
  const { equipment: catalogEquipment, loadEquipment: loadCatalogEquipment } = useEquipmentCatalogStore()
  const [showEquipCatalogSuggestions, setShowEquipCatalogSuggestions] = useState(false)
  const [equipCatalogSearch, setEquipCatalogSearch] = useState('')
  const [equipLinkedMaterials, setEquipLinkedMaterials] = useState<any[]>([])

  const fetchEquipLinkedMaterials = async (equipId: string) => {
    try {
      const res = await api.get(`/equipment-catalog/${equipId}/materials`)
      setEquipLinkedMaterials(res.data || [])
    } catch { setEquipLinkedMaterials([]) }
  }
  const filteredEquipCatalog = useMemo(() => {
    if (!equipCatalogSearch || equipCatalogSearch.length < 1) return catalogEquipment.filter(e => e.status === 'available' || e.status === 'in_use').slice(0, 8)
    const s = equipCatalogSearch.toLowerCase()
    return catalogEquipment.filter(e => e.name.toLowerCase().includes(s) || (e.code && e.code.toLowerCase().includes(s))).slice(0, 8)
  }, [catalogEquipment, equipCatalogSearch])

  // Library search states (materials)
  const [materialLibraryResults, setMaterialLibraryResults] = useState<Material[]>([])
  const [showMaterialSuggestions, setShowMaterialSuggestions] = useState(false)

  // Library search states (equipment)
  const [equipmentLibraryResults, setEquipmentLibraryResults] = useState<Material[]>([])
  const [showEquipmentSuggestions, setShowEquipmentSuggestions] = useState(false)

  // Inline editing states for sub-entries
  const [editingLaborId, setEditingLaborId] = useState<string | null>(null)
  const [editingLaborForm, setEditingLaborForm] = useState({ role: '', worker_count: '1', hours: '', hourly_rate: '', description: '', date: '' })
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null)
  const [editingMaterialForm, setEditingMaterialForm] = useState({ material_name: '', quantity: '', unit: 'ud', unit_price: '', description: '', date: '' })
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null)
  const [editingEquipmentForm, setEditingEquipmentForm] = useState({ equipment_name: '', hours: '', hourly_rate: '', description: '', date: '' })

  // Budget link
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkForm, setLinkForm] = useState({ budget_item_id: '', executed_quantity: '', notes: '' })
  type AvailableItem = {
    id: string; chapter_id: string; chapter_code: string; chapter_name: string;
    chapter_sort_order?: number; code: string; name: string;
    description: string | null; unit: string; quantity: number; unit_price: number;
    cost_price: number; executed_other_logs: number; certified_total: number;
    remaining: number | null; is_auxiliary?: boolean;
  }
  const [availableItems, setAvailableItems] = useState<AvailableItem[]>([])

  // Expense linking
  const [showExpenseLinkForm, setShowExpenseLinkForm] = useState(false)
  const [unlinkedExpenses, setUnlinkedExpenses] = useState<ProjectExpense[]>([])
  const [selectedExpenseId, setSelectedExpenseId] = useState('')
  // "link" = vincular existente · "create" = crear nuevo directamente aquí
  const [expenseFormMode, setExpenseFormMode] = useState<'link' | 'create'>('link')
  const [newExpense, setNewExpense] = useState({
    concept: '',
    amount: '',
    tax_amount: '',
    supplier_name: '',
    date: new Date().toISOString().slice(0, 10),
  })
  const [savingNewExpense, setSavingNewExpense] = useState(false)

  // Certify from this work log modal
  const [showCertifyModal, setShowCertifyModal] = useState(false)
  const [certifyPreselection, setCertifyPreselection] = useState<CertifiableWorkLog[]>([])

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['labor', 'materials', 'equipment', 'expenses', 'budget-links']))

  useEffect(() => {
    loadWorkLogs(projectId)
    loadCostControl(projectId); loadCostSummary(projectId)
    loadCatalogWorkers({ status: 'active' })
    loadCatalogEquipment()
  }, [projectId])

  // Load budgets for linking (Fase 2)
  useEffect(() => {
    loadBudgets(projectId)
  }, [projectId])

  // Auto-load first budget when available
  useEffect(() => {
    if (budgets.length > 0 && !activeBudget) {
      loadFullBudget(budgets[0].id)
    }
  }, [budgets, activeBudget])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      next.has(section) ? next.delete(section) : next.add(section)
      return next
    })
  }

  const openCertifyFromThisLog = async () => {
    if (!activeWorkLog) return
    try {
      const { data } = await api.get<CertifiableWorkLog[]>(`/work-logs/project/${projectId}/certifiable`)
      const thisLog = data.find(d => d.work_log.id === activeWorkLog.workLog.id)
      if (!thisLog || thisLog.items.length === 0) {
        addToast('info', 'Este parte no tiene partidas pendientes de certificar')
        return
      }
      setCertifyPreselection([thisLog])
      setShowCertifyModal(true)
    } catch (err: any) {
      addToast('error', err?.response?.data?.error || err.message)
    }
  }

  // ─── Computed values ─────────────────────────────────────
  const toggleSort = (field: SortField) => {
    let newDir: SortDir = 'asc'
    if (sortField === field) {
      newDir = sortDir === 'asc' ? 'desc' : 'asc'
    } else if (field === 'date') {
      newDir = 'desc'
    }
    setSortField(field)
    setSortDir(newDir)
    saveSortPref(field, newDir)
  }

  const filtered = useMemo(() => {
    let result = [...workLogs]
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(l =>
        (l.description && l.description.toLowerCase().includes(q)) ||
        l.date.includes(q) ||
        (l.notes && l.notes.toLowerCase().includes(q))
      )
    }
    result.sort((a, b) => {
      let cmp = 0
      if (sortField === 'date') {
        cmp = a.date.localeCompare(b.date)
      } else if (sortField === 'description') {
        cmp = (a.description || '').localeCompare(b.description || '')
      } else if (sortField === 'weather') {
        cmp = (a.weather || '').localeCompare(b.weather || '')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [workLogs, search, sortField, sortDir])

  // Sorted sub-entries
  const sortedLabor = useMemo(() => {
    if (!activeWorkLog) return []
    const s = subSorts.labor
    if (s.field === 'total') {
      return [...activeWorkLog.labor].sort((a, b) => {
        const diff = (a.worker_count * a.hours * a.hourly_rate) - (b.worker_count * b.hours * b.hourly_rate)
        return s.dir === 'asc' ? diff : -diff
      })
    }
    return sortEntries(activeWorkLog.labor, s.field, s.dir)
  }, [activeWorkLog?.labor, subSorts.labor])

  const sortedMaterials = useMemo(() => {
    if (!activeWorkLog) return []
    const s = subSorts.materials
    if (s.field === 'total') {
      return [...activeWorkLog.materials].sort((a, b) => {
        const diff = (a.quantity * a.unit_price) - (b.quantity * b.unit_price)
        return s.dir === 'asc' ? diff : -diff
      })
    }
    return sortEntries(activeWorkLog.materials, s.field, s.dir)
  }, [activeWorkLog?.materials, subSorts.materials])

  const sortedEquipment = useMemo(() => {
    if (!activeWorkLog) return []
    const s = subSorts.equipment
    if (s.field === 'total') {
      return [...activeWorkLog.equipment].sort((a, b) => {
        const diff = (a.hours * a.hourly_rate) - (b.hours * b.hourly_rate)
        return s.dir === 'asc' ? diff : -diff
      })
    }
    return sortEntries(activeWorkLog.equipment, s.field, s.dir)
  }, [activeWorkLog?.equipment, subSorts.equipment])

  const sortedExpenses = useMemo(() => {
    if (!activeWorkLog?.expenses) return []
    const s = subSorts.expenses
    if (s.field === 'total') {
      return [...activeWorkLog.expenses].sort((a, b) => {
        const diff = (a.amount + a.tax_amount) - (b.amount + b.tax_amount)
        return s.dir === 'asc' ? diff : -diff
      })
    }
    return sortEntries(activeWorkLog.expenses, s.field, s.dir)
  }, [activeWorkLog?.expenses, subSorts.expenses])

  const computeLogTotal = (log: FullWorkLog): number => {
    const laborTotal = log.labor.reduce((s, l) => s + l.worker_count * l.hours * l.hourly_rate, 0)
    const matsTotal = log.materials.reduce((s, m) => s + m.quantity * m.unit_price, 0)
    const equipTotal = log.equipment.reduce((s, e) => s + e.hours * e.hourly_rate, 0)
    const expensesTotal = (log.expenses || []).reduce((s, ex) => s + ex.amount + ex.tax_amount, 0)
    return laborTotal + matsTotal + equipTotal + expensesTotal
  }

  // ─── Form handlers ───────────────────────────────────────
  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm({ date: new Date().toISOString().split('T')[0], description: '', weather: '', notes: '' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      if (editingId) {
        await updateWorkLog(editingId, form)
        addToast('success', 'Parte actualizado')
      } else {
        const created = await createWorkLog(projectId, form)
        addToast('success', 'Parte creado')
        await loadFullWorkLog(created.id)
        setTab('detail')
      }
      closeForm()
    } catch {
      addToast('error', 'Error al guardar el parte')
    } finally {
      setSubmitting(false)
    }
  }

  const openEdit = (log: WorkLog) => {
    setForm({
      date: log.date.split('T')[0],
      description: log.description || '',
      weather: log.weather || '',
      notes: log.notes || '',
    })
    setEditingId(log.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este parte de obra?')) return
    try {
      await deleteWorkLog(id)
      addToast('success', 'Parte eliminado')
      if (activeWorkLog?.workLog.id === id) setTab('list')
    } catch {
      addToast('error', 'Error al eliminar')
    }
  }

  const openDetail = async (log: WorkLog) => {
    await loadFullWorkLog(log.id)
    setTab('detail')
  }

  // ─── Labor handlers ──────────────────────────────────────
  const handleAddLabor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeWorkLog) return
    const hoursN = parseFloat(laborForm.hours)
    const rateN = parseFloat(laborForm.hourly_rate)
    const errs = new Set<string>()
    if (!laborForm.role.trim()) errs.add('role')
    if (!Number.isFinite(hoursN) || hoursN <= 0) errs.add('hours')
    if (!Number.isFinite(rateN) || rateN < 0) errs.add('hourly_rate')
    if (errs.size) {
      setLaborErrors(errs)
      const labels: Record<string, string> = { role: 'Rol', hours: 'Horas', hourly_rate: 'Precio/hora' }
      const missing = Array.from(errs).map(f => labels[f] || f).join(', ')
      addToast('error', `Faltan campos por rellenar: ${missing}`)
      return
    }
    setLaborErrors(new Set())
    try {
      await addLabor(activeWorkLog.workLog.id, {
        role: laborForm.role.trim(),
        worker_count: parseInt(laborForm.worker_count) || 1,
        hours: hoursN,
        hourly_rate: rateN,
        date: laborForm.date || null,
        worker_id: laborForm.worker_id || null,
        description: laborForm.description || null,
      })
      setLaborForm({ role: '', worker_count: '1', hours: '', hourly_rate: '', date: new Date().toISOString().split('T')[0], worker_id: '', description: '' })
      setShowLaborForm(false)
      addToast('success', 'Personal añadido')
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Error al añadir personal'
      addToast('error', msg)
    }
  }

  // ─── Material handlers ───────────────────────────────────
  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeWorkLog) return
    const qtyN = parseFloat(materialForm.quantity)
    const priceN = parseFloat(materialForm.unit_price)
    const errs = new Set<string>()
    if (!materialForm.material_name.trim()) errs.add('material_name')
    if (!Number.isFinite(qtyN) || qtyN <= 0) errs.add('quantity')
    if (!Number.isFinite(priceN) || priceN < 0) errs.add('unit_price')
    if (errs.size) {
      setMaterialErrors(errs)
      const labels: Record<string, string> = { material_name: 'Material', quantity: 'Cantidad', unit_price: 'Precio unit.' }
      const missing = Array.from(errs).map(f => labels[f] || f).join(', ')
      addToast('error', `Faltan campos por rellenar: ${missing}`)
      return
    }
    setMaterialErrors(new Set())
    try {
      await addMaterial(activeWorkLog.workLog.id, {
        material_name: materialForm.material_name.trim(),
        quantity: qtyN,
        unit: materialForm.unit,
        unit_price: priceN,
        date: materialForm.date || null,
        description: materialForm.description || null,
      })
      setMaterialForm({ material_name: '', quantity: '', unit: 'ud', unit_price: '', date: new Date().toISOString().split('T')[0], description: '' })
      setMaterialLibraryResults([])
      setShowMaterialSuggestions(false)
      setShowMaterialForm(false)
      addToast('success', 'Material añadido')
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Error al añadir material'
      addToast('error', msg)
    }
  }

  // ─── Library search helpers ──────────────────────────────
  const searchLibraryMaterials = async (query: string) => {
    if (query.length < 2) {
      setMaterialLibraryResults([])
      setShowMaterialSuggestions(false)
      return
    }
    try {
      const { data } = await api.get<Material[]>(`/materials?search=${encodeURIComponent(query)}`)
      setMaterialLibraryResults(data.slice(0, 8))
      setShowMaterialSuggestions(data.length > 0)
    } catch {
      setMaterialLibraryResults([])
    }
  }

  const searchLibraryEquipment = async (query: string) => {
    if (query.length < 2) {
      setEquipmentLibraryResults([])
      setShowEquipmentSuggestions(false)
      return
    }
    try {
      const { data } = await api.get<Material[]>(`/materials?search=${encodeURIComponent(query)}`)
      setEquipmentLibraryResults(data.slice(0, 8))
      setShowEquipmentSuggestions(data.length > 0)
    } catch {
      setEquipmentLibraryResults([])
    }
  }

  // ─── Equipment handlers ──────────────────────────────────
  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeWorkLog) return
    const hoursN = parseFloat(equipmentForm.hours)
    const rateN = parseFloat(equipmentForm.hourly_rate)
    const errs = new Set<string>()
    if (!equipmentForm.equipment_name.trim()) errs.add('equipment_name')
    if (!Number.isFinite(hoursN) || hoursN <= 0) errs.add('hours')
    if (!Number.isFinite(rateN) || rateN < 0) errs.add('hourly_rate')
    if (errs.size) {
      setEquipmentErrors(errs)
      const labels: Record<string, string> = { equipment_name: 'Maquinaria', hours: 'Horas', hourly_rate: 'Precio/hora' }
      const missing = Array.from(errs).map(f => labels[f] || f).join(', ')
      addToast('error', `Faltan campos por rellenar: ${missing}`)
      return
    }
    setEquipmentErrors(new Set())
    try {
      await addEquipment(activeWorkLog.workLog.id, {
        equipment_name: equipmentForm.equipment_name.trim(),
        hours: hoursN,
        hourly_rate: rateN,
        date: equipmentForm.date || null,
        equipment_id: equipmentForm.equipment_id || null,
        description: equipmentForm.description || null,
      })
      setEquipmentForm({ equipment_name: '', hours: '', hourly_rate: '', date: new Date().toISOString().split('T')[0], equipment_id: '', description: '' })
      setEquipmentLibraryResults([])
      setEquipLinkedMaterials([])
      setShowEquipmentSuggestions(false)
      setShowEquipmentForm(false)
      addToast('success', 'Maquinaria añadida')
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Error al añadir maquinaria'
      addToast('error', msg)
    }
  }

  // ─── Edit handlers for sub-entries ──────────────────────
  const openEditLabor = (l: any) => {
    setEditingLaborId(l.id)
    setEditingLaborForm({ role: l.role, worker_count: String(l.worker_count), hours: String(l.hours), hourly_rate: String(l.hourly_rate), description: l.description || '', date: l.date || '' })
  }
  const handleSaveLabor = async (id: string) => {
    try {
      await updateLabor(id, {
        role: editingLaborForm.role,
        worker_count: parseInt(editingLaborForm.worker_count),
        hours: parseFloat(editingLaborForm.hours),
        hourly_rate: parseFloat(editingLaborForm.hourly_rate),
        description: editingLaborForm.description || null,
        date: editingLaborForm.date || null,
      })
      setEditingLaborId(null)
      addToast('success', 'Personal actualizado')
    } catch {
      addToast('error', 'Error al actualizar personal')
    }
  }

  const openEditMaterial = (m: any) => {
    setEditingMaterialId(m.id)
    setEditingMaterialForm({ material_name: m.material_name, quantity: String(m.quantity), unit: m.unit, unit_price: String(m.unit_price), description: m.description || '', date: m.date || '' })
  }
  const handleSaveMaterial = async (id: string) => {
    try {
      await updateMaterial(id, {
        material_name: editingMaterialForm.material_name,
        quantity: parseFloat(editingMaterialForm.quantity),
        unit: editingMaterialForm.unit,
        unit_price: parseFloat(editingMaterialForm.unit_price),
        description: editingMaterialForm.description || null,
        date: editingMaterialForm.date || null,
      })
      setEditingMaterialId(null)
      addToast('success', 'Material actualizado')
    } catch {
      addToast('error', 'Error al actualizar material')
    }
  }

  const openEditEquipment = (eq: any) => {
    setEditingEquipmentId(eq.id)
    setEditingEquipmentForm({ equipment_name: eq.equipment_name, hours: String(eq.hours), hourly_rate: String(eq.hourly_rate), description: eq.description || '', date: eq.date || '' })
  }
  const handleSaveEquipment = async (id: string) => {
    try {
      await updateEquipment(id, {
        equipment_name: editingEquipmentForm.equipment_name,
        hours: parseFloat(editingEquipmentForm.hours),
        hourly_rate: parseFloat(editingEquipmentForm.hourly_rate),
        description: editingEquipmentForm.description || null,
        date: editingEquipmentForm.date || null,
      })
      setEditingEquipmentId(null)
      addToast('success', 'Maquinaria actualizada')
    } catch {
      addToast('error', 'Error al actualizar maquinaria')
    }
  }

  // ─── Budget Link handlers ────────────────────────────────
  const loadAvailableItems = async () => {
    if (!activeWorkLog) return
    try {
      const { data } = await api.get<AvailableItem[]>(
        `/work-logs/project/${projectId}/available-items?exclude_work_log_id=${activeWorkLog.workLog.id}`
      )
      // Excluir las ya vinculadas al parte actual (no queremos duplicar partidas)
      const linked = new Set((activeWorkLog.budgetLinks || []).map(l => l.budget_item_id))
      setAvailableItems((data || []).filter(i => !linked.has(i.id)))
    } catch {
      setAvailableItems([])
    }
  }

  useEffect(() => {
    if (showLinkForm) loadAvailableItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLinkForm, activeWorkLog?.workLog?.id, activeWorkLog?.budgetLinks?.length])

  const handleAddBudgetLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeWorkLog) return
    try {
      await addBudgetLink(activeWorkLog.workLog.id, {
        budget_item_id: linkForm.budget_item_id,
        executed_quantity: parseFloat(linkForm.executed_quantity || '0'),
        notes: linkForm.notes || null,
      })
      setLinkForm({ budget_item_id: '', executed_quantity: '', notes: '' })
      setShowLinkForm(false)
      addToast('success', 'Partida vinculada')
      loadCostControl(projectId); loadCostSummary(projectId)
    } catch {
      addToast('error', 'Error al vincular partida')
    }
  }

  // ─── Expense linking handlers ────────────────────────────
  const loadUnlinkedExpenses = async () => {
    try {
      const { data } = await api.get<ProjectExpense[]>(`/expenses/project/${projectId}`)
      setUnlinkedExpenses(data.filter(e => !e.work_log_id))
    } catch { /* ignore */ }
  }

  const createAndLinkExpense = async () => {
    if (!activeWorkLog) return
    const amountNum = parseFloat(newExpense.amount)
    if (!newExpense.concept.trim()) {
      addToast('error', 'El concepto es obligatorio')
      return
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      addToast('error', 'Introduce un importe válido')
      return
    }
    setSavingNewExpense(true)
    try {
      await api.post('/expenses', {
        project_id: projectId,
        date: newExpense.date || new Date().toISOString().slice(0, 10),
        concept: newExpense.concept.trim(),
        amount: amountNum,
        tax_amount: parseFloat(newExpense.tax_amount || '0') || 0,
        supplier_name: newExpense.supplier_name.trim() || null,
        work_log_id: activeWorkLog.workLog.id,
      })
      await loadFullWorkLog(activeWorkLog.workLog.id)
      loadCostControl(projectId); loadCostSummary(projectId)
      setNewExpense({
        concept: '', amount: '', tax_amount: '', supplier_name: '',
        date: new Date().toISOString().slice(0, 10),
      })
      setShowExpenseLinkForm(false)
      setExpenseFormMode('link')
      addToast('success', 'Gasto creado y vinculado al parte')
    } catch {
      addToast('error', 'Error al crear el gasto')
    } finally {
      setSavingNewExpense(false)
    }
  }

  const linkExpenseToWorkLog = async (expenseId: string) => {
    if (!activeWorkLog) return
    try {
      await api.put(`/expenses/${expenseId}`, { work_log_id: activeWorkLog.workLog.id })
      await loadFullWorkLog(activeWorkLog.workLog.id)
      loadCostControl(projectId); loadCostSummary(projectId)
      setSelectedExpenseId('')
      setShowExpenseLinkForm(false)
      addToast('success', 'Gasto vinculado al parte')
    } catch {
      addToast('error', 'Error al vincular gasto')
    }
  }

  const unlinkExpense = async (expenseId: string) => {
    if (!activeWorkLog) return
    try {
      await api.put(`/expenses/${expenseId}`, { work_log_id: null })
      await loadFullWorkLog(activeWorkLog.workLog.id)
      loadCostControl(projectId); loadCostSummary(projectId)
      addToast('success', 'Gasto desvinculado')
    } catch {
      addToast('error', 'Error al desvincular gasto')
    }
  }

  // ─── Budget items flat list for the selector ─────────────
  const budgetItemsList = useMemo(() => {
    if (!activeBudget) return []
    return activeBudget.chapters.flatMap(ch =>
      ch.items.map(item => ({
        id: item.id,
        label: `${ch.chapter.code}.${item.code} — ${item.name}`,
        chapterName: ch.chapter.name,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.unit_price,
        cost_price: item.cost_price,
      }))
    )
  }, [activeBudget])

  // ─── Unique units from budget items ─────────────────────
  const availableUnits = useMemo(() => {
    const units = new Set<string>()
    units.add('ud')
    units.add('m²')
    units.add('m³')
    units.add('ml')
    units.add('kg')
    units.add('t')
    units.add('l')
    units.add('h')
    if (activeBudget) {
      for (const ch of activeBudget.chapters) {
        for (const item of ch.items) {
          if (item.unit) units.add(item.unit)
        }
      }
    }
    return Array.from(units).sort()
  }, [activeBudget])

  // ─── Render ──────────────────────────────────────────────
  if (loading && workLogs.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    )
  }

  const WeatherIcon = ({ weather }: { weather: string | null }) => {
    const opt = WEATHER_OPTIONS.find(w => w.value === weather)
    if (!opt) return null
    const Icon = opt.icon
    return <span title={opt.label}><Icon className="w-4 h-4 text-gray-400" /></span>
  }

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {tab !== 'list' && (
              <button onClick={() => setTab('list')} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-200 transition">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Partes de Obra</h1>
              <p className="text-gray-500 text-sm mt-1">
                {tab === 'list' ? 'Control diario de la ejecución' :
                 tab === 'detail' ? (activeWorkLog ? `Parte del ${formatDate(activeWorkLog.workLog.date)}` : '') :
                 'Control de costes por partida'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'list' && (
              <>
                <button
                  onClick={() => { loadCostControl(projectId); loadCostSummary(projectId); setTab('cost-control') }}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition"
                >
                  <BarChart3 className="w-4 h-4" />
                  Control Costes
                </button>
                <button
                  onClick={() => { closeForm(); setShowForm(true) }}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo Parte
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── TAB: LIST ──────────────────────────────────────── */}
      {tab === 'list' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                  <HardHat className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Partes de Obra</p>
                  <p className="text-lg font-bold text-gray-900">{workLogs.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center">
                  <LinkIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Partidas vinculadas</p>
                  <p className="text-lg font-bold text-gray-900">
                    {costControl ? costControl.items.filter(i => i.executed_quantity > 0).length : 0}
                    <span className="text-sm font-normal text-gray-500"> de {budgetItemsList.length}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Search */}
          {workLogs.length > 0 && (
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por descripción, fecha o notas..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                />
              </div>
            </div>
          )}

          {/* List */}
          {workLogs.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
              <HardHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No hay partes de obra registrados</p>
              <p className="text-gray-400 text-sm mt-1">Haz clic en &quot;Nuevo Parte&quot; para comenzar</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left cursor-pointer select-none hover:text-gray-700 transition" onClick={() => toggleSort('date')}>
                      <span className="inline-flex items-center gap-1">Fecha {sortField === 'date' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}</span>
                    </th>
                    <th className="px-4 py-3 text-left cursor-pointer select-none hover:text-gray-700 transition" onClick={() => toggleSort('description')}>
                      <span className="inline-flex items-center gap-1">Descripción {sortField === 'description' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}</span>
                    </th>
                    <th className="px-4 py-3 text-center w-10 cursor-pointer select-none hover:text-gray-700 transition" onClick={() => toggleSort('weather')}>
                      <span className="inline-flex items-center gap-1">Tiempo {sortField === 'weather' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}</span>
                    </th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition group cursor-pointer"
                      onClick={() => openDetail(log)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {formatDate(log.date)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="text-gray-700">{log.description || '—'}</span>
                        {log.notes && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{log.notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <WeatherIcon weather={log.weather} />
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button onClick={() => openEdit(log)} className="p-1 text-gray-300 hover:text-blue-500 rounded transition" title="Editar">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(log.id)} className="p-1 text-gray-300 hover:text-red-500 rounded transition" title="Eliminar">
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
        </>
      )}

      {/* ─── TAB: DETAIL ────────────────────────────────────── */}
      {tab === 'detail' && activeWorkLog && (
        <div className="space-y-4">
          {/* Work Log Header Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-gray-500">{formatDate(activeWorkLog.workLog.date)}</p>
                <p className="text-gray-800 font-medium">{activeWorkLog.workLog.description || 'Sin descripción'}</p>
                {activeWorkLog.workLog.notes && (
                  <p className="text-sm text-gray-500">{activeWorkLog.workLog.notes}</p>
                )}
              </div>
              <WeatherIcon weather={activeWorkLog.workLog.weather} />
            </div>
            {/* Cost summary */}
            <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400 uppercase">Personal</p>
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                  {formatCurrency(activeWorkLog.labor.reduce((s, l) => s + l.worker_count * l.hours * l.hourly_rate, 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Materiales</p>
                <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                  {formatCurrency(activeWorkLog.materials.reduce((s, m) => s + m.quantity * m.unit_price, 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Maquinaria</p>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  {formatCurrency(activeWorkLog.equipment.reduce((s, e) => s + e.hours * e.hourly_rate, 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Total Día</p>
                <p className="text-sm font-bold text-gray-900">
                  {formatCurrency(computeLogTotal(activeWorkLog))}
                </p>
              </div>
            </div>
          </div>

          {/* ─── Personal ────────────────────────────── */}
          <SectionCard
            title="Personal / Mano de Obra"
            icon={<Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
            expanded={expandedSections.has('labor')}
            onToggle={() => toggleSection('labor')}
            onAdd={() => setShowLaborForm(true)}
            count={activeWorkLog.labor.length}
          >
            {activeWorkLog.labor.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No hay registros de personal</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase">
                    <SortableHeader label="Rol / Categoría" field="role" currentField={subSorts.labor.field} currentDir={subSorts.labor.dir} onSort={f => toggleSubSort('labor', f)} />
                    <SortableHeader label="Fecha" field="date" currentField={subSorts.labor.field} currentDir={subSorts.labor.dir} onSort={f => toggleSubSort('labor', f)} align="center" />
                    <SortableHeader label="Personas" field="worker_count" currentField={subSorts.labor.field} currentDir={subSorts.labor.dir} onSort={f => toggleSubSort('labor', f)} align="right" />
                    <SortableHeader label="Horas" field="hours" currentField={subSorts.labor.field} currentDir={subSorts.labor.dir} onSort={f => toggleSubSort('labor', f)} align="right" />
                    <SortableHeader label="€/hora" field="hourly_rate" currentField={subSorts.labor.field} currentDir={subSorts.labor.dir} onSort={f => toggleSubSort('labor', f)} align="right" />
                    <SortableHeader label="Total" field="total" currentField={subSorts.labor.field} currentDir={subSorts.labor.dir} onSort={f => toggleSubSort('labor', f)} align="right" />
                    <th className="py-1 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLabor.map((l) => (
                    editingLaborId === l.id ? (
                      <>
                      <tr key={l.id} className="border-t border-gray-50 bg-blue-50/30 dark:bg-blue-950/40">
                        <td className="py-1 pr-1"><input type="text" value={editingLaborForm.role} onChange={e => setEditingLaborForm({...editingLaborForm, role: e.target.value})} className="w-full px-2 py-1 text-sm rounded border border-blue-300 dark:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" /></td>
                        <td className="py-1 pr-1"><input type="date" value={editingLaborForm.date} onChange={e => setEditingLaborForm({...editingLaborForm, date: e.target.value})} className="w-full px-1 py-1 text-sm rounded border border-blue-300 dark:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" /></td>
                        <td className="py-1 pr-1"><input type="text" inputMode="numeric" pattern="[0-9]*" min="1" value={editingLaborForm.worker_count} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setEditingLaborForm({...editingLaborForm, worker_count: v}) }} className="w-full px-2 py-1 text-sm rounded border border-blue-300 dark:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-right" /></td>
                        <td className="py-1 pr-1"><DecimalInput min="0" value={parseFloat(editingLaborForm.hours) || 0} onChange={v => setEditingLaborForm({...editingLaborForm, hours: String(v)})} className="w-full px-2 py-1 text-sm rounded border border-blue-300 dark:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-right" /></td>
                        <td className="py-1 pr-1"><DecimalInput min="0" value={parseFloat(editingLaborForm.hourly_rate) || 0} onChange={v => setEditingLaborForm({...editingLaborForm, hourly_rate: String(v)})} className="w-full px-2 py-1 text-sm rounded border border-blue-300 dark:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-right" /></td>
                        <td className="py-1 text-right font-medium text-sm">{formatCurrency(parseInt(editingLaborForm.worker_count || '0') * (parseFloat(editingLaborForm.hours) || 0) * (parseFloat(editingLaborForm.hourly_rate) || 0))}</td>
                        <td className="py-1">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => handleSaveLabor(l.id)} className="p-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition" title="Guardar"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingLaborId(null)} className="p-1 text-gray-400 hover:text-gray-600 transition" title="Cancelar"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                      <tr key={`${l.id}-desc`} className="bg-blue-50/30 dark:bg-blue-950/40">
                        <td colSpan={7} className="py-1 px-1">
                          <input type="text" maxLength={500} value={editingLaborForm.description} onChange={e => setEditingLaborForm({...editingLaborForm, description: e.target.value})} className="w-full px-2 py-1 text-sm rounded border border-blue-300 dark:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Descripcion / Notas..." />
                        </td>
                      </tr>
                      </>
                    ) : (
                      <tr key={l.id} className="border-t border-gray-50 group">
                        <td className="py-2 text-gray-700">
                          {l.role}
                          {l.worker_id && <span className="ml-1 text-[10px] text-blue-400 dark:text-blue-300">(catálogo)</span>}
                          {l.description && <div className="text-xs text-gray-400 mt-0.5">{l.description}</div>}
                        </td>
                        <td className="py-2 text-center text-xs text-gray-400">{l.date ? formatDate(l.date) : '—'}</td>
                        <td className="py-2 text-right">{l.worker_count}</td>
                        <td className="py-2 text-right">{l.hours}</td>
                        <td className="py-2 text-right">{formatCurrency(l.hourly_rate)}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(l.worker_count * l.hours * l.hourly_rate)}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => openEditLabor(l)} className="p-1 text-gray-300 hover:text-blue-500 transition" title="Editar"><Edit className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteLabor(l.id)} className="p-1 text-gray-300 hover:text-red-500 transition" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            )}
            {showLaborForm && (
              <form onSubmit={handleAddLabor} className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <label className={`text-xs ${laborErrors.has('role') ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>Trabajador / Rol{laborErrors.has('role') ? ' *' : ''}</label>
                    <input type="text" required maxLength={255} value={laborForm.role}
                      onChange={e => {
                        setLaborForm({ ...laborForm, role: e.target.value, worker_id: '' })
                        setWorkerSearch(e.target.value)
                        setShowWorkerSuggestions(true)
                        if (laborErrors.has('role')) { const n = new Set(laborErrors); n.delete('role'); setLaborErrors(n) }
                      }}
                      onFocus={() => setShowWorkerSuggestions(true)}
                      className={`w-full px-2 py-1.5 text-sm rounded border focus:ring-1 outline-none ${laborErrors.has('role') ? 'border-red-500 ring-1 ring-red-200 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`} placeholder="Buscar trabajador o escribir rol..." />
                    {showWorkerSuggestions && filteredWorkers.length > 0 && (
                      <div className="absolute z-20 top-full left-0 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {filteredWorkers.map(w => (
                          <button key={w.id} type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/40 flex items-center justify-between"
                            onClick={() => {
                              setLaborForm({ ...laborForm, role: `${w.role} (${w.name})`, worker_id: w.id, hourly_rate: String(w.hourly_rate), worker_count: '1' })
                              setShowWorkerSuggestions(false)
                              setWorkerSearch('')
                            }}>
                            <span><span className="font-medium text-gray-800">{w.name}</span> <span className="text-gray-400">— {w.role}</span></span>
                            <span className="text-xs text-gray-400">{w.hourly_rate.toFixed(2)} €/h</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="w-20">
                    <label className="text-xs text-gray-500">Personas</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" min="1" required value={laborForm.worker_count} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setLaborForm({ ...laborForm, worker_count: v }) }}
                      className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-blue-500 outline-none" />
                  </div>
                  <div className="w-20">
                    <label className={`text-xs ${laborErrors.has('hours') ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>Horas{laborErrors.has('hours') ? ' *' : ''}</label>
                    <DecimalInput min="0" required value={parseFloat(laborForm.hours as string) || 0} onChange={v => {
                        setLaborForm({ ...laborForm, hours: String(v) })
                        if (laborErrors.has('hours') && v > 0) { const n = new Set(laborErrors); n.delete('hours'); setLaborErrors(n) }
                      }}
                      className={`w-full px-2 py-1.5 text-sm rounded border focus:ring-1 outline-none ${laborErrors.has('hours') ? 'border-red-500 ring-1 ring-red-200 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`} />
                  </div>
                  <div className="w-24">
                    <label className={`text-xs ${laborErrors.has('hourly_rate') ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>€/hora{laborErrors.has('hourly_rate') ? ' *' : ''}</label>
                    <DecimalInput min="0" required value={parseFloat(laborForm.hourly_rate as string) || 0} onChange={v => {
                        setLaborForm({ ...laborForm, hourly_rate: String(v) })
                        if (laborErrors.has('hourly_rate') && v >= 0) { const n = new Set(laborErrors); n.delete('hourly_rate'); setLaborErrors(n) }
                      }}
                      className={`w-full px-2 py-1.5 text-sm rounded border focus:ring-1 outline-none ${laborErrors.has('hourly_rate') ? 'border-red-500 ring-1 ring-red-200 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`} />
                  </div>
                  <div className="w-32">
                    <label className="text-xs text-gray-500">Fecha</label>
                    <input type="date" value={laborForm.date} onChange={e => setLaborForm({ ...laborForm, date: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-blue-500 outline-none" />
                  </div>
                  <button type="submit" className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition">Añadir</button>
                  <button type="button" onClick={() => { setShowLaborForm(false); setShowWorkerSuggestions(false) }} className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">Descripcion / Notas</label>
                    <input type="text" maxLength={500} value={laborForm.description} onChange={e => setLaborForm({ ...laborForm, description: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Ej: encofrado de losa, demolicion..." />
                  </div>
                </div>
                {laborForm.worker_id && (
                  <p className="text-xs text-blue-500 dark:text-blue-400 pl-1">Trabajador seleccionado del catálogo</p>
                )}
              </form>
            )}
          </SectionCard>

          {/* ─── Materiales ──────────────────────────── */}
          <SectionCard
            title="Materiales"
            icon={<Package className="w-4 h-4 text-green-600 dark:text-green-400" />}
            expanded={expandedSections.has('materials')}
            onToggle={() => toggleSection('materials')}
            onAdd={() => setShowMaterialForm(true)}
            count={activeWorkLog.materials.length}
          >
            {activeWorkLog.materials.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No hay materiales registrados</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase">
                    <SortableHeader label="Material" field="material_name" currentField={subSorts.materials.field} currentDir={subSorts.materials.dir} onSort={f => toggleSubSort('materials', f)} />
                    <SortableHeader label="Fecha" field="date" currentField={subSorts.materials.field} currentDir={subSorts.materials.dir} onSort={f => toggleSubSort('materials', f)} align="center" />
                    <SortableHeader label="Cantidad" field="quantity" currentField={subSorts.materials.field} currentDir={subSorts.materials.dir} onSort={f => toggleSubSort('materials', f)} align="right" />
                    <SortableHeader label="Ud." field="unit" currentField={subSorts.materials.field} currentDir={subSorts.materials.dir} onSort={f => toggleSubSort('materials', f)} align="center" />
                    <SortableHeader label="Precio Ud." field="unit_price" currentField={subSorts.materials.field} currentDir={subSorts.materials.dir} onSort={f => toggleSubSort('materials', f)} align="right" />
                    <SortableHeader label="Total" field="total" currentField={subSorts.materials.field} currentDir={subSorts.materials.dir} onSort={f => toggleSubSort('materials', f)} align="right" />
                    <th className="py-1 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMaterials.map((m) => (
                    editingMaterialId === m.id ? (
                      <>
                      <tr key={m.id} className="border-t border-gray-50 bg-green-50/30 dark:bg-green-950/40">
                        <td className="py-1 pr-1"><input type="text" value={editingMaterialForm.material_name} onChange={e => setEditingMaterialForm({...editingMaterialForm, material_name: e.target.value})} className="w-full px-2 py-1 text-sm rounded border border-green-300 dark:border-green-900/60 focus:ring-1 focus:ring-green-500 outline-none" /></td>
                        <td className="py-1 pr-1"><input type="date" value={editingMaterialForm.date} onChange={e => setEditingMaterialForm({...editingMaterialForm, date: e.target.value})} className="w-full px-1 py-1 text-sm rounded border border-green-300 dark:border-green-900/60 focus:ring-1 focus:ring-green-500 outline-none" /></td>
                        <td className="py-1 pr-1"><DecimalInput min="0" value={parseFloat(editingMaterialForm.quantity) || 0} onChange={v => setEditingMaterialForm({...editingMaterialForm, quantity: String(v)})} className="w-full px-2 py-1 text-sm rounded border border-green-300 dark:border-green-900/60 focus:ring-1 focus:ring-green-500 outline-none text-right" /></td>
                        <td className="py-1 pr-1"><select value={editingMaterialForm.unit} onChange={e => setEditingMaterialForm({...editingMaterialForm, unit: e.target.value})} className="w-full px-1 py-1 text-sm rounded border border-green-300 dark:border-green-900/60 focus:ring-1 focus:ring-green-500 outline-none">{availableUnits.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                        <td className="py-1 pr-1"><DecimalInput min="0" value={parseFloat(editingMaterialForm.unit_price) || 0} onChange={v => setEditingMaterialForm({...editingMaterialForm, unit_price: String(v)})} className="w-full px-2 py-1 text-sm rounded border border-green-300 dark:border-green-900/60 focus:ring-1 focus:ring-green-500 outline-none text-right" /></td>
                        <td className="py-1 text-right font-medium text-sm">{formatCurrency((parseFloat(editingMaterialForm.quantity) || 0) * (parseFloat(editingMaterialForm.unit_price) || 0))}</td>
                        <td className="py-1">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => handleSaveMaterial(m.id)} className="p-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition" title="Guardar"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingMaterialId(null)} className="p-1 text-gray-400 hover:text-gray-600 transition" title="Cancelar"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                      <tr key={`${m.id}-desc`} className="bg-green-50/30 dark:bg-green-950/40">
                        <td colSpan={7} className="py-1 px-1">
                          <input type="text" maxLength={500} value={editingMaterialForm.description} onChange={e => setEditingMaterialForm({...editingMaterialForm, description: e.target.value})} className="w-full px-2 py-1 text-sm rounded border border-green-300 dark:border-green-900/60 focus:ring-1 focus:ring-green-500 outline-none" placeholder="Descripcion / Notas..." />
                        </td>
                      </tr>
                      </>
                    ) : (
                      <tr key={m.id} className="border-t border-gray-50 group">
                        <td className="py-2 text-gray-700">
                          {m.material_name}
                          {m.description && <div className="text-xs text-gray-400 mt-0.5">{m.description}</div>}
                        </td>
                        <td className="py-2 text-center text-xs text-gray-400">{m.date ? formatDate(m.date) : '—'}</td>
                        <td className="py-2 text-right">{m.quantity}</td>
                        <td className="py-2 text-center text-gray-500">{m.unit}</td>
                        <td className="py-2 text-right">{formatCurrency(m.unit_price)}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(m.quantity * m.unit_price)}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => openEditMaterial(m)} className="p-1 text-gray-300 hover:text-blue-500 transition" title="Editar"><Edit className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteMaterial(m.id)} className="p-1 text-gray-300 hover:text-red-500 transition" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            )}
            {showMaterialForm && (
              <form onSubmit={handleAddMaterial} className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <label className={`text-xs ${materialErrors.has('material_name') ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>Material{materialErrors.has('material_name') ? ' *' : ''} <span className="text-gray-400">(escribe o busca en biblioteca)</span></label>
                  <input
                    type="text"
                    required
                    value={materialForm.material_name}
                    onChange={e => {
                      setMaterialForm({ ...materialForm, material_name: e.target.value })
                      searchLibraryMaterials(e.target.value)
                      if (materialErrors.has('material_name') && e.target.value.trim()) { const n = new Set(materialErrors); n.delete('material_name'); setMaterialErrors(n) }
                    }}
                    onBlur={() => setTimeout(() => setShowMaterialSuggestions(false), 150)}
                    onFocus={() => materialForm.material_name.length >= 2 && searchLibraryMaterials(materialForm.material_name)}
                    maxLength={500}
                    className={`w-full px-2 py-1.5 text-sm rounded border focus:ring-1 outline-none ${materialErrors.has('material_name') ? 'border-red-500 ring-1 ring-red-200 focus:ring-red-500' : 'border-gray-300 focus:ring-green-500'}`}
                    placeholder="Hormigón HA-25... (escribe para buscar)"
                    autoComplete="off"
                  />
                  {showMaterialSuggestions && materialLibraryResults.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {materialLibraryResults.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 dark:hover:bg-green-900/40 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                          onMouseDown={() => {
                            setMaterialForm({
                              ...materialForm,
                              material_name: m.name,
                              unit: m.unit,
                              unit_price: String(m.unit_price),
                            })
                            setShowMaterialSuggestions(false)
                          }}
                        >
                          <span className="text-gray-800 font-medium truncate">{m.name}</span>
                          <span className="text-xs text-gray-400 shrink-0">{m.unit} · {formatCurrency(m.unit_price)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="w-20">
                  <label className={`text-xs ${materialErrors.has('quantity') ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>Cantidad{materialErrors.has('quantity') ? ' *' : ''}</label>
                  <DecimalInput min="0" required value={parseFloat(materialForm.quantity as string) || 0} onChange={v => {
                      setMaterialForm({ ...materialForm, quantity: String(v) })
                      if (materialErrors.has('quantity') && v > 0) { const n = new Set(materialErrors); n.delete('quantity'); setMaterialErrors(n) }
                    }}
                    className={`w-full px-2 py-1.5 text-sm rounded border focus:ring-1 outline-none ${materialErrors.has('quantity') ? 'border-red-500 ring-1 ring-red-200 focus:ring-red-500' : 'border-gray-300 focus:ring-green-500'}`} />
                </div>
                <div className="w-20">
                  <label className="text-xs text-gray-500">Ud.</label>
                  <select value={materialForm.unit} onChange={e => setMaterialForm({ ...materialForm, unit: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-green-500 outline-none">
                    {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="w-24">
                  <label className={`text-xs ${materialErrors.has('unit_price') ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>Precio Ud.{materialErrors.has('unit_price') ? ' *' : ''}</label>
                  <DecimalInput min="0" required value={parseFloat(materialForm.unit_price as string) || 0} onChange={v => {
                      setMaterialForm({ ...materialForm, unit_price: String(v) })
                      if (materialErrors.has('unit_price') && v >= 0) { const n = new Set(materialErrors); n.delete('unit_price'); setMaterialErrors(n) }
                    }}
                    className={`w-full px-2 py-1.5 text-sm rounded border focus:ring-1 outline-none ${materialErrors.has('unit_price') ? 'border-red-500 ring-1 ring-red-200 focus:ring-red-500' : 'border-gray-300 focus:ring-green-500'}`} />
                </div>
                <div className="w-32">
                  <label className="text-xs text-gray-500">Fecha</label>
                  <input type="date" value={materialForm.date} onChange={e => setMaterialForm({ ...materialForm, date: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-green-500 outline-none" />
                </div>
                  <button type="submit" className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition">Añadir</button>
                  <button type="button" onClick={() => { setShowMaterialForm(false); setShowMaterialSuggestions(false) }} className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">Descripcion / Notas</label>
                    <input type="text" maxLength={500} value={materialForm.description} onChange={e => setMaterialForm({ ...materialForm, description: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-green-500 outline-none" placeholder="Ej: para cimentacion, zona norte..." />
                  </div>
                </div>
              </form>
            )}
          </SectionCard>

          {/* ─── Maquinaria ──────────────────────────── */}
          <SectionCard
            title="Maquinaria / Equipos"
            icon={<Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
            expanded={expandedSections.has('equipment')}
            onToggle={() => toggleSection('equipment')}
            onAdd={() => setShowEquipmentForm(true)}
            count={activeWorkLog.equipment.length}
          >
            {activeWorkLog.equipment.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No hay maquinaria registrada</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase">
                    <SortableHeader label="Equipo" field="equipment_name" currentField={subSorts.equipment.field} currentDir={subSorts.equipment.dir} onSort={f => toggleSubSort('equipment', f)} />
                    <SortableHeader label="Fecha" field="date" currentField={subSorts.equipment.field} currentDir={subSorts.equipment.dir} onSort={f => toggleSubSort('equipment', f)} align="center" />
                    <SortableHeader label="Horas" field="hours" currentField={subSorts.equipment.field} currentDir={subSorts.equipment.dir} onSort={f => toggleSubSort('equipment', f)} align="right" />
                    <SortableHeader label="€/hora" field="hourly_rate" currentField={subSorts.equipment.field} currentDir={subSorts.equipment.dir} onSort={f => toggleSubSort('equipment', f)} align="right" />
                    <SortableHeader label="Total" field="total" currentField={subSorts.equipment.field} currentDir={subSorts.equipment.dir} onSort={f => toggleSubSort('equipment', f)} align="right" />
                    <th className="py-1 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEquipment.map((e) => (
                    editingEquipmentId === e.id ? (
                      <>
                      <tr key={e.id} className="border-t border-gray-50 bg-amber-50/30 dark:bg-amber-950/40">
                        <td className="py-1 pr-1"><input type="text" value={editingEquipmentForm.equipment_name} onChange={ev => setEditingEquipmentForm({...editingEquipmentForm, equipment_name: ev.target.value})} className="w-full px-2 py-1 text-sm rounded border border-amber-300 dark:border-amber-900/60 focus:ring-1 focus:ring-amber-500 outline-none" /></td>
                        <td className="py-1 pr-1"><input type="date" value={editingEquipmentForm.date} onChange={ev => setEditingEquipmentForm({...editingEquipmentForm, date: ev.target.value})} className="w-full px-1 py-1 text-sm rounded border border-amber-300 dark:border-amber-900/60 focus:ring-1 focus:ring-amber-500 outline-none" /></td>
                        <td className="py-1 pr-1"><DecimalInput min="0" value={parseFloat(editingEquipmentForm.hours) || 0} onChange={v => setEditingEquipmentForm({...editingEquipmentForm, hours: String(v)})} className="w-full px-2 py-1 text-sm rounded border border-amber-300 dark:border-amber-900/60 focus:ring-1 focus:ring-amber-500 outline-none text-right" /></td>
                        <td className="py-1 pr-1"><DecimalInput min="0" value={parseFloat(editingEquipmentForm.hourly_rate) || 0} onChange={v => setEditingEquipmentForm({...editingEquipmentForm, hourly_rate: String(v)})} className="w-full px-2 py-1 text-sm rounded border border-amber-300 dark:border-amber-900/60 focus:ring-1 focus:ring-amber-500 outline-none text-right" /></td>
                        <td className="py-1 text-right font-medium text-sm">{formatCurrency((parseFloat(editingEquipmentForm.hours) || 0) * (parseFloat(editingEquipmentForm.hourly_rate) || 0))}</td>
                        <td className="py-1">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => handleSaveEquipment(e.id)} className="p-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition" title="Guardar"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingEquipmentId(null)} className="p-1 text-gray-400 hover:text-gray-600 transition" title="Cancelar"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                      <tr key={`${e.id}-desc`} className="bg-amber-50/30 dark:bg-amber-950/40">
                        <td colSpan={6} className="py-1 px-1">
                          <input type="text" maxLength={500} value={editingEquipmentForm.description} onChange={ev => setEditingEquipmentForm({...editingEquipmentForm, description: ev.target.value})} className="w-full px-2 py-1 text-sm rounded border border-amber-300 dark:border-amber-900/60 focus:ring-1 focus:ring-amber-500 outline-none" placeholder="Descripcion / Notas..." />
                        </td>
                      </tr>
                      </>
                    ) : (
                      <tr key={e.id} className="border-t border-gray-50 group">
                        <td className="py-2 text-gray-700">
                          {e.equipment_name}
                          {e.equipment_id && <span className="ml-1 text-[10px] text-amber-500 dark:text-amber-400">(catálogo)</span>}
                          {e.description && <div className="text-xs text-gray-400 mt-0.5">{e.description}</div>}
                        </td>
                        <td className="py-2 text-center text-xs text-gray-400">{e.date ? formatDate(e.date) : '—'}</td>
                        <td className="py-2 text-right">{e.hours}</td>
                        <td className="py-2 text-right">{formatCurrency(e.hourly_rate)}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(e.hours * e.hourly_rate)}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => openEditEquipment(e)} className="p-1 text-gray-300 hover:text-blue-500 transition" title="Editar"><Edit className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteEquipment(e.id)} className="p-1 text-gray-300 hover:text-red-500 transition" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            )}
            {showEquipmentForm && (
              <form onSubmit={handleAddEquipment} className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <label className={`text-xs ${equipmentErrors.has('equipment_name') ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>Equipo <span className="text-gray-400">(escribe o busca en catálogo)</span></label>
                    <input
                      type="text"
                      required
                      value={equipmentForm.equipment_name}
                      onChange={e => {
                        setEquipmentForm({ ...equipmentForm, equipment_name: e.target.value, equipment_id: '' })
                        setEquipCatalogSearch(e.target.value)
                        setShowEquipCatalogSuggestions(true)
                        searchLibraryEquipment(e.target.value)
                        if (e.target.value.trim() && equipmentErrors.has('equipment_name')) {
                          const next = new Set(equipmentErrors); next.delete('equipment_name'); setEquipmentErrors(next)
                        }
                      }}
                      onFocus={() => setShowEquipCatalogSuggestions(true)}
                      onBlur={() => setTimeout(() => { setShowEquipmentSuggestions(false); setShowEquipCatalogSuggestions(false) }, 150)}
                      maxLength={500}
                      className={`w-full px-2 py-1.5 text-sm rounded border outline-none ${equipmentErrors.has('equipment_name') ? 'border-red-500 ring-1 ring-red-200 focus:ring-red-500' : 'border-gray-300 focus:ring-1 focus:ring-amber-500'}`}
                      placeholder="Retroexcavadora... (escribe para buscar)"
                      autoComplete="off"
                    />
                    {/* Equipment catalog suggestions (priority) */}
                    {showEquipCatalogSuggestions && filteredEquipCatalog.length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        <div className="px-3 py-1 text-[10px] text-gray-400 bg-gray-50 uppercase">Catálogo de maquinaria</div>
                        {filteredEquipCatalog.map(eq => (
                          <button
                            key={eq.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/40 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                            onMouseDown={() => {
                              setEquipmentForm({
                                ...equipmentForm,
                                equipment_name: eq.name,
                                hourly_rate: String(eq.hourly_rate),
                                equipment_id: eq.id,
                              })
                              setShowEquipCatalogSuggestions(false)
                              setShowEquipmentSuggestions(false)
                              fetchEquipLinkedMaterials(eq.id)
                            }}
                          >
                            <span>
                              <span className="text-gray-800 font-medium">{eq.name}</span>
                              {eq.code && <span className="text-gray-400 ml-1 text-xs">{eq.code}</span>}
                              <span className={`ml-2 text-[10px] px-1 rounded ${eq.type === 'propia' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-500 dark:text-blue-400' : 'bg-orange-50 dark:bg-orange-950/40 text-orange-500 dark:text-orange-400'}`}>{eq.type}</span>
                            </span>
                            <span className="text-xs text-gray-400 shrink-0">{eq.hourly_rate.toFixed(2)} €/h</span>
                          </button>
                        ))}
                        {/* Fallback to material library results */}
                        {equipmentLibraryResults.length > 0 && (
                          <>
                            <div className="px-3 py-1 text-[10px] text-gray-400 bg-gray-50 uppercase">Biblioteca de materiales</div>
                            {equipmentLibraryResults.map(m => (
                              <button
                                key={m.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/40 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                                onMouseDown={() => {
                                  setEquipmentForm({ ...equipmentForm, equipment_name: m.name, hourly_rate: String(m.unit_price), equipment_id: '' })
                                  setShowEquipCatalogSuggestions(false)
                                }}
                              >
                                <span className="text-gray-800 font-medium truncate">{m.name}</span>
                                <span className="text-xs text-gray-400 shrink-0">{formatCurrency(m.unit_price)}</span>
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="w-20">
                    <label className={`text-xs ${equipmentErrors.has('hours') ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>Horas</label>
                    <DecimalInput min="0" required value={parseFloat(equipmentForm.hours as string) || 0} onChange={v => {
                      setEquipmentForm({ ...equipmentForm, hours: String(v) })
                      if (v > 0 && equipmentErrors.has('hours')) {
                        const next = new Set(equipmentErrors); next.delete('hours'); setEquipmentErrors(next)
                      }
                    }}
                      className={`w-full px-2 py-1.5 text-sm rounded border outline-none ${equipmentErrors.has('hours') ? 'border-red-500 ring-1 ring-red-200 focus:ring-red-500' : 'border-gray-300 focus:ring-1 focus:ring-amber-500'}`} />
                  </div>
                  <div className="w-24">
                    <label className={`text-xs ${equipmentErrors.has('hourly_rate') ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>€/hora</label>
                    <DecimalInput min="0" required value={parseFloat(equipmentForm.hourly_rate as string) || 0} onChange={v => {
                      setEquipmentForm({ ...equipmentForm, hourly_rate: String(v) })
                      if (v >= 0 && equipmentErrors.has('hourly_rate')) {
                        const next = new Set(equipmentErrors); next.delete('hourly_rate'); setEquipmentErrors(next)
                      }
                    }}
                      className={`w-full px-2 py-1.5 text-sm rounded border outline-none ${equipmentErrors.has('hourly_rate') ? 'border-red-500 ring-1 ring-red-200 focus:ring-red-500' : 'border-gray-300 focus:ring-1 focus:ring-amber-500'}`} />
                  </div>
                  <div className="w-32">
                    <label className="text-xs text-gray-500">Fecha</label>
                    <input type="date" value={equipmentForm.date} onChange={e => setEquipmentForm({ ...equipmentForm, date: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-amber-500 outline-none" />
                  </div>
                  <button type="submit" className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 transition">Añadir</button>
                  <button type="button" onClick={() => { setShowEquipmentForm(false); setShowEquipmentSuggestions(false); setShowEquipCatalogSuggestions(false) }} className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">Descripcion / Notas</label>
                    <input type="text" maxLength={500} value={equipmentForm.description} onChange={e => setEquipmentForm({ ...equipmentForm, description: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-amber-500 outline-none" placeholder="Ej: excavacion zanjas, compactacion..." />
                  </div>
                </div>
                {equipmentForm.equipment_id && (
                  <div className="mt-1 pl-1">
                    <p className="text-xs text-amber-600 dark:text-amber-400">Equipo seleccionado del catálogo</p>
                    {equipLinkedMaterials.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="text-[10px] text-gray-400 mr-1">Materiales vinculados:</span>
                        {equipLinkedMaterials.map((lm: any) => (
                          <span key={lm.id} className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-900/60">
                            {lm.supplier_material?.material?.name || 'Material'} — {Number(lm.supplier_material?.unit_price || 0).toFixed(2)} €
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </form>
            )}
          </SectionCard>

          {/* ─── Gastos Vinculados ────────── */}
          <SectionCard
            title="Gastos Vinculados"
            icon={<Receipt className="w-4 h-4 text-green-600 dark:text-green-400" />}
            expanded={expandedSections.has('expenses')}
            onToggle={() => toggleSection('expenses')}
            onAdd={() => { loadUnlinkedExpenses(); setShowExpenseLinkForm(true) }}
            count={(activeWorkLog.expenses || []).length}
          >
            {(!activeWorkLog.expenses || activeWorkLog.expenses.length === 0) ? (
              <p className="text-sm text-gray-400 py-2">No hay gastos vinculados a este parte</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase">
                    <SortableHeader label="Concepto" field="concept" currentField={subSorts.expenses.field} currentDir={subSorts.expenses.dir} onSort={f => toggleSubSort('expenses', f)} />
                    <SortableHeader label="Proveedor" field="supplier_name" currentField={subSorts.expenses.field} currentDir={subSorts.expenses.dir} onSort={f => toggleSubSort('expenses', f)} />
                    <SortableHeader label="Fecha" field="date" currentField={subSorts.expenses.field} currentDir={subSorts.expenses.dir} onSort={f => toggleSubSort('expenses', f)} align="center" />
                    <SortableHeader label="Total" field="total" currentField={subSorts.expenses.field} currentDir={subSorts.expenses.dir} onSort={f => toggleSubSort('expenses', f)} align="right" />
                    <th className="py-1 w-10"></th>
                    <th className="py-1 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedExpenses.map((exp) => (
                    <tr key={exp.id} className="border-t border-gray-50 group">
                      <td className="py-2 text-gray-800 font-medium">{exp.concept}</td>
                      <td className="py-2 text-gray-500 text-xs">{exp.supplier_name || '—'}</td>
                      <td className="py-2 text-center text-xs text-gray-400">{formatDate(exp.date)}</td>
                      <td className="py-2 text-right font-semibold text-gray-700">{formatCurrency(exp.amount + exp.tax_amount)}</td>
                      <td className="py-2 text-center">
                        {exp.image_path ? <span className="text-xs text-green-500 dark:text-green-400" title="Con factura">📎</span> : <span className="text-xs text-amber-500 dark:text-amber-400" title="Sin factura">⚠️</span>}
                      </td>
                      <td className="py-2">
                        <button onClick={() => unlinkExpense(exp.id)} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><X className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-100">
                    <td colSpan={3} className="py-2 text-xs text-gray-500 uppercase">Total gastos</td>
                    <td className="py-2 text-right text-sm font-bold text-gray-700">{formatCurrency(activeWorkLog.expenses.reduce((s, e) => s + e.amount + e.tax_amount, 0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            )}
            {showExpenseLinkForm && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                {/* Tabs: vincular existente / crear nuevo */}
                <div className="flex gap-1 text-xs mb-1">
                  <button
                    type="button"
                    onClick={() => setExpenseFormMode('link')}
                    className={`px-2.5 py-1 rounded transition ${
                      expenseFormMode === 'link'
                        ? 'bg-green-600 text-white'
                        : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    Vincular existente
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpenseFormMode('create')}
                    className={`px-2.5 py-1 rounded transition ${
                      expenseFormMode === 'create'
                        ? 'bg-green-600 text-white'
                        : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    Crear nuevo
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => { setShowExpenseLinkForm(false); setSelectedExpenseId(''); setExpenseFormMode('link') }}
                    className="px-2 py-1 text-gray-400 hover:text-gray-700 transition"
                    title="Cancelar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {expenseFormMode === 'link' ? (
                  <>
                    <select
                      value={selectedExpenseId}
                      onChange={(e) => setSelectedExpenseId(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-green-500 outline-none"
                    >
                      <option value="">Seleccionar gasto existente...</option>
                      {unlinkedExpenses.map(exp => (
                        <option key={exp.id} value={exp.id}>
                          {formatDate(exp.date)} — {exp.concept} — {formatCurrency(exp.amount + exp.tax_amount)}
                          {exp.supplier_name ? ` (${exp.supplier_name})` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => selectedExpenseId && linkExpenseToWorkLog(selectedExpenseId)}
                      disabled={!selectedExpenseId}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
                    >
                      Vincular
                    </button>
                  </>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Concepto (obligatorio)"
                      value={newExpense.concept}
                      onChange={(e) => setNewExpense({ ...newExpense, concept: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-green-500 outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Importe (sin IVA) *"
                        value={newExpense.amount}
                        onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                        className="px-3 py-2 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-green-500 outline-none"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="IVA (opcional)"
                        value={newExpense.tax_amount}
                        onChange={(e) => setNewExpense({ ...newExpense, tax_amount: e.target.value })}
                        className="px-3 py-2 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-green-500 outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Proveedor (opcional)"
                        value={newExpense.supplier_name}
                        onChange={(e) => setNewExpense({ ...newExpense, supplier_name: e.target.value })}
                        className="px-3 py-2 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-green-500 outline-none"
                      />
                      <input
                        type="date"
                        value={newExpense.date}
                        onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                        className="px-3 py-2 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-green-500 outline-none"
                      />
                    </div>
                    <button
                      onClick={createAndLinkExpense}
                      disabled={savingNewExpense || !newExpense.concept.trim() || !newExpense.amount}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
                    >
                      {savingNewExpense ? 'Creando...' : 'Crear y vincular'}
                    </button>
                    <p className="text-[11px] text-gray-500">
                      Para añadir la factura adjunta, edita el gasto desde Económico.
                    </p>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* ─── Partidas Vinculadas (Fase 2) ────────── */}
          {(() => {
            const certifiedPerLink = activeWorkLog.certifiedPerLink || {}
            const lockedLinkIdSet = new Set<string>((activeWorkLog as { lockedLinkIds?: string[] }).lockedLinkIds || [])
            const hasCertifiable = activeWorkLog.budgetLinks.some(link => {
              const already = certifiedPerLink[link.id] || 0
              return link.executed_quantity - already > 0.0001
            })
            return (
          <SectionCard
            title="Partidas Vinculadas"
            icon={<LinkIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
            expanded={expandedSections.has('budget-links')}
            onToggle={() => toggleSection('budget-links')}
            onAdd={() => setShowLinkForm(true)}
            count={activeWorkLog.budgetLinks.length}
            headerExtra={
              <button
                onClick={openCertifyFromThisLog}
                disabled={!hasCertifiable}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 active:bg-emerald-200 border border-emerald-200 dark:border-emerald-900/60 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
                title={hasCertifiable ? 'Certificar partidas ejecutadas' : 'No hay partidas pendientes de certificar'}
              >
                <FileText className="w-3.5 h-3.5" />
                Certificar
              </button>
            }
          >
            {activeWorkLog.budgetLinks.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No hay partidas vinculadas</p>
            ) : (
              <div className="space-y-0">
                {activeWorkLog.budgetLinks.map((link) => {
                  const item = budgetItemsList.find(bi => bi.id === link.budget_item_id)
                  const budgetQty = item?.quantity || 0
                  const pctDone = budgetQty > 0 ? Math.min((link.executed_quantity / budgetQty) * 100, 100) : 0
                  const budgetTotal = budgetQty * (item?.unit_price || 0)
                  const costTotal = budgetQty > 0 ? (link.executed_quantity / budgetQty) * budgetQty * (item?.cost_price || 0) : 0
                  const executedSaleValue = budgetQty > 0 ? (link.executed_quantity / budgetQty) * budgetTotal : 0
                  const profit = executedSaleValue - costTotal
                  const alreadyCertified = certifiedPerLink[link.id] || 0
                  const fullyCertified = alreadyCertified >= link.executed_quantity - 0.0001 && alreadyCertified > 0
                  const partiallyCertified = alreadyCertified > 0 && !fullyCertified
                  const isLocked = lockedLinkIdSet.has(link.id)

                  return (
                    <div key={link.id} className={`py-3 border-b border-gray-100 group ${fullyCertified ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-800 truncate">{item?.label || link.budget_item_id}</p>
                            {isLocked ? (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded"
                                title="Vinculada a una certificación aprobada/finalizada — bloqueada"
                              >
                                <LockIcon className="w-3 h-3" />
                                Bloqueada
                              </span>
                            ) : fullyCertified && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/60 rounded">
                                <Check className="w-3 h-3" />
                                Certificado
                              </span>
                            )}
                            {!isLocked && partiallyCertified && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded">
                                Parcial {alreadyCertified}/{link.executed_quantity}
                              </span>
                            )}
                          </div>
                          {link.notes && <p className="text-xs text-gray-400 mt-0.5">{link.notes}</p>}
                        </div>
                        {!isLocked && (
                          <button
                            onClick={async () => {
                              try {
                                await deleteBudgetLink(link.id)
                                loadCostControl(projectId); loadCostSummary(projectId)
                              } catch (err: any) {
                                addToast('error', err?.response?.data?.error || err.message || 'No se puede borrar la partida')
                              }
                            }}
                            className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition ml-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pctDone >= 100 ? 'bg-green-500' : pctDone > 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(pctDone, 100)}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-600 w-12 text-right">{pctDone.toFixed(0)}%</span>
                      </div>

                      {/* Editable execution + profit */}
                      <div className="mt-2 grid grid-cols-5 gap-3 text-xs">
                        <div>
                          <span className="text-gray-400">Presup.</span>
                          <p className="font-medium text-gray-700">{budgetQty} {item?.unit || ''}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Ejecutado</span>
                          {isLocked ? (
                            <p
                              className="font-medium text-gray-700 px-1.5 py-1 text-sm rounded border border-gray-200 bg-gray-50 dark:bg-gray-900/40"
                              title="Bloqueado: vinculado a una certificación aprobada/finalizada"
                            >
                              {link.executed_quantity}
                            </p>
                          ) : (
                            <DecimalInput
                              min={alreadyCertified}
                              value={link.executed_quantity}
                              onChange={async (v) => {
                                try {
                                  await updateBudgetLink(link.id, { executed_quantity: v })
                                  loadCostControl(projectId); loadCostSummary(projectId)
                                } catch (err: any) {
                                  addToast('error', err?.response?.data?.message || err?.response?.data?.error || err.message || 'No se puede modificar la cantidad ejecutada')
                                }
                              }}
                              className="w-full px-1.5 py-1 text-sm font-medium rounded border border-gray-300 focus:ring-1 focus:ring-purple-500 outline-none"
                            />
                          )}
                        </div>
                        <div>
                          <span className="text-gray-400">Certificado</span>
                          <p className={`font-medium ${alreadyCertified > 0 ? 'text-green-700 dark:text-green-300' : 'text-gray-400'}`}>
                            {alreadyCertified} {item?.unit || ''}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400">Venta</span>
                          <p className="font-medium text-gray-700">{formatCurrency(executedSaleValue)}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Beneficio</span>
                          <p className={`font-semibold ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {showLinkForm && (() => {
              // availableItems incluye: partidas con remaining > 0 + todas las auxiliares (is_auxiliary=true),
              // y excluye las que ya estén vinculadas a este parte. Esa es la única lista que usamos.
              const fullList: AvailableItem[] = availableItems
              const selectedItem = fullList.find(bi => bi.id === linkForm.budget_item_id)
              const selMaxLabel = selectedItem
                ? (selectedItem.is_auxiliary ? 'sin tope' : `hasta ${selectedItem.remaining ?? 0}`)
                : ''

              // Agrupar por capítulo (y auxiliares en un grupo propio al final)
              const normalItems = fullList.filter(bi => !bi.is_auxiliary)
              const auxItems = fullList.filter(bi => bi.is_auxiliary)
              const chapterGroups = new Map<string, { code: string; name: string; sort: number; items: AvailableItem[] }>()
              for (const bi of normalItems) {
                const key = bi.chapter_id
                if (!chapterGroups.has(key)) {
                  chapterGroups.set(key, {
                    code: bi.chapter_code,
                    name: bi.chapter_name,
                    sort: bi.chapter_sort_order ?? 0,
                    items: [],
                  })
                }
                chapterGroups.get(key)!.items.push(bi)
              }
              const orderedGroups = [...chapterGroups.values()].sort(
                (a, b) => (a.sort - b.sort) || a.code.localeCompare(b.code)
              )

              return (
                <form onSubmit={handleAddBudgetLink} className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-500">Partida del presupuesto</label>
                    <span className="text-[11px] text-gray-400">
                      Partidas auxiliares ({'\u221E'}) siempre disponibles
                    </span>
                  </div>
                  <div>
                    <select required value={linkForm.budget_item_id} onChange={e => setLinkForm({ ...linkForm, budget_item_id: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-purple-500 outline-none">
                      <option value="">Seleccionar partida...</option>
                      {fullList.length === 0 && (
                        <option value="" disabled>No quedan partidas pendientes</option>
                      )}
                      {orderedGroups.map(group => (
                        <optgroup key={group.code + group.name} label={`${group.code} — ${group.name}`}>
                          {group.items.map(bi => (
                            <option key={bi.id} value={bi.id}>
                              {bi.code} — {bi.name} (quedan {bi.remaining ?? 0} {bi.unit})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      {auxItems.length > 0 && (
                        <optgroup label={`Auxiliares (${'\u221E'})`}>
                          {auxItems.map(bi => (
                            <option key={bi.id} value={bi.id}>
                              [AUX] {bi.chapter_code}.{bi.code} — {bi.name} (ya {bi.certified_total.toFixed(2)} cert.)
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  {selectedItem && (
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5">
                      {selectedItem.is_auxiliary && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold">
                          AUX · sin tope
                        </span>
                      )}
                      <span>Presupuestado: <b className="text-gray-700">{selectedItem.quantity} {selectedItem.unit}</b></span>
                      <span>Ejecutado en otros partes: <b className="text-gray-700">{selectedItem.executed_other_logs} {selectedItem.unit}</b></span>
                      <span>Certificado: <b className="text-gray-700">{selectedItem.certified_total} {selectedItem.unit}</b></span>
                      <span>Pendiente: <b className={selectedItem.is_auxiliary ? 'text-amber-700 dark:text-amber-300' : 'text-purple-700 dark:text-purple-300'}>
                        {selectedItem.is_auxiliary ? '∞ sin tope' : `${selectedItem.remaining ?? 0} ${selectedItem.unit}`}
                      </b></span>
                      <span>P. Venta: <b className="text-gray-700">{formatCurrency(selectedItem.unit_price)}/{selectedItem.unit}</b></span>
                      <span>P. Coste: <b className="text-gray-700">{formatCurrency(selectedItem.cost_price)}/{selectedItem.unit}</b></span>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <div className="w-32">
                      <label className="text-xs text-gray-500">Cantidad ejecutada</label>
                      <DecimalInput
                        min="0"
                        max={selectedItem?.is_auxiliary ? undefined : (selectedItem?.remaining ?? undefined)}
                        value={parseFloat(linkForm.executed_quantity as string) || 0}
                        onChange={v => setLinkForm({ ...linkForm, executed_quantity: String(v) })}
                        className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-purple-500 outline-none"
                        placeholder={selMaxLabel} />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500">Notas</label>
                      <input type="text" value={linkForm.notes} onChange={e => setLinkForm({ ...linkForm, notes: e.target.value })}
                        className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-purple-500 outline-none" placeholder="Opcional..." />
                    </div>
                    <button type="submit" className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition">Vincular</button>
                    <button type="button" onClick={() => setShowLinkForm(false)} className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              )
            })()}
          </SectionCard>
            )
          })()}
        </div>
      )}

      {/* ─── TAB: COST CONTROL (Fase 3) ─────────────────────── */}
      {tab === 'cost-control' && (
        <div>
          {/* Sub-tabs: Beneficio | Desglose Costes */}
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setCostSubTab('profit')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${costSubTab === 'profit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Beneficio por Parte
            </button>
            <button
              onClick={() => { setCostSubTab('breakdown'); loadCostSummary(projectId) }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${costSubTab === 'breakdown' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Desglose de Costes
            </button>
          </div>

          {/* ─── SUB-TAB: PROFIT (existing) ─── */}
          {costSubTab === 'profit' && (
            <>
              {!costControl ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
                </div>
              ) : costControl.logs.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
                  <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No hay datos de control de costes</p>
                  <p className="text-gray-400 text-sm mt-1">Vincula partidas del presupuesto a los partes de obra</p>
                </div>
              ) : (
                <>
                  {/* Totals Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Valor Venta</p>
                      <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(costControl.totals.sale_value)}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Coste Real</p>
                      <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(costControl.totals.real_cost)}</p>
                    </div>
                    <div className={`rounded-xl border p-4 ${
                      costControl.totals.profit >= 0 ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900/60' : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60'
                    }`}>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Beneficio Total</p>
                      <div className="flex items-center gap-2 mt-1">
                        {costControl.totals.profit >= 0
                          ? <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                          : <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />}
                        <p className={`text-xl font-bold ${costControl.totals.profit >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                          {costControl.totals.profit >= 0 ? '+' : ''}{formatCurrency(costControl.totals.profit)}
                        </p>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Margen</p>
                      <p className={`text-xl font-bold mt-1 ${
                        costControl.totals.sale_value > 0
                          ? (costControl.totals.profit / costControl.totals.sale_value * 100) >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                          : 'text-gray-500'
                      }`}>
                        {costControl.totals.sale_value > 0
                          ? `${(costControl.totals.profit / costControl.totals.sale_value * 100).toFixed(1)}%`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Per Work Log Profit Table */}
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Beneficio por Parte de Obra</h3>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <th className="px-4 py-3 text-left">Fecha</th>
                          <th className="px-4 py-3 text-left">Descripción</th>
                          <th className="px-4 py-3 text-right">Venta</th>
                          <th className="px-4 py-3 text-right">Coste</th>
                          <th className="px-4 py-3 text-right">Gastos</th>
                          <th className="px-4 py-3 text-right">Beneficio</th>
                          <th className="px-4 py-3 text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costControl.logs.map((log) => (
                          <tr key={log.work_log_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatDate(log.date)}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              <p className="truncate max-w-xs">{log.description || '—'}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {log.linked_items.map(li => li.code).join(', ')}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-sm text-right">{formatCurrency(log.sale_value)}</td>
                            <td className="px-4 py-3 text-sm text-right">{formatCurrency(log.real_cost)}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-500">
                              {log.expenses_cost > 0 ? formatCurrency(log.expenses_cost) : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium">
                              <span className={log.profit >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                                {log.profit >= 0 ? '+' : ''}{formatCurrency(log.profit)}
                              </span>
                              <span className="text-xs text-gray-400 ml-1">({log.profit_pct}%)</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                log.status === 'favorable' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' :
                                log.status === 'desfavorable' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {log.status === 'favorable' ? <TrendingUp className="w-3 h-3" /> :
                                 log.status === 'desfavorable' ? <TrendingDown className="w-3 h-3" /> :
                                 <Minus className="w-3 h-3" />}
                                {log.status === 'favorable' ? 'Favorable' :
                                 log.status === 'desfavorable' ? 'Desfavorable' : 'Neutro'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-sm">
                          <td className="px-4 py-3 text-gray-700" colSpan={2}>Total</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(costControl.totals.sale_value)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(costControl.totals.real_cost)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {formatCurrency(costControl.logs.reduce((s, l) => s + (l.expenses_cost || 0), 0))}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={costControl.totals.profit >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                              {costControl.totals.profit >= 0 ? '+' : ''}{formatCurrency(costControl.totals.profit)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              costControl.totals.profit >= 0 ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                            }`}>
                              {costControl.totals.profit >= 0 ? 'Favorable' : 'Desfavorable'}
                            </span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Aggregated Partida Progress */}
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Progreso de Partidas</h3>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <th className="px-4 py-3 text-left">Partida</th>
                          <th className="px-4 py-3 text-right">Presupuestado</th>
                          <th className="px-4 py-3 text-right">Ejecutado</th>
                          <th className="px-4 py-3 text-right">Progreso</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costControl.items.map((item) => (
                          <tr key={item.budget_item_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-gray-900">{item.code}</p>
                              <p className="text-xs text-gray-500 truncate max-w-xs">{item.name}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {item.budget_quantity} {item.unit}
                              <p className="text-xs text-gray-400">{formatCurrency(item.budget_total)}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium">
                              {item.executed_quantity} {item.unit}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${
                                    item.executed_pct >= 100 ? 'bg-green-500' : item.executed_pct > 50 ? 'bg-blue-500' : 'bg-amber-500'
                                  }`} style={{ width: `${Math.min(item.executed_pct, 100)}%` }} />
                                </div>
                                <span className="text-xs font-semibold text-gray-600 w-12 text-right">{item.executed_pct.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* ─── SUB-TAB: COST BREAKDOWN (new) ─── */}
          {costSubTab === 'breakdown' && (
            <>
              {!costSummary ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
                </div>
              ) : costSummary.by_category.total === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
                  <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No hay costes registrados</p>
                  <p className="text-gray-400 text-sm mt-1">Registra mano de obra, materiales, maquinaria o gastos en los partes</p>
                </div>
              ) : (
                <>
                  {/* Date filter */}
                  <div className="flex items-center gap-3 mb-6 bg-white rounded-xl border border-gray-200 p-3">
                    <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Filtrar por fecha:</span>
                    <input
                      type="date"
                      value={costDateFrom}
                      onChange={(e) => setCostDateFrom(e.target.value)}
                      className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="text-gray-400">—</span>
                    <input
                      type="date"
                      value={costDateTo}
                      onChange={(e) => setCostDateTo(e.target.value)}
                      className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      onClick={() => loadCostSummary(projectId, costDateFrom || undefined, costDateTo || undefined)}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      Filtrar
                    </button>
                    {(costDateFrom || costDateTo) && (
                      <button
                        onClick={() => { setCostDateFrom(''); setCostDateTo(''); loadCostSummary(projectId) }}
                        className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  {/* Category Cards (donut-style summary) */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
                    {[
                      { label: 'Mano de Obra', value: costSummary.by_category.labor, iconColor: 'text-blue-500 dark:text-blue-400', barColor: 'bg-blue-500', icon: Users },
                      { label: 'Materiales', value: costSummary.by_category.materials, iconColor: 'text-amber-500 dark:text-amber-400', barColor: 'bg-amber-500', icon: Package },
                      { label: 'Maquinaria', value: costSummary.by_category.equipment, iconColor: 'text-orange-500 dark:text-orange-400', barColor: 'bg-orange-500', icon: Wrench },
                      { label: 'Gastos', value: costSummary.by_category.expenses, iconColor: 'text-purple-500 dark:text-purple-400', barColor: 'bg-purple-500', icon: Receipt },
                      { label: 'TOTAL', value: costSummary.by_category.total, iconColor: 'text-white', barColor: '', icon: BarChart3 },
                    ].map(({ label, value, iconColor, barColor, icon: Icon }) => (
                      <div key={label} className={`rounded-xl border p-4 ${label === 'TOTAL' ? 'bg-gray-900 border-gray-900 col-span-2 sm:col-span-1' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`w-4 h-4 ${label === 'TOTAL' ? 'text-white' : iconColor}`} />
                          <p className={`text-xs uppercase tracking-wider font-medium ${label === 'TOTAL' ? 'text-gray-300' : 'text-gray-500'}`}>{label}</p>
                        </div>
                        <p className={`text-lg font-bold ${label === 'TOTAL' ? 'text-white' : 'text-gray-900'}`}>{formatCurrency(value)}</p>
                        {label !== 'TOTAL' && costSummary.by_category.total > 0 && (
                          <div className="mt-2">
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min((value / costSummary.by_category.total) * 100, 100)}%` }} />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">{((value / costSummary.by_category.total) * 100).toFixed(1)}%</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* By Supplier */}
                  {costSummary.by_supplier.length > 0 && (
                    <>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Coste por Proveedor</h3>
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                              <th className="px-4 py-3 text-left">Proveedor</th>
                              <th className="px-4 py-3 text-right">Materiales</th>
                              <th className="px-4 py-3 text-right">Maquinaria</th>
                              <th className="px-4 py-3 text-right">Gastos</th>
                              <th className="px-4 py-3 text-right">Total</th>
                              <th className="px-4 py-3 text-right">% del Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {costSummary.by_supplier.map((s, i) => (
                              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.name}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">{s.materials > 0 ? formatCurrency(s.materials) : '—'}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">{s.equipment > 0 ? formatCurrency(s.equipment) : '—'}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">{s.expenses > 0 ? formatCurrency(s.expenses) : '—'}</td>
                                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(s.total)}</td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(s.pct, 100)}%` }} />
                                    </div>
                                    <span className="text-xs text-gray-500 w-10 text-right">{s.pct}%</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {/* By Equipment Category */}
                  {costSummary.by_equipment_category.length > 0 && (
                    <>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Coste por Maquinaria</h3>
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                              <th className="px-4 py-3 text-left">Maquinaria</th>
                              <th className="px-4 py-3 text-right">Horas</th>
                              <th className="px-4 py-3 text-right">Registros</th>
                              <th className="px-4 py-3 text-right">Coste</th>
                              <th className="px-4 py-3 text-right">% Maquinaria</th>
                            </tr>
                          </thead>
                          <tbody>
                            {costSummary.by_equipment_category.map((c, i) => (
                              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                                <td className="px-4 py-3">
                                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                                  {c.category && <p className="text-xs text-gray-400">{c.category}</p>}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">{c.hours}h</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-500">{c.entries}</td>
                                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(c.cost)}</td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(c.pct, 100)}%` }} />
                                    </div>
                                    <span className="text-xs text-gray-500 w-10 text-right">{c.pct}%</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-sm">
                              <td className="px-4 py-3 text-gray-700">Total Maquinaria</td>
                              <td className="px-4 py-3 text-right">{costSummary.by_equipment_category.reduce((s, c) => s + c.hours, 0)}h</td>
                              <td className="px-4 py-3 text-right text-gray-500">{costSummary.by_equipment_category.reduce((s, c) => s + c.entries, 0)}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(costSummary.by_category.equipment)}</td>
                              <td className="px-4 py-3 text-right text-gray-500">100%</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )}

                  {/* By Material */}
                  {costSummary.by_material.length > 0 && (
                    <>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Coste por Material</h3>
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                              <th className="px-4 py-3 text-left">Material</th>
                              <th className="px-4 py-3 text-right">Cantidad</th>
                              <th className="px-4 py-3 text-right">Registros</th>
                              <th className="px-4 py-3 text-right">Coste</th>
                              <th className="px-4 py-3 text-right">% Materiales</th>
                            </tr>
                          </thead>
                          <tbody>
                            {costSummary.by_material.map((m, i) => (
                              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.name}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">{m.quantity} {m.unit}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-500">{m.entries}</td>
                                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(m.cost)}</td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(m.pct, 100)}%` }} />
                                    </div>
                                    <span className="text-xs text-gray-500 w-10 text-right">{m.pct}%</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-sm">
                              <td className="px-4 py-3 text-gray-700">Total Materiales</td>
                              <td className="px-4 py-3" colSpan={2}></td>
                              <td className="px-4 py-3 text-right">{formatCurrency(costSummary.by_category.materials)}</td>
                              <td className="px-4 py-3 text-right text-gray-500">100%</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Create/Edit Work Log Modal ─────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              {editingId ? 'Editar Parte' : 'Nuevo Parte de Obra'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tiempo</label>
                  <div className="flex gap-1">
                    {WEATHER_OPTIONS.map(w => {
                      const Icon = w.icon
                      return (
                        <button key={w.value} type="button"
                          onClick={() => setForm({ ...form, weather: form.weather === w.value ? '' : w.value })}
                          className={`p-2 rounded-lg border transition ${
                            form.weather === w.value ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-900/60 text-blue-600 dark:text-blue-400' : 'border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}
                          title={w.label}>
                          <Icon className="w-4 h-4" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción del trabajo</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                  placeholder="Vertido del hormigón de limpieza, encofrado de zapatas..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="Observaciones, incidencias..." />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition">
                  Cancelar
                </button>
                <button type="submit" disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shadow-sm disabled:opacity-50">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingId ? 'Guardar Cambios' : 'Crear Parte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Certify From This Work Log Modal ─── */}
      <CertifyFromWorkLogsModal
        isOpen={showCertifyModal}
        onClose={() => setShowCertifyModal(false)}
        budgets={budgets}
        preselection={certifyPreselection}
        onCreated={() => {
          setShowCertifyModal(false)
          if (activeWorkLog) loadFullWorkLog(activeWorkLog.workLog.id)
          loadCostControl(projectId); loadCostSummary(projectId)
        }}
      />
    </div>
  )
}

// ─── Reusable collapsible section component ─────────────────────────
function SectionCard({
  title, icon, expanded, onToggle, onAdd, count, children, headerExtra,
}: {
  title: string
  icon: React.ReactNode
  expanded: boolean
  onToggle: () => void
  onAdd: () => void
  count: number
  children: React.ReactNode
  headerExtra?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <button className="p-0.5 text-gray-400">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {icon}
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{count}</span>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {headerExtra}
          <button
            onClick={(e) => { e.stopPropagation(); onAdd() }}
            className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded transition"
            title="Añadir"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  )
}
