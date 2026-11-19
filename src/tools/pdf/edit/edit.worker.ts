/// <reference lib="webworker" />
import {
  applyPdfAnnotations,
  EditPdfError,
  inspectEditPdf,
  type EditPdfInspectInfo,
  type RasterizedPageOverride,
  type SignatureAnnotationBase,
  type TextAnnotationInput,
  type HighlightAnnotationInput,
  type RedactAnnotationInput,
  type WorkerPdfAnnotation,
} from './edit.logic';

export interface SignatureAnnotationTransfer extends SignatureAnnotationBase {
  imageBuffer: ArrayBuffer;
}

export type WorkerAnnotationTransfer =
  | TextAnnotationInput
  | HighlightAnnotationInput
  | RedactAnnotationInput
  | SignatureAnnotationTransfer;

export interface RasterizedOverrideTransfer {
  pageIndex: number;
  jpegBuffer: ArrayBuffer;
  widthPt: number;
  heightPt: number;
}

export type EditWorkerRequest =
  | {
      action: 'inspect';
      buffer: ArrayBuffer;
    }
  | {
      action: 'apply';
      buffer: ArrayBuffer;
      annotations: WorkerAnnotationTransfer[];
      rasterizedOverrides?: RasterizedOverrideTransfer[];
    };

export type EditInspectResponse = EditPdfInspectInfo;

export interface EditWorkerResponse {
  buffer: ArrayBuffer;
  pageCount: number;
  modifiedPages: number;
}

self.onmessage = async (event: MessageEvent<EditWorkerRequest>) => {
  const payload = event.data;

  try {
    if (payload.action === 'inspect') {
      const info = await inspectEditPdf(new Uint8Array(payload.buffer));
      self.postMessage({
        type: 'result',
        data: info satisfies EditInspectResponse,
      });
      return;
    }

    if (payload.action === 'apply') {
      const annotations: WorkerPdfAnnotation[] = payload.annotations.map((ann) => {
        if (ann.type === 'signature') {
          const { imageBuffer, ...rest } = ann;
          return {
            ...rest,
            imageBytes: new Uint8Array(imageBuffer),
          };
        }
        return ann;
      });

      const overridesRecord: Record<number, RasterizedPageOverride> = {};
      if (payload.rasterizedOverrides) {
        for (const item of payload.rasterizedOverrides) {
          overridesRecord[item.pageIndex] = {
            jpegBytes: new Uint8Array(item.jpegBuffer),
            widthPt: item.widthPt,
            heightPt: item.heightPt,
          };
        }
      }

      const result = await applyPdfAnnotations(
        new Uint8Array(payload.buffer),
        annotations,
        { rasterizedPageOverrides: overridesRecord },
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
          } satisfies EditWorkerResponse,
        },
        [arrayBuffer],
      );
    }
  } catch (err) {
    if (err instanceof EditPdfError) {
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
      message: err instanceof Error ? err.message : 'Unexpected PDF editing error.',
    });
  }
};
