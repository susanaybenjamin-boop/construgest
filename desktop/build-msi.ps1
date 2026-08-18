# ============================================================================
# Construye el .msi de ConstruGest con WiX v3 (estilo Benjagest).
#
#   1) build del frontend standalone
#   2) empaqueta Electron a mano (runtime + resources/app + resources/*)
#   3) heat cosecha el payload, candle compila, light enlaza -> dist\*.msi
#
# Uso (desde desktop\):  powershell -File build-msi.ps1 [-Version 0.1.0]
# Requisitos: Node, npm y WiX Toolset v3.14 instalados.
# ============================================================================
param([string]$Version = "0.1.0")
$ErrorActionPreference = "Stop"

$Desktop = $PSScriptRoot
$Root    = Split-Path -Parent $Desktop
$Stage   = Join-Path $Desktop "build\stage"
$ObjDir  = Join-Path $Desktop "build\obj"
$Dist    = Join-Path $Desktop "dist"
$Wix     = "C:\Program Files (x86)\WiX Toolset v3.14\bin"

if (-not (Test-Path "$Wix\candle.exe")) { throw "No se encuentra WiX v3.14 en $Wix" }

function Invoke-Checked($file, $arguments) {
  & $file @arguments
  if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($file)) falló (código $LASTEXITCODE)" }
}
function Invoke-Robocopy($src, $dst, $extra) {
  & robocopy $src $dst @extra | Out-Null
  # robocopy: 0-7 = éxito (con/ sin copias); >=8 = error real.
  if ($LASTEXITCODE -ge 8) { throw "robocopy $src -> $dst falló (código $LASTEXITCODE)" }
  $global:LASTEXITCODE = 0
}

Write-Host "==> 1/4  Build del frontend (standalone, limpio)"
Push-Location (Join-Path $Root "frontend")
# Build LIMPIO: si un `next dev` estuvo usando .next, contamina el standalone
# (aparece el overlay de dev tools). Se borra antes de compilar producción.
Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue
Invoke-Checked "npm" @("run","build")
Copy-Item -Recurse -Force ".next\static"  ".next\standalone\.next\static"
Copy-Item -Recurse -Force "public"        ".next\standalone\public"
Pop-Location

Write-Host "==> 2/4  Dependencias (backend + runtime de Electron)"
# El backend se empaqueta con SU node_modules → tiene que estar COMPLETO. En dev
# se usa Docker (que hace su propio npm install), así que el node_modules local
# puede estar incompleto y romper el backend empaquetado (p.ej. faltar dotenv).
Push-Location (Join-Path $Root "backend")
Invoke-Checked "npm" @("install", "--omit=dev", "--no-audit", "--no-fund")
Pop-Location
Push-Location $Desktop
if (-not (Test-Path "node_modules\electron\dist")) { Invoke-Checked "npm" @("install") }
Pop-Location

Write-Host "==> 3/4  Preparando el payload en $Stage"
Remove-Item -Recurse -Force $Stage, $ObjDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Stage, $ObjDir, $Dist | Out-Null

# Runtime de Electron -> raíz, y renombramos el exe.
Copy-Item -Recurse -Force "$Desktop\node_modules\electron\dist\*" $Stage
Rename-Item (Join-Path $Stage "electron.exe") "ConstruGest.exe"

$Res = Join-Path $Stage "resources"
$App = Join-Path $Res "app"
New-Item -ItemType Directory -Force $App | Out-Null

# Nuestro código del shell -> resources\app (TODOS los .js de la raíz de
# desktop\: con la lista a mano se quedó fuera window-state.js y el .msi
# habría roto la app al arrancar — cazado en el gate pre-release de 0.4.4).
Copy-Item -Force "$Desktop\*.js" $App
Copy-Item -Force "$Desktop\package.json" $App

# Backend (sin .env local, credenciales ni caché) -> resources\backend
# El .msi se publica en un repo PUBLICO: aqui solo se excluye por nombre, y
# ademas el gate de secretos de abajo revienta el build si se cuela algo.
# Las exclusiones de credenciales son LAS MISMAS del .gitignore (bloque
# "Credenciales / secretos"): si algo no se sube a git, tampoco se empaqueta.
Invoke-Robocopy (Join-Path $Root "backend") (Join-Path $Res "backend") @("/E","/XD","node_modules\.cache","/XF",".env",".env.example",".env.sample","google-vision-key.json","*-credentials.json","construgest-web-*.json","*service-account*.json","*.p12","*.pfx")

# Frontend standalone -> resources\frontend (server.js en la raíz)
Invoke-Robocopy (Join-Path $Root "frontend\.next\standalone") (Join-Path $Res "frontend") @("/E")

# Esquema -> resources\database\init
$Db = Join-Path $Res "database\init"
New-Item -ItemType Directory -Force $Db | Out-Null
Copy-Item -Force (Join-Path $Root "database\init\*.sql") $Db

# Binarios nativos (MariaDB/Ollama/OCR) si están presentes.
if (Test-Path "$Desktop\runtime") {
  Invoke-Robocopy "$Desktop\runtime" (Join-Path $Res "runtime") @("/E","/XF","README.md")
}

# ---------------------------------------------------------------------------
# GATE DE SECRETOS. El .msi se publica en un repositorio PUBLICO, asi que nada
# que parezca una credencial puede entrar en el payload.
#
# Por que existe: hasta la 0.4.5 el robocopy del backend solo excluia .env*, y
# backend\google-vision-key.json (service account REAL de Google Cloud) se
# empaqueto en los .msi 0.4.2, 0.4.3 y 0.4.4, que estan publicados. Excluir por
# nombre no basta: cualquier credencial nueva con otro nombre volveria a colarse.
#
# Se ignora node_modules a proposito: las dependencias traen claves de prueba en
# sus tests y no son secretos nuestros.
# ---------------------------------------------------------------------------
Write-Host "==> 3.5/4  Gate de secretos sobre el payload"

$NamePatterns = @('*credential*.json','*-key.json','google-vision-key.json','.env','.env.*','*.p12','*.pfx','*.pem','id_rsa','*.keystore')
$ContentMarks = @('BEGIN PRIVATE KEY','BEGIN RSA PRIVATE KEY','BEGIN OPENSSH PRIVATE KEY','"type": "service_account"','"private_key"')
$TextExt      = @('.json','.env','.txt','.yml','.yaml','.js','.cjs','.mjs','.ts','.ps1','.sh','.cfg','.ini','.conf')

$Suspects = @()
$candidates = Get-ChildItem -Path $Stage -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\node_modules\\' }

foreach ($f in $candidates) {
  $rel = $f.FullName.Substring($Stage.Length).TrimStart('\')
  foreach ($p in $NamePatterns) {
    if ($f.Name -like $p) { $Suspects += "$rel  (nombre: $p)"; break }
  }
  if ($f.Length -lt 1MB -and $TextExt -contains $f.Extension.ToLower()) {
    $head = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($head) {
      foreach ($m in $ContentMarks) {
        if ($head.Contains($m)) { $Suspects += "$rel  (contenido: $m)"; break }
      }
    }
  }
}

$Suspects = $Suspects | Sort-Object -Unique
if ($Suspects.Count -gt 0) {
  Write-Host ""
  Write-Host "GATE DE SECRETOS: el payload contiene posibles credenciales." -ForegroundColor Red
  $Suspects | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
  Write-Host ""
  throw "Build abortado: quita esos ficheros o anadelos a las exclusiones del robocopy. NO publiques este .msi."
}
Write-Host "    OK: $($candidates.Count) ficheros revisados (node_modules excluido), sin credenciales."

Write-Host "==> 4/4  WiX: heat + candle + light"
$AppFiles = Join-Path $Desktop "installer\AppFiles.wxs"
Invoke-Checked "$Wix\heat.exe" @("dir",$Stage,"-cg","AppFiles","-dr","INSTALLFOLDER","-gg","-g1","-sfrag","-srd","-sreg","-scom","-var","var.StageDir","-out",$AppFiles)
Invoke-Checked "$Wix\candle.exe" @("-arch","x64","-dVersion=$Version","-dStageDir=$Stage","-ext","WixUIExtension","-out","$ObjDir\",(Join-Path $Desktop "installer\Product.wxs"),$AppFiles)
$Msi = Join-Path $Dist "ConstruGest-$Version.msi"
Invoke-Checked "$Wix\light.exe" @("-ext","WixUIExtension","-sval","-o",$Msi,"$ObjDir\Product.wixobj","$ObjDir\AppFiles.wixobj")

Write-Host ""
Write-Host "OK -> $Msi"
