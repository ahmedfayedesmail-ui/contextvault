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

  it('refreshes the current Windows process PATH and installs Ollama', () => {
    const installer = readFileSync(path.join(projectRoot, 'install-contextvault.ps1'), 'utf8');
    expect(installer).toContain('$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")');
    expect(installer).toContain('winget.exe');
    expect(installer).toContain('install --id Ollama.Ollama -e --silent');
    expect(installer).toContain('nomic-embed-text');
    expect(installer).toContain('Get-AuthenticodeSignature');
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
