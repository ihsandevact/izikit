export type RemoveBgEngine = 'ai-onnx' | 'color-key';
export type RefineBrushMode = 'none' | 'erase' | 'restore';
export type RemoveBgOutputFormat = 'image/png' | 'image/webp' | 'image/jpeg';

export type RemoveBgErrorCode = 'INVALID_OPTIONS' | 'MODEL_LOAD_FAILED';

export class RemoveBgError extends Error {
  readonly code: RemoveBgErrorCode;

  constructor(code: RemoveBgErrorCode, message: string) {
    super(message);
    this.name = 'RemoveBgError';
    this.code = code;
  }
}

export interface Rgb255 {
  r: number;
  g: number;
  b: number;
}

export interface ColorKeyMaskOptions {
  keyColor: Rgb255;
  /** 1..100 */
  tolerance: number;
  /** 0..50 */
  feather: number;
}

export interface BrushStrokeParams {
  mode: 'erase' | 'restore';
  centerX: number;
  centerY: number;
  radiusPx: number;
}

export function hexToRgb255(hex: string): Rgb255 {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) {
    throw new RemoveBgError('INVALID_OPTIONS', `Invalid hex color: ${hex}`);
  }
  const raw = match[1];
  const full =
    raw.length === 3
      ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
      : raw;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

export function rgb255ToHex(rgb: Rgb255): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

export function detectCornerKeyColor(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Rgb255 {
  if (width < 1 || height < 1 || rgba.length < 4) {
    return { r: 255, g: 255, b: 255 };
  }

  const coords: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];

  // Pick the corner color that is closest to the other corners (medoid)
  const samples: Rgb255[] = coords.map(([x, y]) => {
    const idx = (y * width + x) * 4;
    return { r: rgba[idx], g: rgba[idx + 1], b: rgba[idx + 2] };
  });

  let bestIdx = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < samples.length; i += 1) {
    let distSum = 0;
    for (let j = 0; j < samples.length; j += 1) {
      const dr = samples[i].r - samples[j].r;
      const dg = samples[i].g - samples[j].g;
      const db = samples[i].b - samples[j].b;
      distSum += Math.sqrt(dr * dr + dg * dg + db * db);
    }
    if (distSum < bestScore) {
      bestScore = distSum;
      bestIdx = i;
    }
  }

  return samples[bestIdx];
}

export function validateRemoveBgOptions(options: {
  engine: RemoveBgEngine;
  tolerance: number;
  feather: number;
}): void {
  if (options.engine !== 'ai-onnx' && options.engine !== 'color-key') {
    throw new RemoveBgError('INVALID_OPTIONS', `Unknown engine: ${options.engine}`);
  }
  if (!Number.isFinite(options.tolerance) || options.tolerance < 1 || options.tolerance > 100) {
    throw new RemoveBgError('INVALID_OPTIONS', 'Tolerance must be between 1 and 100.');
  }
  if (!Number.isFinite(options.feather) || options.feather < 0 || options.feather > 60) {
    throw new RemoveBgError('INVALID_OPTIONS', 'Feather must be between 0 and 60.');
  }
}

/**
 * Generates an alpha mask (1 byte per pixel, 0..255) by keying out pixels close
 * to keyColor with smooth feather transition.
 */
export function computeColorKeyAlphaMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: ColorKeyMaskOptions,
): Uint8ClampedArray {
  const pixelCount = width * height;
  const mask = new Uint8ClampedArray(pixelCount);

  // Max Euclidean distance in RGB cube is ~441.67
  const innerRadius = (options.tolerance / 100) * 260;
  const outerRadius = innerRadius + Math.max(1, (options.feather / 100) * 180);
  const { r: kr, g: kg, b: kb } = options.keyColor;

  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * 4;
    const origA = rgba[base + 3];
    if (origA === 0) {
      mask[i] = 0;
      continue;
    }

    const dr = rgba[base] - kr;
    const dg = rgba[base + 1] - kg;
    const db = rgba[base + 2] - kb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist <= innerRadius) {
      mask[i] = 0;
    } else if (dist >= outerRadius) {
      mask[i] = origA;
    } else {
      const ratio = (dist - innerRadius) / (outerRadius - innerRadius);
      mask[i] = Math.round(origA * ratio);
    }
  }

  return mask;
}

export function extractAlphaChannelFromRgba(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const pixelCount = Math.floor(rgba.length / 4);
  const mask = new Uint8ClampedArray(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    mask[i] = rgba[i * 4 + 3];
  }
  return mask;
}

export function applyBrushStrokeToMask(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  stroke: BrushStrokeParams,
): Uint8ClampedArray {
  const next = new Uint8ClampedArray(mask);
  const r = Math.max(1, stroke.radiusPx);
  const rSq = r * r;
  const targetVal = stroke.mode === 'erase' ? 0 : 255;

  const minX = Math.max(0, Math.floor(stroke.centerX - r));
  const maxX = Math.min(width - 1, Math.ceil(stroke.centerX + r));
  const minY = Math.max(0, Math.floor(stroke.centerY - r));
  const maxY = Math.min(height - 1, Math.ceil(stroke.centerY + r));

  for (let y = minY; y <= maxY; y += 1) {
    const dy = y - stroke.centerY;
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - stroke.centerX;
      if (dx * dx + dy * dy <= rSq) {
        next[y * width + x] = targetVal;
      }
    }
  }

  return next;
}

/**
 * Combines original RGB pixels with a 1-channel alpha mask and optional solid background hex color.
 */
export function composeRgbaWithAlphaMask(
  originalRgba: Uint8ClampedArray,
  alphaMask: Uint8ClampedArray,
  backgroundColor: 'transparent' | string,
): Uint8ClampedArray {
  const pixelCount = alphaMask.length;
  const out = new Uint8ClampedArray(pixelCount * 4);

  if (backgroundColor === 'transparent') {
    for (let i = 0; i < pixelCount; i += 1) {
      const base = i * 4;
      out[base] = originalRgba[base];
      out[base + 1] = originalRgba[base + 1];
      out[base + 2] = originalRgba[base + 2];
      out[base + 3] = alphaMask[i];
    }
    return out;
  }

  const bg = hexToRgb255(backgroundColor);
  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * 4;
    const alpha = alphaMask[i] / 255;
    const inv = 1 - alpha;
    out[base] = Math.round(originalRgba[base] * alpha + bg.r * inv);
    out[base + 1] = Math.round(originalRgba[base + 1] * alpha + bg.g * inv);
    out[base + 2] = Math.round(originalRgba[base + 2] * alpha + bg.b * inv);
    out[base + 3] = 255;
  }
  return out;
}
