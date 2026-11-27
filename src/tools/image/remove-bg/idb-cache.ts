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
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readCachedRecord(url: string): Promise<CachedModelRecord | null> {
  const db = await openModelCacheDb();
  if (!db) return null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (val: CachedModelRecord | null) => {
      if (settled) return;
      settled = true;
      db.close();
      resolve(val);
    };

    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(url);
      req.onsuccess = () => finish((req.result as CachedModelRecord | undefined) ?? null);
      req.onerror = () => finish(null);
      tx.onabort = () => finish(null);
      tx.onerror = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

// Serialize IndexedDB writes so 11 parallel 4 MB model chunks never contend or deadlock
let writeQueue: Promise<void> = Promise.resolve();

function writeCachedRecord(record: CachedModelRecord): Promise<void> {
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const db = await openModelCacheDb();
      if (!db) return;

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          db.close();
          resolve();
        };

        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(record);
          tx.oncomplete = finish;
          tx.onerror = finish;
          tx.onabort = finish;
        } catch {
          finish();
        }
      });
    });

  return writeQueue;
}

export async function getCachedModelStats(): Promise<ModelCacheStats> {
  const db = await openModelCacheDb();
  if (!db) return { entryCount: 0, totalBytes: 0 };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (val: ModelCacheStats) => {
      if (settled) return;
      settled = true;
      db.close();
      resolve(val);
    };

    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as CachedModelRecord[] | undefined) ?? [];
        const totalBytes = rows.reduce((sum, r) => sum + (r.buffer?.byteLength ?? 0), 0);
        finish({ entryCount: rows.length, totalBytes });
      };
      req.onerror = () => finish({ entryCount: 0, totalBytes: 0 });
      tx.onabort = () => finish({ entryCount: 0, totalBytes: 0 });
      tx.onerror = () => finish({ entryCount: 0, totalBytes: 0 });
    } catch {
      finish({ entryCount: 0, totalBytes: 0 });
    }
  });
}

export async function clearCachedModels(): Promise<void> {
  const db = await openModelCacheDb();
  if (!db) return;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      db.close();
      resolve();
    };

    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = finish;
      tx.onerror = finish;
      tx.onabort = finish;
    } catch {
      finish();
    }
  });
}

function isModelAssetUrl(url: string): boolean {
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return false;
  }
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
 * IndexedDB when available and persists downloaded chunks asynchronously on first fetch.
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
    if (!response.ok) {
      return response;
    }

    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    // Persist asynchronously without blocking the fetch return or teeing streams
    if (buffer.byteLength > 0) {
      void writeCachedRecord({
        url,
        buffer: buffer.slice(0),
        contentType,
        updatedAt: Date.now(),
      });
    }

    return new Response(buffer, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
      },
    });
  };
}
