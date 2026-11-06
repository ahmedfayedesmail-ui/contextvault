import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  describe,
  expect,
  it
} from 'vitest';

const projectRoot = path.resolve(__dirname, '..');

describe('cross-platform distribution files', () => {
  it.each([
    'install-contextvault.ps1',
    'start-contextvault.bat',
    'start-contextvault.ps1',
    'start-contextvault.sh',
    'install-mac.command',
    'install-linux.sh',
    'Dockerfile',
    'docker-compose.yml',
    'docker-entrypoint.sh',
    '.dockerignore'
  ])('includes %s in the repository', (fileName) => {
    expect(existsSync(path.join(projectRoot, fileName))).toBe(true);
  });

  it('discovers supported Node.js versions by absolute path without PATH lookup', () => {
    const installer = readFileSync(path.join(projectRoot, 'install-contextvault.ps1'), 'utf8');
    expect(installer).toContain('function Get-NodeCandidatePaths');
    expect(installer).toContain('function Get-SupportedNodeInfo');
    expect(installer).toContain('& $Candidate --version');
    expect(installer).toContain("if ($Version -ge [version]'22.13.0')");
    expect(installer).not.toContain('Get-Command node');
    expect(installer).not.toContain('$env:Path');
    expect(installer).toContain("Join-Path $NodeHome 'npm.cmd'");
  });

  it('installs and starts Ollama through supported absolute-path and winget flows', () => {
    const installer = readFileSync(path.join(projectRoot, 'install-contextvault.ps1'), 'utf8');

    expect(installer).toContain('function Get-OllamaExe');
    expect(installer).toContain('function Get-WingetExe');
    expect(installer).toContain('install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements');
    expect(installer).toContain('function Get-OllamaListenerPid');
    expect(installer).toContain("http://127.0.0.1:11434/api/tags");
    expect(installer).toContain("Start-Process -FilePath $OllamaCliPath -ArgumentList 'serve'");
    expect(installer).toContain('Wait-OllamaApi -TimeoutSeconds 30');
    expect(installer).toContain('Please install Ollama from the opened page, then run install-contextvault.ps1 again.');
    expect(installer).toContain('Please open the Ollama app from your Start Menu');
    expect(installer).toContain('$EnableOllamaStartup');
    expect(installer).toContain('CurrentVersion\\Run');
    expect(installer).toContain('$ModelList = & $OllamaExePath list 2>&1');
    expect(installer).toContain('& $OllamaExePath pull nomic-embed-text');
    expect(installer).toContain('$VerifiedModelList = & $OllamaExePath list 2>&1');
    expect(installer).toContain("Replace('__OLLAMA_EXE__', $OllamaExePath)");
    // Ollama is installed through winget; if winget is unavailable, the
    // installer opens Ollama's official Windows download page for manual setup.
    expect(installer).toContain("$OllamaDownloadUrl = 'https://ollama.com/download/windows'");
    expect(installer).toContain('Start-Process -FilePath $OllamaDownloadUrl');
  });

  it('matches the supported Node.js engine range', () => {
    const packageJson = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
      engines: { node: string };
    };
    expect(packageJson.engines.node).toBe('>=22.13.0');
  });

  it('routes the Windows batch launcher through the hardened PowerShell launcher', () => {
    const launcher = readFileSync(path.join(projectRoot, 'start-contextvault.bat'), 'utf8');

    expect(launcher).toContain('set "OLLAMA_HOST=127.0.0.1:11434"');
    expect(launcher).toContain('start-contextvault.ps1');
    expect(launcher).toContain('powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File');
    expect(launcher).toContain('Ollama and preparing the local dashboard');
    expect(launcher).toContain('if errorlevel 1');
  });

  it('starts Ollama safely before opening the ContextVault dashboard', () => {
    const launcher = readFileSync(path.join(projectRoot, 'start-contextvault.ps1'), 'utf8');

    expect(launcher).toContain("http://127.0.0.1:11434/api/tags");
    expect(launcher).toContain('function Get-OllamaListenerPid');
    expect(launcher).toContain('function Start-OllamaService');
    expect(launcher).toContain("Start-Process -FilePath $OllamaCliPath -ArgumentList 'serve'");
    expect(launcher).toContain('Wait-OllamaApi -TimeoutSeconds 30');
    expect(launcher).toContain('will not terminate an unrelated process');
    expect(launcher).toContain("pull 'nomic-embed-text'");
    expect(launcher).toContain('npm run dev');
    expect(launcher).toContain('http://localhost:3737');
  });

  it('prepares macOS and Linux dependencies', () => {
    const macInstaller = readFileSync(path.join(projectRoot, 'install-mac.command'), 'utf8');
    const linuxInstaller = readFileSync(path.join(projectRoot, 'install-linux.sh'), 'utf8');
    expect(macInstaller).toContain('brew install node@22 ollama');
    expect(linuxInstaller).toContain('apt-get');
    expect(linuxInstaller).toContain('dnf');
    expect(linuxInstaller).toContain('https://ollama.com/install.sh');
  });

  it('provides Docker with the local Ollama runtime and persistent volumes', () => {
    const dockerfile = readFileSync(path.join(projectRoot, 'Dockerfile'), 'utf8');
    const compose = readFileSync(path.join(projectRoot, 'docker-compose.yml'), 'utf8');
    const entrypoint = readFileSync(path.join(projectRoot, 'docker-entrypoint.sh'), 'utf8');
    const readme = readFileSync(path.join(projectRoot, 'README.md'), 'utf8');

    expect(dockerfile).toContain('FROM node:22-slim');
    expect(dockerfile).toContain('https://ollama.com/install.sh');
    expect(compose).toContain('3737:3737');
    expect(compose).toContain('contextvault-data');
    expect(compose).toContain('ollama-data');
    expect(entrypoint).toContain('ollama pull nomic-embed-text');
    expect(readme).toContain('docker compose up --build');
  });
});
