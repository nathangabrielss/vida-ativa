@echo off
chcp 65001 >nul
cd /d "%~dp0.."

echo ========================================
echo   Deploy - Vida Ativa
echo ========================================
echo.

if "%NODE_OPTIONS%"=="" (
  set "NODE_OPTIONS=--use-system-ca"
) else (
  echo %NODE_OPTIONS% | findstr /C:"--use-system-ca" >nul
  if errorlevel 1 set "NODE_OPTIONS=%NODE_OPTIONS% --use-system-ca"
)
if exist ".tools\node\node.exe" set "PATH=%CD%\.tools\node;%PATH%"

git status --short
echo.

if not exist "node_modules\.bin\wrangler.cmd" (
  if exist ".tools\node\npm.cmd" (
    echo Wrangler local nao encontrado. Instalando dependencias com Node portatil...
    call ".tools\node\npm.cmd" install --no-audit --no-fund --no-package-lock
    if errorlevel 1 (
      echo.
      echo Erro ao instalar dependencias com Node portatil.
      echo Deploy cancelado.
      echo.
      pause
      exit /b 1
    )
    echo.
  )
)

echo Aplicando migrations do Cloudflare D1...
if exist "node_modules\.bin\wrangler.cmd" (
  call "node_modules\.bin\wrangler.cmd" d1 migrations apply vida-ativa --remote
) else (
  where npx >nul 2>nul
  if not errorlevel 1 (
    call npx wrangler d1 migrations apply vida-ativa --remote
  ) else (
    where wrangler >nul 2>nul
    if not errorlevel 1 (
      call wrangler d1 migrations apply vida-ativa --remote
    ) else (
      echo.
      echo Erro: Wrangler nao encontrado.
      echo Rode scripts\install-node-portable.bat e depois scripts\deploy.bat.
      echo O deploy foi cancelado para evitar codigo novo com banco antigo.
      echo.
      pause
      exit /b 1
    )
  )
)

if errorlevel 1 (
  echo.
  echo Erro ao aplicar migrations D1. Deploy cancelado para evitar codigo novo com banco antigo.
  echo Verifique se voce ja rodou: wrangler login  e  wrangler d1 create vida-ativa
  echo ^(e colou o database_id gerado em wrangler.toml^)
  echo.
  pause
  exit /b 1
)
echo Migrations D1 verificadas/aplicadas.
echo.

set /p MSG=Mensagem do commit (Enter para padrao):
if "%MSG%"=="" set MSG=chore: atualizar vida ativa

git add -A

git diff --cached --quiet
if %ERRORLEVEL% equ 0 (
  echo Nenhuma alteracao para commitar.
  echo.
  pause
  exit /b 0
)

git commit -m "%MSG%"

echo.
echo Enviando para o GitHub...
git push origin main

if %ERRORLEVEL% equ 0 (
  echo.
  echo Pronto! Cloudflare Pages vai atualizar em ~1 minuto.
) else (
  echo.
  echo Erro ao fazer push. Verifique se o remote "origin" esta configurado
  echo ^(git remote add origin ^<url-do-seu-repo^>^) e suas credenciais do GitHub.
)

echo.
pause
