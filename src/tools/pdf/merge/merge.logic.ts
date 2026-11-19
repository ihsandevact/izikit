import { PDFDocument } from 'pdf-lib';

export type PdfErrorCode = 'ENCRYPTED' | 'CORRUPT' | 'NEED_TWO_FILES';

export class PdfProcessingError extends Error {
  readonly code: PdfErrorCode;
  readonly fileName?: string;

  constructor(code: PdfErrorCode, message: string, fileName?: string) {
    super(message);
    this.name = 'PdfProcessingError';
    this.code = code;
    this.fileName = fileName;
  }
}

export interface PdfMergeInput {
  name: string;
  bytes: Uint8Array;
}

export interface PdfMergeResult {
  bytes: Uint8Array;
  totalPages: number;
  fileCount: number;
}

export interface MergeProgressInfo {
  percent: number;
  current: number;
  total: number;
  fileName?: string;
}

function classifyLoadError(err: unknown, fileName: string): PdfProcessingError {
  const message = err instanceof Error ? err.message : String(err);
  if (/encrypt/i.test(message)) {
    return new PdfProcessingError('ENCRYPTED', message, fileName);
  }
  return new PdfProcessingError('CORRUPT', message, fileName);
}

/**
 * Inspects a single PDF buffer to count pages and detect encrypted or malformed files.
 */
export async function inspectPdfPages(bytes: Uint8Array, fileName: string): Promise<number> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return doc.getPageCount();
  } catch (err) {
    throw classifyLoadError(err, fileName);
  }
}

/**
 * Merges multiple PDF buffers in order into one PDFDocument.
 */
export async function mergePdfBuffers(
  inputs: PdfMergeInput[],
  onProgress?: (info: MergeProgressInfo) => void,
): Promise<PdfMergeResult> {
  if (inputs.length < 2) {
    throw new PdfProcessingError('NEED_TWO_FILES', 'At least 2 PDF files are required to merge.');
  }

  const mergedDoc = await PDFDocument.create();
  let totalPages = 0;

  for (let i = 0; i < inputs.length; i += 1) {
    const item = inputs[i];
    onProgress?.({
      percent: Math.round(((i + 0.15) / inputs.length) * 85),
      current: i + 1,
      total: inputs.length,
      fileName: item.name,
    });

    let sourceDoc: PDFDocument;
    try {
      sourceDoc = await PDFDocument.load(item.bytes, { updateMetadata: false });
    } catch (err) {
      throw classifyLoadError(err, item.name);
    }

    const indices = sourceDoc.getPageIndices();
    const copiedPages = await mergedDoc.copyPages(sourceDoc, indices);
    for (const page of copiedPages) {
      mergedDoc.addPage(page);
    }
    totalPages += copiedPages.length;

    onProgress?.({
      percent: Math.round(((i + 1) / inputs.length) * 85),
      current: i + 1,
      total: inputs.length,
      fileName: item.name,
    });
  }

  onProgress?.({
    percent: 92,
    current: inputs.length,
    total: inputs.length,
  });

  const mergedBytes = await mergedDoc.save({ useObjectStreams: true });

  onProgress?.({
    percent: 100,
    current: inputs.length,
    total: inputs.length,
  });

  return {
    bytes: mergedBytes,
    totalPages,
    fileCount: inputs.length,
  };
}
