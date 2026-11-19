import { describe, expect, it } from 'vitest';
import {
  calculateResizeDimensions,
  clampCropRect,
  computeCenteredCropPreset,
  ResizeCropError,
  resolveRotatedBounds,
} from '@/tools/image/resize-crop/resize-crop.logic';

describe('resize-crop.logic', () => {
  it('calculates resized dimensions in pixels (locked/unlocked) and percent modes', () => {
    // Locked aspect ratio driven by width (1600x900 -> width 800 => 800x450)
    expect(
      calculateResizeDimensions({
        sourceWidth: 1600,
        sourceHeight: 900,
        mode: 'pixels',
        width: 800,
        lockAspectRatio: true,
        changedAxis: 'width',
      }),
    ).toEqual({ width: 800, height: 450 });

    // Locked aspect ratio driven by height (1600x900 -> height 225 => 400x225)
    expect(
      calculateResizeDimensions({
        sourceWidth: 1600,
        sourceHeight: 900,
        mode: 'pixels',
        height: 225,
        lockAspectRatio: true,
        changedAxis: 'height',
      }),
    ).toEqual({ width: 400, height: 225 });

    // Unlocked independent width & height
    expect(
      calculateResizeDimensions({
        sourceWidth: 1600,
        sourceHeight: 900,
        mode: 'pixels',
        width: 500,
        height: 500,
        lockAspectRatio: false,
      }),
    ).toEqual({ width: 500, height: 500 });

    // Percentage scaling (50% of 1600x900 => 800x450)
    expect(
      calculateResizeDimensions({
        sourceWidth: 1600,
        sourceHeight: 900,
        mode: 'percent',
        percent: 50,
      }),
    ).toEqual({ width: 800, height: 450 });

    // Rejects invalid dimensions
    expect(() =>
      calculateResizeDimensions({
        sourceWidth: 1600,
        sourceHeight: 900,
        mode: 'percent',
        percent: 0,
      }),
    ).toThrowError(ResizeCropError);
  });

  it('clamps crop rectangles strictly within source image boundaries', () => {
    // Negative origin and oversized width/height
    expect(
      clampCropRect({ x: -20, y: -10, width: 1200, height: 900 }, 1000, 600),
    ).toEqual({ x: 0, y: 0, width: 1000, height: 600 });

    // Origin near right/bottom edge trims width/height to remaining pixels
    expect(
      clampCropRect({ x: 850, y: 500, width: 300, height: 300 }, 1000, 600),
    ).toEqual({ x: 850, y: 500, width: 150, height: 100 });

    // Zero or negative width/height snaps to minimum 1x1 inside bounds
    expect(
      clampCropRect({ x: 1000, y: 600, width: 0, height: -5 }, 1000, 600),
    ).toEqual({ x: 999, y: 599, width: 1, height: 1 });
  });

  it('computes centered maximum-area crop rectangles for aspect ratio presets', () => {
    expect(computeCenteredCropPreset(1600, 1000, '1:1')).toEqual({
      x: 300,
      y: 0,
      width: 1000,
      height: 1000,
    });
    expect(computeCenteredCropPreset(1600, 1000, '16:9')).toEqual({
      x: 0,
      y: 50,
      width: 1600,
      height: 900,
    });
    expect(computeCenteredCropPreset(800, 1200, '4:3')).toEqual({
      x: 0,
      y: 300,
      width: 800,
      height: 600,
    });
    expect(computeCenteredCropPreset(800, 1200, 'free')).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 1200,
    });
  });

  it('swaps canvas dimensions on 90 and 270 degree rotations and preserves on 0 and 180', () => {
    expect(resolveRotatedBounds(1200, 800, 0)).toEqual({ width: 1200, height: 800, angle: 0 });
    expect(resolveRotatedBounds(1200, 800, 90)).toEqual({ width: 800, height: 1200, angle: 90 });
    expect(resolveRotatedBounds(1200, 800, 180)).toEqual({ width: 1200, height: 800, angle: 180 });
    expect(resolveRotatedBounds(1200, 800, 270)).toEqual({ width: 800, height: 1200, angle: 270 });
    expect(resolveRotatedBounds(1200, 800, -90)).toEqual({ width: 800, height: 1200, angle: 270 });
  });
});
