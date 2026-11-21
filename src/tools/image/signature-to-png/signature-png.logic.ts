export type SignatureInkMode = 'original' | 'black' | 'blue' | 'navy';

export interface SignatureCleanupOptions {
  /** Luminance threshold (80..245). Pixels brighter than this become fully transparent. */
  threshold: number;
  /** Transition width (10..80) below threshold for smooth anti-aliased edges. */
  softness: number;
  inkMode: SignatureInkMode;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const INK_RGB: Record<Exclude<SignatureInkMode, 'original'>, [number, number, number]> = {
  black: [15, 23, 42], // #0F172A
  blue: [29, 78, 216], // #1D4ED8
  navy: [30, 58, 138], // #1E3A8A
};

/**
 * Converts a photographed paper signature RGBA buffer into a clean transparent PNG buffer.
 * Bright paper pixels become alpha=0 while darker ink strokes keep crisp anti-aliased alpha.
 */
export function cleanSignatureRgba(
  source: Uint8ClampedArray,
  options: SignatureCleanupOptions,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(source.length);
  const threshold = Math.max(60, Math.min(250, options.threshold));
  const softness = Math.max(5, Math.min(100, options.softness));
  const lowCut = Math.max(0, threshold - softness);
  const recolor = options.inkMode === 'original' ? null : INK_RGB[options.inkMode];

  for (let i = 0; i < source.length; i += 4) {
    const r = source[i];
    const g = source[i + 1];
    const b = source[i + 2];
    const a = source[i + 3];

    if (a === 0) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum >= threshold) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }

    let alphaFactor = 1;
    if (lum > lowCut && threshold > lowCut) {
      alphaFactor = (threshold - lum) / (threshold - lowCut);
    }

    const nextAlpha = Math.round(a * alphaFactor);
    if (recolor) {
      out[i] = recolor[0];
      out[i + 1] = recolor[1];
      out[i + 2] = recolor[2];
    } else {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
    out[i + 3] = nextAlpha;
  }

  return out;
}

/**
 * Finds the tight bounding box of visible pixels (alpha >= alphaCutoff) with optional padding.
 */
export function findOpaqueBoundingBox(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  paddingPx = 12,
  alphaCutoff = 12,
): BoundingBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      if (alpha >= alphaCutoff) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const pad = Math.max(0, Math.round(paddingPx));
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const right = Math.min(width, maxX + 1 + pad);
  const bottom = Math.min(height, maxY + 1 + pad);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

export function buildSignaturePngFilename(originalFilename?: string | null): string {
  if (!originalFilename) return 'tanda-tangan-transparan.png';
  const stem = originalFilename.replace(/\.[^/.]+$/, '').trim() || 'tanda-tangan';
  return `${stem}-transparan.png`;
}
