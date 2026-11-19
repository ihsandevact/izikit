import { PDFDocument, type PDFImage } from 'pdf-lib';
import {
  computeImagePlacement,
  ImageToPdfError,
  type EmbeddableImageMime,
  type ImageToPdfOptions,
} from './layout';

export {
  computeImagePlacement,
  ImageToPdfError,
  type EmbeddableImageMime,
  type ImagePlacement,
  type ImageToPdfErrorCode,
  type ImageToPdfOptions,
  type OrientationOption,
  type PaperSizeOption,
  type PlacementInput,
} from './layout';

export interface ImageToPdfInputItem {
  name: string;
  mime: EmbeddableImageMime;
  bytes: Uint8Array;
}

export interface ImageToPdfResult {
  bytes: Uint8Array;
  pageCount: number;
}

export interface ImageToPdfProgress {
  percent: number;
  current: number;
  total: number;
  fileName?: string;
}

export async function buildImageToPdf(
  items: ImageToPdfInputItem[],
  options: ImageToPdfOptions,
  onProgress?: (info: ImageToPdfProgress) => void,
): Promise<ImageToPdfResult> {
  if (items.length === 0) {
    throw new ImageToPdfError('EMPTY_INPUT', 'At least one image is required.');
  }

  const doc = await PDFDocument.create();

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    onProgress?.({
      percent: Math.round((i / items.length) * 85),
      current: i + 1,
      total: items.length,
      fileName: item.name,
    });

    let embedded: PDFImage;
    try {
      embedded =
        item.mime === 'image/jpeg'
          ? await doc.embedJpg(item.bytes)
          : await doc.embedPng(item.bytes);
    } catch (err) {
      throw new ImageToPdfError(
        'CORRUPT_IMAGE',
        err instanceof Error ? err.message : 'Unable to decode image bytes.',
        item.name,
      );
    }

    const placement = computeImagePlacement({
      imageWidth: embedded.width,
      imageHeight: embedded.height,
      paperSize: options.paperSize,
      orientation: options.orientation,
      marginPt: options.marginPt,
    });

    const page = doc.addPage([placement.pageWidth, placement.pageHeight]);
    page.drawImage(embedded, {
      x: placement.x,
      y: placement.y,
      width: placement.drawWidth,
      height: placement.drawHeight,
    });
  }

  onProgress?.({ percent: 94, current: items.length, total: items.length });
  const bytes = await doc.save({ useObjectStreams: true });
  onProgress?.({ percent: 100, current: items.length, total: items.length });

  return {
    bytes,
    pageCount: items.length,
  };
}
