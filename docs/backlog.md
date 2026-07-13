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
> **FASE 2 EN CURSO — 13 de ~21 ficheros de ruta migrados** a `../db/local.js` y verificados.
> El shim (`backend/src/db/local.js`) ya maneja: select/insert/update/delete/upsert, eq/neq/
> gt/gte/lt/lte/is/in/like/ilike/or/not, order/limit/single/maybeSingle, RETURNING (insert/
> delete), update&upsert+select vía re-SELECT, normalización fechas ISO→DATETIME y objetos→JSON,
> y **selects anidados** `alias:tabla(...)`. Migrar ruta = cambiar su import.
>
> **PRÓXIMA SESIÓN — empezar por aquí (quedan 8 rutas, 2 subsistemas nuevos):**
> 1. Leer esta cabecera + `CLAUDE.md`. Arrancar: `docker compose up -d`.
>    Tras editar backend: `docker compose up -d --build backend`.
> 2. **Oleada 3 — STORAGE:** crear capa de ficheros en disco (reemplaza `supabase.storage`) y
>    migrar `settings`, `projects`, `expenses`, `mailbox`.
> 3. **Oleada 4 — RPC:** reimplementar las 25 funciones (fuente en `docs/schema/raw/`) + `.rpc()`
>    en el shim; migrar `equipmentCatalog`, `subcontractors`, `workers`. Luego `ai.js` + servicios.
> 4. Para verificar budgets/workLogs/certifications a fondo hace falta seed de un proyecto+presupuesto.
> 5. Cuando esté todo probado: merge `feat/benjamin` → `develop`.
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
  embeds `supplier{}`/`material{}`). workLogs/certifications: falta seed proyecto para datos.
- `[ ]` **DATA-3 (oleada 3) — STORAGE** (ficheros Supabase → disco local). Rutas: `settings`,
  `projects`, `expenses`, `mailbox`. Necesita una capa de almacenamiento en disco que
  reemplace `supabase.storage` (subir/descargar/borrar/signed-url). Reusar `localApi`/`syncService`.
- `[ ]` **DATA-3 (oleada 4) — RPC** (reimplementar las 25 funciones en Node; fuente en
  `docs/schema/raw/rpc-functions.postgres.sql`). Rutas: `equipmentCatalog` (además anidado),
  `subcontractors`, `workers`. Añadir `.rpc(nombre, params)` al shim que despache a las
  reimplementaciones.
- `[ ]` Revisar `ai.js` + `services/mcp-ai-tracker.js`, `notificationService.js`,
  `realtimeBroadcast.js` (aún importan Supabase).

**Migradas hasta ahora (13 ficheros de ruta + middleware):** auth, suppliers, notifications,
plans, ferrapp, admin, branches, library, budgets, materials, supplierMaterials, workLogs,
certifications + middlewares/auth.js. **Pendientes:** settings, projects, expenses, mailbox,
equipmentCatalog, subcontractors, workers, ai.

### `[ ]` FASE 3 — Storage y Realtime locales
- `[ ]` **ST-1** ficheros (`construgest-files`) → disco local (reusar `localApi`/`syncService`).
- `[ ]` **RT-1** Realtime (9 tablas) → polling o WebSocket propio.

### `[ ]` FASE 4 — IA
- `[ ]` decidir: mantener Anthropic/Groq/Gemini (nube, requiere internet+API key) o modelo local.

### `[ ]` FASE 5 — Empaquetado autocontenido (LO ÚLTIMO)
- `[ ]` instalable Windows: Node + Next + MariaDB embebida, "doble clic". `.msi` SOLO aquí.

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
