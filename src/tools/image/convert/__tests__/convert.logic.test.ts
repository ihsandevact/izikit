import { describe, expect, it } from 'vitest';
import {
  buildConversionPlan,
  ConvertImageError,
  deduplicateOutputNames,
  normalizeQuality,
} from '@/tools/image/convert/convert.logic';

describe('convert.logic', () => {
  it('normalizes quality percent into 0.1-1.0 for lossy formats and undefined for PNG', () => {
    expect(normalizeQuality(85, 'image/webp')).toBeCloseTo(0.85, 4);
    expect(normalizeQuality(5, 'image/jpeg')).toBeCloseTo(0.1, 4);
    expect(normalizeQuality(140, 'image/jpeg')).toBeCloseTo(1.0, 4);
    expect(normalizeQuality(80, 'image/png')).toBeUndefined();
    expect(() => normalizeQuality(Number.NaN, 'image/webp')).toThrowError(ConvertImageError);
  });

  it('replaces extensions and deduplicates colliding output filenames case-insensitively', () => {
    const names = deduplicateOutputNames(
      ['photo.png', 'photo.jpg', 'PHOTO.webp', 'banner.png'],
      'image/webp',
    );

    expect(names).toEqual(['photo.webp', 'photo-2.webp', 'PHOTO-3.webp', 'banner.webp']);
  });

  it('builds conversion jobs with transparency background fill rules and rejects empty batches', () => {
    const jobs = buildConversionPlan(
      [
        { id: '1', name: 'logo.png', mime: 'image/png' },
        { id: '2', name: 'logo.jpg', mime: 'image/jpeg' },
      ],
      { targetFormat: 'image/jpeg', quality: 90, jpegBackground: '#FFFFFF' },
    );

    expect(jobs).toEqual([
      {
        id: '1',
        inputMime: 'image/png',
        outputMime: 'image/jpeg',
        outputFilename: 'logo.jpg',
        qualityRatio: 0.9,
        needsBackgroundFill: true,
        backgroundColor: '#FFFFFF',
      },
      {
        id: '2',
        inputMime: 'image/jpeg',
        outputMime: 'image/jpeg',
        outputFilename: 'logo-2.jpg',
        qualityRatio: 0.9,
        needsBackgroundFill: false,
        backgroundColor: '#FFFFFF',
      },
    ]);

    expect(() =>
      buildConversionPlan([], {
        targetFormat: 'image/webp',
        quality: 85,
        jpegBackground: '#FFFFFF',
      }),
    ).toThrowError(expect.objectContaining({ code: 'EMPTY_BATCH' }));
  });

  it('supports converting to AVIF and from AVIF to JPEG with background fill', () => {
    const toAvif = buildConversionPlan(
      [{ id: 'a1', name: 'poster.png', mime: 'image/png' }],
      { targetFormat: 'image/avif', quality: 80, jpegBackground: '#FFFFFF' },
    );
    expect(toAvif[0]).toEqual({
      id: 'a1',
      inputMime: 'image/png',
      outputMime: 'image/avif',
      outputFilename: 'poster.avif',
      qualityRatio: 0.8,
      needsBackgroundFill: false,
      backgroundColor: '#FFFFFF',
    });

    const fromAvifToJpg = buildConversionPlan(
      [{ id: 'a2', name: 'hero.avif', mime: 'image/avif' }],
      { targetFormat: 'image/jpeg', quality: 90, jpegBackground: '#000000' },
    );
    expect(fromAvifToJpg[0]).toEqual({
      id: 'a2',
      inputMime: 'image/avif',
      outputMime: 'image/jpeg',
      outputFilename: 'hero.jpg',
      qualityRatio: 0.9,
      needsBackgroundFill: true,
      backgroundColor: '#000000',
    });
  });
});
