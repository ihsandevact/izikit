import { describe, expect, it } from 'vitest';
import {
  buildRedactedFilename,
  normalizeDragRect,
  scaleBoxToPixels,
} from '@/tools/image/blur-redact/blur-redact.logic';

describe('blur-redact.logic', () => {
  it('normalizes drag coordinates regardless of drag direction and ignores tiny clicks', () => {
    const rect = normalizeDragRect(300, 200, 100, 50, 400, 400);
    expect(rect).toEqual({ x: 0.25, y: 0.125, width: 0.5, height: 0.375 });

    const tiny = normalizeDragRect(100, 100, 101, 101, 400, 400);
    expect(tiny).toBeNull();
  });

  it('scales normalized boxes to full-resolution integer pixel coordinates safely', () => {
    const px = scaleBoxToPixels({ x: 0.1, y: 0.25, width: 0.5, height: 0.25 }, 1000, 800);
    expect(px).toEqual({ x: 100, y: 200, width: 500, height: 200 });
  });

  it('builds redacted output filenames with target extension', () => {
    expect(buildRedactedFilename('ktp-scan.jpg', 'image/png')).toBe('ktp-scan-sensor.png');
    expect(buildRedactedFilename('resi.webp', 'image/jpeg')).toBe('resi-sensor.jpg');
  });
});
