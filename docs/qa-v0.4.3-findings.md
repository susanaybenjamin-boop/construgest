# QA pre-release v0.4.3 — hallazgos confirmados

Auditoría multi-agente (41 agentes, estática + dinámica con curl real contra backend :5000 y
verificación adversarial). **27 bugs REALES, 0 falsos positivos.** Cada uno reproducido en ejecución.

## ✅ ESTADO: los 27 ARREGLADOS y verificados en ejecución (2026-07-18)
Backend de dev nativo (`node --watch`) contra la MariaDB demo; cada fix probado por su camino real
con curl. `node --check` OK en los 19 ficheros tocados. Regresión OK (flujo crear proyecto→
presupuesto→capítulo→partida; login; selector de carpetas). Falta: bump de versión + build del `.msi`.

Ficheros tocados: `db/local.js`, `db/rpc.js`, `middlewares/auth.js`, y rutas `projects, expenses,
subcontractors, workers, equipmentCatalog, ai, plans, notifications, mailbox, settings,
certifications, workLogs, materials, supplierMaterials, auth` + `services/ai-corrections.js`.

Leyenda estado: ⬜ pendiente · ✅ arreglado · ⏭️ diferido

---

## 🔑 Causa raíz común — patrón `undefined → NULL` del shim (5 bugs de un tiro)
El `UPDATE` del shim `db/local.js` hace `Object.keys(values)` y `normVal(undefined)→NULL`. Toda ruta
PUT que reconstruye el objeto entero pone a NULL las columnas que no llegan en el body.
**Fix de raíz (recomendado):** que el `UPDATE` del shim ignore las claves con valor `undefined`.
Arregla de golpe: #4 (projects, ya parcheado en la ruta), #5, #6, #8, #19.
✅ **HECHO** (`db/local.js`, ambas ramas UPDATE) — verificado A2/A3/A5 en ejecución.

---

## CRÍTICOS (aislamiento entre organizaciones — IDOR)
> Menos grave en uso local monousuario, pero real si se usan sucursales/buzón compartido.

- ⬜ **C1 · projects** — Sub-rutas de ficheros no acotan `fileId` al proyecto de la URL → leer/borrar ficheros de CUALQUIER org. `projects.js` (files/:fileId url, dxf-data, dxf-text, replace, delete). Fix: añadir `.eq('project_id', req.params.id)`.
- ⬜ **C2 · expenses** — `expenses.js` sin `projectAccessMiddleware` en ninguna ruta → leer/editar/borrar gastos de otras orgs. Fix: middleware de acceso por proyecto/gasto.
- ⬜ **C3 · subcontratas/trabajadores/equipos** — RPCs `get/update/delete` usan solo `id`, sin `organization_id` → IDOR. `db/rpc.js` + rutas. Fix: propagar y filtrar por `organization_id`.

## ALTOS
- ⬜ **A1 · projects** — Rutas de escritura no bloquean roles de solo lectura (branch_viewer/mailbox_guest pueden editar). Fix: `requireWrite` en `projectAccessMiddleware`.
- ⬜ **A2 · budgets** — `PUT /budgets/breakdown/:id` parcial → 500 (NOT NULL) → el **desglose de precios es ineditable** desde la UI. [undefined→NULL]
- ⬜ **A3 · budgets** — `PUT /budgets/measurements/:id` parcial corrompe la medición y pone la **cantidad de la partida a 0**. [undefined→NULL]
- ⬜ **A4 · expenses/ai** — `POST /api/ai/analyze-expenses` filtra analítica de gastos de otras orgs. `ai.js:364`. Fix: `resolveProjectAccess`.
- ⬜ **A5 · suppliers** — `PUT /api/suppliers/:id` pone `is_active=NULL` en cada edición → **el proveedor desaparece de la lista**. `suppliers.js`. [undefined→NULL]
- ⬜ **A6 · files-plans** — Las anotaciones/mediciones de planos (columna JSON) vuelven como STRING → **el plano no dibuja nada** tras recargar. `plans.js`. Fix: `JSON.parse` al leer.
- ⬜ **A7 · notifications** — `GET /notifications/unread-count` devuelve **siempre 0** (badge de campana roto). `notifications.js`. Shim no soporta `{count,head}`.
- ⬜ **A8 · mailbox** — `GET /mailbox/unread-count` devuelve **siempre 0** (badge de buzón roto). `mailbox.js`.
- ⬜ **A9 · admin-settings** — IDOR: cualquiera lee/sobrescribe ajustes (empresa, logo, PDF) de cualquier org. `settings.js`. Fix: validar org contra el JWT.
- ⬜ **A10 · data-shim** — `.or()` no soporta grupos `and()/or()` ni operadores de 3 partes → **la Papelera del buzón (`/mailbox/trash`) revienta (500)**. `db/local.js`.

## MEDIOS
- ⬜ **M1 · auth** — Desactivar un usuario no corta su sesión activa (el middleware no revalida `is_active`; token deslizante casi eterno). `middlewares/auth.js`.
- ⬜ **M2 · certifications** — El auto-completar la obra al finalizar certificación es **código muerto** (columna `project_id`/`item_id` inexistentes). `certifications.js`.
- ⬜ **M3 · certifications** — Las protecciones de cert. finalizada se saltan revirtiendo a `draft` (sin validar transición) → se puede borrar una cert. facturada. `certifications.js`.
- ⬜ **M4 · workLogs** — `DELETE /work-logs/:id` da 500 (FK cruda) para cualquier parte ya certificado, en vez de 409. `workLogs.js`.
- ⬜ **M5 · materials** — El histórico de precios automático **nunca se guarda** (`effective_date` NOT NULL sin default, error tragado). `materials.js`.
- ⬜ **M6 · supplier-materials** — `PUT /supplier-materials/:id` parcial borra `notes` o rompe con NaN. `supplierMaterials.js:87`. [undefined→NULL]
- ⬜ **M7 · ai** — `POST /api/ai/corrections` da 500 cuando `corrected/wrong` es texto plano (columna JSON) → rompe el autoaprendizaje. `ai-corrections.js`.
- ⬜ **M8 · mailbox** — Abrir un mensaje no marca como leída su notificación (accessor JSON `->>` no soportado por el shim). `mailbox.js`.
- ⬜ **M9 · admin-settings** — `browse-directories`/`verify-path` sin rol admin ni confinamiento → enumerar disco del host y escribir en rutas arbitrarias. `settings.js`.

## BAJOS (500 con SQL crudo donde debería haber 400)
- ⬜ **B1 · auth** — `POST /login` sin `password` → 500 filtrando error interno de bcrypt.
- ⬜ **B2 · certifications** — `POST /certifications` permite sobre-certificar >100% (incoherente con el PUT que sí valida).
- ⬜ **B3 · certifications** — Estado inválido → 500 con nombre del constraint de BD (debería 400).
- ⬜ **B4 · expenses** — `date` vacía / `tax_amount` no numérico → 500 con SQL crudo.
- ⬜ **B5 · data-shim** — `.or()` parte por comas sin respetar comillas → búsqueda con coma da resultados vacíos erróneos.
