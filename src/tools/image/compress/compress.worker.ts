/// <reference lib="webworker" />
import UPNG from 'upng-js';
import type { SupportedImageMime } from '@/lib/file-validation';
import {
  calculateTargetDimensions,
  getImageTargetAttempts,
  qualityToPngColorCount,
  resolveOutputMime,
  shouldKeepOriginal,
  type CompressOptions,
} from './compress.logic';

export interface CompressWorkerInputItem {
  id: string;
  name: string;
  mime: SupportedImageMime;
  buffer: ArrayBuffer;
}

export interface CompressWorkerRequest {
  items: CompressWorkerInputItem[];
  options: CompressOptions;
}

export interface CompressWorkerOutputItem {
  id: string;
  outputMime: SupportedImageMime;
  buffer: ArrayBuffer;
  originalWidth: number;
  originalHeight: number;
  outputWidth: number;
  outputHeight: number;
  keptOriginal: boolean;
}

export interface CompressWorkerResponse {
  results: CompressWorkerOutputItem[];
}

async function compressSingleInWorker(
  item: CompressWorkerInputItem,
  options: CompressOptions,
): Promise<CompressWorkerOutputItem> {
  const sourceBlob = new Blob([item.buffer], { type: item.mime });
  const bitmap = await createImageBitmap(sourceBlob);

  try {
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const outputMime = resolveOutputMime(item.mime, options.outputFormat);

    const encodeAt = async (
      quality: number,
      maxWidth: number | null,
    ): Promise<{ buffer: ArrayBuffer; width: number; height: number; resized: boolean }> => {
      const target = calculateTargetDimensions(originalWidth, originalHeight, maxWidth);
      const resized = target.width !== originalWidth || target.height !== originalHeight;

      const canvas = new OffscreenCanvas(target.width, target.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not initialize 2D OffscreenCanvas context.');
      }

      if (outputMime === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, target.width, target.height);
      }

      ctx.drawImage(bitmap, 0, 0, target.width, target.height);

      let encodedBuffer: ArrayBuffer;
      if (outputMime === 'image/png') {
        const imageData = ctx.getImageData(0, 0, target.width, target.height);
        const rgbaCopy = new Uint8Array(imageData.data);
        const colors = qualityToPngColorCount(quality);
        encodedBuffer = UPNG.encode([rgbaCopy.buffer], target.width, target.height, colors);
      } else {
        const qualityRatio = Math.max(0.1, Math.min(1, quality / 100));
        const outBlob = await canvas.convertToBlob({
          type: outputMime,
          quality: qualityRatio,
        });
        encodedBuffer = await outBlob.arrayBuffer();
      }

      return { buffer: encodedBuffer, width: target.width, height: target.height, resized };
    };

    let best: { buffer: ArrayBuffer; width: number; height: number; resized: boolean };

    if (options.targetMaxBytes && options.targetMaxBytes > 0 && outputMime !== 'image/png') {
      const attempts = getImageTargetAttempts(options.maxWidth);
      best = await encodeAt(attempts[0].quality, attempts[0].maxWidth);
      for (let idx = 1; idx < attempts.length; idx += 1) {
        if (best.buffer.byteLength <= options.targetMaxBytes) break;
        const next = await encodeAt(attempts[idx].quality, attempts[idx].maxWidth);
        if (next.buffer.byteLength < best.buffer.byteLength) {
          best = next;
        }
      }
    } else {
      best = await encodeAt(options.quality, options.maxWidth);
    }

    const keptOriginal =
      !options.targetMaxBytes &&
      shouldKeepOriginal({
        inputMime: item.mime,
        outputMime,
        originalSize: item.buffer.byteLength,
        compressedSize: best.buffer.byteLength,
        resized: best.resized,
      });

    return {
      id: item.id,
      outputMime,
      buffer: keptOriginal ? item.buffer : best.buffer,
      originalWidth,
      originalHeight,
      outputWidth: best.width,
      outputHeight: best.height,
      keptOriginal,
    };
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (event: MessageEvent<CompressWorkerRequest>) => {
  const { items, options } = event.data;

  try {
    const results: CompressWorkerOutputItem[] = [];
    const transferables: Transferable[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      self.postMessage({
        type: 'progress',
        percent: Math.round((i / items.length) * 95),
        current: i + 1,
        total: items.length,
        label: item.name,
      });

      const compressed = await compressSingleInWorker(item, options);
      results.push(compressed);
      transferables.push(compressed.buffer);
    }

    self.postMessage({
      type: 'progress',
      percent: 100,
      current: items.length,
      total: items.length,
    });

    self.postMessage(
      {
        type: 'result',
        data: { results } satisfies CompressWorkerResponse,
      },
      transferables,
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      code: 'COMPRESS_FAILED',
      message: err instanceof Error ? err.message : 'Image compression failed inside worker.',
    });
  }
};
