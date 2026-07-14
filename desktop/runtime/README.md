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
2. En `main.js`, completar la inicialización de MariaDB la 1ª vez
   (`mysql_install_db` + aplicar `database/init/*.sql`) y el `ollama pull` del
   modelo si no está.
3. Ajustar el `PATH`/config del backend para tesseract/poppler (OCR local).
