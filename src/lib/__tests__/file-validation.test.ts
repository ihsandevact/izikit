import { describe, expect, it } from 'vitest';
import {
  mimeToExtension,
  validateConvertibleImageFiles,
  validateDocxFiles,
  validateHeicFiles,
  validateImageFiles,
  validatePdfFiles,
} from '../file-validation';

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
// ISO BMFF ftyp box: size=20, 'ftyp', major='avif', minor=0, compat='avif'
const AVIF_HEADER = new Uint8Array([
  0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00,
  0x61, 0x76, 0x69, 0x66,
]);
// ISO BMFF ftyp box: size=24, 'ftyp', major='mif1', minor=0, compat='miaf', 'avif'
const AVIF_MIF1_HEADER = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0x00, 0x00, 0x00, 0x00,
  0x6d, 0x69, 0x61, 0x66, 0x61, 0x76, 0x69, 0x66,
]);
// ISO BMFF ftyp box: size=24, 'ftyp', major='heic', minor=0, compat='mif1', 'heic'
const HEIC_HEADER = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
  0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63,
]);
const PDF_HEADER = new TextEncoder().encode('%PDF-1.7\n');
const ZIP_HEADER = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

describe('validateImageFiles', () => {
  const messages = {
    tooLarge: 'Too large:',
    notImage: 'Not image:',
    generic: 'Generic error',
  };

  it('accepts valid images and rejects non-images', async () => {
    const validPng = new File([PNG_HEADER], 'photo.png', { type: 'image/png' });
    const fakeImg = new File([new TextEncoder().encode('hello world 1234')], 'fake.png', {
      type: 'image/png',
    });

    const result = await validateImageFiles([validPng, fakeImg], messages);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].mime).toBe('image/png');
    expect(result.accepted[0].file.name).toBe('photo.png');
    expect(result.accepted[0].id).toContain('photo.png');
    expect(result.errors).toEqual(['Not image: fake.png']);
  });

  it('accepts AVIF images (both direct avif and mif1+avif brands) in validateConvertibleImageFiles', async () => {
    const directAvif = new File([AVIF_HEADER], 'hero.avif', { type: 'image/avif' });
    const mif1Avif = new File([AVIF_MIF1_HEADER], 'banner.avif', { type: 'image/avif' });
    const fakeAvif = new File([new TextEncoder().encode('not an avif file')], 'fake.avif', {
      type: 'image/avif',
    });

    const result = await validateConvertibleImageFiles([directAvif, mif1Avif, fakeAvif], messages);
    expect(result.accepted).toHaveLength(2);
    expect(result.accepted[0].mime).toBe('image/avif');
    expect(result.accepted[1].mime).toBe('image/avif');
    expect(mimeToExtension('image/avif')).toBe('avif');
    expect(result.errors).toEqual(['Not image: fake.avif']);
  });

  it('accepts HEIC images in validateHeicFiles and validateConvertibleImageFiles without misclassifying AVIF', async () => {
    const heicFile = new File([HEIC_HEADER], 'iphone.heic', { type: 'image/heic' });
    const avifFile = new File([AVIF_MIF1_HEADER], 'banner.avif', { type: 'image/avif' });

    const heicOnly = await validateHeicFiles([heicFile, avifFile], messages);
    expect(heicOnly.accepted).toHaveLength(1);
    expect(heicOnly.accepted[0].mime).toBe('image/heic');
    expect(heicOnly.errors).toEqual(['Not image: banner.avif']);

    const convertible = await validateConvertibleImageFiles([heicFile, avifFile], messages);
    expect(convertible.accepted.map((f) => f.mime)).toEqual(['image/heic', 'image/avif']);
  });
});

describe('validatePdfFiles', () => {
  const messages = {
    tooLarge: 'Too large:',
    notPdf: 'Not PDF:',
    generic: 'Corrupt:',
  };

  it('accepts valid PDFs and rejects non-PDF files', async () => {
    const validPdf = new File([PDF_HEADER], 'doc.pdf', { type: 'application/pdf' });
    const fakePdf = new File([new TextEncoder().encode('not a pdf')], 'fake.pdf', {
      type: 'application/pdf',
    });

    const result = await validatePdfFiles([validPdf, fakePdf], messages);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].file.name).toBe('doc.pdf');
    expect(result.errors).toEqual(['Not PDF: fake.pdf']);
  });
});

describe('validateDocxFiles', () => {
  const messages = {
    tooLarge: 'Too large:',
    notDocx: 'Not DOCX:',
    generic: 'Corrupt:',
  };

  it('accepts valid .docx files with PK ZIP magic bytes and rejects non-docx or wrong-extension files', async () => {
    const validDocx = new File([ZIP_HEADER], 'laporan.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const fakeDocx = new File([new TextEncoder().encode('plain text')], 'palsu.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const legacyDoc = new File([ZIP_HEADER], 'lama.doc', {
      type: 'application/msword',
    });

    const result = await validateDocxFiles([validDocx, fakeDocx, legacyDoc], messages);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].file.name).toBe('laporan.docx');
    expect(result.errors).toEqual(['Not DOCX: palsu.docx', 'Not DOCX: lama.doc']);
  });
});
