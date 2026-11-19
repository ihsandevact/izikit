/// <reference lib="webworker" />
import type { SupportedImageMime } from '@/lib/file-validation';
import {
  buildImageToPdf,
  ImageToPdfError,
  type EmbeddableImageMime,
  type ImageToPdfInputItem,
  type ImageToPdfOptions,
} from './image-to-pdf.logic';

export interface ImageToPdfWorkerItem {
  name: string;
  mime: SupportedImageMime;
  buffer: ArrayBuffer;
}

export interface ImageToPdfWorkerRequest {
  items: ImageToPdfWorkerItem[];
  options: ImageToPdfOptions;
}

export interface ImageToPdfWorkerResponse {
  buffer: ArrayBuffer;
  pageCount: number;
}

async function normalizeToEmbeddable(
  item: ImageToPdfWorkerItem,
): Promise<ImageToPdfInputItem> {
  if (item.mime === 'image/png' || item.mime === 'image/jpeg') {
    return {
      name: item.name,
      mime: item.mime satisfies EmbeddableImageMime,
      bytes: new Uint8Array(item.buffer),
    };
  }

  // Transcode WebP to PNG off the main thread so pdf-lib can embed it cleanly
  const blob = new Blob([item.buffer], { type: item.mime });
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new ImageToPdfError('CORRUPT_IMAGE', 'Unable to create 2D canvas context.', item.name);
    }
    ctx.drawImage(bitmap, 0, 0);
    const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
    const pngBuffer = await pngBlob.arrayBuffer();
    return {
      name: item.name,
      mime: 'image/png',
      bytes: new Uint8Array(pngBuffer),
    };
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (event: MessageEvent<ImageToPdfWorkerRequest>) => {
  const { items, options } = event.data;

  try {
    const normalized: ImageToPdfInputItem[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      self.postMessage({
        type: 'progress',
        percent: Math.round((i / Math.max(1, items.length)) * 25),
        current: i + 1,
        total: items.length,
        label: item.name,
      });
      normalized.push(await normalizeToEmbeddable(item));
    }

    const result = await buildImageToPdf(normalized, options, (progress) => {
      self.postMessage({
        type: 'progress',
        percent: 25 + Math.round(progress.percent * 0.75),
        current: progress.current,
        total: progress.total,
        label: progress.fileName,
      });
    });

    const arrayBuffer = result.bytes.buffer.slice(
      result.bytes.byteOffset,
      result.bytes.byteOffset + result.bytes.byteLength,
    ) as ArrayBuffer;

    self.postMessage(
      {
        type: 'result',
        data: {
          buffer: arrayBuffer,
          pageCount: result.pageCount,
        } satisfies ImageToPdfWorkerResponse,
      },
      [arrayBuffer],
    );
  } catch (err) {
    if (err instanceof ImageToPdfError) {
      self.postMessage({
        type: 'error',
        code: err.code,
        message: err.fileName ?? err.message,
      });
      return;
    }
    self.postMessage({
      type: 'error',
      code: 'GENERIC',
      message: err instanceof Error ? err.message : 'Unexpected Image-to-PDF worker error.',
    });
  }
};
