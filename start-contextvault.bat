@echo off
setlocal
cd /d "%~dp0"

rem The PowerShell launcher verifies Ollama at 127.0.0.1:11434, starts the
rem installed Ollama CLI/tray app when needed, then starts ContextVault.
rem Keep OLLAMA_HOST aligned with the IPv4 health check for child processes.
set "OLLAMA_HOST=127.0.0.1:11434"
if not exist "%~dp0start-contextvault.ps1" (
    echo ContextVault launcher was not found.
    echo Download and extract the complete ContextVault repository.
    pause
    exit /b 1
)

echo [ContextVault] Checking Ollama and preparing the local dashboard...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-contextvault.ps1"
if errorlevel 1 (
    echo.
    echo ContextVault could not start.
    echo For a first-time setup, right-click install-contextvault.ps1 and select Run with PowerShell.
    pause
    exit /b 1
)

exit /b 0
