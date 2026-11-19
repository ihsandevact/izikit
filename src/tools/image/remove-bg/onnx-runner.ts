import { ensureIndexedDbModelFetchCache } from './idb-cache';
import { extractAlphaChannelFromRgba } from './remove-bg.logic';

export interface OnnxRemoveProgress {
  phase: 'downloading' | 'processing';
  percent: number;
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
): Promise<Uint8ClampedArray> {
  ensureIndexedDbModelFetchCache();

  const { removeBackground } = await import('@imgly/background-removal');

  const pngBlob = await removeBackground(sourceFile, {
    model: 'isnet_quint8',
    output: {
      format: 'image/png',
      quality: 1,
    },
    progress: (key, current, total) => {
      const safeTotal = Math.max(1, total);
      const pct = Math.min(95, Math.max(5, Math.round((current / safeTotal) * 100)));
      const phase = key.includes('fetch') ? 'downloading' : 'processing';
      onProgress?.({ phase, percent: pct });
    },
  });

  const bitmap = await createImageBitmap(pngBlob);
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
    onProgress?.({ phase: 'processing', percent: 100 });
    return extractAlphaChannelFromRgba(imageData.data);
  } finally {
    bitmap.close();
  }
}
