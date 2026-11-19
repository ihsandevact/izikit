import type { SupportedImageMime } from '../../../lib/file-validation';

function extensionForMime(mime: SupportedImageMime): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export type ImageWatermarkKind = 'text' | 'logo';

export type ImageWatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'tiled';

export type ImageWatermarkFormatChoice = 'original' | SupportedImageMime;

export type ImageWatermarkErrorCode = 'EMPTY_TEXT' | 'MISSING_LOGO' | 'INVALID_OPTIONS';

export class ImageWatermarkError extends Error {
  readonly code: ImageWatermarkErrorCode;

  constructor(code: ImageWatermarkErrorCode, message: string) {
    super(message);
    this.name = 'ImageWatermarkError';
    this.code = code;
  }
}

export interface ImageWatermarkOptions {
  kind: ImageWatermarkKind;
  text: string;
  fontPercent: number;
  colorHex: string;
  textShadow: boolean;
  logoScalePercent: number;
  opacity: number;
  rotation: number;
  position: ImageWatermarkPosition;
  marginPercent: number;
  outputFormat: ImageWatermarkFormatChoice;
  quality: number;
}

export interface CenterPoint {
  cx: number;
  cy: number;
}

export function validateImageWatermarkOptions(
  options: ImageWatermarkOptions,
  hasLogo: boolean,
): void {
  if (options.kind === 'text') {
    if (!options.text.trim()) {
      throw new ImageWatermarkError('EMPTY_TEXT', 'Watermark text cannot be empty.');
    }
    if (
      !Number.isFinite(options.fontPercent) ||
      options.fontPercent < 1 ||
      options.fontPercent > 25
    ) {
      throw new ImageWatermarkError('INVALID_OPTIONS', 'Font scale must be between 1% and 25%.');
    }
  } else {
    if (!hasLogo) {
      throw new ImageWatermarkError('MISSING_LOGO', 'Upload a logo image to apply logo watermark.');
    }
    if (
      !Number.isFinite(options.logoScalePercent) ||
      options.logoScalePercent < 5 ||
      options.logoScalePercent > 70
    ) {
      throw new ImageWatermarkError(
        'INVALID_OPTIONS',
        'Logo scale must be between 5% and 70%.',
      );
    }
  }

  if (!Number.isFinite(options.opacity) || options.opacity < 0.05 || options.opacity > 1) {
    throw new ImageWatermarkError('INVALID_OPTIONS', 'Opacity must be between 0.05 and 1.');
  }
  if (!Number.isFinite(options.rotation) || options.rotation < -180 || options.rotation > 180) {
    throw new ImageWatermarkError('INVALID_OPTIONS', 'Rotation must be between -180 and 180.');
  }
  if (!Number.isFinite(options.quality) || options.quality < 10 || options.quality > 100) {
    throw new ImageWatermarkError('INVALID_OPTIONS', 'Quality must be between 10 and 100.');
  }
}

export function computeProportionalFontPx(
  imageWidth: number,
  imageHeight: number,
  fontPercent: number,
): number {
  const ref = Math.max(1, Math.max(imageWidth, imageHeight * 0.85));
  return Math.max(12, Math.round((ref * fontPercent) / 100));
}

export function computeLogoDrawBox(
  imageWidth: number,
  imageHeight: number,
  logoWidth: number,
  logoHeight: number,
  scalePercent: number,
): { width: number; height: number } {
  const safeLogoW = Math.max(1, logoWidth);
  const safeLogoH = Math.max(1, logoHeight);
  const aspect = safeLogoW / safeLogoH;

  let targetW = Math.max(12, (imageWidth * scalePercent) / 100);
  let targetH = targetW / aspect;

  const maxW = Math.max(12, imageWidth * 0.9);
  const maxH = Math.max(12, imageHeight * 0.9);

  if (targetW > maxW) {
    targetW = maxW;
    targetH = targetW / aspect;
  }
  if (targetH > maxH) {
    targetH = maxH;
    targetW = targetH * aspect;
  }

  return {
    width: Math.max(1, Math.round(targetW)),
    height: Math.max(1, Math.round(targetH)),
  };
}

export function computeImageWatermarkCenters(params: {
  imageWidth: number;
  imageHeight: number;
  boxWidth: number;
  boxHeight: number;
  position: ImageWatermarkPosition;
  marginPercent: number;
}): CenterPoint[] {
  const { imageWidth, imageHeight, boxWidth, boxHeight, position, marginPercent } = params;
  const marginX = Math.round((imageWidth * marginPercent) / 100);
  const marginY = Math.round((imageHeight * marginPercent) / 100);

  if (position === 'tiled') {
    const stepX = Math.max(boxWidth * 1.6, imageWidth / 3, 120);
    const stepY = Math.max(boxHeight * 2.8, imageHeight / 3.5, 110);
    const points: CenterPoint[] = [];
    let row = 0;
    for (let cy = stepY * 0.45; cy < imageHeight + stepY * 0.25; cy += stepY) {
      const stagger = row % 2 === 1 ? stepX * 0.5 : 0;
      for (let cx = stepX * 0.45 + stagger; cx < imageWidth + stepX * 0.25; cx += stepX) {
        points.push({ cx: Math.round(cx), cy: Math.round(cy) });
      }
      row += 1;
    }
    if (points.length === 0) {
      points.push({ cx: Math.round(imageWidth / 2), cy: Math.round(imageHeight / 2) });
    }
    return points;
  }

  const leftX = Math.min(imageWidth / 2, marginX + boxWidth / 2);
  const rightX = Math.max(imageWidth / 2, imageWidth - marginX - boxWidth / 2);
  const topY = Math.min(imageHeight / 2, marginY + boxHeight / 2);
  const bottomY = Math.max(imageHeight / 2, imageHeight - marginY - boxHeight / 2);

  let cx = imageWidth / 2;
  let cy = imageHeight / 2;

  if (position.includes('left')) cx = leftX;
  else if (position.includes('right')) cx = rightX;

  if (position.startsWith('top-')) cy = topY;
  else if (position.startsWith('bottom-')) cy = bottomY;

  return [{ cx: Math.round(cx), cy: Math.round(cy) }];
}

export function resolveOutputImageMime(
  inputMime: SupportedImageMime,
  choice: ImageWatermarkFormatChoice,
): SupportedImageMime {
  return choice === 'original' ? inputMime : choice;
}

export function buildUniqueWatermarkedNames(
  items: Array<{
    name: string;
    inputMime: SupportedImageMime;
    outputFormat: ImageWatermarkFormatChoice;
  }>,
): string[] {
  const counts = new Map<string, number>();

  return items.map((item) => {
    const outMime = resolveOutputImageMime(item.inputMime, item.outputFormat);
    const ext = extensionForMime(outMime);
    const stem = item.name.replace(/\.[^/.]+$/, '').trim() || 'image';
    const base = `${stem}-watermarked`;
    const key = `${base.toLowerCase()}.${ext}`;
    const seen = counts.get(key) ?? 0;
    counts.set(key, seen + 1);
    return seen === 0 ? `${base}.${ext}` : `${base}-${seen + 1}.${ext}`;
  });
}
