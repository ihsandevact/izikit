/// <reference lib="webworker" />
import {
  inspectPdfPages,
  mergePdfBuffers,
  PdfProcessingError,
} from './merge.logic';

export type MergeWorkerRequest =
  | {
      action: 'inspect';
      fileName: string;
      buffer: ArrayBuffer;
    }
  | {
      action: 'merge';
      items: Array<{
        name: string;
        buffer: ArrayBuffer;
      }>;
    };

export interface InspectWorkerResponse {
  pageCount: number;
}

export interface MergeWorkerResponse {
  buffer: ArrayBuffer;
  totalPages: number;
  fileCount: number;
}

self.onmessage = async (event: MessageEvent<MergeWorkerRequest>) => {
  const payload = event.data;

  try {
    if (payload.action === 'inspect') {
      const pageCount = await inspectPdfPages(new Uint8Array(payload.buffer), payload.fileName);
      self.postMessage({
        type: 'result',
        data: { pageCount } satisfies InspectWorkerResponse,
      });
      return;
    }

    if (payload.action === 'merge') {
      const result = await mergePdfBuffers(
        payload.items.map((item) => ({
          name: item.name,
          bytes: new Uint8Array(item.buffer),
        })),
        (progress) => {
          self.postMessage({
            type: 'progress',
            percent: progress.percent,
            current: progress.current,
            total: progress.total,
            label: progress.fileName,
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
            totalPages: result.totalPages,
            fileCount: result.fileCount,
          } satisfies MergeWorkerResponse,
        },
        [arrayBuffer],
      );
    }
  } catch (err) {
    if (err instanceof PdfProcessingError) {
      self.postMessage({
        type: 'error',
        code: err.code,
        message: err.fileName ? `${err.fileName}` : err.message,
      });
      return;
    }
    self.postMessage({
      type: 'error',
      code: 'GENERIC',
      message: err instanceof Error ? err.message : 'Unexpected PDF worker error',
    });
  }
};
