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
  ventana) y `package.json` trae la config de `electron-builder` → target `msi`.
- ⏳ **Pendiente (necesita máquina Windows):** F5-3 bundlear binarios
  (`runtime/README.md`) y F5-4 construir el `.msi`.

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

## Construir el .msi (F5-4, en Windows)

```bash
cd frontend && npm run build   # genera .next/standalone
cd ../desktop && npm run dist   # electron-builder → desktop/dist/ConstruGest-Setup.msi
```

Requiere haber colocado los binarios en `runtime/` (ver `runtime/README.md`) y
un icono en `build/icon.ico`.
