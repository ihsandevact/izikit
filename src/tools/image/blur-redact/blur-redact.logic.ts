import { mimeToExtension, type SupportedImageMime } from '@/lib/file-validation';

export type RedactionMode = 'pixelate' | 'blur' | 'solid';

export interface RedactionBox {
  id: string;
  /** Normalized 0..1 coordinates relative to image dimensions */
  x: number;
  y: number;
  width: number;
  height: number;
  mode: RedactionMode;
  /** 1..100 intensity for pixelate block size or blur radius */
  intensity: number;
  /** Fill color for solid mode */
  color: string;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_NORMALIZED_SPAN = 0.008;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function normalizeDragRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  canvasWidth: number,
  canvasHeight: number,
): Omit<RedactionBox, 'id' | 'mode' | 'intensity' | 'color'> | null {
  if (canvasWidth <= 0 || canvasHeight <= 0) return null;

  const x1 = clamp01(Math.min(startX, endX) / canvasWidth);
  const y1 = clamp01(Math.min(startY, endY) / canvasHeight);
  const x2 = clamp01(Math.max(startX, endX) / canvasWidth);
  const y2 = clamp01(Math.max(startY, endY) / canvasHeight);

  const width = x2 - x1;
  const height = y2 - y1;

  if (width < MIN_NORMALIZED_SPAN && height < MIN_NORMALIZED_SPAN) {
    return null;
  }

  return { x: x1, y: y1, width, height };
}

export function scaleBoxToPixels(
  box: Pick<RedactionBox, 'x' | 'y' | 'width' | 'height'>,
  imageWidth: number,
  imageHeight: number,
): PixelRect {
  const x = Math.max(0, Math.round(box.x * imageWidth));
  const y = Math.max(0, Math.round(box.y * imageHeight));
  const width = Math.max(1, Math.min(imageWidth - x, Math.round(box.width * imageWidth)));
  const height = Math.max(1, Math.min(imageHeight - y, Math.round(box.height * imageHeight)));
  return { x, y, width, height };
}

export function buildRedactedFilename(
  originalFilename: string,
  outputMime: SupportedImageMime,
): string {
  const stem = originalFilename.replace(/\.[^/.]+$/, '').trim() || 'foto';
  const ext = mimeToExtension(outputMime);
  return `${stem}-sensor.${ext}`;
}
