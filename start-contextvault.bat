@echo off
setlocal EnableExtensions

rem Resolve the project directory. The Desktop copy reads the path saved by the installer.
set "PROJECT_DIR=%~dp0"
if not exist "%PROJECT_DIR%package.json" (
  if exist "%~dp0contextvault-project.path" (
    set /p "PROJECT_DIR="<"%~dp0contextvault-project.path"
  )
)

if not exist "%PROJECT_DIR%package.json" (
  echo [ContextVault] Could not find the project folder.
  echo Run install-contextvault.ps1 from the extracted repository folder first.
  pause
  exit /b 1
)

for %%I in ("%PROJECT_DIR%") do set "PROJECT_DIR=%%~fI"

rem Prefer any ContextVault-managed Node.js 22 runtime without hard-coding its patch version.
for /d %%D in ("%LOCALAPPDATA%\ContextVault\runtime\node-v22*-win-*") do (
  if exist "%%~fD\node.exe" set "PATH=%%~fD;%PATH%"
)

rem Step 1: Verify Node.js 22.13 or newer in the Node.js 22 line is available.
where node >nul 2>nul
if errorlevel 1 (
  echo [ContextVault] Node.js was not found.
  echo Run install-contextvault.ps1 first to install the compatible runtime.
  pause
  exit /b 1
)

node -e "const [major,minor]=process.versions.node.split('.').map(Number); if (major !== 22 || minor < 13) process.exit(1)" >nul 2>nul
if errorlevel 1 (
  echo [ContextVault] Node.js 22.13 or newer is required.
  echo Run install-contextvault.ps1 to prepare the supported runtime.
  pause
  exit /b 1
)

rem Step 2: Ensure the Ollama command is available.
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
  set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"
)
where ollama >nul 2>nul
if errorlevel 1 (
  echo [ContextVault] Ollama was not found.
  echo Run install-contextvault.ps1 first to install Ollama.
  pause
  exit /b 1
)

rem Check whether the local Ollama HTTP API is already responding.
set "OLLAMA_READY=0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $null = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 set "OLLAMA_READY=1"

if "%OLLAMA_READY%"=="0" (
  echo [ContextVault] Starting the local Ollama service...
  start "ContextVault Ollama" /min ollama serve

  for /L %%I in (1,1,30) do (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $null = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 (
      set "OLLAMA_READY=1"
      goto :OLLAMA_CHECK_DONE
    )
    timeout /t 1 /nobreak >nul
  )
)

:OLLAMA_CHECK_DONE
if "%OLLAMA_READY%" NEQ "1" (
  echo [ContextVault] Ollama did not start. Check the Ollama installation and try again.
  pause
  exit /b 1
)

rem Step 3: Download the embedding model only when it is not already installed.
ollama list 2>nul | findstr /I "nomic-embed-text" >nul
if errorlevel 1 (
  echo [ContextVault] Downloading the nomic-embed-text model. This may take a while the first time...
  ollama pull nomic-embed-text
  if errorlevel 1 (
    echo [ContextVault] The embedding model could not be downloaded.
    pause
    exit /b 1
  )
)

rem Step 4: Install project dependencies on first launch.
pushd "%PROJECT_DIR%"
if errorlevel 1 (
  echo [ContextVault] Cannot open the project directory.
  pause
  exit /b 1
)
if not exist "node_modules\" (
  echo [ContextVault] Installing project dependencies...
  call npm install
  if errorlevel 1 (
    echo [ContextVault] npm install failed. Check your network connection and try again.
    pause
    exit /b 1
  )
)

rem Step 5: Start the ContextVault server in a separate terminal window.
echo [ContextVault] Starting the local server...
start "ContextVault Server" "%ComSpec%" /k "cd /d ""%PROJECT_DIR%"" && npm run dev"

rem Step 6: Give the server a moment to start, then open the local interface.
timeout /t 3 /nobreak >nul
start "" "http://localhost:3737"

popd 2>nul
exit /b 0
