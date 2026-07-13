// ─── Auth & Users ────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

// ─── Project ─────────────────────────────────────────────────────────
export interface ProjectInfo {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  description: string | null;
  location: string | null;
  client_name: string | null;
  client_contact: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "paused" | "completed" | "archived";
  currency: string;
  tax_rate: number;
  folder_path: string | null;
  created_at: string;
  updated_at: string;
  // Branch fields (when project comes from a linked branch)
  source?: 'branch';
  branch_link_id?: string;
  branch_org_name?: string;
  // Soft-delete (solo presente en proyectos en papelera).
  deleted_at?: string | null;
  deleted_by?: string | null;
  // Metadatos de acceso (solo presente en GET /:id)
  access?: {
    role: 'owner' | 'admin' | 'member' | 'branch_viewer' | 'mailbox_guest' | null;
    shared_kinds: string[] | null;
  };
}

export interface ProjectFile {
  id: string;
  project_id: string;
  original_name: string;
  stored_name: string;
  storage_path: string;
  file_type: "pdf" | "dwg" | "dxf" | "image" | "document" | "spreadsheet" | "other";
  file_size: number | null;
  category: "plan" | "memory" | "measurement" | "budget" | "photo" | "general";
  description: string | null;
  imported_at: string;
  dxf_svg_path?: string | null;
  parent_file_id?: string | null;
  page_order?: number;
  thumbnail_url?: string | null;
}

export interface CreateProjectParams {
  name: string;
  location?: string;
  client_name?: string;
  description?: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  start_date?: string;
  end_date?: string;
  folder_path?: string;
}

// ─── Materials ───────────────────────────────────────────────────────
export interface Material {
  id: string;
  organization_id: string;
  category_id: string | null;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  unit_price: number;
  sale_price: number;
  currency: string;
  brand: string | null;
  notes: string | null;
  material_group_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ComparisonSupplierPrice {
  price: number;
  material_code: string;
  material_name: string;
}

export interface ComparisonRow {
  type: 'group' | 'single';
  group_id: string | null;
  canonical_name: string;
  unit: string;
  materials: Pick<Material, 'id' | 'code' | 'name' | 'unit' | 'unit_price' | 'material_group_id'>[];
  supplier_prices: Record<string, ComparisonSupplierPrice>;
}

export interface ComparisonData {
  rows: ComparisonRow[];
  suppliers: { id: string; name: string }[];
}

export interface MaterialCategory {
  id: string;
  parent_id: string | null;
  code: string;
  name_es: string;
  name_en: string | null;
  sort_order: number;
}

export interface MaterialPriceHistory {
  id: string;
  material_id: string;
  unit_price: number;
  supplier_id: string | null;
  effective_date: string;
  source: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Budget ──────────────────────────────────────────────────────────
export interface Budget {
  id: string;
  project_id: string;
  name: string;
  version: number;
  status: "draft" | "pending" | "approved" | "rejected" | "superseded";
  tax_rate: number;
  overhead_pct: number;
  profit_pct: number;
  notes: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface Chapter {
  id: string;
  budget_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_legal_text?: boolean;
  is_active?: boolean;
}

export interface Measurement {
  id: string;
  budget_item_id: string;
  description: string | null;
  units: number;
  length: number;
  width: number;
  height: number;
  partial: number;
  sort_order: number;
}

/**
 * Traza del precio importado desde otro presupuesto o de biblioteca.
 * Denormalizada: se guarda el nombre del origen para que siga legible
 * aunque se borre la fuente.
 */
export interface PriceSource {
  kind: 'budget' | 'library';
  /** id del cons_budgets (vacío si kind='library') */
  budget_id?: string;
  /** id del cons_budget_items del que se copió (vacío si kind='library') */
  item_id?: string;
  /** id del cons_saved_partidas (solo si kind='library') */
  library_partida_id?: string;
  project_id?: string;
  project_name?: string;
  budget_name?: string;
  item_code?: string;
  item_name?: string;
  unit_price: number;
  copied_at: string;
}

export interface BudgetItem {
  id: string;
  chapter_id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  sort_order: number;
  notes: string | null;
  measurements: Measurement[];
  is_active?: boolean;
  /** Partida auxiliar / abierta (p.ej. ayuda de albañilería). Sin tope de cantidad. */
  is_auxiliary?: boolean;
  /** Agregado desde GET /budgets/:id/full */
  executed_total?: number;
  /** Agregado desde GET /budgets/:id/full */
  certified_total?: number;
  /** Agregado desde GET /budgets/:id/full. null si is_auxiliary=true (sin tope). */
  remaining?: number | null;
  /** Traza del origen del precio (copiado desde otro presupuesto o biblioteca). */
  price_source?: PriceSource | null;
}

// ─── Reference budget viewer ─────────────────────────────────────────
export interface ReferenceProjectSummary {
  id: string;
  name: string;
  client_name?: string | null;
  city?: string | null;
  /** 'own' = mi organización; 'branch' = de una sucursal vinculada (compartido). */
  source?: 'own' | 'branch';
  /** Nombre de la sucursal de origen cuando source='branch'. */
  branch_org_name?: string | null;
  budgets: Array<{
    id: string;
    project_id: string;
    name: string;
    version: number;
    status: string;
    tax_rate?: number;
    updated_at?: string;
  }>;
}

export interface ReferenceCatalog {
  projects: ReferenceProjectSummary[];
  library: { partida_count: number };
}

/** Mensaje enviado por el visor al editor cuando el usuario hace clic en un precio. */
export interface PricePickMessage {
  type: 'budget-price-pick';
  unit_price: number;
  source: PriceSource;
}

export interface PriceBreakdownLine {
  id: string;
  budget_item_id: string;
  resource_type: 'labor' | 'material' | 'equipment' | 'subcontract' | 'other';
  material_id: string | null;
  description: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  sort_order: number;
  created_at: string;
}

export interface ChapterWithItems {
  chapter: Chapter;
  items: BudgetItem[];
}

export interface FullBudget {
  budget: Budget;
  chapters: ChapterWithItems[];
}

// ─── Budget Comparison ──────────────────────────────────────────────
export interface ComparisonGroupItem {
  item_id: string;
  side: 'A' | 'B';
}

export interface ComparisonGroup {
  id: string;
  notes?: string | null;
  items: ComparisonGroupItem[];
}

export interface ComparisonSuggestion {
  item_a_id: string;
  item_b_id: string;
  score: number;
  reason: string;
}

export interface ComparisonState {
  groups: ComparisonGroup[];
  exclusions: string[];
  suggestions: ComparisonSuggestion[];
}

// ─── Templates ──────────────────────────────────────────────────────
export interface ChapterTemplate {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_default: boolean;
}

export interface ItemTemplate {
  id: string;
  chapter_code: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  unit_price: number;
  sort_order: number;
}

// ─── Certifications ─────────────────────────────────────────────────
export interface Certification {
  id: string;
  budget_id: string;
  number: number;
  name: string;
  period_start: string | null;
  period_end: string | null;
  status: "draft" | "submitted" | "approved" | "finalized";
  notes: string | null;
  invoice_number: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CertificationItemWorkLogLink {
  id: string;
  work_log_id: string;
  work_log_date: string | null;
  work_log_description: string | null;
  consumed_quantity: number;
  work_log_budget_link_id: string;
}

export interface CertificationItem {
  id: string;
  certification_id: string;
  budget_item_id: string;
  certified_quantity: number;
  certified_pct: number;
  certified_amount: number;
  previous_quantity: number;
  previous_amount: number;
  notes: string | null;
  item_code?: string;
  item_name?: string;
  item_unit?: string;
  item_quantity?: number;
  item_unit_price?: number;
  is_auxiliary?: boolean;
  chapter_id?: string;
  chapter_code?: string;
  chapter_name?: string;
  work_log_links?: CertificationItemWorkLogLink[];
}

export interface CertificationSummary {
  certification: Certification;
  items: CertificationItem[];
  total_certified: number;
  total_previous: number;
  total_current: number;
  total_pending: number;
}

export interface CertificationOverview {
  id: string;
  budget_id: string;
  number: number;
  name: string;
  status: "draft" | "submitted" | "approved" | "finalized";
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  budget_name: string;
  current_amount: number;
  previous_amount: number;
  total_certified: number;
  budget_total: number;
  progress_pct: number;
}

export interface CertifiableItem {
  work_log_budget_link_id: string;
  budget_item_id: string;
  budget_id: string;
  budget_name: string;
  chapter_id: string;
  chapter_code: string;
  chapter_name: string;
  code: string;
  name: string;
  unit: string;
  unit_price: number;
  executed_quantity: number;
  already_certified: number;
  residual: number;
}

export interface CertifiableWorkLog {
  work_log: Pick<WorkLog, "id" | "date" | "description" | "status">;
  items: CertifiableItem[];
}

export interface CertificationWorkLogLink {
  id: string;
  certification_id: string;
  certification_item_id: string;
  work_log_id: string;
  work_log_budget_link_id: string;
  budget_item_id: string;
  consumed_quantity: number;
  created_at: string;
  work_log_date?: string;
  work_log_description?: string | null;
  budget_item_code?: string;
  budget_item_name?: string;
  budget_item_unit?: string;
}

// ─── Library Chapters ───────────────────────────────────────────────
export interface LibraryChapter {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  partida_count?: number;
}

export interface LibraryChapterWithPartidas {
  chapter: LibraryChapter;
  partidas: SavedPartida[];
}

// ─── Saved Partidas Library ─────────────────────────────────────────
export interface SavedPartida {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  unit_price: number;
  cost_price: number;
  chapter_code: string | null;
  library_chapter_id: string | null;
  tags: string;
  source: "manual" | "from_budget" | "imported";
  usage_count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  is_auxiliary?: boolean;
}

export interface SimilarityMatch {
  saved_partida_id: string;
  saved_name: string;
  similarity_score: number;
  reason: string;
}

export interface BatchSaveResult {
  created: number;
  updated: number;
  skipped: number;
}

// ─── Expenses ───────────────────────────────────────────────────────
export interface ProjectExpense {
  id: string;
  project_id: string;
  date: string;
  supplier_name: string | null;
  supplier_id: string | null;
  concept: string;
  amount: number;
  tax_amount: number;
  image_path: string | null;
  budget_chapter_id: string | null;
  work_log_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Plan Annotations ───────────────────────────────────────────────
export interface PlanAnnotation {
  id: string;
  file_id: string;
  page_number: number;
  annotation_type: "distance" | "area" | "dimension" | "text" | "arrow" | "line" | "calibrate";
  data: Record<string, unknown>;
  created_at: string;
}

export interface PlanCalibration {
  id: string;
  file_id: string;
  page_number: number;
  pixels_distance: number;
  real_distance: number;
  unit: string;
}

// ─── Suppliers ──────────────────────────────────────────────────────
export interface Supplier {
  id: string;
  organization_id: string;
  name: string;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  website: string | null;
  category: string | null;
  notes: string | null;
  rating: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Supplier Materials ────────────────────────────────────────────
export interface SupplierMaterial {
  id: string;
  supplier_id: string;
  material_id: string;
  unit_price: number;
  notes: string | null;
  last_updated: string | null;
  created_at: string;
  material?: {
    id: string;
    code: string;
    name: string;
    unit: string;
    unit_price: number;
    sale_price: number;
  };
  supplier?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    rating: number;
    category: string | null;
  };
}

// ─── Workers (Personal de Obra) ────────────────────────────────────
export interface Worker {
  id: string;
  organization_id: string;
  name: string;
  dni: string | null;
  role: string;
  specialty: string | null;
  hourly_rate: number;
  phone: string | null;
  email: string | null;
  emergency_contact: string | null;
  is_subcontracted: boolean;
  subcontractor_id: string | null;
  certifications: WorkerCertification[];
  status: "active" | "inactive" | "on_leave";
  photo_url: string | null;
  hire_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerCertification {
  name: string;
  expiry_date: string | null;
  status: "valid" | "expired" | "pending";
}

// ─── Equipment Catalog (Maquinaria) ────────────────────────────────
export interface EquipmentCatalogItem {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  type: "propia" | "alquilada";
  category: string | null;
  hourly_rate: number;
  daily_rate: number;
  supplier_id: string | null;
  license_plate: string | null;
  serial_number: string | null;
  maintenance_next: string | null;
  status: "available" | "in_use" | "maintenance" | "retired";
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Subcontractors (Subcontratistas) ──────────────────────────────
export interface Subcontractor {
  id: string;
  organization_id: string;
  name: string;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  specialty: string | null;
  rating: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubcontractorDocument {
  id: string;
  subcontractor_id: string;
  project_id: string | null;
  doc_type: "tc1" | "tc2" | "seguro_rc" | "seguro_accidentes" | "plan_seguridad" | "evaluacion_riesgos" | "formacion_prl" | "rea" | "certificado_corriente_ss" | "certificado_corriente_hacienda" | "libro_subcontratacion" | "contrato" | "otro";
  name: string;
  file_path: string | null;
  expiry_date: string | null;
  status: "valid" | "expired" | "pending" | "rejected";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Work Logs (Partes de Obra) ────────────────────────────────────
export interface WorkLog {
  id: string;
  project_id: string;
  date: string;
  description: string | null;
  weather: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved";
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkLogLabor {
  id: string;
  work_log_id: string;
  role: string;
  worker_count: number;
  hours: number;
  hourly_rate: number;
  sort_order: number;
  date: string | null;
  worker_id: string | null;
  worker_name?: string;
  description?: string | null;
}

export interface WorkLogMaterial {
  id: string;
  work_log_id: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  sort_order: number;
  date: string | null;
  description?: string | null;
}

export interface WorkLogEquipment {
  id: string;
  work_log_id: string;
  equipment_name: string;
  hours: number;
  hourly_rate: number;
  sort_order: number;
  date: string | null;
  equipment_id: string | null;
  description?: string | null;
}

export interface WorkLogBudgetLink {
  id: string;
  work_log_id: string;
  budget_item_id: string;
  executed_quantity: number;
  notes: string | null;
}

export interface FullWorkLog {
  workLog: WorkLog;
  labor: WorkLogLabor[];
  materials: WorkLogMaterial[];
  equipment: WorkLogEquipment[];
  budgetLinks: WorkLogBudgetLink[];
  expenses: ProjectExpense[];
  certifiedPerLink: Record<string, number>;
}

export interface CostControlLinkedItem {
  budget_item_id: string;
  code: string;
  name: string;
  unit: string;
  budget_quantity: number;
  executed_quantity: number;
  unit_price: number;
  line_sale_value: number;
}

export interface CostControlLogEntry {
  work_log_id: string;
  date: string;
  description: string | null;
  sale_value: number;
  real_cost: number;
  expenses_cost: number;
  profit: number;
  profit_pct: number;
  status: "favorable" | "desfavorable" | "neutro";
  linked_items: CostControlLinkedItem[];
}

export interface CostControlItem {
  budget_item_id: string;
  code: string;
  name: string;
  unit: string;
  budget_quantity: number;
  budget_unit_price: number;
  budget_total: number;
  executed_quantity: number;
  executed_pct: number;
}

export interface CostControlData {
  logs: CostControlLogEntry[];
  items: CostControlItem[];
  totals: {
    sale_value: number;
    real_cost: number;
    profit: number;
  };
}

// ─── Cost Summary (breakdown by category/supplier/equipment/material) ────
export interface CostSummaryByCategory {
  labor: number;
  materials: number;
  equipment: number;
  expenses: number;
  total: number;
}

export interface CostSummarySupplier {
  name: string;
  labor: number;
  materials: number;
  equipment: number;
  expenses: number;
  total: number;
  pct: number;
}

export interface CostSummaryEquipmentCategory {
  name: string;
  category: string;
  cost: number;
  hours: number;
  entries: number;
  pct: number;
}

export interface CostSummaryMaterial {
  name: string;
  cost: number;
  quantity: number;
  unit: string;
  entries: number;
  pct: number;
}

export interface CostSummaryData {
  by_category: CostSummaryByCategory;
  by_supplier: CostSummarySupplier[];
  by_equipment_category: CostSummaryEquipmentCategory[];
  by_material: CostSummaryMaterial[];
  date_range: { from: string | null; to: string | null };
}

// ─── Branch (Sucursales) ────────────────────────────────────────────
export interface BranchInvitation {
  id: string;
  from_organization_id: string;
  from_user_id: string;
  to_email: string;
  to_user_id: string | null;
  to_organization_id: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  responded_at: string | null;
  from_organization_name?: string;
  to_organization_name?: string;
}

export interface BranchLink {
  id: string;
  organization_a_id: string;
  organization_b_id: string;
  invitation_id: string;
  created_at: string;
  partner_organization_id: string;
  partner_organization_name: string;
}

export interface BranchProjectVisibility {
  project_id: string;
  project_name: string;
  visible: boolean;
}

// ─── Mailbox (Buzón) ───────────────────────────────────────────────
export type MailboxAttachmentKind = 'file' | 'budget' | 'certification' | 'project_file' | 'work_log' | 'expense';

export interface MailboxAttachment {
  id: string;
  message_id?: string;
  kind: MailboxAttachmentKind;
  ref_id: string | null;
  label: string;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at?: string;
  resource?: Record<string, unknown> | null;
}

export interface MailboxAttachmentRef {
  kind: Exclude<MailboxAttachmentKind, 'file'>;
  ref_id: string;
  label: string;
}

export interface MailboxMessage {
  id: string;
  from_user_id: string;
  from_organization_id: string;
  to_user_id: string;
  to_organization_id: string;
  subject: string;
  body: string | null;
  budget_id: string | null;
  project_id: string | null;
  read: boolean;
  created_at: string;
  from_user?: { id: string; full_name: string; email: string } | null;
  to_user?: { id: string; full_name: string; email: string } | null;
  attachments?: MailboxAttachment[];
  attachments_count?: number;
  // Solo presentes en /trash: qué lado del mensaje es del usuario actual, y cuándo lo envió a papelera
  side?: 'inbox' | 'sent';
  trashed_at?: string | null;
}

export interface MailboxContact {
  id: string;
  contact_user_id: string;
  created_at: string;
  user: { id: string; email: string; full_name: string; avatar_url: string | null } | null;
}

export interface MailboxUserSearchResult {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  is_contact: boolean;
}

// ─── Notifications (Notificaciones) ────────────────────────────────
export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

// ─── App Settings ───────────────────────────────────────────────────
export interface AppSettings {
  [key: string]: string;
}
