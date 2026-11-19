import { describe, expect, it } from 'vitest';
import { validateDocxFiles, validateImageFiles, validatePdfFiles } from '../file-validation';

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
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
