/// <reference lib="webworker" />
import {
  inspectProtectPdf,
  ProtectPdfError,
  protectPdfDocument,
  unlockPdfDocument,
  type ProtectPdfInspectInfo,
  type ProtectPdfOptions,
  type UnlockPdfOptions,
} from './protect.logic';

export type ProtectWorkerRequest =
  | {
      action: 'inspect';
      buffer: ArrayBuffer;
    }
  | {
      action: 'protect';
      buffer: ArrayBuffer;
      options: ProtectPdfOptions;
    }
  | {
      action: 'unlock';
      buffer: ArrayBuffer;
      options: UnlockPdfOptions;
    };

export type ProtectInspectResponse = ProtectPdfInspectInfo;

export interface ProtectWorkerResponse {
  buffer: ArrayBuffer;
  pageCount: number;
}

self.onmessage = async (event: MessageEvent<ProtectWorkerRequest>) => {
  const payload = event.data;

  try {
    if (payload.action === 'inspect') {
      const info = await inspectProtectPdf(new Uint8Array(payload.buffer));
      self.postMessage({
        type: 'result',
        data: info satisfies ProtectInspectResponse,
      });
      return;
    }

    if (payload.action === 'protect') {
      const result = await protectPdfDocument(
        new Uint8Array(payload.buffer),
        payload.options,
        (progress) => {
          self.postMessage({
            type: 'progress',
            percent: progress.percent,
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
          } satisfies ProtectWorkerResponse,
        },
        [arrayBuffer],
      );
      return;
    }

    if (payload.action === 'unlock') {
      const result = await unlockPdfDocument(
        new Uint8Array(payload.buffer),
        payload.options,
        (progress) => {
          self.postMessage({
            type: 'progress',
            percent: progress.percent,
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
          } satisfies ProtectWorkerResponse,
        },
        [arrayBuffer],
      );
    }
  } catch (err) {
    if (err instanceof ProtectPdfError) {
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
      message: err instanceof Error ? err.message : 'Unexpected PDF protection error.',
    });
  }
};
