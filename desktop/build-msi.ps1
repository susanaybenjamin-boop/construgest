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

Write-Host "==> 2/4  Runtime de Electron"
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

# Nuestro código del shell -> resources\app
Copy-Item -Force "$Desktop\main.js","$Desktop\preload.js","$Desktop\package.json" $App

# Backend (sin .env local ni caché) -> resources\backend
Invoke-Robocopy (Join-Path $Root "backend") (Join-Path $Res "backend") @("/E","/XD","node_modules\.cache","/XF",".env",".env.example",".env.sample")

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

Write-Host "==> 4/4  WiX: heat + candle + light"
$AppFiles = Join-Path $Desktop "installer\AppFiles.wxs"
Invoke-Checked "$Wix\heat.exe" @("dir",$Stage,"-cg","AppFiles","-dr","INSTALLFOLDER","-gg","-g1","-sfrag","-srd","-sreg","-scom","-var","var.StageDir","-out",$AppFiles)
Invoke-Checked "$Wix\candle.exe" @("-arch","x64","-dVersion=$Version","-dStageDir=$Stage","-ext","WixUIExtension","-out","$ObjDir\",(Join-Path $Desktop "installer\Product.wxs"),$AppFiles)
$Msi = Join-Path $Dist "ConstruGest-$Version.msi"
Invoke-Checked "$Wix\light.exe" @("-ext","WixUIExtension","-sval","-o",$Msi,"$ObjDir\Product.wixobj","$ObjDir\AppFiles.wixobj")

Write-Host ""
Write-Host "OK -> $Msi"
