# ConstruGest Desktop (Electron) — empaquetado nativo (Fase 5)

Shell de escritorio que arranca los servicios locales de Construgest y muestra
la app en una ventana propia, **sin Docker**. Arquitectura:

```
Electron (main.js)
  ├─ MariaDB (runtime/mariadb)      ← opcional: si no está, usa una externa (Docker en dev)
  ├─ backend Node  (src/app.js)     :5000   ← Node de Electron (ELECTRON_RUN_AS_NODE)
  ├─ frontend Next (server.js)      :3000   ← build standalone (output: 'standalone')
  └─ Ollama (runtime/ollama)        :11434  ← opcional: si no está, usa el del host
      → la ventana carga http://localhost:3000
```

## Estado (F5-1 / F5-2)

- ✅ **F5-1 verificado:** backend y frontend corren como **procesos Node nativos**
  (el frontend `next build` → `.next/standalone` → `node server.js` sirve la app;
  probado sirviendo `/login` 200 sin `next dev` ni Docker).
- ✅ **F5-2 (andamiaje):** `main.js` orquesta el arranque (spawn + health-check +
  ventana).
- ✅ **F5-2b (init logic):** `main.js` inicializa MariaDB la 1ª vez
  (`mariadb-install-db` → crea BD/usuario → aplica `database/init/*.sql`) y
  descarga el modelo Ollama si falta. La secuencia de aplicar el esquema se
  probó contra MariaDB (58 tablas creadas de un tirón).
- ✅ **F5-4 empaquetado con WiX v3** (`installer/Product.wxs` + `build-msi.ps1`):
  empaqueta Electron a mano (runtime + `resources/app` + `resources/{backend,
  frontend,database,runtime}`), `heat` cosecha los ficheros y `candle`/`light`
  generan el `.msi` con accesos directos (menú inicio + escritorio).
- ⏳ **Pendiente:** F5-3 colocar los binarios nativos en `runtime/`
  (`runtime/README.md`) para un `.msi` 100% autocontenido; sin ellos, el `.msi`
  instala el código y asume MariaDB/Ollama externos.

## Desarrollo (dev, con la MariaDB de Docker y el Ollama del host)

```bash
# 1) build del frontend standalone (desde frontend/)
cd frontend && npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

# 2) arrancar el shell (desde desktop/)
cd ../desktop && npm install && npm start
```

`main.js` no encuentra `runtime/mariadb` ni `runtime/ollama` → asume la MariaDB
de Docker (`docker compose up -d mariadb`, puerto 3308) y el Ollama del host.

## Construir el .msi (WiX v3)

```powershell
# desde desktop\  (requiere Node + WiX Toolset v3.14)
powershell -ExecutionPolicy Bypass -File build-msi.ps1 -Version 0.1.0
# → desktop\dist\ConstruGest-0.1.0.msi
```

El script hace el build del frontend, empaqueta el runtime de Electron, prepara
el payload en `build\stage` y ejecuta `heat`/`candle`/`light`. Para un `.msi`
100% autocontenido, coloca antes los binarios en `runtime/` (ver
`runtime/README.md`); si no están, el `.msi` asume MariaDB/Ollama externos.
