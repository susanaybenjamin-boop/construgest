-- ════════════════════════════════════════════════════════════════════════════
-- PRES-3 — Anexo fotográfico por zonas.
--
-- Las fotos ya se suben al proyecto (`cons_project_files`, categoría 'photo'),
-- pero no había forma de decir que una foto va en el presupuesto, a qué zona
-- pertenece ni qué pie lleva; y el PDF no imprimía ninguna imagen salvo el logo.
--
-- Esta tabla NO duplica el fichero: apunta al que ya está subido y le añade la
-- zona, el pie y el orden dentro del anexo. Así la misma foto puede estar en el
-- proyecto sin salir en el presupuesto, o salir en varios presupuestos.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `cons_budget_photos` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `budget_id` CHAR(36) NOT NULL,
  `file_id` CHAR(36) NOT NULL,
  `zone` VARCHAR(255),
  `caption` TEXT,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cons_budget_photos_budget_file` (`budget_id`, `file_id`),
  CONSTRAINT `cons_budget_photos_budget_id_fkey`
    FOREIGN KEY (`budget_id`) REFERENCES `cons_budgets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cons_budget_photos_file_id_fkey`
    FOREIGN KEY (`file_id`) REFERENCES `cons_project_files` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS `idx_cons_budget_photos_budget` ON `cons_budget_photos` (`budget_id`, `sort_order`);
