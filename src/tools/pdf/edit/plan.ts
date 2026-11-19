export type EditToolMode = 'select' | 'text' | 'highlight' | 'redact' | 'signature';

export type EditPdfErrorCode =
  | 'ENCRYPTED'
  | 'CORRUPT'
  | 'NO_ANNOTATIONS'
  | 'OUT_OF_RANGE'
  | 'EMPTY_TEXT'
  | 'UNSUPPORTED_CHARACTERS'
  | 'INVALID_OPTIONS';

export class EditPdfError extends Error {
  readonly code: EditPdfErrorCode;

  constructor(code: EditPdfErrorCode, message: string) {
    super(message);
    this.name = 'EditPdfError';
    this.code = code;
  }
}

export interface TextAnnotationInput {
  id: string;
  type: 'text';
  pageIndex: number;
  /** Normalized 0..1 from top-left of page */
  x: number;
  y: number;
  text: string;
  fontSize: number;
  colorHex: string;
}

export interface HighlightAnnotationInput {
  id: string;
  type: 'highlight';
  pageIndex: number;
  /** Normalized 0..1 from top-left of page */
  x: number;
  y: number;
  width: number;
  height: number;
  colorHex: string;
  opacity: number;
}

export interface RedactAnnotationInput {
  id: string;
  type: 'redact';
  pageIndex: number;
  /** Normalized 0..1 from top-left of page */
  x: number;
  y: number;
  width: number;
  height: number;
  colorHex: string;
}

export interface SignatureAnnotationBase {
  id: string;
  type: 'signature';
  pageIndex: number;
  /** Normalized 0..1 from top-left of page */
  x: number;
  y: number;
  width: number;
  height: number;
  imageMime: 'image/png' | 'image/jpeg';
  label?: string;
}

export interface SignatureAnnotationUi extends SignatureAnnotationBase {
  imageDataUrl: string;
}

export interface SignatureAnnotationWorker extends SignatureAnnotationBase {
  imageBytes: Uint8Array;
}

export type PdfAnnotationInput =
  | TextAnnotationInput
  | HighlightAnnotationInput
  | RedactAnnotationInput
  | SignatureAnnotationBase;

export type UiPdfAnnotation =
  | TextAnnotationInput
  | HighlightAnnotationInput
  | RedactAnnotationInput
  | SignatureAnnotationUi;

export type WorkerPdfAnnotation =
  | TextAnnotationInput
  | HighlightAnnotationInput
  | RedactAnnotationInput
  | SignatureAnnotationWorker;

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rgb01 {
  r: number;
  g: number;
  b: number;
}

const WINANSI_EXTRA_CODEPOINTS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

export function isEditWinAnsiText(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined) return false;
    const isAscii = code >= 0x20 && code <= 0x7e;
    const isLatin1 = code >= 0xa0 && code <= 0xff;
    if (!isAscii && !isLatin1 && !WINANSI_EXTRA_CODEPOINTS.has(code)) {
      return false;
    }
  }
  return true;
}

export function hexToRgb01(hex: string): Rgb01 {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) {
    throw new EditPdfError('INVALID_OPTIONS', `Invalid hex color: ${hex}`);
  }
  const raw = match[1];
  const full =
    raw.length === 3
      ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
      : raw;
  return {
    r: Number.parseInt(full.slice(0, 2), 16) / 255,
    g: Number.parseInt(full.slice(2, 4), 16) / 255,
    b: Number.parseInt(full.slice(4, 6), 16) / 255,
  };
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function normalizedRectToPdfRect(
  rect: NormalizedRect,
  pageWidth: number,
  pageHeight: number,
): PdfRect {
  const x = clamp01(rect.x) * pageWidth;
  const width = Math.max(1, clamp01(rect.width) * pageWidth);
  const height = Math.max(1, clamp01(rect.height) * pageHeight);
  const y = Math.max(0, pageHeight - (clamp01(rect.y) + clamp01(rect.height)) * pageHeight);
  return { x, y, width, height };
}

export function normalizedTextOriginToPdf(
  point: { x: number; y: number },
  fontSize: number,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number } {
  const x = clamp01(point.x) * pageWidth;
  const y = Math.max(4, pageHeight - clamp01(point.y) * pageHeight - fontSize * 0.85);
  return { x, y };
}

export function validateAnnotations(
  annotations: readonly PdfAnnotationInput[],
  totalPages: number,
): void {
  if (annotations.length === 0) {
    throw new EditPdfError('NO_ANNOTATIONS', 'Add at least one annotation before saving.');
  }

  for (const item of annotations) {
    if (!Number.isInteger(item.pageIndex) || item.pageIndex < 0 || item.pageIndex >= totalPages) {
      throw new EditPdfError(
        'OUT_OF_RANGE',
        `Annotation targets page ${item.pageIndex + 1}, outside document range (1-${totalPages}).`,
      );
    }

    if (item.type === 'text') {
      const trimmed = item.text.trim();
      if (!trimmed) {
        throw new EditPdfError('EMPTY_TEXT', 'Text annotation cannot be empty.');
      }
      if (!isEditWinAnsiText(trimmed)) {
        throw new EditPdfError(
          'UNSUPPORTED_CHARACTERS',
          'Text contains characters unsupported by standard PDF fonts.',
        );
      }
      if (!Number.isFinite(item.fontSize) || item.fontSize < 6 || item.fontSize > 96) {
        throw new EditPdfError('INVALID_OPTIONS', 'Font size must be between 6 and 96 pt.');
      }
      hexToRgb01(item.colorHex);
    } else if (item.type === 'highlight') {
      if (item.width <= 0 || item.height <= 0) {
        throw new EditPdfError('INVALID_OPTIONS', 'Highlight dimensions must be positive.');
      }
      if (!Number.isFinite(item.opacity) || item.opacity <= 0 || item.opacity > 1) {
        throw new EditPdfError('INVALID_OPTIONS', 'Highlight opacity must be between 0 and 1.');
      }
      hexToRgb01(item.colorHex);
    } else if (item.type === 'redact') {
      if (item.width <= 0 || item.height <= 0) {
        throw new EditPdfError('INVALID_OPTIONS', 'Redact dimensions must be positive.');
      }
      hexToRgb01(item.colorHex);
    } else if (item.type === 'signature') {
      if (item.width <= 0 || item.height <= 0) {
        throw new EditPdfError('INVALID_OPTIONS', 'Signature dimensions must be positive.');
      }
      if (item.imageMime !== 'image/png' && item.imageMime !== 'image/jpeg') {
        throw new EditPdfError('INVALID_OPTIONS', 'Signature image must be PNG or JPEG.');
      }
    }
  }
}

export function getRedactedPageIndices(annotations: readonly PdfAnnotationInput[]): number[] {
  const pages = new Set<number>();
  for (const item of annotations) {
    if (item.type === 'redact') {
      pages.add(item.pageIndex);
    }
  }
  return [...pages].sort((a, b) => a - b);
}
