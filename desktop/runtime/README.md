# runtime/ — binarios nativos bundleados (F5-3)

Aquí van los binarios que el `.msi` empaqueta y el shell (`main.js`) arranca.
**No se versionan en git** (son grandes). `main.js` los detecta: si el binario
existe lo arranca; si no, asume un servicio externo (en dev usa la MariaDB de
Docker y el Ollama del host).

## La forma fácil: un script lo hace todo

Desde `desktop\`:

```powershell
powershell -ExecutionPolicy Bypass -File fetch-runtime.ps1
```

Descarga MariaDB y Ollama y los deja colocados en su sitio. Luego ya puedes
construir el `.msi` autocontenido con `build-msi.ps1`.

## Qué estructura deja (por si lo haces a mano)

```
desktop\runtime\
  mariadb\bin\mysqld.exe      ← MariaDB portable
  ollama\ollama.exe           ← Ollama para Windows
```

- **MariaDB**: bájate el ZIP `mariadb-XX-winx64.zip` de archive.mariadb.org,
  descomprímelo, y renombra/mueve la carpeta resultante `mariadb-XX-winx64` a
  `desktop\runtime\mariadb` (dentro tiene `bin\`, `share\`, etc.).
- **Ollama**: baja `ollama-windows-amd64.zip` de las releases de GitHub de
  Ollama y descomprímelo en `desktop\runtime\ollama` (queda `ollama.exe` dentro).

## El modelo de IA NO va aquí

`qwen2.5:3b` lo descarga **la app sola** la 1ª vez que arranca (main.js →
`ensureOllamaModel`). Solo hace falta internet en ese primer arranque.

## Opcional: OCR de PDFs escaneados (Tesseract + Poppler)

Solo para leer PDFs **escaneados** (los PDFs con texto funcionan sin esto).
Tesseract no tiene un ZIP portable oficial cómodo, así que de momento es manual:
- Poppler: `poppler-windows` (releases de GitHub) → `runtime\poppler\`.
- Tesseract: instalador de UB-Mannheim, o un build portable → `runtime\tesseract\`.
Queda pendiente cablear su ruta en el backend.
