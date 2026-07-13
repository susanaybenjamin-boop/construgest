# Base de datos de Construgest (local, MariaDB)

Toda la BD vive aquí. Se ejecuta con Docker (ver `docker-compose.yml` en la raíz).

## Estructura
- `init/` — scripts `.sql` que MariaDB ejecuta **la primera vez** que crea su volumen
  (orden alfabético). Se autocargan al hacer `docker compose up -d` con el volumen vacío.
  - `01_schema.sql` — ✅ las **59 tablas** de Construgest traducidas a MariaDB desde el
    inventario de `../docs/schema/` (generado en DB-2; 67 FKs, 39 CHECKs, 128 índices).
  - (pendiente DB-4) `02_seed.sql` — datos mínimos (organización + usuario) para arrancar.
- La vista `mcp_users_view` quedó fuera (es una VIEW; se hará aparte si hace falta).

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
