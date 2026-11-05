@echo off
setlocal
cd /d "%~dp0"

rem The PowerShell launcher handles the ContextVault-managed Node.js runtime
rem and gives a clear next step if first-time installation has not been run.
if not exist "%~dp0start-contextvault.ps1" (
    echo ContextVault launcher was not found.
    echo Download and extract the complete ContextVault repository.
    pause
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-contextvault.ps1"
if errorlevel 1 (
    echo.
    echo ContextVault could not start.
    echo For a first-time setup, right-click install-contextvault.ps1 and select Run with PowerShell.
    pause
    exit /b 1
)

exit /b 0
