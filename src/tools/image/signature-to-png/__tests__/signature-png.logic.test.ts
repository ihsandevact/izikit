import { describe, expect, it } from 'vitest';
import {
  buildSignaturePngFilename,
  cleanSignatureRgba,
  findOpaqueBoundingBox,
} from '@/tools/image/signature-to-png/signature-png.logic';

describe('signature-png.logic', () => {
  it('removes bright paper pixels while keeping dark ink strokes and recoloring when requested', () => {
    // 2 pixels: pixel 0 is bright paper (240,240,240), pixel 1 is dark pen ink (30,35,40)
    const src = new Uint8ClampedArray([240, 240, 240, 255, 30, 35, 40, 255]);
    const cleaned = cleanSignatureRgba(src, {
      threshold: 190,
      softness: 30,
      inkMode: 'blue',
    });

    // Paper pixel -> transparent
    expect(cleaned[3]).toBe(0);
    // Ink pixel -> opaque + recolored to blue (#1D4ED8 = 29, 78, 216)
    expect(cleaned[4]).toBe(29);
    expect(cleaned[5]).toBe(78);
    expect(cleaned[6]).toBe(216);
    expect(cleaned[7]).toBe(255);
  });

  it('finds tight opaque bounding box with clamped padding and returns null for empty canvas', () => {
    const empty = new Uint8ClampedArray(4 * 4 * 4);
    expect(findOpaqueBoundingBox(empty, 4, 4, 2)).toBeNull();

    // 10x10 image with a single opaque pixel at (4, 5)
    const buf = new Uint8ClampedArray(10 * 10 * 4);
    const idx = (5 * 10 + 4) * 4;
    buf[idx] = 0;
    buf[idx + 1] = 0;
    buf[idx + 2] = 0;
    buf[idx + 3] = 255;

    expect(findOpaqueBoundingBox(buf, 10, 10, 2)).toEqual({
      x: 2,
      y: 3,
      width: 5,
      height: 5,
    });
  });

  it('builds clean transparent PNG filenames', () => {
    expect(buildSignaturePngFilename(null)).toBe('tanda-tangan-transparan.png');
    expect(buildSignaturePngFilename('ttd-kertas.jpg')).toBe('ttd-kertas-transparan.png');
  });
});
