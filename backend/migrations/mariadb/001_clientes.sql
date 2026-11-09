-- ════════════════════════════════════════════════════════════════════════════
-- PRES-1 — Ficha de clientes reutilizable.
--
-- Hasta ahora el cliente era sólo texto suelto en el proyecto (`client_name` y
-- `client_contact`): no había NIF ni dirección fiscal, y para la misma comunidad
-- de propietarios había que reescribirlo todo en cada obra. El presupuesto en
-- PDF, además, no imprimía ningún dato del cliente.
--
-- Esta migración:
--   1. crea `cons_clients` (ficha reutilizable por organización),
--   2. añade `cons_projects.client_id` + su FK,
--   3. CONVIERTE los `client_name` que ya existen en fichas, y enlaza el proyecto.
--
-- `client_name` / `client_contact` NO se borran: se dejan como estaban para no
-- romper nada que aún los lea. La ficha manda cuando existe.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `cons_clients` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `name` TEXT NOT NULL,                      -- como lo llamas tú
  `legal_name` TEXT,                         -- razón social, si difiere
  `tax_id` TEXT,                             -- NIF / CIF
  `contact_name` TEXT,
  `phone` TEXT,
  `email` TEXT,
  `address` TEXT,
  `postal_code` TEXT,
  `city` TEXT,
  `province` TEXT,
  `country` VARCHAR(255) DEFAULT 'ES',
  `notes` TEXT,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_clients_organization_id_fkey`
    FOREIGN KEY (`organization_id`) REFERENCES `cons_organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS `idx_cons_clients_org` ON `cons_clients` (`organization_id`);

ALTER TABLE `cons_projects` ADD COLUMN IF NOT EXISTS `client_id` CHAR(36);

CREATE INDEX IF NOT EXISTS `idx_cons_projects_client` ON `cons_projects` (`client_id`);

-- La FK no admite IF NOT EXISTS, así que se mira antes si ya está.
SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cons_projects'
    AND CONSTRAINT_NAME = 'cons_projects_client_id_fkey'
);

SET @sql := IF(@fk = 0,
  'ALTER TABLE cons_projects ADD CONSTRAINT cons_projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES cons_clients(id) ON DELETE SET NULL',
  'DO 0');

PREPARE stmt FROM @sql;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- ── Datos que ya existen: un cliente por cada client_name distinto ──────────
-- OJO: la dirección del proyecto es la de la OBRA, no la del cliente, así que
-- NO se copia. Sólo se traslada el nombre y la persona de contacto.
INSERT INTO `cons_clients` (`id`, `organization_id`, `name`, `contact_name`)
SELECT UUID(), p.`organization_id`, TRIM(p.`client_name`),
       MAX(NULLIF(TRIM(p.`client_contact`), ''))
FROM `cons_projects` p
WHERE p.`client_id` IS NULL
  AND p.`client_name` IS NOT NULL
  AND TRIM(p.`client_name`) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM `cons_clients` c
    WHERE c.`organization_id` = p.`organization_id`
      AND c.`name` = TRIM(p.`client_name`)
  )
GROUP BY p.`organization_id`, TRIM(p.`client_name`);

UPDATE `cons_projects` p
JOIN `cons_clients` c
  ON c.`organization_id` = p.`organization_id`
 AND c.`name` = TRIM(p.`client_name`)
SET p.`client_id` = c.`id`
WHERE p.`client_id` IS NULL
  AND p.`client_name` IS NOT NULL
  AND TRIM(p.`client_name`) <> '';
