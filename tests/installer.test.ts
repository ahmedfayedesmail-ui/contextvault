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

  it('uses absolute Ollama executable paths and installs Ollama silently', () => {
    const installer = readFileSync(path.join(projectRoot, 'install-contextvault.ps1'), 'utf8');
    expect(installer).toContain('winget.exe');
    expect(installer).toContain('install --id Ollama.Ollama -e --silent');
    expect(installer).toContain('Get-OllamaExe');
    expect(installer).toContain('$OllamaExeResults = @(Get-OllamaExe | Select-Object -First 1)');
    expect(installer).toContain('$OllamaExe = [string]$OllamaExeResults[0]');
    expect(installer).toContain('$OllamaExePath = "$env:LOCALAPPDATA\\Programs\\Ollama\\ollama.exe"');
    expect(installer).toContain("if (-not (Test-Path -LiteralPath $OllamaExePath -PathType Leaf)) {");
    expect(installer).toContain("$OllamaExePath = 'ollama'");
    expect(installer).toContain('Start-Process -FilePath $OllamaExePath -ArgumentList "serve" -WindowStyle Hidden');
    expect(installer).toContain('Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue');
    expect(installer).toContain('$ModelList = & $OllamaExePath list 2>&1');
    expect(installer).toContain('& $OllamaExePath pull nomic-embed-text');
    expect(installer).toContain("Replace('__OLLAMA_EXE__', $OllamaExePath)");
    expect(installer).toContain('nomic-embed-text');
    expect(installer).toContain('Get-AuthenticodeSignature');
  });

  it('matches the supported Node.js engine range', () => {
    const packageJson = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
      engines: { node: string };
    };
    expect(packageJson.engines.node).toBe('>=22.13.0');
  });

  it('keeps the Windows launcher simple and opens the local browser', () => {
    const launcher = readFileSync(path.join(projectRoot, 'start-contextvault.bat'), 'utf8');
    expect(launcher).toContain('npm run dev');
    expect(launcher).toContain('timeout /t 3');
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
