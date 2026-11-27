import { describe, expect, it } from 'vitest';
import {
  buildMockupFilename,
  computeMockupLayout,
  DEFAULT_MOCKUP_CONFIG,
  GRADIENT_PRESETS,
  MAX_EXPORT_DIMENSION,
} from '../screenshot-mockup.logic';

describe('screenshot-mockup.logic', () => {
  it('centers screenshot inside fixed 16:9 canvas while preserving aspect ratio', () => {
    const layout = computeMockupLayout(1200, 800, {
      ...DEFAULT_MOCKUP_CONFIG,
      aspectRatio: '16:9',
      frameStyle: 'macos-light',
      padding: 60,
      exportScale: 1,
    });

    expect(layout.canvasWidth).toBe(1600);
    expect(layout.canvasHeight).toBe(900);
    expect(layout.chromeHeight).toBe(36);
    expect(layout.frameHeight).toBe(layout.imageHeight + layout.chromeHeight);
    // Preserves 1.5 aspect ratio (1200/800)
    expect(Math.abs(layout.imageWidth / layout.imageHeight - 1.5)).toBeLessThan(0.02);
    // Centered horizontally and vertically
    expect(Math.abs(layout.frameX - (layout.canvasWidth - layout.frameWidth) / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.frameY - (layout.canvasHeight - layout.frameHeight) / 2)).toBeLessThanOrEqual(1);
  });

  it('computes auto aspect ratio tightly around screenshot plus padding and chrome', () => {
    const layout = computeMockupLayout(1000, 500, {
      ...DEFAULT_MOCKUP_CONFIG,
      aspectRatio: 'auto',
      frameStyle: 'none',
      padding: 50,
      exportScale: 1,
    });

    expect(layout.chromeHeight).toBe(0);
    expect(layout.imageWidth).toBe(1000);
    expect(layout.imageHeight).toBe(500);
    expect(layout.canvasWidth).toBe(1100);
    expect(layout.canvasHeight).toBe(600);
  });

  it('clamps 2x export dimensions safely within MAX_EXPORT_DIMENSION', () => {
    const layout = computeMockupLayout(2400, 1600, {
      ...DEFAULT_MOCKUP_CONFIG,
      aspectRatio: '9:16',
      padding: 40,
      exportScale: 2,
    });

    expect(Math.max(layout.canvasWidth, layout.canvasHeight)).toBeLessThanOrEqual(
      MAX_EXPORT_DIMENSION,
    );
    expect(layout.canvasHeight).toBe(3840);
    expect(layout.canvasWidth).toBe(2160);
  });

  it('exposes at least 8 gradient presets and builds clean export filenames', () => {
    expect(GRADIENT_PRESETS.length).toBeGreaterThanOrEqual(8);
    expect(buildMockupFilename('My Dashboard Shot.PNG', '16:9', 'png')).toBe(
      'mockup-my-dashboard-shot-16x9.png',
    );
    expect(buildMockupFilename('clip.jpg', 'auto', 'webp')).toBe('mockup-clip-auto.webp');
  });
});
