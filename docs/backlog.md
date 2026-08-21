# Backlog operativo CONSTRUGEST

> ## 📍 ESTADO ACTUAL — 2026-08-21
>
> ### Último (2026-08-21): PDF-1 — el capítulo de texto libre perdía TODO el formato
> **Síntoma de Benjamin**: en el capítulo libre "Condiciones Generales" se escribe con
> formatos y sangrías, y el PDF del presupuesto lo saca en plano. **Auditado midiendo, no
> suponiendo**: se generaron PDFs reales con el pdfmake que empaqueta la app (0.2.23) y se
> leyeron de vuelta con pdfjs **fuente, color y posición de cada glifo**. El fallo está
> entero en `htmlToPdfmake()` de
> [`frontend/src/services/budgetPdfExport.ts`](../frontend/src/services/budgetPdfExport.ts);
> el resto del PDF (portada, índice, capítulos con partidas, resumen, firmas) usa objetos
> `text` planos y **no estaba afectado**. Seis fallos:
> 1. **Negrita, cursiva, subrayado, tachado y resaltado no se aplicaban.** El conversor
>    envolvía siempre los hijos en un array y ponía el estilo en la envoltura
>    (`{text:[{text:'x'}], bold:true}`), y **pdfmake solo respeta el estilo en la HOJA**.
>    Medido: la palabra en negrita usaba el MISMO recurso de fuente que el texto normal.
>    Por eso los encabezados H1/H2/H3 y la alineación sí salían (son estilo de bloque).
> 2. **El color de texto se perdía siempre**: el navegador normaliza `style.color` a
>    `rgb(255, 0, 0)` y pdfkit solo entiende hex/nombres → lo descartaba en silencio (el PDF
>    no emitía ni operador de color). Nuevo `cssColorToPdf()`.
> 3. **Las listas anidadas (sangría con Tab) DESAPARECÍAN**: el `<li>` metía párrafo + `<ul>`
>    hijo dentro de `text`. Ahora van en `stack`.
> 4. **`<blockquote>` no tenía caso** → sin sangría (salía en x=40 como un párrafo normal).
> 5. **La sangría escrita a mano se perdía**: pdfmake recorta los espacios (y los `&nbsp;`
>    que mete el navegador) al principio de línea. Ahora se convierten en **margen izquierdo
>    real** (`extractIndent`).
> 6. `<pre>/<code>` salían a 12pt sin estilo; no había `<hr>` ni `sub`/`sup`.
>
> **Verificado E2E contra el servicio real** (`generateBudgetPdfBlob`, página temporal en el
> dev server, sin BD): en el PDF resultante negrita / cursiva / negrita+cursiva usan **tres
> recursos de fuente distintos**, el color sale `#dc2626`, el resaltado dibuja su rectángulo
> `#fef08a`, el subítem anidado indenta a x=60.4 (padre x=50.2), la cita a x=56.0 y la
> sangría manual a x=50.0. `tsc --noEmit` limpio.
>
> *De la auditoría, no arreglado (decisión de producto)*: **el editor no tiene botón de
> sangría** (indentar/desindentar), así que hoy solo se puede sangrar con listas, cita o
> espacios. Y `@tiptap/extension-subscript`/`superscript` están instalados pero **no
> registrados** en `RichTextEditor.tsx` (el conversor ya los soporta si algún día se activan).
>
> Bump **v0.4.6** en los 3 `package.json` + lock del backend.
>
> ### Anterior (2026-08-18): CYPE-1 + BUD-1 + SHIM-1 y bump v0.4.5 (sin release aún)
> **CYPE-1 — importación de PDF de CYPE/Arquímedes.** El listado "Presupuesto y
> mediciones" no daba **ni un capítulo**. Cuatro causas, medidas ejecutando el parser
> sobre el PDF real (M03 Huetor Vega, 137 pág.): (1) el PDF es el proyecto entero
> —memoria + pliego + ESS + presupuesto— y el parser genérico sacaba **85 capítulos
> fantasma** del índice del pliego; (2) el capítulo se escribe `Presupuesto parcial nº 2
> Cimentaciones` y `cleanPdfText()` lo borraba como ruido de página; (3) la partida lleva
> **dos** tokens antes de la unidad (`2.1.1 CRL010  m² Capa de hormigón…`) y
> `detectPartidaStart()` espera CÓDIGO+unidad+título; (4) la cantidad y el precio van en
> `Total m² ......: 97,510 7,12 694,27`, que `isTotalLine()` borraba por empezar por
> "Total". Solución: **parser dedicado** en [`backend/src/services/cype-parser.js`](../backend/src/services/cype-parser.js)
> + un "Paso 0" de 22 líneas en `budget-parser.js` que desvía **antes** de `cleanPdfText`.
> No se toca el parser genérico → **cero riesgo para Presto/TCQ/Menfis** (comprobado que un
> listado Presto no entra por este perfil). Detalle fino: las cabeceras `(Continuación...)`
> que CYPE repite al cruzar página se comían **3 partidas y 13.001,21 €**.
> **Verificado E2E**: `POST /api/ai/parse-budget-pdf` (HTTP 200, 0,1 s) → importación por
> los mismos endpoints del diálogo → **11 capítulos, 127 partidas, 352 mediciones, 0 fallos**
> y **PEM 164.680,71 €** en pantalla (el PDF dice 164.680,76 € para los capítulos 1–11;
> 5 céntimos de redondeo por calcular cantidad × precio).
> *Del documento*: los capítulos **12/13/14** (Seguridad y salud, Control de calidad,
> Demolición) **no traen partidas** en el PDF, sólo importe en el resumen → no importables.
> 7 partidas pierden el desglose de mediciones (el sello del visado va rotado en la misma
> capa de texto y descoloca las columnas); cae a medición sintética con la cantidad correcta,
> igual que `bc3-parser.js`.
>
> **BUD-1 — el borrado múltiple fallaba en silencio.** `handleBatchDelete()` no tenía
> `try/catch`: un fallo puntual (red, 500, permisos) salía del bucle sin toast, sin
> deseleccionar y sin borrar nada. Por eso unas veces iba y otras no, y una por una desde el
> icono de la fila sí funcionaba (ese camino no pasa por ahí). Ahora cada partida va en su
> `try/catch`, se cuentan borradas y fallidas y **siempre** se informa. Verificado con el
> backend **parado a propósito**: antes no ocurría nada, ahora sale "Una partida no se pudo
> eliminar".
>
> **SHIM-1 — guardarraíl de datos vinculados, que estaba INERTE.** Encontrado al verificar
> BUD-1: se borraba una partida con 14 mediciones sin ningún aviso y el backend respondía
> `measurements: 0`. `db/local.js` ignoraba el 2º argumento de `.select()`, así que los
> `{ count: 'exact', head: true }` devolvían `undefined → 0` (5 usos, todos en
> `routes/budgets.js`). **Lo grave**: `work_log_links` y `certifications` contaban igual de
> mal → se podía borrar de un clic una partida **ya certificada o imputada en partes**,
> arrastrando esos registros y sin aviso. Llevaba así desde la migración a MariaDB.
> Verificado: 409 con contador exacto, `force` limpia sin huérfanos, partida sin
> dependencias no molesta, y `/budgets/for-reference` cuenta bien.
>
> **Entorno**: contenedores `construgest-mariadb` + `construgest-backend` **recreados**
> (`docker compose up -d --build`). Los volúmenes seguían existiendo → **no se perdieron
> datos**. Presupuesto de prueba `CYPE Huetor Vega (E2E2)` dejado en "Obra Demo" para
> inspección; se puede borrar cuando no haga falta.
>
> Bump **v0.4.5** en los 3 `package.json` + lock del backend. Merge `--no-ff` a `develop`,
> ambas ramas pusheadas, `.msi` construido y **RELEASE v0.4.5 PUBLICADA** (GitHub, Latest,
> `ConstruGest-0.4.5.msi` 452 MB, target = merge de develop `db0bac3`).
>
> ### 🔴 SEC-1 (2026-08-18): el instalador llevaba dentro una clave privada de Google Cloud
> **Cazado en el gate pre-release, antes de publicar 0.4.5.** `build-msi.ps1` copiaba
> `backend/` entera excluyendo sólo `.env*`, así que `backend/google-vision-key.json` —una
> **service account key REAL** de `construgest-ocr@construgest-web.iam.gserviceaccount.com`—
> se empaquetaba en el `.msi`. Confirmado leyendo la tabla `File` de cada instalador (no por
> suposición): estaba en **0.4.2, 0.4.3 y 0.4.4, ya publicados**, y el repo
> `susanaybenjamin-boop/construgest` es **PÚBLICO**. Los ficheros estaban bien en
> `.gitignore` y nunca llegaron a git; el agujero era **sólo** el empaquetado.
>
> Resuelto: (1) **Benjamin revocó la clave** — es lo único que cierra de verdad el agujero,
> porque borrar adjuntos no deshace descargas ya hechas; (2) `.msi` borrados de las releases
> 0.4.2/0.4.3/0.4.4 (hay copia local en `desktop/dist`, es reversible); (3) `build-msi.ps1`
> excluye ahora **los mismos patrones que el `.gitignore`** y tiene un **gate de secretos**
> (paso 3.5/4) que **aborta el build**: busca por nombre **y por contenido**
> (`BEGIN PRIVATE KEY`, `service_account`…), ignorando `node_modules` para no chocar con las
> claves de prueba de las dependencias.
>
> **Lección**: excluir por nombre NO basta. El gate destapó una segunda copia de la misma
> clave, `backend/construgest-web-23e7ee55f786.json`, que no encaja con ningún patrón de
> nombre obvio y sólo se pilla escaneando el contenido. Sobre 1498 ficheros dio **0 falsos
> positivos**. El `.msi` 0.4.5 publicado tiene 4906 ficheros, exactamente **2 menos** que el
> primer intento: los dos de la clave.
>
> **PENDIENTE**: decidir qué hacer con los `.msi` de **v0.4.0 y v0.4.1**, que siguen
> publicados y casi con seguridad llevan la clave (la clave es de marzo, esas releases de
> julio). **No verificados**: esos dos `.msi` no están en disco, así que borrarlos sería
> irreversible. La clave ya está revocada, así que no es urgente.
> Los dos ficheros de credenciales **siguen en `backend/`** (ya inútiles: el backend no usa
> Google Vision, el OCR es local) — conviene borrarlos del disco.
> Sigue pendiente de la sesión anterior el **smoke visual MULTIMON** de Benjamin.
>
> ### Anterior (2026-07-26): MULTIMON portado de Benjagest + bump v0.4.4 (sin release aún)
> Bloque **MON-1..4** en `desktop/`: la app **reabre en la pantalla y posición donde se
> cerró** (nuevo `desktop/window-state.js`, portado del `WindowGeometry` de Benjagest:
> persiste en `userData/window-state.json` al cerrar + debounce en move/resize; criterio
> LENIENTE — solo descarta si el rectángulo no toca ninguna pantalla conectada; guarda
> posición actual aunque esté maximizada + tamaño restaurado con `getNormalBounds`),
> las **subventanas** (`window.open`: visor PDF, comparador, planos, buzón) abren
> **centradas en el monitor de la app** (`childBoundsOnAppDisplay` en el
> `setWindowOpenHandler`), y el tamaño guardado se **recorta al monitor** donde reabre si
> no cabe. **Hallazgo importante (MON-4)**: bug de Electron con **DPI mixto** (monitores
> 125%+100%, exactamente los de Benjamin) — pasar posición+tamaño al constructor o a
> `overrideBrowserWindowOptions` aplica el tamaño dividido por la escala del primario si
> la ventana cae en el otro monitor (1000×700→800×561). Workaround verificado: **`setBounds`
> DOS veces** con la ventana ya creada; aplicado a principal y subventanas. **Verificado en
> ejecución** con arnés Electron real sobre los 2 monitores reales: **14/14 PASS** (arnés en
> scratchpad de la sesión, no commiteado). `node --check` OK en `main.js`/`window-state.js`
> (no se tocó backend/frontend). Bump **v0.4.4** en los 3 `package.json` + lock del backend.
> Commits MON-1/2/3/4 + chore en `feat/benjamin`, merge `--no-ff` a `develop`, todo pusheado.
> **`.msi` 0.4.4 construido y RELEASE v0.4.4 PUBLICADA** (GitHub, Latest, `ConstruGest-0.4.4.msi`
> 453 MB adjunto, target = merge de develop `76d7f88`). **El gate pre-release cazó una avería**:
> `build-msi.ps1` copiaba a `resources/app` una lista a mano (main.js, preload.js) y dejaba fuera
> el nuevo `window-state.js` → el primer .msi habría roto la app al arrancar (require sin
> resolver, patrón 0.1.19 de Benjagest). Arreglado (`f606da7`: se copian TODOS los `*.js` de
> `desktop/`), reconstruido y verificado el stage (window-state.js idéntico, main.js idéntico,
> package.json 0.4.4) antes de publicar.
> **PENDIENTE**: Benjamin actualiza su app instalada a 0.4.4 (banner de actualización) y hace el
> smoke visual MULTIMON: mover al 2º monitor, cerrar con la X, reabrir (debe volver ahí);
> lo mismo maximizada; abrir visor PDF/comparador con la app en el 2º monitor.
>
> ### Anterior (2026-07-18): AUDITORÍA PRE-v0.4.3 — 27 bugs arreglados
> Barrido multi-agente de TODO Construgest (41 agentes, estático + dinámico con curl real).
> **27 bugs confirmados (0 falsos positivos), los 27 ARREGLADOS y verificados en ejecución**
> contra la BD demo (backend dev nativo `node --watch`). Detalle y checklist en
> [`docs/qa-v0.4.3-findings.md`](qa-v0.4.3-findings.md). Categorías: corrupción de datos
> (patrón `undefined→NULL` del shim, arreglado de raíz), IDOR entre organizaciones (ficheros,
> gastos, subcontratas/trabajadores/equipos, ajustes, analítica IA), badges/contadores rotos,
> planos que no dibujaban, certificaciones, partes, materiales, y el cambio de estado desde la
> lista. 19 commits por área en `feat/benjamin` + bump a **v0.4.3**. `.msi` construido y
> **release v0.4.3 PUBLICADA** (GitHub, Latest, `ConstruGest-0.4.3.msi` adjunto). Regresión OK.
> **Benjamin actualizó su app instalada a 0.4.3 y confirmó que todo va bien** (sus 10 proyectos siguen).
> HECHO: REL-CLEAN (borrado `ConstruGest-0.4.1.msi`, conservados 0.4.2+0.4.3) y **merge `--no-ff` a
> `develop`** (pusheado). **Pendiente aparte** (no bloqueante): rediseñar el endpoint `/restore`
> duplicado y el clobber de `_backup` ajeno (ver Pendientes conocidos); volver a pruebas en producción.
> Nota: los BUGs "restore duplicado", "clobber de backups" y "cambio de estado" que estaban en
> Pendientes quedan CUBIERTOS por este barrido (estado ya arreglado; restore/clobber siguen
> pendientes de decidir su rediseño, ver Pendientes).
>
> ### Anterior (2026-07-18): DATOS REALES importados a la app instalada
> Migrados los **10 proyectos reales** de la web (backups `_backup/` en
> `C:\Users\benja\Documents\CONSTRUGEST-DESKTOP`) a la MariaDB de la app instalada
> (`%APPDATA%\construgest-desktop\data`), dentro de la organización real de Benjamin
> (`susanaybenjamin@gmail.com`). Se borró el OGIJARES de prueba y se reconstruyó su ficha
> real (estaba pisada, ver BUG clobber). Ficheros copiados al storage local. Verificado en
> BD (10 proyectos, presupuestos/partidas/certs/partes/gastos correctos) y en disco. **Objetivo:
> poder desinstalar la web.** Script one-off en el scratchpad de esa sesión (no commiteado);
> snapshot previo de la BD guardado por si hay que revertir. Pendiente: que Benjamin confirme
> que los ve al recargar la app. Ver BUGs nuevos en "Pendientes conocidos".
>
> ### Qué es Construgest y de dónde viene
> App de gestión de construcción (presupuestos, certificaciones, obras, materiales,
> proveedores, subcontratas, partes de trabajo, IA). Nació como **`construgest-web`**:
> Node/Express + Next.js 16/React 19 + **Supabase** (Postgres, Storage, RPC, Realtime)
> e IA de nube (Anthropic/Groq/Gemini). **El objetivo de este proyecto fue quitar la
> nube y hacerlo 100% local y autohospedado**, como Benjagest: MariaDB en vez de
> Supabase, IA local con Ollama, y un `.msi` autocontenido. Copia de trabajo:
> `C:\Proyectos\Construgest` (separada de `construgest-web`). **Login propio (bcrypt+JWT),
> nunca Supabase Auth.** La BD Supabase original está COMPARTIDA con otras apps → solo se
> migró `cons_*` (+ `mcp_*`); todo lo `*_180`/ajeno no se tocó. El módulo "ferralla"
> (`ferrapp_*`) se ELIMINÓ (no encajaba en el producto).
>
> ### El camino desde cero (todo HECHO y verificado en ejecución)
> - **Fase 0 — Esquema de la nube:** extraído a `docs/schema/` (tablas + RPC).
> - **Fase 1 — MariaDB + entorno dev:** `database/` con `docker-compose.yml` (MariaDB :3308 +
>   backend :5000) y `01_schema.sql` (Postgres→MariaDB: uuid→CHAR(36), timestamptz→DATETIME(3)
>   UTC, jsonb/arrays→JSON, COLLATE utf8mb4_unicode_ci) + seeds.
> - **Fase 2 — Capa de datos:** 20 rutas + middleware migradas de Supabase a MariaDB con un
>   **shim** (`db/local.js`) que imita la API `.from()/.rpc()/.storage` (select/insert/update/
>   delete/upsert, filtros, RETURNING, **selects anidados** por FK, storage en disco). Verificado
>   ruta por ruta con curl.
> - **Fase 3 — Storage + Realtime locales:** ficheros en disco (`db/storage.js`+`routes/files.js`);
>   Realtime = **WebSocket propio** (`services/realtimeHub.js`, `/ws`) que sustituye Supabase Realtime
>   (topics `budget:{id}`, `org:{id}:projects|branches`, `user:{id}`), auth JWT + heartbeat.
> - **Fase 4 — IA 100% local (Ollama `qwen2.5:3b`, i5 sin GPU):** arquitectura de **3 capas**
>   (código determinista para cifras · LLM local solo para prosa/borroso, **0% cifras del modelo** ·
>   OCR pdfjs+Tesseract). **13 skills** reescritas; extracción de materiales; import de PDF; base de
>   precios (biblioteca propia + BC3 público); **autoaprendizaje** por correcciones (few-shot). Chat
>   eliminado. SDKs y claves de nube fuera del backend.
> - **Fase 5 — Empaquetado autocontenido:** **nativo sin Docker + ventana Electron**; `.msi` con
>   **WiX v3** (`desktop/`). El shell (`desktop/main.js`) arranca MariaDB (init idempotente la 1ª vez),
>   Ollama (+pull del modelo), backend y frontend con el Node de Electron. Binarios en `desktop/runtime/`.
>   **Auto-update real** contra GitHub Releases (`/api/version` + banner + descarga/instala el `.msi`).
> - **UI conectada + limpieza de nube:** frontend hablando con el WS local; 5 skills IA cableadas en
>   pantallas; borradas refs muertas de nube (Vercel/Render/Supabase/Vision) y paneles admin de IA.
>
> ### 🚩 DÓNDE ESTAMOS AHORA — FASE 6: PRUEBAS EN PRODUCCIÓN
> El backend, la IA, el empaquetado y el auto-update están HECHOS. **v0.4.0** compilada y
> publicada (GitHub Releases, `.msi` adjunto). Ya NO estamos construyendo a ciegas: la app se
> **instala y se prueba función por función en la app REAL** (el `.msi` en el portátil), y cada
> fallo que aparece se arregla, se corta release y se autoactualiza. Este es el ciclo actual.
>
> **Historial de releases** (versión = `backend/package.json`, la compara el auto-update):
> `v0.1.0` 1ª release · `v0.2.0`/`v0.3.0` empaquetado · `v0.3.1` init MariaDB reentrante +
> deps backend + fuera consola dev · `v0.3.2` ajustes · `v0.3.3` rate-limit 300→6000/min (login
> e import se bloqueaban) · `v0.3.4` import resiliente + renumerado que no tumba la importación ·
> **`v0.4.0`** parser de presupuestos tipo Excel (totales en línea) + bloqueo de la app al descargar
> el update + **login con PIN** en escritorio · **`v0.4.1`** las ventanas internas (visor "Desde
> Biblioteca"/`/budget-reference`, comparador, vista/impresión PDF) se abren DENTRO de Electron en
> vez de escaparse al navegador del sistema (`setWindowOpenHandler` distinguía mal interno/externo) ·
> **`v0.4.2`** no dejar procesos huérfanos que bloqueen el arranque (WINPROC-1): tras cierre forzado/
> suspensión, backend/MariaDB/frontend quedaban agarrando sus puertos y al reabrir el backend nuevo
> chocaba con EADDRINUSE (parecía "sin BD/sin backend", no dejaba entrar). Ahora `freeOwnedPorts()`
> libera 3308/5000/3000 al arrancar (netstat+taskkill, solo empaquetado/Windows) y `shutdown()` mata
> el árbol de procesos con `taskkill /T /F`. · **`v0.4.3`** barrido de QA pre-release: **27 bugs**
> arreglados (corrupción de datos por `undefined→NULL` del shim, IDOR entre organizaciones, badges/
> contadores, planos, certificaciones, partes, materiales, cambio de estado desde la lista). Ver
> [`docs/qa-v0.4.3-findings.md`](qa-v0.4.3-findings.md).
>
> ### Para la próxima RELEASE (v0.4.3) — arreglo ya en código, falta empaquetar
> - **BUG cambio de estado desde la LISTA** (arreglado en `feat/benjamin`, sin commitear/publicar):
>   el desplegable de estado del dashboard manda solo `{ status }`; el PUT `/:id` de
>   `backend/src/routes/projects.js` reconstruía el objeto entero y el shim metía los campos
>   ausentes como NULL → `SET name=NULL` sobre columna NOT NULL → fallaba ("Error al cambiar el
>   estado"). Fix: el PUT ahora solo actualiza los campos presentes en el body. Verificado el fallo
>   en ejecución (`ER_BAD_NULL_ERROR`) y la sintaxis del fix; **falta e2e en la app instalada** (necesita
>   release). Mientras tanto, cambiar estado funciona desde Ajustes del proyecto (manda el form completo).
>   (Los 2 proyectos pausados de Benjamin se archivaron a mano en la BD para desbloquearle.)
>
> ### Principios básicos (SIEMPRE — detalle en `CLAUDE.md`)
> 1. **¿Lo he VISTO funcionar?** "Compila" y "los tests pasan" NO es "funciona". Ejercitar el
>    camino real antes de dar algo por bueno; si no se pudo verificar, decírselo a Benjamin.
> 2. **No asumir:** leer/`grep` antes de tocar (la ruta entera, todos los callers, la columna real).
> 3. **Pantalla por fichero:** nada de mega-ficheros (el God Object de 44k líneas de Benjagest NO
>    se repite). Componentes a `components/<feature>/` cuando un `page.tsx` pasa de ~600-800 líneas.
> 4. **Auto-refresh (dura):** tras crear/editar/borrar, invalidar las queries de React Query.
> 5. **UI:** no tocar estilos; respetar i18n (`t()`); botón Cancelar/Cerrar; sin emojis en código.
> 6. **Git:** trabajar en `feat/benjamin`, commits pequeños por slice (español + Co-Authored-By),
>    merge `--no-ff` a `develop` cuando esté PROBADO. Nunca `--no-verify`/`--amend`/`--force` sobre
>    lo pusheado. Benjamin decide el QUÉ; Claude propone el CÓMO con opciones.
>
> ### PRÓXIMA SESIÓN — empezar por aquí
> **Estamos en pruebas en producción (Fase 6).** El flujo de cada sesión:
> 1. Leer esta cabecera + `CLAUDE.md`. Confirmar con Benjamin qué instaló y qué versión corre
>    (banner "nueva versión" / "Acerca de" en Ajustes muestran la versión).
> 2. **Probar funciones en la app instalada** y recoger fallos. Diagnóstico rápido con el LOG de
>    la app: `%APPDATA%\construgest-desktop\logs\construgest.log` (ahí van backend/frontend/
>    mariadb/ollama y el update). El import de presupuestos, además, muestra el error REAL del
>    servidor en vez de tragárselo.
> 3. **Arreglar → verificar → cortar release.** Para probar un arreglo de backend/IA sin reinstalar:
>    dev con Docker (`docker compose up -d`; tras editar backend `--build backend`) + Ollama del host
>    (`ollama pull qwen2.5:3b`); frontend `preview_start name=frontend` (:3000). Login:
>    `admin@construgest.local` / `construgest`. Cuando esté probado: subir `backend`+`frontend`
>    (+`desktop`) `package.json` a la nueva versión, `desktop/build-msi.ps1 -Version X.Y.Z`, y
>    `gh release create vX.Y.Z desktop/dist/ConstruGest-X.Y.Z.msi` (repo `susanaybenjamin-boop/construgest`).
> 4. **Limpieza de `.msi` (REL-CLEAN):** NO mantener todas las compilaciones. Tras **comprobar que
>    la nueva release se ha descargado/instalado bien**, conservar SOLO el `.msi` de la versión
>    **inmediatamente anterior** (por si hay que revertir) y borrar el resto de `desktop/dist/*.msi`.
>    Ahora hay 8 (0.1.0→0.4.0, ~3,5 GB). Es LOCAL (disco); los assets de GitHub Releases son decisión
>    aparte (no borrar sin preguntar). No borrar el `.msi` recién probado ni el anterior.
> 5. **Pendientes conocidos** (no bloqueantes): base de precios real de Andalucía (BCCA) en
>    `backend/data/price-bases/`; tesseract/poppler en el `.msi` de Windows (hoy OCR solo en Docker);
>    endpoint de import por lotes (hoy el import hace ~cientos de llamadas seguidas); e2e real del PIN
>    y del bloqueo de update dentro del `.msi` (compilan y typecheck OK, faltan probar instalados).
>    - **BUG restore duplicado:** `POST /:id/restore` está declarado DOS veces en
>      `backend/src/routes/projects.js` (la de papelera, ~línea 293, tapa a la de backup, ~línea 967).
>      La de backup queda muerta → el "restaurar desde carpeta" de la UI nunca se ejecuta. Renombrar
>      una de las dos rutas (p.ej. `/:id/restore-backup`) y cablear la UI a la correcta.
>    - **BUG clobber de backups:** cuando un proyecto tiene `folder_path` apuntando a una carpeta con
>      `_backup`, el sync/backup de la app **sobrescribe** ahí `project.json` (y potencialmente otros
>      JSON). Riesgo de pisar un backup REAL con datos de prueba (le pasó a OGIJARES el 14-jul).
>      Revisar `syncService.ts` + rutas `sync-file`/`backup`: no escribir sobre un `_backup` ajeno,
>      o avisar/separar por `project_id`.
>
> ---
>
> ## 🗂️ Detalle histórico hasta 2026-07-14 (referencia)
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
> **✅ BACKEND TERMINADO Y 100% LOCAL (2026-07-14).** Cero dependencia de nube en runtime:
> Realtime = WebSocket propio (`services/realtimeHub.js`, ruta `/ws`); notificaciones en MariaDB.
>
> **✅ UI CONECTADA + LIMPIEZA NUBE + RELEASE (2026-07-14, mergeado a `develop` `f693566`).**
> - **UI-1..3 + UI-2:** Realtime WS del frontend; 5 skills IA cableadas (certificaciones, gastos,
>   materiales, compare-budgets, find-similar); limpieza AI-5 (panel admin IA + claves cloud fuera).
> - **CLEAN-CLOUD:** eliminado el `/installer` legacy y todas las refs muertas de nube (vercel/
>   onrender/Supabase/AI-cloud/Vision en código y `.env`).
> - **RELEASE + auto-aviso:** `GET /api/version` compara con GitHub Releases; banner "nueva versión"
>   + "Acerca de" en Ajustes; `scripts/release.sh` + `docs/RELEASING.md`. **1ª release `v0.1.0`
>   publicada** (main + tag + GitHub Release). Para el aviso en repo PRIVADO hace falta `GITHUB_TOKEN`
>   en `backend/.env` (o hacer el repo público). El auto-update REAL (descargar/aplicar) es Fase 5.
> - **2 bugs preexistentes arreglados:** `projectIdFromBudget` (comparativa 500) y DECIMAL→Number
>   en el pool MariaDB (editor de presupuesto crasheaba con mediciones).
> - **BC3-2 + AI-4:** 2ª fuente de precios BC3 (enchufable, falta el fichero real de Andalucía) y
>   autoaprendizaje (correcciones → few-shot en extracción de materiales).
>   **Todo verificado e2e con Ollama local.**
>
> **🗑️ MÓDULO FERRALLA ELIMINADO (2026-07-14) — no encajaba en el producto.** Borrado
> completo y verificado e2e: frontend (`app/ferrapp`, `components/ferrapp`, `lib/ferrapp`,
> `stores/ferrappStore.ts`, nav + tema `.ferrapp-theme`), backend (`routes/ferrapp.js` +
> mount) y tablas `ferrapp_*` del schema (57 tablas ahora, `down -v && up -d` OK). Se
> MANTIENEN los términos de oficio "Ferrallista" (rol) y "Ferralla" (especialidad subcontrata).
>
> **FASE 4 (IA LOCAL) MUY AVANZADA — la IA ya es 100% local, sin nube ni Supabase.**
> - **Motor IA:** `services/ai-service.js` local puro (Ollama, `qwen2.5:3b`); caché; `num_predict≤2048`.
> - **Extracción/OCR** (`extract-materials`, `parse-budget-pdf`): Capa 1 determinista + LLM/OCR local.
> - **AI-2 (ANÁLISIS) COMPLETO — 13 skills reescritas** con arquitectura de 3 capas (código calcula,
>   LLM solo prosa → **0% cifras del modelo**), verificadas e2e con curl:
>   · Motor determinista compartido `services/budget-analytics.js` (totales, %, incidencias,
>     duplicados por Jaccard, sugerencias) + `fuzzyJaccard` (tolerante a abreviaturas).
>   · Pantalla IA (6): analyze-budget, detect-issues, estimate-contingency, executive-report,
>     suggest-optimizations, compare-prices. · Nuevas: compare-budgets (`budget-compare.js`),
>     find-similar, analyze-materials (`materials-analytics.js`), analyze-expenses
>     (`expense-analytics.js`), analyze-certifications (`certification-analytics.js`).
>   · **TOOL de precios** `services/price-reference.js` = biblioteca propia (manda) + base pública
>     BC3 (respaldo, enchufable, PENDIENTE el fichero). · CORTADAS 6 skills sin pantalla.
> - **Chat eliminado.**
>
> **PRÓXIMA SESIÓN — empezar por aquí:**
> 1. Leer esta cabecera + `CLAUDE.md`. **Entorno:** Ollama en el host con `qwen2.5:3b`
>    (`ollama pull qwen2.5:3b`). Arrancar `docker compose up -d`; tras editar backend
>    `docker compose up -d --build backend`. Frontend: `preview_start name=frontend` (:3000).
>    Login e2e: `admin@construgest.local` / `construgest`.
> 2. **CONECTAR LA UI (bloque grande, EN CURSO):**
>    a) **✅ UI-1 Realtime WS HECHO (2026-07-14, commit `a305e94`).** Nuevo cliente WS nativo
>       `frontend/src/lib/realtimeClient.ts` (singleton, reconexión backoff, re-suscripción,
>       heartbeat) hablando con el hub `/ws`. `realtime.ts` + `realtimeNotificationStore.ts`
>       migrados a `subscribeTopic()`; `authStore.logout()` cierra el socket. Borrado
>       `lib/supabase.ts` + dep `@supabase/supabase-js` + vars `NEXT_PUBLIC_SUPABASE_*`.
>       VERIFICADO e2e: WS conecta con JWT real (ready+pong) y rename de proyecto por backend →
>       la lista del panel se refresca sola (org:projects change).
>       **UI-1 + FERRA mergeados a `develop` (merge `83679d9`, 2026-07-14).**
>    b) **✅ UI-2 Skills IA cableadas HECHO (2026-07-14).** Nuevo `components/ai/AiInsightPanel.tsx`
>       (botón + renderer genérico prosa/métricas/listas, etiquetas ES). Cableadas y VERIFICADAS
>       e2e con Ollama real: `analyze-certifications` y `analyze-expenses` (pantallas de proyecto),
>       `analyze-materials` (admin/suppliers→Comparativa de Precios), `compare-budgets` (botón
>       "Resumen IA" en BudgetComparisonModal) y `find-similar` (dropdown de partidas guardadas al
>       teclear el nombre en PartidaEditRow → reutiliza nombre/unidad/precio). Commits `dfbc51c`,
>       `a62d6a9`, `7132397`, `0767c47`.
>    c) **✅ UI-3 Limpieza AI-5 HECHO (2026-07-14, commit `aa8a5db`).** Borrada la pantalla
>       `/admin/mcp`; quitados de `/admin/users` los paneles muertos (consumo global, créditos,
>       toggle IA); quitada la pestaña "Inteligencia Artificial" de Ajustes + objeto `ai` del
>       settingsStore. Todo lo eliminado llamaba a endpoints cloud que ya daban 404. Verificado e2e.
>
>    **⚠️ 2 BUGS PREEXISTENTES ARREGLADOS al verificar UI-2 (Fase 2/DATA):**
>    · `middlewares/auth.js`: `projectIdFromBudget` nunca se definió → toda `/budgets/comparison/*`
>      daba 500 y rompía el modal de comparativa (commit `4f74f2b`).
>    · `db/mariadb.js`: MariaDB devolvía DECIMAL como STRING → el editor de presupuesto crasheaba
>      (`measurementsTotal.toFixed is not a function`) en partidas con mediciones. Cast DECIMAL→Number
>      en el pool (commit `259875b`). **OJO:** revisar si algún sitio del backend dependía del string.
> 3. **✅ BC3-2 2ª fuente de precios HECHO (2026-07-14, commit `4d52a11`).** Infra enchufable:
>    `bc3-parser.js:extractPriceRows` + `services/price-base.js` (lee `*.bc3` de
>    `backend/data/price-bases`, cache) concatenado en `loadPriceReference`; la biblioteca MANDA a
>    igualdad de similitud. Verificado e2e con muestra. **PENDIENTE:** dejar caer el fichero real
>    de Andalucía (BCCA) en `backend/data/price-bases/` y `docker compose up -d --build backend`.
> 4. **✅ AI-4 autoaprendizaje HECHO (2026-07-14, commit `d6329aa`).** Tabla `cons_ai_corrections`
>    + `services/ai-corrections.js` (few-shot) + inyección en la extracción de materiales + endpoints
>    `POST/GET /ai/corrections` + captura en el modal de importar (nombre editable → registra
>    corrección al importar). Verificado e2e: el LLM local aplica el nombre/unidad corregidos.
>    `find-similar` (partidas) ya era la base. **Nota:** el mismo patrón se puede extender a
>    `parse-budget` (la skill ya está en `CORRECTION_SKILLS`, falta el punto de captura en el import PDF).
> 5. **Follow-up AI-5:** desmantelar panel admin de IA (`routes/admin.js` + `mcp-ai-tracker.js` +
>    frontend) y UI de claves-cloud en `settings.js`. **Fase 3** (Realtime→polling) y **Fase 5**
>    (empaquetado `.msi` + Ollama/modelo + tesseract/poppler + base BC3).
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

### `[x]` FASE 3 — Storage y Realtime locales (backend)
- `[x]` **ST-1** Storage local hecho en Fase 2 (DATA-3 oleada 3): `db/storage.js` + `routes/files.js`
  + volumen Docker `construgest_files`. Ficheros en disco, URLs firmadas locales.
- `[x]` **RT-1** Realtime local = **WebSocket propio** (`services/realtimeHub.js`) montado en `/ws`
  sobre el http.Server de Express. `realtimeBroadcast.js` y `notificationService.js` publican al hub
  (mismos topics: `budget:{id}`, `org:{id}:projects|branches`, `user:{id}`). Auth por JWT en la
  conexión; suscripción restringida (user:{id} solo el propio, org:{id}:* solo su org); heartbeat.
  VERIFICADO e2e: WS autenticado recibe `change` al crear proyecto; token inválido → cierre 4001.
  **Falta (otra sesión): wire del frontend** (`lib/realtime.ts` + `realtimeNotificationStore.ts`
  + `lib/supabase.ts`) al nuevo WS.

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
  · `[x]` **`estimate-contingency`** reescrita: % por reglas (complejidad + incertidumbre del motor)
    + LLM solo justificación. VERIFICADO e2e (17% = 12 base +3 sin valorar +2 concentración).
  · `[x]` **`executive-report`** reescrita: estructura (título/desglose/métricas/riesgos) del motor
    + LLM solo resumen/conclusiones/próximos pasos. VERIFICADO e2e, prosa 100% grounded.
  · `[x]` **`compare-budgets` (backend) HECHA y VERIFICADA e2e.** `services/budget-compare.js`:
    empareja partidas de 2 presupuestos por nombre (Jaccard) + misma unidad (los códigos NO
    coinciden: Construgest 02.01 vs Presto 03WSS80000), calcula diffs de precio/importe, qué falta
    en cada lado. LLM solo el resumen. Probado con Presupuesto_v1 ↔ Vivienda Ogijares (Presto):
    revela que Construgest tiene precios muy altos (limpieza 185 € vs 4,47 €). **Falta: wire del
    frontend** (pantalla budget-comparison) — slice aparte.
  · `[x]` **TOOL de precios `services/price-reference.js`** + `suggest-optimizations` y
    `compare-prices` reescritas. DECISIÓN: referencia = **biblioteca propia (manda) + base
    pública BC3 (respaldo, enchufable)**. Empareja partida→referencia por nombre (Jaccard)+unidad.
    VERIFICADO e2e: sembradas 3 partidas en biblioteca vía API → suggest-optimizations calcula
    ahorros exactos ((185−4,47)×18=3.249,54), compare-prices clasifica overpriced + margen
    negociación 3.687 €; biblioteca vacía → [] (honesto). **PANTALLA DE IA: las 6 skills reescritas.**
  · `[x]` **`find-similar`** reescrita (lookup determinista contra biblioteca, base de AI-4) y
    **`analyze-materials`** reescrita (`services/materials-analytics.js`: duplicados a agrupar +
    dónde pagas más que el proveedor más barato + optimización por proveedor, todo desde
    `cons_materials`/`cons_supplier_materials`). VERIFICADO e2e sembrando datos vía API.
  · `[x]` **`fuzzyJaccard`** (matching tolerante a abreviaturas: "HORM. ARM."≈"HORMIGON ARMADO")
    en `budget-analytics._match`; usado en price-reference/compare-budgets/find-similar/materials
    (cross-fuente). El Jaccard estricto se mantiene para duplicados dentro de un presupuesto.
  · `[x]` **BUG corregido en `compare-budgets`:** la ruta pisaba el objeto `summary` (conteos) con
    la prosa del LLM → separado en `summary` (conteos) + `assessment` (prosa).
  · `[ ]` **Falta la 2ª fuente de la tool de precios:** base pública BC3 (Benjamin consigue el
    fichero) → concatenar en `loadPriceReference()`.
  · `[x]` **Económicas HECHAS y verificadas.** `analyze-expenses` (`services/expense-analytics.js`:
    gastos vs presupuesto por capítulo, sobrecostes, gastos sin asignar; carga
    `cons_project_expenses` + importes presupuestados). `analyze-certifications`
    (`services/certification-analytics.js`: avance acumulado %, pendiente, ritmo, estimación de
    cierre, riesgo; reusa el cálculo del endpoint overview vía `buildOverview`). Ambas: LLM solo
    prosa. Verificadas con test unitario (datos representativos) + smoke e2e contra el proyecto demo.
  · `[x]` **CORTADAS** las 6 sin pantalla (estimate-timeline, analyze-schedule, analyze-plans,
    analyze-annotations, detect-errors, validate-specifications) + los helpers muertos
    `handleAIAnalysis`/`truncateData`. VERIFICADO: dan 404; las vivas siguen 200; arranque limpio.
    **`ai.js` queda con 13 endpoints, todos Capa 1 + LLM solo prosa (0% cifras del modelo).**
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
  · `[x]` **Follow-up (backend) HECHO.** AI-5a: `admin.js` reescrito a solo gestión de usuarios
    (fuera `/ai-consumption`, `/provider-credits`, todo `/mcp/*` y el `mcpTracker`; borrado
    `services/mcp-ai-tracker.js`, −978 líneas). AI-5b: `settings.js` sin `verify-ai-key` /
    `ai-consumption` / sección `ai` de claves; borrado `db/supabase.js`; quitados 4 deps de nube
    (@anthropic-ai/sdk, @google/generative-ai, groq-sdk, @supabase/supabase-js). **Backend SIN
    dependencia de nube en runtime.** Falta (otra sesión): frontend del panel admin IA + settings-IA.
- `[x]` **AI-6 (quitar chat) HECHO.** Eliminado `POST /api/ai/chat`. No había UI de chat en el
  frontend (0 referencias). VERIFICADO: `/api/ai/chat` → 404, resto de la IA intacto.

### `[~]` FASE 5 — Empaquetado autocontenido (EN CURSO)
Arquitectura decidida: **nativo sin Docker + ventana Electron**, `.msi` con **WiX v3**
(como Benjagest). Todo en `desktop/`.
- `[x]` **F5-1** correr nativo sin Docker: backend + frontend (`output:'standalone'`) como
  procesos Node. VERIFICADO (`node server.js` sirve /login 200).
- `[x]` **F5-2/2b** shell Electron (`desktop/main.js`): arranca MariaDB (init la 1ª vez:
  `mariadb-install-db` → crea BD/usuario → aplica `database/init/*.sql`) + Ollama (pull del
  modelo si falta) + backend + frontend con el Node de Electron, health-checks y ventana.
  VERIFICADO lo que no necesita el binario (secuencia de esquema → 58 tablas; check de modelo).
- `[x]` **F5-4** `.msi` con WiX (`installer/Product.wxs` + `build-msi.ps1`): heat+candle+light
  empaquetan Electron+backend+frontend+database. VERIFICADO: genera
  `desktop/dist/ConstruGest-0.1.0.msi` (304 MB, MSI válido) con el payload correcto. Fix de
  paso: `outputFileTracingRoot` para que el standalone no se anide.
- `[~]` **F5-3** binarios nativos en `desktop/runtime/`: MariaDB portable + Ollama COLOCADOS y en el
  `.msi`. **Falta:** tesseract/poppler para OCR de PDF escaneado en Windows (hoy solo en Docker Linux).
- `[x]` **F5-6** auto-update real contra GitHub Releases: `services/version.js` + `GET /api/version`
  (compara `backend/package.json` con la última release, extrae el asset `.msi`), banner
  `UpdateBanner.tsx` + `versionStore`, e IPC `update:install` en Electron (descarga + `msiexec /i`).
- `[x]` **UPD-1** (v0.4.0) el update **bloquea la app** con overlay de progreso mientras descarga los
  ~450 MB (si se cierra la ventana se cortaba la descarga → `.msi` a medias) + descarga atómica
  `.part`→`.msi` + botón Reintentar.
- `[x]` **PIN-1** (v0.4.0) login rápido con **PIN** solo en escritorio: bóveda cifrada con
  `safeStorage` (DPAPI) que guarda credenciales + hash del PIN (scrypt); no toca backend/JWT.
  `desktop/main.js` (IPC pin:*), `preload.js`, `lib/desktop.ts`, `components/auth/PinGate.tsx`,
  `login/page.tsx`. Verificado tsc + login web intacta; **e2e real dentro del `.msi` pendiente**.

### `[~]` FASE 6 — PRUEBAS EN PRODUCCIÓN (EN CURSO)
Instalar el `.msi` y probar función por función en la app real; cada fallo → arreglo → release.
- `[x]` **IMP-1** (v0.4.0) parser de presupuestos tipo **Excel** (totales al final de línea, códigos
  con coma `2,1`, sin separadores `___`): `services/budget-parser.js:parseBudgetInlineSummary`.
  Verificado en ejecución contra el PDF real (P-55 ojijares): 25 partidas, **83.927,60 €** al céntimo.
- `[x]` Bugs del `.msi` instalado ya cazados: init MariaDB reentrante (v0.3.1), deps del backend
  (v0.3.1), consola de dev fuera (v0.3.1), rate-limit 300→6000 (v0.3.3), import resiliente (v0.3.4).
- `[ ]` Recorrer el resto de módulos en la app instalada (obras, certificaciones, gastos, materiales,
  proveedores, subcontratas, partes, biblioteca, IA por pantalla) y anotar/arreglar lo que falle.
- `[ ]` **REL-CLEAN** — política de espacio: tras confirmar que la release nueva se descargó/instaló
  bien, borrar de `desktop/dist/` todos los `.msi` salvo el nuevo y el **inmediatamente anterior**
  (rollback). Hoy acumulados 0.1.0→0.4.0 (~3,5 GB). Solo disco local; GitHub Releases = decisión aparte.

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

### [HIST] 2026-07-15 — Pruebas en producción (Fase 6) + v0.4.0
- Probando el `.msi` instalado. Fallo del import de un PDF hecho en Excel ("No se pudieron
  extraer capítulos"): formato con totales en línea y códigos con coma → **parser inline** nuevo
  (IMP-1), verificado al céntimo contra el PDF real.
- Auto-update: la descarga de 450 MB se cortaba si se cerraba la ventana → **overlay de bloqueo**
  + descarga atómica (UPD-1). Login sin recuerdo de credenciales → **PIN local** cifrado con DPAPI
  (PIN-1).
- Release **v0.4.0** compilada con WiX y publicada en GitHub con el `.msi` adjunto.
- Consolidada la cabecera de este backlog como recap "desde cero" + principios + flujo de la fase
  de pruebas en producción.

### [HIST] 2026-07-13 — Arranque del proyecto
- Revisión completa de `construgest-web` (nube: Node + Next + Supabase).
- Decisión: migrar a **local con MariaDB**, autocontenido como Benjagest; dev con
  Docker + DBeaver; `.msi` solo al final; pantalla por fichero (no God Object).
- Hallazgo: la BD Supabase "APP360" está COMPARTIDA con otras apps → migrar solo
  `cons_*`/`ferrapp_*`/`mcp_*`.
- Fase 0 completada (esquema en `docs/schema/`). Creados `CLAUDE.md` y este backlog.
