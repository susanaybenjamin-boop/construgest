# Construgest — Inventario de base de datos (Fase 0)

> Extraído del proyecto Supabase **APP360** (`qexnthgfdvtvwoeykgun`, Postgres 17) el 2026-07-13.
> Base de datos COMPARTIDA con otras apps; aquí SOLO están las tablas de Construgest
> (`cons_*`, `ferrapp_*`, `mcp_*`). Datos crudos en `raw/`.

**Resumen:** 60 tablas · 592 columnas · 174 constraints · 101 índices (no-constraint).

## Mapeo de tipos Postgres → MariaDB

| Postgres | MariaDB | Nota |
|---|---|---|
| uuid | CHAR(36) | UUID generado por la app (backend) |
| uuid[] , text[] | JSON | array → array JSON |
| jsonb | JSON | |
| text | TEXT | |
| varchar(n) | VARCHAR(n) | |
| character(n) | CHAR(n) | |
| boolean | TINYINT(1) | |
| integer / bigint | INT / BIGINT | |
| numeric(p,s) | DECIMAL(p,s) | |
| date | DATE | |
| timestamptz | DATETIME(3) | guardar en UTC; MariaDB no tiene tz |

## Tablas por bloque

**Construgest (cons_)** (52): cons_ai_consumption, cons_ai_pricing, cons_ai_provider_credits, cons_app_settings, cons_branch_invitations, cons_branch_links, cons_branch_project_visibility, cons_budget_chapter_templates, cons_budget_comparison_exclusions, cons_budget_comparison_group_items, cons_budget_comparison_groups, cons_budget_item_templates, cons_budget_items, cons_budgets, cons_certification_items, cons_certification_work_log_links, cons_certifications, cons_chapters, cons_equipment_catalog, cons_equipment_materials, cons_library_chapters, cons_mailbox_attachments, cons_mailbox_contacts, cons_mailbox_messages, cons_mailbox_shared_access, cons_material_categories, cons_material_price_history, cons_materials, cons_measurements, cons_notifications, cons_organization_members, cons_organizations, cons_plan_annotations, cons_plan_calibrations, cons_plan_extractions, cons_price_breakdown, cons_project_expenses, cons_project_files, cons_projects, cons_saved_partidas, cons_subcontractor_documents, cons_subcontractors, cons_supplier_materials, cons_suppliers, cons_units, cons_users, cons_work_log_budget_links, cons_work_log_equipment, cons_work_log_labor, cons_work_log_materials, cons_work_logs, cons_workers

**Ferrapp** (2): ferrapp_etiquetas_custom, ferrapp_proyectos

**IA / MCP** (6): mcp_ai_consumption, mcp_ai_pricing, mcp_ai_provider_credits, mcp_ai_quotas, mcp_ai_user_quotas, mcp_users_view


---

## Detalle por tabla

### `cons_ai_consumption`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid |  |  | CHAR(36) |
| 3 | provider | text |  |  | TEXT |
| 4 | model | text |  |  | TEXT |
| 5 | input_tokens | integer | Y | 0 | INT |
| 6 | output_tokens | integer | Y | 0 | INT |
| 7 | estimated_cost | numeric(10,6) | Y | 0 | DECIMAL(10,6) |
| 8 | key_source | text |  | 'unknown'::text | TEXT |
| 9 | operation | text | Y |  | TEXT |
| 10 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 11 | user_id | uuid | Y |  | CHAR(36) |

_Constraints:_
- **PK** `cons_ai_consumption_pkey`: PRIMARY KEY (id)

_Índices:_
- `idx_ai_consumption_date`: btree (created_at)
- `idx_ai_consumption_org`: btree (organization_id)

### `cons_ai_pricing`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | model | text |  |  | TEXT |
| 2 | provider | text |  |  | TEXT |
| 3 | input_price_per_million | numeric(10,4) |  |  | DECIMAL(10,4) |
| 4 | output_price_per_million | numeric(10,4) |  |  | DECIMAL(10,4) |
| 5 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_ai_pricing_pkey`: PRIMARY KEY (model)

### `cons_ai_provider_credits`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | provider | text |  |  | TEXT |
| 2 | credit_type | text |  |  | TEXT |
| 3 | initial_amount | numeric(10,4) |  | 0 | DECIMAL(10,4) |
| 4 | currency | text |  | 'USD'::text | TEXT |
| 5 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_ai_provider_credits_pkey`: PRIMARY KEY (provider)

### `cons_app_settings`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid | Y |  | CHAR(36) |
| 3 | key | text |  |  | TEXT |
| 4 | value | text |  |  | TEXT |
| 5 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_app_settings_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_app_settings_organization_id_key_key`: UNIQUE (organization_id, key)
- **FK** `cons_app_settings_organization_id_fkey`: FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE

### `cons_branch_invitations`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | from_organization_id | uuid |  |  | CHAR(36) |
| 3 | from_user_id | uuid |  |  | CHAR(36) |
| 4 | to_email | text |  |  | TEXT |
| 5 | to_user_id | uuid | Y |  | CHAR(36) |
| 6 | to_organization_id | uuid | Y |  | CHAR(36) |
| 7 | status | text |  | 'pending'::text | TEXT |
| 8 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 9 | responded_at | timestamp with time zone | Y |  | DATETIME(3) |

_Constraints:_
- **PK** `cons_branch_invitations_pkey`: PRIMARY KEY (id)
- **CHECK** `cons_branch_invitations_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'cancelled'::text])))

_Índices:_
- `idx_branch_invitations_status`: btree (status) WHERE (status = 'pending'::text) *(parcial→completo en MariaDB)*
- `idx_branch_invitations_to_email`: btree (to_email)

### `cons_branch_links`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_a_id | uuid |  |  | CHAR(36) |
| 3 | organization_b_id | uuid |  |  | CHAR(36) |
| 4 | invitation_id | uuid |  |  | CHAR(36) |
| 5 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_branch_links_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_branch_links_organization_a_id_organization_b_id_key`: UNIQUE (organization_a_id, organization_b_id)
- **FK** `cons_branch_links_invitation_id_fkey`: FOREIGN KEY (invitation_id) REFERENCES cons_branch_invitations(id)
- **CHECK** `cons_branch_links_check`: CHECK ((organization_a_id < organization_b_id))

_Índices:_
- `idx_branch_links_org_a`: btree (organization_a_id)
- `idx_branch_links_org_b`: btree (organization_b_id)

### `cons_branch_project_visibility`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | project_id | uuid |  |  | CHAR(36) |
| 3 | branch_link_id | uuid |  |  | CHAR(36) |
| 4 | visible | boolean |  | true | TINYINT(1) |
| 5 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_branch_project_visibility_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_branch_project_visibility_project_id_branch_link_id_key`: UNIQUE (project_id, branch_link_id)
- **FK** `cons_branch_project_visibility_branch_link_id_fkey`: FOREIGN KEY (branch_link_id) REFERENCES cons_branch_links(id) ON DELETE CASCADE

### `cons_budget_chapter_templates`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | code | text |  |  | TEXT |
| 3 | name | text |  |  | TEXT |
| 4 | sort_order | integer | Y | 0 | INT |
| 5 | is_default | boolean | Y | true | TINYINT(1) |

_Constraints:_
- **PK** `cons_budget_chapter_templates_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_budget_chapter_templates_code_key`: UNIQUE (code)

### `cons_budget_comparison_exclusions`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | budget_a_id | uuid |  |  | CHAR(36) |
| 3 | budget_b_id | uuid |  |  | CHAR(36) |
| 4 | item_id | uuid |  |  | CHAR(36) |
| 5 | created_at | timestamp with time zone |  | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_budget_comparison_exclusions_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_budget_comparison_exclus_budget_a_id_budget_b_id_item__key`: UNIQUE (budget_a_id, budget_b_id, item_id)
- **FK** `cons_budget_comparison_exclusions_budget_a_id_fkey`: FOREIGN KEY (budget_a_id) REFERENCES cons_budgets(id) ON DELETE CASCADE
- **FK** `cons_budget_comparison_exclusions_budget_b_id_fkey`: FOREIGN KEY (budget_b_id) REFERENCES cons_budgets(id) ON DELETE CASCADE
- **FK** `cons_budget_comparison_exclusions_item_id_fkey`: FOREIGN KEY (item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE
- **CHECK** `cons_bce_budget_distinct`: CHECK ((budget_a_id <> budget_b_id))
- **CHECK** `cons_bce_budget_order`: CHECK ((budget_a_id < budget_b_id))

_Índices:_
- `idx_cons_bce_pair`: btree (budget_a_id, budget_b_id)

### `cons_budget_comparison_group_items`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | group_id | uuid |  |  | CHAR(36) |
| 3 | item_id | uuid |  |  | CHAR(36) |
| 4 | side | char(1) |  |  | CHAR(1) |

_Constraints:_
- **PK** `cons_budget_comparison_group_items_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_budget_comparison_group_items_group_id_item_id_key`: UNIQUE (group_id, item_id)
- **FK** `cons_budget_comparison_group_items_group_id_fkey`: FOREIGN KEY (group_id) REFERENCES cons_budget_comparison_groups(id) ON DELETE CASCADE
- **FK** `cons_budget_comparison_group_items_item_id_fkey`: FOREIGN KEY (item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE
- **CHECK** `cons_budget_comparison_group_items_side_check`: CHECK ((side = ANY (ARRAY['A'::bpchar, 'B'::bpchar])))

_Índices:_
- `idx_cons_bcgi_group`: btree (group_id)
- `idx_cons_bcgi_item`: btree (item_id)

### `cons_budget_comparison_groups`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | budget_a_id | uuid |  |  | CHAR(36) |
| 3 | budget_b_id | uuid |  |  | CHAR(36) |
| 4 | notes | text | Y |  | TEXT |
| 5 | created_by | text | Y |  | TEXT |
| 6 | created_at | timestamp with time zone |  | now() | DATETIME(3) |
| 7 | updated_at | timestamp with time zone |  | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_budget_comparison_groups_pkey`: PRIMARY KEY (id)
- **FK** `cons_budget_comparison_groups_budget_a_id_fkey`: FOREIGN KEY (budget_a_id) REFERENCES cons_budgets(id) ON DELETE CASCADE
- **FK** `cons_budget_comparison_groups_budget_b_id_fkey`: FOREIGN KEY (budget_b_id) REFERENCES cons_budgets(id) ON DELETE CASCADE
- **CHECK** `cons_bcg_budget_distinct`: CHECK ((budget_a_id <> budget_b_id))
- **CHECK** `cons_bcg_budget_order`: CHECK ((budget_a_id < budget_b_id))

_Índices:_
- `idx_cons_bcg_pair`: btree (budget_a_id, budget_b_id)

### `cons_budget_item_templates`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | chapter_code | text |  |  | TEXT |
| 3 | code | text |  |  | TEXT |
| 4 | name | text |  |  | TEXT |
| 5 | description | text | Y |  | TEXT |
| 6 | unit | text |  | 'ud'::text | TEXT |
| 7 | unit_price | numeric(12,2) |  | 0.0 | DECIMAL(12,2) |
| 8 | sort_order | integer | Y | 0 | INT |

_Constraints:_
- **PK** `cons_budget_item_templates_pkey`: PRIMARY KEY (id)

_Índices:_
- `idx_cons_item_templates_chapter`: btree (chapter_code)

### `cons_budget_items`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | chapter_id | uuid |  |  | CHAR(36) |
| 3 | code | text |  |  | TEXT |
| 4 | name | text |  |  | TEXT |
| 5 | description | text | Y |  | TEXT |
| 6 | unit | text |  | 'ud'::text | TEXT |
| 7 | quantity | numeric(12,3) |  | 0.0 | DECIMAL(12,3) |
| 8 | unit_price | numeric(12,2) |  | 0.0 | DECIMAL(12,2) |
| 9 | cost_price | numeric(12,2) |  | 0.0 | DECIMAL(12,2) |
| 10 | sort_order | integer | Y | 0 | INT |
| 11 | notes | text | Y |  | TEXT |
| 12 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 13 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 14 | is_active | boolean |  | true | TINYINT(1) |
| 15 | is_auxiliary | boolean |  | false | TINYINT(1) |
| 16 | price_source | jsonb | Y |  | JSON |

_Constraints:_
- **PK** `cons_budget_items_pkey`: PRIMARY KEY (id)
- **FK** `cons_budget_items_chapter_id_fkey`: FOREIGN KEY (chapter_id) REFERENCES cons_chapters(id) ON DELETE CASCADE

_Índices:_
- `idx_cons_budget_items_chapter`: btree (chapter_id)

### `cons_budgets`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | project_id | uuid |  |  | CHAR(36) |
| 3 | name | text |  |  | TEXT |
| 4 | version | integer | Y | 1 | INT |
| 5 | status | text | Y | 'draft'::text | TEXT |
| 6 | tax_rate | numeric(5,2) | Y | 21.0 | DECIMAL(5,2) |
| 7 | overhead_pct | numeric(5,2) | Y | 13.0 | DECIMAL(5,2) |
| 8 | profit_pct | numeric(5,2) | Y | 6.0 | DECIMAL(5,2) |
| 9 | notes | text | Y |  | TEXT |
| 10 | submitted_at | timestamp with time zone | Y |  | DATETIME(3) |
| 11 | reviewed_by | text | Y |  | TEXT |
| 12 | reviewed_at | timestamp with time zone | Y |  | DATETIME(3) |
| 13 | rejection_reason | text | Y |  | TEXT |
| 14 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 15 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 16 | deleted_at | timestamp with time zone | Y |  | DATETIME(3) |
| 17 | deleted_by | uuid | Y |  | CHAR(36) |

_Constraints:_
- **PK** `cons_budgets_pkey`: PRIMARY KEY (id)
- **FK** `cons_budgets_project_id_fkey`: FOREIGN KEY (project_id) REFERENCES cons_projects(id) ON DELETE CASCADE
- **CHECK** `cons_budgets_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'rejected'::text, 'superseded'::text])))

_Índices:_
- `cons_budgets_deleted_at_idx`: btree (deleted_at) WHERE (deleted_at IS NOT NULL) *(parcial→completo en MariaDB)*
- `idx_cons_budgets_project`: btree (project_id)

### `cons_certification_items`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | certification_id | uuid |  |  | CHAR(36) |
| 3 | budget_item_id | uuid |  |  | CHAR(36) |
| 4 | certified_quantity | numeric(12,3) | Y | 0.0 | DECIMAL(12,3) |
| 5 | certified_pct | numeric(5,2) | Y | 0.0 | DECIMAL(5,2) |
| 6 | certified_amount | numeric(12,2) | Y | 0.0 | DECIMAL(12,2) |
| 7 | previous_quantity | numeric(12,3) | Y | 0.0 | DECIMAL(12,3) |
| 8 | previous_amount | numeric(12,2) | Y | 0.0 | DECIMAL(12,2) |
| 9 | notes | text | Y |  | TEXT |

_Constraints:_
- **PK** `cons_certification_items_pkey`: PRIMARY KEY (id)
- **FK** `cons_certification_items_budget_item_id_fkey`: FOREIGN KEY (budget_item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE
- **FK** `cons_certification_items_certification_id_fkey`: FOREIGN KEY (certification_id) REFERENCES cons_certifications(id) ON DELETE CASCADE

_Índices:_
- `idx_cons_cert_items_cert`: btree (certification_id)
- `idx_fk_cons_cert_items_budget`: btree (budget_item_id)

### `cons_certification_work_log_links`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | certification_id | uuid |  |  | CHAR(36) |
| 3 | certification_item_id | uuid |  |  | CHAR(36) |
| 4 | work_log_id | uuid |  |  | CHAR(36) |
| 5 | work_log_budget_link_id | uuid |  |  | CHAR(36) |
| 6 | budget_item_id | uuid |  |  | CHAR(36) |
| 7 | consumed_quantity | numeric(14,4) |  |  | DECIMAL(14,4) |
| 8 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_certification_work_log_links_pkey`: PRIMARY KEY (id)
- **FK** `cons_certification_work_log_links_budget_item_id_fkey`: FOREIGN KEY (budget_item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE
- **FK** `cons_certification_work_log_links_certification_id_fkey`: FOREIGN KEY (certification_id) REFERENCES cons_certifications(id) ON DELETE CASCADE
- **FK** `cons_certification_work_log_links_certification_item_id_fkey`: FOREIGN KEY (certification_item_id) REFERENCES cons_certification_items(id) ON DELETE CASCADE
- **FK** `cons_certification_work_log_links_work_log_budget_link_id_fkey`: FOREIGN KEY (work_log_budget_link_id) REFERENCES cons_work_log_budget_links(id) ON DELETE CASCADE
- **FK** `cons_certification_work_log_links_work_log_id_fkey`: FOREIGN KEY (work_log_id) REFERENCES cons_work_logs(id) ON DELETE RESTRICT
- **CHECK** `cons_certification_work_log_links_consumed_quantity_check`: CHECK ((consumed_quantity >= (0)::numeric))

_Índices:_
- `idx_cwll_budget_item`: btree (budget_item_id)
- `idx_cwll_certification`: btree (certification_id)
- `idx_cwll_wl_link`: btree (work_log_budget_link_id)
- `idx_cwll_work_log`: btree (work_log_id)
- `uq_cwll_cert_link`: btree (certification_id, work_log_budget_link_id)

### `cons_certifications`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | budget_id | uuid |  |  | CHAR(36) |
| 3 | number | integer |  |  | INT |
| 4 | name | text |  |  | TEXT |
| 5 | period_start | date | Y |  | DATE |
| 6 | period_end | date | Y |  | DATE |
| 7 | status | text | Y | 'draft'::text | TEXT |
| 8 | notes | text | Y |  | TEXT |
| 9 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 10 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 11 | invoice_number | text | Y |  | TEXT |
| 12 | finalized_at | timestamp with time zone | Y |  | DATETIME(3) |

_Constraints:_
- **PK** `cons_certifications_pkey`: PRIMARY KEY (id)
- **FK** `cons_certifications_budget_id_fkey`: FOREIGN KEY (budget_id) REFERENCES cons_budgets(id) ON DELETE CASCADE
- **CHECK** `cons_certifications_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'finalized'::text])))

_Índices:_
- `idx_cons_certifications_budget`: btree (budget_id)

### `cons_chapters`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | budget_id | uuid |  |  | CHAR(36) |
| 3 | parent_id | uuid | Y |  | CHAR(36) |
| 4 | code | text |  |  | TEXT |
| 5 | name | text |  |  | TEXT |
| 6 | description | text | Y |  | TEXT |
| 7 | sort_order | integer | Y | 0 | INT |
| 8 | is_legal_text | boolean | Y | false | TINYINT(1) |
| 9 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 10 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 11 | is_active | boolean |  | true | TINYINT(1) |

_Constraints:_
- **PK** `cons_chapters_pkey`: PRIMARY KEY (id)
- **FK** `cons_chapters_budget_id_fkey`: FOREIGN KEY (budget_id) REFERENCES cons_budgets(id) ON DELETE CASCADE
- **FK** `cons_chapters_parent_id_fkey`: FOREIGN KEY (parent_id) REFERENCES cons_chapters(id)

_Índices:_
- `idx_cons_chapters_budget`: btree (budget_id)
- `idx_fk_cons_chapters_parent`: btree (parent_id)

### `cons_equipment_catalog`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid |  |  | CHAR(36) |
| 3 | name | text |  |  | TEXT |
| 4 | code | text | Y |  | TEXT |
| 5 | type | text |  | 'propia'::text | TEXT |
| 6 | category | text | Y |  | TEXT |
| 7 | hourly_rate | numeric(10,2) |  | 0 | DECIMAL(10,2) |
| 8 | daily_rate | numeric(10,2) | Y | 0 | DECIMAL(10,2) |
| 9 | supplier_id | uuid | Y |  | CHAR(36) |
| 10 | license_plate | text | Y |  | TEXT |
| 11 | serial_number | text | Y |  | TEXT |
| 12 | maintenance_next | date | Y |  | DATE |
| 13 | status | text |  | 'available'::text | TEXT |
| 14 | notes | text | Y |  | TEXT |
| 15 | photo_url | text | Y |  | TEXT |
| 16 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 17 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_equipment_catalog_pkey`: PRIMARY KEY (id)
- **CHECK** `cons_equipment_catalog_status_check`: CHECK ((status = ANY (ARRAY['available'::text, 'in_use'::text, 'maintenance'::text, 'retired'::text])))
- **CHECK** `cons_equipment_catalog_type_check`: CHECK ((type = ANY (ARRAY['propia'::text, 'alquilada'::text])))

_Índices:_
- `idx_equipment_org`: btree (organization_id)
- `idx_equipment_status`: btree (organization_id, status)
- `idx_equipment_type`: btree (organization_id, type)

### `cons_equipment_materials`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | equipment_id | uuid |  |  | CHAR(36) |
| 3 | supplier_material_id | uuid |  |  | CHAR(36) |
| 4 | notes | text | Y |  | TEXT |
| 5 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_equipment_materials_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_equipment_materials_equipment_id_supplier_material_id_key`: UNIQUE (equipment_id, supplier_material_id)
- **FK** `cons_equipment_materials_equipment_id_fkey`: FOREIGN KEY (equipment_id) REFERENCES cons_equipment_catalog(id) ON DELETE CASCADE
- **FK** `cons_equipment_materials_supplier_material_id_fkey`: FOREIGN KEY (supplier_material_id) REFERENCES cons_supplier_materials(id) ON DELETE CASCADE

_Índices:_
- `idx_equipment_materials_equipment`: btree (equipment_id)
- `idx_equipment_materials_sm`: btree (supplier_material_id)

### `cons_library_chapters`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid |  |  | CHAR(36) |
| 3 | code | text |  |  | TEXT |
| 4 | name | text |  |  | TEXT |
| 5 | sort_order | integer | Y | 0 | INT |
| 6 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 7 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_library_chapters_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_library_chapters_organization_id_code_key`: UNIQUE (organization_id, code)

_Índices:_
- `idx_library_chapters_org`: btree (organization_id)

### `cons_mailbox_attachments`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | message_id | uuid |  |  | CHAR(36) |
| 3 | kind | text |  |  | TEXT |
| 4 | ref_id | uuid | Y |  | CHAR(36) |
| 5 | label | text |  |  | TEXT |
| 6 | file_path | text | Y |  | TEXT |
| 7 | file_size | bigint | Y |  | BIGINT |
| 8 | mime_type | text | Y |  | TEXT |
| 9 | created_at | timestamp with time zone |  | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_mailbox_attachments_pkey`: PRIMARY KEY (id)
- **FK** `cons_mailbox_attachments_message_id_fkey`: FOREIGN KEY (message_id) REFERENCES cons_mailbox_messages(id) ON DELETE CASCADE
- **CHECK** `cons_mailbox_attachments_kind_check`: CHECK ((kind = ANY (ARRAY['file'::text, 'budget'::text, 'certification'::text, 'project_file'::text, 'work_log'::text, 'expense'::text])))

_Índices:_
- `idx_mailbox_attachments_message`: btree (message_id)

### `cons_mailbox_contacts`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | owner_user_id | uuid |  |  | CHAR(36) |
| 3 | contact_user_id | uuid |  |  | CHAR(36) |
| 4 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_mailbox_contacts_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_mailbox_contacts_owner_user_id_contact_user_id_key`: UNIQUE (owner_user_id, contact_user_id)

### `cons_mailbox_messages`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | from_user_id | uuid |  |  | CHAR(36) |
| 3 | from_organization_id | uuid |  |  | CHAR(36) |
| 4 | to_user_id | uuid |  |  | CHAR(36) |
| 5 | to_organization_id | uuid |  |  | CHAR(36) |
| 6 | subject | text |  |  | TEXT |
| 7 | body | text | Y |  | TEXT |
| 8 | budget_id | uuid | Y |  | CHAR(36) |
| 9 | project_id | uuid | Y |  | CHAR(36) |
| 10 | read | boolean |  | false | TINYINT(1) |
| 11 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 12 | deleted_at_from | timestamp with time zone | Y |  | DATETIME(3) |
| 13 | deleted_at_to | timestamp with time zone | Y |  | DATETIME(3) |
| 14 | purged_at_from | timestamp with time zone | Y |  | DATETIME(3) |
| 15 | purged_at_to | timestamp with time zone | Y |  | DATETIME(3) |

_Constraints:_
- **PK** `cons_mailbox_messages_pkey`: PRIMARY KEY (id)

_Índices:_
- `idx_mailbox_inbox_active`: btree (to_user_id, created_at DESC) WHERE ((deleted_at_to IS NULL) AND (purged_at_to IS NULL)) *(parcial→completo en MariaDB)*
- `idx_mailbox_sent_active`: btree (from_user_id, created_at DESC) WHERE ((deleted_at_from IS NULL) AND (purged_at_from IS NULL)) *(parcial→completo en MariaDB)*
- `idx_mailbox_to_user`: btree (to_user_id, read)
- `idx_mailbox_trash_from`: btree (from_user_id, deleted_at_from DESC) WHERE ((deleted_at_from IS NOT NULL) AND (purged_at_from IS NULL)) *(parcial→completo en MariaDB)*
- `idx_mailbox_trash_to`: btree (to_user_id, deleted_at_to DESC) WHERE ((deleted_at_to IS NOT NULL) AND (purged_at_to IS NULL)) *(parcial→completo en MariaDB)*

### `cons_mailbox_shared_access`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | message_id | uuid |  |  | CHAR(36) |
| 3 | user_id | uuid |  |  | CHAR(36) |
| 4 | kind | text |  |  | TEXT |
| 5 | ref_id | uuid |  |  | CHAR(36) |
| 6 | project_id | uuid | Y |  | CHAR(36) |
| 7 | created_at | timestamp with time zone |  | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_mailbox_shared_access_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_mailbox_shared_access_user_id_kind_ref_id_message_id_key`: UNIQUE (user_id, kind, ref_id, message_id)
- **FK** `cons_mailbox_shared_access_message_id_fkey`: FOREIGN KEY (message_id) REFERENCES cons_mailbox_messages(id) ON DELETE CASCADE
- **FK** `cons_mailbox_shared_access_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES cons_users(id) ON DELETE CASCADE
- **CHECK** `cons_mailbox_shared_access_kind_check`: CHECK ((kind = ANY (ARRAY['budget'::text, 'certification'::text, 'work_log'::text, 'expense'::text, 'project'::text])))

_Índices:_
- `idx_mailbox_shared_access_lookup`: btree (user_id, kind, ref_id)
- `idx_mailbox_shared_access_message`: btree (message_id)
- `idx_mailbox_shared_access_project`: btree (user_id, project_id)
- `idx_mailbox_shared_access_user`: btree (user_id)

### `cons_material_categories`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid | Y |  | CHAR(36) |
| 3 | parent_id | uuid | Y |  | CHAR(36) |
| 4 | code | text |  |  | TEXT |
| 5 | name_es | text |  |  | TEXT |
| 6 | name_en | text | Y |  | TEXT |
| 7 | description | text | Y |  | TEXT |
| 8 | sort_order | integer | Y | 0 | INT |

_Constraints:_
- **PK** `cons_material_categories_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_material_categories_organization_id_code_key`: UNIQUE (organization_id, code)
- **FK** `cons_material_categories_organization_id_fkey`: FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE
- **FK** `cons_material_categories_parent_id_fkey`: FOREIGN KEY (parent_id) REFERENCES cons_material_categories(id)

_Índices:_
- `idx_fk_cons_mat_cat_parent`: btree (parent_id)

### `cons_material_price_history`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | material_id | uuid |  |  | CHAR(36) |
| 3 | unit_price | numeric(12,2) |  |  | DECIMAL(12,2) |
| 4 | supplier_id | uuid | Y |  | CHAR(36) |
| 5 | effective_date | date |  |  | DATE |
| 6 | source | text | Y |  | TEXT |
| 7 | notes | text | Y |  | TEXT |
| 8 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_material_price_history_pkey`: PRIMARY KEY (id)
- **FK** `cons_material_price_history_material_id_fkey`: FOREIGN KEY (material_id) REFERENCES cons_materials(id) ON DELETE CASCADE
- **FK** `cons_material_price_history_supplier_id_fkey`: FOREIGN KEY (supplier_id) REFERENCES cons_suppliers(id)

_Índices:_
- `idx_fk_cons_mat_price_supplier`: btree (supplier_id)
- `idx_price_history_material`: btree (material_id)

### `cons_materials`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid |  |  | CHAR(36) |
| 3 | category_id | uuid | Y |  | CHAR(36) |
| 4 | code | text |  |  | TEXT |
| 5 | name | text |  |  | TEXT |
| 6 | description | text | Y |  | TEXT |
| 7 | unit | text |  | 'ud'::text | TEXT |
| 8 | unit_price | numeric(12,2) |  | 0.0 | DECIMAL(12,2) |
| 9 | sale_price | numeric(12,2) |  | 0.0 | DECIMAL(12,2) |
| 10 | currency | text | Y | 'EUR'::text | TEXT |
| 11 | supplier_id | uuid | Y |  | CHAR(36) |
| 12 | brand | text | Y |  | TEXT |
| 13 | min_stock | numeric(10,2) | Y | 0 | DECIMAL(10,2) |
| 14 | current_stock | numeric(10,2) | Y | 0 | DECIMAL(10,2) |
| 15 | notes | text | Y |  | TEXT |
| 16 | is_active | boolean | Y | true | TINYINT(1) |
| 17 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 18 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 19 | material_group_id | uuid | Y |  | CHAR(36) |

_Constraints:_
- **PK** `cons_materials_pkey`: PRIMARY KEY (id)
- **FK** `cons_materials_category_id_fkey`: FOREIGN KEY (category_id) REFERENCES cons_material_categories(id)
- **FK** `cons_materials_organization_id_fkey`: FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE
- **FK** `cons_materials_supplier_id_fkey`: FOREIGN KEY (supplier_id) REFERENCES cons_suppliers(id)

_Índices:_
- `idx_cons_materials_category`: btree (category_id)
- `idx_cons_materials_group`: btree (material_group_id) WHERE (material_group_id IS NOT NULL) *(parcial→completo en MariaDB)*
- `idx_cons_materials_org`: btree (organization_id)
- `idx_fk_cons_materials_supplier`: btree (supplier_id)

### `cons_measurements`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | budget_item_id | uuid |  |  | CHAR(36) |
| 3 | description | text | Y |  | TEXT |
| 4 | units | numeric(12,3) | Y | 1.0 | DECIMAL(12,3) |
| 5 | length | numeric(12,3) | Y | 0.0 | DECIMAL(12,3) |
| 6 | width | numeric(12,3) | Y | 0.0 | DECIMAL(12,3) |
| 7 | height | numeric(12,3) | Y | 0.0 | DECIMAL(12,3) |
| 8 | partial | numeric(12,3) | Y | 0.0 | DECIMAL(12,3) |
| 9 | formula | text | Y |  | TEXT |
| 10 | sort_order | integer | Y | 0 | INT |

_Constraints:_
- **PK** `cons_measurements_pkey`: PRIMARY KEY (id)
- **FK** `cons_measurements_budget_item_id_fkey`: FOREIGN KEY (budget_item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE

_Índices:_
- `idx_cons_measurements_item`: btree (budget_item_id)

### `cons_notifications`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | user_id | uuid |  |  | CHAR(36) |
| 3 | type | text |  |  | TEXT |
| 4 | title | text |  |  | TEXT |
| 5 | body | text | Y |  | TEXT |
| 6 | data | jsonb | Y | '{}'::jsonb | JSON |
| 7 | read | boolean |  | false | TINYINT(1) |
| 8 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_notifications_pkey`: PRIMARY KEY (id)

_Índices:_
- `idx_notifications_user_unread`: btree (user_id, read) WHERE (read = false) *(parcial→completo en MariaDB)*

### `cons_organization_members`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid |  |  | CHAR(36) |
| 3 | user_id | uuid |  |  | CHAR(36) |
| 4 | role | text |  | 'viewer'::text | TEXT |
| 5 | joined_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_organization_members_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_organization_members_organization_id_user_id_key`: UNIQUE (organization_id, user_id)
- **FK** `cons_organization_members_organization_id_fkey`: FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE
- **FK** `cons_organization_members_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES cons_users(id) ON DELETE CASCADE
- **CHECK** `cons_organization_members_role_check`: CHECK ((role = ANY (ARRAY['owner'::text, 'editor'::text, 'viewer'::text])))

_Índices:_
- `idx_fk_cons_org_members_user`: btree (user_id)

### `cons_organizations`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | name | text |  |  | TEXT |
| 3 | owner_id | uuid |  |  | CHAR(36) |
| 4 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_organizations_pkey`: PRIMARY KEY (id)
- **FK** `cons_organizations_owner_id_fkey`: FOREIGN KEY (owner_id) REFERENCES cons_users(id) ON DELETE CASCADE

_Índices:_
- `idx_fk_cons_org_owner`: btree (owner_id)

### `cons_plan_annotations`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | file_id | uuid |  |  | CHAR(36) |
| 3 | page_number | integer |  | 1 | INT |
| 4 | annotation_type | text |  |  | TEXT |
| 5 | data | jsonb |  | '{}'::jsonb | JSON |
| 6 | color | text | Y | '#ef4444'::text | TEXT |
| 7 | stroke_width | numeric(4,1) | Y | 2.0 | DECIMAL(4,1) |
| 8 | label | text | Y |  | TEXT |
| 9 | real_value | numeric(12,3) | Y |  | DECIMAL(12,3) |
| 10 | real_unit | text | Y | 'm'::text | TEXT |
| 11 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 12 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_plan_annotations_pkey`: PRIMARY KEY (id)
- **FK** `cons_plan_annotations_file_id_fkey`: FOREIGN KEY (file_id) REFERENCES cons_project_files(id) ON DELETE CASCADE
- **CHECK** `cons_plan_annotations_annotation_type_check`: CHECK ((annotation_type = ANY (ARRAY['distance'::text, 'area'::text, 'dimension'::text, 'text'::text, 'arrow'::text, 'rectangle'::text, 'circle'::text, 'line'::text, 'calibrate'::text])))

_Índices:_
- `idx_cons_annotations_file`: btree (file_id, page_number)

### `cons_plan_calibrations`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | file_id | uuid |  |  | CHAR(36) |
| 3 | page_number | integer |  | 1 | INT |
| 4 | pixels_distance | numeric(12,3) |  |  | DECIMAL(12,3) |
| 5 | real_distance | numeric(12,3) |  |  | DECIMAL(12,3) |
| 6 | unit | text | Y | 'm'::text | TEXT |
| 7 | scale_label | text | Y |  | TEXT |
| 8 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_plan_calibrations_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_plan_calibrations_file_id_page_number_key`: UNIQUE (file_id, page_number)
- **FK** `cons_plan_calibrations_file_id_fkey`: FOREIGN KEY (file_id) REFERENCES cons_project_files(id) ON DELETE CASCADE

### `cons_plan_extractions`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | file_id | uuid |  |  | CHAR(36) |
| 3 | project_id | uuid |  |  | CHAR(36) |
| 4 | organization_id | uuid |  |  | CHAR(36) |
| 5 | discipline | text |  | 'ESTRUCTURA'::text | TEXT |
| 6 | tipo_plano_detectado | text[] | Y | '{}'::text[] | JSON |
| 7 | extraction_data | jsonb |  | '{}'::jsonb | JSON |
| 8 | status | text |  | 'draft'::text | TEXT |
| 9 | notes | text | Y |  | TEXT |
| 10 | created_by | uuid | Y |  | CHAR(36) |
| 11 | created_at | timestamp with time zone |  | now() | DATETIME(3) |
| 12 | updated_at | timestamp with time zone |  | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_plan_extractions_pkey`: PRIMARY KEY (id)
- **FK** `cons_plan_extractions_file_id_fkey`: FOREIGN KEY (file_id) REFERENCES cons_project_files(id) ON DELETE CASCADE
- **FK** `cons_plan_extractions_project_id_fkey`: FOREIGN KEY (project_id) REFERENCES cons_projects(id) ON DELETE CASCADE
- **CHECK** `cons_plan_extractions_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'integrated'::text])))

_Índices:_
- `idx_plan_extractions_file`: btree (file_id)
- `idx_plan_extractions_org`: btree (organization_id)
- `idx_plan_extractions_project`: btree (project_id)

### `cons_price_breakdown`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | budget_item_id | uuid |  |  | CHAR(36) |
| 3 | resource_type | text |  |  | TEXT |
| 4 | material_id | uuid | Y |  | CHAR(36) |
| 5 | description | text |  |  | TEXT |
| 6 | unit | text |  | 'ud'::text | TEXT |
| 7 | quantity | numeric(12,3) |  | 0.0 | DECIMAL(12,3) |
| 8 | unit_cost | numeric(12,2) |  | 0.0 | DECIMAL(12,2) |
| 9 | sort_order | integer | Y | 0 | INT |
| 10 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_price_breakdown_pkey`: PRIMARY KEY (id)
- **FK** `cons_price_breakdown_budget_item_id_fkey`: FOREIGN KEY (budget_item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE
- **FK** `cons_price_breakdown_material_id_fkey`: FOREIGN KEY (material_id) REFERENCES cons_materials(id)
- **CHECK** `cons_price_breakdown_resource_type_check`: CHECK ((resource_type = ANY (ARRAY['labor'::text, 'material'::text, 'equipment'::text, 'subcontract'::text, 'other'::text])))

_Índices:_
- `idx_cons_breakdown_item`: btree (budget_item_id)
- `idx_fk_cons_price_material`: btree (material_id)

### `cons_project_expenses`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | project_id | uuid |  |  | CHAR(36) |
| 3 | date | date |  |  | DATE |
| 4 | supplier_name | text | Y |  | TEXT |
| 5 | concept | text |  |  | TEXT |
| 6 | amount | numeric(12,2) |  | 0.0 | DECIMAL(12,2) |
| 7 | tax_amount | numeric(12,2) | Y | 0.0 | DECIMAL(12,2) |
| 8 | image_path | text | Y |  | TEXT |
| 9 | budget_chapter_id | uuid | Y |  | CHAR(36) |
| 10 | notes | text | Y |  | TEXT |
| 11 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 12 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 13 | supplier_id | uuid | Y |  | CHAR(36) |
| 14 | work_log_id | uuid | Y |  | CHAR(36) |

_Constraints:_
- **PK** `cons_project_expenses_pkey`: PRIMARY KEY (id)
- **FK** `cons_project_expenses_budget_chapter_id_fkey`: FOREIGN KEY (budget_chapter_id) REFERENCES cons_chapters(id)
- **FK** `cons_project_expenses_project_id_fkey`: FOREIGN KEY (project_id) REFERENCES cons_projects(id) ON DELETE CASCADE
- **FK** `cons_project_expenses_supplier_id_fkey`: FOREIGN KEY (supplier_id) REFERENCES cons_suppliers(id) ON DELETE SET NULL
- **FK** `cons_project_expenses_work_log_id_fkey`: FOREIGN KEY (work_log_id) REFERENCES cons_work_logs(id) ON DELETE SET NULL

_Índices:_
- `idx_cons_expenses_project`: btree (project_id)
- `idx_expenses_supplier`: btree (supplier_id)
- `idx_expenses_work_log`: btree (work_log_id)
- `idx_fk_cons_proj_exp_chapter`: btree (budget_chapter_id)

### `cons_project_files`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | project_id | uuid |  |  | CHAR(36) |
| 3 | original_name | text |  |  | TEXT |
| 4 | stored_name | text |  |  | TEXT |
| 5 | storage_path | text |  |  | TEXT |
| 6 | file_type | text |  |  | TEXT |
| 7 | file_size | bigint | Y |  | BIGINT |
| 8 | category | text | Y | 'general'::text | TEXT |
| 9 | description | text | Y |  | TEXT |
| 10 | page_count | integer | Y |  | INT |
| 11 | imported_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 12 | dxf_svg_path | text | Y |  | TEXT |
| 13 | dxf_entities | jsonb | Y |  | JSON |
| 14 | dxf_layers | jsonb | Y |  | JSON |
| 15 | dxf_bounding_box | jsonb | Y |  | JSON |
| 16 | parent_file_id | uuid | Y |  | CHAR(36) |
| 17 | page_order | integer | Y | 0 | INT |

_Constraints:_
- **PK** `cons_project_files_pkey`: PRIMARY KEY (id)
- **FK** `cons_project_files_parent_file_id_fkey`: FOREIGN KEY (parent_file_id) REFERENCES cons_project_files(id) ON DELETE CASCADE
- **FK** `cons_project_files_project_id_fkey`: FOREIGN KEY (project_id) REFERENCES cons_projects(id) ON DELETE CASCADE
- **CHECK** `cons_project_files_category_check`: CHECK ((category = ANY (ARRAY['plan'::text, 'memory'::text, 'measurement'::text, 'budget'::text, 'photo'::text, 'general'::text])))
- **CHECK** `cons_project_files_file_type_check`: CHECK ((file_type = ANY (ARRAY['pdf'::text, 'dwg'::text, 'dxf'::text, 'image'::text, 'document'::text, 'spreadsheet'::text, 'other'::text])))

_Índices:_
- `idx_cons_project_files_project`: btree (project_id)

### `cons_projects`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid |  |  | CHAR(36) |
| 3 | created_by | uuid |  |  | CHAR(36) |
| 4 | name | text |  |  | TEXT |
| 5 | description | text | Y |  | TEXT |
| 6 | location | text | Y |  | TEXT |
| 7 | client_name | text | Y |  | TEXT |
| 8 | client_contact | text | Y |  | TEXT |
| 9 | address | text | Y |  | TEXT |
| 10 | city | text | Y |  | TEXT |
| 11 | province | text | Y |  | TEXT |
| 12 | postal_code | text | Y |  | TEXT |
| 13 | country | text | Y | 'ES'::text | TEXT |
| 14 | start_date | date | Y |  | DATE |
| 15 | end_date | date | Y |  | DATE |
| 16 | status | text | Y | 'active'::text | TEXT |
| 17 | currency | text | Y | 'EUR'::text | TEXT |
| 18 | tax_rate | numeric(5,2) | Y | 21.0 | DECIMAL(5,2) |
| 19 | notes | text | Y |  | TEXT |
| 20 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 21 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 22 | folder_path | text | Y |  | TEXT |
| 23 | deleted_at | timestamp with time zone | Y |  | DATETIME(3) |
| 24 | deleted_by | uuid | Y |  | CHAR(36) |

_Constraints:_
- **PK** `cons_projects_pkey`: PRIMARY KEY (id)
- **FK** `cons_projects_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES cons_users(id)
- **FK** `cons_projects_organization_id_fkey`: FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE
- **CHECK** `cons_projects_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'archived'::text])))

_Índices:_
- `cons_projects_deleted_at_idx`: btree (deleted_at) WHERE (deleted_at IS NOT NULL) *(parcial→completo en MariaDB)*
- `idx_cons_projects_org`: btree (organization_id)
- `idx_fk_cons_projects_created`: btree (created_by)

### `cons_saved_partidas`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid |  |  | CHAR(36) |
| 3 | code | text |  |  | TEXT |
| 4 | name | text |  |  | TEXT |
| 5 | description | text | Y |  | TEXT |
| 6 | unit | text |  | 'ud'::text | TEXT |
| 7 | unit_price | numeric(12,2) |  | 0.0 | DECIMAL(12,2) |
| 8 | cost_price | numeric(12,2) |  | 0.0 | DECIMAL(12,2) |
| 9 | chapter_code | text | Y |  | TEXT |
| 10 | tags | text | Y | ''::text | TEXT |
| 11 | source | text | Y | 'manual'::text | TEXT |
| 12 | usage_count | integer | Y | 0 | INT |
| 13 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 14 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 15 | library_chapter_id | uuid | Y |  | CHAR(36) |
| 16 | sort_order | integer |  | 0 | INT |
| 17 | is_auxiliary | boolean |  | false | TINYINT(1) |

_Constraints:_
- **PK** `cons_saved_partidas_pkey`: PRIMARY KEY (id)
- **FK** `cons_saved_partidas_library_chapter_id_fkey`: FOREIGN KEY (library_chapter_id) REFERENCES cons_library_chapters(id) ON DELETE SET NULL
- **FK** `cons_saved_partidas_organization_id_fkey`: FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE
- **CHECK** `cons_saved_partidas_source_check`: CHECK ((source = ANY (ARRAY['manual'::text, 'from_budget'::text, 'imported'::text])))

_Índices:_
- `idx_cons_saved_partidas_org`: btree (organization_id)
- `idx_saved_partidas_chapter_sort`: btree (library_chapter_id, sort_order)
- `idx_saved_partidas_library_chapter`: btree (library_chapter_id)

### `cons_subcontractor_documents`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | subcontractor_id | uuid |  |  | CHAR(36) |
| 3 | project_id | uuid | Y |  | CHAR(36) |
| 4 | doc_type | text |  |  | TEXT |
| 5 | name | text |  |  | TEXT |
| 6 | file_path | text | Y |  | TEXT |
| 7 | expiry_date | date | Y |  | DATE |
| 8 | status | text |  | 'pending'::text | TEXT |
| 9 | notes | text | Y |  | TEXT |
| 10 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 11 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_subcontractor_documents_pkey`: PRIMARY KEY (id)
- **FK** `cons_subcontractor_documents_subcontractor_id_fkey`: FOREIGN KEY (subcontractor_id) REFERENCES cons_subcontractors(id) ON DELETE CASCADE
- **CHECK** `cons_subcontractor_documents_doc_type_check`: CHECK ((doc_type = ANY (ARRAY['tc1'::text, 'tc2'::text, 'seguro_rc'::text, 'seguro_accidentes'::text, 'plan_seguridad'::text, 'evaluacion_riesgos'::text, 'formacion_prl'::text, 'rea'::text, 'certificado_corriente_ss'::text, 'certificado_corriente_hacienda'::text, 'libro_subcontratacion'::text, 'contrato'::text, 'otro'::text])))
- **CHECK** `cons_subcontractor_documents_status_check`: CHECK ((status = ANY (ARRAY['valid'::text, 'expired'::text, 'pending'::text, 'rejected'::text])))

_Índices:_
- `idx_subcontractor_docs_expiry`: btree (expiry_date) WHERE (expiry_date IS NOT NULL) *(parcial→completo en MariaDB)*
- `idx_subcontractor_docs_project`: btree (project_id) WHERE (project_id IS NOT NULL) *(parcial→completo en MariaDB)*
- `idx_subcontractor_docs_sub`: btree (subcontractor_id)

### `cons_subcontractors`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid |  |  | CHAR(36) |
| 3 | name | text |  |  | TEXT |
| 4 | tax_id | text | Y |  | TEXT |
| 5 | contact_name | text | Y |  | TEXT |
| 6 | phone | text | Y |  | TEXT |
| 7 | email | text | Y |  | TEXT |
| 8 | address | text | Y |  | TEXT |
| 9 | city | text | Y |  | TEXT |
| 10 | province | text | Y |  | TEXT |
| 11 | postal_code | text | Y |  | TEXT |
| 12 | specialty | text | Y |  | TEXT |
| 13 | rating | integer | Y | 0 | INT |
| 14 | is_active | boolean |  | true | TINYINT(1) |
| 15 | notes | text | Y |  | TEXT |
| 16 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 17 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_subcontractors_pkey`: PRIMARY KEY (id)
- **CHECK** `cons_subcontractors_rating_check`: CHECK (((rating >= 0) AND (rating <= 5)))

_Índices:_
- `idx_subcontractors_org`: btree (organization_id)

### `cons_supplier_materials`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | supplier_id | uuid |  |  | CHAR(36) |
| 3 | material_id | uuid |  |  | CHAR(36) |
| 4 | unit_price | numeric(14,4) |  |  | DECIMAL(14,4) |
| 5 | notes | text | Y |  | TEXT |
| 6 | last_updated | date | Y | CURRENT_DATE | DATE |
| 7 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 8 | supplier_description | text | Y |  | TEXT |

_Constraints:_
- **PK** `cons_supplier_materials_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_supplier_materials_supplier_id_material_id_key`: UNIQUE (supplier_id, material_id)
- **FK** `cons_supplier_materials_material_id_fkey`: FOREIGN KEY (material_id) REFERENCES cons_materials(id) ON DELETE CASCADE
- **FK** `cons_supplier_materials_supplier_id_fkey`: FOREIGN KEY (supplier_id) REFERENCES cons_suppliers(id) ON DELETE CASCADE

_Índices:_
- `idx_supplier_materials_material`: btree (material_id)
- `idx_supplier_materials_supplier`: btree (supplier_id)

### `cons_suppliers`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid |  |  | CHAR(36) |
| 3 | name | text |  |  | TEXT |
| 4 | tax_id | text | Y |  | TEXT |
| 5 | contact_name | text | Y |  | TEXT |
| 6 | phone | text | Y |  | TEXT |
| 7 | email | text | Y |  | TEXT |
| 8 | address | text | Y |  | TEXT |
| 9 | city | text | Y |  | TEXT |
| 10 | province | text | Y |  | TEXT |
| 11 | postal_code | text | Y |  | TEXT |
| 12 | website | text | Y |  | TEXT |
| 13 | category | text | Y |  | TEXT |
| 14 | notes | text | Y |  | TEXT |
| 15 | rating | integer | Y |  | INT |
| 16 | is_active | boolean | Y | true | TINYINT(1) |
| 17 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 18 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_suppliers_pkey`: PRIMARY KEY (id)
- **FK** `cons_suppliers_organization_id_fkey`: FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE
- **CHECK** `cons_suppliers_rating_check`: CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5))))

_Índices:_
- `idx_fk_cons_suppliers_org`: btree (organization_id)

### `cons_units`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid |  |  | CHAR(36) |
| 3 | value | text |  |  | TEXT |
| 4 | label | text | Y |  | TEXT |
| 5 | sort_order | integer | Y | 0 | INT |
| 6 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_units_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_units_organization_id_value_key`: UNIQUE (organization_id, value)
- **FK** `cons_units_organization_id_fkey`: FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE

### `cons_users`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | email | text |  |  | TEXT |
| 3 | password_hash | text |  |  | TEXT |
| 4 | full_name | text |  |  | TEXT |
| 5 | avatar_url | text | Y |  | TEXT |
| 6 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 7 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 8 | reset_token | text | Y |  | TEXT |
| 9 | reset_token_expires | timestamp with time zone | Y |  | DATETIME(3) |
| 10 | is_active | boolean |  | true | TINYINT(1) |
| 11 | ai_enabled | boolean |  | true | TINYINT(1) |
| 12 | app | text | Y | 'construgest'::text | TEXT |

_Constraints:_
- **PK** `cons_users_pkey`: PRIMARY KEY (id)
- **UNIQUE** `cons_users_email_key`: UNIQUE (email)

### `cons_work_log_budget_links`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | work_log_id | uuid |  |  | CHAR(36) |
| 3 | budget_item_id | uuid |  |  | CHAR(36) |
| 4 | executed_quantity | numeric(12,3) |  | 0 | DECIMAL(12,3) |
| 5 | notes | text | Y |  | TEXT |

_Constraints:_
- **PK** `cons_work_log_budget_links_pkey`: PRIMARY KEY (id)
- **FK** `cons_work_log_budget_links_budget_item_id_fkey`: FOREIGN KEY (budget_item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE
- **FK** `cons_work_log_budget_links_work_log_id_fkey`: FOREIGN KEY (work_log_id) REFERENCES cons_work_logs(id) ON DELETE CASCADE

_Índices:_
- `idx_work_log_budget_links_item`: btree (budget_item_id)
- `idx_work_log_budget_links_log`: btree (work_log_id)

### `cons_work_log_equipment`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | work_log_id | uuid |  |  | CHAR(36) |
| 3 | equipment_name | varchar(500) |  |  | VARCHAR(500) |
| 4 | hours | numeric(5,2) |  |  | DECIMAL(5,2) |
| 5 | hourly_rate | numeric(10,2) |  |  | DECIMAL(10,2) |
| 6 | sort_order | integer | Y | 0 | INT |
| 7 | date | date | Y |  | DATE |
| 8 | equipment_id | uuid | Y |  | CHAR(36) |
| 9 | description | text | Y |  | TEXT |

_Constraints:_
- **PK** `cons_work_log_equipment_pkey`: PRIMARY KEY (id)
- **FK** `cons_work_log_equipment_work_log_id_fkey`: FOREIGN KEY (work_log_id) REFERENCES cons_work_logs(id) ON DELETE CASCADE

_Índices:_
- `idx_wl_equipment_catalog`: btree (equipment_id) WHERE (equipment_id IS NOT NULL) *(parcial→completo en MariaDB)*
- `idx_wl_equipment_date`: btree (date) WHERE (date IS NOT NULL) *(parcial→completo en MariaDB)*
- `idx_work_log_equipment_log`: btree (work_log_id)

### `cons_work_log_labor`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | work_log_id | uuid |  |  | CHAR(36) |
| 3 | role | varchar(255) |  |  | VARCHAR(255) |
| 4 | worker_count | integer |  | 1 | INT |
| 5 | hours | numeric(5,2) |  |  | DECIMAL(5,2) |
| 6 | hourly_rate | numeric(10,2) |  |  | DECIMAL(10,2) |
| 7 | sort_order | integer | Y | 0 | INT |
| 8 | date | date | Y |  | DATE |
| 9 | worker_id | uuid | Y |  | CHAR(36) |
| 10 | description | text | Y |  | TEXT |

_Constraints:_
- **PK** `cons_work_log_labor_pkey`: PRIMARY KEY (id)
- **FK** `cons_work_log_labor_work_log_id_fkey`: FOREIGN KEY (work_log_id) REFERENCES cons_work_logs(id) ON DELETE CASCADE

_Índices:_
- `idx_wl_labor_date`: btree (date) WHERE (date IS NOT NULL) *(parcial→completo en MariaDB)*
- `idx_wl_labor_worker`: btree (worker_id) WHERE (worker_id IS NOT NULL) *(parcial→completo en MariaDB)*
- `idx_work_log_labor_log`: btree (work_log_id)

### `cons_work_log_materials`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | work_log_id | uuid |  |  | CHAR(36) |
| 3 | material_name | varchar(500) |  |  | VARCHAR(500) |
| 4 | quantity | numeric(12,3) |  |  | DECIMAL(12,3) |
| 5 | unit | varchar(20) |  | 'ud'::character varying | VARCHAR(20) |
| 6 | unit_price | numeric(10,2) |  |  | DECIMAL(10,2) |
| 7 | sort_order | integer | Y | 0 | INT |
| 8 | date | date | Y |  | DATE |
| 9 | description | text | Y |  | TEXT |

_Constraints:_
- **PK** `cons_work_log_materials_pkey`: PRIMARY KEY (id)
- **FK** `cons_work_log_materials_work_log_id_fkey`: FOREIGN KEY (work_log_id) REFERENCES cons_work_logs(id) ON DELETE CASCADE

_Índices:_
- `idx_wl_materials_date`: btree (date) WHERE (date IS NOT NULL) *(parcial→completo en MariaDB)*
- `idx_work_log_materials_log`: btree (work_log_id)

### `cons_work_logs`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | project_id | uuid |  |  | CHAR(36) |
| 3 | date | date |  |  | DATE |
| 4 | description | text | Y |  | TEXT |
| 5 | weather | varchar(50) | Y |  | VARCHAR(50) |
| 6 | notes | text | Y |  | TEXT |
| 7 | status | varchar(20) | Y | 'draft'::character varying | VARCHAR(20) |
| 8 | created_by | text |  |  | TEXT |
| 9 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 10 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_work_logs_pkey`: PRIMARY KEY (id)
- **FK** `cons_work_logs_project_id_fkey`: FOREIGN KEY (project_id) REFERENCES cons_projects(id) ON DELETE CASCADE
- **CHECK** `cons_work_logs_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying, 'approved'::character varying])::text[])))

_Índices:_
- `idx_work_logs_date`: btree (date)
- `idx_work_logs_project`: btree (project_id)

### `cons_workers`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | organization_id | uuid |  |  | CHAR(36) |
| 3 | name | text |  |  | TEXT |
| 4 | dni | text | Y |  | TEXT |
| 5 | role | text |  | 'Peón'::text | TEXT |
| 6 | specialty | text | Y |  | TEXT |
| 7 | hourly_rate | numeric(10,2) |  | 0 | DECIMAL(10,2) |
| 8 | phone | text | Y |  | TEXT |
| 9 | email | text | Y |  | TEXT |
| 10 | emergency_contact | text | Y |  | TEXT |
| 11 | is_subcontracted | boolean |  | false | TINYINT(1) |
| 12 | subcontractor_id | uuid | Y |  | CHAR(36) |
| 13 | certifications | jsonb | Y | '[]'::jsonb | JSON |
| 14 | status | text |  | 'active'::text | TEXT |
| 15 | photo_url | text | Y |  | TEXT |
| 16 | hire_date | date | Y |  | DATE |
| 17 | end_date | date | Y |  | DATE |
| 18 | notes | text | Y |  | TEXT |
| 19 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 20 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `cons_workers_pkey`: PRIMARY KEY (id)
- **CHECK** `cons_workers_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'on_leave'::text])))

_Índices:_
- `idx_workers_org`: btree (organization_id)
- `idx_workers_role`: btree (organization_id, role)
- `idx_workers_status`: btree (organization_id, status)
- `idx_workers_subcontractor`: btree (subcontractor_id) WHERE (subcontractor_id IS NOT NULL) *(parcial→completo en MariaDB)*

### `ferrapp_etiquetas_custom`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | integer |  | nextval('ferrapp_etiquetas_custom_id_... | INT |
| 2 | categoria | text |  |  | TEXT |
| 3 | etiqueta | text |  |  | TEXT |
| 4 | created_at | timestamp with time zone |  | now() | DATETIME(3) |
| 5 | organization_id | uuid | Y |  | CHAR(36) |

_Constraints:_
- **PK** `ferrapp_etiquetas_custom_pkey`: PRIMARY KEY (id)
- **UNIQUE** `ferrapp_etiquetas_custom_categoria_etiqueta_key`: UNIQUE (categoria, etiqueta)
- **UNIQUE** `ferrapp_etiquetas_unique_org`: UNIQUE (organization_id, categoria, etiqueta)
- **FK** `ferrapp_etiquetas_custom_organization_id_fkey`: FOREIGN KEY (organization_id) REFERENCES cons_organizations(id)

_Índices:_
- `idx_ferrapp_etiquetas_cat`: btree (categoria)
- `idx_ferrapp_etiquetas_org`: btree (organization_id)

### `ferrapp_proyectos`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | text |  |  | TEXT |
| 2 | nombre | text |  |  | TEXT |
| 3 | data | jsonb |  |  | JSON |
| 4 | fecha_modificacion | timestamp with time zone |  | now() | DATETIME(3) |
| 5 | deleted | boolean |  | false | TINYINT(1) |
| 6 | device_id | text | Y |  | TEXT |
| 7 | created_at | timestamp with time zone |  | now() | DATETIME(3) |
| 8 | organization_id | uuid | Y |  | CHAR(36) |
| 9 | created_by | uuid | Y |  | CHAR(36) |

_Constraints:_
- **PK** `ferrapp_proyectos_pkey`: PRIMARY KEY (id)
- **FK** `ferrapp_proyectos_organization_id_fkey`: FOREIGN KEY (organization_id) REFERENCES cons_organizations(id)

_Índices:_
- `idx_ferrapp_proyectos_active`: btree (deleted) WHERE (deleted = false) *(parcial→completo en MariaDB)*
- `idx_ferrapp_proyectos_fecha`: btree (fecha_modificacion)
- `idx_ferrapp_proyectos_org`: btree (organization_id) WHERE (deleted = false) *(parcial→completo en MariaDB)*

### `mcp_ai_consumption`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | app_id | text |  |  | TEXT |
| 3 | org_id | text |  |  | TEXT |
| 4 | user_id | uuid | Y |  | CHAR(36) |
| 5 | provider | text |  |  | TEXT |
| 6 | model | text |  |  | TEXT |
| 7 | input_tokens | integer | Y | 0 | INT |
| 8 | output_tokens | integer | Y | 0 | INT |
| 9 | estimated_cost | numeric(12,8) | Y | 0 | DECIMAL(12,8) |
| 10 | key_source | text | Y | 'env'::text | TEXT |
| 11 | operation | text | Y | 'chat'::text | TEXT |
| 12 | tool_calls | integer | Y | 0 | INT |
| 13 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `mcp_ai_consumption_pkey`: PRIMARY KEY (id)

_Índices:_
- `idx_mcp_consumption_app_org`: btree (app_id, org_id)
- `idx_mcp_consumption_app_org_month`: btree (app_id, org_id, created_at)
- `idx_mcp_consumption_created`: btree (created_at DESC)
- `idx_mcp_consumption_user`: btree (user_id)

### `mcp_ai_pricing`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | model | text |  |  | TEXT |
| 2 | provider | text |  |  | TEXT |
| 3 | input_price_per_million | numeric(10,6) |  |  | DECIMAL(10,6) |
| 4 | output_price_per_million | numeric(10,6) |  |  | DECIMAL(10,6) |
| 5 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `mcp_ai_pricing_pkey`: PRIMARY KEY (model)

### `mcp_ai_provider_credits`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | provider | text |  |  | TEXT |
| 2 | initial_amount | numeric(10,4) |  | 0 | DECIMAL(10,4) |
| 3 | credit_type | text |  | 'credit'::text | TEXT |
| 4 | notes | text | Y |  | TEXT |
| 5 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `mcp_ai_provider_credits_pkey`: PRIMARY KEY (provider)

### `mcp_ai_quotas`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | app_id | text |  |  | TEXT |
| 3 | org_id | text |  |  | TEXT |
| 4 | quota_type | text |  | 'monthly'::text | TEXT |
| 5 | max_calls | integer | Y |  | INT |
| 6 | max_cost_usd | numeric(10,4) | Y |  | DECIMAL(10,4) |
| 7 | max_tokens | bigint | Y |  | BIGINT |
| 8 | credits_extra | integer | Y | 0 | INT |
| 9 | bypass_user_ids | uuid[] | Y | '{}'::uuid[] | JSON |
| 10 | enabled | boolean | Y | true | TINYINT(1) |
| 11 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 12 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `mcp_ai_quotas_pkey`: PRIMARY KEY (id)
- **UNIQUE** `mcp_ai_quotas_app_id_org_id_quota_type_key`: UNIQUE (app_id, org_id, quota_type)

### `mcp_ai_user_quotas`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | id | uuid |  | gen_random_uuid() | CHAR(36) |
| 2 | app_id | text |  |  | TEXT |
| 3 | user_id | uuid |  |  | CHAR(36) |
| 4 | quota_type | text |  | 'daily'::text | TEXT |
| 5 | max_calls | integer | Y |  | INT |
| 6 | max_tokens | bigint | Y |  | BIGINT |
| 7 | max_cost_usd | numeric(10,4) | Y |  | DECIMAL(10,4) |
| 8 | enabled | boolean | Y | true | TINYINT(1) |
| 9 | created_at | timestamp with time zone | Y | now() | DATETIME(3) |
| 10 | updated_at | timestamp with time zone | Y | now() | DATETIME(3) |

_Constraints:_
- **PK** `mcp_ai_user_quotas_pkey`: PRIMARY KEY (id)
- **UNIQUE** `mcp_ai_user_quotas_app_id_user_id_quota_type_key`: UNIQUE (app_id, user_id, quota_type)

_Índices:_
- `idx_mcp_user_quotas_user`: btree (user_id)

### `mcp_users_view`

| # | Columna | Tipo PG | Null | Default | → MariaDB |
|---|---|---|---|---|---|
| 1 | user_id | uuid | Y |  | CHAR(36) |
| 2 | email | text | Y |  | TEXT |
| 3 | full_name | text | Y |  | TEXT |
| 4 | avatar_url | text | Y |  | TEXT |
| 5 | role | text | Y |  | TEXT |
| 6 | app | text | Y |  | TEXT |
| 7 | ai_enabled | boolean | Y |  | TINYINT(1) |
| 8 | created_at | timestamp with time zone | Y |  | DATETIME(3) |
| 9 | org_id | text | Y |  | TEXT |
| 10 | org_name | text | Y |  | TEXT |
| 11 | source_app | text | Y |  | TEXT |
