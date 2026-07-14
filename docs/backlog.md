# Backlog operativo CONSTRUGEST

> ## 📍 ESTADO ACTUAL — 2026-07-13
>
> **FASE 0 y FASE 1 COMPLETAS.** Entorno local Docker + MariaDB con esquema y seed.
> - Repo GitHub **privado** `susanaybenjamin-boop/construgest`. Ramas: trabajo en
>   **`feat/benjamin`** → merge `--no-ff` a `develop` al probar.
> - `docker-compose.yml`: **MariaDB 11.4 puerto 3308** + **backend Node puerto 5000**.
>   El backend ya apunta a la MariaDB local y a **Ollama del host** (IA local).
> - **`database/init/`**: `01_schema.sql` (59 tablas) + `02_seed.sql` + `03_seed_demo.sql`.
>
> **FASE 2 (capa de datos) COMPLETA — 20/21 rutas migradas** a `../db/local.js`. El shim maneja
> select/insert/update/delete/upsert, todos los filtros, RETURNING, selects anidados (en select y
> en mutación), storage en disco y `.rpc()`. (`ai.js` no va a MariaDB: la IA se reescribió a local.)
>
> **FASE 4 (IA LOCAL) MUY AVANZADA — la IA ya es 100% local, sin nube ni Supabase.**
> - **Motor:** `services/ai-service.js` reescrito a local puro (Ollama, `qwen2.5:3b`). `callAI()`
>   igual que antes pero solo local; caché en memoria; `tryLocal` con `num_predict≤2048`.
> - **Extracción** (`extract-materials`): Capa 1 determinista (regex code/precio/unidad, normaliza
>   nº ES) + LLM de refuerzo (`services/extraction.js`). Fiable y consistente.
> - **OCR** (`parse-budget-pdf`): 100% local, `services/local-ocr.js` (pdftoppm+tesseract `spa`);
>   texto-primero, OCR-fallback. Tesseract+poppler instalados en la imagen (Dockerfile).
> - **Chat eliminado.** Sin cuotas/pricing/consumo en el motor.
>
> **PRÓXIMA SESIÓN — empezar por aquí:**
> 1. Leer esta cabecera + `CLAUDE.md`. **Requisito nuevo del entorno:** tener **Ollama corriendo en
>    el host** con el modelo `qwen2.5:3b` (`ollama pull qwen2.5:3b`). Arrancar: `docker compose up -d`.
>    Tras editar backend: `docker compose up -d --build backend`.
> 2. **Análisis de presupuestos (AI-2, el grueso):** el 3B alucina números → rediseñar las ~16 skills
>    de `routes/ai.js` para **CALCULAR en código** (Capa 1: varianzas, totales, duplicados, outliers)
>    y dejar al LLM solo el texto narrativo. Empezar por `analyze-budget`/`suggest-optimizations`.
>    Receta de prompt (probada): sin frase "responde []"; ejemplos realistas (no placeholders);
>    códigos por regex.
> 3. **AI-4 autoaprendizaje:** tabla local de correcciones + few-shot + fuzzy-match de catálogo.
> 4. **Follow-up limpieza (AI-5):** desmantelar el panel admin de IA (`routes/admin.js` +
>    `services/mcp-ai-tracker.js` + frontend) y la UI de claves-cloud en `settings.js` (aún usan
>    Supabase/SDKs de nube). Al ser IA local/gratis, sobra.
> 5. **Fase 3** (Realtime → polling; `notificationService`/`realtimeBroadcast`) y **Fase 5**
>    (empaquetado `.msi`: MariaDB + Node + Next + **Ollama+modelo** + **tesseract+poppler**).
>
> **Recordatorio de las 3 reglas nº1 (detalle en `CLAUDE.md`):**
> ① ¿lo he VISTO funcionar? · ② no asumir, leer/grep antes de tocar · ③ pantalla por
> fichero (no repetir el God Object de Benjagest).

---

## 🔧 Config del proyecto (decidido 2026-07-13)

- **MariaDB (Docker):** puerto host **3308** → 3306 contenedor. BD `construgest`,
  usuario `construgest` / pass `construgest`, root pass `construgest_root`. Solo dev local.
- **Backend (Docker):** puerto **5000**. Único backend (se dejó de usar el de VS Code).
  Imagen: `node:22-alpine` + **tesseract-ocr + tesseract-ocr-data-spa + poppler-utils** (OCR local).
- **IA local (Ollama):** corre en el **HOST** (no en Docker). El backend lo alcanza por
  `OLLAMA_HOST=http://host.docker.internal:11434`. Modelo `OLLAMA_MODEL=qwen2.5:3b`
  (`ollama pull qwen2.5:3b`). `AI_PROVIDER_ORDER=local` (100% local; sin claves cloud).
  **Requisito para arrancar el entorno:** Ollama instalado y el modelo descargado.
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
  · `[x]` **MOTOR determinista compartido** `services/budget-analytics.js` (Capa 1): recibe el
    presupuesto (shape del frontend) y calcula TODO sin IA — totales/capítulo, %, métricas,
    incidencias (sin valorar, sin cantidad, capítulos vacíos, duplicados por Jaccard, descripciones
    vagas, descuadre) y sugerencias. Verificado con datos reales del `Presupuesto_v1`.
  · `[x]` **`detect-issues`** reescrita: 100% motor (SIN LLM) → determinista e instantánea.
    VERIFICADO e2e (curl): detecta 02.04 sin valorar + capítulo 06 vacío.
  · `[x]` **`analyze-budget`** reescrita: cifras del motor + LLM local SOLO para el resumen
    (`{"resumen":...}`, con fallback sin IA). VERIFICADO e2e: total/riesgo/confianza exactos,
    resumen usa solo cifras reales (0% alucinación), ~22s. optimizations=[] a propósito (necesita
    base de precios). **PRINCIPIO (Benjamin):** una skill sin TOOLS/datos es prosa vacía → cada
    skill se apoya en su tool (motor, base de precios empaquetable, catálogo, OCR).
  · `[ ]` **Resto de skills sobre el motor:** `suggest-optimizations`, `compare-prices`,
    `estimate-contingency`, `executive-report` (reusar `budget-analytics`), + `compare-budgets`
    (nueva, pantalla budget-comparison), `find-similar` (biblioteca), `analyze-materials`,
    `analyze-expenses`, `analyze-certifications`. **Cortar** las sin pantalla: estimate-timeline,
    analyze-schedule, analyze-plans, analyze-annotations, detect-errors, validate-specifications.
  · `[ ]` **TOOL pendiente:** base de precios de referencia (empaquetable) para las skills de
    optimización/mercado/contingencia — sin ella devuelven [] a propósito.
- `[x]` **AI-3 (OCR local) HECHO y VERIFICADO e2e.** `services/local-ocr.js` (pdftoppm→PNG→tesseract
  `spa`). `parseBudgetWithVision` reescrita: Vision-nube → **OCR local** + `parseBudgetFromText`
  (reusa algorítmico + LLM local). Ruta `parse-budget-pdf`: **texto primero** (rápido), OCR fallback
  (lento). Dockerfile: `apk add tesseract-ocr tesseract-ocr-data-spa poppler-utils`. `tryLocal` con
  **tope de generación** `num_predict≤2048` (en CPU sin tope una llamada tarda minutos — visto colgar).
  VERIFICADO: PDF escaneado (imagen) → OCR 307 chars en ~3s → 2 capítulos y 4 partidas correctas
  (códigos/unidades/cantidades/precios), 100% offline. Total ~104s (el peor caso, escaneado).
  · PENDIENTE Fase 5: en el `.msi` Windows hay que empaquetar tesseract+poppler (o WASM); ahora solo
    están en la imagen Docker Linux.
- `[ ]` **AI-4:** bucle de correcciones (tabla local + few-shot + fuzzy-match de catálogo).
- `[~]` **AI-5 (limpieza del motor) HECHO; queda el panel admin.**
  · `[x]` `ai-service.js` reescrito a **local puro** (730→~185 líneas): fuera SDKs de nube
    (Anthropic/Groq/Gemini), claves por org, pricing, logging de consumo, cuotas y el import de
    Supabase. Solo queda caché + `tryLocal` (Ollama) + `parseAIResponse`. VERIFICADO: arranca
    limpio, extract-materials sigue OK, sin regresiones. (Las deps npm de los SDK se dejan porque
    `settings.js` aún las usa para probar claves → se quitan con la limpieza de settings.)
  · `[ ]` **Follow-up:** desmantelar el panel admin de IA (`routes/admin.js` usa `mcp-ai-tracker` +
    `cons_ai_consumption`/`cons_ai_pricing`/quotas, todo Supabase) + su frontend, y borrar
    `services/mcp-ai-tracker.js`. Al ser IA local/gratis ese panel entero sobra.
- `[x]` **AI-6 (quitar chat) HECHO.** Eliminado `POST /api/ai/chat`. No había UI de chat en el
  frontend (0 referencias). VERIFICADO: `/api/ai/chat` → 404, resto de la IA intacto.

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
