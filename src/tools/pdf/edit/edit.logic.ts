import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { loadPdfDocumentOrThrow } from '../shared/pdf-loader';
import {
  EditPdfError,
  hexToRgb01,
  normalizedRectToPdfRect,
  normalizedTextOriginToPdf,
  validateAnnotations,
  type WorkerPdfAnnotation,
} from './plan';

export * from './plan';

export interface EditPdfPageSize {
  width: number;
  height: number;
}

export interface EditPdfInspectInfo {
  pageCount: number;
  pageSizes: EditPdfPageSize[];
}

export interface EditPdfProgressInfo {
  percent: number;
  current: number;
  total: number;
}

export interface RasterizedPageOverride {
  jpegBytes: Uint8Array;
  widthPt: number;
  heightPt: number;
}

export interface ApplyEditOptions {
  rasterizedPageOverrides?: Record<number, RasterizedPageOverride>;
}

export interface ApplyEditResult {
  bytes: Uint8Array;
  pageCount: number;
  modifiedPages: number;
}

export async function inspectEditPdf(bytes: Uint8Array): Promise<EditPdfInspectInfo> {
  const doc = await loadPdfDocumentOrThrow(bytes, {
    requireNonEmpty: true,
    emptyMessage: 'PDF document contains zero pages.',
    createError: (kind, message) => new EditPdfError(kind, message),
  });

  const pageCount = doc.getPageCount();
  const pageSizes: EditPdfPageSize[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const { width, height } = doc.getPage(i).getSize();
    pageSizes.push({ width, height });
  }

  return { pageCount, pageSizes };
}

export async function applyPdfAnnotations(
  bytes: Uint8Array,
  annotations: readonly WorkerPdfAnnotation[],
  options?: ApplyEditOptions,
  onProgress?: (info: EditPdfProgressInfo) => void,
): Promise<ApplyEditResult> {
  const sourceDoc = await loadPdfDocumentOrThrow(bytes, {
    requireNonEmpty: true,
    emptyMessage: 'PDF document contains zero pages.',
    createError: (kind, message) => new EditPdfError(kind, message),
  });

  const totalPages = sourceDoc.getPageCount();
  validateAnnotations(annotations, totalPages);

  const overrides = options?.rasterizedPageOverrides ?? {};
  const hasAnyOverride = Object.keys(overrides).length > 0;

  // Use a fresh PDFDocument when replacing any redacted page with a rasterized page
  // so no hidden underlying text streams survive from the source page.
  const outDoc = hasAnyOverride ? await PDFDocument.create() : sourceDoc;

  if (hasAnyOverride) {
    const title = sourceDoc.getTitle();
    const author = sourceDoc.getAuthor();
    const subject = sourceDoc.getSubject();
    if (title) outDoc.setTitle(title);
    if (author) outDoc.setAuthor(author);
    if (subject) outDoc.setSubject(subject);
  }

  const hasText = annotations.some((a) => a.type === 'text');
  const font = hasText ? await outDoc.embedFont(StandardFonts.Helvetica) : null;

  const byPage = new Map<number, WorkerPdfAnnotation[]>();
  for (const item of annotations) {
    const list = byPage.get(item.pageIndex) ?? [];
    list.push(item);
    byPage.set(item.pageIndex, list);
  }

  let modifiedPages = 0;

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    onProgress?.({
      percent: Math.round((pageIndex / totalPages) * 90),
      current: pageIndex + 1,
      total: totalPages,
    });

    const override = overrides[pageIndex];
    if (hasAnyOverride && override) {
      const jpg = await outDoc.embedJpg(override.jpegBytes);
      const page = outDoc.addPage([override.widthPt, override.heightPt]);
      page.drawImage(jpg, {
        x: 0,
        y: 0,
        width: override.widthPt,
        height: override.heightPt,
      });
      modifiedPages += 1;
      continue;
    }

    const page = hasAnyOverride
      ? (await outDoc.copyPages(sourceDoc, [pageIndex]))[0]
      : outDoc.getPage(pageIndex);

    if (hasAnyOverride) {
      outDoc.addPage(page);
    }

    const pageAnnotations = byPage.get(pageIndex);
    if (!pageAnnotations || pageAnnotations.length === 0) {
      continue;
    }

    const { width: pageWidth, height: pageHeight } = page.getSize();

    // Layer order: highlight -> redact -> signature -> text
    const highlights = pageAnnotations.filter((a) => a.type === 'highlight');
    const redacts = pageAnnotations.filter((a) => a.type === 'redact');
    const signatures = pageAnnotations.filter((a) => a.type === 'signature');
    const texts = pageAnnotations.filter((a) => a.type === 'text');

    for (const hl of highlights) {
      const rect = normalizedRectToPdfRect(hl, pageWidth, pageHeight);
      const color = hexToRgb01(hl.colorHex);
      page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: rgb(color.r, color.g, color.b),
        opacity: hl.opacity,
      });
    }

    for (const rd of redacts) {
      const rect = normalizedRectToPdfRect(rd, pageWidth, pageHeight);
      const color = hexToRgb01(rd.colorHex);
      page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: rgb(color.r, color.g, color.b),
        opacity: 1,
      });
    }

    for (const sig of signatures) {
      const rect = normalizedRectToPdfRect(sig, pageWidth, pageHeight);
      const embedded =
        sig.imageMime === 'image/png'
          ? await outDoc.embedPng(sig.imageBytes)
          : await outDoc.embedJpg(sig.imageBytes);
      page.drawImage(embedded, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    }

    if (font) {
      for (const txt of texts) {
        const origin = normalizedTextOriginToPdf(txt, txt.fontSize, pageWidth, pageHeight);
        const color = hexToRgb01(txt.colorHex);
        const lines = txt.text.trim().split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
          const line = lines[lineIdx];
          if (!line) continue;
          const yPos = origin.y - lineIdx * txt.fontSize * 1.25;
          if (yPos < 2) break;
          page.drawText(line, {
            x: origin.x,
            y: yPos,
            size: txt.fontSize,
            font,
            color: rgb(color.r, color.g, color.b),
          });
        }
      }
    }

    modifiedPages += 1;
  }

  const outBytes = await outDoc.save({ useObjectStreams: true });
  onProgress?.({ percent: 100, current: totalPages, total: totalPages });

  return {
    bytes: outBytes,
    pageCount: totalPages,
    modifiedPages,
  };
}
