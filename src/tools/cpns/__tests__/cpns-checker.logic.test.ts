import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  getImageTargetBytes,
  parseImageTargetPreset,
} from '@/tools/image/compress/compress.logic';
import {
  getPdfTargetBytes,
  parsePdfTargetPreset,
} from '@/tools/pdf/compress/plan';
import {
  CPNS_DOC_SLOTS,
  parseCpnsPersistedChecklist,
  validateCpnsBuffer,
} from '../cpns-checker.logic';

const FAKE_JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const FAKE_PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('CPNS target-size presets & SSCASN file checker', () => {
  it('parses image and PDF target presets safely with ~97% safety buffers', () => {
    expect(parseImageTargetPreset('200kb')).toBe('200kb');
    expect(parseImageTargetPreset('500kb')).toBe('500kb');
    expect(parseImageTargetPreset('unknown')).toBe('custom');
    expect(getImageTargetBytes('200kb')).toBeLessThan(200 * 1024);

    expect(parsePdfTargetPreset('500kb')).toBe('500kb');
    expect(parsePdfTargetPreset('800kb')).toBe('800kb');
    expect(parsePdfTargetPreset('1mb')).toBe('1mb');
    expect(parsePdfTargetPreset('1000kb')).toBe('1mb');
    expect(getPdfTargetBytes('1mb')).toBeLessThan(1000 * 1024);
  });

  it('passes a valid JPG under 200 KB and flags oversized or PNG photo uploads', async () => {
    const pasfotoSlot = CPNS_DOC_SLOTS.find((s) => s.id === 'pasfoto')!;

    const ok = await validateCpnsBuffer(pasfotoSlot, {
      name: 'pasfoto-merah.jpg',
      size: 140 * 1024,
      bytes: FAKE_JPEG_HEADER,
    });
    expect(ok.status).toBe('pass');
    expect(ok.detectedFormat).toBe('JPG');

    const tooBig = await validateCpnsBuffer(pasfotoSlot, {
      name: 'pasfoto-hd.jpg',
      size: 420 * 1024,
      bytes: FAKE_JPEG_HEADER,
    });
    expect(tooBig.status).toBe('fail');
    expect(tooBig.fixes.some((f) => f.href === '/compress-image?preset=200kb')).toBe(true);

    const wrongPng = await validateCpnsBuffer(pasfotoSlot, {
      name: 'pasfoto.png',
      size: 120 * 1024,
      bytes: FAKE_PNG_HEADER,
    });
    expect(wrongPng.status).toBe('fail');
    expect(wrongPng.detectedFormat).toBe('PNG');
    expect(wrongPng.fixes.some((f) => f.href === '/convert-image?format=jpg')).toBe(true);
  });

  it('validates real PDF documents and suggests /compress-pdf?preset=1mb when oversized', async () => {
    const ijazahSlot = CPNS_DOC_SLOTS.find((s) => s.id === 'ijazah')!;
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const pdfBytes = await doc.save();

    const ok = await validateCpnsBuffer(ijazahSlot, {
      name: 'ijazah-s1.pdf',
      size: 450 * 1024,
      bytes: pdfBytes,
    });
    expect(ok.status).toBe('pass');
    expect(ok.pageCount).toBe(1);

    const tooBig = await validateCpnsBuffer(ijazahSlot, {
      name: 'ijazah-scan-besar.pdf',
      size: 2400 * 1024,
      bytes: pdfBytes,
    });
    expect(tooBig.status).toBe('fail');
    expect(tooBig.fixes.some((f) => f.href === '/compress-pdf?preset=1mb')).toBe(true);
  });

  it('adds advisory warnings for landscape or low-resolution pasfoto without failing valid JPG', async () => {
    const pasfotoSlot = CPNS_DOC_SLOTS.find((s) => s.id === 'pasfoto')!;

    const portraitOk = await validateCpnsBuffer(pasfotoSlot, {
      name: 'pasfoto-portrait.jpg',
      size: 120 * 1024,
      bytes: FAKE_JPEG_HEADER,
      dimensions: { width: 472, height: 709 },
    });
    expect(portraitOk.status).toBe('pass');
    expect(portraitOk.warnings).toHaveLength(0);
    expect(portraitOk.dimensions).toEqual({ width: 472, height: 709 });

    const landscapeLowRes = await validateCpnsBuffer(pasfotoSlot, {
      name: 'pasfoto-landscape.jpg',
      size: 95 * 1024,
      bytes: FAKE_JPEG_HEADER,
      dimensions: { width: 280, height: 200 },
    });
    expect(landscapeLowRes.status).toBe('pass');
    expect(landscapeLowRes.warnings).toHaveLength(2);
  });

  it('parses persisted checklist metadata safely and ignores corrupt or unknown slots', () => {
    expect(parseCpnsPersistedChecklist(null)).toBeNull();
    expect(parseCpnsPersistedChecklist('{not-json')).toBeNull();

    const parsed = parseCpnsPersistedChecklist(
      JSON.stringify({
        results: {
          pasfoto: {
            status: 'pass',
            fileName: 'pasfoto.jpg',
            fileSizeBytes: 150000,
            maxKbUsed: 200,
            detectedFormat: 'JPG',
            issues: [],
            warnings: [],
            fixes: [],
          },
          unknownSlot: {
            status: 'pass',
            fileName: 'x.jpg',
            fileSizeBytes: 100,
            maxKbUsed: 200,
            detectedFormat: 'JPG',
            issues: [],
            fixes: [],
          },
        },
        maxKbOverrides: { pasfoto: 300, invalidSlot: 500 },
      }),
    );

    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!.results)).toEqual(['pasfoto']);
    expect(parsed!.maxKbOverrides).toEqual({ pasfoto: 300 });
  });
});
