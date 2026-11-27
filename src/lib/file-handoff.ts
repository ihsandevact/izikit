import { createClientId } from './id';

export const HANDOFF_DB_NAME = 'izikit-file-handoff';
export const HANDOFF_DB_VERSION = 1;
export const HANDOFF_STORE_NAME = 'entries';
export const HANDOFF_QUERY_PARAM = 'handoff';
export const HANDOFF_TTL_MS = 10 * 60 * 1000;

export interface StoredHandoffFile {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
}

export interface HandoffMeta {
  sourceSlotId?: string;
}

export interface StoredHandoffRecord {
  id: string;
  sourceRoute: string;
  createdAt: number;
  files: StoredHandoffFile[];
  meta?: HandoffMeta;
}

export interface ConsumedHandoff {
  files: File[];
  sourceRoute: string;
  meta?: HandoffMeta;
}

export function isHandoffExpired(
  createdAt: number,
  now: number = Date.now(),
  ttlMs: number = HANDOFF_TTL_MS,
): boolean {
  if (!Number.isFinite(createdAt)) return true;
  return now - createdAt > ttlMs;
}

export function appendHandoffParam(href: string, handoffId: string): string {
  const cleanId = handoffId.trim();
  if (!cleanId) return href;

  const syntheticOrigin = 'https://izikit.local';
  const url = new URL(href, syntheticOrigin);
  url.searchParams.set(HANDOFF_QUERY_PARAM, cleanId);

  if (url.origin === syntheticOrigin) {
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return url.toString();
}

export function readHandoffParam(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = new URLSearchParams(window.location.search).get(HANDOFF_QUERY_PARAM);
    return id && id.trim().length > 0 ? id.trim() : null;
  } catch {
    return null;
  }
}

export function stripHandoffParamFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(HANDOFF_QUERY_PARAM)) return;
    url.searchParams.delete(HANDOFF_QUERY_PARAM);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  } catch {
    // Ignore history errors in restricted browser contexts
  }
}

function openHandoffDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(HANDOFF_DB_NAME, HANDOFF_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HANDOFF_STORE_NAME)) {
          db.createObjectStore(HANDOFF_STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function purgeExpiredInDb(db: IDBDatabase, now: number): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(HANDOFF_STORE_NAME, 'readwrite');
      const store = tx.objectStore(HANDOFF_STORE_NAME);
      const cursorReq = store.openCursor();

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const record = cursor.value as Partial<StoredHandoffRecord> | undefined;
        if (!record || isHandoffExpired(Number(record.createdAt), now)) {
          cursor.delete();
        }
        cursor.continue();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function purgeExpiredHandoffs(now: number = Date.now()): Promise<void> {
  const db = await openHandoffDb();
  if (!db) return;
  try {
    await purgeExpiredInDb(db, now);
  } finally {
    db.close();
  }
}

/**
 * Stores one or more files temporarily in IndexedDB for client-side handoff
 * between static tool pages. Returns a short-lived ID or null if unavailable.
 */
export async function saveHandoffFiles(
  files: readonly File[],
  sourceRoute: string,
  meta?: HandoffMeta,
): Promise<string | null> {
  if (files.length === 0) return null;

  const db = await openHandoffDb();
  if (!db) return null;

  const now = Date.now();
  try {
    await purgeExpiredInDb(db, now);

    const id = createClientId();
    // Convert File to plain Blob + metadata to avoid Safari/WebKit File clone quirks
    const storedFiles: StoredHandoffFile[] = files.map((file) => ({
      blob: file.slice(0, file.size, file.type),
      name: file.name,
      type: file.type,
      lastModified: file.lastModified || now,
    }));

    const record: StoredHandoffRecord = {
      id,
      sourceRoute,
      createdAt: now,
      files: storedFiles,
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    };

    const saved = await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(HANDOFF_STORE_NAME, 'readwrite');
        tx.objectStore(HANDOFF_STORE_NAME).put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });

    return saved ? id : null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/**
 * Reads a handoff record and immediately deletes it from IndexedDB (one-shot)
 * so sensitive user files such as ID cards or certificates never linger locally.
 */
export async function consumeHandoffFiles(id: string): Promise<ConsumedHandoff | null> {
  const cleanId = id.trim();
  if (!cleanId) return null;

  const db = await openHandoffDb();
  if (!db) return null;

  const now = Date.now();
  try {
    const record = await new Promise<StoredHandoffRecord | null>((resolve) => {
      try {
        const tx = db.transaction(HANDOFF_STORE_NAME, 'readwrite');
        const store = tx.objectStore(HANDOFF_STORE_NAME);
        const getReq = store.get(cleanId);
        let found: StoredHandoffRecord | null = null;

        getReq.onsuccess = () => {
          found = (getReq.result as StoredHandoffRecord | undefined) ?? null;
          if (found) {
            store.delete(cleanId);
          }
        };

        tx.oncomplete = () => resolve(found);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    await purgeExpiredInDb(db, now);

    if (!record || isHandoffExpired(record.createdAt, now) || !Array.isArray(record.files)) {
      return null;
    }

    const reconstructedFiles = record.files.map(
      (item) =>
        new File([item.blob], item.name, {
          type: item.type,
          lastModified: item.lastModified,
        }),
    );

    if (reconstructedFiles.length === 0) return null;

    return {
      files: reconstructedFiles,
      sourceRoute: record.sourceRoute || '/',
      ...(record.meta ? { meta: record.meta } : {}),
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}
