export type PaperSizeOption = 'a4' | 'letter' | 'fit';
export type OrientationOption = 'auto' | 'portrait' | 'landscape';
export type EmbeddableImageMime = 'image/png' | 'image/jpeg';
export type ImageToPdfErrorCode = 'EMPTY_INPUT' | 'CORRUPT_IMAGE';

export class ImageToPdfError extends Error {
  readonly code: ImageToPdfErrorCode;
  readonly fileName?: string;

  constructor(code: ImageToPdfErrorCode, message: string, fileName?: string) {
    super(message);
    this.name = 'ImageToPdfError';
    this.code = code;
    this.fileName = fileName;
  }
}

export interface PlacementInput {
  imageWidth: number;
  imageHeight: number;
  paperSize: PaperSizeOption;
  orientation: OrientationOption;
  marginPt: number;
}

export interface ImagePlacement {
  pageWidth: number;
  pageHeight: number;
  drawWidth: number;
  drawHeight: number;
  x: number;
  y: number;
}

export interface ImageToPdfOptions {
  paperSize: PaperSizeOption;
  orientation: OrientationOption;
  marginPt: number;
}

const STANDARD_PAPER_PT: Record<'a4' | 'letter', [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

export function computeImagePlacement(input: PlacementInput): ImagePlacement {
  const margin = Math.max(0, input.marginPt);

  if (input.paperSize === 'fit') {
    return {
      pageWidth: input.imageWidth + margin * 2,
      pageHeight: input.imageHeight + margin * 2,
      drawWidth: input.imageWidth,
      drawHeight: input.imageHeight,
      x: margin,
      y: margin,
    };
  }

  const [baseW, baseH] = STANDARD_PAPER_PT[input.paperSize];
  const isLandscape =
    input.orientation === 'landscape' ||
    (input.orientation === 'auto' && input.imageWidth > input.imageHeight);

  const pageWidth = isLandscape ? baseH : baseW;
  const pageHeight = isLandscape ? baseW : baseH;
  const maxW = Math.max(1, pageWidth - margin * 2);
  const maxH = Math.max(1, pageHeight - margin * 2);
  const scale = Math.min(maxW / input.imageWidth, maxH / input.imageHeight);
  const drawWidth = input.imageWidth * scale;
  const drawHeight = input.imageHeight * scale;

  return {
    pageWidth,
    pageHeight,
    drawWidth,
    drawHeight,
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
  };
}
