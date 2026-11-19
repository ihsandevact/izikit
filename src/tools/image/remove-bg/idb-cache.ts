const DB_NAME = 'izikit-ml-cache';
const STORE_NAME = 'models';
const DB_VERSION = 1;

interface CachedModelRecord {
  url: string;
  buffer: ArrayBuffer;
  contentType: string;
  updatedAt: number;
}

export interface ModelCacheStats {
  entryCount: number;
  totalBytes: number;
}

function openModelCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readCachedRecord(url: string): Promise<CachedModelRecord | null> {
  const db = await openModelCacheDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(url);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as CachedModelRecord | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function writeCachedRecord(record: CachedModelRecord): Promise<void> {
  const db = await openModelCacheDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function getCachedModelStats(): Promise<ModelCacheStats> {
  const db = await openModelCacheDb();
  if (!db) return { entryCount: 0, totalBytes: 0 };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as CachedModelRecord[] | undefined) ?? [];
        const totalBytes = rows.reduce((sum, r) => sum + (r.buffer?.byteLength ?? 0), 0);
        db.close();
        resolve({ entryCount: rows.length, totalBytes });
      };
      req.onerror = () => {
        db.close();
        resolve({ entryCount: 0, totalBytes: 0 });
      };
    } catch {
      db.close();
      resolve({ entryCount: 0, totalBytes: 0 });
    }
  });
}

export async function clearCachedModels(): Promise<void> {
  const db = await openModelCacheDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

function isModelAssetUrl(url: string): boolean {
  return (
    url.includes('staticimgly.com') ||
    url.includes('background-removal-data') ||
    url.endsWith('.onnx') ||
    url.endsWith('.wasm')
  );
}

let fetchInterceptorInstalled = false;

/**
 * Installs a transparent fetch wrapper that serves ONNX/WASM model files from
 * IndexedDB when available and persists downloaded chunks on first fetch.
 */
export function ensureIndexedDbModelFetchCache(): void {
  if (fetchInterceptorInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }
  fetchInterceptorInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (!isModelAssetUrl(url) || (init?.method && init.method.toUpperCase() !== 'GET')) {
      return nativeFetch(input, init);
    }

    const cached = await readCachedRecord(url);
    if (cached && cached.buffer.byteLength > 0) {
      return new Response(cached.buffer.slice(0), {
        status: 200,
        headers: {
          'Content-Type': cached.contentType || 'application/octet-stream',
          'Content-Length': String(cached.buffer.byteLength),
        },
      });
    }

    const response = await nativeFetch(input, init);
    if (response.ok) {
      try {
        const clone = response.clone();
        const buffer = await clone.arrayBuffer();
        const contentType = clone.headers.get('Content-Type') || 'application/octet-stream';
        await writeCachedRecord({
          url,
          buffer,
          contentType,
          updatedAt: Date.now(),
        });
      } catch {
        // Ignore IndexedDB quota errors; normal network response still proceeds
      }
    }
    return response;
  };
}
