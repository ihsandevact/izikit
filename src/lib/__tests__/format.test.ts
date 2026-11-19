import { describe, expect, it } from 'vitest';
import {
  calculateSavings,
  formatBytes,
  replaceFileExtension,
  sanitizeFilename,
} from '@/lib/format';
import {
  detectImageMimeFromBytes,
  hasPdfMagicBytes,
  mimeToExtension,
} from '@/lib/file-validation';
import { getLocalizedPath, getSeoUrls } from '@/i18n';

describe('format utilities', () => {
  it('formats byte values cleanly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1536 * 1024)).toBe('1.50 MB');
  });

  it('calculates savings percentage accurately', () => {
    expect(calculateSavings(1000, 250)).toEqual({
      savedBytes: 750,
      percent: 75,
      isSmaller: true,
    });
    expect(calculateSavings(1000, 1100)).toEqual({
      savedBytes: -100,
      percent: -10,
      isSmaller: false,
    });
  });

  it('sanitizes filenames and enforces required extensions', () => {
    expect(sanitizeFilename('  laporan: 2026 / final? ', 'fallback.pdf', '.pdf')).toBe(
      'laporan-2026-final.pdf',
    );
    expect(sanitizeFilename('   ', 'izikit-merged.pdf', '.pdf')).toBe('izikit-merged.pdf');
    expect(replaceFileExtension('photo.raw.png', 'webp')).toBe('photo.raw.webp');
  });
});

describe('file magic-byte validation', () => {
  it('detects valid PDF header bytes', () => {
    const valid = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const invalid = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(hasPdfMagicBytes(valid)).toBe(true);
    expect(hasPdfMagicBytes(invalid)).toBe(false);
  });

  it('detects JPEG, PNG, and WebP signatures', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    const unknown = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    expect(detectImageMimeFromBytes(jpeg)).toBe('image/jpeg');
    expect(detectImageMimeFromBytes(png)).toBe('image/png');
    expect(detectImageMimeFromBytes(webp)).toBe('image/webp');
    expect(detectImageMimeFromBytes(unknown)).toBeNull();
    expect(mimeToExtension('image/jpeg')).toBe('jpg');
    expect(mimeToExtension('image/webp')).toBe('webp');
  });
});

describe('bilingual URL & SEO hreflang helpers', () => {
  it('generates default ID routes without prefix and EN routes with /en prefix', () => {
    expect(getLocalizedPath('/', 'id')).toBe('/');
    expect(getLocalizedPath('/', 'en')).toBe('/en');
    expect(getLocalizedPath('/merge-pdf', 'id')).toBe('/merge-pdf');
    expect(getLocalizedPath('/merge-pdf', 'en')).toBe('/en/merge-pdf');
  });

  it('builds canonical and alternate URLs properly', () => {
    const seoEn = getSeoUrls('/compress-image', 'en');
    expect(seoEn.canonical).toBe('https://izikit.app/en/compress-image');
    expect(seoEn.alternates.id).toBe('https://izikit.app/compress-image');
    expect(seoEn.alternates.en).toBe('https://izikit.app/en/compress-image');
    expect(seoEn.alternates.xDefault).toBe('https://izikit.app/compress-image');
  });
});
