-- ════════════════════════════════════════════════════════════════════════════
-- PRES-4 — Condiciones de la oferta, guardadas.
--
-- Hasta ahora las "Condiciones generales" se escribían en el modal de vista
-- previa del PDF y NO se guardaban en ninguna parte: salían en ese PDF y se
-- perdían al cerrar el modal.
--
-- Ahora cada presupuesto guarda las suyas (`conditions`), y en Ajustes hay una
-- plantilla por defecto (clave `budget_conditions_default` de cons_app_settings,
-- que es clave-valor y no necesita migración) que se precarga al crear uno nuevo.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE `cons_budgets` ADD COLUMN IF NOT EXISTS `conditions` TEXT;
