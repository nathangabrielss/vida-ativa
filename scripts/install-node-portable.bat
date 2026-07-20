@echo off
chcp 65001 >nul
cd /d "%~dp0.."

echo ========================================
echo   Instalar Node portatil
echo ========================================
echo.

if "%NODE_OPTIONS%"=="" (
  set "NODE_OPTIONS=--use-system-ca"
) else (
  echo %NODE_OPTIONS% | findstr /C:"--use-system-ca" >nul
  if errorlevel 1 set "NODE_OPTIONS=%NODE_OPTIONS% --use-system-ca"
)
if exist ".tools\node\node.exe" set "PATH=%CD%\.tools\node;%PATH%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-node-portable.ps1"

echo.
pause
