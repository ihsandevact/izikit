import { clearCachedModels, ensureIndexedDbModelFetchCache } from './idb-cache';
import { extractAlphaChannelFromRgba } from './remove-bg.logic';

export interface OnnxRemoveProgress {
  phase: 'downloading' | 'processing';
  percent: number;
}

export interface OnnxRemoveOptions {
  sourceRgba?: Uint8ClampedArray;
}

// Incremented whenever a failed attempt forces a fresh init, bypassing @imgly's memoized rejected Promise
let retryNonce = 0;

function buildInputBlob(
  sourceFile: Blob,
  targetWidth: number,
  targetHeight: number,
  sourceRgba?: Uint8ClampedArray,
): Blob {
  if (sourceRgba && sourceRgba.byteLength === targetWidth * targetHeight * 4) {
    return new Blob([new Uint8Array(sourceRgba.buffer, sourceRgba.byteOffset, sourceRgba.byteLength)], {
      type: `image/x-rgba8;width=${targetWidth};height=${targetHeight}`,
    });
  }

  const normalizedType =
    sourceFile.type &&
    ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(sourceFile.type.toLowerCase())
      ? sourceFile.type
      : 'image/jpeg';

  return sourceFile.type === normalizedType
    ? sourceFile
    : new Blob([sourceFile], { type: normalizedType });
}

async function decodeAlphaFromOutputBlob(
  outputBlob: Blob,
  targetWidth: number,
  targetHeight: number,
): Promise<Uint8ClampedArray> {
  const expectedRgbaBytes = targetWidth * targetHeight * 4;
  if (outputBlob.type.startsWith('image/x-rgba8')) {
    const raw = new Uint8ClampedArray(await outputBlob.arrayBuffer());
    if (raw.byteLength === expectedRgbaBytes) {
      return extractAlphaChannelFromRgba(raw);
    }
  }

  const bitmap = await createImageBitmap(outputBlob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D canvas context.');
    }
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    canvas.width = 0;
    canvas.height = 0;
    return extractAlphaChannelFromRgba(imageData.data);
  } finally {
    bitmap.close();
  }
}

/**
 * Lazily loads @imgly/background-removal (ONNX/WASM) with IndexedDB model caching
 * and returns a 1-channel alpha mask matching (targetWidth x targetHeight).
 */
export async function runOnnxBackgroundRemovalMask(
  sourceFile: Blob,
  targetWidth: number,
  targetHeight: number,
  onProgress?: (info: OnnxRemoveProgress) => void,
  options?: OnnxRemoveOptions,
): Promise<Uint8ClampedArray> {
  ensureIndexedDbModelFetchCache();

  const { removeBackground } = await import('@imgly/background-removal');
  const inputBlob = buildInputBlob(sourceFile, targetWidth, targetHeight, options?.sourceRgba);

  const runAttempt = (attemptNonce: number) =>
    removeBackground(inputBlob, {
      model: 'isnet_quint8',
      output: {
        format: 'image/x-rgba8',
        quality: 1,
      },
      // Unique headerless cache option when retrying busts @imgly's internal memoized Promise
      fetchArgs: attemptNonce > 0 ? ({ cache: 'reload', _retry: attemptNonce } as RequestInit) : {},
      progress: (key, current, total) => {
        const safeTotal = Math.max(1, total);
        const pct = Math.min(95, Math.max(5, Math.round((current / safeTotal) * 100)));
        const phase = key.includes('fetch') ? 'downloading' : 'processing';
        onProgress?.({ phase, percent: pct });
      },
    });

  let outputBlob: Blob;
  try {
    outputBlob = await runAttempt(retryNonce);
  } catch (firstErr) {
    // Self-heal corrupted/incomplete IndexedDB cache chunks and bust memoized init failure once
    console.warn('[izikit:remove-bg] First AI attempt failed, clearing model cache and retrying:', firstErr);
    retryNonce += 1;
    await clearCachedModels();
    onProgress?.({ phase: 'downloading', percent: 8 });
    outputBlob = await runAttempt(retryNonce);
  }

  const alpha = await decodeAlphaFromOutputBlob(outputBlob, targetWidth, targetHeight);
  onProgress?.({ phase: 'processing', percent: 100 });
  return alpha;
}
