# Base de datos de Construgest (local, MariaDB)

Toda la BD vive aquí. Se ejecuta con Docker (ver `docker-compose.yml` en la raíz).

## Estructura
- `init/` — scripts `.sql` que MariaDB ejecuta **la primera vez** que crea su volumen
  (orden alfabético). Aquí irá `schema.mariadb.sql` en la Fase 1 (DB-2).
- (Fase 1) `schema.mariadb.sql` — CREATE TABLE de las 60 tablas de Construgest,
  traducidas desde el inventario de `../docs/schema/`.
- (Fase 1) `seed.sql` — datos mínimos de prueba (organización + usuario) para arrancar.

## Conexión (DBeaver o cualquier cliente)
| Campo | Valor |
|---|---|
| Host | `localhost` |
| Puerto | `3308` |
| Base de datos | `construgest` |
| Usuario | `construgest` |
| Contraseña | `construgest` |
| (root) | usuario `root` / `construgest_root` |

> Credenciales de **desarrollo local** únicamente. En el empaquetado final (Fase 5)
> la BD embebida tendrá su propia gestión de credenciales.

## Reaplicar el esquema desde cero
```bash
docker compose down -v      # borra el volumen (¡y los datos!)
docker compose up -d        # recrea la BD y ejecuta lo que haya en init/
```
