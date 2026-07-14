-- ============================================================================
-- Esquema MariaDB de Construgest — GENERADO desde docs/schema/ (Fase 1, DB-2).
-- uuid->CHAR(36), jsonb/arrays->JSON, timestamptz->DATETIME(3,UTC), numeric->DECIMAL,
-- boolean->TINYINT(1). text->VARCHAR(255) si va en clave/indice o tiene default; si no TEXT.
-- Indices parciales (WHERE) -> normales. Re-ejecutable (DROP+CREATE con FK checks off).
-- ============================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS
  `cons_ai_consumption`,
  `cons_ai_corrections`,
  `cons_ai_pricing`,
  `cons_ai_provider_credits`,
  `cons_app_settings`,
  `cons_branch_invitations`,
  `cons_branch_links`,
  `cons_branch_project_visibility`,
  `cons_budget_chapter_templates`,
  `cons_budget_comparison_exclusions`,
  `cons_budget_comparison_group_items`,
  `cons_budget_comparison_groups`,
  `cons_budget_item_templates`,
  `cons_budget_items`,
  `cons_budgets`,
  `cons_certification_items`,
  `cons_certification_work_log_links`,
  `cons_certifications`,
  `cons_chapters`,
  `cons_equipment_catalog`,
  `cons_equipment_materials`,
  `cons_library_chapters`,
  `cons_mailbox_attachments`,
  `cons_mailbox_contacts`,
  `cons_mailbox_messages`,
  `cons_mailbox_shared_access`,
  `cons_material_categories`,
  `cons_material_price_history`,
  `cons_materials`,
  `cons_measurements`,
  `cons_notifications`,
  `cons_organization_members`,
  `cons_organizations`,
  `cons_plan_annotations`,
  `cons_plan_calibrations`,
  `cons_plan_extractions`,
  `cons_price_breakdown`,
  `cons_project_expenses`,
  `cons_project_files`,
  `cons_projects`,
  `cons_saved_partidas`,
  `cons_subcontractor_documents`,
  `cons_subcontractors`,
  `cons_supplier_materials`,
  `cons_suppliers`,
  `cons_units`,
  `cons_users`,
  `cons_work_log_budget_links`,
  `cons_work_log_equipment`,
  `cons_work_log_labor`,
  `cons_work_log_materials`,
  `cons_work_logs`,
  `cons_workers`,
  `mcp_ai_consumption`,
  `mcp_ai_pricing`,
  `mcp_ai_provider_credits`,
  `mcp_ai_quotas`,
  `mcp_ai_user_quotas`;

CREATE TABLE `cons_ai_consumption` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `provider` TEXT NOT NULL,
  `model` TEXT NOT NULL,
  `input_tokens` INT DEFAULT 0,
  `output_tokens` INT DEFAULT 0,
  `estimated_cost` DECIMAL(10,6) DEFAULT 0,
  `key_source` VARCHAR(255) NOT NULL DEFAULT 'unknown',
  `operation` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `user_id` CHAR(36),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Autoaprendizaje (AI-4): correcciones del usuario a la salida de la IA, que se
-- inyectan como few-shot en futuras extracciones (100% local, por organización).
CREATE TABLE `cons_ai_corrections` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `skill` VARCHAR(64) NOT NULL,
  `context` TEXT,
  `wrong` JSON,
  `corrected` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_ai_corrections_organization_id_fkey` FOREIGN KEY (organization_id) REFERENCES cons_organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_ai_pricing` (
  `model` VARCHAR(255) NOT NULL,
  `provider` TEXT NOT NULL,
  `input_price_per_million` DECIMAL(10,4) NOT NULL,
  `output_price_per_million` DECIMAL(10,4) NOT NULL,
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`model`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_ai_provider_credits` (
  `provider` VARCHAR(255) NOT NULL,
  `credit_type` TEXT NOT NULL,
  `initial_amount` DECIMAL(10,4) NOT NULL DEFAULT 0,
  `currency` VARCHAR(255) NOT NULL DEFAULT 'USD',
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_app_settings` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36),
  `key` VARCHAR(255) NOT NULL,
  `value` TEXT NOT NULL,
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_app_settings_organization_id_key_key` (`organization_id`, `key`),
  CONSTRAINT `cons_app_settings_organization_id_fkey` FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_branch_invitations` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `from_organization_id` CHAR(36) NOT NULL,
  `from_user_id` CHAR(36) NOT NULL,
  `to_email` VARCHAR(255) NOT NULL,
  `to_user_id` CHAR(36),
  `to_organization_id` CHAR(36),
  `status` VARCHAR(255) NOT NULL DEFAULT 'pending',
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `responded_at` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_branch_invitations_status_check` CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_branch_links` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_a_id` CHAR(36) NOT NULL,
  `organization_b_id` CHAR(36) NOT NULL,
  `invitation_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_branch_links_organization_a_id_organization_b_id_key` (`organization_a_id`, `organization_b_id`),
  CONSTRAINT `cons_branch_links_check` CHECK ((organization_a_id < organization_b_id)),
  CONSTRAINT `cons_branch_links_invitation_id_fkey` FOREIGN KEY (invitation_id) REFERENCES cons_branch_invitations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_branch_project_visibility` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `project_id` CHAR(36) NOT NULL,
  `branch_link_id` CHAR(36) NOT NULL,
  `visible` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_branch_project_visibility_project_id_branch_link_id_key` (`project_id`, `branch_link_id`),
  CONSTRAINT `cons_branch_project_visibility_branch_link_id_fkey` FOREIGN KEY (branch_link_id) REFERENCES cons_branch_links(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_budget_chapter_templates` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `sort_order` INT DEFAULT 0,
  `is_default` TINYINT(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_budget_chapter_templates_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_budget_comparison_exclusions` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `budget_a_id` CHAR(36) NOT NULL,
  `budget_b_id` CHAR(36) NOT NULL,
  `item_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_budget_comparison_exclus_budget_a_id_budget_b_id_item__` (`budget_a_id`, `budget_b_id`, `item_id`),
  CONSTRAINT `cons_bce_budget_distinct` CHECK ((budget_a_id <> budget_b_id)),
  CONSTRAINT `cons_bce_budget_order` CHECK ((budget_a_id < budget_b_id)),
  CONSTRAINT `cons_budget_comparison_exclusions_budget_a_id_fkey` FOREIGN KEY (budget_a_id) REFERENCES cons_budgets(id) ON DELETE CASCADE,
  CONSTRAINT `cons_budget_comparison_exclusions_budget_b_id_fkey` FOREIGN KEY (budget_b_id) REFERENCES cons_budgets(id) ON DELETE CASCADE,
  CONSTRAINT `cons_budget_comparison_exclusions_item_id_fkey` FOREIGN KEY (item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_budget_comparison_group_items` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `group_id` CHAR(36) NOT NULL,
  `item_id` CHAR(36) NOT NULL,
  `side` CHAR(1) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_budget_comparison_group_items_group_id_item_id_key` (`group_id`, `item_id`),
  CONSTRAINT `cons_budget_comparison_group_items_side_check` CHECK (side IN ('A', 'B')),
  CONSTRAINT `cons_budget_comparison_group_items_group_id_fkey` FOREIGN KEY (group_id) REFERENCES cons_budget_comparison_groups(id) ON DELETE CASCADE,
  CONSTRAINT `cons_budget_comparison_group_items_item_id_fkey` FOREIGN KEY (item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_budget_comparison_groups` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `budget_a_id` CHAR(36) NOT NULL,
  `budget_b_id` CHAR(36) NOT NULL,
  `notes` TEXT,
  `created_by` TEXT,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_bcg_budget_distinct` CHECK ((budget_a_id <> budget_b_id)),
  CONSTRAINT `cons_bcg_budget_order` CHECK ((budget_a_id < budget_b_id)),
  CONSTRAINT `cons_budget_comparison_groups_budget_a_id_fkey` FOREIGN KEY (budget_a_id) REFERENCES cons_budgets(id) ON DELETE CASCADE,
  CONSTRAINT `cons_budget_comparison_groups_budget_b_id_fkey` FOREIGN KEY (budget_b_id) REFERENCES cons_budgets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_budget_item_templates` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `chapter_code` VARCHAR(255) NOT NULL,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `unit` VARCHAR(255) NOT NULL DEFAULT 'ud',
  `unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  `sort_order` INT DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_budget_items` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `chapter_id` CHAR(36) NOT NULL,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `unit` VARCHAR(255) NOT NULL DEFAULT 'ud',
  `quantity` DECIMAL(12,3) NOT NULL DEFAULT 0.0,
  `unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  `cost_price` DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  `sort_order` INT DEFAULT 0,
  `notes` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `is_auxiliary` TINYINT(1) NOT NULL DEFAULT 0,
  `price_source` JSON,
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_budget_items_chapter_id_fkey` FOREIGN KEY (chapter_id) REFERENCES cons_chapters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_budgets` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `project_id` CHAR(36) NOT NULL,
  `name` TEXT NOT NULL,
  `version` INT DEFAULT 1,
  `status` VARCHAR(255) DEFAULT 'draft',
  `tax_rate` DECIMAL(5,2) DEFAULT 21.0,
  `overhead_pct` DECIMAL(5,2) DEFAULT 13.0,
  `profit_pct` DECIMAL(5,2) DEFAULT 6.0,
  `notes` TEXT,
  `submitted_at` DATETIME(3),
  `reviewed_by` TEXT,
  `reviewed_at` DATETIME(3),
  `rejection_reason` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3),
  `deleted_by` CHAR(36),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_budgets_status_check` CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'superseded')),
  CONSTRAINT `cons_budgets_project_id_fkey` FOREIGN KEY (project_id) REFERENCES cons_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_certification_items` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `certification_id` CHAR(36) NOT NULL,
  `budget_item_id` CHAR(36) NOT NULL,
  `certified_quantity` DECIMAL(12,3) DEFAULT 0.0,
  `certified_pct` DECIMAL(5,2) DEFAULT 0.0,
  `certified_amount` DECIMAL(12,2) DEFAULT 0.0,
  `previous_quantity` DECIMAL(12,3) DEFAULT 0.0,
  `previous_amount` DECIMAL(12,2) DEFAULT 0.0,
  `notes` TEXT,
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_certification_items_budget_item_id_fkey` FOREIGN KEY (budget_item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE,
  CONSTRAINT `cons_certification_items_certification_id_fkey` FOREIGN KEY (certification_id) REFERENCES cons_certifications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_certification_work_log_links` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `certification_id` CHAR(36) NOT NULL,
  `certification_item_id` CHAR(36) NOT NULL,
  `work_log_id` CHAR(36) NOT NULL,
  `work_log_budget_link_id` CHAR(36) NOT NULL,
  `budget_item_id` CHAR(36) NOT NULL,
  `consumed_quantity` DECIMAL(14,4) NOT NULL,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_certification_work_log_links_consumed_quantity_check` CHECK ((consumed_quantity >= (0))),
  CONSTRAINT `cons_certification_work_log_links_budget_item_id_fkey` FOREIGN KEY (budget_item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE,
  CONSTRAINT `cons_certification_work_log_links_certification_id_fkey` FOREIGN KEY (certification_id) REFERENCES cons_certifications(id) ON DELETE CASCADE,
  CONSTRAINT `cons_certification_work_log_links_certification_item_id_fkey` FOREIGN KEY (certification_item_id) REFERENCES cons_certification_items(id) ON DELETE CASCADE,
  CONSTRAINT `cons_certification_work_log_links_work_log_budget_link_id_fk` FOREIGN KEY (work_log_budget_link_id) REFERENCES cons_work_log_budget_links(id) ON DELETE CASCADE,
  CONSTRAINT `cons_certification_work_log_links_work_log_id_fkey` FOREIGN KEY (work_log_id) REFERENCES cons_work_logs(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_certifications` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `budget_id` CHAR(36) NOT NULL,
  `number` INT NOT NULL,
  `name` TEXT NOT NULL,
  `period_start` DATE,
  `period_end` DATE,
  `status` VARCHAR(255) DEFAULT 'draft',
  `notes` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `invoice_number` TEXT,
  `finalized_at` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_certifications_status_check` CHECK (status IN ('draft', 'submitted', 'approved', 'finalized')),
  CONSTRAINT `cons_certifications_budget_id_fkey` FOREIGN KEY (budget_id) REFERENCES cons_budgets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_chapters` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `budget_id` CHAR(36) NOT NULL,
  `parent_id` CHAR(36),
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `sort_order` INT DEFAULT 0,
  `is_legal_text` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_chapters_budget_id_fkey` FOREIGN KEY (budget_id) REFERENCES cons_budgets(id) ON DELETE CASCADE,
  CONSTRAINT `cons_chapters_parent_id_fkey` FOREIGN KEY (parent_id) REFERENCES cons_chapters(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_equipment_catalog` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `name` TEXT NOT NULL,
  `code` TEXT,
  `type` VARCHAR(255) NOT NULL DEFAULT 'propia',
  `category` TEXT,
  `hourly_rate` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `daily_rate` DECIMAL(10,2) DEFAULT 0,
  `supplier_id` CHAR(36),
  `license_plate` TEXT,
  `serial_number` TEXT,
  `maintenance_next` DATE,
  `status` VARCHAR(255) NOT NULL DEFAULT 'available',
  `notes` TEXT,
  `photo_url` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_equipment_catalog_status_check` CHECK (status IN ('available', 'in_use', 'maintenance', 'retired')),
  CONSTRAINT `cons_equipment_catalog_type_check` CHECK (type IN ('propia', 'alquilada'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_equipment_materials` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `equipment_id` CHAR(36) NOT NULL,
  `supplier_material_id` CHAR(36) NOT NULL,
  `notes` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_equipment_materials_equipment_id_supplier_material_id_k` (`equipment_id`, `supplier_material_id`),
  CONSTRAINT `cons_equipment_materials_equipment_id_fkey` FOREIGN KEY (equipment_id) REFERENCES cons_equipment_catalog(id) ON DELETE CASCADE,
  CONSTRAINT `cons_equipment_materials_supplier_material_id_fkey` FOREIGN KEY (supplier_material_id) REFERENCES cons_supplier_materials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_library_chapters` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `sort_order` INT DEFAULT 0,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_library_chapters_organization_id_code_key` (`organization_id`, `code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_mailbox_attachments` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `message_id` CHAR(36) NOT NULL,
  `kind` TEXT NOT NULL,
  `ref_id` CHAR(36),
  `label` TEXT NOT NULL,
  `file_path` TEXT,
  `file_size` BIGINT,
  `mime_type` TEXT,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_mailbox_attachments_kind_check` CHECK (kind IN ('file', 'budget', 'certification', 'project_file', 'work_log', 'expense')),
  CONSTRAINT `cons_mailbox_attachments_message_id_fkey` FOREIGN KEY (message_id) REFERENCES cons_mailbox_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_mailbox_contacts` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `owner_user_id` CHAR(36) NOT NULL,
  `contact_user_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_mailbox_contacts_owner_user_id_contact_user_id_key` (`owner_user_id`, `contact_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_mailbox_messages` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `from_user_id` CHAR(36) NOT NULL,
  `from_organization_id` CHAR(36) NOT NULL,
  `to_user_id` CHAR(36) NOT NULL,
  `to_organization_id` CHAR(36) NOT NULL,
  `subject` TEXT NOT NULL,
  `body` TEXT,
  `budget_id` CHAR(36),
  `project_id` CHAR(36),
  `read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at_from` DATETIME(3),
  `deleted_at_to` DATETIME(3),
  `purged_at_from` DATETIME(3),
  `purged_at_to` DATETIME(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_mailbox_shared_access` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `message_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `kind` VARCHAR(255) NOT NULL,
  `ref_id` CHAR(36) NOT NULL,
  `project_id` CHAR(36),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_mailbox_shared_access_user_id_kind_ref_id_message_id_ke` (`user_id`, `kind`, `ref_id`, `message_id`),
  CONSTRAINT `cons_mailbox_shared_access_kind_check` CHECK (kind IN ('budget', 'certification', 'work_log', 'expense', 'project')),
  CONSTRAINT `cons_mailbox_shared_access_message_id_fkey` FOREIGN KEY (message_id) REFERENCES cons_mailbox_messages(id) ON DELETE CASCADE,
  CONSTRAINT `cons_mailbox_shared_access_user_id_fkey` FOREIGN KEY (user_id) REFERENCES cons_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_material_categories` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36),
  `parent_id` CHAR(36),
  `code` VARCHAR(255) NOT NULL,
  `name_es` TEXT NOT NULL,
  `name_en` TEXT,
  `description` TEXT,
  `sort_order` INT DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_material_categories_organization_id_code_key` (`organization_id`, `code`),
  CONSTRAINT `cons_material_categories_organization_id_fkey` FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE,
  CONSTRAINT `cons_material_categories_parent_id_fkey` FOREIGN KEY (parent_id) REFERENCES cons_material_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_material_price_history` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `material_id` CHAR(36) NOT NULL,
  `unit_price` DECIMAL(12,2) NOT NULL,
  `supplier_id` CHAR(36),
  `effective_date` DATE NOT NULL,
  `source` TEXT,
  `notes` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_material_price_history_material_id_fkey` FOREIGN KEY (material_id) REFERENCES cons_materials(id) ON DELETE CASCADE,
  CONSTRAINT `cons_material_price_history_supplier_id_fkey` FOREIGN KEY (supplier_id) REFERENCES cons_suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_materials` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `category_id` CHAR(36),
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `unit` VARCHAR(255) NOT NULL DEFAULT 'ud',
  `unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  `sale_price` DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  `currency` VARCHAR(255) DEFAULT 'EUR',
  `supplier_id` CHAR(36),
  `brand` TEXT,
  `min_stock` DECIMAL(10,2) DEFAULT 0,
  `current_stock` DECIMAL(10,2) DEFAULT 0,
  `notes` TEXT,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `material_group_id` CHAR(36),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_materials_category_id_fkey` FOREIGN KEY (category_id) REFERENCES cons_material_categories(id),
  CONSTRAINT `cons_materials_organization_id_fkey` FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE,
  CONSTRAINT `cons_materials_supplier_id_fkey` FOREIGN KEY (supplier_id) REFERENCES cons_suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_measurements` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `budget_item_id` CHAR(36) NOT NULL,
  `description` TEXT,
  `units` DECIMAL(12,3) DEFAULT 1.0,
  `length` DECIMAL(12,3) DEFAULT 0.0,
  `width` DECIMAL(12,3) DEFAULT 0.0,
  `height` DECIMAL(12,3) DEFAULT 0.0,
  `partial` DECIMAL(12,3) DEFAULT 0.0,
  `formula` TEXT,
  `sort_order` INT DEFAULT 0,
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_measurements_budget_item_id_fkey` FOREIGN KEY (budget_item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_notifications` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id` CHAR(36) NOT NULL,
  `type` TEXT NOT NULL,
  `title` TEXT NOT NULL,
  `body` TEXT,
  `data` JSON DEFAULT ('{}'),
  `read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_organization_members` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `role` VARCHAR(255) NOT NULL DEFAULT 'viewer',
  `joined_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_organization_members_organization_id_user_id_key` (`organization_id`, `user_id`),
  CONSTRAINT `cons_organization_members_role_check` CHECK (role IN ('owner', 'editor', 'viewer')),
  CONSTRAINT `cons_organization_members_organization_id_fkey` FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE,
  CONSTRAINT `cons_organization_members_user_id_fkey` FOREIGN KEY (user_id) REFERENCES cons_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_organizations` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `name` TEXT NOT NULL,
  `owner_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_organizations_owner_id_fkey` FOREIGN KEY (owner_id) REFERENCES cons_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_plan_annotations` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `file_id` CHAR(36) NOT NULL,
  `page_number` INT NOT NULL DEFAULT 1,
  `annotation_type` TEXT NOT NULL,
  `data` JSON NOT NULL DEFAULT ('{}'),
  `color` VARCHAR(255) DEFAULT '#ef4444',
  `stroke_width` DECIMAL(4,1) DEFAULT 2.0,
  `label` TEXT,
  `real_value` DECIMAL(12,3),
  `real_unit` VARCHAR(255) DEFAULT 'm',
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_plan_annotations_annotation_type_check` CHECK (annotation_type IN ('distance', 'area', 'dimension', 'text', 'arrow', 'rectangle', 'circle', 'line', 'calibrate')),
  CONSTRAINT `cons_plan_annotations_file_id_fkey` FOREIGN KEY (file_id) REFERENCES cons_project_files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_plan_calibrations` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `file_id` CHAR(36) NOT NULL,
  `page_number` INT NOT NULL DEFAULT 1,
  `pixels_distance` DECIMAL(12,3) NOT NULL,
  `real_distance` DECIMAL(12,3) NOT NULL,
  `unit` VARCHAR(255) DEFAULT 'm',
  `scale_label` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_plan_calibrations_file_id_page_number_key` (`file_id`, `page_number`),
  CONSTRAINT `cons_plan_calibrations_file_id_fkey` FOREIGN KEY (file_id) REFERENCES cons_project_files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_plan_extractions` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `file_id` CHAR(36) NOT NULL,
  `project_id` CHAR(36) NOT NULL,
  `organization_id` CHAR(36) NOT NULL,
  `discipline` VARCHAR(255) NOT NULL DEFAULT 'ESTRUCTURA',
  `tipo_plano_detectado` JSON DEFAULT '{}',
  `extraction_data` JSON NOT NULL DEFAULT ('{}'),
  `status` VARCHAR(255) NOT NULL DEFAULT 'draft',
  `notes` TEXT,
  `created_by` CHAR(36),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_plan_extractions_status_check` CHECK (status IN ('draft', 'reviewed', 'integrated')),
  CONSTRAINT `cons_plan_extractions_file_id_fkey` FOREIGN KEY (file_id) REFERENCES cons_project_files(id) ON DELETE CASCADE,
  CONSTRAINT `cons_plan_extractions_project_id_fkey` FOREIGN KEY (project_id) REFERENCES cons_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_price_breakdown` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `budget_item_id` CHAR(36) NOT NULL,
  `resource_type` TEXT NOT NULL,
  `material_id` CHAR(36),
  `description` TEXT NOT NULL,
  `unit` VARCHAR(255) NOT NULL DEFAULT 'ud',
  `quantity` DECIMAL(12,3) NOT NULL DEFAULT 0.0,
  `unit_cost` DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  `sort_order` INT DEFAULT 0,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_price_breakdown_resource_type_check` CHECK (resource_type IN ('labor', 'material', 'equipment', 'subcontract', 'other')),
  CONSTRAINT `cons_price_breakdown_budget_item_id_fkey` FOREIGN KEY (budget_item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE,
  CONSTRAINT `cons_price_breakdown_material_id_fkey` FOREIGN KEY (material_id) REFERENCES cons_materials(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_project_expenses` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `project_id` CHAR(36) NOT NULL,
  `date` DATE NOT NULL,
  `supplier_name` TEXT,
  `concept` TEXT NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  `tax_amount` DECIMAL(12,2) DEFAULT 0.0,
  `image_path` TEXT,
  `budget_chapter_id` CHAR(36),
  `notes` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `supplier_id` CHAR(36),
  `work_log_id` CHAR(36),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_project_expenses_budget_chapter_id_fkey` FOREIGN KEY (budget_chapter_id) REFERENCES cons_chapters(id),
  CONSTRAINT `cons_project_expenses_project_id_fkey` FOREIGN KEY (project_id) REFERENCES cons_projects(id) ON DELETE CASCADE,
  CONSTRAINT `cons_project_expenses_supplier_id_fkey` FOREIGN KEY (supplier_id) REFERENCES cons_suppliers(id) ON DELETE SET NULL,
  CONSTRAINT `cons_project_expenses_work_log_id_fkey` FOREIGN KEY (work_log_id) REFERENCES cons_work_logs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_project_files` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `project_id` CHAR(36) NOT NULL,
  `original_name` TEXT NOT NULL,
  `stored_name` TEXT NOT NULL,
  `storage_path` TEXT NOT NULL,
  `file_type` TEXT NOT NULL,
  `file_size` BIGINT,
  `category` VARCHAR(255) DEFAULT 'general',
  `description` TEXT,
  `page_count` INT,
  `imported_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `dxf_svg_path` TEXT,
  `dxf_entities` JSON,
  `dxf_layers` JSON,
  `dxf_bounding_box` JSON,
  `parent_file_id` CHAR(36),
  `page_order` INT DEFAULT 0,
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_project_files_category_check` CHECK (category IN ('plan', 'memory', 'measurement', 'budget', 'photo', 'general')),
  CONSTRAINT `cons_project_files_file_type_check` CHECK (file_type IN ('pdf', 'dwg', 'dxf', 'image', 'document', 'spreadsheet', 'other')),
  CONSTRAINT `cons_project_files_parent_file_id_fkey` FOREIGN KEY (parent_file_id) REFERENCES cons_project_files(id) ON DELETE CASCADE,
  CONSTRAINT `cons_project_files_project_id_fkey` FOREIGN KEY (project_id) REFERENCES cons_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_projects` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `created_by` CHAR(36) NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `location` TEXT,
  `client_name` TEXT,
  `client_contact` TEXT,
  `address` TEXT,
  `city` TEXT,
  `province` TEXT,
  `postal_code` TEXT,
  `country` VARCHAR(255) DEFAULT 'ES',
  `start_date` DATE,
  `end_date` DATE,
  `status` VARCHAR(255) DEFAULT 'active',
  `currency` VARCHAR(255) DEFAULT 'EUR',
  `tax_rate` DECIMAL(5,2) DEFAULT 21.0,
  `notes` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `folder_path` TEXT,
  `deleted_at` DATETIME(3),
  `deleted_by` CHAR(36),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_projects_status_check` CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  CONSTRAINT `cons_projects_created_by_fkey` FOREIGN KEY (created_by) REFERENCES cons_users(id),
  CONSTRAINT `cons_projects_organization_id_fkey` FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_saved_partidas` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `unit` VARCHAR(255) NOT NULL DEFAULT 'ud',
  `unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  `cost_price` DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  `chapter_code` TEXT,
  `tags` VARCHAR(255) DEFAULT '',
  `source` VARCHAR(255) DEFAULT 'manual',
  `usage_count` INT DEFAULT 0,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `library_chapter_id` CHAR(36),
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_auxiliary` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_saved_partidas_source_check` CHECK (source IN ('manual', 'from_budget', 'imported')),
  CONSTRAINT `cons_saved_partidas_library_chapter_id_fkey` FOREIGN KEY (library_chapter_id) REFERENCES cons_library_chapters(id) ON DELETE SET NULL,
  CONSTRAINT `cons_saved_partidas_organization_id_fkey` FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_subcontractor_documents` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `subcontractor_id` CHAR(36) NOT NULL,
  `project_id` CHAR(36),
  `doc_type` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `file_path` TEXT,
  `expiry_date` DATE,
  `status` VARCHAR(255) NOT NULL DEFAULT 'pending',
  `notes` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_subcontractor_documents_doc_type_check` CHECK (doc_type IN ('tc1', 'tc2', 'seguro_rc', 'seguro_accidentes', 'plan_seguridad', 'evaluacion_riesgos', 'formacion_prl', 'rea', 'certificado_corriente_ss', 'certificado_corriente_hacienda', 'libro_subcontratacion', 'contrato', 'otro')),
  CONSTRAINT `cons_subcontractor_documents_status_check` CHECK (status IN ('valid', 'expired', 'pending', 'rejected')),
  CONSTRAINT `cons_subcontractor_documents_subcontractor_id_fkey` FOREIGN KEY (subcontractor_id) REFERENCES cons_subcontractors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_subcontractors` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `name` TEXT NOT NULL,
  `tax_id` TEXT,
  `contact_name` TEXT,
  `phone` TEXT,
  `email` TEXT,
  `address` TEXT,
  `city` TEXT,
  `province` TEXT,
  `postal_code` TEXT,
  `specialty` TEXT,
  `rating` INT DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `notes` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_subcontractors_rating_check` CHECK (((rating >= 0) AND (rating <= 5)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_supplier_materials` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `supplier_id` CHAR(36) NOT NULL,
  `material_id` CHAR(36) NOT NULL,
  `unit_price` DECIMAL(14,4) NOT NULL,
  `notes` TEXT,
  `last_updated` DATE DEFAULT (CURRENT_DATE),
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `supplier_description` TEXT,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_supplier_materials_supplier_id_material_id_key` (`supplier_id`, `material_id`),
  CONSTRAINT `cons_supplier_materials_material_id_fkey` FOREIGN KEY (material_id) REFERENCES cons_materials(id) ON DELETE CASCADE,
  CONSTRAINT `cons_supplier_materials_supplier_id_fkey` FOREIGN KEY (supplier_id) REFERENCES cons_suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_suppliers` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `name` TEXT NOT NULL,
  `tax_id` TEXT,
  `contact_name` TEXT,
  `phone` TEXT,
  `email` TEXT,
  `address` TEXT,
  `city` TEXT,
  `province` TEXT,
  `postal_code` TEXT,
  `website` TEXT,
  `category` TEXT,
  `notes` TEXT,
  `rating` INT,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_suppliers_rating_check` CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5)))),
  CONSTRAINT `cons_suppliers_organization_id_fkey` FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_units` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `value` VARCHAR(255) NOT NULL,
  `label` TEXT,
  `sort_order` INT DEFAULT 0,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_units_organization_id_value_key` (`organization_id`, `value`),
  CONSTRAINT `cons_units_organization_id_fkey` FOREIGN KEY (organization_id) REFERENCES cons_organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_users` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `email` VARCHAR(255) NOT NULL,
  `password_hash` TEXT NOT NULL,
  `full_name` TEXT NOT NULL,
  `avatar_url` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `reset_token` TEXT,
  `reset_token_expires` DATETIME(3),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `ai_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `app` VARCHAR(255) DEFAULT 'construgest',
  PRIMARY KEY (`id`),
  UNIQUE KEY `cons_users_email_key` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_work_log_budget_links` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `work_log_id` CHAR(36) NOT NULL,
  `budget_item_id` CHAR(36) NOT NULL,
  `executed_quantity` DECIMAL(12,3) NOT NULL DEFAULT 0,
  `notes` TEXT,
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_work_log_budget_links_budget_item_id_fkey` FOREIGN KEY (budget_item_id) REFERENCES cons_budget_items(id) ON DELETE CASCADE,
  CONSTRAINT `cons_work_log_budget_links_work_log_id_fkey` FOREIGN KEY (work_log_id) REFERENCES cons_work_logs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_work_log_equipment` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `work_log_id` CHAR(36) NOT NULL,
  `equipment_name` VARCHAR(500) NOT NULL,
  `hours` DECIMAL(5,2) NOT NULL,
  `hourly_rate` DECIMAL(10,2) NOT NULL,
  `sort_order` INT DEFAULT 0,
  `date` DATE,
  `equipment_id` CHAR(36),
  `description` TEXT,
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_work_log_equipment_work_log_id_fkey` FOREIGN KEY (work_log_id) REFERENCES cons_work_logs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_work_log_labor` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `work_log_id` CHAR(36) NOT NULL,
  `role` VARCHAR(255) NOT NULL,
  `worker_count` INT NOT NULL DEFAULT 1,
  `hours` DECIMAL(5,2) NOT NULL,
  `hourly_rate` DECIMAL(10,2) NOT NULL,
  `sort_order` INT DEFAULT 0,
  `date` DATE,
  `worker_id` CHAR(36),
  `description` TEXT,
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_work_log_labor_work_log_id_fkey` FOREIGN KEY (work_log_id) REFERENCES cons_work_logs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_work_log_materials` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `work_log_id` CHAR(36) NOT NULL,
  `material_name` VARCHAR(500) NOT NULL,
  `quantity` DECIMAL(12,3) NOT NULL,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'ud',
  `unit_price` DECIMAL(10,2) NOT NULL,
  `sort_order` INT DEFAULT 0,
  `date` DATE,
  `description` TEXT,
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_work_log_materials_work_log_id_fkey` FOREIGN KEY (work_log_id) REFERENCES cons_work_logs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_work_logs` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `project_id` CHAR(36) NOT NULL,
  `date` DATE NOT NULL,
  `description` TEXT,
  `weather` VARCHAR(50),
  `notes` TEXT,
  `status` VARCHAR(20) DEFAULT 'draft',
  `created_by` TEXT NOT NULL,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_work_logs_status_check` CHECK (status IN ('draft', 'submitted', 'approved')),
  CONSTRAINT `cons_work_logs_project_id_fkey` FOREIGN KEY (project_id) REFERENCES cons_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cons_workers` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `name` TEXT NOT NULL,
  `dni` TEXT,
  `role` VARCHAR(255) NOT NULL DEFAULT 'Peón',
  `specialty` TEXT,
  `hourly_rate` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `phone` TEXT,
  `email` TEXT,
  `emergency_contact` TEXT,
  `is_subcontracted` TINYINT(1) NOT NULL DEFAULT 0,
  `subcontractor_id` CHAR(36),
  `certifications` JSON DEFAULT ('[]'),
  `status` VARCHAR(255) NOT NULL DEFAULT 'active',
  `photo_url` TEXT,
  `hire_date` DATE,
  `end_date` DATE,
  `notes` TEXT,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_workers_status_check` CHECK (status IN ('active', 'inactive', 'on_leave'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `mcp_ai_consumption` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `app_id` VARCHAR(255) NOT NULL,
  `org_id` VARCHAR(255) NOT NULL,
  `user_id` CHAR(36),
  `provider` TEXT NOT NULL,
  `model` TEXT NOT NULL,
  `input_tokens` INT DEFAULT 0,
  `output_tokens` INT DEFAULT 0,
  `estimated_cost` DECIMAL(12,8) DEFAULT 0,
  `key_source` VARCHAR(255) DEFAULT 'env',
  `operation` VARCHAR(255) DEFAULT 'chat',
  `tool_calls` INT DEFAULT 0,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `mcp_ai_pricing` (
  `model` VARCHAR(255) NOT NULL,
  `provider` TEXT NOT NULL,
  `input_price_per_million` DECIMAL(10,6) NOT NULL,
  `output_price_per_million` DECIMAL(10,6) NOT NULL,
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`model`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `mcp_ai_provider_credits` (
  `provider` VARCHAR(255) NOT NULL,
  `initial_amount` DECIMAL(10,4) NOT NULL DEFAULT 0,
  `credit_type` VARCHAR(255) NOT NULL DEFAULT 'credit',
  `notes` TEXT,
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `mcp_ai_quotas` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `app_id` VARCHAR(255) NOT NULL,
  `org_id` VARCHAR(255) NOT NULL,
  `quota_type` VARCHAR(255) NOT NULL DEFAULT 'monthly',
  `max_calls` INT,
  `max_cost_usd` DECIMAL(10,4),
  `max_tokens` BIGINT,
  `credits_extra` INT DEFAULT 0,
  `bypass_user_ids` JSON DEFAULT '{}',
  `enabled` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `mcp_ai_quotas_app_id_org_id_quota_type_key` (`app_id`, `org_id`, `quota_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `mcp_ai_user_quotas` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `app_id` VARCHAR(255) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `quota_type` VARCHAR(255) NOT NULL DEFAULT 'daily',
  `max_calls` INT,
  `max_tokens` BIGINT,
  `max_cost_usd` DECIMAL(10,4),
  `enabled` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `mcp_ai_user_quotas_app_id_user_id_quota_type_key` (`app_id`, `user_id`, `quota_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- indices ----------
CREATE INDEX `idx_ai_consumption_date` ON `cons_ai_consumption` (`created_at`);
CREATE INDEX `idx_ai_consumption_org` ON `cons_ai_consumption` (`organization_id`);
CREATE INDEX `idx_ai_corrections_org_skill` ON `cons_ai_corrections` (`organization_id`, `skill`, `created_at`);
CREATE INDEX `idx_branch_invitations_status` ON `cons_branch_invitations` (`status`);
CREATE INDEX `idx_branch_invitations_to_email` ON `cons_branch_invitations` (`to_email`);
CREATE INDEX `idx_branch_links_org_a` ON `cons_branch_links` (`organization_a_id`);
CREATE INDEX `idx_branch_links_org_b` ON `cons_branch_links` (`organization_b_id`);
CREATE INDEX `idx_cons_bce_pair` ON `cons_budget_comparison_exclusions` (`budget_a_id`, `budget_b_id`);
CREATE INDEX `idx_cons_bcgi_group` ON `cons_budget_comparison_group_items` (`group_id`);
CREATE INDEX `idx_cons_bcgi_item` ON `cons_budget_comparison_group_items` (`item_id`);
CREATE INDEX `idx_cons_bcg_pair` ON `cons_budget_comparison_groups` (`budget_a_id`, `budget_b_id`);
CREATE INDEX `idx_cons_item_templates_chapter` ON `cons_budget_item_templates` (`chapter_code`);
CREATE INDEX `idx_cons_budget_items_chapter` ON `cons_budget_items` (`chapter_id`);
CREATE INDEX `cons_budgets_deleted_at_idx` ON `cons_budgets` (`deleted_at`);
CREATE INDEX `idx_cons_budgets_project` ON `cons_budgets` (`project_id`);
CREATE INDEX `idx_cons_cert_items_cert` ON `cons_certification_items` (`certification_id`);
CREATE INDEX `idx_fk_cons_cert_items_budget` ON `cons_certification_items` (`budget_item_id`);
CREATE INDEX `idx_cwll_budget_item` ON `cons_certification_work_log_links` (`budget_item_id`);
CREATE INDEX `idx_cwll_certification` ON `cons_certification_work_log_links` (`certification_id`);
CREATE INDEX `idx_cwll_wl_link` ON `cons_certification_work_log_links` (`work_log_budget_link_id`);
CREATE INDEX `idx_cwll_work_log` ON `cons_certification_work_log_links` (`work_log_id`);
CREATE UNIQUE INDEX `uq_cwll_cert_link` ON `cons_certification_work_log_links` (`certification_id`, `work_log_budget_link_id`);
CREATE INDEX `idx_cons_certifications_budget` ON `cons_certifications` (`budget_id`);
CREATE INDEX `idx_cons_chapters_budget` ON `cons_chapters` (`budget_id`);
CREATE INDEX `idx_fk_cons_chapters_parent` ON `cons_chapters` (`parent_id`);
CREATE INDEX `idx_equipment_org` ON `cons_equipment_catalog` (`organization_id`);
CREATE INDEX `idx_equipment_status` ON `cons_equipment_catalog` (`organization_id`, `status`);
CREATE INDEX `idx_equipment_type` ON `cons_equipment_catalog` (`organization_id`, `type`);
CREATE INDEX `idx_equipment_materials_equipment` ON `cons_equipment_materials` (`equipment_id`);
CREATE INDEX `idx_equipment_materials_sm` ON `cons_equipment_materials` (`supplier_material_id`);
CREATE INDEX `idx_library_chapters_org` ON `cons_library_chapters` (`organization_id`);
CREATE INDEX `idx_mailbox_attachments_message` ON `cons_mailbox_attachments` (`message_id`);
CREATE INDEX `idx_mailbox_inbox_active` ON `cons_mailbox_messages` (`to_user_id`, `created_at`);
CREATE INDEX `idx_mailbox_sent_active` ON `cons_mailbox_messages` (`from_user_id`, `created_at`);
CREATE INDEX `idx_mailbox_to_user` ON `cons_mailbox_messages` (`to_user_id`, `read`);
CREATE INDEX `idx_mailbox_trash_from` ON `cons_mailbox_messages` (`from_user_id`, `deleted_at_from`);
CREATE INDEX `idx_mailbox_trash_to` ON `cons_mailbox_messages` (`to_user_id`, `deleted_at_to`);
CREATE INDEX `idx_mailbox_shared_access_lookup` ON `cons_mailbox_shared_access` (`user_id`, `kind`, `ref_id`);
CREATE INDEX `idx_mailbox_shared_access_message` ON `cons_mailbox_shared_access` (`message_id`);
CREATE INDEX `idx_mailbox_shared_access_project` ON `cons_mailbox_shared_access` (`user_id`, `project_id`);
CREATE INDEX `idx_mailbox_shared_access_user` ON `cons_mailbox_shared_access` (`user_id`);
CREATE INDEX `idx_fk_cons_mat_cat_parent` ON `cons_material_categories` (`parent_id`);
CREATE INDEX `idx_fk_cons_mat_price_supplier` ON `cons_material_price_history` (`supplier_id`);
CREATE INDEX `idx_price_history_material` ON `cons_material_price_history` (`material_id`);
CREATE INDEX `idx_cons_materials_category` ON `cons_materials` (`category_id`);
CREATE INDEX `idx_cons_materials_group` ON `cons_materials` (`material_group_id`);
CREATE INDEX `idx_cons_materials_org` ON `cons_materials` (`organization_id`);
CREATE INDEX `idx_fk_cons_materials_supplier` ON `cons_materials` (`supplier_id`);
CREATE INDEX `idx_cons_measurements_item` ON `cons_measurements` (`budget_item_id`);
CREATE INDEX `idx_notifications_user_unread` ON `cons_notifications` (`user_id`, `read`);
CREATE INDEX `idx_fk_cons_org_members_user` ON `cons_organization_members` (`user_id`);
CREATE INDEX `idx_fk_cons_org_owner` ON `cons_organizations` (`owner_id`);
CREATE INDEX `idx_cons_annotations_file` ON `cons_plan_annotations` (`file_id`, `page_number`);
CREATE INDEX `idx_plan_extractions_file` ON `cons_plan_extractions` (`file_id`);
CREATE INDEX `idx_plan_extractions_org` ON `cons_plan_extractions` (`organization_id`);
CREATE INDEX `idx_plan_extractions_project` ON `cons_plan_extractions` (`project_id`);
CREATE INDEX `idx_cons_breakdown_item` ON `cons_price_breakdown` (`budget_item_id`);
CREATE INDEX `idx_fk_cons_price_material` ON `cons_price_breakdown` (`material_id`);
CREATE INDEX `idx_cons_expenses_project` ON `cons_project_expenses` (`project_id`);
CREATE INDEX `idx_expenses_supplier` ON `cons_project_expenses` (`supplier_id`);
CREATE INDEX `idx_expenses_work_log` ON `cons_project_expenses` (`work_log_id`);
CREATE INDEX `idx_fk_cons_proj_exp_chapter` ON `cons_project_expenses` (`budget_chapter_id`);
CREATE INDEX `idx_cons_project_files_project` ON `cons_project_files` (`project_id`);
CREATE INDEX `cons_projects_deleted_at_idx` ON `cons_projects` (`deleted_at`);
CREATE INDEX `idx_cons_projects_org` ON `cons_projects` (`organization_id`);
CREATE INDEX `idx_fk_cons_projects_created` ON `cons_projects` (`created_by`);
CREATE INDEX `idx_cons_saved_partidas_org` ON `cons_saved_partidas` (`organization_id`);
CREATE INDEX `idx_saved_partidas_chapter_sort` ON `cons_saved_partidas` (`library_chapter_id`, `sort_order`);
CREATE INDEX `idx_saved_partidas_library_chapter` ON `cons_saved_partidas` (`library_chapter_id`);
CREATE INDEX `idx_subcontractor_docs_expiry` ON `cons_subcontractor_documents` (`expiry_date`);
CREATE INDEX `idx_subcontractor_docs_project` ON `cons_subcontractor_documents` (`project_id`);
CREATE INDEX `idx_subcontractor_docs_sub` ON `cons_subcontractor_documents` (`subcontractor_id`);
CREATE INDEX `idx_subcontractors_org` ON `cons_subcontractors` (`organization_id`);
CREATE INDEX `idx_supplier_materials_material` ON `cons_supplier_materials` (`material_id`);
CREATE INDEX `idx_supplier_materials_supplier` ON `cons_supplier_materials` (`supplier_id`);
CREATE INDEX `idx_fk_cons_suppliers_org` ON `cons_suppliers` (`organization_id`);
CREATE INDEX `idx_work_log_budget_links_item` ON `cons_work_log_budget_links` (`budget_item_id`);
CREATE INDEX `idx_work_log_budget_links_log` ON `cons_work_log_budget_links` (`work_log_id`);
CREATE INDEX `idx_wl_equipment_catalog` ON `cons_work_log_equipment` (`equipment_id`);
CREATE INDEX `idx_wl_equipment_date` ON `cons_work_log_equipment` (`date`);
CREATE INDEX `idx_work_log_equipment_log` ON `cons_work_log_equipment` (`work_log_id`);
CREATE INDEX `idx_wl_labor_date` ON `cons_work_log_labor` (`date`);
CREATE INDEX `idx_wl_labor_worker` ON `cons_work_log_labor` (`worker_id`);
CREATE INDEX `idx_work_log_labor_log` ON `cons_work_log_labor` (`work_log_id`);
CREATE INDEX `idx_wl_materials_date` ON `cons_work_log_materials` (`date`);
CREATE INDEX `idx_work_log_materials_log` ON `cons_work_log_materials` (`work_log_id`);
CREATE INDEX `idx_work_logs_date` ON `cons_work_logs` (`date`);
CREATE INDEX `idx_work_logs_project` ON `cons_work_logs` (`project_id`);
CREATE INDEX `idx_workers_org` ON `cons_workers` (`organization_id`);
CREATE INDEX `idx_workers_role` ON `cons_workers` (`organization_id`, `role`);
CREATE INDEX `idx_workers_status` ON `cons_workers` (`organization_id`, `status`);
CREATE INDEX `idx_workers_subcontractor` ON `cons_workers` (`subcontractor_id`);
CREATE INDEX `idx_mcp_consumption_app_org` ON `mcp_ai_consumption` (`app_id`, `org_id`);
CREATE INDEX `idx_mcp_consumption_app_org_month` ON `mcp_ai_consumption` (`app_id`, `org_id`, `created_at`);
CREATE INDEX `idx_mcp_consumption_created` ON `mcp_ai_consumption` (`created_at`);
CREATE INDEX `idx_mcp_consumption_user` ON `mcp_ai_consumption` (`user_id`);
CREATE INDEX `idx_mcp_user_quotas_user` ON `mcp_ai_user_quotas` (`user_id`);

SET FOREIGN_KEY_CHECKS=1;