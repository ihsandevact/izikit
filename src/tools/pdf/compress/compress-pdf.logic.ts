import { PDFDocument } from 'pdf-lib';
import { loadPdfDocumentOrThrow } from '../shared/pdf-loader';
import {
  computeFittedPageBox,
  CompressPdfError,
  evaluateCompressionOutcome,
  resolveTargetPageDimensions,
  validateCompressPdfOptions,
  type CompressPdfOptions,
  type PdfPageSizeTarget,
} from './plan';

export * from './plan';

export interface CompressPdfInspectInfo {
  pageCount: number;
  firstPageWidth: number;
  firstPageHeight: number;
}

export interface CompressPdfProgressInfo {
  percent: number;
  current: number;
  total: number;
}

export interface CompressPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  originalBytes: number;
  finalBytes: number;
  savedBytes: number;
  savedPercent: number;
  keptOriginal: boolean;
}

export interface RasterizedPageInput {
  jpegBytes: Uint8Array;
  widthPt: number;
  heightPt: number;
}

function applyMetadataPolicy(
  sourceDoc: PDFDocument | null,
  outDoc: PDFDocument,
  stripMetadata: boolean,
): void {
  if (stripMetadata || !sourceDoc) {
    outDoc.setTitle('');
    outDoc.setAuthor('');
    outDoc.setSubject('');
    outDoc.setKeywords([]);
    outDoc.setCreator('');
    outDoc.setProducer('');
    return;
  }

  const title = sourceDoc.getTitle();
  const author = sourceDoc.getAuthor();
  const subject = sourceDoc.getSubject();
  const keywords = sourceDoc.getKeywords();
  const creator = sourceDoc.getCreator();
  const producer = sourceDoc.getProducer();

  if (title) outDoc.setTitle(title);
  if (author) outDoc.setAuthor(author);
  if (subject) outDoc.setSubject(subject);
  if (keywords) outDoc.setKeywords(keywords.split(/[,;\s]+/).filter(Boolean));
  if (creator) outDoc.setCreator(creator);
  if (producer) outDoc.setProducer(producer);
}

export async function inspectCompressPdf(bytes: Uint8Array): Promise<CompressPdfInspectInfo> {
  const doc = await loadPdfDocumentOrThrow(bytes, {
    requireNonEmpty: true,
    emptyMessage: 'PDF document contains zero pages.',
    createError: (kind, message) => new CompressPdfError(kind, message),
  });

  const pageCount = doc.getPageCount();
  const firstSize = doc.getPage(0).getSize();
  return {
    pageCount,
    firstPageWidth: Math.round(firstSize.width),
    firstPageHeight: Math.round(firstSize.height),
  };
}

export async function optimizePdfStructure(
  bytes: Uint8Array,
  options: CompressPdfOptions,
  onProgress?: (info: CompressPdfProgressInfo) => void,
): Promise<CompressPdfResult> {
  validateCompressPdfOptions(options);

  const sourceDoc = await loadPdfDocumentOrThrow(bytes, {
    requireNonEmpty: true,
    emptyMessage: 'PDF document contains zero pages.',
    createError: (kind, message) => new CompressPdfError(kind, message),
  });

  const totalPages = sourceDoc.getPageCount();
  const outDoc = await PDFDocument.create();
  applyMetadataPolicy(sourceDoc, outDoc, options.stripMetadata);

  const isResizing = options.pageSize !== 'keep';

  if (!isResizing) {
    const indices = Array.from({ length: totalPages }, (_, index) => index);
    onProgress?.({ percent: 25, current: 0, total: totalPages });
    const copiedPages = await outDoc.copyPages(sourceDoc, indices);
    for (let i = 0; i < copiedPages.length; i += 1) {
      outDoc.addPage(copiedPages[i]);
      onProgress?.({
        percent: 25 + Math.round(((i + 1) / totalPages) * 60),
        current: i + 1,
        total: totalPages,
      });
    }
  } else {
    for (let i = 0; i < totalPages; i += 1) {
      const sourcePage = sourceDoc.getPage(i);
      const srcSize = sourcePage.getSize();
      const targetSize = resolveTargetPageDimensions(
        srcSize.width,
        srcSize.height,
        options.pageSize,
      );
      const box = computeFittedPageBox(
        srcSize.width,
        srcSize.height,
        targetSize.width,
        targetSize.height,
      );

      const embedded = await outDoc.embedPage(sourcePage);
      const outPage = outDoc.addPage([targetSize.width, targetSize.height]);
      outPage.drawPage(embedded, {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      });

      onProgress?.({
        percent: Math.round(((i + 1) / totalPages) * 85),
        current: i + 1,
        total: totalPages,
      });
    }
  }

  const candidateBytes = await outDoc.save({ useObjectStreams: true });
  const outcome = evaluateCompressionOutcome(
    bytes.byteLength,
    candidateBytes.byteLength,
    isResizing,
  );

  onProgress?.({ percent: 100, current: totalPages, total: totalPages });

  return {
    bytes: outcome.keptOriginal ? bytes : candidateBytes,
    pageCount: totalPages,
    originalBytes: bytes.byteLength,
    finalBytes: outcome.finalBytes,
    savedBytes: outcome.savedBytes,
    savedPercent: outcome.savedPercent,
    keptOriginal: outcome.keptOriginal,
  };
}

export async function buildRasterizedPdfFromJpegs(
  pages: RasterizedPageInput[],
  options: {
    originalByteLength: number;
    pageSize: PdfPageSizeTarget;
    stripMetadata: boolean;
  },
  onProgress?: (info: CompressPdfProgressInfo) => void,
): Promise<CompressPdfResult> {
  if (pages.length === 0) {
    throw new CompressPdfError('EMPTY_PAGES', 'No rendered pages provided for PDF assembly.');
  }

  const outDoc = await PDFDocument.create();
  applyMetadataPolicy(null, outDoc, options.stripMetadata);

  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i += 1) {
    const item = pages[i];
    const targetSize = resolveTargetPageDimensions(
      item.widthPt,
      item.heightPt,
      options.pageSize,
    );
    const box = computeFittedPageBox(
      item.widthPt,
      item.heightPt,
      targetSize.width,
      targetSize.height,
    );

    const jpgImage = await outDoc.embedJpg(item.jpegBytes);
    const page = outDoc.addPage([targetSize.width, targetSize.height]);
    page.drawImage(jpgImage, {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    });

    onProgress?.({
      percent: Math.round(((i + 1) / totalPages) * 90),
      current: i + 1,
      total: totalPages,
    });
  }

  const outBytes = await outDoc.save({ useObjectStreams: true });
  const isResizing = options.pageSize !== 'keep';
  const outcome = evaluateCompressionOutcome(
    options.originalByteLength,
    outBytes.byteLength,
    isResizing,
  );

  onProgress?.({ percent: 100, current: totalPages, total: totalPages });

  return {
    bytes: outBytes,
    pageCount: totalPages,
    originalBytes: options.originalByteLength,
    finalBytes: outcome.finalBytes,
    savedBytes: outcome.savedBytes,
    savedPercent: outcome.savedPercent,
    keptOriginal: outcome.keptOriginal,
  };
}
