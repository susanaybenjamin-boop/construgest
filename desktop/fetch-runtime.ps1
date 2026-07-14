# ============================================================================
# Descarga y coloca los binarios nativos en desktop\runtime\ (F5-3).
# Tras esto, build-msi.ps1 genera un .msi 100% autocontenido.
#
# Uso (desde desktop\):  powershell -ExecutionPolicy Bypass -File fetch-runtime.ps1
#
# Coloca:
#   runtime\mariadb\bin\mysqld.exe   (MariaDB portable)
#   runtime\ollama\ollama.exe        (Ollama para Windows)
#
# El MODELO de IA (qwen2.5:3b) NO se descarga aquí: la app lo baja sola la
# primera vez que arranca (main.js → ensureOllamaModel). Solo hace falta
# internet en ese primer arranque.
#
# Tesseract/Poppler (OCR de PDFs escaneados) son opcionales y van aparte (ver
# runtime\README.md); los PDFs con texto funcionan sin ellos.
# ============================================================================
param(
  [string]$MariaVer  = "11.4.5",
  [string]$OllamaVer = "v0.32.0",
  [switch]$KeepGpu           # conservar las libs CUDA/ROCm (solo si el equipo tiene GPU NVIDIA/AMD)
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # descargas mucho más rápidas

$Runtime = Join-Path $PSScriptRoot "runtime"
$Tmp     = Join-Path $env:TEMP "construgest-runtime"
New-Item -ItemType Directory -Force $Runtime, $Tmp | Out-Null

function Download($url, $out) {
  Write-Host "  Descargando $url"
  Invoke-WebRequest -Uri $url -OutFile $out
}

# ── MariaDB ─────────────────────────────────────────────────────────────────
Write-Host "==> MariaDB $MariaVer"
$mzip = Join-Path $Tmp "mariadb.zip"
Download "https://archive.mariadb.org/mariadb-$MariaVer/winx64-packages/mariadb-$MariaVer-winx64.zip" $mzip
Write-Host "  Extrayendo…"
Remove-Item -Recurse -Force (Join-Path $Tmp "mariadb-$MariaVer-winx64") -ErrorAction SilentlyContinue
Expand-Archive -Path $mzip -DestinationPath $Tmp -Force
Remove-Item -Recurse -Force (Join-Path $Runtime "mariadb") -ErrorAction SilentlyContinue
Move-Item (Join-Path $Tmp "mariadb-$MariaVer-winx64") (Join-Path $Runtime "mariadb")

# ── Ollama ──────────────────────────────────────────────────────────────────
Write-Host "==> Ollama $OllamaVer"
$ozip = Join-Path $Tmp "ollama.zip"
Download "https://github.com/ollama/ollama/releases/download/$OllamaVer/ollama-windows-amd64.zip" $ozip
Write-Host "  Extrayendo…"
Remove-Item -Recurse -Force (Join-Path $Runtime "ollama") -ErrorAction SilentlyContinue
Expand-Archive -Path $ozip -DestinationPath (Join-Path $Runtime "ollama") -Force

# El zip trae ~1.85 GB de libs de GPU (CUDA/ROCm) que un equipo sin GPU no usa.
# Objetivo del proyecto: portátil i5 SIN GPU → se recortan (baja el .msi ~1.8 GB).
if (-not $KeepGpu) {
  $libDir = Join-Path $Runtime "ollama\lib\ollama"
  if (Test-Path $libDir) {
    Get-ChildItem $libDir -Directory | Where-Object { $_.Name -match 'cuda|rocm' } | ForEach-Object {
      Write-Host "  quitando libs de GPU: $($_.Name)"
      Remove-Item -Recurse -Force $_.FullName
    }
  }
}

# ── Verificación ────────────────────────────────────────────────────────────
$mysqld = Join-Path $Runtime "mariadb\bin\mysqld.exe"
$ollama = Get-ChildItem -Recurse -Path (Join-Path $Runtime "ollama") -Filter "ollama.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

Write-Host ""
if (Test-Path $mysqld) { Write-Host "OK  $mysqld" } else { Write-Warning "FALTA $mysqld" }
if ($ollama)          { Write-Host "OK  $($ollama.FullName)" } else { Write-Warning "FALTA runtime\ollama\ollama.exe" }
Write-Host ""
Write-Host "Listo. Ahora:  powershell -ExecutionPolicy Bypass -File build-msi.ps1"
