# Backlog operativo CONSTRUGEST

> ## 📍 ESTADO ACTUAL — 2026-11-10
>
>
> ### Último (2026-11-10, tarde): COND-1/2/3 (cláusulas) y PDF-3 (la página casi vacía)
>
> **PDF-3 — La página casi vacía antes del total, en horizontal.** Síntoma de Benjamin:
> *"cuando lo cambio a horizontal, según la cantidad de partidas me deja el total en una
> página sola arriba del todo, con lo cual se queda toda la página vacía"*. Causa: el RESUMEN
> **forzaba página nueva siempre** y en horizontal (área útil ~475 pt) no cabía entero, así
> que el cuadro de totales se descolgaba. Las filas de GG/BI/PEC de PRES-5 lo empeoraron.
> Ahora el resumen **arranca donde toque** (las condiciones sí siguen en página nueva) y el
> **cierre** (totales + total en letra + firma) viaja en un bloque `unbreakable`: o cabe
> entero o pasa entero.
> *Verificado midiendo la ocupación real de cada página*, horizontal, 2 capítulos × 10 partidas:
> **ANTES** p6: **33 %** · **AHORA** p6: 56 %, p7: 61 %. Con 6 y 14 partidas no empeora.
> ⚠️ **Aviso para el futuro**: pdfmake **no soporta bloques `unbreakable` de más de una
> página** (`PageElementWriter.js:115`) y **se queda solo con la primera, perdiendo el resto en
> silencio**. Por eso solo se usa en el cierre, que es corto, y nunca en la tabla de capítulos.
>
> **COND-1/2/3 — Cláusulas de condiciones y referencias vivas.** Benjamin: el capítulo de
> condiciones ya existía y con formato rico, pero se reescribe entero en cada obra, y cuando
> una condición nombra una partida ("EN EL APARTADO 2.1 HORMIGÓN DE LIMPIEZA…") el número se
> queda mintiendo en cuanto se renumera. Decisiones suyas: biblioteca editable, referencia
> viva y huecos que se preguntan al insertar.
> - **COND-1**: `cons_condition_clauses` + API + pantalla **Cláusulas** en el panel. La
>   migración **semilla sus cláusulas reales generalizadas** (16 por organización).
> - **COND-2**: botón **Cláusula** en la barra del editor; los huecos `{{etiqueta|valor}}` se
>   piden al insertar, con vista previa.
> - **COND-3**: botón **Partida**; la referencia se guarda como `data-partida-ref` y la
>   etiqueta se recalcula al mostrar y al imprimir, con **la misma función** en editor y PDF.
>   Si la partida se borra: `[partida eliminada]` y aviso en rojo.
>
> **Un fallo anterior que salió al abrir el capítulo**: TipTap 3 aborta con *"SSR has been
> detected"* porque Next renderiza el editor también en el servidor; faltaba
> `immediatelyRender: false`. Sin eso, **abrir el capítulo de condiciones revienta la
> pantalla**. No lo introdujo este trabajo.
>
> **Verificado en ejecución**: insertar "Exceso de material" con la cantidad cambiada a 25
> mete el texto ya resuelto; referenciar `01.06 PINTURA DE TECHOS` y renombrarla a
> `01.99 PINTURA DE TECHOS Y ESCALERAS` actualiza sola la condición **en pantalla y en el
> PDF**; borrarla deja `[partida eliminada]` con su aviso. `npm test` **39/39**, `tsc` limpio.
>
> **Publicado en la v0.5.1** (ver abajo).
>
>
>
> **COND-4 (2026-11-10, noche): varias cláusulas de una vez y párrafos que se arrastran.**
> Dos peticiones de Benjamin sobre el capítulo de condiciones:
> - **Selección múltiple**: se marcan varias cláusulas y entran juntas. Cada una pide **sus**
>   huecos por separado (dos cláusulas pueden tener un hueco llamado igual, "unidad", y
>   significar cosas distintas), con vista previa. Se insertan en el mismo orden en que se ven:
>   generales → exclusiones → económicas, que es el del documento.
> - **Reordenar arrastrando** "como las demás partidas", sin salir del capítulo. *(Decisión de
>   Benjamin: tirador en cada párrafo, en vez de convertir cada cláusula en una partida, para
>   no perder el formato rico.)* Al pasar el ratón sale un tirador a la izquierda del párrafo.
>   **Sin dependencias nuevas**: con el ProseMirror que ya trae TipTap.
>
> **Dos trampas que costaron y conviene no repetir**:
> 1. `posAtCoords` devuelve en `inside` la posición **ANTES** del nodo, no una dentro de él.
>    Tratándola como "dentro" sale `depth 0`, se descarta el bloque y el tirador **no aparece
>    nunca**.
> 2. El tirador **no puede colgarse del contenedor del editor**: cuando arranca el plugin,
>    React todavía no lo ha montado (`immediatelyRender: false`). Va al `body` con
>    `position: fixed` y los listeners en `view.dom`, que siempre existe.
>
> **Verificado en ejecución**: tres cláusulas marcadas a la vez con la validez en 45 días y el
> plazo en 48 horas entran con sus datos; el tirador aparece al pasar por encima; y arrastrando
> "LAS PARTIDAS VALORADAS A CERO" del quinto al primer puesto queda reordenado, sin perder ni
> duplicar, y **así se guarda en la base de datos**.
> ⚠️ El arrastre se probó lanzando **eventos de arrastre reales** sobre el editor, porque el
> arrastre sintético del navegador de pruebas no dispara el drag-and-drop nativo. La lógica está
> verificada de punta a punta, pero **falta probarlo con el ratón**.
>
> **Pendiente**: COND-4 no está en la 0.5.1 (se publicó antes). Va en la siguiente.
>
> **RELEASE v0.5.1 PUBLICADA (2026-11-10).** Bump en los tres `package.json` + lock, merge
> `--no-ff` a `develop` (`b58e944`), las dos ramas **pusheadas** y release en GitHub con
> `ConstruGest-0.5.1.msi` (453 MB), **Latest** según la API.
>
> **Comprobado antes de publicar**: gate de secretos (1.555 ficheros, sin credenciales) y,
> leyendo la tabla `File` del instalador (4.964 ficheros), que viaja dentro **la migración
> nueva `005_clausulas_condiciones`** junto a las cuatro anteriores, y **cero credenciales**.
>
> **REL-CLEAN**: borrado el `.msi` local de 0.4.9; quedan **0.5.0 (anterior) y 0.5.1 (actual)**.
> Los publicados en GitHub, intactos.
>
> **Al instalar, mirar**: que el log diga `[migraciones] aplicadas 1: 005_clausulas_condiciones.sql`
> **una sola vez**; que en Panel → **Cláusulas** aparezcan las 16 cláusulas; y que al abrir el
> capítulo de condiciones de un presupuesto salgan los botones **Cláusula** y **Partida**
> (antes de esta versión, abrir ese capítulo dejaba la pantalla en blanco).
>
> ### Anterior (2026-11-10): PRES-2 + PRES-3 + PRES-5: el bloque PRES, cerrado
>
> **PRES-2 — Anexo de mediciones por zona.** Las mediciones ya se guardaban y
> alimentaban la cantidad de la partida, pero no salían en el PDF y no decían DÓNDE
> se mide. Ahora: columna **Zona** en la tabla de mediciones (con las zonas ya escritas
> en ese presupuesto como sugerencia, para no acabar con la misma zona de diez maneras)
> y **ANEXO I. MEDICIONES POR ZONA** al final del PDF: por capítulo, tabla cruzada
> zona × partida con el total de cada columna, igual que la del PDF de su hermano. Las
> zonas se ordenan por el `sort_order` más bajo con el que aparecen (si no, una zona que
> solo toca una partida se descolgaba al final); las mediciones sin zona van a
> "Sin zona asignada" para que los totales cuadren; un capítulo con muchas partidas se
> parte en bloques de 5 columnas.
> *Verificado* con las mediciones REALES del ANEXO I de Parque Fórum (11 zonas,
> 4 partidas): las cantidades que calcula la app salen **93,80 / 28,50 / 112,25 / 244,69**,
> idénticas al PDF original.
>
> **PRES-3 — Anexo fotográfico por zonas.** Tabla `cons_budget_photos` que NO duplica el
> fichero: apunta a la foto ya subida al proyecto y le añade zona, pie y orden. Panel
> "Fotos" en el presupuesto con selector de miniaturas, y **ANEXO II. REPORTAJE
> FOTOGRÁFICO** en el PDF, agrupado por zona y con pie numerado ("Foto 1. …").
> Las fotos se **reescalan a 1100 px y se pasan a JPEG**: una de móvil de 4000×3000 entra
> como 29 KB, y veinte fotos son 0,56 MB en vez de 5,19 MB. Si una foto no carga, se salta
> en lugar de romper el PDF.
> *Un aviso para el futuro*: el día anterior di por fallado el guardado de zona/pie porque
> disparando el `blur` desde la consola no llega al `onBlur` de React (escucha `focusout`).
> **Escribiendo con el teclado de verdad sí guarda.** Si una prueba por consola dice que
> algo no se guarda, comprobarlo a mano antes de tocar el código.
>
> **PRES-5 — GG + BI y cuadro de descompuestos.** `overhead_pct` y `profit_pct` llevaban
> desde el principio en la BD y en Ajustes **sin usarse en ningún cálculo**. Ahora, si se
> ponen a más de 0, el presupuesto pasa a ser **por contrata**: PEM → GG → BI → **PEC** →
> IVA → TOTAL (el IVA sobre el PEC), la portada dice "DE EJECUCIÓN POR CONTRATA" y el panel
> de totales enseña los dos porcentajes con su importe. A 0 —como nacen los presupuestos
> nuevos— no cambia nada. Y **ANEXO III. CUADRO DE PRECIOS DESCOMPUESTOS**, por partida,
> **solo con "Versión interna" activada**: son COSTES, no precio de venta, y al cliente no
> se le mandan (comprobado: con la versión interna apagada el documento pasa de 9 a 8
> páginas y el anexo desaparece). Nuevo endpoint `GET /budgets/:id/breakdown`.
>
> **⚠️ Cambio de comportamiento de PRES-5**: un presupuesto que YA tuviera GG/BI guardados
> distintos de 0 pasa a calcular PEC y **su total sube**. Los que crea la app nacen con 0,
> pero conviene mirar el panel de totales de los presupuestos que ya existan: ahora se ve
> el % y el importe de cada concepto, y se pone a 0 si no se quiere.
>
> **Verificado en ejecución** (Docker + frontend dev + login real): GG 13% y BI 6% sobre un
> PEM de 7.179,47 € dan 933,33 + 430,77 → PEC 8.543,57 → IVA 1.794,15 → **TOTAL 10.337,72 €**,
> lo mismo en el panel, en el lateral de la vista previa y en el PDF, con el total en letra
> al día; el cuadro de descompuestos con 4 líneas y coste/ud 18,76 € (igual que el endpoint);
> el ANEXO II con las fotos por zona y sus pies. `npm test` **39/39** y `tsc --noEmit` limpio.
>
> **El bloque PRES queda cerrado** (PRES-1 a PRES-5). Nada pusheado todavía.
>
>
>
> **RELEASE v0.5.0 PUBLICADA (2026-11-10).** Versión de funciones, no parche. Bump en los
> tres `package.json` + lock del backend, merge `--no-ff` a `develop` (`585fce3`), las dos
> ramas **pusheadas** a `origin` y release en GitHub con
> `ConstruGest-0.5.0.msi` (453 MB), marcada **Latest** por la API.
>
> **Comprobado ANTES de publicar** (lo que importaba de esta versión):
> - **Gate de secretos**: 1.529 ficheros revisados, sin credenciales.
> - **Las 4 migraciones viajan DENTRO del `.msi`** — leída la tabla `File` del instalador
>   (4.938 ficheros): `001_clientes`, `002_condiciones_oferta`, `003_zona_mediciones` y
>   `004_anexo_fotografico`. Era lo crítico: si no viajaran, la base de datos ya instalada
>   no recibiría las columnas nuevas y el backend daría errores de SQL. En la misma lectura,
>   **cero ficheros de credenciales**.
> - Las dos migraciones viejas de Supabase también están en el paquete (viven en
>   `backend/migrations/`, no en `migrations/mariadb/`), pero el migrador **no las ejecuta**
>   y hay un test que lo vigila.
>
> **REL-CLEAN**: borrado el `.msi` local de 0.4.8 (−452,9 MB); en `desktop/dist` quedan
> **0.4.9 (anterior) y 0.5.0 (actual)**. Los `.msi` publicados en GitHub no se han tocado
> (0.4.6 a 0.5.0).
>
> **PENDIENTE**: Benjamin instala la 0.5.0 desde el aviso de la propia app y prueba en
> producción. Lo primero que hay que mirar al arrancar: el log debe decir
> `[migraciones] aplicadas 4: …` **una sola vez**, y a partir de ahí ninguna. Después:
> el selector de cliente en Ajustes del proyecto, el panel de Fotos, y el PDF con sus
> anexos. **Ojo al panel de totales de los presupuestos que ya existan**: si alguno tiene
> gastos generales o beneficio industrial distintos de 0, ahora calcula PEC y su total sube.
>
> ### Anterior (2026-11-09): PARSE-1 — un PDF de presupuesto ajeno daba error al importar
> **Síntoma de Benjamin**: "ayer intenté subir este pdf para un proyecto nuevo y me dio error;
> yo pienso que será porque tiene imágenes". El PDF: `Presupuesto_2026-023_Parque_Forum.pdf`
> (23 páginas, 2,6 MB; lo redactó su hermano con ChatGPT para un cliente).
>
> **No eran las imágenes.** Causa real, REPRODUCIDA fuera de la app (texto extraído con el
> mismo código del diálogo + `parseBudgetFromText`), no supuesta: el PDF **sí tiene capa de
> texto** y pdfjs la extrae entera (8.315 caracteres, 205 líneas). Lo que no se contemplaba es
> su formato: **partida en UNA SOLA LÍNEA**, con la unidad DETRÁS del título —
> `01.01 PROTECCIÓN DE ZONAS COMUNES    ud 1,00 680,00 € 680,00 €` — y la descripción larga en
> las líneas siguientes. Ninguno de los parsers lo cogía:
> 1. **Algorítmico por separadores**: el PDF no tiene líneas `______` → 0 partidas.
> 2. **Inline**: `detectPartidaStart()` exige la unidad justo DETRÁS del código, y su patrón
>    de respaldo descarta la línea **precisamente por llevar summary**
>    (`&& !checkInlineSummary(line)`); y `checkInlineSummary()` solo se consulta **si ya hay
>    una partida abierta**. Resultado: la línea se perdía entera.
> 3. `validateAndClean()` tira los capítulos sin partidas → `chapters: []` → el diálogo suelta
>    **"No se pudieron extraer capítulos del texto"**. Ese es el "error" que vio.
> *(La IA local no tapa el agujero: Ollama solo entra después, con los primeros 15.000
> caracteres, y si no está levantado el fallo se queda en los `logs` — que la UI no muestra.)*
>
> **PARSE-1** ([`budget-parser.js`](../backend/src/services/budget-parser.js)), 3 cambios:
> - `detectOneLinePartida()`: partida de una línea (código + título + unidad + cantidad ·
>   precio · importe). La unidad se busca al final del texto y, si no, detrás del código. La
>   partida queda ABIERTA para que las líneas siguientes sean su descripción.
> - `isAnnexHeading()`: `ANEXO` / `ANEJO` / `APÉNDICE` / `REPORTAJE FOTOGRÁFICO` cierran la
>   partida en curso y se ignora todo hasta el siguiente CAPÍTULO. Sin esto, la tabla de
>   mediciones por zona y los pies de foto se colaban como descripción (o como mediciones)
>   de la última partida del capítulo.
> - `isPageNoise()`: pie de página **con texto delante** ("EMPRESA  Presupuesto 2026-023 — 9
>   de noviembre  Página 3 de 23"). Antes solo se quitaba "Página 3" a secas, así que el pie
>   se pegaba al final de la descripción de la última partida de cada capítulo.
>
> **Verificado en ejecución** (parser real contra el PDF real, sin IA):
> - **15/15 partidas** en sus 2 capítulos, con código, unidad, cantidad y precio exactos.
> - PEM calculado **14.547,37 €** vs **14.547,38 €** del PDF (1 céntimo: el PDF redondea
>   112,25 × 10,50 = 1.178,625 → 1.178,63). Subtotales por capítulo cuadrados.
> - **Sin regresión**: mismo parser ANTES/DESPUÉS sobre el fixture de Ogijares
>   (`backend/test-pdf-output.txt`, formato PRESTO con separadores) → idéntico: 26 capítulos,
>   149 partidas, 293 mediciones, 95.426,76 €. `node --check` y `npm test` (20/20) OK.
>
> **PENDIENTE de decidir (Benjamin)** — ver "PARSE-2 / PRES-x" más abajo. Lo que sigue roto o
> corto en el import de PDFs ajenos, y hasta dónde puede llegar el modelo de presupuesto.
>
>
> ### PARSE-2 (2026-11-09, mismo día): que un PDF ajeno NO acabe en "error" a secas
> Con PARSE-1 entra el PDF de Parque Fórum, pero siempre habrá un formato nuevo. Esto es lo que
> pasaba cuando fallaba — y dos cosas que se vieron **solo al usarlo en el navegador**:
> - **El motivo se tiraba.** El backend devuelve `logs` con la traza (qué parser entró, cuántas
>   partidas, por qué se descartaron) y la UI no los pintaba; el `catch` de `handleAnalyze`
>   descartaba el mensaje real del servidor y ponía siempre "Error al analizar el texto con IA".
> - **PDF escaneado = camino muerto.** Sin capa de texto el botón "Analizar" quedaba
>   **deshabilitado**, así que el OCR local del backend **no se podía alcanzar** desde la UI.
> - `extractTextFromPdf` hacía `catch { return '' }`: PDF cifrado, corrupto o worker de pdfjs
>   inaccesible daban todos el mismo aviso mudo.
>
> **Hecho** ([`ImportBudgetDialog.tsx`](../frontend/src/components/budget/ImportBudgetDialog.tsx),
> [`routes/ai.js`](../backend/src/routes/ai.js)):
> - Panel con **el motivo + la traza del parser** bajo el cuadro de texto, y el mensaje REAL del
>   servidor en el `catch`. `extractTextFromPdf` ya no se traga la causa: la propaga.
> - **"Analizar con OCR"**: sin texto pero con PDF, el botón se habilita, cambia de nombre y manda
>   solo el `pdfBase64` → OCR local. Aviso amarillo explicando que es lento y que depende de que el
>   servidor lleve tesseract (en el `.msi` todavía NO va: sigue en Pendientes conocidos).
> - La ruta acumula la traza de **texto + OCR**: antes, si el texto fallaba y luego el OCR no estaba
>   disponible, el motivo del primer intento se perdía.
> - Base64 **por trozos de 32 KB** (el bucle byte a byte congelaba la pestaña) y tope de **35 MB**
>   por fichero (el backend acepta 50 MB de JSON y el base64 crece un 33%).
> - **Red de seguridad**: [`backend/tests/budgetParser.test.js`](../backend/tests/budgetParser.test.js),
>   un caso por formato (una línea, separadores PRESTO con mediciones, anexos, descartes) + el
>   fixture real de Ogijares como guardián. `npm test`: **31/31**.
>
> **Dos fallos que solo aparecieron usando la pantalla** (y por los que existe la REGLA Nº1):
> 1. **Texto del fichero anterior.** Al cargar un PDF sin capa de texto se quedaba el texto del PDF
>    ANTERIOR en el cuadro: se analizaba el documento equivocado sin avisar. Ahora se limpia.
> 2. **El panel salía fuera de la vista.** El diálogo tiene scroll y el motivo quedaba por debajo:
>    parecía que pulsar "Analizar" no hacía nada (me pasó a mí probándolo). Ahora el panel se trae
>    solo a la vista. Y los colores: en tema oscuro `globals.css` repinta `text-gray-600/700` en
>    claro, y sobre un fondo `bg-*-50` el texto quedaba **invisible** (la traza salía como una
>    columna de emojis sueltos). Se usa la familia de color del panel, como el resto del diálogo.
>
> **Verificado en ejecución** (Docker: MariaDB + backend recompilado; frontend dev en :3000; login
> real `admin@construgest.local`), los tres caminos en pantalla:
> - PDF de Parque Fórum → **"Se encontraron 2 capítulos, 15 partidas"** con sus importes (680,00 /
>   2.063,60 / 1.178,63 / 2.569,25…) y subtotal de capítulo 9.195,87 €.
> - Texto que no es un presupuesto → panel rojo con el motivo y la traza completa, incluido
>   "🤖 Intentando extracción con IA…" y "⚠️ IA no pudo extraer partidas válidas".
> - PDF **sin capa de texto** (uno mínimo creado a mano) → aviso amarillo, botón "Analizar con OCR",
>   y respuesta del OCR real: "OCR: 0 caracteres extraídos / ⚠️ El OCR no extrajo texto legible".
> - Y por `curl` contra el backend: el **OCR local del PDF real de 23 páginas** devuelve los **mismos
>   2 capítulos y 15 partidas** (14.547,37 €) en **57 s** — o sea, el camino que estaba muerto ahora
>   resuelve el presupuesto entero. `tsc --noEmit` limpio.
>
>
> ### MIG-1 + PRES-1 + PRES-4 (2026-11-09): el presupuesto se acerca al modelo "completo"
>
> **MIG-1 — migrador de esquema (lo que desbloquea todo lo demás).** Antes de tocar el
> modelo se vio que **no había forma de que una columna nueva llegara a la app ya
> instalada**: `database/init/01_schema.sql` solo se aplica si la BD **no existe**
> (`desktop/main.js:404`), y en Docker solo al crear el volumen. Una columna nueva habría
> dado errores de SQL en tu instalación. Ahora el backend aplica al arrancar los `.sql`
> pendientes de [`backend/migrations/mariadb/`](../backend/migrations/mariadb) y los anota en
> `cons_schema_migrations`; si una falla, **lo dice claro y no arranca** (nada de servir con
> el esquema a medias). Idempotentes (`ADD COLUMN IF NOT EXISTS`, comprobado contra MariaDB
> 11.4). Las migraciones viejas de `backend/migrations/*.sql` son de Supabase (Postgres) y
> NO se ejecutan. Viajan dentro del `.msi` (el robocopy del build copia `/E`).
> *Verificado*: se aplican al arrancar, al reiniciar no se repiten, y relanzando una a mano
> el traspaso de datos no duplica nada.
>
> **PRES-1 — ficha de cliente reutilizable + cliente en la portada.** El PDF no imprimía
> NINGÚN dato del cliente y el cliente era texto suelto en el proyecto, sin NIF ni dirección,
> reescrito en cada obra. Ahora: tabla `cons_clients` por organización (nombre, razón social,
> NIF, dirección fiscal, contacto, baja lógica), `cons_projects.client_id`, API `/api/clients`,
> **pantalla Clientes** en el panel y **selector de ficha** en Ajustes del proyecto que avisa
> en ámbar si falta el NIF o la dirección. La migración **convierte los `client_name` que ya
> existían en fichas** y enlaza los proyectos (la dirección del proyecto NO se copia: es la de
> la OBRA). En la portada sale `Cliente: <razón social>` y debajo
> `NIF/CIF … · dirección, CP, ciudad` (ciudad y provincia iguales → una sola vez).
> *(Decisión de Benjamin: ficha reutilizable, no campos sueltos en el proyecto.)*
>
> **PRES-4 — condiciones de la oferta, guardadas.** Antes se escribían en el modal del PDF y
> **se perdían al cerrar**. Ahora: `cons_budgets.conditions`, **plantilla por defecto** en
> Ajustes → Valores por Defecto (validez, forma de pago, plazo, garantía, exclusiones), el
> presupuesto NUEVO nace con ella dentro, y el modal **guarda al salir del campo**. Retocar un
> presupuesto no toca la plantilla. La sección del PDF pasa a llamarse
> "CONDICIONES DE LA OFERTA".
>
> **Un fallo que solo salió probándolo**: la plantilla se precargaba desde el navegador, pero
> **la pantalla de presupuesto no carga el store de ajustes**, así que llegaba vacía y el
> presupuesto nuevo nacía sin condiciones. Se resuelve ahora en el **backend**, que siempre
> tiene el dato.
>
> **Verificado en ejecución** (Docker + frontend dev + login real), de punta a punta: la
> pantalla de Clientes; el selector en Ajustes del proyecto; **la portada del PDF con
> "C.P. EDIFICIO PARQUE FORUM / NIF/CIF H19544071 · C/ Omeya 14, 18006, Granada"**; la
> plantilla escrita en Ajustes y guardada en `cons_app_settings`; un presupuesto NUEVO creado
> desde la pantalla que nace con ella; el texto editado en el modal apareciendo cambiado en la
> BD al salir del campo; y la página final "CONDICIONES DE LA OFERTA" en el PDF.
> Por `curl`: alta/edición/listado de clientes y rechazo con nombre vacío (400).
> `npm test` **39/39** y `tsc --noEmit` limpio.
>
> **Quedan del bloque PRES**: PRES-2 (anexo de mediciones, y la tabla por zona), PRES-3
> (reportaje fotográfico por zonas) y PRES-5 (GG+BI / descompuestos: decisión de negocio,
> PEM o PEC). **Nada pusheado todavía** — se pushea cuando esté todo.
>
> ### Anterior (2026-11-07): LOGIN roto — un backend VIEJO ocupaba el puerto 5000
> **Síntoma de Benjamin**: "no me deja entrar; meto el PIN y vuelve a la pantalla del PIN,
> pruebo con email y contraseña y vuelve al inicio de sesión, como si no se ejecutara el
> proceso". Hasta ese día sí entraba.
>
> **Causa real (vista en el log de la app instalada y reproducida con curl, no supuesta):**
> en la carpeta de Inicio de Windows había `ConstruGest-Backend.lnk` **del 22/03/2026** (de la
> época en la nube) que arrancaba `%LOCALAPPDATA%\ConstruGest\backend\start-local.vbs` →
> el **backend v0.1.0 con `src/db/supabase.js`**. Ese proceso cogía el **puerto 5000** al iniciar
> sesión en Windows. Cadena completa:
> 1. El backend de la 0.4.8 moría con `EADDRINUSE :::5000` (`app.js:147`).
> 2. El lanzador **decía "backend listo" igualmente**: `waitForHttp` aceptaba *cualquier*
>    respuesta HTTP del puerto, y nadie vigilaba la muerte del hijo. `killPortWindows` no
>    consiguió identificar al okupa (el log: "sigue ocupado", sin línea de PID) y **seguía**.
> 3. El login iba al backend de la nube → `401 {"error":"Credenciales incorrectas"}` (los
>    usuarios están en la MariaDB local del 3308). Comprobado con curl contra el okupa.
> 4. `api.ts:33-38` trataba ese 401 como sesión caducada → `window.location.href='/login'`,
>    y la **recarga borraba el mensaje** antes de verse; con PIN, de vuelta a la pantalla del PIN.
>
> **En el equipo de Benjamin (hecho, con su OK):** muerto el proceso viejo, borrado el acceso
> directo del Inicio (copia de seguridad guardada) y reabierta la app → `/api/version` da 0.4.8
> y el log dice `API running on port 5000`. **Entra.** El histórico del log confirma que todos
> los arranques anteriores levantaron su propio backend (el último limpio, 30-oct 16:32) y que
> los fallos empiezan el 7-nov a las 11:12.
>
> **Arreglos en código (4 slices, verificados en ejecución):**
> - **LAUNCH-1** (`desktop/main.js`): "backend listo" solo si contesta NUESTRO backend
>   (`INSTANCE_ID` por env que `/api/health` devuelve) y si el hijo sigue vivo; `netstat` sin
>   `-p tcp` (sólo listaba IPv4) + respaldo por PowerShell `Get-NetTCPConnection`; si el puerto
>   sigue ocupado **se aborta con un aviso** que dice qué hacer (antes solo se escribía en el
>   log); instancia única; `shutdown` con flag y sin matar hijos ya muertos.
> - **BACK-1** (`app.js`, `realtimeHub.js`): `server.on('error')` → mensaje claro y salida 1 en
>   vez del volcado de Node por el `'error'` sin manejar del WebSocketServer.
> - **BACK-2** (`routes/auth.js`, `middlewares/auth.js`): un fallo de BD ya no se disfraza de
>   "Credenciales incorrectas" → **503** + causa real en el log. `/auth/me` solo da 401 si el
>   problema es el token.
> - **UI-1** (`api.ts`, `authStore.ts`, `PinGate.tsx`, `admin/layout.tsx`): el 401 del login se
>   VE en pantalla (sin recarga); `checkAuth` solo cierra sesión con 401 y reintenta una vez;
>   el PIN distingue "PIN mal" de "login falló" y, si las credenciales guardadas caducaron,
>   borra el vault y lo dice; backend caído → aviso con "Reintentar" en vez de spinner eterno.
>
> **Verificado**: contra una COPIA de la BD de producción (MariaDB aparte en :3318, datadir
> copiado con la app cerrada) — login 200 / contraseña mala 401 / BD inalcanzable 503 /
> `/auth/me` y `/api/projects` 200; puerto ocupado → mensaje claro y exit 1; y en el navegador
> (frontend dev) el mensaje de error sin recarga, el camino feliz, el backend caído con
> "Reintentar" y los dos caminos del PIN. `tsc --noEmit` limpio.
>
> **VER-1 (mismo día, encontrado al publicar)**: nada más publicar, Benjamin pulsó
> **Comprobar** en *Acerca de* y le seguía diciendo que no había actualización. Causa:
> `version.js` guarda la respuesta de GitHub **1 hora en memoria** y no había forma de
> saltarse esa copia; el botón solo saltaba la comprobación del cliente (`versionStore`).
> Arreglado: `fetchLatestRelease({force})` / `getVersionStatus({force})`,
> `GET /api/version?force=1` y `load(true)` manda `force=1` al servidor. El banner automático
> sigue usando la caché (no más tráfico a GitHub del necesario). Verificado en ejecución:
> con un repo inexistente, 3 peticiones (sin force, sin force, con force) hacen **solo 2
> consultas reales** a GitHub.
>
> Bump **v0.4.9** en los 3 `package.json` + lock del backend. **La 0.4.9 se publicó dos
> veces**: la primera (target `d08aee2`) se borró con `gh release delete --cleanup-tag`
> cuando apareció VER-1, porque tenía **0 descargas** y nadie la había instalado; se
> reconstruyó el `.msi` con el arreglo dentro y se republicó. Merge `--no-ff` a `develop`
> (`d08aee2` + `0336d6b`), ambas ramas pusheadas, `.msi` construido (gate de secretos OK:
> 1497 ficheros, sin credenciales) y **RELEASE v0.4.9 PUBLICADA** (GitHub, Latest,
> `ConstruGest-0.4.9.msi` 452,9 MB, target = merge de develop `0336d6b`).
>
> Verificado **antes de publicar** arrancando el backend y el frontend **EMPAQUETADOS**
> (runtime de Electron, contra copias de la BD en :3319 y :3320): `/api/version` da 0.4.9 y
> `?force=1` consulta a GitHub de verdad; login correcto 200, contraseña mala 401 (y en el
> navegador, "Credenciales incorrectas" **en pantalla y SIN recarga**), `/auth/me` y
> `/api/projects` 200, y un segundo backend sobre el 5000 ocupado → "FATAL: el puerto 5000 ya
> está ocupado…" y exit 1 sin volcado. Tras publicar, la API de GitHub da `v0.4.9` como
> *latest* (los primeros segundos aún devolvía la anterior: desfase de la CDN, se pasa solo).
>
> *A saber*: durante las pruebas, una consulta al backend empaquetado contra la BD de la app
> dio **503 "No se puede acceder a la base de datos"** con `ECONNREFUSED 127.0.0.1:3308` en
> el log, porque Benjamin acababa de cerrar la app. Es BACK-2 funcionando en vivo: antes eso
> habría salido como "Credenciales incorrectas".
>
> **HECHO**: Benjamin instaló la 0.4.9 **desde el propio aviso de actualización de la app**
> (el log muestra la descarga de 453 MB y el instalador) y **confirmó que entra**. Verificado
> en su equipo: `resources/app` y `resources/backend` en 0.4.9, los arreglos presentes en los
> ficheros instalados, arranque limpio (`API running on port 5000`, "backend listo", **cero
> EADDRINUSE**) y la comprobación **forzada** de versión consultando a GitHub de verdad
> (`checkedRemote: true`). **REL-CLEAN al día**: borrado el `.msi` local de 0.4.7 (−452,9 MB);
> en `desktop/dist` quedan **0.4.8 (anterior) y 0.4.9 (actual)**. Los `.msi` publicados en
> GitHub no se han tocado.
>
> **PENDIENTE**:
> - Sin probar dentro del `.msi` ya instalado: `freeOwnedPorts` (solo corre con
>   `app.isPackaged`), es decir el aborto con diálogo cuando un puerto no se libera. Se vería
>   solo si vuelve a aparecer un okupa en el 5000/3000/3308.
> **CERRADO el mismo día (seguridad)**: la carpeta `%LOCALAPPDATA%\ConstruGest\` y su acceso
> directo del Inicio los borró Benjamin, y después **eliminó entero el proyecto Supabase
> APP360** — ya no queda nada en la nube, así que la service-role key que estaba en claro en
> aquel `.env` murió con el proyecto y no hay nada que revocar. Verificado además que **esa
> clave nunca viajó en un `.msi`**: ya en el `build-msi.ps1` de la v0.3.4 el copiado del
> backend excluía `.env`, `.env.example` y `.env.sample`. Actualizados `CLAUDE.md` §0.1 y el
> comentario de `routes/auth.js` que aún decían cómo "volver a la nube".
>
> **SEC-2 (cerrado el mismo día): instaladores públicos con las credenciales de Google.**
> El repo es **público** y varias releases conservaban su `.msi`. **Verificado abriendo el
> `.msi` de la v0.3.4** (descargado de GitHub; leída su tabla de ficheros, 4.899 entradas):
> lleva dentro `google-vision-key.json` y `construgest-web-23e7ee55f786.json` (la MISMA
> cuenta de servicio `construgest-ocr@construgest-web.iam.gserviceaccount.com`, clave
> `23e7ee55…`), y **ningún `.env`** → la clave de Supabase nunca viajó en un instalador.
> Mirando el `build-msi.ps1` de cada versión, la exclusión de esos JSON entró en la **v0.4.6**
> (commit `ae10472`, SEC-1), así que estaban afectadas **v0.2.0–v0.3.4 y también la v0.4.5**
> (se le pasó a la limpieza anterior, que solo quitó v0.4.0 y v0.4.1). **Borrados los 7
> adjuntos** (releases, notas y etiquetas intactas); quedan con `.msi` **0.4.6, 0.4.7, 0.4.8
> y 0.4.9**. Benjamin **eliminó la cuenta de servicio** en Google Cloud, así que esas
> credenciales ya no valen para nada. Comprobado además que **nunca se commitearon** (están
> en `.gitignore`; el único `private_key` del historial es el patrón del propio gate).
>
> **Borrados del disco** los dos ficheros de credenciales de `backend/`
> (`google-vision-key.json` y `construgest-web-23e7ee55f786.json`), ya inútiles: no hay
> dependencias `@google-cloud/*`, el OCR es local con tesseract y la única mención a "vision"
> es un comentario de `dxf-service.js:426`. Barrido posterior del repo: **no queda ningún**
> fichero de credenciales (`*credential*.json`, `*-key.json`, `*.pem`, `*.p12`, `*.pfx`,
> `id_rsa`, `*.keystore`). Siguen en el `.gitignore` y en las exclusiones del build por si
> alguna vez reaparecen. Benjamin está además eliminando sus proyectos de Google Cloud
> (`construgest-web` entre ellos): Construgest **no depende de ninguno**.
>
> ### Anterior (2026-10-17): BAK-1 + BAK-2 — copias de seguridad rotas desde la migración
> **Síntomas de Benjamin**: "Backup de todos los proyectos" da error, y restaurar solo deja
> hacerlo con todos a la vez.
>
> **BAK-1 — causa real (vista en `construgest.log` de la app instalada y reproducida con curl):**
> la ruta de backup usaba `.match()`, que `db/local.js` **nunca implementó** →
> `supabase.from(...).select(...).match is not a function` en TODOS los proyectos (solo llegaba
> a escribir `project.json`). El auto-backup de `useAutoSync` fallaba igual, en silencio.
> **Desde la migración a MariaDB (julio) no se hizo ningún backup**; los `_backup` que había en
> las carpetas eran de la nube (22-mar → 1-jul). Y el restaurar **nunca se ejecutaba**:
> `POST /:id/restore` estaba duplicado y ganaba el de la papelera (cerrado el BUG "restore
> duplicado" de Pendientes conocidos). Nuevo [`services/project-backup.js`](../backend/src/services/project-backup.js),
> directo a MariaDB:
> - Backup de **21 tablas** (antes faltaban enlaces certificación↔parte, comparaciones y
>   extracciones de planos) + ficheros por `storage_path`. Carpeta temporal y cambio al final
>   (un backup a medias no machaca el bueno). ~0,15 s por proyecto.
> - Restaurar **SUSTITUYE** los datos del proyecto (decisión de Benjamin) en UNA transacción,
>   tras guardar copia del estado actual en `_backup_antes_de_restaurar_<fecha>`. Lee también
>   los backups de la nube (filtra columnas que ya no existen; ficheros por `original_name`).
>   Referencias externas desaparecidas (material, proveedor) → NULL + aviso.
> - Rutas: `POST /:id/backup`, `POST /:id/restore-backup` (nueva), `GET /projects/backups`.
>
> **BAK-2 — UI** ([`components/settings/BackupSection.tsx`](../frontend/src/components/settings/BackupSection.tsx)):
> lista de proyectos con fecha del último backup (marca "copia antigua (nube)"), casillas +
> "Seleccionar todos", "Restaurar seleccionados (N)" con confirmación. Fuera el restaurar-todos.
> Timeout largo (localApi tenía 5 s) y error real por proyecto en el aviso.
>
> **Verificado** sobre una COPIA de la BD de producción (MariaDB aparte en :3318, datadir
> copiado con la app cerrada) y de las carpetas (`C:\Users\benja\construgest-smoke`): los 14
> proyectos hacen backup→restore→backup **byte a byte idénticos**; subcapítulos, descompuestos,
> comparaciones, enlaces RESTRICT parte↔certificación y material borrado; backup de la nube con
> PDF; 400 sin backup / de otro proyecto; backup corrupto → rollback (datos intactos). En el
> navegador: backup de todos, restaurar 2 marcados, seleccionar todos, aviso de éxito.
>
> *A saber*: con el auto-backup funcionando, `_backup` se reescribe 5 s después de cada cambio
> → sirve para recuperar tras perder la BD/reinstalar, no para "deshacer lo de ayer". Las copias
> `_backup_antes_de_restaurar_*` se acumulan (una por restauración); no se limpian solas.
> Benjamin decidió dejar que los backups viejos de la nube se sustituyan.
>
> Bump **v0.4.8** en los 3 `package.json` + lock del backend. Merge `--no-ff` a `develop`
> (`7d9606a` y `5019fb7`), ambas ramas pusheadas, `.msi` construido (gate de secretos OK: 1497
> ficheros, sin credenciales) y **RELEASE v0.4.8 PUBLICADA** (GitHub, Latest, `ConstruGest-0.4.8.msi`
> 474,9 MB, target = merge de develop `5019fb7`). Verificado **antes de publicar** arrancando el
> backend y el frontend EMPAQUETADOS (runtime de Electron, contra la BD de prueba): `/api/version`
> da 0.4.8, `/projects/backups`, backup y restore-backup OK; Ajustes responde 200.
> **build-msi.ps1**: WiX 3.14 ya no está en Program Files en este equipo → ahora usa también el de
> Tauri (`%LOCALAPPDATA%\tauri\WixTools314`).
> **HECHO**: Benjamin instaló la 0.4.8 y confirmó que backup y restaurar funcionan. **REL-CLEAN al
> día**: borrado el `.msi` local de 0.4.6; en `desktop/dist` quedan **0.4.7 (anterior) y 0.4.8
> (actual)**. Borrada la carpeta de pruebas `C:\Users\benja\construgest-smoke` (215 MB). Los
> `.msi` publicados en GitHub no se han tocado.
>
> ### Anterior (2026-08-21): PDF-2 — la negrita del PDF era Medium (500), no Bold (700)
> Benjamin probó la 0.4.6 y avisó: la negrita **se ve, pero más floja que en pantalla**
> ("se oscurece un poco, casi imperceptible"). **No era del conversor de PDF-1: es pdfmake.**
> Su `vfs` solo empaqueta Roboto Regular, Medium, Italic y MediumItalic, y su
> `defaultClientFonts` mapea `bold` → **Roboto-Medium** (`pdfmake.js:44209`). Confirmado
> leyendo la tabla OS/2 de los ficheros, no suponiendo: `Roboto-Medium.ttf` declara
> `usWeightClass` **500**, mientras el editor pinta `<strong>` a 700. Le pasaba a **toda** la
> negrita del PDF (banners de capítulo, cabeceras de tabla, subtotales, TOTAL), no solo al
> capítulo libre; venía así desde la primera release.
>
> Solución: incrustar **Roboto-Bold y Roboto-BoldItalic** (peso 700 verificado en OS/2, name
> table "Roboto Bold"/"Roboto Bold Italic") en
> [`frontend/src/services/robotoBoldData.ts`](../frontend/src/services/robotoBoldData.ts),
> siguiendo el patrón de `afmData.ts`, y que `getFonts()` devuelva un dict Roboto que apunte
> a ellas. Los **3 exportadores** (presupuesto, certificación y muestra de Ajustes) pasan por
> `getFonts()`, así que la negrita queda igual en los tres.
>
> **Riesgo de caracteres perdidos: descartado midiendo.** Se parseó la tabla `cmap` de las
> fuentes nuevas → **927 code points, exactamente los mismos** que la Roboto-Medium que se
> usaba antes para la negrita (**0 pérdidas**). El primer intento sí era peligroso: el TTF que
> sirve gstatic por defecto viene **subseteado** (44 KB, faltaban ‡ ≈ ≠ ≤ ≥ y 516 code points
> más); se rehízo pidiendo todos los subconjuntos (128 KB). Verificado además generando un PDF
> con acentos, ñ, ü, ç, ¿?¡!, «», €, º, ª, —, •, ≤, ≥, ≈, ½, ²³, ©®™ y § en negrita y
> negrita-cursiva: salen todos.
>
> **Verificado en ejecución (prueba diferencial)**: la línea en negrita pasa de **415,70 a
> 419,36 pt** de ancho (fuente más pesada) y la línea normal queda **IDÉNTICA** (411,33) → el
> cambio afecta solo a la negrita. E2E por el servicio real (`generateBudgetPdfBlob`) sobre un
> presupuesto: "SUBTOTAL:" 43,94 → 44,41 y "Concepto" 34,28 → 34,34. `tsc --noEmit` limpio.
> Fuente: Roboto de Google Fonts, **SIL Open Font License 1.1**.
>
> **Limpieza de releases (REL-CLEAN, hecha)**: borrados los `.msi` locales de 0.4.2/0.4.3/0.4.4
> (**−1,36 GB**), conservados 0.4.5 (anterior) y 0.4.6. Y **cerrado el pendiente de SEC-1**:
> borrados de GitHub los `.msi` de **v0.4.0 y v0.4.1**, los dos últimos que llevaban dentro la
> clave de Google (ya revocada); las releases y sus notas siguen ahí, solo se quitó el adjunto.
> Quedan con `.msi` publicado 0.4.5 (para revertir) y la última.
>
> Bump **v0.4.7** en los 3 `package.json` + lock del backend. Merge `--no-ff` a `develop`
> (`6fe1114`), ambas ramas pusheadas, `.msi` construido (gate de secretos OK: 1496 ficheros,
> sin credenciales) y **RELEASE v0.4.7 PUBLICADA** (GitHub, Latest, `ConstruGest-0.4.7.msi`
> 474,9 MB, target = merge de develop `6fe1114`). Verificado **antes de publicar** que el
> payload lleva la fuente nueva Y el conversor de PDF-1, y `package.json` 0.4.7 en
> `resources/app`. La API de GitHub ya da `v0.4.7` como *latest*.
> **REL-CLEAN al día**: Benjamin confirmó la 0.4.7 y se borró el `.msi` local de 0.4.5;
> en `desktop/dist` quedan solo **0.4.6 (anterior) y 0.4.7 (actual)**. En GitHub conservan
> `.msi` 0.4.5, 0.4.6 y 0.4.7; el resto de releases ya no tienen adjunto.
>
> ### Anterior (2026-08-21): PDF-1 — el capítulo de texto libre perdía TODO el formato
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
> Bump **v0.4.6** en los 3 `package.json` + lock del backend. Merge `--no-ff` a `develop`
> (`e22652f`), ambas ramas pusheadas, `.msi` construido (gate de secretos OK: 1496 ficheros,
> sin credenciales) y **RELEASE v0.4.6 PUBLICADA** (GitHub, Latest, `ConstruGest-0.4.6.msi`
> 474,7 MB, target = merge de develop `e22652f`). Verificado **antes de publicar** que el
> payload empaquetado lleva el arreglo (marcador del conversor presente en el chunk del
> frontend compilado) y `package.json` 0.4.6 en `resources/app`. La API de GitHub ya da
> `v0.4.6` como *latest* → el banner de actualización lo verá.
>
> **HECHO**: Benjamin actualizó a 0.4.6 y confirmó que los formatos salen; el único reparo
> fue la negrita → PDF-2. REL-CLEAN hecho (ver arriba).
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
> [`docs/qa-v0.4.3-findings.md`](qa-v0.4.3-findings.md). · **`v0.4.4`** MULTIMON (la app reabre
> en el monitor donde se cerró) · **`v0.4.5`** parser de PDF de CYPE/Arquímedes, borrado múltiple
> que fallaba en silencio, guardarraíl de datos vinculados que estaba inerte, y gate de secretos
> en el build del `.msi` · **`v0.4.6`** el capítulo de texto libre ("Condiciones Generales") ya
> imprime su formato en el PDF: negrita/cursiva/subrayado/tachado/resaltado, color, listas
> anidadas, citas y sangrías (PDF-1). · **`v0.4.7`** la negrita del PDF pasa a Roboto Bold
> real (700) en vez de Medium (500), que se veía más floja que en pantalla (PDF-2).
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
>    - ~~**BUG restore duplicado**~~ **HECHO 2026-10-17 (BAK-1)**: la ruta de backup es ahora
>      `POST /:id/restore-backup` y la UI la usa.
>    - **BUG clobber de backups:** cuando un proyecto tiene `folder_path` apuntando a una carpeta con
>      `_backup`, el sync/backup de la app **sobrescribe** ahí `project.json` (y potencialmente otros
>      JSON). Riesgo de pisar un backup REAL con datos de prueba (le pasó a OGIJARES el 14-jul).
>      Revisar `syncService.ts` + rutas `sync-file`/`backup`: no escribir sobre un `_backup` ajeno,
>      o avisar/separar por `project_id`. *(2026-10-17, BAK-1: el RESTAURAR ya rechaza un `_backup`
>      cuyo `project_id` es de otro proyecto; el BACKUP sigue escribiendo en la carpeta asignada.)*
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

## 🧾 Bloque PARSE / PRES — importar PDFs ajenos y presupuesto "completo"

*(Análisis del 2026-11-09, a partir del PDF de Parque Fórum. **Decide Benjamin el QUÉ**; esto
es solo el mapa de lo que falta y el coste de cada trozo. PARSE-1 ya está hecho.)*

### ~~PARSE-2~~ — **HECHO el 2026-11-09** (detalle y verificación, en la cabecera)
Aunque el parser mejore, siempre habrá formatos nuevos. Esto es lo que pasaba **antes** de PARSE-2
(se deja escrito porque es el síntoma a reconocer si algo así vuelve):
- **El motivo se tira a la basura.** El backend devuelve `logs` con el detalle (qué parser
  entró, cuántas partidas, por qué se descartaron) y la UI **no los muestra**; y el `catch` de
  `handleAnalyze` ([`ImportBudgetDialog.tsx:292`](../frontend/src/components/budget/ImportBudgetDialog.tsx))
  descarta el error real del servidor y pone siempre "Error al analizar el texto con IA".
  → Mostrar los `logs` y el mensaje real. *(Barato y es lo que evita el "me dio error" a secas.)*
- **PDF escaneado = camino muerto.** Si no hay capa de texto, el botón "Analizar" se queda
  **deshabilitado** (`:803` exige `pdfText`), así que el **fallback de OCR local del backend
  nunca se puede alcanzar** desde la UI. → Permitir analizar con solo el PDF (`pdfBase64`).
  *(Ojo: el OCR solo funciona en Docker; tesseract/poppler no van dentro del `.msi` — ya está
  en Pendientes conocidos. Dentro del `.msi` habría que empaquetarlos o decirlo claro.)*
- Sin límite de tamaño ni timeout, y el base64 se construye **byte a byte en el hilo de la UI**
  (`:134-137`): un PDF grande congela la pantalla un rato.
- **Red de seguridad que falta**: `npm test` no prueba el parser (solo existe el script manual
  `backend/test-parser-v6.mjs`). → Un test con un fixture por formato (PRESTO con separadores,
  CYPE, una línea/Word, Excel). Así un formato que ya funcionaba no se rompe al añadir el siguiente.

### PRES-x — hasta dónde actualizar el presupuesto
**Ya lo tenemos igual que el PDF ajeno**: portada con logo y datos de empresa, índice de
capítulos con importe y **%**, tabla por capítulo (Código/Concepto/Ud/Cantidad/Precio/Importe),
**SUBTOTAL** por capítulo, resumen, **PEM + IVA + TOTAL**, **total en letra**, firma
empresa/cliente con "En <ciudad>, a <fecha>" y pie con paginación. El modelo de datos tiene
además cosas que ese PDF no lleva: coste y margen, versiones, estados, biblioteca de partidas,
comparador y certificaciones.

Lo que **NO** tenemos, en orden de "más valor por menos trabajo":
- ~~**PRES-1 · Datos del cliente en el presupuesto.**~~ **HECHO 2026-11-09** (ficha reutilizable). El PDF ajeno pone en portada *Cliente,
  CIF y dirección*. Hoy `cons_projects` solo guarda `client_name` y `client_contact` (texto
  libre) y al PDF solo se le pasa `projectName`. → Campos de cliente (nombre fiscal, NIF,
  dirección) + bloque en portada. **Pequeño.**
- ~~**PRES-2 · Anexo de mediciones.**~~ **HECHO 2026-11-10** (tabla por zona). El PDF ajeno trae *ANEXO I: mediciones por zona* (tabla
  zonas × conceptos con totales por columna). Nosotros ya guardamos y editamos mediciones por
  partida (`cons_measurements`: uds/largo/ancho/alto/parcial) pero **no salen en el PDF** y no
  existe el concepto de **zona**. Dos tamaños: (a) imprimir las mediciones que ya hay como
  anexo por partida — **pequeño**; (b) añadir *zona* a la medición y sacar la tabla cruzada por
  zona como la del PDF — **mediano** (BD + UI + PDF).
- ~~**PRES-3 · Anexo fotográfico por zonas.**~~ **HECHO 2026-11-10**. *ANEXO II*: 17 páginas de fotos numeradas agrupadas
  por zona. Hoy las fotos son ficheros del proyecto (`cons_project_files.category='photo'`) sin
  vínculo a capítulo, partida ni zona, y el PDF **no inserta ninguna imagen** salvo el logo.
  → Vincular foto ↔ zona/partida + sección de anexo con rejilla y pie de foto. **Mediano**
  (cuidado con el peso del PDF y con el tamaño de las imágenes).
- ~~**PRES-4 · Condiciones de la oferta.**~~ **HECHO 2026-11-09** (plantilla + por presupuesto). Validez, forma de pago, plazo de ejecución, garantía y
  exclusiones. Hoy el textarea "Condiciones generales" del modal del PDF **no se guarda en
  ninguna parte**: se escribe, sale en ese PDF y se pierde al cerrar. → Persistirlo en el
  presupuesto (`cons_budgets.notes` está libre y sin uso) y/o una plantilla en Ajustes.
  **Pequeño y se nota en cada presupuesto.**
- ~~**PRES-5 · GG + BI y cuadro de descompuestos.**~~ **HECHO 2026-11-10** (opcional, a 0 no cambia nada). `overhead_pct` (13) y `profit_pct` (6) están
  en la BD y en Ajustes pero **no se usan en ningún cálculo ni en el PDF**: el presupuesto va
  PEM → IVA → TOTAL, sin PEC. Y `cons_price_breakdown` (mano de obra / material / maquinaria /
  subcontrata) tiene UI pero tampoco se imprime. → Decidir si el presupuesto es **PEM** (como
  el PDF ajeno, que es "de ejecución material") o **PEC** (PEM + GG + BI), y si se imprime
  cuadro de precios descompuestos. **Decisión de negocio antes que trabajo.**

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
