import { PDFDocument } from 'pdf-lib';
import {
  parsePageRanges,
  SplitPdfError,
  type PageRangeGroup,
  type SplitMode,
} from './range-parser';

export {
  parsePageRanges,
  SplitPdfError,
  type PageRangeGroup,
  type SplitMode,
  type SplitPdfErrorCode,
} from './range-parser';

export interface SplitPdfOptions {
  mode: SplitMode;
  rangeSpec?: string;
  baseName: string;
}

export interface SplitPdfOutput {
  filename: string;
  label: string;
  pageCount: number;
  bytes: Uint8Array;
}

export interface SplitProgressInfo {
  percent: number;
  current: number;
  total: number;
  label?: string;
}

async function loadSourcePdf(bytes: Uint8Array): Promise<{ doc: PDFDocument; totalPages: number }> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const totalPages = doc.getPageCount();
    if (totalPages < 1) {
      throw new SplitPdfError('CORRUPT', 'PDF document contains zero pages.');
    }
    return { doc, totalPages };
  } catch (err) {
    if (err instanceof SplitPdfError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (/encrypt/i.test(message)) {
      throw new SplitPdfError('ENCRYPTED', message);
    }
    throw new SplitPdfError('CORRUPT', message);
  }
}

export async function inspectSplitPdfPages(bytes: Uint8Array): Promise<number> {
  const { totalPages } = await loadSourcePdf(bytes);
  return totalPages;
}

export async function splitPdfDocument(
  bytes: Uint8Array,
  options: SplitPdfOptions,
  onProgress?: (info: SplitProgressInfo) => void,
): Promise<SplitPdfOutput[]> {
  const { doc: sourceDoc, totalPages } = await loadSourcePdf(bytes);
  const safeBase = options.baseName.replace(/\.pdf$/i, '').trim() || 'document';
  let groups: PageRangeGroup[];

  if (options.mode === 'all-pages') {
    groups = Array.from({ length: totalPages }, (_, index) => ({
      label: `${index + 1}`,
      pageIndices: [index],
    }));
  } else if (options.mode === 'extract-single') {
    const parsed = parsePageRanges(options.rangeSpec ?? '', totalPages);
    groups = [
      {
        label: 'extracted',
        pageIndices: parsed.flatMap((g) => g.pageIndices),
      },
    ];
  } else {
    groups = parsePageRanges(options.rangeSpec ?? '', totalPages);
  }

  const outputs: SplitPdfOutput[] = [];
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    onProgress?.({
      percent: Math.round((i / groups.length) * 90),
      current: i + 1,
      total: groups.length,
      label: group.label,
    });

    const outDoc = await PDFDocument.create();
    const copied = await outDoc.copyPages(sourceDoc, group.pageIndices);
    for (const page of copied) {
      outDoc.addPage(page);
    }
    const outBytes = await outDoc.save({ useObjectStreams: true });
    const suffix =
      options.mode === 'extract-single'
        ? 'extracted'
        : group.pageIndices.length > 1
          ? `pages-${group.label}`
          : `page-${group.label}`;
    outputs.push({
      filename: `${safeBase}-${suffix}.pdf`,
      label: group.label,
      pageCount: copied.length,
      bytes: outBytes,
    });
  }

  onProgress?.({
    percent: 100,
    current: groups.length,
    total: groups.length,
  });

  return outputs;
}
