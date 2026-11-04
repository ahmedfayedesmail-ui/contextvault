import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  describe,
  expect,
  it
} from 'vitest';

const projectRoot = path.resolve(__dirname, '..');

describe('Windows distribution files', () => {
  it.each([
    'start-contextvault.bat',
    'start-contextvault.ps1',
    'install-contextvault.ps1'
  ])('includes %s in the repository root', (fileName) => {
    expect(existsSync(path.join(projectRoot, fileName))).toBe(true);
  });

  it('includes the separate landing page with the ContextVault brand', () => {
    const landingPath = path.join(
      projectRoot,
      'landing',
      'index.html'
    );

    expect(existsSync(landingPath)).toBe(true);

    const landingHtml = readFileSync(
      landingPath,
      'utf8'
    );

    expect(landingHtml).toMatch(/ContextVault/i);
  });
});
