import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('BaseLayout Service Worker lifecycle safety', () => {
  it('never forces an automatic window.location.reload() during active tool sessions', () => {
    const layoutPath = path.resolve(process.cwd(), 'src/layouts/BaseLayout.astro');
    const source = fs.readFileSync(layoutPath, 'utf8');

    // Automatic reloads on controllerchange or background SW cleanup wipe in-memory uploaded files
    expect(source).not.toMatch(/window\.location\.reload\s*\(/);
    expect(source).not.toMatch(/addEventListener\s*\(\s*['"]controllerchange['"]/);
  });
});
