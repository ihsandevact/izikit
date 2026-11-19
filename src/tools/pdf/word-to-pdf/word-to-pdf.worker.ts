/// <reference lib="webworker" />
import {
  convertDocxToPdf,
  inspectDocxSummary,
  WordToPdfError,
  type DocxSummary,
  type WordToPdfOptions,
} from './word-to-pdf.logic';

export type WordToPdfWorkerRequest =
  | {
      action: 'inspect';
      buffer: ArrayBuffer;
    }
  | {
      action: 'convert';
      buffer: ArrayBuffer;
      options: WordToPdfOptions;
    };

export type WordToPdfInspectResponse = DocxSummary;

export interface WordToPdfWorkerResponse {
  buffer: ArrayBuffer;
  pageCount: number;
  summary: DocxSummary;
}

self.onmessage = async (event: MessageEvent<WordToPdfWorkerRequest>) => {
  const payload = event.data;

  try {
    if (payload.action === 'inspect') {
      const summary = await inspectDocxSummary(new Uint8Array(payload.buffer));
      self.postMessage({
        type: 'result',
        data: summary satisfies WordToPdfInspectResponse,
      });
      return;
    }

    if (payload.action === 'convert') {
      const result = await convertDocxToPdf(
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
            summary: result.summary,
          } satisfies WordToPdfWorkerResponse,
        },
        [arrayBuffer],
      );
    }
  } catch (err) {
    if (err instanceof WordToPdfError) {
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
      message: err instanceof Error ? err.message : 'Unexpected Word to PDF conversion error.',
    });
  }
};
