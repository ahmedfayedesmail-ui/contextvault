@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\\" (
    echo Installing ContextVault dependencies...
    call npm install
    if errorlevel 1 (
        echo ContextVault dependency installation failed.
        pause
        exit /b 1
    )
)

rem Resolve Ollama without relying on one fixed install location.
set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not exist "%OLLAMA_EXE%" if exist "%ProgramFiles%\Ollama\ollama.exe" set "OLLAMA_EXE=%ProgramFiles%\Ollama\ollama.exe"
if not exist "%OLLAMA_EXE%" if exist "%ProgramFiles(x86)%\Ollama\ollama.exe" set "OLLAMA_EXE=%ProgramFiles(x86)%\Ollama\ollama.exe"
if not exist "%OLLAMA_EXE%" set "OLLAMA_EXE=ollama"

rem Start Ollama only when its local API is not already responding.
powershell -NoProfile -Command "try { $null = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto ollama_ready

echo Starting Ollama...
if "%OLLAMA_EXE%"=="ollama" goto start_ollama_from_path
start "Ollama" /min "%OLLAMA_EXE%" serve
goto ollama_started

:start_ollama_from_path
start "Ollama" /min ollama serve

:ollama_started
set /a OLLAMA_WAIT=0

:wait_for_ollama
powershell -NoProfile -Command "try { $null = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto ollama_ready
set /a OLLAMA_WAIT+=1
if %OLLAMA_WAIT% GEQ 45 goto ollama_start_failed
timeout /t 2 /nobreak >nul
goto wait_for_ollama

:ollama_ready
echo Checking the nomic-embed-text model...
set "OLLAMA_LIST_FILE=%TEMP%\contextvault-ollama-list.txt"
if "%OLLAMA_EXE%"=="ollama" goto list_ollama_from_path
"%OLLAMA_EXE%" list > "%OLLAMA_LIST_FILE%" 2>&1
goto ollama_list_done

:list_ollama_from_path
ollama list > "%OLLAMA_LIST_FILE%" 2>&1

:ollama_list_done
if errorlevel 1 goto ollama_list_failed
findstr /I /C:"nomic-embed-text" "%OLLAMA_LIST_FILE%" >nul
if not errorlevel 1 goto model_ready

echo nomic-embed-text is missing. Downloading it now...
if "%OLLAMA_EXE%"=="ollama" goto pull_ollama_from_path
"%OLLAMA_EXE%" pull nomic-embed-text
goto ollama_pull_done

:pull_ollama_from_path
ollama pull nomic-embed-text

:ollama_pull_done
if errorlevel 1 goto ollama_pull_failed

:model_ready
if exist "%OLLAMA_LIST_FILE%" del "%OLLAMA_LIST_FILE%" >nul 2>&1
echo Embedding model is ready.

echo Starting ContextVault...
start "ContextVault Server" /min "%ComSpec%" /d /c "cd /d ""%~dp0"" && npm run dev"
set /a APP_WAIT=0

:wait_for_contextvault
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri 'http://localhost:3737/health' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto contextvault_ready
set /a APP_WAIT+=1
if %APP_WAIT% GEQ 30 goto contextvault_start_failed
timeout /t 2 /nobreak >nul
goto wait_for_contextvault

:contextvault_ready
start "" "http://localhost:3737"
exit /b 0

:ollama_start_failed
echo Ollama did not become ready on localhost:11434.
echo Check the Ollama installation and try again.
pause
exit /b 1

:ollama_list_failed
if exist "%OLLAMA_LIST_FILE%" type "%OLLAMA_LIST_FILE%"
echo Could not read the installed Ollama models.
pause
exit /b 1

:ollama_pull_failed
echo Failed to download nomic-embed-text. ContextVault cannot index projects without it.
pause
exit /b 1

:contextvault_start_failed
echo ContextVault did not become ready on localhost:3737.
echo Check the server output and try again.
pause
exit /b 1
