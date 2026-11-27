import { describe, expect, it } from 'vitest';
import {
  applyScanFilterToPixels,
  buildScannerFilename,
  computeScanPagePlacement,
} from '../scanner.logic';

describe('scanner.logic', () => {
  it('enhances paper background to bright white and keeps dark ink crisp in bw-document mode', () => {
    // 10 pixels: 8 grayish paper pixels (190,185,180) and 2 dark ink pixels (35,35,35)
    const pixels = new Uint8ClampedArray(10 * 4);
    for (let i = 0; i < 8; i += 1) {
      pixels[i * 4] = 190;
      pixels[i * 4 + 1] = 185;
      pixels[i * 4 + 2] = 180;
      pixels[i * 4 + 3] = 255;
    }
    for (let i = 8; i < 10; i += 1) {
      pixels[i * 4] = 35;
      pixels[i * 4 + 1] = 35;
      pixels[i * 4 + 2] = 35;
      pixels[i * 4 + 3] = 255;
    }

    applyScanFilterToPixels(pixels, 'bw-document');
    // Paper pixel brightened close to white, ink pixel darkened close to black
    expect(pixels[0]).toBeGreaterThan(230);
    expect(pixels[8 * 4]).toBeLessThan(30);
    expect(pixels[0]).toBe(pixels[1]); // monochrome
    expect(pixels[1]).toBe(pixels[2]);
  });

  it('brightens paper while preserving chromatic hue in magic-color mode', () => {
    // 4 pixels: 3 light grayish paper (200,200,200) and 1 blue stamp (40,80,210)
    const pixels = new Uint8ClampedArray([
      200, 200, 200, 255,
      200, 200, 200, 255,
      200, 200, 200, 255,
      40, 80, 210, 255,
    ]);
    applyScanFilterToPixels(pixels, 'magic-color');
    // Paper becomes brighter white
    expect(pixels[0]).toBeGreaterThanOrEqual(240);
    // Blue channel on stamp stays strongly dominant over red
    expect(pixels[12 + 2]).toBeGreaterThan(pixels[12] + 80);
  });

  it('auto-orients A4 page to landscape for wide images and respects margins', () => {
    const portrait = computeScanPagePlacement(1000, 1414, 'a4', 'small');
    expect(portrait.pageHeight).toBeGreaterThan(portrait.pageWidth);
    expect(portrait.drawX).toBeGreaterThanOrEqual(17.9);

    const landscape = computeScanPagePlacement(1600, 1000, 'a4', 'normal');
    expect(landscape.pageWidth).toBeGreaterThan(landscape.pageHeight);
    expect(landscape.drawW).toBeLessThanOrEqual(landscape.pageWidth - 72 + 0.1);
  });

  it('builds localized scan PDF filenames', () => {
    expect(buildScannerFilename(3, 'id')).toBe('scan-dokumen-3-halaman.pdf');
    expect(buildScannerFilename(1, 'en')).toBe('scanned-document-1-page.pdf');
    expect(buildScannerFilename(4, 'en')).toBe('scanned-document-4-pages.pdf');
  });
});
