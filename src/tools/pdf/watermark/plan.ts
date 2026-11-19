export type WatermarkPosition =
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'tiled';

export type PageNumberPosition =
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'top-right'
  | 'top-left';

export type PageNumberFormat = 'number' | 'slash' | 'of';

export type WatermarkPageScope = 'all' | 'custom';

export type WatermarkPdfErrorCode =
  | 'ENCRYPTED'
  | 'CORRUPT'
  | 'NOTHING_ENABLED'
  | 'EMPTY_WATERMARK'
  | 'UNSUPPORTED_CHARACTERS'
  | 'INVALID_OPTIONS'
  | 'INVALID_RANGE'
  | 'OUT_OF_RANGE';

export class WatermarkPdfError extends Error {
  readonly code: WatermarkPdfErrorCode;

  constructor(code: WatermarkPdfErrorCode, message: string) {
    super(message);
    this.name = 'WatermarkPdfError';
    this.code = code;
  }
}

export interface TextWatermarkConfig {
  enabled: boolean;
  text: string;
  opacity: number;
  fontSize: number;
  rotation: number;
  position: WatermarkPosition;
  colorHex: string;
}

export interface PageNumbersConfig {
  enabled: boolean;
  format: PageNumberFormat;
  position: PageNumberPosition;
  startNumber: number;
  skipFirstPage: boolean;
  fontSize: number;
  margin: number;
  colorHex: string;
  ofTemplate?: {
    prefix: string;
    connector: string;
  };
}

export interface WatermarkPdfOptions {
  watermark: TextWatermarkConfig;
  pageNumbers: PageNumbersConfig;
  pageScope: WatermarkPageScope;
  rangeSpec?: string;
}

export interface Rgb01 {
  r: number;
  g: number;
  b: number;
}

export interface Point2D {
  x: number;
  y: number;
}

// Extra Unicode code points included in Windows-1252 (WinAnsi) beyond 0x20-0x7E and 0xA0-0xFF.
const WINANSI_EXTRA_CODEPOINTS = new Set([
  0x20ac, // €
  0x201a, // ‚
  0x0192, // ƒ
  0x201e, // „
  0x2026, // …
  0x2020, // †
  0x2021, // ‡
  0x02c6, // ˆ
  0x2030, // ‰
  0x0160, // Š
  0x2039, // ‹
  0x0152, // Œ
  0x017d, // Ž
  0x2018, // ‘
  0x2019, // ’
  0x201c, // “
  0x201d, // ”
  0x2022, // •
  0x2013, // –
  0x2014, // —
  0x02dc, // ˜
  0x2122, // ™
  0x0161, // š
  0x203a, // ›
  0x0153, // œ
  0x017e, // ž
  0x0178, // Ÿ
]);

export function isWinAnsiText(text: string): boolean {
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
  const trimmed = hex.trim();
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(trimmed);
  if (!match) {
    throw new WatermarkPdfError('INVALID_OPTIONS', `Invalid hex color: ${hex}`);
  }
  const raw = match[1];
  const full =
    raw.length === 3
      ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
      : raw;
  const r = Number.parseInt(full.slice(0, 2), 16) / 255;
  const g = Number.parseInt(full.slice(2, 4), 16) / 255;
  const b = Number.parseInt(full.slice(4, 6), 16) / 255;
  return { r, g, b };
}

export function validateWatermarkOptions(options: WatermarkPdfOptions): void {
  if (!options.watermark.enabled && !options.pageNumbers.enabled) {
    throw new WatermarkPdfError(
      'NOTHING_ENABLED',
      'Enable at least text watermark or page numbers before processing.',
    );
  }

  if (options.watermark.enabled) {
    const trimmedText = options.watermark.text.trim();
    if (!trimmedText) {
      throw new WatermarkPdfError('EMPTY_WATERMARK', 'Watermark text cannot be empty.');
    }
    if (!isWinAnsiText(trimmedText)) {
      throw new WatermarkPdfError(
        'UNSUPPORTED_CHARACTERS',
        'Watermark text contains characters not supported by standard PDF Latin fonts.',
      );
    }
    if (
      !Number.isFinite(options.watermark.opacity) ||
      options.watermark.opacity < 0.05 ||
      options.watermark.opacity > 1
    ) {
      throw new WatermarkPdfError('INVALID_OPTIONS', 'Watermark opacity must be between 0.05 and 1.');
    }
    if (
      !Number.isFinite(options.watermark.fontSize) ||
      options.watermark.fontSize < 8 ||
      options.watermark.fontSize > 160
    ) {
      throw new WatermarkPdfError('INVALID_OPTIONS', 'Watermark font size must be between 8 and 160.');
    }
    if (
      !Number.isFinite(options.watermark.rotation) ||
      options.watermark.rotation < -180 ||
      options.watermark.rotation > 180
    ) {
      throw new WatermarkPdfError('INVALID_OPTIONS', 'Watermark rotation must be between -180 and 180.');
    }
    hexToRgb01(options.watermark.colorHex);
  }

  if (options.pageNumbers.enabled) {
    if (!Number.isInteger(options.pageNumbers.startNumber) || options.pageNumbers.startNumber < 1) {
      throw new WatermarkPdfError('INVALID_OPTIONS', 'Start page number must be an integer >= 1.');
    }
    if (
      !Number.isFinite(options.pageNumbers.fontSize) ||
      options.pageNumbers.fontSize < 6 ||
      options.pageNumbers.fontSize > 48
    ) {
      throw new WatermarkPdfError('INVALID_OPTIONS', 'Page number font size must be between 6 and 48.');
    }
    if (
      !Number.isFinite(options.pageNumbers.margin) ||
      options.pageNumbers.margin < 8 ||
      options.pageNumbers.margin > 144
    ) {
      throw new WatermarkPdfError('INVALID_OPTIONS', 'Page number margin must be between 8 and 144.');
    }
    if (options.pageNumbers.ofTemplate) {
      const sample = `${options.pageNumbers.ofTemplate.prefix} ${options.pageNumbers.ofTemplate.connector}`;
      if (!isWinAnsiText(sample)) {
        throw new WatermarkPdfError(
          'UNSUPPORTED_CHARACTERS',
          'Page number template contains unsupported characters.',
        );
      }
    }
    hexToRgb01(options.pageNumbers.colorHex);
  }
}

export function formatPageNumberLabel(params: {
  format: PageNumberFormat;
  current: number;
  total: number;
  ofTemplate?: { prefix: string; connector: string };
}): string {
  const { format, current, total, ofTemplate } = params;
  if (format === 'number') {
    return String(current);
  }
  if (format === 'slash') {
    return `${current} / ${total}`;
  }
  const prefix = ofTemplate?.prefix ?? 'Page';
  const connector = ofTemplate?.connector ?? 'of';
  return `${prefix} ${current} ${connector} ${total}`;
}

function anchorFromCenter(
  cx: number,
  cy: number,
  textWidth: number,
  textHeight: number,
  rotationDeg: number,
): Point2D {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = (textWidth / 2) * cos - (textHeight / 2) * sin;
  const dy = (textWidth / 2) * sin + (textHeight / 2) * cos;
  return {
    x: cx - dx,
    y: cy - dy,
  };
}

export function computeWatermarkPlacements(params: {
  pageWidth: number;
  pageHeight: number;
  textWidth: number;
  textHeight: number;
  position: WatermarkPosition;
  rotationDeg: number;
  margin?: number;
}): Point2D[] {
  const { pageWidth, pageHeight, textWidth, textHeight, position, rotationDeg } = params;
  const margin = params.margin ?? 44;

  if (position === 'tiled') {
    const stepX = Math.max(textWidth * 1.45, pageWidth / 3, 140);
    const stepY = Math.max(textHeight * 3.2, pageHeight / 4, 140);
    const points: Point2D[] = [];
    let row = 0;
    for (let cy = stepY * 0.5; cy < pageHeight + stepY * 0.25; cy += stepY) {
      const stagger = row % 2 === 1 ? stepX * 0.5 : 0;
      for (let cx = stepX * 0.45 + stagger; cx < pageWidth + stepX * 0.25; cx += stepX) {
        points.push(anchorFromCenter(cx, cy, textWidth, textHeight, rotationDeg));
      }
      row += 1;
    }
    if (points.length === 0) {
      points.push(
        anchorFromCenter(pageWidth / 2, pageHeight / 2, textWidth, textHeight, rotationDeg),
      );
    }
    return points;
  }

  let cx = pageWidth / 2;
  let cy = pageHeight / 2;
  const insetX = Math.min(pageWidth * 0.28, Math.max(margin + textWidth / 2, pageWidth * 0.18));
  const insetY = Math.min(pageHeight * 0.22, Math.max(margin + textHeight / 2, pageHeight * 0.14));

  switch (position) {
    case 'top-left':
      cx = insetX;
      cy = pageHeight - insetY;
      break;
    case 'top-right':
      cx = pageWidth - insetX;
      cy = pageHeight - insetY;
      break;
    case 'bottom-left':
      cx = insetX;
      cy = insetY;
      break;
    case 'bottom-right':
      cx = pageWidth - insetX;
      cy = insetY;
      break;
    case 'center':
    default:
      cx = pageWidth / 2;
      cy = pageHeight / 2;
      break;
  }

  return [anchorFromCenter(cx, cy, textWidth, textHeight, rotationDeg)];
}

export function computePageNumberPlacement(params: {
  pageWidth: number;
  pageHeight: number;
  textWidth: number;
  textHeight: number;
  position: PageNumberPosition;
  margin: number;
}): Point2D {
  const { pageWidth, pageHeight, textWidth, textHeight, position, margin } = params;

  const isTop = position.startsWith('top-');
  const y = isTop ? Math.max(margin, pageHeight - margin - textHeight) : margin;

  if (position.endsWith('-left')) {
    return { x: margin, y };
  }
  if (position.endsWith('-right')) {
    return { x: Math.max(margin, pageWidth - margin - textWidth), y };
  }
  return { x: Math.max(margin, (pageWidth - textWidth) / 2), y };
}
