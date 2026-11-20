import { describe, expect, it } from 'vitest';
import {
  buildPdfToImageFilenames,
  normalizePdfToImageQuality,
  resolvePdfToImagePages,
} from '@/tools/pdf/pdf-to-image/pdf-to-image.logic';

describe('pdf-to-image.logic', () => {
  it('resolves all pages or deduplicated range pages in order', () => {
    expect(resolvePdfToImagePages('all', '', 4)).toEqual([1, 2, 3, 4]);
    expect(resolvePdfToImagePages('range', '1-2, 4, 2-3', 5)).toEqual([1, 2, 4, 3]);
    expect(() => resolvePdfToImagePages('range', '1-8', 5)).toThrow();
    expect(() => resolvePdfToImagePages('range', '', 5)).toThrow();
  });

  it('normalizes quality for lossy formats and returns undefined for PNG', () => {
    expect(normalizePdfToImageQuality(90, 'image/jpeg')).toBeCloseTo(0.9, 4);
    expect(normalizePdfToImageQuality(85, 'image/webp')).toBeCloseTo(0.85, 4);
    expect(normalizePdfToImageQuality(5, 'image/jpeg')).toBeCloseTo(0.1, 4);
    expect(normalizePdfToImageQuality(80, 'image/png')).toBeUndefined();
  });

  it('builds zero-padded filenames matching total page count width', () => {
    expect(buildPdfToImageFilenames('laporan.pdf', [1, 3, 12], 12, 'image/jpeg')).toEqual([
      'laporan-p01.jpg',
      'laporan-p03.jpg',
      'laporan-p12.jpg',
    ]);
    expect(buildPdfToImageFilenames('buku.PDF', [1, 105], 120, 'image/webp')).toEqual([
      'buku-p001.webp',
      'buku-p105.webp',
    ]);
  });
});
