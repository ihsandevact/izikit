import { describe, expect, it } from 'vitest';
import {
  CollageError,
  computeCollageCells,
  computeImageFitRect,
  resolveCanvasSize,
  resolveGridDimensions,
  validateCollageOptions,
  type CollageOptions,
} from '@/tools/image/collage/collage.logic';

function makeOptions(overrides: Partial<CollageOptions> = {}): CollageOptions {
  return {
    layout: 'auto',
    aspectRatio: '1:1',
    longEdgePx: 1800,
    gapPx: 16,
    paddingPx: 24,
    borderRadiusPx: 12,
    backgroundColor: '#FFFFFF',
    fitMode: 'cover',
    outputFormat: 'image/jpeg',
    quality: 90,
    ...overrides,
  };
}

describe('collage.logic', () => {
  it('resolves auto and explicit grid dimensions accurately', () => {
    expect(resolveGridDimensions('auto', 2)).toEqual({ cols: 2, rows: 1 });
    expect(resolveGridDimensions('auto', 3)).toEqual({ cols: 3, rows: 1 });
    expect(resolveGridDimensions('auto', 4)).toEqual({ cols: 2, rows: 2 });
    expect(resolveGridDimensions('auto', 5)).toEqual({ cols: 3, rows: 2 });
    expect(resolveGridDimensions('auto', 8)).toEqual({ cols: 3, rows: 3 });

    expect(resolveGridDimensions('1x2', 4)).toEqual({ cols: 1, rows: 2 });
    expect(resolveGridDimensions('2x3', 6)).toEqual({ cols: 2, rows: 3 });
  });

  it('computes canvas dimensions for square, portrait, landscape, and A4 aspect ratios', () => {
    expect(resolveCanvasSize('1:1', 1200)).toEqual({ width: 1200, height: 1200 });
    expect(resolveCanvasSize('4:5', 1500)).toEqual({ width: 1200, height: 1500 });
    expect(resolveCanvasSize('16:9', 1600)).toEqual({ width: 1600, height: 900 });
    expect(resolveCanvasSize('3:2', 1800)).toEqual({ width: 1800, height: 1200 });
    const a4 = resolveCanvasSize('a4', 2400);
    expect(a4.height).toBe(2400);
    expect(a4.width).toBeCloseTo((2400 * 210) / 297, 0);
  });

  it('computes evenly spaced grid cell rectangles respecting padding and gap', () => {
    const cells = computeCollageCells(1000, 1000, 2, 2, 20, 40);
    // Usable width = 1000 - 80 - 20 = 900 -> 450 per cell
    expect(cells).toHaveLength(4);
    expect(cells[0]).toEqual({ x: 40, y: 40, width: 450, height: 450 });
    expect(cells[1]).toEqual({ x: 510, y: 40, width: 450, height: 450 });
    expect(cells[2]).toEqual({ x: 40, y: 510, width: 450, height: 450 });
    expect(cells[3]).toEqual({ x: 510, y: 510, width: 450, height: 450 });
  });

  it('computes cover crop and contain letterbox rectangles without distortion', () => {
    // Wide 2000x1000 photo into 500x500 square cell -> cover crops left/right to 1000x1000 centered
    const cover = computeImageFitRect(2000, 1000, 10, 20, 500, 500, 'cover');
    expect(cover).toEqual({
      sx: 500,
      sy: 0,
      sw: 1000,
      sh: 1000,
      dx: 10,
      dy: 20,
      dw: 500,
      dh: 500,
    });

    // Wide 2000x1000 photo into 500x500 square cell -> contain letterboxes to 500x250 centered vertically
    const contain = computeImageFitRect(2000, 1000, 10, 20, 500, 500, 'contain');
    expect(contain).toEqual({
      sx: 0,
      sy: 0,
      sw: 2000,
      sh: 1000,
      dx: 10,
      dy: 145,
      dw: 500,
      dh: 250,
    });
  });

  it('validates image count and option boundaries', () => {
    expect(() => validateCollageOptions(makeOptions(), 2)).not.toThrow();

    expect(() => validateCollageOptions(makeOptions(), 1)).toThrowError(
      expect.objectContaining({ code: 'NEED_TWO_IMAGES' }),
    );
    expect(() => validateCollageOptions(makeOptions({ longEdgePx: 100 }), 2)).toThrowError(
      CollageError,
    );
    expect(() => validateCollageOptions(makeOptions({ quality: 150 }), 2)).toThrowError(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    );
  });
});
