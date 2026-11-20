/// <reference lib="webworker" />
import { defaultOptions as avifDefaultOptions } from '@jsquash/avif/meta.js';
import avifEncWasmUrl from '@jsquash/avif/codec/enc/avif_enc.wasm?url';
import avifDecWasmUrl from '@jsquash/avif/codec/dec/avif_dec.wasm?url';
import type { AVIFModule as AvifEncModule } from '@jsquash/avif/codec/enc/avif_enc';
import type { AVIFModule as AvifDecModule } from '@jsquash/avif/codec/dec/avif_dec';
import type { ConvertibleImageMime, ConvertibleInputMime } from '@/lib/file-validation';
import type { ConversionJob } from './convert.logic';

export interface ConvertWorkerInputItem {
  job: ConversionJob;
  buffer: ArrayBuffer;
}

export interface ConvertWorkerRequest {
  items: ConvertWorkerInputItem[];
}

export interface ConvertWorkerOutputItem {
  id: string;
  outputFilename: string;
  outputMime: ConvertibleImageMime;
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

export interface ConvertWorkerResponse {
  results: ConvertWorkerOutputItem[];
}

let avifEncoderPromise: Promise<AvifEncModule> | null = null;
let avifDecoderPromise: Promise<AvifDecModule> | null = null;

function getAvifEncoder(): Promise<AvifEncModule> {
  if (!avifEncoderPromise) {
    avifEncoderPromise = import('@jsquash/avif/codec/enc/avif_enc.js').then((mod) =>
      mod.default({
        noInitialRun: true,
        locateFile: () => avifEncWasmUrl,
      }),
    );
  }
  return avifEncoderPromise;
}

function getAvifDecoder(): Promise<AvifDecModule> {
  if (!avifDecoderPromise) {
    avifDecoderPromise = import('@jsquash/avif/codec/dec/avif_dec.js').then((mod) =>
      mod.default({
        noInitialRun: true,
        locateFile: () => avifDecWasmUrl,
      }),
    );
  }
  return avifDecoderPromise;
}

async function decodeToCanvas(
  buffer: ArrayBuffer,
  inputMime: ConvertibleInputMime,
  needsBackgroundFill: boolean,
  backgroundColor: string,
): Promise<{ canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D; width: number; height: number }> {
  try {
    const sourceBlob = new Blob([buffer], { type: inputMime });
    const bitmap = await createImageBitmap(sourceBlob);
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not initialize 2D OffscreenCanvas context.');
      }
      if (needsBackgroundFill) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, bitmap.width, bitmap.height);
      }
      ctx.drawImage(bitmap, 0, 0);
      return { canvas, ctx, width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  } catch (nativeErr) {
    if (inputMime !== 'image/avif') {
      throw nativeErr;
    }

    // Fallback to WASM AVIF decoder on browsers without native AVIF decode
    const decoder = await getAvifDecoder();
    const decoded = decoder.decode(buffer, 8);
    if (!decoded) {
      throw new Error('Failed to decode AVIF image.');
    }

    const canvas = new OffscreenCanvas(decoded.width, decoded.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D OffscreenCanvas context.');
    }

    if (needsBackgroundFill) {
      const tempCanvas = new OffscreenCanvas(decoded.width, decoded.height);
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        throw new Error('Could not initialize temporary 2D OffscreenCanvas context.');
      }
      tempCtx.putImageData(decoded, 0, 0);
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, decoded.width, decoded.height);
      ctx.drawImage(tempCanvas, 0, 0);
    } else {
      ctx.putImageData(decoded, 0, 0);
    }

    return { canvas, ctx, width: decoded.width, height: decoded.height };
  }
}

async function convertOneInWorker(
  entry: ConvertWorkerInputItem,
): Promise<ConvertWorkerOutputItem> {
  const { job, buffer } = entry;
  const { canvas, ctx, width, height } = await decodeToCanvas(
    buffer,
    job.inputMime,
    job.needsBackgroundFill,
    job.backgroundColor,
  );

  if (job.outputMime === 'image/avif') {
    const imageData = ctx.getImageData(0, 0, width, height);
    const encoder = await getAvifEncoder();
    const qualityPercent = Math.round((job.qualityRatio ?? 0.85) * 100);
    const encoded = encoder.encode(
      new Uint8Array(imageData.data.buffer),
      width,
      height,
      {
        ...avifDefaultOptions,
        quality: qualityPercent,
        speed: 6,
      },
    );
    if (!encoded) {
      throw new Error('Failed to encode AVIF image.');
    }
    // Copy out of WASM linear memory so the buffer can be safely transferred
    const outBuffer = encoded.slice().buffer;
    return {
      id: job.id,
      outputFilename: job.outputFilename,
      outputMime: job.outputMime,
      buffer: outBuffer,
      width,
      height,
    };
  }

  const outBlob = await canvas.convertToBlob({
    type: job.outputMime,
    quality: job.qualityRatio,
  });
  const outBuffer = await outBlob.arrayBuffer();

  return {
    id: job.id,
    outputFilename: job.outputFilename,
    outputMime: job.outputMime,
    buffer: outBuffer,
    width,
    height,
  };
}

self.onmessage = async (event: MessageEvent<ConvertWorkerRequest>) => {
  const { items } = event.data;

  try {
    const results: ConvertWorkerOutputItem[] = [];
    const transferables: Transferable[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const entry = items[i];
      self.postMessage({
        type: 'progress',
        percent: Math.round((i / items.length) * 95),
        current: i + 1,
        total: items.length,
        label: entry.job.outputFilename,
      });

      const converted = await convertOneInWorker(entry);
      results.push(converted);
      transferables.push(converted.buffer);
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
        data: { results } satisfies ConvertWorkerResponse,
      },
      transferables,
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      code: 'CONVERT_FAILED',
      message: err instanceof Error ? err.message : 'Image conversion failed.',
    });
  }
};
