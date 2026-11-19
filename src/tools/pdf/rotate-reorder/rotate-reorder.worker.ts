/// <reference lib="webworker" />
import {
  applyPdfPagePlan,
  inspectPdfPagesMetadata,
  RotateReorderError,
  type PagePlanItem,
  type PdfPageMetadata,
} from './rotate-reorder.logic';

export type RotateReorderWorkerRequest =
  | {
      action: 'inspect';
      buffer: ArrayBuffer;
    }
  | {
      action: 'apply';
      buffer: ArrayBuffer;
      plan: PagePlanItem[];
    };

export interface RotateInspectResponse {
  pages: PdfPageMetadata[];
}

export interface RotateApplyResponse {
  buffer: ArrayBuffer;
  pageCount: number;
}

self.onmessage = async (event: MessageEvent<RotateReorderWorkerRequest>) => {
  const payload = event.data;

  try {
    if (payload.action === 'inspect') {
      const pages = await inspectPdfPagesMetadata(new Uint8Array(payload.buffer));
      self.postMessage({
        type: 'result',
        data: { pages } satisfies RotateInspectResponse,
      });
      return;
    }

    if (payload.action === 'apply') {
      const result = await applyPdfPagePlan(
        new Uint8Array(payload.buffer),
        payload.plan,
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
          } satisfies RotateApplyResponse,
        },
        [arrayBuffer],
      );
    }
  } catch (err) {
    if (err instanceof RotateReorderError) {
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
      message: err instanceof Error ? err.message : 'Unexpected PDF worker error.',
    });
  }
};
