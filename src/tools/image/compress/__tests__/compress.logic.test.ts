import { describe, expect, it } from 'vitest';
import {
  calculateTargetDimensions,
  qualityToPngColorCount,
  resolveOutputMime,
  shouldKeepOriginal,
} from '@/tools/image/compress/compress.logic';

describe('compress.logic', () => {
  it('scales dimensions down proportionally without upscaling small images', () => {
    expect(calculateTargetDimensions(3840, 2160, 1920)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(calculateTargetDimensions(800, 600, 1920)).toEqual({
      width: 800,
      height: 600,
    });
    expect(calculateTargetDimensions(1200, 900, null)).toEqual({
      width: 1200,
      height: 900,
    });
  });

  it('resolves output mime format properly', () => {
    expect(resolveOutputMime('image/png', 'original')).toBe('image/png');
    expect(resolveOutputMime('image/jpeg', 'image/webp')).toBe('image/webp');
  });

  it('maps quality percentage to PNG quantization palette counts', () => {
    expect(qualityToPngColorCount(100)).toBe(0);
    expect(qualityToPngColorCount(80)).toBe(256);
    expect(qualityToPngColorCount(50)).toBe(96);
    expect(qualityToPngColorCount(15)).toBe(32);
  });

  it('keeps original when same-format unresized output is not smaller', () => {
    expect(
      shouldKeepOriginal({
        inputMime: 'image/webp',
        outputMime: 'image/webp',
        originalSize: 50000,
        compressedSize: 54000,
        resized: false,
      }),
    ).toBe(true);

    expect(
      shouldKeepOriginal({
        inputMime: 'image/png',
        outputMime: 'image/webp',
        originalSize: 50000,
        compressedSize: 54000,
        resized: false,
      }),
    ).toBe(false);
  });
});
