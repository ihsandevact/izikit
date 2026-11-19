/// <reference lib="webworker" />
import {
  inspectSplitPdfPages,
  splitPdfDocument,
  SplitPdfError,
  type SplitMode,
} from './split.logic';

export type SplitWorkerRequest =
  | {
      action: 'inspect';
      buffer: ArrayBuffer;
    }
  | {
      action: 'split';
      buffer: ArrayBuffer;
      mode: SplitMode;
      rangeSpec?: string;
      baseName: string;
    };

export interface SplitInspectResponse {
  pageCount: number;
}

export interface SplitWorkerOutputFile {
  filename: string;
  label: string;
  pageCount: number;
  buffer: ArrayBuffer;
}

export interface SplitWorkerResponse {
  files: SplitWorkerOutputFile[];
}

self.onmessage = async (event: MessageEvent<SplitWorkerRequest>) => {
  const payload = event.data;

  try {
    if (payload.action === 'inspect') {
      const pageCount = await inspectSplitPdfPages(new Uint8Array(payload.buffer));
      self.postMessage({
        type: 'result',
        data: { pageCount } satisfies SplitInspectResponse,
      });
      return;
    }

    if (payload.action === 'split') {
      const outputs = await splitPdfDocument(
        new Uint8Array(payload.buffer),
        {
          mode: payload.mode,
          rangeSpec: payload.rangeSpec,
          baseName: payload.baseName,
        },
        (progress) => {
          self.postMessage({
            type: 'progress',
            percent: progress.percent,
            current: progress.current,
            total: progress.total,
            label: progress.label,
          });
        },
      );

      const files: SplitWorkerOutputFile[] = [];
      const transferables: Transferable[] = [];

      for (const output of outputs) {
        const arrayBuffer = output.bytes.buffer.slice(
          output.bytes.byteOffset,
          output.bytes.byteOffset + output.bytes.byteLength,
        ) as ArrayBuffer;
        files.push({
          filename: output.filename,
          label: output.label,
          pageCount: output.pageCount,
          buffer: arrayBuffer,
        });
        transferables.push(arrayBuffer);
      }

      self.postMessage(
        {
          type: 'result',
          data: { files } satisfies SplitWorkerResponse,
        },
        transferables,
      );
    }
  } catch (err) {
    if (err instanceof SplitPdfError) {
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
      message: err instanceof Error ? err.message : 'Unexpected PDF split error.',
    });
  }
};
