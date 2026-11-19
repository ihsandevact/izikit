/// <reference lib="webworker" />
import {
  applyWatermarkAndPageNumbers,
  inspectWatermarkPdf,
  WatermarkPdfError,
  type WatermarkPdfOptions,
} from './watermark.logic';

export type WatermarkWorkerRequest =
  | {
      action: 'inspect';
      buffer: ArrayBuffer;
    }
  | {
      action: 'apply';
      buffer: ArrayBuffer;
      options: WatermarkPdfOptions;
    };

export interface WatermarkInspectResponse {
  pageCount: number;
}

export interface WatermarkWorkerResponse {
  buffer: ArrayBuffer;
  pageCount: number;
  modifiedPages: number;
}

self.onmessage = async (event: MessageEvent<WatermarkWorkerRequest>) => {
  const payload = event.data;

  try {
    if (payload.action === 'inspect') {
      const pageCount = await inspectWatermarkPdf(new Uint8Array(payload.buffer));
      self.postMessage({
        type: 'result',
        data: { pageCount } satisfies WatermarkInspectResponse,
      });
      return;
    }

    if (payload.action === 'apply') {
      const result = await applyWatermarkAndPageNumbers(
        new Uint8Array(payload.buffer),
        payload.options,
        (progress) => {
          self.postMessage({
            type: 'progress',
            percent: progress.percent,
            current: progress.current,
            total: progress.total,
          });
        },
      );

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
            modifiedPages: result.modifiedPages,
          } satisfies WatermarkWorkerResponse,
        },
        [arrayBuffer],
      );
    }
  } catch (err) {
    if (err instanceof WatermarkPdfError) {
      self.postMessage({
        type: 'error',
        code: err.code,
        message: err.message,
      });
      return;
    }
    self.postMessage({
      type: 'error',
      code: 'GENERIC',
      message: err instanceof Error ? err.message : 'Unexpected PDF watermark error.',
    });
  }
};
