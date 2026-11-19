/// <reference lib="webworker" />
import {
  buildRasterizedPdfFromJpegs,
  CompressPdfError,
  inspectCompressPdf,
  optimizePdfStructure,
  type CompressPdfInspectInfo,
  type CompressPdfOptions,
  type PdfPageSizeTarget,
} from './compress-pdf.logic';

export interface RasterizedPageTransfer {
  jpegBuffer: ArrayBuffer;
  widthPt: number;
  heightPt: number;
}

export type CompressPdfWorkerRequest =
  | {
      action: 'inspect';
      buffer: ArrayBuffer;
    }
  | {
      action: 'optimize';
      buffer: ArrayBuffer;
      options: CompressPdfOptions;
    }
  | {
      action: 'pack-jpegs';
      pages: RasterizedPageTransfer[];
      originalByteLength: number;
      pageSize: PdfPageSizeTarget;
      stripMetadata: boolean;
    };

export type CompressPdfInspectResponse = CompressPdfInspectInfo;

export interface CompressPdfWorkerResponse {
  buffer: ArrayBuffer;
  pageCount: number;
  originalBytes: number;
  finalBytes: number;
  savedBytes: number;
  savedPercent: number;
  keptOriginal: boolean;
}

self.onmessage = async (event: MessageEvent<CompressPdfWorkerRequest>) => {
  const payload = event.data;

  try {
    if (payload.action === 'inspect') {
      const info = await inspectCompressPdf(new Uint8Array(payload.buffer));
      self.postMessage({
        type: 'result',
        data: info satisfies CompressPdfInspectResponse,
      });
      return;
    }

    if (payload.action === 'optimize') {
      const result = await optimizePdfStructure(
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
            originalBytes: result.originalBytes,
            finalBytes: result.finalBytes,
            savedBytes: result.savedBytes,
            savedPercent: result.savedPercent,
            keptOriginal: result.keptOriginal,
          } satisfies CompressPdfWorkerResponse,
        },
        [arrayBuffer],
      );
      return;
    }

    if (payload.action === 'pack-jpegs') {
      const result = await buildRasterizedPdfFromJpegs(
        payload.pages.map((p) => ({
          jpegBytes: new Uint8Array(p.jpegBuffer),
          widthPt: p.widthPt,
          heightPt: p.heightPt,
        })),
        {
          originalByteLength: payload.originalByteLength,
          pageSize: payload.pageSize,
          stripMetadata: payload.stripMetadata,
        },
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
            originalBytes: result.originalBytes,
            finalBytes: result.finalBytes,
            savedBytes: result.savedBytes,
            savedPercent: result.savedPercent,
            keptOriginal: result.keptOriginal,
          } satisfies CompressPdfWorkerResponse,
        },
        [arrayBuffer],
      );
    }
  } catch (err) {
    if (err instanceof CompressPdfError) {
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
      message: err instanceof Error ? err.message : 'Unexpected PDF compression error.',
    });
  }
};
