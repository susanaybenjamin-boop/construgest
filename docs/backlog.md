# Backlog operativo CONSTRUGEST

> ## 📍 ESTADO ACTUAL — 2026-07-13
>
> **FASE 0 y FASE 1 COMPLETAS y verificadas.** Entorno local Docker + MariaDB con esquema y seed.
> - Repo GitHub **privado** `susanaybenjamin-boop/construgest`. Ramas: trabajo en
>   **`feat/benjamin`** → merge `--no-ff` a `develop` al probar. **Los `git push` los hace
>   Benjamin** (el guardarraíl de Claude Code los bloquea por señal de visibilidad cacheada).
> - `docker-compose.yml`: **MariaDB 11.4 puerto 3308** + **backend Node puerto 5000**.
> - **`database/init/`**: `01_schema.sql` (59 tablas) + `02_seed.sql` (org + usuario
>   `admin@construgest.local` / `construgest`). Todo verificado en ejecución.
>
> **FASE 2 COMPLETA (rutas de dominio) — 20 de ~21 ficheros migrados** a `../db/local.js` y
> verificados. Solo queda `ai.js` (+ servicios IA/realtime), que pertenece a Fase 3/4.
> El shim (`backend/src/db/local.js`) ya maneja: select/insert/update/delete/upsert, eq/neq/gt/
> gte/lt/lte/is/in/like/ilike/or/not, order/limit/range/single/maybeSingle, RETURNING (insert/
> delete), update&upsert+select vía re-SELECT, normalización fechas ISO→DATETIME y objetos→JSON,
> selects anidados `alias:tabla(...)` (en select Y en mutación insert/update/delete/upsert+select),
> columnas reservadas entrecomilladas, **storage en disco** (`db/storage.js` + `/api/files`) y
> **`.rpc(nombre, params)`** (despacha a `db/rpc.js`). Migrar ruta = cambiar su import.
>
> **PRÓXIMA SESIÓN — empezar por aquí (Fase 2 de rutas HECHA):**
> 1. Leer esta cabecera + `CLAUDE.md`. Arrancar: `docker compose up -d`.
>    Tras editar backend: `docker compose up -d --build backend`.
> 2. **Merge `feat/benjamin` → `develop`** (`--no-ff`): toda la capa de datos de rutas está
>    migrada y probada en ejecución.
> 3. **Fase 4 — IA LOCAL (EN CURSO):** decidido migrar a IA 100% local (Ollama + modelo 3B,
>    portátil i5/8GB sin GPU, SIN chat). Spike AI-0 en marcha: probar `qwen2.5:3b` con
>    `extract-materials`. Ver el plan completo en la sección FASE 4. Las RPC de cuotas de IA
>    **ya no se reimplementan** (sobran al ser local). `notificationService`/`realtimeBroadcast`
>    → Fase 3 (Realtime → polling).
> 4. Fase 3 (Realtime) y Fase 5 (empaquetado `.msi` con Ollama + modelo embebidos).
>
> **Recordatorio de las 3 reglas nº1 (detalle en `CLAUDE.md`):**
> ① ¿lo he VISTO funcionar? · ② no asumir, leer/grep antes de tocar · ③ pantalla por
> fichero (no repetir el God Object de Benjagest).

---

## 🔧 Config del proyecto (decidido 2026-07-13)

- **MariaDB (Docker):** puerto host **3308** → 3306 contenedor. BD `construgest`,
  usuario `construgest` / pass `construgest`, root pass `construgest_root`. Solo dev local.
- **Backend (Docker):** puerto **5000**. Único backend (se dejó de usar el de VS Code).
- **Git:** repo NUEVO independiente (sin remoto aún). Ramas: **`feat/benjamin`** (trabajo)
  → merge `--no-ff` a **`develop`** cuando esté PROBADO; `main` = estable (releases, luego).
  No usar el `origin` de construgest-web.

---

## 🗺️ Ciclo de construcción por fases

Marcar `[x]` al terminar y VERIFICAR en ejecución. Cada fase se trocea en slices con
prefijo (ver `CLAUDE.md` §6).

### `[x]` FASE 0 — Extracción del esquema (nube)
- `[x]` Copia de trabajo limpia a `C:\Proyectos\Construgest`.
- `[x]` Esquema Construgest extraído a `docs/schema/` (inventario + raw + funciones RPC).
- `[x]` Base del proyecto: `CLAUDE.md` + `docs/backlog.md`.

### `[x]` FASE 1 — Esquema MariaDB + entorno local (Docker + DBeaver)
- `[x]` **DB-1** carpeta `database/` + `docker-compose.yml` (MariaDB 3308 + backend 5000).
  VERIFICADO: ambos contenedores Up, BD creada, backend responde y ve a MariaDB.
- `[x]` **DB-2** `database/init/01_schema.sql`: 59 tablas traducidas PG→MariaDB
  (uuid→CHAR(36) DEFAULT uuid(), timestamptz→DATETIME(3), jsonb/arrays→JSON, CHECK IN(...),
  índices parciales→normales, COLLATE utf8mb4_unicode_ci, nextval→AUTO_INCREMENT).
  Generado con script determinista desde `docs/schema/raw/`.
- `[x]` **DB-3** aplicado y VERIFICADO en ejecución: 59 tablas · 67 FKs · 39 CHECKs · 128 índices.
  Probada la autocarga desde cero (`down -v && up -d` → 59 tablas). **Falta: que Benjamin lo
  MIRE en DBeaver** (localhost:3308, construgest/construgest).
- `[x]` **DB-4** seed mínimo (`database/init/02_seed.sql`): org "Construgest (demo)" + usuario
  `admin@construgest.local` / `construgest` (owner). VERIFICADO: JOIN user→member→org OK y
  bcrypt valida la contraseña correcta / rechaza la incorrecta. (VIEW `mcp_users_view` fuera.)

**➡️ FASE 1 COMPLETA.** Merge `feat/benjamin` → `develop`.

### `[~]` FASE 2 — Capa de datos MariaDB (backend), ruta por ruta
- `[x]` **DATA-0** cliente `mysql2` (`backend/src/db/mariadb.js`, pool con typeCast TINYINT→bool y
  timezone UTC) + **shim compatible con Supabase** (`backend/src/db/local.js`): `.from/.select/
  .insert/.update/.delete/.eq/.neq/.gt/.gte/.lt/.lte/.is/.in/.like/.ilike/.order/.limit/.single/
  .maybeSingle`, awaitable, devuelve `{data,error}`, insert/update+select vía RETURNING. Migrar
  = cambiar el import de una ruta a `../db/local.js` (sin reescribir llamadas).
- `[x]` **DATA-1** `auth.js` migrado y VERIFICADO con curl: login OK/401/401, register 201
  (INSERT RETURNING), /me 200. (Shim aún NO soporta: selects anidados `tabla(...)`, `.or()`,
  `.rpc()`, `.storage` → se amplían cuando una ruta lo pida.)
- `[x]` **DATA-2** `suppliers.js` migrado y VERIFICADO con curl (CRUD completo: crear/listar/
  obtener/editar/soft-delete + filtro activos/todos). Al hacerlo se arreglaron **2 bugs
  sistémicos del shim** (aplican a todas las rutas):
    · MariaDB NO tiene `UPDATE ... RETURNING` → update+`.select()` se resuelve con un SELECT
      posterior con los mismos filtros.
    · Normalización de valores (`normVal`): fechas ISO `...T..Z`/Date → DATETIME MariaDB (UTC),
      objetos/arrays → JSON. (Antes petaba `Incorrect datetime value`.)
  Nota: `authMiddleware` es solo-JWT (no toca BD); las funciones de acceso a proyecto de
  `middlewares/auth.js` SÍ usan Supabase y habrá que migrarlas al tocar budgets/workLogs/etc.
- `[x]` **DATA-3 (oleada 1)** migradas: `notifications`, `plans`, `ferrapp`, `admin`, `branches`,
  `library`, `budgets` + las funciones de acceso a proyecto de `middlewares/auth.js`. Shim
  ampliado con `.upsert` (INSERT..ON DUPLICATE KEY UPDATE), `.or('col.op.val,...')` y
  `.not(col,'is',null)`. VERIFICADO: endpoints de lectura 200; `.or` (branches invitations,
  library search), `.upsert` (etiquetas ferrapp), `.not` (library chapters). budgets/plans:
  la capa de acceso ya va a MariaDB (403 correcto sin proyecto); falta seed de proyecto/
  presupuesto para verificar sus DATOS a fondo.
- `[x]` **DATA-3 (oleada 2)** shim: **resolver de selects anidados** `alias:tabla(cols, nested:...)`
  por FK convencional `alias_id` (recursivo). Migradas: `materials`, `supplierMaterials`,
  `workLogs`, `certifications`. VERIFICADO con datos reales (supplier-materials devuelve
  embeds `supplier{}`/`material{}`). Fix: el parser de anidados ahora tolera espacios/saltos
  de línea antes del `(` (selects multilínea).
- `[x]` **Seed demo + verificación budgets/workLogs/certifications.** `database/init/03_seed_demo.sql`
  (proyecto + presupuesto completo + parte + certificación). VERIFICADO con datos reales:
  budgets `/project/:id` y `/:id/full` (capítulos→partidas→mediciones); workLogs 6 endpoints
  GET 200; certifications 5 endpoints GET 200 (incl. `/:id/summary` con anidado multilínea).
- `[x]` **DATA-3 (oleada 3) — STORAGE** hecha y verificada. `db/storage.js` (capa de ficheros en
  disco compatible con `supabase.storage`: upload/update/download/remove/createSignedUrl(s)) +
  `routes/files.js` (sirve `/api/files/:bucket/*splat`) + volumen Docker `construgest_files:/data`.
  Rutas migradas: `settings`, `projects`, `expenses`, `mailbox`. Shim: +`.range()` + entrecomillado
  de columnas reservadas (key/value/date...). VERIFICADO e2e: subir recibo→disco→URL firmada→
  recuperar contenido; projects/settings/mailbox 200; sin regresiones.
- `[x]` **DATA-3 (oleada 4) — RPC** hecha y VERIFICADA con curl. `db/rpc.js` reimplementa en Node
  las 21 funciones `rpc_*` de equipment/workers/subcontractors/sub_documents (fuente
  `docs/schema/raw/rpc-functions.postgres.sql`) + `.rpc(nombre,params)` en el shim que despacha ahí.
  Migradas `equipmentCatalog`, `subcontractors`, `workers`. VERIFICADO e2e (login→CRUD): workers
  (incl. `certifications` JSON hidratado a array, `is_subcontracted` booleano); subcontractors +
  documentos PRL + `expiring` (JOIN) + `specialties` (DISTINCT); equipment + `categories` + link de
  material (insert + select ANIDADO). **Al hacerlo se amplió el shim**: `insert/update/delete/upsert
  + .select(anidado)` (antes lanzaba "no soportado"); insert/delete vía `RETURNING`, update/upsert
  vía re-SELECT, y en todos se resuelven los embeds. Sin regresiones en rutas previas.
  · NOTA (deuda sistémica del shim, no bloqueante): las columnas `DATE` vuelven como Date de mysql2
    y `res.json` las serializa a ISO con hora (p.ej. `hire_date: "2026-01-15T00:00:00.000Z"`), no
    `"2026-01-15"` como la nube. Aplica a TODAS las rutas con DATE; si molesta en UI, poner
    `dateStrings: ['DATE']` en el pool y re-verificar las rutas ya migradas.
- `[ ]` **Servicios que aún importan Supabase** (Fase 3/4): `services/ai-service.js`,
  `notificationService.js`, `realtimeBroadcast.js`, `mcp-ai-tracker.js` + ruta `ai.js`. OJO: la IA
  va a **local** (ver Fase 4) → `ai-service.js`/`ai.js` se reescriben, no se migran a MariaDB tal
  cual; `mcp-ai-tracker.js` y las RPC de cuotas se **eliminan** (sobran al ser local y gratis).

**Migradas (20 ficheros de ruta + middleware):** auth, suppliers, notifications, plans, ferrapp,
admin, branches, library, budgets, materials, supplierMaterials, workLogs, certifications,
settings, projects, expenses, mailbox, equipmentCatalog, subcontractors, workers +
middlewares/auth.js. **Pendiente (1):** ai.js (+ servicios IA/realtime → Fase 3/4).

### `[ ]` FASE 3 — Storage y Realtime locales
- `[ ]` **ST-1** ficheros (`construgest-files`) → disco local (reusar `localApi`/`syncService`).
- `[ ]` **RT-1** Realtime (9 tablas) → polling o WebSocket propio.

### `[~]` FASE 4 — IA LOCAL (decidido 2026-07-13)
**Objetivo:** IA **100% local, sin internet** (coherente con autocontenido). Portátil i5,
**8 GB RAM, sin GPU** → modelo pequeño **3B** (un 7B se ahoga con SO+Node+MariaDB). Motor
**Ollama** (ya instalado en el portátil); para el `.msi` final el instalador desplegará
Ollama + `pull` del modelo. **SIN chat** (se elimina `/api/ai/chat`). Funciones a conservar:
extraer materiales, importar presupuestos PDF (OCR), análisis de presupuestos + cálculos.

Arquitectura en 3 capas (la IA es solo una): **(1) código determinista** para cálculos/
comparaciones/duplicados/totales (rápido y exacto, sin IA) · **(2) LLM local pequeño**
(Qwen2.5-3B con JSON forzado `format:json`) solo para lo lingüístico/borroso · **(3) OCR**
con pdfjs (PDF digital) + Tesseract (escaneado) + parsers BC3/PZH existentes (sin visión-LLM).

"Autoaprendizaje silencioso" = NO reentrenar el modelo (inviable en esa HW), sino bucle de
**memoria de correcciones** + few-shot con las correcciones del usuario + fuzzy-match contra
el catálogo propio. Mejora con el uso, local y sin internet.

- `[x]` **AI-0 (spike) HECHO y VERIFICADO en el portátil real** (i5/8GB, `qwen2.5:3b` ya instalado,
  Ollama 0.31.2). Extracción de una lista de proveedor "sucia" (13 materiales + subtotal + basura):
    · **JSON siempre válido** (`format:json`), decimales ES normalizados (4,85→4.85), subtotal y
      filas sin precio ignorados correctamente. Calidad de extracción alta.
    · **Velocidad: ~10-11 tok/s, ~50-65s por lista** en CPU sin GPU (carga en caliente 0.3s). OK
      para importación por lotes con barra de progreso; NO instantáneo. Listas grandes → minutos.
    · **Debilidades del 3B (esperadas):** el modelo paró en la línea SUBTOTAL (se dejó 3 materiales
      posteriores) AUNQUE se le instruyó lo contrario; e inconsistencia run-to-run (una pasada
      omitió TODOS los códigos). → **Confirmada la arquitectura de 3 capas:** pre-limpiar subtotales/
      separadores en código recuperó los materiales; los códigos (patrón `XXX-999`) los debe sacar
      un regex, no el LLM. El LLM solo para lo borroso. Correction-loop para cazar los fallos.
  **VEREDICTO: 3B local es VIABLE para extracción en el portátil, con el andamiaje de código
  alrededor.** El coste es la latencia (lotes, no interactivo). Seguir con AI-1.
- `[x]` **AI-1 (opción aditiva) HECHO y VERIFICADO e2e.** Añadido proveedor `tryLocal()` (Ollama)
  a `services/ai-service.js`, **primero** en `providerOrder`; por defecto **100% local**
  (`AI_PROVIDER_ORDER=local` en docker-compose). En modo local se **salta todo el preámbulo nube**
  (claves/cuotas/pricing/logging en Supabase) → funciona offline. La nube queda detrás del flag como
  red de seguridad (se borra en AI-5). Env: `OLLAMA_HOST` (default `host.docker.internal:11434`,
  verificado que el contenedor alcanza el Ollama del host), `OLLAMA_MODEL` (default `qwen2.5:3b`).
  VERIFICADO: login→`/api/ai/extract-materials`→Ollama→JSON, sin tocar Supabase, sin regresiones.
    · **IMPORTANTE (hallazgo):** NO usar `format:'json'` de Ollama → colapsa a UN objeto y rompe las
      skills que devuelven array. Se quitó; se usa `parseAIResponse()` como con la nube.
    · **Los prompts actuales (escritos para la nube) NO le sientan bien al 3B** → es el trabajo de
      AI-2, no de AI-1. Receta encontrada por bisección: (a) QUITAR la frase "si no encuentras…,
      responde: []" (el 3B la sobre-activa y devuelve `[]`); (b) usar **ejemplos realistas** en el
      prompt, no placeholders tipo "REF001"/"Descripción clara" (provocan alucinaciones, incl. texto
      en chino); (c) sacar los **códigos por regex** (Capa 1), no pedirlos al modelo.
- `[~]` **AI-2 EN CURSO.**
  · `[x]` **Extracción (`extract-materials`)** HECHA y verificada (ver `services/extraction.js`):
    parser determinista Capa 1 (code/precio/unidad por regex, normaliza nº ES, no pierde filas) +
    LLM de refuerzo fusionado por precio. 5/5 consistente. Robusto a caída del LLM.
  · `[ ]` **Skills de ANÁLISIS de presupuestos** (16). HALLAZGO verificado: el 3B **parrotea los
    placeholders del ejemplo y ALUCINA números** (analyze-expenses devolvió `budget_total:200000`
    copiado del ejemplo; varianza mal). Las de array (suggest-optimizations…) devuelven `[]` por la
    frase de fallback. → **No basta afinar prompts: hay que CALCULAR en código (Capa 1)** (varianzas,
    totales, duplicados, outliers de precio) y dejar al LLM solo el texto narrativo. Rediseño por
    skill = el grueso del trabajo restante.
- `[ ]` **AI-3:** OCR local (Tesseract) para PDFs escaneados; mantener pdfjs + BC3/PZH.
- `[ ]` **AI-4:** bucle de correcciones (tabla local + few-shot + fuzzy-match de catálogo).
- `[ ]` **AI-5:** eliminar maquinaria de coste/cuotas (mcp-ai-tracker, cons_ai_pricing,
  cons_ai_consumption, quotas). **Ya NO se reimplementan las RPC `mcp_check_quota`/
  `mcp_check_and_record_usage`** (sobran al ser local y gratis).
- `[ ]` **AI-6:** eliminar chat (`/api/ai/chat` + UI del chat).

### `[ ]` FASE 5 — Empaquetado autocontenido (LO ÚLTIMO)
- `[ ]` instalable Windows: Node + Next + MariaDB embebida **+ Ollama + modelo 3B**, "doble
  clic". El instalador despliega Ollama y hace `pull` del modelo. `.msi` SOLO aquí.

---

## ✅ Checklist de cierre de slice (no repetir fallos de Benjagest)

Antes de marcar un slice como hecho:
1. **¿Lo he VISTO funcionar?** (no solo compila) — smoke del camino tocado.
2. **¿Asumí algo?** — leído/grepeado antes de tocar; callers actualizados.
3. **¿Quedó algún fichero enorme?** — trocear pantalla/ruta a componentes/servicios.
4. **¿Auto-refresh?** — invalidar las queries afectadas (React Query).
5. **¿Estilos e i18n intactos?** — no tocar CSS; no hardcodear donde ya hay `t()`.
6. **Commit pequeño** con co-author + actualizar este backlog.

---

## 🕓 Histórico

### [HIST] 2026-07-13 — Arranque del proyecto
- Revisión completa de `construgest-web` (nube: Node + Next + Supabase).
- Decisión: migrar a **local con MariaDB**, autocontenido como Benjagest; dev con
  Docker + DBeaver; `.msi` solo al final; pantalla por fichero (no God Object).
- Hallazgo: la BD Supabase "APP360" está COMPARTIDA con otras apps → migrar solo
  `cons_*`/`ferrapp_*`/`mcp_*`.
- Fase 0 completada (esquema en `docs/schema/`). Creados `CLAUDE.md` y este backlog.
