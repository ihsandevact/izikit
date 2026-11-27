import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HANDOFF_STORE_NAME,
  HANDOFF_TTL_MS,
  appendHandoffParam,
  consumeHandoffFiles,
  isHandoffExpired,
  saveHandoffFiles,
} from '../file-handoff';

function createMockIndexedDb() {
  const storeData = new Map<string, unknown>();

  const makeObjectStore = () => ({
    put(value: { id: string }) {
      storeData.set(value.id, value);
      return {};
    },
    get(key: string) {
      const req: { result?: unknown; onsuccess?: () => void } = {};
      queueMicrotask(() => {
        req.result = storeData.get(key);
        req.onsuccess?.();
      });
      return req;
    },
    delete(key: string) {
      storeData.delete(key);
      return {};
    },
    openCursor() {
      const req: { result?: unknown; onsuccess?: () => void } = {};
      const entries = Array.from(storeData.entries());
      let idx = 0;

      const emitNext = () => {
        queueMicrotask(() => {
          if (idx >= entries.length) {
            req.result = null;
            req.onsuccess?.();
            return;
          }
          const [key, value] = entries[idx++];
          req.result = {
            value,
            delete: () => storeData.delete(key),
            continue: emitNext,
          };
          req.onsuccess?.();
        });
      };

      emitNext();
      return req;
    },
  });

  const mockDb = {
    objectStoreNames: {
      contains: (name: string) => name === HANDOFF_STORE_NAME,
    },
    createObjectStore: vi.fn(),
    close: vi.fn(),
    transaction() {
      const tx: {
        objectStore: () => ReturnType<typeof makeObjectStore>;
        oncomplete?: () => void;
        onerror?: () => void;
        onabort?: () => void;
      } = {
        objectStore: makeObjectStore,
      };
      // Complete transaction after microtask queue flushes get/cursor callbacks
      setTimeout(() => tx.oncomplete?.(), 0);
      return tx;
    },
  };

  const mockIndexedDb = {
    open() {
      const req: {
        result?: typeof mockDb;
        onupgradeneeded?: () => void;
        onsuccess?: () => void;
        onerror?: () => void;
        onblocked?: () => void;
      } = {};
      queueMicrotask(() => {
        req.result = mockDb;
        req.onsuccess?.();
      });
      return req;
    },
  };

  return { mockIndexedDb, storeData };
}

describe('file-handoff helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('appends handoff query param cleanly to paths with and without existing query/hash', () => {
    expect(appendHandoffParam('/compress-image?preset=200kb', 'abc-123')).toBe(
      '/compress-image?preset=200kb&handoff=abc-123',
    );
    expect(appendHandoffParam('/heic-to-jpg', 'abc-123')).toBe('/heic-to-jpg?handoff=abc-123');
    expect(appendHandoffParam('/convert-image?format=jpg#top', 'xyz')).toBe(
      '/convert-image?format=jpg&handoff=xyz#top',
    );
    expect(appendHandoffParam('/compress-pdf', '   ')).toBe('/compress-pdf');
  });

  it('correctly evaluates handoff TTL expiration', () => {
    const now = 1_700_000_000_000;
    expect(isHandoffExpired(now - 1000, now)).toBe(false);
    expect(isHandoffExpired(now - HANDOFF_TTL_MS, now)).toBe(false);
    expect(isHandoffExpired(now - HANDOFF_TTL_MS - 1, now)).toBe(true);
    expect(isHandoffExpired(Number.NaN, now)).toBe(true);
  });

  it('returns null gracefully when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const file = new File(['hello'], 'pasfoto.jpg', { type: 'image/jpeg' });
    expect(await saveHandoffFiles([file], '/cpns')).toBeNull();
    expect(await consumeHandoffFiles('missing-id')).toBeNull();
  });

  it('saves, consumes once, and immediately deletes record from IndexedDB', async () => {
    const { mockIndexedDb, storeData } = createMockIndexedDb();
    vi.stubGlobal('indexedDB', mockIndexedDb);

    const inputFile = new File([new Uint8Array([1, 2, 3, 4])], 'ktp-asli.jpg', {
      type: 'image/jpeg',
      lastModified: 1_700_000_123_000,
    });

    const id = await saveHandoffFiles([inputFile], '/cpns', { sourceSlotId: 'ktp' });
    expect(id).toBeTruthy();
    expect(storeData.size).toBe(1);

    const consumed = await consumeHandoffFiles(id!);
    expect(consumed).not.toBeNull();
    expect(consumed?.sourceRoute).toBe('/cpns');
    expect(consumed?.meta).toEqual({ sourceSlotId: 'ktp' });
    expect(consumed?.files).toHaveLength(1);
    expect(consumed?.files[0].name).toBe('ktp-asli.jpg');
    expect(consumed?.files[0].type).toBe('image/jpeg');
    expect(consumed?.files[0].size).toBe(4);

    // One-shot guarantee: record is already deleted and second consume returns null
    expect(storeData.size).toBe(0);
    expect(await consumeHandoffFiles(id!)).toBeNull();
  });

  it('purges expired records and refuses to return expired entries', async () => {
    const { mockIndexedDb, storeData } = createMockIndexedDb();
    vi.stubGlobal('indexedDB', mockIndexedDb);

    storeData.set('stale-entry', {
      id: 'stale-entry',
      sourceRoute: '/cpns',
      createdAt: Date.now() - HANDOFF_TTL_MS - 60_000,
      files: [],
    });

    const consumed = await consumeHandoffFiles('stale-entry');
    expect(consumed).toBeNull();
    expect(storeData.has('stale-entry')).toBe(false);
  });
});
