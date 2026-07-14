# Instrucciones para Claude trabajando en CONSTRUGEST

Este archivo se lee automáticamente al iniciar cualquier sesión de Claude en este
repositorio. Son las convenciones que Benjamin ha establecido (heredadas de las
lecciones duras de BENJAGEST). Síguelas salvo que él pida lo contrario.

> **El control del proyecto se lleva en [`docs/backlog.md`](docs/backlog.md).**
> Su cabecera es el ESTADO ACTUAL + el prompt de próxima sesión. **Al empezar
> una sesión, lee su cabecera. Al cerrarla, actualízala.** El ciclo de fases y
> el checklist de "no repetir fallos" están ahí.

---

## 0. Qué es esto y hacia dónde va

- **Construgest**: app de gestión de construcción (presupuestos, certificaciones,
  obras, materiales, proveedores, subcontratas, partes de trabajo, IA).
- **Stack ACTUAL (nube):** backend Node/Express + frontend Next.js 16 / React 19 /
  Tailwind + **Supabase** (Postgres, Storage, RPC, Realtime). IA: Anthropic/Groq/Gemini.
  Login propio (bcrypt + JWT), NO Supabase Auth.
- **Objetivo:** quitar la nube → **autohospedado en local**, reescribiendo la capa
  de datos **Supabase(Postgres) → MariaDB**, autocontenido como Benjagest.
- **Copia de trabajo:** `C:\Proyectos\Construgest` (separada de `construgest-web` original).
- **Desarrollo/pruebas:** MariaDB en **Docker Desktop** + **DBeaver**. Puerto distinto
  al 3307 de Benjagest. **El `.msi` autocontenido es SOLO la fase final.**

### 0.1. La BD de la nube está COMPARTIDA
El proyecto Supabase "APP360" aloja tablas de VARIAS apps. **Solo migramos
`cons_*` + `mcp_*`** (ver [`docs/schema/README.md`](docs/schema/README.md)). Todo lo
`*_180` y las tablas sueltas son de otras apps → **no se tocan**. (El módulo
"ferralla"/`ferrapp_*` se ELIMINÓ el 2026-07-14: no encajaba en el producto.)

---

## ⛔ 1. REGLA Nº1 — VERIFICAR EN EJECUCIÓN (leer ANTES de trabajar)

**"Compila" y "los tests pasan" NO significa "funciona".** La pregunta obligatoria
antes de commitear y SIEMPRE antes de dar algo por terminado:

> **¿He VISTO esto funcionar, o solo creo que funciona?**

Toda pieza nueva o tocada se **ejercita por su camino real** antes de darla por
buena. Si no se pudo verificar (falta entorno/credencial), se le dice a Benjamin
ANTES, y decide él. Esta regla viene de releases rotas en Benjagest que pasaron
"compila OK" y aun así rompieron la app.

Checklist mínimo por tipo de cambio:

| Si el cambio toca… | Verificación mínima en ejecución |
|---|---|
| **Esquema / MariaDB (Docker)** | Levantar el contenedor, aplicar el SQL, y VER las tablas en DBeaver (no solo que el SQL parsee). |
| **Capa de datos / una ruta migrada** | `curl` real contra el backend levantado: happy path + un caso de rechazo. Comparar la respuesta con la de la nube. |
| **Endpoint nuevo/modificado** | `curl` real (mínimo happy path). |
| **Login / auth / JWT / middleware** | Probar el login y una petición autenticada. Un fallo aquí bloquea la app entera. |
| **UI (Next.js)** | Abrir la pantalla en el navegador y ejecutar la acción (no solo que compile el binding). |
| **Config de terceros (Docker, mysql2, driver…)** | Leer el comportamiento REAL (docs/código) o probarlo aislado. Nunca asumir defaults "razonables". |

---

## 🚫 2. REGLA Nº2 — NO ASUMIR (leer/grep antes de tocar)

> *"No tenemos que hacer las cosas rápido, tenemos que hacer las cosas bien."* — Benjamin

Cuando la primera reacción sea *"asumo que…"* o *"creo recordar que…"*, **PARA** y
confirma con `Read`/`Grep`. Cuesta 30 segundos; pifiarla cuesta una migración rota y
la confianza de Benjamin. En concreto:

- **Antes de migrar una ruta:** leer la ruta ENTERA (no un resumen). Ver qué tablas,
  qué `.from()/.rpc()`, qué columnas, qué joins anidados de Supabase usa.
- **Antes de cambiar la firma de una función:** `grep` de todos los callers. Si el
  commit dice "toca 1 caller" y el grep da 5, el commit miente.
- **Antes de tocar una columna:** ver qué tiene HOY (inventario en `docs/schema/`) y
  quién la lee/escribe.
- No fiarse del resumen de un agente Explore para los detalles: el agente da
  estructura, el detalle se confirma con `Read`.

---

## 🧱 3. REGLA Nº3 — PANTALLA POR FICHERO (el error a NO repetir)

En Benjagest la UI acabó siendo **un solo fichero de 44.125 líneas** con ~145
pantallas dentro (`BenjagestUiApplication.java`). Costó **semanas** trocearlo. Aquí
NO se repite:

- **Cada pantalla = su propio fichero.** En Next.js cada ruta ya es su `page.tsx`.
  Se mantiene así: nunca meter dos pantallas en un fichero, nunca un "mega-fichero".
- **Componentes en `frontend/src/components/`.** Cuando un `page.tsx` pase de
  **~600–800 líneas**, extraer secciones a `components/<feature>/` (tablas, formularios,
  diálogos, tarjetas). Un fichero grande es deuda: trocear antes de que crezca más.
- **Backend igual: una ruta de dominio por fichero** (`routes/<dominio>.js`), lógica
  gorda a `services/`. Ya está así; mantenerlo.
- **Base de datos en su carpeta** (`database/`): esquema, `docker-compose.yml`,
  migraciones y seeds. Frontend, backend y database **separados**, cada uno lo suyo.

Objetivo permanente: que cualquier pantalla/ruta se pueda abrir, entender y tocar
sin cargar un monstruo. Si al terminar un slice el fichero quedó enorme, el slice
no está completo hasta trocearlo.

---

## 4. UI: convenciones

- **No tocar estilos.** Reutilizar las clases/componentes existentes (Tailwind +
  shadcn/ui + los componentes de `components/ui`). CSS nuevo solo imitando la paleta
  y patrones de `globals.css`.
- **i18n:** la app ya usa `i18next` (ES/EN). No hardcodear español nuevo donde la
  pantalla ya pasa por `t(key)`. (La traducción completa NO es objetivo ahora, pero
  no se regresa: no romper las claves existentes.)
- **Auto-refresh (REGLA DURA).** El usuario NO pulsa "Refrescar" para ver el resultado
  de una acción. La app usa **React Query**: tras crear/editar/borrar hay que
  **invalidar** las queries afectadas (`queryClient.invalidateQueries(...)`). Al cerrar
  un slice, pregúntate: *¿qué vistas quedan obsoletas tras esta acción y se refrescan solas?*
- **Botón Cancelar/Cerrar** en todos los diálogos/wizards. **Sin emojis** en código
  salvo que Benjamin los pida.

---

## 5. Backend / datos: convenciones de la migración

- **La capa de datos se sustituye de `supabase.js` a MariaDB (`mysql2`)** ruta por ruta,
  de forma **aditiva** y verificando cada una en ejecución. No hacer un "big bang".
- Las **funciones RPC** de Postgres (25, ver `docs/schema/raw/rpc-functions.postgres.sql`)
  se **reimplementan en el backend Node**, no en la BD.
- **Realtime** (9 tablas) → polling o WebSocket propio (Fase 3).
- **Storage** (`construgest-files`) → disco local (ya hay andamiaje `localApi.ts`/`syncService.ts`).
- **UUID**: los genera el backend al insertar (columnas `CHAR(36)`), no la BD.
- **timestamptz** → `DATETIME(3)` guardando SIEMPRE en UTC.
- **FK + COLLATE**: crear todas las tablas con `COLLATE utf8mb4_unicode_ci` (si no,
  errno 150 al crear FKs — mismo mordisco que en Benjagest).
- **Auth**: no tocar el login/JWT (`middlewares/auth.js`) sin Benjamin delante.

---

## 6. Git y slices

- **Slices con prefijo por bloque** (ej. `DB-1`, `DATA-3`, `RT-2`) enumerados en el
  backlog. Un slice = un commit pequeño y revertible.
- Commit en español + `Co-Authored-By: Claude`. Commits pequeños "por si hay que revertir".
- **NUNCA** `--no-verify`, `--amend`/`--force` sobre commits ya pusheados.
- **Flujo de ramas (decidido 2026-07-13):** se trabaja en **`feat/benjamin`** (commit
  por slice). Cuando un slice/bloque está **probado en ejecución**, merge `--no-ff` a
  **`develop`**. `main` se reserva para lo estable (releases), más adelante.
  ```bash
  git checkout feat/benjamin        # trabajar aquí
  git commit -m "..."               # commits pequeños por slice
  git checkout develop && git merge --no-ff feat/benjamin -m "merge: ..."
  git checkout feat/benjamin        # volver a trabajar
  ```
- Aún **sin remoto** (repo nuevo local). No pushear al `origin` del repo viejo.

---

## 7. Rol y comunicación con Benjamin

- Benjamin **decide el QUÉ**; Claude propone el **CÓMO** con opciones (marca la
  recomendada con "(Recomendado)"). Es principiante programando pero claro con el dominio.
- Cambios grandes o irreversibles: **preguntar antes** con `AskUserQuestion`.
- Al cerrar sesión: **actualizar la cabecera de `docs/backlog.md`** con el estado y el
  prompt de la próxima sesión.
