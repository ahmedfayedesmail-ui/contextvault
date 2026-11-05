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
        $null = Invoke-RestMethod `
            -Uri 'http://localhost:11434/api/tags' `
            -TimeoutSec 2 `
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

    # Add Ollama's standard per-user install folder to this process if necessary.
    $OllamaInstallPath = Join-Path $env:LOCALAPPDATA 'Programs\Ollama'
    if (Test-Path -LiteralPath (Join-Path $OllamaInstallPath 'ollama.exe')) {
        $env:Path = "$OllamaInstallPath;$env:Path"
    }

    $OllamaCommand = Get-Command ollama -CommandType Application -ErrorAction SilentlyContinue
    if (-not $OllamaCommand) {
        throw 'Ollama was not found. Install it from https://ollama.com/download/windows, then run install-contextvault.ps1 again.'
    }

    # Start the local service only when the API is not already responding.
    if (-not (Test-OllamaApi)) {
        Write-Info 'Starting the local Ollama service...'
        Start-Process -FilePath $OllamaCommand.Source -ArgumentList 'serve' -WindowStyle Hidden | Out-Null

        $OllamaReady = $false
        for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
            Start-Sleep -Seconds 1
            if (Test-OllamaApi) {
                $OllamaReady = $true
                break
            }
        }

        if (-not $OllamaReady) {
            throw 'Ollama did not become ready at http://localhost:11434. Check the Ollama application and try again.'
        }
    }
    Write-Info 'Ollama is ready.'

    # Pull the required embedding model only when it is absent.
    $Tags = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 5
    $HasEmbeddingModel = @(
        $Tags.models | Where-Object {
            $_.name -match '^nomic-embed-text(?::|$)' -or
            $_.model -match '^nomic-embed-text(?::|$)'
        }
    ).Count -gt 0

    if (-not $HasEmbeddingModel) {
        Write-WarningMessage 'nomic-embed-text is not installed. Downloading it now...'
        & $OllamaCommand.Source pull 'nomic-embed-text'
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

    # Run the server in its own terminal so its logs remain visible.
    Write-Info 'Starting ContextVault in a new terminal window...'
    $ServerCommand = "cd /d `"$ProjectRoot`" && npm run dev"
    Start-Process -FilePath $env:ComSpec `
        -ArgumentList @('/k', $ServerCommand) `
        -WorkingDirectory $ProjectRoot | Out-Null

    Start-Sleep -Seconds 3
    Start-Process -FilePath 'http://localhost:3737' | Out-Null
    Write-Info 'ContextVault is opening at http://localhost:3737.'
}
catch {
    Write-Host "[ContextVault] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'For a first-time setup on a clean Windows computer, run install-contextvault.ps1 from the project folder.' -ForegroundColor Yellow
    Read-Host 'Press Enter to close'
    exit 1
}
