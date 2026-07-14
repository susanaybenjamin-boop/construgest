# Bases de precios públicas (BC3) — 2ª fuente de la tool de precios

Deja aquí ficheros **`.bc3`** (FIEBDC-3) de bases de precios públicas —por
ejemplo la **Base de Costes de la Construcción de Andalucía (BCCA)**— y el
backend los cargará automáticamente como **2ª fuente de referencia de precios**
para las skills de IA (`compare-prices`, `suggest-optimizations`).

## Cómo funciona

- Al arrancar (y de forma cacheada, invalidada si cambian los ficheros), el
  backend lee **todos los `*.bc3` de este directorio** (no de subcarpetas),
  extrae una lista plana de precios `{name, unit, unit_price}` de cada concepto
  con unidad y precio, y la concatena a la referencia.
- La **biblioteca propia del usuario** (`cons_saved_partidas`) **MANDA**: a
  igualdad de similitud de nombre gana la biblioteca; la base pública es respaldo
  para las partidas que la biblioteca no cubre.
- Sin ficheros aquí, el sistema funciona igual (solo con la biblioteca).

## Añadir una base

1. Copia el `.bc3` de la base pública en **este** directorio (no en `samples/`).
2. Reconstruye el backend para que entre en la imagen:
   `docker compose up -d --build backend`
   (o monta este directorio como volumen si prefieres no reconstruir).

El directorio `samples/` contiene un `.bc3` de ejemplo del formato **que NO se
carga** (está en subcarpeta), solo como referencia.

## Ruta / configuración

Por defecto `<cwd>/data/price-bases` (en Docker: `/app/data/price-bases`).
Se puede cambiar con la variable de entorno `PRICE_BASE_DIR`.
