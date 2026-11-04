#requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Info {
    param([string]$Message)
    Write-Host "[ContextVault Installer] $Message" -ForegroundColor Green
}

function Write-Notice {
    param([string]$Message)
    Write-Host "[ContextVault Installer] $Message" -ForegroundColor Yellow
}

function Get-CompatibleNodeCommand {
    $Command = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
    if (-not $Command) {
        return $null
    }

    try {
        $VersionText = (& $Command.Source --version 2>$null).Trim()
        $Version = [version]$VersionText.TrimStart('v')
        if ($Version.Major -eq 22 -and $Version -ge [version]'22.13.0') {
            return $Command
        }
    }
    catch {
        return $null
    }

    return $null
}

function Install-Node22Runtime {
    $Architecture = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) {
        $Architecture = $env:PROCESSOR_ARCHITEW6432
    }

    switch ($Architecture.ToUpperInvariant()) {
        'AMD64' { $NodeArchitecture = 'x64' }
        'ARM64' { $NodeArchitecture = 'arm64' }
        default {
            throw "Unsupported Windows processor architecture: $Architecture. Install Node.js 22 manually from https://nodejs.org/en/download/archive/v22."
        }
    }

    # Resolve the newest stable Node.js 22.x release from the official release index.
    try {
        $Releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
    }
    catch {
        throw "Could not read the official Node.js release index. Check your internet connection and retry. Details: $($_.Exception.Message)"
    }

    $Release = $Releases |
        Where-Object { $_.version -match '^v22\.\d+\.\d+$' } |
        Sort-Object { [version]($_.version.TrimStart('v')) } -Descending |
        Select-Object -First 1

    if (-not $Release) {
        throw 'No stable Node.js 22.x release was found in the official release index.'
    }

    $NodeVersion = $Release.version.TrimStart('v')
    $ArchiveName = "node-v$NodeVersion-win-$NodeArchitecture.zip"
    $PlatformAsset = "win-$NodeArchitecture-zip"
    if ($Release.files -notcontains $PlatformAsset) {
        throw "The latest Node.js $NodeVersion release does not publish the required Windows $NodeArchitecture archive."
    }

    $DownloadUrl = "https://nodejs.org/dist/v$NodeVersion/$ArchiveName"
    $ManifestUrl = "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt"
    $RuntimeRoot = Join-Path $env:LOCALAPPDATA 'ContextVault\runtime'
    $NodeHome = Join-Path $RuntimeRoot "node-v$NodeVersion-win-$NodeArchitecture"
    $NodeExecutable = Join-Path $NodeHome 'node.exe'

    if (-not (Test-Path -LiteralPath $NodeExecutable)) {
        Write-Info "Downloading the official Node.js $NodeVersion runtime ($NodeArchitecture)..."
        New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null

        $ArchivePath = Join-Path $env:TEMP $ArchiveName
        $ManifestPath = Join-Path $env:TEMP "node-v$NodeVersion-SHASUMS256.txt"

        Invoke-WebRequest -Uri $DownloadUrl -OutFile $ArchivePath -UseBasicParsing
        Invoke-WebRequest -Uri $ManifestUrl -OutFile $ManifestPath -UseBasicParsing

        # Verify the downloaded archive against the SHA-256 manifest published by nodejs.org.
        $ManifestLine = Get-Content -LiteralPath $ManifestPath | Where-Object {
            $_ -match "\s+$([regex]::Escape($ArchiveName))$"
        } | Select-Object -First 1
        if (-not $ManifestLine) {
            throw "The official SHA-256 checksum for $ArchiveName was not found."
        }

        $ExpectedHash = ($ManifestLine -split '\s+')[0].ToUpperInvariant()
        $ActualHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToUpperInvariant()
        if ($ActualHash -ne $ExpectedHash) {
            Remove-Item -LiteralPath $ArchivePath -Force -ErrorAction SilentlyContinue
            throw 'Node.js archive checksum verification failed. The downloaded file was rejected.'
        }

        Expand-Archive -LiteralPath $ArchivePath -DestinationPath $RuntimeRoot -Force
        Remove-Item -LiteralPath $ArchivePath -Force -ErrorAction SilentlyContinue
    }

    if (-not (Test-Path -LiteralPath $NodeExecutable)) {
        throw "Node.js installation could not be verified at $NodeExecutable."
    }

    $InstalledNodeVersion = (& $NodeExecutable --version 2>$null).Trim()
    if ($InstalledNodeVersion -ne "v$NodeVersion") {
        throw "The installed Node.js runtime reported $InstalledNodeVersion instead of v$NodeVersion."
    }

    # Keep the managed runtime folder unambiguous for both launchers.
    Get-ChildItem -LiteralPath $RuntimeRoot -Directory -Filter 'node-v22*-win-*' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -ne $NodeHome } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    # Persist the supported runtime in the current user's PATH (no machine-wide PATH change).
    $UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $PathEntries = @($UserPath -split ';' | Where-Object { $_ })
    if (-not ($PathEntries | Where-Object { $_.TrimEnd('\') -ieq $NodeHome.TrimEnd('\') })) {
        $UpdatedUserPath = (@($PathEntries) + $NodeHome) -join ';'
        [Environment]::SetEnvironmentVariable('Path', $UpdatedUserPath, 'User')
    }

    $env:Path = "$NodeHome;$env:Path"
    Write-Info "Node.js $NodeVersion is ready in the current user profile."
}

function Get-OllamaCommand {
    $Command = Get-Command ollama -CommandType Application -ErrorAction SilentlyContinue
    if ($Command) {
        return $Command
    }

    $KnownPath = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    if (Test-Path -LiteralPath $KnownPath) {
        $env:Path = "$(Split-Path -Parent $KnownPath);$env:Path"
        return Get-Command ollama -CommandType Application -ErrorAction SilentlyContinue
    }

    return $null
}

function Test-OllamaApi {
    try {
        $null = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

try {
    $ProjectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'package.json'))) {
        throw 'package.json was not found. Extract the full ContextVault repository and run this installer from its root folder.'
    }

    Write-Info 'Preparing ContextVault for the current Windows user...'

    # Install a compatible Node.js 22 runtime when it is missing or outside the project engine range.
    if (-not (Get-CompatibleNodeCommand)) {
        Install-Node22Runtime
    }
    else {
        $NodeCommand = Get-CompatibleNodeCommand
        $NodeVersionText = (& $NodeCommand.Source --version).Trim()
        Write-Info "Compatible Node.js $NodeVersionText is already installed."
    }

    $NodeCommand = Get-CompatibleNodeCommand
    if (-not $NodeCommand) {
        throw 'Node.js 22.13 or newer could not be located after installation.'
    }

    # Ollama is installed manually from its official Windows download page.
    # Avoid downloading and executing a remote installer script from this setup process.
    $OllamaCommand = Get-OllamaCommand
    if (-not $OllamaCommand) {
        Write-Notice 'Ollama for Windows is not installed.'
        Write-Host 'Download and install Ollama from:' -ForegroundColor Yellow
        Write-Host 'https://ollama.com/download/windows' -ForegroundColor Cyan
        throw 'After installing Ollama, run install-contextvault.ps1 again.'
    }

    # Ensure the local Ollama service is available; launch it if the Windows app is not already serving.
    if (-not (Test-OllamaApi)) {
        Write-Info 'Starting Ollama for the first time...'
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
            throw 'Ollama is installed but its local API did not start. Open the Ollama application once, then run install-contextvault.ps1 again.'
        }
    }
    Write-Info 'Ollama local API is ready.'

    # Install project dependencies into this repository.
    $NodeDirectory = Split-Path -Parent $NodeCommand.Source
    $NpmCommand = Join-Path $NodeDirectory 'npm.cmd'
    if (-not (Test-Path -LiteralPath $NpmCommand)) {
        $NpmApplication = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue
        if ($NpmApplication) {
            $NpmCommand = $NpmApplication.Source
        }
        else {
            throw 'npm.cmd was not found beside the selected Node.js runtime. Re-run the installer or repair Node.js 22.'
        }
    }

    Write-Info 'Installing ContextVault dependencies with npm install...'
    Push-Location $ProjectRoot
    try {
        & $NpmCommand install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE. Check the network connection and run the installer again."
        }
    }
    finally {
        Pop-Location
    }

    # Copy a working Desktop launcher. Its companion path file lets the copy find this repository.
    $DesktopPath = [Environment]::GetFolderPath('Desktop')
    if (-not (Test-Path -LiteralPath $DesktopPath)) {
        New-Item -ItemType Directory -Path $DesktopPath -Force | Out-Null
    }

    $SourceBatch = Join-Path $ProjectRoot 'start-contextvault.bat'
    if (-not (Test-Path -LiteralPath $SourceBatch)) {
        throw 'start-contextvault.bat is missing from the repository root.'
    }

    $DesktopBatch = Join-Path $DesktopPath 'start-contextvault.bat'
    Copy-Item -LiteralPath $SourceBatch -Destination $DesktopBatch -Force

    $ProjectPathFile = Join-Path $DesktopPath 'contextvault-project.path'
    Set-Content -LiteralPath $ProjectPathFile -Value $ProjectRoot -Encoding Default

    # Create a standard Windows shortcut that launches the Desktop batch file.
    $ShortcutPath = Join-Path $DesktopPath 'ContextVault.lnk'
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $env:ComSpec
    $Shortcut.Arguments = '/c ""' + $DesktopBatch + '""'
    $Shortcut.WorkingDirectory = $ProjectRoot
    $Shortcut.Description = 'Start the local ContextVault application'
    $Shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll, 13"
    $Shortcut.Save()

    Write-Info 'Installation completed successfully.'
    Write-Info "Desktop shortcut: $ShortcutPath"
    Write-Info 'Double-click ContextVault on your Desktop whenever you want to start the application.'
    Write-Notice 'The first launch downloads nomic-embed-text if it is not already installed.'
    Write-Notice 'If Windows blocks the script, open PowerShell in this folder and run: powershell -ExecutionPolicy Bypass -File .\install-contextvault.ps1'
}
catch {
    Write-Host "[ContextVault Installer] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Next step: install Ollama from https://ollama.com/download/windows, then run this installer again.' -ForegroundColor Yellow
    Read-Host 'Press Enter to close'
    exit 1
}
