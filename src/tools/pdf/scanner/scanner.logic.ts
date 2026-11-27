import { PDFDocument } from 'pdf-lib';

export type ScanFilterKey = 'magic-color' | 'bw-document' | 'grayscale' | 'original';
export type ScanPageSizeKey = 'a4' | 'letter' | 'fit';
export type ScanPageMarginKey = 'none' | 'small' | 'normal';

export interface ScanAdjustments {
  brightness: number; // -40 to +40
  contrast: number; // -40 to +60
}

export interface ScanPagePlacement {
  pageWidth: number;
  pageHeight: number;
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
}

export interface ScannedPageBinary {
  jpegBytes: Uint8Array;
  width: number;
  height: number;
}

const A4_PT = { width: 595.28, height: 841.89 };
const LETTER_PT = { width: 612, height: 792 };

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Pure RGBA pixel filter for document scanning (Magic Color, B&W Document, Grayscale, Original).
 * Mutates `data` in place for zero-allocation speed and returns it.
 */
export function applyScanFilterToPixels(
  data: Uint8ClampedArray,
  filter: ScanFilterKey,
  adjustments: ScanAdjustments = { brightness: 0, contrast: 0 },
): Uint8ClampedArray {
  const len = data.length;
  if (len === 0) return data;

  const pixelCount = len / 4;
  const brightOffset = (adjustments.brightness / 100) * 140;
  const contrastFactor = Math.pow((100 + adjustments.contrast) / 100, 1.45);

  if (filter === 'original') {
    if (adjustments.brightness === 0 && adjustments.contrast === 0) {
      return data;
    }
    for (let i = 0; i < len; i += 4) {
      data[i] = clampByte((data[i] - 128) * contrastFactor + 128 + brightOffset);
      data[i + 1] = clampByte((data[i + 1] - 128) * contrastFactor + 128 + brightOffset);
      data[i + 2] = clampByte((data[i + 2] - 128) * contrastFactor + 128 + brightOffset);
    }
    return data;
  }

  // Compute luminance histogram for automatic black/white point normalization
  const hist = new Uint32Array(256);
  for (let i = 0; i < len; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[lum] += 1;
  }

  const lowTarget = Math.floor(pixelCount * 0.02);
  const highTarget = Math.floor(pixelCount * 0.94);

  let acc = 0;
  let minLum = 0;
  let maxLum = 255;
  for (let v = 0; v < 256; v += 1) {
    acc += hist[v];
    if (acc >= lowTarget) {
      minLum = v;
      break;
    }
  }
  acc = 0;
  for (let v = 0; v < 256; v += 1) {
    acc += hist[v];
    if (acc >= highTarget) {
      maxLum = v;
      break;
    }
  }

  const range = Math.max(24, maxLum - minLum);

  if (filter === 'bw-document') {
    // Clean high-contrast paper whitening + crisp dark ink
    const midPoint = minLum + range * 0.62 - brightOffset * 0.65;
    const slope = 4.2 * contrastFactor;
    for (let i = 0; i < len; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Soft S-curve around threshold so text edges remain anti-aliased instead of jagged
      const centered = (lum - midPoint) * slope + 128;
      const out = clampByte(centered);
      data[i] = out;
      data[i + 1] = out;
      data[i + 2] = out;
    }
    return data;
  }

  if (filter === 'grayscale') {
    const stretch = 255 / range;
    for (let i = 0; i < len; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const norm = (lum - minLum) * stretch;
      const out = clampByte((norm - 128) * (1.12 * contrastFactor) + 132 + brightOffset);
      data[i] = out;
      data[i + 1] = out;
      data[i + 2] = out;
    }
    return data;
  }

  // 'magic-color': brightens paper background to crisp white while preserving ink/stamp colors
  const stretch = 255 / range;
  const colorBoost = 1.18 * contrastFactor;
  for (let i = 0; i < len; i += 4) {
    const r = (data[i] - minLum) * stretch;
    const g = (data[i + 1] - minLum) * stretch;
    const b = (data[i + 2] - minLum) * stretch;

    const rAdj = (r - 128) * colorBoost + 138 + brightOffset;
    const gAdj = (g - 128) * colorBoost + 138 + brightOffset;
    const bAdj = (b - 128) * colorBoost + 138 + brightOffset;

    data[i] = clampByte(rAdj);
    data[i + 1] = clampByte(gAdj);
    data[i + 2] = clampByte(bAdj);
  }
  return data;
}

export function getMarginPoints(margin: ScanPageMarginKey): number {
  if (margin === 'none') return 0;
  if (margin === 'small') return 18;
  return 36;
}

/**
 * Computes PDF page dimensions (auto-orienting portrait/landscape for A4/Letter)
 * and centered fit rectangle for the scanned image.
 */
export function computeScanPagePlacement(
  imgWidth: number,
  imgHeight: number,
  pageSize: ScanPageSizeKey,
  margin: ScanPageMarginKey,
): ScanPagePlacement {
  const safeW = Math.max(1, imgWidth);
  const safeH = Math.max(1, imgHeight);
  const marginPt = getMarginPoints(margin);

  if (pageSize === 'fit') {
    // Convert pixel dimensions to points assuming 150 DPI
    const scalePt = 72 / 150;
    const drawW = Math.max(72, safeW * scalePt);
    const drawH = Math.max(72, safeH * scalePt);
    return {
      pageWidth: drawW + marginPt * 2,
      pageHeight: drawH + marginPt * 2,
      drawX: marginPt,
      drawY: marginPt,
      drawW,
      drawH,
    };
  }

  const base = pageSize === 'letter' ? LETTER_PT : A4_PT;
  const isLandscape = safeW > safeH * 1.05;
  const pageWidth = isLandscape ? base.height : base.width;
  const pageHeight = isLandscape ? base.width : base.height;

  const availW = Math.max(20, pageWidth - marginPt * 2);
  const availH = Math.max(20, pageHeight - marginPt * 2);
  const scale = Math.min(availW / safeW, availH / safeH);

  const drawW = safeW * scale;
  const drawH = safeH * scale;

  return {
    pageWidth,
    pageHeight,
    drawX: (pageWidth - drawW) / 2,
    drawY: (pageHeight - drawH) / 2,
    drawW,
    drawH,
  };
}

/**
 * Combines scanned JPEG pages into a clean multi-page PDF document via pdf-lib.
 */
export async function buildScannedPdfBytes(
  pages: readonly ScannedPageBinary[],
  options: { pageSize: ScanPageSizeKey; margin: ScanPageMarginKey },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  for (const item of pages) {
    const jpg = await doc.embedJpg(item.jpegBytes);
    const placement = computeScanPagePlacement(
      item.width,
      item.height,
      options.pageSize,
      options.margin,
    );
    const page = doc.addPage([placement.pageWidth, placement.pageHeight]);
    page.drawImage(jpg, {
      x: placement.drawX,
      y: placement.drawY,
      width: placement.drawW,
      height: placement.drawH,
    });
  }

  return doc.save({ useObjectStreams: true });
}

export function buildScannerFilename(pageCount: number, locale: 'id' | 'en'): string {
  const count = Math.max(1, pageCount);
  return locale === 'id'
    ? `scan-dokumen-${count}-halaman.pdf`
    : `scanned-document-${count}-${count === 1 ? 'page' : 'pages'}.pdf`;
}
