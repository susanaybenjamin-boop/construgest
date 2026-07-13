@echo off
REM ConstruGest - Parar backend local
REM Busca y cierra el proceso Node.js del backend en puerto 5000

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo Backend local detenido.
