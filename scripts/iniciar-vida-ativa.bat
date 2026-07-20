@echo off
setlocal EnableDelayedExpansion
title Vida Ativa
color 0A
set "APP_ROOT=%~dp0.."
set "PORTA=5056"

goto :MAIN

REM ============================================================
:BOOT
REM ============================================================
echo.
echo ============================================================
echo            Vida Ativa - Inicializador
echo ============================================================
echo.

REM ----- 1. Mata processo zumbi na porta (se existir) -----
echo [1/5] Verificando processos na porta %PORTA%...
set "FOUND_PID="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORTA%" ^| findstr "LISTENING"') do (
    set "FOUND_PID=%%a"
)
if defined FOUND_PID (
    echo       Processo antigo encontrado ^(PID !FOUND_PID!^). Encerrando...
    taskkill /F /PID !FOUND_PID! >nul 2>&1
    timeout /t 1 /nobreak >nul
    echo       OK - porta %PORTA% liberada.
) else (
    echo       Porta livre.
)
echo.

REM ----- 2. Limpa __pycache__ (evita problemas de sync OneDrive) -----
echo [2/5] Limpando cache do Python...
set "PYCACHE=%APP_ROOT%\backend\__pycache__"
if exist "!PYCACHE!" (
    rmdir /S /Q "!PYCACHE!" 2>nul
    echo       Cache removido.
) else (
    echo       Nada pra limpar.
)
echo.

REM ----- 3. Ativa o ambiente virtual -----
echo [3/5] Ativando ambiente virtual...
set "VENV="
if exist "%APP_ROOT%\venv\Scripts\activate.bat" set "VENV=%APP_ROOT%\venv\Scripts\activate.bat"
if not defined VENV if exist "C:\Users\nathan.gabriel\ambiente.virtual\Scripts\activate.bat" set "VENV=C:\Users\nathan.gabriel\ambiente.virtual\Scripts\activate.bat"
if not defined VENV (
    echo.
    echo ERRO: ambiente virtual nao encontrado.
    echo Procurei em:
    echo   %APP_ROOT%\venv\Scripts\activate.bat
    echo   C:\Users\nathan.gabriel\ambiente.virtual\Scripts\activate.bat
    echo.
    pause
    exit /b 1
)
call "!VENV!"
echo       OK ^(!VENV!^).
echo.

REM ----- 4. Detecta DB_PATH fora do OneDrive (opcional) -----
echo [4/5] Localizando data.db...
if not defined DB_PATH (
    set "LOCAL_DB=%LOCALAPPDATA%\VidaAtiva\data.db"
    if exist "!LOCAL_DB!" (
        set "DB_PATH=!LOCAL_DB!"
        echo       Usando DB local ^(fora do OneDrive^): !DB_PATH!
    ) else (
        echo       Usando DB do diretorio do app ^(no OneDrive^).
    )
) else (
    echo       DB_PATH ja definido: !DB_PATH!
)
echo.

REM ----- 5. Sobe o Flask -----
echo [5/5] Subindo o servidor Flask...
echo.
echo ============================================================
echo   Acesse: http://127.0.0.1:%PORTA%
echo.
echo   Ctrl+C  S  =  fechar
echo   Ctrl+C  N  =  reiniciar
echo ============================================================
echo.
cd /d "%APP_ROOT%\backend"
set "PORT=%PORTA%"
set "FLASK_SECRET_KEY=vida_ativa_local_dev"
python app.py

REM ============================================================
REM  Chegou aqui via Ctrl+C + N (o Flask ja morreu, bat continua)
REM ============================================================
echo.
echo ============================================================
echo   Reiniciando...
echo ============================================================
echo.
goto :BOOT

:MAIN
goto :BOOT
