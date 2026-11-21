export function shouldSkipExtractedImage(
  width: number,
  height: number,
  minDimension = 16,
): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return true;
  return width < minDimension || height < minDimension;
}

/**
 * Normalizes raw pixel buffers returned by pdfjs-dist (RGBA 32bpp, RGB 24bpp,
 * or 8-bit grayscale) into a standard RGBA Uint8ClampedArray for Canvas ImageData.
 */
export function normalizePdfRawImageToRgba(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray | null {
  const pixelCount = width * height;
  if (pixelCount <= 0) return null;

  if (data.length === pixelCount * 4) {
    return new Uint8ClampedArray(data);
  }

  if (data.length === pixelCount * 3) {
    const rgba = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgba[j] = data[i];
      rgba[j + 1] = data[i + 1];
      rgba[j + 2] = data[i + 2];
      rgba[j + 3] = 255;
    }
    return rgba;
  }

  if (data.length === pixelCount) {
    const rgba = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0, j = 0; i < data.length; i += 1, j += 4) {
      const v = data[i];
      rgba[j] = v;
      rgba[j + 1] = v;
      rgba[j + 2] = v;
      rgba[j + 3] = 255;
    }
    return rgba;
  }

  return null;
}

export function buildExtractedImageFilename(
  pdfFilename: string,
  pageNumber: number,
  seqIndex: number,
  ext: 'png' | 'jpg' = 'png',
): string {
  const stem = pdfFilename.replace(/\.pdf$/i, '').trim() || 'dokumen';
  const p = String(pageNumber).padStart(2, '0');
  const idx = String(seqIndex).padStart(2, '0');
  return `${stem}-p${p}-img${idx}.${ext}`;
}
