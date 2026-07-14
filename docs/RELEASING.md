# Releases y auto-update

Construgest avisa de nuevas versiones comparando la versión instalada con la
**última release publicada en GitHub** (igual que Benjagest). De momento solo
**avisa**; la descarga/instalación automática del binario llegará con el
empaquetado `.msi` (Fase 5).

## Cómo funciona el aviso

- El backend expone `GET /api/version` (público). Devuelve:
  - `current`: versión instalada (la de `backend/package.json`).
  - `latest` / `updateAvailable` / `releaseUrl` / `notes`: última release del
    repo en GitHub (`services/version.js`, cacheado 1 h).
- El frontend (store `versionStore` + `UpdateBanner` + tarjeta "Acerca de" en
  Ajustes → Mi Cuenta) muestra el aviso cuando `updateAvailable` es `true`.
- **Repo privado:** para que el chequeo funcione hay que darle un token de
  lectura al backend con `GITHUB_TOKEN` (en `backend/.env`). Si el repo se hace
  **público**, no hace falta token. Sin token/conexión, la app funciona igual y
  el aviso simplemente no aparece (`checkedRemote: false`).
- `GITHUB_REPO` (por defecto `susanaybenjamin-boop/construgest`) permite apuntar
  a otro repo.

## Cortar una release

1. Prueba en `develop` (todo verificado en ejecución).
2. Lleva el código estable a `main`:
   ```bash
   git checkout main
   git merge --no-ff develop
   ```
3. Corta la release (bump de versión + tag + GitHub Release):
   ```bash
   scripts/release.sh 0.2.0
   ```
   El script fija `0.2.0` en los dos `package.json`, crea el commit
   `chore(release): v0.2.0`, el tag `v0.2.0`, los empuja y publica la release en
   GitHub con notas autogeneradas.
4. Vuelve a trabajar en `feat/benjamin`.

Versionado semántico `MAYOR.MENOR.PARCHE`. Sube PARCHE para arreglos, MENOR para
funciones nuevas, MAYOR para cambios incompatibles.

## Pendiente (Fase 5)

- Empaquetado `.msi` autocontenido (Node + frontend build + MariaDB + Ollama/
  modelo + tesseract/poppler + base de precios BC3).
- Adjuntar el `.msi` como **asset** de la GitHub Release.
- Auto-update real: descargar el `.msi` de la release y aplicarlo (hoy solo se
  avisa y se enlaza a las novedades).
