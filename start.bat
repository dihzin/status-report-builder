@echo off
cd /d "%~dp0"

echo ============================================
echo  OnePage Status Project - Inicializando
echo ============================================
echo.

echo [1/4] Verificando dependencias...
pip install -r requirements.txt --quiet
if %ERRORLEVEL% neq 0 (
    echo Erro ao instalar dependencias.
    pause
    exit /b 1
)

echo [2/4] Verificando Playwright browsers...
python -m playwright install chromium 2>nul

echo [3/4] Iniciando servidor...
echo.
echo   Acesse: http://127.0.0.1:8000
echo   Pressione Ctrl+C para parar o servidor.
echo.

python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

echo.
echo Servidor encerrado.
pause
