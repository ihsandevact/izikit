import { PDFDocument } from 'pdf-lib';
import {
  computePortraitCoverCrop,
  type PassportSheetLayout,
} from './passport-grid.logic';

export interface SheetRenderOptions {
  showCropMarks: boolean;
  showBorder: boolean;
}

export function drawPassportSheetOnCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  layout: PassportSheetLayout,
  options: SheetRenderOptions,
  targetWidthPx: number,
  targetHeightPx: number,
) {
  canvas.width = targetWidthPx;
  canvas.height = targetHeightPx;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Clean white photo paper background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidthPx, targetHeightPx);

  const pxPerMmX = targetWidthPx / layout.paperWidthMm;
  const pxPerMmY = targetHeightPx / layout.paperHeightMm;
  const crop = computePortraitCoverCrop(
    image.naturalWidth,
    image.naturalHeight,
    layout.photoWidthMm / layout.photoHeightMm,
  );

  for (const cell of layout.cells) {
    const x = Math.round(cell.xMm * pxPerMmX);
    const y = Math.round(cell.yMm * pxPerMmY);
    const w = Math.round(cell.widthMm * pxPerMmX);
    const h = Math.round(cell.heightMm * pxPerMmY);

    ctx.drawImage(image, crop.sx, crop.sy, crop.sWidth, crop.sHeight, x, y, w, h);

    if (options.showBorder) {
      ctx.save();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = Math.max(1, Math.round(pxPerMmX * 0.18));
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    if (options.showCropMarks) {
      const markLen = Math.max(4, Math.round(pxPerMmX * 1.4));
      const offset = Math.max(1, Math.round(pxPerMmX * 0.35));
      ctx.save();
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = Math.max(1, Math.round(pxPerMmX * 0.16));
      ctx.beginPath();
      // Top-left
      ctx.moveTo(x - offset - markLen, y);
      ctx.lineTo(x - offset, y);
      ctx.moveTo(x, y - offset - markLen);
      ctx.lineTo(x, y - offset);
      // Top-right
      ctx.moveTo(x + w + offset, y);
      ctx.lineTo(x + w + offset + markLen, y);
      ctx.moveTo(x + w, y - offset - markLen);
      ctx.lineTo(x + w, y - offset);
      // Bottom-left
      ctx.moveTo(x - offset - markLen, y + h);
      ctx.lineTo(x - offset, y + h);
      ctx.moveTo(x, y + h + offset);
      ctx.lineTo(x, y + h + offset + markLen);
      // Bottom-right
      ctx.moveTo(x + w + offset, y + h);
      ctx.lineTo(x + w + offset + markLen, y + h);
      ctx.moveTo(x + w, y + h + offset);
      ctx.lineTo(x + w, y + h + offset + markLen);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export async function renderPassportSheetJpegBlob(
  image: HTMLImageElement,
  layout: PassportSheetLayout,
  options: SheetRenderOptions,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawPassportSheetOnCanvas(
    canvas,
    image,
    layout,
    options,
    layout.paperWidthPx,
    layout.paperHeightPx,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) {
          reject(new Error('Failed to encode passport photo sheet JPEG.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.95,
    );
  });
}

export async function renderPassportSheetPdfBlob(
  image: HTMLImageElement,
  layout: PassportSheetLayout,
  options: SheetRenderOptions,
): Promise<Blob> {
  const jpegBlob = await renderPassportSheetJpegBlob(image, layout, options);
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

  const pdfDoc = await PDFDocument.create();
  const embedded = await pdfDoc.embedJpg(jpegBytes);
  const page = pdfDoc.addPage([layout.paperWidthPt, layout.paperHeightPt]);
  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: layout.paperWidthPt,
    height: layout.paperHeightPt,
  });

  const pdfBytes = await pdfDoc.save();
  const safeBuffer = pdfBytes.slice().buffer;
  return new Blob([safeBuffer], { type: 'application/pdf' });
}
