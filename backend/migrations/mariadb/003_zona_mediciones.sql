-- ════════════════════════════════════════════════════════════════════════════
-- PRES-2 — Zona en las mediciones.
--
-- Las mediciones ya guardaban uds/largo/ancho/alto/parcial, pero no DÓNDE se
-- mide. El presupuesto "completo" lleva un anexo con las mediciones agrupadas
-- por zona (planta 5ª, escalera 3ª–2ª, portal…) y una tabla cruzada
-- zona × concepto con los totales por columna.
--
-- La zona es texto libre a propósito: cada obra tiene las suyas y no vale la
-- pena una tabla de zonas que haya que mantener. La UI ofrece como sugerencia
-- las que ya se han escrito en ese presupuesto.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE `cons_measurements` ADD COLUMN IF NOT EXISTS `zone` VARCHAR(255);

CREATE INDEX IF NOT EXISTS `idx_cons_measurements_zone` ON `cons_measurements` (`zone`);
