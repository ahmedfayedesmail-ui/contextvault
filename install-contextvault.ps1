#requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Info { param([string]$Message) Write-Host "[ContextVault] $Message" -ForegroundColor Green }

function Refresh-CurrentPath {
    $MachinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (@($MachinePath, $UserPath, $env:Path) -join ';')
}

function Get-CompatibleNodeCommand {
    $Command = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
    if (-not $Command) { return $null }
    try {
        $VersionText = (& $Command.Source --version 2>$null).Trim()
        $Version = [version]$VersionText.TrimStart('v')
        if ($Version.Major -eq 22 -and $Version -ge [version]'22.13.0') { return $Command }
    }
    catch { return $null }
    return $null
}

function Install-Node22Runtime {
    $Architecture = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) { $Architecture = $env:PROCESSOR_ARCHITEW6432 }
    switch ($Architecture.ToUpperInvariant()) {
        'AMD64' { $NodeArchitecture = 'x64' }
        'ARM64' { $NodeArchitecture = 'arm64' }
        default { throw "Unsupported CPU architecture: $Architecture." }
    }

    Write-Info 'Checking the latest supported Node.js 22 release...'
    $Releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
    $Release = $Releases |
        Where-Object { $_.version -match '^v22\.\d+\.\d+$' } |
        Sort-Object { [version]($_.version.TrimStart('v')) } -Descending |
        Select-Object -First 1
    if (-not $Release) { throw 'Could not find a stable Node.js 22 release.' }

    $NodeVersion = $Release.version.TrimStart('v')
    $ArchiveName = "node-v$NodeVersion-win-$NodeArchitecture.zip"
    if ($Release.files -notcontains "win-$NodeArchitecture-zip") {
        throw "Node.js $NodeVersion has no Windows $NodeArchitecture archive."
    }

    $RuntimeRoot = Join-Path $env:LOCALAPPDATA 'ContextVault\runtime'
    $NodeHome = Join-Path $RuntimeRoot "node-v$NodeVersion-win-$NodeArchitecture"
    $NodeExecutable = Join-Path $NodeHome 'node.exe'

    if (-not (Test-Path -LiteralPath $NodeExecutable)) {
        New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
        $ArchivePath = Join-Path $env:TEMP $ArchiveName
        $ManifestPath = Join-Path $env:TEMP "node-v$NodeVersion-SHASUMS256.txt"
        Write-Info "Downloading Node.js $NodeVersion..."
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/$ArchiveName" -OutFile $ArchivePath -UseBasicParsing
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt" -OutFile $ManifestPath -UseBasicParsing

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

    if (-not (Test-Path -LiteralPath $NodeExecutable)) { throw 'Node.js installation could not be verified.' }

    $UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $PathEntries = @($UserPath -split ';' | Where-Object { $_ })
    if (-not ($PathEntries | Where-Object { $_.TrimEnd('\') -ieq $NodeHome.TrimEnd('\') })) {
        [Environment]::SetEnvironmentVariable('Path', (@($PathEntries) + $NodeHome) -join ';', 'User')
    }

    # Refresh PATH immediately in this same PowerShell process.
    Refresh-CurrentPath
    if ($env:Path -notlike "*$NodeHome*") { $env:Path = "$NodeHome;$env:Path" }

    Get-ChildItem -LiteralPath $RuntimeRoot -Directory -Filter 'node-v22*-win-*' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -ne $NodeHome } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-Info "Node.js $NodeVersion is installed."
}

function Get-OllamaCommand {
    Refresh-CurrentPath
    $Command = Get-Command ollama -CommandType Application -ErrorAction SilentlyContinue
    if ($Command) { return $Command }
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
    catch { return $false }
}

function Start-HiddenProcessAndWait {
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
    $ProjectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'package.json'))) {
        throw 'Run this installer from the extracted ContextVault repository folder.'
    }

    Write-Info 'Preparing Node.js...'
    if (-not (Get-CompatibleNodeCommand)) { Install-Node22Runtime }
    Refresh-CurrentPath
    $NodeCommand = Get-CompatibleNodeCommand
    if (-not $NodeCommand) { throw 'Node.js 22.13 or newer could not be located after installation.' }

    $NodeDirectory = Split-Path -Parent $NodeCommand.Source
    $NpmCommand = Join-Path $NodeDirectory 'npm.cmd'
    if (-not (Test-Path -LiteralPath $NpmCommand)) { throw 'npm.cmd was not found beside Node.js.' }

    # Download and verify the official Ollama Windows installer.
    $OllamaCommand = Get-OllamaCommand
    if (-not $OllamaCommand) {
        $InstallerPath = Join-Path $env:TEMP 'OllamaSetup.exe'
        Write-Info 'Downloading the official Ollama installer...'
        Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile $InstallerPath -UseBasicParsing

        $Signature = Get-AuthenticodeSignature -FilePath $InstallerPath
        if ($Signature.Status -ne 'Valid' -or $Signature.SignerCertificate.Subject -notmatch '(^|, )O=Ollama Inc\.(,|$)') {
            Remove-Item -LiteralPath $InstallerPath -Force -ErrorAction SilentlyContinue
            throw 'Ollama installer signature could not be verified. The installer was rejected.'
        }

        Write-Info 'Installing Ollama silently...'
        # Use the silent Inno Setup flags from the official Ollama Windows installation script.
        $OllamaSetup = Start-Process -FilePath $InstallerPath -ArgumentList '/VERYSILENT /NORESTART /SUPPRESSMSGBOXES' -Wait -PassThru
        if ($OllamaSetup.ExitCode -ne 0) { throw "Ollama setup failed (exit code $($OllamaSetup.ExitCode))." }
        Remove-Item -LiteralPath $InstallerPath -Force -ErrorAction SilentlyContinue
    }

    Refresh-CurrentPath
    $OllamaCommand = Get-OllamaCommand
    if (-not $OllamaCommand) { throw 'Ollama installation completed but the CLI could not be located.' }
    $OllamaDirectory = Split-Path -Parent $OllamaCommand.Source

    # The Windows app normally starts its own service. Start "ollama serve" only if its API is down.
    if (-not (Test-OllamaApi)) {
        Write-Info 'Starting the Ollama service...'
        Start-Process -FilePath $OllamaCommand.Source -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
        Start-Sleep -Seconds 3
        $OllamaReady = $false
        for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
            if (Test-OllamaApi) { $OllamaReady = $true; break }
            Start-Sleep -Seconds 1
        }
        if (-not $OllamaReady) { throw 'Ollama did not become ready on localhost:11434.' }
    }

    Write-Info 'Downloading the nomic-embed-text model...'
    Start-HiddenProcessAndWait -FilePath $OllamaCommand.Source -Arguments 'pull nomic-embed-text' -WorkingDirectory $ProjectRoot -FailureMessage 'Could not download nomic-embed-text'

    # Install npm dependencies in a hidden process and wait for completion.
    Write-Info 'Installing ContextVault dependencies...'
    $NpmArguments = '/d /c ""' + $NpmCommand + '" install"'
    Start-HiddenProcessAndWait -FilePath $env:ComSpec -Arguments $NpmArguments -WorkingDirectory $ProjectRoot -FailureMessage 'npm install failed'

    # Create a hidden desktop launcher that starts ContextVault and opens the browser.
    $DesktopPath = [Environment]::GetFolderPath('Desktop')
    if (-not (Test-Path -LiteralPath $DesktopPath)) { New-Item -ItemType Directory -Path $DesktopPath -Force | Out-Null }

    $LauncherScript = Join-Path $ProjectRoot 'ContextVault-Launcher.vbs'
    $LauncherContent = @'
Set shell = CreateObject("WScript.Shell")
shell.Environment("PROCESS")("PATH") = "__NODE_DIR__;__OLLAMA_DIR__;" & shell.Environment("PROCESS")("PATH")
Set http = CreateObject("MSXML2.XMLHTTP")
alreadyRunning = False
On Error Resume Next
http.Open "GET", "http://localhost:3737/health", False
http.Send
If Err.Number = 0 Then
    If http.Status = 200 Then alreadyRunning = True
End If
Err.Clear
On Error GoTo 0
If Not alreadyRunning Then
    command = "cmd.exe /d /c cd /d " & Chr(34) & "__PROJECT_ROOT__" & Chr(34) & " && npm run dev"
    shell.Run command, 0, False
End If
WScript.Sleep 3000
shell.Run "http://localhost:3737", 1, False
'@
    $LauncherContent = $LauncherContent.Replace('__NODE_DIR__', $NodeDirectory).Replace('__OLLAMA_DIR__', $OllamaDirectory).Replace('__PROJECT_ROOT__', $ProjectRoot)
    Set-Content -LiteralPath $LauncherScript -Value $LauncherContent -Encoding ASCII

    $WScript = Join-Path $env:WINDIR 'System32\wscript.exe'
    $ShortcutPath = Join-Path $DesktopPath 'ContextVault.lnk'
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $WScript
    $Shortcut.Arguments = '"' + $LauncherScript + '"'
    $Shortcut.WorkingDirectory = $ProjectRoot
    $Shortcut.Description = 'Start ContextVault and open the local dashboard'
    $Shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll, 13"
    $Shortcut.Save()

    Write-Info 'ContextVault is installed. Starting it and opening the browser...'
    Start-Process -FilePath $WScript -ArgumentList ('"' + $LauncherScript + '"')
    Write-Info "Desktop shortcut created: $ShortcutPath"
}
catch {
    Write-Host "[ContextVault] $($_.Exception.Message)" -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
