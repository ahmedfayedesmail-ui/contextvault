#requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Write-Info {
    param([string]$Message)
    Write-Host "[ContextVault] $Message" -ForegroundColor Green
}

function Write-WarningMessage {
    param([string]$Message)
    Write-Host "[ContextVault] $Message" -ForegroundColor Yellow
}

function Test-OllamaApi {
    try {
        $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Get-OllamaListenerPid {
    $NetstatExe = Join-Path $env:SystemRoot 'System32\netstat.exe'
    if (-not (Test-Path -LiteralPath $NetstatExe -PathType Leaf)) { return $null }

    $NetstatLines = & $NetstatExe -ano -p tcp 2>$null
    foreach ($Line in $NetstatLines) {
        $Fields = @($Line.Trim() -split '\s+')
        if ($Fields.Count -ge 5 -and $Fields[0] -eq 'TCP' -and $Fields[1].EndsWith(':11434') -and $Fields[3] -eq 'LISTENING') {
            $ProcessId = 0
            if ([int]::TryParse([string]$Fields[4], [ref]$ProcessId)) { return $ProcessId }
        }
    }
    return $null
}

function Get-OllamaAppExe {
    param([Parameter(Mandatory = $true)][string]$OllamaCliPath)
    $Candidate = Join-Path (Split-Path -Parent $OllamaCliPath) 'ollama app.exe'
    if (Test-Path -LiteralPath $Candidate -PathType Leaf) {
        return [IO.Path]::GetFullPath($Candidate)
    }
    return $null
}

function Wait-OllamaApi {
    param([ValidateRange(1, 120)][int]$TimeoutSeconds = 30)
    for ($Attempt = 0; $Attempt -lt $TimeoutSeconds; $Attempt++) {
        if (Test-OllamaApi) { return $true }
        Start-Sleep -Seconds 1
    }
    return (Test-OllamaApi)
}

function Start-OllamaService {
    param([Parameter(Mandatory = $true)][string]$OllamaCliPath)
    if (Test-OllamaApi) { return $true }

    $ListenerPid = Get-OllamaListenerPid
    if ($ListenerPid) {
        $ListenerProcess = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ListenerPid" -ErrorAction SilentlyContinue
        $ListenerPath = if ($ListenerProcess) { [string]$ListenerProcess.ExecutablePath } else { '' }
        $OllamaAppExe = Get-OllamaAppExe -OllamaCliPath $OllamaCliPath
        $IsOllamaListener = $ListenerPath -and (
            ($ListenerPath -ieq $OllamaCliPath) -or
            ($OllamaAppExe -and ($ListenerPath -ieq $OllamaAppExe))
        )

        if ($IsOllamaListener) {
            Write-Info "An unresponsive Ollama process (PID $ListenerPid) owns port 11434. Restarting that exact Ollama executable..."
            $TaskkillExe = Join-Path $env:SystemRoot 'System32\taskkill.exe'
            & $TaskkillExe /F /PID $ListenerPid | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Could not stop the unresponsive Ollama process PID $ListenerPid (taskkill exit code $LASTEXITCODE)."
            }
            Start-Sleep -Seconds 2
            $RemainingListenerPid = Get-OllamaListenerPid
            if ($RemainingListenerPid) {
                throw "Port 11434 is still occupied by PID $RemainingListenerPid after the Ollama restart attempt."
            }
        }
        else {
            $ListenerName = if ($ListenerPath) { [IO.Path]::GetFileName($ListenerPath) } else { 'unknown process' }
            throw "Port 11434 is already owned by PID $ListenerPid ($ListenerName), and it is not responding as this Ollama installation. The launcher will not terminate an unrelated process."
        }
    }

    $LogDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ContextVault\logs'
    New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
    $StdoutLog = Join-Path $LogDirectory 'ollama-serve.stdout.log'
    $StderrLog = Join-Path $LogDirectory 'ollama-serve.stderr.log'
    Remove-Item -LiteralPath $StdoutLog, $StderrLog -Force -ErrorAction SilentlyContinue
    $env:OLLAMA_HOST = '127.0.0.1:11434'

    Write-Info 'Starting Ollama with its absolute executable path...'
    try {
        Start-Process -FilePath $OllamaCliPath -ArgumentList 'serve' -WorkingDirectory (Split-Path -Parent $OllamaCliPath) -WindowStyle Hidden -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog | Out-Null
    }
    catch {
        Write-WarningMessage "Could not launch ollama.exe serve: $($_.Exception.Message)"
    }

    if (Wait-OllamaApi -TimeoutSeconds 30) { return $true }

    $OllamaAppExe = Get-OllamaAppExe -OllamaCliPath $OllamaCliPath
    if ($OllamaAppExe) {
        Write-Info 'The CLI did not expose the API. Starting the Ollama tray application...'
        try {
            Start-Process -FilePath $OllamaAppExe | Out-Null
        }
        catch {
            Write-WarningMessage "Could not launch the Ollama app: $($_.Exception.Message)"
        }
        if (Wait-OllamaApi -TimeoutSeconds 30) { return $true }
    }

    Write-WarningMessage 'Ollama is installed but the service did not start automatically. Open the Ollama app from the Start Menu, then run this launcher again.'
    Write-WarningMessage "Ollama startup logs: $StdoutLog and $StderrLog"
    return $false
}

function Test-ContextVaultApi {
    try {
        $null = Invoke-WebRequest `
            -Uri 'http://localhost:3737/health' `
            -TimeoutSec 2 `
            -UseBasicParsing `
            -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

try {
    $ProjectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'package.json'))) {
        throw 'package.json was not found. Run this script from the ContextVault project folder.'
    }

    # Discover the ContextVault-managed Node.js 22 runtime without pinning a patch version.
    $RuntimeRoot = Join-Path $env:LOCALAPPDATA 'ContextVault\runtime'
    $RuntimeDirectories = @(
        Get-ChildItem -LiteralPath $RuntimeRoot -Directory -Filter 'node-v22*-win-*' -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Name -match '^node-v22\.\d+\.\d+-win-(x64|arm64)$' -and
                (Test-Path -LiteralPath (Join-Path $_.FullName 'node.exe'))
            } |
            Sort-Object {
                [version](($_.Name -replace '^node-v', '') -replace '-win-.*$', '')
            } -Descending
    )

    if ($RuntimeDirectories.Count -gt 0) {
        $env:Path = "$($RuntimeDirectories[0].FullName);$env:Path"
    }

    $NodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
    if (-not $NodeCommand) {
        throw 'Node.js was not found. Run install-contextvault.ps1 once to install the required runtime.'
    }

    $NodeVersionText = (& $NodeCommand.Source --version 2>$null).Trim()
    $NodeVersion = [version]$NodeVersionText.TrimStart('v')
    if ($NodeVersion -lt [version]'22.13.0') {
        throw "Node.js 22.13 or newer is required. Detected $NodeVersionText. Run install-contextvault.ps1 to prepare the supported runtime."
    }
    Write-Info "Using Node.js $NodeVersionText."

    # Resolve Ollama from the same supported locations as the installer.
    $ProgramFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    $OllamaCandidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
        (Join-Path $env:LOCALAPPDATA 'Ollama\ollama.exe'),
        (Join-Path $env:ProgramFiles 'Ollama\ollama.exe')
    )
    if ($ProgramFilesX86) {
        $OllamaCandidates += (Join-Path $ProgramFilesX86 'Ollama\ollama.exe')
    }

    $OllamaExe = $OllamaCandidates |
        Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } |
        Select-Object -First 1

    if (-not $OllamaExe) {
        $OllamaCommand = Get-Command ollama -CommandType Application -ErrorAction SilentlyContinue
        if ($OllamaCommand) {
            $OllamaExe = $OllamaCommand.Source
        }
    }

    if (-not $OllamaExe) {
        throw 'Ollama was not found. Run install-contextvault.ps1 to install the official Ollama application.'
    }

    $OllamaExe = [IO.Path]::GetFullPath([string]$OllamaExe)
    $env:Path = "$(Split-Path -Parent $OllamaExe);$env:Path"

    # Ensure the Ollama API is available before pulling the model or starting ContextVault.
    $env:OLLAMA_HOST = '127.0.0.1:11434'
    if (-not (Start-OllamaService -OllamaCliPath $OllamaExe)) {
        throw 'Ollama is installed but the service did not start automatically. Open the Ollama app from the Start Menu, then run this launcher again.'
    }
    Write-Info 'Ollama is ready.'

    # Pull the required embedding model only when it is absent.
    $Tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
    $HasEmbeddingModel = @(
        $Tags.models | Where-Object {
            $_.name -match '^nomic-embed-text(?::|$)' -or
            $_.model -match '^nomic-embed-text(?::|$)'
        }
    ).Count -gt 0

    if (-not $HasEmbeddingModel) {
        Write-WarningMessage 'nomic-embed-text is not installed. Downloading it now...'
        & $OllamaExe pull 'nomic-embed-text'
        if ($LASTEXITCODE -ne 0) {
            throw 'Ollama could not download nomic-embed-text. Check your network connection and try again.'
        }
    }

    # Install npm dependencies once, on the first application launch.
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'node_modules'))) {
        Write-Info 'Installing project dependencies...'
        Push-Location $ProjectRoot
        try {
            & npm.cmd install
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed with exit code $LASTEXITCODE."
            }
        }
        finally {
            Pop-Location
        }
    }

    # Reuse an already-running local app instead of starting a second server.
    if (-not (Test-ContextVaultApi)) {
        Write-Info 'Starting ContextVault in a new terminal window...'
        $ServerCommand = "cd /d `"$ProjectRoot`" && npm run dev"
        Start-Process -FilePath $env:ComSpec `
            -ArgumentList @('/k', $ServerCommand) `
            -WorkingDirectory $ProjectRoot | Out-Null

        $AppReady = $false
        for ($Attempt = 0; $Attempt -lt 45; $Attempt++) {
            Start-Sleep -Seconds 1
            if (Test-ContextVaultApi) {
                $AppReady = $true
                break
            }
        }

        if (-not $AppReady) {
            throw 'ContextVault did not become ready at http://localhost:3737. Check the server terminal for the startup error.'
        }
    }
    else {
        Write-Info 'ContextVault is already running.'
    }

    Start-Process -FilePath 'http://localhost:3737' | Out-Null
    Write-Info 'ContextVault is ready at http://localhost:3737.'
}
catch {
    Write-Host "[ContextVault] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'For a first-time setup on a clean Windows computer, run install-contextvault.ps1 from the project folder.' -ForegroundColor Yellow
    Read-Host 'Press Enter to close'
    exit 1
}
