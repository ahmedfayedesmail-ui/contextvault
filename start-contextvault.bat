@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\" (
    call npm install
    if errorlevel 1 (
        echo ContextVault dependency installation failed.
        pause
        exit /b 1
    )
)

start "ContextVault Server" /min "%ComSpec%" /d /c "cd /d ""%~dp0"" && npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3737"
exit /b 0
