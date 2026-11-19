import { degrees, PDFDocument } from 'pdf-lib';
import { loadPdfDocumentOrThrow } from '../shared/pdf-loader';
import {
  normalizeRotation,
  RotateReorderError,
  type PagePlanItem,
  type PdfPageMetadata,
} from './plan';

export {
  normalizeRotation,
  RotateReorderError,
  type PagePlanItem,
  type PdfPageMetadata,
  type RotateReorderErrorCode,
  type RotationAngle,
} from './plan';

export interface ApplyPlanResult {
  bytes: Uint8Array;
  pageCount: number;
}

export interface RotateReorderProgress {
  percent: number;
  current: number;
  total: number;
}

function loadPdfDocument(bytes: Uint8Array): Promise<PDFDocument> {
  return loadPdfDocumentOrThrow(bytes, {
    requireNonEmpty: true,
    emptyMessage: 'PDF contains zero pages.',
    createError: (kind, message) => new RotateReorderError(kind, message),
  });
}

export async function inspectPdfPagesMetadata(bytes: Uint8Array): Promise<PdfPageMetadata[]> {
  const doc = await loadPdfDocument(bytes);
  return doc.getPages().map((page, pageIndex) => {
    const { width, height } = page.getSize();
    return {
      pageIndex,
      width,
      height,
      initialRotation: normalizeRotation(page.getRotation().angle),
    };
  });
}

export async function applyPdfPagePlan(
  bytes: Uint8Array,
  plan: PagePlanItem[],
  onProgress?: (info: RotateReorderProgress) => void,
): Promise<ApplyPlanResult> {
  if (plan.length === 0) {
    throw new RotateReorderError('EMPTY_PLAN', 'At least one page must remain in the document.');
  }

  const sourceDoc = await loadPdfDocument(bytes);
  const totalPages = sourceDoc.getPageCount();

  for (const item of plan) {
    if (
      !Number.isInteger(item.sourcePageIndex) ||
      item.sourcePageIndex < 0 ||
      item.sourcePageIndex >= totalPages
    ) {
      throw new RotateReorderError(
        'OUT_OF_RANGE',
        `Page index ${item.sourcePageIndex} is outside document bounds (0..${totalPages - 1}).`,
      );
    }
  }

  const outDoc = await PDFDocument.create();

  for (let i = 0; i < plan.length; i += 1) {
    const item = plan[i];
    onProgress?.({
      percent: Math.round((i / plan.length) * 85),
      current: i + 1,
      total: plan.length,
    });

    const [copiedPage] = await outDoc.copyPages(sourceDoc, [item.sourcePageIndex]);
    const currentAngle = copiedPage.getRotation().angle;
    const nextAngle = normalizeRotation(currentAngle + item.deltaRotation);
    copiedPage.setRotation(degrees(nextAngle));
    outDoc.addPage(copiedPage);
  }

  onProgress?.({ percent: 94, current: plan.length, total: plan.length });
  const outBytes = await outDoc.save({ useObjectStreams: true });
  onProgress?.({ percent: 100, current: plan.length, total: plan.length });

  return {
    bytes: outBytes,
    pageCount: plan.length,
  };
}
