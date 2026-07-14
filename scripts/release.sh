#!/usr/bin/env bash
# ============================================================================
# Corta una release de Construgest (estilo Benjagest): bump de versión, tag y
# GitHub Release. El aviso de "nueva versión" de la app (GET /api/version)
# compara la versión instalada con la ÚLTIMA release de GitHub → al publicar
# aquí, las instalaciones existentes ven el aviso.
#
# Uso:   scripts/release.sh <X.Y.Z>          (ej: scripts/release.sh 0.2.0)
#
# Requisitos: estar en `main`, árbol limpio, `gh` autenticado con permiso `repo`.
# Flujo normal: probar en develop → merge a main → correr este script desde main.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Uso: $0 <X.Y.Z>   (ej: $0 0.2.0)" >&2
  exit 1
fi
TAG="v$VERSION"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Debes estar en 'main' para cortar una release (estás en '$BRANCH')." >&2
  echo "  git checkout main && git merge --no-ff develop" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "El árbol de trabajo no está limpio. Commitea o descarta los cambios antes." >&2
  exit 1
fi
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "El tag $TAG ya existe." >&2
  exit 1
fi

echo "→ Fijando versión $VERSION en backend/ y frontend/package.json"
node -e "for (const f of ['backend/package.json','frontend/package.json']){const p=require('./'+f);p.version='$VERSION';require('fs').writeFileSync(f, JSON.stringify(p,null,2)+'\n')}"

if ! git diff --quiet; then
  git add backend/package.json frontend/package.json
  git commit -m "chore(release): $TAG"
else
  echo "  (los package.json ya estaban en $VERSION; no hay bump que commitear)"
fi

echo "→ Creando tag $TAG"
git tag -a "$TAG" -m "Construgest $TAG"

echo "→ Empujando main y el tag a origin"
git push origin main
git push origin "$TAG"

echo "→ Publicando la GitHub Release"
gh release create "$TAG" --title "Construgest $TAG" --generate-notes

echo "✓ Release $TAG publicada. Las instalaciones verán el aviso de actualización."
