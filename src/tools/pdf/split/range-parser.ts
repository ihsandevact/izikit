export type SplitPdfErrorCode = 'INVALID_RANGE' | 'OUT_OF_RANGE' | 'ENCRYPTED' | 'CORRUPT';

export class SplitPdfError extends Error {
  readonly code: SplitPdfErrorCode;

  constructor(code: SplitPdfErrorCode, message: string) {
    super(message);
    this.name = 'SplitPdfError';
    this.code = code;
  }
}

export interface PageRangeGroup {
  label: string;
  pageIndices: number[];
}

export type SplitMode = 'ranges' | 'all-pages' | 'extract-single';

function parseStrictPositiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export function parsePageRanges(rangeSpec: string, totalPages: number): PageRangeGroup[] {
  const tokens = rangeSpec
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new SplitPdfError('INVALID_RANGE', 'Page range cannot be empty.');
  }

  return tokens.map((token) => {
    if (token.includes('-')) {
      const parts = token.split('-').map((s) => s.trim());
      if (parts.length !== 2) {
        throw new SplitPdfError('INVALID_RANGE', `Invalid range token: ${token}`);
      }
      const start = parseStrictPositiveInt(parts[0]);
      const end = parseStrictPositiveInt(parts[1]);
      if (start === null || end === null || start > end) {
        throw new SplitPdfError('INVALID_RANGE', `Invalid range token: ${token}`);
      }
      if (end > totalPages) {
        throw new SplitPdfError(
          'OUT_OF_RANGE',
          `Page ${end} exceeds document page count (${totalPages}).`,
        );
      }

      const pageIndices: number[] = [];
      for (let page = start; page <= end; page += 1) {
        pageIndices.push(page - 1);
      }
      return { label: `${start}-${end}`, pageIndices };
    }

    const page = parseStrictPositiveInt(token);
    if (page === null) {
      throw new SplitPdfError('INVALID_RANGE', `Invalid page number: ${token}`);
    }
    if (page > totalPages) {
      throw new SplitPdfError(
        'OUT_OF_RANGE',
        `Page ${page} exceeds document page count (${totalPages}).`,
      );
    }
    return { label: `${page}`, pageIndices: [page - 1] };
  });
}
