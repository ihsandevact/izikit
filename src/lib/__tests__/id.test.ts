import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClientId } from '@/lib/id';

describe('createClientId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generates distinct non-empty IDs in standard environments', () => {
    const a = createClientId();
    const b = createClientId();
    expect(a.length).toBeGreaterThan(8);
    expect(b.length).toBeGreaterThan(8);
    expect(a).not.toBe(b);
  });

  it('falls back cleanly when crypto.randomUUID is unavailable (HTTP LAN non-secure context)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i += 1) {
          arr[i] = (i * 17 + 42) & 0xff;
        }
        return arr;
      },
    });

    const id = createClientId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('falls back cleanly when crypto global is completely absent', () => {
    vi.stubGlobal('crypto', undefined);
    const id = createClientId();
    expect(id.length).toBeGreaterThan(6);
  });
});
