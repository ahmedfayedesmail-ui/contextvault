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

  it('installs Ollama and the embedding model on Windows', () => {
    const installer = readFileSync(path.join(projectRoot, 'install-contextvault.ps1'), 'utf8');
    expect(installer).toContain('https://ollama.com/download/OllamaSetup.exe');
    expect(installer).toContain('nomic-embed-text');
    expect(installer).toContain('Get-AuthenticodeSignature');
    expect(installer).toContain('/VERYSILENT /NORESTART /SUPPRESSMSGBOXES');
  });

  it('prepares macOS and Linux dependencies automatically', () => {
    const macInstaller = readFileSync(path.join(projectRoot, 'install-mac.command'), 'utf8');
    const linuxInstaller = readFileSync(path.join(projectRoot, 'install-linux.sh'), 'utf8');
    expect(macInstaller).toContain('brew install node@22');
    expect(macInstaller).toContain('ollama-app');
    expect(linuxInstaller).toContain('apt-get');
    expect(linuxInstaller).toContain('dnf');
    expect(linuxInstaller).toContain('https://ollama.com/install.sh');
  });

  it('provides a Docker image and a persistent Compose setup', () => {
    const dockerfile = readFileSync(path.join(projectRoot, 'Dockerfile'), 'utf8');
    const compose = readFileSync(path.join(projectRoot, 'docker-compose.yml'), 'utf8');
    const entrypoint = readFileSync(path.join(projectRoot, 'docker-entrypoint.sh'), 'utf8');

    expect(dockerfile).toContain('FROM node:22-slim');
    expect(dockerfile).toContain('https://ollama.com/install.sh');
    expect(compose).toContain('3737:3737');
    expect(compose).toContain('contextvault-data');
    expect(compose).toContain('ollama-data');
    expect(entrypoint).toContain('ollama pull nomic-embed-text');
  });
});
