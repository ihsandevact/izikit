import { describe, expect, it } from 'vitest';
import {
  buildExtractedImageFilename,
  normalizePdfRawImageToRgba,
  shouldSkipExtractedImage,
} from '@/tools/pdf/extract-images/extract-pdf-images.logic';

describe('extract-pdf-images.logic', () => {
  it('filters out micro spacer artifacts below minimum dimension', () => {
    expect(shouldSkipExtractedImage(1, 1)).toBe(true);
    expect(shouldSkipExtractedImage(12, 40)).toBe(true);
    expect(shouldSkipExtractedImage(64, 64)).toBe(false);
  });

  it('normalizes RGB 24bpp and 8-bit grayscale PDF raw buffers into RGBA', () => {
    // 2 pixels RGB: (10, 20, 30) and (255, 0, 128)
    const rgb = new Uint8Array([10, 20, 30, 255, 0, 128]);
    const rgbaFromRgb = normalizePdfRawImageToRgba(rgb, 2, 1);
    expect(Array.from(rgbaFromRgb ?? [])).toEqual([10, 20, 30, 255, 255, 0, 128, 255]);

    // 2 pixels grayscale: 100 and 200
    const gray = new Uint8Array([100, 200]);
    const rgbaFromGray = normalizePdfRawImageToRgba(gray, 2, 1);
    expect(Array.from(rgbaFromGray ?? [])).toEqual([100, 100, 100, 255, 200, 200, 200, 255]);
  });

  it('builds zero-padded extracted image filenames', () => {
    expect(buildExtractedImageFilename('katalog.pdf', 3, 7, 'png')).toBe('katalog-p03-img07.png');
    expect(buildExtractedImageFilename('brochure.PDF', 12, 1, 'jpg')).toBe('brochure-p12-img01.jpg');
  });
});
