#requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$EnableOllamaStartup
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Info {
    param([string]$Message)
    Write-Host "[ContextVault] $Message" -ForegroundColor Green
}

$script:InstallStep = 0
$script:TranscriptStarted = $false
$script:LogDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ContextVault\logs'
$script:LogPath = $null

try {
    New-Item -ItemType Directory -Path $script:LogDirectory -Force | Out-Null
    $script:LogPath = Join-Path $script:LogDirectory ("installer-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Start-Transcript -Path $script:LogPath -Force | Out-Null
    $script:TranscriptStarted = $true
    Write-Info "Detailed installation log: $script:LogPath"
}
catch {
    Write-Host "[ContextVault] Could not start the installation log: $($_.Exception.Message)" -ForegroundColor Yellow
}

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)
    $script:InstallStep++
    Write-Host ""
    Write-Host "[$($script:InstallStep)/7] $Message" -ForegroundColor Cyan
}

function Invoke-DownloadWithRetry {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][string]$OutFile,
        [Parameter(Mandatory = $true)][string]$Description,
        [ValidateRange(1, 5)][int]$Retries = 3
    )

    for ($Attempt = 1; $Attempt -le $Retries; $Attempt++) {
        try {
            Write-Info "$Description (attempt $Attempt of $Retries)..."
            Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
            Invoke-WebRequest -Uri $Uri -OutFile $OutFile -UseBasicParsing -TimeoutSec 900 -ErrorAction Stop

            if (-not (Test-Path -LiteralPath $OutFile -PathType Leaf)) {
                throw "Download did not create the expected file: $OutFile"
            }

            $DownloadedFile = Get-Item -LiteralPath $OutFile
            if ($DownloadedFile.Length -le 0) {
                throw "Downloaded file is empty: $OutFile"
            }

            return
        }
        catch {
            $Failure = $_.Exception.Message
            Write-Host "[ContextVault] $Description failed: $Failure" -ForegroundColor Yellow
            Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue

            if ($Attempt -eq $Retries) {
                throw "$Description failed after $Retries attempts. Check the network connection and review the installer log. Last error: $Failure"
            }

            Start-Sleep -Seconds ([Math]::Min(5 * $Attempt, 15))
        }
    }
}

function Get-NodeCandidatePaths {
    # Resolve node.exe directly. No Get-Command, where.exe, command cache, or PATH lookup.
    $Candidates = New-Object 'System.Collections.Generic.List[string]'
    $ProgramFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    $LocalAppData = [Environment]::GetFolderPath('LocalApplicationData')
    $RoamingAppData = [Environment]::GetFolderPath('ApplicationData')
    $UserProfile = [Environment]::GetFolderPath('UserProfile')

    $KnownPaths = @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path $LocalAppData 'Programs\nodejs\node.exe'),
        (Join-Path $LocalAppData 'ContextVault\runtime\node.exe'),
        (Join-Path $RoamingAppData 'nvm\node.exe'),
        (Join-Path $UserProfile 'scoop\apps\nodejs\current\node.exe'),
        'C:\nodejs\node.exe',
        'C:\tools\nodejs\node.exe'
    )
    if ($ProgramFilesX86) {
        $KnownPaths += (Join-Path $ProgramFilesX86 'nodejs\node.exe')
    }

    $NvmSymlink = [Environment]::GetEnvironmentVariable('NVM_SYMLINK')
    if ($NvmSymlink) { $KnownPaths += (Join-Path $NvmSymlink 'node.exe') }

    foreach ($PathCandidate in $KnownPaths) {
        if ($PathCandidate -and -not $Candidates.Contains($PathCandidate)) {
            [void]$Candidates.Add($PathCandidate)
        }
    }

    # Read direct installation registrations from the Windows registry.
    $InstallRegistryKeys = @(
        'HKLM:\SOFTWARE\Node.js',
        'HKLM:\SOFTWARE\WOW6432Node\Node.js',
        'HKCU:\SOFTWARE\Node.js'
    )
    foreach ($RegistryPath in $InstallRegistryKeys) {
        try {
            $RegistryEntry = Get-ItemProperty -LiteralPath $RegistryPath -ErrorAction Stop
            if ($RegistryEntry.InstallPath) {
                $InstallPath = [Environment]::ExpandEnvironmentVariables([string]$RegistryEntry.InstallPath)
                $RegistryNode = if ([IO.Path]::GetExtension($InstallPath) -ieq '.exe') {
                    $InstallPath
                } else {
                    Join-Path $InstallPath 'node.exe'
                }
                if (-not $Candidates.Contains($RegistryNode)) { [void]$Candidates.Add($RegistryNode) }
            }
        }
        catch { }
    }

    $AppPathKeys = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\node.exe',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\node.exe',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\node.exe'
    )
    foreach ($RegistryPath in $AppPathKeys) {
        try {
            $RegistryKey = Get-Item -LiteralPath $RegistryPath -ErrorAction Stop
            $RegisteredExe = [Environment]::ExpandEnvironmentVariables([string]$RegistryKey.GetValue(''))
            if ($RegisteredExe -and -not $Candidates.Contains($RegisteredExe)) {
                [void]$Candidates.Add($RegisteredExe)
            }
        }
        catch { }
    }

    # Support common version managers by launching their real node.exe files, not their shims.
    $VersionManagerRoots = @(
        (Join-Path $LocalAppData 'fnm\node-versions'),
        (Join-Path $LocalAppData 'Volta\tools\image\node'),
        (Join-Path $RoamingAppData 'nvm'),
        (Join-Path $env:ProgramFiles 'nvm')
    )
    foreach ($Root in $VersionManagerRoots) {
        if (Test-Path -LiteralPath $Root -PathType Container) {
            Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue |
                ForEach-Object {
                    $PossibleExe = Join-Path $_.FullName 'node.exe'
                    if (Test-Path -LiteralPath $PossibleExe -PathType Leaf) {
                        if (-not $Candidates.Contains($PossibleExe)) { [void]$Candidates.Add($PossibleExe) }
                    }

                    $NestedExe = Join-Path $_.FullName 'installation\node.exe'
                    if (Test-Path -LiteralPath $NestedExe -PathType Leaf) {
                        if (-not $Candidates.Contains($NestedExe)) { [void]$Candidates.Add($NestedExe) }
                    }
                }
        }
    }

    $ManagedRuntimeRoot = Join-Path $LocalAppData 'ContextVault\runtime'
    if (Test-Path -LiteralPath $ManagedRuntimeRoot -PathType Container) {
        Get-ChildItem -LiteralPath $ManagedRuntimeRoot -Directory -Filter 'node-v*-win-*' -ErrorAction SilentlyContinue |
            ForEach-Object {
                $PossibleExe = Join-Path $_.FullName 'node.exe'
                if (Test-Path -LiteralPath $PossibleExe -PathType Leaf) {
                    if (-not $Candidates.Contains($PossibleExe)) { [void]$Candidates.Add($PossibleExe) }
                }
            }
    }

    return $Candidates.ToArray()
}

function Get-SupportedNodeInfo {
    $Supported = New-Object 'System.Collections.Generic.List[object]'

    foreach ($Candidate in (Get-NodeCandidatePaths)) {
        if (-not (Test-Path -LiteralPath $Candidate -PathType Leaf)) { continue }

        try {
            # Execute the discovered absolute path. Do not ask PowerShell to resolve "node".
            $VersionText = (& $Candidate --version 2>$null | Select-Object -First 1).Trim()
            if ($VersionText -notmatch '^v\d+\.\d+\.\d+$') { continue }

            $Version = [version]$VersionText.TrimStart('v')
            if ($Version -ge [version]'22.13.0') {
                [void]$Supported.Add([pscustomobject]@{
                    Exe = [IO.Path]::GetFullPath($Candidate)
                    Home = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Candidate))
                    Version = $Version
                })
            }
        }
        catch { }
    }

    if ($Supported.Count -eq 0) { return $null }
    return ($Supported | Sort-Object Version -Descending | Select-Object -First 1)
}

function Install-Node22Runtime {
    $Architecture = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) { $Architecture = $env:PROCESSOR_ARCHITEW6432 }

    switch ($Architecture.ToUpperInvariant()) {
        'AMD64' { $NodeArchitecture = 'x64' }
        'ARM64' { $NodeArchitecture = 'arm64' }
        default { throw "Unsupported Windows CPU architecture: $Architecture." }
    }

    Write-Info 'No supported Node.js installation was found. Downloading the fallback runtime...'
    Write-Info 'Checking the official Node.js 22 release manifest...'
    $Releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30 -ErrorAction Stop
    $Release = $Releases |
        Where-Object { $_.version -match '^v22\.\d+\.\d+$' } |
        Sort-Object { [version]($_.version.TrimStart('v')) } -Descending |
        Select-Object -First 1
    if (-not $Release) { throw 'No stable Node.js 22.x release was found.' }

    $NodeVersion = $Release.version.TrimStart('v')
    $ArchiveName = "node-v$NodeVersion-win-$NodeArchitecture.zip"
    if ($Release.files -notcontains "win-$NodeArchitecture-zip") {
        throw "Node.js $NodeVersion has no Windows $NodeArchitecture archive."
    }

    $LocalAppData = [Environment]::GetFolderPath('LocalApplicationData')
    $RuntimeRoot = Join-Path $LocalAppData 'ContextVault\runtime'
    $NodeHome = Join-Path $RuntimeRoot "node-v$NodeVersion-win-$NodeArchitecture"
    $NodeExecutable = Join-Path $NodeHome 'node.exe'

    if (-not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf)) {
        New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
        $ArchivePath = Join-Path $env:TEMP $ArchiveName
        $ManifestPath = Join-Path $env:TEMP "node-v$NodeVersion-SHASUMS256.txt"

        Write-Info "Downloading Node.js $NodeVersion..."
        Invoke-DownloadWithRetry -Uri "https://nodejs.org/dist/v$NodeVersion/$ArchiveName" -OutFile $ArchivePath -Description "Downloading Node.js $NodeVersion"
        Invoke-DownloadWithRetry -Uri "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt" -OutFile $ManifestPath -Description "Downloading the official Node.js checksum manifest"

        $ManifestLine = Get-Content -LiteralPath $ManifestPath | Where-Object {
            $_ -match "\s+$([regex]::Escape($ArchiveName))$"
        } | Select-Object -First 1
        if (-not $ManifestLine) { throw "Official SHA-256 checksum not found for $ArchiveName." }

        $ExpectedHash = ($ManifestLine -split '\s+')[0].ToUpperInvariant()
        $ActualHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToUpperInvariant()
        if ($ActualHash -ne $ExpectedHash) {
            Remove-Item -LiteralPath $ArchivePath -Force -ErrorAction SilentlyContinue
            throw 'Node.js SHA-256 verification failed. The archive was rejected.'
        }

        Expand-Archive -LiteralPath $ArchivePath -DestinationPath $RuntimeRoot -Force
        Remove-Item -LiteralPath $ArchivePath -Force -ErrorAction SilentlyContinue
    }

    if (-not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf)) {
        throw "Node.js could not be verified at $NodeExecutable."
    }

    $VersionText = (& $NodeExecutable --version 2>$null | Select-Object -First 1).Trim()
    $Version = [version]$VersionText.TrimStart('v')
    if ($Version -lt [version]'22.13.0') { throw "Downloaded Node.js version $VersionText is too old." }

    return [pscustomobject]@{
        Exe = [IO.Path]::GetFullPath($NodeExecutable)
        Home = [IO.Path]::GetFullPath($NodeHome)
        Version = $Version
    }
}

function Get-OllamaExe {
    $LocalAppData = [Environment]::GetFolderPath('LocalApplicationData')
    $ProgramFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    $Candidates = @(
        (Join-Path $LocalAppData 'Programs\Ollama\ollama.exe'),
        (Join-Path $LocalAppData 'Ollama\ollama.exe'),
        (Join-Path $env:ProgramFiles 'Ollama\ollama.exe'),
        (Join-Path $ProgramFilesX86 'Ollama\ollama.exe')
    )

    foreach ($Candidate in $Candidates) {
        if ($Candidate -and (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
            return [IO.Path]::GetFullPath($Candidate)
        }
    }

    $OllamaCommand = Get-Command 'ollama.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($OllamaCommand -and $OllamaCommand.Source -and (Test-Path -LiteralPath $OllamaCommand.Source -PathType Leaf)) {
        return [IO.Path]::GetFullPath($OllamaCommand.Source)
    }

    return $null
}

function Get-WingetExe {
    $LocalAppData = [Environment]::GetFolderPath('LocalApplicationData')
    $SystemDirectory = [Environment]::GetFolderPath('System')
    $Candidates = @(
        (Join-Path $LocalAppData 'Microsoft\WindowsApps\winget.exe'),
        (Join-Path $SystemDirectory 'winget.exe')
    )

    $WingetCommand = Get-Command 'winget.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($WingetCommand -and $WingetCommand.Source) {
        $Candidates += [string]$WingetCommand.Source
    }

    foreach ($Candidate in ($Candidates | Select-Object -Unique)) {
        if ($Candidate -and (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
            return [IO.Path]::GetFullPath($Candidate)
        }
    }
    return $null
}

function Install-OllamaViaWinget {
    $WingetExe = Get-WingetExe
    if (-not $WingetExe) {
        Write-Host '[ContextVault] winget.exe was not found.' -ForegroundColor Yellow
        return $null
    }

    Write-Info 'Installing Ollama via winget...'
    try {
        & $WingetExe install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements
        $WingetExitCode = $LASTEXITCODE
    }
    catch {
        Write-Host "[ContextVault] winget could not complete the installation: $($_.Exception.Message)" -ForegroundColor Yellow
        return $null
    }

    if ($WingetExitCode -ne 0) {
        Write-Host "[ContextVault] winget installation failed with exit code $WingetExitCode." -ForegroundColor Yellow
        return $null
    }

    # Give Windows a short period to expose the installed executable after winget exits.
    for ($Attempt = 0; $Attempt -lt 15; $Attempt++) {
        $InstalledOllama = Get-OllamaExe
        if ($InstalledOllama) {
            Write-Info 'Ollama installed successfully.'
            return [string]$InstalledOllama
        }
        Start-Sleep -Seconds 2
    }

    Write-Host '[ContextVault] winget completed, but ollama.exe could not be located.' -ForegroundColor Yellow
    return $null
}

function Test-OllamaApi {
    try {
        $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop
        return $true
    }
    catch { return $false }
}

function Get-OllamaListenerPid {
    $NetstatExe = Join-Path $env:SystemRoot 'System32\netstat.exe'
    if (-not (Test-Path -LiteralPath $NetstatExe -PathType Leaf)) { return $null }

    $NetstatLines = & $NetstatExe -ano -p tcp 2>$null
    foreach ($Line in $NetstatLines) {
        if ($Line -match '^\s*TCP\s+\S+:11434\s+\S+\s+LISTENING\s+(\d+)\s*$') {
            return [int]$Matches[1]
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

        if ($ListenerPath -and ($ListenerPath -ieq $OllamaCliPath)) {
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
            throw "Port 11434 is already owned by PID $ListenerPid ($ListenerName), and it is not responding as this Ollama installation. The installer will not terminate an unrelated process."
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
        Write-Host "[ContextVault] Could not launch ollama.exe serve: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    if (Wait-OllamaApi -TimeoutSeconds 30) { return $true }

    $OllamaAppExe = Get-OllamaAppExe -OllamaCliPath $OllamaCliPath
    if ($OllamaAppExe) {
        Write-Info 'The CLI did not expose the API. Starting the Ollama tray application...'
        try {
            Start-Process -FilePath $OllamaAppExe | Out-Null
        }
        catch {
            Write-Host "[ContextVault] Could not launch the Ollama app: $($_.Exception.Message)" -ForegroundColor Yellow
        }

        if (Wait-OllamaApi -TimeoutSeconds 30) { return $true }
    }

    Write-Host '[ContextVault] Ollama is installed but the service did not start automatically. Please open the Ollama app from your Start Menu, then re-run this installer.' -ForegroundColor Yellow
    Write-Host "[ContextVault] Ollama startup logs: $StdoutLog and $StderrLog" -ForegroundColor Yellow
    return $false
}

function Invoke-HiddenAndWait {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )
    $Process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -Wait -PassThru
    if ($Process.ExitCode -ne 0) { throw "$FailureMessage (exit code $($Process.ExitCode))." }
}

try {
    Write-Step 'Checking the extracted ContextVault project.'
    $ProjectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'package.json') -PathType Leaf)) {
        throw 'Extract the complete ContextVault repository and run this installer from its root folder.'
    }

    Write-Step 'Checking for Node.js 22.13 or newer.'
    Write-Info 'Locating an existing supported Node.js installation...'
    $NodeInfo = Get-SupportedNodeInfo

    # Preserve a preinstalled Node.js 22.13+ / 23 / 24 runtime. Install a private fallback only when none exists.
    if (-not $NodeInfo) {
        $NodeInfo = Install-Node22Runtime
    }

    $NodeExe = $NodeInfo.Exe
    $NodeHome = $NodeInfo.Home
    $NodeVersionText = (& $NodeExe --version 2>$null | Select-Object -First 1).Trim()
    Write-Info "Using Node.js $NodeVersionText at $NodeExe"

    # Use npm.cmd next to the exact node.exe, via an absolute cmd.exe path.
    $NpmCommand = Join-Path $NodeHome 'npm.cmd'
    $NpmCli = Join-Path $NodeHome 'node_modules\npm\bin\npm-cli.js'
    if (-not (Test-Path -LiteralPath $NpmCommand -PathType Leaf)) {
        throw "npm.cmd was not found beside the selected node.exe: $NpmCommand"
    }
    if (-not (Test-Path -LiteralPath $NpmCli -PathType Leaf)) {
        throw "npm-cli.js was not found beside the selected node.exe: $NpmCli"
    }

    Write-Step 'Checking for Ollama.'
    Write-Info 'Checking for Ollama...'
    $OllamaExe = Get-OllamaExe

    if ($OllamaExe) {
        Write-Info 'Ollama found, skipping download.'
    }
    else {
        $OllamaExe = Install-OllamaViaWinget
    }

    if (-not $OllamaExe) {
        $OllamaDownloadUrl = 'https://ollama.com/download/windows'
        Write-Host "[ContextVault] Ollama installation failed. Please install manually from $OllamaDownloadUrl" -ForegroundColor Yellow
        try {
            Start-Process -FilePath $OllamaDownloadUrl | Out-Null
        }
        catch {
            Write-Host "[ContextVault] Could not open the browser automatically: $($_.Exception.Message)" -ForegroundColor Yellow
        }

        Write-Host '[ContextVault] Please install Ollama from the opened page, then run install-contextvault.ps1 again.' -ForegroundColor Yellow
        Write-Host '[ContextVault] The installer is stopping here; no Ollama download timeout will run in the background.' -ForegroundColor Yellow

        if ($script:TranscriptStarted) {
            Stop-Transcript | Out-Null
            $script:TranscriptStarted = $false
        }

        Read-Host 'Press Enter to close this installer window after reading the instructions'
        exit 0
    }

    $OllamaExe = [IO.Path]::GetFullPath([string]$OllamaExe)

    if (-not (Test-Path -LiteralPath $OllamaExe -PathType Leaf)) {
        throw "Ollama executable was not found at $OllamaExe."
    }

    # Prefer the standard per-user install path, then the discovered executable, then PATH.
    # Keep the value scalar so Start-Process never receives an Object[].
    $OllamaExePath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
    if (-not (Test-Path -LiteralPath $OllamaExePath -PathType Leaf)) {
        $OllamaExePath = [string]$OllamaExe
    }
    if (-not (Test-Path -LiteralPath $OllamaExePath -PathType Leaf)) {
        throw "Ollama executable was not found at the resolved absolute path: $OllamaExePath."
    }

    if ($EnableOllamaStartup) {
        $OllamaAppExe = Get-OllamaAppExe -OllamaCliPath $OllamaExePath
        if ($OllamaAppExe) {
            $RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
            New-Item -Path $RunKey -Force | Out-Null
            Set-ItemProperty -Path $RunKey -Name 'Ollama' -Value ('"' + $OllamaAppExe + '"')
            Write-Info 'Ollama app startup has been enabled for this Windows user.'
        }
        else {
            Write-Host '[ContextVault] Ollama app launcher was not found; automatic startup was not changed.' -ForegroundColor Yellow
        }
    }

    if (-not (Test-OllamaApi)) {
        if (-not (Start-OllamaService -OllamaCliPath $OllamaExePath)) {
            throw 'Ollama is installed but the service did not start automatically. Please open the Ollama app from your Start Menu, then re-run this installer.'
        }
    }

    Write-Step 'Checking and preparing the nomic-embed-text model.'
    Write-Info 'Checking the nomic-embed-text model...'
    $ModelList = & $OllamaExePath list 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Ollama could not list its installed models.' }
    if (($ModelList -join [Environment]::NewLine) -notmatch 'nomic-embed-text') {
        Write-Info 'Downloading nomic-embed-text...'
        & $OllamaExePath pull nomic-embed-text
        if ($LASTEXITCODE -ne 0) { throw 'The nomic-embed-text model download failed.' }
    }

    Write-Info 'Verifying the embedding model is available...'
    $VerifiedModelList = & $OllamaExePath list 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Ollama could not verify its installed models after the model check.' }
    if (($VerifiedModelList -join [Environment]::NewLine) -notmatch 'nomic-embed-text') {
        throw 'nomic-embed-text is still missing after the download attempt. ContextVault cannot index projects.'
    }

    Write-Step 'Installing ContextVault dependencies.'
    Write-Info 'npm output is shown in this window and saved in the installer log.'
    $env:PATH = "$NodeHome;$env:PATH"
    Push-Location $ProjectRoot
    try {
        & $NodeExe $NpmCli 'install' '--no-audit' '--no-fund'
        $NpmExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($NpmExitCode -ne 0) {
        throw "npm install failed with exit code $NpmExitCode. Review the npm output and installer log."
    }

    $TsxCli = Join-Path $ProjectRoot 'node_modules\tsx\dist\cli.mjs'
    if (-not (Test-Path -LiteralPath $TsxCli -PathType Leaf)) {
        throw "Dependencies were installed, but the tsx runtime was not found at $TsxCli."
    }
    Write-Info 'ContextVault dependencies were installed and verified.'

    Write-Step 'Creating the ContextVault desktop launcher.'

    # The VBS launcher calls node.exe and npm-cli.js by absolute path; PATH is not involved.
    $LocalAppData = [Environment]::GetFolderPath('LocalApplicationData')
    $LauncherDirectory = Join-Path $LocalAppData 'ContextVault'
    New-Item -ItemType Directory -Path $LauncherDirectory -Force | Out-Null
    $LauncherScript = Join-Path $LauncherDirectory 'ContextVault-Launcher.vbs'

    $LauncherContent = @'
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "__PROJECT_ROOT__"

Function HttpReady(url)
    On Error Resume Next
    Set request = CreateObject("WinHttp.WinHttpRequest.5.1")
    request.SetTimeouts 500, 500, 1000, 1000
    request.Open "GET", url, False
    request.Send
    HttpReady = (Err.Number = 0 And request.Status = 200)
    Err.Clear
    On Error GoTo 0
End Function

If Not HttpReady("http://127.0.0.1:11434/api/tags") Then
    shell.Environment("PROCESS")("OLLAMA_HOST") = "127.0.0.1:11434"
    shell.Run Chr(34) & "__OLLAMA_EXE__" & Chr(34) & " serve", 0, False
    For i = 1 To 30
        WScript.Sleep 1000
        If HttpReady("http://127.0.0.1:11434/api/tags") Then Exit For
    Next
End If

If Not HttpReady("http://127.0.0.1:11434/api/tags") Then
    If "__OLLAMA_APP_EXE__" <> "" Then
        shell.Run Chr(34) & "__OLLAMA_APP_EXE__" & Chr(34), 0, False
        For i = 1 To 30
            WScript.Sleep 1000
            If HttpReady("http://127.0.0.1:11434/api/tags") Then Exit For
        Next
    End If
End If

If Not HttpReady("http://127.0.0.1:11434/api/tags") Then
    MsgBox "Ollama is installed but its local API did not start. Open the Ollama app from the Start Menu, then launch ContextVault again.", vbExclamation, "ContextVault"
    WScript.Quit 1
End If

If Not HttpReady("http://localhost:3737/health") Then
    command = Chr(34) & "__NODE_EXE__" & Chr(34) & " " & Chr(34) & "__NPM_CLI__" & Chr(34) & " run dev"
    shell.Run command, 0, False
    For i = 1 To 45
        WScript.Sleep 1000
        If HttpReady("http://localhost:3737/health") Then Exit For
    Next
End If

If HttpReady("http://localhost:3737/health") Then
    shell.Run "http://localhost:3737", 1, False
Else
    MsgBox "ContextVault could not start. Restart Windows and try again.", vbExclamation, "ContextVault"
End If
'@

    $OllamaAppExe = Get-OllamaAppExe -OllamaCliPath $OllamaExePath
    if (-not $OllamaAppExe) { $OllamaAppExe = '' }
    $LauncherContent = $LauncherContent.Replace('__PROJECT_ROOT__', $ProjectRoot).Replace('__OLLAMA_EXE__', $OllamaExePath).Replace('__OLLAMA_APP_EXE__', $OllamaAppExe).Replace('__NODE_EXE__', $NodeExe).Replace('__NPM_CLI__', $NpmCli)
    Set-Content -LiteralPath $LauncherScript -Value $LauncherContent -Encoding ASCII

    $DesktopPath = [Environment]::GetFolderPath('Desktop')
    if (-not (Test-Path -LiteralPath $DesktopPath -PathType Container)) {
        New-Item -ItemType Directory -Path $DesktopPath -Force | Out-Null
    }

    $ShortcutPath = Join-Path $DesktopPath 'ContextVault.lnk'
    $WScriptExe = Join-Path $env:WINDIR 'System32\wscript.exe'
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $WScriptExe
    $Shortcut.Arguments = '"' + $LauncherScript + '"'
    $Shortcut.WorkingDirectory = $ProjectRoot
    $Shortcut.Description = 'Start ContextVault and open the local dashboard'
    $Shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll, 13"
    $Shortcut.Save()

    Write-Step 'Verifying setup and opening ContextVault.'
    Write-Info 'Node.js, Ollama, the embedding model, and project dependencies are ready.'
    Write-Info "Desktop shortcut created: $ShortcutPath"
    Write-Info "Installer log: $script:LogPath"

    if ($script:TranscriptStarted) {
        Stop-Transcript | Out-Null
        $script:TranscriptStarted = $false
    }

    Start-Process -FilePath $WScriptExe -ArgumentList ('"' + $LauncherScript + '"')
}
catch {
    Write-Host "[ContextVault] Installation failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($script:LogPath) {
        Write-Host "[ContextVault] Review the detailed log: $script:LogPath" -ForegroundColor Yellow
    }
    Write-Host '[ContextVault] No project source files were modified by the installer.' -ForegroundColor Yellow

    if ($script:TranscriptStarted) {
        Stop-Transcript | Out-Null
        $script:TranscriptStarted = $false
    }

    Read-Host 'Press Enter to close'
    exit 1
}
