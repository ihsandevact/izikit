import { describe, expect, it } from 'vitest';
import {
  buildUniqueWatermarkedNames,
  computeImageWatermarkCenters,
  computeLogoDrawBox,
  computeProportionalFontPx,
  ImageWatermarkError,
  validateImageWatermarkOptions,
  type ImageWatermarkOptions,
} from '@/tools/image/watermark/watermark-image.logic';

function makeOptions(overrides: Partial<ImageWatermarkOptions> = {}): ImageWatermarkOptions {
  return {
    kind: 'text',
    text: '© izikit',
    fontPercent: 6,
    colorHex: '#FFFFFF',
    textShadow: true,
    logoScalePercent: 22,
    opacity: 0.45,
    rotation: -30,
    position: 'bottom-right',
    marginPercent: 5,
    outputFormat: 'original',
    quality: 88,
    ...overrides,
  };
}

describe('watermark-image.logic', () => {
  it('validates text mode, logo mode, opacity, rotation, and quality bounds', () => {
    expect(() => validateImageWatermarkOptions(makeOptions(), false)).not.toThrow();

    expect(() =>
      validateImageWatermarkOptions(makeOptions({ kind: 'text', text: '   ' }), false),
    ).toThrowError(expect.objectContaining({ code: 'EMPTY_TEXT' }));

    expect(() =>
      validateImageWatermarkOptions(makeOptions({ kind: 'logo' }), false),
    ).toThrowError(expect.objectContaining({ code: 'MISSING_LOGO' }));

    expect(() =>
      validateImageWatermarkOptions(makeOptions({ kind: 'logo' }), true),
    ).not.toThrow();

    expect(() =>
      validateImageWatermarkOptions(makeOptions({ opacity: 0 }), false),
    ).toThrowError(ImageWatermarkError);

    expect(() =>
      validateImageWatermarkOptions(makeOptions({ quality: 105 }), false),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_OPTIONS' }));
  });

  it('scales font size and logo dimensions proportionally without overflowing image bounds', () => {
    expect(computeProportionalFontPx(1000, 800, 6)).toBe(60);
    expect(computeProportionalFontPx(200, 200, 3)).toBe(12); // clamped to readable minimum

    const wideLogo = computeLogoDrawBox(1200, 800, 400, 200, 25);
    expect(wideLogo).toEqual({ width: 300, height: 150 });

    // Very tall logo must still fit inside 90% of image height
    const tallLogo = computeLogoDrawBox(1000, 300, 100, 500, 50);
    expect(tallLogo.height).toBeLessThanOrEqual(270);
    expect(tallLogo.width / tallLogo.height).toBeCloseTo(0.2, 2);
  });

  it('computes single anchor centers and multi-point tiled grids inside image bounds', () => {
    const center = computeImageWatermarkCenters({
      imageWidth: 1000,
      imageHeight: 600,
      boxWidth: 200,
      boxHeight: 60,
      position: 'center',
      marginPercent: 5,
    });
    expect(center).toEqual([{ cx: 500, cy: 300 }]);

    const bottomRight = computeImageWatermarkCenters({
      imageWidth: 1000,
      imageHeight: 600,
      boxWidth: 200,
      boxHeight: 60,
      position: 'bottom-right',
      marginPercent: 5,
    });
    expect(bottomRight[0].cx).toBe(1000 - 50 - 100);
    expect(bottomRight[0].cy).toBe(600 - 30 - 30);

    const tiled = computeImageWatermarkCenters({
      imageWidth: 1000,
      imageHeight: 800,
      boxWidth: 180,
      boxHeight: 50,
      position: 'tiled',
      marginPercent: 5,
    });
    expect(tiled.length).toBeGreaterThanOrEqual(4);
  });

  it('builds unique watermarked filenames for batch ZIP exports without collisions', () => {
    const names = buildUniqueWatermarkedNames([
      { name: 'produk.png', inputMime: 'image/png', outputFormat: 'image/webp' },
      { name: 'produk.jpg', inputMime: 'image/jpeg', outputFormat: 'image/webp' },
      { name: 'banner.jpeg', inputMime: 'image/jpeg', outputFormat: 'original' },
    ]);

    expect(names).toEqual([
      'produk-watermarked.webp',
      'produk-watermarked-2.webp',
      'banner-watermarked.jpg',
    ]);
  });
});
