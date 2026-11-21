import { describe, expect, it } from 'vitest';
import { computeLineDiff, computePixelDiff, type RgbaBuffer } from '../compare-pdf.logic';

function makeSolidBuffer(width: number, height: number, r: number, g: number, b: number): RgbaBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

describe('compare-pdf.logic', () => {
  it('returns 0% diff for identical images', () => {
    const a = makeSolidBuffer(4, 4, 240, 240, 240);
    const b = makeSolidBuffer(4, 4, 240, 240, 240);
    const res = computePixelDiff(a, b);
    expect(res.changedPixels).toBe(0);
    expect(res.diffPercent).toBe(0);
    expect(res.totalPixels).toBe(16);
  });

  it('highlights added and removed pixels and computes exact diff percentage', () => {
    const a = makeSolidBuffer(2, 2, 255, 255, 255);
    const b = makeSolidBuffer(2, 2, 255, 255, 255);
    // Pixel (0,0) becomes dark in B (added -> emerald green)
    b.data[0] = 0;
    b.data[1] = 0;
    b.data[2] = 0;

    const res = computePixelDiff(a, b);
    expect(res.changedPixels).toBe(1);
    expect(res.diffPercent).toBeCloseTo(25, 2);
    expect(res.diffData[0]).toBe(16);
    expect(res.diffData[1]).toBe(185);
    expect(res.diffData[2]).toBe(129);
  });

  it('handles mismatched page dimensions gracefully', () => {
    const a = makeSolidBuffer(2, 2, 0, 0, 0);
    const b = makeSolidBuffer(3, 2, 0, 0, 0);
    const res = computePixelDiff(a, b);
    expect(res.width).toBe(3);
    expect(res.height).toBe(2);
    expect(res.changedPixels).toBe(2); // extra column on right
  });

  it('computes accurate line-based LCS text diff', () => {
    const diff = computeLineDiff(
      ['Pasal 1: Ruang Lingkup', 'Harga: Rp 10.000.000', 'Berlaku 12 bulan'],
      ['Pasal 1: Ruang Lingkup', 'Harga: Rp 12.500.000', 'Berlaku 12 bulan', 'Lampiran A'],
    );
    expect(diff.unchangedCount).toBe(2);
    expect(diff.removedCount).toBe(1);
    expect(diff.addedCount).toBe(2);
    expect(diff.lines.some((l) => l.type === 'removed' && l.text.includes('10.000.000'))).toBe(true);
    expect(diff.lines.some((l) => l.type === 'added' && l.text.includes('12.500.000'))).toBe(true);
    expect(diff.lines.some((l) => l.type === 'added' && l.text === 'Lampiran A')).toBe(true);
  });
});
