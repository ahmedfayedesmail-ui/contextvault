#requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Info {
    param([string]$Message)
    Write-Host "[ContextVault] $Message" -ForegroundColor Green
}

function Refresh-CurrentPath {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
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
        default { throw "Unsupported Windows CPU architecture: $Architecture." }
    }

    Write-Info 'Resolving the latest stable Node.js 22 release...'
    $Releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
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
            throw 'Node.js SHA-256 verification failed. The downloaded archive was rejected.'
        }

        Expand-Archive -LiteralPath $ArchivePath -DestinationPath $RuntimeRoot -Force
        Remove-Item -LiteralPath $ArchivePath -Force -ErrorAction SilentlyContinue
    }

    if (-not (Test-Path -LiteralPath $NodeExecutable)) { throw "Node.js could not be verified at $NodeExecutable." }

    $UserPath = [System.Environment]::GetEnvironmentVariable("Path","User")
    $PathEntries = @($UserPath -split ';' | Where-Object { $_ })
    if (-not ($PathEntries | Where-Object { $_.TrimEnd('\') -ieq $NodeHome.TrimEnd('\') })) {
        [System.Environment]::SetEnvironmentVariable("Path", (@($PathEntries) + $NodeHome) -join ';', "User")
    }

    # Required: rebuild PATH from persisted Machine and User environment values in this process.
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    Get-ChildItem -LiteralPath $RuntimeRoot -Directory -Filter 'node-v22*-win-*' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -ne $NodeHome } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    Write-Info "Node.js $NodeVersion is installed and available in this session."
}

function Get-OllamaCommand {
    Refresh-CurrentPath
    $Command = Get-Command ollama.exe -CommandType Application -ErrorAction SilentlyContinue
    if ($Command) { return $Command }

    $Candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
        (Join-Path $env:LOCALAPPDATA 'Ollama\ollama.exe'),
        (Join-Path $env:ProgramFiles 'Ollama\ollama.exe')
    )
    foreach ($Candidate in $Candidates) {
        if ($Candidate -and (Test-Path -LiteralPath $Candidate)) {
            $Directory = Split-Path -Parent $Candidate
            $env:Path = "$Directory;$env:Path"
            return Get-Command $Candidate -CommandType Application -ErrorAction SilentlyContinue
        }
    }
    return $null
}

function Install-Ollama {
    $Winget = Get-Command winget.exe -CommandType Application -ErrorAction SilentlyContinue

    if ($Winget) {
        Write-Info 'Installing Ollama with Windows Package Manager...'
        & $Winget.Source install --id Ollama.Ollama -e --silent --accept-package-agreements --accept-source-agreements
        $WingetExitCode = $LASTEXITCODE
        if ($WingetExitCode -ne 0) {
            Write-Host "winget returned exit code $WingetExitCode. Trying the signed official installer..." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host 'winget is not available. Using the signed official Ollama installer as a fallback.' -ForegroundColor Yellow
    }

    Refresh-CurrentPath
    if (Get-OllamaCommand) { return }

    $InstallerPath = Join-Path $env:TEMP 'OllamaSetup.exe'
    Write-Info 'Downloading the official Ollama Windows installer...'
    Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile $InstallerPath -UseBasicParsing

    $Signature = Get-AuthenticodeSignature -FilePath $InstallerPath
    if ($Signature.Status -ne 'Valid' -or $Signature.SignerCertificate.Subject -notmatch 'Ollama') {
        Remove-Item -LiteralPath $InstallerPath -Force -ErrorAction SilentlyContinue
        throw 'The downloaded Ollama installer signature is invalid. The file was rejected.'
    }

    $Setup = Start-Process -FilePath $InstallerPath -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -Wait -PassThru
    Remove-Item -LiteralPath $InstallerPath -Force -ErrorAction SilentlyContinue
    if ($Setup.ExitCode -ne 0) { throw "Ollama setup failed with exit code $($Setup.ExitCode)." }

    Refresh-CurrentPath
    if (-not (Get-OllamaCommand)) { throw 'Ollama setup finished, but its CLI could not be located.' }
}

function Test-OllamaApi {
    try {
        $null = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop
        return $true
    }
    catch { return $false }
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
    $ProjectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'package.json'))) {
        throw 'Extract the complete ContextVault repository and run this installer from its root folder.'
    }

    Write-Info 'Preparing Node.js...'
    if (-not (Get-CompatibleNodeCommand)) { Install-Node22Runtime }

    # Rebuild PATH even when Node.js was installed before this installer was started.
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $NodeCommand = Get-CompatibleNodeCommand
    if (-not $NodeCommand) {
        $PortableRoot = Join-Path $env:LOCALAPPDATA 'ContextVault\runtime'
        $PortableNode = Get-ChildItem -LiteralPath $PortableRoot -Directory -Filter 'node-v22*-win-*' -ErrorAction SilentlyContinue |
            Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'node.exe') } |
            Sort-Object Name -Descending |
            Select-Object -First 1
        if ($PortableNode) {
            $env:Path = "$($PortableNode.FullName);$env:Path"
            $NodeCommand = Get-CompatibleNodeCommand
        }
    }
    if (-not $NodeCommand) { throw 'Node.js 22.13 or newer could not be found after installation.' }

    $NodeDirectory = Split-Path -Parent $NodeCommand.Source
    $NpmCommand = Join-Path $NodeDirectory 'npm.cmd'
    if (-not (Test-Path -LiteralPath $NpmCommand)) { throw 'npm.cmd was not found next to Node.js.' }

    Write-Info 'Preparing Ollama...'
    if (-not (Get-OllamaCommand)) { Install-Ollama }

    $OllamaCommand = Get-OllamaCommand
    if (-not $OllamaCommand) { throw 'Ollama could not be located after installation.' }
    $OllamaDirectory = Split-Path -Parent $OllamaCommand.Source

    if (-not (Test-OllamaApi)) {
        Write-Info 'Starting Ollama in the background...'
        Start-Process -FilePath $OllamaCommand.Source -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
        Start-Sleep -Seconds 3

        $OllamaReady = $false
        for ($Attempt = 0; $Attempt -lt 90; $Attempt++) {
            if (Test-OllamaApi) { $OllamaReady = $true; break }
            Start-Sleep -Seconds 1
        }
        if (-not $OllamaReady) { throw 'Ollama did not start on localhost:11434.' }
    }

    Write-Info 'Checking the nomic-embed-text model...'
    $ModelList = & $OllamaCommand.Source list 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Ollama could not list its installed models.' }
    if (($ModelList -join [Environment]::NewLine) -notmatch 'nomic-embed-text') {
        Write-Info 'Downloading nomic-embed-text...'
        & $OllamaCommand.Source pull nomic-embed-text
        if ($LASTEXITCODE -ne 0) { throw 'The nomic-embed-text model download failed.' }
    }

    Write-Info 'Installing ContextVault npm dependencies in the background...'
    Invoke-HiddenAndWait -FilePath $env:ComSpec -Arguments '/d /c npm install' -WorkingDirectory $ProjectRoot -FailureMessage 'npm install failed'

    $LauncherDirectory = Join-Path $env:LOCALAPPDATA 'ContextVault'
    New-Item -ItemType Directory -Path $LauncherDirectory -Force | Out-Null
    $LauncherScript = Join-Path $LauncherDirectory 'ContextVault-Launcher.vbs'

    $LauncherContent = @'
Set shell = CreateObject("WScript.Shell")
shell.Environment("PROCESS")("PATH") = "__NODE_DIR__;__OLLAMA_DIR__;" & shell.Environment("PROCESS")("PATH")
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

If Not HttpReady("http://localhost:11434/api/tags") Then
    shell.Run Chr(34) & "__OLLAMA_EXE__" & Chr(34) & " serve", 0, False
    For i = 1 To 60
        WScript.Sleep 1000
        If HttpReady("http://localhost:11434/api/tags") Then Exit For
    Next
End If

If Not HttpReady("http://localhost:11434/api/tags") Then
    MsgBox "Ollama could not start. Please restart Windows and try again.", vbExclamation, "ContextVault"
    WScript.Quit 1
End If

If Not HttpReady("http://localhost:3737/health") Then
    shell.Run "cmd.exe /d /c npm run dev", 0, False
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

    $LauncherContent = $LauncherContent.Replace('__NODE_DIR__', $NodeDirectory).Replace('__OLLAMA_DIR__', $OllamaDirectory).Replace('__OLLAMA_EXE__', $OllamaCommand.Source).Replace('__PROJECT_ROOT__', $ProjectRoot)
    Set-Content -LiteralPath $LauncherScript -Value $LauncherContent -Encoding ASCII

    $DesktopPath = [Environment]::GetFolderPath('Desktop')
    if (-not (Test-Path -LiteralPath $DesktopPath)) {
        New-Item -ItemType Directory -Path $DesktopPath -Force | Out-Null
    }

    $ShortcutPath = Join-Path $DesktopPath 'ContextVault.lnk'
    $WScript = Join-Path $env:WINDIR 'System32\wscript.exe'
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $WScript
    $Shortcut.Arguments = '"' + $LauncherScript + '"'
    $Shortcut.WorkingDirectory = $ProjectRoot
    $Shortcut.Description = 'Start ContextVault and open the local dashboard'
    $Shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll, 13"
    $Shortcut.Save()

    Write-Info 'Installation completed. Starting ContextVault and opening the browser...'
    Start-Process -FilePath $WScript -ArgumentList ('"' + $LauncherScript + '"')
    Write-Info "Desktop shortcut created: $ShortcutPath"
}
catch {
    Write-Host "[ContextVault] $($_.Exception.Message)" -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
