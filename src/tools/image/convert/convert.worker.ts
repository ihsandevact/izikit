/// <reference lib="webworker" />
import type { SupportedImageMime } from '@/lib/file-validation';
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
  outputMime: SupportedImageMime;
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

export interface ConvertWorkerResponse {
  results: ConvertWorkerOutputItem[];
}

async function convertOneInWorker(
  entry: ConvertWorkerInputItem,
): Promise<ConvertWorkerOutputItem> {
  const { job, buffer } = entry;
  const sourceBlob = new Blob([buffer], { type: job.inputMime });
  const bitmap = await createImageBitmap(sourceBlob);

  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D OffscreenCanvas context.');
    }

    if (job.needsBackgroundFill) {
      ctx.fillStyle = job.backgroundColor;
      ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    }

    ctx.drawImage(bitmap, 0, 0);

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
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
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
