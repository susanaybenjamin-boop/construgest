# Backlog operativo CONSTRUGEST

> ## 📍 ESTADO ACTUAL — 2026-07-13
>
> **Fase 0 (extracción de esquema) TERMINADA.** Se creó la copia de trabajo
> `C:\Proyectos\Construgest` y se extrajo el esquema completo de Construgest desde
> Supabase (proyecto compartido "APP360") a [`docs/schema/`](schema/README.md):
> 60 tablas · 592 columnas · 174 constraints · 101 índices · 25 funciones RPC.
> Se montó la base del proyecto: `CLAUDE.md` (reglas para no repetir fallos de
> Benjagest) y este `backlog.md` (control).
>
> **PRÓXIMA SESIÓN — empezar por aquí:**
> 1. Leer esta cabecera + `CLAUDE.md` (reglas duras) + `docs/schema/README.md`.
> 2. **Decidir con Benjamin** (pendientes de la Fase 1): puerto de MariaDB en Docker,
>    y estrategia de git/ramas (el `origin` apunta al repo viejo).
> 3. **Arrancar Fase 1:** crear carpeta `database/` con `docker-compose.yml` (MariaDB)
>    + generar `database/schema.mariadb.sql` a partir del inventario. Levantar el
>    contenedor y VERIFICAR las tablas en DBeaver (regla nº1).
>
> **Recordatorio de las 3 reglas nº1 (detalle en `CLAUDE.md`):**
> ① ¿lo he VISTO funcionar? · ② no asumir, leer/grep antes de tocar · ③ pantalla por
> fichero (no repetir el God Object de Benjagest).

---

## 🔧 Config del proyecto (rellenar al decidirse)

- Puerto MariaDB (Docker): **por decidir** (≠ 3307 de Benjagest, p.ej. 3308).
- Nombre BD / usuario / password Docker: **por decidir**.
- Git: rama de trabajo y remoto: **por decidir** (no pushear al `origin` viejo sin confirmar).

---

## 🗺️ Ciclo de construcción por fases

Marcar `[x]` al terminar y VERIFICAR en ejecución. Cada fase se trocea en slices con
prefijo (ver `CLAUDE.md` §6).

### `[x]` FASE 0 — Extracción del esquema (nube)
- `[x]` Copia de trabajo limpia a `C:\Proyectos\Construgest`.
- `[x]` Esquema Construgest extraído a `docs/schema/` (inventario + raw + funciones RPC).
- `[x]` Base del proyecto: `CLAUDE.md` + `docs/backlog.md`.

### `[ ]` FASE 1 — Esquema MariaDB + entorno local (Docker + DBeaver)
- `[ ]` **DB-1** carpeta `database/` + `docker-compose.yml` (MariaDB, puerto propio).
- `[ ]` **DB-2** `database/schema.mariadb.sql`: CREATE TABLE equivalentes (tipos PG→MariaDB,
  COLLATE utf8mb4_unicode_ci, índices parciales→normales, CHECK).
- `[ ]` **DB-3** levantar contenedor + aplicar esquema + VERIFICAR en DBeaver.
- `[ ]` **DB-4** seeds mínimos (org/usuario de prueba) para poder arrancar la app.

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
