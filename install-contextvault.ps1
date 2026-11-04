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

    $LocalAppData = [Environment]::GetFolderPath('LocalApplicationData')
    $RuntimeRoot = Join-Path $LocalAppData 'ContextVault\runtime'
    $NodeHome = Join-Path $RuntimeRoot "node-v$NodeVersion-win-$NodeArchitecture"
    $NodeExecutable = Join-Path $NodeHome 'node.exe'

    if (-not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf)) {
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
    return $null
}

function Get-WingetExe {
    $LocalAppData = [Environment]::GetFolderPath('LocalApplicationData')
    $SystemDirectory = [Environment]::GetFolderPath('System')
    $Candidates = @(
        (Join-Path $LocalAppData 'Microsoft\WindowsApps\winget.exe'),
        (Join-Path $SystemDirectory 'winget.exe')
    )

    foreach ($Candidate in $Candidates) {
        if ($Candidate -and (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
            return [IO.Path]::GetFullPath($Candidate)
        }
    }
    return $null
}

function Install-Ollama {
    $WingetExe = Get-WingetExe
    if ($WingetExe) {
        Write-Info 'Installing Ollama with Windows Package Manager...'
        & $WingetExe install --id Ollama.Ollama -e --silent --accept-package-agreements --accept-source-agreements
        $WingetExitCode = $LASTEXITCODE

        $InstalledOllama = Get-OllamaExe
        if ($InstalledOllama) { return $InstalledOllama }

        if ($WingetExitCode -ne 0) {
            Write-Host "winget returned exit code $WingetExitCode. Trying the official signed installer..." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host 'winget.exe was not found. Using the official signed Ollama installer...' -ForegroundColor Yellow
    }

    $InstallerPath = Join-Path $env:TEMP 'OllamaSetup.exe'
    Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile $InstallerPath -UseBasicParsing

    $Signature = Get-AuthenticodeSignature -FilePath $InstallerPath
    if ($Signature.Status -ne 'Valid' -or $Signature.SignerCertificate.Subject -notmatch 'Ollama') {
        Remove-Item -LiteralPath $InstallerPath -Force -ErrorAction SilentlyContinue
        throw 'Ollama installer signature is invalid. The downloaded file was rejected.'
    }

    $Setup = Start-Process -FilePath $InstallerPath -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -Wait -PassThru
    Remove-Item -LiteralPath $InstallerPath -Force -ErrorAction SilentlyContinue
    if ($Setup.ExitCode -ne 0) { throw "Ollama setup failed with exit code $($Setup.ExitCode)." }

    $InstalledOllama = Get-OllamaExe
    if (-not $InstalledOllama) { throw 'Ollama setup finished, but ollama.exe could not be found.' }
    return $InstalledOllama
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
    $ProjectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'package.json') -PathType Leaf)) {
        throw 'Extract the complete ContextVault repository and run this installer from its root folder.'
    }

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

    Write-Info 'Locating Ollama...'
    $OllamaExe = Get-OllamaExe
    if (-not $OllamaExe) { $OllamaExe = Install-Ollama }
    if (-not (Test-Path -LiteralPath $OllamaExe -PathType Leaf)) {
        throw "Ollama executable was not found at $OllamaExe."
    }

    if (-not (Test-OllamaApi)) {
        Write-Info 'Starting Ollama in the background...'
        Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
        Start-Sleep -Seconds 3

        $OllamaReady = $false
        for ($Attempt = 0; $Attempt -lt 90; $Attempt++) {
            if (Test-OllamaApi) { $OllamaReady = $true; break }
            Start-Sleep -Seconds 1
        }
        if (-not $OllamaReady) { throw 'Ollama did not start on localhost:11434.' }
    }

    Write-Info 'Checking the nomic-embed-text model...'
    $ModelList = & $OllamaExe list 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Ollama could not list its installed models.' }
    if (($ModelList -join [Environment]::NewLine) -notmatch 'nomic-embed-text') {
        Write-Info 'Downloading nomic-embed-text...'
        & $OllamaExe pull nomic-embed-text
        if ($LASTEXITCODE -ne 0) { throw 'The nomic-embed-text model download failed.' }
    }

    Write-Info 'Installing ContextVault dependencies in a hidden process...'
    $SystemCmd = Join-Path ([Environment]::GetFolderPath('System')) 'cmd.exe'
    $NpmArguments = '/d /c ""' + $NpmCommand + '" install"'
    Invoke-HiddenAndWait -FilePath $SystemCmd -Arguments $NpmArguments -WorkingDirectory $ProjectRoot -FailureMessage 'npm install failed'

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

    $LauncherContent = $LauncherContent.Replace('__PROJECT_ROOT__', $ProjectRoot).Replace('__OLLAMA_EXE__', $OllamaExe).Replace('__NODE_EXE__', $NodeExe).Replace('__NPM_CLI__', $NpmCli)
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

    Write-Info 'Installation completed. Starting ContextVault and opening the browser...'
    Start-Process -FilePath $WScriptExe -ArgumentList ('"' + $LauncherScript + '"')
    Write-Info "Desktop shortcut created: $ShortcutPath"
}
catch {
    Write-Host "[ContextVault] $($_.Exception.Message)" -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
