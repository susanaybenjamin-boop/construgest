# Entorno local de Construgest (Docker + DBeaver)

Guía práctica del día a día. Todo se maneja desde la carpeta `C:\Proyectos\Construgest`.

## 1. Arrancar / parar todo

Abre una terminal en `C:\Proyectos\Construgest` y:

```bash
docker compose up -d       # arranca MariaDB + backend (en segundo plano)
docker compose ps          # ver estado (deben salir los dos "Up")
docker compose logs -f backend   # ver los logs del backend en vivo (Ctrl+C para salir)
docker compose down        # parar todo (los datos de la BD SE CONSERVAN)
docker compose down -v     # parar y BORRAR la base de datos (empezar de cero)
```

## 2. Verlo en Docker Desktop

1. Abre **Docker Desktop**.
2. Menú izquierdo → **Containers**.
3. Verás el grupo **construgest** con dos contenedores:
   - `construgest-mariadb` (la base de datos, puerto 3308)
   - `construgest-backend` (la API, puerto 5000)
4. Desde ahí puedes arrancar/parar con los botones ▶/⏹ y ver logs pinchando en cada uno.

> **Importante:** el backend ahora vive en Docker. **No lo lances también desde VS Code**
> o chocará por el puerto 5000. Un solo backend: el de Docker.

## 3. Conectar DBeaver a la base de datos

1. DBeaver → **Nueva conexión** → **MariaDB**.
2. Rellena:
   | Campo | Valor |
   |---|---|
   | Host | `localhost` |
   | Port | `3308` |
   | Database | `construgest` |
   | Username | `construgest` |
   | Password | `construgest` |
3. **Test Connection** → debe decir OK → **Finish**.
4. De momento la BD está **vacía** (sin tablas): es normal, las tablas se crean en la
   Fase 1 (DB-2). Cuando estén, aparecerán bajo `construgest > Tables`.

## 4. Comprobar que el backend responde

En el navegador o terminal:
```
http://localhost:5000/api/health   ->  {"status":"ok", ...}
```

## 5. El frontend (opcional, desde VS Code)

El frontend (Next.js) se sigue lanzando desde VS Code mientras desarrollamos:
```bash
cd frontend
npm install      # solo la primera vez
npm run dev      # abre http://localhost:3000
```
El frontend habla con el backend en `http://localhost:5000` (ya configurado por defecto).

## 6. Editar el backend (Fase 2 en curso)
Al cambiar código de `backend/`, recompila e reinicia solo ese contenedor:
```bash
docker compose up -d --build backend
```
El rebuild es rápido (Docker cachea `npm install` si no cambió `package.json`).

## 7. Notas
- **Migración en curso (Fase 2):** las rutas se pasan de Supabase (nube) a la MariaDB
  local una a una. Ya migrada: `auth.js` (login/registro). Las rutas aún NO migradas
  siguen usando Supabase, así que de momento se necesita internet para esas.
- Credenciales de MariaDB = solo desarrollo local. No son secretos de producción.
