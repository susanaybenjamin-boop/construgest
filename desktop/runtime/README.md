# runtime/ — binarios nativos bundleados (Fase 5)

Aquí van los binarios portables que el `.msi` empaqueta y el shell (`main.js`)
arranca. **No se versionan en git** (son grandes); cada quien los coloca en su
máquina Windows antes de construir el `.msi`. `main.js` los detecta: si el
binario existe, lo arranca; si no, asume un servicio externo (útil en dev con la
MariaDB de Docker y el Ollama del host).

Estructura esperada:

```
runtime/
  mariadb/bin/mysqld.exe      ← MariaDB portable (ZIP oficial de mariadb.org)
  ollama/ollama.exe           ← Ollama para Windows + el modelo qwen2.5:3b
  tesseract/tesseract.exe     ← Tesseract OCR + datos 'spa'
  poppler/bin/pdftoppm.exe    ← Poppler (utilidades PDF para el OCR)
```

Pendiente (F5-3):
1. Descargar cada binario portable y colocarlo como arriba.
2. Ajustar el `PATH`/config del backend para tesseract/poppler (OCR local).

Ya HECHO en `main.js` (F5-2b): la inicialización de MariaDB la 1ª vez
(`mariadb-install-db` → crear BD/usuario → aplicar `database/init/*.sql`, con
marcador `.construgest-initialized`) y el `pull` del modelo Ollama la 1ª vez.
Solo faltan los binarios de arriba para que se ejecute de verdad.
