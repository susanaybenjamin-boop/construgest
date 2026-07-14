# Esquema de Construgest — Fase 0 (extracción)

Extraído del proyecto Supabase **APP360** (`qexnthgfdvtvwoeykgun`, Postgres 17) el **2026-07-13**,
como primer paso de la migración *nube → local (MariaDB)*.

## Hallazgo clave: la BD de la nube está COMPARTIDA

El proyecto Supabase aloja ~200 tablas de **varias apps** de Benjamín. Construgest es solo un
subconjunto. Aquí se ha extraído **exclusivamente** lo de Construgest:

| Bloque | Prefijo | Nº tablas | Qué es |
|---|---|---|---|
| Construgest | `cons_*` | 52 | Núcleo de la app |
| ~~Ferrapp~~ | ~~`ferrapp_*`~~ | ~~2~~ | **ELIMINADO 2026-07-14** — el módulo de ferralla se quitó (no encajaba en el producto). Esta fila queda como registro de la extracción original. |
| IA / cuotas | `mcp_*` | 6 (1 vista) | Seguimiento de consumo de IA |

Todo lo demás (`*_180` = app fiscal/contable tipo CONTENDO, y tablas sueltas de otra app)
**se ignora**: no es de Construgest y no se toca.

## Qué hay en esta carpeta

- **`construgest-db-inventory.md`** — inventario legible: 60 tablas, 592 columnas, con tipo
  Postgres, nullabilidad, default, la traducción propuesta a MariaDB, y sus constraints e índices.
- **`raw/columns.json`** — volcado crudo de columnas (`information_schema`).
- **`raw/constraints.json`** — PK / FK / UNIQUE / CHECK (174).
- **`raw/indexes.json`** — índices no-constraint (101).
- **`raw/rpc-functions.postgres.sql`** — código PL/pgSQL de las 25 funciones RPC (referencia).

## Cifras

- **60** tablas · **592** columnas · **174** constraints · **101** índices.
- **25** funciones RPC (equipos, subcontratistas, documentos, trabajadores + 2 de cuotas IA).
- **9** tablas con Realtime: `cons_projects`, `cons_budgets`, `cons_chapters`, `cons_budget_items`,
  `cons_measurements`, `cons_price_breakdown`, `cons_branch_links`, `cons_branch_invitations`,
  `cons_branch_project_visibility`.
- **1** bucket de Storage nuestro: `construgest-files` (privado).

## Puntos calientes para la migración a MariaDB

1. **UUID (159 columnas).** Postgres genera el `id` con `gen_random_uuid()`. En MariaDB → `CHAR(36)`
   y el UUID lo genera **el backend** (ya se usa `uuid` en Node) al insertar. Revisar defaults
   `gen_random_uuid()` en `columns.json`.
2. **timestamptz (83 columnas).** MariaDB no guarda zona horaria → usar `DATETIME(3)` y **guardar en
   UTC** por convención. Defaults `now()` → `CURRENT_TIMESTAMP(3)`.
3. **jsonb (9) y arrays `text[]`/`uuid[]` (2)** → `JSON` en MariaDB. Los arrays pasan a array JSON;
   hay que ajustar el código que hoy usa operadores de array de Postgres (`= ANY(...)`).
4. **CHECK con listas de valores** (estados: draft/approved…): funcionan en MariaDB 10.2+; se copian tal cual.
5. **Índices parciales (19)** (`... WHERE ...`): MariaDB no los soporta → se crean como índices normales
   (marcados en el inventario).
6. **Funciones RPC (PL/pgSQL):** no se migran a la BD; se **reimplementan en el backend Node** (son
   CRUD sencillos con parámetros JSON; solo `mcp_check_quota` tiene lógica).
7. **FK + COLLATE:** crear todas las tablas con `COLLATE utf8mb4_unicode_ci` (si no, errno 150 al crear FKs).
8. **Realtime:** sin Supabase, se sustituye por *polling* o WebSocket propio (Fase 3).
9. **Storage:** `construgest-files` → ficheros en disco local (ya hay andamiaje `localApi`/`syncService`).

## Cómo se reprodujo (solo lectura, vía Supabase MCP)

Introspección de `information_schema` / `pg_catalog` acotada a `^(cons|ferrapp|mcp)_`. No se modificó
nada en la nube.

## Siguiente paso (Fase 1)

Generar `schema.mariadb.sql` (CREATE TABLE equivalentes) a partir de este inventario, y levantarlo en
**MariaDB sobre Docker Desktop**, inspeccionándolo con **DBeaver**. `.msi` solo en la fase final.
