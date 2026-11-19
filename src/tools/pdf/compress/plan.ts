export type CompressPdfMode = 'lossless' | 'rasterize';
export type PdfPageSizeTarget = 'keep' | 'a4' | 'letter';
export type RasterizeDpi = 96 | 120 | 150;

export type CompressPdfErrorCode = 'ENCRYPTED' | 'CORRUPT' | 'INVALID_OPTIONS' | 'EMPTY_PAGES';

export class CompressPdfError extends Error {
  readonly code: CompressPdfErrorCode;

  constructor(code: CompressPdfErrorCode, message: string) {
    super(message);
    this.name = 'CompressPdfError';
    this.code = code;
  }
}

export interface CompressPdfOptions {
  mode: CompressPdfMode;
  stripMetadata: boolean;
  pageSize: PdfPageSizeTarget;
  dpi: number;
  jpegQuality: number;
}

export interface PageDimensions {
  width: number;
  height: number;
}

export interface FittedPageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export interface CompressionOutcome {
  keptOriginal: boolean;
  finalBytes: number;
  savedBytes: number;
  savedPercent: number;
}

const A4_PORTRAIT: PageDimensions = { width: 595.28, height: 841.89 };
const LETTER_PORTRAIT: PageDimensions = { width: 612, height: 792 };

export function validateCompressPdfOptions(options: CompressPdfOptions): void {
  if (options.mode !== 'lossless' && options.mode !== 'rasterize') {
    throw new CompressPdfError('INVALID_OPTIONS', `Unsupported compression mode: ${options.mode}`);
  }
  if (options.pageSize !== 'keep' && options.pageSize !== 'a4' && options.pageSize !== 'letter') {
    throw new CompressPdfError('INVALID_OPTIONS', `Unsupported page size target: ${options.pageSize}`);
  }
  if (options.mode === 'rasterize') {
    if (!Number.isFinite(options.dpi) || options.dpi < 72 || options.dpi > 220) {
      throw new CompressPdfError('INVALID_OPTIONS', 'Rasterize DPI must be between 72 and 220.');
    }
    if (
      !Number.isFinite(options.jpegQuality) ||
      options.jpegQuality < 0.35 ||
      options.jpegQuality > 0.95
    ) {
      throw new CompressPdfError(
        'INVALID_OPTIONS',
        'JPEG quality must be between 0.35 and 0.95.',
      );
    }
  }
}

export function resolveTargetPageDimensions(
  sourceWidth: number,
  sourceHeight: number,
  target: PdfPageSizeTarget,
): PageDimensions {
  const safeW = Math.max(1, sourceWidth);
  const safeH = Math.max(1, sourceHeight);

  if (target === 'keep') {
    return { width: safeW, height: safeH };
  }

  const base = target === 'a4' ? A4_PORTRAIT : LETTER_PORTRAIT;
  const isLandscape = safeW > safeH;
  return isLandscape ? { width: base.height, height: base.width } : { ...base };
}

export function computeFittedPageBox(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): FittedPageBox {
  const safeSrcW = Math.max(1, sourceWidth);
  const safeSrcH = Math.max(1, sourceHeight);
  const safeDstW = Math.max(1, targetWidth);
  const safeDstH = Math.max(1, targetHeight);

  const scale = Math.min(safeDstW / safeSrcW, safeDstH / safeSrcH);
  const width = safeSrcW * scale;
  const height = safeSrcH * scale;
  const x = (safeDstW - width) / 2;
  const y = (safeDstH - height) / 2;

  return { x, y, width, height, scale };
}

export function evaluateCompressionOutcome(
  originalBytes: number,
  outputBytes: number,
  resized: boolean,
): CompressionOutcome {
  if (originalBytes <= 0) {
    return {
      keptOriginal: false,
      finalBytes: outputBytes,
      savedBytes: 0,
      savedPercent: 0,
    };
  }

  if (!resized && outputBytes >= originalBytes) {
    return {
      keptOriginal: true,
      finalBytes: originalBytes,
      savedBytes: 0,
      savedPercent: 0,
    };
  }

  const savedBytes = originalBytes - outputBytes;
  const savedPercent = Math.round((savedBytes / originalBytes) * 100);
  return {
    keptOriginal: false,
    finalBytes: outputBytes,
    savedBytes,
    savedPercent,
  };
}
