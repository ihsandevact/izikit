import { mimeToExtension, type SupportedImageMime } from '@/lib/file-validation';
import { parsePageRanges } from '@/tools/pdf/split/range-parser';

export type PdfToImagePageMode = 'all' | 'range';
export type PdfToImageDpi = 150 | 200 | 300;

export function resolvePdfToImagePages(
  mode: PdfToImagePageMode,
  rangeSpec: string,
  totalPages: number,
): number[] {
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    return [];
  }

  if (mode === 'all') {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }

  const groups = parsePageRanges(rangeSpec, totalPages);
  const seen = new Set<number>();
  const ordered: number[] = [];

  for (const group of groups) {
    for (const zeroBasedIndex of group.pageIndices) {
      const oneBased = zeroBasedIndex + 1;
      if (!seen.has(oneBased)) {
        seen.add(oneBased);
        ordered.push(oneBased);
      }
    }
  }

  return ordered;
}

export function normalizePdfToImageQuality(
  qualityPercent: number,
  format: SupportedImageMime,
): number | undefined {
  if (format === 'image/png') {
    return undefined;
  }
  const clamped = Math.max(10, Math.min(100, Math.round(qualityPercent)));
  return clamped / 100;
}

export function buildPdfToImageFilenames(
  originalFilename: string,
  pageNumbers: readonly number[],
  totalPages: number,
  format: SupportedImageMime,
): string[] {
  const stem = originalFilename.replace(/\.pdf$/i, '').trim() || 'dokumen';
  const ext = mimeToExtension(format);
  const padWidth = Math.max(2, String(Math.max(totalPages, 1)).length);

  return pageNumbers.map((pageNum) => {
    const padded = String(pageNum).padStart(padWidth, '0');
    return `${stem}-p${padded}.${ext}`;
  });
}
