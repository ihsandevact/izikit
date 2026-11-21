import { describe, expect, it } from 'vitest';
import {
  buildPassportSheetFilename,
  computePassportSheetLayout,
  computePortraitCoverCrop,
  mmToPx,
} from '@/tools/image/passport-grid/passport-grid.logic';

describe('passport-grid.logic', () => {
  it('maximizes passport photo capacity on 4R and A4 papers at 300 DPI', () => {
    const layout4R3x4 = computePassportSheetLayout({ paper: '4r', photo: '3x4' });
    // Landscape 4R (152x102 mm) fits 4x2 = 8 photos of 3x4 cm
    expect(layout4R3x4.maxCopies).toBe(8);
    expect(layout4R3x4.copies).toBe(8);
    expect(layout4R3x4.cells).toHaveLength(8);
    expect(layout4R3x4.paperWidthPx).toBe(mmToPx(152, 300));
    expect(layout4R3x4.paperHeightPx).toBe(mmToPx(102, 300));

    const layout4R4x6 = computePassportSheetLayout({ paper: '4r', photo: '4x6', copies: 3 });
    // 4x6 on 4R fits 2x2 = 4 photos (portrait 102x152 or landscape), clamped to requested 3
    expect(layout4R4x6.maxCopies).toBeGreaterThanOrEqual(4);
    expect(layout4R4x6.copies).toBe(3);
    expect(layout4R4x6.cells).toHaveLength(3);

    const layoutA42x3 = computePassportSheetLayout({ paper: 'a4', photo: '2x3' });
    expect(layoutA42x3.maxCopies).toBeGreaterThanOrEqual(60);
  });

  it('applies top-biased portrait cover crop when source is taller than target', () => {
    const crop = computePortraitCoverCrop(600, 1200, 3 / 4);
    // target height = 600 / 0.75 = 800, excess = 400, top bias 25% -> sy = 100
    expect(crop).toEqual({ sx: 0, sy: 100, sWidth: 600, sHeight: 800 });

    const wideCrop = computePortraitCoverCrop(1200, 800, 3 / 4);
    // target width = 800 * 0.75 = 600, centered -> sx = 300
    expect(wideCrop).toEqual({ sx: 300, sy: 0, sWidth: 600, sHeight: 800 });
  });

  it('builds descriptive output filenames for JPG and PDF', () => {
    expect(buildPassportSheetFilename('pasfoto-merah.png', '3x4', '4r', 'jpg')).toBe(
      'pasfoto-merah-pasfoto-3x4-4r.jpg',
    );
    expect(buildPassportSheetFilename('foto.jpg', '4x6', 'a4', 'pdf')).toBe(
      'foto-pasfoto-4x6-a4.pdf',
    );
  });
});
