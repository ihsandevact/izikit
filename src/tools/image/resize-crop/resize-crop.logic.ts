export type ResizeCropErrorCode = 'INVALID_DIMENSIONS';

export class ResizeCropError extends Error {
  readonly code: ResizeCropErrorCode;

  constructor(code: ResizeCropErrorCode, message: string) {
    super(message);
    this.name = 'ResizeCropError';
    this.code = code;
  }
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ResizeCalculationInput {
  sourceWidth: number;
  sourceHeight: number;
  mode: 'pixels' | 'percent';
  width?: number;
  height?: number;
  percent?: number;
  lockAspectRatio?: boolean;
  changedAxis?: 'width' | 'height';
}

export function calculateResizeDimensions(input: ResizeCalculationInput): ImageDimensions {
  if (input.sourceWidth <= 0 || input.sourceHeight <= 0) {
    throw new ResizeCropError('INVALID_DIMENSIONS', 'Source dimensions must be positive.');
  }

  if (input.mode === 'percent') {
    const pct = input.percent ?? 0;
    if (!Number.isFinite(pct) || pct <= 0) {
      throw new ResizeCropError('INVALID_DIMENSIONS', 'Scale percentage must be greater than 0.');
    }
    return {
      width: Math.max(1, Math.round((input.sourceWidth * pct) / 100)),
      height: Math.max(1, Math.round((input.sourceHeight * pct) / 100)),
    };
  }

  const ratio = input.sourceWidth / input.sourceHeight;
  const lock = input.lockAspectRatio ?? true;

  if (lock) {
    if (input.changedAxis === 'height') {
      const targetH = input.height ?? 0;
      if (!Number.isFinite(targetH) || targetH <= 0) {
        throw new ResizeCropError('INVALID_DIMENSIONS', 'Target height must be greater than 0.');
      }
      return {
        width: Math.max(1, Math.round(targetH * ratio)),
        height: Math.max(1, Math.round(targetH)),
      };
    }

    const targetW = input.width ?? 0;
    if (!Number.isFinite(targetW) || targetW <= 0) {
      throw new ResizeCropError('INVALID_DIMENSIONS', 'Target width must be greater than 0.');
    }
    return {
      width: Math.max(1, Math.round(targetW)),
      height: Math.max(1, Math.round(targetW / ratio)),
    };
  }

  const w = input.width ?? 0;
  const h = input.height ?? 0;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new ResizeCropError('INVALID_DIMENSIONS', 'Target width and height must be positive.');
  }

  return {
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
  };
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampCropRect(
  rect: CropRect,
  sourceWidth: number,
  sourceHeight: number,
): CropRect {
  const maxW = Math.max(1, Math.round(sourceWidth));
  const maxH = Math.max(1, Math.round(sourceHeight));

  const x = Math.max(0, Math.min(maxW - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(maxH - 1, Math.round(rect.y)));
  const width = Math.max(1, Math.min(maxW - x, Math.round(rect.width)));
  const height = Math.max(1, Math.min(maxH - y, Math.round(rect.height)));

  return { x, y, width, height };
}

export type CropPreset = 'free' | '1:1' | '16:9' | '4:3' | '3:2';

const PRESET_RATIOS: Record<Exclude<CropPreset, 'free'>, number> = {
  '1:1': 1,
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
};

export function computeCenteredCropPreset(
  sourceWidth: number,
  sourceHeight: number,
  preset: CropPreset,
): CropRect {
  const maxW = Math.max(1, Math.round(sourceWidth));
  const maxH = Math.max(1, Math.round(sourceHeight));

  if (preset === 'free') {
    return { x: 0, y: 0, width: maxW, height: maxH };
  }

  const targetRatio = PRESET_RATIOS[preset];
  const currentRatio = maxW / maxH;

  let width: number;
  let height: number;
  if (currentRatio > targetRatio) {
    height = maxH;
    width = Math.max(1, Math.round(maxH * targetRatio));
  } else {
    width = maxW;
    height = Math.max(1, Math.round(maxW / targetRatio));
  }

  const x = Math.floor((maxW - width) / 2);
  const y = Math.floor((maxH - height) / 2);
  return clampCropRect({ x, y, width, height }, maxW, maxH);
}

export type ImageRotation = 0 | 90 | 180 | 270;

export interface RotatedBounds {
  width: number;
  height: number;
  angle: ImageRotation;
}

export function resolveRotatedBounds(
  width: number,
  height: number,
  angleDegrees: number,
): RotatedBounds {
  const snapped = Math.round(angleDegrees / 90) * 90;
  const angle = (((snapped % 360) + 360) % 360) as ImageRotation;
  const swapped = angle === 90 || angle === 270;

  return {
    width: Math.max(1, Math.round(swapped ? height : width)),
    height: Math.max(1, Math.round(swapped ? width : height)),
    angle,
  };
}
