import { describe, expect, it } from 'vitest';
import {
  applyBrushStrokeToMask,
  composeRgbaWithAlphaMask,
  computeColorKeyAlphaMask,
  detectCornerKeyColor,
  extractAlphaChannelFromRgba,
  validateRemoveBgOptions,
} from '@/tools/image/remove-bg/remove-bg.logic';

function createRgbaPixels(
  width: number,
  height: number,
  fillFn: (x: number, y: number) => [number, number, number, number],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = fillFn(x, y);
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = a;
    }
  }
  return out;
}

describe('remove-bg.logic', () => {
  it('detects the dominant background RGB color from image corners', () => {
    const rgba = createRgbaPixels(4, 4, (x, y) => {
      if (x === 1 && y === 1) return [20, 30, 40, 255];
      return [250, 250, 250, 255];
    });

    expect(detectCornerKeyColor(rgba, 4, 4)).toEqual({ r: 250, g: 250, b: 250 });
  });

  it('computes a color-key alpha mask that removes background pixels and keeps foreground opaque', () => {
    // 4x2 image: left half is white background (255,255,255), right half is dark blue subject (10,20,180)
    const rgba = createRgbaPixels(4, 2, (x) =>
      x < 2 ? [255, 255, 255, 255] : [10, 20, 180, 255],
    );

    const mask = computeColorKeyAlphaMask(rgba, 4, 2, {
      keyColor: { r: 255, g: 255, b: 255 },
      tolerance: 25,
      feather: 10,
    });

    expect(mask).toHaveLength(8);
    expect(mask[0]).toBe(0); // white corner removed
    expect(mask[1]).toBe(0);
    expect(mask[2]).toBe(255); // dark blue subject preserved
    expect(mask[3]).toBe(255);
  });

  it('extracts alpha channel from RGBA buffer and applies circular erase/restore brush strokes', () => {
    const rgba = createRgbaPixels(5, 5, () => [100, 120, 140, 255]);
    const mask = extractAlphaChannelFromRgba(rgba);
    expect(mask.every((a) => a === 255)).toBe(true);

    // Erase brush at center (2, 2) with radius 1.5
    const afterErase = applyBrushStrokeToMask(mask, 5, 5, {
      mode: 'erase',
      centerX: 2,
      centerY: 2,
      radiusPx: 1.5,
    });
    expect(afterErase[2 * 5 + 2]).toBe(0);
    expect(afterErase[0]).toBe(255); // corner untouched

    // Restore brush at center (2, 2) with radius 2
    const afterRestore = applyBrushStrokeToMask(afterErase, 5, 5, {
      mode: 'restore',
      centerX: 2,
      centerY: 2,
      radiusPx: 2,
    });
    expect(afterRestore[2 * 5 + 2]).toBe(255);
  });

  it('composes foreground RGBA with transparent or solid passport background color', () => {
    const rgba = createRgbaPixels(2, 1, (x) =>
      x === 0 ? [255, 255, 255, 255] : [20, 40, 60, 255],
    );
    const mask = new Uint8ClampedArray([0, 255]);

    const transparentOut = composeRgbaWithAlphaMask(rgba, mask, 'transparent');
    expect(transparentOut[3]).toBe(0); // first pixel alpha = 0
    expect(transparentOut[7]).toBe(255); // second pixel alpha = 255

    // Indonesian Red Passport background (#DB1514 -> 219, 21, 20)
    const redPassportOut = composeRgbaWithAlphaMask(rgba, mask, '#DB1514');
    expect(Array.from(redPassportOut.slice(0, 4))).toEqual([219, 21, 20, 255]);
    expect(Array.from(redPassportOut.slice(4, 8))).toEqual([20, 40, 60, 255]);
  });

  it('validates tolerance, feather, and brush radius options', () => {
    expect(() =>
      validateRemoveBgOptions({
        engine: 'color-key',
        tolerance: 25,
        feather: 10,
      }),
    ).not.toThrow();

    expect(() =>
      validateRemoveBgOptions({
        engine: 'color-key',
        tolerance: 150,
        feather: 10,
      }),
    ).toThrow();
  });
});
