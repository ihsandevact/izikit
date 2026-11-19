import { PDFDocument } from 'pdf-lib';

export type PdfLoadErrorKind = 'ENCRYPTED' | 'CORRUPT';

export interface LoadPdfOptions<TError extends Error> {
  requireNonEmpty?: boolean;
  emptyMessage?: string;
  createError: (kind: PdfLoadErrorKind, message: string) => TError;
}

/**
 * Loads a PDF buffer via pdf-lib and maps encryption, corruption, or zero-page
 * failures into the caller's domain error class.
 */
export async function loadPdfDocumentOrThrow<TError extends Error>(
  bytes: Uint8Array,
  options: LoadPdfOptions<TError>,
): Promise<PDFDocument> {
  const { requireNonEmpty = false, emptyMessage = 'PDF document contains zero pages.', createError } =
    options;

  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    // Reading page count also validates that the PDF page tree/catalog is intact
    const pageCount = doc.getPageCount();
    if (requireNonEmpty && pageCount < 1) {
      throw createError('CORRUPT', emptyMessage);
    }
    return doc;
  } catch (err) {
    if (err instanceof Error && err.name !== 'Error' && err.name !== 'TypeError' && 'code' in err) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    const kind: PdfLoadErrorKind = /encrypt/i.test(message) ? 'ENCRYPTED' : 'CORRUPT';
    throw createError(kind, message);
  }
}
