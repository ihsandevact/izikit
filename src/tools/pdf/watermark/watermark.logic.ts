import { degrees, rgb, StandardFonts } from 'pdf-lib';
import { loadPdfDocumentOrThrow } from '../shared/pdf-loader';
import { parsePageRanges, SplitPdfError } from '../split/range-parser';
import {
  computePageNumberPlacement,
  computeWatermarkPlacements,
  formatPageNumberLabel,
  hexToRgb01,
  validateWatermarkOptions,
  WatermarkPdfError,
  type WatermarkPdfOptions,
} from './plan';

export * from './plan';

export interface WatermarkProgressInfo {
  percent: number;
  current: number;
  total: number;
}

export interface WatermarkPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  modifiedPages: number;
}

function resolveTargetPageSet(
  pageScope: WatermarkPdfOptions['pageScope'],
  rangeSpec: string | undefined,
  totalPages: number,
): Set<number> {
  if (pageScope === 'all') {
    return new Set(Array.from({ length: totalPages }, (_, index) => index));
  }

  try {
    const groups = parsePageRanges(rangeSpec ?? '', totalPages);
    return new Set(groups.flatMap((group) => group.pageIndices));
  } catch (err) {
    if (err instanceof SplitPdfError) {
      const code = err.code === 'OUT_OF_RANGE' ? 'OUT_OF_RANGE' : 'INVALID_RANGE';
      throw new WatermarkPdfError(code, err.message);
    }
    throw new WatermarkPdfError(
      'INVALID_RANGE',
      err instanceof Error ? err.message : String(err),
    );
  }
}

export async function inspectWatermarkPdf(bytes: Uint8Array): Promise<number> {
  const doc = await loadPdfDocumentOrThrow(bytes, {
    requireNonEmpty: true,
    emptyMessage: 'PDF document contains zero pages.',
    createError: (kind, message) => new WatermarkPdfError(kind, message),
  });
  return doc.getPageCount();
}

export async function applyWatermarkAndPageNumbers(
  bytes: Uint8Array,
  options: WatermarkPdfOptions,
  onProgress?: (info: WatermarkProgressInfo) => void,
): Promise<WatermarkPdfResult> {
  validateWatermarkOptions(options);

  const doc = await loadPdfDocumentOrThrow(bytes, {
    requireNonEmpty: true,
    emptyMessage: 'PDF document contains zero pages.',
    createError: (kind, message) => new WatermarkPdfError(kind, message),
  });

  const totalPages = doc.getPageCount();
  const targetPages = resolveTargetPageSet(options.pageScope, options.rangeSpec, totalPages);

  const watermarkFont = options.watermark.enabled
    ? await doc.embedFont(StandardFonts.HelveticaBold)
    : null;
  const pageNumberFont = options.pageNumbers.enabled
    ? await doc.embedFont(StandardFonts.Helvetica)
    : null;

  const wmRgb = options.watermark.enabled ? hexToRgb01(options.watermark.colorHex) : null;
  const pnRgb = options.pageNumbers.enabled ? hexToRgb01(options.pageNumbers.colorHex) : null;
  const watermarkText = options.watermark.text.trim();

  const numberedPageCount = options.pageNumbers.skipFirstPage
    ? Math.max(0, totalPages - 1)
    : totalPages;
  const totalNumberLabel =
    numberedPageCount > 0 ? options.pageNumbers.startNumber + numberedPageCount - 1 : 0;

  let modifiedPages = 0;

  for (let i = 0; i < totalPages; i += 1) {
    onProgress?.({
      percent: Math.round((i / totalPages) * 90),
      current: i + 1,
      total: totalPages,
    });

    if (!targetPages.has(i)) {
      continue;
    }

    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    let pageTouched = false;

    if (options.watermark.enabled && watermarkFont && wmRgb) {
      const textWidth = watermarkFont.widthOfTextAtSize(watermarkText, options.watermark.fontSize);
      const textHeight = watermarkFont.heightAtSize(options.watermark.fontSize);
      const placements = computeWatermarkPlacements({
        pageWidth: width,
        pageHeight: height,
        textWidth,
        textHeight,
        position: options.watermark.position,
        rotationDeg: options.watermark.rotation,
      });

      for (const point of placements) {
        page.drawText(watermarkText, {
          x: point.x,
          y: point.y,
          size: options.watermark.fontSize,
          font: watermarkFont,
          color: rgb(wmRgb.r, wmRgb.g, wmRgb.b),
          opacity: options.watermark.opacity,
          rotate: degrees(options.watermark.rotation),
        });
      }
      pageTouched = true;
    }

    if (options.pageNumbers.enabled && pageNumberFont && pnRgb) {
      const shouldSkip = options.pageNumbers.skipFirstPage && i === 0;
      if (!shouldSkip && numberedPageCount > 0) {
        const offset = options.pageNumbers.skipFirstPage ? i - 1 : i;
        const currentNumber = options.pageNumbers.startNumber + offset;
        const label = formatPageNumberLabel({
          format: options.pageNumbers.format,
          current: currentNumber,
          total: totalNumberLabel,
          ofTemplate: options.pageNumbers.ofTemplate,
        });
        const textWidth = pageNumberFont.widthOfTextAtSize(label, options.pageNumbers.fontSize);
        const textHeight = pageNumberFont.heightAtSize(options.pageNumbers.fontSize);
        const point = computePageNumberPlacement({
          pageWidth: width,
          pageHeight: height,
          textWidth,
          textHeight,
          position: options.pageNumbers.position,
          margin: options.pageNumbers.margin,
        });

        page.drawText(label, {
          x: point.x,
          y: point.y,
          size: options.pageNumbers.fontSize,
          font: pageNumberFont,
          color: rgb(pnRgb.r, pnRgb.g, pnRgb.b),
        });
        pageTouched = true;
      }
    }

    if (pageTouched) {
      modifiedPages += 1;
    }
  }

  const outBytes = await doc.save({ useObjectStreams: true });

  onProgress?.({
    percent: 100,
    current: totalPages,
    total: totalPages,
  });

  return {
    bytes: outBytes,
    pageCount: totalPages,
    modifiedPages,
  };
}
