# Comparativa Presto ↔ Construgest — carencias de Construgest

> **Fecha:** 2026-11-15
> **Para qué:** saber qué trae Presto (el estándar del sector en España) que Construgest
> todavía no hace, y en qué orden conviene cerrarlo.

## Cómo se ha hecho esta comparativa

**No se ha ejecutado Presto.** La copia que había en `C:\Prest87` era Presto 8.7 con un
parche de licencia (`PRESTO87_crk.exe`), así que no se abrió; Benjamin la desinstaló. Su
intención era que se estudiaran las funciones, no tener el programa.

Las fuentes son:

- **Presto:** documentación oficial de RIB Software (ver *Fuentes* al final) + el estándar
  **FIEBDC-3 (BC3)**, que es la definición pública de qué debe contener un presupuesto de
  construcción en España y por tanto el requisito real de interoperabilidad.
- **Construgest:** lectura directa del código y del esquema. **Todo lo que se afirma abajo
  sobre Construgest está verificado en el código**, con fichero y línea. Nada es "creo que".

---

## 1. Presto por módulos (qué es cada cosa)

| Módulo | Qué hace |
|---|---|
| **Presupuestos y mediciones** | Estructura obra → capítulos → partidas → **descomposición** (mano de obra, maquinaria, materiales, auxiliares). Precios, cuadros de precios, mediciones por líneas, textos y pliegos. |
| **Planificación** | Tareas enlazadas a las partidas, duraciones, precedencias, diagrama de barras, **periodificación económica** (cuánto se prevé certificar cada mes) y sincronización BIM 4D. |
| **Gestión del proyecto** | Certificaciones, **gestión de cambios**, control de costes y seguimiento económico, incluido el **Método del Valor Ganado (EVM)**. |
| **Gestión de la ejecución** | Compras, contratación, producción y control de recursos: la cadena **oferta → comparativo → contrato/pedido → albarán → factura**. |
| **BIM & CAD** | `Cost-it` (Revit) e `IFCost` (IFC): el modelo se convierte en presupuesto medible. |
| **Interoperabilidad** | BC3 (FIEBDC-3), Excel, Project/Primavera, API y plugins. Ficheros `.presto`. |
| **Informes** | Informes abiertos y personalizables sobre cualquiera de lo anterior. |

El eje de todo Presto es una idea: **existe una sola tabla de "conceptos" y cualquier
concepto puede descomponerse en otros, recursivamente.** Una partida se descompone en
mano de obra + materiales + un auxiliar; ese auxiliar se descompone a su vez en más
conceptos. El precio de un concepto **es** la suma de su descomposición, y cambiar el
precio del cemento recalcula hacia arriba todo lo que lo use. De ahí salen después los
cuadros de precios, el coste objetivo y el control de costes.

---

## 2. Lo que Construgest ya tiene (verificado)

- **Estructura de presupuesto completa**: `cons_budgets` (versión, estado
  draft/pending/approved/rejected/superseded, `tax_rate`, `overhead_pct` 13 %,
  `profit_pct` 6 %), `cons_chapters` **jerárquicos** (`parent_id`) con capítulo de texto
  legal, `cons_budget_items`.
- **Descomposición de precios de un nivel**: `cons_price_breakdown` con
  `resource_type IN ('labor','material','equipment','subcontract','other')` — la
  *naturaleza* de Presto está cubierta.
- **Mediciones por líneas**: `cons_measurements` con `units/length/width/height/partial`
  **y `formula`**, más la columna **zona** (migración `003_zona_mediciones`).
- **Certificaciones**: `cons_certifications` + `cons_certification_items` con
  `certified_quantity/pct/amount` y `previous_quantity/amount` (origen a origen), y
  trazabilidad línea a línea contra los partes de trabajo
  (`cons_certification_work_log_links.consumed_quantity`).
- **Importación**: BC3/FIEBDC-3 (`bc3-parser.js`), PZH de Presto (`pzh-parser.js`), CYPE
  (`cype-parser.js`) y PDF (`budget-parser.js`, `extraction.js`).
- **Biblioteca propia** de capítulos y partidas (`cons_library_chapters`,
  `cons_saved_partidas`) + **base de precios pública en BC3** enchufable
  (`price-base.js`, `price-reference.js`).
- **Documentos PDF**: Presupuesto, Índice, Resumen, Condiciones de la oferta,
  **Anexo I** mediciones por zona, **Anexo II** reportaje fotográfico y
  **Anexo III cuadro de precios descompuestos** (`budgetPdfExport.ts`).
- **Costes reales**: partes de trabajo con mano de obra, materiales y maquinaria
  (`cons_work_log_*`) y gastos (`cons_project_expenses`).
- **Comparador de presupuestos** con agrupaciones y exclusiones.

---

## 3. Carencias, por orden de importancia

### BLOQUE A — El motor de precios (la carencia estructural)

#### A1. El precio de la partida NO sale de su descomposición ⚠️ la más importante

**Presto:** el precio de una partida *es* la suma de su descomposición. Siempre. Tocar un
rendimiento o el precio de un material recalcula la partida, el capítulo y la obra.

**Construgest hoy:** la descomposición es **decorativa**. Verificado:

- [`PriceBreakdownPanel.tsx:133`](../frontend/src/components/budget/PriceBreakdownPanel.tsx)
  calcula `grandTotal` y lo **muestra** como *"Coste Total Unitario"*
  ([línea 339](../frontend/src/components/budget/PriceBreakdownPanel.tsx)). El pie del
  panel solo tiene **"Añadir línea"** y **"Cerrar"**: no hay nada que aplique ese total.
- Los handlers `POST/PUT/DELETE` de `/breakdown` en
  [`budgets.js:824-866`](../backend/src/routes/budgets.js) escriben la línea y lanzan
  `notifyBudgetChange`, y **no tocan `cost_price` ni `unit_price`** de la partida.

**Consecuencia real:** `cost_price` se teclea a mano y puede decir 42 € mientras su propia
descomposición suma 51 €. El Anexo III imprime una descomposición que no cuadra con el
precio impreso al lado. Y sin esto no hay coste objetivo creíble (→ E1) ni cuadros de
precios fiables (→ B1).

**Qué hace falta:** recálculo en cascada partida → capítulo → presupuesto. Hay una
decisión de producto que es de Benjamin: ¿el precio pasa a ser **solo** la suma de la
descomposición (como Presto), o sigue siendo editable y la app **avisa** de la desviación?

#### A2. No hay precios auxiliares reutilizables

**Presto:** el mortero M-5 se define **una vez** como concepto auxiliar, con su propia
descomposición, y se usa en 20 partidas. Si sube el cemento, suben las 20.

**Construgest hoy:** `cons_price_breakdown` es una lista plana de líneas
`(resource_type, description, unit, quantity, unit_cost)` colgadas de **una** partida, con
FK solo a `cons_materials`. No hay forma de decir "esta línea es el concepto MORTERO M-5".
Si el mortero aparece en 20 partidas, está escrito 20 veces.

Ojo, porque el nombre engaña: **`is_auxiliary` de Construgest no es el auxiliar de
Presto**. Aquí significa "partida sin tope de cantidad" en los partes de trabajo y la
certificación — verificado en
[`daily-work/page.tsx:1827`](../frontend/src/app/project/[id]/daily-work/page.tsx) y
[`certifications/page.tsx:350`](../frontend/src/app/project/[id]/certifications/page.tsx).

**Qué hace falta:** un concepto reutilizable con descomposición propia y recursividad. Es
el cambio de modelo de datos más caro de esta lista, y conviene hacerlo **después** de A1.

#### A3. La biblioteca no guarda la descomposición

`cons_saved_partidas` tiene `unit_price` y `cost_price` y **ninguna tabla de descomposición
asociada** (verificado en el esquema). Al reutilizar una partida de la biblioteca se pierde
su composición, así que la empresa no puede mantener su propio **cuadro de precios
descompuestos** como activo. Esto es lo que convierte la biblioteca en lo que Presto llama
un cuadro de precios propio.

#### A4. No hay costes indirectos por partida

Solo existen `overhead_pct` (GG) y `profit_pct` (BI) a nivel de presupuesto
(`cons_budgets`). Presto distingue dos cosas distintas:

- **Costes indirectos**: un % sobre el coste de **cada partida**, que forma parte del PEM.
- **GG + BI**: se aplican **sobre** el PEM.

En obra pública esa distinción es normativa. Hoy Construgest no la puede expresar.

---

### BLOQUE B — Documentos y salida (barato, mucho impacto)

#### B1. Faltan el Cuadro de Precios nº1 y el nº2

Hoy hay **Anexo III, cuadro de precios descompuestos**
([`budgetPdfExport.ts:1377`](../frontend/src/services/budgetPdfExport.ts)). Faltan los dos
que de verdad piden la dirección facultativa y la administración:

- **CP nº1**: cada partida con su precio **en letra** (y firma). Es documento contractual.
- **CP nº2**: el desglose por **naturalezas** (mano de obra / maquinaria / materiales) más
  "resto de obra".

Los datos para ambos **ya están** (`cons_price_breakdown.resource_type` da las
naturalezas; ya existe la función de importe en letra para el total del presupuesto). Es
trabajo de generación de PDF, no de modelo de datos. **Mucha salida por poco esfuerzo.**

#### B2. No hay exportación BC3 ⚠️ la más urgente de las baratas

Verificado: `bc3-parser.js` **solo importa**. No existe ningún `exportBc3` / `generateBc3`
en el repositorio.

**Construgest es hoy una calle de sentido único**: entra BC3, no sale. Eso significa que no
se le puede mandar un presupuesto en BC3 a un arquitecto, a una propiedad ni a otra
contrata, y que los datos de Benjamin no pueden salir de Construgest hacia ninguna otra
herramienta del sector. Para un programa que quiere sustituir a Presto, esto es lo primero
que se le va a notar.

Lo bueno: el parser ya conoce el formato (registros `~V`, `~C`, `~D`, `~T`, `~M`), así que
la exportación es en buena parte el camino inverso de código que ya existe.

---

### BLOQUE C — Planificación (módulo entero ausente)

#### C1. No hay planificación, ni diagrama de barras, ni periodificación

Verificado: **cero** tablas de tareas, duraciones, precedencias o fechas previstas.
Cuidado con el nombre: `cons_plan_annotations` / `cons_plan_calibrations` /
`cons_plan_extractions` son **planos** (dibujos), no planificación.

**Presto:** tareas enlazadas a partidas, duraciones, precedencias, Gantt, **periodificación
económica** (cuánto se prevé certificar cada mes) y curva de producción.

**La buena noticia:** Construgest ya tiene certificaciones por periodo
(`period_start`/`period_end`). La pieza que falta y que da el 80 % del valor es modesta:
**importe previsto por partida y por mes**, para enfrentarlo a lo certificado. El Gantt con
precedencias es el paso siguiente, no el primero.

---

### BLOQUE D — Compras y contratación (módulo entero ausente)

#### D1. No hay cadena de compras

**Presto:** solicitud de ofertas → comparativo → **contrato/pedido** → **albarán** →
factura. De ahí sale el **coste comprometido**: lo que ya has firmado, aunque no te lo
hayan facturado.

**Construgest hoy** tiene los extremos pero no el medio:

- Los directorios: `cons_suppliers`, `cons_supplier_materials` (precio por proveedor y
  material), `cons_subcontractors`.
- Las facturas, más o menos: `cons_project_expenses`.
- **No hay** pedido, ni albarán, ni contrato con un subcontratista por un importe y unas
  partidas. Verificado: no existe ninguna ruta ni tabla de pedidos/albaranes.

Sin el compromiso, la pregunta "¿cuánto llevo gastado de verdad en esta obra?" solo se
puede responder con lo ya facturado, que siempre va por detrás de la realidad.

---

### BLOQUE E — Control de costes

#### E1. No hay coste objetivo por partida ni Valor Ganado

Construgest tiene **coste real** (partes de trabajo + gastos) y **certificado**. Presto
enfrenta cuatro columnas por partida: **objetivo / comprometido / real / certificado**, y
de ahí saca el EVM.

Lo que falta es el **coste objetivo**, y sale solo en cuanto esté A1: descomposición ×
cantidad medida = lo que esa partida debería costar. Es decir: **esta carencia se cierra
casi gratis después de A1**, y es la que más dinero le ahorra a un constructor.

#### E2. No hay gestión de cambios

Hay versiones de presupuesto (`version`, estado `superseded`) y un comparador. Lo que no
hay es el **cambio como objeto**: quién lo pidió, cuándo se aprobó, qué partidas toca, qué
impacto tiene, y el **precio contradictorio** como figura propia. En una obra con
modificados, esto es lo que evita las discusiones al final.

---

### BLOQUE F — Menores

- **F1. Revisión y actualización de precios**: índices de revisión, y subidas masivas por
  % sobre una naturaleza o un capítulo. Hoy hay histórico de precios de material
  (`cons_material_price_history`) pero no la operación de actualizar el presupuesto.
- **F2. Campos de usuario y expresiones**: Presto deja añadir columnas propias y calcular
  con fórmulas. Construgest tiene `formula` solo en las mediciones.
- **F3. BIM / IFC (`Cost-it`, `IFCost`)**: existe en Presto y **no se recomienda** como
  objetivo. Es un mundo entero, y para el trabajo de Benjamin la digitalización de planos
  que ya tiene cubre la necesidad real.
- **F4. Gestión de residuos y seguridad y salud** como capítulos estructurados.

---

## 4. Lo que Construgest tiene y Presto no

Para que la foto sea honesta: Construgest no va solo por detrás.

- **Digitalización de planos integrada**: calibración, anotaciones y extracción de
  mediciones (`cons_plan_calibrations/annotations/extractions`, `dxf-service.js`,
  `local-ocr.js`). Presto mide sobre CAD/BIM, pero esto es propio y está dentro.
- **IA con autoaprendizaje por correcciones** (`cons_ai_corrections`,
  `ai-corrections.js`). Presto no tiene nada parecido.
- **Partes de trabajo que alimentan la certificación** con trazabilidad línea a línea
  (`cons_certification_work_log_links`). En Presto el parte de obra no está tan cosido a la
  certificación.
- **Control documental de subcontratas (CAE)** con caducidades: TC1, TC2, REA, libro de
  subcontratación, plan de seguridad, formación PRL…
- **Buzón interno y enlaces entre delegaciones** (`cons_mailbox_*`, `cons_branch_links`).
- **Biblioteca de cláusulas con referencias vivas a partidas** (COND-1/2/3/4): la condición
  que nombra "el apartado 2.1" se actualiza sola al renumerar. Presto no hace esto.
- **Comparador de presupuestos** con agrupaciones y exclusiones.

---

## 5. Orden propuesto

Ordenado por *valor / esfuerzo*, y respetando que unas cosas habilitan otras.

| # | Qué | Por qué ahora | Esfuerzo |
|---|---|---|---|
| 1 | **B2 — Exportación BC3** | Es lo que más se nota desde fuera y el parser ya conoce el formato. Hoy los datos no pueden salir. | Bajo |
| 2 | **A1 — El precio sale de la descomposición** | Todo lo demás cuelga de aquí (coste objetivo, CP1/CP2, control de costes). Requiere **una decisión de Benjamin**. | Medio |
| 3 | **B1 — Cuadro de precios nº1 y nº2** | Documentos contractuales que ya se pueden generar con los datos que hay. | Bajo |
| 4 | **A3 — Descomposición en la biblioteca** | Convierte la biblioteca en el cuadro de precios de la empresa. | Medio |
| 5 | **E1 — Coste objetivo y desviaciones** | Sale casi gratis detrás de A1, y es lo que ahorra dinero en obra. | Bajo tras A1 |
| 6 | **A4 — Costes indirectos por partida** | Necesario para obra pública. | Bajo |
| 7 | **A2 — Auxiliares reutilizables** | El salto de verdad a "motor Presto", pero cambia el modelo de datos. | Alto |
| 8 | **C1 — Periodificación (importe previsto por mes)** | Primer trozo útil de planificación, sin Gantt todavía. | Medio |
| 9 | **D1 — Compras: contrato/pedido/albarán** | Habilita el coste comprometido. Módulo nuevo. | Alto |
| 10 | **E2 — Gestión de cambios** | Cuando haya obras con modificados en marcha. | Medio |

**Recomendado empezar por B2 + A1.** B2 porque es barato y desbloquea hablar con el resto
del sector; A1 porque es la raíz de la mitad de esta lista.

---

## Fuentes

- [RIB Presto — software de control de costes de construcción](https://www.rib-software.com/es/rib-presto)
- [RIB Presto — presupuestos](https://www.rib-software.com/es/rib-presto/presupuestos)
- [RIB Spain](https://rib-software.es/index.html)
- [Presto, de RIB Software, ¿qué es Presto? — EspacioBIM](https://www.espaciobim.com/presto)
- [Qué es Presto (RIB): para qué sirve, módulos y archivos — Planhopper](https://www.planhopper.com/blog/que-es-presto)
- [Presto Presupuestos y Mediciones — Seystic](https://tienda.seystic.com/producto/presto-presupuestos-mediciones/)
- [Presto, una presentación global (PDF, RIB Software)](https://observatorioedificacion.es/wp-content/uploads/2024/10/Presto-una-presentacion-global.pdf)
