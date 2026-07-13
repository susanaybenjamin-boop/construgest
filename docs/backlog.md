# Backlog operativo CONSTRUGEST

> ## 📍 ESTADO ACTUAL — 2026-07-13
>
> **Fase 0 HECHA** + entorno Docker (DB-1) + **esquema MariaDB creado y verificado (DB-2/DB-3).**
> - Repo NUEVO independiente. Ramas: trabajo en **`feat/benjamin`** → merge `--no-ff` a
>   `develop` al probar. Secretos verificados como ignorados (incl. clave Google).
> - `docker-compose.yml`: **MariaDB 11.4 puerto 3308** + **backend Node puerto 5000**.
> - **`database/init/01_schema.sql`: 59 tablas** (67 FKs, 39 CHECKs, 128 índices), traducidas
>   de Postgres. Aplicado y verificado en ejecución; autocarga desde cero probada.
> - Falta que Benjamin lo mire en **DBeaver** (localhost:3308, construgest/construgest).
>
> **PRÓXIMA SESIÓN — empezar por aquí:**
> 1. Leer esta cabecera + `CLAUDE.md`. Arrancar: `docker compose up -d`.
> 2. **DB-4:** crear `database/init/02_seed.sql` con una organización + un usuario de
>    prueba (para poder arrancar la app en local). Verificar insertándolo y consultándolo.
> 3. Cerrar Fase 1: merge `feat/benjamin` → `develop`. Luego **Fase 2** (capa de datos
>    `mysql2` + ayudante, migrar rutas una a una apuntando el backend a la MariaDB local).
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

### `[~]` FASE 1 — Esquema MariaDB + entorno local (Docker + DBeaver)
- `[x]` **DB-1** carpeta `database/` + `docker-compose.yml` (MariaDB 3308 + backend 5000).
  VERIFICADO: ambos contenedores Up, BD creada, backend responde y ve a MariaDB.
- `[x]` **DB-2** `database/init/01_schema.sql`: 59 tablas traducidas PG→MariaDB
  (uuid→CHAR(36) DEFAULT uuid(), timestamptz→DATETIME(3), jsonb/arrays→JSON, CHECK IN(...),
  índices parciales→normales, COLLATE utf8mb4_unicode_ci, nextval→AUTO_INCREMENT).
  Generado con script determinista desde `docs/schema/raw/`.
- `[x]` **DB-3** aplicado y VERIFICADO en ejecución: 59 tablas · 67 FKs · 39 CHECKs · 128 índices.
  Probada la autocarga desde cero (`down -v && up -d` → 59 tablas). **Falta: que Benjamin lo
  MIRE en DBeaver** (localhost:3308, construgest/construgest).
- `[ ]` **DB-4** seeds mínimos (`database/init/02_seed.sql`): organización + usuario de prueba.
  Nota: la VIEW `mcp_users_view` quedó fuera (hacerla aparte si hace falta).

### `[ ]` FASE 2 — Capa de datos MariaDB (backend), ruta por ruta
- `[ ]` **DATA-0** cliente MariaDB (`mysql2`) + ayudante para no reescribir 588 llamadas a mano.
- `[ ]` **DATA-n** migrar cada ruta de `backend/src/routes/` (una por slice), verificando con `curl`.
- `[ ]` reimplementar las 25 funciones RPC en Node.

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
